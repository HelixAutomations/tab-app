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
    userTier?: 'dev' | 'devGroup' | 'admin' | 'user';
    onOpenReleaseNotes?: () => void;
    closePopover: () => void;
}

const QuickLinksSection: React.FC<QuickLinksSectionProps> = ({ tokens, userTier, onOpenReleaseNotes, closePopover }) => {
    const { isDarkMode, textPrimary, textMuted, borderLight } = tokens;

    const navigate = (eventName: string, detail?: Record<string, unknown>) => {
        try {
            window.dispatchEvent(new CustomEvent(eventName, detail ? { detail } : undefined));
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
            onClick: () => navigate('navigateToReporting'),
        },
        {
            label: 'My Matters',
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
            ),
            onClick: () => navigate('navigateToMatter'),
        },
        {
            label: 'My Enquiries',
            icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
            ),
            onClick: () => navigate('navigateToEnquiries'),
        },
    ];

    if (onOpenReleaseNotes && (userTier === 'dev' || userTier === 'devGroup')) {
        links.push({
            label: 'Release Notes',
            icon: (
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    <span style={{ position: 'absolute', top: -5, right: -10, fontSize: 6, fontWeight: 700, background: isDarkMode ? colours.accent : colours.highlight, color: isDarkMode ? colours.dark.background : '#fff', padding: '0 3px', letterSpacing: 0.4, fontFamily: 'Raleway, sans-serif', lineHeight: '11px' }}>DEV</span>
                </span>
            ),
            onClick: () => { onOpenReleaseNotes(); closePopover(); },
        });
    }

    const btnBase = isDarkMode ? colours.darkBlue : colours.grey;
    const btnHover = isDarkMode ? colours.dark.cardHover : colours.light.cardHover;

    const btnStyle: React.CSSProperties = {
        flex: '1 1 0', minWidth: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, padding: '10px 6px',
        background: btnBase,
        border: `1px solid ${borderLight}`,
        borderRadius: 0,
        cursor: 'pointer',
        color: isDarkMode ? '#d1d5db' : colours.greyText,
        fontSize: 10, fontWeight: 600,
        transition: 'all 0.15s ease',
        boxShadow: 'none',
    };

    return (
        <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 6 }}>
                {links.map(link => (
                    <button
                        key={link.label}
                        style={btnStyle}
                        onClick={link.onClick}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = btnHover;
                            e.currentTarget.style.borderColor = isDarkMode ? colours.dark.borderColor : colours.subtleGrey;
                            e.currentTarget.style.color = textPrimary;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = btnBase;
                            e.currentTarget.style.borderColor = borderLight;
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
