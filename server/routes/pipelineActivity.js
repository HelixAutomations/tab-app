/**
 * Pipeline Activity proxy — forwards requests to enquiry-processing-v2.
 *
 * Routes:
 *   GET  /api/pipeline-activity/batch?ids=1,2,3  → summary per enquiry
 *   GET  /api/pipeline-activity/:enquiryId        → full activity timeline
 *   POST /api/pipeline-activity/scan/:enquiryId   → manual 365 scan trigger
 *   POST /api/pipeline-activity/override           → admin insert with audit trail
 *   DELETE /api/pipeline-activity/:id              → admin remove
 */

const express = require('express');
const { trackEvent, trackException } = require('../utils/appInsights');

const router = express.Router();

const getBaseUrl = () =>
  process.env.ENQUIRY_PLATFORM_BASE_URL || 'https://enquiry-processing-v2.azurewebsites.net';

/**
 * Forward a request to the enquiry-processing pipeline-activity API.
 */
const proxyRequest = async (method, path, body = null) => {
  const url = `${getBaseUrl()}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': '2011',
    },
  };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: response.ok, status: response.status, data };
};

// GET /batch?ids=1,2,3 — summary per enquiry
router.get('/batch', async (req, res) => {
  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: 'ids query parameter required' });
  try {
    trackEvent('PipelineActivity.Batch.Started', { ids });
    const result = await proxyRequest('GET', `/api/pipeline-activity/batch?ids=${ids}`);
    if (!result.ok) return res.status(result.status).json(result.data);
    trackEvent('PipelineActivity.Batch.Completed', { ids, count: Array.isArray(result.data) ? String(result.data.length) : '0' });
    return res.json(result.data);
  } catch (err) {
    trackException(err, { operation: 'PipelineActivity.Batch', ids });
    return res.status(500).json({ error: 'Failed to fetch pipeline activity batch' });
  }
});

// GET /:enquiryId — full activity timeline
router.get('/:enquiryId', async (req, res) => {
  const { enquiryId } = req.params;
  try {
    const result = await proxyRequest('GET', `/api/pipeline-activity/${enquiryId}`);
    if (!result.ok) return res.status(result.status).json(result.data);
    return res.json(result.data);
  } catch (err) {
    trackException(err, { operation: 'PipelineActivity.Timeline', enquiryId });
    return res.status(500).json({ error: 'Failed to fetch pipeline activity' });
  }
});

// POST /scan/:enquiryId — manual 365 scan trigger
router.post('/scan/:enquiryId', async (req, res) => {
  const { enquiryId } = req.params;
  try {
    trackEvent('PipelineActivity.Scan.Started', { enquiryId });
    const result = await proxyRequest('POST', `/api/pipeline-activity/scan/${enquiryId}`);
    if (!result.ok) return res.status(result.status).json(result.data);
    trackEvent('PipelineActivity.Scan.Completed', { enquiryId });
    return res.json(result.data);
  } catch (err) {
    trackException(err, { operation: 'PipelineActivity.Scan', enquiryId });
    return res.status(500).json({ error: 'Failed to trigger 365 scan' });
  }
});

// POST /override — admin insert with audit trail
router.post('/override', async (req, res) => {
  try {
    trackEvent('PipelineActivity.Override.Started', { body: JSON.stringify(req.body) });
    const result = await proxyRequest('POST', '/api/pipeline-activity/override', req.body);
    if (!result.ok) return res.status(result.status).json(result.data);
    trackEvent('PipelineActivity.Override.Completed');
    return res.json(result.data);
  } catch (err) {
    trackException(err, { operation: 'PipelineActivity.Override' });
    return res.status(500).json({ error: 'Failed to create pipeline activity override' });
  }
});

// DELETE /:id — admin remove
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    trackEvent('PipelineActivity.Delete.Started', { id });
    const result = await proxyRequest('DELETE', `/api/pipeline-activity/${id}`);
    if (!result.ok) return res.status(result.status).json(result.data);
    trackEvent('PipelineActivity.Delete.Completed', { id });
    return res.json(result.data);
  } catch (err) {
    trackException(err, { operation: 'PipelineActivity.Delete', id });
    return res.status(500).json({ error: 'Failed to delete pipeline activity' });
  }
});

module.exports = router;
