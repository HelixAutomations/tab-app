const express = require('express');
const sql = require('mssql');
const { randomUUID } = require('crypto');
const { getPool } = require('../utils/db');
const { cacheWrapper } = require('../utils/redisClient');
const { getClioAccessToken, CLIO_API_BASE } = require('../utils/clioAuth');
const { getClioId } = require('../utils/teamLookup');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const {
  ensureHomeJourneyEmailEventsTable,
  recordHomeJourneyEmailEvent,
  invalidateHomeJourneyCache,
} = require('../utils/homeJourneyEmailEvents');

const router = express.Router();

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 120;
const CACHE_TTL_SECONDS = 120;

// ── In-memory phone→name cache (avoids LIKE queries on every request) ──
const phoneNameCache = new Map(); // key = normDigits, value = { data, expiresAt }
const PHONE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

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

function parseScope(value) {
  const parsed = String(value || '').trim().toLowerCase();
  if (parsed === 'all' || parsed === 'user') return parsed;
  return null;
}

function isDevOwner(user, fallbackInitials, fallbackEmail) {
  const initials = String(user?.initials || fallbackInitials || '').trim().toUpperCase();
  const email = String(user?.email || fallbackEmail || '').trim().toLowerCase();
  return initials === 'LZ' || email === 'lz@helix-law.com';
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

function compareJourneyRows(left, right) {
  const timestampDiff = toTimestamp(right?.timestamp) - toTimestamp(left?.timestamp);
  if (timestampDiff !== 0) return timestampDiff;
  return String(right?.id || '').localeCompare(String(left?.id || ''));
}

async function resolvePhoneNames(normDigitsArr) {
  if (!normDigitsArr.length) return {};

  const now = Date.now();
  const cached = {};
  const uncachedDigits = [];

  for (const digits of normDigitsArr) {
    const entry = phoneNameCache.get(digits);
    if (entry && entry.expiresAt > now) {
      if (entry.data) cached[digits] = entry.data;
    } else {
      uncachedDigits.push(digits);
    }
  }

  // All hits — skip DB entirely
  if (uncachedDigits.length === 0) return cached;

  const patterns = uncachedDigits.map((digits) => `%${digits.slice(-7)}%`);

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

  // Populate cache for all queried digits (including misses)
  const expiresAt = Date.now() + PHONE_CACHE_TTL_MS;
  for (const digits of uncachedDigits) {
    phoneNameCache.set(digits, { data: map[digits] || null, expiresAt });
  }
  // Evict stale entries if map grows large
  if (phoneNameCache.size > 500) {
    const cutoff = Date.now();
    for (const [k, v] of phoneNameCache) {
      if (v.expiresAt <= cutoff) phoneNameCache.delete(k);
    }
  }

  return { ...cached, ...map };
}

async function getDubberUserMapRows() {
  const pool = await instrPool();
  const result = await pool.request().query(`
    SELECT display_name, first_name, last_name, matched_team_email
    FROM dbo.dubber_user_map
  `);
  return result.recordset || [];
}

async function fetchRawCallsForScope({ initials, email, showAll, limit }) {
  const pool = await instrPool();
  const request = pool.request().input('limit', sql.Int, limit);
  const filters = [];

  if (!showAll) {
    const normalizedInitials = String(initials || '').trim().toUpperCase();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (normalizedInitials) {
      request.input('initials', sql.NVarChar, normalizedInitials);
      filters.push('r.matched_team_initials = @initials');
    }

    if (normalizedEmail) {
      request.input('email', sql.NVarChar, normalizedEmail);
      filters.push('LOWER(r.matched_team_email) = @email');
    }
  }

  const whereClause = showAll || filters.length === 0
    ? ''
    : `WHERE (${filters.join(' OR ')})`;

  if (!showAll && filters.length === 0) {
    return [];
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

  const phoneNameMap = await resolvePhoneNames([...phonesToResolve].slice(0, 30));

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

  // Always resolve the requesting user's Clio ID and use it as a filter.
  // Unlike calls/notes where "show all" means seeing other people's records,
  // pulling ALL firm Clio activities (no user_id) is prohibitively large and
  // frequently times out. The dev owner still gets their own recent entries.
  const clioId = await getClioId(requestedInitials);
  let accessToken;
  if (showAll) {
    // Service account token has broader read scope
    accessToken = await getClioAccessToken();
  } else {
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
  const maxPages = 2;
  let pageCount = 0;
  const fields = 'id,date,created_at,updated_at,quantity_in_hours,total,price,type,note,matter{id,display_number,description},activity_description{name},user{id,name}';

  while (pageCount < maxPages) {
    pageCount++;
    const params = new URLSearchParams({
      created_since: since.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      fields,
      limit: String(pageSize),
      offset: String(offset),
    });
    if (clioId) params.set('user_id', String(clioId));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
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
        // First page empty → Clio has nothing in range, skip pagination
        if (offset === 0 && data.data.length === 0) break;
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

async function buildSnapshot({ initials, email, showAll, limit, requestId, sources }) {
  const callsOnlyRequest = Array.isArray(sources) && sources.length === 1 && sources[0] === 'calls';
  const minimumSourceLimit = callsOnlyRequest ? Math.max(limit, 20) : 60;
  const sourceLimit = Math.min(Math.max(limit, minimumSourceLimit), 120);
  const warnings = {};
  const includeCalls = !sources || sources.includes('calls');
  const includeNotes = !sources || sources.includes('notes');
  const includeEmails = !sources || sources.includes('emails');
  // Activities disabled in production — local and staging only
  const isProductionSlot = process.env.NODE_ENV === 'production' && (!process.env.WEBSITE_SLOT_NAME || process.env.WEBSITE_SLOT_NAME === 'Production');
  const includeActivities = !isProductionSlot && (!sources || sources.includes('activities'));

  const [rawCalls, notes, emailEvents, userMapRows, activities] = await Promise.all([
    includeCalls
      ? fetchRawCallsForScope({ initials, email, showAll, limit: sourceLimit }).catch((error) => {
        trackException(error, { component: 'HomeJourney', operation: 'FetchCalls', requestId });
        warnings.calls = 'Call data temporarily unavailable';
        return [];
      })
      : [],
    includeNotes
      ? fetchAttendanceNotes({ initials, showAll, limit: sourceLimit }).catch((error) => {
        trackException(error, { component: 'HomeJourney', operation: 'FetchNotes', requestId });
        warnings.notes = 'Attendance notes temporarily unavailable';
        return [];
      })
      : [],
    includeEmails
      ? fetchEmailEvents({ initials, email, showAll, limit: sourceLimit }).catch((error) => {
        trackException(error, { component: 'HomeJourney', operation: 'FetchEmails', requestId });
        warnings.emails = 'Email events temporarily unavailable';
        return [];
      })
      : [],
    includeCalls
      ? getDubberUserMapRows().catch((error) => {
        trackException(error, { component: 'HomeJourney', operation: 'FetchUserMap', requestId });
        return [];
      })
      : [],
    includeActivities
      ? fetchClioActivities({ initials, showAll, limit: Math.min(sourceLimit, 40) }).catch((error) => {
        trackException(error, {
          component: 'HomeJourney',
          operation: 'FetchActivities',
          requestId,
        });
        warnings.activities = 'Clio activities temporarily unavailable';
        return [];
      })
      : [],
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
    warnings: Object.keys(warnings).length > 0 ? warnings : undefined,
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

  const canSeeAll = isDevOwner(req.user, initials, email);
  const requestedScope = parseScope(req.query.scope) || (canSeeAll ? 'all' : 'user');
  const effectiveScope = requestedScope === 'all' && canSeeAll ? 'all' : 'user';
  const showAll = effectiveScope === 'all';
  const sources = req.query.sources
    ? String(req.query.sources).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : null;
  const sourceSuffix = sources ? `:src:${[...sources].sort().join(',')}` : '';
  const cacheKey = `home-journey:${showAll ? 'all' : `${initials}:${email || 'none'}`}:scope:${effectiveScope}:limit:${limit}${sourceSuffix}`;

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
      () => buildSnapshot({ initials, email, showAll, limit, requestId, sources }),
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
      warnings: snapshot.warnings,
      sources: sources || ['calls', 'notes', 'emails', 'activities'],
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