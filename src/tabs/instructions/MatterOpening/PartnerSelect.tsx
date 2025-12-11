//
import React from 'react'; // invisible change
// invisible change 2.2
import { colours } from '../../../app/styles/colours';

interface PartnerSelectProps {
    label: string;
    options: string[];
    selectedValue: string;
    onSelectionChange: (value: string) => void;
    variant?: 'default' | 'grid';
    className?: string;
    disabled?: boolean;
}

const PartnerSelect: React.FC<PartnerSelectProps> = ({
    label,
    options,
    selectedValue,
    onSelectionChange,
    variant = 'grid',
    className = '',
    disabled = false
}) => {
    // Helper function to get initials from full name (display only - actual initials come from team data)
    const getInitials = (name: string): string => {
        return name
            .split(' ')
            .map(word => word.charAt(0).toUpperCase())
            .join('');
    };

    const getGridColumns = () => {
        if (variant === 'grid') {
            return 'repeat(auto-fit, minmax(120px, 1fr))';
        }
        return `repeat(${options.length}, 1fr)`;
    };

    const containerStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: getGridColumns(),
        gap: '8px',
        width: '100%',
    };

    const getOptionStyle = (name: string): React.CSSProperties => {
        const isSelected = selectedValue === name;
        const isDisabled = disabled;

        return {
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '64px',
            padding: '12px 8px',
            border: `2px solid ${isSelected ? colours.highlight : colours.light.border}`,
            borderRadius: '8px',
            background: isSelected ? `${colours.highlight}15` : '#fff',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            opacity: isDisabled ? 0.5 : 1,
            overflow: 'hidden',
        };
    };

    const questionBannerStyle: React.CSSProperties = {
        background: `linear-gradient(to right, #ffffff, ${colours.light.grey})`,
        borderLeft: `3px solid ${colours.cta}`,
        padding: '4px 8px',
        fontWeight: '600',
        color: '#061733',
        marginBottom: '8px',
        fontSize: '14px',
        borderRadius: '0 4px 4px 0',
    };

    return (
        <div className={className}>
            <div style={questionBannerStyle}>
                {label}
            </div>
            <div style={containerStyle}>
                {options.map((name) => {
                    const isSelected = selectedValue === name;
                    const initials = getInitials(name);
                    
                    return (
                        <div
                            key={name}
                            style={getOptionStyle(name)}
                            onClick={() => {
                                if (!disabled) {
                                    onSelectionChange(name);
                                }
                            }}
                            onMouseEnter={(e) => {
                                if (!disabled && !isSelected) {
                                    e.currentTarget.style.background = '#f7fafc';
                                    e.currentTarget.style.borderColor = colours.highlight;
                                    // Show full name on hover
                                    const initialsEl = e.currentTarget.querySelector('.partner-initials') as HTMLElement;
                                    const nameEl = e.currentTarget.querySelector('.partner-name') as HTMLElement;
                                    if (initialsEl && nameEl) {
                                        initialsEl.style.opacity = '0';
                                        nameEl.style.opacity = '1';
                                        nameEl.style.transform = 'translateY(0)';
                                    }
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!disabled && !isSelected) {
                                    e.currentTarget.style.background = '#fff';
                                    e.currentTarget.style.borderColor = colours.light.border;
                                    // Show initials on mouse leave
                                    const initialsEl = e.currentTarget.querySelector('.partner-initials') as HTMLElement;
                                    const nameEl = e.currentTarget.querySelector('.partner-name') as HTMLElement;
                                    if (initialsEl && nameEl) {
                                        initialsEl.style.opacity = '1';
                                        nameEl.style.opacity = '0';
                                        nameEl.style.transform = 'translateY(10px)';
                                    }
                                }
                            }}
                            role="button"
                            tabIndex={disabled ? -1 : 0}
                            aria-pressed={isSelected}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    if (!disabled) {
                                        onSelectionChange(name);
                                    }
                                }
                            }}
                        >
                            {/* Initials - shown by default */}
                            <div
                                className="partner-initials"
                                style={{
                                    fontSize: '18px',
                                    fontWeight: '600',
                                    color: isSelected ? colours.highlight : '#4a5568',
                                    opacity: isSelected ? 0 : 1,
                                    position: 'absolute',
                                    transition: 'opacity 0.3s ease',
                                    pointerEvents: 'none',
                                }}
                            >
                                {initials}
                            </div>
                            
                            {/* Full Name - shown on hover/selected */}
                            <div
                                className="partner-name"
                                style={{
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    color: isSelected ? colours.highlight : '#4a5568',
                                    textAlign: 'center',
                                    opacity: isSelected ? 1 : 0,
                                    transform: `translateY(${isSelected ? 0 : '10px'})`,
                                    transition: 'opacity 0.3s ease, transform 0.3s ease',
                                    pointerEvents: 'none',
                                    lineHeight: '1.2',
                                    wordBreak: 'break-word',
                                }}
                            >
                                {name}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PartnerSelect;
