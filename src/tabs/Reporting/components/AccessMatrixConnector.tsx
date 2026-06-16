import React from 'react';
import type { CSSProperties } from 'react';
import { colours, withAlpha } from '../../../app/styles/colours';
import { reportingPanelBorder } from '../styles/reportingFoundation';
import { EXTRA_TOP_NAV_USERS, REPORTS_USERS } from '../../../app/admin';

type AccessMatrixConnectorProps = {
  isDarkMode: boolean;
  surface: 'reports' | 'data-hub' | 'system' | 'marketing';
  compact?: boolean;
};

const AUTO_DISMISS_MS = 10_000;

const AccessMatrixConnector: React.FC<AccessMatrixConnectorProps> = ({
  isDarkMode,
  surface,
}) => {
  const [dismissed, setDismissed] = React.useState(false);
  const [remainingMs, setRemainingMs] = React.useState(AUTO_DISMISS_MS);

  React.useEffect(() => {
    setDismissed(false);
    setRemainingMs(AUTO_DISMISS_MS);

    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      setRemainingMs(Math.max(0, AUTO_DISMISS_MS - (Date.now() - startedAt)));
    }, 250);
    const timeout = window.setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(timeout);
    };
  }, [surface]);

  if (dismissed) return null;

  const accent = colours.helixBlue;
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.greyText : colours.subtleGrey;
  const accessInitials = (surface === 'reports' ? REPORTS_USERS : EXTRA_TOP_NAV_USERS).join(', ');
  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const progress = Math.max(0, Math.min(100, (remainingMs / AUTO_DISMISS_MS) * 100));
  const shell: CSSProperties = {
    position: 'fixed',
    top: 72,
    right: 22,
    zIndex: 2300,
    width: 'min(246px, calc(100vw - 32px))',
    display: 'grid',
    gap: 6,
    padding: '8px 10px 7px',
    border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
    borderLeft: `2px solid ${accent}`,
    background: isDarkMode ? 'rgba(10, 28, 50, 0.64)' : 'rgba(255, 255, 255, 0.68)',
    boxShadow: isDarkMode ? '0 12px 28px rgba(0, 3, 25, 0.26)' : '0 12px 30px rgba(6, 23, 51, 0.10)',
    backdropFilter: 'blur(14px) saturate(1.15)',
    color: text,
  };

  return (
    <section role="status" aria-live="polite" data-helix-region={`${surface}/access-notice`} style={shell}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: accent, textTransform: 'uppercase', letterSpacing: 0 }}>
            Custom access
          </span>
          <span
            style={{
              fontSize: 10,
              lineHeight: 1.35,
              color: withAlpha(muted, 0.88),
              fontWeight: 500,
              letterSpacing: '0.02em',
              opacity: 0.92,
            }}
          >
            Access: {accessInitials}
          </span>
        </div>
        <button
          type="button"
          aria-label="Dismiss access notice"
          onClick={() => setDismissed(true)}
          style={{
            border: `1px solid ${withAlpha(muted, 0.22)}`,
            background: withAlpha(muted, isDarkMode ? 0.1 : 0.05),
            color: muted,
            width: 22,
            height: 22,
            padding: 0,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 900,
            lineHeight: 1,
          }}
        >
          x
        </button>
      </div>
      <div style={{ display: 'grid', gap: 4 }} aria-hidden="true">
        <div style={{ height: 2, background: withAlpha(accent, isDarkMode ? 0.16 : 0.12), overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: accent, transition: 'width 220ms linear' }} />
        </div>
        <span style={{ justifySelf: 'end', fontSize: 9, color: muted, fontWeight: 800, textTransform: 'uppercase' }}>
          Hides in {remainingSeconds}s
        </span>
      </div>
    </section>
  );
};

export default AccessMatrixConnector;