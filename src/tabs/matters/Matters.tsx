// src/Matters.tsx

import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  MessageBar,
  MessageBarType,
  TooltipHost,
  Link,
  IconButton,
  Spinner,
  SpinnerSize,
  TextField,
  Dropdown,
  IDropdownOption,
  PrimaryButton,
  DefaultButton,
  Modal,
  Icon,
} from '@fluentui/react';
import { TeamsContext } from '../../app/functionality/TeamsContext'; // Updated import
import { useFeContext, Matter } from '../../app/functionality/FeContext';
import { initializeIcons } from '@fluentui/react/lib/Icons';
import CustomPagination from '../../app/styles/CustomPagination';
import MatterCard from './MatterCard';
import { colours } from '../../app/styles/colours';
import { sharedSearchBoxContainerStyle, sharedSearchBoxStyle, sharedDropdownContainerStyle, sharedDropdownStyles } from '../../app/styles/sharedStyles';
import { SearchBox } from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme

initializeIcons();

// Styles (unchanged)
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

const searchBoxStyle = mergeStyles({
  maxWidth: '300px',
});

const dropdownStyle = mergeStyles({
  width: '200px',
});

const mainContentStyle = (isDarkMode: boolean) =>
  mergeStyles({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    paddingBottom: '40px',
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
    fontSize: '14px',
    fontFamily: 'Raleway, sans-serif',
  });

// Define action button styles
const actionButtonStyle = {
  root: {
    marginRight: '8px',
  },
};

