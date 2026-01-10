type UnknownRecord = Record<string, unknown>;

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  if (lowered === '—' || lowered === 'undefined' || lowered === 'null') return null;

  return trimmed;
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object') return null;
  return value as UnknownRecord;
}

function pickFirst(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const s = asNonEmptyString(candidate);
    if (s) return s;
  }
  return null;
}

/**
 * Attempts to resolve the ActiveCampaign *contact* ID for an instruction/deal item.
 *
 * Notes:
 * - Some records carry multiple numeric IDs (e.g. deal/prospect IDs) that can be
 *   mistaken for a contact ID. We prioritise explicit contact fields and the
 *   instruction-level ACID/acid before any deal-level ProspectId fallbacks.
 */
export function resolveActiveCampaignContactId(rawData: unknown): string | null {
  const root = asRecord(rawData);
  if (!root) return null;

  const instruction = asRecord(root.instruction);
  const deal = asRecord(root.deal);

  return pickFirst(
    root.acContactId,
    root.AC_ContactId,
    root.ActiveCampaignId,
    instruction?.AC_ContactId,
    instruction?.ActiveCampaignId,
    instruction?.acContactId,
    instruction?.acid,
    (instruction as any)?.ACID,
    instruction?.ProspectId,
    instruction?.prospectId,
    deal?.ProspectId,
    deal?.prospectId,
    root.ProspectId,
    root.prospectId,
  );
}
