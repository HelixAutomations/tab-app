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

export interface OpsPulseState {
  connected: boolean;
  pulse: PulseData | null;
  scheduler: SchedulerData | null;
  errors: ErrorEntry[];
  sessions: SessionsData | null;
  requests: RequestEntry[];
  presence: PresenceData | null;
}
