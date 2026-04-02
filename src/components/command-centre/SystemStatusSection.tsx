import React, { useState } from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens } from './types';

interface HealthComponent {
    status: string;
}

interface HealthData {
    overall: string;
    uptimeSeconds: number;
    memory: { rss: number; heapUsed: number };
    components: Record<string, HealthComponent>;
    sse: { clients: number };
}

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

interface SystemStatusSectionProps {
    tokens: CommandCentreTokens;
    healthData: HealthData | null;
    healthLoading: boolean;
    routeResults: EnvResult[];
    onRefreshRoutes: () => void;
    enquiriesLiveRefreshInFlight: boolean;
    enquiriesUsingSnapshot: boolean;
    enquiriesLastLiveSyncAt: number | null;
}

const SystemStatusSection: React.FC<SystemStatusSectionProps> = ({
    tokens,
    healthData,
    healthLoading,
    routeResults,
    onRefreshRoutes,
    enquiriesLiveRefreshInFlight,
    enquiriesUsingSnapshot,
    enquiriesLastLiveSyncAt,
}) => {
    const [collapsed, setCollapsed] = useState(true);
    const [isHeaderHovered, setIsHeaderHovered] = useState(false);
    const [routeExpanded, setRouteExpanded] = useState(false);
    const { isDarkMode, textPrimary, textMuted, sectionTitle, toggleRow, applyRowHover, resetRowHover, showToast } = tokens;
    const textBody = isDarkMode ? '#d1d5db' : '#374151';

    const overallHealthDot = healthData?.overall === 'healthy' ? colours.green
        : healthData?.overall === 'degraded' ? colours.orange
        : colours.subtleGrey;

    const allRoutesOk = routeResults.every(r => r.status === 'ok' && r.data?.summary.unhealthy === 0);
    const anyRouteFail = routeResults.some(r => r.status === 'fail');
    const anyRouteLoading = routeResults.some(r => r.status === 'loading');
    const routeOverallDot = anyRouteLoading ? colours.subtleGrey : allRoutesOk ? colours.green : anyRouteFail ? colours.cta : colours.orange;
    const envDot = (r: EnvResult) =>
        r.status === 'loading' ? colours.subtleGrey
        : r.status === 'fail' ? colours.cta
        : (r.data && r.data.summary.unhealthy > 0) ? colours.orange
        : colours.green;

    // Combined dot — worst of health + routes
    const combinedDot = (() => {
        if (healthData?.overall === 'degraded' || anyRouteFail) return colours.cta;
        if (!healthData || anyRouteLoading) return colours.subtleGrey;
        if (healthData.overall === 'healthy' && allRoutesOk) return colours.green;
        return colours.orange;
    })();

    return (
        <div style={{ marginBottom: 20 }}>
            <div style={sectionTitle}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: combinedDot, boxShadow: `0 0 4px ${combinedDot}66` }} />
                System status
                {healthLoading && <span style={{ fontSize: 9, color: colours.subtleGrey, marginLeft: 'auto' }}>polling…</span>}
            </div>

            <div style={{
                background: isDarkMode ? colours.darkBlue : colours.grey,
                border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                borderRadius: 0,
                overflow: 'hidden',
            }}>
                {/* Collapsed summary strip */}
                <div
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        background: isHeaderHovered ? (isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)') : 'transparent',
                    }}
                    onMouseEnter={() => setIsHeaderHovered(true)}
                    onMouseLeave={() => setIsHeaderHovered(false)}
                    onClick={() => setCollapsed(prev => !prev)}
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="1.8" style={{ flexShrink: 0, opacity: 0.7 }}>
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 11, color: textMuted }}>Server, routes &amp; data</span>
                        {/* Compact status dots when collapsed */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <span style={{ width: 4, height: 4, borderRadius: 999, background: overallHealthDot }} />
                                <span style={{ fontSize: 9, color: textMuted }}>H</span>
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <span style={{ width: 4, height: 4, borderRadius: 999, background: routeOverallDot }} />
                                <span style={{ fontSize: 9, color: textMuted }}>R</span>
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <span style={{ width: 4, height: 4, borderRadius: 999, background: enquiriesLiveRefreshInFlight ? colours.highlight
                                    : enquiriesUsingSnapshot ? colours.orange
                                    : enquiriesLastLiveSyncAt ? colours.green
                                    : colours.subtleGrey }} />
                                <span style={{ fontSize: 9, color: textMuted }}>D</span>
                            </span>
                        </div>
                    </div>
                    <svg
                        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                        style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                    >
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </div>

                {/* Expanded details */}
                <div style={{
                    maxHeight: collapsed ? 0 : 800,
                    opacity: collapsed ? 0 : 1,
                    overflow: 'hidden',
                    transition: 'max-height 0.25s ease, opacity 0.2s ease, padding 0.25s ease',
                    padding: collapsed ? '0 14px' : '0 14px 12px 14px',
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Server health */}
                        <div style={{ display: 'grid', gap: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: isDarkMode ? colours.accent : colours.highlight, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 5, height: 5, borderRadius: 999, background: overallHealthDot }} />
                                Server health
                            </div>
                            {healthData ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                                        {Object.entries(healthData.components).map(([name, comp]) => (
                                            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: textBody, padding: '3px 0' }}>
                                                <span style={{
                                                    width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                                                    background: comp.status === 'connected' || comp.status === 'running' ? colours.green
                                                        : comp.status === 'disconnected' || comp.status === 'stopped' ? colours.cta
                                                        : colours.subtleGrey
                                                }} />
                                                {name}
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 12, fontSize: 10, color: colours.subtleGrey }}>
                                        <span>Up {healthData.uptimeSeconds < 3600
                                            ? `${Math.floor(healthData.uptimeSeconds / 60)}m`
                                            : `${Math.floor(healthData.uptimeSeconds / 3600)}h ${Math.floor((healthData.uptimeSeconds % 3600) / 60)}m`
                                        }</span>
                                        <span>Heap {Math.round(healthData.memory.heapUsed / 1024 / 1024)}MB</span>
                                    </div>
                                    {/* SSE */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: textBody }}>
                                        <span style={{ width: 6, height: 6, borderRadius: 999, background: healthData.sse.clients > 0 ? colours.green : colours.subtleGrey }} />
                                        SSE {healthData.sse.clients} client{healthData.sse.clients !== 1 ? 's' : ''}
                                    </div>
                                </>
                            ) : (
                                <div style={{ fontSize: 11, color: colours.subtleGrey }}>
                                    {healthLoading ? 'Loading…' : 'Unavailable'}
                                </div>
                            )}
                        </div>

                        {/* Divider */}
                        <div style={{ height: 1, background: isDarkMode ? colours.dark.border : colours.highlightNeutral }} />

                        {/* Data freshness */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: textBody }}>
                            <span style={{
                                width: 6, height: 6, borderRadius: 999,
                                background: enquiriesLiveRefreshInFlight ? colours.highlight
                                    : enquiriesUsingSnapshot ? colours.orange
                                    : enquiriesLastLiveSyncAt ? colours.green
                                    : colours.subtleGrey
                            }} />
                            {enquiriesLiveRefreshInFlight ? 'Syncing…'
                                : enquiriesUsingSnapshot ? 'Snapshot (stale)'
                                : enquiriesLastLiveSyncAt
                                    ? (() => {
                                        const age = Math.round((Date.now() - enquiriesLastLiveSyncAt) / 1000);
                                        return age < 60 ? 'Live (just now)'
                                            : age < 3600 ? `Live (${Math.floor(age / 60)}m ago)`
                                            : `Live (${Math.floor(age / 3600)}h ago)`;
                                    })()
                                    : 'Awaiting sync'}
                        </div>

                        {/* Divider */}
                        <div style={{ height: 1, background: isDarkMode ? colours.dark.border : colours.highlightNeutral }} />

                        {/* Route status accordion */}
                        <div>
                            <div
                                style={{ ...toggleRow, padding: '8px 0', cursor: 'pointer', border: 'none', background: 'transparent', boxShadow: 'none' }}
                                onClick={() => setRouteExpanded(prev => !prev)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                                    <span style={{ width: 5, height: 5, borderRadius: 999, background: routeOverallDot, boxShadow: `0 0 4px ${routeOverallDot}88` }} />
                                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: isDarkMode ? colours.accent : colours.highlight }}>Routes</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                                        {routeResults.map(r => (
                                            <span key={r.env} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                <span style={{ width: 4, height: 4, borderRadius: 999, background: envDot(r) }} />
                                                <span style={{ fontSize: 9, color: textMuted }}>
                                                    {r.env === 'local' ? 'L' : 'P'}
                                                    {r.status === 'ok' && r.data ? `:${r.data.summary.healthy}/${r.data.summary.total}` : ''}
                                                </span>
                                            </span>
                                        ))}
                                    </span>
                                </div>
                                <svg
                                    width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                                    style={{ transition: 'transform 0.2s ease', transform: routeExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                >
                                    <path d="M6 9l6 6 6-6"/>
                                </svg>
                            </div>

                            <div style={{
                                maxHeight: routeExpanded ? 500 : 0,
                                opacity: routeExpanded ? 1 : 0,
                                overflow: 'hidden',
                                transition: 'max-height 0.25s ease, opacity 0.2s ease',
                            }}>
                                {routeResults.map(r => (
                                    <div key={r.env} style={{ marginBottom: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                            <span style={{ width: 5, height: 5, borderRadius: 999, background: envDot(r), flexShrink: 0 }} />
                                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: textPrimary }}>{r.env}</span>
                                            {r.status === 'ok' && r.data && (
                                                <span style={{ marginLeft: 'auto', fontSize: 9, color: textMuted }}>{r.data.summary.healthy}/{r.data.summary.total} · {r.data.durationMs}ms</span>
                                            )}
                                            {r.status === 'fail' && (
                                                <span style={{ marginLeft: 'auto', fontSize: 9, color: colours.cta }}>{r.error}</span>
                                            )}
                                            {r.status === 'loading' && (
                                                <span style={{ marginLeft: 'auto', fontSize: 9, color: textMuted, opacity: 0.6 }}>probing…</span>
                                            )}
                                        </div>
                                        {r.status === 'ok' && r.data && (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, paddingLeft: 12 }}>
                                                {r.data.checks.map(c => (
                                                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: textBody, padding: '1px 0' }}>
                                                        <span style={{ width: 4, height: 4, borderRadius: 999, background: c.status === 'healthy' ? colours.green : colours.cta, flexShrink: 0 }} />
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.name}</span>
                                                        {c.responseMs != null && <span style={{ fontSize: 8, color: textMuted, flexShrink: 0 }}>{c.responseMs}ms</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                                    <button
                                        onClick={() => { onRefreshRoutes(); showToast('Probing routes…', 'info'); }}
                                        style={{ ...tokens.actionBtn, fontSize: 9, padding: '3px 10px', width: 'auto' }}
                                        onMouseEnter={(e) => { tokens.applyRowHover(e.currentTarget); e.currentTarget.style.color = textPrimary; }}
                                        onMouseLeave={(e) => { tokens.resetRowHover(e.currentTarget); e.currentTarget.style.color = textBody; }}
                                    >
                                        ↻ refresh
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemStatusSection;
