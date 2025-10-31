
// Clean admin tools - removed beaker and legacy toggle
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';
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
import IconAreaFilter from '../../components/filter/IconAreaFilter';
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
// Search UI
import { SearchBox } from '@fluentui/react';
import { sharedSearchBoxContainerStyle, sharedSearchBoxStyle } from '../../app/styles/FilterStyles';
import { parseISO, startOfMonth, format, isValid } from 'date-fns';
import { Enquiry, POID, UserData, TeamData } from '../../app/functionality/types';
import EnquiryLineItem from './EnquiryLineItem';
import NewUnclaimedEnquiryCard from './NewUnclaimedEnquiryCard';
import ClaimedEnquiryCard from './ClaimedEnquiryCard';
import GroupedEnquiryCard from './GroupedEnquiryCard';
import { GroupedEnquiry, getMixedEnquiryDisplay, isGroupedEnquiry } from './enquiryGrouping';
import PitchBuilder from './PitchBuilder';
import EnquiryCalls from './EnquiryCalls';
import EnquiryEmails from './EnquiryEmails';
import { colours } from '../../app/styles/colours';
import SegmentedControl from '../../components/filter/SegmentedControl';
import { isAdminUser, hasInstructionsAccess } from '../../app/admin';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
import UnclaimedEnquiries from './UnclaimedEnquiries';
import FilterBanner from '../../components/filter/FilterBanner';
import { app } from '@microsoft/teams-js';
import AreaCountCard from './AreaCountCard';
import 'rc-slider/assets/index.css';
import '../../app/styles/NavigatorPivot.css';
import Slider from 'rc-slider';
import { debugLog, debugWarn } from '../../utils/debug';
  // Subtle Helix watermark generator – three rounded ribbons rotated slightly
  const helixWatermarkSvg = (dark: boolean) => {
    const fill = dark ? '%23FFFFFF' : '%23061733';
    const opacity = dark ? '0.06' : '0.035';
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900' viewBox='0 0 900 900'>
      <g transform='rotate(-12 450 450)'>
        <path d='M160 242 C160 226 176 210 200 210 L560 210 Q640 235 560 274 L200 274 C176 274 160 258 160 242 Z' fill='${fill}' fill-opacity='${opacity}'/>
        <path d='M160 362 C160 346 176 330 200 330 L560 330 Q640 355 560 394 L200 394 C176 394 160 378 160 362 Z' fill='${fill}' fill-opacity='${opacity}'/>
        <path d='M160 482 C160 466 176 450 200 450 L560 450 Q640 475 560 514 L200 514 C176 514 160 498 160 482 Z' fill='${fill}' fill-opacity='${opacity}'/>
      </g>
    </svg>`;
    return `url("data:image/svg+xml,${svg}")`;
  };

// All available areas of work across the organization
const ALL_AREAS_OF_WORK = [
  'Commercial',
  'Construction',
  'Employment',
  'Property',
  'Other/Unsure'
];

// Local types
interface MonthlyCount {
  month: string;
  commercial: number;
  construction: number;
  employment: number;
  property: number;
  otherUnsure: number;
}

interface EnquiriesProps {
  context?: app.Context | null;
  enquiries: Enquiry[] | null;
  userData: UserData[] | null;
  poidData: POID[];
  setPoidData: React.Dispatch<React.SetStateAction<POID[]>>;
  teamData?: TeamData[] | null;
  onRefreshEnquiries?: () => Promise<void>;
  instructionData?: any[]; // For detecting promoted enquiries
}

const Enquiries: React.FC<EnquiriesProps> = ({
  context,
  enquiries,
  userData,
  poidData,
  setPoidData,
  teamData,
  onRefreshEnquiries,
  instructionData,
}) => {

  // Function to check if an enquiry has been promoted to pitch/instruction
  const getPromotionStatus = useCallback((enquiry: Enquiry): { promoted: boolean; type: 'pitch' | 'instruction' | null; count: number } => {
    if (!instructionData || !enquiry.ID) {
      return { promoted: false, type: null, count: 0 };
    }

    let promotedCount = 0;
    let hasInstruction = false;
    let hasPitch = false;

    // Check if this enquiry ID matches any prospect IDs in instruction data
    instructionData.forEach((item: any) => {
      // Check if the enquiry ID matches prospect ID in deals or instructions
      const matchesProspectId = item.prospectId?.toString() === enquiry.ID?.toString();
      
      if (matchesProspectId) {
        promotedCount++;
        
        // Check if it has actual instructions (not just deals/pitches)
        if (item.instructions && item.instructions.length > 0) {
          hasInstruction = true;
        } else if (item.deals && item.deals.length > 0) {
          hasPitch = true;
        }
      }
      
      // Also check deals array for prospect ID matches
      if (item.deals) {
        item.deals.forEach((deal: any) => {
          if (deal.ProspectId?.toString() === enquiry.ID?.toString() || deal.prospectId?.toString() === enquiry.ID?.toString()) {
            promotedCount++;
            hasPitch = true;
          }
        });
      }
      
      // Check instructions array for prospect ID matches
      if (item.instructions) {
        item.instructions.forEach((instruction: any) => {
          if (instruction.ProspectId?.toString() === enquiry.ID?.toString() || instruction.prospectId?.toString() === enquiry.ID?.toString()) {
            promotedCount++;
            hasInstruction = true;
          }
        });
      }
    });

    return {
      promoted: promotedCount > 0,
      type: hasInstruction ? 'instruction' : (hasPitch ? 'pitch' : null),
      count: promotedCount
    };
  }, [instructionData]);

  // Simple version for card components
  const getPromotionStatusSimple = useCallback((enquiry: Enquiry): 'pitch' | 'instruction' | null => {
    const result = getPromotionStatus(enquiry);
    return result.type;
  }, [getPromotionStatus]);

  // Use only real enquiries data
  // All normalized enquiries (union of legacy + new) retained irrespective of toggle
  const [allEnquiries, setAllEnquiries] = useState<(Enquiry & { __sourceType: 'new' | 'legacy' })[]>([]);
  // Display subset after applying dataset toggle
  const [displayEnquiries, setDisplayEnquiries] = useState<(Enquiry & { __sourceType: 'new' | 'legacy' })[]>([]);
  // Loading state to prevent flickering
  const [isLoadingAllData, setIsLoadingAllData] = useState<boolean>(false);
  // Track if we've already fetched all data to prevent duplicate calls
  const hasFetchedAllData = useRef<boolean>(false);

  // Debug logging

  // Navigation state variables  
  // (declaration moved below, only declare once)

  // Function to fetch all enquiries (unfiltered) for "All" mode
  const fetchAllEnquiries = useCallback(async () => {
    if (isLoadingAllData) {
      debugLog('🔄 Already loading all data, skipping fetch');
      return;
    }
    
    debugLog('🔄 Attempting to fetch all enquiries, hasFetched:', hasFetchedAllData.current);
    
    try {
      setIsLoadingAllData(true);
      hasFetchedAllData.current = true;
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
  // Call unified server-side route for ALL environments to avoid legacy combined route
  const allDataParams = new URLSearchParams({ fetchAll: 'true', includeTeamInbox: 'true', limit: '1500' });
  const allDataUrl = `/api/enquiries-unified?${allDataParams.toString()}`;
      
      debugLog('🌐 Fetching ALL enquiries (unified) from:', allDataUrl);
      
      const response = await fetch(allDataUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      debugLog('📡 Response status:', response.status, response.statusText);
      debugLog('📡 Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response not OK:', response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      debugLog('🔍 RAW RESPONSE from unified route:', {
        dataType: typeof data,
        isArray: Array.isArray(data),
        hasEnquiries: !!data.enquiries,
        enquiriesLength: data.enquiries?.length,
        dataKeys: Object.keys(data),
        sampleData: JSON.stringify(data).substring(0, 200)
      });
      
      let rawEnquiries: any[] = [];
      if (Array.isArray(data)) {
        rawEnquiries = data;
        debugLog('📦 Using data as direct array');
      } else if (Array.isArray(data.enquiries)) {
        rawEnquiries = data.enquiries;
        debugLog('📦 Using data.enquiries array');
      } else {
        debugWarn('⚠️ Unexpected data structure:', data);
      }
      
      debugLog('✅ Fetched all enquiries:', rawEnquiries.length);
      debugLog('📊 All enquiries POC breakdown:', rawEnquiries.reduce((acc: any, enq) => {
        const poc = enq.Point_of_Contact || enq.poc || 'unknown';
        acc[poc] = (acc[poc] || 0) + 1;
        return acc;
      }, {}));
      
      // PRODUCTION DEBUG: Log sample of claimed enquiries
      const claimedSample = rawEnquiries
        .filter(enq => {
          const poc = (enq.Point_of_Contact || enq.poc || '').toLowerCase();
          return poc !== 'team@helix-law.com' && poc.trim() !== '';
        })
        .slice(0, 10);
      debugLog('🔍 PRODUCTION DEBUG - Sample claimed enquiries:', claimedSample.map(e => ({
        ID: e.ID || e.id,
        POC: e.Point_of_Contact || e.poc,
        Area: e.Area_of_Work || e.aow,
        Date: e.Touchpoint_Date || e.datetime
      })));
      
      // Convert to normalized format
      const normalizedEnquiries = rawEnquiries.map((raw: any) => {
        const sourceType = detectSourceType(raw);
        return {
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
      });
      
      debugLog('🔄 Setting normalized data to state:', normalizedEnquiries.length);
      debugLog('🔍 Sample normalized enquiry:', normalizedEnquiries[0]);
      debugLog('🔍 Normalized enquiries POC distribution:', normalizedEnquiries.reduce((acc: any, enq) => {
        const poc = enq.Point_of_Contact || 'unknown';
        acc[poc] = (acc[poc] || 0) + 1;
        return acc;
      }, {}));
      
      setAllEnquiries(normalizedEnquiries);
      setDisplayEnquiries(normalizedEnquiries);
      
      debugLog('✅ State updated with normalized enquiries');
      
      return normalizedEnquiries;
    } catch (error) {
      console.error('❌ Failed to fetch all enquiries:', error);
      return [];
    } finally {
      setIsLoadingAllData(false);
    }
  }, [isLoadingAllData]);

  // ...existing code...

  const { isDarkMode } = useTheme();
  const { setContent } = useNavigatorActions();
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [twoColumn, setTwoColumn] = useState<boolean>(false);
  // Scope toggle (Mine vs All) for claimed enquiries - admin-only feature, default to Mine
  const [showMineOnly, setShowMineOnly] = useState<boolean>(true); // Default to showing only Mine for admin users
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
  // Local dataset toggle (legacy vs new direct) analogous to Matters (only in localhost UI for now)
  // Deal Capture is always enabled by default now
  const showDealCapture = true;
  
  // Auto-refresh state
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [nextRefreshIn, setNextRefreshIn] = useState<number>(30 * 60); // 30 minutes in seconds
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isLocalhost = (typeof window !== 'undefined') && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  // Admin check (match Matters logic) – be robust to spaced keys and fallbacks
  const userRec: any = (userData && userData[0]) ? userData[0] : {};
  const userRole: string = (userRec.Role || userRec.role || '').toString();
  const userFullName: string = (
    userRec.FullName ||
    userRec['Full Name'] ||
    [userRec.First, userRec.Last].filter(Boolean).join(' ')
  )?.toString() || '';
  const isAdmin = isAdminUser(userData?.[0] || null);
  debugLog('🔍 ADMIN STATUS DEBUG:', {
    userEmail: userData?.[0]?.Email,
    userInitials: userData?.[0]?.Initials,
    userName: userData?.[0]?.First,
    isAdmin,
    showMineOnly
  });
  const hasInstructionsAndMoreAccess = hasInstructionsAccess(userData?.[0] || null);
  // Debug storage for raw payloads when inspecting
  const [debugRaw, setDebugRaw] = useState<{ legacy?: unknown; direct?: unknown }>({});
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  
  // Navigation state variables  
  const [activeState, setActiveState] = useState<string>('Claimed');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [userManuallyChangedAreas, setUserManuallyChangedAreas] = useState(false);

  // CRITICAL DEBUG: Log incoming enquiries prop
  React.useEffect(() => {
    debugLog('🚨 ENQUIRIES PROP DEBUG:', {
      hasEnquiries: !!enquiries,
      enquiriesLength: enquiries?.length || 0,
      enquiriesIsArray: Array.isArray(enquiries),
      userEmail: userData?.[0]?.Email,
      sampleEnquiries: enquiries?.slice(0, 3).map((e: any) => ({
        ID: e.ID || e.id,
        POC: e.Point_of_Contact || e.poc,
        CallTaker: e.Call_Taker || e.rep
      }))
    });
  }, [enquiries, userData]);

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
    debugLog('🔄 Prop useEffect triggered:', { 
      hasEnquiries: !!enquiries, 
      enquiriesLength: enquiries?.length || 0, 
      isAdmin, 
      showMineOnly,
      currentDisplayCount: displayEnquiries.length
    });
    
    if (!enquiries) {
      setAllEnquiries([]);
      setDisplayEnquiries([]);
      return;
    }
    
    // Don't override fetched data when admin is in "All" mode
    if (isAdmin && !showMineOnly) {
      debugLog('👤 Admin in All mode - keeping fetched dataset, not using prop data');
      // If we already have fetched data, don't clear it
      if (displayEnquiries.length > 0) {
        debugLog('👤 Preserving existing fetched data:', displayEnquiries.length, 'enquiries');
        return;
      }
    }
    
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
        // Map Ultimate_Source to source field for enquiry cards
        source: raw.source || raw.Ultimate_Source || 'originalForward',
        __sourceType: sourceType
      };
      return rec;
    });
    const newCount = normalised.filter(r => r.__sourceType === 'new').length;
    const legacyCount = normalised.length - newCount;
    setAllEnquiries(normalised);
  }, [enquiries, isAdmin, showMineOnly]);

  // Map for claimer quick lookup
  const claimerMap = useMemo(() => {
    const map: Record<string, any> = {};
    teamData?.forEach(td => { if (td.Email) map[td.Email.toLowerCase()] = td; });
    return map;
  }, [teamData]);

  // Single select handler (pitch builder path)

  // Apply dataset toggle to derive display list without losing the other dataset
  useEffect(() => {
    if (!allEnquiries.length) {
      setDisplayEnquiries([]);
      return;
    }
    
    // If admin is in "All" mode and we have fetched unified data, show all data
    const userEmail = userData?.[0]?.Email?.toLowerCase() || '';
    if (isAdmin && !showMineOnly && hasFetchedAllData.current && allEnquiries.length > 1000) {
  debugLog('👑 Admin All mode - showing unified data:', allEnquiries.length);
      setDisplayEnquiries(allEnquiries);
      return;
    }
    
    if (isLocalhost) {
      // Show all enquiries (both legacy and new) - no dataset filtering
      let filtered = allEnquiries;
      
      // Debug logging for BR
      if (userEmail.includes('br@') || userEmail.includes('brendan')) {
        debugLog('🗄️ BR DEBUG - Data loading:', {
          totalAllEnquiries: allEnquiries.length,
          filteredCount: filtered.length,
          isLocalhost,
          userEmail,
          samplePOCs: allEnquiries.slice(0, 10).map(e => e.Point_of_Contact || (e as any).poc)
        });
      }
      
      setDisplayEnquiries(filtered);
    } else {
      setDisplayEnquiries(allEnquiries);
    }
  }, [allEnquiries, isLocalhost, userData, showMineOnly]);

  // Initialize selected areas with user's areas + Other/Unsure
  useEffect(() => {
    console.log('🎯 Enquiries: Area sync useEffect triggered:', {
      hasUserData: !!userData,
      userDataLength: userData?.length || 0,
      userAOW: userData?.[0]?.AOW,
      currentSelectedAreas: selectedAreas,
      userManuallyChangedAreas
    });
    
    // Don't override if user has manually changed areas
    if (userManuallyChangedAreas) {
      console.log('🎯 Enquiries: Skipping auto-sync because user manually changed areas');
      return;
    }
    
    if (userData && userData.length > 0 && userData[0].AOW) {
      const userAOW = userData[0].AOW.split(',').map(a => a.trim());
      console.log('🎯 Enquiries: Processing user AOW:', userAOW);
      
      // Check if this would actually change the selection
      const newSelection = [...userAOW];
      if (!newSelection.includes('Other/Unsure')) {
        newSelection.push('Other/Unsure');
      }
      
      // Only update if the selection would actually change
      const currentSorted = [...selectedAreas].sort();
      const newSorted = [...newSelection].sort();
      const isActuallyDifferent = JSON.stringify(currentSorted) !== JSON.stringify(newSorted);
      
      console.log('🎯 Enquiries: Area comparison:', {
        current: currentSorted,
        new: newSorted,
        isDifferent: isActuallyDifferent
      });
      
      if (isActuallyDifferent) {
        console.log('🎯 Enquiries: Setting selectedAreas to:', newSelection);
        setSelectedAreas(newSelection);
      } else {
        console.log('🎯 Enquiries: No change needed, areas already match');
      }
    }
  }, [userData, userManuallyChangedAreas]); // Added userManuallyChangedAreas to dependencies

  // Custom handler for manual area changes to prevent useEffect overrides
  const handleManualAreaChange = useCallback((newAreas: string[]) => {
    console.log('🎯 Enquiries: User manually changed areas to:', newAreas);
    setUserManuallyChangedAreas(true);
    setSelectedAreas(newAreas);
  }, []);

  // Reset manual flag when UserBubble changes userData (allow UserBubble override to work)
  const prevUserDataRef = useRef<typeof userData>();
  useEffect(() => {
    if (prevUserDataRef.current !== userData) {
      if (process.env.REACT_APP_DEBUG_VERBOSE === 'true') {
        // eslint-disable-next-line no-console
        console.log('🎯 Enquiries: userData changed, resetting manual flag to allow UserBubble override');
      }
      setUserManuallyChangedAreas(false);
      prevUserDataRef.current = userData;
    }
  }, [userData]);

  // Fetch all enquiries when user switches to "All" mode and current dataset is too small
  useEffect(() => {
    if (isLoadingAllData) return; // Prevent multiple concurrent fetches
    
    const userEmail = userData?.[0]?.Email?.toLowerCase() || '';
    const isBRUser = userEmail.includes('br@') || userEmail.includes('brendan');
    
  debugLog('🔄 Toggle useEffect triggered:', { isAdmin, showMineOnly, userEmail, hasData: displayEnquiries.length });
    
    // When switching to "Mine" mode, ensure displayEnquiries has the full dataset for filtering
    // BUT don't reset fetch flag if we already have all data - this prevents infinite loops
    if (showMineOnly) {
      if (allEnquiries.length > 0) {
        debugLog('🔄 Mine mode - setting displayEnquiries to allEnquiries for filtering:', allEnquiries.length);
        setDisplayEnquiries(allEnquiries);
      }
      // Don't reset hasFetchedAllData.current here - it causes infinite loops
      return;
    }
    
    // Also reset if we previously fetched only new data (29 records) and need unified data
    if (displayEnquiries.length < 100 && allEnquiries.length < 100) {
      debugLog('🔄 Resetting fetch flag - previous fetch may have been incomplete');
      hasFetchedAllData.current = false;
    }
    
    // If admin toggles to "All" and we don't have comprehensive data, fetch complete dataset
    if (isAdmin && !showMineOnly && !hasFetchedAllData.current) {
      debugLog('🔄 Admin switched to All mode - fetching complete dataset');
      fetchAllEnquiries();
    } else if (isBRUser && !showMineOnly && displayEnquiries.length <= 1 && !hasFetchedAllData.current) {
      debugLog('🔄 BR switched to All mode but only has 1 enquiry - fetching complete dataset');
      fetchAllEnquiries();
    }
  }, [showMineOnly, userData, fetchAllEnquiries, isAdmin]); // Removed isLoadingAllData from deps

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

  // Count of today's unclaimed enquiries
  const todaysUnclaimedCount = useMemo(() => {
    const today = new Date();
    const todayString = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    return unclaimedEnquiries.filter((e) => {
      if (!e.Touchpoint_Date) return false;
      const enquiryDate = e.Touchpoint_Date.split('T')[0]; // Extract date part
      return enquiryDate === todayString;
    }).length;
  }, [unclaimedEnquiries]);

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

  const handleSubTabChange = useCallback((key: string) => {
    // Prevent switching to Calls or Emails if Pitch Builder is open
    if (activeSubTab === 'Pitch' && (key === 'Calls' || key === 'Emails')) {
      return;
    }
    // Prevent switching to Calls or Emails in production
    if (!isLocalhost && (key === 'Calls' || key === 'Emails')) {
      return;
    }
    setActiveSubTab(key);
  }, [activeSubTab, isLocalhost]);

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

  // Auto-refresh functionality
  const handleManualRefresh = useCallback(async () => {
  debugLog('🔄 Manual refresh triggered');
  debugLog('isRefreshing:', isRefreshing);
  debugLog('onRefreshEnquiries available:', !!onRefreshEnquiries);
    
    if (isRefreshing) {
      debugLog('❌ Already refreshing, skipping');
      return;
    }
    
    if (!onRefreshEnquiries) {
      debugLog('❌ No onRefreshEnquiries function provided');
      alert('Refresh function not available. Please check the parent component.');
      return;
    }
    
    setIsRefreshing(true);
    debugLog('✅ Starting refresh...');
    
    try {
      await onRefreshEnquiries();
      setLastRefreshTime(new Date());
      setNextRefreshIn(30 * 60); // Reset to 30 minutes
      debugLog('✅ Refresh completed successfully');
    } catch (error) {
      console.error('❌ Failed to refresh enquiries:', error);
      alert(`Refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRefreshing(false);
      debugLog('🏁 Refresh process finished');
    }
  }, [isRefreshing, onRefreshEnquiries]);

  // Auto-refresh timer (30 minutes)
  useEffect(() => {
    const startAutoRefresh = () => {
      // Clear existing intervals
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

      // Set up 30-minute auto-refresh
      refreshIntervalRef.current = setInterval(() => {
        handleManualRefresh();
      }, 30 * 60 * 1000); // 30 minutes

      // Set up countdown timer (updates every minute)
      countdownIntervalRef.current = setInterval(() => {
        setNextRefreshIn(prev => {
          const newValue = prev - 60;
          return newValue <= 0 ? 30 * 60 : newValue;
        });
      }, 60 * 1000); // 1 minute
    };

    startAutoRefresh();

    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [handleManualRefresh]);

  // Format time remaining for display
  const formatTimeRemaining = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${remainingMinutes}m`;
  };

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

  const handleEditEnquiry = useCallback(async (updatedEnquiry: Enquiry) => {
    try {
      // Calculate the updates by comparing with current state
      const originalEnquiry = allEnquiries.find(e => e.ID === updatedEnquiry.ID);
      if (!originalEnquiry) return;

      const updates: Partial<Enquiry> = {};
      if (updatedEnquiry.First_Name !== originalEnquiry.First_Name) updates.First_Name = updatedEnquiry.First_Name;
      if (updatedEnquiry.Last_Name !== originalEnquiry.Last_Name) updates.Last_Name = updatedEnquiry.Last_Name;
      if (updatedEnquiry.Email !== originalEnquiry.Email) updates.Email = updatedEnquiry.Email;
      if (updatedEnquiry.Value !== originalEnquiry.Value) updates.Value = updatedEnquiry.Value;
      if (updatedEnquiry.Initial_first_call_notes !== originalEnquiry.Initial_first_call_notes) {
        updates.Initial_first_call_notes = updatedEnquiry.Initial_first_call_notes;
      }

      if (Object.keys(updates).length === 0) return;

      // Call the save function - using direct API call to avoid dependency issues
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const updateUrl = isLocalhost 
        ? '/api/enquiries-unified/update'
        : `${getProxyBaseUrl()}/${process.env.REACT_APP_UPDATE_ENQUIRY_PATH}?code=${process.env.REACT_APP_UPDATE_ENQUIRY_CODE}`;
      
      const response = await fetch(updateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ID: updatedEnquiry.ID, ...updates }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update enquiry: ${errorText}`);
      }

      // Update local state
      const updateEnquiry = (enquiry: Enquiry & { __sourceType: 'new' | 'legacy' }): Enquiry & { __sourceType: 'new' | 'legacy' } => {
        if (enquiry.ID === updatedEnquiry.ID) {
          return { ...enquiry, ...updates };
        }
        return enquiry;
      };

      setAllEnquiries(prev => prev.map(updateEnquiry));
      setDisplayEnquiries(prev => prev.map(updateEnquiry));
      
  debugLog('✅ Enquiry updated successfully:', updatedEnquiry.ID, updates);
      
    } catch (error) {
      console.error('Failed to edit enquiry:', error);
      throw error; // Re-throw so the card can handle the error
    }
  }, [allEnquiries]);

  const handleAreaChange = useCallback(async (enquiryId: string, newArea: string) => {
    try {
      // Get the appropriate update endpoint
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const updateUrl = isLocalhost 
        ? '/api/enquiries-unified/update' // Local development route
        : `${getProxyBaseUrl()}/${process.env.REACT_APP_UPDATE_ENQUIRY_PATH}?code=${process.env.REACT_APP_UPDATE_ENQUIRY_CODE}`;
      
      const response = await fetch(updateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ID: enquiryId, Area_of_Work: newArea }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update enquiry area: ${errorText}`);
      }

      // Update local state
      const updateEnquiry = (enquiry: Enquiry & { __sourceType: 'new' | 'legacy' }): Enquiry & { __sourceType: 'new' | 'legacy' } => {
        if (enquiry.ID === enquiryId) {
          return { ...enquiry, Area_of_Work: newArea };
        }
        return enquiry;
      };

      setAllEnquiries(prev => prev.map(updateEnquiry));
      setDisplayEnquiries(prev => prev.map(updateEnquiry));
      
  debugLog('✅ Enquiry area updated successfully:', enquiryId, 'to', newArea);
      
    } catch (error) {
      console.error('Failed to update enquiry area:', error);
      throw error;
    }
  }, []);

  const handleSaveEnquiry = useCallback(async (enquiryId: string, updates: Partial<Enquiry>) => {
    try {
      // Get the appropriate update endpoint
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const updateUrl = isLocalhost 
        ? '/api/enquiries-unified/update' // Local development route
        : `${getProxyBaseUrl()}/${process.env.REACT_APP_UPDATE_ENQUIRY_PATH}?code=${process.env.REACT_APP_UPDATE_ENQUIRY_CODE}`;
      
      const response = await fetch(updateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ID: enquiryId, ...updates }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update enquiry: ${errorText}`);
      }

      // Update the local data
      const updateEnquiry = (enquiry: Enquiry & { __sourceType: 'new' | 'legacy' }): Enquiry & { __sourceType: 'new' | 'legacy' } => {
        if (enquiry.ID === enquiryId) {
          return { ...enquiry, ...updates };
        }
        return enquiry;
      };

      setAllEnquiries(prev => prev.map(updateEnquiry));
      setDisplayEnquiries(prev => prev.map(updateEnquiry));
      
  debugLog('✅ Enquiry updated successfully:', enquiryId, updates);
    } catch (error) {
      console.error('❌ Failed to update enquiry:', error);
      throw error;
    }
  }, []);

  const handleEditRating = useCallback(async (id: string, newRating: string) => {
    try {
      const response = await fetch(
        `${getProxyBaseUrl()}/${process.env.REACT_APP_UPDATE_RATING_PATH}?code=${process.env.REACT_APP_UPDATE_RATING_CODE}`,
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
    let filtered = displayEnquiries; // Use full dataset, not slider range

    const userEmail = userData && userData[0] && userData[0].Email
      ? userData[0].Email.toLowerCase()
      : '';

    // Always use the actual user's email - no local overrides
    const effectiveUserEmail = userEmail;

    // Debug logging for BR
    if (userEmail.includes('br@') || userEmail.includes('brendan')) {
      debugLog('🐛 BR DEBUG - Enquiries filtering:', {
        userEmail,
        effectiveUserEmail,
        activeState,
        showMineOnly,
        totalEnquiriesBeforeFilter: displayEnquiries.length
      });
      
      // Show sample of all POCs before filtering
      const allPOCs = displayEnquiries.slice(0, 20).map(e => 
        (e.Point_of_Contact || (e as any).poc || '').toLowerCase()
      );
  debugLog('📧 All POCs in dataset (first 20):', allPOCs);
      
      // Count by POC
      const pocCounts: Record<string, number> = {};
      displayEnquiries.forEach(e => {
        const poc = (e.Point_of_Contact || (e as any).poc || '').toLowerCase();
        pocCounts[poc] = (pocCounts[poc] || 0) + 1;
      });
  debugLog('📊 POC counts:', pocCounts);
    }

    // Add detailed logging for data flow debugging
    debugLog('🔍 Data Flow Debug:', {
      activeState,
      showMineOnly,
      isAdmin,
      allEnquiriesCount: allEnquiries.length,
      displayEnquiriesCount: displayEnquiries.length,
      enquiriesInSliderRangeCount: displayEnquiries.length,
      filteredStartCount: filtered.length,
      effectiveUserEmail,
      userEmail
    });

    // CRITICAL DEBUG: Log first few POCs to see what we're working with
    if (filtered.length > 0) {
      const pocSamples = filtered.slice(0, 10).map(e => ({
        ID: e.ID,
        POC: e.Point_of_Contact || (e as any).poc,
        isUnclaimed: unclaimedEmails.includes((e.Point_of_Contact || (e as any).poc || '').toLowerCase())
      }));
      debugLog('📋 CRITICAL - POC samples before Claimed filter:', pocSamples);
    } else {
      debugLog('⚠️ CRITICAL - filtered array is EMPTY before Claimed filter!');
    }

    // Filter by activeState first (supports Claimed, Unclaimed, etc.)
    if (activeState === 'Claimed') {
      if (showMineOnly || !isAdmin) {
  debugLog('🔍 Filtering for Mine Only - looking for:', effectiveUserEmail);
        
        // DEBUG: Show available claimed POCs first
        const claimedEnquiries = filtered.filter(enquiry => {
          const poc = (enquiry.Point_of_Contact || (enquiry as any).poc || '').toLowerCase();
          const isUnclaimed = unclaimedEmails.includes(poc);
          return !isUnclaimed && poc && poc.trim() !== '';
        });
        
        const claimedPOCs = claimedEnquiries.reduce((acc: any, enq) => {
          const poc = (enq.Point_of_Contact || (enq as any).poc || '').toLowerCase();
          acc[poc] = (acc[poc] || 0) + 1;
          return acc;
        }, {});
        
  debugLog('🔍 MINE DEBUG - Available claimed POCs:', claimedPOCs);
  debugLog('🔍 MINE DEBUG - Total claimed enquiries available:', claimedEnquiries.length);
  debugLog('🔍 MINE DEBUG - Looking for exact match:', effectiveUserEmail);
  debugLog('🔍 MINE DEBUG - User has claimed enquiries:', claimedPOCs[effectiveUserEmail] || 0);
        
        filtered = filtered.filter(enquiry => {
          const poc = (enquiry.Point_of_Contact || (enquiry as any).poc || '').toLowerCase();
          const matches = effectiveUserEmail ? poc === effectiveUserEmail : false;
          if (userEmail.includes('br@') || userEmail.includes('lz@')) {
            debugLog('📧 Enquiry POC:', poc, 'matches:', matches);
          }
          return matches;
        });
      } else {
        debugLog('🌍 Filtering for All Claimed enquiries (Admin Mode)');
        debugLog('📊 Total enquiries before filtering:', filtered.length);
        debugLog('📊 Unclaimed emails to exclude:', unclaimedEmails);
        debugLog('🔍 PRODUCTION DEBUG - Current user admin status:', isAdmin);
        debugLog('🔍 PRODUCTION DEBUG - Current showMineOnly setting:', showMineOnly);
        
        // Show sample of data we're working with
        if (filtered.length > 0) {
          const samples = filtered.slice(0, 3).map(e => ({
            ID: e.ID,
            POC: e.Point_of_Contact || (e as any).poc,
            CallTaker: e.Call_Taker || (e as any).rep
          }));
          debugLog('📋 Sample enquiries:', samples);
        }
        
        // For admin "All" mode, we want to show enquiries that have been claimed by ANYONE
        // This means any enquiry that doesn't have the default unclaimed POC
        filtered = filtered.filter(enquiry => {
          const poc = (enquiry.Point_of_Contact || (enquiry as any).poc || '').toLowerCase();
          
          // An enquiry is "claimed" if it has a POC that's NOT in the unclaimed emails list
          // The unclaimed list contains placeholder emails like 'team@helix-law.com'
          const isUnclaimed = unclaimedEmails.includes(poc);
          const isClaimed = !isUnclaimed && poc && poc.trim() !== '';
          
          return isClaimed;
        });
        
        debugLog('📊 Total claimed enquiries after filtering:', filtered.length);
        debugLog('🔍 PRODUCTION DEBUG - Sample of filtered claimed enquiries:', filtered.slice(0, 5).map(e => ({
          ID: e.ID,
          POC: e.Point_of_Contact || (e as any).poc,
          Area: e.Area_of_Work,
          Date: e.Touchpoint_Date
        })));
      }
    } else if (activeState === 'Claimable') {
      filtered = filtered.filter(enquiry => {
        // Handle both old and new schema
        const poc = (enquiry.Point_of_Contact || (enquiry as any).poc || '').toLowerCase();
        return unclaimedEmails.includes(poc);
      });
    }

    // Area-based access control - only applies for unclaimed enquiries
    if (activeState === 'Claimable' && userData && userData.length > 0 && userData[0].AOW) {
      const userAOW = userData[0].AOW.split(',').map(a => a.trim().toLowerCase());

      const hasFullAccess = userAOW.some(
        area => area.includes('operations') || area.includes('tech')
      );

      if (!hasFullAccess) {
        filtered = filtered.filter(enquiry => {
          const enquiryArea = (enquiry.Area_of_Work || '').toLowerCase().trim();
          
          // Check if this is an unknown/unmatched area
          const isUnknownArea = !enquiryArea || 
            (!['commercial', 'construction', 'employment', 'property', 'claim'].some(known => 
              enquiryArea === known || enquiryArea.includes(known) || known.includes(enquiryArea)
            ));

          // Always show "other/unsure" enquiries if that filter is selected
          if (isUnknownArea && selectedAreas.some(area => area.toLowerCase() === 'other/unsure')) {
            return true;
          }

          // For known areas, check if they're in the user's allowed areas
          if (!isUnknownArea) {
            const inAllowed = userAOW.some(
              a => a === enquiryArea || a.includes(enquiryArea) || enquiryArea.includes(a)
            );
            if (!inAllowed) return false;
          }

          // Filter by selected areas (if any areas are selected, only show those)
          if (selectedAreas.length > 0) {
            return selectedAreas.some(area => 
              enquiryArea === area.toLowerCase() || 
              enquiryArea.includes(area.toLowerCase()) || 
              area.toLowerCase().includes(enquiryArea)
            );
          }
          return true;
        });
      } else if (selectedAreas.length > 0) {
        filtered = filtered.filter(enquiry => {
          const enquiryArea = (enquiry.Area_of_Work || '').toLowerCase().trim();
          
          // Check if this is an unknown/unmatched area
          const isUnknownArea = !enquiryArea || 
            (!['commercial', 'construction', 'employment', 'property', 'claim'].some(known => 
              enquiryArea === known || enquiryArea.includes(known) || known.includes(enquiryArea)
            ));
          
          // If enquiry has no area or doesn't match known areas, it falls under "Other/Unsure"
          if (isUnknownArea && selectedAreas.some(area => area.toLowerCase() === 'other/unsure')) {
            return true;
          }
          
          return selectedAreas.some(area => 
            enquiryArea === area.toLowerCase() || 
            enquiryArea.includes(area.toLowerCase()) || 
            area.toLowerCase().includes(enquiryArea)
          );
        });
      }
    } else if (selectedAreas.length > 0) {
      // Apply area filter to all enquiry states consistently
      filtered = filtered.filter(enquiry => {
        const enquiryArea = (enquiry.Area_of_Work || '').toLowerCase().trim();
        
        // If enquiry has no area or doesn't match known areas, it falls under "Other/Unsure"
        const isUnknownArea = !enquiryArea || 
          (!['commercial', 'construction', 'employment', 'property', 'claim'].some(known => 
            enquiryArea === known || enquiryArea.includes(known) || known.includes(enquiryArea)
          ));
        
        // Check if "Other/Unsure" is selected and this is an unknown area
        if (isUnknownArea && selectedAreas.some(area => area.toLowerCase() === 'other/unsure')) {
          return true;
        }
        
        // Otherwise, match against selected areas normally
        return selectedAreas.some(area => 
          enquiryArea === area.toLowerCase() || 
          enquiryArea.includes(area.toLowerCase()) || 
          area.toLowerCase().includes(enquiryArea)
        );
      });
    }

    
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
    
    // Final debug logging - ALWAYS show for Claimed view
    debugLog('🎯 FINAL FILTER RESULT:', {
      finalCount: filtered.length,
      activeState,
      showMineOnly,
      searchTerm: searchTerm.trim(),
      selectedAreas,
      selectedAreasCount: selectedAreas.length
    });
    
    if (activeState === 'Claimed') {
      debugLog('� CLAIMED VIEW - Final result:', {
        claimedCount: filtered.length,
        showMineOnly,
        effectiveUserEmail,
        samplePOCs: filtered.slice(0, 5).map(e => e.Point_of_Contact || (e as any).poc)
      });
    }
    
    return filtered;
  }, [
    displayEnquiries, // Use full dataset, not slider range
    userData,
    activeState,
    selectedAreas,
    searchTerm,
    showMineOnly,
    unclaimedEmails,
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
      <>
        {activeSubTab === 'Pitch' && (
          <PitchBuilder enquiry={enquiry} userData={userData} />
        )}
        {isLocalhost && activeSubTab === 'Calls' && <EnquiryCalls enquiry={enquiry} />}
        {isLocalhost && activeSubTab === 'Emails' && <EnquiryEmails enquiry={enquiry} />}
      </>
    ),
  [activeSubTab, userData, isLocalhost]
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
      background: dark ? colours.darkBlue : '#ffffff',
      minHeight: '100vh',
      boxSizing: 'border-box',
      color: dark ? colours.light.text : colours.dark.text,
      position: 'relative',
      '&::before': {
        content: '""',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'none',
        backgroundImage: helixWatermarkSvg(dark),
        backgroundRepeat: 'no-repeat',
        backgroundPosition: dark ? 'right -120px top -80px' : 'right -140px top -100px',
        backgroundSize: 'min(52vmin, 520px)',
        pointerEvents: 'none',
        zIndex: 0
      }
    });
  }

  // Global Navigator: list vs detail
  useEffect(() => {
    // Add CSS animation for spinning refresh icon
    if (typeof document !== 'undefined' && !document.getElementById('refreshSpinAnimation')) {
      const style = document.createElement('style');
      style.id = 'refreshSpinAnimation';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    // List mode: filter/search bar in Navigator (like Matters list state)
    if (!selectedEnquiry) {
      debugLog('🔄 Setting new FilterBanner content for Enquiries');
      setContent(
        <FilterBanner
          seamless
          dense
          collapsibleSearch
          sticky={false}
          primaryFilter={{
            value: activeState === 'Claimable' ? 'Unclaimed' : activeState,
            onChange: (k) => handleSetActiveState(k === 'Unclaimed' ? 'Claimable' : k),
            options: ['Claimed','Unclaimed'].map(k => ({ 
              key: k, 
              label: k === 'Unclaimed' ? `Unclaimed (${todaysUnclaimedCount})` : k 
            })),
            ariaLabel: "Filter enquiries by status"
          }}
          secondaryFilter={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {userData && userData[0]?.AOW && (
                <IconAreaFilter
                  selectedAreas={selectedAreas}
                  availableAreas={ALL_AREAS_OF_WORK}
                  onAreaChange={handleManualAreaChange}
                  ariaLabel="Filter enquiries by area of work"
                />
              )}
              {(isAdmin || isLocalhost) && (
                <SegmentedControl
                  id="enquiries-scope-seg"
                  ariaLabel="Scope: toggle between my enquiries and all enquiries"
                  value={showMineOnly ? 'mine' : 'all'}
                  onChange={(v) => setShowMineOnly(v === 'mine')}
                  options={[
                    { key: 'mine', label: 'Mine' },
                    { key: 'all', label: 'All' }
                  ]}
                />
              )}
              <div 
                role="group" 
                aria-label="Layout: choose 1 or 2 columns"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  height: 28,
                  padding: '2px 4px',
                  background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  borderRadius: 14,
                  fontFamily: 'Raleway, sans-serif',
                }}
              >
                <button
                  type="button"
                  title="Single column layout"
                  aria-label="Single column layout"
                  aria-pressed={!twoColumn}
                  onClick={() => setTwoColumn(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    background: !twoColumn ? '#FFFFFF' : 'transparent',
                    border: 'none',
                    borderRadius: 11,
                    cursor: 'pointer',
                    transition: 'all 200ms ease',
                    opacity: !twoColumn ? 1 : 0.6,
                    boxShadow: !twoColumn 
                      ? (isDarkMode
                          ? '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.24)'
                          : '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)')
                      : 'none',
                  }}
                >
                  <Icon
                    iconName="SingleColumn"
                    style={{
                      fontSize: 10,
                      color: !twoColumn 
                        ? (isDarkMode ? '#1f2937' : '#1f2937')
                        : (isDarkMode ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.55)'),
                    }}
                  />
                </button>
                <button
                  type="button"
                  title="Two column layout"
                  aria-label="Two column layout"
                  aria-pressed={twoColumn}
                  onClick={() => setTwoColumn(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    background: twoColumn ? '#FFFFFF' : 'transparent',
                    border: 'none',
                    borderRadius: 11,
                    cursor: 'pointer',
                    transition: 'all 200ms ease',
                    opacity: twoColumn ? 1 : 0.6,
                    boxShadow: twoColumn 
                      ? (isDarkMode
                          ? '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.24)'
                          : '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)')
                      : 'none',
                  }}
                >
                  <Icon
                    iconName="DoubleColumn"
                    style={{
                      fontSize: 10,
                      color: twoColumn 
                        ? (isDarkMode ? '#1f2937' : '#1f2937')
                        : (isDarkMode ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.55)'),
                    }}
                  />
                </button>
              </div>
            </div>
          )}
          search={{
            value: searchTerm,
            onChange: setSearchTerm,
            placeholder: "Search (name, email, company, type, ID)"
          }}
          refresh={{
            onRefresh: handleManualRefresh,
            isLoading: isRefreshing,
            nextUpdateTime: formatTimeRemaining(nextRefreshIn),
            collapsible: true
          }}
        >
        </FilterBanner>
      );
    } else {
      // Detail mode: reuse FilterBanner space with back button + tabs (same visual position as claimed/unclaimed bar)
      setContent(
        <FilterBanner
          seamless
          dense
          sticky={false}
          primaryFilter={{
            value: activeSubTab,
            onChange: (key) => {
              // Prevent switching to Calls or Emails if Pitch Builder is open
              if (activeSubTab === 'Pitch' && (key === 'Calls' || key === 'Emails')) {
                return;
              }
              // Prevent switching to Calls or Emails in production
              if (!isLocalhost && (key === 'Calls' || key === 'Emails')) {
                return;
              }
              setActiveSubTab(key);
            },
            options: [
              { key: 'Pitch', label: 'Pitch Builder' },
              ...(isLocalhost ? [
                { key: 'Calls', label: 'Calls' },
                { key: 'Emails', label: 'Emails' }
              ] : [])
            ],
            ariaLabel: "Switch between enquiry detail tabs"
          }}
        >
          <IconButton
            iconProps={{ iconName: 'ChevronLeft' }}
            onClick={handleBackToList}
            title="Back to enquiries list"
            ariaLabel="Back to enquiries list"
            styles={{
              root: {
                width: 32,
                height: 32,
                marginRight: 8,
                backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#f3f3f3',
                border: '1px solid #e1dfdd',
                borderRadius: 4,
                order: -1, // Ensure it appears first
              },
              rootHovered: {
                backgroundColor: '#e7f1ff',
                borderColor: '#3690CE',
              }
            }}
          />
        </FilterBanner>
      );
    }
    return () => setContent(null);
  }, [
    setContent,
    isDarkMode,
    selectedEnquiry,
    activeState,
    selectedAreas,
    searchTerm,
    userData,
    isAdmin,
    isLocalhost,
    showMineOnly,
    twoColumn,
    activeSubTab,
    showDealCapture,
    handleSubTabChange,
    handleBackToList,
    isRefreshing,
    nextRefreshIn,
    formatTimeRemaining,
    handleManualRefresh,
  ]);

  return (
    <div className={containerStyle(isDarkMode)}>

        <Stack
          tokens={{ childrenGap: 20 }}
          styles={{
            root: {
              backgroundColor: 'transparent', // Remove section background - let cards sit on main page background
              // Remove extra chrome when viewing a single enquiry; PitchBuilder renders its own card
              padding: selectedEnquiry ? '0' : '16px',
              borderRadius: 0,
              position: 'relative',
              zIndex: 1,
              boxShadow: 'none', // Remove shadow artifact - content sits directly on page background
              width: '100%',
              fontFamily: 'Raleway, sans-serif',
            },
          }}
        >



      {showUnclaimedBoard ? (
        <UnclaimedEnquiries
          enquiries={unclaimedEnquiries}
          onSelect={handleSelectEnquiry}
          userEmail={userData?.[0]?.Email || ''}
          onAreaChange={() => { /* no-op in unclaimed view for now */ }}
          onClaimSuccess={() => { try { handleManualRefresh(); } catch { /* ignore */ } }}
          getPromotionStatusSimple={getPromotionStatusSimple}
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
                        {activeState === 'Claimed' && showMineOnly
                          ? 'No claimed enquiries found'
                          : activeState === 'Claimed'
                          ? 'No claimed enquiries found'
                          : 'No enquiries found'
                        }
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
                        {activeState === 'Claimed' && showMineOnly
                          ? 'You have no claimed enquiries yet. Try switching to "All" to see claimed enquiries from all team members.'
                          : activeState === 'Claimed'
                          ? 'No enquiries have been claimed yet.'
                          : 'Try adjusting your search criteria or filters'
                        }
                      </Text>
                    </div>

            ) : (
              <>
                        {/* Connected List Items */}
                        <div
                          className={
                            (() => {
                              const base = mergeStyles({
                                display: twoColumn ? 'grid' : 'flex',
                                flexDirection: twoColumn ? undefined : 'column',
                                gap: '12px',
                                padding: 0,
                                margin: 0,
                                backgroundColor: 'transparent',
                                gridTemplateColumns: twoColumn ? 'repeat(2, minmax(0, 1fr))' : undefined,
                                width: '100%', // allow full width usage
                                transition: 'grid-template-columns .25s ease',
                              });
                              return twoColumn ? `${base} two-col-grid` : base;
                            })()
                          }
                          style={twoColumn ? { position: 'relative' } : undefined}
                        >
                          {twoColumn && (() => {
                            if (typeof document !== 'undefined' && !document.getElementById('enquiriesTwoColStyles')) {
                              const el = document.createElement('style');
                              el.id = 'enquiriesTwoColStyles';
                              el.textContent = '@media (max-width: 860px){.two-col-grid{display:flex!important;flex-direction:column!important;}}';
                              document.head.appendChild(el);
                            }
                            return null;
                          })()}
                          {displayedItems.map((item, idx) => {
                            const isLast = idx === displayedItems.length - 1;

                            // Extract user's areas of work (AOW) for filtering
                            let userAOW: string[] = [];
                            if (userData && userData.length > 0 && userData[0].AOW) {
                              userAOW = userData[0].AOW.split(',').map((a) => a.trim().toLowerCase());
                            }

                            // Get user email for claim functionality
                            const currentUserEmail = userData && userData[0] && userData[0].Email
                              ? userData[0].Email.toLowerCase()
                              : '';

                            if (isGroupedEnquiry(item)) {
                              // Render grouped enquiry card
                              return (
                                <GroupedEnquiryCard
                                  key={item.clientKey}
                                  groupedEnquiry={item}
                                  onSelect={handleSelectEnquiry}
                                  onRate={handleRate}
                                  onPitch={handleSelectEnquiry}
                                  teamData={teamData}
                                  isLast={isLast}
                                  userAOW={userAOW}
                                  getPromotionStatus={getPromotionStatusSimple}
                                />
                              );
                            } else {
                              const pocLower = (item.Point_of_Contact || (item as any).poc || '').toLowerCase();
                              const isUnclaimed = pocLower === 'team@helix-law.com';
                              if (isUnclaimed) {
                                return (
                                  <NewUnclaimedEnquiryCard
                                    key={item.ID}
                                    enquiry={item}
                                    onSelect={() => {}} // Prevent click-through to pitch builder
                                    onRate={handleRate}
                                    onAreaChange={handleAreaChange}
                                    isLast={isLast}
                                    userEmail={currentUserEmail}
                                    onClaimSuccess={onRefreshEnquiries}
                                    promotionStatus={getPromotionStatusSimple(item)}
                                  />
                                );
                              }
                              const claimer = claimerMap[pocLower];
                              return (
                                <ClaimedEnquiryCard
                                  key={item.ID}
                                  enquiry={item}
                                  claimer={claimer}
                                  onSelect={handleSelectEnquiry}
                                  onRate={handleRate}
                                  onEdit={handleEditEnquiry}
                                  onAreaChange={handleAreaChange}
                                  userData={userData}
                                  isLast={isLast}
                                  promotionStatus={getPromotionStatusSimple(item)}
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

    </div>
  );
}

export default Enquiries;
