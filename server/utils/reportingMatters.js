const { withRequest } = require('./db');
const { buildDateParseExpression, getMatterDateExpressions } = require('./matterDateColumns');
const { trackEvent, trackException, trackMetric } = require('./appInsights');

function formatDateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function matterDedupeKey(row) {
  const displayNumber = row.DisplayNumber ?? row['Display Number'] ?? row.displayNumber;
  if (displayNumber != null && String(displayNumber).trim()) {
    return `display:${String(displayNumber).trim().toLowerCase()}`;
  }
  const matterId = row.MatterID ?? row.MatterId ?? row.matterId;
  if (matterId != null && String(matterId).trim()) {
    return `matter:${String(matterId).trim().toLowerCase()}`;
  }
  const uniqueId = row.UniqueID ?? row['Unique ID'] ?? row.uniqueId;
  if (uniqueId != null && String(uniqueId).trim()) {
    return `unique:${String(uniqueId).trim().toLowerCase()}`;
  }
  return `row:${JSON.stringify(row)}`;
}

async function fetchLegacyMatters({ connectionString, range }) {
  if (!connectionString) {
    return [];
  }

  const shouldApplyRange = Boolean(range?.from && range?.to);
  const dateExpressions = shouldApplyRange ? await getMatterDateExpressions(connectionString) : [];
  return withRequest(connectionString, async (request, sqlClient) => {
    let query = `
      SELECT *, CAST('legacy' AS NVARCHAR(50)) AS __matterSource
      FROM [dbo].[matters]
    `;

    if (shouldApplyRange) {
      const fromDate = formatDateOnly(range.from);
      const toDate = formatDateOnly(range.to);
      if (fromDate && toDate && dateExpressions.length) {
        request.input('dateFrom', sqlClient.Date, fromDate);
        request.input('dateTo', sqlClient.Date, toDate);
        const coalesceClause = dateExpressions.join(', ');
        query = `
          SELECT *, CAST('legacy' AS NVARCHAR(50)) AS __matterSource
          FROM [dbo].[matters]
          WHERE COALESCE(${coalesceClause}) BETWEEN @dateFrom AND @dateTo
        `;
      }
    }

    const result = await request.query(query);
    return Array.isArray(result.recordset) ? result.recordset : [];
  });
}

async function fetchNewSpaceMatters({ connectionString, range }) {
  if (!connectionString) {
    return [];
  }

  const shouldApplyRange = Boolean(range?.from && range?.to);
  const newSpaceOpenDateExpression = buildDateParseExpression('[OpenDate]');
  return withRequest(connectionString, async (request, sqlClient) => {
    let whereClause = '';
    if (shouldApplyRange) {
      const fromDate = formatDateOnly(range.from);
      const toDate = formatDateOnly(range.to);
      if (fromDate && toDate) {
        request.input('dateFrom', sqlClient.Date, fromDate);
        request.input('dateTo', sqlClient.Date, toDate);
        whereClause = `WHERE ${newSpaceOpenDateExpression} BETWEEN @dateFrom AND @dateTo`;
      }
    }

    const result = await request.query(`
      SELECT
        CAST([MatterID] AS NVARCHAR(255)) AS [MatterID],
        CAST([MatterID] AS NVARCHAR(255)) AS [MatterId],
        CAST([DisplayNumber] AS NVARCHAR(255)) AS [DisplayNumber],
        CAST([DisplayNumber] AS NVARCHAR(255)) AS [Display Number],
        CAST([InstructionRef] AS NVARCHAR(255)) AS [InstructionRef],
        CAST([Status] AS NVARCHAR(50)) AS [Status],
        [OpenDate] AS [OpenDate],
        [OpenDate] AS [Open Date],
        [CloseDate] AS [CloseDate],
        [CloseDate] AS [Close Date],
        CAST([ClientID] AS NVARCHAR(255)) AS [ClientID],
        CAST([ClientName] AS NVARCHAR(255)) AS [ClientName],
        CAST([ClientType] AS NVARCHAR(255)) AS [ClientType],
        CAST([Description] AS NVARCHAR(MAX)) AS [Description],
        CAST([PracticeArea] AS NVARCHAR(255)) AS [PracticeArea],
        CAST([ResponsibleSolicitor] AS NVARCHAR(255)) AS [ResponsibleSolicitor],
        CAST([ResponsibleSolicitor] AS NVARCHAR(255)) AS [Responsible Solicitor],
        CAST([OriginatingSolicitor] AS NVARCHAR(255)) AS [OriginatingSolicitor],
        CAST([OriginatingSolicitor] AS NVARCHAR(255)) AS [Originating Solicitor],
        CAST([SupervisingPartner] AS NVARCHAR(255)) AS [SupervisingPartner],
        CAST([Source] AS NVARCHAR(255)) AS [Source],
        CAST([Referrer] AS NVARCHAR(255)) AS [Referrer],
        CAST([method_of_contact] AS NVARCHAR(255)) AS [method_of_contact],
        CAST('new-space' AS NVARCHAR(50)) AS __matterSource
      FROM [dbo].[Matters]
      ${whereClause}
    `);
    return Array.isArray(result.recordset) ? result.recordset : [];
  });
}

async function fetchCombinedReportingMatters({ legacyConnectionString, newSpaceConnectionString, range, operation = 'Reporting.Matters.Fetch' }) {
  const startedAt = Date.now();
  const legacyPromise = fetchLegacyMatters({ connectionString: legacyConnectionString, range }).catch((error) => {
    trackException(error, { operation, phase: 'legacy-matters-query' });
    trackEvent('Reporting.Matters.SourceFailed', { operation, source: 'legacy', error: error.message });
    return [];
  });
  const newSpacePromise = fetchNewSpaceMatters({ connectionString: newSpaceConnectionString, range }).catch((error) => {
    trackException(error, { operation, phase: 'new-space-matters-query' });
    trackEvent('Reporting.Matters.SourceFailed', { operation, source: 'new-space', error: error.message });
    return [];
  });

  const [newSpaceRows, legacyRows] = await Promise.all([newSpacePromise, legacyPromise]);
  const rowsByMatter = new Map();
  for (const row of [...newSpaceRows, ...legacyRows]) {
    const key = matterDedupeKey(row);
    if (!rowsByMatter.has(key)) {
      rowsByMatter.set(key, row);
    }
  }

  const rows = Array.from(rowsByMatter.values());
  const durationMs = Date.now() - startedAt;
  trackEvent('Reporting.Matters.Completed', {
    operation,
    source: 'combined',
    rowCount: rows.length,
    newSpaceRows: newSpaceRows.length,
    legacyRows: legacyRows.length,
    durationMs,
  });
  trackMetric('Reporting.Matters.Duration', durationMs, { operation });
  trackMetric('Reporting.Matters.Rows', rows.length, { operation });
  return rows;
}

module.exports = {
  fetchCombinedReportingMatters,
};
