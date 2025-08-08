import { Text, Icon } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { NormalizedMatter } from '../../app/functionality/types';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import React, { useState } from 'react';

// Utility for copying text and showing feedback
function useCopyToClipboard(timeout = 1200): [boolean, (text: string) => void] {
    const [copied, setCopied] = useState(false);
    const copy = (text: string) => {
        if (navigator && navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), timeout);
            });
        }
    };
    return [copied, copy];
}

interface CopyableTextProps {
    value: string;
    className?: string;
    label?: string;
}

const CopyableText: React.FC<CopyableTextProps> = ({ value, className, label }) => {
    const [copied, copy] = useCopyToClipboard();
    return (
        <span
            className={className}
            title={copied ? `${label || 'Value'} copied!` : `Click to copy ${label || 'value'}`}
            onClick={e => {
                e.stopPropagation();
                copy(value);
            }}
            style={{ display: 'inline-block', position: 'relative' }}
        >
            {value}
            {copied && (
                <span style={{
                    position: 'absolute',
                    left: '100%',
                    top: 0,
                    marginLeft: 8,
                    fontSize: 12,
                    color: '#43a047',
                    background: '#fff',
                    borderRadius: 3,
                    padding: '2px 6px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    zIndex: 10,
                }}>
                    Copied!
                </span>
            )}
        </span>
    );
};

interface MatterLineItemProps {
    matter: NormalizedMatter;
    onSelect: (matter: NormalizedMatter) => void;
    isLast?: boolean;
}

const formatDate = (dateStr: string): string => {
    try {
        return new Date(dateStr).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    } catch {
        return dateStr;
    }
};

const getAreaColor = (area: string): string => {
    switch (area?.toLowerCase()) {
        case 'commercial':
            return colours.blue;
        case 'construction':
            return colours.orange;
        case 'property':
            return colours.green;
        case 'employment':
            return colours.yellow;
        default:
            return colours.cta;
    }
};

