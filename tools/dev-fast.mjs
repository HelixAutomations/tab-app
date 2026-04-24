/**
 * `npm run dev:fast` — boots the dev stack without the heavy server-side
 * background work that's not useful when you just want to iterate on UI/code.
 *
 * What it skips (compared to `npm run dev:all`):
 *   - Data Operations scheduler (collected-time + WIP sync tiers)
 *   - Event poller (Clio → Hub)
 *   - All boot-time warmups (already gated by FORCE_BOOT_WARMUPS)
 *
 * What it keeps:
 *   - Hot reload (CRA + nodemon)
 *   - All HTTP routes, including App Insights and SSE
 *   - The `/api/dev/health` route used by `useDevServerBoot` to detect
 *     restarts and trigger SSE reconnects in the browser.
 *
 * Production safety: this script ONLY exports env flags that the server
 * reads behind `NODE_ENV !== 'production'` checks. None of these flags do
 * anything in a production build, so accidentally setting them would be
 * harmless.
 *
 * Usage:
 *   npm run dev:fast
 *
 * To re-enable a single subsystem, just unset its flag:
 *   set HELIX_LAZY_INIT=&& npm run dev:fast    (Windows)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'development',
  // Skip schedulers + pollers on boot. Server reads this in dev only.
  HELIX_LAZY_INIT: '1',
  // Belt-and-braces: we already gate aggressive warmups by NODE_ENV, but
  // make it explicit so the dev banner reflects what's actually running.
  FORCE_BOOT_WARMUPS: 'false',
  // Keep the Simple Browser flow snappy.
  BROWSER: 'none',
};

const child = spawn(
  process.platform === 'win32' ? 'node.exe' : 'node',
  [path.join(__dirname, 'dev-all-with-logs.mjs')],
  { env, stdio: 'inherit' }
);

child.on('exit', (code) => process.exit(code ?? 0));
