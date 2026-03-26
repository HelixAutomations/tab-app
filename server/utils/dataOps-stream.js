// Lightweight SSE channel for data-operations sync notifications.
// Payload-light: clients receive a "something changed" event and re-fetch via existing APIs.

const clients = new Set();
let seq = 0;

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

/**
 * Broadcast to all connected clients that a data-ops sync completed.
 * @param {{ dataset: 'collectedTime'|'wip', dateRange?: { start: string, end: string }, rowCount?: number, triggeredBy?: string }} payload
 */
function broadcastDataOpsChanged(payload) {
  const id = ++seq;
  const data = {
    type: 'dataOps.synced',
    ts: new Date().toISOString(),
    ...payload,
  };

  for (const client of clients) {
    const ok = writeEvent(client, { id, event: 'dataOps.synced', data });
    if (!ok) clients.delete(client);
  }
}

function attachDataOpsStream(router) {
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

    try { res.write('retry: 10000\n\n'); } catch { /* ignore */ }

    writeEvent(res, {
      id: ++seq,
      event: 'connected',
      data: { type: 'connected', ts: new Date().toISOString() },
    });

    clients.add(res);

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
      try {
        if (!res.writableEnded) res.end();
      } catch { /* ignore */ }
    });
  });
}

module.exports = {
  attachDataOpsStream,
  broadcastDataOpsChanged,
};
