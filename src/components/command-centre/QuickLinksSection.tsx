import React from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens } from './types';

interface QuickLink {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
}

interface QuickLinksSectionProps {
    tokens: CommandCentreTokens;
    onOpenReleaseNotes?: () => void;
    closePopover: () => void;
}

const QuickLinksSection: React.FC<QuickLinksSectionProps> = ({ tokens, onOpenReleaseNotes, closePopover }) => {
    const { isDarkMode, textPrimary, textMuted, borderLight, applyRowHover, resetRowHover } = tokens;

    const navigate = (tab: string, detail?: Record<string, unknown>) => {
        try {
            window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab, ...detail } }));
        } catch { /* swallow */ }
        closePopover();
    };

    const links: QuickLink[] = [
        {
            label: 'My Time',
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
            ),
            onClick: () => navigate('reporting'),
        },
        {
            label: 'My Matters',
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
            ),
            onClick: () => navigate('matters'),
        },
        {
            label: 'My Enquiries',
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
            ),
            onClick: () => navigate('enquiries'),
        },
    ];

    if (onOpenReleaseNotes) {
        links.push({
            label: 'Release Notes',
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
            ),
            onClick: () => { onOpenReleaseNotes(); closePopover(); },
        });
    }

    const btnStyle: React.CSSProperties = {
        flex: '1 1 0', minWidth: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, padding: '10px 6px',
        background: isDarkMode
            ? `linear-gradient(90deg, rgba(54, 144, 206, 0.10) 0%, rgba(54, 144, 206, 0.00) 42%), ${colours.darkBlue}`
            : colours.grey,
        border: `1px solid ${borderLight}`,
        borderLeft: '3px solid transparent',
        borderRadius: 0,
        cursor: 'pointer',
        color: isDarkMode ? '#d1d5db' : colours.greyText,
        fontSize: 10, fontWeight: 600,
        transition: 'all 0.15s ease',
        boxShadow: isDarkMode ? 'inset 0 0 0 1px rgba(54, 144, 206, 0.05)' : 'none',
        transform: 'translateY(0)',
    };

    return (
        <div style={{ marginBottom: 16 }}>
            <div style={tokens.sectionTitle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
                Quick Links
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
                {links.map(link => (
                    <button
                        key={link.label}
                        style={btnStyle}
                        onClick={link.onClick}
                        onMouseEnter={(e) => {
                            applyRowHover(e.currentTarget);
                            e.currentTarget.style.color = textPrimary;
                        }}
                        onMouseLeave={(e) => {
                            resetRowHover(e.currentTarget);
                            e.currentTarget.style.color = isDarkMode ? '#d1d5db' : colours.greyText;
                        }}
                    >
                        {link.icon}
                        <span>{link.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default QuickLinksSection;
