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
  SearchBox,
} from '@fluentui/react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from 'recharts';
import { parseISO, startOfMonth, format, isValid } from 'date-fns';
import { Enquiry, UserData, POID } from '../../app/functionality/types';
import { initializeIcons } from '@fluentui/react/lib/Icons';
import CustomPagination from '../../app/styles/CustomPagination';
import EnquiryCard from './EnquiryCard';
import EnquiryOverview from './EnquiryOverview';
import PitchBuilder from './PitchBuilder';
import EnquiryDetails from './EnquiryDetails';
import { colours } from '../../app/styles/colours';
import CustomTabs from '../../app/styles/CustomTabs';
import { useTheme } from '../../app/functionality/ThemeContext';
import { Pivot, PivotItem } from '@fluentui/react';
import { Context as TeamsContextType } from '@microsoft/teams-js';

initializeIcons();

// Container styles
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

// (Area color helper remains available, though for backdrop icons we use a fixed subtle grey.)
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
        backgroundColor,
        borderRadius: '50%',
        width: '36px',
        height: '36px',
        color: 'white',
        cursor: 'pointer',
        position: 'relative',
        transition: 'transform 0.2s',
        selectors: {
          ':hover': { transform: 'scale(1.1)' },
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

interface MonthlyCount {
  month: string;
  commercial: number;
  construction: number;
  employment: number;
  property: number;
}

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
  const [currentPage, setCurrentPage] = useState<number>(1);
  const enquiriesPerPage = 12;
  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false);
  const [currentRating, setCurrentRating] = useState<string>('');
  const [ratingEnquiryId, setRatingEnquiryId] = useState<string | null>(null);
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [showAll, setShowAll] = useState<boolean>(false);

  // MAIN TYPES MENU (deselectable). "Silo" is removed.
  // No default selection.
  const [activeMainTab, setActiveMainTab] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<string>('Overview');
  const [convertedEnquiriesList, setConvertedEnquiriesList] = useState<Enquiry[]>([]);
  const [convertedPoidDataList, setConvertedPoidDataList] = useState<POID[]>([]);
  // Track currently selected area-of-work from the top menu.
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ oldest: string; newest: string } | null>(null);

  // State for search input reveal in types menu.
  const [isSearchActive, setSearchActive] = useState<boolean>(false);

  // MAIN TYPES MENU (excludes "Silo")
  const mainTabs = [
    { key: 'Claimed', text: 'Claimed' },
    { key: 'Converted', text: 'Enquiry ID' },
    { key: 'Claimable', text: 'Unclaimed' },
    { key: 'Triaged', text: 'Triaged' },
  ];

  const subTabs = [
    { key: 'Overview', text: 'Overview' },
    { key: 'Pitch', text: 'Pitch' },
    { key: 'Details', text: 'Details' },
  ];

  // Toggle type selection; deselect if clicked again.
  const handleMainTabChange = useCallback(
    (item?: PivotItem, ev?: React.MouseEvent<HTMLElement>) => {
      if (item) {
        const clickedKey = item.props.itemKey as string;
        setActiveMainTab((prevKey) => (prevKey === clickedKey ? '' : clickedKey));
        setCurrentPage(1);
        setSelectedEnquiry(null);
        setActiveSubTab('Overview');
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
            body: JSON.stringify({ ID: id, Rating: newRating }),
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
              body: JSON.stringify({ dateFrom: '2024-11-01', dateTo: '2024-12-15' }),
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

  // Calculate date range based on enquiries.
  useEffect(() => {
    if (localEnquiries.length > 0) {
      const validDates = localEnquiries
        .map((enquiry) => enquiry.Touchpoint_Date)
        .filter((dateStr): dateStr is string => typeof dateStr === 'string' && isValid(parseISO(dateStr)))
        .map((dateStr) => parseISO(dateStr));
      if (validDates.length > 0) {
        const oldestDate = new Date(Math.min(...validDates.map((date) => date.getTime())));
        const newestDate = new Date(Math.max(...validDates.map((date) => date.getTime())));
        setDateRange({ oldest: format(oldestDate, 'dd MMM yyyy'), newest: format(newestDate, 'dd MMM yyyy') });
      }
    } else {
      setDateRange(null);
    }
  }, [localEnquiries]);

  // Filtering: types menu, search term, and area-of-work.
  const filteredEnquiries = useMemo(() => {
    let filtered: Enquiry[] = [];
    switch (activeMainTab) {
      case 'Claimed':
        filtered = localEnquiries.filter(
          (enquiry) =>
            enquiry.Point_of_Contact?.toLowerCase() === (context?.userPrincipalName || '').toLowerCase()
        );
        break;
      case 'Converted':
        if (context && context.userPrincipalName) {
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
      default:
        filtered = localEnquiries;
        break;
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
    if (selectedArea) {
      filtered = filtered.filter(
        (enquiry) =>
          enquiry.Area_of_Work &&
          enquiry.Area_of_Work.toLowerCase() === selectedArea.toLowerCase()
      );
    }
    return filtered;
  }, [
    localEnquiries,
    activeMainTab,
    context,
    searchTerm,
    triagedPointOfContactEmails,
    convertedEnquiriesList,
    convertedPoidDataList,
    selectedArea,
  ]);

  const indexOfLastEnquiry = currentPage * enquiriesPerPage;
  const indexOfFirstEnquiry = indexOfLastEnquiry - enquiriesPerPage;
  const currentEnquiries = useMemo(
    () => filteredEnquiries.slice(indexOfFirstEnquiry, indexOfLastEnquiry),
    [filteredEnquiries, indexOfFirstEnquiry, indexOfLastEnquiry]
  );
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

  const renderRatingOptions = useCallback(() => (
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
            <Text variant="medium" styles={{ root: { fontWeight: '700', color: colours.highlight } }}>
              {option.text}
            </Text>
          </label>
          <Text
            variant="small"
            styles={{
              root: { marginLeft: '30px', color: isDarkMode ? colours.dark.text : colours.light.text },
            }}
          >
            {option.description}
          </Text>
        </Stack>
      ))}
    </Stack>
  ), [currentRating, isDarkMode, ratingOptions]);

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
                selectors: {
                  ':hover': {
                    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
                  },
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
            root: { marginBottom: '20px', borderBottom: 'none' },
            link: {
              fontSize: '16px',
              fontWeight: 600,
              padding: '10px',
              margin: '0 5px',
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
            linkIsSelected: { borderBottom: 'none' },
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

  // --- New Area of Work Tab Menu Styles and Options ---
  const areaOfWorkTabs = [
    { key: 'commercial', text: 'Commercial', icon: 'KnowledgeArticle' },
    { key: 'construction', text: 'Construction', icon: 'ConstructionCone' },
    { key: 'employment', text: 'Employment', icon: 'People' },
    { key: 'property', text: 'Property', icon: 'CityNext' },
  ];

  // Each area tab now displays its icon as a subtle backdrop.
  const areaTabStyle = (isSelected: boolean, area: string) =>
    mergeStyles({
      flex: 1,
      height: '80px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      backgroundColor: isSelected
        ? isDarkMode
          ? `${areaColor(area)}20`
          : `${areaColor(area)}20`
        : isDarkMode
        ? colours.dark.sectionBackground
        : colours.light.sectionBackground,
      borderBottom: isSelected ? `4px solid ${areaColor(area)}` : '4px solid transparent',
      borderTopLeftRadius: '8px',
      borderTopRightRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      marginRight: '4px',
      transition: 'background-color 0.3s, border-bottom 0.3s, box-shadow 0.3s',
      padding: '10px',
      position: 'relative',
      overflow: 'hidden',
      selectors: {
        ':hover': {
          boxShadow: isDarkMode
            ? '0 4px 12px rgba(0, 0, 0, 0.5)'
            : '0 4px 12px rgba(0, 0, 0, 0.3)',
          '.backdropIcon': { opacity: 0.6 },
        },
      },
    });

  const areaTabContainerStyle = mergeStyles({
    display: 'flex',
    width: '100%',
    marginBottom: '10px',
  });
  // --- End of Area of Work Tab Menu ---

  // --- Types Menu Search Button / Input ---
  // For animated reveal, we animate width and opacity.
  const searchButtonStyles = {
    root: {
      width: '40px',
      height: '80px',
      backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
      borderRadius: '0 0 8px 8px',
      transition: 'all 0.3s ease',
    },
    icon: { fontSize: '20px' },
  };

  const searchInputStyles = {
    root: {
      width: isSearchActive ? '200px' : '0px',
      opacity: isSearchActive ? 1 : 0,
      border: 'none',
      backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
      borderRadius: '0 0 8px 8px',
      transition: 'width 0.3s ease, opacity 0.3s ease',
      height: '80px',
      display: 'flex',
      alignItems: 'center',
      padding: isSearchActive ? '0 10px' : '0px',
      overflow: 'hidden' as 'hidden',
    },
    field: { border: 'none', background: 'transparent' },
  };
  // --- End of Search ---

  // Process monthly enquiry counts stacked by area.
  const monthlyEnquiryCounts = useMemo<MonthlyCount[]>(() => {
    if (!localEnquiries) return [];
    const counts: { [month: string]: MonthlyCount } = {};
    localEnquiries.forEach((enquiry) => {
      if (enquiry.Touchpoint_Date && enquiry.Area_of_Work) {
        const date = parseISO(enquiry.Touchpoint_Date);
        if (!isValid(date)) return;
        const monthStart = startOfMonth(date);
        const monthLabel = format(monthStart, 'MMM yyyy');
        const area = enquiry.Area_of_Work.toLowerCase();
        if (!counts[monthLabel]) {
          counts[monthLabel] = {
            month: monthLabel,
            commercial: 0,
            construction: 0,
            employment: 0,
            property: 0,
          };
        }
        switch (area) {
          case 'commercial':
            counts[monthLabel].commercial += 1;
            break;
          case 'construction':
            counts[monthLabel].construction += 1;
            break;
          case 'employment':
            counts[monthLabel].employment += 1;
            break;
          case 'property':
            counts[monthLabel].property += 1;
            break;
          default:
            break;
        }
      }
    });
    const sortedMonths = Object.keys(counts).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );
    return sortedMonths.map((month) => counts[month]);
  }, [localEnquiries]);

  const areaCounts = useMemo(() => {
    const counts: { [key: string]: number } = {
      commercial: 0,
      construction: 0,
      employment: 0,
      property: 0,
    };
    localEnquiries.forEach((enquiry) => {
      const area = enquiry.Area_of_Work?.toLowerCase();
      if (area && counts.hasOwnProperty(area)) {
        counts[area]++;
      }
    });
    return counts;
  }, [localEnquiries]);

  return (
    <div className={containerStyle(isDarkMode)}>
      <div className={mergeStyles({ paddingTop: '0px', paddingBottom: '20px' })}>
        {/* New Area of Work Tab Menu */}
        {!selectedEnquiry && (
          <Stack tokens={{ childrenGap: 10 }}>
            <div className={areaTabContainerStyle}>
              {areaOfWorkTabs.map((option) => {
                const isSelected = selectedArea === option.key;
                return (
                  <div
                    key={option.key}
                    className={areaTabStyle(isSelected, option.key)}
                    onClick={() => setSelectedArea(isSelected ? null : option.key)}
                    aria-label={option.text}
                  >
                    <div style={{ position: 'relative', width: '100%', textAlign: 'center' }}>
                      {/* Backdrop Icon: subtle grey, centered */}
                      <Icon
                        iconName={option.icon}
                        className="backdropIcon"
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          fontSize: '60px',
                          opacity: 0.2,
                          zIndex: 0,
                          color: '#aaa',
                          transition: 'opacity 0.3s ease',
                        }}
                      />
                      <Text variant="xLarge" styles={{ root: { fontWeight: 700, position: 'relative', zIndex: 1 } }}>
                        {option.text}
                      </Text>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Types Menu with vertical separators and Animated Search */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                borderRadius: '0 0 8px 8px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                padding: '0 10px',
              }}
            >
              <CustomTabs
                selectedKey={activeMainTab}
                onLinkClick={handleMainTabChange}
                tabs={mainTabs}
                ariaLabel="Enquiries Main Tabs"
              />
              <div style={{ marginLeft: 'auto', position: 'relative', height: '80px', display: 'flex', alignItems: 'center' }}>
                {isSearchActive ? (
                  <SearchBox
                    placeholder="Search enquiries..."
                    value={searchTerm}
                    onChange={(_, newValue) => setSearchTerm(newValue || '')}
                    styles={searchInputStyles}
                    onBlur={() => { if (!searchTerm) { setSearchActive(false); } }}
                  />
                ) : (
                  <IconButton
                    iconProps={{ iconName: 'Search' }}
                    onClick={() => setSearchActive(true)}
                    styles={searchButtonStyles}
                  />
                )}
              </div>
            </div>
          </Stack>
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
        {/* Show chart only if no area or type is selected */}
        {!selectedEnquiry && !selectedArea && !activeMainTab ? (
          <>
            {dateRange && (
              <div className={mergeStyles({ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '20px' })}>
                <div
                  className={mergeStyles({
                    background: isDarkMode
                      ? 'linear-gradient(135deg, #1a1a1a, #333333)'
                      : 'linear-gradient(135deg, #ffffff, #f0f0f0)',
                    borderRadius: '20px',
                    padding: '10px 20px',
                    boxShadow: isDarkMode
                      ? '0 4px 12px rgba(255, 255, 255, 0.1)'
                      : '0 4px 12px rgba(0, 0, 0, 0.1)',
                  })}
                >
                  <Text
                    variant="mediumPlus"
                    styles={{
                      root: {
                        fontWeight: '700',
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        fontSize: '16px',
                        fontFamily: 'Raleway, sans-serif',
                      },
                    }}
                  >
                    Date Range: {dateRange.oldest} - {dateRange.newest}
                  </Text>
                </div>
              </div>
            )}

            <div
              className={mergeStyles({
                marginTop: '40px',
                padding: '30px',
                backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                borderRadius: '20px',
                boxShadow: isDarkMode
                  ? `0 8px 24px rgba(0, 0, 0, 0.5)`
                  : `0 8px 24px rgba(0, 0, 0, 0.2)`,
                position: 'relative',
                fontFamily: 'Raleway, sans-serif',
              })}
            >
              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  data={monthlyEnquiryCounts}
                  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  style={{ fontFamily: 'Raleway, sans-serif' }}
                >
                  <defs>
                    <linearGradient id="colorCommercial" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgba(0, 120, 215, 0.6)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="rgba(0, 120, 215, 0.6)" stopOpacity={0.2} />
                    </linearGradient>
                    <linearGradient id="colorConstruction" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgba(255, 140, 0, 0.6)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="rgba(255, 140, 0, 0.6)" stopOpacity={0.2} />
                    </linearGradient>
                    <linearGradient id="colorEmployment" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgba(255, 242, 0, 0.6)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="rgba(255, 242, 0, 0.6)" stopOpacity={0.2} />
                    </linearGradient>
                    <linearGradient id="colorProperty" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgba(34, 177, 76, 0.6)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="rgba(34, 177, 76, 0.6)" stopOpacity={0.2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDarkMode ? colours.dark.border : colours.light.border}
                  />
                  <XAxis
                    dataKey="month"
                    stroke={isDarkMode ? colours.dark.text : colours.light.text}
                    tick={{
                      fontSize: 14,
                      fontWeight: 400,
                      fontFamily: 'Raleway, sans-serif',
                      textAnchor: 'middle',
                    }}
                    height={60}
                  />
                  <YAxis
                    stroke={isDarkMode ? colours.dark.text : colours.light.text}
                    tick={{
                      fontSize: 14,
                      fontWeight: 400,
                      fontFamily: 'Raleway, sans-serif',
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.background,
                      border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                      fontFamily: 'Raleway, sans-serif',
                    }}
                    labelStyle={{ color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' }}
                    itemStyle={{ color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' }}
                  />
                  <Legend
                    wrapperStyle={{ color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' }}
                  />
                  <Bar
                    dataKey="commercial"
                    stackId="a"
                    fill="url(#colorCommercial)"
                    animationDuration={1500}
                    animationEasing="ease-out"
                  >
                    <LabelList
                      dataKey="commercial"
                      position="insideTop"
                      fill={isDarkMode ? colours.dark.text : colours.light.text}
                      style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 400 }}
                    />
                  </Bar>
                  <Bar
                    dataKey="construction"
                    stackId="a"
                    fill="url(#colorConstruction)"
                    animationDuration={1500}
                    animationEasing="ease-out"
                  >
                    <LabelList
                      dataKey="construction"
                      position="insideTop"
                      fill={isDarkMode ? colours.dark.text : colours.light.text}
                      style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 400 }}
                    />
                  </Bar>
                  <Bar
                    dataKey="employment"
                    stackId="a"
                    fill="url(#colorEmployment)"
                    animationDuration={1500}
                    animationEasing="ease-out"
                  >
                    <LabelList
                      dataKey="employment"
                      position="insideTop"
                      fill={isDarkMode ? colours.dark.text : colours.light.text}
                      style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 400 }}
                    />
                  </Bar>
                  <Bar
                    dataKey="property"
                    stackId="a"
                    fill="url(#colorProperty)"
                    animationDuration={1500}
                    animationEasing="ease-out"
                  >
                    <LabelList
                      dataKey="property"
                      position="insideTop"
                      fill={isDarkMode ? colours.dark.text : colours.light.text}
                      style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 400 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : selectedEnquiry ? (
          renderDetailView(selectedEnquiry)
        ) : (
          <>
            {filteredEnquiries.length === 0 ? (
              <Text variant="medium" styles={{ root: { color: isDarkMode ? colours.dark.subText : colours.light.subText, fontFamily: 'Raleway, sans-serif' } }}>
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
      </div>

      <div className={footerStyle(isDarkMode)}>
        <Text>
          <Link
            href="https://helix-law.co.uk/"
            target="_blank"
            styles={{ root: { color: isDarkMode ? colours.dark.subText : colours.light.subText, fontSize: '12px', fontFamily: 'Raleway, sans-serif', textDecoration: 'none' } }}
            aria-label="Helix Law Website"
          >
            https://helix-law.co.uk/
          </Link>
          {' | '}
          <Text
            variant="small"
            styles={{ root: { color: isDarkMode ? colours.dark.subText : colours.light.subText, display: 'inline', fontFamily: 'Raleway, sans-serif' } }}
          >
            01273 761990
          </Text>
        </Text>
        <Text styles={{ root: { fontSize: '12px', fontFamily: 'Raleway, sans-serif', color: isDarkMode ? colours.dark.text : colours.light.subText } }}>
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
              fontFamily: 'Raleway, sans-serif',
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
          fontFamily: 'Raleway, sans-serif',
        })}
        styles={{ main: { maxWidth: '600px', margin: 'auto' } }}
        aria-labelledby="rate-enquiry-modal"
      >
        <Stack tokens={{ childrenGap: 20 }}>
          <Text variant="xxLarge" styles={{ root: { fontWeight: '700', color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' } }}>
            Rate Enquiry
          </Text>
          <Text variant="medium" styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text, fontFamily: 'Raleway, sans-serif' } }}>
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
