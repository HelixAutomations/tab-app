'use strict';

const crypto = require('crypto');
const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { getSecret } = require('../utils/getSecret');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

const STREAMS = [
  { streamKey: 'commercial', label: 'Commercial', isSendable: true, sortOrder: 10, glyph: 'Commercial' },
  { streamKey: 'construction', label: 'Construction', isSendable: true, sortOrder: 20, glyph: 'Construction' },
  { streamKey: 'property', label: 'Property', isSendable: true, sortOrder: 30, glyph: 'Property' },
  { streamKey: 'employment', label: 'Employment', isSendable: true, sortOrder: 40, glyph: 'Employment' },
  { streamKey: 'other', label: 'Other', isSendable: false, sortOrder: 90, glyph: 'Other/Unsure' },
];
const STREAM_KEYS = new Set(STREAMS.map((stream) => stream.streamKey));
const LIVE_STREAM_KEYS = new Set(STREAMS.filter((stream) => stream.isSendable).map((stream) => stream.streamKey));
const EMAIL_SENDGRID_ALLOWED_SENDERS = new Set([
  'automations@helix-law.com',
  'team@helix-law.com',
  'lz@helix-law.com',
]);
const EMAIL_SENDGRID_SECRET_NAMES = [
  'sendgrid-helix-email',
  'sendgrid-api-key',
  'SendGridApiKey',
];
const TAG_BLOCK_PATTERN = /\b(do\s*not\s*(send|email|market)|unsubscribe|unsubscribed|opt[\s-]*out|no\s*(email|marketing)|suppress|suppression|gdpr|privacy|spam|complaint|bounce|invalid\s*email)\b/i;
const DEMO_SOURCE_ENQUIRY_ID = 'DEMO-ENQ-0003';
const DEMO_CAMPAIGN_KEY = 'demo-marketing-email-setup';
let cachedSendGridApiKey = null;

const SOURCE_COLUMN_CANDIDATES = {
  id: ['id', 'ID'],
  acid: ['acid', 'ACID', 'ActiveCampaignId', 'activeCampaignId', 'active_campaign_id'],
  email: ['email', 'Email', 'Email_Address', 'email_address'],
  areaOfWork: ['aow', 'AOW', 'Area_of_Work', 'area_of_work', 'AreaOfWork', 'areaOfWork', 'Area'],
  tags: ['tags', 'Tags', 'tag', 'Tag'],
  datetime: ['touchpoint_date', 'Touchpoint_Date', 'datetime', 'DateTime', 'date_time', 'Date_Created', 'created_at', 'CreatedAt'],
};

function trim(value) {
  return String(value ?? '').trim();
}

function nullable(value, maxLength = 0) {
  const next = trim(value);
  if (!next) return null;
  return maxLength > 0 ? next.slice(0, maxLength) : next;
}

function safeColumnRef(columnName) {
  return `[${String(columnName || '').replace(/]/g, ']]')}]`;
}

function pickColumn(columns, candidates) {
  const byLower = new Map(columns.map((name) => [String(name).toLowerCase(), name]));
  for (const candidate of candidates) {
    const match = byLower.get(String(candidate).toLowerCase());
    if (match) return match;
  }
  return null;
}

function trimSqlTextExpr(columnName, length = 320) {
  return `NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(${length}), e.${safeColumnRef(columnName)}))), '')`;
}

function streamKeyCaseSql(areaSqlExpr) {
  const areaLower = `LOWER(COALESCE(${areaSqlExpr}, N''))`;
  return `CASE
    WHEN ${areaLower} LIKE N'%commercial%' OR ${areaLower} LIKE N'%corporate%' OR ${areaLower} LIKE N'%company%' OR ${areaLower} LIKE N'%business%' OR ${areaLower} LIKE N'%contract%' OR ${areaLower} LIKE N'%shareholder%' OR ${areaLower} LIKE N'%debt%' OR ${areaLower} LIKE N'%insolvency%' THEN N'commercial'
    WHEN ${areaLower} LIKE N'%construction%' OR ${areaLower} LIKE N'%builder%' OR ${areaLower} LIKE N'%building%' OR ${areaLower} LIKE N'%architect%' OR ${areaLower} LIKE N'%adjudication%' THEN N'construction'
    WHEN ${areaLower} LIKE N'%property%' OR ${areaLower} LIKE N'%convey%' OR ${areaLower} LIKE N'%real estate%' OR ${areaLower} LIKE N'%lease%' OR ${areaLower} LIKE N'%landlord%' OR ${areaLower} LIKE N'%tenant%' OR ${areaLower} LIKE N'%boundary%' OR ${areaLower} LIKE N'%development%' THEN N'property'
    WHEN ${areaLower} LIKE N'%employment%' OR ${areaLower} LIKE N'%employee%' OR ${areaLower} LIKE N'%employer%' OR ${areaLower} LIKE N'%dismissal%' OR ${areaLower} LIKE N'%redundancy%' OR ${areaLower} LIKE N'%tribunal%' THEN N'employment'
    ELSE N'other'
  END`;
}

function getActor(req) {
  return trim(req.user?.initials || req.headers?.['x-helix-initials'] || req.user?.email || req.headers?.['x-user-email'] || 'api').slice(0, 160);
}

function isTruthyFlag(value) {
  return value === true || ['1', 'true', 'yes', 'on'].includes(trim(value).toLowerCase());
}

function isDemoRequest(req) {
  return isTruthyFlag(req.query?.demo || req.query?.demoMode || req.body?.demo || req.body?.demoMode);
}

function deriveProjectDataConnectionString() {
  const explicit = trim(
    process.env.PROJECTS_SQL_CONNECTION_STRING
    || process.env.PROJECT_SQL_CONNECTION_STRING
    || process.env.TASKING_SQL_CONNECTION_STRING
    || process.env.SQL_PROJECT_CONNECTION_STRING
  );
  if (explicit) return explicit;

  const core = trim(process.env.SQL_CONNECTION_STRING);
  if (!core) throw new Error('Helix Projects database connection string is not configured');
  const database = trim(process.env.PROJECT_DATA_SQL_DATABASE || process.env.PROJECTS_SQL_DATABASE || 'helix-project-data');
  if (/Initial Catalog=/i.test(core)) return core.replace(/Initial Catalog=[^;]+/i, `Initial Catalog=${database}`);
  if (/Database=/i.test(core)) return core.replace(/Database=[^;]+/i, `Database=${database}`);
  throw new Error('Unable to derive Helix Projects database connection string from SQL_CONNECTION_STRING');
}

function getInstructionsConnectionString() {
  const conn = trim(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
  if (!conn) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING is not configured');
  return conn;
}

function hashEmail(email) {
  const value = trim(email).toLowerCase();
  if (!value) return null;
  return crypto.createHash('sha256').update(value).digest('hex');
}

function emailDomain(email) {
  const value = trim(email).toLowerCase();
  const atIndex = value.lastIndexOf('@');
  return atIndex > 0 ? value.slice(atIndex + 1, atIndex + 161) : null;
}

function isUsableEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trim(email));
}

function splitTags(value) {
  return trim(value)
    .split(/[;,|\r\n]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 80);
}

function extractRank(tags) {
  for (const tag of tags) {
    if (/^[0-7]$/.test(tag)) return Number(tag);
  }
  return null;
}

function classifyStream(areaOfWork) {
  const value = trim(areaOfWork).toLowerCase();
  if (/commercial|corporate|company|business|contract|shareholder|debt|insolvency/.test(value)) return 'commercial';
  if (/construction|builder|building|architect|adjudication/.test(value)) return 'construction';
  if (/property|convey|real estate|lease|landlord|tenant|boundary|development/.test(value)) return 'property';
  if (/employment|employee|employer|dismissal|redundancy|tribunal/.test(value)) return 'employment';
  return 'other';
}

function qualifyMember({ streamKey, acid, email, rank, tags, client }) {
  if (!isUsableEmail(email)) return { status: 'missing_email', reason: 'Missing or invalid email', sendable: false };
  if (!acid) return { status: 'missing_acid', reason: 'Missing ACID campaign key', sendable: false };
  if (tags.some((tag) => TAG_BLOCK_PATTERN.test(tag))) return { status: 'blocked', reason: 'Blocking tag present', sendable: false };
  if (!LIVE_STREAM_KEYS.has(streamKey)) return { status: 'inspect', reason: 'Inspection stream only', sendable: false };
  // Rank refines a campaign segment (rank_min/rank_max); it is not a sendability gate.
  const reason = client
    ? 'Qualified (client; exclusion is campaign-controlled)'
    : rank == null
      ? 'Qualified (unranked)'
      : 'Qualified';
  return { status: 'qualified', reason, sendable: true };
}

function qualifyStoredMember({ streamKey, acid, emailHash, emailDomain, rank, tags, client }) {
  if (!emailHash || !emailDomain) return { status: 'missing_email', reason: 'Missing or invalid email hash/domain', sendable: false };
  if (!acid) return { status: 'missing_acid', reason: 'Missing ACID campaign key', sendable: false };
  if ((tags || []).some((tag) => TAG_BLOCK_PATTERN.test(tag))) return { status: 'blocked', reason: 'Blocking tag present', sendable: false };
  if (!LIVE_STREAM_KEYS.has(streamKey)) return { status: 'inspect', reason: 'Inspection stream only', sendable: false };
  const reason = client
    ? 'Qualified (client; exclusion is campaign-controlled)'
    : rank == null
      ? 'Qualified (unranked)'
      : 'Qualified';
  return { status: 'qualified', reason, sendable: true };
}

