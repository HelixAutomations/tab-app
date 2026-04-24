import React from 'react';

/**
 * CclStatusContext — minimal shared view over the CCL status map owned by
 * OperationsDashboard. Consumers (Workbench chip, Home cards, Matters pill)
 * read the current stage + flagged count for a matter without re-fetching.
 *
 * Source of truth stays in OperationsDashboard.tsx; this is a read surface.
 */

export interface CclStatusSnapshot {
  status: string;
  stage?: string;
  label?: string;
  version: number;
  needsAttention?: boolean;
  attentionReason?: string;
  unresolvedCount?: number;
  finalizedAt?: string;
  uploadedToClio?: boolean;
  uploadedToNd?: boolean;
}

export interface CclStatusContextValue {
  byMatterId: Record<string, CclStatusSnapshot>;
  refresh: () => void;
}

const defaultValue: CclStatusContextValue = {
  byMatterId: {},
  refresh: () => {},
};

export const CclStatusContext = React.createContext<CclStatusContextValue>(defaultValue);

export type CclStage = 'pending' | 'compiled' | 'generated' | 'pressure-tested' | 'reviewed' | 'sent';

function canonicalStage(status?: string | null): CclStage {
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

export interface UseCclStatusResult {
  status: CclStatusSnapshot | undefined;
  stage: CclStage;
  flaggedCount: number;
  isFlagged: boolean;
  isQueued: boolean;
  isReady: boolean;
  refresh: () => void;
}

export function useCclStatus(matterId?: string | null): UseCclStatusResult {
  const { byMatterId, refresh } = React.useContext(CclStatusContext);
  const key = matterId ? String(matterId) : '';
  const status = key ? byMatterId[key] : undefined;
  const stage = canonicalStage(status?.stage || status?.status);
  const flaggedCount = Number(status?.unresolvedCount || 0);
  const isFlagged = Boolean(status?.needsAttention) || flaggedCount > 0;
  const isQueued = stage === 'pending' || stage === 'compiled';
  const isReady = stage === 'reviewed' || stage === 'sent';
  return { status, stage, flaggedCount, isFlagged, isQueued, isReady, refresh };
}
