const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const { withRequest, sql } = require('./db');

const REPORT_MIN_DATE = '2026-04-01';
const PPC_SPEND_ESTIMATE = 35100;
const PPC_SPEND_ESTIMATE_FROM = '2026-04-01';
const PPC_SPEND_ESTIMATE_TO = '2026-06-19';
const SEO_MONTHLY_COST = 8400;
const DAY_MS = 24 * 60 * 60 * 1000;
const pageWidth = 842;
const pageHeight = 595;
const margin = 34;
const contentWidth = pageWidth - (margin * 2);
const footerY = 568;
const firstPageMatterRows = 10;
const continuationPageMatterRows = 39;
const matterRowHeight = 10.2;
const websiteBlue = [0, 3, 25];
const darkBlue = [6, 23, 51];
const navy = [13, 47, 96];
const highlight = [54, 144, 206];
const ink = [24, 32, 42];
const muted = [94, 108, 126];
const line = [225, 225, 225];
const pageFill = [240, 242, 245];
const panelFill = [255, 255, 255];
const softBlue = [214, 232, 255];
const softGreen = [236, 248, 242];
const softAmber = [255, 248, 235];
const green = [39, 126, 96];
const amber = [174, 103, 26];
const red = [157, 70, 54];

function getInstructionsConnStr() {
  const value = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!value) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  return value;
}

function getCoreConnStr() {
  return process.env.SQL_CONNECTION_STRING || '';
}

function utcDateKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parseReportDate(value, label) {
  const raw = String(value || '').trim();
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

function normaliseSearchMarketingValueReportRange(source = {}) {
  const todayKey = utcDateKey();
  const min = parseReportDate(REPORT_MIN_DATE, 'minimum date');
  const from = parseReportDate(source.fromDate || source.from || REPORT_MIN_DATE, 'from');
  const to = parseReportDate(source.toDate || source.to || todayKey, 'to');
  if (from.date < min.date) {
    const error = new Error(`from must be on or after ${REPORT_MIN_DATE}`);
    error.statusCode = 400;
    throw error;
  }
  const today = parseReportDate(todayKey, 'today');
  if (to.date > today.date) {
    const error = new Error('to cannot be in the future');
    error.statusCode = 400;
    throw error;
  }
  if (from.date > to.date) {
    const error = new Error('from must be on or before to');
    error.statusCode = 400;
    throw error;
  }
  return {
    fromDate: from.raw,
    toDate: to.raw,
    from: from.date,
    to: to.date,
    toExclusive: new Date(to.date.getTime() + DAY_MS),
  };
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
  return Number(toNumber(value).toFixed(2));
}

function bucketForSource(value) {
  const source = String(value || '').trim().toLowerCase();
  if (source === '(search - ppc)' || source.includes('ppc') || source.includes('paid search') || source.includes('google ads') || source.includes('adwords')) return 'paidSearch';
  if (source === '(search - organic)' || source === 'organic' || source.includes('organic search') || source.includes('google organic')) return 'organicSearch';
  return null;
}

function sourceLabelForBucket(bucket) {
  if (bucket === 'paidSearch') return 'Paid search';
  if (bucket === 'organicSearch') return 'Organic search';
  return 'Search';
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

function monthLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function addMatterKey(index, key, matter) {
  const normalised = String(key || '').trim().toLowerCase();
  if (!normalised || index.has(normalised)) return;
  index.set(normalised, matter);
}

function findMatchedMatter(row, matterIndex) {
  for (const candidate of [row.matterId, row.billId, row.displayNumber, row.instructionRef]) {
    const matched = matterIndex.get(String(candidate || '').trim().toLowerCase());
    if (matched) return matched;
  }
  return null;
}

function startOfUtcMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function countCalendarMonthsTouched(from, to) {
  let count = 0;
  const cursor = startOfUtcMonth(from);
  const end = startOfUtcMonth(to);
  while (cursor <= end) {
    count += 1;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return count;
}

function countInclusiveDays(from, to) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1);
}

function countOverlapDays(range, fromKey, toKey) {
  const from = parseReportDate(fromKey, 'estimate from').date;
  const to = parseReportDate(toKey, 'estimate to').date;
  const start = new Date(Math.max(range.from.getTime(), from.getTime()));
  const end = new Date(Math.min(range.to.getTime(), to.getTime()));
  return countInclusiveDays(start, end);
}

function buildSearchSpendAssumption(range) {
  const seoMonthsIncluded = countCalendarMonthsTouched(range.from, range.to);
  const seoEstimate = SEO_MONTHLY_COST * seoMonthsIncluded;
  const ppcBaseDays = countInclusiveDays(parseReportDate(PPC_SPEND_ESTIMATE_FROM, 'PPC estimate from').date, parseReportDate(PPC_SPEND_ESTIMATE_TO, 'PPC estimate to').date);
  const ppcOverlapDays = countOverlapDays(range, PPC_SPEND_ESTIMATE_FROM, PPC_SPEND_ESTIMATE_TO);
  const ppcSpend = ppcBaseDays > 0 ? roundMoney(PPC_SPEND_ESTIMATE * (ppcOverlapDays / ppcBaseDays)) : 0;
  return {
    ppcSpend,
    ppcBasis: `GBP ${PPC_SPEND_ESTIMATE.toLocaleString('en-GB')} baseline from ${PPC_SPEND_ESTIMATE_FROM} to ${PPC_SPEND_ESTIMATE_TO}, pro-rated to selected overlap`,
    seoMonthlyCost: SEO_MONTHLY_COST,
    seoMonthsIncluded,
    seoEstimate,
    seoBasis: `GBP ${SEO_MONTHLY_COST.toLocaleString('en-GB')} per calendar month touched by the report window`,
    totalEstimatedSearchSpend: roundMoney(ppcSpend + seoEstimate),
  };
}

async function loadSearchMatters() {
  const result = await withRequest(getInstructionsConnStr(), async (request) => request.query(`
    SELECT
      CAST(MatterID AS nvarchar(255)) AS matterId,
      CAST(DisplayNumber AS nvarchar(255)) AS displayNumber,
      CAST(InstructionRef AS nvarchar(255)) AS instructionRef,
      CAST(EnquiryID AS nvarchar(100)) AS enquiryId,
      CAST(Source AS nvarchar(255)) AS source,
      OpenDate
    FROM dbo.Matters WITH (NOLOCK)
    WHERE Source IS NOT NULL
      AND (
        LOWER(LTRIM(RTRIM(Source))) IN ('(search - organic)', '(search - ppc)')
        OR LOWER(LTRIM(RTRIM(Source))) LIKE '%organic search%'
        OR LOWER(LTRIM(RTRIM(Source))) LIKE '%paid search%'
        OR LOWER(LTRIM(RTRIM(Source))) LIKE '%ppc%'
      )
    ORDER BY OpenDate DESC, MatterID DESC
  `));
  return result.recordset || [];
}

async function loadSearchEnquiryCounts(range) {
  const instructionsRows = await withRequest(getInstructionsConnStr(), async (request) => {
    request.input('fromDate', sql.DateTime2, range.from);
    request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
    return request.query(`
      SELECT CAST(id AS nvarchar(100)) AS enquiryId, CAST(acid AS nvarchar(100)) AS bridgeId, CAST(source AS nvarchar(255)) AS source, CAST(moc AS nvarchar(255)) AS methodOfContact
      FROM dbo.enquiries WITH (NOLOCK)
      WHERE datetime >= @fromDate
        AND datetime < @toDateExclusive
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
      request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
      return request.query(`
        SELECT CAST(ID AS nvarchar(100)) AS enquiryId, CAST(ID AS nvarchar(100)) AS bridgeId, CAST(Ultimate_Source AS nvarchar(255)) AS source, CAST(Method_of_Contact AS nvarchar(255)) AS methodOfContact
        FROM dbo.enquiries WITH (NOLOCK)
        WHERE COALESCE(Touchpoint_Date, Date_Created) >= @fromDate
          AND COALESCE(Touchpoint_Date, Date_Created) < @toDateExclusive
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
    organicSearch: { total: counts.organicSearch.size, ...organicIntake },
    paidSearch: { total: counts.paidSearch.size, ...paidIntake },
    totalSearch: {
      total: counts.organicSearch.size + counts.paidSearch.size,
      calls: organicIntake.calls + paidIntake.calls,
      webforms: organicIntake.webforms + paidIntake.webforms,
      other: organicIntake.other + paidIntake.other,
    },
  };
}

async function loadCollectedRows(range) {
  const coreConnStr = getCoreConnStr();
  if (!coreConnStr) return [];
  const result = await withRequest(coreConnStr, async (request) => {
    request.input('fromDate', sql.DateTime2, range.from);
    request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
    return request.query(`
      SELECT CAST(matter_id AS nvarchar(255)) AS matterId, CAST(bill_id AS nvarchar(255)) AS billId, payment_allocated, kind
      FROM dbo.collectedTime WITH (NOLOCK)
      WHERE payment_date >= @fromDate
        AND payment_date < @toDateExclusive
        AND payment_allocated > 0
        AND (kind IS NULL OR kind NOT IN ('Expense', 'Product'))
    `);
  });
  return result.recordset || [];
}

async function loadWipRows(range) {
  const coreConnStr = getCoreConnStr();
  if (!coreConnStr) return [];
  const result = await withRequest(coreConnStr, async (request) => {
    request.input('fromDate', sql.DateTime2, range.from);
    request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
    return request.query(`
      SELECT CAST(matter_id AS nvarchar(255)) AS matterId, CAST(matter_display_number AS nvarchar(255)) AS displayNumber, quantity_in_hours, total, non_billable
      FROM dbo.wip WITH (NOLOCK)
      WHERE date >= @fromDate
        AND date < @toDateExclusive
        AND ISNULL(non_billable, 0) = 0
        AND ISNULL(total, 0) <> 0
    `);
  });
  return result.recordset || [];
}

async function loadUpfrontPaymentRows(range) {
  const result = await withRequest(getInstructionsConnStr(), async (request) => {
    request.input('fromDate', sql.DateTime2, range.from);
    request.input('toDateExclusive', sql.DateTime2, range.toExclusive);
    return request.query(`
      SELECT CAST(m.MatterID AS nvarchar(255)) AS matterId, CAST(m.DisplayNumber AS nvarchar(255)) AS displayNumber, CAST(m.Source AS nvarchar(255)) AS source, p.amount, p.payment_status, p.internal_status
      FROM dbo.Payments p WITH (NOLOCK)
      INNER JOIN dbo.Matters m WITH (NOLOCK) ON CAST(m.InstructionRef AS nvarchar(255)) = CAST(p.instruction_ref AS nvarchar(255))
      WHERE p.created_at >= @fromDate
        AND p.created_at < @toDateExclusive
        AND ISNULL(p.amount, 0) > 0
        AND LOWER(LTRIM(RTRIM(COALESCE(p.internal_status, '')))) <> 'archived'
        AND (LOWER(LTRIM(RTRIM(COALESCE(p.payment_status, '')))) IN ('succeeded', 'paid', 'confirmed') OR LOWER(LTRIM(RTRIM(COALESCE(p.internal_status, '')))) IN ('paid', 'confirmed'))
    `);
  });
  return result.recordset || [];
}

async function buildSearchMarketingValueReportData(rangeInput) {
  const range = normaliseSearchMarketingValueReportRange(rangeInput);
  const matterIndex = new Map();
  const [searchEnquiries, searchMatters] = await Promise.all([
    loadSearchEnquiryCounts(range),
    loadSearchMatters(),
  ]);
  const matterRows = searchMatters.map((matter) => {
    const bucket = bucketForSource(matter.source);
    const openDate = matter.OpenDate ? new Date(matter.OpenDate) : null;
    const openedInPeriod = openDate && Number.isFinite(openDate.getTime()) && openDate >= range.from && openDate < range.toExclusive;
    const openedBeforePeriod = openDate && Number.isFinite(openDate.getTime()) && openDate < range.from;
    const row = {
      matterId: String(matter.matterId || '').trim(),
      displayNumber: String(matter.displayNumber || '').trim(),
      instructionRef: String(matter.instructionRef || '').trim(),
      enquiryId: String(matter.enquiryId || '').trim(),
      bucket,
      source: sourceLabelForBucket(bucket),
      openMonth: monthLabel(matter.OpenDate),
      openCohort: openedInPeriod ? 'Opened in period' : openedBeforePeriod ? 'Opened before period' : 'Opened outside period',
      recovered: 0,
      paymentOnAccount: 0,
      wip: 0,
      allocationRows: 0,
      paymentRows: 0,
      wipRows: 0,
    };
    addMatterKey(matterIndex, row.matterId, row);
    addMatterKey(matterIndex, row.displayNumber, row);
    addMatterKey(matterIndex, row.instructionRef, row);
    return row;
  }).filter((row) => row.bucket);

  const [collectedRows, upfrontRows, wipRows] = await Promise.all([
    loadCollectedRows(range),
    loadUpfrontPaymentRows(range),
    loadWipRows(range),
  ]);

  for (const row of collectedRows) {
    const matter = findMatchedMatter(row, matterIndex);
    if (!matter) continue;
    matter.recovered += toNumber(row.payment_allocated);
    matter.allocationRows += 1;
  }
  for (const row of upfrontRows) {
    const matter = findMatchedMatter(row, matterIndex);
    if (!matter) continue;
    matter.paymentOnAccount += toNumber(row.amount);
    matter.paymentRows += 1;
  }
  for (const row of wipRows) {
    const matter = findMatchedMatter(row, matterIndex);
    if (!matter) continue;
    matter.wip += toNumber(row.total);
    matter.wipRows += 1;
  }

  const sortedMatterRows = matterRows
    .map((row) => ({
      ...row,
      recovered: roundMoney(row.recovered),
      paymentOnAccount: roundMoney(row.paymentOnAccount),
      wip: roundMoney(row.wip),
      total: roundMoney(row.recovered + row.paymentOnAccount + row.wip),
    }))
    .filter((row) => row.total !== 0 || row.recovered !== 0 || row.paymentOnAccount !== 0 || row.wip !== 0)
    .sort((left, right) => right.total - left.total || left.source.localeCompare(right.source));

  const matterCohorts = sortedMatterRows.reduce((acc, row) => {
    if (row.openCohort === 'Opened in period') acc.openedInPeriod += 1;
    else if (row.openCohort === 'Opened before period') acc.priorOpen += 1;
    else acc.outsidePeriod += 1;
    return acc;
  }, { openedInPeriod: 0, priorOpen: 0, outsidePeriod: 0 });

  const cohortLabels = ['Opened in period', 'Opened before period', 'Opened outside period'];
  const sourceCohortRows = ['organicSearch', 'paidSearch'].flatMap((bucket) => cohortLabels.map((cohort) => {
    const rows = sortedMatterRows.filter((row) => row.bucket === bucket && row.openCohort === cohort);
    return {
      source: sourceLabelForBucket(bucket),
      cohort,
      matters: rows.length,
      recovered: roundMoney(rows.reduce((sum, row) => sum + row.recovered, 0)),
      paymentOnAccount: roundMoney(rows.reduce((sum, row) => sum + row.paymentOnAccount, 0)),
      wip: roundMoney(rows.reduce((sum, row) => sum + row.wip, 0)),
    };
  })).filter((row) => row.matters > 0).map((row) => ({ ...row, total: roundMoney(row.recovered + row.paymentOnAccount + row.wip) }));

  const summaryRows = ['organicSearch', 'paidSearch'].map((bucket) => {
    const bucketRows = sortedMatterRows.filter((row) => row.bucket === bucket);
    return {
      bucket,
      source: sourceLabelForBucket(bucket),
      matters: bucketRows.length,
      searchEnquiries: searchEnquiries[bucket].total,
      callEnquiries: searchEnquiries[bucket].calls,
      formEnquiries: searchEnquiries[bucket].webforms,
      otherEnquiries: searchEnquiries[bucket].other,
      recovered: roundMoney(bucketRows.reduce((sum, row) => sum + row.recovered, 0)),
      paymentOnAccount: roundMoney(bucketRows.reduce((sum, row) => sum + row.paymentOnAccount, 0)),
      wip: roundMoney(bucketRows.reduce((sum, row) => sum + row.wip, 0)),
    };
  });
  const totalRow = summaryRows.reduce((acc, row) => ({
    bucket: 'totalSearch',
    source: 'Total search',
    matters: acc.matters + row.matters,
    searchEnquiries: acc.searchEnquiries + row.searchEnquiries,
    callEnquiries: acc.callEnquiries + row.callEnquiries,
    formEnquiries: acc.formEnquiries + row.formEnquiries,
    otherEnquiries: acc.otherEnquiries + row.otherEnquiries,
    recovered: roundMoney(acc.recovered + row.recovered),
    paymentOnAccount: roundMoney(acc.paymentOnAccount + row.paymentOnAccount),
    wip: roundMoney(acc.wip + row.wip),
  }), { bucket: 'totalSearch', source: 'Total search', matters: 0, searchEnquiries: 0, callEnquiries: 0, formEnquiries: 0, otherEnquiries: 0, recovered: 0, paymentOnAccount: 0, wip: 0 });

  return {
    range,
    spendAssumption: buildSearchSpendAssumption(range),
    summaryRows: [...summaryRows, totalRow].map((row) => ({ ...row, total: roundMoney(row.recovered + row.paymentOnAccount + row.wip) })),
    matterRows: sortedMatterRows,
    matterCohorts,
    sourceCohortRows,
  };
}

function imageDataUri(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function resolveMarkImageDataUri() {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'appPackage', 'mark192colour.png'),
    path.resolve(__dirname, '..', '..', 'src', 'assets', 'mark192colour.png'),
  ];
  for (const candidate of candidates) {
    const dataUri = imageDataUri(candidate);
    if (dataUri) return dataUri;
  }
  return null;
}

function money(value, decimals = 2) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toNumber(value));
}

