import React, { useEffect, useState } from 'react';
import { ServiceHealthState } from './functionality/useServiceHealthMonitor';
import { colours } from './styles/colours';

interface MaintenanceNoticeProps {
  state: ServiceHealthState;
  isDarkMode: boolean;
  onDismiss: () => void;
}

const MaintenanceNotice: React.FC<MaintenanceNoticeProps> = ({ state, isDarkMode, onDismiss }) => {
  const [visible, setVisible] = useState(false);
  const [pulseOn, setPulseOn] = useState(false);

  useEffect(() => {
    if (state.isUnavailable) {
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    } else {
      setVisible(false);
    }
  }, [state.isUnavailable]);

  useEffect(() => {
    if (!state.isUnavailable) {
      setPulseOn(false);
      return;
    }
    const interval = window.setInterval(() => {
      setPulseOn((value) => !value);
    }, 900);
    return () => window.clearInterval(interval);
  }, [state.isUnavailable]);

  if (!state.isUnavailable) return null;

  const bg = isDarkMode ? colours.dark.sectionBackground : colours.grey;
  const border = isDarkMode ? colours.dark.border : colours.highlightNeutral;
  const bodyColour = isDarkMode ? '#d1d5db' : '#374151';
  const helpColour = isDarkMode ? colours.subtleGrey : colours.greyText;
  const dotColour = isDarkMode ? colours.orange : colours.orange;
  const detailText = state.consecutiveFailures > 1
    ? 'Last request is retrying.'
    : 'Retrying your last request.';

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 180);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={handleDismiss}
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        maxWidth: 248,
        background: bg,
        color: bodyColour,
        border: `1px solid ${border}`,
        borderRadius: 0,
        padding: '8px 12px',
        boxShadow: isDarkMode
          ? '0 2px 6px rgba(0, 0, 0, 0.28)'
          : '0 2px 5px rgba(0, 0, 0, 0.05)',
        zIndex: 2000,
        fontFamily: 'Raleway, sans-serif',
        cursor: 'pointer',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(4px)',
        transition: 'opacity 180ms ease-out, transform 180ms ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dotColour,
            flexShrink: 0,
            opacity: pulseOn ? 1 : 0.45,
            transform: pulseOn ? 'scale(1)' : 'scale(0.85)',
            transition: 'opacity 240ms ease, transform 240ms ease',
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.darkBlue }}>
          Reconnecting…
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
          aria-label="Dismiss"
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            lineHeight: 1,
            color: helpColour,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div style={{ fontSize: 11, color: helpColour, marginTop: 3, paddingLeft: 14, lineHeight: 1.35 }}>
        {detailText}
      </div>
    </div>
  );
};

export default MaintenanceNotice;
