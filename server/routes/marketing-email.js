'use strict';


const crypto = require('crypto');
const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { getSecret } = require('../utils/getSecret');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { loadPersonalSignatureHtml, maybeWrapSignature, normalizeEmails } = require('../utils/helixEmail');
const { recordSubmission, recordStep, markComplete, markFailed } = require('../utils/formSubmissionLog');

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
  'careers@helix-law.com',
  'support@helix-law.com',
  'operations@helix-law.com',
  'lz@helix-law.com',
]);
const EMAIL_SENDGRID_SECRET_NAMES = [
  'sendgrid-helix-email',
  'sendgrid-api-key',
  'sendgrid-apikey',
  'sendgrid-api-token',
  'sendgrid-mail-api-key',
  'sendgrid-outreach-api-key',
  'email-outreach-sendgrid-api-key',
  'SendGridApiKey',
];
const EMAIL_SENDGRID_SIGNATURE_MODES = new Set(['data-hub-v2', 'legacy']);
const EMAIL_SENDGRID_BATCH_LIMIT = 200;
const EMAIL_SENDGRID_REPLY_TO_EMAIL = 'team@helix-law.com';
const EMAIL_SENDGRID_REPLY_TOKEN_PREFIX = 'HXR';
const ENQUIRY_PLATFORM_API_KEY = '2011';
const EMAIL_SENDGRID_REPLY_TOKEN_SUBSTITUTION = '-helix_reply_token-';
const EMAIL_SENDGRID_CAMPAIGN_ID_SUBSTITUTION = '-helix_campaign_id-';
const EMAIL_SENDGRID_RECIPIENT_ID_SUBSTITUTION = '-helix_recipient_id-';
const TAG_BLOCK_PATTERN = /\b(do\s*not\s*(send|email|market)|unsubscribe|unsubscribed|opt[\s-]*out|no\s*(email|marketing)|suppress|suppression|gdpr|privacy|spam|complaint|bounce|invalid\s*email)\b/i;
const DEMO_SOURCE_ENQUIRY_ID = 'DEMO-ENQ-0003';
const DEMO_CAMPAIGN_KEY = 'demo-marketing-email-setup';
let cachedSendGridApiKey = null;

const SOURCE_COLUMN_CANDIDATES = {
  id: ['id', 'ID'],
  acid: ['acid', 'ACID', 'ActiveCampaignId', 'activeCampaignId', 'active_campaign_id'],
  name: ['name', 'Name', 'full_name', 'Full_Name', 'FullName', 'contact_name', 'Contact_Name', 'ContactName'],
  firstName: ['first_name', 'First_Name', 'FirstName', 'first', 'First', 'forename', 'Forename'],
  lastName: ['last_name', 'Last_Name', 'LastName', 'last', 'Last', 'surname', 'Surname'],
  email: ['email', 'Email', 'Email_Address', 'email_address'],
  areaOfWork: ['aow', 'AOW', 'Area_of_Work', 'area_of_work', 'AreaOfWork', 'areaOfWork', 'Area'],
  tags: ['tags', 'Tags', 'tag', 'Tag'],
  datetime: ['datetime', 'DateTime', 'date_time', 'touchpoint_date', 'Touchpoint_Date', 'Date_Created', 'date_created', 'created_at', 'CreatedAt'],
};
const SOURCE_GROWTH_DATETIME_CANDIDATES = ['datetime', 'DateTime', 'date_time', 'Touchpoint_Date', 'touchpoint_date', 'Date_Created', 'date_created'];

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

