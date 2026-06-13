// src/tabs/roadmap/Roadmap.tsx — Activity dashboard (live ops + changelog)

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Spinner } from '@fluentui/react/lib/Spinner';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { UserData } from '../../app/functionality/types';
import { canSeeActivityTab, getUserTier } from '../../app/admin';
import HomeBootMonitor from './HomeBootMonitor';
import ActivityFeedSection from './parts/ActivityFeedSection';
import ApiHeatSection from './parts/ApiHeatSection';
import FormsStreamPanel, { getFormsTodayCount } from './parts/FormsStreamPanel';
import ActivityHero, { ActivityLens, KpiSpec, LensSpec } from './parts/ActivityHero';
import ActivityAlertsStrip from './parts/ActivityAlertsStrip';
import FocalSurface from './parts/FocalSurface';
import SideRail from './parts/SideRail';
import ToolsDrawer from './parts/ToolsDrawer';
import NavigatorDetailBar from '../../components/NavigatorDetailBar';
import SystemErrorsView from './system/SystemErrorsView';
import SystemActivityView from './system/SystemActivityView';
import MatterReplayView from './system/MatterReplayView';
import SystemInfrastructureView from './system/SystemInfrastructureView';
import SystemAuditPackView from './system/SystemAuditPackView';
import SystemProjectsView from './system/SystemProjectsView';
import SystemActivityLedgerView from './system/SystemActivityLedgerView';
import SystemTasksView from './system/SystemTasksView';
import { SystemLandingTile } from './system/shared';
import { PROCESS_STREAM_UPDATED_EVENT } from '../forms/processStreamStore';
import { useOpsPulse } from './hooks/useOpsPulse';
import { useActivityLayout } from './hooks/useActivityLayout';
import { ActivityProvider } from './ActivityContext';
import { ActivityFeedItem } from './parts/types';
import type { OpsPulseState, PresenceEntry } from './parts/ops-pulse-types';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
import { LocalSupportSettings } from '../../app/localSupportMode';
import './Activity.css';

interface ActivityProps {
  userData: UserData[] | null;
  showBootMonitor?: boolean;
  isLocalDev?: boolean;
  localSupportMode?: LocalSupportSettings['mode'];
}

type ReleaseCategory = 'feature' | 'improvement' | 'fix' | 'ops';

type ReleaseEntry = {
  date: string;
  title: string;
  details?: string;
  category: ReleaseCategory;
  idx: number;
};

type ReleaseGroup = {
  label: string;
  version: string;
  monthKey: string;
  entries: ReleaseEntry[];
};

const CATEGORY_KEYWORDS: Record<Exclude<ReleaseCategory, 'feature'>, RegExp> = {
  fix: /\bfix(ed|es|ing)?\b|\bbug\b|\bpatch\b|\bharden(ed|ing)?\b|\bfallback\b|\bstabil/i,
  ops: /\btelemetry\b|\bapp\s*insights\b|\bscheduler\b|\bdeploy\b|\bops\b|\bmigrat/i,
  improvement: /\boptimis|refactor|clean|performance|simplif|redesign|improv|enrich|enhanc|inline|converge|consolidat/i,
};

function detectCategory(title: string, details?: string): ReleaseCategory {
  const hay = `${title} ${details || ''}`;
  for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS) as [Exclude<ReleaseCategory, 'feature'>, RegExp][]) {
    if (re.test(hay)) return cat;
  }
  return 'feature';
}

const CATEGORY_META: Record<ReleaseCategory, { label: string; colour: string; darkColour: string }> = {
  feature: { label: 'New', colour: colours.green, darkColour: colours.green },
  improvement: { label: 'Improved', colour: colours.highlight, darkColour: colours.accent },
  fix: { label: 'Fixed', colour: colours.orange, darkColour: colours.orange },
  ops: { label: 'Under the hood', colour: colours.greyText, darkColour: colours.subtleGrey },
};

function parseChangelog(markdown: string): ReleaseEntry[] {
  const lines = markdown.split('\n');
  const entries: ReleaseEntry[] = [];
  lines.forEach((line, idx) => {
    const match = line.match(/^\s*(\d{4}-\d{2}-\d{2})\s*\/\s*([^/]+?)(?:\s*\/\s*(.*))?\s*$/);
    if (!match) return;
    const date = match[1];
    const title = (match[2] || '').trim();
    const details = (match[3] || '').trim() || undefined;
    if (!title) return;
    entries.push({ date, title, details, category: detectCategory(title, details), idx });
  });
  entries.sort((a, b) => (a.date === b.date ? a.idx - b.idx : a.date < b.date ? 1 : -1));
  return entries;
}

function groupByMonth(entries: ReleaseEntry[]): ReleaseGroup[] {
  const map = new Map<string, ReleaseEntry[]>();
  for (const entry of entries) {
    const monthKey = entry.date.slice(0, 7);
    (map.get(monthKey) ?? (map.set(monthKey, []), map.get(monthKey)!)).push(entry);
  }

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? 1 : -1));
  return keys.map((key) => {
    const [year, month] = key.split('-');
    return {
      monthKey: key,
      version: `v${year}.${parseInt(month, 10)}`,
      label: `${months[parseInt(month, 10) - 1]} ${year}`,
      entries: map.get(key) || [],
    };
  });
}

function formatDate(iso: string): string {
  try {
    const date = new Date(`${iso}T00:00:00`);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}



const containerStyles = (isDarkMode: boolean): React.CSSProperties => ({
  width: '100%',
  minHeight: '100%',
  padding: '32px 40px',
  backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
  fontFamily: 'Raleway, sans-serif',
  transition: 'background-color 0.2s',
});

type SystemMode = 'entry' | 'errors' | 'matter-replay' | 'activity' | 'tasks' | 'api-audit' | 'infrastructure' | 'projects' | 'audit-pack' | 'dashboard';

const SYSTEM_NAV_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'activity', label: 'Activity' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'errors', label: 'Errors' },
  { key: 'matter-replay', label: 'Matter Replay' },
  { key: 'api-audit', label: 'API Audit' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'projects', label: 'Projects' },
  { key: 'audit-pack', label: 'Audit Pack' },
];

function resetAppScrollTop() {
  if (typeof document === 'undefined') return;
  const scrollRegion = document.querySelector('.app-scroll-region');
  if (scrollRegion instanceof HTMLElement) scrollRegion.scrollTop = 0;
}