function moneyShort(value) {
  const amount = toNumber(value);
  if (Math.abs(amount) >= 100000) return `GBP ${Math.round(amount / 1000)}k`;
  if (Math.abs(amount) >= 1000) return `GBP ${(amount / 1000).toFixed(1)}k`;
  return `GBP ${Math.round(amount)}`;
}

function intText(value) {
  return new Intl.NumberFormat('en-GB').format(toNumber(value));
}

function formatDateShort(value) {
  const date = typeof value === 'string' ? parseReportDate(value, 'date').date : value;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function maskMatterRef(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return '';
  const safe = text.replace(/[^A-Z0-9-]/g, '');
  const hlx = safe.match(/^HLX-(\d{2})\d+-(\d+)$/);
  if (hlx) return `HLX-${hlx[1]}***-${hlx[2].slice(-2)}`;
  if (safe.length <= 8) return `${safe.slice(0, 2)}***`;
  return `${safe.slice(0, 3)}...${safe.slice(-4)}`;
}

function setFill(doc, colour) {
  doc.setFillColor(...colour);
}

function setText(doc, colour) {
  doc.setTextColor(...colour);
}

function setDraw(doc, colour) {
  doc.setDrawColor(...colour);
}

function drawPanel(doc, x, y, width, height, fill = panelFill) {
  setFill(doc, fill);
  setDraw(doc, line);
  doc.setLineWidth(0.5);
  doc.rect(x, y, width, height, 'FD');
}

function drawPageChrome(doc, subtitle, pageNumber, pageCount, markImageDataUri) {
  setFill(doc, pageFill);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
  setFill(doc, websiteBlue);
  doc.rect(0, 0, pageWidth, 8, 'F');
  setFill(doc, highlight);
  doc.rect(0, 8, pageWidth, 2, 'F');

  if (markImageDataUri) doc.addImage(markImageDataUri, 'PNG', margin, 24, 26, 26);
  setText(doc, darkBlue);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('Search marketing internal note', margin + 38, 38);
  setText(doc, muted);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.text(subtitle, margin + 38, 50);

  setDraw(doc, line);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY, pageWidth - margin, footerY);
  setText(doc, muted);
  doc.setFontSize(6.8);
  doc.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - margin, footerY + 11, { align: 'right' });
}

