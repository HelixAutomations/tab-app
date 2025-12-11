//
import React from 'react'; // invisible change
// invisible change 2.2
import { colours } from '../../../app/styles/colours';

interface TeamMemberSelectProps {
    label: string;
    options: string[];
    selectedValue: string;
    onSelectionChange: (value: string) => void;
    className?: string;
    disabled?: boolean;
}

const TeamMemberSelect: React.FC<TeamMemberSelectProps> = ({
    label,
    options,
    selectedValue,
    onSelectionChange,
    className = '',
    disabled = false
}) => {
    // Helper function to get initials from full name using team data
    const getInitials = (name: string): string => {
        // Try to find in options (which come from team data)
        const found = options.find(opt => opt.toLowerCase() === name.toLowerCase());
        // For display, use first letters - but actual initials should come from team data lookup
        return name
            .split(' ')
            .map(word => word.charAt(0).toUpperCase())
            .join('');
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

    const selectContainerStyle: React.CSSProperties = {
        position: 'relative',
        width: '100%',
        height: '50px',
        border: `2px solid ${selectedValue ? colours.highlight : colours.light.border}`,
        borderRadius: '8px',
        background: selectedValue ? `${colours.highlight}15` : '#fff',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
    };

    const selectStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        border: 'none',
        background: 'transparent',
        padding: '0 16px',
        fontSize: '16px',
        color: selectedValue ? colours.highlight : '#4a5568',
        fontWeight: selectedValue ? '600' : '400',
        appearance: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        outline: 'none',
    };

    const arrowStyle: React.CSSProperties = {
        position: 'absolute',
        right: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
        fontSize: '14px',
        color: selectedValue ? colours.highlight : '#4a5568',
        transition: 'color 0.2s ease',
    };

    const [isOpen, setIsOpen] = React.useState(false);
    const [showInitials, setShowInitials] = React.useState(true);

    const displayValue = selectedValue && showInitials ? getInitials(selectedValue) : selectedValue;

    return (
        <div className={className}>
            <div style={questionBannerStyle}>
                {label}
            </div>
            <div 
                style={selectContainerStyle}
                onMouseEnter={() => {
                    if (selectedValue) {
                        setShowInitials(false);
                    }
                }}
                onMouseLeave={() => {
                    if (selectedValue && !isOpen) {
                        setShowInitials(true);
                    }
                }}
            >
                <select
                    style={selectStyle}
                    value={selectedValue}
                    onChange={(e) => {
                        onSelectionChange(e.target.value);
                        setShowInitials(true);
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                        setShowInitials(false);
                    }}
                    onBlur={() => {
                        setIsOpen(false);
                        if (selectedValue) {
                            setShowInitials(true);
                        }
                    }}
                    disabled={disabled}
                >
                    {options.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                </select>
                <div style={arrowStyle}>
                    ▼
                </div>
                {/* Display overlay showing current value */}
                {selectedValue && (
                    <div
                        style={{
                            position: 'absolute',
                            left: '16px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            pointerEvents: 'none',
                            fontSize: '16px',
                            fontWeight: '600',
                            color: colours.highlight,
                            transition: 'opacity 0.2s ease',
                            opacity: isOpen ? 0 : 1,
                        }}
                    >
                        {displayValue}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeamMemberSelect;
