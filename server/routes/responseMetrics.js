/**
 * Response Metrics proxy — forwards requests to enquiry-processing-v2.
 *
 * Routes:
 *   GET  /api/response-metrics/batch?ids=1,2,3  → response time buckets per enquiry
 */

const express = require('express');
const { trackEvent, trackException } = require('../utils/appInsights');

const router = express.Router();

const getBaseUrl = () =>
  process.env.ENQUIRY_PLATFORM_BASE_URL || 'https://enquiry-processing-v2.azurewebsites.net';

// GET /batch?ids=1,2,3 — response metrics batch
router.get('/batch', async (req, res) => {
  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: 'ids query parameter required' });
  try {
    trackEvent('ResponseMetrics.Batch.Started', { ids });
    const url = `${getBaseUrl()}/api/response-metrics/batch?ids=${ids}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': '2011',
      },
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!response.ok) {
      // Decorative enrichment — degrade gracefully so the UI still renders.
      trackEvent('ResponseMetrics.Batch.UpstreamFailed', {
        ids,
        status: String(response.status),
        body: typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500),
      });
      return res.json([]);
    }
    trackEvent('ResponseMetrics.Batch.Completed', { ids, count: Array.isArray(data) ? String(data.length) : '0' });
    return res.json(data);
  } catch (err) {
    trackException(err, { operation: 'ResponseMetrics.Batch', ids });
    // Decorative enrichment — return empty payload so the UI keeps working.
    return res.json([]);
  }
});

module.exports = router;
