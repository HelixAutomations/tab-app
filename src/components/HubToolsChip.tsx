import React, { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { colours } from '../app/styles/colours';
import { useTheme } from '../app/functionality/ThemeContext';
import { UserData } from '../app/functionality/types';
import { isAdminUser } from '../app/admin';
import { BubbleToastTone, CommandCentreTokens } from './command-centre/types';
import CommandDeck from './command-centre/CommandDeck';

// Visible Suspense fallback + error boundary around the lazy CommandDeck chunk.
// If the chunk fails to load or throws on render, the user must SEE it rather
// than get a silent empty overlay (prior Suspense fallback was `null`).
class CommandDeckErrorBoundary extends React.Component<
    { onClose: () => void; children: React.ReactNode },
    { err: Error | null }
> {
    constructor(props: { onClose: () => void; children: React.ReactNode }) {
        super(props);
        this.state = { err: null };
    }
    static getDerivedStateFromError(err: Error) { return { err }; }
    componentDidCatch(err: Error, info: React.ErrorInfo) {
        // eslint-disable-next-line no-console
        console.error('[CommandDeck] render crash', err, info.componentStack);
    }
    render() {
        if (this.state.err) {
            return (
                <div role="alert" style={{
                    position: 'fixed', right: 18, bottom: 80, zIndex: 2099,
                    width: 360, padding: 16, background: '#1a0a0a',
                    border: '1px solid #ff6b6b', borderRadius: 2, color: '#ffdada',
                    fontFamily: 'Raleway, sans-serif', fontSize: 12, lineHeight: 1.5,
                }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, color: '#ff9b9b' }}>Controls panel crashed</div>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 200, overflow: 'auto' }}>
                        {this.state.err.message}
                    </pre>
                    <button type="button" onClick={this.props.onClose} style={{
                        marginTop: 10, padding: '4px 10px', background: '#3b1515',
                        border: '1px solid #ff6b6b', color: '#ffdada', cursor: 'pointer',
                    }}>Close</button>
                </div>
            );
        }
        return this.props.children as React.ReactElement;
    }
}

const CommandDeckLoading: React.FC<{ isDarkMode: boolean; panelBottom: number }> = ({ isDarkMode, panelBottom }) => (
    <div style={{
        position: 'fixed', right: 18, bottom: panelBottom, zIndex: 2099,
        padding: '10px 14px',
        background: isDarkMode ? 'rgba(6, 23, 51, 0.92)' : 'rgba(255, 255, 255, 0.95)',
        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(6,23,51,0.12)'}`,
        color: isDarkMode ? '#d1d5db' : '#374151',
        fontFamily: 'Raleway, sans-serif', fontSize: 11, borderRadius: 2,
    }}>Loading controls…</div>
);
// CommandDeckLoading kept (no longer used by CommandDeck since it's eagerly
// imported) — retained only if a future lazy reintroduction needs it.
void CommandDeckLoading;
// CommandDeckLoading kept (no longer used by CommandDeck since it's eagerly
// imported) \u2014 retained only if a future lazy reintroduction needs it.
void CommandDeckLoading;

// R7: lazy-load heavy modals so the floating chip mounts immediately and is
// clickable without waiting for ~8 modal trees + their transitive deps to parse.
// CommandDeck is eagerly imported (see top of file) — a prior lazy-load produced
// a silent "stuck on loading" when the dev chunk graph rotated under an open tab.
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const DemoPromptsModal = lazy(() => import('./DemoPromptsModal'));
const LoadingDebugModal = lazy(() => import('./debug/LoadingDebugModal'));
const ErrorTracker = lazy(() => import('./ErrorTracker').then((m) => ({ default: m.ErrorTracker })));
const RefreshDataModal = lazy(() => import('./RefreshDataModal'));
const LegacyMigrationTool = lazy(() => import('./LegacyMigrationTool'));
const ErrorScreenPreview = lazy(() => import('./command-centre/ErrorScreenPreview'));

interface HubToolsChipProps {
    user: UserData;
    isLocalDev?: boolean;
    bottomOffset?: number;
    availableUsers?: UserData[] | null;
    onUserChange?: (user: UserData) => void;
    onReturnToAdmin?: () => void;
    originalAdminUser?: UserData | null;
    onRefreshEnquiries?: () => Promise<void> | void;
    onRefreshMatters?: () => Promise<void> | void;
    onFeatureToggle?: (feature: string, enabled: boolean) => void;
    featureToggles?: Record<string, boolean>;
    demoModeEnabled?: boolean;
    onToggleDemoMode?: (enabled: boolean) => void;
    onOpenReleaseNotesModal?: () => void;
    enquiriesUsingSnapshot?: boolean;
    enquiriesLiveRefreshInFlight?: boolean;
    enquiriesLastLiveSyncAt?: number | null;
    onOpenDemoMatter?: (showCcl?: boolean) => void;
}

