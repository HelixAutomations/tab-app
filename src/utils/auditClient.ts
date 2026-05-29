// Audit Lens client
// Operator god-mode P3
// Brief: docs/notes/OPERATOR_GOD_MODE_SYSTEM_TAB_PRESSURE_RELEASE_VALVE.md

export type AuditKind = 'user' | 'system' | 'background';
export type AuditStatus = 'ok' | 'warning' | 'error' | 'info';

export interface AuditRowExtras {
  clientSubmissionId?: string | null;
  formKey?: string | null;
  matchedSubmissionId?: string | null;
  orphanNotifiedAt?: string | null;
  route?: string | null;
  submissionId?: string;
  processingStatus?: string | null;
  lane?: string | null;
  proposalId?: string;
  surface?: string | null;
  outcome?: string | null;
  clientSessionId?: string | null;
  entityRef?: string | null;
}

export interface AuditRow {
  id: string;
  source: string;
  sourceLabel: string;
  kind: AuditKind;
  status: AuditStatus;
  title: string;
  summary: string;
  timestamp: string | null;
  createdAt: string | null;
  extras: AuditRowExtras;
}

export interface AuditStats {
  total: number;
  ok: number;
  warning: number;
  error: number;
  info: number;
  user: number;
  system: number;
  background: number;
  orphans: number;
  truncated: boolean;
  sourceErrors: string[];
}

export interface AuditTimelineResponse {
  ok: boolean;
  initials: string;
  since: string;
  until: string;
  includeBackground: boolean;
  stats: AuditStats;
  rows: AuditRow[];
}

export interface TeamMember {
  initials: string;
  email: string | null;
  name: string | null;
}

const API_BASE = '/api/audit';

export async function fetchAuditTeam(signal?: AbortSignal): Promise<TeamMember[]> {
  const res = await fetch(`${API_BASE}/team`, { signal, credentials: 'include' });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  return Array.isArray(body?.members) ? body.members as TeamMember[] : [];
}

export async function fetchAuditTimeline(
  initials: string,
  opts: { since: string; until: string; includeBackground?: boolean },
  signal?: AbortSignal,
): Promise<AuditTimelineResponse | null> {
  const params = new URLSearchParams({
    since: opts.since,
    until: opts.until,
    includeBackground: opts.includeBackground ? '1' : '0',
  });
  const res = await fetch(`${API_BASE}/user/${encodeURIComponent(initials)}?${params.toString()}`, {
    signal,
    credentials: 'include',
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}
