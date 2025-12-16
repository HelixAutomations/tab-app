import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import DataInspector from './DataInspector';
import AdminDashboard from './AdminDashboard';
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
    onFeatureToggle?: (feature: string, enabled: boolean) => void;
    featureToggles?: Record<string, boolean>;
    onShowTestEnquiry?: () => void;
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
}) => {
    const [open, setOpen] = useState(false);
    const [showDataInspector, setShowDataInspector] = useState(false);
    const [showAdminDashboard, setShowAdminDashboard] = useState(false);
    const [showRefreshModal, setShowRefreshModal] = useState(false);
    const bubbleRef = useRef<HTMLButtonElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedElement = useRef<HTMLElement | null>(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const { isDarkMode, toggleTheme } = useTheme();
    const popoverId = useId();

    // Theme tokens
    const bg = isDarkMode ? '#0f172a' : '#ffffff';
    const bgSubtle = isDarkMode ? 'rgba(30,41,59,0.6)' : '#f8fafc';
    const border = isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(203,213,225,0.4)';
    const text = isDarkMode ? '#e2e8f0' : '#1e293b';
    const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
    const accent = '#3690CE';

    const initials = user.Initials || `${user.First?.charAt(0) || ''}${user.Last?.charAt(0) || ''}`.toUpperCase();

    const verifyAdminPasscode = useCallback((): boolean => {
        const expected = (process.env.REACT_APP_ADMIN_PASSCODE || '2011').toString();
        const input = window.prompt('Enter admin passcode');
        if (input === null) return false;
        const ok = input.trim() === expected;
        if (!ok) window.alert('Incorrect passcode');
        return ok;
    }, []);

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
            const popW = 340, popH = 500;
            let left = rect.left, top = rect.bottom + 8;
            if (left + popW > window.innerWidth - 16) left = Math.max(16, window.innerWidth - popW - 16);
            if (top + popH > window.innerHeight - 16) top = rect.top - popH - 8;
            setPos({ top: Math.max(16, top), left: Math.max(16, left) });
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

    // Helper to mask sensitive values
    const maskSecret = (val: string) => val.length > 4 ? val.slice(0, 2) + '****' + val.slice(-2) : '****';

    // Styles
    const sectionTitle: React.CSSProperties = {
        fontSize: 10, fontWeight: 600, color: textMuted, textTransform: 'uppercase',
        letterSpacing: '0.5px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6
    };
    const toggleRow: React.CSSProperties = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', background: bgSubtle, border: `1px solid ${border}`,
        cursor: 'pointer', transition: 'all 0.15s'
    };
    const toggleSwitch = (on: boolean): React.CSSProperties => ({
        width: 36, height: 18, background: on ? accent : (isDarkMode ? 'rgba(148,163,184,0.3)' : '#cbd5e1'),
        position: 'relative', transition: 'all 0.2s', flexShrink: 0
    });
    const toggleKnob = (on: boolean): React.CSSProperties => ({
        width: 14, height: 14, background: '#fff', position: 'absolute', top: 2, left: on ? 20 : 2,
        transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
    });
    const actionBtn: React.CSSProperties = {
        width: '100%', padding: '10px 12px', background: bgSubtle, color: text,
        border: `1px solid ${border}`, fontSize: 11, fontWeight: 500, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s'
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
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, background: '#061733',
                    border: '0.25px solid rgba(255,255,255,0.15)', cursor: 'pointer'
                }}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={`User menu for ${user.FullName || initials}`}
            >
                <img src={require('../assets/grey helix mark.png')} alt="User" style={{ width: 20, height: 20 }} />
            </button>

            {open && (
                <>
                    <div
                        style={{
                            position: 'fixed', inset: 0, background: isDarkMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.25)',
                            backdropFilter: 'blur(4px)', zIndex: 1998
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
                            position: 'fixed', top: pos.top, left: pos.left, width: 340,
                            maxHeight: '85vh', background: bg, border: `1px solid ${border}`,
                            boxShadow: isDarkMode ? '0 20px 60px rgba(0,0,0,0.5)' : '0 20px 60px rgba(0,0,0,0.15)',
                            overflow: 'hidden', zIndex: 1999
                        }}
                    >
                        {/* Header */}
                        <div style={{ padding: '16px', borderBottom: `1px solid ${border}`, background: bgSubtle }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 44, height: 44, background: bg, border: `2px solid rgba(34,197,94,0.4)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8
                                }}>
                                    <img src={require('../assets/grey helix mark.png')} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: text, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                        <span style={{ color: accent, fontSize: 13, fontWeight: 800 }}>{initials}</span>
                                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {user.FullName || `${user.First || ''} ${user.Last || ''}`.trim() || 'User'}
                                        </span>
                                    </div>
                                    <div style={{
                                        marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '3px 8px', background: isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.08)',
                                        border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(54,144,206,0.15)'}`,
                                        fontSize: 10, fontWeight: 600, color: accent
                                    }}>
                                        {user.Role || 'Team Member'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div style={{ maxHeight: 'calc(85vh - 80px)', overflowY: 'auto', padding: 16 }}>
                            
                            {/* Features Section - PROMINENT */}
                            {onFeatureToggle && (
                                <div style={{ marginBottom: 16 }}>
                                    <div style={sectionTitle}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                                        </svg>
                                        Features
                                    </div>
                                    <div
                                        style={toggleRow}
                                        onClick={() => onFeatureToggle('rateChangeTracker', !featureToggles.rateChangeTracker)}
                                    >
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 500, color: text }}>Rate Change Tracker</div>
                                            <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Jan 2026 rate increase notifications</div>
                                        </div>
                                        <div style={toggleSwitch(!!featureToggles.rateChangeTracker)}>
                                            <div style={toggleKnob(!!featureToggles.rateChangeTracker)} />
                                        </div>
                                    </div>
                                    {isLocalDev && (
                                        <div
                                            style={toggleRow}
                                            onClick={() => onFeatureToggle('annualLeaveTestCards', !featureToggles.annualLeaveTestCards)}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: text }}>Annual Leave Test Cards</div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Show test approval/booking cards (localhost)</div>
                                            </div>
                                            <div style={toggleSwitch(!!featureToggles.annualLeaveTestCards)}>
                                                <div style={toggleKnob(!!featureToggles.annualLeaveTestCards)} />
                                            </div>
                                        </div>
                                    )}
                                    {isLocalDev && (
                                        <div
                                            style={{ ...toggleRow, borderTop: 'none', background: featureToggles.viewAsProd ? (isDarkMode ? 'rgba(234,179,8,0.12)' : 'rgba(234,179,8,0.08)') : bgSubtle }}
                                            onClick={() => onFeatureToggle('viewAsProd', !featureToggles.viewAsProd)}
                                        >
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: featureToggles.viewAsProd ? '#eab308' : text, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    View as Production
                                                    {featureToggles.viewAsProd && (
                                                        <span style={{ fontSize: 9, background: '#eab308', color: '#000', padding: '1px 5px', fontWeight: 700 }}>ACTIVE</span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Hide dev-only features to preview production view</div>
                                            </div>
                                            <div style={{ ...toggleSwitch(!!featureToggles.viewAsProd), background: featureToggles.viewAsProd ? '#eab308' : (isDarkMode ? 'rgba(148,163,184,0.3)' : '#cbd5e1') }}>
                                                <div style={toggleKnob(!!featureToggles.viewAsProd)} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Appearance */}
                            <div style={{ marginBottom: 16 }}>
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
                                <div style={toggleRow} onClick={() => toggleTheme()}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {isDarkMode ? (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={text} strokeWidth="2">
                                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                                            </svg>
                                        ) : (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={text} strokeWidth="2">
                                                <circle cx="12" cy="12" r="5"/>
                                            </svg>
                                        )}
                                        <span style={{ fontSize: 12, fontWeight: 500, color: text }}>{isDarkMode ? 'Dark' : 'Light'} Mode</span>
                                    </div>
                                    <div style={toggleSwitch(isDarkMode)}>
                                        <div style={toggleKnob(isDarkMode)} />
                                    </div>
                                </div>
                            </div>

                            {/* Areas Filter */}
                            {onAreasChange && (
                                <div style={{ marginBottom: 16 }}>
                                    <div style={sectionTitle}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round"/>
                                        </svg>
                                        Session Filters
                                    </div>
                                    <div style={{ background: bgSubtle, border: `1px solid ${border}`, padding: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 500, color: textMuted, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Areas of Work</span>
                                            <span style={{ opacity: 0.7 }}>{areasOfWork.length > 0 ? `${areasOfWork.length} active` : 'All'}</span>
                                        </div>
                                        <div style={{ display: 'grid', gap: 4 }}>
                                            {AVAILABLE_AREAS.map(area => {
                                                const checked = areasOfWork.includes(area);
                                                return (
                                                    <label key={area} style={{
                                                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                                        padding: '6px 8px', background: checked ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.08)') : 'transparent',
                                                        border: `1px solid ${checked ? accent : 'transparent'}`, fontSize: 11, fontWeight: checked ? 600 : 400,
                                                        color: checked ? accent : textMuted, transition: 'all 0.15s'
                                                    }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                const next = e.target.checked ? [...areasOfWork, area] : areasOfWork.filter(a => a !== area);
                                                                setAreasOfWork(next);
                                                                onAreasChange(next);
                                                            }}
                                                            style={{ accentColor: accent, width: 14, height: 14 }}
                                                        />
                                                        {area}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        {areasOfWork.length > 0 && (
                                            <button
                                                onClick={() => { setAreasOfWork([]); onAreasChange([]); }}
                                                style={{
                                                    width: '100%', marginTop: 8, padding: '5px 8px', background: 'transparent',
                                                    color: isDarkMode ? '#f87171' : '#ef4444', border: `1px solid ${isDarkMode ? 'rgba(248,113,113,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                                    fontSize: 10, fontWeight: 500, cursor: 'pointer'
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
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                                    {regularDetails.filter(d => d.isRate).map(d => (
                                        <div key={d.label} style={{
                                            background: isDarkMode ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.08)',
                                            border: `1px solid ${isDarkMode ? 'rgba(34,197,94,0.22)' : 'rgba(34,197,94,0.2)'}`,
                                            padding: 10
                                        }}>
                                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: isDarkMode ? '#4ade80' : '#166534', opacity: 0.7, marginBottom: 2 }}>{d.label}</div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: isDarkMode ? '#4ade80' : '#166534' }}>{d.value}</div>
                                        </div>
                                    ))}
                                    {regularDetails.filter(d => d.isRole).map(d => (
                                        <div key={d.label} style={{
                                            background: isDarkMode ? 'rgba(54,144,206,0.1)' : 'rgba(54,144,206,0.06)',
                                            border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.28)' : 'rgba(54,144,206,0.22)'}`,
                                            padding: 10
                                        }}>
                                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: accent, opacity: 0.7, marginBottom: 2 }}>{d.label}</div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: accent }}>{d.value}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Profile Details (collapsible) */}
                            <details style={{ marginBottom: 16 }}>
                                <summary style={{
                                    padding: '8px 10px', background: bgSubtle, border: `1px solid ${border}`,
                                    fontSize: 11, fontWeight: 600, color: text, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 8, listStyle: 'none'
                                }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                                    </svg>
                                    <span style={{ flex: 1 }}>Profile Fields</span>
                                    <span style={{ fontSize: 10, opacity: 0.6 }}>{regularDetails.length}</span>
                                </summary>
                                <div style={{ marginTop: 6, display: 'grid', gap: 4, padding: 8, background: bgSubtle, border: `1px solid ${border}` }}>
                                    {regularDetails.filter(d => !d.isRate && !d.isRole).map(d => (
                                        <div key={d.label} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', background: bg, border: `1px solid ${border}`, gap: 8 }}>
                                            <span style={{ fontSize: 10, fontWeight: 600, color: textMuted, minWidth: 70 }}>{d.label}</span>
                                            <span style={{ fontSize: 11, color: text, flex: 1, wordBreak: 'break-word' }}>{d.value}</span>
                                            <button onClick={() => copy(d.value)} style={{ background: 'transparent', border: 'none', color: accent, fontSize: 9, cursor: 'pointer', padding: '2px 4px' }}>Copy</button>
                                        </div>
                                    ))}
                                </div>
                            </details>

                            {/* Asana Details (collapsible) - secrets masked */}
                            {asanaDetails.length > 0 && (
                                <details style={{ marginBottom: 16 }}>
                                    <summary style={{
                                        padding: '8px 10px', background: bgSubtle, border: `1px solid ${border}`,
                                        fontSize: 11, fontWeight: 600, color: text, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 8, listStyle: 'none'
                                    }}>
                                        <span style={{ flex: 1 }}>Asana Integration</span>
                                        <span style={{ fontSize: 10, opacity: 0.6 }}>{asanaDetails.length}</span>
                                    </summary>
                                    <div style={{ marginTop: 6, display: 'grid', gap: 4, padding: 8, background: bgSubtle, border: `1px solid ${border}` }}>
                                        {asanaDetails.map(d => {
                                            const isSensitive = d.label.toLowerCase().includes('token') || d.label.toLowerCase().includes('secret') || d.label.toLowerCase().includes('key') || d.label.toLowerCase().includes('gid');
                                            return (
                                                <div key={d.label} style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', background: bg, border: `1px solid ${border}`, gap: 8 }}>
                                                    <span style={{ fontSize: 10, fontWeight: 600, color: textMuted, minWidth: 60 }}>{d.label}</span>
                                                    <span style={{ fontSize: 10, color: isSensitive ? textMuted : text, flex: 1, wordBreak: 'break-word', fontFamily: 'monospace' }}>
                                                        {isSensitive ? maskSecret(d.value) : d.value}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </details>
                            )}

                            {/* User Switcher - always shown but disabled for non-admins */}
                            {onUserChange && availableUsers && (
                                <div style={{ marginBottom: 16, opacity: canSwitchUser ? 1 : 0.5 }}>
                                    <div style={{ ...sectionTitle, color: canSwitchUser ? textMuted : textMuted }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                        </svg>
                                        Switch User
                                        {!canSwitchUser && (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 'auto' }}>
                                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                            </svg>
                                        )}
                                    </div>
                                    <select
                                        disabled={!canSwitchUser}
                                        onChange={(e) => {
                                            const sel = availableUsers.find(u => u.Initials === e.target.value);
                                            if (sel) onUserChange(sel);
                                        }}
                                        style={{
                                            width: '100%', padding: '8px 10px', background: bg, color: canSwitchUser ? text : textMuted,
                                            border: `1px solid ${border}`, fontSize: 11, cursor: canSwitchUser ? 'pointer' : 'not-allowed'
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

                            {/* Actions - streamlined */}
                            <div>
                                <div style={sectionTitle}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                    </svg>
                                    Actions
                                </div>
                                <div style={{ display: 'grid', gap: 6 }}>
                                    <button onClick={() => setShowRefreshModal(true)} style={actionBtn}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                        </svg>
                                        Refresh Data…
                                    </button>

                                    {/* Show Test Enquiry - local dev and admins in production */}
                                    {onShowTestEnquiry && (isLocalDev || isAdminUser(user)) && (
                                        <button onClick={() => { onShowTestEnquiry(); closePopover(); }} style={{ ...actionBtn, background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.2)', border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.3)' : 'rgba(135, 243, 243, 0.4)'}` }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                                <polyline points="14 2 14 8 20 8"/>
                                                <line x1="12" y1="18" x2="12" y2="12"/>
                                                <line x1="9" y1="15" x2="15" y2="15"/>
                                            </svg>
                                            Show Test Enquiry
                                        </button>
                                    )}

                                    {originalAdminUser && onReturnToAdmin && (
                                        <button onClick={() => { onReturnToAdmin(); closePopover(); }} style={{ ...actionBtn, background: '#ef4444', color: '#fff', border: 'none' }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M19 12H5M12 19l-7-7 7-7"/>
                                            </svg>
                                            Return to Admin View
                                        </button>
                                    )}

                                    {/* Dev tools - only for local dev OR LZ/CB */}
                                    {canAccessDevTools && isAdminUser(user) && (
                                        <button onClick={() => { if (verifyAdminPasscode()) { setShowAdminDashboard(true); closePopover(false); } }} style={{ ...actionBtn, background: accent, color: '#fff', border: 'none' }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                                                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                                            </svg>
                                            Admin Dashboard
                                        </button>
                                    )}

                                    {canAccessDevTools && isPowerUser(user) && (
                                        <button onClick={() => setShowDataInspector(true)} style={actionBtn}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
                                            </svg>
                                            Application Inspector
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {showDataInspector && <DataInspector data={user} onClose={() => setShowDataInspector(false)} />}
            {showAdminDashboard && <AdminDashboard isOpen={showAdminDashboard} onClose={() => setShowAdminDashboard(false)} />}
        </div>
    );
};

export default UserBubble;
