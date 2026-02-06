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
import { ModalSkeleton } from '../../components/ModalSkeleton';
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
import { isAdminUser } from '../../app/admin';

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
const AnnualLeaveModal = lazy(() => import('../../CustomForms/AnnualLeaveModal').then(m => ({ default: m.AnnualLeaveModal })));
// NEW: Import placeholders for approvals & bookings
const AnnualLeaveApprovals = lazy(() => import('../../CustomForms/AnnualLeaveApprovals').then(m => ({ default: m.default || m })));
const AnnualLeaveBookings = lazy(() => import('../../CustomForms/AnnualLeaveBookings').then(m => ({ default: m.default || m })));
const BookSpaceForm = lazy(() => import('../../CustomForms/BookSpaceForm').then(m => ({ default: m.default || m })));
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
  demoModeEnabled?: boolean;
  isSwitchingUser?: boolean;
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
  { title: 'Update Attendance', icon: 'Attendance' },
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
    // Operations dashboard aesthetic: deep dark backgrounds with subtle brand gradients
    background: isDarkMode
      ? '#0a0e1a'
      : '#f8fafc',
    backgroundImage: isDarkMode
      ? 'radial-gradient(ellipse at top, rgba(13, 47, 96, 0.15) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(54, 144, 206, 0.08) 0%, transparent 50%)'
      : 'radial-gradient(ellipse at top, rgba(54, 144, 206, 0.06) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(135, 243, 243, 0.04) 0%, transparent 50%)',
    backgroundAttachment: 'fixed',
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
    minHeight: '100vh',
    boxSizing: 'border-box',
    position: 'relative',
    '&::before': {
      content: '""',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
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

const Home: React.FC<HomeProps> = ({ context, userData, enquiries, matters: providedMatters, instructionData: propInstructionData, onAllMattersFetched, onOutstandingBalancesFetched, onPOID6YearsFetched, onTransactionsFetched, teamData, onBoardroomBookingsFetched, onSoundproofBookingsFetched, isInMatterOpeningWorkflow = false, onImmediateActionsChange, originalAdminUser, featureToggles = {}, demoModeEnabled = false, isSwitchingUser = false }) => {
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

  // Enrich userData with holiday_entitlement from annualLeaveTeam
  const enrichedUserData = useMemo(() => {
    if (!userData?.[0]) return userData;
    const userInitials = String(userData[0]?.Initials || '').trim().toUpperCase();
    const teamEntry = annualLeaveTeam?.find(
      (t: any) => String(t?.Initials || '').trim().toUpperCase() === userInitials
    );
    if (teamEntry?.holiday_entitlement != null && userData[0]?.holiday_entitlement == null) {
      return [{
        ...userData[0],
        holiday_entitlement: Number(teamEntry.holiday_entitlement),
      }];
    }
    return userData;
  }, [userData, annualLeaveTeam]);

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
  const [enquiryMetricsBreakdown, setEnquiryMetricsBreakdown] = useState<unknown>(null);
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
  const [bespokePanelIcon, setBespokePanelIcon] = useState<string | null>(null);
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
  const [isLoadingWipClio, setIsLoadingWipClio] = useState<boolean>(true);
  const [isLoadingRecovered, setIsLoadingRecovered] = useState<boolean>(true);
  const [isLoadingEnquiryMetrics, setIsLoadingEnquiryMetrics] = useState<boolean>(true);
  const [futureLeaveRecords, setFutureLeaveRecords] = useState<AnnualLeaveRecord[]>([]);
  const [annualLeaveTotals, setAnnualLeaveTotals] = useState<any>(null);
  const [isActionsLoading, setIsActionsLoading] = useState<boolean>(true);
  const [hasStartedParallelFetch, setHasStartedParallelFetch] = useState<boolean>(false);

  const [allMatters, setAllMatters] = useState<Matter[] | null>(null);
  const [allMattersError, setAllMattersError] = useState<string | null>(null);
  const [isLoadingAllMatters, setIsLoadingAllMatters] = useState<boolean>(false);

  // State for refreshing time metrics
  const [isRefreshingTimeMetrics, setIsRefreshingTimeMetrics] = useState<boolean>(false);

  // Dev-only diagnostics for Time Metrics (WIP daily totals)
  const lastTimeMetricsLogRef = useRef<string>('');
  const devLogTimeMetrics = useCallback((label: string, data?: unknown) => {
    if (process.env.NODE_ENV === 'production') return;
    // eslint-disable-next-line no-console
    console.log(`[TimeMetrics] ${label}`, data ?? '');
  }, []);

  // Prevent overlapping WIP fetches and allow safe retries.
  const wipFetchAbortRef = useRef<AbortController | null>(null);
  const wipFetchAttemptRef = useRef<number>(0);
  const wipFetchKeyRef = useRef<string>('');
  const wipFetchRetryTimerRef = useRef<number | null>(null);

  // Dedupe parallel fetch to prevent stale overwrites
  const parallelFetchKeyRef = useRef<string>('');
  const fetchRunIdRef = useRef<number>(0); // Tracks latest parallel fetch run to ignore stale completions

  // Reset ref for QuickActionsBar to clear selection when panels close
  const resetQuickActionsSelectionRef = useRef<(() => void) | null>(null);

  const [timeMetricsCollapsed, setTimeMetricsCollapsed] = useState(false);
  const [conversionMetricsCollapsed, setConversionMetricsCollapsed] = useState(false);

  const [poid6Years, setPoid6Years] = useState<any[] | null>(null);
  const [isLoadingPOID6Years, setIsLoadingPOID6Years] = useState<boolean>(false);
  const [poid6YearsError, setPoid6YearsError] = useState<string | null>(null);

  // Consider immediate actions 'ready' only after we've actually started the parallel fetch.
  // This avoids an initial "All caught up" flash before attendance-derived actions appear.
  const immediateActionsReady = hasStartedParallelFetch && !isLoadingAttendance && !isLoadingAnnualLeave;

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

  const [attendanceRealtimePulseNonce, setAttendanceRealtimePulseNonce] = useState(0);
  const [attendanceRealtimeHighlightInitials, setAttendanceRealtimeHighlightInitials] = useState<string | null>(null);

  const [futureBookingsRealtimePulse, setFutureBookingsRealtimePulse] = useState<
    | { nonce: number; id?: string; spaceType?: 'Boardroom' | 'Soundproof Pod'; changeType?: string }
    | null
  >(null);

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
        const url = proxyBaseUrl
          ? `${proxyBaseUrl.replace(/\/$/, '')}/doc-workspace/pending-actions`
          : '/api/doc-workspace/pending-actions';
        const res = await fetch(url);
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


  // Listen for rate change modal open event (from UserBubble in prod)
  useEffect(() => {
    const handleOpenRateChange = () => setShowRateChangeModal(true);
    window.addEventListener('openRateChangeModal', handleOpenRateChange);
    return () => window.removeEventListener('openRateChangeModal', handleOpenRateChange);
  }, []);


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
    recoveredFeesInitialized.current = false; // Reset so new user can fetch
    parallelFetchKeyRef.current = ''; // Reset so parallel fetch runs for new user
    zeroWipFallbackRef.current = false; // Reset fallback flag for new user
    setHasStartedParallelFetch(false);
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
      console.log('🔍 Recovered fees - checking user:', {
        initials: currentUserData?.Initials,
        clioId: currentUserData?.['Clio ID'],
        entraId: currentUserData?.['Entra ID'] || currentUserData?.EntraID
      });

      let userClioId = currentUserData?.['Clio ID'] ? String(currentUserData['Clio ID']) : null;
      let userEntraId = currentUserData?.['Entra ID'] || currentUserData?.EntraID 
        ? String(currentUserData['Entra ID'] || currentUserData.EntraID) 
        : null;

      const isLZ = currentUserData?.Initials === 'LZ';
      
      // Use Alex fallback for LZ (dev user with no time data) or users genuinely missing IDs
      if ((isLZ || !userClioId && !userEntraId) && teamData) {
        const alex = teamData.find((t: any) => t.Initials === 'AC' || t.First === 'Alex');
        if (alex) {
          if (alex['Clio ID']) {
            userClioId = String(alex['Clio ID']);
          }
          if (alex['Entra ID']) {
            userEntraId = String(alex['Entra ID']);
          }
        }
        
        if (!userClioId && !userEntraId) {
          console.warn('⚠️ No Clio ID or Entra ID available for recovered fees (even after Alex fallback)');
          return;
        }
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
    if (demoModeEnabled) {
      setIsRefreshingTimeMetrics(false);
      return;
    }
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
      let userClioId = currentUserData?.['Clio ID'] ? String(currentUserData['Clio ID']) : null;
      let userEntraId = currentUserData?.EntraID ?? currentUserData?.['Entra ID'] 
        ? String(currentUserData.EntraID ?? currentUserData?.['Entra ID']) 
        : null;
      
      const isLZ = currentUserData?.Initials === 'LZ';
      
      // Use Alex fallback for LZ (dev user with no time data) or users genuinely missing IDs
      if ((isLZ || !userClioId && !userEntraId) && teamData) {
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
      
      // Parallel fetch of WIP and recovered fees
      await Promise.all([
        // Fetch WIP using same endpoint as parallel fetch
        (async () => {
          try {
            if (!userEntraId) return;
            const resp = await fetch(`/api/home-wip?entraId=${encodeURIComponent(userEntraId)}`, {
              credentials: 'include',
              headers: { Accept: 'application/json' }
            });
            
            if (resp.ok) {
              const data = await resp.json();
              if (data && typeof data === 'object' && !('error' in data)) {
                cachedWipClio = data;
                setWipClioData(data);
                setWipClioError(null);
                setIsLoadingWipClio(false);
              }
            }
          } catch (err) {
            console.warn('[handleRefreshTimeMetrics] WIP fetch failed:', err instanceof Error ? err.message : String(err));
          }
        })(),
        // Fetch recovered fees
        (async () => {
          try {
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
          } catch (err) {
            console.warn('[handleRefreshTimeMetrics] Recovered fees fetch failed:', err instanceof Error ? err.message : String(err));
          }
        })(),
      ]);
      
      debugLog('✅ Time metrics refreshed');
    } catch (error) {
      debugWarn('❌ Error refreshing time metrics:', error);
    } finally {
      setIsRefreshingTimeMetrics(false);
      setIsLoadingWipClio(false);
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

  const mapAnnualLeaveArray = (raw: unknown): AnnualLeaveRecord[] => {
    if (!Array.isArray(raw)) return [];
    return raw.map((rec: any) => {
      const leaveType = rec.leave_type ?? rec.leaveType;
      return {
        id: String(rec.request_id ?? rec.id ?? rec.ID ?? ''),
        request_id: rec.request_id ?? rec.id ?? rec.ID ?? undefined,
        person: String(rec.person ?? rec.fe ?? rec.initials ?? rec.user_initials ?? rec.userInitials ?? '').trim(),
        start_date: rec.start_date ?? rec.Start_Date ?? rec.startDate ?? '',
        end_date: rec.end_date ?? rec.End_Date ?? rec.endDate ?? '',
        reason: rec.reason ?? rec.Reason ?? rec.notes ?? '',
        status: rec.status ?? '',
        days_taken: rec.days_taken ?? rec.total_days ?? rec.totalDays,
        leave_type: typeof leaveType === 'string' ? leaveType : undefined,
        rejection_notes: rec.rejection_notes ?? rec.rejectionNotes ?? undefined,
        approvers: Array.isArray(rec.approvers) ? rec.approvers : [],
        hearing_confirmation: rec.hearing_confirmation ?? rec.hearingConfirmation,
        hearing_details: rec.hearing_details ?? rec.hearingDetails,
        requested_at: rec.requested_at ?? rec.requestedAt ?? undefined,
        approved_at: rec.approved_at ?? rec.approvedAt ?? undefined,
        booked_at: rec.booked_at ?? rec.bookedAt ?? undefined,
        updated_at: rec.updated_at ?? rec.updatedAt ?? undefined,
      };
    });
  };

  const refreshAnnualLeaveData = async (
    initialsOverride?: string,
    options?: { forceRefresh?: boolean }
  ) => {
    const initials = String(initialsOverride || storedUserInitials.current || userData?.[0]?.Initials || '').trim();
    if (!initials) return;

    try {
      const forceRefresh = Boolean(options?.forceRefresh);
      const url = forceRefresh ? '/api/attendance/getAnnualLeave?forceRefresh=true' : '/api/attendance/getAnnualLeave';

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInitials: initials }),
      });

      if (!response.ok) return;
      const data = await response.json();

      const mappedAnnualLeave = mapAnnualLeaveArray(data.annual_leave);
      const mappedFutureLeave = mapAnnualLeaveArray(data.future_leave);
      const mappedAllData = mapAnnualLeaveArray(data.all_data);

      cachedAnnualLeave = mappedAnnualLeave;
      cachedFutureLeaveRecords = mappedFutureLeave;
      cachedAnnualLeaveError = null;

      setAnnualLeaveRecords(mappedAnnualLeave);
      setFutureLeaveRecords(mappedFutureLeave);
      setAnnualLeaveAllData(mappedAllData);
      if (data.user_details?.totals) {
        setAnnualLeaveTotals(data.user_details.totals);
      }
      if (Array.isArray(data.team)) {
        setAnnualLeaveTeam(data.team);
      }
    } catch (error) {
      console.warn('[Home] Failed to refresh annual leave data:', error);
    }
  };

  // Add the following function to update the approval state:
