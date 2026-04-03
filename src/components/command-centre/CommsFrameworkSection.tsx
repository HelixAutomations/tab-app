import React, { useState, useRef, useCallback } from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens } from './types';

const FW_ICON = (d: string) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ marginRight: 4, verticalAlign: -1 }}>
        <path d={d} />
    </svg>
);

const FRAMEWORKS = [
    { key: 'communication', label: 'Communication', icon: FW_ICON('M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6') },
    { key: 'management',    label: 'Management',    icon: FW_ICON('M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4M12 2a1 1 0 0 1 1 1v1H11V3a1 1 0 0 1 1-1z') },
    { key: 'tasking',       label: 'Tasking',       icon: FW_ICON('M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11') },
    { key: 'feedback',      label: 'Feedback',      icon: FW_ICON('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z') },
    { key: 'projects',      label: 'Projects',      icon: FW_ICON('M3 3v18h18M18 17V9M13 17V5M8 17v-3') },
] as const;

type FrameworkKey = typeof FRAMEWORKS[number]['key'];

interface Dimension { name: string; score: number; notes: string }
interface PressureTestResult {
    overallScore: number;
    dimensions: Dimension[];
    redFlags: string[];
    suggestions: string[];
    revisedDraft: string;
}

interface CommsFrameworkSectionProps {
    tokens: CommandCentreTokens;
}

