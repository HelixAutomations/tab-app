
import React, { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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
  initializeIcons,
} from '@fluentui/react';
import {
  BarChart,
  Bar,
  CartesianGrid,
// invisible change
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
  XAxis,
  YAxis,
} from 'recharts';
import { parseISO, startOfMonth, format, isValid } from 'date-fns';
import { Enquiry, UserData, POID } from '../../app/functionality/types';
import CustomPagination from '../../app/styles/CustomPagination';
import EnquiryCard from './EnquiryCard';
import EnquiryOverview from './EnquiryOverview';
import PitchBuilder from './PitchBuilder';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigator } from '../../app/functionality/NavigatorContext';
import UnclaimedEnquiries from './UnclaimedEnquiries';
import { Pivot, PivotItem } from '@fluentui/react';
import { Context as TeamsContextType } from '@microsoft/teams-js';
import AreaCountCard from './AreaCountCard';
import EnquiriesMenu from './EnquiriesMenu';
import 'rc-slider/assets/index.css';
import Slider from 'rc-slider';

initializeIcons();

interface TeamData {
  'Created Date'?: string;
  'Created Time'?: string;
  'Full Name'?: string;
  'Last'?: string;
  'First'?: string;
  'Nickname'?: string;
  'Initials'?: string;
  'Email'?: string;
  'Entra ID'?: string;
  'Clio ID'?: string;
  'Rate'?: number;
  'Role'?: string;
  'AOW'?: string;
}

interface MonthlyCount {
  month: string;
  commercial: number;
  construction: number;
  employment: number;
  property: number;
  otherUnsure: number;
}

interface CustomLabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number;
  dataKey: string;
  isDarkMode: boolean;
}

const CustomLabel: React.FC<CustomLabelProps> = ({
  x,
  y,
  width,
  height,
  value,
  dataKey,
  isDarkMode,
}) => {
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    typeof value !== 'number'
  ) {
    return null;
  }

  const textFill = isDarkMode ? '#fff' : '#333';

  return (
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
  );
};

const CustomBarShape: React.FC<any> = (props) => {
  const { x, y, width, height } = props;
  const { isDarkMode } = useTheme();
  const fillColor = isDarkMode ? colours.dark.border : '#d0d0d0';
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={2}
      fill={fillColor}
    />
  );
};

interface EnquiriesProps {
  context: TeamsContextType | null;
  enquiries: Enquiry[] | null;
  userData: UserData[] | null;
  poidData: POID[];
  setPoidData: React.Dispatch<React.SetStateAction<POID[]>>;
  teamData?: TeamData[] | null;
}

