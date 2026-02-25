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
