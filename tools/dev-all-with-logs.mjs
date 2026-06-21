import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const logsRoot = path.join(cwd, 'logs', 'dev-all');
const devCleanScript = path.join(cwd, 'tools', 'dev-clean.mjs');
const now = new Date();
const runId = now.toISOString().replace(/[.:]/g, '-');
const runDir = path.join(logsRoot, runId);
const latestFile = path.join(logsRoot, 'latest-run.json');

const commands = [
  {
    key: 'backend',
    command: 'npm run start:server:watch',
    logFile: 'backend.log',
  },
  {
    key: 'frontend',
    command: 'npm run start:dev',
    logFile: 'frontend.log',
  },
];

const milestoneMatchers = [
  { type: 'frontend-compiled', pattern: /compiled successfully|webpack compiled successfully/i },
  { type: 'frontend-starting', pattern: /starting the development server/i },
  { type: 'backend-ready', pattern: /listening on|server listening|app listening|running on port|server started/i },
  { type: 'backend-restart', pattern: /\[server-watch .*\] restart triggered by|restarting due to changes|nodemon restarting/i },
  { type: 'typecheck-error', pattern: /error|failed to compile|typescript error|ts\d{4}/i },
];

const dryRun = process.argv.includes('--dry-run');
const withDataOpsScheduler = process.argv.includes('--with-dataops');
const dataOpsSchedulerEnv = withDataOpsScheduler
  ? '1'
  : (process.env.HELIX_ENABLE_DATAOPS_SCHEDULER ?? '0');

const DEFAULT_AUTO_CLEAN_THRESHOLD_MB = 2048;

function parseAutoCleanThresholdMb(argv, env) {
  const arg = argv.find((value) => value.startsWith('--auto-clean-threshold-mb='));
  const argValue = arg ? Number.parseFloat(arg.split('=')[1]) : NaN;
  const envValue = Number.parseFloat(env.HELIX_DEV_AUTO_CLEAN_THRESHOLD_MB || '');

  if (Number.isFinite(argValue) && argValue > 0) return argValue;
  if (Number.isFinite(envValue) && envValue > 0) return envValue;
  return DEFAULT_AUTO_CLEAN_THRESHOLD_MB;
}

const autoCleanDisabled = process.argv.includes('--no-auto-clean')
  || process.env.HELIX_DEV_AUTO_CLEAN === '0';
const forceFullClean = process.argv.includes('--clean-full')
  || process.env.HELIX_DEV_CLEAN_MODE === 'full';
const autoCleanThresholdMb = parseAutoCleanThresholdMb(process.argv, process.env);

const DEFAULT_IDLE_TIMEOUT_MINUTES = 120;

function parseIdleTimeoutMinutes(argv, env) {
  const disableFlag = argv.includes('--no-idle-timeout') || env.HELIX_DEV_IDLE_TIMEOUT_MINUTES === '0';
  if (disableFlag) return 0;

  const arg = argv.find((value) => value.startsWith('--idle-timeout-minutes='));
  const argValue = arg ? Number.parseInt(arg.split('=')[1], 10) : NaN;
  const envValue = Number.parseInt(env.HELIX_DEV_IDLE_TIMEOUT_MINUTES || '', 10);

  if (Number.isFinite(argValue) && argValue >= 0) return argValue;
  if (Number.isFinite(envValue) && envValue >= 0) return envValue;
  return DEFAULT_IDLE_TIMEOUT_MINUTES;
}

const idleTimeoutMinutes = parseIdleTimeoutMinutes(process.argv, process.env);
const idleTimeoutMs = idleTimeoutMinutes > 0 ? idleTimeoutMinutes * 60_000 : 0;

// Terminal noise filter — defaults on. Set HELIX_DEV_TERMINAL_VERBOSE=1
// (or pass --verbose) to see every line. Filtered lines are still written
// to logs/dev-all/<run>/backend.log and combined.log.
const verboseTerminal = process.argv.includes('--verbose')
  || process.env.HELIX_DEV_TERMINAL_VERBOSE === '1';

