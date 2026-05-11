// src/tabs/roadmap/parts/ActivityAlertsStrip.tsx - conditional severity strip
//
// Renders only when something needs attention (errors, degraded sessions, stale scheduler mutex).
// Composes entirely from the existing OpsPulseState - no new server endpoints.
// Each row is a button that activates the relevant lens via ActivityContext.
//
// "New since you last looked" - we persist a per-channel `lastSeenAt` in
// localStorage so a small accent dot lights up when there's been activity
// since the operator last opened the tab. Once the strip mounts the
// timestamps are bumped (we assume they've now seen them).

import React, { useEffect, useMemo } from 'react';
import { colours } from '../../../app/styles/colours';
import { useOptionalActivityContext } from '../ActivityContext';
import type { OpsPulseState } from './ops-pulse-types';

const STALE_MUTEX_MS = 60_000; // mutex held > 60s without rotation = warn
// Alerts strip only counts very recent failures so it self-clears as the day
// goes on. The server also time-bounds the buffer (15 min) - this is a
// tighter view for "right now" attention.
const ALERT_WINDOW_MS = 15 * 60_000;
const LAST_SEEN_KEY = 'helix.activityAlerts.lastSeen';

type LastSeenMap = Partial<Record<'errors' | 'doubledApi' | 'sessions' | 'mutex' | 'opsChecks', number>>;

function readLastSeen(): LastSeenMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LAST_SEEN_KEY);
    return raw ? (JSON.parse(raw) as LastSeenMap) : {};
  } catch {
    return {};
  }
}

function writeLastSeen(next: LastSeenMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
}

interface Alert {
  key: string;
  tone: 'danger' | 'warning';
  label: string;
  detail: string;
  isFresh: boolean;
  onActivate?: () => void;
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
  const lastSeen = useMemo(() => readLastSeen(), []);
  const now = Date.now();
  const cutoff = now - ALERT_WINDOW_MS;
  const alerts: Alert[] = [];
  const latestCheckIssue = opsPulse.opsChecks?.latest.find((item) => item.status !== 'pass') || null;

  // Errors -> danger (only those within the alert window)
  const recentErrors = (opsPulse.errors || []).filter((e) => e.ts >= cutoff);
  if (recentErrors.length > 0) {
    const latest = recentErrors[0];
    alerts.push({
      key: 'errors',
      tone: 'danger',
      label: `${recentErrors.length} error${recentErrors.length === 1 ? '' : 's'}`,
      detail: latest ? `${latest.path || 'unknown'} - ${formatAgo(latest.ts)}` : 'recent failures',
      isFresh: latest ? latest.ts > (lastSeen.errors || 0) : false,
      onActivate: ctx ? () => ctx.focusLens('errors', { errorTs: latest?.ts ?? null }) : undefined,
    });
  }

  // Doubled-API hits -> danger. Caught by the `/api/api/*` guard middleware
  // in `server/index.js`. A non-empty buffer means a client built
  // `${proxyBase}/api/foo` where `proxyBase` already ends in `/api`,
  // producing the silent 404 class of bug. Time-bounded so day-old hits
  // don't keep glowing red.
  const recentDoubled = (opsPulse.doubledApi || []).filter((h) => h.ts >= cutoff);
  if (recentDoubled.length > 0) {
    const latestHit = recentDoubled[0];
    alerts.push({
      key: 'doubledApi',
      tone: 'danger',
      label: `${recentDoubled.length} /api/api/ hit${recentDoubled.length === 1 ? '' : 's'}`,
      detail: latestHit
        ? `${latestHit.method} ${latestHit.originalPath} - ${formatAgo(latestHit.ts)}`
        : 'doubled prefix regressions',
      isFresh: latestHit ? latestHit.ts > (lastSeen.doubledApi || 0) : false,
      // Both failure classes share the `errors` lens - FocalSurface stacks
      // ErrorStreamSection + DoubledApiSection there.
      onActivate: ctx ? () => ctx.focusLens('errors') : undefined,
    });
  }

  const checkFailureCount = opsPulse.opsChecks?.failingCount ?? 0;
  const checkWarningCount = opsPulse.opsChecks?.warningCount ?? 0;
  const checkIssueCount = checkFailureCount + checkWarningCount;
  if (checkIssueCount > 0) {
    alerts.push({
      key: 'opsChecks',
      tone: checkFailureCount > 0 ? 'danger' : 'warning',
      label: `${checkIssueCount} check issue${checkIssueCount === 1 ? '' : 's'}`,
      detail: latestCheckIssue ? `${latestCheckIssue.label} - ${formatAgo(latestCheckIssue.ts)}` : 'route readiness needs attention',
      isFresh: latestCheckIssue ? latestCheckIssue.ts > (lastSeen.opsChecks || 0) : false,
      onActivate: ctx ? () => ctx.focusLens('checks') : undefined,
    });
  }

  // Degraded sessions -> warning
  const degraded = opsPulse.sessionTraces?.degraded ?? 0;
  if (degraded > 0) {
    const firstDegraded = opsPulse.sessionTraces?.list.find((s) => s.health === 'error' || s.health === 'warning');
    alerts.push({
      key: 'sessions',
      tone: 'warning',
      label: `${degraded} degraded session${degraded === 1 ? '' : 's'}`,
      detail: firstDegraded ? `${firstDegraded.name || firstDegraded.user} - ${firstDegraded.lastEventLabel || 'no recent event'}` : 'client-side issues',
      isFresh: false, // degraded count is a snapshot, not a stream - fresh-dot doesn't apply meaningfully
      onActivate: ctx ? () => ctx.focusLens('trace', { sessionId: firstDegraded?.sessionId ?? null }) : undefined,
    });
  }

  // Stale scheduler mutex -> warning
  const mutex = opsPulse.scheduler?.mutex;
  if (mutex?.locked && mutex.holder && now - mutex.holder.startedAt > STALE_MUTEX_MS) {
    alerts.push({
      key: 'mutex',
      tone: 'warning',
      label: 'Scheduler mutex stuck',
      detail: `${mutex.holder.name} held ${Math.round((now - mutex.holder.startedAt) / 1000)}s - queue ${mutex.queueDepth}`,
      isFresh: false,
      onActivate: ctx ? () => ctx.focusLens('sync') : undefined,
    });
  }

  // Bump lastSeen when alerts render - operator has now seen them.
  // We track per-channel using the latest timestamp present.
  useEffect(() => {
    if (alerts.length === 0) return;
    const next: LastSeenMap = { ...lastSeen };
    if (recentErrors[0]) next.errors = recentErrors[0].ts;
    if (recentDoubled[0]) next.doubledApi = recentDoubled[0].ts;
    if (latestCheckIssue) next.opsChecks = latestCheckIssue.ts;
    writeLastSeen(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentErrors[0]?.ts, recentDoubled[0]?.ts, latestCheckIssue?.ts]);

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
        const interactive = Boolean(alert.onActivate);
        return (
          <button
            key={alert.key}
            type="button"
            onClick={alert.onActivate}
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
              position: 'relative',
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
            <span style={{ color: muted, fontWeight: 500 }}>- {alert.detail}</span>
            {alert.isFresh && (
              <span
                aria-label="new since you last looked"
                title="New since you last looked"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isDarkMode ? colours.accent : colours.highlight,
                  marginLeft: 2,
                  boxShadow: `0 0 6px ${isDarkMode ? colours.accent : colours.highlight}`,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default ActivityAlertsStrip;
