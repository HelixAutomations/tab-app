// src/tabs/home/Home.tsx
// invisible change 2

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
  useRef, // ADDED
  lazy,
  Suspense,
} from 'react';
import { createPortal } from 'react-dom';
import { debugLog, debugWarn } from '../../utils/debug';
import { safeSetItem, safeGetItem, cleanupLocalStorage, logStorageUsage } from '../../utils/storageUtils';
import {
  mergeStyles,
  Text,
  Spinner,
  SpinnerSize,
  MessageBar,
  MessageBarType,
  IconButton,
  Stack,
  DetailsList,
  IColumn,
  DetailsListLayoutMode,
  Persona,
  PersonaSize,
  PersonaPresence,
  DefaultButton,
  Icon,
  Toggle,
  keyframes,
} from '@fluentui/react';
import { FaCheck } from 'react-icons/fa';
import { colours } from '../../app/styles/colours';
// Removed legacy MetricCard usage
import TimeMetricsV2 from '../../components/modern/TimeMetricsV2';
import { useHomeMetricsStream } from '../../hooks/useHomeMetricsStream';
import GreyHelixMark from '../../assets/grey helix mark.png';
import InAttendanceImg from '../../assets/in_attendance.png';
import WfhImg from '../../assets/wfh.png';
import OutImg from '../../assets/outv2.png';
import '../../app/styles/VerticalLabelPanel.css';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
// Removed legacy MetricCard styles import
import './EnhancedHome.css';
import { dashboardTokens, cardTokens, cardStyles } from '../instructions/componentTokens';
import { componentTokens } from '../../app/styles/componentTokens';
import ThemedSpinner from '../../components/ThemedSpinner';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';
import OperationStatusToast from '../enquiries/pitch-builder/OperationStatusToast';

import FormCard from '../forms/FormCard';
import ResourceCard from '../resources/ResourceCard';

import { FormItem, Matter, Transaction, TeamData, OutstandingClientBalance, BoardroomBooking, SoundproofPodBooking, SpaceBooking, FutureBookingsResponse, InstructionData, Enquiry, NormalizedMatter } from '../../app/functionality/types';

import { Resource } from '../resources/Resources';

import FormDetails from '../forms/FormDetails';
import ResourceDetails from '../resources/ResourceDetails';

import HomePanel from './HomePanel';
import { app } from '@microsoft/teams-js';

import BespokePanel from '../../app/functionality/BespokePanel';

import ActionSection from './ActionSection';
import { sharedDefaultButtonStyles } from '../../app/styles/ButtonStyles';
import { isInTeams } from '../../app/functionality/isInTeams';
import { hasActiveMatterOpening } from '../../app/functionality/matterOpeningUtils';
import { hasActivePitchBuilder } from '../../app/functionality/pitchBuilderUtils';
import { normalizeMatterData } from '../../utils/matterNormalization';
import localAttendance from '../../localData/localAttendance.json';
import localAnnualLeave from '../../localData/localAnnualLeave.json';
import localMatters from '../../localData/localMatters.json';
import localInstructionData from '../../localData/localInstructionData.json';
import localTransactions from '../../localData/localTransactions.json';
import localOutstandingBalances from '../../localData/localOutstandingBalances.json';
import localWipClio from '../../localData/localWipClio.json';
import localRecovered from '../../localData/localRecovered.json';
import localPrevRecovered from '../../localData/localPrevRecovered.json';
import localSnippetEdits from '../../localData/localSnippetEdits.json';
import localV3Blocks from '../../localData/localV3Blocks.json';
import { checkIsLocalDev } from '../../utils/useIsLocalDev';

// Enhanced components
import SectionCard from './SectionCard';
// Removed legacy Enhanced metrics components

// NEW: Import the updated QuickActionsCard component
import QuickActionsCard from './QuickActionsCard';
import QuickActionsBar from './QuickActionsBar';
import { getQuickActionIcon } from './QuickActionsCard';
import ImmediateActionsBar from './ImmediateActionsBar';
import type { ImmediateActionCategory } from './ImmediateActionChip';
import { getActionableInstructions } from './InstructionsPrompt';
import OutstandingBalancesList from '../transactions/OutstandingBalancesList';

import Attendance from './AttendanceCompact';
import EnhancedAttendance from './EnhancedAttendanceNew';
import PersonalAttendanceConfirm from './PersonalAttendanceConfirm';
import RateChangeModal from './RateChangeModal';
import { useRateChangeData } from './useRateChangeData';

import TransactionCard from '../transactions/TransactionCard';
import TransactionApprovalPopup from '../transactions/TransactionApprovalPopup';

import OutstandingBalanceCard from '../transactions/OutstandingBalanceCard'; // Adjust the path if needed
import UnclaimedEnquiries from '../enquiries/UnclaimedEnquiries';

const proxyBaseUrl = getProxyBaseUrl();

// Helper to dynamically update localEnquiries.json's first record to always have today's date in local mode
export function getLiveLocalEnquiries(currentUserEmail?: string) {
  try {
    // Only do this in local mode
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const localEnquiries = require('../../localData/localEnquiries.json');
    if (Array.isArray(localEnquiries) && localEnquiries.length > 0) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      localEnquiries[0].Touchpoint_Date = todayStr;
      localEnquiries[0].Date_Created = todayStr;
      // Set Point_of_Contact for all records to current user email in local mode
      if (currentUserEmail) {
        localEnquiries.forEach((enq: any) => {
          enq.Point_of_Contact = currentUserEmail;
        });
      }
    }
    return localEnquiries;
  } catch (e) {
    // ignore if not found
    return [];
  }
}

// Lazy-loaded form components
const Tasking = lazy(() => import('../../CustomForms/Tasking'));
const TelephoneAttendance = lazy(() => import('../../CustomForms/TelephoneAttendance'));
const AnnualLeaveForm = lazy(() => import('../../CustomForms/AnnualLeaveForm'));
// NEW: Import placeholders for approvals & bookings
const AnnualLeaveApprovals = lazy(() => import('../../CustomForms/AnnualLeaveApprovals'));
const AnnualLeaveBookings = lazy(() => import('../../CustomForms/AnnualLeaveBookings'));
const BookSpaceForm = lazy(() => import('../../CustomForms/BookSpaceForm'));
const SnippetEditsApproval = lazy(() => import('../../CustomForms/SnippetEditsApproval'));

// Icons initialized in index.tsx

//////////////////////
// Interfaces
//////////////////////

interface AttendanceRecord {
  Attendance_ID: number;
  Entry_ID: number;
  First_Name: string;
  Initials: string;
  Level: string;
  Week_Start: string;
  Week_End: string;
  ISO_Week: number;
  Attendance_Days: string;
  Confirmed_At: string | null;
}

interface AnnualLeaveRecord {
  person: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  id: string;
  days_taken?: number;
  leave_type?: string;
  rejection_notes?: string;
  approvers?: string[];
  hearing_confirmation?: string; // "yes" or "no"
  hearing_details?: string;      // Additional details when hearing_confirmation is "no"
}

export interface SnippetEdit {
  id: number;
  snippetId: number;
  blockTitle: string;
  currentText: string;
  currentLabel?: string;
  currentSortOrder?: number;
  currentBlockId?: number;
  currentCreatedBy?: string;
  currentCreatedAt?: string;
  currentUpdatedBy?: string;
  currentUpdatedAt?: string;
  currentApprovedBy?: string;
  currentApprovedAt?: string;
  currentIsApproved?: boolean;
  currentVersion?: number;
  proposedText: string;
  proposedLabel?: string;
  proposedSortOrder?: number;
  proposedBlockId?: number;
  isNew?: boolean;
  submittedBy: string;
  submittedAt?: string;
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  status?: string;
}

interface HomeProps {
  context: app.Context | null;
  userData: any;
  enquiries: any[] | null;
  matters?: NormalizedMatter[]; // Prefer app-provided normalized matters
  instructionData?: InstructionData[];
  onAllMattersFetched?: (matters: Matter[]) => void;
  onOutstandingBalancesFetched?: (data: any) => void;
  onPOID6YearsFetched?: (data: any[]) => void;
  onTransactionsFetched?: (transactions: Transaction[]) => void;
  onBoardroomBookingsFetched?: (data: BoardroomBooking[]) => void;
  onSoundproofBookingsFetched?: (data: SoundproofPodBooking[]) => void;
  teamData?: TeamData[] | null;
  isInMatterOpeningWorkflow?: boolean;
  onImmediateActionsChange?: (hasActions: boolean) => void;
  originalAdminUser?: any; // For admin user switching context
  featureToggles?: Record<string, boolean>;
}

interface QuickLink {
  title: string;
  icon: string;
}

interface Person {
  id: string;
  name: string;
  initials: string;
  presence: PersonaPresence;
  nickname?: string;
}

// Removed legacy CollapsibleSectionProps interface

interface MetricItem {
  title: string;
  isTimeMoney?: boolean;
  isMoneyOnly?: boolean;
  money?: number;
  hours?: number;
  prevMoney?: number;
  prevHours?: number;
  count?: number;
  prevCount?: number;
  showDial?: boolean;
  dialTarget?: number;
  dialValue?: number;
  dialSuffix?: string;
}

export interface TeamMember {
  First: string;
  Initials: string;
  "Entra ID": string;
  Nickname: string;
  holiday_entitlement?: number;
}

interface MatterBalance {
  id: number;
  ClientName: string;
  total_outstanding_balance: number;
  associated_matter_ids: number[];
}

//////////////////////
// Collapsible Section
//////////////////////

// Removed legacy CollapsibleSection component


//////////////////////
// Quick Actions Order
//////////////////////

const quickActionOrder: Record<string, number> = {
  'Approve Annual Leave': 0,
  'Update Attendance': 1,
  'Confirm Attendance': 1,
  'Open Matter': 2,
  'Review Instructions': 3,
  // Instruction workflow actions
  'Review ID': 3,
  'Verify ID': 3,
  'Assess Risk': 4,
  'Submit to CCL': 5,
  'Create a Task': 4,
  'Request CollabSpace': 5,
  'Save Telephone Note': 6,
  'Save Attendance Note': 7,
  'Request ID': 8,
  'Open a Matter': 9,
  'Request Annual Leave': 10,
  'Unclaimed Enquiries': 11,
};

//////////////////////
// Quick Actions
//////////////////////

const quickActions: QuickLink[] = [
  { title: 'Update Attendance', icon: 'Calendar' },
  { title: 'Create a Task', icon: 'Checklist' },
  { title: 'Save Telephone Note', icon: 'Comment' },
  { title: 'Request Annual Leave', icon: 'PalmTree' }, // Icon resolved to umbrella for consistency
  { title: 'Book Space', icon: 'Room' },
];

//////////////////////
// Styles
//////////////////////

// Subtle Helix watermark (three rounded ribbons) as inline SVG, Teams-like subtlety
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

const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    // Model the Immediate Actions banner surface, but keep it subtly distinct
    // Light: softly frosted light surface; Dark: translucent slate surface
    background: isDarkMode
      ? 'linear-gradient(135deg, #0b1220 0%, #111827 45%, #0f1c32 100%)'
      : colours.light.background,
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    color: isDarkMode ? '#f3f4f6' : '#061733',
    minHeight: '100vh',
    boxSizing: 'border-box',
    position: 'relative',
    // Subtle separation so it doesn't visually merge with the Immediate Actions banner
    borderTop: isDarkMode ? '1px solid rgba(148,163,184,0.12)' : '1px solid rgba(148,163,184,0.10)',
    boxShadow: isDarkMode
      ? 'inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 30px rgba(0,0,0,0.20)'
      : 'inset 0 1px 0 rgba(255,255,255,0.65), 0 10px 30px rgba(6,23,51,0.08)',
    '&::before': {
      content: '""',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      // Keep the Helix watermark beneath to give the glass something to refract
      background: 'none',
      backgroundImage: helixWatermarkSvg(isDarkMode),
      backgroundRepeat: 'no-repeat',
      backgroundPosition: isDarkMode ? 'right -120px top -80px' : 'right -140px top -100px',
      backgroundSize: 'min(52vmin, 520px)',
      pointerEvents: 'none',
      zIndex: 0
    }
  });

const headerStyle = mergeStyles({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  width: '100%',
  padding: '10px 0',
  gap: '16px',
});


const mainContentStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  zIndex: 1,
});
// Height of the top tab menu so the quick action bar can align with it
const ACTION_BAR_HEIGHT = 48;

const quickLinksStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode
      ? colours.dark.sectionBackground
      : colours.light.sectionBackground,
    padding: '0 10px',
    transition: 'background-color 0.3s, box-shadow 0.3s',
    display: 'flex',
    flexDirection: 'row',
    gap: '8px',
    overflowX: 'auto',
    alignItems: 'center',
    paddingBottom: '16px',
    position: 'sticky',
    top: ACTION_BAR_HEIGHT,
    zIndex: 999,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  });

const tableAnimationStyle = mergeStyles({
  animation: 'fadeIn 0.5s ease-in-out',
});

const calculateAnimationDelay = (row: number, col: number) => (row + col) * 0.1;

const versionStyle = (isDarkMode: boolean) => mergeStyles({
  textAlign: 'center',
  fontSize: '14px',
  color: isDarkMode ? colours.dark.text : colours.light.text,
  marginTop: '40px',
});

const subLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: '600',
    fontSize: '16px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

const actionsMetricsContainerStyle = mergeStyles({
  backgroundColor: '#ffffff',
  padding: '16px',
  borderRadius: 0,
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
  marginBottom: '24px',
  '@media (max-width: 600px)': { padding: '12px' },
});

const favouritesGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: '16px',
  '@media (min-width: 1000px)': { gridTemplateColumns: 'repeat(5, 1fr)' },
});

// Removed legacy metrics grid styles (metricsGridThree/metricsGridTwo)

const peopleGridStyle = mergeStyles({
  display: 'grid',
  paddingLeft: '80px',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  gap: '16px',
  alignItems: 'center',
  width: '100%',
});

const sectionContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    padding: '16px',
    borderRadius: 0,
    boxShadow: isDarkMode
      ? '0 4px 12px rgba(0, 0, 0, 0.3)'
      : `0 4px 12px ${colours.light.border}`,
    position: 'relative',
    width: '100%',
  });


//////////////////////
// TabLabel Component
//////////////////////
const TabLabel: React.FC<{ label: string }> = ({ label }) => {
  return (
    <div
      className={mergeStyles({
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '50px',
        backgroundColor: colours.grey,
        zIndex: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <span style={{ transform: 'rotate(-90deg)', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
};

//////////////////////
// Utility: Flatten & Transform Context
//////////////////////

const flattenObject = (obj: any, prefix = ''): { key: string; value: any }[] => {
  let result: { key: string; value: any }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v))
      result = result.concat(flattenObject(v, newKey));
    else result.push({ key: newKey, value: v });
  }
  return result;
};

const transformContext = (contextObj: any): { key: string; value: string }[] => {
  if (!contextObj || typeof contextObj !== 'object') {
    debugWarn('Invalid context object:', contextObj);
    return [];
  }
  const flattened = flattenObject(contextObj);
  return flattened.map(({ key, value }) => ({
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value),
  }));
};

const createColumnsFunction = (isDarkMode: boolean): IColumn[] => [
  {
    key: 'key',
    name: 'Key',
    fieldName: 'key',
    minWidth: 150,
    maxWidth: 200,
    isResizable: true,
    styles: { root: { color: isDarkMode ? colours.dark.text : colours.light.text } },
  },
  {
    key: 'value',
    name: 'Value',
    fieldName: 'value',
    minWidth: 300,
    maxWidth: 600,
    isResizable: true,
    styles: { root: { color: isDarkMode ? colours.dark.text : colours.light.text } },
  },
];

//////////////////////
// PersonBubble Component
//////////////////////

interface PersonBubbleProps {
  person: Person;
  isDarkMode: boolean;
  animationDelay?: number;
  avatarUrlOverride?: string;
}

const PersonBubble: React.FC<PersonBubbleProps> = ({
  person,
  isDarkMode,
  animationDelay,
  avatarUrlOverride,
}) => {
  const bubbleStyle = mergeStyles({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    opacity: 0,
    transform: 'translateY(20px)',
    animation: `fadeInUp 0.3s ease forwards`,
    animationDelay: animationDelay ? `${animationDelay}s` : '0s',
  });

  const textBubbleStyle = mergeStyles({
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    backgroundColor: colours.grey,
    borderRadius: 0,
    padding: '0 10px 0 50px',
    height: '34px',
    display: 'flex',
    alignItems: 'center',
    zIndex: 3,
    whiteSpace: 'nowrap',
  });

  const textStyle = mergeStyles({ color: isDarkMode ? colours.dark.text : colours.light.text });

  let imageUrl = WfhImg;
  let presence = PersonaPresence.none;

  if (person.presence === PersonaPresence.online) {
    imageUrl = InAttendanceImg;
    presence = PersonaPresence.online;
  } else if (person.presence === PersonaPresence.busy) {
    imageUrl = OutImg;
    presence = PersonaPresence.busy;
  }

  return (
    <div className={bubbleStyle}>
      <div style={{ position: 'relative', zIndex: 4 }}>
        <Persona
          text=""
          imageUrl={avatarUrlOverride || imageUrl}
          size={PersonaSize.size24}
          presence={presence}
          hidePersonaDetails
          styles={{
            root: {
              zIndex: 4,
              boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.15)',
              borderRadius: '50%',
            },
          }}
        />
        <div className={textBubbleStyle}>
          <Text className={textStyle}>{person.nickname || person.name}</Text>
        </div>
      </div>
    </div>
  );
};

const getISOWeek = (date: Date): number => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return Math.round(((d.getTime() - week1.getTime()) / 86400000 + 1) / 7) + 1;
};

const formatWeekFragment = (date: Date): string => {
  const isoWeek = getISOWeek(date);
  return `${date.getFullYear()}-W${String(isoWeek).padStart(2, '0')}`;
};

