import type { Enquiry } from './types';

export type EnquirySourceBias = 'legacy-primary' | 'new-primary' | 'legacy-only' | 'new-only';
export type EnquiryProcessingSource = 'legacy' | 'new';
export type EnquiryProcessingApproach = 'unified' | 'area-personalised';

export const DEFAULT_ENQUIRY_SOURCE_BIAS: EnquirySourceBias = 'new-primary';
export const DEFAULT_ENQUIRY_PROCESSING_APPROACH: EnquiryProcessingApproach = 'area-personalised';

export function appendDefaultEnquiryProcessingParams(params: URLSearchParams): URLSearchParams {
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