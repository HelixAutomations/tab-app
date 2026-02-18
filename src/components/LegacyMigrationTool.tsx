import React, { useState, useCallback, useRef } from 'react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';

/* ───────────────────────────────────────────────────────────────────────
 *  Legacy Migration Tool  v1
 *  ──────────────────────────────────────────────────────────────────────
 *  Discover existing records for a Clio client across all systems,
 *  surface what's present and what's missing, then offer to build
 *  a complete pipeline (enquiry → deal → instruction → matters → EID).
 *
 *  Local-cluster only for now.
 * ────────────────────────────────────────────────────────────────────── */

// ── Types ──────────────────────────────────────────
interface LegacyMigrationToolProps {
    isOpen: boolean;
    onClose: () => void;
}

type LookupStatus = 'idle' | 'searching' | 'found' | 'not-found' | 'error';

interface DiscoveredRecord {
    system: string;         // 'Clio' | 'Core Data' | 'Instructions DB' | 'Tiller' | 'ActiveCampaign'
    table: string;          // e.g. 'contacts', 'matters', 'Instructions', 'poid', 'enquiries'
    status: LookupStatus;
    count: number;
    data?: any;
    error?: string;
}

interface MigrationState {
    // Search inputs
    searchType: 'email' | 'clio-id' | 'name';
    searchValue: string;

    // Discovery
    phase: 'input' | 'discovering' | 'review' | 'intake' | 'ready' | 'migrating' | 'complete';
    records: DiscoveredRecord[];

    // Intake fields (what we need the user to provide if missing)
    intake: {
        feeEarner: string;
        areaOfWork: string;
        dealAmount: string;
        serviceDescription: string;
        practiceArea: string;
    };

    // Result
    result?: {
        instructionRef: string;
        recordsCreated: number;
    };
}

const INITIAL_STATE: MigrationState = {
    searchType: 'email',
    searchValue: '',
    phase: 'input',
    records: [],
    intake: {
        feeEarner: '',
        areaOfWork: 'commercial',
        dealAmount: '0',
        serviceDescription: '',
        practiceArea: '',
    },
};

