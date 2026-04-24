/**
 * DemoModeStripe — persistent banner shown at the top of matter-opening wizard
 * surfaces when running against the demo prospect (`DEMO-3311402`).
 *
 * Purpose: the user needs to know, at a glance, that clicking "Open Matter"
 * will NOT create a real Clio matter. CCL endpoints DO fire against demo data.
 *
 * Brand tokens only — accent (dark) / highlight (light), 12% bg fill.
 */
import React from 'react';
import { FaFlask } from 'react-icons/fa';
import { colours } from '../../../app/styles/colours';

interface DemoModeStripeProps {
  isDarkMode: boolean;
  /** Optional override; defaults to DEMO-3311402. */
  demoMatterRef?: string;
  /** Optional compact mode (smaller padding, single line). */
  compact?: boolean;
}

const DemoModeStripe: React.FC<DemoModeStripeProps> = ({
  isDarkMode,
  demoMatterRef = 'DEMO-3311402',
  compact = false,
}) => {
  const accentColour = isDarkMode ? colours.accent : colours.highlight;
  const bgColour = isDarkMode ? 'rgba(135, 243, 243, 0.10)' : 'rgba(54, 144, 206, 0.08)';
  const borderColour = isDarkMode ? 'rgba(135, 243, 243, 0.22)' : 'rgba(54, 144, 206, 0.20)';
  const labelColour = isDarkMode ? colours.accent : colours.highlight;
  const bodyColour = isDarkMode ? '#d1d5db' : '#374151';

  return (
    <div
      role="note"
      aria-label="Demo mode active"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: compact ? '6px 10px' : '8px 12px',
        background: bgColour,
        border: `1px solid ${borderColour}`,
        borderLeft: `3px solid ${accentColour}`,
        borderRadius: 0,
      }}
    >
      <FaFlask size={13} style={{ color: accentColour, flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.55px',
            color: labelColour,
            lineHeight: 1.2,
          }}
        >
          Demo Mode — Simulated Open
        </div>
        {!compact && (
          <div
            style={{
              fontSize: 10,
              lineHeight: 1.4,
              color: bodyColour,
            }}
          >
            No real Clio matter will be created. Target ref{' '}
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: labelColour }}>
              {demoMatterRef}
            </span>
            . CCL endpoints <strong>do</strong> fire against demo data. Nothing uploads to NetDocuments until you approve.
          </div>
        )}
      </div>
    </div>
  );
};

export default DemoModeStripe;
