// Shared types for the Management Dashboard readiness gate.
// Mirror of the server contract in server/routes/reportingReadiness.js.
// See docs/notes/MANAGEMENT_DASHBOARD_TRUST_GATE.md.

export type ReadinessStatus = 'ok' | 'warn' | 'blocked' | 'unknown';

export type ReadinessCheckId =
  | 'collectedMtd'
  | 'wipWtd'
  | 'enquiriesFresh'
  | 'mattersFresh'
  | 'dataOpsScheduler'
  | 'teamData'
  | 'userData'
  | 'annualLeave';

export type ReadinessSource = 'snapshot' | 'sql' | 'live' | 'inferred';

export interface ReadinessThreshold {
  /** Absolute drift threshold (currency units) above which status downgrades. */
  absolute?: number;
  /** Percentage drift threshold (e.g. 1 = 1%) above which status downgrades. */
  pct?: number;
  /** Maximum acceptable age in seconds for freshness-style checks. */
  maxAgeSeconds?: number;
}

export interface ParityFinding {
  /** Month bucket key in 'YYYY-MM' form. */
  month: string;
  /** Operator-facing label (e.g. 'Apr 2026'). */
  label: string | null;
  /** SQL-side total for this month (collectedTime / wip). */
  sql: number | null;
  /** Clio source-of-truth total for this month. */
  clio: number | null;
  /** Signed delta (sql − clio). */
  delta: number | null;
  /** Per-month verdict against the drift threshold. */
  status: 'ok' | 'warn' | 'error';
  /** True when this row is the current (in-flight) calendar month — drift is expected. */
  isCurrent?: boolean;
}

export interface ReadinessMeasurement {
  sql?: number;
  clio?: number;
  drift?: number;
  driftPct?: number;
  /** Per-month parity rows (Phase A — rolling window verifier). */
  findings?: ParityFinding[];
  /** Number of months covered by the rolling parity check. */
  monthsChecked?: number;
  /** Number of months where the per-month verdict is not 'ok'. */
  monthsDiffering?: number;
  /** Free-form additional measured values (row counts, watermarks, etc.). */
  [extra: string]: number | string | null | undefined | ParityFinding[];
}

export interface ReadinessCheck {
  id: ReadinessCheckId;
  label: string;
  status: ReadinessStatus;
  /** True if a non-ok status should block dashboard entry. */
  blocking: boolean;
  /** Age of the underlying signal (snapshot, watermark, last sync) in seconds. */
  ageSeconds: number | null;
  /** ISO timestamp of the last time this check evaluated to ok. */
  lastGoodAt: string | null;
  /** What kind of evidence backs this check. */
  source: ReadinessSource;
  /** Measured values supporting the status (drift, watermark, etc.). */
  measured: ReadinessMeasurement | null;
  /** Threshold used to evaluate status. */
  threshold: ReadinessThreshold | null;
  /** Short machine-readable reason code (e.g. "snapshot-stale", "drift-exceeds-threshold"). */
  reason: string | null;
  /** Operator-facing copy for blocked/warn states. */
  message: string | null;
  /** Suggested remediation (e.g. "run-reconciliation-snapshot"). */
  remediation: string | null;
}

export type ReadinessOverall = 'ready' | 'warn' | 'blocked';

export interface ReadinessPayload {
  generatedAt: string;
  overall: ReadinessOverall;
  /** Wall-clock duration the server spent assembling this payload, ms. */
  buildMs: number;
  /** True when the payload was returned from the in-memory cache without a fresh build. */
  fromCache: boolean;
  checks: ReadinessCheck[];
}
