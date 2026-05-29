import React from 'react';
import { colours } from '../../../app/styles/colours';
import { buildRequestAuthHeaders } from '../../../utils/requestAuthContext';

type ReplayStatus = 'failed' | 'pending' | 'all' | 'open';
type StepState = 'complete' | 'inferred' | 'pending' | 'missing' | 'failed' | 'warning';

interface SubmissionSummary {
  total: number;
  errors: number;
  lastTs: string | null;
  lastError: SubmissionEvent | null;
}

interface SubmissionEvent {
  id: string;
  ts: string;
  status: string;
  step: string;
  title: string;
  summary: string;
  initials: string;
  traceId: string;
  error: string | null;
}

interface ReplayRequest {
  instructionRef: string;
  matterRequestId: string | null;
  matterId: string | null;
  openedAt: string | null;
  status: string;
  statusLabel: string;
  issue: string;
  duplicateCount: number;
  clientLabel: string;
  feeEarner: string;
  practiceArea: string;
  displayNumber: string | null;
  stepSummary: { completed: number; total: number; current: string };
  submissions?: SubmissionSummary;
}

interface ProcessStep {
  key: string;
  label: string;
  state: StepState;
  detail: string;
}

interface RepairField {
  key: string;
  label: string;
  required: boolean;
  maxLength: number;
}

interface FieldResult {
  field: string;
  label: string;
  value: string;
  ok: boolean;
  severity: 'ok' | 'warning' | 'error';
  message: string;
}

interface RepairValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  fieldResults: FieldResult[];
}

interface MatterReplayDetail {
  instructionRef: string;
  status: string;
  statusLabel: string;
  issue: string;
  processSteps: ProcessStep[];
  repairFields: RepairField[];
  repairDefaults: Record<string, string>;
  repairFocus: Array<{ field: string; reason: string }>;
  validation: RepairValidation;
  matterRequestId: string | null;
  instruction: {
    stage: string | null;
    internalStatus: string | null;
    clientType: string | null;
    helixContact: string | null;
    clientId: string | null;
    matterId: string | null;
    lastUpdated: string | null;
    emailPresent: boolean;
    phonePresent: boolean;
    dobPresent: boolean;
    companyNamePresent: boolean;
  } | null;
  matterRows: Array<{
    matterId: string;
    status: string;
    openedAt: string | null;
    clientId: string | null;
    displayNumber: string | null;
    practiceArea: string | null;
    responsibleSolicitor: string | null;
    originatingSolicitor: string | null;
  }>;
  deal: { areaOfWork: string | null; serviceDescription: string | null; source: string | null } | null;
  submissionEvents?: SubmissionEvent[];
  submissions?: SubmissionSummary;
}

interface MatterReplayViewProps {
  viewerInitials: string | null;
  isDarkMode: boolean;
  onBack: () => void;
  onOpenDashboard: () => void;
}

const STATUS_OPTIONS: Array<{ key: ReplayStatus; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'failed', label: 'Needs attention' },
  { key: 'pending', label: 'Pending' },
  { key: 'open', label: 'Open' },
];

const WINDOW_OPTIONS = [3, 7, 14, 31];

function formatDateTime(value: string | null): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function stateColour(state: string): string {
  if (state === 'complete' || state === 'open') return colours.green;
  if (state === 'inferred') return colours.highlight;
  if (state === 'warning' || state === 'needs-cleanup') return colours.orange;
  if (state === 'failed' || state === 'missing' || state === 'incomplete') return colours.cta;
  return colours.greyText;
}

function validationForField(validation: RepairValidation | null, field: string): FieldResult | null {
  return validation?.fieldResults.find((item) => item.field === field) || null;
}

function statusFilterDescription(status: ReplayStatus): string {
  if (status === 'all') return 'Showing successful, pending and problem opening requests.';
  if (status === 'failed') return 'Showing requests that need attention before or after replay.';
  if (status === 'pending') return 'Showing pending Hub matter request placeholders.';
  return 'Showing successful openings only.';
}

