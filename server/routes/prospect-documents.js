const express = require('express');

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

module.exports = router;
