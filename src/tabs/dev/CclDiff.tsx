// invisible change — CCL dry-run diff (W2D)
import React, { useMemo, useState } from 'react';
import { colours } from '../../app/styles/colours';
import { buildCclApiUrl } from '../matters/ccl/cclAiService';

interface DryRunInput {
  matterId: string;
  practiceArea: string;
  notes: string;
}

interface DryRunResult {
  ok: boolean;
  trackingId?: string;
  matterId?: string;
  aiFields?: Record<string, string>;
  docxBase64?: string;
  docxName?: string;
  unresolvedPlaceholders?: string[];
  unresolvedCount?: number;
  confidence?: string;
  model?: string;
  promptVersion?: string;
  templateVersion?: string;
  durationMs?: number;
  contextSummary?: string;
  dataSources?: string[];
  fallbackReason?: string | null;
  source?: string;
  error?: string;
  message?: string;
}

interface ColumnState {
  input: DryRunInput;
  result: DryRunResult | null;
  loading: boolean;
  error: string | null;
}

const EMPTY_INPUT: DryRunInput = { matterId: '', practiceArea: '', notes: '' };

const EMPTY_COLUMN: ColumnState = {
  input: EMPTY_INPUT,
  result: null,
  loading: false,
  error: null,
};

interface CclDiffProps {
  isDarkMode?: boolean;
  onClose?: () => void;
}

