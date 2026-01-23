import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import AdminDashboard from './AdminDashboard';
import DemoPromptsModal from './DemoPromptsModal';
import LoadingDebugModal from './debug/LoadingDebugModal';
import { ErrorTracker } from './ErrorTracker';
import asanaIcon from '../assets/asana.svg';
import { UserData } from '../app/functionality/types';
import '../app/styles/UserBubble.css';
import '../app/styles/personas.css';
import { isAdminUser, isPowerUser } from '../app/admin';
import { useTheme } from '../app/functionality/ThemeContext';
import RefreshDataModal from './RefreshDataModal';
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
    const bubbleRef = useRef<HTMLButtonElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedElement = useRef<HTMLElement | null>(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const { isDarkMode, toggleTheme } = useTheme();
    const popoverId = useId();

    // Theme tokens - Communications Dashboard Design System
    const bg = isDarkMode ? '#0f172a' : '#ffffff';
    const bgSecondary = isDarkMode ? '#0f172a' : '#f8fafc';
    const bgTertiary = isDarkMode ? '#1e293b' : '#f1f5f9';
    const bgCard = isDarkMode ? '#1e293b' : '#ffffff';
    const bgHover = isDarkMode ? '#334155' : '#f1f5f9';
    const borderLight = isDarkMode ? '#334155' : '#e2e8f0';
    const borderMedium = isDarkMode ? '#475569' : '#cbd5e1';
    const borderFocus = isDarkMode ? '#60a5fa' : '#3690CE';
    const textPrimary = isDarkMode ? '#f1f5f9' : '#0f172a';
    const textSecondary = isDarkMode ? '#cbd5e1' : '#475569';
    const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
    const textSubtle = isDarkMode ? '#64748b' : '#94a3b8';
    const accentPrimary = isDarkMode ? '#60a5fa' : '#3690CE';
    const accentLight = isDarkMode ? '#1e3a5f' : '#e0f2fe';
    const ctaPrimary = '#D65541';
    const ctaHover = '#b8432f';
    const success = isDarkMode ? '#34d399' : '#10b981';
    const successLight = isDarkMode ? '#064e3b' : '#d1fae5';
    const warning = isDarkMode ? '#fbbf24' : '#f59e0b';
    const warningLight = isDarkMode ? '#451a03' : '#fef3c7';
    
    // Shadows - Communications Dashboard style
    const shadowSm = isDarkMode ? '0 1px 2px rgba(0, 0, 0, 0.2)' : '0 1px 2px rgba(0, 0, 0, 0.04)';
    const shadowMd = isDarkMode ? '0 4px 6px -1px rgba(0, 0, 0, 0.3)' : '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)';
    const shadowLg = isDarkMode ? '0 10px 15px -3px rgba(0, 0, 0, 0.4)' : '0 10px 15px -3px rgba(0, 0, 0, 0.06), 0 4px 6px -2px rgba(0, 0, 0, 0.03)';

    // Avatar treatment
    const avatarBg = isDarkMode
        ? 'linear-gradient(135deg, #061733 0%, #0b1e37 100%)'
        : '#FFFFFF';
    const avatarBorder = isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(148, 163, 184, 0.55)';
    const avatarBorderHover = isDarkMode ? 'rgba(135, 243, 243, 0.55)' : 'rgba(148, 163, 184, 0.75)';
    const avatarShadow = isDarkMode ? '0 3px 12px rgba(0, 0, 0, 0.38)' : shadowSm;
    const avatarShadowHover = isDarkMode ? '0 4px 16px rgba(0, 0, 0, 0.45)' : shadowMd;
    const avatarIcon = isDarkMode ? darkAvatarMark : lightAvatarMark;

    // Legacy support
    const border = borderLight;
    const text = textPrimary;
    const accent = accentPrimary;

    const initials = user.Initials || `${user.First?.charAt(0) || ''}${user.Last?.charAt(0) || ''}`.toUpperCase();
    const isAdmin = isAdminUser(user);
    const isAdminEligible = isAdmin || isLocalDev;

    const adminBadge = (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '3px 8px',
            background: isDarkMode ? 'rgba(255, 183, 77, 0.2)' : 'rgba(255, 152, 0, 0.15)',
            borderRadius: 3,
            fontSize: '9px',
            fontWeight: 700,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
            color: isDarkMode ? '#FFB74D' : '#E65100'
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
            background: isDarkMode ? 'rgba(96, 165, 250, 0.18)' : 'rgba(54, 144, 206, 0.14)',
            borderRadius: 3,
            fontSize: '9px',
            fontWeight: 700,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
            color: isDarkMode ? '#93c5fd' : '#1d4ed8'
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
        function updatePosition() {
            if (!bubbleRef.current) return;
            const rect = bubbleRef.current.getBoundingClientRect();
            const popW = 480, popH = 500;
            const margin = 24; // Safe margin from viewport edges
            const viewportW = window.innerWidth;
            const viewportH = window.innerHeight;

            // Horizontal: anchor to bubble's left edge, clamp to viewport
            let left = rect.left; // prefer lining up with bubble left
            if (left + popW > viewportW - margin) {
                left = viewportW - popW - margin;
            }
            left = Math.max(margin, left);

            // Vertical: prefer below; if not enough space, flip above; then clamp
            let top = rect.bottom + 8;
            if (top + popH > viewportH - margin) {
                top = rect.top - popH - 8;
            }
            top = Math.max(margin, Math.min(top, viewportH - popH - margin));

            setPos({ top, left });
        }
        updatePosition();
        document.body.style.overflow = 'hidden';
        window.addEventListener('resize', updatePosition);
        return () => {
            window.removeEventListener('resize', updatePosition);
            document.body.style.overflow = '';
        };
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

    const copy = (text?: string) => { if (text) navigator.clipboard.writeText(text); };

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
    const asanaDetails = userDetails.filter(d => d.label.toLowerCase().includes('asana'));
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

    // Helper to mask sensitive values
    const maskSecret = (val: string) => val.length > 4 ? val.slice(0, 2) + '****' + val.slice(-2) : '****';

    // Styles - Communications Dashboard Design System
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
    
    const toggleRow: React.CSSProperties = {
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '10px 12px', 
        background: bgCard, 
        border: `1px solid ${borderLight}`,
        borderRadius: '2px',
        cursor: 'pointer', 
        transition: 'all 0.15s ease'
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
        background: bgCard, 
        color: textSecondary,
        border: `1px solid ${borderLight}`, 
        borderRadius: '2px',
        fontSize: 11, 
        fontWeight: 500, 
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all 0.15s ease'
    };
    
    const primaryBtn: React.CSSProperties = {
        ...actionBtn,
        background: accentPrimary,
        borderColor: accentPrimary,
        color: '#ffffff'
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
                            background: isDarkMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)',
                            backdropFilter: 'blur(4px)', 
                            zIndex: 1998
                        }}
                        onClick={() => closePopover()}
                    />
                    <div
                        ref={popoverRef}
                        id={popoverId}
                        role="dialog"
                        aria-modal="true"
                        tabIndex={-1}
                        style={{
                            position: 'fixed', 
                            top: pos.top, 
                            left: pos.left, 
                            width: 480,
                            maxHeight: '85vh', 
                            background: bgCard, 
                            border: `1px solid ${borderLight}`,
                            borderRadius: '2px',
                            boxShadow: shadowLg,
                            overflow: 'hidden', 
                            zIndex: 1999,
                            cursor: 'default'
                        }}
                    >
                        {/* Header - draggable */}
                        <div 
                            style={{ 
                                padding: '16px 20px', 
                                borderBottom: `1px solid ${borderLight}`, 
                                background: bgTertiary,
                                cursor: 'move',
                                userSelect: 'none'
                            }}
                            onMouseDown={(e) => {
                                const startX = e.clientX - pos.left;
                                const startY = e.clientY - pos.top;
                                
                                const handleMouseMove = (moveEvent: MouseEvent) => {
                                    setPos({
                                        top: moveEvent.clientY - startY,
                                        left: moveEvent.clientX - startX
                                    });
                                };
                                
                                const handleMouseUp = () => {
                                    document.removeEventListener('mousemove', handleMouseMove);
                                    document.removeEventListener('mouseup', handleMouseUp);
                                };
                                
                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 44, 
                                    height: 44, 
                                    background: avatarBg, 
                                    border: `2px solid ${success}`,
                                    borderRadius: '2px',
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    padding: 8
                                }}>
                                    <img src={avatarIcon} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: textPrimary, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                        <span style={{ color: textSecondary, fontSize: 13, fontWeight: 700 }}>{initials}</span>
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {user.FullName || `${user.First || ''} ${user.Last || ''}`.trim() || 'User'}
                                        </span>
                                    </div>
                                    <div style={{
                                        marginTop: 4, 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: 4,
                                        padding: '3px 8px', 
                                        background: bgTertiary,
                                        border: `1px solid ${borderLight}`,
                                        borderRadius: '2px',
                                        fontSize: 10, 
                                        fontWeight: 600, 
                                        color: textSecondary
                                    }}>
                                        {user.Role || 'Team Member'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div style={{ maxHeight: 'calc(85vh - 80px)', overflowY: 'auto', padding: '20px' }}>
                            {/* Admin controls (grouped) */}
                            {hasAdminControls && (
                                <div style={{
                                    marginBottom: 20,
                                    padding: '12px 14px',
                                    background: isDarkMode ? 'rgba(255, 183, 77, 0.06)' : 'rgba(255, 152, 0, 0.06)',
                                    border: `1px solid ${isDarkMode ? 'rgba(255, 183, 77, 0.2)' : 'rgba(255, 152, 0, 0.2)'}`,
                                    borderRadius: 4
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                        {adminBadge}
                                        <span style={{ fontSize: '11px', color: textMuted }}>
                                            Admin-only controls{isLocalDev && !isAdmin ? ' (local dev override enabled)' : ''}
                                        </span>
                                        {!isAdminEligible && (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5" style={{ marginLeft: 'auto' }}>
                                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                            </svg>
                                        )}
                                    </div>

                                    {!isAdminEligible && (
                                        <div style={{ fontSize: 11, color: textMuted, marginBottom: 10 }}>
                                            Not available for your account.
                                        </div>
                                    )}

                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 8,
                                        opacity: isAdminEligible ? 1 : 0.55,
                                        pointerEvents: isAdminEligible ? 'auto' : 'none'
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
                                                        if (sel) onUserChange(sel);
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px 12px',
                                                        background: bgCard,
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

                                        {/* Changelog */}
                                        {onOpenReleaseNotesModal && (
                                            <div
                                                style={toggleRow}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.borderColor = borderMedium;
                                                    e.currentTarget.style.background = bgHover;
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.borderColor = borderLight;
                                                    e.currentTarget.style.background = bgCard;
                                                }}
                                                onClick={() => {
                                                    onOpenReleaseNotesModal();
                                                    closePopover();
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Changelog</div>
                                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Changes + product ideas (admin)</div>
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
                                                    e.currentTarget.style.borderColor = borderMedium;
                                                    e.currentTarget.style.background = bgHover;
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.borderColor = borderLight;
                                                    e.currentTarget.style.background = bgCard;
                                                }}
                                                onClick={() => onToggleDemoMode(!demoModeEnabled)}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Demo mode</div>
                                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Skip live refresh & seed demo enquiry</div>
                                                </div>
                                                <div style={toggleSwitch(!!demoModeEnabled)}>
                                                    <div style={toggleKnob(!!demoModeEnabled)} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Dev dashboard (internal tools) */}
                                        {canAccessDevTools && (isAdminUser(user) || isPowerUser(user)) && (
                                            <button
                                                onClick={() => { setShowDevDashboard(true); closePopover(false); }}
                                                style={{
                                                    ...actionBtn,
                                                    background: accentPrimary,
                                                    color: '#fff',
                                                    border: `1px solid ${accentPrimary}`
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = '#2a7ab8';
                                                    e.currentTarget.style.borderColor = '#2a7ab8';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = accentPrimary;
                                                    e.currentTarget.style.borderColor = accentPrimary;
                                                }}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                                                    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                                                </svg>
                                                Dev Dashboard
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Local-only controls (grouped) */}
                            {isLocalDev && (
                                <div style={{
                                    marginBottom: 20,
                                    padding: '12px 14px',
                                    background: isDarkMode ? 'rgba(96, 165, 250, 0.07)' : 'rgba(54, 144, 206, 0.06)',
                                    border: `1px solid ${isDarkMode ? 'rgba(96, 165, 250, 0.22)' : 'rgba(54, 144, 206, 0.22)'}`,
                                    borderRadius: 4
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                        {localBadge}
                                        <span style={{ fontSize: '11px', color: textMuted }}>Localhost-only tools</span>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {/* Rate Change Tracker */}
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.borderColor = borderMedium;
                                                e.currentTarget.style.background = bgHover;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = borderLight;
                                                e.currentTarget.style.background = bgCard;
                                            }}
                                            onClick={() => {
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
                                                e.currentTarget.style.borderColor = borderMedium;
                                                e.currentTarget.style.background = bgHover;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = borderLight;
                                                e.currentTarget.style.background = bgCard;
                                            }}
                                            onClick={() => setShowLoadingDebug(true)}
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
                                                e.currentTarget.style.borderColor = borderMedium;
                                                e.currentTarget.style.background = bgHover;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = borderLight;
                                                e.currentTarget.style.background = bgCard;
                                            }}
                                            onClick={() => setShowErrorTracker(true)}
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
                                                    e.currentTarget.style.borderColor = borderMedium;
                                                    e.currentTarget.style.background = bgHover;
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.borderColor = borderLight;
                                                    e.currentTarget.style.background = bgCard;
                                                }}
                                                onClick={() => onFeatureToggle('viewAsProd', !featureToggles.viewAsProd)}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        View as Production
                                                        {featureToggles.viewAsProd && (
                                                            <span style={{ fontSize: 9, background: textMuted, color: bgCard, padding: '1px 5px', borderRadius: '2px', fontWeight: 700 }}>ACTIVE</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Hide dev features</div>
                                                </div>
                                                <div style={toggleSwitch(!!featureToggles.viewAsProd)}>
                                                    <div style={toggleKnob(!!featureToggles.viewAsProd)} />
                                                </div>
                                            </div>
                                        )}

                                        {/* Demo prompts */}
                                        <div
                                            style={toggleRow}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.borderColor = borderMedium;
                                                e.currentTarget.style.background = bgHover;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = borderLight;
                                                e.currentTarget.style.background = bgCard;
                                            }}
                                            onClick={() => { setShowDemoPrompts(true); closePopover(); }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Todo List</div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Local demo prompts</div>
                                            </div>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                                <path d="M9 18l6-6-6-6"/>
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            

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
                                        e.currentTarget.style.borderColor = borderMedium;
                                        e.currentTarget.style.background = bgHover;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = borderLight;
                                        e.currentTarget.style.background = bgCard;
                                    }}
                                    onClick={() => toggleTheme()}
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
                                    <div style={{ background: bgTertiary, border: `1px solid ${borderLight}`, borderRadius: '2px', padding: 12 }}>
                                        <div style={{ fontSize: 10, fontWeight: 500, color: textMuted, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Areas of Work</span>
                                            <span style={{ opacity: 0.7 }}>{areasOfWork.length > 0 ? `${areasOfWork.length} active` : 'All'}</span>
                                        </div>
                                        <div style={{ display: 'grid', gap: 2 }}>
                                            {AVAILABLE_AREAS.map(area => {
                                                const checked = areasOfWork.includes(area);
                                                return (
                                                    <label key={area} style={{
                                                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                                        padding: '6px 8px', 
                                                        background: checked ? bgHover : 'transparent',
                                                        borderRadius: '2px',
                                                        border: `1px solid ${checked ? borderMedium : 'transparent'}`,
                                                        transition: 'all 0.15s ease'
                                                    }}>
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
                                                                accentColor: textSecondary,
                                                                cursor: 'pointer'
                                                            }}
                                                        />
                                                        <span style={{ fontSize: 11, fontWeight: 500, color: checked ? textPrimary : textSecondary }}>{area}</span>
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
                                            background: bgTertiary,
                                            border: `1px solid ${borderLight}`,
                                            borderRadius: '2px',
                                            padding: 12
                                        }}>
                                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: textMuted, opacity: 0.8, marginBottom: 3 }}>{d.label}</div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary }}>{d.value}</div>
                                        </div>
                                    ))}
                                    {regularDetails.filter(d => d.isRole).map(d => (
                                        <div key={d.label} style={{
                                            background: bgTertiary,
                                            border: `1px solid ${borderLight}`,
                                            borderRadius: '2px',
                                            padding: 12
                                        }}>
                                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: textMuted, opacity: 0.8, marginBottom: 3 }}>{d.label}</div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: textPrimary }}>{d.value}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Profile Details (collapsible) */}
                            <details style={{ marginBottom: 20 }}>
                                <summary style={{
                                    padding: '10px 12px', 
                                    background: bgTertiary, 
                                    border: `1px solid ${borderLight}`,
                                    borderRadius: '2px',
                                    fontSize: 11, 
                                    fontWeight: 600, 
                                    color: textPrimary, 
                                    cursor: 'pointer',
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 8, 
                                    listStyle: 'none',
                                    transition: 'all 0.15s ease'
                                }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                                    </svg>
                                    <span style={{ flex: 1 }}>Profile Fields</span>
                                    <span style={{ fontSize: 10, opacity: 0.6 }}>{regularDetails.length}</span>
                                </summary>
                                <div style={{ marginTop: 2, display: 'grid', gap: 2, padding: 12, background: bgTertiary, border: `1px solid ${borderLight}`, borderTop: 'none', borderRadius: '0 0 2px 2px' }}>
                                    {regularDetails.filter(d => !d.isRate && !d.isRole).map(d => (
                                        <div key={d.label} style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            padding: '8px 10px', 
                                            background: bgCard, 
                                            border: `1px solid ${borderLight}`, 
                                            borderRadius: '2px',
                                            gap: 8,
                                            transition: 'all 0.15s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = borderMedium;
                                            e.currentTarget.style.boxShadow = shadowSm;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = borderLight;
                                            e.currentTarget.style.boxShadow = 'none';
                                        }}
                                        >
                                            <span style={{ fontSize: 10, fontWeight: 600, color: textMuted, minWidth: 70 }}>{d.label}</span>
                                            <span style={{ fontSize: 11, color: textPrimary, flex: 1, wordBreak: 'break-word' }}>{d.value}</span>
                                            <button 
                                                onClick={() => copy(d.value)} 
                                                style={{ 
                                                    background: 'transparent', 
                                                    border: `1px solid ${borderLight}`, 
                                                    borderRadius: '2px',
                                                    color: textSecondary, 
                                                    fontSize: 9, 
                                                    cursor: 'pointer', 
                                                    padding: '3px 6px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = bgHover;
                                                    e.currentTarget.style.borderColor = borderMedium;
                                                    e.currentTarget.style.color = textPrimary;
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'transparent';
                                                    e.currentTarget.style.borderColor = borderLight;
                                                    e.currentTarget.style.color = textSecondary;
                                                }}
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </details>

                            {/* Asana Details (collapsible) - secrets masked */}
                            {asanaDetails.length > 0 && (
                                <details style={{ marginBottom: 20 }}>
                                    <summary style={{
                                        padding: '10px 12px', 
                                        background: bgTertiary, 
                                        border: `1px solid ${borderLight}`,
                                        borderRadius: '2px',
                                        fontSize: 11, 
                                        fontWeight: 600, 
                                        color: textPrimary, 
                                        cursor: 'pointer',
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: 8, 
                                        listStyle: 'none',
                                        transition: 'all 0.15s ease'
                                    }}>
                                        <img
                                            src={asanaIcon}
                                            alt=""
                                            style={{
                                                width: 12,
                                                height: 12,
                                                opacity: 0.9,
                                                filter: isDarkMode ? 'brightness(0) invert(1)' : 'none',
                                            }}
                                        />
                                        <span style={{ flex: 1 }}>Asana Integration</span>
                                        <span style={{ fontSize: 10, opacity: 0.6 }}>{asanaDetails.length}</span>
                                    </summary>
                                    <div style={{ marginTop: 2, display: 'grid', gap: 2, padding: 12, background: bgTertiary, border: `1px solid ${borderLight}`, borderTop: 'none', borderRadius: '0 0 2px 2px' }}>
                                        {asanaDetails.map(d => {
                                            const isSensitive = d.label.toLowerCase().includes('token') || d.label.toLowerCase().includes('secret') || d.label.toLowerCase().includes('key') || d.label.toLowerCase().includes('gid');
                                            return (
                                                <div key={d.label} style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    padding: '8px 10px', 
                                                    background: bgCard, 
                                                    border: `1px solid ${borderLight}`, 
                                                    borderRadius: '2px',
                                                    gap: 8
                                                }}>
                                                    <span style={{ fontSize: 10, fontWeight: 600, color: textMuted, minWidth: 60 }}>{d.label}</span>
                                                    <span style={{ 
                                                        fontSize: 10, 
                                                        color: isSensitive ? textMuted : textPrimary, 
                                                        flex: 1, 
                                                        wordBreak: 'break-word', 
                                                        fontFamily: 'monospace'
                                                    }}>
                                                        {isSensitive ? maskSecret(d.value) : d.value}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </details>
                            )}

                            {/* Actions - streamlined */}
                            <div>
                                <div style={sectionTitle}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                    </svg>
                                    Actions
                                </div>
                                <div style={{ display: 'grid', gap: '1px' }}>
                                    <button 
                                        onClick={() => setShowRefreshModal(true)} 
                                        style={actionBtn}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = borderMedium;
                                            e.currentTarget.style.background = bgHover;
                                            e.currentTarget.style.color = textPrimary;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = borderLight;
                                            e.currentTarget.style.background = bgCard;
                                            e.currentTarget.style.color = textSecondary;
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                        </svg>
                                        Refresh Data…
                                    </button>

                                    {originalAdminUser && onReturnToAdmin && (
                                        <button 
                                            onClick={() => { onReturnToAdmin(); closePopover(); }} 
                                            style={{ 
                                                ...actionBtn, 
                                                background: ctaPrimary, 
                                                color: '#fff', 
                                                border: `1px solid ${ctaPrimary}`
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = ctaHover;
                                                e.currentTarget.style.borderColor = ctaHover;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = ctaPrimary;
                                                e.currentTarget.style.borderColor = ctaPrimary;
                                            }}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M19 12H5M12 19l-7-7 7-7"/>
                                            </svg>
                                            Return to Admin View
                                        </button>
                                    )}

                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {showDevDashboard && <AdminDashboard isOpen={showDevDashboard} onClose={() => setShowDevDashboard(false)} inspectorData={user} />}
            {isLocalDev && showDemoPrompts && <DemoPromptsModal isOpen={showDemoPrompts} onClose={() => setShowDemoPrompts(false)} />}
            {isLocalDev && showLoadingDebug && <LoadingDebugModal isOpen={showLoadingDebug} onClose={() => setShowLoadingDebug(false)} />}
            {isLocalDev && showErrorTracker && <ErrorTracker onClose={() => setShowErrorTracker(false)} />}
        </div>
    );
};

export default UserBubble;
