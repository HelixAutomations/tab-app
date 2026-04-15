import React, { useState } from 'react';
import { format } from 'date-fns';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import {
    FaPoundSign,
    FaUsers,
    FaFileAlt,
    FaPhone,
    FaEnvelope,
    FaUser,
    FaBuilding,
    FaCalendarAlt
} from 'react-icons/fa';
import { colours } from '../../app/styles/colours';

interface DealCardProps {
    deal: any;
    isDarkMode?: boolean;
    onTogglePinned?: (dealId: string) => void;
    pinnedDealsSet?: Set<string>;
    isSingleView?: boolean;
    animationDelay?: number;
    onFollowUp?: () => void;
    teamData?: any;
    userInitials?: string;
    expanded?: boolean;
    selected?: boolean;
    onSelect?: () => void;
}

const DealCard: React.FC<DealCardProps> = ({
    deal,
    isDarkMode = false,
    animationDelay = 0,
    expanded = false,
    selected = false,
    onSelect,
}) => {
    const [isHovered, setIsHovered] = useState(false);

    // Get client name (support both field name formats)
    const fullName = `${deal.FirstName || deal.firstName || ''} ${deal.LastName || deal.lastName || ''}`.trim();
    const isMultiClient = deal.jointClients && deal.jointClients.length > 0;
    const hasDocuments = deal.documents && deal.documents.length > 0;

    // Format dates
    const pitchDate = deal.PitchedDate 
        ? format(new Date(deal.PitchedDate), 'd MMM yyyy')
        : deal.pitchedDate 
        ? format(new Date(deal.pitchedDate), 'd MMM yyyy')
        : undefined;

    // Deal timeline status
    const isPitched = Boolean(deal.PitchedDate || deal.pitchedDate);
    const isFollowedUp = false; // No follow-up detection implemented yet
    const isInstructed = deal.Status === 'closed';

    // Determine next action step for pulsing
    const getNextActionStep = () => {
        // Since follow-up detection isn't implemented, no pulsing for now
        return null;
    };
    
    const nextActionStep = getNextActionStep();

    const cardClass = mergeStyles('dealCard', {
        backgroundColor: colours.light.sectionBackground,
        borderRadius: '0px',
        padding: '16px',
        color: colours.light.text,
        cursor: 'pointer',
        position: 'relative',
        border: selected 
            ? '2px solid #3690CE' 
            : '1px solid #e1e4e8',
        boxShadow: selected
            ? '0 0 0 1px #3690CE20, 0 4px 16px rgba(54, 144, 206, 0.15)'
            : '0 2px 8px rgba(0,0,0,0.08)',
        transition: 'box-shadow 0.3s ease, transform 0.3s ease, border 0.3s ease',
        width: '100%',
        display: 'block',
        selectors: {
            ':hover': {
                boxShadow: selected
                    ? '0 0 0 1px #3690CE30, 0 6px 20px rgba(54, 144, 206, 0.2)'
                    : '0 4px 16px rgba(0,0,0,0.12)',
                transform: 'translateY(-1px) scale(1.004)',
            },
        },
    });

    // Add CSS animation for pulsing
    const pulseAnimation = `
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
    `;
    
    // Inject the animation styles if not already present
    if (!document.querySelector('#deal-timeline-pulse-animation')) {
        const style = document.createElement('style');
        style.id = 'deal-timeline-pulse-animation';
        style.textContent = pulseAnimation;
        document.head.appendChild(style);
    }

    const style: React.CSSProperties = {
        '--animation-delay': `${animationDelay}s`,
    } as React.CSSProperties;

    const handleCardClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onSelect) {
            onSelect();
        }
    };

    return (
        <div 
            className={cardClass} 
            style={style} 
            onClick={handleCardClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* CARD HEADER */}
            <div>
                {/* Header Row 1: Client Name and Ref */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        {isMultiClient ? (
                            <FaUsers style={{ 
                                fontSize: '14px', 
                                color: selected || isHovered ? '#3690CE' : '#666',
                                transition: 'color 0.3s ease'
                            }} />
                        ) : (
                            <FaUser style={{ 
                                fontSize: '14px', 
                                color: selected || isHovered ? '#3690CE' : '#666',
                                transition: 'color 0.3s ease'
                            }} />
                        )}
                        <div>
                            <span style={{
                                fontSize: '1rem',
                                fontWeight: 600,
                                color: selected || isHovered ? colours.highlight : colours.light.text,
                                transition: 'color 0.3s ease'
                            }}>
                                {fullName || 'Client Name'}
                            </span>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        {deal.InstructionRef && (
                            <div style={{
                                fontSize: '0.75rem',
                                fontFamily: 'monospace',
                                fontWeight: 600,
                                color: colours.light.text,
                                backgroundColor: 'rgba(0,0,0,0.03)',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                border: '1px solid rgba(0,0,0,0.1)',
                                marginBottom: '4px'
                            }}>
                                {deal.InstructionRef}
                            </div>
                        )}
                        {pitchDate && (
                            <div style={{
                                fontSize: '0.75rem',
                                color: '#666'
                            }}>
                                {pitchDate}
                            </div>
                        )}
                    </div>
                </div>

                {/* Header Row 2: Contact Details */}
                <div style={{
                    display: 'flex',
                    gap: '16px',
                    marginBottom: '8px',
                    fontSize: '0.8rem'
                }}>
                    {(deal.Email || deal.LeadClientEmail) && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#3690CE',
                            cursor: 'pointer'
                        }}
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            window.location.href = `mailto:${deal.Email || deal.LeadClientEmail}`;
                        }}>
                            <FaEnvelope style={{ fontSize: '10px' }} />
                            <span>{deal.Email || deal.LeadClientEmail}</span>
                        </div>
                    )}
                    {deal.Phone && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#3690CE',
                            cursor: 'pointer'
                        }}
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            window.location.href = `tel:${deal.Phone}`;
                        }}>
                            <FaPhone style={{ fontSize: '10px' }} />
                            <span>{deal.Phone}</span>
                        </div>
                    )}
                    {isMultiClient && deal.jointClients && deal.jointClients.length > 0 && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#999',
                            fontSize: '0.75rem'
                        }}>
                            <FaUsers style={{ fontSize: '10px' }} />
                            <span>+{deal.jointClients.length} joint client{deal.jointClients.length > 1 ? 's' : ''}</span>
                        </div>
                    )}
                </div>

                {/* Header Row 3: Service Description and Amount */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px'
                }}>
                    <div style={{
                        fontSize: '0.85rem',
                        color: '#333',
                        flex: 1
                    }}>
                        {deal.Service || deal.ServiceDescription || 'Legal Service'}
                    </div>
                    {(deal.QuotedFee || deal.Amount) && (
                        <div style={{
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            color: '#3690CE',
                            fontFamily: 'Raleway'
                        }}>
                            £{(deal.QuotedFee || deal.Amount).toLocaleString()}
                        </div>
                    )}
                </div>
            </div>

            {/* TIMELINE PROGRESS */}
            <div>
                {/* Timeline Row */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    {/* Step 1: Pitched */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        <div style={{ 
                            width: '8px', 
                            height: '8px', 
                            borderRadius: '4px', 
                            backgroundColor: isPitched ? '#20b26c' : '#ddd',
                            flexShrink: 0,
                            overflow: 'hidden'
                        }}></div>
                        <span style={{ 
                            fontSize: '0.7rem', 
                            fontWeight: 600,
                            color: isPitched ? '#20b26c' : '#999'
                        }}>
                            Pitched
                        </span>
                    </div>
                    
                    {/* Connector Line */}
                    <div style={{
                        width: '16px',
                        height: '2px',
                        backgroundColor: isFollowedUp ? '#20b26c' : '#ddd'
                    }}></div>
                    
                    {/* Step 2: Follow-up */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        <div style={{ 
                            width: '8px', 
                            height: '8px', 
                            borderRadius: '4px', 
                            backgroundColor: '#ddd', // Grey since no follow-up detection
                            flexShrink: 0,
                            overflow: 'hidden'
                        }}></div>
                        <span style={{ 
                            fontSize: '0.7rem', 
                            fontWeight: 600,
                            color: '#999',
                            textDecoration: deal.Status === 'closed' ? 'line-through' : 'none' // Strike through if closed (not needed)
                        }}>
                            Follow-up
                        </span>
                    </div>
                    
                    {/* Connector Line */}
                    <div style={{
                        width: '16px',
                        height: '2px',
                        backgroundColor: isInstructed ? '#20b26c' : '#ddd'
                    }}></div>
                    
                    {/* Step 3: Instructed */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        <div style={{ 
                            width: '8px', 
                            height: '8px', 
                            borderRadius: '4px', 
                            backgroundColor: deal.Status === 'closed' ? '#20b26c' : '#ddd',
                            flexShrink: 0,
                            overflow: 'hidden',
                            ...(nextActionStep === 'instructed' ? {
                                animation: 'pulse 2s infinite',
                                backgroundColor: colours.cta
                            } : {})
                        }}></div>
                        <span style={{ 
                            fontSize: '0.7rem', 
                            fontWeight: 600,
                            color: deal.Status === 'closed' ? '#20b26c' : 
                                   nextActionStep === 'instructed' ? colours.cta : '#999',
                            textDecoration: 'none' // Remove strikethrough for deals
                        }}>
                            Instructed
                        </span>
                    </div>
                </div>
            </div>

            {/* Expanded Sections */}
            {selected && (
                <div style={{ marginTop: '16px' }}>
                    {/* Contact Information Section */}
                    {((deal.Email || deal.LeadClientEmail) || deal.Phone) && (
                        <div style={{
                            padding: '16px',
                            backgroundColor: 'rgba(54, 144, 206, 0.03)',
                            borderRadius: '4px',
                            border: '1px solid rgba(54, 144, 206, 0.1)',
                            marginBottom: '16px'
                        }}>
                            <div style={{
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: '#3690CE',
                                marginBottom: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <FaUser /> Contact Information
                            </div>
                            <div style={{
                                display: 'grid',
                                gap: '8px',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'
                            }}>
                                {(deal.Email || deal.LeadClientEmail) && (
                                    <div style={{
                                        padding: '12px',
                                        backgroundColor: 'white',
                                        borderRadius: '4px',
                                        border: '1px solid #e1e4e8'
                                    }}>
                                        <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '4px' }}>Email</div>
                                        <div style={{
                                            fontSize: '0.85rem',
                                            fontWeight: 500,
                                            color: '#3690CE',
                                            cursor: 'pointer'
                                        }}
                                        onClick={(e: React.MouseEvent) => {
                                            e.stopPropagation();
                                            window.location.href = `mailto:${deal.Email || deal.LeadClientEmail}`;
                                        }}>
                                            {deal.Email || deal.LeadClientEmail}
                                        </div>
                                    </div>
                                )}
                                {deal.Phone && (
                                    <div style={{
                                        padding: '12px',
                                        backgroundColor: 'white',
                                        borderRadius: '4px',
                                        border: '1px solid #e1e4e8'
                                    }}>
                                        <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '4px' }}>Phone</div>
                                        <div style={{
                                            fontSize: '0.85rem',
                                            fontWeight: 500,
                                            color: '#3690CE',
                                            cursor: 'pointer'
                                        }}
                                        onClick={(e: React.MouseEvent) => {
                                            e.stopPropagation();
                                            window.location.href = `tel:${deal.Phone}`;
                                        }}>
                                            {deal.Phone}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Joint Clients Section */}
                    {isMultiClient && deal.jointClients && deal.jointClients.length > 0 && (
                        <div style={{
                            padding: '16px',
                            backgroundColor: 'rgba(54, 144, 206, 0.03)',
                            borderRadius: '4px',
                            border: '1px solid rgba(54, 144, 206, 0.1)',
                            marginBottom: '16px'
                        }}>
                            <div style={{
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: '#3690CE',
                                marginBottom: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <FaUsers /> Joint Clients ({deal.jointClients.length})
                            </div>
                            <div style={{
                                display: 'grid',
                                gap: '8px',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))'
                            }}>
                                {deal.jointClients.map((client: any, index: number) => (
                                    <div key={index} style={{
                                        padding: '12px',
                                        backgroundColor: 'white',
                                        borderRadius: '4px',
                                        border: '1px solid #e1e4e8'
                                    }}>
                                        <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '4px' }}>
                                            Client {index + 2}
                                        </div>
                                        <div style={{
                                            fontSize: '0.85rem',
                                            fontWeight: 600,
                                            marginBottom: '4px'
                                        }}>
                                            {`${client.FirstName || client.firstName || ''} ${client.LastName || client.lastName || ''}`.trim() || 'Unnamed Client'}
                                        </div>
                                        {(client.Email || client.ClientEmail) && (
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: '#3690CE',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                            onClick={(e: React.MouseEvent) => {
                                                e.stopPropagation();
                                                window.location.href = `mailto:${client.Email || client.ClientEmail}`;
                                            }}>
                                                <FaEnvelope style={{ fontSize: '10px' }} />
                                                {client.Email || client.ClientEmail}
                                            </div>
                                        )}
                                        {client.Phone && (
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: '#3690CE',
                                                cursor: 'pointer',
                                                marginTop: '2px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                            onClick={(e: React.MouseEvent) => {
                                                e.stopPropagation();
                                                window.location.href = `tel:${client.Phone}`;
                                            }}>
                                                <FaPhone style={{ fontSize: '10px' }} />
                                                {client.Phone}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Deal Information Section */}
                    <div style={{
                        padding: '16px',
                        backgroundColor: 'rgba(54, 144, 206, 0.03)',
                        borderRadius: '4px',
                        border: '1px solid rgba(54, 144, 206, 0.1)',
                        marginBottom: '16px'
                    }}>
                        <div style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#3690CE',
                            marginBottom: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <FaFileAlt /> Deal Information
                        </div>
                        <div style={{
                            display: 'grid',
                            gap: '8px',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'
                        }}>
                            <div style={{
                                padding: '12px',
                                backgroundColor: 'white',
                                borderRadius: '4px',
                                border: '1px solid #e1e4e8'
                            }}>
                                <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '4px' }}>Status</div>
                                <div style={{
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    color: deal.Status === 'closed' ? colours.green : 
                                           deal.Status === 'pitched' ? colours.blue : '#666',
                                    textTransform: 'capitalize'
                                }}>
                                    {deal.Status === 'closed' ? 'Instructed' : 
                                     deal.Status === 'pitched' ? 'Pitched' : 
                                     deal.Status?.replace('_', ' ') || 'Unknown'}
                                </div>
                            </div>
                            {deal.AreaOfWork && (
                                <div style={{
                                    padding: '12px',
                                    backgroundColor: 'white',
                                    borderRadius: '4px',
                                    border: '1px solid #e1e4e8'
                                }}>
                                    <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '4px' }}>Area of Work</div>
                                    <div style={{
                                        fontSize: '0.85rem',
                                        fontWeight: 500,
                                        textTransform: 'capitalize'
                                    }}>
                                        {deal.AreaOfWork.replace('_', ' ')}
                                    </div>
                                </div>
                            )}
                            {hasDocuments && (
                                <div style={{
                                    padding: '12px',
                                    backgroundColor: 'white',
                                    borderRadius: '4px',
                                    border: '1px solid #e1e4e8'
                                }}>
                                    <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '4px' }}>Documents</div>
                                    <div style={{
                                        fontSize: '0.85rem',
                                        fontWeight: 500,
                                        color: colours.blue
                                    }}>
                                        {deal.documents.length} files
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DealCard;
