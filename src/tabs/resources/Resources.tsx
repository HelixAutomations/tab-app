// src/tabs/resources/Resources.tsx
// invisible change

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  MessageBar,
  MessageBarType,
  SearchBox,
  PrimaryButton,
  DefaultButton,
  Icon,
  Link as FluentLink, // Renamed to avoid confusion with resource Link
} from '@fluentui/react';
import { app } from '@microsoft/teams-js';
import { colours } from '../../app/styles/colours';
import BespokePanel from '../../app/functionality/BespokePanel';
import ResourceCard from './ResourceCard';
import { sharedSearchBoxContainerStyle, sharedSearchBoxStyle } from '../../app/styles/FilterStyles';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
import { isInTeams } from '../../app/functionality/isInTeams';
import type { UserData } from '../../app/functionality/types';
import '../../app/styles/ResourceCard.css';
import NavigatorDetailBar from '../../components/NavigatorDetailBar';

// Import Custom SVG Icons
import asanaIcon from '../../assets/asana.svg';
import nuclinoIcon from '../../assets/nuclino.svg';
import clioIcon from '../../assets/clio.svg';
import netdocumentsIcon from '../../assets/netdocuments.svg';
import activecampaignIcon from '../../assets/activecampaign.svg';
import bundledocsIcon from '../../assets/bundledocs.svg';
import leapsomeIcon from '../../assets/leapsome.svg';
import harveyIcon from '../../assets/harvey.svg';
import lexisnexisIcon from '../../assets/lexisnexis.svg';
import thompsonReutersIcon from '../../assets/thompson-reuters.svg';
import landRegistryIcon from '../../assets/land-registry.svg';

// Icons initialized in index.tsx - no need to re-initialize

// Define types for sections and resources
export type SectionName = 'Favorites' | 'WithIcons' | 'WithoutIcons';

export interface Resource {
  title: string;
  url: string;
  icon: string;
  tags?: string[];
  description?: string;
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

interface ResourcesSections {
  Favorites: Resource[];
  WithIcons: Resource[];
  WithoutIcons: Resource[];
}

// Styles
const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    width: '100%',
    minHeight: '100vh',
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    display: 'flex',
    flexDirection: 'column',
    transition: 'background-color 0.3s',
    fontFamily: 'Raleway, sans-serif',
  });

const headerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '10px',
  });

const mainContentStyle = (isDarkMode: boolean) =>
  mergeStyles({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  });

// Updated sectionStyle with increased bottom margin
const sectionStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    border: `0.5px solid ${isDarkMode ? colours.dark.borderColor : colours.light.border}`,
    borderRadius: 0,
    padding: '20px',
    boxSizing: 'border-box',
    boxShadow: 'none',
    transition: 'background-color 0.3s, border 0.3s, box-shadow 0.3s',
    marginBottom: '40px',

    selectors: {
      '&:last-child': {
        marginBottom: '0px',
      },
    },
  });

const sectionHeaderStyleCustom = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: '20px',
    fontWeight: '700',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    marginBottom: '30px',
    marginTop: '0px',
  });

const resourceGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
  gap: '20px',
  paddingTop: '15px',
});

const footerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    borderRadius: 0,
    border: `0.5px solid ${isDarkMode ? colours.dark.borderColor : colours.light.border}`,
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
  });

// Define the props for Resources component
interface ResourcesProps {
  userData?: UserData[] | null;
}

