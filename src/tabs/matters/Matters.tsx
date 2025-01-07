// src/tabs/matters/Matters.tsx

import React, { useState, useMemo, useCallback } from 'react';
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
import { 
  sharedSearchBoxContainerStyle,
  sharedSearchBoxStyle,
  sharedDropdownContainerStyle,
  sharedDropdownStyles,
  sharedControlsContainerStyle,
} from '../../app/styles/FilterStyles';
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
  const [currentPage, setCurrentPage] = useState<number>(1);
  const mattersPerPage = 16;
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);

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

  // Pagination calculations
  const indexOfLastMatter = currentPage * mattersPerPage;
  const indexOfFirstMatter = indexOfLastMatter - mattersPerPage;
  const currentMatters = useMemo(() => {
    return filteredMatters.slice(indexOfFirstMatter, indexOfLastMatter);
  }, [filteredMatters, indexOfFirstMatter, indexOfLastMatter]);

  const totalPages = Math.ceil(filteredMatters.length / mattersPerPage);

  // Handler for page change
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

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

  // Handler to select a matter
  const handleSelectMatter = useCallback((matter: Matter) => {
    setSelectedMatter(matter);
  }, []);

  // Handler to go back to the list
  const handleBackToList = useCallback(() => {
    setSelectedMatter(null);
  }, []);

  // Render Detail View
  const renderDetailView = useCallback(
    (matter: Matter) => (
      <Stack
        tokens={{ childrenGap: 15 }}
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
                ':hover': {
                  backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
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

  // Calculate animation delays based on index
  const calculateAnimationDelay = (index: number) => {
    const row = Math.floor(index / 5); // Assuming 5 columns per row
    const col = index % 5;
    return row * 0.2 + col * 0.1; // Adjust delays as needed
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Header: Search and Filter Controls */}
      <div className={headerStyle(isDarkMode)}>
        <div className={sharedControlsContainerStyle}>
          {/* Search Box */}
          <div className={sharedSearchBoxContainerStyle(isDarkMode)}>
            <SearchBox
              placeholder="Search matters..."
              value={searchTerm}
              onChange={(e, newValue) => setSearchTerm(newValue || '')}
              styles={sharedSearchBoxStyle(isDarkMode)}
              aria-label="Search Matters"
            />
          </div>

          {/* Role Filter Dropdown */}
          <div className={sharedDropdownContainerStyle(isDarkMode)}>
            <Dropdown
              placeholder="Filter by Role"
              options={roleOptions}
              selectedKey={filterRole}
              onChange={(event, option) => setFilterRole(option?.key as string)}
              styles={sharedDropdownStyles(isDarkMode)}
              ariaLabel="Filter Matters by Role"
            />
          </div>

          {/* Status Filter Dropdown */}
          <div className={sharedDropdownContainerStyle(isDarkMode)}>
            <Dropdown
              placeholder="Filter by Status"
              options={statusOptions}
              selectedKey={filterStatus}
              onChange={(event, option) => setFilterStatus(option?.key as string)}
              styles={sharedDropdownStyles(isDarkMode)}
              ariaLabel="Filter Matters by Status"
            />
          </div>
        </div>

        {/* Right Side: Dark Mode Toggle */}
        {/* Removed the local dark mode toggle */}
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
            {/* Matters Grid */}
            {filteredMatters.length === 0 ? (
              <Text variant="medium" styles={{ root: { color: isDarkMode ? colours.dark.subText : colours.light.subText } }}>
                No matters found matching your criteria.
              </Text>
            ) : (
              <>
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
                  {currentMatters.map((matter, index) => {
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

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <CustomPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                  />
                )}
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
            aria-label="Helix Law Website"
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
