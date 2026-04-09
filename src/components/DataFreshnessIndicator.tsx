import React, { useEffect, useMemo, useState } from 'react';
import { colours, withAlpha } from '../app/styles/colours';
import { useTheme } from '../app/functionality/ThemeContext';
import './DataFreshnessIndicator.css';

interface DataFreshnessIndicatorProps {
  label?: string;
  isRefreshing?: boolean;
  isSnapshot?: boolean;
  lastLiveSyncAt?: number | null;
  errorDetail?: string | null;
  liveLabel?: string;
  syncingLabel?: string;
  snapshotLabel?: string;
  idleLabel?: string;
  errorLabel?: string;
  compact?: boolean;
}

function formatAge(nowMs: number, lastLiveSyncAt?: number | null): string | null {
  if (!lastLiveSyncAt) return null;
  const ageMs = Math.max(0, nowMs - lastLiveSyncAt);
  const ageSeconds = Math.round(ageMs / 1000);

  if (ageSeconds < 10) return 'just now';
  if (ageSeconds < 60) return `${ageSeconds}s ago`;

  const ageMinutes = Math.floor(ageSeconds / 60);
  if (ageMinutes < 60) return `${ageMinutes}m ago`;

  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) return `${ageHours}h ago`;

  const ageDays = Math.floor(ageHours / 24);
  return `${ageDays}d ago`;
}

const DataFreshnessIndicator: React.FC<DataFreshnessIndicatorProps> = ({
  label = 'Data',
  isRefreshing = false,
  isSnapshot = false,
  lastLiveSyncAt = null,
  errorDetail = null,
  liveLabel = 'Live',
  syncingLabel = 'Syncing',
  snapshotLabel = 'Snapshot',
  idleLabel = 'Awaiting',
  errorLabel = 'Delayed',
  compact = false,
}) => {
  const { isDarkMode } = useTheme();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());

    if (typeof window === 'undefined') {
      return undefined;
    }

    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, [lastLiveSyncAt, isRefreshing, isSnapshot, errorDetail]);

  const resolved = useMemo(() => {
    const age = formatAge(nowMs, lastLiveSyncAt);

    if (errorDetail) {
      return {
        tone: colours.cta,
        label: errorLabel,
        detail: age ? `last live ${age}` : 'live refresh unavailable',
      };
    }

    if (isRefreshing) {
      return {
        tone: isDarkMode ? colours.accent : colours.highlight,
        label: syncingLabel,
        detail: age ? `last live ${age}` : 'checking live feed',
      };
    }

    if (isSnapshot) {
      return {
        tone: isDarkMode ? colours.yellow : colours.orange,
        label: snapshotLabel,
        detail: age ? `last live ${age}` : 'showing cached data',
      };
    }

    if (lastLiveSyncAt) {
      return {
        tone: colours.green,
        label: liveLabel,
        detail: age ? `updated ${age}` : 'watching changes',
      };
    }

    return {
      tone: isDarkMode ? colours.subtleGrey : colours.greyText,
      label: idleLabel,
      detail: 'waiting for first live update',
    };
  }, [errorDetail, errorLabel, idleLabel, isDarkMode, isRefreshing, isSnapshot, lastLiveSyncAt, liveLabel, nowMs, snapshotLabel, syncingLabel]);

  const style = {
    '--dfi-tone': resolved.tone,
    '--dfi-border': withAlpha(resolved.tone, isDarkMode ? 0.3 : 0.22),
    '--dfi-surface': isDarkMode ? withAlpha(resolved.tone, 0.12) : withAlpha(resolved.tone, 0.08),
  } as React.CSSProperties;

  return (
    <div
      className={`data-freshness-indicator${compact ? ' data-freshness-indicator--compact' : ''}`}
      style={style}
      title={`${label}: ${resolved.label}${resolved.detail ? ` — ${resolved.detail}` : ''}`}
    >
      <span className="data-freshness-indicator__dot" aria-hidden="true" />
      <div className="data-freshness-indicator__meta">
        <span className="data-freshness-indicator__eyebrow">{label}</span>
        <span className="data-freshness-indicator__value">{resolved.label}</span>
      </div>
      <span className="data-freshness-indicator__detail">{resolved.detail}</span>
    </div>
  );
};

export default DataFreshnessIndicator;