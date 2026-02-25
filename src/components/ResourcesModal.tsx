import React, { useState, useEffect, useCallback, useRef } from 'react';
import { IconButton, Text, Modal, Icon, Stack, DefaultButton, Spinner, SpinnerSize } from '@fluentui/react';
import { app } from '@microsoft/teams-js';
import { useTheme } from '../app/functionality/ThemeContext';
import { isInTeams } from '../app/functionality/isInTeams';
import type { UserData } from '../app/functionality/types';
import { colours } from '../app/styles/colours';

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
    userData?: UserData[] | null;
    demoModeEnabled?: boolean;
    isLocalDev?: boolean;
    viewAsProd?: boolean;
}

interface Resource {
    title: string;
    url: string;
    icon: string;
    description?: string;
}

interface ClioContactResult {
    id: string;
    name: string;
    email: string;
}

interface ClioMatterResult {
    id: string;
    displayNumber: string;
    description: string;
}

interface AsanaTaskResult {
    id: string;
    name: string;
    completed: boolean;
    dueOn?: string;
    assigneeName?: string;
    assigneeEmail?: string;
    url?: string;
    projects?: string[];
    tags?: string[];
    workspace?: string;
    notes?: string;
    createdAt?: string;
    updatedAt?: string;
}

interface AsanaTeamResult {
    id: string;
    name: string;
}

interface AsanaProjectResult {
    id: string;
    name: string;
    archived?: boolean;
}

interface AsanaSectionResult {
    id: string;
    name: string;
    tasks?: AsanaSiloTask[];
    error?: string;
}

interface AsanaSiloTask {
    id: string;
    name: string;
    completed: boolean;
    assigneeName?: string;
    assigneeEmail?: string;
    dueOn?: string;
    url?: string;
}

interface AsanaUserResult {
    id: string;
    name: string;
    email?: string;
}

interface NetDocumentsWorkspaceResult {
    id?: string;
    name?: string;
    url?: string;
    client?: string;
    clientId?: string;
    matter?: string;
    matterKey?: string;
    createdBy?: string;
    modifiedBy?: string;
    archived?: boolean;
    deleted?: boolean;
}

interface NetDocumentsContainerItem {
    id?: string;
    name?: string;
    type?: 'document' | 'container';
    extension?: string;
    size?: number;
    modified?: string;
    modifiedBy?: string;
    url?: string;
}

interface NetDocumentsDocumentResult {
    id?: string;
    name?: string;
    extension?: string;
    size?: number;
    version?: string;
    created?: string;
    createdBy?: string;
    modified?: string;
    modifiedBy?: string;
    locked?: boolean;
    url?: string;
}

interface NetDocumentsBreadcrumb {
    id: string;
    name: string;
    type: 'workspace' | 'folder';
}

// SVG icon imports for checking
const svgIcons = [asanaIcon, nuclinoIcon, clioIcon, netdocumentsIcon, activecampaignIcon, bundledocsIcon, leapsomeIcon, harveyIcon, lexisnexisIcon, thompsonReutersIcon, landRegistryIcon];

