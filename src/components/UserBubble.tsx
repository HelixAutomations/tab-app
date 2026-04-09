import React, { useState, useRef, useEffect, useId, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import AdminDashboard from './AdminDashboard';
import DemoPromptsModal from './DemoPromptsModal';
import LoadingDebugModal from './debug/LoadingDebugModal';
import { ErrorTracker } from './ErrorTracker';
import { UserData } from '../app/functionality/types';
import '../app/styles/UserBubble.css';
import '../app/styles/personas.css';
import { isAdminUser, getUserTier } from '../app/admin';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import RefreshDataModal from './RefreshDataModal';
import LegacyMigrationTool from './LegacyMigrationTool';
import lightAvatarMark from '../assets/dark blue mark.svg';
import darkAvatarMark from '../assets/markwhite.svg';
import { CommandCentreTokens, BubbleToastTone } from './command-centre/types';
import AdminControlsSection from './command-centre/AdminControlsSection';
import LocalDevSection from './command-centre/LocalDevSection';
import WorkspaceViewsSection from './command-centre/WorkspaceViewsSection';
import SessionFiltersSection from './command-centre/SessionFiltersSection';
import TodayStripSection from './command-centre/TodayStripSection';
import MyAttentionSection from './command-centre/MyAttentionSection';
import QuickLinksSection from './command-centre/QuickLinksSection';
import CommsFrameworkSection from './command-centre/CommsFrameworkSection';

interface UserBubbleProps {
    user: UserData;
    isLocalDev?: boolean;
    onAreasChange?: (areas: string[]) => void;
    onUserChange?: (user: UserData) => void;
    availableUsers?: UserData[] | null;
    onReturnToAdmin?: () => void;
    originalAdminUser?: UserData | null;
    onRefreshEnquiries?: () => Promise<void> | void;
    onRefreshMatters?: () => Promise<void> | void;
    onFeatureToggle?: (feature: string, enabled: boolean) => void;
    featureToggles?: Record<string, boolean>;
    onShowTestEnquiry?: () => void;
    demoModeEnabled?: boolean;
    onToggleDemoMode?: (enabled: boolean) => void;
    onOpenReleaseNotesModal?: () => void;
    hideOpsSections?: boolean;
}

const UserBubble: React.FC<UserBubbleProps> = ({
    user,
    isLocalDev = false,
    onAreasChange,
    onUserChange,
    availableUsers,
    onReturnToAdmin,
    originalAdminUser,
    onRefreshEnquiries,
    onRefreshMatters,
    onFeatureToggle,
    featureToggles = {},
    demoModeEnabled = false,
    onToggleDemoMode,
    onOpenReleaseNotesModal,
    hideOpsSections = false,
}) => {
    // ── State ──
    const [open, setOpen] = useState(false);
    const [showDevDashboard, setShowDevDashboard] = useState(false);
    const [showRefreshModal, setShowRefreshModal] = useState(false);
    const [showDemoPrompts, setShowDemoPrompts] = useState(false);
    const [showLoadingDebug, setShowLoadingDebug] = useState(false);
    const [showErrorTracker, setShowErrorTracker] = useState(false);
    const [showMigrationTool, setShowMigrationTool] = useState(false);
    const [toast, setToast] = useState<{ message: string; tone: BubbleToastTone } | null>(null);
    const [areasOfWork, setAreasOfWork] = useState<string[]>(() => {
        const record = user as unknown as Record<string, unknown>;
        const aow = user.AOW || record.Area_of_Work || record.aow;
        return aow ? String(aow).split(',').map(s => s.trim()).filter(Boolean) : [];
    });

    // ── Refs ──
    const bubbleRef = useRef<HTMLButtonElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedElement = useRef<HTMLElement | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionStartRef = useRef<number>(Date.now());

    // ── Theme ──
    const { isDarkMode, toggleTheme } = useTheme();
    const popoverId = useId();

    // ── Tokens — derived from colours.ts brand values ──
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
    const shadowMd = isDarkMode ? '0 4px 6px -1px rgba(0, 3, 25, 0.35)' : '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)';

    // Avatar
    const avatarBg = isDarkMode ? colours.darkBlue : colours.light.cardBackground;
    const avatarBorder = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
    const avatarBorderHover = isDarkMode ? colours.blue : colours.subtleGrey;
    const avatarShadow = isDarkMode ? '0 3px 12px rgba(0, 3, 25, 0.4)' : shadowSm;
    const avatarShadowHover = isDarkMode ? '0 4px 16px rgba(0, 3, 25, 0.5)' : shadowMd;
    const avatarIcon = isDarkMode ? darkAvatarMark : lightAvatarMark;

    // Row interaction
    const rowBaseBackground = isDarkMode
        ? `linear-gradient(90deg, rgba(54, 144, 206, 0.10) 0%, rgba(54, 144, 206, 0.00) 42%), ${controlRowBg}`
        : controlRowBg;
    const rowHoverBackground = isDarkMode
        ? `linear-gradient(90deg, rgba(54, 144, 206, 0.18) 0%, rgba(54, 144, 206, 0.00) 50%), ${bgHover}`
        : bgHover;
    const rowBaseShadow = isDarkMode ? 'inset 0 0 0 1px rgba(54, 144, 206, 0.05)' : 'none';
    const rowHoverShadow = isDarkMode ? '0 8px 18px rgba(0, 3, 25, 0.42)' : '0 4px 12px rgba(6, 23, 51, 0.08)';

    // ── Computed ──
    const initials = user.Initials || `${user.First?.charAt(0) || ''}${user.Last?.charAt(0) || ''}`.toUpperCase();
    const isAdmin = isAdminUser(user);
    const isAdminEligible = isAdmin || isLocalDev || !!originalAdminUser;
    const canSwitchUser = isAdminUser(user) || !!originalAdminUser;
    const hasSessionFilters = !!onAreasChange || !!onFeatureToggle;
    const tier = getUserTier(user);

    const headerRateDisplay = (user.Rate !== undefined && user.Rate !== null && String(user.Rate).trim() !== '')
        ? String(user.Rate)
        : undefined;

    // ── Callbacks ──
    const closePopover = useCallback((restoreFocus = true) => {
        setOpen(false);
        if (restoreFocus && (previouslyFocusedElement.current || bubbleRef.current)) {
            (previouslyFocusedElement.current || bubbleRef.current)?.focus();
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

    // ── Effects ──
    useEffect(() => {
        localStorage.setItem('__currentUserInitials', (user.Initials || '').toLowerCase());
    }, [user]);

    useEffect(() => {
        if (!open) return;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (!bubbleRef.current?.contains(e.target as Node) && !popoverRef.current?.contains(e.target as Node)) {
                closePopover();
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open, closePopover]);

    useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); closePopover(); }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [open, closePopover]);

    // Focus trap — keep Tab cycling within the dialog
    useEffect(() => {
        if (!open) return;
        const dialog = popoverRef.current;
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
        return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
    }, []);

    // ── Tokens bag for section components ──
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
            display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
            padding: '10px 12px', background: rowBaseBackground,
            border: `1px solid ${borderLight}`,
            borderLeft: '3px solid transparent',
            borderRadius: '2px',
            cursor: 'pointer' as const, boxShadow: rowBaseShadow,
            transform: 'translateY(0)',
            transition: 'background 0.2s ease, border-color 0.2s ease, border-left-color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease'
        },
        sectionTitle: {
            fontSize: 10, fontWeight: 600, color: textMuted, textTransform: 'uppercase' as const,
            letterSpacing: '0.5px', marginBottom: 8, display: 'flex' as const, alignItems: 'center' as const, gap: 6
        },
        actionBtn: {
            width: '100%', padding: '10px 12px', background: rowBaseBackground,
            color: textBody,
            border: `1px solid ${borderLight}`, borderRadius: '2px',
            fontSize: 11, fontWeight: 500, cursor: 'pointer' as const,
            display: 'flex' as const, alignItems: 'center' as const, gap: 6,
            boxShadow: rowBaseShadow, transform: 'translateY(0)',
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
            width: 40, height: 20,
            background: on ? accentPrimary : borderMedium,
            borderRadius: '2px', position: 'relative' as const,
            transition: 'all 0.2s ease', flexShrink: 0
        }),
        toggleKnob: (on: boolean) => ({
            width: 16, height: 16,
            background: '#fff', borderRadius: '1px',
            position: 'absolute' as const, top: 2, left: on ? 22 : 2,
            transition: 'all 0.2s ease', boxShadow: shadowSm
        }),
        showToast,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [isDarkMode, showToast]);

    const actionBtn: React.CSSProperties = tokens.actionBtn;

    // ── Render ──
    return (
        <div className="user-bubble-container">
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
                                try { await fetch('/api/cache/clear-cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope }) }); } catch {}
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

            <button
                ref={bubbleRef}
                onClick={() => {
                    if (open) closePopover();
                    else { previouslyFocusedElement.current = document.activeElement as HTMLElement; setOpen(true); }
                }}
                style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, background: avatarBg,
                    border: `1px solid ${avatarBorder}`, borderRadius: '2px',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    boxShadow: avatarShadow
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = avatarBorderHover;
                    e.currentTarget.style.boxShadow = avatarShadowHover;
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = avatarBorder;
                    e.currentTarget.style.boxShadow = avatarShadow;
                }}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={`User menu for ${user.FullName || initials}`}
            >
                <img src={avatarIcon} alt="User" style={{ width: 18, height: 18, filter: isDarkMode ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' : 'none' }} />
            </button>

            {open && typeof document !== 'undefined' && createPortal(
                <>
                    <div
                        style={{
                            position: 'fixed', inset: 0,
                            background: isDarkMode ? 'rgba(0, 3, 25, 0.85)' : 'rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(8px)', zIndex: 1998,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            animation: 'backdropFadeIn 0.2s ease forwards'
                        }}
                        onClick={() => closePopover()}
                    >
                    <div
                        ref={popoverRef}
                        id={popoverId}
                        role="dialog"
                        aria-modal="true"
                        tabIndex={-1}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '92vw', maxWidth: 600, maxHeight: '80vh',
                            background: bg,
                            border: `1px solid ${borderLight}`, borderRadius: '2px',
                            boxShadow: isDarkMode
                                ? '0 24px 48px rgba(0, 3, 25, 0.6), 0 0 0 1px rgba(54, 144, 206, 0.08)'
                                : '0 24px 48px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
                            overflow: 'hidden', zIndex: 1999, cursor: 'default',
                            animation: 'commandCenterIn 0.25s ease forwards',
                            display: 'flex', flexDirection: 'column', position: 'relative'
                        }}
                    >
                        {toast && (
                            <div className={`user-bubble-toast user-bubble-toast-${toast.tone}`} role="status" aria-live="polite">
                                {toast.message}
                            </div>
                        )}

                        {/* Header — compact identity strip */}
                        <div style={{
                            padding: '12px 20px',
                            borderBottom: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.08)' : borderLight}`,
                            background: isDarkMode ? colours.websiteBlue : colours.grey,
                            flexShrink: 0
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 32, height: 32, background: avatarBg,
                                    border: `1.5px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : borderLight}`,
                                    borderRadius: '2px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 5,
                                    flexShrink: 0
                                }}>
                                    <img src={avatarIcon} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: textPrimary, opacity: 0.9, flexShrink: 0 }}>{initials}</span>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                            {user.FullName || `${user.First || ''} ${user.Last || ''}`.trim() || 'User'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                        <span style={{ fontSize: 9, fontWeight: 500, color: textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                            {user.Role || 'Team Member'}
                                        </span>
                                        {headerRateDisplay && (
                                            <>
                                                <span style={{ fontSize: 8, color: textMuted, opacity: 0.6, flexShrink: 0 }}>•</span>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: textMuted, letterSpacing: '-0.2px', flexShrink: 0 }}>
                                                    {headerRateDisplay.startsWith('£') ? headerRateDisplay : `£${headerRateDisplay}`}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                                    <span
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 600, color: user.ClioID ? textMuted : colours.cta, letterSpacing: '0.2px', cursor: user.ClioID ? 'pointer' : 'default' }}
                                        onClick={() => {
                                            if (user.ClioID) {
                                                navigator.clipboard.writeText(String(user.ClioID));
                                                showToast('Clio ID copied', 'success');
                                            }
                                        }}
                                        title={user.ClioID ? `Click to copy: ${user.ClioID}` : 'No Clio ID'}
                                    >
                                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: user.ClioID ? colours.green : colours.cta, flexShrink: 0 }} />
                                        Clio {user.ClioID || '—'}
                                        {user.ClioID && (
                                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.5 }}>
                                                <rect x="9" y="9" width="13" height="13" rx="1"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>
                                            </svg>
                                        )}
                                    </span>
                                    <span
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 600, color: user.EntraID ? textMuted : colours.cta, letterSpacing: '0.2px', cursor: user.EntraID ? 'pointer' : 'default' }}
                                        onClick={() => {
                                            if (user.EntraID) {
                                                navigator.clipboard.writeText(String(user.EntraID));
                                                showToast('Entra ID copied', 'success');
                                            }
                                        }}
                                        title={user.EntraID ? `Click to copy: ${user.EntraID}` : 'No Entra ID'}
                                    >
                                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: user.EntraID ? colours.green : colours.cta, flexShrink: 0 }} />
                                        Entra {user.EntraID ? `${String(user.EntraID).substring(0, 8)}…` : '—'}
                                        {user.EntraID && (
                                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.5 }}>
                                                <rect x="9" y="9" width="13" height="13" rx="1"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>
                                            </svg>
                                        )}
                                    </span>
                                </div>
                                {/* Theme toggle */}
                                <button
                                    onClick={toggleTheme}
                                    style={{
                                        background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : colours.grey,
                                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.12)' : borderMedium}`,
                                        borderRadius: '2px', color: textMuted, cursor: 'pointer',
                                        padding: '5px', minWidth: 28, minHeight: 28,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.15s ease', flexShrink: 0
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = isDarkMode ? colours.accent : colours.blue;
                                        e.currentTarget.style.color = textPrimary;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.12)' : borderMedium;
                                        e.currentTarget.style.color = textMuted;
                                    }}
                                    aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                                    title={isDarkMode ? 'Light mode' : 'Dark mode'}
                                >
                                    {isDarkMode ? (
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                                        </svg>
                                    ) : (
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                                        </svg>
                                    )}
                                </button>
                                <button
                                    onClick={() => closePopover()}
                                    style={{
                                        background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : colours.grey,
                                        border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.34)' : borderMedium}`,
                                        borderRadius: '2px', color: textPrimary, cursor: 'pointer',
                                        padding: '6px', minWidth: 28, minHeight: 28,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.15s ease', flexShrink: 0
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = isDarkMode ? colours.accent : colours.blue;
                                        e.currentTarget.style.color = textPrimary;
                                        e.currentTarget.style.background = isDarkMode ? `${colours.accent}18` : bgHover;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(135, 243, 243, 0.34)' : borderMedium;
                                        e.currentTarget.style.color = textPrimary;
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.08)' : colours.grey;
                                    }}
                                    aria-label="Close"
                                    title="Close"
                                >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75">
                                        <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Content — My Helix */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                            {/* Active state warnings (admin view-as, demo mode) */}
                            {!hideOpsSections && (demoModeEnabled || featureToggles.viewAsProd || originalAdminUser) && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '8px 12px', marginBottom: 16,
                                    background: demoModeEnabled
                                        ? (isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)')
                                        : (isDarkMode ? 'rgba(214, 85, 65, 0.10)' : 'rgba(214, 85, 65, 0.06)'),
                                    border: `1px solid ${demoModeEnabled
                                        ? (isDarkMode ? 'rgba(32, 178, 108, 0.34)' : 'rgba(32, 178, 108, 0.24)')
                                        : (isDarkMode ? 'rgba(214, 85, 65, 0.30)' : 'rgba(214, 85, 65, 0.20)')}`,
                                    borderRadius: '2px', fontSize: 10, fontWeight: 600,
                                    color: demoModeEnabled ? colours.green : colours.cta
                                }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                    {[
                                        demoModeEnabled && 'Demo mode',
                                        featureToggles.viewAsProd && 'Production view',
                                        originalAdminUser && `Viewing as ${user.FullName || user.Initials}`,
                                    ].filter(Boolean).join(' · ')}
                                </div>
                            )}

                            {/* ── My Helix sections (all users) ── */}
                            <TodayStripSection tokens={tokens} userInitials={initials} sessionStartMs={sessionStartRef.current} />
                            <MyAttentionSection tokens={tokens} userInitials={initials} />

                            {/* ── Area of Work filter strip ── */}
                            {hasSessionFilters && (
                                <SessionFiltersSection
                                    tokens={tokens}
                                    onAreasChange={onAreasChange}
                                    areasOfWork={areasOfWork}
                                    setAreasOfWork={setAreasOfWork}
                                />
                            )}

                            <QuickLinksSection tokens={tokens} userTier={tier} onOpenReleaseNotes={onOpenReleaseNotesModal} closePopover={closePopover} />

                            {/* ── Frameworks (dev group only) ── */}
                            {(tier === 'dev' || tier === 'devGroup') && (
                                <CommsFrameworkSection tokens={tokens} />
                            )}

                            {/* ── Admin sections (admins without HubToolsChip) ── */}
                            {!hideOpsSections && (
                                <WorkspaceViewsSection
                                    tokens={tokens}
                                    onFeatureToggle={onFeatureToggle}
                                    featureToggles={featureToggles}
                                    demoModeEnabled={demoModeEnabled}
                                    onToggleDemoMode={onToggleDemoMode}
                                    closePopover={closePopover}
                                />
                            )}

                            {!hideOpsSections && isAdminEligible && (
                                <AdminControlsSection
                                    tokens={tokens}
                                    user={user}
                                    canSwitchUser={canSwitchUser}
                                    onUserChange={onUserChange}
                                    availableUsers={availableUsers}
                                    onToggleDemoMode={onToggleDemoMode}
                                    demoModeEnabled={demoModeEnabled}
                                    onOpenReleaseNotesModal={onOpenReleaseNotesModal}
                                    closePopover={closePopover}
                                />
                            )}

                            {!hideOpsSections && isLocalDev && (
                                <LocalDevSection
                                    tokens={tokens}
                                    onFeatureToggle={onFeatureToggle}
                                    featureToggles={featureToggles}
                                    onDevDashboard={() => { setShowDevDashboard(true); closePopover(false); }}
                                    onLoadingDebug={() => { setShowLoadingDebug(true); closePopover(false); }}
                                    onErrorTracker={() => { setShowErrorTracker(true); closePopover(false); }}
                                    onDemoPrompts={() => { setShowDemoPrompts(true); closePopover(); }}
                                    onMigrationTool={() => { setShowMigrationTool(true); closePopover(false); }}
                                    closePopover={closePopover}
                                />
                            )}

                            {/* Quick actions footer (admins without HubToolsChip) */}
                            {!hideOpsSections && (
                                <>
                                <div style={{ height: 1, background: borderLight, marginBottom: 8 }} />
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={() => setShowRefreshModal(true)}
                                        style={{ ...actionBtn, flex: 1, justifyContent: 'center' }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = actionBtn.background as string;
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                        </svg>
                                        Refresh Data
                                    </button>

                                    {originalAdminUser && onReturnToAdmin && (
                                        <button
                                            onClick={() => { onReturnToAdmin(); closePopover(); }}
                                            style={{
                                                ...actionBtn,
                                                flex: 1, justifyContent: 'center',
                                                background: ctaPrimary, color: '#fff',
                                                border: `1px solid ${ctaPrimary}`
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.85)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M19 12H5M12 19l-7-7 7-7"/>
                                            </svg>
                                            Return to Admin
                                        </button>
                                    )}
                                </div>
                                </>
                            )}
                        </div>
                    </div>
                    </div>
                </>
            , document.body)}

            {isLocalDev && showDevDashboard && <AdminDashboard isOpen={showDevDashboard} onClose={() => setShowDevDashboard(false)} inspectorData={user} />}
            {isLocalDev && showDemoPrompts && <DemoPromptsModal isOpen={showDemoPrompts} onClose={() => setShowDemoPrompts(false)} />}
            {isLocalDev && showLoadingDebug && <LoadingDebugModal isOpen={showLoadingDebug} onClose={() => setShowLoadingDebug(false)} />}
            {isLocalDev && showErrorTracker && <ErrorTracker onClose={() => setShowErrorTracker(false)} />}
            {isLocalDev && showMigrationTool && <LegacyMigrationTool isOpen={showMigrationTool} onClose={() => setShowMigrationTool(false)} onToast={showToast} />}
        </div>
    );
};

export default UserBubble;
