// server/operatorActions/enquiry-lookup.js
//
// Operator action: enquiry by numeric ID against Core Data `enquiries`.
// Read-only. Parity with `node tools/instant-lookup.mjs enquiry <id>`.

const sql = require('mssql');
const { registerAction } = require('./registry');

async function runEnquiryLookup({ params }) {
  const raw = String(params.id || '').trim();
  const enquiryId = Number.parseInt(raw, 10);
  if (!Number.isFinite(enquiryId)) {
    return { summary: 'Enquiry ID must be numeric', artefact: null, warnings: ['Non-numeric input'] };
  }

  const connStr = process.env.SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('SQL_CONNECTION_STRING not configured');
  const pool = await sql.connect(connStr);

  const recordset = (await pool.request()
    .input('id', sql.Int, enquiryId)
    .query(`
      SELECT ID, First_Name, Last_Name, Email, Phone_Number, Company, Area_of_Work, Matter_Ref
      FROM enquiries
      WHERE ID = @id
    `)).recordset;

  const summary = recordset.length === 0
    ? `No enquiry with ID ${enquiryId}`
    : `Enquiry ${enquiryId}: matched`;

  return {
    summary,
    artefact: {
      kind: 'json',
      body: { type: 'enquiry', input: enquiryId, scope: 'Core Data', recordset },
      downloadName: `enquiry-lookup-${enquiryId}.json`,
      mimeType: 'application/json',
      attachableTo: ['blob', 'asana'],
    },
  };
}

registerAction({
  id: 'enquiry-lookup',
  title: 'Enquiry lookup',
  description: 'Resolve a Core Data enquiry by numeric ID. Read-only.',
  category: 'lookup',
  allowedTiers: ['admin'],
  dryRunSupported: false,
  paramsSchema: [
    {
      key: 'id',
      label: 'Enquiry ID',
      type: 'number',
      required: true,
      placeholder: 'e.g. 12345',
      maxLength: 12,
      redactValue: false,
    },
  ],
  run: runEnquiryLookup,
});

module.exports = { runEnquiryLookup };
