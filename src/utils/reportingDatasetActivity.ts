import {
  REPORTING_DATASET_BY_KEY,
  type ReportingDatasetKey,
  type ReportingDatasetStatus,
} from '../tabs/Reporting/reportingDatasets';

export type ReportingDatasetActivitySource = 'reporting-stream' | 'reports' | 'marketing';

export type ReportingDatasetActivityRecord = {
  key: ReportingDatasetKey;
  status: ReportingDatasetStatus;
  updatedAt: number;
  count: number;
  cached: boolean;
  source: ReportingDatasetActivitySource;
};

export type ReportingDatasetActivitySnapshot = Partial<Record<ReportingDatasetKey, ReportingDatasetActivityRecord>>;

type ReportingDatasetActivityUpdate = {
  key: string;
  status: ReportingDatasetStatus;
  updatedAt?: number;
  count?: number;
  cached?: boolean;
  source?: ReportingDatasetActivitySource;
};

const STORAGE_KEY = 'helix:reporting-dataset-activity:v1';
const ACTIVITY_EVENT = 'helix:reporting-dataset-activity';
const MAX_ACTIVITY_AGE_MS = 8 * 60 * 60 * 1000;

function isReportingDatasetKey(key: string): key is ReportingDatasetKey {
  return Object.prototype.hasOwnProperty.call(REPORTING_DATASET_BY_KEY, key);
}

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function pruneSnapshot(snapshot: ReportingDatasetActivitySnapshot, now = Date.now()): ReportingDatasetActivitySnapshot {
  const next: ReportingDatasetActivitySnapshot = {};
  Object.entries(snapshot).forEach(([key, value]) => {
    if (!value || !isReportingDatasetKey(key)) return;
    if (!Number.isFinite(value.updatedAt) || now - value.updatedAt > MAX_ACTIVITY_AGE_MS) return;
    next[key] = value;
  });
  return next;
}

export function getReportingDatasetActivitySnapshot(): ReportingDatasetActivitySnapshot {
  if (!canUseSessionStorage()) return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ReportingDatasetActivitySnapshot;
    return pruneSnapshot(parsed);
  } catch {
    return {};
  }
}

export function recordReportingDatasetActivity(update: ReportingDatasetActivityUpdate): void {
  if (!canUseSessionStorage() || !isReportingDatasetKey(update.key)) return;

  const now = update.updatedAt ?? Date.now();
  const snapshot = pruneSnapshot(getReportingDatasetActivitySnapshot(), now);
  snapshot[update.key] = {
    key: update.key,
    status: update.status,
    updatedAt: now,
    count: Math.max(0, update.count ?? 0),
    cached: Boolean(update.cached),
    source: update.source ?? 'reporting-stream',
  };

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT, { detail: snapshot }));
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export function subscribeReportingDatasetActivity(listener: (snapshot: ReportingDatasetActivitySnapshot) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handleActivity = () => listener(getReportingDatasetActivitySnapshot());
  window.addEventListener(ACTIVITY_EVENT, handleActivity);
  window.addEventListener('storage', handleActivity);
  return () => {
    window.removeEventListener(ACTIVITY_EVENT, handleActivity);
    window.removeEventListener('storage', handleActivity);
  };
}