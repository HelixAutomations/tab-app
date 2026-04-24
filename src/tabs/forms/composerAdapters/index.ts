/**
 * Composer adapters — translate an AI proposal's `fields` block into the
 * shape a specific form's `prefill` prop expects.
 *
 * Each adapter declares:
 *   - `formTitle`: matches the `title` field of the corresponding entry in
 *     `processDefinitions`, used to look up the ProcessDefinition the user
 *     will land on after clicking "Review & send".
 *   - `mapToPrefill`: takes the raw `plan.fields` object (as returned by
 *     /api/forms-ai/plan) plus the current user, and returns a partial
 *     object matching the form's INTERNAL state shape.
 *
 * A missing adapter for a formKey means "we don't know how to apply this
 * proposal in the UI yet" — the drawer will surface it as unsupported.
 *
 * Pilot scope (v0): tech-problem only. Extending = add a new entry here +
 * a new entry in `server/prompts/formsComposer.js` FORM_CATALOGUE +
 * accept a `prefill` prop on the target form component.
 */

import type { UserData } from '../../../app/functionality/types';

export type ComposerFieldConfidence = 'high' | 'med' | 'low';
export type ComposerFieldSource = 'prompt' | 'profile' | 'default' | 'inferred';

export interface ComposerField {
  value: string | number | null;
  confidence: ComposerFieldConfidence;
  source: ComposerFieldSource;
}

export type ComposerFields = Record<string, ComposerField>;

export interface ComposerAdapter<TPrefill = Record<string, unknown>> {
  formTitle: string;
  mapToPrefill: (fields: ComposerFields, currentUser?: UserData) => TPrefill;
}

/**
 * Safe field-value reader. Returns the trimmed string or null if absent.
 */
export function readString(fields: ComposerFields, key: string): string | null {
  const f = fields?.[key];
  if (!f || f.value === null || f.value === undefined) return null;
  const s = String(f.value).trim();
  return s.length > 0 ? s : null;
}

/**
 * Tech Problem adapter — maps composer fields to TechProblemForm's
 * internal `FormData` shape:
 *   { title, description, steps_to_reproduce, expected_behavior,
 *     urgency: 'low' | 'medium' | 'high' | 'critical' }
 */
const techProblemAdapter: ComposerAdapter<{
  title?: string;
  description?: string;
  steps_to_reproduce?: string;
  expected_behavior?: string;
  urgency?: 'low' | 'medium' | 'high' | 'critical';
}> = {
  formTitle: 'Report Technical Problem',
  mapToPrefill: (fields) => {
    const validUrgencies = new Set(['low', 'medium', 'high', 'critical']);
    const rawUrgency = readString(fields, 'urgency');
    const urgency = rawUrgency && validUrgencies.has(rawUrgency.toLowerCase())
      ? (rawUrgency.toLowerCase() as 'low' | 'medium' | 'high' | 'critical')
      : 'medium';

    const prefill: ReturnType<typeof techProblemAdapter.mapToPrefill> = { urgency };
    const title = readString(fields, 'title');
    const description = readString(fields, 'description');
    const steps = readString(fields, 'steps_to_reproduce');
    const expected = readString(fields, 'expected_behavior');
    if (title) prefill.title = title;
    if (description) prefill.description = description;
    if (steps) prefill.steps_to_reproduce = steps;
    if (expected) prefill.expected_behavior = expected;
    return prefill;
  },
};

const ADAPTERS: Record<string, ComposerAdapter> = {
  'tech-problem': techProblemAdapter as ComposerAdapter,
};

export function getAdapter(formKey: string): ComposerAdapter | null {
  return ADAPTERS[formKey] || null;
}

export function listSupportedFormKeys(): string[] {
  return Object.keys(ADAPTERS);
}
