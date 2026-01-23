#!/usr/bin/env node
/**
 * Export top 20 highest-value Commercial/Property matters (last N months) as CSV.
 *
 * Produces 4 CSVs:
 *  - Commercial: top by opening value (Approx. Value)
 *  - Commercial: top by invoiced (net) in last N months
 *  - Property:   top by opening value (Approx. Value)
 *  - Property:   top by invoiced (net) in last N months
 *
 * Usage:
 *   node scripts/exportTopValueFiles.mjs
 *   node scripts/exportTopValueFiles.mjs --months=12 --limit=20 --out=./exports
 */

import { config } from 'dotenv';
import sql from 'mssql';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

config();

function parseArgs(argv) {
  const out = {
    months: 12,
    limit: 20,
    outDir: './exports',
    includeDisbursements: false,
  };

  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, rawValue] = arg.slice(2).split('=');
    if (!key) continue;

    if (key === 'months') {
      const n = Number.parseInt(rawValue ?? '', 10);
      if (Number.isFinite(n) && n > 0) out.months = n;
    }

    if (key === 'limit') {
      const n = Number.parseInt(rawValue ?? '', 10);
      if (Number.isFinite(n) && n > 0) out.limit = n;
    }

    if (key === 'out') {
      if (rawValue && rawValue.trim()) out.outDir = rawValue.trim();
    }

    if (key === 'includeDisbursements') {
      const v = String(rawValue ?? '').trim().toLowerCase();
      out.includeDisbursements = v === '1' || v === 'true' || v === 'yes';
    }
  }

  return out;
}

function formatDateOnly(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function toStartDate(months) {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - months);
  start.setHours(0, 0, 0, 0);
  return start;
}

function normalisePracticeArea(input) {
  if (!input) return '';
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');
}

