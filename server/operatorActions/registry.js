// server/operatorActions/registry.js
//
// Registry for the in-app Operator Actions surface (B1, Phase A).
//
// An action definition has this shape:
//
//   {
//     id: 'person-lookup',                       // unique, kebab-case
//     title: 'Person lookup',
//     description: '...short, one line...',
//     category: 'lookup' | 'verify' | 'mutate',  // free-form, used for grouping
//     allowedTiers: ['dev']                      // subset of: 'dev','admin','all'
//                                                // 'dev' = isDevOwner only
//                                                // 'admin' = isAdmin (and above)
//                                                // 'all' = any signed-in user
//     dryRunSupported: false,
//     paramsSchema: [                            // see validateParams()
//       { key: 'query', label: 'Name', type: 'text', required: true,
//         placeholder: 'e.g. Luke Test',
//         redactValue: false /* | true | 'always' */ },
//     ],
//     run: async ({ params, dryRun, requestor }) => ({
//       summary: 'Found 3 enquiries',             // short human string for audit
//       artefact: {                               // optional
//         kind: 'json',                           // 'json' | 'text' | 'markdown' | 'csv'
//         body: { ... },
//         downloadName: 'person-lookup-luke-test.json',
//       },
//       warnings: ['...'],                        // optional
//       confirmationRequired: false,              // optional, future use
//     }),
//   }
//
// Phase A constraint: registry is read-only at runtime. Define actions in
// individual modules and call registerAction() at require-time.

const actions = new Map();

function registerAction(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new Error('registerAction: definition must be an object');
  }
  const required = ['id', 'title', 'allowedTiers', 'paramsSchema', 'run'];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(definition, key)) {
      throw new Error(`registerAction: missing field "${key}"`);
    }
  }
  if (typeof definition.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(definition.id)) {
    throw new Error(`registerAction: id "${definition.id}" must be kebab-case`);
  }
  if (actions.has(definition.id)) {
    throw new Error(`registerAction: duplicate id "${definition.id}"`);
  }
  if (!Array.isArray(definition.allowedTiers) || definition.allowedTiers.length === 0) {
    throw new Error(`registerAction(${definition.id}): allowedTiers must be a non-empty array`);
  }
  if (!Array.isArray(definition.paramsSchema)) {
    throw new Error(`registerAction(${definition.id}): paramsSchema must be an array`);
  }
  if (typeof definition.run !== 'function') {
    throw new Error(`registerAction(${definition.id}): run must be a function`);
  }
  actions.set(definition.id, {
    description: '',
    category: 'general',
    dryRunSupported: false,
    ...definition,
  });
  return definition;
}

function getAction(id) {
  return actions.get(id) || null;
}

function listActions() {
  return Array.from(actions.values());
}

// ─── Tier resolution ────────────────────────────────────────────────────────

const TIER_ORDER = ['user', 'admin', 'devGroup', 'dev'];

function tierAtLeast(actual, required) {
  // 'all' always passes.
  if (required === 'all') return true;
  const actualIdx = TIER_ORDER.indexOf(actual);
  const requiredIdx = TIER_ORDER.indexOf(required);
  if (actualIdx === -1 || requiredIdx === -1) return false;
  return actualIdx >= requiredIdx;
}

/**
 * Returns true if the caller's tier (e.g. 'dev', 'admin', 'user') satisfies
 * any of the action's allowedTiers entries.
 */
function callerCanRun(action, callerTier) {
  if (!action || !Array.isArray(action.allowedTiers)) return false;
  return action.allowedTiers.some((required) => tierAtLeast(callerTier, required));
}

// ─── Params validation (tiny home-grown schema validator) ──────────────────

const VALID_TYPES = new Set(['text', 'number', 'boolean', 'select', 'date', 'confirmation']);

