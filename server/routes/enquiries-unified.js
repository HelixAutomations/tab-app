const express = require('express');
const { randomUUID } = require('crypto');
const { withRequest, sql } = require('../utils/db');
const { getSecret } = require('../utils/getSecret');
const { cacheUnified, generateCacheKey, CACHE_CONFIG, deleteCachePattern, getCache, setCache } = require('../utils/redisClient');
const { loggers } = require('../utils/logger');
const { attachEnquiriesStream, broadcastEnquiriesChanged } = require('../utils/enquiries-stream');
const { emitEvent } = require('../utils/eventEmitter');
const { trackEvent, trackMetric, trackException } = require('../utils/appInsights');
const { VALID_SOURCE_BIASES, resolveSourceSelection, getDefaultSourceBiasForPolicy } = require('../utils/enquirySourcePolicy');
const { loadPersonalSignatureHtml, maybeWrapSignature, normalizeEmails } = require('../utils/helixEmail');
const router = express.Router();
const { annotate } = require('../utils/devConsole');

const log = loggers.enquiries;
const VALID_SOURCE_BIASES_SET = new Set(VALID_SOURCE_BIASES);
const VALID_PROCESSING_APPROACHES = new Set(['unified', 'area-personalised']);
const MEMORY_UNIFIED_CACHE_TTL_MS = 15 * 1000;
const MEMORY_UNIFIED_CACHE_STALE_MS = 60 * 1000;
const MEMORY_UNIFIED_CACHE_MAX_ENTRIES = Math.max(20, Number.parseInt(process.env.ENQUIRIES_UNIFIED_MEMORY_CACHE_MAX_ENTRIES || '120', 10) || 120);
const MEMORY_UNIFIED_CACHE_TELEMETRY_INTERVAL_MS = 60 * 1000;
const unifiedMemoryCache = new Map();
const instructionsColumnPresenceCache = new Map();
const INSTRUCTIONS_COLUMN_CACHE_TTL_MS = 10 * 60 * 1000;
let lastUnifiedMemoryTelemetryAt = 0;

function reportUnifiedMemoryCachePrune(reason, expiredEntries, cappedEntries) {
  if (!expiredEntries && !cappedEntries) return;

  const now = Date.now();
  if (cappedEntries === 0 && now - lastUnifiedMemoryTelemetryAt < MEMORY_UNIFIED_CACHE_TELEMETRY_INTERVAL_MS) {
    return;
  }

  lastUnifiedMemoryTelemetryAt = now;

  trackEvent('EnquiriesUnified.MemoryCachePruned', {
    reason,
    expiredEntries: String(expiredEntries),
    cappedEntries: String(cappedEntries),
    sizeAfter: String(unifiedMemoryCache.size),
    maxEntries: String(MEMORY_UNIFIED_CACHE_MAX_ENTRIES),
  });
  trackMetric('EnquiriesUnified.MemoryCacheSize', unifiedMemoryCache.size, { reason });
}

function pruneUnifiedMemoryCache(reason = 'read') {
  const now = Date.now();
  let expiredEntries = 0;

  for (const [cacheKey, entry] of unifiedMemoryCache.entries()) {
    if (now - entry.ts >= MEMORY_UNIFIED_CACHE_TTL_MS + MEMORY_UNIFIED_CACHE_STALE_MS) {
      unifiedMemoryCache.delete(cacheKey);
      expiredEntries += 1;
    }
  }

  let cappedEntries = 0;
  if (unifiedMemoryCache.size > MEMORY_UNIFIED_CACHE_MAX_ENTRIES) {
    const overflow = unifiedMemoryCache.size - MEMORY_UNIFIED_CACHE_MAX_ENTRIES;
    const evictionCandidates = [...unifiedMemoryCache.entries()]
      .sort(([, left], [, right]) => {
        const leftProtected = left.refreshPromise ? 1 : 0;
        const rightProtected = right.refreshPromise ? 1 : 0;
        if (leftProtected !== rightProtected) {
          return leftProtected - rightProtected;
        }

        const leftAccess = left.lastAccessedAt || left.ts;
        const rightAccess = right.lastAccessedAt || right.ts;
        return leftAccess - rightAccess;
      });

    for (const [cacheKey] of evictionCandidates.slice(0, overflow)) {
      unifiedMemoryCache.delete(cacheKey);
      cappedEntries += 1;
    }
  }

  reportUnifiedMemoryCachePrune(reason, expiredEntries, cappedEntries);
}

function getMemoryUnifiedEntry(cacheKey) {
  pruneUnifiedMemoryCache('read');

  const entry = unifiedMemoryCache.get(cacheKey);
  if (!entry) return null;

  const now = Date.now();
  const ageMs = now - entry.ts;
  if (ageMs >= MEMORY_UNIFIED_CACHE_TTL_MS + MEMORY_UNIFIED_CACHE_STALE_MS) {
    unifiedMemoryCache.delete(cacheKey);
    return null;
  }

  entry.lastAccessedAt = now;

  return {
    data: entry.data,
    ts: entry.ts,
    refreshPromise: entry.refreshPromise,
    ageMs,
    isFresh: ageMs < MEMORY_UNIFIED_CACHE_TTL_MS,
  };
}

function setMemoryUnifiedEntry(cacheKey, data) {
  const now = Date.now();

  unifiedMemoryCache.set(cacheKey, {
    data,
    ts: now,
    lastAccessedAt: now,
    refreshPromise: null,
  });

  pruneUnifiedMemoryCache('write');
}

function setMemoryUnifiedRefreshPromise(cacheKey, refreshPromise) {
  const currentEntry = unifiedMemoryCache.get(cacheKey);
  if (!currentEntry) return;

  currentEntry.refreshPromise = refreshPromise;
  currentEntry.lastAccessedAt = Date.now();
  unifiedMemoryCache.set(cacheKey, currentEntry);
}

function clearMemoryUnifiedRefreshPromise(cacheKey) {
  const currentEntry = unifiedMemoryCache.get(cacheKey);
  if (!currentEntry) return;

  currentEntry.refreshPromise = null;
  currentEntry.lastAccessedAt = Date.now();
  unifiedMemoryCache.set(cacheKey, currentEntry);
}

function clearUnifiedMemoryCache() {
  unifiedMemoryCache.clear();
}

const normaliseEmail = (value) => String(value || '').trim().toLowerCase();

const parseSharedWithEmails = (value) => {
  return String(value || '')
    .split(/[;,\n]/)
    .map((entry) => normaliseEmail(entry))
    .filter(Boolean);
};

const serialiseSharedWithEmails = (value) => {
  return Array.from(new Set(parseSharedWithEmails(value))).join(',');
};

const isUserInSharedWith = (sharedWith, userEmail) => {
  const target = normaliseEmail(userEmail);
  if (!target) return false;
  return parseSharedWithEmails(sharedWith).includes(target);
};

const normaliseSourceBias = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  return VALID_SOURCE_BIASES_SET.has(candidate)
    ? candidate
    : getDefaultSourceBiasForPolicy('operational');
};

const normaliseProcessingApproach = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  return VALID_PROCESSING_APPROACHES.has(candidate) ? candidate : 'unified';
};

const mergeIfBlank = (target, targetField, source, sourceField = targetField) => {
  if (!target || !source) return;

  const targetValue = target[targetField];
  const sourceValue = source[sourceField];

  if ((targetValue === null || targetValue === undefined || String(targetValue).trim() === '') &&
      sourceValue !== null && sourceValue !== undefined && String(sourceValue).trim() !== '') {
    target[targetField] = sourceValue;
  }
};

const normaliseOperationalStage = (raw) => {
  const stage = String(raw || '').trim().toLowerCase();
  if (!stage) return '';
  if (stage.includes('proof-of-id') || stage.includes('poid') || stage.includes('complete')) return 'complete';
  if (stage.includes('instruct') || stage.includes('instruction') || stage.includes('actioned')) return 'instructed';
  if (stage.includes('pitch')) return 'pitched';
  if (stage.includes('contact') || stage.includes('engaged') || stage.includes('reached')) return 'contacted';
  if (stage.includes('claim') || stage.includes('follow up')) return 'claimed';
  if (stage.includes('new') || stage.includes('enquiry') || stage.includes('initial')) return 'enquiry';
  if (stage.includes('conflict') || stage.includes('closed') || stage.includes('rejected')) return 'closed';
  return stage;
};

const operationalStageRank = (raw) => {
  switch (normaliseOperationalStage(raw)) {
    case 'complete':
      return 5;
    case 'instructed':
      return 4;
    case 'pitched':
      return 3;
    case 'contacted':
      return 2.5;
    case 'claimed':
      return 2;
    case 'enquiry':
      return 1;
    default:
      return 0;
  }
};

const mergeMoreAdvancedStage = (target, source, targetField = 'stage', sourceField = 'stage') => {
  if (!target || !source) return;

  const targetValue = target[targetField];
  const sourceValue = source[sourceField];
  const sourceRank = operationalStageRank(sourceValue);
  const targetRank = operationalStageRank(targetValue);

  if (sourceRank > targetRank && String(sourceValue || '').trim()) {
    target[targetField] = sourceValue;
  }
};

const annotateProcessingIdentity = (record, { processingEnquiryId, processingSource, legacyEnquiryId, sourcePolicy, sourceBias, processingApproach }) => {
  record.processingEnquiryId = processingEnquiryId;
  record.processingSource = processingSource;
  record.legacyEnquiryId = legacyEnquiryId || null;
  record.sourcePolicy = sourcePolicy;
  record.sourceBias = sourceBias;
  record.processingApproach = processingApproach;
  return record;
};

async function instructionsHasColumn(instructionsConnectionString, columnName) {
  try {
    const result = await withRequest(instructionsConnectionString, async (request) => {
      request.input('tableName', sql.VarChar(128), 'enquiries');
      request.input('columnName', sql.VarChar(128), columnName);
      return await request.query(`
        SELECT TOP 1 1 as hasColumn
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
      `);
    });
    return (result?.recordset?.length || 0) > 0;
  } catch (error) {
    log.warn(`Failed to inspect instructions column ${columnName}:`, error?.message || error);
    return false;
  }
}

async function getCachedInstructionsColumnPresence(instructionsConnectionString, columnName) {
  const cacheKey = `${instructionsConnectionString}::${columnName}`;
  const cached = instructionsColumnPresenceCache.get(cacheKey);
  if (cached && (Date.now() - cached.checkedAt) < INSTRUCTIONS_COLUMN_CACHE_TTL_MS) {
    return cached.hasColumn;
  }

  const hasColumn = await instructionsHasColumn(instructionsConnectionString, columnName);
  instructionsColumnPresenceCache.set(cacheKey, {
    hasColumn,
    checkedAt: Date.now(),
  });
  return hasColumn;
}

// SSE stream endpoint: GET /api/enquiries-unified/stream
// Emits lightweight "enquiries.changed" events on mutations so clients can refresh.
attachEnquiriesStream(router);

// Lightweight pulse endpoint to detect new enquiries without heavy payloads.
// GET /api/enquiries-unified/pulse
router.get('/pulse', async (req, res) => {
  const mainConnectionString = process.env.SQL_CONNECTION_STRING; // helix-core-data
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING; // instructions DB

  const warnings = [];
  let mainLatest = null;
  let instructionsLatest = null;

  try {
    if (mainConnectionString) {
      const result = await withRequest(mainConnectionString, async (request) => {
        return await request.query(`
          SELECT TOP 1 Date_Created as latest
          FROM enquiries
          ORDER BY Date_Created DESC
        `);
      });
      mainLatest = result?.recordset?.[0]?.latest || null;
    }
  } catch (err) {
    warnings.push({ source: 'main', message: err?.message || String(err) });
  }

  try {
    if (instructionsConnectionString) {
      const result = await withRequest(instructionsConnectionString, async (request) => {
        return await request.query(`
          SELECT TOP 1 datetime as latest
          FROM dbo.enquiries
          ORDER BY datetime DESC
        `);
      });
      instructionsLatest = result?.recordset?.[0]?.latest || null;
    }
  } catch (err) {
    warnings.push({ source: 'instructions', message: err?.message || String(err) });
  }

  const latestCandidates = [mainLatest, instructionsLatest]
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter((value) => Number.isFinite(value));

  const latestTimestamp = latestCandidates.length
    ? new Date(Math.max(...latestCandidates)).toISOString()
    : null;

  res.json({
    latestTimestamp,
    sources: {
      main: mainLatest ? new Date(mainLatest).toISOString() : null,
      instructions: instructionsLatest ? new Date(instructionsLatest).toISOString() : null,
    },
    warnings,
  });
});

const SOURCE_LEDGER_SORT_FIELDS = {
  date: 'datetime',
  id: 'id',
  aow: 'aow',
  moc: 'moc',
  poc: 'poc',
  source: 'source',
};
const SOURCE_LEDGER_COLUMN_CANDIDATES = {
  campaign: ['Campaign', 'campaign', 'Campaign_Name', 'campaign_name', 'CampaignName', 'campaignName', 'Campaign Name', 'utm_campaign', 'Utm_Campaign', 'UTM_Campaign', 'utmCampaign', 'UtmCampaign', 'UTMCampaign', 'UTM Campaign'],
  keyword: ['Search_Keyword', 'SearchKeyword', 'Search Keyword', 'search_keyword', 'Search_Term', 'search_term', 'Search Term', 'searchTerm', 'Keyword', 'keyword', 'Keywords', 'keywords', 'utm_term', 'Utm_Term', 'UTM_Term', 'utmTerm', 'UtmTerm', 'UTMTerm', 'UTM Term'],
};
const SOURCE_LEDGER_COLUMN_TOKENS = {
  campaign: ['campaign', 'utmcampaign'],
  keyword: ['keyword', 'keywords', 'searchterm', 'utmterm'],
};
const SOURCE_LEDGER_OPTION_FIELDS = ['source', 'aow', 'moc', 'poc'];
const SOURCE_LEDGER_DEFAULT_LIMIT = 100;
const SOURCE_LEDGER_MAX_LIMIT = 200;
const SOURCE_LEDGER_MAX_OFFSET = 100000;
const SOURCE_LEDGER_ROW_EDITABLE_FIELDS = {
  acid: { column: 'acid', type: 'text', maxLength: 255 },
  datetime: { column: 'datetime', type: 'datetime' },
  aow: { column: 'aow', type: 'text', maxLength: 255 },
  moc: { column: 'moc', type: 'text', maxLength: 255 },
  poc: { column: 'poc', type: 'text', maxLength: 255 },
  phone: { column: 'phone', type: 'text', maxLength: 255 },
  campaign: { candidates: SOURCE_LEDGER_COLUMN_CANDIDATES.campaign, tokens: SOURCE_LEDGER_COLUMN_TOKENS.campaign, type: 'text', maxLength: 255 },
  keyword: { candidates: SOURCE_LEDGER_COLUMN_CANDIDATES.keyword, tokens: SOURCE_LEDGER_COLUMN_TOKENS.keyword, type: 'text', maxLength: 255 },
  source: { column: 'source', type: 'text', maxLength: 255 },
  url: { column: 'url', type: 'text', maxLength: 500 },
};
const SOURCE_LEDGER_DEV_PREVIEW_INITIALS = new Set(['LZ', 'AC']);
const EMAIL_LIST_COLUMN_CANDIDATES = {
  id: ['id', 'ID'],
  datetime: ['datetime', 'Touchpoint_Date', 'touchpoint_date'],
  email: ['email', 'Email'],
  aow: ['aow', 'Area_of_Work'],
  moc: ['moc', 'Method_of_Contact'],
  tags: ['Tags', 'tags', 'tag'],
  doNotMarket: ['Do_not_Market', 'do_not_market', 'doNotMarket', 'do_not_send', 'DoNotSend'],
  acid: ['acid', 'ACID'],
  poc: ['poc', 'Point_of_Contact'],
};
const EMAIL_LIST_STREAM_CONSENT = 'email-lists-limited-stream';
const EMAIL_LIST_DEMO_ENQUIRY_PREFIX = 'DEMO-ENQ-';
const EMAIL_LIST_SENDGRID_ALLOWED_SENDERS = new Set([
  'automations@helix-law.com',
  'team@helix-law.com',
  'lz@helix-law.com',
]);
const EMAIL_LIST_SENDGRID_SECRET_NAMES = [
  'sendgrid-api-key',
  'sendgrid-helix-email',
  'sendgrid-apikey',
  'sendgrid-api-token',
  'sendgrid-mail-api-key',
  'sendgrid-outreach-api-key',
  'email-outreach-sendgrid-api-key',
  'SendGridApiKey',
];
const EMAIL_LIST_SENDGRID_SIGNATURE_MODES = new Set(['data-hub-v2', 'legacy']);
let emailListSendGridApiKeyCache = null;

function getEmailListOperatorActor(req) {
  return String(
    req.user?.initials
    || req.headers?.['x-helix-initials']
    || req.body?.operatorActor
    || req.query.operatorActor
    || '',
  ).trim();
}

function assertEmailListStreamConsent(req) {
  if (process.env.NODE_ENV !== 'production' && process.env.HELIX_ALLOW_LOCAL_EMAIL_LIST_STREAM === '1') return;
  const operatorConsent = String(req.body?.operatorConsent || req.query.operatorConsent || req.headers?.['x-helix-operator-consent'] || '').trim();
  const operatorActor = getEmailListOperatorActor(req);
  if (operatorConsent !== EMAIL_LIST_STREAM_CONSENT || !operatorActor) {
    const error = new Error('Operator consent required for Email Lists stream');
    error.statusCode = 403;
    throw error;
  }
}

async function getEmailListSendGridApiKey() {
  const envValue = String(process.env.SENDGRID_API_KEY || process.env.HELIX_SENDGRID_API_KEY || process.env.SG_API_KEY || '').trim();
  if (envValue) return envValue;
  if (emailListSendGridApiKeyCache) return emailListSendGridApiKeyCache;

  for (const secretName of EMAIL_LIST_SENDGRID_SECRET_NAMES) {
    try {
      const secretValue = String(await getSecret(secretName) || '').trim();
      if (secretValue) {
        emailListSendGridApiKeyCache = secretValue;
        return secretValue;
      }
    } catch {
      // Try the next supported secret name.
    }
  }

  return null;
}

function escapeEmailListHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emailListPlainTextToHtml(value) {
  const blocks = String(value || '')
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.length > 0
    ? blocks.map((block) => `<p style="font-family:Raleway,Arial,Helvetica,sans-serif;font-size:10pt;line-height:1.4;color:rgb(0,0,0);margin:0 0 12px 0;">${escapeEmailListHtml(block).replace(/\n/g, '<br />')}</p>`).join('')
    : '';
}

function normaliseEmailListSignatureMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return EMAIL_LIST_SENDGRID_SIGNATURE_MODES.has(mode) ? mode : 'data-hub-v2';
}

