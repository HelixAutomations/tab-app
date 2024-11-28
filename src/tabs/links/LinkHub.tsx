// src/tabs/links/LinkHub.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  MessageBar,
  MessageBarType,
  SearchBox,
  Spinner,
  SpinnerSize,
  Link,
} from '@fluentui/react';
import { initializeIcons } from '@fluentui/react/lib/Icons';
import { colours } from '../../app/styles/colours';
import { useFeContext } from '../../app/functionality/FeContext'; // Assuming you have a similar context
import LinkCard from './LinkCard';
import LinkDetails from './LinkDetails'; // Optional
import {
  sharedSearchBoxContainerStyle,
  sharedSearchBoxStyle,
} from '../../app/styles/FilterStyles';
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme
import '../../app/styles/LinkCard.css'; // Ensure CSS is imported

initializeIcons();

// Define types for sections and links
export type SectionName = 'Favorites' | 'General_Processes' | 'Operations';

export interface LinkItem {
  title: string;
  url: string;
  icon: string;
  tags?: string[];
  description?: string;
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

const controlsContainerStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap',
});

const searchBoxContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'relative',
    width: '100%',
    maxWidth: '300px',
  });

const mainContentStyle = (isDarkMode: boolean) =>
  mergeStyles({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  });

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
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', // Responsive columns
  gap: '20px',
  paddingTop: '15px',
  '@media (min-width: 1000px)': {
    gridTemplateColumns: 'repeat(5, 1fr)', // Max 5 cards per row
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

const commonInputStyle = {
  height: '40px',
  lineHeight: '40px',
};

// Shared styles for inputs (Dropdown and SearchBox)
interface LinkHubProps {
  // No need for isDarkMode prop anymore
}

const LinkHub: React.FC<LinkHubProps> = () => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context
  const { sqlData, isLoading, error } = useFeContext(); // Assuming similar context
  const [favorites, setFavorites] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<LinkItem | null>(null);

  // Define number of columns per row for delay calculation
  const columnsPerRow = 5;

  // Initialize links
  const linkHubSections: { [key in SectionName]: LinkItem[] } = useMemo(
    () => ({
      General_Processes: [
        {
          title: 'Tel. Attendance Note',
          url: 'https://www.cognitoforms.com/Helix1/TelephoneAttendanceNote',
          icon: 'Phone',
        },
        { title: 'Tasks', url: 'https://www.cognitoforms.com/Helix1/V2Tasks', icon: 'BulletedList' },
        { title: 'Office Attendance', url: 'https://www.cognitoforms.com/Helix1/OfficeAttendance', icon: 'Calendar' },
        {
          title: 'Proof of Identity',
          url: 'https://www.cognitoforms.com/Helix1/WebFormProofOfIdentityV2',
          icon: 'Contact',
        },
        { title: 'Open a Matter', url: 'https://www.cognitoforms.com/Helix1/OpenAMatter', icon: 'FolderOpen' },
        {
          title: 'CollabSpace Requests',
          url: 'https://www.cognitoforms.com/Helix1/CollabSpaceRequests',
          icon: 'People',
        },
      ],
      Operations: [
        { title: 'Call Handling', url: 'https://www.cognitoforms.com/Helix1/V2CallHandling', icon: 'Phone' },
        {
          title: 'Transaction Intake',
          url: 'https://www.cognitoforms.com/Helix1/TransactionsIntakeV2',
          icon: 'Bank',
        },
        { title: 'Incoming Post', url: 'https://www.cognitoforms.com/Helix1/IncomingPost', icon: 'Mail' },
      ],
      Favorites: [], // Will be populated based on favorites
    }),
    [favorites]
  );

  // Extract links from sqlData if available (assuming similar structure)
  useEffect(() => {
    if (sqlData && sqlData.length > 0) {
      // Assuming sqlData has the same structure as predefined links
      const generalProcesses = sqlData
        .filter((item: any) => item.Category === 'General_Processes')
        .map((item: any) => ({
          title: item.Title,
          url: item.URL,
          icon: item.Icon,
          tags: item.Tags ? item.Tags.split(',').map((tag: string) => tag.trim()) : [],
          description: item.Description || '',
        }));

      const operations = sqlData
        .filter((item: any) => item.Category === 'Operations')
        .map((item: any) => ({
          title: item.Title,
          url: item.URL,
          icon: item.Icon,
          tags: item.Tags ? item.Tags.split(',').map((tag: string) => tag.trim()) : [],
          description: item.Description || '',
        }));

      linkHubSections.General_Processes.push(...generalProcesses);
      linkHubSections.Operations.push(...operations);
    }
  }, [sqlData, linkHubSections]);

  // Load stored favorites from localStorage
  useEffect(() => {
    const storedFavorites = localStorage.getItem('favorites');
    if (storedFavorites) {
      setFavorites(JSON.parse(storedFavorites));
    }
  }, []);

  // Update localStorage whenever favorites change
  useEffect(() => {
    localStorage.setItem('favorites', JSON.stringify(favorites));
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
  const toggleFavorite = useCallback((title: string) => {
    setFavorites((prev) =>
      prev.includes(title) ? prev.filter((fav) => fav !== title) : [...prev, title]
    );
  }, []);

  // Handle Go To Link
  const goToLink = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  // Filtered Sections based on search query and excluding favorites from other sections
  const filteredSections: { [key in SectionName]: LinkItem[] } = useMemo(() => {
    const filterLinks = (links: LinkItem[]) =>
      links.filter(
        (link) =>
          link.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !favorites.includes(link.title) // Exclude favorites from other sections
      );

    const sortLinks = (links: LinkItem[]) => {
      const sorted = [...links];
      // Optional: Implement sorting if needed
      return sorted;
    };

    // Prepare Favorites section separately
    const favoriteLinks = [...linkHubSections.General_Processes, ...linkHubSections.Operations].filter((link) =>
      favorites.includes(link.title)
    );

    return {
      Favorites: sortLinks(
        favoriteLinks.filter((link) =>
          link.title.toLowerCase().includes(searchQuery.toLowerCase())
        )
      ),
      General_Processes: sortLinks(filterLinks(linkHubSections.General_Processes)),
      Operations: sortLinks(filterLinks(linkHubSections.Operations)),
    };
  }, [favorites, linkHubSections, searchQuery]);

  // Calculate animation delays based on grid position
  const calculateAnimationDelay = (index: number) => {
    const row = Math.floor(index / columnsPerRow);
    const col = index % columnsPerRow;
    return (row + col) * 0.1;
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Header */}
      <header className={headerStyle(isDarkMode)}>
        {/* Search Box */}
        <div className={sharedSearchBoxContainerStyle(isDarkMode)}>
          <SearchBox
            placeholder="Search links..."
            value={searchQuery}
            onChange={(_, newValue) => setSearchQuery(newValue || '')}
            styles={sharedSearchBoxStyle(isDarkMode)}
            aria-label="Search links"
          />
        </div>
      </header>

      {/* Loading and Error States */}
      {isLoading ? (
        <Stack horizontalAlign="center" verticalAlign="center" styles={{ root: { flex: 1 } }}>
          <Spinner label="Loading links..." size={SpinnerSize.large} />
        </Stack>
      ) : error ? (
        <MessageBar
          messageBarType={MessageBarType.error}
          isMultiline={false}
          onDismiss={() => {}}
          dismissButtonAriaLabel="Close"
          styles={{ root: { marginBottom: '20px', borderRadius: '4px' } }}
        >
          {error}
        </MessageBar>
      ) : (
        // Main Content
        <main className={mainContentStyle(isDarkMode)}>
          {(['Favorites', 'General_Processes', 'Operations'] as SectionName[]).map((sectionName) => (
            <section key={sectionName} className={sectionStyle(isDarkMode)}>
              <Text variant="large" className={sectionHeaderStyleCustom(isDarkMode)}>
                {sectionName.replace('_', ' ')}
              </Text>
              {filteredSections[sectionName].length === 0 && sectionName !== 'Favorites' ? (
                <Text
                  variant="small"
                  styles={{
                    root: {
                      color: isDarkMode ? '#ccc' : '#666',
                      marginTop: '15px',
                    },
                  }}
                >
                  No links found.
                </Text>
              ) : (
                <div className={resourceGridStyle}>
                  {filteredSections[sectionName].map((link: LinkItem, index: number) => {
                    const globalIndex =
                      linkHubSections.Favorites.length +
                      linkHubSections.General_Processes.length +
                      linkHubSections.Operations.length;
                    const animationDelay = calculateAnimationDelay(index);
                    return (
                      <LinkCard
                        key={link.title}
                        link={link}
                        isFavorite={favorites.includes(link.title)}
                        onCopy={copyToClipboard}
                        onToggleFavorite={toggleFavorite}
                        onGoTo={goToLink}
                        onSelect={() => setSelectedLink(link)}
                        animationDelay={animationDelay}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </main>
      )}

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
            styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text, display: 'inline' } }}
          >
            01273 761990
          </Text>
        </Text>
        <Text
          styles={{
            root: {
              fontSize: '12px',
              fontFamily: 'Raleway, sans-serif',
              color: isDarkMode ? colours.dark.text : colours.light.text,
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

      {/* Link Details Panel */}
      {selectedLink && (
        <LinkDetails
          link={selectedLink}
          isDarkMode={isDarkMode}
          onClose={() => setSelectedLink(null)}
        />
      )}
    </div>
  );
};

export default LinkHub;
