// Tiny client for /api/matters/open-another (start + poll + retry).
// Used by OpenAnotherMatterModal so both Workbench + Quick Action surfaces
// share one network shape.

export type OpenAnotherMatterPayload = {
  /** Existing InstructionRef when starting from a current instruction. */
  sourceInstructionRef?: string;
  /** Legacy POID id when starting from an old form / older ID check. Either this or sourceInstructionRef is required. */
  sourcePoidId?: string;
  /** Field names from the legacy POID schema that are blank and need fee-earner top-up before submission. */
  legacyGaps?: string[];
  brief: {
    serviceDescription: string;
    areaOfWork: string;
    typeOfWork?: string;
    capacity?: 'Individual' | 'Company' | 'Multiple Individuals';
    company?: { name?: string; number?: string; address?: string };
  };
  team: {
    feeEarnerInitials: string;
    originatingInitials: string;
    supervisingInitials?: string;
  };
  captureDeal?: boolean;
  deal?: {
    amount: number; // 0 for CFA
    cfa: boolean;
    moneyOnAccount?: boolean;
  };
  risk: {
    result: 'Low Risk' | 'Medium Risk' | 'High Risk';
    notes?: string;
  };
};

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'recoverable';

export type JobState = {
  ok: boolean;
  jobId: string;
  status: JobStatus;
  step: string;
  history: Array<{ step: string; ts: number }>;
  error: { message: string; step: string; recoverable?: boolean } | null;
  result: {
    newInstructionRef?: string;
    clioMatterId?: string;
    displayNumber?: string;
    simulated?: boolean;
  } | null;
  startedAt: number;
  finishedAt: number | null;
};

const BASE = '/api/matters/open-another';

// ── Source picker types ────────────────────────────────────────────────────

export interface CurrentInstructionHit {
  InstructionRef: string;
  ProspectId?: number | string;
  ClientId?: number | string;
  Stage?: string;
  ClientType?: string;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  CompanyName?: string;
  HelixContact?: string;
  SubmissionDate?: string;
}

export interface LegacyPoidHit {
  poid_id: string;
  type?: string;
  prefix?: string;
  first?: string;
  last?: string;
  email?: string;
  best_number?: string;
  date_of_birth?: string;
  nationality?: string;
  gender?: string;
  post_code?: string;
  company_name?: string;
  company_number?: string;
  client_id?: string;
  matter_id?: string;
  stage?: string;
  check_result?: string;
  check_expiry?: string;
  submission_date?: string;
  /** Field names that are blank in the legacy record and would need topping up. */
  _gaps: string[];
}

export interface SourceSearchResult {
  ok: boolean;
  query: string;
  mode: 'current' | 'legacy';
  instructions: CurrentInstructionHit[];
  legacyPoids: LegacyPoidHit[];
}

export async function searchSources(q: string, mode: 'current' | 'legacy' = 'current'): Promise<SourceSearchResult> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('mode', mode);
  const res = await fetch(`${BASE}/sources?${params.toString()}`);
  if (!res.ok) {
    let msg = `Search failed (${res.status})`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

export async function startOpenAnother(payload: OpenAnotherMatterPayload): Promise<{ jobId: string }> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.errors?.length) msg = j.errors.join('; ');
      else if (j?.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const j = await res.json();
  return { jobId: j.jobId };
}

export async function getJob(jobId: string): Promise<JobState> {
  const res = await fetch(`${BASE}/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error(`Job lookup failed (${res.status})`);
  return res.json();
}

export async function retryWithServiceAccount(jobId: string): Promise<{ jobId: string; previousJobId: string }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(jobId)}/retry-with-service-account`, { method: 'POST' });
  if (!res.ok) throw new Error(`Retry failed (${res.status})`);
  return res.json();
}

/**
 * Poll a job until it reaches a terminal state. Calls onUpdate for every fetched state.
 * Stops on completed | failed | recoverable. Returns the final state.
 */
export async function pollJob(
  jobId: string,
  onUpdate: (state: JobState) => void,
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<JobState> {
  const intervalMs = opts.intervalMs ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const started = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const state = await getJob(jobId);
    onUpdate(state);
    if (state.status === 'completed' || state.status === 'failed' || state.status === 'recoverable') {
      return state;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for matter open job');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
