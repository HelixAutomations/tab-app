//
import React from 'react'; // invisible change // invisible change
// invisible change 2.2
import { Stack } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';
import { useTheme } from '../../../app/functionality/ThemeContext';

export interface ModernMultiSelectOption {
    key: string;
    text: string;
    disabled?: boolean;
}

interface ModernMultiSelectProps {
    label: string;
    options: ModernMultiSelectOption[];
    selectedValue: string | null;
    onSelectionChange: (value: string) => void;
    variant?: 'default' | 'binary' | 'grid';
    className?: string;
    disabled?: boolean;
}

const ModernMultiSelect: React.FC<ModernMultiSelectProps> = ({
    label,
    options,
    selectedValue,
    onSelectionChange,
    variant = 'default',
    className = '',
    disabled = false
}) => {
    const { isDarkMode } = useTheme();
    
    // Flat design tokens — no gradients, no shadows
    const themeColours = {
        bg: isDarkMode ? '#111827' : '#F8FAFC',
        border: isDarkMode ? '#334155' : '#CBD5E1',
        text: isDarkMode ? '#E5E7EB' : '#0F172A',
        inactiveText: isDarkMode ? '#9CA3AF' : '#475569',
        selectedBg: isDarkMode ? '#1F2937' : `${colours.highlight}15`,
        hoverBg: isDarkMode ? '#1F2937' : '#F1F5F9',
    };
    const getGridColumns = () => {
        if (variant === 'binary' && options.length === 2) {
            return 'repeat(2, 1fr)';
        }
        if (variant === 'grid') {
            return 'repeat(auto-fit, minmax(120px, 1fr))';
        }
        // Default horizontal layout
        return `repeat(${options.length}, 1fr)`;
    };

    const containerStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: getGridColumns(),
        gap: variant === 'binary' ? '0' : '6px',
        width: '100%',
        border: variant === 'binary' ? `1px solid ${selectedValue ? colours.highlight : themeColours.border}` : 'none',
        borderRadius: 0,
        overflow: 'hidden',
        background: variant === 'binary' ? themeColours.bg : 'transparent',
        boxShadow: 'none',
    };

    const getOptionStyle = (option: ModernMultiSelectOption, index: number): React.CSSProperties => {
        const isSelected = selectedValue === option.key;
        const isDisabled = disabled || option.disabled;
        
        const baseStyle: React.CSSProperties = {
            padding: variant === 'binary' ? '10px 12px' : '8px 12px',
            textAlign: 'center',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            userSelect: 'none',
            fontSize: '12px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
            border: variant === 'binary' ? 'none' : `1px solid ${themeColours.border}`,
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '36px',
            position: 'relative',
        };

        if (variant === 'binary') {
            return {
                ...baseStyle,
                color: isSelected ? colours.highlight : themeColours.inactiveText,
                background: isSelected ? themeColours.selectedBg : 'transparent',
                borderRight: index === 0 && options.length > 1 ? `1px solid ${themeColours.border}` : 'none',
                opacity: isDisabled ? 0.5 : 1,
                fontWeight: isSelected ? '600' : '500',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            };
        }

        return {
            ...baseStyle,
            color: isSelected ? colours.highlight : themeColours.inactiveText,
            background: isSelected ? themeColours.selectedBg : themeColours.bg,
            borderColor: isSelected ? colours.highlight : themeColours.border,
            opacity: isDisabled ? 0.5 : 1,
            boxShadow: 'none',
            borderRadius: 0,
        };
    };

    const questionBannerStyle: React.CSSProperties = {
        background: isDarkMode ? '#1F2937' : '#F8FAFC',
        borderLeft: `3px solid ${colours.highlight}`,
        padding: '4px 8px',
        fontWeight: '600',
        color: isDarkMode ? '#E5E7EB' : '#061733',
        marginBottom: '6px',
        fontSize: '11px',
        borderRadius: '0 4px 4px 0',
    };

    return (
        <Stack tokens={{ childrenGap: 0 }} className={className}>
            {label && (
                <div style={questionBannerStyle}>
                    {label}
                </div>
            )}
            <div style={containerStyle}>
                {options.map((option, index) => (
                    <div
                        key={option.key}
                        style={getOptionStyle(option, index)}
                        onClick={() => {
                            if (!disabled && !option.disabled) {
                                onSelectionChange(option.key);
                            }
                        }}
                        onMouseEnter={(e) => {
                            if (!disabled && !option.disabled && selectedValue !== option.key) {
                                if (variant === 'binary') {
                                    e.currentTarget.style.background = themeColours.hoverBg;
                                    e.currentTarget.style.color = colours.highlight;
                                } else {
                                    e.currentTarget.style.background = themeColours.hoverBg;
                                    e.currentTarget.style.borderColor = colours.highlight;
                                }
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!disabled && !option.disabled && selectedValue !== option.key) {
                                if (variant === 'binary') {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = themeColours.inactiveText;
                                } else {
                                    e.currentTarget.style.background = themeColours.bg;
                                    e.currentTarget.style.borderColor = themeColours.border;
                                }
                            }
                        }}
                        role="button"
                        tabIndex={disabled || option.disabled ? -1 : 0}
                        aria-pressed={selectedValue === option.key}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                if (!disabled && !option.disabled) {
                                    onSelectionChange(option.key);
                                }
                            }
                        }}
                    >
                        {option.text}
                    </div>
                ))}
            </div>
        </Stack>
    );
};

export default ModernMultiSelect;
