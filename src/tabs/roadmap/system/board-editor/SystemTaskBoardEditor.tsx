// src/tabs/roadmap/system/board-editor/SystemTaskBoardEditor.tsx
//
// Full-screen "bench" editor for an Asana board (project).
// Lives under System > Tasks today; designed to lift cleanly into a wider
// surface later — takes only `initials`, `viewMode`, `isDarkMode`, an
// initial project, and an `onClose` callback. No System-specific props.
//
// Read model:
//   GET /api/dev-console/asana/projects?...           -> board switcher
//   GET /api/dev-console/asana/tech-automations?...   -> selected board
// Write model:
//   POST/PATCH /api/system-tasks/asana/task/:gid/*    -> dev preview only
//
// Mutation discipline: no optimistic updates. We submit, await the server,
// then either refetch the board (section move) or patch the task locally
// from the response payload (rename / due / complete).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './board-editor.css';

interface EditorTask {
  gid: string;
  name: string;
  assignee: string | null;
  dueOn: string | null;
  createdAt: string | null;
  url: string | null;
  notes?: string;
  section: string;
  sectionGid: string;
  completed?: boolean;
}

interface EditorSection {
  name: string;
  gid: string;
  count: number;
}

interface BoardResponse {
  success: boolean;
  projectId?: string;
  projectName?: string;
  teamName?: string | null;
  generatedAt?: string;
  tasks?: EditorTask[];
  sections?: EditorSection[];
  error?: string;
  configured?: boolean;
}

interface AsanaProjectListEntry {
  gid: string;
  name: string;
  archived: boolean;
  teamName: string | null;
}

interface ProjectsResponse {
  success: boolean;
  projects?: AsanaProjectListEntry[];
  error?: string;
}

type BoardCacheEntry = {
  data: BoardResponse;
  cachedAt: number;
};

type ProjectsCacheEntry = {
  projects: AsanaProjectListEntry[];
  error: string | null;
  cachedAt: number;
};

interface PendingState {
  taskGids: Set<string>;
}

const boardCache = new Map<string, BoardCacheEntry>();
const projectsCache = new Map<string, ProjectsCacheEntry>();

function buildBoardCacheKey(initials: string | null, viewMode: 'dev' | 'roadmap', projectId: string): string {
  return `${viewMode}:${initials || 'anon'}:${projectId}`;
}

function buildProjectsCacheKey(initials: string | null, viewMode: 'dev' | 'roadmap', boardTeamName?: string): string {
  return `${viewMode}:${initials || 'anon'}:${boardTeamName || 'all'}`;
}

interface NotifyCandidate { email: string; name: string }
interface NotifyPreview {
  assignee: NotifyCandidate[];
  creator: NotifyCandidate[];
  followers: NotifyCandidate[];
}
interface NotifyResult {
  email: string;
  name: string;
  role: 'assignee' | 'creator' | 'follower' | 'explicit';
  ok: boolean;
  error?: string | null;
}

// ─── Task intake live progress (Phase B) ─────────────────────────────────
//
// The bench composer now routes through /api/tasks/intake which fans out to
// asana / clio / teams / email. /api/tasks/intake/stream pushes per-leg
// progress events so the composer can light up legs in real time.

type IntakeLegState = 'pending' | 'running' | 'ok' | 'skipped' | 'error';

interface IntakeProgress {
  requestId: string;
  legs: Record<string, { state: IntakeLegState; message?: string | null; durationMs?: number }>;
  status: 'queued' | 'processing' | 'partial' | 'completed' | 'failed';
  asanaTaskUrl?: string | null;
  startedAt: number;
  finishedAt?: number;
}

const INTAKE_LEG_ORDER: Array<{ key: string; label: string }> = [
  { key: 'team_lookup', label: 'Team' },
  { key: 'asana', label: 'Asana' },
  { key: 'clio', label: 'Clio' },
  { key: 'teams', label: 'Teams' },
  { key: 'email', label: 'Email' },
];

function initialIntakeProgress(requestId: string): IntakeProgress {
  const legs: IntakeProgress['legs'] = {};
  for (const l of INTAKE_LEG_ORDER) legs[l.key] = { state: 'pending' };
  return { requestId, legs, status: 'queued', startedAt: Date.now() };
}

export interface SystemTaskBoardEditorProps {
  initials: string | null;
  viewMode: 'dev' | 'roadmap';
  isDarkMode: boolean;
  projectId: string;
  projectName: string;
  teamName?: string | null;
  /** Optional team filter for the board switcher. Matches AsanaProjectMirror logic. */
  boardTeamName?: string;
  onClose: () => void;
  showBackButton?: boolean;
}

