import React from 'react';

type OpsCheckStatus = 'pass' | 'warn' | 'fail';
type OpsCheckGroup = 'route' | 'workflow' | 'dependency';
type OpsCheckRisk = 'safe' | 'observe' | 'mutation';
type OpsCheckRunMode = 'safe' | 'requires-confirmation' | 'dry-run-only';
type OpsCheckInputKind = 'text' | 'instruction-ref' | 'passcode' | 'initials';
type DependencySeverity = 'blocking' | 'degraded' | 'noise';

interface OpsCheckInputField {
  key: string;
  label: string;
  required: boolean;
  kind: OpsCheckInputKind;
  helpText?: string;
}

interface OpsCheckCatalogItem {
  id: string;
  label: string;
  group: OpsCheckGroup;
  risk: OpsCheckRisk;
  runMode: OpsCheckRunMode;
  method: string;
  target: string;
  dependencies: string[];
  whatWillHappen: string[];
  successCriteria: string[];
  timeoutMs: number;
  inputSchema: OpsCheckInputField[];
}

interface OpsCheckDependencyResult {
  name: string;
  status: OpsCheckStatus;
  severity: DependencySeverity;
  statusCode: number | null;
  durationMs: number;
  detail: string;
  evidence?: {
    path?: string;
    contentType?: string | null;
    bytes?: number;
  };
}

interface OpsCheckRunResult extends OpsCheckCatalogItem {
  status: OpsCheckStatus;
  durationMs: number;
  checkedAt: string;
  dependencyResults: OpsCheckDependencyResult[];
}

type RunState = Record<string, OpsCheckRunResult | undefined>;
type ErrorState = Record<string, string | undefined>;
type InputState = Record<string, Record<string, string | undefined> | undefined>;

function statusLabel(status?: OpsCheckStatus): string {
  if (status === 'pass') return 'Pass';
  if (status === 'warn') return 'Warn';
  if (status === 'fail') return 'Fail';
  return 'Ready';
}

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function runModeLabel(runMode: OpsCheckRunMode): string {
  if (runMode === 'dry-run-only') return 'dry-run only';
  if (runMode === 'requires-confirmation') return 'confirmation required';
  return 'safe';
}

function inputType(kind: OpsCheckInputKind): string {
  return kind === 'passcode' ? 'password' : 'text';
}

function inputPlaceholder(kind: OpsCheckInputKind): string {
  if (kind === 'initials') return 'LZ';
  if (kind === 'instruction-ref') return 'HLX-00000-00000';
  if (kind === 'passcode') return 'Required passcode';
  return '';
}

