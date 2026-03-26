import React, { useState } from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens } from './types';

interface ProfileSectionProps {
    tokens: CommandCentreTokens;
    regularDetails: Array<{ label: string; value: string; isRate?: boolean; isRole?: boolean }>;
    copy: (text?: string) => Promise<void>;
}

const ProfileSection: React.FC<ProfileSectionProps> = ({ tokens, regularDetails, copy }) => {
    const [collapsed, setCollapsed] = useState(true);
    const [isHeaderHovered, setIsHeaderHovered] = useState(false);
    const { isDarkMode, borderLight, textPrimary, textMuted, applyInsetHover, resetInsetHover } = tokens;

    const filteredDetails = regularDetails.filter(d => !d.isRate && !d.isRole);
    if (filteredDetails.length === 0) return null;

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
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', cursor: 'pointer', transition: 'background 0.15s ease',
                    background: isHeaderHovered ? (isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)') : 'transparent',
                }}
                onMouseEnter={() => setIsHeaderHovered(true)}
                onMouseLeave={() => setIsHeaderHovered(false)}
                onClick={() => setCollapsed(prev => !prev)}
            >
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: textMuted, opacity: 0.8 }}>Profile</div>
                <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                    style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                >
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </div>

            <div style={{
                maxHeight: collapsed ? 0 : 500,
                opacity: collapsed ? 0 : 1,
                overflow: 'hidden',
                transition: 'max-height 0.25s ease, opacity 0.2s ease, padding 0.25s ease',
                padding: collapsed ? '0 12px' : '0 12px 12px 12px',
            }}>
                <div style={{ display: 'grid', gap: 2 }}>
                    {filteredDetails.map(d => (
                        <div
                            key={d.label}
                            style={{
                                display: 'flex', alignItems: 'center', padding: '7px 10px',
                                background: 'transparent',
                                borderTop: `1px solid ${borderLight}`,
                                borderRight: `1px solid ${borderLight}`,
                                borderBottom: `1px solid ${borderLight}`,
                                borderLeft: '3px solid transparent',
                                borderRadius: 0, gap: 8, transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => applyInsetHover(e.currentTarget)}
                            onMouseLeave={(e) => resetInsetHover(e.currentTarget)}
                        >
                            <span style={{ fontSize: 9, fontWeight: 600, color: textMuted, minWidth: 65, textTransform: 'uppercase', letterSpacing: 0.3 }}>{d.label}</span>
                            <span style={{ fontSize: 11, color: textPrimary, flex: 1, wordBreak: 'break-word' }}>{d.value}</span>
                            <button
                                onClick={() => copy(d.value)}
                                style={{
                                    background: 'transparent', border: 'none', color: textMuted,
                                    fontSize: 9, cursor: 'pointer', padding: '2px 4px',
                                    opacity: 0.5, transition: 'opacity 0.15s ease',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ProfileSection;
