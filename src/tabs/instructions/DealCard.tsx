import React, { useState } from 'react';
// invisible change 2.1
//
import { Text, PrimaryButton, Icon } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react';
import {
    parseISO,
    differenceInMinutes,
    differenceInHours,
    differenceInCalendarDays,
    isToday,
    format,
    isValid,
} from 'date-fns';
import {
    FaFilePdf,
    FaFileImage,
    FaFileWord,
    FaFileExcel,
    FaFilePowerpoint,
    FaFileArchive,
    FaFileAlt,
    FaFileAudio,
    FaFileVideo,
    FaUsers,
    FaUser,
    FaPoundSign
} from 'react-icons/fa';
import { colours } from '../../app/styles/colours';
import { componentTokens } from '../../app/styles/componentTokens';
import { sharedPrimaryButtonStyles } from '../../app/styles/ButtonStyles';
import { useTheme } from '../../app/functionality/ThemeContext';
import '../../app/styles/DealCard.css';

interface DealInfo {
    [key: string]: any;
}

interface DealCardProps {
    deal: DealInfo;
    onFollowUp?: () => void;
    animationDelay?: number;
    onOpenInstruction?: () => void;
    teamData?: any[] | null;
    userInitials?: string;
    isSingleView?: boolean; // New prop to indicate if this is a single deal view
}

const leftBorderColor = (area?: string) => {
    const normalized = area?.toLowerCase();
    switch (normalized) {
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

const getAreaIcon = (area?: string): string => {
    const normalized = area?.toLowerCase();
    switch (normalized) {
        case 'commercial':
            return 'KnowledgeArticle';
        case 'construction':
            return 'ConstructionCone';
        case 'property':
            return 'CityNext';
        case 'employment':
            return 'People';
        default:
            return 'Help';
    }
};

const getAreaIconCircle = (area?: string) => {
    const iconName = getAreaIcon(area);
    const color = leftBorderColor(area);
    
    return (
        <div style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginRight: '6px'
        }}>
            <Icon
                iconName={iconName}
                style={{
                    fontSize: '8px',
                    color: color,
                    lineHeight: 1
                }}
            />
        </div>
    );
};

const capitalizeArea = (area?: string): string => {
    if (!area) return '';
    const normalized = area.toLowerCase();
    switch (normalized) {
        case 'commercial':
            return 'Commercial';
        case 'construction':
            return 'Construction';
        case 'property':
            return 'Property';
        case 'employment':
            return 'Employment';
        default:
            return area.charAt(0).toUpperCase() + area.slice(1);
    }
};

const capitalizeStatus = (status?: string): string => {
    if (!status) return '';
    const normalized = status.toLowerCase();
    switch (normalized) {
        case 'pitched':
            return 'Pitched';
        case 'initialised':
            return 'Initialised';
        case 'closed':
            return 'Closed';
        default:
            return status.charAt(0).toUpperCase() + status.slice(1);
    }
};

const hasJointClients = (deal: any): boolean => {
    const result = deal.jointClients && Array.isArray(deal.jointClients) && deal.jointClients.length > 0;
    console.log('hasJointClients check:', { dealId: deal.DealId, jointClients: deal.jointClients, result });
    return result;
};

const hasDocuments = (deal: any): boolean => {
    const result = deal.documents && Array.isArray(deal.documents) && deal.documents.length > 0;
    console.log('hasDocuments check:', { dealId: deal.DealId, documents: deal.documents, result });
    return result;
};

// Document type icon mapping
const documentIconMap: Record<string, React.ReactElement> = {
    pdf: <FaFilePdf />,
    doc: <FaFileWord />,
    docx: <FaFileWord />,
    xls: <FaFileExcel />,
    xlsx: <FaFileExcel />,
    ppt: <FaFilePowerpoint />,
    pptx: <FaFilePowerpoint />,
    txt: <FaFileAlt />,
    zip: <FaFileArchive />,
    rar: <FaFileArchive />,
    jpg: <FaFileImage />,
    jpeg: <FaFileImage />,
    png: <FaFileImage />,
    mp3: <FaFileAudio />,
    mp4: <FaFileVideo />
};

const getDocumentIcon = (fileName?: string): React.ReactElement => {
    if (!fileName) return <FaFileAlt />;
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return documentIconMap[ext] || <FaFileAlt />;
};

