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

function createLinePump(childStream, onLine) {
  let buffer = '';

  childStream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      onLine(line);
    }
  });

  childStream.on('end', () => {
    if (buffer.length > 0) {
      onLine(buffer);
      buffer = '';
    }
  });
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
    const child = spawn(item.command, {
      cwd,
      env: process.env,
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
        shutdown(`${item.key} exited`, code ?? 0);
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

  spawnCommand(backendItem);
  announce('backend spawned — waiting for port 8080 before starting frontend…');

  try {
    await waitForPort(8080);
    const readyMs = relMs(startedAtMs);
    announce(`backend ready on port 8080 (+${readyMs}ms) — starting frontend`);
  } catch {
    announce('backend port 8080 wait timed out — starting frontend anyway', 'error');
  }

  spawnCommand(frontendItem);
}

main().catch((error) => {
  process.stderr.write(`${colour.error}[dev:all]${colour.reset} ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});