function normaliseStreamKey(value, { allowOther = true } = {}) {
  const key = trim(value).toLowerCase();
  const allowed = allowOther ? STREAM_KEYS : LIVE_STREAM_KEYS;
  return allowed.has(key) ? key : null;
}

function normaliseCampaignStatus(value) {
  const status = trim(value).toLowerCase().replace(/[\s-]+/g, '_');
  return ['draft', 'locked', 'test_sent', 'sending', 'sent', 'cancelled'].includes(status) ? status : 'draft';
}

async function getSendGridApiKey() {
  const envValue = trim(process.env.SENDGRID_API_KEY || process.env.HELIX_SENDGRID_API_KEY || process.env.SG_API_KEY);
  if (envValue) return envValue;
  if (cachedSendGridApiKey) return cachedSendGridApiKey;
  for (const secretName of EMAIL_SENDGRID_SECRET_NAMES) {
    try {
      const secretValue = trim(await getSecret(secretName));
      if (secretValue) {
        cachedSendGridApiKey = secretValue;
        return secretValue;
      }
    } catch {
      // try the next configured secret name
    }
  }
  return null;
}

async function fetchSendGridJson(path) {
  const apiKey = await getSendGridApiKey();
  if (!apiKey) return { configured: false, ok: false, statusCode: null, body: null };
  const response = await fetch(`https://api.sendgrid.com${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { configured: true, ok: response.ok, statusCode: response.status, body };
}

function summariseSendGridMessages(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : Array.isArray(body) ? body : [];
  const byStatus = {};
  let lastActivityAt = null;
  for (const message of messages) {
    const status = trim(message?.status || message?.event || message?.last_event || 'unknown').toLowerCase() || 'unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
    const stamp = trim(message?.last_event_time || message?.processed_at || message?.created_at || message?.updated_at);
    if (stamp && (!lastActivityAt || Date.parse(stamp) > Date.parse(lastActivityAt))) lastActivityAt = stamp;
  }
  return { sampleSize: messages.length, byStatus, lastActivityAt };
}

function resolveSender(value) {
  const email = trim(value).toLowerCase();
  return EMAIL_SENDGRID_ALLOWED_SENDERS.has(email) ? email : null;
}

function hashBody(value) {
  const body = trim(value);
  if (!body) return null;
  return crypto.createHash('sha256').update(body).digest('hex');
}

async function ensureSeedStreams(projectConn) {
  await withRequest(projectConn, async (request) => {
    const values = STREAMS.map((stream, index) => `(@streamKey${index}, @label${index}, @sendable${index}, @sortOrder${index}, N'active')`).join(',\n');
    STREAMS.forEach((stream, index) => {
      request.input(`streamKey${index}`, sql.NVarChar(40), stream.streamKey);
      request.input(`label${index}`, sql.NVarChar(120), stream.label);
      request.input(`sendable${index}`, sql.Bit, stream.isSendable);
      request.input(`sortOrder${index}`, sql.Int, stream.sortOrder);
    });
    return request.query(`
      MERGE dbo.marketing_email_audience_streams AS target
      USING (VALUES ${values}) AS source (stream_key, label, is_sendable, sort_order, status)
      ON target.stream_key = source.stream_key
      WHEN MATCHED THEN UPDATE SET
        label = source.label,
        is_sendable = source.is_sendable,
        sort_order = source.sort_order,
        status = source.status,
        updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (stream_key, label, is_sendable, sort_order, status)
        VALUES (source.stream_key, source.label, source.is_sendable, source.sort_order, source.status);
    `);
  });
}

async function readSchemaState(projectConn) {
  const result = await withRequest(projectConn, async (request) => request.query(`
    SELECT
      CASE WHEN OBJECT_ID(N'dbo.marketing_email_audience_streams', N'U') IS NULL THEN 0 ELSE 1 END AS has_streams,
      CASE WHEN OBJECT_ID(N'dbo.marketing_email_audience_members', N'U') IS NULL THEN 0 ELSE 1 END AS has_members,
      CASE WHEN OBJECT_ID(N'dbo.marketing_email_campaigns', N'U') IS NULL THEN 0 ELSE 1 END AS has_campaigns,
      CASE WHEN OBJECT_ID(N'dbo.marketing_email_campaign_recipients', N'U') IS NULL THEN 0 ELSE 1 END AS has_campaign_recipients,
      CASE WHEN COL_LENGTH(N'dbo.marketing_email_audience_members', N'demo_seed') IS NULL THEN 0 ELSE 1 END AS has_member_demo_seed,
      CASE WHEN COL_LENGTH(N'dbo.marketing_email_campaigns', N'demo_seed') IS NULL THEN 0 ELSE 1 END AS has_campaign_demo_seed;
  `));
  const row = result.recordset?.[0] || {};
  return {
    hasStreams: Boolean(row.has_streams),
    hasMembers: Boolean(row.has_members),
    hasCampaigns: Boolean(row.has_campaigns),
    hasCampaignRecipients: Boolean(row.has_campaign_recipients),
    hasMemberDemoSeed: Boolean(row.has_member_demo_seed),
    hasCampaignDemoSeed: Boolean(row.has_campaign_demo_seed),
  };
}

async function getSourceColumns(instructionsConn) {
  const result = await withRequest(instructionsConn, async (request) => request.query(`
    SELECT COLUMN_NAME AS name
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'enquiries';
  `));
  return (result.recordset || []).map((row) => trim(row.name)).filter(Boolean);
}

async function readSourceCandidates(limit) {
  const instructionsConn = getInstructionsConnectionString();
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 2000, 10000));
  const columns = await getSourceColumns(instructionsConn);
  const picked = {
    id: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.id),
    acid: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.acid),
    email: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.email),
    areaOfWork: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.areaOfWork),
    tags: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.tags),
    datetime: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.datetime),
  };
  if (!picked.email) throw new Error('No email column found on dbo.enquiries');

  const idExpr = picked.id ? `TRY_CONVERT(nvarchar(120), e.${safeColumnRef(picked.id)})` : 'NULL';
  const acidExpr = picked.acid ? trimSqlTextExpr(picked.acid, 120) : 'NULL';
  const emailExpr = trimSqlTextExpr(picked.email, 320);
  const areaExpr = picked.areaOfWork ? trimSqlTextExpr(picked.areaOfWork, 160) : 'NULL';
  const tagsExpr = picked.tags ? `TRY_CONVERT(nvarchar(max), e.${safeColumnRef(picked.tags)})` : 'NULL';
  const datetimeExpr = picked.datetime ? `TRY_CONVERT(datetime2, e.${safeColumnRef(picked.datetime)})` : 'NULL';
  const orderClause = picked.datetime
    ? `TRY_CONVERT(datetime2, e.${safeColumnRef(picked.datetime)}) DESC${picked.id ? `, e.${safeColumnRef(picked.id)} DESC` : ''}`
    : picked.id
      ? `e.${safeColumnRef(picked.id)} DESC`
      : '(SELECT NULL)';
  return withRequest(instructionsConn, async (request) => {
    request.input('limit', sql.Int, cappedLimit);
    const result = await request.query(`
      WITH candidate_enquiries AS (
        SELECT TOP (@limit)
          ${idExpr} AS source_enquiry_id,
          ${acidExpr} AS acid,
          ${emailExpr} AS email,
          ${areaExpr} AS area_of_work,
          ${tagsExpr} AS tags_text,
          ${datetimeExpr} AS enquiry_at
        FROM dbo.enquiries AS e WITH (NOLOCK)
        WHERE ${emailExpr} IS NOT NULL
        ORDER BY ${orderClause}
      ), matter_links AS (
        SELECT
          ce.source_enquiry_id,
          MAX(TRY_CONVERT(nvarchar(120), m.MatterID)) AS matter_id
        FROM candidate_enquiries AS ce
        LEFT JOIN dbo.Matters AS m WITH (NOLOCK)
          ON TRY_CONVERT(nvarchar(120), m.EnquiryID) = ce.source_enquiry_id
        GROUP BY ce.source_enquiry_id
      )
      SELECT
        ce.source_enquiry_id,
        ce.acid,
        ce.email,
        ce.area_of_work,
        ce.tags_text,
        ce.enquiry_at,
        ml.matter_id
      FROM candidate_enquiries AS ce
      LEFT JOIN matter_links AS ml ON ml.source_enquiry_id = ce.source_enquiry_id;
    `);
    return result.recordset || [];
  });
}

function createListCountMap() {
  return new Map(STREAMS.map((stream) => [stream.streamKey, {
    legacyCount: 0,
    newSpaceCount: 0,
    sourceWithEmail: 0,
    lastSourceSeenAt: null,
  }]));
}

function mergeListCountRows(counts, rows, sourceKey) {
  for (const row of rows || []) {
    const streamKey = normaliseStreamKey(row.stream_key) || 'other';
    const current = counts.get(streamKey) || { legacyCount: 0, newSpaceCount: 0, sourceWithEmail: 0, lastSourceSeenAt: null };
    const count = Number(row.list_count || 0);
    current[sourceKey] += count;
    current.sourceWithEmail += Number(row.with_email_count || 0);

    const nextStamp = row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null;
    if (nextStamp && (!current.lastSourceSeenAt || Date.parse(nextStamp) > Date.parse(current.lastSourceSeenAt))) {
      current.lastSourceSeenAt = nextStamp;
    }

    counts.set(streamKey, current);
  }
}

async function readNewSpaceListCountRows() {
  const instructionsConn = trim(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
  if (!instructionsConn) return [];
  const columns = await getSourceColumns(instructionsConn);
  const picked = {
    email: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.email),
    areaOfWork: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.areaOfWork),
    datetime: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.datetime),
  };
  const emailExpr = picked.email ? trimSqlTextExpr(picked.email, 320) : 'NULL';
  const areaExpr = picked.areaOfWork ? trimSqlTextExpr(picked.areaOfWork, 320) : 'NULL';
  const datetimeExpr = picked.datetime ? `TRY_CONVERT(datetime2, e.${safeColumnRef(picked.datetime)})` : 'NULL';
  return withRequest(instructionsConn, async (request) => {
    const result = await request.query(`
      WITH source_rows AS (
        SELECT
          ${streamKeyCaseSql(areaExpr)} AS stream_key,
          ${emailExpr} AS email_value,
          ${datetimeExpr} AS seen_at
        FROM dbo.enquiries AS e WITH (NOLOCK)
      )
      SELECT
        stream_key,
        COUNT_BIG(*) AS list_count,
        SUM(CASE WHEN email_value IS NOT NULL AND CHARINDEX(N'@', email_value) > 1 THEN 1 ELSE 0 END) AS with_email_count,
        MAX(seen_at) AS last_seen_at
      FROM source_rows
      GROUP BY stream_key;
    `);
    return result.recordset || [];
  });
}

async function readLegacyListCountRows() {
  const legacyConn = trim(process.env.SQL_CONNECTION_STRING);
  if (!legacyConn) return [];
  const areaExpr = `NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(320), e.${safeColumnRef('Area_of_Work')}))), '')`;
  const emailExpr = `NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(320), e.${safeColumnRef('Email')}))), '')`;
  return withRequest(legacyConn, async (request) => {
    const result = await request.query(`
      WITH source_rows AS (
        SELECT
          ${streamKeyCaseSql(areaExpr)} AS stream_key,
          ${emailExpr} AS email_value,
          TRY_CONVERT(datetime2, e.${safeColumnRef('Date_Created')}) AS seen_at
        FROM dbo.enquiries AS e WITH (NOLOCK)
      )
      SELECT
        stream_key,
        COUNT_BIG(*) AS list_count,
        SUM(CASE WHEN email_value IS NOT NULL AND CHARINDEX(N'@', email_value) > 1 THEN 1 ELSE 0 END) AS with_email_count,
        MAX(seen_at) AS last_seen_at
      FROM source_rows
      GROUP BY stream_key;
    `);
    return result.recordset || [];
  });
}

async function readListCounts({ demoOnly = false } = {}) {
  const counts = createListCountMap();
  if (demoOnly) return counts;

  const [newSpaceRows, legacyRows] = await Promise.all([
    readNewSpaceListCountRows().catch((error) => {
      trackException(error, { operation: 'marketing-email-list-counts', source: 'instructions' });
      trackEvent('MarketingEmail.Streams.ListCounts.Warning', { source: 'instructions', error: error?.message || 'Unknown error' });
      return [];
    }),
    readLegacyListCountRows().catch((error) => {
      trackException(error, { operation: 'marketing-email-list-counts', source: 'legacy' });
      trackEvent('MarketingEmail.Streams.ListCounts.Warning', { source: 'legacy', error: error?.message || 'Unknown error' });
      return [];
    }),
  ]);

  mergeListCountRows(counts, newSpaceRows, 'newSpaceCount');
  mergeListCountRows(counts, legacyRows, 'legacyCount');
  return counts;
}

function toMemberRecord(row) {
  const tags = splitTags(row.tags_text);
  const rank = extractRank(tags);
  const streamKey = classifyStream(row.area_of_work);
  const acid = nullable(row.acid, 120);
  const email = trim(row.email);
  const matterId = nullable(row.matter_id, 120);
  const client = Boolean(matterId);
  const qualification = qualifyMember({ streamKey, acid, email, rank, tags, client });
  return {
    streamKey,
    acid,
    sourceEnquiryId: nullable(row.source_enquiry_id, 120),
    emailHash: hashEmail(email),
    emailDomain: emailDomain(email),
    areaOfWork: nullable(row.area_of_work, 160),
    rank,
    tags,
    client,
    matterId,
    clientStatus: client ? 'client' : 'prospect',
    qualificationStatus: qualification.status,
    qualificationReason: qualification.reason,
    sendable: qualification.sendable,
    touchpointAt: row.enquiry_at ? new Date(row.enquiry_at).toISOString() : null,
  };
}

async function upsertMembers(projectConn, members, actor) {
  if (!members.length) return 0;
  const dedupedMembers = [];
  const seenKeys = new Set();
  for (const member of members) {
    const key = member.acid
      ? `acid:${member.acid.toLowerCase()}`
      : `source:${String(member.sourceEnquiryId || '').toLowerCase()}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    dedupedMembers.push(member);
  }
  const payload = dedupedMembers.map((member) => ({
    streamKey: member.streamKey,
    acid: member.acid,
    sourceEnquiryId: member.sourceEnquiryId,
    emailHash: member.emailHash,
    emailDomain: member.emailDomain,
    areaOfWork: member.areaOfWork,
    rank: member.rank,
    tagsJson: JSON.stringify(member.tags),
    client: member.client,
    matterId: member.matterId,
    clientStatus: member.clientStatus,
    qualificationStatus: member.qualificationStatus,
    qualificationReason: member.qualificationReason,
    sendable: member.sendable,
    touchpointAt: member.touchpointAt || null,
  }));
  const result = await withRequest(projectConn, async (request) => {
    request.input('membersJson', sql.NVarChar(sql.MAX), JSON.stringify(payload));
    request.input('actor', sql.NVarChar(160), actor || 'api');
    return request.query(`
      WITH source_rows AS (
        SELECT *
        FROM OPENJSON(@membersJson) WITH (
          stream_key NVARCHAR(40) '$.streamKey',
          acid NVARCHAR(120) '$.acid',
          source_enquiry_id NVARCHAR(120) '$.sourceEnquiryId',
          email_hash CHAR(64) '$.emailHash',
          email_domain NVARCHAR(160) '$.emailDomain',
          area_of_work NVARCHAR(160) '$.areaOfWork',
          [rank] TINYINT '$.rank',
          tags_json NVARCHAR(MAX) '$.tagsJson',
          client BIT '$.client',
          matter_id NVARCHAR(120) '$.matterId',
          client_status NVARCHAR(40) '$.clientStatus',
          qualification_status NVARCHAR(40) '$.qualificationStatus',
          qualification_reason NVARCHAR(300) '$.qualificationReason',
          sendable BIT '$.sendable',
          touchpoint_at NVARCHAR(40) '$.touchpointAt'
        )
      )
        MERGE dbo.marketing_email_audience_members AS target
        USING source_rows AS source
        ON (
          (source.acid IS NOT NULL AND target.acid = source.acid)
          OR (source.source_enquiry_id IS NOT NULL AND target.source_enquiry_id = source.source_enquiry_id)
        )
        WHEN MATCHED THEN UPDATE SET
          stream_key = source.stream_key,
          acid = source.acid,
          source_enquiry_id = source.source_enquiry_id,
          email_hash = source.email_hash,
          email_domain = source.email_domain,
          area_of_work = source.area_of_work,
          client = source.client,
          matter_id = source.matter_id,
          client_status = source.client_status,
          last_seen_at = COALESCE(TRY_CONVERT(datetime2, source.touchpoint_at), target.last_seen_at, SYSUTCDATETIME()),
          updated_at = SYSUTCDATETIME(),
          updated_by = @actor
        WHEN NOT MATCHED THEN INSERT (
          stream_key, acid, source_enquiry_id, email_hash, email_domain, area_of_work, [rank], tags_json,
          client, matter_id, client_status, qualification_status, qualification_reason, sendable,
          last_seen_at, last_qualified_at, created_by
        ) VALUES (
          source.stream_key, source.acid, source.source_enquiry_id, source.email_hash, source.email_domain, source.area_of_work, source.[rank], source.tags_json,
          source.client, source.matter_id, source.client_status, source.qualification_status, source.qualification_reason, source.sendable,
          COALESCE(TRY_CONVERT(datetime2, source.touchpoint_at), SYSUTCDATETIME()), SYSUTCDATETIME(), @actor
        );
    `);
  }, 1);
  return Number(result.rowsAffected?.reduce((sum, count) => sum + count, 0) || 0);
}