function downloadBase64Docx(base64: string, fileName: string): void {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function runDryRun(input: DryRunInput): Promise<DryRunResult> {
  const res = await fetch(buildCclApiUrl('/api/ccl-dry-run'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      matterId: input.matterId.trim(),
      practiceArea: input.practiceArea.trim() || undefined,
      enquiryNotes: input.notes.trim() || undefined,
    }),
    credentials: 'include',
  });
  const data = (await res.json().catch(() => ({}))) as DryRunResult;
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Dry-run failed: ${res.status}`);
  }
  return data;
}

const CclDiff: React.FC<CclDiffProps> = ({ isDarkMode = true, onClose }) => {
  const [colA, setColA] = useState<ColumnState>(EMPTY_COLUMN);
  const [colB, setColB] = useState<ColumnState>(EMPTY_COLUMN);

  const surface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const sectionBg = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;
  const labelText = isDarkMode ? colours.dark.text : colours.light.text;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const helpText = isDarkMode ? colours.subtleGrey : colours.greyText;
  const accent = isDarkMode ? colours.accent : colours.highlight;
  const border = isDarkMode ? colours.dark.borderColor : colours.light.borderColor;

  const handleRun = async (which: 'A' | 'B') => {
    const setter = which === 'A' ? setColA : setColB;
    const current = which === 'A' ? colA : colB;
    if (!current.input.matterId.trim()) {
      setter({ ...current, error: 'matterId is required' });
      return;
    }
    setter({ ...current, loading: true, error: null });
    try {
      const result = await runDryRun(current.input);
      setter({ ...current, loading: false, result, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Dry-run failed';
      setter({ ...current, loading: false, error: message });
    }
  };

  const allFieldKeys = useMemo(() => {
    const set = new Set<string>();
    Object.keys(colA.result?.aiFields || {}).forEach((k) => set.add(k));
    Object.keys(colB.result?.aiFields || {}).forEach((k) => set.add(k));
    return Array.from(set).sort();
  }, [colA.result, colB.result]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: isDarkMode ? colours.websiteBlue : colours.grey,
        zIndex: 10000,
        overflow: 'auto',
        padding: 20,
        fontFamily: 'Raleway, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 14,
          borderBottom: `1px solid ${border}`,
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ color: accent, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            CCL Dev Diff
          </div>
          <div style={{ color: labelText, fontSize: 18, fontWeight: 600 }}>
            Two-column dry-run comparison harness
          </div>
          <div style={{ color: helpText, fontSize: 12, marginTop: 4 }}>
            Read-only. No CclContent / CclSent / autopilot writes. LZ + AC only.
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              color: labelText,
              border: `1px solid ${border}`,
              borderRadius: 0,
              cursor: 'pointer',
              fontFamily: 'Raleway, sans-serif',
              fontSize: 13,
            }}
          >
            Close
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {(['A', 'B'] as const).map((which) => {
          const state = which === 'A' ? colA : colB;
          const setter = which === 'A' ? setColA : setColB;
          const updateField = (key: keyof DryRunInput, value: string) =>
            setter({ ...state, input: { ...state.input, [key]: value } });

          return (
            <section
              key={which}
              style={{
                background: sectionBg,
                border: `1px solid ${border}`,
                borderRadius: 0,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ color: accent, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                Column {which}
              </div>
              <Field label="Matter ID" value={state.input.matterId} onChange={(v) => updateField('matterId', v)} labelText={labelText} bodyText={bodyText} border={border} surface={surface} />
              <Field label="Practice area (optional override)" value={state.input.practiceArea} onChange={(v) => updateField('practiceArea', v)} labelText={labelText} bodyText={bodyText} border={border} surface={surface} placeholder="commercial / property / construction / employment" />
              <TextareaField label="Enquiry notes (optional)" value={state.input.notes} onChange={(v) => updateField('notes', v)} labelText={labelText} bodyText={bodyText} border={border} surface={surface} />

              <button
                type="button"
                onClick={() => handleRun(which)}
                disabled={state.loading}
                style={{
                  padding: '10px 16px',
                  background: state.loading ? colours.subtleGrey : colours.highlight,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 0,
                  cursor: state.loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'Raleway, sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {state.loading ? 'Running…' : 'Run dry-run'}
              </button>

              {state.error && (
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(214, 85, 65, 0.15)',
                    color: colours.cta,
                    fontSize: 12,
                    border: `1px solid ${colours.cta}`,
                  }}
                >
                  {state.error}
                </div>
              )}

              {state.result && (
                <ResultBadges result={state.result} labelText={labelText} helpText={helpText} accent={accent} border={border} />
              )}

              {state.result?.docxBase64 && (
                <button
                  type="button"
                  onClick={() => downloadBase64Docx(state.result!.docxBase64!, state.result!.docxName || `ccl-dry-run-${which}.docx`)}
                  style={{
                    padding: '8px 14px',
                    background: 'transparent',
                    color: accent,
                    border: `1px solid ${accent}`,
                    borderRadius: 0,
                    cursor: 'pointer',
                    fontFamily: 'Raleway, sans-serif',
                    fontSize: 12,
                    alignSelf: 'flex-start',
                  }}
                >
                  Download .docx
                </button>
              )}
            </section>
          );
        })}
      </div>

      {allFieldKeys.length > 0 && (
        <section
          style={{
            marginTop: 22,
            background: sectionBg,
            border: `1px solid ${border}`,
            borderRadius: 0,
            padding: 16,
          }}
        >
          <div style={{ color: accent, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Field-by-field diff
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr', gap: 1, background: border }}>
            <DiffHeader text="Field" labelText={labelText} surface={surface} />
            <DiffHeader text="Column A" labelText={labelText} surface={surface} />
            <DiffHeader text="Column B" labelText={labelText} surface={surface} />
            {allFieldKeys.map((key) => {
              const a = colA.result?.aiFields?.[key] || '';
              const b = colB.result?.aiFields?.[key] || '';
              const same = a === b;
              const aBg = same ? surface : 'rgba(214, 85, 65, 0.10)';
              const bBg = same ? surface : 'rgba(54, 144, 206, 0.10)';
              return (
                <React.Fragment key={key}>
                  <div style={{ background: surface, padding: 10, color: labelText, fontSize: 12, fontWeight: 500 }}>{key}</div>
                  <div style={{ background: aBg, padding: 10, color: bodyText, fontSize: 12, whiteSpace: 'pre-wrap' }}>{a || <span style={{ color: helpText, fontStyle: 'italic' }}>(empty)</span>}</div>
                  <div style={{ background: bBg, padding: 10, color: bodyText, fontSize: 12, whiteSpace: 'pre-wrap' }}>{b || <span style={{ color: helpText, fontStyle: 'italic' }}>(empty)</span>}</div>
                </React.Fragment>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  labelText: string;
  bodyText: string;
  border: string;
  surface: string;
  placeholder?: string;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, labelText, bodyText, border, surface, placeholder }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span style={{ color: labelText, fontSize: 12, fontWeight: 500 }}>{label}</span>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        padding: '8px 10px',
        background: surface,
        color: bodyText,
        border: `1px solid ${border}`,
        borderRadius: 0,
        fontFamily: 'Raleway, sans-serif',
        fontSize: 13,
      }}
    />
  </label>
);

const TextareaField: React.FC<FieldProps> = ({ label, value, onChange, labelText, bodyText, border, surface }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span style={{ color: labelText, fontSize: 12, fontWeight: 500 }}>{label}</span>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      style={{
        padding: '8px 10px',
        background: surface,
        color: bodyText,
        border: `1px solid ${border}`,
        borderRadius: 0,
        fontFamily: 'Raleway, sans-serif',
        fontSize: 13,
        resize: 'vertical',
      }}
    />
  </label>
);

interface ResultBadgesProps {
  result: DryRunResult;
  labelText: string;
  helpText: string;
  accent: string;
  border: string;
}

const ResultBadges: React.FC<ResultBadgesProps> = ({ result, labelText, helpText, accent, border }) => {
  const badge = (label: string, value?: string | number | null) => (
    <div style={{ padding: '6px 10px', background: 'transparent', border: `1px solid ${border}`, borderRadius: 0, fontSize: 11, color: labelText }}>
      <span style={{ color: helpText, marginRight: 6 }}>{label}</span>
      <span>{value ?? '—'}</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {badge('model', result.model)}
      {badge('prompt', result.promptVersion)}
      {badge('template', result.templateVersion)}
      {badge('confidence', result.confidence)}
      {badge('duration', result.durationMs != null ? `${result.durationMs}ms` : null)}
      {badge('fields', result.aiFields ? Object.keys(result.aiFields).length : 0)}
      {result.unresolvedCount != null && result.unresolvedCount > 0 && (
        <div style={{ padding: '6px 10px', background: 'rgba(255, 140, 0, 0.15)', color: colours.orange, border: `1px solid ${colours.orange}`, borderRadius: 0, fontSize: 11 }}>
          {result.unresolvedCount} unresolved placeholders
        </div>
      )}
      {result.fallbackReason && (
        <div style={{ padding: '6px 10px', background: 'rgba(214, 85, 65, 0.10)', color: colours.cta, border: `1px solid ${colours.cta}`, borderRadius: 0, fontSize: 11 }}>
          fallback: {result.fallbackReason}
        </div>
      )}
    </div>
  );
};

interface DiffHeaderProps {
  text: string;
  labelText: string;
  surface: string;
}

const DiffHeader: React.FC<DiffHeaderProps> = ({ text, labelText, surface }) => (
  <div style={{ background: surface, padding: '10px 12px', color: labelText, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
    {text}
  </div>
);

export default CclDiff;
