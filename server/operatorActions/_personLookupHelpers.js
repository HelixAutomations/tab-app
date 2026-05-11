// server/operatorActions/_personLookupHelpers.js
//
// Pure-function helpers ported verbatim from tools/instant-lookup.mjs.
// Kept as a private helper module so the action file (person-lookup.js)
// stays focused on the SQL pipeline. The query shapes here MUST stay in
// parity with the CLI to satisfy Phase A acceptance.

const sql = require('mssql');

const isEmail = (value) => /@/.test(String(value || '').trim());
const isNumeric = (value) => /^\d+$/.test(String(value || '').trim());
const isLikelyName = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (isEmail(raw) || isNumeric(raw)) return false;
  if (/^HLX-?\d+-\d+$/i.test(raw)) return false;
  return /[A-Za-z]/.test(raw);
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

module.exports = {
  isEmail,
  isNumeric,
  isLikelyName,
  getTableColumns,
  resolveColumn,
  buildFlexibleEnquiryWhere,
  buildStrictFullNameWhere,
  pickOrderBy,
  normaliseNameValue,
  buildRecordFullName,
};