function mapStreamRow(row) {
  return {
    streamKey: trim(row.stream_key),
    label: trim(row.label),
    isSendable: Boolean(row.is_sendable),
    sortOrder: Number(row.sort_order || 0),
    status: trim(row.status),
    total: Number(row.total_count || 0),
    sendable: Number(row.sendable_count || 0),
    inspect: Number(row.inspect_count || 0),
    blocked: Number(row.blocked_count || 0),
    missingAcid: Number(row.missing_acid_count || 0),
    missingEmail: Number(row.missing_email_count || 0),
    clients: Number(row.client_count || 0),
    withAcid: Number(row.with_acid_count || 0),
    ranked: Number(row.ranked_count || 0),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
  };
}

function enrichStreamWithListCounts(stream, listCounts) {
  const counts = listCounts.get(stream.streamKey) || { legacyCount: 0, newSpaceCount: 0, sourceWithEmail: 0, lastSourceSeenAt: null };
  const sourceListSize = counts.legacyCount + counts.newSpaceCount;
  const listSize = Math.max(sourceListSize, stream.total);
  const migrationBacklog = Math.max(0, listSize - stream.total);
  const migrationCoverage = listSize > 0 ? Math.round((stream.total / listSize) * 1000) / 10 : 0;
  return {
    ...stream,
    listSize,
    sourceListSize,
    legacyCount: counts.legacyCount,
    newSpaceCount: counts.newSpaceCount,
    sourceWithEmail: counts.sourceWithEmail,
    membershipCount: stream.total,
    migrationBacklog,
    migrationCoverage,
    lastSourceSeenAt: counts.lastSourceSeenAt,
    listCountBasis: 'aggregate_source_rows',
  };
}

