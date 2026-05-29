/**
 * Server-side wrapper around tools/run-matter-oneoff.mjs.
 *
 * The CLI is the source of truth for the matter-opening replay chain. This
 * wrapper spawns it in a child process so we do not have to refactor the
 * script. Always defaults to --dry-run; the caller must explicitly opt into
 * a live replay.
 *
 * Returns the JSON payload the CLI prints on dry-run, or the raw stdout text
 * on a live run.
 */

const path = require('path');
const { spawn } = require('child_process');

const INSTRUCTION_REF_PATTERN = /^[A-Z]+-?\d+-\d+$/i;
const INITIALS_PATTERN = /^[A-Z]{2,8}$/i;
const DEFAULT_TIMEOUT_MS = 120000;

function appendCliOption(args, name, value) {
  const raw = String(value ?? '').trim();
  if (raw) args.push(name, raw);
}

function validateInstructionRef(value) {
  const raw = String(value || '').trim();
  if (!INSTRUCTION_REF_PATTERN.test(raw)) {
    const err = new Error('invalid_instruction_ref');
    err.userMessage = 'Instruction ref must look like HLX-12345-67890';
    throw err;
  }
  return raw.toUpperCase().startsWith('HLX-') ? raw.toUpperCase() : raw.toUpperCase();
}

function validateInitials(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!INITIALS_PATTERN.test(raw)) {
    const err = new Error('invalid_initials');
    err.userMessage = 'Initials must be 2-8 letters';
    throw err;
  }
  return raw;
}

/**
 * @param {Object} options
 * @param {string} options.instructionRef
 * @param {string} options.initials
 * @param {boolean} [options.dryRun=true]
 * @param {string} [options.baseUrl] Optional override; defaults to the CLI default.
 * @param {Object} [options.overrides]
 * @param {string} [options.overrides.feeEarner]
 * @param {string} [options.overrides.originatingSolicitor]
 * @param {string} [options.overrides.supervisingPartner]
 * @param {string} [options.overrides.practiceArea]
 * @param {string} [options.overrides.description]
 * @param {string} [options.overrides.source]
 * @param {string} [options.matterRequestId]
 * @param {Object} [options.identity]
 * @param {string} [options.identity.email]
 * @param {string} [options.identity.entraId]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ ok: boolean, dryRun: boolean, output: any, stderr: string, exitCode: number }>}
 */
function runMatterReplay({ instructionRef, initials, dryRun = true, baseUrl, overrides = {}, matterRequestId, identity = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const ref = validateInstructionRef(instructionRef);
  const init = validateInitials(initials);
  const cliPath = path.resolve(__dirname, '..', '..', 'tools', 'run-matter-oneoff.mjs');
  const args = [cliPath, ref, init];
  if (dryRun) args.push('--dry-run');
  if (baseUrl) args.push('--base-url', baseUrl);
  appendCliOption(args, '--fee-earner', overrides.feeEarner);
  appendCliOption(args, '--originating', overrides.originatingSolicitor);
  appendCliOption(args, '--supervising', overrides.supervisingPartner);
  appendCliOption(args, '--practice-area', overrides.practiceArea);
  appendCliOption(args, '--description', overrides.description);
  appendCliOption(args, '--source', overrides.source);
  appendCliOption(args, '--matter-request-id', matterRequestId);
  appendCliOption(args, '--email', identity.email);
  appendCliOption(args, '--entra-id', identity.entraId);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: path.resolve(__dirname, '..', '..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      const err = new Error('matter_replay_timeout');
      err.userMessage = `Matter replay timed out after ${timeoutMs}ms`;
      reject(err);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let output = stdout;
      if (dryRun) {
        // CLI prints a single JSON document on dry-run; parse it for the client.
        try {
          output = JSON.parse(stdout);
        } catch {
          // Fall back to raw text if parsing fails.
        }
      }
      resolve({ ok: exitCode === 0, dryRun, output, stderr, exitCode });
    });
  });
}

module.exports = {
  runMatterReplay,
  validateInstructionRef,
  validateInitials,
};
