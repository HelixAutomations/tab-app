import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { colours } from '../app/styles/colours';
import { useTheme } from '../app/functionality/ThemeContext';
import { UserData } from '../app/functionality/types';
import { isAdminUser } from '../app/admin';
import AdminDashboard from './AdminDashboard';
import DemoPromptsModal from './DemoPromptsModal';
import LoadingDebugModal from './debug/LoadingDebugModal';
import { ErrorTracker } from './ErrorTracker';
import RefreshDataModal from './RefreshDataModal';
import LegacyMigrationTool from './LegacyMigrationTool';
import AdminControlsSection from './command-centre/AdminControlsSection';
import LocalDevSection from './command-centre/LocalDevSection';
import WorkspaceViewsSection from './command-centre/WorkspaceViewsSection';
import { BubbleToastTone, CommandCentreTokens } from './command-centre/types';

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
    const [toast, setToast] = useState<{ message: string; tone: BubbleToastTone } | null>(null);
    const [sessionElapsed, setSessionElapsed] = useState('');
    const [healthData, setHealthData] = useState<HealthData | null>(null);
    const [healthLoading, setHealthLoading] = useState(false);
    const [routeResults, setRouteResults] = useState<EnvResult[]>([
        { env: 'local', status: 'loading', data: null, error: null },
        { env: 'production', status: 'loading', data: null, error: null },
    ]);
    const [routeExpanded, setRouteExpanded] = useState(false);
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

    const isAdminEligible = isAdminUser(user) || isLocalDev;
    const canSwitchUser = isAdminUser(user);
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
    const stripDivider = isDarkMode ? 'rgba(255, 255, 255, 0.10)' : 'rgba(6, 23, 51, 0.10)';
    const stripHoverText = isDarkMode ? '#ffffff' : colours.helixBlue;
    const chipBottom = bottomOffset;
    const panelBottom = bottomOffset + 48;
    const stripSegmentBase: React.CSSProperties = {
        height: 26,
        padding: '0 8px',
        background: 'transparent',
        border: 'none',
        borderRadius: 0,
        color: textPrimary,
        cursor: 'pointer',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.2px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        opacity: 0.82,
        transition: 'color 0.18s ease, opacity 0.18s ease, background 0.18s ease',
    };
    const openReportingUtility = useCallback((view: 'logMonitor' | 'dataCentre') => {
        window.dispatchEvent(new CustomEvent('navigateToReporting', { detail: { view } }));
        closePanel();
    }, [closePanel]);

    return (
        <>
            {showRefreshModal && (
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
            {featureToggles.viewAsProd && (
                <span
                    style={{
                        fontSize: 8,
                        fontWeight: 700,
                        letterSpacing: '0.6px',
                        textTransform: 'uppercase' as const,
                        color: '#fff',
                        background: colours.cta,
                        padding: '2px 7px',
                        borderRadius: 999,
                        lineHeight: '14px',
                        pointerEvents: 'auto',
                        boxShadow: isDarkMode ? '0 2px 8px rgba(214, 85, 65, 0.35)' : '0 2px 8px rgba(214, 85, 65, 0.25)',
                    }}
                >
                    PROD
                </span>
            )}
            <div
                style={{
                    display: 'flex',
                    pointerEvents: 'auto',
                    alignItems: 'center',
                    gap: 0,
                    justifyContent: 'flex-end',
                    maxWidth: 'min(88vw, 420px)',
                    minHeight: 30,
                    padding: '0 4px',
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
                <button
                    type="button"
                    onClick={handleDemoView}
                    style={{
                        ...stripSegmentBase,
                        color: demoModeEnabled ? colours.green : textPrimary,
                        opacity: demoModeEnabled ? 1 : 0.82,
                    }}
                    onMouseEnter={(e) => {
                        if (!demoModeEnabled) {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.color = stripHoverText;
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!demoModeEnabled) {
                            e.currentTarget.style.opacity = '0.82';
                            e.currentTarget.style.color = textPrimary;
                        }
                    }}
                    aria-label={demoModeEnabled ? 'Turn off demo mode' : 'Turn on demo mode'}
                >
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: demoModeEnabled ? colours.green : 'transparent', border: demoModeEnabled ? 'none' : `1px solid ${stripDivider}`, flexShrink: 0 }} />
                    Demo
                </button>
                <span style={{ width: 1, height: 14, background: stripDivider, flexShrink: 0 }} />
                <button
                    type="button"
                    onClick={handleProdView}
                    style={{
                        ...stripSegmentBase,
                        color: featureToggles.viewAsProd ? colours.cta : textPrimary,
                        opacity: featureToggles.viewAsProd ? 1 : 0.82,
                    }}
                    onMouseEnter={(e) => {
                        if (!featureToggles.viewAsProd) {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.color = stripHoverText;
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!featureToggles.viewAsProd) {
                            e.currentTarget.style.opacity = '0.82';
                            e.currentTarget.style.color = textPrimary;
                        }
                    }}
                    aria-label={featureToggles.viewAsProd ? 'Turn off production view' : 'Turn on production view'}
                >
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: featureToggles.viewAsProd ? colours.cta : 'transparent', border: featureToggles.viewAsProd ? 'none' : `1px solid ${stripDivider}`, flexShrink: 0 }} />
                    Prod
                </button>
                <span style={{ width: 1, height: 14, background: stripDivider, flexShrink: 0 }} />
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
                        ...stripSegmentBase,
                        height: 28,
                        padding: '0 8px 0 10px',
                        color: textPrimary,
                        opacity: open ? 1 : 0.92,
                        transition: 'opacity 0.18s ease, color 0.18s ease'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.color = stripHoverText;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = open ? '1' : '0.92';
                        e.currentTarget.style.color = textPrimary;
                    }}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-controls={panelId}
                    aria-label="Private hub controls"
                >
                    <span style={{
                        width: 10,
                        height: 10,
                        borderRadius: 0,
                        background: 'transparent',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: environmentColour,
                        flexShrink: 0
                    }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M12 15v2"/><path d="M12 7v4"/><path d="M5 12h2"/><path d="M17 12h2"/><path d="M7.8 7.8l1.4 1.4"/><path d="M14.8 14.8l1.4 1.4"/><path d="M16.2 7.8l-1.4 1.4"/><path d="M9.2 14.8l-1.4 1.4"/>
                        </svg>
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2px' }}>Tools</span>
                    <span style={{
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        flexShrink: 0,
                        background: enquiriesLiveRefreshInFlight ? colours.highlight
                            : enquiriesUsingSnapshot ? colours.orange
                            : (healthData?.overall === 'healthy' || !healthData) && enquiriesLastLiveSyncAt ? colours.green
                            : healthData?.overall === 'degraded' ? colours.orange
                            : colours.subtleGrey,
                        transition: 'background 0.3s ease',
                    }} />
                </button>
            </div>
            </div>

            {open && typeof document !== 'undefined' && createPortal(
                <>
                    <div
                        onClick={() => closePanel()}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 2098,
                            background: 'transparent'
                        }}
                    />
                    <div
                        ref={panelRef}
                        id={panelId}
                        role="dialog"
                        aria-modal="true"
                        tabIndex={-1}
                        style={{
                            position: 'fixed',
                            right: 18,
                            bottom: panelBottom,
                            zIndex: 2099,
                            width: 'min(380px, calc(100vw - 24px))',
                            maxHeight: 'min(78vh, 760px)',
                            display: 'flex',
                            flexDirection: 'column',
                            background: bg,
                            border: `1px solid ${borderLight}`,
                            borderRadius: '2px',
                            boxShadow: isDarkMode
                                ? '0 28px 56px rgba(0, 3, 25, 0.62), 0 0 0 1px rgba(54, 144, 206, 0.08)'
                                : '0 24px 48px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
                            overflow: 'hidden'
                        }}
                    >
                        {toast && (
                            <div className={`user-bubble-toast user-bubble-toast-${toast.tone}`} role="status" aria-live="polite">
                                {toast.message}
                            </div>
                        )}

                        <div style={{
                            padding: '12px 14px 10px 14px',
                            borderBottom: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.08)' : borderLight}`,
                            background: isDarkMode ? colours.websiteBlue : colours.grey,
                            display: 'grid',
                            gap: 8,
                            flexShrink: 0
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 999,
                                    background: isDarkMode ? 'rgba(135, 243, 243, 0.14)' : 'rgba(54, 144, 206, 0.08)',
                                    border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.24)' : 'rgba(54, 144, 206, 0.14)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: environmentColour,
                                    flexShrink: 0
                                }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                        <path d="M12 15v2"/><path d="M12 7v4"/><path d="M5 12h2"/><path d="M17 12h2"/><path d="M7.8 7.8l1.4 1.4"/><path d="M14.8 14.8l1.4 1.4"/><path d="M16.2 7.8l-1.4 1.4"/><path d="M9.2 14.8l-1.4 1.4"/>
                                    </svg>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: textPrimary }}>Private hub controls</div>
                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Visible only to Luke, Alex, and local dev.</div>
                                </div>
                                <button
                                    onClick={() => closePanel()}
                                    style={{
                                        background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : colours.grey,
                                        border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.34)' : borderMedium}`,
                                        borderRadius: '2px',
                                        color: textPrimary,
                                        cursor: 'pointer',
                                        padding: '6px',
                                        minWidth: 28,
                                        minHeight: 28,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    aria-label="Close"
                                >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75">
                                        <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>

                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 9,
                                fontWeight: 600,
                                color: textMuted,
                                letterSpacing: '0.3px'
                            }}>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 6px',
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)',
                                    border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(54, 144, 206, 0.10)'}`,
                                    color: environmentColour,
                                    borderRadius: '2px',
                                    textTransform: 'uppercase'
                                }}>
                                    <span style={{ width: 4, height: 4, borderRadius: 999, background: environmentColour }} />
                                    {environment}
                                </span>
                                <span style={{ opacity: 0.45, fontSize: 8 }}>{typeof window !== 'undefined' ? window.location.host : ''}</span>
                                <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 8 }}>{sessionElapsed}</span>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
                            <WorkspaceViewsSection
                                tokens={tokens}
                                onFeatureToggle={onFeatureToggle}
                                featureToggles={featureToggles}
                                demoModeEnabled={demoModeEnabled}
                                onToggleDemoMode={onToggleDemoMode}
                                closePopover={() => closePanel()}
                            />

                            {isAdminEligible && (
                                <AdminControlsSection
                                    tokens={tokens}
                                    user={user}
                                    canSwitchUser={canSwitchUser}
                                    onUserChange={onUserChange}
                                    availableUsers={availableUsers}
                                    onToggleDemoMode={onToggleDemoMode}
                                    demoModeEnabled={demoModeEnabled}
                                    onOpenReleaseNotesModal={onOpenReleaseNotesModal}
                                    closePopover={() => closePanel()}
                                />
                            )}

                            <LocalDevSection
                                    tokens={tokens}
                                    onFeatureToggle={onFeatureToggle}
                                    featureToggles={featureToggles}
                                    onDevDashboard={() => { setShowDevDashboard(true); closePanel(false); }}
                                    onLoadingDebug={() => setShowLoadingDebug(true)}
                                    onErrorTracker={() => setShowErrorTracker(true)}
                                    onDemoPrompts={() => { setShowDemoPrompts(true); closePanel(); }}
                                    onMigrationTool={() => { setShowMigrationTool(true); closePanel(false); }}
                                    closePopover={() => closePanel()}
                                    onOpenDemoMatter={onOpenDemoMatter ? (showCcl) => { onOpenDemoMatter(showCcl); closePanel(); } : undefined}
                                />

                            <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
                                <div style={tokens.sectionTitle}>
                                    <span style={{ width: 6, height: 6, borderRadius: 999, background: environmentColour }} />
                                    Reporting utilities
                                </div>

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={() => openReportingUtility('logMonitor')}
                                        style={{ ...tokens.actionBtn, flex: 1, justifyContent: 'center' }}
                                        onMouseEnter={(e) => {
                                            tokens.applyRowHover(e.currentTarget);
                                            e.currentTarget.style.color = textPrimary;
                                        }}
                                        onMouseLeave={(e) => {
                                            tokens.resetRowHover(e.currentTarget);
                                            e.currentTarget.style.color = textBody;
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M3 4h18v12H3z"/>
                                            <path d="M7 20h10"/>
                                            <path d="M9 8h6"/>
                                            <path d="M9 12h3"/>
                                        </svg>
                                        Activity monitor
                                    </button>

                                    <button
                                        onClick={() => openReportingUtility('dataCentre')}
                                        style={{ ...tokens.actionBtn, flex: 1, justifyContent: 'center' }}
                                        onMouseEnter={(e) => {
                                            tokens.applyRowHover(e.currentTarget);
                                            e.currentTarget.style.color = textPrimary;
                                        }}
                                        onMouseLeave={(e) => {
                                            tokens.resetRowHover(e.currentTarget);
                                            e.currentTarget.style.color = textBody;
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M4 4h16v4H4z"/>
                                            <path d="M4 12h7v8H4z"/>
                                            <path d="M13 12h7v3h-7z"/>
                                            <path d="M13 17h7v3h-7z"/>
                                        </svg>
                                        Data centre
                                    </button>
                                </div>
                            </div>

                            {/* Server health */}
                            <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                                <div style={tokens.sectionTitle}>
                                    <span style={{ width: 6, height: 6, borderRadius: 999, background: healthData?.overall === 'healthy' ? colours.green : healthData?.overall === 'degraded' ? colours.orange : colours.subtleGrey }} />
                                    Server health
                                    {healthLoading && <span style={{ fontSize: 9, color: colours.subtleGrey, marginLeft: 'auto' }}>polling…</span>}
                                </div>
                                {healthData ? (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                                            {Object.entries(healthData.components).map(([name, comp]) => (
                                                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: textBody, padding: '3px 0' }}>
                                                    <span style={{
                                                        width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                                                        background: comp.status === 'connected' || comp.status === 'running' ? colours.green
                                                            : comp.status === 'disconnected' || comp.status === 'stopped' ? colours.cta
                                                            : colours.subtleGrey
                                                    }} />
                                                    {name}
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: 12, fontSize: 10, color: colours.subtleGrey }}>
                                            <span>Up {healthData.uptimeSeconds < 3600
                                                ? `${Math.floor(healthData.uptimeSeconds / 60)}m`
                                                : `${Math.floor(healthData.uptimeSeconds / 3600)}h ${Math.floor((healthData.uptimeSeconds % 3600) / 60)}m`
                                            }</span>
                                            <span>Heap {Math.round(healthData.memory.heapUsed / 1024 / 1024)}MB</span>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ fontSize: 11, color: colours.subtleGrey }}>
                                        {healthLoading ? 'Loading…' : 'Unavailable'}
                                    </div>
                                )}

                                {/* SSE stream */}
                                {healthData && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: textBody, marginTop: 2 }}>
                                        <span style={{
                                            width: 6, height: 6, borderRadius: 999,
                                            background: healthData.sse.clients > 0 ? colours.green : colours.subtleGrey
                                        }} />
                                        SSE {healthData.sse.clients} client{healthData.sse.clients !== 1 ? 's' : ''}
                                    </div>
                                )}

                                {/* Data freshness */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: textBody, marginTop: 2 }}>
                                    <span style={{
                                        width: 6, height: 6, borderRadius: 999,
                                        background: enquiriesLiveRefreshInFlight ? colours.highlight
                                            : enquiriesUsingSnapshot ? colours.orange
                                            : enquiriesLastLiveSyncAt ? colours.green
                                            : colours.subtleGrey
                                    }} />
                                    {enquiriesLiveRefreshInFlight ? 'Syncing…'
                                        : enquiriesUsingSnapshot ? 'Snapshot (stale)'
                                        : enquiriesLastLiveSyncAt
                                            ? (() => {
                                                const age = Math.round((Date.now() - enquiriesLastLiveSyncAt) / 1000);
                                                return age < 60 ? 'Live (just now)'
                                                    : age < 3600 ? `Live (${Math.floor(age / 60)}m ago)`
                                                    : `Live (${Math.floor(age / 3600)}h ago)`;
                                            })()
                                            : 'Awaiting sync'}
                                </div>
                            </div>

                            {/* Route status */}
                            {(() => {
                                const allOk = routeResults.every(r => r.status === 'ok' && r.data?.summary.unhealthy === 0);
                                const anyFail = routeResults.some(r => r.status === 'fail');
                                const anyLoading = routeResults.some(r => r.status === 'loading');
                                const overallDot = anyLoading ? colours.subtleGrey : allOk ? colours.green : anyFail ? colours.cta : colours.orange;
                                const envDot = (r: EnvResult) =>
                                    r.status === 'loading' ? colours.subtleGrey
                                    : r.status === 'fail' ? colours.cta
                                    : (r.data && r.data.summary.unhealthy > 0) ? colours.orange
                                    : colours.green;

                                return (
                                    <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                                        <div
                                            style={{ ...tokens.sectionTitle, cursor: 'pointer' }}
                                            onClick={() => setRouteExpanded(p => !p)}
                                        >
                                            <span style={{
                                                width: 6, height: 6, borderRadius: 999,
                                                background: overallDot,
                                                boxShadow: `0 0 4px ${overallDot}88`,
                                            }} />
                                            Route status
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                                                {routeResults.map(r => (
                                                    <span key={r.env} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                        <span style={{ width: 4, height: 4, borderRadius: 999, background: envDot(r) }} />
                                                        <span style={{ fontSize: 9, color: textMuted }}>
                                                            {r.env === 'local' ? 'L' : 'P'}
                                                            {r.status === 'ok' && r.data ? `:${r.data.summary.healthy}/${r.data.summary.total}` : ''}
                                                        </span>
                                                    </span>
                                                ))}
                                            </span>
                                            <svg
                                                width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                                                style={{ transition: 'transform 0.2s ease', transform: routeExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                            >
                                                <path d="M6 9l6 6 6-6"/>
                                            </svg>
                                        </div>

                                        <div style={{
                                            maxHeight: routeExpanded ? 500 : 0,
                                            opacity: routeExpanded ? 1 : 0,
                                            overflow: 'hidden',
                                            transition: 'max-height 0.25s ease, opacity 0.2s ease',
                                        }}>
                                            {routeResults.map(r => (
                                                <div key={r.env} style={{ marginBottom: 6 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                                        <span style={{ width: 5, height: 5, borderRadius: 999, background: envDot(r), flexShrink: 0 }} />
                                                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: textPrimary }}>{r.env}</span>
                                                        {r.status === 'ok' && r.data && (
                                                            <span style={{ marginLeft: 'auto', fontSize: 9, color: textMuted }}>{r.data.summary.healthy}/{r.data.summary.total} · {r.data.durationMs}ms</span>
                                                        )}
                                                        {r.status === 'fail' && (
                                                            <span style={{ marginLeft: 'auto', fontSize: 9, color: colours.cta }}>{r.error}</span>
                                                        )}
                                                        {r.status === 'loading' && (
                                                            <span style={{ marginLeft: 'auto', fontSize: 9, color: textMuted, opacity: 0.6 }}>probing…</span>
                                                        )}
                                                    </div>
                                                    {r.status === 'ok' && r.data && (
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, paddingLeft: 12 }}>
                                                            {r.data.checks.map(c => (
                                                                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: textBody, padding: '1px 0' }}>
                                                                    <span style={{ width: 4, height: 4, borderRadius: 999, background: c.status === 'healthy' ? colours.green : colours.cta, flexShrink: 0 }} />
                                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.name}</span>
                                                                    {c.responseMs != null && <span style={{ fontSize: 8, color: textMuted, flexShrink: 0 }}>{c.responseMs}ms</span>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                                                <button
                                                    onClick={() => { runRouteProbes(); showToast('Probing routes…', 'info'); }}
                                                    style={{ ...tokens.actionBtn, fontSize: 9, padding: '3px 10px', width: 'auto' }}
                                                    onMouseEnter={(e) => { tokens.applyRowHover(e.currentTarget); e.currentTarget.style.color = textPrimary; }}
                                                    onMouseLeave={(e) => { tokens.resetRowHover(e.currentTarget); e.currentTarget.style.color = textBody; }}
                                                >
                                                    ↻ refresh
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    onClick={() => setShowRefreshModal(true)}
                                    style={{ ...tokens.actionBtn, flex: 1, justifyContent: 'center' }}
                                    onMouseEnter={(e) => {
                                        tokens.applyRowHover(e.currentTarget);
                                        e.currentTarget.style.color = textPrimary;
                                    }}
                                    onMouseLeave={(e) => {
                                        tokens.resetRowHover(e.currentTarget);
                                        e.currentTarget.style.color = textBody;
                                    }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                    </svg>
                                    Refresh data
                                </button>

                                {originalAdminUser && onReturnToAdmin && (
                                    <button
                                        onClick={() => {
                                            onReturnToAdmin();
                                            closePanel();
                                        }}
                                        style={{
                                            ...tokens.actionBtn,
                                            flex: 1,
                                            justifyContent: 'center',
                                            background: ctaPrimary,
                                            color: '#fff',
                                            border: `1px solid ${ctaPrimary}`
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                                        </svg>
                                        Return to admin
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </>,
                document.body
            )}

            {showDevDashboard && <AdminDashboard isOpen={showDevDashboard} onClose={() => setShowDevDashboard(false)} inspectorData={user} />}
            {showDemoPrompts && <DemoPromptsModal isOpen={showDemoPrompts} onClose={() => setShowDemoPrompts(false)} />}
            {showLoadingDebug && <LoadingDebugModal isOpen={showLoadingDebug} onClose={() => setShowLoadingDebug(false)} />}
            {showErrorTracker && <ErrorTracker onClose={() => setShowErrorTracker(false)} />}
            {showMigrationTool && <LegacyMigrationTool isOpen={showMigrationTool} onClose={() => setShowMigrationTool(false)} onToast={showToast} />}
        </>
    );
};

export default HubToolsChip;