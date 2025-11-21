import { Enquiry } from '../../app/functionality/types';

const SHARED_PROSPECT_IDS = new Set(['28609', '23849', '26069']);

const normaliseId = (value: unknown): string => {
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
};

const normaliseEmail = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
};

export const isGenericProspectEmail = (email?: string | null): boolean => {
  const normalised = normaliseEmail(email);
  if (!normalised) {
    return true;
  }
  return normalised.includes('prospects@') || normalised.includes('team@');
};

export const isSharedProspectRecord = (record: Partial<Enquiry> | any): boolean => {
  const id = record?.ID ?? record?.id;
  const normalisedId = normaliseId(id);
  if (!normalisedId) {
    return false;
  }
  return SHARED_PROSPECT_IDS.has(normalisedId);
};

export const shouldAlwaysShowProspectHistory = (record: Partial<Enquiry> | any): boolean => {
  // CRITICAL FIX: Always show history for shared prospect IDs regardless of email type
  // This ensures all records with IDs 28609, 23849, 26069 get full history treatment,
  // whether they have personal emails (Andy Gelder, Matt Talaie) or generic emails
  return isSharedProspectRecord(record);
};
