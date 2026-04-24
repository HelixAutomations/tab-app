import React from 'react';
import { colours } from '../../app/styles/colours';
import type { ConversionProspectChipItem } from './ConversionProspectBasket';

// Shared ledger row renderer for the Conversion panel streams. Previously
// lived inline in `ConversionStreamPreview.tsx` (modal) — extracted so the
// same itemised ledger can also render inline when a section is expanded
// from the trail's overflow chevron. Keeps the refined row design alive
// in a reachable path regardless of which surface (modal or inline) is used.

export interface ConversionStreamLedgerProps {
  section: 'enquiries' | 'matters';
  items: ConversionProspectChipItem[];
  aowColor: (aow: string) => string;
  isDarkMode: boolean;
  /** Overrides the default empty message for the section. */
  emptyMessage?: string;
  /** Constrain height and scroll internally. Default 320px. Set to 0/`undefined` to let the list grow naturally. */
  maxHeight?: number | null;
}

function formatOccurred(raw: string | undefined): string {
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const ConversionStreamLedger: React.FC<ConversionStreamLedgerProps> = ({
  section,
  items,
  aowColor,
  isDarkMode,
  emptyMessage,
  maxHeight = 320,
}) => {
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const rowBorder = isDarkMode ? 'rgba(255,255,255,0.07)' : 'rgba(13, 47, 96, 0.08)';
  const fallbackEmpty = section === 'enquiries' ? 'No enquiries in this window.' : 'No matters opened in this window.';

  const scrollProps: React.CSSProperties = typeof maxHeight === 'number' && maxHeight > 0
    ? { maxHeight, overflowY: 'auto' }
    : {};

  if (!items || items.length === 0) {
    return (
      <div
        style={{
          padding: '16px',
          textAlign: 'center',
          fontSize: 12,
          color: muted,
          fontStyle: 'italic',
        }}
      >
        {emptyMessage || fallbackEmpty}
      </div>
    );
  }

  return (
    <div style={scrollProps}>
      {items.map((item) => {
        const accent = aowColor(item.aow);
        const displayLabel = item.fullName || item.displayName;
        const when = formatOccurred(item.occurredAt);
        return (
          <div
            key={item.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '4px 1fr auto',
              alignItems: 'center',
              gap: 10,
              padding: '8px 4px',
              borderBottom: `1px solid ${rowBorder}`,
            }}
          >
            <span style={{ width: 4, height: 22, background: accent, display: 'inline-block' }} aria-hidden="true" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: text, letterSpacing: '0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayLabel}
              </span>
              <span style={{ fontSize: 10, color: bodyText, opacity: 0.8, letterSpacing: '0.02em' }}>
                {item.aow}
                {item.feeEarnerInitials ? ` · ${item.feeEarnerInitials}` : ''}
              </span>
            </div>
            {when ? (
              <span style={{ fontSize: 10, fontWeight: 600, color: muted, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                {when}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default ConversionStreamLedger;
