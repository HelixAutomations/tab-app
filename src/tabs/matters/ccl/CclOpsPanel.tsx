import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon, Spinner, SpinnerSize } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';
import {
    fetchCclMatterDetail,
    fetchCclAssessments,
    submitCclAssessment,
    fetchContextPreview,
    reconstructCclVersion,
    type CclMatterDetail,
    type CclAiTraceRecord,
    type CclContentRecord,
    type CclAssessmentRecord,
    type CclAssessmentPayload,
    type CclReconstructVersionResult,
    type ContextPreviewResponse,
    ISSUE_CATEGORIES,
} from './cclAiService';

// ─── Types ──────────────────────────────────────────────────────────────────
interface CclOpsPanelProps {
    matterId: string;
    isDarkMode: boolean;
    onClose: () => void;
    userInitials?: string;
    /** Instruction ref for context-preview requests */
    instructionRef?: string;
}

type Tab = 'history' | 'traces' | 'assessments';

// ─── Constants ──────────────────────────────────────────────────────────────
const FONT_MONO = 'Consolas, Monaco, "Courier New", monospace';
const TRANSITION = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
const ASSESSMENT_USERS = ['LZ', 'AC'];

const STATUS_COLOURS: Record<string, string> = {
    draft:    '#3690CE',
    final:    '#20b26c',
    uploaded: '#8b5cf6',
    complete: '#20b26c',
    partial:  '#f59e0b',
    fallback: '#6b7280',
    error:    '#ef4444',
};

