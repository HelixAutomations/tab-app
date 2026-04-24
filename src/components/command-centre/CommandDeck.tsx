import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colours } from '../../app/styles/colours';
import { UserData } from '../../app/functionality/types';
import { ErrorCollector } from '../ErrorTracker';
import { useFreshIds } from '../../hooks/useFreshIds';
import { buildStreamItem, createLedgerSeed, LEDGER_VISIBLE_STATUSES, prependStoredStreamItem } from '../../tabs/forms/processStreamStore';
import { streamStatusMeta } from '../../tabs/forms/processHubData';
import { CommandCentreTokens } from './types';
import HelixToggleRow from '../controls/HelixToggleRow';
import './CommandDeck.css';

/* ─── Types ─── */
interface HealthComponent { status: string }
interface HealthData {
    overall: string;
    uptimeSeconds: number;
    memory: { rss: number; heapUsed: number };
    components: Record<string, HealthComponent>;
    sse: { clients: number };
}
interface RouteCheck { id: string; name: string; group: string; status: 'healthy' | 'unhealthy' | 'error'; responseMs?: number; error?: string }
interface HealthPayload { summary: { healthy: number; unhealthy: number; total: number }; durationMs: number; checks: RouteCheck[] }
type EnvResult = { env: 'local' | 'production'; status: 'ok' | 'fail' | 'loading'; data: HealthPayload | null; error: string | null };

interface TrackedError {
    id: string;
    timestamp: Date;
    message: string;
    type: 'runtime' | 'boundary' | 'promise';
    dismissed: boolean;
}

export interface CommandDeckProps {
    panelRef?: React.Ref<HTMLDivElement>;
    // Layout
    panelBottom?: number;
    // Status
    healthData: HealthData | null;
    healthLoading: boolean;
    routeResults: EnvResult[];
    onRefreshRoutes: () => void;
    enquiriesLiveRefreshInFlight: boolean;
    enquiriesUsingSnapshot: boolean;
    enquiriesLastLiveSyncAt: number | null;
    // Toggles
    featureToggles: Record<string, boolean>;
    onFeatureToggle?: (feature: string, enabled: boolean) => void;
    demoModeEnabled: boolean;
    onToggleDemoMode?: (enabled: boolean) => void;
    // Admin
    isAdminEligible: boolean;
    canSwitchUser: boolean;
    onUserChange?: (user: UserData) => void;
    availableUsers?: UserData[] | null;
    onReturnToAdmin?: () => void;
    originalAdminUser?: UserData | null;
    // Tool callbacks
    onDevDashboard: () => void;
    onErrorTracker: () => void;
    /** @deprecated Removed from Command Deck (consolidation 2026-04-21). Kept optional for back-compat with callers. */
    onErrorPreview?: () => void;
    onLoadingDebug: () => void;
    onDemoPrompts: () => void;
    onMigrationTool: () => void;
    onOpenDemoMatter?: (showCcl?: boolean) => void;
    /** @deprecated Changelog now reachable only via QuickActionsBar. Kept optional for back-compat. */
    onOpenReleaseNotesModal?: () => void;
    // Actions
    openReportingUtility: (view: 'logMonitor' | 'dataCentre') => void;
    setShowRefreshModal: (v: boolean) => void;
    // UI
    isDarkMode: boolean;
    environment: string;
    environmentColour: string;
    sessionElapsed: string;
    onClose: () => void;
    showToast: (message: string, tone?: 'info' | 'success' | 'warning') => void;
    tokens: CommandCentreTokens;
}

/* ─── Status dot colour helpers ─── */
const healthDotColour = (data: HealthData | null, loading: boolean): string => {
    if (loading) return colours.highlight;
    if (!data) return colours.subtleGrey;
    return data.overall === 'healthy' ? colours.green : data.overall === 'degraded' ? colours.orange : colours.cta;
};

const routeDotColour = (results: EnvResult[]): string => {
    const ok = results.filter(r => r.status === 'ok');
    if (ok.length === 0) return colours.subtleGrey;
    const allHealthy = ok.every(r => r.data && r.data.summary.unhealthy === 0);
    return allHealthy ? colours.green : colours.orange;
};

const dataDotColour = (inFlight: boolean, snapshot: boolean, lastSync: number | null): string => {
    if (inFlight) return colours.highlight;
    if (snapshot) return colours.orange;
    if (lastSync) return colours.green;
    return colours.subtleGrey;
};

