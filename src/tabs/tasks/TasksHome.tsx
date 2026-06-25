import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiChevronRight, FiClock, FiGitBranch, FiInbox, FiLayers, FiRefreshCw, FiSearch, FiSend, FiShield, FiUserCheck } from 'react-icons/fi';
import { useTheme } from '../../app/functionality/ThemeContext';
import { UserData } from '../../app/functionality/types';
import { getApiBase } from '../../utils/getApiUrl';
import { disposeOnHmr } from '../../utils/devHmr';
import { checkIsLocalDev } from '../../utils/useIsLocalDev';
import AsanaProjectMirror from '../roadmap/parts/AsanaProjectMirror';
import AsanaTaskInspector from '../roadmap/parts/AsanaTaskInspector';
import SystemTaskBoardEditor from '../roadmap/system/board-editor/SystemTaskBoardEditor';
import '../roadmap/Activity.css';
import './TasksHome.css';

const DEV_PREVIEW_INITIALS = new Set(['LZ', 'AC']);

type TechTicketType = 'idea' | 'problem';

interface TechTicketItem {
  type: TechTicketType;
  id: number;
  created_at: string;
  submitted_by: string | null;
  title: string;
  status: string | null;
}

interface TasksHomeProps {
  userData?: UserData[] | null;
  featureToggles?: Record<string, boolean>;
}

interface QueueMetric {
  label: string;
  value: string;
  note: string;
  tone: 'live' | 'watch' | 'gap' | 'planned';
}

type BoardMode = 'mine' | 'intake' | 'team' | 'adapter';
type TaskLaneId = 'needs-me' | 'intake' | 'in-flight' | 'watch';
type CanvasSource = 'hub' | 'asana';
type IntakeWorkflowType = 'individual' | 'team' | 'approval';
type IntakeLegState = 'pending' | 'running' | 'ok' | 'skipped' | 'error';

interface IntakeDraft {
  workflowType: IntakeWorkflowType;
  taskName: string;
  taskDescription: string;
  assigneeFirstName: string;
  assigneeTeam: string;
  matterLabel: string;
  priority: 'normal' | 'low' | 'high' | 'urgent';
  dueDate: string;
  timeEstimateMinutes: string;
  collaborators: string;
  approvalRequired: boolean;
}

interface IntakeProgress {
  requestId: string;
  status: 'queued' | 'processing' | 'partial' | 'completed' | 'failed';
  legs: Record<string, { state: IntakeLegState; message?: string | null; durationMs?: number }>;
  asanaTaskUrl?: string | null;
  startedAt: number;
  finishedAt?: number;
}

interface AsanaTask {
  gid: string;
  name: string;
  assignee: string | null;
  dueOn: string | null;
  createdAt: string | null;
  url: string | null;
  section: string;
  sectionGid: string;
}

interface AsanaProject {
  gid: string;
  name: string;
  archived: boolean;
  teamName: string | null;
}

interface AsanaProjectsResponse {
  success: boolean;
  defaultProjectId?: string | null;
  projects?: AsanaProject[];
  error?: string;
}

interface AsanaMirrorResponse {
  success: boolean;
  projectId?: string;
  projectName?: string;
  teamName?: string | null;
  generatedAt?: string;
  tasks?: AsanaTask[];
  error?: string;
}

interface CanvasItem {
  id: string;
  source: CanvasSource;
  type: TechTicketType;
  sourceLabel: string;
  title: string;
  createdAt: string;
  ownerLabel: string;
  status: string | null;
  statusLabel: string;
  statusTone: 'live' | 'watch' | 'gap';
  lane: TaskLaneId;
  sectionLabel?: string;
  dueOn?: string | null;
  url?: string | null;
}

interface BoardModeOption {
  id: BoardMode;
  label: string;
  count: number;
  icon: React.ComponentType<{ 'aria-hidden'?: boolean }>;
}

interface LaneModel {
  id: TaskLaneId;
  label: string;
  intent: string;
  tone: 'live' | 'watch' | 'gap' | 'planned';
  items: CanvasItem[];
}

const LANE_ORDER: Array<Omit<LaneModel, 'items'>> = [
  { id: 'needs-me', label: 'Needs me', intent: 'human pickup and routing', tone: 'watch' },
  { id: 'intake', label: 'Intake', intent: 'new ideas and problems', tone: 'planned' },
  { id: 'in-flight', label: 'In flight', intent: 'logged through the current flow', tone: 'live' },
  { id: 'watch', label: 'Watch', intent: 'integration or confidence gaps', tone: 'gap' },
];

const INTAKE_LEG_ORDER: Array<{ key: string; label: string }> = [
  { key: 'team_lookup', label: 'Team' },
  { key: 'asana', label: 'Asana' },
  { key: 'clio', label: 'Clio' },
  { key: 'teams', label: 'Teams' },
  { key: 'email', label: 'Email' },
];

const TASK_BOARD_SKELETON_COLUMNS = [
  { label: 'To do', cards: 3 },
  { label: 'Doing', cards: 2 },
  { label: 'Review', cards: 2 },
  { label: 'Done', cards: 1 },
];

type TasksHomeAsanaCacheEntry = {
  project: AsanaProject | null;
  tasks: AsanaTask[];
  cachedAt: number;
};