function buildEmailListPreheaderHtml(value) {
  const preheader = String(value || '').trim();
  if (!preheader) return '';
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;">${escapeEmailListHtml(preheader)}</div>`;
}

function stripEmailListDocumentShell(html, bodyMarker) {
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

function buildEmailListSystemSignatureHtml() {
  const bodyMarker = '<span data-email-list-v2-body-marker="1"></span>';
  return stripEmailListDocumentShell(maybeWrapSignature(bodyMarker), bodyMarker);
}

function buildEmailListOutreachSignatureV2({ operatorEmail, signatureInitials }) {
  const signatureEmail = normalizeEmails(operatorEmail)[0] || '';
  const personalSignature = loadPersonalSignatureHtml({ signatureInitials, fromEmail: signatureEmail });
  return personalSignature || buildEmailListSystemSignatureHtml();
}

function buildEmailListSendGridHtml({ bodyText, preheaderText, fromEmail, signatureInitials, signatureMode, operatorName, operatorEmail }) {
  const bodyHtml = `<div style="font-family:Raleway,Arial,Helvetica,sans-serif;font-size:10pt;line-height:1.4;color:rgb(0,0,0);">${emailListPlainTextToHtml(bodyText)}</div>`;
  const preheaderHtml = buildEmailListPreheaderHtml(preheaderText);
  const resolvedSignatureMode = normaliseEmailListSignatureMode(signatureMode);
  if (resolvedSignatureMode === 'data-hub-v2') {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>Helix Email</title></head><body style="margin:0;padding:0;font-family:Raleway,Arial,Helvetica,sans-serif;font-size:10pt;line-height:1.4;color:rgb(0,0,0);">${preheaderHtml}${bodyHtml}${buildEmailListOutreachSignatureV2({ operatorName, operatorEmail, signatureInitials })}</body></html>`;
  }

  const personalSignature = loadPersonalSignatureHtml({ signatureInitials, fromEmail });
  return personalSignature && personalSignature.trim()
    ? `${preheaderHtml}${bodyHtml}<br />${personalSignature}`
    : maybeWrapSignature(`${preheaderHtml}${bodyHtml}`);
}

function resolveEmailListSendGridSender(value) {
  const sender = normalizeEmails(value)[0] || 'automations@helix-law.com';
  const lower = sender.toLowerCase();
  return EMAIL_LIST_SENDGRID_ALLOWED_SENDERS.has(lower) ? lower : null;
}

function splitEmailListTagTokens(value) {
  return String(value || '')
    .split(/[;,|\r\n]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normaliseEmailListAreaFilters(value) {
  const rawValues = Array.isArray(value) ? value : [value];
  const filters = [];
  rawValues
    .flatMap((entry) => String(entry || '').split(/[;,|]+/))
    .map((entry) => entry.trim().toLowerCase())
    .forEach((entry) => {
      let normalised = entry;
      if (entry === 'unsure' || entry === 'unknown' || entry === 'uncategorised' || entry === 'uncategorized') normalised = 'other';
      if (normalised === 'all') {
        filters.length = 0;
        return;
      }
      if (['commercial', 'construction', 'property', 'employment', 'other'].includes(normalised) && !filters.includes(normalised)) {
        filters.push(normalised);
      }
    });
  return filters;
}

function emailListSingleAreaFilterPredicate(areaLowerExpr, areaFilter) {
  if (areaFilter === 'commercial') return `(${areaLowerExpr} LIKE '%commercial%' OR ${areaLowerExpr} LIKE '%business%')`;
  if (areaFilter === 'construction') return `(${areaLowerExpr} LIKE '%construction%' OR ${areaLowerExpr} LIKE '%building%')`;
  if (areaFilter === 'property') return `(${areaLowerExpr} LIKE '%property%' OR ${areaLowerExpr} LIKE '%real estate%' OR ${areaLowerExpr} LIKE '%conveyancing%' OR ${areaLowerExpr} LIKE '%landlord%' OR ${areaLowerExpr} LIKE '%tenant%')`;
  if (areaFilter === 'employment') return `(${areaLowerExpr} LIKE '%employment%' OR ${areaLowerExpr} LIKE '%hr%' OR ${areaLowerExpr} LIKE '%workplace%')`;
  if (areaFilter === 'other') return `(
    ${areaLowerExpr} = ''
    OR (
      ${areaLowerExpr} NOT LIKE '%commercial%'
      AND ${areaLowerExpr} NOT LIKE '%business%'
      AND ${areaLowerExpr} NOT LIKE '%construction%'
      AND ${areaLowerExpr} NOT LIKE '%building%'
      AND ${areaLowerExpr} NOT LIKE '%property%'
      AND ${areaLowerExpr} NOT LIKE '%real estate%'
      AND ${areaLowerExpr} NOT LIKE '%conveyancing%'
      AND ${areaLowerExpr} NOT LIKE '%landlord%'
      AND ${areaLowerExpr} NOT LIKE '%tenant%'
      AND ${areaLowerExpr} NOT LIKE '%employment%'
      AND ${areaLowerExpr} NOT LIKE '%hr%'
      AND ${areaLowerExpr} NOT LIKE '%workplace%'
    )
  )`;
  return null;
}

function emailListAreaFilterPredicate(areaLowerExpr, areaFilter) {
  const filters = normaliseEmailListAreaFilters(areaFilter);
  if (filters.length === 0) return null;
  const predicates = filters
    .map((filter) => emailListSingleAreaFilterPredicate(areaLowerExpr, filter))
    .filter(Boolean);
  return predicates.length > 0 ? `(${predicates.join('\n        OR ')})` : null;
}

function formatEmailListDateValue(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseEmailListDateValue(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (formatEmailListDateValue(date) !== text) return null;
  return text;
}

function getDefaultEmailListDateRange() {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29));
  return {
    startDate: formatEmailListDateValue(start),
    endDate: formatEmailListDateValue(today),
  };
}

function normaliseEmailListDateRange(dateFrom, dateTo) {
  const hasFrom = String(dateFrom || '').trim().length > 0;
  const hasTo = String(dateTo || '').trim().length > 0;
  if (!hasFrom && !hasTo) return getDefaultEmailListDateRange();
  const startDate = parseEmailListDateValue(dateFrom);
  const endDate = parseEmailListDateValue(dateTo);
  if (!startDate || !endDate) {
    const error = new Error('A valid email list dateFrom and dateTo range is required');
    error.statusCode = 400;
    throw error;
  }
  if (startDate > endDate) {
    const error = new Error('email list dateFrom must be before dateTo');
    error.statusCode = 400;
    throw error;
  }
  return { startDate, endDate };
}

function safeSqlIdentifier(columnName) {
  const safeName = String(columnName || '').replace(/]/g, ']]');
  return `[${safeName}]`;
}

function safeSqlColumnRef(columnName, alias = 'e') {
  const identifier = safeSqlIdentifier(columnName);
  return alias ? `${alias}.${identifier}` : identifier;
}

function trimSqlTextExpr(columnRef, length = 'max') {
  const sqlLength = length === 'max' ? 'max' : String(Math.max(1, Math.min(Number(length) || 255, 4000)));
  return `NULLIF(LTRIM(RTRIM(TRY_CONVERT(nvarchar(${sqlLength}), ${columnRef}))), '')`;
}

function tagSearchExpr(columnRef) {
  return `LOWER(COALESCE(TRY_CONVERT(nvarchar(max), ${columnRef}), ''))`;
}

function normalisedTagListExpr(columnRef) {
  return `REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(TRY_CONVERT(nvarchar(max), ${columnRef}), ''), CHAR(13), ','), CHAR(10), ','), ';', ','), '|', ',')`;
}

function digitTagListExpr(columnRef) {
  return `(',' + REPLACE(${normalisedTagListExpr(columnRef)}, ' ', '') + ',')`;
}

function pickEnquiryColumn(columnNames, candidates) {
  const byLower = new Map(columnNames.map((name) => [String(name).toLowerCase(), name]));
  for (const candidate of candidates) {
    const match = byLower.get(String(candidate).toLowerCase());
    if (match) return match;
  }
  return null;
}

function normaliseColumnToken(columnName) {
  return String(columnName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickSourceLedgerColumn(columnNames, candidates = [], tokens = []) {
  const exact = pickEnquiryColumn(columnNames, candidates);
  if (exact) return exact;
  const normalisedTokens = tokens.map(normaliseColumnToken).filter(Boolean);
  if (!normalisedTokens.length) return null;
  for (const columnName of columnNames) {
    const normalisedColumn = normaliseColumnToken(columnName);
    if (normalisedColumn.endsWith('id') || normalisedColumn.endsWith('ids')) continue;
    if (normalisedTokens.some((token) => normalisedColumn === token || normalisedColumn.includes(token))) {
      return columnName;
    }
  }
  return null;
}

async function getInstructionsEnquiryColumns(instructionsConnectionString) {
  const result = await withRequest(instructionsConnectionString, async (request) => request.query(`
    SELECT COLUMN_NAME AS name
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'enquiries'
  `));
  return (result?.recordset || [])
    .map((row) => String(row.name || '').trim())
    .filter(Boolean);
}

function buildEmailListOverviewSql(columns) {
  const picked = {
    email: pickEnquiryColumn(columns, EMAIL_LIST_COLUMN_CANDIDATES.email),
    tags: pickEnquiryColumn(columns, EMAIL_LIST_COLUMN_CANDIDATES.tags),
    doNotMarket: pickEnquiryColumn(columns, EMAIL_LIST_COLUMN_CANDIDATES.doNotMarket),
    acid: pickEnquiryColumn(columns, EMAIL_LIST_COLUMN_CANDIDATES.acid),
    poc: pickEnquiryColumn(columns, EMAIL_LIST_COLUMN_CANDIDATES.poc),
  };

  const emailExpr = picked.email ? trimSqlTextExpr(safeSqlColumnRef(picked.email)) : 'NULL';
  const tagExpr = picked.tags ? trimSqlTextExpr(safeSqlColumnRef(picked.tags)) : 'NULL';
  const tagSearch = picked.tags ? tagSearchExpr(safeSqlColumnRef(picked.tags)) : "''";
  const digitTagSearch = picked.tags ? digitTagListExpr(safeSqlColumnRef(picked.tags)) : "''";
  const acidExpr = picked.acid ? trimSqlTextExpr(safeSqlColumnRef(picked.acid)) : 'NULL';
  const pocExpr = picked.poc ? trimSqlTextExpr(safeSqlColumnRef(picked.poc)) : 'NULL';
  const doNotMarketExpr = picked.doNotMarket
    ? `CASE WHEN TRY_CONVERT(bit, ${safeSqlColumnRef(picked.doNotMarket)}) = 1 OR LOWER(LTRIM(RTRIM(TRY_CONVERT(nvarchar(40), ${safeSqlColumnRef(picked.doNotMarket)})))) IN ('1', 'true', 'yes', 'y') THEN 1 ELSE 0 END`
    : '0';
  const digitPredicates = Array.from({ length: 10 }, (_, digit) => `${digitTagSearch} LIKE '%,${digit},%'`);
  const singleDigitExists = picked.tags ? `(${digitPredicates.join(' OR ')})` : '0 = 1';
  const doNotSendTagPredicate = picked.tags
    ? `(${tagSearch} LIKE '%do not send%' OR ${tagSearch} LIKE '%do-not-send%' OR ${tagSearch} LIKE '%do not email%' OR ${tagSearch} LIKE '%do not market%' OR ${tagSearch} LIKE '%no email%' OR ${tagSearch} LIKE '%no marketing%')`
    : '0 = 1';
  const unsubscribeTagPredicate = picked.tags
    ? `(${tagSearch} LIKE '%unsubscribe%' OR ${tagSearch} LIKE '%unsubscribed%' OR ${tagSearch} LIKE '%opt out%' OR ${tagSearch} LIKE '%opt-out%' OR ${tagSearch} LIKE '%opted out%')`
    : '0 = 1';
  const suppressionTagPredicate = picked.tags
    ? `(${tagSearch} LIKE '%suppress%' OR ${tagSearch} LIKE '%suppression%' OR ${tagSearch} LIKE '%gdpr%' OR ${tagSearch} LIKE '%privacy%')`
    : '0 = 1';
  const complaintTagPredicate = picked.tags
    ? `(${tagSearch} LIKE '%spam%' OR ${tagSearch} LIKE '%complaint%' OR ${tagSearch} LIKE '%bounce%' OR ${tagSearch} LIKE '%invalid email%')`
    : '0 = 1';
  const anyBlockerPredicate = `((${doNotMarketExpr}) = 1 OR ${doNotSendTagPredicate} OR ${unsubscribeTagPredicate} OR ${suppressionTagPredicate} OR ${complaintTagPredicate})`;
  const pocUnclaimedPredicate = picked.poc
    ? `(${pocExpr} IS NULL OR LOWER(${pocExpr}) IN ('team@helix-law.com', 'team', 'team inbox'))`
    : '0 = 1';

  return {
    picked,
    summarySql: `
      SELECT
        COUNT_BIG(*) AS totalRows,
        SUM(CASE WHEN ${emailExpr} IS NOT NULL THEN 1 ELSE 0 END) AS withEmail,
        SUM(CASE WHEN ${emailExpr} IS NULL THEN 1 ELSE 0 END) AS withoutEmail,
        SUM(CASE WHEN ${emailExpr} IS NOT NULL AND CHARINDEX('@', ${emailExpr}) > 1 THEN 1 ELSE 0 END) AS emailLooksUsable,
        SUM(CASE WHEN ${tagExpr} IS NOT NULL THEN 1 ELSE 0 END) AS withTags,
        SUM(CASE WHEN ${singleDigitExists} THEN 1 ELSE 0 END) AS withSingleDigitTags,
        SUM(CASE WHEN ${acidExpr} IS NOT NULL THEN 1 ELSE 0 END) AS withActiveCampaignBridge,
        SUM(CASE WHEN ${acidExpr} IS NULL THEN 1 ELSE 0 END) AS withoutActiveCampaignBridge,
        SUM(CASE WHEN ${pocUnclaimedPredicate} THEN 1 ELSE 0 END) AS unclaimed,
        SUM(CASE WHEN (${doNotMarketExpr}) = 1 THEN 1 ELSE 0 END) AS doNotMarketColumn,
        SUM(CASE WHEN ${doNotSendTagPredicate} THEN 1 ELSE 0 END) AS doNotSendTags,
        SUM(CASE WHEN ${unsubscribeTagPredicate} THEN 1 ELSE 0 END) AS unsubscribeTags,
        SUM(CASE WHEN ${suppressionTagPredicate} THEN 1 ELSE 0 END) AS suppressionTags,
        SUM(CASE WHEN ${complaintTagPredicate} THEN 1 ELSE 0 END) AS complaintTags,
        SUM(CASE WHEN ${anyBlockerPredicate} THEN 1 ELSE 0 END) AS knownBlocked,
        SUM(CASE WHEN ${emailExpr} IS NOT NULL AND NOT (${anyBlockerPredicate}) THEN 1 ELSE 0 END) AS candidateRows
      FROM dbo.enquiries AS e;
    `,
    digitSql: picked.tags ? `
      ${Array.from({ length: 10 }, (_, digit) => `
        SELECT '${digit}' AS digit, SUM(CASE WHEN ${digitTagSearch} LIKE '%,${digit},%' THEN 1 ELSE 0 END) AS count
        FROM dbo.enquiries AS e
      `).join('\nUNION ALL\n')}
      ORDER BY digit ASC;
    ` : null,
  };
}

function buildEmailListStreamSql(columns, areaFilter = 'all', dateRange = null) {
  const normalisedAreaFilters = normaliseEmailListAreaFilters(areaFilter);
  const normalisedAreaFilter = normalisedAreaFilters.length > 0 ? normalisedAreaFilters.join(',') : 'all';
  const picked = {
    id: pickEnquiryColumn(columns, EMAIL_LIST_COLUMN_CANDIDATES.id),
    datetime: pickEnquiryColumn(columns, EMAIL_LIST_COLUMN_CANDIDATES.datetime),
    email: pickEnquiryColumn(columns, EMAIL_LIST_COLUMN_CANDIDATES.email),
    aow: pickEnquiryColumn(columns, EMAIL_LIST_COLUMN_CANDIDATES.aow),
    moc: pickEnquiryColumn(columns, EMAIL_LIST_COLUMN_CANDIDATES.moc),
    tags: pickEnquiryColumn(columns, EMAIL_LIST_COLUMN_CANDIDATES.tags),
    acid: pickEnquiryColumn(columns, EMAIL_LIST_COLUMN_CANDIDATES.acid),
  };

  const idExpr = picked.id ? safeSqlColumnRef(picked.id) : 'NULL';
  const datetimeExpr = picked.datetime ? safeSqlColumnRef(picked.datetime) : 'NULL';
  const emailExpr = picked.email ? trimSqlTextExpr(safeSqlColumnRef(picked.email)) : 'NULL';
  const aowExpr = picked.aow ? trimSqlTextExpr(safeSqlColumnRef(picked.aow)) : 'NULL';
  const areaBucketExpr = picked.aow ? `COALESCE(${trimSqlTextExpr(safeSqlColumnRef(picked.aow), 255)}, 'Uncategorised')` : `'Uncategorised'`;
  const areaLowerExpr = picked.aow ? `LOWER(COALESCE(${trimSqlTextExpr(safeSqlColumnRef(picked.aow), 255)}, ''))` : `''`;
  const mocExpr = picked.moc ? trimSqlTextExpr(safeSqlColumnRef(picked.moc)) : 'NULL';
  const tagExpr = picked.tags ? trimSqlTextExpr(safeSqlColumnRef(picked.tags)) : 'NULL';
  const acidExpr = picked.acid ? trimSqlTextExpr(safeSqlColumnRef(picked.acid)) : 'NULL';
  const orderClause = picked.datetime
    ? `${safeSqlColumnRef(picked.datetime)} DESC, ${idExpr} DESC`
    : picked.id
      ? `${idExpr} DESC`
      : '(SELECT NULL)';
  const dateWhereConditions = picked.datetime && dateRange?.startDate && dateRange?.endDate
    ? [
        `${datetimeExpr} >= CONVERT(datetime2, @dateFrom, 23)`,
        `${datetimeExpr} < DATEADD(day, 1, CONVERT(datetime2, @dateTo, 23))`,
      ]
    : [];
  const streamWhereConditions = [
    `${emailExpr} IS NOT NULL`,
    emailListAreaFilterPredicate(areaLowerExpr, normalisedAreaFilters),
    ...dateWhereConditions,
  ].filter(Boolean);
  const areaWhereConditions = [
    `${emailExpr} IS NOT NULL`,
    ...dateWhereConditions,
  ].filter(Boolean);

  return {
    picked,
    areaFilter: normalisedAreaFilter,
    areaFilters: normalisedAreaFilters,
    dateRange,
    dateRangeApplied: dateWhereConditions.length > 0,
    sql: `
      SELECT TOP (@limit)
        COUNT_BIG(*) OVER() AS totalMatching,
        ${idExpr} AS enquiryId,
        ${datetimeExpr} AS receivedAt,
        ${emailExpr} AS email,
        ${aowExpr} AS areaOfWork,
        ${mocExpr} AS methodOfContact,
        ${tagExpr} AS tagText,
        ${acidExpr} AS activeCampaignId
      FROM dbo.enquiries AS e
      WHERE ${streamWhereConditions.join('\n        AND ')}
      ORDER BY ${orderClause};
    `,
    areaBreakdownSql: `
      SELECT
        areaOfWork,
        COUNT_BIG(*) AS count
      FROM (
        SELECT ${areaBucketExpr} AS areaOfWork
        FROM dbo.enquiries AS e
        WHERE ${areaWhereConditions.join('\n          AND ')}
      ) AS areaRows
      GROUP BY areaOfWork
      ORDER BY COUNT_BIG(*) DESC, areaOfWork ASC;
    `,
  };
}

async function getEmailListActiveCampaignConfig() {
  const [apiToken, baseUrlSecret] = await Promise.all([
    getSecret('ac-automations-apitoken').catch(() => null),
    getSecret('ac-base-url').catch(() => null),
  ]);
  if (!apiToken) return { ok: false, error: 'ActiveCampaign token is not configured' };
  return {
    ok: true,
    apiToken,
    baseUrl: String(baseUrlSecret || 'https://helix-law54533.api-us1.com/api/3').replace(/\/$/, ''),
  };
}

async function fetchActiveCampaignJson(config, path, searchParams) {
  const url = new URL(`${config.baseUrl}${path}`);
  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (value != null && String(value).trim()) url.searchParams.set(key, String(value));
  });
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Api-Token': config.apiToken,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = null; }
  }
  if (!response.ok) {
    const error = new Error(`ActiveCampaign request failed with ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return payload || {};
}

