/**
 * Utilities to normalize enquiry source across inconsistent fields.
 * Keeps logic self-contained and side-effect free so the UI can rely on a consistent label.
 */

export type NormalizedEnquirySource = {
  /** Human-friendly label used for grouping in the UI */
  label: string;
  /** Machine-friendly category key for downstream use if needed */
  key: string;
  /** Optional detail such as referrer name or campaign */
  detail?: string;
};

const toStr = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

function safeLower(v: unknown): string {
  return toStr(v).trim().toLowerCase();
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getUtmParams(url: string): { source?: string; medium?: string; campaign?: string } {
  try {
    const u = new URL(url);
    const params = u.searchParams;
    return {
      source: params.get('utm_source') || undefined,
      medium: params.get('utm_medium') || undefined,
      campaign: params.get('utm_campaign') || undefined,
    };
  } catch {
    return {};
  }
}

function hasGclid(v: unknown): boolean {
  // Some rows store GCLID in its own column; sometimes within the URL
  const s = safeLower(v);
  if (!s) return false;
  return s.includes('gclid=') || s.length > 0; // explicit column is often a long token
}

function looksLikeFacebookLead(notes: string, campaign: string): boolean {
  const n = notes.toLowerCase();
  const c = campaign.toLowerCase();
  return n.includes('facebook lead id') || c.includes('facebook');
}

export function hasGoogleAdsPaidSignal(entry: Record<string, unknown>): boolean {
  const source = safeLower(entry.source ?? entry.Source ?? entry['Source of Enquiry'] ?? entry['Ultimate Source'] ?? entry.Ultimate_Source);
  const medium = safeLower(entry.medium ?? entry.Medium ?? entry.utm_medium);
  const campaign = safeLower(entry.campaign ?? entry.Campaign ?? entry.utm_campaign);
  const gclid = safeLower(entry.gclid ?? entry.GCLID);
  const url = safeLower(entry.url ?? entry.Referral_URL ?? entry.referral_url);

  const hasGoogleAdsSource = source.includes('google ads') || source.includes('adwords') || source.includes('paid search');
  const hasGoogleAdsMedium = medium.includes('cpc') || medium.includes('ppc');
  const hasGoogleAdsUrl = url.includes('utm_source=google') && (url.includes('utm_medium=cpc') || url.includes('utm_medium=ppc'));
  const hasGoogleAdsCampaign = campaign.includes('google ads') || campaign.includes('adwords');

  return Boolean(gclid || hasGoogleAdsSource || hasGoogleAdsMedium || hasGoogleAdsUrl || hasGoogleAdsCampaign);
}

const SYSTEM_SOURCE_MARKERS = new Set(['instructions', 'legacy', 'core-data', 'core data', 'new']);

function firstMarketingSource(e: Record<string, unknown>): { raw: string; normalized: string } {
  const candidates = [
    e.Ultimate_Source,
    e.ultimate_source,
    e['Ultimate Source'],
    e.Enquiry_Source,
    e.enquiry_source,
    e['Enquiry Source'],
    e.Source_of_Enquiry,
    e.source_of_enquiry,
    e['Source of Enquiry'],
    e.Lead_Source,
    e.lead_source,
    e['Lead Source'],
    e.Marketing_Source,
    e.marketing_source,
    e['Marketing Source'],
    e.Source,
    e.source,
  ];

  for (const value of candidates) {
    const raw = toStr(value).trim();
    const normalized = safeLower(raw);
    if (!normalized || SYSTEM_SOURCE_MARKERS.has(normalized)) continue;
    return { raw, normalized };
  }
  return { raw: '', normalized: '' };
}

/**
 * Derive a normalized source from an enquiry record with mixed schema.
 * Priority order:
 * 1) Paid search (Google Ads): explicit gclid OR utm_source=google with cpc/ppc OR ultimate_source contains 'google ads'
 * 2) ChatGPT: utm_source chatgpt or referral domain includes chatgpt.com/searchgpt
 * 3) Facebook Lead Ads: indicators in notes/campaign or referral domain facebook
 * 4) Organic search: explicit label or utm_medium=organic
 * 5) Referral: Contact_Referrer / Referring_Company present
 * 6) Operations (explicit)
 * 7) Website (helix-law domain without UTM)
 * 8) Direct (fallback for MOC-based values)
 * 9) Unknown
 */
export function getNormalizedEnquirySource(raw: unknown): NormalizedEnquirySource {
  const e = (raw ?? {}) as Record<string, unknown>;
  const sourceValue = firstMarketingSource(e);
  const ultimate = sourceValue.normalized;
  const contactRef = toStr(e.Contact_Referrer ?? (e as any).contact_referrer).trim();
  const referringCompany = toStr(e.Referring_Company ?? (e as any).referring_company).trim();
  const url = toStr(e.Referral_URL ?? (e as any).referral_url).trim();
  const campaign = toStr(e.Campaign ?? (e as any).campaign).trim();
  const gclid = toStr(e.GCLID ?? (e as any).gclid).trim();
  const notes = toStr(e.Initial_first_call_notes ?? (e as any).notes).trim();

  // Skip if ultimate source is actually a contact method (data cleaning)
  const contactMethods = ['phone call', 'phone', 'call in', 'direct email', 'web form', 'website form', 'online form', 'chat', 'chatgpt'];
  const isUltimateActuallyMOC = contactMethods.some(method => ultimate.includes(method));

  // 1) Google Ads (paid search) — only when explicit Google Ads / GCLID / Google CPC signals exist
  const utm = url ? getUtmParams(url) : {};
  const hasPaidMedium = safeLower(utm.medium).includes('cpc') || safeLower(utm.medium).includes('ppc');
  const googleAdsPaidSignal = hasGoogleAdsPaidSignal({
    source: sourceValue.raw,
    medium: utm.medium,
    campaign: campaign || utm.campaign,
    gclid,
    url,
    Ultimate_Source: e.Ultimate_Source,
    Source: e.Source,
    'Source of Enquiry': e['Source of Enquiry'],
  });
  if (
    hasGclid(gclid) ||
    (safeLower(utm.source) === 'google' && (hasPaidMedium || ultimate.includes('paid') || ultimate.includes('ads'))) ||
    (googleAdsPaidSignal && !isUltimateActuallyMOC)
  ) {
    return { key: 'google_ads', label: 'Google Ads', detail: campaign || utm.campaign };
  }

  // 2) ChatGPT (as a source, not MOC)
  const domain = url ? extractDomain(url) : null;
  if (
    domain === 'chatgpt.com' ||
    ultimate.includes('searchgpt') || 
    url.includes('utm_source=chatgpt')
  ) {
    return { key: 'chatgpt', label: 'ChatGPT', detail: utm.campaign };
  }

  // 3) Meta Ads (Facebook/Instagram)
  if (
    domain === 'facebook.com' || domain === 'm.facebook.com' ||
    looksLikeFacebookLead(notes, campaign) ||
    (ultimate.includes('facebook') && !isUltimateActuallyMOC)
  ) {
    return { key: 'meta_ads', label: 'Meta Ads', detail: campaign };
  }

  // 4) Organic Search (amalgamate organic search, plain organic, SEO and google organic)
  if ((ultimate === 'organic' && !isUltimateActuallyMOC) ||
      (ultimate === 'seo' && !isUltimateActuallyMOC) ||
      (ultimate.includes('organic search') && !isUltimateActuallyMOC) ||
      (ultimate.includes('search engine') && !isUltimateActuallyMOC) ||
      (ultimate.includes('natural search') && !isUltimateActuallyMOC) ||
      (ultimate.includes('google organic') && !isUltimateActuallyMOC) ||
      safeLower(utm.medium) === 'organic') {
    return { key: 'organic', label: 'Organic search' };
  }

  // 5) Referral sources
  if (referringCompany) return { key: 'referral_company', label: `Referral: ${referringCompany}`, detail: referringCompany };
  if (contactRef) return { key: 'referral_contact', label: 'Referral', detail: contactRef };

  // 6) Operations (explicit flag often used internally)
  if (ultimate === 'operations') return { key: 'operations', label: 'Operations' };

  // 7) Actual source value (when not a contact method)
  if (ultimate && !isUltimateActuallyMOC) {
    return { key: ultimate.replace(/\s+/g, '_'), label: sourceValue.raw };
  }

  // 8) Not Recorded (when source is empty or was actually a contact method)
  return { key: 'not_recorded', label: 'Not Recorded' };
}

export function getNormalizedEnquirySourceLabel(raw: unknown): string {
  return getNormalizedEnquirySource(raw).label;
}

/**
 * Get normalized Method of Contact from enquiry record
 */
export function getNormalizedEnquiryMOC(raw: unknown): NormalizedEnquirySource {
  const e = (raw ?? {}) as Record<string, unknown>;
  const moc = safeLower(e.Method_of_Contact ?? (e as any).method_of_contact ?? (e as any).moc);
  const ultimate = safeLower(e.Ultimate_Source ?? (e as any).source ?? (e as any).Source);

  // If ultimate source is actually a contact method, use it
  if (ultimate.includes('phone call') || ultimate.includes('phone') || ultimate === 'call in') {
    return { key: 'phone', label: 'Phone call' };
  }
  if (ultimate.includes('website form') || ultimate.includes('web form') || ultimate.includes('online form')) {
    return { key: 'web_form', label: 'Website form' };
  }
  if (ultimate.includes('chatgpt') || ultimate.includes('chat')) {
    return { key: 'chat', label: 'Live chat' };
  }
  if (ultimate.includes('email')) {
    return { key: 'email', label: 'Email' };
  }

  // Use MOC field
  if (moc === 'direct email' || moc === 'email') return { key: 'email', label: 'Email' };
  if (moc === 'call in' || moc === 'phone' || moc === 'phone call' || moc === 'telephone') return { key: 'phone', label: 'Phone call' };
  if (moc === 'web form' || moc === 'website form' || moc === 'online form' || moc === 'contact form') return { key: 'web_form', label: 'Website form' };
  if (moc === 'live chat' || moc === 'chat' || moc === 'chatgpt') return { key: 'chat', label: 'Live chat' };
  if (moc === 'in-person' || moc === 'walk-in') return { key: 'in_person', label: 'In-person' };

  // Fallback
  if (moc) return { key: moc.replace(/\s+/g, '_'), label: toStr(e.Method_of_Contact as any) || toStr((e as any).moc) };
  return { key: 'unknown', label: 'Unknown' };
}

export function getNormalizedEnquiryMOCLabel(raw: unknown): string {
  return getNormalizedEnquiryMOC(raw).label;
}
