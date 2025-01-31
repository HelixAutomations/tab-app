// src/tabs/matters/Matters.tsx

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  MessageBar,
  MessageBarType,
  IconButton,
  Spinner,
  SpinnerSize,
  Dropdown,
  IDropdownOption,
  PrimaryButton,
  Link,
  SearchBox,
} from '@fluentui/react';
import { Matter, UserData } from '../../app/functionality/types';
import { initializeIcons } from '@fluentui/react/lib/Icons';
import CustomPagination from '../../app/styles/CustomPagination';
import MatterCard from './MatterCard';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';

initializeIcons();

// Styles
const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    maxWidth: '100%',
    minHeight: '100vh',
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    display: 'flex',
    flexDirection: 'column',
    transition: 'background-color 0.3s',
    fontFamily: 'Raleway, sans-serif',
  });

const headerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    paddingTop: '0px',
    paddingBottom: '20px',
  });

const mainContentStyle = (isDarkMode: boolean) =>
  mergeStyles({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    paddingBottom: '40px',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.background,
    transition: 'background-color 0.3s',
  });

const footerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.border,
    borderRadius: '8px',
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '14px',
    fontFamily: 'Raleway, sans-serif',
  });

// Define action button styles
const actionButtonStyle = {
  root: {
    marginRight: '8px',
    backgroundColor: colours.cta, // CTA red color
    borderRadius: '8px',
    transition: 'background-color 0.3s, transform 0.3s',
    selectors: {
      ':hover': {
        backgroundColor: colours.red, // Darker red on hover
        transform: 'scale(1.05)',
      },
    },
  },
  label: {
    color: 'white',
    fontWeight: '600',
  },
};

// Define the Matters Component
interface MattersProps {
  matters: Matter[];
  isLoading: boolean;
  error: string | null;
  userData: UserData[] | null;
  fetchMatters: (fullName: string) => Promise<Matter[]>;
}