function mapActiveCampaignContact(contact) {
  const record = contact && typeof contact === 'object' ? contact : {};
  return {
    id: record.id == null ? '' : String(record.id),
    email: record.email == null ? '' : String(record.email),
    firstName: record.firstName == null ? '' : String(record.firstName),
    lastName: record.lastName == null ? '' : String(record.lastName),
    phone: record.phone == null ? '' : String(record.phone),
    status: record.status == null ? '' : String(record.status),
    createdAt: record.cdate == null ? null : String(record.cdate),
    updatedAt: record.udate == null ? null : String(record.udate),
  };
}

async function resolveActiveCampaignContact(config, { activeCampaignId, email }) {
  const contactId = String(activeCampaignId || '').trim();
  if (contactId) {
    const payload = await fetchActiveCampaignJson(config, `/contacts/${encodeURIComponent(contactId)}`);
    return { source: 'activeCampaignId', contact: mapActiveCampaignContact(payload.contact) };
  }

  const lookupEmail = String(email || '').trim();
  if (!lookupEmail) {
    const error = new Error('ActiveCampaign id or email is required');
    error.statusCode = 400;
    throw error;
  }
  const payload = await fetchActiveCampaignJson(config, '/contacts', { email: lookupEmail });
  const contact = Array.isArray(payload.contacts) ? payload.contacts.find((entry) => entry?.id != null) : null;
  if (!contact) {
    const error = new Error('ActiveCampaign contact was not found');
    error.statusCode = 404;
    throw error;
  }
  return { source: 'email', contact: mapActiveCampaignContact(contact) };
}

function canAccessSourceLedger(req) {
  const initials = String(req.user?.initials || req.headers?.['x-helix-initials'] || '').trim().toUpperCase();
  if (SOURCE_LEDGER_DEV_PREVIEW_INITIALS.has(initials)) return true;
  return process.env.NODE_ENV !== 'production' && !req.user;
}

function denySourceLedger(req, res, operation) {
  const initials = String(req.user?.initials || req.headers?.['x-helix-initials'] || '').trim().toUpperCase();
  trackEvent('Enquiry.Source.AccessDenied', {
    operation,
    triggeredBy: 'api',
    userInitials: initials || 'unknown',
  });
  return res.status(403).json({ error: 'Forbidden' });
}

function getSourceLedgerAttributionColumns(columnNames) {
  return {
    campaign: pickSourceLedgerColumn(columnNames, SOURCE_LEDGER_COLUMN_CANDIDATES.campaign, SOURCE_LEDGER_COLUMN_TOKENS.campaign),
    keyword: pickSourceLedgerColumn(columnNames, SOURCE_LEDGER_COLUMN_CANDIDATES.keyword, SOURCE_LEDGER_COLUMN_TOKENS.keyword),
  };
}

function sourceLedgerTextProjection(columnName, alias) {
  return columnName
    ? `${trimSqlTextExpr(safeSqlColumnRef(columnName), 255)} AS ${alias}`
    : `CAST(NULL AS nvarchar(255)) AS ${alias}`;
}

const normaliseSourceLedgerSort = (rawSort, rawDirection, attributionColumns = {}) => {
  const sortKey = String(rawSort || 'date').trim().toLowerCase();
  const direction = String(rawDirection || 'desc').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const requestedColumn = sortKey === 'campaign'
    ? attributionColumns.campaign
    : sortKey === 'keyword'
      ? attributionColumns.keyword
      : SOURCE_LEDGER_SORT_FIELDS[sortKey];
  const safeSortKey = requestedColumn ? sortKey : 'date';
  const column = requestedColumn || SOURCE_LEDGER_SORT_FIELDS.date;
  return {
    sortKey: safeSortKey,
    direction,
    orderClause: `${safeSqlColumnRef(column)} ${direction}, ${safeSqlColumnRef('id')} DESC`,
  };
};