const MatterLineItem: React.FC<MatterLineItemProps> = ({ matter, onSelect, isLast }) => {
    const { isDarkMode } = useTheme();

    const handleClick = () => {
        onSelect(matter);
    };

    const lineItemStyle = mergeStyles({
        display: 'flex',
        alignItems: 'center',
        padding: '8px 20px',
        borderBottom: !isLast ? `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}` : 'none',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        fontFamily: 'Raleway, sans-serif',
        minHeight: '44px',
        position: 'relative',
        backgroundColor: 'transparent',
        selectors: {
            ':hover': {
                backgroundColor: 'transparent',
                transform: 'translateX(2px)',
            },
            ':active': {
                transform: 'translateX(1px)',
            },
            '::before': {
                content: '""',
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 2,
                background: getAreaColor(matter.practiceArea),
                zIndex: 2,
                height: '100%',
                opacity: 0.6,
                transition: 'all 0.15s ease',
            },
            ':hover::before': {
                width: 3,
                opacity: 1,
            },
        },
    });

    const mainContentStyle = mergeStyles({
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '2.5fr 1.2fr 1.2fr 1fr 120px',
        alignItems: 'center',
        gap: '16px',
        width: '100%',
    });

    const clientNameStyle = mergeStyles({
        fontWeight: '500',
        fontSize: '14px',
        color: isDarkMode ? colours.dark.text : colours.light.text,
        marginBottom: '2px',
        userSelect: 'text',
        cursor: 'copy',
        transition: 'color 0.2s',
        ':hover': {
            color: colours.highlight,
        },
    });

    const matterNumberStyle = mergeStyles({
        fontSize: '12px',
        color: isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
        marginBottom: '1px',
        fontWeight: '500',
    });

    const descriptionStyle = mergeStyles({
        fontSize: '11px',
        color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
        userSelect: 'text',
        cursor: 'copy',
        transition: 'color 0.2s',
        fontWeight: '500',
        ':hover': {
            color: colours.highlight,
        },
    });

    const metaStyle = mergeStyles({
        fontSize: '13px',
        color: isDarkMode ? colours.dark.text : colours.light.text,
        fontWeight: '500',
    });

    const statusStyle = mergeStyles({
        fontSize: '12px',
        color: isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
        fontWeight: '500',
    });

    const dateStyle = mergeStyles({
        fontSize: '12px',
        color: isDarkMode ? colours.dark.text : colours.light.text,
        fontWeight: '500',
    });

    const actionBadgeStyle = mergeStyles({
        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
        border: 'none',
        borderRadius: '16px',
        padding: '4px 10px',
        fontSize: '10px',
        fontWeight: '600',
        fontFamily: 'Raleway, sans-serif',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: 'none',
        height: '24px',
        minWidth: '35px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        selectors: {
            ':hover': {
                backgroundColor: 'rgba(102, 170, 232, 0.15)',
                color: colours.highlight,
                transform: 'translateY(-0.5px)',
            },
            ':active': {
                transform: 'translateY(0)',
            },
        },
    });

    const viewButtonStyle = mergeStyles({
        backgroundColor: colours.highlight,
        color: 'white',
        border: 'none',
        borderRadius: '16px',
        padding: '4px 12px',
        fontSize: '10px',
        fontWeight: '600',
        fontFamily: 'Raleway, sans-serif',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        boxShadow: 'none',
        height: '24px',
        minWidth: '45px',
        selectors: {
            ':hover': {
                backgroundColor: colours.blue,
                transform: 'translateY(-0.5px)',
            },
            ':active': {
                transform: 'translateY(0)',
            },
        },
    });

    return (
        <div className={lineItemStyle} onClick={handleClick}>
            {/* Main content grid */}
            <div className={mainContentStyle}>
                {/* Client & Matter Info */}
                <div>
                    <div>
                        <CopyableText value={matter.clientName || 'Unknown Client'} className={clientNameStyle} label="Client Name" />
                    </div>
                    <div className={matterNumberStyle}>{matter.displayNumber}</div>
                    {matter.description && (
                        <div>
                            <CopyableText value={matter.description} className={descriptionStyle} label="Description" />
                        </div>
                    )}
                </div>

                {/* Practice Area & Status */}
                <div>
                    <div className={metaStyle}>{matter.practiceArea || 'No Area'}</div>
                    <div className={statusStyle} style={{ marginTop: '2px' }}>
                        {matter.status || 'Unknown Status'}
                    </div>
                </div>

                {/* Solicitor Info */}
                <div>
                    <div className={metaStyle}>
                        {matter.responsibleSolicitor || 'Unassigned'}
                    </div>
                    {matter.originatingSolicitor && matter.originatingSolicitor !== matter.responsibleSolicitor && (
                        <Text variant="small" styles={{
                            root: {
                                color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
                                fontSize: '11px',
                                fontWeight: '500',
                                marginTop: '1px',
                            }
                        }}>
                            Orig: {matter.originatingSolicitor}
                        </Text>
                    )}
                </div>

                {/* Date & Matter ID */}
                <div>
                    <div className={dateStyle}>
                        {formatDate(matter.openDate)}
                    </div>
                    <Text variant="small" styles={{
                        root: {
                            color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                            fontSize: '10px',
                            fontWeight: '500',
                            marginTop: '1px',
                        }
                    }}>
                        ID: {matter.matterId}
                    </Text>
                </div>

                {/* Actions - All CTA Badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginRight: '16px' }}>
                    <button className={viewButtonStyle}>
                        View
                    </button>
                    
                    {matter.clientPhone && (
                        <button
                            className={actionBadgeStyle}
                            onClick={(e) => {
                                e.stopPropagation();
                                window.location.href = `tel:${matter.clientPhone}`;
                            }}
                            title="Call client"
                        >
                            <Icon iconName="Phone" style={{ fontSize: '10px' }} />
                        </button>
                    )}

                    {matter.clientEmail && (
                        <button
                            className={actionBadgeStyle}
                            onClick={(e) => {
                                e.stopPropagation();
                                window.location.href = `mailto:${matter.clientEmail}`;
                            }}
                            title="Email client"
                        >
                            <Icon iconName="Mail" style={{ fontSize: '10px' }} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MatterLineItem;