const Enquiries: React.FC<EnquiriesProps> = ({
  context,
  enquiries,
  userData,
  poidData,
  setPoidData,
  teamData,
}) => {
  const [localEnquiries, setLocalEnquiries] = useState<Enquiry[]>(enquiries || []);
  const { isDarkMode } = useTheme();
  const { setContent } = useNavigator();
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  // Removed pagination states
  // const [currentPage, setCurrentPage] = useState<number>(1);
  // const enquiriesPerPage = 12;

  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false);
  const [currentRating, setCurrentRating] = useState<string>('');
  const [ratingEnquiryId, setRatingEnquiryId] = useState<string | null>(null);
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [showAll, setShowAll] = useState<boolean>(false);
  const [activeMainTab, setActiveMainTab] = useState<string>('Claimed');
  const [activeSubTab, setActiveSubTab] = useState<string>('Overview');
  const [showUnclaimedBoard, setShowUnclaimedBoard] = useState<boolean>(false);
  const [convertedEnquiriesList, setConvertedEnquiriesList] = useState<Enquiry[]>([]);
  const [convertedPoidDataList, setConvertedPoidDataList] = useState<POID[]>([]);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ oldest: string; newest: string } | null>(null);
  const [isSearchActive, setSearchActive] = useState<boolean>(false);

  const [currentSliderStart, setCurrentSliderStart] = useState<number>(0);
  const [currentSliderEnd, setCurrentSliderEnd] = useState<number>(0);

  // Added for infinite scroll
  const [itemsToShow, setItemsToShow] = useState<number>(20);
  const loader = useRef<HTMLDivElement | null>(null);
  const previousMainTab = useRef<string>('Claimed');

  const toggleDashboard = useCallback(() => {
    if (activeMainTab === '') {
      setActiveMainTab(previousMainTab.current || 'Claimed');
    } else {
      previousMainTab.current = activeMainTab;
      setActiveMainTab('');
    }
  }, [activeMainTab]);

  useEffect(() => {
    const flag = sessionStorage.getItem('openUnclaimedEnquiries');
    if (flag === 'true') {
      setShowUnclaimedBoard(true);
      sessionStorage.removeItem('openUnclaimedEnquiries');
    }
  }, []);

  const toggleUnclaimedBoard = useCallback(() => {
    setShowUnclaimedBoard((prev) => !prev);
  }, []);

  useEffect(() => {
    if (localEnquiries.length > 0) {
      const validDates = localEnquiries
        .map((enq) => enq.Touchpoint_Date)
        .filter((d): d is string => typeof d === 'string' && isValid(parseISO(d)))
        .map((d) => parseISO(d));
      if (validDates.length > 0) {
        const oldestDate = new Date(Math.min(...validDates.map((date) => date.getTime())));
        const newestDate = new Date(Math.max(...validDates.map((date) => date.getTime())));
        setDateRange({
          oldest: format(oldestDate, 'dd MMM yyyy'),
          newest: format(newestDate, 'dd MMM yyyy'),
        });
        setCurrentSliderStart(0);
        setCurrentSliderEnd(validDates.length - 1);
      }
    } else {
      setDateRange(null);
    }
  }, [localEnquiries]);

  const sortedEnquiries = useMemo(() => {
    return [...localEnquiries].sort((a, b) => {
      const dateA = parseISO(a.Touchpoint_Date || '');
      const dateB = parseISO(b.Touchpoint_Date || '');
      return dateA.getTime() - dateB.getTime();
    });
  }, [localEnquiries]);

  const unclaimedEnquiries = useMemo(
    () =>
      localEnquiries.filter(
        (e) => e.Point_of_Contact?.toLowerCase() === 'team@helix-law.com'
      ),
    [localEnquiries]
  );

  const sortedValidEnquiries = useMemo(() => {
    return sortedEnquiries.filter(
      (enq) => enq.Touchpoint_Date && isValid(parseISO(enq.Touchpoint_Date))
    );
  }, [sortedEnquiries]);

  useEffect(() => {
    if (sortedValidEnquiries.length > 0) {
      setCurrentSliderEnd(sortedValidEnquiries.length - 1);
    }
  }, [sortedValidEnquiries.length]);

  const enquiriesInSliderRange = useMemo(() => {
    return sortedValidEnquiries.slice(currentSliderStart, currentSliderEnd + 1);
  }, [sortedValidEnquiries, currentSliderStart, currentSliderEnd]);

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

    const sortedMonths = Object.keys(counts).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );
    return sortedMonths.map((m) => counts[m]);
  }, [enquiriesInSliderRange]);

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

  const handleSubTabChange = useCallback((item?: PivotItem) => {
    if (item) {
      setActiveSubTab(item.props.itemKey as string);
    }
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

  const closeRateModal = useCallback(() => {
    setIsRateModalOpen(false);
    setRatingEnquiryId(null);
    setCurrentRating('');
  }, []);

  const handleEditRating = useCallback(async (id: string, newRating: string) => {
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
          prev.map((enq) =>
            enq.ID === id ? { ...enq, Rating: newRating as Enquiry['Rating'] } : enq
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
      ].map((e) => e.toLowerCase()),
    []
  );

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
            filtered = convertedEnquiriesList.filter((enq) =>
              userFilteredEnquiryIds.includes(enq.ID)
            );
          } else {
            filtered = convertedEnquiriesList;
          }
          break;
        case 'Claimable':
          filtered = filtered.filter(
            (enq) => enq.Point_of_Contact?.toLowerCase() === 'team@helix-law.com'
          );
          break;
        case 'Triaged':
          filtered = filtered.filter(
            (enq) =>
              enq.Point_of_Contact &&
              triagedPointOfContactEmails.includes(enq.Point_of_Contact.toLowerCase())
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

  // Removed pagination logic
  // const indexOfLastEnquiry = currentPage * enquiriesPerPage;
  // const indexOfFirstEnquiry = indexOfLastEnquiry - enquiriesPerPage;
  // const currentEnquiries = useMemo(
  //   () => filteredEnquiries.slice(indexOfFirstEnquiry, indexOfLastEnquiry),
  //   [filteredEnquiries, indexOfFirstEnquiry, indexOfLastEnquiry]
  // );
  // const totalPages = Math.ceil(filteredEnquiries.length / enquiriesPerPage);

  // Added for infinite scroll
  const displayedEnquiries = useMemo(() => {
          return [...filteredEnquiries].reverse().slice(0, itemsToShow);
    }, [filteredEnquiries, itemsToShow]);

  const handleLoadMore = useCallback(() => {
    setItemsToShow((prev) => Math.min(prev + 20, filteredEnquiries.length));
  }, [filteredEnquiries.length]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setItemsToShow((prev) => Math.min(prev + 20, filteredEnquiries.length));
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
    }, 100); // Small delay ensures `filteredEnquiries` is set before attaching
  
    return () => {
      clearTimeout(timeoutId);
      if (loader.current) {
        observer.unobserve(loader.current);
      }
    };
  }, [filteredEnquiries, itemsToShow]);
  const handleSetActiveState = useCallback(
    (key: string) => {
      if (key !== '') {
        previousMainTab.current = key;
      }
      setActiveMainTab(key);
      setActiveSubTab('Overview');
      setItemsToShow(20);
      setTimeout(() => {
        setItemsToShow((prev) =>
          Math.min(prev + 40, filteredEnquiries.length)
        );
      }, 200);
    },
    [filteredEnquiries.length]
  );

  const ACTION_BAR_HEIGHT = 48;

  const backButtonStyle = mergeStyles({
    width: 32,
    height: 32,
    borderRadius: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#f3f3f3',
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    marginRight: 8,
  });

  function detailNavStyle(dark: boolean) {
    return mergeStyles({
      backgroundColor: dark ? colours.dark.sectionBackground : colours.light.sectionBackground,
      boxShadow: dark ? '0 2px 4px rgba(0,0,0,0.4)' : '0 2px 4px rgba(0,0,0,0.1)',
      borderTop: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
      padding: '0 24px',
      display: 'flex',
      flexDirection: 'row',
      gap: '8px',
      alignItems: 'center',
      height: ACTION_BAR_HEIGHT,
      position: 'sticky',
      top: ACTION_BAR_HEIGHT,
      zIndex: 999,
    });
  }

  useLayoutEffect(() => {
    if (!selectedEnquiry) {
      setContent(
        <EnquiriesMenu
          activeArea={selectedArea}
          setActiveArea={setSelectedArea}
          activeState={activeMainTab}
          setActiveState={handleSetActiveState}
          toggleDashboard={toggleDashboard}
          toggleUnclaimed={toggleUnclaimedBoard}
          unclaimedActive={showUnclaimedBoard}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          isSearchActive={isSearchActive}
          setSearchActive={setSearchActive}
        />
      );
    } else {
      setContent(
        <div className={detailNavStyle(isDarkMode)}>
          <IconButton
            iconProps={{ iconName: 'ChevronLeft' }}
            onClick={handleBackToList}
            className={backButtonStyle}
            title="Back"
            ariaLabel="Back"
          />
          <Pivot
            className="navigatorPivot"
            selectedKey={activeSubTab}
            onLinkClick={handleSubTabChange}
          >
            <PivotItem headerText="Overview" itemKey="Overview" />
            <PivotItem headerText="Pitch Builder" itemKey="Pitch" />
          </Pivot>
        </div>
      );
    }
    return () => setContent(null);
  }, [
    setContent,
    selectedEnquiry,
    selectedArea,
    activeMainTab,
    searchTerm,
    isSearchActive,
    handleSetActiveState,
    isDarkMode,
    activeSubTab,
    handleSubTabChange,
    handleBackToList,
  ]);

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
                onChange={(e) => setCurrentRating(e.target.value)}
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
    );
  }, [currentRating, isDarkMode, ratingOptions]);

  const renderDetailView = useCallback(
    (enquiry: Enquiry) => (
      <Stack
        tokens={{ childrenGap: 12 }}
        styles={{
          root: {
            backgroundColor: isDarkMode
              ? colours.dark.sectionBackground
              : colours.light.sectionBackground,
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            padding: 20,
            fontFamily: 'Raleway, sans-serif',
          },
        }}
      >
        {activeSubTab === 'Overview' && (
          <EnquiryOverview enquiry={enquiry} onEditRating={handleRate} onEditNotes={() => { }} />
        )}
        {activeSubTab === 'Pitch' && (
          <PitchBuilder enquiry={enquiry} userData={userData} />
        )}
      </Stack>
    ),
    [handleRate, isDarkMode, activeSubTab, userData]
  );

  const calculateAnimationDelay = (row: number, col: number) => {
    const delayPerRow = 0.2;
    const delayPerCol = 0.1;
    return row * delayPerRow + col * delayPerCol;
  };

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
      const memberEmail = member.Email?.toLowerCase();
      const memberRole = member.Role?.toLowerCase();
      if (memberEmail && grouped[memberEmail] && memberRole !== 'non-solicitor') {
        counts.push({
          initials: member.Initials || '',
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
          <div
            key={`legend-item-${index}`}
            style={{ display: 'flex', alignItems: 'center', marginRight: 20 }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                backgroundColor: getAreaColor(entry.value),
                marginRight: 8,
              }}
            />
            <span
              style={{
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontWeight: 500,
              }}
            >
              {entry.value.charAt(0).toUpperCase() + entry.value.slice(1)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      <div className={mergeStyles({ width: '100%' })}></div>

      {showUnclaimedBoard ? (
        <UnclaimedEnquiries
          enquiries={unclaimedEnquiries}
          onSelect={handleSelectEnquiry}
        />
      ) : (
        !selectedEnquiry &&
        !selectedArea &&
        !activeMainTab && (
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
          <Stack
            horizontalAlign="center"
            tokens={{ childrenGap: 20 }}
            style={{ marginBottom: '20px' }}
          >
              <Stack
              tokens={{ childrenGap: 5 }}
              verticalAlign="center"
              style={{ fontFamily: 'Raleway, sans-serif' }}
              >
              <Text
                variant="mediumPlus"
                styles={{
                  root: {
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontFamily: 'Raleway, sans-serif',
                    fontWeight: 600,
                    textAlign: 'center',
                    width: '100%',
                  },
                }}
                >
                {sortedValidEnquiries[currentSliderEnd]?.Touchpoint_Date
                  ? format(
                    parseISO(sortedValidEnquiries[currentSliderEnd].Touchpoint_Date),
                    'dd MMM yyyy'
                  )
                  : ''}
                {' - '}
                {sortedValidEnquiries[currentSliderStart]?.Touchpoint_Date
                  ? format(
                    parseISO(sortedValidEnquiries[currentSliderStart].Touchpoint_Date),
                    'dd MMM yyyy'
                  )
                  : ''}
              </Text>
              <Slider
                range
                min={0}
                max={sortedValidEnquiries.length - 1}
                value={[
                  sortedValidEnquiries.length - 1 - currentSliderEnd,
                  sortedValidEnquiries.length - 1 - currentSliderStart,
                ]}
                onChange={(value) => {
                  if (Array.isArray(value)) {
                    setCurrentSliderStart(sortedValidEnquiries.length - 1 - value[1]);
                    setCurrentSliderEnd(sortedValidEnquiries.length - 1 - value[0]);
                  }
                }}
                trackStyle={[{ backgroundColor: colours.highlight, height: 8 }]}
                handleStyle={[
                  {
                    backgroundColor: colours.highlight,
                    borderColor: colours.highlight,
                    height: 20,
                    width: 20,
                    transform: 'translateX(-50%)',
                  },
                  {
                    backgroundColor: colours.highlight,
                    borderColor: colours.highlight,
                    height: 20,
                    width: 20,
                    transform: 'translateX(-50%)',
                  },
                ]}
                railStyle={{
                  backgroundColor: isDarkMode
                    ? colours.dark.border
                    : colours.inactiveTrackLight,
                  height: 8,
                }}
                style={{ width: 500, margin: '0 auto' }}
              />

            </Stack>
          </Stack>
          <Stack
            horizontal
            wrap
            horizontalAlign="stretch"
            tokens={{ childrenGap: 20 }}
            style={{ width: '100%', marginBottom: '20px' }}
          >
            {['Commercial', 'Property', 'Construction', 'Employment', 'Other/Unsure'].map(
              (area) => (
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
              )
            )}
          </Stack>
        </Stack>
        )
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
              padding: '30px',
              backgroundColor: isDarkMode
                ? colours.dark.sectionBackground
                : colours.light.sectionBackground,
              borderRadius: '20px',
              boxShadow: isDarkMode
                ? '0 8px 24px rgba(0, 0, 0, 0.5)'
                : '0 8px 24px rgba(0, 0, 0, 0.2)',
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

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isDarkMode ? colours.dark.border : '#e0e0e0'}
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
                    backgroundColor: isDarkMode
                      ? colours.dark.sectionBackground
                      : colours.light.background,
                    border: `1px solid ${
                      isDarkMode ? colours.dark.border : colours.light.border
                    }`,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontFamily: 'Raleway, sans-serif',
                  }}
                  labelStyle={{
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontFamily: 'Raleway, sans-serif',
                  }}
                  itemStyle={{
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontFamily: 'Raleway, sans-serif',
                  }}
                />
                <Legend content={renderCustomLegend} />
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
              <Stack tokens={{ childrenGap: 8 }} horizontalAlign="center">
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
              </Stack>
            ) : (
              <>
                <div
                  className={mergeStyles({
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '20px',
                  })}
                >
                  {displayedEnquiries.map((enquiry, index) => {
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
                        teamData={teamData}
                      />
                    );
                  })}
                </div>
                <div ref={loader} />
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
          backgroundColor: isDarkMode
            ? colours.dark.sectionBackground
            : colours.light.sectionBackground,
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
            <DefaultButton
              text="Cancel"
              onClick={closeRateModal}
              styles={{ root: { fontFamily: 'Raleway, sans-serif' } }}
            />
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
