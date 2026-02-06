#!/usr/bin/env node
/**
 * INSTANT DATABASE LOOKUPS
 * Usage: node tools/instant-lookup.mjs [type] [value]
 * Types: passcode, enquiry, deal, instruction, prospect, person, pipeline, ops
 */

import { config } from 'dotenv';
import sql from 'mssql';
import { createRequire } from 'module';

config();

const require = createRequire(import.meta.url);
const { getSecret } = require('../server/utils/getSecret.js');

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

async function resolveInstructionsConnectionString() {
  const instructionsConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (instructionsConn && !isRedacted(instructionsConn)) return instructionsConn;

  const server = process.env.INSTRUCTIONS_SQL_SERVER || 'instructions.database.windows.net';
  const database = process.env.INSTRUCTIONS_SQL_DATABASE || 'instructions';
  const user = process.env.INSTRUCTIONS_SQL_USER || 'instructionsadmin';
  const secretName = process.env.INSTRUCTIONS_SQL_PASSWORD_SECRET_NAME || 'instructions-sql-password';

  return buildConnectionString({ server, database, user, secretName });
}

const PIPELINE_ALIASES = new Set(['pipeline', 'journey', 'chain']);
const OPS_ALIASES = new Set(['ops', 'operation', 'operations', 'dataops', 'data-ops', 'dataopslog', 'data-ops-log']);
const LONDON_TZ = 'Europe/London';
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ALLOWED_TYPES = new Set(['passcode', 'enquiry', 'deal', 'instruction', 'prospect', 'person', 'pipeline', 'ops']);

/**
 * Generate Teams deep link to a specific message/card.
 * Uses TeamsMessageId (epoch ms timestamp) as that's what Teams deep links require
 * per MS docs: https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/build-and-test/deep-link-teams
 */
const generateTeamsDeepLink = (channelId, activityId, teamId, teamsMessageId, createdAtMs) => {
  const tenantId = '7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';

  if (!channelId || !teamId) {
    return null;
  }

  // Teams deep links use epoch millisecond timestamps as messageId
  // Try TeamsMessageId first, then CreatedAtMs as fallback
  let messageId;
  if (teamsMessageId && Number(teamsMessageId) > 1640995200000) {
    messageId = teamsMessageId;
  } else if (createdAtMs && Number(createdAtMs) > 1640995200000) {
    messageId = createdAtMs;
  }

  if (!messageId) return null;

  const encChannel = encodeURIComponent(channelId);
  const encGroup = encodeURIComponent(teamId);
  const msgToken = encodeURIComponent(String(messageId));

  // Determine channel name from channelId
  let channelName = 'General';
  if (channelId.includes('09c0d3669cd2464aab7db60520dd9180')) channelName = 'Commercial New Enquiries';
  else if (channelId.includes('2ba7d5a50540426da60196c3b2daf8e8')) channelName = 'Construction New Enquiries';
  else if (channelId.includes('6d09477d15d548a6b56f88c59b674da6')) channelName = 'Property New Enquiries';

  return `https://teams.microsoft.com/l/message/${encChannel}/${msgToken}?tenantId=${tenantId}&groupId=${encGroup}&parentMessageId=${msgToken}&teamName=${encodeURIComponent('Helix Law')}&channelName=${encodeURIComponent(channelName)}&createdTime=${messageId}`;
};

const isEmail = (value) => /@/.test(String(value || '').trim());
const isNumeric = (value) => /^\d+$/.test(String(value || '').trim());
const isLikelyName = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (isEmail(raw) || isNumeric(raw)) return false;
  if (/^HLX-?\d+-\d+$/i.test(raw)) return false;
  return /[A-Za-z]/.test(raw);
};

const getLondonDateParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(date);
  const values = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });
  const weekdayIndex = WEEKDAY_LABELS.indexOf(values.weekday);
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekdayIndex: weekdayIndex === -1 ? 0 : weekdayIndex,
  };
};

const getTimeZoneOffsetMinutes = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const values = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return (asUtc - date.getTime()) / 60000;
};

const toLondonDate = (year, month, day, hour = 0, minute = 0, second = 0, ms = 0) => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, LONDON_TZ);
  return new Date(utcGuess.getTime() - offsetMinutes * 60000);
};

const addDaysToYmd = (ymd, deltaDays) => {
  const base = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  };
};

const buildOpsRangeFromPhrase = (phrase) => {
  const input = String(phrase || '').trim().toLowerCase();
  const todayParts = getLondonDateParts();
  const todayYmd = { year: todayParts.year, month: todayParts.month, day: todayParts.day };

  const thisWeekStart = addDaysToYmd(todayYmd, -todayParts.weekdayIndex);
  const thisWeekEnd = addDaysToYmd(thisWeekStart, 6);

  let label = 'this week';
  let startYmd = thisWeekStart;
  let endYmd = thisWeekEnd;

  if (input.includes('yesterday')) {
    label = 'yesterday';
    startYmd = addDaysToYmd(todayYmd, -1);
    endYmd = startYmd;
  } else if (input.includes('today')) {
    label = 'today';
    startYmd = todayYmd;
    endYmd = todayYmd;
  } else if (input.includes('last week') || input.includes('previous week')) {
    label = 'last week';
    startYmd = addDaysToYmd(thisWeekStart, -7);
    endYmd = addDaysToYmd(thisWeekStart, -1);
  } else if (
    input.includes('last 7 days') ||
    input.includes('past 7 days') ||
    input.includes('rolling 7') ||
    input.includes('7 days')
  ) {
    label = 'last 7 days';
    startYmd = addDaysToYmd(todayYmd, -6);
    endYmd = todayYmd;
  } else if (input.includes('this week') || input.includes('current week') || input.includes('week')) {
    label = 'this week';
    startYmd = thisWeekStart;
    endYmd = thisWeekEnd;
  }

  const startDate = toLondonDate(startYmd.year, startYmd.month, startYmd.day, 0, 0, 0, 0);
  const endDate = toLondonDate(endYmd.year, endYmd.month, endYmd.day, 23, 59, 59, 999);

  return { label, startDate, endDate };
};

