// src/tabs/resources/Resources.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  MessageBar,
  MessageBarType,
  SearchBox,
  Link as FluentLink, // Renamed to avoid confusion with resource Link
} from '@fluentui/react';
import { initializeIcons } from '@fluentui/react/lib/Icons';
import { colours } from '../../app/styles/colours';
import ResourceCard from './ResourceCard';
import ResourceDetails from './ResourceDetails';
import { sharedSearchBoxContainerStyle, sharedSearchBoxStyle } from '../../app/styles/FilterStyles';
import { useTheme } from '../../app/functionality/ThemeContext';
import '../../app/styles/ResourceCard.css';

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

// Initialize Fluent UI Icons
initializeIcons();

// Define types for sections and resources
export type SectionName = 'Favorites' | 'WithIcons' | 'WithoutIcons';

export interface Resource {
  title: string;
  url: string;
  icon: string;
  tags?: string[];
  description?: string;
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
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    borderRadius: '8px',
    padding: '20px',
    boxSizing: 'border-box',
    boxShadow: isDarkMode
      ? '0 4px 12px rgba(255, 255, 255, 0.1)'
      : '0 4px 12px rgba(0, 0, 0, 0.1)',
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
    borderRadius: '8px',
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
  });

// Define the props for Resources component
interface ResourcesProps {
  // No props needed as data is hard-coded
}

const Resources: React.FC<ResourcesProps> = () => {
  const { isDarkMode } = useTheme();
  const [favorites, setFavorites] = useState<Resource[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);

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
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

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

      {/* Resource Details Panel */}
      {selectedResource && (
        <ResourceDetails
          resource={selectedResource}
          onClose={() => setSelectedResource(null)}
        />
      )}
    </div>
  );
};

export default Resources;
