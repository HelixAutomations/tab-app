// src/tabs/roadmap/parts/ActivityAlertsStrip.tsx — conditional severity strip
//
// Renders only when something needs attention (errors, degraded sessions, stale scheduler mutex).
// Composes entirely from the existing OpsPulseState — no new server endpoints.
// Each row is a button that focuses the relevant lens via ActivityContext.

import React from 'react';
import { colours } from '../../../app/styles/colours';
import { useOptionalActivityContext } from '../ActivityContext';
import type { OpsPulseState } from './ops-pulse-types';

const STALE_MUTEX_MS = 60_000; // mutex held > 60s without rotation = warn

interface Alert {
  key: string;
  tone: 'danger' | 'warning';
  label: string;
  detail: string;
  onFocus?: () => void;
}

interface ActivityAlertsStripProps {
  isDarkMode: boolean;
  opsPulse: OpsPulseState;
}

function formatAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const ActivityAlertsStrip: React.FC<ActivityAlertsStripProps> = ({ isDarkMode, opsPulse }) => {
  const ctx = useOptionalActivityContext();
  const alerts: Alert[] = [];

  // Errors → danger
  const errors = opsPulse.errors || [];
  if (errors.length > 0) {
    const latest = errors[0];
    alerts.push({
      key: 'errors',
      tone: 'danger',
      label: `${errors.length} error${errors.length === 1 ? '' : 's'}`,
      detail: latest ? `${latest.path || 'unknown'} · ${formatAgo(latest.ts)}` : 'recent failures',
      onFocus: ctx ? () => ctx.focusLens('errors', { errorTs: latest?.ts ?? null }) : undefined,
    });
  }

  // Degraded sessions → warning
  const degraded = opsPulse.sessionTraces?.degraded ?? 0;
  if (degraded > 0) {
    const firstDegraded = opsPulse.sessionTraces?.list.find((s) => s.health === 'error' || s.health === 'warning');
    alerts.push({
      key: 'sessions-degraded',
      tone: 'warning',
      label: `${degraded} degraded session${degraded === 1 ? '' : 's'}`,
      detail: firstDegraded ? `${firstDegraded.name || firstDegraded.user} · ${firstDegraded.lastEventLabel || 'no recent event'}` : 'client-side issues',
      onFocus: ctx ? () => ctx.focusLens('trace', { sessionId: firstDegraded?.sessionId ?? null }) : undefined,
    });
  }

  // Stale scheduler mutex → warning
  const mutex = opsPulse.scheduler?.mutex;
  if (mutex?.locked && mutex.holder && Date.now() - mutex.holder.startedAt > STALE_MUTEX_MS) {
    alerts.push({
      key: 'mutex-stale',
      tone: 'warning',
      label: 'Scheduler mutex stuck',
      detail: `${mutex.holder.name} held ${Math.round((Date.now() - mutex.holder.startedAt) / 1000)}s · queue ${mutex.queueDepth}`,
      onFocus: ctx ? () => ctx.focusLens('sync') : undefined,
    });
  }

  if (alerts.length === 0) return null;

  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const baseBg = isDarkMode ? 'rgba(255,255,255,0.03)' : colours.light.sectionBackground;

  return (
    <div
      role="region"
      aria-label="Active alerts"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        padding: '10px 12px',
        marginBottom: 16,
        background: baseBg,
        borderLeft: `3px solid ${alerts.some((a) => a.tone === 'danger') ? colours.cta : colours.orange}`,
        fontFamily: 'Raleway, sans-serif',
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: muted,
          alignSelf: 'center',
          marginRight: 4,
        }}
      >
        Alerts
      </span>
      {alerts.map((alert) => {
        const accent = alert.tone === 'danger' ? colours.cta : colours.orange;
        const interactive = Boolean(alert.onFocus);
        return (
          <button
            key={alert.key}
            type="button"
            onClick={alert.onFocus}
            disabled={!interactive}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              border: `1px solid ${accent}`,
              background: `${accent}14`,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              fontFamily: 'Raleway, sans-serif',
              fontSize: 12,
              fontWeight: 600,
              cursor: interactive ? 'pointer' : 'default',
              borderRadius: 0,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: accent,
                flexShrink: 0,
              }}
            />
            <span style={{ color: accent, fontWeight: 700 }}>{alert.label}</span>
            <span style={{ color: muted, fontWeight: 500 }}>· {alert.detail}</span>
          </button>
        );
      })}
    </div>
  );
};

export default ActivityAlertsStrip;
