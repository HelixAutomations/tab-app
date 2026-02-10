//
import React from "react"; // invisible change
// invisible change 2.2
import { Stack, PrimaryButton } from "@fluentui/react";
import { sharedPrimaryButtonStyles } from "../../../app/styles/ButtonStyles";
import BubbleTextField from "../../../app/styles/BubbleTextField";
import { useTheme } from "../../../app/functionality/ThemeContext";
import { colours } from "../../../app/styles/colours";

interface DescriptionStepProps {
    description: string;
    setDescription: (v: string) => void;
    onContinue?: () => void;
    matterRefPreview?: string;
}

const DescriptionStep: React.FC<DescriptionStepProps> = ({
    description,
    setDescription,
    onContinue,
    matterRefPreview,
}) => {
    const { isDarkMode } = useTheme();
    
    // Use consistent theming like other components
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
        iconColor: colours.highlight, // Use standard highlight color
        focusColor: colours.highlight
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
                            <i className="ms-Icon ms-Icon--EditNote" style={{ 
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
                                Matter Description
                            </div>
                            <div style={{ fontSize: 12, color: isDarkMode ? '#9CA3AF' : '#64748B' }}>
                                A short description that will appear on the matter record
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Matter preview card */}
                <div style={{
                    background: themeColours.cardBg,
                    border: `1px solid ${themeColours.border}`,
                    borderRadius: 10,
                    padding: '14px 16px 12px 16px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                    marginBottom: 4
                }}>
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 10, 
                        marginBottom: 8 
                    }}>
                        <i className="ms-Icon ms-Icon--OpenFolderHorizontal" style={{ 
                            fontSize: 18, 
                            color: themeColours.iconColor 
                        }} />
                        <span style={{ 
                            fontSize: 15, 
                            fontWeight: 700, 
                            color: themeColours.iconColor,
                            letterSpacing: 0.3
                        }}>
                            {matterRefPreview || '[Matter Ref]'}
                        </span>
                    </div>
                    <div style={{ 
                        color: themeColours.text, 
                        fontSize: 14, 
                        fontWeight: 400,
                        minHeight: 20,
                        opacity: description ? 1 : 0.6,
                        fontStyle: description ? 'normal' : 'italic',
                        lineHeight: 1.4
                    }}>
                        {description || 'Matter description will appear here...'}
                    </div>
                </div>
                
                {/* Modern input field */}
                <div style={{ position: 'relative' }}>
                    <input
                        type="text"
                        style={{
                            width: '100%',
                            background: description ? `${themeColours.focusColor}08` : themeColours.cardBg,
                            border: description ? `2px solid ${themeColours.focusColor}` : `1px solid ${themeColours.border}`,
                            borderRadius: 10,
                            fontSize: 15,
                            color: themeColours.text,
                            fontWeight: 400,
                            padding: '14px 16px',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            outline: 'none',
                            boxSizing: 'border-box',
                            fontFamily: 'inherit',
                            boxShadow: description ? `0 0 0 3px ${themeColours.focusColor}1A` : 'none',
                        }}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Enter matter description..."
                        onFocus={(e) => {
                            e.target.style.borderColor = themeColours.focusColor;
                            e.target.style.boxShadow = `0 0 0 3px ${themeColours.focusColor}1A`;
                        }}
                        onBlur={(e) => {
                            if (!description) {
                                e.target.style.borderColor = themeColours.border;
                                e.target.style.boxShadow = 'none';
                            }
                        }}
                    />
                </div>
                
                {onContinue && (
                    <PrimaryButton
                        text="Continue"
                        onClick={onContinue}
                        styles={{
                            root: {
                                background: `linear-gradient(135deg, ${themeColours.focusColor} 0%, #2563EB 100%)`,
                                border: 'none',
                                borderRadius: 10,
                                height: 44,
                                fontWeight: 600,
                                fontSize: 14,
                                boxShadow: themeColours.shadow,
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                ':hover': {
                                    background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                                    transform: 'translateY(-1px)',
                                    boxShadow: '0 6px 12px rgba(0, 0, 0, 0.15)'
                                },
                                ':active': {
                                    transform: 'translateY(0)'
                                }
                            }
                        }}
                    />
                )}
            </Stack>
        </div>
    );
};

export default DescriptionStep;