const CommsFrameworkSection: React.FC<CommsFrameworkSectionProps> = ({ tokens }) => {
    const { isDarkMode, textPrimary, textBody, textMuted, borderLight, accentPrimary, ctaPrimary, sectionTitle, showToast } = tokens;

    const [selectedFramework, setSelectedFramework] = useState<FrameworkKey>('communication');
    const [draft, setDraft] = useState('');
    const [context, setContext] = useState('');
    const [showContext, setShowContext] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<PressureTestResult | null>(null);
    const [error, setError] = useState('');
    const abortRef = useRef<AbortController | null>(null);

    const runPressureTest = useCallback(async () => {
        if (draft.trim().length < 10) {
            setError('Draft must be at least 10 characters.');
            return;
        }
        setLoading(true);
        setError('');
        setResult(null);

        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        try {
            const res = await fetch('/api/ai/pressure-test-comms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    framework: selectedFramework,
                    draft: draft.trim(),
                    ...(context.trim() ? { context: context.trim() } : {}),
                }),
                signal: ac.signal,
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Pressure test failed');
            setResult(data.result);
            showToast(`Score: ${data.result.overallScore}/10 (${Math.round(data.durationMs / 1000)}s)`, data.result.overallScore >= 7 ? 'success' : 'warning');
        } catch (err: unknown) {
            if ((err as Error).name === 'AbortError') return;
            const msg = (err as Error).message || 'Pressure test failed';
            setError(msg);
            showToast(msg, 'warning');
        } finally {
            setLoading(false);
        }
    }, [draft, context, selectedFramework, showToast]);

    const scoreColour = (score: number) => {
        if (score >= 8) return colours.green;
        if (score >= 5) return colours.orange;
        return colours.cta;
    };

    const chipBase: React.CSSProperties = {
        padding: '5px 12px',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        borderRadius: 0,
        border: `1px solid ${borderLight}`,
        transition: 'all 0.15s ease',
        fontFamily: 'Raleway, sans-serif',
    };

    const inputBg = isDarkMode ? colours.darkBlue : '#fff';

    const textareaStyle: React.CSSProperties = {
        width: '100%',
        minHeight: 120,
        padding: '12px 14px',
        fontSize: 13,
        fontFamily: 'Raleway, sans-serif',
        color: textPrimary,
        background: inputBg,
        border: `1px solid ${borderLight}`,
        borderRadius: 0,
        resize: 'vertical',
        outline: 'none',
        lineHeight: 1.6,
    };

    return (
        <div style={{ marginBottom: 16 }}>
            <div style={sectionTitle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
                Frameworks
                <span style={{ fontSize: 8, fontWeight: 700, background: isDarkMode ? colours.accent : colours.highlight, color: isDarkMode ? colours.dark.background : '#fff', padding: '1px 5px', letterSpacing: 0.6, fontFamily: 'Raleway, sans-serif' }}>DEV</span>
            </div>

            {/* Connected framework tool — tabs + draft + context + action in one box */}
            <div style={{
                border: `1px solid ${borderLight}`,
                borderRadius: 0,
                overflow: 'hidden',
            }}>
                {/* Framework selector strip */}
                <div style={{
                    display: 'flex', flexWrap: 'nowrap', gap: 0,
                    borderBottom: `1px solid ${borderLight}`,
                    background: isDarkMode ? colours.dark.sectionBackground : 'rgba(0,0,0,0.02)',
                }}>
                    {FRAMEWORKS.map((fw, idx) => {
                        const active = fw.key === selectedFramework;
                        const isLast = idx === FRAMEWORKS.length - 1;
                        return (
                            <button
                                key={fw.key}
                                onClick={() => setSelectedFramework(fw.key)}
                                onMouseEnter={e => {
                                    if (!active) e.currentTarget.style.background = isDarkMode ? colours.dark.cardBackground : 'rgba(0,0,0,0.04)';
                                }}
                                onMouseLeave={e => {
                                    if (!active) e.currentTarget.style.background = 'transparent';
                                }}
                                style={{
                                    ...chipBase,
                                    flex: '1 1 0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: 'none',
                                    borderRight: isLast ? 'none' : `1px solid ${borderLight}`,
                                    background: active
                                        ? (isDarkMode ? accentPrimary : colours.highlight)
                                        : 'transparent',
                                    color: active
                                        ? (isDarkMode ? colours.dark.background : '#fff')
                                        : textMuted,
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                {fw.icon}
                                {fw.label}
                            </button>
                        );
                    })}
                </div>

                {/* Draft textarea */}
                <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder="Paste your draft here…"
                    style={{
                        ...textareaStyle,
                        border: 'none',
                        borderRadius: 0,
                    }}
                />

                {/* Context toggle — inside the box */}
                <div style={{
                    borderTop: `1px solid ${borderLight}`,
                    padding: '8px 14px',
                }}>
                    <button
                        onClick={() => setShowContext(v => !v)}
                        style={{ background: 'none', border: 'none', color: textMuted, fontSize: 10, cursor: 'pointer', padding: 0, fontFamily: 'Raleway, sans-serif', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {showContext ? <path d="M6 9l6 6 6-6"/> : <path d="M9 18l6-6-6-6"/>}
                        </svg>
                        {showContext ? 'Hide context' : 'Add context (optional)'}
                    </button>
                    {showContext && (
                        <textarea
                            value={context}
                            onChange={e => setContext(e.target.value)}
                            placeholder="Background info the AI should know (recipient, matter details, etc.)"
                            style={{ ...textareaStyle, minHeight: 60, marginTop: 6, fontSize: 12 }}
                        />
                    )}
                </div>

                {/* Action footer — inside the box */}
                <div style={{
                    borderTop: `1px solid ${borderLight}`,
                    padding: '8px 14px',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <button
                        onClick={runPressureTest}
                        disabled={loading || draft.trim().length < 10}
                        onMouseEnter={e => {
                            if (!loading) e.currentTarget.style.opacity = '0.85';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.opacity = (loading || draft.trim().length < 10) ? '0.5' : '1';
                        }}
                        style={{
                            padding: '7px 18px',
                            fontSize: 12,
                            fontWeight: 700,
                            fontFamily: 'Raleway, sans-serif',
                            cursor: loading ? 'wait' : 'pointer',
                            border: 'none',
                            borderRadius: 0,
                            background: colours.highlight,
                            color: '#fff',
                            opacity: loading || draft.trim().length < 10 ? 0.5 : 1,
                            transition: 'opacity 0.15s ease',
                        }}
                    >
                        {loading ? 'Testing…' : 'Run'}
                    </button>
                    {error && <span style={{ fontSize: 12, color: colours.cta }}>{error}</span>}
                </div>
            </div>

            {/* Results */}
            {result && (
                <div style={{ marginTop: 12 }}>
                    {/* Overall score */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        background: isDarkMode ? colours.dark.cardBackground : colours.grey,
                        borderLeft: `3px solid ${scoreColour(result.overallScore)}`,
                    }}>
                        <span style={{ fontSize: 28, fontWeight: 800, color: scoreColour(result.overallScore), fontFamily: 'Raleway, sans-serif' }}>
                            {result.overallScore}
                        </span>
                        <span style={{ fontSize: 13, color: textBody, fontFamily: 'Raleway, sans-serif' }}>
                            / 10 overall
                        </span>
                    </div>

                    {/* Dimension scores */}
                    {Array.isArray(result.dimensions) && result.dimensions.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                            {result.dimensions.map((d, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '6px 14px',
                                    borderBottom: `1px solid ${borderLight}`,
                                    fontSize: 12,
                                    fontFamily: 'Raleway, sans-serif',
                                }}>
                                    <span style={{ width: 24, fontWeight: 700, color: scoreColour(d.score) }}>{d.score}</span>
                                    <span style={{ fontWeight: 600, color: textPrimary, minWidth: 80 }}>{d.name}</span>
                                    <span style={{ color: textMuted, flex: 1 }}>{d.notes}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Red flags */}
                    {Array.isArray(result.redFlags) && result.redFlags.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: colours.cta, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: 'Raleway, sans-serif' }}>
                                Red Flags
                            </div>
                            {result.redFlags.map((flag, i) => (
                                <div key={i} style={{
                                    padding: '6px 12px',
                                    fontSize: 12,
                                    color: textBody,
                                    background: isDarkMode ? 'rgba(214, 85, 65, 0.08)' : 'rgba(214, 85, 65, 0.06)',
                                    borderLeft: `2px solid ${colours.cta}`,
                                    marginBottom: 4,
                                    fontFamily: 'Raleway, sans-serif',
                                    lineHeight: 1.5,
                                }}>
                                    {flag}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Suggestions */}
                    {Array.isArray(result.suggestions) && result.suggestions.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? accentPrimary : colours.highlight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: 'Raleway, sans-serif' }}>
                                Suggestions
                            </div>
                            {result.suggestions.map((s, i) => (
                                <div key={i} style={{
                                    padding: '6px 12px',
                                    fontSize: 12,
                                    color: textBody,
                                    borderLeft: `2px solid ${isDarkMode ? accentPrimary : colours.highlight}`,
                                    marginBottom: 4,
                                    fontFamily: 'Raleway, sans-serif',
                                    lineHeight: 1.5,
                                }}>
                                    {s}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Revised draft */}
                    {result.revisedDraft && (
                        <div style={{ marginTop: 10 }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 4,
                            }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: colours.green, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Raleway, sans-serif' }}>
                                    Revised Draft
                                </span>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(result.revisedDraft);
                                        showToast('Copied to clipboard', 'success');
                                    }}
                                    style={{
                                        background: 'none',
                                        border: `1px solid ${borderLight}`,
                                        color: textMuted,
                                        fontSize: 11,
                                        padding: '2px 8px',
                                        cursor: 'pointer',
                                        borderRadius: 0,
                                        fontFamily: 'Raleway, sans-serif',
                                    }}
                                >
                                    Copy
                                </button>
                            </div>
                            <div style={{
                                padding: '10px 14px',
                                fontSize: 13,
                                color: textPrimary,
                                background: isDarkMode ? colours.dark.sectionBackground : '#f9fafb',
                                border: `1px solid ${borderLight}`,
                                borderLeft: `3px solid ${colours.green}`,
                                lineHeight: 1.6,
                                fontFamily: 'Raleway, sans-serif',
                                whiteSpace: 'pre-wrap',
                                maxHeight: 300,
                                overflowY: 'auto',
                            }}>
                                {result.revisedDraft}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CommsFrameworkSection;
