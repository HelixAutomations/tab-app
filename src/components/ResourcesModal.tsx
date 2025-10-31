import React, { useState, useEffect, useCallback } from 'react';
import { IconButton, Text, SearchBox, Modal, ActionButton, MessageBar, MessageBarType } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import './PremiumModal.css';

// Import Custom SVG Icons (original provider logos)
import asanaIcon from '../assets/asana.svg';
import nuclinoIcon from '../assets/nuclino.svg';
import clioIcon from '../assets/clio.svg';
import netdocumentsIcon from '../assets/netdocuments.svg';
import activecampaignIcon from '../assets/activecampaign.svg';
import bundledocsIcon from '../assets/bundledocs.svg';
import leapsomeIcon from '../assets/leapsome.svg';
import harveyIcon from '../assets/harvey.svg';
import lexisnexisIcon from '../assets/lexisnexis.svg';
import thompsonReutersIcon from '../assets/thompson-reuters.svg';
import landRegistryIcon from '../assets/land-registry.svg';

interface ResourcesModalProps {
    isOpen: boolean;
    onDismiss: () => void;
}

// Enhanced colorless icons for resources
const resourceIcons = [
    'FileTemplate',
    'DocumentSet', 
    'ReportDocument',
    'DatabaseSync',
    'CloudAdd',
    'ContactCard',
    'TaskManager',
    'CalculatorAddition',
    'BarChartVertical',
    'ConfigurationSolid',
    'WorldClock',
    'TagSolid',
    'LockSolid',
    'PasswordField',
    'PaymentCard',
    'CalendarDay',
    'DateTime',
    'FlagFilled',
    'CellPhone',
    'MailAlert'
];

const ResourceItemComponent: React.FC<{
    title: string;
    description?: string;
    index: number;
    onClick: () => void;
    isDarkMode: boolean;
}> = ({ title, description, index, onClick, isDarkMode }) => {
    // Use different icons based on index for variety
    const iconName = resourceIcons[index % resourceIcons.length];
    
    return (
        <div
            onClick={onClick}
            className="premiumModalItem"
            style={{
                padding: '20px 24px',
                borderRadius: '16px',
                cursor: 'pointer',
                backgroundColor: isDarkMode ? 'rgba(17, 24, 39, 0.72)' : '#ffffff',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(0,0,0,0.06)'}`,
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                animation: `modalItemFadeIn 0.4s ease ${index * 0.03}s both`,
                marginBottom: '12px',
                boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(0,0,0,0.04)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : '#f8f9fa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#6a6a6a',
                }}>
                    <IconButton
                        iconProps={{ iconName }}
                        styles={{
                            root: { width: 28, height: 28 },
                            icon: { fontSize: 18, color: 'inherit' }
                        }}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <Text
                        variant="mediumPlus"
                        style={{
                            fontWeight: 600,
                            color: isDarkMode ? '#ffffff' : '#000000',
                            marginBottom: description ? '6px' : '0',
                            display: 'block',
                        }}
                    >
                        {title}
                    </Text>
                    {description && (
                        <Text
                            variant="small"
                            style={{
                                color: isDarkMode ? '#cccccc' : '#666666',
                                lineHeight: '1.5',
                            }}
                        >
                            {description}
                        </Text>
                    )}
                </div>
                <IconButton
                    iconProps={{ iconName: 'ChevronRight' }}
                    styles={{
                        root: { 
                            width: 36, 
                            height: 36,
                            color: isDarkMode ? '#666666' : '#999999',
                        }
                    }}
                />
            </div>
        </div>
    );
};