const Matters: React.FC<MattersProps> = ({ matters, isLoading, error, userData, fetchMatters }) => {
  console.log('Matters Props:', { matters, isLoading, error, userData }); // Debugging

  const { isDarkMode } = useTheme();
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);

  // Added for infinite scroll
  const [itemsToShow, setItemsToShow] = useState<number>(20);
  const loader = useRef<HTMLDivElement | null>(null);

  // Search and filter matters
  const filteredMatters = useMemo(() => {
    let filtered = matters;

    // Filter by role
    if (filterRole !== 'All') {
      if (filterRole === 'Responsible') {
        const fullName = userData && `${userData[0].First} ${userData[0].Last}`.toLowerCase();
        filtered = filtered.filter(
          (matter) =>
            matter.ResponsibleSolicitor?.toLowerCase() === fullName
        );
      } else if (filterRole === 'Originating') {
        const fullName = userData && `${userData[0].First} ${userData[0].Last}`.toLowerCase();
        filtered = filtered.filter(
          (matter) =>
            matter.OriginatingSolicitor?.toLowerCase() === fullName
        );
      }
    }

    // Filter by status
    if (filterStatus !== 'All') {
      filtered = filtered.filter((matter) => matter.Status === filterStatus);
    }

    // Search filter
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (matter) =>
          matter.ClientName?.toLowerCase().includes(lowerSearchTerm) ||
          matter.ClientID?.toLowerCase().includes(lowerSearchTerm) ||
          matter.PracticeArea?.toLowerCase().includes(lowerSearchTerm)
      );
    }

    return filtered;
  }, [matters, searchTerm, filterRole, filterStatus, userData]);

  // Infinite scroll calculations
  const displayedMatters = useMemo(() => {
    return filteredMatters.slice(0, itemsToShow);
  }, [filteredMatters, itemsToShow]);

  const handleLoadMore = useCallback(() => {
    setItemsToShow((prev) => Math.min(prev + 20, filteredMatters.length));
  }, [filteredMatters.length]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      {
        root: null,
        rootMargin: '200px', // Increased margin to trigger earlier
        threshold: 0.1, // Trigger as soon as the loader is slightly visible
      }
    );

    // Delay observer setup slightly to allow state updates
    const timeoutId = setTimeout(() => {
      if (loader.current) {
        observer.observe(loader.current);
      }
    }, 100); // Small delay ensures `filteredMatters` is set before attaching

    return () => {
      clearTimeout(timeoutId);
      if (loader.current) {
        observer.unobserve(loader.current);
      }
    };
  }, [filteredMatters, handleLoadMore]);

  // Handler to select a matter
  const handleSelectMatter = useCallback((matter: Matter) => {
    setSelectedMatter(matter);
  }, []);

  // Handler to go back to the list
  const handleBackToList = useCallback(() => {
    setSelectedMatter(null);
  }, []);

  // Define filter options for Role
  const roleOptions: IDropdownOption[] = [
    { key: 'All', text: 'All Roles' },
    { key: 'Responsible', text: 'Responsible Solicitor' },
    { key: 'Originating', text: 'Originating Solicitor' },
  ];

  // Define filter options for Status
  const statusOptions: IDropdownOption[] = [
    { key: 'All', text: 'All Statuses' },
    { key: 'Open', text: 'Open' },
    { key: 'Closed', text: 'Closed' },
    { key: 'Pending', text: 'Pending' },
    // Add more statuses as needed
  ];

  // Render Detail View
  const renderDetailView = useCallback(
    (matter: Matter) => (
      <Stack
        tokens={{ childrenGap: 20 }}
        styles={{
          root: {
            backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
            borderRadius: '12px',
            boxShadow: `0 4px 16px rgba(0,0,0,0.1)`,
            padding: '20px',
            position: 'relative',
          },
        }}
      >
        {/* Header with Back Button */}
        <Stack
          horizontal
          horizontalAlign="space-between"
          verticalAlign="center"
          className={mergeStyles({ marginBottom: '20px' })}
        >
          <IconButton
            iconProps={{ iconName: 'Back' }}
            title="Back to Matters"
            ariaLabel="Back to Matters"
            onClick={handleBackToList}
            styles={{
              root: {
                backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
                color: isDarkMode ? colours.dark.iconColor : colours.light.iconColor,
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                selectors: {
                  ':hover': {
                    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
                  },
                },
              },
            }}
          />
          {/* Placeholder for alignment */}
          <div style={{ width: '40px' }}></div>
        </Stack>

        {/* Display the 'Not ready yet' Message */}
        <Text
          variant="xxLarge"
          styles={{
            root: {
              fontWeight: 'bold',
              textAlign: 'center',
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
          }}
        >
          Not ready yet - working on it!
        </Text>
      </Stack>
    ),
    [handleBackToList, isDarkMode]
  );

  const calculateAnimationDelay = (index: number) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    return row * 0.2 + col * 0.1;
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Header: Search and Filter Controls */}
      <div className={headerStyle(isDarkMode)}>
        <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
          {/* Search Box */}
          <div
            className={mergeStyles({
              flexGrow: 1,
              marginRight: '12px',
            })}
          >
            <SearchBox
              placeholder="Search matters..."
              value={searchTerm}
              onChange={(e, newValue) => setSearchTerm(newValue || '')}
              styles={{
                root: {
                  width: '100%',
                  backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
                  borderColor: isDarkMode ? colours.dark.border : colours.light.border,
                  borderRadius: '4px',
                },
                field: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
              ariaLabel="Search Matters"
            />
          </div>

          {/* Role Filter Dropdown */}
          <div>
            <Dropdown
              placeholder="Filter by Role"
              options={roleOptions}
              selectedKey={filterRole}
              onChange={(event, option) => setFilterRole(option?.key as string)}
              styles={{
                root: {
                  width: 200,
                },
                dropdown: {
                  backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
                  borderColor: isDarkMode ? colours.dark.border : colours.light.border,
                },
                title: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
                caretDown: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
              ariaLabel="Filter Matters by Role"
            />
          </div>

          {/* Status Filter Dropdown */}
          <div>
            <Dropdown
              placeholder="Filter by Status"
              options={statusOptions}
              selectedKey={filterStatus}
              onChange={(event, option) => setFilterStatus(option?.key as string)}
              styles={{
                root: {
                  width: 200,
                },
                dropdown: {
                  backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
                  borderColor: isDarkMode ? colours.dark.border : colours.light.border,
                },
                title: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
                caretDown: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
              ariaLabel="Filter Matters by Status"
            />
          </div>
        </Stack>
      </div>

      {/* Main Content */}
      <main className={mainContentStyle(isDarkMode)}>
        {isLoading ? (
          <Spinner label="Loading matters..." size={SpinnerSize.medium} ariaLive="assertive" />
        ) : error ? (
          <MessageBar messageBarType={MessageBarType.error} isMultiline={false}>
            {error}
          </MessageBar>
        ) : selectedMatter ? (
          renderDetailView(selectedMatter)
        ) : (
          <>
            {filteredMatters.length === 0 ? (
              <Text
                variant="medium"
                styles={{
                  root: {
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    fontFamily: 'Raleway, sans-serif',
                  },
                }}
              >
                No matters found matching your criteria.
              </Text>
            ) : (
              <>
                {/* Matters Grid */}
                <div
                  className={mergeStyles({
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)', // 4 cards per row
                    gap: '20px',
                    // Responsive adjustments
                    '@media (max-width: 1200px)': {
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    },
                    '@media (max-width: 900px)': {
                      gridTemplateColumns: 'repeat(1, 1fr)',
                    },
                  })}
                >
                  {displayedMatters.map((matter, index) => {
                    const animationDelay = calculateAnimationDelay(index);
                    return (
                      <MatterCard
                        key={matter.UniqueID}
                        matter={matter}
                        onSelect={handleSelectMatter}
                        animationDelay={animationDelay}
                      />
                    );
                  })}
                </div>
                {/* Loader for Infinite Scroll */}
                <div ref={loader} />
              </>
            )}
          </>
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
                color: colours.highlight,
                fontSize: '12px',
                fontFamily: 'Raleway, sans-serif',
              },
            }}
            ariaLabel="Helix Law Website"
          >
            https://helix-law.co.uk/
          </Link>
          {' | '}
          <Text variant="small" styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text, display: 'inline' } }}>
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

      {/* Success Message */}
      {isSuccessVisible && (
        <MessageBar
          messageBarType={MessageBarType.success}
          isMultiline={false}
          onDismiss={() => setIsSuccessVisible(false)}
          dismissButtonAriaLabel="Close"
          styles={{
            root: {
              position: 'fixed',
              bottom: 20,
              right: 20,
              maxWidth: '300px',
              zIndex: 1000,
              borderRadius: '4px',
              fontFamily: 'Raleway, sans-serif',
            },
          }}
        >
          Action completed successfully!
        </MessageBar>
      )}
    </div>
  );
};

export default Matters;
