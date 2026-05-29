// src/tabs/roadmap/parts/AsanaTaskInspector.tsx
// System / Forge — read-only Asana task inspector.
// Accepts a task gid or any Asana task URL, calls the dev-console route, and
// renders a compact brief (overview, subtasks, activity log). LZ + AC only,
// gated server-side by requireForgeReader.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'helix.system.asana.taskInspector.lastInput';

interface TaskAssignee {
  gid: string;
  name: string;
  email?: string | null;
}

interface TaskRef {
  gid: string;
  name: string;
}

interface TaskTag {
  gid: string;
  name: string;
  color: string | null;
}

interface TaskCustomField {
  gid: string;
  name: string;
  type: string | null;
  value: string;
}

interface TaskMembership {
  project: TaskRef | null;
  section: TaskRef | null;
}

interface Task {
  gid: string;
  name: string;
  completed: boolean;
  completedAt: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  dueOn: string | null;
  dueAt: string | null;
  startOn: string | null;
  notes: string;
  url: string | null;
  resourceSubtype: string | null;
  assignee: TaskAssignee | null;
  parent: TaskRef | null;
  projects: TaskRef[];
  memberships: TaskMembership[];
  tags: TaskTag[];
  followers: TaskRef[];
  customFields: TaskCustomField[];
}

interface Story {
  gid: string;
  type: string | null;
  resourceSubtype: string | null;
  createdAt: string | null;
  createdBy: TaskRef | null;
  isEdited: boolean;
  isPinned: boolean;
  text: string;
}

interface Subtask {
  gid: string;
  name: string;
  completed: boolean;
  completedAt: string | null;
  dueOn: string | null;
  url: string | null;
  assignee: TaskAssignee | null;
}

interface InspectorResponse {
  success: boolean;
  generatedAt?: string;
  input?: string;
  taskGid?: string;
  task?: Task;
  stories?: Story[];
  subtasks?: Subtask[];
  warnings?: string[];
  error?: string;
  cached?: boolean;
}

