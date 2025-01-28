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
  IStyle,
  Slider,
  initializeIcons,
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
import CustomPagination from '../../app/styles/CustomPagination';
import EnquiryCard from './EnquiryCard';
import EnquiryOverview from './EnquiryOverview';
import PitchBuilder from './PitchBuilder';
import EnquiryDetails from './EnquiryDetails';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { Pivot, PivotItem } from '@fluentui/react';
import { Context as TeamsContextType } from '@microsoft/teams-js';
import ScoreCard from './ScoreCard'; // Corrected import path

initializeIcons();

interface TeamData {
  "Created Date"?: string;
  "Created Time"?: string;
  "Full Name"?: string;
  "Last"?: string;
  "First"?: string;
  "Nickname"?: string;
  "Initials"?: string;
  "Email"?: string;
  "Entra ID"?: string;
  "Clio ID"?: string;
  "Rate"?: number;
  "Role"?: string;
  "AOW"?: string;
}

interface MonthlyCount {
  month: string;
  commercial: number;
  construction: number;
  employment: number;
  property: number;
}

interface RedesignedCombinedMenuProps {
  activeArea: string | null;
  setActiveArea: React.Dispatch<React.SetStateAction<string | null>>;
  activeState: string;
  setActiveState: (key: string) => void;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  isSearchActive: boolean;
  setSearchActive: React.Dispatch<React.SetStateAction<boolean>>;
}

const areaColor = (area?: string): string => {
  const normalizedArea = area?.toLowerCase() || '';
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

const RedesignedCombinedMenu: React.FC<RedesignedCombinedMenuProps> = ({
  activeArea,
  setActiveArea,
  activeState,
  setActiveState,
  searchTerm,
  setSearchTerm,
  isSearchActive,
  setSearchActive,
}) => {
  const { isDarkMode } = useTheme();

  const menuContainer = mergeStyles({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? '0px 2px 8px rgba(0,0,0,0.6)'
      : '0px 2px 8px rgba(0,0,0,0.1)',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    marginBottom: '20px',
  });

  const areaItem = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    marginRight: '12px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.3s, border 0.3s',
    border: '2px solid transparent',
    selectors: {
      ':hover': {
        backgroundColor: isDarkMode ? `${colours.dark.subText}20` : `${colours.light.subText}20`,
      },
    },
  });

  const activeAreaItem = mergeStyles({
    border: `2px solid ${areaColor(activeArea || '')}`,
    backgroundColor: `${areaColor(activeArea || '')}20`,
  });

  const areaIconStyle = {
    marginRight: '8px',
    fontSize: '20px',
    color: '#aaa',
  };

  const areaTextStyle = (isSelected: boolean) => ({
    fontWeight: isSelected ? 600 : 400,
    color: isSelected
      ? isDarkMode
        ? colours.dark.text
        : '#061733'
      : isDarkMode
      ? colours.dark.text
      : colours.light.text,
  });

  const stateButton = mergeStyles({
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.3s, color 0.3s',
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    selectors: {
      ':hover': {
        backgroundColor: isDarkMode ? `${colours.dark.subText}20` : `${colours.light.subText}20`,
        color: 'white',
      },
    },
  });

  const activeStateButton = mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.hoverBackground : colours.light.hoverBackground,
    color: 'white',
    border: 'none',
  });

  const searchContainer = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    position: 'relative',
  });

  const searchBoxStyles = mergeStyles({
    width: isSearchActive ? '180px' : '0px',
    opacity: isSearchActive ? 1 : 0,
    transition: 'width 0.3s, opacity 0.3s',
    overflow: 'hidden',
    marginLeft: '8px',
  });

  const searchIconContainer = mergeStyles({
    cursor: 'pointer',
  });

  const areaTabs = [
    { key: 'commercial', text: 'Commercial', icon: 'KnowledgeArticle' },
    { key: 'property', text: 'Property', icon: 'CityNext' },
    { key: 'construction', text: 'Construction', icon: 'ConstructionCone' },
    { key: 'employment', text: 'Employment', icon: 'People' },
  ];

  const stateTabs = [
    { key: 'All', text: 'All' },
    { key: 'Claimed', text: 'Claimed' },
    { key: 'Converted', text: 'Enquiry ID' },
    { key: 'Claimable', text: 'Unclaimed' },
    { key: 'Triaged', text: 'Triaged' },
  ];

  return (
    <div className={menuContainer}>
      <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
        {areaTabs.map((area) => {
          const isSelected = activeArea === area.key;
          return (
            <div
              key={area.key}
              className={mergeStyles(areaItem, isSelected && activeAreaItem)}
              onClick={() => setActiveArea(isSelected ? null : area.key)}
              aria-label={area.text}
            >
              <Icon iconName={area.icon} styles={{ root: { ...areaIconStyle } }} />
              <Text variant="mediumPlus" styles={{ root: areaTextStyle(isSelected) as IStyle }}>
                {area.text}
              </Text>
            </div>
          );
        })}
      </Stack>
      <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
        {stateTabs.map((state) => {
          const isSelected = activeState === state.key;
          return (
            <div
              key={state.key}
              className={mergeStyles(stateButton, isSelected && activeStateButton)}
              onClick={() => setActiveState(isSelected ? '' : state.key)}
              aria-label={state.text}
            >
              <Text variant="medium" styles={{ root: { fontWeight: isSelected ? 600 : 400 } }}>
                {state.text}
              </Text>
            </div>
          );
        })}
        <div className={searchIconContainer} onClick={() => setSearchActive(!isSearchActive)}>
          {isSearchActive ? (
            <Icon iconName="Cancel" styles={{ root: { fontSize: '20px', color: isDarkMode ? colours.dark.text : colours.light.text } }} />
          ) : (
            <Icon iconName="Search" styles={{ root: { fontSize: '20px', color: isDarkMode ? colours.dark.text : colours.light.text } }} />
          )}
        </div>
        <div className={searchBoxStyles}>
          <SearchBox
            placeholder="Search enquiries..."
            value={searchTerm}
            onChange={(_, newValue) => setSearchTerm(newValue || '')}
            underlined
          />
        </div>
      </Stack>
    </div>
  );
};

