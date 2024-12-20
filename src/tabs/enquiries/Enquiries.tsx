// src/tabs/enquiries/Enquiries.tsx

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  MessageBar,
  MessageBarType,
  Link,
  IconButton,
  PrimaryButton,
  DefaultButton,
  Modal,
  Icon,
  Dropdown,
  IDropdownOption,
  SearchBox,
} from '@fluentui/react';
import { Enquiry, UserData, POID } from '../../app/functionality/types';
import { initializeIcons } from '@fluentui/react/lib/Icons';
import CustomPagination from '../../app/styles/CustomPagination';
import EnquiryCard from './EnquiryCard';
import EnquiryOverview from './EnquiryOverview';
import PitchBuilder from './PitchBuilder';
import EnquiryDetails from './EnquiryDetails';
import { colours } from '../../app/styles/colours';
import {
  sharedSearchBoxContainerStyle,
  sharedSearchBoxStyle,
  sharedDropdownContainerStyle,
  sharedDropdownStyles,
  sharedControlsContainerStyle,
  sharedToggleButtonStyle,
} from '../../app/styles/FilterStyles';
import CustomTabs from '../../app/styles/CustomTabs';
import { useTheme } from '../../app/functionality/ThemeContext';
import { Pivot, PivotItem } from '@fluentui/react';
import { Context as TeamsContextType } from '@microsoft/teams-js';

initializeIcons();

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

const areaColor = (area: string) => {
  const normalizedArea = area.toLowerCase();
  switch (normalizedArea) {
    case 'commercial':
      return colours.blue;
    case 'construction':
      return colours.orange;
    case 'property':
      return colours.green;
    case 'employment':
      return colours.yellow;
    default:
      return colours.cta;
  }
};

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
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      })}
      onClick={onClick}
      title="Edit Rating"
      aria-label="Edit Rating"
    >
      <Icon iconName={iconName} />
    </div>
  );
};