async function readStreams(projectConn, { demoOnly = false, schema = null } = {}) {
  await ensureSeedStreams(projectConn);
  const state = schema || await readSchemaState(projectConn);
  const listCounts = await readListCounts({ demoOnly });
  const memberJoinPredicate = demoOnly
    ? (state.hasMemberDemoSeed ? 'm.stream_key = s.stream_key AND m.demo_seed = 1' : '1 = 0')
    : 'm.stream_key = s.stream_key';
  const result = await withRequest(projectConn, async (request) => request.query(`
    SELECT
      s.stream_key,
      s.label,
      s.is_sendable,
      s.sort_order,
      s.status,
      COUNT(m.member_id) AS total_count,
      SUM(CASE WHEN m.sendable = 1 THEN 1 ELSE 0 END) AS sendable_count,
      SUM(CASE WHEN m.qualification_status = N'inspect' THEN 1 ELSE 0 END) AS inspect_count,
      SUM(CASE WHEN m.qualification_status IN (N'blocked', N'suppressed', N'client_excluded') THEN 1 ELSE 0 END) AS blocked_count,
      SUM(CASE WHEN m.qualification_status = N'missing_acid' THEN 1 ELSE 0 END) AS missing_acid_count,
      SUM(CASE WHEN m.qualification_status = N'missing_email' THEN 1 ELSE 0 END) AS missing_email_count,
      SUM(CASE WHEN m.client = 1 THEN 1 ELSE 0 END) AS client_count,
      SUM(CASE WHEN m.acid IS NOT NULL THEN 1 ELSE 0 END) AS with_acid_count,
      SUM(CASE WHEN m.[rank] IS NOT NULL THEN 1 ELSE 0 END) AS ranked_count,
      MAX(m.last_seen_at) AS last_seen_at,
      SUM(CASE WHEN m.created_at >= DATEADD(MONTH, DATEDIFF(MONTH, 0, SYSUTCDATETIME()), 0)
                    AND m.created_at < DATEADD(MONTH, DATEDIFF(MONTH, 0, SYSUTCDATETIME()) + 1, 0)
               THEN 1 ELSE 0 END) AS added_this_month,
      SUM(CASE WHEN m.created_at >= DATEADD(MONTH, DATEDIFF(MONTH, 0, SYSUTCDATETIME()) - 1, 0)
                    AND m.created_at < DATEADD(MONTH, DATEDIFF(MONTH, 0, SYSUTCDATETIME()), 0)
               THEN 1 ELSE 0 END) AS added_last_month,
      SUM(CASE WHEN m.created_at >= DATEADD(QUARTER, DATEDIFF(QUARTER, 0, SYSUTCDATETIME()), 0)
                    AND m.created_at < DATEADD(QUARTER, DATEDIFF(QUARTER, 0, SYSUTCDATETIME()) + 1, 0)
               THEN 1 ELSE 0 END) AS added_this_quarter
    FROM dbo.marketing_email_audience_streams AS s
    LEFT JOIN dbo.marketing_email_audience_members AS m ON ${memberJoinPredicate}
    GROUP BY s.stream_key, s.label, s.is_sendable, s.sort_order, s.status
    ORDER BY s.sort_order ASC;
  `));
  const streams = (result.recordset || []).map(mapStreamRow).filter((stream) => !demoOnly || stream.total > 0);
  return streams.map((stream) => ({
    ...enrichStreamWithListCounts(stream, listCounts),
    glyph: STREAMS.find((entry) => entry.streamKey === stream.streamKey)?.glyph || 'Other/Unsure',
  }));
}

function mapMemberRow(row) {
  let tags = [];
  try {
    const parsedTags = JSON.parse(row.tags_json || '[]');
    tags = Array.isArray(parsedTags) ? parsedTags : [];
  } catch {
    tags = [];
  }
  return {
    memberId: trim(row.member_id),
    streamKey: trim(row.stream_key),
    acid: trim(row.acid),
    sourceEnquiryId: trim(row.source_enquiry_id),
    emailHash: trim(row.email_hash),
    emailDomain: trim(row.email_domain),
    areaOfWork: trim(row.area_of_work),
    rank: row.rank == null ? null : Number(row.rank),
    tags,
    client: Boolean(row.client),
    matterId: trim(row.matter_id),
    clientStatus: trim(row.client_status),
    qualificationStatus: trim(row.qualification_status),
    qualificationReason: trim(row.qualification_reason),
    sendable: Boolean(row.sendable),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    lastQualifiedAt: row.last_qualified_at ? new Date(row.last_qualified_at).toISOString() : null,
  };
}

async function readMembers(projectConn, streamKey, limit, { demoOnly = false, schema = null } = {}) {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 200, 1000));
  const state = schema || await readSchemaState(projectConn);
  if (demoOnly && !state.hasMemberDemoSeed) return [];
  return withRequest(projectConn, async (request) => {
    request.input('streamKey', sql.NVarChar(40), streamKey);
    request.input('limit', sql.Int, cappedLimit);
    const result = await request.query(`
      SELECT TOP (@limit)
        CONVERT(nvarchar(36), member_id) AS member_id,
        stream_key,
        acid,
        source_enquiry_id,
        email_hash,
        email_domain,
        area_of_work,
        [rank],
        tags_json,
        client,
        matter_id,
        client_status,
        qualification_status,
        qualification_reason,
        sendable,
        last_seen_at,
        last_qualified_at
      FROM dbo.marketing_email_audience_members
      WHERE stream_key = @streamKey
        ${demoOnly ? 'AND demo_seed = 1' : ''}
      ORDER BY sendable DESC, [rank] ASC, last_seen_at DESC;
    `);
    return result.recordset || [];
  });
}

async function countCampaignSelection(projectConn, { streamKey, excludeClients, rankMin, rankMax, demoOnly = false, schema = null }) {
  const state = schema || await readSchemaState(projectConn);
  if (demoOnly && !state.hasMemberDemoSeed) return { selectedCount: 0, blockedCount: 0 };
  return withRequest(projectConn, async (request) => {
    request.input('streamKey', sql.NVarChar(40), streamKey);
    request.input('excludeClients', sql.Bit, Boolean(excludeClients));
    request.input('rankMin', sql.TinyInt, rankMin == null ? null : rankMin);
    request.input('rankMax', sql.TinyInt, rankMax == null ? null : rankMax);
    const result = await request.query(`
      SELECT
        SUM(CASE WHEN sendable = 1
          AND (@excludeClients = 0 OR client = 0)
          AND (@rankMin IS NULL OR [rank] >= @rankMin)
          AND (@rankMax IS NULL OR [rank] <= @rankMax)
          THEN 1 ELSE 0 END) AS selected_count,
        SUM(CASE WHEN sendable = 0
          OR (@excludeClients = 1 AND client = 1)
          OR (@rankMin IS NOT NULL AND ([rank] IS NULL OR [rank] < @rankMin))
          OR (@rankMax IS NOT NULL AND ([rank] IS NULL OR [rank] > @rankMax))
          THEN 1 ELSE 0 END) AS blocked_count
      FROM dbo.marketing_email_audience_members
      WHERE stream_key = @streamKey
        ${demoOnly ? 'AND demo_seed = 1' : ''};
    `);
    const row = result.recordset?.[0] || {};
    return {
      selectedCount: Number(row.selected_count || 0),
      blockedCount: Number(row.blocked_count || 0),
    };
  });
}

function parseRank(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 7 ? number : null;
}

function mapCampaignRow(row) {
  return {
    campaignId: trim(row.campaign_id),
    campaignKey: trim(row.campaign_key),
    streamKey: trim(row.stream_key),
    status: trim(row.status),
    campaignName: trim(row.campaign_name),
    subject: trim(row.subject),
    preheader: trim(row.preheader),
    senderEmail: trim(row.sender_email),
    signatureMode: trim(row.signature_mode),
    excludeClients: Boolean(row.exclude_clients),
    rankMin: row.rank_min == null ? null : Number(row.rank_min),
    rankMax: row.rank_max == null ? null : Number(row.rank_max),
    selectedCount: row.selected_count == null ? null : Number(row.selected_count),
    blockedCount: row.blocked_count == null ? null : Number(row.blocked_count),
    sentCount: row.sent_count == null ? null : Number(row.sent_count),
    sendgridBatchId: trim(row.sendgrid_batch_id),
    sendgridMessageId: trim(row.sendgrid_message_id),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    createdBy: trim(row.created_by),
    lockedAt: row.locked_at ? new Date(row.locked_at).toISOString() : null,
    lockedBy: trim(row.locked_by),
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    sentBy: trim(row.sent_by),
  };
}

