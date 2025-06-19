// src/tabs/forms/Forms.tsx

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
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
import FormCard from './FormCard';
import FormDetails from './FormDetails';
import {
  sharedSearchBoxContainerStyle,
  sharedSearchBoxStyle,
} from '../../app/styles/FilterStyles';
import { useTheme } from '../../app/functionality/ThemeContext';
import '../../app/styles/FormCard.css';

// Import Financial Forms
import { financialForms } from './FinancialForms';
// Import types – note that FormItem is imported from your types file now
import { Matter, FormItem, UserData } from '../../app/functionality/types';

// Initialize Fluent UI icons
initializeIcons();

// Define types for sections and links
export type SectionName = 'Favorites' | 'Financial' | 'General_Processes' | 'Operations';

// (Removed local FormItem declaration because it's imported above)

// Update the Forms component's prop types so it can receive these matters.
interface FormsProps {
  userData: UserData[] | null;
  matters: Matter[];
}

// Styles
const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '40px 20px',
    width: '100%',
    maxWidth: '1200px',
    margin: '0 auto',
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
    gap: '30px',
    paddingBottom: '40px', // Added padding to create gap before footer
  });

const sectionStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    border: '1px solid transparent',
    borderRadius: '8px',
    padding: '30px',
    boxSizing: 'border-box',
    boxShadow: isDarkMode
      ? '0 2px 4px rgba(255, 255, 255, 0.1)'
      : '0 2px 4px rgba(0, 0, 0, 0.05)',
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
    marginBottom: '20px',
    marginTop: '0px',
  });

const resourceGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: '24px',
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

