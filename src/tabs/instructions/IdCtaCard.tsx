import React from 'react';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

interface IdCtaCardProps {
    instruction: any;
    onVerify: () => void;
    animationDelay?: number;
}

const IdCtaCard: React.FC<IdCtaCardProps> = ({ instruction, onVerify, animationDelay = 0 }) => {
    const { isDarkMode } = useTheme();
    const cardClass = mergeStyles({
        backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
        padding: '16px',
        borderRadius: 8,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'transform 0.2s ease',
        animation: `fadeIn 0.5s ease ${animationDelay}s both`,
    });

    const name = `${instruction.FirstName ?? ''} ${instruction.LastName ?? ''}`.trim() || instruction.CompanyName || 'Unknown';

    return (
        <div className={cardClass}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{instruction.InstructionRef}</div>
            <div style={{ marginBottom: 12 }}>{name}</div>
            <PrimaryButton text="Verify ID" onClick={onVerify} />
        </div>
    );
};

export default IdCtaCard;