const parseInstructionRef = (raw) => {
  const input = String(raw || '').trim();
  if (!input) return null;
  const match = input.match(/^(?:[A-Z]+-?)?(\d+)-(\d+)$/i);
  if (!match) return null;
  const prospectId = match[1];
  const passcode = match[2];
  const hasPrefix = /^[A-Z]+-\d+-\d+$/i.test(input);
  const normalised = hasPrefix ? input.toUpperCase() : `HLX-${prospectId}-${passcode}`;
  return {
    instructionRef: normalised,
    prospectId,
    passcode,
  };
};

const normaliseColumnKey = (value) => String(value || '').replace(/[\s_]/g, '').toLowerCase();

const getTableColumns = async (pool, tableName, schema = 'dbo') => {
  try {
    const result = await pool.request()
      .input('schema', sql.NVarChar, schema)
      .input('table', sql.NVarChar, tableName)
      .query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
      `);
    const list = result.recordset.map((row) => row.COLUMN_NAME).filter(Boolean);
    const map = new Map();
    list.forEach((name) => {
      const key = normaliseColumnKey(name);
      if (!map.has(key)) map.set(key, name);
    });
    return { list, map };
  } catch {
    return { list: [], map: new Map() };
  }
};

const resolveColumn = (columns, candidates) => {
  for (const candidate of candidates) {
    const key = normaliseColumnKey(candidate);
    const found = columns.map.get(key);
    if (found) return found;
  }
  return null;
};

const buildFlexibleEnquiryWhere = (columns, { input, like }) => {
  const clauses = [];
  const params = [];

  const addClause = (column, operator, paramName, value, type = sql.VarChar) => {
    clauses.push(`[${column}] ${operator} @${paramName}`);
    params.push({ name: paramName, type, value });
  };

  const candidates = {
    first: ['First_Name', 'FirstName', 'first', 'forename', 'Forename'],
    last: ['Last_Name', 'LastName', 'last', 'surname', 'Surname'],
    full: ['FullName', 'Full_Name', 'Name', 'name', 'ClientName', 'clientName'],
    email: ['Email', 'email', 'ClientEmail', 'clientEmail'],
    phone: ['Phone_Number', 'phone_number', 'Phone', 'phone', 'Telephone', 'telephone', 'Mobile', 'mobile'],
    id: ['ID', 'id'],
  };

  const splitName = String(input || '').trim().split(/\s+/).filter(Boolean);
  const token = splitName[0] || '';
  const firstName = token;
  // If the user provided a single token (e.g. "Bedwell"), treat it as either
  // first or last name so last-name-only searches work.
  const lastName = splitName.length > 1 ? splitName.slice(1).join(' ') : token;

  const addFirstLast = () => {
    const firstCol = resolveColumn(columns, candidates.first);
    const lastCol = resolveColumn(columns, candidates.last);
    const fullCol = resolveColumn(columns, candidates.full);

    if (fullCol) addClause(fullCol, 'LIKE', 'fullLike', like);
    if (firstCol && firstName) addClause(firstCol, 'LIKE', 'firstLike', `%${firstName}%`);
    if (lastCol && lastName) addClause(lastCol, 'LIKE', 'lastLike', `%${lastName}%`);

    if (firstCol && lastCol && splitName.length > 1) {
      clauses.push(`([${firstCol}] + ' ' + [${lastCol}]) LIKE @fullNameLike`);
      params.push({ name: 'fullNameLike', type: sql.VarChar, value: like });
      clauses.push(`([${lastCol}] + ' ' + [${firstCol}]) LIKE @fullNameAltLike`);
      params.push({ name: 'fullNameAltLike', type: sql.VarChar, value: like });
    }
  };

  if (isEmail(input)) {
    const emailCol = resolveColumn(columns, candidates.email);
    if (emailCol) addClause(emailCol, 'LIKE', 'emailLike', like);
  } else if (isNumeric(input)) {
    const idCol = resolveColumn(columns, candidates.id);
    if (idCol) addClause(idCol, '=', 'idExact', Number.parseInt(input, 10), sql.Int);
  } else {
    addFirstLast();
    const emailCol = resolveColumn(columns, candidates.email);
    if (emailCol) addClause(emailCol, 'LIKE', 'emailLike', like);
    const phoneCol = resolveColumn(columns, candidates.phone);
    if (phoneCol) addClause(phoneCol, 'LIKE', 'phoneLike', like);
  }

  if (clauses.length === 0) return null;
  return { where: clauses.join(' OR '), params };
};

const buildStrictFullNameWhere = (columns, { input, like }) => {
  const clauses = [];
  const params = [];

  const splitName = String(input || '').trim().split(/\s+/).filter(Boolean);
  if (splitName.length < 2) return null;
  const firstName = splitName[0];
  const lastName = splitName.slice(1).join(' ');

  const fullCol = resolveColumn(columns, ['FullName', 'Full_Name', 'Name', 'name', 'ClientName', 'clientName']);
  const firstCol = resolveColumn(columns, ['First_Name', 'FirstName', 'first', 'forename', 'Forename']);
  const lastCol = resolveColumn(columns, ['Last_Name', 'LastName', 'last', 'surname', 'Surname']);

  if (fullCol) {
    clauses.push(`[${fullCol}] LIKE @fullLike`);
    params.push({ name: 'fullLike', type: sql.VarChar, value: like });
  }

  if (firstCol && lastCol) {
    clauses.push(`([${firstCol}] LIKE @firstStrict AND [${lastCol}] LIKE @lastStrict)`);
    params.push({ name: 'firstStrict', type: sql.VarChar, value: `%${firstName}%` });
    params.push({ name: 'lastStrict', type: sql.VarChar, value: `%${lastName}%` });
    clauses.push(`([${firstCol}] + ' ' + [${lastCol}]) LIKE @fullNameStrict`);
    params.push({ name: 'fullNameStrict', type: sql.VarChar, value: like });
    clauses.push(`([${lastCol}] + ' ' + [${firstCol}]) LIKE @fullNameStrictAlt`);
    params.push({ name: 'fullNameStrictAlt', type: sql.VarChar, value: like });
  }

  if (clauses.length === 0) return null;
  return { where: clauses.join(' OR '), params };
};

const pickOrderBy = (columns, candidates) => {
  for (const candidate of candidates) {
    const resolved = resolveColumn(columns, [candidate]);
    if (resolved) return resolved;
  }
  return null;
};

const buildInClauseForColumns = (columns, values, request, columnCandidates, paramPrefix, sqlType = sql.VarChar) => {
  const clauses = [];
  let groupIndex = 0;
  for (const column of columnCandidates) {
    const resolved = resolveColumn(columns, [column]);
    if (!resolved) continue;
    const names = values.map((_, idx) => `${paramPrefix}${groupIndex}_${idx}`);
    names.forEach((name, idx) => request.input(name, sqlType, values[idx]));
    clauses.push(`[${resolved}] IN (${names.map((name) => `@${name}`).join(',')})`);
    groupIndex += 1;
  }
  if (clauses.length === 0) return null;
  return clauses.join(' OR ');
};

const normaliseNameValue = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const buildRecordFullName = (record) => {
  const raw =
    record?.FullName ||
    record?.full_name ||
    record?.fullName ||
    record?.Name ||
    record?.name ||
    record?.ClientName ||
    record?.clientName ||
    null;
  if (raw) return normaliseNameValue(raw);

  const first =
    record?.First_Name ||
    record?.first_name ||
    record?.FirstName ||
    record?.first ||
    record?.Forename ||
    record?.forename ||
    '';
  const last =
    record?.Last_Name ||
    record?.last_name ||
    record?.LastName ||
    record?.last ||
    record?.Surname ||
    record?.surname ||
    '';
  const combined = `${first} ${last}`.trim();
  return normaliseNameValue(combined);
};

const applyInParams = (request, values, prefix, sqlType) => {
  const paramNames = values.map((_, idx) => `${prefix}${idx}`);
  paramNames.forEach((name, idx) => request.input(name, sqlType, values[idx]));
  return paramNames.map((name) => `@${name}`).join(',');
};

const args = process.argv.slice(2);
const confirmIndex = args.findIndex((arg) => arg === '--confirm' || arg === '-c');
const confirmFirst = confirmIndex !== -1;
if (confirmFirst) args.splice(confirmIndex, 1);

const planIndex = args.findIndex((arg) => arg === '--plan' || arg === '--dry');
const planOnly = planIndex !== -1;
if (planOnly) args.splice(planIndex, 1);

const parseLookupArgs = (rawArgs) => {
  const phrase = rawArgs.join(' ').trim();
  const first = rawArgs[0]?.toLowerCase();

  if (!first) return { type: null, value: null, phrase };
  if (PIPELINE_ALIASES.has(first)) return { type: first, value: rawArgs.slice(1).join(' '), phrase };
  if (OPS_ALIASES.has(first)) return { type: 'ops', value: rawArgs.slice(1).join(' '), phrase };
  if (ALLOWED_TYPES.has(first)) return { type: first, value: rawArgs.slice(1).join(' '), phrase };

  if (/(^|\b)(operations?|ops)(\b|$)/i.test(phrase)) {
    return { type: 'ops', value: phrase, phrase };
  }

  return { type: first, value: rawArgs.slice(1).join(' '), phrase };
};

const { type, value, phrase } = parseLookupArgs(args);

if (!type || (!value && type !== 'ops')) {
  console.log('Usage: node tools/instant-lookup.mjs [passcode|enquiry|deal|instruction|prospect|person|pipeline|ops] [value]');
  console.log('Tip: ops accepts phrases like "show me operations for this week".');
  process.exit(1);
}

async function lookup() {
  let poolsToClose = [];
  const trackPool = (pool) => {
    if (pool) poolsToClose.push(pool);
    return pool;
  };

  try {
    const input = String(value ?? '').trim();
    const like = `%${input}%`;
    let pool;
    let dbName;
    let recordset = [];
    const warnings = [];

    const scopeLabel = type === 'person'
      ? 'legacy+new enquiries'
      : (type === 'ops' ? 'dataOpsLog (instructions)' : (PIPELINE_ALIASES.has(type) ? 'full pipeline (core+instructions)' : 'default'));
    const summary = `Run lookup: ${type} "${input || phrase}" (scope: ${scopeLabel})`;

    if (planOnly) {
      console.log(summary);
      console.log('Plan only. No command executed.');
      process.exit(0);
    }

    if (confirmFirst) {
      const { createInterface } = await import('readline');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise((resolve) => {
        rl.question(`${summary}\nProceed? (y/N): `, resolve);
      });
      rl.close();
      const ok = String(answer || '').trim().toLowerCase();
      if (ok !== 'y' && ok !== 'yes') {
        console.log('❌ Cancelled.');
        process.exit(0);
      }
    }

    switch (type) {
      case 'passcode':
        pool = trackPool(await sql.connect(await resolveInstructionsConnectionString()));
        recordset = (await pool
          .request()
          .input('passcode', sql.VarChar, input)
          .input('like', sql.VarChar, like)
          .query(`
            SELECT 'Deal' as Type, DealId, ProspectId, Passcode, Amount, ServiceDescription, InstructionRef
            FROM Deals WHERE Passcode = @passcode
            UNION ALL
            SELECT 'Instruction' as Type, InstructionRef, ProspectId, NULL, NULL, NULL, InstructionRef
            FROM Instructions WHERE InstructionRef LIKE @like
          `)).recordset;
        dbName = 'Instructions';
        break;

      case 'enquiry':
        pool = trackPool(await sql.connect(await resolveCoreConnectionString()));
        {
          const enquiryId = Number.parseInt(input, 10);
          if (!Number.isFinite(enquiryId)) {
            console.log('❌ enquiry expects a numeric ID');
            process.exit(1);
          }
          recordset = (await pool
            .request()
            .input('id', sql.Int, enquiryId)
            .query(
              'SELECT ID, First_Name, Last_Name, Email, Phone_Number, Company, Area_of_Work, Matter_Ref FROM enquiries WHERE ID = @id'
            )).recordset;
        }
        dbName = 'Core Data';
        break;

      case 'deal':
        pool = trackPool(await sql.connect(await resolveInstructionsConnectionString()));
        {
          const dealId = Number.parseInt(input, 10);
          if (!Number.isFinite(dealId)) {
            console.log('❌ deal expects a numeric DealId');
            process.exit(1);
          }
          recordset = (await pool
            .request()
            .input('dealId', sql.Int, dealId)
            .query('SELECT * FROM Deals WHERE DealId = @dealId')).recordset;
        }
        dbName = 'Instructions';
        break;

      case 'instruction':
        pool = trackPool(await sql.connect(await resolveInstructionsConnectionString()));
        recordset = (await pool
          .request()
          .input('instructionRef', sql.VarChar, input)
          .query('SELECT * FROM Instructions WHERE InstructionRef = @instructionRef')).recordset;
        dbName = 'Instructions';
        break;

      case 'prospect': {
        pool = trackPool(await sql.connect(await resolveInstructionsConnectionString()));
        // ProspectId is a string in Instructions DB in practice (even if numeric)
        const pid = input;
        const deals = (await pool
          .request()
          .input('pid', sql.VarChar, pid)
          .query('SELECT TOP 50 DealId, ProspectId, Passcode, Amount, ServiceDescription, InstructionRef FROM Deals WHERE ProspectId = @pid ORDER BY DealId DESC')).recordset;

        const instructionRefs = [...new Set(
          deals
            .map((d) => (d?.InstructionRef ? String(d.InstructionRef).trim() : ''))
            .filter(Boolean)
        )];

        let instructions = [];
        if (instructionRefs.length > 0) {
          const req = pool.request();
          const refParamNames = instructionRefs.map((_, idx) => `ref${idx}`);
          refParamNames.forEach((p, idx) => req.input(p, sql.VarChar, instructionRefs[idx]));
          const inList = refParamNames.map((p) => `@${p}`).join(',');
          instructions = (await req.query(
            `SELECT TOP 50 InstructionRef, Stage, FirstName, LastName, ClientId, MatterId, Email
             FROM Instructions
             WHERE InstructionRef IN (${inList})
             ORDER BY InstructionRef DESC`
          )).recordset;
        }

        dbName = 'Instructions';
        recordset = [{ prospectId: pid, deals, instructions }];
        break;
      }

      case 'person': {
        // Name lookup is enquiries-only (no deals/instructions) to avoid broken joins.
        const corePool = trackPool(await sql.connect(await resolveCoreConnectionString()));
        const instrPool = trackPool(await sql.connect(await resolveInstructionsConnectionString()));

        let legacyEnquiries = [];
        let newEnquiries = [];

        const personHasFullName = input.trim().split(/\s+/).filter(Boolean).length > 1;
        const personTargetFullName = normaliseNameValue(input);

        try {
          const legacyColumns = await getTableColumns(corePool, 'enquiries', 'dbo');
          const legacyWhere = personHasFullName
            ? buildStrictFullNameWhere(legacyColumns, { input, like })
            : buildFlexibleEnquiryWhere(legacyColumns, { input, like });
          if (legacyWhere) {
            const req = corePool.request();
            legacyWhere.params.forEach((p) => req.input(p.name, p.type, p.value));
            legacyEnquiries = (await req.query(
              `SELECT TOP 25 * FROM enquiries WHERE ${legacyWhere.where} ORDER BY ID DESC`
            )).recordset;
          } else {
            warnings.push('Legacy enquiries lookup skipped: no matching columns found.');
          }
        } catch (err) {
          warnings.push(`Legacy enquiries lookup skipped: ${err?.message || err}`);
        }

        try {
          const newColumns = await getTableColumns(instrPool, 'enquiries', 'dbo');
          const newWhere = personHasFullName
            ? buildStrictFullNameWhere(newColumns, { input, like })
            : buildFlexibleEnquiryWhere(newColumns, { input, like });
          if (newWhere) {
            const req = instrPool.request();
            newWhere.params.forEach((p) => req.input(p.name, p.type, p.value));
            const orderBy = pickOrderBy(newColumns, ['datetime', 'DateTime', 'date_created', 'Date_Created', 'ID', 'id']);
            newEnquiries = (await req.query(
              `SELECT TOP 25 * FROM dbo.enquiries WHERE ${newWhere.where}${orderBy ? ` ORDER BY ${orderBy} DESC` : ''}`
            )).recordset;
          } else {
            warnings.push('New enquiries lookup skipped: no matching columns found.');
          }
        } catch (err) {
          warnings.push(`New enquiries lookup skipped: ${err?.message || err}`);
        }

        if (personHasFullName) {
          // Prefer exact full-name matches, but don't drop near matches (e.g. middle names)
          // because the caller is usually trying to find the pipeline, not enforce strict identity.
          const legacyExact = legacyEnquiries.filter((record) => buildRecordFullName(record) === personTargetFullName);
          const newExact = newEnquiries.filter((record) => buildRecordFullName(record) === personTargetFullName);
          if (legacyExact.length > 0) legacyEnquiries = legacyExact;
          if (newExact.length > 0) newEnquiries = newExact;
        }

        if (legacyEnquiries.length === 0 && newEnquiries.length === 0 && isLikelyName(input)) {
          warnings.push(
            'No matches found in enquiries tables for this name. If you are trying to find the legacy-space pipeline, run: node tools/instant-lookup.mjs pipeline "<name>"'
          );
        }

        dbName = 'Core Data + Instructions';
        recordset = [{ legacyEnquiries, newEnquiries, warnings }];
        break;
      }

      case 'pipeline':
      case 'journey':
      case 'chain': {
        const pipelineInput = input;
        const pipelineWarnings = [];

        const instructionRefs = new Set();
        const prospectIds = new Set();
        const passcodes = new Set();
        const emails = new Set();
        const dealIds = new Set();
        const matterIds = new Set();

        const parsedRef = parseInstructionRef(pipelineInput);
        if (parsedRef) {
          instructionRefs.add(parsedRef.instructionRef);
          prospectIds.add(parsedRef.prospectId);
          passcodes.add(parsedRef.passcode);
        }

        if (isNumeric(pipelineInput)) {
          prospectIds.add(pipelineInput);
          passcodes.add(pipelineInput);
        }

        if (isEmail(pipelineInput)) {
          emails.add(pipelineInput);
        }

        const instructions = [];
        const deals = [];
        const matters = [];
        const payments = [];
        const documents = [];
        const riskAssessments = [];
        const idVerifications = [];
        const pitchContent = [];
        const teamsData = [];
        let newEnquiries = [];
        let legacyEnquiries = [];

        const pushUniqueBy = (list, record, key) => {
          if (!record) return;
          const value = record?.[key];
          if (!value) {
            list.push(record);
            return;
          }
          const exists = list.some((item) => String(item?.[key]) === String(value));
          if (!exists) list.push(record);
        };

        const instrPool = trackPool(await sql.connect(await resolveInstructionsConnectionString()));
        const corePool = trackPool(await sql.connect(await resolveCoreConnectionString()));

        if (isLikelyName(pipelineInput)) {
          const nameLike = `%${pipelineInput}%`;
          const hasFullName = pipelineInput.trim().split(/\s+/).filter(Boolean).length > 1;
          const targetFullName = normaliseNameValue(pipelineInput);
          try {
            const legacyColumns = await getTableColumns(corePool, 'enquiries', 'dbo');
            const legacyWhere = hasFullName
              ? buildStrictFullNameWhere(legacyColumns, { input: pipelineInput, like: nameLike })
              : buildFlexibleEnquiryWhere(legacyColumns, { input: pipelineInput, like: nameLike });
            if (legacyWhere) {
              const req = corePool.request();
              legacyWhere.params.forEach((p) => req.input(p.name, p.type, p.value));
              legacyEnquiries = (await req.query(
                `SELECT TOP 25 * FROM enquiries WHERE ${legacyWhere.where} ORDER BY ID DESC`
              )).recordset;
            } else {
              pipelineWarnings.push('Legacy name lookup skipped: no matching columns found.');
            }
          } catch (err) {
            pipelineWarnings.push(`Legacy name lookup skipped: ${err?.message || err}`);
          }

          try {
            const newColumns = await getTableColumns(instrPool, 'enquiries', 'dbo');
            const newWhere = hasFullName
              ? buildStrictFullNameWhere(newColumns, { input: pipelineInput, like: nameLike })
              : buildFlexibleEnquiryWhere(newColumns, { input: pipelineInput, like: nameLike });
            if (newWhere) {
              const req = instrPool.request();
              newWhere.params.forEach((p) => req.input(p.name, p.type, p.value));
              const orderBy = pickOrderBy(newColumns, ['datetime', 'DateTime', 'date_created', 'Date_Created', 'ID', 'id']);
              newEnquiries = (await req.query(
                `SELECT TOP 25 * FROM dbo.enquiries WHERE ${newWhere.where}${orderBy ? ` ORDER BY ${orderBy} DESC` : ''}`
              )).recordset;
            } else {
              pipelineWarnings.push('New enquiries name lookup skipped: no matching columns found.');
            }
          } catch (err) {
            pipelineWarnings.push(`New enquiries name lookup skipped: ${err?.message || err}`);
          }

          if (hasFullName) {
            legacyEnquiries = legacyEnquiries.filter((record) => buildRecordFullName(record) === targetFullName);
            newEnquiries = newEnquiries.filter((record) => buildRecordFullName(record) === targetFullName);
          }

          legacyEnquiries.forEach((enquiry) => {
            if (enquiry?.ID !== undefined && enquiry?.ID !== null) prospectIds.add(String(enquiry.ID));
            if (enquiry?.Email) emails.add(String(enquiry.Email).trim());
            if (enquiry?.email) emails.add(String(enquiry.email).trim());
          });
          newEnquiries.forEach((enquiry) => {
            if (enquiry?.acid) prospectIds.add(String(enquiry.acid));
            if (enquiry?.id) prospectIds.add(String(enquiry.id));
            if (enquiry?.ID) prospectIds.add(String(enquiry.ID));
            if (enquiry?.email) emails.add(String(enquiry.email).trim());
            if (enquiry?.Email) emails.add(String(enquiry.Email).trim());
          });
        }

        if (instructionRefs.size > 0) {
          const req = instrPool.request();
          const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
          const rows = (await req.query(`SELECT TOP 50 * FROM Instructions WHERE InstructionRef IN (${inClause})`)).recordset;
          rows.forEach((row) => pushUniqueBy(instructions, row, 'InstructionRef'));
        }

        if (instructionRefs.size > 0) {
          const req = instrPool.request();
          const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
          const rows = (await req.query(`SELECT TOP 50 * FROM Deals WHERE InstructionRef IN (${inClause}) ORDER BY DealId DESC`)).recordset;
          rows.forEach((row) => pushUniqueBy(deals, row, 'DealId'));
        }

        if (prospectIds.size > 0) {
          const req = instrPool.request();
          const inClause = applyInParams(req, Array.from(prospectIds), 'pid', sql.VarChar);
          const rows = (await req.query(`SELECT TOP 50 * FROM Deals WHERE ProspectId IN (${inClause}) ORDER BY DealId DESC`)).recordset;
          rows.forEach((row) => pushUniqueBy(deals, row, 'DealId'));
        }

        if (passcodes.size > 0) {
          const req = instrPool.request();
          const inClause = applyInParams(req, Array.from(passcodes), 'pass', sql.VarChar);
          const rows = (await req.query(`SELECT TOP 50 * FROM Deals WHERE Passcode IN (${inClause}) ORDER BY DealId DESC`)).recordset;
          rows.forEach((row) => pushUniqueBy(deals, row, 'DealId'));
        }

        if (emails.size > 0) {
          const instructionColumns = await getTableColumns(instrPool, 'Instructions', 'dbo');
          const req = instrPool.request();
          const inClause = buildInClauseForColumns(
            instructionColumns,
            Array.from(emails),
            req,
            ['Email', 'email', 'ClientEmail', 'clientEmail'],
            'email'
          );
          if (inClause) {
            const rows = (await req.query(
              `SELECT TOP 50 * FROM Instructions WHERE ${inClause} ORDER BY InstructionRef DESC`
            )).recordset;
            rows.forEach((row) => pushUniqueBy(instructions, row, 'InstructionRef'));
          } else {
            pipelineWarnings.push('Instruction email lookup skipped: no matching email columns found.');
          }
        }

        try {
          const req = instrPool.request().input('matter', sql.VarChar, pipelineInput);
          const rows = (await req.query(
            `SELECT TOP 50 * FROM Matters WHERE MatterId = @matter OR DisplayNumber = @matter`
          )).recordset;
          rows.forEach((row) => pushUniqueBy(matters, row, 'MatterId'));
        } catch (err) {
          try {
            const req = instrPool.request().input('matter', sql.VarChar, pipelineInput);
            const rows = (await req.query(
              `SELECT TOP 50 * FROM Matters WHERE MatterId = @matter OR [Display Number] = @matter`
            )).recordset;
            rows.forEach((row) => pushUniqueBy(matters, row, 'MatterId'));
          } catch (innerErr) {
            pipelineWarnings.push(`Matter lookup skipped: ${innerErr?.message || innerErr}`);
          }
        }

        deals.forEach((deal) => {
          if (deal?.DealId !== undefined && deal?.DealId !== null) dealIds.add(String(deal.DealId));
          if (deal?.InstructionRef) instructionRefs.add(String(deal.InstructionRef).trim());
          if (deal?.ProspectId) prospectIds.add(String(deal.ProspectId).trim());
          if (deal?.Passcode) passcodes.add(String(deal.Passcode).trim());
        });

        instructions.forEach((inst) => {
          if (inst?.InstructionRef) instructionRefs.add(String(inst.InstructionRef).trim());
          if (inst?.ProspectId) prospectIds.add(String(inst.ProspectId).trim());
          const instEmail = inst?.Email || inst?.ClientEmail;
          if (instEmail) emails.add(String(instEmail).trim());
        });

        matters.forEach((matter) => {
          if (matter?.InstructionRef) instructionRefs.add(String(matter.InstructionRef).trim());
          if (matter?.MatterId) matterIds.add(String(matter.MatterId).trim());
        });

        if (instructionRefs.size > 0) {
          const req = instrPool.request();
          const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
          const rows = (await req.query(`SELECT TOP 50 * FROM Instructions WHERE InstructionRef IN (${inClause})`)).recordset;
          rows.forEach((row) => pushUniqueBy(instructions, row, 'InstructionRef'));
        }

        if (instructionRefs.size > 0) {
          const req = instrPool.request();
          const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
          const rows = (await req.query(`SELECT TOP 50 * FROM Matters WHERE InstructionRef IN (${inClause}) ORDER BY OpenDate DESC`)).recordset;
          rows.forEach((row) => pushUniqueBy(matters, row, 'MatterId'));
        }

        if (instructionRefs.size > 0) {
          const req = instrPool.request();
          const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
          payments.push(...(await req.query(
            `SELECT * FROM Payments WHERE instruction_ref IN (${inClause}) ORDER BY id DESC`
          )).recordset);
        }

        if (instructionRefs.size > 0) {
          const req = instrPool.request();
          const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
          documents.push(...(await req.query(
            `SELECT * FROM Documents WHERE InstructionRef IN (${inClause}) ORDER BY DocumentId DESC`
          )).recordset);
        }

        if (instructionRefs.size > 0 || matterIds.size > 0) {
          const refList = Array.from(instructionRefs);
          const matterList = Array.from(matterIds);
          const req = instrPool.request();
          const refClause = refList.length > 0 ? applyInParams(req, refList, 'ref', sql.VarChar) : null;
          const matterClause = matterList.length > 0 ? applyInParams(req, matterList, 'mid', sql.VarChar) : null;
          if (refClause || matterClause) {
            const whereParts = [];
            if (refClause) whereParts.push(`InstructionRef IN (${refClause})`);
            if (matterClause) whereParts.push(`MatterId IN (${matterClause})`);
            riskAssessments.push(...(await req.query(
              `SELECT * FROM RiskAssessment WHERE ${whereParts.join(' OR ')}`
            )).recordset);
          }
        }

        if (instructionRefs.size > 0) {
          const req = instrPool.request();
          const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
          idVerifications.push(...(await req.query(
            `SELECT * FROM IDVerifications WHERE InstructionRef IN (${inClause}) ORDER BY EIDCheckedDate DESC`
          )).recordset);
        }

        if (dealIds.size > 0) {
          const req = instrPool.request();
          const inClause = applyInParams(req, Array.from(dealIds), 'deal', sql.VarChar);
          pitchContent.push(...(await req.query(
            `SELECT * FROM PitchContent WHERE DealId IN (${inClause}) ORDER BY PitchContentId DESC`
          )).recordset);
        }

        // Teams activity tracking data
        // TeamsBotActivityTracking.EnquiryId refers to instructions.enquiries.id (new enquiries)
        // The legacy ID (from helix-core-data) is stored in instructions.enquiries.acid
        // So we need to: 1) map legacy IDs to new enquiry IDs via acid, 2) query TeamsBotActivityTracking
        const numericPids = Array.from(prospectIds).filter(isNumeric);
        if (numericPids.length > 0) {
          try {
            // First, get the new enquiry IDs that correspond to these legacy IDs (via acid column)
            const mapReq = instrPool.request();
            const mapInClause = applyInParams(mapReq, numericPids, 'acid', sql.VarChar);
            const acidMapping = (await mapReq.query(
              `SELECT id, acid FROM [dbo].[enquiries] WHERE acid IN (${mapInClause})`
            )).recordset;
            
            // Collect both: new enquiry IDs (from acid mapping) AND direct IDs (in case they match)
            const newEnquiryIds = new Set();
            acidMapping.forEach(row => {
              if (row.id) newEnquiryIds.add(String(row.id));
            });
            // Also add the original IDs in case they directly match new enquiry IDs
            numericPids.forEach(pid => newEnquiryIds.add(pid));
            
            const allIdsToQuery = Array.from(newEnquiryIds).filter(isNumeric);
            
            if (allIdsToQuery.length > 0) {
              const req = instrPool.request();
              const inClause = applyInParams(req, allIdsToQuery, 'enqid', sql.Int);
              
              const rows = (await req.query(
                `SELECT 
                  Id,
                  ActivityId,
                  ChannelId,
                  TeamId,
                  EnquiryId,
                  LeadName,
                  Email,
                  Phone,
                  CardType,
                  MessageTimestamp,
                  TeamsMessageId,
                  DATEDIFF_BIG(MILLISECOND, '1970-01-01', CreatedAt) AS CreatedAtMs,
                  Stage,
                  Status,
                  ClaimedBy,
                  ClaimedAt,
                  CreatedAt,
                  UpdatedAt
                FROM [dbo].[TeamsBotActivityTracking]
                WHERE EnquiryId IN (${inClause})
                ORDER BY CreatedAt DESC`
              )).recordset;
              // Add teamsLink to each row using TeamsMessageId (epoch timestamp)
              rows.forEach((row) => {
                row.teamsLink = generateTeamsDeepLink(row.ChannelId, row.ActivityId, row.TeamId, row.TeamsMessageId, row.CreatedAtMs);
                teamsData.push(row);
              });
            }
          } catch (err) {
            pipelineWarnings.push(`Teams data lookup skipped: ${err?.message || err}`);
          }
        }

        try {
          const newColumns = await getTableColumns(instrPool, 'enquiries', 'dbo');
          const orderBy = pickOrderBy(newColumns, ['datetime', 'DateTime', 'date_created', 'Date_Created', 'ID', 'id']);
          if (prospectIds.size > 0) {
            const req = instrPool.request();
            const inClause = buildInClauseForColumns(
              newColumns,
              Array.from(prospectIds),
              req,
              ['acid', 'ACID', 'Acid', 'id', 'ID', 'EnquiryId', 'enquiryId', 'ProspectId', 'prospectId'],
              'pid'
            );
            if (inClause) {
              newEnquiries = (await req.query(
                `SELECT TOP 50 * FROM dbo.enquiries WHERE ${inClause}${orderBy ? ` ORDER BY ${orderBy} DESC` : ''}`
              )).recordset;
            } else {
              pipelineWarnings.push('New enquiries lookup skipped: no matching ID columns found.');
            }
          } else if (emails.size > 0) {
            const req = instrPool.request();
            const inClause = buildInClauseForColumns(
              newColumns,
              Array.from(emails),
              req,
              ['Email', 'email', 'ClientEmail', 'clientEmail'],
              'email'
            );
            if (inClause) {
              newEnquiries = (await req.query(
                `SELECT TOP 50 * FROM dbo.enquiries WHERE ${inClause}${orderBy ? ` ORDER BY ${orderBy} DESC` : ''}`
              )).recordset;
            } else {
              pipelineWarnings.push('New enquiries lookup skipped: no matching email columns found.');
            }
          }
        } catch (err) {
          pipelineWarnings.push(`New enquiries lookup skipped: ${err?.message || err}`);
        }

        const numericProspectIds = Array.from(prospectIds).filter(isNumeric);
        if (numericProspectIds.length > 0) {
          const req = corePool.request();
          const inClause = applyInParams(req, numericProspectIds, 'pid', sql.Int);
          legacyEnquiries = (await req.query(
            `SELECT TOP 50 *
             FROM enquiries
             WHERE ID IN (${inClause})
             ORDER BY ID DESC`
          )).recordset;
        }

        if (legacyEnquiries.length === 0 && emails.size > 0) {
          const req = corePool.request();
          const inClause = applyInParams(req, Array.from(emails), 'email', sql.VarChar);
          legacyEnquiries = (await req.query(
            `SELECT TOP 50 *
             FROM enquiries
             WHERE Email IN (${inClause})
             ORDER BY ID DESC`
          )).recordset;
        }

        dbName = 'Core Data + Instructions';
        recordset = [{
          input: pipelineInput,
          keys: {
            instructionRefs: Array.from(instructionRefs),
            prospectIds: Array.from(prospectIds),
            passcodes: Array.from(passcodes),
            emails: Array.from(emails),
            dealIds: Array.from(dealIds),
            matterIds: Array.from(matterIds),
          },
          matches: {
            instructions,
            deals,
            matters,
            payments,
            documents,
            riskAssessments,
            idVerifications,
            pitchContent,
            teamsData,
            legacyEnquiries,
            newEnquiries,
          },
          warnings: pipelineWarnings,
        }];
        break;
      }

      case 'ops': {
        pool = trackPool(await sql.connect(await resolveInstructionsConnectionString()));
        const phraseInput = input || phrase || 'this week';
        const range = buildOpsRangeFromPhrase(phraseInput);

        const countResult = await pool
          .request()
          .input('start', sql.DateTime2, range.startDate)
          .input('end', sql.DateTime2, range.endDate)
          .query('SELECT COUNT(*) as cnt FROM dataOpsLog WHERE ts >= @start AND ts <= @end');

        const rows = (await pool
          .request()
          .input('start', sql.DateTime2, range.startDate)
          .input('end', sql.DateTime2, range.endDate)
          .query(`
            SELECT TOP 200
              ts,
              operation,
              status,
              message,
              startDate,
              endDate,
              deletedRows,
              insertedRows,
              durationMs
            FROM dataOpsLog
            WHERE ts >= @start AND ts <= @end
            ORDER BY ts DESC
          `)).recordset;

        dbName = 'Instructions';
        recordset = [{
          range: range.label,
          start: range.startDate.toISOString(),
          end: range.endDate.toISOString(),
          total: countResult.recordset?.[0]?.cnt ?? 0,
          operations: rows,
        }];
        break;
      }

      default:
        console.log('❌ Invalid type. Use: passcode, enquiry, deal, instruction, prospect, person, pipeline, ops');
        process.exit(1);
    }

    console.log(`🔍 ${dbName} DB → ${type} "${input}"`);

    if (!recordset || recordset.length === 0) {
      console.log('❌ Not found');
    } else {
      console.log('✅ Found:');
      recordset.forEach(record => {
        console.log(JSON.stringify(record, null, 2));
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (poolsToClose.length > 0) {
      for (const p of poolsToClose) {
        try {
          await p.close();
        } catch {
          // ignore close errors
        }
      }
    }
  }
}

lookup();
