/** Enquiry ID normalisation & matching helpers. */

export const normaliseId = (value: any): string | null => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return String(numeric);
  return raw.toLowerCase();
};

export const resolveEnquiryKeys = (enquiry: any): string[] => {
  const rawKeys = [
    enquiry?.ID,
    enquiry?.id,
    enquiry?.acid,
    enquiry?.ACID,
    enquiry?.Acid,
  ];
  return rawKeys.map(normaliseId).filter(Boolean) as string[];
};
