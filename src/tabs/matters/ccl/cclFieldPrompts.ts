/**
 * FIELD_PROMPTS — Maps each CCL template placeholder to its AI prompt instruction.
 * Used by the prompt refinement sidebar to show what the AI is asked to generate.
 *
 * Source of truth: the system prompt in server/routes/ccl-ai.js
 * Keep this in sync — when the server prompt changes, update here.
 */

export interface FieldPrompt {
  key: string;
  label: string;
  section: string;
  sectionTitle: string;
  placeholder: string;
  templateContext: string;
  instruction: string;
  /** Human-readable summary of the data the AI will consult for this field */
  dataHint: string;
  outputType: 'text' | 'paragraph' | 'number' | 'choice';
  order: number;
}

export const FIELD_PROMPTS: FieldPrompt[] = [
  // ── Section 2 — Scope of retainer ──
  {
    key: 'insert_current_position_and_scope_of_retainer',
    label: 'Scope of Work',
    section: '2',
    sectionTitle: 'Scope of Services',
    placeholder: '{{insert_current_position_and_scope_of_retainer}}',
    templateContext: '{{insert_current_position_and_scope_of_retainer}} ("Initial Scope")',
    instruction: 'Opening paragraph of the scope section. Write 2–4 complete sentences describing what the client has instructed Helix Law to do. Must be specific to this matter. The template appends ("Initial Scope") after your output.',
    dataHint: 'Enquiry notes, initial call notes, pitch email, deal description, area of work',
    outputType: 'paragraph',
    order: 1,
  },

  // ── Section 3 — Next steps ──
  {
    key: 'next_steps',
    label: 'Next Steps',
    section: '3',
    sectionTitle: 'Next Steps',
    placeholder: '{{next_steps}}',
    templateContext: 'The next steps in your matter are {{next_steps}}.',
    instruction: 'Start lowercase — this completes the sentence "The next steps in your matter are…". List 2–3 specific actions Helix Law will take.',
    dataHint: 'Enquiry notes, pitch email, deal description, practice area',
    outputType: 'paragraph',
    order: 2,
  },
  {
    key: 'realistic_timescale',
    label: 'Timescale',
    section: '3',
    sectionTitle: 'Next Steps',
    placeholder: '{{realistic_timescale}}',
    templateContext: 'We expect this will take {{realistic_timescale}}.',
    instruction: 'A realistic time period, e.g. "4–6 weeks" or "2–3 months". Consider the area of work and complexity.',
    dataHint: 'Practice area, type of work, matter complexity from notes',
    outputType: 'text',
    order: 3,
  },

  // ── Section 4.1 — Charges ──
  {
    key: 'handler_hourly_rate',
    label: 'Hourly Rate (£)',
    section: '4.1',
    sectionTitle: 'Charges & Hourly Rate',
    placeholder: '{{handler_hourly_rate}}',
    templateContext: 'My rate is £{{handler_hourly_rate}} per hour.',
    instruction: 'Number only — the hourly rate in pounds. Derived from team data. Do not include the £ symbol.',
    dataHint: 'Team table (fee earner hourly rate lookup)',
    outputType: 'number',
    order: 4,
  },
  {
    key: 'charges_estimate_paragraph',
    label: 'Charges Estimate',
    section: '4.1',
    sectionTitle: 'Charges Estimate',
    placeholder: '{{charges_estimate_paragraph}}',
    templateContext: '{{charges_estimate_paragraph}}',
    instruction: '1–3 sentences estimating fees for the Initial Scope. Include a £ range plus VAT. If a Deal Amount exists, build the estimate around it. If a Pitch Email quoted a range, use it verbatim.',
    dataHint: 'Deal amount, pitch email (quoted fees), enquiry value, practice area norms',
    outputType: 'paragraph',
    order: 5,
  },

  // ── Section 4.2 — Disbursements ──
  {
    key: 'disbursements_paragraph',
    label: 'Disbursements',
    section: '4.2',
    sectionTitle: 'Disbursements',
    placeholder: '{{disbursements_paragraph}}',
    templateContext: '{{disbursements_paragraph}}',
    instruction: 'Write 1–3 client-friendly sentences about likely disbursements for this matter. Avoid tables, repeated placeholder rows, or generic filler. If no material disbursements are expected at the outset, say so and explain that any court fee, counsel\'s fee, expert fee, search fee or similar third-party cost will be discussed in advance before being incurred.',
    dataHint: 'Practice area, type of work (area-specific disbursement norms)',
    outputType: 'paragraph',
    order: 6,
  },

  // ── Section 4.3 — Costs other party ──
  {
    key: 'costs_other_party_paragraph',
    label: 'Costs (Other Party)',
    section: '4.3',
    sectionTitle: 'Other Party\'s Costs',
    placeholder: '{{costs_other_party_paragraph}}',
    templateContext: '{{costs_other_party_paragraph}}',
    instruction: '1–2 sentences. If there is an opponent: warn about adverse costs risk. If no opponent / not litigation: "We do not expect that you will have to pay another party\'s costs."',
    dataHint: 'Opponent name, practice area, type of work (determines if litigation)',
    outputType: 'paragraph',
    order: 7,
  },

  // ── Section 6 — Payment on account ──
  {
    key: 'figure',
    label: 'Payment on Account (£)',
    section: '6',
    sectionTitle: 'Payment on Account',
    placeholder: '{{figure}}',
    templateContext: 'Please provide us with £{{figure}} on account of costs.',
    instruction: 'Number only, no £ sign, e.g. "2,500". If a Deal Amount is provided, use it directly (the deal amount IS the agreed fee). If a Pitch Amount exists, use that. Only fall back to practice area norms if neither exists.',
    dataHint: 'Deal amount → pitch amount → practice area estimate (in that priority)',
    outputType: 'number',
    order: 8,
  },

  // ── Section 7 — Billing interval ──
  {
    key: 'and_or_intervals_eg_every_three_months',
    label: 'Billing Interval',
    section: '7',
    sectionTitle: 'Billing Arrangements',
    placeholder: '{{and_or_intervals_eg_every_three_months}}',
    templateContext: '…provide you with an update on costs…{{and_or_intervals_eg_every_three_months}}.',
    instruction: 'Starts with a space or ", " then the interval. Usually " monthly" or " every three months".',
    dataHint: 'Practice area norms (standard billing cadence)',
    outputType: 'text',
    order: 9,
  },

  // ── Section 13 — May/will ──
  {
    key: 'may_will',
    label: 'May / Will',
    section: '13',
    sectionTitle: 'Limitation of Liability',
    placeholder: '{{may_will}}',
    templateContext: 'Your matter {{may_will}} involve court proceedings.',
    instruction: 'Either "may" or "will". Use "may" unless court proceedings are certain.',
    dataHint: 'Practice area, enquiry notes, call transcripts (mentions of court/proceedings)',
    outputType: 'choice',
    order: 10,
  },

  // ── Section 18 — What to do next ──
  {
    key: 'insert_next_step_you_would_like_client_to_take',
    label: 'Client Next Step',
    section: '18',
    sectionTitle: 'What to Do Next',
    placeholder: '{{insert_next_step_you_would_like_client_to_take}}',
    templateContext: '☐ {{insert_next_step_you_would_like_client_to_take}} | {{state_why…}}',
    instruction: 'Imperative sentence — what the client must do. Be specific to this matter.',
    dataHint: 'Pitch email, enquiry notes, deal description, area of work',
    outputType: 'text',
    order: 11,
  },
  {
    key: 'state_why_this_step_is_important',
    label: 'Why Step is Important',
    section: '18',
    sectionTitle: 'What to Do Next',
    placeholder: '{{state_why_this_step_is_important}}',
    templateContext: '☐ {{insert_next_step_you_would_like_client_to_take}} | {{state_why_this_step_is_important}}',
    instruction: 'Why the client\'s next step matters — 1 sentence, e.g. "so that we can begin reviewing your position".',
    dataHint: 'Derived from Client Next Step field + matter context',
    outputType: 'text',
    order: 12,
  },
  {
    key: 'state_amount',
    label: 'Payment Amount',
    section: '18',
    sectionTitle: 'What to Do Next',
    placeholder: '{{state_amount}}',
    templateContext: '☐ Provide a payment on account of £{{state_amount}} | If we do not receive…',
    instruction: 'Must match the {{figure}} field value. Include the £ symbol here (e.g. "£2,500").',
    dataHint: 'Mirrors the Payment on Account (§6) figure field',
    outputType: 'text',
    order: 13,
  },
  {
    key: 'insert_consequence',
    label: 'Consequence of Inaction',
    section: '18',
    sectionTitle: 'What to Do Next',
    placeholder: '{{insert_consequence}}',
    templateContext: 'If we do not receive a payment on account… {{insert_consequence}}',
    instruction: 'What happens if the client doesn\'t pay — e.g. "we may not be able to start work on your matter".',
    dataHint: 'Practice area, matter urgency from notes',
    outputType: 'text',
    order: 14,
  },
  {
    key: 'describe_first_document_or_information_you_need_from_your_client',
    label: 'Document 1 Needed',
    section: '18',
    sectionTitle: 'What to Do Next',
    placeholder: '{{describe_first_document_or_information_you_need_from_your_client}}',
    templateContext: '☐ {{describe_first_document_or_information_you_need_from_your_client}}',
    instruction: 'The most important document or information needed — name the actual document, e.g. "a copy of the contract".',
    dataHint: 'Initial call notes, enquiry notes, pitch email, call transcripts → AI reasons about what specific docs this matter needs',
    outputType: 'text',
    order: 15,
  },
  {
    key: 'describe_second_document_or_information_you_need_from_your_client',
    label: 'Document 2 Needed',
    section: '18',
    sectionTitle: 'What to Do Next',
    placeholder: '{{describe_second_document_or_information_you_need_from_your_client}}',
    templateContext: '☐ {{describe_second_document_or_information_you_need_from_your_client}}',
    instruction: 'Second document — e.g. "all correspondence with the other party", "financial records".',
    dataHint: 'Initial call notes, enquiry notes, pitch email, call transcripts → AI reasons about what specific docs this matter needs',
    outputType: 'text',
    order: 16,
  },
  {
    key: 'describe_third_document_or_information_you_need_from_your_client',
    label: 'Document 3 Needed',
    section: '18',
    sectionTitle: 'What to Do Next',
    placeholder: '{{describe_third_document_or_information_you_need_from_your_client}}',
    templateContext: '☐ {{describe_third_document_or_information_you_need_from_your_client}}',
    instruction: 'Optional third document or information. Leave blank if not needed.',
    dataHint: 'Initial call notes, enquiry notes, pitch email, call transcripts → AI reasons about what specific docs this matter needs',
    outputType: 'text',
    order: 17,
  },

  // ── Metadata / AI context fields ──
  {
    key: 'identify_the_other_party_eg_your_opponents',
    label: 'Other Party Name',
    section: '4.3',
    sectionTitle: 'Costs You May Have To Pay Another Party',
    placeholder: '{{identify_the_other_party_eg_your_opponents}}',
    templateContext: 'There is a risk that you may have to pay {{identify_the_other_party_eg_your_opponents}} costs in this matter. This is explained in section 5, Funding and billing below.',
    instruction: 'Name of the other party used inside the second 4.3 alternative only. Auto-filled from matter data if available; not a standalone sentence in the letter.',
    dataHint: 'Opponents table (name from matter opening) or Core Data matters.Opponent',
    outputType: 'text',
    order: 18,
  },
];

/** Lookup map: field key → prompt info */
export const FIELD_PROMPT_MAP: Record<string, FieldPrompt> = Object.fromEntries(
  FIELD_PROMPTS.map(p => [p.key, p])
);

/** Group prompts by section for display */
export const FIELD_PROMPTS_BY_SECTION: Record<string, FieldPrompt[]> = FIELD_PROMPTS.reduce((acc, p) => {
  const key = `${p.section} — ${p.sectionTitle}`;
  (acc[key] = acc[key] || []).push(p);
  return acc;
}, {} as Record<string, FieldPrompt[]>);
