const crypto = require('crypto');
const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { getClioAccessToken, CLIO_API_BASE } = require('../utils/clioAuth');
const { getRequestUser, isDevGroupOrHigher } = require('../utils/userTier');
const { buildSearchMarketingValueReportData, createSearchMarketingValueReportPdf } = require('../utils/searchMarketingValueReport');

const router = express.Router();

const DEFAULT_FROM = '2026-04-01';
const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 500;
const DRY_RUN_TTL_MS = 20 * 60 * 1000;
const PPC_SPEND_ESTIMATE = 35100;
const SEO_MONTHLY_COST = 8400;
const SEO_MONTHS_INCLUDED = 3;
const dryRunSnapshots = new Map();

function getInstructionsConnStr() {
  const value = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!value) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  return value;
}

function getCoreConnStr() {
  return process.env.SQL_CONNECTION_STRING || '';
}

function readActor(req) {
  const user = getRequestUser(req);
  return user.initials || user.email || 'unknown';
}

function requireWorkbenchAccess(req, res) {
  if (isDevGroupOrHigher(req)) return true;
  res.status(403).json({ ok: false, error: 'forbidden', message: 'Search attribution workbench is available to dev-owner users only.' });
  return false;
}

function parseDate(value, label, fallback = '') {
  const raw = String(value || fallback || '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const error = new Error(`${label} must be YYYY-MM-DD`);
    error.statusCode = 400;
    throw error;
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) {
    const error = new Error(`${label} is not a valid date`);
    error.statusCode = 400;
    throw error;
  }
  return { raw, date };
}

function readRange(source) {
  const from = parseDate(source?.from, 'from', DEFAULT_FROM);
  const to = parseDate(source?.to, 'to');
  return {
    fromDate: from.raw,
    from: from.date,
    toDate: to?.raw || null,
    toExclusive: to ? new Date(to.date.getTime() + 24 * 60 * 60 * 1000) : null,
  };
}

function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normaliseSource(value) {
  const source = String(value || '').trim().toLowerCase();
  if (source.includes('paid search') || source.includes('google ads') || source.includes('adwords') || source.includes('ppc')) return 'paid search';
  if (source.includes('organic search') || source === 'organic' || source.includes('google organic')) return 'organic search';
  return '';
}

function targetMatterSourceFor(value) {
  const source = normaliseSource(value);
  if (source === 'paid search') return '(search - ppc)';
  if (source === 'organic search') return '(search - organic)';
  return '';
}

function bucketForSource(value) {
  const source = String(value || '').trim().toLowerCase();
  if (source === '(search - ppc)' || source.includes('ppc') || source.includes('paid search') || source.includes('google ads') || source.includes('adwords')) return 'paidSearch';
  if (source === '(search - organic)' || source === 'organic' || source.includes('organic search') || source.includes('google organic')) return 'organicSearch';
  return null;
}

function intakeBucketForEnquiry(sourceValue, methodValue) {
  const source = String(sourceValue || '').trim().toLowerCase();
  const method = String(methodValue || '').trim().toLowerCase();
  const candidate = source.includes('phone') || source.includes('call in') || source.includes('website form') || source.includes('web form') || source.includes('online form') || source.includes('email') || source.includes('chat')
    ? source
    : method;
  if (candidate.includes('phone call') || candidate.includes('phone') || candidate === 'call in' || candidate === 'telephone') return 'calls';
  if (candidate.includes('website form') || candidate.includes('web form') || candidate.includes('online form') || candidate === 'contact form') return 'webforms';
  return 'other';
}