const handleApprovalUpdate = (updatedRequestId: string, newStatus: string) => {
  // Immediately remove from the approvals list, and update history so it doesn't reappear as 'requested'
  setAnnualLeaveRecords((prevRecords) => prevRecords.filter(record => record.id !== updatedRequestId));
  setFutureLeaveRecords((prev) => prev.map(r => (r.id === updatedRequestId ? { ...r, status: newStatus } : r)));
  setAnnualLeaveAllData((prevAllData) =>
    prevAllData.map(r => (r.id === updatedRequestId ? { ...r, status: newStatus } : r))
  );

  // Keep caches consistent so a remount/cache-restore can't resurrect processed items
  if (cachedAnnualLeave) {
    cachedAnnualLeave = cachedAnnualLeave.filter((r) => r.id !== updatedRequestId);
  }
  if (cachedFutureLeaveRecords) {
    cachedFutureLeaveRecords = cachedFutureLeaveRecords.map((r) =>
      r.id === updatedRequestId ? { ...r, status: newStatus } : r
    );
  }

  // Backstop: refetch canonical data from API so UI stays consistent everywhere
  void refreshAnnualLeaveData(undefined, { forceRefresh: true });
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

  // Realtime: when annual leave changes (approved/edited/created), refresh so other users' approvals update.
  useEffect(() => {
    if (!userInitials) return;

    let eventSource: EventSource | null = null;
    let refreshTimer: number | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(() => {
        void refreshAnnualLeaveData(undefined, { forceRefresh: true });
      }, 350);
    };

    try {
      eventSource = new EventSource('/api/attendance/annual-leave/stream');
      eventSource.addEventListener('annualLeave.changed', scheduleRefresh as EventListener);
      eventSource.addEventListener('connected', () => {
        // Optional: on connect, do nothing; initial fetch happens via existing flows.
      });
      eventSource.onerror = () => {
        // Browser will auto-retry; keep handler light.
      };
    } catch (error) {
      console.warn('[Home] Failed to connect annual leave realtime stream:', error);
    }

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      try {
        if (eventSource) {
          eventSource.close();
        }
      } catch {
        // ignore
      }
    };
  }, [userInitials]);

  // Realtime: when attendance changes (someone confirms), refresh team attendance view.
  useEffect(() => {
    if (!userInitials) return;

    let eventSource: EventSource | null = null;
    let refreshTimer: number | null = null;

    const scheduleRefresh = (evt?: Event) => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      try {
        const messageEvent = evt as MessageEvent | undefined;
        const raw = typeof messageEvent?.data === 'string' ? messageEvent.data : '';
        const payload = raw ? JSON.parse(raw) : null;
        const initials = payload?.initials ? String(payload.initials).toUpperCase() : null;
        if (initials) {
          setAttendanceRealtimeHighlightInitials(initials);
        }
        setAttendanceRealtimePulseNonce((n) => n + 1);
      } catch {
        // Non-blocking
      }

      refreshTimer = window.setTimeout(async () => {
        try {
          const response = await fetch('/api/attendance/getAttendance?forceRefresh=true', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          if (!response.ok) return;
          const data = await response.json();
          if (!data?.success || !data?.attendance) return;

          const transformedAttendance = data.attendance.map((member: any) => ({
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
            weeks: member.weeks || {},
          }));

          cachedAttendance = { attendance: transformedAttendance, team: data.team || [] };
          cachedAttendanceError = null;

          setAttendanceRecords(transformedAttendance);
          setAttendanceTeam(data.team || []);
        } catch (error) {
          console.warn('[Home] Failed to refresh attendance (realtime):', error);
        }
      }, 350);
    };

    try {
      eventSource = new EventSource('/api/attendance/attendance/stream');
      eventSource.addEventListener('attendance.changed', scheduleRefresh as EventListener);
      eventSource.onerror = () => {
        // Browser will auto-retry
      };
    } catch (error) {
      console.warn('[Home] Failed to connect attendance realtime stream:', error);
    }

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      try {
        if (eventSource) {
          eventSource.close();
        }
      } catch {
        // ignore
      }
    };
  }, [userInitials]);

  // Realtime: when future bookings change, refresh bookings so other users see updates.
  useEffect(() => {
    if (!userInitials) return;

    let eventSource: EventSource | null = null;
    let refreshTimer: number | null = null;

    const scheduleRefresh = (evt?: Event) => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }

      try {
        const messageEvent = evt as MessageEvent | undefined;
        const raw = typeof messageEvent?.data === 'string' ? messageEvent.data : '';
        const payload = raw ? JSON.parse(raw) : null;
        const id = payload?.id !== undefined ? String(payload.id) : undefined;
        const spaceType = payload?.spaceType ? String(payload.spaceType) : undefined;
        const changeType = payload?.changeType ? String(payload.changeType) : undefined;

        if (id || spaceType || changeType) {
          setFutureBookingsRealtimePulse((prev) => ({
            nonce: (prev?.nonce || 0) + 1,
            id,
            spaceType: (spaceType === 'Boardroom' || spaceType === 'Soundproof Pod') ? spaceType : undefined,
            changeType,
          }));
        } else {
          setFutureBookingsRealtimePulse((prev) => ({ nonce: (prev?.nonce || 0) + 1 }));
        }
      } catch {
        setFutureBookingsRealtimePulse((prev) => ({ nonce: (prev?.nonce || 0) + 1 }));
      }

      refreshTimer = window.setTimeout(async () => {
        try {
          const response = await fetch('/api/future-bookings?forceRefresh=true');
          if (!response.ok) return;
          const data = await response.json();
          setFutureBookings(data);
        } catch (error) {
          console.warn('[Home] Failed to refresh future bookings (realtime):', error);
        }
      }, 350);
    };

    try {
      eventSource = new EventSource('/api/future-bookings/stream');
      eventSource.addEventListener('futureBookings.changed', scheduleRefresh as EventListener);
      eventSource.onerror = () => {
        // Browser will auto-retry
      };
    } catch (error) {
      console.warn('[Home] Failed to connect future bookings realtime stream:', error);
    }

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer);
      }
      try {
        if (eventSource) {
          eventSource.close();
        }
      } catch {
        // ignore
      }
    };
  }, [userInitials]);

  // Quick Actions bar ready state - show skeletons until user data is available
  const quickActionsReady = hasStartedParallelFetch && Boolean(userInitials);

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

  // Migrate tab: include matters opened in the rate-change year (migration source-of-truth)
  const {
    clients: rateChangeMigrateClients,
  } = useRateChangeData(rateChangeYear, currentUserName, showRateChangeModal, { includeOpenedFromYear: true });

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
    if (!useLocalData) return;
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
      const prevMonthEnd = new Date(prevMonthStart);
      const prevMonthDays = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth() + 1, 0).getDate();
      prevMonthEnd.setDate(Math.min(today.getDate(), prevMonthDays));
      prevMonthEnd.setHours(23, 59, 59, 999);

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
  }, [enquiries, currentUserEmail, userInitials, useLocalData]);

  // Helper function to derive approvers for annual leave requests based on AOW
  const deriveApproversForPerson = useCallback((personRaw: unknown): string[] => {
    const person = String(personRaw ?? '').trim();
    const initials = person.toUpperCase();

    const teamRows: any[] = Array.isArray(teamData)
      ? (teamData as any[])
      : Array.isArray(annualLeaveTeam)
        ? (annualLeaveTeam as any[])
        : [];

    const match = teamRows.find((t) => String(t?.Initials ?? '').trim().toUpperCase() === initials);
    const aowRaw = String(match?.AOW ?? '').toLowerCase();

    const aowList = aowRaw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    const isConstruction = aowList.some((x) => x === 'cs' || x.includes('construction'));
    const secondaryApprover = isConstruction ? 'JW' : 'AC';
    return ['LZ', secondaryApprover];
  }, [teamData, annualLeaveTeam]);

  // ═════════════════════════════════════════════════════════════════════════════
  // PARALLEL DATA FETCH - Combines attendance, annual leave, WIP, and enquiries
  // Fires all requests simultaneously to reduce waterfall delay by ~600-800ms
  // ═════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    console.log('[parallel-fetch] Effect triggered', { useLocalData, hasUserData: !!userData?.[0] });
    
    if (useLocalData) {
      // Local data mode - skip all fetches
      console.log('[parallel-fetch] Skipping - local data mode');
      setHasStartedParallelFetch(true);
      setIsLoadingAttendance(false);
      setIsLoadingAnnualLeave(false);
      setIsLoadingWipClio(false);
      setIsLoadingEnquiryMetrics(false);
      setIsActionsLoading(false);
      return;
    }

    // Wait for user data before fetching
    if (!userData?.[0]) {
      console.log('[parallel-fetch] Waiting for userData');
      return;
    }

    // Read directly from userData to avoid stale state during user switches
    const email = (userData[0]?.Email || '').toLowerCase().trim();
    const initials = (userData[0]?.Initials || '').toUpperCase().trim();
    let entraId = userData?.[0]?.EntraID || userData?.[0]?.['Entra ID'] || '';
    
    // Use Alex fallback for LZ (dev user with no time data)
    const isLZ = initials === 'LZ';
    if (isLZ && teamData) {
      const alex = teamData.find((t: any) => t.Initials === 'AC' || t.First === 'Alex');
      if (alex?.['Entra ID']) {
        entraId = String(alex['Entra ID']);
      }
    }
    
    // Dedupe: skip if same request already in progress
    const requestKey = `parallel:${email}:${initials}:${entraId}`;
    if (parallelFetchKeyRef.current === requestKey) {
      console.log('[parallel-fetch] Skipping duplicate request', { requestKey });
      setHasStartedParallelFetch(true);
      return;
    }
    parallelFetchKeyRef.current = requestKey;

    console.log('[parallel-fetch] Starting parallel fetch', { email, initials, entraId, requestKey });

    const runId = Date.now();
    fetchRunIdRef.current = runId;

    const fetchAllData = async () => {
      try {
        setHasStartedParallelFetch(true);
        setIsLoadingAttendance(true);
        setIsLoadingAnnualLeave(true);
        setIsActionsLoading(true);
        setIsLoadingWipClio(true);
        setIsLoadingEnquiryMetrics(true);
        console.log('[parallel-fetch] Firing Promise.all...');
        // Start all requests in parallel
        const [attendanceRes, annualLeaveRes, wipRes, enquiriesRes] = await Promise.all([
          fetch('/api/attendance/getAttendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          }),
          fetch('/api/attendance/getAnnualLeave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userInitials: initials })
          }),
          entraId
            ? fetch(`/api/home-wip?entraId=${encodeURIComponent(entraId)}`, {
                credentials: 'include',
                headers: { Accept: 'application/json' }
              })
            : Promise.resolve(null),
          email || initials
            ? fetch('/api/home-enquiries?' + (email ? 'email=' + encodeURIComponent(email) : '') + '&' + (initials ? 'initials=' + encodeURIComponent(initials) : ''), {
                headers: { Accept: 'application/json' }
              })
            : Promise.resolve(null)
        ]);

        console.log('[parallel-fetch] All requests completed', {
          attendance: attendanceRes.ok,
          annualLeave: annualLeaveRes.ok,
          wip: wipRes ? wipRes.ok : 'skipped',
          enquiries: enquiriesRes ? enquiriesRes.ok : 'skipped',
          runId,
          activeRunId: fetchRunIdRef.current,
        });

        if (fetchRunIdRef.current !== runId) {
          console.log('[parallel-fetch] Stale fetch result, ignoring', { runId, activeRunId: fetchRunIdRef.current });
          return;
        }

        // Process attendance
        if (attendanceRes.ok) {
          const data = await attendanceRes.json();
          if (data.success && data.attendance) {
            const transformedAttendance = data.attendance.map((member: any) => ({
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
              weeks: member.weeks || {},
            }));
            cachedAttendance = { attendance: transformedAttendance, team: data.team || [] };
            setAttendanceRecords(transformedAttendance);
            setAttendanceTeam(data.team || []);
            console.log('[parallel-fetch] Attendance data set', { recordCount: transformedAttendance.length, teamCount: data.team?.length || 0 });
          }
        }
        setIsLoadingAttendance(false);

        // Process annual leave
        if (annualLeaveRes.ok) {
          const data = await annualLeaveRes.json();
          if (data.annual_leave) {
            const mappedAnnualLeave: AnnualLeaveRecord[] = data.annual_leave.map((rec: any) => {
              const leaveType = rec.leave_type ?? rec.leaveType;
              const personInitials = String(rec.person ?? rec.fe ?? rec.initials ?? rec.user_initials ?? rec.userInitials ?? '').trim();
              // Use backend approvers if present, otherwise calculate based on AOW
              const approvers = Array.isArray(rec.approvers) && rec.approvers.length > 0 
                ? rec.approvers 
                : deriveApproversForPerson(personInitials);
              return {
                id: String(rec.request_id ?? rec.id ?? rec.ID ?? ''),
                request_id: rec.request_id ?? rec.id ?? rec.ID ?? undefined,
                person: personInitials,
                start_date: rec.start_date ?? rec.Start_Date ?? rec.startDate ?? '',
                end_date: rec.end_date ?? rec.End_Date ?? rec.endDate ?? '',
                reason: rec.reason ?? rec.Reason ?? rec.notes ?? '',
                status: rec.status ?? '',
                days_taken: rec.days_taken ?? rec.total_days ?? rec.totalDays,
                leave_type: typeof leaveType === 'string' ? leaveType : undefined,
                rejection_notes: rec.rejection_notes ?? rec.rejectionNotes ?? undefined,
                approvers,
                hearing_confirmation: rec.hearing_confirmation ?? rec.hearingConfirmation,
                hearing_details: rec.hearing_details ?? rec.hearingDetails,
                requested_at: rec.requested_at ?? rec.requestedAt ?? undefined,
                approved_at: rec.approved_at ?? rec.approvedAt ?? undefined,
                booked_at: rec.booked_at ?? rec.bookedAt ?? undefined,
                updated_at: rec.updated_at ?? rec.updatedAt ?? undefined,
              };
            });
            cachedAnnualLeave = mappedAnnualLeave;
            setAnnualLeaveRecords(mappedAnnualLeave);
          }
          if (data.future_leave) {
            const mappedFutureLeave: AnnualLeaveRecord[] = data.future_leave.map((rec: any) => {
              const leaveType = rec.leave_type ?? rec.leaveType;
              const personInitials = String(rec.person ?? rec.fe ?? rec.initials ?? rec.user_initials ?? rec.userInitials ?? '').trim();
              const approvers = Array.isArray(rec.approvers) && rec.approvers.length > 0 
                ? rec.approvers 
                : deriveApproversForPerson(personInitials);
              return {
                id: String(rec.request_id ?? rec.id ?? rec.ID ?? ''),
                request_id: rec.request_id ?? rec.id ?? rec.ID ?? undefined,
                person: personInitials,
                start_date: rec.start_date ?? rec.Start_Date ?? rec.startDate ?? '',
                end_date: rec.end_date ?? rec.End_Date ?? rec.endDate ?? '',
                reason: rec.reason ?? rec.Reason ?? rec.notes ?? '',
                status: rec.status ?? '',
                days_taken: rec.days_taken ?? rec.total_days ?? rec.totalDays,
                leave_type: typeof leaveType === 'string' ? leaveType : undefined,
                rejection_notes: rec.rejection_notes ?? rec.rejectionNotes ?? undefined,
                approvers,
                hearing_confirmation: rec.hearing_confirmation ?? rec.hearingConfirmation,
                hearing_details: rec.hearing_details ?? rec.hearingDetails,
                requested_at: rec.requested_at ?? rec.requestedAt ?? undefined,
                approved_at: rec.approved_at ?? rec.approvedAt ?? undefined,
                booked_at: rec.booked_at ?? rec.bookedAt ?? undefined,
                updated_at: rec.updated_at ?? rec.updatedAt ?? undefined,
              };
            });
            cachedFutureLeaveRecords = mappedFutureLeave;
            setFutureLeaveRecords(mappedFutureLeave);
          }
          if (data.user_details?.totals) {
            setAnnualLeaveTotals(data.user_details.totals);
          }
          if (data.all_data) {
            setAnnualLeaveAllData(mapAnnualLeaveArray(data.all_data));
          }
          if (Array.isArray(data.team)) {
            setAnnualLeaveTeam(data.team);
          }
        }
        setIsLoadingAnnualLeave(false);
        setIsActionsLoading(false);

        // Process WIP
        if (wipRes && wipRes.ok) {
          const data = await wipRes.json();
          console.log('[parallel-fetch] WIP data received', { hasCurrentWeek: !!data.current_week, hasError: !!data.error });
          if (data && typeof data === 'object' && 'error' in data && (data as any).error) {
            setWipClioError(String((data as any).error));
          } else {
            const daily = (data as any)?.current_week?.daily_data || {};
            const hasHours = Object.values(daily).some((d: any) => (Number(d?.total_hours) || 0) > 0);
            const hasAmount = Object.values(daily).some((d: any) => (Number(d?.total_amount) || 0) > 0);
            const dailyKeys = Object.keys(daily);

            if (!hasHours && !hasAmount && dailyKeys.length > 0) {
              console.log('[parallel-fetch] Fetching from reporting endpoint');
              setIsLoadingWipClio(false); // End loading for lightweight endpoint
              if (!zeroWipFallbackRef.current) {
                zeroWipFallbackRef.current = true;
                  handleRefreshTimeMetrics?.(); // Fallback manages isRefreshingTimeMetrics
              }
            } else if (dailyKeys.length === 0) {
              console.error('[parallel-fetch] WIP endpoint returned no daily_data structure - possible API issue');
              setIsLoadingWipClio(false);
              setWipClioError('No time data available');
            } else {
              cachedWipClio = data as any;
              setWipClioData(cachedWipClio);
              setWipClioError(null);
              const keys = Object.keys(cachedWipClio?.current_week?.daily_data || {});
              console.log('[parallel-fetch] WIP state updated', { runId, keys, today: cachedWipClio?.current_week?.daily_data?.[formatDateLocal(new Date())] });
              setIsLoadingWipClio(false);
            }
          }
        }
        if (wipClioData && !isLoadingWipClio) {
          setIsLoadingWipClio(false);
        }

        // Process enquiries
        if (enquiriesRes && enquiriesRes.ok) {
          const data = await enquiriesRes.json();
          console.log('[parallel-fetch] Enquiries data received', data);
          setEnquiriesToday(data.enquiriesToday ?? 0);
          setEnquiriesWeekToDate(data.enquiriesWeekToDate ?? 0);
          setEnquiriesMonthToDate(data.enquiriesMonthToDate ?? 0);
          setPrevEnquiriesToday(data.prevEnquiriesToday ?? 0);
          setPrevEnquiriesWeekToDate(data.prevEnquiriesWeekToDate ?? 0);
          setPrevEnquiriesMonthToDate(data.prevEnquiriesMonthToDate ?? 0);
          setEnquiryMetricsBreakdown((data as any)?.breakdown ?? null);
        }
        setIsLoadingEnquiryMetrics(false);

        console.log('[parallel-fetch] All state updates complete');

      } catch (error: any) {
        console.error('[parallel-fetch] Error:', error);
        // Set all loading states to false on error
        setIsLoadingAttendance(false);
        setIsLoadingAnnualLeave(false);
        setIsLoadingWipClio(false);
        setIsLoadingEnquiryMetrics(false);
        setIsActionsLoading(false);
      }
    };

    fetchAllData();

    return () => {
      // Allow the effect to rerun after Strict Mode cleanup or user switches
      parallelFetchKeyRef.current = '';
    };
  }, [userData?.[0]?.EntraID, userData?.[0]?.['Entra ID'], userData?.[0]?.Email, useLocalData, teamData]);

  // ═════════════════════════════════════════════════════════════════════════════
  // LEGACY EFFECTS BELOW - Now skipped when parallel fetch completes
  // TODO: Remove after confirming parallel fetch works correctly
  // ═════════════════════════════════════════════════════════════════════════════

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
      const deriveApproversForPerson = (personRaw: unknown): string[] => {
        const person = String(personRaw ?? '').trim();
        const initials = person.toUpperCase();

        const teamRows: any[] = Array.isArray(teamData)
          ? (teamData as any[])
          : Array.isArray(annualLeaveTeam)
            ? (annualLeaveTeam as any[])
            : [];

        const match = teamRows.find((t) => String(t?.Initials ?? '').trim().toUpperCase() === initials);
        const aowRaw = String(match?.AOW ?? '').toLowerCase();

        const aowList = aowRaw
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);

        const isConstruction = aowList.some((x) => x === 'cs' || x.includes('construction'));
        const secondaryApprover = isConstruction ? 'JW' : 'AC';
        return ['LZ', secondaryApprover];
      };

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
      setAnnualLeaveRecords(
        ((localAnnualLeave as any).annual_leave || []).map((rec: any) => ({
          ...rec,
          approvers: deriveApproversForPerson(rec?.person),
        }))
      );
      setFutureLeaveRecords(
        ((localAnnualLeave as any).future_leave || []).map((rec: any) => ({
          ...rec,
          approvers: deriveApproversForPerson(rec?.person),
        }))
      );
      setAnnualLeaveAllData(
        mapAnnualLeaveArray((localAnnualLeave as any).all_data).map((rec) => ({
          ...rec,
          approvers: deriveApproversForPerson(rec?.person),
        }))
      );
      setAnnualLeaveTeam((localAnnualLeave as any).team || []);
      if ((localAnnualLeave as any).user_details?.totals) {
        setAnnualLeaveTotals((localAnnualLeave as any).user_details.totals);
      }
      setIsLoadingAttendance(false);
      setIsLoadingAnnualLeave(false);
      setIsActionsLoading(false);
      return;
    }
    // Parallel fetch effect now handles all live data fetching
    // This effect only restores cache and handles local data
    // Only fetch if no cached data exists
    if (!cachedAttendance && !cachedAttendanceError && !userData?.[0]) {
      // Skipping fetch - parallel effect will handle it
      return;
    }
    if (cachedAttendance || userData?.[0]) {
      // Cache already loaded or parallel fetch in progress
      return;
    }
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
              setAnnualLeaveAllData(mapAnnualLeaveArray(annualLeaveData.all_data));
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

  // Dedicated /api/home-wip route for Home time metrics (isolated from heavy reporting route)
  // NOTE: Now handled by parallel fetch effect above - this only restores cache
  useEffect(() => {
    // Parallel fetch handles all live data - this only manages cache
    if (!userData?.[0]) {
      return;
    }

    // Use cache if already set (from parallel fetch or previous load)
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
      return;
    }

    if (useLocalData) {
      debugLog('📂 Using local WIP data');
      cachedWipClio = localWipClio as any;
      setWipClioData(cachedWipClio);
      setIsLoadingWipClio(false);
      return;
    }

    // Parallel fetch handles all new data - skip fetching here
    return;

    /* ═══ LEGACY WIP FETCH CODE - All disabled, parallel fetch handles this ═══
    (entire legacy effect body removed to prevent TypeScript errors)
    */
  }, [userData?.[0]?.EntraID, userData?.[0]?.['Entra ID'], userData?.[0]?.['Clio ID'], teamData?.length, useLocalData, devLogTimeMetrics]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Fetch enquiry & conversion metrics from dedicated lightweight endpoint
  // NOTE: Now handled by parallel fetch effect - this is disabled
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Parallel fetch handles all data - skip here
    if (useLocalData) {
      setIsLoadingEnquiryMetrics(false);
      return;
    }

    const email = currentUserEmail || '';
    const initials = userInitials || '';
    if (!email && !initials) {
      setIsLoadingEnquiryMetrics(false);
      return;
    }

    // Parallel fetch handles this now
    return;

    /* ═══ LEGACY ENQUIRY FETCH CODE - All disabled, parallel fetch handles this ═══
    (entire legacy effect body removed to prevent TypeScript errors)
    */
  }, [currentUserEmail, userInitials, useLocalData]);

  // Dev-only: log derived values whenever the WIP payload changes (helps diagnose "0 on load")
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const clioData: any = wipClioData ?? {};
    const daily = clioData?.current_week?.daily_data || {};
    const d = new Date();
    const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const snapshot = JSON.stringify({
      todayKey,
      keys: Object.keys(daily),
      today: daily[todayKey] || null,
      loading: isLoadingWipClio,
      err: wipClioError,
    });
    if (snapshot === lastTimeMetricsLogRef.current) return;
    lastTimeMetricsLogRef.current = snapshot;
    // eslint-disable-next-line no-console
    console.log('[TimeMetrics] WIP state changed', JSON.parse(snapshot));
  }, [wipClioData, isLoadingWipClio, wipClioError]);

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
    autoStart: !demoModeEnabled,
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
  

  // Outstanding Balances: Fetch user balances first (fast), then firm-wide in background
  useEffect(() => {
    if (demoModeEnabled || useLocalData) {
      if (useLocalData) {
        const data = localOutstandingBalances as any;
        cachedOutstandingBalances = data;
        onOutstandingBalancesFetched?.(data);
        setOutstandingBalancesData(data);
      }
      return;
    }

    const userEntraId = userData?.[0]?.EntraID || userData?.[0]?.['Entra ID'];
    if (!userEntraId) return;

    let cancelled = false;

    const fetchBalances = async () => {
      try {
        // 1. Fetch user balances first (fast - only your matters)
        console.log('[OutstandingBalances] Fetching user balances first...');
        const userResponse = await fetch(`/api/outstanding-balances/user/${userEntraId}`, {
          credentials: 'include',
          headers: { Accept: 'application/json' }
        });

        if (userResponse.ok && !cancelled) {
          const userData = await userResponse.json();
          console.log(`[OutstandingBalances] User balances loaded: ${userData.data?.length || 0} records`);
          setOutstandingBalancesData(userData);
          onOutstandingBalancesFetched?.(userData);
        }

        // 2. Then fetch full firm balances in background (slower - all 127 records)
        // Note: Stream might handle this instead, commenting out for now
        // setTimeout(async () => {
        //   if (cancelled) return;
        //   const firmResponse = await fetch('/api/outstanding-balances', {
        //     credentials: 'include',
        //     headers: { Accept: 'application/json' }
        //   });
        //   if (firmResponse.ok && !cancelled) {
        //     const firmData = await firmResponse.json();
        //     cachedOutstandingBalances = firmData;
        //     setOutstandingBalancesData(firmData);
        //   }
        // }, 2000);

      } catch (error) {
        console.error('[OutstandingBalances] Error fetching balances:', error);
      }
    };

    fetchBalances();

    return () => { cancelled = true; };
  }, [useLocalData, demoModeEnabled, userData?.[0]?.EntraID, userData?.[0]?.['Entra ID']]);  

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
  const saveAttendance = async (weekStart: string, attendanceDays: string, overrideInitials?: string): Promise<void> => {
  debugLog('saveAttendance', weekStart, attendanceDays, overrideInitials ? `(for ${overrideInitials})` : '(self)');
  // Force endpoint testing - set to false to test real endpoint
  const useLocalData = false; // Changed from: process.env.REACT_APP_USE_LOCAL_DATA === 'true' || window.location.hostname === 'localhost';
  debugLog('useLocalData:', useLocalData);
  const initials = overrideInitials || userInitials || (userData?.[0]?.Initials || '');
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

  // Use checkIsLocalDev - respects "View as Production" toggle
  const isLocalhost = checkIsLocalDev(featureToggles);


  const normalizeDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '';
    return dateStr.substring(0, 10);
  };

  const toIsoDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const relevantMonday = (() => {
    const monday = getMondayOfCurrentWeek();
    if (isThursdayAfterMidday) monday.setDate(monday.getDate() + 7);
    return monday;
  })();

  // If currentUserRecord is not found (user not in attendance data), treat as confirmed to avoid nagging.
  // We consider the week "confirmed" if:
  // - there's an explicit Confirmed_At timestamp (e.g. updateAttendance response), OR
  // - getAttendance returned a week entry for the relevant week key.
  const hasConfirmedWeekEntry = Boolean(
    (currentUserRecord as any)?.Confirmed_At ||
    (currentUserRecord as any)?.weeks?.[relevantWeekKey]?.attendance?.trim()
  );

  // Also support the "week row" format inserted by saveAttendance (Initials + Week_Start).
  const relevantWeekStartIso = toIsoDate(relevantMonday);
  const hasConfirmedWeekRow = attendanceRecords.some((rec: any) => {
    const initials = (rec?.Initials || '').toLowerCase();
    const weekStart = normalizeDate(rec?.Week_Start);
    if (!initials || !weekStart) return false;
    if (initials !== userInitials.toLowerCase()) return false;
    if (weekStart !== relevantWeekStartIso) return false;
    return Boolean(rec?.Confirmed_At || rec?.Attendance_Days);
  });

  const currentUserConfirmed = isLocalhost || !currentUserRecord || hasConfirmedWeekEntry || hasConfirmedWeekRow;
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
      bal.associated_matter_ids?.some((id: number | string) => userMatterIDs.includes(Number(id)))
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
  balance.associated_matter_ids?.some((id: number | string) => userMatterIDs.includes(Number(id)))
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

    const { currentMonth, currentYear } = useMemo(() => {
      const now = new Date();
      return { currentMonth: now.getMonth(), currentYear: now.getFullYear() };
    }, []);

    const mattersOpenedCount = useMemo(() => {
      if (!normalizedMatters) return 0;
      return normalizedMatters.filter((m) => {
        const openDate = parseOpenDate((m as any).openDate);
        if (!openDate) return false;
        const isCurrentMonth = openDate.getMonth() === currentMonth && openDate.getFullYear() === currentYear;
        if (!isCurrentMonth) return false;
        const role = (m as any).role;
        return role === 'responsible' || role === 'both';
      }).length;
    }, [normalizedMatters, currentMonth, currentYear]);

    const firmMattersOpenedCount = useMemo(() => {
      if (!normalizedMatters) return 0;
      return normalizedMatters.filter((m) => {
        const openDate = parseOpenDate((m as any).openDate);
        if (!openDate) return false;
        return openDate.getMonth() === currentMonth && openDate.getFullYear() === currentYear;
      }).length;
    }, [normalizedMatters, currentMonth, currentYear]);

  // Removed no-op effect that could trigger unnecessary renders
  // useEffect(() => {}, [userMatterIDs, outstandingBalancesData]);

  const metricsData = useMemo(() => {
    const userInitials = userData?.[0]?.Initials?.trim().toLowerCase() || '';

    const clioData = wipClioData ?? {};
    const currentWeekData = clioData.current_week ?? {};
    const lastWeekData = clioData.last_week ?? {};

    const getDailyTotals = (week: any): Record<string, { total_hours?: number; total_amount?: number }> => {
      const daily = week?.daily_data;
      if (!daily || typeof daily !== 'object') return {};
      return daily as Record<string, { total_hours?: number; total_amount?: number }>;
    };

    const currentDaily = getDailyTotals(currentWeekData);
    const lastDaily = getDailyTotals(lastWeekData);

    const todayKey = formatDateLocal(new Date());
    const yesterdayKey = formatDateLocal(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const lastWeekSameDayKey = formatDateLocal(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

    const todayTotals = currentDaily[todayKey] || {};
    const dayOfWeek = new Date().getDay();
    const isMonday = dayOfWeek === 1;
    const yesterdayTotals = currentDaily[yesterdayKey] || {};
    const lastWeekSameDayTotals = lastDaily[lastWeekSameDayKey] || {};
    // For "Time Today" comparison (used by the Previous toggle):
    // - Primary: same weekday last week
    // - Secondary (shown explicitly as 'Yesterday' when available): yesterday, except Monday
    const prevTodayTotals = lastWeekSameDayTotals;
    const showYesterdayTotals = !isMonday && ((Number(yesterdayTotals?.total_hours) || 0) > 0 || (Number(yesterdayTotals?.total_amount) || 0) > 0);

    let totalTimeThisWeek = 0;
    if (currentWeekData.daily_data) {
      Object.values(currentWeekData.daily_data).forEach((day: any) => {
        totalTimeThisWeek += day?.total_hours ?? 0;
      });
    }

    let totalTimeLastWeek = 0;
    if (lastWeekData.daily_data) {
      Object.values(lastWeekData.daily_data).forEach((day: any) => {
        totalTimeLastWeek += day?.total_hours ?? 0;
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

    // Week-to-date (Mon..today) totals/averages for the dial-style metric (target = 6h/day).
    // Use only elapsed working days so far; exclude booked leave days from the denominator.
    const todayKeyForAvg = formatDateLocal(new Date());
    const elapsedWorkWeekDays = workWeekDays.filter((d) => {
      // Compare by date-only key so "today" counts immediately (not only after 23:59)
      return formatDateLocal(d) <= todayKeyForAvg;
    });

    // Build the equivalent set of elapsed workdays for last week (Mon..same weekday as today)
    const elapsedWorkWeekDaysLastWeek = elapsedWorkWeekDays.map((d) => {
      const lw = new Date(d);
      lw.setDate(lw.getDate() - 7);
      return lw;
    });

    let weekToDateHours = 0;
    let weekToDateAmount = 0;
    for (const day of elapsedWorkWeekDays) {
      const key = formatDateLocal(day);
      const totals = currentDaily[key];
      weekToDateHours += Number(totals?.total_hours) || 0;
      weekToDateAmount += Number(totals?.total_amount) || 0;
    }

    let lastWeekToDateHours = 0;
    let lastWeekToDateAmount = 0;
    for (const day of elapsedWorkWeekDaysLastWeek) {
      const key = formatDateLocal(day);
      const totals = lastDaily[key];
      lastWeekToDateHours += Number(totals?.total_hours) || 0;
      lastWeekToDateAmount += Number(totals?.total_amount) || 0;
    }

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

    let leaveDaysSoFar = 0;
    elapsedWorkWeekDays.forEach((day) => {
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
        leaveDaysSoFar++;
      }
    });

    let leaveDaysSoFarLastWeek = 0;
    elapsedWorkWeekDaysLastWeek.forEach((day) => {
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
        leaveDaysSoFarLastWeek++;
      }
    });

    const effectiveDaysSoFar = Math.max(1, elapsedWorkWeekDays.length - leaveDaysSoFar);
    const avgHoursThisWeek = weekToDateHours / effectiveDaysSoFar;
    const avgAmountThisWeek = weekToDateAmount / effectiveDaysSoFar;
    const effectiveDaysSoFarLastWeek = Math.max(1, elapsedWorkWeekDaysLastWeek.length - leaveDaysSoFarLastWeek);
    const avgHoursLastWeekToDate = lastWeekToDateHours / effectiveDaysSoFarLastWeek;
    const avgAmountLastWeekToDate = lastWeekToDateAmount / effectiveDaysSoFarLastWeek;
    const adjustedTarget = (5 - leaveDays) * 6;

    return [
      {
        title: 'Time Today',
        isTimeMoney: true,
        money: Number(todayTotals.total_amount) || 0,
        hours: Number(todayTotals.total_hours) || 0,
        prevMoney: Number(prevTodayTotals.total_amount) || 0,
        prevHours: Number(prevTodayTotals.total_hours) || 0,
        yesterdayMoney: showYesterdayTotals ? (Number(yesterdayTotals.total_amount) || 0) : 0,
        yesterdayHours: showYesterdayTotals ? (Number(yesterdayTotals.total_hours) || 0) : 0,
        showDial: true,
        dialTarget: 6,
      },
      {
        title: 'Av. Time This Week',
        isTimeMoney: true,
        money: avgAmountThisWeek,
        hours: avgHoursThisWeek,
        prevMoney: avgAmountLastWeekToDate,
        prevHours: avgHoursLastWeekToDate,
        showDial: true,
        dialTarget: 6,
      },
      {
        title: 'Time This Week',
        isTimeMoney: true,
        money: 0,
        hours: totalTimeThisWeek,
        prevMoney: 0,
        prevHours: lastWeekToDateHours,
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
    enquiriesToday,
    prevEnquiriesToday,
    enquiriesWeekToDate,
    prevEnquiriesWeekToDate,
    enquiriesMonthToDate,
    prevEnquiriesMonthToDate,
    annualLeaveRecords,
    userData,
    normalizedMatters,
    outstandingBalancesData,
    userMatterIDs,
    mattersOpenedCount,
    firmMattersOpenedCount,
  ]);
  
  const timeMetrics = metricsData.slice(0, 5);
  // Removed enquiryMetrics; conversion summary now handled by TimeMetricsV2 props

  const demoTimeMetrics = useMemo(
    () => [
      {
        title: 'Time Today',
        isTimeMoney: true,
        money: 780,
        hours: 6.5,
        prevMoney: 640,
        prevHours: 5.2,
        showDial: true,
        dialTarget: 6,
      },
      {
        title: 'Av. Time This Week',
        isTimeMoney: true,
        money: 5200,
        hours: 32,
        prevMoney: 4800,
        prevHours: 30,
        showDial: true,
        dialTarget: 6,
      },
      {
        title: 'Time This Week',
        isTimeMoney: true,
        money: 0,
        hours: 32,
        prevMoney: 0,
        prevHours: 29,
        showDial: true,
        dialTarget: 30,
      },
      {
        title: 'Fees Recovered This Month',
        isMoneyOnly: true,
        money: 14500,
        prevMoney: 13200,
      },
      {
        title: 'Outstanding Office Balances',
        isMoneyOnly: true,
        money: 1800,
        secondary: 12400,
      },
    ],
    []
  );

  const demoEnquiryMetrics = useMemo(
    () => ({
      today: 6,
      prevToday: 5,
      week: 18,
      prevWeek: 16,
      month: 72,
      prevMonth: 68,
      mattersOpened: 14,
    }),
    []
  );

  const displayTimeMetrics = demoModeEnabled ? demoTimeMetrics : timeMetrics;
  const displayEnquiriesToday = demoModeEnabled ? demoEnquiryMetrics.today : enquiriesToday;
  const displayPrevEnquiriesToday = demoModeEnabled ? demoEnquiryMetrics.prevToday : prevEnquiriesToday;
  const displayEnquiriesWeekToDate = demoModeEnabled ? demoEnquiryMetrics.week : enquiriesWeekToDate;
  const displayPrevEnquiriesWeekToDate = demoModeEnabled ? demoEnquiryMetrics.prevWeek : prevEnquiriesWeekToDate;
  const displayEnquiriesMonthToDate = demoModeEnabled ? demoEnquiryMetrics.month : enquiriesMonthToDate;
  const displayPrevEnquiriesMonthToDate = demoModeEnabled ? demoEnquiryMetrics.prevMonth : prevEnquiriesMonthToDate;
  const displayMattersOpenedCount = demoModeEnabled ? demoEnquiryMetrics.mattersOpened : mattersOpenedCount;

  // Fallback: if lightweight home-wip endpoint returns zeroes, trigger the heavier reporting fetch once.
  const zeroWipFallbackRef = useRef(false);
  useEffect(() => {
    if (useLocalData || demoModeEnabled) return;
    if (isLoadingWipClio) return;
    if (zeroWipFallbackRef.current) return;
    const daily = wipClioData?.current_week?.daily_data;
    if (!daily) return;

    const hasHours = Object.values(daily).some((d: any) => (Number(d?.total_hours) || 0) > 0);
    const hasAmount = Object.values(daily).some((d: any) => (Number(d?.total_amount) || 0) > 0);

    if (!hasHours && !hasAmount) {
      zeroWipFallbackRef.current = true;
      console.log('[wip-fallback] home-wip returned zeroes, invoking reporting refresh');
      handleRefreshTimeMetrics?.();
    }
  }, [wipClioData, isLoadingWipClio, useLocalData, demoModeEnabled, handleRefreshTimeMetrics]);

  // Combine annualLeaveRecords and futureLeaveRecords for approval filtering
  const combinedLeaveRecords = useMemo(() => {
    return [...annualLeaveRecords, ...futureLeaveRecords];
  }, [annualLeaveRecords, futureLeaveRecords]);

  const APPROVERS = ['AC', 'JW', 'LZ', 'KW'];
  // Normalize initials for consistent matching
  const normalizedUserInitials = (userInitials || '').trim().toUpperCase();
  const isApprover = APPROVERS.includes(normalizedUserInitials);
  // Managers (broad visibility)
  // NOTE: Annual leave routing is AOW-based (construction -> JW, otherwise AC).
  // AC should not see construction requests unless explicitly routed to AC.
  const isManagerApprover = ['LZ'].includes(normalizedUserInitials);

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
        <Suspense fallback={<ModalSkeleton variant="annual-leave-approve" />}>
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
      <Suspense fallback={<ModalSkeleton variant="annual-leave-approve" />}>
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

      const icon = 'Leave';

      setBespokePanelContent(
        <Suspense fallback={<ModalSkeleton variant="annual-leave-book" />}>
          <AnnualLeaveBookings
            bookings={entries.map((item) => ({
              id: item.id,
              request_id: parseInt(item.id, 10) || undefined,
              person: item.person,
              start_date: item.start_date,
              end_date: item.end_date,
              status: item.status,
              days_taken: item.days_taken,
              reason: item.reason,
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
      setBespokePanelTitle('Book Leave');
      setBespokePanelDescription('Submit a request for annual leave or time off');
      setBespokePanelIcon(icon);
      setIsBespokePanelOpen(true);
    },
    [setBespokePanelContent, setBespokePanelTitle, setBespokePanelDescription, setBespokePanelIcon, setIsBespokePanelOpen, transformedTeamData]
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
        <Suspense fallback={<ModalSkeleton variant="generic" />}>
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

    // Demo mode: always show demo annual leave cards (hide live approvals/bookings)
    if (demoModeEnabled) {
      actions.push({
        title: 'Approve Annual Leave (Demo)',
        subtitle: 'Demo approval flow',
        onClick: handleTestApproveLeaveClick,
        icon: 'PalmTree',
        category: 'critical',
      });
      actions.push({
        title: 'Book Requested Leave (Demo)',
        subtitle: 'Demo booking flow',
        onClick: handleBookLeavePreviewClick,
        icon: 'Accept',
        category: 'success',
      });
      return actions;
    }
    
    // Annual leave test/demo cards are controlled by demoModeEnabled (User Bubble)
    
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
      // Format date nicely (e.g., "15 Jan")
      const formatShortDate = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      };
      
      // Count approved items
      const approvedCount = bookingsNeeded.filter(b => b.status === 'approved').length;
      const first = bookingsNeeded[0];
      const startFormatted = formatShortDate(first?.start_date || '');
      const endFormatted = formatShortDate(first?.end_date || '');
      
      // Build subtitle: "Approved · 15 Jan - 18 Jan" or "2 approved · 15 Jan +1 more"
      const statusLabel = approvedCount > 0 
        ? (approvedCount === bookingsNeeded.length ? 'Approved' : `${approvedCount} approved`)
        : 'Pending';
      const dateRange = bookingsNeeded.length > 1
        ? `${startFormatted} +${bookingsNeeded.length - 1} more`
        : (startFormatted === endFormatted ? startFormatted : `${startFormatted} – ${endFormatted}`);
      const subtitle = `${statusLabel} · ${dateRange}`;
      actions.push({
        title: 'Book Requested Leave',
        subtitle,
        onClick: handleBookLeaveClick,
        icon: 'Timer',
        category: 'standard',
        count: bookingsNeeded.length,
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
    demoModeEnabled,
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

    const saveAttendanceDemo = async (_weekStart: string, _days: string, _initials?: string) => {
      // Demo mode: do not write attendance changes.
      return;
    };

    // Map full titles to short titles and descriptions
    const titleMap: Record<string, { shortTitle: string; description: string }> = {
      'Create a Task': { shortTitle: 'New Task', description: 'Create and assign a new task or reminder' },
      'Save Telephone Note': { shortTitle: 'Attendance Note', description: 'Record details from a phone conversation' },
      'Request Annual Leave': { shortTitle: 'Request Leave', description: 'Submit a request for annual leave or time off' },
      'Update Attendance': { shortTitle: 'Confirm Your Attendance', description: 'Plan your 14-day schedule' },
      'Confirm Attendance': { shortTitle: 'Confirm Attendance', description: 'Plan your 14-day schedule' },
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
            demoModeEnabled={demoModeEnabled}
            isAdmin={isAdminUser(userData?.[0])}
            attendanceRecords={transformedAttendanceRecords}
            annualLeaveRecords={annualLeaveRecords}
            futureLeaveRecords={futureLeaveRecords}
            userData={userData}
            teamData={transformedTeamData}
            onSave={demoModeEnabled ? saveAttendanceDemo : saveAttendance}
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
            demoModeEnabled={demoModeEnabled}
            isAdmin={isAdminUser(userData?.[0])}
            attendanceRecords={transformedAttendanceRecords}
            annualLeaveRecords={annualLeaveRecords}
            futureLeaveRecords={futureLeaveRecords}
            userData={userData}
            teamData={transformedTeamData}
            onSave={demoModeEnabled ? saveAttendanceDemo : saveAttendance}
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
          <Suspense fallback={<ModalSkeleton variant="task" />}>
            <Tasking />
          </Suspense>
        );
        break;
      case 'Request CollabSpace':
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="44" />;
        break;
      case 'Save Telephone Note':
        content = (
          <Suspense fallback={<ModalSkeleton variant="attendance" />}>
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
        if (!isLoadingAnnualLeave && (!annualLeaveTotals || annualLeaveAllData.length === 0)) {
          setIsLoadingAnnualLeave(true);
          void refreshAnnualLeaveData(String(userData?.[0]?.Initials || ''), { forceRefresh: true })
            .finally(() => setIsLoadingAnnualLeave(false));
        }
        console.log('[Home] Rendering AnnualLeaveModal with:', {
          annualLeaveAllDataLength: annualLeaveAllData?.length,
          futureLeaveRecordsLength: futureLeaveRecords?.length,
          sampleAllData: annualLeaveAllData?.slice(0, 2),
          isAdmin: isAdminUser(userData?.[0])
        });
        content = (
          <Suspense fallback={<ModalSkeleton variant="annual-leave-request" />}>
            <AnnualLeaveModal
              userData={enrichedUserData}
              totals={annualLeaveTotals ?? { standard: 0, unpaid: 0, sale: 0 }}
              bankHolidays={bankHolidays}
              futureLeave={futureLeaveRecords}
              allLeave={annualLeaveAllData}
              team={transformedTeamData}
              isAdmin={isAdminUser(userData?.[0])}
              isLoadingAnnualLeave={isLoadingAnnualLeave}
              onSubmitSuccess={async () => {
                // Refresh annual leave data after successful submission
                await refreshAnnualLeaveData(String(userData?.[0]?.Initials || ''), { forceRefresh: true });
                setIsBespokePanelOpen(false);
                setBespokePanelContent(null);
                resetQuickActionsSelection();
              }}
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
          <Suspense fallback={<ModalSkeleton variant="generic" />}>
            <BookSpaceForm
              feeEarner={userData[0].Initials}
              onCancel={() => {
                setIsBespokePanelOpen(false);
                resetQuickActionsSelection();
              }}
              futureBookings={futureBookings}
              realtimePulse={futureBookingsRealtimePulse || undefined}
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
    setBespokePanelIcon(action.icon ?? null);
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
    demoModeEnabled,
    showToast,
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
    if (!isLoadingAttendance && (demoModeEnabled || !currentUserConfirmed)) {
      // Show today's date as the detail
      const todayFormatted = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      actions.push({
        title: 'Confirm Attendance',
        subtitle: todayFormatted,
        icon: 'Attendance',
        onClick: () => handleActionClick({ title: 'Confirm Attendance', icon: 'Attendance' }),
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

    // Rate Change Notices removed from immediate actions - now only accessible via UserBubble (localhost only)

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
    demoModeEnabled,
    hasActiveMatter,
    instructionData,
    groupedInstructionActions,
    instructionsActionDone,
    immediateALActions,
    handleActionClick,
    hasActivePitch,
    userInitials,
    isLocalhost,
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
        loading={!quickActionsReady}
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
    quickActionsReady,
    isLocalhost,
  ]);

  // Returns a narrow weekday (e.g. "M" for Monday, "T" for Tuesday)
  const getShortDayLabel = (date: Date): string =>
    date.toLocaleDateString('en-GB', { weekday: 'narrow' });

  // Optionally, if you want to include the date as well (e.g. "M 10")
  const _getShortDayAndDateLabel = (date: Date): string => {
    const shortDay = getShortDayLabel(date);
    const dayOfMonth = date.getDate();
    return `${shortDay} ${dayOfMonth}`;
  };

  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const currentWeekMonday = getMondayOfCurrentWeek();
  const todayStr = formatDateLocal(new Date());

  // Example usage in attendancePersons:
  const _attendancePersons = useMemo(() => {
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

  const _AttendanceCell: React.FC<{ status: 'in' | 'wfh' | 'out'; highlight?: boolean }> = ({
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

const conversionRate = displayEnquiriesMonthToDate
  ? Number(((displayMattersOpenedCount / displayEnquiriesMonthToDate) * 100).toFixed(2))
  : 0;

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
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      {/* Portal immediate actions to app level */}
      {typeof document !== 'undefined' && document.getElementById('app-level-immediate-actions') && 
        createPortal(appLevelImmediateActions, document.getElementById('app-level-immediate-actions')!)
      }

      {isSwitchingUser && (
        <div style={{
          position: 'absolute',
          top: 12,
          right: 16,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderRadius: 10,
          background: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(148, 163, 184, 0.25)'}`,
          boxShadow: isDarkMode ? '0 6px 18px rgba(0,0,0,0.35)' : '0 6px 16px rgba(0,0,0,0.08)',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: `2px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.35)' : 'rgba(54, 144, 206, 0.4)'}`,
            borderTopColor: isDarkMode ? colours.accent : colours.highlight,
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#E2E8F0' : '#0f172a' }}>
              Rebuilding your view…
            </span>
            <span style={{ fontSize: 11, color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.85)' }}>
              Recalculating personalised metrics.
            </span>
          </div>
        </div>
      )}

      {/* Modern Time Metrics V2 - directly on page background */}
      <div style={{ paddingTop: '16px' }}>
        <TimeMetricsV2 
          metrics={displayTimeMetrics}
          enquiryMetrics={[
          { title: 'Enquiries Today', count: displayEnquiriesToday, prevCount: displayPrevEnquiriesToday },
          { title: 'Enquiries This Week', count: displayEnquiriesWeekToDate, prevCount: displayPrevEnquiriesWeekToDate },
          { title: 'Enquiries This Month', count: displayEnquiriesMonthToDate, prevCount: displayPrevEnquiriesMonthToDate },
          { title: 'Matters Opened This Month', count: displayMattersOpenedCount },
          { 
            title: 'Conversion Rate', 
            percentage: conversionRate, 
            isPercentage: true,
            showTrend: false,
            context: {
              enquiriesMonthToDate: displayEnquiriesMonthToDate,
              mattersOpenedMonthToDate: displayMattersOpenedCount,
              prevEnquiriesMonthToDate: displayPrevEnquiriesMonthToDate,
            },
          }
        ]}
        enquiryMetricsBreakdown={enquiryMetricsBreakdown}
        isDarkMode={isDarkMode}
        userEmail={userData?.[0]?.Email || ''}
        userInitials={userData?.[0]?.Initials || ''}
        onRefresh={handleRefreshTimeMetrics}
        isRefreshing={isRefreshingTimeMetrics}
        isLoading={isLoadingWipClio}
        isLoadingEnquiryMetrics={isLoadingEnquiryMetrics}
        viewAsProd={featureToggles.viewAsProd}
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
              onConfirmAttendance={() => handleActionClick({ title: 'Confirm Attendance', icon: 'Attendance' })}
              realtimeHighlightInitials={attendanceRealtimeHighlightInitials}
              realtimePulseNonce={attendanceRealtimePulseNonce}
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
          setBespokePanelIcon(null);
          setBespokePanelContent(null);
          setBespokePanelTitle('');
          setBespokePanelDescription('');
          resetQuickActionsSelection();
        }}
        title={bespokePanelTitle}
        description={bespokePanelDescription}
        width="85%"
        isDarkMode={isDarkMode}
        variant="modal"
        icon={bespokePanelIcon ? getQuickActionIcon(bespokePanelIcon) || undefined : undefined}
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
        migrateSourceClients={rateChangeMigrateClients}
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