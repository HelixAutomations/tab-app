import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config();

const require = createRequire(import.meta.url);
const {
  REPORT_MIN_DATE,
  buildSearchMarketingValueReportData,
  createSearchMarketingValueReportPdf,
} = require('../server/utils/searchMarketingValueReport.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function readArg(name) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) return '';
  return String(process.argv[index + 1] || '').trim();
}

function todayKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

const from = readArg('from') || REPORT_MIN_DATE;
const to = readArg('to') || todayKey();
const outputPath = readArg('output') || path.join(root, 'exports', `search-marketing-value-${from}-to-${to}.pdf`);

const data = await buildSearchMarketingValueReportData({ from, to });
const pdf = createSearchMarketingValueReportPdf(data);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, pdf.buffer);

console.log(JSON.stringify({
  ok: true,
  outputPath,
  bytes: pdf.buffer.length,
  pages: pdf.pageCount,
  matters: data.matterRows.length,
  range: { from: data.range.fromDate, to: data.range.toDate },
  spend: data.spendAssumption,
  summary: data.summaryRows.map((row) => ({
    source: row.source,
    enquiries: row.searchEnquiries,
    calls: row.callEnquiries,
    webforms: row.formEnquiries,
    otherEnquiries: row.otherEnquiries,
    matters: row.matters,
    recovered: Number(row.recovered.toFixed(2)),
    paymentOnAccount: Number(row.paymentOnAccount.toFixed(2)),
    wip: Number(row.wip.toFixed(2)),
    total: Number(row.total.toFixed(2)),
  })),
  openCohortSplit: data.sourceCohortRows.map((row) => ({
    source: row.source,
    cohort: row.cohort,
    matters: row.matters,
    recovered: Number(row.recovered.toFixed(2)),
    paymentOnAccount: Number(row.paymentOnAccount.toFixed(2)),
    wip: Number(row.wip.toFixed(2)),
    total: Number(row.total.toFixed(2)),
  })),
}, null, 2));