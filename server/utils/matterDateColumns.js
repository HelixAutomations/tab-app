const { withRequest } = require('./db');

const MATTER_DATE_COLUMN_CANDIDATES = [
  { name: 'open_date', expression: 'open_date' },
  { name: 'OpenDate', expression: 'OpenDate' },
  { name: 'Open Date', expression: '[Open Date]' },
  { name: 'close_date', expression: 'close_date' },
  { name: 'CloseDate', expression: 'CloseDate' },
  { name: 'Close Date', expression: '[Close Date]' },
  { name: 'created_at', expression: 'created_at' },
  { name: 'created_date', expression: 'created_date' },
  { name: 'CreatedAt', expression: 'CreatedAt' },
  { name: 'CreatedDate', expression: 'CreatedDate' },
  { name: 'Created Date', expression: '[Created Date]' },
];

const columnCache = new Map();

async function getMatterDateExpressions(connectionString) {
  if (!connectionString) {
    return [];
  }

  if (columnCache.has(connectionString)) {
    return columnCache.get(connectionString);
  }

  const columns = await withRequest(connectionString, async (request) => {
    const result = await request.query(`
      SELECT name
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'[dbo].[matters]')
    `);
    return Array.isArray(result.recordset) ? result.recordset.map((row) => row.name) : [];
  }, 0);

  const expressions = MATTER_DATE_COLUMN_CANDIDATES
    .filter((candidate) => columns.includes(candidate.name))
    .map((candidate) => candidate.expression);

  if (expressions.length) {
    console.log(`[Matters] Using date columns for filtering: ${expressions.join(', ')}`);
  } else {
    console.warn('[Matters] No recognized date columns found; range filters will be skipped');
  }

  columnCache.set(connectionString, expressions);
  return expressions;
}

module.exports = {
  getMatterDateExpressions,
};
