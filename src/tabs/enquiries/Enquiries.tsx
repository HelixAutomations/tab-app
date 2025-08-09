
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Stack,
  Text,
  Icon,
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
import { Enquiry, POID, UserData } from '../../app/functionality/types';
import EnquiryLineItem from './EnquiryLineItem';
import NewUnclaimedEnquiryCard from './NewUnclaimedEnquiryCard';
import EnquiryApiDebugger from '../../components/EnquiryApiDebugger';
import GroupedEnquiryCard from './GroupedEnquiryCard';
import { GroupedEnquiry, getMixedEnquiryDisplay, isGroupedEnquiry } from './enquiryGrouping';
import PitchBuilder from './PitchBuilder';
import EnquiryCalls from './EnquiryCalls';
import EnquiryEmails from './EnquiryEmails';
import { colours } from '../../app/styles/colours';
import ToggleSwitch from '../../components/ToggleSwitch';
import { hasAdminAccess } from '../../utils/matterNormalization';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigator } from '../../app/functionality/NavigatorContext';
import UnclaimedEnquiries from './UnclaimedEnquiries';
import { Pivot, PivotItem } from '@fluentui/react';
import SegmentedControl from '../../components/filter/SegmentedControl';
import { Context as TeamsContextType } from '@microsoft/teams-js';
import AreaCountCard from './AreaCountCard';
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


  // Use only real enquiries data
  // All normalized enquiries (union of legacy + new) retained irrespective of toggle
  const [allEnquiries, setAllEnquiries] = useState<(Enquiry & { __sourceType: 'new' | 'legacy' })[]>([]);
  // Display subset after applying dataset toggle
  const [displayEnquiries, setDisplayEnquiries] = useState<(Enquiry & { __sourceType: 'new' | 'legacy' })[]>([]);

  // Debug logging
  console.log('Enquiries component - enquiries prop:', enquiries);
  console.log('Enquiries component - displayEnquiries state:', displayEnquiries);
  console.log('Enquiries component - userData:', userData);

  // Navigation state variables  
  // (declaration moved below, only declare once)

  // ...existing code...


  const { isDarkMode } = useTheme();
  const { setContent } = useNavigator();
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  // Removed pagination states
  // const [currentPage, setCurrentPage] = useState<number>(1);
  // const enquiriesPerPage = 12;

  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false);
  const [currentRating, setCurrentRating] = useState<string>('');
  const [ratingEnquiryId, setRatingEnquiryId] = useState<string | null>(null);
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<string>('Pitch');
  const [showUnclaimedBoard, setShowUnclaimedBoard] = useState<boolean>(false);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ oldest: string; newest: string } | null>(null);
  const [isSearchActive, setSearchActive] = useState<boolean>(false);
  const [showGroupedView, setShowGroupedView] = useState<boolean>(true);
  const [showDataInspector, setShowDataInspector] = useState<boolean>(false);
  // Local dataset toggle (legacy vs new direct) analogous to Matters (only in localhost UI for now)
  const [useNewData, setUseNewData] = useState<boolean>(false);
  const isLocalhost = (typeof window !== 'undefined') && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  // Admin check (match Matters logic)
  const userRole = userData?.[0]?.Role || '';
  const userFullName = userData?.[0]?.FullName || '';
  const isAdmin = hasAdminAccess(userRole, userFullName);
  // Debug storage for raw payloads when inspecting
  const [debugRaw, setDebugRaw] = useState<{ legacy?: unknown; direct?: unknown }>({});
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  
  // Navigation state variables  
  const [activeState, setActiveState] = useState<string>('Claimed');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeAreaFilter, setActiveAreaFilter] = useState<string>('All');

  // Detect source type heuristically (keep pure & easily testable)
  const detectSourceType = (enq: Record<string, unknown>): 'new' | 'legacy' => {
    // Heuristics for NEW dataset:
    // 1. Presence of distinctly lower-case schema keys (id + datetime)
    // 2. Presence of pipeline fields 'stage' or 'claim'
    // 3. Absence of ANY spaced legacy keys (e.g. "Display Number") combined with at least one expected lower-case key
    const hasLowerCore = 'id' in enq && 'datetime' in enq;
    const hasPipeline = 'stage' in enq || 'claim' in enq;
    if (hasLowerCore || hasPipeline) return 'new';
    const hasSpacedKey = Object.keys(enq).some(k => k.includes(' '));
    const hasAnyLowerCompact = ['aow','poc','notes','rep','email'].some(k => k in enq);
    if (!hasSpacedKey && hasAnyLowerCompact) return 'new';
    return 'legacy';
  };

  // Normalize all incoming enquiries once (unfiltered by toggle)
  useEffect(() => {
    if (!enquiries) {
      setAllEnquiries([]);
      setDisplayEnquiries([]);
      return;
    }
    console.log('🔄 Normalizing enquiries data, count:', enquiries.length);
    const normalised: (Enquiry & { __sourceType: 'new' | 'legacy'; [k: string]: unknown })[] = enquiries.map((raw: any) => {
      const sourceType = detectSourceType(raw);
      const rec: Enquiry & { __sourceType: 'new' | 'legacy'; [k: string]: unknown } = {
        ...raw,
        ID: raw.ID || raw.id?.toString(),
        Touchpoint_Date: raw.Touchpoint_Date || raw.datetime,
        Point_of_Contact: raw.Point_of_Contact || raw.poc,
        Area_of_Work: raw.Area_of_Work || raw.aow,
        Type_of_Work: raw.Type_of_Work || raw.tow,
        Method_of_Contact: raw.Method_of_Contact || raw.moc,
        First_Name: raw.First_Name || raw.first,
        Last_Name: raw.Last_Name || raw.last,
        Email: raw.Email || raw.email,
        Phone_Number: raw.Phone_Number || raw.phone,
        Value: raw.Value || raw.value,
        Initial_first_call_notes: raw.Initial_first_call_notes || raw.notes,
        Call_Taker: raw.Call_Taker || raw.rep,
        __sourceType: sourceType
      };
      return rec;
    });
    const newCount = normalised.filter(r => r.__sourceType === 'new').length;
    const legacyCount = normalised.length - newCount;
    console.log(`📊 Source type distribution -> new: ${newCount}, legacy: ${legacyCount}`);
    setAllEnquiries(normalised);
  }, [enquiries]);

  // Apply dataset toggle to derive display list without losing the other dataset
  useEffect(() => {
    if (!allEnquiries.length) {
      setDisplayEnquiries([]);
      return;
    }
    if (isLocalhost) {
      let filtered = allEnquiries.filter(e => useNewData ? e.__sourceType === 'new' : e.__sourceType === 'legacy');
      // Fallback: if toggle selected new but zero new detected, show legacy + emit warning for debug panel
      if (useNewData && filtered.length === 0) {
        console.warn('⚠️ No enquiries classified as new. Falling back to all for visibility.');
        filtered = allEnquiries;
      }
      console.log('✅ Applied dataset toggle: useNewData=', useNewData, 'result count=', filtered.length);
      setDisplayEnquiries(filtered);
    } else {
      setDisplayEnquiries(allEnquiries);
    }
  }, [allEnquiries, useNewData, isLocalhost]);

  // Reset area filter if current filter is no longer available
  useEffect(() => {
    if (userData && userData.length > 0 && userData[0].AOW) {
      const userAOW = userData[0].AOW.split(',').map(a => a.trim());
      if (activeAreaFilter !== 'All' && !userAOW.includes(activeAreaFilter)) {
        setActiveAreaFilter('All');
      }
    }
  }, [userData, activeAreaFilter]);

  const [currentSliderStart, setCurrentSliderStart] = useState<number>(0);
  const [currentSliderEnd, setCurrentSliderEnd] = useState<number>(0);

  // Added for infinite scroll
  const [itemsToShow, setItemsToShow] = useState<number>(20);
  const loader = useRef<HTMLDivElement | null>(null);
  const previousMainTab = useRef<string>('Claimed');

  const toggleDashboard = useCallback(() => {
    if (activeState === '') {
      setActiveState(previousMainTab.current || 'Claimed');
    } else {
      previousMainTab.current = activeState;
      setActiveState('');
    }
  }, [activeState]);

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
    if (displayEnquiries.length > 0) {
      const validDates = displayEnquiries
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
  }, [displayEnquiries]);

  const sortedEnquiries = useMemo(() => {
    return [...displayEnquiries].sort((a, b) => {
      const dateA = parseISO(a.Touchpoint_Date || '');
      const dateB = parseISO(b.Touchpoint_Date || '');
      return dateA.getTime() - dateB.getTime();
    });
  }, [displayEnquiries]);

  const unclaimedEmails = useMemo(
    () => ['team@helix-law.com'].map((e) => e.toLowerCase()),
    []
  );

  const unclaimedEnquiries = useMemo(
    () =>
      displayEnquiries.filter((e) => {
        const poc = (e.Point_of_Contact || (e as any).poc || '').toLowerCase();
        return poc === 'team@helix-law.com';
      }),
    [displayEnquiries]
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

  const handleSubTabChange = useCallback((item?: PivotItem) => {
    if (item) {
      setActiveSubTab(item.props.itemKey as string);
    }
  }, []);

  const handleSelectEnquiry = useCallback((enquiry: Enquiry) => {
    setSelectedEnquiry(enquiry);
    setActiveSubTab('Pitch'); // Go directly to Pitch Builder
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedEnquiry(null);
  }, []);

  useEffect(() => {
    const resume = localStorage.getItem('resumePitchBuilder');
    if (resume) {
      localStorage.removeItem('resumePitchBuilder');
      const saved = localStorage.getItem('pitchBuilderState');
      if (saved) {
        try {
          const state = JSON.parse(saved);
          const enquiryId = state.enquiryId;
          if (enquiryId) {
            const found = displayEnquiries.find(e => e.ID === enquiryId);
            if (found) {
              handleSelectEnquiry(found);
            }
          }
        } catch (e) {
          console.error('Failed to resume pitch builder', e);
        }
      }
    }
  }, [displayEnquiries, handleSelectEnquiry]);

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
        // No longer update localEnquiries; only update via API and refresh if needed
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

  const filteredEnquiries = useMemo(() => {
    let filtered = enquiriesInSliderRange;

    console.log('🔍 FILTERING DEBUG - START');
    console.log('📊 enquiriesInSliderRange count:', enquiriesInSliderRange.length);
    console.log('🎯 activeState:', activeState);
    console.log('👤 userData:', userData);

    const userEmail = userData && userData[0] && userData[0].Email
      ? userData[0].Email.toLowerCase()
      : '';

    // For local development, use Sam SP's data
    const useLocalData = process.env.REACT_APP_USE_LOCAL_DATA === 'true';
    const isLocalhost = window.location.hostname === 'localhost';
    
    const effectiveUserEmail = (useLocalData && isLocalhost) 
      ? 'ac@helix-law.com' 
      : userEmail;

    console.log('📧 User email for filtering:', userEmail);
    console.log('🏠 Local mode enabled:', useLocalData && isLocalhost);
    console.log('✅ Effective user email:', effectiveUserEmail);

    // DETAILED POC VALUE ANALYSIS
    console.log('🔬 DETAILED POC ANALYSIS:');
    enquiriesInSliderRange.forEach((enq, index) => {
      const pocOld = enq.Point_of_Contact || '';
      const pocNew = (enq as any).poc || '';
      console.log(`  Enquiry ${index + 1}:`, {
        id: enq.ID,
        Point_of_Contact: pocOld,
        poc: pocNew,
        finalPoc: pocOld || pocNew,
        userEmail: userEmail,
        effectiveUserEmail: effectiveUserEmail,
        matches: (pocOld || pocNew).toLowerCase() === effectiveUserEmail
      });
    });

    // Filter by activeState first (supports Claimed, Unclaimed, etc.)
    if (activeState === 'Claimed') {
      console.log('🎯 Filtering for CLAIMED (user email match)');
      filtered = filtered.filter(enquiry => {
        // Handle both old and new schema
        const poc = (enquiry.Point_of_Contact || (enquiry as any).poc || '').toLowerCase();
        const matches = effectiveUserEmail ? poc === effectiveUserEmail : false;
        console.log(`  Enquiry ${enquiry.ID}: poc="${poc}" vs effectiveUserEmail="${effectiveUserEmail}" → ${matches}`);
        return matches;
      });
    } else if (activeState === 'Claimable') {
      filtered = filtered.filter(enquiry => {
        // Handle both old and new schema
        const poc = (enquiry.Point_of_Contact || (enquiry as any).poc || '').toLowerCase();
        return unclaimedEmails.includes(poc);
      });
    }

    console.log('Filtering - after state filter:', filtered);

    // Area-based access control - only applies for unclaimed enquiries
    if (activeState === 'Claimable' && userData && userData.length > 0 && userData[0].AOW) {
      const userAOW = userData[0].AOW.split(',').map(a => a.trim().toLowerCase());
      console.log('Filtering - userAOW:', userAOW);

      const hasFullAccess = userAOW.some(
        area => area.includes('operations') || area.includes('tech')
      );

      if (!hasFullAccess) {
        filtered = filtered.filter(enquiry => {
          const enquiryArea = (enquiry.Area_of_Work || '').toLowerCase();
          if (!enquiryArea) return false;

          const inAllowed = userAOW.some(
            a => a === enquiryArea || a.includes(enquiryArea) || enquiryArea.includes(a)
          );
          if (!inAllowed) return false;

          if (activeAreaFilter !== 'All') {
            return enquiryArea === activeAreaFilter.toLowerCase();
          }
          return true;
        });
      } else if (activeAreaFilter !== 'All') {
        filtered = filtered.filter(enquiry => {
          const enquiryArea = (enquiry.Area_of_Work || '').toLowerCase();
          return enquiryArea === activeAreaFilter.toLowerCase();
        });
      }
    } else if (activeAreaFilter !== 'All') {
      filtered = filtered.filter(enquiry => {
        const enquiryArea = (enquiry.Area_of_Work || '').toLowerCase();
        return enquiryArea === activeAreaFilter.toLowerCase();
      });
    }

    console.log('Filtering - after area filter:', filtered);
    
    // Apply search term filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(enquiry => 
        enquiry.First_Name?.toLowerCase().includes(term) ||
        enquiry.Last_Name?.toLowerCase().includes(term) ||
        enquiry.Email?.toLowerCase().includes(term) ||
        enquiry.Company?.toLowerCase().includes(term) ||
        enquiry.Type_of_Work?.toLowerCase().includes(term) ||
        enquiry.ID?.toLowerCase().includes(term)
      );
    }
    
    console.log('Filtering - final filtered:', filtered);
    
    return filtered;
  }, [
    enquiriesInSliderRange,
    userData,
    activeState,
    activeAreaFilter,
    searchTerm,
  ]);

  // Removed pagination logic
  // const indexOfLastEnquiry = currentPage * enquiriesPerPage;
  // const indexOfFirstEnquiry = indexOfLastEnquiry - enquiriesPerPage;
  // const currentEnquiries = useMemo(
  //   () => filteredEnquiries.slice(indexOfFirstEnquiry, indexOfLastEnquiry),
  //   [filteredEnquiries, indexOfFirstEnquiry, indexOfLastEnquiry]
  // );
  // const totalPages = Math.ceil(filteredEnquiries.length / enquiriesPerPage);

  // Added for infinite scroll - support both grouped and regular view
  const displayedItems = useMemo(() => {
    if (showGroupedView) {
      // Use grouped display
      const mixedItems = getMixedEnquiryDisplay([...filteredEnquiries].reverse());
      return mixedItems.slice(0, itemsToShow);
    } else {
      // Use regular display
      return [...filteredEnquiries].reverse().slice(0, itemsToShow);
    }
  }, [filteredEnquiries, itemsToShow, showGroupedView]);

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
      setActiveState(key);
      setActiveSubTab('Pitch');
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
        tokens={{ childrenGap: 24 }}
        styles={{
          root: {
            backgroundColor: isDarkMode
              ? colours.dark.sectionBackground
              : colours.light.sectionBackground,
            boxShadow: isDarkMode
              ? '0 8px 32px rgba(0, 0, 0, 0.3)'
              : '0 8px 32px rgba(0, 0, 0, 0.1)',
            padding: '32px',
            borderRadius: '12px',
            fontFamily: 'Raleway, sans-serif',
          },
        }}
      >
        {activeSubTab === 'Pitch' && (
          <PitchBuilder enquiry={enquiry} userData={userData} />
        )}
        {activeSubTab === 'Calls' && (
          <EnquiryCalls enquiry={enquiry} />
        )}
        {activeSubTab === 'Emails' && (
          <EnquiryEmails enquiry={enquiry} />
        )}
      </Stack>
    ),
    [isDarkMode, activeSubTab, userData]
  );

  const enquiriesCountPerMember = useMemo(() => {
    if (!enquiriesInSliderRange || !teamData) return [];
    const grouped: { [email: string]: number } = {};
    enquiriesInSliderRange.forEach((enq) => {
      // Handle both old and new schema
      const pocEmail = (enq.Point_of_Contact || (enq as any).poc || '').toLowerCase();
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

  function containerStyle(dark: boolean) {
    return mergeStyles({
      backgroundColor: dark ? colours.dark.background : colours.light.background,
      minHeight: '100vh',
      boxSizing: 'border-box',
      color: dark ? colours.light.text : colours.dark.text,
    });
  }

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Action / Navigation Bar */}
      <div
        className={mergeStyles({
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          padding: '10px 24px 12px 24px',
          background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
          boxShadow: isDarkMode ? '0 2px 6px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.12)',
          borderBottom: isDarkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)'
        })}
      >
        {/* Left side: either back + pivot (detail view) OR filters (list view) */}
        {selectedEnquiry ? (
          <div className={detailNavStyle(isDarkMode)} style={{ position: 'static', padding: 0, boxShadow: 'none', top: undefined, height: 'auto' }}>
            <IconButton
              iconProps={{ iconName: 'ChevronLeft' }}
              onClick={handleBackToList}
              className={backButtonStyle}
              title="Back"
              ariaLabel="Back"
            />
            <Pivot selectedKey={activeSubTab} onLinkClick={handleSubTabChange}>
              <PivotItem headerText="Pitch Builder" itemKey="Pitch" />
              <PivotItem headerText="Calls" itemKey="Calls" />
              <PivotItem headerText="Emails" itemKey="Emails" />
            </Pivot>
          </div>
        ) : (
          <>
            {/* Status filter (labels removed for cleaner look) */}
            <SegmentedControl
              id="enquiries-status-seg"
              ariaLabel="Filter enquiries by status"
              value={activeState === 'Claimable' ? 'Unclaimed' : activeState}
              onChange={(k) => handleSetActiveState(k === 'Unclaimed' ? 'Claimable' : k)}
              options={[ 'Claimed', 'Unclaimed' ].map(k => ({ key: k, label: k }))}
            />
            {/* Area filter (only if user has >1 area) */}
            {userData && userData[0]?.AOW && userData[0].AOW.split(',').length > 1 && (
              <SegmentedControl
                id="enquiries-area-seg"
                ariaLabel="Filter enquiries by area of work"
                value={activeAreaFilter}
                onChange={setActiveAreaFilter}
                options={[{ key: 'All', label: 'All' }, ...userData[0].AOW.split(',').map(a => a.trim()).map(a => ({ key: a, label: a }))]}
              />
            )}
            {/* Spacer */}
            <div style={{ flex: 1 }} />
            {/* Admin controls (debug + data toggle) for admin or localhost */}
            {(isAdmin || isLocalhost) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '2px 10px 2px 6px',
                  height: 40,
                  borderRadius: 12,
                  background: isDarkMode ? '#5a4a12' : colours.highlightYellow,
                  border: isDarkMode ? '1px solid #806c1d' : '1px solid #e2c56a',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                  fontSize: 11,
                  fontWeight: 600,
                  color: isDarkMode ? '#ffe9a3' : '#5d4700'
                }}
                title="Admin / debug controls"
              >
                <IconButton
                  iconProps={{ iconName: 'TestBeaker', style: { fontSize: 16 } }}
                  title="Debug API calls"
                  ariaLabel="Open data inspector"
                  onClick={() => setShowDataInspector(v => !v)}
                  styles={{ root: { borderRadius: 8, background: 'rgba(0,0,0,0.08)', height: 30, width: 30 } }}
                />
                <ToggleSwitch
                  id="enquiries-new-data-toggle"
                  checked={useNewData}
                  onChange={setUseNewData}
                  size="sm"
                  onText="New"
                  offText="Legacy"
                  ariaLabel="Toggle dataset between legacy and new"
                />
              </div>
            )}
          </>
        )}
      </div>

  <section className="page-section">
        <Stack
          tokens={{ childrenGap: 20 }}
          styles={{
            root: {
              backgroundColor: isDarkMode 
                ? colours.dark.sectionBackground 
                : colours.light.sectionBackground,
              padding: '16px',
              borderRadius: 0,
              boxShadow: isDarkMode
                ? `0 4px 12px ${colours.dark.border}`
                : `0 4px 12px ${colours.light.border}`,
              width: '100%',
              fontFamily: 'Raleway, sans-serif',
            },
          }}
        >

      {showUnclaimedBoard ? (
        <UnclaimedEnquiries
          enquiries={unclaimedEnquiries}
          onSelect={handleSelectEnquiry}
        />
      ) : null}

      <div
        key={activeState}
        className={mergeStyles({
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '0px', // Remove extra gap between sections
          paddingBottom: 0, // Remove extra space at the bottom
          backgroundColor: 'transparent',
          transition: 'background-color 0.3s',
        })}
      >
        {selectedEnquiry ? (
          renderDetailView(selectedEnquiry)
        ) : (
          <>
                  {filteredEnquiries.length === 0 ? (
                    <div
                      className={mergeStyles({
                        backgroundColor: 'transparent',
                        borderRadius: '12px',
                        padding: '60px 40px',
                        textAlign: 'center',
                        boxShadow: 'none',
                      })}
                    >
                      <Icon
                        iconName="Search"
                        styles={{
                          root: {
                            fontSize: '48px',
                            color: isDarkMode ? colours.dark.subText : colours.light.subText,
                            marginBottom: '20px',
                          },
                        }}
                      />
                      <Text
                        variant="xLarge"
                        styles={{
                          root: {
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            fontFamily: 'Raleway, sans-serif',
                            fontWeight: '600',
                            marginBottom: '8px',
                          },
                        }}
                      >
                        No enquiries found
                      </Text>
                      <Text
                        variant="medium"
                        styles={{
                          root: {
                            color: isDarkMode ? colours.dark.subText : colours.light.subText,
                            fontFamily: 'Raleway, sans-serif',
                          },
                        }}
                      >
                        Try adjusting your search criteria or filters
                      </Text>
                    </div>

            ) : (
              <>
                        {/* Connected List Items */}
                        <div
                          className={mergeStyles({
                            display: 'flex',
                            flexDirection: 'column',
                            gap: "12px",
                            padding: 0,
                            margin: 0,
                            backgroundColor: 'transparent',
                          })}
                        >
                          {displayedItems.map((item, idx) => {
                            const isLast = idx === displayedItems.length - 1;

                            // Extract user's areas of work (AOW) for filtering
                            let userAOW: string[] = [];
                            if (userData && userData.length > 0 && userData[0].AOW) {
                              userAOW = userData[0].AOW.split(',').map((a) => a.trim().toLowerCase());
                    }

                            if (isGroupedEnquiry(item)) {
                              // Render grouped enquiry card
                              return (
                                <GroupedEnquiryCard
                                  key={item.clientKey}
                                  groupedEnquiry={item}
                                  onSelect={handleSelectEnquiry}
                                  onRate={handleRate}
                                  teamData={teamData}
                                  isLast={isLast}
                                  userAOW={userAOW}
                                />
                              );
                            } else {
                              const pocLower = (item.Point_of_Contact || (item as any).poc || '').toLowerCase();
                              const isUnclaimedNew = pocLower === 'team@helix-law.com' && (item as any).__sourceType === 'new';
                              if (isUnclaimedNew) {
                                return (
                                  <NewUnclaimedEnquiryCard
                                    key={item.ID}
                                    enquiry={item}
                                    onSelect={() => {}} // Prevent click-through to pitch builder
                                    onRate={handleRate}
                                    isLast={isLast}
                                  />
                                );
                              }
                              return (
                                <EnquiryLineItem
                                  key={item.ID}
                                  enquiry={item}
                                  onSelect={handleSelectEnquiry}
                                  onRate={handleRate}
                                  teamData={teamData}
                                  isLast={isLast}
                                  userAOW={userAOW}
                                  isNewSource={(item as any).__sourceType === 'new'}
                                />
                              );
                            }
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
        </Stack>
      </section>

      {/* Enquiry API Debugger - Only in development */}
      {showDataInspector && (
        <EnquiryApiDebugger
          currentEnquiries={displayEnquiries}
          onClose={() => setShowDataInspector(false)}
        />
      )}
      {showDataInspector && isLocalhost && (
        <div style={{ margin:'16px 0', padding:16, background: isDarkMode ? '#1e2430' : '#f5f8fc', border:`1px solid ${isDarkMode? 'rgba(255,255,255,0.1)': '#d4e1f1'}`, borderRadius:8 }}>
          <Text variant="mediumPlus" styles={{ root:{ fontWeight:600, marginBottom:8, color: isDarkMode? colours.dark.text: colours.light.text }}}>Local Dataset Toggle Debug</Text>
          <Text variant="small" styles={{ root:{ display:'block', marginBottom:8 }}}>Showing <strong>{useNewData ? 'NEW (direct)' : 'LEGACY'}</strong> dataset. Total after normalization: {displayEnquiries.length}</Text>
          {debugError && <MessageBar messageBarType={MessageBarType.error}>{debugError}</MessageBar>}
        </div>
      )}
    </div>
  );
}



export default Enquiries;
