import React, { useState, useCallback } from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens } from './types';

const HELIX_NEXT_PREVIEW_PATH = '/side-projects/helix-next/index.html';

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

interface CompactFeatureToggle {
    key: string;
    label: string;
    hint: string;
    enabled: boolean;
    accent: string;
    onClick: () => void;
}

interface SectionBlockProps {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    isDarkMode: boolean;
}

const SectionBlock: React.FC<SectionBlockProps> = ({ title, subtitle, children, isDarkMode }) => (
    <div style={{
        display: 'grid',
        gap: 8,
        padding: '10px',
        border: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`,
        background: isDarkMode ? 'rgba(13, 47, 96, 0.12)' : 'rgba(54, 144, 206, 0.03)',
    }}>
        <div style={{ display: 'grid', gap: 4 }}>
            <div style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: isDarkMode ? colours.accent : colours.highlight,
            }}>
                {title}
            </div>
            {subtitle && (
                <div style={{
                    fontSize: 10,
                    lineHeight: 1.45,
                    color: isDarkMode ? '#9ca3af' : colours.greyText,
                }}>
                    {subtitle}
                </div>
            )}
        </div>
        {children}
    </div>
);

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
    const {
        isDarkMode, bg, textPrimary, textMuted, accentPrimary,
        toggleRow, actionBtn, toggleSwitch, toggleKnob,
        applyRowHover, resetRowHover, showToast,
    } = tokens;

    const textBody = isDarkMode ? '#d1d5db' : '#374151';

    const openHelixNextPreview = useCallback(() => {
        const previewUrl = `${window.location.origin}${HELIX_NEXT_PREVIEW_PATH}`;
        const openedWindow = window.open(previewUrl, '_blank', 'noopener,noreferrer');

        if (!openedWindow) {
            window.location.assign(HELIX_NEXT_PREVIEW_PATH);
        }

        showToast('Opening Helix Next lab', 'success');
        closePopover();
    }, [closePopover, showToast]);

    const launcherButtonStyle: React.CSSProperties = {
        ...actionBtn,
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '10px 12px',
        minHeight: 62,
    };

    const homeSurfaceToggles: CompactFeatureToggle[] = onFeatureToggle ? [
        {
            key: 'showAttendance',
            label: 'Attendance',
            hint: 'Home team strip',
            enabled: !!featureToggles.showAttendance,
            accent: colours.green,
            onClick: () => {
                const next = !featureToggles.showAttendance;
                onFeatureToggle('showAttendance', next);
                showToast(next ? 'Attendance visible' : 'Attendance hidden', next ? 'success' : 'warning');
            },
        },
        {
            key: 'showHomeOpsCclDates',
            label: 'Show CCL',
            hint: 'Home ops dates box',
            enabled: !!featureToggles.showHomeOpsCclDates,
            accent: isDarkMode ? colours.accent : colours.blue,
            onClick: () => {
                const next = !featureToggles.showHomeOpsCclDates;
                onFeatureToggle('showHomeOpsCclDates', next);
                showToast(next ? 'Home CCL dates visible' : 'Home CCL dates hidden', next ? 'success' : 'warning');
            },
        },
        {
            key: 'forceShowOpsQueue',
            label: 'Ops Queue',
            hint: 'Override role gate',
            enabled: !!featureToggles.forceShowOpsQueue,
            accent: colours.cta,
            onClick: () => {
                const next = !featureToggles.forceShowOpsQueue;
                onFeatureToggle('forceShowOpsQueue', next);
                showToast(next ? 'Ops queue forced visible' : 'Ops queue role-gated', next ? 'success' : 'warning');
            },
        },
    ] : [];

    const previewActions = [
        {
            key: 'helix-next',
            title: 'Helix Next Lab',
            hint: 'Open the next-gen Helix Law experience sandbox.',
            accent: isDarkMode ? colours.accent : colours.blue,
            onClick: openHelixNextPreview,
        },
    ];

    const debugActions = [
        {
            key: 'dev-dashboard',
            title: 'Dev Dashboard',
            hint: 'Open the internal diagnostics dashboard.',
            onClick: onDevDashboard,
        },
        {
            key: 'loading-debug',
            title: 'Loading Debug',
            hint: 'Exercise boot and loading surfaces.',
            onClick: onLoadingDebug,
        },
        {
            key: 'error-tracker',
            title: 'Error Tracker',
            hint: 'Inspect runtime errors and traces.',
            onClick: onErrorTracker,
        },
        {
            key: 'replay-animations',
            title: 'Replay Animations',
            hint: 'Re-run Home metric motion.',
            onClick: () => {
                showToast('Replaying Home animations', 'info');
                window.dispatchEvent(new CustomEvent('replayHomeAnimations'));
            },
        },
    ];

    const operationsActions = [
        {
            key: 'rate-change',
            title: 'Rate Change Tracker',
            hint: 'Open Jan 2026 rate notifications.',
            onClick: () => {
                showToast('Opening rate change tracker', 'info');
                window.dispatchEvent(new CustomEvent('openRateChangeModal'));
                closePopover();
            },
        },
        {
            key: 'prompt-seeds',
            title: 'Prompt Seeds',
            hint: 'Open local prompt and demo seed packs.',
            onClick: () => {
                showToast('Opening local prompt seeds', 'info');
                onDemoPrompts();
                closePopover();
            },
        },
        {
            key: 'migration-tool',
            title: 'Pipeline Migration',
            hint: 'Migrate legacy Clio matters into the pipeline.',
            onClick: () => {
                showToast('Opening migration tool', 'info');
                onMigrationTool();
            },
        },
    ];

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
                <div style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '11px', color: textMuted }}>Labs &amp; debug</span>
                    <span style={{ fontSize: '10px', color: isDarkMode ? '#9ca3af' : colours.greyText, opacity: collapsed ? 0 : 0.82 }}>
                        Previews, health, debug panels, and local ops controls.
                    </span>
                </div>
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
                    <SectionBlock
                        title="Experience previews"
                        subtitle="Permanent launch points for adjacent product labs and internal preview flows."
                        isDarkMode={isDarkMode}
                    >
                        <div style={{ display: 'grid', gap: 6 }}>
                            {previewActions.map((action) => (
                                <button
                                    key={action.key}
                                    onClick={action.onClick}
                                    style={{
                                        ...launcherButtonStyle,
                                        background: isDarkMode ? `${action.accent}14` : `${action.accent}0d`,
                                        border: `1px solid ${isDarkMode ? `${action.accent}44` : `${action.accent}33`}`,
                                        boxShadow: `0 8px 18px ${action.accent}18`,
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                        e.currentTarget.style.boxShadow = `0 10px 22px ${action.accent}22`;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = `0 8px 18px ${action.accent}18`;
                                    }}
                                >
                                    <div style={{ display: 'grid', gap: 4, textAlign: 'left', minWidth: 0 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: textPrimary }}>{action.title}</span>
                                        <span style={{ fontSize: 10, lineHeight: 1.45, color: textMuted }}>{action.hint}</span>
                                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: action.accent }}>
                                            /side-projects/helix-next/index.html
                                        </span>
                                    </div>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                                        <path d="M7 17L17 7"/><path d="M8 7h9v9"/>
                                    </svg>
                                </button>
                            ))}

                            {onOpenDemoMatter && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                    <button onClick={() => onOpenDemoMatter(false)} style={actionBtn}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                                        Demo matter
                                    </button>
                                    <button onClick={() => onOpenDemoMatter(true)} style={{ ...actionBtn, color: colours.accent, borderColor: isDarkMode ? 'rgba(135, 243, 243, 0.18)' : 'rgba(54, 144, 206, 0.18)' }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                                        Demo CCL
                                    </button>
                                </div>
                            )}
                        </div>
                    </SectionBlock>

                    <SectionBlock
                        title="Debug panels"
                        subtitle="Direct entry points into the main internal diagnostics surfaces."
                        isDarkMode={isDarkMode}
                    >
                        <div style={{ display: 'grid', gap: 6 }}>
                            {debugActions.map((action, index) => (
                                <button
                                    key={action.key}
                                    onClick={action.onClick}
                                    style={{
                                        ...launcherButtonStyle,
                                        background: index === 0 ? accentPrimary : actionBtn.background,
                                        color: index === 0 ? '#fff' : textBody,
                                        border: index === 0 ? `1px solid ${accentPrimary}` : actionBtn.border,
                                    }}
                                    onMouseEnter={(e) => {
                                        if (index === 0) {
                                            e.currentTarget.style.filter = 'brightness(0.9)';
                                            return;
                                        }
                                        applyRowHover(e.currentTarget);
                                        e.currentTarget.style.color = textPrimary;
                                    }}
                                    onMouseLeave={(e) => {
                                        if (index === 0) {
                                            e.currentTarget.style.filter = 'none';
                                            return;
                                        }
                                        resetRowHover(e.currentTarget);
                                        e.currentTarget.style.color = textBody;
                                    }}
                                >
                                    <div style={{ display: 'grid', gap: 4, textAlign: 'left', minWidth: 0 }}>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: index === 0 ? '#fff' : textPrimary }}>{action.title}</span>
                                        <span style={{ fontSize: 10, lineHeight: 1.45, color: index === 0 ? 'rgba(255,255,255,0.82)' : textMuted }}>{action.hint}</span>
                                    </div>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={index === 0 ? 'rgba(255,255,255,0.78)' : textMuted} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                                </button>
                            ))}
                        </div>
                    </SectionBlock>

                    {homeSurfaceToggles.length > 0 && (
                        <SectionBlock
                            title="Home realtime controls"
                            subtitle="Tight local overrides for the Home operational surface."
                            isDarkMode={isDarkMode}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <span style={{ fontSize: 10, color: textMuted }}>
                                    {homeSurfaceToggles.filter(toggle => toggle.enabled).length}/{homeSurfaceToggles.length} live
                                </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: 6 }}>
                                {homeSurfaceToggles.map((toggle) => {
                                    const activeBackground = isDarkMode ? `${toggle.accent}18` : `${toggle.accent}0f`;
                                    const activeBorder = isDarkMode ? `${toggle.accent}44` : `${toggle.accent}33`;

                                    return (
                                        <button
                                            key={toggle.key}
                                            onClick={toggle.onClick}
                                            style={{
                                                ...actionBtn,
                                                width: '100%',
                                                minHeight: 66,
                                                padding: '10px 11px',
                                                alignItems: 'flex-start',
                                                justifyContent: 'space-between',
                                                gap: 8,
                                                background: toggle.enabled ? activeBackground : actionBtn.background,
                                                border: `1px solid ${toggle.enabled ? activeBorder : isDarkMode ? colours.dark.border : colours.highlightNeutral}`,
                                                boxShadow: toggle.enabled ? `0 8px 18px ${toggle.accent}18` : 'none',
                                                transition: 'transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease',
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'translateY(-1px)';
                                                e.currentTarget.style.boxShadow = toggle.enabled ? `0 10px 22px ${toggle.accent}22` : (isDarkMode ? '0 8px 16px rgba(0, 0, 0, 0.22)' : '0 8px 16px rgba(6, 23, 51, 0.08)');
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = toggle.enabled ? `0 8px 18px ${toggle.accent}18` : 'none';
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: textPrimary, lineHeight: 1.2 }}>{toggle.label}</div>
                                                    <div style={{ fontSize: 10, color: textMuted, marginTop: 4, lineHeight: 1.3 }}>{toggle.hint}</div>
                                                </div>
                                                <span style={{
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: '50%',
                                                    flexShrink: 0,
                                                    background: toggle.enabled ? toggle.accent : textMuted,
                                                    boxShadow: toggle.enabled ? `0 0 8px ${toggle.accent}66` : 'none',
                                                    marginTop: 2,
                                                }} />
                                            </div>
                                            <span style={{
                                                fontSize: 9,
                                                fontWeight: 700,
                                                letterSpacing: '0.08em',
                                                textTransform: 'uppercase',
                                                color: toggle.enabled ? toggle.accent : textMuted,
                                            }}>
                                                {toggle.enabled ? 'On' : 'Off'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </SectionBlock>
                    )}

                    <SectionBlock
                        title="Ops tools"
                        subtitle="Internal tools that are useful during local debugging and workflow validation."
                        isDarkMode={isDarkMode}
                    >
                        <div style={{ display: 'grid', gap: 6 }}>
                            {operationsActions.map((action) => (
                                <button
                                    key={action.key}
                                    onClick={action.onClick}
                                    style={launcherButtonStyle}
                                    onMouseEnter={(e) => {
                                        applyRowHover(e.currentTarget);
                                        e.currentTarget.style.color = textPrimary;
                                    }}
                                    onMouseLeave={(e) => {
                                        resetRowHover(e.currentTarget);
                                        e.currentTarget.style.color = textBody;
                                    }}
                                >
                                    <div style={{ display: 'grid', gap: 4, textAlign: 'left', minWidth: 0 }}>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: textPrimary }}>{action.title}</span>
                                        <span style={{ fontSize: 10, lineHeight: 1.45, color: textMuted }}>{action.hint}</span>
                                    </div>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                                </button>
                            ))}
                        </div>
                    </SectionBlock>
                </div>
            </div>
        </div>
    );
};

export default LocalDevSection;
