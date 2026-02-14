
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
import { colours } from '../../app/styles/colours';
import FormCard from './FormCard';
import FormDetails from './FormDetails';
import {
  sharedSearchBoxContainerStyle,
  sharedSearchBoxStyle,
} from '../../app/styles/FilterStyles';
// invisible change
import { useTheme } from '../../app/functionality/ThemeContext';
import '../../app/styles/FormCard.css';
import { isAdminUser } from '../../app/admin';
import FormHealthCheck from '../../CustomForms/shared/FormHealthCheck';

// Import Financial Forms
import { formSections } from './formsData';
// Import types – note that FormItem is imported from your types file now
import { NormalizedMatter, FormItem, UserData } from '../../app/functionality/types';

// Icons initialized in index.tsx - no need to re-initialize

// Define types for sections and links
export type SectionName = 'Favorites' | 'Financial' | 'General_Processes' | 'Operations' | 'Tech_Support' | 'Recommendations' | 'Browse_Directories';

// (Removed local FormItem declaration because it's imported above)

// Update the Forms component's prop types so it can receive these matters.
interface FormsProps {
  userData: UserData[] | null;
  matters: NormalizedMatter[];
}

// Styles
const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    minHeight: '100vh',
    width: '100%',
    padding: '26px 30px 40px',
    background: isDarkMode 
      ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 30%, #334155 65%, #475569 100%)'
      : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 25%, #e2e8f0 65%, #cbd5e1 100%)',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    transition: 'background 0.3s ease, color 0.3s ease',
    fontFamily: 'Raleway, sans-serif',
  });

const headerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px',
    padding: '0',
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
    boxShadow: 'none',
  });

const mainContentStyle = (isDarkMode: boolean) =>
  mergeStyles({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  });

const sectionStyle = (isDarkMode: boolean) =>
  mergeStyles({
    background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
    borderRadius: 12,
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
    boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)',
    padding: '20px 22px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    transition: 'all 0.3s ease',
  });

const sectionHeaderStyleCustom = (isDarkMode: boolean) =>
  mergeStyles({
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    fontFamily: 'Raleway, sans-serif',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    marginBottom: '12px',
  });

const resourceGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
  gap: '20px',
  paddingTop: '8px',
  maxWidth: '100%',
});

const footerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
    borderRadius: 12,
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
    boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)',
    padding: '20px 22px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
  });

