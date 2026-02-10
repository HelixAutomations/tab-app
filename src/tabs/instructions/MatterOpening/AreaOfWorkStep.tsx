// invisible change 3
import React from 'react'; // invisible change // invisible change 2
// invisible change 2.2
import { Stack, Text, Icon } from '@fluentui/react';
import '../../../app/styles/MultiSelect.css';
import { colours } from '../../../app/styles/colours';
import { useTheme } from '../../../app/functionality/ThemeContext';

interface AreaOfWorkStepProps {
    areaOfWork: string;
    setAreaOfWork: (v: string) => void;
    onContinue: () => void;
    getGroupColor: (area: string) => string;
}

const areaColors: Record<string, string> = { /* invisible change */
    Commercial: colours.blue,
    Property: colours.green,
    Construction: colours.orange,
    Employment: colours.yellow,
};

const options = [
    { type: 'Commercial', icon: 'KnowledgeArticle' },
    { type: 'Property', icon: 'CityNext' },
    { type: 'Construction', icon: 'ConstructionCone' },
    { type: 'Employment', icon: 'People' },
];

const AreaOfWorkStep: React.FC<AreaOfWorkStepProps> = ({ areaOfWork, setAreaOfWork, onContinue, getGroupColor }) => {
    const { isDarkMode } = useTheme();
    
    // Professional theme colors
    const themeColours = {
        bg: isDarkMode 
            ? 'linear-gradient(135deg, #0B1220 0%, #1F2937 100%)'
            : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
        border: isDarkMode ? '#334155' : '#E2E8F0',
        text: isDarkMode ? '#E5E7EB' : '#0F172A',
        shadow: isDarkMode 
            ? '0 2px 4px rgba(0, 0, 0, 0.3)'
            : '0 2px 4px rgba(0, 0, 0, 0.04)',
        cardBg: isDarkMode
            ? 'linear-gradient(135deg, #111827 0%, #1F2937 100%)'
            : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
        inactiveText: isDarkMode ? '#9CA3AF' : '#64748B',
        iconColor: colours.highlight // Use standard highlight color
    };

    return (
        <div style={{
            background: themeColours.bg,
            border: `1px solid ${themeColours.border}`,
            borderRadius: 12,
            padding: 20,
            boxShadow: themeColours.shadow,
            boxSizing: 'border-box'
        }}>
            <Stack tokens={{ childrenGap: 16 }}>
                {/* Section header with description */}
                <div style={{ marginBottom: 4 }}>
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 10, 
                        marginBottom: 4 
                    }}>
                        <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: 0,
                            background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
                            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <i className="ms-Icon ms-Icon--WorkItem" style={{ 
                                fontSize: 14, 
                                color: themeColours.iconColor 
                            }} />
                        </div>
                        <div>
                            <div style={{ 
                                fontSize: 15, 
                                fontWeight: 700, 
                                color: themeColours.text 
                            }}>
                                Area of Work
                            </div>
                            <div style={{ fontSize: 12, color: isDarkMode ? '#9CA3AF' : '#64748B' }}>
                                Which department will handle this matter
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="area-of-work-selection">
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
                        gap: '6px'
                    }}>
                        {options.map(({ type, icon }) => {
                            const isActive = areaOfWork === type;
                            const areaColor = areaColors[type];
                            
                            return (
                                <button
                                    key={type}
                                    className={`client-type-icon-btn${isActive ? ' active' : ''}`}
                                    onClick={() => {
                                        setAreaOfWork(type);
                                        onContinue();
                                    }}
                                    style={{
                                        position: 'relative',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '10px 12px',
                                        border: `1px solid ${isActive ? areaColor : themeColours.border}`,
                                        borderRadius: '6px',
                                        background: isActive 
                                            ? `linear-gradient(135deg, ${areaColor}15 0%, ${areaColor}08 100%)` 
                                            : themeColours.cardBg,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        minHeight: '36px',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                        // CSS vars for hover/press
                                        ['--area-hover-bg' as any]: `linear-gradient(135deg, ${areaColor}12 0%, ${areaColor}06 100%)`,
                                        ['--area-hover-color' as any]: areaColor,
                                        ['--area-press-bg' as any]: `linear-gradient(135deg, ${areaColor}25 0%, ${areaColor}15 100%)`,
                                        ['--area-press-color' as any]: areaColor,
                                        transform: 'translateY(0)',
                                    }}
                                >
                                    <div
                                        className="client-type-icon"
                                        style={{
                                            fontSize: '16px',
                                            color: isActive ? areaColor : themeColours.inactiveText,
                                            marginBottom: '8px',
                                            opacity: 1,
                                            transition: 'all 0.2s ease',
                                            pointerEvents: 'none',
                                        }}
                                    >
                                        <Icon iconName={icon} />
                                    </div>
                                    <div
                                        className="client-type-label"
                                        style={{
                                            fontSize: '13px',
                                            fontWeight: 500,
                                            color: isActive ? areaColor : themeColours.inactiveText,
                                            textAlign: 'center',
                                            opacity: 1,
                                            transform: 'translateY(0)',
                                            transition: 'all 0.2s ease',
                                            pointerEvents: 'none',
                                            lineHeight: 1.3
                                        }}
                                    >
                                        {type}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </Stack>
            <style>{`
                .area-of-work-selection .client-type-icon-btn .client-type-label,
                .area-of-work-selection .client-type-icon-btn .client-type-icon {
                    pointer-events: none;
                }
                .area-of-work-selection .client-type-icon-btn:not(.active):hover {
                    background: var(--area-hover-bg, linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)) !important;
                    border-color: var(--area-hover-color, #3690CE) !important;
                    transform: translateY(-2px) !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.06) !important;
                }
                .area-of-work-selection .client-type-icon-btn:not(.active):hover .client-type-icon {
                    color: var(--area-hover-color, #3690CE) !important;
                    transform: scale(1.1) !important;
                }
                .area-of-work-selection .client-type-icon-btn:not(.active):hover .client-type-label {
                    color: var(--area-hover-color, #3690CE) !important;
                }
                .area-of-work-selection .client-type-icon-btn:active {
                    background: var(--area-press-bg, linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%)) !important;
                    border-color: var(--area-press-color, #1565c0) !important;
                    transform: translateY(-1px) !important;
                }
                .area-of-work-selection .client-type-icon-btn.active .client-type-icon {
                    transform: scale(1.05) !important;
                }
                .area-of-work-selection .client-type-icon-btn.active .client-type-label {
                }
            `}</style>
        </div>
    );
};

export default AreaOfWorkStep;