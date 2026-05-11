// src/tabs/roadmap/parts/ops-pulse-types.ts — Types for the Live Monitor dashboard

export interface PulseData {
  uptimeSeconds: number;
  startedAt: number;
  connections: {
    redis: boolean | null;
    sql: boolean | null;
    instructionsSql: boolean | null;
    clio: boolean | null;
    scheduler: boolean;
  };
  requests: {
    total5min: number;
    errors5min: number;
    avgMs: number;
    p95Ms: number;
    rpm: number;
  };
}

export interface TierStatus {
  status: 'queued' | 'running' | 'completed' | 'failed' | null;
  slotKey: string | null;
  ts: number | null;
  error?: string;
}

export interface MutexState {
  locked: boolean;
  holder: { name: string; startedAt: number; heldMs: number } | null;
  queueDepth: number;
  queue: string[];
  recentHistory: { name: string; startedAt: number; durationMs: number; completedAt: number }[];
}

export interface SchedulerData {
  tiers: {
    collected: { hot: TierStatus | null; warm: TierStatus | null; cold: TierStatus | null; monthly: TierStatus | null };
    wip: { hot: TierStatus | null; warm: TierStatus | null; cold: TierStatus | null };
  };
  mutex: MutexState;
  nextFires: Record<string, { minsUntil: number; schedule: string }>;
}

export interface ErrorEntry {
  ts: number;
  message: string;
  path: string | null;
  status: number;
  user: string | null;
  stack: string | null;
}

export interface SessionEntry {
  id: string;
  user: string;
  stream: string;
  connectedAt: number;
  durationMs: number;
}

export interface SessionsData {
  totalConnections: number;
  uniqueUsers: number;
  users: string[];
  streams: Record<string, number>;
  list: SessionEntry[];
}

export interface SessionTraceEvent {
  ts: number;
  source: string;
  type: string;
  label: string;
  kind: 'info' | 'warning' | 'error' | 'success';
  durationMs: number | null;
  error: string | null;
}

export interface SessionTraceEntry {
  sessionId: string;
  user: string;
  name: string;
  tab: string;
  lastSeen: number;
  pendingCount: number;
  errorCount: number;
  slowCount: number;
  health: 'healthy' | 'busy' | 'warning' | 'error';
  lastEventLabel: string | null;
  recentEvents: SessionTraceEvent[];
}

export interface SessionTraceData {
  active: number;
  degraded: number;
  busy: number;
  list: SessionTraceEntry[];
}

export interface RequestEntry {
  ts: number;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  user: string | null;
}

export interface PresenceEntry {
  initials: string;
  name: string;
  email: string;
  tab: string;
  lastSeen: number;
}

export interface PresenceData {
  online: number;
  tabs: Record<string, number>;
  list: PresenceEntry[];
}

/**
 * Doubled-API hit — emitted whenever a request reaches `/api/api/*`. Caught by
 * the guard middleware in `server/index.js` (set up after Phase 1b retired the
 * helix-keys-proxy hop). Surfaced in the Activity tab alerts strip so dev-group
 * eyeballs see regressions in real time instead of relying on App Insights KQL.
 */
export interface DoubledApiHit {
  ts: number;
  method: string;
  originalPath: string;
  suggestedPath: string;
  referer: string;
  userAgent: string;
}

export type OpsCheckStatus = 'pass' | 'warn' | 'fail';
export type OpsCheckGroup = 'route' | 'workflow' | 'dependency';
export type OpsCheckRisk = 'safe' | 'observe' | 'mutation';
export type OpsCheckSeverity = 'blocking' | 'degraded' | 'noise';

export interface OpsCheckIssueSummary {
  name: string;
  status: OpsCheckStatus;
  severity: OpsCheckSeverity;
  statusCode: number | null;
  detail: string;
}

export interface OpsCheckSummaryItem {
  id: string;
  label: string;
  group: OpsCheckGroup;
  risk: OpsCheckRisk;
  status: OpsCheckStatus;
  durationMs: number;
  checkedAt: string;
  ts: number;
  triggeredBy: string;
  dependencyCount: number;
  failingBlockingCount: number;
  degradedIssueCount: number;
  noiseIssueCount: number;
  issues: OpsCheckIssueSummary[];
}

export interface OpsCheckRunSummary {
  totalTracked: number;
  failingCount: number;
  warningCount: number;
  passCount: number;
  checkedAt: string | null;
  ts: number | null;
  lastRun: OpsCheckSummaryItem | null;
  latest: OpsCheckSummaryItem[];
  recent: OpsCheckSummaryItem[];
}

export interface OpsPulseState {
  connected: boolean;
  pulse: PulseData | null;
  scheduler: SchedulerData | null;
  errors: ErrorEntry[];
  sessions: SessionsData | null;
  sessionTraces: SessionTraceData | null;
  requests: RequestEntry[];
  presence: PresenceData | null;
  doubledApi: DoubledApiHit[];
  opsChecks: OpsCheckRunSummary | null;
}
