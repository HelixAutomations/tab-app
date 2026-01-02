// Clean admin tools - removed beaker and legacy toggle
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';
import { SCENARIOS } from './pitch-builder/scenarios';
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
  ActionButton,
  IButtonStyles,
  Modal,
  initializeIcons,
  TooltipHost,
} from '@fluentui/react';
import OperationStatusToast from './pitch-builder/OperationStatusToast';
import IconAreaFilter from '../../components/filter/IconAreaFilter';
import PitchScenarioBadge from '../../components/PitchScenarioBadge';
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
import EnquiryTimeline from './EnquiryTimeline';
import { colours } from '../../app/styles/colours';
import SegmentedControl from '../../components/filter/SegmentedControl';
import { isAdminUser, hasInstructionsAccess } from '../../app/admin';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
import UnclaimedEnquiries from './UnclaimedEnquiries';
import FilterBanner from '../../components/filter/FilterBanner';
import CreateContactModal from './CreateContactModal';
import TeamsLinkWidget from '../../components/TeamsLinkWidget';
import { EnquiryEnrichmentData, EnquiryEnrichmentResponse, fetchEnquiryEnrichment } from '../../app/functionality/enquiryEnrichment';
import { claimEnquiry } from '../../utils/claimEnquiry';
import { app } from '@microsoft/teams-js';
import AreaCountCard from './AreaCountCard';
import 'rc-slider/assets/index.css';
import '../../app/styles/NavigatorPivot.css';
import '../../app/styles/animations.css';
import '../../app/styles/CustomTabs.css';
import Slider from 'rc-slider';
import { debugLog, debugWarn } from '../../utils/debug';
import { shouldAlwaysShowProspectHistory, isSharedProspectRecord } from './sharedProspects';
import { checkIsLocalDev, isActuallyLocalhost } from '../../utils/useIsLocalDev';
import EmptyState from '../../components/states/EmptyState';
import LoadingState from '../../components/states/LoadingState';

// Synthetic demo enquiry for demos/testing - always available, not from database
const DEV_PREVIEW_TEST_ENQUIRY: Enquiry & { __sourceType: 'new' | 'legacy' } = {
  ID: 'DEV-PREVIEW-99999',
  Date_Created: new Date().toISOString().split('T')[0],
  Touchpoint_Date: new Date().toISOString().split('T')[0],
  Email: 'demo@example.com',
  Area_of_Work: 'commercial (costs)',
  Type_of_Work: 'Contract Disputes',
  Method_of_Contact: 'Website Form',
  Point_of_Contact: 'lz@helix-law.com',
  Company: 'Demo Company Ltd',
  Website: 'https://example.com',
  Title: 'Mr',
  First_Name: 'Demo',
  Last_Name: 'Client',
  DOB: '1990-01-01',
  Phone_Number: '07000000000',
  Secondary_Phone: '02000000000',
  Tags: '',
  Unit_Building_Name_or_Number: '123',
  Mailing_Street: 'Test Street',
  Mailing_Street_2: '',
  Postal_Code: 'AB1 2CD',
  City: 'Test City',
  Mailing_County: 'Test County',
  Country: 'United Kingdom',
  Gift_Rank: 5,
  Value: '£25,000 to £50,000',
  Call_Taker: 'LZ',
  Ultimate_Source: 'Google Ads',
  Referral_URL: 'https://google.com',
  Campaign: 'Test_Campaign',
  Ad_Group: 'Test_AdGroup',
  Search_Keyword: 'test keyword',
  GCLID: 'test-gclid-123',
  Initial_first_call_notes: 'Demo enquiry notes for demos/testing (stable record, not from database).',
  Do_not_Market: 'No',
  Rating: 'Good',
  __sourceType: 'new'
};

const DEMO_MODE_STORAGE_KEY = 'demoModeEnabled';

// CSS for shimmer animation
const shimmerStyle = `
@keyframes shimmer {
  0% { left: -100%; }
  100% { left: 100%; }
}
`;

// Inject the shimmer CSS into the document head if it doesn't exist
if (typeof document !== 'undefined' && !document.querySelector('#shimmer-styles')) {
  const style = document.createElement('style');
  style.id = 'shimmer-styles';
  style.textContent = shimmerStyle;
  document.head.appendChild(style);
}
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

// Teams channel configuration - area-specific fallback URLs
const TEAM_INBOX_CHANNEL_FALLBACK_URL =
  'https://teams.microsoft.com/l/channel/19%3a09c0d3669cd2464aab7db60520dd9180%40thread.tacv2/Team%20Inbox?groupId=b7d73ffb-70b5-45d6-9940-8f9cc7762135&tenantId=7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';

// Area-specific channel mapping (legacy channels from old Helix Law team)
const getAreaSpecificChannelUrl = (areaOfWork: string | undefined): string => {
  const channelMappings: { [key: string]: string } = {
    commercial: 'https://teams.microsoft.com/l/channel/19%3A09c0d3669cd2464aab7db60520dd9180%40thread.tacv2/Commercial?groupId=b7d73ffb-70b5-45d6-9940-8f9cc7762135&tenantId=7fbc252f-3ce5-460f-9740-4e1cb8bf78b8',
    construction: 'https://teams.microsoft.com/l/channel/19%3A2ba7d5a50540426da60196c3b2daf8e8%40thread.tacv2/Construction?groupId=b7d73ffb-70b5-45d6-9940-8f9cc7762135&tenantId=7fbc252f-3ce5-460f-9740-4e1cb8bf78b8',
    employment: 'https://teams.microsoft.com/l/channel/19%3A9e1c8918bca747f5afc9ca5acbd89683%40thread.tacv2/Employment?groupId=b7d73ffb-70b5-45d6-9940-8f9cc7762135&tenantId=7fbc252f-3ce5-460f-9740-4e1cb8bf78b8',
    property: 'https://teams.microsoft.com/l/channel/19%3A6d09477d15d548a6b56f88c59b674da6%40thread.tacv2/Property?groupId=b7d73ffb-70b5-45d6-9940-8f9cc7762135&tenantId=7fbc252f-3ce5-460f-9740-4e1cb8bf78b8'
  };
  
  const normalizedArea = areaOfWork?.toLowerCase();
  return channelMappings[normalizedArea || ''] || TEAM_INBOX_CHANNEL_FALLBACK_URL;
};

const buildEnquiryIdentityKey = (record: Partial<Enquiry> | any): string => {
  const id = String(record?.ID ?? record?.id ?? '').trim();
  const date = String(record?.Touchpoint_Date ?? record?.Date_Created ?? record?.datetime ?? '');
  const poc = String(record?.Point_of_Contact ?? record?.poc ?? '').trim().toLowerCase();
  const first = String(record?.First_Name ?? record?.first ?? '').trim().toLowerCase();
  const last = String(record?.Last_Name ?? record?.last ?? '').trim().toLowerCase();
  const notesSnippet = String(record?.Initial_first_call_notes ?? record?.notes ?? '')
    .trim()
    .slice(0, 24)
    .toLowerCase();
  return [id, date, poc, first, last, notesSnippet].join('|');
};

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
  onOptimisticClaim?: (enquiryId: string, claimerEmail: string) => void;
  instructionData?: any[]; // For detecting promoted enquiries
  featureToggles?: Record<string, boolean>;
  isActive?: boolean; // Whether this tab is currently active
}

// Add keyframes for loading spinner
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  if (!document.head.querySelector('style[data-spin-animation]')) {
    style.setAttribute('data-spin-animation', 'true');
    document.head.appendChild(style);
  }
}

