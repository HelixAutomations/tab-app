#!/usr/bin/env node
/**
 * Generic DB lookup tool (Core Data).
 * Usage:
 *   node tools/db/table-lookup.mjs schema <table> [--schema dbo]
 *   node tools/db/table-lookup.mjs record <table> <value> [--column id] [--schema dbo] [--columns col1,col2] [--limit 50] [--like]
 *   node tools/db/table-lookup.mjs range <table> --dateFrom 2026-02-01 --dateTo 2026-02-07 [--dateColumn created_at_date] [--schema dbo] [--columns col1,col2] [--limit 200]
 */

import { config } from 'dotenv';
import sql from 'mssql';
import { createRequire } from 'module';

config();

const require = createRequire(import.meta.url);
const { getSecret } = require('../../server/utils/getSecret.js');

const KEY_VAULT_TIMEOUT_MS = 4000;

const isRedacted = (value) => typeof value === 'string' && value.includes('<REDACTED>');

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    })
  ]);

async function buildConnectionString({ server, database, user, secretName }) {
  const password = await withTimeout(getSecret(secretName), KEY_VAULT_TIMEOUT_MS, `Key Vault lookup for ${secretName}`);
  return `Server=tcp:${server},1433;Initial Catalog=${database};Persist Security Info=False;User ID=${user};Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
}

async function resolveCoreConnectionString() {
  const coreConn = process.env.SQL_CONNECTION_STRING;
  if (coreConn && !isRedacted(coreConn)) return coreConn;

  const server = process.env.SQL_SERVER_FQDN || 'helix-database-server.database.windows.net';
  const database = process.env.SQL_DATABASE_NAME || 'helix-core-data';
  const user = process.env.SQL_USER_NAME || 'helix-database-server';
  const secretName = process.env.SQL_PASSWORD_SECRET_NAME || process.env.SQL_SERVER_PASSWORD_KEY || 'sql-databaseserver-password';

  return buildConnectionString({ server, database, user, secretName });
}

const normaliseKey = (value) => String(value || '').replace(/\s+/g, '').replace(/_/g, '').toLowerCase();

const parseFlags = (argv) => {
  const flags = {};
  const args = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(token);
    }
  }
  return { args, flags };
};

const usage = () => {
  console.log('Usage:');
  console.log('  node tools/db/table-lookup.mjs schema <table> [--schema dbo]');
  console.log('  node tools/db/table-lookup.mjs record <table> <value> [--column id] [--schema dbo] [--columns col1,col2] [--limit 50] [--like]');
  console.log('  node tools/db/table-lookup.mjs range <table> --dateFrom 2026-02-01 --dateTo 2026-02-07 [--dateColumn created_at_date] [--schema dbo] [--columns col1,col2] [--limit 200]');
};

const { args, flags } = parseFlags(process.argv.slice(2));
const mode = args[0];
const table = args[1];
const value = args[2];
const schema = flags.schema || 'dbo';
const limit = Number.parseInt(flags.limit || '50', 10);
const likeMode = Boolean(flags.like);
const columnFlag = flags.column || null;
const columnsFlag = flags.columns || null;
const dateFrom = flags.dateFrom || null;
const dateTo = flags.dateTo || null;
const dateColumnFlag = flags.dateColumn || 'created_at_date';

if (!mode || !table) {
  usage();
  process.exit(1);
}

const columnListFromFlag = columnsFlag
  ? columnsFlag.split(',').map((entry) => entry.trim()).filter(Boolean)
  : null;

const buildColumnMap = (rows) => {
  const map = new Map();
  rows.forEach((row) => {
    const key = normaliseKey(row.COLUMN_NAME);
    if (!map.has(key)) map.set(key, row.COLUMN_NAME);
  });
  return map;
};

const resolveColumn = (map, candidate) => {
  const key = normaliseKey(candidate);
  return map.get(key) || null;
};

try {
  const connectionString = await resolveCoreConnectionString();
  const pool = await sql.connect(connectionString);

  const schemaResult = await pool.request()
    .input('schema', sql.NVarChar, schema)
    .input('table', sql.NVarChar, table)
    .query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
      ORDER BY ORDINAL_POSITION
    `);

  const columns = Array.isArray(schemaResult.recordset) ? schemaResult.recordset : [];

  if (columns.length === 0) {
    console.error(`No columns found for ${schema}.${table}.`);
    await pool.close();
    process.exit(1);
  }

  if (mode === 'schema') {
    console.log(JSON.stringify(columns, null, 2));
    await pool.close();
    process.exit(0);
  }

  if (mode !== 'record' && mode !== 'range') {
    console.error(`Unknown mode: ${mode}`);
    usage();
    await pool.close();
    process.exit(1);
  }

  if (mode === 'record' && !value) {
    console.error('Missing value for record lookup.');
    usage();
    await pool.close();
    process.exit(1);
  }

  if (mode === 'range' && (!dateFrom || !dateTo)) {
    console.error('Missing date range. Provide --dateFrom and --dateTo (YYYY-MM-DD).');
    usage();
    await pool.close();
    process.exit(1);
  }

  const columnMap = buildColumnMap(columns);
  const defaultColumn = resolveColumn(columnMap, columnFlag || 'id') || resolveColumn(columnMap, 'ID');
  const dateColumn = resolveColumn(columnMap, dateColumnFlag);
  if (mode === 'record' && !defaultColumn) {
    console.error('Unable to resolve lookup column. Use --column to specify one.');
    console.error(`Available columns: ${columns.map((col) => col.COLUMN_NAME).join(', ')}`);
    await pool.close();
    process.exit(1);
  }
  if (mode === 'range' && !dateColumn) {
    console.error(`Unable to resolve date column "${dateColumnFlag}". Use --dateColumn to specify one.`);
    console.error(`Available columns: ${columns.map((col) => col.COLUMN_NAME).join(', ')}`);
    await pool.close();
    process.exit(1);
  }

  const selectedColumns = columnListFromFlag
    ? columnListFromFlag.map((col) => resolveColumn(columnMap, col)).filter(Boolean)
    : null;

  if (columnListFromFlag && (!selectedColumns || selectedColumns.length === 0)) {
    console.error('None of the requested --columns exist in this table.');
    console.error(`Available columns: ${columns.map((col) => col.COLUMN_NAME).join(', ')}`);
    await pool.close();
    process.exit(1);
  }

  const selectClause = selectedColumns
    ? selectedColumns.map((col) => `[${col}]`).join(', ')
    : '*';

  if (mode === 'record') {
    const columnMeta = columns.find((col) => normaliseKey(col.COLUMN_NAME) === normaliseKey(defaultColumn));
    const dataType = columnMeta?.DATA_TYPE?.toLowerCase() || 'nvarchar';
    const isNumeric = ['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real'].includes(dataType);

    const paramValue = isNumeric && !Number.isNaN(Number(value)) ? Number(value) : String(value);
    const paramType = isNumeric && typeof paramValue === 'number' ? sql.Numeric : sql.NVarChar;
    const operator = likeMode ? 'LIKE' : '=';
    const valueToUse = likeMode ? `%${paramValue}%` : paramValue;

    const result = await pool.request()
      .input('limit', sql.Int, Number.isNaN(limit) ? 50 : Math.max(1, limit))
      .input('value', paramType, valueToUse)
      .query(`
        SELECT TOP (@limit) ${selectClause}
        FROM [${schema}].[${table}]
        WHERE [${defaultColumn}] ${operator} @value
      `);

    console.log(JSON.stringify(result.recordset || [], null, 2));
    await pool.close();
    process.exit(0);
  }

  const result = await pool.request()
    .input('limit', sql.Int, Number.isNaN(limit) ? 200 : Math.max(1, limit))
    .input('dateFrom', sql.Date, dateFrom)
    .input('dateTo', sql.Date, dateTo)
    .query(`
      SELECT TOP (@limit) ${selectClause}
      FROM [${schema}].[${table}]
      WHERE [${dateColumn}] BETWEEN @dateFrom AND @dateTo
      ORDER BY [${dateColumn}] DESC
    `);

  console.log(JSON.stringify(result.recordset || [], null, 2));
  await pool.close();
} catch (error) {
  console.error(error);
  process.exit(1);
}
