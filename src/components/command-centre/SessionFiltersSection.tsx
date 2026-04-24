import React from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens, AVAILABLE_AREAS, aowColour } from './types';

/** Compact SVG icon per area */
const AowIcon: React.FC<{ area: string; colour: string; size?: number }> = ({ area, colour, size = 14 }) => {
    const a = area.toLowerCase();
    const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: colour, strokeWidth: 1.8 };
    if (a.includes('commercial')) return <svg {...p}><rect x="4" y="2" width="16" height="20" rx="1"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><rect x="9" y="18" width="6" height="4"/></svg>;
    if (a.includes('construction')) return <svg {...p}><path d="M2 20h20"/><path d="M5 20V8l7-5 7 5v12"/><line x1="9" y1="20" x2="9" y2="12"/><line x1="15" y1="20" x2="15" y2="12"/></svg>;
    if (a.includes('property')) return <svg {...p}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
    if (a.includes('employment')) return <svg {...p}><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>;
    return <svg {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>;
};

interface SessionFiltersSectionProps {
    tokens: CommandCentreTokens;
    onAreasChange?: (areas: string[]) => void;
    areasOfWork: string[];
    setAreasOfWork: React.Dispatch<React.SetStateAction<string[]>>;
    /** The user's profile default AoWs. When `areasOfWork` deviates from
     *  this set, a "Reset to my profile" affordance appears so the user can
     *  return to their baseline scope. */
    defaultAreasOfWork?: string[];
}

const sameSet = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    return b.every(x => s.has(x));
};

/**
 * "Working areas" picker — controls the Areas of Work that drive the user's
 * enquiries, matters and pickups for the rest of this session. This is a
 * scope override, not a transient filter: toggling it mutates the effective
 * user.AOW so every downstream tab reacts.
 */
const SessionFiltersSection: React.FC<SessionFiltersSectionProps> = ({
    tokens,
    onAreasChange,
    areasOfWork,
    setAreasOfWork,
    defaultAreasOfWork,
}) => {
    const { isDarkMode, textPrimary, textMuted, borderLight, sectionTitle } = tokens;

    if (!onAreasChange) return null;

    const canReset = !!defaultAreasOfWork && !sameSet(areasOfWork, defaultAreasOfWork);

    const commit = (next: string[]) => {
        setAreasOfWork(next);
        onAreasChange(next);
    };

    const handleReset = () => {
        if (!defaultAreasOfWork) return;
        commit(defaultAreasOfWork);
    };

    /** Short display labels */
    const shortLabel = (area: string): string => {
        const a = area.toLowerCase();
        if (a.includes('commercial')) return 'Comm';
        if (a.includes('construction')) return 'Const';
        if (a.includes('property')) return 'Prop';
        if (a.includes('employment')) return 'Emp';
        return 'Other';
    };

    return (
        <div style={{ marginBottom: 0 }}>
            <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Areas of work</span>
                {canReset && (
                    <button
                        type="button"
                        onClick={handleReset}
                        title="Return to your profile's default Areas of Work"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            color: isDarkMode ? colours.accent : colours.highlight,
                            fontSize: 9,
                            fontFamily: 'Raleway, sans-serif',
                            fontWeight: 600,
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                            cursor: 'pointer',
                        }}
                    >
                        Reset
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
                {AVAILABLE_AREAS.map(area => {
                    const checked = areasOfWork.includes(area);
                    const areaCol = aowColour(area, isDarkMode);
                    return (
                        <button
                            key={area}
                            title={area}
                            aria-label={`${area}${checked ? ' (included)' : ''}`}
                            aria-pressed={checked}
                            onClick={() => commit(checked ? areasOfWork.filter(a => a !== area) : [...areasOfWork, area])}
                            onMouseEnter={e => {
                                if (!checked) {
                                    e.currentTarget.style.background = isDarkMode ? `${areaCol}14` : `${areaCol}0D`;
                                    e.currentTarget.style.borderColor = areaCol;
                                }
                            }}
                            onMouseLeave={e => {
                                if (!checked) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.borderColor = borderLight;
                                }
                            }}
                            style={{
                                flex: '1 1 0',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                gap: 4, padding: '8px 4px',
                                background: checked
                                    ? (isDarkMode ? `${areaCol}1F` : `${areaCol}14`)
                                    : 'transparent',
                                border: `1px solid ${checked ? areaCol : borderLight}`,
                                borderRadius: 0,
                                cursor: 'pointer',
                                transition: 'background 0.15s ease, border-color 0.15s ease',
                            }}
                        >
                            <AowIcon area={area} colour={checked ? areaCol : textMuted} />
                            <span style={{
                                fontSize: 9,
                                fontWeight: checked ? 700 : 500,
                                color: checked ? textPrimary : textMuted,
                                letterSpacing: '0.3px',
                                textTransform: 'uppercase',
                                transition: 'color 0.15s ease',
                            }}>
                                {shortLabel(area)}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default SessionFiltersSection;
