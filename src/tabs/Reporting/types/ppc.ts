export interface PpcIncomePayment {
  paymentDate: string;
  amount: number;
  kind?: string;
  description?: string;
}

export type PpcMatchKind = 'direct' | 'email' | 'source_only' | 'unknown';

export interface PpcIncomeBreakdown {
  matterId?: string;
  displayNumber?: string;
  clientName?: string;
  source?: string;
  openDate?: string;
  totalCollected: number;
  collectedWithin7Days: number;
  collectedWithin30Days: number;
  payments: PpcIncomePayment[];
  enquiryId?: string;
  enquiryDate?: string;
  enquirySource?: string;
  enquiryMoc?: string;
  matchKind?: PpcMatchKind;
}

export interface PpcEnquirySnapshot {
  enquiryId?: string | number;
  enquiryDate?: string;
  source?: string;
  methodOfContact?: string;
  linkedToMatter?: boolean;
  linkedMatterId?: string;
  linkedDisplayNumber?: string;
  clientName?: string;
  matchKind?: PpcMatchKind;
}

export interface PpcIncomeMetrics {
  generatedAt: string;
  summary: {
    totalEnquiries: number;
    totalMatters: number;
    mattersWithRevenue: number;
    totalRevenue: number;
    revenue7d: number;
    revenue30d: number;
  };
  breakdown: PpcIncomeBreakdown[];
  enquirySnapshots?: PpcEnquirySnapshot[];
  unmatchedPayments?: Array<{
    matterId?: string;
    paymentDate?: string;
    amount: number;
    kind?: string;
    description?: string;
  }>;
  debug?: {
    unmatchedCount?: number;
    matchedPaymentCount?: number;
    candidateMatterCount?: number;
  };
  notes?: string[];
}