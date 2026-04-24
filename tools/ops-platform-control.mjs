#!/usr/bin/env node
/**
 * Helix Operations Platform — control plane (kill switches, status, cost)
 *
 * Single entry point for managing the helix-operations SQL platform without
 * having to remember `az` syntax or click through the Portal. Designed so a
 * panicked operator can disable the platform in seconds.
 *
 * Usage
 * -----
 *   node tools/ops-platform-control.mjs <command>
 *
 * Commands
 * --------
 *   status     — show server + DB state, SKU, firewall rule count, secrets
 *   pause      — manually pause the serverless DB (zero compute cost)
 *   resume     — resume the DB (next connection wakes it anyway)
 *   lockdown   — remove all firewall rules; DB unreachable
 *   unlock     — re-add AllowAzureServices + this machine's IP
 *   cost       — current month-to-date cost for the DB (best-effort)
 *   teardown   — DELETE the DB + server (interactive, requires --yes-really)
 *
 * Repo-level kill switch
 * ----------------------
 * Independent of all of the above, you can disable platform writes from
 * the Hub server by setting in .env:
 *     OPS_PLATFORM_ENABLED=false
 * The aiProposalLog helper (and any future ops platform helpers) check
 * this flag and degrade gracefully.
 *
 * Safety
 * ------
 * - All commands respect explicit subscription + RG + server name. Will
 *   not mutate other Helix resources.
 * - Destructive commands require explicit confirmation flag.
 * - Read-only commands never mutate.
 */

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const SUBSCRIPTION   = 'Helix Automations';
const RESOURCE_GROUP = 'operations';
const SERVER_NAME    = 'helix-operations-sql';
const DATABASE_NAME  = 'helix-operations';
const KEY_VAULT      = 'Helix-Keys';

function az(args, { capture = true } = {}) {
  const result = spawnSync('az', args, {
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    shell: true,
  });
  if (result.status !== 0 && capture) {
    const err = (result.stderr || '').trim();
    throw new Error(`az ${args.join(' ')} failed: ${err}`);
  }
  return capture ? (result.stdout || '').trim() : null;
}

function setSubscription() {
  az(['account', 'set', '--subscription', `"${SUBSCRIPTION}"`], { capture: false });
}

function status() {
  setSubscription();
  console.log('Helix Operations Platform — status');
  console.log('───────────────────────────────────');

  const serverJson = az([
    'sql', 'server', 'show',
    '--resource-group', RESOURCE_GROUP,
    '--name', SERVER_NAME,
    '-o', 'json',
  ]);
  const server = JSON.parse(serverJson);
  console.log(`  Server:    ${server.fullyQualifiedDomainName}`);
  console.log(`  Location:  ${server.location}`);
  console.log(`  Admin:     ${server.administratorLogin}`);

  const dbJson = az([
    'sql', 'db', 'show',
    '--resource-group', RESOURCE_GROUP,
    '--server', SERVER_NAME,
    '--name', DATABASE_NAME,
    '-o', 'json',
  ]);
  const db = JSON.parse(dbJson);
  const sizeGb = (db.maxSizeBytes / (1024 ** 3)).toFixed(1);
  console.log(`  DB:        ${db.name}`);
  console.log(`  Status:    ${db.status}        ${db.status === 'Paused' ? '(no compute cost)' : ''}`);
  console.log(`  SKU:       ${db.currentServiceObjectiveName}`);
  console.log(`  vCores:    ${db.minCapacity}–${db.currentSku?.capacity ?? '?'} (auto-pause ${db.autoPauseDelay} min)`);
  console.log(`  Max size:  ${sizeGb} GB`);

  const rulesJson = az([
    'sql', 'server', 'firewall-rule', 'list',
    '--resource-group', RESOURCE_GROUP,
    '--server', SERVER_NAME,
    '-o', 'json',
  ]);
  const rules = JSON.parse(rulesJson);
  console.log(`  Firewall:  ${rules.length} rule${rules.length === 1 ? '' : 's'}`);
  for (const r of rules) {
    console.log(`               - ${r.name}: ${r.startIpAddress} → ${r.endIpAddress}`);
  }
  if (rules.length === 0) {
    console.log('               🔒 LOCKDOWN — DB unreachable from any source.');
  }

  // Secrets in Key Vault
  try {
    const secrets = ['operations-sql-admin-password', 'operations-sql-connection-string'];
    console.log('  Vault:     Helix-Keys');
    for (const s of secrets) {
      const exists = az([
        'keyvault', 'secret', 'show',
        '--vault-name', KEY_VAULT,
        '--name', s,
        '--query', 'attributes.enabled',
        '-o', 'tsv',
      ]);
      console.log(`               - ${s}: ${exists === 'true' ? '✓' : '✗'}`);
    }
  } catch {
    console.log('  Vault:     (could not read; check access policy)');
  }

  console.log('');
  console.log('Repo-level switch:');
  const enabled = process.env.OPS_PLATFORM_ENABLED;
  console.log(`  OPS_PLATFORM_ENABLED = ${enabled ?? '(unset)'}`);
  if (enabled === 'false') {
    console.log('  ⚠ Hub will skip all writes to this DB.');
  }
}