async function snapshotCampaignRecipients(projectConn, { campaignId, streamKey, excludeClients, rankMin, rankMax, actor, demoOnly = false, schema = null }) {
  const state = schema || await readSchemaState(projectConn);
  if (!state.hasCampaignRecipients) return { available: false, insertedCount: 0 };
  if (demoOnly && !state.hasMemberDemoSeed) return { available: true, insertedCount: 0 };

  const result = await withRequest(projectConn, async (request) => {
    request.input('campaignId', sql.UniqueIdentifier, campaignId);
    request.input('streamKey', sql.NVarChar(40), streamKey);
    request.input('excludeClients', sql.Bit, Boolean(excludeClients));
    request.input('rankMin', sql.TinyInt, rankMin == null ? null : rankMin);
    request.input('rankMax', sql.TinyInt, rankMax == null ? null : rankMax);
    request.input('demoSeed', sql.Bit, Boolean(demoOnly));
    request.input('actor', sql.NVarChar(160), actor || 'api');
    return request.query(`
      DELETE FROM dbo.marketing_email_campaign_recipients
      WHERE campaign_id = @campaignId;

      INSERT INTO dbo.marketing_email_campaign_recipients (
        campaign_id, member_id, stream_key, acid, source_enquiry_id, email_hash, email_domain,
        area_of_work, [rank], tags_json, client, client_status,
        selection_status, selection_reason, send_status, demo_seed, snapshot_at, created_by
      )
      SELECT
        @campaignId,
        member_id,
        stream_key,
        acid,
        source_enquiry_id,
        email_hash,
        email_domain,
        area_of_work,
        [rank],
        tags_json,
        client,
        client_status,
        CASE WHEN sendable = 1
          AND (@excludeClients = 0 OR client = 0)
          AND (@rankMin IS NULL OR [rank] >= @rankMin)
          AND (@rankMax IS NULL OR [rank] <= @rankMax)
          THEN N'selected' ELSE N'blocked' END,
        CASE WHEN sendable = 0 THEN qualification_reason
          WHEN @excludeClients = 1 AND client = 1 THEN N'Client excluded by campaign setting'
          WHEN @rankMin IS NOT NULL AND ([rank] IS NULL OR [rank] < @rankMin) THEN N'Below rank window'
          WHEN @rankMax IS NOT NULL AND ([rank] IS NULL OR [rank] > @rankMax) THEN N'Above rank window'
          ELSE N'Selected at campaign lock' END,
        N'not_sent',
        @demoSeed,
        SYSUTCDATETIME(),
        @actor
      FROM dbo.marketing_email_audience_members
      WHERE stream_key = @streamKey
        ${demoOnly ? 'AND demo_seed = 1' : ''};
    `);
  });
  return { available: true, insertedCount: Number(result.rowsAffected?.[1] || 0) };
}

router.get('/streams', async (req, res) => {
  const operation = 'marketing-email-streams';
  const startedAt = Date.now();
  const actor = getActor(req);
  const demoOnly = isDemoRequest(req);
  trackEvent('MarketingEmail.Streams.Started', { operation, actor, demoOnly: String(demoOnly) });
  try {
    const projectConn = deriveProjectDataConnectionString();
    const schema = await readSchemaState(projectConn);
    const streams = await readStreams(projectConn, { demoOnly, schema });
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.Streams.Completed', { operation, actor, demoOnly: String(demoOnly), durationMs: String(durationMs), streamCount: String(streams.length) });
    trackMetric('MarketingEmail.Streams.Duration', durationMs, { operation });
    return res.json({ ok: true, mode: demoOnly ? 'demo' : 'live', source: 'helix-project-data.dbo.marketing_email_*', generatedAt: new Date().toISOString(), streams });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'read-streams' });
    trackEvent('MarketingEmail.Streams.Failed', { operation, actor, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to load marketing email streams' });
  }
});

router.post('/streams/refresh', async (req, res) => {
  const operation = 'marketing-email-stream-refresh';
  const startedAt = Date.now();
  const actor = getActor(req);
  const limit = Number(req.body?.limit || req.query?.limit || 2500);
  const demoOnly = isDemoRequest(req);
  const materialise = req.body?.materialise === true || ['1', 'true', 'yes'].includes(trim(req.query?.materialise).toLowerCase());
  trackEvent('MarketingEmail.Streams.Refresh.Started', { operation, actor, limit: String(limit), materialise: String(materialise), demoOnly: String(demoOnly) });
  try {
    const projectConn = deriveProjectDataConnectionString();
    const schema = await readSchemaState(projectConn);
    await ensureSeedStreams(projectConn);
    const sourceRows = demoOnly ? [] : await readSourceCandidates(limit);
    const members = sourceRows.map(toMemberRecord);
    const changed = !demoOnly && materialise ? await upsertMembers(projectConn, members, actor) : 0;
    const streams = await readStreams(projectConn, { demoOnly, schema });
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.Streams.Refresh.Completed', {
      operation,
      actor,
      durationMs: String(durationMs),
      materialise: String(materialise),
      demoOnly: String(demoOnly),
      sourceCount: String(sourceRows.length),
      changedCount: String(changed),
    });
    trackMetric('MarketingEmail.Streams.Refresh.Duration', durationMs, { operation });
    trackMetric('MarketingEmail.Streams.Refresh.Rows', members.length, { operation });
    return res.json({ ok: true, mode: demoOnly ? 'demo' : 'live', materialised: !demoOnly && materialise, sourceCount: demoOnly ? streams.reduce((sum, stream) => sum + stream.total, 0) : sourceRows.length, changedCount: changed, streams, generatedAt: new Date().toISOString() });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'refresh' });
    trackEvent('MarketingEmail.Streams.Refresh.Failed', { operation, actor, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to refresh marketing email audience streams' });
  }
});

router.get('/streams/:streamKey/growth', async (req, res) => {
  const operation = 'marketing-email-stream-growth';
  const startedAt = Date.now();
  const actor = getActor(req);
  const streamKey = normaliseStreamKey(req.params.streamKey);
  const demoOnly = isDemoRequest(req);
  if (!streamKey) return res.status(400).json({ ok: false, error: 'Unsupported stream key' });
  trackEvent('MarketingEmail.StreamGrowth.Started', { operation, actor, streamKey, demoOnly: String(demoOnly) });
  try {
    const projectConn = deriveProjectDataConnectionString();
    const schema = await readSchemaState(projectConn);
    const rows = (demoOnly && !schema.hasMemberDemoSeed) ? [] : await withRequest(projectConn, async (request) => {
      request.input('streamKey', sql.NVarChar(40), streamKey);
      const result = await request.query(`
        SELECT CONVERT(date, last_seen_at) AS day, COUNT_BIG(*) AS member_count
        FROM dbo.marketing_email_audience_members
        WHERE stream_key = @streamKey AND last_seen_at IS NOT NULL
          ${demoOnly ? 'AND demo_seed = 1' : ''}
        GROUP BY CONVERT(date, last_seen_at)
        ORDER BY day ASC;
      `);
      return result.recordset || [];
    });
    const growth = rows
      .map((row) => ({ day: row.day ? new Date(row.day).toISOString().slice(0, 10) : null, count: Number(row.member_count || 0) }))
      .filter((entry) => entry.day);
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.StreamGrowth.Completed', { operation, actor, streamKey, demoOnly: String(demoOnly), durationMs: String(durationMs), bucketCount: String(growth.length) });
    trackMetric('MarketingEmail.StreamGrowth.Duration', durationMs, { operation, streamKey });
    return res.json({ ok: true, mode: demoOnly ? 'demo' : 'live', streamKey, basis: 'touchpoint_date', growth, generatedAt: new Date().toISOString() });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'stream-growth', streamKey });
    trackEvent('MarketingEmail.StreamGrowth.Failed', { operation, actor, streamKey, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to load list growth' });
  }
});

router.get('/streams/:streamKey/members', async (req, res) => {
  const operation = 'marketing-email-stream-members';
  const startedAt = Date.now();
  const actor = getActor(req);
  const streamKey = normaliseStreamKey(req.params.streamKey);
  const demoOnly = isDemoRequest(req);
  if (!streamKey) return res.status(400).json({ ok: false, error: 'Unsupported stream key' });
  trackEvent('MarketingEmail.StreamMembers.Started', { operation, actor, streamKey, demoOnly: String(demoOnly) });
  try {
    const projectConn = deriveProjectDataConnectionString();
    const schema = await readSchemaState(projectConn);
    const rows = await readMembers(projectConn, streamKey, req.query.limit, { demoOnly, schema });
    const members = rows.map(mapMemberRow);
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.StreamMembers.Completed', { operation, actor, streamKey, demoOnly: String(demoOnly), durationMs: String(durationMs), rowCount: String(members.length) });
    trackMetric('MarketingEmail.StreamMembers.Duration', durationMs, { operation, streamKey });
    return res.json({ ok: true, mode: demoOnly ? 'demo' : 'live', streamKey, count: members.length, members, generatedAt: new Date().toISOString() });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'read-members', streamKey });
    trackEvent('MarketingEmail.StreamMembers.Failed', { operation, actor, streamKey, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to load marketing email stream members' });
  }
});