function systemTabLabel(key: string): string {
  const labels: Record<string, string> = {
    home: 'Home',
    enquiries: 'Prospects',
    matters: 'Matters',
    forms: 'Forms',
    reporting: 'Reports',
    roadmap: 'System',
    resources: 'Resources',
  };
  return labels[key] || key;
}

function lastSeenLabel(lastSeen: number): string {
  const secondsAgo = Math.max(0, Math.floor((Date.now() - lastSeen) / 1000));
  if (secondsAgo < 10) return 'now';
  if (secondsAgo < 60) return `${secondsAgo}s`;
  return `${Math.floor(secondsAgo / 60)}m`;
}

type SystemOverviewStatTone = 'ok' | 'warn' | 'danger' | 'neutral';

const SystemOverviewInsights: React.FC<{
  isDarkMode: boolean;
  opsPulse: OpsPulseState;
  onOpenErrors: () => void;
  onOpenDashboard: () => void;
}> = ({ isDarkMode, opsPulse, onOpenErrors, onOpenDashboard }) => {
  const presence = opsPulse.presence;
  const activeUsers = presence?.list?.slice(0, 6) ?? [];
  const activeTabs = Object.entries(presence?.tabs ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const onlineCount = presence?.online ?? 0;
  const streamCount = opsPulse.sessions?.totalConnections ?? 0;
  const errorCount = opsPulse.errors?.length ?? 0;
  const checksFailingCount = opsPulse.opsChecks?.failingCount ?? 0;
  const checksWarningCount = opsPulse.opsChecks?.warningCount ?? 0;
  const checksTrackedCount = opsPulse.opsChecks?.totalTracked ?? 0;
  const checksTone: SystemOverviewStatTone = checksFailingCount > 0
    ? 'danger'
    : checksWarningCount > 0
      ? 'warn'
      : checksTrackedCount > 0
        ? 'ok'
        : 'neutral';

  const renderUser = (user: PresenceEntry) => (
    <div key={`${user.email}-${user.tab}`} className="system-overview-user-pill" title={`${user.name} - ${systemTabLabel(user.tab)}`}>
      <span className="system-overview-user-dot" />
      <span className="system-overview-user-initials">{user.initials}</span>
      <span className="system-overview-user-tab">{systemTabLabel(user.tab)}</span>
      <span className="system-overview-user-seen">{lastSeenLabel(user.lastSeen)}</span>
    </div>
  );

  const renderStat = ({
    label,
    value,
    detail,
    tone,
    onClick,
    dataRegion,
  }: {
    label: string;
    value: string | number;
    detail: string;
    tone: SystemOverviewStatTone;
    onClick: () => void;
    dataRegion: string;
  }) => (
    <button
      type="button"
      className={`system-overview-stat system-overview-stat--${tone}`}
      onClick={onClick}
      data-helix-region={dataRegion}
    >
      <span className="system-overview-stat-label">{label}</span>
      <span className="system-overview-stat-value">{value}</span>
      <span className="system-overview-stat-detail">{detail}</span>
    </button>
  );

  return (
    <section className={`system-overview-insights ${isDarkMode ? 'system-overview-insights--dark' : ''}`} data-helix-region="system/entry/overview-pulse">
      <div className="system-overview-presence-card">
        <div className="system-overview-presence-head">
          <div>
            <div className="system-overview-eyebrow">Active users</div>
            <div className="system-overview-presence-title">Live usage</div>
          </div>
          <span className="system-overview-live-chip">Live</span>
        </div>
        <div className="system-overview-presence-main">
          <div className="system-overview-presence-count">{onlineCount}</div>
          <div className="system-overview-presence-copy">
            <strong>{onlineCount === 1 ? 'person is active' : 'people are active'}</strong>
            <span>{streamCount > 0 ? `${streamCount} live streams open` : opsPulse.connected ? 'Presence stream connected' : 'Presence stream waiting'}</span>
          </div>
        </div>
        {activeUsers.length > 0 ? (
          <div className="system-overview-user-row">
            {activeUsers.map(renderUser)}
          </div>
        ) : (
          <div className="system-overview-empty">No active users reported yet.</div>
        )}
        {activeTabs.length > 0 ? (
          <div className="system-overview-tab-row">
            {activeTabs.map(([tab, count]) => (
              <span key={tab}>{systemTabLabel(tab)} {count}</span>
            ))}
          </div>
        ) : null}
      </div>

      {renderStat({
        label: 'Errors now',
        value: errorCount,
        detail: errorCount > 0 ? 'Open the error queue' : 'No active error rows',
        tone: errorCount > 0 ? 'danger' : 'ok',
        onClick: onOpenErrors,
        dataRegion: 'system/entry/errors-stat',
      })}

      {renderStat({
        label: 'Route checks',
        value: checksTrackedCount > 0 ? `${opsPulse.opsChecks?.passCount ?? 0}/${checksTrackedCount}` : 'None',
        detail: checksTrackedCount > 0
          ? `${checksFailingCount} fail, ${checksWarningCount} warn`
          : 'Run checks from Dashboard',
        tone: checksTone,
        onClick: onOpenDashboard,
        dataRegion: 'system/entry/checks-stat',
      })}
    </section>
  );
};

const SystemEntry: React.FC<{
  isDarkMode: boolean;
  opsPulse: OpsPulseState;
  onOpenErrors: () => void;
  onOpenMatterReplay: () => void;
  onOpenActivity: () => void;
  onOpenTasks: () => void;
  onOpenApiAudit: () => void;
  onOpenInfrastructure: () => void;
  onOpenProjects: () => void;
  onOpenAuditPack: () => void;
  onOpenDashboard: () => void;
}> = ({ isDarkMode, opsPulse, onOpenErrors, onOpenMatterReplay, onOpenActivity, onOpenTasks, onOpenApiAudit, onOpenInfrastructure, onOpenProjects, onOpenAuditPack, onOpenDashboard }) => {
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const mutedColour = isDarkMode ? '#d1d5db' : colours.greyText;
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const sectionLabel = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 10px' }}>
      <div style={{ height: 1, flex: 1, background: borderColour, opacity: 0.7 }} />
      <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: mutedColour }}>
        {label}
      </div>
      <div style={{ height: 1, flex: 1, background: borderColour, opacity: 0.7 }} />
    </div>
  );

  return (
    <section
      data-helix-region="system/entry"
      style={{
        minHeight: 'calc(100vh - 96px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <div className="system-overview-shell">
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: mutedColour }}>
            System
          </div>
          <h1 style={{ margin: '6px 0 0', fontSize: 30, lineHeight: 1.15, color: textColour, fontFamily: 'Raleway, sans-serif' }}>
            System
          </h1>
        </div>
        <SystemOverviewInsights isDarkMode={isDarkMode} opsPulse={opsPulse} onOpenErrors={onOpenErrors} onOpenDashboard={onOpenDashboard} />
        <div className="system-overview-dashboard">
          <SystemLandingTile
            label="Dashboard"
            eyebrow="Start here"
            description="Live status, route checks, traces, and drill-downs."
            isDarkMode={isDarkMode}
            accent={colours.highlight}
            onClick={onOpenDashboard}
            variant="primary"
            dataRegion="system/entry/dashboard"
          />
        </div>
        {sectionLabel('Tools')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <SystemLandingTile label="Errors" description="Exceptions and noisy routes." isDarkMode={isDarkMode} accent={colours.cta} onClick={onOpenErrors} dataRegion="system/entry/errors" />
          <SystemLandingTile label="Matter Replay" description="Matter-opening repair and replay." isDarkMode={isDarkMode} accent={colours.orange} onClick={onOpenMatterReplay} dataRegion="system/entry/matter-replay" />
          <SystemLandingTile label="Activity" description="Live ledger, cards, and operational streams." isDarkMode={isDarkMode} accent={colours.green} onClick={onOpenActivity} dataRegion="system/entry/activity" />
          <SystemLandingTile label="Tasks" description="Read-only task mirror and task inspection." isDarkMode={isDarkMode} accent={colours.accent} onClick={onOpenTasks} dataRegion="system/entry/tasks" />
          <SystemLandingTile label="API Audit" description="Fallback request rows and payload details." isDarkMode={isDarkMode} accent={colours.blue} onClick={onOpenApiAudit} dataRegion="system/entry/api-audit" />
        </div>
        {sectionLabel('Reference')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <SystemLandingTile
            label="Infrastructure"
            description="Azure inventory and cost."
            isDarkMode={isDarkMode}
            accent={colours.accent}
            onClick={onOpenInfrastructure}
            variant="info"
            dataRegion="system/entry/infrastructure"
          />
          <SystemLandingTile
            label="Projects"
            description="Foundation projects in flight."
            isDarkMode={isDarkMode}
            accent={colours.blue}
            onClick={onOpenProjects}
            variant="info"
            dataRegion="system/entry/projects"
          />
          <SystemLandingTile
            label="Audit Pack"
            description="Scope, data exits, evidence gaps."
            isDarkMode={isDarkMode}
            accent={colours.green}
            onClick={onOpenAuditPack}
            variant="info"
            dataRegion="system/entry/audit-pack"
          />
        </div>
      </div>
    </section>
  );
};

const FilterChip: React.FC<{
  label: string;
  count: number;
  active: boolean;
  colour: string;
  isDarkMode: boolean;
  onClick: () => void;
}> = ({ label, count, active, colour, isDarkMode, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 12px',
      borderRadius: 0,
      border: `1px solid ${active ? colour : isDarkMode ? colours.dark.border : colours.light.border}`,
      background: active ? `${colour}30` : 'transparent',
      color: active ? colour : isDarkMode ? colours.subtleGrey : colours.greyText,
      fontSize: 11,
      fontWeight: 700,
      cursor: 'pointer',
      transition: 'all 0.15s',
      letterSpacing: '0.2px',
      fontFamily: 'Raleway, sans-serif',
    }}
  >
    {label}
    <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.7 }}>{count}</span>
  </button>
);

