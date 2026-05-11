import type { ImmediateActionCategory } from './ImmediateActionChip';

export type ImmediateActionPersistenceMode =
  | 'none'
  | 'ui-local'
  | 'database'
  | 'external'
  | 'mixed';

export type ImmediateActionRealtimeMode = 'none' | 'sse' | 'polling' | 'manual-refresh';

export interface ImmediateActionMeta {
  actionId: string;
  source: string;
  persistence: ImmediateActionPersistenceMode;
  realtime: ImmediateActionRealtimeMode;
  writeTarget?: string;
  notes?: string;
}

/**
 * Optional per-item expansion context (Phase E).
 *
 * When an immediate action stems from a specific enquiry or matter, it can
 * carry an `expansion` payload so the ToDo panel reveals a read-then-act
 * pane inline (AoW-accented summary + focused action buttons). Items without
 * `expansion` render as-is with no chevron.
 */
export interface TodoExpansionAction {
  /** Visible label (imperative, short — e.g. "Open enquiry"). */
  label: string;
  /** Invoked when the user clicks the action. */
  onClick: () => void;
  /** Optional accent category; defaults to the parent action's category. */
  tone?: 'primary' | 'ghost';
  /** Disabled affordance. */
  disabled?: boolean;
}

export interface TodoExpansionSummaryField {
  label: string;
  value: string;
}

/**
 * One row inside a list-kind expansion (e.g. "Transfer Documents" listing
 * every instruction with pending transfers). Designed to be reusable for any
 * surface that surfaces a small queue inline rather than punting the user
 * to another tab.
 */
export interface TodoExpansionListRow {
  /** Stable id for keying — instructionRef, enquiryId, etc. */
  id: string;
  /** Primary line — client/company name. */
  primary: string;
  /** Optional secondary line — instruction ref, matter id, status, etc. */
  secondary?: string;
  /** Right-aligned count badge (e.g. "3 files"). */
  badge?: string;
  /** AoW token for the row's left accent dot. */
  aow?: string;
  /** Owner initials chip (e.g. "LZ") for firm-wide views. */
  ownerInitials?: string;
  /** Click handler for the whole row. */
  onClick: () => void;
}

export interface TodoExpansion {
  /** Routing/data kind — drives default iconography and accent colour. */
  kind: 'enquiry' | 'matter' | 'generic' | 'list';
  /** Primary line (e.g. client/prospect name or matter display number). */
  primary: string;
  /** Secondary line (e.g. area of work + fee earner). */
  secondary?: string;
  /** Optional AoW token for the left accent rail. */
  aow?: string;
  /** Short description / next step paragraph. */
  description?: string;
  /** 0–4 labelled key/value fields rendered as a compact grid. */
  fields?: TodoExpansionSummaryField[];
  /**
   * Inline list rows (only used when kind === 'list'). Each row is clickable
   * and represents one entity in the queue. Rendered above the action
   * buttons. Cap displayed rows in the renderer.
   */
  list?: TodoExpansionListRow[];
  /** 1–3 quick actions rendered as buttons. */
  actions?: TodoExpansionAction[];
}

export type HomeImmediateActionTier = 'primary' | 'secondary';

export interface HomeImmediateAction {
  title: string;
  onClick: () => void;
  icon: string;
  disabled?: boolean;
  category?: ImmediateActionCategory;
  count?: number;
  totalCount?: number;
  subtitle?: string;
  meta?: ImmediateActionMeta;
  /** Secondary rows are quiet nudges that fill spare panel space under real tasks. */
  tier?: HomeImmediateActionTier;
  /** Phase E: optional read-then-act pane surfaced inline under the row. */
  expansion?: TodoExpansion;
}

const toActionId = (title: string): string =>
  String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'action';

const buildMetaForTitle = (title: string): ImmediateActionMeta => {
  const normalized = String(title || '').toLowerCase();

  if (normalized.includes('(demo)')) {
    return {
      actionId: toActionId(title),
      source: 'demo-seed',
      persistence: 'none',
      realtime: 'none',
      notes: 'Demo-mode only action; no backend write.',
    };
  }

  if (normalized.includes('annual leave')) {
    return {
      actionId: toActionId(title),
      source: 'annual-leave',
      persistence: 'database',
      realtime: 'sse',
      writeTarget: 'helix-project-data.dbo.annualLeave',
      notes: 'Writes via /api/attendance/updateAnnualLeave and refetches on annual-leave stream events.',
    };
  }

  if (normalized.includes('attendance')) {
    return {
      actionId: toActionId(title),
      source: 'attendance',
      persistence: 'database',
      realtime: 'sse',
      writeTarget: 'attendance endpoints',
      notes: 'Attendance actions are persisted through attendance API routes and refreshed through stream/fetch flows.',
    };
  }

  if (normalized.includes('snippet')) {
    return {
      actionId: toActionId(title),
      source: 'snippet-edits',
      persistence: 'external',
      realtime: 'manual-refresh',
      writeTarget: 'snippet approval APIs',
      notes: 'Approvals/rejections write through snippet endpoints; Home list updates locally after success.',
    };
  }

  if (normalized.includes('allocate documents')) {
    return {
      actionId: toActionId(title),
      source: 'document-workspace',
      persistence: 'none',
      realtime: 'manual-refresh',
      notes: 'Navigation-only action; persistence occurs in destination workflow.',
    };
  }

  if (normalized.includes('review ccl')) {
    return {
      actionId: toActionId(title),
      source: 'ccl-pipeline',
      persistence: 'database',
      realtime: 'manual-refresh',
      writeTarget: 'CclContent / CclDrafts',
      notes: 'Prompt-only to-do card. Clicking expands the CCL row in the matters box; the typeform review modal is invoked from there.',
    };
  }

  return {
    actionId: toActionId(title),
    source: 'derived',
    persistence: 'mixed',
    realtime: 'manual-refresh',
    notes: 'Derived To Do action; persistence depends on downstream workflow.',
  };
};