const Forms: React.FC<FormsProps> = ({ userData, matters }) => {
  const { isDarkMode } = useTheme();
  const [favorites, setFavorites] = useState<FormItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<FormItem | null>(null);

  // Handle storage changes for syncing favourites
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'formsFavorites' && event.newValue) {
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

  // Define embedded General Processes and Operations forms
  const formHubSections: { [key in SectionName]: FormItem[] } = useMemo(() => {
    const generalProcesses: FormItem[] = [
      {
        title: 'Tel. Attendance Note',
        url: 'https://www.cognitoforms.com/Helix1/TelephoneAttendanceNote',
        icon: 'Phone',
        embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '41' },
      },
      {
        title: 'Tasks',
        url: 'https://www.cognitoforms.com/Helix1/V2Tasks',
        icon: 'BulletedList',
        embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '90' },
      },
      {
        title: 'Office Attendance',
        url: 'https://www.cognitoforms.com/Helix1/OfficeAttendance',
        icon: 'Calendar',
        embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '109' },
      },
      {
        title: 'Proof of Identity',
        url: 'https://www.cognitoforms.com/Helix1/WebFormProofOfIdentityV2',
        icon: 'Contact',
        embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '60' },
      },
      {
        title: 'Open a Matter',
        url: 'https://www.cognitoforms.com/Helix1/OpenAMatter',
        icon: 'FolderOpen',
        embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '9' },
      },
      {
        title: 'CollabSpace Requests',
        url: 'https://www.cognitoforms.com/Helix1/CollabSpaceRequests',
        icon: 'People',
        embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '44' },
      },
    ];

    const operations: FormItem[] = [
      {
        title: 'Call Handling',
        url: 'https://www.cognitoforms.com/Helix1/V2CallHandling',
        icon: 'Phone',
        embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '98' },
      },
      {
        title: 'Transaction Intake',
        url: 'https://www.cognitoforms.com/Helix1/TransactionsIntakeV2',
        icon: 'Bank',
        embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '58' },
      },
      {
        title: 'Incoming Post',
        url: 'https://www.cognitoforms.com/Helix1/IncomingPost',
        icon: 'Mail',
        embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '108' },
      },
    ];

    return {
      Favorites: [], // Dynamically populated
      General_Processes: generalProcesses, // Embedded forms
      Operations: operations,              // Embedded forms
      Financial: financialForms,           // Imported financial forms
    };
  }, [financialForms]);

  // Load stored favorites from localStorage
  useEffect(() => {
    const storedFavorites = localStorage.getItem('formsFavorites');
    if (storedFavorites) {
      setFavorites(JSON.parse(storedFavorites));
    }
  }, []);

  // Update localStorage whenever favorites change
  useEffect(() => {
    localStorage.setItem('formsFavorites', JSON.stringify(favorites));
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
  const toggleFavorite = useCallback((link: FormItem) => {
    setFavorites((prev) => {
      const isAlreadyFavorite = prev.some(fav => fav.title === link.title);
      let updatedFavorites: FormItem[];
      if (isAlreadyFavorite) {
        updatedFavorites = prev.filter(fav => fav.title !== link.title);
      } else {
        updatedFavorites = [...prev, link];
      }

      localStorage.setItem('formsFavorites', JSON.stringify(updatedFavorites));
      return updatedFavorites;
    });
  }, []);

  // Handle Go To Link
  const goToLink = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  // Filtered Sections based on search query and excluding favorites from other sections
  const filteredSections: { [key in SectionName]: FormItem[] } = useMemo(() => {
    const filterLinks = (links: FormItem[]) =>
      links.filter(
        (link) =>
          link.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !favorites.some(fav => fav.title === link.title)
      );

    const sortLinks = (links: FormItem[]) => {
      const sorted = [...links];
      // Optional: Implement sorting if needed
      return sorted;
    };

    // Prepare Favorites section separately
    const allSectionsExceptFavorites = ['Financial', 'General_Processes', 'Operations'] as SectionName[];
    const favoriteLinks = allSectionsExceptFavorites.reduce<FormItem[]>((acc, section) => {
      return acc.concat(formHubSections[section].filter(link => favorites.some(fav => fav.title === link.title)));
    }, []);

    return {
      Favorites: sortLinks(
        favoriteLinks.filter((link) =>
          link.title.toLowerCase().includes(searchQuery.toLowerCase())
        )
      ),
      Financial: sortLinks(filterLinks(formHubSections.Financial)),
      General_Processes: sortLinks(filterLinks(formHubSections.General_Processes)),
      Operations: sortLinks(filterLinks(formHubSections.Operations)),
    };
  }, [favorites, formHubSections, searchQuery]);

  // Calculate animation delays based on grid position
  const calculateAnimationDelay = (index: number) => {
    const row = Math.floor(index / columnsPerRow);
    const col = index % columnsPerRow;
    return row * 0.2 + col * 0.1; // Adjust delays as needed
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Header */}
      <header className={headerStyle(isDarkMode)}>
        <div className={sharedSearchBoxContainerStyle(isDarkMode)}>
          <SearchBox
            placeholder="Search forms..."
            value={searchQuery}
            onChange={(_, newValue) => setSearchQuery(newValue || '')}
            styles={sharedSearchBoxStyle(isDarkMode)}
            aria-label="Search forms"
          />
        </div>
      </header>

      {/* Main Content */}
      <main className={mainContentStyle(isDarkMode)}>
        {filteredSections.Favorites.length > 0 && (
          <section key="Favorites" className={sectionStyle(isDarkMode)}>
            <Text variant="large" className={sectionHeaderStyleCustom(isDarkMode)}>
              Favourites
            </Text>
            <div className={resourceGridStyle}>
              {filteredSections.Favorites.map((link: FormItem, index: number) => {
                const animationDelay = calculateAnimationDelay(index);
                return (
                  <FormCard
                    key={link.title}
                    link={link}
                    isFavorite={favorites.some(fav => fav.title === link.title)}
                    onCopy={copyToClipboard}
                    onToggleFavorite={() => toggleFavorite(link)}
                    onGoTo={() => goToLink(link.url)}
                    onSelect={() => setSelectedLink(link)}
                    animationDelay={animationDelay}
                    description={link.description} // Pass description if available
                  />
                );
              })}
            </div>
          </section>
        )}

        {filteredSections.Financial.length > 0 && (
          <section key="Financial" className={sectionStyle(isDarkMode)}>
            <Text variant="large" className={sectionHeaderStyleCustom(isDarkMode)}>
              Financial
            </Text>
            <div className={resourceGridStyle}>
              {filteredSections.Financial.map((link: FormItem, index: number) => {
                const animationDelay = calculateAnimationDelay(index);
                return (
                  <FormCard
                    key={link.title}
                    link={link}
                    isFavorite={favorites.some(fav => fav.title === link.title)}
                    onCopy={copyToClipboard}
                    onToggleFavorite={() => toggleFavorite(link)}
                    onGoTo={() => goToLink(link.url)}
                    onSelect={() => setSelectedLink(link)}
                    animationDelay={animationDelay}
                    description={link.description} // Pass description if available
                  />
                );
              })}
            </div>
          </section>
        )}

        {filteredSections.General_Processes.length > 0 && (
          <section key="General_Processes" className={sectionStyle(isDarkMode)}>
            <Text variant="large" className={sectionHeaderStyleCustom(isDarkMode)}>
              General Processes
            </Text>
            <div className={resourceGridStyle}>
              {filteredSections.General_Processes.map((link: FormItem, index: number) => {
                const animationDelay = calculateAnimationDelay(index);
                return (
                  <FormCard
                    key={link.title}
                    link={link}
                    isFavorite={favorites.some(fav => fav.title === link.title)}
                    onCopy={copyToClipboard}
                    onToggleFavorite={() => toggleFavorite(link)}
                    onGoTo={() => goToLink(link.url)}
                    onSelect={() => setSelectedLink(link)}
                    animationDelay={animationDelay}
                    description={link.description} // Pass description if available
                  />
                );
              })}
            </div>
          </section>
        )}

        {filteredSections.Operations.length > 0 && (
          <section key="Operations" className={sectionStyle(isDarkMode)}>
            <Text variant="large" className={sectionHeaderStyleCustom(isDarkMode)}>
              Operations
            </Text>
            <div className={resourceGridStyle}>
              {filteredSections.Operations.map((link: FormItem, index: number) => {
                const animationDelay = calculateAnimationDelay(index);
                return (
                  <FormCard
                    key={link.title}
                    link={link}
                    isFavorite={favorites.some(fav => fav.title === link.title)}
                    onCopy={copyToClipboard}
                    onToggleFavorite={() => toggleFavorite(link)}
                    onGoTo={() => goToLink(link.url)}
                    onSelect={() => setSelectedLink(link)}
                    animationDelay={animationDelay}
                    description={link.description} // Pass description if available
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
              borderRadius: '4px',
            },
          }}
        >
          {copySuccess}
        </MessageBar>
      )}

      {/* Form Details Panel */}
      {selectedLink && (
        <FormDetails
          isOpen={true}
          onClose={() => setSelectedLink(null)}
          link={selectedLink}
          isDarkMode={isDarkMode}
          isFinancial={selectedLink?.tags?.includes('Financial')}
          userData={userData}
          matters={matters} // Pass the matters array to FormDetails
        />
      )}
    </div>
  );
};

export default Forms;