const RouteChecksPanel: React.FC = () => {
  const [checks, setChecks] = React.useState<OpsCheckCatalogItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [catalogError, setCatalogError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState<Set<string>>(() => new Set());
  const [results, setResults] = React.useState<RunState>({});
  const [runErrors, setRunErrors] = React.useState<ErrorState>({});
  const [inputs, setInputs] = React.useState<InputState>({});

  React.useEffect(() => {
    let disposed = false;

    const loadCatalog = async () => {
      try {
        setLoading(true);
        setCatalogError(null);
        const res = await fetch('/api/ops-checks/catalog', { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`Checks catalog unavailable (${res.status})`);
        const data = await res.json();
        if (disposed) return;
        setChecks(Array.isArray(data?.checks) ? data.checks : []);
      } catch (error) {
        if (!disposed) {
          setCatalogError(error instanceof Error ? error.message : 'Failed to load checks catalog');
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void loadCatalog();
    return () => { disposed = true; };
  }, []);

  const updateInput = React.useCallback((checkId: string, key: string, value: string) => {
    setInputs((prev) => ({
      ...prev,
      [checkId]: {
        ...(prev[checkId] || {}),
        [key]: value,
      },
    }));
  }, []);

  const runCheck = React.useCallback(async (check: OpsCheckCatalogItem) => {
    const checkId = check.id;
    setRunning((prev) => new Set(prev).add(checkId));
    setRunErrors((prev) => ({ ...prev, [checkId]: undefined }));

    try {
      const res = await fetch(`/api/ops-checks/run/${encodeURIComponent(checkId)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: inputs[checkId] || {} }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message || `Check failed (${res.status})`);
      const result = data?.result as OpsCheckRunResult | undefined;
      if (!result) throw new Error('Check returned no result.');
      setResults((prev) => ({ ...prev, [checkId]: result }));
    } catch (error) {
      setRunErrors((prev) => ({
        ...prev,
        [checkId]: error instanceof Error ? error.message : 'Check failed unexpectedly.',
      }));
    } finally {
      setRunning((prev) => {
        const next = new Set(prev);
        next.delete(checkId);
        return next;
      });
    }
  }, [inputs]);

  const groupedChecks = React.useMemo(() => {
    const route = checks.filter((check) => check.group === 'route');
    const dependency = checks.filter((check) => check.group === 'dependency');
    const workflow = checks.filter((check) => check.group === 'workflow');
    return [
      { key: 'route', label: 'Routes', checks: route },
      { key: 'dependency', label: 'Dependencies', checks: dependency },
      { key: 'workflow', label: 'Workflows', checks: workflow },
    ].filter((group) => group.checks.length > 0);
  }, [checks]);

  return (
    <section className="activity-checks-panel" data-helix-region="activity/checks">
      <header className="activity-checks-header">
        <div>
          <div className="activity-checks-eyebrow">Prod-parity checks</div>
          <h2 className="activity-checks-title">Route readiness</h2>
        </div>
        <span className="activity-checks-count">{checks.length} checks</span>
      </header>

      {loading && <div className="activity-checks-empty">Loading checks...</div>}
      {catalogError && <div className="activity-checks-error">{catalogError}</div>}
      {!loading && !catalogError && checks.length === 0 && (
        <div className="activity-checks-empty">No checks are registered.</div>
      )}

      {groupedChecks.map((group) => (
        <div key={group.key} className="activity-checks-group">
          <div className="activity-checks-group-title">{group.label}</div>
          <div className="activity-checks-grid">
            {group.checks.map((check) => {
              const result = results[check.id];
              const error = runErrors[check.id];
              const isRunning = running.has(check.id);
              const status = result?.status;
              const statusClass = status || 'idle';
              const checkInputs = inputs[check.id] || {};
              const missingRequiredInput = (check.inputSchema || []).some((field) => field.required && !String(checkInputs[field.key] || '').trim());

              return (
                <article key={check.id} className={`activity-check-card activity-check-card--${statusClass}`}>
                  <div className="activity-check-card-head">
                    <div>
                      <div className="activity-check-label">{check.label}</div>
                      <div className="activity-check-target">{check.method} {check.target}</div>
                    </div>
                    <span className={`activity-check-status activity-check-status--${statusClass}`}>
                      {isRunning ? 'Running' : statusLabel(status)}
                    </span>
                  </div>

                  <div className="activity-check-meta">
                    <span>{check.risk}</span>
                    <span>{runModeLabel(check.runMode)}</span>
                    <span>{check.timeoutMs}ms budget</span>
                    {result && <span>{result.durationMs}ms</span>}
                    {result && <span>{formatCheckedAt(result.checkedAt)}</span>}
                  </div>

                  {(check.inputSchema || []).length > 0 && (
                    <div className="activity-check-block">
                      <div className="activity-check-block-title">Inputs</div>
                      <div className="activity-check-input-grid">
                        {(check.inputSchema || []).map((field) => (
                          <label key={field.key} className="activity-check-input-label">
                            <span>
                              {field.label}{field.required ? ' *' : ''}
                            </span>
                            <input
                              className="activity-check-input"
                              type={inputType(field.kind)}
                              value={checkInputs[field.key] || ''}
                              placeholder={inputPlaceholder(field.kind)}
                              autoComplete={field.kind === 'passcode' ? 'off' : undefined}
                              onChange={(event) => updateInput(check.id, field.key, event.target.value)}
                            />
                            {field.helpText && <small>{field.helpText}</small>}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="activity-check-block">
                    <div className="activity-check-block-title">What will happen</div>
                    {check.whatWillHappen.map((item) => (
                      <div key={item} className="activity-check-line">{item}</div>
                    ))}
                  </div>

                  <div className="activity-check-block">
                    <div className="activity-check-block-title">Dependencies</div>
                    <div className="activity-check-chip-row">
                      {check.dependencies.map((dependency) => (
                        <span key={dependency} className="activity-check-chip">{dependency}</span>
                      ))}
                    </div>
                  </div>

                  {result && (
                    <div className="activity-check-results">
                      {result.dependencyResults.map((dependency) => (
                        <div key={`${dependency.name}-${dependency.statusCode ?? 'x'}`} className="activity-check-result-row">
                          <span className={`activity-check-dot activity-check-dot--${dependency.status}`} />
                          <div className="activity-check-result-main">
                            <span>{dependency.name}</span>
                            <small>{dependency.severity} - {dependency.detail}</small>
                          </div>
                          <span className="activity-check-code">{dependency.statusCode ?? 'n/a'}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {error && <div className="activity-check-error-inline">{error}</div>}

                  <button
                    type="button"
                    className="activity-check-run-button"
                    disabled={isRunning || missingRequiredInput}
                    onClick={() => void runCheck(check)}
                  >
                    {isRunning ? 'Running check' : check.runMode === 'dry-run-only' ? 'Run dry-run check' : 'Run live check'}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
};

export default RouteChecksPanel;