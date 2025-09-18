//
import React from 'react'; // invisible change
// invisible change 2.2
import { Stack, Text } from '@fluentui/react';
import '../../../app/styles/MultiSelect.css';
import { colours } from '../../../app/styles/colours';

const areaColors: Record<string, string> = { /* invisible change */
    // Commercial: colours.blue, // Removed Commercial
    Property: colours.green,
    Construction: colours.orange,
    Employment: colours.yellow,
};

interface PracticeAreaStepProps {
    options: string[];
    practiceArea: string;
    setPracticeArea: (v: string) => void;
    onContinue: () => void;
    areaOfWork: string;
}

const PracticeAreaStep: React.FC<PracticeAreaStepProps> = ({ options, practiceArea, setPracticeArea, onContinue, areaOfWork }) => {
    const color = areaColors[areaOfWork] || '#3690CE';
    // Filter out 'Commercial' from the options before rendering
    const filteredOptions = options.filter((pa) => pa !== 'Commercial');
    
    // Professional theme colors
    const colours = {
        bg: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
        border: '#E2E8F0',
        text: '#0F172A',
        shadow: '0 2px 4px rgba(0, 0, 0, 0.04)'
    };
    
    return (
        <div style={{
            background: colours.bg,
            border: `1px solid ${colours.border}`,
            borderRadius: 12,
            padding: 20,
            boxShadow: colours.shadow,
            boxSizing: 'border-box'
        }}>
            <Stack tokens={{ childrenGap: 16 }}>
                {/* Professional header with icon */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    marginBottom: 4 
                }}>
                    <i className="ms-Icon ms-Icon--WorkItem" style={{ 
                        fontSize: 16, 
                        color: color
                    }} />
                    <span style={{ 
                        fontSize: 16, 
                        fontWeight: 600, 
                        color: colours.text 
                    }}>
                        Select Practice Area
                    </span>
                </div>
                
                <div className="practice-area-selection">
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
                        gap: '6px'
                    }}>
                        {filteredOptions.map((pa) => {
                            const isActive = practiceArea === pa;
                            return (
                                <div
                                    key={pa}
                                    className={`client-type-icon-btn${isActive ? ' active' : ''}`}
                                    onClick={() => {
                                        setPracticeArea(pa);
                                        onContinue();
                                    }}
                                    style={{
                                        position: 'relative',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '8px 12px',
                                        border: `1px solid ${isActive ? color : colours.border}`,
                                        borderRadius: '6px',
                                        background: isActive 
                                            ? `linear-gradient(135deg, ${color}15 0%, ${color}08 100%)` 
                                            : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        minHeight: '36px',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                        fontSize: '12px',
                                        fontWeight: 400,
                                        color: isActive ? color : colours.text,
                                        // CSS vars for hover/press
                                        ['--area-hover-bg' as any]: `linear-gradient(135deg, ${color}10 0%, ${color}05 100%)`,
                                        ['--area-hover-color' as any]: color,
                                        ['--area-press-bg' as any]: `linear-gradient(135deg, ${color}25 0%, ${color}15 100%)`,
                                        ['--area-press-color' as any]: color,
                                        transform: 'translateY(0)',
                                    }}
                                >
                                    <span className="client-type-label" style={{
                                        opacity: 1,
                                        transform: 'translateY(0)',
                                        transition: 'all 0.2s ease',
                                        pointerEvents: 'none',
                                        textAlign: 'center',
                                        lineHeight: 1.3
                                    }}>{pa}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </Stack>
            <style>{`
                .practice-area-selection .client-type-icon-btn .client-type-label {
                    pointer-events: none;
                }
                .practice-area-selection .client-type-icon-btn:not(.active):hover {
                    background: var(--area-hover-bg, linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)) !important;
                    border-color: var(--area-hover-color, #3690CE) !important;
                    transform: translateY(-1px) !important;
                    box-shadow: 0 3px 6px rgba(0,0,0,0.06) !important;
                }
                .practice-area-selection .client-type-icon-btn:not(.active):hover .client-type-label {
                    color: var(--area-hover-color, #3690CE) !important;
                }
                .practice-area-selection .client-type-icon-btn:active {
                    background: var(--area-press-bg, linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)) !important;
                    border-color: var(--area-press-color, #1565c0) !important;
                    transform: translateY(0px) !important;
                }
                .practice-area-selection .client-type-icon-btn.active .client-type-label {
                    color: ${color} !important;
                }
            `}</style>
        </div>
    );
};

export default PracticeAreaStep;