const ResourcesModal: React.FC<ResourcesModalProps> = ({
    isOpen,
    onDismiss,
}) => {
    const { isDarkMode } = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [favorites, setFavorites] = useState<Resource[]>([]);
    const [recentResources, setRecentResources] = useState<string[]>([]);
    const [copySuccess, setCopySuccess] = useState<string | null>(null);
    // Load favorites from localStorage
    useEffect(() => {
        const savedFavorites = localStorage.getItem('resourcesFavorites');
        const savedRecent = localStorage.getItem('resources-recent');
        
        if (savedFavorites) {
            setFavorites(JSON.parse(savedFavorites));
        }
        if (savedRecent) {
            setRecentResources(JSON.parse(savedRecent));
        }
    }, []);

    // Define resource type interface
    interface Resource {
        title: string;
        url: string;
        icon: string;
    }

    interface ResourceSection {
        title: string;
        resources: Resource[];
    }

    // Resources data structure - organized by logical groups
    const resourceSections = [
        {
            title: 'Favorites',
            resources: favorites // Now populated from actual favorites
        },
        {
            title: 'Core Business Tools',
            resources: [
                { title: 'Asana', url: 'https://app.asana.com/', icon: asanaIcon },
                { title: 'Nuclino', url: 'https://www.nuclino.com/', icon: nuclinoIcon },
                { title: 'Clio', url: 'https://eu.app.clio.com/nc/#/', icon: clioIcon },
                { title: 'NetDocuments', url: 'https://eu.netdocuments.com/neWeb2/home', icon: netdocumentsIcon },
                { title: 'ActiveCampaign', url: 'https://helix-law54533.activehosted.com/', icon: activecampaignIcon }
            ]
        },
        {
            title: 'Legal & Research',
            resources: [
                { title: 'LexisNexis', url: 'https://www.lexisnexis.com/en-us/gateway.page', icon: lexisnexisIcon },
                { title: 'Thompson Reuters', url: 'https://www.thomsonreuters.com/en.html', icon: thompsonReutersIcon },
                { title: 'Land Registry', url: 'https://www.gov.uk/government/organisations/land-registry', icon: landRegistryIcon },
                { title: 'Companies House', url: 'https://www.gov.uk/government/organisations/companies-house', icon: 'BuildingRetail' }
            ]
        },
        {
            title: 'Document & Case Management', 
            resources: [
                { title: 'BundleDocs', url: 'https://www.bundledocs.com/', icon: bundledocsIcon },
                { title: 'CC-Filing', url: 'https://efile.cefile-app.com/login?referer=%2F', icon: thompsonReutersIcon },
                { title: 'Harvey', url: 'https://www.harvey.ai/', icon: harveyIcon }
            ]
        },
        {
            title: 'Analytics & Development',
            resources: [
                { title: 'Power BI', url: 'https://app.powerbi.com/home', icon: 'BarChartVertical' },
                { title: 'Azure', url: 'https://portal.azure.com/#home', icon: 'Cloud' },
                { title: 'Power Automate', url: 'https://make.powerautomate.com/', icon: 'Flow' },
                { title: 'GitHub', url: 'https://github.com/', icon: 'GitLogo' },
                { title: 'Postman', url: 'https://identity.getpostman.com/', icon: 'APIManagement' }
            ]
        },
        {
            title: 'Collaboration & HR',
            resources: [
                { title: 'Leapsome', url: 'https://www.leapsome.com/app/#/dashboard?init=true', icon: leapsomeIcon },
                { title: 'Miro', url: 'https://miro.com/login/', icon: 'Whiteboard' },
                { title: 'Psychometric Testing', url: 'https://links.helix-law.co.uk/assessment', icon: 'TestBeaker' },
                { title: 'Cognito', url: 'https://www.cognitoforms.com/helix1', icon: 'FormLibrary' }
            ]
        }
    ];

    const filteredSections = resourceSections.map(section => ({
        ...section,
        resources: section.resources.filter((resource: Resource) =>
            resource.title.toLowerCase().includes(searchQuery.toLowerCase())
        )
    })).filter(section => section.resources.length > 0 || section.title === 'Favorites');

    const handleResourceClick = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        
        // Add to recent resources
        const resourceTitle = url; // Could be improved to store actual title
        const newRecent = [resourceTitle, ...recentResources.filter(r => r !== resourceTitle)].slice(0, 5);
        setRecentResources(newRecent);
        localStorage.setItem('resources-recent', JSON.stringify(newRecent));
    };

    // Handle Copy to Clipboard
    const copyToClipboard = useCallback(
        (url: string, title: string) => {
            navigator.clipboard
                .writeText(url)
                .then(() => {
                    setCopySuccess(`Copied '${title}' link to clipboard!`);
                    setTimeout(() => setCopySuccess(null), 3000);
                })
                .catch((err) => {
                    console.error('Failed to copy: ', err);
                });
        },
        []
    );

    // Handle Toggle Favorite
    const toggleFavorite = useCallback((resource: Resource) => {
        setFavorites((prev) => {
            const isFavorite = prev.some((fav: Resource) => fav.title === resource.title);
            let updatedFavorites: Resource[];

            if (isFavorite) {
                updatedFavorites = prev.filter((fav: Resource) => fav.title !== resource.title);
            } else {
                updatedFavorites = [...prev, resource];
            }

            localStorage.setItem('resourcesFavorites', JSON.stringify(updatedFavorites));
            return updatedFavorites;
        });
    }, []);

    return (
        <Modal
            isOpen={isOpen}
            onDismiss={onDismiss}
            isBlocking={false}
            styles={{
                main: {
                    width: '100vw',
                    height: '100vh',
                    maxWidth: 'none',
                    maxHeight: 'none',
                    margin: 0,
                    borderRadius: 0,
                    background: isDarkMode
                        ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 30%, #334155 65%, #475569 100%)'
                        : '#ffffff',
                },
                scrollableContent: {
                    height: '100vh',
                }
            }}
        >
            <div style={{
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                animation: 'modalSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}>
                {/* Header */}
                <div style={{
                    padding: '32px 64px',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(0,0,0,0.06)'}`,
                    background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#fafbfc',
                }}>
                    <div style={{
                        maxWidth: '1400px',
                        margin: '0 auto',
                        width: '100%',
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '24px',
                        }}>
                            <Text
                                variant="xxLarge"
                                style={{
                                    fontWeight: 700,
                                    color: isDarkMode ? '#ffffff' : '#000000',
                                    letterSpacing: '-0.02em',
                                }}
                            >
                                Resources & Tools
                            </Text>
                            <ActionButton
                                iconProps={{ iconName: 'Cancel' }}
                                onClick={onDismiss}
                                styles={{
                                    root: {
                                        minWidth: 48,
                                        height: 48,
                                        borderRadius: '12px',
                                        backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : '#f0f2f5',
                                    }
                                }}
                            />
                        </div>
                        
                        <SearchBox
                            placeholder="Search resources and tools..."
                            value={searchQuery}
                            onChange={(_, newValue) => setSearchQuery(newValue || '')}
                            styles={{
                                root: {
                                    maxWidth: '500px',
                                    borderRadius: '16px',
                                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(0,0,0,0.06)'}`,
                                    backgroundColor: isDarkMode ? 'rgba(17, 24, 39, 0.72)' : '#ffffff',
                                    boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(0,0,0,0.08)',
                                },
                                field: {
                                    backgroundColor: 'transparent',
                                    color: isDarkMode ? '#ffffff' : '#000000',
                                    fontSize: '16px',
                                    padding: '16px 20px',
                                },
                            }}
                        />
                    </div>
                </div>

                {/* Main Content */}
                <div style={{ 
                    flex: 1, 
                    overflow: 'auto',
                    padding: '32px 64px',
                }}>
                    <div style={{
                        maxWidth: '1400px',
                        margin: '0 auto',
                        width: '100%',
                    }}>
                        {filteredSections.map((section, sectionIndex) => (
                            <div key={section.title} style={{ marginBottom: '48px' }}>
                                <div style={{ marginBottom: '24px' }}>
                                    <Text
                                        variant="xLarge"
                                        style={{
                                            fontWeight: 600,
                                            color: isDarkMode ? '#ffffff' : '#000000',
                                            display: 'block',
                                        }}
                                    >
                                        {section.title}
                                    </Text>
                                </div>
                                
                                {section.resources.length > 0 ? (
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                                        gap: '20px',
                                    }}>
                                        {section.resources.map((resource: Resource, index: number) => (
                                            <div
                                                key={resource.title}
                                                className="premiumModalItem"
                                                style={{
                                                    padding: '20px 24px',
                                                    borderRadius: '16px',
                                                    cursor: 'default',
                                                    backgroundColor: isDarkMode ? 'rgba(17, 24, 39, 0.72)' : '#ffffff',
                                                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(0,0,0,0.06)'}`,
                                                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                                                    animation: `modalItemFadeIn 0.4s ease ${(sectionIndex * 2 + index) * 0.03}s both`,
                                                    boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(0,0,0,0.04)',
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                                    <div style={{
                                                        width: '48px',
                                                        height: '48px',
                                                        borderRadius: '12px',
                                                        backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : '#f8f9fa',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '20px',
                                                        color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#6a6a6a',
                                                    }}>
                                                        {[asanaIcon, nuclinoIcon, clioIcon, netdocumentsIcon, activecampaignIcon, bundledocsIcon, leapsomeIcon, harveyIcon, lexisnexisIcon, thompsonReutersIcon, landRegistryIcon].includes(resource.icon) ? (
                                                            <img 
                                                                src={resource.icon} 
                                                                alt={resource.title}
                                                                style={{ width: 28, height: 28 }}
                                                            />
                                                        ) : (
                                                            <IconButton
                                                                iconProps={{ iconName: resource.icon as string }}
                                                                styles={{
                                                                    root: { width: 28, height: 28 },
                                                                    icon: { fontSize: 18, color: 'inherit' }
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <Text
                                                            variant="mediumPlus"
                                                            style={{
                                                                fontWeight: 600,
                                                                color: isDarkMode ? '#ffffff' : '#000000',
                                                                display: 'block',
                                                            }}
                                                        >
                                                            {resource.title}
                                                        </Text>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <IconButton
                                                            iconProps={{ 
                                                                iconName: favorites.some((fav: Resource) => fav.title === resource.title) ? 'FavoriteStarFill' : 'FavoriteStar' 
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleFavorite(resource);
                                                            }}
                                                            styles={{
                                                                root: { 
                                                                    width: 36, 
                                                                    height: 36,
                                                                    color: favorites.some((fav: Resource) => fav.title === resource.title) 
                                                                        ? '#FFD700' 
                                                                        : isDarkMode ? '#666666' : '#999999',
                                                                }
                                                            }}
                                                        />
                                                        <IconButton
                                                            iconProps={{ iconName: 'Copy' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                copyToClipboard(resource.url, resource.title);
                                                            }}
                                                            styles={{
                                                                root: { 
                                                                    width: 36, 
                                                                    height: 36,
                                                                    color: isDarkMode ? '#666666' : '#999999',
                                                                }
                                                            }}
                                                        />
                                                        <IconButton
                                                            iconProps={{ iconName: 'OpenInNewWindow' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleResourceClick(resource.url);
                                                            }}
                                                            styles={{
                                                                root: { 
                                                                    width: 36, 
                                                                    height: 36,
                                                                    color: isDarkMode ? '#666666' : '#999999',
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    section.title === 'Favorites' && (
                                        <Text
                                            variant="medium"
                                            style={{
                                                color: isDarkMode ? '#888888' : '#666666',
                                                fontStyle: 'italic',
                                                textAlign: 'center',
                                                padding: '32px',
                                            }}
                                        >
                                            No favorite resources yet. Star resources to add them here.
                                        </Text>
                                    )
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Copy Confirmation Message */}
            {copySuccess && (
                <MessageBar
                    messageBarType={MessageBarType.success}
                    isMultiline={false}
                    onDismiss={() => setCopySuccess(null)}
                    dismissButtonAriaLabel="Close"
                    styles={{
                        root: {
                            position: 'fixed',
                            bottom: 20,
                            right: 20,
                            maxWidth: '300px',
                            zIndex: 1000,
                            borderRadius: '8px',
                            backgroundColor: '#4caf50',
                            color: 'white',
                        },
                    }}
                >
                    {copySuccess}
                </MessageBar>
            )}
        </Modal>
    );
};

export default ResourcesModal;