const TERMINAL_NOISE_PATTERNS = [
  // Health polls (UI ping every couple of seconds)
  /\sGET\s+\/(?:api\/)?dev\/health/i,
  /\sGET\s+\/(?:api\/)?health\s/i,
  // SSE connect/disconnect chatter — fine in the log, useless in terminal
  /SSE connected\s*$/i,
  // Boot-timing micro landmarks (keep the banner; suppress the +Nms steps)
  /\[boot-timing\]/i,
  // AppInsights & Clio-webhook env notices (known + intentional in dev)
  /\[AppInsights\] No connection string/i,
  /\[clio-webhook\] CLIO_WEBHOOK_SECRET not set/i,
  /\[Secrets\] .*resolved via Key Vault/i,
  // Repeated team-data summary line
  /\[teamData\] Summary \{/i,
  // Webpack-dev-server deprecation warnings (one-time, can't be silenced upstream)
  /DEP_WEBPACK_DEV_SERVER_/i,
  /\[DEP\d{4}\]\s+DeprecationWarning/i,
  /\(Use `node --trace-deprecation/i,
  /\(node:\d+\)\s*\[DEP_/i,
  // Nodemon banner (keep "restarting due to changes", drop the noise)
  /\[nodemon\] (?:to restart|watching path|watching extensions|3\.1\.\d+)/i,
  // CRA dev-server "you can now view" preamble (the "Compiled successfully"
  // line above it is the real signal)
  /You can now view teamhub/i,
  /^Starting the development server\.\.\.$/i,
  /^Compiled successfully!?$/i,
  /^webpack compiled successfully$/i,
  /^(?:Local|On Your Network):/i,
  /^Note that the development build is not optimized\.?$/i,
  /^To create a production build, use npm run build\.?$/i,
  // CRA HPM proxy created banner
  /\[HPM\] Proxy created:/i,
  // CRACO still probes for CRA's ESLintWebpackPlugin even when dev-all
  // intentionally disables it for faster local compiles.
  /Cannot find ESLint plugin \(ESLintWebpackPlugin\)\./i,
  // HMR ECONNRESET storm during nodemon restart — already obvious from the
  // "[nodemon] restarting" line; the per-stream errors are pure scroll-fill.
  /\[HPM\] ECONNRESET/i,
  /\[HPM\] Error occurred while proxying request.*ECONNRESET/i,
  /SSE proxy error for.*ECONNRESET/i,
  /Proxy error for .*ECONNRESET/i,
  /at TCP\.onStreamRead/i,
  /errno: -4077/i,
  /code: 'ECONNRESET'/i,
  /syscall: 'read'/i,
];

// Activity watchdog should ignore passive background noise so an abandoned
// browser tab doesn't keep the whole dev stack alive forever.
const IDLE_ACTIVITY_IGNORE_PATTERNS = [
  ...TERMINAL_NOISE_PATTERNS,
  /\[status\]\s+Data scheduler/i,
  /\[status\]\s+Event poller/i,
  /\s(?:GET|POST)\s+\/todo\?/i,
  /\sGET\s+\/home-journey\?.*&since=/i,
  /\sGET\s+\/reporting\/management-readiness/i,
  /\sGET\s+\/reporting\/management-datasets\?datasets=recoveredFeesSummary/i,
  /\sPOST\s+\/ccl\/batch-status/i,
];

function shouldSuppressInTerminal(message) {
  if (verboseTerminal) return false;
  return TERMINAL_NOISE_PATTERNS.some((re) => re.test(message));
}

function shouldCountAsActivity(message) {
  return !IDLE_ACTIVITY_IGNORE_PATTERNS.some((re) => re.test(message));
}

const colour = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  backend: '\u001b[36m',
  frontend: '\u001b[35m',
  system: '\u001b[33m',
  error: '\u001b[31m',
};

function relMs(startedAt) {
  return Date.now() - startedAt;
}

function stamp(startedAt) {
  const elapsed = String(relMs(startedAt)).padStart(6, ' ');
  return `+${elapsed}ms`;
}

function safeWrite(stream, line) {
  stream.write(`${line}\n`);
}

function toLogLine(startedAt, source, streamName, message) {
  return `${new Date().toISOString()} ${stamp(startedAt)} [${source}:${streamName}] ${message}`;
}

// Strip ANSI escape sequences so milestone matchers work on clean text
const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '').replace(/\x1B\].*?\x07/g, '');

function createLinePump(childStream, onLine) {
  let buffer = '';

  childStream.on('data', (chunk) => {
    buffer += chunk.toString();
    // react-scripts uses bare \r (carriage return) to overwrite lines in-place.
    // Split on \r\n, \n, OR bare \r so we don't swallow "Compiled successfully".
    const lines = buffer.split(/\r\n|\n|\r/);
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      const line = stripAnsi(raw).trim();
      if (line.length > 0) {
        onLine(line);
      }
    }
  });

  childStream.on('end', () => {
    if (buffer.length > 0) {
      const line = stripAnsi(buffer).trim();
      if (line.length > 0) {
        onLine(line);
      }
      buffer = '';
    }
  });
}

function isPortListening(port, host = '127.0.0.1', timeoutMs = 250) {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host });
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      sock.destroy();
      resolve(result);
    };

    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
  });
}

async function assertPortsAvailable(ports) {
  const occupied = [];

  for (const port of ports) {
    if (await isPortListening(port)) {
      occupied.push(port);
    }
  }

  if (occupied.length > 0) {
    throw new Error(
      `Port${occupied.length > 1 ? 's' : ''} ${occupied.join(', ')} ${occupied.length > 1 ? 'are' : 'is'} already in use before starting dev:all. Stop the existing listener${occupied.length > 1 ? 's' : ''} and retry.`
    );
  }
}

function runDevClean(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [devCleanScript, ...args], {
      cwd,
      stdio: 'inherit',
      windowsHide: false,
    });

    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`dev-clean exited with code ${code ?? 'null'}`));
    });
    child.once('error', reject);
  });
}

async function runAutoCleanPreflight() {
  if (autoCleanDisabled) {
    process.stdout.write('[dev:all] auto-clean skipped (HELIX_DEV_AUTO_CLEAN=0 or --no-auto-clean).\n');
    return;
  }

  if (forceFullClean) {
    process.stdout.write('[dev:all] auto-clean: clearing logs and full webpack/build cache before boot.\n');
  } else {
    process.stdout.write(`[dev:all] auto-clean: clearing logs; cache/build only if recoverable > ${autoCleanThresholdMb} MB. Use --clean-full for a full wipe.\n`);
  }

  await runDevClean(['--logs-only', '--yes']);
  const heavyArgs = forceFullClean
    ? ['--keep-logs', '--yes']
    : ['--keep-logs', '--yes', `--if-over-mb=${autoCleanThresholdMb}`];
  await runDevClean(heavyArgs);
}

async function main() {
  if (!dryRun) {
    await assertPortsAvailable([8080, 3000]);
    await runAutoCleanPreflight();
  }

  await mkdir(runDir, { recursive: true });

  const startedAtIso = new Date().toISOString();
  const startedAtMs = Date.now();
  const combinedLog = fs.createWriteStream(path.join(runDir, 'combined.log'), { flags: 'a' });
  const eventLog = fs.createWriteStream(path.join(runDir, 'events.jsonl'), { flags: 'a' });
  const milestoneLog = fs.createWriteStream(path.join(runDir, 'milestones.jsonl'), { flags: 'a' });
  const commandLogs = new Map();
  const children = new Map();
  const milestoneWaiters = new Map();
  let shuttingDown = false;
  let idleTimer = null;
  let lastActivityAt = Date.now();
  let lastActivityLabel = 'runner start';

  for (const item of commands) {
    commandLogs.set(item.key, fs.createWriteStream(path.join(runDir, item.logFile), { flags: 'a' }));
  }

  const session = {
    startedAt: startedAtIso,
    cwd,
    runId,
    runDir,
    commands,
    dryRun,
    pid: process.pid,
  };

  await writeFile(path.join(runDir, 'session.json'), JSON.stringify(session, null, 2));
  await writeFile(latestFile, JSON.stringify({ runId, runDir, startedAt: startedAtIso }, null, 2));

  const announce = (message, tone = 'system') => {
    const prefix = `${colour[tone] || ''}[dev:all]${colour.reset}`;
    process.stdout.write(`${prefix} ${message}\n`);
    safeWrite(combinedLog, `${new Date().toISOString()} ${stamp(startedAtMs)} [system] ${message}`);
  };

  const formatIdleDuration = (ms) => {
    const totalMinutes = Math.max(1, Math.round(ms / 60_000));
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  };

  const scheduleIdleShutdown = () => {
    if (idleTimeoutMs <= 0 || shuttingDown) return;
    if (idleTimer) clearTimeout(idleTimer);

    const remainingMs = Math.max(0, idleTimeoutMs - (Date.now() - lastActivityAt));
    idleTimer = setTimeout(() => {
      const idleForMs = Date.now() - lastActivityAt;
      if (idleForMs < idleTimeoutMs) {
        scheduleIdleShutdown();
        return;
      }
      shutdown(
        `idle timeout (${formatIdleDuration(idleForMs)} since ${lastActivityLabel})`,
        0,
      );
    }, remainingMs + 50);
    idleTimer.unref?.();
  };

  const recordActivity = (label) => {
    if (idleTimeoutMs <= 0 || shuttingDown) return;
    lastActivityAt = Date.now();
    lastActivityLabel = label;
    scheduleIdleShutdown();
  };

  function waitForMilestone(type, timeoutMs = 120_000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        milestoneWaiters.delete(type);
        reject(new Error(`Timed out waiting for milestone ${type}`));
      }, timeoutMs);

      milestoneWaiters.set(type, {
        resolve: (payload) => {
          clearTimeout(timeoutId);
          milestoneWaiters.delete(type);
          resolve(payload);
        },
      });
    });
  }

  announce(`writing logs to ${path.relative(cwd, runDir)}`);
  if (!verboseTerminal) {
    announce('terminal quiet mode on (health/SSE/boot-timing hidden) — full lines in backend.log. Pass --verbose for everything.');
  }
  if (idleTimeoutMs > 0) {
    announce(`idle auto-shutdown enabled (${idleTimeoutMinutes}m). Set HELIX_DEV_IDLE_TIMEOUT_MINUTES=0 or pass --no-idle-timeout to disable.`);
  }
  announce(dataOpsSchedulerEnv === '1'
    ? 'DataOps scheduler enabled for this local run.'
    : 'DataOps scheduler skipped locally. Use --with-dataops only when working on report sync.');

  if (dryRun) {
    announce('dry run enabled; no child processes started');
    combinedLog.end();
    eventLog.end();
    milestoneLog.end();
    for (const stream of commandLogs.values()) {
      stream.end();
    }
    return;
  }

  await assertPortsAvailable([8080, 3000]);

  const shutdown = (reason, exitCode = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    announce(`shutting down (${reason})`, exitCode === 0 ? 'system' : 'error');

    for (const child of children.values()) {
      if (!child.killed) {
        child.kill('SIGINT');
      }
    }

    setTimeout(() => {
      for (const child of children.values()) {
        if (!child.killed) {
          child.kill('SIGTERM');
        }
      }
    }, 1500).unref();

    setTimeout(() => {
      combinedLog.end();
      eventLog.end();
      milestoneLog.end();
      for (const stream of commandLogs.values()) {
        stream.end();
      }
      process.exit(exitCode);
    }, 1800).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT', 0));
  process.on('SIGTERM', () => shutdown('SIGTERM', 0));
  process.stdin.on('data', () => recordActivity('terminal input'));
  scheduleIdleShutdown();

  // ── Helper: spawn a command and wire up logging ──────────────────────
  function spawnCommand(item) {
    // Frontend gets BROWSER=none so CRA doesn't spawn an extra browser tab
    // that competes with the VS Code Simple Browser, and FAST_REFRESH=true
    // to ensure React Refresh isn't disabled by some inherited env var.
    // GENERATE_SOURCEMAP=false skips the slow full sourcemap build (webpack
    // still gives cheap eval maps via devtool, so devtools debugging works).
    // DISABLE_ESLINT_PLUGIN=true removes the 10–30s ESLint pass from every
    // compile — VS Code's ESLint extension still lints in-editor, and
    // `npm run lint` still works on demand. TS errors keep surfacing.
    const childEnv = item.key === 'frontend'
      ? {
          ...process.env,
          BROWSER: 'none',
          FAST_REFRESH: 'true',
          GENERATE_SOURCEMAP: process.env.GENERATE_SOURCEMAP ?? 'false',
          DISABLE_ESLINT_PLUGIN: process.env.DISABLE_ESLINT_PLUGIN ?? 'true',
        }
      : {
          ...process.env,
          // dev:all is the explicit opt-in for background scheduler/poller work.
          HELIX_ENABLE_BACKGROUND: process.env.HELIX_ENABLE_BACKGROUND ?? (process.env.HELIX_LAZY_INIT === '1' ? '0' : '1'),
          HELIX_ENABLE_DATAOPS_SCHEDULER: dataOpsSchedulerEnv,
          // Print elapsed-ms landmarks during boot so we can see what's slow
          // across nodemon restarts. Set HELIX_BOOT_TIMING=0 to silence.
          HELIX_BOOT_TIMING: process.env.HELIX_BOOT_TIMING ?? '1',
          // Node's libuv threadpool defaults to 4, which serialises
          // Key Vault/Redis/SQL/disk I/O during warmup. Bumping to 16
          // lets the async hydration tasks overlap properly.
          UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE ?? '16',
        };
    const child = spawn(item.command, {
      cwd,
      env: childEnv,
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
      windowsHide: false,
    });

    children.set(item.key, child);
    const childLog = commandLogs.get(item.key);

    const writeEvent = (streamName, message) => {
      const line = toLogLine(startedAtMs, item.key, streamName, message);
      safeWrite(childLog, line);
      safeWrite(combinedLog, line);
      safeWrite(eventLog, JSON.stringify({
        at: new Date().toISOString(),
        relMs: relMs(startedAtMs),
        source: item.key,
        stream: streamName,
        message,
      }));

      for (const matcher of milestoneMatchers) {
        if (matcher.pattern.test(message)) {
          const payload = {
            at: new Date().toISOString(),
            relMs: relMs(startedAtMs),
            source: item.key,
            type: matcher.type,
            message,
          };
          safeWrite(milestoneLog, JSON.stringify({
            ...payload,
          }));
          const waiter = milestoneWaiters.get(matcher.type);
          if (waiter) {
            waiter.resolve(payload);
          }
        }
      }

      if (shouldCountAsActivity(message)) {
        recordActivity(`${item.key}:${message.slice(0, 80)}`);
      }

      const tagColour = item.key === 'backend' ? colour.backend : colour.frontend;
      const target = streamName === 'stderr' ? process.stderr : process.stdout;
      // Quiet mode: skip noisy lines from the terminal echo only — the full
      // text is still in the per-process log file and combined.log.
      if (!shouldSuppressInTerminal(message)) {
        target.write(`${colour.dim}${stamp(startedAtMs)}${colour.reset} ${tagColour}[${item.key}]${colour.reset} ${message}\n`);
      }
    };

    createLinePump(child.stdout, (line) => writeEvent('stdout', line));
    createLinePump(child.stderr, (line) => writeEvent('stderr', line));

    child.on('exit', (code, signal) => {
      const status = `process exited with code=${code ?? 'null'} signal=${signal ?? 'null'}`;
      writeEvent('system', status);
      if (!shuttingDown) {
        shutdown(`${item.key} exited unexpectedly`, code === 0 ? 1 : code ?? 1);
      }
    });

    child.on('error', (error) => {
      writeEvent('system', `failed to start: ${error.message}`);
      if (!shuttingDown) {
        shutdown(`${item.key} failed to start`, 1);
      }
    });

    return child;
  }

  // ── Helper: wait for a TCP port to accept connections ────────────────
  function waitForPort(port, host = '127.0.0.1', timeoutMs = 120_000) {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      let resolved = false;

      function tryConnect() {
        if (resolved) return;
        if (Date.now() > deadline) {
          resolved = true;
          reject(new Error(`Timed out waiting for port ${port}`));
          return;
        }

        const sock = createConnection({ port, host });

        sock.once('connect', () => {
          resolved = true;
          sock.destroy();
          resolve();
        });

        sock.once('error', () => {
          sock.destroy();
          setTimeout(tryConnect, 250);
        });
      }

      tryConnect();
    });
  }

  // ── Parallel launch: backend + frontend start together so cold backend
  // stalls do not prevent webpack from compiling in the background. ──
  const backendItem = commands.find((c) => c.key === 'backend');
  const frontendItem = commands.find((c) => c.key === 'frontend');

  // Pre-warm az CLI token for Key Vault in the background before spawning
  // backend. If the token is stale, @azure/identity inside Node can stall
  // for 60–200s. Refreshing here is visible and fast (~2–5s).
  const azWarm = (async () => {
    try {
      const t0 = Date.now();
      const az = spawn('az', ['account', 'get-access-token', '--resource', 'https://vault.azure.net', '--output', 'none'], {
        shell: true,
        stdio: 'ignore',
      });
      await new Promise((resolve) => {
        az.once('exit', resolve);
        az.once('error', resolve);
      });
      announce(`az token pre-warmed (+${Date.now() - t0}ms)`);
    } catch {
      // best-effort; backend will fall back to its own auth path
    }
  })();

  spawnCommand(backendItem);
  announce('backend spawned — starting frontend in parallel while backend warms…');

  spawnCommand(frontendItem);
  announce('frontend spawned — webpack compiling (this now overlaps backend warmup)…');

  const backendReady = waitForPort(8080, '127.0.0.1', 240_000)
    .then(() => {
      const readyMs = relMs(startedAtMs);
      announce(`backend ready on port 8080 (+${readyMs}ms)`);
    })
    .catch(() => {
      announce('backend port 8080 wait timed out — check backend logs', 'error');
    });

  const frontendReady = waitForMilestone('frontend-compiled', 180_000)
    .then(() => {
      const readyMs = relMs(startedAtMs);
      announce(`frontend compiled and ready on port 3000 (+${readyMs}ms) — open http://localhost:3000`, 'frontend');
    })
    .catch(() => {
      announce('frontend compile wait timed out — check for compilation errors', 'error');
    });

  // Make sure the az warmup promise does not trigger an unhandled rejection.
  await Promise.allSettled([backendReady, frontendReady, azWarm.catch(() => {})]);
}

main().catch((error) => {
  const message = error instanceof Error
    ? ((process.env.LOG_LEVEL === 'debug' && error.stack) ? error.stack : error.message)
    : String(error);
  process.stderr.write(`${colour.error}[dev:all]${colour.reset} ${message}\n`);
  process.exit(1);
});