const STEP_REPAIR_FIELDS: Record<string, string[]> = {
  opponents: [],
  'matter-request': ['feeEarnerInitials'],
  'clio-contacts': ['feeEarnerInitials'],
  'clio-matter': ['feeEarnerInitials', 'feeEarner', 'originatingSolicitor', 'supervisingPartner', 'practiceArea', 'description'],
  'instruction-sync': [],
  'matter-request-patch': ['source'],
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.message || body?.error || `Request failed (${response.status})`);
  }
  return body as T;
}

const HeaderButton: React.FC<{ label: string; isDarkMode: boolean; accent?: string; onClick: () => void }> = ({ label, isDarkMode, accent, onClick }) => {
  const mutedColour = isDarkMode ? '#d1d5db' : colours.greyText;
  const borderColour = accent || (isDarkMode ? colours.dark.border : colours.light.border);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${borderColour}`,
        background: accent ? `${accent}1A` : 'transparent',
        color: accent || mutedColour,
        padding: '7px 10px',
        borderRadius: 0,
        cursor: 'pointer',
        fontFamily: 'Raleway, sans-serif',
        fontSize: 11,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      {label}
    </button>
  );
};

const ProcessTraceList: React.FC<{
  steps: ProcessStep[];
  expandedKey: string | null;
  onToggle: (key: string) => void;
  renderTray: (step: ProcessStep) => React.ReactNode;
  isDarkMode: boolean;
  textColour: string;
  mutedColour: string;
  borderColour: string;
  cardBg: string;
}> = ({ steps, expandedKey, onToggle, renderTray, isDarkMode, textColour, mutedColour, borderColour, cardBg }) => {
  const completeCount = steps.filter((step) => step.state === 'complete' || step.state === 'inferred').length;
  const issueCount = steps.filter((step) => step.state === 'failed' || step.state === 'missing' || step.state === 'warning').length;
  const trayBg = isDarkMode ? 'rgba(10, 28, 50, 0.34)' : 'rgba(244, 247, 252, 0.72)';

  return (
    <section data-helix-region="system/matter-replay/process-trace" style={{ border: `1px solid ${borderColour}`, background: cardBg, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: mutedColour, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Process trace</div>
          <div style={{ fontSize: 11, color: mutedColour, marginTop: 3 }}>Click a step to inspect its values.</div>
        </div>
        <div style={{ color: issueCount > 0 ? colours.cta : colours.green, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
          {completeCount} / {steps.length} resolved
        </div>
      </div>

      <div role="list" aria-label="Matter opening process trace" style={{ display: 'grid', gap: 4 }}>
        {steps.map((step, index) => {
          const accent = stateColour(step.state);
          const isOpen = expandedKey === step.key;
          return (
            <div key={step.key} role="listitem" style={{ border: `1px solid ${borderColour}`, borderLeft: `3px solid ${accent}`, background: isOpen ? trayBg : cardBg }}>
              <button
                type="button"
                onClick={() => onToggle(step.key)}
                aria-expanded={isOpen}
                style={{
                  width: '100%', display: 'grid', gridTemplateColumns: '26px 1fr auto 18px', alignItems: 'center', gap: 10,
                  padding: '8px 10px', border: 'none', background: 'transparent', cursor: 'pointer',
                  textAlign: 'left', color: textColour, fontFamily: 'Raleway, sans-serif',
                }}
              >
                <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${accent}`, background: `${accent}1A`, color: accent, fontSize: 10, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                  {index + 1}
                </span>
                <span style={{ fontSize: 12, fontWeight: 900, lineHeight: 1.2 }}>{step.label}</span>
                <span style={{ color: accent, fontSize: 9.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{step.state}</span>
                <span aria-hidden="true" style={{ color: mutedColour, fontSize: 10, fontWeight: 900, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease' }}>{'\u203A'}</span>
              </button>
              {isOpen && (
                <div style={{ borderTop: `1px solid ${borderColour}`, padding: 12, display: 'grid', gap: 10 }}>
                  <div style={{ color: mutedColour, fontSize: 11, lineHeight: 1.4, fontWeight: 700 }}>{step.detail}</div>
                  {renderTray(step)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

const MatterReplayView: React.FC<MatterReplayViewProps> = ({ viewerInitials, isDarkMode, onBack, onOpenDashboard }) => {
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const mutedColour = isDarkMode ? '#d1d5db' : colours.greyText;
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const panelBg = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;
  const cardBg = isDarkMode ? colours.dark.cardBackground : '#fff';

  const [status, setStatus] = React.useState<ReplayStatus>('all');
  const [windowDays, setWindowDays] = React.useState(7);
  const [requests, setRequests] = React.useState<ReplayRequest[]>([]);
  const [selectedRef, setSelectedRef] = React.useState<string>('');
  const [detail, setDetail] = React.useState<MatterReplayDetail | null>(null);
  const [repair, setRepair] = React.useState<Record<string, string>>({});
  const [validation, setValidation] = React.useState<RepairValidation | null>(null);
  const [loadingList, setLoadingList] = React.useState(false);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [validationBusy, setValidationBusy] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [actionMessage, setActionMessage] = React.useState<{ kind: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [runOutput, setRunOutput] = React.useState<unknown>(null);
  const [confirmationPhrase, setConfirmationPhrase] = React.useState('REPLAY MATTER');
  const [typedConfirmation, setTypedConfirmation] = React.useState('');
  const [expandedStep, setExpandedStep] = React.useState<string | null>(null);

  const loadRequests = React.useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status, days: String(windowDays), limit: '60' });
      const body = await fetchJson<{ requests: ReplayRequest[] }>(`/api/matter-replay/requests?${params.toString()}`, {
        headers: buildRequestAuthHeaders(viewerInitials ? { 'x-helix-initials': viewerInitials } : undefined),
      });
      setRequests(Array.isArray(body.requests) ? body.requests : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matter replay requests');
      setRequests([]);
    } finally {
      setLoadingList(false);
    }
  }, [status, viewerInitials, windowDays]);

  React.useEffect(() => { void loadRequests(); }, [loadRequests]);

  React.useEffect(() => {
    if (!selectedRef && requests.length > 0) setSelectedRef(requests[0].instructionRef);
    if (selectedRef && requests.length > 0 && !requests.some((request) => request.instructionRef === selectedRef)) {
      setSelectedRef(requests[0].instructionRef);
    }
  }, [requests, selectedRef]);

  React.useEffect(() => {
    if (!selectedRef) {
      setDetail(null);
      return;
    }
    let disposed = false;
    (async () => {
      setLoadingDetail(true);
      setDetailError(null);
      setActionMessage(null);
      setRunOutput(null);
      try {
        const body = await fetchJson<{ detail: MatterReplayDetail; confirmationPhrase?: string }>(`/api/matter-replay/requests/${encodeURIComponent(selectedRef)}`, {
          headers: buildRequestAuthHeaders(viewerInitials ? { 'x-helix-initials': viewerInitials } : undefined),
        });
        if (disposed) return;
        setDetail(body.detail);
        setRepair(body.detail.repairDefaults || {});
        setValidation(body.detail.validation || null);
        setConfirmationPhrase(body.confirmationPhrase || 'REPLAY MATTER');
        setTypedConfirmation('');
        const focus = body.detail.processSteps.find((step) => step.state === 'failed' || step.state === 'missing' || step.state === 'warning')
          || body.detail.processSteps.find((step) => step.state === 'inferred')
          || null;
        setExpandedStep(focus ? focus.key : null);
      } catch (err) {
        if (!disposed) {
          setDetailError(err instanceof Error ? err.message : 'Failed to inspect opening request');
          setDetail(null);
        }
      } finally {
        if (!disposed) setLoadingDetail(false);
      }
    })();
    return () => { disposed = true; };
  }, [selectedRef, viewerInitials]);

  React.useEffect(() => {
    if (!detail) return;
    const handle = window.setTimeout(async () => {
      setValidationBusy(true);
      try {
        const body = await fetchJson<{ validation: RepairValidation; repair: Record<string, string> }>('/api/matter-replay/validate', {
          method: 'POST',
          headers: buildRequestAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ instructionRef: detail.instructionRef, repair }),
        });
        setValidation(body.validation);
      } catch (err) {
        setValidation({ ok: false, errors: [err instanceof Error ? err.message : 'Validation failed'], warnings: [], fieldResults: [] });
      } finally {
        setValidationBusy(false);
      }
    }, 350);
    return () => window.clearTimeout(handle);
  }, [detail, repair]);

  const updateRepair = React.useCallback((field: string, value: string) => {
    setRepair((prev) => ({ ...prev, [field]: value }));
    setActionMessage(null);
  }, []);

  const saveRepair = React.useCallback(async () => {
    if (!detail) return;
    setActionBusy('repair');
    setActionMessage(null);
    try {
      await fetchJson('/api/matter-replay/repair', {
        method: 'POST',
        headers: buildRequestAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ instructionRef: detail.instructionRef, matterRequestId: detail.matterRequestId, repair }),
      });
      setActionMessage({ kind: 'success', text: 'Repair saved to the pending Hub placeholder.' });
      void loadRequests();
    } catch (err) {
      setActionMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Repair save failed' });
    } finally {
      setActionBusy(null);
    }
  }, [detail, loadRequests, repair]);

  const runReplay = React.useCallback(async (dryRun: boolean) => {
    if (!detail) return;
    setActionBusy(dryRun ? 'dry-run' : 'commit');
    setActionMessage(null);
    try {
      const body = await fetchJson<{ result: { ok: boolean; output: unknown; stderr?: string; exitCode?: number } }>('/api/matter-replay/replay', {
        method: 'POST',
        headers: buildRequestAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          instructionRef: detail.instructionRef,
          matterRequestId: detail.matterRequestId,
          repair,
          dryRun,
          confirmationPhrase: typedConfirmation,
        }),
      });
      setRunOutput(body.result?.output ?? body);
      setActionMessage({ kind: body.result?.ok ? 'success' : 'error', text: dryRun ? 'Dry run complete. Inspect the output before commit.' : 'Live replay completed.' });
      if (!dryRun) {
        setTypedConfirmation('');
        void loadRequests();
      }
    } catch (err) {
      setActionMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Replay failed' });
    } finally {
      setActionBusy(null);
    }
  }, [detail, loadRequests, repair, typedConfirmation]);

  const selectedRequest = requests.find((request) => request.instructionRef === selectedRef) || null;
  const canMutate = Boolean(detail && detail.status !== 'open' && detail.matterRequestId);
  const canDryRun = Boolean(canMutate && validation?.ok && !actionBusy);
  const canCommit = Boolean(canMutate && validation?.ok && typedConfirmation === confirmationPhrase && !actionBusy);
  const actionColour = actionMessage?.kind === 'error' ? colours.cta : actionMessage?.kind === 'success' ? colours.green : mutedColour;

  return (
    <section data-helix-region="system/matter-replay" style={{ color: textColour, fontFamily: 'Raleway, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour }}>
            System
          </div>
          <h1 style={{ margin: '3px 0 0', fontSize: 24, lineHeight: 1.2, color: textColour, fontFamily: 'Raleway, sans-serif' }}>
            Matter Replay
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <HeaderButton label="Back" isDarkMode={isDarkMode} onClick={onBack} />
          <HeaderButton label="Dashboard" isDarkMode={isDarkMode} accent={colours.highlight} onClick={onOpenDashboard} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        <aside style={{ border: `1px solid ${borderColour}`, background: panelBg, minHeight: 620 }}>
          <div style={{ padding: 12, borderBottom: `1px solid ${borderColour}`, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((option) => {
                const active = status === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setStatus(option.key)}
                    style={{
                      height: 30,
                      padding: '0 10px',
                      border: `1px solid ${active ? colours.highlight : borderColour}`,
                      background: active ? `${colours.highlight}1F` : 'transparent',
                      color: active ? colours.highlight : mutedColour,
                      cursor: 'pointer',
                      fontFamily: 'Raleway, sans-serif',
                      fontSize: 11,
                      fontWeight: 800,
                      borderRadius: 0,
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: mutedColour, fontWeight: 700, lineHeight: 1.35 }}>
              {statusFilterDescription(status)}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
              <select
                value={windowDays}
                onChange={(event) => setWindowDays(Number(event.target.value))}
                style={{ height: 30, border: `1px solid ${borderColour}`, background: cardBg, color: textColour, fontFamily: 'Raleway, sans-serif', fontWeight: 700, padding: '0 8px' }}
              >
                {WINDOW_OPTIONS.map((days) => <option key={days} value={days}>{days} days</option>)}
              </select>
              <button
                type="button"
                onClick={() => void loadRequests()}
                disabled={loadingList}
                style={{ height: 30, border: 'none', background: colours.highlight, color: '#fff', padding: '0 12px', cursor: loadingList ? 'wait' : 'pointer', fontFamily: 'Raleway, sans-serif', fontWeight: 800 }}
              >
                {loadingList ? 'Refreshing' : 'Refresh'}
              </button>
            </div>
          </div>

          {error && <div style={{ padding: 12, color: colours.cta, fontSize: 12 }}>{error}</div>}
          {!error && loadingList && (
            <div style={{ padding: 10, display: 'grid', gap: 8 }}>
              {[0, 1, 2].map((row) => <div key={row} style={{ height: 78, border: `1px solid ${borderColour}`, background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />)}
            </div>
          )}
          {!error && !loadingList && requests.length === 0 && (
            <div style={{ padding: 14, color: mutedColour, fontSize: 12 }}>No opening requests found for this filter.</div>
          )}
          {!error && requests.length > 0 && (
            <div style={{ display: 'grid', gap: 6, padding: 8 }}>
              {requests.map((request) => {
                const active = request.instructionRef === selectedRef;
                const accent = stateColour(request.status);
                return (
                  <button
                    key={request.instructionRef}
                    type="button"
                    onClick={() => setSelectedRef(request.instructionRef)}
                    style={{
                      textAlign: 'left',
                      border: `1px solid ${active ? accent : borderColour}`,
                      borderLeft: `4px solid ${accent}`,
                      background: active ? `${accent}14` : cardBg,
                      color: textColour,
                      padding: 10,
                      cursor: 'pointer',
                      fontFamily: 'Raleway, sans-serif',
                      display: 'grid',
                      gap: 5,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 900 }}>{request.instructionRef}</span>
                      <span style={{ fontSize: 10, fontWeight: 900, color: accent, textTransform: 'uppercase' }}>{request.status}</span>
                    </div>
                    <div style={{ color: mutedColour, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{request.clientLabel}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', color: mutedColour, fontSize: 10 }}>
                      <span>{formatDateTime(request.openedAt)}</span>
                      <span>{request.stepSummary.completed}/{request.stepSummary.total} steps</span>
                      {request.duplicateCount > 1 && <span style={{ color: colours.orange }}>{request.duplicateCount} rows</span>}
                      {request.submissions && request.submissions.total > 0 && (
                        <span style={{ color: request.submissions.errors > 0 ? colours.cta : mutedColour }}>
                          {request.submissions.total} event{request.submissions.total === 1 ? '' : 's'}{request.submissions.errors > 0 ? `, ${request.submissions.errors} error${request.submissions.errors === 1 ? '' : 's'}` : ''}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <main style={{ minWidth: 0 }}>
          {!selectedRequest && !loadingDetail && (
            <div style={{ border: `1px solid ${borderColour}`, background: panelBg, padding: 18, color: mutedColour }}>Select an opening request to inspect.</div>
          )}
          {detailError && <div style={{ border: `1px solid ${colours.cta}`, background: `${colours.cta}12`, padding: 14, color: colours.cta }}>{detailError}</div>}
          {loadingDetail && (
            <div style={{ border: `1px solid ${borderColour}`, background: panelBg, padding: 12, display: 'grid', gap: 10 }}>
              {[0, 1, 2, 3].map((row) => <div key={row} style={{ height: row === 0 ? 82 : 54, background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />)}
            </div>
          )}
          {!loadingDetail && detail && (
            <div style={{ display: 'grid', gap: 12 }}>
              <section style={{ border: `1px solid ${borderColour}`, background: panelBg, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: mutedColour, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Opening request</div>
                    <h2 style={{ margin: '4px 0 0', fontSize: 20, color: textColour }}>{detail.instructionRef}</h2>
                  </div>
                  <div style={{ border: `1px solid ${stateColour(detail.status)}`, color: stateColour(detail.status), padding: '5px 9px', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
                    {detail.statusLabel}
                  </div>
                </div>
                {detail.issue && <div style={{ color: colours.cta, fontSize: 12, marginBottom: 10 }}>{detail.issue}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                  <InfoTile label="Pending request" value={detail.matterRequestId || 'None'} mutedColour={mutedColour} textColour={textColour} borderColour={borderColour} isDarkMode={isDarkMode} />
                  <InfoTile label="Instruction stage" value={detail.instruction?.stage || 'Unknown'} mutedColour={mutedColour} textColour={textColour} borderColour={borderColour} isDarkMode={isDarkMode} />
                  <InfoTile label="Client link" value={detail.instruction?.clientId ? 'Present' : 'Missing'} mutedColour={mutedColour} textColour={textColour} borderColour={borderColour} isDarkMode={isDarkMode} />
                  <InfoTile label="Matter link" value={detail.instruction?.matterId ? 'Present' : 'Missing'} mutedColour={mutedColour} textColour={textColour} borderColour={borderColour} isDarkMode={isDarkMode} />
                </div>
              </section>

              <ProcessTraceList
                steps={detail.processSteps}
                expandedKey={expandedStep}
                onToggle={(key) => setExpandedStep((prev) => (prev === key ? null : key))}
                isDarkMode={isDarkMode}
                textColour={textColour}
                mutedColour={mutedColour}
                borderColour={borderColour}
                cardBg={panelBg}
                renderTray={(step) => {
                  const fields = (STEP_REPAIR_FIELDS[step.key] || [])
                    .map((key) => detail.repairFields.find((field) => field.key === key))
                    .filter((field): field is RepairField => Boolean(field));
                  if (fields.length === 0) {
                    return (
                      <div style={{ color: mutedColour, fontSize: 11, fontWeight: 700 }}>No editable repair values for this step.</div>
                    );
                  }
                  return (
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                        {fields.map((field) => {
                          const result = validationForField(validation, field.key);
                          const accent = result?.severity === 'error' ? colours.cta : result?.severity === 'warning' ? colours.orange : colours.green;
                          const isDescription = field.key === 'description';
                          return (
                            <label key={field.key} style={{ display: 'grid', gap: 5, fontSize: 11, color: mutedColour, fontWeight: 800 }}>
                              {field.label}{field.required ? ' *' : ''}
                              {isDescription ? (
                                <textarea
                                  value={repair[field.key] || ''}
                                  maxLength={field.maxLength}
                                  onChange={(event) => updateRepair(field.key, event.target.value)}
                                  style={{ minHeight: 74, resize: 'vertical', border: `1px solid ${result ? accent : borderColour}`, background: cardBg, color: textColour, padding: 8, fontFamily: 'Raleway, sans-serif', fontSize: 12 }}
                                />
                              ) : (
                                <input
                                  value={repair[field.key] || ''}
                                  maxLength={field.maxLength}
                                  onChange={(event) => updateRepair(field.key, event.target.value)}
                                  style={{ height: 32, border: `1px solid ${result ? accent : borderColour}`, background: cardBg, color: textColour, padding: '0 8px', fontFamily: 'Raleway, sans-serif', fontSize: 12 }}
                                />
                              )}
                              {result && <span style={{ color: accent, fontWeight: 700 }}>{result.message}</span>}
                            </label>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => void saveRepair()}
                          disabled={!canMutate || !validation?.ok || actionBusy === 'repair'}
                          style={{ height: 30, border: `1px solid ${colours.highlight}`, background: canMutate && validation?.ok ? colours.highlight : 'transparent', color: canMutate && validation?.ok ? '#fff' : mutedColour, cursor: canMutate && validation?.ok && actionBusy !== 'repair' ? 'pointer' : 'not-allowed', padding: '0 12px', fontFamily: 'Raleway, sans-serif', fontWeight: 900, fontSize: 11 }}
                        >
                          {actionBusy === 'repair' ? 'Saving' : 'Save repair'}
                        </button>
                      </div>
                    </div>
                  );
                }}
              />

              {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
                <div style={{ border: `1px solid ${borderColour}`, background: panelBg, padding: 10, display: 'grid', gap: 4, fontSize: 11 }}>
                  {validation.errors.map((item) => <div key={item} style={{ color: colours.cta }}>{item}</div>)}
                  {validation.warnings.map((item) => <div key={item} style={{ color: colours.orange }}>{item}</div>)}
                </div>
              )}

              {!canMutate && detail.status === 'open' && (
                <div style={{ border: `1px solid ${colours.green}`, background: `${colours.green}12`, color: colours.green, padding: '8px 10px', fontSize: 12, fontWeight: 800 }}>
                  This opening request is already complete. Repair and replay controls are locked to prevent duplicate matter creation.
                </div>
              )}

              <section style={{ border: `1px solid ${borderColour}`, background: panelBg, padding: 14 }}>
                <div style={{ fontSize: 11, color: mutedColour, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Replay controls</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) auto auto', gap: 8, alignItems: 'center' }}>
                  <input
                    value={typedConfirmation}
                    onChange={(event) => setTypedConfirmation(event.target.value)}
                    placeholder={`Type ${confirmationPhrase} for live replay`}
                    style={{ height: 34, border: `1px solid ${typedConfirmation && typedConfirmation !== confirmationPhrase ? colours.cta : borderColour}`, background: cardBg, color: textColour, padding: '0 8px', fontFamily: 'Raleway, sans-serif', fontSize: 12 }}
                  />
                  <button
                    type="button"
                    onClick={() => void runReplay(true)}
                    disabled={!canDryRun}
                    style={{ height: 34, border: 'none', background: colours.highlight, color: '#fff', padding: '0 14px', cursor: canDryRun ? 'pointer' : 'not-allowed', fontFamily: 'Raleway, sans-serif', fontWeight: 900, opacity: canDryRun ? 1 : 0.6 }}
                  >
                    {actionBusy === 'dry-run' ? 'Running' : 'Dry run'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runReplay(false)}
                    disabled={!canCommit}
                    style={{ height: 34, border: `1px solid ${colours.cta}`, background: canCommit ? colours.cta : 'transparent', color: canCommit ? '#fff' : mutedColour, padding: '0 14px', cursor: canCommit ? 'pointer' : 'not-allowed', fontFamily: 'Raleway, sans-serif', fontWeight: 900 }}
                  >
                    {actionBusy === 'commit' ? 'Replaying' : 'Commit replay'}
                  </button>
                </div>
                {actionMessage && <div style={{ marginTop: 10, color: actionColour, fontSize: 12, fontWeight: 800 }}>{actionMessage.text}</div>}
                {runOutput != null && (
                  <pre style={{ margin: '12px 0 0', maxHeight: 280, overflow: 'auto', border: `1px solid ${borderColour}`, background: isDarkMode ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.04)', padding: 10, color: textColour, fontSize: 10, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {typeof runOutput === 'string' ? runOutput : JSON.stringify(runOutput, null, 2)}
                  </pre>
                )}
              </section>

              <section style={{ border: `1px solid ${borderColour}`, background: panelBg, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: mutedColour, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Submission events</div>
                    <div style={{ fontSize: 11, color: mutedColour, marginTop: 3 }}>What the matter-opening pipeline actually recorded for this request.</div>
                  </div>
                  {detail.submissions && (
                    <div style={{ fontSize: 11, color: detail.submissions.errors > 0 ? colours.cta : mutedColour, fontWeight: 900 }}>
                      {detail.submissions.total} total{detail.submissions.errors > 0 ? ` · ${detail.submissions.errors} error${detail.submissions.errors === 1 ? '' : 's'}` : ''}
                    </div>
                  )}
                </div>
                {(!detail.submissionEvents || detail.submissionEvents.length === 0) ? (
                  <div style={{ color: mutedColour, fontSize: 12 }}>
                    No pipeline events recorded. The request was likely opened outside the Hub form (one-off script, manual SQL, or external sync). Inspect the underlying rows below to confirm outcome.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {detail.submissionEvents.map((event) => {
                      const accent = event.status === 'error' ? colours.cta : event.status === 'success' ? colours.green : colours.highlight;
                      return (
                        <div key={event.id} style={{ display: 'grid', gridTemplateColumns: '120px 90px 1fr', gap: 8, border: `1px solid ${borderColour}`, borderLeft: `3px solid ${accent}`, background: cardBg, padding: 8, fontSize: 11, color: mutedColour }}>
                          <span style={{ color: textColour, fontWeight: 800 }}>{formatDateTime(event.ts)}</span>
                          <span style={{ color: accent, fontWeight: 900, textTransform: 'uppercase', fontSize: 10 }}>{event.step || event.status}</span>
                          <span style={{ color: textColour }}>
                            <span style={{ fontWeight: 800 }}>{event.title}</span>
                            {event.summary && <span style={{ color: mutedColour }}> · {event.summary}</span>}
                            {event.error && <div style={{ color: colours.cta, fontFamily: 'monospace', marginTop: 4 }}>{typeof event.error === 'string' ? event.error : JSON.stringify(event.error)}</div>}
                            {(event.initials || event.traceId) && (
                              <div style={{ color: mutedColour, marginTop: 4, fontSize: 10 }}>
                                {event.initials && <span>operator {event.initials}</span>}
                                {event.initials && event.traceId && <span> · </span>}
                                {event.traceId && <span>trace {event.traceId}</span>}
                              </div>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section style={{ border: `1px solid ${borderColour}`, background: panelBg, padding: 14 }}>
                <div style={{ fontSize: 11, color: mutedColour, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Underlying rows</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {detail.matterRows.map((row) => (
                    <div key={`${row.matterId}-${row.status}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 110px 1fr', gap: 8, border: `1px solid ${borderColour}`, background: cardBg, padding: 8, fontSize: 11, color: mutedColour }}>
                      <span style={{ color: textColour, fontWeight: 900 }}>{row.matterId}</span>
                      <span style={{ color: stateColour(row.status.toLowerCase()) }}>{row.status}</span>
                      <span>{row.displayNumber || row.clientId || 'No final identifiers'}</span>
                    </div>
                  ))}
                  {detail.matterRows.length === 0 && <div style={{ color: mutedColour, fontSize: 12 }}>No Matters rows found.</div>}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </section>
  );
};

const InfoTile: React.FC<{ label: string; value: string; mutedColour: string; textColour: string; borderColour: string; isDarkMode: boolean }> = ({ label, value, mutedColour, textColour, borderColour, isDarkMode }) => (
  <div style={{ border: `1px solid ${borderColour}`, background: isDarkMode ? colours.dark.cardBackground : '#fff', padding: 10, minHeight: 62 }}>
    <div style={{ color: mutedColour, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
    <div style={{ color: textColour, fontSize: 13, fontWeight: 900, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={value}>{value}</div>
  </div>
);

export default MatterReplayView;