// src/tabs/roadmap/parts/OperatorActionsPanel.tsx
//
// Lens for the in-app Operator Actions surface (B1, Phase A).
// Lists actions visible to the caller, lets them fill in parameters,
// run the action, and inspect / download the result.
//
// Phase A scope: dev-owner only, read-only "person-lookup" pilot.
// Wider tiers + attach/post artefact buttons land in Phase B/D.

import React from 'react';
import RoleAccessMatrix from './RoleAccessMatrix';

interface ActionParamSchema {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'date' | 'confirmation';
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<string | { value: string; label: string }>;
  maxLength?: number;
  default?: unknown;
  expectedPhrase?: string;
}

interface ActionDef {
  id: string;
  title: string;
  description: string;
  category: string;
  allowedTiers: string[];
  dryRunSupported: boolean;
  paramsSchema: ActionParamSchema[];
}

interface ActionArtefact {
  kind: 'json' | 'text' | 'markdown' | 'csv';
  body: unknown;
  downloadName?: string;
  mimeType?: string;
  attachableTo?: Array<'blob' | 'asana' | 'matter' | 'prospect' | 'time-entry'>;
}

interface AttachmentRow {
  id: string;
  runId: string;
  actionId: string;
  target: string;
  targetRef: string | null;
  attachedBy: { initials?: string | null };
  attachedAt: string;
  durationMs: number | null;
  status: string;
  error: string | null;
}

interface ActionResult {
  ok: boolean;
  runId: string;
  actionId: string;
  durationMs: number;
  dryRun: boolean;
  summary: string | null;
  artefact: ActionArtefact | null;
  warnings?: string[];
}

interface RecentRun {
  id: string;
  actionId: string;
  startedAt: string;
  durationMs: number | null;
  status: string;
  dryRun: boolean;
  summary: string | null;
  requestor: { initials?: string | null; email?: string | null };
}

type InputState = Record<string, Record<string, string>>;

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function artefactAsString(artefact: ActionArtefact): string {
  if (artefact.kind === 'json') {
    try {
      return JSON.stringify(artefact.body, null, 2);
    } catch {
      return String(artefact.body);
    }
  }
  return typeof artefact.body === 'string' ? artefact.body : String(artefact.body);
}

