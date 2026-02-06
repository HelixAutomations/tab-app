#!/usr/bin/env node
/*
  Compare collected totals between Clio API and Hub (SQL collectedTime).

  Examples:
    node tools/db/compare-collected.mjs --initials JW --month 2026-01
    node tools/db/compare-collected.mjs --initials JW --from 2026-01-01 --to 2026-01-31 --json
*/

import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { withRequest, getPool } = require('../../server/utils/db');
const { getSecret } = require('../../server/utils/getSecret');

const CLIO_BASE = process.env.CLIO_API_BASE || 'https://eu.app.clio.com/api/v4';
const CLIO_TOKEN_URL = 'https://eu.app.clio.com/oauth/token';
const KEY_VAULT_TIMEOUT_MS = Number(process.env.KEY_VAULT_TIMEOUT_MS || 8000);

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);

function isRedacted(value) {
  return typeof value === 'string' && value.includes('<REDACTED>');
}

async function hydrateSqlConnectionStringFromKeyVault() {
  const server = process.env.SQL_SERVER_FQDN || 'helix-database-server.database.windows.net';
  const database = process.env.SQL_DATABASE_NAME || 'helix-core-data';
  const user = process.env.SQL_USER_NAME || 'helix-database-server';
  const secretName =
    process.env.SQL_PASSWORD_SECRET_NAME ||
    process.env.SQL_SERVER_PASSWORD_KEY ||
    'sql-databaseserver-password';

  const password = await withTimeout(getSecret(secretName), KEY_VAULT_TIMEOUT_MS, `Key Vault lookup for ${secretName}`);
  process.env.SQL_CONNECTION_STRING = `Server=tcp:${server},1433;Initial Catalog=${database};Persist Security Info=False;User ID=${user};Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
}

async function closeSqlPoolIfOpen() {
  const connStr = process.env.SQL_CONNECTION_STRING;
  if (!connStr) return;
  try {
    const pool = await getPool(connStr);
    await pool.close();
  } catch {
    // ignore
  }
}

async function loadExistingEnv() {
  const root = process.cwd();
  const candidates = [
    'env/.env.local.user',
    'env/.env.local',
    'env/.env.dev.user',
    'env/.env.dev',
    '.env',
  ];

  let dotenv;
  try {
    dotenv = await import('dotenv');
  } catch {
    return;
  }

  for (const rel of candidates) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    dotenv.config({ path: abs });
  }
}

function parseArgs(argv) {
  const args = {
    initials: null,
    month: null,
    from: null,
    to: null,
    json: false,
    sqlOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--initials') args.initials = String(argv[i + 1] || '').trim();
    else if (a === '--month') args.month = String(argv[i + 1] || '').trim();
    else if (a === '--from') args.from = String(argv[i + 1] || '').trim();
    else if (a === '--to') args.to = String(argv[i + 1] || '').trim();
    else if (a === '--json') args.json = true;
    else if (a === '--sql-only') args.sqlOnly = true;
  }

  return args;
}

function isIsoDateOnly(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isIsoMonth(s) {
  return /^\d{4}-\d{2}$/.test(s);
}

function formatIsoZ(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function getRange({ month, from, to }) {
  if (from && to) {
    if (!isIsoDateOnly(from) || !isIsoDateOnly(to)) {
      throw new Error('--from/--to must be YYYY-MM-DD');
    }
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59`);
    return { start, end, label: `${from}..${to}` };
  }

  if (month) {
    if (!isIsoMonth(month)) throw new Error('--month must be YYYY-MM');
    const [y, m] = month.split('-').map(Number);
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    return { start, end, label: month };
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const label = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  return { start, end, label };
}

function safeNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

const tokenCache = new Map();

async function getClioAccessToken(initials) {
  const key = String(initials || '').trim().toLowerCase();
  if (!key) throw new Error('Missing initials');

  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const [clientId, clientSecret, refreshToken] = await Promise.all([
    withTimeout(getSecret(`${key}-clio-v1-clientid`), KEY_VAULT_TIMEOUT_MS, `Key Vault lookup for ${key}-clio-v1-clientid`),
    withTimeout(getSecret(`${key}-clio-v1-clientsecret`), KEY_VAULT_TIMEOUT_MS, `Key Vault lookup for ${key}-clio-v1-clientsecret`),
    withTimeout(getSecret(`${key}-clio-v1-refreshtoken`), KEY_VAULT_TIMEOUT_MS, `Key Vault lookup for ${key}-clio-v1-refreshtoken`),
  ]);

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const fetchImpl = globalThis.fetch || (await import('node-fetch')).default;
  const resp = await fetchImpl(`${CLIO_TOKEN_URL}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Failed to refresh Clio token for ${key}: ${errorText}`);
  }

  const tokenData = await resp.json();
  const accessToken = tokenData.access_token;
  const expiresIn = safeNumber(tokenData.expires_in || 3600) * 1000;
  tokenCache.set(key, { token: accessToken, expiresAt: Date.now() + expiresIn - 60 * 1000 });
  return accessToken;
}

