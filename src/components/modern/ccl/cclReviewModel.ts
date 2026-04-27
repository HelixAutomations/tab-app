import { DEFAULT_CCL_TEMPLATE, generateTemplateContent, type GenerationOptions } from '../../../shared/ccl';
import type { PressureTestFieldScore } from '../../../tabs/matters/ccl/cclAiService';
import { getCanonicalCclStage } from './cclStatus';

export interface CclPromptSection {
  key: string;
  title: string;
  body: string;
}

export type CclReviewFieldConfidence = 'data' | 'inferred' | 'templated' | 'unknown';

export type CclReviewFieldMeta = {
  label: string;
  group: string;
  anchor: string;
  prompt: string;
  confidence: CclReviewFieldConfidence;
};

export const CCL_ORDERED_REVIEW_FIELD_KEYS = [
  'insert_clients_name',
  'insert_heading_eg_matter_description',
  'name_of_person_handling_matter',
  'status',
  'name',
  'fee_earner_email',
  'fee_earner_phone',
  'fee_earner_postal_address',
  'names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries',
  'insert_current_position_and_scope_of_retainer',
  'next_steps',
  'realistic_timescale',
  'handler_hourly_rate',
  'charges_estimate_paragraph',
  'disbursements_paragraph',
  'costs_other_party_paragraph',
  'figure',
  'and_or_intervals_eg_every_three_months',
  'contact_details_for_marketing_opt_out',
  'eid_paragraph',
  'may_will',
  'explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement',
  'instructions_link',
  'insert_next_step_you_would_like_client_to_take',
  'state_why_this_step_is_important',
  'state_amount',
  'insert_consequence',
  'describe_first_document_or_information_you_need_from_your_client',
  'describe_second_document_or_information_you_need_from_your_client',
  'describe_third_document_or_information_you_need_from_your_client',
] as const;

export const CCL_SUPPRESSED_REVIEW_FIELD_KEYS = new Set<string>([
  'insert_clients_name',
  'name_of_person_handling_matter',
  'status',
  'name',
  'fee_earner_email',
  'fee_earner_phone',
  'fee_earner_postal_address',
  'names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries',
  'contact_details_for_marketing_opt_out',
  'handler_hourly_rate',
]);

export const CCL_PRESSURE_TEST_FIELD_KEYS = CCL_ORDERED_REVIEW_FIELD_KEYS.filter(
  (key) => !CCL_SUPPRESSED_REVIEW_FIELD_KEYS.has(key),
);

export function readCclReviewTextValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function sanitiseCclPressureTestFields(fields: Record<string, unknown> | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fields) return result;
  for (const key of CCL_PRESSURE_TEST_FIELD_KEYS) {
    const text = readCclReviewTextValue(fields[key]);
    if (text) result[key] = text;
  }
  return result;
}

export function extractCclTraceFields(trace: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!trace) return {};
  const outputJson = trace.AiOutputJson;
  if (typeof outputJson !== 'string' || !outputJson.trim()) return {};
  try {
    const parsed = JSON.parse(outputJson) as { fields?: Record<string, unknown> } | Record<string, unknown>;
    const source = parsed && typeof parsed === 'object' && 'fields' in parsed && parsed.fields && typeof parsed.fields === 'object'
      ? parsed.fields as Record<string, unknown>
      : parsed as Record<string, unknown>;
    return sanitiseCclPressureTestFields(source);
  } catch {
    return {};
  }
}

