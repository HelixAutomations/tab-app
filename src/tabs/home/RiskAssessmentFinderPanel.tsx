import React, { useCallback, useMemo, useState } from 'react';
import { trackClientEvent } from '../../utils/telemetry';
import './RiskAssessmentFinderPanel.css';

type ToastType = 'success' | 'error' | 'info' | 'warning';
type LookupStatus = 'risk-found' | 'matter-found-no-risk' | 'not-found';

interface RiskAssessmentLookupAssessment {
  matterId: string | null;
  storedMatterId?: string | null;
  instructionRef: string | null;
  clientId?: string | null;
  checkId?: string | null;
  riskAssessor: string | null;
  complianceDate: string | null;
  complianceExpiry: string | null;
  riskAssessmentResult: string | null;
  riskScore: number | null;
  transactionRiskLevel: string | null;
}

interface RiskAssessmentLookupIdVerification {
  instructionRef: string | null;
  matterId: string | null;
  clientId: string | null;
  prospectId: number | string | null;
  eidStatus: string | null;
  eidOverallResult: string | null;
  pepAndSanctionsCheckResult: string | null;
  addressVerificationResult: string | null;
  eidCheckedDate: string | null;
}

interface RiskAssessmentLookupResult {
  input: string;
  status: LookupStatus;
  message: string;
  resolved: {
    matterResolved: boolean;
    riskFound: boolean;
    displayNumbers: string[];
    instructionRefs: string[];
    matterIds: string[];
    prospectIds?: string[];
  };
  assessments: RiskAssessmentLookupAssessment[];
  idVerification: RiskAssessmentLookupIdVerification | null;
  idVerifications: RiskAssessmentLookupIdVerification[];
  previewText: string;
  fileName: string | null;
  futureChecks: {
    netDocuments: 'not_checked';
    clioRiskField: 'not_checked';
  };
}

interface RiskAssessmentFinderPanelProps {
  onClose: () => void;
  onShowToast?: (message: string, type: ToastType, details?: string) => void;
}

const statusLabels: Record<LookupStatus, string> = {
  'risk-found': 'Risk found',
  'matter-found-no-risk': 'Matter only',
  'not-found': 'Not found',
};

function joinValues(values: string[] | undefined): string {
  return Array.isArray(values) && values.length > 0 ? values.join(', ') : 'Not resolved';
}

function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

