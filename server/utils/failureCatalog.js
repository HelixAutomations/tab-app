/**
 * Failure catalogue for the System Errors view.
 *
 * Each rule looks at an evidence event and decides whether a known explainer +
 * recommended action applies. The action is shipped to the client so the
 * Errors panel can render a single Recommended action button per incident.
 *
 * Rules are evaluated in order; the first match wins.
 */

/**
 * @typedef {Object} CatalogAction
 * @property {'retrigger-submission'|'open-form-detail'|'open-schema-ref'|'copy-curl'|'none'} kind
 * @property {string} label
 * @property {Object} [payload]
 */

/**
 * @typedef {Object} CatalogMatch
 * @property {string} headline
 * @property {string} explanation
 * @property {CatalogAction} action
 */

/**
 * @typedef {Object} EvidenceLike
 * @property {string} [title]
 * @property {string} [detail]
 * @property {string} [path]
 * @property {string|null} [exceptionType]
 * @property {number|null} [status]
 * @property {string|null} [submissionId]
 * @property {string|null} [formKey]
 * @property {string|null} [instructionRef]
 * @property {string|null} [route]
 */

/** Form keys with a registered retrigger handler today. */
const RETRIGGER_FORM_KEYS = new Set(['tech-idea', 'tech-problem', 'financial-task']);

function combinedText(evidence) {
  return `${evidence.title || ''} ${evidence.detail || ''}`.trim();
}

function isMatterOpeningRoute(evidence) {
  const text = combinedText(evidence).toLowerCase();
  const path = String(evidence.path || evidence.route || '').toLowerCase();
  return (
    path.includes('/api/clio-matters') ||
    path.includes('/api/matter-requests') ||
    text.includes('matter opening') ||
    text.includes('matteropening') ||
    text.includes('clio matter')
  );
}

/** @type {Array<{ test: (e: EvidenceLike) => boolean, build: (e: EvidenceLike) => CatalogMatch }>} */
const RULES = [
  // Asana credentials / token. Retrigger surfaces immediately when we have a submissionId.
  {
    test: (e) => /asana/i.test(combinedText(e)) && /credentials? missing|invalid_token|unauthorized|401|403/i.test(combinedText(e)),
    build: (e) => ({
      headline: 'Asana credentials missing or expired',
      explanation: 'The submission is safe. Retriggering re-runs the Asana call with the stored payload once the secret is restored.',
      action: e.submissionId && e.formKey && RETRIGGER_FORM_KEYS.has(e.formKey)
        ? { kind: 'retrigger-submission', label: 'Retrigger submission', payload: { submissionId: e.submissionId, formKey: e.formKey } }
        : e.submissionId
          ? { kind: 'open-form-detail', label: 'Open submission', payload: { submissionId: e.submissionId } }
          : { kind: 'none', label: 'No automatic action available' },
    }),
  },

  // Matter opening: invalid practice area. Data Hub Matters owns replay and repair.
  {
    test: (e) => /invalid practice area/i.test(combinedText(e)),
    build: (e) => ({
      headline: 'Practice area not mapped to Clio',
      explanation: 'Review the matter opening in Data Hub Matters.',
      action: { kind: 'none', label: 'Review in Data Hub Matters' },
    }),
  },

  // Matter opening: generic 5xx.
  {
    test: (e) => isMatterOpeningRoute(e) && Number(e.status) >= 500,
    build: (e) => ({
      headline: 'Matter opening route returned 5xx',
      explanation: 'Review the matter opening in Data Hub Matters.',
      action: { kind: 'none', label: 'Review in Data Hub Matters' },
    }),
  },

  // SQL schema bug: invalid column / object name. Not a transient failure. Surface schema reference + curl.
  {
    test: (e) => /invalid (column|object) name/i.test(combinedText(e)),
    build: (e) => ({
      headline: 'SQL schema mismatch',
      explanation: 'Retriggering will not help. Compare the failing column against the live schema and ship a fix.',
      action: {
        kind: 'open-schema-ref',
        label: 'Open schema reference',
        payload: { route: e.route || e.path || null },
      },
    }),
  },

  // verify-id 500. Open form detail so the operator can retrigger via FormsHub if a submission exists.
  {
    test: (e) => /verify-id/i.test(String(e.path || e.route || '')) && Number(e.status) >= 500,
    build: (e) => ({
      headline: 'verify-id route returned 5xx',
      explanation: 'The user-facing form likely shows a failure. Open the submission to inspect the payload and retrigger if a step is recoverable.',
      action: e.submissionId
        ? { kind: 'open-form-detail', label: 'Open submission', payload: { submissionId: e.submissionId } }
        : { kind: 'none', label: 'No submission row captured' },
    }),
  },

  // Generic: known retriggerable submission with a recorded failure.
  {
    test: (e) => Boolean(e.submissionId) && Boolean(e.formKey) && RETRIGGER_FORM_KEYS.has(String(e.formKey)),
    build: (e) => ({
      headline: 'Submission step failed',
      explanation: 'A stored submission payload is available. Retrigger reruns the same step server-side.',
      action: { kind: 'retrigger-submission', label: 'Retrigger submission', payload: { submissionId: e.submissionId, formKey: e.formKey } },
    }),
  },

  // Generic: any captured submissionId, just open the detail.
  {
    test: (e) => Boolean(e.submissionId),
    build: (e) => ({
      headline: 'Submission has a recorded failure',
      explanation: 'Open the submission to inspect payload and step timeline.',
      action: { kind: 'open-form-detail', label: 'Open submission', payload: { submissionId: e.submissionId } },
    }),
  },
];

/**
 * @param {EvidenceLike} evidence
 * @returns {CatalogMatch | null}
 */
function matchCatalog(evidence) {
  if (!evidence) return null;
  for (const rule of RULES) {
    try {
      if (rule.test(evidence)) return rule.build(evidence);
    } catch {
      // Keep matching robust; a single bad rule should not break the panel.
    }
  }
  return null;
}

module.exports = {
  matchCatalog,
  RETRIGGER_FORM_KEYS,
};