const Enquiries: React.FC<{
  context: TeamsContextType | null;
  enquiries: Enquiry[] | null;
  userData: UserData[] | null;
  poidData: POID[] | null;
  setPoidData: React.Dispatch<React.SetStateAction<POID[] | null>>;
}> = ({ context, enquiries, userData, poidData, setPoidData }) => {
  const [localEnquiries, setLocalEnquiries] = useState<Enquiry[]>(enquiries || []);
  const { isDarkMode } = useTheme();
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterMethod, setFilterMethod] = useState<string>('All');
  const [filterArea, setFilterArea] = useState<string>('All');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const enquiriesPerPage = 12;
  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false);
  const [currentRating, setCurrentRating] = useState<string>('');
  const [ratingEnquiryId, setRatingEnquiryId] = useState<string | null>(null);
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [showAll, setShowAll] = useState<boolean>(false);
  const [activeMainTab, setActiveMainTab] = useState<string>('Claimed');
  const [activeSubTab, setActiveSubTab] = useState<string>('Overview');
  const [convertedEnquiriesList, setConvertedEnquiriesList] = useState<Enquiry[]>([]);
  const [convertedPoidDataList, setConvertedPoidDataList] = useState<POID[]>([]);
  const [currentSiloArea, setCurrentSiloArea] = useState<string | null>(null);

  const mainTabs = [
    { key: 'Claimed', text: 'Claimed' },
    { key: 'Converted', text: 'Enquiry ID' },
    { key: 'Claimable', text: 'Unclaimed' },
    { key: 'Triaged', text: 'Triaged' },
    { key: 'Silo', text: 'Silo' },
  ];

  const subTabs = [
    { key: 'Overview', text: 'Overview' },
    { key: 'Pitch', text: 'Pitch' },
    { key: 'Details', text: 'Details' },
  ];

  const [areaOfWorkOptions, setAreaOfWorkOptions] = useState<IDropdownOption[]>([
    { key: 'All', text: 'All Areas' },
  ]);

  const [contactMethodOptions, setContactMethodOptions] = useState<IDropdownOption[]>([
    { key: 'All', text: 'All Methods' },
  ]);

  const handleMainTabChange = useCallback(
    (item?: PivotItem, ev?: React.MouseEvent<HTMLElement>) => {
      if (item) {
        setActiveMainTab(item.props.itemKey as string);
        setCurrentPage(1);
        setSelectedEnquiry(null);
        setActiveSubTab('Overview');
        setCurrentSiloArea(null);
      }
    },
    []
  );

  const handleSubTabChange = useCallback(
    (item?: PivotItem, ev?: React.MouseEvent<HTMLElement>) => {
      if (item) {
        setActiveSubTab(item.props.itemKey as string);
      }
    },
    []
  );

  const handleShowAllToggle = useCallback(() => {
    setShowAll((prev) => {
      const newShowAll = !prev;
      return newShowAll;
    });
    setCurrentPage(1);
  }, []);

  const handleSelectEnquiry = useCallback((enquiry: Enquiry) => {
    setSelectedEnquiry(enquiry);
    setActiveSubTab('Overview');
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedEnquiry(null);
  }, []);

  const handleRate = useCallback((id: string) => {
    setRatingEnquiryId(id);
    setCurrentRating('');
    setIsRateModalOpen(true);
  }, []);

  const handleEditRating = useCallback(
    async (id: string, newRating: string): Promise<void> => {
      try {
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
          setLocalEnquiries((prevEnquiries) =>
            prevEnquiries.map((enquiry) =>
              enquiry.ID === id ? { ...enquiry, Rating: newRating as Enquiry['Rating'] } : enquiry
            )
          );
          setIsSuccessVisible(true);
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

  const closeRateModal = useCallback(() => {
    setIsRateModalOpen(false);
    setRatingEnquiryId(null);
    setCurrentRating('');
  }, []);

  const submitRating = useCallback(async () => {
    if (ratingEnquiryId && currentRating) {
      await handleEditRating(ratingEnquiryId, currentRating);
      setIsSuccessVisible(true);
      closeRateModal();
    }
  }, [ratingEnquiryId, currentRating, handleEditRating, closeRateModal]);

  const triagedPointOfContactEmails = useMemo(
    () =>
      [
        'automations@helix-law.com',
        'commercial@helix-law.com',
        'construction@helix-law.com',
        'employment@helix-law.com',
        'property@helix-law.com',
      ].map((email) => email.toLowerCase()),
    []
  );

  useEffect(() => {
    (async () => {
      if (!poidData) {
        try {
          const response = await fetch(
            `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_POID_PATH}?code=${process.env.REACT_APP_GET_POID_CODE}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dateFrom: '2024-11-01',
                dateTo: '2024-12-15',
              }),
            }
          );
          if (response.ok) {
            const data: POID[] = await response.json();
            setPoidData(data);
          } else {
            const errorText = await response.text();
            console.error('Failed to fetch POID data:', errorText);
          }
        } catch (error) {
          console.error('Error fetching POID data:', error);
        }
      }
    })();
  }, [poidData, setPoidData]);

  useEffect(() => {
    if (poidData && localEnquiries.length > 0) {
      const converted = localEnquiries.filter((enquiry) =>
        poidData.some((poid) => String(poid.acid) === enquiry.ID)
      );
      setConvertedEnquiriesList(converted);

      const convertedPoid = poidData.filter((poid) =>
        localEnquiries.some((enquiry) => enquiry.ID === String(poid.acid))
      );
      setConvertedPoidDataList(convertedPoid);
    }
  }, [poidData, localEnquiries]);

  const filteredEnquiries = useMemo(() => {
    let filtered: Enquiry[] = [];

    switch (activeMainTab) {
      case 'Claimed':
        filtered = localEnquiries;
        if (!showAll && context && context.userPrincipalName) {
          const userEmail = context.userPrincipalName.toLowerCase();
          filtered = filtered.filter(
            (enquiry) => enquiry.Point_of_Contact?.toLowerCase() === userEmail
          );
        }
        break;

      case 'Converted':
        // Now labeled as Enquiry ID
        if (showAll) {
          filtered = convertedEnquiriesList;
        } else if (context && context.userPrincipalName) {
          const userEmail = context.userPrincipalName.toLowerCase();
          const userFilteredEnquiryIds = convertedPoidDataList
            .filter((poid) => poid.poc?.toLowerCase() === userEmail)
            .map((poid) => String(poid.acid));
          filtered = convertedEnquiriesList.filter((enquiry) =>
            userFilteredEnquiryIds.includes(enquiry.ID)
          );
        } else {
          filtered = convertedEnquiriesList;
        }
        break;

      case 'Claimable':
        // Now labeled as Unclaimed
        filtered = localEnquiries.filter(
          (enquiry) => enquiry.Point_of_Contact?.toLowerCase() === 'team@helix-law.com'
        );
        break;

      case 'Triaged':
        filtered = localEnquiries.filter(
          (enquiry) =>
            enquiry.Point_of_Contact &&
            triagedPointOfContactEmails.includes(enquiry.Point_of_Contact.toLowerCase())
        );
        break;

      case 'Silo':
        if (currentSiloArea) {
          filtered = localEnquiries.filter(
            (enquiry) =>
              enquiry.Area_of_Work &&
              enquiry.Area_of_Work.toLowerCase() === currentSiloArea.toLowerCase()
          );
        } else {
          filtered = [];
        }
        break;

      default:
        filtered = localEnquiries;
        break;
    }

    if (filterMethod !== 'All') {
      filtered = filtered.filter((enquiry) => enquiry.Method_of_Contact === filterMethod);
    }

    if (filterArea !== 'All') {
      filtered = filtered.filter((enquiry) => enquiry.Area_of_Work === filterArea);
    }

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
  }, [
    localEnquiries,
    activeMainTab,
    showAll,
    context,
    filterMethod,
    searchTerm,
    filterArea,
    triagedPointOfContactEmails,
    convertedEnquiriesList,
    convertedPoidDataList,
    currentSiloArea,
  ]);

  const indexOfLastEnquiry = currentPage * enquiriesPerPage;
  const indexOfFirstEnquiry = indexOfLastEnquiry - enquiriesPerPage;
  const currentEnquiries = useMemo(() => {
    const sliced = filteredEnquiries.slice(indexOfFirstEnquiry, indexOfLastEnquiry);
    return sliced;
  }, [filteredEnquiries, indexOfFirstEnquiry, indexOfLastEnquiry]);

  const totalPages = Math.ceil(filteredEnquiries.length / enquiriesPerPage);

  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    []
  );

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

  const renderDetailView = useCallback(
    (enquiry: Enquiry) => (
      <Stack
        tokens={{ childrenGap: 20 }}
        styles={{
          root: {
            backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
            borderRadius: '12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            padding: '20px',
            position: 'relative',
          },
        }}
      >
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
          <div style={{ width: '40px' }}></div>
        </Stack>
  
        <Pivot
          selectedKey={activeSubTab}
          onLinkClick={handleSubTabChange}
          styles={{
            root: {
              marginBottom: '20px',
              borderBottom: 'none',
            },
            link: {
              fontSize: '16px',
              fontWeight: '600',
              padding: '10px',
              margin: '0 5px',
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
            linkIsSelected: {
              borderBottom: 'none',
            },
          }}
          aria-label="Enquiry Detail Sub-Tabs"
        >
          <PivotItem headerText="Overview" itemKey="Overview">
            <EnquiryOverview enquiry={enquiry} onEditRating={handleRate} onEditNotes={() => {}} />
          </PivotItem>
          <PivotItem headerText="Pitch" itemKey="Pitch">
            <PitchBuilder enquiry={enquiry} userData={userData} />
          </PivotItem>
          <PivotItem headerText="Details" itemKey="Details">
            <EnquiryDetails enquiry={enquiry} onUpdate={handleUpdateEnquiry} />
          </PivotItem>
        </Pivot>
      </Stack>
    ),
    [handleBackToList, handleSubTabChange, handleRate, isDarkMode, handleUpdateEnquiry, activeSubTab, userData]
  );  

  const calculateAnimationDelay = (row: number, col: number) => {
    const delayPerRow = 0.2;
    const delayPerCol = 0.1;
    return row * delayPerRow + col * delayPerCol;
  };

  const siloContainerStyle = mergeStyles({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gridTemplateRows: '1fr 1fr',
    gap: '20px',
    width: '100%',
    height: '100%',
    flex: 1,
  });

  const siloButtonStyle = (area: string, isDarkMode: boolean) => {
    const mainColor = areaColor(area);
    return {
      root: {
        width: '100%',
        height: '100%',
        borderRadius: '12px',
        boxShadow: isDarkMode
          ? '0 2px 8px rgba(255,255,255,0.1)'
          : '0 2px 8px rgba(0,0,0,0.1)',
        fontSize: '24px',
        fontWeight: '700',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
        color: isDarkMode ? colours.dark.text : colours.light.text,
        transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.3s',
        borderLeft: `4px solid ${mainColor}`,
        ':hover': {
          transform: 'scale(1.02)',
          backgroundColor: mainColor,
          color: '#ffffff',
          boxShadow: isDarkMode
            ? '0 4px 16px rgba(255,255,255,0.2)'
            : '0 4px 16px rgba(0,0,0,0.2)',
        },
        ':focus': {
          outline: 'none',
          transform: 'scale(1.02)',
          backgroundColor: mainColor,
          color: '#ffffff',
        },
      },
      label: {
        fontWeight: '700',
      },
    };
  };

  return (
    <div className={containerStyle(isDarkMode)}>
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
          <div className={sharedControlsContainerStyle}>
            <div className={sharedSearchBoxContainerStyle(isDarkMode)}>
              <SearchBox
                placeholder="Search enquiries..."
                value={searchTerm}
                onChange={(_, newValue) => setSearchTerm(newValue || '')}
                styles={sharedSearchBoxStyle(isDarkMode)}
                aria-label="Search enquiries"
              />
            </div>

            <div className={sharedDropdownContainerStyle(isDarkMode)}>
              <Dropdown
                placeholder="Select Area of Work"
                selectedKey={filterArea}
                onChange={(event, option) => setFilterArea(option?.key as string)}
                options={areaOfWorkOptions}
                styles={sharedDropdownStyles(isDarkMode)}
                ariaLabel="Filter by Area of Work"
              />
            </div>

            <div className={sharedDropdownContainerStyle(isDarkMode)}>
              <Dropdown
                placeholder="Select Contact Method"
                selectedKey={filterMethod}
                onChange={(event, option) => setFilterMethod(option?.key as string)}
                options={contactMethodOptions}
                styles={sharedDropdownStyles(isDarkMode)}
                ariaLabel="Filter by Contact Method"
              />
            </div>

            {(activeMainTab === 'Claimed' || activeMainTab === 'Converted') && (
              <DefaultButton
                text={showAll ? 'Display Mine' : 'Display All'}
                onClick={handleShowAllToggle}
                styles={sharedToggleButtonStyle(isDarkMode)}
                aria-label="Toggle Display Enquiries"
              />
            )}
          </div>
        </div>

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

      <div
        key={activeMainTab}
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
            {activeMainTab === 'Silo' ? (
              currentSiloArea ? (
                filteredEnquiries.length === 0 ? (
                  <Text variant="medium" styles={{ root: { color: isDarkMode ? colours.dark.subText : colours.light.subText } }}>
                    No enquiries found matching your criteria.
                  </Text>
                ) : (
                  <>
                    <div
                      className={mergeStyles({
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '20px',
                        '@media (max-width: 1200px)': {
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        },
                      })}
                    >
                      {currentEnquiries.map((enquiry, index) => {
                        const row = Math.floor(index / 4);
                        const col = index % 4;
                        const animationDelay = calculateAnimationDelay(row, col);
                        return (
                          <EnquiryCard
                            key={`${enquiry.ID}-${index}-${showAll}`}
                            enquiry={enquiry}
                            onSelect={handleSelectEnquiry}
                            onRate={handleRate}
                            animationDelay={animationDelay}
                          />
                        );
                      })}
                    </div>
                    {totalPages > 1 && (
                      <CustomPagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                      />
                    )}
                  </>
                )
              ) : (
                <div className={siloContainerStyle}>
                  <PrimaryButton
                    text="Commercial"
                    onClick={() => setCurrentSiloArea('commercial')}
                    styles={siloButtonStyle('commercial', isDarkMode)}
                  />
                  <PrimaryButton
                    text="Construction"
                    onClick={() => setCurrentSiloArea('construction')}
                    styles={siloButtonStyle('construction', isDarkMode)}
                  />
                  <PrimaryButton
                    text="Employment"
                    onClick={() => setCurrentSiloArea('employment')}
                    styles={siloButtonStyle('employment', isDarkMode)}
                  />
                  <PrimaryButton
                    text="Property"
                    onClick={() => setCurrentSiloArea('property')}
                    styles={siloButtonStyle('property', isDarkMode)}
                  />
                </div>
              )
            ) : activeMainTab === 'Converted' ? ( // "Enquiry ID" tab
              filteredEnquiries.length > 0 ? (
                <div
                  className={mergeStyles({
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '20px',
                    '@media (max-width: 1200px)': {
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    },
                  })}
                >
                  {currentEnquiries.map((enquiry, index) => {
                    const row = Math.floor(index / 4);
                    const col = index % 4;
                    const animationDelay = calculateAnimationDelay(row, col);
                    return (
                      <EnquiryCard
                        key={`${enquiry.ID}-${index}-${showAll}`}
                        enquiry={enquiry}
                        onSelect={handleSelectEnquiry}
                        onRate={handleRate}
                        animationDelay={animationDelay}
                      />
                    );
                  })}
                </div>
              ) : (
                <Text variant="medium" styles={{ root: { color: isDarkMode ? colours.dark.subText : colours.light.subText } }}>
                  No enquiries found matching your criteria.
                </Text>
              )
            ) : activeMainTab === 'Claimable' ? ( // "Unclaimed" tab
              filteredEnquiries.length > 0 ? (
                <div
                  className={mergeStyles({
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '20px',
                    '@media (max-width: 1200px)': {
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    },
                  })}
                >
                  {currentEnquiries.map((enquiry, index) => {
                    const row = Math.floor(index / 4);
                    const col = index % 4;
                    const animationDelay = calculateAnimationDelay(row, col);
                    return (
                      <EnquiryCard
                        key={`${enquiry.ID}-${index}-${showAll}`}
                        enquiry={enquiry}
                        onSelect={handleSelectEnquiry}
                        onRate={handleRate}
                        animationDelay={animationDelay}
                      />
                    );
                  })}
                </div>
              ) : (
                <Text variant="medium" styles={{ root: { color: isDarkMode ? colours.dark.subText : colours.light.subText } }}>
                  No enquiries found matching your criteria.
                </Text>
              )
            ) : (
              <>
                {filteredEnquiries.length === 0 ? (
                  <Text variant="medium" styles={{ root: { color: isDarkMode ? colours.dark.subText : colours.light.subText } }}>
                    No enquiries found matching your criteria.
                  </Text>
                ) : (
                  <>
                    <div
                      className={mergeStyles({
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '20px',
                        '@media (max-width: 1200px)': {
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        },
                      })}
                    >
                      {currentEnquiries.map((enquiry, index) => {
                        const row = Math.floor(index / 4);
                        const col = index % 4;
                        const animationDelay = calculateAnimationDelay(row, col);
                        return (
                          <EnquiryCard
                            key={`${enquiry.ID}-${index}-${showAll}`}
                            enquiry={enquiry}
                            onSelect={handleSelectEnquiry}
                            onRate={handleRate}
                            animationDelay={animationDelay}
                          />
                        );
                      })}
                    </div>
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
          </>
        )}
      </div>

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
          <Text
            variant="small"
            styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.subText, display: 'inline' } }}
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
      </div>

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
