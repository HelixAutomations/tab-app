const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

async function handleComplianceLookup(req, res) {
  const startedAt = Date.now();
  const body = req.body || {};
  const matterId = String(body.matterId || req.query.matterId || '').trim();
  const clientId = String(body.clientId || req.query.clientId || '').trim();
  const operation = 'periodic-compliance-lookup';
  const triggeredBy = req.method;

  if (!matterId || !clientId) {
    return res.status(400).json({ error: 'matterId and clientId are required.' });
  }

  const connStr = process.env.SQL_CONNECTION_STRING;
  if (!connStr) {
    return res.status(500).json({ error: 'SQL_CONNECTION_STRING not configured.' });
  }

  trackEvent('Compliance.PeriodicLookup.Started', {
    operation,
    triggeredBy,
    matterId,
    clientId,
  });

  try {
    const result = await withRequest(connStr, async (request) => {
      request.input('matterId', sql.NVarChar(100), matterId);
      request.input('clientId', sql.NVarChar(100), clientId);

      return request.query(`
        SELECT
          [Compliance Date],
          [Compliance Expiry],
          [ACID],
          [Client ID],
          [Matter ID],
          [Check ID],
          [Check Result],
          [Risk Assessor],
          [Client Type],
          [Client Type_Value],
          [Destination Of Funds],
          [Destination Of Funds_Value],
          [Funds Type],
          [Funds Type_Value],
          [How Was Client Introduced],
          [How Was Client Introduced_Value],
          [Limitation],
          [Limitation_Value],
          [Source Of Funds],
          [Source Of Funds_Value],
          [Value Of Instruction],
          [Value Of Instruction_Value],
          [Risk Assessment Result],
          [Risk Score],
          [Risk Score Increment By],
          [Client Risk Factors Considered],
          [Transaction Risk Factors Considered],
          [Transaction Risk Level],
          [Firm-Wide AML Policy Considered],
          [Firm-Wide Sanctions Risk Considered],
          [PEP and Sanctions Check Result],
          [Address Verification Check Result]
        FROM [dbo].[periodic-compliance]
        WHERE [Matter ID] = @matterId AND [Client ID] = @clientId
        ORDER BY [Compliance Date] DESC
      `);
    });

    const durationMs = Date.now() - startedAt;
    const rowCount = Array.isArray(result.recordset) ? result.recordset.length : 0;

    trackEvent('Compliance.PeriodicLookup.Completed', {
      operation,
      triggeredBy,
      matterId,
      clientId,
      durationMs,
      rowCount,
    });
    trackMetric('Compliance.PeriodicLookup.Duration', durationMs, {
      operation,
      triggeredBy,
      matterId,
      clientId,
    });

    return res.json(result.recordset || []);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const err = error instanceof Error ? error : new Error(String(error));

    trackException(err, {
      operation,
      triggeredBy,
      phase: 'query-periodic-compliance',
      matterId,
      clientId,
    });
    trackEvent('Compliance.PeriodicLookup.Failed', {
      operation,
      triggeredBy,
      matterId,
      clientId,
      durationMs,
      error: err.message,
    });

    return res.status(500).json({ error: 'Failed to retrieve compliance data.' });
  }
}

router.get('/', handleComplianceLookup);
router.post('/', handleComplianceLookup);

module.exports = router;