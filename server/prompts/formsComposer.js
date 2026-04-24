/**
 * Forms AI Composer — system prompt, user prompt, and validator.
 *
 * Powers POST /api/forms-ai/plan. The composer takes the user's free-text
 * intent and proposes a pre-filled submission for one of the supported
 * Helix Hub forms.
 *
 * Pilot scope (v0): Tech Problem only. Other forms are added by extending
 * the FORM_CATALOGUE below and adding a matching entry in
 * `src/tabs/forms/composerAdapters/`.
 */

const { HELIX_VOICE_BLOCK } = require('./helixVoice');

/**
 * Form catalogue. Each entry is the contract the LLM must follow when
 * proposing a submission for that form. Field shapes match the form's
 * INTERNAL `formData` state shape (not the wire body) so the adapter can
 * apply prefill directly without re-mapping.
 *
 * `triggers` are short phrases that suggest this form. The model is told
 * to use them as hints, not hard rules.
 */
const FORM_CATALOGUE = [
  {
    formKey: 'tech-problem',
    title: 'Report Technical Problem',
    description:
      'Internal Hub bugs, errors, broken pages, broken integrations, things that should work but don\'t.',
    triggers: ['bug', 'broken', 'not working', 'error', 'crash', 'tech problem', 'staging', 'deploy', 'pipeline'],
    fields: [
      {
        key: 'title',
        label: 'Title',
        type: 'string',
        required: true,
        hint: 'Concise headline of the problem (max ~80 chars).',
      },
      {
        key: 'description',
        label: 'Description',
        type: 'string',
        required: true,
        hint: 'What is broken right now. Use the user\'s words; do not invent symptoms.',
      },
      {
        key: 'steps_to_reproduce',
        label: 'Steps to reproduce',
        type: 'string',
        required: false,
        hint: 'Numbered or bulleted steps if the user gave any. Otherwise leave blank with low confidence.',
      },
      {
        key: 'expected_behavior',
        label: 'Expected behaviour',
        type: 'string',
        required: false,
        hint: 'What should happen instead. Often inferable from the description.',
      },
      {
        key: 'urgency',
        label: 'Urgency',
        type: 'enum',
        required: true,
        enum: ['low', 'medium', 'high', 'critical'],
        hint: 'Map "urgent"/"blocking"/"work stopped" → critical. "high impact" → high. Default medium when unclear.',
      },
    ],
  },
];

/**
 * The supported pilot form keys, used by the route to route an
 * unsupported pick (anything outside this list) to `outcome=unsupported`.
 */
const SUPPORTED_FORM_KEYS = new Set(FORM_CATALOGUE.map((f) => f.formKey));

/**
 * Build the system prompt. The catalogue is interpolated inline so the
 * model can see every field for every supported form in one shot.
 *
 * @returns {string}
 */
