import { getNormalizedEnquirySource, getNormalizedEnquirySourceLabel, hasGoogleAdsPaidSignal } from '../enquirySource';

describe('enquirySource normalization', () => {
  test('detects Google Ads via gclid', () => {
    const e = { GCLID: 'EAIaIQob..._BwE', Referral_URL: 'https://helix-law.co.uk/?utm_source=google&utm_medium=cpc&utm_campaign=abc' };
    const s = getNormalizedEnquirySource(e);
    expect(s.key).toBe('google_ads');
    expect(getNormalizedEnquirySourceLabel(e)).toBe('Google Ads');
  });

  test('detects Organic search', () => {
    const e = { Ultimate_Source: 'organic search', Method_of_Contact: 'web form', Referral_URL: 'https://helix-law.co.uk/contact/' };
    const s = getNormalizedEnquirySource(e);
    expect(s.key).toBe('organic');
  });

  test('detects plain Organic and SEO source values', () => {
    expect(getNormalizedEnquirySource({ Ultimate_Source: 'organic' }).key).toBe('organic');
    expect(getNormalizedEnquirySource({ Ultimate_Source: 'SEO' }).key).toBe('organic');
  });

  test('detects Organic search from marketing source aliases', () => {
    expect(getNormalizedEnquirySource({ source: 'organic search' }).key).toBe('organic');
    expect(getNormalizedEnquirySource({ Enquiry_Source: 'Organic Search' }).key).toBe('organic');
    expect(getNormalizedEnquirySource({ 'Source of Enquiry': 'organic search' }).key).toBe('organic');
  });

  test('prefers marketing Source over system source marker', () => {
    const s = getNormalizedEnquirySource({ source: 'instructions', Source: 'Organic Search' });
    expect(s.key).toBe('organic');
  });

  test('detects Facebook Lead Ads from notes', () => {
    const e = { Initial_first_call_notes: 'Facebook Lead ID: 12345', Campaign: '' };
    const s = getNormalizedEnquirySource(e);
    expect(s.key).toBe('meta_ads');
  });

  test('detects ChatGPT from utm_source', () => {
    const e = { Referral_URL: 'https://helix-law.co.uk/path?utm_source=chatgpt.com&utm_medium=referral' } as any;
    const s = getNormalizedEnquirySource(e);
    expect(s.key).toBe('chatgpt');
  });

  test('falls back to referral company', () => {
    const e = { Referring_Company: 'Acme Ltd' };
    const s = getNormalizedEnquirySource(e);
    expect(s.key).toBe('referral_company');
    expect(s.label).toBe('Referral: Acme Ltd');
  });

  test('does not treat method of contact as source', () => {
    const e = { Method_of_Contact: 'call in' };
    const s = getNormalizedEnquirySource(e);
    expect(s.key).toBe('not_recorded');
  });

  test('only flags explicit Google Ads paid-search signals as paid search', () => {
    expect(hasGoogleAdsPaidSignal({ source: 'Meta Ads', medium: 'paid', campaign: 'spring' })).toBe(false);
    expect(hasGoogleAdsPaidSignal({ source: 'Google Ads', medium: 'cpc', campaign: 'spring' })).toBe(true);
    expect(hasGoogleAdsPaidSignal({ source: 'Organic Search', medium: 'organic', campaign: '' })).toBe(false);
    expect(hasGoogleAdsPaidSignal({ source: 'Google Ads', medium: 'organic', campaign: '', gclid: 'abc' })).toBe(true);
  });

  test('unknown fallback', () => {
    const s = getNormalizedEnquirySource({});
    expect(s.key).toBe('not_recorded');
    expect(s.label).toBe('Not Recorded');
  });
});
