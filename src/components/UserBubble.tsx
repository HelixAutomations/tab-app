import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import DataInspector from './DataInspector';
import AdminDashboard from './AdminDashboard';
// invisible change 2
import { UserData } from '../app/functionality/types';
import '../app/styles/UserBubble.css';
import '../app/styles/personas.css';
import { isAdminUser, isPowerUser } from '../app/admin';
import { useTheme } from '../app/functionality/ThemeContext';
import RefreshDataModal from './RefreshDataModal';

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
}

const AVAILABLE_AREAS = [
    'Commercial',
    'Construction', 
    'Property',
    'Employment',
    'Misc/Other'
];

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
}) => {
    const [open, setOpen] = useState(false);
    const [isClickToggled, setIsClickToggled] = useState(false);
    const [showDataInspector, setShowDataInspector] = useState(false);
    const [showAdminDashboard, setShowAdminDashboard] = useState(false);
    const [showRefreshModal, setShowRefreshModal] = useState(false);
    const bubbleRef = useRef<HTMLButtonElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedElement = useRef<HTMLElement | null>(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const { isDarkMode, toggleTheme } = useTheme();
    const popoverId = useId();
    const headingId = `${popoverId}-heading`;
    const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const popoverSurface = isDarkMode ? '#0f172a' : '#ffffff';
    const popoverBorderColor = isDarkMode ? 'rgba(148,163,184,0.25)' : '#e5e7eb';
    const popoverShadow = isDarkMode ? '0 24px 64px rgba(3,7,18,0.7)' : '0 20px 60px rgba(0,0,0,0.25)';
    const headerSurface = isDarkMode ? '#111827' : '#f8fafc';
    const headerTextMuted = isDarkMode ? '#94a3b8' : '#64748b';
    const headerBorder = isDarkMode ? '1px solid rgba(148,163,184,0.12)' : '1px solid #e2e8f0';
    const headingPrimary = isDarkMode ? '#e2e8f0' : '#374151';
    const headingSecondary = isDarkMode ? '#94a3b8' : '#6b7280';
    const avatarSurface = isDarkMode ? 'rgba(148,163,184,0.16)' : '#e2e8f0';
    const avatarText = isDarkMode ? '#cbd5f5' : '#64748b';
    const subtleSurface = isDarkMode ? 'rgba(30,41,59,0.75)' : '#fafbfc';
    const subtleBorder = isDarkMode ? '1px solid rgba(148,163,184,0.16)' : '1px solid #f1f3f4';
    const subtleText = isDarkMode ? '#cbd5f5' : '#374151';
    const mutedText = isDarkMode ? '#94a3b8' : '#6b7280';
    const highlightSurface = isDarkMode ? 'rgba(34,197,94,0.18)' : '#f0fdf4';
    const highlightBorder = isDarkMode ? '1px solid rgba(34,197,94,0.35)' : '1px solid #b7eb8f';
    const highlightText = isDarkMode ? '#bbf7d0' : '#217a2b';
    const warningSurface = isDarkMode ? 'rgba(251,191,36,0.18)' : '#fff4e5';
    const warningBorder = isDarkMode ? '1px solid rgba(251,191,36,0.4)' : '1px solid #ffd591';
    const warningText = isDarkMode ? '#facc15' : '#b26a00';

    const initials =
        user.Initials ||
        `${user.First?.charAt(0) || ''}${user.Last?.charAt(0) || ''}`.toUpperCase();

    // Simple passcode gate for Admin Dashboard; default '2011', can be overridden via env
    const verifyAdminPasscode = useCallback((): boolean => {
        const expected = (process.env.REACT_APP_ADMIN_PASSCODE || '2011').toString();
        const input = window.prompt('Enter admin passcode');
        if (input === null) return false;
        const ok = input.trim() === expected;
        if (!ok) {
            // Minimal feedback; avoid logging the expected value
            window.alert('Incorrect passcode');
        }
        return ok;
    }, []);

    const closePopover = useCallback((restoreFocus: boolean = true) => {
        setOpen(false);
        setIsClickToggled(false);
        if (restoreFocus) {
            const target = previouslyFocusedElement.current || bubbleRef.current;
            previouslyFocusedElement.current = null;
            if (target && typeof target.focus === 'function') {
                target.focus();
            }
        } else {
            previouslyFocusedElement.current = null;
        }
    }, []);

    useEffect(() => {
        // Persist current user initials for debugging features
        localStorage.setItem('__currentUserInitials', (user.Initials || '').toLowerCase());
    }, [user]);

    useEffect(() => {
        function updatePosition() {
            if (!bubbleRef.current) return;

            const bubbleRect = bubbleRef.current.getBoundingClientRect();
            const popoverElement = popoverRef.current;
            const measuredRect = popoverElement?.getBoundingClientRect();
            const popoverWidth = measuredRect?.width ?? 320;
            const popoverHeight = measuredRect?.height ?? 400;

            let left = bubbleRect.left;
            let top = bubbleRect.bottom + 8;

            if (left + popoverWidth > window.innerWidth - 16) {
                left = Math.max(16, window.innerWidth - popoverWidth - 16);
            }
            if (left < 16) left = 16;

            if (top + popoverHeight > window.innerHeight - 16) {
                top = bubbleRect.top - popoverHeight - 8;
            }
            if (top < 16) top = 16;

            setPos({ top, left });
        }
        
        if (open) {
            updatePosition();
            // Prevent body scroll when popover is open
            const originalOverflow = document.body.style.overflow;
            const originalPaddingRight = document.body.style.paddingRight;
            document.body.style.overflow = 'hidden';
            const scrollBarCompensation = window.innerWidth - document.documentElement.clientWidth;
            if (scrollBarCompensation > 0) {
                document.body.style.paddingRight = `${scrollBarCompensation}px`;
            }
            
            window.addEventListener('resize', updatePosition);
            window.addEventListener('scroll', updatePosition, true);
            
            return () => {
                window.removeEventListener('resize', updatePosition);
                window.removeEventListener('scroll', updatePosition, true);
                document.body.style.overflow = originalOverflow;
                document.body.style.paddingRight = originalPaddingRight;
            };
        }
    }, [open]);

    // Handle click outside to close popover
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                open &&
                bubbleRef.current &&
                popoverRef.current &&
                !bubbleRef.current.contains(event.target as Node) &&
                !popoverRef.current.contains(event.target as Node)
            ) {
                closePopover();
            }
        }
        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [open, closePopover]);

    // Trap focus within the popover and allow ESC to close
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closePopover();
                return;
            }

            if (event.key === 'Tab' && popoverRef.current) {
                const focusable = Array.from(popoverRef.current.querySelectorAll<HTMLElement>(focusableSelector))
                    .filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

                if (focusable.length === 0) {
                    event.preventDefault();
                    popoverRef.current.focus();
                    return;
                }

                const firstElement = focusable[0];
                const lastElement = focusable[focusable.length - 1];
                const activeElement = document.activeElement as HTMLElement | null;

                if (event.shiftKey) {
                    if (!activeElement || activeElement === firstElement || activeElement === popoverRef.current) {
                        event.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    if (activeElement === lastElement) {
                        event.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, closePopover, focusableSelector]);

    // Automatically focus the popover or first interactive control on open
    useEffect(() => {
        if (!open) return;

        const frame = window.requestAnimationFrame(() => {
            if (!popoverRef.current) return;
            const focusable = popoverRef.current.querySelectorAll<HTMLElement>(focusableSelector);
            const first = focusable.length > 0 ? focusable[0] : popoverRef.current;
            first.focus();
        });

        return () => window.cancelAnimationFrame(frame);
    }, [open, focusableSelector]);

    const copy = (text?: string) => {
        if (text) navigator.clipboard.writeText(text);
    };

    // Display all available fields from the user object.
    // Deduplicate keys that differ only by spacing or underscores.
    const detailsMap = new Map<string, { label: string; value: string; isAsana: boolean; isSecret: boolean; isRate?: boolean; isRole?: boolean }>();
    let foundRate = false, foundRole = false;
    Object.entries(user as Record<string, unknown>)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .forEach(([key, value]) => {
            const canonical = key.replace(/[\s_]/g, '').toLowerCase();
            if (canonical === 'aow') return; // handled separately
            // Hide refresh token completely
            if (canonical.includes('refreshtoken') || canonical.includes('refresh_token')) return;
            const isAsana = canonical.includes('asana');
            const isSecret = canonical.includes('secret') || canonical.includes('token');
            const isRate = canonical === 'rate';
            const isRole = canonical === 'role';
            if (isRate) foundRate = true;
            if (isRole) foundRole = true;
            if (!detailsMap.has(canonical)) {
                detailsMap.set(canonical, {
                    label: key.replace(/_/g, ' '),
                    value: String(value),
                    isAsana,
                    isSecret,
                    isRate,
                    isRole
                });
            }
        });
    const userDetails = Array.from(detailsMap.values());
    const regularDetails = userDetails.filter((detail) => !detail.isAsana);
    const asanaDetails = userDetails.filter((detail) => detail.isAsana);
    
    // State for showing Asana details
    const [showAsanaDetails, setShowAsanaDetails] = useState(false);

    // Extract and format areas of work with local state to persist changes
    const getInitialAreas = (): string[] => {
        if (user.AOW) {
            return String(user.AOW).split(',').map(s => s.trim()).filter(Boolean);
        } else if ((user as any).Area_of_Work) {
            return String((user as any).Area_of_Work).split(',').map(s => s.trim()).filter(Boolean);
        } else if ((user as any).aow) {
            return String((user as any).aow).split(',').map(s => s.trim()).filter(Boolean);
        }
        return [];
    };
    
    const [areasOfWork, setAreasOfWork] = useState<string[]>(getInitialAreas);
    const [hasUserInitialized, setHasUserInitialized] = useState(false);
    
    // Initialize areas when user first loads, but don't reset on subsequent user changes
    // to preserve manual overrides
    useEffect(() => {
        const devVerbose = process.env.NODE_ENV === 'development' && process.env.REACT_APP_DEBUG_VERBOSE === 'true';
        if (devVerbose) {
            // eslint-disable-next-line no-console
            console.info('UserBubble init:', { user: user?.Initials, hasUserInitialized, currentAOW: user?.AOW });
        }
        if (user && !hasUserInitialized) {
            const initialAreas = getInitialAreas();
            if (devVerbose) {
                // eslint-disable-next-line no-console
                console.info('UserBubble: initializing areas for first time:', initialAreas);
            }
            setAreasOfWork(initialAreas);
            setHasUserInitialized(true);
        } else if (user && hasUserInitialized) {
            if (devVerbose) {
                // eslint-disable-next-line no-console
                console.info('UserBubble: user changed but already initialized - not resetting areas');
            }
        }
    }, [user, hasUserInitialized]);

    // Normalize potential fields to lower case and trim whitespace so
    // production data with trailing spaces or nickname variations still match.
    const canSwitchUser = isAdminUser(user);

    // Local dev: check for Rate/Role presence
    const showLocalDevBanner = isLocalDev;
    const missingFields = [];
    if (showLocalDevBanner) {
        if (!foundRate) missingFields.push('Rate');
        if (!foundRole) missingFields.push('Role');
    }
    return (
        <div className="user-bubble-container">
            {/* Refresh Modal */}
            {showRefreshModal && (
                <RefreshDataModal
                    isOpen={showRefreshModal}
                    onClose={() => setShowRefreshModal(false)}
                    onConfirm={async ({ clientCaches, enquiries, matters, reporting }) => {
                        try {
                            // Client caches: clear localStorage keys used by app
                            if (clientCaches) {
                                const keys = Object.keys(localStorage);
                                const toRemove = keys.filter(k => {
                                    const lower = k.toLowerCase();
                                    return (
                                        lower.startsWith('enquiries-') ||
                                        lower.startsWith('normalizedmatters-v5-') ||
                                        lower.startsWith('vnetmatters-') ||
                                        lower.startsWith('matters-') ||
                                        lower === 'allmatters' ||
                                        lower === 'teamdata' ||
                                        lower.includes('outstandingbalancesdata')
                                    );
                                });
                                toRemove.forEach(k => localStorage.removeItem(k));
                            }

                            // Server-side clears via scopes
                            const clearScopes: string[] = [];
                            if (reporting) clearScopes.push('reporting');
                            if (enquiries) clearScopes.push('enquiries');
                            if (matters) clearScopes.push('unified');
                            for (const scope of clearScopes) {
                                try {
                                    await fetch('/api/cache/clear-cache', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ scope })
                                    });
                                } catch (e) {
                                    // eslint-disable-next-line no-console
                                    console.warn('Cache clear failed for scope', scope, e);
                                }
                            }

                            // Trigger client-side fetches where handlers exist
                            if (enquiries && onRefreshEnquiries) await onRefreshEnquiries();
                            if (matters && onRefreshMatters) await onRefreshMatters();
                        } finally {
                            setShowRefreshModal(false);
                            // Provide a simple confirmation
                            try { window.alert('Refresh complete.'); } catch {}
                        }
                    }}
                />
            )}

            <button
                type="button"
                className={`user-bubble-button persona-bubble ${isLocalDev && onAreasChange ? 'clickable-local-dev' : ''}`}
                ref={bubbleRef}
                onClick={() => {
                    if (open) {
                        closePopover();
                    } else {
                        previouslyFocusedElement.current = document.activeElement instanceof HTMLElement
                            ? document.activeElement
                            : null;
                        setOpen(true);
                        setIsClickToggled(true);
                    }
                }}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: '#061733',
                    border: '0.25px solid rgba(255, 255, 255, 0.15)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                }}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? popoverId : undefined}
                aria-label={`User menu for ${user.FullName || initials}`}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#061733';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#061733';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                }}
            >
                <img
                    src={require('../assets/grey helix mark.png')}
                    alt="User Profile"
                    style={{
                        width: '20px',
                        height: '20px'
                    }}
                />
            </button>
            
            {open && (
                <>
                    {/* Backdrop */}
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: isDarkMode 
                                ? 'rgba(0, 0, 0, 0.6)'
                                : 'rgba(0, 0, 0, 0.25)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 1998,
                            animation: 'fadeIn 0.2s ease forwards'
                        }}
                        onClick={() => {
                            closePopover();
                        }}
                    />
                    
                    {/* Popover */}
                    <div
                        ref={popoverRef}
                        id={popoverId}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={headingId}
                        tabIndex={-1}
                        style={{
                            position: 'fixed',
                            top: pos.top,
                            left: pos.left,
                            width: '360px',
                            maxHeight: '85vh',
                            background: isDarkMode 
                                ? 'rgba(15, 23, 42, 0.98)'
                                : 'rgba(255, 255, 255, 0.98)',
                            borderRadius: '16px',
                            boxShadow: isDarkMode
                                ? '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 1px rgba(54, 144, 206, 0.3)'
                                : '0 20px 60px rgba(0, 0, 0, 0.15), 0 0 1px rgba(54, 144, 206, 0.2)',
                            border: isDarkMode 
                                ? '1px solid rgba(54, 144, 206, 0.2)'
                                : '1px solid rgba(203, 213, 225, 0.3)',
                            overflow: 'hidden',
                            zIndex: 1999,
                            backdropFilter: 'blur(20px)',
                            animation: 'fadeInUp 0.2s ease forwards'
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            background: headerSurface,
                            padding: '20px',
                            borderBottom: isDarkMode ? '1px solid rgba(54, 144, 206, 0.15)' : '1px solid rgba(54, 144, 206, 0.1)',
                            position: 'relative',
                            overflow: 'hidden'
                        }} id={headingId}>
                            
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', position: 'relative' }}>
                                {/* Avatar with green gradient border to indicate availability */}
                                <div style={{
                                    position: 'relative',
                                    flexShrink: 0
                                }}>
                                    <div style={{
                                        width: '52px',
                                        height: '52px',
                                        borderRadius: '50%',
                                        background: 'transparent',
                                        border: isDarkMode
                                            ? '2px solid rgba(34, 197, 94, 0.35)'
                                            : '2px solid rgba(16, 185, 129, 0.4)',
                                        padding: '3px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: isDarkMode
                                            ? '0 1px 2px rgba(0, 0, 0, 0.35)'
                                            : '0 1px 2px rgba(0, 0, 0, 0.15)'
                                    }}>
                                        <div style={{
                                            width: '100%',
                                            height: '100%',
                                            borderRadius: '50%',
                                            background: isDarkMode ? '#0f172a' : '#ffffff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: '8px'
                                        }}>
                                            <img
                                                src={require('../assets/grey helix mark.png')}
                                                alt="Helix Logo"
                                                style={{
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'contain',
                                                    filter: isDarkMode ? 'none' : 'brightness(0) saturate(100%) invert(13%) sepia(100%) saturate(2087%) hue-rotate(214deg) brightness(96%) contrast(97%)',
                                                    opacity: 1
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                {/* User info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {/* Initials & Full Name on same line */}
                                    <div style={{ 
                                        fontSize: '15px', 
                                        fontWeight: '700',
                                        marginBottom: '6px',
                                        color: isDarkMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(6, 23, 51, 0.95)',
                                        display: 'flex',
                                        alignItems: 'baseline',
                                        gap: '8px',
                                        flexWrap: 'wrap'
                                    }}>
                                        <span style={{ 
                                            color: '#3690CE',
                                            fontSize: '14px',
                                            fontWeight: '800',
                                            letterSpacing: '0.5px'
                                        }}>
                                            {initials}
                                        </span>
                                        <span style={{ 
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {user.FullName || `${user.First || ''} ${user.Last || ''}`.trim() || 'User Profile'}
                                        </span>
                                    </div>
                                    
                                    {/* Role badge */}
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        background: isDarkMode 
                                            ? 'rgba(54, 144, 206, 0.12)'
                                            : 'rgba(54, 144, 206, 0.08)',
                                        border: isDarkMode
                                            ? '1px solid rgba(54, 144, 206, 0.25)'
                                            : '1px solid rgba(54, 144, 206, 0.15)',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        color: isDarkMode ? 'rgba(135, 243, 243, 0.95)' : '#3690CE',
                                        letterSpacing: '0.3px'
                                    }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                                        </svg>
                                        {user.Role || 'Team Member'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div style={{
                            maxHeight: 'calc(85vh - 110px)',
                            overflowY: 'auto',
                            padding: '16px 20px 20px'
                        }}>
                            {/* Area of Work Filter - PRIORITY SECTION */}
                            {onAreasChange && (
                                <div style={{ marginBottom: '20px' }}>
                                    <h4 style={{
                                        margin: '0 0 10px 0',
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        color: '#3690CE',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round"/>
                                        </svg>
                                        Session Filters
                                    </h4>
                                    <div style={{
                                        background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)',
                                        border: isDarkMode ? '1px solid rgba(54, 144, 206, 0.25)' : '1px solid rgba(54, 144, 206, 0.15)',
                                        borderRadius: '6px',
                                        padding: '12px'
                                    }}>
                                        <div style={{ 
                                            marginBottom: '8px', 
                                            fontSize: '11px', 
                                            fontWeight: '500',
                                            color: isDarkMode ? 'rgba(135, 243, 243, 0.9)' : '#3690CE',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}>
                                            <span>Areas of Work</span>
                                            <span style={{ fontSize: '10px', fontWeight: '400', opacity: 0.7 }}>
                                                {areasOfWork.length > 0 ? `${areasOfWork.length} active` : 'All areas'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'grid', gap: '6px' }}>
                                            {AVAILABLE_AREAS.map(area => {
                                                const isChecked = areasOfWork.includes(area);
                                                return (
                                                    <label key={area} style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        cursor: 'pointer',
                                                        padding: '8px 10px',
                                                        borderRadius: '4px',
                                                        background: isChecked 
                                                            ? (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.08)')
                                                            : 'transparent',
                                                        border: isChecked
                                                            ? (isDarkMode ? '1px solid rgba(54, 144, 206, 0.35)' : '1px solid rgba(54, 144, 206, 0.25)')
                                                            : '1px solid transparent',
                                                        transition: 'all 0.15s ease',
                                                        fontSize: '11px',
                                                        fontWeight: isChecked ? '600' : '500',
                                                        color: isChecked 
                                                            ? (isDarkMode ? 'rgba(135, 243, 243, 0.95)' : '#3690CE')
                                                            : mutedText
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!isChecked) {
                                                            e.currentTarget.style.background = isDarkMode ? 'rgba(148,163,184,0.08)' : 'rgba(0,0,0,0.02)';
                                                            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(0,0,0,0.08)';
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!isChecked) {
                                                            e.currentTarget.style.background = 'transparent';
                                                            e.currentTarget.style.borderColor = 'transparent';
                                                        }
                                                    }}
                                                    >
                                                        {/* Custom checkbox with brand blue tick */}
                                                        <div style={{
                                                            position: 'relative',
                                                            width: '16px',
                                                            height: '16px',
                                                            flexShrink: 0
                                                        }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={(e) => {
                                                                    const newAreas = e.target.checked
                                                                        ? [...areasOfWork, area]
                                                                        : areasOfWork.filter(a => a !== area);
                                                                    console.log('🔄 Area change:', { area, checked: e.target.checked, currentAreas: areasOfWork, newAreas });
                                                                    setAreasOfWork(newAreas);
                                                                    if (onAreasChange) {
                                                                        console.log('📤 Calling onAreasChange with:', newAreas);
                                                                        onAreasChange(newAreas);
                                                                    }
                                                                }}
                                                                style={{ 
                                                                    position: 'absolute',
                                                                    opacity: 0,
                                                                    width: '16px',
                                                                    height: '16px',
                                                                    cursor: 'pointer',
                                                                    margin: 0
                                                                }}
                                                            />
                                                            <div style={{
                                                                width: '16px',
                                                                height: '16px',
                                                                borderRadius: '3px',
                                                                border: isChecked 
                                                                    ? '2px solid #3690CE' 
                                                                    : `2px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(0,0,0,0.2)'}`,
                                                                background: isChecked 
                                                                    ? '#3690CE' 
                                                                    : 'transparent',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                transition: 'all 0.15s ease',
                                                                pointerEvents: 'none'
                                                            }}>
                                                                {isChecked && (
                                                                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                                                        <path 
                                                                            d="M1 4L3.5 6.5L9 1" 
                                                                            stroke="white" 
                                                                            strokeWidth="2" 
                                                                            strokeLinecap="round" 
                                                                            strokeLinejoin="round"
                                                                        />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span>{area}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        {areasOfWork.length > 0 && (
                                            <button
                                                onClick={() => {
                                                    setAreasOfWork([]);
                                                    if (onAreasChange) {
                                                        onAreasChange([]);
                                                    }
                                                }}
                                                style={{
                                                    width: '100%',
                                                    marginTop: '8px',
                                                    padding: '6px 8px',
                                                    background: 'transparent',
                                                    color: isDarkMode ? 'rgba(248, 113, 113, 0.9)' : '#ef4444',
                                                    border: isDarkMode ? '1px solid rgba(248, 113, 113, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                                                    borderRadius: '4px',
                                                    fontSize: '10px',
                                                    fontWeight: '500',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = isDarkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(239, 68, 68, 0.08)';
                                                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(248, 113, 113, 0.5)' : 'rgba(239, 68, 68, 0.5)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'transparent';
                                                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(248, 113, 113, 0.3)' : 'rgba(239, 68, 68, 0.3)';
                                                }}
                                            >
                                                Clear All Filters
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Current Areas Display (read-only when no override available) */}
                            {!onAreasChange && areasOfWork.length > 0 && (
                                <div style={{ marginBottom: '16px' }}>
                                    <h4 style={{
                                        margin: '0 0 8px 0',
                                        fontSize: '11px',
                                        fontWeight: '500',
                                        color: mutedText,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}>
                                        Your Areas of Work
                                    </h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {areasOfWork.map((area, index) => (
                                            <span key={index} style={{
                                                background: subtleSurface,
                                                color: mutedText,
                                                padding: '4px 8px',
                                                borderRadius: '3px',
                                                fontSize: '10px',
                                                fontWeight: '500',
                                                border: subtleBorder
                                            }}>
                                                {area}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Theme Toggle - Available to all users */}
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    marginBottom: '10px'
                                }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? 'rgba(148,163,184,0.7)' : 'rgba(100, 116, 139, 0.7)'} strokeWidth="2">
                                        <circle cx="12" cy="12" r="5"/>
                                        <line x1="12" y1="1" x2="12" y2="3"/>
                                        <line x1="12" y1="21" x2="12" y2="23"/>
                                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                                        <line x1="1" y1="12" x2="3" y2="12"/>
                                        <line x1="21" y1="12" x2="23" y2="12"/>
                                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                                    </svg>
                                    <h4 style={{
                                        margin: 0,
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        color: isDarkMode ? 'rgba(255,255,255,0.8)' : 'rgba(51, 65, 85, 0.9)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}>
                                        Appearance
                                    </h4>
                                </div>
                                
                                <button
                                    onClick={() => {
                                        toggleTheme();
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '12px 14px',
                                        background: isDarkMode 
                                            ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.15) 0%, rgba(54, 144, 206, 0.08) 100%)'
                                            : 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.04) 100%)',
                                        color: isDarkMode ? 'rgba(135, 243, 243, 0.95)' : '#3690CE',
                                        border: isDarkMode 
                                            ? '1px solid rgba(54, 144, 206, 0.25)'
                                            : '1px solid rgba(54, 144, 206, 0.15)',
                                        borderRadius: '10px',
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        transition: 'all 0.25s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '8px'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                        e.currentTarget.style.background = isDarkMode 
                                            ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.22) 0%, rgba(54, 144, 206, 0.12) 100%)'
                                            : 'linear-gradient(135deg, rgba(54, 144, 206, 0.12) 0%, rgba(54, 144, 206, 0.06) 100%)';
                                        e.currentTarget.style.borderColor = isDarkMode 
                                            ? 'rgba(54, 144, 206, 0.35)'
                                            : 'rgba(54, 144, 206, 0.25)';
                                        e.currentTarget.style.boxShadow = isDarkMode 
                                            ? '0 4px 12px rgba(54, 144, 206, 0.15)'
                                            : '0 4px 12px rgba(54, 144, 206, 0.1)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.background = isDarkMode 
                                            ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.15) 0%, rgba(54, 144, 206, 0.08) 100%)'
                                            : 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.04) 100%)';
                                        e.currentTarget.style.borderColor = isDarkMode 
                                            ? 'rgba(54, 144, 206, 0.25)'
                                            : 'rgba(54, 144, 206, 0.15)';
                                        e.currentTarget.style.boxShadow = 'none';
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {isDarkMode ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                                            </svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="12" cy="12" r="5"/>
                                                <line x1="12" y1="1" x2="12" y2="3"/>
                                                <line x1="12" y1="21" x2="12" y2="23"/>
                                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                                                <line x1="1" y1="12" x2="3" y2="12"/>
                                                <line x1="21" y1="12" x2="23" y2="12"/>
                                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                                            </svg>
                                        )}
                                        <span>Switch to {isDarkMode ? 'Light' : 'Dark'} Mode</span>
                                    </div>
                                    
                                    <div style={{
                                        width: '40px',
                                        height: '20px',
                                        borderRadius: '10px',
                                        background: isDarkMode 
                                            ? 'rgba(54, 144, 206, 0.4)' 
                                            : 'rgba(203, 213, 225, 0.6)',
                                        position: 'relative',
                                        transition: 'all 0.25s ease'
                                    }}>
                                        <div style={{
                                            width: '16px',
                                            height: '16px',
                                            borderRadius: '8px',
                                            background: '#ffffff',
                                            position: 'absolute',
                                            top: '2px',
                                            left: isDarkMode ? '22px' : '2px',
                                            transition: 'all 0.25s ease',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                        }} />
                                    </div>
                                </button>
                            </div>

                            {/* User Details - moved lower */}
                            <div style={{ marginBottom: '20px' }}>
                                {/* Local dev banner for Rate/Role presence */}
                                {showLocalDevBanner && (
                                    <div style={{
                                        marginBottom: '12px',
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        background: missingFields.length
                                            ? (isDarkMode ? 'rgba(251, 191, 36, 0.12)' : 'rgba(254, 243, 199, 0.8)')
                                            : (isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(220, 252, 231, 0.8)'),
                                        color: missingFields.length
                                            ? (isDarkMode ? '#fbbf24' : '#92400e')
                                            : (isDarkMode ? '#4ade80' : '#166534'),
                                        border: missingFields.length
                                            ? `1px solid ${isDarkMode ? 'rgba(251, 191, 36, 0.3)' : 'rgba(251, 191, 36, 0.4)'}`
                                            : `1px solid ${isDarkMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.4)'}`,
                                        fontSize: '11px',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '8px',
                                        fontWeight: 500,
                                        lineHeight: 1.4
                                    }}>
                                        <span style={{fontSize:'16px',flexShrink:0}}>⚠️</span>
                                        <span>Missing: <strong>{missingFields.join(' & ')}</strong> — set these in your user data for local testing.</span>
                                    </div>
                                )}
                                
                                {/* Quick Stats Cards */}
                                {(regularDetails.some(d => d.isRate) || regularDetails.some(d => d.isRole)) && (
                                    <div style={{ 
                                        display: 'grid', 
                                        gridTemplateColumns: '1fr 1fr', 
                                        gap: '10px',
                                        marginBottom: '16px'
                                    }}>
                                        {regularDetails.filter(d => d.isRate).map(d => (
                                            <div key={d.label} style={{
                                                background: isDarkMode
                                                    ? 'rgba(34, 197, 94, 0.10)'
                                                    : 'rgba(34, 197, 94, 0.08)',
                                                border: isDarkMode ? '1px solid rgba(34, 197, 94, 0.22)' : '1px solid rgba(34, 197, 94, 0.2)',
                                                borderRadius: '10px',
                                                padding: '12px',
                                                position: 'relative',
                                                overflow: 'hidden'
                                            }}>
                                                <div style={{
                                                    fontSize: '9px',
                                                    fontWeight: '700',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px',
                                                    color: isDarkMode ? 'rgba(74, 222, 128, 0.7)' : 'rgba(22, 101, 52, 0.7)',
                                                    marginBottom: '4px'
                                                }}>
                                                    {d.label}
                                                </div>
                                                <div style={{
                                                    fontSize: '16px',
                                                    fontWeight: '700',
                                                    color: isDarkMode ? '#4ade80' : '#166534',
                                                    letterSpacing: '0.3px'
                                                }}>
                                                    {d.value}
                                                </div>
                                            </div>
                                        ))}
                                        {regularDetails.filter(d => d.isRole).map(d => (
                                            <div key={d.label} style={{
                                                background: isDarkMode
                                                    ? 'rgba(54, 144, 206, 0.10)'
                                                    : 'rgba(54, 144, 206, 0.06)',
                                                border: isDarkMode ? '1px solid rgba(54, 144, 206, 0.28)' : '1px solid rgba(54, 144, 206, 0.22)',
                                                borderRadius: '10px',
                                                padding: '12px',
                                                position: 'relative',
                                                overflow: 'hidden'
                                            }}>
                                                <div style={{
                                                    fontSize: '9px',
                                                    fontWeight: '700',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px',
                                                    color: isDarkMode ? 'rgba(135, 243, 243, 0.8)' : '#3690CE',
                                                    marginBottom: '4px'
                                                }}>
                                                    {d.label}
                                                </div>
                                                <div style={{
                                                    fontSize: '16px',
                                                    fontWeight: '700',
                                                    color: isDarkMode ? '#87f3f3' : '#3690CE',
                                                    letterSpacing: '0.3px'
                                                }}>
                                                    {d.value}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                {/* Collapsible Profile Details */}
                                <details style={{ marginBottom: '0' }}>
                                    <summary style={{
                                        padding: '10px 12px',
                                        background: isDarkMode ? 'rgba(148,163,184,0.08)' : 'rgba(241, 245, 249, 0.8)',
                                        border: isDarkMode ? '1px solid rgba(148,163,184,0.15)' : '1px solid rgba(203, 213, 225, 0.4)',
                                        borderRadius: '8px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        color: isDarkMode ? 'rgba(255,255,255,0.8)' : 'rgba(51, 65, 85, 0.9)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        transition: 'all 0.2s ease',
                                        listStyle: 'none',
                                        userSelect: 'none'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(226, 232, 240, 0.9)';
                                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148,163,184,0.25)' : 'rgba(203, 213, 225, 0.6)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(148,163,184,0.08)' : 'rgba(241, 245, 249, 0.8)';
                                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(203, 213, 225, 0.4)';
                                    }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                                        </svg>
                                        <span style={{flex:1}}>All Profile Fields</span>
                                        <span style={{fontSize:'10px',opacity:0.6}}>{regularDetails.length} fields</span>
                                    </summary>
                                    
                                    <div style={{ 
                                        marginTop: '8px',
                                        display: 'grid', 
                                        gap: '6px',
                                        padding: '8px',
                                        background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(248, 250, 252, 0.6)',
                                        borderRadius: '8px',
                                        border: isDarkMode ? '1px solid rgba(148,163,184,0.1)' : '1px solid rgba(226, 232, 240, 0.6)'
                                    }}>
                                        {regularDetails.filter(d => !d.isRate && !d.isRole).map((d) => (
                                            <div key={d.label} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '8px 10px',
                                                background: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : '#ffffff',
                                                borderRadius: '6px',
                                                border: isDarkMode ? '1px solid rgba(148,163,184,0.1)' : '1px solid rgba(226, 232, 240, 0.8)',
                                                gap: '10px'
                                            }}>
                                                <span style={{
                                                    fontSize: '10px',
                                                    fontWeight: '600',
                                                    color: isDarkMode ? 'rgba(148,163,184,0.9)' : 'rgba(100, 116, 139, 0.8)',
                                                    minWidth: '80px',
                                                    textTransform: 'capitalize'
                                                }}>
                                                    {d.label}
                                                </span>
                                                <span style={{
                                                    fontSize: '11px',
                                                    color: isDarkMode ? 'rgba(255,255,255,0.85)' : 'rgba(15, 23, 42, 0.9)',
                                                    flex: 1,
                                                    wordBreak: 'break-word',
                                                    fontWeight: 500
                                                }}>
                                                    {d.isSecret ? '***HIDDEN***' : d.value}
                                                </span>
                                                <button
                                                    onClick={() => copy(d.value)}
                                                    style={{
                                                        background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
                                                        border: isDarkMode ? '1px solid rgba(54, 144, 206, 0.25)' : '1px solid rgba(54, 144, 206, 0.2)',
                                                        color: '#3690CE',
                                                        cursor: 'pointer',
                                                        fontSize: '9px',
                                                        fontWeight: '600',
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.15)';
                                                        e.currentTarget.style.borderColor = 'rgba(54, 144, 206, 0.4)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)';
                                                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)';
                                                    }}
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                                
                                {/* Asana Details Toggle */}
                                {asanaDetails.length > 0 && (
                                    <div style={{ marginTop: '8px' }}>
                                        <button
                                            onClick={() => setShowAsanaDetails(!showAsanaDetails)}
                                            style={{
                                                width: '100%',
                                                padding: '6px 8px',
                                                background: subtleSurface,
                                                color: mutedText,
                                                border: subtleBorder,
                                                borderRadius: '4px',
                                                fontSize: '10px',
                                                fontWeight: '500',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = isDarkMode ? 'rgba(148,163,184,0.14)' : '#f1f5f9';
                                                e.currentTarget.style.color = subtleText;
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = subtleSurface;
                                                e.currentTarget.style.color = mutedText;
                                            }}
                                        >
                                            <span>Asana Integration Details</span>
                                            <span style={{ fontSize: '8px' }}>{showAsanaDetails ? '▼' : '▶'}</span>
                                        </button>
                                        
                                        {showAsanaDetails && (
                                            <div style={{ 
                                                marginTop: '4px',
                                                display: 'grid', 
                                                gap: '4px',
                                                background: subtleSurface,
                                                padding: '8px',
                                                borderRadius: '4px',
                                                border: subtleBorder
                                            }}>
                                                {asanaDetails.map((d) => (
                                                    <div key={d.label} style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        padding: '4px 6px',
                                                        background: popoverSurface,
                                                        borderRadius: '3px',
                                                        border: subtleBorder
                                                    }}>
                                                        <span style={{
                                                            fontSize: '9px',
                                                            fontWeight: '500',
                                                            color: mutedText,
                                                            minWidth: '60px',
                                                            textTransform: 'capitalize'
                                                        }}>
                                                            {d.label}:
                                                        </span>
                                                        <span style={{
                                                            fontSize: '9px',
                                                            color: subtleText,
                                                            flex: 1,
                                                            marginLeft: '6px',
                                                            wordBreak: 'break-word',
                                                            fontFamily: 'monospace'
                                                        }}>
                                                            {d.isSecret ? '***HIDDEN***' : d.value}
                                                        </span>
                                                        {!d.isSecret && (
                                                            <button
                                                                onClick={() => copy(d.value)}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    color: mutedText,
                                                                    cursor: 'pointer',
                                                                    fontSize: '8px',
                                                                    padding: '1px 3px',
                                                                    borderRadius: '2px',
                                                                    marginLeft: '4px',
                                                                    transition: 'color 0.15s ease'
                                                                }}
                                                                onMouseEnter={(e) => e.currentTarget.style.color = subtleText}
                                                                onMouseLeave={(e) => e.currentTarget.style.color = mutedText}
                                                            >
                                                                Copy
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* User Switcher */}
                            {onUserChange && availableUsers && canSwitchUser && (
                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        marginBottom: '10px'
                                    }}>
                                        <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke={isDarkMode ? 'rgba(148,163,184,0.7)' : 'rgba(100, 116, 139, 0.7)'}
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                            <circle cx="9" cy="7" r="4" />
                                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                        </svg>
                                        <h4 style={{
                                            margin: 0,
                                            fontSize: '11px',
                                            fontWeight: '600',
                                            color: isDarkMode ? 'rgba(255,255,255,0.8)' : 'rgba(51, 65, 85, 0.9)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                        }}>
                                            Switch User
                                        </h4>
                                    </div>
                                    <select
                                        onChange={(e) => {
                                            const selected = availableUsers.find(
                                                (u) => u.Initials === e.target.value,
                                            );
                                            if (selected) onUserChange(selected);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: isDarkMode ? '1px solid rgba(148,163,184,0.2)' : '1px solid rgba(203, 213, 225, 0.5)',
                                            borderRadius: '8px',
                                            fontSize: '11px',
                                            fontWeight: '500',
                                            backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : '#ffffff',
                                            color: isDarkMode ? 'rgba(255,255,255,0.9)' : 'rgba(15, 23, 42, 0.9)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <option value="">Select user...</option>
                                        {availableUsers.map((u) => (
                                            <option key={u.Initials} value={u.Initials}>
                                                {u.FullName || `${u.First || ''} ${u.Last || ''}`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Action Buttons Section */}
                            {(originalAdminUser && onReturnToAdmin) || isPowerUser(user) || isAdminUser(user) ? (
                                <div style={{ marginBottom: '20px' }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        marginBottom: '10px'
                                    }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isDarkMode ? 'rgba(148,163,184,0.7)' : 'rgba(100, 116, 139, 0.7)'} strokeWidth="2">
                                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                        </svg>
                                        <h4 style={{
                                            margin: 0,
                                            fontSize: '11px',
                                            fontWeight: '600',
                                            color: isDarkMode ? 'rgba(255,255,255,0.8)' : 'rgba(51, 65, 85, 0.9)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                        }}>
                                            Quick Actions
                                        </h4>
                                    </div>
                                    
                                    <div style={{ display: 'grid', gap: '8px' }}>
                                        {/* Refresh Data modal opener */}
                                        <button
                                            onClick={() => setShowRefreshModal(true)}
                                            style={{
                                                width: '100%',
                                                padding: '12px 14px',
                                                background: isDarkMode ? 'rgba(148,163,184,0.1)' : 'rgba(241, 245, 249, 0.9)',
                                                color: isDarkMode ? 'rgba(255,255,255,0.85)' : 'rgba(51, 65, 85, 0.9)',
                                                border: isDarkMode ? '1px solid rgba(148,163,184,0.2)' : '1px solid rgba(203, 213, 225, 0.5)',
                                                borderRadius: '10px',
                                                fontSize: '11px',
                                                fontWeight: '600',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(226, 232, 240, 0.9)';
                                                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(203, 213, 225, 0.7)';
                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = isDarkMode ? 'rgba(148,163,184,0.1)' : 'rgba(241, 245, 249, 0.9)';
                                                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(203, 213, 225, 0.5)';
                                                e.currentTarget.style.transform = 'translateY(0)';
                                            }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M23 4v6h-6" />
                                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                            </svg>
                                            <span>Refresh Data…</span>
                                        </button>
                                        {/* Refresh Enquiries (force fresh) - available to all users */}
                                        {onRefreshEnquiries && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await onRefreshEnquiries();
                                                    } finally {
                                                        closePopover();
                                                    }
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '12px 14px',
                                                    background: isDarkMode ? 'rgba(34,197,94,0.18)' : '#f0fdf4',
                                                    color: isDarkMode ? '#bbf7d0' : '#217a2b',
                                                    border: isDarkMode ? '1px solid rgba(34,197,94,0.35)' : '1px solid #b7eb8f',
                                                    borderRadius: '10px',
                                                    fontSize: '11px',
                                                    fontWeight: '600',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <path d="M23 4v6h-6" />
                                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                                </svg>
                                                <span>Refresh Enquiries (force fresh)</span>
                                            </button>
                                        )}
                                        {/* Return to Admin */}
                                        {originalAdminUser && onReturnToAdmin && (
                                            <button
                                                onClick={() => {
                                                    onReturnToAdmin();
                                                    closePopover();
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '12px 14px',
                                                    background: '#ef4444',
                                                    color: '#ffffff',
                                                    border: 'none',
                                                    borderRadius: '10px',
                                                    fontSize: '11px',
                                                    fontWeight: '600',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    boxShadow: '0 1px 3px rgba(239, 68, 68, 0.25)'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                    e.currentTarget.style.boxShadow = '0 3px 8px rgba(239, 68, 68, 0.35)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(239, 68, 68, 0.25)';
                                                }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                                                </svg>
                                                <span>Return to Admin View</span>
                                            </button>
                                        )}

                                        {/* Admin Dashboard */}
                                        {isAdminUser(user) && (
                                            <button
                                                onClick={() => {
                                                    if (verifyAdminPasscode()) {
                                                        setShowAdminDashboard(true);
                                                        closePopover(false);
                                                    }
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '12px 14px',
                                                    background: '#3690CE',
                                                    color: '#ffffff',
                                                    border: 'none',
                                                    borderRadius: '10px',
                                                    fontSize: '11px',
                                                    fontWeight: '600',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    boxShadow: '0 1px 3px rgba(54, 144, 206, 0.25)'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                    e.currentTarget.style.boxShadow = '0 3px 8px rgba(54, 144, 206, 0.35)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(54, 144, 206, 0.25)';
                                                }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <rect x="3" y="3" width="7" height="7"/>
                                                    <rect x="14" y="3" width="7" height="7"/>
                                                    <rect x="14" y="14" width="7" height="7"/>
                                                    <rect x="3" y="14" width="7" height="7"/>
                                                </svg>
                                                <span>Admin Dashboard</span>
                                            </button>
                                        )}

                                        {/* Data Inspector */}
                                        {isPowerUser(user) && (
                                            <button
                                                onClick={() => setShowDataInspector(true)}
                                                style={{
                                                    width: '100%',
                                                    padding: '12px 14px',
                                                    background: isDarkMode ? 'rgba(148,163,184,0.1)' : 'rgba(241, 245, 249, 0.9)',
                                                    color: isDarkMode ? 'rgba(255,255,255,0.85)' : 'rgba(51, 65, 85, 0.9)',
                                                    border: isDarkMode ? '1px solid rgba(148,163,184,0.2)' : '1px solid rgba(203, 213, 225, 0.5)',
                                                    borderRadius: '10px',
                                                    fontSize: '11px',
                                                    fontWeight: '600',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(226, 232, 240, 0.9)';
                                                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(203, 213, 225, 0.7)';
                                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = isDarkMode ? 'rgba(148,163,184,0.1)' : 'rgba(241, 245, 249, 0.9)';
                                                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(203, 213, 225, 0.5)';
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <polyline points="16 18 22 12 16 6"/>
                                                    <polyline points="8 6 2 12 8 18"/>
                                                </svg>
                                                <span>Application Inspector</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </>
            )}
            
            {showDataInspector && (
                <DataInspector data={user} onClose={() => setShowDataInspector(false)} />
            )}
            
            {showAdminDashboard && (
                <AdminDashboard 
                    isOpen={showAdminDashboard} 
                    onClose={() => setShowAdminDashboard(false)} 
                />
            )}
        </div>
    );
};

export default UserBubble;
