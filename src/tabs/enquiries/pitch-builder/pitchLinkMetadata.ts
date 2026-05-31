export type PitchLinkType = 'PAYMENT_ID_DOC_REQUEST' | 'ID_DOC_REQUEST' | 'PITCH_EMAIL';

export type PitchLinkMetadata = {
  hasEmailContent: boolean;
  includesPayment: boolean;
  includesIdVerification: boolean;
  includesDocumentRequest: boolean;
  linkType: PitchLinkType;
  linkTypeLabel: string;
  includesLabel: string;
  amount: number | null;
};

const normaliseString = (value: unknown): string => String(value ?? '').trim();

const normaliseStatus = (value: unknown): string => normaliseString(value).toUpperCase();

const normaliseAmount = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number.parseFloat(normaliseString(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const hasPitchEmailContent = (record: Record<string, unknown> | null | undefined): boolean => {
  if (!record) return false;
  return Boolean(
    normaliseString(record.EmailSubject || record.emailSubject) ||
    normaliseString(record.EmailBody || record.emailBody) ||
    normaliseString(record.EmailBodyHtml || record.emailBodyHtml)
  );
};

export const derivePitchLinkMetadata = (
  record: Record<string, unknown> | null | undefined,
  options: { hasEmailContent?: boolean } = {}
): PitchLinkMetadata => {
  const row = record || {};
  const amount = normaliseAmount(row.Amount || row.amount || row.FeeAmount || row.feeAmount);
  const rawStatus = normaliseStatus(row.DealStatus || row.status || row.Status || row.checkoutMode || row.CheckoutMode || row.linkType || row.LinkType);
  const explicitType = normaliseStatus(row.linkType || row.LinkType);
  const hasEmailContent = options.hasEmailContent ?? hasPitchEmailContent(row);

  if (hasEmailContent) {
    return {
      hasEmailContent,
      includesPayment: Boolean(amount && amount > 0),
      includesIdVerification: true,
      includesDocumentRequest: true,
      linkType: 'PITCH_EMAIL',
      linkTypeLabel: 'Pitch email',
      includesLabel: amount && amount > 0 ? 'Payment, ID verification, document request' : 'ID verification, document request',
      amount,
    };
  }

  const isExplicitIdOnly = rawStatus === 'ID_ONLY' || explicitType === 'ID_DOC_REQUEST';
  const includesPayment = !isExplicitIdOnly && (
    rawStatus.includes('CHECKOUT') ||
    rawStatus.includes('PAYMENT') ||
    explicitType === 'PAYMENT_ID_DOC_REQUEST' ||
    Boolean(amount && amount > 0)
  );

  return {
    hasEmailContent,
    includesPayment,
    includesIdVerification: true,
    includesDocumentRequest: true,
    linkType: includesPayment ? 'PAYMENT_ID_DOC_REQUEST' : 'ID_DOC_REQUEST',
    linkTypeLabel: includesPayment ? 'Payment, ID and document request link' : 'ID and document request link',
    includesLabel: includesPayment ? 'Payment, ID verification, document request' : 'ID verification, document request',
    amount,
  };
};