router.patch('/streams/:streamKey/members/:memberId', async (req, res) => {
  const operation = 'marketing-email-stream-member-update';
  const startedAt = Date.now();
  const actor = getActor(req);
  const streamKey = normaliseStreamKey(req.params.streamKey);
  const memberId = trim(req.params.memberId);
  if (!streamKey) return res.status(400).json({ ok: false, error: 'Unsupported stream key' });
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return res.status(400).json({ ok: false, error: 'Invalid member id' });
  trackEvent('MarketingEmail.StreamMemberUpdate.Started', { operation, actor, streamKey });
  try {
    const projectConn = deriveProjectDataConnectionString();
    const currentResult = await withRequest(projectConn, async (request) => {
      request.input('memberId', sql.UniqueIdentifier, memberId);
      request.input('streamKey', sql.NVarChar(40), streamKey);
      return request.query(`
        SELECT TOP 1
          CONVERT(nvarchar(36), member_id) AS member_id,
          stream_key,
          acid,
          source_enquiry_id,
          email_hash,
          email_domain,
          area_of_work,
          [rank],
          tags_json,
          client,
          matter_id,
          client_status,
          qualification_status,
          qualification_reason,
          sendable,
          last_seen_at,
          last_qualified_at
        FROM dbo.marketing_email_audience_members
        WHERE member_id = @memberId AND stream_key = @streamKey;
      `);
    });
    const current = mapMemberRow(currentResult.recordset?.[0] || {});
    if (!current.memberId) return res.status(404).json({ ok: false, error: 'Audience member not found' });

    const has = (key) => Object.prototype.hasOwnProperty.call(req.body || {}, key);
    const nextStreamKey = has('streamKey') || has('stream_key')
      ? normaliseStreamKey(req.body?.streamKey || req.body?.stream_key)
      : current.streamKey;
    if (!nextStreamKey) return res.status(400).json({ ok: false, error: 'Unsupported target stream key' });
    const nextAcid = has('acid') ? nullable(req.body?.acid, 120) : nullable(current.acid, 120);
    const nextArea = has('areaOfWork') || has('area_of_work') ? nullable(req.body?.areaOfWork || req.body?.area_of_work, 160) : nullable(current.areaOfWork, 160);
    const nextRank = has('rank') ? parseRank(req.body?.rank) : current.rank;
    const nextClient = has('client') ? ['1', 'true', 'yes'].includes(trim(req.body?.client).toLowerCase()) || req.body?.client === true : current.client;
    const qualification = qualifyStoredMember({
      streamKey: nextStreamKey,
      acid: nextAcid,
      emailHash: current.emailHash,
      emailDomain: current.emailDomain,
      rank: nextRank,
      tags: current.tags,
      client: nextClient,
    });

    const updateResult = await withRequest(projectConn, async (request) => {
      request.input('memberId', sql.UniqueIdentifier, memberId);
      request.input('streamKey', sql.NVarChar(40), nextStreamKey);
      request.input('acid', sql.NVarChar(120), nextAcid);
      request.input('areaOfWork', sql.NVarChar(160), nextArea);
      request.input('rank', sql.TinyInt, nextRank);
      request.input('client', sql.Bit, nextClient);
      request.input('clientStatus', sql.NVarChar(40), nextClient ? 'client' : 'prospect');
      request.input('qualificationStatus', sql.NVarChar(40), qualification.status);
      request.input('qualificationReason', sql.NVarChar(300), qualification.reason);
      request.input('sendable', sql.Bit, qualification.sendable);
      request.input('actor', sql.NVarChar(160), actor);
      return request.query(`
        UPDATE dbo.marketing_email_audience_members
        SET stream_key = @streamKey,
            acid = @acid,
            area_of_work = @areaOfWork,
            [rank] = @rank,
            client = @client,
            matter_id = CASE WHEN @client = 1 THEN matter_id ELSE NULL END,
            client_status = @clientStatus,
            qualification_status = @qualificationStatus,
            qualification_reason = @qualificationReason,
            sendable = @sendable,
            last_qualified_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME(),
            updated_by = @actor
        OUTPUT
          CONVERT(nvarchar(36), INSERTED.member_id) AS member_id,
          INSERTED.stream_key,
          INSERTED.acid,
          INSERTED.source_enquiry_id,
          INSERTED.email_hash,
          INSERTED.email_domain,
          INSERTED.area_of_work,
          INSERTED.[rank],
          INSERTED.tags_json,
          INSERTED.client,
          INSERTED.matter_id,
          INSERTED.client_status,
          INSERTED.qualification_status,
          INSERTED.qualification_reason,
          INSERTED.sendable,
          INSERTED.last_seen_at,
          INSERTED.last_qualified_at
        WHERE member_id = @memberId;
      `);
    });

    const member = mapMemberRow(updateResult.recordset?.[0] || {});
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.StreamMemberUpdate.Completed', { operation, actor, streamKey, targetStreamKey: member.streamKey, durationMs: String(durationMs) });
    trackMetric('MarketingEmail.StreamMemberUpdate.Duration', durationMs, { operation, streamKey });
    return res.json({ ok: true, member, generatedAt: new Date().toISOString() });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'update-member', streamKey, memberId });
    trackEvent('MarketingEmail.StreamMemberUpdate.Failed', { operation, actor, streamKey, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to update audience member' });
  }
});

router.post('/streams/:streamKey/quality', async (req, res) => {
  const operation = 'marketing-email-stream-quality';
  const startedAt = Date.now();
  const actor = getActor(req);
  const streamKey = normaliseStreamKey(req.params.streamKey);
  const demoOnly = isDemoRequest(req);
  if (!streamKey) return res.status(400).json({ ok: false, error: 'Unsupported stream key' });
  trackEvent('MarketingEmail.StreamQuality.Started', { operation, actor, streamKey, demoOnly: String(demoOnly) });
  try {
    const projectConn = deriveProjectDataConnectionString();
    const schema = await readSchemaState(projectConn);
    const rows = await readMembers(projectConn, streamKey, 1000, { demoOnly, schema });
    const qualityRows = rows.map(mapMemberRow).map((member) => {
      const qualification = qualifyStoredMember(member);
      return {
        memberId: member.memberId,
        qualificationStatus: qualification.status,
        qualificationReason: qualification.reason,
        sendable: qualification.sendable,
      };
    });
    const updateResult = await withRequest(projectConn, async (request) => {
      request.input('qualityJson', sql.NVarChar(sql.MAX), JSON.stringify(qualityRows));
      request.input('actor', sql.NVarChar(160), actor);
      request.input('streamKey', sql.NVarChar(40), streamKey);
      return request.query(`
        WITH source_rows AS (
          SELECT *
          FROM OPENJSON(@qualityJson) WITH (
            member_id UNIQUEIDENTIFIER '$.memberId',
            qualification_status NVARCHAR(40) '$.qualificationStatus',
            qualification_reason NVARCHAR(300) '$.qualificationReason',
            sendable BIT '$.sendable'
          )
        )
        UPDATE target
        SET qualification_status = source.qualification_status,
            qualification_reason = source.qualification_reason,
            sendable = source.sendable,
            last_qualified_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME(),
            updated_by = @actor
        FROM dbo.marketing_email_audience_members AS target
        INNER JOIN source_rows AS source ON source.member_id = target.member_id
        WHERE target.stream_key = @streamKey
          ${demoOnly ? (schema.hasMemberDemoSeed ? 'AND target.demo_seed = 1' : 'AND 1 = 0') : ''};
      `);
    });
    const updatedCount = Number(updateResult.rowsAffected?.reduce((sum, count) => sum + count, 0) || 0);
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.StreamQuality.Completed', { operation, actor, streamKey, demoOnly: String(demoOnly), durationMs: String(durationMs), checkedCount: String(qualityRows.length), updatedCount: String(updatedCount) });
    trackMetric('MarketingEmail.StreamQuality.Duration', durationMs, { operation, streamKey });
    return res.json({ ok: true, streamKey, checkedCount: qualityRows.length, updatedCount, generatedAt: new Date().toISOString() });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'quality-check', streamKey });
    trackEvent('MarketingEmail.StreamQuality.Failed', { operation, actor, streamKey, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to quality check audience stream' });
  }
});

router.get('/campaigns', async (req, res) => {
  const operation = 'marketing-email-campaign-list';
  const startedAt = Date.now();
  const actor = getActor(req);
  const demoOnly = isDemoRequest(req);
  try {
    const projectConn = deriveProjectDataConnectionString();
    const schema = await readSchemaState(projectConn);
    if (demoOnly && !schema.hasCampaignDemoSeed) {
      return res.json({ ok: true, mode: 'demo', campaigns: [], generatedAt: new Date().toISOString() });
    }
    const result = await withRequest(projectConn, async (request) => request.query(`
      SELECT TOP 80
        CONVERT(nvarchar(36), campaign_id) AS campaign_id,
        campaign_key,
        stream_key,
        status,
        campaign_name,
        subject,
        preheader,
        sender_email,
        signature_mode,
        exclude_clients,
        rank_min,
        rank_max,
        selected_count,
        blocked_count,
        sent_count,
        sendgrid_batch_id,
        sendgrid_message_id,
        created_at,
        created_by,
        locked_at,
        locked_by,
        sent_at,
        sent_by
      FROM dbo.marketing_email_campaigns
      ${demoOnly ? 'WHERE demo_seed = 1' : ''}
      ORDER BY created_at DESC;
    `));
    const campaigns = (result.recordset || []).map(mapCampaignRow);
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.Campaigns.Completed', { operation, actor, demoOnly: String(demoOnly), durationMs: String(durationMs), rowCount: String(campaigns.length) });
    trackMetric('MarketingEmail.Campaigns.Duration', durationMs, { operation });
    return res.json({ ok: true, mode: demoOnly ? 'demo' : 'live', campaigns, generatedAt: new Date().toISOString() });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'list-campaigns' });
    trackEvent('MarketingEmail.Campaigns.Failed', { operation, actor, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to load marketing email campaigns' });
  }
});

