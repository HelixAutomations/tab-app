// src/tabs/roadmap/parts/AsanaProjectMirror.tsx
// Phase B — read-only Asana project mirror inside System.
// Visible to LZ + AC; no write affordances.

import React, { useEffect, useMemo, useState } from 'react';

const ASANA_PROJECT_STORAGE_KEY = 'helix.system.asana.projectId';

interface AsanaTask {
  gid: string;
  name: string;
  assignee: string | null;
  dueOn: string | null;
  createdAt: string | null;
  url: string | null;
  notes?: string;
  section: string;
  sectionGid: string;
}

interface AsanaSection {
  name: string;
  gid: string;
  count: number;
}

interface AsanaResponse {
  success: boolean;
  projectId?: string;
  projectName?: string;
  teamName?: string | null;
  generatedAt?: string;
  tasks?: AsanaTask[];
  sections?: AsanaSection[];
  error?: string;
  configured?: boolean;
}

interface AsanaProject {
  gid: string;
  name: string;
  archived: boolean;
  teamName: string | null;
}

interface AsanaProjectsResponse {
  success: boolean;
  workspaceId?: string;
  defaultProjectId?: string | null;
  projects?: AsanaProject[];
  error?: string;
}

interface AsanaProjectMirrorProps {
  initials: string | null;
  viewMode: 'dev' | 'roadmap';
  boardTeamName?: string;
  preferBoardTeam?: boolean;
  showBoardSelector?: boolean;
  onOpenEditor?: (project: { gid: string; name: string; teamName: string | null }) => void;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function readStoredProjectId(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(ASANA_PROJECT_STORAGE_KEY) || '';
}

function matchesBoardTeam(project: AsanaProject, boardTeamName: string | undefined): boolean {
  if (!boardTeamName) return true;
  const projectTeam = String(project.teamName || '').toLowerCase().trim();
  const requestedTeam = boardTeamName.toLowerCase().trim();
  if (!projectTeam || !requestedTeam) return false;
  return projectTeam === requestedTeam || projectTeam.includes(requestedTeam) || requestedTeam.includes(projectTeam);
}

const AsanaProjectMirror: React.FC<AsanaProjectMirrorProps> = ({ initials, viewMode, boardTeamName, preferBoardTeam = false, showBoardSelector = false, onOpenEditor }) => {
  const [data, setData] = useState<AsanaResponse | null>(null);
  const [projects, setProjects] = useState<AsanaProject[]>([]);
  const [projectTaskCounts, setProjectTaskCounts] = useState<Record<string, number>>({});
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(readStoredProjectId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const auth = useMemo(() => {
    const params = new URLSearchParams();
    if (initials) params.set('initials', initials);
    params.set('viewMode', viewMode);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [initials, viewMode]);

  const mirrorAuth = useMemo(() => {
    const params = new URLSearchParams();
    if (initials) params.set('initials', initials);
    params.set('viewMode', viewMode);
    if (selectedProjectId) params.set('projectId', selectedProjectId);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [initials, selectedProjectId, viewMode]);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = { 'x-forge-view-mode': viewMode };
    if (initials) headers['x-user-initials'] = initials;
    return headers;
  }, [initials, viewMode]);

  useEffect(() => {
    if (!selectedProjectId || typeof window === 'undefined') return;
    window.localStorage.setItem(ASANA_PROJECT_STORAGE_KEY, selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        setProjectsLoading(true);
        const res = await fetch(`/api/dev-console/asana/projects${auth}`, { headers: authHeaders });
        const json = (await res.json()) as AsanaProjectsResponse;
        if (disposed) return;
        if (!res.ok || !json.success) {
          setProjectsError(json.error || `Asana projects HTTP ${res.status}`);
          setProjects([]);
          return;
        }
        const nextProjects = Array.isArray(json.projects) ? json.projects.filter((project) => !project.archived) : [];
        const preferredProjects = boardTeamName ? nextProjects.filter((project) => matchesBoardTeam(project, boardTeamName)) : nextProjects;
        setProjects(nextProjects);
        setProjectsError(null);
        setSelectedProjectId((current) => {
          if (current && nextProjects.some((project) => project.gid === current) && (!preferBoardTeam || preferredProjects.length === 0 || preferredProjects.some((project) => project.gid === current))) return current;
          if (preferBoardTeam && preferredProjects.length > 0) return preferredProjects[0].gid;
          if (json.defaultProjectId && nextProjects.some((project) => project.gid === json.defaultProjectId)) return json.defaultProjectId;
          return nextProjects[0]?.gid || current;
        });
      } catch (err) {
        if (!disposed) setProjectsError(err instanceof Error ? err.message : 'Failed to load Asana projects');
      } finally {
        if (!disposed) setProjectsLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [auth, authHeaders, boardTeamName, preferBoardTeam]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/dev-console/asana/tech-automations${mirrorAuth}`, { headers: authHeaders });
        const json = (await res.json()) as AsanaResponse;
        if (disposed) return;
        if (!res.ok || !json.success) {
          setError(json.error || `Asana mirror HTTP ${res.status}`);
          setData(json);
        } else {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : 'Failed to load Asana mirror');
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [authHeaders, mirrorAuth]);

  const grouped = useMemo(() => {
    const tasks = data?.tasks || [];
    const sections = data?.sections || [];
    const map = new Map<string, AsanaTask[]>();
    for (const task of tasks) {
      const key = task.sectionGid || 'unsectioned';
      const existing = map.get(key) || [];
      existing.push(task);
      map.set(key, existing);
    }
    return sections
      .map((section) => ({ section, tasks: map.get(section.gid) || [] }))
      .filter((entry) => entry.tasks.length > 0);
  }, [data]);

  const totalTasks = data?.tasks?.length || 0;
  const projectOptions = useMemo(() => projects.filter((project) => !project.archived), [projects]);
  const matchingBoardProjects = useMemo(() => (
    boardTeamName ? projectOptions.filter((project) => matchesBoardTeam(project, boardTeamName)) : projectOptions
  ), [boardTeamName, projectOptions]);
  const useBoardSelector = Boolean(showBoardSelector && boardTeamName);
  const boardSelectorProjects = useMemo(() => (
    useBoardSelector ? matchingBoardProjects : projectOptions
  ), [matchingBoardProjects, projectOptions, useBoardSelector]);
  const selectedProject = projectOptions.find((project) => project.gid === selectedProjectId);
  const currentProjectName = selectedProject?.name || data?.projectName || 'Asana project';

  useEffect(() => {
    if (!useBoardSelector || projectsLoading || boardSelectorProjects.length === 0) {
      setProjectTaskCounts({});
      return;
    }
    let disposed = false;
    (async () => {
      const entries = await Promise.all(
        boardSelectorProjects.map(async (project) => {
          try {
            const params = new URLSearchParams();
            if (initials) params.set('initials', initials);
            params.set('viewMode', viewMode);
            params.set('projectId', project.gid);
            const res = await fetch(`/api/dev-console/asana/tech-automations?${params.toString()}`, { headers: authHeaders });
            const json = (await res.json()) as AsanaResponse;
            if (!res.ok || !json.success) return [project.gid, null] as const;
            return [project.gid, Array.isArray(json.tasks) ? json.tasks.length : 0] as const;
          } catch {
            return [project.gid, null] as const;
          }
        }),
      );
      if (disposed) return;
      const nextCounts: Record<string, number> = {};
      entries.forEach(([gid, count]) => {
        if (typeof count === 'number') nextCounts[gid] = count;
      });
      setProjectTaskCounts(nextCounts);
    })();
    return () => {
      disposed = true;
    };
  }, [authHeaders, boardSelectorProjects, initials, projectsLoading, useBoardSelector, viewMode]);

  return (
    <section className="activity-dev-section activity-asana-mirror" data-helix-region="system/forge/asana/tech-automations">
      <div className="activity-dev-section-head activity-asana-mirror-head">
        <div className="activity-asana-mirror-title">
          <h3>{useBoardSelector ? 'Tasks' : `${currentProjectName} (Asana)`}</h3>
          {useBoardSelector ? <small>{currentProjectName}</small> : data?.teamName && <small>{data.teamName}</small>}
        </div>
        <div className="activity-asana-mirror-controls">
          {projectsError && <small className="activity-asana-mirror-picker-error">Project list unavailable</small>}
          {!useBoardSelector && (projectsLoading || projectOptions.length > 0) && (
            <label className="activity-asana-project-picker">
              <span>Project</span>
              <select
                aria-label="Asana project"
                value={selectedProjectId}
                disabled={projectsLoading || projectOptions.length === 0}
                onChange={(event) => setSelectedProjectId(event.currentTarget.value)}
              >
                {projectsLoading && <option value="">Loading projects...</option>}
                {selectedProjectId && !projectOptions.some((project) => project.gid === selectedProjectId) && (
                  <option value={selectedProjectId}>{data?.projectName || 'Selected project'}</option>
                )}
                {projectOptions.map((project) => (
                  <option key={project.gid} value={project.gid}>
                    {project.teamName ? `${project.name} - ${project.teamName}` : project.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!loading && !error && <span className="activity-asana-mirror-count">Tasks {totalTasks}</span>}
        </div>
      </div>

      {showBoardSelector && (
        <div className="activity-asana-board-selector" data-helix-region="system/tasks/asana-board-list">
          <div className="activity-asana-board-selector-head">
            <span>Boards</span>
            {!projectsLoading && <strong>{boardSelectorProjects.length}</strong>}
          </div>
          <div className="activity-asana-board-selector-grid">
            {projectsLoading ? (
              <span className="activity-asana-board-selector-loading">Loading boards...</span>
            ) : boardSelectorProjects.length === 0 ? (
              <span className="activity-asana-board-selector-empty">No boards visible.</span>
            ) : (
              boardSelectorProjects.map((project) => (
                <div
                  key={project.gid}
                  className="activity-asana-board-option-wrap"
                >
                  <button
                    type="button"
                    className="activity-asana-board-option"
                    aria-pressed={project.gid === selectedProjectId}
                    onClick={() => setSelectedProjectId(project.gid)}
                  >
                    <span className="activity-asana-board-option-kicker">Board</span>
                    <span className="activity-asana-board-option-title">
                      <strong>{project.name}</strong>
                      <span className="activity-asana-board-option-count">
                        {project.gid === selectedProjectId && !loading && !error ? totalTasks : projectTaskCounts[project.gid] ?? '-'}
                      </span>
                    </span>
                    <span className="activity-asana-board-option-arrow" aria-hidden="true">&gt;</span>
                  </button>
                  {onOpenEditor && (
                    <button
                      type="button"
                      className="activity-asana-board-option-edit"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedProjectId(project.gid);
                        onOpenEditor({ gid: project.gid, name: project.name, teamName: project.teamName });
                      }}
                      title={`Edit Tasks: ${project.name}`}
                    >
                      Edit
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {loading && <p className="activity-asana-mirror-status">Loading {currentProjectName}...</p>}

      {!loading && error && (
        <p className="activity-asana-mirror-status activity-asana-mirror-status--error">
          {data?.configured === false
            ? 'No Asana project selected. Set ASANA_TECH_AUTOMATIONS_PROJECT_ID or choose a project from the org list.'
            : error}
        </p>
      )}

      {!loading && !error && grouped.length === 0 && (
        <p className="activity-asana-mirror-status">No active tasks in {currentProjectName}.</p>
      )}

      {!loading && !error && grouped.length > 0 && (
        <div className="activity-asana-mirror-groups">
          {grouped.map(({ section, tasks }) => (
            <div key={section.gid} className="activity-asana-mirror-group">
              <div className="activity-asana-mirror-group-head">
                <strong>{section.name}</strong>
                <span>{tasks.length}</span>
              </div>
              <ul className="activity-asana-mirror-list">
                {tasks.map((task) => (
                  <li key={task.gid} className="activity-asana-mirror-item">
                    <div className="activity-asana-mirror-item-main">
                      {task.url ? (
                        <a href={task.url} target="_blank" rel="noreferrer noopener">{task.name}</a>
                      ) : (
                        <strong>{task.name}</strong>
                      )}
                      <div className="activity-asana-mirror-meta">
                        {task.assignee && <span>{task.assignee}</span>}
                        {task.dueOn && <span>Due {formatDate(task.dueOn)}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {data?.generatedAt && !error && (
        <small className="activity-asana-mirror-footnote">Synced {formatDate(data.generatedAt)}</small>
      )}
    </section>
  );
};

export default AsanaProjectMirror;
