import React, { useState, useEffect, useCallback } from 'react';
import { IconButton, Text, Modal, Icon } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';

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

interface Resource {
    title: string;
    url: string;
    icon: string;
    description?: string;
}

// SVG icon imports for checking
const svgIcons = [asanaIcon, nuclinoIcon, clioIcon, netdocumentsIcon, activecampaignIcon, bundledocsIcon, leapsomeIcon, harveyIcon, lexisnexisIcon, thompsonReutersIcon, landRegistryIcon];

// Section config with accent colors
const sectionConfig: Record<string, { label: string; color: string }> = {
    'Core Business Tools': { label: 'Core Tools', color: '#3690CE' },
    'Legal & Research': { label: 'Legal & Research', color: '#16a34a' },
    'Document & Case Management': { label: 'Documents', color: '#7c3aed' },
    'Analytics & Development': { label: 'Analytics & Dev', color: '#ea580c' },
    'Collaboration & HR': { label: 'Collaboration', color: '#0891b2' },
};

// Resource card component - matching FormCard style
const ResourceCard: React.FC<{
    resource: Resource;
    accentColor: string;
    isDarkMode: boolean;
    isFavorite: boolean;
    onOpen: () => void;
    onCopyLink: () => void;
    onToggleFavorite: () => void;
}> = ({ resource, accentColor, isDarkMode, isFavorite, onOpen, onCopyLink, onToggleFavorite }) => {
    const [isHovered, setIsHovered] = useState(false);

    // Colors matching ImmediateActionChip
    const bg = isDarkMode ? 'rgba(30, 41, 59, 0.7)' : '#ffffff';
    const bgHover = isDarkMode ? 'rgba(30, 41, 59, 0.85)' : '#f8fafc';
    const border = isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)';
    const borderHover = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(0, 0, 0, 0.12)';
    const text = isDarkMode ? '#f1f5f9' : '#1e293b';
    const textMuted = isDarkMode ? '#94a3b8' : '#64748b';

    const isSvgIcon = svgIcons.includes(resource.icon);

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                display: 'flex',
                alignItems: 'stretch',
                background: isHovered ? bgHover : bg,
                border: `1px solid ${isHovered ? borderHover : border}`,
                borderLeft: `3px solid ${accentColor}`,
                boxShadow: isHovered 
                    ? (isDarkMode ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.08)')
                    : (isDarkMode ? '0 1px 3px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.04)'),
                transition: 'all 0.15s ease',
                cursor: 'pointer',
                minWidth: '280px',
                maxWidth: '360px',
                flex: '1 1 280px',
            }}
            onClick={onOpen}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onOpen()}
        >
            {/* Icon */}
            <div style={{
                width: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}>
                {isSvgIcon ? (
                    <img 
                        src={resource.icon} 
                        alt="" 
                        style={{ 
                            width: 22, 
                            height: 22,
                            filter: isDarkMode ? 'brightness(0) invert(1) opacity(0.85)' : 'none',
                        }} 
                    />
                ) : (
                    <Icon iconName={resource.icon} style={{ fontSize: 18, color: accentColor }} />
                )}
            </div>

            {/* Content */}
            <div style={{ 
                flex: 1, 
                padding: '12px 12px 12px 0',
                minWidth: 0,
            }}>
                <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: text,
                    marginBottom: resource.description ? 3 : 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}>
                    {resource.title}
                </div>
                {resource.description && (
                    <div style={{
                        fontSize: 11,
                        color: textMuted,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        {resource.description}
                    </div>
                )}
            </div>

            {/* Actions */}
            {isHovered && (
                <div 
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        paddingRight: 8,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <IconButton
                        iconProps={{ iconName: isFavorite ? 'FavoriteStarFill' : 'FavoriteStar' }}
                        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite();
                        }}
                        styles={{
                            root: {
                                width: 28,
                                height: 28,
                                color: isFavorite ? '#f59e0b' : textMuted,
                            },
                            rootHovered: {
                                background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            },
                        }}
                    />
                    <IconButton
                        iconProps={{ iconName: 'Copy' }}
                        title="Copy link"
                        onClick={(e) => {
                            e.stopPropagation();
                            onCopyLink();
                        }}
                        styles={{
                            root: {
                                width: 28,
                                height: 28,
                                color: textMuted,
                            },
                            rootHovered: {
                                background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            },
                        }}
                    />
                    <IconButton
                        iconProps={{ iconName: 'OpenInNewWindow' }}
                        title="Open in new tab"
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpen();
                        }}
                        styles={{
                            root: {
                                width: 28,
                                height: 28,
                                color: textMuted,
                            },
                            rootHovered: {
                                background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            },
                        }}
                    />
                </div>
            )}
        </div>
    );
};

