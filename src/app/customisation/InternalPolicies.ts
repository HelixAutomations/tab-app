export type InternalPolicyKey =
  | 'client-risk-assessment'
  | 'transaction-risk-assessment'
  | 'firm-wide-sanctions-risk-assessment'
  | 'firm-wide-aml-risk-assessment';

export interface InternalPolicyLink {
  key: InternalPolicyKey;
  title: string;
  shortTitle: string;
  url: string;
  icon: string;
  description: string;
  tags: string[];
}

// Current URLs are the live SharePoint PDF links.
export const INTERNAL_POLICY_LINKS: InternalPolicyLink[] = [
  {
    key: 'client-risk-assessment',
    title: 'Client Risk Assessment',
    shortTitle: 'Client risk',
    url: 'https://helixlaw-my.sharepoint.com/:b:/g/personal/automations_helix-law_com/IQBf1Oq4SHfxTLVO-JbD1cipARwl1zUIjnaUv3rJ2q9xt3o?e=OhFpzb',
    icon: 'Shield',
    description: 'Client risk factors to consider before file opening and review.',
    tags: ['risk', 'aml', 'client', 'policy', 'helix internal'],
  },
  {
    key: 'firm-wide-sanctions-risk-assessment',
    title: 'Firm Wide Sanctions Risk Assessment',
    shortTitle: 'Sanctions risk',
    url: 'https://helixlaw-my.sharepoint.com/:b:/g/personal/automations_helix-law_com/IQDSWjw2JrOSSLoS0L9LhXPZAYuIAOwHwq1dLVaRNIg5bgQ?e=eoybGZ',
    icon: 'Shield',
    description: 'Firm-wide sanctions risk assessment for file opening checks.',
    tags: ['sanctions', 'risk', 'policy', 'helix internal'],
  },
  {
    key: 'firm-wide-aml-risk-assessment',
    title: 'AML Firm Wide Risk Assessment',
    shortTitle: 'AML policy',
    url: 'https://helixlaw-my.sharepoint.com/:b:/g/personal/automations_helix-law_com/IQBbZwdbowevQ60Ais4XVYZ-AWShlBLXQ0f3tf9_h0a6oIM?e=4oReSS',
    icon: 'Shield',
    description: 'Firm-wide AML risk assessment and file-opening policy reference.',
    tags: ['aml', 'risk', 'policy', 'helix internal'],
  },
  {
    key: 'transaction-risk-assessment',
    title: 'Transaction Risk Assessment',
    shortTitle: 'Transaction risk',
    url: 'https://helixlaw-my.sharepoint.com/:b:/g/personal/automations_helix-law_com/IQDH8hpFDCG6RZtkJ_SzIwaQAQEzhkeS1ZkIpDYHfA5yPWs?e=lqQaUc',
    icon: 'Shield',
    description: 'Transaction risk factors and risk level guidance for new files.',
    tags: ['risk', 'aml', 'transaction', 'policy', 'helix internal'],
  },
];

export const getInternalPolicyByKey = (key: InternalPolicyKey): InternalPolicyLink | undefined =>
  INTERNAL_POLICY_LINKS.find((policy) => policy.key === key);

export const getInternalPolicyForRiskLabel = (label: string): InternalPolicyLink | undefined => {
  const labelLower = label.toLowerCase();
  if (labelLower.includes('client risk')) return getInternalPolicyByKey('client-risk-assessment');
  if (labelLower.includes('transaction risk')) return getInternalPolicyByKey('transaction-risk-assessment');
  if (labelLower.includes('sanctions')) return getInternalPolicyByKey('firm-wide-sanctions-risk-assessment');
  if (labelLower.includes('aml')) return getInternalPolicyByKey('firm-wide-aml-risk-assessment');
  return undefined;
};

export const openInternalPolicyDocument = (url: string): void => {
  if (typeof window === 'undefined') return;
  const opened = window.open(url, '_blank', 'popup=yes,width=1120,height=820,noopener,noreferrer');
  if (!opened) {
    window.location.href = url;
  }
};