// ── System map ─────────────────────────────────────
const SYSTEMS = [
    { system: 'Clio', table: 'contacts', label: 'Clio Contact', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
    { system: 'Clio', table: 'matters', label: 'Clio Matters', icon: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
    { system: 'Core Data', table: 'matters', label: 'Legacy Matters', icon: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z' },
    { system: 'Core Data', table: 'poid', label: 'POID / EID', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
    { system: 'Core Data', table: 'enquiries', label: 'Legacy Enquiry', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    { system: 'Instructions DB', table: 'Instructions', label: 'Instruction', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2' },
    { system: 'Instructions DB', table: 'Deals', label: 'Deal', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
    { system: 'Instructions DB', table: 'Matters', label: 'Pipeline Matters', icon: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' },
    { system: 'Instructions DB', table: 'IdVerifications', label: 'ID Verification', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
];

// ── Status colours ─────────────────────────────────
const statusColour = (status: LookupStatus): string => {
    switch (status) {
        case 'found': return colours.green;
        case 'not-found': return colours.orange;
        case 'error': return colours.cta;
        case 'searching': return colours.blue;
        default: return colours.subtleGrey;
    }
};
const statusLabel = (status: LookupStatus, count: number): string => {
    switch (status) {
        case 'found': return count > 1 ? `${count} found` : 'Found';
        case 'not-found': return 'Missing';
        case 'error': return 'Error';
        case 'searching': return 'Searching…';
        default: return 'Pending';
    }
};

// ── Helper: simulate discovery calls ────────────────
// v1: hits the server proxy endpoints; falls back to simulated delay for now
async function discoverRecords(searchType: string, searchValue: string): Promise<DiscoveredRecord[]> {
    const results: DiscoveredRecord[] = SYSTEMS.map(s => ({
        system: s.system,
        table: s.table,
        status: 'searching' as LookupStatus,
        count: 0,
    }));

    // Try to call the discovery API endpoint
    try {
        const res = await fetch('/api/migration/discover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchType, searchValue }),
        });
        if (res.ok) {
            const data = await res.json();
            if (data.records) return data.records;
        }
    } catch {
        // API not available — fall through to manual placeholder
    }

    // Fallback: return all as 'idle' so the user sees the system map
    return SYSTEMS.map(s => ({
        system: s.system,
        table: s.table,
        status: 'idle' as LookupStatus,
        count: 0,
    }));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const LegacyMigrationTool: React.FC<LegacyMigrationToolProps> = ({ isOpen, onClose }) => {
    const { isDarkMode } = useTheme();
    const [state, setState] = useState<MigrationState>({ ...INITIAL_STATE });
    const scrollRef = useRef<HTMLDivElement>(null);

    // ── Theme tokens ──
    const bg = isDarkMode ? colours.websiteBlue : '#ffffff';
    const bgSecondary = isDarkMode ? colours.darkBlue : colours.grey;
    const controlRowBg = isDarkMode ? colours.darkBlue : isDarkMode ? colours.dark.sectionBackground : colours.grey;
    const borderLight = isDarkMode ? colours.dark.border : colours.highlightNeutral;
    const borderMedium = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
    const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
    const textSecondary = isDarkMode ? colours.dark.subText : colours.greyText;
    const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
    const sectionAccent = isDarkMode ? colours.accent : colours.highlight;

    const rowBaseBackground = isDarkMode
        ? `linear-gradient(90deg, rgba(54, 144, 206, 0.10) 0%, rgba(54, 144, 206, 0.00) 42%), ${controlRowBg}`
        : controlRowBg;
    const rowHoverBackground = isDarkMode
        ? `linear-gradient(90deg, rgba(54, 144, 206, 0.18) 0%, rgba(54, 144, 206, 0.00) 50%), ${isDarkMode ? colours.helixBlue : colours.light.cardHover}`
        : colours.light.cardHover;
    const rowBaseShadow = isDarkMode ? 'inset 0 0 0 1px rgba(54, 144, 206, 0.05)' : 'none';
    const rowHoverShadow = isDarkMode ? '0 8px 18px rgba(0, 3, 25, 0.42)' : '0 4px 12px rgba(6, 23, 51, 0.08)';

    const applyRowHover = (el: HTMLElement) => {
        el.style.borderColor = borderMedium;
        el.style.background = rowHoverBackground;
        el.style.transform = 'translateY(-1px)';
        el.style.boxShadow = rowHoverShadow;
    };
    const resetRowHover = (el: HTMLElement) => {
        el.style.borderColor = borderLight;
        el.style.background = rowBaseBackground;
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = rowBaseShadow;
    };

    // ── Actions ──
    const handleSearch = useCallback(async () => {
        if (!state.searchValue.trim()) return;
        setState(prev => ({ ...prev, phase: 'discovering', records: SYSTEMS.map(s => ({ system: s.system, table: s.table, status: 'searching' as LookupStatus, count: 0 })) }));
        try {
            const records = await discoverRecords(state.searchType, state.searchValue.trim());
            const hasAnyFound = records.some(r => r.status === 'found');
            setState(prev => ({ ...prev, phase: hasAnyFound ? 'review' : 'review', records }));
        } catch (err: any) {
            setState(prev => ({ ...prev, phase: 'review', records: prev.records.map(r => ({ ...r, status: 'error' as LookupStatus, error: err.message })) }));
        }
    }, [state.searchType, state.searchValue]);

    const handleReset = useCallback(() => {
        setState({ ...INITIAL_STATE });
    }, []);

    const handleProceedToIntake = useCallback(() => {
        setState(prev => ({ ...prev, phase: 'intake' }));
    }, []);

    // ── Derived state ──
    const missingInNewSpace = state.records.filter(r => r.system === 'Instructions DB' && r.status === 'not-found');
    const foundInClio = state.records.filter(r => r.system === 'Clio' && r.status === 'found');
    const foundInLegacy = state.records.filter(r => r.system === 'Core Data' && r.status === 'found');
    const alreadyMigrated = state.records.filter(r => r.system === 'Instructions DB' && r.status === 'found').length > 0;

    if (!isOpen) return null;

    // ── Styles ──
    const sectionTitle: React.CSSProperties = {
        fontSize: 10, fontWeight: 600, color: textMuted,
        textTransform: 'uppercase', letterSpacing: '0.5px',
        marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '10px 12px',
        background: isDarkMode ? colours.darkBlue : '#fff',
        color: textPrimary,
        border: `1px solid ${borderLight}`,
        borderRadius: '2px',
        fontSize: 12,
        fontWeight: 500,
        outline: 'none',
        transition: 'border-color 0.15s ease',
    };

    const chipStyle = (active: boolean): React.CSSProperties => ({
        padding: '5px 10px',
        background: active ? (isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.10)') : 'transparent',
        border: `1px solid ${active ? colours.blue : borderLight}`,
        borderRadius: '2px',
        fontSize: 10,
        fontWeight: 600,
        color: active ? colours.blue : textMuted,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        letterSpacing: '0.3px',
    });

    const primaryBtnStyle: React.CSSProperties = {
        padding: '10px 18px',
        background: colours.blue,
        color: '#fff',
        border: `1px solid ${colours.blue}`,
        borderRadius: '2px',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all 0.15s ease',
    };

    const secondaryBtnStyle: React.CSSProperties = {
        ...primaryBtnStyle,
        background: 'transparent',
        color: textSecondary,
        border: `1px solid ${borderLight}`,
    };

    return (
        <>
            {/* Backdrop */}
            <div
                style={{
                    position: 'fixed', inset: 0,
                    background: isDarkMode ? 'rgba(0, 3, 25, 0.85)' : 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 2100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'backdropFadeIn 0.2s ease forwards',
                }}
                onClick={onClose}
            >
                {/* Modal */}
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        width: '92vw',
                        maxWidth: 640,
                        maxHeight: '85vh',
                        background: bg,
                        border: `1px solid ${borderLight}`,
                        borderRadius: '2px',
                        boxShadow: isDarkMode
                            ? '0 24px 48px rgba(0, 3, 25, 0.6), 0 0 0 1px rgba(54, 144, 206, 0.08)'
                            : '0 24px 48px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        animation: 'commandCenterIn 0.25s ease forwards',
                    }}
                >
                    {/* Header */}
                    <div style={{
                        padding: '14px 20px',
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.08)' : borderLight}`,
                        background: isDarkMode ? colours.websiteBlue : colours.grey,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 28, height: 28,
                                background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.20)' : 'rgba(54, 144, 206, 0.15)'}`,
                                borderRadius: '2px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colours.blue} strokeWidth="2">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                                </svg>
                            </div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: textPrimary, letterSpacing: '-0.2px' }}>Pipeline Migration</div>
                                <div style={{ fontSize: 9, fontWeight: 500, color: textMuted, marginTop: 1 }}>Discover legacy records and build a complete instruction chain</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                                fontSize: 8, fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                color: colours.blue,
                                padding: '2px 6px',
                                background: isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(54, 144, 206, 0.06)',
                                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.12)'}`,
                                borderRadius: '2px',
                            }}>v1</span>
                            <button
                                onClick={onClose}
                                style={{
                                    background: 'transparent',
                                    border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.10)' : borderLight}`,
                                    borderRadius: '2px',
                                    color: textMuted,
                                    cursor: 'pointer',
                                    padding: '5px 6px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = borderMedium; e.currentTarget.style.color = textPrimary; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.10)' : borderLight; e.currentTarget.style.color = textMuted; }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M18 6L6 18M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

                        {/* ── Phase: Input ── */}
                        {(state.phase === 'input' || state.phase === 'discovering') && (
                            <div>
                                <div style={sectionTitle}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                    </svg>
                                    Find Client
                                </div>

                                {/* Search type chips */}
                                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                    {([
                                        { key: 'email' as const, label: 'Email' },
                                        { key: 'clio-id' as const, label: 'Clio ID' },
                                        { key: 'name' as const, label: 'Name' },
                                    ]).map(opt => (
                                        <button
                                            key={opt.key}
                                            onClick={() => setState(prev => ({ ...prev, searchType: opt.key }))}
                                            style={chipStyle(state.searchType === opt.key)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Search input */}
                                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                                    <input
                                        type="text"
                                        value={state.searchValue}
                                        onChange={e => setState(prev => ({ ...prev, searchValue: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                                        placeholder={
                                            state.searchType === 'email' ? 'client@example.com' :
                                            state.searchType === 'clio-id' ? 'Clio contact ID' :
                                            'First Last'
                                        }
                                        style={inputStyle}
                                        autoFocus
                                        disabled={state.phase === 'discovering'}
                                    />
                                    <button
                                        onClick={handleSearch}
                                        disabled={state.phase === 'discovering' || !state.searchValue.trim()}
                                        style={{
                                            ...primaryBtnStyle,
                                            opacity: (state.phase === 'discovering' || !state.searchValue.trim()) ? 0.5 : 1,
                                            cursor: (state.phase === 'discovering' || !state.searchValue.trim()) ? 'not-allowed' : 'pointer',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {state.phase === 'discovering' ? (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'userBubbleToastPulse 1s ease-in-out infinite alternate' }}>
                                                <circle cx="12" cy="12" r="10"/>
                                            </svg>
                                        ) : (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                            </svg>
                                        )}
                                        {state.phase === 'discovering' ? 'Searching…' : 'Discover'}
                                    </button>
                                </div>

                                {/* Help text */}
                                <div style={{
                                    padding: '10px 12px',
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)',
                                    border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)'}`,
                                    borderRadius: '2px',
                                    fontSize: 10,
                                    color: textMuted,
                                    lineHeight: 1.6,
                                }}>
                                    Searches Clio, Core Data (legacy matters, POID, enquiries), and the Instructions DB to map what exists for this client. Use this for matters opened the old way — directly in Clio without the enquiry → instruction pipeline.
                                </div>
                            </div>
                        )}

                        {/* ── Phase: Discovery results ── */}
                        {(state.phase === 'discovering' || state.phase === 'review') && (
                            <div style={{ marginTop: state.phase === 'discovering' ? 20 : 0 }}>
                                <div style={{ ...sectionTitle, color: sectionAccent }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={sectionAccent} strokeWidth="2.5">
                                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                                    </svg>
                                    System Discovery
                                </div>

                                {/* Discovery grid */}
                                <div style={{ display: 'grid', gap: 4 }}>
                                    {SYSTEMS.map((sys, i) => {
                                        const record = state.records[i] || { status: 'idle' as LookupStatus, count: 0 };
                                        const sc = statusColour(record.status);
                                        return (
                                            <div
                                                key={`${sys.system}-${sys.table}`}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                    padding: '8px 12px',
                                                    background: rowBaseBackground,
                                                    border: `1px solid ${borderLight}`,
                                                    borderRadius: '2px',
                                                    transition: 'all 0.15s ease',
                                                }}
                                                onMouseEnter={e => applyRowHover(e.currentTarget)}
                                                onMouseLeave={e => resetRowHover(e.currentTarget)}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="1.8" style={{ flexShrink: 0 }}>
                                                    <path d={sys.icon}/>
                                                </svg>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 11, fontWeight: 500, color: textPrimary }}>{sys.label}</div>
                                                    <div style={{ fontSize: 9, color: textMuted }}>{sys.system} → {sys.table}</div>
                                                </div>
                                                {/* Status indicator */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                                    <span style={{
                                                        width: 6, height: 6,
                                                        borderRadius: '50%',
                                                        background: sc,
                                                        boxShadow: record.status === 'searching' ? `0 0 6px ${sc}80` : 'none',
                                                        animation: record.status === 'searching' ? 'userBubbleToastPulse 1s ease-in-out infinite alternate' : 'none',
                                                    }}/>
                                                    <span style={{ fontSize: 9, fontWeight: 600, color: sc, letterSpacing: '0.2px' }}>
                                                        {statusLabel(record.status, record.count)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Review summary */}
                                {state.phase === 'review' && (
                                    <div style={{ marginTop: 16 }}>
                                        {alreadyMigrated ? (
                                            <div style={{
                                                padding: '12px 14px',
                                                background: isDarkMode ? 'rgba(32, 178, 108, 0.10)' : 'rgba(32, 178, 108, 0.06)',
                                                border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(32, 178, 108, 0.18)'}`,
                                                borderRadius: '2px',
                                                fontSize: 11,
                                                color: colours.green,
                                                fontWeight: 600,
                                                display: 'flex', alignItems: 'center', gap: 8,
                                            }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                                    <polyline points="22 4 12 14.01 9 11.01"/>
                                                </svg>
                                                Already migrated — instruction chain exists in the pipeline.
                                            </div>
                                        ) : (
                                            <div style={{
                                                padding: '12px 14px',
                                                background: isDarkMode ? 'rgba(255, 140, 0, 0.08)' : 'rgba(255, 140, 0, 0.04)',
                                                border: `1px solid ${isDarkMode ? 'rgba(255, 140, 0, 0.22)' : 'rgba(255, 140, 0, 0.16)'}`,
                                                borderRadius: '2px',
                                            }}>
                                                <div style={{ fontSize: 11, fontWeight: 600, color: colours.orange, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                                    </svg>
                                                    Migration needed
                                                </div>
                                                <div style={{ fontSize: 10, color: textMuted, lineHeight: 1.6 }}>
                                                    {foundInClio.length > 0 && <span>Found in Clio. </span>}
                                                    {foundInLegacy.length > 0 && <span>Found in Core Data. </span>}
                                                    {missingInNewSpace.length > 0 && (
                                                        <span>Missing from the pipeline: <strong style={{ color: textSecondary }}>{missingInNewSpace.map(r => r.table).join(', ')}</strong>.</span>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Action buttons */}
                                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                            <button onClick={handleReset} style={secondaryBtnStyle}>
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                                                </svg>
                                                Start Over
                                            </button>
                                            {!alreadyMigrated && (
                                                <button onClick={handleProceedToIntake} style={primaryBtnStyle}>
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <path d="M5 12h14M12 5l7 7-7 7"/>
                                                    </svg>
                                                    Proceed to Migrate
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Phase: Intake ── */}
                        {state.phase === 'intake' && (
                            <div>
                                <div style={{ ...sectionTitle, color: sectionAccent }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={sectionAccent} strokeWidth="2.5">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                    </svg>
                                    Migration Intake
                                </div>
                                <div style={{ fontSize: 10, color: textMuted, marginBottom: 14, lineHeight: 1.6 }}>
                                    Provide the details needed to create the pipeline chain. Fields marked with * are required.
                                </div>

                                <div style={{ display: 'grid', gap: 10 }}>
                                    {/* Fee earner */}
                                    <div>
                                        <label style={{ fontSize: 10, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' }}>
                                            Fee Earner *
                                        </label>
                                        <input
                                            type="text"
                                            value={state.intake.feeEarner}
                                            onChange={e => setState(prev => ({ ...prev, intake: { ...prev.intake, feeEarner: e.target.value } }))}
                                            placeholder="Initials (e.g. AC)"
                                            style={inputStyle}
                                        />
                                    </div>

                                    {/* Area of work */}
                                    <div>
                                        <label style={{ fontSize: 10, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' }}>
                                            Area of Work *
                                        </label>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {['commercial', 'construction', 'property', 'employment'].map(aow => (
                                                <button
                                                    key={aow}
                                                    onClick={() => setState(prev => ({ ...prev, intake: { ...prev.intake, areaOfWork: aow } }))}
                                                    style={chipStyle(state.intake.areaOfWork === aow)}
                                                >
                                                    {aow.charAt(0).toUpperCase() + aow.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Service description */}
                                    <div>
                                        <label style={{ fontSize: 10, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' }}>
                                            Service Description *
                                        </label>
                                        <input
                                            type="text"
                                            value={state.intake.serviceDescription}
                                            onChange={e => setState(prev => ({ ...prev, intake: { ...prev.intake, serviceDescription: e.target.value } }))}
                                            placeholder="e.g. Debt recovery proceedings"
                                            style={inputStyle}
                                        />
                                    </div>

                                    {/* Practice area */}
                                    <div>
                                        <label style={{ fontSize: 10, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' }}>
                                            Practice Area
                                        </label>
                                        <input
                                            type="text"
                                            value={state.intake.practiceArea}
                                            onChange={e => setState(prev => ({ ...prev, intake: { ...prev.intake, practiceArea: e.target.value } }))}
                                            placeholder="e.g. Unpaid Loan Recovery (auto-fills from Clio if found)"
                                            style={inputStyle}
                                        />
                                    </div>

                                    {/* Deal amount */}
                                    <div>
                                        <label style={{ fontSize: 10, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 4, display: 'block' }}>
                                            Deal Amount (£)
                                        </label>
                                        <input
                                            type="text"
                                            value={state.intake.dealAmount}
                                            onChange={e => setState(prev => ({ ...prev, intake: { ...prev.intake, dealAmount: e.target.value } }))}
                                            placeholder="0 if pending confirmation"
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                                    <button onClick={() => setState(prev => ({ ...prev, phase: 'review' }))} style={secondaryBtnStyle}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                                        </svg>
                                        Back
                                    </button>
                                    <button
                                        onClick={() => {
                                            // v1: show confirmation — actual API wiring is next step
                                            setState(prev => ({ ...prev, phase: 'ready' }));
                                        }}
                                        disabled={!state.intake.feeEarner.trim() || !state.intake.serviceDescription.trim()}
                                        style={{
                                            ...primaryBtnStyle,
                                            opacity: (!state.intake.feeEarner.trim() || !state.intake.serviceDescription.trim()) ? 0.5 : 1,
                                            cursor: (!state.intake.feeEarner.trim() || !state.intake.serviceDescription.trim()) ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                            <polyline points="22 4 12 14.01 9 11.01"/>
                                        </svg>
                                        Review Migration
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Phase: Ready (confirmation) ── */}
                        {state.phase === 'ready' && (
                            <div>
                                <div style={{ ...sectionTitle, color: sectionAccent }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={sectionAccent} strokeWidth="2.5">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                        <polyline points="22 4 12 14.01 9 11.01"/>
                                    </svg>
                                    Confirm Migration
                                </div>

                                {/* Summary card */}
                                <div style={{
                                    padding: '14px 16px',
                                    background: bgSecondary,
                                    border: `1px solid ${borderMedium}`,
                                    borderRadius: '2px',
                                    marginBottom: 14,
                                }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: textMuted, marginBottom: 10 }}>
                                        Will Create
                                    </div>
                                    <div style={{ display: 'grid', gap: 6 }}>
                                        {[
                                            { label: 'Enquiry', desc: 'New-space enquiry record' },
                                            { label: 'Deal', desc: `${state.intake.areaOfWork} — £${state.intake.dealAmount}` },
                                            { label: 'Instruction', desc: `Fee earner: ${state.intake.feeEarner}` },
                                            { label: 'Matters', desc: `From Clio (${foundInClio.find(r => r.table === 'matters')?.count || '?'} matters)` },
                                            { label: 'ID Verification', desc: 'From POID / Tiller data' },
                                        ].map(item => (
                                            <div key={item.label} style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '6px 10px',
                                                background: isDarkMode ? colours.websiteBlue : '#fff',
                                                border: `1px solid ${borderLight}`,
                                                borderRadius: '2px',
                                            }}>
                                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: colours.blue, flexShrink: 0 }}/>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: textPrimary, minWidth: 90 }}>{item.label}</span>
                                                <span style={{ fontSize: 10, color: textMuted }}>{item.desc}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ fontSize: 10, color: textMuted, lineHeight: 1.6, marginBottom: 14 }}>
                                    This will insert records into the Instructions database. The migration is additive — no existing records will be modified or deleted.
                                </div>

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => setState(prev => ({ ...prev, phase: 'intake' }))} style={secondaryBtnStyle}>
                                        Back
                                    </button>
                                    <button
                                        onClick={() => {
                                            // v1: placeholder — actual execution endpoint TBD
                                            setState(prev => ({
                                                ...prev,
                                                phase: 'complete',
                                                result: { instructionRef: 'HLX-XXXXX-XXXXX', recordsCreated: 0 },
                                            }));
                                        }}
                                        style={{
                                            ...primaryBtnStyle,
                                            background: colours.cta,
                                            border: `1px solid ${colours.cta}`,
                                        }}
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M5 12h14M12 5l7 7-7 7"/>
                                        </svg>
                                        Execute Migration
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Phase: Complete ── */}
                        {state.phase === 'complete' && state.result && (
                            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                <div style={{
                                    width: 48, height: 48,
                                    borderRadius: '50%',
                                    background: isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 14px',
                                }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colours.green} strokeWidth="2.5">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                        <polyline points="22 4 12 14.01 9 11.01"/>
                                    </svg>
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: textPrimary, marginBottom: 4 }}>Migration Complete</div>
                                <div style={{ fontSize: 11, color: textMuted, marginBottom: 16 }}>
                                    Pipeline chain created. Verify with instant-lookup.
                                </div>
                                {state.result.instructionRef && (
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '6px 14px',
                                        background: bgSecondary,
                                        border: `1px solid ${borderMedium}`,
                                        borderRadius: '2px',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: colours.blue,
                                        letterSpacing: '-0.2px',
                                        marginBottom: 16,
                                    }}>
                                        {state.result.instructionRef}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                    <button onClick={handleReset} style={secondaryBtnStyle}>
                                        Migrate Another
                                    </button>
                                    <button onClick={onClose} style={primaryBtnStyle}>
                                        Done
                                    </button>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </>
    );
};

export default LegacyMigrationTool;
