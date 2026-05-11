// server/operatorActions/person-lookup.js
//
// Operator action: search enquiries (Core Data + Instructions) by name,
// email, or numeric ID. Phase A pilot — read-only, dev-owner only.
//
// Parity contract: the JSON shape returned here MUST match the
// `recordset[0]` produced by `tools/instant-lookup.mjs person <query>`.
// See B1 brief Phase A acceptance.

const sql = require('mssql');
const { registerAction } = require('./registry');
const {
  buildFlexibleEnquiryWhere,
  buildStrictFullNameWhere,
  buildRecordFullName,
  getTableColumns,
  isLikelyName,
  normaliseNameValue,
  pickOrderBy,
} = require('./_personLookupHelpers');

function safeFileNameFragment(value) {
  return String(value || 'query')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'query';
}

async function runPersonLookup({ params }) {
  const input = String(params.query || '').trim();
  if (!input) {
    return { summary: 'Empty query', artefact: null, warnings: ['Empty query'] };
  }

  const coreConn = process.env.SQL_CONNECTION_STRING;
  const instrConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!coreConn) throw new Error('SQL_CONNECTION_STRING not configured');
  if (!instrConn) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');

  const like = `%${input}%`;
  const warnings = [];
  const personHasFullName = input.split(/\s+/).filter(Boolean).length > 1;
  const personTargetFullName = normaliseNameValue(input);

  const corePool = await sql.connect(coreConn);
  const instrPool = await sql.connect(instrConn);

  let legacyEnquiries = [];
  let newEnquiries = [];

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
      const orderBy = pickOrderBy(
        newColumns,
        ['datetime', 'DateTime', 'date_created', 'Date_Created', 'ID', 'id']
      );
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
    const legacyExact = legacyEnquiries.filter((record) => buildRecordFullName(record) === personTargetFullName);
    const newExact = newEnquiries.filter((record) => buildRecordFullName(record) === personTargetFullName);
    if (legacyExact.length > 0) legacyEnquiries = legacyExact;
    if (newExact.length > 0) newEnquiries = newExact;
  }

  if (legacyEnquiries.length === 0 && newEnquiries.length === 0 && isLikelyName(input)) {
    warnings.push(
      'No matches found in enquiries tables for this name. If you are trying to find the legacy-space pipeline, run the pipeline lookup action instead.'
    );
  }

  const recordset = [{ legacyEnquiries, newEnquiries, warnings: [...warnings] }];

  const total = legacyEnquiries.length + newEnquiries.length;
  const summary = total === 0
    ? `No enquiries matched "${input}"`
    : `Matched ${total} enquir${total === 1 ? 'y' : 'ies'} (legacy: ${legacyEnquiries.length}, new: ${newEnquiries.length})`;

  return {
    summary,
    warnings,
    artefact: {
      kind: 'json',
      body: {
        type: 'person',
        input,
        scope: 'Core Data + Instructions',
        recordset,
      },
      downloadName: `person-lookup-${safeFileNameFragment(input)}.json`,
      mimeType: 'application/json',
      attachableTo: ['blob', 'asana'],
    },
  };
}

registerAction({
  id: 'person-lookup',
  title: 'Person lookup',
  description: 'Search enquiries (Core Data + Instructions) by name, email or numeric ID. Read-only.',
  category: 'lookup',
  allowedTiers: ['admin'],
  dryRunSupported: false,
  paramsSchema: [
    {
      key: 'query',
      label: 'Name, email, or ID',
      type: 'text',
      required: true,
      placeholder: 'e.g. Luke Test, jane@example.com, 12345',
      helpText: 'Two-word names trigger strict full-name matching. Single words search first/last/email/phone.',
      maxLength: 200,
      // Names are not redacted at the audit layer because the audit row's
      // `summary` already records hit counts, and the action is dev-owner only.
      // Phone-shaped or email-shaped values are still redacted by classifier.
      redactValue: false,
    },
  ],
  run: runPersonLookup,
});

module.exports = { runPersonLookup };
