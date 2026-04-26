export interface CclStatus {
  status: string;
  stage?: string;
  label?: string;
  version: number;
  feeEarner?: string;
  practiceArea?: string;
  clientName?: string;
  matterDescription?: string;
  createdAt?: string;
  finalizedAt?: string;
  uploadedToClio?: boolean;
  uploadedToNd?: boolean;
  needsAttention?: boolean;
  attentionReason?: string;
  confidence?: string;
  unresolvedCount?: number;
  sentAt?: string;
  sentBy?: string;
  sentChannel?: string;
  compiledAt?: string;
  compileSummary?: {
    sourceCount?: number;
    readyCount?: number;
    limitedCount?: number;
    missingCount?: number;
  } | null;
}

export function getCanonicalCclStage(status?: string | null): 'pending' | 'compiled' | 'generated' | 'pressure-tested' | 'reviewed' | 'sent' {
  switch (String(status || '').trim().toLowerCase()) {
    case 'compiled':
      return 'compiled';
    case 'generated':
    case 'draft':
      return 'generated';
    case 'pressure-tested':
    case 'pressure_tested':
    case 'pressuretested':
      return 'pressure-tested';
    case 'reviewed':
    case 'approved':
    case 'final':
      return 'reviewed';
    case 'sent':
    case 'uploaded':
      return 'sent';
    default:
      return 'pending';
  }
}

export function getCanonicalCclLabel(status?: string | null, explicitLabel?: string | null): string {
  if (explicitLabel && explicitLabel.trim()) {
    return explicitLabel.trim();
  }

  switch (getCanonicalCclStage(status)) {
    case 'compiled':
      return 'Compiled';
    case 'generated':
      return 'Generated';
    case 'pressure-tested':
      return 'Pressure tested';
    case 'reviewed':
      return 'Reviewed';
    case 'sent':
      return 'Sent';
    default:
      return 'Pending';
  }
}

export function isCompileOnlyCclStatus(ccl?: CclStatus | null): boolean {
  if (!ccl) return false;
  const stage = getCanonicalCclStage(ccl.stage || ccl.status);
  if (stage === 'compiled') return true;
  if (stage === 'generated' || stage === 'pressure-tested' || stage === 'reviewed' || stage === 'sent') {
    return false;
  }
  return !Number(ccl.version || 0) && Boolean(ccl.compiledAt || ccl.compileSummary);
}