function buildSearchSpendAssumption() {
  const seoEstimate = SEO_MONTHLY_COST * SEO_MONTHS_INCLUDED;
  return {
    ppcSpend: PPC_SPEND_ESTIMATE,
    seoEstimate,
    totalEstimatedSearchSpend: PPC_SPEND_ESTIMATE + seoEstimate,
    seoBasis: 'GBP 8,400 per month for April, May, and June',
  };
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function hashForDisplay(value) {
  return crypto.createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex').slice(0, 12);
}

function hashPayload(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clampLimit(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function pickContactEmails(contact) {
  const emails = new Set();
  const primary = normaliseEmail(contact?.primary_email_address);
  if (primary) emails.add(primary);
  for (const entry of Array.isArray(contact?.email_addresses) ? contact.email_addresses : []) {
    const address = normaliseEmail(entry?.address);
    if (address) emails.add(address);
  }
  return Array.from(emails);
}

async function fetchClioContactById(clientId, token) {
  const params = new URLSearchParams({ fields: 'id,primary_email_address,email_addresses' });
  const response = await fetch(`${CLIO_API_BASE}/contacts/${encodeURIComponent(String(clientId))}?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Clio contact lookup failed (${response.status})`);
  const payload = await response.json();
  return payload?.data || null;
}

async function loadSourceSummary({ range, includePreRangeMatters }) {
  const openDateFilter = includePreRangeMatters ? '' : `AND OpenDate >= @fromDate ${range.toExclusive ? 'AND OpenDate < @toDateExclusive' : ''}`;
  const result = await withRequest(getInstructionsConnStr(), async (request) => {
    request.input('fromDate', sql.DateTime2, range.from);
    if (range.toExclusive) request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
    return request.query(`
      SELECT
        CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(Source, ''))), '') IS NULL THEN '(blank)' ELSE LOWER(LTRIM(RTRIM(Source))) END AS sourceLabel,
        COUNT(*) AS matters,
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(CAST(EnquiryID AS nvarchar(100)))), '') IS NULL THEN 1 ELSE 0 END) AS missingEnquiryId
      FROM dbo.Matters WITH (NOLOCK)
      WHERE 1 = 1 ${openDateFilter}
      GROUP BY CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(Source, ''))), '') IS NULL THEN '(blank)' ELSE LOWER(LTRIM(RTRIM(Source))) END
      ORDER BY COUNT(*) DESC
    `);
  });
  const sourceLabels = (result.recordset || []).map((row) => ({
    sourceLabel: String(row.sourceLabel || '(blank)'),
    matters: Number(row.matters || 0),
    missingEnquiryId: Number(row.missingEnquiryId || 0),
  }));
  const byLabel = new Map(sourceLabels.map((row) => [row.sourceLabel, row]));
  const unresolvedLabels = ['search', 'uncertain', '(blank)', 'unassigned'];
  return {
    range: { from: range.fromDate, to: range.toDate, matterOpenDateFiltered: !includePreRangeMatters },
    sourceLabels,
    unresolved: unresolvedLabels.map((label) => byLabel.get(label) || { sourceLabel: label, matters: 0, missingEnquiryId: 0 }),
    searchReady: {
      organicSearch: byLabel.get('(search - organic)')?.matters || 0,
      paidSearch: byLabel.get('(search - ppc)')?.matters || 0,
      genericSearch: byLabel.get('search')?.matters || 0,
    },
  };
}

async function loadCandidateMatters({ range, currentSource, includePreRangeMatters, limit }) {
  const openDateFilter = includePreRangeMatters ? '' : `AND OpenDate >= @fromDate ${range.toExclusive ? 'AND OpenDate < @toDateExclusive' : ''}`;
  const sourceFilter = currentSource ? 'AND LOWER(LTRIM(RTRIM(COALESCE(Source, \'\')))) = @currentSource' : '';
  const result = await withRequest(getInstructionsConnStr(), async (request) => {
    request.input('limit', sql.Int, limit);
    request.input('fromDate', sql.DateTime2, range.from);
    if (range.toExclusive) request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
    if (currentSource) request.input('currentSource', sql.NVarChar(255), currentSource);
    return request.query(`
      SELECT TOP (@limit)
        CAST(MatterID AS nvarchar(255)) AS matterId,
        CAST(DisplayNumber AS nvarchar(255)) AS displayNumber,
        CAST(Source AS nvarchar(255)) AS source,
        CAST(EnquiryID AS nvarchar(100)) AS enquiryId,
        CAST(ClientID AS nvarchar(255)) AS clientId,
        OpenDate
      FROM dbo.Matters WITH (NOLOCK)
      WHERE 1 = 1 ${openDateFilter} ${sourceFilter}
        AND NULLIF(LTRIM(RTRIM(CAST(ClientID AS nvarchar(255)))), '') IS NOT NULL
      ORDER BY OpenDate DESC, MatterID DESC
    `);
  });
  return result.recordset || [];
}

async function findSearchEnquiriesByBridgeValue(bridgeValue) {
  const value = String(bridgeValue || '').trim();
  if (!value) return [];
  const instructionsRows = await withRequest(getInstructionsConnStr(), async (request) => {
    request.input('bridgeValue', sql.NVarChar(100), value);
    return request.query(`
      SELECT TOP 5 CAST(id AS nvarchar(100)) AS enquiryId, CAST(acid AS nvarchar(100)) AS acid, 'new-space' AS enquirySystem, NULLIF(LTRIM(RTRIM(source)), '') AS source, datetime
      FROM dbo.enquiries WITH (NOLOCK)
      WHERE CAST(NULLIF(LTRIM(RTRIM(acid)), '') AS nvarchar(100)) = @bridgeValue
        AND (LOWER(LTRIM(RTRIM(source))) IN ('organic search', 'paid search') OR LOWER(LTRIM(RTRIM(source))) LIKE '%google ads%' OR LOWER(LTRIM(RTRIM(source))) LIKE '%adwords%')
      ORDER BY datetime DESC, id DESC
    `);
  });
  const coreConnStr = getCoreConnStr();
  if (!coreConnStr) return instructionsRows.recordset || [];
  const legacyRows = await withRequest(coreConnStr, async (request) => {
    request.input('bridgeValue', sql.NVarChar(100), value);
    return request.query(`
      SELECT TOP 5 CAST(ID AS nvarchar(100)) AS enquiryId, CAST(ID AS nvarchar(100)) AS acid, 'legacy' AS enquirySystem, NULLIF(LTRIM(RTRIM(Ultimate_Source)), '') AS source, COALESCE(Touchpoint_Date, Date_Created) AS datetime
      FROM dbo.enquiries WITH (NOLOCK)
      WHERE CAST(ID AS nvarchar(100)) = @bridgeValue
        AND (LOWER(LTRIM(RTRIM(Ultimate_Source))) IN ('organic search', 'paid search') OR LOWER(LTRIM(RTRIM(Ultimate_Source))) LIKE '%google ads%' OR LOWER(LTRIM(RTRIM(Ultimate_Source))) LIKE '%adwords%')
      ORDER BY COALESCE(Touchpoint_Date, Date_Created) DESC, ID DESC
    `);
  });
  return [...(instructionsRows.recordset || []), ...(legacyRows.recordset || [])].sort((left, right) => new Date(right.datetime).getTime() - new Date(left.datetime).getTime()).slice(0, 10);
}

async function findSearchEnquiriesByEmail(email, range) {
  const normalised = normaliseEmail(email);
  if (!normalised) return [];
  const instructionsRows = await withRequest(getInstructionsConnStr(), async (request) => {
    request.input('email', sql.NVarChar(255), normalised);
    request.input('fromDate', sql.DateTime2, range.from);
    if (range.toExclusive) request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
    const dateFilter = range.toExclusive ? 'AND datetime < @toDateExclusive' : '';
    return request.query(`
      SELECT TOP 5 CAST(id AS nvarchar(100)) AS enquiryId, CAST(acid AS nvarchar(100)) AS acid, 'new-space' AS enquirySystem, NULLIF(LTRIM(RTRIM(source)), '') AS source, datetime
      FROM dbo.enquiries WITH (NOLOCK)
      WHERE datetime >= @fromDate ${dateFilter} AND LOWER(LTRIM(RTRIM(email))) = @email
        AND (LOWER(LTRIM(RTRIM(source))) IN ('organic search', 'paid search') OR LOWER(LTRIM(RTRIM(source))) LIKE '%google ads%' OR LOWER(LTRIM(RTRIM(source))) LIKE '%adwords%')
      ORDER BY datetime DESC, id DESC
    `);
  });
  const coreConnStr = getCoreConnStr();
  if (!coreConnStr) return instructionsRows.recordset || [];
  const legacyRows = await withRequest(coreConnStr, async (request) => {
    request.input('email', sql.NVarChar(255), normalised);
    request.input('fromDate', sql.DateTime2, range.from);
    if (range.toExclusive) request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
    const dateFilter = range.toExclusive ? 'AND COALESCE(Touchpoint_Date, Date_Created) < @toDateExclusive' : '';
    return request.query(`
      SELECT TOP 5 CAST(ID AS nvarchar(100)) AS enquiryId, CAST(ID AS nvarchar(100)) AS acid, 'legacy' AS enquirySystem, NULLIF(LTRIM(RTRIM(Ultimate_Source)), '') AS source, COALESCE(Touchpoint_Date, Date_Created) AS datetime
      FROM dbo.enquiries WITH (NOLOCK)
      WHERE COALESCE(Touchpoint_Date, Date_Created) >= @fromDate ${dateFilter} AND LOWER(LTRIM(RTRIM(Email))) = @email
        AND (LOWER(LTRIM(RTRIM(Ultimate_Source))) IN ('organic search', 'paid search') OR LOWER(LTRIM(RTRIM(Ultimate_Source))) LIKE '%google ads%' OR LOWER(LTRIM(RTRIM(Ultimate_Source))) LIKE '%adwords%')
      ORDER BY COALESCE(Touchpoint_Date, Date_Created) DESC, ID DESC
    `);
  });
  return [...(instructionsRows.recordset || []), ...(legacyRows.recordset || [])].sort((left, right) => new Date(right.datetime).getTime() - new Date(left.datetime).getTime()).slice(0, 10);
}

function selectBestSearchEnquiry(enquiries) {
  const selected = enquiries.find((row) => normaliseSource(row.source) === 'paid search') || enquiries.find((row) => targetMatterSourceFor(row.source)) || null;
  if (!selected) return null;
  if (String(selected.enquirySystem || '').trim() === 'new-space') return { ...selected, newSpaceEnquiryId: String(selected.enquiryId || '').trim() };

  const bridgeValue = String(selected.acid || selected.enquiryId || '').trim();
  const pairedNewSpace = enquiries.find((row) => String(row.enquirySystem || '').trim() === 'new-space'
    && String(row.acid || '').trim()
    && String(row.acid || '').trim() === bridgeValue);
  return pairedNewSpace?.enquiryId ? { ...selected, newSpaceEnquiryId: String(pairedNewSpace.enquiryId || '').trim() } : selected;
}

function getMatterEnquiryLinkValue(enquiry) {
  return String(enquiry?.newSpaceEnquiryId || '').trim()
    || (String(enquiry?.enquirySystem || '').trim() === 'new-space' ? String(enquiry?.enquiryId || '').trim() : '');
}

async function buildDryRunPlan({ range, currentSource, includePreRangeMatters, limit, actor }) {
  const matters = await loadCandidateMatters({ range, currentSource, includePreRangeMatters, limit });
  const token = await getClioAccessToken(actor && actor.length <= 4 ? actor : undefined);
  const contactCache = new Map();
  const emailCache = new Map();
  const bridgeCache = new Map();
  const plan = [];
  const failureBuckets = new Map();
  const plannedMatterIds = new Set();
  const summary = { mode: 'dry-run', direction: 'matter-to-enquiry', scannedMatters: matters.length, emailsWithClioContact: 0, emailsWithoutClioContact: 0, bridgeMatches: 0, emailMatches: 0, proposedMatterUpdates: 0, matchedEnquiriesMissingNewId: 0, sourceToSearchOrganic: 0, sourceToSearchPpc: 0, failures: 0 };

  for (const localMatter of matters) {
    const matterId = String(localMatter.matterId || '').trim();
    const contactId = String(localMatter.clientId || '').trim();
    try {
      let enquiry = null;
      let matchMethod = '';
      const existingBridge = String(localMatter.enquiryId || '').trim();
      if (existingBridge) {
        let bridgedEnquiries = bridgeCache.get(existingBridge);
        if (!bridgeCache.has(existingBridge)) {
          bridgedEnquiries = await findSearchEnquiriesByBridgeValue(existingBridge);
          bridgeCache.set(existingBridge, bridgedEnquiries);
        }
        enquiry = selectBestSearchEnquiry(bridgedEnquiries || []);
        if (enquiry) {
          matchMethod = enquiry.enquirySystem === 'legacy' ? 'legacy-id-bridge' : 'acid-bridge';
          summary.bridgeMatches += 1;
        }
      }
      if (!enquiry && contactId) {
        let contact = contactCache.get(contactId);
        if (!contactCache.has(contactId)) {
          contact = await fetchClioContactById(contactId, token);
          contactCache.set(contactId, contact);
        }
        const emails = pickContactEmails(contact);
        if (!emails.length) summary.emailsWithoutClioContact += 1;
        else summary.emailsWithClioContact += 1;
        for (const email of emails) {
          let enquiries = emailCache.get(email);
          if (!emailCache.has(email)) {
            enquiries = await findSearchEnquiriesByEmail(email, range);
            emailCache.set(email, enquiries);
          }
          enquiry = selectBestSearchEnquiry(enquiries || []);
          if (enquiry) {
            matchMethod = enquiry.enquirySystem === 'legacy' ? 'clio-email-legacy' : 'clio-email-new-space';
            summary.emailMatches += 1;
            break;
          }
        }
      }
      const targetMatterSource = targetMatterSourceFor(enquiry?.source);
      if (!matterId || !enquiry || !targetMatterSource || plannedMatterIds.has(matterId)) continue;
      const enquiryLinkValue = getMatterEnquiryLinkValue(enquiry);
      const currentSourceValue = String(localMatter.source || '').trim();
      const currentEnquiryId = String(localMatter.enquiryId || '').trim();
      const updateFields = [];
      if (currentSourceValue.toLowerCase() !== targetMatterSource.toLowerCase()) updateFields.push('Source');
      if (enquiryLinkValue && currentEnquiryId !== enquiryLinkValue) updateFields.push('EnquiryID');
      if (!enquiryLinkValue) summary.matchedEnquiriesMissingNewId += 1;
      if (!updateFields.length) continue;
      plannedMatterIds.add(matterId);
      summary.proposedMatterUpdates += 1;
      if (targetMatterSource === '(search - organic)') summary.sourceToSearchOrganic += 1;
      if (targetMatterSource === '(search - ppc)') summary.sourceToSearchPpc += 1;
      plan.push({ matterId, displayNumberHash: hashForDisplay(localMatter.displayNumber), clientIdHash: hashForDisplay(localMatter.clientId), currentMatterSource: currentSourceValue || null, currentEnquiryId: currentEnquiryId || null, targetMatterSource, enquiryLinkValue: enquiryLinkValue || null, enquirySystem: String(enquiry.enquirySystem || '').trim() || null, enquirySource: normaliseSource(enquiry.source), matchMethod, updateFields });
    } catch (error) {
      summary.failures += 1;
      const key = String(error?.message || error || 'unknown').replace(/\s+/g, ' ').slice(0, 90);
      failureBuckets.set(key, (failureBuckets.get(key) || 0) + 1);
    }
  }
  return { summary, plan, failureBuckets: Object.fromEntries(failureBuckets) };
}

function pruneSnapshots() {
  const now = Date.now();
  for (const [token, snapshot] of dryRunSnapshots.entries()) {
    if (snapshot.expiresAt <= now) dryRunSnapshots.delete(token);
  }
}

async function applyPlan(plan) {
  let updatedMatters = 0;
  const updateResults = [];
  for (const entry of plan) {
    const rows = await withRequest(getInstructionsConnStr(), async (request) => {
      request.input('matterId', sql.NVarChar(255), entry.matterId);
      request.input('expectedSource', sql.NVarChar(255), entry.currentMatterSource || '');
      request.input('expectedEnquiryId', sql.NVarChar(100), entry.currentEnquiryId || '');
      request.input('nextSource', sql.NVarChar(255), entry.targetMatterSource);
      request.input('nextEnquiryId', sql.NVarChar(100), entry.enquiryLinkValue || '');
      return request.query(`
        UPDATE dbo.Matters
        SET Source = @nextSource,
            EnquiryID = CASE WHEN NULLIF(@nextEnquiryId, '') IS NULL THEN EnquiryID ELSE @nextEnquiryId END
        WHERE CAST(MatterID AS nvarchar(255)) = @matterId
          AND LTRIM(RTRIM(COALESCE(Source, ''))) = @expectedSource
          AND LTRIM(RTRIM(COALESCE(CAST(EnquiryID AS nvarchar(100)), ''))) = @expectedEnquiryId
      `);
    });
    const affected = Number(rows.rowsAffected?.[0] || 0);
    updatedMatters += affected;
    updateResults.push({ matterId: entry.matterId, updated: affected > 0, updateFields: entry.updateFields });
  }
  return { updatedMatters, updateResults };
}

function addMatterKey(index, key, matter) {
  const normalised = String(key || '').trim().toLowerCase();
  if (!normalised || index.has(normalised)) return;
  index.set(normalised, matter);
}

function getDescriptionMatterTokens(value) {
  const tokens = new Set();
  for (const match of String(value || '').matchAll(/[A-Z]{2,}-\d{3,}(?:-\d{3,})?/g)) tokens.add(match[0]);
  return Array.from(tokens);
}

function findMatchedMatter(row, matterIndex) {
  for (const candidate of [row.matterId, row.billId]) {
    const matched = matterIndex.get(String(candidate || '').trim().toLowerCase());
    if (matched) return { matter: matched, matchKind: candidate === row.matterId ? 'matterId' : 'billId' };
  }
  for (const token of getDescriptionMatterTokens(row.description)) {
    const matched = matterIndex.get(String(token || '').trim().toLowerCase());
    if (matched) return { matter: matched, matchKind: 'descriptionToken' };
  }
  return { matter: null, matchKind: null };
}

function makeCollectedBucket() {
  return { matters: 0, mattersWithCollected: 0, payments: 0, collected: 0 };
}

function makeMoneyBucket() {
  return { matters: 0, mattersWithPayments: 0, payments: 0, amount: 0 };
}

function makeWipBucket() {
  return { matters: 0, mattersWithWip: 0, rows: 0, hours: 0, amount: 0 };
}

async function loadSearchEnquiryCounts(range) {
  const instructionsRows = await withRequest(getInstructionsConnStr(), async (request) => {
    request.input('fromDate', sql.DateTime2, range.from);
    if (range.toExclusive) request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
    const toFilter = range.toExclusive ? 'AND datetime < @toDateExclusive' : '';
    return request.query(`
      SELECT CAST(id AS nvarchar(100)) AS enquiryId, CAST(acid AS nvarchar(100)) AS bridgeId, CAST(source AS nvarchar(255)) AS source, CAST(moc AS nvarchar(255)) AS methodOfContact
      FROM dbo.enquiries WITH (NOLOCK)
      WHERE datetime >= @fromDate ${toFilter}
        AND NULLIF(LTRIM(RTRIM(source)), '') IS NOT NULL
    `);
  });
  const counts = { organicSearch: new Set(), paidSearch: new Set() };
  const intakeCounts = {
    organicSearch: { calls: new Set(), webforms: new Set(), other: new Set() },
    paidSearch: { calls: new Set(), webforms: new Set(), other: new Set() },
  };
  const intakeBucketByKey = { organicSearch: new Map(), paidSearch: new Map() };
  const pairedBridgeIds = new Set();
  const addCount = (bucket, key, row) => {
    if (!bucket || !key) return;
    counts[bucket].add(key);
    const nextBucket = intakeBucketForEnquiry(row.source, row.methodOfContact);
    const previousBucket = intakeBucketByKey[bucket].get(key);
    if (previousBucket === nextBucket) return;
    if (previousBucket) intakeCounts[bucket][previousBucket].delete(key);
    intakeBucketByKey[bucket].set(key, nextBucket);
    intakeCounts[bucket][nextBucket].add(key);
  };
  for (const row of instructionsRows.recordset || []) {
    const bucket = bucketForSource(row.source);
    if (!bucket) continue;
    const enquiryId = String(row.enquiryId || '').trim();
    const bridgeId = String(row.bridgeId || '').trim();
    if (enquiryId) addCount(bucket, `new:${enquiryId}`, row);
    if (bridgeId) pairedBridgeIds.add(bridgeId);
  }

  const coreConnStr = getCoreConnStr();
  if (coreConnStr) {
    const legacyRows = await withRequest(coreConnStr, async (request) => {
      request.input('fromDate', sql.DateTime2, range.from);
      if (range.toExclusive) request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
      const toFilter = range.toExclusive ? 'AND COALESCE(Touchpoint_Date, Date_Created) < @toDateExclusive' : '';
      return request.query(`
        SELECT CAST(ID AS nvarchar(100)) AS enquiryId, CAST(ID AS nvarchar(100)) AS bridgeId, CAST(Ultimate_Source AS nvarchar(255)) AS source, CAST(Method_of_Contact AS nvarchar(255)) AS methodOfContact
        FROM dbo.enquiries WITH (NOLOCK)
        WHERE COALESCE(Touchpoint_Date, Date_Created) >= @fromDate ${toFilter}
          AND NULLIF(LTRIM(RTRIM(Ultimate_Source)), '') IS NOT NULL
      `);
    });
    for (const row of legacyRows.recordset || []) {
      const bucket = bucketForSource(row.source);
      const bridgeId = String(row.bridgeId || row.enquiryId || '').trim();
      if (!bucket || !bridgeId || pairedBridgeIds.has(bridgeId)) continue;
      addCount(bucket, `legacy:${bridgeId}`, row);
    }
  }

  const toIntakeSummary = (bucket) => ({
    calls: intakeCounts[bucket].calls.size,
    webforms: intakeCounts[bucket].webforms.size,
    other: intakeCounts[bucket].other.size,
    total: intakeCounts[bucket].calls.size + intakeCounts[bucket].webforms.size + intakeCounts[bucket].other.size,
  });
  const organicIntake = toIntakeSummary('organicSearch');
  const paidIntake = toIntakeSummary('paidSearch');

  return {
    organicSearch: counts.organicSearch.size,
    paidSearch: counts.paidSearch.size,
    totalSearch: counts.organicSearch.size + counts.paidSearch.size,
    byMethod: {
      organicSearch: organicIntake,
      paidSearch: paidIntake,
      totalSearch: {
        calls: organicIntake.calls + paidIntake.calls,
        webforms: organicIntake.webforms + paidIntake.webforms,
        other: organicIntake.other + paidIntake.other,
        total: organicIntake.total + paidIntake.total,
      },
    },
  };
}

async function loadFyValue({ range, includePreRangeMatters }) {
  const openDateFilter = includePreRangeMatters ? '' : `AND OpenDate >= @fromDate ${range.toExclusive ? 'AND OpenDate < @toDateExclusive' : ''}`;
  const mattersResult = await withRequest(getInstructionsConnStr(), async (request) => {
    request.input('fromDate', sql.DateTime2, range.from);
    if (range.toExclusive) request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
    return request.query(`
      SELECT CAST(MatterID AS nvarchar(255)) AS matterId, CAST(DisplayNumber AS nvarchar(255)) AS displayNumber, CAST(Source AS nvarchar(255)) AS source, OpenDate
      FROM dbo.Matters WITH (NOLOCK)
      WHERE Source IS NOT NULL ${openDateFilter}
        AND (LOWER(LTRIM(RTRIM(Source))) IN ('(search - organic)', '(search - ppc)') OR LOWER(LTRIM(RTRIM(Source))) LIKE '%organic search%' OR LOWER(LTRIM(RTRIM(Source))) LIKE '%paid search%' OR LOWER(LTRIM(RTRIM(Source))) LIKE '%ppc%')
    `);
  });
  const matterIndex = new Map();
  const bucketMatterIds = { organicSearch: new Set(), paidSearch: new Set() };
  for (const matter of mattersResult.recordset || []) {
    const bucket = bucketForSource(matter.source);
    if (!bucket) continue;
    const matterKey = String(matter.matterId || matter.displayNumber || '').trim();
    if (!matterKey) continue;
    bucketMatterIds[bucket].add(matterKey);
    addMatterKey(matterIndex, matter.matterId, { ...matter, bucket, matterKey });
    addMatterKey(matterIndex, matter.displayNumber, { ...matter, bucket, matterKey });
  }

  const coreConnStr = getCoreConnStr();
  const collectedRows = coreConnStr ? await withRequest(coreConnStr, async (request) => {
    request.input('fromDate', sql.DateTime2, range.from);
    if (range.toExclusive) request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
    const toFilter = range.toExclusive ? 'AND payment_date < @toDateExclusive' : '';
    return request.query(`SELECT CAST(matter_id AS nvarchar(255)) AS matterId, CAST(bill_id AS nvarchar(255)) AS billId, CAST(description AS nvarchar(1000)) AS description, payment_allocated, kind FROM dbo.collectedTime WITH (NOLOCK) WHERE payment_date >= @fromDate ${toFilter} AND payment_allocated > 0 AND (kind IS NULL OR kind NOT IN ('Expense', 'Product'))`);
  }) : { recordset: [] };
  const wipRows = coreConnStr ? await withRequest(coreConnStr, async (request) => {
    request.input('fromDate', sql.DateTime2, range.from);
    if (range.toExclusive) request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
    const toFilter = range.toExclusive ? 'AND date < @toDateExclusive' : '';
    return request.query(`SELECT CAST(matter_id AS nvarchar(255)) AS matterId, CAST(matter_display_number AS nvarchar(255)) AS displayNumber, quantity_in_hours, total, non_billable FROM dbo.wip WITH (NOLOCK) WHERE date >= @fromDate ${toFilter} AND ISNULL(non_billable, 0) = 0 AND ISNULL(total, 0) <> 0`);
  }) : { recordset: [] };
  const upfrontRows = await withRequest(getInstructionsConnStr(), async (request) => {
    request.input('fromDate', sql.DateTime2, range.from);
    if (range.toExclusive) request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
    const toFilter = range.toExclusive ? 'AND p.created_at < @toDateExclusive' : '';
    return request.query(`
      SELECT CAST(m.MatterID AS nvarchar(255)) AS matterId, CAST(m.DisplayNumber AS nvarchar(255)) AS displayNumber, CAST(m.Source AS nvarchar(255)) AS source, p.amount, p.payment_status, p.internal_status
      FROM dbo.Payments p WITH (NOLOCK)
      INNER JOIN dbo.Matters m WITH (NOLOCK) ON CAST(m.InstructionRef AS nvarchar(255)) = CAST(p.instruction_ref AS nvarchar(255))
      WHERE p.created_at >= @fromDate ${toFilter} AND ISNULL(p.amount, 0) > 0 AND LOWER(LTRIM(RTRIM(COALESCE(p.internal_status, '')))) <> 'archived'
        AND (LOWER(LTRIM(RTRIM(COALESCE(p.payment_status, '')))) IN ('succeeded', 'paid', 'confirmed') OR LOWER(LTRIM(RTRIM(COALESCE(p.internal_status, '')))) IN ('paid', 'confirmed'))
    `);
  });
  const searchEnquiries = await loadSearchEnquiryCounts(range);

  const summary = {
    range: { from: range.fromDate, to: range.toDate, matterOpenDateFiltered: !includePreRangeMatters },
    searchMatters: { organicSearch: bucketMatterIds.organicSearch.size, paidSearch: bucketMatterIds.paidSearch.size, total: bucketMatterIds.organicSearch.size + bucketMatterIds.paidSearch.size },
    searchEnquiries,
    spendAssumption: buildSearchSpendAssumption(),
    collected: { organicSearch: makeCollectedBucket(), paidSearch: makeCollectedBucket(), totalSearch: makeCollectedBucket() },
    upfrontPayments: { organicSearch: makeMoneyBucket(), paidSearch: makeMoneyBucket(), totalSearch: makeMoneyBucket() },
    chargeableWip: { organicSearch: makeWipBucket(), paidSearch: makeWipBucket(), totalSearch: makeWipBucket() },
    combinedCollectedAndUpfront: { organicSearch: 0, paidSearch: 0, totalSearch: 0 },
    matchKinds: { matterId: 0, billId: 0, descriptionToken: 0 },
    unmatchedCollectedRows: 0,
    providerReadiness: { collectedTime: coreConnStr ? 'configured' : 'missing-core-connection', wip: coreConnStr ? 'configured' : 'missing-core-connection', upfrontPayments: 'configured', googleAdsSpend: 'not-persisted' },
  };
  for (const bucket of ['organicSearch', 'paidSearch']) {
    summary.collected[bucket].matters = bucketMatterIds[bucket].size;
    summary.upfrontPayments[bucket].matters = bucketMatterIds[bucket].size;
    summary.chargeableWip[bucket].matters = bucketMatterIds[bucket].size;
  }
  summary.collected.totalSearch.matters = summary.searchMatters.total;
  summary.upfrontPayments.totalSearch.matters = summary.searchMatters.total;
  summary.chargeableWip.totalSearch.matters = summary.searchMatters.total;
  const mattersWithCollected = { organicSearch: new Set(), paidSearch: new Set() };
  for (const row of collectedRows.recordset || []) {
    const { matter, matchKind } = findMatchedMatter(row, matterIndex);
    if (!matter) {
      summary.unmatchedCollectedRows += 1;
      continue;
    }
    const bucket = matter.bucket;
    if (matchKind) summary.matchKinds[matchKind] += 1;
    mattersWithCollected[bucket].add(matter.matterKey);
    summary.collected[bucket].payments += 1;
    summary.collected[bucket].collected += toNumber(row.payment_allocated);
    summary.collected.totalSearch.payments += 1;
    summary.collected.totalSearch.collected += toNumber(row.payment_allocated);
  }
  const mattersWithUpfront = { organicSearch: new Set(), paidSearch: new Set() };
  for (const row of upfrontRows.recordset || []) {
    const bucket = bucketForSource(row.source);
    if (!bucket) continue;
    const matterKey = String(row.matterId || row.displayNumber || '').trim();
    if (!matterKey || !bucketMatterIds[bucket].has(matterKey)) continue;
    mattersWithUpfront[bucket].add(matterKey);
    summary.upfrontPayments[bucket].payments += 1;
    summary.upfrontPayments[bucket].amount += toNumber(row.amount);
    summary.upfrontPayments.totalSearch.payments += 1;
    summary.upfrontPayments.totalSearch.amount += toNumber(row.amount);
  }
  const mattersWithWip = { organicSearch: new Set(), paidSearch: new Set() };
  for (const row of wipRows.recordset || []) {
    const { matter } = findMatchedMatter(row, matterIndex);
    if (!matter) continue;
    const bucket = matter.bucket;
    mattersWithWip[bucket].add(matter.matterKey);
    summary.chargeableWip[bucket].rows += 1;
    summary.chargeableWip[bucket].hours += toNumber(row.quantity_in_hours);
    summary.chargeableWip[bucket].amount += toNumber(row.total);
    summary.chargeableWip.totalSearch.rows += 1;
    summary.chargeableWip.totalSearch.hours += toNumber(row.quantity_in_hours);
    summary.chargeableWip.totalSearch.amount += toNumber(row.total);
  }
  for (const bucket of ['organicSearch', 'paidSearch']) {
    summary.collected[bucket].mattersWithCollected = mattersWithCollected[bucket].size;
    summary.upfrontPayments[bucket].mattersWithPayments = mattersWithUpfront[bucket].size;
    summary.chargeableWip[bucket].mattersWithWip = mattersWithWip[bucket].size;
  }
  summary.collected.totalSearch.mattersWithCollected = mattersWithCollected.organicSearch.size + mattersWithCollected.paidSearch.size;
  summary.upfrontPayments.totalSearch.mattersWithPayments = mattersWithUpfront.organicSearch.size + mattersWithUpfront.paidSearch.size;
  summary.chargeableWip.totalSearch.mattersWithWip = mattersWithWip.organicSearch.size + mattersWithWip.paidSearch.size;
  for (const bucket of ['organicSearch', 'paidSearch', 'totalSearch']) {
    summary.collected[bucket].collected = Number(summary.collected[bucket].collected.toFixed(2));
    summary.upfrontPayments[bucket].amount = Number(summary.upfrontPayments[bucket].amount.toFixed(2));
    summary.chargeableWip[bucket].hours = Number(summary.chargeableWip[bucket].hours.toFixed(2));
    summary.chargeableWip[bucket].amount = Number(summary.chargeableWip[bucket].amount.toFixed(2));
  }
  summary.combinedCollectedAndUpfront.organicSearch = Number((summary.collected.organicSearch.collected + summary.upfrontPayments.organicSearch.amount).toFixed(2));
  summary.combinedCollectedAndUpfront.paidSearch = Number((summary.collected.paidSearch.collected + summary.upfrontPayments.paidSearch.amount).toFixed(2));
  summary.combinedCollectedAndUpfront.totalSearch = Number((summary.collected.totalSearch.collected + summary.upfrontPayments.totalSearch.amount).toFixed(2));
  return summary;
}

function sendRouteError(res, error, fallbackCode) {
  const status = Number(error?.statusCode) || 500;
  return res.status(status).json({ ok: false, error: fallbackCode, message: error?.message || 'Search attribution request failed' });
}

router.get('/summary', async (req, res) => {
  const actor = readActor(req);
  const startedMs = Date.now();
  try {
    const range = readRange(req.query || {});
    const includePreRangeMatters = String(req.query.includePreRangeMatters || 'true').toLowerCase() !== 'false';
    trackEvent('SearchAttribution.Summary.Started', { operation: 'summary', triggeredBy: actor, from: range.fromDate, to: range.toDate || '' });
    const summary = await loadSourceSummary({ range, includePreRangeMatters });
    const durationMs = Date.now() - startedMs;
    trackEvent('SearchAttribution.Summary.Completed', { operation: 'summary', triggeredBy: actor, durationMs, genericSearch: summary.searchReady.genericSearch });
    trackMetric('SearchAttribution.Summary.Duration', durationMs, { operation: 'summary' });
    return res.json({ ok: true, summary, generatedAt: new Date().toISOString() });
  } catch (error) {
    const durationMs = Date.now() - startedMs;
    trackException(error, { operation: 'SearchAttribution.Summary', phase: 'route', triggeredBy: actor, durationMs });
    trackEvent('SearchAttribution.Summary.Failed', { operation: 'summary', triggeredBy: actor, durationMs, error: error?.message || String(error) });
    return sendRouteError(res, error, 'search_attribution_summary_failed');
  }
});

router.get('/fy-value', async (req, res) => {
  const actor = readActor(req);
  const startedMs = Date.now();
  try {
    const range = readRange(req.query || {});
    const includePreRangeMatters = String(req.query.includePreRangeMatters || 'true').toLowerCase() !== 'false';
    trackEvent('SearchAttribution.ValueSummary.Started', { operation: 'fy-value', triggeredBy: actor, from: range.fromDate, to: range.toDate || '' });
    const value = await loadFyValue({ range, includePreRangeMatters });
    const durationMs = Date.now() - startedMs;
    trackEvent('SearchAttribution.ValueSummary.Completed', { operation: 'fy-value', triggeredBy: actor, durationMs, searchMatters: value.searchMatters.total });
    trackMetric('SearchAttribution.ValueSummary.Duration', durationMs, { operation: 'fy-value' });
    return res.json({ ok: true, value, generatedAt: new Date().toISOString() });
  } catch (error) {
    const durationMs = Date.now() - startedMs;
    trackException(error, { operation: 'SearchAttribution.ValueSummary', phase: 'route', triggeredBy: actor, durationMs });
    trackEvent('SearchAttribution.ValueSummary.Failed', { operation: 'fy-value', triggeredBy: actor, durationMs, error: error?.message || String(error) });
    return sendRouteError(res, error, 'search_attribution_value_failed');
  }
});

router.get('/value-report.pdf', async (req, res) => {
  const actor = readActor(req);
  const startedMs = Date.now();
  try {
    const range = readRange(req.query || {});
    trackEvent('SearchAttribution.ValueReport.Started', { operation: 'value-report', triggeredBy: actor, from: range.fromDate, to: range.toDate || '' });
    const reportData = await buildSearchMarketingValueReportData(range);
    const pdf = createSearchMarketingValueReportPdf(reportData);
    const durationMs = Date.now() - startedMs;
    trackEvent('SearchAttribution.ValueReport.Completed', { operation: 'value-report', triggeredBy: actor, durationMs, from: reportData.range.fromDate, to: reportData.range.toDate, matters: reportData.matterRows.length, pages: pdf.pageCount });
    trackMetric('SearchAttribution.ValueReport.Duration', durationMs, { operation: 'value-report' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.fileName}"`);
    res.setHeader('Content-Length', String(pdf.buffer.length));
    return res.send(pdf.buffer);
  } catch (error) {
    const durationMs = Date.now() - startedMs;
    trackException(error, { operation: 'SearchAttribution.ValueReport', phase: 'route', triggeredBy: actor, durationMs });
    trackEvent('SearchAttribution.ValueReport.Failed', { operation: 'value-report', triggeredBy: actor, durationMs, error: error?.message || String(error) });
    return sendRouteError(res, error, 'search_attribution_value_report_failed');
  }
});

router.post('/dry-run', async (req, res) => {
  if (!requireWorkbenchAccess(req, res)) return;
  const actor = readActor(req);
  const startedMs = Date.now();
  try {
    pruneSnapshots();
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const range = readRange(body);
    const currentSource = String(body.currentSource || 'search').trim().toLowerCase();
    const includePreRangeMatters = body.includePreRangeMatters !== false;
    const limit = clampLimit(body.limit);
    trackEvent('SearchAttribution.DryRun.Started', { operation: 'dry-run', triggeredBy: actor, from: range.fromDate, to: range.toDate || '', currentSource, limit });
    const { summary, plan, failureBuckets } = await buildDryRunPlan({ range, currentSource, includePreRangeMatters, limit, actor });
    const planHash = hashPayload(plan);
    const dryRunToken = crypto.randomUUID();
    dryRunSnapshots.set(dryRunToken, { actor, createdAt: Date.now(), expiresAt: Date.now() + DRY_RUN_TTL_MS, planHash, plan });
    const durationMs = Date.now() - startedMs;
    trackEvent('SearchAttribution.DryRun.Completed', { operation: 'dry-run', triggeredBy: actor, durationMs, proposedMatterUpdates: summary.proposedMatterUpdates });
    trackMetric('SearchAttribution.DryRun.Duration', durationMs, { operation: 'dry-run' });
    return res.json({ ok: true, dryRunToken, planHash, expiresAt: new Date(Date.now() + DRY_RUN_TTL_MS).toISOString(), summary, failureBuckets, planPreview: plan.slice(0, 25), planTruncated: Math.max(0, plan.length - 25), generatedAt: new Date().toISOString() });
  } catch (error) {
    const durationMs = Date.now() - startedMs;
    trackException(error, { operation: 'SearchAttribution.DryRun', phase: 'route', triggeredBy: actor, durationMs });
    trackEvent('SearchAttribution.DryRun.Failed', { operation: 'dry-run', triggeredBy: actor, durationMs, error: error?.message || String(error) });
    return sendRouteError(res, error, 'search_attribution_dry_run_failed');
  }
});

router.post('/apply', async (req, res) => {
  if (!requireWorkbenchAccess(req, res)) return;
  const actor = readActor(req);
  const startedMs = Date.now();
  try {
    pruneSnapshots();
    const dryRunToken = String(req.body?.dryRunToken || '').trim();
    const planHash = String(req.body?.planHash || '').trim();
    const snapshot = dryRunSnapshots.get(dryRunToken);
    if (!snapshot || snapshot.expiresAt <= Date.now()) return res.status(409).json({ ok: false, error: 'dry_run_expired', message: 'Run a fresh dry-run before applying updates.' });
    if (snapshot.planHash !== planHash || hashPayload(snapshot.plan) !== planHash) return res.status(409).json({ ok: false, error: 'dry_run_mismatch', message: 'Dry-run snapshot does not match the supplied plan hash.' });
    trackEvent('SearchAttribution.Apply.Started', { operation: 'apply', triggeredBy: actor, proposedMatterUpdates: snapshot.plan.length });
    const result = await applyPlan(snapshot.plan);
    dryRunSnapshots.delete(dryRunToken);
    const durationMs = Date.now() - startedMs;
    trackEvent('SearchAttribution.Apply.Completed', { operation: 'apply', triggeredBy: actor, durationMs, updatedMatters: result.updatedMatters });
    trackMetric('SearchAttribution.Apply.Duration', durationMs, { operation: 'apply' });
    return res.json({ ok: true, ...result, generatedAt: new Date().toISOString() });
  } catch (error) {
    const durationMs = Date.now() - startedMs;
    trackException(error, { operation: 'SearchAttribution.Apply', phase: 'route', triggeredBy: actor, durationMs });
    trackEvent('SearchAttribution.Apply.Failed', { operation: 'apply', triggeredBy: actor, durationMs, error: error?.message || String(error) });
    return sendRouteError(res, error, 'search_attribution_apply_failed');
  }
});

module.exports = router;