const ResourcesModal: React.FC<ResourcesModalProps> = ({
    isOpen,
    onDismiss,
}) => {
    const { isDarkMode } = useTheme();
    const [favorites, setFavorites] = useState<Resource[]>([]);
    const [copiedLink, setCopiedLink] = useState<string | null>(null);

    // Load favorites from localStorage
    useEffect(() => {
        const savedFavorites = localStorage.getItem('resourcesFavorites');
        if (savedFavorites) {
            setFavorites(JSON.parse(savedFavorites));
        }
    }, []);

    // Resources data - organized by category
    const resourceSections: { title: string; resources: Resource[] }[] = [
        {
            title: 'Core Business Tools',
            resources: [
                { title: 'Asana', url: 'https://app.asana.com/', icon: asanaIcon, description: 'Project management' },
                { title: 'Nuclino', url: 'https://www.nuclino.com/', icon: nuclinoIcon, description: 'Knowledge base' },
                { title: 'Clio', url: 'https://eu.app.clio.com/nc/#/', icon: clioIcon, description: 'Practice management' },
                { title: 'NetDocuments', url: 'https://eu.netdocuments.com/neWeb2/home', icon: netdocumentsIcon, description: 'Document management' },
                { title: 'ActiveCampaign', url: 'https://helix-law54533.activehosted.com/', icon: activecampaignIcon, description: 'Marketing automation' }
            ]
        },
        {
            title: 'Legal & Research',
            resources: [
                { title: 'LexisNexis', url: 'https://www.lexisnexis.com/en-us/gateway.page', icon: lexisnexisIcon, description: 'Legal research' },
                { title: 'Thomson Reuters', url: 'https://www.thomsonreuters.com/en.html', icon: thompsonReutersIcon, description: 'Legal research' },
                { title: 'Land Registry', url: 'https://www.gov.uk/government/organisations/land-registry', icon: landRegistryIcon, description: 'Property searches' },
                { title: 'Companies House', url: 'https://www.gov.uk/government/organisations/companies-house', icon: 'CityNext2', description: 'Company searches' }
            ]
        },
        {
            title: 'Document & Case Management', 
            resources: [
                { title: 'BundleDocs', url: 'https://www.bundledocs.com/', icon: bundledocsIcon, description: 'Court bundles' },
                { title: 'CC-Filing', url: 'https://efile.cefile-app.com/login?referer=%2F', icon: thompsonReutersIcon, description: 'E-filing' },
                { title: 'Harvey', url: 'https://www.harvey.ai/', icon: harveyIcon, description: 'AI legal assistant' }
            ]
        },
        {
            title: 'Analytics & Development',
            resources: [
                { title: 'Power BI', url: 'https://app.powerbi.com/home', icon: 'BarChartVertical', description: 'Business analytics' },
                { title: 'Azure', url: 'https://portal.azure.com/#home', icon: 'Cloud', description: 'Cloud platform' },
                { title: 'Power Automate', url: 'https://make.powerautomate.com/', icon: 'Flow', description: 'Workflow automation' },
                { title: 'GitHub', url: 'https://github.com/', icon: 'GitGraph', description: 'Code repository' },
                { title: 'Postman', url: 'https://identity.getpostman.com/', icon: 'WebAppBuilderFragment', description: 'API testing' }
            ]
        },
        {
            title: 'Collaboration & HR',
            resources: [
                { title: 'Leapsome', url: 'https://www.leapsome.com/app/#/dashboard?init=true', icon: leapsomeIcon, description: 'Performance management' },
                { title: 'Miro', url: 'https://miro.com/login/', icon: 'Whiteboard', description: 'Collaborative whiteboard' },
                { title: 'Psychometric Testing', url: 'https://links.helix-law.co.uk/assessment', icon: 'TestBeaker', description: 'Assessments' },
                { title: 'Cognito Forms', url: 'https://www.cognitoforms.com/helix1', icon: 'FormLibrary', description: 'Form builder' }
            ]
        }
    ];

    const handleCopyLink = useCallback((url: string) => {
        navigator.clipboard.writeText(url);
        setCopiedLink(url);
        setTimeout(() => setCopiedLink(null), 2000);
    }, []);

    const handleOpenResource = useCallback((url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    }, []);

    const toggleFavorite = useCallback((resource: Resource) => {
        setFavorites((prev) => {
            const isFavorite = prev.some((fav) => fav.title === resource.title);
            const updated = isFavorite 
                ? prev.filter((fav) => fav.title !== resource.title)
                : [...prev, resource];
            localStorage.setItem('resourcesFavorites', JSON.stringify(updated));
            return updated;
        });
    }, []);

    // Build sections with favorites at top if any exist
    const sectionsToRender = favorites.length > 0 
        ? [{ title: 'Favorites', resources: favorites }, ...resourceSections]
        : resourceSections;

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
                    background: isDarkMode ? '#0f172a' : '#fafafa',
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
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}>
                {/* Clean header */}
                <div style={{
                    padding: '32px 48px 24px',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                    background: isDarkMode ? '#1e293b' : '#fff',
                    flexShrink: 0,
                }}>
                    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{
                                fontSize: '28px',
                                fontWeight: 600,
                                color: isDarkMode ? '#fff' : '#1a1a1a',
                                display: 'block',
                            }}>
                                Resources
                            </Text>
                            <IconButton
                                iconProps={{ iconName: 'Cancel' }}
                                onClick={onDismiss}
                                styles={{
                                    root: {
                                        width: 40,
                                        height: 40,
                                        borderRadius: '10px',
                                        background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                                    },
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Resources by section */}
                <div style={{ flex: 1, overflow: 'auto', padding: '24px 48px 48px' }}>
                    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                        {sectionsToRender.map((section) => {
                            const config = sectionConfig[section.title] || { label: section.title, color: '#3690CE' };
                            const isFavoritesSection = section.title === 'Favorites';
                            
                            return (
                                <div key={section.title} style={{ marginBottom: '28px' }}>
                                    <div style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: isDarkMode ? '#94a3b8' : '#64748b',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        marginBottom: '10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                    }}>
                                        <span style={{
                                            width: 3,
                                            height: 12,
                                            background: isFavoritesSection ? '#f59e0b' : config.color,
                                            borderRadius: 1,
                                        }} />
                                        {isFavoritesSection ? 'Favorites' : config.label}
                                        {isFavoritesSection && (
                                            <Icon iconName="FavoriteStarFill" style={{ fontSize: 10, color: '#f59e0b' }} />
                                        )}
                                    </div>
                                    <div style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '10px',
                                    }}>
                                        {section.resources.map((resource) => (
                                            <ResourceCard
                                                key={resource.title}
                                                resource={resource}
                                                accentColor={isFavoritesSection ? '#f59e0b' : config.color}
                                                isDarkMode={isDarkMode}
                                                isFavorite={favorites.some(f => f.title === resource.title)}
                                                onOpen={() => handleOpenResource(resource.url)}
                                                onCopyLink={() => handleCopyLink(resource.url)}
                                                onToggleFavorite={() => toggleFavorite(resource)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Copy confirmation toast */}
                    {copiedLink && (
                        <div style={{
                            position: 'fixed',
                            bottom: 24,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: isDarkMode ? '#1e293b' : '#1e293b',
                            color: '#fff',
                            padding: '10px 20px',
                            fontSize: 13,
                            fontWeight: 500,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            <Icon iconName="CheckMark" style={{ color: '#4ade80' }} />
                            Link copied
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default ResourcesModal;