// Analyze document types and return counts
const analyzeDocumentTypes = (documents: any[]): { type: string, icon: React.ReactElement, count: number }[] => {
    if (!documents || documents.length === 0) return [];
    
    const typeCounts: Record<string, number> = {};
    
    documents.forEach(doc => {
        if (doc.FileName || doc.fileName || doc.name || doc.title) {
            const fileName = doc.FileName || doc.fileName || doc.name || doc.title;
            const ext = fileName.split('.').pop()?.toLowerCase() || 'unknown';
            typeCounts[ext] = (typeCounts[ext] || 0) + 1;
        } else {
            // If no filename, just count as unknown
            typeCounts['unknown'] = (typeCounts['unknown'] || 0) + 1;
        }
    });
    
    return Object.entries(typeCounts)
        .map(([type, count]) => ({
            type,
            icon: documentIconMap[type] || <FaFileAlt />,
            count
        }))
        .sort((a, b) => b.count - a.count); // Sort by count descending
};

const statusColour = (status?: string) => {
    const normalized = status?.toLowerCase();
    switch (normalized) {
        case 'closed':
            return colours.green;
        case 'pitched':
            return colours.cta;
        case 'initialised':
            return colours.blue;
        default:
            return colours.greyText;
    }
};

const getStatusIcon = (status?: string) => {
    const normalized = status?.toLowerCase();
    
    const circleStyle: React.CSSProperties = {
        width: '12px',
        height: '12px',
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '7px',
        fontWeight: '400',
        flexShrink: 0,
        lineHeight: 1,
        backgroundColor: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)'
    };
    
    switch (normalized) {
        case 'closed':
            return (
                <div style={{
                    ...circleStyle,
                    color: '#20b26c'
                }}>
                    ✓
                </div>
            );
        case 'pitched':
            return (
                <div style={{
                    ...circleStyle,
                    color: '#d13438'
                }}>
                    ●
                </div>
            );
        case 'initialised':
            return (
                <div style={{
                    ...circleStyle,
                    color: '#0078d4',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: '50%',
                        height: '100%',
                        backgroundColor: '#0078d4',
                        opacity: 0.15,
                        borderRadius: '50% 0 0 50%'
                    }}></div>
                    ◐
                </div>
            );
        default:
            return null;
    }
};