interface HealthComponent {
    status: string;
}

interface HealthData {
    overall: string;
    uptimeSeconds: number;
    memory: { rss: number; heapUsed: number };
    components: Record<string, HealthComponent>;
    sse: { clients: number };
}

interface RouteCheck {
    id: string;
    name: string;
    group: string;
    status: 'healthy' | 'unhealthy' | 'error';
    responseMs?: number;
    error?: string;
}
interface HealthPayload {
    summary: { healthy: number; unhealthy: number; total: number };
    durationMs: number;
    checks: RouteCheck[];
}
type EnvResult = { env: 'local' | 'production'; status: 'ok' | 'fail' | 'loading'; data: HealthPayload | null; error: string | null };

const HubToolsChip: React.FC<HubToolsChipProps> = ({
    user,
    isLocalDev = false,
    bottomOffset = 18,
    availableUsers,
    onUserChange,
    onReturnToAdmin,
    originalAdminUser,
    onRefreshEnquiries,
    onRefreshMatters,
    onFeatureToggle,
    featureToggles = {},
    demoModeEnabled = false,
    onToggleDemoMode,
    onOpenReleaseNotesModal,
    enquiriesUsingSnapshot = false,
    enquiriesLiveRefreshInFlight = false,
    enquiriesLastLiveSyncAt = null,
    onOpenDemoMatter,
}) => {
    const { isDarkMode } = useTheme();
    const [open, setOpen] = useState(false);
    const [showRefreshModal, setShowRefreshModal] = useState(false);
    const [showDevDashboard, setShowDevDashboard] = useState(false);
    const [showDemoPrompts, setShowDemoPrompts] = useState(false);
    const [showLoadingDebug, setShowLoadingDebug] = useState(false);
    const [showErrorTracker, setShowErrorTracker] = useState(false);
    const [showMigrationTool, setShowMigrationTool] = useState(false);
    const [showErrorPreview, setShowErrorPreview] = useState(false);
    const [toast, setToast] = useState<{ message: string; tone: BubbleToastTone } | null>(null);
    const [sessionElapsed, setSessionElapsed] = useState('');
    // UX latency overlay — localStorage-backed, mirrors CommandDeck toggle.
    // Local state so the satellite chip re-renders on toggle (from here or CommandDeck).
    const [uxOverlayOn, setUxOverlayOn] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        try { return window.localStorage.getItem('helixUxDebug') === '1'; } catch { return false; }
    });
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const sync = () => {
            try { setUxOverlayOn(window.localStorage.getItem('helixUxDebug') === '1'); } catch { /* ignore */ }
        };
        window.addEventListener('helix:uxDebugToggled', sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener('helix:uxDebugToggled', sync);
            window.removeEventListener('storage', sync);
        };
    }, []);
    const [healthData, setHealthData] = useState<HealthData | null>(null);
    const [healthLoading, setHealthLoading] = useState(false);
    const [routeResults, setRouteResults] = useState<EnvResult[]>([
        { env: 'local', status: 'loading', data: null, error: null },
        { env: 'production', status: 'loading', data: null, error: null },
    ]);
    const routeProbed = useRef(false);

    const chipRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedElement = useRef<HTMLElement | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionStartRef = useRef<number>(Date.now());
    const panelId = useId();

    const bg = isDarkMode ? colours.websiteBlue : '#ffffff';
    const controlRowBg = isDarkMode ? colours.darkBlue : colours.grey;
    const bgHover = isDarkMode ? colours.helixBlue : colours.light.cardHover;
    const borderLight = isDarkMode ? colours.dark.border : colours.highlightNeutral;
    const borderMedium = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
    const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
    const textBody = isDarkMode ? '#d1d5db' : colours.greyText;
    const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
    const accentPrimary = colours.blue;
    const ctaPrimary = colours.cta;
    const shadowSm = isDarkMode ? '0 1px 2px rgba(0, 3, 25, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.04)';
    const shadowMd = isDarkMode ? '0 10px 24px rgba(0, 3, 25, 0.35)' : '0 12px 28px rgba(6, 23, 51, 0.14)';

    const rowBaseBackground = isDarkMode
        ? `linear-gradient(90deg, rgba(54, 144, 206, 0.10) 0%, rgba(54, 144, 206, 0.00) 42%), ${controlRowBg}`
        : controlRowBg;
    const rowHoverBackground = isDarkMode
        ? `linear-gradient(90deg, rgba(54, 144, 206, 0.18) 0%, rgba(54, 144, 206, 0.00) 50%), ${bgHover}`
        : bgHover;
    const rowBaseShadow = isDarkMode ? 'inset 0 0 0 1px rgba(54, 144, 206, 0.05)' : 'none';
    const rowHoverShadow = isDarkMode ? '0 8px 18px rgba(0, 3, 25, 0.42)' : '0 4px 12px rgba(6, 23, 51, 0.08)';

    const environment = useMemo(() => {
        if (isLocalDev) return 'Local';
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        if (host.includes('staging') || host.includes('uat')) return 'Staging';
        return 'Production';
    }, [isLocalDev]);

    const environmentColour = environment === 'Production'
        ? colours.green
        : environment === 'Staging'
            ? colours.orange
            : (isDarkMode ? colours.accent : colours.blue);

    const closePanel = useCallback((restoreFocus = true) => {
        setOpen(false);
        if (restoreFocus && (previouslyFocusedElement.current || chipRef.current)) {
            (previouslyFocusedElement.current || chipRef.current)?.focus();
        }
        previouslyFocusedElement.current = null;
    }, []);

    const showToast = useCallback((message: string, tone: BubbleToastTone = 'info') => {
        setToast({ message, tone });
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
            setToast(null);
            toastTimerRef.current = null;
        }, 1800);
    }, []);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (!chipRef.current?.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) {
                closePanel();
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open, closePanel]);

    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closePanel();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [open, closePanel]);

    useEffect(() => {
        if (!open) return;
        const dialog = panelRef.current;
        if (!dialog) return;
        requestAnimationFrame(() => dialog.focus());
        const handleTab = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            const focusable = dialog.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        dialog.addEventListener('keydown', handleTab);
        return () => dialog.removeEventListener('keydown', handleTab);
    }, [open]);

    useEffect(() => {
        return () => {
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (!open) return;
        const tick = () => {
            const diff = Math.floor((Date.now() - sessionStartRef.current) / 1000);
            if (diff < 60) setSessionElapsed(`${diff}s`);
            else if (diff < 3600) setSessionElapsed(`${Math.floor(diff / 60)}m`);
            else setSessionElapsed(`${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`);
        };
        tick();
        const id = setInterval(tick, 30_000);
        return () => clearInterval(id);
    }, [open]);

    // Probe route health when panel opens
    const probeEnv = useCallback(async (env: 'local' | 'production'): Promise<EnvResult> => {
        const url = env === 'local' ? '/api/route-health' : '/api/route-health/production';
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15_000);
        try {
            const r = await fetch(url, { signal: ctrl.signal });
            clearTimeout(t);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data: HealthPayload = await r.json();
            return { env, status: 'ok', data, error: null };
        } catch (err: unknown) {
            clearTimeout(t);
            return { env, status: 'fail', data: null, error: err instanceof Error ? err.message : 'Unknown' };
        }
    }, []);
    const runRouteProbes = useCallback(async () => {
        setRouteResults([
            { env: 'local', status: 'loading', data: null, error: null },
            { env: 'production', status: 'loading', data: null, error: null },
        ]);
        const [local, prod] = await Promise.all([probeEnv('local'), probeEnv('production')]);
        setRouteResults([local, prod]);
    }, [probeEnv]);
    useEffect(() => {
        if (!open || routeProbed.current) return;
        routeProbed.current = true;
        runRouteProbes();
    }, [open, runRouteProbes]);

    // Fetch server health when panel is open
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const fetchHealth = async () => {
            setHealthLoading(true);
            try {
                const res = await fetch('/api/health/system');
                if (!cancelled && res.ok) {
                    const data = await res.json();
                    if (data.success) setHealthData(data);
                }
            } catch { /* swallow — health is best-effort */ }
            if (!cancelled) setHealthLoading(false);
        };
        fetchHealth();
        const id = setInterval(fetchHealth, 30_000);
        return () => { cancelled = true; clearInterval(id); };
    }, [open]);

    const tokens = useMemo<CommandCentreTokens>(() => ({
        isDarkMode,
        bg,
        bgHover,
        controlRowBg,
        borderLight,
        borderMedium,
        textPrimary,
        textBody,
        textMuted,
        accentPrimary,
        ctaPrimary,
        shadowSm,
        toggleRow: {
            display: 'flex' as const,
            alignItems: 'center' as const,
            justifyContent: 'space-between' as const,
            padding: '10px 12px',
            background: rowBaseBackground,
            border: `1px solid ${borderLight}`,
            borderLeft: '3px solid transparent',
            borderRadius: '2px',
            cursor: 'pointer' as const,
            boxShadow: rowBaseShadow,
            transform: 'translateY(0)',
            transition: 'background 0.2s ease, border-color 0.2s ease, border-left-color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease'
        },
        sectionTitle: {
            fontSize: 10,
            fontWeight: 600,
            color: textMuted,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
            marginBottom: 8,
            display: 'flex' as const,
            alignItems: 'center' as const,
            gap: 6
        },
        actionBtn: {
            width: '100%',
            padding: '10px 12px',
            background: rowBaseBackground,
            color: textBody,
            border: `1px solid ${borderLight}`,
            borderRadius: '2px',
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer' as const,
            display: 'flex' as const,
            alignItems: 'center' as const,
            gap: 6,
            boxShadow: rowBaseShadow,
            transform: 'translateY(0)',
            transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease'
        },
        applyRowHover: (el: HTMLElement) => {
            el.style.borderColor = borderMedium;
            el.style.borderLeftColor = isDarkMode ? colours.accent : colours.blue;
            el.style.background = rowHoverBackground;
            el.style.transform = 'translateX(2px)';
            el.style.boxShadow = rowHoverShadow;
        },
        resetRowHover: (el: HTMLElement) => {
            el.style.borderColor = borderLight;
            el.style.borderLeftColor = 'transparent';
            el.style.background = rowBaseBackground;
            el.style.transform = 'translateX(0)';
            el.style.boxShadow = rowBaseShadow;
        },
        applyInsetHover: (el: HTMLElement) => {
            el.style.borderLeftColor = isDarkMode ? colours.accent : colours.blue;
            el.style.background = isDarkMode ? `${colours.blue}08` : `${colours.blue}05`;
            el.style.transform = 'translateX(2px)';
        },
        resetInsetHover: (el: HTMLElement) => {
            el.style.borderLeftColor = 'transparent';
            el.style.background = 'transparent';
            el.style.transform = 'translateX(0)';
        },
        toggleSwitch: (on: boolean) => ({
            width: 40,
            height: 20,
            background: on ? accentPrimary : borderMedium,
            borderRadius: '2px',
            position: 'relative' as const,
            transition: 'all 0.2s ease',
            flexShrink: 0
        }),
        toggleKnob: (on: boolean) => ({
            width: 16,
            height: 16,
            background: '#fff',
            borderRadius: '1px',
            position: 'absolute' as const,
            top: 2,
            left: on ? 22 : 2,
            transition: 'all 0.2s ease',
            boxShadow: shadowSm
        }),
        showToast,
    }), [isDarkMode, bg, bgHover, controlRowBg, borderLight, borderMedium, textPrimary, textBody, textMuted, accentPrimary, ctaPrimary, shadowSm, rowBaseBackground, rowHoverBackground, rowBaseShadow, rowHoverShadow, showToast]);

    const isAdminEligible = isAdminUser(user) || isLocalDev || !!originalAdminUser;
    const canSwitchUser = isAdminUser(user) || !!originalAdminUser;
    const openHome = useCallback(() => {
        window.dispatchEvent(new CustomEvent('navigateToHome'));
    }, []);
    const handleDemoView = useCallback(() => {
        const next = !demoModeEnabled;
        onToggleDemoMode?.(next);
        showToast(next ? 'Demo mode on' : 'Demo mode off', 'success');
        if (next) openHome();
    }, [demoModeEnabled, onToggleDemoMode, openHome, showToast]);
    const handleProdView = useCallback(() => {
        const next = !featureToggles.viewAsProd;
        onFeatureToggle?.('viewAsProd', next);
        showToast(next ? 'Production view on' : 'Production view off', 'success');
        if (next) openHome();
    }, [featureToggles.viewAsProd, onFeatureToggle, openHome, showToast]);
    const handleDemoPulse = useCallback(() => {
        try { window.dispatchEvent(new CustomEvent('demoRealtimePulse')); } catch { /* noop */ }
        showToast('Pulse sent', 'success');
    }, [showToast]);
    // Tray chips are one-click invocations. Multi-option demo controls live
    // inside the Tools popover (CommandDeck → Demo lab).
    void handleDemoPulse;
    const handleOpenRefresh = useCallback(() => {
        setShowRefreshModal(true);
    }, []);
    const handleToggleUxOverlay = useCallback(() => {
        if (typeof window === 'undefined') return;
        const next = !uxOverlayOn;
        try {
            if (next) window.localStorage.setItem('helixUxDebug', '1');
            else window.localStorage.removeItem('helixUxDebug');
        } catch { /* ignore */ }
        try { window.dispatchEvent(new CustomEvent('helix:uxDebugToggled')); } catch { /* ignore */ }
        setUxOverlayOn(next);
        showToast(next ? 'UX overlay on' : 'UX overlay off', 'success');
    }, [uxOverlayOn, showToast]);
    // Prefetch the lazy modal chunks on Tools hover so the first click inside
    // the panel doesn't pay the parse cost. Fire-and-forget; errors ignored.
    const prefetchedRef = useRef(false);
    const prefetchToolsChunks = useCallback(() => {
        if (prefetchedRef.current) return;
        prefetchedRef.current = true;
        void import('./AdminDashboard');
        void import('./DemoPromptsModal');
        void import('./debug/LoadingDebugModal');
        void import('./ErrorTracker');
        void import('./RefreshDataModal');
        void import('./LegacyMigrationTool');
        void import('./command-centre/ErrorScreenPreview');
    }, []);
    const stripHoverBg = isDarkMode ? 'rgba(255, 255, 255, 0.07)' : 'rgba(6, 23, 51, 0.05)';
    const stripHoverText = isDarkMode ? '#ffffff' : colours.helixBlue;
    const chipBottom = bottomOffset;
    const panelBottom = bottomOffset + 48;
    // Satellite chip chrome — Demo + Prod are secondary one-click toggles that
    // live inside the Tools "container". Icon + short label, smooth hover expand.
    const stripSegmentBase: React.CSSProperties = {
        position: 'relative',
        height: 26,
        padding: '0 9px',
        background: 'transparent',
        border: 'none',
        borderRadius: 999,
        color: textPrimary,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        opacity: 0.82,
        fontFamily: 'Raleway, sans-serif',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
        transition: 'color 0.2s ease, opacity 0.2s ease, background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
    };
    // Tools button — primary container affordance. Filled background, slightly
    // taller, sits as the visual "box" that holds the satellite toggles.
    const toolsButtonBase: React.CSSProperties = {
        position: 'relative',
        height: 28,
        padding: '0 11px 0 10px',
        background: isDarkMode ? 'rgba(135, 243, 243, 0.10)' : 'rgba(54, 144, 206, 0.10)',
        border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.28)' : 'rgba(54, 144, 206, 0.28)'}`,
        borderRadius: 999,
        color: isDarkMode ? colours.accent : colours.highlight,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontFamily: 'Raleway, sans-serif',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        transition: 'color 0.2s ease, background 0.2s ease, border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
    };
    const openReportingUtility = useCallback((view: 'logMonitor' | 'dataCentre') => {
        window.dispatchEvent(new CustomEvent('navigateToReporting', { detail: { view } }));
        closePanel();
    }, [closePanel]);

    return (
        <>
            {showRefreshModal && (
                <Suspense fallback={null}>
                <RefreshDataModal
                    isOpen={showRefreshModal}
                    onClose={() => setShowRefreshModal(false)}
                    onConfirm={async ({ clientCaches, enquiries, matters, reporting }) => {
                        try {
                            if (clientCaches) {
                                Object.keys(localStorage).filter(k => {
                                    const l = k.toLowerCase();
                                    return l.startsWith('enquiries-') || l.startsWith('normalizedmatters-') ||
                                        l.startsWith('vnetmatters-') || l.startsWith('matters-') ||
                                        l === 'allmatters' || l === 'teamdata' || l.includes('outstandingbalancesdata');
                                }).forEach(k => localStorage.removeItem(k));
                            }
                            const scopes: string[] = [];
                            if (reporting) scopes.push('reporting');
                            if (enquiries) scopes.push('enquiries');
                            if (matters) scopes.push('unified');
                            for (const scope of scopes) {
                                try {
                                    await fetch('/api/cache/clear-cache', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ scope })
                                    });
                                } catch {}
                            }
                            if (enquiries && onRefreshEnquiries) await onRefreshEnquiries();
                            if (matters && onRefreshMatters) await onRefreshMatters();
                        } finally {
                            setShowRefreshModal(false);
                            showToast('Refresh complete', 'success');
                        }
                    }}
                />
                </Suspense>
            )}

            <div
                style={{
                    position: 'fixed',
                    right: 18,
                    bottom: chipBottom,
                    zIndex: 2100,
                    display: 'flex',
                    flexDirection: 'column' as const,
                    alignItems: 'flex-end',
                    gap: 4,
                    pointerEvents: 'none',
                }}>
            {/* Floating PROD badge removed 2026-04-24 — the Local/Prod satellite
                chip inside the tray already surfaces the active view. The badge
                was narrower than the tray, which made the tray's left edge stick
                out past the "header" and read as a thick left border. */}
            <div
                style={{
                    display: 'flex',
                    pointerEvents: 'auto',
                    alignItems: 'center',
                    gap: 2,
                    justifyContent: 'flex-end',
                    padding: '3px 4px',
                    background: isDarkMode ? 'rgba(6, 23, 51, 0.84)' : 'rgba(255, 255, 255, 0.90)',
                    border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.10)' : 'rgba(6, 23, 51, 0.10)'}`,
                    borderRadius: 999,
                    boxShadow: isDarkMode ? '0 10px 24px rgba(0, 3, 25, 0.24)' : '0 10px 24px rgba(6, 23, 51, 0.10)',
                    backdropFilter: 'blur(14px)',
                    WebkitBackdropFilter: 'blur(14px)',
                    transform: 'scale(1)',
                    transition: 'transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-1px) scale(1.015)';
                    e.currentTarget.style.boxShadow = isDarkMode ? '0 14px 30px rgba(0, 3, 25, 0.30)' : '0 14px 30px rgba(6, 23, 51, 0.13)';
                    e.currentTarget.style.background = isDarkMode ? 'rgba(6, 23, 51, 0.90)' : 'rgba(255, 255, 255, 0.95)';
                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255, 255, 255, 0.14)' : 'rgba(6, 23, 51, 0.14)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = isDarkMode ? '0 10px 24px rgba(0, 3, 25, 0.24)' : '0 10px 24px rgba(6, 23, 51, 0.10)';
                    e.currentTarget.style.background = isDarkMode ? 'rgba(6, 23, 51, 0.84)' : 'rgba(255, 255, 255, 0.90)';
                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255, 255, 255, 0.10)' : 'rgba(6, 23, 51, 0.10)';
                }}
            >
                {/* Demo — satellite one-click chip. Toggles demo mode only.
                    Multi-option demo surface lives in Tools → Demo lab. */}
                <button
                    type="button"
                    onClick={handleDemoView}
                    style={{
                        ...stripSegmentBase,
                        color: demoModeEnabled ? colours.green : textPrimary,
                        opacity: demoModeEnabled ? 1 : 0.82,
                        background: demoModeEnabled ? (isDarkMode ? 'rgba(32, 178, 108, 0.14)' : 'rgba(32, 178, 108, 0.10)') : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        if (!demoModeEnabled) {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.color = stripHoverText;
                            e.currentTarget.style.background = stripHoverBg;
                        }
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        if (!demoModeEnabled) {
                            e.currentTarget.style.opacity = '0.82';
                            e.currentTarget.style.color = textPrimary;
                            e.currentTarget.style.background = 'transparent';
                        }
                    }}
                    aria-label={demoModeEnabled ? 'Turn off demo mode' : 'Turn on demo mode'}
                    title={demoModeEnabled ? 'Demo mode on' : 'Demo mode'}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
                        <path d="M19 14l.8 2 2 .8-2 .8L19 20l-.8-2-2-.8 2-.8z" />
                    </svg>
                    <span>Demo</span>
                </button>
                {/* Production view — satellite one-click chip */}
                <button
                    type="button"
                    onClick={handleProdView}
                    style={{
                        ...stripSegmentBase,
                        color: featureToggles.viewAsProd ? colours.cta : textPrimary,
                        opacity: featureToggles.viewAsProd ? 1 : 0.82,
                        background: featureToggles.viewAsProd ? (isDarkMode ? 'rgba(214, 85, 65, 0.14)' : 'rgba(214, 85, 65, 0.10)') : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        if (!featureToggles.viewAsProd) {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.color = stripHoverText;
                            e.currentTarget.style.background = stripHoverBg;
                        }
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        if (!featureToggles.viewAsProd) {
                            e.currentTarget.style.opacity = '0.82';
                            e.currentTarget.style.color = textPrimary;
                            e.currentTarget.style.background = 'transparent';
                        }
                    }}
                    aria-label={featureToggles.viewAsProd ? 'Switch to local view' : 'Switch to production view'}
                    title={featureToggles.viewAsProd ? 'Viewing as production — click for local' : 'Viewing as local — click for production'}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    <span>{featureToggles.viewAsProd ? 'Prod' : 'Local'}</span>
                </button>
                {/* Refresh — satellite chip. High-frequency "clear caches + re-fetch"
                    utility; opens the RefreshDataModal that already lives in this file. */}
                <button
                    type="button"
                    onClick={handleOpenRefresh}
                    style={{
                        ...stripSegmentBase,
                        padding: '0 9px',
                        color: textPrimary,
                        opacity: 0.82,
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.color = stripHoverText;
                        e.currentTarget.style.background = stripHoverBg;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.opacity = '0.82';
                        e.currentTarget.style.color = textPrimary;
                        e.currentTarget.style.background = 'transparent';
                    }}
                    aria-label="Refresh data"
                    title="Clear caches &amp; refresh"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 4v6h-6" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    <span>Refresh</span>
                </button>
                {/* UX latency overlay — satellite chip. Mirrors the CommandDeck
                    toggle; localStorage-backed so page reload preserves state. */}
                <button
                    type="button"
                    onClick={handleToggleUxOverlay}
                    style={{
                        ...stripSegmentBase,
                        color: uxOverlayOn ? colours.cta : textPrimary,
                        opacity: uxOverlayOn ? 1 : 0.82,
                        background: uxOverlayOn ? (isDarkMode ? 'rgba(214, 85, 65, 0.14)' : 'rgba(214, 85, 65, 0.10)') : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        if (!uxOverlayOn) {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.color = stripHoverText;
                            e.currentTarget.style.background = stripHoverBg;
                        }
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        if (!uxOverlayOn) {
                            e.currentTarget.style.opacity = '0.82';
                            e.currentTarget.style.color = textPrimary;
                            e.currentTarget.style.background = 'transparent';
                        }
                    }}
                    aria-label={uxOverlayOn ? 'Turn off UX latency overlay' : 'Turn on UX latency overlay'}
                    title={uxOverlayOn ? 'UX latency overlay on' : 'UX latency overlay'}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                    </svg>
                    <span>UX</span>
                </button>
                {/* Tools — primary container. Filled chip with label, env-health dot.
                    This is the "box" — Demo + Prod are satellites sitting inside the pill. */}
                <button
                    ref={chipRef}
                    onClick={() => {
                        if (open) closePanel();
                        else {
                            previouslyFocusedElement.current = document.activeElement as HTMLElement;
                            setOpen(true);
                        }
                    }}
                    style={{
                        ...toolsButtonBase,
                        marginLeft: 2,
                        background: open
                            ? (isDarkMode ? 'rgba(135, 243, 243, 0.18)' : 'rgba(54, 144, 206, 0.16)')
                            : toolsButtonBase.background,
                        borderColor: open
                            ? (isDarkMode ? 'rgba(135, 243, 243, 0.45)' : 'rgba(54, 144, 206, 0.45)')
                            : (toolsButtonBase.border as string).includes('rgba') ? (isDarkMode ? 'rgba(135, 243, 243, 0.28)' : 'rgba(54, 144, 206, 0.28)') : undefined,
                        boxShadow: open ? (isDarkMode ? '0 4px 14px rgba(135, 243, 243, 0.18)' : '0 4px 14px rgba(54, 144, 206, 0.18)') : 'none',
                    }}
                    onMouseEnter={(e) => {
                        prefetchToolsChunks();
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.16)' : 'rgba(54, 144, 206, 0.14)';
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(135, 243, 243, 0.38)' : 'rgba(54, 144, 206, 0.38)';
                        e.currentTarget.style.boxShadow = isDarkMode ? '0 4px 14px rgba(135, 243, 243, 0.18)' : '0 4px 14px rgba(54, 144, 206, 0.18)';
                    }}
                    onFocus={prefetchToolsChunks}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        if (!open) {
                            e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.10)' : 'rgba(54, 144, 206, 0.10)';
                            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(135, 243, 243, 0.28)' : 'rgba(54, 144, 206, 0.28)';
                            e.currentTarget.style.boxShadow = 'none';
                        }
                    }}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-controls={panelId}
                    aria-label={`${user.FullName || user.Initials || 'User'} controls`}
                    title={`${user.FullName || user.Initials || 'User'} controls`}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>{user.Initials || 'Me'}</span>
                    {/* Environment-health dot, absolute top-right corner */}
                    <span style={{
                        position: 'absolute',
                        top: -2,
                        right: -2,
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: enquiriesLiveRefreshInFlight ? colours.highlight
                            : enquiriesUsingSnapshot ? colours.orange
                            : (healthData?.overall === 'healthy' || !healthData) && enquiriesLastLiveSyncAt ? colours.green
                            : healthData?.overall === 'degraded' ? colours.orange
                            : colours.subtleGrey,
                        boxShadow: `0 0 0 2px ${isDarkMode ? 'rgba(6, 23, 51, 0.92)' : 'rgba(255, 255, 255, 0.95)'}`,
                        transition: 'background 0.3s ease',
                    }} />
                </button>
            </div>
            </div>

            {open && typeof document !== 'undefined' && createPortal(
                <CommandDeckErrorBoundary onClose={() => closePanel()}>
                <CommandDeck
                    panelRef={panelRef}
                    panelBottom={panelBottom}
                    healthData={healthData}
                    healthLoading={healthLoading}
                    routeResults={routeResults}
                    onRefreshRoutes={runRouteProbes}
                    enquiriesLiveRefreshInFlight={enquiriesLiveRefreshInFlight}
                    enquiriesUsingSnapshot={enquiriesUsingSnapshot}
                    enquiriesLastLiveSyncAt={enquiriesLastLiveSyncAt}
                    featureToggles={featureToggles}
                    onFeatureToggle={onFeatureToggle}
                    demoModeEnabled={demoModeEnabled}
                    onToggleDemoMode={onToggleDemoMode}
                    isAdminEligible={isAdminEligible}
                    canSwitchUser={canSwitchUser}
                    onUserChange={onUserChange}
                    availableUsers={availableUsers}
                    onReturnToAdmin={onReturnToAdmin}
                    originalAdminUser={originalAdminUser}
                    onDevDashboard={() => { setShowDevDashboard(true); closePanel(false); }}
                    onErrorTracker={() => { setShowErrorTracker(true); closePanel(false); }}
                    onErrorPreview={() => { setShowErrorPreview(true); closePanel(false); }}
                    onLoadingDebug={() => { setShowLoadingDebug(true); closePanel(false); }}
                    onDemoPrompts={() => { setShowDemoPrompts(true); closePanel(); }}
                    onMigrationTool={() => { setShowMigrationTool(true); closePanel(false); }}
                    onOpenDemoMatter={onOpenDemoMatter ? (showCcl) => { onOpenDemoMatter(showCcl); closePanel(); } : undefined}
                    onOpenReleaseNotesModal={onOpenReleaseNotesModal}
                    openReportingUtility={openReportingUtility}
                    setShowRefreshModal={setShowRefreshModal}
                    isDarkMode={isDarkMode}
                    environment={environment}
                    environmentColour={environmentColour}
                    sessionElapsed={sessionElapsed}
                    onClose={() => closePanel()}
                    showToast={showToast}
                    tokens={tokens}
                />
                </CommandDeckErrorBoundary>,
                document.body
            )}

            <Suspense fallback={null}>
                {showDevDashboard && <AdminDashboard isOpen={showDevDashboard} onClose={() => setShowDevDashboard(false)} inspectorData={user} />}
                {showDemoPrompts && <DemoPromptsModal isOpen={showDemoPrompts} onClose={() => setShowDemoPrompts(false)} />}
                {showLoadingDebug && <LoadingDebugModal isOpen={showLoadingDebug} onClose={() => setShowLoadingDebug(false)} />}
                {showErrorTracker && <ErrorTracker onClose={() => setShowErrorTracker(false)} />}
                {showMigrationTool && <LegacyMigrationTool isOpen={showMigrationTool} onClose={() => setShowMigrationTool(false)} onToast={showToast} />}
                {showErrorPreview && <ErrorScreenPreview onClose={() => setShowErrorPreview(false)} />}
            </Suspense>
        </>
    );
};

export default HubToolsChip;