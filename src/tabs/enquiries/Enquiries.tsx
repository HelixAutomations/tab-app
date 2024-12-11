// src/tabs/enquiries/Enquiries.tsx

import React, { useState, useMemo, useCallback } from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  MessageBar,
  MessageBarType,
  Link,
  IconButton,
  Spinner,
  SpinnerSize,
  PrimaryButton,
  DefaultButton,
  Modal,
  Icon,
  Dropdown,
  IDropdownOption,
  SearchBox,
} from '@fluentui/react';
import { Enquiry, UserData } from '../../app/functionality/types'; // Correct path
import { initializeIcons } from '@fluentui/react/lib/Icons';
import CustomPagination from '../../app/styles/CustomPagination'; // Import Custom Pagination
import EnquiryCard from './EnquiryCard'; // Import the newly created EnquiryCard
import EnquiryOverview from './EnquiryOverview'; // Import EnquiryOverview
import PitchBuilder from './PitchBuilder'; // Import PitchBuilder
import EnquiryDetails from './EnquiryDetails'; // Import EnquiryDetails
import { colours } from '../../app/styles/colours'; // Import the colours
import {
  sharedSearchBoxContainerStyle,
  sharedSearchBoxStyle,
  sharedDropdownContainerStyle,
  sharedDropdownStyles,
  sharedControlsContainerStyle,
} from '../../app/styles/FilterStyles'; // Import shared styles
import CustomTabs from '../../app/styles/CustomTabs'; // Import the shared CustomTabs component
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme
import { Pivot, PivotItem } from '@fluentui/react';
import { Context as TeamsContextType } from '@microsoft/teams-js';

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

// Define Rating Indicator Component
interface RatingIndicatorProps {
  rating: string;
  isDarkMode: boolean;
  onClick: () => void;
}

const RatingIndicator: React.FC<RatingIndicatorProps> = ({ rating, isDarkMode, onClick }) => {
  let backgroundColor: string;
  let iconName: string;

  switch (rating) {
    case 'Good':
      backgroundColor = colours.green;
      iconName = 'LikeSolid';
      break;
    case 'Neutral':
      backgroundColor = colours.greyText;
      iconName = 'Like';
      break;
    case 'Poor':
      backgroundColor = colours.red;
      iconName = 'DislikeSolid';
      break;
    default:
      backgroundColor = colours.cta;
      iconName = 'StatusCircleQuestionMark';
  }

  return (
    <div
      className={mergeStyles({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: backgroundColor,
        borderRadius: '50%',
        width: '36px',
        height: '36px',
        color: 'white',
        cursor: 'pointer',
        position: 'relative',
        transition: 'transform 0.2s',
        ':hover': {
          transform: 'scale(1.1)',
        },
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)', // Added subtle shadow
      })}
      onClick={onClick} // Make the rating bubble clickable
      title="Edit Rating"
      aria-label="Edit Rating"
    >
      <Icon iconName={iconName} />
    </div>
  );
};