const RiskAssessmentFinderPanel: React.FC<RiskAssessmentFinderPanelProps> = ({ onClose, onShowToast }) => {
  const [matterRef, setMatterRef] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RiskAssessmentLookupResult | null>(null);

  const primaryAssessment = result?.assessments?.[0] || null;
  const primaryIdVerification = result?.idVerification || null;
  const canExport = Boolean(result?.previewText && result?.fileName);

  const summaryFields = useMemo(() => {
    if (!result) return [];
    return [
      { label: 'Display ref', value: joinValues(result.resolved.displayNumbers) },
      { label: 'Instruction ref', value: joinValues(result.resolved.instructionRefs) },
      { label: 'Clio matter id', value: joinValues(result.resolved.matterIds) },
      { label: 'Risk result', value: primaryAssessment?.riskAssessmentResult || 'Not recorded' },
      { label: 'Risk score', value: primaryAssessment?.riskScore != null ? String(primaryAssessment.riskScore) : 'Not recorded' },
      { label: 'Compliance expiry', value: primaryAssessment?.complianceExpiry || 'Not recorded' },
      { label: 'ID status', value: primaryIdVerification?.eidStatus || 'Not recorded' },
      { label: 'ID result', value: primaryIdVerification?.eidOverallResult || 'Not recorded' },
    ];
  }, [primaryAssessment, primaryIdVerification, result]);

  const lookup = useCallback(async () => {
    const ref = matterRef.trim();
    if (ref.length < 3) {
      setError('Enter at least 3 characters of a matter ref.');
      setResult(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch('/api/risk-assessments/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matterRef: ref }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.message || body?.error || `Lookup failed with HTTP ${response.status}`);
      }
      setResult(body as RiskAssessmentLookupResult);
      if (body.status === 'risk-found') {
        onShowToast?.('Risk assessment found', 'success', body.fileName || ref);
      } else if (body.status === 'matter-found-no-risk') {
        onShowToast?.('Matter found, no risk assessment', 'warning', joinValues(body.resolved?.instructionRefs));
      } else {
        onShowToast?.('No risk assessment found', 'warning', ref);
      }
      trackClientEvent('risk-assessment-finder', 'Lookup.Completed', {
        status: body.status,
        hasRisk: body.status === 'risk-found',
      });
    } catch (err) {
      const message = err instanceof Error && err.name === 'AbortError'
        ? 'Lookup timed out. Try again in a moment.'
        : err instanceof Error ? err.message : 'Risk assessment lookup failed.';
      setError(message);
      onShowToast?.('Risk assessment lookup failed', 'error', message);
      trackClientEvent('risk-assessment-finder', 'Lookup.Failed', {}, { error: message });
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }, [matterRef, onShowToast]);

  const copyPreview = useCallback(async () => {
    if (!result?.previewText) return;
    try {
      await copyText(result.previewText);
      onShowToast?.('Risk note copied', 'success');
      trackClientEvent('risk-assessment-finder', 'Note.Copied', { status: result.status });
    } catch {
      onShowToast?.('Copy failed', 'warning', 'Use the preview text manually.');
    }
  }, [onShowToast, result]);

  const downloadPreview = useCallback(() => {
    if (!result?.previewText || !result.fileName) return;
    downloadText(result.fileName, result.previewText);
    onShowToast?.('Risk note downloaded', 'success', result.fileName);
    trackClientEvent('risk-assessment-finder', 'Note.Downloaded', { status: result.status });
  }, [onShowToast, result]);

  const draftEmail = useCallback(() => {
    if (!result?.previewText) return;
    const subjectRef = result.resolved.displayNumbers[0] || result.resolved.instructionRefs[0] || result.input;
    const subject = encodeURIComponent(`Risk assessment note ${subjectRef}`);
    const body = encodeURIComponent(result.previewText);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    trackClientEvent('risk-assessment-finder', 'Note.EmailDrafted', { status: result.status });
  }, [result]);

  return (
    <form
      className="risk-assessment-finder"
      data-helix-region="home/risk-assessment-finder"
      onSubmit={(event) => {
        event.preventDefault();
        void lookup();
      }}
    >
      <div className="risk-assessment-finder__card">
        <div className="risk-assessment-finder__header">
          <span>Workbench risk finder</span>
        </div>

        <div className="risk-assessment-finder__content">
          <section className="risk-assessment-finder__section">
            <div className="risk-assessment-finder__section-header">Lookup</div>
            <div className="risk-assessment-finder__lookup-row">
              <label className="risk-assessment-finder__field">
                <span className="helix-label">Matter ref</span>
                <input
                  className="helix-input risk-assessment-finder__input"
                  value={matterRef}
                  onChange={(event) => setMatterRef(event.target.value)}
                  placeholder="HELIX01-01 OR HELIX01-04"
                  autoComplete="off"
                />
              </label>
              <button type="submit" className="helix-btn-primary risk-assessment-finder__lookup-button" disabled={isLoading}>
                {isLoading ? 'Resolving...' : 'Resolve'}
              </button>
            </div>

            {error && <p className="risk-assessment-finder__error">{error}</p>}

            {isLoading && (
              <div className="risk-assessment-finder__lookup-status" aria-live="polite" aria-busy="true">
                <span>Checking workbench risk</span>
                <p>Resolving {matterRef.trim()} to an instruction, then checking risk assessment and ID status.</p>
              </div>
            )}
          </section>

          {result && !isLoading && (
            <section className={`risk-assessment-finder__section risk-assessment-finder__result risk-assessment-finder__result--${result.status}`}>
              <div className="risk-assessment-finder__result-header">
                <div>
                  <span className="risk-assessment-finder__status">{statusLabels[result.status]}</span>
                  <h3>{result.message}</h3>
                </div>
                <span className="risk-assessment-finder__ref">{result.input}</span>
              </div>

              <div className="risk-assessment-finder__summary-grid">
                {summaryFields.map((field) => (
                  <div className="risk-assessment-finder__summary-field" key={field.label}>
                    <span>{field.label}</span>
                    <strong>{field.value}</strong>
                  </div>
                ))}
              </div>

              <div className="risk-assessment-finder__future-checks" aria-label="Future save checks">
                <span>NetDocuments: not checked yet</span>
                <span>Clio risk field: not checked yet</span>
              </div>

              {result.previewText ? (
                <label className="risk-assessment-finder__preview-field">
                  <span className="helix-label">Preview</span>
                  <textarea className="risk-assessment-finder__preview" value={result.previewText} readOnly />
                </label>
              ) : (
                <p className="risk-assessment-finder__empty-note">
                  Nothing exportable yet. Use the resolved instruction ref to complete or chase the risk assessment first.
                </p>
              )}
            </section>
          )}

          {result && !isLoading && (
            <div className="risk-assessment-finder__actions">
              <button type="button" className="helix-btn-secondary" onClick={onClose}>Close</button>
              <button type="button" className="helix-btn-secondary" onClick={() => { setMatterRef(''); setResult(null); setError(null); }}>Clear</button>
              {canExport && <button type="button" className="helix-btn-secondary" onClick={() => void copyPreview()}>Copy note</button>}
              {canExport && <button type="button" className="helix-btn-secondary" onClick={draftEmail}>Draft email</button>}
              {canExport && <button type="button" className="helix-btn-primary" onClick={downloadPreview}>Download .txt</button>}
            </div>
          )}
        </div>
      </div>
    </form>
  );
};

export default RiskAssessmentFinderPanel;