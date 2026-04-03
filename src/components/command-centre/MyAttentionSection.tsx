import React, { useEffect, useState, useRef, useCallback } from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens } from './types';

interface AttentionItem {
    id: string;
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    onClick?: () => void;
    colour: string;
}

interface MyAttentionSectionProps {
    tokens: CommandCentreTokens;
    userInitials: string;
}

const MyAttentionSection: React.FC<MyAttentionSectionProps> = ({ tokens, userInitials }) => {
    const { isDarkMode, textPrimary, textMuted, borderLight, applyInsetHover, resetInsetHover } = tokens;
    const [items, setItems] = useState<AttentionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const fetchedRef = useRef(false);

    const navigateTo = useCallback((eventName: string, detail?: Record<string, unknown>) => {
        try {
            window.dispatchEvent(new CustomEvent(eventName, detail ? { detail } : undefined));
        } catch { /* swallow */ }
    }, []);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;

        const controller = new AbortController();

        (async () => {
            const attention: AttentionItem[] = [];

            // Check attendance
            try {
                const today = new Date().toISOString().slice(0, 10);
                const res = await fetch(
                    `/api/attendance?date=${today}&initials=${encodeURIComponent(userInitials)}`,
                    { signal: controller.signal }
                );
                if (res.ok) {
                    const data = await res.json();
                    const confirmed = data?.confirmed ?? data?.isConfirmed ?? false;
                    if (!confirmed) {
                        attention.push({
                            id: 'attendance',
                            title: 'Confirm Attendance',
                            subtitle: 'Not yet confirmed today',
                            colour: colours.cta,
                            icon: (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colours.cta} strokeWidth="2">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                                </svg>
                            ),
                            onClick: () => navigateTo('navigateToHome'),
                        });
                    }
                }
            } catch { /* silently skip */ }

            // Check pending instructions (CCLs, matters to open, etc.)
            try {
                const res = await fetch(
                    `/api/instructions?initials=${encodeURIComponent(userInitials)}&pending=true`,
                    { signal: controller.signal }
                );
                if (res.ok) {
                    const data = await res.json();
                    const pending = Array.isArray(data) ? data : data?.data ?? [];
                    if (pending.length > 0) {
                        const grouped: Record<string, number> = {};
                        for (const p of pending) {
                            const stage = String(p.Stage || 'Review').trim();
                            grouped[stage] = (grouped[stage] || 0) + 1;
                        }
                        for (const [stage, count] of Object.entries(grouped)) {
                            attention.push({
                                id: `instruction-${stage}`,
                                title: stage,
                                subtitle: count === 1 ? '1 instruction' : `${count} instructions`,
                                colour: colours.blue,
                                icon: (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colours.blue} strokeWidth="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                                    </svg>
                                ),
                                onClick: () => navigateTo('navigateToInstructions'),
                            });
                        }
                    }
                }
            } catch { /* silently skip */ }

            setItems(attention);
            setLoading(false);
        })();

        return () => controller.abort();
    }, [userInitials, navigateTo]);

    if (loading) {
        return (
            <div style={{ marginBottom: 20 }}>
                <div style={tokens.sectionTitle}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    My Attention
                </div>
                <div style={{
                    height: 40,
                    background: isDarkMode ? colours.darkBlue : colours.grey,
                    border: `1px solid ${borderLight}`,
                    borderRadius: 0,
                    animation: 'userBubbleToastPulse 1.5s ease-in-out infinite alternate',
                }} />
            </div>
        );
    }

    return (
        <div style={{ marginBottom: 20 }}>
            <div style={tokens.sectionTitle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                My Attention
            </div>

            {items.length === 0 ? (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px',
                    background: isDarkMode ? colours.darkBlue : colours.grey,
                    border: `1px solid ${borderLight}`,
                    borderRadius: 0,
                    fontSize: 11, fontWeight: 500, color: textMuted,
                }}>
                    <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: colours.green,
                        boxShadow: `0 0 4px ${colours.green}60`,
                        flexShrink: 0,
                    }} />
                    All clear
                </div>
            ) : (
                <div style={{
                    background: isDarkMode ? colours.darkBlue : colours.grey,
                    border: `1px solid ${borderLight}`,
                    borderRadius: 0,
                    overflow: 'hidden',
                }}>
                    {items.map((item, i) => (
                        <div
                            key={item.id}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 14px',
                                cursor: item.onClick ? 'pointer' : 'default',
                                borderTop: i > 0 ? `1px solid ${borderLight}` : 'none',
                                borderLeft: '3px solid transparent',
                                transition: 'all 0.15s ease',
                            }}
                            onClick={item.onClick}
                            onMouseEnter={(e) => item.onClick && applyInsetHover(e.currentTarget)}
                            onMouseLeave={(e) => item.onClick && resetInsetHover(e.currentTarget)}
                        >
                            {item.icon}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: textPrimary }}>{item.title}</div>
                                {item.subtitle && (
                                    <div style={{ fontSize: 9, fontWeight: 500, color: textMuted, marginTop: 1 }}>{item.subtitle}</div>
                                )}
                            </div>
                            {item.onClick && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
                                    <polyline points="9 18 15 12 9 6"/>
                                </svg>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MyAttentionSection;
