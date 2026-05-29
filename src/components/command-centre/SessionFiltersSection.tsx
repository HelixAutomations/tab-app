import React from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens, AVAILABLE_AREAS } from './types';
import IconAreaFilter from '../filter/IconAreaFilter';

interface SessionFiltersSectionProps {
    tokens: CommandCentreTokens;
    onAreasChange?: (areas: string[]) => void;
    areasOfWork: string[];
    setAreasOfWork: React.Dispatch<React.SetStateAction<string[]>>;
    /** The user's profile default AoWs. When `areasOfWork` deviates from
     *  this set, a "Reset to my profile" affordance appears so the user can
     *  return to their baseline scope. */
    defaultAreasOfWork?: string[];
    availableAreas?: string[];
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
    availableAreas,
}) => {
    const { isDarkMode, sectionTitle } = tokens;

    if (!onAreasChange) return null;

    const filterAreas = availableAreas && availableAreas.length > 0 ? availableAreas : [...AVAILABLE_AREAS];
    const canReset = !!defaultAreasOfWork && !sameSet(areasOfWork, defaultAreasOfWork);

    const commit = (next: string[]) => {
        const allowed = new Set(filterAreas);
        const scopedNext = next.filter(area => allowed.has(area));
        const fallback = defaultAreasOfWork && defaultAreasOfWork.length > 0 ? defaultAreasOfWork : filterAreas;
        const safeNext = scopedNext.length > 0 ? scopedNext : fallback;
        if (sameSet(areasOfWork, safeNext)) return;
        setAreasOfWork(safeNext);
        onAreasChange(safeNext);
    };

    const handleReset = () => {
        if (!defaultAreasOfWork) return;
        commit(defaultAreasOfWork);
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

            <div style={{ display: 'flex', alignItems: 'center', minHeight: 30 }}>
                <IconAreaFilter
                    selectedAreas={areasOfWork}
                    availableAreas={filterAreas}
                    onAreaChange={commit}
                    ariaLabel="Set session Areas of Work"
                    variant="glyph"
                />
            </div>
        </div>
    );
};

export default SessionFiltersSection;
