import React from 'react';
import { Stack } from '@fluentui/react';
import PoidCard from '../PoidCard';
import { POID, TeamData } from '../../../app/functionality/types';

interface PoidSelectionStepProps {
    poidData: POID[];
    teamData?: TeamData[] | null;
    filteredPoidData: POID[];
    visiblePoidCount: number;
    selectedPoidIds: string[];
    poidSearchTerm: string;
    setPoidSearchTerm: (v: string) => void;
    poidGridRef: React.RefObject<HTMLDivElement | null>;
    handlePoidClick: (p: POID) => void;
    onConfirm?: () => void;
    pendingClientType: string;
    setPendingClientType: (type: string) => void;
    onClientTypeChange?: (newType: string, shouldLimitToSingle: boolean) => void;
}

// Animated transition for POID selection area
interface PoidSelectionTransitionProps {
    show: boolean;
    children: React.ReactNode;
}

const PoidSelectionTransition: React.FC<PoidSelectionTransitionProps> = ({ show, children }) => {
    const [visible, setVisible] = React.useState(show);
    const [render, setRender] = React.useState(show);
    React.useEffect(() => {
        if (show) {
            setRender(true);
            const t = window.setTimeout(() => setVisible(true), 10);
            return () => window.clearTimeout(t);
        } else {
            setVisible(false);
            const timeout = window.setTimeout(() => setRender(false), 400);
            return () => window.clearTimeout(timeout);
        }
    }, [show]);
    if (!render) return null;
    return (
        <div
            className={"poid-selection-animated" + (visible ? " visible" : "")}
            style={{
                maxHeight: visible ? 1200 : 0,
                opacity: visible ? 1 : 0,
                overflow: 'hidden',
                transition: 'max-height 0.5s cubic-bezier(.4,0,.2,1), opacity 0.4s cubic-bezier(.4,0,.2,1)',
                pointerEvents: visible ? 'auto' : 'none',
            }}
        >
            {children}
        </div>
    );
};