function validateParams(action, rawParams, context = {}) {
  const params = (rawParams && typeof rawParams === 'object') ? rawParams : {};
  const errors = [];
  const cleaned = {};
  const dryRun = Boolean(context.dryRun);

  for (const field of action.paramsSchema) {
    if (!field || typeof field.key !== 'string') {
      errors.push('Schema entry missing "key"');
      continue;
    }
    if (!VALID_TYPES.has(field.type)) {
      errors.push(`Field "${field.key}" has unsupported type "${field.type}"`);
      continue;
    }
    const raw = params[field.key];
    const isEmpty = raw == null || (typeof raw === 'string' && raw.trim() === '');

    if (isEmpty) {
      if (field.required) {
        errors.push(`Field "${field.key}" is required`);
      } else if (Object.prototype.hasOwnProperty.call(field, 'default')) {
        cleaned[field.key] = field.default;
      }
      continue;
    }

    if (field.type === 'text') {
      const value = String(raw).trim();
      if (typeof field.maxLength === 'number' && value.length > field.maxLength) {
        errors.push(`Field "${field.key}" exceeds maxLength ${field.maxLength}`);
        continue;
      }
      if (field.pattern instanceof RegExp && !field.pattern.test(value)) {
        errors.push(`Field "${field.key}" does not match expected pattern`);
        continue;
      }
      cleaned[field.key] = value;
    } else if (field.type === 'number') {
      const num = Number(raw);
      if (Number.isNaN(num)) {
        errors.push(`Field "${field.key}" must be a number`);
        continue;
      }
      cleaned[field.key] = num;
    } else if (field.type === 'boolean') {
      cleaned[field.key] = Boolean(raw);
    } else if (field.type === 'select') {
      const value = String(raw);
      const allowed = Array.isArray(field.options) ? field.options.map((o) => (typeof o === 'string' ? o : o.value)) : [];
      if (!allowed.includes(value)) {
        errors.push(`Field "${field.key}" must be one of: ${allowed.join(', ')}`);
        continue;
      }
      cleaned[field.key] = value;
    } else if (field.type === 'date') {
      const value = String(raw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        errors.push(`Field "${field.key}" must be YYYY-MM-DD`);
        continue;
      }
      cleaned[field.key] = value;
    } else if (field.type === 'confirmation') {
      // Confirmation fields are only enforced for live (non-dry-run) calls.
      // The supplied value MUST equal field.expectedPhrase exactly.
      if (dryRun) {
        // Ignore in dry-run; never store the value.
        continue;
      }
      const value = String(raw);
      const expected = String(field.expectedPhrase || '');
      if (!expected) {
        errors.push(`Field "${field.key}" missing expectedPhrase in schema`);
        continue;
      }
      if (value !== expected) {
        errors.push(`Field "${field.key}" confirmation phrase does not match`);
        continue;
      }
      // Store a sentinel rather than the value itself so audit/telemetry
      // never see the phrase.
      cleaned[field.key] = '<CONFIRMED>';
    }
  }

  return { ok: errors.length === 0, errors, cleaned };
}

/**
 * Build the per-field redact policy map from a paramsSchema, suitable to
 * pass to redact.redactParams().
 */
function buildRedactionPolicy(action) {
  const policy = {};
  for (const field of action.paramsSchema || []) {
    if (field && Object.prototype.hasOwnProperty.call(field, 'redactValue')) {
      policy[field.key] = { redactValue: field.redactValue };
    }
  }
  return policy;
}

/**
 * Public summary — what the client lens sees. Strips the run() function,
 * compiled regexes, and other internals.
 */
function publicShape(action) {
  return {
    id: action.id,
    title: action.title,
    description: action.description || '',
    category: action.category || 'general',
    allowedTiers: action.allowedTiers,
    dryRunSupported: Boolean(action.dryRunSupported),
    paramsSchema: (action.paramsSchema || []).map((f) => ({
      key: f.key,
      label: f.label || f.key,
      type: f.type,
      required: Boolean(f.required),
      placeholder: f.placeholder || '',
      helpText: f.helpText || '',
      options: Array.isArray(f.options) ? f.options : undefined,
      maxLength: typeof f.maxLength === 'number' ? f.maxLength : undefined,
      default: Object.prototype.hasOwnProperty.call(f, 'default') ? f.default : undefined,
      expectedPhrase: f.type === 'confirmation' ? String(f.expectedPhrase || '') : undefined,
    })),
  };
}

module.exports = {
  registerAction,
  getAction,
  listActions,
  callerCanRun,
  tierAtLeast,
  validateParams,
  buildRedactionPolicy,
  publicShape,
};
