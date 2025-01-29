// D:/helix projects/workspace/tab apps/helix hub v1/src/tabs/enquiries/Enquiries.tsx

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
  initializeIcons,
} from '@fluentui/react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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
import AreaCountCard from './AreaCountCard';
import 'rc-slider/assets/index.css';
import Slider from 'rc-slider';

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
  otherUnsure: number;
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
    width: '100%',
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
    fontFamily: 'Raleway, sans-serif',
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
    fontFamily: 'Raleway, sans-serif',
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
            <Icon
              iconName="Cancel"
              styles={{ root: { fontSize: '20px', color: isDarkMode ? colours.dark.text : colours.light.text } }}
            />
          ) : (
            <Icon
              iconName="Search"
              styles={{ root: { fontSize: '20px', color: isDarkMode ? colours.dark.text : colours.light.text } }}
            />
          )}
        </div>
        <div className={searchBoxStyles}>
          <SearchBox
            placeholder="Search..."
            value={searchTerm}
            onChange={(_, newValue) => setSearchTerm(newValue || '')}
            underlined
            styles={{ root: { fontFamily: 'Raleway, sans-serif' } }}
          />
        </div>
      </Stack>
    </div>
  );
};

interface CustomLabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number;
  dataKey: string;
  isDarkMode: boolean;
}

/**
 * We'll keep the same approach for the label outline,
 * but lighten the text color in light mode to keep it readable.
 */
const CustomLabel: React.FC<CustomLabelProps> = ({ x, y, width, height, value, dataKey, isDarkMode }) => {
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    typeof value !== 'number'
  ) {
    return null;
  }

  const color = areaColor(dataKey);
  const bubbleWidth = 50;
  const bubbleHeight = 25;
  const bubbleX = x + width / 2 - bubbleWidth / 2;
  const bubbleY = y + height / 2 - bubbleHeight / 2;

  // Lightening the text color in light mode for contrast inside the outlined bubble
  const textFill = isDarkMode ? '#fff' : '#333';

  return (
    <g>
      <rect
        x={bubbleX}
        y={bubbleY}
        width={bubbleWidth}
        height={bubbleHeight}
        fill="none"
        stroke={color}
        strokeWidth={2}
        rx={8}
        ry={8}
      />
      <text
        x={x + width / 2}
        y={y + height / 2 + 5}
        textAnchor="middle"
        fill={textFill}
        fontSize="12"
        fontFamily="Raleway, sans-serif"
      >
        {value}
      </text>
    </g>
  );
};

/**
 * Custom shape for bars to add a subtle inner/outer shadow using a filter.
 * We'll define a filter in <defs> and reference it here.
 */
