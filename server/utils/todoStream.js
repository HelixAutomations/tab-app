// Lightweight Server-Sent Events (SSE) channel for hub_todo card change notifications.
// Mirrors server/utils/annual-leave-stream.js exactly. Payload-light by design:
// clients should refresh via /api/todo on any event rather than try to merge deltas.
//
// Brief: docs/notes/STAGING_WALKTHROUGH_CALL_2026_05_11_TO_DO_STRIP_REALTIME_FOCUS_PLUS_PARKED_ITEMS.md
//
// Producers: server/utils/hubTodoLog.js (createCard, reconcileCard, reconcileAllByRef).
// Consumer:  src/tabs/home/Home.tsx via useRealtimeChannel('/api/todo/stream').

const { trackEvent, trackException } = require('./appInsights');

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

function broadcastTodoChanged(payload) {
  try {
    const id = ++seq;
    const data = {
      type: 'todo.changed',
      ts: new Date().toISOString(),
      ...payload,
    };
    for (const client of clients) {
      const ok = writeEvent(client, { id, event: 'todo.changed', data });
      if (!ok) clients.delete(client);
    }
  } catch (err) {
    try {
      trackException(err, { phase: 'broadcastTodoChanged' });
      trackEvent('Hub.Todo.Broadcast.Failed', {
        error: err?.message || String(err),
        changeType: String(payload?.changeType || ''),
      });
    } catch { /* ignore — never let telemetry crash a write path */ }
  }
}

function attachTodoStream(router) {
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

    try {
      trackEvent('Hub.Todo.Stream.Started', {
        subscribers: String(clients.size),
      });
    } catch { /* ignore */ }

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
  attachTodoStream,
  broadcastTodoChanged,
};