const PoidSelectionStep: React.FC<PoidSelectionStepProps> = ({
    poidData,
    teamData,
    filteredPoidData,
    visiblePoidCount,
    selectedPoidIds,
    poidSearchTerm,
    setPoidSearchTerm,
    poidGridRef,
    handlePoidClick,
    onConfirm,
    pendingClientType,
    setPendingClientType,
    onClientTypeChange,
}) => (
    <Stack tokens={{ childrenGap: 16 }}>
            {/* Client Type Question Section - Now First */}
            <div style={{ width: '100%', margin: 0, padding: 0, border: 'none', boxShadow: 'none', background: 'transparent' }}>
            <div style={{ padding: 0, background: 'transparent' }}>
                <div className="question-banner" style={{ width: '100%', boxSizing: 'border-box', margin: 0, marginBottom: 16 }}>What type of client is this matter for?</div>
                <div className="client-details-contact-bigrow" style={{ marginBottom: 8, display: 'flex', gap: 12 }}>
                    {[
                        { type: 'Individual', icon: 'Contact' },
                        { type: 'Company', icon: 'CityNext' },
                        { type: 'Multiple Individuals', icon: 'People' },
                        { type: 'Existing Client', icon: 'ContactHeart' }
                    ].map(({ type, icon }) => {
                        const isActive = pendingClientType === type;
                        return (
                            <button
                                key={type}
                                className={`client-details-contact-bigbtn client-type-icon-btn${isActive ? ' active' : ''}`}
                                type="button"
                                onClick={() => {
                                    // Handle client type switching logic
                                    const isSingleSelectionType = type !== 'Multiple Individuals';
                                    setPendingClientType(type);
                                    
                                    // Notify parent if we're switching to a single-selection type
                                    if (onClientTypeChange) {
                                        onClientTypeChange(type, isSingleSelectionType);
                                    }
                                }}
                                aria-pressed={isActive}
                                style={{
                                    position: 'relative',
                                    overflow: 'hidden',
                                    minWidth: 64,
                                    minHeight: 64,
                                    padding: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: isActive ? '#d6e8ff' : '#F4F4F6', // highlightBlue or helix grey
                                    border: isActive ? '2px solid #3690CE' : '2px solid #F4F4F6', // blue or helix grey
                                    boxShadow: undefined,
                                    transition: 'background 0.2s, border 0.2s',
                                    outline: 'none',
                                }}
                                onMouseDown={e => e.currentTarget.classList.add('pressed')}
                                onMouseUp={e => e.currentTarget.classList.remove('pressed')}
                                onMouseLeave={e => e.currentTarget.classList.remove('pressed')}
                            >
                                <span
                                    className="client-type-icon"
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        right: 0,
                                        top: 0,
                                        bottom: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 32,
                                        opacity: isActive ? 0 : 1,
                                        transition: 'opacity 0.25s cubic-bezier(.4,0,.2,1), transform 0.25s cubic-bezier(.4,0,.2,1), color 0.2s',
                                        zIndex: 1,
                                        color: isActive ? '#3690CE' : '#6B6B6B', // blue if active, grey if not
                                    }}
                                >
                                    <i className={`ms-Icon ms-Icon--${icon}`} aria-hidden="true" style={{ pointerEvents: 'none', color: isActive ? '#3690CE' : '#6B6B6B', transition: 'color 0.2s' }} />
                                </span>
                                <span
                                    className="client-type-label"
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        right: 0,
                                        top: 0,
                                        bottom: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 600,
                                        fontSize: 16,
                                        color: isActive ? '#3690CE' : '#6B6B6B',
                                        opacity: isActive ? 1 : 0,
                                        transform: isActive ? 'translateY(0)' : 'translateY(8px)',
                                        transition: 'opacity 0.25s cubic-bezier(.4,0,.2,1), transform 0.25s cubic-bezier(.4,0,.2,1), color 0.2s',
                                        zIndex: 2,
                                        pointerEvents: 'none',
                                    }}
                                >
                                    {type}
                                </span>
                            </button>
                        );
                    })}
                </div>
    <style>{`
        .client-type-icon-btn .client-type-label {
            pointer-events: none;
        }
        .client-type-icon-btn:not(.active):not(.pressed):not(:active):hover {
            background: #e3f0fc !important; /* subtle blue hover */
            border-color: #3690CE !important;
        }
        .client-type-icon-btn:not(.active):not(.pressed):not(:active):hover .client-type-icon,
        .client-type-icon-btn:not(.active):not(.pressed):not(:active):hover .client-type-icon i {
            color: #3690CE !important;
        }
        .client-type-icon-btn:not(.active):not(.pressed):not(:active):hover .client-type-label {
            color: #3690CE !important;
        }
        .client-type-icon-btn.pressed,
        .client-type-icon-btn:active {
            background: #b3d3f7 !important; /* deeper blue for press */
            border-color: #1565c0 !important;
        }
        /* Remove hover/focus label reveal, only show label for active */
        
        /* Animation for POID cards */
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        /* Stagger animation for cards */
        .poid-grid > div:nth-child(1) { animation-delay: 0ms; }
        .poid-grid > div:nth-child(2) { animation-delay: 100ms; }
        .poid-grid > div:nth-child(3) { animation-delay: 200ms; }
        .poid-grid > div:nth-child(4) { animation-delay: 300ms; }
        .poid-grid > div:nth-child(5) { animation-delay: 400ms; }
        .poid-grid > div:nth-child(6) { animation-delay: 500ms; }
    `}</style>
                {/* Removed preselected client type hints for a cleaner UI */}
            </div>
        </div>

        {/* Show POID selection only after client type is chosen */}
        <PoidSelectionTransition show={!!pendingClientType}>
            {pendingClientType && (
                <>
                    <div className="question-banner">Select Client(s)</div>
                    {/* POID Grid - Changed from 3 to 2 columns with auto-fit to fill available space */}
                    <div 
                        style={{ 
                            width: '100%',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, minmax(250px, 1fr))',
                            gap: '24px',
                            justifyContent: 'space-between',
                            padding: '12px',
                            overflow: 'visible'
                        }} 
                        className="poid-grid" 
                        ref={poidGridRef as any}
                    >
                        {filteredPoidData
                            .filter((poid) => {
                                if (pendingClientType === 'Individual') return poid.type !== 'Yes';
                                if (pendingClientType === 'Company') return poid.type === 'Yes';
                                // For Multiple Individuals and Existing Client, show all
                                return true;
                            })
                            .slice(0, visiblePoidCount)
                            .map((poid) => (
                                <div 
                                    key={poid.poid_id} 
                                    onClick={() => handlePoidClick(poid)} 
                                    role="button" 
                                    tabIndex={0}
                                    style={{
                                        opacity: 1,
                                        transform: 'translateY(0)',
                                        transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
                                        animation: 'fadeInUp 0.4s ease-out'
                                    }}
                                >
                                    <PoidCard poid={poid} selected={selectedPoidIds.includes(poid.poid_id)} onClick={() => handlePoidClick(poid)} teamData={teamData} />
                                </div>
                            ))}
                    </div>
                </>
            )}
        </PoidSelectionTransition>
    </Stack>
);

export default PoidSelectionStep;