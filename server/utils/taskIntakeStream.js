// server/utils/taskIntakeStream.js
//
// SSE channel for the Hub-native task intake processor.
// Publishes per-leg progress events (asana_started / asana_completed / clio_skipped / ...)
// so the bench composer can light up each leg in real time as the processor runs.
//
// Payloads carry STRUCTURAL METADATA ONLY: requestId, leg, outcome, durationMs,
// external ref ids (asana task gid, clio task id), counts. Never task names,
// descriptions, matter narratives, or any free-text the user typed.
//
// Pattern mirrors server/utils/dataOps-stream.js. The path is registered in
// server/utils/sseEndpoints.js so it bypasses gzip + requireUser.

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
 * Broadcast a single intake progress event to every connected client.
 * Filtering by requestId happens client-side: the bench subscribes to all
 * events and filters to the requestIds it cares about.
 *
 * @param {object} payload
 * @param {string} payload.requestId
 * @param {string} payload.event  e.g. 'received'|'processing'|'leg_started'|'leg_completed'|'leg_failed'|'completed'|'failed'
 * @param {string} [payload.leg]  'team_lookup'|'asana'|'clio'|'teams'|'email'|'finalise'
 * @param {string} [payload.outcome]  'ok'|'skipped'|'error'
 * @param {number} [payload.durationMs]
 * @param {object} [payload.ref]  Structural metadata: { asanaTaskGid?, clioTaskId?, count? }. Never free-text.
 * @param {string} [payload.message]  Short error class or skip reason. Never PII.
 */
function broadcastTaskIntake(payload) {
  const id = ++seq;
  const data = {
    type: 'tasks.intake',
    ts: new Date().toISOString(),
    ...payload,
  };
  for (const client of clients) {
    const ok = writeEvent(client, { id, event: 'tasks.intake', data });
    if (!ok) clients.delete(client);
  }
}

function attachTaskIntakeStream(req, res) {
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
    try { if (!res.writableEnded) res.end(); } catch { /* ignore */ }
  });
}

function _clientCount() {
  return clients.size;
}

module.exports = {
  attachTaskIntakeStream,
  broadcastTaskIntake,
  _clientCount,
};