const Forms: React.FC<FormsProps> = ({ userData, matters }) => {
  const { isDarkMode } = useTheme();
  const [favorites, setFavorites] = useState<FormItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<FormItem | null>(null);
  const isAdmin = isAdminUser(userData?.[0]);

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

  // Define embedded form sections
  const formHubSections: { [key in SectionName]: FormItem[] } = useMemo(() => {

    return {
      Favorites: [], // Dynamically populated
      General_Processes: formSections.General_Processes,
      Operations: formSections.Operations,
      Financial: formSections.Financial,
      Tech_Support: formSections.Tech_Support,
      Recommendations: formSections.Recommendations,
      Browse_Directories: formSections.Browse_Directories,
    };
  }, []);

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
    const allSectionsExceptFavorites = ['Financial', 'General_Processes', 'Operations', 'Tech_Support', 'Recommendations', 'Browse_Directories'] as SectionName[];
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
      Tech_Support: sortLinks(filterLinks(formHubSections.Tech_Support)),
      Recommendations: sortLinks(filterLinks(formHubSections.Recommendations)),
      Browse_Directories: sortLinks(filterLinks(formHubSections.Browse_Directories)),
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
        <Text 
          styles={{
            root: {
              fontSize: '24px',
              fontWeight: '600',
              color: isDarkMode ? colours.dark.text : colours.light.text,
              letterSpacing: '-0.025em',
              fontFamily: 'Raleway, sans-serif',
              margin: 0,
            }
          }}
        >
          Forms & Processes
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAdmin && <FormHealthCheck />}
          <div className={sharedSearchBoxContainerStyle(isDarkMode)}>
            <SearchBox
              placeholder="Search forms and processes..."
              value={searchQuery}
              onChange={(_, newValue) => setSearchQuery(newValue || '')}
              styles={sharedSearchBoxStyle(isDarkMode)}
              aria-label="Search forms and processes"
            />
          </div>
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
                    onCopy={link.url ? copyToClipboard : undefined}
                    onToggleFavorite={() => toggleFavorite(link)}
                    onGoTo={link.url ? () => goToLink(link.url!) : undefined}
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
                    onCopy={link.url ? copyToClipboard : undefined}
                    onToggleFavorite={() => toggleFavorite(link)}
                    onGoTo={link.url ? () => goToLink(link.url!) : undefined}
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
                    onCopy={link.url ? copyToClipboard : undefined}
                    onToggleFavorite={() => toggleFavorite(link)}
                    onGoTo={link.url ? () => goToLink(link.url!) : undefined}
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
                    onCopy={link.url ? copyToClipboard : undefined}
                    onToggleFavorite={() => toggleFavorite(link)}
                    onGoTo={link.url ? () => goToLink(link.url!) : undefined}
                    onSelect={() => setSelectedLink(link)}
                    animationDelay={animationDelay}
                    description={link.description} // Pass description if available
                  />
                );
              })}
            </div>
          </section>
        )}

        {filteredSections.Tech_Support.length > 0 && (
          <section key="Tech_Support" className={sectionStyle(isDarkMode)}>
            <Text variant="large" className={sectionHeaderStyleCustom(isDarkMode)}>
              Tech Support
            </Text>
            <div className={resourceGridStyle}>
              {filteredSections.Tech_Support.map((link: FormItem, index: number) => {
                const animationDelay = calculateAnimationDelay(index);
                return (
                  <FormCard
                    key={link.title}
                    link={link}
                    isFavorite={favorites.some(fav => fav.title === link.title)}
                    onCopy={link.url ? copyToClipboard : undefined}
                    onToggleFavorite={() => toggleFavorite(link)}
                    onGoTo={link.url ? () => goToLink(link.url!) : undefined}
                    onSelect={() => setSelectedLink(link)}
                    animationDelay={animationDelay}
                    description={link.description}
                  />
                );
              })}
            </div>
          </section>
        )}

        {filteredSections.Recommendations.length > 0 && (
          <section key="Recommendations" className={sectionStyle(isDarkMode)}>
            <Text variant="large" className={sectionHeaderStyleCustom(isDarkMode)}>
              Recommendations
            </Text>
            <div className={resourceGridStyle}>
              {filteredSections.Recommendations.map((link: FormItem, index: number) => {
                const animationDelay = calculateAnimationDelay(index);
                return (
                  <FormCard
                    key={link.title}
                    link={link}
                    isFavorite={favorites.some(fav => fav.title === link.title)}
                    onCopy={link.url ? copyToClipboard : undefined}
                    onToggleFavorite={() => toggleFavorite(link)}
                    onGoTo={link.url ? () => goToLink(link.url!) : undefined}
                    onSelect={() => setSelectedLink(link)}
                    animationDelay={animationDelay}
                    description={link.description}
                  />
                );
              })}
            </div>
          </section>
        )}

        {filteredSections.Browse_Directories.length > 0 && (
          <section key="Browse_Directories" className={sectionStyle(isDarkMode)}>
            <Text variant="large" className={sectionHeaderStyleCustom(isDarkMode)}>
              Browse Directories
            </Text>
            <div className={resourceGridStyle}>
              {filteredSections.Browse_Directories.map((link: FormItem, index: number) => {
                const animationDelay = calculateAnimationDelay(index);
                return (
                  <FormCard
                    key={link.title}
                    link={link}
                    isFavorite={favorites.some(fav => fav.title === link.title)}
                    onCopy={link.url ? copyToClipboard : undefined}
                    onToggleFavorite={() => toggleFavorite(link)}
                    onGoTo={link.url ? () => goToLink(link.url!) : undefined}
                    onSelect={() => setSelectedLink(link)}
                    animationDelay={animationDelay}
                    description={link.description}
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
          offsetTop={96}
        />
      )}
    </div>
  );
};

export default Forms;