function normaliseSourceLedgerDateRange(rawFrom, rawTo) {
  const parseDate = (value) => {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const parsed = new Date(`${text}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  };
  const from = parseDate(rawFrom);
  const to = parseDate(rawTo);
  if (!from || !to || from > to) return { from: null, toExclusive: null };
  const toExclusive = new Date(to.getTime());
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { from, toExclusive };
}

const normaliseEditableLedgerTextValue = (value, maxLength = 255) => String(value ?? '').trim().slice(0, maxLength);

const normaliseEditableSourceValue = (value) => normaliseEditableLedgerTextValue(value, 255);

function normaliseEditableLedgerDateValue(value) {
  if (value == null) return null;
  const candidate = String(value).trim();
  if (!candidate) return null;
  const parsed = Date.parse(candidate);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return new Date(parsed);
}

function getSanitisedSourceLedgerUpdates(rawUpdates, columnNames = []) {
  const source = rawUpdates && typeof rawUpdates === 'object' ? rawUpdates : {};
  const updates = [];

  Object.entries(SOURCE_LEDGER_ROW_EDITABLE_FIELDS).forEach(([field, config]) => {
    if (!Object.prototype.hasOwnProperty.call(source, field)) return;
    const column = config.column || pickSourceLedgerColumn(columnNames, config.candidates || [], config.tokens || []);
    if (!column) {
      updates.push({ field, invalid: true, reason: `${field} column is not available in this enquiries space` });
      return;
    }

    if (config.type === 'datetime') {
      const nextValue = normaliseEditableLedgerDateValue(source[field]);
      if (Number.isNaN(nextValue)) {
        updates.push({ field, invalid: true, reason: 'Invalid datetime value' });
        return;
      }
      updates.push({ field, column, type: config.type, value: nextValue });
      return;
    }

    updates.push({
      field,
      column,
      type: config.type,
      value: normaliseEditableLedgerTextValue(source[field], config.maxLength),
    });
  });

  return updates;
}

async function invalidateSourceLedgerCaches(reason, payload = {}) {
  try { clearUnifiedMemoryCache(); } catch { /* ignore */ }
  try {
    const deletedData = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:data:*`);
    const deletedEnquiries = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:enquiries:*`);
    log.debug(`Invalidated cache after source ledger mutation (data:${deletedData}, enquiries:${deletedEnquiries})`);
  } catch (cacheError) {
    log.warn('Failed to invalidate cache after source ledger mutation:', cacheError?.message);
  }
  try { broadcastEnquiriesChanged({ changeType: payload.changeType || 'source-ledger-update', reason, ...payload }); } catch { /* non-blocking */ }
}

// Route: GET /api/enquiries-unified/source/options
// Returns aggregated editable field values only (no row-level client content).
router.get('/source/options', async (_req, res) => {
  const startedAt = Date.now();
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;

  if (!canAccessSourceLedger(_req)) {
    return denySourceLedger(_req, res, 'source-options');
  }

  trackEvent('Enquiry.Source.Options.Started', {
    operation: 'source-options',
    triggeredBy: 'api',
  });

  try {
    if (!instructionsConnectionString) {
      const durationMs = Date.now() - startedAt;
      trackEvent('Enquiry.Source.Options.Failed', {
        operation: 'source-options',
        triggeredBy: 'api',
        durationMs: String(durationMs),
        phase: 'config',
        error: 'Instructions database configuration missing',
      });
      return res.status(500).json({ error: 'Instructions database configuration missing' });
    }

    const result = await withRequest(instructionsConnectionString, async (request) => {
      return request.query(`
        SELECT
          fieldName,
          NULLIF(LTRIM(RTRIM(fieldValue)), '') AS value,
          COUNT_BIG(*) AS count
        FROM (
          SELECT 'source' AS fieldName, source AS fieldValue FROM dbo.enquiries
          UNION ALL
          SELECT 'aow' AS fieldName, aow AS fieldValue FROM dbo.enquiries
          UNION ALL
          SELECT 'moc' AS fieldName, moc AS fieldValue FROM dbo.enquiries
          UNION ALL
          SELECT 'poc' AS fieldName, poc AS fieldValue FROM dbo.enquiries
        ) AS fieldValues
        GROUP BY fieldName, NULLIF(LTRIM(RTRIM(fieldValue)), '')
        ORDER BY fieldName ASC, COUNT_BIG(*) DESC, NULLIF(LTRIM(RTRIM(fieldValue)), '') ASC
      `);
    });

    const fieldOptions = SOURCE_LEDGER_OPTION_FIELDS.reduce((acc, field) => {
      acc[field] = [];
      return acc;
    }, {});

    (result?.recordset || []).forEach((row) => {
      const fieldName = String(row.fieldName || '').trim().toLowerCase();
      if (!SOURCE_LEDGER_OPTION_FIELDS.includes(fieldName)) return;
      fieldOptions[fieldName].push({
        value: row.value == null ? '' : String(row.value),
        count: Number(row.count || 0),
      });
    });

    const options = fieldOptions.source || [];

    const durationMs = Date.now() - startedAt;
    trackEvent('Enquiry.Source.Options.Completed', {
      operation: 'source-options',
      triggeredBy: 'api',
      durationMs: String(durationMs),
      rowCount: String(options.length),
    });
    trackMetric('Enquiry.Source.Options.Duration', durationMs, {
      operation: 'source-options',
    });

    return res.json({
      options,
      fieldOptions,
      count: options.length,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, {
      operation: 'source-options',
      phase: 'query',
    });
    trackEvent('Enquiry.Source.Options.Failed', {
      operation: 'source-options',
      triggeredBy: 'api',
      durationMs: String(durationMs),
      error: error?.message || 'Unknown error',
    });
    log.error('Error loading enquiry source options:', error?.message || error);
    return res.status(500).json({ error: 'Failed to load enquiry source options' });
  }
});

// Route: GET /api/enquiries-unified/email-lists/overview
// Returns aggregate-only email list readiness counts from new-space enquiries.
router.get('/email-lists/overview', async (req, res) => {
  const startedAt = Date.now();
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  const operation = 'email-lists-overview';

  trackEvent('Enquiry.EmailLists.Overview.Started', {
    operation,
    triggeredBy: req.user?.initials || req.user?.email || 'api',
  });

  try {
    if (!instructionsConnectionString) {
      trackEvent('Enquiry.EmailLists.Overview.Failed', {
        operation,
        triggeredBy: req.user?.initials || req.user?.email || 'api',
        phase: 'config',
        error: 'Instructions database configuration missing',
      });
      return res.status(500).json({ error: 'Instructions database configuration missing' });
    }

    const columns = await getInstructionsEnquiryColumns(instructionsConnectionString);
    const { picked, summarySql, digitSql } = buildEmailListOverviewSql(columns);
    const [summaryResult, digitResult] = await Promise.all([
      withRequest(instructionsConnectionString, async (request) => request.query(summarySql)),
      digitSql
        ? withRequest(instructionsConnectionString, async (request) => request.query(digitSql))
        : Promise.resolve({ recordset: [] }),
    ]);

    const row = summaryResult?.recordset?.[0] || {};
    const toCount = (value) => Number(value || 0);
    const tagDigits = (digitResult?.recordset || []).map((entry) => ({
      digit: String(entry.digit || ''),
      count: toCount(entry.count),
    })).filter((entry) => /^[0-9]$/.test(entry.digit));

    const summary = {
      totalRows: toCount(row.totalRows),
      withEmail: toCount(row.withEmail),
      withoutEmail: toCount(row.withoutEmail),
      emailLooksUsable: toCount(row.emailLooksUsable),
      withTags: toCount(row.withTags),
      withSingleDigitTags: toCount(row.withSingleDigitTags),
      withActiveCampaignBridge: toCount(row.withActiveCampaignBridge),
      withoutActiveCampaignBridge: toCount(row.withoutActiveCampaignBridge),
      unclaimed: toCount(row.unclaimed),
      candidateRows: toCount(row.candidateRows),
      knownBlocked: toCount(row.knownBlocked),
    };
    const blockerBuckets = [
      { key: 'doNotMarket', label: 'Do not market field', count: toCount(row.doNotMarketColumn) },
      { key: 'doNotSendTags', label: 'Do not send tags', count: toCount(row.doNotSendTags) },
      { key: 'unsubscribeTags', label: 'Unsubscribe tags', count: toCount(row.unsubscribeTags) },
      { key: 'suppressionTags', label: 'Suppression/privacy tags', count: toCount(row.suppressionTags) },
      { key: 'complaintTags', label: 'Bounce/spam/complaint tags', count: toCount(row.complaintTags) },
    ];
    const missingColumns = Object.entries(picked)
      .filter(([, columnName]) => !columnName)
      .map(([key]) => key);
    const tagSignal = picked.tags ? 'explicit-tags' : 'missing';
    const missingSignals = [
      tagSignal === 'explicit-tags' ? null : 'explicitTags',
      picked.doNotMarket ? null : 'doNotMarket',
    ].filter(Boolean);
    const durationMs = Date.now() - startedAt;

    trackEvent('Enquiry.EmailLists.Overview.Completed', {
      operation,
      triggeredBy: req.user?.initials || req.user?.email || 'api',
      durationMs: String(durationMs),
      rowCount: String(summary.totalRows),
      blockerCount: String(summary.knownBlocked),
      missingColumns: missingColumns.join(','),
    });
    trackMetric('Enquiry.EmailLists.Overview.Duration', durationMs, { operation });
    trackMetric('Enquiry.EmailLists.Overview.Rows', summary.totalRows, { operation });

    return res.json({
      source: 'instructions.dbo.enquiries',
      generatedAt: new Date().toISOString(),
      summary,
      blockerBuckets,
      tagDigits,
      columns: {
        email: Boolean(picked.email),
        tags: Boolean(picked.tags),
        doNotMarket: Boolean(picked.doNotMarket),
        acid: Boolean(picked.acid),
        poc: Boolean(picked.poc),
      },
      signals: {
        tagSignal,
        tagField: picked.tags || null,
        explicitTags: tagSignal === 'explicit-tags',
        doNotMarket: Boolean(picked.doNotMarket),
      },
      missingColumns,
      missingSignals,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'aggregate-query' });
    trackEvent('Enquiry.EmailLists.Overview.Failed', {
      operation,
      triggeredBy: req.user?.initials || req.user?.email || 'api',
      durationMs: String(durationMs),
      error: error?.message || 'Unknown error',
    });
    log.error('Error loading email lists overview:', error?.message || error);
    return res.status(500).json({ error: 'Failed to load email list overview' });
  }
});

// Route: GET /api/enquiries-unified/email-lists/stream
// Returns a narrow CRM-style stream for Email Lists. This endpoint includes client email addresses,
// so it is consent-gated and only returns the fields needed for list management.
router.get('/email-lists/stream', async (req, res) => {
  const startedAt = Date.now();
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  const operation = 'email-lists-stream';
  const requestedLimit = Number.parseInt(String(req.query.limit || '120'), 10);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 300)) : 120;
  const requestedAreaFilters = normaliseEmailListAreaFilters(req.query.area);
  const requestedAreaFilter = requestedAreaFilters.length > 0 ? requestedAreaFilters.join(',') : 'all';
  const triggeredBy = getEmailListOperatorActor(req) || req.user?.email || 'api';

  try {
    assertEmailListStreamConsent(req);
  } catch (error) {
    trackEvent('Enquiry.EmailLists.Stream.AccessDenied', {
      operation,
      triggeredBy: triggeredBy || 'unknown',
      reason: error?.message || 'Consent missing',
    });
    return res.status(error?.statusCode || 403).json({ error: 'Operator consent required for email list stream' });
  }

  let requestedDateRange;
  try {
    requestedDateRange = normaliseEmailListDateRange(req.query.dateFrom, req.query.dateTo);
  } catch (error) {
    trackEvent('Enquiry.EmailLists.Stream.Failed', {
      operation,
      triggeredBy,
      phase: 'date-range',
      error: error?.message || 'Invalid date range',
    });
    return res.status(error?.statusCode || 400).json({ error: error?.message || 'Invalid date range' });
  }

  trackEvent('Enquiry.EmailLists.Stream.Started', {
    operation,
    triggeredBy,
    limit: String(limit),
    areaFilter: requestedAreaFilter,
    dateFrom: requestedDateRange.startDate,
    dateTo: requestedDateRange.endDate,
  });

  try {
    if (!instructionsConnectionString) {
      trackEvent('Enquiry.EmailLists.Stream.Failed', {
        operation,
        triggeredBy,
        phase: 'config',
        error: 'Instructions database configuration missing',
      });
      return res.status(500).json({ error: 'Instructions database configuration missing' });
    }

    const columns = await getInstructionsEnquiryColumns(instructionsConnectionString);
    const { picked, areaFilter, areaFilters, dateRange, dateRangeApplied, sql: streamSql, areaBreakdownSql } = buildEmailListStreamSql(columns, requestedAreaFilters, requestedDateRange);
    if (!picked.email) {
      trackEvent('Enquiry.EmailLists.Stream.Failed', {
        operation,
        triggeredBy,
        phase: 'schema',
        error: 'Email column missing',
      });
      return res.status(500).json({ error: 'Email column missing from new-space enquiries' });
    }

    const [result, areaResult] = await Promise.all([
      withRequest(instructionsConnectionString, async (request) => {
        request.input('limit', sql.Int, limit);
        if (dateRangeApplied && dateRange) {
          request.input('dateFrom', sql.NVarChar(10), dateRange.startDate);
          request.input('dateTo', sql.NVarChar(10), dateRange.endDate);
        }
        return request.query(streamSql);
      }),
      withRequest(instructionsConnectionString, async (request) => {
        if (dateRangeApplied && dateRange) {
          request.input('dateFrom', sql.NVarChar(10), dateRange.startDate);
          request.input('dateTo', sql.NVarChar(10), dateRange.endDate);
        }
        return request.query(areaBreakdownSql);
      }),
    ]);

    const rows = (result?.recordset || []).map((row) => ({
      enquiryId: row.enquiryId == null ? '' : String(row.enquiryId),
      receivedAt: row.receivedAt ? new Date(row.receivedAt).toISOString() : null,
      email: row.email == null ? '' : String(row.email),
      areaOfWork: row.areaOfWork == null ? '' : String(row.areaOfWork),
      methodOfContact: row.methodOfContact == null ? '' : String(row.methodOfContact),
      activeCampaignId: row.activeCampaignId == null ? '' : String(row.activeCampaignId),
      tags: splitEmailListTagTokens(row.tagText),
    }));
    const totalMatching = Number(result?.recordset?.[0]?.totalMatching || rows.length || 0);
    const areaBreakdown = (areaResult?.recordset || [])
      .map((row) => ({
        areaOfWork: row.areaOfWork == null ? 'Uncategorised' : String(row.areaOfWork || '').trim() || 'Uncategorised',
        count: Number(row.count || 0),
      }))
      .filter((row) => row.count > 0);
    const tagSignal = picked.tags ? 'explicit-tags' : 'missing';
    const durationMs = Date.now() - startedAt;

    trackEvent('Enquiry.EmailLists.Stream.Completed', {
      operation,
      triggeredBy,
      durationMs: String(durationMs),
      rowCount: String(rows.length),
      totalMatching: String(totalMatching),
      areaBucketCount: String(areaBreakdown.length),
      areaFilter,
      dateFrom: dateRange?.startDate || '',
      dateTo: dateRange?.endDate || '',
      dateRangeApplied: String(Boolean(dateRangeApplied)),
      tagSignal,
    });
    trackMetric('Enquiry.EmailLists.Stream.Duration', durationMs, { operation });
    trackMetric('Enquiry.EmailLists.Stream.Rows', rows.length, { operation });

    return res.json({
      source: 'instructions.dbo.enquiries',
      generatedAt: new Date().toISOString(),
      count: rows.length,
      totalMatching,
      limit,
      areaFilter,
      areaFilters,
      dateRange: {
        startDate: dateRange?.startDate || null,
        endDate: dateRange?.endDate || null,
        applied: Boolean(dateRangeApplied),
        field: picked.datetime || null,
      },
      areaBreakdown,
      rows,
      columns: {
        email: Boolean(picked.email),
        areaOfWork: Boolean(picked.aow),
        methodOfContact: Boolean(picked.moc),
        tags: Boolean(picked.tags),
        activeCampaignId: Boolean(picked.acid),
      },
      signals: {
        tagSignal,
        tagField: picked.tags || null,
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'query' });
    trackEvent('Enquiry.EmailLists.Stream.Failed', {
      operation,
      triggeredBy,
      durationMs: String(durationMs),
      error: error?.message || 'Unknown error',
    });
    log.error('Error loading email lists stream:', error?.message || error);
    return res.status(500).json({ error: 'Failed to load email list stream' });
  }
});

// Route: POST /api/enquiries-unified/email-lists/test-send
// Sends a real SendGrid test email for the demo Email Control Room row only.
router.post('/email-lists/test-send', async (req, res) => {
  const startedAt = Date.now();
  const operation = 'email-lists-sendgrid-test-send';
  const requestId = randomUUID();
  const triggeredBy = getEmailListOperatorActor(req) || req.user?.email || 'api';

  try {
    assertEmailListStreamConsent(req);
  } catch (error) {
    trackEvent('Enquiry.EmailLists.SendGridTest.AccessDenied', {
      operation,
      requestId,
      triggeredBy: triggeredBy || 'unknown',
      reason: error?.message || 'Consent missing',
    });
    return res.status(error?.statusCode || 403).json({ error: 'Operator consent required for SendGrid test email' });
  }

  const isDemoMode = req.body?.demoMode === true || String(req.body?.demoMode || '').toLowerCase() === 'true';
  const enquiryId = String(req.body?.enquiryId || '').trim().toUpperCase();
  const subject = String(req.body?.subject || '').trim();
  const bodyText = String(req.body?.body || req.body?.bodyText || '').trim();
  const preheaderText = String(req.body?.preheader || req.body?.previewText || '').trim().slice(0, 180);
  const campaignName = String(req.body?.campaignName || '').trim().slice(0, 120);
  const authenticatedEmail = normalizeEmails(req.user?.email || req.headers?.['x-user-email'])[0] || '';
  const requestedRecipient = normalizeEmails(req.body?.recipientEmail || req.body?.toEmail)[0] || '';
  const recipientEmail = authenticatedEmail || requestedRecipient;
  const senderEmail = resolveEmailListSendGridSender(req.body?.sender || req.body?.fromEmail);
  const signatureInitials = String(req.body?.signatureInitials || req.user?.initials || '').trim().toUpperCase();
  const signatureMode = normaliseEmailListSignatureMode(req.body?.signatureMode);
  const operatorDisplayName = String(req.body?.operatorName || req.user?.name || req.user?.displayName || '').trim();
  const operatorSignatureEmail = authenticatedEmail || normalizeEmails(req.body?.operatorEmail)[0] || recipientEmail;

  if (!isDemoMode || !enquiryId.startsWith(EMAIL_LIST_DEMO_ENQUIRY_PREFIX)) {
    return res.status(400).json({ error: 'SendGrid test emails are restricted to demo enquiries' });
  }
  if (authenticatedEmail && requestedRecipient && authenticatedEmail.toLowerCase() !== requestedRecipient.toLowerCase()) {
    return res.status(400).json({ error: 'Test email recipient must be the current user' });
  }
  if (!recipientEmail || !/@helix-law\.com$/i.test(recipientEmail)) {
    return res.status(400).json({ error: 'A current Helix user email is required' });
  }
  if (!senderEmail) {
    return res.status(400).json({ error: 'Unsupported SendGrid sender' });
  }
  if (!subject || !bodyText) {
    return res.status(400).json({ error: 'Subject and body are required' });
  }

  trackEvent('Enquiry.EmailLists.SendGridTest.Started', {
    operation,
    requestId,
    triggeredBy,
    sender: senderEmail,
    enquiryId,
    subjectLength: String(subject.length),
    bodyLength: String(bodyText.length),
    preheaderLength: String(preheaderText.length),
    campaignNameLength: String(campaignName.length),
    signatureMode,
  });

  try {
    const apiKey = await getEmailListSendGridApiKey();
    if (!apiKey) {
      trackEvent('Enquiry.EmailLists.SendGridTest.Failed', {
        operation,
        requestId,
        triggeredBy,
        phase: 'config',
        error: 'SendGrid API key missing',
      });
      return res.status(503).json({ error: 'SendGrid is not configured. Add SENDGRID_API_KEY, HELIX_SENDGRID_API_KEY, or Key Vault secret sendgrid-helix-email.' });
    }

    const html = buildEmailListSendGridHtml({
      bodyText,
      preheaderText,
      fromEmail: senderEmail,
      signatureInitials,
      signatureMode,
      operatorName: operatorDisplayName,
      operatorEmail: operatorSignatureEmail,
    });
    const plainText = preheaderText ? `${preheaderText}\n\n${bodyText}` : bodyText;
    const sendGridPayload = {
      personalizations: [{
        to: [{ email: recipientEmail }],
        custom_args: {
          source: 'email-control-room',
          mode: 'demo-test',
          enquiryId,
          requestId,
          signatureMode,
        },
      }],
      from: { email: senderEmail, name: 'Helix Law' },
      reply_to: { email: 'support@helix-law.com', name: 'Helix Law' },
      subject,
      content: [
        { type: 'text/plain', value: plainText },
        { type: 'text/html', value: html },
      ],
      categories: ['email-control-room', 'demo-test'],
    };

    const sendGridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sendGridPayload),
    });
    const durationMs = Date.now() - startedAt;
    const sendGridMessageId = sendGridResponse.headers.get('x-message-id') || '';

    if (sendGridResponse.status !== 202) {
      const errorText = await sendGridResponse.text();
      trackEvent('Enquiry.EmailLists.SendGridTest.Failed', {
        operation,
        requestId,
        triggeredBy,
        phase: 'sendgrid',
        statusCode: String(sendGridResponse.status),
        durationMs: String(durationMs),
        error: errorText ? 'SendGrid rejected request' : 'SendGrid rejected request without body',
      });
      return res.status(502).json({ error: 'SendGrid rejected the test email' });
    }

    trackEvent('Enquiry.EmailLists.SendGridTest.Completed', {
      operation,
      requestId,
      triggeredBy,
      sender: senderEmail,
      enquiryId,
      durationMs: String(durationMs),
      sendGridMessageId,
    });
    trackMetric('Enquiry.EmailLists.SendGridTest.Duration', durationMs, { operation });

    return res.json({
      success: true,
      provider: 'sendgrid',
      mode: 'demo-test',
      signatureMode,
      enquiryId,
      requestId,
      sendGridMessageId,
      message: 'Test email sent',
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'sendgrid-test-send', requestId });
    trackEvent('Enquiry.EmailLists.SendGridTest.Failed', {
      operation,
      requestId,
      triggeredBy,
      durationMs: String(durationMs),
      error: error?.message ? 'SendGrid test send failed' : 'Unknown error',
    });
    log.error('Error sending Email Control Room SendGrid test email:', error?.message || error);
    return res.status(500).json({ error: 'Failed to send SendGrid test email' });
  }
});

// Route: POST /api/enquiries-unified/email-lists/activecampaign-contact
// Looks up a single ActiveCampaign record on explicit operator action. Responses can contain
// client contact details and are guarded with the same Email Lists read consent as the stream.
router.post('/email-lists/activecampaign-contact', async (req, res) => {
  const startedAt = Date.now();
  const operation = 'email-lists-activecampaign-contact';
  const triggeredBy = getEmailListOperatorActor(req) || req.user?.email || 'api';

  try {
    assertEmailListStreamConsent(req);
  } catch (error) {
    trackEvent('Enquiry.EmailLists.ActiveCampaign.AccessDenied', {
      operation,
      triggeredBy: triggeredBy || 'unknown',
      reason: error?.message || 'Consent missing',
    });
    return res.status(error?.statusCode || 403).json({ error: 'Operator consent required for ActiveCampaign lookup' });
  }

  trackEvent('Enquiry.EmailLists.ActiveCampaign.Started', {
    operation,
    triggeredBy,
    hasActiveCampaignId: String(Boolean(String(req.body?.activeCampaignId || '').trim())),
    hasEmail: String(Boolean(String(req.body?.email || '').trim())),
  });

  try {
    const config = await getEmailListActiveCampaignConfig();
    if (!config.ok) {
      trackEvent('Enquiry.EmailLists.ActiveCampaign.Failed', {
        operation,
        triggeredBy,
        phase: 'config',
        error: config.error || 'ActiveCampaign configuration missing',
      });
      return res.status(503).json({ error: 'ActiveCampaign is not configured' });
    }

    const lookup = await resolveActiveCampaignContact(config, {
      activeCampaignId: req.body?.activeCampaignId,
      email: req.body?.email,
    });
    const durationMs = Date.now() - startedAt;

    trackEvent('Enquiry.EmailLists.ActiveCampaign.Completed', {
      operation,
      triggeredBy,
      durationMs: String(durationMs),
      lookupSource: lookup.source,
      found: String(Boolean(lookup.contact?.id)),
    });
    trackMetric('Enquiry.EmailLists.ActiveCampaign.Duration', durationMs, { operation });

    return res.json({
      source: 'activecampaign',
      generatedAt: new Date().toISOString(),
      lookupSource: lookup.source,
      contact: lookup.contact,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const statusCode = Number(error?.statusCode || 500);
    trackException(error, { operation, phase: 'lookup' });
    trackEvent('Enquiry.EmailLists.ActiveCampaign.Failed', {
      operation,
      triggeredBy,
      durationMs: String(durationMs),
      statusCode: String(statusCode),
      error: error?.message ? 'lookup failed' : 'Unknown error',
    });
    log.error('Error loading ActiveCampaign contact for Email Lists:', error?.message || error);
    return res.status(statusCode >= 400 && statusCode < 500 ? statusCode : 500).json({
      error: statusCode === 404 ? 'ActiveCampaign contact not found' : 'Failed to load ActiveCampaign contact',
    });
  }
});

// Route: POST /api/enquiries-unified/source/row-update
// Updates editable Instructions ledger fields for a single enquiry row.
router.post('/source/row-update', async (req, res) => {
  const startedAt = Date.now();
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  const parsedId = Number.parseInt(String(req.body?.id || ''), 10);
  const operation = 'source-ledger-row-update';

  if (!canAccessSourceLedger(req)) {
    return denySourceLedger(req, res, operation);
  }

  if (!Number.isFinite(parsedId) || parsedId <= 0) {
    return res.status(400).json({ error: 'Valid enquiry id is required' });
  }

  if (!instructionsConnectionString) {
    return res.status(500).json({ error: 'Instructions database configuration missing' });
  }

  try {
    const sourceLedgerColumnNames = await getInstructionsEnquiryColumns(instructionsConnectionString);
    const updates = getSanitisedSourceLedgerUpdates(req.body?.updates, sourceLedgerColumnNames);
    const invalidUpdate = updates.find((entry) => entry.invalid);
    if (invalidUpdate) {
      return res.status(400).json({ error: invalidUpdate.reason || 'Invalid update payload' });
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'At least one editable field update is required' });
    }

    trackEvent('Enquiry.Source.RowUpdate.Started', {
      operation,
      triggeredBy: 'api',
      updatedFields: updates.map((entry) => entry.field).join(','),
    });

    const result = await withRequest(instructionsConnectionString, async (request) => {
      request.input('id', sql.Int, parsedId);

      const setClauses = updates.map((entry) => {
        const parameterName = `value_${entry.field}`;
        if (entry.type === 'datetime') {
          request.input(parameterName, sql.DateTime2, entry.value);
        } else {
          request.input(parameterName, sql.NVarChar(entry.field === 'url' ? 500 : 255), entry.value);
        }
        return `${safeSqlColumnRef(entry.column, '')} = @${parameterName}`;
      });

      return request.query(`
        SET XACT_ABORT ON;
        DECLARE @rowsAffected INT = 0;
        BEGIN TRANSACTION;
        UPDATE dbo.enquiries
        SET ${setClauses.join(', ')}
        WHERE id = @id;
        SET @rowsAffected = @@ROWCOUNT;
        COMMIT TRANSACTION;
        SELECT @rowsAffected AS rowsAffected;
      `);
    });

    const rowsAffected = Number(result?.recordset?.[0]?.rowsAffected || 0);
    const updatedFields = updates.map((entry) => entry.field);
    await invalidateSourceLedgerCaches(operation, {
      enquiryId: String(parsedId),
      changeType: 'source-ledger-row-update',
      updatedFields: updatedFields.join(','),
    });
    try { emitEvent('enquiry.source_changed', 'tab-app', String(parsedId), 'enquiry', { updatedFields }); } catch { /* non-blocking */ }

    const durationMs = Date.now() - startedAt;
    trackEvent('Enquiry.Source.RowUpdate.Completed', {
      operation,
      triggeredBy: 'api',
      rowsAffected: String(rowsAffected),
      durationMs: String(durationMs),
      updatedFields: updatedFields.join(','),
    });
    trackMetric('Enquiry.Source.RowUpdate.Duration', durationMs, { operation });

    return res.json({ success: true, rowsAffected, updatedFields });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'update-row' });
    trackEvent('Enquiry.Source.RowUpdate.Failed', {
      operation,
      triggeredBy: 'api',
      durationMs: String(durationMs),
      error: error?.message || 'Unknown error',
    });
    log.error('Error updating enquiry source ledger row:', error?.message || error);
    return res.status(500).json({ error: 'Failed to update enquiry row' });
  }
});

// Route: GET /api/enquiries-unified/source/ledger
// Returns a lean non-PII ledger for source management.
router.get('/source/ledger', async (req, res) => {
  const startedAt = Date.now();
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  const requestedLimit = Number.parseInt(String(req.query.limit || SOURCE_LEDGER_DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, SOURCE_LEDGER_MAX_LIMIT))
    : SOURCE_LEDGER_DEFAULT_LIMIT;
  const requestedOffset = Number.parseInt(String(req.query.offset || '0'), 10);
  const offset = Number.isFinite(requestedOffset)
    ? Math.max(0, Math.min(requestedOffset, SOURCE_LEDGER_MAX_OFFSET))
    : 0;
  const fetchLimit = limit + 1;
  const dateRange = normaliseSourceLedgerDateRange(req.query.dateFrom, req.query.dateTo);
  let sortSpec = normaliseSourceLedgerSort(req.query.sort, req.query.direction);

  if (!canAccessSourceLedger(req)) {
    return denySourceLedger(req, res, 'source-ledger');
  }

  trackEvent('Enquiry.Source.Ledger.Started', {
    operation: 'source-ledger',
    triggeredBy: 'api',
    sort: sortSpec.sortKey,
    direction: sortSpec.direction,
    limit: String(limit),
    offset: String(offset),
    dateFrom: dateRange.from ? dateRange.from.toISOString().slice(0, 10) : '',
    dateToExclusive: dateRange.toExclusive ? dateRange.toExclusive.toISOString().slice(0, 10) : '',
  });

  try {
    if (!instructionsConnectionString) {
      const durationMs = Date.now() - startedAt;
      trackEvent('Enquiry.Source.Ledger.Failed', {
        operation: 'source-ledger',
        triggeredBy: 'api',
        durationMs: String(durationMs),
        phase: 'config',
        sort: sortSpec.sortKey,
        direction: sortSpec.direction,
        limit: String(limit),
        offset: String(offset),
        dateFrom: dateRange.from ? dateRange.from.toISOString().slice(0, 10) : '',
        dateToExclusive: dateRange.toExclusive ? dateRange.toExclusive.toISOString().slice(0, 10) : '',
        error: 'Instructions database configuration missing',
      });
      return res.status(500).json({ error: 'Instructions database configuration missing' });
    }

    const sourceLedgerColumnNames = await getInstructionsEnquiryColumns(instructionsConnectionString);
    const attributionColumns = getSourceLedgerAttributionColumns(sourceLedgerColumnNames);
    sortSpec = normaliseSourceLedgerSort(req.query.sort, req.query.direction, attributionColumns);
    const campaignProjection = sourceLedgerTextProjection(attributionColumns.campaign, 'campaign');
    const keywordProjection = sourceLedgerTextProjection(attributionColumns.keyword, 'keyword');

    const result = await withRequest(instructionsConnectionString, async (request) => {
      request.input('offset', sql.Int, offset);
      request.input('fetchLimit', sql.Int, fetchLimit);
      if (dateRange.from && dateRange.toExclusive) {
        request.input('dateFrom', sql.DateTime2, dateRange.from);
        request.input('dateToExclusive', sql.DateTime2, dateRange.toExclusive);
      }
      const whereClause = dateRange.from && dateRange.toExclusive
        ? 'WHERE e.datetime >= @dateFrom AND e.datetime < @dateToExclusive'
        : '';
      return request.query(`
        SELECT
          e.id,
          e.acid,
          e.datetime,
          e.aow,
          e.moc,
          e.poc,
          e.phone,
          ${campaignProjection},
          ${keywordProjection},
          e.source,
          e.url,
          linkedMatter.displayNumber AS matterDisplayNumber
        FROM dbo.enquiries AS e
        OUTER APPLY (
          SELECT TOP (1)
            m.DisplayNumber AS displayNumber
          FROM dbo.Matters AS m
          WHERE TRY_CONVERT(varchar(50), m.EnquiryID) = TRY_CONVERT(varchar(50), e.id)
            AND LTRIM(RTRIM(ISNULL(TRY_CONVERT(varchar(50), m.DisplayNumber), ''))) <> ''
          ORDER BY m.MatterID DESC
        ) AS linkedMatter
        ${whereClause}
        ORDER BY ${sortSpec.orderClause}
        OFFSET @offset ROWS FETCH NEXT @fetchLimit ROWS ONLY
      `);
    });

    const rawRows = result?.recordset || [];
    const pageRows = rawRows.slice(0, limit);
    const hasMore = rawRows.length > limit;
    const rows = pageRows.map((row) => ({
      id: row.id == null ? null : Number(row.id),
      acid: row.acid == null ? '' : String(row.acid),
      datetime: row.datetime ? new Date(row.datetime).toISOString() : null,
      aow: row.aow == null ? '' : String(row.aow),
      moc: row.moc == null ? '' : String(row.moc),
      poc: row.poc == null ? '' : String(row.poc),
      phone: row.phone == null ? '' : String(row.phone),
      campaign: row.campaign == null ? '' : String(row.campaign),
      keyword: row.keyword == null ? '' : String(row.keyword),
      source: row.source == null ? '' : String(row.source),
      url: row.url == null ? '' : String(row.url),
      matterDisplayNumber: row.matterDisplayNumber == null ? '' : String(row.matterDisplayNumber),
    }));
    const nextOffset = hasMore ? offset + rows.length : null;

    const durationMs = Date.now() - startedAt;
    trackEvent('Enquiry.Source.Ledger.Completed', {
      operation: 'source-ledger',
      triggeredBy: 'api',
      sort: sortSpec.sortKey,
      direction: sortSpec.direction,
      limit: String(limit),
      offset: String(offset),
      dateFrom: dateRange.from ? dateRange.from.toISOString().slice(0, 10) : '',
      dateToExclusive: dateRange.toExclusive ? dateRange.toExclusive.toISOString().slice(0, 10) : '',
      hasMore: String(hasMore),
      rowCount: String(rows.length),
      durationMs: String(durationMs),
    });
    trackMetric('Enquiry.Source.Ledger.Duration', durationMs, {
      operation: 'source-ledger',
      sort: sortSpec.sortKey,
    });

    return res.json({
      rows,
      count: rows.length,
      sort: sortSpec.sortKey,
      direction: sortSpec.direction.toLowerCase(),
      limit,
      offset,
      hasMore,
      nextOffset,
      dateRange: {
        from: dateRange.from ? dateRange.from.toISOString().slice(0, 10) : null,
        to: dateRange.toExclusive ? new Date(dateRange.toExclusive.getTime() - 1).toISOString().slice(0, 10) : null,
      },
      columns: {
        campaign: Boolean(attributionColumns.campaign),
        keyword: Boolean(attributionColumns.keyword),
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, {
      operation: 'source-ledger',
      phase: 'query',
    });
    trackEvent('Enquiry.Source.Ledger.Failed', {
      operation: 'source-ledger',
      triggeredBy: 'api',
      durationMs: String(durationMs),
      sort: sortSpec.sortKey,
      direction: sortSpec.direction,
      limit: String(limit),
      offset: String(offset),
      dateFrom: dateRange.from ? dateRange.from.toISOString().slice(0, 10) : '',
      dateToExclusive: dateRange.toExclusive ? dateRange.toExclusive.toISOString().slice(0, 10) : '',
      error: error?.message || 'Unknown error',
    });
    log.error('Error loading enquiry source ledger:', error?.message || error);
    return res.status(500).json({ error: 'Failed to load enquiry source ledger' });
  }
});

// Route: POST /api/enquiries-unified/source/reassign
// Updates Instructions source values only. Responses and telemetry stay counts-only.
router.post('/source/reassign', async (req, res) => {
  const startedAt = Date.now();
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  const hasId = Object.prototype.hasOwnProperty.call(req.body || {}, 'id');
  const hasFrom = Object.prototype.hasOwnProperty.call(req.body || {}, 'from');
  const targetSource = normaliseEditableSourceValue(req.body?.to);
  const mode = hasId ? 'single' : hasFrom ? 'bulk' : 'unknown';
  const operation = mode === 'bulk' ? 'source-reassign-bulk' : 'source-reassign-single';

  if (!canAccessSourceLedger(req)) {
    return denySourceLedger(req, res, operation);
  }

  if (!targetSource) {
    return res.status(400).json({ error: 'Target source is required' });
  }

  if (hasId === hasFrom) {
    return res.status(400).json({ error: 'Provide either id or from, not both' });
  }

  if (!instructionsConnectionString) {
    return res.status(500).json({ error: 'Instructions database configuration missing' });
  }

  const parsedId = hasId ? Number.parseInt(String(req.body.id), 10) : null;
  const fromSource = hasFrom ? normaliseEditableSourceValue(req.body.from) : '';
  if (hasId && (!Number.isFinite(parsedId) || parsedId <= 0)) {
    return res.status(400).json({ error: 'Valid enquiry id is required' });
  }

  trackEvent(`Enquiry.Source.${mode === 'bulk' ? 'ReassignBulk' : 'ReassignSingle'}.Started`, {
    operation,
    triggeredBy: 'api',
    mode,
  });

  try {
    const result = await withRequest(instructionsConnectionString, async (request) => {
      request.input('to', sql.NVarChar(255), targetSource);

      if (mode === 'single') {
        request.input('id', sql.Int, parsedId);
        return request.query(`
          SET XACT_ABORT ON;
          DECLARE @rowsAffected INT = 0;
          BEGIN TRANSACTION;
          UPDATE dbo.enquiries
          SET source = @to
          WHERE id = @id;
          SET @rowsAffected = @@ROWCOUNT;
          COMMIT TRANSACTION;
          SELECT @rowsAffected AS rowsAffected;
        `);
      }

      request.input('from', sql.NVarChar(255), fromSource);
      const fromPredicate = fromSource
        ? 'LOWER(LTRIM(RTRIM(source))) = LOWER(@from)'
        : "NULLIF(LTRIM(RTRIM(source)), '') IS NULL";

      return request.query(`
        SET XACT_ABORT ON;
        DECLARE @rowsAffected INT = 0;
        BEGIN TRANSACTION;
        UPDATE dbo.enquiries
        SET source = @to
        WHERE ${fromPredicate};
        SET @rowsAffected = @@ROWCOUNT;
        COMMIT TRANSACTION;
        SELECT @rowsAffected AS rowsAffected;
      `);
    });

    const rowsAffected = Number(result?.recordset?.[0]?.rowsAffected || 0);
    await invalidateSourceLedgerCaches(operation, mode === 'single' ? { enquiryId: String(parsedId) } : { mode: 'bulk' });
    if (mode === 'single') {
      try { emitEvent('enquiry.source_changed', 'tab-app', String(parsedId), 'enquiry', { updatedFields: ['source'] }); } catch { /* non-blocking */ }
    }

    const durationMs = Date.now() - startedAt;
    trackEvent(`Enquiry.Source.${mode === 'bulk' ? 'ReassignBulk' : 'ReassignSingle'}.Completed`, {
      operation,
      triggeredBy: 'api',
      mode,
      rowsAffected: String(rowsAffected),
      durationMs: String(durationMs),
    });
    trackMetric(`Enquiry.Source.${mode === 'bulk' ? 'ReassignBulk' : 'ReassignSingle'}.Duration`, durationMs, { operation });

    return res.json({ success: true, mode, rowsAffected });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackException(error, { operation, phase: 'update-source', mode });
    trackEvent(`Enquiry.Source.${mode === 'bulk' ? 'ReassignBulk' : 'ReassignSingle'}.Failed`, {
      operation,
      triggeredBy: 'api',
      mode,
      durationMs: String(durationMs),
      error: error?.message || 'Unknown error',
    });
    log.error('Error reassigning enquiry source:', error?.message || error);
    return res.status(500).json({ error: 'Failed to reassign enquiry source' });
  }
});

// Route: GET /api/enquiries-unified
// Direct database connections to fetch enquiries from BOTH database sources
router.get('/', async (req, res) => {
  try {
    log.debug('Unified enquiries route called');

    // Parse query parameters for filtering and pagination
    const limit = Math.min(parseInt(req.query.limit, 10) || 1000, 2500); // Default 1000, max 2500
    const email = (req.query.email || '').trim().toLowerCase();
    const initials = (req.query.initials || '').trim().toLowerCase();
    const includeTeamInbox = String(req.query.includeTeamInbox || 'true').toLowerCase() === 'true';
    const fetchAll = String(req.query.fetchAll || 'false').toLowerCase() === 'true';
    const { sourcePolicy, sourceBias } = resolveSourceSelection({
      sourcePolicy: req.query.sourcePolicy,
      sourceBias: req.query.sourceBias,
    });
    const processingApproach = normaliseProcessingApproach(req.query.processingApproach);
    const dateFrom = req.query.dateFrom || '';
    const dateTo = req.query.dateTo || '';
    const prospectId = (req.query.prospectId || '').toString().trim();
    const hasProspectId = prospectId.length > 0;
    const bypassCache = String(req.query.bypassCache || 'false').toLowerCase() === 'true';
    const effectiveBypassCache = bypassCache || hasProspectId;
    
    log.debug('bypassCache parameter:', bypassCache);

    // Build cache params (not a prebuilt key) for consistent unified cache keys
    const cacheParams = [
      'enquiries-v5', // bump cache schema to invalidate old payloads
      limit,
      email,
      initials,
      includeTeamInbox,
      fetchAll,
      sourcePolicy,
      sourceBias,
      processingApproach,
      dateFrom,
      dateTo,
      prospectId
    ].filter(p => p !== '' && p !== null && p !== undefined);
    const memoryCacheKey = generateCacheKey(CACHE_CONFIG.PREFIXES.UNIFIED, 'data', ...cacheParams);
    // Phase 2B.6 (2026-04-27): Pre-stringified Redis passthrough.
    // The hot Redis-cache path was costing ~5-7s on a ~5MB payload because we
    // were doing JSON.parse → object spread → res.json restringify → gzip on
    // every hit. We now also store the final response as a JSON string under
    // `<key>:str` and, on cache hit, send it directly. The first response after
    // a server restart goes from ~7s → ~500ms; subsequent in-memory hits are
    // unchanged (still served from `unifiedMemoryCache`).
    const stringCacheKey = `${memoryCacheKey}:str`;

    if (!effectiveBypassCache) {
      const memoryEntry = getMemoryUnifiedEntry(memoryCacheKey);
      if (memoryEntry?.isFresh) {
        annotate(res, { source: 'memory' });
        return res.json({ ...memoryEntry.data, cached: true, source: 'memory' });
      }

      if (memoryEntry && !memoryEntry.refreshPromise) {
        const refreshPromise = (async () => {
          try {
            const freshData = await performUnifiedEnquiriesQuery(req.query);
            setMemoryUnifiedEntry(memoryCacheKey, freshData);
            // Refresh the string cache too so the next post-restart hit stays fast.
            try {
              await setCache(stringCacheKey, JSON.stringify({ ...freshData, cached: true, source: 'redis-str' }), CACHE_CONFIG.TTL.UNIFIED);
            } catch (_) { /* non-fatal */ }
          } catch (error) {
            log.warn('Background enquiries memory refresh failed:', error?.message || error);
          } finally {
            clearMemoryUnifiedRefreshPromise(memoryCacheKey);
          }
        })();

        setMemoryUnifiedRefreshPromise(memoryCacheKey, refreshPromise);
      }

      if (memoryEntry) {
        annotate(res, { source: 'stale', note: 'memory stale — refreshing' });
        return res.json({ ...memoryEntry.data, cached: true, source: 'memory-stale' });
      }

      // Memory cold (typical after server restart). Try the pre-stringified
      // Redis cache before falling through to the parsed cacheUnified path.
      try {
        const cachedStrEntry = await getCache(stringCacheKey);
        const cachedStr = cachedStrEntry?.data;
        if (typeof cachedStr === 'string' && cachedStr.length > 0) {
          annotate(res, { source: 'redis-str' });
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          return res.send(cachedStr);
        }
      } catch (_) { /* non-fatal — fall through */ }
    }

    // Use Redis cache wrapper if not bypassed
    if (!effectiveBypassCache) {
      const result = await cacheUnified(cacheParams, async () => {
        return await performUnifiedEnquiriesQuery(req.query);
      });
      setMemoryUnifiedEntry(memoryCacheKey, result);
      // Seed the string cache so the next post-restart hit takes the fast path.
      try {
        await setCache(stringCacheKey, JSON.stringify({ ...result, cached: true, source: 'redis-str' }), CACHE_CONFIG.TTL.UNIFIED);
      } catch (_) { /* non-fatal */ }
      annotate(res, { source: 'redis' });
      return res.json({ ...result, cached: true });
    }

    // Bypass cache - direct query
    const result = await performUnifiedEnquiriesQuery(req.query);
    setMemoryUnifiedEntry(memoryCacheKey, result);
    annotate(res, { source: 'sql', note: 'bypass-cache' });
    res.json({ ...result, cached: false });

  } catch (error) {
    log.error('Error in enquiries-unified route:', error?.message);
    // Return a tolerant 200 with warnings to avoid blocking the UI
    res.status(200).json({
      enquiries: [],
      count: 0,
      sources: { main: 0, instructions: 0, unique: 0 },
      warnings: [{ source: 'unified', message: error?.message || 'Unknown error' }],
      migration: { total: 0, migrated: 0, partial: 0, notMigrated: 0, instructionsOnly: 0, migrationRate: '0.0%', crossReferenceMap: {} }
    });
  }
});

/**
 * Perform the actual unified enquiries query (extracted for caching)
 */
async function performUnifiedEnquiriesQuery(queryParams) {
  log.debug('Performing fresh unified enquiries query');
  log.debug('Query params:', queryParams);

  const fetchAll = String(queryParams.fetchAll || 'false').toLowerCase() === 'true';
  const { sourcePolicy, sourceBias } = resolveSourceSelection({
    sourcePolicy: queryParams.sourcePolicy,
    sourceBias: queryParams.sourceBias,
  });
  const processingApproach = normaliseProcessingApproach(queryParams.processingApproach);
  const includeLegacySource = sourceBias !== 'new-only';
  const includeInstructionsSource = sourceBias !== 'legacy-only';
  const preferInstructionsPrimary = sourceBias === 'new-primary' || sourceBias === 'new-only';
  const prospectIdRaw = (queryParams.prospectId || '').toString().trim();
  const prospectIdInt = Number.parseInt(prospectIdRaw, 10);
  const hasProspectId = Number.isFinite(prospectIdInt);
  // When fetchAll=true, allow much higher limits for "All" mode
  const maxLimit = fetchAll ? 50000 : 2500;
  let limit = Math.min(parseInt(queryParams.limit, 10) || 1000, maxLimit);
  if (hasProspectId) {
    limit = Math.min(limit, 50);
  }
  log.debug(`Limit settings: fetchAll=${fetchAll}, maxLimit=${maxLimit}, finalLimit=${limit}`);
  
  const email = (queryParams.email || '').trim().toLowerCase();
  const initials = (queryParams.initials || '').trim().toLowerCase();
  const includeTeamInbox = String(queryParams.includeTeamInbox || 'true').toLowerCase() === 'true';
  const dateFrom = queryParams.dateFrom || '';
  const dateTo = queryParams.dateTo || '';

  // Connection strings for both databases
  const mainConnectionString = process.env.SQL_CONNECTION_STRING; // helix-core-data
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING; // instructions DB

  if (!mainConnectionString || !instructionsConnectionString) {
    log.error('Required connection strings not found in environment');
    throw new Error('Database configuration missing');
  }

  // Collect warnings and debug info
  const warnings = [];
  const hasInstructionsSharedWithColumn = await getCachedInstructionsColumnPresence(instructionsConnectionString, 'shared_with');
  const hasInstructionsTouchpointDateColumn =
    await getCachedInstructionsColumnPresence(instructionsConnectionString, 'touchpoint_date')
    || await getCachedInstructionsColumnPresence(instructionsConnectionString, 'Touchpoint_Date');
  const instructionsDateField = hasInstructionsTouchpointDateColumn
    ? 'COALESCE(touchpoint_date, datetime)'
    : 'datetime';

  let mainWhereClause = '';
  let instWhereClause = '';

  const [mainResult, instructionsResult] = await Promise.all([
    (async () => {
      try {
        if (!includeLegacySource) {
          log.debug('Skipping legacy enquiries query due to source bias');
          return [];
        }

        const result = await withRequest(mainConnectionString, async (request) => {
          const filters = [];

          if (dateFrom && !hasProspectId) {
            request.input('dateFrom', sql.DateTime2, new Date(dateFrom));
            filters.push('Date_Created >= @dateFrom');
          }
          if (dateTo && !hasProspectId) {
            const endDate = new Date(dateTo);
            endDate.setHours(23, 59, 59, 999);
            request.input('dateTo', sql.DateTime2, endDate);
            filters.push('Date_Created <= @dateTo');
          }

          if (hasProspectId) {
            request.input('prospectId', sql.Int, prospectIdInt);
            filters.push('ID = @prospectId');
          }

          if (!hasProspectId && !fetchAll && (email || initials)) {
            const pocConditions = [];
            if (email) {
              request.input('userEmail', sql.VarChar(255), email);
              pocConditions.push("Point_of_Contact = @userEmail");
            }
            if (initials) {
              request.input('userInitials', sql.VarChar(50), initials.replace(/\./g, ''));
              pocConditions.push("LOWER(REPLACE(REPLACE(LTRIM(RTRIM(Point_of_Contact)), ' ', ''), '.', '')) = @userInitials");
            }
            if (includeTeamInbox) {
              pocConditions.push("Point_of_Contact IN ('team@helix-law.com', 'team', 'team inbox')");
              pocConditions.push("Point_of_Contact IS NULL OR LTRIM(RTRIM(Point_of_Contact)) = ''");
            }
            if (pocConditions.length > 0) filters.push(`(${pocConditions.join(' OR ')})`);
          }

          request.input('limit', sql.Int, limit);
          mainWhereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

          return request.query(`
            SELECT TOP (@limit)
              ID,
              ID as id,
              Date_Created as datetime,
              Tags as stage,
              NULL as claim,
              Point_of_Contact as poc,
              Area_of_Work as pitch,
              Area_of_Work as aow,
              Type_of_Work as tow,
              Method_of_Contact as moc,
              Contact_Referrer as rep,
              First_Name,
              First_Name as first,
              Last_Name,
              Last_Name as last,
              Email as email,
              Phone_Number as phone,
              NULL as uid,
              NULL as displayNumber,
              NULL as postcode,
              Initial_first_call_notes,
              Initial_first_call_notes as notes,
              NULL as convertDate,
              Value,
              Rating,
              Ultimate_Source,
              'main' as _dbSource,
              'not-checked' as migrationStatus
            FROM enquiries
            ${mainWhereClause}
            ORDER BY Date_Created DESC
          `);
        });

        const mainEnquiries = Array.isArray(result.recordset) ? result.recordset : [];
        log.debug(`Main DB returned: ${mainEnquiries.length} enquiries`);
        return mainEnquiries;
      } catch (err) {
        log.error('Main DB enquiries query failed:', err?.message || err);
        warnings.push({ source: 'main', message: err?.message || String(err) });
        return [];
      }
    })(),
    (async () => {
      try {
        if (!includeInstructionsSource) {
          log.debug('Skipping instructions enquiries query due to source bias');
          return [];
        }

        const result = await withRequest(instructionsConnectionString, async (request) => {
          const filters = [];
          if (dateFrom && !hasProspectId) {
            request.input('dateFrom', sql.DateTime2, new Date(dateFrom));
            filters.push(`${instructionsDateField} >= @dateFrom`);
          }
          if (dateTo && !hasProspectId) {
            const endDate = new Date(dateTo);
            endDate.setHours(23, 59, 59, 999);
            request.input('dateTo', sql.DateTime2, endDate);
            filters.push(`${instructionsDateField} <= @dateTo`);
          }
          if (hasProspectId) {
            request.input('prospectIdStr', sql.NVarChar(100), prospectIdRaw);
            filters.push('(id = @prospectIdStr OR acid = @prospectIdStr)');
          }
          if (!fetchAll && (email || initials)) {
            const pocConditions = [];
            if (email) {
              request.input('userEmail', sql.VarChar(255), email);
              pocConditions.push("poc = @userEmail");
              if (hasInstructionsSharedWithColumn) {
                pocConditions.push("(',' + LOWER(REPLACE(REPLACE(ISNULL(shared_with, ''), ' ', ''), ';', ',')) + ',') LIKE '%,' + @userEmail + ',%'");
              }
            }
            if (initials) {
              request.input('userInitials', sql.VarChar(50), initials.replace(/\./g, ''));
              pocConditions.push("LOWER(REPLACE(REPLACE(LTRIM(RTRIM(poc)), ' ', ''), '.', '')) = @userInitials");
            }
            if (includeTeamInbox) {
              pocConditions.push("poc IN ('team@helix-law.com', 'team', 'team inbox')");
              pocConditions.push("poc IS NULL OR LTRIM(RTRIM(poc)) = ''");
            }
            if (pocConditions.length > 0) filters.push(`(${pocConditions.join(' OR ')})`);
          }
          request.input('limit', sql.Int, limit);
          instWhereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

          return request.query(`
            SELECT TOP (@limit)
              id,
              datetime,
              ${instructionsDateField} as Touchpoint_Date,
              stage,
              claim,
              poc,
              pitch,
              aow,
              tow,
              moc,
              rep,
              first,
              last,
              email,
              phone,
              acid,
              source,
              url,
              contact_referrer,
              company_referrer,
              gclid,
              ${hasInstructionsSharedWithColumn ? 'shared_with,' : 'CAST(NULL as NVARCHAR(1000)) as shared_with,'}
              NULL as uid,
              NULL as displayNumber,
              NULL as postcode,
              notes,
              NULL as convertDate,
              value as Value,
              rating as Rating,
              'instructions' as _dbSource,
              'not-checked' as migrationStatus
            FROM dbo.enquiries
            ${instWhereClause}
            ORDER BY datetime DESC
          `);
        });

        const instructionsEnquiries = Array.isArray(result.recordset) ? result.recordset : [];
        log.debug(`Instructions DB returned: ${instructionsEnquiries.length} enquiries`);
        return instructionsEnquiries;
      } catch (err) {
        log.error('Instructions DB enquiries query failed:', err?.message || err);
        warnings.push({ source: 'instructions', message: err?.message || String(err) });
        return [];
      }
    })(),
  ]);

  const mainEnquiries = mainResult;
  const instructionsEnquiries = instructionsResult;

  // Phase 2B.6 (2026-04-27): new-only fast path.
  // When sourceBias=new-only the legacy DB query is already skipped above, so
  // mainEnquiries is empty. The cross-reference / merge / matchedInstructionIds
  // / mergeIfNull / mergeMoreAdvancedStage logic below is all no-ops in that
  // case — but it still walks every record and allocates Maps/Sets. Skip it
  // entirely and just annotate identity.
  if (sourceBias === 'new-only') {
    const uniqueEnquiries = instructionsEnquiries.map((enquiry) => {
      try {
        enquiry.pitchEnquiryId = enquiry.id;
        annotateProcessingIdentity(enquiry, {
          processingEnquiryId: enquiry.id,
          processingSource: 'new',
          legacyEnquiryId: enquiry.acid || null,
          sourcePolicy,
          sourceBias,
          processingApproach,
        });
      } catch { /* ignore */ }
      return enquiry;
    });

    const responsePayload = {
      enquiries: uniqueEnquiries,
      count: uniqueEnquiries.length,
      sources: { main: 0, instructions: instructionsEnquiries.length, unique: uniqueEnquiries.length },
      warnings,
      debug: { mainWhereClause: '', instWhereClause, sourcePolicy, sourceBias, processingApproach },
      processingModel: {
        sourcePolicy,
        sourceBias,
        processingApproach,
        primarySource: 'instructions',
        includesLegacyFallback: false,
        includesInstructions: true,
      },
      migration: {
        total: 0, migrated: 0, partial: 0, notMigrated: 0,
        instructionsOnly: instructionsEnquiries.length,
        migrationRate: '0.0%',
        crossReferenceMap: {},
      },
    };

    const payloadSize = JSON.stringify(responsePayload).length;
    log.info(`Response (new-only fast path): ${uniqueEnquiries.length} enquiries, ${(payloadSize / 1024 / 1024).toFixed(2)}MB payload`);
    return responsePayload;
  }

  // Cross-reference and merge
  const crossReferenceMap = new Map();
  
  // PRIMARY: Match by acid (legacy ID stored in new DB)
  instructionsEnquiries.forEach(inst => {
    if (inst.acid) {
      const match = mainEnquiries.find(mainEnq => String(mainEnq.id) === String(inst.acid));
      if (match) {
        crossReferenceMap.set(match.id, inst.id);
        match.migrationStatus = 'migrated';
        inst.migrationStatus = 'migrated';
      }
    }
  });
  
  // FALLBACK: Match by email/phone AND same calendar day for records not yet cross-referenced
  // This avoids over-merging distinct enquiries from the same contact on different days.
  const toDateOnly = (d) => {
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return '';
      return dt.toISOString().split('T')[0];
    } catch { return ''; }
  };

  mainEnquiries.forEach(mainEnq => {
    if (mainEnq.migrationStatus === 'not-checked' && (mainEnq.email || mainEnq.phone)) {
      const mainDay = toDateOnly(mainEnq.datetime || mainEnq.Date_Created);
      const match = instructionsEnquiries.find(inst => {
        if (inst.migrationStatus !== 'not-checked') return false;
        const sameEmail = (mainEnq.email && inst.email && String(mainEnq.email).toLowerCase() === String(inst.email).toLowerCase());
        const samePhone = (mainEnq.phone && inst.phone && String(mainEnq.phone) === String(inst.phone));
        if (!sameEmail && !samePhone) return false;
        const instDay = toDateOnly(inst.datetime);
        return mainDay && instDay && mainDay === instDay;
      });
      if (match) {
        crossReferenceMap.set(mainEnq.id, match.id);
        mainEnq.migrationStatus = 'partial';
        match.migrationStatus = 'partial';
      }
    }
  });

  // Build reverse map from instructions id to matched legacy record (if any)
  const instToMainMatch = new Map();
  if (crossReferenceMap.size > 0) {
    instructionsEnquiries.forEach(inst => {
      // find main id that maps to this instruction id
      for (const [mainId, instId] of crossReferenceMap.entries()) {
        if (String(instId) === String(inst.id)) {
          const matched = mainEnquiries.find(m => String(m.id) === String(mainId));
          if (matched) instToMainMatch.set(inst.id, matched);
        }
      }
    });
  }

  // Build a set of instruction ids that correspond to a legacy record (via acid or fallback)
  const matchedInstructionIds = new Set();
  for (const [mainId, instId] of crossReferenceMap.entries()) {
    const instructionsMatch = instructionsEnquiries.find((inst) => String(inst.id) === String(instId));
    const collaboratorOnlyView = Boolean(
      email &&
      instructionsMatch &&
      isUserInSharedWith(instructionsMatch.shared_with, email) &&
      normaliseEmail(instructionsMatch.poc) !== normaliseEmail(email)
    );
    if (!collaboratorOnlyView) {
      matchedInstructionIds.add(String(instId));
    }
  }

  const uniqueEnquiries = [];
  const seenIds = new Set();

  if (preferInstructionsPrimary) {
    instructionsEnquiries.forEach((enquiry) => {
      const pairedMain = instToMainMatch.get(enquiry.id);

      if (pairedMain) {
        mergeIfBlank(enquiry, 'Ultimate_Source', pairedMain, 'Ultimate_Source');
        mergeIfBlank(enquiry, 'Company', pairedMain, 'Company');
        mergeIfBlank(enquiry, 'Date_Created', pairedMain, 'Date_Created');
        mergeIfBlank(enquiry, 'Touchpoint_Date', pairedMain, 'Date_Created');
        mergeIfBlank(enquiry, 'Point_of_Contact', pairedMain, 'Point_of_Contact');
        mergeIfBlank(enquiry, 'First_Name', pairedMain, 'First_Name');
        mergeIfBlank(enquiry, 'Last_Name', pairedMain, 'Last_Name');
        mergeIfBlank(enquiry, 'Phone_Number', pairedMain, 'Phone_Number');
        mergeIfBlank(enquiry, 'Method_of_Contact', pairedMain, 'Method_of_Contact');
      }

      try {
        enquiry.pitchEnquiryId = enquiry.id;
        annotateProcessingIdentity(enquiry, {
          processingEnquiryId: enquiry.id,
          processingSource: 'new',
          legacyEnquiryId: pairedMain?.id || enquiry.acid || null,
          sourcePolicy,
          sourceBias,
          processingApproach,
        });
      } catch { /* ignore */ }

      const compositeKey = `instructions-${enquiry.id}`;
      if (!seenIds.has(compositeKey)) {
        seenIds.add(compositeKey);
        uniqueEnquiries.push(enquiry);
      }
    });

    if (includeLegacySource) {
      mainEnquiries.forEach((enquiry) => {
        if (crossReferenceMap.has(enquiry.id)) return;

        annotateProcessingIdentity(enquiry, {
          processingEnquiryId: enquiry.id,
          processingSource: 'legacy',
          legacyEnquiryId: enquiry.id,
          sourcePolicy,
          sourceBias,
          processingApproach,
        });

        const pocLower = (enquiry.poc || '').toString().trim().toLowerCase();
        const firstName = (enquiry.First_Name || '').toString().trim().toLowerCase();
        const lastName = (enquiry.Last_Name || '').toString().trim().toLowerCase();
        const email = (enquiry.email || '').toString().trim().toLowerCase();
        const dateCreated = enquiry.Date_Created || enquiry.datetime || '';
        const compositeKey = `main-${enquiry.id}-${pocLower}-${firstName}-${lastName}-${email}-${dateCreated}`;
        if (!seenIds.has(compositeKey)) {
          seenIds.add(compositeKey);
          uniqueEnquiries.push(enquiry);
        }
      });
    }
  } else {

  // Prefer legacy: add all legacy records first (with enhanced composite key to preserve distinct records)
  mainEnquiries.forEach(enquiry => {
    // Expose the corresponding instructions DB id for downstream integrations (e.g. Pitch)
    // For migrated/partial records, crossReferenceMap maps legacy id -> instructions id.
    try {
      const mapped = crossReferenceMap.get(enquiry.id);
      if (mapped !== undefined && mapped !== null) {
        enquiry.pitchEnquiryId = mapped;

        // Merge enriched fields from the paired instructions record.
        // Claiming via Teams only updates the instructions DB, so the legacy record
        // can have a stale POC (e.g. "team@helix-law.com") while the instructions
        // record has the claimer's email. Prefer the more advanced state.
        const paired = instructionsEnquiries.find(inst => String(inst.id) === String(mapped));
        if (paired) {
          const legacyPoc = (enquiry.poc || '').toString().trim().toLowerCase();
          const instrPoc = (paired.poc || '').toString().trim().toLowerCase();
          const isLegacyUnclaimed = !legacyPoc || legacyPoc === 'team@helix-law.com' || legacyPoc === 'team' || legacyPoc === 'team inbox';
          const isInstrClaimed = instrPoc && instrPoc !== 'team@helix-law.com' && instrPoc !== 'team' && instrPoc !== 'team inbox';

          if (isLegacyUnclaimed && isInstrClaimed) {
            enquiry.poc = paired.poc;
            enquiry.Point_of_Contact = paired.poc;
          }
          // Prefer the more advanced operational stage from instructions when legacy tags are generic/stale.
          mergeMoreAdvancedStage(enquiry, paired);
          if (paired.claim && !enquiry.claim) {
            enquiry.claim = paired.claim;
          }
          if (paired.shared_with) {
            enquiry.shared_with = paired.shared_with;
          }
          // Merge enriched data fields from instructions record when legacy has nulls.
          // The instructions DB is often populated by the intake form while the legacy
          // Core Data record may have NULLs for these columns.
          const mergeIfNull = (legacyField, instrField) => {
            instrField = instrField || legacyField;
            if ((enquiry[legacyField] === null || enquiry[legacyField] === undefined || String(enquiry[legacyField]).trim() === '') &&
                paired[instrField] !== null && paired[instrField] !== undefined && String(paired[instrField]).trim() !== '') {
              enquiry[legacyField] = paired[instrField];
            }
          };
          mergeIfNull('aow');
          mergeIfNull('pitch');
          mergeIfNull('Value');
          mergeIfNull('tow');
          mergeIfNull('first', 'first');
          mergeIfNull('First_Name', 'first');
          mergeIfNull('last', 'last');
          mergeIfNull('Last_Name', 'last');
          mergeIfNull('notes');
          mergeIfNull('Rating', 'Rating');
        }
      }
    } catch { /* ignore */ }

    annotateProcessingIdentity(enquiry, {
      processingEnquiryId: enquiry.pitchEnquiryId || enquiry.id,
      processingSource: enquiry.pitchEnquiryId ? 'new' : 'legacy',
      legacyEnquiryId: enquiry.id,
      sourcePolicy,
      sourceBias,
      processingApproach,
    });

    const pocLower = (enquiry.poc || '').toString().trim().toLowerCase();
    const firstName = (enquiry.First_Name || '').toString().trim().toLowerCase();
    const lastName = (enquiry.Last_Name || '').toString().trim().toLowerCase();
    const email = (enquiry.email || '').toString().trim().toLowerCase();
    const dateCreated = enquiry.Date_Created || enquiry.datetime || '';
    
    // Enhanced composite key to handle shared prospect IDs with different people
    // Include name and date to distinguish between different people with same ID+POC
    const compositeKey = `main-${enquiry.id}-${pocLower}-${firstName}-${lastName}-${email}-${dateCreated}`;
    if (!seenIds.has(compositeKey)) {
      seenIds.add(compositeKey);
      uniqueEnquiries.push(enquiry);
    }
  });

  // Then add instructions records that do NOT match any legacy record (not in matchedInstructionIds)
  instructionsEnquiries.forEach(enquiry => {
    const isMatchedToLegacy = matchedInstructionIds.has(String(enquiry.id));
    if (isMatchedToLegacy) return; // suppress new when a legacy counterpart exists

    // For instructions-only records, the Pitch enquiry id is the instructions id
    try {
      enquiry.pitchEnquiryId = enquiry.id;
      annotateProcessingIdentity(enquiry, {
        processingEnquiryId: enquiry.id,
        processingSource: 'new',
        legacyEnquiryId: enquiry.acid || null,
        sourcePolicy,
        sourceBias,
        processingApproach,
      });
    } catch { /* ignore */ }

    const compositeKey = `instructions-${enquiry.id}`;
    if (!seenIds.has(compositeKey)) {
      seenIds.add(compositeKey);
      uniqueEnquiries.push(enquiry);
    }
  });
  }

  const migrationStats = {
    total: mainEnquiries.length,
    migrated: 0,
    partial: 0,
    notMigrated: 0,
    instructionsOnly: instructionsEnquiries.filter(e => e.migrationStatus === 'instructions-only').length
  };
  mainEnquiries.forEach(enq => {
    switch (enq.migrationStatus) {
      case 'migrated':
        migrationStats.migrated++;
        break;
      case 'partial':
        migrationStats.partial++;
        break;
      case 'not-migrated':
        migrationStats.notMigrated++;
        break;
    }
  });

  const migrationRate = migrationStats.total > 0
    ? ((migrationStats.migrated / migrationStats.total) * 100).toFixed(1)
    : '0.0';

  const responsePayload = {
    enquiries: uniqueEnquiries,
    count: uniqueEnquiries.length,
    sources: {
      main: mainEnquiries.length,
      instructions: instructionsEnquiries.length,
      unique: uniqueEnquiries.length
    },
    warnings,
    debug: {
      mainWhereClause,
      instWhereClause,
      sourcePolicy,
      sourceBias,
      processingApproach,
    },
    processingModel: {
      sourcePolicy,
      sourceBias,
      processingApproach,
      primarySource: preferInstructionsPrimary ? 'instructions' : 'legacy',
      includesLegacyFallback: includeLegacySource,
      includesInstructions: includeInstructionsSource,
    },
    migration: {
      ...migrationStats,
      migrationRate: `${migrationRate}%`,
      crossReferenceMap: Object.fromEntries(crossReferenceMap)
    }
  };

  const payloadSize = JSON.stringify(responsePayload).length;
  const payloadMB = (payloadSize / 1024 / 1024).toFixed(2);
  log.info(`Response: ${uniqueEnquiries.length} enquiries, ${payloadMB}MB payload`);

  return responsePayload;
}

// (removed corrupted duplicate POST /update route)

// Route: POST /api/enquiries-unified/update
// Update enquiry fields in BOTH databases (legacy and new instructions)
router.post('/update', async (req, res) => {
  const { ID, processingEnquiryId, processingSource, ...updates } = req.body;

  log.debug('Update request received:', {
    ID,
    processingEnquiryId,
    processingSource,
    IDType: typeof ID,
    updates,
  });

  if (!ID && !processingEnquiryId) return res.status(400).json({ error: 'Enquiry ID is required' });
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updates provided' });

  const displayEnquiryId = String(ID ?? '').trim();
  const explicitProcessingEnquiryId = String(processingEnquiryId ?? '').trim();
  const normalisedProcessingSource = String(processingSource ?? '').trim().toLowerCase();

  // Ensure IDs are strings
  const enquiryId = explicitProcessingEnquiryId || displayEnquiryId;

  try {
    const mainConnectionString = process.env.SQL_CONNECTION_STRING;
    const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    
    if (!mainConnectionString || !instructionsConnectionString) {
      log.error('Database connection strings not found in environment');
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const hasInstructionsSharedWithColumn = await instructionsHasColumn(instructionsConnectionString, 'shared_with');

    // Check which database(s) contain this enquiry.
    // ID taxonomy:
    //   Legacy (Core Data):      enquiries.ID = auto-increment PK (also the AC bridge for legacy records)
    //   New-space (Instructions): enquiries.id = auto-increment internal PK
    //                             enquiries.acid = ActiveCampaign contact ID (bridges to Deals.ProspectId)
    // The acid column cross-references to legacy: acid may equal the legacy ID for paired records.
    // We resolve a paired legacyId/instructionsId so updates persist and don't "revert" when
    // the UI refreshes from the other source.

    const checkMainQuery = `SELECT COUNT(*) as count FROM enquiries WHERE ID = @id`;
    const checkInstructionsQuery = `SELECT COUNT(*) as count FROM enquiries WHERE id = @id`;

    let legacyIdToUpdate = displayEnquiryId || enquiryId;
    let instructionsIdToUpdate = explicitProcessingEnquiryId || displayEnquiryId || enquiryId;
    let mainCount = 0;
    let instructionsCount = 0;

    const resolveInstructionsPairFromLegacyId = async (legacyCandidateId) => {
      if (!legacyCandidateId) return;
      try {
        const pairResult = await withRequest(instructionsConnectionString, async (request) => {
          request.input('acid', sql.VarChar(50), legacyCandidateId);
          return await request.query(`SELECT TOP 1 id FROM enquiries WHERE acid = @acid`);
        });
        const pairedInstructionsId = pairResult.recordset?.[0]?.id;
        if (pairedInstructionsId) {
          instructionsIdToUpdate = String(pairedInstructionsId);
          instructionsCount = 1;
        }
      } catch (pairErr) {
        log.warn('Failed to resolve paired instructions enquiry via acid (legacy ID):', pairErr?.message);
      }
    };

    const resolveLegacyPairFromInstructionsId = async (instructionsCandidateId) => {
      if (!instructionsCandidateId) return;
      try {
        const acidResult = await withRequest(instructionsConnectionString, async (request) => {
          request.input('id', sql.VarChar(50), instructionsCandidateId);
          return await request.query(`SELECT TOP 1 acid FROM enquiries WHERE id = @id`);
        });
        const pairedLegacyId = acidResult.recordset?.[0]?.acid;
        if (pairedLegacyId) {
          legacyIdToUpdate = String(pairedLegacyId);
          const legacyCheck = await withRequest(mainConnectionString, async (request) => {
            request.input('id', sql.VarChar(50), legacyIdToUpdate);
            return await request.query(checkMainQuery);
          });
          mainCount = legacyCheck.recordset[0]?.count || 0;
        }
      } catch (pairErr) {
        log.warn('Failed to resolve paired legacy enquiry via acid (instructions ID):', pairErr?.message);
      }
    };

    if (normalisedProcessingSource === 'new' && explicitProcessingEnquiryId) {
      instructionsIdToUpdate = explicitProcessingEnquiryId;
      const instructionsResult = await withRequest(instructionsConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), instructionsIdToUpdate);
        return await request.query(checkInstructionsQuery);
      });
      instructionsCount = instructionsResult.recordset[0]?.count || 0;

      await resolveLegacyPairFromInstructionsId(instructionsIdToUpdate);
    } else if (normalisedProcessingSource === 'legacy' && explicitProcessingEnquiryId) {
      legacyIdToUpdate = explicitProcessingEnquiryId;
      const mainResult = await withRequest(mainConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), legacyIdToUpdate);
        return await request.query(checkMainQuery);
      });
      mainCount = mainResult.recordset[0]?.count || 0;

      await resolveInstructionsPairFromLegacyId(legacyIdToUpdate);
    } else {
      const mainResult = await withRequest(mainConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), enquiryId);
        return await request.query(checkMainQuery);
      });
      mainCount = mainResult.recordset[0]?.count || 0;

      const instructionsResult = await withRequest(instructionsConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), enquiryId);
        return await request.query(checkInstructionsQuery);
      });
      instructionsCount = instructionsResult.recordset[0]?.count || 0;

      if (mainCount > 0 && instructionsCount === 0) {
        await resolveInstructionsPairFromLegacyId(enquiryId);
      }

      if (instructionsCount > 0 && mainCount === 0) {
        await resolveLegacyPairFromInstructionsId(enquiryId);
      }
    }

    if (mainCount === 0 && instructionsCount === 0) {
      return res.status(404).json({ error: 'Enquiry not found in either database' });
    }

    const updatedTables = { main: false, instructions: false };

    // Update legacy database if enquiry exists there
    if (mainCount > 0) {
      await withRequest(mainConnectionString, async (request) => {
        const setClause = [];
        request.input('id', sql.VarChar(50), legacyIdToUpdate);

        if (updates.First_Name !== undefined) {
          setClause.push('First_Name = @firstName');
          request.input('firstName', sql.VarChar(100), updates.First_Name);
        }
        if (updates.Last_Name !== undefined) {
          setClause.push('Last_Name = @lastName');
          request.input('lastName', sql.VarChar(100), updates.Last_Name);
        }
        if (updates.Email !== undefined) {
          setClause.push('Email = @email');
          request.input('email', sql.VarChar(255), updates.Email);
        }
        if (updates.Value !== undefined) {
          setClause.push('Value = @value');
          request.input('value', sql.VarChar(100), updates.Value);
        }
        if (updates.Initial_first_call_notes !== undefined) {
          setClause.push('Initial_first_call_notes = @notes');
          request.input('notes', sql.Text, updates.Initial_first_call_notes);
        }
        if (updates.Area_of_Work !== undefined) {
          setClause.push('Area_of_Work = @areaOfWork');
          request.input('areaOfWork', sql.VarChar(100), updates.Area_of_Work);
        }
        if (updates.Rating !== undefined) {
          setClause.push('Rating = @rating');
          request.input('rating', sql.VarChar(50), updates.Rating);
        }

        if (updates.Point_of_Contact !== undefined) {
          setClause.push('Point_of_Contact = @pointOfContact');
          request.input('pointOfContact', sql.VarChar(255), updates.Point_of_Contact);
        }

        if (setClause.length > 0) {
          const updateQuery = `UPDATE enquiries SET ${setClause.join(', ')} WHERE ID = @id`;
          await request.query(updateQuery);
          updatedTables.main = true;
        }
      });
    }

    // Update instructions database if enquiry exists there (using lowercase field names)
    if (instructionsCount > 0) {
      await withRequest(instructionsConnectionString, async (request) => {
        const setClause = [];
        request.input('id', sql.VarChar(50), instructionsIdToUpdate);

        // Map to lowercase field names used in instructions database
        if (updates.First_Name !== undefined) {
          setClause.push('first = @first');
          request.input('first', sql.VarChar(100), updates.First_Name);
        }
        if (updates.Last_Name !== undefined) {
          setClause.push('last = @last');
          request.input('last', sql.VarChar(100), updates.Last_Name);
        }
        if (updates.Email !== undefined) {
          setClause.push('email = @email');
          request.input('email', sql.VarChar(255), updates.Email);
        }
        if (updates.Value !== undefined) {
          setClause.push('value = @value');
          request.input('value', sql.VarChar(100), updates.Value);
        }
        if (updates.Initial_first_call_notes !== undefined) {
          setClause.push('notes = @notes');
          request.input('notes', sql.Text, updates.Initial_first_call_notes);
        }
        if (updates.Area_of_Work !== undefined) {
          setClause.push('aow = @aow');
          request.input('aow', sql.VarChar(100), updates.Area_of_Work);
        }
        if (updates.Rating !== undefined) {
          setClause.push('rating = @rating');
          request.input('rating', sql.VarChar(50), updates.Rating);
        }

        if (updates.Point_of_Contact !== undefined) {
          setClause.push('poc = @poc');
          request.input('poc', sql.VarChar(255), updates.Point_of_Contact);
        }

        const sharedWithUpdateValue = updates.Shared_With ?? updates.shared_with;
        if (sharedWithUpdateValue !== undefined && hasInstructionsSharedWithColumn) {
          setClause.push('shared_with = @sharedWith');
          request.input('sharedWith', sql.NVarChar(1000), serialiseSharedWithEmails(sharedWithUpdateValue));
        }

        if (setClause.length > 0) {
          const updateQuery = `UPDATE enquiries SET ${setClause.join(', ')} WHERE id = @id`;
          await request.query(updateQuery);
          updatedTables.instructions = true;
        }
      });
    }

    // Invalidate all unified enquiries cache entries after successful update
    try {
      clearUnifiedMemoryCache();
      // New correct pattern (matches cacheUnified which uses type 'data')
      const deletedData = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:data:*`);
      // Backward compatibility: also clear any older keys using 'enquiries' type
      const deletedEnquiries = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:enquiries:*`);
      log.debug(`Invalidated cache after update (data:${deletedData}, enquiries:${deletedEnquiries})`);
    } catch (cacheError) {
      log.warn('Failed to invalidate cache after update:', cacheError?.message);
      // Don't fail the request if cache invalidation fails
    }

    try {
      broadcastEnquiriesChanged({ changeType: 'update', enquiryId: displayEnquiryId || enquiryId, record: updates });
    } catch { /* non-blocking */ }

    emitEvent('enquiry.stage_changed', 'tab-app', String(displayEnquiryId || enquiryId), 'enquiry', { updatedFields: Object.keys(updates) });

    res.status(200).json({
      success: true,
      message: 'Enquiry updated successfully',
      enquiryId: displayEnquiryId || enquiryId,
      updatedTables,
      updatedIds: {
        legacyId: legacyIdToUpdate,
        instructionsId: instructionsIdToUpdate
      }
    });

  } catch (error) {
    log.error('Error updating enquiry:', error?.message);
    res.status(500).json({ error: 'Failed to update enquiry', details: error?.message || 'Unknown error' });
  }
});

// Route: POST /api/enquiries-unified/create
// Create a new enquiry in the instructions database
router.post('/create', async (req, res) => {
  try {
    log.debug('Create enquiry request received');

    const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    
    if (!instructionsConnectionString) {
      log.error('❌ Instructions database connection string not found');
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const rawBody = req.body;
    const payload = rawBody && typeof rawBody === 'object' && rawBody !== null && 'data' in rawBody
      ? rawBody.data
      : rawBody;

    if (!payload || typeof payload !== 'object') {
      log.error('❌ Invalid payload structure for create enquiry');
      return res.status(400).json({ error: 'Invalid request payload' });
    }

    const normalise = (value) => typeof value === 'string' ? value.trim() : value;

    const first = normalise(payload.first);
    const last = normalise(payload.last);
    const aow = normalise(payload.aow);
    const moc = normalise(payload.moc);
    const email = normalise(payload.email)?.toLowerCase() || null;
    const phone = normalise(payload.phone) || null;
    const sourceRaw = normalise(payload.source);
    const source = sourceRaw ? sourceRaw.toLowerCase() : 'manual';
    const rep = normalise(payload.rep) || normalise(payload.poc) || null;
    const poc = normalise(payload.poc) || rep;

    if (!first || !last) {
      return res.status(400).json({ error: 'First and last name are required' });
    }

    if (!email && !phone) {
      return res.status(400).json({ error: 'Either email or phone is required' });
    }

    if (!aow) {
      return res.status(400).json({ error: 'Area of work is required' });
    }

    if (!moc) {
      return res.status(400).json({ error: 'Method of contact is required' });
    }

    if (!source) {
      return res.status(400).json({ error: 'Source is required' });
    }

    if (!rep) {
      return res.status(400).json({ error: 'Point of contact is required' });
    }

    const rankValue = payload.rank !== undefined ? Number.parseInt(String(payload.rank), 10) : Number.NaN;

    const pitch = normalise(payload.pitch);
    const tow = normalise(payload.tow);
    const value = normalise(payload.value);
    const notes = normalise(payload.notes);
    const rating = normalise(payload.rating);
    const acid = normalise(payload.acid);
    const cardId = normalise(payload.card_id ?? payload.cardId);
    const url = normalise(payload.url);
    const contactReferrer = normalise(payload.contact_referrer ?? payload.contactReferrer) || null;
    const companyReferrer = normalise(payload.company_referrer ?? payload.companyReferrer) || null;
    const gclid = normalise(payload.gclid);

    const data = {
      stage: normalise(payload.stage) || 'enquiry',
      claim: normalise(payload.claim) || null,
      poc,
      pitch: pitch || null,
      aow,
      tow: tow || null,
      moc,
      rep,
      first,
      last,
      email,
      phone,
      value: value || null,
      notes: notes || null,
      rank: Number.isNaN(rankValue) ? 4 : rankValue,
      rating: rating || null,
      acid: acid || null,
      card_id: cardId || null,
      source,
      url: url || null,
      contact_referrer: contactReferrer,
      company_referrer: companyReferrer,
      gclid: gclid || null,
    };

    // Get current London time
    const londonTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/London"}));

    // Build INSERT query with all fields
    const result = await withRequest(instructionsConnectionString, async (request) => {
      // Required fields
      request.input('datetime', sql.DateTime2, londonTime);
  request.input('stage', sql.VarChar(50), data.stage);
  request.input('aow', sql.VarChar(100), data.aow);
  request.input('moc', sql.VarChar(100), data.moc);
  request.input('first', sql.VarChar(100), data.first);
  request.input('last', sql.VarChar(100), data.last);
  request.input('email', sql.VarChar(255), data.email);
  request.input('source', sql.VarChar(100), data.source);

  // Optional fields
  request.input('claim', sql.VarChar(100), data.claim);
  request.input('poc', sql.VarChar(255), data.poc);
  request.input('pitch', sql.VarChar(100), data.pitch);
  request.input('tow', sql.VarChar(100), data.tow);
  request.input('phone', sql.VarChar(50), data.phone);
  request.input('value', sql.VarChar(50), data.value);
  request.input('notes', sql.Text, data.notes);
  request.input('rank', sql.Int, data.rank);
  request.input('rating', sql.VarChar(50), data.rating);
  request.input('acid', sql.VarChar(50), data.acid);
  request.input('card_id', sql.VarChar(50), data.card_id);
  request.input('url', sql.VarChar(500), data.url);
  request.input('contact_referrer', sql.VarChar(100), data.contact_referrer);
  request.input('company_referrer', sql.VarChar(100), data.company_referrer);
  request.input('gclid', sql.VarChar(100), data.gclid);
  request.input('rep', sql.VarChar(255), data.rep);

      const insertQuery = `
        INSERT INTO dbo.enquiries (
          datetime, stage, claim, poc, pitch, aow, tow, moc, rep,
          first, last, email, phone, value, notes, rank, rating,
          acid, card_id, source, url, contact_referrer, company_referrer, gclid
        ) VALUES (
          @datetime, @stage, @claim, @poc, @pitch, @aow, @tow, @moc, @rep,
          @first, @last, @email, @phone, @value, @notes, @rank, @rating,
          @acid, @card_id, @source, @url, @contact_referrer, @company_referrer, @gclid
        );
        SELECT SCOPE_IDENTITY() AS id;
      `;

      return await request.query(insertQuery);
    });

    const newId = result.recordset[0]?.id;

    log.info(`✅ Enquiry created successfully with ID: ${newId}`);

    // Invalidate cache after successful insert
    try {
      clearUnifiedMemoryCache();
      // New correct pattern (matches cacheUnified which uses type 'data')
      const deletedData = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:data:*`);
      // Backward compatibility: also clear any older keys using 'enquiries' type
      const deletedEnquiries = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:enquiries:*`);
      log.info(`🗑️  Invalidated cache after create (data:${deletedData}, enquiries:${deletedEnquiries})`);
    } catch (cacheError) {
      log.warn('⚠️  Failed to invalidate cache after create:', cacheError);
    }

    try {
      broadcastEnquiriesChanged({ changeType: 'create', enquiryId: String(newId), record: { id: newId, ...data } });
    } catch { /* non-blocking */ }

    emitEvent('enquiry.created', 'tab-app', String(newId), 'enquiry', { firstName: data?.First_Name, lastName: data?.Last_Name });

    res.status(201).json({
      success: true,
      id: newId,
      message: 'Enquiry created successfully'
    });

  } catch (error) {
    log.error('❌ Error creating enquiry:', error);
    res.status(500).json({ 
      error: 'Failed to create enquiry', 
      details: error?.message || 'Unknown error' 
    });
  }
});

// Route: DELETE /api/enquiries-unified/:id
// Delete a specific enquiry by ID from both systems
router.delete('/:id', async (req, res) => {
  try {
    const enquiryId = String(req.params.id || '').trim();
    const explicitProcessingEnquiryId = String(req.query.processingEnquiryId || '').trim();
    const normalisedProcessingSource = String(req.query.processingSource || '').trim().toLowerCase();
    
    log.info('🗑️  Delete request for enquiry ID:', enquiryId, {
      processingEnquiryId: explicitProcessingEnquiryId,
      processingSource: normalisedProcessingSource,
    });

    if (!enquiryId) {
      return res.status(400).json({ error: 'Enquiry ID is required' });
    }

    const results = {
      v1Deleted: false,
      v2Deleted: false,
      teamsActivityDeleted: 0,
      deletedRecord: null
    };

    // Use the same connection strings as other operations
    const mainConnectionString = process.env.SQL_CONNECTION_STRING;
    const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;

    if (!mainConnectionString || !instructionsConnectionString) {
      return res.status(500).json({ error: 'Database connection strings not configured' });
    }

    const checkMainQuery = `SELECT COUNT(*) as count FROM enquiries WHERE ID = @id`;
    const checkInstructionsQuery = `SELECT COUNT(*) as count FROM enquiries WHERE id = @id`;

    let legacyIdToDelete = enquiryId;
    let instructionsIdToDelete = explicitProcessingEnquiryId || enquiryId;
    let mainCount = 0;
    let instructionsCount = 0;

    const resolveInstructionsPairFromLegacyId = async (legacyCandidateId) => {
      if (!legacyCandidateId) return;
      try {
        const pairResult = await withRequest(instructionsConnectionString, async (request) => {
          request.input('acid', sql.VarChar(50), legacyCandidateId);
          return await request.query(`SELECT TOP 1 id FROM enquiries WHERE acid = @acid`);
        });
        const pairedInstructionsId = pairResult.recordset?.[0]?.id;
        if (pairedInstructionsId) {
          instructionsIdToDelete = String(pairedInstructionsId);
          instructionsCount = 1;
        }
      } catch (pairErr) {
        log.warn('Failed to resolve paired instructions enquiry via acid (legacy ID):', pairErr?.message);
      }
    };

    const resolveLegacyPairFromInstructionsId = async (instructionsCandidateId) => {
      if (!instructionsCandidateId) return;
      try {
        const acidResult = await withRequest(instructionsConnectionString, async (request) => {
          request.input('id', sql.VarChar(50), instructionsCandidateId);
          return await request.query(`SELECT TOP 1 acid FROM enquiries WHERE id = @id`);
        });
        const pairedLegacyId = acidResult.recordset?.[0]?.acid;
        if (pairedLegacyId) {
          legacyIdToDelete = String(pairedLegacyId);
          const legacyCheck = await withRequest(mainConnectionString, async (request) => {
            request.input('id', sql.VarChar(50), legacyIdToDelete);
            return await request.query(checkMainQuery);
          });
          mainCount = legacyCheck.recordset[0]?.count || 0;
        }
      } catch (pairErr) {
        log.warn('Failed to resolve paired legacy enquiry via acid (instructions ID):', pairErr?.message);
      }
    };

    if (normalisedProcessingSource === 'new' && explicitProcessingEnquiryId) {
      instructionsIdToDelete = explicitProcessingEnquiryId;
      const instructionsResult = await withRequest(instructionsConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), instructionsIdToDelete);
        return await request.query(checkInstructionsQuery);
      });
      instructionsCount = instructionsResult.recordset[0]?.count || 0;
      await resolveLegacyPairFromInstructionsId(instructionsIdToDelete);
    } else if (normalisedProcessingSource === 'legacy' && explicitProcessingEnquiryId) {
      legacyIdToDelete = explicitProcessingEnquiryId;
      const mainResult = await withRequest(mainConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), legacyIdToDelete);
        return await request.query(checkMainQuery);
      });
      mainCount = mainResult.recordset[0]?.count || 0;
      await resolveInstructionsPairFromLegacyId(legacyIdToDelete);
    } else {
      const mainResult = await withRequest(mainConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), enquiryId);
        return await request.query(checkMainQuery);
      });
      mainCount = mainResult.recordset[0]?.count || 0;

      const instructionsResult = await withRequest(instructionsConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), instructionsIdToDelete);
        return await request.query(checkInstructionsQuery);
      });
      instructionsCount = instructionsResult.recordset[0]?.count || 0;

      if (mainCount > 0 && instructionsCount === 0) {
        await resolveInstructionsPairFromLegacyId(enquiryId);
      }

      if (instructionsCount > 0 && mainCount === 0) {
        await resolveLegacyPairFromInstructionsId(instructionsIdToDelete);
      }
    }

    // First, clean up any Teams activities that reference this enquiry (to avoid FK constraints)
    try {
      const teamsActivityDeleted = await withRequest(instructionsConnectionString, async (request) => {
        // Find Teams activities for this enquiry
        request.input('enquiryId', sql.VarChar(50), String(instructionsIdToDelete));
        const selectResult = await request.query(`
          SELECT Id, EnquiryId, LeadName, Email
          FROM TeamsBotActivityTracking
          WHERE CAST(EnquiryId AS VARCHAR(50)) = @enquiryId
        `);
        
        const activitiesToDelete = selectResult.recordset || [];
        
        // Delete each activity
        for (const activity of activitiesToDelete) {
          const deleteRequest = await withRequest(instructionsConnectionString, async (deleteReq) => {
            deleteReq.input('activityId', sql.Int, activity.Id);
            return await deleteReq.query('DELETE FROM TeamsBotActivityTracking WHERE Id = @activityId');
          });
        }
        
        return activitiesToDelete.length;
      });
      
      results.teamsActivityDeleted = teamsActivityDeleted;
      if (teamsActivityDeleted > 0) {
        log.info(`🗑️  Deleted ${teamsActivityDeleted} Teams activities for enquiry ${instructionsIdToDelete}`);
      }
    } catch (teamsError) {
      log.warn('⚠️  Failed to clean up Teams activities:', teamsError.message);
    }

    // Try to delete from v1 database (main/helix-core-data system)
    try {
      const v1Result = await withRequest(mainConnectionString, async (request) => {
        // First get the record details before deleting
        request.input('id', sql.VarChar(50), String(legacyIdToDelete));
        const selectResult = await request.query(`
          SELECT ID, First_Name, Last_Name, Email, Point_of_Contact
          FROM enquiries
          WHERE ID = @id
        `);
        
        if (selectResult.recordset && selectResult.recordset.length > 0) {
          const record = selectResult.recordset[0];
          
          // Delete the record
          const deleteResult = await request.query(`
            DELETE FROM enquiries WHERE ID = @id
          `);
          
          if (deleteResult.rowsAffected && deleteResult.rowsAffected[0] > 0) {
            results.v1Deleted = true;
            results.deletedRecord = {
              system: 'v1',
              id: record.ID,
              name: `${record.First_Name || ''} ${record.Last_Name || ''}`.trim(),
              email: record.Email || '',
              poc: record.Point_of_Contact || ''
            };
            log.info(`✅ Deleted v1 record: ${results.deletedRecord.name} (${results.deletedRecord.email})`);
          }
        }
      });
    } catch (v1Error) {
      log.warn(`⚠️  Could not delete from v1 database:`, v1Error.message);
    }

    // Try to delete from v2 database (instructions system)
    try {
      const v2Result = await withRequest(instructionsConnectionString, async (request) => {
        // Check if ID is numeric for v2 database
        const numericId = parseInt(instructionsIdToDelete, 10);
        if (isNaN(numericId)) {
          return; // Skip v2 if ID is not numeric
        }
        
        // First get the record details before deleting
        request.input('id', sql.Int, numericId);
        const selectResult = await request.query(`
          SELECT id, first, last, email, poc
          FROM enquiries
          WHERE id = @id
        `);
        
        if (selectResult.recordset && selectResult.recordset.length > 0) {
          const record = selectResult.recordset[0];
          
          // Delete the record
          const deleteResult = await request.query(`
            DELETE FROM enquiries WHERE id = @id
          `);
          
          if (deleteResult.rowsAffected && deleteResult.rowsAffected[0] > 0) {
            results.v2Deleted = true;
            if (!results.deletedRecord) {
              results.deletedRecord = {
                system: 'v2',
                id: record.id,
                name: `${record.first || ''} ${record.last || ''}`.trim(),
                email: record.email || '',
                poc: record.poc || ''
              };
            }
            log.info(`✅ Deleted v2 record: ${results.deletedRecord.name} (${results.deletedRecord.email})`);
          }
        }
      });
    } catch (v2Error) {
      log.warn(`⚠️  Could not delete from v2 database:`, v2Error.message);
    }

    // Check if anything was actually deleted
    if (!results.v1Deleted && !results.v2Deleted) {
      return res.status(404).json({ 
        error: 'Enquiry not found', 
        message: `No enquiry found with ID: ${enquiryId}` 
      });
    }

    // Clear cache after deletion
    try {
      clearUnifiedMemoryCache();
      await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:*`);
      await deleteCachePattern('homeEnquiries*');
      await deleteCachePattern('homeEnquiriesDetails*');
      try { require('./home-enquiries').clearHomeMemoryCache(); } catch (_) { /* safe */ }
      log.info('🗑️  Cache cleared after deletion (including home memory cache)');
    } catch (cacheError) {
      log.warn('⚠️  Failed to clear cache after deletion:', cacheError);
    }

    const message = `Successfully deleted enquiry ${enquiryId}` + 
                   (results.v1Deleted ? ' from v1' : '') + 
                   (results.v1Deleted && results.v2Deleted ? ' and' : '') +
                   (results.v2Deleted ? ' from v2' : '') +
                   (results.teamsActivityDeleted > 0 ? ` (+ ${results.teamsActivityDeleted} Teams activities)` : '');

    log.info('✅', message);

    try {
      const deletedIds = Array.from(new Set([
        String(enquiryId || '').trim(),
        String(legacyIdToDelete || '').trim(),
        String(instructionsIdToDelete || '').trim(),
      ].filter(Boolean)));
      broadcastEnquiriesChanged({ changeType: 'delete', enquiryId: String(enquiryId), deletedIds });
    } catch { /* non-blocking */ }

    res.json({
      success: true,
      message,
      results,
      deletedIds: {
        displayId: enquiryId,
        legacyId: legacyIdToDelete,
        instructionsId: instructionsIdToDelete,
      },
    });

  } catch (error) {
    log.error('❌ Error during deletion:', error);
    res.status(500).json({ 
      error: 'Deletion failed', 
      details: error?.message || 'Unknown error' 
    });
  }
});