function buildSystemPrompt() {
  const catalogueBlock = FORM_CATALOGUE
    .map((form) => {
      const fields = form.fields
        .map((f) => {
          const enumPart = f.enum ? ` (one of: ${f.enum.join(', ')})` : '';
          const reqPart = f.required ? ' [required]' : ' [optional]';
          return `  - ${f.key} (${f.type}${enumPart})${reqPart}: ${f.hint}`;
        })
        .join('\n');
      return `### ${form.formKey} — ${form.title}
${form.description}
Trigger phrases: ${form.triggers.join(', ')}
Fields:
${fields}`;
    })
    .join('\n\n');

  return `${HELIX_VOICE_BLOCK}

You are the Helix Hub Forms Composer. The user has typed a free-text
description of something they want to log via one of Helix Hub's internal
forms. Your job is to:

1. Pick the single most appropriate form from the catalogue below.
2. Propose values for that form's fields based ONLY on what the user wrote
   plus their profile. Never invent matter references, names, dates, amounts,
   or technical details that are not present in the prompt.
3. Mark each field's confidence honestly: "high" only when the value comes
   directly from the prompt or the user's profile; "med" when you inferred
   it from clear context; "low" when you guessed.
4. If no form in the catalogue is a good fit, return formKey: "unsupported".

Respond with a single JSON object matching this exact shape:

{
  "formKey": "tech-problem" | "unsupported",
  "summary": "one short sentence describing what will be logged",
  "rationale": "one sentence — why you picked this form",
  "fields": {
    "<fieldKey>": {
      "value": "<string|number|null>",
      "confidence": "high" | "med" | "low",
      "source": "prompt" | "profile" | "default" | "inferred"
    }
  },
  "alternatives": ["<other formKey if also plausible>"]
}

Rules:
- Output JSON only. No prose around it. No markdown fences.
- Required fields MUST appear in the "fields" object even if empty
  (use null value with confidence "low" when unknown).
- "source: profile" is reserved for fields the SERVER will inject
  (initials, full name). DO NOT include any such fields yourself unless
  they are explicitly listed in the catalogue.
- Never echo PII you do not see in the prompt — no fake matter refs,
  no fake people, no fake amounts.
- For unsupported requests: still return the JSON skeleton with
  formKey "unsupported", an empty fields object, and a one-sentence
  rationale of why nothing fits.

Form catalogue:

${catalogueBlock}`;
}

/**
 * Build the user prompt. Includes the user's identity so the model can
 * reason about them (e.g. "I" → currentUser.name) without having to
 * speculate.
 *
 * @param {object} args
 * @param {string} args.query
 * @param {object} args.currentUser
 * @param {string} [args.currentUser.initials]
 * @param {string} [args.currentUser.name]
 * @param {string} [args.currentUser.role]
 * @returns {string}
 */
function buildUserPrompt({ query, currentUser }) {
  const safeQuery = String(query || '').trim().slice(0, 2000);
  const initials = String(currentUser?.initials || '').trim();
  const name = String(currentUser?.name || '').trim();
  const role = String(currentUser?.role || '').trim();
  const today = new Date().toISOString().slice(0, 10);

  return `User identity:
- initials: ${initials || '(unknown)'}
- name: ${name || '(unknown)'}
- role: ${role || '(unknown)'}
- today: ${today}

User said:
"""
${safeQuery}
"""

Pick the best form, propose field values, and return the JSON object.`;
}

/**
 * Validate the LLM's response against the contract.
 *
 * @param {unknown} raw  Parsed JSON returned by `chatCompletion`.
 * @returns {{ ok: true, plan: object } | { ok: false, error: string }}
 */
function validatePlan(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'plan_not_object' };
  }
  if (raw._parseError) {
    return { ok: false, error: 'json_parse_failed' };
  }
  const formKey = typeof raw.formKey === 'string' ? raw.formKey : null;
  if (!formKey) {
    return { ok: false, error: 'missing_formKey' };
  }
  if (formKey !== 'unsupported' && !SUPPORTED_FORM_KEYS.has(formKey)) {
    return { ok: false, error: `unknown_formKey:${formKey}` };
  }

  const plan = {
    formKey,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
    fields: raw.fields && typeof raw.fields === 'object' ? raw.fields : {},
    alternatives: Array.isArray(raw.alternatives) ? raw.alternatives.filter((a) => typeof a === 'string') : [],
  };

  if (formKey === 'unsupported') {
    return { ok: true, plan };
  }

  // For supported forms, every required field must appear in plan.fields
  // (even if value is null). This guards against silent dropouts that
  // would surprise the UI.
  const def = FORM_CATALOGUE.find((f) => f.formKey === formKey);
  const requiredKeys = def.fields.filter((f) => f.required).map((f) => f.key);
  for (const key of requiredKeys) {
    if (!(key in plan.fields)) {
      plan.fields[key] = { value: null, confidence: 'low', source: 'inferred' };
    }
  }

  return { ok: true, plan };
}

module.exports = {
  FORM_CATALOGUE,
  SUPPORTED_FORM_KEYS,
  buildSystemPrompt,
  buildUserPrompt,
  validatePlan,
};