const DealCard: React.FC<DealCardProps> = ({
    deal,
    onFollowUp,
    animationDelay = 0,
    onOpenInstruction,
    teamData,
    userInitials,
    isSingleView = false,
}) => {
    const { isDarkMode } = useTheme();
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    const toggleSection = (section: string) => {
        setExpandedSection(expandedSection === section ? null : section);
    };

    // Helper function to get pitcher's first name from team data
    const getPitcherFirstName = () => {
        if (!teamData || !userInitials) return 'Someone';
        
        const teamMember = teamData.find(member => 
            member.Initials?.toLowerCase() === userInitials.toLowerCase()
        );
        
        if (teamMember) {
            return teamMember.First || teamMember.Nickname || teamMember['Full Name']?.split(' ')[0] || userInitials;
        }
        
        return userInitials;
    };

    const getPeriod = (d: Date) => {
        const h = d.getHours();
        if (h < 12) return 'morning';
        if (h < 17) return 'afternoon';
        return 'evening';
    };

    // Helper function to categorize and format deal data
    const categorizeData = () => {
        const categories = {
            basic: {} as any,
            financial: {} as any,
            timing: {} as any,
            contact: {} as any,
            status: {} as any,
            other: {} as any
        };

        const basicFields = ['ServiceDescription', 'AreaOfWork', 'DealId'];
        const financialFields = ['Amount', 'Fee', 'Cost', 'Value', 'Price', 'Budget'];
        const timingFields = ['PitchedDate', 'PitchedTime', 'CloseDate', 'CloseTime', 'CreatedDate', 'Date', 'Time'];
        const contactFields = ['firstName', 'lastName', 'Email', 'Phone', 'Contact', 'Client'];
        const statusFields = ['Status', 'Stage', 'Progress', 'State'];
        const excludedFields = ['LeadClientId', 'Multi Client', 'MultiClient'];

        Object.entries(deal).forEach(([key, value]) => {
            // Skip excluded fields
            if (excludedFields.includes(key)) {
                return;
            }
            
            if (basicFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
                categories.basic[key] = value;
            } else if (financialFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
                categories.financial[key] = value;
            } else if (timingFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
                categories.timing[key] = value;
            } else if (contactFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
                categories.contact[key] = value;
            } else if (statusFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
                categories.status[key] = value;
            } else {
                categories.other[key] = value;
            }
        });

        return categories;
    };

    const categories = categorizeData();

    const getPitchInfo = () => {
        if (!deal.PitchedDate || !deal.PitchedTime) return { text: '', urgent: false };
        const dt = parseISO(`${deal.PitchedDate.slice(0, 10)}T${deal.PitchedTime}`);
        if (!isValid(dt)) return { text: '', urgent: false };
        const now = new Date();
        const diffMins = differenceInMinutes(now, dt);
        const diffHours = differenceInHours(now, dt);
        let descriptor = '';
        const period = getPeriod(dt);

        if (isToday(dt)) {
            if (diffMins < 60) {
                descriptor = `${diffMins} minutes ago`;
            } else if (diffHours < 2) {
                descriptor = `earlier this ${period}`;
            } else {
                descriptor = `at ${format(dt, 'haaa').toLowerCase()} this ${period}`;
            }
        } else if (differenceInCalendarDays(now, dt) < 7) {
            descriptor = `on ${format(dt, 'EEEE')} ${period}`;
        } else {
            descriptor = `on ${format(dt, 'EEEE d MMM')}`;
        }

        const name = deal.firstName || 'the client';
        const pitcherName = getPitcherFirstName();
        
        // Add PitchValidUntil if available
        let validUntilText = '';
        if (deal.PitchValidUntil) {
            const validUntilDate = new Date(deal.PitchValidUntil);
            if (isValid(validUntilDate)) {
                validUntilText = `valid until ${format(validUntilDate, 'd MMM yyyy')}`;
            }
        }
        
        return { 
            text: `${pitcherName} pitched ${name} ${descriptor}`, 
            validUntil: validUntilText,
            urgent: diffHours >= 5 
        };
    };

    const getCloseInfo = () => {
        if (!deal.CloseDate || !deal.CloseTime) return { text: '', urgent: false };
        const dt = parseISO(`${deal.CloseDate.slice(0, 10)}T${deal.CloseTime}`);
        if (!isValid(dt)) return { text: '', urgent: false };
        const now = new Date();
        const diffMins = differenceInMinutes(now, dt);
        const diffHours = differenceInHours(now, dt);
        let descriptor = '';
        const period = getPeriod(dt);

        if (isToday(dt)) {
            if (diffMins < 60) {
                descriptor = `${diffMins} minutes ago`;
            } else if (diffHours < 2) {
                descriptor = `earlier this ${period}`;
            } else {
                descriptor = `at ${format(dt, 'haaa').toLowerCase()} this ${period}`;
            }
        } else if (differenceInCalendarDays(now, dt) < 7) {
            descriptor = `on ${format(dt, 'EEEE')} ${period}`;
        } else {
            descriptor = `on ${format(dt, 'EEEE d MMM')}`;
        }

        const name = deal.firstName || 'the client';
        return { text: `You closed ${name} ${descriptor}`, urgent: false };
    };

    const pitchInfo = getPitchInfo();
    const closeInfo = getCloseInfo();

    const status = deal.Status ? deal.Status.toLowerCase() : undefined;
    const isClosed = status === 'closed';

    const cardClass = mergeStyles('dealCard', {
        backgroundColor: isDarkMode
            ? colours.dark.sectionBackground
            : colours.light.sectionBackground,
        borderRadius: componentTokens.card.base.borderRadius,
        padding: componentTokens.card.base.padding,
        color: isDarkMode ? colours.dark.text : colours.light.text,
        cursor: onOpenInstruction ? 'pointer' : 'default',
        borderLeft: `4px solid ${leftBorderColor(deal.AreaOfWork)}`,
        border: `0.25px solid ${isClosed ? colours.green : 'transparent'}`,
        boxShadow: isClosed
            ? `inset 0 0 2px ${colours.green}15, ${isDarkMode
                ? '0 4px 12px ' + colours.dark.border
                : '0 4px 12px ' + colours.light.border
            }`
            : componentTokens.card.base.boxShadow,
        opacity: isClosed ? 0.6 : 1,
        transition:
            'box-shadow 0.3s ease, transform 0.3s ease, border 0.3s ease, opacity 0.3s ease',
        selectors: {
            ':hover': {
                boxShadow: componentTokens.card.hover.boxShadow,
                transform: componentTokens.card.hover.transform,
            },
        },
    });

    const bannerClass = mergeStyles('pitch-banner', {
        background: isClosed
            ? componentTokens.successBanner.background
            : componentTokens.infoBanner.background,
        borderLeft: isClosed
            ? componentTokens.successBanner.borderLeft
            : componentTokens.infoBanner.borderLeft,
        padding: componentTokens.infoBanner.padding,
        fontSize: '0.875rem',
    });

    const style: React.CSSProperties = {
        '--animation-delay': `${animationDelay}s`,
    } as React.CSSProperties;

    // Construct full name from available fields - check multiple case variations
    const firstName = deal.firstName || deal.FirstName || '';
    const lastName = deal.lastName || deal.LastName || deal.surname || deal.Surname || '';
    
    const fullName = firstName && lastName 
        ? `${firstName} ${lastName}`
        : firstName || lastName || '';

    // Show only ProspectID (Passcode is in the instruction ref)
    const prospectInfo = deal.ProspectID || '';

    // Debug logging
    console.log('DealCard Debug:', {
        dealId: deal.DealId,
        hasJointClients: hasJointClients(deal),
        jointClientsArray: deal.jointClients,
        hasDocuments: hasDocuments(deal),
        documentsArray: deal.documents,
        documentTypes: hasDocuments(deal) ? analyzeDocumentTypes(deal.documents) : []
    });

    return (
        <div className={cardClass} style={style} onClick={onOpenInstruction}>
            {/* Full Name Display with Deal Icon and InstructionRef */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '1rem',
                fontWeight: 600,
                color: isDarkMode ? 'rgba(255,255,255,0.9)' : '#24292f',
                marginBottom: '8px',
                borderBottom: '1px solid rgba(0,0,0,0.1)',
                paddingBottom: '6px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaPoundSign style={{ 
                        fontSize: '14px', 
                        color: isClosed ? colours.green : '#666' 
                    }} />
                    <span>{fullName || 'Client Name'}</span>
                </div>
                {deal.InstructionRef && (
                    <span style={{
                        fontSize: '0.8rem',
                        fontWeight: 400,
                        color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666',
                        fontFamily: 'monospace'
                    }}>
                        {deal.InstructionRef}
                    </span>
                )}
            </div>
            
            {!isClosed && pitchInfo.text && (
                <div style={{
                    fontSize: '0.8rem',
                    color: isDarkMode ? 'rgba(255,255,255,0.6)' : '#6b7280',
                    marginBottom: '8px',
                    fontStyle: 'italic',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ 
                            width: '4px', 
                            height: '4px', 
                            borderRadius: '50%', 
                            backgroundColor: '#ef4444',
                            flexShrink: 0
                        }}></span>
                        {pitchInfo.text}
                    </div>
                    {pitchInfo.validUntil && (
                        <span style={{
                            fontSize: '0.7rem',
                            color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#999',
                            fontWeight: 500
                        }}>
                            {pitchInfo.validUntil}
                        </span>
                    )}
                </div>
            )}
            {isClosed && closeInfo.text && (
                <div style={{
                    fontSize: '0.8rem',
                    color: isDarkMode ? 'rgba(255,255,255,0.6)' : '#6b7280',
                    marginBottom: '8px',
                    fontStyle: 'italic',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}>
                    <span style={{ 
                        width: '4px', 
                        height: '4px', 
                        borderRadius: '50%', 
                        backgroundColor: colours.green,
                        flexShrink: 0
                    }}></span>
                    {closeInfo.text}
                </div>
            )}
            {!deal.InstructionRef && (
                <div className={bannerClass}>No instruction</div>
            )}
            
            {/* Header Section */}
            <div>
                {/* Read-only Service Description & Amount */}
                <div style={{
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : '#f8f9fa',
                    border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e1e4e8',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    marginBottom: '8px',
                    fontFamily: 'Segoe UI, monospace',
                    fontSize: '0.9rem',
                    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#586069',
                    lineHeight: '1.4',
                    userSelect: 'text',
                    cursor: 'text',
                    position: 'relative'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: '-8px',
                        left: '8px',
                        backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                        padding: '0 4px',
                        fontSize: '0.75rem',
                        color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#8b949e',
                        fontWeight: 500
                    }}>
                        Service & Fee
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                        {deal.ServiceDescription || 'Deal'}
                    </div>
                    {deal.Amount !== undefined && (
                        <div style={{ 
                            fontSize: '0.85rem', 
                            fontWeight: 600, 
                            color: isDarkMode ? 'rgba(255,255,255,0.9)' : '#24292f',
                            fontFamily: 'Raleway'
                        }}>
                            £{typeof deal.Amount === 'number' ? deal.Amount.toLocaleString() : deal.Amount}
                        </div>
                    )}
                </div>
                
                {/* Quick Summary Grid */}
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                    gap: '8px',
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    padding: '8px',
                    borderRadius: '4px'
                    // marginBottom removed to close the gap
                }}>
                    {deal.AreaOfWork && (
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Practice Area</div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                                {getAreaIconCircle(deal.AreaOfWork)}
                                {capitalizeArea(deal.AreaOfWork)}
                            </div>
                        </div>
                    )}
                    {deal.Status && (
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Status</div>
                            <div style={{ 
                                fontSize: '0.8rem', 
                                fontWeight: 600,
                                color: statusColour(deal.Status),
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                {getStatusIcon(deal.Status) ? (
                                    <span>
                                        {getStatusIcon(deal.Status)}
                                    </span>
                                ) : (
                                    <span className="status-indicator" style={{
                                        width: '4px',
                                        height: '4px',
                                        borderRadius: '50%',
                                        backgroundColor: statusColour(deal.Status)
                                    }} />
                                )}
                                {capitalizeStatus(deal.Status)}
                            </div>
                        </div>
                    )}
                    {/* Joint Clients - always show with count */}
                    <div>
                        <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Joint Clients</div>
                        <div style={{ 
                            fontSize: '0.8rem', 
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            <FaUsers
                                style={{
                                    fontSize: '12px',
                                    color: colours.cta,
                                    lineHeight: 1
                                }}
                            />
                            {hasJointClients(deal) ? deal.jointClients.length : 0}
                        </div>
                    </div>
                    
                    {/* Documents - always show with count */}
                    <div>
                        <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Documents</div>
                        <div style={{ 
                            fontSize: '0.8rem', 
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap'
                        }}>
                            {hasDocuments(deal) ? (
                                analyzeDocumentTypes(deal.documents).map((docType, index) => (
                                    <div key={docType.type} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '2px',
                                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                        padding: '2px 4px',
                                        borderRadius: '3px',
                                        fontSize: '0.75rem'
                                    }}>
                                        <span style={{
                                            fontSize: '10px',
                                            color: colours.blue,
                                            lineHeight: 1,
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}>
                                            {docType.icon}
                                        </span>
                                        <span>{docType.count}</span>
                                    </div>
                                ))
                            ) : (
                                <span>0</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded Pin Cards Section - Only in Single View */}
            {isSingleView && (hasJointClients(deal) || hasDocuments(deal)) && (
                <div style={{ 
                    marginTop: '16px',
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap'
                }}>
                    {/* Joint Clients Pin Cards */}
                    {hasJointClients(deal) && (
                        <div style={{
                            flex: '1 1 300px',
                            minWidth: '300px'
                        }}>
                            <div style={{
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: isDarkMode ? 'rgba(255,255,255,0.8)' : '#333',
                                marginBottom: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <FaUsers style={{ fontSize: '12px', color: colours.cta }} />
                                Joint Clients ({deal.jointClients.length})
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                gap: '12px'
                            }}>
                                {deal.jointClients.map((client: any, index: number) => (
                                    <div
                                        key={index}
                                        style={{
                                            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : '#f8f9fa',
                                            border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e1e4e8',
                                            borderRadius: '0px', // No rounded corners
                                            padding: '12px 16px',
                                            fontSize: '0.75rem',
                                            color: isDarkMode ? 'rgba(255,255,255,0.9)' : '#24292f',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                            cursor: 'default',
                                            animation: `slideInUp 0.3s ease-out ${0.1 + index * 0.1}s both`,
                                            position: 'relative',
                                            overflow: 'hidden',
                                            minHeight: '120px'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-2px)';
                                            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                        }}
                                    >
                                        <div style={{
                                            position: 'absolute',
                                            top: '0',
                                            left: '0',
                                            width: '4px',
                                            height: '100%',
                                            backgroundColor: colours.cta
                                        }} />
                                        
                                        {/* Header with Large Icon and Status */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            justifyContent: 'space-between',
                                            marginLeft: '8px',
                                            marginBottom: '8px'
                                        }}>
                                            <div style={{
                                                fontSize: '20px',
                                                color: colours.cta,
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '6px',
                                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                                border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)'
                                            }}>
                                                <FaUser />
                                            </div>
                                            
                                            {/* Client Status Badges */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
                                                {/* Lead Client Badge */}
                                                {client.IsLeadClient && (
                                                    <div style={{ 
                                                        display: 'inline-block',
                                                        backgroundColor: colours.cta,
                                                        color: '#fff',
                                                        fontSize: '0.5rem',
                                                        fontWeight: 600,
                                                        padding: '2px 4px',
                                                        borderRadius: '0px',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.5px'
                                                    }}>
                                                        Lead
                                                    </div>
                                                )}
                                                
                                                {/* Submission Status Badge */}
                                                {client.HasSubmitted !== undefined && (
                                                    <div style={{ 
                                                        display: 'inline-block',
                                                        backgroundColor: client.HasSubmitted ? colours.green : colours.orange,
                                                        color: '#fff',
                                                        fontSize: '0.5rem',
                                                        fontWeight: 600,
                                                        padding: '2px 4px',
                                                        borderRadius: '0px',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.5px'
                                                    }}>
                                                        {client.HasSubmitted ? 'Submitted' : 'Pending'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div style={{ marginLeft: '8px' }}>
                                            {/* Client Name */}
                                            <div style={{ 
                                                fontWeight: 600,
                                                fontSize: '0.8rem',
                                                lineHeight: '1.3',
                                                marginBottom: '4px',
                                                wordBreak: 'break-word'
                                            }}>
                                                {client.name || client.firstName || client.Name || client.ClientEmail?.split('@')[0] || `Client ${index + 1}`}
                                            </div>
                                            
                                            {/* Email Tag */}
                                            {(client.email || client.ClientEmail) && (
                                                <div style={{ 
                                                    display: 'inline-block',
                                                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                                    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#555',
                                                    fontSize: '0.6rem',
                                                    fontWeight: 500,
                                                    padding: '2px 6px',
                                                    borderRadius: '0px',
                                                    marginBottom: '6px',
                                                    wordBreak: 'break-word'
                                                }}>
                                                    {client.email || client.ClientEmail}
                                                </div>
                                            )}
                                            
                                            {/* Phone */}
                                            {client.phone && (
                                                <div style={{ 
                                                    color: isDarkMode ? 'rgba(255,255,255,0.6)' : '#666',
                                                    fontSize: '0.65rem',
                                                    marginBottom: '3px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}>
                                                    <Icon iconName="Phone" style={{ fontSize: '10px', color: colours.blue }} />
                                                    {client.phone}
                                                </div>
                                            )}
                                            
                                            {/* Bottom Right: Date and ID */}
                                            <div style={{
                                                position: 'absolute',
                                                bottom: '8px',
                                                right: '8px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'flex-end',
                                                gap: '2px'
                                            }}>
                                                {/* Submission Date */}
                                                {client.SubmissionDateTime && (
                                                    <div style={{ 
                                                        color: isDarkMode ? 'rgba(255,255,255,0.4)' : '#aaa',
                                                        fontSize: '0.55rem',
                                                        fontFamily: 'monospace',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '2px'
                                                    }}>
                                                        <Icon iconName="Calendar" style={{ fontSize: '8px', color: colours.green }} />
                                                        {new Date(client.SubmissionDateTime).toLocaleDateString('en-GB', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </div>
                                                )}
                                                
                                                {/* Client ID */}
                                                {client.DealJointClientId && (
                                                    <div style={{ 
                                                        color: isDarkMode ? 'rgba(255,255,255,0.3)' : '#bbb',
                                                        fontSize: '0.55rem',
                                                        fontFamily: 'monospace'
                                                    }}>
                                                        ID: {client.DealJointClientId}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Documents Pin Cards */}
                    {hasDocuments(deal) && (
                        <div style={{
                            flex: '1 1 300px',
                            minWidth: '300px'
                        }}>
                            <div style={{
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: isDarkMode ? 'rgba(255,255,255,0.8)' : '#333',
                                marginBottom: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <FaFileAlt style={{ fontSize: '12px', color: colours.blue }} />
                                Documents ({deal.documents.length})
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                                gap: '12px'
                            }}>
                                {deal.documents.slice(0, 8).map((doc: any, index: number) => {
                                    const fileName = doc.FileName || doc.fileName || doc.name || doc.title || `Document ${index + 1}`;
                                    const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
                                    const docIcon = documentIconMap[fileExt] || <FaFileAlt />;
                                    const documentUrl = doc.Url || doc.url || doc.link || doc.downloadUrl;
                                    const isSubmitted = doc.Status === 'Submitted' || doc.IsSubmitted || doc.uploaded;
                                    const documentStatus = doc.Status || (isSubmitted ? 'Submitted' : 'Pending');
                                    
                                    return (
                                        <div
                                            key={index}
                                            style={{
                                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : '#f8f9fa',
                                                border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e1e4e8',
                                                borderRadius: '0px', // No rounded corners
                                                padding: '12px 16px',
                                                fontSize: '0.75rem',
                                                color: isDarkMode ? 'rgba(255,255,255,0.9)' : '#24292f',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                                cursor: documentUrl ? 'pointer' : 'default',
                                                animation: `slideInUp 0.3s ease-out ${0.2 + index * 0.1}s both`,
                                                position: 'relative',
                                                overflow: 'hidden',
                                                minHeight: '140px'
                                            }}
                                            onClick={() => documentUrl && window.open(documentUrl, '_blank')}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'translateY(0)';
                                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                                            }}
                                        >
                                            <div style={{
                                                position: 'absolute',
                                                top: '0',
                                                left: '0',
                                                width: '4px',
                                                height: '100%',
                                                backgroundColor: colours.blue
                                            }} />
                                            
                                            {/* Header with Large Icon and Status */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                justifyContent: 'space-between',
                                                marginLeft: '8px',
                                                marginBottom: '8px'
                                            }}>
                                                <div style={{
                                                    fontSize: '24px',
                                                    color: colours.blue,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    padding: '8px',
                                                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                                    border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)'
                                                }}>
                                                    {docIcon}
                                                </div>
                                                
                                                {/* Document Status Badge */}
                                                <div style={{ 
                                                    display: 'inline-block',
                                                    backgroundColor: isSubmitted ? colours.green : colours.orange,
                                                    color: '#fff',
                                                    fontSize: '0.55rem',
                                                    fontWeight: 600,
                                                    padding: '2px 6px',
                                                    borderRadius: '0px',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px'
                                                }}>
                                                    {documentStatus}
                                                </div>
                                            </div>
                                            
                                            <div style={{ marginLeft: '8px', flex: 1 }}>
                                                {/* File Name */}
                                                <div style={{ 
                                                    fontWeight: 600,
                                                    fontSize: '0.8rem',
                                                    lineHeight: '1.3',
                                                    marginBottom: '4px',
                                                    wordBreak: 'break-word'
                                                }}>
                                                    {fileName.length > 25 ? fileName.substring(0, 25) + '...' : fileName}
                                                </div>
                                                
                                                {/* File Extension Badge */}
                                                <div style={{ 
                                                    display: 'inline-block',
                                                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                                                    color: colours.blue,
                                                    fontSize: '0.65rem',
                                                    fontWeight: 600,
                                                    padding: '2px 6px',
                                                    borderRadius: '0px',
                                                    marginBottom: '6px',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px'
                                                }}>
                                                    {fileExt || 'file'}
                                                </div>
                                                
                                                {/* Email Tag */}
                                                {doc.UploadedBy && (
                                                    <div style={{ 
                                                        display: 'inline-block',
                                                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                                                        color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#555',
                                                        fontSize: '0.6rem',
                                                        fontWeight: 500,
                                                        padding: '2px 6px',
                                                        borderRadius: '0px',
                                                        marginBottom: '6px',
                                                        marginLeft: '6px'
                                                    }}>
                                                        {doc.UploadedBy}
                                                    </div>
                                                )}
                                                
                                                {/* Document URL */}
                                                {documentUrl && (
                                                    <div style={{ 
                                                        color: colours.blue,
                                                        fontSize: '0.65rem',
                                                        marginBottom: '4px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        textDecoration: 'underline',
                                                        cursor: 'pointer'
                                                    }}>
                                                        <Icon iconName="Link" style={{ fontSize: '10px', color: colours.blue }} />
                                                        <span>View Document</span>
                                                    </div>
                                                )}
                                                
                                                {/* File Size */}
                                                {doc.FileSizeBytes && (
                                                    <div style={{ 
                                                        color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#888',
                                                        fontSize: '0.6rem',
                                                        marginBottom: '3px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        <Icon iconName="FileCode" style={{ fontSize: '10px', color: colours.blue }} />
                                                        {(doc.FileSizeBytes / 1024 / 1024).toFixed(1)}MB
                                                    </div>
                                                )}
                                                
                                                {/* Document Type */}
                                                {doc.DocumentType && (
                                                    <div style={{ 
                                                        color: isDarkMode ? 'rgba(255,255,255,0.6)' : '#666',
                                                        fontSize: '0.65rem',
                                                        fontStyle: 'italic',
                                                        marginBottom: '3px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        <Icon iconName="DocumentSet" style={{ fontSize: '10px', color: colours.green }} />
                                                        {doc.DocumentType}
                                                    </div>
                                                )}
                                                
                                                {/* Notes */}
                                                {doc.Notes && (
                                                    <div style={{ 
                                                        color: isDarkMode ? 'rgba(255,255,255,0.6)' : '#666',
                                                        fontSize: '0.6rem',
                                                        fontStyle: 'italic',
                                                        marginTop: '4px',
                                                        padding: '3px 6px',
                                                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                                                        borderLeft: `3px solid ${colours.blue}`,
                                                        display: 'flex',
                                                        alignItems: 'flex-start',
                                                        gap: '4px'
                                                    }}>
                                                        <Icon iconName="Comment" style={{ fontSize: '10px', color: colours.cta, marginTop: '1px', flexShrink: 0 }} />
                                                        <span>{doc.Notes.length > 40 ? doc.Notes.substring(0, 40) + '...' : doc.Notes}</span>
                                                    </div>
                                                )}
                                                
                                                {/* Bottom Right: Date and ID */}
                                                <div style={{
                                                    position: 'absolute',
                                                    bottom: '8px',
                                                    right: '8px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'flex-end',
                                                    gap: '2px'
                                                }}>
                                                    {/* Upload Date */}
                                                    {doc.UploadedAt && (
                                                        <div style={{ 
                                                            color: isDarkMode ? 'rgba(255,255,255,0.4)' : '#aaa',
                                                            fontSize: '0.55rem',
                                                            fontFamily: 'monospace',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '2px'
                                                        }}>
                                                            <Icon iconName="Calendar" style={{ fontSize: '8px', color: colours.orange }} />
                                                            {new Date(doc.UploadedAt).toLocaleDateString('en-GB', {
                                                                day: 'numeric',
                                                                month: 'short',
                                                                year: '2-digit'
                                                            })}
                                                        </div>
                                                    )}
                                                    
                                                    {/* Document ID */}
                                                    {doc.DocumentId && (
                                                        <div style={{ 
                                                            color: isDarkMode ? 'rgba(255,255,255,0.3)' : '#bbb',
                                                            fontSize: '0.55rem',
                                                            fontFamily: 'monospace'
                                                        }}>
                                                            ID: {doc.DocumentId}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {deal.documents.length > 8 && (
                                    <div style={{
                                        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#f0f0f0',
                                        border: `1px dashed ${isDarkMode ? 'rgba(255,255,255,0.2)' : '#ccc'}`,
                                        borderRadius: '0px',
                                        padding: '12px 16px',
                                        fontSize: '0.75rem',
                                        color: isDarkMode ? 'rgba(255,255,255,0.6)' : '#666',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontStyle: 'italic',
                                        animation: `slideInUp 0.3s ease-out ${0.2 + 8 * 0.1}s both`
                                    }}>
                                        +{deal.documents.length - 8} more...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @keyframes slideInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>

            {onFollowUp && (
                <div className="deal-cta" onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', width: '100%' }}>
                        <div
                            className="nav-button forward-button"
                            onClick={onFollowUp}
                            tabIndex={0}
                            style={{
                                background: '#f4f4f6',
                                border: '2px solid #e1dfdd',
                                borderRadius: '0px',
                                width: '48px',
                                height: '48px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                opacity: 1,
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: '0 1px 2px rgba(6,23,51,0.04)',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#ffefed';
                                e.currentTarget.style.border = '2px solid #D65541';
                                e.currentTarget.style.borderRadius = '0px';
                                e.currentTarget.style.width = '120px';
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(214,85,65,0.08)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#f4f4f6';
                                e.currentTarget.style.border = '2px solid #e1dfdd';
                                e.currentTarget.style.borderRadius = '0px';
                                e.currentTarget.style.width = '48px';
                                e.currentTarget.style.boxShadow = '0 1px 2px rgba(6,23,51,0.04)';
                            }}
                        >
                            {/* Send Icon */}
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                style={{
                                    transition: 'color 0.3s, opacity 0.3s',
                                    color: '#D65541',
                                    position: 'absolute',
                                    left: '50%',
                                    top: '50%',
                                    transform: 'translate(-50%, -50%)',
                                }}
                            >
                                <path
                                    d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>

                            {/* Expandable Text */}
                            <span
                                style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: '#D65541',
                                    opacity: 0,
                                    transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    whiteSpace: 'nowrap',
                                }}
                                className="nav-text"
                            >
                                Follow Up
                            </span>
                        </div>
                        <style>{`
                            .nav-button:hover .nav-text {
                                opacity: 1 !important;
                            }
                            .nav-button:hover svg {
                                opacity: 0 !important;
                            }
                        `}</style>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DealCard;