// Route: DELETE /api/enquiries-unified/cleanup
// Remove test data and specific enquiry IDs from both systems
router.delete('/cleanup', async (req, res) => {
  try {
    const { 
      testPattern = 'TestPattern', 
      specificIds = [], 
      dryRun = true, // Default to dry run for safety
      removeTeamsActivity = false 
    } = req.body;

    log.info('🧹 Cleanup request received:', { testPattern, specificIds, dryRun, removeTeamsActivity });

    if (!testPattern && specificIds.length === 0) {
      return res.status(400).json({
        error: 'Must provide either testPattern or specificIds for cleanup'
      });
    }

    const results = {
      v1Deleted: 0,
      v2Deleted: 0,
      teamsActivityDeleted: 0,
      deletedIds: [],
      dryRun
    };

    // Use the same connection strings as the main query
    const mainConnectionString = process.env.SQL_CONNECTION_STRING; // helix-core-data
    const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING; // instructions DB

    if (!mainConnectionString || !instructionsConnectionString) {
      return res.status(500).json({ error: 'Database connection strings not configured' });
    }

    // Teams Activity Cleanup FIRST (if requested) - MUST be done first due to FK constraints
    if (removeTeamsActivity && (testPattern || specificIds.length > 0)) {
      const teamsActivityDeleted = await withRequest(instructionsConnectionString, async (request) => {
        let query = `
          SELECT TOP 100 Id, EnquiryId, LeadName, Email
          FROM TeamsBotActivityTracking
          WHERE Status = 'active'
        `;
        
        if (testPattern) {
          request.input('testPattern', sql.NVarChar, `%${testPattern}%`);
          query += ` AND (
            (LeadName LIKE @testPattern AND LeadName LIKE @testPattern)
            OR Email LIKE '%test@%'
            OR Email LIKE '%example.com'
            OR Email LIKE '%dummy@%'
            OR Email LIKE '%@test.com'
          )`;
        }
        
        if (specificIds.length > 0) {
          const idParams = specificIds.map((id, idx) => {
            // Handle mixed ID types - some are strings, some are numbers
            const paramName = `enquiryId${idx}`;
            if (isNaN(id)) {
              // String ID
              request.input(paramName, sql.VarChar(50), String(id));
            } else {
              // Numeric ID  
              request.input(paramName, sql.Int, parseInt(id, 10));
            }
            return `@${paramName}`;
          }).join(', ');
          query += ` OR CAST(EnquiryId AS VARCHAR(50)) IN (${idParams})`;
        }

        // Get records to delete first
        const selectResult = await request.query(query);
        const recordsToDelete = selectResult.recordset || [];
        
        if (!dryRun && recordsToDelete.length > 0) {
          // Actually delete the records
          for (const record of recordsToDelete) {
            const deleteResult = await withRequest(instructionsConnectionString, async (deleteRequest) => {
              deleteRequest.input('recordId', sql.Int, record.Id);
              return await deleteRequest.query('DELETE FROM TeamsBotActivityTracking WHERE Id = @recordId');
            });
          }
        }

        return recordsToDelete;
      });

      results.teamsActivityDeleted = teamsActivityDeleted.length;
    }

    // V1 Database Cleanup (Main/helix-core-data system) - same as main query
    if (testPattern || specificIds.length > 0) {
      const v1DeletedIds = await withRequest(mainConnectionString, async (request) => {
        let query = `
          SELECT TOP 100 ID, First_Name, Last_Name, Email, Point_of_Contact
          FROM enquiries
          WHERE 1=1
        `;
        
        if (testPattern) {
          request.input('testPattern', sql.NVarChar, `%${testPattern}%`);
          query += ` AND (
            (First_Name LIKE @testPattern AND Last_Name LIKE @testPattern)
            OR Email LIKE '%test@%'
            OR Email LIKE '%example.com'
            OR Email LIKE '%dummy@%'
            OR Email LIKE '%@test.com'
            OR ID LIKE 'TEST-%'
            OR ID LIKE 'ENQ%test%'
            OR (First_Name = 'Test' OR Last_Name = 'Test')
          )`;
        }
        
        if (specificIds.length > 0) {
          const idParams = specificIds.map((id, idx) => {
            request.input(`id${idx}`, sql.Int, parseInt(id, 10));
            return `@id${idx}`;
          }).join(', ');
          query += ` OR ID IN (${idParams})`;
        }

        // Get records to delete first
        const selectResult = await request.query(query);
        const recordsToDelete = selectResult.recordset || [];
        
        if (!dryRun && recordsToDelete.length > 0) {
          // Actually delete the records using safe parameterized approach
          for (const record of recordsToDelete) {
            const deleteResult = await withRequest(mainConnectionString, async (deleteRequest) => {
              deleteRequest.input('recordId', sql.VarChar(50), String(record.ID));
              return await deleteRequest.query('DELETE FROM enquiries WHERE ID = @recordId');
            });
          }
        }

        return recordsToDelete;
      });

      results.v1Deleted = v1DeletedIds.length;
      results.deletedIds.push(...v1DeletedIds.map(r => ({ 
        system: 'v1', 
        id: r.ID, 
        name: `${r.First_Name || ''} ${r.Last_Name || ''}`.trim(), 
        email: r.Email || '',
        poc: r.Point_of_Contact || ''
      })));
    }

    // V2 Database Cleanup (Instructions system)
    if (testPattern || specificIds.length > 0) {
      const v2DeletedIds = await withRequest(instructionsConnectionString, async (request) => {
        let query = `
          SELECT TOP 100 id, first, last, email, poc
          FROM enquiries
          WHERE 1=1
        `;
        
        if (testPattern) {
          request.input('testPattern', sql.NVarChar, `%${testPattern}%`);
          query += ` AND (
            (first LIKE @testPattern AND last LIKE @testPattern)
            OR email LIKE '%test@%'
            OR email LIKE '%example.com'
            OR email LIKE '%dummy@%'
            OR email LIKE '%@test.com'
            OR (first = 'Test' OR last = 'Test')
          )`;
        }
        
        if (specificIds.length > 0) {
          const idParams = specificIds.map((id, idx) => {
            request.input(`id${idx}`, sql.Int, parseInt(id, 10));
            return `@id${idx}`;
          }).join(', ');
          query += ` OR id IN (${idParams})`;
        }

        // Get records to delete first
        const selectResult = await request.query(query);
        const recordsToDelete = selectResult.recordset || [];
        
        if (!dryRun && recordsToDelete.length > 0) {
          // Actually delete the records using safe approach
          for (const record of recordsToDelete) {
            const deleteResult = await withRequest(instructionsConnectionString, async (deleteRequest) => {
              deleteRequest.input('recordId', sql.Int, record.id);
              return await deleteRequest.query('DELETE FROM enquiries WHERE id = @recordId');
            });
          }
        }

        return recordsToDelete;
      });

      results.v2Deleted = v2DeletedIds.length;
      results.deletedIds.push(...v2DeletedIds.map(r => ({ 
        system: 'v2', 
        id: r.id, 
        name: `${r.first || ''} ${r.last || ''}`.trim(), 
        email: r.email || '',
        poc: r.poc || ''
      })));
    }

    // Clear cache after cleanup
    if (!dryRun && (results.v1Deleted > 0 || results.v2Deleted > 0)) {
      try {
        clearUnifiedMemoryCache();
        await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:*`);
        log.info('🗑️  Cache cleared after cleanup');
      } catch (cacheError) {
        log.warn('⚠️  Failed to clear cache after cleanup:', cacheError);
      }
    }

    const message = dryRun 
      ? `Dry run: Would delete ${results.v1Deleted} v1 + ${results.v2Deleted} v2 records${removeTeamsActivity ? ` + ${results.teamsActivityDeleted} Teams activities` : ''}` 
      : `Successfully deleted ${results.v1Deleted} v1 + ${results.v2Deleted} v2 records${removeTeamsActivity ? ` + ${results.teamsActivityDeleted} Teams activities` : ''}`;

    log.info('✅', message);

    try {
      broadcastEnquiriesChanged({ changeType: 'cleanup' });
    } catch { /* non-blocking */ }

    res.json({
      success: true,
      message,
      results
    });

  } catch (error) {
    log.error('❌ Error during cleanup:', error);
    res.status(500).json({ 
      error: 'Cleanup failed', 
      details: error?.message || 'Unknown error' 
    });
  }
});

module.exports = router;
module.exports.performUnifiedEnquiriesQuery = performUnifiedEnquiriesQuery;
module.exports.getDefaultEnquirySourceBias = (policy = 'operational') => getDefaultSourceBiasForPolicy(policy);
module.exports.invalidateUnifiedEnquiriesCache = async function invalidateUnifiedEnquiriesCache(reason = 'external') {
  // Bust the in-process memory cache + Redis keys so the next read goes to SQL.
  // Call this from any out-of-band write path (seed scripts, dev reseed,
  // webhook handlers that don't go through PATCH /enquiries-unified).
  try { clearUnifiedMemoryCache(); } catch { /* ignore */ }
  let deletedData = 0;
  let deletedEnquiries = 0;
  try {
    deletedData = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:data:*`);
    deletedEnquiries = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:enquiries:*`);
  } catch { /* ignore Redis failures */ }
  try { broadcastEnquiriesChanged({ changeType: 'invalidate', reason }); } catch { /* ignore */ }
  return { reason, deletedData, deletedEnquiries };
};

