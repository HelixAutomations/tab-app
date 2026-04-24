import React from 'react';
import { FiX } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';
import type { ConversionProspectChipItem } from './ConversionProspectBasket';
import ConversionStreamLedger from './ConversionStreamLedger';

// Phase D (D3): read-only stream preview modal. Opened from the hover-chevron
// on each section header in the Conversion panel. Intentionally simple — this
// is *not* a drilldown or management surface. It lists the stream that drove
// the headline number, one row per prospect, with AoW colour cue, optional
// fee-earner initials, and a timestamp. No filtering, no export, no actions.
// For anything deeper, the existing insight drilldown remains the affordance.
//
// 2026-04-20: row-rendering extracted into `ConversionStreamLedger` so the
// same ledger can be embedded inline in the Conversion panel when a section
// is expanded from the trail's overflow chevron.

export interface ConversionStreamPreviewProps {
  open: boolean;
  onClose: () => void;
  section: 'enquiries' | 'matters';
  comparisonLabel: string;
  currentLabel: string;
  items: ConversionProspectChipItem[];
  aowColor: (aow: string) => string;
  isDarkMode: boolean;
}

const ConversionStreamPreview: React.FC<ConversionStreamPreviewProps> = ({
  open,
  onClose,
  section,
  comparisonLabel,
  currentLabel,
  items,
  aowColor,
  isDarkMode,
}) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const title = section === 'enquiries' ? 'Enquiries stream' : 'Matters opened';
  const panelBg = isDarkMode ? 'rgba(6, 23, 51, 0.98)' : '#ffffff';
  const panelBorder = isDarkMode ? 'rgba(135, 243, 243, 0.2)' : 'rgba(13, 47, 96, 0.18)';
  const rowBorder = isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(13, 47, 96, 0.08)';
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 3, 25, 0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'opsDashFadeIn 0.18s ease both',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 92vw)',
          maxHeight: '80vh',
          background: panelBg,
          border: `1px solid ${panelBorder}`,
          boxShadow: '0 24px 60px rgba(0, 3, 25, 0.45)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: `1px solid ${rowBorder}`,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: text, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              {title}
            </span>
            <span style={{ fontSize: 10, fontWeight: 500, color: muted, letterSpacing: '0.02em' }}>
              {currentLabel} · {comparisonLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: `1px solid ${rowBorder}`,
              color: muted,
              padding: 6,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FiX size={14} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px' }}>
          <ConversionStreamLedger
            section={section}
            items={items}
            aowColor={aowColor}
            isDarkMode={isDarkMode}
            maxHeight={null}
          />
        </div>
      </div>
    </div>
  );
};

export default ConversionStreamPreview;
