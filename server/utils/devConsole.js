/**
 * Dev Console — structured, readable terminal output for local development.
 *
 * Replaces noisy morgan + scattered console.log with a single request log
 * that shows source (cache vs live), timing context, and production-realistic
 * indicators so the developer knows what they're looking at.
 *
 * Usage:
 *   const { devMiddleware, banner, annotate } = require('./utils/devConsole');
 *   app.use(devMiddleware);            // replaces morgan('dev')
 *   banner({ port, redis, sql });     // on startup
 *   annotate(res, { source, note }); // inside route handlers
 */

const isDev = process.env.NODE_ENV !== 'production';

// ── ANSI colours ───────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  dim:   '\x1b[2m',
  bold:  '\x1b[1m',
  // foreground
  grey:    '\x1b[90m',
  white:   '\x1b[37m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  cyan:    '\x1b[36m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  // background
  bgGreen:  '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed:    '\x1b[41m',
  bgCyan:   '\x1b[46m',
  bgBlue:   '\x1b[44m',
};

// ── Timing thresholds ──────────────────────────────────────────────
const FAST_MS  = 200;
const OK_MS    = 1000;
const SLOW_MS  = 3000;

function colourDuration(ms) {
  const str = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  if (ms <= FAST_MS) return `${c.green}${str}${c.reset}`;
  if (ms <= OK_MS)   return `${c.yellow}${str}${c.reset}`;
  if (ms <= SLOW_MS) return `${c.red}${str}${c.reset}`;
  return `${c.bold}${c.red}${str}${c.reset}`;
}

function colourStatus(code) {
  if (code < 300) return `${c.green}${code}${c.reset}`;
  if (code < 400) return `${c.cyan}${code}${c.reset}`;
  if (code < 500) return `${c.yellow}${code}${c.reset}`;
  return `${c.red}${code}${c.reset}`;
}

function colourMethod(method) {
  const m = method.padEnd(4);
  switch (method) {
    case 'GET':    return `${c.cyan}${m}${c.reset}`;
    case 'POST':   return `${c.magenta}${m}${c.reset}`;
    case 'PUT':    return `${c.yellow}${m}${c.reset}`;
    case 'DELETE': return `${c.red}${m}${c.reset}`;
    default:       return `${c.white}${m}${c.reset}`;
  }
}

// ── Source badge ────────────────────────────────────────────────────
// Routes call annotate(res, { source }) to tag where data came from.
const SOURCE_BADGES = {
  'memory':    `${c.bgGreen}${c.bold} MEM ${c.reset}`,
  'redis':     `${c.bgCyan}${c.bold} RDS ${c.reset}`,
  'sql':       `${c.bgBlue}${c.bold} SQL ${c.reset}`,
  'clio':      `${c.bgYellow}${c.bold} CLO ${c.reset}`,
  'graph':     `${c.bgBlue}${c.bold} GRF ${c.reset}`,
  'keyvault':  `${c.bgYellow}${c.bold} KV  ${c.reset}`,
  'stale':     `${c.bgRed}${c.bold} OLD ${c.reset}`,
  'sse':       `${c.dim}SSE${c.reset}`,
};

function sourceBadge(src) {
  if (!src) return '';
  return SOURCE_BADGES[src] || `${c.dim}[${src}]${c.reset}`;
}

// ── Production comparison tag ──────────────────────────────────────
// If a request is served from local cache but would hit SQL/Clio in prod,
// the route can set res._devNote to explain it.
function prodHint(ms, source) {
  if (!source) return '';
  if (source === 'memory' && ms < 10) {
    return `${c.dim} (prod: ~1-3s from Redis/SQL)${c.reset}`;
  }
  if (source === 'redis' && ms < 100) {
    return `${c.dim} (prod: similar — Redis cache)${c.reset}`;
  }
  return '';
}

// ── Paths to suppress completely ───────────────────────────────────
// These just create noise and tell you nothing useful.
const QUIET_PATHS = new Set([
  '/api/telemetry',
  '/api/release-notes',
]);

// Static asset patterns (only log when slow)
const STATIC_PATTERN = /^\/(static|ccls|favicon|manifest|asset-manifest|robots|service-worker)/;
const TELEMETRY_PATTERN = /^\/api\/telemetry/;

// ── Active request tracker (for concurrent view) ───────────────────
const inflight = new Map(); // requestId -> { method, path, start }
let requestSeq = 0;

// ── Middleware ──────────────────────────────────────────────────────
function devMiddleware(req, res, next) {
  if (!isDev) return next();

  // Use originalUrl (immutable) not req.path (mutated by sub-routers to be relative)
  const fullPath = req.originalUrl || req.url;

  // Skip completely silent paths
  if (QUIET_PATHS.has(fullPath) || TELEMETRY_PATTERN.test(fullPath)) {
    return next();
  }

  // Skip static assets unless they'll be slow
  if (STATIC_PATTERN.test(fullPath)) return next();

  const start = Date.now();
  const seq = ++requestSeq;
  const id = String(seq).padStart(3, ' ');

  // Track in-flight
  inflight.set(seq, { method: req.method, path: fullPath, start });

  // Show SSE connections opening
  const isSSE = fullPath.includes('/stream') || req.headers.accept === 'text/event-stream';
  if (isSSE) {
    console.log(`${c.dim}${id}${c.reset} ${colourMethod(req.method)} ${c.white}${fullPath}${c.reset} ${sourceBadge('sse')} ${c.dim}connected${c.reset}`);
    inflight.delete(seq);
    return next();
  }

  const originalEnd = res.end;
  res.end = function(...args) {
    const ms = Date.now() - start;
    inflight.delete(seq);

    const source = res._devSource || '';
    const note   = res._devNote || '';
    const badge  = sourceBadge(source);
    const hint   = prodHint(ms, source);

    // Path — shorten /api/ prefix for readability
    const shortPath = fullPath.replace(/^\/api\//, '/');

    // Build log line
    const parts = [
      `${c.dim}${id}${c.reset}`,
      colourStatus(res.statusCode),
      colourMethod(req.method),
      `${c.white}${shortPath}${c.reset}`,
      colourDuration(ms),
      badge,
      hint,
      note ? `${c.dim}${note}${c.reset}` : '',
    ].filter(Boolean);

    console.log(parts.join(' '));

    return originalEnd.apply(this, args);
  };

  next();
}

// ── Annotate helper (call from routes) ─────────────────────────────
/**
 * Tag a response with data source and optional note for the dev console.
 *
 *   annotate(res, { source: 'redis', note: 'TTL 10m, set 3m ago' });
 *   annotate(res, { source: 'sql', note: 'cold — no cache entry' });
 *   annotate(res, { source: 'memory', note: '2nd hit this session' });
 *
 * Valid sources: memory | redis | sql | clio | graph | keyvault | stale | sse
 */
function annotate(res, { source, note } = {}) {
  if (source) res._devSource = source;
  if (note)   res._devNote = note;
}

// ── Startup banner ─────────────────────────────────────────────────
function banner({ port, redis, sql, instructionsSql, clio, scheduler, eventPoller }) {
  if (!isDev) return;

  const line = '─'.repeat(58);
  const ok  = `${c.green}●${c.reset}`;
  const warn = `${c.yellow}●${c.reset}`;
  const fail = `${c.red}●${c.reset}`;
  const dot = (status) => status === true ? ok : status === false ? fail : warn;

  console.log('');
  console.log(`${c.dim}${line}${c.reset}`);
  console.log(`  ${c.bold}${c.cyan}HELIX HUB${c.reset}  ${c.dim}dev server${c.reset}`);
  console.log(`${c.dim}${line}${c.reset}`);
  console.log(`  ${c.dim}Port${c.reset}            ${c.white}${port}${c.reset}`);
  console.log(`  ${c.dim}Redis${c.reset}           ${dot(redis)} ${redis ? 'connected' : redis === false ? 'failed' : 'connecting...'}`);
  console.log(`  ${c.dim}Core SQL${c.reset}        ${dot(sql)} ${sql ? 'pool ready' : sql === false ? 'failed' : 'connecting...'}`);
  console.log(`  ${c.dim}Instructions SQL${c.reset} ${dot(instructionsSql)} ${instructionsSql ? 'pool ready' : instructionsSql === false ? 'failed' : 'connecting...'}`);
  console.log(`  ${c.dim}Clio creds${c.reset}      ${dot(clio)} ${clio ? 'pre-warmed' : clio === false ? 'cold (first call ~3s)' : 'warming...'}`);
  if (scheduler !== undefined) {
    console.log(`  ${c.dim}Scheduler${c.reset}       ${dot(scheduler)} ${scheduler ? 'running' : 'off'}`);
  }
  if (eventPoller !== undefined) {
    console.log(`  ${c.dim}Event poller${c.reset}    ${dot(eventPoller)} ${eventPoller ? `polling (${eventPoller}s)` : 'off'}`);
  }
  console.log(`${c.dim}${line}${c.reset}`);
  console.log(`  ${c.dim}Source badges:${c.reset} ${sourceBadge('memory')} memory  ${sourceBadge('redis')} redis  ${sourceBadge('sql')} sql  ${sourceBadge('clio')} clio`);
  console.log(`  ${c.dim}Timing:${c.reset} ${c.green}< 200ms${c.reset} ${c.yellow}< 1s${c.reset} ${c.red}< 3s${c.reset} ${c.bold}${c.red}> 3s${c.reset}`);
  console.log(`  ${c.dim}Telemetry + static assets hidden. Set LOG_LEVEL=debug for all.${c.reset}`);
  console.log(`${c.dim}${line}${c.reset}`);
  console.log('');
}

// ── Connection status updates (post-startup) ───────────────────────
function status(component, state, detail) {
  if (!isDev) return;
  const ok  = `${c.green}●${c.reset}`;
  const fail = `${c.red}●${c.reset}`;
  const dot = state ? ok : fail;
  const detailStr = detail ? ` ${c.dim}${detail}${c.reset}` : '';
  console.log(`  ${c.dim}[status]${c.reset} ${component} ${dot}${detailStr}`);
}

module.exports = {
  devMiddleware,
  banner,
  annotate,
  status,
  isDev,
};
