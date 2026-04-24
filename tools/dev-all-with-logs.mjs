import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const logsRoot = path.join(cwd, 'logs', 'dev-all');
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
  { type: 'backend-restart', pattern: /restarting due to changes|nodemon restarting/i },
  { type: 'typecheck-error', pattern: /error|failed to compile|typescript error|ts\d{4}/i },
];

const dryRun = process.argv.includes('--dry-run');

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

async function main() {
  await mkdir(runDir, { recursive: true });

  const startedAtIso = new Date().toISOString();
  const startedAtMs = Date.now();
  const combinedLog = fs.createWriteStream(path.join(runDir, 'combined.log'), { flags: 'a' });
  const eventLog = fs.createWriteStream(path.join(runDir, 'events.jsonl'), { flags: 'a' });
  const milestoneLog = fs.createWriteStream(path.join(runDir, 'milestones.jsonl'), { flags: 'a' });
  const commandLogs = new Map();
  const children = new Map();
  let shuttingDown = false;

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

  announce(`writing logs to ${path.relative(cwd, runDir)}`);

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
          safeWrite(milestoneLog, JSON.stringify({
            at: new Date().toISOString(),
            relMs: relMs(startedAtMs),
            source: item.key,
            type: matcher.type,
            message,
          }));
        }
      }

      const tagColour = item.key === 'backend' ? colour.backend : colour.frontend;
      const target = streamName === 'stderr' ? process.stderr : process.stdout;
      target.write(`${colour.dim}${stamp(startedAtMs)}${colour.reset} ${tagColour}[${item.key}]${colour.reset} ${message}\n`);
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

  // ── Staggered launch: backend first, then frontend after port 8080 is up ──
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
  announce('backend spawned — waiting for port 8080 before starting frontend…');

  try {
    await waitForPort(8080, '127.0.0.1', 240_000);
    const readyMs = relMs(startedAtMs);
    announce(`backend ready on port 8080 (+${readyMs}ms) — starting frontend`);
  } catch {
    announce('backend port 8080 wait timed out — starting frontend anyway', 'error');
  }
  // Make sure the az warmup promise doesn't trigger an unhandled rejection.
  await azWarm.catch(() => {});

  spawnCommand(frontendItem);
  announce('frontend spawned — webpack compiling (this takes ~60-90s)…');

  // Watch for port 3000 to confirm frontend is ready (react-scripts' "Compiled
  // successfully" message uses terminal control chars that get swallowed by pipes)
  try {
    await waitForPort(3000, '127.0.0.1', 180_000);
    const readyMs = relMs(startedAtMs);
    announce(`frontend ready on port 3000 (+${readyMs}ms) — open http://localhost:3000`, 'frontend');
  } catch {
    announce('frontend port 3000 wait timed out — check for compilation errors', 'error');
  }
}

main().catch((error) => {
  const message = error instanceof Error
    ? ((process.env.LOG_LEVEL === 'debug' && error.stack) ? error.stack : error.message)
    : String(error);
  process.stderr.write(`${colour.error}[dev:all]${colour.reset} ${message}\n`);
  process.exit(1);
});