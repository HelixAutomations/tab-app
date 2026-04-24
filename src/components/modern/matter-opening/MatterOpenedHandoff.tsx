import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colours } from '../../../app/styles/colours';

/**
 * MatterOpenedHandoff
 * ───────────────────
 * Rendered inside the matter-opening processing panel after the matter has
 * been created. Polls the real /api/ccl/batch-status endpoint for the opened
 * matter and surfaces whatever actually happened — compile, generate,
 * pressure test, review ready, needs attention, or silent failure.
 *
 * Important: no demo replica. If the service didn't run (or ran badly) we
 * want that visible, not masked. The only demo-specific behaviour is the
 * hardcoded matter id `3311402` which the demo flow already posts to
 * /service/run; we poll that same id.
 *
 * Related brief: docs/notes/CCL_BACKEND_CHAIN_SILENT_AUTOPILOT_SERVICE.md
 */

type CclStage = 'pending' | 'compiled' | 'generated' | 'pressure-tested' | 'reviewed' | 'sent';

interface BatchStatusEntry {
    status?: string;
    stage?: string;
    label?: string;
    version?: number;
    confidence?: string;
    needsAttention?: boolean;
    attentionReason?: string;
    unresolvedCount?: number;
    compiledAt?: string | null;
    generatedAt?: string | null;
    finalizedAt?: string | null;
    uploadedToNd?: boolean;
    uploadedToClio?: boolean;
}

function canonicalStage(entry?: BatchStatusEntry | null): CclStage {
    const raw = String(entry?.stage || entry?.status || '').trim().toLowerCase();
    switch (raw) {
        case 'compiled': return 'compiled';
        case 'generated':
        case 'draft': return 'generated';
        case 'pressure-tested':
        case 'pressure_tested':
        case 'pressuretested': return 'pressure-tested';
        case 'reviewed':
        case 'approved':
        case 'final': return 'reviewed';
        case 'sent':
        case 'uploaded': return 'sent';
        default: return 'pending';
    }
}

interface Props {
    openedMatterId: string | null;
    matterOpenSucceeded: boolean;
    isDarkMode: boolean;
    /** Used only as a hint; real state still comes from polling. */
    initialCclUrl?: string;
    /** Optional fee-earner email for retry requests. */
    feeEarnerEmail?: string;
    onGoToMatter: () => void;
    onDismiss?: () => void;
}

type HandoffTone = 'working' | 'ready' | 'attention' | 'blocked' | 'idle';

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_DURATION_MS = 90_000; // 90s — after which we surface "autopilot skipped"