// Robust date parser matching ManagementDashboard behaviour
const parseDateValue = (input: unknown): Date | null => {
  if (typeof input !== 'string' || input.trim().length === 0) return null;
  const trimmed = input.trim();
  const normalised = trimmed.includes('/') && !trimmed.includes('T')
    ? (() => {
        // Convert dd/mm/yyyy -> yyyy-mm-dd
        const parts = trimmed.split('/');
        if (parts.length === 3) {
          const [dd, mm, yyyy] = parts;
          return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        }
        return trimmed;
      })()
    : trimmed;
  const candidate = new Date(normalised);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

//////////////////////
// Caching Variables (module-level)
//////////////////////

// Helper to convert "dd/mm/yyyy" to "yyyy-mm-dd"
const convertToISO = (dateStr: string): string => {
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

// Robust date parser that accepts ISO (yyyy-mm-dd) and UK (dd/mm/yyyy)
const parseOpenDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const str = String(value).trim();
  if (!str) return null;
  // If looks like dd/mm/yyyy, convert to ISO first
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const iso = convertToISO(str);
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

interface AttendanceData {
  attendance: any[]; // Replace 'any[]' with a specific type if you know the structure
  team: any[];      // Replace 'any[]' with TeamMember[] or similar if known
}

let cachedAttendance: AttendanceData | null = null;
let cachedAttendanceError: string | null = null;
let cachedPOID6Years: any[] | null = null;

let cachedAnnualLeave: AnnualLeaveRecord[] | null = null;
let cachedAnnualLeaveError: string | null = null;

let cachedFutureLeaveRecords: AnnualLeaveRecord[] | null = null; // ADDED

let cachedWipClio: any | null = null;
let cachedWipClioError: string | null = null;
let cachedRecovered: number | null = null;
let cachedRecoveredError: string | null = null;
let cachedPrevRecovered: number | null = null;
let cachedPrevRecoveredError: string | null = null;
let cachedMetricsUserKey: string | null = null;

let cachedAllMatters: Matter[] | null = null; // Force refresh after database cleanup - cleared at 2025-09-21
let cachedAllMattersError: string | null = null;
const CACHE_INVALIDATION_KEY = 'matters-cache-v3'; // Changed to force refresh after test data deletion

let cachedOutstandingBalances: any | null = null;

// At the top of Home.tsx, along with your other caching variables:
let cachedTransactions: Transaction[] | null = null;

// Helper: Normalize metrics alias
// - Lukasz/Luke (LZ) -> Jonathan Waters (JW)
// - Samuel Packwood   -> Sam Packwood

const getMetricsAlias = (
  _fullName: string | undefined,
  _initials: string | undefined,
  _clioId: string | number | undefined
) => {
  const fullName = (_fullName || '').toLowerCase();
  const initials = (_initials || '').toLowerCase();

  // Map Lukasz/Luke (LZ) to Jonathan Waters
  if (fullName.includes('lukasz') || fullName.includes('luke') || initials === 'lz') {
    return { name: 'Jonathan Waters', clioId: 137557 };
  }

  // Normalize Samuel to Sam
  if (fullName === 'samuel packwood') {
    const clioIdNum = typeof _clioId === 'string' ? parseInt(_clioId, 10) : _clioId;
    return { name: 'Sam Packwood', clioId: clioIdNum };
  }

  const clioIdNum = typeof _clioId === 'string' ? parseInt(_clioId, 10) : _clioId;
  return { name: _fullName || '', clioId: clioIdNum };
};

//////////////////////
// CognitoForm Component
//////////////////////

const CognitoForm: React.FC<{ dataKey: string; dataForm: string }> = ({ dataKey, dataForm }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://www.cognitoforms.com/f/seamless.js';
      script.setAttribute('data-key', dataKey);
      script.setAttribute('data-form', dataForm);
      script.async = true;
      containerRef.current.appendChild(script);
      return () => {
        if (containerRef.current) containerRef.current.innerHTML = '';
      };
    }
  }, [dataKey, dataForm]);
  return <div ref={containerRef} />;
};

//////////////////////
// Home Component
//////////////////////

