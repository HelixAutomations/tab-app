import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens } from './types';
import { trackClientEvent } from '../../utils/telemetry';

/*
 * PromptCoachSection — chat-only prompt refinement assistant.
 *
 * LOCAL-DEV / LZ-AC GATED at the call site (UserBubble). Not for prod surfaces yet.
 * Mirrors CommsFrameworkSection patterns (sectionTitle, helix-ai-border wrapper,
 * borderRadius 0, brand tokens only, draft persistence in localStorage).
 *
 * Calls POST /api/ai/prompt-coach/refine — returns { refinedPrompt, scores,
 * missingContext, mechanisms } so the operator can copy a sharper agent prompt
 * before kicking off the actual implementation pass.
 */

interface CoachDimension { score: number; feedback: string }
interface CoachResult {
    refinedPrompt: string;
    overallScore: number;
    dimensions: {
        specificity: CoachDimension;
        boundedness: CoachDimension;
        repoFit: CoachDimension;
    };
    missingContext: string[];
    mechanisms: string[];
}

interface PromptCoachSectionProps {
    tokens: CommandCentreTokens;
}

const STORAGE_KEY = 'helix.promptCoach.v1';
const MIN_BRIEF_CHARS = 8;

interface PersistedState {
    brief: string;
    context: string;
    showContext: boolean;
    lastResult?: CoachResult | null;
}