const EntryRow: React.FC<{
  entry: ReleaseEntry;
  isDarkMode: boolean;
  expanded: boolean;
  onToggle: () => void;
}> = ({ entry, isDarkMode, expanded, onToggle }) => {
  const meta = CATEGORY_META[entry.category];
  const [hovered, setHovered] = useState(false);
  const catColour = isDarkMode ? meta.darkColour : meta.colour;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={entry.details ? onToggle : undefined}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 0,
        background: hovered ? (isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : 'transparent',
        transition: 'background 0.12s',
        cursor: entry.details ? 'pointer' : 'default',
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: 999, background: catColour, marginTop: 6, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text, lineHeight: 1.4, letterSpacing: '-0.1px' }}>
          {entry.title}
        </div>
        <div style={{ fontSize: 11, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
          <span>{formatDate(entry.date)}</span>
          <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: catColour, opacity: 0.85 }}>
            {meta.label}
          </span>
          {entry.details && (
            <span style={{ fontSize: 9, opacity: 0.5, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>
              &#9654;
            </span>
          )}
        </div>
        {expanded && entry.details && (
          <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: isDarkMode ? colours.subtleGrey : colours.greyText, padding: '8px 0 4px', borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}` }}>
            {entry.details}
          </div>
        )}
      </div>
    </div>
  );
};

const Activity: React.FC<ActivityProps> = ({ userData, showBootMonitor = false, isLocalDev = false, localSupportMode }) => {
  const { isDarkMode } = useTheme();
  const primaryUser = Array.isArray(userData) ? userData[0] : null;
  const showLiveMonitor = canSeeActivityTab(primaryUser, isLocalDev);
  const userTier = getUserTier(primaryUser);
  const userInitials = (primaryUser?.Initials || '').toString().toUpperCase().trim();
  const isDevOwner = userInitials === 'LZ';
  const isAC = userInitials === 'AC';
  const canSeeForge = isDevOwner || isAC;
  const FORGE_VIEW_MODE_KEY = 'helix.forge.viewMode';
  const initialForgeViewMode: 'dev' | 'roadmap' = (() => {
    if (!canSeeForge) return 'dev';
    if (isAC) return 'roadmap';
    if (typeof window === 'undefined') return 'dev';
    const stored = window.localStorage.getItem(FORGE_VIEW_MODE_KEY);
    return stored === 'roadmap' ? 'roadmap' : 'dev';
  })();
  const [forgeViewMode, setForgeViewMode] = useState<'dev' | 'roadmap'>(initialForgeViewMode);
  const handleForgeViewModeChange = useCallback((next: 'dev' | 'roadmap') => {
    setForgeViewMode(next);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(FORGE_VIEW_MODE_KEY, next); } catch { /* ignore */ }
    }
  }, []);
  const opsPulse = useOpsPulse(showLiveMonitor);
  const [formsTodayCount, setFormsTodayCount] = useState<number>(() => getFormsTodayCount());
  const [signalsOpenCount, setSignalsOpenCount] = useState<number | null>(null);
  const [briefsOpenCount, setBriefsOpenCount] = useState<number | null>(null);
  const [content, setContent] = useState('');
  const [activityItems, setActivityItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityFeedRefreshing, setActivityFeedRefreshing] = useState(false);
  const [activityFeedLastSyncAt, setActivityFeedLastSyncAt] = useState<number | null>(null);
  const [activityFeedUsingSnapshot, setActivityFeedUsingSnapshot] = useState(false);
  const [filter, setFilter] = useState<ReleaseCategory | 'all'>('all');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const layout = useActivityLayout();
  const { lens, setLens } = layout;
  const [showAdvancedLenses, setShowAdvancedLenses] = useState<boolean>(() => lens !== 'triage');
  const [systemMode, setSystemMode] = useState<SystemMode>(() => (isLocalDev && localSupportMode === 'system' ? 'errors' : 'entry'));
  const activityItemsRef = useRef<ActivityFeedItem[]>([]);

  useEffect(() => {
    if (lens !== 'triage') setShowAdvancedLenses(true);
  }, [lens]);

  useEffect(() => {
    if (!isLocalDev || localSupportMode !== 'system') return;
    setLens('triage');
    setShowAdvancedLenses(false);
    setSystemMode('errors');
  }, [isLocalDev, localSupportMode, setLens]);

  const handleAdvancedLensesToggle = useCallback(() => {
    if (showAdvancedLenses && lens !== 'triage') setLens('triage');
    setShowAdvancedLenses((prev) => !prev);
  }, [lens, setLens, showAdvancedLenses]);

  const resetToSystemEntry = useCallback(() => {
    resetAppScrollTop();
    setLens('triage');
    setShowAdvancedLenses(false);
    setSystemMode('entry');
  }, [setLens]);

  useEffect(() => {
    window.addEventListener('helix:system-entry-reset', resetToSystemEntry);
    return () => window.removeEventListener('helix:system-entry-reset', resetToSystemEntry);
  }, [resetToSystemEntry]);

  const handleOpenErrors = useCallback(() => {
    resetAppScrollTop();
    setLens('triage');
    setShowAdvancedLenses(false);
    setSystemMode('errors');
  }, [setLens]);

  const handleOpenMatterReplay = useCallback(() => {
    resetAppScrollTop();
    setLens('triage');
    setShowAdvancedLenses(false);
    setSystemMode('matter-replay');
  }, [setLens]);

  const handleOpenActivity = useCallback(() => {
    resetAppScrollTop();
    setLens('all');
    setShowAdvancedLenses(true);
    setSystemMode('activity');
  }, [setLens]);

  const handleOpenTasks = useCallback(() => {
    resetAppScrollTop();
    setLens('triage');
    setShowAdvancedLenses(false);
    setSystemMode('tasks');
  }, [setLens]);

  const handleOpenApiAudit = useCallback(() => {
    resetAppScrollTop();
    setLens('triage');
    setShowAdvancedLenses(false);
    setSystemMode('api-audit');
  }, [setLens]);

  const handleOpenInfrastructure = useCallback(() => {
    resetAppScrollTop();
    setLens('triage');
    setShowAdvancedLenses(false);
    setSystemMode('infrastructure');
  }, [setLens]);

  const handleOpenProjects = useCallback(() => {
    resetAppScrollTop();
    setLens('triage');
    setShowAdvancedLenses(false);
    setSystemMode('projects');
  }, [setLens]);

  const handleOpenAuditPack = useCallback(() => {
    resetAppScrollTop();
    setLens('triage');
    setShowAdvancedLenses(false);
    setSystemMode('audit-pack');
  }, [setLens]);

  const handleOpenDashboard = useCallback(() => {
    resetAppScrollTop();
    setShowAdvancedLenses(true);
    setLens('all');
    setSystemMode('dashboard');
  }, [setLens]);

  const handleSystemNavigatorChange = useCallback((key: string) => {
    switch (key as SystemMode) {
      case 'entry':
        resetToSystemEntry();
        break;
      case 'dashboard':
        handleOpenDashboard();
        break;
      case 'errors':
        handleOpenErrors();
        break;
      case 'matter-replay':
        handleOpenMatterReplay();
        break;
      case 'activity':
        handleOpenActivity();
        break;
      case 'tasks':
        handleOpenTasks();
        break;
      case 'api-audit':
        handleOpenApiAudit();
        break;
      case 'infrastructure':
        handleOpenInfrastructure();
        break;
      case 'projects':
        handleOpenProjects();
        break;
      case 'audit-pack':
        handleOpenAuditPack();
        break;
      default:
        resetToSystemEntry();
        break;
    }
  }, [
    handleOpenActivity,
    handleOpenApiAudit,
    handleOpenAuditPack,
    handleOpenDashboard,
    handleOpenErrors,
    handleOpenInfrastructure,
    handleOpenProjects,
    handleOpenTasks,
    handleOpenMatterReplay,
    resetToSystemEntry,
  ]);

  // Coordinated reveal — flips once when initial data arrives, never resets
  const [dashReady, setDashReady] = useState(false);
  useEffect(() => {
    if (!loading && !dashReady) setDashReady(true);
  }, [loading, dashReady]);

  const { setContent: setNavigatorContent } = useNavigatorActions();
  useEffect(() => {
    if (systemMode === 'entry') {
      setNavigatorContent(null);
      return () => setNavigatorContent(null);
    }

    setNavigatorContent(
      <div data-helix-region="roadmap/navigator">
        <NavigatorDetailBar
          onBack={resetToSystemEntry}
          backLabel="Back"
          tabs={SYSTEM_NAV_TABS}
          activeTab={systemMode}
          onTabChange={handleSystemNavigatorChange}
        />
      </div>,
    );
    return () => setNavigatorContent(null);
  }, [handleSystemNavigatorChange, resetToSystemEntry, setNavigatorContent, systemMode]);

  // Forms today count — refresh on stream updates
  useEffect(() => {
    const refresh = () => setFormsTodayCount(getFormsTodayCount());
    refresh();
    window.addEventListener(PROCESS_STREAM_UPDATED_EVENT, refresh);
    const tick = window.setInterval(refresh, 60000);
    return () => {
      window.removeEventListener(PROCESS_STREAM_UPDATED_EVENT, refresh);
      window.clearInterval(tick);
    };
  }, []);

  // Open signals count (dev group only)
  useEffect(() => {
    if (!canSeeForge) return;
    let disposed = false;
    const authHeaders: Record<string, string> = userInitials ? { 'x-user-initials': userInitials } : {};
    const load = async () => {
      try {
        const params = new URLSearchParams({ status: 'open', limit: '80' });
        if (userInitials) params.set('initials', userInitials);
        const res = await fetch(`/api/signals?${params.toString()}`, { headers: authHeaders });
        if (!res.ok) return;
        const data = await res.json();
        if (disposed) return;
        setSignalsOpenCount(Array.isArray(data?.items) ? data.items.length : 0);
      } catch {
        if (!disposed) setSignalsOpenCount(null);
      }
    };
    void load();
    const tick = window.setInterval(load, 120000);
    return () => {
      disposed = true;
      window.clearInterval(tick);
    };
  }, [canSeeForge, userInitials]);

  // Stashed briefs open count (dev-owner only)
  useEffect(() => {
    if (!isDevOwner) return;
    let disposed = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/stash-briefs?initials=${encodeURIComponent(userInitials)}`, {
          headers: { 'x-user-initials': userInitials },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (disposed) return;
        const open = Array.isArray(data?.items)
          ? data.items.filter((i: { status?: string; shipped?: boolean }) => !i.shipped && i.status === '\uD83D\uDFE1').length
          : 0;
        setBriefsOpenCount(open);
      } catch {
        if (!disposed) setBriefsOpenCount(null);
      }
    };
    void load();
    const tick = window.setInterval(load, 120000);
    return () => {
      disposed = true;
      window.clearInterval(tick);
    };
  }, [isDevOwner, userInitials]);

  useEffect(() => {
    activityItemsRef.current = activityItems;
  }, [activityItems]);

  useEffect(() => {
    let disposed = false;

    const loadReleaseNotes = async () => {
      const releaseNotesRes = await fetch('/api/release-notes');
      if (!releaseNotesRes.ok) {
        throw new Error(`Release notes HTTP ${releaseNotesRes.status}`);
      }

      const nextContent = await releaseNotesRes.text();
      if (!disposed) {
        setContent(nextContent);
      }
    };

    const loadActivityFeed = async (background = false) => {
      if (!disposed && background) {
        setActivityFeedRefreshing(true);
      }

      try {
        const activityFeedRes = await fetch('/api/activity-feed?limit=50');
        if (!activityFeedRes.ok) {
          throw new Error(`Operational feed unavailable (${activityFeedRes.status})`);
        }

        const activityFeed = await activityFeedRes.json();
        if (disposed) return;

        setActivityItems(Array.isArray(activityFeed?.items) ? activityFeed.items : []);
        setActivityFeedLastSyncAt(Date.now());
        setActivityFeedUsingSnapshot(false);
        setActivityError(null);
      } catch (err) {
        if (disposed) return;

        const hasCurrentItems = activityItemsRef.current.length > 0;
        if (hasCurrentItems) {
          setActivityFeedUsingSnapshot(true);
          setActivityError('Live refresh unavailable. Showing the last known activity feed.');
          return;
        }

        setActivityItems([]);
        setActivityError(err instanceof Error ? err.message : 'Failed to load operational feed');
      } finally {
        if (!disposed) {
          setActivityFeedRefreshing(false);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadActivityFeed(true);
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadActivityFeed(true);
      }
    }, 30000);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setActivityError(null);
        await Promise.all([loadReleaseNotes(), loadActivityFeed(false)]);
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Failed to load activity data');
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const allEntries = useMemo(() => parseChangelog(content), [content]);
  const filtered = useMemo(() => (filter === 'all' ? allEntries : allEntries.filter((entry) => entry.category === filter)), [allEntries, filter]);
  const groups = useMemo(() => groupByMonth(filtered), [filtered]);

  const toggleMonth = useCallback((key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleEntry = useCallback((entryKey: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryKey)) next.delete(entryKey);
      else next.add(entryKey);
      return next;
    });
  }, []);

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { feature: 0, improvement: 0, fix: 0, ops: 0 };
    allEntries.forEach((entry) => counts[entry.category]++);
    return counts;
  }, [allEntries]);

  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const mutedColour = isDarkMode ? colours.subtleGrey : colours.greyText;
  const accentColour = isDarkMode ? colours.accent : colours.highlight;
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const surfaceColour = isDarkMode ? 'rgba(255,255,255,0.06)' : colours.light.sectionBackground;

  if (showLiveMonitor && systemMode === 'entry') {
    return (
      <ActivityProvider value={layout}>
        <div style={containerStyles(isDarkMode)}>
          <SystemEntry isDarkMode={isDarkMode} opsPulse={opsPulse} onOpenErrors={handleOpenErrors} onOpenMatterReplay={handleOpenMatterReplay} onOpenActivity={handleOpenActivity} onOpenTasks={handleOpenTasks} onOpenApiAudit={handleOpenApiAudit} onOpenInfrastructure={handleOpenInfrastructure} onOpenProjects={handleOpenProjects} onOpenAuditPack={handleOpenAuditPack} onOpenDashboard={handleOpenDashboard} />
        </div>
      </ActivityProvider>
    );
  }

  if (showLiveMonitor && systemMode === 'errors') {
    return (
      <ActivityProvider value={layout}>
        <div style={containerStyles(isDarkMode)}>
          <SystemErrorsView
            viewerInitials={userInitials || null}
            isDarkMode={isDarkMode}
            onBack={resetToSystemEntry}
            onOpenDashboard={handleOpenDashboard}
          />
        </div>
      </ActivityProvider>
    );
  }

  if (showLiveMonitor && systemMode === 'matter-replay') {
    return (
      <ActivityProvider value={layout}>
        <div style={containerStyles(isDarkMode)}>
          <MatterReplayView
            viewerInitials={userInitials || null}
            isDarkMode={isDarkMode}
            onBack={resetToSystemEntry}
            onOpenDashboard={handleOpenDashboard}
          />
        </div>
      </ActivityProvider>
    );
  }

  if (showLiveMonitor && systemMode === 'activity') {
    return (
      <ActivityProvider value={layout}>
        <div style={containerStyles(isDarkMode)}>
          <SystemActivityLedgerView
            isDarkMode={isDarkMode}
            activityItems={activityItems}
            opsPulse={opsPulse}
            formsTodayCount={formsTodayCount}
            isRefreshing={activityFeedRefreshing}
            isSnapshot={activityFeedUsingSnapshot}
            lastLiveSyncAt={activityFeedLastSyncAt}
            error={activityError}
            onBack={resetToSystemEntry}
            onOpenDashboard={handleOpenDashboard}
            onOpenApiAudit={handleOpenApiAudit}
          />
        </div>
      </ActivityProvider>
    );
  }

  if (showLiveMonitor && systemMode === 'tasks') {
    return (
      <ActivityProvider value={layout}>
        <div style={containerStyles(isDarkMode)}>
          <SystemTasksView
            isDarkMode={isDarkMode}
            viewerInitials={userInitials || null}
            onBack={resetToSystemEntry}
            onOpenDashboard={handleOpenDashboard}
          />
        </div>
      </ActivityProvider>
    );
  }

  if (showLiveMonitor && systemMode === 'api-audit') {
    return (
      <ActivityProvider value={layout}>
        <div style={containerStyles(isDarkMode)}>
          <SystemActivityView
            viewerInitials={userInitials || null}
            isDarkMode={isDarkMode}
            onBack={resetToSystemEntry}
            onOpenDashboard={handleOpenDashboard}
          />
        </div>
      </ActivityProvider>
    );
  }

  if (showLiveMonitor && systemMode === 'infrastructure') {
    return (
      <ActivityProvider value={layout}>
        <div style={containerStyles(isDarkMode)}>
          <SystemInfrastructureView
            isDarkMode={isDarkMode}
            onBack={resetToSystemEntry}
            onOpenDashboard={handleOpenDashboard}
            onOpenAuditPack={handleOpenAuditPack}
          />
        </div>
      </ActivityProvider>
    );
  }

  if (showLiveMonitor && systemMode === 'projects') {
    return (
      <ActivityProvider value={layout}>
        <div style={containerStyles(isDarkMode)}>
          <SystemProjectsView
            isDarkMode={isDarkMode}
            viewerInitials={userInitials || null}
            isDevOwner={isDevOwner}
            onBack={resetToSystemEntry}
            onOpenDashboard={handleOpenDashboard}
            onOpenInfrastructure={handleOpenInfrastructure}
          />
        </div>
      </ActivityProvider>
    );
  }

  if (showLiveMonitor && systemMode === 'audit-pack') {
    return (
      <ActivityProvider value={layout}>
        <div style={containerStyles(isDarkMode)}>
          <SystemAuditPackView
            isDarkMode={isDarkMode}
            onBack={resetToSystemEntry}
            onOpenDashboard={handleOpenDashboard}
            onOpenInfrastructure={handleOpenInfrastructure}
          />
        </div>
      </ActivityProvider>
    );
  }

  return (
    <ActivityProvider value={layout}>
    <div style={containerStyles(isDarkMode)}>
      {/* ═══ Hero — title, lens chips, KPI tiles ═══ */}
      {(() => {
        const checksFailingCount = opsPulse.opsChecks?.failingCount ?? 0;
        const checksWarningCount = opsPulse.opsChecks?.warningCount ?? 0;
        const checksIssueCount = checksFailingCount + checksWarningCount;
        const checksTrackedCount = opsPulse.opsChecks?.totalTracked ?? 0;
        const cardActivityCount = activityItems.filter((item) => item.source === 'teams.card' || item.source === 'activity.cardlab' || item.source === 'activity.card.send' || item.source === 'activity.dm.send').length;
        const triageIssueCount = (opsPulse.errors?.length || 0) + (opsPulse.sessionTraces?.degraded ?? 0) + checksIssueCount;
        const triageTone: LensSpec['tone'] = (opsPulse.errors?.length || 0) > 0 || (opsPulse.sessionTraces?.degraded ?? 0) > 0 || checksFailingCount > 0
          ? 'danger'
          : (opsPulse.sessionTraces?.busy ?? 0) > 0 || checksWarningCount > 0
            ? 'warning'
            : opsPulse.connected
              ? 'success'
              : 'neutral';
        const advancedLenses: LensSpec[] = [
          { key: 'all', label: 'All', count: activityItems.length },
          { key: 'forms', label: 'Forms', count: formsTodayCount },
          { key: 'cards', label: 'Cards', count: cardActivityCount, tone: cardActivityCount > 0 ? 'warning' : 'neutral' },
          { key: 'matters', label: 'Matters' },
          { key: 'sync', label: 'Sync' },
          {
            key: 'checks',
            label: 'Checks',
            count: checksIssueCount > 0 ? checksIssueCount : undefined,
            tone: checksFailingCount > 0
              ? 'danger'
              : checksWarningCount > 0
                ? 'warning'
                : checksTrackedCount > 0
                  ? 'success'
                  : 'neutral',
          },
          {
            key: 'trace',
            label: 'Trace',
            count: opsPulse.sessionTraces?.active ?? 0,
            tone: (opsPulse.sessionTraces?.degraded ?? 0) > 0
              ? 'danger'
              : (opsPulse.sessionTraces?.busy ?? 0) > 0
                ? 'warning'
                : (opsPulse.sessionTraces?.active ?? 0) > 0
                  ? 'success'
                  : 'neutral',
          },
          {
            key: 'errors',
            label: 'Errors',
            count: opsPulse.errors?.length || 0,
            tone: (opsPulse.errors?.length || 0) > 0 ? 'danger' : 'neutral',
          },
          ...(canSeeForge
            ? [{
                key: 'signals' as ActivityLens,
                label: 'Signals',
                count: (signalsOpenCount ?? 0) > 0 ? signalsOpenCount ?? undefined : undefined,
                tone: (signalsOpenCount ?? 0) > 0 ? 'warning' as const : 'neutral' as const,
              }]
            : []),
          ...(canSeeForge
            ? [{
                key: 'forge' as ActivityLens,
                label: 'Controls',
                tone: 'success' as const,
              }]
            : []),
          ...(isDevOwner
            ? [{
                key: 'briefs' as ActivityLens,
                label: 'Briefs',
                count: briefsOpenCount ?? undefined,
                tone: (briefsOpenCount ?? 0) > 0 ? 'warning' as const : 'neutral' as const,
              }]
            : []),
          ...(isDevOwner
            ? [{
                key: 'actions' as ActivityLens,
                label: 'Actions',
                tone: 'success' as const,
              }]
            : []),
          ...(isDevOwner
            ? [{
                key: 'mechanisms' as ActivityLens,
                label: 'Mechanisms',
                tone: 'neutral' as const,
              }]
            : []),
          ...(canSeeForge
            ? [{
                key: 'audit' as ActivityLens,
                label: 'Audit',
                tone: 'neutral' as const,
              }]
            : []),
        ];
        const lenses: LensSpec[] = showLiveMonitor
          ? [
              {
                key: 'triage',
                label: 'System Health',
                count: triageIssueCount > 0 ? triageIssueCount : undefined,
                tone: triageTone,
              },
              ...(showAdvancedLenses ? advancedLenses : []),
            ]
          : [];

        const kpis: KpiSpec[] = showLiveMonitor && opsPulse.connected
          ? [
              {
                key: 'online',
                label: 'Online',
                value: opsPulse.presence?.online ?? 0,
                accent: colours.green,
                hint: opsPulse.sessions ? `${opsPulse.sessions.totalConnections} streams` : undefined,
                group: 'health',
              },
              {
                key: 'errors',
                label: 'Errors',
                value: opsPulse.errors?.length ?? 0,
                accent: (opsPulse.errors?.length ?? 0) > 0 ? colours.cta : colours.green,
                lens: 'errors',
                group: 'health',
              },
              ...((opsPulse.doubledApi?.length ?? 0) > 0
                ? [{
                    key: 'doubledApi',
                    label: '/api/api/ hits',
                    value: opsPulse.doubledApi?.length ?? 0,
                    accent: colours.cta,
                    hint: 'proxy regression',
                    lens: 'errors' as ActivityLens,
                    group: 'health' as const,
                  }]
                : []),
              {
                key: 'trace',
                label: 'Session trace',
                value: opsPulse.sessionTraces?.active ?? 0,
                accent: (opsPulse.sessionTraces?.degraded ?? 0) > 0
                  ? colours.cta
                  : (opsPulse.sessionTraces?.busy ?? 0) > 0
                    ? colours.orange
                    : colours.green,
                hint: opsPulse.sessionTraces
                  ? `${opsPulse.sessionTraces.degraded} degraded - ${opsPulse.sessionTraces.busy} busy`
                  : undefined,
                lens: 'trace',
                group: 'health',
              },
              ...(checksTrackedCount > 0
                ? [{
                    key: 'checks',
                    label: 'Route checks',
                    value: checksIssueCount > 0 ? checksIssueCount : checksTrackedCount,
                    accent: checksFailingCount > 0
                      ? colours.cta
                      : checksWarningCount > 0
                        ? colours.orange
                        : colours.green,
                    hint: `${checksFailingCount} fail - ${checksWarningCount} warn`,
                    lens: 'checks' as ActivityLens,
                    group: 'health' as const,
                  }]
                : []),
              {
                key: 'forms',
                label: 'Forms today',
                value: formsTodayCount,
                accent: formsTodayCount > 0 ? accentColour : undefined,
                lens: 'forms',
                group: 'workload',
              },
              ...(canSeeForge && signalsOpenCount != null
                ? [{
                    key: 'signals',
                    label: 'Signals open',
                    value: signalsOpenCount,
                    accent: signalsOpenCount > 0 ? colours.orange : colours.green,
                    lens: 'signals' as ActivityLens,
                    group: 'workload' as const,
                  }]
                : []),
              {
                key: 'rpm',
                label: 'RPM',
                value: opsPulse.pulse?.requests?.rpm ?? 0,
                accent: accentColour,
                hint: opsPulse.pulse ? `p95 ${opsPulse.pulse.requests.p95Ms}ms` : undefined,
                group: 'performance',
              },
              ...(isDevOwner && briefsOpenCount != null
                ? [{
                    key: 'briefs',
                    label: 'Briefs open',
                    value: briefsOpenCount,
                    accent: briefsOpenCount > 0 ? colours.orange : colours.green,
                    lens: 'briefs' as ActivityLens,
                    group: 'workload' as const,
                  }]
                : []),
            ]
          : !showLiveMonitor && formsTodayCount > 0
            ? [{ key: 'forms', label: 'Forms today', value: formsTodayCount, accent: accentColour }]
            : [];

        return (
          <>
            <ActivityHero
              isDarkMode={isDarkMode}
              title="System"
              connected={showLiveMonitor ? opsPulse.connected : null}
              showLiveDot={showLiveMonitor}
              lastSyncAt={activityFeedLastSyncAt}
              kpis={kpis}
              lenses={lenses}
              activeLens={lens}
              onLensChange={setLens}
              subtitle={
                userTier === 'devGroup'
                  ? 'Dev group preview'
                  : !showLiveMonitor
                  ? `${activityItems.length > 0 ? `${activityItems.length} live signals` : ''}${activityItems.length > 0 && allEntries.length > 0 ? ' - ' : ''}${allEntries.length > 0 ? `${allEntries.length} updates` : 'Platform updates and improvements'}`
                  : undefined
              }
            />
            {showLiveMonitor && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: -10, marginBottom: 14 }}>
                <button
                  type="button"
                  onClick={handleAdvancedLensesToggle}
                  style={{
                    border: `1px solid ${borderColour}`,
                    background: showAdvancedLenses ? `${accentColour}1F` : 'transparent',
                    color: showAdvancedLenses ? accentColour : mutedColour,
                    padding: '6px 10px',
                    borderRadius: 0,
                    cursor: 'pointer',
                    fontFamily: 'Raleway, sans-serif',
                    fontSize: 11,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {showAdvancedLenses ? 'Hide advanced tools' : 'Advanced tools'}
                </button>
              </div>
            )}
          </>
        );
      })()}

      {/* ═══ Alerts strip (conditional) ═══ */}
      {showLiveMonitor && showAdvancedLenses && (
        <ActivityAlertsStrip isDarkMode={isDarkMode} opsPulse={opsPulse} />
      )}

      {/* ═══ Tier 1: Dashboard shell — focal surface + side rail (dev group) ═══ */}
      {showLiveMonitor && (
        <div className={dashReady ? 'activity-cascade-1' : 'activity-cascade-pending'} style={{ marginBottom: 28 }}>
          <div className={`activity-shell ${lens === 'triage' && !showAdvancedLenses ? 'activity-shell--triage' : ''}`}>
            <div style={{ minWidth: 0 }}>
              <FocalSurface
                lens={lens}
                isDarkMode={isDarkMode}
                activityItems={activityItems}
                opsPulse={opsPulse}
                initials={userInitials || null}
                isDevOwner={isDevOwner}
                forgeViewMode={forgeViewMode}
                forgeCanToggle={isDevOwner}
                onForgeViewModeChange={handleForgeViewModeChange}
                canSeeSignals={canSeeForge}
                onSignalsCountChange={setSignalsOpenCount}
                selectedSessionId={layout.selectedSessionId}
                selectedErrorTs={layout.selectedErrorTs}
              />
            </div>
            {(showAdvancedLenses || lens !== 'triage') && (
              <div className="activity-shell-rail">
                <SideRail
                  isDarkMode={isDarkMode}
                  presence={opsPulse.presence}
                  sessions={opsPulse.sessions}
                  requests={opsPulse.requests || []}
                  pulse={opsPulse.pulse}
                  scheduler={opsPulse.scheduler}
                  sessionTraces={opsPulse.sessionTraces}
                  connected={opsPulse.connected}
                  layers={layout.layers}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Activity Feed (non-dev users — full width hero) ═══ */}
      {!showLiveMonitor && !loading && !error && (
        <div className={dashReady ? 'activity-cascade-1' : 'activity-cascade-pending'} style={{ marginBottom: 28 }}>
          <ActivityFeedSection
            items={activityItems}
            isDarkMode={isDarkMode}
            isRefreshing={activityFeedRefreshing}
            isSnapshot={activityFeedUsingSnapshot}
            lastLiveSyncAt={activityFeedLastSyncAt}
            error={activityError}
          />
          <div style={{ marginTop: 12 }}>
            <FormsStreamPanel isDarkMode={isDarkMode} />
          </div>
        </div>
      )}

      {/* Loading / Error */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
          <Spinner label="Loading activity..." />
        </div>
      )}
      {!loading && error && (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: colours.cta, background: isDarkMode ? `${colours.cta}14` : `${colours.cta}0D` }}>
          {error}
        </div>
      )}

      {/* ═══ Release Notes — promoted from the Tools drawer.
            Changelog is user-facing (everyone benefits from "what's new") so
            it sits above the operator-tools drawer rather than competing
            with API Heat / Card Lab / Boot Trace inside it. ═══ */}
      {!loading && !error && allEntries.length > 0 && (
        <section
          style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: `1px solid ${borderColour}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              marginBottom: 12,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: textColour,
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              Release notes
            </h3>
            <span style={{ fontSize: 11, color: mutedColour }}>{allEntries.length} entries</span>
          </div>
          <>
            {/* Filter chips */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                <FilterChip label="All" count={allEntries.length} active={filter === 'all'} colour={accentColour} isDarkMode={isDarkMode} onClick={() => setFilter('all')} />
                {(['feature', 'improvement', 'fix', 'ops'] as const).map((category) => (
                  <FilterChip
                    key={category}
                    label={CATEGORY_META[category].label}
                    count={catCounts[category]}
                    active={filter === category}
                    colour={isDarkMode ? CATEGORY_META[category].darkColour : CATEGORY_META[category].colour}
                    isDarkMode={isDarkMode}
                    onClick={() => setFilter(filter === category ? 'all' : category)}
                  />
                ))}
              </div>

              {/* Month groups */}
              {groups.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: mutedColour, fontSize: 13 }}>No updates found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 800 }}>
                  {groups.map((group) => {
                    const isExpanded = expandedMonths.has(group.monthKey);
                    return (
                      <div key={group.monthKey}>
                        <button
                          onClick={() => toggleMonth(group.monthKey)}
                          style={{ width: '100%', textAlign: 'left', padding: '12px 4px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontFamily: 'Raleway, sans-serif' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10, color: mutedColour, transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>
                              &#9654;
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: accentColour, padding: '1px 6px', borderRadius: 0, background: isDarkMode ? 'rgba(255,255,255,0.06)' : colours.grey, fontFamily: 'monospace', letterSpacing: '0.3px' }}>
                              {group.version}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: textColour, letterSpacing: '-0.2px' }}>{group.label}</span>
                          </div>
                          <span style={{ fontSize: 11, color: mutedColour, fontWeight: 600, padding: '2px 8px', borderRadius: 0, background: surfaceColour }}>
                            {group.entries.length}
                          </span>
                        </button>

                        {isExpanded && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginLeft: 8, borderLeft: `2px solid ${borderColour}`, paddingLeft: 16, marginBottom: 12 }}>
                            {group.entries.map((entry, index) => {
                              const entryKey = `${entry.date}-${entry.idx}`;
                              return (
                                <EntryRow
                                  key={`${entryKey}-${index}`}
                                  entry={entry}
                                  isDarkMode={isDarkMode}
                                  expanded={expandedEntries.has(entryKey)}
                                  onToggle={() => toggleEntry(entryKey)}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          </section>
      )}

      {/* ═══ Operator tools drawer (API Heat / Card Lab / Boot Trace) ═══
            Operator-only — visibility is gated by the tabs themselves
            (`showLiveMonitor`, `isLocalDev`, `showBootMonitor`). The drawer
            renders nothing when zero tabs are available. ═══ */}
      {!loading && !error && (
        <ToolsDrawer
          isDarkMode={isDarkMode}
          showLiveMonitor={showLiveMonitor}
          isLocalDev={isLocalDev}
          showBootMonitor={showBootMonitor}
          apiHeatContent={<ApiHeatSection requests={opsPulse.requests} isDarkMode={isDarkMode} />}
          cardLabContent={null}
          bootTraceContent={<HomeBootMonitor />}
        />
      )}
    </div>
    </ActivityProvider>
  );
};

export default Activity;