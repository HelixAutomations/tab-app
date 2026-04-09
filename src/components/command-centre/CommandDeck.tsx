import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { colours } from '../../app/styles/colours';
import { UserData } from '../../app/functionality/types';
import { ErrorCollector } from '../ErrorTracker';
import { CommandCentreTokens } from './types';
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
    onErrorPreview: () => void;
    onLoadingDebug: () => void;
    onDemoPrompts: () => void;
    onMigrationTool: () => void;
    onOpenDemoMatter?: (showCcl?: boolean) => void;
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
    ccl: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
    rateTracker: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
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
        isAdminEligible, canSwitchUser, onUserChange, availableUsers,
        onReturnToAdmin, originalAdminUser,
        onDevDashboard, onErrorTracker, onErrorPreview, onLoadingDebug,
        onDemoPrompts, onMigrationTool, onOpenDemoMatter, onOpenReleaseNotesModal,
        openReportingUtility, setShowRefreshModal,
        isDarkMode, environment, environmentColour, sessionElapsed,
        onClose, showToast, tokens,
    } = props;

    const [healthExpanded, setHealthExpanded] = useState(false);
    const [errorCount, setErrorCount] = useState(0);
    const [recentErrors, setRecentErrors] = useState<TrackedError[]>([]);

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

    /* ─── Toggle definitions ─── */
    const toggleDefs = useMemo(() => {
        const items: Array<{ key: string; label: string; enabled: boolean; colour: string; onToggle: () => void }> = [];

        items.push({
            key: 'demo',
            label: 'Demo',
            enabled: demoModeEnabled,
            colour: colours.green,
            onToggle: () => {
                const next = !demoModeEnabled;
                onToggleDemoMode?.(next);
                showToast(next ? 'Demo mode on' : 'Demo mode off', 'success');
            },
        });
        items.push({
            key: 'prod',
            label: 'Prod',
            enabled: !!featureToggles.viewAsProd,
            colour: colours.cta,
            onToggle: () => {
                const next = !featureToggles.viewAsProd;
                onFeatureToggle?.('viewAsProd', next);
                showToast(next ? 'Prod view on' : 'Prod view off', 'success');
            },
        });
        if (onFeatureToggle) {
            items.push({
                key: 'showAttendance',
                label: 'Attendance',
                enabled: !!featureToggles.showAttendance,
                colour: colours.green,
                onToggle: () => {
                    const next = !featureToggles.showAttendance;
                    onFeatureToggle('showAttendance', next);
                    showToast(next ? 'Attendance on' : 'Attendance off', 'success');
                },
            });
            items.push({
                key: 'showHomeOpsCclDates',
                label: 'CCL dates',
                enabled: !!featureToggles.showHomeOpsCclDates,
                colour: isDarkMode ? colours.accent : colours.highlight,
                onToggle: () => {
                    const next = !featureToggles.showHomeOpsCclDates;
                    onFeatureToggle('showHomeOpsCclDates', next);
                    showToast(next ? 'CCL dates on' : 'CCL dates off', 'success');
                },
            });
            items.push({
                key: 'forceShowOpsQueue',
                label: 'Ops Queue',
                enabled: !!featureToggles.forceShowOpsQueue,
                colour: colours.cta,
                onToggle: () => {
                    const next = !featureToggles.forceShowOpsQueue;
                    onFeatureToggle('forceShowOpsQueue', next);
                    showToast(next ? 'Ops queue on' : 'Ops queue off', 'success');
                },
            });
        }
        return items;
    }, [demoModeEnabled, featureToggles, onFeatureToggle, onToggleDemoMode, isDarkMode, showToast]);

    /* ─── Tool grid definitions ─── */
    const toolDefs = useMemo(() => {
        const tools: Array<{ key: string; label: string; icon: React.ReactNode; badge?: number; onClick: () => void }> = [
            { key: 'devDash', label: 'Dev Dashboard', icon: icons.dashboard, onClick: onDevDashboard },
            { key: 'errorTracker', label: 'Error Tracker', icon: icons.error, badge: errorCount || undefined, onClick: onErrorTracker },
            { key: 'errorPreview', label: 'Error Preview', icon: icons.errorPreview, onClick: onErrorPreview },
            { key: 'loadingDebug', label: 'Loading Debug', icon: icons.loading, onClick: onLoadingDebug },
            { key: 'replay', label: 'Replay Anims', icon: icons.replay, onClick: () => { window.dispatchEvent(new CustomEvent('replayHomeAnimations')); showToast('Replaying animations', 'info'); } },
        ];
        if (onOpenDemoMatter) {
            tools.push({ key: 'demoMatter', label: 'Demo Matter', icon: icons.matter, onClick: () => onOpenDemoMatter(false) });
            tools.push({ key: 'demoCcl', label: 'Demo CCL', icon: icons.ccl, onClick: () => onOpenDemoMatter(true) });
        }
        tools.push({ key: 'rateTracker', label: 'Rate Tracker', icon: icons.rateTracker, onClick: () => { window.dispatchEvent(new CustomEvent('openRateChangeModal')); onClose(); } });
        tools.push({ key: 'prompts', label: 'Prompt Seeds', icon: icons.prompts, onClick: onDemoPrompts });
        tools.push({ key: 'migration', label: 'Migration', icon: icons.migration, onClick: onMigrationTool });
        if (onOpenReleaseNotesModal) {
            tools.push({ key: 'release', label: 'Release Notes', icon: icons.release, onClick: () => { onOpenReleaseNotesModal(); onClose(); } });
        }
        return tools;
    }, [errorCount, onDevDashboard, onErrorTracker, onErrorPreview, onLoadingDebug, onDemoPrompts, onMigrationTool, onOpenDemoMatter, onOpenReleaseNotesModal, onClose, showToast]);

    const handleUserChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const sel = availableUsers?.find(u => u.Initials === e.target.value);
        if (sel && onUserChange) {
            onUserChange(sel);
            showToast(`Switched to ${sel.FullName || `${sel.First} ${sel.Last}`}`, 'success');
        }
    }, [availableUsers, onUserChange, showToast]);

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

                    {/* Toggles */}
                    <div>
                        <div className="cmd-deck__section-label">Controls</div>
                        <div className="cmd-deck__toggles" style={{ marginTop: 6 }}>
                            {toggleDefs.map(t => (
                                <button
                                    key={t.key}
                                    type="button"
                                    className={`cmd-deck__toggle${t.enabled ? ' cmd-deck__toggle--on' : ''}`}
                                    style={t.enabled ? { borderColor: `${t.colour}88`, background: `${t.colour}22` } : undefined}
                                    onClick={t.onToggle}
                                >
                                    <span
                                        className="cmd-deck__toggle-dot"
                                        style={{
                                            background: t.enabled ? t.colour : 'var(--text-muted)',
                                            boxShadow: t.enabled ? `0 0 6px ${t.colour}66` : 'none',
                                        }}
                                    />
                                    <span className="cmd-deck__toggle-label">{t.label}</span>
                                </button>
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
                                <div key={err.id} className="cmd-deck__error-row">
                                    <span className={`cmd-deck__error-type cmd-deck__error-type--${err.type}`}>{err.type}</span>
                                    <span className="cmd-deck__error-msg">{err.message}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Tools grid */}
                    <div>
                        <div className="cmd-deck__section-label">Tools</div>
                        <div className="cmd-deck__grid" style={{ marginTop: 6 }}>
                            {toolDefs.map(tool => (
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

                    {/* Admin strip */}
                    {isAdminEligible && canSwitchUser && onUserChange && availableUsers && (
                        <div>
                            <div className="cmd-deck__section-label">User</div>
                            <div className="cmd-deck__admin" style={{ marginTop: 6 }}>
                                <select
                                    className="cmd-deck__admin-select"
                                    onChange={handleUserChange}
                                    defaultValue=""
                                >
                                    <option value="">Switch user…</option>
                                    {availableUsers
                                        .filter(u => !u.status || String(u.status).toLowerCase() === 'active')
                                        .map(u => (
                                            <option key={u.Initials} value={u.Initials}>
                                                {u.FullName || `${u.First} ${u.Last}`}
                                            </option>
                                        ))}
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* ─── Footer ─── */}
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
                    {originalAdminUser && onReturnToAdmin && (
                        <button type="button" className="cmd-deck__footer-btn cmd-deck__footer-btn--cta" onClick={() => { onReturnToAdmin(); onClose(); }}>
                            {icons.returnArrow}
                            Return
                        </button>
                    )}
                </div>
            </div>
        </>
    );
};

export default CommandDeck;
