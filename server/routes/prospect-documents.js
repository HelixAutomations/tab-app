const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

function buildContentDisposition({ filename, isDownload }) {
  const safeFilename = String(filename || 'document')
    .replace(/\r|\n/g, ' ')
    .replace(/"/g, "'");

  const utf8Name = encodeURIComponent(String(filename || 'document'));
  const type = isDownload ? 'attachment' : 'inline';
  // Include both filename and filename* for better Unicode support.
  return `${type}; filename="${safeFilename}"; filename*=UTF-8''${utf8Name}`;
}

function isAllowedBlobUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();

    // Allow Azure Blob Storage hosts only.
    // Example: <account>.blob.core.windows.net
    if (host.endsWith('.blob.core.windows.net')) return true;

    return false;
  } catch {
    return false;
  }
}

async function pipeUpstreamToResponse(upstream, res) {
  // Copy a small, safe subset of headers through.
  const passthroughHeaders = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
    'cache-control',
  ];

  for (const name of passthroughHeaders) {
    const v = upstream.headers.get ? upstream.headers.get(name) : upstream.headers[name];
    if (v) res.setHeader(name, v);
  }

  res.status(upstream.status);

  // node-fetch gives a Node stream; native fetch gives a web ReadableStream.
  const body = upstream.body;
  if (!body) {
    res.end();
    return;
  }

  if (typeof body.pipe === 'function') {
    body.pipe(res);
    return;
  }

  // Web stream fallback
  const { Readable } = require('stream');
  Readable.fromWeb(body).pipe(res);
}

/**
 * Proxy a blob URL and force browser-friendly preview/download headers.
 *
 * Query params:
 * - url: required https://<account>.blob.core.windows.net/... (may include SAS)
 * - filename: optional original filename for Content-Disposition
 * - download: optional truthy value; when set, forces attachment disposition
 */
router.get('/proxy', async (req, res) => {
  try {
    const url = req.query.url;
    const filename = req.query.filename;
    const isDownload = String(req.query.download || '').toLowerCase() === 'true' || String(req.query.download || '') === '1';

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing url' });
    }

    if (!isAllowedBlobUrl(url)) {
      return res.status(400).json({ error: 'Unsupported document url' });
    }

    const upstream = await fetch(url, {
      // Forward Range for PDF viewers and large files.
      headers: req.headers.range ? { Range: req.headers.range } : undefined,
    });

    if (!upstream.ok && upstream.status !== 206) {
      const text = await upstream.text().catch(() => '');
      return res.status(upstream.status).send(text || 'Failed to fetch document');
    }

    // Override content disposition to ensure preview renders inline.
    res.setHeader(
      'Content-Disposition',
      buildContentDisposition({ filename, isDownload })
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Avoid caching signed URLs in intermediate proxies.
    res.setHeader('Cache-Control', 'no-store');

    await pipeUpstreamToResponse(upstream, res);
    return undefined;
  } catch (error) {
    // Best-effort: avoid leaking internal details
    return res.status(500).json({ error: 'Failed to proxy document' });
  }
});

/**
 * POST /counts — Return document counts per enquiry ID.
 * Resolves enquiryId → InstructionRef via Deals.ProspectId, then counts Documents rows.
 * Body: { enquiryIds: string[] }
 * Response: { counts: Record<string, number> }
 */
router.post('/counts', async (req, res) => {
  const start = Date.now();
  try {
    const { enquiryIds } = req.body || {};
    if (!Array.isArray(enquiryIds) || enquiryIds.length === 0) {
      return res.status(400).json({ error: 'enquiryIds array required' });
    }

    // Cap to prevent abuse
    const ids = enquiryIds.slice(0, 200).map(String);

    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
      return res.status(503).json({ error: 'Instructions DB not configured' });
    }

    trackEvent('ProspectDocuments.Counts.Started', { count: String(ids.length) });

    const counts = {};

    await withRequest(connectionString, async (request) => {
      // Build parameterised IN clause for ProspectId lookup
      const idParams = ids.map((_, i) => `@eid${i}`);
      ids.forEach((id, i) => {
        request.input(`eid${i}`, sql.NVarChar(50), id);
      });

      // Step 1: Map enquiryId → InstructionRef via Deals.ProspectId
      const dealResult = await request.query(`
        SELECT DISTINCT d.ProspectId, i.InstructionRef
        FROM [dbo].[Deals] d
        INNER JOIN [dbo].[Instructions] i ON i.InstructionRef = d.InstructionRef
        WHERE d.ProspectId IN (${idParams.join(',')})
      `);

      const refToEnquiryId = new Map();
      for (const row of (dealResult.recordset || [])) {
        if (row.InstructionRef && row.ProspectId) {
          refToEnquiryId.set(String(row.InstructionRef), String(row.ProspectId));
        }
      }

      // Initialise all requested IDs with 0
      for (const id of ids) {
        counts[id] = 0;
      }

      if (refToEnquiryId.size === 0) {
        return;
      }

      // Step 2: Count documents by InstructionRef
      const request2 = request; // reuse same connection
      const refs = [...refToEnquiryId.keys()];
      // New request needed for fresh inputs
      const countResult = await withRequest(connectionString, async (req2) => {
        const refParams = refs.map((_, i) => `@ref${i}`);
        refs.forEach((ref, i) => {
          req2.input(`ref${i}`, sql.NVarChar(50), ref);
        });
        return req2.query(`
          SELECT InstructionRef, COUNT(*) AS cnt
          FROM [dbo].[Documents]
          WHERE InstructionRef IN (${refParams.join(',')})
          GROUP BY InstructionRef
        `);
      }, 2);

      for (const row of (countResult.recordset || [])) {
        const enquiryId = refToEnquiryId.get(String(row.InstructionRef));
        if (enquiryId) {
          counts[enquiryId] = (counts[enquiryId] || 0) + (row.cnt || 0);
        }
      }
    }, 2);

    const durationMs = Date.now() - start;
    trackEvent('ProspectDocuments.Counts.Completed', { count: String(ids.length), durationMs: String(durationMs) });
    trackMetric('ProspectDocuments.Counts.Duration', durationMs);

    return res.json({ counts });
  } catch (error) {
    const durationMs = Date.now() - start;
    trackException(error, { operation: 'ProspectDocuments.Counts', phase: 'query' });
    trackEvent('ProspectDocuments.Counts.Failed', { error: error.message, durationMs: String(durationMs) });
    return res.status(500).json({ error: 'Failed to fetch document counts' });
  }
});

module.exports = router;