const CCL_PROMPT_SECTION_PRIORITY: Record<string, string[]> = {
  insert_current_position_and_scope_of_retainer: ['pitch-email', 'initial-call-notes', 'enquiry-notes', 'instruction-notes', 'call-transcripts', 'deal-information', 'matter-context'],
  next_steps: ['initial-call-notes', 'call-transcripts', 'pitch-email', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  realistic_timescale: ['initial-call-notes', 'call-transcripts', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  charges_estimate_paragraph: ['deal-information', 'pitch-email', 'pitch-service-description', 'matter-context'],
  disbursements_paragraph: ['matter-context', 'pitch-email', 'instruction-notes'],
  costs_other_party_paragraph: ['matter-context', 'initial-call-notes', 'enquiry-notes', 'instruction-notes'],
  may_will: ['initial-call-notes', 'call-transcripts', 'enquiry-notes', 'matter-context'],
  figure: ['deal-information', 'pitch-email', 'pitch-service-description', 'matter-context'],
  state_amount: ['deal-information', 'pitch-email', 'pitch-service-description', 'matter-context'],
  insert_next_step_you_would_like_client_to_take: ['initial-call-notes', 'call-transcripts', 'pitch-email', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  state_why_this_step_is_important: ['initial-call-notes', 'call-transcripts', 'pitch-email', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  describe_first_document_or_information_you_need_from_your_client: ['initial-call-notes', 'call-transcripts', 'pitch-email', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  describe_second_document_or_information_you_need_from_your_client: ['initial-call-notes', 'call-transcripts', 'pitch-email', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  describe_third_document_or_information_you_need_from_your_client: ['initial-call-notes', 'call-transcripts', 'pitch-email', 'enquiry-notes', 'instruction-notes', 'matter-context'],
  eid_paragraph: ['matter-context', 'instruction-notes'],
};

const CCL_PROMPT_CONTEXT_LINE_MATCHERS: Record<string, RegExp[]> = {
  practiceArea: [/^- Practice Area:/i],
  description: [/^- Matter Description:/i, /^- Type of Work:/i],
  typeOfWork: [/^- Type of Work:/i, /^- Matter Description:/i],
  clientName: [/^- Client Name:/i],
  handlerName: [/^- Handler:/i],
  handlerRole: [/^- Handler:/i],
  handlerRate: [/^- Handler Hourly Rate:/i],
  opponent: [/^- Opposing Party:/i],
  clientType: [/^- Client Type:/i],
  company: [/^- Client Company:/i],
  clientGender: [/^- Client Gender:/i],
  enquiryValue: [/^- Enquiry Value:/i],
  source: [/^- Enquiry Source:/i],
  instructionStage: [/^- Instruction Stage:/i],
};

function detectCclPromptSection(line: string): { key: string; title: string; initialBody?: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed === 'MATTER CONTEXT:') return { key: 'matter-context', title: 'Matter Context' };
  if (trimmed === 'DEAL INFORMATION:') return { key: 'deal-information', title: 'Deal Information' };
  if (trimmed === 'PITCH EMAIL SENT TO CLIENT (use this to match scope and costs):') return { key: 'pitch-email', title: 'Pitch Email Sent To Client' };
  if (trimmed.startsWith('PITCH SERVICE DESCRIPTION:')) return { key: 'pitch-service-description', title: 'Pitch Service Description', initialBody: trimmed.slice('PITCH SERVICE DESCRIPTION:'.length).trim() };
  if (trimmed === 'INITIAL CALL NOTES (first contact with client):') return { key: 'initial-call-notes', title: 'Initial Call Notes' };
  if (trimmed === 'ENQUIRY NOTES:') return { key: 'enquiry-notes', title: 'Enquiry Notes' };
  if (trimmed === 'INSTRUCTION NOTES:') return { key: 'instruction-notes', title: 'Instruction Notes' };
  if (trimmed === 'CALL TRANSCRIPTS (conversations with client):') return { key: 'call-transcripts', title: 'Call Transcripts' };
  if (trimmed.startsWith('PITCH NOTES:')) return { key: 'pitch-notes', title: 'Pitch Notes', initialBody: trimmed.slice('PITCH NOTES:'.length).trim() };
  if (trimmed.startsWith('Generate all CCL intake fields for this matter.')) return { key: 'generation-instruction', title: 'Generation Instruction', initialBody: trimmed };
  return null;
}

export function getRelevantPromptSectionKeys(fieldKey?: string | null, confidence?: string | null): string[] {
  const normalizedFieldKey = String(fieldKey || '').trim();
  if (normalizedFieldKey && CCL_PROMPT_SECTION_PRIORITY[normalizedFieldKey]?.length) {
    return CCL_PROMPT_SECTION_PRIORITY[normalizedFieldKey];
  }

  switch (String(confidence || '').trim().toLowerCase()) {
    case 'data':
      return ['matter-context', 'deal-information'];
    case 'templated':
      return ['matter-context', 'instruction-notes'];
    case 'inferred':
      return ['pitch-email', 'initial-call-notes', 'enquiry-notes', 'instruction-notes', 'call-transcripts', 'deal-information', 'matter-context'];
    default:
      return ['matter-context', 'deal-information', 'pitch-email', 'initial-call-notes', 'enquiry-notes', 'instruction-notes', 'call-transcripts'];
  }
}

export function parseCclUserPromptSections(prompt: string): CclPromptSection[] {
  if (!prompt.trim()) return [];

  const sections: CclPromptSection[] = [];
  const lines = prompt.split(/\r?\n/);
  let activeKey = '';
  let activeTitle = '';
  let activeLines: string[] = [];

  const flushSection = () => {
    const body = activeLines.join('\n').trim();
    if (activeKey && body) {
      sections.push({ key: activeKey, title: activeTitle, body });
    }
  };

  for (const line of lines) {
    const detected = detectCclPromptSection(line);
    if (detected) {
      flushSection();
      activeKey = detected.key;
      activeTitle = detected.title;
      activeLines = detected.initialBody ? [detected.initialBody] : [];
      continue;
    }
    if (activeKey) {
      activeLines.push(line);
    }
  }

  flushSection();
  return sections;
}

export function filterMatterContextPrompt(body: string, relevantKeys: string[]): string {
  const lines = body.split(/\r?\n/);
  const matchers = relevantKeys.flatMap((key) => CCL_PROMPT_CONTEXT_LINE_MATCHERS[key] || []);
  if (matchers.length === 0) return body;
  const filtered = lines.filter((line) => matchers.some((matcher) => matcher.test(line)));
  return filtered.length > 0 ? filtered.join('\n').trim() : body;
}

export const CCL_REVIEW_FIELD_META: Record<string, CclReviewFieldMeta> = {
  insert_clients_name: { label: 'Client Name', group: 'Intro', anchor: 'intro', confidence: 'data', prompt: 'Source: Matter record client name. Should match exactly.' },
  insert_heading_eg_matter_description: { label: 'Matter Heading', group: 'Intro', anchor: 'intro', confidence: 'data', prompt: 'Source: Matter description or practice area from Clio. The RE: line the client sees.' },
  name_of_person_handling_matter: { label: 'Responsible Solicitor', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Team data. The fee earner assigned to this matter.' },
  status: { label: 'Role', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Team data. Job title exactly as it should appear.' },
  name: { label: 'Supervising Partner', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Team data. Person with overall supervisory responsibility.' },
  fee_earner_email: { label: 'Fee Earner Email', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Team data. Direct email for the fee earner.' },
  fee_earner_phone: { label: 'Fee Earner Phone', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Team data. Direct or office phone number.' },
  fee_earner_postal_address: { label: 'Fee Earner Postal Address', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Office address constant. Helix Law Brighton office.' },
  names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries: { label: 'Team Contact Details', group: 'Section 1 · Contact details', anchor: '1', confidence: 'data', prompt: 'Source: Team data. Colleagues who can assist when fee earner unavailable.' },
  insert_current_position_and_scope_of_retainer: { label: 'Scope of Retainer', group: 'Section 2 · Scope of services', anchor: '2', confidence: 'inferred', prompt: 'Source: Pitch email, deal description, initial call notes. AI writes 2-4 sentences describing what the client instructed Helix to do. CHECK: does this match what was actually discussed?' },
  next_steps: { label: 'Next Steps', group: 'Section 3 · Next steps', anchor: '3', confidence: 'inferred', prompt: 'Source: Call notes, pitch email. AI infers 2-3 next actions. CHECK: are these the actual agreed next steps, or generic practice-area boilerplate?' },
  realistic_timescale: { label: 'Realistic Timescale', group: 'Section 3 · Next steps', anchor: '3', confidence: 'unknown', prompt: 'No data source — timescale is not captured in any database. AI guesses from practice area norms. MUST be confirmed by fee earner.' },
  handler_hourly_rate: { label: 'Hourly Rate (£)', group: 'Section 4.1 · Our charges', anchor: '4.1', confidence: 'data', prompt: 'Source: Team data rate table. Number only.' },
  charges_estimate_paragraph: { label: 'Costs Estimate', group: 'Section 4.1 · Our charges', anchor: '4.1', confidence: 'inferred', prompt: 'Source: Deal.Amount + Pitch email. If a deal amount exists, the estimate should be built around it. CHECK: does the £ figure match what the client was told?' },
  disbursements_paragraph: { label: 'Disbursements', group: 'Section 4.2 · Disbursements', anchor: '4.2', confidence: 'templated', prompt: 'Standard per practice area. Property: Land Registry + search fees + SDLT. Employment: minimal. Construction: may include surveyor fees. CHECK: does this matter have unusual disbursements?' },
  costs_other_party_paragraph: { label: 'Other Side Costs', group: 'Section 4.3 · Other side costs', anchor: '4.3', confidence: 'inferred', prompt: 'Derived from: is there an opponent? Is this litigation? If no opponent → "We do not expect you will have to pay another party\'s costs." CHECK: correct for this matter.' },
  figure: { label: 'Payment on Account (£)', group: 'Section 6 · Payment on account', anchor: '6', confidence: 'data', prompt: 'Source: Deal.Amount (the agreed fee captured at deal stage). Number only, no £ sign. If Deal.Amount exists, this should equal it. If only PitchContent.Amount exists, use that. If NEITHER exists → unknown, must be set by fee earner.' },
  and_or_intervals_eg_every_three_months: { label: 'Costs Update Interval', group: 'Section 7 · Costs updates', anchor: '7', confidence: 'templated', prompt: 'Almost always " monthly" for Helix. Property conveyancing may use " on completion". Starts with a space.' },
  contact_details_for_marketing_opt_out: { label: 'Marketing Opt-out Contact', group: 'Section 11 · Marketing', anchor: '11', confidence: 'templated', prompt: 'Static: standard opt-out contact for Helix Law. Should not vary per matter.' },
  eid_paragraph: { label: 'EID Verification', group: 'Section 12 · AML / EID', anchor: '12', confidence: 'templated', prompt: 'Standard AML/EID wording. May vary by client type (individual vs company). CHECK: is the client type correct?' },
  may_will: { label: 'Court Proceedings Risk', group: 'Section 13 · Duties to the court', anchor: '13', confidence: 'inferred', prompt: 'Derived from practice area + call notes. "may" (proceedings possible) or "will" (proceedings certain). CHECK: has the client been advised proceedings are definite?' },
  explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement: { label: 'Referral / Fee Sharing Arrangement', group: 'Section 16 · Referral and fee sharing', anchor: '16', confidence: 'unknown', prompt: 'No data source — referral/introducer data is not captured in any table. Should be blank unless there is a known referral arrangement. CHECK with fee earner.' },
  instructions_link: { label: 'Instructions Link', group: 'Section 17 · Right to cancel', anchor: '17', confidence: 'templated', prompt: 'Static: standard cancellation instructions link/reference for Helix Law. Should not vary per matter.' },
  insert_next_step_you_would_like_client_to_take: { label: 'Action Required', group: 'Section 18 · Action points', anchor: '18', confidence: 'inferred', prompt: 'Source: Call notes, pitch email. AI infers a specific imperative action. CHECK: is this what was actually agreed with the client?' },
  state_why_this_step_is_important: { label: 'Why This Step Matters', group: 'Section 18 · Action points', anchor: '18', confidence: 'inferred', prompt: 'AI writes one sentence explaining why the client action matters. CHECK: is this accurate for this engagement?' },
  state_amount: { label: 'Action Table Payment Figure', group: 'Section 18 · Action points', anchor: '18', confidence: 'data', prompt: 'Must always equal the "figure" field. Same source: Deal.Amount.' },
  insert_consequence: { label: 'Non-payment Consequence', group: 'Section 18 · Action points', anchor: '18', confidence: 'templated', prompt: 'Standard: "we may not be able to start work on your matter" or similar. Rarely varies.' },
  describe_first_document_or_information_you_need_from_your_client: { label: 'Document Request 1', group: 'Section 18 · Action points', anchor: '18', confidence: 'inferred', prompt: 'Source: Call notes, practice area. AI names a specific document needed. CHECK: is this actually what you need from this client?' },
  describe_second_document_or_information_you_need_from_your_client: { label: 'Document Request 2', group: 'Section 18 · Action points', anchor: '18', confidence: 'inferred', prompt: 'Same as above — second document or information item.' },
  describe_third_document_or_information_you_need_from_your_client: { label: 'Document Request 3', group: 'Section 18 · Action points', anchor: '18', confidence: 'inferred', prompt: 'Same as above — third document or information item.' },
};

export function prettifyCclFieldKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const getDraftValue = (fields: Record<string, unknown>, key: string) => String(fields[key] || '').trim();

const normalizeInitialScopeValue = (value: string) => value
  .replace(/(?:\s*\(\s*["'“”]?Initial Scope["'“”]?\s*\)\s*)+$/i, '')
  .trim();

const hasOrScaffold = (value: string) => /(^|\n)\s*(or|OR)\s*($|\n)/.test(value);

const placeholderValue = (fields: Record<string, unknown>, key: string) => getDraftValue(fields, key) || `{{${key}}}`;

const inferChargesChoice = (fields: Record<string, unknown>) => {
  const raw = getDraftValue(fields, 'charges_estimate_paragraph');
  if (raw.includes('We cannot give an estimate of our overall charges')) return 'no_estimate' as const;
  if (raw.includes('I estimate the cost of the Initial Scope')) return 'hourly_rate' as const;
  return null;
};

const inferDisbursementsChoice = (fields: Record<string, unknown>) => {
  const raw = getDraftValue(fields, 'disbursements_paragraph');
  if (raw.includes('Description | Amount | VAT chargeable')) return 'table' as const;
  if (raw.includes('we do not expect disbursements to be a major feature at the outset of your matter')) return 'table' as const;
  if (raw.includes('We cannot give an exact figure for your disbursements')) return 'estimate' as const;
  if (raw.includes('At this stage we cannot give an exact figure for your disbursements')) return 'estimate' as const;
  return null;
};

const inferCostsChoice = (fields: Record<string, unknown>) => {
  const raw = getDraftValue(fields, 'costs_other_party_paragraph');
  if (raw.includes("We do not expect that you will have to pay another party's costs")) return 'no_costs' as const;
  if (raw.includes('There is a risk that you may have to pay')) return 'risk_costs' as const;
  return null;
};

export function buildChargesParagraph(fields: Record<string, unknown>, choice: 'hourly_rate' | 'no_estimate'): string {
  const raw = getDraftValue(fields, 'charges_estimate_paragraph');
  if (!hasOrScaffold(raw) && raw) {
    if (choice === 'hourly_rate' && raw.includes('I estimate the cost of the Initial Scope')) return raw;
    if (choice === 'no_estimate' && raw.includes('We cannot give an estimate of our overall charges')) return raw;
  }
  if (choice === 'hourly_rate') {
    return `I estimate the cost of the Initial Scope will be £${placeholderValue(fields, 'figure')} plus VAT.`;
  }
  return `We cannot give an estimate of our overall charges in this matter because ${placeholderValue(fields, 'we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible')}. The next stage in your matter is ${placeholderValue(fields, 'next_stage')} and we estimate that our charges up to the completion of that stage will be in the region of £${placeholderValue(fields, 'figure_or_range')}.`;
}

export function buildDisbursementsParagraph(fields: Record<string, unknown>, choice: 'table' | 'estimate'): string {
  const raw = getDraftValue(fields, 'disbursements_paragraph');
  if (!hasOrScaffold(raw) && raw) {
    if (choice === 'table' && (raw.includes('Description | Amount | VAT chargeable') || raw.includes('we do not expect disbursements to be a major feature at the outset of your matter'))) return raw;
    if (choice === 'estimate' && (raw.includes('We cannot give an exact figure for your disbursements') || raw.includes('At this stage we cannot give an exact figure for your disbursements'))) return raw;
  }
  if (choice === 'table') {
    return `Based on the information you have provided, we do not expect disbursements to be a major feature at the outset of your matter. If third-party expenses become necessary, such as court fees, counsel's fees, expert fees, search fees or similar external costs, we will discuss them with you in advance and, where possible, give you an estimate before we incur them on your behalf.`;
  }
  return `At this stage we cannot give an exact figure for your disbursements, but these are likely to be in the region of £${placeholderValue(fields, 'simple_disbursements_estimate')} for the next steps in your matter, including ${placeholderValue(fields, 'give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees')}. We will discuss any significant disbursement with you before it is incurred on your behalf.`;
}

export function buildCostsParagraph(fields: Record<string, unknown>, choice: 'no_costs' | 'risk_costs'): string {
  const raw = getDraftValue(fields, 'costs_other_party_paragraph');
  if (!hasOrScaffold(raw) && raw) {
    if (choice === 'no_costs' && raw.includes("We do not expect that you will have to pay another party's costs")) return raw;
    if (choice === 'risk_costs' && raw.includes('There is a risk that you may have to pay')) return raw;
  }
  if (choice === 'no_costs') {
    return "We do not expect that you will have to pay another party's costs. This only tends to arise in litigation and is therefore not relevant to your matter.";
  }
  return `There is a risk that you may have to pay ${placeholderValue(fields, 'identify_the_other_party_eg_your_opponents')} costs in this matter. This is explained in section 5, Funding and billing below.`;
}

export type CclStructuredReviewState = {
  fields: Record<string, string>;
  choices: {
    chargesChoice: 'hourly_rate' | 'no_estimate';
    disbursementsChoice: 'table' | 'estimate';
    costsChoice: 'no_costs' | 'risk_costs';
  };
};

export function resolveStructuredReviewFields(fields: Record<string, unknown>): CclStructuredReviewState {
  const chargesChoice = ((fields.charges_section_choice as 'hourly_rate' | 'no_estimate' | undefined) || inferChargesChoice(fields) || 'hourly_rate');
  const disbursementsChoice = ((fields.disbursements_section_choice as 'table' | 'estimate' | undefined) || inferDisbursementsChoice(fields) || 'estimate');
  const costsChoice = ((fields.costs_section_choice as 'no_costs' | 'risk_costs' | undefined) || inferCostsChoice(fields) || 'risk_costs');
  const resolvedFields = {
    ...fields,
    insert_current_position_and_scope_of_retainer: normalizeInitialScopeValue(getDraftValue(fields, 'insert_current_position_and_scope_of_retainer')),
    charges_section_choice: chargesChoice,
    disbursements_section_choice: disbursementsChoice,
    costs_section_choice: costsChoice,
    charges_estimate_paragraph: buildChargesParagraph(fields, chargesChoice),
    disbursements_paragraph: buildDisbursementsParagraph(fields, disbursementsChoice),
    costs_other_party_paragraph: buildCostsParagraph(fields, costsChoice),
  } as Record<string, string>;
  return {
    fields: resolvedFields,
    choices: { chargesChoice, disbursementsChoice, costsChoice },
  };
}

type BuildCclReviewDerivedFieldsInput = {
  rawDraft: Record<string, unknown>;
  normalizedDraft: Record<string, string>;
  aiFields: Record<string, unknown>;
  reviewedSet: Set<string>;
  pressureTestFieldScores?: Record<string, PressureTestFieldScore>;
  streamEntries: Array<{ key?: string | null; value?: string | null }>;
  cclStage?: string | null;
  cclStatus?: string | null;
  cclCreatedAt?: string | null;
  matterClientName?: string | null;
  matterDescription?: string | null;
  matterPracticeArea?: string | null;
  matterRecord?: Record<string, unknown>;
};

export function buildCclReviewDerivedFields({
  rawDraft,
  normalizedDraft,
  aiFields,
  reviewedSet,
  pressureTestFieldScores,
  streamEntries,
  cclStage,
  cclStatus,
  cclCreatedAt,
  matterClientName,
  matterDescription,
  matterPracticeArea,
  matterRecord = {},
}: BuildCclReviewDerivedFieldsInput) {
  const fieldMeta = CCL_REVIEW_FIELD_META;
  const aiFieldKeys = Object.keys(aiFields);
  const reviewedCount = aiFieldKeys.filter((key) => reviewedSet.has(key)).length;
  const totalAiFields = aiFieldKeys.length;
  const allReviewed = totalAiFields > 0 && reviewedCount === totalAiFields;
  const progressPct = totalAiFields > 0 ? Math.round((reviewedCount / totalAiFields) * 100) : 0;
  const orderedTemplateFieldKeys: string[] = [...CCL_ORDERED_REVIEW_FIELD_KEYS];
  const streamFieldValues = streamEntries.reduce((acc, entry) => {
    const key = String(entry?.key || '').trim();
    if (!key) return acc;
    const value = String(entry?.value || '').trim();
    if (!value) return acc;
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);
  const structuredReviewState = resolveStructuredReviewFields(normalizedDraft as Record<string, unknown>);
  const structuredReviewFields = structuredReviewState.fields;
  const structuredAiState = resolveStructuredReviewFields({ ...normalizedDraft, ...aiFields } as Record<string, unknown>);
  const structuredAiFields = structuredAiState.fields;
  const structuredPreviewState = resolveStructuredReviewFields({ ...aiFields, ...normalizedDraft } as Record<string, unknown>);
  const structuredPreviewFields = structuredPreviewState.fields;

  const genOptions: GenerationOptions = {
    costsChoice: structuredReviewState.choices.costsChoice,
    chargesChoice: structuredReviewState.choices.chargesChoice,
    disbursementsChoice: structuredReviewState.choices.disbursementsChoice,
    showEstimateExamples: false,
  };
  const rawPreviewTemplate = generateTemplateContent(DEFAULT_CCL_TEMPLATE, structuredPreviewFields, genOptions, true);
  const rawGeneratedContent = generateTemplateContent(DEFAULT_CCL_TEMPLATE, structuredPreviewFields, genOptions);
  const introPreviewTemplateStart = rawPreviewTemplate.search(/\bThank you for your instructions\b/);
  const introPreviewTemplate = introPreviewTemplateStart >= 0
    ? rawPreviewTemplate.slice(introPreviewTemplateStart)
    : rawPreviewTemplate;
  const unresolvedPlaceholders = Array.from(new Set(
    [...rawGeneratedContent.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => String(match[1] || '').trim()).filter(Boolean),
  ));
  const canApprove = ['generated', 'pressure-tested'].includes(getCanonicalCclStage(cclStage || cclStatus)) && unresolvedPlaceholders.length === 0;
  const setupDisplayFields = orderedTemplateFieldKeys.reduce((acc, key) => {
    const rawValue = String(streamFieldValues[key] || structuredReviewFields[key] || normalizedDraft[key] || '').trim();
    acc[key] = rawValue || `{{${key}}}`;
    return acc;
  }, {} as Record<string, string>);
  const visibleReviewFieldKeys = orderedTemplateFieldKeys.filter((key) => (
    !CCL_SUPPRESSED_REVIEW_FIELD_KEYS.has(key)
    && !!fieldMeta[key]
    && (
      !!String(normalizedDraft[key] || '').trim()
      || unresolvedPlaceholders.includes(key)
      || aiFieldKeys.includes(key)
    )
  ));
  const reviewFieldTypeMap: Record<string, 'set-wording' | 'verify'> = {};
  const effectiveReviewFieldKeys: string[] = [];
  for (const key of visibleReviewFieldKeys) {
    const isAiBacked = aiFieldKeys.includes(key);
    if (!isAiBacked) continue;
    const isUnresolved = unresolvedPlaceholders.includes(key);
    const isUnknownConfidence = fieldMeta[key]?.confidence === 'unknown';
    const isPtFlagged = !!pressureTestFieldScores?.[key]?.flag;
    if (isUnresolved || isUnknownConfidence) {
      reviewFieldTypeMap[key] = 'set-wording';
      effectiveReviewFieldKeys.push(key);
    } else if (isPtFlagged) {
      reviewFieldTypeMap[key] = 'verify';
      effectiveReviewFieldKeys.push(key);
    }
  }
  const setWordingCount = Object.values(reviewFieldTypeMap).filter((type) => type === 'set-wording').length;
  const verifyCount = Object.values(reviewFieldTypeMap).filter((type) => type === 'verify').length;
  const allClickableFieldKeys = effectiveReviewFieldKeys.length > 0 ? effectiveReviewFieldKeys : visibleReviewFieldKeys;
  const visibleReviewFieldCount = effectiveReviewFieldKeys.length;
  const confidenceBreakdown = { data: 0, inferred: 0, templated: 0, unknown: 0 };
  for (const key of aiFieldKeys) {
    const tier = fieldMeta[key]?.confidence;
    if (tier && tier in confidenceBreakdown) confidenceBreakdown[tier as keyof typeof confidenceBreakdown]++;
  }
  const populatedFieldCount = Object.keys(normalizedDraft).length;
  const structuredFieldCount = Object.keys(rawDraft)
    .filter((key) => rawDraft[key] !== null && rawDraft[key] !== undefined)
    .filter((key) => typeof rawDraft[key] === 'object')
    .length;
  const dateStr = cclCreatedAt
    ? new Date(cclCreatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const recipientName = String(normalizedDraft.insert_clients_name || matterClientName || '').trim();
  const recipientAddressRaw = String(
    normalizedDraft.insert_postal_address
    || normalizedDraft.client_address
    || matterRecord.client_address
    || matterRecord.clientAddress
    || '',
  ).trim();
  const recipientAddressLines = recipientAddressRaw
    ? recipientAddressRaw
      .split(/\r?\n/)
      .flatMap((line) => line.split(/\s*,\s*/))
      .map((line) => line.trim())
      .filter(Boolean)
    : [];
  const recipientMatterHeading = String(
    normalizedDraft.insert_heading_eg_matter_description
    || matterDescription
    || matterPracticeArea
    || '',
  ).trim();
  const previewPlaceholderPromptPresent = /\[[^\]]+\]/.test(rawPreviewTemplate);

  return {
    fieldMeta,
    aiFieldKeys,
    reviewedCount,
    totalAiFields,
    allReviewed,
    progressPct,
    orderedTemplateFieldKeys,
    streamFieldValues,
    structuredReviewState,
    structuredReviewFields,
    structuredAiFields,
    structuredPreviewFields,
    rawPreviewTemplate,
    introPreviewTemplate,
    unresolvedPlaceholders,
    canApprove,
    setupDisplayFields,
    visibleReviewFieldKeys,
    reviewFieldTypeMap,
    effectiveReviewFieldKeys,
    setWordingCount,
    verifyCount,
    allClickableFieldKeys,
    visibleReviewFieldCount,
    confidenceBreakdown,
    populatedFieldCount,
    structuredFieldCount,
    dateStr,
    recipientName,
    recipientAddressLines,
    recipientMatterHeading,
    previewPlaceholderPromptPresent,
  };
}

const CCL_REVIEW_FIELD_DATA_FED_KEYS: Record<string, string[]> = {
  insert_current_position_and_scope_of_retainer: ['practiceArea', 'description', 'clientName', 'typeOfWork'],
  next_steps: ['practiceArea', 'description', 'clientName', 'next_steps'],
  realistic_timescale: ['practiceArea', 'description', 'typeOfWork'],
  charges_estimate_paragraph: ['practiceArea', 'description', 'figure', 'state_amount', 'clientName'],
  disbursements_paragraph: ['practiceArea', 'description', 'clientType'],
  costs_other_party_paragraph: ['practiceArea', 'description', 'opponent'],
  may_will: ['practiceArea', 'description', 'opponent'],
  insert_next_step_you_would_like_client_to_take: ['practiceArea', 'description', 'clientName', 'next_steps'],
  state_why_this_step_is_important: ['practiceArea', 'description', 'clientName', 'next_steps'],
  describe_first_document_or_information_you_need_from_your_client: ['practiceArea', 'description', 'clientType'],
  describe_second_document_or_information_you_need_from_your_client: ['practiceArea', 'description', 'clientType'],
  describe_third_document_or_information_you_need_from_your_client: ['practiceArea', 'description', 'clientType'],
  eid_paragraph: ['clientType', 'clientName', 'description'],
};

type BuildCclReviewSelectionSupportInput = {
  selectedFieldKey: string | null;
  selectedFieldConfidence?: CclReviewFieldConfidence | null;
  aiReq?: {
    practiceArea?: unknown;
    description?: unknown;
    clientName?: unknown;
    handlerName?: unknown;
    handlerRole?: unknown;
    handlerRate?: unknown;
    instructionRef?: unknown;
  } | null;
  aiContextFields?: Record<string, unknown>;
  aiContextSnippets?: Record<string, unknown>;
  userPromptText: string;
  structuredReviewFields: Record<string, string>;
  normalizedDraft: Record<string, string>;
  fieldMeta: Record<string, CclReviewFieldMeta>;
  orderedTemplateFieldKeys: string[];
  effectiveAiBaseFields: Record<string, string>;
  aiFields: Record<string, unknown>;
  reviewedSet: Set<string>;
  unresolvedPlaceholders: string[];
};

type CclReviewCueTone = 'static' | 'ai' | 'placeholder' | 'mail-merge';

export function buildCclReviewSelectionSupport({
  selectedFieldKey,
  selectedFieldConfidence,
  aiReq,
  aiContextFields = {},
  aiContextSnippets = {},
  userPromptText,
  structuredReviewFields,
  normalizedDraft,
  fieldMeta,
  orderedTemplateFieldKeys,
  effectiveAiBaseFields,
  aiFields,
  reviewedSet,
  unresolvedPlaceholders,
}: BuildCclReviewSelectionSupportInput) {
  const requestValueByKey: Record<string, string> = {
    practiceArea: String(aiReq?.practiceArea || aiContextFields.practiceArea || ''),
    description: String(aiReq?.description || aiContextFields.typeOfWork || aiContextFields.description || ''),
    clientName: String(aiReq?.clientName || aiContextFields.clientName || ''),
    handlerName: String(aiReq?.handlerName || aiContextFields.handlerName || ''),
    handlerRole: String(aiReq?.handlerRole || aiContextFields.handlerRole || ''),
    handlerRate: String(aiReq?.handlerRate || aiContextFields.handlerRate || ''),
    instructionRef: String(aiReq?.instructionRef || aiContextFields.instructionRef || ''),
    figure: String(structuredReviewFields.figure || normalizedDraft.figure || ''),
    state_amount: String(structuredReviewFields.state_amount || normalizedDraft.state_amount || ''),
    next_steps: String(aiContextFields.nextSteps || ''),
    typeOfWork: String(aiContextFields.typeOfWork || ''),
    opponent: String(aiContextFields.opponent || ''),
    clientType: String(aiContextFields.clientType || ''),
  };
  const selectedFieldDataKeys = selectedFieldKey
    ? (CCL_REVIEW_FIELD_DATA_FED_KEYS[selectedFieldKey] || ['practiceArea', 'description', 'clientName', 'handlerName'])
    : [];
  const selectedFieldDataFedRows = selectedFieldDataKeys
    .map((key) => ({
      key,
      label: prettifyCclFieldKey(key),
      value: String(requestValueByKey[key] || '').trim(),
    }))
    .filter((row, index, rows) => row.value && rows.findIndex((candidate) => candidate.key === row.key) === index);
  const selectedFieldSnippetRows = Object.entries(aiContextSnippets)
    .filter(([key, value]) => !!String(value || '').trim() && (!selectedFieldKey || key.toLowerCase().includes(selectedFieldKey.toLowerCase()) || selectedFieldDataKeys.some((candidate) => key.toLowerCase().includes(candidate.toLowerCase()))))
    .map(([key, value]) => ({ key, label: prettifyCclFieldKey(key), value: String(value || '').trim() }));
  const userPromptSections = parseCclUserPromptSections(userPromptText);
  const selectedFieldPromptSectionKeys = getRelevantPromptSectionKeys(selectedFieldKey, selectedFieldConfidence);
  const selectedFieldPromptSections = selectedFieldPromptSectionKeys
    .map((sectionKey) => userPromptSections.find((section) => section.key === sectionKey) || null)
    .filter((section): section is CclPromptSection => !!section)
    .map((section) => ({
      ...section,
      body: section.key === 'matter-context'
        ? filterMatterContextPrompt(section.body, selectedFieldDataKeys)
        : section.body,
    }))
    .filter((section) => !!section.body.trim());
  const placeholderLabels = Object.fromEntries(Object.entries(fieldMeta).map(([key, meta]) => [key, meta.label]));
  const godModeFieldOptions = [
    ...orderedTemplateFieldKeys,
    ...Object.keys(fieldMeta).filter((key) => !orderedTemplateFieldKeys.includes(key)),
    ...Object.keys(structuredReviewFields).filter((key) => !orderedTemplateFieldKeys.includes(key) && !(key in fieldMeta)),
  ];
  const previewFieldStates = orderedTemplateFieldKeys.reduce((acc, key) => {
    const baseValue = String(effectiveAiBaseFields[key] || '').trim();
    const aiValue = String(aiFields[key] || '').trim();
    const currentValue = String(structuredReviewFields[key] || normalizedDraft[key] || '').trim();
    const isAiGenerated = !!aiValue && !baseValue;
    const isAiUpdated = !!aiValue && !!baseValue && aiValue !== baseValue;
    const isReviewed = reviewedSet.has(key);
    const isUnresolved = unresolvedPlaceholders.includes(key);
    const isMailMergeValue = !!currentValue && !isUnresolved && !isAiGenerated && !isAiUpdated;
    if (isMailMergeValue || isAiGenerated || isAiUpdated || isReviewed || isUnresolved) {
      acc[key] = { isMailMergeValue, isAiGenerated, isAiUpdated, isReviewed, isUnresolved };
    }
    return acc;
  }, {} as Record<string, { isMailMergeValue?: boolean; isAiGenerated?: boolean; isAiUpdated?: boolean; isReviewed?: boolean; isUnresolved?: boolean }>);
  const selectedFieldState = selectedFieldKey ? previewFieldStates[selectedFieldKey] : undefined;
  const selectedFieldCueLabel = selectedFieldState?.isUnresolved
    ? 'AI placeholder'
    : (selectedFieldState?.isAiGenerated || selectedFieldState?.isAiUpdated)
      ? 'AI output'
      : selectedFieldState?.isMailMergeValue
        ? 'Mail merge'
        : 'Static text';
  const selectedFieldCueTone: CclReviewCueTone = selectedFieldState?.isUnresolved
    ? 'placeholder'
    : (selectedFieldState?.isAiGenerated || selectedFieldState?.isAiUpdated)
      ? 'ai'
      : selectedFieldState?.isMailMergeValue
        ? 'mail-merge'
        : 'static';

  return {
    selectedFieldDataFedRows,
    selectedFieldSnippetRows,
    selectedFieldPromptSections,
    placeholderLabels,
    godModeFieldOptions,
    previewFieldStates,
    selectedFieldCueLabel,
    selectedFieldCueTone,
  };
}

type BuildCclReviewRailSupportInput = {
  effectiveReviewFieldKeys: string[];
  allClickableFieldKeys: string[];
  selectedFieldKey: string | null;
  reviewedSet: Set<string>;
  fieldMeta: Record<string, CclReviewFieldMeta>;
  structuredReviewFields: Record<string, string>;
  normalizedDraft: Record<string, string>;
  visibleReviewFieldCount: number;
  pressureTestFieldScores?: Record<string, PressureTestFieldScore>;
};

export function buildCclReviewRailSupport({
  effectiveReviewFieldKeys,
  allClickableFieldKeys,
  selectedFieldKey,
  reviewedSet,
  fieldMeta,
  structuredReviewFields,
  normalizedDraft,
  visibleReviewFieldCount,
  pressureTestFieldScores,
}: BuildCclReviewRailSupportInput) {
  const reviewedDecisionCount = effectiveReviewFieldKeys.filter((key) => reviewedSet.has(key)).length;
  const selectedFieldSequence = selectedFieldKey && !effectiveReviewFieldKeys.includes(selectedFieldKey)
    ? allClickableFieldKeys
    : effectiveReviewFieldKeys;
  const selectedFieldSequenceCount = selectedFieldSequence.length;
  const currentDecisionNumber = selectedFieldKey
    ? Math.max(selectedFieldSequence.indexOf(selectedFieldKey) + 1, 1)
    : 0;
  const selectedFieldIndex = selectedFieldKey ? selectedFieldSequence.indexOf(selectedFieldKey) : -1;
  const nextDecisionFieldKey = selectedFieldIndex >= 0
    ? selectedFieldSequence.slice(selectedFieldIndex + 1).find((key) => !reviewedSet.has(key))
      || selectedFieldSequence[selectedFieldIndex + 1]
      || null
    : null;
  const previousDecisionFieldKey = selectedFieldIndex > 0
    ? selectedFieldSequence[selectedFieldIndex - 1]
    : null;
  const selectionProgressPercent = visibleReviewFieldCount > 0
    ? Math.min(100, Math.max(0, (reviewedDecisionCount / visibleReviewFieldCount) * 100))
    : 0;
  const queueStripItems = selectedFieldSequence.map((key) => {
    const meta = fieldMeta[key];
    const ptScore = pressureTestFieldScores?.[key];
    const isUnresolved = meta?.confidence === 'unknown'
      || !String(structuredReviewFields[key] || normalizedDraft[key] || '').trim();
    return {
      key,
      label: meta?.label || prettifyCclFieldKey(key),
      group: meta?.group,
      reviewed: reviewedSet.has(key),
      flagged: !!ptScore?.flag,
      unresolved: isUnresolved,
    };
  });

  return {
    reviewedDecisionCount,
    selectedFieldSequenceCount,
    currentDecisionNumber,
    nextDecisionFieldKey,
    previousDecisionFieldKey,
    selectionProgressPercent,
    queueStripItems,
  };
}