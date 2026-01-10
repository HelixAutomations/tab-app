// Lightweight Server-Sent Events (SSE) channel for enquiries change notifications.
// Intentionally payload-light: clients should refresh via existing API endpoints.

const { withRequest, sql } = require('./db');

// Store connected clients (http.ServerResponse)
const clients = new Set();
let seq = 0;

// Optional: while there are connected SSE clients, poll for claim changes written by Teams bot/platform.
// This makes the Enquiries UI feel realtime even when changes don't flow through Hub routes.
let teamsClaimWatcherTimer = null;
let lastTeamsClaimUpdatedAt = null;
const lastBroadcastClaimStateByEnquiryId = new Map();

async function pollTeamsClaimsOnce() {
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;
  if (!connectionString) return;
  if (clients.size === 0) return;

  const since = lastTeamsClaimUpdatedAt || new Date(Date.now() - 60 * 1000);

  try {
    const rows = await withRequest(connectionString, async (request) => {
      request.input('since', sql.DateTime2, since);
      const result = await request.query(`
        SELECT TOP 200
          EnquiryId,
          ClaimedBy,
          ClaimedAt,
          UpdatedAt
        FROM [instructions].[dbo].[TeamsBotActivityTracking]
        WHERE UpdatedAt >= @since
          AND EnquiryId IS NOT NULL
        ORDER BY UpdatedAt ASC
      `);
      return Array.isArray(result.recordset) ? result.recordset : [];
    }, 2);

    if (rows.length === 0) return;

    // Advance watermark before broadcasting to avoid repeat loops on broadcast errors.
    const maxUpdatedAt = rows.reduce((max, r) => {
      const t = r?.UpdatedAt ? new Date(r.UpdatedAt).getTime() : 0;
      return t > max ? t : max;
    }, since.getTime());
    lastTeamsClaimUpdatedAt = new Date(maxUpdatedAt);

    // Deduplicate to latest update per enquiryId in this batch.
    const latestByEnquiryId = new Map();
    for (const row of rows) {
      const enquiryId = row?.EnquiryId;
      if (enquiryId === null || enquiryId === undefined) continue;
      latestByEnquiryId.set(String(enquiryId), row);
    }

    for (const [enquiryId, row] of latestByEnquiryId.entries()) {
      const claimedBy = row?.ClaimedBy ? String(row.ClaimedBy) : '';
      const claimedAt = row?.ClaimedAt ? new Date(row.ClaimedAt).toISOString() : null;

      const prev = lastBroadcastClaimStateByEnquiryId.get(enquiryId);
      const nextKey = `${claimedBy}::${claimedAt || ''}`;
      if (prev === nextKey) {
        continue;
      }
      lastBroadcastClaimStateByEnquiryId.set(enquiryId, nextKey);

      // Treat both claim + unclaim as claim-type changes; UI can patch either direction.
      broadcastEnquiriesChanged({
        changeType: 'claim',
        enquiryId,
        claimedBy,
        claimedAt,
        source: 'teamsActivityTracking',
      });
    }
  } catch {
    // Non-blocking: failures should not take down SSE.
  }
}

function startTeamsClaimWatcher() {
  if (teamsClaimWatcherTimer) return;
  // Initialise watermark slightly in the past so a freshly-opened tab doesn't miss just-written claims.
  lastTeamsClaimUpdatedAt = new Date(Date.now() - 30 * 1000);
  teamsClaimWatcherTimer = setInterval(() => {
    pollTeamsClaimsOnce().catch(() => { /* ignore */ });
  }, 5000);
  if (typeof teamsClaimWatcherTimer.unref === 'function') {
    teamsClaimWatcherTimer.unref();
  }
}

function stopTeamsClaimWatcherIfIdle() {
  if (clients.size > 0) return;
  if (!teamsClaimWatcherTimer) return;
  try { clearInterval(teamsClaimWatcherTimer); } catch { /* ignore */ }
  teamsClaimWatcherTimer = null;
  lastTeamsClaimUpdatedAt = null;
  lastBroadcastClaimStateByEnquiryId.clear();
}

function writeEvent(res, { id, event, data }) {
  if (!res || res.writableEnded || res.destroyed) return false;

  try {
    if (id !== undefined) res.write(`id: ${id}\n`);
    if (event) res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') {
      try { res.flush(); } catch { /* ignore */ }
    }
    return true;
  } catch {
    return false;
  }
}

function broadcastEnquiriesChanged(payload) {
  const id = ++seq;
  const data = {
    type: 'enquiries.changed',
    ts: new Date().toISOString(),
    ...payload,
  };

  for (const client of clients) {
    const ok = writeEvent(client, { id, event: 'enquiries.changed', data });
    if (!ok) clients.delete(client);
  }
}

function attachEnquiriesStream(router) {
  router.get('/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    if (typeof res.flushHeaders === 'function') {
      try { res.flushHeaders(); } catch { /* ignore */ }
    }

    // Instruct EventSource to retry if disconnected
    try { res.write('retry: 10000\n\n'); } catch { /* ignore */ }

    // Connection ack
    writeEvent(res, {
      id: ++seq,
      event: 'connected',
      data: { type: 'connected', ts: new Date().toISOString() },
    });

    clients.add(res);

    // Start shared watcher only while there are active SSE clients.
    startTeamsClaimWatcher();

    // Heartbeat to keep connections alive behind proxies
    const heartbeat = setInterval(() => {
      try {
        if (!res.writableEnded && !res.destroyed) {
          res.write(': heartbeat\n\n');
          if (typeof res.flush === 'function') {
            try { res.flush(); } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
      stopTeamsClaimWatcherIfIdle();
      try {
        if (!res.writableEnded) res.end();
      } catch { /* ignore */ }
    });
  });
}

module.exports = {
  attachEnquiriesStream,
  broadcastEnquiriesChanged,
};