// Define the Enquiries Component
const Enquiries: React.FC<{ context: TeamsContextType | null; enquiries: Enquiry[] | null; userData: UserData[] | null }> = ({ context, enquiries, userData }) => {
  const [localEnquiries, setLocalEnquiries] = useState<Enquiry[]>(enquiries || []); // Use the enquiries prop here
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterMethod, setFilterMethod] = useState<string>('All');
  const [filterArea, setFilterArea] = useState<string>('All'); // New state for Area of Work filter
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [enquiriesPerPage] = useState<number>(12); // 12 per page
  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false);
  const [currentRating, setCurrentRating] = useState<string>(''); // Changed to string
  const [ratingEnquiryId, setRatingEnquiryId] = useState<string | null>(null);
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false); // For success messages
  const [showAll, setShowAll] = useState<boolean>(false); // New state for toggling visibility
  const [activeMainTab, setActiveMainTab] = useState<string>('Claimed'); // State for active main tab
  const [activeSubTab, setActiveSubTab] = useState<string>('Overview'); // State for active sub-tab

  // Define the main tabs
  const mainTabs = [
    { key: 'Claimed', text: 'Claimed' },
    { key: 'Converted', text: 'Converted' },
    { key: 'Claimable', text: 'Claimable' },
    { key: 'Triaged', text: 'Triaged' },
  ];

  // Define the sub-tabs within the detailed view
  const subTabs = [
    { key: 'Overview', text: 'Overview' },
    { key: 'Pitch', text: 'Pitch' },
    { key: 'Details', text: 'Details' },
  ];

  // Define Area of Work options
  const [areaOfWorkOptions, setAreaOfWorkOptions] = useState<IDropdownOption[]>([
    { key: 'All', text: 'All Areas' }, // Default option
  ]);

  // Define contact method options
  const [contactMethodOptions, setContactMethodOptions] = useState<IDropdownOption[]>([
    { key: 'All', text: 'All Methods' }, // Default option
  ]);

  // Handler for main tab change
  const handleMainTabChange = useCallback(
    (item?: PivotItem, ev?: React.MouseEvent<HTMLElement>) => {
      if (item) {
        setActiveMainTab(item.props.itemKey as string);
        setCurrentPage(1); // Reset to the first page when main tab changes
      }
    },
    []
  );

  // Handler for sub-tab change
  const handleSubTabChange = useCallback(
    (item?: PivotItem, ev?: React.MouseEvent<HTMLElement>) => {
      if (item) {
        setActiveSubTab(item.props.itemKey as string);
      }
    },
    []
  );

  // Toggle "Show All" and reset pagination
  const handleShowAllToggle = useCallback(() => {
    setShowAll((prev) => !prev); // Toggle the "Show All" state
    setCurrentPage(1); // Reset to the first page
  }, []);

  // Handler to select an enquiry and reset sub-tab to "Overview"
  const handleSelectEnquiry = useCallback((enquiry: Enquiry) => {
    setSelectedEnquiry(enquiry);
    setActiveSubTab('Overview'); // Reset sub-tab to "Overview"
  }, []);

  // Handler to go back to the list
  const handleBackToList = useCallback(() => {
    setSelectedEnquiry(null);
  }, []);

  // Handler for opening the rating modal
  const handleRate = useCallback((id: string) => {
    setRatingEnquiryId(id);
    setCurrentRating('');
    setIsRateModalOpen(true);
  }, []);

  // Handler for editing rating (API call)
  const handleEditRating = useCallback(
    async (id: string, newRating: string): Promise<void> => {
      try {
        console.log(`Updating rating for Enquiry ID: ${id} to ${newRating}`);
        const response = await fetch(
          `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_UPDATE_RATING_PATH}?code=${process.env.REACT_APP_UPDATE_RATING_CODE}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ID: id,
              Rating: newRating,
            }),
          }
        );

        if (response.ok) {
          // Update the enquiry with the new rating in the local state
          setLocalEnquiries((prevEnquiries) =>
            prevEnquiries.map((enquiry) =>
              enquiry.ID === id ? { ...enquiry, Rating: newRating as Enquiry['Rating'] } : enquiry
            )
          );
          setIsSuccessVisible(true); // Show success message
          console.log('Rating updated successfully');
        } else {
          const errorText = await response.text();
          console.error('Failed to update rating:', errorText);
        }
      } catch (error) {
        console.error('Error updating rating:', error);
      }
    },
    []
  );

  // Close Rate Modal function
  const closeRateModal = useCallback(() => {
    setIsRateModalOpen(false);
    setRatingEnquiryId(null);
    setCurrentRating('');
  }, []);

  // Submit Rating Function
  const submitRating = useCallback(async () => {
    if (ratingEnquiryId && currentRating) {
      await handleEditRating(ratingEnquiryId, currentRating);
      setIsSuccessVisible(true); // Show success message
      closeRateModal();
    }
  }, [ratingEnquiryId, currentRating, handleEditRating, closeRateModal]);

  // Search and filter enquiries
  const filteredEnquiries = useMemo(() => {
    let filtered = localEnquiries || [];

    // Apply main tab-specific filters
    switch (activeMainTab) {
      case 'Claimed':
        // If 'Show All' is not enabled, filter enquiries to show only those of the logged-in user
        if (!showAll && context && context.userPrincipalName) {
          const userEmail = context.userPrincipalName.toLowerCase();
          filtered = filtered.filter(
            (enquiry) => enquiry.Point_of_Contact?.toLowerCase() === userEmail
          );
        }
        break;

      case 'Converted':
        // Filter enquiries that have 'PoID' or 'Client' tags
        filtered = filtered.filter(
          (enquiry) =>
            enquiry.Tags?.includes('PoID') || enquiry.Tags?.includes('Client')
        );
        // 'Show All' applies here as well
        if (!showAll && context && context.userPrincipalName) {
          const userEmail = context.userPrincipalName.toLowerCase();
          filtered = filtered.filter(
            (enquiry) => enquiry.Point_of_Contact?.toLowerCase() === userEmail
          );
        }
        break;

      case 'Claimable':
        // Filter enquiries where Point_of_Contact is 'team@helix-law.com'
        filtered = filtered.filter(
          (enquiry) => enquiry.Point_of_Contact?.toLowerCase() === 'team@helix-law.com'
        );
        break;

      case 'Triaged':
        // Similarly, filter based on Point_of_Contact; refine criteria as needed
        filtered = filtered.filter(
          (enquiry) => enquiry.Point_of_Contact?.toLowerCase() === 'team@helix-law.com'
          // Add more conditions here as you narrow down the 'Triaged' criteria
        );
        break;

      default:
        break;
    }

    // Further filter by contact method
    if (filterMethod !== 'All') {
      filtered = filtered.filter((enquiry) => enquiry.Method_of_Contact === filterMethod);
    }

    // Further filter by area of work
    if (filterArea !== 'All') {
      filtered = filtered.filter((enquiry) => enquiry.Area_of_Work === filterArea);
    }

    // Search filter
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (enquiry) =>
          `${enquiry.First_Name} ${enquiry.Last_Name}`.toLowerCase().includes(lowerSearchTerm) ||
          enquiry.Email?.toLowerCase().includes(lowerSearchTerm) ||
          (enquiry.Company && enquiry.Company.toLowerCase().includes(lowerSearchTerm))
      );
    }

    return filtered;
  }, [localEnquiries, activeMainTab, showAll, context, filterMethod, searchTerm, filterArea]);

  // Pagination calculations
  const indexOfLastEnquiry = currentPage * enquiriesPerPage;
  const indexOfFirstEnquiry = indexOfLastEnquiry - enquiriesPerPage;
  const currentEnquiries = useMemo(() => {
    return filteredEnquiries.slice(indexOfFirstEnquiry, indexOfLastEnquiry);
  }, [filteredEnquiries, indexOfFirstEnquiry, indexOfLastEnquiry]);

  const totalPages = Math.ceil(filteredEnquiries.length / enquiriesPerPage);

  // Handler for page change
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

  // Define rating options with descriptions
  const ratingOptions = [
    {
      key: 'Good',
      text: 'Good',
      description:
        'Might instruct us, relevant to our work. Interesting contact and/or matter, likely to lead somewhere short or long term.',
    },
    {
      key: 'Neutral',
      text: 'Neutral',
      description:
        'Ok enquiry, matter or person/prospect possibly of interest but not an ideal fit. Uncertain will instruct us.',
    },
    {
      key: 'Poor',
      text: 'Poor',
      description:
        'Poor quality enquiry. Very unlikely to ever instruct us. Prospect or matter not a good fit. Time waster or irrelevant issue.',
    },
  ];

  // Render Rating Modal with Custom Radio Buttons
  const renderRatingOptions = useCallback(() => {
    return (
      <Stack tokens={{ childrenGap: 15 }}>
        {ratingOptions.map((option) => (
          <Stack key={option.key} tokens={{ childrenGap: 5 }}>
            <label htmlFor={`radio-${option.key}`} style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="radio"
                id={`radio-${option.key}`}
                name="rating"
                value={option.key}
                checked={currentRating === option.key}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentRating(e.target.value)}
                style={{ marginRight: '12px', width: '18px', height: '18px' }}
              />
              <Text
                variant="medium"
                styles={{
                  root: {
                    fontWeight: '700',
                    color: colours.highlight,
                  },
                }}
              >
                {option.text}
              </Text>
            </label>
            <Text
              variant="small"
              styles={{
                root: {
                  marginLeft: '30px',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
            >
              {option.description}
            </Text>
          </Stack>
        ))}
      </Stack>
    );
  }, [currentRating, isDarkMode, ratingOptions]);

  // Handler to update enquiry details
  const handleUpdateEnquiry = useCallback(
    (updatedEnquiry: Enquiry) => {
      setLocalEnquiries((prevEnquiries: Enquiry[]) =>
        prevEnquiries.map((enquiry: Enquiry) =>
          enquiry.ID === updatedEnquiry.ID ? updatedEnquiry : enquiry
        )
      );
    },
    []
  );

  // Render Detail View with Enhanced Design and Sub-Tabs
  const renderDetailView = useCallback(
    (enquiry: Enquiry) => (
      <Stack
        tokens={{ childrenGap: 20 }}
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
        {/* Header with Back Button */}
        <Stack
          horizontal
          horizontalAlign="space-between"
          verticalAlign="center"
          className={mergeStyles({ marginBottom: '20px' })}
        >
          <IconButton
            iconProps={{ iconName: 'Back' }}
            title="Back to Enquiries"
            ariaLabel="Back to Enquiries"
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

        {/* Sub-tabs for "Overview," "Pitch," and "Details" */}
        <Pivot
          selectedKey={activeSubTab}
          onLinkClick={handleSubTabChange}
          styles={{
            root: {
              marginBottom: '20px',
              borderBottom: 'none', // Remove the bottom border
            },
            link: {
              fontSize: '16px',
              fontWeight: '600',
              padding: '10px',
              margin: '0 5px',
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
            linkIsSelected: {
              borderBottom: 'none', // Remove the underline from the selected tab
            },
          }}
          aria-label="Enquiry Detail Sub-Tabs"
        >
          <PivotItem headerText="Overview" itemKey="Overview">
            <EnquiryOverview
              enquiry={enquiry}
              onEditRating={handleRate}
              onEditNotes={() => { /* Implement as needed */ }}
            />
          </PivotItem>
          <PivotItem headerText="Pitch" itemKey="Pitch">
            <PitchBuilder enquiry={enquiry} />
          </PivotItem>
          <PivotItem headerText="Details" itemKey="Details">
            <EnquiryDetails
              enquiry={enquiry}
              onUpdate={handleUpdateEnquiry}
            />
          </PivotItem>
        </Pivot>
      </Stack>
    ),
    [handleBackToList, handleSubTabChange, handleRate, isDarkMode, handleUpdateEnquiry, activeSubTab]
  );

  // Calculate animation delays based on row and column
  const calculateAnimationDelay = (row: number, col: number) => {
    const delayPerRow = 0.2; // 0.2 seconds delay between rows
    const delayPerCol = 0.1; // 0.1 seconds delay between columns
    return row * delayPerRow + col * delayPerCol;
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Header: Search and Filter Controls */}
      <div className={mergeStyles({ paddingTop: '0px', paddingBottom: '20px' })}>
        <div
          className={mergeStyles({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '15px',
            flexWrap: 'wrap',
          })}
        >
          {/* Search Box and Filters */}
          <div className={sharedControlsContainerStyle}>

            {/* Search Box */}
            <div className={sharedSearchBoxContainerStyle(isDarkMode)}>
              <SearchBox
                placeholder="Search enquiries..."
                value={searchTerm}
                onChange={(_, newValue) => setSearchTerm(newValue || '')}
                styles={sharedSearchBoxStyle(isDarkMode)}
                aria-label="Search enquiries"
              />
            </div>

            {/* Area of Work Dropdown */}
            <div className={sharedDropdownContainerStyle(isDarkMode)}>
              <Dropdown
                placeholder="Select Area of Work"
                selectedKey={filterArea}
                onChange={(event, option) => setFilterArea(option?.key as string)}
                options={areaOfWorkOptions} // Uses dynamic state
                styles={sharedDropdownStyles(isDarkMode)}
                ariaLabel="Filter by Area of Work"
              />
            </div>

            {/* Contact Method Dropdown */}
            <div className={sharedDropdownContainerStyle(isDarkMode)}>
              <Dropdown
                placeholder="Select Contact Method"
                selectedKey={filterMethod}
                onChange={(event, option) => setFilterMethod(option?.key as string)}
                options={contactMethodOptions} // Uses dynamic state
                styles={sharedDropdownStyles(isDarkMode)}
                ariaLabel="Filter by Contact Method"
              />
            </div>

            {/* Conditionally render Show All Toggle */}
            {(activeMainTab === 'Claimed' || activeMainTab === 'Converted') && (
              <DefaultButton
                text={showAll ? 'Show My Enquiries' : 'Show All Enquiries'}
                onClick={handleShowAllToggle}
                styles={{
                  root: {
                    backgroundColor: isDarkMode ? colours.dark.buttonBackground : colours.light.buttonBackground,
                    color: isDarkMode ? colours.dark.buttonText : colours.light.buttonText,
                    borderRadius: '8px',
                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    selectors: {
                      ':hover': {
                        backgroundColor: isDarkMode ? colours.dark.hoverBackground : colours.light.hoverBackground,
                      },
                    },
                  },
                }}
                aria-label="Toggle Display Enquiries"
              />
            )}
          </div>

          {/* Dark Mode Toggle */}
          {/* Removed the local dark mode toggle */}
        </div>

        {/* Main Inner Tabs for Enquiry Categories */}
        {!selectedEnquiry && (
          <div className={mergeStyles({ marginTop: '30px' })}>
            <CustomTabs
              selectedKey={activeMainTab}
              onLinkClick={handleMainTabChange}
              tabs={mainTabs}
              ariaLabel="Enquiries Main Tabs"
            />
          </div>
        )}
      </div>

      {/* Main Content */}
      <div
        className={mergeStyles({
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          paddingBottom: '40px',
          backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.background,
          transition: 'background-color 0.3s',
        })}
      >
        {selectedEnquiry ? (
          renderDetailView(selectedEnquiry)
        ) : (
          <>
            {/* Enquiries Grid */}
            {filteredEnquiries.length === 0 ? (
              <Text variant="medium" styles={{ root: { color: isDarkMode ? colours.dark.subText : colours.light.subText } }}>
                No enquiries found matching your criteria.
              </Text>
            ) : (
              <>
                <div
                  className={mergeStyles({
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)', // Enforce 4 columns by default
                    gap: '20px',
                    // Responsive adjustments
                    '@media (max-width: 1200px)': {
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', // Responsive for smaller screens
                    },
                  })}
                >
                  {currentEnquiries.map((enquiry, index) => {
                    // Calculate row and column based on index
                    const row = Math.floor(index / 4); // 4 columns per row
                    const col = index % 4;

                    const animationDelay = calculateAnimationDelay(row, col);

                    return (
                      <EnquiryCard
                        key={enquiry.ID}
                        enquiry={enquiry}
                        onSelect={handleSelectEnquiry}
                        onRate={handleRate}
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
      </div>

      {/* Footer */}
      <div className={footerStyle(isDarkMode)}>
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
          Rating submitted successfully!
        </MessageBar>
      )}

      {/* Rating Modal */}
      <Modal
        isOpen={isRateModalOpen}
        onDismiss={closeRateModal}
        isBlocking={false}
        containerClassName={mergeStyles({
          maxWidth: 600,
          padding: '30px',
          borderRadius: '12px',
          backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
          color: isDarkMode ? colours.dark.text : colours.light.text,
        })}
        styles={{
          main: {
            maxWidth: '600px',
            margin: 'auto',
          },
        }}
        aria-labelledby="rate-enquiry-modal"
      >
        <Stack tokens={{ childrenGap: 20 }}>
          <Text variant="xxLarge" styles={{ root: { fontWeight: '700', color: isDarkMode ? colours.dark.text : colours.light.text } }}>
            Rate Enquiry
          </Text>
          <Text variant="medium" styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text } }}>
            Please select a rating for this enquiry:
          </Text>
          {/* Custom Radio Buttons */}
          {renderRatingOptions()}
          <Stack horizontal tokens={{ childrenGap: 15 }} horizontalAlign="end">
            <PrimaryButton text="Submit" onClick={submitRating} disabled={!currentRating} />
            <DefaultButton text="Cancel" onClick={closeRateModal} />
          </Stack>
        </Stack>
      </Modal>
    </div>
  );
};

export default Enquiries;