const dataLabel = (inFlight: boolean, snapshot: boolean, lastSync: number | null): string => {
    if (inFlight) return 'Syncing…';
    if (snapshot) return 'Snapshot';
    if (lastSync) {
        const age = Math.round((Date.now() - lastSync) / 1000);
        return age < 60 ? 'Just now' : age < 3600 ? `${Math.floor(age / 60)}m ago` : `${Math.floor(age / 3600)}h ago`;
    }
    return 'Awaiting';
};

const componentDotColour = (status: string): string => {
    if (status === 'connected' || status === 'running') return colours.green;
    if (status === 'disconnected' || status === 'stopped') return colours.cta;
    return colours.subtleGrey;
};

/* ─── SVG Icons (inline, 16×16) ─── */
const icons = {
    dashboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    error: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>,
    errorPreview: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>,
    loading: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>,
    replay: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
    matter: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>,
    prompts: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    migration: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h16v16H4z"/><path d="M9 4v16"/><path d="M4 9h16"/></svg>,
    release: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>,
    close: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75"><path d="M18 6L6 18M6 6l12 12"/></svg>,
    settings: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 15v2"/><path d="M12 7v4"/><path d="M5 12h2"/><path d="M17 12h2"/><path d="M7.8 7.8l1.4 1.4"/><path d="M14.8 14.8l1.4 1.4"/><path d="M16.2 7.8l-1.4 1.4"/><path d="M9.2 14.8l-1.4 1.4"/></svg>,
    activity: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4h18v12H3z"/><path d="M7 20h10"/><path d="M9 8h6"/><path d="M9 12h3"/></svg>,
    data: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v4H4z"/><path d="M4 12h7v8H4z"/><path d="M13 12h7v3h-7z"/><path d="M13 17h7v3h-7z"/></svg>,
    refresh: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
    returnArrow: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
};