const Home: React.FC<HomeProps> = ({ context, userData, enquiries, matters: providedMatters, instructionData: propInstructionData, onAllMattersFetched, onOutstandingBalancesFetched, onPOID6YearsFetched, onTransactionsFetched, teamData, onBoardroomBookingsFetched, onSoundproofBookingsFetched, isInMatterOpeningWorkflow = false, onImmediateActionsChange, originalAdminUser, featureToggles = {} }) => {
  const { isDarkMode, toggleTheme } = useTheme();
  const { setContent } = useNavigatorActions();
  const inTeams = isInTeams();
  const useLocalData =
    process.env.REACT_APP_USE_LOCAL_DATA === 'true';
  
  // Component mounted successfully

  const [attendanceTeam, setAttendanceTeam] = useState<any[]>([]);
  const [annualLeaveTeam, setAnnualLeaveTeam] = useState<any[]>([]);
  // Transform teamData into our lite TeamMember type
  const transformedTeamData = useMemo<TeamMember[]>(() => {
    const data: TeamData[] = teamData ?? attendanceTeam ?? [];

    const entitlementByInitials = new Map<string, number>();
    for (const row of annualLeaveTeam || []) {
      const initials = String(row?.Initials || '').trim().toUpperCase();
      const entitlement = Number(row?.holiday_entitlement);
      if (initials && Number.isFinite(entitlement)) {
        entitlementByInitials.set(initials, entitlement);
      }
    }

    return data
      .filter(
        (member) => {
          const status = String(member.status ?? '').trim().toLowerCase();
          return !status || status === 'active';
        }
      )
      .map((member: TeamData) => ({
        First: member.First ?? '',
        Initials: member.Initials ?? '',
        "Entra ID": member["Entra ID"] ?? '',
        Nickname: member.Nickname ?? member.First ?? '',
        holiday_entitlement: entitlementByInitials.get(String(member.Initials ?? '').trim().toUpperCase()),
      }));
  }, [teamData, attendanceTeam, annualLeaveTeam]);

  const renderContextsPanelContent = () => (
    <Stack tokens={dashboardTokens} styles={cardStyles}>
      <Stack tokens={cardTokens}>
        <Text variant="xLarge" styles={{ root: { fontWeight: '600' } }}>
          Teams Context
        </Text>
        <DetailsList
          items={transformContext(context)}
          columns={createColumnsFunction(isDarkMode)}
          setKey="teamsSet"
          layoutMode={DetailsListLayoutMode.justified}
          isHeaderVisible={false}
          styles={{
            root: {
              selectors:
                { '.ms-DetailsRow': { padding: '8px 0', borderBottom: 'none' },
                '.ms-DetailsHeader': { display: 'none' },
              },
            },
          }}
        />
      </Stack>
      <Stack tokens={cardTokens}>
        <Text variant="xLarge" styles={{ root: { fontWeight: '600' } }}>
          SQL Context
        </Text>
        <DetailsList
          items={transformContext(userData)}
          columns={createColumnsFunction(isDarkMode)}
          setKey="sqlSet"
          layoutMode={DetailsListLayoutMode.justified}
          isHeaderVisible={false}
          styles={{
            root: {
              selectors: {
                '.ms-DetailsRow': { padding: '8px 0', borderBottom: 'none' },
                '.ms-DetailsHeader': { display: 'none' },
              },
            },
          }}
        />
      </Stack>
    </Stack>
  );

  // Inside the Home component, add state (near other state declarations)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isTransactionPopupOpen, setIsTransactionPopupOpen] = useState<boolean>(false);

  // Replace the placeholder handler
  const handleTransactionClick = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsTransactionPopupOpen(true);
  };
  
  const handleTransactionSubmit = (
    values: { transferRequested: boolean; customAmount?: number; transferCustom?: boolean },
    updatedTransaction: Transaction
  ) => {
    // Update the transactions state with the updated transaction
    setTransactions((prevTransactions) =>
      prevTransactions.map((tx) =>
        tx.transaction_id === updatedTransaction.transaction_id ? updatedTransaction : tx
      )
    );
  };

  const updateTransaction = (updatedTransaction: Transaction) => {
    setTransactions((prevTransactions) =>
      prevTransactions.map((tx) =>
        tx.transaction_id === updatedTransaction.transaction_id ? updatedTransaction : tx
      )
    );
  };

  // ADDED: Store user initials so they don't reset on remount
  const storedUserInitials = useRef<string | null>(null); // ADDED
  const attendanceRef = useRef<{ focusTable: () => void; setWeek: (week: 'current' | 'next') => void }>(null); // Add this line
  const recoveredFeesInitialized = useRef<boolean>(false); // Prevent infinite loop

  // State declarations...
  const [enquiriesToday, setEnquiriesToday] = useState<number>(0);
  const [enquiriesWeekToDate, setEnquiriesWeekToDate] = useState<number>(0);
  const [enquiriesMonthToDate, setEnquiriesMonthToDate] = useState<number>(0);
  const [todaysTasks, setTodaysTasks] = useState<number>(10);
  const [tasksDueThisWeek, setTasksDueThisWeek] = useState<number>(20);
  const [completedThisWeek, setCompletedThisWeek] = useState<number>(15);
  const [recordedTime, setRecordedTime] = useState<{ hours: number; money: number }>({
    hours: 120,
    money: 1000,
  });
  const [prevEnquiriesToday, setPrevEnquiriesToday] = useState<number>(8);
  const [prevEnquiriesWeekToDate, setPrevEnquiriesWeekToDate] = useState<number>(18);
  const [prevEnquiriesMonthToDate, setPrevEnquiriesMonthToDate] = useState<number>(950);
  const [prevTodaysTasks, setPrevTodaysTasks] = useState<number>(12);
  const [prevTasksDueThisWeek, setPrevTasksDueThisWeek] = useState<number>(18);
  const [prevCompletedThisWeek, setPrevCompletedThisWeek] = useState<number>(17);
  const [prevRecordedTime, setPrevRecordedTime] = useState<{ hours: number; money: number }>({
    hours: 110,
    money: 900,
  });
  const [isContextsExpanded, setIsContextsExpanded] = useState<boolean>(false);
  const [formsFavorites, setFormsFavorites] = useState<FormItem[]>([]);
  const [resourcesFavorites, setResourcesFavorites] = useState<Resource[]>([]);
  const [selectedForm, setSelectedForm] = useState<FormItem | null>(null);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [isBespokePanelOpen, setIsBespokePanelOpen] = useState<boolean>(false);
  const [bespokePanelContent, setBespokePanelContent] = useState<ReactNode>(null);
  const [bespokePanelTitle, setBespokePanelTitle] = useState<string>('');
  const [bespokePanelDescription, setBespokePanelDescription] = useState<string>('');
  const [bespokePanelIcon, setBespokePanelIcon] = useState<React.ComponentType<any> | null>(null);
  const [isContextPanelOpen, setIsContextPanelOpen] = useState<boolean>(false);
  const [bankHolidays, setBankHolidays] = useState<Set<string>>(new Set());

  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [annualLeaveRecords, setAnnualLeaveRecords] = useState<AnnualLeaveRecord[]>([]);
  const [annualLeaveError, setAnnualLeaveError] = useState<string | null>(null);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState<boolean>(false);
  const [isLoadingAnnualLeave, setIsLoadingAnnualLeave] = useState<boolean>(false);
  const [wipClioData, setWipClioData] = useState<any | null>(null);
  const [wipClioError, setWipClioError] = useState<string | null>(null);
  const [recoveredData, setRecoveredData] = useState<number | null>(null);
  const [prevRecoveredData, setPrevRecoveredData] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recoveredError, setRecoveredError] = useState<string | null>(null);
  const [prevRecoveredError, setPrevRecoveredError] = useState<string | null>(null);
  const [isLoadingWipClio, setIsLoadingWipClio] = useState<boolean>(false);
  const [isLoadingRecovered, setIsLoadingRecovered] = useState<boolean>(false);
  const [futureLeaveRecords, setFutureLeaveRecords] = useState<AnnualLeaveRecord[]>([]);
  const [annualLeaveTotals, setAnnualLeaveTotals] = useState<any>(null);
  const [isActionsLoading, setIsActionsLoading] = useState<boolean>(true);

  const [allMatters, setAllMatters] = useState<Matter[] | null>(null);
  const [allMattersError, setAllMattersError] = useState<string | null>(null);
  const [isLoadingAllMatters, setIsLoadingAllMatters] = useState<boolean>(false);

  // State for refreshing time metrics
  const [isRefreshingTimeMetrics, setIsRefreshingTimeMetrics] = useState<boolean>(false);

  // Reset ref for QuickActionsBar to clear selection when panels close
  const resetQuickActionsSelectionRef = useRef<(() => void) | null>(null);

  const [timeMetricsCollapsed, setTimeMetricsCollapsed] = useState(false);
  const [conversionMetricsCollapsed, setConversionMetricsCollapsed] = useState(false);

  const [poid6Years, setPoid6Years] = useState<any[] | null>(null);
  const [isLoadingPOID6Years, setIsLoadingPOID6Years] = useState<boolean>(false);
  const [poid6YearsError, setPoid6YearsError] = useState<string | null>(null);

  // Consider immediate actions 'ready' once attendance & annual leave calls complete;
  // don't let auxiliary isActionsLoading flag (which may flicker) block UI rendering.
  const immediateActionsReady = !isLoadingAttendance && !isLoadingAnnualLeave;

  // SAFETY: In rare error paths isActionsLoading might never be cleared; ensure it flips off
  React.useEffect(() => {
    if (isActionsLoading && !isLoadingAttendance && !isLoadingAnnualLeave) {
      // Fallback clear
      setIsActionsLoading(false);
    }
  }, [isActionsLoading, isLoadingAttendance, isLoadingAnnualLeave]);

  // HARD TIMEOUT FAILSAFE (especially for local dev): clear loading after 5s max
  React.useEffect(() => {
    if (!isActionsLoading) return;
    const timeout = setTimeout(() => {
      if (isActionsLoading) {
        /* eslint-disable no-console */
        debugWarn('[ImmediateActions] Hard timeout reached, forcing isActionsLoading = false');
        /* eslint-enable no-console */
        setIsActionsLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timeout);
  }, [isActionsLoading]);

  // DEBUG: Log state transitions for diagnosing hanging immediate actions
  // Show immediate actions overlay (and Dismiss button) only on the first
  // home load for the session when immediate actions exist 
  const [showFocusOverlay, setShowFocusOverlay] = useState<boolean>(false);

  // Track if there's an active matter opening in progress
  const [hasActiveMatter, setHasActiveMatter] = useState<boolean>(false);
  const [hasActivePitch, setHasActivePitch] = useState<boolean>(false);

  // Show overlay when immediate actions become available (first time only)
  // This effect must run AFTER immediateActionsList is defined
  // So we place it after immediateActionsList declaration

  const [annualLeaveAllData, setAnnualLeaveAllData] = useState<any[]>([]);

  const [outstandingBalancesData, setOutstandingBalancesData] = useState<any | null>(null);

  const [futureBookings, setFutureBookings] = useState<FutureBookingsResponse>({
    boardroomBookings: [],
    soundproofBookings: []
  });

  // Pending snippet edits for approval
  const [snippetEdits, setSnippetEdits] = useState<SnippetEdit[]>([]);

  // Pending document workspace actions (files in Holding needing allocation)
  interface PendingDocAction {
    enquiryId: string;
    passcode: string;
    holdingCount: number;
    actionType: string;
    actionLabel: string;
  }
  const [pendingDocActions, setPendingDocActions] = useState<PendingDocAction[]>([]);
  const [pendingDocActionsLoading, setPendingDocActionsLoading] = useState<boolean>(true);

  // Fetch pending doc workspace actions on mount
  useEffect(() => {
    const fetchPendingDocActions = async () => {
      try {
        setPendingDocActionsLoading(true);
        const res = await fetch(`${proxyBaseUrl}/api/doc-workspace/pending-actions`);
        if (res.ok) {
          const data = await res.json();
          setPendingDocActions(data.pendingActions || []);
        }
      } catch (err) {
        console.error('Failed to fetch pending doc actions:', err);
      } finally {
        setPendingDocActionsLoading(false);
      }
    };
    fetchPendingDocActions();
  }, []);

  // Rate change notification modal state
  const [showRateChangeModal, setShowRateChangeModal] = useState<boolean>(false);

  // Toast notification state for attendance saves and other actions
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info' | 'warning'>('success');
  const [toastDetails, setToastDetails] = useState<string | undefined>(undefined);

  // Helper to show toast notifications
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning', details?: string) => {
    setToastMessage(message);
    setToastType(type);
    setToastDetails(details);
    setToastVisible(true);
    // Auto-hide after delay
    setTimeout(() => setToastVisible(false), type === 'error' ? 5000 : 3000);
  }, []);

  // List of unclaimed enquiries for quick access panel
  const unclaimedEnquiries = useMemo(
    () =>
      (enquiries || []).filter(
        (e: Enquiry) => (e.Point_of_Contact || '').toLowerCase() === 'team@helix-law.com'
      ),
    [enquiries]
  );

  // Fetch pending snippet edits and prefetch snippet blocks
  useEffect(() => {
    // SNIPPET FUNCTIONALITY REMOVED - Changed approach completely
    // Snippet edits and blocks are no longer fetched from Azure Functions
    const useLocal = process.env.REACT_APP_USE_LOCAL_DATA === 'true';

    const fetchEditsAndBlocks = async () => {
      if (useLocal) {
        setSnippetEdits(localSnippetEdits as SnippetEdit[]);
        if (!sessionStorage.getItem('prefetchedBlocksData')) {
          sessionStorage.setItem('prefetchedBlocksData', JSON.stringify(localV3Blocks));
        }
        return;
      }
      // Snippet fetching disabled - functionality removed
      // try {
      //   const url = `${proxyBaseUrl}/${process.env.REACT_APP_GET_SNIPPET_EDITS_PATH}?code=${process.env.REACT_APP_GET_SNIPPET_EDITS_CODE}`;
      //   const res = await fetch(url);
      //   if (res.ok) {
      //     const data = await res.json();
      //     setSnippetEdits(data);
      //   }
      // } catch (err) {
      //   console.error('Failed to fetch snippet edits', err);
      // }

      // if (!sessionStorage.getItem('prefetchedBlocksData')) {
      //   try {
      //     const blocksUrl = `${proxyBaseUrl}/${process.env.REACT_APP_GET_SNIPPET_BLOCKS_PATH}?code=${process.env.REACT_APP_GET_SNIPPET_BLOCKS_CODE}`;
      //     const blocksRes = await fetch(blocksUrl);
      //     if (blocksRes.ok) {
      //       const data = await blocksRes.json();
      //       sessionStorage.setItem('prefetchedBlocksData', JSON.stringify(data));
      //     }
      //   } catch (err) {
      //     console.error('Failed to prefetch snippet blocks', err);
      //   }
      // }
    };
    fetchEditsAndBlocks();
  }, []);

  // Check for active matter opening every 2 seconds
  useEffect(() => {
    const checkActiveMatter = () => {
      setHasActiveMatter(hasActiveMatterOpening(isInMatterOpeningWorkflow));
    };

    // Initial check
    checkActiveMatter();

    // Set up polling
    const interval = setInterval(checkActiveMatter, 2000);

    return () => clearInterval(interval);
  }, [isInMatterOpeningWorkflow]);

  useEffect(() => {
    const checkActivePitch = () => {
      setHasActivePitch(hasActivePitchBuilder());
    };
    checkActivePitch();
    const interval = setInterval(checkActivePitch, 2000);
    return () => clearInterval(interval);
  }, []);

  const [localInstructionDataState, setLocalInstructionDataState] = useState<InstructionData[]>([]);

  // Use prop instruction data if available, otherwise use local state
  const instructionData = propInstructionData || localInstructionDataState;

  // Load instruction data - only load local data if no prop data is provided
  useEffect(() => {
    if (!propInstructionData && useLocalData) {
      const transformedData: InstructionData[] = (localInstructionData as any).map((item: any) => ({
        prospectId: item.prospectId,
        deals: item.deals || [],
        instructions: item.instructions || [],
        documents: item.documents || [],
        riskAssessment: item.riskAssessment || null,
        idVerification: item.idVerification || null,
        matter: item.matter || null
      }));
      setLocalInstructionDataState(transformedData);
    } else if (propInstructionData) {
      // Using prop instruction data
    }
  }, [useLocalData, propInstructionData]);

  // Populate current user details once user data is available
  useEffect(() => {
    if (userData && userData[0]) {
      setCurrentUserEmail((userData[0].Email || '').toLowerCase().trim());
      setCurrentUserName(userData[0].FullName || '');
    }
  }, [userData]);

  // Clear cached time/fee metrics only when the signed-in user actually changes
  useEffect(() => {
    const rawEmail = (userData?.[0]?.Email || '').toLowerCase().trim();
    const rawInitials = (userData?.[0]?.Initials || '').toUpperCase().trim();
    const nextUserKey = rawEmail || rawInitials ? `${rawEmail}|${rawInitials}` : null;

    if (!nextUserKey) {
      cachedMetricsUserKey = null;
      return;
    }

    if (cachedMetricsUserKey === nextUserKey) {
      return;
    }

    cachedMetricsUserKey = nextUserKey;
    cachedWipClio = null;
    cachedWipClioError = null;
    cachedRecovered = null;
    cachedRecoveredError = null;
    cachedPrevRecovered = null;
    cachedPrevRecoveredError = null;
    setWipClioData(null);
    setRecoveredData(null);
    setPrevRecoveredData(null);
  }, [userData]);

  // Separate effect to fetch recovered fees
  useEffect(() => {
    if (recoveredFeesInitialized.current) return;

    const fetchRecoveredFeesSummary = async () => {
      if (!userData?.[0]) return;

      const currentUserData = userData[0];
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isLuke = currentUserData?.Email?.toLowerCase().includes('luke') || currentUserData?.Initials === 'LW';
      const isLZ = currentUserData?.Initials === 'LZ';

      let userClioId = currentUserData?.['Clio ID'] ? String(currentUserData['Clio ID']) : null;
      let userEntraId = currentUserData?.EntraID ? String(currentUserData.EntraID) : null;

      if ((isLocalhost || isLuke || isLZ) && teamData) {
        const alex = teamData.find((t: any) => t.Initials === 'AC' || t.First === 'Alex');
        if (alex) {
          if (alex['Clio ID']) {
            userClioId = String(alex['Clio ID']);
          }
          if (alex['Entra ID']) {
            userEntraId = String(alex['Entra ID']);
          }
        }
      }

      if (!userClioId && !userEntraId) {
        return;
      }

      try {
        const url = new URL('/api/reporting/management-datasets', window.location.origin);
        url.searchParams.set('datasets', 'recoveredFeesSummary');
        if (userClioId) {
          url.searchParams.set('clioId', userClioId);
        }
        if (userEntraId) {
          url.searchParams.set('entraId', userEntraId);
        }

        const resp = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });

        if (!resp.ok) {
          console.error('❌ Failed to fetch recovered fees summary:', resp.status, resp.statusText);
          return;
        }

        const data = await resp.json();
        const summary = data.recoveredFeesSummary;

        if (!summary || typeof summary !== 'object') {
          return;
        }

        const currentTotal = Number(summary.currentMonthTotal) || 0;
        const lastTotal = Number(summary.previousMonthTotal) || 0;

        cachedRecovered = currentTotal;
        cachedPrevRecovered = lastTotal;
        setRecoveredData(currentTotal);
        setPrevRecoveredData(lastTotal);
        recoveredFeesInitialized.current = true;
      } catch (error) {
        console.error('❌ Error fetching recovered fees summary:', error);
      }
    };

    if (cachedRecovered === null) {
      fetchRecoveredFeesSummary();
    } else {
      recoveredFeesInitialized.current = true;
      setRecoveredData(cachedRecovered);
      setPrevRecoveredData(cachedPrevRecovered ?? 0);
    }
  }, [teamData, userData?.[0]?.EntraID, userData?.[0]?.['Entra ID'], userData?.[0]?.Initials, userData?.[0]?.['Clio ID']]);

  // Refresh time metrics callback - clears cache and re-fetches WIP and recovered fees
  const handleRefreshTimeMetrics = useCallback(async () => {
    if (!userData?.[0]) return;
    
    setIsRefreshingTimeMetrics(true);
    
    const currentUserData = userData[0];
    const isLocalhostEnv = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isLukeUser = currentUserData?.Email?.toLowerCase().includes('luke') || currentUserData?.Initials === 'LW';
    const isLZUser = currentUserData?.Initials === 'LZ';
    
    // Clear caches to force fresh fetch
    cachedWipClio = null;
    cachedWipClioError = null;
    cachedRecovered = null;
    cachedRecoveredError = null;
    cachedPrevRecovered = null;
    cachedPrevRecoveredError = null;
    recoveredFeesInitialized.current = false;
    
    try {
      // Fetch WIP data
      let entraId = currentUserData?.EntraID ?? currentUserData?.['Entra ID'];
      let userClioId = currentUserData?.['Clio ID'] ? String(currentUserData['Clio ID']) : null;
      let userEntraId = currentUserData?.EntraID ? String(currentUserData.EntraID) : null;
      
      // Fallback for local development or Luke/LZ: use Alex's (AC) data
      if ((isLocalhostEnv || isLukeUser || isLZUser) && teamData) {
        const alex = teamData.find((t: any) => t.Initials === 'AC' || t.First === 'Alex' || t.Email?.toLowerCase().includes('alex'));
        if (alex) {
          if (alex['Entra ID']) {
            entraId = alex['Entra ID'];
            userEntraId = String(alex['Entra ID']);
          }
          if (alex['Clio ID']) {
            userClioId = String(alex['Clio ID']);
          }
        }
      }
      
      // Parallel fetch of WIP and recovered fees
      const [wipResult, recoveredResult] = await Promise.all([
        // Fetch WIP
        (async () => {
          const url = new URL('/api/reporting/management-datasets', window.location.origin);
          url.searchParams.set('datasets', 'wipClioCurrentWeek');
          if (entraId) url.searchParams.set('entraId', entraId);
          
          const resp = await fetch(url.toString(), { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
          if (resp.ok && (resp.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
            const data = await resp.json();
            const merged = data.wipClioCurrentWeek;
            if (merged && merged.current_week && merged.last_week) {
              cachedWipClio = merged;
              setWipClioData(merged);
              setWipClioError(null);
            }
          }
        })(),
        // Fetch recovered fees
        (async () => {
          if (!userClioId && !userEntraId) return;
          
          const url = new URL('/api/reporting/management-datasets', window.location.origin);
          url.searchParams.set('datasets', 'recoveredFeesSummary');
          if (userClioId) url.searchParams.set('clioId', userClioId);
          if (userEntraId) url.searchParams.set('entraId', userEntraId);
          
          const resp = await fetch(url.toString(), { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
          if (resp.ok) {
            const data = await resp.json();
            const summary = data.recoveredFeesSummary;
            if (summary && typeof summary === 'object') {
              const currentTotal = Number(summary.currentMonthTotal) || 0;
              const lastTotal = Number(summary.previousMonthTotal) || 0;
              cachedRecovered = currentTotal;
              cachedPrevRecovered = lastTotal;
              setRecoveredData(currentTotal);
              setPrevRecoveredData(lastTotal);
              recoveredFeesInitialized.current = true;
            }
          }
        })(),
      ]);
      
      debugLog('✅ Time metrics refreshed');
    } catch (error) {
      debugWarn('❌ Error refreshing time metrics:', error);
    } finally {
      setIsRefreshingTimeMetrics(false);
    }
  }, [userData, teamData]);

  // Use app-provided normalized matters when available; otherwise normalize local allMatters
  const normalizedMatters = useMemo<NormalizedMatter[]>(() => {
    if (providedMatters && providedMatters.length > 0) return providedMatters;
    if (!allMatters) return [];
    const userFullName = userData?.[0]?.FullName || '';
    return allMatters.map(matter => normalizeMatterData(matter, userFullName, 'legacy_all'));
  }, [providedMatters, allMatters, userData]);

  const [reviewedInstructionIds, setReviewedInstructionIds] = useState<string>(() =>
    sessionStorage.getItem('reviewedInstructionIds') || ''
  );

  const getCurrentWeekKey = (): string => {
    const monday = getMondayOfCurrentWeek();
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    };
    const mondayStr = monday.toLocaleDateString('en-GB', options);
    const sundayStr = sunday.toLocaleDateString('en-GB', options);
    const mondayName = monday.toLocaleDateString('en-GB', { weekday: 'long' });
    const sundayName = sunday.toLocaleDateString('en-GB', { weekday: 'long' });
    return `${mondayName}, ${mondayStr} - ${sundayName}, ${sundayStr}`;
  };

  const getMondayOfCurrentWeek = (): Date => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday;
  };
  
  // Add these functions immediately after:
  const generateWeekKey = (monday: Date): string => {
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
    const mondayStr = monday.toLocaleDateString('en-GB', options);
    const sundayStr = sunday.toLocaleDateString('en-GB', options);
    const mondayName = monday.toLocaleDateString('en-GB', { weekday: 'long' });
    const sundayName = sunday.toLocaleDateString('en-GB', { weekday: 'long' });
    return `${mondayName}, ${mondayStr} - ${sundayName}, ${sundayStr}`;
  };
  
  const getNextWeekKey = (): string => {
    const currentMonday = getMondayOfCurrentWeek();
    const nextMonday = new Date(currentMonday);
    nextMonday.setDate(currentMonday.getDate() + 7);
    return generateWeekKey(nextMonday);
  };

  // Add the following function to update the approval state:
const handleApprovalUpdate = (updatedRequestId: string, newStatus: string) => {
  // Remove the updated approval from annualLeaveRecords.
  setAnnualLeaveRecords((prevRecords) =>
    prevRecords.filter(record => record.id !== updatedRequestId)
  );

  // Also remove it from the full set of leave data if applicable.
  setAnnualLeaveAllData((prevAllData) =>
    prevAllData.filter(record => record.id !== updatedRequestId)
  );
};

  // ADDED: userInitials logic - store in ref so it doesn't reset on re-render.
  const rawUserInitials = userData?.[0]?.Initials || '';
  useEffect(() => {
    if (rawUserInitials) {
      storedUserInitials.current = rawUserInitials;
    }
  }, [rawUserInitials]);
  // Now anywhere we used userInitials, we can do:
  const userInitials = storedUserInitials.current || rawUserInitials;

  // Rate change notification data hook - for Jan 2026 hourly rate increase
  const rateChangeYear = 2026;
  const { 
    clients: rateChangeClients, 
    stats: rateChangeStats, 
    isLoading: isLoadingRateChanges,
    refetch: refetchRateChanges,
    markSent: markRateChangeSent,
    markNA: markRateChangeNA,
    markSentStreaming: markRateChangeSentStreaming,
    markNAStreaming: markRateChangeNAStreaming,
    undo: undoRateChange,
    undoStreaming: undoRateChangeStreaming,
    pendingCountForUser: rateChangePendingCount,
  } = useRateChangeData(rateChangeYear, currentUserName, true);

  useEffect(() => {
    const fetchBankHolidays = async () => {
      try {
        const response = await fetch('https://www.gov.uk/bank-holidays.json');
        if (!response.ok) {
          throw new Error(`Failed to fetch bank holidays: ${response.status}`);
        }
        const data = await response.json();
        const currentYear = new Date().getFullYear();
        const englandAndWalesEvents = data['england-and-wales'].events || [];
        const holidaysThisYear = englandAndWalesEvents
          .filter((event: { date: string }) => new Date(event.date).getFullYear() === currentYear)
          .map((event: { date: string }) => event.date);
        setBankHolidays(new Set(holidaysThisYear));
      } catch (error) {
        console.error('Error fetching bank holidays:', error);
      }
    };
    fetchBankHolidays();
  }, []);

  useEffect(() => {
    const storedFormsFavorites = safeGetItem('formsFavorites');
    const storedResourcesFavorites = safeGetItem('resourcesFavorites');
    if (storedFormsFavorites) {
      setFormsFavorites(JSON.parse(storedFormsFavorites));
    }
    if (storedResourcesFavorites) {
      setResourcesFavorites(JSON.parse(storedResourcesFavorites));
    }
  }, []);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'formsFavorites' && event.newValue) {
        setFormsFavorites(JSON.parse(event.newValue));
      }
      if (event.key === 'resourcesFavorites' && event.newValue) {
        setResourcesFavorites(JSON.parse(event.newValue));
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (enquiries && currentUserEmail) {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  // FIX: Use Monday as the start of week (previous logic used Sunday via getDay())
  // to stay consistent with getMondayOfCurrentWeek() used elsewhere (attendance, time metrics).
  const startOfWeek = getMondayOfCurrentWeek();
  startOfWeek.setHours(0, 0, 0, 0);
      const prevToday = new Date(today);
      prevToday.setDate(prevToday.getDate() - 7);
  const prevWeekStart = new Date(startOfWeek);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7); // Monday of previous week
  prevWeekStart.setHours(0, 0, 0, 0);
    const prevWeekEnd = new Date(prevToday);
      const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

      // Normalize enquiries data like in Enquiries.tsx
      const normalizedEnquiries = enquiries.map((enq: any) => ({
        ...enq,
        ID: enq.ID || enq.id?.toString(),
        Touchpoint_Date: enq.Touchpoint_Date || enq.datetime,
        Point_of_Contact: enq.Point_of_Contact || enq.poc,
        Area_of_Work: enq.Area_of_Work || enq.aow,
        Type_of_Work: enq.Type_of_Work || enq.tow,
        Method_of_Contact: enq.Method_of_Contact || enq.moc,
        First_Name: enq.First_Name || enq.first,
        Last_Name: enq.Last_Name || enq.last,
        Email: enq.Email || enq.email,
        Phone_Number: enq.Phone_Number || enq.phone,
        Value: enq.Value || enq.value,
        Initial_first_call_notes: enq.Initial_first_call_notes || enq.notes,
        Call_Taker: enq.Call_Taker || enq.rep,
      }));

      // DEBUG: Check if admin mode is active
      const matchesUser = (enquiry: any) => {
        // Use exact email matching only - no initials matching to avoid false positives
        const pocValue = (enquiry.Point_of_Contact || '').toLowerCase().trim();
        const emailMatch = pocValue === currentUserEmail;
        
        return emailMatch;
      };

      const todayCount = normalizedEnquiries.filter((enquiry: any) => {
        const parsed = parseDateValue(enquiry.Touchpoint_Date);
        if (!parsed) return false;
        const isToday = parsed.toDateString() === today.toDateString();
        return isToday && matchesUser(enquiry);
      }).length;

        // Debug: show enquiries for this user missing IDs, grouped by week fragment (current month)
        const enquiriesMissingId = normalizedEnquiries.filter((enquiry: any) => {
          if (!matchesUser(enquiry)) return false;
          const value = enquiry.ID ?? enquiry.id;
          const parsed = parseDateValue(enquiry.Touchpoint_Date);
          if (!parsed) return false;
          return (value === undefined || value === null || String(value).trim().length === 0)
            && parsed >= startOfMonth && parsed <= today;
        });

        if (enquiriesMissingId.length > 0) {
          const rows = enquiriesMissingId.map((enquiry: any) => {
            const parsed = parseDateValue(enquiry.Touchpoint_Date);
            const wf = parsed ? formatWeekFragment(parsed) : 'n/a';
            return {
              week: wf,
              date: enquiry.Touchpoint_Date ?? enquiry.datetime ?? null,
              poc: enquiry.Point_of_Contact ?? enquiry.poc ?? null,
              email: enquiry.Email ?? enquiry.email ?? null,
              notes: enquiry.Initial_first_call_notes ?? enquiry.notes ?? null,
            };
          });
          debugLog('⚠️ Home :: enquiries missing IDs (current month, grouped by week)', rows);
        }

      const countUniqueWeeksInRange = (rangeStart: Date, rangeEnd: Date) => {
        const startBoundary = new Date(rangeStart);
        startBoundary.setHours(0, 0, 0, 0);
        const endBoundary = new Date(rangeEnd);
        endBoundary.setHours(23, 59, 59, 999);
        const seen = new Set<string>();
        let total = 0;
        for (const enquiry of normalizedEnquiries) {
          const enquiryDate = parseDateValue(enquiry.Touchpoint_Date);
          if (!enquiryDate) continue;
          if (enquiryDate < startBoundary || enquiryDate > endBoundary) continue;
          if (!matchesUser(enquiry)) continue;

          const rawId = enquiry.ID ?? enquiry.id ?? '';
          const id = rawId ? String(rawId).trim() : '';
          const weekFragment = formatWeekFragment(enquiryDate);

          if (!id) {
            total += 1;
            continue;
          }

          const key = `${id}|${weekFragment}`;
          if (!seen.has(key)) {
            seen.add(key);
            total += 1;
          }
        }
        return total;
      };

      const weekToDateCount = countUniqueWeeksInRange(startOfWeek, today);
      const monthToDateCount = countUniqueWeeksInRange(startOfMonth, today);

      const prevTodayCount = normalizedEnquiries.filter((enquiry: any) => {
        const parsed = parseDateValue(enquiry.Touchpoint_Date);
        return parsed && parsed.toDateString() === prevToday.toDateString() && matchesUser(enquiry);
      }).length;

      const prevWeekCount = countUniqueWeeksInRange(prevWeekStart, prevWeekEnd);
      const prevMonthCount = countUniqueWeeksInRange(prevMonthStart, prevMonthEnd);

      setEnquiriesToday(todayCount);
      setEnquiriesWeekToDate(weekToDateCount);
      setEnquiriesMonthToDate(monthToDateCount);
      setPrevEnquiriesToday(prevTodayCount);
      setPrevEnquiriesWeekToDate(prevWeekCount);
      setPrevEnquiriesMonthToDate(prevMonthCount);
    }
  }, [enquiries, currentUserEmail, userInitials]);

  useEffect(() => {
    // Always restore from cache on mount if available
    if (cachedAttendance) {
      setAttendanceRecords(cachedAttendance.attendance); // Use .attendance here
      setAttendanceTeam(cachedAttendance.team || []);    // Safe now with proper type
    }
    if (cachedAttendanceError) {
      setAttendanceError(cachedAttendanceError);
    }
    if (cachedAnnualLeave) {
      setAnnualLeaveRecords(cachedAnnualLeave);
    }
    if (cachedFutureLeaveRecords) {
      setFutureLeaveRecords(cachedFutureLeaveRecords);
    }
    if (cachedAnnualLeaveError) {
      setAnnualLeaveError(cachedAnnualLeaveError);
    }
    // Set loading states to false if we have cached data
    if (cachedAttendance || cachedAttendanceError) {
      setIsLoadingAttendance(false);
    }
    if (cachedAnnualLeave || cachedAnnualLeaveError) {
      setIsLoadingAnnualLeave(false);
      setIsActionsLoading(false);
    }

    if (useLocalData) {
      const currentMonday = getMondayOfCurrentWeek();
      const nextMonday = new Date(currentMonday);
      nextMonday.setDate(currentMonday.getDate() + 7);

      const currentKey = generateWeekKey(currentMonday);
      const nextKey = generateWeekKey(nextMonday);

      // Optimized: structuredClone is 90% faster than JSON.parse(JSON.stringify())
      const localCopy: any = structuredClone(localAttendance);
      if (Array.isArray(localCopy.attendance)) {
        localCopy.attendance.forEach((rec: any) => {
          rec.weeks = rec.weeks || {};
          if (!rec.weeks[currentKey]) {
            rec.weeks[currentKey] = {
              iso: getISOWeek(currentMonday),
              attendance: 'Mon,Tue,Wed,Thu,Fri',
              confirmed: true,
            };
          }
          if (!rec.weeks[nextKey]) {
            rec.weeks[nextKey] = {
              iso: getISOWeek(nextMonday),
              attendance: 'Mon,Tue,Wed,Thu,Fri',
              confirmed: true,
            };
          }
        });
      }

      setAttendanceRecords(localCopy.attendance || []);
      setAttendanceTeam(localCopy.team || []);
      setAnnualLeaveRecords((localAnnualLeave as any).annual_leave || []);
      setFutureLeaveRecords((localAnnualLeave as any).future_leave || []);
      setAnnualLeaveAllData((localAnnualLeave as any).all_data || []);
      setAnnualLeaveTeam((localAnnualLeave as any).team || []);
      if ((localAnnualLeave as any).user_details?.totals) {
        setAnnualLeaveTotals((localAnnualLeave as any).user_details.totals);
      }
      setIsLoadingAttendance(false);
      setIsLoadingAnnualLeave(false);
      setIsActionsLoading(false);
      return;
    }
    // Only fetch if no cached data exists
    if (!cachedAttendance && !cachedAttendanceError) {
      const fetchData = async () => {
        try {
          setIsLoadingAttendance(true);
          const attendanceResponse = await fetch('/api/attendance/getAttendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (!attendanceResponse.ok) {
            throw new Error(`Failed to fetch attendance: ${attendanceResponse.status}`);
          }
          
          const attendanceResult = await attendanceResponse.json();
          
          if (attendanceResult.success) {
            // API returns:
            // - attendance: [{ First, Initials, Status, Week_Start, ... }] (new format)
            // - team: [{ First, Initials, Nickname, Status }]
            // The attendance array already has the data we need in the new format
            
            // Transform attendance records
            const transformedAttendance: any[] = [];
            (attendanceResult.attendance || []).forEach((member: any) => {
              // New format - member already has First, Initials, Status, Week_Start, etc.
              transformedAttendance.push({
                Attendance_ID: 0,
                Entry_ID: 0,
                First_Name: member.First || member.name || '',
                Initials: member.Initials || '',
                Nickname: member.Nickname || member.First || '',
                Level: member.Level || '',
                Week_Start: member.Week_Start ? new Date(member.Week_Start).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                Week_End: member.Week_End ? new Date(member.Week_End).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                ISO_Week: typeof member.iso === 'number' ? member.iso : 0,
                Attendance_Days: member.Status || '',
                Confirmed_At: member.Confirmed_At ?? null,
                status: member.Status || '',
                isConfirmed: Boolean(member.Confirmed_At),
                isOnLeave: member.IsOnLeave === 1 || member.IsOnLeave === true
              });
            });
            
            const transformedData = {
              attendance: transformedAttendance,
              team: attendanceResult.team || []
            };
            
            cachedAttendance = transformedData;
            setAttendanceRecords(transformedData.attendance);
            setAttendanceTeam(transformedData.team);
          } else {
            throw new Error(attendanceResult.error || 'Failed to fetch attendance');
          }
        } catch (error: any) {
          console.error('Error fetching attendance:', error);
          cachedAttendanceError = error.message || 'Unknown error occurred.';
          setAttendanceError(error.message || 'Unknown error occurred.');
          setAttendanceRecords([]);
          setAttendanceTeam([]);
        } finally {
          setIsLoadingAttendance(false);
        }
  
        try {
          setIsLoadingAnnualLeave(true);
          const annualLeaveResponse = await fetch(
            `/api/attendance/getAnnualLeave`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userInitials: userData[0]?.Initials || '' }),
            }
          );
          if (!annualLeaveResponse.ok)
            throw new Error(`Failed to fetch annual leave: ${annualLeaveResponse.status}`);
          const annualLeaveData = await annualLeaveResponse.json();
          if (annualLeaveData) {
            // Handle annual leave records
            if (Array.isArray(annualLeaveData.annual_leave)) {
              const mappedAnnualLeave: AnnualLeaveRecord[] = annualLeaveData.annual_leave.map(
                (rec: any) => ({
                  person: rec.person,
                  start_date: rec.start_date,
                  end_date: rec.end_date,
                  reason: rec.reason,
                  status: rec.status,
                  id: rec.request_id ? String(rec.request_id) : rec.id || `temp-${rec.start_date}-${rec.end_date}`,
                  days_taken: typeof rec.days_taken === 'number' ? rec.days_taken : undefined,
                  leave_type: rec.leave_type || undefined,
                  rejection_notes: rec.rejection_notes || undefined,
                  approvers: rec.approvers || [],
                  hearing_confirmation: rec.hearing_confirmation,
                  hearing_details: rec.hearing_details || undefined,
                })
              );
              cachedAnnualLeave = mappedAnnualLeave;
              setAnnualLeaveRecords(mappedAnnualLeave);
            } else {
              // No annual leave records, set empty array
              setAnnualLeaveRecords([]);
            }
  
            // Handle future leave records  
            if (Array.isArray(annualLeaveData.future_leave)) {
              const mappedFutureLeave: AnnualLeaveRecord[] = annualLeaveData.future_leave.map(
                (rec: any) => ({
                  person: rec.person,
                  start_date: rec.start_date,
                  end_date: rec.end_date,
                  reason: rec.reason,
                  status: rec.status,
                  id: rec.request_id ? String(rec.request_id) : rec.id || `temp-${rec.start_date}-${rec.end_date}`,
                  days_taken: typeof rec.days_taken === 'number' ? rec.days_taken : undefined,
                  leave_type: rec.leave_type || undefined,
                  rejection_notes: rec.rejection_notes || undefined,
                  approvers: rec.approvers || [],
                  hearing_confirmation: rec.hearing_confirmation,
                  hearing_details: rec.hearing_details || undefined,
                })
              );
              cachedFutureLeaveRecords = mappedFutureLeave;
              setFutureLeaveRecords(mappedFutureLeave);
            } else {
              // No future leave records, set empty array
              setFutureLeaveRecords([]);
            }
  
            // Handle optional data
            if (annualLeaveData.user_details && annualLeaveData.user_details.totals) {
              setAnnualLeaveTotals(annualLeaveData.user_details.totals);
            }
            // Use all_data (all team members) instead of user_leave (only current user)
            if (annualLeaveData.all_data) {
              setAnnualLeaveAllData(annualLeaveData.all_data);
            }

            // Store team entitlement data (Initials + holiday_entitlement)
            if (Array.isArray(annualLeaveData.team)) {
              setAnnualLeaveTeam(annualLeaveData.team);
            } else {
              setAnnualLeaveTeam([]);
            }
          } else {
            // Handle null/undefined response by setting empty arrays
            debugWarn('No annual leave data returned from API');
            setAnnualLeaveRecords([]);
            setFutureLeaveRecords([]);
          }
        } catch (error: any) {
          console.error('Error fetching annual leave:', error);
          cachedAnnualLeaveError = error.message || 'Unknown error occurred.';
          setAnnualLeaveError(error.message || 'Unknown error occurred.');
          setAnnualLeaveRecords([]);
        } finally {
          setIsLoadingAnnualLeave(false);
          setIsActionsLoading(false);
        }
      };
      fetchData();
    }
  }, [userData]);

  // Prefer reporting route for current-week WIP (backend merges DB and Clio); do not call Clio from client
  useEffect(() => {
    if (!userData?.[0]) {
      debugLog('⏸️ Skipping WIP fetch until user data is available');
      return;
    }
    const effectiveEntraId = userData?.[0]?.EntraID ?? userData?.[0]?.['Entra ID'] ?? null;
    debugLog('🎯 WIP useEffect triggered', { 
      entraId: effectiveEntraId, 
      clioId: userData?.[0]?.['Clio ID'],
      hasCachedWip: !!cachedWipClio,
      useLocalData
    });
    
    const loadFromReporting = async () => {
      debugLog('🔄 loadFromReporting called');
      try {
        setIsLoadingWipClio(true);
  // Fetch only the current-week WIP dataset; recovered fees handled separately
        const url = new URL('/api/reporting/management-datasets', window.location.origin);
  url.searchParams.set('datasets', 'wipClioCurrentWeek');
        debugLog('📡 Fetching URL:', url.toString());
        
        // Pass current user's Entra ID for user-specific Clio data fetching
        const currentUserData = userData?.[0];
  let entraId = currentUserData?.EntraID ?? currentUserData?.['Entra ID'];
        
        // Fallback for local development or Luke/LZ: use Alex's (AC) data for visible metrics
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const isLuke = currentUserData?.Email?.toLowerCase().includes('luke') || currentUserData?.Initials === 'LW';
        const isLZ = currentUserData?.Initials === 'LZ';
        
        if ((isLocalhost || isLuke || isLZ) && teamData) {
          const alex = teamData.find((t: any) => t.Initials === 'AC' || t.First === 'Alex' || t.Email?.toLowerCase().includes('alex'));
          if (alex && alex['Entra ID']) {
            entraId = alex['Entra ID'];
            debugLog('🔧 Dev mode: Using Alex\'s data for visible metrics', { originalUser: currentUserData?.Email, fallbackTo: alex.Email });
          }
        }
        
        if (entraId) {
          url.searchParams.set('entraId', entraId);
          debugLog('🔍 Requesting WIP data for user:', { entraId, email: currentUserData?.Email });
        }
        const resp = await fetch(url.toString(), { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
        if (resp.ok && (resp.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
          const data = await resp.json();
          // Debug the actual response structure
          debugLog('🔍 API Response:', { 
            hasWipClio: !!data.wipClioCurrentWeek,
            dataKeys: Object.keys(data)
          });
          
          // Extract the wipClioCurrentWeek data directly
          const merged = data.wipClioCurrentWeek;
          if (merged && merged.current_week && merged.last_week) {
            cachedWipClio = merged as any;
            setWipClioData(cachedWipClio);
            setWipClioError(null);
            setIsLoadingWipClio(false);
            debugLog('✅ WIP data loaded successfully');
          } else {
            debugWarn('⚠️ WIP data structure invalid:', { merged, hasCurrentWeek: !!merged?.current_week, hasLastWeek: !!merged?.last_week });
          }
          
        }
      } catch (e) {
        debugWarn('❌ Error loading WIP data:', e);
      }
      // If no data returned, ensure we clear loading state to let UI render placeholders
      setIsLoadingWipClio(false);
    };

    // Use cache if already set
    if (cachedWipClio || cachedWipClioError) {
      debugLog('📦 Using cached WIP data');
      setWipClioData(cachedWipClio);
      setWipClioError(cachedWipClioError);
      setIsLoadingWipClio(false);
      // Also restore cached recovered fees if available
      if (cachedRecovered !== null) {
        debugLog('💰 Restoring cached recovered fees:', { current: cachedRecovered, prev: cachedPrevRecovered });
        setRecoveredData(cachedRecovered);
        setPrevRecoveredData(cachedPrevRecovered ?? 0);
      }
    } else if (useLocalData) {
      debugLog('📂 Using local WIP data');
      cachedWipClio = localWipClio as any;
      setWipClioData(cachedWipClio);
      setIsLoadingWipClio(false);
    } else {
      debugLog('🌐 Fetching fresh WIP data from server');
      // Add a hard timeout to avoid blocking TimeMetricsV2 if backend is slow
      const timeout = setTimeout(() => {
        if (isLoadingWipClio && !cachedWipClio) {
          setIsLoadingWipClio(false);
        }
      }, 8000);
      loadFromReporting().finally(() => clearTimeout(timeout));
    }
  }, [userData?.[0]?.EntraID, userData?.[0]?.['Entra ID'], userData?.[0]?.['Clio ID']]);

  // Home no longer fetches matters itself; it receives normalized matters from App.
  // Keep the effect boundary to clear local cache if that logic remains elsewhere.
  useEffect(() => {
    const fullName = userData?.[0]?.FullName || '';
    const initials = userData?.[0]?.Initials || '';
    if (fullName || initials) {
      cachedAllMatters = null;
      cachedAllMattersError = null;
    }
  }, [userData?.[0]?.FullName, userData?.[0]?.Initials, userData?.[0]?.First, userData?.[0]?.Last]);

  useEffect(() => {
    // Check if cache should be invalidated due to database changes
    const lastCacheVersion = safeGetItem('matters-cache-version');
    const currentCacheVersion = 'v2-2025-09-21-db-cleanup';
    
    if (lastCacheVersion !== currentCacheVersion) {
      debugLog('🔄 Invalidating matters cache due to database changes');
      cachedAllMatters = null;
      cachedAllMattersError = null;
      
      // Log storage usage before attempting to set cache version
      logStorageUsage();
      
      // Use safe storage with automatic cleanup if needed
      const success = safeSetItem('matters-cache-version', currentCacheVersion);
      if (!success) {
        debugWarn('⚠️ Could not update cache version in localStorage');
      }
    }
    
    debugLog('🔍 Matters loading path check:', {
      hasCachedMatters: !!cachedAllMatters,
      hasCachedError: !!cachedAllMattersError,
      useLocalData,
      REACT_APP_USE_LOCAL_DATA: process.env.REACT_APP_USE_LOCAL_DATA
    });
    
    // Respect cached values if present otherwise rely on top-level provider
    if (cachedAllMatters || cachedAllMattersError) {
      debugLog('📦 Using cached matters:', cachedAllMatters?.length || 0);
      setAllMatters(cachedAllMatters || []);
      setAllMattersError(cachedAllMattersError);
    } else if (useLocalData) {
      debugLog('🏠 Using local mock data');
      const mappedMatters: Matter[] = (localMatters as any) as Matter[];
      cachedAllMatters = mappedMatters;
      setAllMatters(mappedMatters);
      if (onAllMattersFetched) onAllMattersFetched(mappedMatters);
    }
    setIsLoadingAllMatters(false);
  }, [userData?.[0]?.FullName, useLocalData]);

  // POID6Years: Stream handles this; only use cache for instant display
  useEffect(() => {
    if (cachedPOID6Years) {
      setPoid6Years(cachedPOID6Years);
      setIsLoadingPOID6Years(false);
      onPOID6YearsFetched?.(cachedPOID6Years);
    }
  }, []);  

  // Future bookings: Stream handles this now (removed duplicate fetch)

  // Stream Home metrics progressively; update state as each arrives
  useHomeMetricsStream({
    autoStart: true,
    metrics: ['transactions', 'futureBookings', 'outstandingBalances', 'poid6Years'],
    bypassCache: false,
    onMetric: (name, data) => {
      switch (name) {
        case 'transactions':
          cachedTransactions = data as any;
          setTransactions(data as any);
          onTransactionsFetched?.(data as any);
          break;
        case 'futureBookings':
          setFutureBookings(data as any);
          onBoardroomBookingsFetched?.((data as any).boardroomBookings || []);
          onSoundproofBookingsFetched?.((data as any).soundproofBookings || []);
          break;
        case 'outstandingBalances':
          cachedOutstandingBalances = data as any;
          safeSetItem('outstandingBalancesData', JSON.stringify(data));
          setOutstandingBalancesData(data as any);
          onOutstandingBalancesFetched?.(data as any);
          break;
        case 'poid6Years':
          setPoid6Years(data as any);
          onPOID6YearsFetched?.(data as any);
          break;
        default:
          break;
      }
    },
    onError: (which, err) => {
      console.warn('Home metrics stream error:', which, err);
    },
  });

  // Transactions: Only fetch if using local data (stream handles live data)
  useEffect(() => {
    if (useLocalData) {
      const data: Transaction[] = (localTransactions as any) as Transaction[];
      cachedTransactions = data;
      setTransactions(data);
      onTransactionsFetched?.(data);
    }
  }, [useLocalData]);
  

  // Outstanding Balances: Only load from localStorage/local data (stream handles live fetch)
  useEffect(() => {
    // Load from localStorage for instant display while stream fetches fresh
    const storedData = safeGetItem('outstandingBalancesData');
    if (storedData) {
      const parsedData = JSON.parse(storedData);
      onOutstandingBalancesFetched?.(parsedData);
      setOutstandingBalancesData(parsedData);
    }

    if (useLocalData) {
      const data = localOutstandingBalances as any;
      cachedOutstandingBalances = data;
      onOutstandingBalancesFetched?.(data);
      setOutstandingBalancesData(data);
    }
  }, [useLocalData]);  

  const columns = useMemo(() => createColumnsFunction(isDarkMode), [isDarkMode]);

// --- Updated Confirm Attendance snippet ---

// 1. Grab user’s initials from userData (Now done via rawUserInitials + storedUserInitials above)
const matchingTeamMember = attendanceTeam.find(
  (member: any) => (member.Initials || '').toLowerCase() === userInitials.toLowerCase()
);

const attendanceName = matchingTeamMember ? matchingTeamMember.First : '';

const currentUserRecord = attendanceRecords.find(
  (record: any) => (record.Initials || '').toLowerCase() === userInitials.toLowerCase()
);

//////////////////////////////
// Updated Confirmation Check
//////////////////////////////
const now = new Date();
const isThursdayAfterMidday = now.getDay() === 4 && now.getHours() >= 12;
  const currentKey = generateWeekKey(getMondayOfCurrentWeek());
  const nextKey = getNextWeekKey();

const transformedAttendanceRecords = useMemo(() => {
  console.log('[transformedAttendanceRecords] Recomputing. attendanceRecords count:', attendanceRecords.length);
  // Use attendanceRecords directly - it's the source of truth for React state
  // The cache is only for preventing re-fetches, not for rendering
  if (!attendanceRecords.length) return [];
  
  // Records should already be in the correct format from the fetch handler
  // Just pass them through, ensuring required fields are present
  const result = attendanceRecords
    .map((record: any) => {
      // If record already has the correct structure, pass through
      if (record.Initials && record.Attendance_Days !== undefined) {
        return record;
      }
      
      // Fallback transformation for any legacy format
      return {
        Attendance_ID: record.Attendance_ID || 0,
        Entry_ID: record.Entry_ID || 0,
        First_Name: record.First_Name || record.First || record.name || '',
        Initials: record.Initials || '',
        Level: record.Level || '',
        Week_Start: record.Week_Start || new Date().toISOString().split('T')[0],
        Week_End: record.Week_End || new Date().toISOString().split('T')[0],
        ISO_Week: record.ISO_Week || 0,
        Attendance_Days: record.Attendance_Days || record.Status || '',
        Confirmed_At: record.Confirmed_At ?? null,
        status: record.status || record.Status || '',
        isConfirmed: record.isConfirmed || Boolean(record.Confirmed_At),
        isOnLeave: record.isOnLeave || false
      };
    });
  
  console.log('[transformedAttendanceRecords] Result count:', result.length);
  return result;
}, [attendanceRecords, transformedTeamData]);

const handleAttendanceUpdated = (updatedRecords: AttendanceRecord[]) => {
  console.log('[handleAttendanceUpdated] Called with records:', updatedRecords.length, updatedRecords.map(r => ({ Initials: r.Initials, Week_Start: r.Week_Start, Attendance_Days: r.Attendance_Days })));
  if (updatedRecords.length === 0) {
    console.log('[handleAttendanceUpdated] No records to update');
    return;
  }
  
  // Helper to normalize date strings for comparison (extract YYYY-MM-DD)
  const normalizeDate = (dateStr: string): string => {
    if (!dateStr) return '';
    // Handle both '2025-12-15' and '2025-12-15T00:00:00.000Z' formats
    return dateStr.substring(0, 10);
  };
  
  setAttendanceRecords((prevRecords) => {
    console.log('[handleAttendanceUpdated] prevRecords count:', prevRecords.length);
    const newRecords = [...prevRecords];
    let isChanged = false;

    updatedRecords.forEach((updated) => {
      const updatedWeekStart = normalizeDate(updated.Week_Start);
      
      // Find by Initials and Week_Start (normalized) - the actual record structure
      const index = newRecords.findIndex(
        (rec: any) => rec.Initials === updated.Initials && normalizeDate(rec.Week_Start) === updatedWeekStart
      );
      
      console.log('[handleAttendanceUpdated] Looking for:', { Initials: updated.Initials, Week_Start: updatedWeekStart }, 'Found at index:', index);
      
      if (index !== -1) {
        // Update existing record
        const currentRecord = newRecords[index];
        console.log('[handleAttendanceUpdated] Current record Attendance_Days:', currentRecord.Attendance_Days);
        console.log('[handleAttendanceUpdated] Updated record Attendance_Days:', updated.Attendance_Days);
        if (currentRecord.Attendance_Days !== updated.Attendance_Days || 
            currentRecord.Confirmed_At !== updated.Confirmed_At) {
          newRecords[index] = {
            ...currentRecord,
            ...updated,
            // Preserve the original date format from the existing record
            Week_Start: currentRecord.Week_Start,
          };
          isChanged = true;
          console.log('[handleAttendanceUpdated] Updated existing record:', updated.Initials, updatedWeekStart, '-> New Attendance_Days:', updated.Attendance_Days);
        } else {
          console.log('[handleAttendanceUpdated] Record unchanged - same values');
        }
      } else {
        // Add new record - normalize the Week_Start to date-only format
        newRecords.push({
          ...updated,
          Week_Start: updatedWeekStart,
        });
        isChanged = true;
        console.log('[handleAttendanceUpdated] Added new record:', updated.Initials, updatedWeekStart);
      }
    });

    if (!isChanged) {
      debugLog('No attendance changes; state unchanged');
      return prevRecords;
    }

    // Update cache
    cachedAttendance = {
      attendance: newRecords,
      team: cachedAttendance?.team || attendanceTeam,
    };

    debugLog('Attendance state updated; size:', newRecords.length);
    return newRecords;
  });
};

// Wrapper used by top-level AttendanceConfirmPanel to save attendance for the current user.
// Note: Toast notification is triggered by the caller (PersonalAttendanceConfirm) after all saves complete
  const saveAttendance = async (weekStart: string, attendanceDays: string): Promise<void> => {
  debugLog('saveAttendance', weekStart, attendanceDays);
  // Force endpoint testing - set to false to test real endpoint
  const useLocalData = false; // Changed from: process.env.REACT_APP_USE_LOCAL_DATA === 'true' || window.location.hostname === 'localhost';
  debugLog('useLocalData:', useLocalData);
  const initials = userInitials || (userData?.[0]?.Initials || '');
  const firstName = (transformedTeamData.find((t) => t.Initials === initials)?.First) || '';
  debugLog('user initials/name:', initials, firstName);

  if (useLocalData) {
  debugLog('Using local data mode - creating mock record');
    const newRecord: AttendanceRecord = {
      Attendance_ID: 0,
      Entry_ID: 0,
      First_Name: firstName,
      Initials: initials,
  Level: (attendanceTeam.find((t: any) => t.Initials === initials)?.Level) || '',
      Week_Start: weekStart,
      Week_End: new Date(new Date(weekStart).setDate(new Date(weekStart).getDate() + 6)).toISOString().split('T')[0],
  ISO_Week: getISOWeek(new Date(weekStart)),
      Attendance_Days: attendanceDays,
      Confirmed_At: new Date().toISOString(),
    };
    // Reuse existing handler to merge into state
    debugLog('Calling handleAttendanceUpdated with 1 record');
    handleAttendanceUpdated([newRecord]);
    debugLog('Local data save completed');
    return;
  }

  try {
    const url = `/api/attendance/updateAttendance`;
    const payload = { initials, weekStart, attendanceDays };
  debugLog('API call:', url, payload);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  debugLog('API status:', res.status);
    if (!res.ok) {
      console.error('🔍 API call failed with status:', res.status);
      throw new Error(`Failed to save attendance: ${res.status}`);
    }
    const json = await res.json();
  debugLog('API json:', json);
    if (!json || json.success !== true || !json.record) {
      throw new Error('Unexpected response from updateAttendance');
    }
    const rec = json.record;
    const mapped: AttendanceRecord = {
      Attendance_ID: rec.Attendance_ID ?? 0,
      Entry_ID: rec.Entry_ID ?? 0,
      First_Name: rec.First_Name || firstName,
      Initials: rec.Initials || initials,
      Level: (attendanceTeam.find((t: any) => t.Initials === (rec.Initials || initials))?.Level) || '',
      Week_Start: rec.Week_Start || weekStart,
      Week_End: rec.Week_End || new Date(new Date(weekStart).setDate(new Date(weekStart).getDate() + 6)).toISOString().split('T')[0],
      ISO_Week: rec.ISO_Week ?? getISOWeek(new Date(rec.Week_Start || weekStart)),
      Attendance_Days: rec.Attendance_Days || attendanceDays,
      Confirmed_At: rec.Confirmed_At || new Date().toISOString(),
    };
    handleAttendanceUpdated([mapped]);
    // Note: Toast is shown by PersonalAttendanceConfirm after all weeks are saved
  } catch (err) {
    console.error('Error saving attendance (home):', err);
    // Optional local fallback for testing
    const fallbackLocal = process.env.REACT_APP_ATTENDANCE_FALLBACK_LOCAL === 'true';
    if (fallbackLocal) {
      debugWarn('⚠️ Falling back to local attendance update');
      const newRecord: AttendanceRecord = {
        Attendance_ID: 0,
        Entry_ID: 0,
        First_Name: firstName,
        Initials: initials,
        Level: (attendanceTeam.find((t: any) => t.Initials === initials)?.Level) || '',
        Week_Start: weekStart,
        Week_End: new Date(new Date(weekStart).setDate(new Date(weekStart).getDate() + 6)).toISOString().split('T')[0],
        ISO_Week: getISOWeek(new Date(weekStart)),
        Attendance_Days: attendanceDays,
        Confirmed_At: new Date().toISOString(),
      };
      handleAttendanceUpdated([newRecord]);
      return; // treat as success in UI
    }
    // Show error toast immediately on failure
    showToast('Failed to save attendance', 'error', err instanceof Error ? err.message : 'Please try again');
    // Bubble error so caller can show inline feedback
    throw (err instanceof Error ? err : new Error('Failed to save attendance'));
  }
};


// Decide which week we consider "the relevant week"
  const relevantWeekKey = isThursdayAfterMidday ? nextKey : currentKey;

// Does the user have an object at all for that week?
  // Use checkIsLocalDev - respects "View as Production" toggle
  const isLocalhost = checkIsLocalDev(featureToggles);

  // Does the user have an object at all for that week?
  // If currentUserRecord is not found (user not in attendance data), treat as confirmed to avoid nagging  
  // Check if the user has confirmed their attendance (has a Confirmed_At timestamp)
  const currentUserConfirmed = isLocalhost || !currentUserRecord || !!currentUserRecord?.Confirmed_At;

  // Debug logging for instructionData changes
  // Calculate actionable instruction summaries (needs isLocalhost)
  const actionableSummaries = useMemo(() => {
    const result = getActionableInstructions(instructionData, isLocalhost);
    return result;
  }, [instructionData, isLocalhost]);

  const actionableInstructionIds = useMemo(
    () => actionableSummaries.map(s => s.id).sort().join(','),
    [actionableSummaries]
  );

  const instructionsActionDone =
    reviewedInstructionIds === actionableInstructionIds && actionableInstructionIds !== '';

const officeAttendanceButtonText = currentUserConfirmed
  ? 'Update Attendance'
  : 'Confirm Attendance';

  const today = new Date();
  const formatDateLocal = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const formattedToday = formatDateLocal(today);
  const columnsForPeople = 3;

  const isPersonOutToday = (person: Person): boolean => {
    const todayStr = formatDateLocal(new Date());
    return annualLeaveRecords.some((leave) => {
      if (leave.status !== 'booked') return false;
      if (leave.person.trim().toLowerCase() !== person.initials.trim().toLowerCase()) return false;
      return todayStr >= leave.start_date && todayStr <= leave.end_date;
    });
  };

  const allPeople = useMemo(() => {
    if (!attendanceTeam || attendanceTeam.length === 0) return [];
  
    return attendanceTeam
      .sort((a: any, b: any) => a.First.localeCompare(b.First))
      .map((t: any) => {
        const att = attendanceRecords.find(
          (record: any) => (record.name || '').toLowerCase() === (t.First || '').toLowerCase()
        );
        const attending = att ? att.attendingToday : false;
  
        return {
          id: t.Initials,
          name: t.First,
          initials: t.Initials,
          presence: attending ? PersonaPresence.online : PersonaPresence.none,
          nickname: t.Nickname || t.First,
        };
      });
  }, [attendanceTeam, attendanceRecords]);

  const normalizeName = (name: string | null | undefined): string => {
    if (!name) return '';
    let normalized = name.trim().toLowerCase();
    if (normalized === "bianca odonnell") {
      normalized = "bianca o'donnell";
    }
    if (normalized === "samuel packwood") {
      normalized = "sam packwood";
    }
    return normalized;
  };
  
  const { name: metricsName, clioId: metricsClioId } = getMetricsAlias(
    userData?.[0]?.["Full Name"],
    userData?.[0]?.Initials,
    userData?.[0]?.["Clio ID"]
  );

  // IMPORTANT: For outstanding balances, use the actual current user's name
  // (metricsName is an alias used for time/fees metrics demos and can skew ownership).
  let userResponsibleName = (userData?.[0]?.FullName || userData?.[0]?.["Full Name"] || '').trim() || metricsName;
  
  // Override for localhost only (dev testing)
  if (window.location.hostname === 'localhost') {
    userResponsibleName = 'Alex Cook';
  }
  
  const userMatterIDs = useMemo(() => {
    if (!normalizedMatters || normalizedMatters.length === 0) return [];
    return normalizedMatters
      .filter((matter) =>
        normalizeName(matter.responsibleSolicitor) === normalizeName(userResponsibleName)
      )
      .map((matter) => {
        const numericId = Number(matter.matterId);
        return isNaN(numericId) ? null : numericId;
      })
      .filter((id): id is number => id !== null);
  }, [normalizedMatters, userResponsibleName]);

  const myOutstandingBalances = useMemo(() => {
    if (!outstandingBalancesData?.data || userMatterIDs.length === 0) return [];
    return outstandingBalancesData.data.filter((bal: any) =>
      bal.associated_matter_ids.some((id: number | string) => userMatterIDs.includes(Number(id)))
    );
  }, [outstandingBalancesData, userMatterIDs]);

  const [isOutstandingPanelOpen, setIsOutstandingPanelOpen] = useState(false);
  const [showOnlyMine, setShowOnlyMine] = useState(true); // Changed default to true

    // Create a derived variable mapping the raw outstanding balances data into MatterBalance[]
    const outstandingBalancesList = useMemo<OutstandingClientBalance[]>(() => {
      if (outstandingBalancesData && outstandingBalancesData.data) {
        return outstandingBalancesData.data.map((record: any) => ({
          id: record.id,
          created_at: record.created_at,
          updated_at: record.updated_at,
          associated_matter_ids: record.associated_matter_ids,
          contact: record.contact,
          total_outstanding_balance: record.total_outstanding_balance,
          last_payment_date: record.last_payment_date,
          last_shared_date: record.last_shared_date,
          newest_issued_bill_due_date: record.newest_issued_bill_due_date,
          pending_payments_total: record.pending_payments_total,
          reminders_enabled: record.reminders_enabled,
          currency: record.currency,
          outstanding_bills: record.outstanding_bills,
        }));
      }
      return [];
    }, [outstandingBalancesData]);

// Create a filtered list for the Outstanding Balances panel.
const filteredBalancesForPanel = useMemo<OutstandingClientBalance[]>(() => {
  if (!outstandingBalancesData || !outstandingBalancesData.data) {
    return [];
  }
  const allBalances: OutstandingClientBalance[] = outstandingBalancesData.data.map((record: any) => ({
    id: record.id,
    created_at: record.created_at,
    updated_at: record.updated_at,
    associated_matter_ids: record.associated_matter_ids,
    contact: record.contact,
    total_outstanding_balance: record.total_outstanding_balance,
    last_payment_date: record.last_payment_date,
    last_shared_date: record.last_shared_date,
    newest_issued_bill_due_date: record.newest_issued_bill_due_date,
    pending_payments_total: record.pending_payments_total,
    reminders_enabled: record.reminders_enabled,
    currency: record.currency,
    outstanding_bills: record.outstanding_bills,
  }));
  if (showOnlyMine && userMatterIDs.length > 0) {
    return allBalances.filter((balance) =>
  balance.associated_matter_ids.some((id: number | string) => userMatterIDs.includes(Number(id)))
    );
  }
  return allBalances;
}, [outstandingBalancesData, showOnlyMine, userMatterIDs]);

    const outstandingTotal = useMemo(() => {
      if (!outstandingBalancesData || !outstandingBalancesData.data) {
        return null; // Data not ready yet
      }
      // Strictly sum only balances for the current user's matters
      if (userMatterIDs.length === 0) return 0;
      return myOutstandingBalances.reduce(
        (sum: number, record: any) => sum + (Number(record.total_outstanding_balance) || 0),
        0
      );
    }, [outstandingBalancesData, userMatterIDs, myOutstandingBalances]);

    const firmOutstandingTotal = useMemo(() => {
      if (!outstandingBalancesData || !outstandingBalancesData.data) {
        return null; // Data not ready yet
      }
      // Sum all outstanding balances for the entire firm
      return outstandingBalancesData.data.reduce(
        (sum: number, record: any) => sum + (Number(record.total_outstanding_balance) || 0),
        0
      );
    }, [outstandingBalancesData]);

  // Removed no-op effect that could trigger unnecessary renders
  // useEffect(() => {}, [userMatterIDs, outstandingBalancesData]);

  const metricsData = useMemo(() => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
  
    // Define user details only once
    const userFirstName = userData?.[0]?.First?.trim().toLowerCase() || '';
    const userLastName = userData?.[0]?.Last?.trim().toLowerCase() || '';
    const userFullName =
      userData?.[0]?.FullName?.trim().toLowerCase() || `${userFirstName} ${userLastName}`;
    const userInitials = userData?.[0]?.Initials?.trim().toLowerCase() || '';
    const memberForInitials = transformedTeamData.find(
      (t) => (t.Initials || '').toLowerCase() === userInitials
    );
    const userNickname = memberForInitials?.Nickname?.trim().toLowerCase() || '';
  
    // Helper function to normalize names
    const normalizeName = (name: string | null | undefined): string => {
      if (!name) return '';
      let normalized = String(name).trim().toLowerCase();
      // Handle "Last, First" -> "first last"
      if (normalized.includes(',')) {
        const [last, first] = normalized.split(',').map(p => p.trim());
        if (first && last) normalized = `${first} ${last}`;
      }
  // Remove periods often used in initials like "r. chapman"
  normalized = normalized.replace(/\./g, '');
  // Strip parenthetical content e.g., "richard chapman (rc)" -> "richard chapman"
  normalized = normalized.replace(/\s*\([^)]*\)\s*/g, ' ');
  // Remove trailing decorations after separators like " - ", " / ", or " | "
  normalized = normalized.replace(/\s[-/|].*$/, '');
      // Known alias fixes
      if (normalized === 'bianca odonnell') normalized = "bianca o'donnell";
      if (normalized === 'samuel packwood') normalized = 'sam packwood';
      return normalized.replace(/\s+/g, ' ');
    };
  
  // Calculate matters opened count for conversion metrics
  // Always use the currently selected user; do not force a different user in local dev
  const targetFirst = userFirstName;
  const targetLast = userLastName;
  const targetFull = userFullName;
  const targetInitials = userInitials;

  // Build a rich alias set for the selected user covering common variants seen in data
  const buildUserAliasSet = (): Set<string> => {
    const aliases: string[] = [];
    const first = (targetFirst || '').trim();
    const last = (targetLast || '').trim();
    const full = (targetFull || '').trim();
    const initials = (targetInitials || '').trim();
    const nickname = (userNickname || '').trim();

    // Full forms
    if (full) aliases.push(full);
    if (first && last) aliases.push(`${first} ${last}`);
    if (nickname && last) aliases.push(`${nickname} ${last}`);

    // Initials only (already checked separately but include here for uniformity)
    if (initials) aliases.push(initials);

    // First initial + last (e.g., "r chapman")
    if (first && last) aliases.push(`${first[0]} ${last}`);

    // Initial with dot + last (e.g., "r. chapman")
    if (first && last) aliases.push(`${first[0]}. ${last}`);

    // Normalize and dedupe
    return new Set(aliases.map(a => normalizeName(a)));
  };

  const targetNamesSet = buildUserAliasSet();

    // Compute per-user matters opened from normalizedMatters using role-aware logic
    const mattersOpenedCount = (normalizedMatters || []).filter((m) => {
      const openDate = parseOpenDate((m as any).openDate);
      if (!openDate) return false;
      const isCurrentMonth = openDate.getMonth() === currentMonth && openDate.getFullYear() === currentYear;
      if (!isCurrentMonth) return false;
      // Count only where current user is responsible (or both)
      const role = (m as any).role;
      const isRoleMatch = role === 'responsible' || role === 'both';
      
      return isRoleMatch;
    }).length;

    // Firm-wide matters opened this month (secondary metric)
    const firmMattersOpenedCount = (normalizedMatters || []).filter((m) => {
      const openDate = parseOpenDate((m as any).openDate);
      if (!openDate) return false;
      return openDate.getMonth() === currentMonth && openDate.getFullYear() === currentYear;
    }).length;

    if (!wipClioData) {
        return [
          { title: 'Time Today', isTimeMoney: true, money: 0, hours: 0, prevMoney: 0, prevHours: 0, showDial: true, dialTarget: 6 },
          { title: 'Av. Time This Week', isTimeMoney: true, money: 0, hours: 0, prevMoney: 0, prevHours: 0, showDial: true, dialTarget: 6 },
          { title: 'Time This Week', isTimeMoney: true, money: 0, hours: 0, prevMoney: 0, prevHours: 0, showDial: true, dialTarget: 30 },
          { title: 'Fees Recovered This Month', isMoneyOnly: true, money: recoveredData ?? 0, prevMoney: prevRecoveredData ?? 0 },
      // Use computed outstandingTotal with firm total as secondary
      { title: 'Outstanding Office Balances', isMoneyOnly: true, money: outstandingTotal ?? 0, secondary: firmOutstandingTotal ?? 0 },
          { title: 'Enquiries Today', isTimeMoney: false, count: enquiriesToday, prevCount: prevEnquiriesToday },
          { title: 'Enquiries This Week', isTimeMoney: false, count: enquiriesWeekToDate, prevCount: prevEnquiriesWeekToDate },
          { title: 'Matters Opened', isTimeMoney: false, count: mattersOpenedCount, prevCount: 0, secondary: firmMattersOpenedCount },
        ];
      }
      
  const currentWeekData = wipClioData.current_week?.daily_data?.[formattedToday];
    const lastWeekDate = new Date(today);
    lastWeekDate.setDate(today.getDate() - 7);
    const formattedLastWeekDate = formatDateLocal(lastWeekDate);
  const lastWeekData = wipClioData.last_week?.daily_data?.[formattedLastWeekDate];
    const startOfCurrentWeek = new Date(today);
    startOfCurrentWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfCurrentWeek);
    startOfLastWeek.setDate(getMondayOfCurrentWeek().getDate() - 7);

    const computeAverageUpTo = (
      dailyData: Record<string, { total_hours: number; total_amount: number }>,
      start: Date,
      end: Date
    ) => {
      let hours = 0;
      let amount = 0;
      let count = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDateLocal(d);
        const data = dailyData[dateStr];
        if (data) {
          hours += data.total_hours;
          amount += data.total_amount;
        }
        const day = d.getDay();
        if (day >= 1 && day <= 5 && data) count += 1; // count weekday only when hours exist
      }
      return {
        avgHours: count ? parseFloat((hours / count).toFixed(2)) : 0,
        avgAmount: count ? parseFloat((amount / count).toFixed(2)) : 0,
      };
    };

    const currentAvg = computeAverageUpTo(
      wipClioData.current_week?.daily_data ?? {},
      startOfCurrentWeek,
      today
    );
    const prevAvg = computeAverageUpTo(
      wipClioData.last_week?.daily_data ?? {},
      startOfLastWeek,
      lastWeekDate
    );

    debugLog('📊 Average calculations:', {
      currentAvg,
      prevAvg,
      startOfCurrentWeek: startOfCurrentWeek.toISOString(),
      today: today.toISOString(),
      formattedToday,
      currentWeekDataKeys: Object.keys(wipClioData.current_week?.daily_data || {}),
      todayData: wipClioData.current_week?.daily_data?.[formattedToday]
    });


    let totalTimeThisWeek = 0;
    if (wipClioData.current_week && wipClioData.current_week.daily_data) {
      Object.values(wipClioData.current_week.daily_data).forEach((dayData: any) => {
        totalTimeThisWeek += dayData.total_hours || 0;
      });
      debugLog('📊 Current week time calculation:', {
        dailyDataKeys: Object.keys(wipClioData.current_week.daily_data),
        dailyDataSample: Object.entries(wipClioData.current_week.daily_data).slice(0, 3),
        totalTimeThisWeek
      });
    }
    let totalTimeLastWeek = 0;
    if (wipClioData.last_week && wipClioData.last_week.daily_data) {
      Object.values(wipClioData.last_week.daily_data).forEach((dayData: any) => {
        totalTimeLastWeek += dayData.total_hours || 0;
      });
      debugLog('📊 Last week time calculation:', {
        dailyDataKeys: Object.keys(wipClioData.last_week.daily_data),
        totalTimeLastWeek
      });
    }

    const getWorkWeekDays = (): Date[] => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diff);
      const days: Date[] = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        days.push(d);
      }
      return days;
    };
    const workWeekDays = getWorkWeekDays();
    let leaveDays = 0;
    workWeekDays.forEach((day) => {
      const dayString = formatDateLocal(day);
      if (
        annualLeaveRecords.some(
          (rec) =>
            rec.status === 'booked' &&
            (rec.person || '').toLowerCase() === (userInitials || '').toLowerCase() &&
            dayString >= rec.start_date &&
            dayString <= rec.end_date
        )
      ) {
        leaveDays++;
      }
    });
    const adjustedTarget = (5 - leaveDays) * 6;

    return [
      {
        title: 'Time Today',
        isTimeMoney: true,
        money: currentWeekData ? currentWeekData.total_amount : 0,
        hours: currentWeekData ? currentWeekData.total_hours : 0,
        prevMoney: lastWeekData ? lastWeekData.total_amount : 0,
        prevHours: lastWeekData ? lastWeekData.total_hours : 0,
        showDial: true,
        dialTarget: 6,
      },
      {
        title: 'Av. Time This Week',
        isTimeMoney: true,
        money: currentAvg.avgAmount,
        hours: currentAvg.avgHours,
        prevMoney: prevAvg.avgAmount,
        prevHours: prevAvg.avgHours,
        showDial: true,
        dialTarget: 6,
      },
      {
        title: 'Time This Week',
        isTimeMoney: true,
        money: 0,
        hours: totalTimeThisWeek,
        prevMoney: 0,
        prevHours: totalTimeLastWeek,
        showDial: true,
        dialTarget: adjustedTarget,
      },
      {
        title: 'Fees Recovered This Month',
        isMoneyOnly: true,
        money: recoveredData ?? 0,
        prevMoney: prevRecoveredData ?? 0,
      },
      {
        title: 'Outstanding Office Balances',
        isMoneyOnly: true,
        money: outstandingTotal ?? 0,
        secondary: firmOutstandingTotal ?? 0,
        // No prevMoney - this is a current snapshot with firm total as secondary
      },
      {
        title: 'Enquiries Today',
        isTimeMoney: false,
        count: enquiriesToday,
        prevCount: prevEnquiriesToday,
      },
      {
        title: 'Enquiries This Week',
        isTimeMoney: false,
        count: enquiriesWeekToDate,
        prevCount: prevEnquiriesWeekToDate,
      },
      {
        title: 'Enquiries This Month',
        isTimeMoney: false,
        count: enquiriesMonthToDate,
        prevCount: prevEnquiriesMonthToDate,
      },
      {
        title: 'Matters Opened',
        isTimeMoney: false,
        count: mattersOpenedCount,
        prevCount: 0,
        secondary: firmMattersOpenedCount,
      },
    ];    
  }, [
    wipClioData,
    recoveredData,
    prevRecoveredData,
    formattedToday,
    enquiriesToday,
    prevEnquiriesToday,
    enquiriesWeekToDate,
    prevEnquiriesWeekToDate,
    enquiriesMonthToDate,
    prevEnquiriesMonthToDate,
    annualLeaveRecords,
    userData,
    currentUserEmail, // ADDED: Fix race condition where userData changes but currentUserEmail hasn't updated yet
    normalizedMatters,
    userInitials, // ADDED so we recalc if userInitials changes
    transformedTeamData,
    outstandingBalancesData, // ADDED
    userMatterIDs,           // ADDED
  ]);
  
  const timeMetrics = metricsData.slice(0, 5);
  // Removed enquiryMetrics; conversion summary now handled by TimeMetricsV2 props

  // Combine annualLeaveRecords and futureLeaveRecords for approval filtering
  const combinedLeaveRecords = useMemo(() => {
    return [...annualLeaveRecords, ...futureLeaveRecords];
  }, [annualLeaveRecords, futureLeaveRecords]);

  const APPROVERS = ['AC', 'JW', 'LZ', 'KW'];
  // Normalize initials for consistent matching
  const normalizedUserInitials = (userInitials || '').trim().toUpperCase();
  const isApprover = APPROVERS.includes(normalizedUserInitials);
  // Managers (broad visibility)
  const isManagerApprover = ['LZ', 'AC'].includes(normalizedUserInitials);

  const approvalsNeeded = useMemo(
    () =>
      isApprover
        ? combinedLeaveRecords.filter((x) => {
            if (x.status !== 'requested') return false;
            // Manager approvers see all requested
            if (isManagerApprover) return true;
            // Otherwise must be explicitly listed (case-insensitive)
            return (x.approvers || []).some(a => (a || '').toUpperCase() === normalizedUserInitials);
          })
        : [],
    [combinedLeaveRecords, isApprover, isManagerApprover, normalizedUserInitials]
  );

  const snippetApprovalsNeeded = useMemo(
    () => (isApprover ? snippetEdits.filter(e => e.status === 'pending') : []),
    [snippetEdits, isApprover]
  );

  // Merge annualLeaveRecords and futureLeaveRecords for bookings
  const bookingsNeeded = useMemo(
    () =>
      [...annualLeaveRecords, ...futureLeaveRecords].filter(
        (x) =>
          (x.status === 'approved' || x.status === 'rejected' || x.status === 'requested') &&
          (x.person || '').toLowerCase() === (userInitials || '').toLowerCase()
      ),
    [annualLeaveRecords, futureLeaveRecords, userInitials]
  );

  type BookingItem = typeof bookingsNeeded[number];

  // Quick action button styles
  const approveButtonStyles = {
    root: {
      backgroundColor: '#FFD700 !important', // Yellow background
      border: 'none !important',
      height: '40px !important',
      fontWeight: '600',
      borderRadius: '4px !important',
      padding: '6px 12px !important',
      animation: `yellowPulse 2s infinite !important`, // Use yellowPulse animation
      transition: 'box-shadow 0.3s, transform 0.3s, background 0.3s ease !important',
      whiteSpace: 'nowrap',
      width: 'auto',
      color: '#ffffff !important',
    },
  };

  const bookButtonStyles = {
    root: {
      backgroundColor: '#28a745 !important', // Green background
      border: 'none !important',
      height: '40px !important',
      fontWeight: '600',
      borderRadius: '4px !important',
      padding: '6px 12px !important',
      animation: `greenPulse 2s infinite !important`, // Use greenPulse animation
      transition: 'box-shadow 0.3s, transform 0.3s, background 0.3s ease !important',
      whiteSpace: 'nowrap',
      width: 'auto',
      color: '#ffffff !important',
    },
  };

  // Leave action handlers
  const handleApproveLeaveClick = () => {
    if (approvalsNeeded.length > 0) {
      setBespokePanelContent(
        <Suspense fallback={<ThemedSpinner size={SpinnerSize.small} />}>
          <AnnualLeaveApprovals
            approvals={approvalsNeeded.map((item) => ({
              id: item.id,
              person: item.person,
              start_date: item.start_date,
              end_date: item.end_date,
              reason: item.reason,
              status: item.status,
              days_taken: item.days_taken,
              leave_type: item.leave_type,
              hearing_confirmation: item.hearing_confirmation,
              hearing_details: item.hearing_details,
            }))}
            futureLeave={futureLeaveRecords.map((item) => ({
              id: item.id,
              person: item.person,
              start_date: item.start_date,
              end_date: item.end_date,
              reason: item.reason,
              status: item.status,
              days_taken: item.days_taken,
              leave_type: item.leave_type,
              hearing_confirmation: item.hearing_confirmation,
              hearing_details: item.hearing_details,
            }))}
            onClose={() => {
              setIsBespokePanelOpen(false);
              resetQuickActionsSelection();
            }}
            team={transformedTeamData}
            totals={annualLeaveTotals}
            allLeaveEntries={annualLeaveAllData}
            onApprovalUpdate={handleApprovalUpdate}  // Pass the callback here
          />
        </Suspense>
      );
      setBespokePanelTitle('Approve Annual Leave');
      setIsBespokePanelOpen(true);
    }
  };

  // Test handler for localhost annual leave approvals
  const handleTestApproveLeaveClick = useCallback(() => {
    // Create dummy test data for localhost testing
    const testApprovals = [
      {
        id: 'test-1',
        person: 'Test User',
        start_date: '2025-09-25',
        end_date: '2025-09-27',
        reason: 'Family vacation',
        status: 'requested',
        hearing_confirmation: null,
        hearing_details: '',
      },
      {
        id: 'test-2', 
        person: 'Another User',
        start_date: '2025-10-01',
        end_date: '2025-10-03',
        reason: 'Medical appointment',
        status: 'requested',
        hearing_confirmation: null,
        hearing_details: '',
      }
    ];

    setBespokePanelContent(
      <Suspense fallback={<ThemedSpinner size={SpinnerSize.small} />}>
        <AnnualLeaveApprovals
          approvals={testApprovals}
          futureLeave={futureLeaveRecords.map((item) => ({
            id: item.id,
            person: item.person,
            start_date: item.start_date,
            end_date: item.end_date,
            reason: item.reason,
            status: item.status,
            days_taken: item.days_taken,
            leave_type: item.leave_type,
            hearing_confirmation: item.hearing_confirmation,
            hearing_details: item.hearing_details,
          }))}
          onClose={() => {
            setIsBespokePanelOpen(false);
            resetQuickActionsSelection();
          }}
          team={transformedTeamData}
          totals={annualLeaveTotals}
          allLeaveEntries={annualLeaveAllData}
          onApprovalUpdate={handleApprovalUpdate}  // Pass the callback here
        />
      </Suspense>
    );
    setBespokePanelTitle('Approve Annual Leave (Test)');
    setIsBespokePanelOpen(true);
  }, [futureLeaveRecords, annualLeaveTotals, annualLeaveAllData, handleApprovalUpdate]);

  const openBookLeavePanel = React.useCallback(
    (entries: BookingItem[]) => {
      if (!entries || entries.length === 0) {
        return;
      }

      setBespokePanelContent(
        <Suspense fallback={<ThemedSpinner size={SpinnerSize.small} />}>
          <AnnualLeaveBookings
            bookings={entries.map((item) => ({
              id: item.id,
              person: item.person,
              start_date: item.start_date,
              end_date: item.end_date,
              status: item.status,
              rejection_notes: item.rejection_notes,
            }))}
            onClose={() => {
              setIsBespokePanelOpen(false);
              resetQuickActionsSelectionRef.current?.();
            }}
            team={transformedTeamData}
          />
        </Suspense>
      );
      setBespokePanelTitle('Book Requested Leave');
      setIsBespokePanelOpen(true);
    },
    [setBespokePanelContent, setBespokePanelTitle, setIsBespokePanelOpen, transformedTeamData]
  );

  const handleBookLeaveClick = React.useCallback(() => {
    openBookLeavePanel(bookingsNeeded);
  }, [bookingsNeeded, openBookLeavePanel]);

  const handleBookLeavePreviewClick = React.useCallback(() => {
    const todayIso = new Date().toISOString();
    const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const sample: BookingItem[] = [
      {
        id: 'preview-booking',
        person: userData[0]?.FullName ?? 'You',
        start_date: todayIso,
        end_date: tomorrowIso,
        status: 'approved',
        rejection_notes: '',
      } as BookingItem,
    ];
    openBookLeavePanel(sample);
  }, [openBookLeavePanel, userData]);

  const approveSnippet = async (id: number, approve: boolean) => {
    try {
      const baseUrl = proxyBaseUrl;
      if (approve) {
        const approveUrl = `${baseUrl}/${process.env.REACT_APP_APPROVE_SNIPPET_EDIT_PATH}?code=${process.env.REACT_APP_APPROVE_SNIPPET_EDIT_CODE}`;
        await fetch(approveUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ editId: id, approvedBy: userInitials })
        });
      } else {
        const deleteUrl = `${baseUrl}/${process.env.REACT_APP_DELETE_SNIPPET_EDIT_PATH}?code=${process.env.REACT_APP_DELETE_SNIPPET_EDIT_CODE}`;
        await fetch(deleteUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ editId: id })
        });
      }
      setSnippetEdits(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      console.error('Failed to update snippet edit', err);
    }
  };

  const handleSnippetApprovalClick = () => {
    if (snippetApprovalsNeeded.length > 0) {
      setBespokePanelContent(
        <Suspense fallback={<ThemedSpinner size={SpinnerSize.small} />}>
          <SnippetEditsApproval
            edits={snippetApprovalsNeeded}
            onApprove={(id) => approveSnippet(id, true)}
            onReject={(id) => approveSnippet(id, false)}
            onClose={() => {
              setIsBespokePanelOpen(false);
              resetQuickActionsSelection();
            }}
          />
        </Suspense>
      );
      setBespokePanelTitle('Approve Snippet Edits');
      setIsBespokePanelOpen(true);
    }
  };

  const immediateALActions = useMemo(() => {
    const actions: Array<{ title: string; subtitle?: string; onClick: () => void; icon?: string; category?: ImmediateActionCategory; count?: number }> = [];
    
    // Add test annual leave approval for localhost (only if no real approvals exist and toggle enabled)
    if (isLocalhost && approvalsNeeded.length === 0 && featureToggles.annualLeaveTestCards) {
      actions.push({
        title: 'Approve Annual Leave (Test)',
        subtitle: 'Test approval flow',
        onClick: handleTestApproveLeaveClick,
        icon: 'PalmTree',
        category: 'critical',
      });
    }
    
    if (isApprover && approvalsNeeded.length > 0) {
      // Build subtitle from requestor initials
      const firstRequestor = approvalsNeeded[0]?.person?.toUpperCase() || '';
      const subtitle = approvalsNeeded.length > 1 
        ? `${firstRequestor} +${approvalsNeeded.length - 1} more`
        : firstRequestor;
      actions.push({
        title: 'Approve Annual Leave',
        subtitle,
        onClick: handleApproveLeaveClick,
        icon: 'PalmTree',
        category: 'critical',
        count: approvalsNeeded.length,
      });
    }
    if (isApprover && snippetApprovalsNeeded.length > 0) {
      // Build subtitle from snippet names
      const firstSnippet = snippetApprovalsNeeded[0]?.blockTitle || '';
      const subtitle = snippetApprovalsNeeded.length > 1
        ? `${firstSnippet} +${snippetApprovalsNeeded.length - 1} more`
        : firstSnippet;
      actions.push({
        title: 'Approve Snippet Edits',
        subtitle,
        onClick: handleSnippetApprovalClick,
        icon: 'Edit',
        category: 'standard',
        count: snippetApprovalsNeeded.length,
      });
    }
    if (bookingsNeeded.length > 0) {
      // Show first booking's date range
      const first = bookingsNeeded[0];
      const subtitle = bookingsNeeded.length > 1 
        ? `${first?.start_date || ''} +${bookingsNeeded.length - 1} more`
        : `${first?.start_date || ''} - ${first?.end_date || ''}`;
      actions.push({
        title: 'Book Requested Leave',
        subtitle,
        onClick: handleBookLeaveClick,
        icon: 'Accept',
        category: 'success',
        count: bookingsNeeded.length,
      });
    }
    if (isLocalhost && bookingsNeeded.length === 0 && featureToggles.annualLeaveTestCards) {
      actions.push({
        title: 'Book Requested Leave',
        subtitle: 'Test booking flow',
        onClick: handleBookLeavePreviewClick,
        icon: 'Accept',
        category: 'success',
      });
    }
    return actions;
  }, [
    isApprover,
    approvalsNeeded,
    snippetApprovalsNeeded,
    bookingsNeeded,
    handleTestApproveLeaveClick,
    handleApproveLeaveClick,
    handleSnippetApprovalClick,
    handleBookLeaveClick,
    handleBookLeavePreviewClick,
    isLocalhost,
    featureToggles.annualLeaveTestCards,
  ]);

  // Build immediate actions list
  // Ensure every action has an icon (never undefined)
  type Action = { title: string; onClick: () => void; icon: string; disabled?: boolean; category?: ImmediateActionCategory; count?: number; totalCount?: number; subtitle?: string };

  const resetQuickActionsSelection = useCallback(() => {
    if (resetQuickActionsSelectionRef.current) {
      resetQuickActionsSelectionRef.current();
    }
  }, []);
  const handleActionClick = useCallback((action: { title: string; icon: string }) => {
    let content: React.ReactNode = <div>No form available.</div>;
    let titleText = action.title;
    let descriptionText = '';

    // Map full titles to short titles and descriptions
    const titleMap: Record<string, { shortTitle: string; description: string }> = {
      'Create a Task': { shortTitle: 'New Task', description: 'Create and assign a new task or reminder' },
      'Save Telephone Note': { shortTitle: 'Attendance Note', description: 'Record details from a phone conversation' },
      'Request Annual Leave': { shortTitle: 'Book Leave', description: 'Submit a request for annual leave or time off' },
      'Update Attendance': { shortTitle: 'Confirm Your Attendance', description: '' },
      'Confirm Attendance': { shortTitle: 'Confirm Attendance', description: '' },
      'Book Space': { shortTitle: 'Book Room', description: 'Reserve a meeting room or workspace' },
    };

    if (titleMap[titleText]) {
      const mapped = titleMap[titleText];
      titleText = mapped.shortTitle;
      descriptionText = mapped.description;
    }
  
    switch (action.title) {
      case "Confirm Attendance":
        // Open the personal attendance confirmation component
        content = (
          <PersonalAttendanceConfirm
            isDarkMode={isDarkMode}
            attendanceRecords={transformedAttendanceRecords}
            annualLeaveRecords={annualLeaveRecords}
            futureLeaveRecords={futureLeaveRecords}
            userData={userData}
            onSave={saveAttendance}
            onShowToast={showToast}
            onClose={() => {
              setBespokePanelContent(null);
              setIsBespokePanelOpen(false);
              resetQuickActionsSelection();
            }}
          />
        );
        break;
      case "Update Attendance":
        // Open the personal attendance confirmation component
        content = (
          <PersonalAttendanceConfirm
            isDarkMode={isDarkMode}
            attendanceRecords={transformedAttendanceRecords}
            annualLeaveRecords={annualLeaveRecords}
            futureLeaveRecords={futureLeaveRecords}
            userData={userData}
            onSave={saveAttendance}
            onShowToast={showToast}
            onClose={() => {
              setBespokePanelContent(null);
              setIsBespokePanelOpen(false);
              resetQuickActionsSelection();
            }}
          />
        );
        break;
      case 'Create a Task':
        content = (
          <Suspense fallback={<ThemedSpinner size={SpinnerSize.small} />}>
            <Tasking />
          </Suspense>
        );
        break;
      case 'Request CollabSpace':
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="44" />;
        break;
      case 'Save Telephone Note':
        content = (
          <Suspense fallback={<ThemedSpinner size={SpinnerSize.small} />}>
            <TelephoneAttendance />
          </Suspense>
        );
        break;
      case 'Save Attendance Note':
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="38" />;
        break;
      case 'Request ID':
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="60" />;
        break;
      case 'Open a Matter':
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="9" />;
        break;
      case 'Request Annual Leave':
        content = (
          <Suspense fallback={<ThemedSpinner size={SpinnerSize.small} />}>
            <AnnualLeaveForm
              futureLeave={futureLeaveRecords}
              team={transformedTeamData}
              userData={userData}
              totals={annualLeaveTotals}
              bankHolidays={bankHolidays}
              allLeaveRecords={annualLeaveAllData} // Added this prop
            />
          </Suspense>
        );
        break;
      case 'Review Instructions':
        sessionStorage.setItem('reviewedInstructionIds', actionableInstructionIds);
        setReviewedInstructionIds(actionableInstructionIds);
        try {
          window.dispatchEvent(new CustomEvent('navigateToInstructions'));
        } catch (error) {
          console.error('Failed to dispatch navigation event:', error);
        }
        return; // Navigate without opening panel
        break;
  case 'Open Matter':
        // Navigate directly to Instructions tab and trigger matter opening
        safeSetItem('openMatterOpening', 'true');
        // Use a custom event to signal the navigation
        try {
          window.dispatchEvent(new CustomEvent('navigateToInstructions'));
        } catch (error) {
          console.error('Failed to dispatch navigation event:', error);
        }
        return; // Exit early, no panel needed
        break;
      case 'Resume Pitch':
        safeSetItem('resumePitchBuilder', 'true');
        try {
          window.dispatchEvent(new CustomEvent('navigateToEnquiries'));
        } catch (error) {
          console.error('Failed to dispatch navigation event:', error);
        }
        break;
      case 'Book Space':
        content = (
          <Suspense fallback={<ThemedSpinner size={SpinnerSize.small} />}>
            <BookSpaceForm
              feeEarner={userData[0].Initials}
              onCancel={() => {
                setIsBespokePanelOpen(false);
                resetQuickActionsSelection();
              }}
              futureBookings={futureBookings}
              onBookingCreated={async () => {
                // Refresh future bookings after creation
                try {
                  const response = await fetch('/api/future-bookings');
                  if (response.ok) {
                    const data = await response.json();
                    setFutureBookings(data);
                  }
                } catch (error) {
                  console.warn('Failed to refresh future bookings:', error);
                }
              }}
            />
          </Suspense>
        );
        break;
      case 'Unclaimed Enquiries':
        content = (
          <UnclaimedEnquiries
            enquiries={unclaimedEnquiries}
            onSelect={() => {}}
            userEmail={currentUserEmail || ''}
            onAreaChange={() => { /* no-op for home quick view */ }}
          />
        );
        break;
      case 'Verify ID':
      case 'Review ID':
      case 'Review Risk':
        try {
          window.dispatchEvent(new CustomEvent('navigateToInstructions'));
        } catch (error) {
          console.error('Failed to dispatch navigation event:', error);
        }
        return; // Navigate without opening panel
        break;
      case 'Assess Risk':
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="70" />; // Risk Assessment form
        break;
      case 'Submit to CCL':
      case 'Draft CCL':
        content = (
          <div style={{ padding: '20px' }}>
            <Text variant="medium" style={{ marginBottom: '15px', display: 'block' }}>
              CCL submission functionality is coming soon.
            </Text>
            <DefaultButton 
              text="Close" 
              onClick={() => setIsBespokePanelOpen(false)}
            />
          </div>
        );
        break;
      default:
        content = <div>No form available.</div>;
        break;
    }
  
    setBespokePanelContent(content);
    setBespokePanelTitle(titleText);
    setBespokePanelDescription(descriptionText);
    const iconComponent = getQuickActionIcon(action.icon);
    debugLog('Setting panel icon for action:', action, 'icon component:', iconComponent);
    setBespokePanelIcon(iconComponent);
    setIsBespokePanelOpen(true);
  }, [
    attendanceRef,
    instructionData,
    futureLeaveRecords,
    transformedTeamData,
    userData,
    annualLeaveTotals,
    bankHolidays,
    annualLeaveAllData,
    futureBookings,
    unclaimedEnquiries,
    isDarkMode,
    transformedAttendanceRecords,
    annualLeaveRecords,
    saveAttendance,
    actionableInstructionIds,
    resetQuickActionsSelection,
    setReviewedInstructionIds,
  ]);

  // Group instruction next actions by type with counts and sample detail
  const groupedInstructionActions = useMemo(() => {
    const actionGroups: Record<string, { count: number; icon: string; disabled?: boolean; sampleDetail: string }> = {};
    
    actionableSummaries.forEach(summary => {
      const action = summary.nextAction;
      if (actionGroups[action]) {
        actionGroups[action].count++;
      } else {
        // Map next actions to appropriate icons
        let icon = 'OpenFile'; // default
        if (action === 'Verify ID') icon = 'ContactCard';
        else if (action === 'Assess Risk') icon = 'Shield';
        else if (action === 'Submit to CCL') icon = 'Send';
        else if (action === 'Review') icon = 'ReviewRequestMirrored';
        
        // Use first item's client name as sample detail
        const detail = summary.clientName || summary.service || '';
        
        actionGroups[action] = { 
          count: 1, 
          icon,
          disabled: summary.disabled,
          sampleDetail: detail,
        };
      }
    });
    
    return actionGroups;
  }, [actionableSummaries]);
  const immediateActionsList: Action[] = useMemo(() => {
    const actions: Action[] = [];
    if (!isLoadingAttendance && !currentUserConfirmed) {
      // Show today's date as the detail
      const todayFormatted = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      actions.push({
        title: 'Confirm Attendance',
        subtitle: todayFormatted,
        icon: 'Calendar',
        onClick: () => handleActionClick({ title: 'Confirm Attendance', icon: 'Calendar' }),
        category: 'critical',
      });
    }
    // Resume prompts (pitch / matter) suppressed intentionally; cached data remains for manual navigation
    
    // Add grouped instruction actions (replaces old single "Review Instructions" action)
    if (!instructionsActionDone && (userInitials === 'LZ' || isLocalhost)) {
      const instructionCategoryFor = (actionType: string): ImmediateActionCategory => {
        if (['Verify ID', 'Review ID', 'Review', 'Open Matter'].includes(actionType)) {
          return 'standard';
        }
        return 'critical';
      };

      Object.entries(groupedInstructionActions).forEach(([actionType, { count, icon, disabled, sampleDetail }]) => {
        const title = actionType;
        // Show client name or "+X more" if multiple
        const subtitle = count > 1 
          ? `${sampleDetail} +${count - 1} more`
          : sampleDetail || '';
        actions.push({
          title,
          subtitle,
          icon,
          disabled,
          count: count > 1 ? count : undefined,
          onClick: disabled 
            ? () => debugLog('CCL action disabled in production') 
            : () => handleActionClick({ title: actionType, icon }),
          category: instructionCategoryFor(actionType),
        });
      });
    }
    actions.push(
      ...immediateALActions.map(a => ({
        ...a,
        icon: a.icon || '',
        category: a.category ?? 'standard',
        count: a.count, // Preserve count property
        subtitle: a.subtitle, // Preserve subtitle property
      }))
    );

    // Add rate change notification action if enabled in user settings and there are clients to track
    // All users can view the tracker; non-admins see All view as read-only
    if (featureToggles.rateChangeTracker && (rateChangeStats.total > 0 || rateChangeStats.pending > 0)) {
      // Show clear subtitle: "X yours · Y firm pending" or just firm total
      let pendingDetail: string;
      if (rateChangePendingCount > 0 && rateChangeStats.pending > 0) {
        pendingDetail = `${rateChangePendingCount} yours · ${rateChangeStats.pending} firm pending`;
      } else if (rateChangeStats.pending > 0) {
        pendingDetail = `${rateChangeStats.pending} firm pending`;
      } else {
        pendingDetail = `${rateChangeStats.total} tracked`;
      }
      actions.push({
        title: 'Rate Change Notices',
        subtitle: pendingDetail,
        icon: 'Money',
        onClick: () => setShowRateChangeModal(true),
        category: 'standard' as ImmediateActionCategory,
        count: rateChangePendingCount > 0 ? rateChangePendingCount : undefined, // Only show badge if user has pending
      });
    }

    // Add pending document allocation actions (files in Holding)
    if (pendingDocActions.length > 0) {
      const totalFiles = pendingDocActions.reduce((sum, a) => sum + a.holdingCount, 0);
      const firstAction = pendingDocActions[0];
      // Look up enquiry name from enquiries prop if available
      const firstEnquiry = enquiries?.find(e => String(e.ID) === firstAction.enquiryId);
      const firstName = firstEnquiry 
        ? `${firstEnquiry.First_Name || ''} ${firstEnquiry.Last_Name || ''}`.trim() || `Enquiry ${firstAction.enquiryId}`
        : `Enquiry ${firstAction.enquiryId}`;
      
      const subtitle = pendingDocActions.length > 1 
        ? `${firstName} +${pendingDocActions.length - 1} more`
        : firstName;

      actions.push({
        title: 'Allocate Documents',
        subtitle,
        icon: 'DocumentSet',
        count: totalFiles,
        onClick: () => {
          // Navigate to enquiries tab and select the first enquiry with pending docs
          safeSetItem('navigateToEnquiryId', firstAction.enquiryId);
          safeSetItem('navigateToTimelineItem', 'doc-workspace');
          try {
            window.dispatchEvent(new CustomEvent('navigateToEnquiries'));
          } catch (error) {
            console.error('Failed to dispatch navigation event:', error);
          }
        },
        category: 'standard' as ImmediateActionCategory,
      });
    }

    // Normalize titles (strip count suffix like " (3)") when sorting
    const sortKey = (title: string) => {
      const base = title.replace(/\s*\(\d+\)$/,'');
      return quickActionOrder[base] ?? quickActionOrder[title] ?? 99;
    };
    actions.sort((a, b) => sortKey(a.title) - sortKey(b.title));
    return actions;
  }, [
    isLoadingAttendance,
    currentUserConfirmed,
    hasActiveMatter,
    instructionData,
    groupedInstructionActions,
    instructionsActionDone,
    immediateALActions,
    handleActionClick,
    hasActivePitch,
    userInitials,
    isLocalhost,
    rateChangeStats.total,
    rateChangeStats.pending,
    rateChangePendingCount,
    featureToggles.rateChangeTracker,
    pendingDocActions,
    enquiries,
  ]);

  // Notify parent component when immediate actions state changes
  useEffect(() => {
    if (onImmediateActionsChange) {
      onImmediateActionsChange(immediateActionsList.length > 0);
    }
  }, [immediateActionsList.length, onImmediateActionsChange]);

  // Removed first-entry overlay logic and session flags

  const normalQuickActions = useMemo(() => {
    const actions = quickActions
      .filter((action) => {
        if (action.title === 'Unclaimed Enquiries') {
          return ['LZ', 'JW', 'AC'].includes(userInitials);
        }
        if (action.title === 'Request Annual Leave') {
          return true;
        }
        return true;
      });
    actions.sort(
      (a, b) => (quickActionOrder[a.title] || 99) - (quickActionOrder[b.title] || 99)
    );
    return actions;
  }, [userInitials]);


  // Use useLayoutEffect to avoid infinite loops and set content once per dependency change
  React.useLayoutEffect(() => {
    const content = (
      <QuickActionsBar
        isDarkMode={isDarkMode}
        quickActions={normalQuickActions}
        handleActionClick={handleActionClick}
        currentUserConfirmed={currentUserConfirmed}
        highlighted={false}
        resetSelectionRef={resetQuickActionsSelectionRef}
        panelActive={isBespokePanelOpen || isContextPanelOpen || isOutstandingPanelOpen || isTransactionPopupOpen}
        seamless
        userDisplayName={currentUserName}
        userIdentifier={currentUserEmail}
        onToggleTheme={toggleTheme}
      />
    );
    setContent(content);
  }, [
    isDarkMode,
    normalQuickActions,
    currentUserConfirmed,
    currentUserName,
    currentUserEmail,
    toggleTheme,
  ]);

  // Returns a narrow weekday (e.g. "M" for Monday, "T" for Tuesday)
  const getShortDayLabel = (date: Date): string =>
    date.toLocaleDateString('en-GB', { weekday: 'narrow' });

  // Optionally, if you want to include the date as well (e.g. "M 10")
  const getShortDayAndDateLabel = (date: Date): string => {
    const shortDay = getShortDayLabel(date);
    const dayOfMonth = date.getDate();
    return `${shortDay} ${dayOfMonth}`;
  };

  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const currentWeekMonday = getMondayOfCurrentWeek();
  const todayStr = formatDateLocal(new Date());

  // Example usage in attendancePersons:
  const attendancePersons = useMemo(() => {
    return transformedTeamData
      .map((member) => {
        const record = attendanceRecords.find(
          (rec: any) => (rec.name || '').toLowerCase() === (member.First || '').toLowerCase()
        );
        return {
          name: member.First,
          initials: member.Initials,
          nickname: member.Nickname,
          attendance:
            record && record.weeks && record.weeks[relevantWeekKey]
              ? record.weeks[relevantWeekKey].attendance
              : '',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [transformedTeamData, attendanceRecords, relevantWeekKey]);

  const getCellStatus = (
    personAttendance: string,
    personInitials: string,
    day: string,
    cellDateStr: string
  ): 'in' | 'wfh' | 'out' => {
    if (
      combinedLeaveRecords.some(
        (leave) =>
          leave.status === 'booked' &&
          leave.person.trim().toLowerCase() === personInitials.trim().toLowerCase() &&
          cellDateStr >= leave.start_date &&
          cellDateStr <= leave.end_date
      )
    ) {
      return 'out';
    }
    const attendedDays = personAttendance ? personAttendance.split(',').map((s: string) => s.trim()) : [];
    if (attendedDays.includes(day)) {
      return 'in';
    }
    return 'wfh';
  };

  const AttendanceCell: React.FC<{ status: 'in' | 'wfh' | 'out'; highlight?: boolean }> = ({
    status,
    highlight = false,
  }) => {
    let iconName = 'Home';
    if (status === 'in') {
      iconName = 'Accept';
    } else if (status === 'out') {
      iconName = 'Airplane';
    }
    // Use proper text color for icons; if not highlighted, use main text color
    const iconColor = highlight ? '#fff' : (isDarkMode ? colours.dark.text : colours.light.text);
    return (
      <Icon
        iconName={iconName}
        styles={{ root: { fontSize: '20px', color: iconColor } }}
      />
    );
  };

  const AttendancePersonaHeader: React.FC<{ person: { name: string; initials: string; nickname: string; attendance: string } }> = ({ person }) => {
    // Determine today's weekday (default to Monday if out of range)
    const todayDate = new Date();
    const diffDays = Math.floor((todayDate.getTime() - currentWeekMonday.getTime()) / (1000 * 3600 * 24));
    const todayWeekday = diffDays >= 0 && diffDays < weekDays.length ? weekDays[diffDays] : 'Monday';
  
    // Determine status
    const currentStatus = getCellStatus(person.attendance, person.initials, todayWeekday, todayStr);
  
    // Define gradient based on status
    let gradient = '';
    if (currentStatus === 'in') {
      gradient = `linear-gradient(135deg, ${colours.blue}, ${colours.darkBlue})`;
    } else if (currentStatus === 'wfh') {
      gradient = `linear-gradient(135deg, ${colours.highlight}, ${colours.darkBlue})`;
    } else {
      // For away/out
      gradient = `linear-gradient(135deg, ${colours.grey}, ${colours.darkBlue})`;
    }
  
    // Custom avatar styles with smaller font size
    const avatarStyle: React.CSSProperties = {
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      background: gradient,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#ffffff',
      fontWeight: 600,
      fontSize: '12px',
    };
  
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <div style={avatarStyle}>
          {person.initials.toUpperCase()}
        </div>
      </div>
    );
  };  

// Define the fadeIn keyframes
const fadeInKeyframes = keyframes({
  from: { opacity: 0, transform: 'translateY(5px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

  // Define the tickPop keyframes for the completion icon
  const tickPopKeyframes = keyframes({
    '0%': { transform: 'scale(0)', opacity: 0 },
    '70%': { transform: 'scale(1.3)', opacity: 1 },
    '100%': { transform: 'scale(1)', opacity: 1 },
  });

  // Style for the "No actions" container
const noActionsClass = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  animation: `${fadeInKeyframes} 0.3s ease`,
});

  // Style for the animated tick icon container
  const noActionsIconClass = mergeStyles({
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: colours.highlight,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    animation: `${tickPopKeyframes} 0.3s ease`,
  });

// Extract matters opened dynamically from metricsData to avoid stale index assumptions
const mattersOpenedCount = React.useMemo(() => {
  const item = (metricsData as any[]).find((m: any) => m.title?.toLowerCase().startsWith('matters opened'));
  return item && typeof item.count === 'number' ? item.count : 0;
}, [metricsData]);
const conversionRate = enquiriesMonthToDate
  ? Number(((mattersOpenedCount / enquiriesMonthToDate) * 100).toFixed(2))
  : 0;
  
  const inHighlight = 'rgba(16,124,16,0.15)'; // subtle green tint
  const wfhHighlight = 'rgba(54,144,206,0.15)'; // subtle blue tint
  const outHighlight = 'rgba(214,85,65,0.15)'; // subtle red tint

  // Portal for app-level immediate actions
  const appLevelImmediateActions = (
    <ImmediateActionsBar
      isDarkMode={isDarkMode}
      immediateActionsReady={immediateActionsReady}
      immediateActionsList={immediateActionsList}
      highlighted={false}
      seamless={false}
    />
  );

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Portal immediate actions to app level */}
      {typeof document !== 'undefined' && document.getElementById('app-level-immediate-actions') && 
        createPortal(appLevelImmediateActions, document.getElementById('app-level-immediate-actions')!)
      }

      {/* Modern Time Metrics V2 - directly on page background */}
      <div style={{ paddingTop: '16px' }}>
        <TimeMetricsV2 
          metrics={timeMetrics}
          enquiryMetrics={[
          { title: 'Enquiries Today', count: enquiriesToday, prevCount: prevEnquiriesToday },
          { title: 'Enquiries This Week', count: enquiriesWeekToDate, prevCount: prevEnquiriesWeekToDate },
          { title: 'Enquiries This Month', count: enquiriesMonthToDate, prevCount: prevEnquiriesMonthToDate },
          { title: 'Matters Opened This Month', count: mattersOpenedCount },
          { 
            title: 'Conversion Rate', 
            percentage: enquiriesMonthToDate ? Number(((mattersOpenedCount / enquiriesMonthToDate) * 100).toFixed(2)) : 0, 
            isPercentage: true 
          }
        ]}
        isDarkMode={isDarkMode}
        onRefresh={handleRefreshTimeMetrics}
        isRefreshing={isRefreshingTimeMetrics}
      />
      </div>

      {/* Attendance placed outside dashboard container, directly below TimeMetricsV2 */}
      {!isBespokePanelOpen && (
        <div style={{ margin: '12px 16px 0 16px' }}>
          <SectionCard 
            title="Attendance" 
            id="attendance-section"
            variant="default"
            animationDelay={0.1}
            styleOverrides={{ paddingBottom: 0 }}
          >
            <EnhancedAttendance
              ref={attendanceRef}
              isDarkMode={isDarkMode}
              isLoadingAttendance={isLoadingAttendance}
              isLoadingAnnualLeave={isLoadingAnnualLeave}
              attendanceError={attendanceError}
              annualLeaveError={annualLeaveError}
              attendanceRecords={transformedAttendanceRecords}
              teamData={attendanceTeam}
              annualLeaveRecords={annualLeaveRecords}
              futureLeaveRecords={futureLeaveRecords}
              userData={userData}
              onAttendanceUpdated={handleAttendanceUpdated}
              currentUserConfirmed={currentUserConfirmed}
              onConfirmAttendance={() => handleActionClick({ title: 'Confirm Attendance', icon: 'Calendar' })}
            />
          </SectionCard>
        </div>
      )}

      {/* Transactions & Balances - only show in local environment */}
      {useLocalData && (
        <div style={{ margin: '12px 16px' }}>
          <SectionCard 
            title="Transactions & Balances" 
            id="transactions-section"
            variant="default"
            animationDelay={0.1}
          >
            <ActionSection
              transactions={transactions}
              userInitials={userInitials}
              isDarkMode={isDarkMode}
              onTransactionClick={handleTransactionClick}
              matters={allMatters || []}
              updateTransaction={updateTransaction}
              outstandingBalances={myOutstandingBalances}
            />
          </SectionCard>
        </div>
      )}

      {/* Separator after the top sections */}
      <div 
        style={{
          height: '1px',
          background: isDarkMode 
            ? 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)'
            : 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.1) 50%, transparent 100%)',
          margin: '12px 16px',
        }}
      />


  {/* Contexts Panel */}
      <BespokePanel
        isOpen={isContextPanelOpen}
        onClose={() => {
          setIsContextPanelOpen(false);
          resetQuickActionsSelection();
        }}
        title="Context Details"
          width="2000px"
      >
        {renderContextsPanelContent()}
      </BespokePanel>

      <BespokePanel
        isOpen={isOutstandingPanelOpen}
        onClose={() => {
          setIsOutstandingPanelOpen(false);
          resetQuickActionsSelection();
        }}
        title="Outstanding Balances Details"
        width="2000px"
      >
        {/* Toggle between "Everyone" and "Only Mine" */}
        <Toggle
          label="Show Only My Matters"
          checked={showOnlyMine}
          onChange={(ev, checked) => setShowOnlyMine(!!checked)}
          styles={{ root: { marginBottom: '10px' } }}
        />
        <OutstandingBalancesList 
          balances={filteredBalancesForPanel} 
          matters={allMatters ?? []} 
        />
      </BespokePanel>

      {/* Bespoke Panel for other actions */}
      <BespokePanel
        isOpen={isBespokePanelOpen}
        onClose={() => {
          setIsBespokePanelOpen(false);
          resetQuickActionsSelection();
        }}
        title={bespokePanelTitle}
        description={bespokePanelDescription}
        width="85%"
        isDarkMode={isDarkMode}
        variant="modal"
        icon={bespokePanelIcon || undefined}
      >
        {bespokePanelContent}
      </BespokePanel>

      {/* Transaction Approval Popup */}
      <BespokePanel
        isOpen={isTransactionPopupOpen}
        onClose={() => {
          setIsTransactionPopupOpen(false);
          resetQuickActionsSelection();
        }}
        title="Approve Transaction"
        width="2000px"
        isDarkMode={isDarkMode}
      >
        {selectedTransaction && (
          <TransactionApprovalPopup
            transaction={selectedTransaction}
            matters={allMatters || []}
            onSubmit={handleTransactionSubmit}
            onCancel={() => {
              setIsTransactionPopupOpen(false);
              resetQuickActionsSelection();
            }}
            userInitials={userInitials} // Add userInitials prop
          />
        )}
      </BespokePanel>

      {/* Selected Form Details */}
      {selectedForm && (
        <FormDetails
          isOpen={true}
          onClose={() => {
            setSelectedForm(null);
            resetQuickActionsSelection();
          }}
          link={selectedForm}
          isDarkMode={isDarkMode}
          userData={userData}
          matters={normalizedMatters}
          offsetTop={96}
        />
      )}

      {/* Selected Resource Details */}
      {selectedResource && (
        <ResourceDetails resource={selectedResource} onClose={() => {
          setSelectedResource(null);
          resetQuickActionsSelection();
        }} />
      )}

      {/* Rate Change Notification Modal */}
      <RateChangeModal
        isOpen={showRateChangeModal}
        onClose={() => setShowRateChangeModal(false)}
        year={rateChangeYear}
        clients={rateChangeClients}
        stats={rateChangeStats}
        isLoading={isLoadingRateChanges}
        onRefresh={refetchRateChanges}
        onMarkSent={markRateChangeSent}
        onMarkNA={markRateChangeNA}
        onMarkSentStreaming={markRateChangeSentStreaming}
        onMarkNAStreaming={markRateChangeNAStreaming}
        onUndo={undoRateChange}
        onUndoStreaming={undoRateChangeStreaming}
        currentUserName={currentUserName}
        userData={userData?.[0] || null}
        teamData={teamData}
        isDarkMode={isDarkMode}
      />

      {/* Toast notifications for attendance and other actions */}
      <OperationStatusToast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        details={toastDetails}
        isDarkMode={isDarkMode}
      />

  {/* Removed version and info button per request */}
    </div>
  );
};

export default Home;