function buildQuery(initials: string | null, viewMode: 'dev' | 'roadmap', projectId?: string): string {
  const params = new URLSearchParams();
  if (initials) params.set('initials', initials);
  params.set('viewMode', viewMode);
  if (projectId) params.set('projectId', projectId);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function buildHeaders(initials: string | null, viewMode: 'dev' | 'roadmap'): Record<string, string> {
  const headers: Record<string, string> = {
    'x-forge-view-mode': viewMode,
    'Content-Type': 'application/json',
  };
  if (initials) headers['x-user-initials'] = initials;
  return headers;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function matchesBoardTeam(project: AsanaProjectListEntry, boardTeamName: string | undefined): boolean {
  if (!boardTeamName) return true;
  const projectTeam = String(project.teamName || '').toLowerCase().trim();
  const requestedTeam = boardTeamName.toLowerCase().trim();
  if (!projectTeam || !requestedTeam) return false;
  return projectTeam === requestedTeam || projectTeam.includes(requestedTeam) || requestedTeam.includes(projectTeam);
}

type SignalTone = 'overdue' | 'today' | 'soon' | 'later' | 'none';

function computeSignal(dueOn: string | null | undefined): { tone: SignalTone; label: string } {
  if (!dueOn) return { tone: 'none', label: 'No due date' };
  const due = new Date(`${dueOn}T00:00:00`);
  if (Number.isNaN(due.getTime())) return { tone: 'none', label: 'No due date' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { tone: 'overdue', label: `Overdue ${-diffDays}d` };
  if (diffDays === 0) return { tone: 'today', label: 'Due today' };
  if (diffDays === 1) return { tone: 'today', label: 'Due tomorrow' };
  if (diffDays <= 7) return { tone: 'soon', label: `Due in ${diffDays}d` };
  return { tone: 'later', label: `Due in ${diffDays}d` };
}

// Inline eye SVG. crossed=true renders an eye with a slash through it.
const EyeIcon: React.FC<{ crossed?: boolean; size?: number }> = ({ crossed = false, size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {crossed && <line x1="4" y1="20" x2="20" y2="4" />}
  </svg>
);

const SystemTaskBoardEditor: React.FC<SystemTaskBoardEditorProps> = ({
  initials,
  viewMode,
  isDarkMode,
  projectId,
  projectName,
  teamName,
  boardTeamName,
  onClose,
  showBackButton = true,
}) => {
  const initialBoardCache = boardCache.get(buildBoardCacheKey(initials, viewMode, projectId));
  const [currentProjectId, setCurrentProjectId] = useState(projectId);
  const [currentProjectName, setCurrentProjectName] = useState(initialBoardCache?.data.projectName || projectName);
  const [currentTeamName, setCurrentTeamName] = useState<string | null>(initialBoardCache?.data.teamName ?? teamName ?? null);

  const [data, setData] = useState<BoardResponse | null>(initialBoardCache?.data ?? null);
  const [loading, setLoading] = useState(!initialBoardCache);
  const [hydrating, setHydrating] = useState(Boolean(initialBoardCache));
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<AsanaProjectListEntry[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingState>({ taskGids: new Set() });
  const [actionError, setActionError] = useState<string | null>(null);
  const [refetchToken, setRefetchToken] = useState(0);
  const [search, setSearch] = useState('');
  const [revealAll, setRevealAll] = useState(false);
  const [intakeProgress, setIntakeProgress] = useState<Map<string, IntakeProgress>>(() => new Map());

  // Subscribe to /api/tasks/intake/stream so any composer create lights up in
  // real time as the processor finishes each leg. Single shared EventSource
  // for the lifetime of the editor; events are filtered to the requestIds we
  // currently track.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return undefined;
    let source: EventSource | null = null;
    try {
      source = new EventSource('/api/tasks/intake/stream');
    } catch {
      return undefined;
    }
    const handle = (e: MessageEvent) => {
      let payload: any = null;
      try { payload = JSON.parse(e.data); } catch { return; }
      const requestId = payload?.requestId;
      if (!requestId) return;
      // Phase C: state-machine transitions can fire on requests outside the
      // current composer session (e.g. claim from another bench tab). Always
      // refetch the board so assignee / completion mirrors update; the
      // drawer (C2) will refetch its own bundle when it sees this event.
      if (payload.event === 'transition') {
        setTimeout(() => setRefetchToken((n) => n + 1), 50);
      }
      setIntakeProgress((prev) => {
        if (!prev.has(requestId)) return prev; // we only care about our own
        const next = new Map(prev);
        const current: IntakeProgress = { ...next.get(requestId)!, legs: { ...next.get(requestId)!.legs } };
        const evt = payload.event;
        if (evt === 'queued' || evt === 'processing') {
          current.status = 'processing';
        } else if (evt === 'leg_started' && payload.leg) {
          current.legs[payload.leg] = { ...current.legs[payload.leg], state: 'running' };
        } else if (evt === 'leg_completed' && payload.leg) {
          current.legs[payload.leg] = { state: 'ok', durationMs: payload.durationMs };
          if (payload.leg === 'asana' && payload.ref?.asanaTaskGid) {
            current.asanaTaskUrl = payload.ref?.asanaTaskUrl || null;
            // Asana row now exists; pull the mirror refresh so the new card
            // pops into the column instantly rather than waiting for the
            // 30s drift sync.
            setTimeout(() => setRefetchToken((n) => n + 1), 50);
          }
        } else if (evt === 'leg_skipped' && payload.leg) {
          current.legs[payload.leg] = { state: 'skipped', message: payload.message, durationMs: payload.durationMs };
        } else if (evt === 'leg_failed' && payload.leg) {
          current.legs[payload.leg] = { state: 'error', message: payload.message, durationMs: payload.durationMs };
        } else if (evt === 'completed' || evt === 'partial') {
          current.status = evt === 'partial' ? 'partial' : 'completed';
          current.finishedAt = Date.now();
          current.asanaTaskUrl = payload?.ref?.asanaTaskUrl || current.asanaTaskUrl;
        } else if (evt === 'failed') {
          current.status = 'failed';
          current.finishedAt = Date.now();
        }
        next.set(requestId, current);
        return next;
      });
    };
    source.addEventListener('tasks.intake', handle as EventListener);
    return () => {
      try { source?.removeEventListener('tasks.intake', handle as EventListener); } catch { /* ignore */ }
      try { source?.close(); } catch { /* ignore */ }
    };
  }, []);

  // Auto-clear finished progress strips after a short delay + refetch board.
  useEffect(() => {
    const finished = Array.from(intakeProgress.values()).filter((p) => p.finishedAt && Date.now() - p.finishedAt > 4000);
    if (finished.length === 0) return;
    const ids = finished.map((p) => p.requestId);
    setIntakeProgress((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, [intakeProgress]);

  const columnsRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  const headers = useMemo(() => buildHeaders(initials, viewMode), [initials, viewMode]);
  // Mutations include projectId so the server can write-through to the right
  // board mirror after each successful Asana call.
  const writeQuery = useMemo(() => buildQuery(initials, viewMode, currentProjectId), [initials, viewMode, currentProjectId]);
  const readQuery = useMemo(() => buildQuery(initials, viewMode, currentProjectId), [initials, viewMode, currentProjectId]);
  const boardFetchQuery = useMemo(() => {
    if (refetchToken <= 0) return readQuery;
    return `${readQuery}${readQuery ? '&' : '?'}refresh=1`;
  }, [readQuery, refetchToken]);
  const projectsQuery = useMemo(() => buildQuery(initials, viewMode), [initials, viewMode]);
  const boardCacheKey = useMemo(() => buildBoardCacheKey(initials, viewMode, currentProjectId), [initials, viewMode, currentProjectId]);
  const projectsCacheKey = useMemo(() => buildProjectsCacheKey(initials, viewMode, boardTeamName), [initials, viewMode, boardTeamName]);

  // Load project list once for the switcher.
  useEffect(() => {
    let disposed = false;
    const cached = projectsCache.get(projectsCacheKey);
    if (cached) {
      setProjects(cached.projects);
      setProjectsError(cached.error);
    }
    (async () => {
      try {
        const res = await fetch(`/api/dev-console/asana/projects${projectsQuery}`, { headers });
        const json = (await res.json()) as ProjectsResponse;
        if (disposed) return;
        if (!res.ok || !json.success) {
          setProjectsError(json.error || `Projects HTTP ${res.status}`);
          setProjects([]);
          return;
        }
        const list = (json.projects || []).filter((p) => !p.archived);
        const filtered = boardTeamName ? list.filter((p) => matchesBoardTeam(p, boardTeamName)) : list;
        const nextProjects = filtered.length > 0 ? filtered : list;
        setProjects(nextProjects);
        projectsCache.set(projectsCacheKey, { projects: nextProjects, error: null, cachedAt: Date.now() });
        setProjectsError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load board list';
        if (!disposed) setProjectsError(message);
      }
    })();
    return () => { disposed = true; };
  }, [projectsQuery, headers, boardTeamName, projectsCacheKey]);

  // Load the currently selected board.
  useEffect(() => {
    let disposed = false;
    (async () => {
      const cached = boardCache.get(boardCacheKey);
      const hasUsableData = Boolean(cached?.data || data);
      if (cached?.data) {
        setData(cached.data);
        setError(null);
        if (cached.data.projectName) setCurrentProjectName(cached.data.projectName);
        if (typeof cached.data.teamName !== 'undefined') setCurrentTeamName(cached.data.teamName ?? null);
      }
      try {
        setLoading(!hasUsableData);
        setHydrating(hasUsableData);
        // Hub-side SQL mirror (Phase 1). Identical response shape to the
        // legacy /api/dev-console/asana/tech-automations route this replaced.
        const res = await fetch(`/api/system-tasks/board/${encodeURIComponent(currentProjectId)}${boardFetchQuery}`, { headers });
        const json = (await res.json()) as BoardResponse;
        if (disposed) return;
        if (!res.ok || !json.success) {
          setError(json.error || `Board fetch HTTP ${res.status}`);
          if (!hasUsableData) setData(json);
        } else {
          setData(json);
          boardCache.set(boardCacheKey, { data: json, cachedAt: Date.now() });
          setError(null);
          if (json.projectName) setCurrentProjectName(json.projectName);
          if (typeof json.teamName !== 'undefined') setCurrentTeamName(json.teamName ?? null);
        }
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : 'Board fetch failed');
      } finally {
        if (!disposed) setLoading(false);
        if (!disposed) setHydrating(false);
      }
    })();
    return () => { disposed = true; };
  }, [boardFetchQuery, headers, currentProjectId, boardCacheKey]);

  // Escape closes the bench.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const markPending = useCallback((taskGid: string, on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev.taskGids);
      if (on) next.add(taskGid); else next.delete(taskGid);
      return { taskGids: next };
    });
  }, []);

  const replaceTask = useCallback((taskGid: string, partial: Partial<EditorTask>) => {
    setData((prev) => {
      if (!prev || !Array.isArray(prev.tasks)) return prev;
      const tasks = prev.tasks.map((t) => (t.gid === taskGid ? { ...t, ...partial } : t));
      return { ...prev, tasks };
    });
  }, []);

  const removeTask = useCallback((taskGid: string) => {
    setData((prev) => {
      if (!prev || !Array.isArray(prev.tasks)) return prev;
      return { ...prev, tasks: prev.tasks.filter((t) => t.gid !== taskGid) };
    });
  }, []);

  const triggerRefetch = useCallback(() => setRefetchToken((n) => n + 1), []);

  const callServer = useCallback(async (
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body: unknown,
  ): Promise<{ ok: boolean; payload: any }> => {
    const res = await fetch(`/api/system-tasks${path}${writeQuery}`, {
      method,
      headers,
      body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    let payload: any = null;
    try { payload = await res.json(); } catch { payload = null; }
    return { ok: res.ok && payload?.success !== false, payload };
  }, [headers, writeQuery]);

  const handleMove = useCallback(async (task: EditorTask, sectionGid: string) => {
    if (sectionGid === task.sectionGid) return;
    setActionError(null);
    markPending(task.gid, true);
    const { ok, payload } = await callServer('POST', `/asana/task/${task.gid}/section`, { sectionGid });
    if (!ok) {
      setActionError(payload?.error || 'Move failed');
      markPending(task.gid, false);
      return;
    }
    triggerRefetch();
    markPending(task.gid, false);
  }, [callServer, markPending, triggerRefetch]);

  const handleComplete = useCallback(async (task: EditorTask) => {
    setActionError(null);
    markPending(task.gid, true);
    const { ok, payload } = await callServer('POST', `/asana/task/${task.gid}/complete`, { completed: true });
    if (!ok) {
      setActionError(payload?.error || 'Complete failed');
      markPending(task.gid, false);
      return;
    }
    removeTask(task.gid);
    markPending(task.gid, false);
  }, [callServer, markPending, removeTask]);

  const handleRename = useCallback(async (task: EditorTask, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === task.name) return;
    setActionError(null);
    markPending(task.gid, true);
    const { ok, payload } = await callServer('PATCH', `/asana/task/${task.gid}`, { name: trimmed });
    if (!ok) {
      setActionError(payload?.error || 'Rename failed');
      markPending(task.gid, false);
      return;
    }
    replaceTask(task.gid, { name: payload?.task?.name || trimmed });
    markPending(task.gid, false);
  }, [callServer, markPending, replaceTask]);

  const handleDueOn = useCallback(async (task: EditorTask, dueOn: string | null) => {
    setActionError(null);
    markPending(task.gid, true);
    const { ok, payload } = await callServer('PATCH', `/asana/task/${task.gid}`, { dueOn });
    if (!ok) {
      setActionError(payload?.error || 'Due date update failed');
      markPending(task.gid, false);
      return;
    }
    replaceTask(task.gid, { dueOn: payload?.task?.dueOn ?? dueOn });
    markPending(task.gid, false);
  }, [callServer, markPending, replaceTask]);

  const handleComment = useCallback(async (task: EditorTask, text: string): Promise<boolean> => {
    setActionError(null);
    markPending(task.gid, true);
    const { ok, payload } = await callServer('POST', `/asana/task/${task.gid}/comment`, { text });
    markPending(task.gid, false);
    if (!ok) {
      setActionError(payload?.error || 'Comment failed');
      return false;
    }
    return true;
  }, [callServer, markPending]);

  const handleCreate = useCallback(async (
    sectionGid: string,
    body: { name: string; dueOn?: string | null; workflowType?: string; assigneeFirstName?: string | null; matterLabel?: string | null; priority?: string | null },
  ): Promise<boolean> => {
    const name = body.name.trim();
    if (!name) return false;
    setActionError(null);
    const payload: Record<string, unknown> = {
      sectionGid,
      name,
      useIntake: true,
      workflow_type: body.workflowType || 'individual',
    };
    if (body.dueOn && /^\d{4}-\d{2}-\d{2}$/.test(body.dueOn)) payload.dueOn = body.dueOn;
    if (body.assigneeFirstName) payload.assignee_first_name = body.assigneeFirstName;
    if (body.matterLabel) payload.matter_label = body.matterLabel;
    if (body.priority) payload.priority = body.priority;
    const { ok, payload: resp } = await callServer('POST', '/asana/task', payload);
    if (!ok) {
      setActionError(resp?.error || 'Create failed');
      return false;
    }
    const requestId = resp?.requestId as string | undefined;
    if (requestId) {
      setIntakeProgress((prev) => {
        const next = new Map(prev);
        next.set(requestId, initialIntakeProgress(requestId));
        return next;
      });
      // Refetch board shortly after the processor's Asana leg typically lands
      // so the new task pill appears. SSE 'leg_completed:asana' is the more
      // precise trigger; we keep this as a belt-and-braces fallback.
      setTimeout(() => triggerRefetch(), 2500);
    } else {
      // Legacy non-intake path: refetch immediately.
      triggerRefetch();
    }
    return true;
  }, [callServer, triggerRefetch]);

  const handleNotifyPreview = useCallback(async (task: EditorTask): Promise<NotifyPreview | null> => {
    const { ok, payload } = await callServer('GET', `/asana/task/${task.gid}/notify-preview`, null);
    if (!ok) {
      setActionError(payload?.error || 'Notify preview failed');
      return null;
    }
    return (payload?.candidates as NotifyPreview) || { assignee: [], creator: [], followers: [] };
  }, [callServer]);

  const handleNotify = useCallback(async (
    task: EditorTask,
    body: { recipients: string[]; emails?: string[]; note?: string },
  ): Promise<NotifyResult[]> => {
    setActionError(null);
    markPending(task.gid, true);
    const { ok, payload } = await callServer('POST', `/asana/task/${task.gid}/notify`, body);
    markPending(task.gid, false);
    if (!ok) {
      setActionError(payload?.error || 'Notify failed');
      return [];
    }
    return Array.isArray(payload?.recipients) ? (payload.recipients as NotifyResult[]) : [];
  }, [callServer, markPending]);

  const handleSwitchBoard = useCallback((nextId: string) => {
    if (!nextId || nextId === currentProjectId) return;
    const next = projects.find((p) => p.gid === nextId);
    setCurrentProjectId(nextId);
    if (next) {
      setCurrentProjectName(next.name);
      setCurrentTeamName(next.teamName ?? null);
    }
  }, [currentProjectId, projects]);

  const handleJumpToSection = useCallback((sectionGid: string) => {
    const el = sectionRefs.current.get(sectionGid);
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }, []);

  const filteredTasks = useMemo(() => {
    const tasks = Array.isArray(data?.tasks) ? data!.tasks! : [];
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => (
      (t.name || '').toLowerCase().includes(q)
      || (t.assignee || '').toLowerCase().includes(q)
    ));
  }, [data, search]);

  const sections = useMemo(() => {
    const list = Array.isArray(data?.sections) ? data!.sections! : [];
    const grouped = new Map<string, EditorTask[]>();
    for (const t of filteredTasks) {
      const key = t.sectionGid || 'unsectioned';
      const arr = grouped.get(key) || [];
      arr.push(t);
      grouped.set(key, arr);
    }
    return list.map((s) => ({ section: s, tasks: grouped.get(s.gid) || [] }));
  }, [data, filteredTasks]);

  const sectionChoices = useMemo(
    () => (Array.isArray(data?.sections) ? data!.sections!.map((s) => ({ gid: s.gid, name: s.name })) : []),
    [data],
  );

  const totalTasks = data?.tasks?.length || 0;
  const visibleTasks = filteredTasks.length;

  return (
    <main
      className={`stbe-bench${isDarkMode ? ' stbe-bench--dark' : ''}`}
      data-helix-region="system/tasks/board-editor"
    >
      <header className="stbe-bench-bar">
        {showBackButton && (
          <button
            type="button"
            className="stbe-bench-back"
            onClick={onClose}
            aria-label="Back to System Tasks"
            title="Back to System Tasks"
          >
            <span aria-hidden="true">&lt;</span>
          </button>
        )}

        <div className="stbe-bench-board-group">
          <select
            className="stbe-bench-board-select"
            value={currentProjectId}
            onChange={(e) => handleSwitchBoard(e.currentTarget.value)}
            disabled={projects.length === 0}
            aria-label="Switch board"
            title="Switch board"
          >
            {projects.length === 0 && (
              <option value={currentProjectId}>{currentProjectName}</option>
            )}
            {projects.map((p) => (
              <option key={p.gid} value={p.gid}>
                {p.teamName ? `${p.name} - ${p.teamName}` : p.name}
              </option>
            ))}
          </select>
          {currentTeamName && <span className="stbe-bench-team" title="Team">{currentTeamName}</span>}
        </div>

        <div className="stbe-bench-bar-spacer" aria-hidden="true" />

        <div className="stbe-bench-search">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="Filter name or assignee"
            aria-label="Filter tasks"
          />
          <span className="stbe-bench-count" title="Visible / total">
            {search ? `${visibleTasks} / ${totalTasks}` : `${totalTasks}`}
          </span>
        </div>

        <div className="stbe-bench-bar-tools">
          <button
            type="button"
            className={`stbe-bench-tool${revealAll ? ' stbe-bench-tool--on' : ''}`}
            onClick={() => setRevealAll((v) => !v)}
            title={revealAll ? 'Hide controls on all cards' : 'Reveal controls on all cards'}
            aria-pressed={revealAll}
            aria-label={revealAll ? 'Hide controls on all cards' : 'Reveal controls on all cards'}
          >
            <EyeIcon crossed={!revealAll} size={13} />
          </button>
          <button
            type="button"
            className="stbe-bench-tool"
            onClick={triggerRefetch}
            disabled={loading}
            title="Refetch board from Asana"
            aria-label="Refresh"
          >
            {loading || hydrating ? '...' : 'Refresh'}
          </button>
        </div>
      </header>

      {sectionChoices.length > 0 && (
        <nav className="stbe-bench-section-nav" aria-label="Jump to section">
          {sectionChoices.map((s) => (
            <button
              key={s.gid}
              type="button"
              className="stbe-bench-section-jump"
              onClick={() => handleJumpToSection(s.gid)}
            >
              {s.name}
            </button>
          ))}
        </nav>
      )}

      {(actionError || projectsError) && (
        <div className="stbe-bench-alert" role="alert">
          {actionError || projectsError}
        </div>
      )}

      {loading && <p className="stbe-bench-status">Loading {currentProjectName}...</p>}
      {!loading && hydrating && <p className="stbe-bench-status">Updating...</p>}

      {!loading && error && (
        <p className="stbe-bench-status stbe-bench-status--error">{error}</p>
      )}

      {!loading && !error && sections.length === 0 && (
        <p className="stbe-bench-status">No sections on this board.</p>
      )}

      {!loading && !error && sections.length > 0 && (
        <div className="stbe-bench-columns" ref={columnsRef} data-helix-region="system/tasks/board-editor/columns">
          {intakeProgress.size > 0 && (
            <IntakeProgressStrip progresses={Array.from(intakeProgress.values())} />
          )}
          {sections.map(({ section, tasks }) => (
            <BoardSectionColumn
              key={section.gid}
              section={section}
              tasks={tasks}
              sectionChoices={sectionChoices}
              pendingTaskGids={pending.taskGids}
              onMove={handleMove}
              onComplete={handleComplete}
              onRename={handleRename}
              onDueOn={handleDueOn}
              onComment={handleComment}
              onCreate={handleCreate}
              onNotifyPreview={handleNotifyPreview}
              onNotify={handleNotify}
              forceReveal={revealAll}
              registerRef={(el) => {
                if (el) sectionRefs.current.set(section.gid, el);
                else sectionRefs.current.delete(section.gid);
              }}
            />
          ))}
        </div>
      )}

      {data?.generatedAt && !error && (
        <footer className="stbe-bench-foot">
          <small>Synced {formatDate(data.generatedAt)} - edits flow Hub - Asana - refetch</small>
        </footer>
      )}
    </main>
  );
};

// ─── Live intake progress strip ──────────────────────────────────────────
//
// Sits above the columns whenever one or more bench-created tasks are in
// flight. Each pill in a row reports a leg outcome (team / asana / clio /
// teams / email). Pills auto-clear ~4s after the request finishes.

const IntakeProgressStrip: React.FC<{ progresses: IntakeProgress[] }> = ({ progresses }) => {
  if (!progresses.length) return null;
  const sorted = [...progresses].sort((a, b) => a.startedAt - b.startedAt);
  return (
    <div className="stbe-intake-strip" role="status" aria-live="polite">
      {sorted.map((p) => {
        const headline = p.status === 'completed' ? 'Sent' :
          p.status === 'partial' ? 'Sent (partial)' :
          p.status === 'failed' ? 'Failed' :
          p.status === 'processing' ? 'Sending' : 'Queued';
        return (
          <div key={p.requestId} className={`stbe-intake-row stbe-intake-${p.status}`}>
            <span className="stbe-intake-headline">{headline}</span>
            {INTAKE_LEG_ORDER.map(({ key, label }) => {
              const leg = p.legs[key] || { state: 'pending' as IntakeLegState };
              return (
                <span key={key} className={`stbe-intake-pill stbe-intake-pill-${leg.state}`} title={leg.message || label}>
                  {label}
                </span>
              );
            })}
            {p.asanaTaskUrl && (
              <a className="stbe-intake-link" href={p.asanaTaskUrl} target="_blank" rel="noreferrer">Open</a>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface ColumnProps {
  section: EditorSection;
  tasks: EditorTask[];
  sectionChoices: { gid: string; name: string }[];
  pendingTaskGids: Set<string>;
  onMove: (task: EditorTask, sectionGid: string) => void;
  onComplete: (task: EditorTask) => void;
  onRename: (task: EditorTask, name: string) => void;
  onDueOn: (task: EditorTask, dueOn: string | null) => void;
  onComment: (task: EditorTask, text: string) => Promise<boolean>;
  onCreate: (sectionGid: string, body: { name: string; dueOn?: string | null; workflowType?: string; assigneeFirstName?: string | null; matterLabel?: string | null; priority?: string | null }) => Promise<boolean>;
  onNotifyPreview: (task: EditorTask) => Promise<NotifyPreview | null>;
  onNotify: (task: EditorTask, body: { recipients: string[]; emails?: string[]; note?: string }) => Promise<NotifyResult[]>;
  forceReveal: boolean;
  registerRef: (el: HTMLElement | null) => void;
}

const BoardSectionColumn: React.FC<ColumnProps> = ({
  section,
  tasks,
  sectionChoices,
  pendingTaskGids,
  onMove,
  onComplete,
  onRename,
  onDueOn,
  onComment,
  onCreate,
  onNotifyPreview,
  onNotify,
  forceReveal,
  registerRef,
}) => {
  // Unsectioned is a synthetic bucket — Asana refuses tasks created against it.
  const canCreate = section.gid !== 'unsectioned';
  return (
    <section className="stbe-column" data-section-gid={section.gid} ref={registerRef}>
      <header className="stbe-column-head">
        <strong>{section.name}</strong>
        <span>{tasks.length}</span>
      </header>
      <ul className="stbe-column-list">
        {tasks.length === 0 ? (
          <li className="stbe-column-empty">No tasks.</li>
        ) : tasks.map((task) => (
          <BoardTaskCard
            key={task.gid}
            task={task}
            sectionChoices={sectionChoices}
            pending={pendingTaskGids.has(task.gid)}
            onMove={onMove}
            onComplete={onComplete}
            onRename={onRename}
            onDueOn={onDueOn}
            onComment={onComment}
            onNotifyPreview={onNotifyPreview}
            onNotify={onNotify}
            forceReveal={forceReveal}
          />
        ))}
        {canCreate && (
          <li className="stbe-column-composer">
            <SectionTaskComposer sectionGid={section.gid} onCreate={onCreate} />
          </li>
        )}
      </ul>
    </section>
  );
};

interface ComposerProps {
  sectionGid: string;
  onCreate: (sectionGid: string, body: { name: string; dueOn?: string | null; workflowType?: string; assigneeFirstName?: string | null; matterLabel?: string | null; priority?: string | null }) => Promise<boolean>;
}

const SectionTaskComposer: React.FC<ComposerProps> = ({ sectionGid, onCreate }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [workflowType, setWorkflowType] = useState('individual');
  const [assigneeFirstName, setAssigneeFirstName] = useState('');
  const [matterLabel, setMatterLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const reset = () => {
    setName(''); setDueOn(''); setWorkflowType('individual');
    setAssigneeFirstName(''); setMatterLabel(''); setOpen(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const ok = await onCreate(sectionGid, {
      name: trimmed,
      dueOn: dueOn || null,
      workflowType,
      assigneeFirstName: assigneeFirstName.trim() || null,
      matterLabel: matterLabel.trim() || null,
    });
    setSubmitting(false);
    if (ok) reset();
  };

  if (!open) {
    return (
      <button type="button" className="stbe-column-composer-trigger" onClick={() => setOpen(true)}>
        + Add task
      </button>
    );
  }

  return (
    <form className="stbe-column-composer-form" onSubmit={submit}>
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Task name"
        maxLength={200}
        disabled={submitting}
      />
      <div className="stbe-column-composer-row">
        <select
          value={workflowType}
          onChange={(e) => setWorkflowType(e.target.value)}
          disabled={submitting}
          aria-label="Workflow type"
        >
          <option value="individual">Individual</option>
          <option value="team">Team</option>
          <option value="approval">Approval</option>
        </select>
        <input
          type="text"
          value={assigneeFirstName}
          onChange={(e) => setAssigneeFirstName(e.target.value)}
          placeholder="Assignee first name"
          maxLength={60}
          disabled={submitting}
        />
      </div>
      <div className="stbe-column-composer-row">
        <input
          type="text"
          value={matterLabel}
          onChange={(e) => setMatterLabel(e.target.value)}
          placeholder="Matter (e.g. HLX-12345-67890)"
          maxLength={80}
          disabled={submitting}
        />
        <input
          type="date"
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
          disabled={submitting}
        />
      </div>
      <div className="stbe-column-composer-actions">
        <button type="button" onClick={reset} disabled={submitting}>Cancel</button>
        <button type="submit" disabled={submitting || !name.trim()}>
          {submitting ? 'Sending...' : 'Add'}
        </button>
      </div>
    </form>
  );
};

interface CardProps {
  task: EditorTask;
  sectionChoices: { gid: string; name: string }[];
  pending: boolean;
  onMove: (task: EditorTask, sectionGid: string) => void;
  onComplete: (task: EditorTask) => void;
  onRename: (task: EditorTask, name: string) => void;
  onDueOn: (task: EditorTask, dueOn: string | null) => void;
  onComment: (task: EditorTask, text: string) => Promise<boolean>;
  onNotifyPreview: (task: EditorTask) => Promise<NotifyPreview | null>;
  onNotify: (task: EditorTask, body: { recipients: string[]; emails?: string[]; note?: string }) => Promise<NotifyResult[]>;
  forceReveal: boolean;
}

const BoardTaskCard: React.FC<CardProps> = ({
  task,
  sectionChoices,
  pending,
  onMove,
  onComplete,
  onRename,
  onDueOn,
  onComment,
  onNotifyPreview,
  onNotify,
  forceReveal,
}) => {
  const [nameDraft, setNameDraft] = useState(task.name);
  const [dueDraft, setDueDraft] = useState(task.dueOn || '');
  const [commentDraft, setCommentDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyPreview, setNotifyPreview] = useState<NotifyPreview | null>(null);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyRoles, setNotifyRoles] = useState<Set<'assignee' | 'creator' | 'followers'>>(new Set());
  const [notifyNote, setNotifyNote] = useState('');
  const [notifyResults, setNotifyResults] = useState<NotifyResult[] | null>(null);

  useEffect(() => { setNameDraft(task.name); }, [task.name]);
  useEffect(() => { setDueDraft(task.dueOn || ''); }, [task.dueOn]);

  const isRevealed = forceReveal || revealed;
  const signal = computeSignal(task.dueOn);

  const commitName = () => {
    if (nameDraft.trim() && nameDraft.trim() !== task.name) onRename(task, nameDraft);
  };

  const commitDue = () => {
    const next = dueDraft.trim() || null;
    if ((next || null) !== (task.dueOn || null)) onDueOn(task, next);
  };

  const submitComment = async () => {
    const text = commentDraft.trim();
    if (!text) return;
    const ok = await onComment(task, text);
    if (ok) setCommentDraft('');
  };

  const openNotify = async () => {
    setNotifyOpen(true);
    setNotifyResults(null);
    if (notifyPreview) return;
    setNotifyLoading(true);
    const preview = await onNotifyPreview(task);
    setNotifyLoading(false);
    if (preview) {
      setNotifyPreview(preview);
      // Default-select the roles that actually have an emailable user.
      const next = new Set<'assignee' | 'creator' | 'followers'>();
      if (preview.assignee.length > 0) next.add('assignee');
      setNotifyRoles(next);
    }
  };

  const toggleNotifyRole = (role: 'assignee' | 'creator' | 'followers') => {
    setNotifyRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role); else next.add(role);
      return next;
    });
  };

  const submitNotify = async () => {
    if (notifyRoles.size === 0) return;
    setNotifyResults(null);
    const results = await onNotify(task, {
      recipients: Array.from(notifyRoles),
      note: notifyNote.trim() || undefined,
    });
    setNotifyResults(results);
    if (results.length > 0 && results.every((r) => r.ok)) {
      setNotifyNote('');
    }
  };

  const cardClass = [
    'stbe-card',
    `stbe-card--signal-${signal.tone}`,
    pending ? 'stbe-card--pending' : '',
    isRevealed ? 'stbe-card--revealed' : 'stbe-card--collapsed',
  ].filter(Boolean).join(' ');

  return (
    <li className={cardClass}>
      <div className="stbe-card-head">
        <input
          className="stbe-card-name"
          value={nameDraft}
          disabled={pending}
          onChange={(e) => setNameDraft(e.currentTarget.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
          aria-label="Task name"
        />
        {!forceReveal && (
          <button
            type="button"
            className="stbe-card-eye"
            onClick={() => setRevealed((v) => !v)}
            aria-pressed={revealed}
            aria-label={revealed ? 'Hide controls' : 'Reveal controls'}
            title={revealed ? 'Hide controls' : 'Reveal controls'}
          >
            <EyeIcon crossed={!revealed} />
          </button>
        )}
      </div>

      {!isRevealed && (
        <div className="stbe-card-summary" aria-hidden="false">
          <span
            className={`stbe-card-dot stbe-card-dot--${signal.tone}`}
            title={signal.label}
            aria-label={signal.label}
          />
          <span className="stbe-card-summary-text">{signal.label}</span>
          {task.assignee && (
            <span className="stbe-card-summary-assignee" title={`Assignee: ${task.assignee}`}>
              {task.assignee}
            </span>
          )}
        </div>
      )}

      {isRevealed && (
        <>
          <div className="stbe-card-tags">
            {task.assignee && (
              <span className="stbe-tag stbe-tag--assignee" title="Assignee">
                <span className="stbe-tag-glyph" aria-hidden="true">@</span>
                {task.assignee}
              </span>
            )}
            <span
              className={`stbe-tag stbe-tag--field stbe-tag--due stbe-tag--due-${signal.tone}${dueDraft ? '' : ' stbe-tag--empty'}`}
              title={signal.label}
            >
              <span
                className={`stbe-card-dot stbe-card-dot--${signal.tone}`}
                aria-hidden="true"
              />
              <input
                type="date"
                value={dueDraft}
                disabled={pending}
                onChange={(e) => setDueDraft(e.currentTarget.value)}
                onBlur={commitDue}
                aria-label="Due date"
              />
            </span>
            <span className="stbe-tag stbe-tag--field stbe-tag--section" title="Section">
              <span className="stbe-tag-glyph" aria-hidden="true">#</span>
              <select
                value={task.sectionGid}
                disabled={pending}
                onChange={(e) => onMove(task, e.currentTarget.value)}
                aria-label="Section"
              >
                {sectionChoices.map((s) => (
                  <option key={s.gid} value={s.gid}>{s.name}</option>
                ))}
              </select>
            </span>
          </div>

          <div className="stbe-card-actions">
            <button
              type="button"
              className="stbe-card-action stbe-card-action--primary"
              disabled={pending}
              onClick={() => onComplete(task)}
              title="Mark complete in Asana"
            >
              {pending ? 'Saving' : 'Complete'}
            </button>
            <button
              type="button"
              className="stbe-card-action"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? 'Close' : 'Comment'}
            </button>
            <button
              type="button"
              className="stbe-card-action"
              onClick={() => (notifyOpen ? setNotifyOpen(false) : openNotify())}
              aria-expanded={notifyOpen}
              title="Send a Teams DM about this task"
            >
              {notifyOpen ? 'Close' : 'Notify'}
            </button>
            {task.url && (
              <a
                className="stbe-card-action stbe-card-action--link"
                href={task.url}
                target="_blank"
                rel="noreferrer noopener"
                title="Open in Asana"
              >
                Asana
              </a>
            )}
          </div>

          {expanded && (
            <div className="stbe-card-expanded">
              <textarea
                className="stbe-card-comment"
                rows={2}
                placeholder="Add a comment to Asana..."
                value={commentDraft}
                disabled={pending}
                onChange={(e) => setCommentDraft(e.currentTarget.value)}
              />
              <div className="stbe-card-expanded-actions">
                <button type="button" disabled={pending || !commentDraft.trim()} onClick={submitComment}>
                  Post comment
                </button>
              </div>
            </div>
          )}

          {notifyOpen && (
            <div className="stbe-card-notify">
              {notifyLoading && <p className="stbe-card-notify-status">Loading recipients...</p>}
              {!notifyLoading && notifyPreview && (
                <>
                  <div className="stbe-card-notify-row" role="group" aria-label="Recipients">
                    <NotifyRoleToggle
                      label="Assignee"
                      candidates={notifyPreview.assignee}
                      checked={notifyRoles.has('assignee')}
                      onToggle={() => toggleNotifyRole('assignee')}
                    />
                    <NotifyRoleToggle
                      label="Creator"
                      candidates={notifyPreview.creator}
                      checked={notifyRoles.has('creator')}
                      onToggle={() => toggleNotifyRole('creator')}
                    />
                    <NotifyRoleToggle
                      label="Followers"
                      candidates={notifyPreview.followers}
                      checked={notifyRoles.has('followers')}
                      onToggle={() => toggleNotifyRole('followers')}
                    />
                  </div>
                  <textarea
                    className="stbe-card-comment stbe-card-notify-note"
                    rows={2}
                    placeholder="Optional note for the DM..."
                    value={notifyNote}
                    disabled={pending}
                    onChange={(e) => setNotifyNote(e.currentTarget.value)}
                    maxLength={1500}
                  />
                  <div className="stbe-card-expanded-actions">
                    <button
                      type="button"
                      disabled={pending || notifyRoles.size === 0}
                      onClick={submitNotify}
                    >
                      Send DM
                    </button>
                  </div>
                  {notifyResults && notifyResults.length === 0 && (
                    <p className="stbe-card-notify-status">No deliverable recipients (missing emails).</p>
                  )}
                  {notifyResults && notifyResults.length > 0 && (
                    <ul className="stbe-card-notify-results">
                      {notifyResults.map((r) => (
                        <li key={`${r.role}-${r.email}`} className={`stbe-card-notify-result stbe-card-notify-result--${r.ok ? 'ok' : 'fail'}`}>
                          <span className="stbe-card-notify-result-mark" aria-hidden="true">{r.ok ? '\u2713' : '\u2715'}</span>
                          <span className="stbe-card-notify-result-name">{r.name || r.email}</span>
                          <span className="stbe-card-notify-result-role">{r.role}</span>
                          {!r.ok && r.error && (
                            <span className="stbe-card-notify-result-error">{r.error}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </li>
  );
};

interface NotifyRoleToggleProps {
  label: string;
  candidates: NotifyCandidate[];
  checked: boolean;
  onToggle: () => void;
}

const NotifyRoleToggle: React.FC<NotifyRoleToggleProps> = ({ label, candidates, checked, onToggle }) => {
  const disabled = candidates.length === 0;
  const title = disabled
    ? `${label}: no Asana email on file`
    : candidates.map((c) => c.name || c.email).join(', ');
  return (
    <label className={`stbe-card-notify-toggle${disabled ? ' is-disabled' : ''}`} title={title}>
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={onToggle}
      />
      <span className="stbe-card-notify-toggle-label">{label}</span>
      <span className="stbe-card-notify-toggle-count">{candidates.length}</span>
    </label>
  );
};

export default SystemTaskBoardEditor;
