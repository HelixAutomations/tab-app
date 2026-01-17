// Lightweight Server-Sent Events (SSE) channel for future bookings change notifications.
// Intentionally payload-light: clients should refresh via existing API endpoints.

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

function broadcastFutureBookingsChanged(payload) {
  const id = ++seq;
  const data = {
    type: 'futureBookings.changed',
    ts: new Date().toISOString(),
    ...payload,
  };

  for (const client of clients) {
    const ok = writeEvent(client, { id, event: 'futureBookings.changed', data });
    if (!ok) clients.delete(client);
  }
}

function attachFutureBookingsStream(router) {
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
      try {
        if (!res.writableEnded) res.end();
      } catch { /* ignore */ }
    });
  });
}

module.exports = {
  attachFutureBookingsStream,
  broadcastFutureBookingsChanged,
};