const Enquiries: React.FC<EnquiriesProps> = ({
  context,
  enquiries,
  userData,
  poidData,
  setPoidData,
  teamData,
  onRefreshEnquiries,
  onOptimisticClaim,
  instructionData,
  featureToggles = {},
  isActive = false,
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

  // Get pitch scenario display name
  const getScenarioDisplayName = useCallback((scenarioId: string): string => {
    const scenarios: { [key: string]: string } = {
      'before-call-call': 'Before call — Call',
      'before-call-no-call': 'Before call — No call',
      'after-call-probably-cant-assist': 'After call — Cannot assist',
      'after-call-want-instruction': 'After call — Want instruction',
      'cfa': 'CFA'
    };
    return scenarios[scenarioId] || scenarioId;
  }, []);

  // Use only real enquiries data
  // All normalized enquiries (union of legacy + new) retained irrespective of toggle
  const [allEnquiries, setAllEnquiries] = useState<(Enquiry & { __sourceType: 'new' | 'legacy' })[]>([]);
  // Display subset after applying dataset toggle
  const [displayEnquiries, setDisplayEnquiries] = useState<(Enquiry & { __sourceType: 'new' | 'legacy' })[]>([]);
  // Team-wide dataset for suppression index (includes other users' claimed enquiries)
  const [teamWideEnquiries, setTeamWideEnquiries] = useState<(Enquiry & { __sourceType: 'new' | 'legacy' })[]>([]);
  // Loading state to prevent flickering
  const [isLoadingAllData, setIsLoadingAllData] = useState<boolean>(false);
  // Track if we've already fetched all data to prevent duplicate calls
  const hasFetchedAllData = useRef<boolean>(false);

  // Debug logging

  // View state - Card vs Table toggle
  // Default to table view; persist preference in sessionStorage
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    const saved = sessionStorage.getItem('enquiries-view-mode');
    return (saved === 'card' || saved === 'table') ? saved : 'table';
  });
  
  // Persist view mode changes to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('enquiries-view-mode', viewMode);
  }, [viewMode]);

  // Unified enrichment data state (Teams + pitch data)
  const [enrichmentMap, setEnrichmentMap] = useState<Map<string, EnquiryEnrichmentData>>(new Map());
  
  // Track whether triage pitch data has been loaded (for Triaged filter)
  const [triagedDataLoaded, setTriagedDataLoaded] = useState(false);
  
  // Track ongoing enrichment requests to prevent duplicates
  const enrichmentRequestsRef = useRef<Set<string>>(new Set());

  // Table view: Track expanded notes by enquiry ID
  const [expandedNotesInTable, setExpandedNotesInTable] = useState<Set<string>>(new Set());
  
  // Table view: Track hovered row for showing contact actions
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  
  // Table view: Sorting state
  type SortColumn = 'date' | 'aow' | 'id' | 'value' | 'contact' | 'pipeline' | null;
  type SortDirection = 'asc' | 'desc';
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Pipeline filter state - for filtering by Teams/Pitched status (yes/no toggles)
  type EnquiryPipelineStage = 'teams' | 'pitched';
  type EnquiryPipelineStatus = 'yes' | 'no';
  const [enquiryPipelineFilters, setEnquiryPipelineFilters] = useState<Map<EnquiryPipelineStage, EnquiryPipelineStatus>>(new Map());
  
  // POC filter - dropdown with team members (separate from toggle filters)
  const [selectedPocFilter, setSelectedPocFilter] = useState<string | null>(null);
  const [isPocDropdownOpen, setIsPocDropdownOpen] = useState(false);
  
  // Pitch scenario filter - dropdown with scenarios
  const [selectedPitchScenarioFilter, setSelectedPitchScenarioFilter] = useState<string | null>(null);
  const [isPitchScenarioDropdownOpen, setIsPitchScenarioDropdownOpen] = useState(false);
  
  // Pipeline filter toggle handler - cycles through: no filter → yes → no → no filter
  const cycleEnquiryPipelineFilter = useCallback((stage: EnquiryPipelineStage) => {
    setEnquiryPipelineFilters(prev => {
      const newFilters = new Map(prev);
      const currentFilter = newFilters.get(stage);
      
      if (!currentFilter) {
        // Start with 'yes' (has this stage)
        newFilters.set(stage, 'yes');
      } else if (currentFilter === 'yes') {
        // Switch to 'no' (doesn't have this stage)
        newFilters.set(stage, 'no');
      } else {
        // Clear filter
        newFilters.delete(stage);
      }
      
      return newFilters;
    });
  }, []);
  
  // Get the current filter state for a stage (for display)
  const getEnquiryStageFilterState = useCallback((stage: EnquiryPipelineStage): EnquiryPipelineStatus | null => {
    return enquiryPipelineFilters.get(stage) || null;
  }, [enquiryPipelineFilters]);
  
  const handleSortClick = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to desc for date, asc for others
      setSortColumn(column);
      setSortDirection(column === 'date' ? 'desc' : 'asc');
    }
  };
  
  // Table view: Track expanded grouped enquiries by client key
  const [expandedGroupsInTable, setExpandedGroupsInTable] = useState<Set<string>>(new Set());
  
  // Table view: Track collapsed days (by day key like '2025-12-31')
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  
  // Table view: Track hovered day for highlight effect
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);
  
  // Toggle day collapse
  const toggleDayCollapse = useCallback((dayKey: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return next;
    });
  }, []);

  // Reassignment state
  const [reassignmentDropdown, setReassignmentDropdown] = useState<{ enquiryId: string; x: number; y: number } | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);

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
  // Use same date range as user's personal view for consistency
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const dateFrom = twelveMonthsAgo.toISOString().split('T')[0];
  const dateTo = now.toISOString().split('T')[0];
  
  const allDataParams = new URLSearchParams({ 
    fetchAll: 'true', 
    includeTeamInbox: 'true', 
    limit: '999999',
    dateFrom,
    dateTo,
    bypassCache: 'true'  // Force fresh data
  });
  const allDataUrl = `/api/enquiries-unified?${allDataParams.toString()}`;
  
  // Date range: 12 months ago to today
      
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
          // Preserve claim timestamp from instructions enquiries; legacy stays null
          claim: raw.claim ?? null,
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
      
      // IMPORTANT: Do not overwrite per-user dataset when fetching team-wide data for All/Mine+Claimed.
      // Keep `allEnquiries` sourced from props (per-user), and store the unified dataset only in teamWideEnquiries.
      // This prevents Mine view from briefly switching to team-wide dataset and dropping claimed items.
      setTeamWideEnquiries(normalizedEnquiries);
      
      debugLog('✅ Team-wide enquiries loaded; preserved per-user allEnquiries');
      
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
  
  // Generate subtle pulse animation CSS based on theme
  const pulseGlowStyle = useMemo(() => {
    const baseColor = isDarkMode ? 'rgba(135, 243, 243, 0.6)' : 'rgba(54, 144, 206, 0.7)';
    const baseBg = isDarkMode ? 'rgba(135, 243, 243, 0.10)' : 'rgba(54, 144, 206, 0.12)';
    const greenColor = isDarkMode ? 'rgba(32, 178, 108, 0.6)' : 'rgba(32, 178, 108, 0.7)';
    const greenBg = isDarkMode ? 'rgba(32, 178, 108, 0.10)' : 'rgba(32, 178, 108, 0.12)';
    
    return `
@keyframes pulse-glow {
  0%, 100% { 
    border: 1px dashed ${baseColor};
    background: ${baseBg};
    box-shadow: 0 2px 4px ${isDarkMode ? 'rgba(135, 243, 243, 0.06)' : 'rgba(54, 144, 206, 0.08)'};
    opacity: 0.85;
  }
  50% { 
    border: 1px dashed ${baseColor};
    background: ${baseBg};
    box-shadow: 0 2px 6px ${isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(54, 144, 206, 0.15)'};
    opacity: 1;
  }
}

@keyframes pulse-glow-green {
  0%, 100% { 
    border: 1px dashed ${greenColor};
    background: ${greenBg};
    box-shadow: 0 2px 4px ${isDarkMode ? 'rgba(32, 178, 108, 0.06)' : 'rgba(32, 178, 108, 0.08)'};
    opacity: 0.85;
  }
  50% { 
    border: 1px dashed ${greenColor};
    background: ${greenBg};
    box-shadow: 0 2px 6px ${isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.15)'};
    opacity: 1;
  }
}
`;
  }, [isDarkMode]);

  // Inject pulse-glow CSS
  useEffect(() => {
    if (typeof document !== 'undefined') {
      // Remove existing pulse-glow styles
      const existingStyle = document.querySelector('#pulse-glow-styles');
      if (existingStyle) {
        existingStyle.remove();
      }
      
      // Add new pulse-glow styles
      const style = document.createElement('style');
      style.id = 'pulse-glow-styles';
      style.textContent = pulseGlowStyle;
      document.head.appendChild(style);
    }
  }, [pulseGlowStyle]);
  const [selectedEnquiry, setSelectedEnquiry] = useState<Enquiry | null>(null);
  const [twoColumn, setTwoColumn] = useState<boolean>(false);
  // Use the checkIsLocalDev utility - respects "View as Production" toggle
  const isLocalhost = checkIsLocalDev(featureToggles);
  // Check if running in VSCode webview (userAgent contains 'Code')
  const isVSCodeWebview = (typeof navigator !== 'undefined') && navigator.userAgent.includes('Code');
  // Scope toggle - always default to "Mine" for focused workflow
  const [showMineOnly, setShowMineOnly] = useState<boolean>(true);
  const [isDeletionMode, setIsDeletionMode] = useState<boolean>(false);
  const [editingEnquiry, setEditingEnquiry] = useState<Enquiry | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deletePasscode, setDeletePasscode] = useState('');
  // Removed pagination states
  // const [currentPage, setCurrentPage] = useState<number>(1);
  // const enquiriesPerPage = 12;

  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false);
  const [currentRating, setCurrentRating] = useState<string>('');
  const [ratingEnquiryId, setRatingEnquiryId] = useState<string | null>(null);
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<string>('Pitch');
  const [selectedPitchScenario, setSelectedPitchScenario] = useState<string | undefined>(undefined);
  const [showUnclaimedBoard, setShowUnclaimedBoard] = useState<boolean>(false);
  const [isCreateContactModalOpen, setIsCreateContactModalOpen] = useState<boolean>(false);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ oldest: string; newest: string } | null>(null);
  const [isSearchActive, setSearchActive] = useState<boolean>(false);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showGroupedView, setShowGroupedView] = useState<boolean>(true);
  const [areActionsEnabled, setAreActionsEnabled] = useState<boolean>(false);
  // Local dataset toggle (legacy vs new direct) analogous to Matters (only in localhost UI for now)
  // Deal Capture is always enabled by default now
  const showDealCapture = true;
  
  // Auto-refresh state
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [nextRefreshIn, setNextRefreshIn] = useState<number>(5 * 60); // 5 minutes in seconds
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const handleManualRefreshRef = useRef<(() => Promise<void>) | null>(null);
  // Track recent updates to prevent overwriting with stale prop data
  const recentUpdatesRef = useRef<Map<string, { field: string; value: any; timestamp: number }>>(new Map());
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
  
  // Toast notification state (using OperationStatusToast)
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [toastDetails, setToastDetails] = useState<string>('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info' | 'warning'>('success');

  const [demoModeEnabled, setDemoModeEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  
  // Document counts state - maps enquiry ID to document count
  const [documentCounts, setDocumentCounts] = useState<Record<string, number>>({});
  
  useEffect(() => {
    const anyModalOpen = isRateModalOpen || showEditModal || isCreateContactModalOpen;
    if (typeof window === 'undefined' || !anyModalOpen) {
      return;
    }
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, [isRateModalOpen, showEditModal, isCreateContactModalOpen]);
  
  // Navigation state variables  
  const [activeState, setActiveState] = useState<string>('Claimed');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Debounced search handler - prevents lag while typing
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value); // Update UI immediately for responsiveness
    
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set new timeout for debounced filter update (300ms)
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(value);
    }, 300);
  }, []);

  const copyToClipboard = useCallback((value?: string | number) => {
    if (!value) {
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(String(value))
        .catch((err) => console.error('Failed to copy text:', err));
    }
  }, []);

  // Track claim operations in progress (keyed by enquiry ID)
  const [claimingEnquiries, setClaimingEnquiries] = useState<Set<string>>(new Set());

  const renderClaimPromptChip = useCallback(
    (options?: { 
      size?: 'default' | 'compact'; 
      teamsLink?: string | null; 
      leadName?: string; 
      areaOfWork?: string;
      enquiryId?: string;
      dataSource?: 'new' | 'legacy';
    }) => {
      const size = options?.size ?? 'default';
      const metrics = size === 'compact'
        ? { padding: '4px 8px', fontSize: 9, iconSize: 10 }
        : { padding: '4px 10px', fontSize: 10, iconSize: 11 };
      const leadLabel = options?.leadName?.trim() || 'this lead';
      const isClaiming = options?.enquiryId ? claimingEnquiries.has(options.enquiryId) : false;

      const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        
        // If we have enquiry ID and user email, perform the claim via API
        const currentUserEmail = userData?.[0]?.Email;
        if (options?.enquiryId && currentUserEmail) {
          // Mark as claiming
          setClaimingEnquiries(prev => new Set(prev).add(options.enquiryId!));
          
          // Optimistic update - immediately move enquiry to claimed state in UI
          if (onOptimisticClaim) {
            onOptimisticClaim(options.enquiryId, currentUserEmail);
          }
          
          try {
            const result = await claimEnquiry(
              options.enquiryId, 
              currentUserEmail, 
              options.dataSource || 'legacy'
            );
            
            if (result.success) {
              // Background refresh to sync with server (non-blocking)
              if (onRefreshEnquiries) {
                onRefreshEnquiries().catch(err => console.warn('Background refresh failed:', err));
              }
            } else {
              console.error('[Enquiries] Failed to claim enquiry:', result.error);
              // Revert optimistic update by refreshing
              if (onRefreshEnquiries) {
                await onRefreshEnquiries();
              }
            }
          } catch (err) {
            console.error('[Enquiries] Error claiming enquiry:', err);
            // Revert optimistic update by refreshing
            if (onRefreshEnquiries) {
              await onRefreshEnquiries();
            }
          } finally {
            setClaimingEnquiries(prev => {
              const next = new Set(prev);
              next.delete(options.enquiryId!);
              return next;
            });
          }
        } else {
          // Fallback: open Teams channel (legacy behavior)
          const destination = (options?.teamsLink || '').trim() || getAreaSpecificChannelUrl(options?.areaOfWork);
          if (typeof window !== 'undefined') {
            window.open(destination, '_blank');
          }
        }
      };

      return (
        <button
          type="button"
          onClick={handleClick}
          disabled={isClaiming}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: metrics.padding,
            borderRadius: 0,
            border: `1px solid ${isDarkMode ? 'rgba(245, 158, 11, 0.4)' : 'rgba(217, 119, 6, 0.45)'}`,
            background: isDarkMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)',
            color: isDarkMode ? 'rgba(251, 191, 36, 0.95)' : 'rgba(180, 83, 9, 0.9)',
            textTransform: 'uppercase',
            fontWeight: 600,
            letterSpacing: '0.3px',
            fontSize: `${metrics.fontSize}px`,
            cursor: isClaiming ? 'wait' : 'pointer',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
            fontFamily: 'inherit',
            opacity: isClaiming ? 0.6 : 1,
            position: 'relative',
          }}
          onMouseEnter={(e) => {
            if (!isClaiming) {
              e.currentTarget.style.background = isDarkMode ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.14)';
              e.currentTarget.style.borderColor = isDarkMode ? 'rgba(245, 158, 11, 0.55)' : 'rgba(217, 119, 6, 0.6)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isClaiming) {
              e.currentTarget.style.background = isDarkMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)';
              e.currentTarget.style.borderColor = isDarkMode ? 'rgba(245, 158, 11, 0.4)' : 'rgba(217, 119, 6, 0.45)';
            }
          }}
          title={isClaiming ? 'Claiming...' : (options?.enquiryId ? `Claim ${leadLabel}` : 'Open shared inbox channel in Teams')}
        >
          {/* Status dot indicator */}
          {!isClaiming && (
            <span
              style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isDarkMode ? 'rgba(251, 191, 36, 0.9)' : 'rgba(217, 119, 6, 0.85)',
                animation: 'status-breathe 2s ease-in-out infinite',
              }}
            />
          )}
          <Icon iconName={isClaiming ? 'Sync' : 'Contact'} styles={{ root: { fontSize: metrics.iconSize, color: 'inherit', animation: isClaiming ? 'spin 1s linear infinite' : 'none' } }} />
          <span>{isClaiming ? 'Claiming...' : 'Claim'}</span>
        </button>
      );
    },
    [isDarkMode, claimingEnquiries, userData, onRefreshEnquiries, onOptimisticClaim]
  );
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [userManuallyChangedAreas, setUserManuallyChangedAreas] = useState(false);
  const [selectedPersonInitials, setSelectedPersonInitials] = useState<string | null>(null);

  const hasActiveSearch = useMemo(() => debouncedSearchTerm.trim().length > 0, [debouncedSearchTerm]);

  const isIdSearch = useMemo(() => {
    const raw = debouncedSearchTerm.trim().toLowerCase();
    if (!raw) return false;
    if (raw.startsWith('id:')) {
      return /^id:\s*\d+$/.test(raw);
    }
    return /^\d+$/.test(raw);
  }, [debouncedSearchTerm]);

  // Prevent stale person filter from hiding items when toggling scope or tab
  useEffect(() => {
    if (selectedPersonInitials) {
      debugLog('🧹 Clearing selected person filter due to scope/tab change', {
        clearing: selectedPersonInitials,
        showMineOnly,
        activeState
      });
      setSelectedPersonInitials(null);
    }
  }, [showMineOnly, activeState]);

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
      currentDisplayCount: displayEnquiries.length,
      propsSource: 'from parent index.tsx'
    });
    // DON'T skip prop normalization if we have unified data - this causes the 1337 override
    // Instead, only use props for regular users and only fetch unified for admins
    // if (hasFetchedAllData.current) {
    //   debugLog('🔒 Keeping unified dataset (skip prop normalization)', { hasFetched: hasFetchedAllData.current });
    //   return;
    // }
    
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
      const enquiryId = raw.ID || raw.id?.toString();
      
      const rec: Enquiry & { __sourceType: 'new' | 'legacy'; [k: string]: unknown } = {
        ...raw,
        ID: enquiryId,
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
        // Preserve claim timestamp from instructions enquiries; legacy stays null
        claim: raw.claim ?? null,
        // Map Ultimate_Source to source field for enquiry cards
        source: raw.source || raw.Ultimate_Source || 'originalForward',
        __sourceType: sourceType
      };
      
      // Check if this enquiry has a recent update that should override prop data
      const recentUpdate = recentUpdatesRef.current.get(enquiryId);
      if (recentUpdate && Date.now() - recentUpdate.timestamp < 5000) {
        // Apply the recent update to preserve user's change
        (rec as any)[recentUpdate.field] = recentUpdate.value;
        debugLog('🔒 Preserving recent update for', enquiryId, ':', recentUpdate.field, '=', recentUpdate.value);
      }
      
      return rec;
    });
    const newCount = normalised.filter(r => r.__sourceType === 'new').length;
    const legacyCount = normalised.length - newCount;
    setAllEnquiries(normalised);
  }, [enquiries, isAdmin, showMineOnly]);

  // Calculate counts for Mine/All scope badges
  const scopeCounts = useMemo(() => {
    // Mine count = enquiries claimed by the current user (where Point_of_Contact matches user email)
    const userEmail = userData?.[0]?.Email?.toLowerCase() || '';
    const mineCount = userEmail 
      ? allEnquiries.filter(e => {
          const poc = ((e as any).Point_of_Contact || (e as any).poc || '').toLowerCase().trim();
          return poc === userEmail;
        }).length
      : 0;
    const allCount = teamWideEnquiries.length > 0 ? teamWideEnquiries.length : allEnquiries.length;
    return { mineCount, allCount };
  }, [allEnquiries, teamWideEnquiries.length, userData]);

  // Map for claimer quick lookup
  const claimerMap = useMemo(() => {
    const map: Record<string, any> = {};
    teamData?.forEach(td => { if (td.Email) map[td.Email.toLowerCase()] = td; });
    return map;
  }, [teamData]);

  // Team member options for reassignment dropdown
  const teamMemberOptions = useMemo(() => {
    if (!teamData) return [];
    
    // Filter to active team members with emails
    const activeMembers = teamData.filter(td => 
      td.Email && 
      td.status?.toLowerCase() !== 'inactive' &&
      td.Email.toLowerCase() !== 'team@helix-law.com'
    );
    
    return activeMembers
      .map(td => ({
        value: td.Email!,
        text: `${td['Full Name'] || td.First || ''} (${td.Initials || '??'})`,
        initials: td.Initials || '??',
        email: td.Email!
      }))
      .sort((a, b) => a.text.localeCompare(b.text));
  }, [teamData]);

  // Handle reassignment click - open dropdown
  const handleReassignClick = useCallback((enquiryId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setReassignmentDropdown({
      enquiryId,
      x: rect.left,
      y: rect.bottom + 5
    });
  }, []);

  // Handle reassignment selection
  const handleReassignmentSelect = useCallback(async (selectedEmail: string) => {
    if (!selectedEmail || !reassignmentDropdown) return;
    
    const selectedOption = teamMemberOptions.find(option => option.value === selectedEmail);
    if (!selectedOption) return;
    
    const enquiryId = reassignmentDropdown.enquiryId;
    const newOwnerName = selectedOption.text.split(' (')[0];
    
    // Close dropdown immediately for snappy feel
    setReassignmentDropdown(null);
    setIsReassigning(true);
    
    // Show in-progress toast
    setToastMessage('Reassigning enquiry...');
    setToastDetails(`Moving to ${newOwnerName}`);
    setToastType('info');
    setToastVisible(true);
    
    try {
      const response = await fetch('/api/enquiries-unified/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ID: enquiryId,
          Point_of_Contact: selectedEmail
        })
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        // Update local state immediately for optimistic UI
        setAllEnquiries(prev => prev.map(enq => 
          String(enq.ID) === String(enquiryId)
            ? { ...enq, Point_of_Contact: selectedEmail, poc: selectedEmail }
            : enq
        ));
        setTeamWideEnquiries(prev => prev.map(enq => 
          String(enq.ID) === String(enquiryId)
            ? { ...enq, Point_of_Contact: selectedEmail, poc: selectedEmail }
            : enq
        ));
        
        // Show success toast
        setToastMessage('Enquiry reassigned');
        setToastDetails(`Now assigned to ${newOwnerName}`);
        setToastType('success');
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 3000);
        
        // Trigger full refresh after short delay
        if (onRefreshEnquiries) {
          setTimeout(() => onRefreshEnquiries(), 800);
        }
      } else {
        // Show error toast
        setToastMessage('Reassignment failed');
        setToastDetails(result.message || 'Please try again');
        setToastType('error');
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 4000);
      }
    } catch (error) {
      console.error('Error reassigning enquiry:', error);
      // Show error toast
      setToastMessage('Reassignment failed');
      setToastDetails(error instanceof Error ? error.message : 'Network error - please try again');
      setToastType('error');
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 4000);
    } finally {
      setIsReassigning(false);
    }
  }, [reassignmentDropdown, teamMemberOptions, onRefreshEnquiries]);

  // Close reassignment dropdown
  const closeReassignmentDropdown = useCallback(() => {
    setReassignmentDropdown(null);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!reassignmentDropdown) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.reassignment-dropdown')) {
        closeReassignmentDropdown();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [reassignmentDropdown, closeReassignmentDropdown]);

  // Close POC dropdown when clicking outside
  useEffect(() => {
    if (!isPocDropdownOpen) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.poc-filter-dropdown')) {
        setIsPocDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isPocDropdownOpen]);

  // Helper function to get initials from POC email
  const getPocInitials = (pocEmail: string | null | undefined): string => {
    if (!pocEmail || pocEmail.toLowerCase() === 'team@helix-law.com') {
      return 'T';
    }
    
    const claimer = claimerMap[pocEmail.toLowerCase()];
    if (claimer?.Initials) {
      return claimer.Initials;
    }
    
    // Extract initials from email
    const emailPart = pocEmail.split('@')[0];
    if (emailPart.includes('.')) {
      const parts = emailPart.split('.');
      return parts.map(p => p[0]?.toUpperCase()).join('').slice(0, 2);
    }
    return emailPart.slice(0, 2).toUpperCase();
  };

  // Single select handler (pitch builder path)

  // Apply dataset toggle to derive display list without losing the other dataset
  useEffect(() => {
    debugLog('📊 Display derivation effect:', {
      allEnquiriesLength: allEnquiries.length,
      teamWideLength: teamWideEnquiries.length,
      isAdmin,
      showMineOnly,
      hasFetchedAllData: hasFetchedAllData.current
    });
    
    if (!allEnquiries.length) {
      debugLog('⚠️ No allEnquiries, clearing display');
      setDisplayEnquiries([]);
      return;
    }
    
    // CRITICAL FIX: Use teamWideEnquiries for ANY user in All mode who explicitly fetched it
    // Only use user-filtered allEnquiries when in Mine mode or when unified data not fetched
    const userEmail = userData?.[0]?.Email?.toLowerCase() || '';
    if (!showMineOnly && hasFetchedAllData.current && teamWideEnquiries.length > 0) {
      debugLog('🌐 All mode - showing unified data:', teamWideEnquiries.length);
      setDisplayEnquiries(teamWideEnquiries);
      return;
    }
    
    // For all other cases (Mine mode, or All mode without unified fetch), use allEnquiries
    debugLog('� Using allEnquiries (user-filtered from props):', allEnquiries.length);
    setDisplayEnquiries(allEnquiries);
  }, [allEnquiries, teamWideEnquiries, isAdmin, showMineOnly, userData]);

  // Initialize selected areas with user's areas + Other/Unsure
  useEffect(() => {
    // Don't override if user has manually changed areas
    if (userManuallyChangedAreas) {
      return;
    }
    
    if (userData && userData.length > 0 && userData[0].AOW) {
      const userAOW = userData[0].AOW.split(',').map(a => a.trim());
      
      // Check if this would actually change the selection
      const newSelection = [...userAOW];
      if (!newSelection.includes('Other/Unsure')) {
        newSelection.push('Other/Unsure');
      }
      
      // Only update if the selection would actually change
      const currentSorted = [...selectedAreas].sort();
      const newSorted = [...newSelection].sort();
      const isActuallyDifferent = JSON.stringify(currentSorted) !== JSON.stringify(newSorted);
      
      if (isActuallyDifferent) {
        setSelectedAreas(newSelection);
      }
    }
  }, [userData, userManuallyChangedAreas]); // Added userManuallyChangedAreas to dependencies

  // Custom handler for manual area changes to prevent useEffect overrides
  const handleManualAreaChange = useCallback((newAreas: string[]) => {
    setUserManuallyChangedAreas(true);
    setSelectedAreas(newAreas);
  }, []);

  // Reset manual flag when UserBubble changes userData (allow UserBubble override to work)
  const prevUserDataRef = useRef<typeof userData>();
  useEffect(() => {
    if (prevUserDataRef.current !== userData) {
      setUserManuallyChangedAreas(false);
      prevUserDataRef.current = userData;
    }
  }, [userData]);

  // Auto-enable area filters for Mine/Claimed enquiries to prevent misleading UI
  // (e.g., showing Construction enquiries but Construction filter appears off)
  useEffect(() => {
    // Only auto-adjust in Mine/Claimed mode, and only if user hasn't manually changed areas
    if (showMineOnly && activeState === 'Claimed' && !userManuallyChangedAreas) {
      const userEmail = userData?.[0]?.Email?.toLowerCase() || '';
      if (!userEmail) return;

      // Use the UNFILTERED dataset (allEnquiries) to find what areas user actually has claimed
      // This prevents chicken-egg issue where AoW filters hide enquiries before we can detect their areas
      const sourceDataset = allEnquiries.length > 0 ? allEnquiries : displayEnquiries;
      if (sourceDataset.length === 0) return;

      const norm = (s: unknown): string => (typeof s === 'string' ? s.trim().toLowerCase() : '');
      const userEmailNorm = norm(userEmail);

      // Find all areas present in user's claimed enquiries (from unfiltered data)
      const areasInClaimed = new Set<string>();
      for (const enquiry of sourceDataset) {
        const poc = norm((enquiry as any).Point_of_Contact || (enquiry as any).poc || '');
        if (poc === userEmailNorm) {
          const area = (enquiry.Area_of_Work || '').trim();
          if (area) {
            // Normalize area names to match filter names
            const areaLower = area.toLowerCase();
            if (areaLower.includes('other') || areaLower.includes('unsure')) {
              areasInClaimed.add('Other/Unsure');
            } else {
              // Capitalize first letter of each word for standard areas
              const normalizedArea = area.charAt(0).toUpperCase() + area.slice(1).toLowerCase();
              areasInClaimed.add(normalizedArea);
            }
          } else {
            areasInClaimed.add('Other/Unsure');
          }
        }
      }

      if (areasInClaimed.size > 0) {
        const areasArray = Array.from(areasInClaimed);
        // Check if current selection matches claimed areas
        const currentSorted = [...selectedAreas].sort();
        const claimedSorted = areasArray.sort();
        const needsUpdate = JSON.stringify(currentSorted) !== JSON.stringify(claimedSorted);

        if (needsUpdate) {
          debugLog('🎯 Auto-enabling area filters for Mine/Claimed enquiries:', areasArray);
          setSelectedAreas(areasArray);
        }
      }
    }
  }, [showMineOnly, activeState, allEnquiries, userData, userManuallyChangedAreas, selectedAreas]);

  // Auto-enable all area filters for admin users
  useEffect(() => {
    // Only auto-enable if user is admin and hasn't manually changed areas
    debugLog('🔍 Admin auto-enable check:', {
      isAdmin,
      userManuallyChangedAreas,
      activeState,
      currentSelectedAreas: selectedAreas,
      shouldAutoEnable: isAdmin && !userManuallyChangedAreas
    });

    if (isAdmin && !userManuallyChangedAreas) {
      const allAreas = ['Commercial', 'Construction', 'Property', 'Employment', 'Misc/Other'];
      
      // Check if current selection matches all areas
      const currentSorted = [...selectedAreas].sort();
      const allAreasSorted = [...allAreas].sort();
      const needsUpdate = JSON.stringify(currentSorted) !== JSON.stringify(allAreasSorted);

      debugLog('🎯 Admin area comparison:', {
        currentSorted,
        allAreasSorted,
        needsUpdate
      });

      if (needsUpdate) {
        debugLog('👑 Admin: Auto-enabling all area filters');
        setSelectedAreas(allAreas);
      }
    }
  }, [isAdmin, userManuallyChangedAreas, activeState]); // Add activeState so admin filters auto-enable when switching states

  // Don't pre-fetch team-wide data on mount anymore
  // Let users explicitly request "All" mode when they need it
  // This prevents the dataset override issue for regular users
  // useEffect(() => {
  //   if (teamWideEnquiries.length === 0 && !isLoadingAllData && !hasFetchedAllData.current) {
  //     debugLog('🌐 Fetching team-wide enquiries for suppression index');
  //     fetchAllEnquiries().then((data) => {
  //       if (data && data.length > 0) {
  //         setTeamWideEnquiries(data);
  //         debugLog('✅ Team-wide suppression data loaded:', data.length);
  //       }
  //     });
  //   }
  // }, []); // Disabled - only fetch when user toggles to All

  // Memoize user email to prevent unnecessary effect triggers
  const userEmail = useMemo(() => userData?.[0]?.Email?.toLowerCase() || '', [userData]);

  // Area of Work icon mapping to match Teams channels
  const getAreaOfWorkIcon = (areaOfWork: string): string => {
    const area = (areaOfWork || '').toLowerCase().trim();
    
    if (area.includes('triage')) return '🩺';
    if (area.includes('construction') || area.includes('building')) return '🏗️';
    if (area.includes('property') || area.includes('real estate') || area.includes('conveyancing')) return '🏠';
    if (area.includes('commercial') || area.includes('business')) return '🏢';
    if (area.includes('employment') || area.includes('hr') || area.includes('workplace')) return '👩🏻‍💼';
    if (area.includes('allocation')) return '📂';
    if (area.includes('general') || area.includes('misc') || area.includes('other')) return 'ℹ️';
    
    return 'ℹ️'; // Default icon for General/Other
  };

  // Format date received display
  const formatDateReceived = (dateStr: string | null, isFromInstructions: boolean): string => {
    if (!dateStr) return '--';
    
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const isToday = dateOnly.getTime() === today.getTime();
    const isYesterday = dateOnly.getTime() === yesterday.getTime();
    const isSameYear = date.getFullYear() === now.getFullYear();
    
    // Show time only for v2/instructions enquiries
    if (isFromInstructions) {
      const time = format(date, 'HH:mm');
      
      // If today, just show time
      if (isToday) {
        return time;
      }
      
      // If yesterday, show "Yesterday"
      if (isYesterday) {
        return 'Yesterday';
      }
      
      // For dates older than yesterday, show day and date
      const dayName = format(date, 'EEE');
      const dateFormat = isSameYear ? 'd MMM' : 'd MMM yyyy';
      return `${dayName}, ${format(date, dateFormat)}`;
    }
    
    // For legacy enquiries (no time) - use same format
    if (isToday) {
      // Even for legacy, show time if available, otherwise show "Today"
      const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
      if (hasTime) {
        return format(date, 'HH:mm');
      }
      return 'Today';
    } else if (isYesterday) {
      return 'Yesterday';
    } else {
      const dayName = format(date, 'EEE');
      const dateFormat = isSameYear ? 'd MMM' : 'd MMM yyyy';
      return `${dayName}, ${format(date, dateFormat)}`;
    }
  };

  const formatFullDateTime = (dateStr: string | null): string => {
    if (!dateStr) {
      return 'Timestamp unavailable';
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return 'Timestamp unavailable';
    }

    return date.toLocaleString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    });
  };

  // Time ago helper for stacked display
  const timeAgo = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const now = new Date();
    const then = new Date(dateStr);
    if (isNaN(then.getTime())) return '';
    const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  // Get compact time display - single line format
  const getCompactTimeDisplay = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    const isLegacyPlaceholder = timePart === '00:00';
    
    // Today: show time + relative (e.g. "14:32 · 2h")
    if (d.toDateString() === now.toDateString()) {
      if (isLegacyPlaceholder) return 'Today';
      if (diffHours < 1) return `${Math.floor(diffMs / 60000)}m ago`;
      return `${timePart}`;
    }
    
    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return isLegacyPlaceholder ? 'Yesterday' : `Yest ${timePart}`;
    }
    
    // Within 7 days: show day name + time
    if (diffDays < 7) {
      const dayName = d.toLocaleDateString('en-GB', { weekday: 'short' });
      return isLegacyPlaceholder ? dayName : `${dayName} ${timePart}`;
    }
    
    // Older: show date
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  
  // Format day separator label (e.g. "Today", "Yesterday", "Mon 30 Dec")
  const formatDaySeparatorLabel = (dayKey: string): string => {
    if (!dayKey) return '';
    const d = new Date(dayKey + 'T12:00:00'); // Use noon to avoid timezone issues
    if (isNaN(d.getTime())) return dayKey;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    
    if (targetDay.getTime() === today.getTime()) {
      return 'Today';
    }
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (targetDay.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    }
    
    // Within 7 days: show day name + date
    const diffDays = (today.getTime() - targetDay.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 7) {
      return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    }
    
    // Older: show full date
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };
  
  // Legacy helper - keep for compatibility but redirect to compact
  const getStackedTimeParts = (dateStr: string | null): { datePart: string; timePart: string; relative: string } => {
    const compact = getCompactTimeDisplay(dateStr);
    return { datePart: compact, timePart: '', relative: '' };
  };

  // Format claim time display
  const formatClaimTime = (claimDate: string | null, pocEmail: string, isFromInstructions: boolean): string => {
    if (!claimDate) {
      const isUnclaimed = (pocEmail || '').toLowerCase() === 'team@helix-law.com';
      return isUnclaimed ? 'Unclaimed' : '--';
    }
    
    // For legacy enquiries, just show --
    if (!isFromInstructions) {
      return '--';
    }
    
    // For v2/instructions enquiries, show relative time
    const date = new Date(claimDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  };

  // Calculate time difference between enquiry received and claim time for v2 enquiries
  const calculateTimeDifference = (dateReceived: string | null, claimDate: string | null, isFromInstructions: boolean): string => {
    if (!dateReceived || !claimDate || !isFromInstructions) {
      return '';
    }
    
    const receivedDate = new Date(dateReceived);
    const claimedDate = new Date(claimDate);
    
    if (isNaN(receivedDate.getTime()) || isNaN(claimedDate.getTime())) {
      return '';
    }
    
    const diffMs = claimedDate.getTime() - receivedDate.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMs < 0) {
      return ''; // Don't show if claim time is before received time
    }
    
    if (diffMins < 60) {
      return `${diffMins}m`;
    } else if (diffHours < 24) {
      return `${diffHours}h`;
    } else if (diffDays === 1) {
      return `1d`;
    } else {
      return `${diffDays}d`;
    }
  };

  // Calculate gradient colors for time difference badges based on claim speed (0-60 minutes, 1h = max/worst)
  const getTimeDifferenceColors = (dateReceived: string | null, claimDate: string | null, isFromInstructions: boolean, isDarkMode: boolean) => {
    if (!dateReceived || !claimDate || !isFromInstructions) {
      return {
        background: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
        color: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)',
        border: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)'
      };
    }
    
    const receivedDate = new Date(dateReceived);
    const claimedDate = new Date(claimDate);
    
    if (isNaN(receivedDate.getTime()) || isNaN(claimedDate.getTime())) {
      return {
        background: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
        color: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)',
        border: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)'
      };
    }
    
    const diffMs = claimedDate.getTime() - receivedDate.getTime();
    const diffMins = Math.max(0, Math.floor(diffMs / (1000 * 60)));
    
    // Calculate gradient: 0 minutes = green (best), 60+ minutes = red (worst)
    const ratio = Math.min(diffMins / 60, 1); // Clamp to 0-1 range
    
    // RGB values: Green (34, 197, 94) to Red (248, 113, 113)
    const red = Math.floor(34 + (248 - 34) * ratio);
    const green = Math.floor(197 + (113 - 197) * ratio);
    const blue = Math.floor(94 + (113 - 94) * ratio);
    
    return {
      background: `rgba(${red}, ${green}, ${blue}, ${isDarkMode ? 0.15 : 0.1})`,
      color: `rgb(${Math.floor(red * 0.8)}, ${Math.floor(green * 0.8)}, ${Math.floor(blue * 0.8)})`,
      border: `rgba(${red}, ${green}, ${blue}, ${isDarkMode ? 0.3 : 0.25})`
    };
  };

  // Fetch all enquiries when ANY user switches to "All" mode OR when in Mine+Claimed mode
  useEffect(() => {
    if (isLoadingAllData) return; // Prevent multiple concurrent fetches
    
    const needsFullDataset = !showMineOnly || (showMineOnly && activeState === 'Claimed');
    
  debugLog('🔄 Toggle useEffect triggered:', { isAdmin, showMineOnly, activeState, userEmail, hasData: displayEnquiries.length, needsFullDataset });
    
    if (showMineOnly && activeState !== 'Claimed') {
      // Regular Mine mode - use whatever dataset we have
      const source = allEnquiries.length > 0 ? allEnquiries : teamWideEnquiries;
      debugLog('🔄 Mine mode (not Claimed) - using current dataset for filtering:', source.length);
      setDisplayEnquiries(source);
      return;
    }
    
    // Fetch unfiltered data when:
    // 1. User switches to All mode, OR
    // 2. User is in Mine+Claimed mode (needs full dataset to find all claimed enquiries)
    if (needsFullDataset && !hasFetchedAllData.current) {
      debugLog('🔄 Fetching complete dataset for:', showMineOnly ? 'Mine+Claimed mode' : 'All mode');
      fetchAllEnquiries();
    }
  }, [showMineOnly, activeState, userEmail, fetchAllEnquiries, isAdmin]); // Simplified dependencies

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
    setShowUnclaimedBoard((prev) => {
      const next = !prev;
      // When opening Unclaimed view, force table mode (user request)
      if (next && viewMode === 'card') {
        setViewMode('table');
      }
      return next;
    });
  }, [viewMode]);

  // Ensure if unclaimed view is auto-opened (session flag) it defaults to table layout
  useEffect(() => {
    if (showUnclaimedBoard && viewMode === 'card') {
      setViewMode('table');
    }
  }, [showUnclaimedBoard, viewMode]);

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

  

  // Temporary dedupe during platform transition: prefer Claimed > Triaged > Unclaimed and prefer v2 over legacy on ties
  const dedupedEnquiries = useMemo(() => {
    if (!displayEnquiries || displayEnquiries.length === 0) return [] as (Enquiry & { __sourceType: 'new' | 'legacy' })[];

    // Skip deduplication in Claimed view and whenever the user is filtering (search or explicit ID lookups)
    // Search is typically investigative work where each raw record matters.
    if (activeState === 'Claimed' || isIdSearch || hasActiveSearch) {
      return [...displayEnquiries] as (Enquiry & { __sourceType: 'new' | 'legacy' })[];
    }

    // Basic triaged detection (aligned with Reporting heuristics)
    const isTriagedPoc = (value: string): boolean => {
      const v = (value || '').toLowerCase();
      if (!v) return false;
      return v.includes('triage') || v.includes('triaged');
    };

    const statusRank = (pocRaw: string): number => {
      const v = (pocRaw || '').toLowerCase().trim();
      if (!v || v === 'team@helix-law.com' || v === 'team' || v === 'anyone' || v === 'unassigned' || v === 'unknown' || v === 'n/a') return 0; // Unclaimed
      if (isTriagedPoc(v)) return 1; // Triaged
      return 2; // Claimed
    };

    const parseDate = (val: unknown): Date | null => {
      if (!val || typeof val !== 'string') return null;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };

    const createdAt = (e: any): Date => {
      return (
        parseDate(e.Touchpoint_Date) ||
        parseDate(e.datetime) ||
        parseDate(e.claim) ||
        new Date(0)
      ) as Date;
    };

    const timeBucketKey = (d: Date, mins = 180): string => {
      if (!d || isNaN(d.getTime())) return 'invalid';
      const day = d.toISOString().split('T')[0];
      const bucket = Math.floor((d.getUTCHours() * 60 + d.getUTCMinutes()) / mins);
      return `${day}#${bucket}`;
    };
    const dayKey = (d: Date): string => {
      if (!d || isNaN(d.getTime())) return 'invalid';
      return d.toISOString().split('T')[0];
    };

  const normEmail = (s: unknown): string => (typeof s === 'string' ? s.trim().toLowerCase() : '');
  const normPhone = (s: unknown): string => (typeof s === 'string' ? s.replace(/\D/g, '').slice(-7) : '');

    const fuzzyKey = (e: any): string => {
      const d = createdAt(e);
      const day = dayKey(d);
      const email = normEmail(e.Email || e.email);
      const phone = normPhone(e.Phone_Number || e.phone);
      const aow = (e.Area_of_Work || e.aow || '').toString().toLowerCase();
      const name = [e.First_Name || e.first || '', e.Last_Name || e.last || '']
        .map((x: string) => (x || '').trim().toLowerCase())
        .filter(Boolean)
        .join(' ');
      
      // For team emails (prospects@helix-law.com), use name as primary identifier
      const isTeamEmail = email.includes('prospects@') || email.includes('team@');
      
      // Strong signal: if personal email (non-team) or phone present, group per day
      // EXCLUDE team emails from this logic entirely, even if they have a phone number
      // (because we want to use Name+ID for team emails to be safe)
      if (!isTeamEmail && (email || phone)) {
        const contact = email || phone;
        return showMineOnly ? `${contact}|${day}` : `${contact}|${day}`;
      }
      
      // For team emails or name-only: include name+AOW to keep different people separate
      // CRITICAL FIX: For prospects@/team@ emails, we MUST ensure unique keys
      // because the legacy DB reuses IDs like 28609 for hundreds of different people
      if (isTeamEmail) {
        // Always use a unique key that includes ID + day + name (or row identifier if no name)
        // This prevents merging different people who share the same ID and email
        const uniqueId = e.ID || e.id || 'no-id';
        
        if (!name) {
          // No name available - use ID + day + AOW to force uniqueness
          const key = `noid:${uniqueId}|${aow}|${day}`;
          return key;
        }
        
        // Name is present - use name + ID + day to ensure complete uniqueness
        const key = `${name}|${uniqueId}|${day}`;
        return key;
      }

      const contact = name || email || 'unknown';
      return `${contact}|${aow}|${day}`;
    };

    const isV2 = (e: any): boolean => {
      if (e.__sourceType) return e.__sourceType === 'new';
      // fallback heuristic
      return 'id' in e || 'datetime' in e || 'stage' in e || 'claim' in e;
    };

    const currentUserEmail = (userData?.[0]?.Email || '').toLowerCase();
    const pickBetter = (a: any, b: any): any => {
      // If we're in Mine view, bias towards the record assigned to the current user
      if (showMineOnly && currentUserEmail) {
        const aPoc = (a.Point_of_Contact || a.poc || '').toLowerCase();
        const bPoc = (b.Point_of_Contact || b.poc || '').toLowerCase();
        const aMine = aPoc === currentUserEmail;
        const bMine = bPoc === currentUserEmail;
        if (aMine !== bMine) return aMine ? a : b;
      }
      const rankA = statusRank(a.Point_of_Contact || a.poc || '');
      const rankB = statusRank(b.Point_of_Contact || b.poc || '');
      if (rankA !== rankB) return rankA > rankB ? a : b;
      const v2A = isV2(a);
      const v2B = isV2(b);
      if (v2A !== v2B) return v2A ? a : b;
      // newer wins
      const da = createdAt(a);
      const db = createdAt(b);
      return (da.getTime() >= db.getTime()) ? a : b;
    };

    // Avoid over-merging distinct enquiries: only merge when we have a strong identity match
    const sameIdentity = (a: any, b: any): boolean => {
      // Check email match (but skip team emails like prospects@helix-law.com)
      const aEmail = normEmail(a.Email || a.email);
      const bEmail = normEmail(b.Email || b.email);
      const aIsTeamEmail = aEmail.includes('prospects@') || aEmail.includes('team@');
      const bIsTeamEmail = bEmail.includes('prospects@') || bEmail.includes('team@');
      
      if (aEmail && bEmail && !aIsTeamEmail && !bIsTeamEmail) {
        return aEmail === bEmail;
      }
      
      // Check phone match
      const aPhone = normPhone(a.Phone_Number || a.phone);
      const bPhone = normPhone(b.Phone_Number || b.phone);
      if (aPhone && bPhone) return aPhone === bPhone;
      
      // Check name match - if names differ significantly, they're different people
      const aName = `${(a.First_Name || a.first || '')} ${(a.Last_Name || a.last || '')}`.trim().toLowerCase();
      const bName = `${(b.First_Name || b.first || '')} ${(b.Last_Name || b.last || '')}`.trim().toLowerCase();
      if (aName && bName && aName !== bName) {
        return false; // Different names = different people
      }
      
      // If neither email (or only team emails), phone, nor names can confirm identity, don't merge
      return false;
    };

    let uniqueSuffix = 0;
    const map = new Map<string, any>();
    
    const getSourceType = (record: any): 'new' | 'legacy' => {
      return (record.__sourceType as 'new' | 'legacy' | undefined) || detectSourceType(record);
    };

    for (const e of displayEnquiries) {
      const baseKey = fuzzyKey(e);
      const existing = map.get(baseKey);
      const forceFullHistory = shouldAlwaysShowProspectHistory(e);

      if (forceFullHistory) {
        // Shared team IDs (e.g. 28609) intentionally reuse IDs when no personal email exists.
        // Never dedupe these records so investigators can expand the grouped row and see every contact.
        uniqueSuffix += 1;
        const historyKey = `${String(e.ID || (e as any).id || 'shared')}|${createdAt(e).getTime()}|${uniqueSuffix}`;
        map.set(historyKey, e);
        continue;
      }
      
      if (!existing) {
        map.set(baseKey, e);
      } else {
        const existingId = String(existing.ID || (existing as any).id || '');
        const eId = String(e.ID || (e as any).id || '');
        const idsDiffer = existingId && eId && existingId !== eId;
        
        if (idsDiffer) {
          const identityMatch = sameIdentity(existing, e);
          if (!identityMatch) {
            uniqueSuffix += 1;
            map.set(`${baseKey}#${uniqueSuffix}`, e);
            continue;
          }

          const existingSource = getSourceType(existing);
          const newSource = getSourceType(e);
          const isCrossSourceDup = existingSource !== newSource;

          if (!isCrossSourceDup) {
            uniqueSuffix += 1;
            map.set(`${baseKey}#${uniqueSuffix}`, e);
            continue;
          }
        } else {
          // IDs match. Check if they are actually different people (e.g. shared ID for prospects@)
          const identityMatch = sameIdentity(existing, e);
          if (!identityMatch) {
            uniqueSuffix += 1;
            map.set(`${baseKey}#${uniqueSuffix}`, e);
            continue;
          }
        }

        map.set(baseKey, pickBetter(existing, e));
      }
    }
    
    return Array.from(map.values()) as (Enquiry & { __sourceType: 'new' | 'legacy' })[];
  }, [displayEnquiries, showMineOnly, userData, activeState]);

  // Build a suppression index: if a claimed record exists for the same contact on the same day, suppress unclaimed copies
  // IMPORTANT: Use teamWideEnquiries (includes all team members' claims), not allEnquiries (may be filtered to current user)
  const claimedContactDaySet = useMemo(() => {
    const normEmail = (s: unknown): string => (typeof s === 'string' ? s.trim().toLowerCase() : '');
    const normPhone = (s: unknown): string => (typeof s === 'string' ? s.replace(/\D/g, '').slice(-7) : '');
    const dayKey = (val: unknown): string => {
      if (!val || typeof val !== 'string') return 'invalid';
      const d = new Date(val);
      if (isNaN(d.getTime())) return 'invalid';
      return d.toISOString().split('T')[0];
    };
    const isTriaged = (p: string) => (p || '').toLowerCase().includes('triage');
    const set = new Set<string>();
    let claimedCount = 0;
    for (const e of teamWideEnquiries) {
      const poc = (e.Point_of_Contact || (e as any).poc || '').toLowerCase();
      const claimed = poc && !unclaimedEmails.includes(poc) && !isTriaged(poc);
      if (!claimed) continue;
      claimedCount++;
      const email = normEmail((e as any).Email || (e as any).email);
      const phone = normPhone((e as any).Phone_Number || (e as any).phone);
      const name = [
        (e as any).First_Name || (e as any).first || '',
        (e as any).Last_Name || (e as any).last || ''
      ]
        .map((x: string) => (x || '').trim().toLowerCase())
        .filter(Boolean)
        .join(' ');
      const contact = email || phone || name || 'unknown';
      const day = dayKey((e as any).Touchpoint_Date || (e as any).datetime || (e as any).claim);
      const key = `${contact}|${day}`;
      set.add(key);
    }
    return set;
  }, [teamWideEnquiries, unclaimedEmails]);

  const unclaimedEnquiries = useMemo(
    () => {
      const result = dedupedEnquiries.filter((e) => {
        const poc = (e.Point_of_Contact || (e as any).poc || '').toLowerCase();
        if (poc !== 'team@helix-law.com') return false;
        // suppression: if claimed exists for same contact/day, hide
        const email = typeof (e as any).Email === 'string' ? (e as any).Email.toLowerCase() : (typeof (e as any).email === 'string' ? (e as any).email.toLowerCase() : '');
        const phone = typeof (e as any).Phone_Number === 'string' ? (e as any).Phone_Number.replace(/\D/g, '').slice(-7) : (typeof (e as any).phone === 'string' ? (e as any).phone.replace(/\D/g, '').slice(-7) : '');
        const name = [
          (e as any).First_Name || (e as any).first || '',
          (e as any).Last_Name || (e as any).last || ''
        ]
          .map((x: string) => (x || '').trim().toLowerCase())
          .filter(Boolean)
          .join(' ');
        const contact = email || phone || name || 'unknown';
        const dateStr = (e as any).Touchpoint_Date || (e as any).datetime || (e as any).claim || '';
        const d = new Date(dateStr);
        const day = isNaN(d.getTime()) ? 'invalid' : d.toISOString().split('T')[0];
        const key = `${contact}|${day}`;
        return !claimedContactDaySet.has(key);
      });
      
      // Sort by touchpoint date (desc) to ensure day separators appear correctly
      return result.sort((a, b) => {
        const da = new Date((a as any).Touchpoint_Date || (a as any).datetime || (a as any).claim || 0).getTime();
        const db = new Date((b as any).Touchpoint_Date || (b as any).datetime || (b as any).claim || 0).getTime();
        return db - da;
      });
    },
    [dedupedEnquiries, claimedContactDaySet]
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
    setActiveSubTab(key);
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

  // Handle deep link navigation from Home page To Do actions
  useEffect(() => {
    // Only process navigation when tab is active
    if (!isActive) return;
    
    const navEnquiryId = localStorage.getItem('navigateToEnquiryId');
    if (navEnquiryId) {
      localStorage.removeItem('navigateToEnquiryId');
      const navTimelineItem = localStorage.getItem('navigateToTimelineItem');
      localStorage.removeItem('navigateToTimelineItem');
      
      const found = displayEnquiries.find(e => String(e.ID) === navEnquiryId);
      if (found) {
        // Select the enquiry
        setSelectedEnquiry(found);
        // If we need to navigate to a timeline item, go to Timeline sub-tab
        if (navTimelineItem) {
          setActiveSubTab('Timeline');
          // Store for EnquiryTimeline to pick up and scroll to specific item
          sessionStorage.setItem('scrollToTimelineItem', navTimelineItem);
        } else {
          // Default behavior: go to Pitch sub-tab
          setActiveSubTab('Pitch');
        }
      }
    }
  }, [isActive, displayEnquiries]);

  const ensureDemoEnquiryPresent = useCallback(() => {
    const currentUserEmail = userData && userData[0] && userData[0].Email
      ? userData[0].Email
      : 'lz@helix-law.com';

    try {
      localStorage.setItem(DEMO_MODE_STORAGE_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    setDemoModeEnabled(true);

    const demoEnquiry: Enquiry & { __sourceType: 'new' | 'legacy' } = {
      ...DEV_PREVIEW_TEST_ENQUIRY,
      Point_of_Contact: currentUserEmail,
      Touchpoint_Date: new Date().toISOString().split('T')[0],
    };

    setDisplayEnquiries(prev => {
      const existingIndex = prev.findIndex(e => e.ID === DEV_PREVIEW_TEST_ENQUIRY.ID);
      if (existingIndex === -1) {
        return [demoEnquiry, ...prev];
      }
      const existing = prev[existingIndex];
      const needsUpdate = (existing.Point_of_Contact || '').toLowerCase() !== currentUserEmail.toLowerCase();
      const isAlreadyFirst = existingIndex === 0;
      if (!needsUpdate && isAlreadyFirst) {
        return prev;
      }
      const next = [...prev];
      next.splice(existingIndex, 1);
      next.unshift(needsUpdate ? { ...existing, Point_of_Contact: currentUserEmail } : existing);
      return next;
    });

    // Also inject synthetic enrichment data for the demo record
    const now = new Date();
    const pitchedDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    setEnrichmentMap(prevMap => {
      if (prevMap.has(DEV_PREVIEW_TEST_ENQUIRY.ID)) {
        return prevMap;
      }
      const newMap = new Map(prevMap);
      newMap.set(DEV_PREVIEW_TEST_ENQUIRY.ID, {
        enquiryId: DEV_PREVIEW_TEST_ENQUIRY.ID,
        teamsData: {
          Id: 99999,
          ActivityId: 'demo-activity-99999',
          ChannelId: 'demo-channel',
          TeamId: 'demo-team',
          EnquiryId: DEV_PREVIEW_TEST_ENQUIRY.ID,
          LeadName: 'Demo Client',
          Email: DEV_PREVIEW_TEST_ENQUIRY.Email || '',
          Phone: DEV_PREVIEW_TEST_ENQUIRY.Phone_Number || '',
          CardType: 'enquiry',
          MessageTimestamp: now.toISOString(),
          TeamsMessageId: 'demo-msg-99999',
          CreatedAtMs: now.getTime(),
          Stage: 'Enquiry',
          Status: 'Active',
          ClaimedBy: currentUserEmail.split('@')[0].toUpperCase(),
          ClaimedAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          CreatedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          UpdatedAt: now.toISOString(),
          teamsLink: '',
        },
        pitchData: {
          dealId: 99999,
          email: DEV_PREVIEW_TEST_ENQUIRY.Email || '',
          serviceDescription: 'Contract Disputes',
          amount: 1500,
          status: 'Pitched',
          areaOfWork: 'commercial',
          pitchedBy: 'LZ',
          pitchedDate: pitchedDate.toISOString().split('T')[0],
          pitchedTime: pitchedDate.toTimeString().split(' ')[0],
          scenarioId: 'before-call-call',
          scenarioDisplay: 'Before call (call)',
        }
      });
      return newMap;
    });
  }, [userData]);

  // Listen for demo mode event (from UserBubble menu)
  useEffect(() => {
    const handleSelectTestEnquiry = () => {
      ensureDemoEnquiryPresent();
      setActiveState('Claimed');

      setToastMessage('Demo Mode enabled');
      setToastDetails('A stable demo enquiry has been added and pinned to the top of your Claimed list. Use it to demo Enquiries (cards/table), Pitch Builder and Timeline without relying on live test data.');
      setToastType('info');
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 4500);
    };

    window.addEventListener('selectTestEnquiry', handleSelectTestEnquiry);
    return () => {
      window.removeEventListener('selectTestEnquiry', handleSelectTestEnquiry);
    };
  }, [ensureDemoEnquiryPresent]);

  useEffect(() => {
    if (!demoModeEnabled) {
      return;
    }
    ensureDemoEnquiryPresent();
  }, [demoModeEnabled, ensureDemoEnquiryPresent]);

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
      setNextRefreshIn(5 * 60); // Reset to 5 minutes
      debugLog('✅ Refresh completed successfully');
    } catch (error) {
      console.error('❌ Failed to refresh enquiries:', error);
      alert(`Refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRefreshing(false);
      debugLog('🏁 Refresh process finished');
    }
  }, [isRefreshing, onRefreshEnquiries]);

  // Keep ref updated with latest handleManualRefresh function
  useEffect(() => {
    handleManualRefreshRef.current = handleManualRefresh;
  }, [handleManualRefresh]);

  // Auto-refresh timer (5 minutes) - uses ref to avoid interval reset on function recreation
  useEffect(() => {
    // Clear existing intervals
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    // Set up 5-minute auto-refresh - uses ref so interval doesn't reset when function changes
    refreshIntervalRef.current = setInterval(() => {
      debugLog('⏰ Auto-refresh timer fired');
      if (handleManualRefreshRef.current) {
        handleManualRefreshRef.current();
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Set up countdown timer (updates every 30 seconds to reduce re-renders)
    // For a 5-minute timer, second-by-second updates are unnecessary
    countdownIntervalRef.current = setInterval(() => {
      setNextRefreshIn(prev => {
        const newValue = prev - 30;
        if (newValue <= 0) {
          return 5 * 60; // Reset to 5 minutes
        }
        return newValue;
      });
    }, 30000); // 30 seconds - reduces re-renders from 300 to 10 per cycle

    debugLog('🕐 Auto-refresh intervals initialized');

    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []); // Empty deps - only run once on mount

  // Format time remaining for display
  const formatTimeRemaining = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
    }
    return `${remainingMinutes}m ${remainingSeconds}s`;
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
      const response = await fetch('/api/enquiries-unified/update', {
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
      // Track this update to prevent it from being overwritten by stale prop data
      recentUpdatesRef.current.set(enquiryId, {
        field: 'Area_of_Work',
        value: newArea,
        timestamp: Date.now()
      });

      const response = await fetch('/api/enquiries-unified/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ID: enquiryId, Area_of_Work: newArea }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Remove from recent updates if failed
        recentUpdatesRef.current.delete(enquiryId);
        throw new Error(`Failed to update enquiry area: ${errorText}`);
      }

      // Update local state - create new array references to trigger re-renders
      const updateEnquiry = (enquiry: Enquiry & { __sourceType: 'new' | 'legacy' }): Enquiry & { __sourceType: 'new' | 'legacy' } => {
        if (enquiry.ID === enquiryId) {
          return { ...enquiry, Area_of_Work: newArea };
        }
        return enquiry;
      };

      // Update allEnquiries first, then let the useEffect handle displayEnquiries
      setAllEnquiries(prev => {
        const updated = prev.map(updateEnquiry);
        // Also immediately update displayEnquiries to prevent visual glitch
        setDisplayEnquiries(prevDisplay => prevDisplay.map(updateEnquiry));
        return updated;
      });

      // Clear this update from tracking after 5 seconds
      setTimeout(() => {
        recentUpdatesRef.current.delete(enquiryId);
      }, 5000);
      
      // Show success toast
      setToastMessage(`Area updated`);
      setToastDetails(`Enquiry area changed to ${newArea}`);
      setToastType('success');
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 3000);
      
  debugLog('✅ Enquiry area updated successfully:', enquiryId, 'to', newArea);
      
    } catch (error) {
      console.error('Failed to update enquiry area:', error);
      // Show error toast
      setToastMessage(`Failed to update area`);
      setToastDetails(error instanceof Error ? error.message : 'Unknown error');
      setToastType('error');
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 5000);
      throw error;
    }
  }, []);

  const handleSaveEnquiry = useCallback(async (enquiryId: string, updates: Partial<Enquiry>) => {
    try {
      const response = await fetch('/api/enquiries-unified/update', {
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

  const handleRatingChange = useCallback(async (enquiryId: string, newRating: string) => {
    try {
      // Track this update to prevent it from being overwritten by stale prop data
      recentUpdatesRef.current.set(enquiryId, {
        field: 'Rating',
        value: newRating,
        timestamp: Date.now()
      });

      const response = await fetch('/api/enquiries-unified/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ID: enquiryId, Rating: newRating }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Remove from recent updates if failed
        recentUpdatesRef.current.delete(enquiryId);
        throw new Error(`Failed to update enquiry rating: ${errorText}`);
      }

      // Update local state - create new array references to trigger re-renders
      const updateEnquiry = (enquiry: Enquiry & { __sourceType: 'new' | 'legacy' }): Enquiry & { __sourceType: 'new' | 'legacy' } => {
        if (enquiry.ID === enquiryId) {
          return { ...enquiry, Rating: newRating as 'Good' | 'Neutral' | 'Poor' };
        }
        return enquiry;
      };

      // Update allEnquiries first, then let the useEffect handle displayEnquiries
      setAllEnquiries(prev => {
        const updated = prev.map(updateEnquiry);
        // Also immediately update displayEnquiries to prevent visual glitch
        setDisplayEnquiries(prevDisplay => prevDisplay.map(updateEnquiry));
        return updated;
      });

      // Clear this update from tracking after 5 seconds
      setTimeout(() => {
        recentUpdatesRef.current.delete(enquiryId);
      }, 5000);
      
      // Show success toast with real-time feedback
      setToastMessage(`Rating updated`);
      setToastDetails(`Enquiry rated as ${newRating}`);
      setToastType('success');
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 3000);
      
      debugLog('✅ Enquiry rating updated successfully:', enquiryId, 'to', newRating);
      
    } catch (error) {
      console.error('Failed to update enquiry rating:', error);
      // Show error toast
      setToastMessage(`Failed to update rating`);
      setToastDetails(error instanceof Error ? error.message : 'Unknown error');
      setToastType('error');
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 5000);
      throw error;
    }
  }, []);

  const submitRating = useCallback(async () => {
    if (ratingEnquiryId && currentRating) {
      try {
        // Use handleRatingChange which has proper state updates and toast feedback
        await handleRatingChange(ratingEnquiryId, currentRating);
        closeRateModal();
      } catch (error) {
        console.error('Error submitting rating:', error);
        // Error toast already shown by handleRatingChange
      }
    }
  }, [ratingEnquiryId, currentRating, handleRatingChange, closeRateModal]);

  // Delete enquiry function
  const handleDeleteEnquiry = useCallback(async (enquiryId: string, enquiryName: string) => {
    try {
      const response = await fetch(`/api/enquiries-unified/${enquiryId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      // Remove from local state immediately for responsive UI
      setAllEnquiries(prevEnquiries => prevEnquiries.filter(e => e.ID !== enquiryId));
      setDisplayEnquiries(prevDisplay => prevDisplay.filter(e => e.ID !== enquiryId));
      setTeamWideEnquiries(prevTeamWide => prevTeamWide.filter(e => e.ID !== enquiryId));

      // Show success toast
      setToastMessage(`Enquiry deleted`);
      setToastDetails(`${enquiryName} has been permanently removed`);
      setToastType('success');
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 3000);
      
    } catch (error) {
      console.error('[Enquiries] Failed to delete enquiry:', error);
      // Show error toast
      setToastMessage(`Failed to delete enquiry`);
      setToastDetails(error instanceof Error ? error.message : 'Unknown error');
      setToastType('error');
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 5000);
      throw error;
    }
  }, []);

  // Handler to filter by person initials
  const handleFilterByPerson = useCallback((initials: string) => {
    setSelectedPersonInitials(prev => prev === initials ? null : initials);
  }, []);

  const filteredEnquiries = useMemo(() => {
    let filtered = dedupedEnquiries; // Use deduped full dataset, not slider range

    const userEmail = userData && userData[0] && userData[0].Email
      ? userData[0].Email.toLowerCase()
      : '';

    const effectiveUserEmail = userEmail;

    // Skip AoW filtering in two cases:
    // 1. "All" mode - show everything regardless of filters ("all means all")
    // 2. Mine/Claimed mode - show all user's claimed enquiries (filters just indicate what they have)
    const skipAoWFilters = !showMineOnly || activeState === 'Claimed';

    // Filter by activeState first (supports Claimed, Unclaimed, etc.)
    if (activeState === 'Claimed') {
      if (showMineOnly) {
        // Mine only view
        const beforeCount = filtered.length;
        const mineItems: any[] = [];
        const norm = (s: unknown): string => (typeof s === 'string' ? s.trim().toLowerCase() : '');
        const userEmailNorm = norm(effectiveUserEmail);
        
        const preFilter = filtered;
        filtered = preFilter.filter(enquiry => {
          const poc = norm((enquiry as any).Point_of_Contact || (enquiry as any).poc || '');
          const matches = userEmailNorm ? poc === userEmailNorm : false;
          if (matches) {
            mineItems.push(enquiry);
          }
          return matches;
        });
        
        // Mine-only filter applied
      } else {
        // All mode - show all claimed (anyone's)
        filtered = filtered.filter(enquiry => {
          const poc = (enquiry.Point_of_Contact || (enquiry as any).poc || '').toLowerCase();
          const isUnclaimed = unclaimedEmails.includes(poc);
          return !isUnclaimed && poc && poc.trim() !== '';
        });
      }
    } else if (activeState === 'Claimable') {
      filtered = filtered.filter(enquiry => {
        // Handle both old and new schema
        const poc = (enquiry.Point_of_Contact || (enquiry as any).poc || '').toLowerCase();
        // Exclude triaged enquiries from unclaimed view
        if (poc.includes('triage')) return false;
        // Also exclude enquiries with triage deals
        const enrichmentData = enrichmentMap.get(String(enquiry.ID));
        const pitchedBy = ((enrichmentData?.pitchData as any)?.pitchedBy || '').toLowerCase();
        if (pitchedBy === 'triage') return false;
        if (!unclaimedEmails.includes(poc)) return false;
        // suppression against claimed same-day same-contact
        const email = typeof (enquiry as any).Email === 'string' ? (enquiry as any).Email.toLowerCase() : (typeof (enquiry as any).email === 'string' ? (enquiry as any).email.toLowerCase() : '');
        const phone = typeof (enquiry as any).Phone_Number === 'string' ? (enquiry as any).Phone_Number.replace(/\D/g, '').slice(-7) : (typeof (enquiry as any).phone === 'string' ? (enquiry as any).phone.replace(/\D/g, '').slice(-7) : '');
        const name = [
          (enquiry as any).First_Name || (enquiry as any).first || '',
          (enquiry as any).Last_Name || (enquiry as any).last || ''
        ]
          .map((x: string) => (x || '').trim().toLowerCase())
          .filter(Boolean)
          .join(' ');
        const contact = email || phone || name || 'unknown';
        const dateStr = (enquiry as any).Touchpoint_Date || (enquiry as any).datetime || (enquiry as any).claim || '';
        const d = new Date(dateStr);
        const day = isNaN(d.getTime()) ? 'invalid' : d.toISOString().split('T')[0];
        const key = `${contact}|${day}`;
        return !claimedContactDaySet.has(key);
      });
    } else if (activeState === 'Triaged') {
      // Admin-only: Show enquiries that were pitched via triage flow
      // Wait for triage pitch data to load before filtering
      if (!triagedDataLoaded) {
        return []; // Return empty while loading
      }
      
      filtered = filtered.filter(enquiry => {
        const enrichmentData = enrichmentMap.get(String(enquiry.ID));
        const pitchedBy = ((enrichmentData?.pitchData as any)?.pitchedBy || '').toLowerCase();
        return pitchedBy === 'triage';
      });
    }

    // Area-based access control and filtering
    // CRITICAL: Skip ALL area filtering for:
    // 1. Mine+Claimed mode - show every claimed enquiry regardless of area
    // 2. Triaged state - triage is cross-area, filtering is done by pitchedBy only
    if (showMineOnly && activeState === 'Claimed') {
      // No area filtering at all - show everything the user claimed
    } else if (activeState === 'Triaged') {
      // Skip area filtering for Triaged - triage is cross-area, filtering already done by pitchedBy
    } else if (activeState === 'Claimable' && userData && userData.length > 0 && userData[0].AOW) {
      // Area-based access control - only applies for unclaimed enquiries
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
    } else if (selectedAreas.length > 0 && showMineOnly) {
      // Apply area filter to other Mine states (not Claimed, not Claimable)
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

    // Apply search term filter using debounced value
    if (debouncedSearchTerm.trim()) {
      const term = debouncedSearchTerm.toLowerCase();
      filtered = filtered.filter(enquiry => {
        try {
          return (
            (enquiry.First_Name && enquiry.First_Name.toLowerCase().includes(term)) ||
            (enquiry.Last_Name && enquiry.Last_Name.toLowerCase().includes(term)) ||
            (enquiry.Email && enquiry.Email.toLowerCase().includes(term)) ||
            (enquiry.Company && enquiry.Company.toLowerCase().includes(term)) ||
            (enquiry.Type_of_Work && enquiry.Type_of_Work.toLowerCase().includes(term)) ||
            (enquiry.ID && String(enquiry.ID).toLowerCase().includes(term))
          );
        } catch (e) {
          // Safety fallback if any field throws
          return false;
        }
      });
    }

    // Apply person filter (filter by assigned person initials)
    if (selectedPersonInitials) {
      filtered = filtered.filter(enquiry => {
        const poc = (enquiry.Point_of_Contact || (enquiry as any).poc || '').toLowerCase();
        const matchingPerson = teamData?.find(t => t.Email?.toLowerCase() === poc);
        const initialsFromTeam = matchingPerson?.Initials || matchingPerson?.Email?.split('@')[0]?.slice(0, 2).toUpperCase();
        const initialsFromEmail = poc ? poc.split('@')[0].slice(0, 2).toUpperCase() : undefined;
        const computed = initialsFromTeam || initialsFromEmail;
        return computed === selectedPersonInitials;
      });
    }

    // Apply pipeline filters (Teams/Pitched - yes/no toggles)
    if (enquiryPipelineFilters.size > 0) {
      filtered = filtered.filter(enquiry => {
        const enrichmentData = enrichmentMap.get(String(enquiry.ID));
        
        // Check each active filter
        for (const [stage, requiredStatus] of enquiryPipelineFilters.entries()) {
          let hasStage = false;
          
          if (stage === 'teams') {
            hasStage = !!(enrichmentData?.teamsData);
          } else if (stage === 'pitched') {
            hasStage = !!(enrichmentData?.pitchData);
          }
          
          // requiredStatus is 'yes' or 'no'
          if (requiredStatus === 'yes' && !hasStage) return false;
          if (requiredStatus === 'no' && hasStage) return false;
        }
        
        return true;
      });
    }

    // Apply POC filter (dropdown selection by team member email)
    if (selectedPocFilter) {
      filtered = filtered.filter(enquiry => {
        const poc = (enquiry.Point_of_Contact || (enquiry as any).poc || '').toLowerCase();
        return poc === selectedPocFilter.toLowerCase();
      });
    }

    // Apply pitch scenario filter
    if (selectedPitchScenarioFilter) {
      filtered = filtered.filter(enquiry => {
        const enrichmentData = enrichmentMap.get(String(enquiry.ID));
        if (!enrichmentData?.pitchData) return false;
        // Check if the pitch has the selected scenario
        const pitchScenario = enrichmentData.pitchData.scenarioId;
        return pitchScenario === selectedPitchScenarioFilter;
      });
    }

    return filtered;
  }, [
    dedupedEnquiries, // Use deduped full dataset, not slider range
    userData,
    activeState,
    selectedAreas,
    debouncedSearchTerm, // Use debounced value to prevent excessive re-renders
    showMineOnly,
    unclaimedEmails,
    selectedPersonInitials,
    teamData,
    enrichmentMap, // For Triaged filter and pipeline filters
    triagedDataLoaded, // For Triaged filter - wait until data is loaded
    enquiryPipelineFilters, // For pipeline filtering (Teams/Pitched)
    selectedPocFilter, // For POC dropdown filter
    selectedPitchScenarioFilter, // For pitch scenario filter
  ]);

  // Build a quick lookup of every enquiry keyed by ID so special shared IDs can hydrate their history.
  const sharedProspectHistoryMap = useMemo(() => {
    // For shared prospect IDs, we ALWAYS want the complete team-wide dataset
    // If teamWideEnquiries is empty, trigger a fetch when we detect shared IDs in the current view
    const hasSharedIds = allEnquiries.some(record => shouldAlwaysShowProspectHistory(record));
    
    // If we have shared IDs but no team-wide data, trigger fetch
    if (hasSharedIds && teamWideEnquiries.length === 0 && !isLoadingAllData) {
      debugLog('🔍 Shared IDs detected, need team-wide data for complete history');
      // Trigger fetch asynchronously
      setTimeout(() => fetchAllEnquiries(), 0);
    }
    
    const dataset = teamWideEnquiries.length > 0 ? teamWideEnquiries : allEnquiries;
    if (!dataset.length) {
      return new Map<string, (Enquiry & { __sourceType: 'new' | 'legacy' })[]>();
    }

    const map = new Map<string, (Enquiry & { __sourceType: 'new' | 'legacy' })[]>();
    dataset.forEach((record) => {
      const rawId = record.ID ?? (record as any).id;
      if (rawId === undefined || rawId === null) {
        return;
      }
      const id = String(rawId).trim();
      if (!id) {
        return;
      }
      if (!map.has(id)) {
        map.set(id, []);
      }
      map.get(id)!.push(record);
    });

    return map;
  }, [teamWideEnquiries, allEnquiries, isLoadingAllData, fetchAllEnquiries]);

  const filteredEnquiriesWithSharedHistory = useMemo(() => {
    if (!filteredEnquiries.length || sharedProspectHistoryMap.size === 0) {
      return filteredEnquiries;
    }

    const getRecordKey = (record: Enquiry & { __sourceType: 'new' | 'legacy' }) => buildEnquiryIdentityKey(record);

    const seen = new Set(filteredEnquiries.map(getRecordKey));
    const augmented = [...filteredEnquiries];
    let mutated = false;

    filteredEnquiries.forEach((record) => {
      if (!shouldAlwaysShowProspectHistory(record) || !record.ID) {
        return;
      }

      const id = String(record.ID).trim();
      if (!id) {
        return;
      }

      const history = sharedProspectHistoryMap.get(id);
      if (!history || history.length === 0) {
        return;
      }

      history.forEach((candidate) => {
        const key = getRecordKey(candidate);
        if (seen.has(key)) {
          return;
        }
        augmented.push(candidate);
        seen.add(key);
        mutated = true;
      });
    });

    return mutated ? augmented : filteredEnquiries;
  }, [filteredEnquiries, sharedProspectHistoryMap]);

  // Removed pagination logic
  // const indexOfLastEnquiry = currentPage * enquiriesPerPage;
  // const indexOfFirstEnquiry = indexOfLastEnquiry - enquiriesPerPage;
  // const currentEnquiries = useMemo(
  //   () => filteredEnquiries.slice(indexOfFirstEnquiry, indexOfLastEnquiry),
  //   [filteredEnquiries, indexOfFirstEnquiry, indexOfLastEnquiry]
  // );
  // const totalPages = Math.ceil(filteredEnquiries.length / enquiriesPerPage);

  // Sorting function for table view
  const sortEnquiries = useCallback((items: Enquiry[]) => {
    if (!sortColumn) return items;
    
    return [...items].sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'date': {
          const dateA = new Date(a.Touchpoint_Date || a.Date_Created || 0).getTime();
          const dateB = new Date(b.Touchpoint_Date || b.Date_Created || 0).getTime();
          comparison = dateA - dateB;
          break;
        }
        case 'aow': {
          const aowA = (a.Area_of_Work || '').toLowerCase();
          const aowB = (b.Area_of_Work || '').toLowerCase();
          comparison = aowA.localeCompare(aowB);
          break;
        }
        case 'id': {
          const idA = parseInt(String(a.ID || '0').replace(/\D/g, ''), 10) || 0;
          const idB = parseInt(String(b.ID || '0').replace(/\D/g, ''), 10) || 0;
          comparison = idA - idB;
          break;
        }
        case 'value': {
          const valueA = parseFloat(String(a.Value || '0').replace(/[^0-9.-]/g, '')) || 0;
          const valueB = parseFloat(String(b.Value || '0').replace(/[^0-9.-]/g, '')) || 0;
          comparison = valueA - valueB;
          break;
        }
        case 'pipeline': {
          const pipelineA = (a.Point_of_Contact || '').toLowerCase();
          const pipelineB = (b.Point_of_Contact || '').toLowerCase();
          comparison = pipelineA.localeCompare(pipelineB);
          break;
        }
        case 'contact': {
          const nameA = `${a.First_Name || ''} ${a.Last_Name || ''}`.trim().toLowerCase();
          const nameB = `${b.First_Name || ''} ${b.Last_Name || ''}`.trim().toLowerCase();
          comparison = nameA.localeCompare(nameB);
          break;
        }
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [sortColumn, sortDirection]);

  // Added for infinite scroll - support both grouped and regular view
  const displayedItems = useMemo(() => {
    const pinDemoFirst = <T,>(items: T[]): T[] => {
      if (!demoModeEnabled || activeState !== 'Claimed') {
        return items;
      }
      const idx = items.findIndex((item) => {
        if (!item || typeof item !== 'object') {
          return false;
        }
        const maybeId = (item as any).ID;
        return typeof maybeId === 'string' && maybeId === DEV_PREVIEW_TEST_ENQUIRY.ID;
      });
      if (idx <= 0) {
        return items;
      }
      const next = [...items];
      const [demo] = next.splice(idx, 1);
      next.unshift(demo);
      return next;
    };

    // When Unclaimed board is active, override with unclaimed dataset
    if (showUnclaimedBoard) {
      const sorted = sortEnquiries([...unclaimedEnquiries]);
      return sorted.slice(0, itemsToShow);
    }
    if (showGroupedView) {
      // For grouped view, get mixed display then sort the result
      const mixedItems = getMixedEnquiryDisplay([...filteredEnquiriesWithSharedHistory]);
      // Sort based on current sort settings
      const sortedMixed = [...mixedItems].sort((a, b) => {
        const getDate = (item: any): number => {
          if (isGroupedEnquiry(item)) {
            const latest = item.enquiries[0];
            return new Date(latest?.Touchpoint_Date || latest?.Date_Created || 0).getTime();
          }
          return new Date(item?.Touchpoint_Date || item?.Date_Created || 0).getTime();
        };
        const dateA = getDate(a);
        const dateB = getDate(b);
        return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
      });
      const pinned = pinDemoFirst(sortedMixed);
      return pinned.slice(0, itemsToShow);
    }
    // Apply sorting to filtered enquiries
    const sorted = sortEnquiries([...filteredEnquiries]);
    const pinned = pinDemoFirst(sorted);
    return pinned.slice(0, itemsToShow);
  }, [
    filteredEnquiries,
    filteredEnquiriesWithSharedHistory,
    itemsToShow,
    showGroupedView,
    showUnclaimedBoard,
    unclaimedEnquiries,
    sortEnquiries,
    sortColumn,
    sortDirection,
    demoModeEnabled,
    activeState,
  ]);

  const handleLoadMore = useCallback(() => {
    setItemsToShow((prev) => Math.min(prev + 20, filteredEnquiries.length));
  }, [filteredEnquiries.length]);

  // Progressive enrichment for displayed items only (more efficient)
  useEffect(() => {
    // Skip enrichment when viewing a single enquiry detail
    if (selectedEnquiry) {
      return;
    }

    const fetchProgressiveEnrichment = async () => {
      // Get currently displayed enquiries that need enrichment
      const displayedEnquiries = displayedItems.filter((item): item is (Enquiry & { __sourceType: 'new' | 'legacy' }) => {
        if (!('ID' in item) || !item.ID) return false;
        const key = String(item.ID);
        const hasEnrichment = enrichmentMap.has(key);
        const isBeingFetched = enrichmentRequestsRef.current.has(key);
        return !hasEnrichment && !isBeingFetched;
      });

      if (displayedEnquiries.length === 0) {
        return; // All displayed items already enriched
      }
      
      // Mark items as being fetched
      displayedEnquiries.forEach(enquiry => {
        if (enquiry.ID) {
          enrichmentRequestsRef.current.add(String(enquiry.ID));
        }
      });

      // Get v2 enquiry IDs for Teams data
      const v2EnquiryIds = displayedEnquiries
        .filter(enquiry => {
          const isNewSource = enquiry.__sourceType === 'new' || (enquiry as any).source === 'instructions';
          return isNewSource && enquiry.ID;
        })
        .map(enquiry => String(enquiry.ID))
        .filter(Boolean);

      // Get all enquiry emails for pitch data
      const enquiryEmails = displayedEnquiries
        .map(enquiry => enquiry.Email)
        .filter(Boolean)
        .filter(email => email.toLowerCase() !== 'team@helix-law.com');

      if (v2EnquiryIds.length > 0 || enquiryEmails.length > 0) {
        try {
          // Add timeout to prevent hanging
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Enrichment timeout after 10 seconds')), 10000)
          );
          
          const enrichmentPromise = fetchEnquiryEnrichment(v2EnquiryIds, enquiryEmails);
          const enrichmentResponse = await Promise.race([enrichmentPromise, timeoutPromise]) as EnquiryEnrichmentResponse;
          
          // Update enrichment map with new data
          setEnrichmentMap(prevMap => {
            const newMap = new Map(prevMap);
            
            // Process enrichment data from API response
            enrichmentResponse.enquiryData.forEach((data: EnquiryEnrichmentData) => {
              newMap.set(String(data.enquiryId), data);
            });

            // Map pitch data by email to enquiry IDs
            displayedEnquiries.forEach(enquiry => {
              if (enquiry.Email && enquiry.ID) {
                const pitchData = enrichmentResponse.pitchByEmail[enquiry.Email.toLowerCase()];
                if (pitchData) {
                  const key = String(enquiry.ID);
                  const existingData = newMap.get(key) || { enquiryId: key };
                  newMap.set(key, { ...existingData, pitchData });
                }
              }
            });
            
            // IMPORTANT: Create empty records for enquiries that didn't get data
            // This stops the spinners for items with no enrichment data
            displayedEnquiries.forEach(enquiry => {
              const key = String(enquiry.ID);
              if (enquiry.ID && !newMap.has(key)) {
                newMap.set(key, { enquiryId: key }); // Empty record
              }
            });
            
            return newMap;
          });
          
          // Clear tracking for successfully processed items
          displayedEnquiries.forEach(enquiry => {
            if (enquiry.ID) {
              enrichmentRequestsRef.current.delete(String(enquiry.ID));
            }
          });
        } catch (error) {
          console.error('[Enquiries] Progressive enrichment failed:', error);
          
          // Create empty enrichment records to stop spinners and clear tracking
          setEnrichmentMap(prevMap => {
            const newMap = new Map(prevMap);
            displayedEnquiries.forEach(enquiry => {
              const key = String(enquiry.ID);
              if (enquiry.ID && !newMap.has(key)) {
                newMap.set(key, { enquiryId: key }); // Empty record to indicate processed
                enrichmentRequestsRef.current.delete(key); // Clear tracking
              }
            });
            return newMap;
          });
        }
      } else {
        // No enrichment needed, but create empty records to stop spinners
        setEnrichmentMap(prevMap => {
          const newMap = new Map(prevMap);
          displayedEnquiries.forEach(enquiry => {
            const key = String(enquiry.ID);
            if (enquiry.ID && !newMap.has(key)) {
              newMap.set(key, { enquiryId: key }); // Empty record
              enrichmentRequestsRef.current.delete(key); // Clear tracking
            }
          });
          return newMap;
        });
      }
    };

    // Add a small delay to debounce rapid calls
    const timeoutId = setTimeout(fetchProgressiveEnrichment, 100);
    return () => clearTimeout(timeoutId);
  }, [selectedEnquiry, displayedItems, dedupedEnquiries.length, showGroupedView, showUnclaimedBoard, filteredEnquiries.length, filteredEnquiriesWithSharedHistory.length, unclaimedEnquiries.length, itemsToShow, viewMode]); // Trigger on any data or view change

  // Bulk fetch pitch data when Triaged filter is active (needs all emails, not just displayed)
  const triagedBulkFetchRef = useRef<boolean>(false);
  useEffect(() => {
    if (activeState !== 'Triaged') {
      // Reset state when switching away from Triaged
      if (triagedBulkFetchRef.current || triagedDataLoaded) {
        triagedBulkFetchRef.current = false;
        setTriagedDataLoaded(false);
      }
      return;
    }
    
    if (triagedBulkFetchRef.current && triagedDataLoaded) return;
    
    const fetchAllPitchData = async () => {
      // Get ALL enquiry emails (not just displayed ones)
      const allEmails = dedupedEnquiries
        .map(enquiry => enquiry.Email)
        .filter((email): email is string => Boolean(email) && email.toLowerCase() !== 'team@helix-law.com');
      
      const uniqueEmails = [...new Set(allEmails.map(e => e.toLowerCase()))];
      
      if (uniqueEmails.length === 0) {
        setTriagedDataLoaded(true);
        return;
      }
      
      try {
        // Batch emails to avoid URL length limits (431 error)
        const batchSize = 50;
        const batches: string[][] = [];
        for (let i = 0; i < uniqueEmails.length; i += batchSize) {
          batches.push(uniqueEmails.slice(i, i + batchSize));
        }
        
        // Run batches in parallel (max 4 concurrent) for speed
        const concurrency = 4;
        let allPitchData: { [email: string]: any } = {};
        
        for (let i = 0; i < batches.length; i += concurrency) {
          const chunk = batches.slice(i, i + concurrency);
          const results = await Promise.all(
            chunk.map(batch => fetchEnquiryEnrichment([], batch))
          );
          results.forEach(res => Object.assign(allPitchData, res.pitchByEmail || {}));
        }
        
        // Update enrichment map with pitch data for all enquiries
        setEnrichmentMap(prevMap => {
          const newMap = new Map(prevMap);
          
          dedupedEnquiries.forEach(enquiry => {
            if (enquiry.Email && enquiry.ID) {
              const pitchData = allPitchData[enquiry.Email.toLowerCase()];
              if (pitchData) {
                const key = String(enquiry.ID);
                const existingData = newMap.get(key) || { enquiryId: key };
                newMap.set(key, { ...existingData, pitchData });
              }
            }
          });
          
          return newMap;
        });
        
        triagedBulkFetchRef.current = true;
        setTriagedDataLoaded(true);
      } catch (error) {
        console.error('[Triaged Bulk Fetch] Failed:', error);
        setTriagedDataLoaded(true); // Mark as loaded even on error to stop loading state
      }
    };
    
    fetchAllPitchData();
  }, [activeState, dedupedEnquiries, triagedDataLoaded]);

  // Clear enrichment request tracking when view context changes significantly
  useEffect(() => {
    enrichmentRequestsRef.current.clear();
  }, [showUnclaimedBoard, showGroupedView, viewMode, selectedArea, dateRange?.oldest, dateRange?.newest, searchTerm]);

  // Fetch document counts for displayed enquiries
  // Note: This will be activated when the backend API is implemented
  // The API should be at: /api/prospect-documents/counts (POST with enquiryIds array)
  useEffect(() => {
    const fetchDocumentCounts = async () => {
      // Get currently displayed enquiries that need document counts
      const enquiryIds = displayedItems
        .filter((item): item is Enquiry => 'ID' in item && Boolean(item.ID))
        .map(item => String(item.ID))
        .filter(id => !(id in documentCounts));
      
      if (enquiryIds.length === 0) return;
      
      try {
        // TODO: Enable when backend API is implemented
        // const response = await fetch('/api/prospect-documents/counts', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ enquiryIds })
        // });
        // 
        // if (response.ok) {
        //   const data = await response.json();
        //   setDocumentCounts(prev => ({ ...prev, ...data.counts }));
        // }
        
        // For now, initialize with zeros to prevent re-fetching
        // BUT inject synthetic counts for the dev preview test record
        setDocumentCounts(prev => {
          const newCounts = { ...prev };
          enquiryIds.forEach(id => {
            if (!(id in newCounts)) {
              // Inject document count for dev preview test record
              newCounts[id] = id === 'DEV-PREVIEW-99999' ? 3 : 0;
            }
          });
          return newCounts;
        });
      } catch (error) {
        console.error('[Enquiries] Failed to fetch document counts:', error);
      }
    };
    
    const timeoutId = setTimeout(fetchDocumentCounts, 200);
    return () => clearTimeout(timeoutId);
  }, [displayedItems, documentCounts]);

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
          <PitchBuilder 
            enquiry={enquiry} 
            userData={userData}
            initialScenario={selectedPitchScenario}
          />
        )}
        {activeSubTab === 'Timeline' && (
          <EnquiryTimeline 
            enquiry={enquiry} 
            userInitials={userData && userData[0] ? userData[0].Initials : undefined}
            userEmail={userData?.[0]?.Email}
            featureToggles={featureToggles}
            onOpenPitchBuilder={(scenarioId) => {
              setSelectedPitchScenario(scenarioId);
              setActiveSubTab('Pitch');
            }}
          />
        )}
      </>
    ),
  [activeSubTab, userData, isLocalhost, featureToggles, setActiveSubTab]
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

  // Format value for compact table display
  const formatValueForDisplay = (rawValue: string | number | null | undefined): string => {
    if (!rawValue || (typeof rawValue === 'string' && rawValue.trim() === '')) return '-';
    
    const value = String(rawValue).trim();
    const lowerValue = value.toLowerCase();
    
    // Normalize common patterns first - handle partial/truncated values
    // High value (£500k+)
    if (lowerValue.includes('500,001') || lowerValue.includes('over £500') || lowerValue.includes('500k+')) {
      return '£500k+';
    }
    
    // £100k-500k range
    if ((lowerValue.includes('100,001') && lowerValue.includes('500,000')) || 
        lowerValue.includes('£100k-500k') ||
        (lowerValue.includes('between') && lowerValue.includes('100') && lowerValue.includes('500'))) {
      return '£100k-500k';
    }
    
    // £100k+ 
    if (lowerValue.includes('greater than £100') || lowerValue.includes('£100k+') || lowerValue === '£100,000+') {
      return '£100k+';
    }
    
    // £50k-100k range
    if ((lowerValue.includes('50,000') && lowerValue.includes('100,000')) ||
        lowerValue.includes('£50k-100k')) {
      return '£50k-100k';
    }
    
    // £25k-50k range
    if ((lowerValue.includes('25,000') && lowerValue.includes('50,000')) ||
        lowerValue.includes('£25k-50k')) {
      return '£25k-50k';
    }
    
    // £10k-100k range
    if ((lowerValue.includes('10,001') && lowerValue.includes('100,000')) ||
        (lowerValue.includes('10,000') && lowerValue.includes('100,000')) ||
        (lowerValue.includes('between') && lowerValue.includes('10') && lowerValue.includes('100')) ||
        lowerValue.includes('£10k-100k')) {
      return '£10k-100k';
    }
    
    // £10k-50k range
    if ((lowerValue.includes('10,000') && lowerValue.includes('50,000')) ||
        lowerValue.includes('£10k-50k')) {
      return '£10k-50k';
    }
    
    // ≤£10k / <£10k (under 10k)
    if (lowerValue.includes('below £10') || 
        lowerValue.includes('less than £10') ||
        lowerValue.includes('10,000 or less') ||
        lowerValue.includes('under £10') ||
        lowerValue.includes('<£10k') ||
        lowerValue.includes('≤£10k') ||
        lowerValue === '£10,000 or less') {
      return '<£10k';
    }
    
    // Non-monetary
    if (lowerValue.includes('non-monetary') || 
        lowerValue.includes('non monetary') ||
        lowerValue.includes('other than money') ||
        lowerValue.includes('property, land') ||
        lowerValue.includes('property/shares')) {
      return 'Non-monetary';
    }
    
    // Unsure / Uncertain / Unknown
    if (lowerValue.includes('unsure') || 
        lowerValue.includes('uncertain') ||
        lowerValue.includes('unable to establish') ||
        lowerValue.includes('i\'m uncer') ||  // Handle truncated "I'm Uncertain"
        lowerValue === 'unknown' ||
        lowerValue === 'other' ||
        lowerValue === 'n/a' ||
        lowerValue === 'not applicable') {
      return 'Unsure';
    }
    
    // Already formatted compact values - return as-is
    if (/^[<≤>]?£\d+k[-+]?(\d+k)?$/.test(value)) {
      return value;
    }
    
    // For pure numbers, format as currency
    if (/^\d+$/.test(value)) {
      const num = parseInt(value);
      if (num >= 1000000) {
        return `£${(num / 1000000).toFixed(1)}m`;
      }
      if (num >= 1000) {
        return `£${Math.round(num / 1000)}k`;
      }
      return `£${value}`;
    }
    
    // Currency with commas (e.g. "£10,000")
    const currencyMatch = value.match(/^£?([\d,]+)$/);
    if (currencyMatch) {
      const num = parseInt(currencyMatch[1].replace(/,/g, ''));
      if (num >= 1000000) {
        return `£${(num / 1000000).toFixed(1)}m`;
      }
      if (num >= 1000) {
        return `£${Math.round(num / 1000)}k`;
      }
      return `£${num}`;
    }
    
    // If value already starts with £ and is short enough, return as-is
    if (value.startsWith('£') && value.length <= 10) {
      return value;
    }
    
    // Return truncated value for anything else
    return value.length > 10 ? value.substring(0, 8) + '...' : value;
  };

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
      background: dark 
        ? 'rgba(15, 23, 42, 0.78)' 
        : 'rgba(248, 250, 252, 0.92)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      minHeight: '100vh',
      boxSizing: 'border-box',
      color: dark ? colours.light.text : colours.dark.text,
      position: 'relative',
      borderTop: dark ? '1px solid rgba(148,163,184,0.12)' : '1px solid rgba(148,163,184,0.10)',
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
      
      // Build filter options - admins get Triaged option
      const baseFilterOptions = ['Claimed', 'Unclaimed'];
      const filterOptions = isAdmin ? [...baseFilterOptions, 'Triaged'] : baseFilterOptions;
      
      const getFilterIcon = (k: string) => {
        if (k === 'Claimed') {
          return (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          );
        } else if (k === 'Unclaimed') {
          return (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M8 4V8.5L11 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          );
        } else {
          // Triaged - filter/funnel icon
          return (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 3h12l-4.5 5.5V13l-3 1.5V8.5L2 3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          );
        }
      };

      // Custom status filter with embedded Mine/All toggle when Claimed is selected
      const StatusFilterWithScope = () => {
        const height = 32;
        const currentState = activeState === 'Claimable' ? 'Unclaimed' : activeState;
        const isClaimed = currentState === 'Claimed';
        
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 0,
            }}
          >
            {/* Claimed tab with integrated Mine/All extension */}
            <div
              style={{
                display: 'flex',
                position: 'relative',
                background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                borderRadius: `${height / 2}px`,
                padding: 4,
                height,
                fontFamily: 'Raleway, sans-serif',
                userSelect: 'none',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                aria-pressed={isClaimed}
                onClick={() => handleSetActiveState('Claimed')}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  background: isClaimed ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)') : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  color: isClaimed 
                    ? (isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937')
                    : (isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)'),
                  transition: 'color 200ms ease',
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  outline: 'none',
                  borderRadius: (height - 8) / 2,
                  boxShadow: isClaimed ? (isDarkMode ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', color: 'inherit' }}>
                  {getFilterIcon('Claimed')}
                </span>
                <span>Claimed</span>
              </button>
              
              {/* Mine/All toggle - inside the same container, flows from Claimed */}
              {isClaimed && (
                <>
                  <div
                    role="group"
                    aria-label="Filter by ownership"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      height: height - 8,
                      padding: '0 3px',
                      background: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                      borderRadius: (height - 8) / 2,
                      gap: 2,
                      marginLeft: 4,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setShowMineOnly(true)}
                      title={`Show my claimed enquiries (${scopeCounts.mineCount || 0})`}
                      aria-pressed={showMineOnly}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        height: height - 12,
                        padding: '0 7px',
                        background: showMineOnly 
                          ? (isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                          : 'transparent',
                        border: 'none',
                        borderRadius: (height - 12) / 2,
                        cursor: 'pointer',
                        fontSize: 10,
                        fontWeight: 600,
                        color: showMineOnly 
                          ? (isDarkMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.85)')
                          : (isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.4)'),
                        transition: 'all 150ms ease',
                        boxShadow: showMineOnly ? (isDarkMode ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
                      }}
                    >
                      <span>Mine</span>
                      {scopeCounts.mineCount !== undefined && (
                        <span 
                          style={{
                          background: showMineOnly 
                            ? (isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                            : (isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)'),
                          borderRadius: 5,
                          padding: '1px 4px',
                          fontSize: 9,
                          fontWeight: 600,
                          lineHeight: 1.2,
                        }}>
                          {scopeCounts.mineCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMineOnly(false)}
                      title={`Show all claimed enquiries (${scopeCounts.allCount || 0})`}
                      aria-pressed={!showMineOnly}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        height: height - 12,
                        padding: '0 7px',
                        background: !showMineOnly 
                          ? (isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                          : 'transparent',
                        border: 'none',
                        borderRadius: (height - 12) / 2,
                        cursor: 'pointer',
                        fontSize: 10,
                        fontWeight: 600,
                        color: !showMineOnly 
                          ? (isDarkMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.85)')
                          : (isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.4)'),
                        transition: 'all 150ms ease',
                        boxShadow: !showMineOnly ? (isDarkMode ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
                      }}
                    >
                      <span>All</span>
                      {scopeCounts.allCount !== undefined && (
                        <span 
                          style={{
                          background: !showMineOnly 
                            ? (isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
                            : (isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)'),
                          borderRadius: 5,
                          padding: '1px 4px',
                          fontSize: 9,
                          fontWeight: 600,
                          lineHeight: 1.2,
                        }}>
                          {scopeCounts.allCount}
                        </span>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Unclaimed and Triaged tabs */}
            <div
              style={{
                display: 'flex',
                position: 'relative',
                background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                borderRadius: `${height / 2}px`,
                padding: 4,
                height,
                fontFamily: 'Raleway, sans-serif',
                userSelect: 'none',
                overflow: 'hidden',
                marginLeft: 4,
              }}
            >
              <button
                type="button"
                aria-pressed={currentState === 'Unclaimed'}
                onClick={() => handleSetActiveState('Claimable')}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  background: currentState === 'Unclaimed' ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)') : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  color: currentState === 'Unclaimed'
                    ? (isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937')
                    : (isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)'),
                  transition: 'color 200ms ease',
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  outline: 'none',
                  borderRadius: currentState === 'Unclaimed' ? (height - 8) / 2 : 0,
                  boxShadow: currentState === 'Unclaimed' ? (isDarkMode ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', color: 'inherit' }}>
                  {getFilterIcon('Unclaimed')}
                </span>
                <span>Unclaimed</span>
              </button>

              <button
                type="button"
                aria-pressed={currentState === 'Triaged'}
                onClick={() => handleSetActiveState('Triaged')}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  background: currentState === 'Triaged' ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)') : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  color: currentState === 'Triaged'
                    ? (isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937')
                    : (isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)'),
                  transition: 'color 200ms ease',
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  outline: 'none',
                  borderRadius: currentState === 'Triaged' ? (height - 8) / 2 : 0,
                  boxShadow: currentState === 'Triaged' ? (isDarkMode ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', color: 'inherit' }}>
                  {getFilterIcon('Triaged')}
                </span>
                <span>Triaged</span>
              </button>
            </div>
          </div>
        );
      };
      
      setContent(
        <FilterBanner
          seamless
          dense
          collapsibleSearch
          sticky={false}
          primaryFilter={<StatusFilterWithScope />}
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
              {/* Add Contact button */}
              <button
                type="button"
                title="Add new contact/enquiry"
                aria-label="Add new contact"
                onClick={() => setIsCreateContactModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 32,
                  padding: '0 12px',
                  borderRadius: 16,
                  border: isDarkMode ? '1px solid rgba(102,170,232,0.3)' : '1px solid rgba(102,170,232,0.3)',
                  background: isDarkMode ? 'rgba(102,170,232,0.12)' : 'rgba(102,170,232,0.08)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'Raleway, sans-serif',
                  color: colours.highlight,
                  fontWeight: 600,
                  transition: 'all 200ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(102,170,232,0.18)' : 'rgba(102,170,232,0.14)';
                  e.currentTarget.style.borderColor = colours.highlight;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(102,170,232,0.12)' : 'rgba(102,170,232,0.08)';
                  e.currentTarget.style.borderColor = isDarkMode ? 'rgba(102,170,232,0.3)' : 'rgba(102,170,232,0.3)';
                }}
              >
                <Icon iconName="AddFriend" style={{ fontSize: 12 }} />
                <span>Add Contact</span>
              </button>
            </div>
          )}
          search={{
            value: searchTerm,
            onChange: handleSearchChange,
            placeholder: "Search (name, email, company, type, ID)"
          }}
          middleActions={(
            <div style={{ position: 'relative' }}>
              <div 
                role="group" 
                aria-label="View mode"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 0,
                height: 32,
                padding: '3px',
                background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                borderRadius: 16,
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              {/* Card view button with integrated column toggle */}
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <button
                  type="button"
                  title={viewMode === 'card' ? `Card view (${twoColumn ? '2 columns' : '1 column'}) - click to toggle columns` : 'Switch to card view'}
                  aria-label={viewMode === 'card' ? `Card view, ${twoColumn ? '2 columns' : '1 column'}` : 'Card view'}
                  aria-pressed={viewMode === 'card'}
                  onClick={() => {
                    if (viewMode === 'card') {
                      // Toggle columns when already in card view
                      setTwoColumn(!twoColumn);
                    } else {
                      setViewMode('card');
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    height: 26,
                    padding: '0 10px',
                    background: viewMode === 'card' ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)') : 'transparent',
                    border: 'none',
                    borderRadius: 13,
                    cursor: 'pointer',
                    transition: 'all 200ms ease',
                    opacity: viewMode === 'card' ? 1 : 0.6,
                    boxShadow: viewMode === 'card' 
                      ? (isDarkMode
                          ? '0 1px 2px rgba(0,0,0,0.2)'
                          : '0 1px 2px rgba(0,0,0,0.06)')
                      : 'none',
                  }}
                >
                  <Icon
                    iconName="GridViewMedium"
                    style={{
                      fontSize: 12,
                      color: viewMode === 'card'
                        ? (isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937')
                        : (isDarkMode ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.55)'),
                    }}
                  />
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: viewMode === 'card' 
                      ? (isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937')
                      : (isDarkMode ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.55)'),
                  }}>
                    {viewMode === 'card' ? (twoColumn ? '2 Col' : '1 Col') : 'Cards'}
                  </span>
                </button>
              </div>
              
              {/* Table view button */}
              <button
                type="button"
                title="Table view"
                aria-label="Table view"
                aria-pressed={viewMode === 'table'}
                onClick={() => setViewMode('table')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  height: 26,
                  padding: '0 10px',
                  background: viewMode === 'table' ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)') : 'transparent',
                  border: 'none',
                  borderRadius: 13,
                  cursor: 'pointer',
                  transition: 'all 200ms ease',
                  opacity: viewMode === 'table' ? 1 : 0.6,
                  boxShadow: viewMode === 'table' 
                    ? (isDarkMode
                        ? '0 1px 2px rgba(0,0,0,0.2)'
                        : '0 1px 2px rgba(0,0,0,0.06)')
                    : 'none',
                }}
              >
                <Icon
                  iconName="BulletedList"
                  style={{
                    fontSize: 12,
                    color: viewMode === 'table'
                      ? (isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937')
                      : (isDarkMode ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.55)'),
                  }}
                />
                <span style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  color: viewMode === 'table' 
                    ? (isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937')
                    : (isDarkMode ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.55)'),
                }}>
                  Table
                </span>
              </button>
            </div>
            </div>
          )}
          refresh={{
            onRefresh: handleManualRefresh,
            isLoading: isRefreshing,
            nextUpdateTime: nextRefreshIn ? formatTimeRemaining(nextRefreshIn) : undefined,
            progressPercentage: (nextRefreshIn / (5 * 60)) * 100, // 0-100% remaining
          }}
        >
          {selectedPersonInitials && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                height: 28,
                padding: '0 10px',
                borderRadius: 14,
                border: `1px solid ${colours.highlight}50`,
                background: isDarkMode ? 'rgba(102,170,232,0.12)' : 'rgba(102,170,232,0.12)',
                fontSize: 12,
                fontFamily: 'Raleway, sans-serif',
                color: colours.highlight,
                fontWeight: 600,
              }}
            >
              <Icon iconName="Contact" style={{ fontSize: 14 }} />
              <span>{selectedPersonInitials}</span>
              <button
                onClick={() => setSelectedPersonInitials(null)}
                title="Clear person filter"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 16,
                  height: 16,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  color: colours.highlight,
                  opacity: 0.7,
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
              >
                <Icon iconName="Cancel" style={{ fontSize: 12 }} />
              </button>
            </div>
          )}
        </FilterBanner>
      );
    } else {
      // Detail mode: navigation on left side (back + context tabs)
      setContent(
        <FilterBanner
          seamless={false}
          dense
          sticky={false}
          leftAction={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ActionButton
                iconProps={{ iconName: 'ChevronLeft' }}
                onClick={handleBackToList}
                title="Back to enquiries list"
                aria-label="Back to enquiries list"
                styles={{
                  root: {
                    height: 32,
                    padding: '0 10px 0 6px',
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
                    gap: 6,
                  },
                  rootHovered: {
                    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#e7f1ff',
                  },
                  icon: {
                    fontSize: 16,
                    color: isDarkMode ? 'rgb(125, 211, 252)' : '#3690ce',
                  },
                  label: {
                    fontSize: 13,
                    userSelect: 'none',
                  },
                }}
              >
                Back
              </ActionButton>
              <div style={{
                width: '1px',
                height: '24px',
                backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.06)',
              }} />
              <button
                onClick={() => setActiveSubTab('Timeline')}
                title="Overview"
                aria-label="Overview"
                className="enquiry-sub-tab"
                data-active={activeSubTab === 'Timeline'}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveSubTab('Pitch')}
                title="Pitch Builder"
                aria-label="Pitch Builder"
                className="enquiry-sub-tab"
                data-active={activeSubTab === 'Pitch'}
              >
                Pitch Builder
              </button>
            </div>
          }
        />
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
      {/* Toast Notification - Using OperationStatusToast for real-time feedback */}
      <OperationStatusToast
        visible={toastVisible}
        message={toastMessage}
        details={toastDetails}
        type={toastType}
        icon={toastType === 'success' ? 'CheckMark' : undefined}
      />

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



      {showUnclaimedBoard && viewMode === 'card' ? (
        <UnclaimedEnquiries
          enquiries={unclaimedEnquiries}
          onSelect={handleSelectEnquiry}
          userEmail={userData?.[0]?.Email || ''}
          onAreaChange={() => { /* no-op in unclaimed view for now */ }}
          onClaimSuccess={() => { try { handleManualRefresh(); } catch (e) { /* ignore */ } }}
          onOptimisticClaim={onOptimisticClaim}
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
                  {/* Show loading state for triaged enquiries when data is being fetched */}
                  {activeState === 'Triaged' && !triagedDataLoaded ? (
                    <LoadingState
                      message="Loading triage data"
                      subMessage="Fetching pitch information from across all enquiries..."
                      size="md"
                      icon={
                        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3Z" />
                        </svg>
                      }
                    />
                  ) :filteredEnquiries.length === 0 ? (
                    <EmptyState
                      title={
                        enquiryPipelineFilters.size > 0 || selectedPocFilter || selectedPitchScenarioFilter || debouncedSearchTerm || selectedAreas.length > 0 || selectedPersonInitials
                          ? 'No matching enquiries'
                          : activeState === 'Claimed' && showMineOnly
                          ? 'No claimed enquiries yet'
                          : activeState === 'Claimed'
                          ? 'No claimed enquiries'
                          : activeState === 'Triaged'
                          ? 'No triaged enquiries'
                          : 'No enquiries found'
                      }
                      description={
                        enquiryPipelineFilters.size > 0 || selectedPocFilter || selectedPitchScenarioFilter || debouncedSearchTerm || selectedAreas.length > 0 || selectedPersonInitials
                          ? 'No enquiries match your current filters. Try adjusting or clearing your filters to see more results.'
                          : activeState === 'Claimed' && showMineOnly
                          ? 'You haven\'t claimed any enquiries yet. Check the claimable section to get started.'
                          : activeState === 'Claimed'
                          ? 'No enquiries have been claimed yet.'
                          : activeState === 'Triaged'
                          ? 'No enquiries have been processed by triage in this view.'
                          : 'Try adjusting your date range or filters.'
                      }
                      illustration={
                        enquiryPipelineFilters.size > 0 || selectedPocFilter || selectedPitchScenarioFilter || debouncedSearchTerm || selectedAreas.length > 0 || selectedPersonInitials
                          ? 'filter'
                          : activeState === 'Triaged' ? 'filter' : 'search'
                      }
                      size="md"
                      action={
                        (enquiryPipelineFilters.size > 0 || selectedPocFilter || selectedPitchScenarioFilter || debouncedSearchTerm || selectedAreas.length > 0 || selectedPersonInitials)
                          ? {
                              label: 'Clear All Filters',
                              onClick: () => {
                                setEnquiryPipelineFilters(new Map());
                                setSelectedPocFilter(null);
                                setSelectedPitchScenarioFilter(null);
                                setSearchTerm('');
                                setSelectedAreas([]);
                                setSelectedPersonInitials(null);
                              },
                              variant: 'primary'
                            }
                          : undefined
                      }
                    />

            ) : (
              <>
                {viewMode === 'card' ? (
                  /* Card View */
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
                            onRatingChange={handleRatingChange}
                            onPitch={handleSelectEnquiry}
                            teamData={teamData}
                            isLast={isLast}
                            userAOW={userAOW}
                            getPromotionStatus={getPromotionStatusSimple}
                            onFilterByPerson={handleFilterByPerson}
                            documentCounts={documentCounts}
                          />
                        );
                      } else {
                        const pocLower = (item.Point_of_Contact || (item as any).poc || '').toLowerCase();
                        const isUnclaimed = pocLower === 'team@helix-law.com';
                        if (isUnclaimed) {
                          return (
                            <NewUnclaimedEnquiryCard
                              key={`${item.ID}-${item.First_Name || ''}-${item.Last_Name || ''}-${item.Touchpoint_Date || ''}-${item.Point_of_Contact || ''}`}
                              enquiry={item}
                              onSelect={() => {}} // Prevent click-through to pitch builder
                              onRate={handleRate}
                              onAreaChange={handleAreaChange}
                              isLast={isLast}
                              userEmail={currentUserEmail}
                              onClaimSuccess={onRefreshEnquiries}
                              onOptimisticClaim={onOptimisticClaim}
                              promotionStatus={getPromotionStatusSimple(item)}
                              documentCount={item.ID ? (documentCounts[String(item.ID)] || 0) : 0}
                            />
                          );
                        }
                        const claimer = claimerMap[pocLower];
                        return (
                          <ClaimedEnquiryCard
                            key={`${item.ID}-${item.First_Name || ''}-${item.Last_Name || ''}-${item.Touchpoint_Date || ''}-${item.Point_of_Contact || ''}`}
                            enquiry={item}
                            claimer={claimer}
                            onSelect={handleSelectEnquiry}
                            onRate={handleRate}
                            onRatingChange={handleRatingChange}
                            onEdit={handleEditEnquiry}
                            onAreaChange={handleAreaChange}
                            userData={userData}
                            isLast={isLast}
                            promotionStatus={getPromotionStatusSimple(item)}
                            onFilterByPerson={handleFilterByPerson}
                            enrichmentData={item.ID ? enrichmentMap.get(String(item.ID)) : null}
                            enrichmentMap={enrichmentMap}
                            enrichmentRequestsRef={enrichmentRequestsRef}
                            documentCount={item.ID ? (documentCounts[String(item.ID)] || 0) : 0}
                          />
                        );
                      }
                    })}
                  </div>
                ) : (
                  /* Table View */
                  <div 
                    style={{
                      backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : '#ffffff',
                      border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
                      borderRadius: 2,
                      overflow: 'visible',
                      fontFamily: 'Raleway, "Segoe UI", sans-serif',
                    }}
                  >
                    <div 
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '32px 70px 50px 60px 1.2fr 0.5fr 1.6fr 0.5fr',
                        gap: '12px',
                        padding: '10px 16px',
                        alignItems: 'center',
                        position: 'sticky',
                        top: 0,
                        zIndex: 100,
                        background: isDarkMode 
                          ? 'rgba(15, 23, 42, 0.95)'
                          : 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(12px)',
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'}`,
                        fontFamily: 'Raleway, "Segoe UI", sans-serif',
                        fontSize: '10px',
                        fontWeight: 500,
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        boxShadow: isDarkMode 
                          ? '0 2px 8px rgba(0, 0, 0, 0.3)'
                          : '0 2px 8px rgba(0, 0, 0, 0.08)',
                      }}
                    >
                      {/* Timeline header cell */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0.5,
                        }}
                        title="Timeline"
                      >
                        <Icon
                          iconName="TimelineProgress"
                          styles={{
                            root: {
                              fontSize: 12,
                              color: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.35)',
                            },
                          }}
                        />
                      </div>
                      <div 
                        onClick={() => {
                          if (sortColumn === 'date') {
                            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortColumn('date');
                            setSortDirection('desc');
                          }
                        }}
                        style={{ 
                          paddingLeft: '0px', 
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'color 0.15s ease',
                          color: sortColumn === 'date' 
                            ? (isDarkMode ? colours.accent : colours.highlight)
                            : undefined,
                        }}
                        title="Sort by date"
                      >
                        Date
                        <Icon 
                          iconName={sortColumn === 'date' ? (sortDirection === 'asc' ? 'ChevronUpSmall' : 'ChevronDownSmall') : 'ChevronDownSmall'} 
                          styles={{ 
                            root: { 
                              fontSize: 8,
                              marginLeft: 4,
                              opacity: sortColumn === 'date' ? 1 : 0.35,
                              color: sortColumn === 'date' 
                                ? (isDarkMode ? colours.accent : colours.highlight)
                                : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)'),
                              transition: 'opacity 0.15s ease',
                            },
                          }}
                        />
                      </div>
                      <div 
                        onClick={() => {
                          if (sortColumn === 'aow') {
                            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortColumn('aow');
                            setSortDirection('asc');
                          }
                        }}
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'center', 
                          alignItems: 'center',
                          cursor: 'pointer',
                          transition: 'color 0.15s ease',
                          color: sortColumn === 'aow' 
                            ? (isDarkMode ? colours.accent : colours.highlight)
                            : undefined,
                        }}
                        title="Sort by area of work"
                      >
                        AOW
                      </div>
                      {/* ID header (sortable) */}
                      <div 
                        onClick={() => {
                          if (sortColumn === 'id') {
                            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortColumn('id');
                            setSortDirection('desc');
                          }
                        }}
                        style={{ 
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                          transition: 'color 0.15s ease',
                          color: sortColumn === 'id' 
                            ? (isDarkMode ? colours.accent : colours.highlight)
                            : undefined,
                        }}
                        title="Sort by ID"
                      >
                        ID
                        <Icon 
                          iconName={sortColumn === 'id' ? (sortDirection === 'asc' ? 'ChevronUpSmall' : 'ChevronDownSmall') : 'ChevronDownSmall'} 
                          styles={{ 
                            root: { 
                              fontSize: 8,
                              marginLeft: 2,
                              opacity: sortColumn === 'id' ? 1 : 0.35,
                              color: sortColumn === 'id' 
                                ? (isDarkMode ? colours.accent : colours.highlight)
                                : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)'),
                              transition: 'opacity 0.15s ease',
                            },
                          }}
                        />
                      </div>
                      <div 
                        onClick={() => {
                          if (sortColumn === 'contact') {
                            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortColumn('contact');
                            setSortDirection('asc');
                          }
                        }}
                        style={{ 
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'color 0.15s ease',
                          color: sortColumn === 'contact' 
                            ? (isDarkMode ? colours.accent : colours.highlight)
                            : undefined,
                        }}
                        title="Sort by prospect name"
                      >
                        Prospect
                        <Icon 
                          iconName={sortColumn === 'contact' ? (sortDirection === 'asc' ? 'ChevronUpSmall' : 'ChevronDownSmall') : 'ChevronDownSmall'} 
                          styles={{ 
                            root: { 
                              fontSize: 8,
                              marginLeft: 4,
                              opacity: sortColumn === 'contact' ? 1 : 0.35,
                              color: sortColumn === 'contact' 
                                ? (isDarkMode ? colours.accent : colours.highlight)
                                : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)'),
                              transition: 'opacity 0.15s ease',
                            },
                          }}
                        />
                      </div>
                      <div 
                        onClick={() => {
                          if (sortColumn === 'value') {
                            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                          } else {
                            setSortColumn('value');
                            setSortDirection('desc');
                          }
                        }}
                        style={{ 
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'color 0.15s ease',
                          color: sortColumn === 'value' 
                            ? (isDarkMode ? colours.accent : colours.highlight)
                            : undefined,
                        }}
                        title="Sort by value"
                      >
                        Value
                        <Icon 
                          iconName={sortColumn === 'value' ? (sortDirection === 'asc' ? 'ChevronUpSmall' : 'ChevronDownSmall') : 'ChevronDownSmall'} 
                          styles={{ 
                            root: { 
                              fontSize: 8,
                              marginLeft: 4,
                              opacity: sortColumn === 'value' ? 1 : 0.35,
                              color: sortColumn === 'value' 
                                ? (isDarkMode ? colours.accent : colours.highlight)
                                : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)'),
                              transition: 'opacity 0.15s ease',
                            },
                          }}
                        />
                      </div>
                      {/* Pipeline filter buttons */}
                      <div 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 0,
                          width: '100%',
                          justifyContent: 'flex-start',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Teams toggle */}
                        {(() => {
                          const filterState = getEnquiryStageFilterState('teams');
                          const hasFilter = filterState !== null;
                          const getFilterColor = () => {
                            if (!filterState) return isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)';
                            if (filterState === 'yes') return '#22c55e';
                            if (filterState === 'no') return '#ef4444';
                            return colours.highlight;
                          };
                          const filterColor = getFilterColor();
                          const stateLabel = filterState === 'yes' ? 'Has' : filterState === 'no' ? 'No' : null;
                          
                          return (
                            <button
                              type="button"
                              title={hasFilter 
                                ? `Teams: ${stateLabel} (click to cycle)` 
                                : `Filter by Teams (click to activate)`}
                              onClick={(e) => {
                                e.stopPropagation();
                                cycleEnquiryPipelineFilter('teams');
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 3,
                                height: 22,
                                minWidth: '90px',
                                padding: '0 8px',
                                background: hasFilter 
                                  ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                  : 'transparent',
                                border: hasFilter 
                                  ? `1px solid ${filterColor}40`
                                  : '1px solid transparent',
                                borderRadius: 0,
                                cursor: 'pointer',
                                transition: 'all 150ms ease',
                                opacity: hasFilter ? 1 : 0.7,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '1';
                                e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = hasFilter ? '1' : '0.7';
                                e.currentTarget.style.background = hasFilter 
                                  ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                  : 'transparent';
                              }}
                            >
                              <Icon iconName="TeamsLogo" styles={{ root: { fontSize: 10, color: filterColor } }} />
                              <span style={{ fontSize: 9, fontWeight: 600, color: filterColor, textTransform: 'uppercase' }}>Teams</span>
                              {hasFilter && <span style={{ width: 6, height: 6, borderRadius: '50%', background: filterColor, marginLeft: 1 }}/>}
                            </button>
                          );
                        })()}
                        
                        {/* Stage connector */}
                        <div style={{ width: 8, height: 1, background: isDarkMode ? 'linear-gradient(to right, rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0.15))' : 'linear-gradient(to right, rgba(148, 163, 184, 0.25), rgba(148, 163, 184, 0.1))', alignSelf: 'center' }} />
                        
                        {/* POC filter - dropdown for All mode, simple toggle for Mine mode */}
                        {(() => {
                          const currentUserEmail = userData?.[0]?.Email?.toLowerCase() || '';
                          const currentUserInitials = userData?.[0]?.Initials || 
                            teamData?.find(t => t.Email?.toLowerCase() === currentUserEmail)?.Initials ||
                            currentUserEmail.split('@')[0]?.slice(0, 2).toUpperCase() || 'ME';
                          const isFiltered = !!selectedPocFilter;
                          const isFilteredToMe = selectedPocFilter?.toLowerCase() === currentUserEmail;
                          
                          // Get display initials for current filter
                          const getFilteredInitials = () => {
                            if (!selectedPocFilter) return 'POC';
                            if (selectedPocFilter.toLowerCase() === currentUserEmail) return currentUserInitials;
                            const teamMember = teamData?.find(t => t.Email?.toLowerCase() === selectedPocFilter.toLowerCase());
                            return teamMember?.Initials || selectedPocFilter.split('@')[0]?.slice(0, 2).toUpperCase() || 'POC';
                          };
                          
                          const filterColor = isFiltered ? colours.highlight : (isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)');
                          
                          // In "All" mode, show dropdown; in "Mine" mode, simple toggle
                          if (!showMineOnly) {
                            return (
                              <div style={{ position: 'relative' }}>
                                <button
                                  type="button"
                                  title={isFiltered ? `Filtering by ${getFilteredInitials()} - Click to change` : 'Filter by POC (click to select)'}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsPocDropdownOpen(prev => !prev);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 3,
                                    height: 22,
                                    minWidth: '70px',
                                    padding: '0 8px',
                                    background: isFiltered 
                                      ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                      : 'transparent',
                                    border: isFiltered 
                                      ? `1px solid ${colours.highlight}40`
                                      : '1px solid transparent',
                                    borderRadius: 0,
                                    cursor: 'pointer',
                                    transition: 'all 150ms ease',
                                    opacity: isFiltered ? 1 : 0.7,
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.opacity = '1';
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.opacity = isFiltered ? '1' : '0.7';
                                    e.currentTarget.style.background = isFiltered 
                                      ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                      : 'transparent';
                                  }}
                                >
                                  <Icon iconName="Contact" styles={{ root: { fontSize: 10, color: filterColor } }} />
                                  <span style={{ fontSize: 9, fontWeight: 600, color: filterColor, textTransform: 'uppercase' }}>
                                    {getFilteredInitials()}
                                  </span>
                                  <Icon iconName="ChevronDown" styles={{ root: { fontSize: 8, color: filterColor, marginLeft: 1 } }} />
                                  {isFiltered && <span style={{ width: 6, height: 6, borderRadius: '50%', background: filterColor, marginLeft: 1 }}/>}
                                </button>
                                
                                {isPocDropdownOpen && (
                                  <div
                                    className="poc-filter-dropdown"
                                    style={{
                                      position: 'absolute',
                                      top: '100%',
                                      left: 0,
                                      marginTop: 4,
                                      minWidth: 140,
                                      background: isDarkMode ? 'rgba(30, 41, 59, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'}`,
                                      borderRadius: 4,
                                      boxShadow: isDarkMode 
                                        ? '0 4px 12px rgba(0, 0, 0, 0.4)'
                                        : '0 4px 12px rgba(0, 0, 0, 0.15)',
                                      zIndex: 1000,
                                      maxHeight: 200,
                                      overflowY: 'auto',
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {/* Clear filter option */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedPocFilter(null);
                                        setIsPocDropdownOpen(false);
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        width: '100%',
                                        padding: '8px 12px',
                                        background: !selectedPocFilter 
                                          ? (isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(54, 144, 206, 0.1)')
                                          : 'transparent',
                                        border: 'none',
                                        borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.15)'}`,
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        fontSize: 11,
                                        color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (selectedPocFilter) e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = !selectedPocFilter 
                                          ? (isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(54, 144, 206, 0.1)')
                                          : 'transparent';
                                      }}
                                    >
                                      <Icon iconName="Clear" styles={{ root: { fontSize: 10 } }} />
                                      <span>All POCs</span>
                                    </button>
                                    
                                    {/* Team members */}
                                    {teamData?.filter(t => t.Email).map((member) => {
                                      const memberEmail = member.Email?.toLowerCase() || '';
                                      const memberInitials = member.Initials || memberEmail.split('@')[0]?.slice(0, 2).toUpperCase();
                                      const memberName = member.First || member.Initials || memberEmail.split('@')[0];
                                      const isSelected = selectedPocFilter?.toLowerCase() === memberEmail;
                                      const isCurrentUser = memberEmail === currentUserEmail;
                                      
                                      return (
                                        <button
                                          key={memberEmail}
                                          type="button"
                                          onClick={() => {
                                            setSelectedPocFilter(memberEmail);
                                            setIsPocDropdownOpen(false);
                                          }}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            width: '100%',
                                            padding: '8px 12px',
                                            background: isSelected 
                                              ? (isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(54, 144, 206, 0.1)')
                                              : 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            fontSize: 11,
                                            color: isSelected 
                                              ? (isDarkMode ? colours.accent : colours.highlight)
                                              : (isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.7)'),
                                            fontWeight: isSelected ? 600 : 400,
                                          }}
                                          onMouseEnter={(e) => {
                                            if (!isSelected) e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.background = isSelected 
                                              ? (isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(54, 144, 206, 0.1)')
                                              : 'transparent';
                                          }}
                                        >
                                          <span style={{ 
                                            width: 24, 
                                            height: 24, 
                                            borderRadius: '50%', 
                                            background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 9,
                                            fontWeight: 600,
                                          }}>
                                            {memberInitials}
                                          </span>
                                          <span>{memberName}{isCurrentUser ? ' (me)' : ''}</span>
                                          {isSelected && <Icon iconName="Accept" styles={{ root: { fontSize: 10, marginLeft: 'auto' } }} />}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          
                          // Mine mode - simple toggle for current user
                          return (
                            <button
                              type="button"
                              title={isFilteredToMe ? `Filtering by your POC (${currentUserInitials}) - Click to clear` : `Filter by your POC (${currentUserInitials})`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPocFilter(isFilteredToMe ? null : currentUserEmail);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 3,
                                height: 22,
                                minWidth: '70px',
                                padding: '0 8px',
                                background: isFilteredToMe 
                                  ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                  : 'transparent',
                                border: isFilteredToMe 
                                  ? `1px solid ${colours.highlight}40`
                                  : '1px solid transparent',
                                borderRadius: 0,
                                cursor: 'pointer',
                                transition: 'all 150ms ease',
                                opacity: isFilteredToMe ? 1 : 0.7,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '1';
                                e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = isFilteredToMe ? '1' : '0.7';
                                e.currentTarget.style.background = isFilteredToMe 
                                  ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                  : 'transparent';
                              }}
                            >
                              <Icon iconName="Contact" styles={{ root: { fontSize: 10, color: filterColor } }} />
                              <span style={{ fontSize: 9, fontWeight: 600, color: filterColor, textTransform: 'uppercase' }}>
                                {currentUserInitials}
                              </span>
                              {isFilteredToMe && <span style={{ width: 6, height: 6, borderRadius: '50%', background: filterColor, marginLeft: 1 }}/>}
                            </button>
                          );
                        })()}
                        
                        {/* Stage connector */}
                        <div style={{ width: 8, height: 1, background: isDarkMode ? 'linear-gradient(to right, rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0.15))' : 'linear-gradient(to right, rgba(148, 163, 184, 0.25), rgba(148, 163, 184, 0.1))', alignSelf: 'center' }} />
                        
                        {/* Pitch toggle */}
                        {(() => {
                          const filterState = getEnquiryStageFilterState('pitched');
                          const hasFilter = filterState !== null;
                          const getFilterColor = () => {
                            if (!filterState) return isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)';
                            if (filterState === 'yes') return '#22c55e';
                            if (filterState === 'no') return '#ef4444';
                            return colours.highlight;
                          };
                          const filterColor = getFilterColor();
                          const stateLabel = filterState === 'yes' ? 'Has' : filterState === 'no' ? 'No' : null;
                          
                          return (
                            <button
                              type="button"
                              title={hasFilter 
                                ? `Pitch: ${stateLabel} (click to cycle)` 
                                : `Filter by Pitch (click to activate)`}
                              onClick={(e) => {
                                e.stopPropagation();
                                cycleEnquiryPipelineFilter('pitched');
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 3,
                                height: 22,
                                minWidth: '70px',
                                padding: '0 8px',
                                background: hasFilter 
                                  ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                  : 'transparent',
                                border: hasFilter 
                                  ? `1px solid ${filterColor}40`
                                  : '1px solid transparent',
                                borderRadius: 0,
                                cursor: 'pointer',
                                transition: 'all 150ms ease',
                                opacity: hasFilter ? 1 : 0.7,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.opacity = '1';
                                e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.opacity = hasFilter ? '1' : '0.7';
                                e.currentTarget.style.background = hasFilter 
                                  ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                  : 'transparent';
                              }}
                            >
                              <Icon iconName="Money" styles={{ root: { fontSize: 10, color: filterColor } }} />
                              <span style={{ fontSize: 9, fontWeight: 600, color: filterColor, textTransform: 'uppercase' }}>Pitch</span>
                              {hasFilter && <span style={{ width: 6, height: 6, borderRadius: '50%', background: filterColor, marginLeft: 1 }}/>}
                            </button>
                          );
                        })()}
                        
                        {/* Pitch Scenario dropdown */}
                        <div style={{ position: 'relative' }}>
                          <button
                            type="button"
                            title={selectedPitchScenarioFilter 
                              ? `Scenario: ${SCENARIOS.find(s => s.id === selectedPitchScenarioFilter)?.name || selectedPitchScenarioFilter} (click to change)` 
                              : 'Filter by Pitch Scenario (click to select)'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsPitchScenarioDropdownOpen(prev => !prev);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 3,
                              height: 22,
                              minWidth: '28px',
                              padding: '0 6px',
                              background: selectedPitchScenarioFilter 
                                ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                : 'transparent',
                              border: selectedPitchScenarioFilter 
                                ? `1px solid ${colours.highlight}40`
                                : '1px solid transparent',
                              borderRadius: 0,
                              cursor: 'pointer',
                              transition: 'all 150ms ease',
                              opacity: selectedPitchScenarioFilter ? 1 : 0.7,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.opacity = '1';
                              e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.opacity = selectedPitchScenarioFilter ? '1' : '0.7';
                              e.currentTarget.style.background = selectedPitchScenarioFilter 
                                ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                : 'transparent';
                            }}
                          >
                            <Icon iconName="ChevronDown" styles={{ root: { fontSize: 8, color: selectedPitchScenarioFilter ? colours.highlight : (isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)') } }} />
                          </button>
                          
                          {/* Pitch Scenario Dropdown menu */}
                          {isPitchScenarioDropdownOpen && (
                            <div 
                              style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: 4,
                                minWidth: 220,
                                maxHeight: 320,
                                overflowY: 'auto',
                                background: isDarkMode ? 'rgba(30, 41, 59, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.15)'}`,
                                borderRadius: 6,
                                boxShadow: isDarkMode 
                                  ? '0 10px 40px rgba(0, 0, 0, 0.5)' 
                                  : '0 10px 40px rgba(0, 0, 0, 0.15)',
                                zIndex: 1000,
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Clear option */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPitchScenarioFilter(null);
                                  setIsPitchScenarioDropdownOpen(false);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  background: !selectedPitchScenarioFilter ? (isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)') : 'transparent',
                                  border: 'none',
                                  borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.1)'}`,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  fontSize: 12,
                                  color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.8)',
                                  fontStyle: 'italic',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = !selectedPitchScenarioFilter ? (isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)') : 'transparent'; }}
                              >
                                All scenarios
                              </button>
                              
                              {/* Scenario options */}
                              {SCENARIOS.map((scenario) => {
                                // Colors matching pitch-builder EditorAndTemplateBlocks.tsx
                                const getScenarioColor = () => {
                                  switch (scenario.id) {
                                    case 'before-call-call': return colours.blue; // #3690ce
                                    case 'before-call-no-call': return isDarkMode ? '#FBBF24' : '#D97706'; // amber
                                    case 'after-call-probably-cant-assist': return isDarkMode ? '#F87171' : '#DC2626'; // red
                                    case 'after-call-want-instruction': return isDarkMode ? '#4ADE80' : '#059669'; // green
                                    case 'cfa': return isDarkMode ? '#A855F7' : '#8B5CF6'; // purple
                                    default: return colours.highlight;
                                  }
                                };
                                const getScenarioIcon = () => {
                                  switch (scenario.id) {
                                    case 'before-call-call': return 'Phone';
                                    case 'before-call-no-call': return 'Mail';
                                    case 'after-call-probably-cant-assist': return 'Cancel';
                                    case 'after-call-want-instruction': return 'CheckMark';
                                    case 'cfa': return 'Scales';
                                    default: return 'CircleFill';
                                  }
                                };
                                return (
                                  <button
                                    key={scenario.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedPitchScenarioFilter(scenario.id);
                                      // Auto-enable "Pitched: yes" filter when selecting a scenario
                                      setEnquiryPipelineFilters(prev => {
                                        const newFilters = new Map(prev);
                                        newFilters.set('pitched', 'yes');
                                        return newFilters;
                                      });
                                      setIsPitchScenarioDropdownOpen(false);
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '8px 12px',
                                      background: selectedPitchScenarioFilter === scenario.id 
                                        ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.1)')
                                        : 'transparent',
                                      border: 'none',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      fontSize: 12,
                                      color: selectedPitchScenarioFilter === scenario.id
                                        ? colours.highlight
                                        : (isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(30, 41, 59, 0.9)'),
                                      fontWeight: selectedPitchScenarioFilter === scenario.id ? 600 : 400,
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)'; }}
                                    onMouseLeave={(e) => { 
                                      e.currentTarget.style.background = selectedPitchScenarioFilter === scenario.id 
                                        ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.1)')
                                        : 'transparent'; 
                                    }}
                                  >
                                    <span style={{
                                      width: 22,
                                      height: 22,
                                      borderRadius: '50%',
                                      background: `${getScenarioColor()}20`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}>
                                      <Icon iconName={getScenarioIcon()} styles={{ root: { fontSize: 10, color: getScenarioColor() } }} />
                                    </span>
                                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {scenario.name}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        
                        {/* Clear all filters button */}
                        {(enquiryPipelineFilters.size > 0 || selectedPocFilter || selectedPitchScenarioFilter) && (
                          <button
                            type="button"
                            title="Clear all pipeline filters"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEnquiryPipelineFilters(new Map());
                              setSelectedPocFilter(null);
                              setSelectedPitchScenarioFilter(null);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 18,
                              height: 18,
                              marginLeft: 6,
                              background: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                              border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)'}`,
                              borderRadius: '50%',
                              cursor: 'pointer',
                              transition: 'all 150ms ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = isDarkMode ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.15)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)';
                            }}
                          >
                            <Icon
                              iconName="Cancel"
                              styles={{
                                root: {
                                  fontSize: 8,
                                  color: '#ef4444',
                                },
                              }}
                            />
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px' }}>
                        <span>Actions</span>
                        <button
                          type="button"
                          onClick={() => setAreActionsEnabled((prev) => !prev)}
                          title={areActionsEnabled ? 'Disable row actions to prevent edits/deletes' : 'Enable row actions to edit or delete enquiries'}
                          style={{
                            width: 24,
                                                height: 24,
                            minWidth: 22,
                            minHeight: 22,
                            borderRadius: '999px',
                            border: `1px solid ${areActionsEnabled ? (isDarkMode ? 'rgba(96,165,250,0.5)' : 'rgba(59,130,246,0.4)') : (isDarkMode ? 'rgba(148,163,184,0.4)' : 'rgba(100,116,139,0.35)')}`,
                            background: areActionsEnabled
                              ? (isDarkMode ? 'rgba(96,165,250,0.15)' : 'rgba(59,130,246,0.08)')
                              : 'transparent',
                            color: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            padding: 0,
                          }}
                          aria-pressed={areActionsEnabled}
                        >
                          <Icon
                            iconName={areActionsEnabled ? 'UnlockSolid' : 'LockSolid'}
                            styles={{
                              root: {
                                fontSize: '11px',
                                color: areActionsEnabled
                                  ? (isDarkMode ? colours.accent : colours.highlight)
                                  : (isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(71, 85, 105, 0.85)'),
                              },
                            }}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Data Rows */}
                    {displayedItems.map((item, idx) => {
                      const isLast = idx === displayedItems.length - 1;
                      
                      // Handle different item types
                      if (isGroupedEnquiry(item)) {
                        // For grouped enquiries, show summary info only
                        const latestEnquiry = item.enquiries[0]; // Most recent enquiry in the group
                        
                        const contactName = item.clientName;
                        const dateReceived = item.latestDate;

                        const claimerSummary = item.enquiries.reduce<Record<string, { count: number; label: string; fullName: string }>>((acc, enq) => {
                          const pocEmail = (enq.Point_of_Contact || (enq as any).poc || '').toLowerCase();
                          if (!pocEmail) {
                            return acc;
                          }
                          if (!acc[pocEmail]) {
                            const claimerInfo = claimerMap[pocEmail];
                            const label = pocEmail === 'team@helix-law.com'
                              ? 'Team inbox'
                              : getPocInitials(pocEmail);
                            const fullName = claimerInfo?.DisplayName || claimerInfo?.FullName || claimerInfo?.Name || pocEmail;
                            acc[pocEmail] = { count: 0, label, fullName };
                          }
                          acc[pocEmail].count += 1;
                          return acc;
                        }, {});
                        const claimerBadges = Object.entries(claimerSummary)
                          .map(([poc, info]) => ({ poc, ...info }))
                          .sort((a, b) => b.count - a.count);
                        
                        // Add day separator logic for grouped enquiries
                        const groupExtractDateStr = (enq: any): string =>
                          (enq?.Touchpoint_Date || enq?.datetime || enq?.claim || enq?.Date_Created || '') as string;
                        const groupToDayKey = (s: string): string => {
                          if (!s) return '';
                          const d = new Date(s);
                          if (isNaN(d.getTime())) return '';
                          return d.toISOString().split('T')[0];
                        };
                        const groupThisDateStr = groupExtractDateStr(latestEnquiry as any);
                        const groupPrevItem: any = idx > 0 ? displayedItems[idx - 1] : null;
                        let groupPrevDateStr = '';
                        if (groupPrevItem) {
                          if (isGroupedEnquiry(groupPrevItem)) {
                            groupPrevDateStr = groupExtractDateStr(groupPrevItem.enquiries[0] as any);
                          } else {
                            groupPrevDateStr = groupExtractDateStr(groupPrevItem as any);
                          }
                        }
                        const groupShowDaySeparator = viewMode === 'table' && (idx === 0 || groupToDayKey(groupThisDateStr) !== groupToDayKey(groupPrevDateStr));
                        const thisDayKey = groupToDayKey(groupThisDateStr);
                        const isDayCollapsed = collapsedDays.has(thisDayKey);

                        return (
                          <React.Fragment key={item.clientKey}>
                          {/* Day separator with timeline dot */}
                          {groupShowDaySeparator && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleDayCollapse(thisDayKey);
                              }}
                              onMouseEnter={() => setHoveredDayKey(thisDayKey)}
                              onMouseLeave={() => setHoveredDayKey((prev) => (prev === thisDayKey ? null : prev))}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '32px 1fr auto',
                                gap: '12px',
                                alignItems: 'center',
                                padding: '8px 16px',
                                cursor: 'pointer',
                                background:
                                  hoveredDayKey === thisDayKey
                                    ? (isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.08)')
                                    : (isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.8)'),
                                borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.25)'}`,
                                borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.25)'}`,
                              }}
                            >
                              {/* Timeline cell with line and dot */}
                              <div style={{
                                position: 'relative',
                                height: '100%',
                                minHeight: 24,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                {/* Vertical line - only below the dot */}
                                <div style={{
                                  position: 'absolute',
                                  left: '50%',
                                  top: '50%',
                                  bottom: 0,
                                  width: '1px',
                                  transform: 'translateX(-50%)',
                                  background:
                                    hoveredDayKey === thisDayKey
                                      ? (isDarkMode ? colours.accent : colours.highlight)
                                      : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'),
                                  opacity: hoveredDayKey === thisDayKey ? 0.9 : 1,
                                }} />
                                {/* Timeline dot */}
                                <div style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  background:
                                    hoveredDayKey === thisDayKey
                                      ? (isDarkMode ? colours.accent : colours.highlight)
                                      : (isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(148, 163, 184, 0.5)'),
                                  border: `2px solid ${isDarkMode ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)'}`,
                                  zIndex: 1,
                                }} />
                              </div>
                              {/* Day label and chevron */}
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: hoveredDayKey === thisDayKey ? 800 : 700,
                                  color:
                                    hoveredDayKey === thisDayKey
                                      ? (isDarkMode ? colours.accent : colours.highlight)
                                      : (isDarkMode ? 'rgba(148, 163, 184, 0.85)' : 'rgba(71, 85, 105, 0.95)'),
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px',
                                }}>
                                  {formatDaySeparatorLabel(thisDayKey)}
                                  <span style={{
                                    marginLeft: '6px',
                                    fontSize: '9px',
                                    fontWeight: 400,
                                    color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                                    backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.1)',
                                    padding: '1px 5px',
                                    borderRadius: '8px',
                                    lineHeight: 1.2,
                                    textTransform: 'none',
                                    letterSpacing: 'normal',
                                  }}>
                                    {displayedItems.filter((enq) => {
                                      const enqDateStr = isGroupedEnquiry(enq) ? enq.latestDate : ((enq as any)?.Touchpoint_Date || (enq as any)?.datetime || (enq as any)?.claim || (enq as any)?.Date_Created || '');
                                      return groupToDayKey(enqDateStr) === thisDayKey;
                                    }).length}
                                  </span>
                                </span>
                                <Icon 
                                  iconName={isDayCollapsed ? 'ChevronRight' : 'ChevronDown'} 
                                  styles={{ 
                                    root: { 
                                      fontSize: 10, 
                                      marginLeft: 6,
                                      color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
                                    } 
                                  }} 
                                />
                              </div>

                              {/* Collapsed eye indicator */}
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'flex-end',
                                paddingLeft: '12px',
                                pointerEvents: 'none',
                                opacity: isDayCollapsed ? 1 : 0,
                                transition: 'opacity 0.2s ease'
                              }}>
                                {isDayCollapsed && (
                                  <Icon
                                    iconName="Hide3"
                                    styles={{
                                      root: {
                                        fontSize: 12,
                                        color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                                      },
                                    }}
                                    title={`${displayedItems.filter((enq) => {
                                      const enqDateStr = isGroupedEnquiry(enq) ? enq.latestDate : ((enq as any)?.Touchpoint_Date || (enq as any)?.datetime || (enq as any)?.claim || (enq as any)?.Date_Created || '');
                                      return groupToDayKey(enqDateStr) === thisDayKey;
                                    }).length} items hidden`}
                                  />
                                )}
                              </div>
                            </div>
                          )}
                          {/* Skip row if day is collapsed */}
                          {!isDayCollapsed && (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '32px 70px 50px 60px 1.2fr 0.5fr 1.6fr 0.5fr',
                              gap: '12px',
                              padding: '10px 16px',
                              alignItems: 'center',
                              borderBottom: isLast ? 'none' : `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'}`,
                              fontSize: '13px',
                              color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)',
                              background: idx % 2 === 0 
                                ? (isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)')
                                : 'transparent',
                              transition: 'background-color 0.15s ease',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = isDarkMode 
                                ? 'rgba(255, 255, 255, 0.06)' 
                                : 'rgba(0, 0, 0, 0.03)';
                              setHoveredDayKey(thisDayKey);
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = idx % 2 === 0 
                                ? (isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)')
                                : 'transparent';
                              setHoveredDayKey((prev) => (prev === thisDayKey ? null : prev));
                            }}
                            onClick={(e) => {
                              // Toggle group expansion
                              const groupKey = item.clientKey;
                              setExpandedGroupsInTable(prev => {
                                const next = new Set(prev);
                                if (next.has(groupKey)) {
                                  next.delete(groupKey);
                                } else {
                                  next.add(groupKey);
                                }
                                return next;
                              });
                            }}
                          >
                            {/* Timeline cell */}
                            <div style={{
                              position: 'relative',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <div style={{
                                position: 'absolute',
                                left: '50%',
                                top: 0,
                                bottom: 0,
                                width: '1px',
                                transform: 'translateX(-50%)',
                                background: hoveredDayKey === thisDayKey
                                  ? (isDarkMode ? colours.accent : colours.highlight)
                                  : (isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'),
                                opacity: hoveredDayKey === thisDayKey ? 0.9 : 1,
                                transition: 'background 0.15s ease, opacity 0.15s ease',
                              }} />
                            </div>

                            {/* Date column - compact single-line format */}
                            <TooltipHost
                              content={formatFullDateTime(dateReceived || null)}
                              styles={{ root: { display: 'flex', alignItems: 'center', height: '100%' } }}
                              calloutProps={{ gapSpace: 6 }}
                            >
                              <span style={{
                                fontSize: '11px',
                                color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
                                fontWeight: 500,
                                fontVariantNumeric: 'tabular-nums',
                                whiteSpace: 'nowrap',
                              }}>
                                {getCompactTimeDisplay(dateReceived)}
                              </span>
                            </TooltipHost>

                            {/* Area of Work column - empty for groups */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '100%' }}>
                              {/* Hidden for grouped enquiries */}
                            </div>

                            {/* ID column - empty for group headers */}
                            <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                              {/* Group rows don't show individual IDs */}
                            </div>

                            {/* Contact & Company */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '100%' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ fontWeight: 600, fontSize: '13px', color: isDarkMode ? '#E5E7EB' : '#1F2937' }}>
                                  {contactName}
                                </div>
                                {latestEnquiry.Company && (
                                  <div style={{ 
                                    fontSize: '11px', 
                                    color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)',
                                    fontWeight: 500 
                                  }}>
                                    {latestEnquiry.Company}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Value column - show count badge */}
                            <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                              <div style={{
                                padding: '2px 8px',
                                borderRadius: 0,
                                background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
                                border: `1px solid ${colours.blue}`,
                                fontSize: 10,
                                fontWeight: 600,
                                color: colours.blue,
                              }}>
                                x{item.enquiries.length}
                              </div>
                            </div>

                            {/* Pipeline column - empty for group headers */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: '100%', flexWrap: 'wrap', overflow: 'hidden', fontSize: '10px' }}>
                              {/* Empty - individual claimer badges will show in child rows */}
                            </div>

                            {/* Actions column - contains chevron for group expansion */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const groupKey = item.clientKey;
                                  setExpandedGroupsInTable(prev => {
                                    const next = new Set(prev);
                                    if (next.has(groupKey)) {
                                      next.delete(groupKey);
                                    } else {
                                      next.add(groupKey);
                                    }
                                    return next;
                                  });
                                }}
                                style={{
                                  width: 24,
                                    height: 24,
                                  borderRadius: 0,
                                  background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  pointerEvents: 'auto',
                                  transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)';
                                  e.currentTarget.style.transform = 'scale(1.05)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)';
                                  e.currentTarget.style.transform = 'scale(1)';
                                }}
                                title={expandedGroupsInTable.has(item.clientKey) ? 'Collapse group' : 'Expand group'}
                              >
                                <Icon
                                  iconName={expandedGroupsInTable.has(item.clientKey) ? 'ChevronUp' : 'ChevronDown'}
                                  styles={{
                                    root: {
                                      fontSize: '10px',
                                      color: isDarkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(71, 85, 105, 0.9)',
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                          )}
                          
                          {/* Expanded child enquiries - show ALL enquiries when expanded */}
                          {!isDayCollapsed && expandedGroupsInTable.has(item.clientKey) && item.enquiries.map((childEnquiry: Enquiry, childIdx: number) => {
                            const childAOW = childEnquiry.Area_of_Work || 'Unspecified';
                            const childValue = childEnquiry.Value || '';
                            const childContactName = `${childEnquiry.First_Name || ''} ${childEnquiry.Last_Name || ''}`.trim() || 'Unknown';
                            const childCompanyName = childEnquiry.Company || '';
                            const childIsV2 = (childEnquiry as any).__sourceType === 'new' || (childEnquiry as any).source === 'instructions';
                            const childEnrichmentData = enrichmentMap.get(String(childEnquiry.ID));
                            const childTeamsLink = (childEnrichmentData?.teamsData as any)?.teamsLink as string | undefined;
                            const childHasNotes = childEnquiry.Initial_first_call_notes && childEnquiry.Initial_first_call_notes.trim().length > 0;
                            const childNoteKey = buildEnquiryIdentityKey(childEnquiry);
                            const childNotesExpanded = expandedNotesInTable.has(childNoteKey);
                            const childPocIdentifier = childEnquiry.Point_of_Contact || (childEnquiry as any).poc || '';
                            const childPocEmail = childPocIdentifier.toLowerCase();
                            const childClaimerInfo = claimerMap[childPocEmail];
                            const childClaimerLabel = childPocEmail === 'team@helix-law.com'
                              ? 'Team inbox'
                              : (childClaimerInfo?.Initials || getPocInitials(childPocIdentifier));
                            const childClaimerSecondary = childPocEmail === 'team@helix-law.com'
                              ? 'Shared'
                              : (childClaimerInfo?.DisplayName?.split(' ')[0] || (childEnquiry.Point_of_Contact || '').split('@')[0] || 'Claimed');
                            const childClaimerColor = childPocEmail === 'team@helix-law.com' ? colours.orange : colours.blue;
                            const childHasClaimer = !!childPocEmail;
                            const childClaimerTitle = childHasClaimer
                              ? `${childEnquiry.Point_of_Contact || childPocEmail}`
                              : 'Unassigned';
                            
                            // No day separators for child enquiries - parent group already has timeline marker
                            
                            return (
                              <React.Fragment key={`${childEnquiry.ID}-${childEnquiry.First_Name || ''}-${childEnquiry.Last_Name || ''}-${childEnquiry.Touchpoint_Date || ''}-${childEnquiry.Point_of_Contact || ''}`}>
                              <div
                                key={`item-${childEnquiry.ID}-${childEnquiry.First_Name || ''}-${childEnquiry.Last_Name || ''}-${childEnquiry.Touchpoint_Date || ''}-${childEnquiry.Point_of_Contact || ''}`}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '70px 50px 60px 1.2fr 0.5fr 1.6fr 0.5fr',
                                  gap: '12px',
                                  padding: '8px 16px 8px 40px',
                                  alignItems: 'center',
                                  borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'}`,
                                  position: 'relative',
                                  fontSize: '11px',
                                  color: isDarkMode ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.7)',
                                  background: isDarkMode ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.005)',
                                  cursor: 'pointer',
                                  marginLeft: '20px',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectEnquiry(childEnquiry);
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = isDarkMode 
                                    ? 'rgba(255, 255, 255, 0.04)' 
                                    : 'rgba(0, 0, 0, 0.02)';
                                  // Show child tooltip on hover
                                  const tooltip = e.currentTarget.querySelector('.child-timeline-date-tooltip') as HTMLElement;
                                  if (tooltip) tooltip.style.opacity = '1';
                                  // Track hovered row for contact actions
                                  setHoveredRowId(childEnquiry.ID);
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = isDarkMode 
                                    ? 'rgba(255, 255, 255, 0.01)' 
                                    : 'rgba(0, 0, 0, 0.005)';
                                  // Hide child tooltip
                                  const tooltip = e.currentTarget.querySelector('.child-timeline-date-tooltip') as HTMLElement;
                                  if (tooltip) tooltip.style.opacity = '0';
                                  // Clear hovered row
                                  setHoveredRowId(null);
                                }}
                              >
                                {/* Child timeline - most recent connects to parent, others standalone */}
                                <div style={{
                                  position: 'absolute',
                                  left: '-47px', // Compensate for 20px marginLeft indentation
                                  top: 0,
                                  bottom: 0,
                                  width: '24px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'flex-start',
                                  justifyContent: 'center',
                                  pointerEvents: 'none'
                                }}>
                                  {childIdx === 0 ? (
                                    // First child (most recent) - connects to parent timeline
                                    <>
                                      {/* Connector from parent */}
                                      <div style={{
                                        position: 'absolute',
                                        left: '3px',
                                        top: 0,
                                        height: '50%',
                                        width: '1px',
                                        background: isDarkMode 
                                          ? 'rgba(135, 243, 243, 0.3)' 
                                          : 'rgba(54, 144, 206, 0.25)',
                                      }} />
                                      
                                      {/* Horizontal branch to child */}
                                      <div style={{
                                        position: 'absolute',
                                        left: '3px',
                                        top: '50%',
                                        width: '17px', // Longer to reach indented child
                                        height: '1px',
                                        background: isDarkMode 
                                          ? 'rgba(135, 243, 243, 0.25)' 
                                          : 'rgba(54, 144, 206, 0.2)',
                                      }} />
                                      
                                      {/* Connection dot */}
                                      <div style={{
                                        position: 'absolute',
                                        left: '19px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        width: '3px',
                                        height: '3px',
                                        borderRadius: '50%',
                                        background: isDarkMode ? 'rgba(135, 243, 243, 0.6)' : 'rgba(54, 144, 206, 0.6)',
                                        border: `1px solid ${isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.9)'}`,
                                      }} />
                                    </>
                                  ) : (
                                    // Older children - minimal standalone indicator
                                    <>
                                      {/* Standalone dot only */}
                                      <div style={{
                                        position: 'absolute',
                                        left: '19px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        width: '2px',
                                        height: '2px',
                                        borderRadius: '50%',
                                        background: isDarkMode ? 'rgba(135, 243, 243, 0.35)' : 'rgba(54, 144, 206, 0.3)',
                                        border: `1px solid ${isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.9)'}`,
                                      }} />
                                    </>
                                  )}
                                </div>

                                {/* Date column for child - compact format */}
                                <TooltipHost
                                  content={formatFullDateTime(childEnquiry.Touchpoint_Date || (childEnquiry as any).datetime || (childEnquiry as any).claim || null)}
                                  styles={{ root: { display: 'flex', alignItems: 'center', height: '100%' } }}
                                  calloutProps={{ gapSpace: 6 }}
                                >
                                  {(() => {
                                    const childDateStr = childEnquiry.Touchpoint_Date || (childEnquiry as any).datetime || (childEnquiry as any).claim;
                                    return (
                                      <span style={{
                                        fontSize: '10px',
                                        color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)',
                                        fontWeight: 500,
                                        fontVariantNumeric: 'tabular-nums',
                                        whiteSpace: 'nowrap',
                                      }}>
                                        {getCompactTimeDisplay(childDateStr)}
                                      </span>
                                    );
                                  })()}
                                </TooltipHost>
                                
                                {/* AOW icon - second column */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative' }}>
                                  <span style={{ fontSize: '16px', lineHeight: 1, opacity: 0.7 }} title={childAOW}>
                                    {getAreaOfWorkIcon(childAOW)}
                                  </span>
                                </div>

                                {/* ID / Instruction Ref */}
                                <div style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '2px',
                                  lineHeight: 1.3,
                                  justifyContent: 'center'
                                }}>
                                  <div style={{
                                    fontFamily: 'Monaco, Consolas, monospace',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    color: colours.highlight,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {childEnquiry.ID}
                                  </div>
                                  {childEnrichmentData?.pitchData?.instructionRef && (
                                    <div style={{
                                      fontFamily: 'Monaco, Consolas, monospace',
                                      fontSize: '9px',
                                      color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {childEnrichmentData.pitchData.instructionRef}
                                    </div>
                                  )}
                                </div>
                                
                                {/* Contact & Company */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', justifyContent: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <div 
                                      style={{ 
                                        fontWeight: 500, 
                                        fontSize: '11px', 
                                        color: isDarkMode ? '#E5E7EB' : '#1F2937', 
                                        cursor: 'pointer',
                                        position: 'relative',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        padding: '1px 3px',
                                        borderRadius: '3px',
                                        background: 'transparent'
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(childContactName);
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(214, 232, 255, 0.8)';
                                        e.currentTarget.style.color = isDarkMode ? '#87F3F3' : '#3690CE';
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                        e.currentTarget.style.boxShadow = `0 2px 8px ${isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(54, 144, 206, 0.12)'}`;
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'transparent';
                                        e.currentTarget.style.color = isDarkMode ? '#E5E7EB' : '#1F2937';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = 'none';
                                      }}
                                      title="Click to copy contact name"
                                    >
                                      {childContactName}
                                      <span style={{
                                        position: 'absolute',
                                        bottom: '-2px',
                                        left: '4px',
                                        right: '4px',
                                        height: '1px',
                                        background: isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(54, 144, 206, 0.3)',
                                        transform: 'scaleX(0)',
                                        transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        transformOrigin: 'center'
                                      }} className="copy-underline" />
                                    </div>
                                    {/* Email inline with name */}
                                    {childEnquiry.Email && (
                                      <div 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard(childEnquiry.Email);
                                        }}
                                        style={{
                                          fontSize: '9px',
                                          color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
                                          fontFamily: 'Consolas, Monaco, monospace',
                                          maxWidth: '140px',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          cursor: 'pointer',
                                          padding: '2px 4px',
                                          borderRadius: '3px',
                                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                          background: 'transparent',
                                          border: '1px solid transparent',
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(214, 232, 255, 0.8)';
                                          e.currentTarget.style.color = isDarkMode ? '#87F3F3' : '#3690CE';
                                          e.currentTarget.style.border = `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.3)' : 'rgba(54, 144, 206, 0.25)'}`;
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = 'transparent';
                                          e.currentTarget.style.color = isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)';
                                          e.currentTarget.style.border = '1px solid transparent';
                                        }}
                                        title={`Click to copy: ${childEnquiry.Email}`}
                                      >
                                        {childEnquiry.Email}
                                      </div>
                                    )}
                                    {/* Phone inline with name/ID/email */}
                                    {(childEnquiry.Phone_Number || (childEnquiry as any).phone) && (
                                      <div 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard(childEnquiry.Phone_Number || (childEnquiry as any).phone);
                                        }}
                                        style={{
                                          fontSize: '9px',
                                          color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
                                          fontFamily: 'Consolas, Monaco, monospace',
                                          maxWidth: '120px',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          cursor: 'pointer',
                                          padding: '2px 4px',
                                          borderRadius: '3px',
                                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                          background: 'transparent',
                                          border: '1px solid transparent',
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(214, 232, 255, 0.8)';
                                          e.currentTarget.style.color = isDarkMode ? '#87F3F3' : '#3690CE';
                                          e.currentTarget.style.border = `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.3)' : 'rgba(54, 144, 206, 0.25)'}`;
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = 'transparent';
                                          e.currentTarget.style.color = isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)';
                                          e.currentTarget.style.border = '1px solid transparent';
                                        }}
                                        title={`Click to copy: ${childEnquiry.Phone_Number || (childEnquiry as any).phone}`}
                                      >
                                        {childEnquiry.Phone_Number || (childEnquiry as any).phone}
                                      </div>
                                    )}
                                  </div>
                                  {childCompanyName && (
                                    <div style={{ 
                                      fontSize: '10px', 
                                      color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
                                      fontWeight: 400,
                                      paddingLeft: '3px'
                                    }}>
                                      {childCompanyName}
                                    </div>
                                  )}
                                </div>

                                {/* Value */}
                                {(() => {
                                  const numValue = typeof childValue === 'string' ? parseFloat(childValue.replace(/[^0-9.]/g, '')) : (typeof childValue === 'number' ? childValue : 0);
                                  const displayValue = formatValueForDisplay(childValue);
                                  
                                  // Blue shades based on value range
                                  let textColor;
                                  if (numValue >= 50000) {
                                    textColor = isDarkMode ? 'rgba(54, 144, 206, 1)' : 'rgba(54, 144, 206, 1)'; // Brightest blue
                                  } else if (numValue >= 10000) {
                                    textColor = isDarkMode ? 'rgba(54, 144, 206, 0.75)' : 'rgba(54, 144, 206, 0.75)'; // Medium blue
                                  } else {
                                    textColor = isDarkMode ? 'rgba(54, 144, 206, 0.5)' : 'rgba(54, 144, 206, 0.55)'; // Subtle blue
                                  }
                                  
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                                      <span style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: textColor,
                                        whiteSpace: 'nowrap',
                                      }}>
                                        {displayValue || '-'}
                                      </span>
                                    </div>
                                  );
                                })()}
                                
                                {/* Pipeline for child */}
                                {(() => {
                                  const childTeamsTime = childIsV2 && childEnrichmentData?.teamsData
                                    ? (childEnrichmentData.teamsData as any).CreatedAt
                                    : null;
                                  const childPocClaimTime = (childEnquiry as any).claim || null;
                                  const childPitchTime = childEnrichmentData?.pitchData
                                    ? (childEnrichmentData.pitchData as any).pitchedDate
                                    : null;

                                  const childHasV2Infra = childIsV2
                                    || (childEnrichmentData?.teamsData)
                                    || (childEnrichmentData?.pitchData)
                                    || (childEnquiry as any).claim;
                                  const childIsLegacy = !childHasV2Infra;

                                  const isValidTimestamp = (dateStr: string | null) => {
                                    if (!dateStr) return false;
                                    const date = new Date(dateStr);
                                    return date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
                                  };

                                  const hasValidClaimTime = isValidTimestamp(childPocClaimTime);
                                  const hasValidPitchTime = childPitchTime ? isValidTimestamp(childPitchTime) : false;

                                  const calculateDuration = (fromDate: string | null, toDate: string | null) => {
                                    if (!fromDate || !toDate) return null;
                                    const from = new Date(fromDate);
                                    const to = new Date(toDate);
                                    let diff = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));

                                    const seconds = diff % 60; diff = Math.floor(diff / 60);
                                    const minutes = diff % 60; diff = Math.floor(diff / 60);
                                    const hours = diff % 24; diff = Math.floor(diff / 24);
                                    const days = diff % 7; diff = Math.floor(diff / 7);
                                    const weeks = diff;

                                    const parts: string[] = [];
                                    if (weeks > 0) { parts.push(`${weeks}w`); if (days > 0) parts.push(`${days}d`); }
                                    else if (days > 0) { parts.push(`${days}d`); if (hours > 0) parts.push(`${hours}h`); }
                                    else if (hours > 0) { parts.push(`${hours}h`); if (minutes > 0) parts.push(`${minutes}m`); }
                                    else if (minutes > 0) { parts.push(`${minutes}m`); if (seconds > 0) parts.push(`${seconds}s`); }
                                    else if (seconds > 0) parts.push(`${seconds}s`);
                                    if (parts.length === 0) parts.push('0s');
                                    return parts.slice(0, 2).join(' ');
                                  };

                                  const formatDateTime = (dateStr: string | null) => {
                                    if (!dateStr) return null;
                                    const date = new Date(dateStr);
                                    return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                                  };

                                  const showTeamsStage = childIsV2 && childTeamsTime;
                                  const showLegacyPlaceholder = childIsLegacy;
                                  // Determine loading vs not-resolvable state for V2 enquiries
                                  const childEnrichmentWasProcessed = childEnrichmentData && childEnrichmentData.enquiryId;
                                  const showLoadingState = childIsV2 && !childEnrichmentWasProcessed && !childIsLegacy && !childTeamsTime;
                                  const showNotResolvable = childIsV2 && childEnrichmentWasProcessed && !childEnrichmentData?.teamsData && !childIsLegacy;
                                  const showClaimer = childHasClaimer && activeState !== 'Triaged';
                                  const showPitch = !!childEnrichmentData?.pitchData;

                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: '100%' }}>
                                      {/* Loading state - show when V2 but enrichment not loaded yet */}
                                      {showLoadingState && (
                                        <div
                                          className="skeleton-shimmer"
                                          title="Loading pipeline data..."
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            padding: '4px 10px',
                                            borderRadius: 4,
                                            background: isDarkMode 
                                              ? 'linear-gradient(90deg, rgba(148,163,184,0.06) 25%, rgba(148,163,184,0.12) 50%, rgba(148,163,184,0.06) 75%)'
                                              : 'linear-gradient(90deg, rgba(148,163,184,0.04) 25%, rgba(148,163,184,0.08) 50%, rgba(148,163,184,0.04) 75%)',
                                            backgroundSize: '200% 100%',
                                            border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.1)'}`,
                                            fontSize: 9,
                                            fontWeight: 500,
                                            color: isDarkMode ? 'rgba(148,163,184,0.5)' : 'rgba(71,85,105,0.5)',
                                            whiteSpace: 'nowrap',
                                            minWidth: '90px',
                                            justifyContent: 'center',
                                          }}
                                        >
                                          <span style={{ fontSize: 9, opacity: 0.7 }}>loading...</span>
                                        </div>
                                      )}

                                      {(showTeamsStage || showLegacyPlaceholder) && (
                                        showTeamsStage ? (
                                          <button
                                            className="content-reveal"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (childEnrichmentData?.teamsData?.teamsLink) {
                                                window.open((childEnrichmentData.teamsData as any).teamsLink, '_blank');
                                              }
                                            }}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 6,
                                              padding: '4px 8px',
                                              borderRadius: 0,
                                              background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                                              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.3)'}`,
                                              fontSize: 11,
                                              fontWeight: 500,
                                              color: isDarkMode ? 'rgba(54, 144, 206, 0.95)' : 'rgba(54, 144, 206, 0.9)',
                                              cursor: 'pointer',
                                              transition: '0.2s',
                                              whiteSpace: 'nowrap',
                                              minWidth: 90,
                                              justifyContent: 'center',
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)';
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)';
                                            }}
                                          >
                                            <Icon iconName="TeamsLogo" styles={{ root: { fontSize: 12, color: isDarkMode ? 'rgba(54, 144, 206, 0.85)' : 'rgba(54, 144, 206, 0.8)' } }} />
                                            <span style={{ fontSize: 9, color: isDarkMode ? 'rgba(54, 144, 206, 0.7)' : 'rgba(54, 144, 206, 0.65)', fontFamily: 'inherit', fontWeight: 500 }}>
                                              {formatDateTime(childTeamsTime)}
                                            </span>
                                          </button>
                                        ) : (
                                          <div
                                            title="Not pipeline-tracked (legacy format)"
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: 6,
                                              padding: '4px 8px',
                                              borderRadius: 0,
                                              background: isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(148,163,184,0.04)',
                                              border: `1px dashed ${isDarkMode ? 'rgba(148,163,184,0.25)' : 'rgba(100,116,139,0.2)'}`,
                                              fontSize: 9,
                                              fontWeight: 500,
                                              color: isDarkMode ? 'rgba(148,163,184,0.6)' : 'rgba(71,85,105,0.6)',
                                              whiteSpace: 'nowrap',
                                              minWidth: 90,
                                              justifyContent: 'center',
                                            }}
                                          >
                                            <span style={{ fontSize: 9 }}>legacy</span>
                                          </div>
                                        )
                                      )}

                                      {/* Teams placeholder shell when no Teams/legacy shown */}
                                      {!showTeamsStage && !showLegacyPlaceholder && !showLoadingState && (
                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 6,
                                          padding: '4px 8px',
                                          borderRadius: 0,
                                          background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.04)',
                                          border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
                                          fontSize: 11,
                                          fontWeight: 500,
                                          color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
                                          whiteSpace: 'nowrap',
                                          minWidth: 90,
                                          justifyContent: 'center',
                                        }}>
                                          <Icon iconName="TeamsLogo" styles={{ root: { fontSize: 12, color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)' } }} />
                                          <span style={{ fontSize: 9, fontFamily: 'inherit', fontWeight: 500 }}>-- --</span>
                                        </div>
                                      )}

                                      {(showTeamsStage || showLegacyPlaceholder) && showClaimer && (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 8 }}>
                                          <div style={{ width: 8, height: 1, background: isDarkMode ? 'linear-gradient(to right, rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0.15))' : 'linear-gradient(to right, rgba(148, 163, 184, 0.25), rgba(148, 163, 184, 0.1))' }} />
                                          {(childIsV2 || childIsLegacy) && hasValidClaimTime && childTeamsTime && (
                                            <span style={{ fontSize: 7, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', fontFamily: 'Consolas, Monaco, monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                              {calculateDuration(childTeamsTime, childPocClaimTime)}
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      {/* Claim placeholder shell when no claimer shown */}
                                      {!showClaimer && (
                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          padding: '4px 10px',
                                          borderRadius: 0,
                                          background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : 'rgba(148, 163, 184, 0.03)',
                                          border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)'}`,
                                          minWidth: 70,
                                          height: 24,
                                        }} />
                                      )}

                                      {showClaimer && (
                                        // Only show claim button for truly unclaimed enquiries (not triaged)
                                        childPocEmail === 'team@helix-law.com' && !childPocEmail.toLowerCase().includes('triage')
                                          ? renderClaimPromptChip({ 
                                              size: 'compact', 
                                              teamsLink: childTeamsLink, 
                                              leadName: childContactName,
                                              areaOfWork: childEnquiry['Area_of_Work'],
                                              enquiryId: childEnquiry.ID,
                                              dataSource: childIsV2 ? 'new' : 'legacy'
                                            })
                                          : (
                                            <button
                                              className="content-reveal"
                                              onClick={(e) => handleReassignClick(String(childEnquiry.ID), e)}
                                              title={`Claimed by ${childPocIdentifier} - Click to reassign`}
                                              style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                padding: '4px 10px',
                                                borderRadius: 0,
                                                background: isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.1)',
                                                border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.35)' : 'rgba(32, 178, 108, 0.3)'}`,
                                                fontSize: 11,
                                                fontWeight: 600,
                                                color: isDarkMode ? 'rgba(32, 178, 108, 0.9)' : 'rgba(32, 178, 108, 0.85)',
                                                cursor: 'pointer',
                                                minWidth: '70px',
                                                justifyContent: 'center',
                                                transition: 'all 0.2s ease',
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.background = isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(32, 178, 108, 0.18)';
                                                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(32, 178, 108, 0.5)' : 'rgba(32, 178, 108, 0.45)';
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.background = isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.1)';
                                                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(32, 178, 108, 0.35)' : 'rgba(32, 178, 108, 0.3)';
                                              }}
                                            >
                                              <Icon iconName="Accept" styles={{ root: { fontSize: 11, color: isDarkMode ? 'rgba(32, 178, 108, 0.9)' : 'rgba(32, 178, 108, 0.85)' } }} />
                                              <span style={{ fontSize: 9 }}>{getPocInitials(childPocIdentifier)}</span>
                                              <Icon iconName="ChevronDown" styles={{ root: { fontSize: 8, color: isDarkMode ? 'rgba(32, 178, 108, 0.6)' : 'rgba(32, 178, 108, 0.5)', marginLeft: -2 } }} />
                                            </button>
                                          )
                                      )}

                                      {showClaimer && showPitch && (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 8 }}>
                                          <div style={{ width: 8, height: 1, background: isDarkMode ? 'linear-gradient(to right, rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0.15))' : 'linear-gradient(to right, rgba(148, 163, 184, 0.25), rgba(148, 163, 184, 0.1))' }} />
                                          {hasValidPitchTime && (childPocClaimTime || childTeamsTime) && (
                                            <span style={{ fontSize: 7, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', fontFamily: 'Consolas, Monaco, monospace', fontWeight: 600 }}>
                                              {calculateDuration(childPocClaimTime || childTeamsTime, childPitchTime)}
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      {showPitch ? (
                                        // Show pitch badge when already pitched
                                        (() => {
                                          const PitchScenarioBadge = require('../../components/PitchScenarioBadge').default;
                                          return <PitchScenarioBadge scenarioId={(childEnrichmentData.pitchData as any).scenarioId} size="small" className="content-reveal" />;
                                        })()
                                      ) : (
                                        // Show pitch prompt when claimed but not pitched
                                        showClaimer && childPocEmail !== 'team@helix-law.com' && (
                                          <button
                                            type="button"
                                            className="content-reveal"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleSelectEnquiry(childEnquiry);
                                            }}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              padding: '3px 8px',
                                              borderRadius: 0,
                                              border: `1px solid ${isDarkMode ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.35)'}`,
                                              background: isDarkMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)',
                                              color: isDarkMode ? 'rgba(251, 191, 36, 0.95)' : 'rgba(251, 191, 36, 0.9)',
                                              textTransform: 'uppercase',
                                              fontWeight: 600,
                                              letterSpacing: '0.4px',
                                              fontSize: '8px',
                                              cursor: 'pointer',
                                              minWidth: '55px',
                                              justifyContent: 'center',
                                              transition: 'all 0.15s ease',
                                              fontFamily: 'inherit',
                                              position: 'relative',
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.background = isDarkMode ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.15)';
                                              e.currentTarget.style.borderColor = isDarkMode ? 'rgba(245, 158, 11, 0.55)' : 'rgba(245, 158, 11, 0.5)';
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.background = isDarkMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)';
                                              e.currentTarget.style.borderColor = isDarkMode ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.35)';
                                            }}
                                            title={`Pitch to ${childContactName}`}
                                          >
                                            <span style={{
                                              position: 'absolute',
                                              top: -3,
                                              right: -3,
                                              width: 6,
                                              height: 6,
                                              borderRadius: '50%',
                                              background: isDarkMode ? 'rgba(251, 191, 36, 0.9)' : 'rgba(217, 119, 6, 0.85)',
                                              animation: 'status-breathe 2s ease-in-out infinite',
                                            }} />
                                            <Icon iconName="Send" styles={{ root: { fontSize: 9, color: 'inherit' } }} />
                                            <span>Pitch</span>
                                          </button>
                                        )
                                      )}

                                      {/* Pitch placeholder shell when no pitch shown and no pitch CTA */}
                                      {!showPitch && !(showClaimer && childPocEmail !== 'team@helix-law.com') && (
                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          padding: '3px 8px',
                                          borderRadius: 0,
                                          background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : 'rgba(148, 163, 184, 0.03)',
                                          border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)'}`,
                                          minWidth: 55,
                                          height: 22,
                                        }} />
                                      )}

                                      {/* Action buttons: Call, Email, Rate - shown on row hover with cascade animation */}
                                      {showClaimer && childPocEmail !== 'team@helix-law.com' && hoveredRowId === childEnquiry.ID && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 6 }}>
                                          {/* Call button - always available */}
                                          {(childEnquiry.Phone_Number || (childEnquiry as any).phone) && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const phone = childEnquiry.Phone_Number || (childEnquiry as any).phone;
                                                window.open(`tel:${phone}`, '_self');
                                              }}
                                              style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: 0,
                                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                                                background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
                                                color: isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                                                animation: 'contactCascadeIn 0.2s ease-out forwards',
                                                animationDelay: '0ms',
                                                opacity: 0,
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)';
                                                e.currentTarget.style.borderColor = colours.blue;
                                                e.currentTarget.style.color = colours.blue;
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)';
                                                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)';
                                                e.currentTarget.style.color = isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)';
                                              }}
                                              title={`Call ${childEnquiry.Phone_Number || (childEnquiry as any).phone}`}
                                            >
                                              <Icon iconName="Phone" styles={{ root: { fontSize: 11 } }} />
                                            </button>
                                          )}
                                          
                                          {/* Email button - only shown after pitch is made */}
                                          {showPitch && childEnquiry.Email && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                window.open(`mailto:${childEnquiry.Email}`, '_blank');
                                              }}
                                              style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: 0,
                                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                                                background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
                                                color: isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                                                animation: 'contactCascadeIn 0.2s ease-out forwards',
                                                animationDelay: '50ms',
                                                opacity: 0,
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)';
                                                e.currentTarget.style.borderColor = colours.blue;
                                                e.currentTarget.style.color = colours.blue;
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)';
                                                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)';
                                                e.currentTarget.style.color = isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)';
                                              }}
                                              title={`Email ${childEnquiry.Email}`}
                                            >
                                              <Icon iconName="Mail" styles={{ root: { fontSize: 11 } }} />
                                            </button>
                                          )}
                                          
                                          {/* Rate button - always available */}
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRate(childEnquiry.ID);
                                            }}
                                            style={{
                                              width: 24,
                                              height: 24,
                                              borderRadius: 0,
                                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                                              background: childEnquiry.Rating 
                                                ? (isDarkMode ? 'rgba(214, 176, 70, 0.15)' : 'rgba(214, 176, 70, 0.12)')
                                                : (isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)'),
                                              color: childEnquiry.Rating 
                                                ? colours.yellow 
                                                : (isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)'),
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              cursor: 'pointer',
                                              transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                                              animation: 'contactCascadeIn 0.2s ease-out forwards',
                                              animationDelay: showPitch && childEnquiry.Email ? '100ms' : (childEnquiry.Phone_Number || (childEnquiry as any).phone) ? '50ms' : '0ms',
                                              opacity: 0,
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.background = isDarkMode ? 'rgba(214, 176, 70, 0.2)' : 'rgba(214, 176, 70, 0.15)';
                                              e.currentTarget.style.borderColor = colours.yellow;
                                              e.currentTarget.style.color = colours.yellow;
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.background = childEnquiry.Rating 
                                                ? (isDarkMode ? 'rgba(214, 176, 70, 0.15)' : 'rgba(214, 176, 70, 0.12)')
                                                : (isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)');
                                              e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)';
                                              e.currentTarget.style.color = childEnquiry.Rating 
                                                ? colours.yellow 
                                                : (isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)');
                                            }}
                                            title={childEnquiry.Rating ? `Rating: ${childEnquiry.Rating}/5 - Click to change` : 'Rate this enquiry'}
                                          >
                                            <Icon iconName={childEnquiry.Rating ? 'FavoriteStarFill' : 'FavoriteStar'} styles={{ root: { fontSize: 11 } }} />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

                                {/* Actions Column for Child Enquiry */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                {/* Notes chevron */}
                                {childHasNotes && (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newSet = new Set(expandedNotesInTable);
                                      if (childNotesExpanded) {
                                        newSet.delete(childNoteKey);
                                      } else {
                                        newSet.add(childNoteKey);
                                      }
                                      setExpandedNotesInTable(newSet);
                                    }}
                                    style={{
                                      width: 24,
                                    height: 24,
                                      borderRadius: 0,
                                      background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)';
                                      e.currentTarget.style.transform = 'scale(1.05)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)';
                                      e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                    title={childNotesExpanded ? 'Hide notes' : 'Show notes'}
                                  >
                                    <Icon 
                                      iconName={childNotesExpanded ? 'ChevronUp' : 'ChevronDown'} 
                                      styles={{ 
                                        root: { 
                                          fontSize: '10px', 
                                          color: isDarkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(71, 85, 105, 0.9)' 
                                        } 
                                      }} 
                                    />
                                  </div>
                                )}
                                {/* Edit Button */}
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!areActionsEnabled) {
                                      return;
                                    }
                                    setEditingEnquiry(childEnquiry);
                                    setShowEditModal(true);
                                  }}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 0,
                                    background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: areActionsEnabled ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.2s ease',
                                    opacity: areActionsEnabled ? 1 : 0.4,
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!areActionsEnabled) return;
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)';
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!areActionsEnabled) return;
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)';
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                  title="Edit enquiry"
                                  aria-disabled={!areActionsEnabled}
                                >
                                  <Icon 
                                    iconName="Edit" 
                                    styles={{ 
                                      root: { 
                                        fontSize: '10px', 
                                        color: isDarkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(71, 85, 105, 0.9)' 
                                      } 
                                    }} 
                                  />
                                </div>

                                {/* Delete Button */}
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!areActionsEnabled) {
                                      return;
                                    }
                                    const passcode = prompt('Enter passcode to delete this enquiry:');
                                    if (passcode === '2011') {
                                      const enquiryName = `${childEnquiry.First_Name || ''} ${childEnquiry.Last_Name || ''}`.trim() || 'Unnamed enquiry';
                                      const confirmMessage = `Are you sure you want to permanently delete "${enquiryName}"?\n\nThis action cannot be undone.`;
                                      if (window.confirm(confirmMessage)) {
                                        handleDeleteEnquiry(childEnquiry.ID, enquiryName);
                                      }
                                    } else if (passcode !== null) {
                                      alert('Incorrect passcode');
                                    }
                                  }}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 0,
                                    background: isDarkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(248, 113, 113, 0.08)',
                                    border: `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.3)' : 'rgba(248, 113, 113, 0.2)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: areActionsEnabled ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.2s ease',
                                    opacity: areActionsEnabled ? 1 : 0.4,
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!areActionsEnabled) return;
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(248, 113, 113, 0.15)' : 'rgba(248, 113, 113, 0.12)';
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!areActionsEnabled) return;
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(248, 113, 113, 0.08)';
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                  title="Delete enquiry (requires passcode)"
                                  aria-disabled={!areActionsEnabled}
                                >
                                  <Icon 
                                    iconName="Delete" 
                                    styles={{ 
                                      root: { 
                                        fontSize: '10px', 
                                        color: isDarkMode ? '#F87171' : '#EF4444' 
                                      } 
                                    }} 
                                  />
                                </div>
                                </div>
                              </div>
                              
                              {/* Child notes section */}
                              {childHasNotes && childNotesExpanded && (
                                <div style={{
                                  padding: '12px 60px 12px 80px',
                                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.008)',
                                  borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'}`,
                                  fontSize: '11px',
                                  lineHeight: '1.5',
                                  color: isDarkMode ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)',
                                  whiteSpace: 'pre-line',
                                  marginLeft: '20px',
                                }}>
                                  <div style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.9)',
                                    marginBottom: '6px',
                                    letterSpacing: '0.3px',
                                  }}>
                                    Notes
                                  </div>
                                  {childEnquiry.Initial_first_call_notes?.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()}
                                </div>
                              )}
                              </React.Fragment>
                            );
                          })}
                          </React.Fragment>
                        );
                      } else {
                        // Handle individual enquiries
                        const pocLower = (item.Point_of_Contact || '').toLowerCase();
                        const isUnclaimed = pocLower === 'team@helix-law.com';
                        const claimer = claimerMap[pocLower];
                        const promotionStatus = getPromotionStatusSimple(item);

                        // Extract values for display using correct property names
                        const contactName = `${item.First_Name || ''} ${item.Last_Name || ''}`.trim() || 'Unknown';
                        const companyName = item.Company || '';
                        const areaOfWork = item.Area_of_Work || 'Unspecified';
                        const dateReceived = item.Touchpoint_Date || item.Date_Created || '';
                        const rawValue: any = (item as any).Value ?? (item as any).value ?? '';
                        const value = typeof rawValue === 'string' 
                          ? rawValue.replace(/^£\s*/, '').trim() 
                          : rawValue;
                        const isFromInstructions = (item as any).source === 'instructions';
                        // For v2 enquiries, claim field contains the claim datetime
                        const claimDate = isFromInstructions ? ((item as any).claim || null) : null;
                        const hasNotes = item.Initial_first_call_notes && item.Initial_first_call_notes.trim().length > 0;
                        const noteKey = buildEnquiryIdentityKey(item);
                        const isNotesExpanded = expandedNotesInTable.has(noteKey);
                        const enrichmentDataKey = item.ID ?? (item as any).id ?? '';
                        const enrichmentData = enrichmentDataKey
                          ? enrichmentMap.get(String(enrichmentDataKey))
                          : undefined;
                        const enquiryTeamsLink = (enrichmentData?.teamsData as any)?.teamsLink as string | undefined;
                        
                        // Day separator for Unclaimed table view (robust across legacy/v2 fields)
                        const extractDateStr = (enq: any): string => {
                          // Handle grouped enquiries
                          if (isGroupedEnquiry(enq)) {
                            return enq.latestDate || '';
                          }
                          // Handle individual enquiries
                          return (enq?.Touchpoint_Date || enq?.datetime || enq?.claim || enq?.Date_Created || '') as string;
                        };
                        const toDayKey = (s: string): string => {
                          if (!s) return '';
                          const d = new Date(s);
                          if (isNaN(d.getTime())) return '';
                          return d.toISOString().split('T')[0];
                        };
                        const thisDateStr = extractDateStr(item as any);
                        const prevItem: any = idx > 0 ? displayedItems[idx - 1] : null;
                        const prevDateStr = prevItem ? extractDateStr(prevItem) : '';
                        const showDaySeparator = viewMode === 'table' && (idx === 0 || toDayKey(thisDateStr) !== toDayKey(prevDateStr));
                        const singleDayKey = toDayKey(thisDateStr);
                        const isSingleDayCollapsed = collapsedDays.has(singleDayKey);
                        const fullDateTooltip = formatFullDateTime(thisDateStr || dateReceived || null);

                        return (
                          <React.Fragment key={`${item.ID}-${item.First_Name || ''}-${item.Last_Name || ''}-${item.Touchpoint_Date || ''}-${item.Point_of_Contact || ''}`}>
                          {/* Day separator with timeline dot */}
                          {showDaySeparator && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleDayCollapse(singleDayKey);
                              }}
                              onMouseEnter={() => setHoveredDayKey(singleDayKey)}
                              onMouseLeave={() => setHoveredDayKey((prev) => (prev === singleDayKey ? null : prev))}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '32px 1fr auto',
                                gap: '12px',
                                alignItems: 'center',
                                padding: '8px 16px',
                                cursor: 'pointer',
                                background:
                                  hoveredDayKey === singleDayKey
                                    ? (isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.08)')
                                    : (isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.8)'),
                                borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.25)'}`,
                                borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.25)'}`,
                              }}
                            >
                              {/* Timeline cell with line and dot */}
                              <div style={{
                                position: 'relative',
                                height: '100%',
                                minHeight: 24,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                {/* Vertical line - only below the dot */}
                                <div style={{
                                  position: 'absolute',
                                  left: '50%',
                                  top: '50%',
                                  bottom: 0,
                                  width: '1px',
                                  transform: 'translateX(-50%)',
                                  background:
                                    hoveredDayKey === singleDayKey
                                      ? (isDarkMode ? colours.accent : colours.highlight)
                                      : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'),
                                  opacity: hoveredDayKey === singleDayKey ? 0.9 : 1,
                                }} />
                                {/* Timeline dot */}
                                <div style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  background:
                                    hoveredDayKey === singleDayKey
                                      ? (isDarkMode ? colours.accent : colours.highlight)
                                      : (isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(148, 163, 184, 0.5)'),
                                  border: `2px solid ${isDarkMode ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)'}`,
                                  zIndex: 1,
                                }} />
                              </div>
                              {/* Day label and chevron */}
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: hoveredDayKey === singleDayKey ? 800 : 700,
                                  color:
                                    hoveredDayKey === singleDayKey
                                      ? (isDarkMode ? colours.accent : colours.highlight)
                                      : (isDarkMode ? 'rgba(148, 163, 184, 0.85)' : 'rgba(71, 85, 105, 0.95)'),
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px',
                                }}>
                                  {formatDaySeparatorLabel(singleDayKey)}
                                  <span style={{
                                    marginLeft: '6px',
                                    fontSize: '9px',
                                    fontWeight: 400,
                                    color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                                    backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.1)',
                                    padding: '1px 5px',
                                    borderRadius: '8px',
                                    lineHeight: 1.2,
                                    textTransform: 'none',
                                    letterSpacing: 'normal',
                                  }}>
                                    {displayedItems.filter((enq) => {
                                      const enqDateStr = isGroupedEnquiry(enq) ? enq.latestDate : ((enq as any)?.Touchpoint_Date || (enq as any)?.datetime || (enq as any)?.claim || (enq as any)?.Date_Created || '');
                                      return toDayKey(enqDateStr) === singleDayKey;
                                    }).length}
                                  </span>
                                </span>
                                <Icon 
                                  iconName={isSingleDayCollapsed ? 'ChevronRight' : 'ChevronDown'} 
                                  styles={{ 
                                    root: { 
                                      fontSize: 10, 
                                      marginLeft: 6,
                                      color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
                                    } 
                                  }} 
                                />
                              </div>

                              {/* Collapsed eye indicator */}
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'flex-end',
                                paddingLeft: '12px',
                                pointerEvents: 'none',
                                opacity: isSingleDayCollapsed ? 1 : 0,
                                transition: 'opacity 0.2s ease'
                              }}>
                                {isSingleDayCollapsed && (
                                  <Icon
                                    iconName="Hide3"
                                    styles={{
                                      root: {
                                        fontSize: 12,
                                        color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                                      },
                                    }}
                                    title={`${displayedItems.filter((enq) => {
                                      const enqDateStr = isGroupedEnquiry(enq) ? enq.latestDate : ((enq as any)?.Touchpoint_Date || (enq as any)?.datetime || (enq as any)?.claim || (enq as any)?.Date_Created || '');
                                      return toDayKey(enqDateStr) === singleDayKey;
                                    }).length} items hidden`}
                                  />
                                )}
                              </div>
                            </div>
                          )}
                          {/* Skip row if day is collapsed */}
                          {!isSingleDayCollapsed && (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '32px 70px 50px 60px 1.2fr 0.5fr 1.6fr 0.5fr',
                              gap: '12px',
                              padding: '10px 16px',
                              alignItems: 'center',
                              borderBottom: (isLast && !isNotesExpanded) ? 'none' : `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'}`,
                              fontSize: '13px',
                              color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)',
                              background: idx % 2 === 0 
                                ? (isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)')
                                : 'transparent',
                              transition: 'background-color 0.15s ease',
                              opacity: isFromInstructions ? 1 : 0.85,
                              cursor: 'pointer',
                            }}
                            className="enquiry-row"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = isDarkMode 
                                ? 'rgba(255, 255, 255, 0.06)' 
                                : 'rgba(0, 0, 0, 0.03)';
                              // Show tooltip on hover
                              const tooltip = e.currentTarget.querySelector('.timeline-date-tooltip') as HTMLElement;
                              if (tooltip) tooltip.style.opacity = '1';
                              // Track hovered row for contact actions
                              setHoveredRowId(item.ID);
                              // Highlight timeline for this day
                              setHoveredDayKey(singleDayKey);
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = idx % 2 === 0 
                                ? (isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)')
                                : 'transparent';
                              // Hide tooltip
                              const tooltip = e.currentTarget.querySelector('.timeline-date-tooltip') as HTMLElement;
                              if (tooltip) tooltip.style.opacity = '0';
                              // Clear hovered row
                              setHoveredRowId(null);
                              // Clear timeline highlight
                              setHoveredDayKey((prev) => (prev === singleDayKey ? null : prev));
                            }}
                            onClick={() => !isUnclaimed && handleSelectEnquiry(item)}
                          >
                            {/* Timeline cell */}
                            <div style={{
                              position: 'relative',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <div style={{
                                position: 'absolute',
                                left: '50%',
                                top: 0,
                                bottom: 0,
                                width: '1px',
                                transform: 'translateX(-50%)',
                                background: hoveredDayKey === singleDayKey
                                  ? (isDarkMode ? colours.accent : colours.highlight)
                                  : (isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'),
                                opacity: hoveredDayKey === singleDayKey ? 0.9 : 1,
                                transition: 'background 0.15s ease, opacity 0.15s ease',
                              }} />
                            </div>

                            {/* Date column - compact format */}
                            <TooltipHost
                              content={fullDateTooltip}
                              styles={{ root: { display: 'flex', alignItems: 'center', height: '100%' } }}
                              calloutProps={{ gapSpace: 6 }}
                            >
                              <span style={{
                                fontSize: '11px',
                                color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
                                fontWeight: 500,
                                fontVariantNumeric: 'tabular-nums',
                                whiteSpace: 'nowrap',
                              }}>
                                {getCompactTimeDisplay(dateReceived)}
                              </span>
                            </TooltipHost>

                            {/* Area of Work - second */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                              <span style={{ fontSize: '18px', lineHeight: 1 }} title={areaOfWork}>
                                {getAreaOfWorkIcon(areaOfWork)}
                              </span>
                            </div>

                            {/* ID / Instruction Ref */}
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              lineHeight: 1.3,
                              justifyContent: 'center'
                            }}>
                              <div style={{
                                fontFamily: 'Monaco, Consolas, monospace',
                                fontSize: '10px',
                                fontWeight: 600,
                                color: colours.highlight,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                                {item.ID}
                              </div>
                              {enrichmentData?.pitchData?.instructionRef && (
                                <div style={{
                                  fontFamily: 'Monaco, Consolas, monospace',
                                  fontSize: '9px',
                                  color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {enrichmentData.pitchData.instructionRef}
                                </div>
                              )}
                            </div>

                            {/* Contact - stacked layout: name on top, email · phone below */}
                            <div style={{ 
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: '2px', 
                              lineHeight: 1.3,
                              justifyContent: 'center',
                            }}>
                              {/* Name row */}
                              <div 
                                style={{ 
                                  fontSize: '13px', 
                                  fontWeight: 500, 
                                  color: isDarkMode ? '#E5E7EB' : '#1F2937', 
                                  cursor: 'pointer',
                                  transition: 'color 0.15s ease',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(contactName);
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.color = isDarkMode ? '#87F3F3' : '#3690CE';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.color = isDarkMode ? '#E5E7EB' : '#1F2937';
                                }}
                                title="Click to copy name"
                              >
                                {contactName}
                              </div>
                              
                              {/* Email · Phone row */}
                              <div style={{ 
                                fontSize: '10px', 
                                color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0',
                              }}>
                                {item.Email && (
                                  <span 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(item.Email);
                                    }}
                                    style={{
                                      cursor: 'pointer',
                                      transition: 'color 0.15s ease',
                                      maxWidth: '160px',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.color = isDarkMode ? '#87F3F3' : '#3690CE';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.color = isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)';
                                    }}
                                    title={`Click to copy: ${item.Email}`}
                                  >
                                    {item.Email}
                                  </span>
                                )}
                                {item.Email && (item.Phone_Number || (item as any).phone) && (
                                  <span style={{ margin: '0 4px', opacity: 0.5 }}>·</span>
                                )}
                                {(item.Phone_Number || (item as any).phone) && (
                                  <span 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(item.Phone_Number || (item as any).phone);
                                    }}
                                    style={{
                                      cursor: 'pointer',
                                      transition: 'color 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.color = isDarkMode ? '#87F3F3' : '#3690CE';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.color = isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)';
                                    }}
                                    title={`Click to copy: ${item.Phone_Number || (item as any).phone}`}
                                  >
                                    {item.Phone_Number || (item as any).phone}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Value */}
                            {(() => {
                              const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) : (typeof value === 'number' ? value : 0);
                              const displayValue = formatValueForDisplay(value);
                              
                              // Blue shades based on value range
                              let textColor;
                              if (numValue >= 50000) {
                                textColor = isDarkMode ? 'rgba(54, 144, 206, 1)' : 'rgba(54, 144, 206, 1)'; // Brightest blue
                              } else if (numValue >= 10000) {
                                textColor = isDarkMode ? 'rgba(54, 144, 206, 0.75)' : 'rgba(54, 144, 206, 0.75)'; // Medium blue
                              } else {
                                textColor = isDarkMode ? 'rgba(54, 144, 206, 0.5)' : 'rgba(54, 144, 206, 0.55)'; // Subtle blue
                              }
                              
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                                  <span style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: textColor,
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {displayValue || '-'}
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Pipeline - Teams → POC → Pitch */}
                            {(() => {
                              const isV2Enquiry = (item as any).__sourceType === 'new' || (item as any).source === 'instructions';
                              const teamsTime = isV2Enquiry && enrichmentData?.teamsData ? (enrichmentData.teamsData as any).CreatedAt : null;
                              const pocClaimTime = (item as any).claim || null;
                              const pitchTime = enrichmentData?.pitchData ? (enrichmentData.pitchData as any).pitchedDate : null;
                              
                              // Comprehensive legacy detection - covers all v1 non-Teams widget enquiries
                              const hasV2Infrastructure = (item as any).__sourceType === 'new' || 
                                                         (item as any).source === 'instructions' ||
                                                         (item as any).claim ||
                                                         (item as any).stage ||
                                                         enrichmentData?.teamsData;
                              
                              const isDefinitelyLegacy = !hasV2Infrastructure;
                              const pocDisplayName = item.Point_of_Contact || (item as any).poc || '';
                              const hasClaimerStage = !!pocDisplayName;

                              const isValidTimestamp = (dateStr: string | null) => {
                                if (!dateStr) return false;
                                const date = new Date(dateStr);
                                return date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
                              };
                              
                              const hasValidClaimTime = isValidTimestamp(pocClaimTime);
                              const hasValidPitchTime = pitchTime ? isValidTimestamp(pitchTime) : false;
                              
                              // Duration calculation
                              const calculateDuration = (fromDate: string | null, toDate: string | null) => {
                                if (!fromDate || !toDate) return null;
                                const from = new Date(fromDate);
                                const to = new Date(toDate);
                                let diff = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
                                
                                const S = diff % 60; diff = Math.floor(diff / 60);
                                const M = diff % 60; diff = Math.floor(diff / 60);
                                const H = diff % 24; diff = Math.floor(diff / 24);
                                const D = diff % 7; diff = Math.floor(diff / 7);
                                const W = diff;
                                
                                const parts: string[] = [];
                                if (W > 0) { parts.push(W + 'w'); if (D > 0) parts.push(D + 'd'); }
                                else if (D > 0) { parts.push(D + 'd'); if (H > 0) parts.push(H + 'h'); }
                                else if (H > 0) { parts.push(H + 'h'); if (M > 0) parts.push(M + 'm'); }
                                else if (M > 0) { parts.push(M + 'm'); if (S > 0) parts.push(S + 's'); }
                                else if (S > 0) parts.push(S + 's');
                                
                                if (parts.length === 0) parts.push('0s');
                                return parts.slice(0, 2).join(' ');
                              };
                              
                              const formatDateTime = (dateStr: string | null) => {
                                if (!dateStr) return null;
                                const date = new Date(dateStr);
                                return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                              };
                              
                              const showTeamsStage = isV2Enquiry && teamsTime;
                              const showLegacyPlaceholder = isDefinitelyLegacy;
                              // Determine loading vs not-resolvable state for V2 enquiries
                              // - enrichmentData exists but no teamsData = processed, not resolvable
                              // - enrichmentData doesn't exist = still loading
                              const enrichmentWasProcessed = enrichmentData && enrichmentData.enquiryId;
                              const showLoadingState = isV2Enquiry && !enrichmentWasProcessed && !isDefinitelyLegacy && !teamsTime;
                              const showNotResolvable = isV2Enquiry && enrichmentWasProcessed && !enrichmentData?.teamsData && !isDefinitelyLegacy;
                              const showClaimer = hasClaimerStage && activeState !== 'Triaged';
                              const showPitch = !!enrichmentData?.pitchData;
                              
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: '100%' }}>
                                  {/* Loading state - show when V2 but enrichment not loaded yet */}
                                  {showLoadingState && (
                                    <div
                                      title="Loading pipeline data..."
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '4px 10px',
                                        borderRadius: 0,
                                        background: isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(148,163,184,0.04)',
                                        border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(100,116,139,0.15)'}`,
                                        fontSize: 9,
                                        fontWeight: 500,
                                        color: isDarkMode ? 'rgba(148,163,184,0.6)' : 'rgba(71,85,105,0.6)',
                                        whiteSpace: 'nowrap',
                                        minWidth: '120px',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: 10,
                                          height: 10,
                                          borderRadius: '50%',
                                          border: `2px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(100,116,139,0.15)'}`,
                                          borderTopColor: isDarkMode ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.4)',
                                          animation: 'spin 1s linear infinite',
                                        }}
                                      />
                                      <style>{`
                                        @keyframes spin {
                                          to { transform: rotate(360deg); }
                                        }
                                      `}</style>
                                      <span style={{ fontSize: 8 }}>processing...</span>
                                    </div>
                                  )}

                                  {(showTeamsStage || showLegacyPlaceholder) && (
                                    showTeamsStage ? (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (enrichmentData?.teamsData?.teamsLink) {
                                            window.open((enrichmentData.teamsData as any).teamsLink, '_blank');
                                          }
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 6,
                                          padding: '4px 8px',
                                          borderRadius: 0,
                                          background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                                          border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.3)'}`,
                                          fontSize: 11,
                                          fontWeight: 500,
                                          color: isDarkMode ? 'rgba(54, 144, 206, 0.95)' : 'rgba(54, 144, 206, 0.9)',
                                          cursor: 'pointer',
                                          transition: '0.2s',
                                          whiteSpace: 'nowrap',
                                          minWidth: 90,
                                          justifyContent: 'center',
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)';
                                        }}
                                      >
                                        <Icon
                                          iconName="TeamsLogo"
                                          styles={{ root: { fontSize: 12, color: isDarkMode ? 'rgba(54, 144, 206, 0.85)' : 'rgba(54, 144, 206, 0.8)' } }}
                                        />
                                        <span style={{ fontSize: 9, color: isDarkMode ? 'rgba(54, 144, 206, 0.7)' : 'rgba(54, 144, 206, 0.65)', fontFamily: 'inherit', fontWeight: 500 }}>
                                          {formatDateTime(teamsTime)}
                                        </span>
                                      </button>
                                    ) : (
                                      <div
                                        title="Not pipeline-tracked (legacy format)"
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 6,
                                          padding: '4px 8px',
                                          borderRadius: 0,
                                          background: isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(148,163,184,0.04)',
                                          border: `1px dashed ${isDarkMode ? 'rgba(148,163,184,0.25)' : 'rgba(100,116,139,0.2)'}`,
                                          fontSize: 9,
                                          fontWeight: 500,
                                          color: isDarkMode ? 'rgba(148,163,184,0.6)' : 'rgba(71,85,105,0.6)',
                                          whiteSpace: 'nowrap',
                                          minWidth: 90,
                                          justifyContent: 'center',
                                        }}
                                      >
                                        <span style={{ fontSize: 9 }}>legacy</span>
                                      </div>
                                    )
                                  )}

                                  {/* Teams placeholder shell when no Teams/legacy shown */}
                                  {!showTeamsStage && !showLegacyPlaceholder && !showLoadingState && (
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      padding: '4px 8px',
                                      borderRadius: 0,
                                      background: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.04)',
                                      border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
                                      fontSize: 11,
                                      fontWeight: 500,
                                      color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
                                      whiteSpace: 'nowrap',
                                      minWidth: 90,
                                      justifyContent: 'center',
                                    }}>
                                      <Icon iconName="TeamsLogo" styles={{ root: { fontSize: 12, color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)' } }} />
                                      <span style={{ fontSize: 9, fontFamily: 'inherit', fontWeight: 500 }}>-- --</span>
                                    </div>
                                  )}

                                  {(showTeamsStage || showLegacyPlaceholder) && showClaimer && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 8 }}>
                                      <div style={{ width: 8, height: 1, background: isDarkMode ? 'linear-gradient(to right, rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0.15))' : 'linear-gradient(to right, rgba(148, 163, 184, 0.25), rgba(148, 163, 184, 0.1))' }} />
                                      {teamsTime && hasValidClaimTime && (
                                        <span style={{ fontSize: 7, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', fontFamily: 'Consolas, Monaco, monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                          {calculateDuration(teamsTime, pocClaimTime)}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Claim placeholder shell when no claimer shown */}
                                  {!showClaimer && (
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      padding: '4px 10px',
                                      borderRadius: 0,
                                      background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : 'rgba(148, 163, 184, 0.03)',
                                      border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)'}`,
                                      minWidth: 70,
                                      height: 24,
                                    }} />
                                  )}

                                  {showClaimer && (
                                    // Only show claim button for truly unclaimed enquiries (not triaged)
                                    pocLower === 'team@helix-law.com' && !pocLower.includes('triage')
                                      ? renderClaimPromptChip({ 
                                          teamsLink: enquiryTeamsLink, 
                                          leadName: contactName,
                                          areaOfWork: item['Area_of_Work'],
                                          enquiryId: item.ID,
                                          dataSource: isFromInstructions ? 'new' : 'legacy'
                                        })
                                      : (
                                        <button
                                          onClick={(e) => handleReassignClick(String(item.ID), e)}
                                          title={`Claimed by ${pocDisplayName} - Click to reassign`}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            padding: '4px 10px',
                                            borderRadius: 0,
                                            background: isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.1)',
                                            border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.35)' : 'rgba(32, 178, 108, 0.3)'}`,
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: isDarkMode ? 'rgba(32, 178, 108, 0.9)' : 'rgba(32, 178, 108, 0.85)',
                                            cursor: 'pointer',
                                            minWidth: '70px',
                                            justifyContent: 'center',
                                            transition: 'all 0.2s ease',
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.background = isDarkMode ? 'rgba(32, 178, 108, 0.25)' : 'rgba(32, 178, 108, 0.18)';
                                            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(32, 178, 108, 0.5)' : 'rgba(32, 178, 108, 0.45)';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.background = isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.1)';
                                            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(32, 178, 108, 0.35)' : 'rgba(32, 178, 108, 0.3)';
                                          }}
                                        >
                                          <Icon
                                            iconName="Accept"
                                            styles={{ root: { fontSize: 11, color: isDarkMode ? 'rgba(32, 178, 108, 0.9)' : 'rgba(32, 178, 108, 0.85)' } }}
                                          />
                                          <span style={{ fontSize: 9 }}>{getPocInitials(pocDisplayName)}</span>
                                          <Icon iconName="ChevronDown" styles={{ root: { fontSize: 8, color: isDarkMode ? 'rgba(32, 178, 108, 0.6)' : 'rgba(32, 178, 108, 0.5)', marginLeft: -2 } }} />
                                        </button>
                                      )
                                  )}

                                  {showClaimer && showPitch && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 8 }}>
                                      <div style={{ width: 8, height: 1, background: isDarkMode ? 'linear-gradient(to right, rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0.15))' : 'linear-gradient(to right, rgba(148, 163, 184, 0.25), rgba(148, 163, 184, 0.1))' }} />
                                      {hasValidPitchTime && (pocClaimTime || teamsTime) && (
                                        <span style={{ fontSize: 7, color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)', fontFamily: 'Consolas, Monaco, monospace', fontWeight: 600 }}>
                                          {calculateDuration(pocClaimTime || teamsTime, pitchTime)}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {showPitch ? (
                                    // Show pitch badge when already pitched
                                    (() => {
                                      const PitchScenarioBadge = require('../../components/PitchScenarioBadge').default;
                                      return <PitchScenarioBadge scenarioId={(enrichmentData.pitchData as any).scenarioId} size="small" />;
                                    })()
                                  ) : (
                                    // Show pitch prompt when claimed but not pitched
                                    showClaimer && pocLower !== 'team@helix-law.com' && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSelectEnquiry(item);
                                        }}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '5px',
                                          padding: '4px 10px',
                                          borderRadius: 0,
                                          border: `1px solid ${isDarkMode ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.35)'}`,
                                          background: isDarkMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)',
                                          color: isDarkMode ? 'rgba(251, 191, 36, 0.95)' : 'rgba(251, 191, 36, 0.9)',
                                          textTransform: 'uppercase',
                                          fontWeight: 600,
                                          letterSpacing: '0.4px',
                                          fontSize: '9px',
                                          cursor: 'pointer',
                                          minWidth: '70px',
                                          justifyContent: 'center',
                                          transition: 'all 0.15s ease',
                                          fontFamily: 'inherit',
                                          position: 'relative',
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = isDarkMode ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.15)';
                                          e.currentTarget.style.borderColor = isDarkMode ? 'rgba(245, 158, 11, 0.55)' : 'rgba(245, 158, 11, 0.5)';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = isDarkMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)';
                                          e.currentTarget.style.borderColor = isDarkMode ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.35)';
                                        }}
                                        title={`Pitch to ${contactName}`}
                                      >
                                        <span style={{
                                          position: 'absolute',
                                          top: -3,
                                          right: -3,
                                          width: 6,
                                          height: 6,
                                          borderRadius: '50%',
                                          background: isDarkMode ? 'rgba(251, 191, 36, 0.9)' : 'rgba(217, 119, 6, 0.85)',
                                          animation: 'status-breathe 2s ease-in-out infinite',
                                        }} />
                                        <Icon iconName="Send" styles={{ root: { fontSize: 10, color: 'inherit' } }} />
                                        <span>Pitch</span>
                                      </button>
                                    )
                                  )}

                                  {/* Pitch placeholder shell when no pitch shown and no pitch CTA */}
                                  {!showPitch && !(showClaimer && pocLower !== 'team@helix-law.com') && (
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      padding: '4px 10px',
                                      borderRadius: 0,
                                      background: isDarkMode ? 'rgba(148, 163, 184, 0.04)' : 'rgba(148, 163, 184, 0.03)',
                                      border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)'}`,
                                      minWidth: 70,
                                      height: 24,
                                    }} />
                                  )}

                                  {/* Action buttons: Call, Email, Rate - shown on row hover with cascade animation */}
                                  {showClaimer && pocLower !== 'team@helix-law.com' && hoveredRowId === item.ID && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                                      <style>{`
                                        @keyframes contactCascadeIn {
                                          0% {
                                            opacity: 0;
                                            transform: translateY(8px);
                                          }
                                          100% {
                                            opacity: 1;
                                            transform: translateY(0);
                                          }
                                        }
                                      `}</style>
                                      {/* Call button - always available */}
                                      {(item.Phone_Number || (item as any).phone) && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const phone = item.Phone_Number || (item as any).phone;
                                            window.open(`tel:${phone}`, '_self');
                                          }}
                                          style={{
                                            width: 24,
                                            height: 24,
                                            borderRadius: 0,
                                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                                            background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
                                            color: isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                                            animation: 'contactCascadeIn 0.2s ease-out forwards',
                                            animationDelay: '0ms',
                                            opacity: 0,
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)';
                                            e.currentTarget.style.borderColor = colours.blue;
                                            e.currentTarget.style.color = colours.blue;
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)';
                                            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)';
                                            e.currentTarget.style.color = isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)';
                                          }}
                                          title={`Call ${item.Phone_Number || (item as any).phone}`}
                                        >
                                          <Icon iconName="Phone" styles={{ root: { fontSize: 12 } }} />
                                        </button>
                                      )}
                                      
                                      {/* Email button - only shown after pitch is made */}
                                      {showPitch && item.Email && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.open(`mailto:${item.Email}`, '_blank');
                                          }}
                                          style={{
                                            width: 24,
                                            height: 24,
                                            borderRadius: 0,
                                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                                            background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
                                            color: isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                                            animation: 'contactCascadeIn 0.2s ease-out forwards',
                                            animationDelay: '50ms',
                                            opacity: 0,
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)';
                                            e.currentTarget.style.borderColor = colours.blue;
                                            e.currentTarget.style.color = colours.blue;
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)';
                                            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)';
                                            e.currentTarget.style.color = isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)';
                                          }}
                                          title={`Email ${item.Email}`}
                                        >
                                          <Icon iconName="Mail" styles={{ root: { fontSize: 12 } }} />
                                        </button>
                                      )}
                                      
                                      {/* Rate button - always available */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRate(item.ID);
                                        }}
                                        style={{
                                          width: 24,
                                          height: 24,
                                          borderRadius: 0,
                                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                                          background: item.Rating 
                                            ? (isDarkMode ? 'rgba(214, 176, 70, 0.15)' : 'rgba(214, 176, 70, 0.12)')
                                            : (isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)'),
                                          color: item.Rating 
                                            ? colours.yellow 
                                            : (isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)'),
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer',
                                          transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                                          animation: 'contactCascadeIn 0.2s ease-out forwards',
                                          animationDelay: showPitch && item.Email ? '100ms' : (item.Phone_Number || (item as any).phone) ? '50ms' : '0ms',
                                          opacity: 0,
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = isDarkMode ? 'rgba(214, 176, 70, 0.2)' : 'rgba(214, 176, 70, 0.15)';
                                          e.currentTarget.style.borderColor = colours.yellow;
                                          e.currentTarget.style.color = colours.yellow;
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = item.Rating 
                                            ? (isDarkMode ? 'rgba(214, 176, 70, 0.15)' : 'rgba(214, 176, 70, 0.12)')
                                            : (isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)');
                                          e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)';
                                          e.currentTarget.style.color = item.Rating 
                                            ? colours.yellow 
                                            : (isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)');
                                        }}
                                        title={item.Rating ? `Rating: ${item.Rating}/5 - Click to change` : 'Rate this enquiry'}
                                      >
                                        <Icon iconName={item.Rating ? 'FavoriteStarFill' : 'FavoriteStar'} styles={{ root: { fontSize: 12 } }} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Actions Column */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                              {/* Notes Chevron */}
                              {hasNotes && (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newSet = new Set(expandedNotesInTable);
                                    if (isNotesExpanded) {
                                      newSet.delete(noteKey);
                                    } else {
                                      newSet.add(noteKey);
                                    }
                                    setExpandedNotesInTable(newSet);
                                  }}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 0,
                                    background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)';
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)';
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                  title={isNotesExpanded ? 'Hide notes' : 'Show notes'}
                                >
                                  <Icon 
                                    iconName={isNotesExpanded ? 'ChevronUp' : 'ChevronDown'} 
                                    styles={{ 
                                      root: { 
                                        fontSize: '10px', 
                                        color: isDarkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(71, 85, 105, 0.9)' 
                                      } 
                                    }} 
                                  />
                                </div>
                              )}
                              {/* Edit Button */}
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!areActionsEnabled) {
                                    return;
                                  }
                                  setEditingEnquiry(item);
                                  setShowEditModal(true);
                                }}
                                style={{
                                  width: 24,
                                    height: 24,
                                  borderRadius: 0,
                                  background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
                                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: areActionsEnabled ? 'pointer' : 'not-allowed',
                                  transition: 'all 0.2s ease',
                                  opacity: areActionsEnabled ? 1 : 0.4,
                                }}
                                onMouseEnter={(e) => {
                                  if (!areActionsEnabled) return;
                                  e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)';
                                  e.currentTarget.style.transform = 'scale(1.05)';
                                }}
                                onMouseLeave={(e) => {
                                  if (!areActionsEnabled) return;
                                  e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)';
                                  e.currentTarget.style.transform = 'scale(1)';
                                }}
                                title="Edit enquiry"
                                aria-disabled={!areActionsEnabled}
                              >
                                <Icon 
                                  iconName="Edit" 
                                  styles={{ 
                                    root: { 
                                      fontSize: '10px', 
                                      color: isDarkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(71, 85, 105, 0.9)' 
                                    } 
                                  }} 
                                />
                              </div>

                              {/* Delete Button */}
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!areActionsEnabled) {
                                    return;
                                  }
                                  const passcode = prompt('Enter passcode to delete this enquiry:');
                                  if (passcode === '2011') {
                                    const enquiryName = `${item.First_Name || ''} ${item.Last_Name || ''}`.trim() || 'Unnamed enquiry';
                                    const confirmMessage = `Are you sure you want to permanently delete "${enquiryName}"?\n\nThis action cannot be undone.`;
                                    if (window.confirm(confirmMessage)) {
                                      handleDeleteEnquiry(item.ID, enquiryName);
                                    }
                                  } else if (passcode !== null) {
                                    alert('Incorrect passcode');
                                  }
                                }}
                                style={{
                                  width: 24,
                                    height: 24,
                                  borderRadius: 0,
                                  background: isDarkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(248, 113, 113, 0.08)',
                                  border: `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.3)' : 'rgba(248, 113, 113, 0.2)'}`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: areActionsEnabled ? 'pointer' : 'not-allowed',
                                  transition: 'all 0.2s ease',
                                  opacity: areActionsEnabled ? 1 : 0.4,
                                }}
                                onMouseEnter={(e) => {
                                  if (!areActionsEnabled) return;
                                  e.currentTarget.style.background = isDarkMode ? 'rgba(248, 113, 113, 0.15)' : 'rgba(248, 113, 113, 0.12)';
                                  e.currentTarget.style.transform = 'scale(1.05)';
                                }}
                                onMouseLeave={(e) => {
                                  if (!areActionsEnabled) return;
                                  e.currentTarget.style.background = isDarkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(248, 113, 113, 0.08)';
                                  e.currentTarget.style.transform = 'scale(1)';
                                }}
                                title="Delete enquiry (requires passcode)"
                                aria-disabled={!areActionsEnabled}
                              >
                                <Icon 
                                  iconName="Delete" 
                                  styles={{ 
                                    root: { 
                                      fontSize: '10px', 
                                      color: isDarkMode ? '#F87171' : '#EF4444' 
                                    } 
                                  }} 
                                />
                              </div>
                            </div>

                            {/* Right-side action tools */}
                            <div 
                              style={{
                                position: 'absolute',
                                right: '16px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                opacity: 1,
                                transition: 'opacity 0.2s ease',
                                pointerEvents: 'auto',
                                display: 'flex',
                                gap: '4px',
                                alignItems: 'center',
                              }}
                              className="row-actions"
                            >
                              {areActionsEnabled && isDeletionMode && (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const enquiryName = `${item.First_Name || ''} ${item.Last_Name || ''}`.trim() || 'Unnamed enquiry';
                                    const confirmMessage = `Are you sure you want to permanently delete "${enquiryName}"?\n\nThis will remove the enquiry from both systems and cannot be undone.`;
                                    
                                    if (window.confirm(confirmMessage)) {
                                      handleDeleteEnquiry(item.ID, enquiryName);
                                    }
                                  }}
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    background: isDarkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(248, 113, 113, 0.08)',
                                    border: `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.3)' : 'rgba(248, 113, 113, 0.2)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    pointerEvents: 'auto',
                                    transition: 'all 0.2s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(248, 113, 113, 0.15)' : 'rgba(248, 113, 113, 0.12)';
                                    e.currentTarget.style.transform = 'scale(1.1)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(248, 113, 113, 0.08)';
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                  title="Delete enquiry permanently"
                                >
                                  <Icon 
                                    iconName="Delete" 
                                    styles={{ 
                                      root: { 
                                        fontSize: '10px', 
                                        color: isDarkMode ? '#F87171' : '#EF4444' 
                                      } 
                                    }} 
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          )}
                          {/* Notes Section - expanded below the row */}
                          {!isSingleDayCollapsed && hasNotes && isNotesExpanded && (
                            <div style={{
                              gridColumn: '1 / -1',
                              padding: '12px 16px',
                              backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
                              borderBottom: isLast ? 'none' : `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'}`,
                              fontSize: '13px',
                              lineHeight: '1.5',
                              color: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.75)',
                              whiteSpace: 'pre-line',
                            }}>
                              <div style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
                                marginBottom: '8px',
                              }}>
                                Notes
                              </div>
                              {item.Initial_first_call_notes?.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()}
                            </div>
                          )}
                          </React.Fragment>
                        );
                      }
                    })}
                  </div>
                )}
                        
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
              borderRadius: 0,
              fontFamily: 'Raleway, sans-serif',
            },
          }}
        >
          Rating submitted successfully!
        </MessageBar>
      )}

      {/* Rating Modal - Inline style */}
      {isRateModalOpen && (
        <div
          onClick={closeRateModal}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: isDarkMode ? 'rgba(15,23,42,0.98)' : '#fff',
              borderRadius: 12,
              padding: '24px 20px',
              minWidth: 360,
              maxWidth: 480,
              boxShadow: isDarkMode
                ? '0 10px 40px rgba(0,0,0,0.5)'
                : '0 10px 40px rgba(0,0,0,0.15)',
              border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
            }}
          >
            {/* Header */}
            <div style={{
              padding: '0 0 16px 0',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <Text style={{
                fontSize: 18,
                fontWeight: 600,
                color: isDarkMode ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.95)',
              }}>
                Rate Enquiry
              </Text>
              <button
                onClick={closeRateModal}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon iconName="Cancel" style={{ fontSize: 16 }} />
              </button>
            </div>

            {/* Rating options */}
            <div style={{ padding: '8px 0' }}>
              {[
                { value: 'Good', icon: 'FavoriteStarFill', color: colours.blue, label: 'Good quality enquiry' },
                { value: 'Neutral', icon: 'CircleRing', color: colours.grey, label: 'Average enquiry' },
                { value: 'Poor', icon: 'StatusErrorFull', color: colours.cta, label: 'Poor quality enquiry' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setCurrentRating(option.value);
                    submitRating();
                  }}
                  style={{
                    width: '100%',
                    padding: '14px 20px',
                    border: 'none',
                    background: currentRating === option.value 
                      ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')
                      : 'transparent',
                    color: isDarkMode ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: 14,
                    fontWeight: currentRating === option.value ? 600 : 500,
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDarkMode 
                      ? 'rgba(255,255,255,0.08)' 
                      : 'rgba(0,0,0,0.04)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = currentRating === option.value 
                      ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')
                      : 'transparent';
                  }}
                >
                  <Icon 
                    iconName={option.icon} 
                    style={{ fontSize: 18, color: option.color }} 
                  />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 600 }}>{option.value}</div>
                    <div style={{ 
                      fontSize: 12, 
                      color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                      marginTop: 2
                    }}>
                      {option.label}
                    </div>
                  </div>
                  {currentRating === option.value && (
                    <Icon 
                      iconName="CheckMark" 
                      style={{ 
                        fontSize: 14, 
                        color: option.color 
                      }} 
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create Contact Modal */}
      <CreateContactModal
        isOpen={isCreateContactModalOpen}
        onDismiss={() => setIsCreateContactModalOpen(false)}
        onSuccess={async (enquiryId) => {
          setToastMessage('Contact created successfully');
          setToastDetails(`New enquiry record created (ID: ${enquiryId})`);
          setToastType('success');
          setToastVisible(true);
          
          // Immediately trigger refresh to show the new enquiry
          if (onRefreshEnquiries) {
            try {
              await onRefreshEnquiries();
            } catch (err) {
              console.error('[Enquiries] Failed to refresh after contact creation:', err);
            }
          }
          
          setTimeout(() => setToastVisible(false), 4000);
        }}
        userEmail={userData?.[0]?.Email}
        teamData={teamData}
      />

      {/* Edit Enquiry Modal */}
      {showEditModal && editingEnquiry && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 600,
                color: isDarkMode ? '#e5e7eb' : '#1f2937',
              }}>
                Edit Enquiry
              </h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingEnquiry(null);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '6px',
                  color: isDarkMode ? '#9ca3af' : '#6b7280',
                }}
              >
                <Icon iconName="Cancel" styles={{ root: { fontSize: '18px' } }} />
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '16px',
            }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: isDarkMode ? '#e5e7eb' : '#374151',
                }}>
                  First Name
                </label>
                <input
                  type="text"
                  value={editingEnquiry.First_Name || ''}
                  onChange={(e) => setEditingEnquiry({ ...editingEnquiry, First_Name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${isDarkMode ? '#374151' : '#d1d5db'}`,
                    backgroundColor: isDarkMode ? '#374151' : '#ffffff',
                    color: isDarkMode ? '#e5e7eb' : '#1f2937',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: isDarkMode ? '#e5e7eb' : '#374151',
                }}>
                  Last Name
                </label>
                <input
                  type="text"
                  value={editingEnquiry.Last_Name || ''}
                  onChange={(e) => setEditingEnquiry({ ...editingEnquiry, Last_Name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${isDarkMode ? '#374151' : '#d1d5db'}`,
                    backgroundColor: isDarkMode ? '#374151' : '#ffffff',
                    color: isDarkMode ? '#e5e7eb' : '#1f2937',
                    fontSize: '14px',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '6px',
                color: isDarkMode ? '#e5e7eb' : '#374151',
              }}>
                Email
              </label>
              <input
                type="email"
                value={editingEnquiry.Email || ''}
                onChange={(e) => setEditingEnquiry({ ...editingEnquiry, Email: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${isDarkMode ? '#374151' : '#d1d5db'}`,
                  backgroundColor: isDarkMode ? '#374151' : '#ffffff',
                  color: isDarkMode ? '#e5e7eb' : '#1f2937',
                  fontSize: '14px',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '6px',
                color: isDarkMode ? '#e5e7eb' : '#374151',
              }}>
                Value
              </label>
              <input
                type="text"
                value={editingEnquiry.Value || ''}
                onChange={(e) => setEditingEnquiry({ ...editingEnquiry, Value: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${isDarkMode ? '#374151' : '#d1d5db'}`,
                  backgroundColor: isDarkMode ? '#374151' : '#ffffff',
                  color: isDarkMode ? '#e5e7eb' : '#1f2937',
                  fontSize: '14px',
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '6px',
                color: isDarkMode ? '#e5e7eb' : '#374151',
              }}>
                Notes
              </label>
              <textarea
                value={editingEnquiry.Initial_first_call_notes || ''}
                onChange={(e) => setEditingEnquiry({ ...editingEnquiry, Initial_first_call_notes: e.target.value })}
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${isDarkMode ? '#374151' : '#d1d5db'}`,
                  backgroundColor: isDarkMode ? '#374151' : '#ffffff',
                  color: isDarkMode ? '#e5e7eb' : '#1f2937',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
            }}>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingEnquiry(null);
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: `1px solid ${isDarkMode ? '#4b5563' : '#d1d5db'}`,
                  backgroundColor: 'transparent',
                  color: isDarkMode ? '#e5e7eb' : '#374151',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (editingEnquiry) {
                    await handleEditEnquiry(editingEnquiry);
                    setShowEditModal(false);
                    setEditingEnquiry(null);
                  }
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassignment Dropdown */}
      {reassignmentDropdown && (
        <div
          className="reassignment-dropdown"
          style={{
            position: 'fixed',
            left: Math.min(reassignmentDropdown.x, window.innerWidth - 220),
            top: Math.min(reassignmentDropdown.y, window.innerHeight - 300),
            zIndex: 10000,
            background: isDarkMode ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
            borderRadius: 6,
            boxShadow: isDarkMode 
              ? '0 8px 32px rgba(0, 0, 0, 0.5)' 
              : '0 8px 32px rgba(0, 0, 0, 0.15)',
            maxHeight: 280,
            width: 200,
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '8px 12px',
            borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
            fontSize: 11,
            fontWeight: 600,
            color: isDarkMode ? 'rgba(203, 213, 225, 0.7)' : 'rgba(71, 85, 105, 0.7)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Reassign to
          </div>
          <div style={{ 
            maxHeight: 230, 
            overflowY: 'auto',
            overflowX: 'hidden',
          }}>
            {isReassigning ? (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: isDarkMode ? 'rgba(203, 213, 225, 0.7)' : 'rgba(71, 85, 105, 0.7)',
                fontSize: 12,
              }}>
                Reassigning...
              </div>
            ) : (
              teamMemberOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleReassignmentSelect(option.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: isDarkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(71, 85, 105, 0.9)',
                    textAlign: 'left',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)',
                    color: colours.blue,
                    fontSize: 10,
                    fontWeight: 700,
                  }}>
                    {option.initials}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {option.text.split(' (')[0]}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      </Stack>
    </div>
  );
}

export default Enquiries;