function downloadArtefact(artefact: ActionArtefact): void {
  const text = artefactAsString(artefact);
  const mime = artefact.mimeType || (artefact.kind === 'json' ? 'application/json' : 'text/plain');
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = artefact.downloadName || `operator-action-result.${artefact.kind === 'json' ? 'json' : 'txt'}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const OperatorActionsPanel: React.FC = () => {
  const [actions, setActions] = React.useState<ActionDef[]>([]);
  const [tier, setTier] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [catalogError, setCatalogError] = React.useState<string | null>(null);
  const [inputs, setInputs] = React.useState<InputState>({});
  const [dryRunFlags, setDryRunFlags] = React.useState<Record<string, boolean>>({});
  const [running, setRunning] = React.useState<Set<string>>(() => new Set());
  const [results, setResults] = React.useState<Record<string, ActionResult | undefined>>({});
  const [runErrors, setRunErrors] = React.useState<Record<string, string | undefined>>({});
  const [recentRuns, setRecentRuns] = React.useState<RecentRun[]>([]);
  const [recentRunsError, setRecentRunsError] = React.useState<string | null>(null);
  // Attach UI state — keyed by runId so each completed result manages its own.
  const [attaching, setAttaching] = React.useState<Set<string>>(() => new Set());
  const [attachError, setAttachError] = React.useState<Record<string, string | undefined>>({});
  const [attachToast, setAttachToast] = React.useState<Record<string, string | undefined>>({});
  const [asanaForm, setAsanaForm] = React.useState<Record<string, { mode: 'comment' | 'task'; taskGid: string; sectionGid: string; name: string }>>({});
  // Per-action attachment history (lazy-loaded on disclosure).
  const [historyOpen, setHistoryOpen] = React.useState<Record<string, boolean>>({});
  const [history, setHistory] = React.useState<Record<string, AttachmentRow[]>>({});

  const refreshRuns = React.useCallback(async () => {
    try {
      const res = await fetch('/api/operator-actions/runs?limit=15', { credentials: 'same-origin' });
      if (res.status === 403) {
        setRecentRuns([]);
        setRecentRunsError(null);
        return;
      }
      if (!res.ok) throw new Error(`Recent runs unavailable (${res.status})`);
      const data = await res.json();
      setRecentRuns(Array.isArray(data?.runs) ? data.runs : []);
      setRecentRunsError(null);
    } catch (err) {
      setRecentRunsError(err instanceof Error ? err.message : 'Failed to load recent runs');
    }
  }, []);

  React.useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        setLoading(true);
        setCatalogError(null);
        const res = await fetch('/api/operator-actions', { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`Actions catalog unavailable (${res.status})`);
        const data = await res.json();
        if (disposed) return;
        const fetchedActions: ActionDef[] = Array.isArray(data?.actions) ? data.actions : [];
        setActions(fetchedActions);
        setTier(typeof data?.tier === 'string' ? data.tier : '');
        // Default dry-run ON for any action that requires a confirmation phrase.
        // Operator must explicitly toggle dry-run off for live runs.
        setDryRunFlags((prev) => {
          const next = { ...prev };
          for (const a of fetchedActions) {
            if (next[a.id] !== undefined) continue;
            const hasConfirm = a.paramsSchema.some((f) => f.type === 'confirmation');
            if (hasConfirm && a.dryRunSupported) next[a.id] = true;
          }
          return next;
        });
      } catch (err) {
        if (!disposed) {
          setCatalogError(err instanceof Error ? err.message : 'Failed to load actions catalog');
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    void refreshRuns();
    return () => { disposed = true; };
  }, [refreshRuns]);

  const updateInput = React.useCallback((actionId: string, key: string, value: string) => {
    setInputs((prev) => ({
      ...prev,
      [actionId]: { ...(prev[actionId] || {}), [key]: value },
    }));
  }, []);

  const toggleDryRun = React.useCallback((actionId: string, next: boolean) => {
    setDryRunFlags((prev) => ({ ...prev, [actionId]: next }));
  }, []);

  const runOne = React.useCallback(async (action: ActionDef) => {
    const actionId = action.id;
    const params: Record<string, unknown> = {};
    const fieldInputs = inputs[actionId] || {};
    for (const field of action.paramsSchema) {
      const raw = fieldInputs[field.key];
      if (raw === undefined || raw === '') continue;
      if (field.type === 'number') {
        params[field.key] = Number(raw);
      } else if (field.type === 'boolean') {
        params[field.key] = raw === 'true';
      } else {
        params[field.key] = raw;
      }
    }
    setRunning((prev) => new Set(prev).add(actionId));
    setRunErrors((prev) => ({ ...prev, [actionId]: undefined }));
    try {
      const res = await fetch(`/api/operator-actions/${encodeURIComponent(actionId)}/run`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params, dryRun: Boolean(dryRunFlags[actionId]) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = data?.message || data?.error || `Run failed (${res.status})`;
        throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
      }
      setResults((prev) => ({ ...prev, [actionId]: data as ActionResult }));
      void refreshRuns();
    } catch (err) {
      setRunErrors((prev) => ({
        ...prev,
        [actionId]: err instanceof Error ? err.message : 'Run failed unexpectedly',
      }));
    } finally {
      setRunning((prev) => {
        const next = new Set(prev);
        next.delete(actionId);
        return next;
      });
    }
  }, [inputs, dryRunFlags, refreshRuns]);

  const copyResult = React.useCallback(async (artefact: ActionArtefact) => {
    try {
      await navigator.clipboard.writeText(artefactAsString(artefact));
    } catch {
      /* clipboard may be blocked in iframes — silent */
    }
  }, []);

  const callAttach = React.useCallback(async (runId: string, payload: Record<string, unknown>) => {
    setAttaching((prev) => new Set(prev).add(runId));
    setAttachError((prev) => ({ ...prev, [runId]: undefined }));
    setAttachToast((prev) => ({ ...prev, [runId]: undefined }));
    try {
      const res = await fetch(`/api/operator-actions/runs/${encodeURIComponent(runId)}/attach`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = data?.message || data?.error || `Attach failed (${res.status})`;
        throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
      }
      const target = String(payload.target || '');
      const ref = data?.targetRef ? ` (${String(data.targetRef).slice(0, 50)})` : '';
      setAttachToast((prev) => ({ ...prev, [runId]: `Attached to ${target}${ref}` }));
      // Refresh any open per-action history strips so the new row shows up.
      const openActionIds = Object.keys(historyOpen).filter((id) => historyOpen[id]);
      for (const actionId of openActionIds) {
        try {
          const hres = await fetch(`/api/operator-actions/attachments?actionId=${encodeURIComponent(actionId)}&limit=15`, { credentials: 'same-origin' });
          if (hres.ok) {
            const hdata = await hres.json();
            setHistory((prev) => ({ ...prev, [actionId]: Array.isArray(hdata?.attachments) ? hdata.attachments : [] }));
          }
        } catch {
          /* best-effort */
        }
      }
      window.setTimeout(() => {
        setAttachToast((prev) => {
          const next = { ...prev };
          delete next[runId];
          return next;
        });
      }, 4000);
    } catch (err) {
      setAttachError((prev) => ({
        ...prev,
        [runId]: err instanceof Error ? err.message : 'Attach failed unexpectedly',
      }));
    } finally {
      setAttaching((prev) => {
        const next = new Set(prev);
        next.delete(runId);
        return next;
      });
    }
  }, [historyOpen]);

  const updateAsanaForm = React.useCallback((runId: string, patch: Partial<{ mode: 'comment' | 'task'; taskGid: string; sectionGid: string; name: string }>) => {
    setAsanaForm((prev) => {
      const existing = prev[runId] || { mode: 'comment' as const, taskGid: '', sectionGid: '', name: '' };
      return {
        ...prev,
        [runId]: {
          ...existing,
          ...patch,
        },
      };
    });
  }, []);

  const toggleHistory = React.useCallback(async (actionId: string) => {
    const willOpen = !historyOpen[actionId];
    setHistoryOpen((prev) => ({ ...prev, [actionId]: willOpen }));
    if (willOpen && !history[actionId]) {
      try {
        const res = await fetch(`/api/operator-actions/attachments?actionId=${encodeURIComponent(actionId)}&limit=15`, { credentials: 'same-origin' });
        if (!res.ok) return;
        const data = await res.json();
        setHistory((prev) => ({ ...prev, [actionId]: Array.isArray(data?.attachments) ? data.attachments : [] }));
      } catch {
        /* swallow — history is best-effort */
      }
    }
  }, [historyOpen, history]);

  const groupedActions = React.useMemo(() => {
    const groups = new Map<string, ActionDef[]>();
    for (const action of actions) {
      const key = action.category || 'general';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(action);
    }
    return Array.from(groups.entries()).map(([category, items]) => ({
      key: category,
      label: category.charAt(0).toUpperCase() + category.slice(1),
      items,
    }));
  }, [actions]);

  return (
    <section className="activity-checks-panel" data-helix-region="activity/operator-actions">
      {tier === 'dev' && <RoleAccessMatrix />}
      <header className="activity-checks-header">
        <div>
          <div className="activity-checks-eyebrow">Operator actions</div>
          <h2 className="activity-checks-title">In-app one-offs</h2>
        </div>
        <span className="activity-checks-count">
          {actions.length} action{actions.length === 1 ? '' : 's'}{tier ? ` · ${tier}` : ''}
        </span>
      </header>

      {loading && <div className="activity-checks-empty">Loading actions...</div>}
      {catalogError && <div className="activity-checks-error">{catalogError}</div>}
      {!loading && !catalogError && actions.length === 0 && (
        <div className="activity-checks-empty">
          No operator actions are visible to you.
        </div>
      )}

      {groupedActions.map((group) => (
        <div key={group.key} className="activity-checks-group">
          <div className="activity-checks-group-title">{group.label}</div>
          <div className="activity-checks-grid">
            {group.items.map((action) => {
              const actionId = action.id;
              const isRunning = running.has(actionId);
              const result = results[actionId];
              const error = runErrors[actionId];
              const dryRun = Boolean(dryRunFlags[actionId]);
              const fieldInputs = inputs[actionId] || {};
              const missingRequired = action.paramsSchema.some(
                (f) => {
                  if (!f.required) return false;
                  // Confirmation fields only required for live runs.
                  if (f.type === 'confirmation' && dryRun) return false;
                  const raw = String(fieldInputs[f.key] || '').trim();
                  if (!raw) return true;
                  if (f.type === 'confirmation' && f.expectedPhrase && raw !== f.expectedPhrase) return true;
                  return false;
                },
              );

              return (
                <article key={actionId} className="activity-check-card">
                  <div className="activity-check-card-head">
                    <div>
                      <div className="activity-check-label">{action.title}</div>
                      <div className="activity-check-target">{actionId}</div>
                    </div>
                    <span className="activity-check-status">
                      {isRunning ? 'Running' : result ? (result.dryRun ? 'Dry-run' : 'Done') : 'Ready'}
                    </span>
                  </div>

                  {action.description && (
                    <div className="activity-check-line">{action.description}</div>
                  )}

                  {action.paramsSchema.length > 0 && (
                    <div className="activity-check-block">
                      <div className="activity-check-input-grid">
                        {action.paramsSchema.map((field) => {
                          // Hide confirmation fields entirely in dry-run mode.
                          if (field.type === 'confirmation' && dryRun) return null;
                          const raw = fieldInputs[field.key] ?? '';
                          const phraseMatches = field.type === 'confirmation' && field.expectedPhrase
                            ? raw === field.expectedPhrase
                            : null;
                          return (
                          <label key={field.key} className="activity-check-input-label">
                            {field.label}{field.required && (field.type !== 'confirmation' || !dryRun) ? ' *' : ''}
                            <input
                              className="activity-check-input"
                              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                              value={raw}
                              placeholder={field.placeholder || ''}
                              maxLength={field.maxLength}
                              onChange={(e) => updateInput(actionId, field.key, e.target.value)}
                              disabled={isRunning}
                              style={field.type === 'confirmation' ? {
                                fontFamily: 'monospace',
                                borderColor: phraseMatches ? '#20b26c' : raw ? '#D65541' : undefined,
                              } : undefined}
                            />
                            {field.helpText && <small>{field.helpText}</small>}
                            {field.type === 'confirmation' && raw && !phraseMatches && (
                              <small style={{ color: '#D65541' }}>Phrase does not match</small>
                            )}
                            {field.type === 'confirmation' && phraseMatches && (
                              <small style={{ color: '#20b26c' }}>Confirmed</small>
                            )}
                          </label>
                        );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="activity-check-meta" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {action.dryRunSupported && (
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
                          <input
                            type="checkbox"
                            checked={dryRun}
                            onChange={(e) => toggleDryRun(actionId, e.target.checked)}
                            disabled={isRunning}
                          />
                          Dry run
                        </label>
                      )}
                      <span>{action.allowedTiers.join(', ')}</span>
                    </div>
                    <button
                      type="button"
                      className="activity-check-input"
                      style={{
                        cursor: isRunning || missingRequired ? 'not-allowed' : 'pointer',
                        opacity: isRunning || missingRequired ? 0.6 : 1,
                        width: 'auto',
                        padding: '7px 14px',
                        fontWeight: 800,
                      }}
                      onClick={() => runOne(action)}
                      disabled={isRunning || missingRequired}
                    >
                      {isRunning ? 'Running…' : dryRun ? 'Run dry-run' : 'Run live'}
                    </button>
                  </div>

                  {error && <div className="activity-check-error-inline">{error}</div>}

                  {result && (
                    <div className="activity-check-block">
                      <div className="activity-check-block-title">
                        Result · {formatDuration(result.durationMs)} · run {result.runId.slice(0, 8)}
                      </div>
                      {result.summary && <div className="activity-check-line">{result.summary}</div>}
                      {Array.isArray(result.warnings) && result.warnings.length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
                          {result.warnings.map((w, i) => (
                            <li key={i} style={{ color: 'var(--status-warning, #FF8C00)' }}>{w}</li>
                          ))}
                        </ul>
                      )}
                      {result.artefact && (
                        <>
                          <div className="activity-check-meta" style={{ gap: 8 }}>
                            <button
                              type="button"
                              className="activity-check-input"
                              style={{ width: 'auto', padding: '5px 10px', cursor: 'pointer' }}
                              onClick={() => downloadArtefact(result.artefact!)}
                            >
                              Download
                            </button>
                            <button
                              type="button"
                              className="activity-check-input"
                              style={{ width: 'auto', padding: '5px 10px', cursor: 'pointer' }}
                              onClick={() => copyResult(result.artefact!)}
                            >
                              Copy
                            </button>
                            <span>{result.artefact.kind}</span>
                          </div>
                          {/* Phase B attach controls — only shown if the artefact opts in. */}
                          {Array.isArray(result.artefact.attachableTo) && result.artefact.attachableTo.length > 0 && (
                            <div className="activity-check-block">
                              <div className="activity-check-block-title">Attach</div>
                              <div className="activity-check-meta" style={{ gap: 8, flexWrap: 'wrap' }}>
                                {result.artefact.attachableTo.includes('blob') && (
                                  <button
                                    type="button"
                                    className="activity-check-input"
                                    style={{ width: 'auto', padding: '5px 10px', cursor: attaching.has(result.runId) ? 'not-allowed' : 'pointer' }}
                                    onClick={() => callAttach(result.runId, { target: 'blob' })}
                                    disabled={attaching.has(result.runId)}
                                  >
                                    {attaching.has(result.runId) ? 'Saving…' : 'Save to blob'}
                                  </button>
                                )}
                                {(['matter', 'prospect', 'time-entry'] as const).map((t) => (
                                  result.artefact!.attachableTo!.includes(t) ? (
                                    <button
                                      key={t}
                                      type="button"
                                      className="activity-check-input"
                                      style={{ width: 'auto', padding: '5px 10px', cursor: 'not-allowed', opacity: 0.6 }}
                                      title="Wiring lands in Phase B.2"
                                      disabled
                                    >
                                      {t === 'time-entry' ? 'Time entry (B.2)' : `${t.charAt(0).toUpperCase() + t.slice(1)} (B.2)`}
                                    </button>
                                  ) : null
                                ))}
                              </div>
                              {result.artefact.attachableTo.includes('asana') && (() => {
                                const form = asanaForm[result.runId] || { mode: 'comment' as const, taskGid: '', sectionGid: '', name: '' };
                                const submitDisabled = attaching.has(result.runId)
                                  || (form.mode === 'comment' && !form.taskGid.trim())
                                  || (form.mode === 'task' && (!form.sectionGid.trim() || !form.name.trim()));
                                return (
                                  <div className="activity-check-input-grid" style={{ marginTop: 6 }}>
                                    <label className="activity-check-input-label">
                                      Asana mode
                                      <select
                                        className="activity-check-input"
                                        value={form.mode}
                                        onChange={(e) => updateAsanaForm(result.runId, { mode: e.target.value as 'comment' | 'task' })}
                                      >
                                        <option value="comment">Comment on task</option>
                                        <option value="task">Create task in section</option>
                                      </select>
                                    </label>
                                    {form.mode === 'comment' ? (
                                      <label className="activity-check-input-label">
                                        Task GID *
                                        <input
                                          className="activity-check-input"
                                          value={form.taskGid}
                                          placeholder="e.g. 1208…"
                                          onChange={(e) => updateAsanaForm(result.runId, { taskGid: e.target.value })}
                                        />
                                      </label>
                                    ) : (
                                      <>
                                        <label className="activity-check-input-label">
                                          Section GID *
                                          <input
                                            className="activity-check-input"
                                            value={form.sectionGid}
                                            placeholder="e.g. 1204…"
                                            onChange={(e) => updateAsanaForm(result.runId, { sectionGid: e.target.value })}
                                          />
                                        </label>
                                        <label className="activity-check-input-label">
                                          Task name *
                                          <input
                                            className="activity-check-input"
                                            value={form.name}
                                            onChange={(e) => updateAsanaForm(result.runId, { name: e.target.value })}
                                          />
                                        </label>
                                      </>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                      <button
                                        type="button"
                                        className="activity-check-input"
                                        style={{ width: '100%', padding: '7px 10px', cursor: submitDisabled ? 'not-allowed' : 'pointer', opacity: submitDisabled ? 0.6 : 1, fontWeight: 800 }}
                                        disabled={submitDisabled}
                                        onClick={() => callAttach(result.runId, {
                                          target: 'asana',
                                          mode: form.mode,
                                          taskGid: form.taskGid.trim() || undefined,
                                          sectionGid: form.sectionGid.trim() || undefined,
                                          name: form.name.trim() || undefined,
                                        })}
                                      >
                                        Post to Asana
                                      </button>
                                    </div>
                                  </div>
                                );
                              })()}
                              {attachError[result.runId] && (
                                <div className="activity-check-error-inline">{attachError[result.runId]}</div>
                              )}
                              {attachToast[result.runId] && (
                                <div className="activity-check-line" style={{ color: 'var(--status-success)' }}>
                                  {attachToast[result.runId]}
                                </div>
                              )}
                            </div>
                          )}
                          <pre
                            style={{
                              margin: 0,
                              padding: 10,
                              maxHeight: 320,
                              overflow: 'auto',
                              background: 'var(--surface-card)',
                              border: '1px solid var(--border-base)',
                              borderRadius: 0,
                              fontSize: 11,
                              fontFamily: "Consolas, 'Courier New', monospace",
                              color: 'var(--text-body)',
                            }}
                          >
                            {artefactAsString(result.artefact)}
                          </pre>
                        </>
                      )}
                    </div>
                  )}

                  {/* Per-action attachment history (lazy disclosure). */}
                  <div className="activity-check-block">
                    <button
                      type="button"
                      className="activity-check-input"
                      style={{ width: 'auto', padding: '4px 10px', cursor: 'pointer', fontSize: 10 }}
                      onClick={() => toggleHistory(actionId)}
                    >
                      {historyOpen[actionId] ? 'Hide attachments' : 'Show attachments'}
                    </button>
                    {historyOpen[actionId] && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                        {(history[actionId] || []).length === 0 && (
                          <div className="activity-checks-empty">No attachments yet.</div>
                        )}
                        {(history[actionId] || []).map((row) => (
                          <div
                            key={row.id}
                            className="activity-check-line"
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '70px 70px 1fr auto auto',
                              gap: 8,
                              padding: '4px 8px',
                              background: 'var(--surface-card)',
                              border: '1px solid var(--border-base)',
                            }}
                          >
                            <span className="activity-check-target">{formatTime(row.attachedAt)}</span>
                            <span className="activity-check-target">{row.target}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row.targetRef || row.error || '—'}
                            </span>
                            <span className="activity-check-target">{row.attachedBy?.initials || ''}</span>
                            <span
                              className="activity-check-status"
                              style={{ color: row.status === 'failed' ? 'var(--status-error)' : 'var(--status-success)' }}
                            >
                              {row.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ))}

      {/* Recent runs strip */}
      <div className="activity-checks-group">
        <div className="activity-checks-group-title">Recent runs</div>
        {recentRunsError && <div className="activity-checks-error">{recentRunsError}</div>}
        {!recentRunsError && recentRuns.length === 0 && (
          <div className="activity-checks-empty">No runs yet.</div>
        )}
        {recentRuns.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentRuns.map((run) => (
              <div
                key={run.id}
                className="activity-check-line"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr auto auto auto',
                  gap: 10,
                  padding: '5px 8px',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-base)',
                }}
              >
                <span className="activity-check-target">{formatTime(run.startedAt)}</span>
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>{run.actionId}</strong>
                  {run.summary ? ` — ${run.summary}` : ''}
                </span>
                <span className="activity-check-target">{run.requestor.initials || ''}</span>
                <span className="activity-check-target">{formatDuration(run.durationMs)}</span>
                <span
                  className="activity-check-status"
                  style={{
                    color:
                      run.status === 'failed'
                        ? 'var(--status-error)'
                        : run.status === 'dry-run'
                          ? 'var(--status-warning)'
                          : 'var(--status-success)',
                  }}
                >
                  {run.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default OperatorActionsPanel;