function readPersisted(): Partial<PersistedState> {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writePersisted(state: PersistedState) {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const PromptCoachSection: React.FC<PromptCoachSectionProps> = ({ tokens }) => {
    const { isDarkMode, textPrimary, textBody, textMuted, borderLight, accentPrimary, sectionTitle, showToast } = tokens;

    const persisted = useMemo(readPersisted, []);

    const [brief, setBrief] = useState<string>(persisted.brief || '');
    const [context, setContext] = useState<string>(persisted.context || '');
    const [showContext, setShowContext] = useState<boolean>(Boolean(persisted.showContext));
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<CoachResult | null>(persisted.lastResult || null);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        writePersisted({ brief, context, showContext, lastResult: result });
    }, [brief, context, showContext, result]);

    useEffect(() => () => { abortRef.current?.abort(); }, []);

    const refine = useCallback(async () => {
        const trimmed = brief.trim();
        if (trimmed.length < MIN_BRIEF_CHARS) {
            setError(`Brief must be at least ${MIN_BRIEF_CHARS} characters.`);
            return;
        }
        setLoading(true);
        setError('');
        setResult(null);

        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        const startedAt = performance.now();
        try {
            const res = await fetch('/api/ai/prompt-coach/refine', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brief: trimmed,
                    ...(context.trim() ? { context: context.trim() } : {}),
                }),
                signal: ac.signal,
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Prompt coach failed');
            setResult(data.result);
            const durationMs = Math.round(performance.now() - startedAt);
            const score = data.result?.overallScore ?? 0;
            showToast(`Refined: ${score}/10 (${Math.round(durationMs / 1000)}s)`, score >= 7 ? 'success' : 'warning');
            trackClientEvent('PromptCoach', 'Refine.Completed', {
                score,
                briefChars: trimmed.length,
                hasContext: context.trim().length > 0,
                durationMs,
            });
        } catch (err: unknown) {
            if ((err as Error).name === 'AbortError') {
                trackClientEvent('PromptCoach', 'Refine.Cancelled', {});
                return;
            }
            const msg = (err as Error).message || 'Prompt coach failed';
            setError(msg);
            showToast(msg, 'warning');
            trackClientEvent('PromptCoach', 'Refine.Failed', { error: msg });
        } finally {
            setLoading(false);
        }
    }, [brief, context, showToast]);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        setLoading(false);
    }, []);

    const copyRefined = useCallback(async () => {
        if (!result?.refinedPrompt) return;
        try {
            await navigator.clipboard.writeText(result.refinedPrompt);
            setCopied(true);
            showToast('Refined prompt copied. Paste it into your next agent turn.', 'success');
            trackClientEvent('PromptCoach', 'Refined.Copied', { score: result.overallScore });
            setTimeout(() => setCopied(false), 2000);
        } catch {
            showToast('Could not copy to clipboard.', 'warning');
        }
    }, [result, showToast]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (!loading && brief.trim().length >= MIN_BRIEF_CHARS) refine();
        }
    }, [loading, brief, refine]);

    const scoreColour = (score: number): string => {
        if (score >= 8) return colours.green;
        if (score >= 5) return colours.orange;
        return colours.cta;
    };

    const inputBg = isDarkMode ? colours.darkBlue : '#fff';
    const briefChars = brief.length;
    const tooShort = briefChars > 0 && briefChars < MIN_BRIEF_CHARS;

    const textareaStyle: React.CSSProperties = {
        width: '100%',
        minHeight: 110,
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

    const ctaBtn: React.CSSProperties = {
        padding: '8px 16px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'Raleway, sans-serif',
        background: loading ? colours.subtleGrey : (isDarkMode ? accentPrimary : colours.highlight),
        color: isDarkMode ? colours.dark.background : '#fff',
        border: 'none',
        borderRadius: 0,
        cursor: loading ? 'wait' : (briefChars >= MIN_BRIEF_CHARS ? 'pointer' : 'not-allowed'),
        opacity: briefChars >= MIN_BRIEF_CHARS ? 1 : 0.5,
        transition: 'opacity 0.15s ease',
    };

    const ghostBtn: React.CSSProperties = {
        padding: '7px 12px',
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'Raleway, sans-serif',
        background: 'transparent',
        color: textMuted,
        border: `1px solid ${borderLight}`,
        borderRadius: 0,
        cursor: 'pointer',
    };

    return (
        <div style={{ marginBottom: 16 }} data-ai-busy={loading ? 'true' : 'false'}>
            <div style={sectionTitle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                Prompt Coach
                <span style={{ fontSize: 8, fontWeight: 700, background: isDarkMode ? colours.accent : colours.highlight, color: isDarkMode ? colours.dark.background : '#fff', padding: '1px 5px', letterSpacing: 0.6, fontFamily: 'Raleway, sans-serif' }}>DEV</span>
            </div>

            <div style={{ border: `1px solid ${borderLight}`, borderRadius: 0, overflow: 'hidden' }}>
                {/* Header strip — explainer */}
                <div style={{
                    padding: '10px 14px',
                    fontSize: 11,
                    color: textMuted,
                    background: isDarkMode ? colours.dark.sectionBackground : 'rgba(0,0,0,0.02)',
                    borderBottom: `1px solid ${borderLight}`,
                    lineHeight: 1.5,
                }}>
                    Paste a rough brief. The coach refines it into an agent-ready prompt with scope, conventions, verification, and which lightweight mechanisms apply.
                </div>

                {/* Brief textarea */}
                <div style={{ padding: 12 }}>
                    <textarea
                        value={brief}
                        onChange={(e) => setBrief(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="e.g. fix the loader on the matters tab that flickers when filters change; keep the existing layout and don't touch the schema"
                        style={textareaStyle}
                        aria-label="Rough brief"
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 10, color: tooShort ? colours.cta : textMuted }}>
                        <span>{tooShort ? `Need ${MIN_BRIEF_CHARS - briefChars} more chars` : `${briefChars} chars`}</span>
                        <span>Ctrl/Cmd+Enter to refine</span>
                    </div>
                </div>

                {/* Optional context toggle */}
                <div style={{ padding: '0 12px 12px' }}>
                    <button
                        type="button"
                        onClick={() => setShowContext(v => !v)}
                        style={{
                            ...ghostBtn,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            {showContext ? <path d="M19 9l-7 7-7-7"/> : <path d="M9 5l7 7-7 7"/>}
                        </svg>
                        {showContext ? 'Hide extra context' : 'Add extra context (optional)'}
                    </button>
                    {showContext && (
                        <textarea
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            placeholder="Optional: paste error messages, file paths, screenshots-as-text, or anything that would help the coach pick the right files."
                            style={{ ...textareaStyle, minHeight: 80, marginTop: 8 }}
                            aria-label="Extra context"
                        />
                    )}
                </div>

                {/* Action row */}
                <div style={{
                    padding: '10px 12px',
                    display: 'flex',
                    gap: 8,
                    justifyContent: 'flex-end',
                    background: isDarkMode ? colours.dark.sectionBackground : 'rgba(0,0,0,0.02)',
                    borderTop: `1px solid ${borderLight}`,
                }}>
                    {loading && (
                        <button type="button" onClick={cancel} style={ghostBtn}>Cancel</button>
                    )}
                    <button
                        type="button"
                        onClick={refine}
                        disabled={loading || briefChars < MIN_BRIEF_CHARS}
                        style={ctaBtn}
                    >
                        {loading ? 'Refining…' : (result ? 'Re-refine' : 'Refine prompt')}
                    </button>
                </div>

                {error && (
                    <div style={{ padding: '8px 12px', fontSize: 11, color: colours.cta, borderTop: `1px solid ${borderLight}` }}>
                        {error}
                    </div>
                )}

                {result && (
                    <div style={{ padding: 12, borderTop: `1px solid ${borderLight}`, background: inputBg }}>
                        {/* Score row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                            <div style={{
                                width: 40, height: 40,
                                background: scoreColour(result.overallScore),
                                color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 14, fontWeight: 700,
                                borderRadius: 0,
                                fontFamily: 'Raleway, sans-serif',
                            }}>
                                {result.overallScore}
                            </div>
                            <div style={{ flex: 1, fontSize: 11, color: textBody, lineHeight: 1.45 }}>
                                <div style={{ fontWeight: 600, color: textPrimary, marginBottom: 2 }}>
                                    Confidence this prompt produces a good first pass
                                </div>
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10, color: textMuted }}>
                                    <span>Specificity {result.dimensions.specificity.score}/10</span>
                                    <span>Boundedness {result.dimensions.boundedness.score}/10</span>
                                    <span>Repo-fit {result.dimensions.repoFit.score}/10</span>
                                </div>
                            </div>
                        </div>

                        {/* Refined prompt */}
                        <div style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: isDarkMode ? colours.accent : colours.highlight }}>
                                    Refined prompt
                                </div>
                                <button type="button" onClick={copyRefined} style={ghostBtn}>
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            <pre style={{
                                margin: 0,
                                padding: 10,
                                fontSize: 12,
                                lineHeight: 1.55,
                                fontFamily: 'Raleway, sans-serif',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                color: textPrimary,
                                background: isDarkMode ? colours.dark.cardBackground : colours.grey,
                                border: `1px solid ${borderLight}`,
                                borderRadius: 0,
                                maxHeight: 360,
                                overflow: 'auto',
                            }}>{result.refinedPrompt}</pre>
                        </div>

                        {/* Mechanisms to remember */}
                        {result.mechanisms?.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: textMuted, marginBottom: 4 }}>
                                    Mechanisms to invoke
                                </div>
                                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: textBody, lineHeight: 1.5 }}>
                                    {result.mechanisms.map((m, i) => <li key={i}>{m}</li>)}
                                </ul>
                            </div>
                        )}

                        {/* Missing context the operator could supply */}
                        {result.missingContext?.length > 0 && (
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: colours.orange, marginBottom: 4 }}>
                                    Missing context
                                </div>
                                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: textBody, lineHeight: 1.5 }}>
                                    {result.missingContext.map((m, i) => <li key={i}>{m}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PromptCoachSection;
