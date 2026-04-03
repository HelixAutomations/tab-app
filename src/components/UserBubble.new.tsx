import React, { useState, useRef, useEffect, useId, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { UserData } from '../app/functionality/types';
import '../app/styles/UserBubble.css';
import { getUserTier, UserTier } from '../app/admin';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import lightAvatarMark from '../assets/dark blue mark.svg';
import darkAvatarMark from '../assets/markwhite.svg';
import { CommandCentreTokens, BubbleToastTone } from './command-centre/types';
import SessionFiltersSection from './command-centre/SessionFiltersSection';
import TodayStripSection from './command-centre/TodayStripSection';
import MyAttentionSection from './command-centre/MyAttentionSection';
import QuickLinksSection from './command-centre/QuickLinksSection';

interface UserBubbleProps {
    user: UserData;
    isLocalDev?: boolean;
    onAreasChange?: (areas: string[]) => void;
    onFeatureToggle?: (feature: string, enabled: boolean) => void;
    featureToggles?: Record<string, boolean>;
    onOpenReleaseNotesModal?: () => void;
}

const UserBubble: React.FC<UserBubbleProps> = ({
    user,
    isLocalDev = false,
    onAreasChange,
    onFeatureToggle,
    featureToggles = {},
    onOpenReleaseNotesModal,
}) => {
    // ── State ──
    const [open, setOpen] = useState(false);
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

    // ── Tier ──
    const tier: UserTier = getUserTier(user);

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
    const hasSessionFilters = !!onAreasChange || !!onFeatureToggle;

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

    // Focus trap
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
                aria-label={`My Helix — ${user.FullName || initials}`}
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
                        aria-label="My Helix"
                        tabIndex={-1}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '92vw', maxWidth: 480, maxHeight: '80vh',
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

                        {/* Header — "My Helix" identity strip with inline theme toggle */}
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
                                        <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.accent : colours.blue, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>My Helix</span>
                                        <span style={{ fontSize: 8, fontWeight: 500, color: textMuted, opacity: 0.6 }}>·</span>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                            {user.FullName || `${user.First || ''} ${user.Last || ''}`.trim() || 'User'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                        <span style={{ fontSize: 9, fontWeight: 500, color: textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                            {user.Role || 'Team Member'}
                                        </span>
                                        {user.ClioID && (
                                            <>
                                                <span style={{ fontSize: 8, color: textMuted, opacity: 0.6, flexShrink: 0 }}>·</span>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 600, color: textMuted }}>
                                                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: colours.green, boxShadow: `0 0 4px ${colours.green}60`, flexShrink: 0 }} />
                                                    Clio
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {/* Theme toggle */}
                                <button
                                    onClick={toggleTheme}
                                    style={{
                                        background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : colours.grey,
                                        border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.20)' : borderMedium}`,
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
                                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(135, 243, 243, 0.20)' : borderMedium;
                                        e.currentTarget.style.color = textMuted;
                                    }}
                                    aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                                    title={isDarkMode ? 'Light mode' : 'Dark mode'}
                                >
                                    {isDarkMode ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                                            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                                        </svg>
                                    ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                                        </svg>
                                    )}
                                </button>
                                {/* Close */}
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
                                        e.currentTarget.style.background = isDarkMode ? `${colours.accent}18` : bgHover;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(135, 243, 243, 0.34)' : borderMedium;
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

                        {/* Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                            {/* Today strip */}
                            <TodayStripSection
                                tokens={tokens}
                                userInitials={initials}
                                sessionStartMs={sessionStartRef.current}
                            />

                            {/* My Attention */}
                            <MyAttentionSection
                                tokens={tokens}
                                userInitials={initials}
                            />

                            {/* Quick Links */}
                            <QuickLinksSection
                                tokens={tokens}
                                onOpenReleaseNotes={onOpenReleaseNotesModal}
                                closePopover={() => closePopover()}
                            />

                            {/* Area of Work filters */}
                            {hasSessionFilters && (
                                <SessionFiltersSection
                                    tokens={tokens}
                                    onAreasChange={onAreasChange}
                                    areasOfWork={areasOfWork}
                                    setAreasOfWork={setAreasOfWork}
                                />
                            )}

                            {/* Dev group tier badge — subtle footer for dev preview */}
                            {(tier === 'dev' || tier === 'devGroup') && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '6px 10px', marginTop: 4,
                                    background: isDarkMode ? 'rgba(135, 243, 243, 0.04)' : 'rgba(54, 144, 206, 0.03)',
                                    border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(54, 144, 206, 0.08)'}`,
                                    borderRadius: 0,
                                    fontSize: 8, fontWeight: 600, color: textMuted,
                                    textTransform: 'uppercase', letterSpacing: '0.5px',
                                }}>
                                    <span style={{
                                        width: 4, height: 4, borderRadius: '50%',
                                        background: isDarkMode ? colours.accent : colours.blue,
                                        flexShrink: 0,
                                    }} />
                                    {tier === 'dev' ? 'Dev' : 'Dev Group'}
                                    <span style={{ opacity: 0.5, marginLeft: 'auto', fontWeight: 500 }}>
                                        Tier: {tier}
                                    </span>
                                </div>
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