async function fetchClioBillPayments({ initials, start, end }) {
  const accessToken = await getClioAccessToken(initials);
  const fetchImpl = globalThis.fetch || (await import('node-fetch')).default;

  const params = new URLSearchParams({
    created_since: formatIsoZ(start),
    created_before: formatIsoZ(end),
    fields: 'id,amount,date,created_at,updated_at,reference,source,type,user',
    limit: '200',
    offset: '0',
  });

  const endpoints = [
    `${CLIO_BASE}/bill_payments.json`,
    `${CLIO_BASE}/payments.json`,
  ];

  let lastError = null;

  for (const baseUrl of endpoints) {
    let offset = 0;
    const all = [];

    while (true) {
      params.set('offset', String(offset));
      const url = `${baseUrl}?${params.toString()}`;
      const resp = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        if (resp.status === 404) {
          lastError = new Error(`Clio payments endpoint not found: ${baseUrl}`);
          break;
        }
        throw new Error(`Clio payments fetch failed (${resp.status}): ${errorText}`);
      }

      const payload = await resp.json();
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      all.push(...rows);

      const next = payload?.meta?.paging?.next;
      if (!next || rows.length < 200) break;
      offset += 200;
    }

    if (all.length > 0) return { rows: all, endpoint: baseUrl };
  }

  if (lastError) throw lastError;
  return { rows: [], endpoint: endpoints[0] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const initials = String(args.initials || '').trim().toUpperCase();
  if (!initials) {
    console.error('Missing --initials');
    process.exit(1);
  }

  await loadExistingEnv();
  if (!process.env.SQL_CONNECTION_STRING || isRedacted(process.env.SQL_CONNECTION_STRING)) {
    await hydrateSqlConnectionStringFromKeyVault();
  }

  const range = getRange({ month: args.month, from: args.from, to: args.to });

  const sqlTotals = await withRequest(process.env.SQL_CONNECTION_STRING, async (request, sql) => {
    request.input('initials', sql.NVarChar, initials);
    const member = await request.query(`
      SELECT TOP 1 [Clio ID] as clioId, [Full Name] as fullName
      FROM [dbo].[team]
      WHERE [Initials] = @initials
    `);
    const clioId = Number(member?.recordset?.[0]?.clioId || 0);
    const fullName = member?.recordset?.[0]?.fullName || initials;

    request.input('userId', sql.Int, clioId);
    request.input('startDate', sql.Date, range.start);
    request.input('endDate', sql.Date, range.end);

    const totals = await request.query(`
      SELECT SUM(payment_allocated) as total
      FROM [dbo].[collectedTime]
      WHERE user_id = @userId
        AND payment_date BETWEEN @startDate AND @endDate
        AND (kind IS NULL OR kind NOT IN ('Expense', 'Product'))
    `);

    return {
      clioId,
      fullName,
      hubTotal: Number(totals?.recordset?.[0]?.total || 0),
    };
  });

  let clioTotal = null;
  let clioCount = null;
  let clioEndpoint = null;
  if (!args.sqlOnly) {
    const clioResult = await fetchClioBillPayments({ initials, start: range.start, end: range.end });
    const clioPayments = Array.isArray(clioResult?.rows) ? clioResult.rows : clioResult;
    clioEndpoint = clioResult?.endpoint || null;
    clioCount = clioPayments.length;
    clioTotal = clioPayments.reduce((sum, row) => {
      const amount = row?.amount ?? row?.total ?? row?.payment_amount;
      return sum + safeNumber(amount);
    }, 0);
  }

  const payload = {
    range: {
      label: range.label,
      from: range.start.toISOString(),
      to: range.end.toISOString(),
    },
    initials,
    clioId: sqlTotals.clioId,
    fullName: sqlTotals.fullName,
    hubTotal: sqlTotals.hubTotal,
    clioTotal,
    clioCount,
    clioEndpoint,
    sqlOnly: args.sqlOnly,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('Collected comparison');
    console.log(`Range: ${payload.range.label}`);
    console.log(`Member: ${payload.fullName} (${payload.initials}, Clio ID ${payload.clioId})`);
    console.log(`Hub total (SQL collectedTime): £${payload.hubTotal.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`);
    if (payload.sqlOnly) {
      console.log('Clio total: skipped (--sql-only)');
    } else {
      const endpointLabel = payload.clioEndpoint ? ` (${payload.clioEndpoint})` : '';
      console.log(`Clio total: £${payload.clioTotal.toLocaleString('en-GB', { maximumFractionDigits: 2 })} (${payload.clioCount} payments)${endpointLabel}`);
    }
  }

  await closeSqlPoolIfOpen();
}

main().catch(async (error) => {
  console.error(error);
  await closeSqlPoolIfOpen();
  process.exit(1);
});
