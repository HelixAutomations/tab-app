import React, { useState, useEffect, useCallback, useRef } from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens } from './types';

// ── Route health types ──────────────────────────────────────────────────────
interface RouteCheck {
    id: string;
    name: string;
    group: string;
    status: 'healthy' | 'unhealthy' | 'error';
    responseMs?: number;
    error?: string;
}
interface HealthPayload {
    summary: { healthy: number; unhealthy: number; total: number };
    durationMs: number;
    checks: RouteCheck[];
}
type EnvResult = { env: 'local' | 'production'; status: 'ok' | 'fail' | 'loading'; data: HealthPayload | null; error: string | null };

interface LocalDevSectionProps {
    tokens: CommandCentreTokens;
    onFeatureToggle?: (feature: string, enabled: boolean) => void;
    featureToggles: Record<string, boolean>;
    onDevDashboard: () => void;
    onLoadingDebug: () => void;
    onErrorTracker: () => void;
    onDemoPrompts: () => void;
    onMigrationTool: () => void;
    closePopover: () => void;
    onOpenDemoMatter?: (showCcl?: boolean) => void;
}

const LocalDevSection: React.FC<LocalDevSectionProps> = ({
    tokens,
    onFeatureToggle,
    featureToggles,
    onDevDashboard,
    onLoadingDebug,
    onErrorTracker,
    onDemoPrompts,
    onMigrationTool,
    closePopover,
    onOpenDemoMatter,
}) => {
    const [collapsed, setCollapsed] = useState(true);
    const [isHeaderHovered, setIsHeaderHovered] = useState(false);
    const [routeExpanded, setRouteExpanded] = useState(false);
    const [routeResults, setRouteResults] = useState<EnvResult[]>([
        { env: 'local', status: 'loading', data: null, error: null },
        { env: 'production', status: 'loading', data: null, error: null },
    ]);
    const routeProbed = useRef(false);

    const probeEnv = useCallback(async (env: 'local' | 'production'): Promise<EnvResult> => {
        const url = env === 'local' ? '/api/route-health' : '/api/route-health/production';
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15_000);
        try {
            const r = await fetch(url, { signal: ctrl.signal });
            clearTimeout(t);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data: HealthPayload = await r.json();
            return { env, status: 'ok', data, error: null };
        } catch (err: unknown) {
            clearTimeout(t);
            return { env, status: 'fail', data: null, error: err instanceof Error ? err.message : 'Unknown' };
        }
    }, []);

    const runProbes = useCallback(async () => {
        setRouteResults([
            { env: 'local', status: 'loading', data: null, error: null },
            { env: 'production', status: 'loading', data: null, error: null },
        ]);
        const [local, prod] = await Promise.all([probeEnv('local'), probeEnv('production')]);
        setRouteResults([local, prod]);
    }, [probeEnv]);

    // Probe once when dev tools is first expanded
    useEffect(() => {
        if (!collapsed && !routeProbed.current) {
            routeProbed.current = true;
            runProbes();
        }
    }, [collapsed, runProbes]);
    const {
        isDarkMode, bg, textPrimary, textMuted, accentPrimary,
        toggleRow, actionBtn, toggleSwitch, toggleKnob,
        applyRowHover, resetRowHover, showToast,
    } = tokens;

    return (
        <div style={{
            marginBottom: 20,
            background: isDarkMode ? colours.darkBlue : colours.grey,
            border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
            borderRadius: 0,
            overflow: 'hidden',
        }}>
            <div
                style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 14px', cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    background: isHeaderHovered ? (isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)') : 'transparent',
                }}
                onMouseEnter={() => setIsHeaderHovered(true)}
                onMouseLeave={() => setIsHeaderHovered(false)}
                onClick={() => setCollapsed(prev => !prev)}
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="1.8" style={{ flexShrink: 0, opacity: 0.7 }}>
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
                <span style={{ fontSize: '11px', color: textMuted, flex: 1 }}>Dev tools</span>
                <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                    style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                >
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </div>

            <div style={{
                maxHeight: collapsed ? 0 : 1200,
                opacity: collapsed ? 0 : 1,
                overflow: 'hidden',
                transition: 'max-height 0.3s ease, opacity 0.2s ease, padding 0.3s ease',
                padding: collapsed ? '0 14px' : '0 14px 12px 14px',
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Dev Dashboard */}
                    <button
                        onClick={onDevDashboard}
                        style={{ ...actionBtn, background: accentPrimary, color: '#fff', border: `1px solid ${accentPrimary}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.85)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                            <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                        </svg>
                        Dev Dashboard
                    </button>

                    {/* ── Route Health ──────────────────────────────────── */}
                    {(() => {
                        const allOk = routeResults.every(r => r.status === 'ok' && r.data?.summary.unhealthy === 0);
                        const anyFail = routeResults.some(r => r.status === 'fail');
                        const anyLoading = routeResults.some(r => r.status === 'loading');
                        const overallDot = anyLoading ? colours.subtleGrey : allOk ? colours.green : anyFail ? colours.cta : colours.orange;
                        const envDot = (r: EnvResult) =>
                            r.status === 'loading' ? colours.subtleGrey
                            : r.status === 'fail' ? colours.cta
                            : (r.data && r.data.summary.unhealthy > 0) ? colours.orange
                            : colours.green;

                        return (
                            <div style={{
                                background: isDarkMode ? 'rgba(13, 47, 96, 0.18)' : 'rgba(54, 144, 206, 0.04)',
                                border: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`,
                                borderRadius: 0,
                                overflow: 'hidden',
                            }}>
                                {/* Header row — always visible when dev tools open */}
                                <div
                                    style={{
                                        ...toggleRow,
                                        padding: '8px 10px',
                                        cursor: 'pointer',
                                        margin: 0,
                                    }}
                                    onClick={() => setRouteExpanded(p => !p)}
                                    onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                                    onMouseLeave={(e) => resetRowHover(e.currentTarget)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                                        <span style={{
                                            width: 6, height: 6, borderRadius: '50%',
                                            background: overallDot,
                                            boxShadow: `0 0 4px ${overallDot}88`,
                                            flexShrink: 0,
                                        }} />
                                        <span style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Route Health</span>
                                        {/* Compact env summary */}
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
                                            {routeResults.map(r => (
                                                <span key={r.env} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: envDot(r) }} />
                                                    <span style={{ fontSize: 10, color: textMuted }}>
                                                        {r.env === 'local' ? 'L' : 'P'}
                                                        {r.status === 'ok' && r.data ? `:${r.data.summary.healthy}/${r.data.summary.total}` : ''}
                                                    </span>
                                                </span>
                                            ))}
                                        </span>
                                    </div>
                                    <svg
                                        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                                        style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: routeExpanded ? 'rotate(180deg)' : 'rotate(0deg)', marginLeft: 4 }}
                                    >
                                        <path d="M6 9l6 6 6-6"/>
                                    </svg>
                                </div>

                                {/* Expanded detail */}
                                <div style={{
                                    maxHeight: routeExpanded ? 600 : 0,
                                    opacity: routeExpanded ? 1 : 0,
                                    overflow: 'hidden',
                                    transition: 'max-height 0.25s ease, opacity 0.2s ease',
                                }}>
                                    {routeResults.map(r => (
                                        <div key={r.env} style={{ borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}` }}>
                                            <div style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: envDot(r), flexShrink: 0 }} />
                                                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: textPrimary }}>{r.env}</span>
                                                {r.status === 'ok' && r.data && (
                                                    <span style={{ marginLeft: 'auto', fontSize: 10, color: textMuted }}>{r.data.summary.healthy}/{r.data.summary.total} · {r.data.durationMs}ms</span>
                                                )}
                                                {r.status === 'fail' && (
                                                    <span style={{ marginLeft: 'auto', fontSize: 10, color: colours.cta }}>{r.error}</span>
                                                )}
                                                {r.status === 'loading' && (
                                                    <span style={{ marginLeft: 'auto', fontSize: 10, color: textMuted, opacity: 0.6 }}>probing…</span>
                                                )}
                                            </div>
                                            {r.status === 'ok' && r.data && r.data.checks.map(c => (
                                                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 10px 2px 22px', fontSize: 11 }}>
                                                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: c.status === 'healthy' ? colours.green : colours.cta, flexShrink: 0 }} />
                                                    <span style={{ flex: 1, color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.name}</span>
                                                    {c.responseMs != null && <span style={{ fontSize: 9, color: textMuted }}>{c.responseMs}ms</span>}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                    {/* Refresh */}
                                    <div style={{ padding: '6px 10px', borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`, display: 'flex', justifyContent: 'flex-end' }}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); runProbes(); showToast('Probing routes…', 'info'); }}
                                            style={{ ...actionBtn, fontSize: 10, padding: '3px 10px' }}
                                        >
                                            ↻ refresh
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Rate Change Tracker */}
                    <div
                        style={toggleRow}
                        onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                        onMouseLeave={(e) => resetRowHover(e.currentTarget)}
                        onClick={() => { showToast('Opening rate change tracker', 'info'); window.dispatchEvent(new CustomEvent('openRateChangeModal')); closePopover(); }}
                    >
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Rate Change Tracker</div>
                            <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Jan 2026 rate notifications</div>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </div>

                    {/* Loading Debug */}
                    <div
                        style={toggleRow}
                        onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                        onMouseLeave={(e) => resetRowHover(e.currentTarget)}
                        onClick={() => { showToast('Opening loading debug', 'info'); onLoadingDebug(); }}
                    >
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Loading Debug</div>
                            <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Test loading screens</div>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </div>

                    {/* Error Tracker */}
                    <div
                        style={toggleRow}
                        onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                        onMouseLeave={(e) => resetRowHover(e.currentTarget)}
                        onClick={() => { showToast('Opening error tracker', 'info'); onErrorTracker(); }}
                    >
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Error Tracker</div>
                            <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>View runtime errors</div>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </div>

                    {/* View as Production */}
                    {onFeatureToggle && (
                        <div
                            style={toggleRow}
                            onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                            onMouseLeave={(e) => resetRowHover(e.currentTarget)}
                            onClick={() => {
                                const next = !featureToggles.viewAsProd;
                                onFeatureToggle('viewAsProd', next);
                                showToast(next ? 'Production view active' : 'Production view off', next ? 'success' : 'warning');
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

                    {/* Show Attendance */}
                    {onFeatureToggle && (
                        <div
                            style={toggleRow}
                            onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                            onMouseLeave={(e) => resetRowHover(e.currentTarget)}
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

                    {/* Show Ops Queue */}
                    {onFeatureToggle && (
                        <div
                            style={toggleRow}
                            onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                            onMouseLeave={(e) => resetRowHover(e.currentTarget)}
                            onClick={() => {
                                const next = !featureToggles.forceShowOpsQueue;
                                onFeatureToggle('forceShowOpsQueue', next);
                                showToast(next ? 'Ops queue forced visible' : 'Ops queue role-gated', next ? 'success' : 'warning');
                            }}
                        >
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    Force Ops Queue
                                    {featureToggles.forceShowOpsQueue && (
                                        <span style={{ fontSize: 9, background: textMuted, color: bg, padding: '1px 5px', borderRadius: '2px', fontWeight: 700 }}>ON</span>
                                    )}
                                </div>
                                <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Show ops queue regardless of role</div>
                            </div>
                            <div style={toggleSwitch(!!featureToggles.forceShowOpsQueue)}>
                                <div style={toggleKnob(!!featureToggles.forceShowOpsQueue)} />
                            </div>
                        </div>
                    )}

                    {/* Replay Animations */}
                    <div
                        style={toggleRow}
                        onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                        onMouseLeave={(e) => resetRowHover(e.currentTarget)}
                        onClick={() => { showToast('Replaying animations', 'info'); window.dispatchEvent(new CustomEvent('replayMetricAnimation')); closePopover(); }}
                    >
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Replay Animations</div>
                            <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Re-run metric count-up</div>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                            <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                        </svg>
                    </div>

                    {/* Todo List */}
                    <div
                        style={toggleRow}
                        onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                        onMouseLeave={(e) => resetRowHover(e.currentTarget)}
                        onClick={() => { showToast('Opening local todo prompts', 'info'); onDemoPrompts(); closePopover(); }}
                    >
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Todo List</div>
                            <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Local demo prompts</div>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </div>

                    {/* Pipeline Migration */}
                    <div
                        style={toggleRow}
                        onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                        onMouseLeave={(e) => resetRowHover(e.currentTarget)}
                        onClick={() => { showToast('Opening migration tool', 'info'); onMigrationTool(); }}
                    >
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Pipeline Migration
                                <span style={{
                                    fontSize: 8, fontWeight: 700, color: colours.blue,
                                    padding: '1px 5px',
                                    background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.06)',
                                    border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.20)' : 'rgba(54, 144, 206, 0.12)'}`,
                                    borderRadius: '2px', textTransform: 'uppercase', letterSpacing: '0.3px',
                                }}>v1</span>
                            </div>
                            <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Migrate legacy Clio matters into the pipeline</div>
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </div>

                    {/* Demo Shortcuts */}
                    {onOpenDemoMatter && (
                        <>
                            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.8px', color: isDarkMode ? 'rgba(135, 243, 243, 0.5)' : colours.subtleGrey, textTransform: 'uppercase', marginTop: 4 }}>
                                Demo shortcuts
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                                <button onClick={() => onOpenDemoMatter(false)} style={actionBtn}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                                    Matter
                                </button>
                                <button onClick={() => onOpenDemoMatter(true)} style={{ ...actionBtn, color: colours.accent, borderColor: isDarkMode ? 'rgba(135, 243, 243, 0.18)' : 'rgba(54, 144, 206, 0.18)' }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                    CCL
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LocalDevSection;