/* ─── Component ─── */
const CommandDeck: React.FC<CommandDeckProps> = (props) => {
    const {
        panelRef,
        panelBottom,
        healthData, healthLoading, routeResults, onRefreshRoutes,
        enquiriesLiveRefreshInFlight, enquiriesUsingSnapshot, enquiriesLastLiveSyncAt,
        featureToggles, onFeatureToggle, demoModeEnabled, onToggleDemoMode,
        isAdminEligible,
        onDevDashboard, onErrorTracker, onErrorPreview, onLoadingDebug,
        onDemoPrompts, onMigrationTool, onOpenDemoMatter, onOpenReleaseNotesModal,
        openReportingUtility, setShowRefreshModal,
        isDarkMode, environment, environmentColour, sessionElapsed,
        onClose, showToast, tokens,
    } = props;

    const [healthExpanded, setHealthExpanded] = useState(false);
    const [errorCount, setErrorCount] = useState(0);
    const [recentErrors, setRecentErrors] = useState<TrackedError[]>([]);
    const freshErrorIds = useFreshIds(recentErrors, (err) => err.id);

    // Bump counter so localStorage-backed toggles (UX overlay, Home layout
    // toggles) re-read their state after a click. Without this the write
    // succeeds but the checkbox only reflects the change on next panel open.
    const [lsTick, setLsTick] = useState(0);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const bump = () => setLsTick(t => t + 1);
        window.addEventListener('helix:uxDebugToggled', bump);
        window.addEventListener('helix:homeLayoutToggled', bump);
        window.addEventListener('storage', bump); // cross-tab sync
        return () => {
            window.removeEventListener('helix:uxDebugToggled', bump);
            window.removeEventListener('helix:homeLayoutToggled', bump);
            window.removeEventListener('storage', bump);
        };
    }, []);

    // Subscribe to error collector for live badge + inline strip
    useEffect(() => {
        const collector = ErrorCollector.getInstance();
        const update = (errors: TrackedError[]) => {
            const active = errors.filter(e => !e.dismissed);
            setErrorCount(active.length);
            setRecentErrors(active.slice(-3));
        };
        // Initial load
        update(collector.getErrors());
        const unsub = collector.subscribe(update);
        return unsub;
    }, []);

    /* ─── Toggle definitions ───
       Consolidation 2026-04-21:
       - Demo mode now lives canonically in UserBubble (any admin). Kept here too
         because LZ/AC use it as a quick context flip alongside Prod view.
       - `forceShowOpsQueue` moved to the Home bottom-left layout overlay so all
         Home view toggles share one surface.
    */
    const toggleDefs = useMemo(() => {
        const items: Array<{ key: string; label: string; enabled: boolean; accent: string; onToggle: () => void }> = [];

        items.push({
            key: 'demo',
            label: 'Demo mode',
            enabled: demoModeEnabled,
            accent: colours.green,
            onToggle: () => {
                const next = !demoModeEnabled;
                onToggleDemoMode?.(next);
                showToast(next ? 'Demo mode on' : 'Demo mode off', 'success');
            },
        });
        items.push({
            key: 'prod',
            label: 'View as prod',
            enabled: !!featureToggles.viewAsProd,
            accent: colours.cta,
            onToggle: () => {
                const next = !featureToggles.viewAsProd;
                onFeatureToggle?.('viewAsProd', next);
                showToast(next ? 'Prod view on' : 'Prod view off', 'success');
            },
        });
        if (onFeatureToggle) {
            items.push({
                key: 'showAttendance',
                label: 'Attendance strip',
                enabled: !!featureToggles.showAttendance,
                accent: colours.green,
                onToggle: () => {
                    const next = !featureToggles.showAttendance;
                    onFeatureToggle('showAttendance', next);
                    showToast(next ? 'Attendance on' : 'Attendance off', 'success');
                },
            });
            items.push({
                key: 'showHomeOpsCclDates',
                label: 'CCL dates on Home',
                enabled: !!featureToggles.showHomeOpsCclDates,
                accent: isDarkMode ? colours.accent : colours.highlight,
                onToggle: () => {
                    const next = !featureToggles.showHomeOpsCclDates;
                    onFeatureToggle('showHomeOpsCclDates', next);
                    showToast(next ? 'CCL dates on' : 'CCL dates off', 'success');
                },
            });
        }
        // UX latency overlay — localStorage-backed toggle. Previously always-on
        // for LZ/AC after the first tracked interaction; now opt-in via this row.
        const uxOverlayOn = typeof window !== 'undefined'
            && (() => { try { return window.localStorage.getItem('helixUxDebug') === '1'; } catch { return false; } })();
        items.push({
            key: 'uxLatencyOverlay',
            label: 'UX latency overlay',
            enabled: uxOverlayOn,
            accent: colours.cta,
            onToggle: () => {
                if (typeof window === 'undefined') return;
                const next = !uxOverlayOn;
                try {
                    if (next) window.localStorage.setItem('helixUxDebug', '1');
                    else window.localStorage.removeItem('helixUxDebug');
                } catch { /* ignore */ }
                try { window.dispatchEvent(new CustomEvent('helix:uxDebugToggled')); } catch { /* ignore */ }
                showToast(next ? 'UX overlay on' : 'UX overlay off', 'success');
            },
        });
        // Home layout toggle — the single surviving layout switch. `Replace
        // pipeline/matters with ToDo` swaps the pipeline+matters blocks for the
        // ImmediateActionsBar ToDo box; Home.tsx listens for
        // `helix:homeLayoutToggled` to re-sync from localStorage.
        const readLs = (key: string) => {
            if (typeof window === 'undefined') return false;
            try { return window.localStorage.getItem(key) === '1'; } catch { return false; }
        };
        const writeLs = (key: string, value: boolean) => {
            if (typeof window === 'undefined') return;
            try { window.localStorage.setItem(key, value ? '1' : '0'); } catch { /* ignore */ }
            try { window.dispatchEvent(new CustomEvent('helix:homeLayoutToggled', { detail: { key, value } })); } catch { /* ignore */ }
        };
        const replacePipelineOn = readLs('helix.home.replacePipelineAndMatters');
        items.push({
            key: 'homeReplacePipeline',
            label: 'Replace pipeline/matters with ToDo',
            enabled: replacePipelineOn,
            accent: isDarkMode ? colours.accent : colours.highlight,
            onToggle: () => {
                const next = !replacePipelineOn;
                writeLs('helix.home.replacePipelineAndMatters', next);
                showToast(next ? 'ToDo replaces pipeline/matters' : 'Pipeline/matters restored', 'success');
            },
        });
        return items;
    }, [demoModeEnabled, featureToggles, onFeatureToggle, onToggleDemoMode, isDarkMode, showToast, lsTick]);

    /* ─── Tool grid definitions ───
       Consolidation 2026-04-21 (revised 2026-04-22):
       - `Replay Anims` stays out (no listener anywhere — dead).
       - Every other option surfaces here so the Tools popover is the single
         place every admin-only action lives. Demo chip is one-click toggle only.
       - Tools grouped: Diagnostics / Demo lab / Utilities.
    */
    type ToolGroup = 'diag' | 'demo' | 'utils';
    type Tool = { key: string; label: string; icon: React.ReactNode; badge?: number; onClick: () => void; group: ToolGroup };
    const toolDefs = useMemo<Tool[]>(() => {
        const tools: Tool[] = [
            { key: 'devDash', label: 'Dev Dashboard', icon: icons.dashboard, onClick: onDevDashboard, group: 'diag' },
            { key: 'errorTracker', label: 'Error Tracker', icon: icons.error, badge: errorCount || undefined, onClick: onErrorTracker, group: 'diag' },
            { key: 'loadingDebug', label: 'Loading Debug', icon: icons.loading, onClick: onLoadingDebug, group: 'diag' },
        ];
        if (onErrorPreview) {
            tools.push({ key: 'errorPreview', label: 'Error Preview', icon: icons.errorPreview, onClick: onErrorPreview, group: 'diag' });
        }
        if (onOpenDemoMatter) {
            tools.push({ key: 'demoMatter', label: 'Demo Matter', icon: icons.matter, onClick: () => onOpenDemoMatter(false), group: 'demo' });
        }
        tools.push({ key: 'prompts', label: 'Prompt Seeds', icon: icons.prompts, onClick: onDemoPrompts, group: 'demo' });
        tools.push({
            key: 'realtimePulse',
            label: 'Realtime Pulse',
            icon: icons.activity,
            group: 'demo',
            onClick: () => {
                try { window.dispatchEvent(new CustomEvent('demoRealtimePulse')); } catch { /* noop */ }
                showToast('Pulse sent', 'success');
            },
        });
        if (demoModeEnabled && isAdminEligible) {
            LEDGER_VISIBLE_STATUSES.forEach((status) => {
                tools.push({
                    key: `ledger-${status}`,
                    label: `Ledger ${streamStatusMeta[status].label}`,
                    icon: icons.activity,
                    group: 'demo',
                    onClick: () => {
                        const seed = createLedgerSeed(status, 'demo');
                        prependStoredStreamItem(buildStreamItem({
                            lane: 'Request',
                            lastEvent: seed.lastEvent,
                            processTitle: seed.processTitle,
                            status,
                            summary: seed.summary,
                        }), 12);
                        showToast(`Added ${streamStatusMeta[status].label.toLowerCase()} ledger demo entry`, 'success');
                    },
                });
            });
            tools.push({
                key: 'resetDemo',
                label: 'Reset Demo State',
                icon: icons.refresh,
                group: 'demo',
                onClick: () => {
                    try {
                        const keys = Object.keys(localStorage).filter((k) => {
                            const l = k.toLowerCase();
                            return l.startsWith('helix.demo.') || l.startsWith('ccldraftcache.');
                        });
                        keys.forEach((k) => localStorage.removeItem(k));
                        localStorage.setItem('demoModeEnabled', 'false');
                    } catch { /* ignore */ }
                    onToggleDemoMode?.(false);
                    showToast('Demo state reset', 'success');
                },
            });
        }
        tools.push({ key: 'migration', label: 'Migration', icon: icons.migration, onClick: onMigrationTool, group: 'utils' });
        if (onOpenReleaseNotesModal) {
            tools.push({ key: 'changelog', label: 'Changelog', icon: icons.release, onClick: () => { onOpenReleaseNotesModal(); onClose(); }, group: 'utils' });
        }
        return tools;
    }, [demoModeEnabled, errorCount, isAdminEligible, onDevDashboard, onErrorTracker, onErrorPreview, onLoadingDebug, onDemoPrompts, onMigrationTool, onOpenDemoMatter, onOpenReleaseNotesModal, onToggleDemoMode, onClose, showToast]);

    const toolGroups = useMemo<{ id: ToolGroup; label: string; tools: Tool[] }[]>(() => {
        const groups: { id: ToolGroup; label: string; tools: Tool[] }[] = [
            { id: 'diag', label: 'Diagnostics', tools: [] },
            { id: 'demo', label: 'Demo lab', tools: [] },
            { id: 'utils', label: 'Utilities', tools: [] },
        ];
        toolDefs.forEach((t) => {
            const g = groups.find((x) => x.id === t.group);
            if (g) g.tools.push(t);
        });
        return groups.filter((g) => g.tools.length > 0);
    }, [toolDefs]);

    const envDotColour = useCallback((r: EnvResult): string => {
        if (r.status === 'loading') return colours.subtleGrey;
        if (r.status === 'fail') return colours.cta;
        return r.data && r.data.summary.unhealthy === 0 ? colours.green : colours.orange;
    }, []);

    return (
        <>
            {/* Scrim */}
            <div className="cmd-deck__scrim" onClick={onClose} />

            {/* Panel */}
            <div
                ref={panelRef}
                className="cmd-deck"
                style={{ bottom: panelBottom ?? 66 }}
                role="dialog"
                aria-modal="true"
                tabIndex={-1}
            >
                {/* ─── Header ─── */}
                <div className="cmd-deck__header">
                    <div className="cmd-deck__header-icon" style={{ color: environmentColour }}>
                        {icons.settings}
                    </div>
                    <span className="cmd-deck__header-title">Command Deck</span>
                    <div className="cmd-deck__header-meta">
                        <span className="cmd-deck__env-badge" style={{ color: environmentColour }}>
                            <span style={{ width: 4, height: 4, borderRadius: 999, background: environmentColour }} />
                            {environment}
                        </span>
                        <span style={{ opacity: 0.45, fontSize: 8 }}>{typeof window !== 'undefined' ? window.location.host : ''}</span>
                        <span style={{ opacity: 0.4, fontSize: 8 }}>{sessionElapsed}</span>
                    </div>
                    <button className="cmd-deck__close" onClick={onClose} aria-label="Close">
                        {icons.close}
                    </button>
                </div>

                {/* ─── Body ─── */}
                <div className="cmd-deck__body">
                    {/* Status strip */}
                    <div className="cmd-deck__status">
                        <div className="cmd-deck__status-dot" onClick={() => setHealthExpanded(v => !v)} title="Server health">
                            <span className="cmd-deck__status-dot__indicator" style={{ background: healthDotColour(healthData, healthLoading) }} />
                            <span className="cmd-deck__status-dot__label">Health</span>
                        </div>
                        <div className="cmd-deck__status-dot" onClick={() => { onRefreshRoutes(); showToast('Probing routes…', 'info'); }} title="Route status">
                            <span className="cmd-deck__status-dot__indicator" style={{ background: routeDotColour(routeResults) }} />
                            <span className="cmd-deck__status-dot__label">Routes</span>
                        </div>
                        <div className="cmd-deck__status-dot" title="Data freshness">
                            <span className="cmd-deck__status-dot__indicator" style={{ background: dataDotColour(enquiriesLiveRefreshInFlight, enquiriesUsingSnapshot, enquiriesLastLiveSyncAt) }} />
                            <span className="cmd-deck__status-dot__label">{dataLabel(enquiriesLiveRefreshInFlight, enquiriesUsingSnapshot, enquiriesLastLiveSyncAt)}</span>
                        </div>
                    </div>

                    {/* Health detail (inline expand) */}
                    <div className={`cmd-deck__health-detail ${healthExpanded ? 'cmd-deck__health-detail--expanded' : 'cmd-deck__health-detail--collapsed'}`}>
                        <div className="cmd-deck__health-grid">
                            {healthData ? (
                                <>
                                    {Object.entries(healthData.components).map(([name, comp]) => (
                                        <div key={name} className="cmd-deck__health-item">
                                            <span className="cmd-deck__status-dot__indicator" style={{ background: componentDotColour(comp.status), width: 5, height: 5 }} />
                                            <span>{name}</span>
                                        </div>
                                    ))}
                                    <div className="cmd-deck__health-meta">
                                        <span>Up {healthData.uptimeSeconds < 3600 ? `${Math.floor(healthData.uptimeSeconds / 60)}m` : `${Math.floor(healthData.uptimeSeconds / 3600)}h`}</span>
                                        <span>Heap {Math.round(healthData.memory.heapUsed / 1024 / 1024)}MB</span>
                                        <span>SSE {healthData.sse.clients}</span>
                                    </div>
                                    {/* Route checks (inline) */}
                                    {routeResults.map(r => (
                                        <React.Fragment key={r.env}>
                                            <div className="cmd-deck__health-item" style={{ gridColumn: '1 / -1', marginTop: 2 }}>
                                                <span className="cmd-deck__status-dot__indicator" style={{ background: envDotColour(r), width: 5, height: 5 }} />
                                                <span style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em' }}>{r.env}</span>
                                                {r.status === 'ok' && r.data && <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)' }}>{r.data.summary.healthy}/{r.data.summary.total} · {r.data.durationMs}ms</span>}
                                                {r.status === 'fail' && <span style={{ marginLeft: 'auto', fontSize: 9, color: colours.cta }}>{r.error}</span>}
                                                {r.status === 'loading' && <span style={{ marginLeft: 'auto', fontSize: 9, opacity: 0.6 }}>probing…</span>}
                                            </div>
                                            {r.status === 'ok' && r.data && r.data.checks.map(c => (
                                                <div key={c.id} className="cmd-deck__health-item" style={{ paddingLeft: 12 }}>
                                                    <span className="cmd-deck__status-dot__indicator" style={{ background: c.status === 'healthy' ? colours.green : colours.cta, width: 4, height: 4 }} />
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                                                    {c.responseMs != null && <span style={{ fontSize: 8, color: 'var(--text-muted)', flexShrink: 0 }}>{c.responseMs}ms</span>}
                                                </div>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </>
                            ) : (
                                <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-muted)' }}>
                                    {healthLoading ? 'Loading…' : 'Unavailable'}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Toggles — Helix toggle row chrome (matches Home layout overlay) */}
                    <div>
                        <div className="cmd-deck__section-label">Controls</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
                            {toggleDefs.map(t => (
                                <HelixToggleRow
                                    key={t.key}
                                    label={t.label}
                                    value={t.enabled}
                                    onChange={t.onToggle}
                                    isDarkMode={isDarkMode}
                                    accent={t.accent}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Inline errors (last 3) */}
                    {recentErrors.length > 0 && (
                        <div className="cmd-deck__errors">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span className="cmd-deck__section-label" style={{ color: 'var(--helix-cta)' }}>
                                    Errors ({errorCount})
                                </span>
                                <button className="cmd-deck__error-expand" type="button" onClick={onErrorTracker}>
                                    Open tracker →
                                </button>
                            </div>
                            {recentErrors.map(err => (
                                <div key={err.id} data-fresh={freshErrorIds.has(err.id) ? 'true' : undefined} className="cmd-deck__error-row">
                                    <span className={`cmd-deck__error-type cmd-deck__error-type--${err.type}`}>{err.type}</span>
                                    <span className="cmd-deck__error-msg">{err.message}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Tools — grouped (Diagnostics / Demo lab / Utilities) */}
                    {toolGroups.map((group) => (
                        <div key={group.id}>
                            <div className="cmd-deck__section-label">{group.label}</div>
                            <div className="cmd-deck__grid" style={{ marginTop: 6 }}>
                                {group.tools.map((tool) => (
                                    <button
                                        key={tool.key}
                                        type="button"
                                        className="cmd-deck__card"
                                        onClick={tool.onClick}
                                    >
                                        <span className="cmd-deck__card-icon">{tool.icon}</span>
                                        <span className="cmd-deck__card-label">{tool.label}</span>
                                        {tool.badge != null && tool.badge > 0 && (
                                            <span className="cmd-deck__card-badge">{tool.badge}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* ─── Footer ───
                    Switch user / Return-to-admin removed (UserBubble is canonical for those).
                    Refresh kept here as a one-click for dev/diagnostic flows.
                */}
                <div className="cmd-deck__footer">
                    <button type="button" className="cmd-deck__footer-btn" onClick={() => openReportingUtility('logMonitor')}>
                        {icons.activity}
                        Activity
                    </button>
                    <button type="button" className="cmd-deck__footer-btn" onClick={() => openReportingUtility('dataCentre')}>
                        {icons.data}
                        Data
                    </button>
                    <button type="button" className="cmd-deck__footer-btn" onClick={() => { setShowRefreshModal(true); onClose(); }}>
                        {icons.refresh}
                        Refresh
                    </button>
                </div>
            </div>
        </>
    );
};

export default CommandDeck;
