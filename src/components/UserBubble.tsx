import React, { useState, useRef, useEffect, useId, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { UserData } from '../app/functionality/types';
import '../app/styles/UserBubble.css';
import '../app/styles/personas.css';
import { isAdminUser, getUserTier } from '../app/admin';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import lightAvatarMark from '../assets/dark blue mark.svg';
import darkAvatarMark from '../assets/markwhite.svg';
import { CommandCentreTokens, BubbleToastTone } from './command-centre/types';
import SessionFiltersSection from './command-centre/SessionFiltersSection';
import TodayStripSection from './command-centre/TodayStripSection';
import CommsFrameworkSection from './command-centre/CommsFrameworkSection';

/*
 * UserBubble — identity + personal context surface.
 * Consolidation 2026-04-21: all dev tools (AdminDashboard, DemoPromptsModal,
 * LoadingDebugModal, ErrorTracker, LegacyMigrationTool, RefreshDataModal) and
 * the Demo-mode toggle now live in CommandDeck (HubToolsChip). This bubble's
 * job is: who am I, what's on my plate today, which data scope + persona am I
 * operating under, and how do I return to my real identity.
 */
interface UserBubbleProps {
    user: UserData;
    onAreasChange?: (areas: string[]) => void;
    onUserChange?: (user: UserData) => void;
    availableUsers?: UserData[] | null;
    onReturnToAdmin?: () => void;
    originalAdminUser?: UserData | null;
    /** Read-only view of the app-level toggles. Only `viewAsProd` is consulted
     *  (for the identity-strip banner). Mutation lives in CommandDeck. */
    featureToggles?: Record<string, boolean>;
    /** Read-only — used for the active-state banner. Toggle lives in CommandDeck. */
    demoModeEnabled?: boolean;
}

const UserBubble: React.FC<UserBubbleProps> = ({
    user,
    onAreasChange,
    onUserChange,
    availableUsers,
    onReturnToAdmin,
    originalAdminUser,
    featureToggles = {},
    demoModeEnabled = false,
}) => {
    // ── State ──
    const [open, setOpen] = useState(false);
    const [toast, setToast] = useState<{ message: string; tone: BubbleToastTone } | null>(null);
    const [showUserPicker, setShowUserPicker] = useState(false);
    const [pickerQuery, setPickerQuery] = useState('');
    const [areasOfWork, setAreasOfWork] = useState<string[]>(() => {
        const record = user as unknown as Record<string, unknown>;
        const aow = user.AOW || record.Area_of_Work || record.aow;
        return aow ? String(aow).split(',').map(s => s.trim()).filter(Boolean) : [];
    });
    // Snapshot the profile-default AoW at first render so "Reset to my profile"
    // still points at the baseline even after the user has toggled areas.
    const defaultAreasRef = useRef<string[]>(areasOfWork);

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
    const canSwitchUser = isAdminUser(user) || !!originalAdminUser;
    const hasSessionFilters = !!onAreasChange;
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
    const { toggleRow, toggleSwitch, toggleKnob, sectionTitle, applyRowHover, resetRowHover } = tokens;

    // ── Render ──
    return (
        <div className="user-bubble-container">
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
                                    {(() => {
                                        const identityContent = (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: textPrimary, opacity: 0.9, flexShrink: 0 }}>{initials}</span>
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                                        {user.FullName || `${user.First || ''} ${user.Last || ''}`.trim() || 'User'}
                                                    </span>
                                                    {canSwitchUser && (
                                                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: textMuted, opacity: 0.7, flexShrink: 0, transform: showUserPicker ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
                                                            <polyline points="6 9 12 15 18 9"/>
                                                        </svg>
                                                    )}
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
                                            </>
                                        );
                                        return canSwitchUser ? (
                                            <button
                                                type="button"
                                                onClick={() => { setShowUserPicker(v => !v); setPickerQuery(''); }}
                                                style={{
                                                    background: 'transparent', border: 'none', padding: 0,
                                                    textAlign: 'left', cursor: 'pointer',
                                                    display: 'grid', gap: 2, minWidth: 0,
                                                    borderRadius: 2,
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.06)' : 'rgba(54, 144, 206, 0.05)'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                                aria-haspopup="listbox"
                                                aria-expanded={showUserPicker}
                                                title="Switch user"
                                            >
                                                {identityContent}
                                            </button>
                                        ) : (
                                            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>{identityContent}</div>
                                        );
                                    })()}
                                </div>
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
                            {/* Inline user picker — expands directly under the identity row when
                                name is clicked. Admin-gated via canSwitchUser. */}
                            {showUserPicker && canSwitchUser && onUserChange && availableUsers && (
                                <div style={{
                                    marginTop: 10,
                                    background: isDarkMode ? 'rgba(6, 23, 51, 0.6)' : '#fff',
                                    border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.18)' : borderMedium}`,
                                    borderRadius: 2,
                                    overflow: 'hidden',
                                    boxShadow: isDarkMode ? '0 4px 14px rgba(0,3,25,0.5)' : '0 4px 14px rgba(0,0,0,0.08)',
                                    animation: 'commandCenterIn 0.18s ease forwards',
                                }}>
                                    <input
                                        autoFocus
                                        type="text"
                                        value={pickerQuery}
                                        onChange={(e) => setPickerQuery(e.target.value)}
                                        placeholder="Search user..."
                                        style={{
                                            width: '100%', padding: '9px 12px',
                                            fontSize: 12, fontFamily: 'Raleway, sans-serif',
                                            background: 'transparent',
                                            color: textPrimary,
                                            border: 'none',
                                            borderBottom: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.12)' : borderLight}`,
                                            outline: 'none',
                                        }}
                                    />
                                    <div style={{ maxHeight: 220, overflowY: 'auto' }} role="listbox">
                                        {(() => {
                                            const q = pickerQuery.trim().toLowerCase();
                                            const list = availableUsers
                                                .filter(u => !u.status || u.status.toLowerCase() === 'active')
                                                .filter(u => {
                                                    if (!q) return true;
                                                    const hay = `${u.FullName || ''} ${u.First || ''} ${u.Last || ''} ${u.Initials || ''} ${u.Role || ''}`.toLowerCase();
                                                    return hay.includes(q);
                                                });
                                            if (list.length === 0) {
                                                return <div style={{ padding: '10px 12px', fontSize: 11, color: textMuted }}>No matches</div>;
                                            }
                                            return list.map((u) => {
                                                const isCurrent = u.Initials === user.Initials;
                                                return (
                                                    <button
                                                        key={u.Initials}
                                                        type="button"
                                                        role="option"
                                                        aria-selected={isCurrent}
                                                        onClick={() => {
                                                            if (isCurrent) { setShowUserPicker(false); return; }
                                                            onUserChange(u);
                                                            showToast(`Switched to ${u.FullName || u.Initials}`, 'success');
                                                            setShowUserPicker(false);
                                                            setPickerQuery('');
                                                        }}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                            width: '100%', padding: '8px 12px',
                                                            background: isCurrent ? (isDarkMode ? 'rgba(135, 243, 243, 0.10)' : 'rgba(54, 144, 206, 0.08)') : 'transparent',
                                                            border: 'none', textAlign: 'left', cursor: 'pointer',
                                                            color: textPrimary,
                                                            fontSize: 11, fontFamily: 'Raleway, sans-serif',
                                                            transition: 'background 0.12s ease',
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (!isCurrent) e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.06)' : 'rgba(54, 144, 206, 0.04)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (!isCurrent) e.currentTarget.style.background = 'transparent';
                                                        }}
                                                    >
                                                        <span style={{ fontSize: 10, fontWeight: 700, color: textMuted, minWidth: 24 }}>{u.Initials}</span>
                                                        <span style={{ flex: 1, fontWeight: 500 }}>{u.FullName || `${u.First || ''} ${u.Last || ''}`.trim()}</span>
                                                        {u.Role && <span style={{ fontSize: 9, color: textMuted, opacity: 0.8 }}>{u.Role}</span>}
                                                        {isCurrent && (
                                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? colours.accent : colours.blue} strokeWidth="3">
                                                                <polyline points="20 6 9 17 4 12"/>
                                                            </svg>
                                                        )}
                                                    </button>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Content — My Helix */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                            {/* System IDs strip */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <span
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 600, color: user.ClioID ? textMuted : colours.cta, letterSpacing: '0.2px', cursor: user.ClioID ? 'pointer' : 'default' }}
                                    onClick={() => {
                                        if (user.ClioID) {
                                            navigator.clipboard.writeText(String(user.ClioID));
                                            showToast('Clio ID copied', 'success');
                                        }
                                    }}
                                    title={user.ClioID ? `Click to copy: ${user.ClioID}` : 'No Clio ID'}
                                    role={user.ClioID ? 'button' : undefined}
                                    aria-label={user.ClioID ? `Copy Clio ID ${user.ClioID}` : 'No Clio ID'}
                                    tabIndex={user.ClioID ? 0 : undefined}
                                    onKeyDown={user.ClioID ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigator.clipboard.writeText(String(user.ClioID)); showToast('Clio ID copied', 'success'); } } : undefined}
                                >
                                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: user.ClioID ? colours.green : colours.cta, flexShrink: 0 }} />
                                    Clio {user.ClioID || '\u2014'}
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
                                    role={user.EntraID ? 'button' : undefined}
                                    aria-label={user.EntraID ? `Copy Entra ID` : 'No Entra ID'}
                                    tabIndex={user.EntraID ? 0 : undefined}
                                    onKeyDown={user.EntraID ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigator.clipboard.writeText(String(user.EntraID)); showToast('Entra ID copied', 'success'); } } : undefined}
                                >
                                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: user.EntraID ? colours.green : colours.cta, flexShrink: 0 }} />
                                    Entra {user.EntraID ? `${String(user.EntraID).substring(0, 8)}\u2026` : '\u2014'}
                                    {user.EntraID && (
                                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.5 }}>
                                            <rect x="9" y="9" width="13" height="13" rx="1"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>
                                        </svg>
                                    )}
                                </span>
                            </div>

                            {/* Active state warnings (admin view-as, demo mode) */}
                            {(demoModeEnabled || featureToggles.viewAsProd || originalAdminUser) && (
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

                            {/* ── Working-areas scope strip ── */}
                            {hasSessionFilters && (
                                <div style={{ marginBottom: 12 }}>
                                    <SessionFiltersSection
                                        tokens={tokens}
                                        onAreasChange={onAreasChange}
                                        areasOfWork={areasOfWork}
                                        setAreasOfWork={setAreasOfWork}
                                        defaultAreasOfWork={defaultAreasRef.current}
                                    />
                                </div>
                            )}

                            {/* Admin box removed 2026-04-22 — Switch User lives in the header name;
                                the view-as tier override was unused in practice. */}

                            {/* ── Frameworks (dev group only) ── */}
                            {(tier === 'dev' || tier === 'devGroup') && (
                                <div className="helix-ai-border" style={{ marginBottom: 16 }}>
                                    <div
                                        className="helix-ai-border__inner"
                                        style={{
                                            background: isDarkMode ? colours.websiteBlue : colours.grey,
                                            padding: '12px 12px 4px',
                                        }}
                                    >
                                        <CommsFrameworkSection tokens={tokens} />
                                    </div>
                                </div>
                            )}

                            {/* ── Appearance ── */}
                            <div style={{ marginBottom: 4 }}>
                                <div
                                    style={{
                                        ...toggleRow,
                                        justifyContent: 'space-between',
                                    }}
                                    onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                                    onMouseLeave={(e) => resetRowHover(e.currentTarget)}
                                    onClick={toggleTheme}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {isDarkMode ? (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="1.8" style={{ flexShrink: 0 }}>
                                                <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                                            </svg>
                                        ) : (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="1.8" style={{ flexShrink: 0 }}>
                                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                                            </svg>
                                        )}
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>{isDarkMode ? 'Light mode' : 'Dark mode'}</div>
                                            <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Switch appearance</div>
                                        </div>
                                    </div>
                                    <div style={toggleSwitch(!isDarkMode)}>
                                        <div style={toggleKnob(!isDarkMode)} />
                                    </div>
                                </div>
                            </div>

                            {/* ── Demo / Local-dev tools + Refresh Data moved to CommandDeck (HubToolsChip).
                                 UserBubble is now identity + personal context only. ── */}

                            {/* Quick actions footer (Return-to-admin only; Refresh lives in CommandDeck) */}
                            {originalAdminUser && onReturnToAdmin && (
                                <>
                                    <div style={{ height: 1, background: borderLight, marginBottom: 8 }} />
                                    <div style={{ display: 'flex', gap: 8 }}>
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
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    </div>
                </>
            , document.body)}
        </div>
    );
};

export default UserBubble;
