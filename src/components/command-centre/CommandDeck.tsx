import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colours } from '../../app/styles/colours';
import { UserData } from '../../app/functionality/types';
import { ErrorCollector } from '../ErrorTracker';
import { useFreshIds } from '../../hooks/useFreshIds';
import { buildStreamItem, createLedgerSeed, LEDGER_VISIBLE_STATUSES, prependStoredStreamItem } from '../../tabs/forms/processStreamStore';
import { streamStatusMeta } from '../../tabs/forms/processHubData';
import { CommandCentreTokens } from './types';
import {
    LOCAL_DATA_SCOPE_OPTIONS,
    LOCAL_SUPPORT_MODE_OPTIONS,
    LocalSupportSettings,
    defaultDataScopeForMode,
    getLocalSupportModeOption,
} from '../../app/localSupportMode';
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
type ToggleDef = { key: string; label: string; hint: string; enabled: boolean; accent: string; onToggle: () => void };
type ToolGroup = 'diag' | 'demo' | 'utils';
type Tool = { key: string; label: string; hint: string; icon: React.ReactNode; badge?: number; onClick: () => void; group: ToolGroup; tone?: 'default' | 'warning' };

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
    /** Dev owner (LZ only). Gates the dev clutter (Home view toggles, View as prod, UX overlay, Dev Dashboard, Error Tracker, Loading Debug, Error Preview, Migration). Other admins still see Demo mode + demo-lab tools. */
    isDevOwner?: boolean;
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
    isLocalDev?: boolean;
    localSupportSettings?: LocalSupportSettings;
    onLocalSupportModeChange?: (mode: LocalSupportSettings['mode']) => void;
    onLocalSupportDataScopeChange?: (dataScope: LocalSupportSettings['dataScope']) => void;
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
        isDevOwner = false,
        onDevDashboard, onErrorTracker, onErrorPreview, onLoadingDebug,
        onDemoPrompts, onMigrationTool, onOpenDemoMatter, onOpenReleaseNotesModal,
        openReportingUtility, setShowRefreshModal,
        isLocalDev = false, localSupportSettings, onLocalSupportModeChange, onLocalSupportDataScopeChange,
        isDarkMode, environment, environmentColour, sessionElapsed,
        onClose, showToast, tokens,
    } = props;

    const [healthExpanded, setHealthExpanded] = useState(false);
    const [errorCount, setErrorCount] = useState(0);
    const [recentErrors, setRecentErrors] = useState<TrackedError[]>([]);
    const freshErrorIds = useFreshIds(recentErrors, (err) => err.id);
    const currentSupportMode = localSupportSettings?.mode || 'full-live';
    const currentDataScope = localSupportSettings?.dataScope || defaultDataScopeForMode(currentSupportMode);
    const currentSupportModeOption = getLocalSupportModeOption(currentSupportMode);
    const showLocalSupportControls = Boolean(isLocalDev && localSupportSettings && onLocalSupportModeChange && onLocalSupportDataScopeChange);

    const handleLocalSupportModeSelect = useCallback((mode: LocalSupportSettings['mode']) => {
        onLocalSupportModeChange?.(mode);
        const option = getLocalSupportModeOption(mode);
        showToast(`${option.label} selected`, 'success');
    }, [onLocalSupportModeChange, showToast]);

    const handleLocalDataScopeSelect = useCallback((dataScope: LocalSupportSettings['dataScope']) => {
        onLocalSupportDataScopeChange?.(dataScope);
        const option = LOCAL_DATA_SCOPE_OPTIONS.find(item => item.id === dataScope);
        showToast(`${option?.label || 'Data scope'} selected`, dataScope === 'none' ? 'warning' : 'success');
    }, [onLocalSupportDataScopeChange, showToast]);

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
        const items: ToggleDef[] = [];

        items.push({
            key: 'demo',
            label: 'Demo mode',
            hint: 'Use seeded demo data and rehearsal states.',
            enabled: demoModeEnabled,
            accent: colours.green,
            onToggle: () => {
                const next = !demoModeEnabled;
                onToggleDemoMode?.(next);
                showToast(next ? 'Demo mode on' : 'Demo mode off', 'success');
            },
        });
        if (isDevOwner) {
            items.push({
                key: 'prod',
                label: 'View as prod',
                hint: 'Hide local-only dev affordances.',
                enabled: !!featureToggles.viewAsProd,
                accent: colours.cta,
                onToggle: () => {
                    const next = !featureToggles.viewAsProd;
                    onFeatureToggle?.('viewAsProd', next);
                    showToast(next ? 'Prod view on' : 'Prod view off', 'success');
                },
            });
        }
        if (isDevOwner && onFeatureToggle) {
            items.push({
                key: 'showOpsQueue',
                label: 'Ops queue on Home',
                hint: 'Expose the Home operations queue block.',
                enabled: !!featureToggles.showOpsQueue,
                accent: colours.cta,
                onToggle: () => {
                    const next = !featureToggles.showOpsQueue;
                    onFeatureToggle('showOpsQueue', next);
                    showToast(next ? 'Ops queue on' : 'Ops queue off', 'success');
                },
            });
            items.push({
                key: 'showHomeOpsCclDates',
                label: 'CCL dates on Home',
                hint: 'Show CCL operational dates in Home.',
                enabled: !!featureToggles.showHomeOpsCclDates,
                accent: isDarkMode ? colours.accent : colours.highlight,
                onToggle: () => {
                    const next = !featureToggles.showHomeOpsCclDates;
                    onFeatureToggle('showHomeOpsCclDates', next);
                    showToast(next ? 'CCL dates on' : 'CCL dates off', 'success');
                },
            });
            items.push({
                key: 'previewClaimedQueueHolding',
                label: 'Preview claimed holding state',
                hint: 'Open Prospects in the empty claimed-queue preview.',
                enabled: !!featureToggles.previewClaimedQueueHolding,
                accent: isDarkMode ? colours.accent : colours.highlight,
                onToggle: () => {
                    const next = !featureToggles.previewClaimedQueueHolding;
                    if (next && featureToggles.viewAsProd) {
                        showToast('Turn off prod view to preview the claimed holding state', 'warning');
                        return;
                    }
                    onFeatureToggle('previewClaimedQueueHolding', next);
                    if (next) {
                        try { window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab: 'enquiries' } })); } catch { /* ignore */ }
                    }
                    showToast(next ? 'Claimed holding preview on' : 'Claimed holding preview off', 'success');
                },
            });
        }
        // UX latency overlay — localStorage-backed toggle. Previously always-on
        // for LZ/AC after the first tracked interaction; now opt-in via this row.
        const uxOverlayOn = typeof window !== 'undefined'
            && (() => { try { return window.localStorage.getItem('helixUxDebug') === '1'; } catch { return false; } })();
        if (isDevOwner) items.push({
            key: 'uxLatencyOverlay',
            label: 'UX latency overlay',
            hint: 'Show local interaction timing feedback.',
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
        const readLs = (key: string, fallback = false) => {
            if (typeof window === 'undefined') return false;
            try {
                const stored = window.localStorage.getItem(key);
                if (stored === null) return fallback;
                return stored === '1';
            } catch {
                return fallback;
            }
        };
        const writeLs = (key: string, value: boolean) => {
            if (typeof window === 'undefined') return;
            try { window.localStorage.setItem(key, value ? '1' : '0'); } catch { /* ignore */ }
            try { window.dispatchEvent(new CustomEvent('helix:homeLayoutToggled', { detail: { key, value } })); } catch { /* ignore */ }
        };
        const replacePipelineOn = readLs('helix.home.replacePipelineAndMatters', true);
        if (isDevOwner) items.push({
            key: 'homeReplacePipeline',
            label: 'Replace pipeline/matters with ToDo',
            hint: 'Swap Home pipeline and matters for the To Do block.',
            enabled: replacePipelineOn,
            accent: isDarkMode ? colours.accent : colours.highlight,
            onToggle: () => {
                const next = !replacePipelineOn;
                writeLs('helix.home.replacePipelineAndMatters', next);
                showToast(next ? 'ToDo replaces pipeline/matters' : 'Pipeline/matters restored', 'success');
            },
        });
        return items;
    }, [demoModeEnabled, featureToggles, onFeatureToggle, onToggleDemoMode, isDarkMode, showToast, lsTick, isDevOwner]);

    /* ─── Tool grid definitions ───
       Consolidation 2026-04-21 (revised 2026-04-22):
       - `Replay Anims` stays out (no listener anywhere — dead).
       - Every other option surfaces here so the Tools popover is the single
         place every admin-only action lives. Demo chip is one-click toggle only.
       - Tools grouped: Diagnostics / Demo lab / Utilities.
    */
    const toolDefs = useMemo<Tool[]>(() => {
        const tools: Tool[] = [];
        if (isDevOwner) {
            tools.push({ key: 'devDash', label: 'Dev dashboard', hint: 'Inspect local app and route diagnostics.', icon: icons.dashboard, onClick: onDevDashboard, group: 'diag' });
            tools.push({ key: 'errorTracker', label: 'Error tracker', hint: 'Review runtime and boundary errors.', icon: icons.error, badge: errorCount || undefined, onClick: onErrorTracker, group: 'diag' });
            tools.push({ key: 'loadingDebug', label: 'Loading debug', hint: 'Exercise boot and loading surfaces.', icon: icons.loading, onClick: onLoadingDebug, group: 'diag' });
            if (onErrorPreview) {
                tools.push({ key: 'errorPreview', label: 'Preview error page', hint: 'Open the failure-state preview.', icon: icons.errorPreview, onClick: onErrorPreview, group: 'diag' });
            }
        }
        if (isDevOwner) {
            if (onOpenDemoMatter) {
                tools.push({ key: 'demoMatter', label: 'Demo matter', hint: 'Open the seeded matter walkthrough.', icon: icons.matter, onClick: () => onOpenDemoMatter(false), group: 'demo' });
            }
            tools.push({ key: 'prompts', label: 'Prompt seeds', hint: 'Open reusable demo prompt starters.', icon: icons.prompts, onClick: onDemoPrompts, group: 'demo' });
            tools.push({
                key: 'realtimePulse',
                label: 'Realtime pulse',
                hint: 'Trigger the live-update cue across demo surfaces.',
                icon: icons.activity,
                group: 'demo',
                onClick: () => {
                    try { window.dispatchEvent(new CustomEvent('demoRealtimePulse')); } catch { /* noop */ }
                    showToast('Pulse sent', 'success');
                },
            });
        }
        if (demoModeEnabled && isAdminEligible) {
            LEDGER_VISIBLE_STATUSES.forEach((status) => {
                tools.push({
                    key: `ledger-${status}`,
                    label: `Ledger ${streamStatusMeta[status].label}`,
                    hint: 'Seed a process-stream ledger example.',
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
                label: 'Reset demo state',
                hint: 'Clear rehearsal caches and switch demo mode off.',
                icon: icons.refresh,
                group: 'demo',
                tone: 'warning',
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
        tools.push({ key: 'activity', label: 'Activity', hint: 'Open the live operations activity monitor.', icon: icons.activity, onClick: () => openReportingUtility('logMonitor'), group: 'utils' });
        tools.push({ key: 'dataCentre', label: 'Data', hint: 'Open the data centre utility view.', icon: icons.data, onClick: () => openReportingUtility('dataCentre'), group: 'utils' });
        tools.push({ key: 'refresh', label: 'Refresh', hint: 'Open the manual refresh control.', icon: icons.refresh, onClick: () => { setShowRefreshModal(true); onClose(); }, group: 'utils' });
        if (isDevOwner) {
            tools.push({ key: 'migration', label: 'Migration', hint: 'Open the legacy migration utility.', icon: icons.migration, onClick: onMigrationTool, group: 'utils' });
        }
        if (onOpenReleaseNotesModal) {
            tools.push({ key: 'changelog', label: 'Changelog', hint: 'Review recent shipped changes.', icon: icons.release, onClick: () => { onOpenReleaseNotesModal(); onClose(); }, group: 'utils' });
        }
        return tools;
    }, [demoModeEnabled, errorCount, isAdminEligible, isDevOwner, onDevDashboard, onErrorTracker, onErrorPreview, onLoadingDebug, onDemoPrompts, onMigrationTool, onOpenDemoMatter, onOpenReleaseNotesModal, onToggleDemoMode, openReportingUtility, setShowRefreshModal, onClose, showToast]);

    const commandGroups = useMemo(() => ([
        { id: 'demo' as const, title: 'Demo and preview', hint: 'Rehearsal states, seeded data and visual previews.' },
        { id: 'diag' as const, title: 'Diagnostics', hint: 'Debug the current shell and spot runtime failures.' },
        { id: 'utils' as const, title: 'Utilities', hint: 'Operational shortcuts that open supporting views.' },
    ]), []);

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
                    <div className="cmd-deck__title-block">
                        <span className="cmd-deck__header-title">Session control</span>
                        <span className="cmd-deck__header-subtitle">Set context, inspect health, launch the right tool.</span>
                    </div>
                    <div className="cmd-deck__header-meta">
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: environmentColour, textTransform: 'uppercase', fontSize: 8, fontWeight: 700, letterSpacing: '0.4px' }}>
                            <span style={{ width: 4, height: 4, borderRadius: 999, background: environmentColour }} />
                            {environment}
                        </span>
                        <span style={{ opacity: 0.4, fontSize: 8 }} title="Time since this panel was first opened">{sessionElapsed}</span>
                    </div>
                    <button className="cmd-deck__close" onClick={onClose} aria-label="Close">
                        {icons.close}
                    </button>
                </div>

                {/* ─── Body ─── */}
                <div className="cmd-deck__body">
                    <section className="cmd-deck__section" data-helix-region="modal/session-control/system-state">
                        <div className="cmd-deck__section-head">
                            <div>
                                <div className="cmd-deck__section-label">System state</div>
                                <div className="cmd-deck__section-hint">Quick confidence checks for this session.</div>
                            </div>
                        </div>
                        <div className="cmd-deck__status">
                            <button type="button" className="cmd-deck__status-dot" onClick={() => setHealthExpanded(v => !v)} title="Server health">
                                <span className="cmd-deck__status-dot__indicator" style={{ background: healthDotColour(healthData, healthLoading) }} />
                                <span className="cmd-deck__status-dot__label">Server</span>
                                <span className="cmd-deck__status-dot__value">{healthLoading ? 'Checking' : healthData?.overall || 'Unknown'}</span>
                            </button>
                            <button type="button" className="cmd-deck__status-dot" onClick={() => { onRefreshRoutes(); showToast('Probing routes…', 'info'); }} title="Route status">
                                <span className="cmd-deck__status-dot__indicator" style={{ background: routeDotColour(routeResults) }} />
                                <span className="cmd-deck__status-dot__label">Routes</span>
                                <span className="cmd-deck__status-dot__value">Probe</span>
                            </button>
                            <div className="cmd-deck__status-dot" title="Data freshness">
                                <span className="cmd-deck__status-dot__indicator" style={{ background: dataDotColour(enquiriesLiveRefreshInFlight, enquiriesUsingSnapshot, enquiriesLastLiveSyncAt) }} />
                                <span className="cmd-deck__status-dot__label">Data</span>
                                <span className="cmd-deck__status-dot__value">{dataLabel(enquiriesLiveRefreshInFlight, enquiriesUsingSnapshot, enquiriesLastLiveSyncAt)}</span>
                            </div>
                        </div>
                    </section>

                    {showLocalSupportControls && (
                        <section className="cmd-deck__section cmd-deck__section--support" data-helix-region="modal/session-control/session-setup" aria-label="Session setup">
                            <div className="cmd-deck__support-head">
                                <div>
                                    <div className="cmd-deck__section-label">Session setup</div>
                                    <div className="cmd-deck__support-summary">
                                        {currentSupportModeOption.label} · {LOCAL_DATA_SCOPE_OPTIONS.find(option => option.id === currentDataScope)?.label || 'Data'}
                                    </div>
                                </div>
                                <span className="cmd-deck__support-badge">Local only</span>
                            </div>
                            <div className="cmd-deck__support-grid" role="radiogroup" aria-label="Support surface">
                                {LOCAL_SUPPORT_MODE_OPTIONS.map(option => {
                                    const active = option.id === currentSupportMode;
                                    const accent = option.id === 'full-live' ? colours.cta : option.id === 'fast-shell' ? colours.green : (isDarkMode ? colours.accent : colours.highlight);
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            className={`cmd-deck__support-card${active ? ' cmd-deck__support-card--active' : ''}`}
                                            style={active ? {
                                                borderColor: accent,
                                                background: `color-mix(in srgb, ${accent} 12%, var(--surface-card))`,
                                            } : undefined}
                                            title={option.hint}
                                            onClick={() => handleLocalSupportModeSelect(option.id)}
                                        >
                                            <span className="cmd-deck__support-card-title">{option.label}</span>
                                            <span className="cmd-deck__support-card-copy">{option.hint}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="cmd-deck__scope-grid" role="radiogroup" aria-label="Local data scope">
                                {LOCAL_DATA_SCOPE_OPTIONS.map(option => {
                                    const active = option.id === currentDataScope;
                                    const accent = option.id === 'team' ? colours.cta : option.id === 'mine' ? colours.highlight : colours.green;
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            className={`cmd-deck__scope-chip${active ? ' cmd-deck__scope-chip--active' : ''}`}
                                            style={active ? {
                                                borderColor: accent,
                                                background: `color-mix(in srgb, ${accent} 12%, var(--surface-card))`,
                                            } : undefined}
                                            title={option.hint}
                                            onClick={() => handleLocalDataScopeSelect(option.id)}
                                        >
                                            <span>{option.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="cmd-deck__support-note">Live boot scope is applied on reload. Runtime streams and tab warm-up follow this choice immediately.</div>
                        </section>
                    )}

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

                    {/* View tiles — each toggle is its own clickable tile with check + label.
                        Tile lights up with the toggle's accent colour when on. */}
                    <section className="cmd-deck__section" data-helix-region="modal/session-control/view-switches">
                        <div className="cmd-deck__section-head">
                            <div>
                                <div className="cmd-deck__section-label">View switches</div>
                                <div className="cmd-deck__section-hint">Temporary context changes for the current operator session.</div>
                            </div>
                        </div>
                        <div className="cmd-deck__view-grid" style={{ marginTop: 6 }}>
                            {toggleDefs.map(t => (
                                <button
                                    key={t.key}
                                    type="button"
                                    role="switch"
                                    aria-checked={t.enabled}
                                    onClick={t.onToggle}
                                    className={`cmd-deck__view-tile${t.enabled ? ' cmd-deck__view-tile--on' : ''}`}
                                    style={t.enabled ? {
                                        borderColor: t.accent,
                                        background: `color-mix(in srgb, ${t.accent} 12%, var(--surface-card))`,
                                    } : undefined}
                                    title={t.label}
                                >
                                    <span
                                        className="cmd-deck__view-check"
                                        style={t.enabled ? { background: t.accent, borderColor: t.accent } : undefined}
                                        aria-hidden="true"
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    </span>
                                    <span className="cmd-deck__view-copy">
                                        <span className="cmd-deck__view-label">{t.label}</span>
                                        <span className="cmd-deck__view-hint">{t.hint}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>

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

                    {/* Tools grouped by intent so the panel behaves like a control surface, not a mixed drawer. */}
                    {toolDefs.length > 0 && (
                        <div className="cmd-deck__command-stack" data-helix-region="modal/session-control/commands">
                            {commandGroups.map((group) => {
                                const groupTools = toolDefs.filter(tool => tool.group === group.id);
                                if (groupTools.length === 0) return null;
                                return (
                                    <section key={group.id} className="cmd-deck__section cmd-deck__section--commands">
                                        <div className="cmd-deck__section-head">
                                            <div>
                                                <div className="cmd-deck__section-label">{group.title}</div>
                                                <div className="cmd-deck__section-hint">{group.hint}</div>
                                            </div>
                                        </div>
                                        <div className="cmd-deck__command-grid">
                                            {groupTools.map((tool) => (
                                                <button
                                                    key={tool.key}
                                                    type="button"
                                                    className={`cmd-deck__card${tool.tone === 'warning' ? ' cmd-deck__card--warning' : ''}`}
                                                    onClick={tool.onClick}
                                                    title={tool.label}
                                                >
                                                    <span className="cmd-deck__card-icon">{tool.icon}</span>
                                                    <span className="cmd-deck__card-copy">
                                                        <span className="cmd-deck__card-label">{tool.label}</span>
                                                        <span className="cmd-deck__card-hint">{tool.hint}</span>
                                                    </span>
                                                    {tool.badge != null && tool.badge > 0 && (
                                                        <span className="cmd-deck__card-badge">{tool.badge}</span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default CommandDeck;
