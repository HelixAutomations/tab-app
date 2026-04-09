const express = require('express');
const sql = require('mssql');
const { randomUUID } = require('crypto');
const { getPool } = require('../utils/db');
const { cacheWrapper, deleteCachePattern } = require('../utils/redisClient');
const { getClioAccessToken, CLIO_API_BASE } = require('../utils/clioAuth');
const { getClioId } = require('../utils/teamLookup');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 120;
const CACHE_TTL_SECONDS = 45;

const RECORDING_COLS = `
  r.recording_id,
  r.from_party,
  r.from_label,
  r.to_party,
  r.to_label,
  r.call_type,
  r.duration_seconds,
  r.start_time_utc,
  r.document_sentiment_score,
  r.ai_document_sentiment,
  r.channel,
  r.status,
  r.matched_team_initials,
  r.matched_team_email,
  r.match_strategy,
  r.document_emotion_json
`.trim();

let emailEventsTableReady = false;

function instrPool() {
  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  return getPool(connStr);
}

function corePool() {
  const connStr = process.env.SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('SQL_CONNECTION_STRING not configured');
  return getPool(connStr);
}

function parseLimit(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseSince(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function normDigits(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('44')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

function looksLikePhone(str) {
  if (!str) return false;
  return String(str).replace(/\D/g, '').length >= 7;
}

function buildRecipientSummary(toRecipients, ccRecipients) {
  const recipients = [...toRecipients, ...ccRecipients].filter(Boolean);
  if (recipients.length === 0) return 'No recipients recorded';
  if (recipients.length === 1) return recipients[0];
  if (recipients.length === 2) return `${recipients[0]} and ${recipients[1]}`;
  return `${recipients[0]}, ${recipients[1]} +${recipients.length - 2}`;
}

function parseJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function toTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseScope(value) {
  const parsed = String(value || '').trim().toLowerCase();
  if (parsed === 'all' || parsed === 'user') return parsed;
  return null;
}

function isDevOwnerUser(user, initials, email) {
  const resolvedInitials = String(user?.initials || initials || '').trim().toUpperCase();
  const resolvedEmail = String(user?.email || email || '').trim().toLowerCase();
  return resolvedInitials === 'LZ' || resolvedEmail === 'lz@helix-law.com';
}

const JOURNEY_TYPE_PRIORITY = {
  call: 0,
  'attendance-note': 1,
  'email-sent': 2,
  'clio-activity': 3,
};

function compareJourneyRows(left, right) {
  const timestampDelta = toTimestamp(right.timestamp) - toTimestamp(left.timestamp);
  if (timestampDelta !== 0) return timestampDelta;

  const typeDelta = (JOURNEY_TYPE_PRIORITY[left.type] ?? 99) - (JOURNEY_TYPE_PRIORITY[right.type] ?? 99);
  if (typeDelta !== 0) return typeDelta;

  return String(left.key || '').localeCompare(String(right.key || ''));
}

async function ensureHomeJourneyEmailEventsTable() {
  if (emailEventsTableReady) return true;

  try {
    const pool = await instrPool();
    await pool.request().query(`
      IF OBJECT_ID(N'dbo.HomeJourneyEmailEvents', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.HomeJourneyEmailEvents (
          EventId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
          SentAt DATETIME2(0) NOT NULL CONSTRAINT DF_HomeJourneyEmailEvents_SentAt DEFAULT SYSUTCDATETIME(),
          SenderEmail NVARCHAR(255) NOT NULL,
          SenderInitials NVARCHAR(20) NULL,
          RecipientSummary NVARCHAR(500) NOT NULL,
          ToRecipientsJson NVARCHAR(MAX) NULL,
          CcRecipientsJson NVARCHAR(MAX) NULL,
          BccRecipientsJson NVARCHAR(MAX) NULL,
          Subject NVARCHAR(500) NULL,
          Source NVARCHAR(100) NULL,
          ContextLabel NVARCHAR(200) NULL,
          EnquiryRef NVARCHAR(100) NULL,
          InstructionRef NVARCHAR(100) NULL,
          MatterRef NVARCHAR(100) NULL,
          ClientRequestId NVARCHAR(100) NULL,
          GraphRequestId NVARCHAR(100) NULL,
          MetadataJson NVARCHAR(MAX) NULL
        );

        CREATE INDEX IX_HomeJourneyEmailEvents_SentAt
          ON dbo.HomeJourneyEmailEvents (SentAt DESC);
        CREATE INDEX IX_HomeJourneyEmailEvents_Sender
          ON dbo.HomeJourneyEmailEvents (SenderInitials, SenderEmail, SentAt DESC);
      END
    `);

    emailEventsTableReady = true;
    return true;
  } catch (error) {
    emailEventsTableReady = false;
    throw error;
  }
}

async function invalidateHomeJourneyCache() {
  try {
    await deleteCachePattern('home-journey:*');
  } catch {
    // non-fatal cache invalidation
  }
}

async function recordHomeJourneyEmailEvent(event) {
  await ensureHomeJourneyEmailEventsTable();

  const eventId = event.eventId || randomUUID();
  const sentAt = event.sentAt || new Date().toISOString();
  const toRecipients = Array.isArray(event.toRecipients) ? event.toRecipients : [];
  const ccRecipients = Array.isArray(event.ccRecipients) ? event.ccRecipients : [];
  const bccRecipients = Array.isArray(event.bccRecipients) ? event.bccRecipients : [];
  const metadataJson = event.metadata ? JSON.stringify(event.metadata) : null;
  const recipientSummary = event.recipientSummary || buildRecipientSummary(toRecipients, ccRecipients);

  const pool = await instrPool();
  await pool.request()
    .input('EventId', sql.UniqueIdentifier, eventId)
    .input('SentAt', sql.DateTime2, new Date(sentAt))
    .input('SenderEmail', sql.NVarChar, String(event.senderEmail || '').trim().toLowerCase())
    .input('SenderInitials', sql.NVarChar, event.senderInitials || null)
    .input('RecipientSummary', sql.NVarChar, recipientSummary)
    .input('ToRecipientsJson', sql.NVarChar, JSON.stringify(toRecipients))
    .input('CcRecipientsJson', sql.NVarChar, JSON.stringify(ccRecipients))
    .input('BccRecipientsJson', sql.NVarChar, JSON.stringify(bccRecipients))
    .input('Subject', sql.NVarChar, event.subject || null)
    .input('Source', sql.NVarChar, event.source || null)
    .input('ContextLabel', sql.NVarChar, event.contextLabel || null)
    .input('EnquiryRef', sql.NVarChar, event.enquiryRef || null)
    .input('InstructionRef', sql.NVarChar, event.instructionRef || null)
    .input('MatterRef', sql.NVarChar, event.matterRef || null)
    .input('ClientRequestId', sql.NVarChar, event.clientRequestId || null)
    .input('GraphRequestId', sql.NVarChar, event.graphRequestId || null)
    .input('MetadataJson', sql.NVarChar, metadataJson)
    .query(`
      INSERT INTO dbo.HomeJourneyEmailEvents (
        EventId,
        SentAt,
        SenderEmail,
        SenderInitials,
        RecipientSummary,
        ToRecipientsJson,
        CcRecipientsJson,
        BccRecipientsJson,
        Subject,
        Source,
        ContextLabel,
        EnquiryRef,
        InstructionRef,
        MatterRef,
        ClientRequestId,
        GraphRequestId,
        MetadataJson
      )
      VALUES (
        @EventId,
        @SentAt,
        @SenderEmail,
        @SenderInitials,
        @RecipientSummary,
        @ToRecipientsJson,
        @CcRecipientsJson,
        @BccRecipientsJson,
        @Subject,
        @Source,
        @ContextLabel,
        @EnquiryRef,
        @InstructionRef,
        @MatterRef,
        @ClientRequestId,
        @GraphRequestId,
        @MetadataJson
      )
    `);

  await invalidateHomeJourneyCache();
  return eventId;
}

async function resolvePhoneNames(normDigitsArr) {
  if (!normDigitsArr.length) return {};

  const patterns = normDigitsArr.map((digits) => `%${digits.slice(-7)}%`);

  const [coreResults, instrEnqResults, instrResults] = await Promise.all([
    (async () => {
      try {
        const pool = await corePool();
        const request = pool.request();
        const orClauses = [];
        patterns.forEach((pattern, index) => {
          const param = `p${index}`;
          request.input(param, sql.NVarChar, pattern);
          orClauses.push(`REPLACE(REPLACE(REPLACE(Phone_Number, ' ', ''), '+', ''), '-', '') LIKE @${param}`);
        });

        const result = await request.query(`
          SELECT ID, First_Name, Last_Name, Phone_Number, Area_of_Work
          FROM enquiries
          WHERE ${orClauses.join(' OR ')}
        `);

        return result.recordset.map((row) => ({
          norm: normDigits(row.Phone_Number),
          name: [row.First_Name, row.Last_Name].filter(Boolean).join(' '),
          source: 'enquiry',
          ref: row.ID ? String(row.ID) : null,
          areaOfWork: row.Area_of_Work || null,
        }));
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        const pool = await instrPool();
        const request = pool.request();
        const orClauses = [];
        patterns.forEach((pattern, index) => {
          const param = `ip${index}`;
          request.input(param, sql.NVarChar, pattern);
          orClauses.push(`REPLACE(REPLACE(REPLACE(phone, ' ', ''), '+', ''), '-', '') LIKE @${param}`);
        });

        const result = await request.query(`
          SELECT id, first AS First_Name, last AS Last_Name, phone, aow
          FROM dbo.enquiries
          WHERE ${orClauses.join(' OR ')}
        `);

        return result.recordset.map((row) => ({
          norm: normDigits(row.phone),
          name: [row.First_Name, row.Last_Name].filter(Boolean).join(' '),
          source: 'enquiry-v2',
          ref: row.id ? String(row.id) : null,
          areaOfWork: row.aow || null,
        }));
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        const pool = await instrPool();
        const request = pool.request();
        const orClauses = [];
        patterns.forEach((pattern, index) => {
          const param = `xp${index}`;
          request.input(param, sql.NVarChar, pattern);
          orClauses.push(`REPLACE(REPLACE(REPLACE(Phone, ' ', ''), '+', ''), '-', '') LIKE @${param}`);
        });

        const result = await request.query(`
          SELECT InstructionRef, FirstName, LastName, Phone
          FROM Instructions
          WHERE ${orClauses.join(' OR ')}
        `);

        return result.recordset.map((row) => ({
          norm: normDigits(row.Phone),
          name: [row.FirstName, row.LastName].filter(Boolean).join(' '),
          source: 'instructions',
          ref: row.InstructionRef || null,
          areaOfWork: null,
        }));
      } catch {
        return [];
      }
    })(),
  ]);

  const map = {};
  for (const row of instrResults) {
    if (row.name && row.norm) map[row.norm] = { name: row.name, source: row.source, ref: row.ref, areaOfWork: row.areaOfWork };
  }
  for (const row of instrEnqResults) {
    if (row.name && row.norm) map[row.norm] = { name: row.name, source: row.source, ref: row.ref, areaOfWork: row.areaOfWork };
  }
  for (const row of coreResults) {
    if (row.name && row.norm) map[row.norm] = { name: row.name, source: row.source, ref: row.ref, areaOfWork: row.areaOfWork };
  }

  return map;
}

async function getDubberUserMapRows() {
  const pool = await instrPool();
  const result = await pool.request().query(`
    SELECT display_name, first_name, last_name, matched_team_email
    FROM dbo.dubber_user_map
  `);
  return result.recordset || [];
}

async function fetchRawCallsForScope({ initials, showAll, limit }) {
  const pool = await instrPool();
  const request = pool.request().input('limit', sql.Int, limit);
  const whereClause = showAll ? '' : 'WHERE r.matched_team_initials = @initials';
  if (!showAll) {
    request.input('initials', sql.NVarChar, initials);
  }

  const result = await request.query(`
    SELECT TOP (@limit) ${RECORDING_COLS}
    FROM dbo.dubber_recordings r
    ${whereClause}
    ORDER BY r.start_time_utc DESC
  `);

  return result.recordset || [];
}

async function fetchRawCallsByIds(recordingIds) {
  if (!recordingIds.length) return [];
  const pool = await instrPool();
  const request = pool.request();
  const params = [];
  recordingIds.slice(0, 80).forEach((recordingId, index) => {
    const param = `rid${index}`;
    request.input(param, sql.NVarChar, recordingId);
    params.push(`@${param}`);
  });

  const result = await request.query(`
    SELECT ${RECORDING_COLS}
    FROM dbo.dubber_recordings r
    WHERE r.recording_id IN (${params.join(', ')})
  `);

  return result.recordset || [];
}

async function enrichRecordings(recordings, userMapRows) {
  if (!recordings.length) return [];

  const teamNames = new Set();
  for (const row of userMapRows) {
    if (row.display_name) teamNames.add(String(row.display_name).toLowerCase());
    if (row.first_name && row.last_name) teamNames.add(`${row.first_name} ${row.last_name}`.toLowerCase());
    if (row.matched_team_email) teamNames.add(String(row.matched_team_email).toLowerCase());
  }

  const recordingsWithInternalFlag = recordings.map((row) => {
    const fromStr = String(row.from_label || row.from_party || '').toLowerCase();
    const toStr = String(row.to_label || row.to_party || '').toLowerCase();
    return {
      ...row,
      is_internal: teamNames.has(fromStr) && teamNames.has(toStr),
    };
  });

  const phonesToResolve = new Set();
  for (const row of recordingsWithInternalFlag) {
    const isInbound = row.call_type === 'inbound';
    const partyField = isInbound ? 'from' : 'to';
    const label = row[`${partyField}_label`];
    const party = row[`${partyField}_party`];
    const phoneSource = looksLikePhone(label) ? label : (!label && looksLikePhone(party) ? party : null);
    if (phoneSource) phonesToResolve.add(normDigits(phoneSource));
  }

  const phoneNameMap = await resolvePhoneNames([...phonesToResolve]);

  return recordingsWithInternalFlag.map((row) => {
    const isInbound = row.call_type === 'inbound';
    const partyField = isInbound ? 'from' : 'to';
    const label = row[`${partyField}_label`];
    const party = row[`${partyField}_party`];
    const phoneSource = looksLikePhone(label) ? label : (!label && looksLikePhone(party) ? party : null);

    if (!phoneSource) return row;

    const match = phoneNameMap[normDigits(phoneSource)];
    if (!match) return row;

    return {
      ...row,
      resolved_name: match.name,
      resolved_source: match.source,
      resolved_ref: match.ref || null,
      resolved_area: match.areaOfWork || null,
    };
  });
}

async function fetchAttendanceNotes({ initials, showAll, limit }) {
  const pool = await instrPool();
  const request = pool.request().input('limit', sql.Int, limit);
  const whereClause = showAll ? '1=1' : 'n.saved_by = @initials';
  if (!showAll) {
    request.input('initials', sql.NVarChar, initials);
  }

  const result = await request.query(`
    SELECT TOP (@limit)
      n.id,
      n.recording_id,
      n.matter_ref,
      n.matter_id,
      n.instruction_ref,
      n.saved_by,
      n.saved_at,
      n.call_date,
      n.call_duration_seconds,
      n.parties_from,
      n.parties_to,
      n.summary,
      n.topics_json,
      n.action_items_json,
      n.blob_name,
      n.uploaded_nd,
      n.nd_doc_id,
      n.nd_file_name
    FROM dbo.dubber_attendance_notes n
    WHERE ${whereClause}
    ORDER BY n.saved_at DESC
  `);

  return result.recordset || [];
}

async function fetchEmailEvents({ initials, email, showAll, limit }) {
  await ensureHomeJourneyEmailEventsTable();

  const pool = await instrPool();
  const request = pool.request().input('limit', sql.Int, limit);
  const whereClause = showAll
    ? '1=1'
    : '(LOWER(SenderEmail) = @email OR UPPER(SenderInitials) = @initials)';

  if (!showAll) {
    request.input('email', sql.NVarChar, String(email || '').trim().toLowerCase());
    request.input('initials', sql.NVarChar, String(initials || '').trim().toUpperCase());
  }

  const result = await request.query(`
    SELECT TOP (@limit)
      EventId,
      SentAt,
      SenderEmail,
      SenderInitials,
      RecipientSummary,
      ToRecipientsJson,
      CcRecipientsJson,
      BccRecipientsJson,
      Subject,
      Source,
      ContextLabel,
      EnquiryRef,
      InstructionRef,
      MatterRef,
      ClientRequestId,
      GraphRequestId,
      MetadataJson
    FROM dbo.HomeJourneyEmailEvents
    WHERE ${whereClause}
    ORDER BY SentAt DESC
  `);

  return result.recordset || [];
}

async function fetchClioActivities({ initials, showAll, limit }) {
  const requestedInitials = String(initials || '').trim().toUpperCase();
  if (!requestedInitials) return [];

  let accessToken;
  let clioId = null;
  if (showAll) {
    accessToken = await getClioAccessToken();
  } else {
    clioId = await getClioId(requestedInitials);
    if (!clioId) return [];
    accessToken = await getClioAccessToken(requestedInitials);
  }

  if (!accessToken) return [];

  const since = new Date();
  since.setDate(since.getDate() - 7);
  since.setHours(0, 0, 0, 0);

  const activities = [];
  let offset = 0;
  const pageSize = 200;
  const fields = 'id,date,created_at,updated_at,quantity_in_hours,total,price,type,note,matter{id,display_number,description},activity_description{name},user{id,name}';

  while (true) {
    const params = new URLSearchParams({
      created_since: since.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      fields,
      limit: String(pageSize),
      offset: String(offset),
    });
    if (clioId) params.set('user_id', String(clioId));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${CLIO_API_BASE}/activities.json?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`Clio API ${response.status}`);

      const data = await response.json();
      if (Array.isArray(data.data)) {
        const remaining = limit - activities.length;
        if (remaining > 0) activities.push(...data.data.slice(0, remaining));
      }
      if (activities.length >= limit) break;
      if (!data.meta?.paging?.next || data.data.length < pageSize) break;
      offset += pageSize;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  return activities;
}

function uniqueCallsFromItems(items) {
  const map = new Map();
  for (const item of items) {
    if (item.type === 'call') {
      map.set(item.call.recording_id, item.call);
    }
    if (item.type === 'attendance-note' && item.linkedCall) {
      map.set(item.linkedCall.recording_id, item.linkedCall);
    }
  }
  return map;
}

async function buildSnapshot({ initials, email, showAll, limit, requestId }) {
  const sourceLimit = Math.min(Math.max(limit, 60), 120);

  const [rawCalls, notes, emailEvents, userMapRows, activities] = await Promise.all([
    fetchRawCallsForScope({ initials, showAll, limit: sourceLimit }),
    fetchAttendanceNotes({ initials, showAll, limit: sourceLimit }),
    fetchEmailEvents({ initials, email, showAll, limit: sourceLimit }),
    getDubberUserMapRows(),
    fetchClioActivities({ initials, showAll, limit: Math.min(sourceLimit, 40) }).catch((error) => {
      trackException(error, {
        component: 'HomeJourney',
        operation: 'FetchActivities',
        requestId,
      });
      return [];
    }),
  ]);

  const missingRecordingIds = [...new Set(
    notes
      .map((note) => note.recording_id)
      .filter((recordingId) => recordingId && !rawCalls.some((call) => call.recording_id === recordingId)),
  )];

  const missingCalls = await fetchRawCallsByIds(missingRecordingIds);
  const enrichedCalls = await enrichRecordings([...rawCalls, ...missingCalls], userMapRows);
  const callsById = new Map(enrichedCalls.map((call) => [call.recording_id, call]));

  const items = [];

  for (const call of enrichedCalls) {
    items.push({
      key: `call-${call.recording_id}`,
      type: 'call',
      timestamp: call.start_time_utc,
      call,
    });
  }

  for (const note of notes) {
    items.push({
      key: `note-${note.id}`,
      type: 'attendance-note',
      timestamp: callsById.get(note.recording_id)?.start_time_utc || note.call_date || note.saved_at,
      note: {
        ...note,
        topics: parseJsonArray(note.topics_json),
        actionItems: parseJsonArray(note.action_items_json),
      },
      linkedCall: callsById.get(note.recording_id) || null,
    });
  }

  for (const activity of activities) {
    const activityTimestamp = activity.created_at || activity.updated_at || activity.date;
    items.push({
      key: `activity-${activity.id}`,
      type: 'clio-activity',
      timestamp: activityTimestamp,
      activity: {
        ...activity,
        event_timestamp: activityTimestamp,
      },
    });
  }

  for (const row of emailEvents) {
    items.push({
      key: `email-${row.EventId}`,
      type: 'email-sent',
      timestamp: row.SentAt,
      email: {
        eventId: row.EventId,
        sentAt: row.SentAt,
        senderEmail: row.SenderEmail,
        senderInitials: row.SenderInitials,
        recipientSummary: row.RecipientSummary,
        toRecipients: parseJsonArray(row.ToRecipientsJson),
        ccRecipients: parseJsonArray(row.CcRecipientsJson),
        bccRecipients: parseJsonArray(row.BccRecipientsJson),
        subject: row.Subject,
        source: row.Source,
        contextLabel: row.ContextLabel,
        enquiryRef: row.EnquiryRef,
        instructionRef: row.InstructionRef,
        matterRef: row.MatterRef,
        graphRequestId: row.GraphRequestId,
      },
    });
  }

  items.sort(compareJourneyRows);

  const latestTimestamp = items.length ? toTimestamp(items[0].timestamp) : 0;

  return {
    generatedAt: new Date().toISOString(),
    latestTimestamp,
    scope: showAll ? 'all' : 'user',
    counts: {
      all: items.length,
      calls: [...uniqueCallsFromItems(items).values()].length,
      notes: notes.length,
      activities: activities.length,
      emails: emailEvents.length,
    },
    items: items.slice(0, limit),
  };
}

router.get('/', async (req, res) => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const initials = String(req.user?.initials || req.query.initials || '').trim().toUpperCase();
  const email = String(req.user?.email || req.query.email || '').trim().toLowerCase();
  const limit = parseLimit(req.query.limit);
  const since = parseSince(req.query.since);

  if (!initials && !email) {
    return res.status(400).json({ error: 'Missing initials or email' });
  }

  const canSeeAll = isDevOwnerUser(req.user, initials, email);
  const requestedScope = parseScope(req.query.scope) || (canSeeAll ? 'all' : 'user');
  const effectiveScope = requestedScope === 'all' && canSeeAll ? 'all' : 'user';
  const showAll = effectiveScope === 'all';
  const cacheKey = `home-journey:${showAll ? 'all' : `${initials}:${email || 'none'}`}:scope:${effectiveScope}:limit:${limit}`;

  trackEvent('HomeJourney.Fetch.Started', {
    operation: 'snapshot',
    requestId,
    initials,
    hasEmail: String(Boolean(email)),
    scope: effectiveScope,
    requestedScope,
    effectiveScope,
    canSeeAll: String(canSeeAll),
    limit: String(limit),
    hasSince: String(Boolean(since)),
  });

  try {
    const snapshot = await cacheWrapper(
      cacheKey,
      () => buildSnapshot({ initials, email, showAll, limit, requestId }),
      CACHE_TTL_SECONDS,
    );

    const filteredItems = since
      ? snapshot.items.filter((item) => toTimestamp(item.timestamp) > since)
      : snapshot.items;

    const durationMs = Date.now() - startedAt;
    trackEvent('HomeJourney.Fetch.Completed', {
      operation: 'snapshot',
      requestId,
      scope: snapshot.scope,
      requestedScope,
      effectiveScope,
      limit: String(limit),
      since: since ? String(since) : '',
      itemCount: String(filteredItems.length),
      totalCount: String(snapshot.counts.all),
      durationMs: String(durationMs),
    });
    trackMetric('HomeJourney.Fetch.Duration', durationMs, {
      operation: 'snapshot',
      scope: snapshot.scope,
    });

    return res.json({
      generatedAt: snapshot.generatedAt,
      latestTimestamp: snapshot.latestTimestamp,
      scope: snapshot.scope,
      counts: snapshot.counts,
      cachedWindowSeconds: CACHE_TTL_SECONDS,
      items: filteredItems,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const err = error instanceof Error ? error : new Error(String(error));
    trackException(err, {
      component: 'HomeJourney',
      operation: 'snapshot',
      requestId,
      phase: 'route',
    });
    trackEvent('HomeJourney.Fetch.Failed', {
      operation: 'snapshot',
      requestId,
      error: err.message,
      durationMs: String(durationMs),
    });
    trackMetric('HomeJourney.Fetch.Duration', durationMs, {
      operation: 'snapshot',
      status: 'failed',
    });
    return res.status(500).json({ error: 'Failed to load home journey', detail: err.message });
  }
});

module.exports = router;
module.exports.ensureHomeJourneyEmailEventsTable = ensureHomeJourneyEmailEventsTable;
module.exports.recordHomeJourneyEmailEvent = recordHomeJourneyEmailEvent;
module.exports.invalidateHomeJourneyCache = invalidateHomeJourneyCache;