interface AsanaTaskInspectorProps {
  initials: string | null;
  viewMode: 'dev' | 'roadmap';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function readStoredInput(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(STORAGE_KEY) || '';
}

const AsanaTaskInspector: React.FC<AsanaTaskInspectorProps> = ({ initials, viewMode }) => {
  const [input, setInput] = useState<string>(readStoredInput);
  const [submitted, setSubmitted] = useState<string>(readStoredInput);
  const [data, setData] = useState<InspectorResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = { 'x-forge-view-mode': viewMode };
    if (initials) headers['x-user-initials'] = initials;
    return headers;
  }, [initials, viewMode]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (initials) params.set('initials', initials);
    params.set('viewMode', viewMode);
    if (submitted) params.set('taskId', submitted);
    return params.toString();
  }, [initials, submitted, viewMode]);

  useEffect(() => {
    if (!submitted) {
      setData(null);
      setError(null);
      return;
    }
    let disposed = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/dev-console/asana/task?${queryString}`, { headers: authHeaders });
        const json = (await res.json()) as InspectorResponse;
        if (disposed) return;
        if (!res.ok || !json.success) {
          setError(json.error || `Task inspector HTTP ${res.status}`);
          setData(null);
          return;
        }
        setData(json);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, submitted);
        }
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Failed to inspect Asana task');
          setData(null);
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [authHeaders, queryString, submitted]);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const next = input.trim();
      setSubmitted(next);
    },
    [input],
  );

  const handleClear = useCallback(() => {
    setInput('');
    setSubmitted('');
    setData(null);
    setError(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    inputRef.current?.focus();
  }, []);

  const task = data?.task || null;
  const stories = data?.stories || [];
  const subtasks = data?.subtasks || [];
  const warnings = data?.warnings || [];

  return (
    <section
      className="activity-dev-section activity-asana-inspector"
      data-helix-region="system/forge/asana/task-inspector"
    >
      <div className="activity-dev-section-head activity-asana-inspector-head">
        <div className="activity-asana-inspector-title">
          <h3>Asana task inspector</h3>
          <small>Read-only. Paste a task gid or Asana URL.</small>
        </div>
        {data?.cached && <span className="activity-asana-inspector-pill">cached</span>}
      </div>

      <form className="activity-asana-inspector-form" onSubmit={handleSubmit}>
        <label className="activity-asana-inspector-field">
          <span>Task</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            placeholder="1207890123456789 or https://app.asana.com/0/.../1207890123456789"
            onChange={(event) => setInput(event.currentTarget.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <div className="activity-asana-inspector-actions">
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? 'Inspecting...' : 'Inspect'}
          </button>
          {(input || submitted) && (
            <button type="button" onClick={handleClear} className="activity-asana-inspector-clear">
              Clear
            </button>
          )}
        </div>
      </form>

      {!submitted && !loading && !error && (
        <p className="activity-asana-inspector-status">Enter a task gid or URL to inspect.</p>
      )}

      {loading && (
        <div
          className="activity-asana-inspector-body activity-asana-inspector-body--skeleton"
          aria-busy="true"
          aria-label={`Inspecting ${submitted}`}
        >
          <header className="activity-asana-inspector-card">
            <div className="activity-asana-inspector-card-title">
              <span className="activity-asana-inspector-skeleton activity-asana-inspector-skeleton--title" />
              <span className="activity-asana-inspector-skeleton activity-asana-inspector-skeleton--chip" />
            </div>
            <dl className="activity-asana-inspector-meta">
              {['Gid', 'Assignee', 'Due', 'Created', 'Modified'].map((label) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <span className="activity-asana-inspector-skeleton activity-asana-inspector-skeleton--value" />
                  </dd>
                </div>
              ))}
            </dl>
          </header>
          <section className="activity-asana-inspector-subsection">
            <div className="activity-asana-inspector-subsection-head">
              <strong>Subtasks</strong>
              <span>-</span>
            </div>
            <ul className="activity-asana-inspector-subtasks">
              {[0, 1, 2].map((idx) => (
                <li key={idx} className="activity-asana-inspector-subtask">
                  <span className="activity-asana-inspector-check" aria-hidden="true" />
                  <div className="activity-asana-inspector-subtask-main">
                    <span className="activity-asana-inspector-skeleton activity-asana-inspector-skeleton--row" />
                    <small>
                      <span className="activity-asana-inspector-skeleton activity-asana-inspector-skeleton--meta" />
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="activity-asana-inspector-subsection">
            <div className="activity-asana-inspector-subsection-head">
              <strong>Activity</strong>
              <span>-</span>
            </div>
            <ol className="activity-asana-inspector-stories">
              {[0, 1].map((idx) => (
                <li key={idx} className="activity-asana-inspector-story">
                  <div className="activity-asana-inspector-story-meta">
                    <span className="activity-asana-inspector-skeleton activity-asana-inspector-skeleton--meta" />
                  </div>
                  <p>
                    <span className="activity-asana-inspector-skeleton activity-asana-inspector-skeleton--row" />
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {error && !loading && (
        <p className="activity-asana-inspector-status activity-asana-inspector-status--error">{error}</p>
      )}

      {!loading && !error && task && (
        <div className="activity-asana-inspector-body">
          <header className="activity-asana-inspector-card">
            <div className="activity-asana-inspector-card-title">
              {task.url ? (
                <a href={task.url} target="_blank" rel="noreferrer noopener">
                  <strong>{task.name || '(untitled task)'}</strong>
                </a>
              ) : (
                <strong>{task.name || '(untitled task)'}</strong>
              )}
              <span
                className={`activity-asana-inspector-status-chip ${
                  task.completed
                    ? 'activity-asana-inspector-status-chip--done'
                    : 'activity-asana-inspector-status-chip--open'
                }`}
              >
                {task.completed ? `Completed ${formatDate(task.completedAt)}` : 'Open'}
              </span>
            </div>
            <dl className="activity-asana-inspector-meta">
              <div>
                <dt>Gid</dt>
                <dd><code>{task.gid}</code></dd>
              </div>
              <div>
                <dt>Assignee</dt>
                <dd>{task.assignee?.name || '-'}</dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd>{formatDate(task.dueAt || task.dueOn)}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(task.createdAt)}</dd>
              </div>
              <div>
                <dt>Modified</dt>
                <dd>{formatDate(task.modifiedAt)}</dd>
              </div>
              {task.parent && (
                <div>
                  <dt>Parent</dt>
                  <dd>{task.parent.name}</dd>
                </div>
              )}
            </dl>

            {task.projects.length > 0 && (
              <ul className="activity-asana-inspector-projects">
                {task.projects.map((project) => {
                  const membership = task.memberships.find((m) => m.project?.gid === project.gid);
                  const section = membership?.section?.name;
                  return (
                    <li key={project.gid}>
                      <strong>{project.name}</strong>
                      {section && <span> / {section}</span>}
                    </li>
                  );
                })}
              </ul>
            )}

            {task.tags.length > 0 && (
              <div className="activity-asana-inspector-tags">
                {task.tags.map((tag) => (
                  <span key={tag.gid}>{tag.name}</span>
                ))}
              </div>
            )}

            {task.customFields.length > 0 && (
              <dl className="activity-asana-inspector-custom-fields">
                {task.customFields.map((field) => (
                  <div key={field.gid}>
                    <dt>{field.name}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {task.notes && task.notes.trim() && (
              <details className="activity-asana-inspector-notes">
                <summary>Notes</summary>
                <pre>{task.notes}</pre>
              </details>
            )}
          </header>

          {subtasks.length > 0 && (
            <section className="activity-asana-inspector-subsection">
              <div className="activity-asana-inspector-subsection-head">
                <strong>Subtasks</strong>
                <span>{subtasks.length}</span>
              </div>
              <ul className="activity-asana-inspector-subtasks">
                {subtasks.map((sub) => (
                  <li
                    key={sub.gid}
                    className={
                      sub.completed
                        ? 'activity-asana-inspector-subtask activity-asana-inspector-subtask--done'
                        : 'activity-asana-inspector-subtask'
                    }
                  >
                    <span
                      className={
                        sub.completed
                          ? 'activity-asana-inspector-check activity-asana-inspector-check--done'
                          : 'activity-asana-inspector-check'
                      }
                      aria-hidden="true"
                    />
                    <div className="activity-asana-inspector-subtask-main">
                      {sub.url ? (
                        <a href={sub.url} target="_blank" rel="noreferrer noopener">
                          {sub.name || '(untitled subtask)'}
                        </a>
                      ) : (
                        <span>{sub.name || '(untitled subtask)'}</span>
                      )}
                      <small>
                        {sub.assignee?.name || 'Unassigned'}
                        {sub.dueOn && <> · Due {formatDate(sub.dueOn)}</>}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stories.length > 0 && (
            <section className="activity-asana-inspector-subsection">
              <div className="activity-asana-inspector-subsection-head">
                <strong>Activity</strong>
                <span>{stories.length}</span>
              </div>
              <ol className="activity-asana-inspector-stories">
                {stories.map((story) => (
                  <li key={story.gid} className="activity-asana-inspector-story">
                    <div className="activity-asana-inspector-story-meta">
                      <strong>{story.createdBy?.name || 'system'}</strong>
                      <span>{story.type || 'event'}</span>
                      <time>{formatDateTime(story.createdAt)}</time>
                    </div>
                    {story.text && <p>{story.text}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {warnings.length > 0 && (
            <section className="activity-asana-inspector-warnings">
              <strong>Warnings</strong>
              <ul>
                {warnings.map((w, idx) => (
                  <li key={`${w}-${idx}`}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          {data?.generatedAt && (
            <small className="activity-asana-inspector-footnote">
              Synced {formatDateTime(data.generatedAt)}
            </small>
          )}
        </div>
      )}
    </section>
  );
};

export default AsanaTaskInspector;