// Section config with accent colors
const sectionConfig: Record<string, { label: string; color: string }> = {
    'Core Business Tools': { label: 'Core Tools', color: colours.highlight },
    'Legal & Research': { label: 'Legal & Research', color: colours.green },
    'Document & Case Management': { label: 'Documents', color: colours.helixBlue },
    'Analytics & Development': { label: 'Analytics & Dev', color: colours.orange },
    'Collaboration & HR': { label: 'Collaboration', color: colours.darkBlue },
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
    showOpsBadge: boolean;
}> = ({ resource, accentColor, isDarkMode, isFavorite, onOpen, onCopyLink, onToggleFavorite, showOpsBadge }) => {
    const [isHovered, setIsHovered] = useState(false);
    const resourcesWithOperations = new Set(['Asana', 'Clio', 'Azure', 'NetDocuments']);
    const hasOperations = resourcesWithOperations.has(resource.title);

    const bg = isDarkMode ? colours.darkBlue : colours.light.cardBackground;
    const bgHover = isDarkMode ? colours.helixBlue : colours.light.cardHover;
    const border = isDarkMode ? colours.dark.border : colours.light.border;
    const borderHover = isDarkMode ? colours.dark.borderColor : colours.light.border;
    const text = isDarkMode ? colours.dark.text : colours.light.text;
    const textMuted = isDarkMode ? '#d1d5db' : '#374151';

    const isSvgIcon = svgIcons.includes(resource.icon);

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'stretch',
                background: isHovered ? bgHover : bg,
                border: `1px solid ${isHovered ? borderHover : border}`,
                borderLeft: `3px solid ${accentColor}`,
                boxShadow: 'none',
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
            {/* Ops Badge */}
            {hasOperations && showOpsBadge && (
                <div style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: isDarkMode ? colours.accent : colours.highlight,
                    boxShadow: 'none',
                    border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.border}`,
                    zIndex: 1,
                    pointerEvents: 'none'
                }} />
            )}

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
                    paddingRight: (hasOperations && showOpsBadge) ? 16 : 0
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
                        // Ensure actions sit above content but don't clash with ops badge
                        // Badge is top-right, actions are vertical center right...
                        // Actions are currently flex row on the right. 
                        // With absolute pos badge, hovering might cover badge or vice versa.
                        // Actions only appear on hover. 
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
                                color: isFavorite ? colours.orange : textMuted,
                            },
                            rootHovered: {
                                background: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
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
                                background: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
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
                                background: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
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
    userData,
    demoModeEnabled = false,
    isLocalDev = false,
    viewAsProd = false,
}) => {
    const { isDarkMode } = useTheme();
    const [favorites, setFavorites] = useState<Resource[]>([]);
    const [copiedLink, setCopiedLink] = useState<string | null>(null);
    const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
    const [azureUserQuery, setAzureUserQuery] = useState('');
    const [azureUserResult, setAzureUserResult] = useState<Record<string, string> | null>(null);
    const [azureUserError, setAzureUserError] = useState<string | null>(null);
    const [azureUserLoading, setAzureUserLoading] = useState(false);
    const [clioContactQuery, setClioContactQuery] = useState('');
    const [clioContactResult, setClioContactResult] = useState<ClioContactResult[]>([]);
    const [clioContactError, setClioContactError] = useState<string | null>(null);
    const [clioContactLoading, setClioContactLoading] = useState(false);
    const [clioMatterQuery, setClioMatterQuery] = useState('');
    const [clioMatterResult, setClioMatterResult] = useState<ClioMatterResult[]>([]);
    const [clioMatterError, setClioMatterError] = useState<string | null>(null);
    const [clioMatterLoading, setClioMatterLoading] = useState(false);
    const [netDocumentsClientId, setNetDocumentsClientId] = useState('');
    const [netDocumentsMatterKey, setNetDocumentsMatterKey] = useState('');
    const [netDocumentsWorkspaceResult, setNetDocumentsWorkspaceResult] = useState<NetDocumentsWorkspaceResult | null>(null);
    const [netDocumentsWorkspaceError, setNetDocumentsWorkspaceError] = useState<string | null>(null);
    const [netDocumentsWorkspaceLoading, setNetDocumentsWorkspaceLoading] = useState(false);
    const [netDocumentsUserResult, setNetDocumentsUserResult] = useState<any | null>(null);
    const [netDocumentsUserError, setNetDocumentsUserError] = useState<string | null>(null);
    const [netDocumentsUserLoading, setNetDocumentsUserLoading] = useState(false);
    const [netDocumentsBreadcrumbs, setNetDocumentsBreadcrumbs] = useState<NetDocumentsBreadcrumb[]>([]);
    const [netDocumentsContainerItems, setNetDocumentsContainerItems] = useState<NetDocumentsContainerItem[]>([]);
    const [netDocumentsContainerError, setNetDocumentsContainerError] = useState<string | null>(null);
    const [netDocumentsContainerLoading, setNetDocumentsContainerLoading] = useState(false);
    const [netDocumentsDocumentId, setNetDocumentsDocumentId] = useState('');
    const [netDocumentsDocumentResult, setNetDocumentsDocumentResult] = useState<NetDocumentsDocumentResult | null>(null);
    const [netDocumentsDocumentError, setNetDocumentsDocumentError] = useState<string | null>(null);
    const [netDocumentsDocumentLoading, setNetDocumentsDocumentLoading] = useState(false);
    const [netDocumentsSearchQuery, setNetDocumentsSearchQuery] = useState('');
    const [netDocumentsSearchLimit, setNetDocumentsSearchLimit] = useState('25');
    const [netDocumentsSearchResults, setNetDocumentsSearchResults] = useState<NetDocumentsContainerItem[]>([]);
    const [netDocumentsSearchError, setNetDocumentsSearchError] = useState<string | null>(null);
    const [netDocumentsSearchLoading, setNetDocumentsSearchLoading] = useState(false);
    const [showDevDetails, setShowDevDetails] = useState(false);
    const [asanaTaskId, setAsanaTaskId] = useState('');
    const [asanaTaskResult, setAsanaTaskResult] = useState<AsanaTaskResult | null>(null);
    const [asanaTaskError, setAsanaTaskError] = useState<string | null>(null);
    const [asanaTaskLoading, setAsanaTaskLoading] = useState(false);
    const [asanaUserEmail, setAsanaUserEmail] = useState('');
    const [asanaUserEntraId, setAsanaUserEntraId] = useState('');
    const [asanaUserInitials, setAsanaUserInitials] = useState('');
    const [asanaTeams, setAsanaTeams] = useState<AsanaTeamResult[]>([]);
    const [asanaTeamsLoading, setAsanaTeamsLoading] = useState(false);
    const [asanaTeamsError, setAsanaTeamsError] = useState<string | null>(null);
    const [asanaSelectedTeamId, setAsanaSelectedTeamId] = useState('');
    const [asanaProjects, setAsanaProjects] = useState<AsanaProjectResult[]>([]);
    const [asanaProjectsLoading, setAsanaProjectsLoading] = useState(false);
    const [asanaProjectsError, setAsanaProjectsError] = useState<string | null>(null);
    const [asanaSelectedProjectId, setAsanaSelectedProjectId] = useState('');
    const [asanaSections, setAsanaSections] = useState<AsanaSectionResult[]>([]);
    const [asanaSectionsLoading, setAsanaSectionsLoading] = useState(false);
    const [asanaSectionsError, setAsanaSectionsError] = useState<string | null>(null);
    const [asanaUsers, setAsanaUsers] = useState<AsanaUserResult[]>([]);
    const [asanaUsersLoading, setAsanaUsersLoading] = useState(false);
    const [asanaUsersError, setAsanaUsersError] = useState<string | null>(null);
    const [asanaOperation, setAsanaOperation] = useState<'silos' | 'users' | 'task'>('silos');
    const [columnsPerRow, setColumnsPerRow] = useState(1);
    const resourcesContainerRef = useRef<HTMLDivElement | null>(null);

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
        const copyToClipboard = async () => {
            try {
                await navigator.clipboard.writeText(url);
                setCopiedLink(url);
                setTimeout(() => setCopiedLink(null), 2000);
            } catch (err) {
                // Fallback for iframe/strict contexts (e.g. Teams tabs) 
                // where navigator.clipboard might be blocked.
                try {
                    const textArea = document.createElement('textarea');
                    textArea.value = url;
                    
                    // Ensure it's not visible but part of the DOM
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-9999px';
                    textArea.style.top = '0';
                    document.body.appendChild(textArea);
                    
                    textArea.focus();
                    textArea.select();
                    
                    const successful = document.execCommand('copy');
                    document.body.removeChild(textArea);
                    
                    if (successful) {
                        setCopiedLink(url);
                        setTimeout(() => setCopiedLink(null), 2000);
                    } else {
                        console.error('Fallback copy failed.');
                    }
                } catch (fallbackErr) {
                    console.error('Copy failed:', err, fallbackErr);
                }
            }
        };
        copyToClipboard();
    }, []);

    const handleSelectResource = useCallback((resource: Resource) => {
        setSelectedResource(resource);
    }, []);

    const handleOpenResource = useCallback((url: string) => {
        const openLink = async () => {
            if (isInTeams()) {
                try {
                    await app.openLink(url);
                    return;
                } catch {
                    // Fall back to browser navigation below.
                }
            }
            window.open(url, '_blank', 'noopener,noreferrer');
        };
        void openLink();
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

    useEffect(() => {
        const updateColumns = () => {
            const measuredWidth = resourcesContainerRef.current?.getBoundingClientRect().width ?? 0;
            const fallbackWidth = typeof window !== 'undefined'
                ? Math.min(1100, Math.max(0, window.innerWidth - 96))
                : 0;
            const width = measuredWidth > 200 ? measuredWidth : fallbackWidth;
            const next = Math.max(1, Math.floor(width / 300));
            setColumnsPerRow(next);
        };

        updateColumns();
        if (isOpen) {
            requestAnimationFrame(updateColumns);
            setTimeout(updateColumns, 50);
        }
        window.addEventListener('resize', updateColumns);
        return () => window.removeEventListener('resize', updateColumns);
    }, [isOpen]);

    useEffect(() => {
        let cancelled = false;
        const loadIdentity = async () => {
            let email = '';
            let entraId = '';
            let initials = '';

            const currentUser = userData?.[0];
            if (currentUser) {
                email = currentUser.Email || (currentUser as any).email || '';
                initials = currentUser.Initials || (currentUser as any).initials || '';
                entraId = currentUser.EntraID || (currentUser as any)['Entra ID'] || (currentUser as any).entra_id || '';
            }

            if (!email && !entraId && isInTeams()) {
                try {
                    const ctx = await app.getContext();
                    email = ctx.user?.userPrincipalName || ctx.user?.loginHint || '';
                    entraId = ctx.user?.id || '';
                } catch {
                    // Ignore Teams context errors for local mode.
                }
            }

            if (!email && !entraId) {
                try {
                    let bestTimestamp = 0;
                    for (let i = 0; i < localStorage.length; i += 1) {
                        const key = localStorage.key(i);
                        if (!key || !key.startsWith('userData-')) continue;
                        const raw = localStorage.getItem(key);
                        if (!raw) continue;
                        const parsed = JSON.parse(raw);
                        const timestamp = Number(parsed?.timestamp || 0);
                        if (timestamp <= bestTimestamp) continue;
                        const record = Array.isArray(parsed?.data) ? parsed.data[0] : null;
                        if (!record) continue;
                        bestTimestamp = timestamp;
                        email = record.Email || record.email || '';
                        initials = record.Initials || record.initials || '';
                        entraId = record.EntraID || record['Entra ID'] || record.entra_id || '';
                    }
                } catch {
                    // Ignore localStorage parse errors.
                }
            }

            if (cancelled) return;
            setAsanaUserEmail(email || '');
            setAsanaUserEntraId(entraId || '');
            setAsanaUserInitials(initials || '');
        };

        void loadIdentity();
        return () => {
            cancelled = true;
        };
    }, [userData]);

    useEffect(() => {
        if (selectedResource?.title !== 'Azure') {
            setAzureUserQuery('');
            setAzureUserResult(null);
            setAzureUserError(null);
            setAzureUserLoading(false);
        }
        if (selectedResource?.title !== 'Clio') {
            setClioContactQuery('');
            setClioContactResult([]);
            setClioContactError(null);
            setClioContactLoading(false);
            setClioMatterQuery('');
            setClioMatterResult([]);
            setClioMatterError(null);
            setClioMatterLoading(false);
        }
        if (selectedResource?.title !== 'NetDocuments') {
            setNetDocumentsClientId('');
            setNetDocumentsMatterKey('');
            setNetDocumentsWorkspaceResult(null);
            setNetDocumentsWorkspaceError(null);
            setNetDocumentsWorkspaceLoading(false);
            setNetDocumentsUserResult(null);
            setNetDocumentsUserError(null);
            setNetDocumentsUserLoading(false);
            setNetDocumentsBreadcrumbs([]);
            setNetDocumentsContainerItems([]);
            setNetDocumentsContainerError(null);
            setNetDocumentsContainerLoading(false);
            setNetDocumentsDocumentId('');
            setNetDocumentsDocumentResult(null);
            setNetDocumentsDocumentError(null);
            setNetDocumentsDocumentLoading(false);
            setNetDocumentsSearchQuery('');
            setNetDocumentsSearchLimit('25');
            setNetDocumentsSearchResults([]);
            setNetDocumentsSearchError(null);
            setNetDocumentsSearchLoading(false);
        }
        if (selectedResource?.title !== 'Asana') {
            setAsanaTaskId('');
            setAsanaTaskResult(null);
            setAsanaTaskError(null);
            setAsanaTaskLoading(false);
            setAsanaTeams([]);
            setAsanaTeamsError(null);
            setAsanaTeamsLoading(false);
            setAsanaSelectedTeamId('');
            setAsanaProjects([]);
            setAsanaProjectsError(null);
            setAsanaProjectsLoading(false);
            setAsanaSelectedProjectId('');
            setAsanaSections([]);
            setAsanaSectionsError(null);
            setAsanaSectionsLoading(false);
            setAsanaUsers([]);
            setAsanaUsersError(null);
            setAsanaUsersLoading(false);
            setAsanaOperation('silos');
        }
    }, [selectedResource]);

    const fetchClioContact = useCallback(async (email: string) => {
        const trimmed = String(email || '').trim();
        if (!trimmed) return;
        setClioContactLoading(true);
        setClioContactError(null);
        setClioContactResult([]);
        try {
            const res = await fetch(`/api/resources/core/clio-contact?email=${encodeURIComponent(trimmed)}`);
            if (!res.ok) throw new Error(await res.text());
            const payload = await res.json();
            if (!payload?.ok) throw new Error(payload?.error || 'Clio contact lookup failed.');
            setClioContactResult(payload.results || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Clio contact lookup failed.';
            setClioContactError(message);
        } finally {
            setClioContactLoading(false);
        }
    }, []);

    const fetchClioMatter = useCallback(async (query: string) => {
        const trimmed = String(query || '').trim();
        if (!trimmed) return;
        setClioMatterLoading(true);
        setClioMatterError(null);
        setClioMatterResult([]);
        try {
            const res = await fetch(`/api/resources/core/clio-matter?q=${encodeURIComponent(trimmed)}`);
            if (!res.ok) throw new Error(await res.text());
            const payload = await res.json();
            if (!payload?.ok) throw new Error(payload?.error || 'Clio matter lookup failed.');
            setClioMatterResult(payload.results || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Clio matter lookup failed.';
            setClioMatterError(message);
        } finally {
            setClioMatterLoading(false);
        }
    }, []);

    const fetchNetDocumentsWorkspaceContents = useCallback(async (clientId: string, matterKey: string) => {
        const trimmedClientId = String(clientId || '').trim();
        const trimmedMatterKey = String(matterKey || '').trim();
        if (!trimmedClientId || !trimmedMatterKey) return;
        setNetDocumentsContainerLoading(true);
        setNetDocumentsContainerError(null);
        setNetDocumentsContainerItems([]);
        try {
            const res = await fetch(`/api/resources/core/netdocuments-workspace-contents?c=${encodeURIComponent(trimmedClientId)}&m=${encodeURIComponent(trimmedMatterKey)}`);
            const payload = await res.json();
            if (!payload?.ok) throw new Error(payload?.error || 'NetDocuments workspace contents failed.');
            setNetDocumentsContainerItems(payload.result?.items || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Contents lookup failed.';
            setNetDocumentsContainerError(message);
        } finally {
            setNetDocumentsContainerLoading(false);
        }
    }, []);

    const fetchNetDocumentsWorkspace = useCallback(async (clientId: string, matterKey: string) => {
        const trimmedClientId = String(clientId || '').trim();
        const trimmedMatterKey = String(matterKey || '').trim();
        if (!trimmedClientId || !trimmedMatterKey) return;
        setNetDocumentsWorkspaceLoading(true);
        setNetDocumentsWorkspaceError(null);
        setNetDocumentsWorkspaceResult(null);
        try {
            const query = encodeURIComponent(`${trimmedClientId}/${trimmedMatterKey}`);
            const res = await fetch(`/api/resources/core/netdocuments-workspace?q=${query}`);
            const payload = await res.json();
            if (!payload?.ok) throw new Error(payload?.error || 'NetDocuments lookup failed.');
            const result = payload.result || null;
            setNetDocumentsWorkspaceResult(result);
            
            // Auto-fetch workspace contents
            if (result && result.clientId && result.matterKey) {
                 setNetDocumentsBreadcrumbs([{ 
                    id: result.id || '', 
                    name: result.name || 'Workspace', 
                    type: 'workspace' 
                }]);
                fetchNetDocumentsWorkspaceContents(result.clientId, result.matterKey);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'NetDocuments lookup failed.';
            setNetDocumentsWorkspaceError(message);
        } finally {
            setNetDocumentsWorkspaceLoading(false);
        }
    }, [fetchNetDocumentsWorkspaceContents]);

    const fetchNetDocumentsUser = useCallback(async () => {
        setNetDocumentsUserLoading(true);
        setNetDocumentsUserError(null);
        setNetDocumentsUserResult(null);
        try {
            const res = await fetch('/api/resources/core/netdocuments-user');
            const payload = await res.json();
            if (!payload?.ok) throw new Error(payload?.error || 'NetDocuments user lookup failed.');
            setNetDocumentsUserResult(payload.result || null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'NetDocuments user lookup failed.';
            setNetDocumentsUserError(message);
        } finally {
            setNetDocumentsUserLoading(false);
        }
    }, []);

    const fetchNetDocumentsContainer = useCallback(async (containerId: string, containerName?: string, isFolder?: boolean) => {
        const trimmed = String(containerId || '').trim();
        if (!trimmed) return;
        setNetDocumentsContainerLoading(true);
        setNetDocumentsContainerError(null);
        setNetDocumentsContainerItems([]);
        try {
            // Use folder contents endpoint for folders
            const res = await fetch(`/api/resources/core/netdocuments-folder-contents/${encodeURIComponent(trimmed)}`);
            const payload = await res.json();
            if (!payload?.ok) throw new Error(payload?.error || 'NetDocuments folder lookup failed.');
            setNetDocumentsContainerItems(payload.result?.items || []);
            // Add to breadcrumbs if drilling into a folder
            if (containerName && isFolder) {
                setNetDocumentsBreadcrumbs(prev => [...prev, { id: trimmed, name: containerName, type: 'folder' }]);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'NetDocuments folder lookup failed.';
            setNetDocumentsContainerError(message);
        } finally {
            setNetDocumentsContainerLoading(false);
        }
    }, []);



    const navigateToBreadcrumb = useCallback((index: number) => {
        const crumb = netDocumentsBreadcrumbs[index];
        if (!crumb) return;
        // Trim breadcrumbs to this level
        setNetDocumentsBreadcrumbs(prev => prev.slice(0, index + 1));
        setNetDocumentsContainerLoading(true);
        setNetDocumentsContainerError(null);
        setNetDocumentsContainerItems([]);
        
        // If navigating to workspace root, use workspace-contents endpoint
        if (crumb.type === 'workspace') {
            const params = new URLSearchParams({ clientId: netDocumentsClientId, matterKey: netDocumentsMatterKey });
            fetch(`/api/resources/core/netdocuments-workspace-contents?${params.toString()}`)
                .then(res => res.json())
                .then(payload => {
                    if (!payload?.ok) throw new Error(payload?.error || 'NetDocuments workspace contents lookup failed.');
                    setNetDocumentsContainerItems(payload.result?.items || []);
                })
                .catch(err => {
                    const message = err instanceof Error ? err.message : 'NetDocuments workspace contents lookup failed.';
                    setNetDocumentsContainerError(message);
                })
                .finally(() => setNetDocumentsContainerLoading(false));
        } else {
            // Navigate to folder
            fetch(`/api/resources/core/netdocuments-folder-contents/${encodeURIComponent(crumb.id)}`)
                .then(res => res.json())
                .then(payload => {
                    if (!payload?.ok) throw new Error(payload?.error || 'NetDocuments folder lookup failed.');
                    setNetDocumentsContainerItems(payload.result?.items || []);
                })
                .catch(err => {
                    const message = err instanceof Error ? err.message : 'NetDocuments folder lookup failed.';
                    setNetDocumentsContainerError(message);
                })
                .finally(() => setNetDocumentsContainerLoading(false));
        }
    }, [netDocumentsBreadcrumbs, netDocumentsClientId, netDocumentsMatterKey]);

    const fetchNetDocumentsDocument = useCallback(async (documentId: string) => {
        const trimmed = String(documentId || '').trim();
        if (!trimmed) return;
        setNetDocumentsDocumentLoading(true);
        setNetDocumentsDocumentError(null);
        setNetDocumentsDocumentResult(null);
        try {
            const res = await fetch(`/api/resources/core/netdocuments-document/${encodeURIComponent(trimmed)}`);
            const payload = await res.json();
            if (!payload?.ok) throw new Error(payload?.error || 'NetDocuments document lookup failed.');
            setNetDocumentsDocumentResult(payload.result || null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'NetDocuments document lookup failed.';
            setNetDocumentsDocumentError(message);
        } finally {
            setNetDocumentsDocumentLoading(false);
        }
    }, []);

    const fetchNetDocumentsSearch = useCallback(async () => {
        const trimmedQuery = netDocumentsSearchQuery.trim();
        if (!trimmedQuery) return;
        setNetDocumentsSearchLoading(true);
        setNetDocumentsSearchError(null);
        setNetDocumentsSearchResults([]);
        try {
            const params = new URLSearchParams();
            params.set('q', trimmedQuery);
            // Use current breadcrumb context for search scope
            const currentContainer = netDocumentsBreadcrumbs.length > 0 
                ? netDocumentsBreadcrumbs[netDocumentsBreadcrumbs.length - 1].id 
                : netDocumentsWorkspaceResult?.id;
            if (currentContainer) {
                params.set('container', currentContainer);
            }
            if (netDocumentsSearchLimit.trim()) {
                params.set('limit', netDocumentsSearchLimit.trim());
            }
            const res = await fetch(`/api/resources/core/netdocuments-search?${params.toString()}`);
            const payload = await res.json();
            if (!payload?.ok) throw new Error(payload?.error || 'NetDocuments search failed.');
            setNetDocumentsSearchResults(payload.result?.items || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'NetDocuments search failed.';
            setNetDocumentsSearchError(message);
        } finally {
            setNetDocumentsSearchLoading(false);
        }
    }, [netDocumentsSearchQuery, netDocumentsSearchLimit, netDocumentsBreadcrumbs, netDocumentsWorkspaceResult]);

    const fetchAzureUser = useCallback(async (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        setAzureUserLoading(true);
        setAzureUserError(null);
        setAzureUserResult(null);

        try {
            const url = `/api/resources/analytics/graph-user?q=${encodeURIComponent(trimmed)}`;
            const res = await fetch(url);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || `Graph error ${res.status}`);
            }
            const payload = await res.json();
            if (!payload?.ok) {
                throw new Error(payload?.error || 'Graph user lookup failed.');
            }
            const data = payload.user || {};
            setAzureUserResult({
                DisplayName: data.displayName || '�',
                Email: data.mail || '�',
                UPN: data.userPrincipalName || '�',
                JobTitle: data.jobTitle || '�',
                Department: data.department || '�',
                Enabled: String(data.accountEnabled ?? '�'),
                Id: data.id || '�',
            });
        } catch (err) {
            setAzureUserError((err as Error).message || 'Azure lookup failed.');
        } finally {
            setAzureUserLoading(false);
        }
    }, []);

    const fetchAsanaTask = useCallback(async (taskId: string) => {
        const trimmed = taskId.trim();
        if (!trimmed) return;
        setAsanaTaskLoading(true);
        setAsanaTaskError(null);
        setAsanaTaskResult(null);

        try {
            let email = asanaUserEmail;
            let initials = asanaUserInitials;
            let entraId = asanaUserEntraId;

            if (!email && !initials && !entraId && isInTeams()) {
                try {
                    const ctx = await app.getContext();
                    email = ctx.user?.userPrincipalName || ctx.user?.loginHint || '';
                    entraId = ctx.user?.id || '';
                } catch {
                    // Ignore Teams context errors for local mode.
                }
            }

            if (!email && !initials && !entraId) {
                try {
                    let bestTimestamp = 0;
                    for (let i = 0; i < localStorage.length; i += 1) {
                        const key = localStorage.key(i);
                        if (!key || !key.startsWith('userData-')) continue;
                        const raw = localStorage.getItem(key);
                        if (!raw) continue;
                        const parsed = JSON.parse(raw);
                        const timestamp = Number(parsed?.timestamp || 0);
                        if (timestamp <= bestTimestamp) continue;
                        const record = Array.isArray(parsed?.data) ? parsed.data[0] : null;
                        if (!record) continue;
                        bestTimestamp = timestamp;
                        email = record.Email || record.email || '';
                        initials = record.Initials || record.initials || '';
                        entraId = record.EntraID || record['Entra ID'] || record.entra_id || '';
                    }
                } catch {
                    // Ignore localStorage parse errors.
                }
            }

            const params = new URLSearchParams();
            params.set('id', trimmed);
            if (email) {
                params.set('email', email);
            }
            if (initials) {
                params.set('initials', initials);
            }
            if (entraId) {
                params.set('entraId', entraId);
            }
            const res = await fetch(`/api/resources/core/asana-task?${params.toString()}`);
            if (!res.ok) throw new Error(await res.text());
            const payload = await res.json();
            if (!payload?.ok) throw new Error(payload?.error || 'Asana task lookup failed.');
            setAsanaTaskResult(payload.task || null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Asana task lookup failed.';
            setAsanaTaskError(message);
        } finally {
            setAsanaTaskLoading(false);
        }
    }, [asanaUserEmail, asanaUserInitials, asanaUserEntraId]);

    const buildAsanaParams = useCallback(async () => {
        let email = asanaUserEmail;
        let initials = asanaUserInitials;
        let entraId = asanaUserEntraId;

        if (!email && !initials && !entraId && isInTeams()) {
            try {
                const ctx = await app.getContext();
                email = ctx.user?.userPrincipalName || ctx.user?.loginHint || '';
                entraId = ctx.user?.id || '';
            } catch {
                // Ignore Teams context errors for local mode.
            }
        }

        if (!email && !initials && !entraId) {
            try {
                let bestTimestamp = 0;
                for (let i = 0; i < localStorage.length; i += 1) {
                    const key = localStorage.key(i);
                    if (!key || !key.startsWith('userData-')) continue;
                    const raw = localStorage.getItem(key);
                    if (!raw) continue;
                    const parsed = JSON.parse(raw);
                    const timestamp = Number(parsed?.timestamp || 0);
                    if (timestamp <= bestTimestamp) continue;
                    const record = Array.isArray(parsed?.data) ? parsed.data[0] : null;
                    if (!record) continue;
                    bestTimestamp = timestamp;
                    email = record.Email || record.email || '';
                    initials = record.Initials || record.initials || '';
                    entraId = record.EntraID || record['Entra ID'] || record.entra_id || '';
                }
            } catch {
                // Ignore localStorage parse errors.
            }
        }

        const params = new URLSearchParams();
        if (email) params.set('email', email);
        if (initials) params.set('initials', initials);
        if (entraId) params.set('entraId', entraId);
        return params;
    }, [asanaUserEmail, asanaUserInitials, asanaUserEntraId]);

    const fetchAsanaTeams = useCallback(async () => {
        setAsanaTeamsLoading(true);
        setAsanaTeamsError(null);
        setAsanaTeams([]);
        try {
            const params = await buildAsanaParams();
            const res = await fetch(`/api/resources/core/asana-teams?${params.toString()}`);
            if (!res.ok) throw new Error(await res.text());
            const payload = await res.json();
            if (!payload?.ok) throw new Error(payload?.error || 'Asana team lookup failed.');
            setAsanaTeams(payload.teams || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Asana team lookup failed.';
            setAsanaTeamsError(message);
        } finally {
            setAsanaTeamsLoading(false);
        }
    }, [buildAsanaParams]);

    const fetchAsanaProjects = useCallback(async (teamId: string) => {
        const trimmed = teamId.trim();
        if (!trimmed) return;
        setAsanaProjectsLoading(true);
        setAsanaProjectsError(null);
        setAsanaProjects([]);
        setAsanaSections([]);
        setAsanaSectionsError(null);
        setAsanaSelectedProjectId('');
        try {
            const params = await buildAsanaParams();
            params.set('teamId', trimmed);
            const res = await fetch(`/api/resources/core/asana-projects?${params.toString()}`);
            if (!res.ok) throw new Error(await res.text());
            const payload = await res.json();
            if (!payload?.ok) throw new Error(payload?.error || 'Asana project lookup failed.');
            setAsanaProjects(payload.projects || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Asana project lookup failed.';
            setAsanaProjectsError(message);
        } finally {
            setAsanaProjectsLoading(false);
        }
    }, [buildAsanaParams]);

    const fetchAsanaProjectSilos = useCallback(async (projectId: string) => {
        const trimmed = projectId.trim();
        if (!trimmed) return;
        setAsanaSectionsLoading(true);
        setAsanaSectionsError(null);
        setAsanaSections([]);
        try {
            const params = await buildAsanaParams();
            params.set('projectId', trimmed);
            const res = await fetch(`/api/resources/core/asana-project-silos?${params.toString()}`);
            if (!res.ok) throw new Error(await res.text());
            const payload = await res.json();
            if (!payload?.ok) throw new Error(payload?.error || 'Asana project silos lookup failed.');
            setAsanaSections(payload.sections || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Asana project silos lookup failed.';
            setAsanaSectionsError(message);
        } finally {
            setAsanaSectionsLoading(false);
        }
    }, [buildAsanaParams]);

    const fetchAsanaUsers = useCallback(async (teamId: string) => {
        const trimmed = teamId.trim();
        if (!trimmed) return;
        setAsanaUsersLoading(true);
        setAsanaUsersError(null);
        setAsanaUsers([]);
        try {
            const params = await buildAsanaParams();
            params.set('teamId', trimmed);
            const res = await fetch(`/api/resources/core/asana-users?${params.toString()}`);
            if (!res.ok) throw new Error(await res.text());
            const payload = await res.json();
            if (!payload?.ok) throw new Error(payload?.error || 'Asana users lookup failed.');
            setAsanaUsers(payload.users || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Asana users lookup failed.';
            setAsanaUsersError(message);
        } finally {
            setAsanaUsersLoading(false);
        }
    }, [buildAsanaParams]);

    useEffect(() => {
        if (selectedResource?.title === 'Asana' && asanaTeams.length === 0 && !asanaTeamsLoading) {
            fetchAsanaTeams();
        }
    }, [selectedResource, asanaTeams.length, asanaTeamsLoading, fetchAsanaTeams]);

    // Build sections with favorites at top if any exist
    const sectionsToRender = favorites.length > 0 
        ? [{ title: 'Favorites', resources: favorites }, ...resourceSections]
        : resourceSections;

    const selectedIsFavorite = selectedResource
        ? favorites.some(f => f.title === selectedResource.title)
        : false;

    const chunkRows = (resources: Resource[]) => {
        const result: Resource[][] = [];
        for (let i = 0; i < resources.length; i += columnsPerRow) {
            result.push(resources.slice(i, i + columnsPerRow));
        }
        return result;
    };

    const renderSelectedPanel = (resource: Resource) => {
        const cardStyle = {
            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
            borderRadius: 0,
            padding: '16px 18px',
            background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
            boxShadow: 'none',
        } as const;

        const sectionTitleStyle = {
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase' as const,
            color: isDarkMode ? colours.accent : colours.highlight,
            marginBottom: 8,
        } as const;

        const buttonStyles = {
            root: {
                borderRadius: 0,
                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                color: isDarkMode ? colours.dark.text : colours.light.text,
            },
            rootHovered: {
                background: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
                border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.border}`,
            },
            rootPressed: {
                background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
            },
            icon: {
                color: isDarkMode ? colours.dark.text : colours.light.text,
            },
            label: {
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontWeight: 600,
            },
        } as const;

        const actionButtonStyles = {
            root: {
                minWidth: 32,
                height: 32,
                padding: '0 8px',
                borderRadius: 0,
                border: 'none',
                background: 'transparent',
            },
            rootHovered: {
                background: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
            },
            icon: {
                fontSize: 14,
                color: isDarkMode ? colours.dark.text : colours.light.text,
            },
            label: {
                display: 'none', // Hide label for compact look, or keep it? User said "buttons open copy pin ... no longer look on brand". Minimalism implies icon-only or subtle label.
            }
        };

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Header Actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <IconButton
                            iconProps={{ iconName: 'ChromeBack' }}
                            title="Back"
                            onClick={() => setSelectedResource(null)}
                            styles={{
                                root: {
                                    width: 32,
                                    height: 32,
                                    borderRadius: 0,
                                    border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.border}`,
                                    background: isDarkMode ? colours.helixBlue : colours.light.cardBackground,
                                },
                                rootHovered: {
                                    background: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
                                },
                                icon: { color: isDarkMode ? colours.dark.text : colours.light.text, fontSize: 14 },
                            }}
                        />
                        <div>
                            <Text style={{ fontSize: 18, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, display: 'block', lineHeight: 1.2 }}>
                                {resource.title}
                            </Text>
                            {resource.description && (
                                <Text style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151', fontWeight: 500 }}>
                                    {resource.description}
                                </Text>
                            )}
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <IconButton
                            iconProps={{ iconName: 'OpenInNewWindow' }}
                            title="Open external link"
                            onClick={() => handleOpenResource(resource.url)}
                            styles={actionButtonStyles}
                        />
                        <IconButton
                            iconProps={{ iconName: 'Copy' }}
                            title="Copy link"
                            onClick={() => handleCopyLink(resource.url)}
                            styles={actionButtonStyles}
                        />
                        <IconButton
                            iconProps={{ iconName: selectedIsFavorite ? 'FavoriteStarFill' : 'FavoriteStar' }}
                            title={selectedIsFavorite ? 'Unpin' : 'Pin'}
                            onClick={() => toggleFavorite(resource)}
                            styles={{
                                ...actionButtonStyles,
                                icon: { 
                                    ...actionButtonStyles.icon, 
                                    color: selectedIsFavorite ? '#eab308' : actionButtonStyles.icon.color 
                                }
                            }}
                        />
                         <IconButton
                            iconProps={{ iconName: 'Code' }}
                            title="Toggle Developer Details"
                            onClick={() => setShowDevDetails(!showDevDetails)}
                            styles={{
                                ...actionButtonStyles,
                                root: { ...actionButtonStyles.root, background: showDevDetails ? (isDarkMode ? `${colours.highlight}33` : `${colours.highlight}1F`) : 'transparent' },
                                icon: { ...actionButtonStyles.icon, color: showDevDetails ? colours.highlight : actionButtonStyles.icon.color }
                            }}
                        />
                    </div>
                </div>

                {resource.title === 'NetDocuments' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
                        {/* Dev Details Panel */}
                        {showDevDetails && (
                            <div style={{ 
                                padding: '10px 14px', 
                                background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                                borderRadius: 0,
                                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Icon iconName="Link" style={{ color: isDarkMode ? '#d1d5db' : '#374151', fontSize: 12 }} />
                                    <Text style={{ fontSize: 11, fontFamily: 'monospace', color: isDarkMode ? '#d1d5db' : '#374151' }}>
                                        {resource.url}
                                    </Text>
                                    <Icon 
                                        iconName="Copy" 
                                        style={{ cursor: 'pointer', fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151' }} 
                                        onClick={() => handleCopyLink(resource.url)}
                                    />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <DefaultButton
                                        text={netDocumentsUserLoading ? 'Loading membership...' : 'Fetch User Identity'}
                                        onClick={fetchNetDocumentsUser}
                                        disabled={netDocumentsUserLoading}
                                        styles={{ root: { height: 24, padding: '0 8px' }, label: { fontSize: 11 } }}
                                    />
                                    {netDocumentsUserResult && (
                                        <Text style={{ fontSize: 11, color: '#10b981' }}>Membership loaded</Text>
                                    )}
                                    {netDocumentsUserError && (
                                        <Text style={{ fontSize: 11, color: '#ef4444' }}>{netDocumentsUserError}</Text>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Full Width Explorer */}
                        <div style={cardStyle}>
                            {/* Step 1: Find Workspace */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <Text style={sectionTitleStyle}>Workspace Lookup</Text>
                                {netDocumentsWorkspaceResult && (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <Text style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                                            Workspace ID: {netDocumentsWorkspaceResult.id}
                                        </Text>
                                        <Icon 
                                            iconName="Copy" 
                                            style={{ cursor: 'pointer', fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }} 
                                            onClick={() => handleCopyLink(netDocumentsWorkspaceResult?.id || '')}
                                        />
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
                                <input
                                    value={netDocumentsClientId}
                                    onChange={(e) => setNetDocumentsClientId(e.target.value)}
                                    placeholder="Client ID (e.g. 5257922)"
                                    style={{
                                        flex: '0 1 140px',
                                        height: 32,
                                        borderRadius: 0,
                                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                        padding: '0 10px',
                                        background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                                        color: isDarkMode ? colours.dark.text : colours.light.text,
                                        fontSize: 12,
                                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                    }}
                                />
                                <Text style={{ fontSize: 14, color: isDarkMode ? '#d1d5db' : '#374151' }}>/</Text>
                                <input
                                    value={netDocumentsMatterKey}
                                    onChange={(e) => setNetDocumentsMatterKey(e.target.value)}
                                    placeholder="Matter Key (e.g. HELIX01-01)"
                                    style={{
                                        flex: '0 1 160px',
                                        height: 32,
                                        borderRadius: 0,
                                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                        padding: '0 10px',
                                        background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                                        color: isDarkMode ? colours.dark.text : colours.light.text,
                                        fontSize: 12,
                                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                    }}
                                />
                                <DefaultButton
                                    text={netDocumentsWorkspaceLoading ? 'Locating...' : 'Load Workspace'}
                                    iconProps={{ iconName: 'Search' }}
                                    onClick={() => fetchNetDocumentsWorkspace(netDocumentsClientId, netDocumentsMatterKey)}
                                    disabled={netDocumentsWorkspaceLoading || !netDocumentsClientId.trim() || !netDocumentsMatterKey.trim()}
                                    styles={buttonStyles}
                                />
                            </div>

                            {netDocumentsWorkspaceError && (
                                <div style={{ padding: '8px 12px', borderRadius: 0, background: isDarkMode ? 'rgba(248,113,113,0.1)' : '#fef2f2', marginBottom: 12 }}>
                                    <Text style={{ fontSize: 12, color: isDarkMode ? 'rgba(248,113,113,0.9)' : '#b91c1c' }}>
                                        {netDocumentsWorkspaceError}
                                    </Text>
                                </div>
                            )}

                            {/* Explorer View */}
                            {(netDocumentsWorkspaceResult || netDocumentsBreadcrumbs.length > 0) && (
                                <div style={{ 
                                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`, 
                                    borderRadius: 0, 
                                    overflow: 'hidden',
                                    background: isDarkMode ? colours.dark.sectionBackground : colours.light.cardBackground 
                                }}>
                                    {/* Toolbar: Breadcrumbs + Search */}
                                    <div style={{ 
                                        padding: '8px 12px', 
                                        borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                        background: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 12
                                    }}>
                                        {/* Breadcrumbs */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                            <Icon iconName="FabricFolder" style={{ color: isDarkMode ? '#93c5fd' : '#2563eb', fontSize: 14 }} />
                                            {netDocumentsWorkspaceResult && !netDocumentsBreadcrumbs.length && (
                                                <span 
                                                    style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}
                                                >
                                                    {netDocumentsWorkspaceResult.name}
                                                </span>
                                            )}
                                            {netDocumentsBreadcrumbs.map((crumb, idx) => (
                                                <div key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {idx === 0 && (
                                                        <span 
                                                            style={{ 
                                                                fontSize: 12, 
                                                                cursor: 'pointer', 
                                                                color: isDarkMode ? '#d1d5db' : '#374151',
                                                                textDecoration: 'underline'
                                                            }}
                                                            onClick={() => {
                                                                // If clicking root, we might want to reset? 
                                                                // Actually breadcrumbs[0] usually is root. 
                                                                // Let's rely on navigateToBreadcrumb
                                                                navigateToBreadcrumb(idx)
                                                            }}
                                                        >
                                                            {crumb.name}
                                                        </span>
                                                    )}
                                                    {idx > 0 && (
                                                        <>
                                                            <Icon iconName="ChevronRight" style={{ fontSize: 8, color: isDarkMode ? '#d1d5db' : '#374151' }} />
                                                            <span 
                                                                style={{ 
                                                                    fontSize: 12, 
                                                                    fontWeight: idx === netDocumentsBreadcrumbs.length - 1 ? 600 : 400,
                                                                    color: idx === netDocumentsBreadcrumbs.length - 1 ? (isDarkMode ? colours.dark.text : colours.light.text) : (isDarkMode ? '#d1d5db' : '#374151'),
                                                                    cursor: idx === netDocumentsBreadcrumbs.length - 1 ? 'default' : 'pointer'
                                                                }}
                                                                onClick={() => navigateToBreadcrumb(idx)}
                                                            >
                                                                {crumb.name}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            ))}
                                            {netDocumentsWorkspaceResult && !netDocumentsBreadcrumbs.length && (
                                                <span 
                                                    style={{ fontSize: 10, color: '#93c5fd', cursor: 'pointer', marginLeft: 8 }}
                                                    onClick={() => {
                                                        if (netDocumentsWorkspaceResult.clientId && netDocumentsWorkspaceResult.matterKey) {
                                                            setNetDocumentsBreadcrumbs([{ id: netDocumentsWorkspaceResult.id || '', name: netDocumentsWorkspaceResult.name || 'Workspace', type: 'workspace' }]);
                                                            fetchNetDocumentsWorkspaceContents(netDocumentsWorkspaceResult.clientId, netDocumentsWorkspaceResult.matterKey);
                                                        }
                                                    }}
                                                >
                                                    Browse Content
                                                </span>
                                            )}
                                        </div>

                                        {/* Search */}
                                        <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: 200 }}>
                                            <Icon iconName="Search" style={{ position: 'absolute', left: 8, fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151', zIndex: 1 }} />
                                            <input
                                                value={netDocumentsSearchQuery}
                                                onChange={(e) => setNetDocumentsSearchQuery(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && fetchNetDocumentsSearch()}
                                                placeholder="Search in folder..."
                                                style={{
                                                    width: '100%',
                                                    height: 28,
                                                    borderRadius: 4,
                                                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                                    padding: '0 8px 0 26px',
                                                    background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                                                    color: isDarkMode ? colours.dark.text : colours.light.text,
                                                    fontSize: 11,
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* RESULTS AREA */}
                                    <div style={{ minHeight: 200, maxHeight: 400, overflowY: 'auto', position: 'relative' }}>
                                        {/* Loading State */}
                                        {(netDocumentsContainerLoading || netDocumentsSearchLoading) && (
                                            <div style={{ position: 'absolute', inset: 0, background: isDarkMode ? `${colours.dark.background}CC` : `${colours.light.background}CC`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                                                <Spinner label="Loading items..." size={SpinnerSize.small} />
                                            </div>
                                        )}

                                        {/* Search Results */}
                                        {netDocumentsSearchResults.length > 0 && (
                                            <div style={{ padding: 4 }}>
                                                <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: isDarkMode ? '#d1d5db' : '#374151' }}>SEARCH RESULTS</div>
                                                {netDocumentsSearchResults.map((item) => (
                                                    <div 
                                                        key={`search-${item.id}`}
                                                        style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: 'min-content 1fr min-content',
                                                            gap: 12,
                                                            alignItems: 'center',
                                                            padding: '6px 12px',
                                                            borderRadius: 4,
                                                            cursor: 'default',
                                                            transition: 'background 0.1s'
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = isDarkMode ? 'rgba(30,41,59,0.5)' : '#f1f5f9'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <Icon iconName={item.type === 'container' ? 'FolderHorizontal' : 'Page'} style={{ color: item.type === 'container' ? colours.orange : (isDarkMode ? '#d1d5db' : '#374151') }} />
                                                        <div style={{ overflow: 'hidden' }}>
                                                            <div style={{ fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                                                            <div style={{ display: 'flex', gap: 8, fontSize: 10, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                                                                <span>{item.extension?.toUpperCase()}</span>
                                                                {item.modified && <span>{new Date(item.modified).toLocaleDateString()}</span>}
                                                            </div>
                                                        </div>
                                                        <Icon iconName="OpenInNewWindow" style={{ cursor: 'pointer', fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }} onClick={() => handleOpenResource(item.url || '')} />
                                                    </div>
                                                ))}
                                                <div style={{ borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`, margin: '8px 0' }} />
                                            </div>
                                        )}

                                        {/* Folder Contents */}
                                        <div style={{ padding: 4 }}>
                                            {netDocumentsContainerItems.length === 0 && !netDocumentsContainerLoading && (
                                                <div style={{ padding: 20, textAlign: 'center', color: isDarkMode ? '#d1d5db' : '#374151', fontSize: 12 }}>
                                                    Folder is empty or not loaded
                                                </div>
                                            )}
                                            {netDocumentsContainerItems.map((item) => (
                                                <div 
                                                    key={item.id}
                                                    style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: '20px 1fr 120px 40px',
                                                        gap: 8,
                                                        alignItems: 'center',
                                                        padding: '6px 8px',
                                                        borderRadius: 4,
                                                        cursor: item.type === 'container' ? 'pointer' : 'default',
                                                        transition: 'background 0.1s'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = isDarkMode ? 'rgba(30,41,59,0.5)' : '#f1f5f9'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    onClick={() => {
                                                        if(item.type === 'container') fetchNetDocumentsContainer(item.id || '', item.name, true);
                                                    }}
                                                >
                                                    <Icon 
                                                        iconName={item.type === 'container' ? 'FolderHorizontal' : 'Page'} 
                                                        style={{ 
                                                            fontSize: 16, 
                                                            color: item.type === 'container' ? (isDarkMode ? '#fbbf24' : '#d97706') : (isDarkMode ? '#d1d5db' : '#374151') 
                                                        }} 
                                                    />
                                                    <div style={{ minWidth: 0 }}>
                                                        <Text style={{ fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {item.name}
                                                        </Text>
                                                        {item.type !== 'container' && (
                                                            <Text style={{ fontSize: 10, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                                                                {item.id} � {item.extension?.toUpperCase()}
                                                            </Text>
                                                        )}
                                                    </div>
                                                    <Text style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151', textAlign: 'right' }}>
                                                        {item.modified ? new Date(item.modified).toLocaleDateString() : '-'}
                                                    </Text>
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                                                        {item.url && (
                                                            <IconButton 
                                                                iconProps={{ iconName: 'OpenInNewWindow' }} 
                                                                styles={{ root: { height: 20, width: 20 }, icon: { fontSize: 10 } }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleOpenResource(item.url || '');
                                                                }}
                                                            />
                                                        )}
                                                        <IconButton 
                                                            iconProps={{ iconName: 'Copy' }} 
                                                            styles={{ root: { height: 20, width: 20 }, icon: { fontSize: 10 } }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleCopyLink(item.id || '');
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    {/* Footer / Status Bar */}
                                    <div style={{ 
                                        padding: '4px 12px', 
                                        background: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
                                        borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                        fontSize: 10,
                                        color: isDarkMode ? '#d1d5db' : '#374151',
                                        display: 'flex',
                                        justifyContent: 'space-between'
                                    }}>
                                        <span>{netDocumentsContainerItems.length} items</span>
                                        <span>{netDocumentsBreadcrumbs.length > 0 ? netDocumentsBreadcrumbs[netDocumentsBreadcrumbs.length - 1].name : 'Workspace Root'}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(360px, 1.4fr)', gap: 16, minHeight: 0 }}>
                    <div style={{ display: 'grid', gap: 12 }}>
                        <div style={cardStyle}>
                            <Text style={sectionTitleStyle}>Overview</Text>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <Icon iconName="Link" style={{ color: isDarkMode ? '#93c5fd' : '#2563eb' }} />
                                <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                                    {resource.url}
                                </Text>
                            </div>
                        </div>

                        {resource.title === 'Azure' && (
                            <div style={cardStyle}>
                                <Text style={sectionTitleStyle}>Azure user lookup</Text>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <input
                                        value={azureUserQuery}
                                        onChange={(e) => setAzureUserQuery(e.target.value)}
                                        placeholder="Email or UPN"
                                        style={{
                                            flex: '1 1 200px',
                                            height: 32,
                                            borderRadius: 0,
                                            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                            padding: '0 10px',
                                            background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                                            color: isDarkMode ? colours.dark.text : colours.light.text,
                                            fontSize: 12,
                                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                        }}
                                    />
                                    <DefaultButton
                                        text={azureUserLoading ? 'Loading�' : 'Get user'}
                                        iconProps={{ iconName: 'Contact' }}
                                        onClick={() => fetchAzureUser(azureUserQuery)}
                                        disabled={azureUserLoading}
                                        styles={buttonStyles}
                                    />
                                </div>
                                {azureUserError && (
                                    <Text style={{ fontSize: 12, marginTop: 8, color: isDarkMode ? 'rgba(248,113,113,0.9)' : '#b91c1c' }}>
                                        {azureUserError}
                                    </Text>
                                )}
                                {azureUserResult && (
                                    <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
                                        {Object.entries(azureUserResult).map(([label, value]) => (
                                            <Text key={label} style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                                                <strong>{label}:</strong> {value}
                                            </Text>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'grid', gap: 12 }}>
                        {resource.title === 'Clio' && (
                            <div style={cardStyle}>
                                <Text style={sectionTitleStyle}>Clio lookups</Text>
                                <div style={{ display: 'grid', gap: 12 }}>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <input
                                            value={clioContactQuery}
                                            onChange={(e) => setClioContactQuery(e.target.value)}
                                            placeholder="Contact email"
                                            style={{
                                                flex: '1 1 200px',
                                                height: 32,
                                                borderRadius: 0,
                                                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                                padding: '0 10px',
                                                background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                                                color: isDarkMode ? colours.dark.text : colours.light.text,
                                                fontSize: 12,
                                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                            }}
                                        />
                                        <DefaultButton
                                            text={clioContactLoading ? 'Searching�' : 'Find contact'}
                                            iconProps={{ iconName: 'Contact' }}
                                            onClick={() => fetchClioContact(clioContactQuery)}
                                            disabled={clioContactLoading}
                                            styles={buttonStyles}
                                        />
                                    </div>
                                    {clioContactError && (
                                        <Text style={{ fontSize: 12, color: isDarkMode ? 'rgba(248,113,113,0.9)' : '#b91c1c' }}>
                                            {clioContactError}
                                        </Text>
                                    )}
                                    {clioContactResult && clioContactResult.length === 0 && !clioContactLoading && (
                                        <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>No contacts found.</Text>
                                    )}
                                    {clioContactResult && clioContactResult.length > 0 && (
                                        <div style={{ display: 'grid', gap: 4 }}>
                                            {clioContactResult.map((contact) => (
                                                <Text key={contact.id} style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                                                    <strong>{contact.name || 'Unknown'}</strong> � {contact.email || 'No email'}
                                                </Text>
                                            ))}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <input
                                            value={clioMatterQuery}
                                            onChange={(e) => setClioMatterQuery(e.target.value)}
                                            placeholder="Matter number or query"
                                            style={{
                                                flex: '1 1 200px',
                                                height: 32,
                                                borderRadius: 0,
                                                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                                padding: '0 10px',
                                                background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                                                color: isDarkMode ? colours.dark.text : colours.light.text,
                                                fontSize: 12,
                                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                            }}
                                        />
                                        <DefaultButton
                                            text={clioMatterLoading ? 'Searching�' : 'Find matter'}
                                            iconProps={{ iconName: 'Search' }}
                                            onClick={() => fetchClioMatter(clioMatterQuery)}
                                            disabled={clioMatterLoading}
                                            styles={buttonStyles}
                                        />
                                    </div>
                                    {clioMatterError && (
                                        <Text style={{ fontSize: 12, color: isDarkMode ? 'rgba(248,113,113,0.9)' : '#b91c1c' }}>
                                            {clioMatterError}
                                        </Text>
                                    )}
                                    {clioMatterResult && clioMatterResult.length === 0 && !clioMatterLoading && (
                                        <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>No matters found.</Text>
                                    )}
                                    {clioMatterResult && clioMatterResult.length > 0 && (
                                        <div style={{ display: 'grid', gap: 4 }}>
                                            {clioMatterResult.map((matter) => (
                                                <Text key={matter.id} style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                                                    <strong>{matter.displayNumber || 'No ref'}</strong> � {matter.description || 'No description'}
                                                </Text>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}


                    </div>
                </div>
            )}
            </div>
        );
    };

    return (
        <Modal
            isOpen={isOpen}
            onDismiss={onDismiss}
            isBlocking={false}
            styles={{
                main: {
                    width: 'min(1400px, calc(100vw - 48px))',
                    height: 'calc(100vh - 48px)',
                    maxWidth: '1400px',
                    maxHeight: 'calc(100vh - 48px)',
                    margin: '24px auto',
                    borderRadius: 0,
                    background: isDarkMode ? colours.dark.background : colours.light.background,
                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                },
                scrollableContent: {
                    height: '100%',
                }
            }}
        >
            <div style={{ 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}>
                {/* Clean header */}
                <div style={{
                    padding: '10px 24px',
                    borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    background: isDarkMode ? colours.darkBlue : colours.light.sectionBackground,
                    flexShrink: 0,
                }}>
                    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{
                                fontSize: '20px',
                                fontWeight: 600,
                                color: isDarkMode ? colours.dark.text : colours.light.text,
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
                                        borderRadius: 0,
                                        border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.border}`,
                                        background: isDarkMode ? colours.helixBlue : colours.light.cardBackground,
                                    },
                                    rootHovered: {
                                        background: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
                                    },
                                    icon: {
                                        color: isDarkMode ? colours.dark.text : colours.light.text,
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Resources by section */}
                <div style={{ flex: 1, overflow: 'auto', padding: '24px 48px 48px' }}>
                    {selectedResource ? (
                        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {renderSelectedPanel(selectedResource)}
                        </div>
                    ) : (
                        <div ref={resourcesContainerRef} style={{ maxWidth: '1100px', margin: '0 auto' }}>
                            {sectionsToRender.map((section) => {
                                const config = sectionConfig[section.title] || { label: section.title, color: colours.highlight };
                                const isFavoritesSection = section.title === 'Favorites';
                                const rows = chunkRows(section.resources);
                                
                                return (
                                    <div key={section.title} style={{ marginBottom: '28px' }}>
                                        <div style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: isDarkMode ? '#d1d5db' : '#374151',
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
                                                background: isFavoritesSection ? colours.orange : config.color,
                                                borderRadius: 1,
                                            }} />
                                            {isFavoritesSection ? 'Favorites' : config.label}
                                            {isFavoritesSection && (
                                                <Icon iconName="FavoriteStarFill" style={{ fontSize: 10, color: colours.orange }} />
                                            )}
                                        </div>
                                        <div>
                                            {rows.map((row, rowIndex) => (
                                                    <div key={`${section.title}-row-${rowIndex}`} style={{ marginBottom: 12 }}>
                                                        <div style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: `repeat(${columnsPerRow}, minmax(280px, 1fr))`,
                                                            gap: '10px',
                                                        }}>
                                                            {row.map((resource) => (
                                                                <ResourceCard
                                                                    key={resource.title}
                                                                    resource={resource}
                                                                    accentColor={isFavoritesSection ? colours.orange : config.color}
                                                                    isDarkMode={isDarkMode}
                                                                    isFavorite={favorites.some(f => f.title === resource.title)}
                                                                    onOpen={() => handleSelectResource(resource)}
                                                                    onCopyLink={() => handleCopyLink(resource.url)}
                                                                    onToggleFavorite={() => toggleFavorite(resource)}
                                                                    showOpsBadge={Boolean(demoModeEnabled || (isLocalDev && !viewAsProd))}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Copy confirmation toast */}
                    {copiedLink && (
                        <div style={{
                            position: 'fixed',
                            bottom: 24,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: isDarkMode ? colours.dark.sectionBackground : colours.darkBlue,
                            color: colours.dark.text,
                            padding: '10px 20px',
                            fontSize: 13,
                            fontWeight: 500,
                            boxShadow: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                        }}>
                            <Icon iconName="CheckMark" style={{ color: colours.green }} />
                            Link copied
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default ResourcesModal;