const CustomBarShape: React.FC<any> = (props) => {
  const { x, y, width, height } = props;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={colours.grey} // fill is the Helix "grey"
      filter="url(#barShadow)"
    />
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
      } else {
        setTeamDataError('Failed to fetch team data.');
      }
      setIsTeamDataLoading(false);
    }
    loadTeamData();
  }, []);

  const handleSubTabChange = useCallback(
    (item?: PivotItem) => {
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
    async (id: string, newRating: string) => {
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
          setLocalEnquiries((prev) =>
            prev.map((enq) => (enq.ID === id ? { ...enq, Rating: newRating as Enquiry['Rating'] } : enq))
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

  // Fetch POID data if not loaded
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

  // Figure out converted enquiries
  useEffect(() => {
    if (poidData && localEnquiries.length > 0) {
      const converted = localEnquiries.filter((enq) =>
        poidData.some((poid) => String(poid.acid) === enq.ID)
      );
      setConvertedEnquiriesList(converted);
      const convertedPoid = poidData.filter((poid) =>
        localEnquiries.some((enq) => enq.ID === String(poid.acid))
      );
      setConvertedPoidDataList(convertedPoid);
    }
  }, [poidData, localEnquiries]);

  // Determine date range for the slider
  useEffect(() => {
    if (localEnquiries.length > 0) {
      const validDates = localEnquiries
        .map((enq) => enq.Touchpoint_Date)
        .filter((d): d is string => typeof d === 'string' && isValid(parseISO(d)))
        .map((d) => parseISO(d));
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

  // Sort local enquiries
  const sortedEnquiries = useMemo(() => {
    return [...localEnquiries].sort((a, b) => {
      const dateA = parseISO(a.Touchpoint_Date || '');
      const dateB = parseISO(b.Touchpoint_Date || '');
      return dateB.getTime() - dateA.getTime();
    });
  }, [localEnquiries]);

  // Filter out invalid dates
  const sortedValidEnquiries = useMemo(() => {
    return sortedEnquiries.filter((enq) => enq.Touchpoint_Date && isValid(parseISO(enq.Touchpoint_Date)));
  }, [sortedEnquiries]);

  // Adjust slider end if we have valid enquiries
  useEffect(() => {
    if (sortedValidEnquiries.length > 0) {
      setCurrentSliderEnd(sortedValidEnquiries.length - 1);
    }
  }, [sortedValidEnquiries.length]);

  // Slice enquiries based on slider range
  const enquiriesInSliderRange = useMemo(() => {
    return sortedValidEnquiries.slice(currentSliderStart, currentSliderEnd + 1);
  }, [sortedValidEnquiries, currentSliderStart, currentSliderEnd]);

  // Tally monthly counts for chart
  const monthlyEnquiryCounts = useMemo(() => {
    const counts: { [month: string]: MonthlyCount } = {};
    enquiriesInSliderRange.forEach((enq) => {
      if (enq.Touchpoint_Date && enq.Area_of_Work) {
        const date = parseISO(enq.Touchpoint_Date);
        if (!isValid(date)) return;
        const monthStart = startOfMonth(date);
        const monthLabel = format(monthStart, 'MMM yyyy');
        const area = enq.Area_of_Work.toLowerCase();
        if (!counts[monthLabel]) {
          counts[monthLabel] = {
            month: monthLabel,
            commercial: 0,
            construction: 0,
            employment: 0,
            property: 0,
            otherUnsure: 0,
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
            counts[monthLabel].otherUnsure += 1;
            break;
        }
      }
    });
    const sortedMonths = Object.keys(counts).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return sortedMonths.map((m) => counts[m]);
  }, [enquiriesInSliderRange]);

  const triagedPointOfContactEmails = useMemo(
    () =>
      [
        'automations@helix-law.com',
        'commercial@helix-law.com',
        'construction@helix-law.com',
        'employment@helix-law.com',
        'property@helix-law.com',
      ].map((e) => e.toLowerCase()),
    []
  );

  // Filtering logic
  const filteredEnquiries = useMemo(() => {
    let filtered = enquiriesInSliderRange;
    if (activeMainTab === 'All') {
      // do nothing
    } else {
      switch (activeMainTab) {
        case 'Claimed':
          filtered = filtered.filter(
            (e) => e.Point_of_Contact?.toLowerCase() === (context?.userPrincipalName || '').toLowerCase()
          );
          break;
        case 'Converted':
          if (context && context.userPrincipalName) {
            const userEmail = context.userPrincipalName.toLowerCase();
            const userFilteredEnquiryIds = convertedPoidDataList
              .filter((p) => p.poc?.toLowerCase() === userEmail)
              .map((p) => String(p.acid));
            filtered = convertedEnquiriesList.filter((enq) => userFilteredEnquiryIds.includes(enq.ID));
          } else {
            filtered = convertedEnquiriesList;
          }
          break;
        case 'Claimable':
          filtered = filtered.filter((enq) => enq.Point_of_Contact?.toLowerCase() === 'team@helix-law.com');
          break;
        case 'Triaged':
          filtered = filtered.filter(
            (enq) =>
              enq.Point_of_Contact && triagedPointOfContactEmails.includes(enq.Point_of_Contact.toLowerCase())
          );
          break;
        default:
          break;
      }
    }
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (en) =>
          `${en.First_Name} ${en.Last_Name}`.toLowerCase().includes(lowerSearchTerm) ||
          en.Email?.toLowerCase().includes(lowerSearchTerm) ||
          (en.Company && en.Company.toLowerCase().includes(lowerSearchTerm))
      );
    }
    if (selectedArea) {
      filtered = filtered.filter(
        (enq) => enq.Area_of_Work && enq.Area_of_Work.toLowerCase() === selectedArea.toLowerCase()
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
  const currentEnquiries = useMemo(() => filteredEnquiries.slice(indexOfFirstEnquiry, indexOfLastEnquiry), [
    filteredEnquiries,
    indexOfFirstEnquiry,
    indexOfLastEnquiry,
  ]);
  const totalPages = Math.ceil(filteredEnquiries.length / enquiriesPerPage);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // rating radio
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
        'Ok contact, matter or person/prospect possibly of interest but not an ideal fit. Uncertain will instruct us.',
    },
    {
      key: 'Poor',
      text: 'Poor',
      description:
        'Poor quality. Very unlikely to instruct us. Prospect or matter not a good fit. Time waster or irrelevant issue.',
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
              <Text
                variant="mediumPlus"
                styles={{
                  root: {
                    fontWeight: 600,
                    color: colours.highlight,
                    fontFamily: 'Raleway, sans-serif',
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
                  fontFamily: 'Raleway, sans-serif',
                },
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
      setLocalEnquiries((prev) =>
        prev.map((enq) => (enq.ID === updatedEnquiry.ID ? updatedEnquiry : enq))
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
            fontFamily: 'Raleway, sans-serif',
          },
        }}
      >
        <Stack horizontal horizontalAlign="space-between" verticalAlign="center" className={mergeStyles({ marginBottom: '20px' })}>
          <IconButton
            iconProps={{ iconName: 'Back' }}
            title="Back"
            ariaLabel="Back"
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
              fontFamily: 'Raleway, sans-serif',
            },
            linkIsSelected: { borderBottom: 'none' },
          }}
          aria-label="Detail Sub-Tabs"
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

  // No user gating for these score cards, so remove the AC/JW/LZ check
  const enquiriesCountPerMember = useMemo(() => {
    if (!enquiriesInSliderRange || !teamData) return [];
    const grouped: { [email: string]: number } = {};
    enquiriesInSliderRange.forEach((enq) => {
      const pocEmail = enq.Point_of_Contact?.toLowerCase();
      if (pocEmail) {
        grouped[pocEmail] = (grouped[pocEmail] || 0) + 1;
      }
    });
    const counts: { initials: string; count: number }[] = [];
    teamData.forEach((member) => {
      const memberEmail = member['Email']?.toLowerCase();
      const memberRole = member['Role']?.toLowerCase();
      if (memberEmail && grouped[memberEmail] && memberRole !== 'non-solicitor') {
        counts.push({
          initials: member['Initials'] || '',
          count: grouped[memberEmail],
        });
      }
    });
    counts.sort((a, b) => b.count - a.count);
    return counts;
  }, [enquiriesInSliderRange, teamData]);

  const enquiriesCountPerArea = useMemo(() => {
    const c: { [key: string]: number } = {
      Commercial: 0,
      Property: 0,
      Construction: 0,
      Employment: 0,
      'Other/Unsure': 0,
    };
    enquiriesInSliderRange.forEach((enq) => {
      const area = enq.Area_of_Work?.toLowerCase();
      if (area === 'commercial') {
        c.Commercial += 1;
      } else if (area === 'property') {
        c.Property += 1;
      } else if (area === 'construction') {
        c.Construction += 1;
      } else if (area === 'employment') {
        c.Employment += 1;
      } else {
        c['Other/Unsure'] += 1;
      }
    });
    return c;
  }, [enquiriesInSliderRange]);

  const loggedInUserInitials = useMemo(() => {
    if (userData && userData.length > 0) {
      return userData[0].Initials || '';
    }
    return '';
  }, [userData]);

  const getMonthlyCountByArea = (monthData: MonthlyCount, area: string): number => {
    switch (area.toLowerCase()) {
      case 'commercial':
        return monthData.commercial;
      case 'property':
        return monthData.property;
      case 'construction':
        return monthData.construction;
      case 'employment':
        return monthData.employment;
      case 'other/unsure':
        return monthData.otherUnsure;
      default:
        return 0;
    }
  };

  function getAreaIcon(area: string): string {
    switch (area.toLowerCase()) {
      case 'commercial':
        return 'KnowledgeArticle';
      case 'property':
        return 'CityNext';
      case 'construction':
        return 'ConstructionCone';
      case 'employment':
        return 'People';
      case 'other/unsure':
        return 'Help';
      default:
        return 'Question';
    }
  }

  function getAreaColor(area: string): string {
    switch (area.toLowerCase()) {
      case 'commercial':
        return colours.blue;
      case 'construction':
        return colours.orange;
      case 'property':
        return colours.green;
      case 'employment':
        return colours.yellow;
      case 'other/unsure':
        return '#E53935';
      default:
        return colours.cta;
    }
  }

  const renderCustomLegend = (props: any) => {
    const { payload } = props;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', fontFamily: 'Raleway, sans-serif' }}>
        {payload.map((entry: any, index: number) => (
          <div key={`legend-item-${index}`} style={{ display: 'flex', alignItems: 'center', marginRight: 20 }}>
            <div
              style={{
                width: 12,
                height: 12,
                backgroundColor: areaColor(entry.value),
                marginRight: 8,
              }}
            />
            <span style={{ color: isDarkMode ? colours.dark.text : colours.light.text, fontWeight: 500 }}>
              {entry.value.charAt(0).toUpperCase() + entry.value.slice(1)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      <div className={mergeStyles({ width: '100%' })}>
        {!selectedEnquiry && (
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
        )}
      </div>

      {!selectedEnquiry && !selectedArea && !activeMainTab && (
        <Stack
          tokens={{ childrenGap: 20 }}
          styles={{
            root: {
              backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#fff',
              padding: '30px',
              borderRadius: '12px',
              boxShadow: isDarkMode
                ? '0 4px 16px rgba(0, 0, 0, 0.6)'
                : '0 4px 16px rgba(0, 0, 0, 0.1)',
              marginBottom: '20px',
              fontFamily: 'Raleway, sans-serif',
            },
          }}
        >
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
                horizontalAlign="center"
                tokens={{ childrenGap: 20 }}
                style={{ marginBottom: '20px' }}
              >
                <Stack tokens={{ childrenGap: 5 }} verticalAlign="center" style={{ fontFamily: 'Raleway, sans-serif' }}>
                  {/* Show Dates Above Slider */}
                  <Text
                    variant="mediumPlus"
                    styles={{
                      root: {
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        fontFamily: 'Raleway, sans-serif',
                        fontWeight: 600,
                        textAlign: 'center', // Ensure center alignment
                        width: '100%', // Match slider width
                      },
                    }}
                  >
                    {sortedValidEnquiries[currentSliderEnd]?.Touchpoint_Date
                      ? format(parseISO(sortedValidEnquiries[currentSliderEnd].Touchpoint_Date), 'dd MMM yyyy')
                      : ''}
                    {' - '}
                    {sortedValidEnquiries[currentSliderStart]?.Touchpoint_Date
                      ? format(parseISO(sortedValidEnquiries[currentSliderStart].Touchpoint_Date), 'dd MMM yyyy')
                      : ''}
                  </Text>

                  {/* Reverse the slider scale so that oldest is on the left, newest on the right */}
                  <Slider
                    range
                    min={0} // Newest date (reversed)
                    max={sortedValidEnquiries.length - 1} // Oldest date (reversed)
                    value={[sortedValidEnquiries.length - 1 - currentSliderEnd, sortedValidEnquiries.length - 1 - currentSliderStart]}
                    onChange={(value) => {
                      if (Array.isArray(value)) {
                        setCurrentSliderStart(sortedValidEnquiries.length - 1 - value[1]); // Reverse mapping
                        setCurrentSliderEnd(sortedValidEnquiries.length - 1 - value[0]); // Reverse mapping
                      }
                    }}
                    trackStyle={[{ backgroundColor: colours.highlight, height: 8 }]}
                    handleStyle={[
                      {
                        backgroundColor: colours.highlight,
                        borderColor: colours.highlight,
                        height: 20,
                        width: 20,
                        transform: 'translateX(-50%)', // Keep handle centers aligned
                      },
                      {
                        backgroundColor: colours.highlight,
                        borderColor: colours.highlight,
                        height: 20,
                        width: 20,
                        transform: 'translateX(-50%)', // Keep handle centers aligned
                      },
                    ]}
                    railStyle={{
                      backgroundColor: isDarkMode ? colours.dark.border : colours.inactiveTrackLight,
                      height: 8,
                    }}
                    style={{ width: 500, margin: '0 auto' }}
                  />
                </Stack>

              </Stack>

              <Stack
                horizontal
                horizontalAlign="stretch"
                tokens={{ childrenGap: 20 }}
                style={{ width: '100%', marginBottom: '20px' }}
              >
                {['Commercial', 'Property', 'Construction', 'Employment', 'Other/Unsure'].map((area) => (
                  <AreaCountCard
                    key={area}
                    area={area}
                    count={enquiriesCountPerArea[area]}
                    monthlyCounts={monthlyEnquiryCounts.map((m) => ({
                      month: m.month,
                      count: getMonthlyCountByArea(m, area),
                    }))}
                    icon={getAreaIcon(area)}
                    color={getAreaColor(area)}
                    animationDelay={0.2}
                  />
                ))}
              </Stack>

              <Stack horizontal horizontalAlign="center" wrap styles={{ root: { width: '100%' } }}>
                {enquiriesCountPerMember.map((member, idx) => (
                  <React.Fragment key={member.initials}>
                    <Stack
                      horizontalAlign="center"
                      styles={{
                        root: {
                          minWidth: '80px', // Ensures consistent spacing
                          textAlign: 'center',
                        },
                      }}
                    >
                      <Text
                        variant="xLarge"
                        styles={{
                          root: {
                            fontWeight: 600,
                            color: colours.highlight,
                            fontFamily: 'Raleway, sans-serif',
                          },
                        }}
                      >
                        {member.count}
                      </Text>
                      <Text
                        variant="small"
                        styles={{
                          root: {
                            fontWeight: 400,
                            marginTop: '4px',
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            fontFamily: 'Raleway, sans-serif',
                          },
                        }}
                      >
                        {member.initials}
                      </Text>
                    </Stack>

                    {idx < enquiriesCountPerMember.length - 1 && (
                      <div
                        style={{
                          width: '2px',
                          backgroundColor: isDarkMode ? colours.dark.border : '#ccc',
                          height: '50px', // Makes pipes taller
                          alignSelf: 'center',
                          margin: '0 20px',
                        }}
                      />
                    )}
                  </React.Fragment>
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
              No results found for any team member.
            </Text>
          )}
        </Stack>
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
        {/* Main Chart Container with Extra Height */}
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
            <ResponsiveContainer width="100%" height={500}>
              <BarChart
                data={monthlyEnquiryCounts}
                margin={{ top: 20, right: 30, left: 20, bottom: 40 }}
                style={{ fontFamily: 'Raleway, sans-serif' }}
              >
                {/* A filter for subtle shadow on each bar */}
                <defs>
                  <filter id="barShadow" x="-10%" y="-10%" width="130%" height="130%">
                    <feOffset dx="0" dy="0" in="SourceAlpha" result="shadowOffsetOuter" /> {/* Removed dy=1 */}
                    <feGaussianBlur stdDeviation="2" in="shadowOffsetOuter" result="shadowBlurOuter" />
                    <feComposite
                      in="shadowBlurOuter"
                      in2="SourceAlpha"
                      operator="out"
                      result="shadowBlurOuter"
                    />
                    <feColorMatrix
                      in="shadowBlurOuter"
                      type="matrix"
                      values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0   0 0 0 0.3 0"
                      result="shadowBlurOuter"
                    />
                    <feComposite in="shadowBlurOuter" in2="SourceGraphic" operator="over" />
                  </filter>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? colours.dark.border : '#e0e0e0'} />

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
                <Legend content={renderCustomLegend} />

                {/* Bars */}
                <Bar
                  dataKey="commercial"
                  shape={<CustomBarShape />}
                  animationDuration={1500}
                  animationEasing="ease-out"
                >
                  <LabelList
                    dataKey="commercial"
                    content={(props) => (
                      <CustomLabel
                        {...props}
                        value={typeof props.value === 'number' ? props.value : undefined}
                        isDarkMode={isDarkMode}
                        dataKey="commercial"
                      />
                    )}
                  />
                </Bar>
                <Bar
                  dataKey="property"
                  shape={<CustomBarShape />}
                  animationDuration={1500}
                  animationEasing="ease-out"
                >
                  <LabelList
                    dataKey="property"
                    content={(props) => (
                      <CustomLabel
                        {...props}
                        value={typeof props.value === 'number' ? props.value : undefined}
                        isDarkMode={isDarkMode}
                        dataKey="property"
                      />
                    )}
                  />
                </Bar>
                <Bar
                  dataKey="construction"
                  shape={<CustomBarShape />}
                  animationDuration={1500}
                  animationEasing="ease-out"
                >
                  <LabelList
                    dataKey="construction"
                    content={(props) => (
                      <CustomLabel
                        {...props}
                        value={typeof props.value === 'number' ? props.value : undefined}
                        isDarkMode={isDarkMode}
                        dataKey="construction"
                      />
                    )}
                  />
                </Bar>
                <Bar
                  dataKey="employment"
                  shape={<CustomBarShape />}
                  animationDuration={1500}
                  animationEasing="ease-out"
                >
                  <LabelList
                    dataKey="employment"
                    content={(props) => (
                      <CustomLabel
                        {...props}
                        value={typeof props.value === 'number' ? props.value : undefined}
                        isDarkMode={isDarkMode}
                        dataKey="employment"
                      />
                    )}
                  />
                </Bar>
                <Bar
                  dataKey="otherUnsure"
                  shape={<CustomBarShape />}
                  animationDuration={1500}
                  animationEasing="ease-out"
                >
                  <LabelList
                    dataKey="otherUnsure"
                    content={(props) => (
                      <CustomLabel
                        {...props}
                        value={typeof props.value === 'number' ? props.value : undefined}
                        isDarkMode={isDarkMode}
                        dataKey="otherUnsure"
                      />
                    )}
                  />
                </Bar>

                {/* Moved XAxis here, after Bars */}
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
                No results found matching your criteria.
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
        aria-labelledby="rate-modal"
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
            Rate
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
            Please select a rating:
          </Text>
          {renderRatingOptions()}
          <Stack horizontal tokens={{ childrenGap: 15 }} horizontalAlign="end">
            <PrimaryButton
              text="Submit"
              onClick={submitRating}
              disabled={!currentRating}
              styles={{ root: { fontFamily: 'Raleway, sans-serif' } }}
            />
            <DefaultButton text="Cancel" onClick={closeRateModal} styles={{ root: { fontFamily: 'Raleway, sans-serif' } }} />
          </Stack>
        </Stack>
      </Modal>
    </div>
  );

  function containerStyle(dark: boolean) {
    return mergeStyles({
      width: '100%',
      padding: '20px',
      backgroundColor: dark ? colours.dark.background : colours.light.background,
      minHeight: '100vh',
      fontFamily: 'Raleway, sans-serif',
      paddingBottom: '100px',
    });
  }
};

export default Enquiries;
