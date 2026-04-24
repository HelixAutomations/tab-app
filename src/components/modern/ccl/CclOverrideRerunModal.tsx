import * as React from 'react';
import { createPortal } from 'react-dom';
import { colours } from '../../../app/styles/colours';
import {
  fetchCclRerunPreview,
  type CclRerunPreviewResponse,
} from '../../../tabs/matters/ccl/cclAiService';

interface Props {
  matterId: string;
  isMobile?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const PANEL_BG = '#081c30';
const ROW_BG = 'rgba(10, 28, 50, 0.55)';
const BORDER = 'rgba(75, 85, 99, 0.45)';
const BODY = '#d1d5db';
const HELP = colours.subtleGrey;
const LABEL = '#f3f4f6';

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(iso);
  }
};

const fallback = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
};

interface RowProps {
  label: string;
  current: React.ReactNode;
  projected: React.ReactNode;
  emphasise?: boolean;
}
const ComparisonRow: React.FC<RowProps> = ({ label, current, projected, emphasise }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '140px 1fr 1fr',
      alignItems: 'center',
      gap: 10,
      padding: '8px 10px',
      background: ROW_BG,
      border: `1px solid ${BORDER}`,
    }}
  >
    <div style={{ fontSize: 9.5, color: HELP, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</div>
    <div style={{ fontSize: emphasise ? 12 : 11, color: LABEL, fontWeight: emphasise ? 700 : 500, lineHeight: 1.4 }}>{current}</div>
    <div style={{ fontSize: emphasise ? 12 : 11, color: emphasise ? colours.cta : LABEL, fontWeight: emphasise ? 700 : 500, lineHeight: 1.4 }}>{projected}</div>
  </div>
);

export const CclOverrideRerunModal: React.FC<Props> = ({ matterId, isMobile, busy, onCancel, onConfirm }) => {
  const [preview, setPreview] = React.useState<CclRerunPreviewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const confirmBtnRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCclRerunPreview(matterId)
      .then((res) => {
        if (cancelled) return;
        if (!res) {
          setError('Could not load draft details.');
        } else {
          setPreview(res);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load preview.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [matterId]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel, busy]);

  React.useEffect(() => {
    if (!loading && confirmBtnRef.current) {
      confirmBtnRef.current.focus();
    }
  }, [loading]);

  const current = preview?.current;
  const projected = preview?.projected;
  const currentVersion = current?.version || 0;
  const nextVersion = projected?.version || (currentVersion ? currentVersion + 1 : null);
  const overrideCount = current?.overrideHistory?.overrideCount ?? 0;
  const lastOverrideAt = current?.overrideHistory?.lastOverrideAt;
  const lastReplacedVersion = current?.overrideHistory?.lastOverrideReplacedVersion;

  const confirmLabel = busy
    ? (currentVersion && nextVersion ? `Replacing v${currentVersion} with v${nextVersion}…` : 'Replacing current draft…')
    : (nextVersion ? `Rerun and replace with v${nextVersion}` : 'Rerun and replace draft');
  const cancelLabel = currentVersion ? `Keep v${currentVersion}` : 'Keep current draft';

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ccl-override-rerun-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 3, 25, 0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? 12 : 24,
        zIndex: 10000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: PANEL_BG,
          border: `1px solid ${BORDER}`,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
          borderRadius: 0,
          display: 'grid',
          gap: 14,
          padding: isMobile ? '16px 14px' : '18px 20px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div
              id="ccl-override-rerun-title"
              style={{ fontSize: 13, color: LABEL, fontWeight: 700, lineHeight: 1.3 }}
            >
              Replace draft with fresh service run
            </div>
            <div
              style={{
                fontSize: 9.5,
                color: colours.cta,
                background: 'rgba(214, 85, 65, 0.12)',
                border: `1px solid rgba(214, 85, 65, 0.4)`,
                padding: '2px 8px',
                borderRadius: 999,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 700,
              }}
            >
              {matterId}
            </div>
          </div>
          <div style={{ fontSize: 11, color: BODY, lineHeight: 1.5 }}>
            The current working draft will be archived in version history. A fresh run uses live source data and the latest prompt and template versions.
          </div>
        </div>

        {/* Comparison header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr 1fr',
            gap: 10,
            padding: '6px 10px 0',
          }}
        >
          <div />
          <div style={{ fontSize: 9.5, color: HELP, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Current
          </div>
          <div style={{ fontSize: 9.5, color: colours.accent, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Projected
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: 36, background: ROW_BG, border: `1px solid ${BORDER}` }} />
            ))}
          </div>
        ) : error ? (
          <div
            style={{
              fontSize: 11,
              color: colours.cta,
              padding: '10px 12px',
              border: `1px solid rgba(214, 85, 65, 0.4)`,
              background: 'rgba(214, 85, 65, 0.08)',
            }}
          >
            {error} The rerun can still proceed.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            <ComparisonRow
              label="Version"
              current={currentVersion ? `v${currentVersion}` : '—'}
              projected={nextVersion ? `v${nextVersion}` : 'next'}
              emphasise
            />
            <ComparisonRow
              label="Model"
              current={fallback(current?.model)}
              projected={fallback(projected?.model)}
            />
            <ComparisonRow
              label="Prompt version"
              current={fallback(current?.promptVersion)}
              projected={fallback(projected?.promptVersion)}
            />
            <ComparisonRow
              label="Template version"
              current={fallback(current?.templateVersion)}
              projected={fallback(projected?.templateVersion)}
            />
            <ComparisonRow
              label="AI confidence"
              current={fallback(current?.confidence)}
              projected={<span style={{ color: HELP }}>determined after run</span>}
            />
            <ComparisonRow
              label="Generated fields"
              current={fallback(current?.generatedFieldCount)}
              projected={<span style={{ color: HELP }}>refreshed</span>}
            />
            <ComparisonRow
              label="Pressure test"
              current={
                current?.pressureTest
                  ? `${current.pressureTest.flaggedCount ?? 0} flagged · ${formatDate(current.pressureTest.completedAt)}`
                  : '—'
              }
              projected={<span style={{ color: HELP }}>{projected?.note || 'Reruns automatically.'}</span>}
            />
            <ComparisonRow
              label="Last run"
              current={`${formatDate(current?.updatedAt)}${current?.updatedBy ? ` · ${current.updatedBy}` : ''}`}
              projected="now"
            />
          </div>
        )}

        {/* Override history footnote */}
        {!loading && !error && (overrideCount > 0 || lastOverrideAt) && (
          <div style={{ fontSize: 10.5, color: HELP, lineHeight: 1.5, padding: '0 2px' }}>
            This matter has been re-run{' '}
            <strong style={{ color: LABEL }}>{overrideCount}</strong>{' '}
            time{overrideCount === 1 ? '' : 's'}.
            {lastOverrideAt && (
              <>
                {' '}Last replacement
                {lastReplacedVersion ? <> archived <strong style={{ color: LABEL }}>v{lastReplacedVersion}</strong></> : ''}{' '}
                on {formatDate(lastOverrideAt)}.
              </>
            )}
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: LABEL,
              background: 'transparent',
              padding: isMobile ? '11px 14px' : '9px 14px',
              cursor: busy ? 'not-allowed' : 'pointer',
              border: `1px solid rgba(255,255,255,0.16)`,
              borderRadius: 0,
              minHeight: isMobile ? 44 : 'auto',
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
              background: colours.highlight,
              padding: isMobile ? '11px 14px' : '9px 14px',
              cursor: busy ? 'wait' : 'pointer',
              border: 'none',
              borderRadius: 0,
              minHeight: isMobile ? 44 : 'auto',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
};

export default CclOverrideRerunModal;
