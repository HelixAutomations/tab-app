import React, { useState } from 'react';
import { UserData } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens } from './types';

interface AdminControlsSectionProps {
    tokens: CommandCentreTokens;
    user: UserData;
    canSwitchUser: boolean;
    onUserChange?: (user: UserData) => void;
    availableUsers?: UserData[] | null;
    onToggleDemoMode?: (enabled: boolean) => void;
    demoModeEnabled: boolean;
    onOpenReleaseNotesModal?: () => void;
    closePopover: () => void;
}

const AdminControlsSection: React.FC<AdminControlsSectionProps> = ({
    tokens,
    user,
    canSwitchUser,
    onUserChange,
    availableUsers,
    onToggleDemoMode,
    demoModeEnabled,
    onOpenReleaseNotesModal,
    closePopover,
}) => {
    const [collapsed, setCollapsed] = useState(true);
    const [isHeaderHovered, setIsHeaderHovered] = useState(false);
    const {
        isDarkMode, textPrimary, textMuted, borderLight, controlRowBg,
        sectionTitle, toggleRow, toggleSwitch, toggleKnob,
        applyRowHover, resetRowHover, showToast,
    } = tokens;

    return (
        <div style={{ marginBottom: 20 }}>
            <div style={sectionTitle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                Admin
            </div>

            <div style={{
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
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    <span style={{ fontSize: '11px', color: textMuted, flex: 1 }}>User &amp; access controls</span>
                    <svg
                        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2.5"
                        style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
                    >
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </div>

                <div style={{
                    maxHeight: collapsed ? 0 : 600,
                    opacity: collapsed ? 0 : 1,
                    overflow: 'hidden',
                    transition: 'max-height 0.25s ease, opacity 0.2s ease, padding 0.25s ease',
                    padding: collapsed ? '0 14px' : '0 14px 12px 14px',
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {onUserChange && availableUsers && (
                            <div style={{ opacity: canSwitchUser ? 1 : 0.75 }}>
                                <div style={{ ...sectionTitle, color: textMuted, marginBottom: 6 }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                    </svg>
                                    Switch User
                                    {!canSwitchUser && (
                                        <span style={{ marginLeft: 'auto', fontSize: 10, color: textMuted }}>Admin only</span>
                                    )}
                                </div>
                                <select
                                    disabled={!canSwitchUser}
                                    onChange={(e) => {
                                        const sel = availableUsers.find(u => u.Initials === e.target.value);
                                        if (sel) {
                                            onUserChange(sel);
                                            showToast(`Switched to ${sel.FullName || sel.Initials}`, 'success');
                                        }
                                    }}
                                    style={{
                                        width: '100%', padding: '10px 12px',
                                        background: controlRowBg,
                                        color: canSwitchUser ? textPrimary : textMuted,
                                        border: `1px solid ${borderLight}`,
                                        borderRadius: '2px', fontSize: 11,
                                        cursor: canSwitchUser ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    <option value="">{canSwitchUser ? 'Select user...' : 'Admin only'}</option>
                                    {canSwitchUser && availableUsers
                                        .filter(u => !u.status || u.status.toLowerCase() === 'active')
                                        .map(u => (
                                            <option key={u.Initials} value={u.Initials}>
                                                {u.FullName || `${u.First || ''} ${u.Last || ''}`}
                                            </option>
                                        ))}
                                </select>
                            </div>
                        )}

                        {onOpenReleaseNotesModal && (
                            <div
                                style={toggleRow}
                                onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                                onMouseLeave={(e) => resetRowHover(e.currentTarget)}
                                onClick={() => { showToast('Opening release notes', 'info'); onOpenReleaseNotesModal(); closePopover(); }}
                            >
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Release Notes</div>
                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Platform updates and improvements</div>
                                </div>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                    <path d="M9 18l6-6-6-6"/>
                                </svg>
                            </div>
                        )}

                        {onToggleDemoMode && (
                            <div
                                style={toggleRow}
                                onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                                onMouseLeave={(e) => resetRowHover(e.currentTarget)}
                                onClick={() => {
                                    const next = !demoModeEnabled;
                                    onToggleDemoMode(next);
                                    showToast(next ? 'Demo mode enabled' : 'Demo mode disabled', next ? 'success' : 'warning');
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary }}>Demo mode</div>
                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Skip live refresh &amp; seed demo prospect cases</div>
                                </div>
                                <div style={toggleSwitch(!!demoModeEnabled)}>
                                    <div style={toggleKnob(!!demoModeEnabled)} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminControlsSection;
