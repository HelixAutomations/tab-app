// src/tabs/resources/Resources.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  MessageBar,
  MessageBarType,
  SearchBox,
  Link,
} from '@fluentui/react';
import { initializeIcons } from '@fluentui/react/lib/Icons';
import { colours } from '../../app/styles/colours';
import ResourceCard from './ResourceCard';
import ResourceDetails from './ResourceDetails';
import { sharedSearchBoxContainerStyle, sharedSearchBoxStyle } from '../../app/styles/FilterStyles';
import { useTheme } from '../../app/functionality/ThemeContext';
import '../../app/styles/ResourceCard.css';

// Initialize Fluent UI Icons
initializeIcons();

// Define types for sections and resources
export type SectionName = 'Favorites' | 'Internal' | 'External';

export interface Resource {
  title: string;
  url: string;
  icon: string;
  tags?: string[];
  description?: string;
}

interface ResourcesSections {
  Favorites: Resource[];
  Internal: Resource[];
  External: Resource[];
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
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '20px',
  paddingTop: '15px',
  '@media (min-width: 1000px)': {
    gridTemplateColumns: 'repeat(5, 1fr)',
  },
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

  // Define number of columns per row for delay calculation
  const columnsPerRow = 5;

  // Initialize resources with hard-coded data
  const resourcesSections: ResourcesSections = useMemo(() => {
    const initialSections: ResourcesSections = {
      Internal: [
        {
          title: 'Asana',
          url: 'https://app.asana.com/',
          icon: 'BulletedList',
        },
        {
          title: 'Nuclino',
          url: 'https://www.nuclino.com/',
          icon: 'KnowledgeArticle',
        },
        {
          title: 'Clio',
          url: 'https://eu.app.clio.com/nc/#/',
          icon: 'Suitcase',
        },
        {
          title: 'NetDocuments',
          url: 'https://eu.netdocuments.com/neWeb2/home',
          icon: 'DocumentSet',
        },
        {
          title: 'ActiveCampaign',
          url: 'https://helix-law54533.activehosted.com/',
          icon: 'Mail',
        },
        {
          title: 'BundleDocs',
          url: 'https://www.bundledocs.com/',
          icon: 'Folder',
        },
        {
          title: 'Leapsome',
          url: 'https://www.leapsome.com/app/#/dashboard?init=true',
          icon: 'People',
        },
      ],
      External: [
        {
          title: 'Harvey',
          url: 'https://www.harvey.ai/',
          icon: 'Robot',
        },
        {
          title: 'LexisNexis',
          url: 'https://www.lexisnexis.com/en-us/gateway.page',
          icon: 'Library',
        },
        {
          title: 'Thompson Reuters',
          url: 'https://www.thomsonreuters.com/en.html',
          icon: 'Database',
        },
        {
          title: 'Land Registry',
          url: 'https://www.gov.uk/government/organisations/land-registry',
          icon: 'Globe',
        },
        {
          title: 'Companies House',
          url: 'https://www.gov.uk/government/organisations/companies-house',
          icon: 'CityNext',
        },
      ],
      Favorites: [], // Will be populated based on favorites
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

  // Filtered Sections based on search query and excluding favorites from Internal/External
  const filteredSections: ResourcesSections = useMemo(() => {
    const filterResources = (resources: Resource[]) =>
      resources.filter(
        (resource) =>
          resource.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !favorites.some((fav) => fav.title === resource.title)
      );

    const sortResources = (resources: Resource[]) => {
      const sorted = [...resources];
      // Optional: Implement sorting if needed
      return sorted;
    };

    // Prepare Favorites section separately
    const favoriteResources = favorites.filter((resource) =>
      resource.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return {
      Favorites: sortResources(favoriteResources),
      Internal: sortResources(filterResources(resourcesSections.Internal)),
      External: sortResources(filterResources(resourcesSections.External)),
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
    const sections = ['Favorites', 'Internal', 'External'] as SectionName[];
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

        {/* Render Other Sections */}
        {(['Internal', 'External'] as SectionName[]).map(
          (sectionName) =>
            filteredSections[sectionName].length > 0 && (
              <section key={sectionName} className={sectionStyle(isDarkMode)}>
                <Text variant="large" className={sectionHeaderStyleCustom(isDarkMode)}>
                  {sectionName}
                </Text>
                <div className={resourceGridStyle}>
                  {filteredSections[sectionName].map((resource: Resource, index: number) => {
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
            )
        )}
      </main>

      {/* Footer */}
      <footer className={footerStyle(isDarkMode)}>
        <Text>
          <Link
            href="https://helix-law.co.uk/"
            target="_blank"
            styles={{
              root: {
                color: isDarkMode ? colours.dark.subText : colours.light.subText,
                fontSize: '12px',
                fontFamily: 'Raleway, sans-serif',
                textDecoration: 'none',
              },
            }}
            aria-label="Helix Law Website"
          >
            https://helix-law.co.uk/
          </Link>
          {' | '}
          <Text
            variant="small"
            styles={{
              root: {
                color: isDarkMode ? colours.dark.text : colours.light.text,
                display: 'inline',
              },
            }}
          >
            01273 761990
          </Text>
        </Text>
        <Text
          styles={{
            root: {
              fontSize: '12px',
              fontFamily: 'Raleway, sans-serif',
              color: isDarkMode ? colours.dark.text : colours.light.subText,
            },
          }}
        >
          Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE
        </Text>
      </footer>

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
              borderRadius: '4px',
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
