// server/operatorActions/redact.js
//
// Redaction policy for params_json written to the operator_action_runs audit
// table. Applied at WRITE time (not read time) so the audit row never holds
// raw client PII.
//
// Defaults:
//   - email-shaped values     → '[redacted-email]'
//   - phone-shaped values     → '[redacted-phone]'
//   - long digit strings (11+) → '[redacted-numeric]'
//   - HLX-#####-##### refs    → kept (these are operationally useful)
//   - everything else          → kept (param keys are explicit by definition)
//
// A param can opt out per-action by declaring `{ redactValue: false }` on
// its schema entry. A param can opt in to full masking with
// `{ redactValue: 'always' }`.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\+\(\)\-\s\d]{10,}$/;
const LONG_DIGITS_RE = /^\d{11,}$/;
const HLX_REF_RE = /^HLX-\d{3,}-\d{3,}$/i;

function classify(value) {
  if (value == null) return 'null';
  if (typeof value !== 'string') return typeof value;
  const trimmed = value.trim();
  if (trimmed === '') return 'empty';
  if (HLX_REF_RE.test(trimmed)) return 'hlx-ref';
  if (EMAIL_RE.test(trimmed)) return 'email';
  if (LONG_DIGITS_RE.test(trimmed)) return 'numeric';
  // Phone heuristic only kicks in if value contains digits + symbols and is
  // not pure HLX/email; keeps "Luke Test" alone.
  if (/\d/.test(trimmed) && PHONE_RE.test(trimmed)) return 'phone';
  return 'plain';
}

function redactScalar(value, perFieldPolicy) {
  if (perFieldPolicy === 'always') return '[redacted]';
  if (perFieldPolicy === false) return value;
  const kind = classify(value);
  if (kind === 'email') return '[redacted-email]';
  if (kind === 'phone') return '[redacted-phone]';
  if (kind === 'numeric') return '[redacted-numeric]';
  return value;
}

/**
 * Redact a params object for audit storage.
 *
 * @param {Record<string, unknown>} params  Raw params as supplied by the caller.
 * @param {Record<string, { redactValue?: boolean | 'always' }>} [policy]
 *   Per-field redaction overrides keyed by param name.
 * @returns {Record<string, unknown>} Shallow-redacted copy.
 */
function redactParams(params, policy = {}) {
  if (!params || typeof params !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    const fieldPolicy = policy[k] && Object.prototype.hasOwnProperty.call(policy[k], 'redactValue')
      ? policy[k].redactValue
      : undefined;
    if (Array.isArray(v)) {
      out[k] = v.map((item) => (typeof item === 'string' ? redactScalar(item, fieldPolicy) : item));
    } else if (v && typeof v === 'object') {
      // Don't recurse — we don't expect nested objects in action params.
      // If we do, stringify so the audit row still gets coverage.
      out[k] = '[object]';
    } else {
      out[k] = redactScalar(v, fieldPolicy);
    }
  }
  return out;
}

module.exports = {
  redactParams,
  // exposed for tests
  _classify: classify,
};
