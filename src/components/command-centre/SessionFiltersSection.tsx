import React, { useState } from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens, AVAILABLE_AREAS, aowColour } from './types';

/** SVG icons for Areas of Work — replaces emojis for cross-platform consistency */
const AowIcon: React.FC<{ area: string; colour: string }> = ({ area, colour }) => {
    const a = area.toLowerCase();
    const props = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: colour, strokeWidth: 1.8 };
    if (a.includes('commercial')) return (
        <svg {...props}><rect x="4" y="2" width="16" height="20" rx="1"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><rect x="9" y="18" width="6" height="4"/></svg>
    );
    if (a.includes('construction')) return (
        <svg {...props}><path d="M2 20h20"/><path d="M5 20V8l7-5 7 5v12"/><line x1="9" y1="20" x2="9" y2="12"/><line x1="15" y1="20" x2="15" y2="12"/></svg>
    );
    if (a.includes('property')) return (
        <svg {...props}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    );
    if (a.includes('employment')) return (
        <svg {...props}><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
    );
    return (
        <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    );
};

interface SessionFiltersSectionProps {
    tokens: CommandCentreTokens;
    isLocalDev: boolean;
    onAreasChange?: (areas: string[]) => void;
    onFeatureToggle?: (feature: string, enabled: boolean) => void;
    featureToggles: Record<string, boolean>;
    areasOfWork: string[];
    setAreasOfWork: React.Dispatch<React.SetStateAction<string[]>>;
}

const SessionFiltersSection: React.FC<SessionFiltersSectionProps> = ({
    tokens,
    isLocalDev,
    onAreasChange,
    onFeatureToggle,
    featureToggles,
    areasOfWork,
    setAreasOfWork,
}) => {
    const {
        isDarkMode, bg, textPrimary, textMuted, ctaPrimary,
        sectionTitle, toggleRow, toggleSwitch, toggleKnob,
        applyRowHover, resetRowHover, showToast,
    } = tokens;

    return (
        <div style={{ marginBottom: 20 }}>
            <div style={sectionTitle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round"/>
                </svg>
                Session Filters
            </div>
            <div style={{
                background: isDarkMode ? colours.darkBlue : colours.grey,
                border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                borderRadius: '2px', padding: 12,
            }}>
                {isLocalDev && !featureToggles.viewAsProd && onFeatureToggle && (
                    <div
                        style={{ ...toggleRow, marginBottom: onAreasChange ? 10 : 0 }}
                        onMouseEnter={(e) => applyRowHover(e.currentTarget)}
                        onMouseLeave={(e) => resetRowHover(e.currentTarget)}
                        onClick={() => {
                            const next = !(featureToggles.showPhasedOutCustomTab ?? false);
                            onFeatureToggle('showPhasedOutCustomTab', next);
                            showToast(next ? 'Custom tab visible' : 'Custom tab hidden', next ? 'success' : 'warning');
                        }}
                    >
                        <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Show Custom (phased out) tab
                                {(featureToggles.showPhasedOutCustomTab ?? false) && (
                                    <span style={{ fontSize: 9, background: textMuted, color: bg, padding: '1px 5px', borderRadius: '2px', fontWeight: 700 }}>ON</span>
                                )}
                            </div>
                            <div style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>Toggle phased-out Custom tab visibility in navigation</div>
                        </div>
                        <div style={toggleSwitch(!!(featureToggles.showPhasedOutCustomTab ?? false))}>
                            <div style={toggleKnob(!!(featureToggles.showPhasedOutCustomTab ?? false))} />
                        </div>
                    </div>
                )}

                {onAreasChange && (
                    <>
                        <div style={{ fontSize: 10, fontWeight: 500, color: textMuted, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                            <span>Areas of Work</span>
                            <span style={{ opacity: 0.7 }}>{areasOfWork.length > 0 ? `${areasOfWork.length} active` : 'All'}</span>
                        </div>
                        <div style={{ display: 'grid', gap: 2 }}>
                            {AVAILABLE_AREAS.map(area => {
                                const checked = areasOfWork.includes(area);
                                const areaCol = aowColour(area, isDarkMode);
                                return (
                                    <label key={area} style={{
                                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                                        padding: '6px 8px',
                                        background: checked
                                            ? (isDarkMode ? `linear-gradient(90deg, ${areaCol}0a 0%, transparent 60%)` : `linear-gradient(90deg, ${areaCol}08 0%, transparent 60%)`)
                                            : 'transparent',
                                        borderRadius: 0,
                                        borderLeft: `3px solid ${checked ? areaCol : 'transparent'}`,
                                        borderTop: `1px solid ${checked ? `${areaCol}20` : 'transparent'}`,
                                        borderRight: `1px solid ${checked ? `${areaCol}20` : 'transparent'}`,
                                        borderBottom: `1px solid ${checked ? `${areaCol}20` : 'transparent'}`,
                                        transition: 'all 0.15s ease',
                                    }}>
                                        <span style={{
                                            width: 5, height: 5, borderRadius: '50%',
                                            background: areaCol, opacity: checked ? 1 : 0.25,
                                            flexShrink: 0, transition: 'opacity 0.15s ease',
                                        }} />
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => {
                                                const newAreas = e.target.checked
                                                    ? [...areasOfWork, area]
                                                    : areasOfWork.filter(a => a !== area);
                                                setAreasOfWork(newAreas);
                                                onAreasChange(newAreas);
                                            }}
                                            style={{ display: 'none' }}
                                        />
                                        <AowIcon area={area} colour={checked ? areaCol : textMuted} />
                                        <span style={{ fontSize: 11, fontWeight: 500, color: checked ? textPrimary : textMuted, flex: 1 }}>{area}</span>
                                        {checked && <span style={{ fontSize: 7, fontWeight: 600, color: areaCol, opacity: 0.7 }}>ON</span>}
                                    </label>
                                );
                            })}
                        </div>
                        {areasOfWork.length > 0 && (
                            <button
                                onClick={() => { setAreasOfWork([]); onAreasChange([]); }}
                                style={{
                                    width: '100%', marginTop: 8, padding: '6px 8px',
                                    background: 'transparent', color: ctaPrimary,
                                    border: `1px solid ${ctaPrimary}30`, borderRadius: '2px',
                                    fontSize: 10, fontWeight: 500, cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = `${ctaPrimary}10`; e.currentTarget.style.borderColor = ctaPrimary; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = `${ctaPrimary}30`; }}
                            >
                                Clear All Filters
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default SessionFiltersSection;