const SCORE_LABELS: Record<number, { label: string; colour: string }> = {
    1: { label: 'Poor', colour: '#ef4444' },
    2: { label: 'Needs Work', colour: '#f59e0b' },
    3: { label: 'Acceptable', colour: '#eab308' },
    4: { label: 'Good', colour: '#22c55e' },
    5: { label: 'Excellent', colour: '#10b981' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function relativeDate(iso: string | null): string {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function safeJsonParse(val: string | null | undefined): unknown {
    if (!val) return null;
    try { return JSON.parse(val); } catch { return val; }
}

function statusColour(status: string): string {
    return STATUS_COLOURS[status?.toLowerCase()] || '#6b7280';
}

function firstNonEmpty(...values: unknown[]): string | null {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
}

function normKey(input: string): string {
    return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickFieldLoose(fields: Record<string, unknown> | null, keys: string[]): string | null {
    if (!fields) return null;
    const wanted = new Set(keys.map(normKey));
    for (const [key, rawValue] of Object.entries(fields)) {
        if (!wanted.has(normKey(key))) continue;
        if (typeof rawValue === 'string' && rawValue.trim()) return rawValue.trim();
        if (typeof rawValue === 'number') return String(rawValue);
    }
    return null;
}

function toInitials(raw: string | null | undefined): string {
    const value = (raw || '').trim();
    if (!value) return 'AI';
    const upper = value.toUpperCase();
    if (['UNKNOWN', 'SYSTEM', 'NULL', 'N/A'].includes(upper)) return 'AI';
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
        return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
    }
    return value.slice(0, 2).toUpperCase();
}

function normalizeAuthor(raw: string | null | undefined): string {
    const value = (raw || '').trim();
    if (!value) return 'AI Pipeline';
    const upper = value.toUpperCase();
    if (['UNKNOWN', 'SYSTEM', 'NULL', 'N/A'].includes(upper)) return 'AI Pipeline';
    return value;
}

function getExpiryStatus(version: CclContentRecord, fields: Record<string, unknown> | null): {
    expiresAt: Date | null;
    source: 'fields' | 'inferred_30d' | 'none';
    isExpired: boolean | null;
} {
    const explicitRaw = firstNonEmpty(
        pickFieldLoose(fields, [
            'pitch_expiry',
            'pitchExpiry',
            'insert_pitch_expiry',
            'insert_pitch_expiry_date',
            'insert_quote_expiry',
            'insert_quote_expiry_date',
        ])
    );

    if (explicitRaw) {
        const explicitDate = new Date(explicitRaw);
        if (!Number.isNaN(explicitDate.getTime())) {
            return {
                expiresAt: explicitDate,
                source: 'fields',
                isExpired: explicitDate.getTime() < Date.now(),
            };
        }
    }

    const baseIso = version.FinalizedAt || version.CreatedAt;
    if (!baseIso) return { expiresAt: null, source: 'none', isExpired: null };
    const baseDate = new Date(baseIso);
    if (Number.isNaN(baseDate.getTime())) return { expiresAt: null, source: 'none', isExpired: null };
    const inferred = new Date(baseDate.getTime());
    inferred.setDate(inferred.getDate() + 30);

    return {
        expiresAt: inferred,
        source: 'inferred_30d',
        isExpired: inferred.getTime() < Date.now(),
    };
}

/** Initials avatar circle */
const Avatar: React.FC<{ initials: string; size?: number; colour?: string; isDark: boolean }> = ({ initials, size = 24, colour, isDark }) => (
    <div style={{
        width: size, height: size, borderRadius: 2, flexShrink: 0,
        background: colour ? `${colour}18` : (isDark ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.08)'),
        border: `1px solid ${colour ? `${colour}30` : (isDark ? 'rgba(54,144,206,0.25)' : 'rgba(54,144,206,0.15)')}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.42, fontWeight: 700, color: colour || '#3690CE',
        fontFamily: FONT_MONO, letterSpacing: 0.5,
    }}>
        {(initials || '??').toUpperCase()}
    </div>
);

// ─── Component ──────────────────────────────────────────────────────────────
const CclOpsPanel: React.FC<CclOpsPanelProps> = ({ matterId, isDarkMode, onClose, userInitials, instructionRef }) => {
    const [data, setData] = useState<CclMatterDetail | null>(null);
    const [assessments, setAssessments] = useState<CclAssessmentRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('history');
    const [expandedTraceId, setExpandedTraceId] = useState<number | null>(null);
    const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null);
    const [assessingVersion, setAssessingVersion] = useState<CclContentRecord | null>(null);

    // ─── Context preview (Show Fed Data) ────────────────────────────────
    const [ctxPreview, setCtxPreview] = useState<ContextPreviewResponse | null>(null);
    const [ctxLoading, setCtxLoading] = useState(false);
    const [ctxError, setCtxError] = useState<string | null>(null);
    const [showCtxPreview, setShowCtxPreview] = useState(false);

    const handleReconstructVersion = useCallback(async (version: CclContentRecord): Promise<CclReconstructVersionResult> => {
        return reconstructCclVersion(version.CclContentId);
    }, []);

    const handleToggleFedData = useCallback(async () => {
        if (showCtxPreview) {
            setShowCtxPreview(false);
            return;
        }
        setShowCtxPreview(true);
        if (ctxPreview) return;

        setCtxLoading(true);
        setCtxError(null);
        try {
            const result = await fetchContextPreview({
                matterId,
                instructionRef: instructionRef || '',
                practiceArea: '',
                description: '',
                clientName: '',
                opponent: '',
                handlerName: '',
                handlerRole: '',
                handlerRate: '',
            });
            if (result.ok) {
                setCtxPreview(result);
            } else {
                setCtxError('Context preview returned no data');
            }
        } catch (err) {
            setCtxError(err instanceof Error ? err.message : 'Failed to fetch context');
        } finally {
            setCtxLoading(false);
        }
    }, [showCtxPreview, ctxPreview, matterId, instructionRef]);

    const handleRefreshFedData = useCallback(async () => {
        setCtxLoading(true);
        setCtxError(null);
        try {
            const result = await fetchContextPreview({
                matterId,
                instructionRef: instructionRef || '',
                practiceArea: '',
                description: '',
                clientName: '',
                opponent: '',
                handlerName: '',
                handlerRole: '',
                handlerRate: '',
            });
            if (result.ok) {
                setCtxPreview(result);
            } else {
                setCtxError('Context preview returned no data');
            }
        } catch (err) {
            setCtxError(err instanceof Error ? err.message : 'Failed to fetch context');
        } finally {
            setCtxLoading(false);
        }
    }, [matterId, instructionRef]);

    const canAssess = useMemo(() => {
        if (!userInitials) return false;
        return ASSESSMENT_USERS.includes(userInitials.toUpperCase());
    }, [userInitials]);

    const bg = isDarkMode ? colours.dark.background : '#fff';
    const cardBg = isDarkMode ? colours.dark.cardBackground : '#f9fafb';
    const text = isDarkMode ? colours.dark.text : '#1f2937';
    const textMuted = isDarkMode ? '#9ca3af' : '#6b7280';
    const border = isDarkMode ? colours.dark.border : '#e5e7eb';
    const accent = colours.highlight;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [result, assessData] = await Promise.all([
                fetchCclMatterDetail(matterId),
                fetchCclAssessments(matterId),
            ]);
            if (!result?.ok) throw new Error('Failed to load');
            setData(result);
            setAssessments(assessData);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load ops data');
        } finally {
            setLoading(false);
        }
    }, [matterId]);

    useEffect(() => { load(); }, [load]);

    // ─── Tab buttons ────────────────────────────────────────────────────
    const tabs: { key: Tab; label: string; icon: string; count?: number }[] = [
        { key: 'history', label: 'Content History', icon: 'History', count: data?.versions?.length },
        { key: 'traces', label: 'AI Traces', icon: 'Processing', count: data?.aiTraces?.length },
        { key: 'assessments', label: 'Assessments', icon: 'AnalyticsReport', count: assessments.length },
    ];

    // ─── Render ─────────────────────────────────────────────────────────
    const latestStatus = data?.latest?.Status?.toLowerCase() || '';
    const latestColour = statusColour(latestStatus);
    const versionCount = data?.versions?.length || 0;
    const assessedCount = new Set(assessments.map(a => a.CclContentId).filter(Boolean)).size;
    const latestTrace = (data?.aiTraces || [])
        .slice()
        .sort((a, b) => new Date(b.CreatedAt || 0).getTime() - new Date(a.CreatedAt || 0).getTime())[0];
    const coveragePct = versionCount > 0 ? `${Math.round((assessedCount / versionCount) * 100)}%` : '0%';
    const latestFields = safeJsonParse(data?.latest?.FieldsJson || null) as Record<string, unknown> | null;
    const latestTraceContext = latestTrace?.ContextFieldsJson
        ? (safeJsonParse(latestTrace.ContextFieldsJson) as Record<string, unknown> | null)
        : null;
    const topClient = firstNonEmpty(
        data?.latest?.ClientName,
        pickFieldLoose(latestFields, ['insert_clients_name', 'client_name', 'clientName', 'insert_client_name']),
        pickFieldLoose(latestTraceContext, ['clientName', 'client_name', 'client'])
    );
    const activeTabSummary = activeTab === 'history'
        ? 'History view · content and delivery audit trail'
        : activeTab === 'traces'
            ? `AI trace view${latestTrace?.CreatedAt ? ` · last run ${relativeDate(latestTrace.CreatedAt)}` : ''}`
            : `Assessment view · ${coveragePct} coverage`;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: 540,
            height: '100vh',
            background: bg,
            borderLeft: `2px solid ${isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(0,0,0,0.08)'}`,
            boxShadow: isDarkMode ? '-4px 0 32px rgba(0,0,0,0.4)' : '-4px 0 32px rgba(0,0,0,0.1)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        }}>
            {/* ═══ Header ═══ */}
            <div style={{
                padding: '14px 20px',
                background: isDarkMode ? '#061733' : '#061733',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexShrink: 0,
            }}>
                <div style={{
                    width: 32, height: 32, borderRadius: 2,
                    background: 'rgba(54,144,206,0.15)',
                    border: '1px solid rgba(54,144,206,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon iconName="Shield" style={{ fontSize: 16, color: '#3690CE' }} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: 0.3 }}>CCL Operations</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: FONT_MONO }}>{matterId}</div>
                </div>
                <button onClick={load} title="Refresh" style={{
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 2, padding: '4px 8px', cursor: 'pointer', color: 'rgba(255,255,255,0.6)',
                    transition: TRANSITION,
                }}>
                    <Icon iconName="Refresh" style={{ fontSize: 12 }} />
                </button>
                <button onClick={onClose} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.4)', padding: 4,
                }}>
                    <Icon iconName="ChromeClose" style={{ fontSize: 11 }} />
                </button>
            </div>

            {/* ═══ Ops context strip ═══ */}
            {data && !loading && (
                <div style={{
                    padding: '7px 20px',
                    borderBottom: `1px solid ${border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexShrink: 0,
                    background: isDarkMode ? 'rgba(54,144,206,0.02)' : 'rgba(54,144,206,0.015)',
                }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 9px', borderRadius: 2,
                        background: isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(0,0,0,0.03)',
                        border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.05)'}`,
                        color: textMuted,
                        fontSize: 10,
                    }}>
                        <Icon iconName="Info" style={{ fontSize: 9, opacity: 0.65 }} />
                        <span style={{ fontFamily: FONT_MONO }}>{activeTabSummary}</span>
                    </div>
                    {data.latest && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '3px 10px', borderRadius: 2,
                            background: `${latestColour}12`,
                            border: `1px solid ${latestColour}30`,
                            borderLeft: `3px solid ${latestColour}`,
                        }}>
                            <span style={{ fontSize: 9, color: textMuted, fontWeight: 500 }}>Latest</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: latestColour, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                {data.latest.Status}
                            </span>
                        </div>
                    )}
                    {topClient && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '3px 10px', borderRadius: 2,
                            background: isDarkMode ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)',
                            border: `1px solid ${isDarkMode ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.15)'}`,
                        }}>
                            <Icon iconName="Contact" style={{ fontSize: 9, color: '#10b981' }} />
                            <span style={{ fontSize: 9, color: textMuted }}>Client</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981' }}>{topClient}</span>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Show Fed Data ═══ */}
            <div style={{
                padding: '6px 20px',
                borderBottom: `1px solid ${border}`,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
            }}>
                <button
                    onClick={handleToggleFedData}
                    disabled={ctxLoading}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 12px', borderRadius: 2, height: 26,
                        background: isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.06)',
                        border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.3)' : 'rgba(54,144,206,0.2)'}`,
                        borderLeft: '3px solid #3690CE',
                        color: '#3690CE', fontSize: 10, fontWeight: 600,
                        cursor: ctxLoading ? 'wait' : 'pointer',
                        opacity: ctxLoading ? 0.6 : 1,
                        transition: TRANSITION,
                    }}
                >
                    {ctxLoading ? <Spinner size={SpinnerSize.xSmall} /> : <Icon iconName="Database" style={{ fontSize: 11 }} />}
                    {showCtxPreview ? 'Hide Fed Data' : 'Show Fed Data'}
                </button>
                {showCtxPreview && (
                    <button onClick={handleRefreshFedData} disabled={ctxLoading} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: textMuted, fontSize: 10,
                    }}>Refresh</button>
                )}
                <div style={{ flex: 1 }} />
                {showCtxPreview && ctxPreview && !ctxLoading && (
                    <span style={{ fontSize: 9, color: textMuted, fontFamily: FONT_MONO }}>
                        {ctxPreview.dataSources?.length || 0} sources · {(ctxPreview.userPromptLength || 0).toLocaleString()} chars
                    </span>
                )}
            </div>

            {/* Context preview panel */}
            {showCtxPreview && (ctxLoading || ctxPreview || ctxError) && (
                <div style={{
                    padding: '12px 20px',
                    borderBottom: `1px solid ${border}`,
                    maxHeight: 300,
                    overflowY: 'auto',
                    flexShrink: 0,
                    background: isDarkMode ? 'rgba(54,144,206,0.04)' : 'rgba(54,144,206,0.02)',
                }}>
                    {ctxLoading && <div style={{ textAlign: 'center', padding: '16px 0' }}><Spinner size={SpinnerSize.small} label="Gathering context..." /></div>}
                    {ctxError && <div style={{ color: '#ef4444', fontSize: 11, padding: 8 }}><Icon iconName="ErrorBadge" style={{ marginRight: 6 }} />{ctxError}</div>}
                    {ctxPreview && !ctxLoading && (
                        <>
                            <ContextSection label={`Data Sources (${ctxPreview.dataSources?.length || 0})`} isDark={isDarkMode}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {(ctxPreview.dataSources || []).map((src, i) => (
                                        <span key={i} style={{
                                            padding: '2px 8px', borderRadius: 2, fontSize: 10, fontWeight: 500,
                                            background: isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.08)',
                                            color: '#3690CE', border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(54,144,206,0.15)'}`,
                                        }}>{src}</span>
                                    ))}
                                    {(!ctxPreview.dataSources || ctxPreview.dataSources.length === 0) && (
                                        <span style={{ fontSize: 10, color: textMuted, fontStyle: 'italic' }}>No data sources found</span>
                                    )}
                                </div>
                            </ContextSection>
                            {ctxPreview.contextFields && Object.keys(ctxPreview.contextFields).length > 0 && (
                                <ContextSection label={`Resolved Fields (${Object.keys(ctxPreview.contextFields).length})`} isDark={isDarkMode}>
                                    <div style={{ background: isDarkMode ? '#0f172a' : '#f8fafc', border: `1px solid ${border}`, borderRadius: 2, padding: 8, maxHeight: 120, overflowY: 'auto' }}>
                                        {Object.entries(ctxPreview.contextFields).map(([k, v]) => (
                                            <div key={k} style={{ fontSize: 10, marginBottom: 2, lineHeight: 1.5 }}>
                                                <span style={{ color: '#3690CE', fontWeight: 600, fontFamily: FONT_MONO, fontSize: 9 }}>{k}</span>
                                                <span style={{ color: textMuted, margin: '0 4px' }}>→</span>
                                                <span style={{ color: text }}>{String(v).slice(0, 100)}{String(v).length > 100 ? '…' : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                </ContextSection>
                            )}
                            <ContextSection label="Context Snippets" isDark={isDarkMode}>
                                {['initialCallNotes', 'enquiryNotes', 'instructionNotes'].map((label) => {
                                    const snippet = ctxPreview.snippets?.[label] || '';
                                    const fallback = ctxPreview.contextFields?.[label] || '';
                                    const value = (snippet || fallback || '').trim();
                                    return (
                                        <div key={label} style={{ marginBottom: 6 }}>
                                            <div style={{ fontSize: 9, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
                                            <div style={{
                                                fontSize: 10, color: value ? text : textMuted, lineHeight: 1.4,
                                                background: isDarkMode ? '#0f172a' : '#f8fafc',
                                                border: `1px solid ${border}`, borderRadius: 2,
                                                padding: '4px 8px', maxHeight: 60, overflowY: 'auto',
                                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                                fontStyle: value ? 'normal' : 'italic',
                                            }}>{value ? `${value.slice(0, 400)}${value.length > 400 ? '…' : ''}` : 'No snippet returned from context pipeline.'}</div>
                                        </div>
                                    );
                                })}
                            </ContextSection>
                            <div style={{ fontSize: 9, color: textMuted, display: 'flex', gap: 12, fontFamily: FONT_MONO, marginTop: 6 }}>
                                <span>sys: {(ctxPreview.systemPromptLength || 0).toLocaleString()} chars</span>
                                <span>usr: {(ctxPreview.userPromptLength || 0).toLocaleString()} chars</span>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ═══ Tab bar ═══ */}
            <div style={{ display: 'flex', flexShrink: 0 }}>
                {tabs.map(t => {
                    const isActive = activeTab === t.key;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            style={{
                                flex: 1,
                                padding: '9px 0',
                                background: isActive ? (isDarkMode ? '#061733' : '#061733') : 'none',
                                border: 'none',
                                borderBottom: isActive ? 'none' : `1px solid ${border}`,
                                color: isActive ? '#fff' : textMuted,
                                fontWeight: isActive ? 700 : 400,
                                fontSize: 11,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 5,
                                transition: TRANSITION,
                                letterSpacing: isActive ? 0.3 : 0,
                            }}
                        >
                            <Icon iconName={t.icon} style={{ fontSize: 11 }} />
                            {t.label}
                            {t.count !== undefined && (
                                <span style={{
                                    background: isActive ? 'rgba(255,255,255,0.15)' : (isDarkMode ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.05)'),
                                    color: isActive ? 'rgba(255,255,255,0.8)' : textMuted,
                                    borderRadius: 2, padding: '1px 5px',
                                    fontSize: 9, fontWeight: 700, fontFamily: FONT_MONO,
                                }}>{t.count}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ═══ Content area ═══ */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
                {loading && (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <Spinner size={SpinnerSize.medium} label="Loading ops data..." />
                    </div>
                )}
                {error && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: '#ef4444' }}>
                        <Icon iconName="ErrorBadge" style={{ fontSize: 24, marginBottom: 8, display: 'block' }} />
                        {error}
                    </div>
                )}

                {!loading && !error && data && activeTab === 'history' && (
                    <HistoryTab
                        versions={data.versions || []}
                        aiTraces={data.aiTraces || []}
                        expandedId={expandedVersionId}
                        onToggle={id => setExpandedVersionId(expandedVersionId === id ? null : id)}
                        onReconstruct={handleReconstructVersion}
                        onAssess={canAssess ? (v) => setAssessingVersion(v) : undefined}
                        assessments={assessments}
                        isDark={isDarkMode}
                        cardBg={cardBg}
                        text={text}
                        textMuted={textMuted}
                        border={border}
                        accent={accent}
                    />
                )}

                {!loading && !error && data && activeTab === 'traces' && (
                    <TracesTab
                        traces={data.aiTraces || []}
                        expandedId={expandedTraceId}
                        onToggle={id => setExpandedTraceId(expandedTraceId === id ? null : id)}
                        isDark={isDarkMode}
                        cardBg={cardBg}
                        text={text}
                        textMuted={textMuted}
                        border={border}
                        accent={accent}
                    />
                )}

                {!loading && !error && activeTab === 'assessments' && (
                    <AssessmentsTab
                        assessments={assessments}
                        isDark={isDarkMode}
                        cardBg={cardBg}
                        text={text}
                        textMuted={textMuted}
                        border={border}
                        accent={accent}
                    />
                )}
            </div>

            {/* Assessment modal overlay */}
            {assessingVersion && canAssess && (
                <AssessmentForm
                    version={assessingVersion}
                    aiTraces={data?.aiTraces || []}
                    userInitials={userInitials || ''}
                    isDark={isDarkMode}
                    onSubmit={async (payload) => {
                        const result = await submitCclAssessment(payload);
                        if (result.ok) {
                            setAssessingVersion(null);
                            load();
                        }
                        return result;
                    }}
                    onClose={() => setAssessingVersion(null)}
                />
            )}
        </div>
    );
};

// ─── History Tab ────────────────────────────────────────────────────────────
const HistoryTab: React.FC<{
    versions: CclContentRecord[];
    aiTraces: CclAiTraceRecord[];
    expandedId: number | null;
    onToggle: (id: number) => void;
    onReconstruct?: (v: CclContentRecord) => Promise<CclReconstructVersionResult>;
    onAssess?: (v: CclContentRecord) => void;
    assessments: CclAssessmentRecord[];
    isDark: boolean;
    cardBg: string;
    text: string;
    textMuted: string;
    border: string;
    accent: string;
}> = ({ versions, aiTraces, expandedId, onToggle, onReconstruct, onAssess, assessments, isDark, cardBg, text, textMuted, border, accent }) => {
    const [reconstructingId, setReconstructingId] = useState<number | null>(null);
    const [reconstructMsgById, setReconstructMsgById] = useState<Record<number, string>>({});

    if (versions.length === 0) {
        return <EmptyState icon="PageList" message="No content versions saved yet" textMuted={textMuted} />;
    }

    const assessedContentIds = new Set(assessments.map(a => a.CclContentId).filter(Boolean));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {versions.map(v => {
                const isExpanded = expandedId === v.CclContentId;
                const fields = safeJsonParse(v.FieldsJson) as Record<string, unknown> | null;
                const isAssessed = assessedContentIds.has(v.CclContentId);
                const sColour = statusColour(v.Status);
                const filledCount = fields ? Object.values(fields).filter((val): val is string => typeof val === 'string' && val.trim().length > 0).length : 0;
                const totalCount = fields ? Object.keys(fields).length : 0;

                // Get a preview snippet from the scope field
                const scopePreview = fields?.['insert_current_position_and_scope_of_retainer'];
                const descPreview = v.MatterDescription || (typeof scopePreview === 'string' ? scopePreview : null);
                const relatedTrace = aiTraces
                    .filter(t => new Date(t.CreatedAt).getTime() <= new Date(v.CreatedAt).getTime())
                    .sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime())[0] || null;
                const traceContext = relatedTrace?.ContextFieldsJson
                    ? (safeJsonParse(relatedTrace.ContextFieldsJson) as Record<string, unknown> | null)
                    : null;
                const traceClientCombined = firstNonEmpty(
                    pickFieldLoose(traceContext, ['clientName', 'client_name', 'client']),
                    firstNonEmpty(
                        pickFieldLoose(traceContext, ['first_name', 'First_Name', 'firstName']),
                        pickFieldLoose(traceContext, ['last_name', 'Last_Name', 'lastName'])
                    )
                        ? `${pickFieldLoose(traceContext, ['first_name', 'First_Name', 'firstName']) || ''} ${pickFieldLoose(traceContext, ['last_name', 'Last_Name', 'lastName']) || ''}`.trim()
                        : null
                );

                const displayClientName = firstNonEmpty(
                    v.ClientName,
                    pickFieldLoose(fields, [
                        'insert_clients_name',
                        'insert_client_name',
                        'client_name',
                        'clientName',
                        'insert_client',
                    ]),
                    traceClientCombined
                ) || 'Client not captured';

                const displayFeeEarner = firstNonEmpty(
                    v.FeeEarner,
                    pickFieldLoose(fields, [
                        'name_of_person_handling_matter',
                        'name_of_handler',
                        'insert_fee_earner_name',
                        'fee_earner',
                        'feeEarner',
                        'handlerName',
                    ]),
                    pickFieldLoose(traceContext, ['handlerName', 'feeEarner', 'fee_earner'])
                );

                const displayPracticeArea = firstNonEmpty(
                    v.PracticeArea,
                    pickFieldLoose(fields, [
                        'practice_area',
                        'practiceArea',
                        'insert_practice_area',
                    ]),
                    pickFieldLoose(traceContext, ['practiceArea', 'practice_area', 'area_of_work'])
                );

                const displayAuthor = normalizeAuthor(firstNonEmpty(v.CreatedBy, relatedTrace?.CreatedBy));
                const avatarInitials = toInitials(displayAuthor);
                const expiry = getExpiryStatus(v, fields);
                const sentAt = firstNonEmpty(v.FinalizedAt, v.CreatedAt);
                const expiryLabel = expiry.expiresAt
                    ? (expiry.isExpired ? `Expired ${relativeDate(expiry.expiresAt.toISOString())}` : `Expires ${formatDate(expiry.expiresAt.toISOString())}`)
                    : 'Expiry unavailable';
                const inferredNarrative = Object.values(fields || {})
                    .filter((val): val is string => typeof val === 'string' && val.trim().length > 40)
                    .slice(0, 2)
                    .join(' ');
                const letterSnapshot = firstNonEmpty(
                    v.MatterDescription,
                    pickFieldLoose(fields, ['insert_current_position_and_scope_of_retainer']),
                    pickFieldLoose(fields, ['next_steps']),
                    pickFieldLoose(fields, ['charges_estimate_paragraph']),
                    pickFieldLoose(fields, ['insert_heading_eg_matter_description']),
                    inferredNarrative,
                );

                return (
                    <div
                        key={v.CclContentId}
                        style={{
                            background: isDark ? '#0f172a' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                            border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.06)'}`,
                            borderLeft: `3px solid ${sColour}`,
                            borderRadius: 2,
                            overflow: 'hidden',
                            transition: TRANSITION,
                            boxShadow: isExpanded
                                ? (isDark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.08)')
                                : 'none',
                        }}
                    >
                        {/* Card header */}
                        <button
                            onClick={() => onToggle(v.CclContentId)}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10,
                                textAlign: 'left',
                            }}
                        >
                            {/* User avatar */}
                            <Avatar initials={avatarInitials} isDark={isDark} colour={sColour} />

                            <div style={{ flex: 1, minWidth: 0 }}>
                                {/* Row 1: version + date + badges */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                    <span style={{
                                        fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, color: text,
                                    }}>v{v.Version}</span>
                                    <span style={{ fontSize: 9, color: textMuted, fontFamily: FONT_MONO }}>
                                        {relativeDate(v.CreatedAt)}
                                    </span>
                                    <div style={{ flex: 1 }} />
                                    {/* Status chip */}
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '2px 8px', borderRadius: 2,
                                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3,
                                        background: `${sColour}15`,
                                        color: sColour,
                                        border: `1px solid ${sColour}30`,
                                    }}>
                                        <Icon iconName={
                                            v.Status === 'final' ? 'CheckMark' :
                                            v.Status === 'uploaded' ? 'CloudUpload' :
                                            'Edit'
                                        } styles={{ root: { fontSize: 8 } }} />
                                        {v.Status}
                                    </span>
                                    {isAssessed && (
                                        <Icon iconName="SkypeCircleCheck" style={{ fontSize: 10, color: '#10b981' }} />
                                    )}
                                </div>

                                {/* Row 2: client / fee earner / practice area */}
                                <div style={{ fontSize: 11, color: text, fontWeight: 500, marginBottom: 2 }}>
                                    {displayClientName}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: textMuted }}>
                                    {displayFeeEarner && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <Icon iconName="Contact" styles={{ root: { fontSize: 9, opacity: 0.6 } }} />
                                            {displayFeeEarner}
                                        </span>
                                    )}
                                    {displayPracticeArea && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <Icon iconName="Tag" styles={{ root: { fontSize: 9, opacity: 0.6 } }} />
                                            {displayPracticeArea}
                                        </span>
                                    )}
                                    {v.UploadedToClio && (
                                        <span style={{ color: '#10b981' }}>
                                            <Icon iconName="CloudUpload" styles={{ root: { fontSize: 9 } }} /> Clio
                                        </span>
                                    )}
                                    {v.FinalizedAt && (
                                        <span style={{ color: '#0ea5e9', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                            <Icon iconName="SkypeCircleCheck" styles={{ root: { fontSize: 9 } }} /> sent
                                        </span>
                                    )}
                                    {expiry.isExpired === true && (
                                        <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                            <Icon iconName="Warning" styles={{ root: { fontSize: 9 } }} /> expired
                                        </span>
                                    )}
                                </div>

                                {/* Row 3: content preview */}
                                {descPreview && !isExpanded && (
                                    <div style={{
                                        fontSize: 10, color: textMuted, marginTop: 4,
                                        lineHeight: 1.4, overflow: 'hidden',
                                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                                    }}>
                                        {String(descPreview).slice(0, 150)}
                                    </div>
                                )}
                            </div>

                            <Icon
                                iconName={isExpanded ? 'ChevronUp' : 'ChevronDown'}
                                style={{ fontSize: 9, color: textMuted, flexShrink: 0, marginTop: 4 }}
                            />
                        </button>

                        {/* Expanded detail */}
                        {isExpanded && (
                            <div style={{
                                padding: '0 14px 14px',
                                borderTop: `1px solid ${isDark ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.04)'}`,
                            }}>
                                {/* Actions row */}
                                <div style={{ display: 'flex', gap: 6, marginTop: 10, marginBottom: 10 }}>
                                    {onReconstruct && (
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                setReconstructingId(v.CclContentId);
                                                const result = await onReconstruct(v);
                                                setReconstructingId(null);
                                                if (result.ok && result.url) {
                                                    window.open(result.url, '_blank', 'noopener,noreferrer');
                                                    const sentStamp = result.sent?.finalizedAt ? formatDate(result.sent.finalizedAt) : 'not finalised';
                                                    const expiryStamp = result.expiry?.expiresAt ? formatDate(result.expiry.expiresAt) : 'not available';
                                                    setReconstructMsgById(prev => ({
                                                        ...prev,
                                                        [v.CclContentId]: `Reconstructed and opened · ${sentStamp} · expiry ${expiryStamp}`,
                                                    }));
                                                } else {
                                                    setReconstructMsgById(prev => ({
                                                        ...prev,
                                                        [v.CclContentId]: result.error || 'Failed to reconstruct this version',
                                                    }));
                                                }
                                            }}
                                            disabled={reconstructingId === v.CclContentId}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                                padding: '5px 12px', borderRadius: 2, height: 26,
                                                background: isDark ? 'rgba(14,165,233,0.12)' : 'rgba(14,165,233,0.08)',
                                                border: `1px solid ${isDark ? 'rgba(14,165,233,0.35)' : 'rgba(14,165,233,0.2)'}`,
                                                color: '#0ea5e9', fontSize: 10, fontWeight: 600,
                                                cursor: reconstructingId === v.CclContentId ? 'wait' : 'pointer',
                                                opacity: reconstructingId === v.CclContentId ? 0.65 : 1,
                                                transition: TRANSITION,
                                            }}
                                        >
                                            {reconstructingId === v.CclContentId
                                                ? <Spinner size={SpinnerSize.xSmall} />
                                                : <Icon iconName="OpenInNewWindow" style={{ fontSize: 10 }} />}
                                            One-click sent preview
                                        </button>
                                    )}
                                    {onAssess && !isAssessed && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onAssess(v); }}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                                padding: '5px 12px', borderRadius: 2, height: 26,
                                                background: isDark ? '#061733' : '#061733',
                                                border: 'none',
                                                color: '#fff', fontSize: 10, fontWeight: 600,
                                                cursor: 'pointer', transition: TRANSITION,
                                            }}
                                        >
                                            <Icon iconName="AnalyticsReport" style={{ fontSize: 10 }} />
                                            Assess this version
                                        </button>
                                    )}
                                    {isAssessed && (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 5,
                                            padding: '4px 10px', borderRadius: 2,
                                            background: '#10b98108', border: '1px solid #10b98118',
                                            fontSize: 10, color: '#10b981', fontWeight: 500,
                                        }}>
                                            <Icon iconName="SkypeCircleCheck" style={{ fontSize: 10 }} />
                                            Assessment on file
                                        </div>
                                    )}
                                </div>

                                {reconstructMsgById[v.CclContentId] && (
                                    <div style={{
                                        marginTop: -4,
                                        marginBottom: 10,
                                        fontSize: 10,
                                        color: reconstructMsgById[v.CclContentId].toLowerCase().includes('failed') ? '#ef4444' : textMuted,
                                        fontFamily: FONT_MONO,
                                    }}>
                                        {reconstructMsgById[v.CclContentId]}
                                    </div>
                                )}

                                <div style={{
                                    marginBottom: 10,
                                    padding: '7px 10px',
                                    borderRadius: 2,
                                    background: isDark ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.05)',
                                    border: `1px solid ${isDark ? 'rgba(54,144,206,0.25)' : 'rgba(54,144,206,0.18)'}`,
                                    borderLeft: '3px solid #3690CE',
                                }}>
                                    <div style={{
                                        fontSize: 9,
                                        fontWeight: 700,
                                        color: textMuted,
                                        textTransform: 'uppercase',
                                        letterSpacing: 0.4,
                                        marginBottom: 5,
                                    }}>
                                        Delivery Audit
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 9, color: textMuted, fontFamily: FONT_MONO }}>
                                        <span>status: {v.FinalizedAt || v.UploadedToClio || v.UploadedToNd ? 'sent/finalised' : 'draft only'}</span>
                                        <span>client: {displayClientName}</span>
                                        <span>handler: {displayFeeEarner || 'not captured'}</span>
                                        <span>by: {firstNonEmpty(v.FinalizedBy, displayAuthor) || 'unknown'}</span>
                                        <span>when: {sentAt ? formatDate(sentAt) : 'unknown'}</span>
                                        <span>to: {firstNonEmpty(v.ClientEmail, pickFieldLoose(fields, ['client_email', 'email'])) || 'recipient not captured'}</span>
                                        <span>where: {v.UploadedToClio || v.UploadedToNd ? `${v.UploadedToClio ? 'Clio' : ''}${v.UploadedToClio && v.UploadedToNd ? ' + ' : ''}${v.UploadedToNd ? 'NetDocuments' : ''}` : 'not uploaded'}</span>
                                        {(v.ClioDocId || v.NdDocId) && <span>doc refs: {[v.ClioDocId, v.NdDocId].filter(Boolean).join(' / ')}</span>}
                                        {v.InstructionRef && <span>ref: {v.InstructionRef}</span>}
                                        <span style={{ color: expiry.isExpired ? '#ef4444' : textMuted }}>
                                            {expiryLabel}{expiry.source === 'inferred_30d' ? ' (30d inferred)' : ''}
                                        </span>
                                    </div>
                                </div>

                                <div style={{
                                    marginBottom: 10,
                                    padding: '7px 10px',
                                    borderRadius: 2,
                                    background: isDark ? 'rgba(15,23,42,0.65)' : '#f8fafc',
                                    border: `1px solid ${border}`,
                                }}>
                                    <div style={{
                                        fontSize: 9,
                                        fontWeight: 700,
                                        color: textMuted,
                                        textTransform: 'uppercase',
                                        letterSpacing: 0.4,
                                        marginBottom: 5,
                                    }}>
                                        Letter Snapshot
                                    </div>
                                    <div style={{
                                        fontSize: 10,
                                        color: text,
                                        lineHeight: 1.5,
                                        whiteSpace: 'pre-wrap',
                                    }}>
                                        {(letterSnapshot || '').slice(0, 520) || 'No CCL narrative snapshot captured in this version.'}
                                    </div>
                                </div>

                                {/* Fields */}
                                {fields && filledCount > 0 && (
                                    <>
                                        <div style={{
                                            fontSize: 9, fontWeight: 700, color: textMuted,
                                            textTransform: 'uppercase', letterSpacing: 0.5,
                                            marginBottom: 6, paddingBottom: 4,
                                            borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.04)'}`,
                                        }}>
                                            Saved Fields ({filledCount}/{totalCount})
                                        </div>
                                        <div style={{ maxHeight: 280, overflowY: 'auto', fontSize: 10, lineHeight: 1.6 }}>
                                            {Object.entries(fields)
                                                .filter(([, val]) => val && typeof val === 'string' && (val as string).trim())
                                                .slice(0, 30)
                                                .map(([key, val]) => (
                                                    <div key={key} style={{ marginBottom: 3 }}>
                                                        <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: accent, fontWeight: 600 }}>{key}</span>
                                                        <span style={{ color: textMuted, margin: '0 4px' }}>→</span>
                                                        <span style={{ color: text }}>{String(val).slice(0, 120)}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ─── Traces Tab ─────────────────────────────────────────────────────────────
const TracesTab: React.FC<{
    traces: CclAiTraceRecord[];
    expandedId: number | null;
    onToggle: (id: number) => void;
    isDark: boolean;
    cardBg: string;
    text: string;
    textMuted: string;
    border: string;
    accent: string;
}> = ({ traces, expandedId, onToggle, isDark, text, textMuted, border, accent }) => {
    if (traces.length === 0) {
        return <EmptyState icon="Processing" message="No AI traces recorded yet" textMuted={textMuted} />;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {traces.map(t => {
                const isExpanded = expandedId === t.CclAiTraceId;
                const sColour = statusColour(t.AiStatus);

                return (
                    <div
                        key={t.CclAiTraceId}
                        style={{
                            background: isDark ? '#0f172a' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                            border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.06)'}`,
                            borderLeft: `3px solid ${sColour}`,
                            borderRadius: 2,
                            overflow: 'hidden',
                            transition: TRANSITION,
                            boxShadow: isExpanded
                                ? (isDark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.08)')
                                : 'none',
                        }}
                    >
                        <button
                            onClick={() => onToggle(t.CclAiTraceId)}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10,
                                textAlign: 'left',
                            }}
                        >
                            {/* AI icon */}
                            <div style={{
                                width: 24, height: 24, borderRadius: 2, flexShrink: 0,
                                background: `${sColour}15`,
                                border: `1px solid ${sColour}30`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Icon iconName="Processing" style={{ fontSize: 11, color: sColour }} />
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                {/* Row 1: tracking ID + status */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                    <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: text }}>
                                        {t.TrackingId}
                                    </span>
                                    <span style={{ fontSize: 9, color: textMuted, fontFamily: FONT_MONO }}>
                                        {relativeDate(t.CreatedAt)}
                                    </span>
                                    <div style={{ flex: 1 }} />
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '2px 8px', borderRadius: 2,
                                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3,
                                        background: `${sColour}15`, color: sColour,
                                        border: `1px solid ${sColour}30`,
                                    }}>
                                        {t.AiStatus}
                                    </span>
                                </div>

                                {/* Row 2: data chips */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: textMuted, flexWrap: 'wrap' }}>
                                    {t.Model && (
                                        <span style={{
                                            fontFamily: FONT_MONO, fontSize: 9, padding: '1px 6px', borderRadius: 2,
                                            background: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(0,0,0,0.03)',
                                            border: `1px solid ${isDark ? 'rgba(148,163,184,0.12)' : 'rgba(0,0,0,0.05)'}`,
                                        }}>{t.Model}</span>
                                    )}
                                    {t.DurationMs != null && (
                                        <span style={{ fontFamily: FONT_MONO, fontSize: 9 }}>
                                            {(t.DurationMs / 1000).toFixed(1)}s
                                        </span>
                                    )}
                                    <span style={{ fontFamily: FONT_MONO, fontSize: 9 }}>
                                        {t.GeneratedFieldCount ?? 0} fields
                                    </span>
                                    {t.CreatedBy && (
                                        <span style={{ fontSize: 9 }}>by {t.CreatedBy}</span>
                                    )}
                                </div>
                            </div>

                            <Icon
                                iconName={isExpanded ? 'ChevronUp' : 'ChevronDown'}
                                style={{ fontSize: 9, color: textMuted, flexShrink: 0, marginTop: 4 }}
                            />
                        </button>

                        {isExpanded && (
                            <div style={{
                                padding: '0 14px 14px',
                                borderTop: `1px solid ${isDark ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.04)'}`,
                            }}>
                                {/* Meta row */}
                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, marginBottom: 8,
                                    fontSize: 9, color: textMuted, fontFamily: FONT_MONO,
                                }}>
                                    <span>ID: {t.CclAiTraceId}</span>
                                    <span>{formatDate(t.CreatedAt)}</span>
                                    {t.Temperature != null && <span>temp: {t.Temperature}</span>}
                                </div>

                                {t.DataSourcesJson && (
                                    <TraceSection title="Data Sources" textMuted={textMuted} text={text} border={border}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            {(safeJsonParse(t.DataSourcesJson) as string[] || []).map((s, i) => (
                                                <span key={i} style={{
                                                    background: `${accent}10`,
                                                    color: accent,
                                                    padding: '2px 8px', borderRadius: 2,
                                                    fontSize: 10, fontWeight: 500,
                                                    border: `1px solid ${accent}25`,
                                                }}>{s}</span>
                                            ))}
                                        </div>
                                    </TraceSection>
                                )}

                                {t.ContextFieldsJson && (
                                    <TraceSection title="Context Fields" textMuted={textMuted} text={text} border={border}>
                                        <FieldGrid data={safeJsonParse(t.ContextFieldsJson) as Record<string, string>} text={text} textMuted={textMuted} accent={accent} />
                                    </TraceSection>
                                )}

                                {t.UserPrompt && (
                                    <TraceSection title={`User Prompt (${t.UserPromptLength ?? t.UserPrompt.length} chars)`} textMuted={textMuted} text={text} border={border}>
                                        <pre style={{
                                            fontSize: 10, lineHeight: 1.5, color: text,
                                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                            maxHeight: 200, overflowY: 'auto', margin: 0,
                                            fontFamily: FONT_MONO,
                                            background: isDark ? '#0a0f1e' : '#f8fafc',
                                            padding: 8, borderRadius: 2,
                                            border: `1px solid ${isDark ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.05)'}`,
                                        }}>{t.UserPrompt}</pre>
                                    </TraceSection>
                                )}

                                {t.AiOutputJson && (
                                    <TraceSection title={`AI Output (${t.GeneratedFieldCount ?? '?'} fields)`} textMuted={textMuted} text={text} border={border}>
                                        <FieldGrid data={safeJsonParse(t.AiOutputJson) as Record<string, string>} text={text} textMuted={textMuted} accent={accent} />
                                    </TraceSection>
                                )}

                                {t.FallbackReason && (
                                    <div style={{
                                        marginTop: 8, padding: '6px 10px',
                                        background: '#ef444410', borderRadius: 2,
                                        borderLeft: '3px solid #ef4444',
                                        fontSize: 10, color: '#ef4444', lineHeight: 1.4,
                                    }}>
                                        <strong>Fallback:</strong> {t.FallbackReason}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ─── Assessments Tab ────────────────────────────────────────────────────────
const AssessmentsTab: React.FC<{
    assessments: CclAssessmentRecord[];
    isDark: boolean;
    cardBg: string;
    text: string;
    textMuted: string;
    border: string;
    accent: string;
}> = ({ assessments, isDark, text, textMuted, border, accent }) => {
    if (assessments.length === 0) {
        return (
            <EmptyState
                icon="AnalyticsReport"
                message="No assessments yet"
                subMessage="Expand a version in Content History and click 'Assess this version' to start."
                textMuted={textMuted}
            />
        );
    }

    const avgScore = assessments.reduce((s, a) => s + a.OverallScore, 0) / assessments.length;
    const withSuggestions = assessments.filter(a => a.PromptSuggestion).length;
    const applied = assessments.filter(a => a.AppliedToPrompt).length;
    const avgColour = SCORE_LABELS[Math.round(avgScore)]?.colour || '#6b7280';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Aggregate summary */}
            {assessments.length > 1 && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 14px',
                    background: isDark ? '#0f172a' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                    border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.06)'}`,
                    borderLeft: `3px solid ${avgColour}`,
                    borderRadius: 2,
                    marginBottom: 4,
                }}>
                    {/* Avg score circle */}
                    <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: `${avgColour}15`,
                        border: `2px solid ${avgColour}40`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700, color: avgColour,
                        fontFamily: FONT_MONO,
                    }}>{avgScore.toFixed(1)}</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: text }}>
                            Average across {assessments.length} assessments
                        </div>
                        <div style={{ display: 'flex', gap: 10, fontSize: 10, color: textMuted, marginTop: 2 }}>
                            <span>{withSuggestions} with suggestions</span>
                            <span style={{ color: applied > 0 ? '#10b981' : textMuted }}>{applied} applied</span>
                        </div>
                    </div>
                </div>
            )}

            {assessments.map(a => {
                const scoreInfo = SCORE_LABELS[a.OverallScore] || { label: '?', colour: '#6b7280' };
                const issues = a.IssueCategories ? safeJsonParse(a.IssueCategories) as string[] : [];

                // Calculate accuracy bar widths
                const totalFields = (a.FieldsCorrect || 0) + (a.FieldsEdited || 0) + (a.FieldsReplaced || 0) + (a.FieldsEmpty || 0);
                const hasAccuracy = totalFields > 0;

                return (
                    <div
                        key={a.CclAssessmentId}
                        style={{
                            background: isDark ? '#0f172a' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                            border: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.06)'}`,
                            borderLeft: `3px solid ${scoreInfo.colour}`,
                            borderRadius: 2,
                            padding: '12px 14px',
                            transition: TRANSITION,
                        }}
                    >
                        {/* Header row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            {/* Score badge */}
                            <div style={{
                                width: 28, height: 28, borderRadius: 2,
                                background: `${scoreInfo.colour}15`,
                                border: `1px solid ${scoreInfo.colour}30`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 13, fontWeight: 700, color: scoreInfo.colour,
                                fontFamily: FONT_MONO,
                            }}>{a.OverallScore}</div>

                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: scoreInfo.colour }}>
                                        {scoreInfo.label}
                                    </span>
                                    {a.CclContentId && (
                                        <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: textMuted }}>
                                            Content #{a.CclContentId}
                                        </span>
                                    )}
                                    <div style={{ flex: 1 }} />
                                    {a.AppliedToPrompt && (
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 3,
                                            padding: '2px 8px', borderRadius: 2,
                                            fontSize: 9, fontWeight: 600,
                                            background: '#10b98112', color: '#10b981',
                                            border: '1px solid #10b98125',
                                        }}>
                                            <Icon iconName="SkypeCircleCheck" styles={{ root: { fontSize: 8 } }} />
                                            Applied
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: textMuted }}>
                                    <Avatar initials={a.AssessedBy || '??'} size={16} isDark={isDark} />
                                    <span>{a.AssessedBy}</span>
                                    <span style={{ fontFamily: FONT_MONO, fontSize: 9 }}>{relativeDate(a.CreatedAt)}</span>
                                    {a.PracticeArea && <span>· {a.PracticeArea}</span>}
                                </div>
                            </div>
                        </div>

                        {/* Field accuracy visual bar */}
                        {hasAccuracy && (
                            <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                    Field Accuracy
                                </div>
                                {/* Proportional bar */}
                                <div style={{ display: 'flex', height: 6, borderRadius: 1, overflow: 'hidden', marginBottom: 4 }}>
                                    {a.FieldsCorrect != null && a.FieldsCorrect > 0 && (
                                        <div style={{ flex: a.FieldsCorrect, background: '#10b981', transition: TRANSITION }} title={`${a.FieldsCorrect} correct`} />
                                    )}
                                    {a.FieldsEdited != null && a.FieldsEdited > 0 && (
                                        <div style={{ flex: a.FieldsEdited, background: '#f59e0b', transition: TRANSITION }} title={`${a.FieldsEdited} edited`} />
                                    )}
                                    {a.FieldsReplaced != null && a.FieldsReplaced > 0 && (
                                        <div style={{ flex: a.FieldsReplaced, background: '#ef4444', transition: TRANSITION }} title={`${a.FieldsReplaced} replaced`} />
                                    )}
                                    {a.FieldsEmpty != null && a.FieldsEmpty > 0 && (
                                        <div style={{ flex: a.FieldsEmpty, background: isDark ? 'rgba(148,163,184,0.2)' : 'rgba(0,0,0,0.08)', transition: TRANSITION }} title={`${a.FieldsEmpty} empty`} />
                                    )}
                                </div>
                                {/* Labels */}
                                <div style={{ display: 'flex', gap: 10, fontSize: 9, fontFamily: FONT_MONO }}>
                                    {a.FieldsCorrect != null && <span style={{ color: '#10b981' }}>{a.FieldsCorrect} correct</span>}
                                    {a.FieldsEdited != null && <span style={{ color: '#f59e0b' }}>{a.FieldsEdited} edited</span>}
                                    {a.FieldsReplaced != null && <span style={{ color: '#ef4444' }}>{a.FieldsReplaced} replaced</span>}
                                    {a.FieldsEmpty != null && <span style={{ color: textMuted }}>{a.FieldsEmpty} empty</span>}
                                </div>
                            </div>
                        )}

                        {/* Issue tags */}
                        {Array.isArray(issues) && issues.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                                {issues.map(cat => {
                                    const catInfo = ISSUE_CATEGORIES.find(c => c.key === cat);
                                    return (
                                        <span key={cat} style={{
                                            padding: '2px 8px', borderRadius: 2,
                                            fontSize: 9, fontWeight: 600,
                                            background: '#ef444410', color: '#ef4444',
                                            border: '1px solid #ef444420',
                                        }}>{catInfo?.label || cat}</span>
                                    );
                                })}
                            </div>
                        )}

                        {/* Notes */}
                        {a.Notes && (
                            <div style={{
                                fontSize: 11, color: text, lineHeight: 1.5, marginBottom: 6,
                                padding: '6px 10px',
                                background: isDark ? 'rgba(148,163,184,0.04)' : 'rgba(0,0,0,0.02)',
                                borderLeft: `2px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.08)'}`,
                                borderRadius: '0 2px 2px 0',
                            }}>
                                {a.Notes}
                            </div>
                        )}

                        {/* Prompt suggestion */}
                        {a.PromptSuggestion && (
                            <div style={{
                                padding: '6px 10px',
                                background: `${accent}08`,
                                border: `1px solid ${accent}20`,
                                borderLeft: `3px solid ${accent}`,
                                borderRadius: '0 2px 2px 0',
                                fontSize: 11, color: text, lineHeight: 1.4,
                            }}>
                                <div style={{
                                    fontSize: 9, fontWeight: 700, color: accent,
                                    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3,
                                }}>
                                    Prompt Suggestion
                                </div>
                                {a.PromptSuggestion}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ─── Assessment Form (modal overlay) ────────────────────────────────────────
const AssessmentForm: React.FC<{
    version: CclContentRecord;
    aiTraces: CclAiTraceRecord[];
    userInitials: string;
    isDark: boolean;
    onSubmit: (payload: CclAssessmentPayload) => Promise<{ ok: boolean; error?: string }>;
    onClose: () => void;
}> = ({ version, aiTraces, userInitials, isDark, onSubmit, onClose }) => {
    const bg = isDark ? '#0f172a' : '#FFFFFF';
    const text = isDark ? '#e5e7eb' : '#1f2937';
    const textMuted = isDark ? '#94a3b8' : '#6b7280';
    const border = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.08)';
    const accent = colours.highlight;
    const inputBg = isDark ? 'rgba(148,163,184,0.06)' : '#f8fafc';
    const sectionBg = isDark ? 'rgba(15,23,42,0.65)' : '#f8fafc';

    const [overallScore, setOverallScore] = useState(3);
    const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
    const [notes, setNotes] = useState('');
    const [promptSuggestion, setPromptSuggestion] = useState('');
    const [fieldsCorrect, setFieldsCorrect] = useState<number | undefined>();
    const [fieldsEdited, setFieldsEdited] = useState<number | undefined>();
    const [fieldsReplaced, setFieldsReplaced] = useState<number | undefined>();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Find the most recent AI trace for this version
    const relatedTrace = useMemo(() => {
        if (!version.CreatedAt || !aiTraces.length) return null;
        const vTime = new Date(version.CreatedAt).getTime();
        return aiTraces
            .filter(t => new Date(t.CreatedAt).getTime() <= vTime)
            .sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime())[0] || null;
    }, [version, aiTraces]);

    // Parse fields to count total
    const fields = useMemo(() => {
        try { return JSON.parse(version.FieldsJson || '{}'); } catch { return {}; }
    }, [version.FieldsJson]);
    const totalFields = Object.keys(fields).length;
    const filledFields = Object.values(fields).filter((v): v is string => typeof v === 'string' && v.trim().length > 0).length;

    const toggleIssue = (key: string) => {
        setSelectedIssues(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);

        const fieldsEmpty = totalFields - filledFields;

        const payload: CclAssessmentPayload = {
            matterId: version.MatterId,
            cclContentId: version.CclContentId,
            cclAiTraceId: relatedTrace?.CclAiTraceId,
            instructionRef: version.InstructionRef || undefined,
            practiceArea: version.PracticeArea || undefined,
            feeEarner: version.FeeEarner || undefined,
            overallScore,
            issueCategories: selectedIssues.length > 0 ? selectedIssues : undefined,
            fieldsCorrect,
            fieldsEdited,
            fieldsReplaced,
            fieldsEmpty,
            notes: notes.trim() || undefined,
            promptSuggestion: promptSuggestion.trim() || undefined,
            assessedBy: userInitials,
        };

        const result = await onSubmit(payload);
        if (!result.ok) {
            setError(result.error || 'Failed to save assessment');
        }
        setSubmitting(false);
    };

    const sectionLabel = (label: string) => ({
        fontSize: 9 as const, fontWeight: 700 as const, color: textMuted,
        textTransform: 'uppercase' as const, letterSpacing: 0.5,
        display: 'block' as const, marginBottom: 6,
    });

    return (
        <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(6,23,51,0.68)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <div style={{
                width: 500,
                maxHeight: '90vh',
                background: bg,
                borderRadius: 2,
                border: `1px solid ${isDark ? 'rgba(54,144,206,0.35)' : 'rgba(6,23,51,0.18)'}`,
                boxShadow: isDark ? '0 24px 80px rgba(0,0,0,0.55)' : '0 24px 80px rgba(6,23,51,0.24)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}>
                {/* Header — dark navy */}
                <div style={{
                    padding: '12px 16px',
                    background: '#061733',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                }}>
                    <div style={{
                        width: 24, height: 24, borderRadius: 2,
                        background: `${accent}20`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Icon iconName="AnalyticsReport" style={{ fontSize: 12, color: accent }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', fontFamily: 'Raleway, sans-serif' }}>
                            Assess Output
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: FONT_MONO }}>
                            v{version.Version} · {version.ClientName || version.MatterId} · {version.PracticeArea || '—'}
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'rgba(255,255,255,0.4)',
                        transition: TRANSITION,
                    }}>
                        <Icon iconName="ChromeClose" style={{ fontSize: 10 }} />
                    </button>
                </div>

                <div style={{
                    padding: '7px 16px',
                    borderBottom: `1px solid ${border}`,
                    background: isDark ? 'rgba(54,144,206,0.06)' : 'rgba(54,144,206,0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: textMuted }}>content #{version.CclContentId}</span>
                    {relatedTrace?.TrackingId && (
                        <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: textMuted }}>trace {relatedTrace.TrackingId}</span>
                    )}
                    <span style={{
                        fontFamily: FONT_MONO,
                        fontSize: 9,
                        color: statusColour(version.Status),
                        fontWeight: 700,
                    }}>
                        {version.Status?.toUpperCase() || 'DRAFT'}
                    </span>
                </div>

                {/* Form body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
                    {/* Overall score */}
                    <div style={{
                        marginBottom: 10,
                        padding: '10px 12px',
                        background: sectionBg,
                        border: `1px solid ${border}`,
                        borderLeft: '3px solid #061733',
                        borderRadius: '0 2px 2px 0',
                    }}>
                        <label style={sectionLabel('Overall quality')}>Overall quality</label>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {[1, 2, 3, 4, 5].map(n => {
                                const info = SCORE_LABELS[n];
                                const isActive = n === overallScore;
                                return (
                                    <button
                                        key={n}
                                        onClick={() => setOverallScore(n)}
                                        title={info.label}
                                        style={{
                                            flex: 1,
                                            padding: '6px 0',
                                            borderRadius: 2,
                                            border: `1px solid ${isActive ? info.colour : border}`,
                                            background: isActive ? `${info.colour}15` : 'transparent',
                                            color: isActive ? info.colour : textMuted,
                                            fontSize: 13, fontWeight: 700,
                                            fontFamily: FONT_MONO,
                                            cursor: 'pointer',
                                            transition: TRANSITION,
                                        }}
                                    >
                                        {n}
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{
                            fontSize: 10, fontWeight: 600, marginTop: 4,
                            color: SCORE_LABELS[overallScore]?.colour,
                        }}>
                            {SCORE_LABELS[overallScore]?.label}
                        </div>
                    </div>

                    {/* Field accuracy counts */}
                    <div style={{
                        marginBottom: 10,
                        padding: '10px 12px',
                        background: sectionBg,
                        border: `1px solid ${border}`,
                        borderLeft: '3px solid #3690CE',
                        borderRadius: '0 2px 2px 0',
                    }}>
                        <label style={sectionLabel('Field accuracy')}>
                            Field accuracy
                            <span style={{
                                fontWeight: 400, fontFamily: FONT_MONO, fontSize: 9,
                                marginLeft: 6, textTransform: 'none', letterSpacing: 0,
                            }}>
                                {filledFields}/{totalFields} populated
                            </span>
                        </label>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {[
                                { label: 'Correct', value: fieldsCorrect, setter: setFieldsCorrect, colour: '#10b981' },
                                { label: 'Edited', value: fieldsEdited, setter: setFieldsEdited, colour: '#f59e0b' },
                                { label: 'Replaced', value: fieldsReplaced, setter: setFieldsReplaced, colour: '#ef4444' },
                            ].map(f => (
                                <div key={f.label} style={{ flex: 1 }}>
                                    <div style={{
                                        fontSize: 9, fontWeight: 600, letterSpacing: 0.3,
                                        color: f.colour, marginBottom: 3,
                                    }}>{f.label}</div>
                                    <input
                                        type="number"
                                        min={0}
                                        max={totalFields}
                                        value={f.value ?? ''}
                                        onChange={e => f.setter(e.target.value ? Number(e.target.value) : undefined)}
                                        placeholder="—"
                                        style={{
                                            width: '100%',
                                            padding: '5px 6px',
                                            border: `1px solid ${border}`,
                                            borderRadius: 2,
                                            background: inputBg,
                                            color: text,
                                            fontSize: 12,
                                            fontFamily: FONT_MONO,
                                            textAlign: 'center',
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Issue categories */}
                    <div style={{
                        marginBottom: 10,
                        padding: '10px 12px',
                        background: sectionBg,
                        border: `1px solid ${border}`,
                        borderLeft: '3px solid #ef4444',
                        borderRadius: '0 2px 2px 0',
                    }}>
                        <label style={sectionLabel('Issues found')}>Issues found</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {ISSUE_CATEGORIES.map(cat => {
                                const isActive = selectedIssues.includes(cat.key);
                                return (
                                    <button
                                        key={cat.key}
                                        onClick={() => toggleIssue(cat.key)}
                                        style={{
                                            padding: '3px 8px',
                                            borderRadius: 2,
                                            border: `1px solid ${isActive ? '#ef4444' : border}`,
                                            background: isActive ? '#ef444412' : 'transparent',
                                            color: isActive ? '#ef4444' : textMuted,
                                            fontSize: 10, fontWeight: isActive ? 600 : 400,
                                            cursor: 'pointer',
                                            transition: TRANSITION,
                                        }}
                                    >
                                        {cat.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Notes */}
                    <div style={{
                        marginBottom: 10,
                        padding: '10px 12px',
                        background: sectionBg,
                        border: `1px solid ${border}`,
                        borderLeft: `3px solid ${isDark ? 'rgba(148,163,184,0.55)' : 'rgba(0,0,0,0.2)'}`,
                        borderRadius: '0 2px 2px 0',
                    }}>
                        <label style={sectionLabel('Notes')}>Notes</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="What did you observe? What was wrong, what was right?"
                            rows={3}
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                border: `1px solid ${border}`,
                                borderRadius: 2,
                                background: inputBg,
                                color: text,
                                fontSize: 11,
                                resize: 'vertical',
                                fontFamily: 'inherit',
                                lineHeight: 1.5,
                            }}
                        />
                    </div>

                    {/* Prompt suggestion */}
                    <div style={{
                        marginBottom: 10,
                        padding: '10px 12px',
                        background: sectionBg,
                        border: `1px solid ${accent}25`,
                        borderLeft: `3px solid ${accent}`,
                        borderRadius: '0 2px 2px 0',
                    }}>
                        <label style={sectionLabel('Prompt suggestion')}>
                            Prompt suggestion
                            <span style={{
                                fontWeight: 400, fontSize: 9, color: accent,
                                marginLeft: 6, textTransform: 'none', letterSpacing: 0,
                            }}>
                                feeds back into AI tuning
                            </span>
                        </label>
                        <textarea
                            value={promptSuggestion}
                            onChange={e => setPromptSuggestion(e.target.value)}
                            placeholder='e.g. "Include VAT breakdown in cost estimates for property matters"'
                            rows={2}
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                border: `1px solid ${accent}25`,
                                borderRadius: 2,
                                background: `${accent}08`,
                                color: text,
                                fontSize: 11,
                                resize: 'vertical',
                                fontFamily: 'inherit',
                                lineHeight: 1.5,
                            }}
                        />
                    </div>

                    {/* Related AI trace info */}
                    {relatedTrace && (
                        <div style={{
                            padding: '6px 10px',
                            background: isDark ? 'rgba(148,163,184,0.06)' : 'rgba(0,0,0,0.02)',
                            borderLeft: `3px solid ${statusColour(relatedTrace.AiStatus || '')}`,
                            borderRadius: '0 2px 2px 0',
                            fontSize: 10, color: textMuted, fontFamily: FONT_MONO,
                        }}>
                            <Icon iconName="Processing" style={{ fontSize: 9, marginRight: 4 }} />
                            Trace {relatedTrace.TrackingId} · {relatedTrace.Model} · {relatedTrace.AiStatus}
                            {relatedTrace.DurationMs ? ` · ${(relatedTrace.DurationMs / 1000).toFixed(1)}s` : ''}
                        </div>
                    )}

                    {error && (
                        <div style={{
                            color: '#ef4444', fontSize: 11, marginTop: 8,
                            padding: '6px 10px', borderLeft: '3px solid #ef4444',
                            background: '#ef444408', borderRadius: '0 2px 2px 0',
                        }}>{error}</div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '10px 16px',
                    borderTop: `1px solid ${border}`,
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 6,
                    background: isDark ? 'rgba(6,23,51,0.3)' : 'rgba(6,23,51,0.03)',
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '7px 14px',
                            border: `1px solid ${border}`,
                            borderRadius: 2,
                            background: 'transparent',
                            color: textMuted,
                            fontSize: 11,
                            cursor: 'pointer',
                            transition: TRANSITION,
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        style={{
                            padding: '7px 18px',
                            border: 'none',
                            borderRadius: 2,
                            background: '#061733',
                            color: '#FFFFFF',
                            fontSize: 11, fontWeight: 600,
                            fontFamily: 'Raleway, sans-serif',
                            cursor: submitting ? 'wait' : 'pointer',
                            opacity: submitting ? 0.7 : 1,
                            transition: TRANSITION,
                        }}
                    >
                        {submitting ? 'Saving...' : 'Submit Assessment'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Shared sub-components ──────────────────────────────────────────────────
const EmptyState: React.FC<{ icon: string; message: string; subMessage?: string; textMuted: string }> = ({ icon, message, subMessage, textMuted }) => (
    <div style={{ textAlign: 'center', padding: '32px 20px', color: textMuted }}>
        <div style={{
            width: 36, height: 36, borderRadius: 2, margin: '0 auto 10px',
            background: `${textMuted}10`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <Icon iconName={icon} style={{ fontSize: 18, opacity: 0.4 }} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{message}</div>
        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, lineHeight: 1.4 }}>
            {subMessage || 'Data will appear after the first save or AI fill.'}
        </div>
    </div>
);

const TraceSection: React.FC<{
    title: string;
    textMuted: string;
    text: string;
    border: string;
    children: React.ReactNode;
}> = ({ title, textMuted, border, children }) => (
    <div style={{ marginTop: 8 }}>
        <div style={{
            fontSize: 9, fontWeight: 700, color: textMuted,
            textTransform: 'uppercase', letterSpacing: 0.5,
            marginBottom: 6, paddingBottom: 3,
            borderBottom: `1px solid ${border}`,
        }}>
            {title}
        </div>
        {children}
    </div>
);

const ContextSection: React.FC<{
    label: string;
    isDark: boolean;
    children: React.ReactNode;
}> = ({ label, isDark, children }) => (
    <div style={{ marginTop: 8 }}>
        <div style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
            color: isDark ? '#94a3b8' : '#6b7280',
            marginBottom: 6, paddingBottom: 3,
            borderBottom: `1px solid ${isDark ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.06)'}`,
        }}>
            {label}
        </div>
        {children}
    </div>
);

const FieldGrid: React.FC<{
    data: Record<string, string> | null;
    text: string;
    textMuted: string;
    accent?: string;
}> = ({ data, text, textMuted, accent }) => {
    if (!data || typeof data !== 'object') return null;
    const entries = Object.entries(data).filter(([, v]) => v && String(v).trim());
    if (entries.length === 0) return <div style={{ fontSize: 10, color: textMuted, fontFamily: FONT_MONO }}>No data</div>;

    const keyColour = accent || textMuted;

    return (
        <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 10, lineHeight: 1.6 }}>
            {entries.map(([key, val]) => (
                <div key={key} style={{ display: 'flex', gap: 6, marginBottom: 1 }}>
                    <span style={{ color: keyColour, fontWeight: 600, fontFamily: FONT_MONO, fontSize: 9, minWidth: 80, flexShrink: 0 }}>
                        {key}
                    </span>
                    <span style={{ color: textMuted, fontSize: 8, flexShrink: 0 }}>→</span>
                    <span style={{ color: text, fontFamily: FONT_MONO, fontSize: 9 }}>
                        {String(val).slice(0, 120)}
                    </span>
                </div>
            ))}
        </div>
    );
};

export default CclOpsPanel;
