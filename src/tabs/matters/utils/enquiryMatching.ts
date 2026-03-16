/** Enquiry ID normalisation & matching helpers.
 *
 * ID taxonomy across the two enquiry databases:
 * - Legacy (Core Data): `enquiries.ID` = auto-increment PK. Also served as the
 *   ActiveCampaign bridge (Deals.ProspectId = enquiries.ID).
 * - New space (Instructions DB): `enquiries.id` = auto-increment internal PK.
 *   `enquiries.acid` = ActiveCampaign contact ID (bridges to Deals.ProspectId).
 *   These are DIFFERENT values — `id` is the new-space's own PK, `acid` is the AC link.
 * - Deals.ProspectId = ActiveCampaign contact ID, NOT the new-space internal PK.
 */

export const normaliseId = (value: any): string | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return String(numeric);
  return raw.toLowerCase();
};

/**
 * Returns all plausible keys an enquiry record can be matched by.
 * Includes both the internal PK (id/ID) and the ActiveCampaign contact ID (acid)
 * so that matching works regardless of which value Deals.ProspectId carries.
 */
export const resolveEnquiryKeys = (enquiry: any): string[] => {
  const rawKeys = [
    enquiry?.ID,              // Legacy PK (also the AC bridge for legacy records)
    enquiry?.id,              // New-space internal PK
    enquiry?.acid,            // ActiveCampaign contact ID (new-space)
    enquiry?.ACID,
    enquiry?.Acid,
    enquiry?.pitchEnquiryId,  // Instruct-pitch portal ID
  ];
  return rawKeys.map(normaliseId).filter(Boolean) as string[];
};