router.post('/campaigns', async (req, res) => {
  const operation = 'marketing-email-campaign-create';
  const startedAt = Date.now();
  const actor = getActor(req);
  const demoOnly = isDemoRequest(req);
  const streamKey = normaliseStreamKey(req.body?.streamKey || req.body?.stream_key, { allowOther: false });
  if (!streamKey) return res.status(400).json({ ok: false, error: 'Campaigns can only use commercial, construction, property, or employment streams' });
  const campaignName = nullable(req.body?.campaignName || req.body?.campaign_name, 160);
  if (!campaignName) return res.status(400).json({ ok: false, error: 'Campaign name is required' });
  const sender = req.body?.senderEmail || req.body?.sender_email ? resolveSender(req.body?.senderEmail || req.body?.sender_email) : null;
  if ((req.body?.senderEmail || req.body?.sender_email) && !sender) return res.status(400).json({ ok: false, error: 'Unsupported SendGrid sender' });
  const rankMin = parseRank(req.body?.rankMin ?? req.body?.rank_min);
  const rankMax = parseRank(req.body?.rankMax ?? req.body?.rank_max);
  const excludeClients = req.body?.excludeClients !== false && String(req.body?.excludeClients || req.body?.exclude_clients || 'true').toLowerCase() !== 'false';
  trackEvent('MarketingEmail.CampaignCreate.Started', { operation, actor, streamKey, demoOnly: String(demoOnly) });
  try {
    const projectConn = deriveProjectDataConnectionString();
    const schema = await readSchemaState(projectConn);
    if (demoOnly && !schema.hasCampaignDemoSeed) return res.status(409).json({ ok: false, error: 'Run the Marketing Email campaign recipients demo migration before creating demo campaigns' });
    const counts = await countCampaignSelection(projectConn, { streamKey, excludeClients, rankMin, rankMax, demoOnly, schema });
    const campaignKey = nullable(req.body?.campaignKey || req.body?.campaign_key, 120) || `${demoOnly ? 'demo' : streamKey}-${Date.now().toString(36)}`;
    const demoColumn = schema.hasCampaignDemoSeed ? ', demo_seed' : '';
    const demoValue = schema.hasCampaignDemoSeed ? ', @demoSeed' : '';
    const result = await withRequest(projectConn, async (request) => {
      request.input('campaignKey', sql.NVarChar(120), campaignKey);
      request.input('streamKey', sql.NVarChar(40), streamKey);
      request.input('status', sql.NVarChar(40), normaliseCampaignStatus(req.body?.status));
      request.input('campaignName', sql.NVarChar(160), campaignName);
      request.input('subject', sql.NVarChar(300), nullable(req.body?.subject, 300));
      request.input('preheader', sql.NVarChar(300), nullable(req.body?.preheader, 300));
      request.input('bodyHash', sql.Char(64), hashBody(req.body?.body || req.body?.bodyText));
      request.input('senderEmail', sql.NVarChar(255), sender);
      request.input('signatureMode', sql.NVarChar(60), nullable(req.body?.signatureMode || req.body?.signature_mode, 60));
      request.input('excludeClients', sql.Bit, excludeClients);
      request.input('rankMin', sql.TinyInt, rankMin);
      request.input('rankMax', sql.TinyInt, rankMax);
      request.input('selectedCount', sql.Int, counts.selectedCount);
      request.input('blockedCount', sql.Int, counts.blockedCount);
      request.input('demoSeed', sql.Bit, Boolean(demoOnly));
      request.input('actor', sql.NVarChar(160), actor);
      return request.query(`
        INSERT INTO dbo.marketing_email_campaigns (
          campaign_key, stream_key, status, campaign_name, subject, preheader, body_hash,
          sender_email, signature_mode, exclude_clients, rank_min, rank_max,
          selected_count, blocked_count${demoColumn}, created_by
        )
        OUTPUT
          CONVERT(nvarchar(36), INSERTED.campaign_id) AS campaign_id,
          INSERTED.campaign_key,
          INSERTED.stream_key,
          INSERTED.status,
          INSERTED.campaign_name,
          INSERTED.subject,
          INSERTED.preheader,
          INSERTED.sender_email,
          INSERTED.signature_mode,
          INSERTED.exclude_clients,
          INSERTED.rank_min,
          INSERTED.rank_max,
          INSERTED.selected_count,
          INSERTED.blocked_count,
          INSERTED.sent_count,
          INSERTED.sendgrid_batch_id,
          INSERTED.sendgrid_message_id,
          INSERTED.created_at,
          INSERTED.created_by,
          INSERTED.locked_at,
          INSERTED.locked_by,
          INSERTED.sent_at,
          INSERTED.sent_by
        VALUES (
          @campaignKey, @streamKey, @status, @campaignName, @subject, @preheader, @bodyHash,
          @senderEmail, @signatureMode, @excludeClients, @rankMin, @rankMax,
          @selectedCount, @blockedCount${demoValue}, @actor
        );
      `);
    });
    const campaign = mapCampaignRow(result.recordset?.[0] || {});
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.CampaignCreate.Completed', { operation, actor, streamKey, demoOnly: String(demoOnly), durationMs: String(durationMs), selectedCount: String(counts.selectedCount), blockedCount: String(counts.blockedCount) });
    trackMetric('MarketingEmail.CampaignCreate.Duration', durationMs, { operation });
    return res.json({ ok: true, campaign });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'create-campaign', streamKey });
    trackEvent('MarketingEmail.CampaignCreate.Failed', { operation, actor, streamKey, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to create marketing email campaign' });
  }
});

router.post('/campaigns/:campaignId/lock', async (req, res) => {
  const operation = 'marketing-email-campaign-lock';
  const startedAt = Date.now();
  const actor = getActor(req);
  const demoOnly = isDemoRequest(req);
  const campaignId = trim(req.params.campaignId);
  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return res.status(400).json({ ok: false, error: 'Invalid campaign id' });
  try {
    const projectConn = deriveProjectDataConnectionString();
    const schema = await readSchemaState(projectConn);
    const campaignResult = await withRequest(projectConn, async (request) => {
      request.input('campaignId', sql.UniqueIdentifier, campaignId);
      return request.query(`
        SELECT TOP 1 stream_key, exclude_clients, rank_min, rank_max${schema.hasCampaignDemoSeed ? ', demo_seed' : ''}
        FROM dbo.marketing_email_campaigns
        WHERE campaign_id = @campaignId;
      `);
    });
    const current = campaignResult.recordset?.[0];
    if (!current) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    const effectiveDemoOnly = demoOnly || Boolean(current.demo_seed);
    const counts = await countCampaignSelection(projectConn, {
      streamKey: current.stream_key,
      excludeClients: Boolean(current.exclude_clients),
      rankMin: current.rank_min == null ? null : Number(current.rank_min),
      rankMax: current.rank_max == null ? null : Number(current.rank_max),
      demoOnly: effectiveDemoOnly,
      schema,
    });
    const snapshot = await snapshotCampaignRecipients(projectConn, {
      campaignId,
      streamKey: current.stream_key,
      excludeClients: Boolean(current.exclude_clients),
      rankMin: current.rank_min == null ? null : Number(current.rank_min),
      rankMax: current.rank_max == null ? null : Number(current.rank_max),
      actor,
      demoOnly: effectiveDemoOnly,
      schema,
    });
    const updateResult = await withRequest(projectConn, async (request) => {
      request.input('campaignId', sql.UniqueIdentifier, campaignId);
      request.input('selectedCount', sql.Int, counts.selectedCount);
      request.input('blockedCount', sql.Int, counts.blockedCount);
      request.input('actor', sql.NVarChar(160), actor);
      return request.query(`
        UPDATE dbo.marketing_email_campaigns
        SET status = N'locked',
            selected_count = @selectedCount,
            blocked_count = @blockedCount,
            locked_at = SYSUTCDATETIME(),
            locked_by = @actor,
            updated_at = SYSUTCDATETIME(),
            updated_by = @actor
        OUTPUT
          CONVERT(nvarchar(36), INSERTED.campaign_id) AS campaign_id,
          INSERTED.campaign_key,
          INSERTED.stream_key,
          INSERTED.status,
          INSERTED.campaign_name,
          INSERTED.subject,
          INSERTED.preheader,
          INSERTED.sender_email,
          INSERTED.signature_mode,
          INSERTED.exclude_clients,
          INSERTED.rank_min,
          INSERTED.rank_max,
          INSERTED.selected_count,
          INSERTED.blocked_count,
          INSERTED.sent_count,
          INSERTED.sendgrid_batch_id,
          INSERTED.sendgrid_message_id,
          INSERTED.created_at,
          INSERTED.created_by,
          INSERTED.locked_at,
          INSERTED.locked_by,
          INSERTED.sent_at,
          INSERTED.sent_by
        WHERE campaign_id = @campaignId;
      `);
    });
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.CampaignLock.Completed', { operation, actor, demoOnly: String(effectiveDemoOnly), durationMs: String(durationMs), selectedCount: String(counts.selectedCount), blockedCount: String(counts.blockedCount), snapshotAvailable: String(snapshot.available), snapshotCount: String(snapshot.insertedCount) });
    trackMetric('MarketingEmail.CampaignLock.Duration', durationMs, { operation });
    return res.json({ ok: true, mode: effectiveDemoOnly ? 'demo' : 'live', snapshot, campaign: mapCampaignRow(updateResult.recordset?.[0] || {}) });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'lock-campaign', campaignId });
    trackEvent('MarketingEmail.CampaignLock.Failed', { operation, actor, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to lock marketing email campaign' });
  }
});