const CustomLabel = (props: any) => {
  const { x, y, width, height, value, dataKey } = props;
  if (!dataKey) return null;
  if (!value) return null;
  const color = areaColor(dataKey);
  const rectWidth = 80;
  const rectHeight = 25;
  const rectX = x + width / 2 - rectWidth / 2;
  const rectY = y + height / 2 - rectHeight / 2;
  return (
    <g>
      <rect
        x={rectX}
        y={rectY}
        width={rectWidth}
        height={rectHeight}
        fill={color}
        rx={5}
        ry={5}
      />
      <text
        x={x + width / 2}
        y={y + height / 2 + 5}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontSize={12}
        fontFamily="Raleway, sans-serif"
      >
        {value}
      </text>
    </g>
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
  const [currentPage, setCurrentPage] = useState<number>(1);
  const enquiriesPerPage = 12;
  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false);
  const [currentRating, setCurrentRating] = useState<string>('');
  const [ratingEnquiryId, setRatingEnquiryId] = useState<string | null>(null);
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [showAll, setShowAll] = useState<boolean>(false);
  const [activeMainTab, setActiveMainTab] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<string>('Overview');
  const [convertedEnquiriesList, setConvertedEnquiriesList] = useState<Enquiry[]>([]);
  const [convertedPoidDataList, setConvertedPoidDataList] = useState<POID[]>([]);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ oldest: string; newest: string } | null>(null);
  const [isSearchActive, setSearchActive] = useState<boolean>(false);
  const [teamData, setTeamData] = useState<TeamData[] | null>(null);
  const [isTeamDataLoading, setIsTeamDataLoading] = useState<boolean>(false);
  const [teamDataError, setTeamDataError] = useState<string | null>(null);
  const [currentSliderStart, setCurrentSliderStart] = useState<number>(0);
  const [currentSliderEnd, setCurrentSliderEnd] = useState<number>(0);

  const fetchTeamData = async (): Promise<TeamData[] | null> => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_PROXY_BASE_URL}/getTeamData?code=${process.env.REACT_APP_GET_TEAM_DATA_CODE}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch team data: ${response.statusText}`);
      }
      const data: TeamData[] = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching team data:', error);
      return null;
    }
  };

  useEffect(() => {
    async function loadTeamData() {
      setIsTeamDataLoading(true);
      setTeamDataError(null);
      const data = await fetchTeamData();
      if (data) {
        setTeamData(data);
        console.log('Team data fetched successfully:', data);
      } else {
        setTeamDataError('Failed to fetch team data.');
      }
      setIsTeamDataLoading(false);
    }
    loadTeamData();
  }, []);

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
  }, [ratingEnquiryId, currentRating, closeRateModal]);

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
        setCurrentSliderStart(0);
        setCurrentSliderEnd(validDates.length - 1);
      }
    } else {
      setDateRange(null);
    }
  }, [localEnquiries]);

  const sortedEnquiries = useMemo<Enquiry[]>(() => {
    return [...localEnquiries].sort((a, b) => {
      const dateA = parseISO(a.Touchpoint_Date || '');
      const dateB = parseISO(b.Touchpoint_Date || '');
      return dateA.getTime() - dateB.getTime();
    });
  }, [localEnquiries]);

  const sortedValidEnquiries = useMemo<Enquiry[]>(() => {
    return sortedEnquiries.filter(
      (enquiry) => enquiry.Touchpoint_Date && isValid(parseISO(enquiry.Touchpoint_Date))
    );
  }, [sortedEnquiries]);

  useEffect(() => {
    if (sortedValidEnquiries.length > 0) {
      setCurrentSliderEnd(sortedValidEnquiries.length - 1);
    }
  }, [sortedValidEnquiries.length]);

  const enquiriesInSliderRange = useMemo<Enquiry[]>(() => {
    return sortedValidEnquiries.slice(currentSliderStart, currentSliderEnd + 1);
  }, [sortedValidEnquiries, currentSliderStart, currentSliderEnd]);

  const monthlyEnquiryCounts = useMemo<MonthlyCount[]>(() => {
    const enquiries = enquiriesInSliderRange;
    if (!enquiries) return [];
    const counts: { [month: string]: MonthlyCount } = {};
    enquiries.forEach((enquiry) => {
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
  }, [enquiriesInSliderRange]);

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

  const filteredEnquiries = useMemo(() => {
    let filtered: Enquiry[] = enquiriesInSliderRange;
    if (activeMainTab === 'All') {
    } else {
      switch (activeMainTab) {
        case 'Claimed':
          filtered = filtered.filter(
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
          filtered = filtered.filter(
            (enquiry) => enquiry.Point_of_Contact?.toLowerCase() === 'team@helix-law.com'
          );
          break;
        case 'Triaged':
          filtered = filtered.filter(
            (enquiry) =>
              enquiry.Point_of_Contact &&
              triagedPointOfContactEmails.includes(enquiry.Point_of_Contact.toLowerCase())
          );
          break;
        default:
          break;
      }
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
    enquiriesInSliderRange,
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

  const renderRatingOptions = useCallback(
    () => (
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
    ),
    [currentRating, isDarkMode, ratingOptions]
  );

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
        <Stack horizontal horizontalAlign="space-between" verticalAlign="center" className={mergeStyles({ marginBottom: '20px' })}>
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
          <div style={{ width: '40px' }} />
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
          <PivotItem headerText="Pitch Builder" itemKey="Pitch">
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

  const getTeamMemberByEntraId = useCallback(
    (entraId: string): TeamData | undefined => {
      return teamData?.find((member) => member['Entra ID'] === entraId);
    },
    [teamData]
  );

  const enquiriesCountPerMember = useMemo(() => {
    if (!enquiriesInSliderRange || !teamData) return [];
    const groupedEnquiries: { [email: string]: number } = {};
    enquiriesInSliderRange.forEach((enquiry) => {
      const pocEmail = enquiry.Point_of_Contact?.toLowerCase();
      if (pocEmail) {
        groupedEnquiries[pocEmail] = (groupedEnquiries[pocEmail] || 0) + 1;
      }
    });
    const counts: { initials: string; count: number }[] = [];
    teamData.forEach((member) => {
      const memberEmail = member['Email']?.toLowerCase();
      const memberRole = member['Role']?.toLowerCase();
      if (memberEmail && groupedEnquiries[memberEmail] && memberRole !== 'non-solicitor') {
        counts.push({
          initials: member['Initials'] || '',
          count: groupedEnquiries[memberEmail],
        });
      }
    });
    counts.sort((a, b) => b.count - a.count);
    return counts;
  }, [enquiriesInSliderRange, teamData]);

  return (
    <div className={containerStyle(isDarkMode)}>
      <div className={mergeStyles({ paddingTop: '0px', paddingBottom: '20px' })}>
        {!selectedEnquiry && (
          <Stack tokens={{ childrenGap: 10 }}>
            <RedesignedCombinedMenu
              activeArea={selectedArea}
              setActiveArea={setSelectedArea}
              activeState={activeMainTab}
              setActiveState={(key) => {
                setActiveMainTab(key);
                setCurrentPage(1);
                setSelectedEnquiry(null);
                setActiveSubTab('Overview');
              }}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              isSearchActive={isSearchActive}
              setSearchActive={setSearchActive}
            />
          </Stack>
        )}
      </div>
      {!selectedEnquiry && !selectedArea && !activeMainTab && (
        <div className={mergeStyles({ marginBottom: '20px' })}>
          {isTeamDataLoading && (
            <MessageBar messageBarType={MessageBarType.info}>
              Loading team data...
            </MessageBar>
          )}
          {teamDataError && (
            <MessageBar messageBarType={MessageBarType.error}>
              {teamDataError}
            </MessageBar>
          )}
          {teamData && enquiriesCountPerMember.length > 0 && (
            <>
              <Stack
                horizontal
                tokens={{ childrenGap: 40 }}
                wrap
                className={mergeStyles({ marginBottom: '20px' })}
              >
                <Stack tokens={{ childrenGap: 5 }} verticalAlign="start">
                  <Text
                    variant="medium"
                    styles={{
                      root: {
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        fontFamily: 'Raleway, sans-serif',
                      },
                    }}
                  >
                    Select Start Date:
                  </Text>
                  <Slider
                    min={0}
                    max={sortedValidEnquiries.length - 1}
                    step={1}
                    value={currentSliderStart}
                    onChange={(value) => {
                      if (value <= currentSliderEnd) {
                        setCurrentSliderStart(value);
                      }
                    }}
                    showValue={false}
                    styles={{
                      root: { width: '300px' },
                      activeSection: { backgroundColor: colours.highlight },
                      line: { backgroundColor: isDarkMode ? colours.dark.border : colours.inactiveTrackLight },
                      thumb: { backgroundColor: colours.highlight },
                    }}
                  />
                  <Text
                    variant="small"
                    styles={{
                      root: {
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                      },
                    }}
                  >
                    {sortedValidEnquiries[currentSliderStart]?.Touchpoint_Date
                      ? format(parseISO(sortedValidEnquiries[currentSliderStart].Touchpoint_Date), 'dd MMM yyyy')
                      : ''}
                  </Text>
                </Stack>
                <Stack tokens={{ childrenGap: 5 }} verticalAlign="start">
                  <Text
                    variant="medium"
                    styles={{
                      root: {
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        fontFamily: 'Raleway, sans-serif',
                      },
                    }}
                  >
                    Select End Date:
                  </Text>
                  <Slider
                    min={0}
                    max={sortedValidEnquiries.length - 1}
                    step={1}
                    value={currentSliderEnd}
                    onChange={(value) => {
                      if (value >= currentSliderStart) {
                        setCurrentSliderEnd(value);
                      }
                    }}
                    showValue={false}
                    styles={{
                      root: { width: '300px' },
                      activeSection: { backgroundColor: colours.highlight },
                      inactiveSection: { backgroundColor: isDarkMode ? colours.dark.border : colours.inactiveTrackLight },
                      thumb: { backgroundColor: colours.highlight },
                    }}
                  />
                  <Text
                    variant="small"
                    styles={{
                      root: {
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                      },
                    }}
                  >
                    {sortedValidEnquiries[currentSliderEnd]?.Touchpoint_Date
                      ? format(parseISO(sortedValidEnquiries[currentSliderEnd].Touchpoint_Date), 'dd MMM yyyy')
                      : ''}
                  </Text>
                </Stack>
              </Stack>
              <Stack horizontal tokens={{ childrenGap: 20 }} wrap>
                {enquiriesCountPerMember.map((member, index) => (
                  <ScoreCard
                    key={index}
                    initials={member.initials}
                    count={member.count}
                    isDarkMode={isDarkMode}
                  />
                ))}
              </Stack>
            </>
          )}
          {teamData && enquiriesCountPerMember.length === 0 && (
            <Text
              variant="medium"
              styles={{
                root: {
                  color: isDarkMode ? colours.dark.subText : colours.light.subText,
                  fontFamily: 'Raleway, sans-serif',
                },
              }}
            >
              No enquiries found for any team member.
            </Text>
          )}
        </div>
      )}
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
        {!selectedEnquiry && !selectedArea && !activeMainTab ? (
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
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={monthlyEnquiryCounts}
                margin={{ top: 20, right: 30, left: 20, bottom: 40 }}
                style={{ fontFamily: 'Raleway, sans-serif' }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isDarkMode ? colours.dark.border : '#e0e0e0'}
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
                  height={50}
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
                  fill="#b0b0b0"
                  stackId="a"
                  animationDuration={1500}
                  animationEasing="ease-out"
                >
                  <LabelList dataKey="commercial" content={<CustomLabel />} />
                </Bar>
                <Bar
                  dataKey="property"
                  fill="#a0a0a0"
                  stackId="a"
                  animationDuration={1500}
                  animationEasing="ease-out"
                >
                  <LabelList dataKey="property" content={<CustomLabel />} />
                </Bar>
                <Bar
                  dataKey="construction"
                  fill="#909090"
                  stackId="a"
                  animationDuration={1500}
                  animationEasing="ease-out"
                >
                  <LabelList dataKey="construction" content={<CustomLabel />} />
                </Bar>
                <Bar
                  dataKey="employment"
                  fill="#808080"
                  stackId="a"
                  animationDuration={1500}
                  animationEasing="ease-out"
                >
                  <LabelList dataKey="employment" content={<CustomLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : selectedEnquiry ? (
          renderDetailView(selectedEnquiry)
        ) : (
          <>
            {filteredEnquiries.length === 0 ? (
              <Text
                variant="medium"
                styles={{
                  root: {
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    fontFamily: 'Raleway, sans-serif',
                  },
                }}
              >
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
                color: isDarkMode ? colours.dark.subText : colours.light.subText,
                display: 'inline',
                fontFamily: 'Raleway, sans-serif',
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
          <Text
            variant="xxLarge"
            styles={{
              root: {
                fontWeight: '700',
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontFamily: 'Raleway, sans-serif',
              },
            }}
          >
            Rate Enquiry
          </Text>
          <Text
            variant="medium"
            styles={{
              root: {
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontFamily: 'Raleway, sans-serif',
              },
            }}
          >
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

  function containerStyle(isDarkMode: boolean) {
    return mergeStyles({
      padding: '20px',
      backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
      minHeight: '100vh',
      fontFamily: 'Raleway, sans-serif',
      paddingBottom: '100px',
    });
  }

  function footerStyle(isDarkMode: boolean) {
    return mergeStyles({
      padding: '20px',
      backgroundColor: isDarkMode ? colours.dark.footerBackground : colours.light.footerBackground,
      textAlign: 'center',
      borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
      position: 'fixed',
      bottom: 0,
      width: '100%',
    });
  }
};

export default Enquiries;
