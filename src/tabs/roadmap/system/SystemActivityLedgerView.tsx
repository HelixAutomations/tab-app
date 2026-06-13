import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import DataFreshnessIndicator from '../../../components/DataFreshnessIndicator';
import { colours } from '../../../app/styles/colours';
import FormsStreamPanel from '../parts/FormsStreamPanel';
import UnifiedStream from '../parts/UnifiedStream';
import type { ActivityFeedItem } from '../parts/types';
import type { OpsPulseState } from '../parts/ops-pulse-types';
import { HeaderButton, useSystemTokens } from './shared';
import './SystemActivityLedgerView.css';

interface SystemActivityLedgerViewProps {
  isDarkMode: boolean;
  activityItems: ActivityFeedItem[];
  opsPulse: OpsPulseState;
  formsTodayCount: number;
  isRefreshing: boolean;
  isSnapshot: boolean;
  lastLiveSyncAt: number | null;
  error: string | null;
  onBack: () => void;
  onOpenDashboard: () => void;
  onOpenApiAudit: () => void;
}

const CARD_SOURCES = new Set<ActivityFeedItem['source']>([
  'teams.card',
  'activity.cardlab',
  'activity.card.send',
  'activity.dm.send',
]);

const SIDE_WIDTH_STORAGE_KEY = 'helix.systemActivity.sideWidth';
const DEFAULT_SIDE_WIDTH = 390;
const MIN_SIDE_WIDTH = 300;
const MIN_LEDGER_WIDTH = 460;
const RESIZER_WIDTH = 12;

function clampSideWidth(value: number, containerWidth: number): number {
  const maxSideWidth = Math.max(MIN_SIDE_WIDTH, containerWidth - MIN_LEDGER_WIDTH - RESIZER_WIDTH);
  return Math.min(Math.max(value, MIN_SIDE_WIDTH), maxSideWidth);
}

function readStoredSideWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_SIDE_WIDTH;
  const saved = Number(window.localStorage.getItem(SIDE_WIDTH_STORAGE_KEY));
  return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_SIDE_WIDTH;
}

const StatCard: React.FC<{
  label: string;
  value: string | number;
  detail: string;
  accent: string;
  isDarkMode: boolean;
}> = ({ label, value, detail, accent, isDarkMode }) => {
  const { borderColour, cardBg, mutedColour, textColour } = useSystemTokens(isDarkMode);
  return (
    <div style={{ borderStyle: 'solid', borderWidth: '1px 1px 1px 3px', borderColor: `${borderColour} ${borderColour} ${borderColour} ${accent}`, background: cardBg, padding: '11px 12px', minHeight: 86, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour }}>{label}</span>
      <span style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, color: accent, fontFamily: 'Raleway, sans-serif' }}>{value}</span>
      <span style={{ fontSize: 11, lineHeight: 1.35, color: textColour }}>{detail}</span>
    </div>
  );
};

