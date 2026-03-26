import React, { useState } from 'react';
// invisible change 2.1
//
import { Text } from '@fluentui/react/lib/Text';
import { Icon } from '@fluentui/react/lib/Icon';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../app/styles/colours';
import { componentTokens } from '../../app/styles/componentTokens';
import { useTheme } from '../../app/functionality/ThemeContext';
import '../../app/styles/JointClientCard.css';

export interface DealSummary {
    DealId?: number;
    InstructionRef?: string | null;
    ServiceDescription?: string;
    Status?: string;
}


export interface ClientInfo {
    [key: string]: any;
}

interface InstructionSummary {
    InstructionRef: string;
    Email?: string;
    Stage?: string;
    [key: string]: any;
}

interface JointClientCardProps {
    client: ClientInfo;
    animationDelay?: number;
    onOpenInstruction?: (ref: string) => void;
    allInstructions?: InstructionSummary[];
}

const JointClientCard: React.FC<JointClientCardProps> = ({
    client,
    animationDelay = 0,
    onOpenInstruction,
    allInstructions = [],
}) => {
    const { isDarkMode } = useTheme();
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    const toggleSection = (section: string) => {
        setExpandedSection(expandedSection === section ? null : section);
    };

    // Helper function to categorize client data
    const categorizeData = () => {
        const categories = {
            identity: {} as any,
            contact: {} as any,
            status: {} as any,
            relationship: {} as any,
            other: {} as any
        };

        const identityFields = ['ClientEmail', 'Name', 'FirstName', 'LastName', 'Title', 'Lead'];
        const contactFields = ['Email', 'Phone', 'Mobile', 'Address', 'PostCode', 'Location'];
        const statusFields = ['HasSubmitted', 'Status', 'Stage', 'Progress', 'State', 'Active', 'SubmissionDateTime'];
        const relationshipFields = ['DealJointClientId', 'DealId', 'InstructionRef', 'Lead'];

        Object.entries(client).forEach(([key, value]) => {
            if (identityFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
                categories.identity[key] = value;
            } else if (contactFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
                categories.contact[key] = value;
            } else if (statusFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
                categories.status[key] = value;
            } else if (relationshipFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
                categories.relationship[key] = value;
            } else {
                categories.other[key] = value;
            }
        });

        return categories;
    };

    const categories = categorizeData();

    const cardClass = mergeStyles('jointClientCard', {
        backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
        color: isDarkMode ? colours.dark.text : colours.light.text,
        padding: componentTokens.card.base.padding,
        borderRadius: componentTokens.card.base.borderRadius,
        boxShadow: componentTokens.card.base.boxShadow,
        transition: 'box-shadow 0.3s ease, transform 0.3s ease',
        selectors: {
            ':hover': {
                boxShadow: componentTokens.card.hover.boxShadow,
                transform: componentTokens.card.hover.transform,
            },
        },
    });

    const style: React.CSSProperties = { '--animation-delay': `${animationDelay}s` } as React.CSSProperties;


    // Find instruction for this client email
    const matchingInstruction = allInstructions.find(
        (inst) => inst.Email && inst.Email.toLowerCase() === String(client.ClientEmail).toLowerCase()
    );
    const statusText = matchingInstruction
        ? matchingInstruction.Stage || 'Found'
        : (client.HasSubmitted ? (client.HasSubmitted === '1' ? 'completed' : 'initialised') : undefined);

    return (
        <div className={cardClass} style={style}>
            {/* Header Section */}
            <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
                        {client.ClientEmail || 'Client'}
                    </Text>
                    {client.Lead && (
                        <div style={{
                            padding: '2px 8px',
                            backgroundColor: colours.blue,
                            color: 'white',
                            borderRadius: '12px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                        }}>
                            Lead Client
                        </div>
                    )}
                </div>

                {/* Instruction Status Section */}
                <div style={{
                    padding: '8px',
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                    borderRadius: '4px',
                    marginBottom: '8px'
                }}>
                    {matchingInstruction ? (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer'
                            }}
                            onClick={() => onOpenInstruction && onOpenInstruction(matchingInstruction.InstructionRef)}
                            title="Click to view instruction"
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Icon iconName="CheckMark" styles={{ root: { fontSize: '14px', color: colours.green } }} />
                                <div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: colours.blue }}>
                                        {matchingInstruction.InstructionRef}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#666' }}>
                                        Status: {matchingInstruction.Stage || 'Active'}
                                    </div>
                                </div>
                            </div>
                            <Icon iconName="NavigateExternalInline" styles={{ root: { fontSize: '12px', color: colours.blue } }} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Icon iconName="Warning" styles={{ root: { fontSize: '14px', color: colours.orange } }} />
                            <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: colours.orange }}>
                                    No Instruction Found
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#666' }}>
                                    Status: {statusText || 'Pending'}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Quick Client Summary */}
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', 
                    gap: '8px',
                    fontSize: '0.8rem'
                }}>
                    {client.HasSubmitted !== undefined && (
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Submitted</div>
                            <div style={{ 
                                fontWeight: 600,
                                color: client.HasSubmitted === '1' ? colours.green : colours.orange
                            }}>
                                {client.HasSubmitted === '1' ? 'Yes' : 'No'}
                            </div>
                        </div>
                    )}
                    {Object.keys(categories.contact).length > 1 && (
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>Contact Info</div>
                            <div style={{ fontWeight: 600 }}>
                                {Object.keys(categories.contact).length} fields
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Expandable Sections */}
            <div style={{ marginBottom: '8px' }}>
                {/* Identity Details */}
                {Object.keys(categories.identity).length > 0 && (
                    <div style={{ marginBottom: '4px' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 8px',
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s ease'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleSection('identity');
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Icon iconName="Contact" styles={{ root: { fontSize: '14px', color: colours.blue } }} />
                                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Identity</span>
                            </div>
                            <Icon 
                                iconName={expandedSection === 'identity' ? 'ChevronUp' : 'ChevronDown'} 
                                styles={{ root: { fontSize: '12px' } }} 
                            />
                        </div>
                        {expandedSection === 'identity' && (
                            <div style={{
                                padding: '8px',
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                                borderRadius: '4px',
                                marginTop: '4px'
                            }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', fontSize: '0.8rem' }}>
                                    {Object.entries(categories.identity).map(([k, v]) => (
                                        <div key={k}>
                                            <div style={{ fontWeight: 600, color: '#666', marginBottom: '2px' }}>{k}</div>
                                            <div>{typeof v === 'object' ? (Array.isArray(v) ? `Array (${v.length} items)` : 'Object') : String(v)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Contact Details */}
                {Object.keys(categories.contact).length > 0 && (
                    <div style={{ marginBottom: '4px' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 8px',
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s ease'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleSection('contact');
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Icon iconName="Phone" styles={{ root: { fontSize: '14px', color: colours.green } }} />
                                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Contact Info</span>
                            </div>
                            <Icon 
                                iconName={expandedSection === 'contact' ? 'ChevronUp' : 'ChevronDown'} 
                                styles={{ root: { fontSize: '12px' } }} 
                            />
                        </div>
                        {expandedSection === 'contact' && (
                            <div style={{
                                padding: '8px',
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                                borderRadius: '4px',
                                marginTop: '4px'
                            }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', fontSize: '0.8rem' }}>
                                    {Object.entries(categories.contact).map(([k, v]) => (
                                        <div key={k}>
                                            <div style={{ fontWeight: 600, color: '#666', marginBottom: '2px' }}>{k}</div>
                                            <div>{typeof v === 'object' ? (Array.isArray(v) ? `Array (${v.length} items)` : 'Object') : String(v)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Deal Relationship Details */}
                {Object.keys(categories.relationship).length > 0 && (
                    <div style={{ marginBottom: '4px' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 8px',
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s ease'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleSection('relationship');
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Icon iconName="Link" styles={{ root: { fontSize: '14px', color: colours.blue } }} />
                                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Deal Relationship</span>
                            </div>
                            <Icon 
                                iconName={expandedSection === 'relationship' ? 'ChevronUp' : 'ChevronDown'} 
                                styles={{ root: { fontSize: '12px' } }} 
                            />
                        </div>
                        {expandedSection === 'relationship' && (
                            <div style={{
                                padding: '8px',
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                                borderRadius: '4px',
                                marginTop: '4px'
                            }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', fontSize: '0.8rem' }}>
                                    {Object.entries(categories.relationship).map(([k, v]) => (
                                        <div key={k}>
                                            <div style={{ fontWeight: 600, color: '#666', marginBottom: '2px' }}>{k}</div>
                                            <div>{typeof v === 'object' ? (Array.isArray(v) ? `Array (${v.length} items)` : 'Object') : String(v)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Status Details */}
                {Object.keys(categories.status).length > 0 && (
                    <div style={{ marginBottom: '4px' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 8px',
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s ease'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleSection('status');
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Icon iconName="StatusCircleCheckmark" styles={{ root: { fontSize: '14px', color: colours.orange } }} />
                                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Submission Status</span>
                            </div>
                            <Icon 
                                iconName={expandedSection === 'status' ? 'ChevronUp' : 'ChevronDown'} 
                                styles={{ root: { fontSize: '12px' } }} 
                            />
                        </div>
                        {expandedSection === 'status' && (
                            <div style={{
                                padding: '8px',
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                                borderRadius: '4px',
                                marginTop: '4px'
                            }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', fontSize: '0.8rem' }}>
                                    {Object.entries(categories.status).map(([k, v]) => (
                                        <div key={k}>
                                            <div style={{ fontWeight: 600, color: '#666', marginBottom: '2px' }}>{k}</div>
                                            <div style={{ 
                                                color: k === 'HasSubmitted' ? (v ? colours.green : colours.orange) : 'inherit' 
                                            }}>
                                                {k === 'HasSubmitted' ? (v ? 'Yes' : 'No') : 
                                                 k === 'SubmissionDateTime' ? (v ? new Date(String(v)).toLocaleString() : 'Not submitted') :
                                                 (typeof v === 'object' ? JSON.stringify(v) : String(v))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Additional Details */}
                {Object.keys(categories.other).length > 0 && (
                    <div style={{ marginBottom: '4px' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 8px',
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s ease'
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleSection('additional');
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Icon iconName="More" styles={{ root: { fontSize: '14px', color: '#666' } }} />
                                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Additional Details</span>
                            </div>
                            <Icon 
                                iconName={expandedSection === 'additional' ? 'ChevronUp' : 'ChevronDown'} 
                                styles={{ root: { fontSize: '12px' } }} 
                            />
                        </div>
                        {expandedSection === 'additional' && (
                            <div style={{
                                padding: '8px',
                                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                                borderRadius: '4px',
                                marginTop: '4px'
                            }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', fontSize: '0.8rem' }}>
                                    {Object.entries(categories.other).map(([k, v]) => (
                                        <div key={k}>
                                            <div style={{ fontWeight: 600, color: '#666', marginBottom: '2px' }}>{k}</div>
                                            <div>{typeof v === 'object' ? (Array.isArray(v) ? `Array (${v.length} items)` : 'Object') : String(v)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}; 

export default JointClientCard;
