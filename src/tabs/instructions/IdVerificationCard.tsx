import React, { useState } from 'react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { Text } from '@fluentui/react/lib/Text';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { FaUserCheck, FaMapMarkerAlt, FaChevronDown, FaChevronUp, FaIdCard } from 'react-icons/fa';

interface IdVerificationCardProps {
    data: any; // ID verification data item
    animationDelay?: number;
    compact?: boolean;
}

const getVerificationColor = (result: string) => {
    const level = result?.toLowerCase();
    if (level === 'passed' || level === 'pass' || level === 'approved') {
        return { background: '#e6f4ea', text: '#107C10', border: '#107C10' };
    }
    if (level === 'review' || level === 'pending') {
        return { background: '#fffbe6', text: '#b88600', border: '#FFB900' };
    }
    if (level === 'failed' || level === 'fail' || level === 'rejected') {
        return { background: '#fde7e9', text: '#d13438', border: '#d13438' };
    }
    return { background: '#f4f4f6', text: '#666', border: '#e1dfdd' };
};

const IdVerificationCard: React.FC<IdVerificationCardProps> = ({
    data,
    animationDelay = 0,
    compact = false
}) => {
    const { isDarkMode } = useTheme();
    const [expanded, setExpanded] = useState(!compact);
    const [showRawData, setShowRawData] = useState(false);

    const filteredData = React.useMemo(() => {
        const copy: Record<string, any> = { ...data };
        Object.keys(copy).forEach((k) => {
            const lower = k.toLowerCase();
            if (lower.includes('risk') || lower.includes('compliance')) {
                delete copy[k];
            }
        });
        return copy;
    }, [data]);

    // Extract key fields from the verification data
    const firstName = data.FirstName || data.firstName || '';
    const lastName = data.LastName || data.lastName || '';
    const clientName = firstName && lastName
        ? `${firstName} ${lastName}`
        : data.fullName || data.name || data.ClientName || data.ClientEmail || data.Email || '';
    
    const overallResult = data.EIDOverallResult || data.overallResult || data.result || data.status || 'Unknown';
    const pepResult = data.PEPandSanctionsCheckResult || data.pepResult || data.pep || 'Not checked';
    const addressResult = data.AddressVerificationCheckResult || data.addressResult || data.address || 'Not checked';
    const idType = data.IdType || data.idType || data.documentType || 'Unknown';
    const verificationId = data.CheckId || data.EIDCheckId || data.id || data.verificationId || 'N/A';
    const checkDate = data.ComplianceDate || data.EIDCheckedDate || data.timestamp || data.date;

    const cardClass = mergeStyles('id-verification-card-modern', {
        position: 'relative',
        background: isDarkMode 
            ? 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.12) 100%)' 
            : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
        color: isDarkMode ? colours.dark.text : colours.light.text,
        padding: compact ? '8px 12px' : '16px',
        borderRadius: 0,
        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'}`,
        boxShadow: compact 
            ? '0 1px 3px rgba(0,0,0,0.08)' 
            : '0 2px 8px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.06)',
    fontFamily: 'Raleway, sans-serif',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
        cursor: compact ? 'pointer' : 'default',
        selectors: {
            ':hover': {
                transform: compact ? 'translateY(-2px) scale(1.02)' : 'translateY(-1px)',
                boxShadow: compact 
                    ? '0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.08)' 
                    : '0 4px 16px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)',
                borderColor: isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,120,212,0.3)',
            },
        },
    });

    const overallColors = getVerificationColor(overallResult);
    const pepColors = getVerificationColor(pepResult);
    const addressColors = getVerificationColor(addressResult);

    const style: React.CSSProperties = { 
        '--animation-delay': `${animationDelay}ms`,
        animation: `slideInUpModern 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${animationDelay}ms both`
    } as React.CSSProperties;

    const handleCardClick = () => {
        if (compact) {
            setExpanded(!expanded);
        }
    };

    const toggleRawData = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowRawData(!showRawData);
    };

    return (
        <div className={cardClass} style={style} onClick={handleCardClick}>
            {/* Header Section */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: expanded ? '12px' : '0',
                transition: 'margin-bottom 0.3s ease'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaIdCard style={{
                        fontSize: '16px',
                        color: '#0078d4',
                        filter: 'drop-shadow(0 1px 2px rgba(0,120,212,0.3))'
                    }} />
                    <Text variant={compact ? "medium" : "mediumPlus"} styles={{
                        root: {
                            fontWeight: 700,
                            color: isDarkMode ? '#ffffff' : '#323130',
                            textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }
                    }}>
                        {clientName}
                    </Text>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                        style={{
                            padding: '4px 8px',
                            borderRadius: 0,
                            backgroundColor: overallColors.background,
                            color: overallColors.text,
                            border: `1px solid ${overallColors.border}40`,
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}
                    >
                        {overallResult}
                    </div>
                    
                    {compact && (
                        <div style={{ fontSize: '12px', color: isDarkMode ? '#94a3b8' : '#666' }}>
                            {expanded ? <FaChevronUp /> : <FaChevronDown />}
                        </div>
                    )}
                </div>
            </div>

            {/* Verification Results Grid - Always visible if not compact, or when expanded */}
            {(!compact || expanded) && (
                <>
                    <div className="verification-grid" style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                        marginBottom: '12px'
                    }}>
                        <div
                            className="verification-result-box"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                padding: '8px',
                                backgroundColor: pepColors.background,
                                color: pepColors.text,
                                border: `1px solid ${pepColors.border}40`,
                                borderRadius: 0,
                                fontSize: '12px',
                                fontWeight: 600,
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <FaUserCheck style={{ fontSize: '12px' }} />
                            <span>PEP: {pepResult}</span>
                        </div>
                        
                        <div
                            className="verification-result-box"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                padding: '8px',
                                backgroundColor: addressColors.background,
                                color: addressColors.text,
                                border: `1px solid ${addressColors.border}40`,
                                borderRadius: 0,
                                fontSize: '12px',
                                fontWeight: 600,
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <FaMapMarkerAlt style={{ fontSize: '12px' }} />
                            <span>Address: {addressResult}</span>
                        </div>
                    </div>

                    {/* Key Information Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                        gap: '8px',
                        marginBottom: '12px'
                    }}>
                        {idType !== 'Unknown' && (
                            <div style={{
                                padding: '8px',
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                borderRadius: 0,
                                fontSize: '11px'
                            }}>
                                <div style={{ fontWeight: 600, color: isDarkMode ? '#94a3b8' : '#666', marginBottom: '2px' }}>ID Type</div>
                                <div style={{ fontWeight: 500 }}>{idType}</div>
                            </div>
                        )}
                        
                        {verificationId !== 'N/A' && (
                            <div style={{
                                padding: '8px',
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                borderRadius: 0,
                                fontSize: '11px'
                            }}>
                                <div style={{ fontWeight: 600, color: isDarkMode ? '#94a3b8' : '#666', marginBottom: '2px' }}>ID</div>
                                <div style={{ fontWeight: 500, fontFamily: 'Consolas, monospace' }}>
                                    {verificationId.length > 8 ? `${verificationId.slice(0, 8)}...` : verificationId}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Raw Data Toggle */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingTop: '8px',
                        borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`
                    }}>
                        <button
                            onClick={toggleRawData}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#0078d4',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: '2px 0',
                                textDecoration: 'underline',
                                transition: 'color 0.2s ease'
                            }}
                        >
                            {showRawData ? 'Hide Details' : 'Show Details'}
                        </button>
                        
                        <Text variant="small" styles={{
                            root: {
                                color: isDarkMode ? '#94a3b8' : '#666',
                                fontSize: '10px',
                                fontFamily: 'Consolas, monospace'
                            }
                        }}>
                            {checkDate || 'No timestamp'}
                        </Text>
                    </div>

                    {/* Raw Data Section */}
                    {showRawData && (
                        <div style={{
                            marginTop: '8px',
                            padding: '8px',
                            backgroundColor: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
                            borderRadius: 0,
                            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                            maxHeight: '120px',
                            overflowY: 'auto'
                        }}>
                            <Text variant="small" styles={{
                                root: {
                                    fontFamily: 'Consolas, Monaco, monospace',
                                    fontSize: '10px',
                                    lineHeight: '1.4',
                                    whiteSpace: 'pre-wrap',
                                    color: isDarkMode ? '#cccccc' : '#333333'
                                }
                            }}>
                                {JSON.stringify(filteredData, null, 2)}
                            </Text>
                        </div>
                    )}
                </>
            )}

            {/* Background Icon */}
            <div style={{
                position: 'absolute',
                bottom: compact ? '4px' : '8px',
                right: compact ? '8px' : '12px',
                fontSize: compact ? '24px' : '32px',
                opacity: 0.1,
                color: '#0078d4',
                pointerEvents: 'none',
                transition: 'all 0.3s ease',
                filter: 'blur(0.5px)'
            }}>
                <FaIdCard />
            </div>
        </div>
    );
};

export default IdVerificationCard;