function pause() {
  setSubscription();
  console.log(`Pausing ${DATABASE_NAME}...`);
  az([
    'sql', 'db', 'pause',
    '--resource-group', RESOURCE_GROUP,
    '--server', SERVER_NAME,
    '--name', DATABASE_NAME,
  ], { capture: false });
  console.log('Paused. Compute cost = £0/hr until next connection.');
}

function resume() {
  setSubscription();
  console.log(`Resuming ${DATABASE_NAME}...`);
  az([
    'sql', 'db', 'resume',
    '--resource-group', RESOURCE_GROUP,
    '--server', SERVER_NAME,
    '--name', DATABASE_NAME,
  ], { capture: false });
  console.log('Online.');
}

function lockdown() {
  setSubscription();
  console.log('🔒 Lockdown: removing all firewall rules.');
  const rulesJson = az([
    'sql', 'server', 'firewall-rule', 'list',
    '--resource-group', RESOURCE_GROUP,
    '--server', SERVER_NAME,
    '-o', 'json',
  ]);
  const rules = JSON.parse(rulesJson);
  for (const r of rules) {
    az([
      'sql', 'server', 'firewall-rule', 'delete',
      '--resource-group', RESOURCE_GROUP,
      '--server', SERVER_NAME,
      '--name', r.name,
    ], { capture: false });
    console.log(`  deleted: ${r.name}`);
  }
  console.log('Locked down. DB exists, no source can connect. Run `unlock` to restore.');
}

async function unlock() {
  setSubscription();
  console.log('Unlocking: re-adding AllowAzureServices + this machine.');
  az([
    'sql', 'server', 'firewall-rule', 'create',
    '--resource-group', RESOURCE_GROUP,
    '--server', SERVER_NAME,
    '--name', 'AllowAzureServices',
    '--start-ip-address', '0.0.0.0',
    '--end-ip-address', '0.0.0.0',
  ], { capture: false });
  // Best-effort: add this machine
  try {
    const ip = (await fetchPublicIp()) ?? null;
    if (ip) {
      az([
        'sql', 'server', 'firewall-rule', 'create',
        '--resource-group', RESOURCE_GROUP,
        '--server', SERVER_NAME,
        '--name', 'DevWorkstation',
        '--start-ip-address', ip,
        '--end-ip-address', ip,
      ], { capture: false });
      console.log(`  added DevWorkstation: ${ip}`);
    }
  } catch (e) {
    console.warn(`  could not detect IP: ${e.message}`);
  }
  console.log('Unlocked.');
}

async function fetchPublicIp() {
  try {
    const res = await fetch('https://api.ipify.org');
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

function cost() {
  setSubscription();
  console.log('Querying month-to-date cost...');
  // az consumption isn't 100% reliable; best effort
  try {
    const json = az([
      'consumption', 'usage', 'list',
      '--start-date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      '--end-date', new Date().toISOString().slice(0, 10),
      '--query', `[?contains(instanceName, '${DATABASE_NAME}') || contains(instanceName, '${SERVER_NAME}')].{name:instanceName, cost:pretaxCost, currency:currency}`,
      '-o', 'json',
    ]);
    const rows = JSON.parse(json || '[]');
    if (rows.length === 0) {
      console.log('No usage records yet (DB may have only just been created).');
      return;
    }
    const total = rows.reduce((s, r) => s + Number(r.cost || 0), 0);
    const currency = rows[0]?.currency || 'GBP';
    console.log(`  Records: ${rows.length}`);
    console.log(`  MTD total: ${total.toFixed(2)} ${currency}`);
  } catch (e) {
    console.warn(`Could not query consumption API: ${e.message}`);
    console.log('Tip: open Cost Analysis in the Azure Portal scoped to RG="operations".');
  }
}

async function teardown() {
  const args = process.argv.slice(3);
  if (!args.includes('--yes-really')) {
    console.error('teardown requires --yes-really to proceed.');
    console.error('It will DELETE the DB and server. Data is unrecoverable.');
    process.exit(1);
  }
  const rl = createInterface({ input: stdin, output: stdout });
  const typed = await rl.question(`Type the database name to confirm (${DATABASE_NAME}): `);
  rl.close();
  if (typed.trim() !== DATABASE_NAME) {
    console.error('Mismatch. Aborted.');
    process.exit(1);
  }
  setSubscription();
  console.log('Deleting database...');
  az([
    'sql', 'db', 'delete',
    '--resource-group', RESOURCE_GROUP,
    '--server', SERVER_NAME,
    '--name', DATABASE_NAME,
    '--yes',
  ], { capture: false });
  console.log('Deleting server...');
  az([
    'sql', 'server', 'delete',
    '--resource-group', RESOURCE_GROUP,
    '--name', SERVER_NAME,
    '--yes',
  ], { capture: false });
  console.log('Teardown complete. Key Vault secrets remain (soft-deleted, recoverable for 90d).');
  console.log('To purge secrets: az keyvault secret purge --vault-name Helix-Keys --name operations-sql-admin-password');
}

const cmd = process.argv[2];
const map = { status, pause, resume, lockdown, unlock, cost, teardown };
if (!cmd || !map[cmd]) {
  console.log('Usage: node tools/ops-platform-control.mjs <command>');
  console.log('Commands: status | pause | resume | lockdown | unlock | cost | teardown');
  process.exit(cmd ? 1 : 0);
}

try {
  const result = map[cmd]();
  if (result instanceof Promise) await result;
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