const tasksHomeAsanaCache = new Map<string, TasksHomeAsanaCacheEntry>();

function getTasksHomeCacheKey(initials: string | null): string {
  return initials || 'anon';
}

const EMPTY_INTAKE_DRAFT: IntakeDraft = {
  workflowType: 'individual',
  taskName: '',
  taskDescription: '',
  assigneeFirstName: '',
  assigneeTeam: 'Operations',
  matterLabel: '',
  priority: 'normal',
  dueDate: '',
  timeEstimateMinutes: '30',
  collaborators: '',
  approvalRequired: false,
};

function createInitialIntakeProgress(requestId: string): IntakeProgress {
  const legs: IntakeProgress['legs'] = {};
  INTAKE_LEG_ORDER.forEach((leg) => { legs[leg.key] = { state: 'pending' }; });
  return { requestId, status: 'queued', legs, startedAt: Date.now() };
}

function getStatusLabel(status: string | null | undefined): string {
  const normalized = String(status || '').toLowerCase().trim();
  if (!normalized || normalized === 'submitted') return 'Pending review';
  if (normalized === 'asana_created') return 'Logged';
  if (normalized === 'asana_failed') return 'Asana failed';
  return status || 'Pending review';
}

function getStatusTone(status: string | null | undefined): 'live' | 'watch' | 'gap' {
  const normalized = String(status || '').toLowerCase().trim();
  if (normalized === 'asana_created') return 'live';
  if (normalized === 'asana_failed') return 'gap';
  return 'watch';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatType(type: TechTicketType): string {
  return type === 'idea' ? 'Idea' : 'Problem';
}

function normalisePerson(value: string | null | undefined): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatDurationLabel(value: number | undefined): string {
  if (!Number.isFinite(value || NaN)) return '';
  if ((value || 0) < 1000) return `${Math.round(value || 0)}ms`;
  return `${((value || 0) / 1000).toFixed(1)}s`;
}

function TaskBoardEditorSkeleton({ initials }: { initials: string | null }) {
  return (
    <main className="tasks-home tasks-home__direct-loading" data-helix-region="tab/tasks">
      <section className="tasks-home__board tasks-home__direct-board" data-helix-region="tasks/direct-board/loading">
        <div className="tasks-home__skeleton-toolbar" aria-hidden="true">
          <span className="tasks-home__skeleton-select" />
          <span className="tasks-home__skeleton-pill" />
          <span className="tasks-home__skeleton-spacer" />
          <span className="tasks-home__skeleton-search" />
          <span className="tasks-home__skeleton-tool" />
          <span className="tasks-home__skeleton-tool tasks-home__skeleton-tool--wide" />
        </div>
        <div className="tasks-home__skeleton-section-nav" aria-hidden="true">
          {TASK_BOARD_SKELETON_COLUMNS.map((column) => <span key={column.label}>{column.label}</span>)}
        </div>
        <div className="tasks-home__skeleton-board" aria-label="Loading task board">
          {TASK_BOARD_SKELETON_COLUMNS.map((column) => (
            <section key={column.label} className="tasks-home__skeleton-column">
              <div className="tasks-home__skeleton-column-head">
                <span>{column.label}</span>
                <strong>{column.cards}</strong>
              </div>
              {Array.from({ length: column.cards }).map((_, index) => (
                <div key={`${column.label}-${index}`} className="tasks-home__skeleton-card">
                  <span className="tasks-home__skeleton-line tasks-home__skeleton-line--short" />
                  <span className="tasks-home__skeleton-line" />
                  <span className="tasks-home__skeleton-line tasks-home__skeleton-line--mid" />
                  <div className="tasks-home__skeleton-card-meta">
                    <span />
                    <span />
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
        <span className="tasks-home__skeleton-user">Loading {initials || 'your'} board</span>
      </section>
    </main>
  );
}

function getUserLabel(user: UserData | null): string {
  const fullName = String((user as any)?.FullName || `${(user as any)?.First || ''} ${(user as any)?.Last || ''}`.trim()).trim();
  return fullName || String(user?.Initials || '').toUpperCase() || 'My board';
}

function isMine(item: TechTicketItem, user: UserData | null, initials: string | null): boolean {
  const submittedBy = normalisePerson(item.submitted_by);
  if (!submittedBy) return false;
  const candidates = [
    initials,
    (user as any)?.Email,
    (user as any)?.FullName,
    (user as any)?.First,
    `${(user as any)?.First || ''} ${(user as any)?.Last || ''}`,
  ].map(normalisePerson).filter(Boolean);
  return candidates.some((candidate) => submittedBy === candidate || submittedBy.includes(candidate));
}

function getLaneForTicket(item: TechTicketItem, mine: boolean): TaskLaneId {
  const normalized = String(item.status || '').toLowerCase().trim();
  if (normalized === 'asana_failed') return 'watch';
  if (normalized === 'asana_created') return 'in-flight';
  return mine ? 'needs-me' : 'intake';
}

function matchesBoardTeam(project: AsanaProject, boardTeamName: string): boolean {
  const projectTeam = String(project.teamName || '').toLowerCase().trim();
  const requestedTeam = boardTeamName.toLowerCase().trim();
  if (!projectTeam || !requestedTeam) return false;
  return projectTeam === requestedTeam || projectTeam.includes(requestedTeam) || requestedTeam.includes(projectTeam);
}

function scoreUserProject(project: AsanaProject, user: UserData | null, initials: string | null): number {
  const projectName = normalisePerson(project.name);
  const fullName = normalisePerson((user as any)?.FullName || `${(user as any)?.First || ''} ${(user as any)?.Last || ''}`.trim());
  const firstName = normalisePerson((user as any)?.First);
  const userInitials = normalisePerson(initials);
  let score = 0;
  if (fullName && projectName.includes(fullName)) score += 6;
  if (firstName && projectName.includes(firstName)) score += 3;
  if (userInitials && projectName.includes(userInitials)) score += 2;
  if (matchesBoardTeam(project, 'Team Tasks')) score += 1;
  return score;
}

function chooseBoardProject(projects: AsanaProject[], user: UserData | null, initials: string | null, defaultProjectId?: string | null): AsanaProject | null {
  const activeProjects = projects.filter((project) => project.gid && project.name && !project.archived);
  const teamTaskProjects = activeProjects.filter((project) => matchesBoardTeam(project, 'Team Tasks'));
  const candidates = teamTaskProjects.length > 0 ? teamTaskProjects : activeProjects;
  const scored = candidates
    .map((project) => ({ project, score: scoreUserProject(project, user, initials) }))
    .sort((a, b) => b.score - a.score || a.project.name.localeCompare(b.project.name));
  if (scored.length > 0) return scored[0].project;
  if (defaultProjectId) return activeProjects.find((project) => project.gid === defaultProjectId) || null;
  return activeProjects[0] || null;
}

function toCanvasItem(item: TechTicketItem, currentUser: UserData | null, initials: string | null): CanvasItem {
  const mine = isMine(item, currentUser, initials);
  return {
    id: `${item.type}-${item.id}`,
    source: 'hub',
    type: item.type,
    sourceLabel: `Tech ${formatType(item.type).toLowerCase()}`,
    title: item.title || 'Untitled task intake',
    createdAt: item.created_at,
    ownerLabel: mine ? 'You' : (item.submitted_by || 'Unassigned'),
    status: item.status,
    statusLabel: getStatusLabel(item.status),
    statusTone: getStatusTone(item.status),
    lane: getLaneForTicket(item, mine),
  };
}

function toAsanaCanvasItem(task: AsanaTask, currentUser: UserData | null, initials: string | null): CanvasItem {
  const assignee = String(task.assignee || '').trim();
  const mine = assignee ? isMine({ type: 'problem', id: 0, created_at: task.createdAt || '', submitted_by: assignee, title: task.name, status: 'asana_created' }, currentUser, initials) : false;
  return {
    id: `asana-${task.gid}`,
    source: 'asana',
    type: 'problem',
    sourceLabel: 'Asana',
    title: task.name || 'Untitled Asana task',
    createdAt: task.createdAt || task.dueOn || new Date().toISOString(),
    ownerLabel: mine ? 'You' : (assignee || 'Unassigned'),
    status: 'asana_active',
    statusLabel: task.dueOn ? `Due ${formatDate(task.dueOn)}` : 'Active',
    statusTone: task.dueOn ? 'watch' : 'live',
    lane: mine ? 'needs-me' : 'in-flight',
    sectionLabel: task.section,
    dueOn: task.dueOn,
    url: task.url,
  };
}

const TasksHome: React.FC<TasksHomeProps> = ({ userData, featureToggles = {} }) => {
  const { isDarkMode } = useTheme();
  const currentUser = userData?.[0] || null;
  const initials = String(currentUser?.Initials || '').toUpperCase().trim() || null;
  const isDevPreview = DEV_PREVIEW_INITIALS.has(initials || '');
  const isLukeLocalOptions = initials === 'LZ' && checkIsLocalDev(featureToggles);
  const [items, setItems] = useState<TechTicketItem[]>([]);
  const [asanaItems, setAsanaItems] = useState<AsanaTask[]>([]);
  const [asanaProject, setAsanaProject] = useState<AsanaProject | null>(null);
  const [asanaLoading, setAsanaLoading] = useState(true);
  const [asanaError, setAsanaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boardMode, setBoardMode] = useState<BoardMode>('mine');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorTarget, setEditorTarget] = useState<{ gid: string; name: string; teamName: string | null } | null>(null);
  const [intakeDraft, setIntakeDraft] = useState<IntakeDraft>(EMPTY_INTAKE_DRAFT);
  const [intakeSubmitting, setIntakeSubmitting] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [intakeProgress, setIntakeProgress] = useState<Map<string, IntakeProgress>>(() => new Map());

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const baseUrl = getApiBase();
      const response = await fetch(`${baseUrl}/api/tech-tickets/ledger?limit=30&type=all`);
      if (!response.ok) throw new Error(`Tech ticket ledger HTTP ${response.status}`);
      const json = (await response.json().catch(() => ({ items: [] }))) as { items?: TechTicketItem[] };
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task intake');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return undefined;
    let source: EventSource | null = null;
    try {
      source = new EventSource('/api/tasks/intake/stream');
    } catch {
      return undefined;
    }
    const handleMessage = (event: MessageEvent) => {
      let payload: any = null;
      try { payload = JSON.parse(event.data); } catch { return; }
      const requestId = String(payload?.requestId || '').trim();
      if (!requestId) return;
      setIntakeProgress((previous) => {
        if (!previous.has(requestId)) return previous;
        const next = new Map(previous);
        const current = next.get(requestId)!;
        const updated: IntakeProgress = { ...current, legs: { ...current.legs } };
        if (payload.event === 'queued' || payload.event === 'processing') {
          updated.status = 'processing';
        } else if (payload.event === 'leg_started' && payload.leg) {
          updated.legs[payload.leg] = { ...updated.legs[payload.leg], state: 'running' };
        } else if (payload.event === 'leg_completed' && payload.leg) {
          updated.legs[payload.leg] = { state: 'ok', durationMs: payload.durationMs };
        } else if (payload.event === 'leg_skipped' && payload.leg) {
          updated.legs[payload.leg] = { state: 'skipped', message: payload.message || null, durationMs: payload.durationMs };
        } else if (payload.event === 'leg_failed' && payload.leg) {
          updated.legs[payload.leg] = { state: 'error', message: payload.message || 'failed', durationMs: payload.durationMs };
        } else if (payload.event === 'completed' || payload.event === 'partial' || payload.event === 'failed') {
          updated.status = payload.event;
          updated.finishedAt = Date.now();
          updated.asanaTaskUrl = payload.ref?.asanaTaskUrl || updated.asanaTaskUrl || null;
          window.setTimeout(() => { void loadQueue(); }, 250);
        }
        if (payload.ref?.asanaTaskUrl) updated.asanaTaskUrl = payload.ref.asanaTaskUrl;
        next.set(requestId, updated);
        return next;
      });
    };
    source.addEventListener('message', handleMessage);
    const cleanup = () => {
      try { source?.removeEventListener('message', handleMessage); } catch { /* ignore */ }
      try { source?.close(); } catch { /* ignore */ }
    };
    const undoHmr = disposeOnHmr(cleanup);
    return () => { cleanup(); undoHmr(); };
  }, [loadQueue]);

  useEffect(() => {
    let disposed = false;
    const cacheKey = getTasksHomeCacheKey(initials);
    const cached = tasksHomeAsanaCache.get(cacheKey);
    if (cached) {
      setAsanaProject(cached.project);
      setAsanaItems(cached.tasks);
      setAsanaError(null);
      setAsanaLoading(false);
    }
    (async () => {
      try {
        setAsanaLoading(!cached);
        setAsanaError(null);
        const params = new URLSearchParams();
        if (initials) params.set('initials', initials);
        params.set('viewMode', 'roadmap');
        const headers: Record<string, string> = { 'x-forge-view-mode': 'roadmap' };
        if (initials) headers['x-user-initials'] = initials;
        const baseUrl = getApiBase();
        const projectsResponse = await fetch(`${baseUrl}/api/dev-console/asana/projects?${params.toString()}`, { headers });
        const projectsJson = (await projectsResponse.json().catch(() => ({ success: false }))) as AsanaProjectsResponse;
        if (disposed) return;
        if (!projectsResponse.ok || !projectsJson.success) {
          setAsanaError(projectsJson.error || `Asana projects HTTP ${projectsResponse.status}`);
          if (!cached) {
            setAsanaItems([]);
            setAsanaProject(null);
          }
          return;
        }
        const project = chooseBoardProject(Array.isArray(projectsJson.projects) ? projectsJson.projects : [], currentUser, initials, projectsJson.defaultProjectId || null);
        setAsanaProject(project);
        if (!project) {
          setAsanaItems([]);
          tasksHomeAsanaCache.set(cacheKey, { project: null, tasks: [], cachedAt: Date.now() });
          return;
        }
        const mirrorParams = new URLSearchParams(params);
        mirrorParams.set('projectId', project.gid);
        const mirrorResponse = await fetch(`${baseUrl}/api/dev-console/asana/tech-automations?${mirrorParams.toString()}`, { headers });
        const mirrorJson = (await mirrorResponse.json().catch(() => ({ success: false }))) as AsanaMirrorResponse;
        if (disposed) return;
        if (!mirrorResponse.ok || !mirrorJson.success) {
          setAsanaError(mirrorJson.error || `Asana board HTTP ${mirrorResponse.status}`);
          if (!cached) setAsanaItems([]);
          return;
        }
        const nextTasks = Array.isArray(mirrorJson.tasks) ? mirrorJson.tasks : [];
        setAsanaItems(nextTasks);
        tasksHomeAsanaCache.set(cacheKey, { project, tasks: nextTasks, cachedAt: Date.now() });
      } catch (err) {
        if (!disposed) {
          setAsanaError(err instanceof Error ? err.message : 'Failed to load Asana board');
          if (!cached) {
            setAsanaItems([]);
            setAsanaProject(null);
          }
        }
      } finally {
        if (!disposed) setAsanaLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [currentUser, initials]);

  const metrics = useMemo<QueueMetric[]>(() => {
    const pending = items.filter((item) => !item.status || item.status === 'submitted').length;
    const logged = items.filter((item) => item.status === 'asana_created').length;
    const failed = items.filter((item) => item.status === 'asana_failed').length;
    return [
      { label: 'Intake', value: String(items.length), note: 'recent ideas and problems', tone: items.length > 0 ? 'live' : 'planned' },
      { label: 'Needs triage', value: String(pending), note: 'waiting for review', tone: pending > 0 ? 'watch' : 'live' },
      { label: 'Logged', value: String(logged), note: 'sent through current Asana flow', tone: 'live' },
      { label: 'Attention', value: String(failed), note: 'integration failures', tone: failed > 0 ? 'gap' : 'live' },
    ];
  }, [items]);

  const canvasItems = useMemo(() => [
    ...asanaItems.map((item) => toAsanaCanvasItem(item, currentUser, initials)),
    ...items.map((item) => toCanvasItem(item, currentUser, initials)),
  ], [asanaItems, currentUser, initials, items]);
  const mineCount = useMemo(() => canvasItems.filter((item) => item.ownerLabel === 'You' || item.lane === 'needs-me').length, [canvasItems]);
  const activeItems = useMemo(() => {
    if (boardMode === 'mine') return canvasItems.filter((item) => item.ownerLabel === 'You' || item.lane === 'needs-me');
    if (boardMode === 'intake') return canvasItems.filter((item) => item.lane === 'intake' || item.lane === 'watch');
    if (boardMode === 'team') return canvasItems;
    return canvasItems.filter((item) => item.lane === 'in-flight' || item.lane === 'watch');
  }, [boardMode, canvasItems]);

  const lanes = useMemo<LaneModel[]>(() => {
    return LANE_ORDER.map((lane) => ({
      ...lane,
      items: activeItems.filter((item) => item.lane === lane.id),
    }));
  }, [activeItems]);

  const selectedTask = useMemo(() => {
    if (!activeItems.length) return null;
    return activeItems.find((item) => item.id === selectedId) || activeItems[0];
  }, [activeItems, selectedId]);

  const boardModes = useMemo<BoardModeOption[]>(() => [
    { id: 'mine', label: 'My board', count: mineCount, icon: FiUserCheck },
    { id: 'intake', label: 'Intake', count: canvasItems.filter((item) => item.lane === 'intake' || item.lane === 'watch').length, icon: FiInbox },
    { id: 'team', label: 'Team', count: canvasItems.length, icon: FiLayers },
    { id: 'adapter', label: 'Asana', count: canvasItems.filter((item) => item.source === 'asana').length, icon: FiGitBranch },
  ], [canvasItems, mineCount]);

  const progressRows = useMemo(() => Array.from(intakeProgress.values()).sort((left, right) => right.startedAt - left.startedAt), [intakeProgress]);

  const submitIntake = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const taskName = intakeDraft.taskName.trim();
    if (!taskName) {
      setIntakeError('Task name is required.');
      return;
    }
    if (!intakeDraft.dueDate) {
      setIntakeError('Due date is required.');
      return;
    }
    setIntakeSubmitting(true);
    setIntakeError(null);
    try {
      const baseUrl = getApiBase();
      const response = await fetch(`${baseUrl}/api/tasks/intake`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(initials ? { 'x-user-initials': initials } : {}),
        },
        body: JSON.stringify({
          source: 'hub-form',
          workflow_type: intakeDraft.workflowType,
          task_name: taskName,
          task_description: intakeDraft.taskDescription.trim() || undefined,
          assignor_initials: initials || undefined,
          assignor_first_name: (currentUser as any)?.First || undefined,
          assignee_first_name: intakeDraft.workflowType !== 'team' ? intakeDraft.assigneeFirstName.trim() || undefined : undefined,
          assignee_team: intakeDraft.workflowType === 'team' ? intakeDraft.assigneeTeam.trim() || undefined : undefined,
          matter_label: intakeDraft.matterLabel.trim() || undefined,
          priority: intakeDraft.priority,
          due_date: intakeDraft.dueDate,
          time_estimate_minutes: Number(intakeDraft.timeEstimateMinutes) || undefined,
          collaborators: intakeDraft.collaborators.trim() || undefined,
          approval_required: intakeDraft.workflowType === 'approval' || intakeDraft.approvalRequired,
          auto_process: true,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { success?: boolean; requestId?: string; error?: string; details?: string[] };
      if (!response.ok || !json.success || !json.requestId) {
        throw new Error(json.details?.join(' ') || json.error || `Task intake HTTP ${response.status}`);
      }
      setIntakeProgress((previous) => {
        const next = new Map(previous);
        next.set(json.requestId!, createInitialIntakeProgress(json.requestId!));
        return next;
      });
      setIntakeDraft(EMPTY_INTAKE_DRAFT);
      setBoardMode('intake');
    } catch (err) {
      setIntakeError(err instanceof Error ? err.message : 'Task intake failed');
    } finally {
      setIntakeSubmitting(false);
    }
  }, [currentUser, initials, intakeDraft]);

  const boardSubtitle = boardMode === 'mine'
    ? `${getUserLabel(currentUser)} lands here first. Shared queues stay one click away.`
    : boardMode === 'intake'
      ? 'Hub form traffic and confidence checks before work becomes someone\'s task.'
      : boardMode === 'team'
        ? 'A whole-team scan of Hub task intake and current adapter state.'
          : `${asanaProject?.name || 'Asana'} remains connected as the operational adapter while Hub proves the lifecycle.`;
        const boardLoading = loading || (asanaLoading && canvasItems.length === 0);

  if (isDevPreview && editorTarget) {
    return (
      <SystemTaskBoardEditor
        initials={initials}
        viewMode="roadmap"
        isDarkMode={isDarkMode}
        projectId={editorTarget.gid}
        projectName={editorTarget.name}
        teamName={editorTarget.teamName}
        boardTeamName="Team Tasks"
        onClose={() => setEditorTarget(null)}
      />
    );
  }

  if (!isLukeLocalOptions) {
    if (asanaLoading) {
      return <TaskBoardEditorSkeleton initials={initials} />;
    }
    if (asanaProject) {
      return (
        <SystemTaskBoardEditor
          initials={initials}
          viewMode="roadmap"
          isDarkMode={isDarkMode}
          projectId={asanaProject.gid}
          projectName={asanaProject.name}
          teamName={asanaProject.teamName}
          boardTeamName="Team Tasks"
          onClose={() => undefined}
          showBackButton={false}
        />
      );
    }
    return (
      <main className="tasks-home" data-helix-region="tab/tasks">
        <section className="tasks-home__board tasks-home__direct-board" data-helix-region="tasks/direct-board/unavailable">
          <div className="tasks-home__panel-head">
            <div>
              <span className="tasks-home__panel-kicker">Tasks</span>
              <h2>Board unavailable</h2>
            </div>
            <span className="tasks-home__panel-count">{initials || 'Hub'}</span>
          </div>
          <div className="tasks-home__notice tasks-home__notice--error">{asanaError || 'No task board is mapped for this user yet.'}</div>
        </section>
      </main>
    );
  }

  return (
    <main className="tasks-home" data-helix-region="tab/tasks">
      <section className="tasks-home__masthead" data-helix-region="tasks/masthead">
        <div className="tasks-home__masthead-main">
          <span className="tasks-home__eyebrow">Tasks canvas</span>
          <h1>{boardModes.find((mode) => mode.id === boardMode)?.label || 'Tasks'}</h1>
          <p>{boardSubtitle}</p>
        </div>
        <div className="tasks-home__masthead-actions">
          <div className="tasks-home__actor-pill">
            <FiShield aria-hidden="true" />
            <span>{initials || 'Hub'}</span>
          </div>
          <button type="button" className="tasks-home__button" onClick={() => void loadQueue()} disabled={loading}>
            <FiRefreshCw aria-hidden="true" />
            Refresh
          </button>
        </div>
      </section>

      <section className="tasks-home__modebar" data-helix-region="tasks/modes" aria-label="Task board views">
        {boardModes.map((mode) => {
          const Icon = mode.icon;
          const active = mode.id === boardMode;
          return (
            <button
              key={mode.id}
              type="button"
              className={`tasks-home__mode ${active ? 'tasks-home__mode--active' : ''}`}
              onClick={() => { setBoardMode(mode.id); setSelectedId(null); }}
            >
              <Icon aria-hidden={true} />
              <span>{mode.label}</span>
              <strong>{mode.count}</strong>
            </button>
          );
        })}
      </section>

      <section className="tasks-home__metrics" data-helix-region="tasks/metrics">
        {metrics.map((metric) => (
          <article key={metric.label} className={`tasks-home__metric tasks-home__metric--${metric.tone}`}>
            <span className="tasks-home__metric-label">{metric.label}</span>
            <strong>{metric.value}</strong>
            <span>{metric.note}</span>
          </article>
        ))}
      </section>

      <section className="tasks-home__ops" data-helix-region="tasks/operations">
        <form className="tasks-home__composer" data-helix-region="tasks/operations/new-task" onSubmit={submitIntake}>
          <div className="tasks-home__panel-head">
            <div>
              <span className="tasks-home__panel-kicker">Create</span>
              <h2>New operational task</h2>
            </div>
            <span className="tasks-home__panel-count">Hub intake</span>
          </div>
          <div className="tasks-home__composer-grid">
            <label className="tasks-home__field tasks-home__field--wide">
              <span>Task name</span>
              <input value={intakeDraft.taskName} onChange={(event) => setIntakeDraft((draft) => ({ ...draft, taskName: event.currentTarget.value }))} maxLength={200} required />
            </label>
            <label className="tasks-home__field">
              <span>Workflow</span>
              <select value={intakeDraft.workflowType} onChange={(event) => setIntakeDraft((draft) => ({ ...draft, workflowType: event.currentTarget.value as IntakeWorkflowType }))}>
                <option value="individual">Individual</option>
                <option value="team">Team</option>
                <option value="approval">Approval</option>
              </select>
            </label>
            <label className="tasks-home__field">
              <span>{intakeDraft.workflowType === 'team' ? 'Team' : 'Assignee first name'}</span>
              {intakeDraft.workflowType === 'team' ? (
                <select value={intakeDraft.assigneeTeam} onChange={(event) => setIntakeDraft((draft) => ({ ...draft, assigneeTeam: event.currentTarget.value }))}>
                  <option value="Operations">Operations</option>
                  <option value="Reception">Reception</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Tech & Automation">Tech & Automation</option>
                </select>
              ) : (
                <input value={intakeDraft.assigneeFirstName} onChange={(event) => setIntakeDraft((draft) => ({ ...draft, assigneeFirstName: event.currentTarget.value }))} />
              )}
            </label>
            <label className="tasks-home__field">
              <span>Due date</span>
              <input type="date" value={intakeDraft.dueDate} onChange={(event) => setIntakeDraft((draft) => ({ ...draft, dueDate: event.currentTarget.value }))} required />
            </label>
            <label className="tasks-home__field">
              <span>Priority</span>
              <select value={intakeDraft.priority} onChange={(event) => setIntakeDraft((draft) => ({ ...draft, priority: event.currentTarget.value as IntakeDraft['priority'] }))}>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="tasks-home__field">
              <span>Minutes</span>
              <input type="number" min="1" step="1" value={intakeDraft.timeEstimateMinutes} onChange={(event) => setIntakeDraft((draft) => ({ ...draft, timeEstimateMinutes: event.currentTarget.value }))} />
            </label>
            <label className="tasks-home__field">
              <span>Matter</span>
              <input value={intakeDraft.matterLabel} onChange={(event) => setIntakeDraft((draft) => ({ ...draft, matterLabel: event.currentTarget.value }))} />
            </label>
            <label className="tasks-home__field">
              <span>Collaborators</span>
              <input value={intakeDraft.collaborators} onChange={(event) => setIntakeDraft((draft) => ({ ...draft, collaborators: event.currentTarget.value }))} placeholder="Comma separated" />
            </label>
            <label className="tasks-home__field tasks-home__field--wide">
              <span>Description</span>
              <textarea value={intakeDraft.taskDescription} onChange={(event) => setIntakeDraft((draft) => ({ ...draft, taskDescription: event.currentTarget.value }))} rows={3} />
            </label>
          </div>
          <div className="tasks-home__composer-actions">
            {intakeError ? <span className="tasks-home__notice tasks-home__notice--error">{intakeError}</span> : <span className="tasks-home__composer-note">Creates an OpsTaskRequest and processes Asana, Clio, Teams, and email legs.</span>}
            <button type="submit" className="tasks-home__button" disabled={intakeSubmitting}>
              <FiSend aria-hidden="true" />
              {intakeSubmitting ? 'Sending' : 'Send task'}
            </button>
          </div>
        </form>

        <section className="tasks-home__processing" data-helix-region="tasks/operations/processing">
          <div className="tasks-home__panel-head">
            <div>
              <span className="tasks-home__panel-kicker">Processing</span>
              <h2>{progressRows.length ? `${progressRows.length} live request${progressRows.length === 1 ? '' : 's'}` : 'No live requests'}</h2>
            </div>
          </div>
          {progressRows.length === 0 ? (
            <div className="tasks-home__empty tasks-home__empty--compact">
              <FiCheckCircle aria-hidden="true" />
              <strong>Ready</strong>
              <span>New tasks will show per-leg progress here.</span>
            </div>
          ) : (
            <div className="tasks-home__progress-stack">
              {progressRows.map((row) => (
                <article key={row.requestId} className={`tasks-home__progress-row tasks-home__progress-row--${row.status}`}>
                  <div className="tasks-home__progress-head">
                    <strong>{row.status === 'completed' ? 'Completed' : row.status === 'partial' ? 'Partial' : row.status === 'failed' ? 'Failed' : 'Processing'}</strong>
                    <span>{row.requestId.slice(0, 8)}</span>
                  </div>
                  <div className="tasks-home__progress-legs">
                    {INTAKE_LEG_ORDER.map((leg) => {
                      const state = row.legs[leg.key]?.state || 'pending';
                      const duration = formatDurationLabel(row.legs[leg.key]?.durationMs);
                      return <span key={leg.key} className={`tasks-home__leg tasks-home__leg--${state}`} title={row.legs[leg.key]?.message || leg.label}>{leg.label}{duration ? ` ${duration}` : ''}</span>;
                    })}
                  </div>
                  {row.asanaTaskUrl ? <a className="tasks-home__open-link" href={row.asanaTaskUrl} target="_blank" rel="noreferrer noopener">Open Asana</a> : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <section className="tasks-home__workspace" data-helix-region="tasks/workspace">
        <section className="tasks-home__board" data-helix-region="tasks/board">
          <div className="tasks-home__panel-head">
            <div>
              <span className="tasks-home__panel-kicker">Board</span>
              <h2>{boardLoading ? 'Loading board' : `${activeItems.length} visible tasks`}</h2>
            </div>
            <span className="tasks-home__panel-count">{boardMode}</span>
          </div>

          {error ? <div className="tasks-home__notice tasks-home__notice--error">{error}</div> : null}
          {asanaError ? <div className="tasks-home__notice tasks-home__notice--error">{asanaError}</div> : null}
          {!error && boardLoading ? <div className="tasks-home__skeleton-grid" aria-label="Loading task board"><span /><span /><span /><span /></div> : null}
          {!error && !boardLoading && activeItems.length === 0 ? (
            <div className="tasks-home__empty">
              <FiCheckCircle aria-hidden="true" />
              <strong>No tasks in this view</strong>
              <span>Switch view to scan intake, team, or adapter rows.</span>
            </div>
          ) : null}

          {!boardLoading && activeItems.length > 0 ? (
            <div className="tasks-home__lanes">
              {lanes.map((lane) => (
                <section key={lane.id} className={`tasks-home__lane tasks-home__lane--${lane.tone}`} data-helix-region={`tasks/board/${lane.id}`}>
                  <div className="tasks-home__lane-head">
                    <div>
                      <h3>{lane.label}</h3>
                      <span>{lane.intent}</span>
                    </div>
                    <strong>{lane.items.length}</strong>
                  </div>
                  <div className="tasks-home__lane-stack">
                    {lane.items.length === 0 ? <div className="tasks-home__lane-empty">Clear</div> : null}
                    {lane.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`tasks-home__task-card ${selectedTask?.id === item.id ? 'tasks-home__task-card--selected' : ''}`}
                        onClick={() => setSelectedId(item.id)}
                        data-helix-region={`tasks/card/${item.id}`}
                      >
                        <span className="tasks-home__task-card-topline">
                          <span>{item.source === 'hub' ? `${item.sourceLabel} #${item.id.split('-')[1]}` : item.sectionLabel || item.sourceLabel}</span>
                          <span className={`tasks-home__status tasks-home__status--${item.statusTone}`}>{item.statusLabel}</span>
                        </span>
                        <strong>{item.title}</strong>
                        <span className="tasks-home__task-card-meta">
                          <span>{item.dueOn ? `Due ${formatDate(item.dueOn)}` : formatDate(item.createdAt)}</span>
                          <span>{item.ownerLabel}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </section>

        <aside className="tasks-home__workbench" data-helix-region="tasks/workbench">
          <div className="tasks-home__panel-head">
            <div>
              <span className="tasks-home__panel-kicker">Workbench</span>
              <h2>{selectedTask ? selectedTask.statusLabel : 'Ready'}</h2>
            </div>
          </div>

          {selectedTask ? (
            <div className="tasks-home__selected">
              <span className="tasks-home__selected-source">{selectedTask.sourceLabel}</span>
              <h3>{selectedTask.title}</h3>
              <div className="tasks-home__selected-grid">
                <span>Owner</span><strong>{selectedTask.ownerLabel}</strong>
                <span>{selectedTask.dueOn ? 'Due' : 'Created'}</span><strong>{selectedTask.dueOn ? formatDate(selectedTask.dueOn) : formatDate(selectedTask.createdAt)}</strong>
                <span>State</span><strong>{selectedTask.statusLabel}</strong>
                {selectedTask.sectionLabel ? <><span>Section</span><strong>{selectedTask.sectionLabel}</strong></> : null}
              </div>
              <div className="tasks-home__action-row">
                <button type="button" disabled><FiSearch aria-hidden="true" /> Similar check</button>
                <button type="button" disabled><FiClock aria-hidden="true" /> Pickup</button>
                {selectedTask.url ? (
                  <a className="tasks-home__open-link" href={selectedTask.url} target="_blank" rel="noreferrer noopener"><FiChevronRight aria-hidden="true" /> Open Asana</a>
                ) : (
                  <button type="button" disabled><FiChevronRight aria-hidden="true" /> Open route</button>
                )}
              </div>
              <div className="tasks-home__privacy-strip">
                <FiShield aria-hidden="true" />
                <span>AI comparison waits for the form-side reminder. Logs stay structural.</span>
              </div>
            </div>
          ) : (
            <div className="tasks-home__empty tasks-home__empty--compact">
              <FiInbox aria-hidden="true" />
              <strong>Pick a task</strong>
              <span>The workbench follows the selected card.</span>
            </div>
          )}

          <div className="tasks-home__contract">
            <article>
              <FiGitBranch aria-hidden="true" />
              <div><strong>Route contract</strong><span>Individual, team, and approval workflows stay aligned with tasking-v3.</span></div>
            </article>
            <article>
              <FiAlertTriangle aria-hidden="true" />
              <div><strong>Exception first</strong><span>Partial processor legs should surface here before they become To Do pickup.</span></div>
            </article>
            <article>
              <FiCheckCircle aria-hidden="true" />
              <div><strong>Lifecycle source</strong><span>Hub state leads; Asana remains the adapter and external board.</span></div>
            </article>
          </div>
        </aside>
      </section>

      <section className="tasks-home__support-grid" data-helix-region="tasks/support">
        <section className="tasks-home__panel" data-helix-region="tasks/asana/board">
          <div className="tasks-home__panel-head">
            <div>
              <span className="tasks-home__panel-kicker">Adapter</span>
              <h2>Asana mirror</h2>
            </div>
          </div>
          <AsanaProjectMirror
            initials={initials}
            viewMode="roadmap"
            boardTeamName="Team Tasks"
            preferBoardTeam
            showBoardSelector
            onOpenEditor={isDevPreview ? setEditorTarget : undefined}
          />
        </section>

        <section className="tasks-home__panel" data-helix-region="tasks/asana/inspector">
          <div className="tasks-home__panel-head">
            <div>
              <span className="tasks-home__panel-kicker">Lookup</span>
              <h2>Task inspector</h2>
            </div>
          </div>
          <AsanaTaskInspector initials={initials} viewMode="roadmap" />
        </section>
      </section>
    </main>
  );
};

export default TasksHome;