function parseApproxValueToNumber(raw) {
  if (raw == null) return null;
  const s = String(raw)
    .toLowerCase()
    .replace(/£/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-')
    .trim();

  if (!s) return null;

  const parts = s.split(/-|to/).map(p => p.trim()).filter(Boolean);
  const candidates = [];

  for (const part of parts) {
    const m = part.match(/(\d+(?:\.\d+)?)(k|m)?/);
    if (!m) continue;

    let value = Number.parseFloat(m[1]);
    if (!Number.isFinite(value)) continue;

    const suffix = m[2];
    if (suffix === 'k') value *= 1_000;
    if (suffix === 'm') value *= 1_000_000;

    candidates.push(value);
  }

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[\",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows, columns) {
  const header = columns.map(c => escapeCsv(c.header)).join(',');
  const lines = rows.map((row) => columns.map(c => escapeCsv(c.get(row))).join(','));
  return [header, ...lines].join('\n') + '\n';
}

const PRACTICE_AREAS_BY_GROUP = {
  commercial: [
    'Commercial',
    'Director Rights & Dispute Advice',
    'Shareholder Rights & Dispute Advice',
    'Civil/Commercial Fraud Advice',
    'Partnership Advice',
    'Business Contract Dispute',
    'Unpaid Loan Recovery',
    'Contentious Probate',
    'Statutory Demand - Drafting',
    'Statutory Demand - Advising',
    'Winding Up Petition Advice',
    'Bankruptcy Petition Advice',
    'Injunction Advice',
    'Intellectual Property',
    'Professional Negligence',
    'Unpaid Invoice/Debt Dispute',
    'Commercial Contract - Drafting',
    'Company Restoration',
    'Small Claim Advice',
    'Trust Advice',
    'Terms and Conditions - Drafting',
  ],
  property: [
    'Landlord & Tenant – Commercial Dispute',
    'Landlord & Tenant – Residential Dispute',
    'Boundary and Nuisance Advice',
    'Trust of Land (Tolata) Advice',
    'Service Charge Recovery & Dispute Advice',
    'Breach of Lease Advice',
    'Terminal Dilapidations Advice',
    'Investment Sale and Ownership – Advice',
    'Trespass',
    'Right of Way',
  ],
};

const NORMALISED_GROUPS = {
  commercial: new Set(PRACTICE_AREAS_BY_GROUP.commercial.map(normalisePracticeArea)),
  property: new Set(PRACTICE_AREAS_BY_GROUP.property.map(normalisePracticeArea)),
};

function classifyGroup(practiceArea) {
  const p = normalisePracticeArea(practiceArea);
  if (NORMALISED_GROUPS.commercial.has(p)) return 'commercial';
  if (NORMALISED_GROUPS.property.has(p)) return 'property';
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    console.error('❌ Missing SQL_CONNECTION_STRING in environment');
    process.exit(1);
  }

  const now = new Date();
  const dateFrom = toStartDate(args.months);
  const dateTo = now;

  console.log(`[top-files] Window: ${formatDateOnly(dateFrom)} → ${formatDateOnly(dateTo)}`);
  console.log(`[top-files] Invoiced basis: collectedTime.sub_total (${args.includeDisbursements ? 'Service + Expense' : 'Service only'})`);

  const outDirAbs = resolve(process.cwd(), args.outDir);
  mkdirSync(outDirAbs, { recursive: true });

  const pool = await sql.connect(connectionString);
  try {
    // 1) Load matters opened in the window
    const mattersResult = await pool.request()
      .input('openFrom', sql.Date, formatDateOnly(dateFrom))
      .input('openTo', sql.Date, formatDateOnly(dateTo))
      .query(`
        SELECT
          [Unique ID] AS matter_id,
          [Display Number] AS display_number,
          [Practice Area] AS practice_area,
          [Approx. Value] AS approx_value,
          [Open Date] AS open_date,
          [Status] AS status,
          [Responsible Solicitor] AS responsible_solicitor,
          [Originating Solicitor] AS originating_solicitor
        FROM matters WITH (NOLOCK)
        WHERE [Open Date] IS NOT NULL
          AND CAST([Open Date] AS DATE) BETWEEN @openFrom AND @openTo
          AND ([Status] IS NULL OR [Status] <> 'MatterRequest')
      `);

    const matters = Array.isArray(mattersResult.recordset) ? mattersResult.recordset : [];
    console.log(`[top-files] Matters opened in window: ${matters.length}`);

    // 2) Aggregate invoiced totals (net and gross) by matter_id for the window
    // NOTE: collectedTime includes Service and Expense line items. By default we exclude disbursements (Expense).
    const invoicesResult = await pool.request()
      .input('invFrom', sql.DateTime2, dateFrom)
      .input('invTo', sql.DateTime2, dateTo)
      .input('openFrom', sql.Date, formatDateOnly(dateFrom))
      .input('openTo', sql.Date, formatDateOnly(dateTo))
      .input('includeDisbursements', sql.Bit, args.includeDisbursements ? 1 : 0)
      .query(`
        SELECT
          ct.matter_id,
          SUM(ISNULL(ct.sub_total, 0)) AS invoiced_net,
          SUM(ISNULL(ct.sub_total, 0) + ISNULL(ct.tax, 0) + ISNULL(ct.secondary_tax, 0)) AS invoiced_gross
        FROM [dbo].[collectedTime] ct WITH (NOLOCK)
        JOIN matters m WITH (NOLOCK)
          ON CAST(ct.matter_id AS VARCHAR(255)) = CAST(m.[Unique ID] AS VARCHAR(255))
        WHERE ct.created_at BETWEEN @invFrom AND @invTo
          AND ct.kind IN ('Service', 'Expense')
          AND (@includeDisbursements = 1 OR ct.kind = 'Service')
          AND m.[Open Date] IS NOT NULL
          AND CAST(m.[Open Date] AS DATE) BETWEEN @openFrom AND @openTo
        GROUP BY ct.matter_id
      `);

    const invoiceByMatterId = new Map();
    for (const row of (invoicesResult.recordset || [])) {
      const key = row?.matter_id != null ? String(row.matter_id) : null;
      if (!key) continue;
      invoiceByMatterId.set(key, {
        invoicedNet12m: Number(row.invoiced_net) || 0,
        invoicedGross12m: Number(row.invoiced_gross) || 0,
      });
    }

    const enriched = matters
      .map((m) => {
        const matterId = m?.matter_id != null ? String(m.matter_id) : '';
        const approxValueRaw = m?.approx_value != null ? String(m.approx_value) : '';
        const approxValueNum = parseApproxValueToNumber(approxValueRaw);

        const inv = invoiceByMatterId.get(matterId) || { invoicedNet12m: 0, invoicedGross12m: 0 };

        const clioIdNumeric = /^[0-9]+$/.test(matterId) ? matterId : '';
        const clioLink = clioIdNumeric ? `https://eu.app.clio.com/nc/#/matters/${clioIdNumeric}` : '';

        const group = classifyGroup(m.practice_area);

        return {
          group,
          matterId,
          displayNumber: m.display_number || '',
          practiceArea: m.practice_area || '',
          openDate: m.open_date ? new Date(m.open_date).toISOString().slice(0, 10) : '',
          responsibleSolicitor: m.responsible_solicitor || '',
          originatingSolicitor: m.originating_solicitor || '',
          approxValueRaw,
          approxValueNum: approxValueNum ?? '',
          invoicedNet12m: inv.invoicedNet12m,
          invoicedGross12m: inv.invoicedGross12m,
          clioLink,
        };
      })
      .filter((m) => m.group === 'commercial' || m.group === 'property');

    console.log(`[top-files] Categorised matters: ${enriched.length}`);

    function topN(group, sortKey) {
      const rows = enriched.filter(r => r.group === group);

      const sorted = rows
        .slice()
        .sort((a, b) => {
          const av = (sortKey === 'opening')
            ? (typeof a.approxValueNum === 'number' ? a.approxValueNum : -Infinity)
            : (a.invoicedNet12m ?? 0);
          const bv = (sortKey === 'opening')
            ? (typeof b.approxValueNum === 'number' ? b.approxValueNum : -Infinity)
            : (b.invoicedNet12m ?? 0);
          return bv - av;
        })
        .slice(0, args.limit);

      return sorted;
    }

    const today = formatDateOnly(now);

    const columns = [
      { header: 'group', get: r => r.group },
      { header: 'practice_area', get: r => r.practiceArea },
      { header: 'display_number', get: r => r.displayNumber },
      { header: 'matter_id', get: r => r.matterId },
      { header: 'clio_link', get: r => r.clioLink },
      { header: 'open_date', get: r => r.openDate },
      { header: 'fee_earner_with_conduct', get: r => r.responsibleSolicitor },
      { header: 'originating_solicitor', get: r => r.originatingSolicitor },
      { header: 'opening_value_raw', get: r => r.approxValueRaw },
      { header: 'opening_value_number', get: r => r.approxValueNum },
      { header: 'invoiced_kind_filter', get: () => (args.includeDisbursements ? 'Service+Expense' : 'Service') },
      { header: 'invoiced_net_last_12m', get: r => r.invoicedNet12m },
      { header: 'invoiced_gross_last_12m', get: r => r.invoicedGross12m },
    ];

    const outputs = [
      { group: 'commercial', sort: 'opening' },
      { group: 'commercial', sort: 'invoiced' },
      { group: 'property', sort: 'opening' },
      { group: 'property', sort: 'invoiced' },
    ];

    const disbSuffix = args.includeDisbursements ? '-incl-disb' : '';

    for (const out of outputs) {
      const rows = topN(out.group, out.sort);
      const csv = toCsv(rows, columns);

      const fileName = `top-${args.limit}-${out.group}-by-${out.sort}${disbSuffix}-${today}.csv`;
      const outPath = resolve(outDirAbs, fileName);
      writeFileSync(outPath, csv, 'utf8');
      console.log(`[top-files] Wrote ${rows.length} rows -> ${outPath}`);
    }

    console.log('[top-files] Done');
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error('❌ exportTopValueFiles failed:', err?.message || err);
  process.exit(1);
});