const MatterOpenedHandoff: React.FC<Props> = ({
    openedMatterId,
    matterOpenSucceeded,
    isDarkMode,
    initialCclUrl,
    feeEarnerEmail,
    onGoToMatter,
    onDismiss,
}) => {
    const [entry, setEntry] = useState<BatchStatusEntry | null>(null);
    const [fetchedOnce, setFetchedOnce] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [retryError, setRetryError] = useState<string | null>(null);
    const [timedOut, setTimedOut] = useState(false);
    const startedAtRef = useRef<number>(Date.now());

    const fetchStatus = useCallback(async (matterId: string) => {
        try {
            const res = await fetch('/api/ccl/batch-status', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ matterIds: [matterId] }),
            });
            if (!res.ok) return null;
            const json = await res.json();
            return (json?.results?.[matterId] as BatchStatusEntry) || null;
        } catch {
            return null;
        }
    }, []);

    // Poll loop — only runs when matter opened successfully
    useEffect(() => {
        if (!matterOpenSucceeded || !openedMatterId) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        startedAtRef.current = Date.now();

        const tick = async () => {
            if (cancelled) return;
            const next = await fetchStatus(openedMatterId);
            if (cancelled) return;
            setFetchedOnce(true);
            setEntry(next || null);
            const stage = canonicalStage(next);
            const terminal = stage === 'reviewed' || stage === 'sent';
            const elapsed = Date.now() - startedAtRef.current;
            if (terminal) return; // stop polling
            if (elapsed > MAX_POLL_DURATION_MS) {
                if (!next) setTimedOut(true);
                return;
            }
            timer = setTimeout(tick, POLL_INTERVAL_MS);
        };

        // First poll fires fast (service has started by the time matter opens)
        timer = setTimeout(tick, 600);
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [matterOpenSucceeded, openedMatterId, fetchStatus]);

    const handleRetryAutopilot = useCallback(async () => {
        if (!openedMatterId) return;
        setRetrying(true);
        setRetryError(null);
        try {
            const res = await fetch('/api/ccl/service/run', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    matterId: openedMatterId,
                    triggeredBy: 'matter-opening-handoff-retry',
                    feeEarnerEmail,
                }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || `HTTP ${res.status}`);
            }
            setTimedOut(false);
            startedAtRef.current = Date.now();
            // Kick the poller back off by forcing a re-fetch
            const next = await fetchStatus(openedMatterId);
            setEntry(next || null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Retry failed';
            setRetryError(msg);
        } finally {
            setRetrying(false);
        }
    }, [openedMatterId, feeEarnerEmail, fetchStatus]);

    const handleOpenReviewRail = useCallback(() => {
        if (!openedMatterId) return;
        window.dispatchEvent(new CustomEvent('openHomeCclReview', {
            detail: { matterId: openedMatterId, openInspector: true, autoRunAi: false },
        }));
        // The listener lives on OperationsDashboard (Home tab). Navigate there.
        window.dispatchEvent(new CustomEvent('navigateToHome'));
    }, [openedMatterId]);

    const stage = canonicalStage(entry);
    const needsAttention = !!entry?.needsAttention || (entry?.unresolvedCount ?? 0) > 0 || String(entry?.confidence || '').toLowerCase() === 'fallback';

    const tone: HandoffTone = useMemo(() => {
        if (!matterOpenSucceeded) return 'blocked';
        if (!fetchedOnce) return 'idle';
        if (timedOut && !entry) return 'blocked';
        if (!entry) return 'working';
        if (needsAttention) return 'attention';
        if (stage === 'reviewed' || stage === 'sent') return 'ready';
        if (stage === 'generated' || stage === 'pressure-tested') return 'ready';
        return 'working';
    }, [matterOpenSucceeded, fetchedOnce, timedOut, entry, needsAttention, stage]);

    if (!matterOpenSucceeded) return null;

    const stepDefs: { key: CclStage; label: string }[] = [
        { key: 'compiled', label: 'Compile context' },
        { key: 'generated', label: 'Generate draft' },
        { key: 'pressure-tested', label: 'Pressure test' },
        { key: 'reviewed', label: 'Review ready' },
    ];
    const stageOrder: CclStage[] = ['pending', 'compiled', 'generated', 'pressure-tested', 'reviewed', 'sent'];
    const currentIdx = Math.max(0, stageOrder.indexOf(stage));

    // Palette (respects dark mode, follows dashboard tokens)
    const successColor = colours.green;
    const workingColor = isDarkMode ? colours.accent : colours.highlight;
    const attentionColor = colours.orange;
    const blockedColor = colours.cta;
    const mutedText = isDarkMode ? '#9CA3AF' : '#64748B';
    const cardBg = isDarkMode ? 'rgba(8,28,48,0.6)' : '#F8FAFC';
    const cardBorder = isDarkMode ? 'rgba(75,85,99,0.4)' : 'rgba(226,232,240,0.9)';

    const headerColor = tone === 'ready' ? successColor
        : tone === 'attention' ? attentionColor
            : tone === 'blocked' ? blockedColor
                : workingColor;

    const headline = tone === 'ready'
        ? 'CCL draft ready for review'
        : tone === 'attention'
            ? 'CCL draft needs attention'
            : tone === 'blocked'
                ? (timedOut ? 'CCL autopilot did not respond' : 'CCL autopilot skipped')
                : fetchedOnce
                    ? 'CCL autopilot running…'
                    : 'Checking CCL autopilot…';

    const subline = tone === 'ready'
        ? 'Draft generated and pressure-tested. Review and approve to upload to NetDocuments — nothing is sent until you click.'
        : tone === 'attention'
            ? (entry?.unresolvedCount
                ? `${entry.unresolvedCount} field${entry.unresolvedCount === 1 ? '' : 's'} need confirmation before this can be sent.`
                : 'Low-confidence content was produced. Review before sending.')
            : tone === 'blocked'
                ? (timedOut
                    ? 'The autopilot did not produce a draft within 90 seconds. You can retry it here or open the matter and run it manually.'
                    : 'The autopilot has not run yet for this matter. You can kick it off now or come back later.')
                : 'We\'re polling the service for live status. This usually completes within a minute.';

    return (
        <div
            style={{
                marginTop: 16,
                padding: 16,
                background: cardBg,
                border: `1px solid ${cardBorder}`,
                borderLeft: `3px solid ${headerColor}`,
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
            }}
            data-testid="matter-opened-handoff"
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div
                    style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: headerColor,
                        flexShrink: 0, marginTop: 6,
                        boxShadow: tone === 'working' ? `0 0 0 4px ${headerColor}22` : 'none',
                    }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: headerColor }}>
                        {headline}
                    </div>
                    <div style={{ fontSize: 12, color: mutedText, marginTop: 2, lineHeight: 1.5 }}>
                        {subline}
                    </div>
                    {openedMatterId && (
                        <div style={{ fontSize: 11, color: mutedText, marginTop: 6, fontFamily: 'monospace' }}>
                            Matter {openedMatterId}
                            {entry?.version ? ` · draft v${entry.version}` : ''}
                            {entry?.confidence ? ` · ${entry.confidence} confidence` : ''}
                            {entry?.uploadedToNd ? ' · NetDocs ok' : ''}
                        </div>
                    )}
                </div>
                {onDismiss && (
                    <button
                        type="button"
                        onClick={onDismiss}
                        aria-label="Dismiss"
                        style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            fontSize: 16, color: mutedText, padding: 4, lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Step strip — mirrors the OperationsDashboard pipeline vocabulary */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {stepDefs.map((step, i) => {
                    const stepIdx = stageOrder.indexOf(step.key);
                    const isDone = currentIdx >= stepIdx && fetchedOnce && !!entry;
                    const isCurrent = fetchedOnce && !!entry && stepIdx === currentIdx;
                    const dotColor = isDone && !needsAttention
                        ? successColor
                        : isCurrent
                            ? (needsAttention ? attentionColor : workingColor)
                            : mutedText;
                    return (
                        <div
                            key={step.key}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                fontSize: 11,
                                color: isDone || isCurrent ? (isDarkMode ? colours.dark.text : colours.light.text) : mutedText,
                                padding: '4px 10px',
                                borderRadius: 999,
                                background: isCurrent
                                    ? `${dotColor}18`
                                    : isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
                                border: `1px solid ${isCurrent ? dotColor + '55' : 'transparent'}`,
                            }}
                        >
                            <span style={{
                                width: 6, height: 6, borderRadius: '50%',
                                background: dotColor,
                                boxShadow: isCurrent ? `0 0 0 3px ${dotColor}22` : 'none',
                            }} />
                            {step.label}
                        </div>
                    );
                })}
            </div>

            {retryError && (
                <div style={{ fontSize: 11, color: blockedColor }}>
                    Retry failed: {retryError}
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                    type="button"
                    onClick={handleOpenReviewRail}
                    disabled={!openedMatterId || tone === 'blocked'}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 6,
                        background: tone === 'ready'
                            ? `linear-gradient(135deg, ${colours.highlight} 0%, ${colours.helixBlue} 100%)`
                            : 'transparent',
                        color: tone === 'ready' ? '#fff' : headerColor,
                        border: tone === 'ready' ? 'none' : `1px solid ${headerColor}`,
                        cursor: (!openedMatterId || tone === 'blocked') ? 'not-allowed' : 'pointer',
                        opacity: (!openedMatterId || tone === 'blocked') ? 0.5 : 1,
                        fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    }}
                >
                    {tone === 'attention' ? 'Review & fix' : 'Review & send CCL'}
                </button>

                <button
                    type="button"
                    onClick={onGoToMatter}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 6,
                        background: 'transparent',
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        border: `1px solid ${cardBorder}`,
                        cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                    }}
                >
                    Go to matter
                </button>

                {(tone === 'blocked' || tone === 'attention') && (
                    <button
                        type="button"
                        onClick={handleRetryAutopilot}
                        disabled={retrying || !openedMatterId}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 6,
                            background: 'transparent',
                            color: attentionColor,
                            border: `1px solid ${attentionColor}66`,
                            cursor: retrying ? 'wait' : 'pointer',
                            fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                            opacity: retrying ? 0.7 : 1,
                        }}
                    >
                        {retrying ? 'Retrying…' : 'Retry autopilot'}
                    </button>
                )}

                {initialCclUrl && tone !== 'blocked' && (
                    <a
                        href={initialCclUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 6,
                            background: 'transparent',
                            color: mutedText,
                            border: `1px solid ${cardBorder}`,
                            cursor: 'pointer',
                            fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                            textDecoration: 'none',
                        }}
                    >
                        Preview draft
                    </a>
                )}
            </div>
        </div>
    );
};

export default MatterOpenedHandoff;
