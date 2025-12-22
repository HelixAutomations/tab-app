import React from 'react';
import { ServiceHealthState } from './functionality/useServiceHealthMonitor';
import { colours } from './styles/colours';

interface MaintenanceNoticeProps {
  state: ServiceHealthState;
  isDarkMode: boolean;
  onDismiss: () => void;
}

const MaintenanceNotice: React.FC<MaintenanceNoticeProps> = ({ state, isDarkMode, onDismiss }) => {
  if (!state.isUnavailable) {
    return null;
  }

  const background = isDarkMode ? 'rgba(15, 23, 42, 0.95)' : '#fff8e1';
  const borderColor = isDarkMode ? 'rgba(248, 250, 252, 0.2)' : '#ffcc02';
  const textColor = isDarkMode ? '#E0F2FE' : colours.darkBlue;
  const accent = isDarkMode ? colours.highlight : colours.darkBlue;
  const subtitle = state.lastStatus ? `Requests are returning ${state.lastStatus}.` : state.lastError || 'Requests are failing.';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 88,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 480,
        width: 'calc(100% - 32px)',
        background,
        color: textColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 12,
        padding: '16px 20px',
        boxShadow: isDarkMode ? '0 12px 28px rgba(2,6,23,0.55)' : '0 10px 24px rgba(15, 23, 42, 0.18)',
        zIndex: 2000,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Service temporarily unavailable</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
        {subtitle} Please leave this window open; we&apos;ll keep retrying and reconnect automatically.
        {state.lastChecked && (
          <span style={{ display: 'block', marginTop: 4, opacity: 0.8 }}>
            Last check: {state.lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: accent }}>
          Consecutive failures: {state.consecutiveFailures}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            border: 'none',
            background: isDarkMode ? 'rgba(96, 165, 250, 0.25)' : '#fde68a',
            color: textColor,
            fontWeight: 600,
            padding: '6px 14px',
            borderRadius: 999,
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default MaintenanceNotice;