function drawStat(doc, x, y, width, height, label, value, note, colour = navy, fill = panelFill) {
  drawPanel(doc, x, y, width, height, fill);
  setText(doc, muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.text(label.toUpperCase(), x + 8, y + 12);
  setText(doc, colour);
  doc.setFontSize(11.6);
  doc.text(value, x + 8, y + 27);
  if (note) {
    setText(doc, muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.text(note, x + 8, y + height - 7, { maxWidth: width - 16 });
  }
}

function drawKpiGrid(doc, data) {
  const total = data.summaryRows.find((row) => row.bucket === 'totalSearch');
  const totalReceived = total.recovered + total.paymentOnAccount;
  const spend = data.spendAssumption;
  const cardGap = 10;
  const cardWidth = (contentWidth - (cardGap * 3)) / 4;
  const cardHeight = 40;
  const startY = 78;
  const cohortParts = [
    `${intText(data.matterCohorts.openedInPeriod)} in period`,
    `${intText(data.matterCohorts.priorOpen)} earlier`,
  ];
  if (data.matterCohorts.outsidePeriod) cohortParts.push(`${intText(data.matterCohorts.outsidePeriod)} outside`);
  const cards = [
    ['PPC estimate', moneyShort(spend.ppcSpend), 'Pro-rated baseline', red, softAmber],
    ['SEO estimate', moneyShort(spend.seoEstimate), `${moneyShort(spend.seoMonthlyCost)} x ${intText(spend.seoMonthsIncluded)} months`, amber, softAmber],
    ['Est. spend', money(spend.totalEstimatedSearchSpend), 'PPC + SEO estimate', red, softAmber],
    ['Return', `${spend.totalEstimatedSearchSpend > 0 ? (total.total / spend.totalEstimatedSearchSpend).toFixed(2) : '0.00'}x`, 'Against estimated spend', green, softGreen],
    ['Search enquiries', intText(total.searchEnquiries), `Calls ${intText(total.callEnquiries)}, webforms ${intText(total.formEnquiries)}`, navy, softBlue],
    ['Value matters', intText(total.matters), cohortParts.join(', '), navy, panelFill],
    ['Received', money(totalReceived), 'Recovered + payment on account', green, softGreen],
    ['Total value', money(total.total), 'Received + WIP', navy, softBlue],
  ];
  cards.forEach(([label, value, note, colour, fill], index) => {
    const row = Math.floor(index / 4);
    const column = index % 4;
    drawStat(doc, margin + (column * (cardWidth + cardGap)), startY + (row * (cardHeight + 8)), cardWidth, cardHeight, String(label), String(value), String(note), colour, fill);
  });
}

function drawSummaryTable(doc, rows) {
  const x = margin;
  const y = 194;
  const widths = [110, 62, 54, 54, 50, 58, 112, 104, 84, 86];
  const headers = ['Source', 'Enq.', 'Calls', 'Webforms', 'Other', 'Matters', 'Collected / recovered', 'Payment on account', 'WIP', 'Total value'];
  drawPanel(doc, x, y - 20, contentWidth, 96, panelFill);
  setText(doc, darkBlue);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text('SOURCE SUMMARY', x + 10, y - 7);
  setFill(doc, darkBlue);
  doc.rect(x, y + 4, contentWidth, 16, 'F');
  setText(doc, [255, 255, 255]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  let cursor = x;
  headers.forEach((header, index) => {
    const right = index > 0;
    doc.text(header, right ? cursor + widths[index] - 7 : cursor + 7, y + 15, { align: right ? 'right' : 'left' });
    cursor += widths[index];
  });
  rows.forEach((row, index) => {
    const top = y + 20 + (index * 17);
    const isTotal = row.bucket === 'totalSearch';
    setFill(doc, isTotal ? softBlue : index % 2 ? [248, 250, 253] : [255, 255, 255]);
    doc.rect(x, top, contentWidth, 17, 'F');
    setText(doc, isTotal ? darkBlue : ink);
    doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
    doc.setFontSize(7);
    const values = [row.source, intText(row.searchEnquiries), intText(row.callEnquiries), intText(row.formEnquiries), intText(row.otherEnquiries), intText(row.matters), money(row.recovered), money(row.paymentOnAccount), money(row.wip), money(row.total)];
    cursor = x;
    values.forEach((value, valueIndex) => {
      const right = valueIndex > 0;
      doc.text(value, right ? cursor + widths[valueIndex] - 7 : cursor + 7, top + 11, { align: right ? 'right' : 'left' });
      cursor += widths[valueIndex];
    });
  });
}

function drawCohortTable(doc, rows) {
  const x = margin;
  const y = 294;
  const widths = [112, 142, 58, 118, 104, 92, 148];
  const headers = ['Source', 'Open cohort', 'Matters', 'Collected / recovered', 'Payment on account', 'WIP', 'Total value'];
  drawPanel(doc, x, y - 20, contentWidth, 96, panelFill);
  setText(doc, darkBlue);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text('OPENING COHORT SPLIT', x + 10, y - 7);
  setFill(doc, darkBlue);
  doc.rect(x, y + 4, contentWidth, 16, 'F');
  setText(doc, [255, 255, 255]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  let cursor = x;
  headers.forEach((header, index) => {
    const right = index > 0;
    doc.text(header, right ? cursor + widths[index] - 7 : cursor + 7, y + 15, { align: right ? 'right' : 'left' });
    cursor += widths[index];
  });
  rows.slice(0, 4).forEach((row, index) => {
    const top = y + 20 + (index * 13);
    setFill(doc, index % 2 ? [248, 250, 253] : [255, 255, 255]);
    doc.rect(x, top, contentWidth, 13, 'F');
    setText(doc, ink);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.7);
    const values = [row.source, row.cohort, intText(row.matters), money(row.recovered), money(row.paymentOnAccount), money(row.wip), money(row.total)];
    cursor = x;
    values.forEach((value, valueIndex) => {
      const right = valueIndex >= 2;
      doc.setFont('helvetica', valueIndex === 6 ? 'bold' : 'normal');
      doc.text(String(value), right ? cursor + widths[valueIndex] - 7 : cursor + 7, top + 9, { align: right ? 'right' : 'left' });
      cursor += widths[valueIndex];
    });
  });
}

function drawMatterTableHeader(doc, x, y, continuation = false) {
  const widths = [68, 86, 60, 104, 50, 86, 90, 90, 100];
  const headers = ['Source', 'Cohort', 'Enq ID', 'Matter ref', 'Opened', 'Recovered', 'PoA', 'WIP', 'Total'];
  const visibleRows = continuation ? continuationPageMatterRows : firstPageMatterRows;
  const panelHeight = 44 + (visibleRows * matterRowHeight);
  drawPanel(doc, x, y - 20, contentWidth, panelHeight, panelFill);
  setText(doc, darkBlue);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.text(continuation ? 'MATTER BACKING, CONTINUED' : 'MATTER BACKING', x + 10, y - 7);
  setFill(doc, darkBlue);
  doc.rect(x + 10, y + 4, widths.reduce((sum, width) => sum + width, 0), 16, 'F');
  setText(doc, [255, 255, 255]);
  doc.setFontSize(6.4);
  let cursor = x + 10;
  headers.forEach((header, index) => {
    const right = index >= 4;
    doc.text(header, right ? cursor + widths[index] - 6 : cursor + 6, y + 15, { align: right ? 'right' : 'left' });
    cursor += widths[index];
  });
  return { widths, headerHeight: 17 };
}

function drawMatterRows(doc, rows, x, y, maxRows, continuation = false) {
  const { widths, headerHeight } = drawMatterTableHeader(doc, x, y, continuation);
  const visible = rows.slice(0, maxRows);
  visible.forEach((row, index) => {
    const top = y + 4 + headerHeight + (index * matterRowHeight);
    setFill(doc, index % 2 ? [249, 251, 254] : [255, 255, 255]);
    doc.rect(x + 10, top, widths.reduce((sum, width) => sum + width, 0), matterRowHeight, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.9);
    let cursor = x + 10;
    const visibleRef = maskMatterRef(row.displayNumber || row.instructionRef || row.matterId);
    const values = [
      row.bucket === 'paidSearch' ? 'Paid' : 'Organic',
      row.openCohort.replace('Opened ', ''),
      row.enquiryId || '-',
      visibleRef,
      row.openMonth || '-',
      moneyShort(row.recovered),
      moneyShort(row.paymentOnAccount),
      moneyShort(row.wip),
      moneyShort(row.total),
    ];
    values.forEach((value, valueIndex) => {
      const right = valueIndex >= 4;
      setText(doc, valueIndex === 0 ? (row.bucket === 'paidSearch' ? amber : green) : ink);
      doc.setFont('helvetica', valueIndex === 8 ? 'bold' : 'normal');
      doc.text(String(value), right ? cursor + widths[valueIndex] - 6 : cursor + 6, top + 7.2, { align: right ? 'right' : 'left' });
      cursor += widths[valueIndex];
    });
  });
  return visible.length;
}

function drawInternalAssumptions(doc, data, x, y) {
  const spend = data.spendAssumption;
  drawPanel(doc, x, y, contentWidth, 30, softAmber);
  setText(doc, darkBlue);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.text('SPEND + VALUE BASIS', x + 10, y + 12);
  setText(doc, ink);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.text(`PPC estimate ${money(spend.ppcSpend)}. SEO estimate ${money(spend.seoMonthlyCost)} per month for ${intText(spend.seoMonthsIncluded)} selected calendar month(s). Est. investment ${money(spend.totalEstimatedSearchSpend)}.`, x + 98, y + 12);
  setText(doc, muted);
  doc.text(`Value basis: collected/recovered allocations, payment on account, and chargeable WIP dated ${formatDateShort(data.range.from)} to ${formatDateShort(data.range.to)}.`, x + 98, y + 23);
}

function createSearchMarketingValueReportPdf(data) {
  const markImageDataUri = resolveMarkImageDataUri();
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const period = `${formatDateShort(data.range.from)} to ${formatDateShort(data.range.to)}`;
  doc.setProperties({
    title: 'Search Marketing Value Backing Sheet',
    subject: `Search marketing matter-level value backing, ${period}`,
    author: 'Helix Hub',
    creator: 'Helix Hub',
  });

  const subtitle = `${period}. Search-attributed matters with value activity in period; open cohort shown separately.`;
  const remainingRows = data.matterRows.slice(firstPageMatterRows);
  const continuationPages = Math.ceil(remainingRows.length / continuationPageMatterRows);
  const pageCount = 1 + continuationPages;

  drawPageChrome(doc, subtitle, 1, pageCount, markImageDataUri);
  drawKpiGrid(doc, data);
  drawSummaryTable(doc, data.summaryRows);
  drawCohortTable(doc, data.sourceCohortRows);
  drawInternalAssumptions(doc, data, margin, 374);
  drawMatterRows(doc, data.matterRows.slice(0, firstPageMatterRows), margin, 424, firstPageMatterRows, false);

  for (let pageIndex = 0; pageIndex < continuationPages; pageIndex += 1) {
    const pageRows = remainingRows.slice(pageIndex * continuationPageMatterRows, (pageIndex + 1) * continuationPageMatterRows);
    doc.addPage('a4', 'landscape');
    drawPageChrome(doc, subtitle, pageIndex + 2, pageCount, markImageDataUri);
    drawMatterRows(doc, pageRows, margin, 90, continuationPageMatterRows, true);
  }

  return {
    buffer: Buffer.from(doc.output('arraybuffer')),
    pageCount,
    fileName: `search-marketing-value-${data.range.fromDate}-to-${data.range.toDate}.pdf`,
  };
}

module.exports = {
  REPORT_MIN_DATE,
  buildSearchMarketingValueReportData,
  createSearchMarketingValueReportPdf,
  normaliseSearchMarketingValueReportRange,
};