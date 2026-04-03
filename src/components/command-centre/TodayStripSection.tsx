import React, { useEffect, useState, useRef } from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens } from './types';

interface TodayStripProps {
    tokens: CommandCentreTokens;
    userInitials: string;
    sessionStartMs: number;
}

interface TodaySummary {
    hoursLogged: number;
    hoursTarget: number;
    activeMatterCount: number;
}

const TodayStripSection: React.FC<TodayStripProps> = ({ tokens, userInitials, sessionStartMs }) => {
    const { isDarkMode, textPrimary, textMuted, borderLight } = tokens;
    const [summary, setSummary] = useState<TodaySummary | null>(null);
    const [sessionElapsed, setSessionElapsed] = useState('');
    const fetchedRef = useRef(false);

    // Fetch today summary on mount
    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const today = new Date().toISOString().slice(0, 10);
        const controller = new AbortController();

        (async () => {
            try {
                const res = await fetch(
                    `/api/collected-time?userInitials=${encodeURIComponent(userInitials)}&dateFrom=${today}&dateTo=${today}`,
                    { signal: controller.signal }
                );
                if (!res.ok) throw new Error('fetch failed');
                const data = await res.json();
                const rows: Array<{ quantity?: number }> = Array.isArray(data) ? data : data?.data ?? [];
                const totalHours = rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
                setSummary({ hoursLogged: totalHours, hoursTarget: 6, activeMatterCount: 0 });
            } catch {
                // Fail silently — strip just won't show hours
                setSummary({ hoursLogged: 0, hoursTarget: 6, activeMatterCount: 0 });
            }
        })();

        return () => controller.abort();
    }, [userInitials]);

    // Session elapsed timer
    useEffect(() => {
        const tick = () => {
            const diff = Math.floor((Date.now() - sessionStartMs) / 1000);
            if (diff < 60) setSessionElapsed(`${diff}s`);
            else if (diff < 3600) setSessionElapsed(`${Math.floor(diff / 60)}m`);
            else setSessionElapsed(`${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`);
        };
        tick();
        const id = setInterval(tick, 30_000);
        return () => clearInterval(id);
    }, [sessionStartMs]);

    const todayFormatted = new Date().toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
    });

    const hoursPct = summary ? Math.min((summary.hoursLogged / summary.hoursTarget) * 100, 100) : 0;
    const hoursColour = !summary ? textMuted
        : summary.hoursLogged >= summary.hoursTarget ? colours.green
        : summary.hoursLogged >= summary.hoursTarget * 0.5 ? colours.orange
        : colours.cta;

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px',
            background: isDarkMode ? colours.darkBlue : colours.grey,
            border: `1px solid ${borderLight}`,
            borderRadius: 0,
            marginBottom: 4,
        }}>
            {/* Date */}
            <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: textPrimary }}>{todayFormatted}</span>
                <span style={{ fontSize: 8, fontWeight: 500, color: textMuted, opacity: 0.6 }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 2, verticalAlign: '-1px' }}>
                        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                    </svg>
                    {sessionElapsed || '—'}
                </span>
            </div>

            {/* Separator */}
            <div style={{ width: 1, height: 24, background: borderLight, flexShrink: 0 }} />

            {/* Hours bar */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Hours</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: hoursColour, letterSpacing: '-0.2px' }}>
                        {summary ? `${summary.hoursLogged.toFixed(1)}` : '—'}
                        <span style={{ fontWeight: 500, color: textMuted, fontSize: 9 }}> / {summary?.hoursTarget ?? 6}h</span>
                    </span>
                </div>
                <div style={{
                    height: 4, width: '100%',
                    background: isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(54, 144, 206, 0.08)',
                    borderRadius: 0, overflow: 'hidden',
                }}>
                    <div style={{
                        height: '100%', width: `${hoursPct}%`,
                        background: hoursColour,
                        transition: 'width 0.6s ease, background 0.3s ease',
                    }} />
                </div>
            </div>
        </div>
    );
};

export default TodayStripSection;