// Define the Matters Component
const Matters: React.FC = () => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context
  const { context } = useContext(TeamsContext); // Updated import
  const { sqlData, fetchMatters, isLoading, error, fetchMattersError } = useFeContext();
  const [matters, setMatters] = useState<Matter[]>([]);
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterRole, setFilterRole] = useState<string>('All'); // 'All', 'Responsible', 'Originating'
  const [filterStatus, setFilterStatus] = useState<string>('All'); // 'All', 'Open', 'Closed', 'Pending'
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [mattersPerPage] = useState<number>(16); // Changed to 16 for better spacing
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false); // For success messages

  // Fetch matters on component mount or when sqlData changes
  useEffect(() => {
    const fetchData = async () => {
      if (sqlData && sqlData.length > 0 && sqlData[0]["Full Name"]) {
        const fullName = sqlData[0]["Full Name"].trim();
        console.log('Attempting to fetch matters for:', fullName); // Logging
        try {
          const data = await fetchMatters(fullName);
          console.log('Fetched Matters Data:', data); // Logging
          setMatters(data);
        } catch (err) {
          console.error('Error fetching matters:', err);
        }
      } else {
        console.warn('SQL data or Full Name is missing.');
      }
    };

    fetchData();
  }, [sqlData, fetchMatters]);

  // Handler to select a matter
  const handleSelectMatter = useCallback((matter: Matter) => {
    setSelectedMatter(matter);
  }, []);

  // Handler to go back to the list
  const handleBackToList = useCallback(() => {
    setSelectedMatter(null);
  }, []);

  // Search and filter matters
  const filteredMatters = useMemo(() => {
    let filtered = matters;

    // Filter by role (Responsible, Originating)
    if (filterRole !== 'All') {
      if (filterRole === 'Responsible') {
        filtered = filtered.filter(
          (matter) =>
            matter["Responsible Solicitor"].toLowerCase() === (sqlData && sqlData[0]["Full Name"]?.toLowerCase())
        );
      } else if (filterRole === 'Originating') {
        filtered = filtered.filter(
          (matter) =>
            matter["Originating Solicitor"].toLowerCase() === (sqlData && sqlData[0]["Full Name"]?.toLowerCase())
        );
      }
    }

    // Filter by status
    if (filterStatus !== 'All') {
      filtered = filtered.filter((matter) => matter.Status === filterStatus);
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (matter) =>
          matter["Client Name"].toLowerCase().includes(searchTerm.toLowerCase()) ||
          matter["Client ID"].toLowerCase().includes(searchTerm.toLowerCase()) ||
          matter["Practice Area"].toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return filtered;
  }, [matters, searchTerm, filterRole, filterStatus, sqlData]);

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
            position: 'relative', // For positioning the sidebar
          },
        }}
      >
        {/* Back Button */}
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

        {/* Matter Details */}
        <Text variant="xxLarge" styles={{ root: { fontWeight: 'bold' } }}>
          Matter Details
        </Text>
        <Stack tokens={{ childrenGap: 8 }}>
          {/* Display Number */}
          <Stack tokens={{ childrenGap: 4 }}>
            <Text variant="small" styles={{ root: { color: colours.highlight, fontWeight: 'semibold' } }}>
              Display Number
            </Text>
            <Text variant="small" styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text } }}>
              {matter["Display Number"]}
            </Text>
          </Stack>

          {/* Open Date */}
          <Stack tokens={{ childrenGap: 4 }}>
            <Text variant="small" styles={{ root: { color: colours.highlight, fontWeight: 'semibold' } }}>
              Open Date
            </Text>
            <Text variant="small" styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text } }}>
              {new Date(matter["Open Date"]).toLocaleDateString()}
            </Text>
          </Stack>

          {/* Practice Area */}
          <Stack tokens={{ childrenGap: 4 }}>
            <Text variant="small" styles={{ root: { color: colours.highlight, fontWeight: 'semibold' } }}>
              Practice Area
            </Text>
            <Text variant="small" styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text } }}>
              {matter["Practice Area"]}
            </Text>
          </Stack>

          {/* Client Name */}
          <Stack tokens={{ childrenGap: 4 }}>
            <Text variant="small" styles={{ root: { color: colours.highlight, fontWeight: 'semibold' } }}>
              Client Name
            </Text>
            <Text variant="small" styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text } }}>
              {matter["Client Name"]}
            </Text>
          </Stack>

          {/* Description */}
          <Stack tokens={{ childrenGap: 4 }}>
            <Text variant="small" styles={{ root: { color: colours.highlight, fontWeight: 'semibold' } }}>
              Description
            </Text>
            <Text variant="small" styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text } }}>
              {matter.Description}
            </Text>
          </Stack>

          {/* Approx. Value */}
          <Stack tokens={{ childrenGap: 4 }}>
            <Text variant="small" styles={{ root: { color: colours.highlight, fontWeight: 'semibold' } }}>
              Approx. Value
            </Text>
            <Text variant="small" styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text } }}>
              {matter["Approx. Value"]}
            </Text>
          </Stack>
        </Stack>

        {/* Action Buttons */}
        <Stack horizontal tokens={{ childrenGap: 10 }} styles={{ root: { marginTop: '20px' } }}>
          <PrimaryButton
            text="Call Client"
            iconProps={{ iconName: 'Phone' }}
            onClick={() => window.location.href = `tel:${matter["Client Phone"]}`}
            styles={actionButtonStyle}
          />
          <PrimaryButton
            text="Email Client"
            iconProps={{ iconName: 'Mail' }}
            onClick={() => window.location.href = `mailto:${matter["Client Email"]}`}
            styles={actionButtonStyle}
          />
        </Stack>
      </Stack>
    ),
    [handleBackToList, isDarkMode]
  );

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Header: Search and Filter Controls */}
      <div className={headerStyle(isDarkMode)}>
        {/* Left Side: Search and Filter */}
        <div className={controlsContainerStyle}>
          {/* Search Bar */}
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
              onChange={(e, option) => setFilterRole(option?.key as string)}
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
              onChange={(e, option) => setFilterStatus(option?.key as string)}
              styles={sharedDropdownStyles(isDarkMode)}
              ariaLabel="Filter Matters by Status"
            />
          </div>
        </div>

        {/* Right Side: Dark Mode Toggle */}
        {/* Removed the local dark mode toggle */}
      </div>

      {/* Main Content */}
      <div className={mainContentStyle(isDarkMode)}>
        {isLoading ? (
          <Spinner label="Loading matters..." size={SpinnerSize.medium} ariaLive="assertive" />
        ) : error ? (
          <MessageBar messageBarType={MessageBarType.error} isMultiline={false}>
            {error}
          </MessageBar>
        ) : fetchMattersError ? (
          <MessageBar messageBarType={MessageBarType.error} isMultiline={false}>
            {fetchMattersError}
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
                    gridTemplateColumns: 'repeat(4, 1fr)', // Changed to 4 columns
                    gap: '20px',
                    // Responsive adjustments
                    '@media (max-width: 1200px)': {
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', // Responsive for smaller screens
                    },
                    '@media (max-width: 900px)': {
                      gridTemplateColumns: 'repeat(1, 1fr)', // 1 column for small screens
                    },
                  })}
                >
                  {currentMatters.map((matter) => (
                    <MatterCard
                      key={matter["Unique ID"]}
                      matter={matter}
                      onSelect={handleSelectMatter}
                    />
                  ))}
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
      </div>

      {/* Footer */}
      <div className={footerStyle(isDarkMode)}>
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
      </div>

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
