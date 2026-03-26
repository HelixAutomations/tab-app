import type { Enquiry } from './types';

export type EnquirySourceBias = 'legacy-primary' | 'new-primary' | 'legacy-only' | 'new-only';
export type EnquirySourcePolicy = 'operational' | 'reporting' | 'reconciliation';
export type EnquiryProcessingSource = 'legacy' | 'new';
export type EnquiryProcessingApproach = 'unified' | 'area-personalised';

const VALID_ENQUIRY_SOURCE_BIASES: EnquirySourceBias[] = ['legacy-primary', 'new-primary', 'legacy-only', 'new-only'];
const VALID_ENQUIRY_SOURCE_POLICIES: EnquirySourcePolicy[] = ['operational', 'reporting', 'reconciliation'];

function normaliseEnquirySourceBias(value: string | undefined): EnquirySourceBias {
  const candidate = String(value || '').trim().toLowerCase() as EnquirySourceBias;
  return VALID_ENQUIRY_SOURCE_BIASES.includes(candidate) ? candidate : 'new-only';
}

function normaliseEnquirySourcePolicy(value: string | undefined): EnquirySourcePolicy {
  const candidate = String(value || '').trim().toLowerCase() as EnquirySourcePolicy;
  return VALID_ENQUIRY_SOURCE_POLICIES.includes(candidate) ? candidate : 'operational';
}

export const DEFAULT_ENQUIRY_SOURCE_BIAS: EnquirySourceBias = normaliseEnquirySourceBias(
  process.env.REACT_APP_ENQUIRY_SOURCE_BIAS_DEFAULT,
);
export const DEFAULT_ENQUIRY_SOURCE_POLICY: EnquirySourcePolicy = normaliseEnquirySourcePolicy(
  process.env.REACT_APP_ENQUIRY_SOURCE_POLICY_DEFAULT,
);
export const DEFAULT_ENQUIRY_PROCESSING_APPROACH: EnquiryProcessingApproach = 'area-personalised';

export function appendDefaultEnquiryProcessingParams(params: URLSearchParams): URLSearchParams {
  params.set('sourcePolicy', DEFAULT_ENQUIRY_SOURCE_POLICY);
  params.set('sourceBias', DEFAULT_ENQUIRY_SOURCE_BIAS);
  params.set('processingApproach', DEFAULT_ENQUIRY_PROCESSING_APPROACH);
  return params;
}

export function resolveEnquiryProcessingIdentity(enquiry: Partial<Enquiry> | null | undefined): {
  enquiryId: string;
  source: EnquiryProcessingSource;
} {
  const enquiryId = String(enquiry?.processingEnquiryId ?? enquiry?.pitchEnquiryId ?? enquiry?.ID ?? '').trim();
  const source = String(enquiry?.processingSource ?? '').trim().toLowerCase() === 'legacy' ? 'legacy' : 'new';

  return { enquiryId, source };
}

export function enquiryReferencesId(enquiry: Partial<Enquiry> | null | undefined, candidateId: string | number | null | undefined): boolean {
  const normalisedCandidateId = String(candidateId ?? '').trim();
  if (!normalisedCandidateId) return false;

  const knownIds = [
    enquiry?.ID,
    enquiry?.processingEnquiryId,
    enquiry?.pitchEnquiryId,
    enquiry?.legacyEnquiryId,
  ].map((value) => String(value ?? '').trim()).filter(Boolean);

  return knownIds.includes(normalisedCandidateId);
}

export function buildEnquiryMutationPayload(
  enquiry: Partial<Enquiry> | null | undefined,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  const { enquiryId, source } = resolveEnquiryProcessingIdentity(enquiry);

  return {
    ID: String(enquiry?.ID ?? enquiryId ?? '').trim(),
    processingEnquiryId: enquiryId,
    processingSource: source,
    ...updates,
  };
}