const TeamPresencePanel: React.FC<{ opsPulse: OpsPulseState; isDarkMode: boolean }> = ({ opsPulse, isDarkMode }) => {
  const { borderColour, cardBg, mutedColour, textColour } = useSystemTokens(isDarkMode);
  const users = opsPulse.presence?.list?.slice(0, 10) ?? [];

  return (
    <section data-helix-region="system/activity/team-presence" style={{ border: `1px solid ${borderColour}`, background: cardBg, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: textColour }}>Team now</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: opsPulse.connected ? colours.green : colours.orange, fontFamily: 'monospace' }}>{opsPulse.connected ? 'live' : 'waiting'}</span>
      </div>
      {users.length === 0 ? (
        <div style={{ fontSize: 12, color: mutedColour }}>No active users reported yet.</div>
      ) : (
        <div className="system-activity-scroll" style={{ display: 'grid', gap: 6, maxHeight: 250, overflowY: 'auto' }}>
          {users.map((user) => {
            const secondsAgo = Math.max(0, Math.floor((Date.now() - user.lastSeen) / 1000));
            return (
              <div key={`${user.email}-${user.tab}`} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}>
                <span style={{ width: 26, height: 26, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: colours.highlight, color: '#fff', fontSize: 10, fontWeight: 900 }}>{user.initials}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: textColour, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name || user.email}</span>
                  <span style={{ display: 'block', fontSize: 10, color: mutedColour }}>{user.tab}</span>
                </span>
                <span style={{ fontSize: 10, color: mutedColour, fontFamily: 'monospace' }}>{secondsAgo < 60 ? 'now' : `${Math.floor(secondsAgo / 60)}m`}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

const SystemActivityLedgerView: React.FC<SystemActivityLedgerViewProps> = ({
  isDarkMode,
  activityItems,
  opsPulse,
  formsTodayCount,
  isRefreshing,
  isSnapshot,
  lastLiveSyncAt,
  error,
  onBack,
  onOpenDashboard,
  onOpenApiAudit,
}) => {
  const { borderColour, mutedColour, panelBg, textColour } = useSystemTokens(isDarkMode);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [sideWidth, setSideWidth] = useState(readStoredSideWidth);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [isResizing, setIsResizing] = useState(false);

  useLayoutEffect(() => {
    const region = document.querySelector('.app-scroll-region');
    if (!(region instanceof HTMLElement)) return undefined;
    region.classList.add('system-activity-scroll-region');
    return () => {
      region.classList.remove('system-activity-scroll-region');
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDE_WIDTH_STORAGE_KEY, String(Math.round(sideWidth)));
    } catch {
      // Ignore storage failures in restricted browser shells.
    }
  }, [sideWidth]);

  useEffect(() => {
    if (!isResizing) return undefined;
    document.body.classList.add('system-activity-resizing');
    return () => {
      document.body.classList.remove('system-activity-resizing');
    };
  }, [isResizing]);

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? layout.getBoundingClientRect().width;
      setLayoutWidth(nextWidth);
      setSideWidth((current) => clampSideWidth(current, nextWidth));
    });
    observer.observe(layout);
    return () => observer.disconnect();
  }, []);

  const updateSideWidthFromPointer = useCallback((clientX: number) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const bounds = layout.getBoundingClientRect();
    setLayoutWidth(bounds.width);
    setSideWidth(clampSideWidth(bounds.right - clientX, bounds.width));
  }, []);

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsResizing(true);
    updateSideWidthFromPointer(event.clientX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      updateSideWidthFromPointer(moveEvent.clientX);
    };
    const handlePointerEnd = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd, { once: true });
    window.addEventListener('pointercancel', handlePointerEnd, { once: true });
  }, [updateSideWidthFromPointer]);

  const adjustSideWidth = useCallback((delta: number) => {
    const layout = layoutRef.current;
    const containerWidth = layout?.getBoundingClientRect().width ?? (layoutWidth || MIN_LEDGER_WIDTH + DEFAULT_SIDE_WIDTH + RESIZER_WIDTH);
    setLayoutWidth(containerWidth);
    setSideWidth((current) => clampSideWidth(current + delta, containerWidth));
  }, [layoutWidth]);

  const handleResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const layout = layoutRef.current;
    const containerWidth = layout?.getBoundingClientRect().width ?? (layoutWidth || MIN_LEDGER_WIDTH + DEFAULT_SIDE_WIDTH + RESIZER_WIDTH);
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      adjustSideWidth(32);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      adjustSideWidth(-32);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setSideWidth(clampSideWidth(containerWidth - MIN_LEDGER_WIDTH, containerWidth));
    } else if (event.key === 'End') {
      event.preventDefault();
      setSideWidth(clampSideWidth(MIN_SIDE_WIDTH, containerWidth));
    }
  }, [adjustSideWidth, layoutWidth]);

  const cardCount = useMemo(() => activityItems.filter((item) => CARD_SOURCES.has(item.source)).length, [activityItems]);
  const errorCount = opsPulse.errors?.length ?? 0;
  const onlineCount = opsPulse.presence?.online ?? 0;
  const streamCount = opsPulse.sessions?.totalConnections ?? 0;
  const sideWidthMax = Math.max(MIN_SIDE_WIDTH, (layoutWidth || MIN_LEDGER_WIDTH + DEFAULT_SIDE_WIDTH + RESIZER_WIDTH) - MIN_LEDGER_WIDTH - RESIZER_WIDTH);
  const layoutStyle = useMemo(() => ({
    '--system-activity-side-width': `${Math.round(sideWidth)}px`,
  } as React.CSSProperties), [sideWidth]);

  return (
    <section data-helix-region="system/activity" style={{ color: textColour, fontFamily: 'Raleway, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour }}>System</div>
          <h1 style={{ margin: '3px 0 0', fontSize: 24, lineHeight: 1.2, color: textColour, fontFamily: 'Raleway, sans-serif' }}>Activity</h1>
          <div style={{ fontSize: 12, color: mutedColour, marginTop: 6, maxWidth: 760 }}>Team usage, forms, cards, and operational events in one ledger.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <DataFreshnessIndicator label="Activity" isRefreshing={isRefreshing} isSnapshot={isSnapshot} lastLiveSyncAt={lastLiveSyncAt} errorDetail={activityItems.length > 0 ? error : null} snapshotLabel="Delayed" compact />
          <HeaderButton label="Back" isDarkMode={isDarkMode} onClick={onBack} />
          <HeaderButton label="Dashboard" isDarkMode={isDarkMode} accent={colours.highlight} onClick={onOpenDashboard} />
          <HeaderButton label="API Audit" isDarkMode={isDarkMode} accent={colours.blue} onClick={onOpenApiAudit} />
        </div>
      </div>

      {error && activityItems.length === 0 ? (
        <div style={{ border: `1px solid ${colours.cta}`, background: `${colours.cta}14`, color: colours.cta, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}>{error}</div>
      ) : null}

      <div className="system-activity-stat-grid">
        <StatCard label="Team" value={onlineCount} detail={streamCount > 0 ? `${streamCount} streams open` : 'presence stream'} accent={colours.green} isDarkMode={isDarkMode} />
        <StatCard label="Ledger" value={activityItems.length} detail="server events loaded" accent={colours.highlight} isDarkMode={isDarkMode} />
        <StatCard label="Cards" value={cardCount} detail="tracked Teams card events" accent={colours.orange} isDarkMode={isDarkMode} />
        <StatCard label="Forms" value={formsTodayCount} detail="form events today" accent={colours.accent} isDarkMode={isDarkMode} />
        <StatCard label="Errors" value={errorCount} detail={errorCount > 0 ? 'needs attention' : 'none active'} accent={errorCount > 0 ? colours.cta : colours.green} isDarkMode={isDarkMode} />
      </div>

      <div ref={layoutRef} className={`system-activity-layout ${isResizing ? 'system-activity-layout--resizing' : ''}`} style={layoutStyle}>
        <div className="system-activity-main-column">
          <UnifiedStream isDarkMode={isDarkMode} activityItems={activityItems} title="Team activity ledger" limit={120} />
        </div>
        <div
          role="separator"
          tabIndex={0}
          aria-label="Resize Activity columns"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDE_WIDTH}
          aria-valuemax={Math.round(sideWidthMax)}
          aria-valuenow={Math.round(sideWidth)}
          className="system-activity-column-resizer"
          data-helix-region="system/activity/column-resizer"
          onPointerDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
          title="Drag to resize columns"
        >
          <span className="system-activity-column-resizer__line" />
        </div>
        <aside className="system-activity-side-stack">
          <FormsStreamPanel isDarkMode={isDarkMode} />
          <TeamPresencePanel opsPulse={opsPulse} isDarkMode={isDarkMode} />
          <section data-helix-region="system/activity/scope" style={{ border: `1px solid ${borderColour}`, background: panelBg, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: textColour, marginBottom: 6 }}>Scope</div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: mutedColour }}>Activity is the compact team ledger. Dashboard keeps diagnostics, traces, and heavier operator controls.</div>
          </section>
        </aside>
      </div>
    </section>
  );
};

export default SystemActivityLedgerView;