export const enrichImmediateActions = (actions: HomeImmediateAction[]): HomeImmediateAction[] =>
  actions.map((action) => ({
    ...action,
    meta: action.meta || buildMetaForTitle(action.title),
  }));

// ---------------------------------------------------------------------------
// ToDo registry contract (Phase B — HOME_TODO_SINGLE_PICKUP_SURFACE)
//
// `HomeImmediateAction` above is the **UI contract** (how rows render in the
// ImmediateActionsBar). `ToDoCard` below is the **persistence contract** for
// `dbo.hub_todo` on the Helix Operations Platform DB — the server-side
// registry that feeds Home's pickup surface AND the Activity feed from one
// INSERT.
//
// Every hub-originating pickup item eventually lands here. Per the brief
// (docs/notes/HOME_TODO_SINGLE_PICKUP_SURFACE.md), only `review-ccl` and
// `annual-leave` are wired in this cut — the other kinds are contract-only,
// plugged in by downstream briefs (risk-assessment, call-centre, forms-IA).
// ---------------------------------------------------------------------------

export type ToDoKind =
  | 'review-ccl'              // existing; CCL autopilot PT flags ≤7
  | 'annual-leave'            // existing; approver-bound
  | 'ld-review'               // FORMS_IA_LD_UNDERTAKING_COMPLAINT_FLOW brief
  | 'snippet-edits'           // existing (migrates later)
  | 'call-attendance-note'    // CALL_CENTRE_EXTERNAL_ATTENDANCE_NOTE brief
  | 'open-file'               // RISK_ASSESSMENT brief
  | 'risk-assessment'         // RISK_ASSESSMENT brief
  | 'undertaking-request'     // FORMS_IA_LD_UNDERTAKING_COMPLAINT_FLOW brief
  | 'complaint-followup';     // FORMS_IA_LD_UNDERTAKING_COMPLAINT_FLOW brief

export type ToDoCompletedVia =
  | 'hub'             // user ticked/dismissed in Home
  | 'cognito'         // Power Automate Cognito branch fired /reconcile
  | 'auto'            // system completion (e.g. matter opened event)
  | 'manual-dismiss'  // explicit dismiss; audit retained
  | 'approve'         // approval action (e.g. annual leave approver)
  | 'reject';         // rejection action

export type ToDoStage =
  | 'compile'
  | 'draft'
  | 'test'
  | 'review'
  | 'upload'
  | 'pending'
  | 'approved'
  | 'rejected';

/**
 * Shape of a row in `dbo.hub_todo` as returned by /api/todo.
 *
 * Mirrors the column names (snake_case → camelCase) used on the server; kept
 * separate from `HomeImmediateAction` so the registry contract can evolve
 * independently from the UI rendering contract.
 */
export interface ToDoCard {
  /** UUID (PK in hub_todo). Also used as activity-feed item id. */
  id: string;
  kind: ToDoKind;
  ownerInitials: string;
  matterRef?: string;
  /** Free-form descriptor (e.g. "Client Care Letter", "Attendance Note"). */
  docType?: string;
  stage?: ToDoStage;
  /** Per-kind context for the tray / click handler. */
  payload?: Record<string, unknown>;
  /** One-line row label; also used as activity-feed summary. */
  summary?: string;
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp when completed; undefined while open. */
  completedAt?: string;
  completedVia?: ToDoCompletedVia;
  /** Latest status blurb (e.g. "PT complete · 3 flagged"). */
  lastEvent?: string;
}

/**
 * Payload accepted by `POST /api/todo/create`. Server idempotency check is
 * on `(kind, matter_ref, owner_initials)` where `matter_ref` is present.
 */
export interface CreateToDoRequest {
  kind: ToDoKind;
  ownerInitials: string;
  matterRef?: string;
  docType?: string;
  stage?: ToDoStage;
  payload?: Record<string, unknown>;
  summary?: string;
  lastEvent?: string;
}

/**
 * Payload accepted by `POST /api/todo/reconcile`. Either `id` or the
 * `{kind, matterRef, ownerInitials}` triple must be provided.
 */
export interface ReconcileToDoRequest {
  id?: string;
  kind?: ToDoKind;
  matterRef?: string;
  ownerInitials?: string;
  completedVia: ToDoCompletedVia;
  lastEvent?: string;
}