const Resources: React.FC<ResourcesProps> = ({ userData }) => {
  const { isDarkMode } = useTheme();
  const { setContent } = useNavigatorActions();
  const [favorites, setFavorites] = useState<Resource[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [azureUserQuery, setAzureUserQuery] = useState('');
  const [azureUserResult, setAzureUserResult] = useState<Record<string, string> | null>(null);
  const [azureUserError, setAzureUserError] = useState<string | null>(null);
  const [azureUserLoading, setAzureUserLoading] = useState(false);
  const [clioContactQuery, setClioContactQuery] = useState('');
  const [clioContactResult, setClioContactResult] = useState<any[] | null>(null);
  const [clioContactError, setClioContactError] = useState<string | null>(null);
  const [clioContactLoading, setClioContactLoading] = useState(false);
  const [clioMatterQuery, setClioMatterQuery] = useState('');
  const [clioMatterResult, setClioMatterResult] = useState<any[] | null>(null);
  const [clioMatterError, setClioMatterError] = useState<string | null>(null);
  const [clioMatterLoading, setClioMatterLoading] = useState(false);
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
  const [netDocumentsClientId, setNetDocumentsClientId] = useState('');
  const [netDocumentsMatterKey, setNetDocumentsMatterKey] = useState('');
  const [netDocumentsWorkspaceResult, setNetDocumentsWorkspaceResult] = useState<NetDocumentsWorkspaceResult | null>(null);
  const [netDocumentsWorkspaceLoading, setNetDocumentsWorkspaceLoading] = useState(false);
  const [netDocumentsWorkspaceError, setNetDocumentsWorkspaceError] = useState<string | null>(null);
  const [netDocumentsUserResult, setNetDocumentsUserResult] = useState<any | null>(null);
  const [netDocumentsUserError, setNetDocumentsUserError] = useState<string | null>(null);
  const [netDocumentsUserLoading, setNetDocumentsUserLoading] = useState(false);
  const [netDocumentsContainerId, setNetDocumentsContainerId] = useState('');
  const [netDocumentsContainerItems, setNetDocumentsContainerItems] = useState<NetDocumentsContainerItem[]>([]);
  const [netDocumentsContainerError, setNetDocumentsContainerError] = useState<string | null>(null);
  const [netDocumentsContainerLoading, setNetDocumentsContainerLoading] = useState(false);
  const [netDocumentsSubRecursive, setNetDocumentsSubRecursive] = useState(false);
  const [netDocumentsSubMax, setNetDocumentsSubMax] = useState('100');
  const [netDocumentsSubContainers, setNetDocumentsSubContainers] = useState<NetDocumentsContainerItem[]>([]);
  const [netDocumentsSubError, setNetDocumentsSubError] = useState<string | null>(null);
  const [netDocumentsSubLoading, setNetDocumentsSubLoading] = useState(false);
  const [netDocumentsDocumentId, setNetDocumentsDocumentId] = useState('');
  const [netDocumentsDocumentResult, setNetDocumentsDocumentResult] = useState<NetDocumentsDocumentResult | null>(null);
  const [netDocumentsDocumentError, setNetDocumentsDocumentError] = useState<string | null>(null);
  const [netDocumentsDocumentLoading, setNetDocumentsDocumentLoading] = useState(false);
  const [netDocumentsSearchQuery, setNetDocumentsSearchQuery] = useState('');
  const [netDocumentsSearchContainerId, setNetDocumentsSearchContainerId] = useState('');
  const [netDocumentsSearchLimit, setNetDocumentsSearchLimit] = useState('25');
  const [netDocumentsSearchResults, setNetDocumentsSearchResults] = useState<NetDocumentsContainerItem[]>([]);
  const [netDocumentsSearchError, setNetDocumentsSearchError] = useState<string | null>(null);
  const [netDocumentsSearchLoading, setNetDocumentsSearchLoading] = useState(false);

  // Handle storage changes for syncing favorites
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'resourcesFavorites' && event.newValue) {
        setFavorites(JSON.parse(event.newValue));
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Define number of columns per row for delay calculation based on screen width
  const [columnsPerRow, setColumnsPerRow] = useState(
    Math.max(1, Math.floor(window.innerWidth / 250))
  );

  useEffect(() => {
    const handleResize = () =>
      setColumnsPerRow(Math.max(1, Math.floor(window.innerWidth / 250)));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Initialize resources with hard-coded data
  const resourcesSections: ResourcesSections = useMemo(() => {
    const initialSections: ResourcesSections = {
      Favorites: [], // Will be populated based on favorites
      WithIcons: [
        {
          title: 'Asana',
          url: 'https://app.asana.com/',
          icon: asanaIcon,
        },
        {
          title: 'Nuclino',
          url: 'https://www.nuclino.com/',
          icon: nuclinoIcon,
        },
        {
          title: 'Clio',
          url: 'https://eu.app.clio.com/nc/#/',
          icon: clioIcon,
        },
        {
          title: 'NetDocuments',
          url: 'https://eu.netdocuments.com/neWeb2/home',
          icon: netdocumentsIcon,
        },
        {
          title: 'ActiveCampaign',
          url: 'https://helix-law54533.activehosted.com/',
          icon: activecampaignIcon,
        },
        {
          title: 'BundleDocs',
          url: 'https://www.bundledocs.com/',
          icon: bundledocsIcon,
        },
        {
          title: 'Leapsome',
          url: 'https://www.leapsome.com/app/#/dashboard?init=true',
          icon: leapsomeIcon,
        },
        {
          title: 'Harvey',
          url: 'https://www.harvey.ai/',
          icon: harveyIcon,
        },
        {
          title: 'LexisNexis',
          url: 'https://www.lexisnexis.com/en-us/gateway.page',
          icon: lexisnexisIcon,
        },
        {
          title: 'Thompson Reuters',
          url: 'https://www.thomsonreuters.com/en.html',
          icon: thompsonReutersIcon,
        },
        {
          title: 'Land Registry',
          url: 'https://www.gov.uk/government/organisations/land-registry',
          icon: landRegistryIcon,
        },
        {
          title: 'CC-Filing',
          url: 'https://efile.cefile-app.com/login?referer=%2F',
          icon: thompsonReutersIcon,
        },
      ],
      WithoutIcons: [
        {
          title: 'Companies House',
          url: 'https://www.gov.uk/government/organisations/companies-house',
          icon: 'Link', // Changed to 'Link' icon
        },
        {
          title: 'Azure',
          url: 'https://portal.azure.com/#home',
          icon: 'Link', // Temporary Fluent UI icon
        },
        {
          title: 'Power Automate',
          url: 'https://make.powerautomate.com/',
          icon: 'Link', // Temporary Fluent UI icon
        },
        {
          title: 'Cognito',
          url: 'https://www.cognitoforms.com/helix1',
          icon: 'Link', // Temporary Fluent UI icon
        },
        {
          title: 'Power BI',
          url: 'https://app.powerbi.com/home',
          icon: 'Link', // Temporary Fluent UI icon
        },
        {
          title: 'Postman',
          url: 'https://identity.getpostman.com/',
          icon: 'Link', // Temporary Fluent UI icon
        },
        {
          title: 'Miro',
          url: 'https://miro.com/login/',
          icon: 'Link', // Temporary Fluent UI icon
        },
        {
          title: 'Psychometric Testing',
          url: 'https://links.helix-law.co.uk/assessment',
          icon: 'Link', // Temporary Fluent UI icon
        },
        {
          title: 'GitHub',
          url: 'https://github.com/',
          icon: 'Link', // Temporary Fluent UI icon
        },
      ],
    };

    return initialSections;
  }, []);

  // Load stored favorites from localStorage
  useEffect(() => {
    const storedFavorites = localStorage.getItem('resourcesFavorites');
    if (storedFavorites) {
      setFavorites(JSON.parse(storedFavorites));
    }
  }, []);

  // Update localStorage whenever favorites change
  useEffect(() => {
    localStorage.setItem('resourcesFavorites', JSON.stringify(favorites));
  }, [favorites]);

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
      const isFavorite = prev.some((fav) => fav.title === resource.title);
      let updatedFavorites: Resource[];

      if (isFavorite) {
        updatedFavorites = prev.filter((fav) => fav.title !== resource.title);
      } else {
        updatedFavorites = [...prev, resource];
      }

      localStorage.setItem('resourcesFavorites', JSON.stringify(updatedFavorites));
      return updatedFavorites;
    });
  }, []);

  // Handle Go To Resource
  const goToResource = useCallback((url: string) => {
    const openLink = async () => {
      if (isInTeams()) {
        try {
          await app.openLink(url);
          return;
        } catch {
          // Fall back to browser navigation below.
        }
      }
      const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
      if (!newWindow) {
        window.location.href = url;
      }
    };
    void openLink();
  }, []);

  const handleBackFromDetail = useCallback(() => {
    setSelectedResource(null);
  }, []);

  useEffect(() => {
    if (selectedResource) {
      setContent(
        <NavigatorDetailBar
          onBack={handleBackFromDetail}
          backLabel="Back"
          staticLabel={`Resources · ${selectedResource.title}`}
        />,
      );
    } else {
      setContent(null);
    }

    return () => setContent(null);
  }, [selectedResource, handleBackFromDetail, setContent]);

  // Filtered Sections based on search query and excluding favorites from WithIcons/WithoutIcons
  const filteredSections: ResourcesSections = useMemo(() => {
    const filterResources = (resources: Resource[]) =>
      resources.filter(
        (resource) =>
          resource.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !favorites.some((fav) => fav.title === resource.title)
      );

    const sortResources = (resources: Resource[]) => {
      const sorted = [...resources];
      // Sort alphabetically by title
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      return sorted;
    };

    // Prepare Favorites section separately
    const favoriteResources = favorites.filter((resource) =>
      resource.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return {
      Favorites: sortResources(favoriteResources),
      WithIcons: sortResources(filterResources(resourcesSections.WithIcons)),
      WithoutIcons: sortResources(filterResources(resourcesSections.WithoutIcons)),
    };
  }, [favorites, resourcesSections, searchQuery]);

  // Calculate animation delays based on row and column
  const calculateAnimationDelay = (row: number, col: number) => {
    const delayPerRow = 0.2; // 0.2 seconds delay between rows
    const delayPerCol = 0.1; // 0.1 seconds delay between columns
    return row * delayPerRow + col * delayPerCol;
  };

  // Flatten the resources into a single list to calculate row and column
  const flatResources = useMemo(() => {
    const sections = ['Favorites', 'WithIcons', 'WithoutIcons'] as SectionName[];
    let flatList: Resource[] = [];
    sections.forEach((section) => {
      flatList = flatList.concat(filteredSections[section]);
    });
    return flatList;
  }, [filteredSections]);

  useEffect(() => {
    if (selectedResource?.title !== 'Azure') {
      setAzureUserQuery('');
      setAzureUserResult(null);
      setAzureUserError(null);
      setAzureUserLoading(false);
    }
    if (selectedResource?.title !== 'Clio') {
      setClioContactQuery('');
      setClioContactResult(null);
      setClioContactError(null);
      setClioContactLoading(false);
      setClioMatterQuery('');
      setClioMatterResult(null);
      setClioMatterError(null);
      setClioMatterLoading(false);
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
    if (selectedResource?.title !== 'NetDocuments') {
      setNetDocumentsClientId('');
      setNetDocumentsMatterKey('');
      setNetDocumentsWorkspaceResult(null);
      setNetDocumentsWorkspaceError(null);
      setNetDocumentsWorkspaceLoading(false);
      setNetDocumentsUserResult(null);
      setNetDocumentsUserError(null);
      setNetDocumentsUserLoading(false);
      setNetDocumentsContainerId('');
      setNetDocumentsContainerItems([]);
      setNetDocumentsContainerError(null);
      setNetDocumentsContainerLoading(false);
      setNetDocumentsSubRecursive(false);
      setNetDocumentsSubMax('100');
      setNetDocumentsSubContainers([]);
      setNetDocumentsSubError(null);
      setNetDocumentsSubLoading(false);
      setNetDocumentsDocumentId('');
      setNetDocumentsDocumentResult(null);
      setNetDocumentsDocumentError(null);
      setNetDocumentsDocumentLoading(false);
      setNetDocumentsSearchQuery('');
      setNetDocumentsSearchContainerId('');
      setNetDocumentsSearchLimit('25');
      setNetDocumentsSearchResults([]);
      setNetDocumentsSearchError(null);
      setNetDocumentsSearchLoading(false);
    }
  }, [selectedResource]);

  const fetchClioContact = useCallback(async (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setClioContactLoading(true);
    setClioContactError(null);
    setClioContactResult(null);
    try {
      const res = await fetch(`/api/resources/core/clio-contact?email=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error(await res.text());
      const payload = await res.json();
      if (!payload?.ok) throw new Error(payload?.error || 'Clio contact lookup failed.');
      setClioContactResult(payload.results || []);
    } catch (err) {
      setClioContactError((err as Error).message || 'Clio contact lookup failed.');
    } finally {
      setClioContactLoading(false);
    }
  }, []);

  const fetchClioMatter = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setClioMatterLoading(true);
    setClioMatterError(null);
    setClioMatterResult(null);
    try {
      const res = await fetch(`/api/resources/core/clio-matter?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) throw new Error(await res.text());
      const payload = await res.json();
      if (!payload?.ok) throw new Error(payload?.error || 'Clio matter lookup failed.');
      setClioMatterResult(payload.results || []);
    } catch (err) {
      setClioMatterError((err as Error).message || 'Clio matter lookup failed.');
    } finally {
      setClioMatterLoading(false);
    }
  }, []);

  const fetchNetDocumentsWorkspace = useCallback(async (clientId: string, matterKey: string) => {
    const trimmedClientId = clientId.trim();
    const trimmedMatterKey = matterKey.trim();
    if (!trimmedClientId || !trimmedMatterKey) return;
    setNetDocumentsWorkspaceLoading(true);
    setNetDocumentsWorkspaceError(null);
    setNetDocumentsWorkspaceResult(null);
    try {
      const query = encodeURIComponent(`${trimmedClientId}/${trimmedMatterKey}`);
      const res = await fetch(`/api/resources/core/netdocuments-workspace?q=${query}`);
      const payload = await res.json();
      if (!payload?.ok) throw new Error(payload?.error || 'NetDocuments lookup failed.');
      setNetDocumentsWorkspaceResult(payload.result || null);
      const workspaceId = payload?.result?.id || '';
      if (workspaceId) {
        setNetDocumentsContainerId(workspaceId);
        setNetDocumentsSearchContainerId(workspaceId);
      }
    } catch (err) {
      setNetDocumentsWorkspaceError((err as Error).message || 'NetDocuments lookup failed.');
    } finally {
      setNetDocumentsWorkspaceLoading(false);
    }
  }, []);

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
      setNetDocumentsUserError((err as Error).message || 'NetDocuments user lookup failed.');
    } finally {
      setNetDocumentsUserLoading(false);
    }
  }, []);

  const fetchNetDocumentsContainer = useCallback(async (containerId: string) => {
    const trimmed = containerId.trim();
    if (!trimmed) return;
    setNetDocumentsContainerLoading(true);
    setNetDocumentsContainerError(null);
    setNetDocumentsContainerItems([]);
    try {
      const res = await fetch(`/api/resources/core/netdocuments-container/${encodeURIComponent(trimmed)}`);
      const payload = await res.json();
      if (!payload?.ok) throw new Error(payload?.error || 'NetDocuments container lookup failed.');
      setNetDocumentsContainerItems(payload.result?.items || []);
    } catch (err) {
      setNetDocumentsContainerError((err as Error).message || 'NetDocuments container lookup failed.');
    } finally {
      setNetDocumentsContainerLoading(false);
    }
  }, []);

  const fetchNetDocumentsSubContainers = useCallback(async (containerId: string) => {
    const trimmed = containerId.trim();
    if (!trimmed) return;
    setNetDocumentsSubLoading(true);
    setNetDocumentsSubError(null);
    setNetDocumentsSubContainers([]);
    try {
      const params = new URLSearchParams();
      if (netDocumentsSubRecursive) params.set('recursive', 'true');
      if (netDocumentsSubMax.trim()) params.set('max', netDocumentsSubMax.trim());
      const query = params.toString();
      const res = await fetch(`/api/resources/core/netdocuments-container/${encodeURIComponent(trimmed)}/sub${query ? `?${query}` : ''}`);
      const payload = await res.json();
      if (!payload?.ok) throw new Error(payload?.error || 'NetDocuments sub-containers lookup failed.');
      setNetDocumentsSubContainers(payload.result?.containers || []);
    } catch (err) {
      setNetDocumentsSubError((err as Error).message || 'NetDocuments sub-containers lookup failed.');
    } finally {
      setNetDocumentsSubLoading(false);
    }
  }, [netDocumentsSubRecursive, netDocumentsSubMax]);

  const fetchNetDocumentsDocument = useCallback(async (documentId: string) => {
    const trimmed = documentId.trim();
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
      setNetDocumentsDocumentError((err as Error).message || 'NetDocuments document lookup failed.');
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
      if (netDocumentsSearchContainerId.trim()) params.set('container', netDocumentsSearchContainerId.trim());
      if (netDocumentsSearchLimit.trim()) params.set('limit', netDocumentsSearchLimit.trim());
      const res = await fetch(`/api/resources/core/netdocuments-search?${params.toString()}`);
      const payload = await res.json();
      if (!payload?.ok) throw new Error(payload?.error || 'NetDocuments search failed.');
      setNetDocumentsSearchResults(payload.result?.items || []);
    } catch (err) {
      setNetDocumentsSearchError((err as Error).message || 'NetDocuments search failed.');
    } finally {
      setNetDocumentsSearchLoading(false);
    }
  }, [netDocumentsSearchQuery, netDocumentsSearchContainerId, netDocumentsSearchLimit]);

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
        DisplayName: data.displayName || '—',
        Email: data.mail || '—',
        UPN: data.userPrincipalName || '—',
        JobTitle: data.jobTitle || '—',
        Department: data.department || '—',
        Enabled: String(data.accountEnabled ?? '—'),
        Id: data.id || '—',
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
      setAsanaTaskError((err as Error).message || 'Asana task lookup failed.');
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
      setAsanaTeamsError((err as Error).message || 'Asana team lookup failed.');
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
      setAsanaProjectsError((err as Error).message || 'Asana project lookup failed.');
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
      setAsanaSectionsError((err as Error).message || 'Asana project silos lookup failed.');
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
      setAsanaUsersError((err as Error).message || 'Asana users lookup failed.');
    } finally {
      setAsanaUsersLoading(false);
    }
  }, [buildAsanaParams]);

  useEffect(() => {
    if (selectedResource?.title === 'Asana' && asanaTeams.length === 0 && !asanaTeamsLoading) {
      fetchAsanaTeams();
    }
  }, [selectedResource, asanaTeams.length, asanaTeamsLoading, fetchAsanaTeams]);

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Header */}
      <header className={headerStyle(isDarkMode)}>
        {/* Search Box */}
        <div className={sharedSearchBoxContainerStyle(isDarkMode)}>
          <SearchBox
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(_, newValue) => setSearchQuery(newValue || '')}
            styles={sharedSearchBoxStyle(isDarkMode)}
            aria-label="Search resources"
          />
        </div>
      </header>

      {/* Main Content */}
      <main className={mainContentStyle(isDarkMode)}>
        {/* Render Favorites Section Only if There are Favorites */}
        {filteredSections.Favorites.length > 0 && (
          <section key="Favorites" className={sectionStyle(isDarkMode)}>
            <Text variant="large" className={sectionHeaderStyleCustom(isDarkMode)}>
              Favorites
            </Text>
            <div className={resourceGridStyle}>
              {filteredSections.Favorites.map((resource: Resource, index: number) => {
                const globalIndex = flatResources.findIndex((res) => res.title === resource.title);

                if (globalIndex === -1) {
                  console.warn(`Resource titled "${resource.title}" not found in flatResources.`);
                  return null;
                }

                const row = Math.floor(globalIndex / columnsPerRow);
                const col = globalIndex % columnsPerRow;
                const animationDelay = calculateAnimationDelay(row, col);
                return (
                  <ResourceCard
                    key={resource.title}
                    resource={resource}
                    isFavorite={favorites.some((fav) => fav.title === resource.title)}
                    onCopy={copyToClipboard}
                    onToggleFavorite={toggleFavorite}
                    onGoTo={goToResource}
                    onSelect={() => setSelectedResource(resource)}
                    animationDelay={animationDelay}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Render With Icons Section */}
        {filteredSections.WithIcons.length > 0 && (
          <section key="WithIcons" className={sectionStyle(isDarkMode)}>
            <Text variant="large" className={sectionHeaderStyleCustom(isDarkMode)}>
              Resources
            </Text>
            <div className={resourceGridStyle}>
              {filteredSections.WithIcons.map((resource: Resource, index: number) => {
                const globalIndex = flatResources.findIndex((res) => res.title === resource.title);

                if (globalIndex === -1) {
                  console.warn(`Resource titled "${resource.title}" not found in flatResources.`);
                  return null;
                }

                const row = Math.floor(globalIndex / columnsPerRow);
                const col = globalIndex % columnsPerRow;
                const animationDelay = calculateAnimationDelay(row, col);
                return (
                  <ResourceCard
                    key={resource.title}
                    resource={resource}
                    isFavorite={favorites.some((fav) => fav.title === resource.title)}
                    onCopy={copyToClipboard}
                    onToggleFavorite={toggleFavorite}
                    onGoTo={goToResource}
                    onSelect={() => setSelectedResource(resource)}
                    animationDelay={animationDelay}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Render Without Icons Section */}
        {filteredSections.WithoutIcons.length > 0 && (
          <section key="WithoutIcons" className={sectionStyle(isDarkMode)}>
            <Text variant="large" className={sectionHeaderStyleCustom(isDarkMode)}>
              Drafts
            </Text>
            <div className={resourceGridStyle}>
              {filteredSections.WithoutIcons.map((resource: Resource, index: number) => {
                const globalIndex = flatResources.findIndex((res) => res.title === resource.title);

                if (globalIndex === -1) {
                  console.warn(`Resource titled "${resource.title}" not found in flatResources.`);
                  return null;
                }

                const row = Math.floor(globalIndex / columnsPerRow);
                const col = globalIndex % columnsPerRow;
                const animationDelay = calculateAnimationDelay(row, col);
                return (
                  <ResourceCard
                    key={resource.title}
                    resource={resource}
                    isFavorite={favorites.some((fav) => fav.title === resource.title)}
                    onCopy={copyToClipboard}
                    onToggleFavorite={toggleFavorite}
                    onGoTo={goToResource}
                    onSelect={() => setSelectedResource(resource)}
                    animationDelay={animationDelay}
                  />
                );
              })}
            </div>
          </section>
        )}
      </main>

      {selectedResource && (
        <BespokePanel
          isOpen={true}
          onClose={() => setSelectedResource(null)}
          title={`${selectedResource.title} workspace`}
          description={selectedResource.description || 'Resource operations'}
          width="70%"
          isDarkMode={isDarkMode}
          variant="modal"
        >
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(260px, 1.1fr) minmax(320px, 1fr)',
            gap: 16,
            minHeight: 0,
          }}>
            <div style={{
              padding: 16,
              borderRadius: 0,
              border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
              background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 0,
                  background: isDarkMode ? `${colours.highlight}33` : `${colours.highlight}1F`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon iconName="Link" />
                </div>
                <div>
                  <Text style={{ fontWeight: 600 }}>{selectedResource.title}</Text>
                  <FluentLink href={selectedResource.url} target="_blank" rel="noopener noreferrer">
                    {selectedResource.url}
                  </FluentLink>
                </div>
              </div>
              <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                Use the operations panel to open, copy, or pin this resource.
              </Text>
            </div>

            <div style={{
              padding: 16,
              borderRadius: 0,
              border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
              background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
            }}>
              {selectedResource.title === 'Asana' && (
                <>
                  <Text style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                    Asana operations
                  </Text>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    <DefaultButton
                      text="Project silos"
                      onClick={() => setAsanaOperation('silos')}
                      styles={{
                        root: {
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          background: asanaOperation === 'silos'
                            ? (isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground)
                            : 'transparent',
                        },
                      }}
                    />
                    <DefaultButton
                      text="Team users"
                      onClick={() => setAsanaOperation('users')}
                      styles={{
                        root: {
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          background: asanaOperation === 'users'
                            ? (isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground)
                            : 'transparent',
                        },
                      }}
                    />
                    <DefaultButton
                      text="Task by ID"
                      onClick={() => setAsanaOperation('task')}
                      styles={{
                        root: {
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          background: asanaOperation === 'task'
                            ? (isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground)
                            : 'transparent',
                        },
                      }}
                    />
                  </div>

                  {asanaOperation === 'task' && (
                    <div style={{
                      borderRadius: 0,
                      border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                      padding: 12,
                      background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                      display: 'grid',
                      gap: 8
                    }}>
                      <Text style={{ fontSize: 12, fontWeight: 600 }}>
                        Task by ID
                      </Text>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input
                          value={asanaTaskId}
                          onChange={(e) => setAsanaTaskId(e.target.value)}
                          placeholder="Asana task ID"
                          style={{
                            flex: '1 1 160px',
                            height: 32,
                            borderRadius: 0,
                            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                            padding: '0 10px',
                            background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            fontSize: 12,
                            fontFamily: 'Raleway, sans-serif',
                          }}
                        />
                        <DefaultButton
                          text={asanaTaskLoading ? 'Searching…' : 'Find task'}
                          disabled={asanaTaskLoading}
                          onClick={() => fetchAsanaTask(asanaTaskId)}
                          iconProps={{ iconName: 'Search' }}
                        />
                      </div>
                      {asanaTaskError && (
                        <Text style={{ fontSize: 12, color: colours.cta }}>
                          {asanaTaskError}
                        </Text>
                      )}
                      {asanaTaskResult && (
                        <div style={{ display: 'grid', gap: 4 }}>
                          <Text style={{ fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                            <strong>{asanaTaskResult.name || '—'}</strong>
                          </Text>
                          <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                            {asanaTaskResult.completed ? 'Completed' : 'Open'}{asanaTaskResult.dueOn ? ` • Due ${asanaTaskResult.dueOn}` : ''}
                          </Text>
                          {asanaTaskResult.assigneeName && (
                            <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                              {asanaTaskResult.assigneeName}
                            </Text>
                          )}
                          {asanaTaskResult.url && (
                            <DefaultButton
                              text="Open task"
                              onClick={() => goToResource(asanaTaskResult.url || '')}
                              iconProps={{ iconName: 'OpenInNewWindow' }}
                              styles={{ root: { alignSelf: 'flex-start' } }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {asanaOperation === 'users' && (
                    <div style={{
                      borderRadius: 0,
                      border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                      padding: 12,
                      background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                      display: 'grid',
                      gap: 8
                    }}>
                      <Text style={{ fontSize: 12, fontWeight: 600 }}>
                        Team users
                      </Text>
                      {asanaTeamsError && (
                        <Text style={{ fontSize: 12, color: colours.cta }}>
                          {asanaTeamsError}
                        </Text>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <select
                          value={asanaSelectedTeamId}
                          onChange={(e) => {
                            setAsanaSelectedTeamId(e.target.value);
                            setAsanaUsers([]);
                          }}
                          style={{
                            flex: '1 1 220px',
                            height: 32,
                            borderRadius: 0,
                            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                            padding: '0 10px',
                            background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            fontSize: 12,
                            fontFamily: 'Raleway, sans-serif',
                          }}
                        >
                          <option value="">Select team…</option>
                          {asanaTeams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                        <DefaultButton
                          text={asanaUsersLoading ? 'Loading users…' : 'Load users'}
                          disabled={!asanaSelectedTeamId || asanaUsersLoading}
                          onClick={() => fetchAsanaUsers(asanaSelectedTeamId)}
                          iconProps={{ iconName: 'Contact' }}
                        />
                      </div>
                      {asanaUsersError && (
                        <Text style={{ fontSize: 12, color: colours.cta }}>
                          {asanaUsersError}
                        </Text>
                      )}
                      {asanaUsers.length > 0 && (
                        <div style={{ display: 'grid', gap: 6 }}>
                          {asanaUsers.map((user) => (
                            <div key={user.id} style={{
                              padding: '6px 8px',
                              borderRadius: 0,
                              border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                              background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                            }}>
                              <Text style={{ fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                                <strong>{user.name || 'Unknown'}</strong>
                              </Text>
                              {user.email && (
                                <Text style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                                  {user.email}
                                </Text>
                              )}
                              <Text style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                                {user.id}
                              </Text>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {asanaOperation === 'silos' && (
                    <div style={{
                      borderRadius: 0,
                      border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                      padding: 12,
                      background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                      display: 'grid',
                      gap: 8
                    }}>
                      <Text style={{ fontSize: 12, fontWeight: 600 }}>
                        Project silos
                      </Text>
                      {asanaTeamsError && (
                        <Text style={{ fontSize: 12, color: colours.cta }}>
                          {asanaTeamsError}
                        </Text>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <select
                          value={asanaSelectedTeamId}
                          onChange={(e) => {
                            const next = e.target.value;
                            setAsanaSelectedTeamId(next);
                            setAsanaProjects([]);
                            setAsanaSelectedProjectId('');
                            setAsanaSections([]);
                          }}
                          style={{
                            flex: '1 1 200px',
                            height: 32,
                            borderRadius: 0,
                            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                            padding: '0 10px',
                            background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            fontSize: 12,
                            fontFamily: 'Raleway, sans-serif',
                          }}
                        >
                          <option value="">Select team…</option>
                          {asanaTeams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                        <DefaultButton
                          text={asanaProjectsLoading ? 'Loading projects…' : 'Load projects'}
                          disabled={!asanaSelectedTeamId || asanaProjectsLoading}
                          onClick={() => fetchAsanaProjects(asanaSelectedTeamId)}
                          iconProps={{ iconName: 'ProjectCollection' }}
                        />
                      </div>
                      {asanaProjectsError && (
                        <Text style={{ fontSize: 12, color: colours.cta }}>
                          {asanaProjectsError}
                        </Text>
                      )}
                      {asanaProjects.length > 0 && (
                        <select
                          value={asanaSelectedProjectId}
                          onChange={(e) => {
                            const next = e.target.value;
                            setAsanaSelectedProjectId(next);
                            if (next) {
                              fetchAsanaProjectSilos(next);
                            }
                          }}
                          style={{
                            height: 32,
                            borderRadius: 0,
                            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                            padding: '0 10px',
                            background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            fontSize: 12,
                            fontFamily: 'Raleway, sans-serif',
                          }}
                        >
                          <option value="">Select project…</option>
                          {asanaProjects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}{project.archived ? ' (archived)' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      {asanaSectionsLoading && (
                        <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                          Loading silos…
                        </Text>
                      )}
                      {asanaSectionsError && (
                        <Text style={{ fontSize: 12, color: colours.cta }}>
                          {asanaSectionsError}
                        </Text>
                      )}
                      {asanaSections.length > 0 && (
                        <div style={{
                          display: 'flex',
                          gap: 12,
                          overflowX: 'auto',
                          paddingBottom: 6
                        }}>
                          {asanaSections.map((section) => (
                            <div key={section.id} style={{
                              minWidth: 220,
                              maxWidth: 260,
                              borderRadius: 0,
                              border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                              background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                              padding: 10,
                              display: 'grid',
                              gap: 8
                            }}>
                              <Text style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                                {section.name || 'Untitled'}
                              </Text>
                              {section.error && (
                                <Text style={{ fontSize: 12, color: colours.cta }}>
                                  {section.error}
                                </Text>
                              )}
                              {section.tasks && section.tasks.length > 0 ? (
                                section.tasks.map((task) => (
                                  <div key={task.id} style={{
                                    borderRadius: 0,
                                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                    background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                                    padding: '6px 8px',
                                    display: 'grid',
                                    gap: 4
                                  }}>
                                    <Text style={{ fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                                      {task.name}
                                    </Text>
                                    {task.assigneeName && (
                                      <Text style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                                        {task.assigneeName}
                                      </Text>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      {task.dueOn && (
                                        <Text style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                                          Due {task.dueOn}
                                        </Text>
                                      )}
                                      {task.url && (
                                        <DefaultButton
                                          text="Open"
                                          onClick={() => goToResource(task.url || '')}
                                          iconProps={{ iconName: 'OpenInNewWindow' }}
                                          styles={{ root: { height: 26, paddingInline: 8 } }}
                                        />
                                      )}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                                  No open tasks.
                                </Text>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {selectedResource.title === 'NetDocuments' && (
                <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                  <div style={{
                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    borderRadius: 0,
                    padding: 12,
                    background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                    display: 'grid',
                    gap: 8,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: 700 }}>Identity</Text>
                    <DefaultButton
                      text={netDocumentsUserLoading ? 'Loading…' : 'Fetch user membership'}
                      iconProps={{ iconName: 'Contact' }}
                      onClick={fetchNetDocumentsUser}
                      disabled={netDocumentsUserLoading}
                    />
                    {netDocumentsUserError && (
                      <Text style={{ fontSize: 12, color: colours.cta }}>
                        {netDocumentsUserError}
                      </Text>
                    )}
                    {netDocumentsUserResult && (
                      <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                        Membership loaded.
                      </Text>
                    )}
                  </div>

                  <div style={{
                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    borderRadius: 0,
                    padding: 12,
                    background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                    display: 'grid',
                    gap: 8,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: 700 }}>Workspace lookup</Text>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        value={netDocumentsClientId}
                        onChange={(e) => setNetDocumentsClientId(e.target.value)}
                        placeholder="Client ID"
                        style={{
                          flex: '0 1 120px',
                          height: 32,
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          padding: '0 10px',
                          background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          fontSize: 12,
                          fontFamily: 'Raleway, sans-serif',
                        }}
                      />
                      <Text style={{ fontSize: 14, color: isDarkMode ? '#d1d5db' : '#374151' }}>/</Text>
                      <input
                        value={netDocumentsMatterKey}
                        onChange={(e) => setNetDocumentsMatterKey(e.target.value)}
                        placeholder="Matter Key"
                        style={{
                          flex: '1 1 140px',
                          height: 32,
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          padding: '0 10px',
                          background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          fontSize: 12,
                          fontFamily: 'Raleway, sans-serif',
                        }}
                      />
                      <DefaultButton
                        text={netDocumentsWorkspaceLoading ? 'Searching…' : 'Find workspace'}
                        disabled={netDocumentsWorkspaceLoading || !netDocumentsClientId.trim() || !netDocumentsMatterKey.trim()}
                        onClick={() => fetchNetDocumentsWorkspace(netDocumentsClientId, netDocumentsMatterKey)}
                        iconProps={{ iconName: 'Search' }}
                      />
                    </div>
                    {netDocumentsWorkspaceError && (
                      <Text style={{ fontSize: 12, color: colours.cta }}>
                        {netDocumentsWorkspaceError}
                      </Text>
                    )}
                    {netDocumentsWorkspaceResult && (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: 600 }}>
                          {netDocumentsWorkspaceResult.name || 'Workspace'}
                        </Text>
                        {netDocumentsWorkspaceResult.client && (
                          <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                            Client: {netDocumentsWorkspaceResult.client} ({netDocumentsWorkspaceResult.clientId})
                          </Text>
                        )}
                        {netDocumentsWorkspaceResult.matter && (
                          <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                            Matter: {netDocumentsWorkspaceResult.matter} ({netDocumentsWorkspaceResult.matterKey})
                          </Text>
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {netDocumentsWorkspaceResult.url && (
                            <DefaultButton
                              text="Open in NetDocuments"
                              onClick={() => goToResource(netDocumentsWorkspaceResult.url || '')}
                              iconProps={{ iconName: 'OpenInNewWindow' }}
                            />
                          )}
                          {netDocumentsWorkspaceResult.id && (
                            <DefaultButton
                              text="Use workspace ID"
                              onClick={() => {
                                setNetDocumentsContainerId(netDocumentsWorkspaceResult.id || '');
                                setNetDocumentsSearchContainerId(netDocumentsWorkspaceResult.id || '');
                              }}
                              iconProps={{ iconName: 'BranchMerge' }}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{
                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    borderRadius: 0,
                    padding: 12,
                    background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                    display: 'grid',
                    gap: 8,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: 700 }}>Containers in workspace</Text>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        value={netDocumentsContainerId}
                        onChange={(e) => setNetDocumentsContainerId(e.target.value)}
                        placeholder="Workspace/container ID"
                        style={{
                          flex: '1 1 200px',
                          height: 32,
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          padding: '0 10px',
                          background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          fontSize: 12,
                          fontFamily: 'Raleway, sans-serif',
                        }}
                      />
                      <DefaultButton
                        text={netDocumentsContainerLoading ? 'Loading…' : 'Load contents'}
                        onClick={() => fetchNetDocumentsContainer(netDocumentsContainerId)}
                        iconProps={{ iconName: 'FolderHorizontal' }}
                        disabled={netDocumentsContainerLoading || !netDocumentsContainerId.trim()}
                      />
                    </div>
                    {netDocumentsContainerError && (
                      <Text style={{ fontSize: 12, color: colours.cta }}>
                        {netDocumentsContainerError}
                      </Text>
                    )}
                    {netDocumentsContainerItems.length > 0 && (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {netDocumentsContainerItems.slice(0, 6).map((item) => (
                          <div key={`${item.id}-${item.name}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 12 }}>
                              {item.name || item.id}
                            </Text>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {item.type === 'container' && (
                                <DefaultButton
                                  text="Use container"
                                  onClick={() => {
                                    setNetDocumentsContainerId(item.id || '');
                                    setNetDocumentsSearchContainerId(item.id || '');
                                  }}
                                />
                              )}
                              {item.type === 'document' && (
                                <DefaultButton
                                  text="Use document"
                                  onClick={() => setNetDocumentsDocumentId(item.id || '')}
                                />
                              )}
                              {item.url && (
                                <DefaultButton
                                  text="Open"
                                  iconProps={{ iconName: 'OpenInNewWindow' }}
                                  onClick={() => goToResource(item.url || '')}
                                />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{
                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    borderRadius: 0,
                    padding: 12,
                    background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                    display: 'grid',
                    gap: 8,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: 700 }}>Sub-containers</Text>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        value={netDocumentsContainerId}
                        onChange={(e) => setNetDocumentsContainerId(e.target.value)}
                        placeholder="Container ID"
                        style={{
                          flex: '1 1 180px',
                          height: 32,
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          padding: '0 10px',
                          background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          fontSize: 12,
                          fontFamily: 'Raleway, sans-serif',
                        }}
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        <input
                          type="checkbox"
                          checked={netDocumentsSubRecursive}
                          onChange={(e) => setNetDocumentsSubRecursive(e.target.checked)}
                        />
                        Recursive
                      </label>
                      <input
                        value={netDocumentsSubMax}
                        onChange={(e) => setNetDocumentsSubMax(e.target.value)}
                        placeholder="Max"
                        style={{
                          width: 80,
                          height: 32,
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          padding: '0 10px',
                          background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          fontSize: 12,
                          fontFamily: 'Raleway, sans-serif',
                        }}
                      />
                      <DefaultButton
                        text={netDocumentsSubLoading ? 'Loading…' : 'List sub-containers'}
                        onClick={() => fetchNetDocumentsSubContainers(netDocumentsContainerId)}
                        iconProps={{ iconName: 'FolderList' }}
                        disabled={netDocumentsSubLoading || !netDocumentsContainerId.trim()}
                      />
                    </div>
                    {netDocumentsSubError && (
                      <Text style={{ fontSize: 12, color: colours.cta }}>
                        {netDocumentsSubError}
                      </Text>
                    )}
                    {netDocumentsSubContainers.length > 0 && (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {netDocumentsSubContainers.slice(0, 6).map((item) => (
                          <div key={`${item.id}-${item.name}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 12 }}>{item.name || item.id}</Text>
                            <DefaultButton
                              text="Use container"
                              onClick={() => {
                                setNetDocumentsContainerId(item.id || '');
                                setNetDocumentsSearchContainerId(item.id || '');
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{
                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    borderRadius: 0,
                    padding: 12,
                    background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                    display: 'grid',
                    gap: 8,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: 700 }}>Document info</Text>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        value={netDocumentsDocumentId}
                        onChange={(e) => setNetDocumentsDocumentId(e.target.value)}
                        placeholder="Document ID"
                        style={{
                          flex: '1 1 200px',
                          height: 32,
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          padding: '0 10px',
                          background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          fontSize: 12,
                          fontFamily: 'Raleway, sans-serif',
                        }}
                      />
                      <DefaultButton
                        text={netDocumentsDocumentLoading ? 'Loading…' : 'Fetch document'}
                        onClick={() => fetchNetDocumentsDocument(netDocumentsDocumentId)}
                        iconProps={{ iconName: 'Page' }}
                        disabled={netDocumentsDocumentLoading || !netDocumentsDocumentId.trim()}
                      />
                    </div>
                    {netDocumentsDocumentError && (
                      <Text style={{ fontSize: 12, color: colours.cta }}>
                        {netDocumentsDocumentError}
                      </Text>
                    )}
                    {netDocumentsDocumentResult && (
                      <div style={{ display: 'grid', gap: 4 }}>
                        <Text style={{ fontSize: 12 }}>
                          <strong>{netDocumentsDocumentResult.name || 'Document'}</strong>
                        </Text>
                        {netDocumentsDocumentResult.url && (
                          <DefaultButton
                            text="Open document"
                            iconProps={{ iconName: 'OpenInNewWindow' }}
                            onClick={() => goToResource(netDocumentsDocumentResult.url || '')}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{
                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    borderRadius: 0,
                    padding: 12,
                    background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                    display: 'grid',
                    gap: 8,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: 700 }}>Search</Text>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <input
                        value={netDocumentsSearchQuery}
                        onChange={(e) => setNetDocumentsSearchQuery(e.target.value)}
                        placeholder="Search query"
                        style={{
                          flex: '1 1 240px',
                          height: 32,
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          padding: '0 10px',
                          background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          fontSize: 12,
                          fontFamily: 'Raleway, sans-serif',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input
                          value={netDocumentsSearchContainerId}
                          onChange={(e) => setNetDocumentsSearchContainerId(e.target.value)}
                          placeholder="Scope container (optional)"
                          style={{
                            flex: '1 1 200px',
                            height: 32,
                            borderRadius: 0,
                            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                            padding: '0 10px',
                            background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            fontSize: 12,
                            fontFamily: 'Raleway, sans-serif',
                          }}
                        />
                        <input
                          value={netDocumentsSearchLimit}
                          onChange={(e) => setNetDocumentsSearchLimit(e.target.value)}
                          placeholder="Limit"
                          style={{
                            width: 80,
                            height: 32,
                            borderRadius: 0,
                            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                            padding: '0 10px',
                            background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            fontSize: 12,
                            fontFamily: 'Raleway, sans-serif',
                          }}
                        />
                        <DefaultButton
                          text={netDocumentsSearchLoading ? 'Searching…' : 'Run search'}
                          iconProps={{ iconName: 'Search' }}
                          onClick={fetchNetDocumentsSearch}
                          disabled={netDocumentsSearchLoading || !netDocumentsSearchQuery.trim()}
                        />
                      </div>
                    </div>
                    {netDocumentsSearchError && (
                      <Text style={{ fontSize: 12, color: colours.cta }}>
                        {netDocumentsSearchError}
                      </Text>
                    )}
                    {netDocumentsSearchResults.length > 0 && (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {netDocumentsSearchResults.slice(0, 6).map((item) => (
                          <div key={`${item.id}-${item.name}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 12 }}>{item.name || item.id}</Text>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {item.type === 'container' && (
                                <DefaultButton
                                  text="Use container"
                                  onClick={() => {
                                    setNetDocumentsContainerId(item.id || '');
                                    setNetDocumentsSearchContainerId(item.id || '');
                                  }}
                                />
                              )}
                              {item.type === 'document' && (
                                <DefaultButton
                                  text="Use document"
                                  onClick={() => setNetDocumentsDocumentId(item.id || '')}
                                />
                              )}
                              {item.url && (
                                <DefaultButton
                                  text="Open"
                                  iconProps={{ iconName: 'OpenInNewWindow' }}
                                  onClick={() => goToResource(item.url || '')}
                                />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <Stack tokens={{ childrenGap: 8 }} styles={{ root: { marginTop: 12 } }}>
                <PrimaryButton
                  text="Open resource"
                  onClick={() => goToResource(selectedResource.url)}
                  iconProps={{ iconName: 'NavigateExternalInline' }}
                />
                <DefaultButton
                  text="Copy link"
                  onClick={() => copyToClipboard(selectedResource.url, selectedResource.title)}
                  iconProps={{ iconName: 'Copy' }}
                />
                <DefaultButton
                  text={favorites.some((fav) => fav.title === selectedResource.title) ? 'Unpin from favourites' : 'Pin to favourites'}
                  onClick={() => toggleFavorite(selectedResource)}
                  iconProps={{ iconName: 'FavoriteStar' }}
                />
              </Stack>

              {selectedResource.title === 'Azure' && (
                <div style={{ marginTop: 14 }}>
                  <Text style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                    Get user
                  </Text>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      value={azureUserQuery}
                      onChange={(e) => setAzureUserQuery(e.target.value)}
                      placeholder="Email or UPN"
                      style={{
                        flex: '1 1 180px',
                        height: 32,
                        borderRadius: 0,
                        border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                        padding: '0 10px',
                        background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        fontSize: 12,
                        fontFamily: 'Raleway, sans-serif',
                      }}
                    />
                    <DefaultButton
                      text={azureUserLoading ? 'Loading…' : 'Get user'}
                      disabled={azureUserLoading}
                      onClick={() => fetchAzureUser(azureUserQuery)}
                      iconProps={{ iconName: 'Contact' }}
                    />
                  </div>
                  {azureUserError && (
                    <Text style={{ fontSize: 12, marginTop: 8, color: colours.cta }}>
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

              {selectedResource.title === 'Clio' && (
                <div style={{ marginTop: 14 }}>
                  <Text style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                    Clio lookups
                  </Text>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        value={clioContactQuery}
                        onChange={(e) => setClioContactQuery(e.target.value)}
                        placeholder="Contact email"
                        style={{
                          flex: '1 1 180px',
                          height: 32,
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          padding: '0 10px',
                          background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          fontSize: 12,
                          fontFamily: 'Raleway, sans-serif',
                        }}
                      />
                      <DefaultButton
                        text={clioContactLoading ? 'Searching…' : 'Find contact'}
                        disabled={clioContactLoading}
                        onClick={() => fetchClioContact(clioContactQuery)}
                        iconProps={{ iconName: 'Contact' }}
                      />
                    </div>
                    {clioContactError && (
                      <Text style={{ fontSize: 12, color: colours.cta }}>
                        {clioContactError}
                      </Text>
                    )}
                    {clioContactResult && (
                      <div style={{ display: 'grid', gap: 4 }}>
                        {clioContactResult.length === 0 && (
                          <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                            No contacts found.
                          </Text>
                        )}
                        {clioContactResult.map((contact) => (
                          <Text key={contact.id} style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                            <strong>{contact.name || 'Unknown'}</strong> — {contact.email || 'No email'}
                          </Text>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                      <input
                        value={clioMatterQuery}
                        onChange={(e) => setClioMatterQuery(e.target.value)}
                        placeholder="Matter number or query"
                        style={{
                          flex: '1 1 180px',
                          height: 32,
                          borderRadius: 0,
                          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                          padding: '0 10px',
                          background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          fontSize: 12,
                          fontFamily: 'Raleway, sans-serif',
                        }}
                      />
                      <DefaultButton
                        text={clioMatterLoading ? 'Searching…' : 'Find matter'}
                        disabled={clioMatterLoading}
                        onClick={() => fetchClioMatter(clioMatterQuery)}
                        iconProps={{ iconName: 'Search' }}
                      />
                    </div>
                    {clioMatterError && (
                      <Text style={{ fontSize: 12, color: colours.cta }}>
                        {clioMatterError}
                      </Text>
                    )}
                    {clioMatterResult && (
                      <div style={{ display: 'grid', gap: 4 }}>
                        {clioMatterResult.length === 0 && (
                          <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                            No matters found.
                          </Text>
                        )}
                        {clioMatterResult.map((matter) => (
                          <Text key={matter.id} style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                            <strong>{matter.displayNumber || 'No ref'}</strong> — {matter.description || 'No description'}
                          </Text>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </BespokePanel>
      )}

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
              backgroundColor: colours.green,
              color: 'white',
            },
          }}
        >
          {copySuccess}
        </MessageBar>
      )}

    </div>
  );
};

export default Resources;
