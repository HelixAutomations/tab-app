import React, { useState, useRef, useEffect, useId, useCallback, useMemo } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import AdminDashboard from './AdminDashboard';
import DemoPromptsModal from './DemoPromptsModal';
import LoadingDebugModal from './debug/LoadingDebugModal';
import { ErrorTracker } from './ErrorTracker';
import { UserData } from '../app/functionality/types';
import '../app/styles/UserBubble.css';
import '../app/styles/personas.css';
import { isAdminUser, isPowerUser } from '../app/admin';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import RefreshDataModal from './RefreshDataModal';
import LegacyMigrationTool from './LegacyMigrationTool';
import lightAvatarMark from '../assets/dark blue mark.svg';
import darkAvatarMark from '../assets/markwhite.svg';

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
}

const AVAILABLE_AREAS = ['Commercial', 'Construction', 'Property', 'Employment', 'Misc/Other'];
type BubbleToastTone = 'info' | 'success' | 'warning';

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
    onShowTestEnquiry,
    demoModeEnabled = false,
    onToggleDemoMode,
    onOpenReleaseNotesModal,
}) => {
    const [open, setOpen] = useState(false);
    const [showDevDashboard, setShowDevDashboard] = useState(false);
    const [showRefreshModal, setShowRefreshModal] = useState(false);
    const [showDemoPrompts, setShowDemoPrompts] = useState(false);
    const [showLoadingDebug, setShowLoadingDebug] = useState(false);
    const [showErrorTracker, setShowErrorTracker] = useState(false);
    const [showMigrationTool, setShowMigrationTool] = useState(false);
    const [adminCollapsed, setAdminCollapsed] = useState(true);
    const [localCollapsed, setLocalCollapsed] = useState(true);
    const [toast, setToast] = useState<{ message: string; tone: BubbleToastTone } | null>(null);
    const [sessionElapsed, setSessionElapsed] = useState('');
    const bubbleRef = useRef<HTMLButtonElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedElement = useRef<HTMLElement | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionStartRef = useRef<number>(Date.now());
    const { isDarkMode, toggleTheme } = useTheme();
    const popoverId = useId();

    // Theme tokens â€“ derived strictly from colours.ts brand values
    // Dark depth: websiteBlue (#000319) â†’ darkBlue (#061733) â†’ sectionBg (#051525) â†’ helixBlue hover (#0D2F60)
    const bg = isDarkMode ? colours.websiteBlue : '#ffffff';
    const bgSecondary = isDarkMode ? colours.darkBlue : colours.grey;
    const bgTertiary = isDarkMode ? colours.dark.sectionBackground : colours.grey;
    const controlRowBg = isDarkMode ? colours.darkBlue : bgTertiary;
    const bgHover = isDarkMode ? colours.helixBlue : colours.light.cardHover;
    const borderLight = isDarkMode ? colours.dark.border : colours.highlightNeutral;
    const borderMedium = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
    const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
    const textSecondary = isDarkMode ? colours.dark.subText : colours.greyText;
    const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
    const accentPrimary = colours.blue;
    const helixSwatches = [
        { key: 'dark-blue', label: 'Dark Blue', color: colours.websiteBlue },
        { key: 'blue', label: 'Blue', color: colours.darkBlue },
        { key: 'light-blue', label: 'Light Blue', color: colours.missedBlue },
        { key: 'highlight-blue', label: 'Highlight Blue', color: colours.blue },
        { key: 'accent', label: 'Accent', color: colours.accent },
        { key: 'red', label: 'Red', color: colours.cta },
        { key: 'helix-grey', label: 'Helix Grey', color: colours.grey },
    ];
    const ctaPrimary = colours.cta;
    const success = colours.green;
    
    // Shadows â€“ Helix aligned
    const shadowSm = isDarkMode ? '0 1px 2px rgba(0, 3, 25, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.04)';
    const shadowMd = isDarkMode ? '0 4px 6px -1px rgba(0, 3, 25, 0.35)' : '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)';

    // Avatar treatment â€“ brand tokens
    const avatarBg = isDarkMode
        ? colours.darkBlue
        : colours.light.cardBackground;
    const avatarBorder = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
    const avatarBorderHover = isDarkMode ? colours.blue : colours.subtleGrey;
    const avatarShadow = isDarkMode ? '0 3px 12px rgba(0, 3, 25, 0.4)' : shadowSm;
    const avatarShadowHover = isDarkMode ? '0 4px 16px rgba(0, 3, 25, 0.5)' : shadowMd;
    const avatarIcon = isDarkMode ? darkAvatarMark : lightAvatarMark;

    const initials = user.Initials || `${user.First?.charAt(0) || ''}${user.Last?.charAt(0) || ''}`.toUpperCase();
    const isAdmin = isAdminUser(user);
    const isAdminEligible = isAdmin || isLocalDev;

    const adminBadge = (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            background: isDarkMode ? 'rgba(214, 85, 65, 0.16)' : 'rgba(214, 85, 65, 0.1)',
            borderRadius: 3,
            fontSize: '9px',
            fontWeight: 700,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
            color: colours.cta
        }}>
            <Icon iconName="Shield" style={{ fontSize: '10px' }} />
            Admin
        </div>
    );

    const localBadge = (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            background: isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.14)',
            borderRadius: 3,
            fontSize: '9px',
            fontWeight: 700,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
            color: isDarkMode ? colours.blue : colours.helixBlue
        }}>
            <Icon iconName="LaptopSecure" style={{ fontSize: '10px' }} />
            Local
        </div>
    );

    const closePopover = useCallback((restoreFocus = true) => {
        setOpen(false);
        if (restoreFocus && (previouslyFocusedElement.current || bubbleRef.current)) {
            (previouslyFocusedElement.current || bubbleRef.current)?.focus();
        }
        previouslyFocusedElement.current = null;
    }, []);

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

    const showToast = useCallback((message: string, tone: BubbleToastTone = 'info') => {
        setToast({ message, tone });
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
            setToast(null);
            toastTimerRef.current = null;
        }, 1800);
    }, []);

    useEffect(() => {
        return () => {
            if (toastTimerRef.current) {
                clearTimeout(toastTimerRef.current);
            }
        };
    }, []);

    // Session elapsed timer — ticks every 30s while modal is open
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

    // Environment detection
    const environment = useMemo(() => {
        if (isLocalDev) return 'Local';
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        if (host.includes('staging') || host.includes('uat')) return 'Staging';
        return 'Production';
    }, [isLocalDev]);

    // Active state flags — surfaces altered-state awareness
    const activeStates = useMemo(() => {
        const states: string[] = [];
        if (demoModeEnabled) states.push('Demo mode');
        if (featureToggles.viewAsProd) states.push('Production view');
        if (originalAdminUser) states.push(`Viewing as ${user.FullName || user.Initials}`);
        return states;
    }, [demoModeEnabled, featureToggles.viewAsProd, originalAdminUser, user.FullName, user.Initials]);

    // Quick navigate handler
    const quickNav = useCallback((event: string, label: string) => {
        showToast(`Opening ${label}`, 'info');
        window.dispatchEvent(new CustomEvent(event));
        closePopover();
    }, [showToast, closePopover]);

    const copy = async (text?: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard', 'success');
        } catch {
            showToast('Copy failed', 'warning');
        }
    };

    // Build user details
    const detailsMap = new Map<string, { label: string; value: string; isRate?: boolean; isRole?: boolean }>();
    Object.entries(user as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .forEach(([key, value]) => {
            const c = key.replace(/[\s_]/g, '').toLowerCase();
            if (c === 'aow' || c.includes('refreshtoken') || c.includes('refresh_token')) return;
            if (!detailsMap.has(c)) {
                detailsMap.set(c, {
                    label: key.replace(/_/g, ' '),
                    value: String(value),
                    isRate: c === 'rate',
                    isRole: c === 'role'
                });
            }
        });
    const userDetails = Array.from(detailsMap.values());
    const regularDetails = userDetails.filter(d => !d.label.toLowerCase().includes('asana'));

    // Areas of work
    const getInitialAreas = (): string[] => {
        const aow = user.AOW || (user as any).Area_of_Work || (user as any).aow;
        return aow ? String(aow).split(',').map(s => s.trim()).filter(Boolean) : [];
    };
    const [areasOfWork, setAreasOfWork] = useState<string[]>(getInitialAreas);

    const canSwitchUser = isAdminUser(user);
    const userInitials = (user.Initials || '').toUpperCase();
    const canAccessDevTools = isLocalDev || userInitials === 'LZ' || userInitials === 'CB';

    const hasAdminControls =
        !!(onUserChange && availableUsers) ||
        !!onToggleDemoMode ||
        !!onOpenReleaseNotesModal ||
        !!canAccessDevTools;

    // Styles – Communications Dashboard Design System
    const rowBaseBackground = isDarkMode
        ? `linear-gradient(90deg, rgba(54, 144, 206, 0.10) 0%, rgba(54, 144, 206, 0.00) 42%), ${controlRowBg}`
        : controlRowBg;
    const rowHoverBackground = isDarkMode
        ? `linear-gradient(90deg, rgba(54, 144, 206, 0.18) 0%, rgba(54, 144, 206, 0.00) 50%), ${bgHover}`
        : bgHover;
    const rowBaseShadow = isDarkMode
        ? 'inset 0 0 0 1px rgba(54, 144, 206, 0.05)'
        : 'none';
    const rowHoverShadow = isDarkMode
        ? '0 8px 18px rgba(0, 3, 25, 0.42)'
        : '0 4px 12px rgba(6, 23, 51, 0.08)';

    const applyRowHover = (element: HTMLElement) => {
        element.style.borderColor = borderMedium;
        element.style.background = rowHoverBackground;
        element.style.transform = 'translateY(-1px)';
        element.style.boxShadow = rowHoverShadow;
    };

    const resetRowHover = (element: HTMLElement) => {
        element.style.borderColor = borderLight;
        element.style.background = rowBaseBackground;
        element.style.transform = 'translateY(0)';
        element.style.boxShadow = rowBaseShadow;
    };

    const sectionAccent = isDarkMode ? colours.accent : colours.highlight;
    const sectionTitle: React.CSSProperties = {
        fontSize: 10, 
        fontWeight: 600, 
        color: textMuted, 
        textTransform: 'uppercase',
        letterSpacing: '0.5px', 
        marginBottom: 8, 
        display: 'flex', 
        alignItems: 'center', 
        gap: 6
    };
    const sectionTitleAccented: React.CSSProperties = {
        ...sectionTitle,
        color: sectionAccent,
    };

    // AoW colour mapping for filter indicators
    const aowColour = (area: string): string => {
        const a = area.toLowerCase();
        if (a.includes('commercial')) return colours.blue;
        if (a.includes('construction')) return colours.orange;
        if (a.includes('property')) return colours.green;
        if (a.includes('employment')) return colours.yellow;
        return colours.greyText;
    };

    // AoW icon mapping (canonical emoji set)
    const aowIcon = (area: string): string => {
        const a = area.toLowerCase();
        if (a.includes('commercial')) return '🏢';
        if (a.includes('construction')) return '🏗️';
        if (a.includes('property')) return '🏠';
        if (a.includes('employment')) return '👩🏻‍💼';
        return 'ℹ️';
    };
    
    const toggleRow: React.CSSProperties = {
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '10px 12px', 
        background: rowBaseBackground,
        border: `1px solid ${borderLight}`,
        borderRadius: '2px',
        cursor: 'pointer', 
        boxShadow: rowBaseShadow,
        transform: 'translateY(0)',
        transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease'
    };
    
    const toggleSwitch = (on: boolean): React.CSSProperties => ({
        width: 36, 
        height: 18, 
        background: on ? accentPrimary : borderMedium,
        borderRadius: '2px',
        position: 'relative', 
        transition: 'all 0.2s ease', 
        flexShrink: 0
    });
    
    const toggleKnob = (on: boolean): React.CSSProperties => ({
        width: 14, 
        height: 14, 
        background: '#fff', 
        borderRadius: '1px',
        position: 'absolute', 
        top: 2, 
        left: on ? 20 : 2,
        transition: 'all 0.2s ease', 
        boxShadow: shadowSm
    });
    
    const actionBtn: React.CSSProperties = {
        width: '100%', 
        padding: '10px 12px', 
        background: rowBaseBackground,
        color: textSecondary,
        border: `1px solid ${borderLight}`, 
        borderRadius: '2px',
        fontSize: 11, 
        fontWeight: 500, 
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        boxShadow: rowBaseShadow,
        transform: 'translateY(0)',
        transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease'
    };
    


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
                            try { window.alert('Refresh complete.'); } catch {}
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
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    width: 32, 
                    height: 32, 
                    background: avatarBg,
                    border: `1px solid ${avatarBorder}`, 
                    borderRadius: '2px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
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

            {open && (
                <>
                    <div
                        style={{
                            position: 'fixed', 
                            inset: 0, 
                            background: isDarkMode ? 'rgba(0, 3, 25, 0.85)' : 'rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(8px)', 
                            zIndex: 1998,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
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
                            width: '92vw',
                            maxWidth: 600,
                            maxHeight: '80vh', 
                            background: isDarkMode ? colours.websiteBlue : '#ffffff', 
                            border: `1px solid ${borderLight}`,
                            borderRadius: '2px',
                            boxShadow: isDarkMode
                                ? '0 24px 48px rgba(0, 3, 25, 0.6), 0 0 0 1px rgba(54, 144, 206, 0.08)'
                                : '0 24px 48px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
                            overflow: 'hidden', 
                            zIndex: 1999,
                            cursor: 'default',
                            animation: 'commandCenterIn 0.25s ease forwards',
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative'
                        }}
                    >
                        {toast && (
                            <div
                                className={`user-bubble-toast user-bubble-toast-${toast.tone}`}
                                role="status"
                                aria-live="polite"
                            >
                                {toast.message}
                            </div>
                        )}

                        {/* Header — compact identity strip */}
                        <div 
                            style={{ 
                                padding: '12px 20px', 
                                borderBottom: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.08)' : borderLight}`, 
                                background: isDarkMode ? colours.websiteBlue : colours.grey,
                                flexShrink: 0
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 32, 
                                    height: 32, 
                                    background: avatarBg, 
                                    border: `1.5px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : borderLight}`,
                                    borderRadius: '2px',
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    padding: 5,
                                    flexShrink: 0
                                }}>
                                    <img src={avatarIcon} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: textSecondary }}>{initials}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {user.FullName || `${user.First || ''} ${user.Last || ''}`.trim() || 'User'}
                                    </span>
                                    <span style={{ fontSize: 9, fontWeight: 500, color: textMuted, marginLeft: 2 }}>
                                        {user.Role || 'Team Member'}
                                    </span>
                                </div>
                                {/* Rate + Clio readiness cluster */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                    {user.Rate && (
                                        <span style={{ fontSize: 11, fontWeight: 700, color: accentPrimary, letterSpacing: '-0.3px' }}>
                                            £{user.Rate}
                                        </span>
                                    )}
                                    {user.ClioID && (
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            fontSize: 9,
                                            fontWeight: 600,
                                            color: textMuted,
                                            letterSpacing: '0.2px'
                                        }}>
                                            <span style={{
                                                width: 5, height: 5,
                                                borderRadius: '50%',
                                                background: colours.green,
                                                boxShadow: `0 0 4px ${colours.green}60`,
                                                flexShrink: 0
                                            }} />
                                            Clio {user.ClioID}
                                        </span>
                                    )}
                                    {!user.ClioID && (
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            fontSize: 9,
                                            fontWeight: 600,
                                            color: colours.cta,
                                            letterSpacing: '0.2px'
                                        }}>
                                            <span style={{
                                                width: 5, height: 5,
                                                borderRadius: '50%',
                                                background: colours.cta,
                                                flexShrink: 0
                                            }} />
                                            No Clio
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => closePopover()}
                                    style={{
                                        background: 'transparent',
                                        border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.10)' : borderLight}`,
                                        borderRadius: '2px',
                                        color: textMuted,
                                        cursor: 'pointer',
                                        padding: '5px 6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.15s ease',
                                        flexShrink: 0
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = borderMedium;
                                        e.currentTarget.style.color = textPrimary;
                                        e.currentTarget.style.background = isDarkMode ? colours.darkBlue : bgHover;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.10)' : borderLight;
                                        e.currentTarget.style.color = textMuted;
                                        e.currentTarget.style.background = 'transparent';
                                    }}
                                    aria-label="Close"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Environment ribbon */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '4px 20px',
                            background: isDarkMode ? colours.websiteBlue : '#fafafa',
                            borderBottom: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.06)' : borderLight}`,
                            fontSize: 9,
                            fontWeight: 600,
                            color: textMuted,
                            letterSpacing: '0.3px',
                            flexShrink: 0
                        }}>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '1px 6px',
                                background: isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.04)',
                                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.10)'}`,
                                borderRadius: '2px',
                                color: environment === 'Production' ? colours.green : environment === 'Staging' ? colours.orange : colours.blue,
                                fontWeight: 700,
                                textTransform: 'uppercase' as const,
                                letterSpacing: '0.5px',
                                fontSize: 8
                            }}>
                                <span style={{
                                    width: 4, height: 4,
                                    borderRadius: '50%',
                                    background: environment === 'Production' ? colours.green : environment === 'Staging' ? colours.orange : colours.blue,
                                    ...(environment !== 'Production' ? { animation: 'userBubbleToastPulse 2s ease-in-out infinite alternate' } : {})
                                }} />
                                {environment}
                            </span>
                            <span style={{ opacity: 0.45, fontSize: 8 }}>{typeof window !== 'undefined' ? window.location.host : ''}</span>
                            <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 8 }}>
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 2, verticalAlign: '-1px' }}>
                                    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                                </svg>
                                {sessionElapsed}
                            </span>
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

                            {/* Active state warnings */}
                            {activeStates.length > 0 && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '8px 12px',
                                    marginBottom: 16,
                                    background: isDarkMode ? 'rgba(214, 85, 65, 0.10)' : 'rgba(214, 85, 65, 0.06)',
                                    border: `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.30)' : 'rgba(214, 85, 65, 0.20)'}`,
                                    borderRadius: '2px',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: colours.cta
                                }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                    {activeStates.join(' · ')}
                                </div>
                            )}

                            {/* Quick Navigate */}
                            <div style={{ marginBottom: 16 }}>
                                <div style={sectionTitleAccented}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={sectionAccent} strokeWidth="2">
                                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                                        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                                    </svg>
                                    Quick Navigate
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
                                    {[
                                        { event: 'navigateToEnquiries', label: 'Enquiries', icon: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z' },
                                        { event: 'navigateToInstructions', label: 'Instructions', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2' },
                                        { event: 'navigateToMatter', label: 'Matters', icon: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
                                        { event: 'navigateToReporting', label: 'Reporting', icon: 'M18 20V10M12 20V4M6 20v-6' },
                                    ].map(nav => (
                                        <button
                                            key={nav.event}
                                            onClick={() => quickNav(nav.event, nav.label)}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: 5,
                                                padding: '10px 6px',
                                                background: isDarkMode ? controlRowBg : bgTertiary,
                                                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.12)' : borderLight}`,
                                                borderRadius: '2px',
                                                cursor: 'pointer',
                                                color: textSecondary,
                                                fontSize: 9,
                                                fontWeight: 600,
                                                letterSpacing: '0.3px',
                                                boxShadow: 'none',
                                                transform: 'translateY(0)',
                                                transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease, color 0.2s ease'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = isDarkMode ? colours.helixBlue : bgHover;
                                                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.28)' : borderMedium;
                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                                e.currentTarget.style.boxShadow = isDarkMode
                                                    ? '0 4px 12px rgba(0, 3, 25, 0.5)'
                                                    : '0 2px 8px rgba(6, 23, 51, 0.08)';
                                                e.currentTarget.style.color = textPrimary;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = isDarkMode ? controlRowBg : bgTertiary;
                                                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.12)' : borderLight;
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = 'none';
                                                e.currentTarget.style.color = textSecondary;
                                            }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                                <path d={nav.icon}/>
                                            </svg>
                                            {nav.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Admin controls (grouped) — always visible, collapsible */}
                            <div style={{
                                marginBottom: 20,
                                padding: '0',
                                background: isDarkMode ? colours.darkBlue : colours.grey,
                                border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                                borderRadius: 4,
                                overflow: 'hidden',
                            }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '10px 14px',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s ease',
                                        background: 'transparent',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    onClick={() => setAdminCollapsed(prev => !prev)}
                                >
                                    {adminBadge}
                                    <span style={{ fontSize: '11px', color: textMuted, flex: 1 }}>
                                        Admin-only controls{isLocalDev && !isAdmin ? ' (local dev override)' : ''}
                                    </span>
                                    {!isAdminEligible && (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                        </svg>
                                    )}
                                    <svg
                                        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                                        style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: adminCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                                    >
                                        <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                </div>

                                {/* Collapsible body */}
                                <div style={{
                                    maxHeight: adminCollapsed ? 0 : 600,
                                    opacity: adminCollapsed ? 0 : 1,
                                    overflow: 'hidden',
                                    transition: 'max-height 0.25s ease, opacity 0.2s ease, padding 0.25s ease',
                                    padding: adminCollapsed ? '0 14px' : '0 14px 12px 14px',
                                }}>
                                    {!isAdminEligible && !adminCollapsed && (
                                        <div style={{ fontSize: 10, color: textMuted, marginBottom: 8, fontStyle: 'italic' }}>
                                            Restricted — admin or local access required.
                                        </div>
                                    )}

                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 8,
                                        opacity: isAdminEligible ? 1 : 0.35,
                                        pointerEvents: isAdminEligible ? 'auto' : 'none',
                                        filter: isAdminEligible ? 'none' : 'grayscale(0.6)',
                                    }}>
                                        {/* Switch user */}
                                        {onUserChange && availableUsers && (
                                            <div style={{ opacity: canSwitchUser ? 1 : 0.75 }}>
                                                <div style={{ ...sectionTitle, color: textMuted, marginBottom: 6 }}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                                    </svg>
                                                    Switch User
                                                    {!canSwitchUser && (
                                                        <span style={{ marginLeft: 'auto', fontSize: 10, color: textMuted }}>Admin only</span>
                                                    )}
                                                </div>
                                                <select
                                                    disabled={!canSwitchUser}
                                                    onChange={(e) => {
                                                        const sel = availableUsers.find(u => u.Initials === e.target.value);
                                                        if (sel) {
                                                            onUserChange(sel);
                                                            showToast(`Switched to ${sel.FullName || sel.Initials}`, 'success');
                                                        }
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px 12px',
                                                        background: controlRowBg,
                                                        color: canSwitchUser ? textPrimary : textMuted,
                                                        border: `1px solid ${borderLight}`,
                                                        borderRadius: '2px',
                                                        fontSize: 11,
                                                        cursor: canSwitchUser ? 'pointer' : 'not-allowed'
                                                    }}
                                                >
                                                    <option value="">{canSwitchUser ? 'Select user...' : 'Admin only'}</option>
                                                    {canSwitchUser && availableUsers
                                                        .filter(u => !u.status || u.status.toLowerCase() === 'active')
                                                        .map(u => (
                                                            <option key={u.Initials} value={u.Initials}>{u.FullName || `${u.First || ''} ${u.Last || ''}`}</option>
                                                        ))}
                                                </select>
                                            </div>
                                        )}

                                        {/* What's New */}
                                        {onOpenReleaseNotesModal && (
                                            <div
                                                style={toggleRow}
                                                onMouseEnter={(e) => {
                                                    applyRowHover(e.currentTarget);
                                                }}
                                                onMouseLeave={(e) => {
                                                    resetRowHover(e.currentTarget);
                                                }}
                                                onClick={() => {
                                                    showToast('Opening release notes', 'info');
                                                    onOpenReleaseNotesModal();
                                                    closePopover();
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Release Notes</div>
                                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Platform updates and improvements</div>
                                                </div>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                    <path d="M9 18l6-6-6-6"/>
                                                </svg>
                                            </div>
                                        )}

                                        {/* Demo mode */}
                                        {onToggleDemoMode && (
                                            <div
                                                style={toggleRow}
                                                onMouseEnter={(e) => {
                                                    applyRowHover(e.currentTarget);
                                                }}
                                                onMouseLeave={(e) => {
                                                    resetRowHover(e.currentTarget);
                                                }}
                                                onClick={() => {
                                                    const nextDemoMode = !demoModeEnabled;
                                                    onToggleDemoMode(nextDemoMode);
                                                    showToast(nextDemoMode ? 'Demo mode enabled' : 'Demo mode disabled', nextDemoMode ? 'success' : 'warning');
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Demo mode</div>
                                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Skip live refresh & seed demo prospect cases</div>
                                                </div>
                                                <div style={toggleSwitch(!!demoModeEnabled)}>
                                                    <div style={toggleKnob(!!demoModeEnabled)} />
                                                </div>
                                            </div>
                                        )}


                                    </div>
                                </div>
                            </div>

                            {/* Local-only controls (grouped) — always visible, collapsible */}
                            <div style={{
                                marginBottom: 20,
                                padding: '0',
                                background: isDarkMode ? colours.darkBlue : colours.grey,
                                border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                                borderRadius: 4,
                                overflow: 'hidden',
                            }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '10px 14px',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s ease',
                                        background: 'transparent',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    onClick={() => setLocalCollapsed(prev => !prev)}
                                >
                                    {localBadge}
                                    <span style={{ fontSize: '11px', color: textMuted, flex: 1 }}>Localhost-only</span>
                                    {!isLocalDev && (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                        </svg>
                                    )}
                                    <svg
                                        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                                        style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: localCollapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                                    >
                                        <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                </div>

                                {/* Collapsible body */}
                                <div style={{
                                    maxHeight: localCollapsed ? 0 : 1200,
                                    opacity: localCollapsed ? 0 : 1,
                                    overflow: 'hidden',
                                    transition: 'max-height 0.3s ease, opacity 0.2s ease, padding 0.3s ease',
                                    padding: localCollapsed ? '0 14px' : '0 14px 12px 14px',
                                }}>
                                    {!isLocalDev && !localCollapsed && (
                                        <div style={{ fontSize: 10, color: textMuted, marginBottom: 8, fontStyle: 'italic' }}>
                                            Restricted — local development cluster only.
                                        </div>
                                    )}

                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 8,
                                        opacity: isLocalDev ? 1 : 0.35,
                                        pointerEvents: isLocalDev ? 'auto' : 'none',
                                        filter: isLocalDev ? 'none' : 'grayscale(0.6)',
                                    }}>
                                        {/* Dev Dashboard */}
                                        <button
                                            onClick={() => { setShowDevDashboard(true); closePopover(false); }}
                                            style={{
                                                ...actionBtn,
                                                background: accentPrimary,
                                                color: '#fff',
                                                border: `1px solid ${accentPrimary}`
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.filter = 'brightness(0.85)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.filter = 'none';
                                            }}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                                                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                                            </svg>
                                            Dev Dashboard
                                        </button>

                                        {/* Rate Change Tracker */}
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            onClick={() => {
                                                showToast('Opening rate change tracker', 'info');
                                                window.dispatchEvent(new CustomEvent('openRateChangeModal'));
                                                closePopover();
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Rate Change Tracker</div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Jan 2026 rate notifications</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M9 18l6-6-6-6"/>
                                            </svg>
                                        </div>

                                        {/* Debug modals */}
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            onClick={() => {
                                                showToast('Opening loading debug', 'info');
                                                setShowLoadingDebug(true);
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Loading Debug</div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Test loading screens</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M9 18l6-6-6-6"/>
                                            </svg>
                                        </div>
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            onClick={() => {
                                                showToast('Opening error tracker', 'info');
                                                setShowErrorTracker(true);
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Error Tracker</div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>View runtime errors</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M9 18l6-6-6-6"/>
                                            </svg>
                                        </div>

                                        {/* View as production */}
                                        {onFeatureToggle && (
                                            <div
                                                style={toggleRow}
                                                onMouseEnter={(e) => {
                                                    applyRowHover(e.currentTarget);
                                                }}
                                                onMouseLeave={(e) => {
                                                    resetRowHover(e.currentTarget);
                                                }}
                                                onClick={() => {
                                                    const nextViewAsProd = !featureToggles.viewAsProd;
                                                    onFeatureToggle('viewAsProd', nextViewAsProd);
                                                    showToast(nextViewAsProd ? 'Production view active' : 'Production view off', nextViewAsProd ? 'success' : 'warning');
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        View as Production
                                                        {featureToggles.viewAsProd && (
                                                            <span style={{ fontSize: 9, background: textMuted, color: bg, padding: '1px 5px', borderRadius: '2px', fontWeight: 700 }}>ACTIVE</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Hide dev features</div>
                                                </div>
                                                <div style={toggleSwitch(!!featureToggles.viewAsProd)}>
                                                    <div style={toggleKnob(!!featureToggles.viewAsProd)} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Show Attendance toggle */}
                                        {onFeatureToggle && (
                                            <div
                                                style={toggleRow}
                                                onMouseEnter={(e) => {
                                                    applyRowHover(e.currentTarget);
                                                }}
                                                onMouseLeave={(e) => {
                                                    resetRowHover(e.currentTarget);
                                                }}
                                                onClick={() => {
                                                    const next = !featureToggles.showAttendance;
                                                    onFeatureToggle('showAttendance', next);
                                                    showToast(next ? 'Attendance visible' : 'Attendance hidden', next ? 'success' : 'warning');
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        Show Attendance
                                                        {featureToggles.showAttendance && (
                                                            <span style={{ fontSize: 9, background: textMuted, color: bg, padding: '1px 5px', borderRadius: '2px', fontWeight: 700 }}>ON</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Toggle attendance section on Home</div>
                                                </div>
                                                <div style={toggleSwitch(!!featureToggles.showAttendance)}>
                                                    <div style={toggleKnob(!!featureToggles.showAttendance)} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Replay metric animations */}
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            onClick={() => {
                                                showToast('Replaying animations', 'info');
                                                window.dispatchEvent(new CustomEvent('replayMetricAnimation'));
                                                closePopover();
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Replay Animations</div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Re-run metric count-up</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                                            </svg>
                                        </div>

                                        {/* Demo prompts */}
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            onClick={() => {
                                                showToast('Opening local todo prompts', 'info');
                                                setShowDemoPrompts(true);
                                                closePopover();
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Todo List</div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Local demo prompts</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M9 18l6-6-6-6"/>
                                            </svg>
                                        </div>

                                        {/* Pipeline Migration */}
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            onClick={() => {
                                                showToast('Opening migration tool', 'info');
                                                setShowMigrationTool(true);
                                                closePopover(false);
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    Pipeline Migration
                                                    <span style={{ fontSize: 8, fontWeight: 700, color: colours.blue, padding: '1px 5px', background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.06)', border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.20)' : 'rgba(54, 144, 206, 0.12)'}`, borderRadius: '2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>v1</span>
                                                </div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Migrate legacy Clio matters into the pipeline</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M9 18l6-6-6-6"/>
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            
                            

                            {/* Appearance */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={sectionTitle}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>
                                        <line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/>
                                        <line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                                    </svg>
                                    Appearance
                                </div>
                                <div 
                                    style={toggleRow} 
                                    onMouseEnter={(e) => {
                                        applyRowHover(e.currentTarget);
                                    }}
                                    onMouseLeave={(e) => {
                                        resetRowHover(e.currentTarget);
                                    }}
                                    onClick={() => {
                                        toggleTheme();
                                        showToast(`Switched to ${isDarkMode ? 'light' : 'dark'} mode`, 'success');
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {isDarkMode ? (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textPrimary} strokeWidth="2">
                                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                                            </svg>
                                        ) : (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textPrimary} strokeWidth="2">
                                                <circle cx="12" cy="12" r="5"/>
                                            </svg>
                                        )}
                                        <span style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>{isDarkMode ? 'Dark' : 'Light'} Mode</span>
                                    </div>
                                    <div style={toggleSwitch(isDarkMode)}>
                                        <div style={toggleKnob(isDarkMode)} />
                                    </div>
                                </div>

                                {/* Helix Palette Swatches */}
                                <div style={{
                                    marginTop: 12,
                                    padding: '10px 14px',
                                    background: isDarkMode ? colours.darkBlue : colours.grey,
                                    border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                                    borderRadius: 2,
                                }}>
                                    <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: textMuted, marginBottom: 8, opacity: 0.7 }}>Helix Palette</div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        {helixSwatches.map((swatch) => (
                                            <div
                                                key={swatch.key}
                                                title={`${swatch.label} — click to copy ${swatch.color}`}
                                                onClick={() => { navigator.clipboard.writeText(swatch.color); showToast(`Copied ${swatch.color}`, 'info'); }}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: 3,
                                                    cursor: 'pointer',
                                                    flex: 1,
                                                    minWidth: 0,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        width: 24,
                                                        height: 24,
                                                        background: swatch.color,
                                                        borderRadius: 2,
                                                        border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}44` : `${colours.darkBlue}20`}`,
                                                        display: 'block',
                                                        boxSizing: 'border-box',
                                                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.transform = 'scale(1.5)';
                                                        e.currentTarget.style.boxShadow = `0 2px 8px ${swatch.color}44`;
                                                        e.currentTarget.style.zIndex = '10';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.transform = 'scale(1)';
                                                        e.currentTarget.style.boxShadow = 'none';
                                                        e.currentTarget.style.zIndex = '0';
                                                    }}
                                                />
                                                <span style={{ fontSize: 6, color: textMuted, fontWeight: 600, letterSpacing: 0.1, whiteSpace: 'nowrap' }}>{swatch.label}</span>
                                                <span style={{ fontSize: 5, color: textMuted, fontFamily: 'monospace', letterSpacing: 0.3, opacity: 0.6 }}>{swatch.color}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Areas Filter */}
                            {onAreasChange && (
                                <div style={{ marginBottom: 20 }}>
                                    <div style={sectionTitle}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round"/>
                                        </svg>
                                        Session Filters
                                    </div>
                                    <div style={{ background: isDarkMode ? colours.darkBlue : colours.grey, border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`, borderRadius: '2px', padding: 12 }}>
                                        <div style={{ fontSize: 10, fontWeight: 500, color: textMuted, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Areas of Work</span>
                                            <span style={{ opacity: 0.7 }}>{areasOfWork.length > 0 ? `${areasOfWork.length} active` : 'All'}</span>
                                        </div>
                                        <div style={{ display: 'grid', gap: 2 }}>
                                            {AVAILABLE_AREAS.map(area => {
                                                const checked = areasOfWork.includes(area);
                                                const areaCol = aowColour(area);
                                                return (
                                                    <label key={area} style={{
                                                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                                        padding: '6px 8px', 
                                                        background: checked ? (isDarkMode ? colours.helixBlue : colours.highlightBlue) : 'transparent',
                                                        borderRadius: '2px',
                                                        borderLeft: `3px solid ${checked ? areaCol : 'transparent'}`,
                                                        borderTop: `1px solid ${checked ? (isDarkMode ? `${colours.blue}44` : colours.highlightNeutral) : 'transparent'}`,
                                                        borderRight: `1px solid ${checked ? (isDarkMode ? `${colours.blue}44` : colours.highlightNeutral) : 'transparent'}`,
                                                        borderBottom: `1px solid ${checked ? (isDarkMode ? `${colours.blue}44` : colours.highlightNeutral) : 'transparent'}`,
                                                        transition: 'all 0.15s ease'
                                                    }}>
                                                        <span style={{
                                                            width: 6, height: 6,
                                                            borderRadius: '50%',
                                                            background: areaCol,
                                                            opacity: checked ? 1 : 0.4,
                                                            flexShrink: 0,
                                                            transition: 'opacity 0.15s ease'
                                                        }} />
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                const newAreas = e.target.checked
                                                                    ? [...areasOfWork, area]
                                                                    : areasOfWork.filter(a => a !== area);
                                                                setAreasOfWork(newAreas);
                                                                onAreasChange(newAreas);
                                                            }}
                                                            style={{ 
                                                                width: 14, 
                                                                height: 14, 
                                                                accentColor: areaCol,
                                                                cursor: 'pointer'
                                                            }}
                                                        />
                                                        <span style={{ fontSize: 11, fontWeight: 500, color: checked ? textPrimary : textSecondary }}>{aowIcon(area)} {area}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        {areasOfWork.length > 0 && (
                                            <button
                                                onClick={() => { setAreasOfWork([]); onAreasChange([]); }}
                                                style={{
                                                    width: '100%', 
                                                    marginTop: 8, 
                                                    padding: '6px 8px', 
                                                    background: 'transparent',
                                                    color: ctaPrimary, 
                                                    border: `1px solid ${ctaPrimary}30`,
                                                    borderRadius: '2px',
                                                    fontSize: 10, 
                                                    fontWeight: 500, 
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = `${ctaPrimary}10`;
                                                    e.currentTarget.style.borderColor = ctaPrimary;
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'transparent';
                                                    e.currentTarget.style.borderColor = `${ctaPrimary}30`;
                                                }}
                                            >
                                                Clear All Filters
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Quick Stats */}
                            {(regularDetails.some(d => d.isRate) || regularDetails.some(d => d.isRole)) && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
                                    {regularDetails.filter(d => d.isRate).map(d => (
                                        <div key={d.label} style={{
                                            background: isDarkMode ? colours.darkBlue : colours.grey,
                                            border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                                            borderRadius: '2px',
                                            padding: '14px 16px'
                                        }}>
                                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: textMuted, marginBottom: 6 }}>{d.label}</div>
                                            <div style={{ fontSize: 18, fontWeight: 700, color: isDarkMode ? colours.accent : colours.blue, letterSpacing: '-0.5px' }}>{d.value}</div>
                                        </div>
                                    ))}
                                    {regularDetails.filter(d => d.isRole).map(d => (
                                        <div key={d.label} style={{
                                            background: isDarkMode ? colours.darkBlue : colours.grey,
                                            border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                                            borderRadius: '2px',
                                            padding: '14px 16px'
                                        }}>
                                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: textMuted, marginBottom: 6 }}>{d.label}</div>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{d.value}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Profile — curated key fields only */}
                            {regularDetails.filter(d => !d.isRate && !d.isRole).length > 0 && (
                                <div style={{
                                    marginBottom: 20,
                                    padding: '12px 14px',
                                    background: isDarkMode ? colours.darkBlue : colours.grey,
                                    border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                                    borderRadius: 4
                                }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: textMuted, marginBottom: 10, opacity: 0.8 }}>Profile</div>
                                    <div style={{ display: 'grid', gap: 2 }}>
                                        {regularDetails.filter(d => !d.isRate && !d.isRole).map(d => (
                                            <div key={d.label} style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                padding: '7px 10px', 
                                                background: controlRowBg, 
                                                border: `1px solid ${borderLight}`, 
                                                borderRadius: '2px',
                                                gap: 8,
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => {
                                                applyRowHover(e.currentTarget);
                                            }}
                                            onMouseLeave={(e) => {
                                                resetRowHover(e.currentTarget);
                                            }}
                                            >
                                                <span style={{ fontSize: 9, fontWeight: 600, color: textMuted, minWidth: 65, textTransform: 'uppercase', letterSpacing: 0.3 }}>{d.label}</span>
                                                <span style={{ fontSize: 11, color: textPrimary, flex: 1, wordBreak: 'break-word' }}>{d.value}</span>
                                                <button 
                                                    onClick={() => copy(d.value)} 
                                                    style={{ 
                                                        background: 'transparent', 
                                                        border: 'none', 
                                                        color: textMuted, 
                                                        fontSize: 9, 
                                                        cursor: 'pointer', 
                                                        padding: '2px 4px',
                                                        opacity: 0.5,
                                                        transition: 'opacity 0.15s ease'
                                                    }}
                                                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                                                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}
                                                >
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Quick actions footer */}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button 
                                    onClick={() => setShowRefreshModal(true)} 
                                    style={{
                                        ...actionBtn,
                                        flex: 1,
                                        justifyContent: 'center'
                                    }}
                                    onMouseEnter={(e) => {
                                        applyRowHover(e.currentTarget);
                                        e.currentTarget.style.color = textPrimary;
                                    }}
                                    onMouseLeave={(e) => {
                                        resetRowHover(e.currentTarget);
                                        e.currentTarget.style.color = textSecondary;
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
                                            flex: 1,
                                            justifyContent: 'center',
                                            background: ctaPrimary, 
                                            color: '#fff', 
                                            border: `1px solid ${ctaPrimary}`
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.filter = 'brightness(0.85)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.filter = 'none';
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                                        </svg>
                                        Return to Admin
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    </div>
                </>
            )}

            {isLocalDev && showDevDashboard && <AdminDashboard isOpen={showDevDashboard} onClose={() => setShowDevDashboard(false)} inspectorData={user} />}
            {isLocalDev && showDemoPrompts && <DemoPromptsModal isOpen={showDemoPrompts} onClose={() => setShowDemoPrompts(false)} />}
            {isLocalDev && showLoadingDebug && <LoadingDebugModal isOpen={showLoadingDebug} onClose={() => setShowLoadingDebug(false)} />}
            {isLocalDev && showErrorTracker && <ErrorTracker onClose={() => setShowErrorTracker(false)} />}
            {isLocalDev && showMigrationTool && <LegacyMigrationTool isOpen={showMigrationTool} onClose={() => setShowMigrationTool(false)} />}
        </div>
    );
};

export default UserBubble;