router.get('/probes', async (req, res) => {
  const operation = 'marketing-email-probes';
  const startedAt = Date.now();
  const actor = getActor(req);
  try {
    const projectConn = deriveProjectDataConnectionString();
    const schema = await readSchemaState(projectConn);
    const demoCounts = await readMarketingEmailHandrailCounts(projectConn, schema);
    const apiKey = await getSendGridApiKey();
    const liveProvider = ['1', 'true', 'yes'].includes(trim(req.query?.liveProvider).toLowerCase());
    let providerProbe = { checked: false, ok: Boolean(apiKey), statusCode: null };
    if (apiKey && liveProvider) {
      const probeResponse = await fetch('https://api.sendgrid.com/v3/scopes', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      providerProbe = { checked: true, ok: probeResponse.ok, statusCode: probeResponse.status };
    }
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.Probes.Completed', { operation, actor, durationMs: String(durationMs), hasSendGridKey: String(Boolean(apiKey)), liveProvider: String(liveProvider), providerOk: String(providerProbe.ok) });
    trackMetric('MarketingEmail.Probes.Duration', durationMs, { operation });
    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      database: {
        target: 'helix-project-data',
        hasStreams: schema.hasStreams,
        hasMembers: schema.hasMembers,
        hasCampaigns: schema.hasCampaigns,
        hasCampaignRecipients: schema.hasCampaignRecipients,
        hasMemberDemoSeed: schema.hasMemberDemoSeed,
        hasCampaignDemoSeed: schema.hasCampaignDemoSeed,
        demoCounts,
      },
      sendGrid: {
        configured: Boolean(apiKey),
        providerProbe,
        allowedSenders: Array.from(EMAIL_SENDGRID_ALLOWED_SENDERS),
        massSendEnabled: false,
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'probes' });
    trackEvent('MarketingEmail.Probes.Failed', { operation, actor, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to run marketing email probes' });
  }
});

router.get('/sendgrid/connection', async (req, res) => {
  const operation = 'marketing-email-sendgrid-connection';
  const startedAt = Date.now();
  const actor = getActor(req);
  trackEvent('MarketingEmail.SendGrid.Connection.Started', { operation, actor });
  try {
    const probe = await fetchSendGridJson('/v3/scopes');
    const scopes = Array.isArray(probe.body?.scopes) ? probe.body.scopes.map(trim).filter(Boolean) : [];
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.SendGrid.Connection.Completed', {
      operation,
      actor,
      durationMs: String(durationMs),
      configured: String(probe.configured),
      providerOk: String(probe.ok),
      statusCode: String(probe.statusCode || ''),
      scopeCount: String(scopes.length),
    });
    trackMetric('MarketingEmail.SendGrid.Connection.Duration', durationMs, { operation });
    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      configured: probe.configured,
      providerOk: probe.ok,
      statusCode: probe.statusCode,
      scopeCount: scopes.length,
      hasMailSend: scopes.includes('mail.send'),
      hasActivityRead: scopes.some((scope) => scope === 'messages.read' || scope === 'email_activity.read'),
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'sendgrid-connection' });
    trackEvent('MarketingEmail.SendGrid.Connection.Failed', { operation, actor, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to check SendGrid connection' });
  }
});

router.get('/sendgrid/activity-summary', async (req, res) => {
  const operation = 'marketing-email-sendgrid-activity-summary';
  const startedAt = Date.now();
  const actor = getActor(req);
  trackEvent('MarketingEmail.SendGrid.ActivitySummary.Started', { operation, actor });
  try {
    const activity = await fetchSendGridJson('/v3/messages?limit=10');
    const summary = activity.ok ? summariseSendGridMessages(activity.body) : { sampleSize: 0, byStatus: {}, lastActivityAt: null };
    const reason = activity.ok
      ? null
      : !activity.configured
        ? 'not_configured'
        : activity.statusCode === 403
          ? 'activity_addon_required'
          : activity.statusCode === 401
            ? 'unauthorised'
            : 'provider_error';
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.SendGrid.ActivitySummary.Completed', {
      operation,
      actor,
      durationMs: String(durationMs),
      configured: String(activity.configured),
      providerOk: String(activity.ok),
      statusCode: String(activity.statusCode || ''),
      reason: reason || 'ok',
      sampleSize: String(summary.sampleSize),
    });
    trackMetric('MarketingEmail.SendGrid.ActivitySummary.Duration', durationMs, { operation });
    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      configured: activity.configured,
      providerOk: activity.ok,
      statusCode: activity.statusCode,
      activityAvailable: activity.ok,
      reason,
      summary,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'sendgrid-activity-summary' });
    trackEvent('MarketingEmail.SendGrid.ActivitySummary.Failed', { operation, actor, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to check SendGrid activity summary' });
  }
});

async function readMarketingEmailHandrailCounts(projectConn, schema) {
  const result = await withRequest(projectConn, async (request) => request.query(`
    SELECT
      ${schema.hasMembers ? '(SELECT COUNT(*) FROM dbo.marketing_email_audience_members)' : '0'} AS members,
      ${schema.hasMembers && schema.hasMemberDemoSeed ? '(SELECT COUNT(*) FROM dbo.marketing_email_audience_members WHERE demo_seed = 1)' : '0'} AS demo_members,
      ${schema.hasCampaigns ? '(SELECT COUNT(*) FROM dbo.marketing_email_campaigns)' : '0'} AS campaigns,
      ${schema.hasCampaigns && schema.hasCampaignDemoSeed ? '(SELECT COUNT(*) FROM dbo.marketing_email_campaigns WHERE demo_seed = 1)' : '0'} AS demo_campaigns,
      ${schema.hasCampaignRecipients ? '(SELECT COUNT(*) FROM dbo.marketing_email_campaign_recipients)' : '0'} AS recipients,
      ${schema.hasCampaignRecipients ? '(SELECT COUNT(*) FROM dbo.marketing_email_campaign_recipients WHERE demo_seed = 1)' : '0'} AS demo_recipients,
      ${schema.hasCampaignRecipients ? `(SELECT COUNT(*) FROM dbo.marketing_email_campaign_recipients WHERE campaign_id IN (SELECT campaign_id FROM dbo.marketing_email_campaigns WHERE campaign_key = N'${DEMO_CAMPAIGN_KEY.replace(/'/g, "''")}'))` : '0'} AS demo_campaign_snapshot_rows;
  `));
  const row = result.recordset?.[0] || {};
  return {
    members: Number(row.members || 0),
    demoMembers: Number(row.demo_members || 0),
    campaigns: Number(row.campaigns || 0),
    demoCampaigns: Number(row.demo_campaigns || 0),
    recipients: Number(row.recipients || 0),
    demoRecipients: Number(row.demo_recipients || 0),
    demoCampaignSnapshotRows: Number(row.demo_campaign_snapshot_rows || 0),
  };
}

router.get('/handrail', async (req, res) => {
  const operation = 'marketing-email-handrail';
  const startedAt = Date.now();
  const actor = getActor(req);
  const demoOnly = isDemoRequest(req);
  trackEvent('MarketingEmail.Handrail.Started', { operation, actor, demoOnly: String(demoOnly) });
  try {
    const projectConn = deriveProjectDataConnectionString();
    const schema = await readSchemaState(projectConn);
    const counts = await readMarketingEmailHandrailCounts(projectConn, schema);
    const allTablesReady = schema.hasStreams && schema.hasMembers && schema.hasCampaigns && schema.hasCampaignRecipients;
    const demoSeedReady = schema.hasMemberDemoSeed && schema.hasCampaignDemoSeed && counts.demoMembers > 0 && counts.demoCampaigns > 0 && counts.demoRecipients > 0;
    const stages = [
      {
        key: 'tables',
        label: 'Tables',
        status: allTablesReady ? 'ready' : 'blocked',
        detail: allTablesReady ? 'Four-table spine available' : 'Run the campaign recipients demo migration',
        count: Number(schema.hasStreams) + Number(schema.hasMembers) + Number(schema.hasCampaigns) + Number(schema.hasCampaignRecipients),
      },
      {
        key: 'demo-seed',
        label: 'Demo seed',
        status: demoSeedReady ? 'ready' : 'waiting',
        detail: demoSeedReady ? 'Demo member, campaign, and recipient snapshot are present' : 'Demo rows are not fully seeded yet',
        count: counts.demoMembers + counts.demoCampaigns + counts.demoRecipients,
      },
      {
        key: 'source-check',
        label: 'Source check',
        status: demoOnly ? 'ready' : 'waiting',
        detail: demoOnly ? 'Demo mode avoids live source reads' : 'Live source refresh is preview-only unless materialised explicitly',
        count: demoOnly ? counts.demoMembers : counts.members,
      },
      {
        key: 'proof',
        label: 'Proof tray',
        status: (demoOnly ? counts.demoMembers : counts.members) > 0 ? 'ready' : 'waiting',
        detail: 'Recipient proof reads from the membership spine',
        count: demoOnly ? counts.demoMembers : counts.members,
      },
      {
        key: 'campaign-lock',
        label: 'Campaign lock',
        status: schema.hasCampaignRecipients && (demoOnly ? counts.demoCampaignSnapshotRows : counts.recipients) > 0 ? 'ready' : 'waiting',
        detail: schema.hasCampaignRecipients ? 'Locks can snapshot recipient rows' : 'Recipient snapshot table is missing',
        count: demoOnly ? counts.demoCampaignSnapshotRows : counts.recipients,
      },
      {
        key: 'send-guard',
        label: 'Send guard',
        status: 'blocked',
        detail: 'Mass send remains disabled until approval, suppression, telemetry, and audit controls are built',
        count: 0,
      },
    ];
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.Handrail.Completed', { operation, actor, demoOnly: String(demoOnly), durationMs: String(durationMs), demoSeedReady: String(demoSeedReady) });
    trackMetric('MarketingEmail.Handrail.Duration', durationMs, { operation });
    return res.json({ ok: true, mode: demoOnly ? 'demo' : 'live', generatedAt: new Date().toISOString(), schema, counts, stages });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'handrail' });
    trackEvent('MarketingEmail.Handrail.Failed', { operation, actor, demoOnly: String(demoOnly), durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to load marketing email processing handrail' });
  }
});

module.exports = router;
