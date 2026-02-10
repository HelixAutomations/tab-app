import type { Enquiry } from '../app/functionality/types';

/**
 * Heuristically detect whether a raw enquiry record comes from the NEW
 * (instructions-db) or LEGACY (core-data-db) schema.
 *
 * Pure function — no component dependencies.
 */
export function detectSourceType(enq: Record<string, unknown>): 'new' | 'legacy' {
  // Heuristics for NEW dataset:
  // 1. Presence of distinctly lower-case schema keys (id + datetime)
  // 2. Presence of pipeline fields 'stage' or 'claim'
  // 3. Absence of ANY spaced legacy keys (e.g. "Display Number") combined with at least one expected lower-case key
  const hasLowerCore = 'id' in enq && 'datetime' in enq;
  const hasPipeline = 'stage' in enq || 'claim' in enq;
  if (hasLowerCore || hasPipeline) return 'new';
  const hasSpacedKey = Object.keys(enq).some(k => k.includes(' '));
  const hasAnyLowerCompact = ['aow', 'poc', 'notes', 'rep', 'email'].some(k => k in enq);
  if (!hasSpacedKey && hasAnyLowerCompact) return 'new';
  return 'legacy';
}

export type NormalizedEnquiry = Enquiry & { __sourceType: 'new' | 'legacy'; [k: string]: unknown };

/**
 * Normalise a raw enquiry record into the canonical `Enquiry` shape.
 *
 * Handles both NEW (lower-case/compact keys) and LEGACY (PascalCase/spaced keys)
 * schemas so callers don't have to care about the source.
 */
export function normalizeEnquiry(raw: Record<string, unknown>): NormalizedEnquiry {
  const sourceType = detectSourceType(raw);
  return {
    ...raw,
    ID: (raw.ID as string) || (raw.id as string)?.toString(),
    Touchpoint_Date: raw.Touchpoint_Date || raw.datetime,
    Point_of_Contact: raw.Point_of_Contact || raw.poc,
    Area_of_Work: raw.Area_of_Work || raw.aow,
    Type_of_Work: raw.Type_of_Work || raw.tow,
    Method_of_Contact: raw.Method_of_Contact || raw.moc,
    First_Name: raw.First_Name || raw.first,
    Last_Name: raw.Last_Name || raw.last,
    Email: raw.Email || raw.email,
    Phone_Number: raw.Phone_Number || raw.phone,
    Value: raw.Value || raw.value,
    Initial_first_call_notes: raw.Initial_first_call_notes || raw.notes,
    Call_Taker: raw.Call_Taker || raw.rep,
    // Preserve claim timestamp from instructions enquiries; legacy stays null
    claim: raw.claim ?? null,
    // Map Ultimate_Source to source field for enquiry cards
    source: raw.source || raw.Ultimate_Source || 'originalForward',
    __sourceType: sourceType,
  } as unknown as NormalizedEnquiry;
}