function sourceNameSqlExpr(columns) {
  const nameColumn = pickColumn(columns, SOURCE_COLUMN_CANDIDATES.name);
  const firstNameColumn = pickColumn(columns, SOURCE_COLUMN_CANDIDATES.firstName);
  const lastNameColumn = pickColumn(columns, SOURCE_COLUMN_CANDIDATES.lastName);
  if (!nameColumn && !firstNameColumn && !lastNameColumn) return 'NULL';
  const directExpr = nameColumn ? trimSqlTextExpr(nameColumn, 180) : 'NULL';
  const firstExpr = firstNameColumn ? `TRY_CONVERT(nvarchar(90), e.${safeColumnRef(firstNameColumn)})` : `N''`;
  const lastExpr = lastNameColumn ? `TRY_CONVERT(nvarchar(90), e.${safeColumnRef(lastNameColumn)})` : `N''`;
  const combinedExpr = `NULLIF(LTRIM(RTRIM(CONCAT(COALESCE(${firstExpr}, N''), N' ', COALESCE(${lastExpr}, N'')))), N'')`;
  return `COALESCE(${directExpr}, ${combinedExpr})`;
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

function getActivityActor(actor) {
  return nullable(actor, 16) || 'api';
}

function textPresence(value) {
  const text = trim(value);
  return { present: Boolean(text), length: text.length };
}

function emailDomainOnly(value) {
  const email = normalizeEmails(value)[0] || '';
  return emailDomain(email) || null;
}

function buildCampaignActivityPayload(req, {
  lifecycle,
  campaignId = null,
  campaign = null,
  streamKey = null,
  demoOnly = false,
  dryRun = null,
  limit = null,
  requestId = null,
  counts = null,
  snapshot = null,
  provider = null,
  bodyText = null,
  requestSubject = null,
  bodyHashMatches = null,
  durationMs = null,
} = {}) {
  const effectiveCampaignId = campaignId || campaign?.campaign_id || campaign?.campaignId || null;
  const effectiveStreamKey = streamKey || campaign?.stream_key || campaign?.streamKey || null;
  const senderDomain = emailDomainOnly(campaign?.sender_email || campaign?.senderEmail || req.body?.senderEmail || req.body?.sender_email);
  return {
    method: req.method,
    path: trim(req.originalUrl || req.path).split('?')[0],
    lifecycle,
    requestId,
    campaignId: effectiveCampaignId,
    streamKey: effectiveStreamKey,
    status: campaign?.status || null,
    mode: demoOnly ? 'demo' : 'live',
    dryRun,
    limit,
    settings: {
      excludeClients: campaign?.exclude_clients == null && campaign?.excludeClients == null ? null : Boolean(campaign.exclude_clients ?? campaign.excludeClients),
      rankMin: campaign?.rank_min == null && campaign?.rankMin == null ? null : Number(campaign.rank_min ?? campaign.rankMin),
      rankMax: campaign?.rank_max == null && campaign?.rankMax == null ? null : Number(campaign.rank_max ?? campaign.rankMax),
      signatureMode: nullable(campaign?.signature_mode || campaign?.signatureMode || req.body?.signatureMode || req.body?.signature_mode, 60),
      senderDomain,
      senderAllowed: senderDomain ? EMAIL_SENDGRID_ALLOWED_SENDERS.has(`team@${senderDomain}`) || Array.from(EMAIL_SENDGRID_ALLOWED_SENDERS).some((sender) => sender.endsWith(`@${senderDomain}`)) : null,
    },
    content: {
      subject: textPresence(campaign?.subject || requestSubject || req.body?.subject),
      preheader: textPresence(campaign?.preheader || req.body?.preheader),
      body: textPresence(bodyText || req.body?.body || req.body?.bodyText),
      bodyHashMatches: bodyHashMatches == null ? null : Boolean(bodyHashMatches),
    },
    counts,
    snapshot,
    provider,
    durationMs,
  };
}

async function recordMarketingCampaignActivity(req, {
  actor,
  lifecycle,
  summary,
  payload,
  status = 'complete',
  stepName = 'marketing-email.campaign',
  error = null,
}) {
  const submissionId = await recordSubmission({
    formKey: 'activity.marketing-email-campaign',
    submittedBy: getActivityActor(actor),
    lane: 'Marketing',
    payload,
    summary,
    kind: 'activity',
  });
  await recordStep(submissionId, {
    name: stepName,
    status: status === 'failed' ? 'failed' : 'complete',
    error: error ? 'Marketing campaign activity failed' : null,
    output: {
      lifecycle,
      campaignId: payload?.campaignId || null,
      streamKey: payload?.streamKey || null,
      mode: payload?.mode || null,
      dryRun: payload?.dryRun ?? null,
      counts: payload?.counts || null,
      provider: payload?.provider || null,
    },
  });
  if (status === 'failed') {
    await markFailed(submissionId, { lastEvent: `${lifecycle}:failed`, error: error || 'Marketing campaign activity failed' });
  } else {
    await markComplete(submissionId, { lastEvent: `${lifecycle}:complete` });
  }
  return submissionId;
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

function connectionStringLooksRedacted(value) {
  const clean = trim(value);
  return !/\b(Server|Data Source)\s*=/i.test(clean) || /\*{3,}|<[^>]+>|redacted|required/i.test(clean);
}

async function getInstructionsConnectionString() {
  const conn = trim(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
  if (conn && !connectionStringLooksRedacted(conn)) return conn;

  const server = trim(process.env.INSTRUCTIONS_SQL_SERVER) || 'instructions.database.windows.net';
  const database = trim(process.env.INSTRUCTIONS_SQL_DATABASE) || 'instructions';
  const user = trim(process.env.INSTRUCTIONS_SQL_USER) || 'instructionsadmin';
  const secretName = trim(process.env.INSTRUCTIONS_SQL_PASSWORD_SECRET_NAME) || 'instructions-sql-password';
  const password = trim(await getSecret(secretName));
  if (!password) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING is not configured');
  const resolved = `Server=tcp:${server},1433;Initial Catalog=${database};Persist Security Info=False;User ID=${user};Password=${password};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
  process.env.INSTRUCTIONS_SQL_CONNECTION_STRING = resolved;
  return resolved;
}

function hashEmail(email) {
  const value = trim(email).toLowerCase();
  if (!value) return null;
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildCampaignReplyToken(campaignId, recipientId) {
  const campaign = trim(campaignId).toLowerCase();
  const recipient = trim(recipientId).toLowerCase();
  if (!campaign || !recipient) return '';
  const digest = crypto
    .createHash('sha256')
    .update(`marketing-email-reply:${campaign}:${recipient}`)
    .digest('base64url')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 14)
    .toUpperCase();
  return digest ? `${EMAIL_SENDGRID_REPLY_TOKEN_PREFIX}-${digest}` : '';
}

function emailDomain(email) {
  const value = trim(email).toLowerCase();
  const atIndex = value.lastIndexOf('@');
  return atIndex > 0 ? value.slice(atIndex + 1, atIndex + 161) : null;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normaliseCampaignReplyKey(value) {
  let text = trim(value).toLowerCase();
  if (!text) return '';
  while (/^(re|fw|fwd)\s*:/i.test(text)) text = text.replace(/^(re|fw|fwd)\s*:/i, '').trim();
  return text.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200);
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

function isNoSendRank(rank) {
  return rank === 5 || rank === 6 || rank === 7;
}

function isClientRank(rank) {
  return rank != null && rank < 4;
}

function noSendRankReason(rank) {
  if (rank === 5) return 'Rank 5 no marketing preference';
  if (rank === 6) return 'Rank 6 unsubscribe or dead contact';
  if (rank === 7) return 'Rank 7 bad apple';
  return 'No-send rank';
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
  if (isNoSendRank(rank)) return { status: 'suppressed', reason: noSendRankReason(rank), sendable: false };
  if (!LIVE_STREAM_KEYS.has(streamKey)) return { status: 'inspect', reason: 'Inspection stream only', sendable: false };
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
  if (isNoSendRank(rank)) return { status: 'suppressed', reason: noSendRankReason(rank), sendable: false };
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

function getEnquiryPlatformBaseUrl() {
  return trim(process.env.ENQUIRY_PLATFORM_BASE_URL) || 'https://enquiry-processing-v2.azurewebsites.net';
}

function getEnquiryPlatformApiKey() {
  return ENQUIRY_PLATFORM_API_KEY;
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

function normaliseSignatureMode(value) {
  const mode = trim(value).toLowerCase();
  return EMAIL_SENDGRID_SIGNATURE_MODES.has(mode) ? mode : 'data-hub-v2';
}

function escapeEmailHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainTextToEmailHtml(value) {
  const blocks = String(value || '')
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.length > 0
    ? blocks.map((block) => `<p style="font-family:Raleway,Arial,Helvetica,sans-serif;font-size:10pt;line-height:1.4;color:rgb(0,0,0);margin:0 0 12px 0;">${escapeEmailHtml(block).replace(/\n/g, '<br />')}</p>`).join('')
    : '';
}

function buildSendGridPreheaderHtml(value) {
  const preheader = trim(value);
  if (!preheader) return '';
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;">${escapeEmailHtml(preheader)}</div>`;
}

function buildHiddenReplyCorrelationHtml() {
  const token = EMAIL_SENDGRID_REPLY_TOKEN_SUBSTITUTION;
  const campaignId = EMAIL_SENDGRID_CAMPAIGN_ID_SUBSTITUTION;
  const recipientId = EMAIL_SENDGRID_RECIPIENT_ID_SUBSTITUTION;
  return `<!-- helix-reply-token:${token};campaign:${campaignId};recipient:${recipientId} --><span data-helix-reply-token="${token}" data-helix-campaign-id="${campaignId}" data-helix-recipient-id="${recipientId}" style="display:none!important;mso-hide:all;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;line-height:0;font-size:0;">helix-reply-token:${token}</span>`;
}

function stripEmailDocumentShell(html, bodyMarker) {
  const markerWrapper = `<div style="margin-bottom:12px;">${bodyMarker}</div>`;
  return String(html || '')
    .replace(/^\s*<!DOCTYPE[^>]*>/i, '')
    .replace(/^\s*<html\b[^>]*>/i, '')
    .replace(/^\s*<head\b[^>]*>[\s\S]*?<\/head>/i, '')
    .replace(/^\s*<body\b[^>]*>/i, '')
    .replace(/<\/body>\s*<\/html>\s*$/i, '')
    .replace(markerWrapper, '')
    .trim();
}

function buildSystemSignatureHtml() {
  const bodyMarker = '<span data-marketing-email-body-marker="1"></span>';
  return stripEmailDocumentShell(maybeWrapSignature(bodyMarker), bodyMarker);
}

function buildOutreachSignatureV2({ operatorEmail, signatureInitials }) {
  const signatureEmail = normalizeEmails(operatorEmail)[0] || '';
  const personalSignature = loadPersonalSignatureHtml({ signatureInitials, fromEmail: signatureEmail });
  return personalSignature || buildSystemSignatureHtml();
}

function buildSendGridEmailHtml({ bodyText, preheaderText, fromEmail, signatureInitials, signatureMode, operatorName, operatorEmail }) {
  const bodyHtml = `<div style="font-family:Raleway,Arial,Helvetica,sans-serif;font-size:10pt;line-height:1.4;color:rgb(0,0,0);">${plainTextToEmailHtml(bodyText)}</div>`;
  const preheaderHtml = buildSendGridPreheaderHtml(preheaderText);
  const replyCorrelationHtml = buildHiddenReplyCorrelationHtml();
  const resolvedSignatureMode = normaliseSignatureMode(signatureMode);
  if (resolvedSignatureMode === 'data-hub-v2') {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>Helix Email</title></head><body style="margin:0;padding:0;font-family:Raleway,Arial,Helvetica,sans-serif;font-size:10pt;line-height:1.4;color:rgb(0,0,0);">${preheaderHtml}${replyCorrelationHtml}${bodyHtml}${buildOutreachSignatureV2({ operatorName, operatorEmail, signatureInitials })}</body></html>`;
  }

  const personalSignature = loadPersonalSignatureHtml({ signatureInitials, fromEmail });
  return personalSignature && personalSignature.trim()
    ? `${preheaderHtml}${replyCorrelationHtml}${bodyHtml}<br />${personalSignature}`
    : maybeWrapSignature(`${preheaderHtml}${replyCorrelationHtml}${bodyHtml}`);
}

function normaliseSendLimit(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return EMAIL_SENDGRID_BATCH_LIMIT;
  return Math.max(1, Math.min(parsed, EMAIL_SENDGRID_BATCH_LIMIT));
}

function safeProviderError(value) {
  const message = trim(value);
  if (!message) return 'SendGrid rejected request without body';
  return message.slice(0, 500).replace(/[\r\n]+/g, ' ');
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
        CASE WHEN COL_LENGTH(N'dbo.marketing_email_campaigns', N'demo_seed') IS NULL THEN 0 ELSE 1 END AS has_campaign_demo_seed,
        CASE WHEN COL_LENGTH(N'dbo.marketing_email_campaign_recipients', N'provider_status') IS NULL THEN 0 ELSE 1 END AS has_campaign_recipient_provider_status,
        CASE WHEN COL_LENGTH(N'dbo.marketing_email_campaign_recipients', N'provider_error') IS NULL THEN 0 ELSE 1 END AS has_campaign_recipient_provider_error,
        CASE WHEN COL_LENGTH(N'dbo.marketing_email_campaign_recipients', N'sendgrid_message_id') IS NULL THEN 0 ELSE 1 END AS has_campaign_recipient_sendgrid_message_id;
  `));
  const row = result.recordset?.[0] || {};
  return {
    hasStreams: Boolean(row.has_streams),
    hasMembers: Boolean(row.has_members),
    hasCampaigns: Boolean(row.has_campaigns),
    hasCampaignRecipients: Boolean(row.has_campaign_recipients),
    hasMemberDemoSeed: Boolean(row.has_member_demo_seed),
    hasCampaignDemoSeed: Boolean(row.has_campaign_demo_seed),
    hasCampaignRecipientProviderColumns: Boolean(row.has_campaign_recipient_provider_status && row.has_campaign_recipient_provider_error && row.has_campaign_recipient_sendgrid_message_id),
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
  const instructionsConn = await getInstructionsConnectionString();
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

async function readMemberStatusWeeklyGrowthRows(projectConn, streamKey) {
  return withRequest(projectConn, async (request) => {
    request.input('streamKey', sql.NVarChar(40), streamKey);
    const result = await request.query(`
      WITH weekly_rows AS (
        SELECT
          DATEADD(day, (DATEDIFF(day, 0, CONVERT(date, last_seen_at)) / 7) * 7, 0) AS week_start,
          SUM(CASE WHEN sendable = 1 THEN 1 ELSE 0 END) AS sendable_count,
          SUM(CASE WHEN sendable = 0 AND qualification_status IN (N'suppressed', N'blocked') THEN 1 ELSE 0 END) AS suppression_count,
          SUM(CASE WHEN sendable = 0 AND (qualification_status NOT IN (N'suppressed', N'blocked') OR qualification_status IS NULL) THEN 1 ELSE 0 END) AS held_count,
          COUNT_BIG(*) AS total_count
        FROM dbo.marketing_email_audience_members WITH (NOLOCK)
        WHERE stream_key = @streamKey
          AND last_seen_at IS NOT NULL
        GROUP BY DATEADD(day, (DATEDIFF(day, 0, CONVERT(date, last_seen_at)) / 7) * 7, 0)
      )
      SELECT
        week_start,
        sendable_count,
        suppression_count,
        held_count,
        total_count
      FROM weekly_rows
      ORDER BY week_start ASC;
    `);
    return result.recordset || [];
  });
}

function startOfIsoWeekIso(day) {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - weekday + 1);
  return date.toISOString().slice(0, 10);
}

function getFinancialYearStartIso(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return `${month >= 3 ? year : year - 1}-04-01`;
}

function addDaysIso(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function readSourceWeeklyGrowthRows(streamKey, { startIso, endExclusiveIso } = {}) {
  const instructionsConn = await getInstructionsConnectionString();
  const columns = await getSourceColumns(instructionsConn);
  const picked = {
    id: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.id),
    acid: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.acid),
    email: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.email),
    areaOfWork: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.areaOfWork),
    tags: pickColumn(columns, SOURCE_COLUMN_CANDIDATES.tags),
    datetime: pickColumn(columns, SOURCE_GROWTH_DATETIME_CANDIDATES),
  };
  if (!picked.email) throw new Error('No email column found on dbo.enquiries');
  if (!picked.datetime) throw new Error('No enquiry datetime column found on dbo.enquiries');

  const idExpr = picked.id ? `TRY_CONVERT(nvarchar(120), e.${safeColumnRef(picked.id)})` : 'NULL';
  const acidExpr = picked.acid ? trimSqlTextExpr(picked.acid, 120) : 'NULL';
  const emailExpr = trimSqlTextExpr(picked.email, 320);
  const areaExpr = picked.areaOfWork ? trimSqlTextExpr(picked.areaOfWork, 160) : 'NULL';
  const tagsExpr = picked.tags ? `TRY_CONVERT(nvarchar(max), e.${safeColumnRef(picked.tags)})` : 'NULL';
  const datetimeExpr = `TRY_CONVERT(datetime2, e.${safeColumnRef(picked.datetime)})`;
  const rows = await withRequest(instructionsConn, async (request) => {
    const dateFilters = [];
    if (startIso) {
      request.input('dateFrom', sql.DateTime2, new Date(`${startIso}T00:00:00Z`));
      dateFilters.push(`${datetimeExpr} >= @dateFrom`);
    }
    if (endExclusiveIso) {
      request.input('dateToExclusive', sql.DateTime2, new Date(`${endExclusiveIso}T00:00:00Z`));
      dateFilters.push(`${datetimeExpr} < @dateToExclusive`);
    }
    const dateWhere = dateFilters.length ? `\n        AND ${dateFilters.join('\n        AND ')}` : '';
    const result = await request.query(`
      SELECT
        ${idExpr} AS source_enquiry_id,
        ${acidExpr} AS acid,
        ${emailExpr} AS email,
        ${areaExpr} AS area_of_work,
        ${tagsExpr} AS tags_text,
        ${datetimeExpr} AS enquiry_at,
        NULL AS matter_id
      FROM dbo.enquiries AS e WITH (NOLOCK)
      WHERE ${emailExpr} IS NOT NULL
        AND ${datetimeExpr} IS NOT NULL
        ${dateWhere}
      ORDER BY ${datetimeExpr} DESC${picked.id ? `, e.${safeColumnRef(picked.id)} DESC` : ''};
    `);
    return result.recordset || [];
  });
  const weekly = new Map();

  for (const row of rows) {
    const member = toMemberRecord(row);
    if (member.streamKey !== streamKey) continue;
    if (!member.touchpointAt) continue;
    const day = member.touchpointAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const weekStart = startOfIsoWeekIso(day);
    if (!weekStart) continue;

    const bucket = weekly.get(weekStart) || { week_start: weekStart, sendable_count: 0, suppression_count: 0, held_count: 0, total_count: 0 };
    if (member.sendable) {
      bucket.sendable_count += 1;
    } else if (member.qualificationStatus === 'suppressed' || member.qualificationStatus === 'blocked') {
      bucket.suppression_count += 1;
    } else {
      bucket.held_count += 1;
    }
    bucket.total_count += 1;
    weekly.set(weekStart, bucket);
  }

  return {
    rows: Array.from(weekly.values()).sort((left, right) => (left.week_start < right.week_start ? -1 : 1)),
    dateColumn: picked.datetime,
  };
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
  const client = Boolean(matterId) || isClientRank(rank);
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
          [rank] = source.[rank],
          tags_json = source.tags_json,
          client = source.client,
          matter_id = source.matter_id,
          client_status = source.client_status,
          qualification_status = source.qualification_status,
          qualification_reason = source.qualification_reason,
          sendable = source.sendable,
          last_seen_at = COALESCE(TRY_CONVERT(datetime2, source.touchpoint_at), target.last_seen_at, SYSUTCDATETIME()),
          last_qualified_at = SYSUTCDATETIME(),
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
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
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
        created_at,
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
  return Number.isInteger(number) && number >= 0 && number <= 4 ? number : null;
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

function mapMemberCampaignHistoryRow(row) {
  const recipientId = trim(row.recipient_id);
  const campaignId = trim(row.campaign_id);
  return {
    historyId: `campaign:${recipientId}`,
    kind: 'campaign-email',
    recipientId,
    campaignId,
    campaignKey: trim(row.campaign_key),
    streamKey: trim(row.stream_key),
    campaignName: trim(row.campaign_name),
    subject: trim(row.subject),
    senderEmail: trim(row.sender_email),
    sourceEnquiryId: trim(row.source_enquiry_id),
    activeCampaignId: trim(row.acid),
    replyToken: buildCampaignReplyToken(campaignId, recipientId),
    campaignStatus: trim(row.campaign_status),
    selectionStatus: trim(row.selection_status),
    selectionReason: trim(row.selection_reason),
    sendStatus: trim(row.send_status),
    providerStatus: trim(row.provider_status),
    sendgridMessageId: trim(row.sendgrid_message_id),
    snapshotAt: row.snapshot_at ? new Date(row.snapshot_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    lockedAt: row.locked_at ? new Date(row.locked_at).toISOString() : null,
    sentAt: row.recipient_sent_at ? new Date(row.recipient_sent_at).toISOString() : null,
    campaignSentAt: row.campaign_sent_at ? new Date(row.campaign_sent_at).toISOString() : null,
    sentBy: trim(row.sent_by),
  };
}

function getFirstField(source, names) {
  for (const name of names) {
    if (source && Object.prototype.hasOwnProperty.call(source, name)) return source[name];
  }
  return null;
}

function normaliseReplyActionRow(row) {
  const matchConfidence = Number(getFirstField(row, ['matchConfidence', 'MatchConfidence', 'confidence', 'Confidence']));
  const rawNeedsReview = getFirstField(row, ['needsReview', 'NeedsReview']);
  return {
    actionId: trim(getFirstField(row, ['id', 'Id', 'actionId', 'ActionId'])),
    campaignId: trim(getFirstField(row, ['campaignId', 'CampaignId'])),
    campaignKey: trim(getFirstField(row, ['campaignKey', 'CampaignKey'])),
    recipientId: trim(getFirstField(row, ['recipientId', 'RecipientId'])),
    sourceEnquiryId: trim(getFirstField(row, ['sourceEnquiryId', 'SourceEnquiryId'])),
    activeCampaignId: trim(getFirstField(row, ['activeCampaignId', 'ActiveCampaignId', 'acid', 'ACID'])),
    streamKey: trim(getFirstField(row, ['streamKey', 'StreamKey'])),
    senderEmailHash: trim(getFirstField(row, ['senderEmailHash', 'SenderEmailHash'])).toLowerCase(),
    senderEmailDomain: trim(getFirstField(row, ['senderEmailDomain', 'SenderEmailDomain'])).toLowerCase(),
    actionType: trim(getFirstField(row, ['actionType', 'ActionType'])) || 'reply',
    sentiment: trim(getFirstField(row, ['sentiment', 'Sentiment'])) || 'Unknown',
    matchSource: trim(getFirstField(row, ['matchSource', 'MatchSource', 'campaignResolutionSource', 'CampaignResolutionSource'])),
    matchConfidence: Number.isFinite(matchConfidence) ? matchConfidence : null,
    needsReview: typeof rawNeedsReview === 'string' ? ['1', 'true', 'yes'].includes(rawNeedsReview.trim().toLowerCase()) : Boolean(rawNeedsReview),
    receivedAt: toIsoOrNull(getFirstField(row, ['receivedAtUtc', 'ReceivedAtUtc', 'receivedAt', 'ReceivedAt'])),
    createdAt: toIsoOrNull(getFirstField(row, ['createdAt', 'CreatedAt'])),
  };
}

function extractReplyActionRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return ['actions', 'replyActions', 'items', 'results', 'data']
    .map((key) => payload[key])
    .find((value) => Array.isArray(value)) || [];
}

function buildReplyActionLookupRows(rows) {
  return (rows || []).map((row) => ({
    recipientId: trim(row.recipient_id),
    campaignId: trim(row.campaign_id),
    campaignKey: trim(row.campaign_key),
    campaignKeyNormalised: normaliseCampaignReplyKey(row.campaign_key),
    sourceEnquiryId: trim(row.source_enquiry_id),
    activeCampaignId: trim(row.acid),
    streamKey: trim(row.stream_key),
    emailHash: trim(row.email_hash).toLowerCase(),
    emailDomain: trim(row.email_domain).toLowerCase(),
    replyToken: buildCampaignReplyToken(row.campaign_id, row.recipient_id).toLowerCase(),
    campaignName: trim(row.campaign_name),
    campaignNameKey: normaliseCampaignReplyKey(row.campaign_name),
    senderEmail: trim(row.sender_email),
    subject: trim(row.subject),
    subjectKey: normaliseCampaignReplyKey(row.subject),
  }));
}

function replyMatch(row, source, confidence) {
  return { row, source, confidence };
}

function findSingleReplySubjectMatch(campaignKey, lookupRows) {
  if (!campaignKey) return null;
  const matches = lookupRows.filter((row) => (
    row.campaignKeyNormalised === campaignKey
    || row.subjectKey === campaignKey
    || row.campaignNameKey === campaignKey
  ));
  return matches.length === 1 ? matches[0] : null;
}

function findReplyActionCampaignMatch(action, lookupRows) {
  const recipientId = trim(action.recipientId).toLowerCase();
  const campaignId = trim(action.campaignId).toLowerCase();
  const sourceEnquiryId = trim(action.sourceEnquiryId).toLowerCase();
  const activeCampaignId = trim(action.activeCampaignId).toLowerCase();
  const rawCampaignKey = trim(action.campaignKey).toLowerCase().replace(/[\[\]]/g, '');
  const campaignKey = normaliseCampaignReplyKey(action.campaignKey);
  const senderHash = trim(action.senderEmailHash).toLowerCase();
  const senderDomain = trim(action.senderEmailDomain).toLowerCase();
  const exactRecipient = lookupRows.find((row) => recipientId && row.recipientId.toLowerCase() === recipientId);
  if (exactRecipient) return replyMatch(exactRecipient, 'explicit-recipient', 1);
  const exactToken = lookupRows.find((row) => rawCampaignKey && row.replyToken && row.replyToken === rawCampaignKey);
  if (exactToken) return replyMatch(exactToken, 'reply-token', 1);
  const exactCampaign = lookupRows.find((row) => campaignId && row.campaignId.toLowerCase() === campaignId);
  if (exactCampaign) return replyMatch(exactCampaign, 'explicit-campaign', 0.96);
  const subjectMatch = findSingleReplySubjectMatch(campaignKey, lookupRows);
  if (subjectMatch) return replyMatch(subjectMatch, 'subject-recipient-stream', 0.86);
  const exactSource = lookupRows.find((row) => sourceEnquiryId && row.sourceEnquiryId.toLowerCase() === sourceEnquiryId);
  if (exactSource) return replyMatch(exactSource, 'source-enquiry-recipient', 0.78);
  const exactActiveCampaign = lookupRows.find((row) => activeCampaignId && row.activeCampaignId.toLowerCase() === activeCampaignId);
  if (exactActiveCampaign) return replyMatch(exactActiveCampaign, 'active-campaign-recipient', 0.76);
  const campaignMatches = lookupRows.filter((row) => !campaignId || row.campaignId.toLowerCase() === campaignId);
  if (senderHash) {
    const hashMatch = campaignMatches.find((row) => row.emailHash && row.emailHash === senderHash);
    if (hashMatch) return replyMatch(hashMatch, 'sender-hash-recipient', 0.72);
  }
  if (senderDomain) {
    const domainMatches = campaignMatches.filter((row) => row.emailDomain && row.emailDomain === senderDomain);
    if (domainMatches.length === 1) return replyMatch(domainMatches[0], 'sender-domain-recipient', 0.62);
  }
  return null;
}

function mapCampaignReplyActionToHistory(action, lookupRows) {
  const matchResult = findReplyActionCampaignMatch(action, lookupRows);
  if (!matchResult) return null;
  const match = matchResult.row;
  const eventAt = action.receivedAt || action.createdAt || null;
  const matchSource = action.matchSource || matchResult.source;
  return {
    historyId: `reply:${action.actionId || match.recipientId}:${eventAt || 'unknown'}`,
    kind: 'campaign-reply',
    recipientId: match.recipientId,
    campaignId: action.campaignId || match.campaignId,
    campaignKey: action.campaignKey || match.campaignKey,
    streamKey: action.streamKey || match.streamKey,
    campaignName: match.campaignName,
    subject: match.subject,
    senderEmail: match.senderEmail,
    sourceEnquiryId: action.sourceEnquiryId || match.sourceEnquiryId,
    activeCampaignId: action.activeCampaignId || match.activeCampaignId,
    replyToken: match.replyToken.toUpperCase(),
    campaignStatus: 'reply_received',
    selectionStatus: 'reply',
    selectionReason: '',
    sendStatus: 'reply_received',
    providerStatus: action.needsReview ? 'needs_review' : matchSource,
    sendgridMessageId: '',
    snapshotAt: null,
    createdAt: action.createdAt,
    lockedAt: null,
    sentAt: null,
    campaignSentAt: null,
    receivedAt: eventAt,
    sentBy: '',
    actionType: action.actionType,
    sentiment: action.sentiment,
    matchSource,
    matchConfidence: action.matchConfidence ?? matchResult.confidence,
    needsReview: action.needsReview,
  };
}

function sortCampaignHistory(items) {
  return items.sort((left, right) => {
    const leftAt = left.receivedAt || left.sentAt || left.campaignSentAt || left.lockedAt || left.snapshotAt || left.createdAt || '';
    const rightAt = right.receivedAt || right.sentAt || right.campaignSentAt || right.lockedAt || right.snapshotAt || right.createdAt || '';
    return rightAt.localeCompare(leftAt);
  });
}

async function readCampaignReplyActionsForMember(rows, { streamKey }) {
  const lookupRows = buildReplyActionLookupRows(rows);
  if (!lookupRows.length) return [];
  const apiKey = getEnquiryPlatformApiKey();
  if (!apiKey) return [];
  const params = new URLSearchParams();
  const addCsv = (name, values) => {
    const unique = [...new Set(values.map((value) => trim(value)).filter(Boolean))];
    if (unique.length) params.set(name, unique.slice(0, 40).join(','));
  };
  params.set('limit', '120');
  params.set('streamKey', streamKey);
  addCsv('campaignIds', lookupRows.map((row) => row.campaignId));
  addCsv('campaignKeys', lookupRows.flatMap((row) => [row.campaignKey, row.campaignKeyNormalised, row.subjectKey, row.campaignNameKey, row.replyToken]));
  addCsv('recipientIds', lookupRows.map((row) => row.recipientId));
  addCsv('sourceEnquiryIds', lookupRows.map((row) => row.sourceEnquiryId));
  addCsv('activeCampaignIds', lookupRows.map((row) => row.activeCampaignId));
  addCsv('senderEmailHashes', lookupRows.map((row) => row.emailHash));
  addCsv('senderEmailDomains', lookupRows.map((row) => row.emailDomain));
  const url = `${getEnquiryPlatformBaseUrl().replace(/\/$/, '')}/api/campaign-reply-actions?${params.toString()}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'x-api-key': apiKey,
    },
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    trackEvent('MarketingEmail.MemberCampaignHistory.ReplyActionsUpstreamFailed', { streamKey, status: String(response.status) });
    return [];
  }
  return extractReplyActionRows(payload)
    .map(normaliseReplyActionRow)
    .map((action) => mapCampaignReplyActionToHistory(action, lookupRows))
    .filter(Boolean);
}

async function readCampaignForSend(projectConn, campaignId, schema) {
  const result = await withRequest(projectConn, async (request) => {
    request.input('campaignId', sql.UniqueIdentifier, campaignId);
    return request.query(`
      SELECT TOP 1
        CONVERT(nvarchar(36), campaign_id) AS campaign_id,
        campaign_key,
        stream_key,
        status,
        campaign_name,
        subject,
        preheader,
        body_hash,
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
        sent_by${schema.hasCampaignDemoSeed ? ', demo_seed' : ''}
      FROM dbo.marketing_email_campaigns
      WHERE campaign_id = @campaignId;
    `);
  });
  return result.recordset?.[0] || null;
}

async function readCampaignRecipientStatusCounts(projectConn, campaignId) {
  const result = await withRequest(projectConn, async (request) => {
    request.input('campaignId', sql.UniqueIdentifier, campaignId);
    return request.query(`
      SELECT
        SUM(CASE WHEN selection_status = N'selected' THEN 1 ELSE 0 END) AS selected_count,
        SUM(CASE WHEN selection_status = N'selected' AND send_status = N'not_sent' THEN 1 ELSE 0 END) AS not_sent_count,
        SUM(CASE WHEN selection_status = N'selected' AND send_status = N'sending' THEN 1 ELSE 0 END) AS sending_count,
        SUM(CASE WHEN selection_status = N'selected' AND send_status = N'sent' THEN 1 ELSE 0 END) AS sent_count,
        SUM(CASE WHEN selection_status = N'selected' AND send_status = N'skipped' THEN 1 ELSE 0 END) AS skipped_count,
        SUM(CASE WHEN selection_status = N'selected' AND send_status = N'failed' THEN 1 ELSE 0 END) AS failed_count
      FROM dbo.marketing_email_campaign_recipients
      WHERE campaign_id = @campaignId;
    `);
  });
  const row = result.recordset?.[0] || {};
  return {
    selectedCount: Number(row.selected_count || 0),
    notSentCount: Number(row.not_sent_count || 0),
    sendingCount: Number(row.sending_count || 0),
    sentCount: Number(row.sent_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    failedCount: Number(row.failed_count || 0),
  };
}

async function readCampaignSendRows(projectConn, { campaignId, limit, demoOnly = false, schema }) {
  if (!schema.hasCampaignRecipients) return [];
  if (demoOnly && !schema.hasCampaignDemoSeed) return [];
  const result = await withRequest(projectConn, async (request) => {
    request.input('campaignId', sql.UniqueIdentifier, campaignId);
    request.input('limit', sql.Int, normaliseSendLimit(limit));
    return request.query(`
      SELECT TOP (@limit)
        CONVERT(nvarchar(36), recipient_id) AS recipient_id,
        CONVERT(nvarchar(36), member_id) AS member_id,
        stream_key,
        acid,
        source_enquiry_id,
        email_hash,
        email_domain,
        area_of_work,
        [rank]
      FROM dbo.marketing_email_campaign_recipients
      WHERE campaign_id = @campaignId
        AND selection_status = N'selected'
        AND send_status = N'not_sent'
        ${demoOnly ? 'AND demo_seed = 1' : ''}
      ORDER BY snapshot_at ASC, created_at ASC, recipient_id ASC;
    `);
  });
  return result.recordset || [];
}

async function readMemberCampaignHistory(projectConn, { streamKey, memberId, demoOnly = false, schema }) {
  if (!schema.hasCampaigns || !schema.hasCampaignRecipients) return [];
  if (demoOnly && !schema.hasCampaignDemoSeed) return [];
  const providerStatusExpr = schema.hasCampaignRecipientProviderColumns ? 'r.provider_status' : 'CAST(NULL AS nvarchar(80))';
  const sendGridMessageExpr = schema.hasCampaignRecipientProviderColumns ? 'r.sendgrid_message_id' : 'CAST(NULL AS nvarchar(180))';
  const result = await withRequest(projectConn, async (request) => {
    request.input('streamKey', sql.NVarChar(40), streamKey);
    request.input('memberId', sql.UniqueIdentifier, memberId);
    return request.query(`
      SELECT TOP 24
        CONVERT(nvarchar(36), r.recipient_id) AS recipient_id,
        CONVERT(nvarchar(36), c.campaign_id) AS campaign_id,
        c.campaign_key,
        c.stream_key,
        c.campaign_name,
        c.subject,
        c.sender_email,
        r.source_enquiry_id,
        r.acid,
        r.email_hash,
        r.email_domain,
        c.status AS campaign_status,
        r.selection_status,
        r.selection_reason,
        r.send_status,
        ${providerStatusExpr} AS provider_status,
        ${sendGridMessageExpr} AS sendgrid_message_id,
        r.snapshot_at,
        r.created_at,
        c.locked_at,
        r.sent_at AS recipient_sent_at,
        c.sent_at AS campaign_sent_at,
        c.sent_by
      FROM dbo.marketing_email_campaign_recipients AS r
      INNER JOIN dbo.marketing_email_campaigns AS c ON c.campaign_id = r.campaign_id
      WHERE r.member_id = @memberId
        AND r.stream_key = @streamKey
        ${demoOnly ? 'AND r.demo_seed = 1 AND c.demo_seed = 1' : ''}
      ORDER BY COALESCE(r.sent_at, c.sent_at, c.locked_at, r.snapshot_at, c.created_at, r.created_at) DESC;
    `);
  });
  return result.recordset || [];
}

async function resolveRecipientEmailHashes(sourceIds = []) {
  const uniqueIds = [...new Set((sourceIds || []).map((id) => nullable(id, 120)).filter(Boolean))];
  if (!uniqueIds.length) return new Map();
  const instructionsConn = await getInstructionsConnectionString();
  const columns = await getSourceColumns(instructionsConn);
  const idColumn = pickColumn(columns, SOURCE_COLUMN_CANDIDATES.id);
  const emailColumn = pickColumn(columns, SOURCE_COLUMN_CANDIDATES.email);
  if (!idColumn || !emailColumn) throw new Error('Unable to resolve campaign recipient emails from dbo.enquiries');

  const idExpr = `TRY_CONVERT(nvarchar(120), e.${safeColumnRef(idColumn)})`;
  const emailExpr = trimSqlTextExpr(emailColumn, 320);
  const payload = uniqueIds.map((sourceEnquiryId) => ({ sourceEnquiryId }));
  const result = await withRequest(instructionsConn, async (request) => {
    request.input('sourceJson', sql.NVarChar(sql.MAX), JSON.stringify(payload));
    return request.query(`
      WITH wanted AS (
        SELECT source_enquiry_id
        FROM OPENJSON(@sourceJson) WITH (source_enquiry_id NVARCHAR(120) '$.sourceEnquiryId')
      )
      SELECT
        w.source_enquiry_id,
        ${emailExpr} AS email
      FROM wanted AS w
      INNER JOIN dbo.enquiries AS e WITH (NOLOCK)
        ON ${idExpr} = w.source_enquiry_id
      WHERE ${emailExpr} IS NOT NULL;
    `);
  });
  const emails = new Map();
  for (const row of result.recordset || []) {
    const email = normalizeEmails(row.email)[0] || '';
    if (email) emails.set(trim(row.source_enquiry_id), email);
  }
  return emails;
}

async function resolveSourceNames(members) {
  const wantedMembers = (members || [])
    .map((member) => ({
      sourceEnquiryId: nullable(member.source_enquiry_id || member.sourceEnquiryId, 120),
      acid: nullable(member.acid, 120),
    }))
    .filter((member) => member.sourceEnquiryId || member.acid);
  if (!wantedMembers.length) return new Map();
  const instructionsConn = await getInstructionsConnectionString();
  const columns = await getSourceColumns(instructionsConn);
  const idColumn = pickColumn(columns, SOURCE_COLUMN_CANDIDATES.id);
  const acidColumn = pickColumn(columns, SOURCE_COLUMN_CANDIDATES.acid);
  const nameExpr = sourceNameSqlExpr(columns);
  if ((!idColumn && !acidColumn) || nameExpr === 'NULL') return new Map();

  const idExpr = idColumn ? `TRY_CONVERT(nvarchar(120), e.${safeColumnRef(idColumn)})` : 'NULL';
  const acidExpr = acidColumn ? `TRY_CONVERT(nvarchar(120), e.${safeColumnRef(acidColumn)})` : 'NULL';
  const payload = wantedMembers;
  const result = await withRequest(instructionsConn, async (request) => {
    request.input('sourceJson', sql.NVarChar(sql.MAX), JSON.stringify(payload));
    return request.query(`
      WITH wanted AS (
        SELECT source_enquiry_id, acid
        FROM OPENJSON(@sourceJson) WITH (
          source_enquiry_id NVARCHAR(120) '$.sourceEnquiryId',
          acid NVARCHAR(120) '$.acid'
        )
      ), matched AS (
        SELECT
          w.source_enquiry_id,
          w.acid,
          ${nameExpr} AS contact_name
        FROM wanted AS w
        INNER JOIN dbo.enquiries AS e WITH (NOLOCK)
          ON (${idExpr} = w.source_enquiry_id)
          OR (w.acid IS NOT NULL AND ${acidExpr} = w.acid)
        WHERE ${nameExpr} IS NOT NULL
      )
      SELECT
        COALESCE(source_enquiry_id, acid) AS lookup_key,
        MAX(contact_name) AS contact_name
      FROM matched
      GROUP BY COALESCE(source_enquiry_id, acid);
    `);
  });
  const names = new Map();
  for (const row of result.recordset || []) {
    const contactName = nullable(row.contact_name, 180);
    if (contactName) names.set(trim(row.lookup_key), contactName);
  }
  return names;
}

async function buildCampaignSendPlan(projectConn, { campaignId, limit, demoOnly = false, schema }) {
  const campaign = await readCampaignForSend(projectConn, campaignId, schema);
  if (!campaign) return { campaign: null, effectiveDemoOnly: demoOnly, rows: [], ready: [], skipped: [] };
  const effectiveDemoOnly = demoOnly || Boolean(campaign.demo_seed);
  const rows = await readCampaignSendRows(projectConn, { campaignId, limit, demoOnly: effectiveDemoOnly, schema });
  const sourceEmails = effectiveDemoOnly ? new Map() : await resolveSourceEmails(rows.map((row) => row.source_enquiry_id));
  const seenEmails = new Set();
  const ready = [];
  const skipped = [];

  for (const row of rows) {
    const recipientId = trim(row.recipient_id);
    const sourceEnquiryId = trim(row.source_enquiry_id);
    const resolvedEmail = normalizeEmails(sourceEmails.get(sourceEnquiryId))[0] || '';
    if (!resolvedEmail) {
      skipped.push({ recipientId, providerError: 'Recipient email unavailable from source enquiry' });
      continue;
    }
    const resolvedHash = hashEmail(resolvedEmail);
    const resolvedDomain = emailDomain(resolvedEmail);
    if (row.email_hash && resolvedHash !== trim(row.email_hash).toLowerCase()) {
      skipped.push({ recipientId, providerError: 'Recipient email hash mismatch' });
      continue;
    }
    if (row.email_domain && resolvedDomain !== trim(row.email_domain).toLowerCase()) {
      skipped.push({ recipientId, providerError: 'Recipient email domain mismatch' });
      continue;
    }
    const emailKey = resolvedEmail.toLowerCase();
    if (seenEmails.has(emailKey)) {
      skipped.push({ recipientId, providerError: 'Duplicate recipient email in batch' });
      continue;
    }
    seenEmails.add(emailKey);
    ready.push({
      recipientId,
      email: resolvedEmail,
      sourceEnquiryId,
      acid: trim(row.acid),
      streamKey: trim(row.stream_key),
      areaOfWork: trim(row.area_of_work),
    });
  }

  return { campaign, effectiveDemoOnly, rows, ready, skipped };
}

async function updateCampaignRecipientStatuses(projectConn, recipients, { sendStatus, providerStatus, providerError = null, sendGridMessageId = null, actor, sent = false }) {
  if (!recipients.length) return 0;
  const payload = recipients.map((recipient) => ({
    recipientId: recipient.recipientId,
    providerError: safeProviderError(recipient.providerError || providerError || ''),
  }));
  const result = await withRequest(projectConn, async (request) => {
    request.input('recipientsJson', sql.NVarChar(sql.MAX), JSON.stringify(payload));
    request.input('sendStatus', sql.NVarChar(40), sendStatus);
    request.input('providerStatus', sql.NVarChar(80), providerStatus);
    request.input('sendGridMessageId', sql.NVarChar(180), nullable(sendGridMessageId, 180));
    request.input('sent', sql.Bit, Boolean(sent));
    request.input('actor', sql.NVarChar(160), actor || 'api');
    return request.query(`
      WITH source_rows AS (
        SELECT *
        FROM OPENJSON(@recipientsJson) WITH (
          recipient_id UNIQUEIDENTIFIER '$.recipientId',
          provider_error NVARCHAR(500) '$.providerError'
        )
      )
      UPDATE target
      SET send_status = @sendStatus,
          sendgrid_message_id = COALESCE(@sendGridMessageId, target.sendgrid_message_id),
          provider_status = @providerStatus,
          provider_error = NULLIF(source.provider_error, N''),
          sent_at = CASE WHEN @sent = 1 THEN SYSUTCDATETIME() ELSE target.sent_at END,
          updated_at = SYSUTCDATETIME(),
          updated_by = @actor
      FROM dbo.marketing_email_campaign_recipients AS target
      INNER JOIN source_rows AS source ON source.recipient_id = target.recipient_id;
    `);
  });
  return Number(result.rowsAffected?.reduce((sum, count) => sum + count, 0) || 0);
}

async function updateCampaignSendSummary(projectConn, { campaignId, actor, sendGridMessageId }) {
  const result = await withRequest(projectConn, async (request) => {
    request.input('campaignId', sql.UniqueIdentifier, campaignId);
    request.input('actor', sql.NVarChar(160), actor || 'api');
    request.input('sendGridMessageId', sql.NVarChar(180), nullable(sendGridMessageId, 180));
    return request.query(`
      UPDATE campaign
        SET sent_count = COALESCE(status_counts.sent_count, 0),
          status = CASE WHEN COALESCE(status_counts.remaining_count, 0) = 0 AND COALESCE(status_counts.sent_count, 0) > 0 THEN N'sent' ELSE N'locked' END,
          sendgrid_message_id = COALESCE(@sendGridMessageId, campaign.sendgrid_message_id),
          sent_at = CASE WHEN COALESCE(status_counts.remaining_count, 0) = 0 AND COALESCE(status_counts.sent_count, 0) > 0 THEN COALESCE(campaign.sent_at, SYSUTCDATETIME()) ELSE campaign.sent_at END,
          sent_by = CASE WHEN COALESCE(status_counts.remaining_count, 0) = 0 AND COALESCE(status_counts.sent_count, 0) > 0 THEN COALESCE(campaign.sent_by, @actor) ELSE campaign.sent_by END,
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
      FROM dbo.marketing_email_campaigns AS campaign
      CROSS APPLY (
        SELECT
          SUM(CASE WHEN selection_status = N'selected' AND send_status = N'sent' THEN 1 ELSE 0 END) AS sent_count,
          SUM(CASE WHEN selection_status = N'selected' AND send_status = N'not_sent' THEN 1 ELSE 0 END) AS remaining_count
        FROM dbo.marketing_email_campaign_recipients AS recipients
        WHERE recipients.campaign_id = campaign.campaign_id
      ) AS status_counts
      WHERE campaign.campaign_id = @campaignId;
    `);
  });
  return mapCampaignRow(result.recordset?.[0] || {});
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
    let rows = [];
    let basis = 'source_enquiry_touchpoint_week';
    let dateColumn = null;
    let sourceUnavailableReason = null;
    const growthStartIso = getFinancialYearStartIso(new Date());
    const todayIso = new Date().toISOString().slice(0, 10);
    const growthEndExclusiveIso = addDaysIso(todayIso, 1);
    if (!demoOnly) {
      try {
        const sourceGrowth = await readSourceWeeklyGrowthRows(streamKey, { startIso: growthStartIso, endExclusiveIso: growthEndExclusiveIso });
        rows = sourceGrowth.rows;
        dateColumn = sourceGrowth.dateColumn;
      } catch (sourceError) {
        trackException(sourceError, { operation, phase: 'stream-growth-source', streamKey });
        trackEvent('MarketingEmail.StreamGrowth.Warning', { operation, streamKey, reason: 'source-growth-unavailable', error: sourceError?.message || 'Unknown error' });
        rows = [];
        basis = 'source_enquiry_datetime_unavailable';
        sourceUnavailableReason = sourceError?.message || 'Unknown source growth error';
      }
    }
    const growth = rows
      .map((row) => ({
        day: row.week_start ? new Date(row.week_start).toISOString().slice(0, 10) : null,
        sendable: Number(row.sendable_count || 0),
        suppressed: Number(row.suppression_count || 0),
        held: Number(row.held_count || 0),
        count: Number(row.total_count || 0),
      }))
      .filter((entry) => entry.day);
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.StreamGrowth.Completed', { operation, actor, streamKey, demoOnly: String(demoOnly), durationMs: String(durationMs), bucketCount: String(growth.length), basis, dateColumn: dateColumn || '', windowStart: growthStartIso, windowEndExclusive: growthEndExclusiveIso || '', sourceUnavailable: String(Boolean(sourceUnavailableReason)) });
    trackMetric('MarketingEmail.StreamGrowth.Duration', durationMs, { operation, streamKey });
    return res.json({
      ok: true,
      mode: demoOnly ? 'demo' : 'live',
      streamKey,
      basis,
      dateColumn,
      windowStart: growthStartIso,
      windowEndExclusive: growthEndExclusiveIso,
      sourceUnavailable: Boolean(sourceUnavailableReason),
      sourceUnavailableReason: process.env.NODE_ENV === 'production' ? null : sourceUnavailableReason,
      growth,
      generatedAt: new Date().toISOString(),
    });
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
    const sourceNames = demoOnly ? new Map() : await resolveSourceNames(rows).catch((nameError) => {
      trackException(nameError, { operation, phase: 'resolve-source-names', streamKey });
      trackEvent('MarketingEmail.StreamMembers.NamesWarning', { operation, streamKey, error: nameError?.message || 'Unknown error' });
      return new Map();
    });
    const members = rows.map((row) => ({
      ...mapMemberRow(row),
      contactName: sourceNames.get(trim(row.source_enquiry_id)) || sourceNames.get(trim(row.acid)) || null,
    }));
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

router.get('/streams/:streamKey/members/:memberId/campaign-history', async (req, res) => {
  const operation = 'marketing-email-member-campaign-history';
  const startedAt = Date.now();
  const actor = getActor(req);
  const streamKey = normaliseStreamKey(req.params.streamKey);
  const memberId = trim(req.params.memberId);
  const demoOnly = isDemoRequest(req);
  if (!streamKey) return res.status(400).json({ ok: false, error: 'Unsupported stream key' });
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) return res.status(400).json({ ok: false, error: 'Invalid member id' });
  trackEvent('MarketingEmail.MemberCampaignHistory.Started', { operation, actor, streamKey, demoOnly: String(demoOnly) });
  try {
    const projectConn = deriveProjectDataConnectionString();
    const schema = await readSchemaState(projectConn);
    const rows = await readMemberCampaignHistory(projectConn, { streamKey, memberId, demoOnly, schema });
    const replyHistory = demoOnly ? [] : await readCampaignReplyActionsForMember(rows, { streamKey }).catch((replyError) => {
      trackException(replyError, { operation, phase: 'campaign-reply-actions', streamKey });
      trackEvent('MarketingEmail.MemberCampaignHistory.ReplyActionsWarning', { operation, streamKey, error: replyError?.message || 'Unknown error' });
      return [];
    });
    const history = sortCampaignHistory([...rows.map(mapMemberCampaignHistoryRow), ...replyHistory]);
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.MemberCampaignHistory.Completed', { operation, actor, streamKey, demoOnly: String(demoOnly), durationMs: String(durationMs), rowCount: String(history.length), replyActionCount: String(replyHistory.length) });
    trackMetric('MarketingEmail.MemberCampaignHistory.Duration', durationMs, { operation, streamKey });
    return res.json({ ok: true, mode: demoOnly ? 'demo' : 'live', streamKey, count: history.length, history, generatedAt: new Date().toISOString() });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'member-campaign-history', streamKey });
    trackEvent('MarketingEmail.MemberCampaignHistory.Failed', { operation, actor, streamKey, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    return res.status(500).json({ ok: false, error: 'Failed to load recipient campaign history' });
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
    const requestedClient = has('client') ? ['1', 'true', 'yes'].includes(trim(req.body?.client).toLowerCase()) || req.body?.client === true : current.client;
    const nextClient = isClientRank(nextRank) || Boolean(current.matterId) || requestedClient;
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
          INSERTED.created_at,
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
  const excludeClients = req.body?.excludeClients !== false && String(req.body?.excludeClients || req.body?.exclude_clients || 'true').toLowerCase() !== 'false';
  const rankMin = excludeClients ? 4 : 0;
  const rankMax = 4;
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
      request.input('signatureMode', sql.NVarChar(60), 'data-hub-v2');
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
    await recordMarketingCampaignActivity(req, {
      actor,
      lifecycle: 'campaign-created',
      summary: 'Marketing email campaign created',
      stepName: 'marketing-email.campaign.create',
      payload: buildCampaignActivityPayload(req, {
        lifecycle: 'campaign-created',
        campaign,
        streamKey,
        demoOnly,
        counts: {
          selectedCount: counts.selectedCount,
          blockedCount: counts.blockedCount,
        },
        durationMs,
      }),
    });
    return res.json({ ok: true, campaign });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'create-campaign', streamKey });
    trackEvent('MarketingEmail.CampaignCreate.Failed', { operation, actor, streamKey, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    await recordMarketingCampaignActivity(req, {
      actor,
      lifecycle: 'campaign-create-failed',
      summary: 'Marketing email campaign creation failed',
      status: 'failed',
      stepName: 'marketing-email.campaign.create',
      error: 'Marketing email campaign creation failed',
      payload: buildCampaignActivityPayload(req, {
        lifecycle: 'campaign-create-failed',
        streamKey,
        demoOnly,
        durationMs,
      }),
    });
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
    const campaign = mapCampaignRow(updateResult.recordset?.[0] || {});
    trackEvent('MarketingEmail.CampaignLock.Completed', { operation, actor, demoOnly: String(effectiveDemoOnly), durationMs: String(durationMs), selectedCount: String(counts.selectedCount), blockedCount: String(counts.blockedCount), snapshotAvailable: String(snapshot.available), snapshotCount: String(snapshot.insertedCount) });
    trackMetric('MarketingEmail.CampaignLock.Duration', durationMs, { operation });
    await recordMarketingCampaignActivity(req, {
      actor,
      lifecycle: 'campaign-locked',
      summary: 'Marketing email campaign locked',
      stepName: 'marketing-email.campaign.lock',
      payload: buildCampaignActivityPayload(req, {
        lifecycle: 'campaign-locked',
        campaign,
        demoOnly: effectiveDemoOnly,
        counts: {
          selectedCount: counts.selectedCount,
          blockedCount: counts.blockedCount,
        },
        snapshot: {
          available: Boolean(snapshot.available),
          insertedCount: Number(snapshot.insertedCount || 0),
        },
        durationMs,
      }),
    });
    return res.json({ ok: true, mode: effectiveDemoOnly ? 'demo' : 'live', snapshot, campaign });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'lock-campaign', campaignId });
    trackEvent('MarketingEmail.CampaignLock.Failed', { operation, actor, durationMs: String(durationMs), error: error?.message || 'Unknown error' });
    await recordMarketingCampaignActivity(req, {
      actor,
      lifecycle: 'campaign-lock-failed',
      summary: 'Marketing email campaign lock failed',
      status: 'failed',
      stepName: 'marketing-email.campaign.lock',
      error: 'Marketing email campaign lock failed',
      payload: buildCampaignActivityPayload(req, {
        lifecycle: 'campaign-lock-failed',
        campaignId,
        demoOnly,
        durationMs,
      }),
    });
    return res.status(500).json({ ok: false, error: 'Failed to lock marketing email campaign' });
  }
});

router.post('/campaigns/:campaignId/sendgrid-batch', async (req, res) => {
  const operation = 'marketing-email-campaign-sendgrid-batch';
  const requestId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  const startedAt = Date.now();
  const actor = getActor(req);
  const campaignId = trim(req.params.campaignId);
  const demoOnly = isDemoRequest(req);
  const confirmSend = isTruthyFlag(req.body?.confirmSend);
  const dryRun = req.body?.dryRun !== false && !confirmSend;
  const limit = normaliseSendLimit(req.body?.limit);
  let projectConn = null;
  let plannedRecipients = [];

  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return res.status(400).json({ ok: false, error: 'Invalid campaign id' });
  if (!dryRun) {
    const operatorConsent = trim(req.body?.operatorConsent || req.headers?.['x-helix-operator-consent']);
    if (operatorConsent !== 'marketing-email-bulk-send') {
      trackEvent('MarketingEmail.CampaignSendGridBatch.AccessDenied', { operation, requestId, actor, campaignId, reason: 'consent_missing' });
      return res.status(403).json({ ok: false, error: 'Operator confirmation is required for bulk SendGrid send' });
    }
  }

  trackEvent('MarketingEmail.CampaignSendGridBatch.Started', { operation, requestId, actor, campaignId, dryRun: String(dryRun), limit: String(limit), demoOnly: String(demoOnly) });
  try {
    projectConn = deriveProjectDataConnectionString();
    const schema = await readSchemaState(projectConn);
    if (!schema.hasCampaignRecipients || !schema.hasCampaignRecipientProviderColumns) {
      return res.status(409).json({ ok: false, error: 'Campaign recipient delivery columns are not ready. Run the campaign recipients migration first.' });
    }

    const plan = await buildCampaignSendPlan(projectConn, { campaignId, limit, demoOnly, schema });
    const campaign = plan.campaign;
    plannedRecipients = plan.ready;
    if (!campaign) return res.status(404).json({ ok: false, error: 'Campaign not found' });
    if (plan.effectiveDemoOnly && !dryRun) return res.status(403).json({ ok: false, error: 'Demo campaigns cannot trigger bulk SendGrid sends' });
    if (trim(campaign.status) !== 'locked') return res.status(409).json({ ok: false, error: 'Lock the campaign snapshot before sending' });

    const bodyText = trim(req.body?.body || req.body?.bodyText);
    const requestSubject = trim(req.body?.subject);
    const bodyHash = hashBody(bodyText);
    const bodyHashMatches = Boolean(bodyHash && trim(campaign.body_hash) && bodyHash === trim(campaign.body_hash));
    if (requestSubject && requestSubject !== trim(campaign.subject)) {
      return res.status(409).json({ ok: false, error: 'Campaign subject changed after lock. Lock a fresh campaign snapshot before sending.' });
    }
    const countsBefore = await readCampaignRecipientStatusCounts(projectConn, campaignId);

    if (dryRun) {
      const durationMs = Date.now() - startedAt;
      trackEvent('MarketingEmail.CampaignSendGridBatch.DryRunCompleted', {
        operation,
        requestId,
        actor,
        campaignId,
        durationMs: String(durationMs),
        readyCount: String(plan.ready.length),
        skippedCount: String(plan.skipped.length),
        remainingCount: String(countsBefore.notSentCount),
        bodyHashMatches: String(bodyHashMatches),
      });
      trackMetric('MarketingEmail.CampaignSendGridBatch.DryRunDuration', durationMs, { operation });
      await recordMarketingCampaignActivity(req, {
        actor,
        lifecycle: 'campaign-send-dry-run',
        summary: 'Marketing email send dry run completed',
        stepName: 'marketing-email.campaign.send-dry-run',
        payload: buildCampaignActivityPayload(req, {
          lifecycle: 'campaign-send-dry-run',
          campaign,
          campaignId,
          demoOnly: plan.effectiveDemoOnly,
          dryRun: true,
          limit,
          requestId,
          counts: {
            readyCount: plan.ready.length,
            skippedCount: plan.skipped.length,
            remainingCount: countsBefore.notSentCount,
          },
          bodyText,
          requestSubject,
          bodyHashMatches,
          durationMs,
        }),
      });
      return res.json({
        ok: true,
        mode: plan.effectiveDemoOnly ? 'demo' : 'live',
        dryRun: true,
        campaign: mapCampaignRow(campaign),
        batchLimit: limit,
        batchRecipientCount: plan.ready.length,
        skippedCount: plan.skipped.length,
        statusCounts: countsBefore,
        bodyHashMatches,
        generatedAt: new Date().toISOString(),
      });
    }

    const expectedRecipientCount = Number.parseInt(String(req.body?.expectedRecipientCount || ''), 10);
    if (!bodyText || !bodyHashMatches) return res.status(409).json({ ok: false, error: 'Email body changed after lock. Lock a fresh campaign snapshot before sending.' });
    if (!confirmSend || expectedRecipientCount !== plan.ready.length) return res.status(400).json({ ok: false, error: 'Confirm the exact dry-run recipient count before sending' });
    if (plan.ready.length === 0) return res.status(409).json({ ok: false, error: 'No unsent recipients are ready for this campaign batch' });

    const senderEmail = resolveSender(campaign.sender_email);
    const subject = trim(campaign.subject);
    if (!senderEmail) return res.status(400).json({ ok: false, error: 'Unsupported SendGrid sender on campaign' });
    if (!subject) return res.status(400).json({ ok: false, error: 'Campaign subject is required before sending' });
    const apiKey = await getSendGridApiKey();
    if (!apiKey) return res.status(503).json({ ok: false, error: 'SendGrid is not configured. Add SENDGRID_API_KEY, HELIX_SENDGRID_API_KEY, or Key Vault secret sendgrid-helix-email.' });

    if (plan.skipped.length > 0) {
      await updateCampaignRecipientStatuses(projectConn, plan.skipped, {
        sendStatus: 'skipped',
        providerStatus: 'local_validation',
        actor,
      });
    }
    await updateCampaignRecipientStatuses(projectConn, plan.ready, {
      sendStatus: 'sending',
      providerStatus: 'sendgrid_request_started',
      actor,
    });

    const signatureInitials = trim(req.body?.signatureInitials || req.user?.initials || actor).toUpperCase();
    const signatureMode = normaliseSignatureMode(campaign.signature_mode || req.body?.signatureMode);
    const operatorEmail = normalizeEmails(req.user?.email || req.headers?.['x-user-email'] || req.body?.operatorEmail)[0] || senderEmail;
    const html = buildSendGridEmailHtml({
      bodyText,
      preheaderText: trim(campaign.preheader),
      fromEmail: senderEmail,
      signatureInitials,
      signatureMode,
      operatorName: trim(req.body?.operatorName || req.user?.name || req.user?.displayName || actor),
      operatorEmail,
    });
    const plainText = campaign.preheader ? `${trim(campaign.preheader)}\n\n${bodyText}` : bodyText;
    const sendGridPayload = {
      personalizations: plan.ready.map((recipient) => {
        const replyToken = buildCampaignReplyToken(campaignId, recipient.recipientId);
        return {
          to: [{ email: recipient.email }],
          headers: {
            'X-Helix-Reply-Token': replyToken,
            'X-Helix-Campaign-Id': campaignId,
            'X-Helix-Recipient-Id': recipient.recipientId,
          },
          substitutions: {
            [EMAIL_SENDGRID_REPLY_TOKEN_SUBSTITUTION]: replyToken,
            [EMAIL_SENDGRID_CAMPAIGN_ID_SUBSTITUTION]: campaignId,
            [EMAIL_SENDGRID_RECIPIENT_ID_SUBSTITUTION]: recipient.recipientId,
          },
          custom_args: {
            source: 'marketing-email-workbench',
            mode: 'campaign-batch',
            requestId,
            campaignId,
            recipientId: recipient.recipientId,
            sourceEnquiryId: recipient.sourceEnquiryId,
            activeCampaignId: recipient.acid,
            streamKey: recipient.streamKey,
            signatureMode,
            replyToken,
          },
        };
      }),
      from: { email: senderEmail, name: 'Helix Law' },
      reply_to: { email: EMAIL_SENDGRID_REPLY_TO_EMAIL, name: 'Helix Law' },
      subject,
      content: [
        { type: 'text/plain', value: plainText },
        { type: 'text/html', value: html },
      ],
      categories: ['marketing-email-workbench', 'campaign-batch'],
    };

    const sendGridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sendGridPayload),
    });
    const sendGridMessageId = sendGridResponse.headers.get('x-message-id') || '';

    if (sendGridResponse.status !== 202) {
      const providerError = `SendGrid rejected request with status ${sendGridResponse.status}`;
      await updateCampaignRecipientStatuses(projectConn, plan.ready, {
        sendStatus: 'failed',
        providerStatus: `sendgrid_${sendGridResponse.status}`,
        providerError,
        actor,
      });
      const campaignSummary = await updateCampaignSendSummary(projectConn, { campaignId, actor, sendGridMessageId: null });
      const durationMs = Date.now() - startedAt;
      trackEvent('MarketingEmail.CampaignSendGridBatch.Failed', { operation, requestId, actor, campaignId, phase: 'sendgrid', statusCode: String(sendGridResponse.status), durationMs: String(durationMs), recipientCount: String(plan.ready.length) });
      await recordMarketingCampaignActivity(req, {
        actor,
        lifecycle: 'campaign-send-failed',
        summary: 'Marketing email send failed',
        status: 'failed',
        stepName: 'marketing-email.campaign.send',
        error: 'SendGrid rejected campaign batch',
        payload: buildCampaignActivityPayload(req, {
          lifecycle: 'campaign-send-failed',
          campaign: campaignSummary,
          campaignId,
          demoOnly: false,
          dryRun: false,
          limit,
          requestId,
          counts: {
            recipientCount: plan.ready.length,
            skippedCount: plan.skipped.length,
          },
          provider: {
            name: 'sendgrid',
            statusCode: sendGridResponse.status,
            accepted: false,
          },
          bodyText,
          requestSubject,
          bodyHashMatches,
          durationMs,
        }),
      });
      return res.status(502).json({ ok: false, error: 'SendGrid rejected the campaign batch', campaign: campaignSummary });
    }

    await updateCampaignRecipientStatuses(projectConn, plan.ready, {
      sendStatus: 'sent',
      providerStatus: 'sendgrid_accepted',
      sendGridMessageId,
      actor,
      sent: true,
    });
    const campaignSummary = await updateCampaignSendSummary(projectConn, { campaignId, actor, sendGridMessageId });
    const countsAfter = await readCampaignRecipientStatusCounts(projectConn, campaignId);
    const durationMs = Date.now() - startedAt;
    trackEvent('MarketingEmail.CampaignSendGridBatch.Completed', { operation, requestId, actor, campaignId, durationMs: String(durationMs), recipientCount: String(plan.ready.length), skippedCount: String(plan.skipped.length), sendGridMessageId });
    trackMetric('MarketingEmail.CampaignSendGridBatch.Duration', durationMs, { operation });
    trackMetric('MarketingEmail.CampaignSendGridBatch.Recipients', plan.ready.length, { operation });
    await recordMarketingCampaignActivity(req, {
      actor,
      lifecycle: 'campaign-send-completed',
      summary: 'Marketing email send completed',
      stepName: 'marketing-email.campaign.send',
      payload: buildCampaignActivityPayload(req, {
        lifecycle: 'campaign-send-completed',
        campaign: campaignSummary,
        campaignId,
        demoOnly: false,
        dryRun: false,
        limit,
        requestId,
        counts: {
          recipientCount: plan.ready.length,
          skippedCount: plan.skipped.length,
          statusCounts: countsAfter,
        },
        provider: {
          name: 'sendgrid',
          statusCode: sendGridResponse.status,
          accepted: true,
          messageIdPresent: Boolean(sendGridMessageId),
        },
        bodyText,
        requestSubject,
        bodyHashMatches,
        durationMs,
      }),
    });
    return res.json({
      ok: true,
      provider: 'sendgrid',
      mode: 'live',
      requestId,
      sendGridMessageId,
      batchRecipientCount: plan.ready.length,
      skippedCount: plan.skipped.length,
      statusCounts: countsAfter,
      campaign: campaignSummary,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (projectConn && plannedRecipients.length > 0) {
      await updateCampaignRecipientStatuses(projectConn, plannedRecipients, {
        sendStatus: 'failed',
        providerStatus: 'server_error',
        providerError: 'Server failed while processing SendGrid batch',
        actor,
      }).catch(() => null);
    }
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'sendgrid-batch', campaignId, requestId });
    trackEvent('MarketingEmail.CampaignSendGridBatch.Failed', { operation, requestId, actor, campaignId, durationMs: String(durationMs), recipientCount: String(plannedRecipients.length), error: error?.message || 'Unknown error' });
    await recordMarketingCampaignActivity(req, {
      actor,
      lifecycle: 'campaign-send-failed',
      summary: 'Marketing email send failed',
      status: 'failed',
      stepName: 'marketing-email.campaign.send',
      error: 'Marketing email campaign send failed',
      payload: buildCampaignActivityPayload(req, {
        lifecycle: 'campaign-send-failed',
        campaignId,
        demoOnly,
        dryRun,
        limit,
        requestId,
        counts: {
          plannedRecipientCount: plannedRecipients.length,
        },
        provider: {
          name: 'sendgrid',
          accepted: false,
        },
        durationMs,
      }),
    });
    return res.status(500).json({ ok: false, error: 'Failed to send marketing email campaign batch' });
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
        massSendEnabled: Boolean(schema.hasCampaignRecipients && schema.hasCampaignRecipientProviderColumns),
        batchLimit: EMAIL_SENDGRID_BATCH_LIMIT,
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
