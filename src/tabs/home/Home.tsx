// src/tabs/home/Home.tsx
// invisible change 2

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useDeferredValue,
  ReactNode,
  useRef, // ADDED
  lazy,
  Suspense,
} from 'react';
import OperationsDashboard, { type ConversionComparisonAowItem, type ConversionComparisonBucket, type ConversionComparisonItem, type ConversionComparisonPayload, type ConversionComparisonProspect, type UnclaimedSummaryPayload } from '../../components/modern/OperationsDashboard';
import { LivePulse, LiveIndicatorDot } from '../../components/realtime/LivePulse';
import { useRealtimeChannel } from '../../hooks/useRealtimeChannel';
import { createPortal } from 'react-dom';
import { debugLog, debugWarn } from '../../utils/debug';
import { safeSetItem, safeGetItem, cleanupLocalStorage, logStorageUsage } from '../../utils/storageUtils';
import { useCognitoEmbed } from '../../hooks/useCognitoEmbed';
import { mergeStyles, keyframes } from '@fluentui/react/lib/Styling';
import { Text } from '@fluentui/react/lib/Text';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { IconButton, DefaultButton } from '@fluentui/react/lib/Button';
import { Stack } from '@fluentui/react/lib/Stack';
import { DetailsList, DetailsListLayoutMode } from '@fluentui/react/lib/DetailsList';
import { PersonaPresence } from '@fluentui/react/lib/Persona';
import type { IColumn } from '@fluentui/react/lib/DetailsList';
import { Persona, PersonaSize } from '@fluentui/react/lib/Persona';
import { Icon } from '@fluentui/react/lib/Icon';
import { Toggle } from '@fluentui/react/lib/Toggle';
import { FaCheck } from 'react-icons/fa';
import { colours } from '../../app/styles/colours';
// Removed legacy MetricCard usage
import { useHomeMetricsStream } from '../../hooks/useHomeMetricsStream';
import usePageVisible from '../../hooks/usePageVisible';
import GreyHelixMark from '../../assets/grey helix mark.png';
import InAttendanceImg from '../../assets/in_attendance.png';
import WfhImg from '../../assets/wfh.png';
import OutImg from '../../assets/outv2.png';
import '../../app/styles/VerticalLabelPanel.css';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
// Removed legacy MetricCard styles import
import './EnhancedHome.css';
import './home-tokens.css';
import { dashboardTokens, cardTokens, cardStyles } from '../instructions/componentTokens';
import { componentTokens } from '../../app/styles/componentTokens';
// ThemedSpinner removed — skeleton fallbacks used instead
import { ModalSkeleton } from '../../components/ModalSkeleton';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';
import OperationStatusToast from '../enquiries/pitch-builder/OperationStatusToast';
import ReleaseNotesModal from '../../components/ReleaseNotesModal';

import { FormItem, Matter, Transaction, TeamData, OutstandingClientBalance, BoardroomBooking, SoundproofPodBooking, SpaceBooking, FutureBookingsResponse, InstructionData, Enquiry, NormalizedMatter } from '../../app/functionality/types';

import { Resource } from '../resources/Resources';

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
// Local JSON fixtures loaded dynamically (only when REACT_APP_USE_LOCAL_DATA=true) to keep ~75KB out of the production bundle
import { checkIsLocalDev } from '../../utils/useIsLocalDev';
import { isAdminUser, isDevOwner } from '../../app/admin';
import { useFirstHydration } from '../../utils/useFirstHydration';

// Enhanced components
import SectionCard from './SectionCard';
// Removed legacy Enhanced metrics components

// NEW: Import the updated QuickActionsCard component
import QuickActionsCard from './QuickActionsCard';
import QuickActionsBar from './QuickActionsBar';
import { getQuickActionIcon } from './QuickActionsCard.icons';
import ImmediateActionsBar from './ImmediateActionsBar';
import { trackClientEvent } from '../../utils/telemetry';
import type { ImmediateActionCategory } from './ImmediateActionChip';
import { enrichImmediateActions, type HomeImmediateAction, type ToDoCard } from './ImmediateActionModel';
import { getActionableInstructions } from './InstructionsPrompt.helpers';
import type { InstructionSummary } from './InstructionsPrompt';
import { HomeTeamInsightSkeleton } from './HomeSkeletons';

import RateChangeModal from './RateChangeModal';
import { useRateChangeData } from './useRateChangeData';
import OperationsQueue from '../../components/modern/OperationsQueue';

import TransactionCard from '../transactions/TransactionCard';
import TransactionApprovalPopup from '../transactions/TransactionApprovalPopup';

import OutstandingBalanceCard from '../transactions/OutstandingBalanceCard'; // Adjust the path if needed
import UnclaimedEnquiries from '../enquiries/UnclaimedEnquiries';
import RegistersWorkspace from '../resources/registers/RegistersWorkspace';

const HOME_BOOT_MONITOR_LOG_KEY = '__helix_home_boot_monitor_log_v1';
const proxyBaseUrl = getProxyBaseUrl();

function appendHomeBootMonitorEvent(source: string, status: string, timestamp: number): void {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.sessionStorage.getItem(HOME_BOOT_MONITOR_LOG_KEY);
    const current = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(current) ? current : [];
    next.push({ source, status, timestamp });
    window.sessionStorage.setItem(HOME_BOOT_MONITOR_LOG_KEY, JSON.stringify(next.slice(-200)));
  } catch {
    // sessionStorage is best-effort only for the boot monitor.
  }
}

// `getLiveLocalEnquiries` moved to ./liveLocalEnquiries on 2026-04-21 so
// Home.tsx exports only a React component. This restores React Fast Refresh
// state-preservation for Home edits (a single non-component export here was
// forcing every save to trigger a full page reload).

// Lazy-loaded form components
const Tasking = lazy(() => import('../../CustomForms/Tasking'));
const TelephoneAttendance = lazy(() => import('../../CustomForms/TelephoneAttendance'));
import { AnnualLeaveModal } from '../../CustomForms/AnnualLeaveModal';
// NEW: Import placeholders for approvals & bookings
const AnnualLeaveApprovals = lazy(() => import('../../CustomForms/AnnualLeaveApprovals').then(m => ({ default: m.default || m })));
const AnnualLeaveBookings = lazy(() => import('../../CustomForms/AnnualLeaveBookings').then(m => ({ default: m.default || m })));
const BookSpaceForm = lazy(() => import('../../CustomForms/BookSpaceForm').then(m => ({ default: m.default || m })));
const SnippetEditsApproval = lazy(() => import('../../CustomForms/SnippetEditsApproval'));
const VerificationCheckForm = lazy(() => import('../../CustomForms/VerificationCheckForm'));
const LearningDevelopmentForm = lazy(() => import('../../CustomForms/LearningDevelopmentForm'));
import PersonalAttendanceConfirm from './PersonalAttendanceConfirm';
import AttendancePortal from './AttendancePortal';
import TeamInsight from './TeamInsight';
const OutstandingBalancesList = lazy(() => import('../transactions/OutstandingBalancesList'));

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
  request_id?: number;
  days_taken?: number;
  leave_type?: string;
  rejection_notes?: string;
  approvers?: string[];
  hearing_confirmation?: string; // "yes" or "no"
  hearing_details?: string;      // Additional details when hearing_confirmation is "no"
  clio_entry_id?: number;
  half_day_start?: boolean;
  half_day_end?: boolean;
  requested_at?: string;
  approved_at?: string;
  booked_at?: string;
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
  enquiriesUsingSnapshot?: boolean;
  enquiriesLiveRefreshInFlight?: boolean;
  enquiriesLastLiveSyncAt?: number | null;
  matters?: NormalizedMatter[]; // Prefer app-provided normalized matters
  instructionData?: InstructionData[];
  onAllMattersFetched?: (matters: Matter[]) => void;
  onOutstandingBalancesFetched?: (data: any) => void;
  onTransactionsFetched?: (transactions: Transaction[]) => void;
  onBoardroomBookingsFetched?: (data: BoardroomBooking[]) => void;
  onSoundproofBookingsFetched?: (data: SoundproofPodBooking[]) => void;
  teamData?: TeamData[] | null;
  isInMatterOpeningWorkflow?: boolean;
  onImmediateActionsChange?: (hasActions: boolean) => void;
  originalAdminUser?: any; // For admin user switching context
  featureToggles?: Record<string, boolean>;
  onFeatureToggle?: (feature: string, enabled: boolean) => void;
  demoModeEnabled?: boolean;
  isActive?: boolean;
  isSwitchingUser?: boolean;
}

interface HomeCclReviewRequest {
  requestedAt: number;
  matterId?: string;
  openInspector?: boolean;
  autoRunAi?: boolean;
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

type FormsTodoRegisterTab = 'ld' | 'undertakings' | 'complaints';

// Kinds surfaced on Home via the dbo.hub_todo registry. `review-ccl` is the
// CCL autopilot pickup card — when matter opening fires autopilot and the
// Safety Net flags fields (score ≤7), the server creates a hub_todo card so
// the fee earner sees it on Home even if they weren't at the modal when
// autopilot finished. Keeps the registry-sourced kinds visible even though
// the historical name is "FORMS" — kept for blame/git-log continuity.
const FORMS_TODO_KINDS = new Set(['ld-review', 'undertaking-request', 'complaint-followup', 'review-ccl']);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readStringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatRegisterTodoDate(value: unknown): string | null {
  const raw = readStringValue(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntilIso(value: unknown): number | null {
  const raw = readStringValue(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((parsed.getTime() - Date.now()) / msPerDay);
}

function formatSlaSummary(daysRemaining: number | null): string {
  if (daysRemaining == null) return 'SLA pending';
  if (daysRemaining < 0) return 'SLA exceeded';
  if (daysRemaining === 0) return 'SLA due today';
  if (daysRemaining === 1) return '1 day to SLA';
  return `${daysRemaining} days to SLA`;
}

function formatDueSummary(daysRemaining: number | null, formattedDate: string | null): string {
  if (daysRemaining == null) return formattedDate ? `Due ${formattedDate}` : 'No due date';
  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    return `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`;
  }
  if (daysRemaining === 0) return 'Due today';
  if (daysRemaining === 1) return 'Due tomorrow';
  return formattedDate ? `Due ${formattedDate}` : `Due in ${daysRemaining} days`;
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
  'Review Complaint': 1,
  'Review L&D': 2,
  'Review Undertaking': 3,
  'Update Attendance': 4,
  'Confirm Attendance': 4,
  'Open Matter': 5,
  'Review Instructions': 6,
  // Instruction workflow actions
  'Review ID': 6,
  'Verify ID': 6,
  'Assess Risk': 7,
  'CCL Service': 8,
  'Review CCL': 8,

  'Create a Task': 9,
  'Request CollabSpace': 10,
  'Save Telephone Note': 11,
  'Save Attendance Note': 12,
  'Request ID': 13,
  'Open a Matter': 14,
  'Request Annual Leave': 15,
  'Log L&D': 15,
  'Unclaimed Enquiries': 16,
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
  { title: 'Verify ID', icon: 'ContactCard' },
  { title: 'Log L&D', icon: 'Education' },
];

//////////////////////
// Styles
//////////////////////

// Subtle Helix watermark (three rounded ribbons) as inline SVG, Teams-like subtlety
const helixWatermarkSvg = (dark: boolean) => {
  const fill = dark ? '%23FFFFFF' : '%23061733';
  const opacity = dark ? '0.08' : '0.035';
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
    // Flat brand surface — websiteBlue in dark, subtle grey in light
    background: isDarkMode ? colours.websiteBlue : colours.grey,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    minHeight: '100%',
    boxSizing: 'border-box',
    position: 'relative',
    overflowX: 'hidden'
  });

const operationsHubStyle = (isDarkMode: boolean) =>
  mergeStyles({
    margin: '6px 12px 6px 12px',
    background: isDarkMode
      ? 'transparent'
      : 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 244, 246, 0.94) 100%)',
    border: isDarkMode ? 'none' : '1px solid var(--border-strong)',
    boxShadow: isDarkMode ? 'none' : 'var(--shadow-sm)',
    padding: isDarkMode ? '0' : '2px',
    overflow: 'hidden',
  });

/* Legacy style constants removed — headerStyle, mainContentStyle, quickLinksStyle,
   tableAnimationStyle, versionStyle, subLabelStyle, actionsMetricsContainerStyle,
   favouritesGridStyle, peopleGridStyle, sectionContainerStyle, ACTION_BAR_HEIGHT,
   calculateAnimationDelay — none referenced in current JSX. */

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

const formatHourFragment = (date: Date): string => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}`
);

// Robust date parser matching ManagementDashboard behaviour
const parseDateValue = (input: unknown): Date | null => {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  if (typeof input !== 'string' || input.trim().length === 0) return null;
  const trimmed = input.trim();
  const normalised = trimmed.includes('/') && !trimmed.includes('T')
    ? (() => {
        const slashMatch = trimmed.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2})(?::(\d{2}))?(?::(\d{2}))?)?\s*$/);
        if (!slashMatch) {
          return trimmed;
        }

        const [, dd, mm, yyyy, hours = '00', minutes = '00', seconds = '00'] = slashMatch;
        return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`;
      })()
    : trimmed;
  const candidate = new Date(normalised);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

//////////////////////
// Caching Variables (module-level)
//////////////////////

const convertToISO = (dateStr: string): string => {
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const parseOpenDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const str = String(value).trim();
  if (!str) return null;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const iso = convertToISO(str);
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
};

interface AttendanceData {
  attendance: AttendanceRecord[];
  team: any[];
}

interface HomeRecentEnquiryRecord {
  id?: string;
  enquiryId?: string;
  processingEnquiryId?: string;
  pitchEnquiryId?: string;
  legacyEnquiryId?: string;
  date?: string;
  poc?: string;
  aow?: string;
  source?: string;
  name?: string;
  stage?: string;
  pipelineStage?: string;
  teamsChannel?: string;
  teamsCardType?: string;
  teamsStage?: string;
  teamsClaimed?: string;
  teamsLink?: string;
  dataSource?: 'new' | 'legacy';
  email?: string;
  notes?: string;
  prospectIds?: string[];
}

let cachedAttendance: AttendanceData | null = null;
let cachedAttendanceError: string | null = null;

let cachedAnnualLeave: AnnualLeaveRecord[] | null = null;
let cachedAnnualLeaveError: string | null = null;

let cachedFutureLeaveRecords: AnnualLeaveRecord[] | null = null;

let cachedWipClio: any | null = null;
let cachedWipClioError: string | null = null;
let cachedRecovered: number | null = null;
let cachedRecoveredError: string | null = null;
let cachedPrevRecovered: number | null = null;
let cachedPrevRecoveredError: string | null = null;
let cachedRecoveredHours: number | null = null;
let cachedPrevRecoveredHours: number | null = null;
let cachedMetricsUserKey: string | null = null;

const HOME_METRICS_SNAPSHOT_KEY = 'home-metrics-snapshot-v2';
const HOME_METRICS_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

interface HomeMetricsSnapshot {
  userKey: string;
  savedAt: number;
  wipClioData: any | null;
  recoveredData: number | null;
  prevRecoveredData: number | null;
  recoveredHours: number | null;
  prevRecoveredHours: number | null;
  recentEnquiryRecords: HomeRecentEnquiryRecord[];
  enquiryMetrics: {
    enquiriesToday: number;
    enquiriesWeekToDate: number;
    enquiriesMonthToDate: number;
    prevEnquiriesToday: number;
    prevEnquiriesWeekToDate: number;
    prevEnquiriesMonthToDate: number;
    prevEnquiriesWeekFull: number;
    prevEnquiriesMonthFull: number;
    pitchedEnquiriesToday: number;
    pitchedEnquiriesWeekToDate: number;
    pitchedEnquiriesMonthToDate: number;
    prevPitchedEnquiriesToday: number;
    prevPitchedEnquiriesWeekToDate: number;
    prevPitchedEnquiriesMonthToDate: number;
    enquiryMetricsBreakdown: unknown;
    conversionComparison?: ConversionComparisonPayload | null;
  } | null;
  attendanceData?: AttendanceData | null;
  annualLeaveRecords?: AnnualLeaveRecord[] | null;
  futureLeaveRecords?: AnnualLeaveRecord[] | null;
}

function sanitizeSavedConversionComparison(
  payload: ConversionComparisonPayload | null | undefined,
): ConversionComparisonPayload | null {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    return null;
  }

  const todayItem = payload.items.find((item) => item?.key === 'today');
  if (!todayItem) {
    return null;
  }

  if (todayItem.chartMode !== 'hourly') {
    return null;
  }

  return Array.isArray(todayItem.buckets) && todayItem.buckets.length > 0 ? payload : null;
}

// Holds the last value seen while the host was active. When the host goes
// inactive (e.g. user navigates to another tab) the previous snapshot stays
// pinned, so consumers downstream of useDeferredValue / useMemo don't see
// reference identity churn or null/empty flashes when the host returns.
//
// Implementation note: this MUST be a ref (not state) — using setState here
// causes a second render-pass when isActive flips true, which blocks the tab
// click for hundreds of ms while downstream useMemo chains recompute twice.
function useActiveSnapshot<T>(value: T, isActive: boolean): T {
  const snapshotRef = useRef(value);
  if (isActive) {
    snapshotRef.current = value;
  }
  return snapshotRef.current;
}

function readHomeMetricsSnapshot(userKey: string | null): HomeMetricsSnapshot | null {
  if (!userKey) return null;

  try {
    const raw = sessionStorage.getItem(HOME_METRICS_SNAPSHOT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<HomeMetricsSnapshot>;
    if (parsed.userKey !== userKey) return null;
    if (typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > HOME_METRICS_SNAPSHOT_TTL_MS) return null;

    const parsedEnquiryMetrics = parsed.enquiryMetrics ?? null;

    return {
      userKey,
      savedAt: parsed.savedAt,
      wipClioData: parsed.wipClioData ?? null,
      recoveredData: parsed.recoveredData ?? null,
      prevRecoveredData: parsed.prevRecoveredData ?? null,
      recoveredHours: parsed.recoveredHours ?? null,
      prevRecoveredHours: parsed.prevRecoveredHours ?? null,
      recentEnquiryRecords: Array.isArray(parsed.recentEnquiryRecords) ? parsed.recentEnquiryRecords : [],
      enquiryMetrics: parsedEnquiryMetrics ? {
        ...parsedEnquiryMetrics,
        conversionComparison: sanitizeSavedConversionComparison(parsedEnquiryMetrics.conversionComparison ?? null),
      } : null,
      attendanceData: parsed.attendanceData ?? null,
      annualLeaveRecords: parsed.annualLeaveRecords ?? null,
      futureLeaveRecords: parsed.futureLeaveRecords ?? null,
    };
  } catch {
    return null;
  }
}

function writeHomeMetricsSnapshot(snapshot: HomeMetricsSnapshot): void {
  try {
    sessionStorage.setItem(HOME_METRICS_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage write failures.
  }
}

let cachedAllMatters: Matter[] | null = null;
let cachedAllMattersError: string | null = null;
const CACHE_INVALIDATION_KEY = 'matters-cache-v3';

let cachedOutstandingBalances: any | null = null;
let cachedTransactions: Transaction[] | null = null;

// Module-level SWR cache for the Home dashboard's parallel fetch. Keyed by the
// parallel-fetch requestKey so admin/user switches naturally invalidate. While
// fresh (within HOME_DATA_FRESH_MS) the cached value is hydrated synchronously
// and the network call is skipped — this is what stops the enquiry/matter
// boxes from "rerendering" when returning to Home from another tab.
const HOME_DATA_FRESH_MS = 60_000;
type CachedHomeMatters = { key: string; matters: any[]; ts: number };
type CachedEnquiryMetrics = { key: string; payload: any; ts: number };
let cachedHomeMattersEntry: CachedHomeMatters | null = null;
let cachedEnquiryMetricsEntry: CachedEnquiryMetrics | null = null;

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
  const { containerRef } = useCognitoEmbed({
    embedScript: { key: dataKey, formId: dataForm },
    isActive: true,
  });

  return <div ref={containerRef} />;
};

//////////////////////
// Home Component
//////////////////////

// DEV-ONLY opt-in: when explicitly enabled, local/dev builds force dev-owner
// accounts onto a mine-only Home instead of the firm-wide aggregates.
// Default local behaviour stays aligned with production unless the override is
// requested via REACT_APP_HOME_FORCE_MINE_LOCAL=true.
const HOME_FORCE_MINE_LOCAL = String(process.env.REACT_APP_HOME_FORCE_MINE_LOCAL || '').trim().toLowerCase() === 'true';

const Home: React.FC<HomeProps> = ({ context, userData, enquiries, enquiriesUsingSnapshot = false, enquiriesLiveRefreshInFlight = false, enquiriesLastLiveSyncAt = null, matters: providedMatters, instructionData: propInstructionData, onAllMattersFetched, onOutstandingBalancesFetched, onTransactionsFetched, teamData, onBoardroomBookingsFetched, onSoundproofBookingsFetched, isInMatterOpeningWorkflow = false, onImmediateActionsChange, originalAdminUser, featureToggles = {}, onFeatureToggle, demoModeEnabled = false, isActive = true, isSwitchingUser = false }) => {
  const { isDarkMode, toggleTheme } = useTheme();
  const hasAdminContext = isAdminUser(userData?.[0]) || isAdminUser(originalAdminUser || null);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const { setContent } = useNavigatorActions();
  const inTeams = isInTeams();
  const useLocalData =
    process.env.REACT_APP_USE_LOCAL_DATA === 'true';

  // Read the warm-boot snapshot synchronously so the first render paints with
  // real data instead of skeletons. The post-mount restore effect below stays
  // in place as a safety net for cases where userData arrives late.
  const [bootSnapshot] = useState<HomeMetricsSnapshot | null>(() => {
    if (useLocalData) return null;
    const rawEmail = String(userData?.[0]?.Email || '').toLowerCase().trim();
    const rawInitials = String(userData?.[0]?.Initials || '').toUpperCase().trim();
    const userKey = rawEmail || rawInitials ? `${rawEmail}|${rawInitials}` : null;
    if (!userKey) return null;
    const snap = readHomeMetricsSnapshot(userKey);
    if (snap) {
      // Mirror to module-level caches so non-state consumers see the snapshot too.
      cachedWipClio = snap.wipClioData;
      cachedRecovered = snap.recoveredData;
      cachedPrevRecovered = snap.prevRecoveredData;
      cachedRecoveredHours = snap.recoveredHours;
      cachedPrevRecoveredHours = snap.prevRecoveredHours;
      if (snap.attendanceData) cachedAttendance = snap.attendanceData;
      if (snap.annualLeaveRecords) cachedAnnualLeave = snap.annualLeaveRecords;
      if (snap.futureLeaveRecords) cachedFutureLeaveRecords = snap.futureLeaveRecords;
    }
    return snap;
  });
  const snapEnq = bootSnapshot?.enquiryMetrics ?? null;

  const [secondaryPanelsReady, setSecondaryPanelsReady] = useState(false);
  // Coordinated reveal gate — true when minimum viable Home data is present.
  // Sections stay as skeletons until this flips, then all reveal together.
  const [homeDataReady, setHomeDataReady] = useState(false);
  // Pause realtime SSE streams while the browser tab/window is hidden so we
  // don't burn network + CPU on auto-reconnect storms when the user is in
  // another tab. Streams reconnect on visibility regain (catch-up via the
  // existing delta-fetch on connect).
  const isPageVisible = usePageVisible();
  const activeEnquiries = useActiveSnapshot(enquiries, isActive);
  const activeProvidedMatters = useActiveSnapshot(providedMatters, isActive);
  const activeTeamData = useActiveSnapshot(teamData, isActive);
  const deferredEnquiries = useDeferredValue(activeEnquiries);
  const deferredProvidedMatters = useDeferredValue(activeProvidedMatters);
  const deferredTeamData = useDeferredValue(activeTeamData);
  
  // Component mounted successfully

  const [attendanceTeam, setAttendanceTeam] = useState<any[]>(() => bootSnapshot?.attendanceData?.team || []);
  const [annualLeaveTeam, setAnnualLeaveTeam] = useState<any[]>([]);
  // Transform teamData into our lite TeamMember type
  const transformedTeamData = useMemo<TeamMember[]>(() => {
    const data: TeamData[] = deferredTeamData ?? attendanceTeam ?? [];

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
  }, [deferredTeamData, attendanceTeam, annualLeaveTeam]);

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
  const lastRecoveredFetchAt = useRef<number>(0); // Cooldown for visibility handler

  // State declarations...
  const [enquiriesToday, setEnquiriesToday] = useState<number>(snapEnq?.enquiriesToday ?? 0);
  const [enquiriesWeekToDate, setEnquiriesWeekToDate] = useState<number>(snapEnq?.enquiriesWeekToDate ?? 0);
  const [enquiriesMonthToDate, setEnquiriesMonthToDate] = useState<number>(snapEnq?.enquiriesMonthToDate ?? 0);
  const [enquiryMetricsBreakdown, setEnquiryMetricsBreakdown] = useState<unknown>(snapEnq?.enquiryMetricsBreakdown ?? null);
  const [todaysTasks, setTodaysTasks] = useState<number>(10);
  const [tasksDueThisWeek, setTasksDueThisWeek] = useState<number>(20);
  const [completedThisWeek, setCompletedThisWeek] = useState<number>(15);
  const [recordedTime, setRecordedTime] = useState<{ hours: number; money: number }>({
    hours: 120,
    money: 1000,
  });
  const [prevEnquiriesToday, setPrevEnquiriesToday] = useState<number>(snapEnq?.prevEnquiriesToday ?? 8);
  const [prevEnquiriesWeekToDate, setPrevEnquiriesWeekToDate] = useState<number>(snapEnq?.prevEnquiriesWeekToDate ?? 18);
  const [prevEnquiriesMonthToDate, setPrevEnquiriesMonthToDate] = useState<number>(snapEnq?.prevEnquiriesMonthToDate ?? 950);
  const [prevEnquiriesWeekFull, setPrevEnquiriesWeekFull] = useState<number>(snapEnq?.prevEnquiriesWeekFull ?? 0);
  const [prevEnquiriesMonthFull, setPrevEnquiriesMonthFull] = useState<number>(snapEnq?.prevEnquiriesMonthFull ?? 0);
  const [pitchedEnquiriesToday, setPitchedEnquiriesToday] = useState<number>(snapEnq?.pitchedEnquiriesToday ?? 0);
  const [pitchedEnquiriesWeekToDate, setPitchedEnquiriesWeekToDate] = useState<number>(snapEnq?.pitchedEnquiriesWeekToDate ?? 0);
  const [pitchedEnquiriesMonthToDate, setPitchedEnquiriesMonthToDate] = useState<number>(snapEnq?.pitchedEnquiriesMonthToDate ?? 0);
  const [prevPitchedEnquiriesToday, setPrevPitchedEnquiriesToday] = useState<number>(snapEnq?.prevPitchedEnquiriesToday ?? 0);
  const [prevPitchedEnquiriesWeekToDate, setPrevPitchedEnquiriesWeekToDate] = useState<number>(snapEnq?.prevPitchedEnquiriesWeekToDate ?? 0);
  const [prevPitchedEnquiriesMonthToDate, setPrevPitchedEnquiriesMonthToDate] = useState<number>(snapEnq?.prevPitchedEnquiriesMonthToDate ?? 0);
  const [savedConversionComparison, setSavedConversionComparison] = useState<ConversionComparisonPayload | null>(() => sanitizeSavedConversionComparison(snapEnq?.conversionComparison ?? null));
  const [prevTodaysTasks, setPrevTodaysTasks] = useState<number>(12);
  const [prevTasksDueThisWeek, setPrevTasksDueThisWeek] = useState<number>(18);
  const [prevCompletedThisWeek, setPrevCompletedThisWeek] = useState<number>(17);
  const [prevRecordedTime, setPrevRecordedTime] = useState<{ hours: number; money: number }>({
    hours: 110,
    money: 900,
  });
  const [isContextsExpanded, setIsContextsExpanded] = useState<boolean>(false);

  // Home layout toggles — two independent booleans, each persisted in localStorage.
  // Visible only locally (useLocalData) or to LZ/AC dev preview. Default: off (legacy behaviour preserved).
  //   1. `hideAsanaAndTransactions` — hides OperationsQueue (CCL batch queue) + Transactions & Balances.
  //   2. `replacePipelineAndMatters` — renders ImmediateActionsBar inline as a ToDo box above the dashboard,
  //      and flags OperationsDashboard via `hidePipelineAndMatters` so it can drop its pipeline+matters
  //      sub-blocks. Sub-block gating inside OperationsDashboard is a follow-up slice.
  const LAYOUT_TOGGLE_KEYS = {
    hideAsanaAndTransactions: 'helix.home.hideAsanaAndTransactions',
    replacePipelineAndMatters: 'helix.home.replacePipelineAndMatters',
  } as const;
  // Home layout overlay removed 2026-04-21 — see CommandDeck Controls group.
  const readBoolToggle = (key: string): boolean => {
    try {
      if (typeof window !== 'undefined') {
        return window.localStorage.getItem(key) === '1';
      }
    } catch {
      // ignore storage errors
    }
    return false;
  };
  const writeBoolToggle = (key: string, value: boolean) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, value ? '1' : '0');
      }
    } catch {
      // ignore
    }
  };
  const [hideAsanaAndTransactions, setHideAsanaAndTransactionsState] = useState<boolean>(() => readBoolToggle(LAYOUT_TOGGLE_KEYS.hideAsanaAndTransactions));
  const [replacePipelineAndMatters, setReplacePipelineAndMattersState] = useState<boolean>(() => readBoolToggle(LAYOUT_TOGGLE_KEYS.replacePipelineAndMatters));
  const setHideAsanaAndTransactions = useCallback((v: boolean) => {
    setHideAsanaAndTransactionsState(v);
    writeBoolToggle(LAYOUT_TOGGLE_KEYS.hideAsanaAndTransactions, v);
  }, [LAYOUT_TOGGLE_KEYS.hideAsanaAndTransactions]);
  const setReplacePipelineAndMatters = useCallback((v: boolean) => {
    setReplacePipelineAndMattersState(v);
    writeBoolToggle(LAYOUT_TOGGLE_KEYS.replacePipelineAndMatters, v);
  }, [LAYOUT_TOGGLE_KEYS.replacePipelineAndMatters]);

  // Consolidation 2026-04-21: the Home layout overlay is gone. CommandDeck
  // (via HubToolsChip) is now the single surface for these toggles. It writes
  // the same localStorage keys and fires `helix:homeLayoutToggled` so this
  // component re-syncs its state without a reload.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { key?: string; value?: boolean } | undefined;
      if (!detail) return;
      if (detail.key === LAYOUT_TOGGLE_KEYS.hideAsanaAndTransactions) {
        setHideAsanaAndTransactionsState(!!detail.value);
      } else if (detail.key === LAYOUT_TOGGLE_KEYS.replacePipelineAndMatters) {
        setReplacePipelineAndMattersState(!!detail.value);
      }
    };
    window.addEventListener('helix:homeLayoutToggled', handler as EventListener);
    return () => window.removeEventListener('helix:homeLayoutToggled', handler as EventListener);
  }, [LAYOUT_TOGGLE_KEYS.hideAsanaAndTransactions, LAYOUT_TOGGLE_KEYS.replacePipelineAndMatters]);

  const [formsFavorites, setFormsFavorites] = useState<FormItem[]>([]);
  const [resourcesFavorites, setResourcesFavorites] = useState<Resource[]>([]);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [isBespokePanelOpen, setIsBespokePanelOpen] = useState<boolean>(false);
  const [bespokePanelContent, setBespokePanelContent] = useState<ReactNode>(null);
  const [bespokePanelTitle, setBespokePanelTitle] = useState<string>('');
  const [bespokePanelDescription, setBespokePanelDescription] = useState<string>('');
  const [bespokePanelIcon, setBespokePanelIcon] = useState<string | null>(null);
  const [bespokePanelWidth, setBespokePanelWidth] = useState<string>('85%');
  const [isContextPanelOpen, setIsContextPanelOpen] = useState<boolean>(false);
  const [bankHolidays, setBankHolidays] = useState<Set<string>>(new Set());

  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const homeMetricsUserKey = useMemo(() => {
    const rawEmail = String(userData?.[0]?.Email || '').toLowerCase().trim();
    const rawInitials = String(userData?.[0]?.Initials || '').toUpperCase().trim();
    return rawEmail || rawInitials ? `${rawEmail}|${rawInitials}` : null;
  }, [userData]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>(() => bootSnapshot?.attendanceData?.attendance || []);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [annualLeaveRecords, setAnnualLeaveRecords] = useState<AnnualLeaveRecord[]>(() => bootSnapshot?.annualLeaveRecords || []);
  const [annualLeaveError, setAnnualLeaveError] = useState<string | null>(null);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState<boolean>(false);
  const [isLoadingAnnualLeave, setIsLoadingAnnualLeave] = useState<boolean>(false);
  const [wipClioData, setWipClioData] = useState<any | null>(bootSnapshot?.wipClioData ?? null);
  const [wipClioError, setWipClioError] = useState<string | null>(null);
  const [recoveredData, setRecoveredData] = useState<number | null>(bootSnapshot?.recoveredData ?? null);
  const [prevRecoveredData, setPrevRecoveredData] = useState<number | null>(bootSnapshot?.prevRecoveredData ?? null);
  const [recoveredHours, setRecoveredHours] = useState<number | null>(bootSnapshot?.recoveredHours ?? null);
  const [prevRecoveredHours, setPrevRecoveredHours] = useState<number | null>(bootSnapshot?.prevRecoveredHours ?? null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recoveredError, setRecoveredError] = useState<string | null>(null);
  const [prevRecoveredError, setPrevRecoveredError] = useState<string | null>(null);
  const [isLoadingWipClio, setIsLoadingWipClio] = useState<boolean>(() => !bootSnapshot?.wipClioData);
  const [isLoadingRecovered, setIsLoadingRecovered] = useState<boolean>(() => bootSnapshot?.recoveredData == null && bootSnapshot?.prevRecoveredData == null);
  const [isLoadingEnquiryMetrics, setIsLoadingEnquiryMetrics] = useState<boolean>(() => !bootSnapshot?.enquiryMetrics);
  const [recentEnquirySnapshotRecords, setRecentEnquirySnapshotRecords] = useState<Array<{
    id?: string;
    enquiryId?: string;
    date?: string;
    poc?: string;
    aow?: string;
    source?: string;
    name?: string;
    stage?: string;
  }>>(() => bootSnapshot?.recentEnquiryRecords ?? []);
  const [futureLeaveRecords, setFutureLeaveRecords] = useState<AnnualLeaveRecord[]>(() => bootSnapshot?.futureLeaveRecords || []);
  const [annualLeaveTotals, setAnnualLeaveTotals] = useState<any>(null);
  const [isActionsLoading, setIsActionsLoading] = useState<boolean>(true);
  const [hasStartedParallelFetch, setHasStartedParallelFetch] = useState<boolean>(false);

  const [allMatters, setAllMatters] = useState<Matter[] | null>(null);
  const [allMattersError, setAllMattersError] = useState<string | null>(null);
  const [isLoadingAllMatters, setIsLoadingAllMatters] = useState<boolean>(false);
  const [homeMatters, setHomeMatters] = useState<NormalizedMatter[]>([]);
  const [isLoadingHomeMatters, setIsLoadingHomeMatters] = useState<boolean>(true);

  // State for refreshing time metrics
  const [isRefreshingTimeMetrics, setIsRefreshingTimeMetrics] = useState<boolean>(false);
  const hasSeededEnquiryMetricsRef = useRef(!!bootSnapshot?.enquiryMetrics);

  // Section-specific reveal gates — allow each section to appear independently
  // as its data arrives, rather than waiting for all data.
  const mattersBootReady = Array.isArray(providedMatters)
    || !isLoadingHomeMatters
    || allMatters != null
    || allMattersError != null;
  const dashboardSectionReady = hasStartedParallelFetch && !isLoadingWipClio;
  const teamSectionReady = hasStartedParallelFetch && !isLoadingAttendance;
  const opsSectionReady = homeDataReady;

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

  // Demo mode: track whether a CCL draft exists for the demo matter (drives Home action card)
  const [demoCclDraftExists, setDemoCclDraftExists] = useState(false);
  const [homeCclReviewRequest, setHomeCclReviewRequest] = useState<HomeCclReviewRequest | null>(null);
  useEffect(() => {
    if (!demoModeEnabled) return;
    const checkDemoCcl = async () => {
      try {
        const res = await fetch('/api/ccl/DEMO-3311402');
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && (data.exists || data.json)) {
          setDemoCclDraftExists(true);
        }
      } catch { /* silent */ }
    };
    checkDemoCcl();
  }, [demoModeEnabled]);

  // Consider immediate actions 'ready' only after we've actually started the parallel fetch.
  // This avoids an initial "All caught up" flash before attendance-derived actions appear.
  const homePrimaryReady = hasStartedParallelFetch;

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

  const [outstandingBalancesData, setOutstandingBalancesData] = useState<any | null>(() => {
    if (useLocalData) return null;
    try {
      const raw = safeGetItem('outstandingBalancesData');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  // Track whether the SSE stream has already provided firm-wide outstanding balances.
  // The user-specific useEffect must NOT overwrite richer stream data.
  const streamOutstandingReceivedRef = useRef(false);

  const [futureBookings, setFutureBookings] = useState<FutureBookingsResponse>(() => {
    if (!useLocalData) {
      try {
        const raw = safeGetItem('futureBookingsSnapshot');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.boardroomBookings) && Array.isArray(parsed.soundproofBookings)) {
            return parsed as FutureBookingsResponse;
          }
        }
      } catch { /* ignore */ }
    }
    return { boardroomBookings: [], soundproofBookings: [] };
  });

  const [attendanceRealtimePulseNonce, setAttendanceRealtimePulseNonce] = useState(0);
  const [attendanceRealtimeHighlightInitials, setAttendanceRealtimeHighlightInitials] = useState<string | null>(null);

  const [futureBookingsRealtimePulse, setFutureBookingsRealtimePulse] = useState<
    | { nonce: number; id?: string; spaceType?: 'Boardroom' | 'Soundproof Pod'; changeType?: string }
    | null
  >(null);

  // R7: realtime pulse nonces for already-live channels (no bespoke metadata needed —
  // tile-level border-pulse cue when the underlying data refreshes via SSE).
  const [dataOpsPulseNonce, setDataOpsPulseNonce] = useState(0);
  const [annualLeavePulseNonce, setAnnualLeavePulseNonce] = useState(0);
  const [outstandingBalancesPulseNonce, setOutstandingBalancesPulseNonce] = useState(0);
  const [opsQueuePulseNonce, setOpsQueuePulseNonce] = useState(0);
  const [docWorkspacePulseNonce, setDocWorkspacePulseNonce] = useState(0);
  const [mattersPulseNonce, setMattersPulseNonce] = useState(0);
  const [enquiriesPulseNonce, setEnquiriesPulseNonce] = useState(0);
  // Per-channel SSE connection status, used by the persistent <LiveIndicatorDot />.
  const [realtimeChannelStatus, setRealtimeChannelStatus] = useState<{
    annualLeave: 'open' | 'connecting' | 'closed';
    dataOps: 'open' | 'connecting' | 'closed';
    attendance: 'open' | 'connecting' | 'closed';
    futureBookings: 'open' | 'connecting' | 'closed';
    outstandingBalances: 'open' | 'connecting' | 'closed';
    opsQueue: 'open' | 'connecting' | 'closed';
    docWorkspace: 'open' | 'connecting' | 'closed';
    matters: 'open' | 'connecting' | 'closed';
    enquiries: 'open' | 'connecting' | 'closed';
  }>({
    annualLeave: 'closed',
    dataOps: 'closed',
    attendance: 'closed',
    futureBookings: 'closed',
    outstandingBalances: 'closed',
    opsQueue: 'closed',
    docWorkspace: 'closed',
    matters: 'closed',
    enquiries: 'closed',
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
  const [todoRegistryCards, setTodoRegistryCards] = useState<ToDoCard[]>([]);
  const [isLoadingTodoRegistry, setIsLoadingTodoRegistry] = useState<boolean>(() => Boolean(userData?.[0]?.Initials));
  // Dev-owner (LZ) god-view scope toggle for the Home to-do registry.
  // 'mine' = current user's own cards (default, identical to pre-change behaviour).
  // 'all'  = firm-wide read; non-LZ cards become read-only with owner chip.
  // Persisted to localStorage so the choice survives reloads.
  const [homeTodoScope, setHomeTodoScope] = useState<'mine' | 'all'>(() => {
    if (typeof window === 'undefined') return 'mine';
    try {
      const v = window.localStorage.getItem('helix.homeTodoScope');
      return v === 'all' ? 'all' : 'mine';
    } catch {
      return 'mine';
    }
  });
  const canSeeTodoGodView = isDevOwner(userData?.[0]);

  const immediateActionsReady = hasStartedParallelFetch
    && !isActionsLoading
    && !isLoadingAttendance
    && !isLoadingAnnualLeave;

  useEffect(() => {
    if (!homePrimaryReady) {
      setSecondaryPanelsReady(false);
      return;
    }
    setSecondaryPanelsReady(true);
  }, [homePrimaryReady]);

  // ── Coordinated reveal: flip once when the fast-loading parallel data is in ──
  // Attendance + WIP are the minimum viable set for the dashboard to look complete.
  // Once they're in, reveal everything together — late arrivals (outstanding, bookings)
  // will fill into already-visible slots without layout shift.
  useEffect(() => {
    if (homeDataReady) return; // once flipped, never reset (avoids flicker on re-fetch)
    if (
      hasStartedParallelFetch &&
      !isLoadingAttendance &&
      !isLoadingWipClio
    ) {
      setHomeDataReady(true);
    }
  }, [hasStartedParallelFetch, isLoadingAttendance, isLoadingWipClio, homeDataReady]);

  // ── Round 4: per-section hydration probes ──
  // Each fires hydrate.home.{section} exactly once when that section's data
  // becomes available. Captures time-to-meaningful-content per section so we
  // can see which one settles last on warm-server cold reload.
  useFirstHydration('home.attendance', hasStartedParallelFetch && !isLoadingAttendance, { count: attendanceRecords.length });
  useFirstHydration('home.annualLeave', hasStartedParallelFetch && !isLoadingAnnualLeave, { count: annualLeaveRecords.length });
  useFirstHydration('home.wipClio', !isLoadingWipClio);
  useFirstHydration('home.enquiryMetrics', !isLoadingEnquiryMetrics);
  useFirstHydration('home.recoveredFees', !isLoadingRecovered);
  useFirstHydration('home.matters', homeMatters.length > 0 || !isLoadingHomeMatters, { count: homeMatters.length });
  useFirstHydration('home.outstandingBalances', outstandingBalancesData != null, { hasData: outstandingBalancesData != null });
  useFirstHydration('home.futureBookings', (futureBookings.boardroomBookings.length + futureBookings.soundproofBookings.length) > 0 || hasStartedParallelFetch);
  useFirstHydration('home.snippetEdits', snippetEdits.length > 0 || hasStartedParallelFetch, { count: snippetEdits.length });
  useFirstHydration('home.pendingDocActions', !pendingDocActionsLoading, { count: pendingDocActions.length });
  useFirstHydration('home.immediateActions', immediateActionsReady);
  useFirstHydration('home.dataReady', homeDataReady);

  // ── Boot monitor event emitter (dev-only) ──
  const bootMonitorPrevRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const sources: Record<string, 'pending' | 'loading' | 'done'> = {
      enquiries: enquiries != null ? 'done' : 'pending',
      matters: providedMatters != null ? 'done' : 'pending',
      instructionData: propInstructionData != null ? 'done' : 'pending',
      teamData: teamData != null ? 'done' : 'pending',
      attendance: isLoadingAttendance ? 'loading' : hasStartedParallelFetch ? 'done' : 'pending',
      annualLeave: isLoadingAnnualLeave ? 'loading' : hasStartedParallelFetch ? 'done' : 'pending',
      wipClio: isLoadingWipClio ? 'loading' : 'done',
      enquiryMetrics: isLoadingEnquiryMetrics ? 'loading' : 'done',
      recoveredFees: isLoadingRecovered ? 'loading' : 'done',
      allMatters: isLoadingAllMatters || isLoadingHomeMatters ? 'loading' : mattersBootReady ? 'done' : 'pending',
      pendingDocActions: pendingDocActionsLoading ? 'loading' : 'done',
      parallelFetch: hasStartedParallelFetch ? 'done' : 'pending',
      homePrimaryReady: homePrimaryReady ? 'done' : 'pending',
      secondaryPanelsReady: secondaryPanelsReady ? 'done' : 'pending',
      immediateActionsReady: immediateActionsReady ? 'done' : 'pending',
      homeDataReady: homeDataReady ? 'done' : 'pending',
      dashboardSection: dashboardSectionReady ? 'done' : 'pending',
      teamSection: teamSectionReady ? 'done' : 'pending',
      opsSection: opsSectionReady ? 'done' : 'pending',
    };
    const prev = bootMonitorPrevRef.current;
    const now = performance.now();
    for (const [source, status] of Object.entries(sources)) {
      if (prev[source] !== status) {
        appendHomeBootMonitorEvent(source, status, now);
        window.dispatchEvent(new CustomEvent('homeBootEvent', {
          detail: { source, status, timestamp: now },
        }));
      }
    }
    bootMonitorPrevRef.current = { ...sources };
  }, [
    enquiries, providedMatters, propInstructionData, teamData,
    isLoadingAttendance, isLoadingAnnualLeave, isLoadingWipClio,
    isLoadingRecovered, isLoadingEnquiryMetrics, isLoadingAllMatters,
    isLoadingHomeMatters, pendingDocActionsLoading, hasStartedParallelFetch, homePrimaryReady,
    secondaryPanelsReady, immediateActionsReady, homeDataReady, allMatters,
    allMattersError, mattersBootReady,
    dashboardSectionReady, teamSectionReady, opsSectionReady,
  ]);

  useEffect(() => {
    if (useLocalData) return;

    const snapshot = readHomeMetricsSnapshot(homeMetricsUserKey);
    if (!snapshot) return;

    cachedWipClio = snapshot.wipClioData;
    cachedRecovered = snapshot.recoveredData;
    cachedPrevRecovered = snapshot.prevRecoveredData;
    cachedRecoveredHours = snapshot.recoveredHours;
    cachedPrevRecoveredHours = snapshot.prevRecoveredHours;

    if (snapshot.wipClioData) {
      setWipClioData(snapshot.wipClioData);
      setIsLoadingWipClio(false);
    }

    if (snapshot.recoveredData !== null || snapshot.prevRecoveredData !== null) {
      setRecoveredData(snapshot.recoveredData);
      setPrevRecoveredData(snapshot.prevRecoveredData);
      setRecoveredHours(snapshot.recoveredHours);
      setPrevRecoveredHours(snapshot.prevRecoveredHours);
      setIsLoadingRecovered(false);
    }

    if (snapshot.recentEnquiryRecords.length > 0) {
      setRecentEnquirySnapshotRecords(snapshot.recentEnquiryRecords);
    }

    if (snapshot.enquiryMetrics) {
      setEnquiriesToday(snapshot.enquiryMetrics.enquiriesToday);
      setEnquiriesWeekToDate(snapshot.enquiryMetrics.enquiriesWeekToDate);
      setEnquiriesMonthToDate(snapshot.enquiryMetrics.enquiriesMonthToDate);
      setPrevEnquiriesToday(snapshot.enquiryMetrics.prevEnquiriesToday);
      setPrevEnquiriesWeekToDate(snapshot.enquiryMetrics.prevEnquiriesWeekToDate);
      setPrevEnquiriesMonthToDate(snapshot.enquiryMetrics.prevEnquiriesMonthToDate);
      setPrevEnquiriesWeekFull(snapshot.enquiryMetrics.prevEnquiriesWeekFull);
      setPrevEnquiriesMonthFull(snapshot.enquiryMetrics.prevEnquiriesMonthFull);
      setPitchedEnquiriesToday(snapshot.enquiryMetrics.pitchedEnquiriesToday);
      setPitchedEnquiriesWeekToDate(snapshot.enquiryMetrics.pitchedEnquiriesWeekToDate);
      setPitchedEnquiriesMonthToDate(snapshot.enquiryMetrics.pitchedEnquiriesMonthToDate);
      setPrevPitchedEnquiriesToday(snapshot.enquiryMetrics.prevPitchedEnquiriesToday);
      setPrevPitchedEnquiriesWeekToDate(snapshot.enquiryMetrics.prevPitchedEnquiriesWeekToDate);
      setPrevPitchedEnquiriesMonthToDate(snapshot.enquiryMetrics.prevPitchedEnquiriesMonthToDate);
      setEnquiryMetricsBreakdown(snapshot.enquiryMetrics.enquiryMetricsBreakdown ?? null);
      setSavedConversionComparison(snapshot.enquiryMetrics.conversionComparison ?? null);
      hasSeededEnquiryMetricsRef.current = true;
      setIsLoadingEnquiryMetrics(false);
    }

    // Restore attendance + leave from snapshot for instant team insight render
    if (snapshot.attendanceData) {
      cachedAttendance = snapshot.attendanceData;
      setAttendanceRecords(snapshot.attendanceData.attendance || []);
      setAttendanceTeam(snapshot.attendanceData.team || []);
      setIsLoadingAttendance(false);
    }
    if (snapshot.annualLeaveRecords) {
      cachedAnnualLeave = snapshot.annualLeaveRecords;
      setAnnualLeaveRecords(snapshot.annualLeaveRecords);
      setIsLoadingAnnualLeave(false);
    }
    if (snapshot.futureLeaveRecords) {
      cachedFutureLeaveRecords = snapshot.futureLeaveRecords;
      setFutureLeaveRecords(snapshot.futureLeaveRecords);
    }

    // Open readiness gates immediately when snapshot provides the critical data —
    // the parallel fetch will still fire and update in the background
    if (snapshot.wipClioData || snapshot.attendanceData) {
      setHasStartedParallelFetch(true);
    }
  }, [homeMetricsUserKey, useLocalData]);

  const fetchPendingDocActions = useCallback(async () => {
    try {
      setPendingDocActionsLoading(true);
      const url = '/api/doc-workspace/pending-actions';
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
  }, []);

  // Fetch pending doc workspace actions on mount
  useEffect(() => {
    if (!homePrimaryReady) {
      return;
    }
    fetchPendingDocActions();
  }, [homePrimaryReady, fetchPendingDocActions]);

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
  // POC field: new DB uses `poc`, legacy uses `Point_of_Contact`.
  // Unclaimed variants must match server definition (enquiries-unified.js).
  const unclaimedEnquiries = useMemo(
    () =>
      (deferredEnquiries || []).filter((e: any) => {
        const poc = (e.Point_of_Contact || e.poc || '').toLowerCase().trim();
        return !poc || poc === 'team@helix-law.com' || poc === 'team' || poc === 'team inbox';
      }),
    [deferredEnquiries]
  );

  const unclaimedSummary = useMemo<UnclaimedSummaryPayload>(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - mondayOffset);
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const items = unclaimedEnquiries
      .map((enquiry: any) => {
        const parsedDate = parseDateValue(enquiry.Touchpoint_Date || enquiry.Date_Created || enquiry.datetime);
        if (!parsedDate) return null;
        const fullName = `${String(enquiry.First_Name || enquiry.first || '').trim()} ${String(enquiry.Last_Name || enquiry.last || '').trim()}`.trim();
        const rawValue = Number(
          enquiry.Amount
          ?? enquiry.amount
          ?? enquiry.Value
          ?? enquiry.value
          ?? enquiry.Deal_Value
          ?? enquiry.dealValue
          ?? 0,
        );
        return {
          id: String(enquiry.ID || enquiry.id || `${parsedDate.toISOString()}-${fullName || enquiry.Email || 'unclaimed'}`),
          name: String(fullName || enquiry.Company || enquiry.Email || 'Unnamed enquiry').trim(),
          email: String(enquiry.Email || enquiry.email || '').trim(),
          aow: String(enquiry.Area_of_Work || enquiry.aow || 'Other').trim() || 'Other',
          date: parsedDate.toISOString(),
          ageDays: Math.max(0, Math.floor((todayStart.getTime() - new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()).getTime()) / 86400000)),
          value: Number.isFinite(rawValue) ? rawValue : 0,
          dataSource: (enquiry.__sourceType === 'new' ? 'new' : 'legacy') as 'new' | 'legacy',
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

    const buildRange = (key: 'today' | 'yesterday' | 'week' | 'lastWeek' | 'month' | 'lastMonth', label: string, matcher: (date: Date) => boolean) => {
      const rangeItems = items.filter((item) => matcher(new Date(item.date)));
      const aowCounts = new Map<string, { count: number; totalValue: number }>();
      rangeItems.forEach((item) => {
        const current = aowCounts.get(item.aow) ?? { count: 0, totalValue: 0 };
        current.count += 1;
        current.totalValue += item.value;
        aowCounts.set(item.aow, current);
      });
      return {
        key,
        label,
        count: rangeItems.length,
        totalValue: rangeItems.reduce((sum, item) => sum + item.value, 0),
        staleCount: rangeItems.filter((item) => item.ageDays >= 7).length,
        oldestAgeDays: rangeItems.reduce((max, item) => Math.max(max, item.ageDays), 0),
        aowBreakdown: Array.from(aowCounts.entries())
          .map(([aowKey, stats]) => ({ key: aowKey, count: stats.count, totalValue: stats.totalValue }))
          .sort((left, right) => right.count - left.count)
          .slice(0, 6),
        items: [...rangeItems].sort((left, right) => right.ageDays - left.ageDays || Date.parse(left.date) - Date.parse(right.date)),
      };
    };

    return {
      ranges: [
        buildRange('today', 'Today', (date) => date >= todayStart),
        buildRange('yesterday', 'Yesterday', (date) => date >= yesterdayStart && date < todayStart),
        buildRange('week', 'This Week', (date) => date >= weekStart),
        buildRange('lastWeek', 'Last Week', (date) => date >= lastWeekStart && date < weekStart),
        buildRange('month', 'This Month', (date) => date >= monthStart),
        buildRange('lastMonth', 'Last Month', (date) => date >= lastMonthStart && date < monthStart),
      ],
    };
  }, [unclaimedEnquiries]);

  // Unclaimed counts by date range (for dashboard pills)
  const { unclaimedToday, unclaimedThisWeek, unclaimedLastWeek } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = now.getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - mondayOffset);
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekStart);

    let today = 0;
    let week = 0;
    let lastWk = 0;
    for (const e of unclaimedEnquiries) {
      const d = new Date(e.Date_Created);
      if (isNaN(d.getTime())) continue;
      if (d >= todayStart) today++;
      if (d >= weekStart) week++;
      if (d >= lastWeekStart && d < lastWeekEnd) lastWk++;
    }
    return { unclaimedToday: today, unclaimedThisWeek: week, unclaimedLastWeek: lastWk };
  }, [unclaimedEnquiries]);

  // Fetch pending snippet edits and prefetch snippet blocks
  useEffect(() => {
    // SNIPPET FUNCTIONALITY REMOVED - Changed approach completely
    // Snippet edits and blocks are no longer fetched from Azure Functions
    const useLocal = process.env.REACT_APP_USE_LOCAL_DATA === 'true';

    const fetchEditsAndBlocks = async () => {
      if (useLocal) {
        const [{ default: localSnippetEdits }, { default: localV3Blocks }] = await Promise.all([
          import('../../localData/localSnippetEdits.json'),
          import('../../localData/localV3Blocks.json'),
        ]);
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

  // Check for active matter opening / pitch builder — event-driven (no polling)
  useEffect(() => {
    if (!isActive) return;

    const checkBoth = () => {
      setHasActiveMatter(hasActiveMatterOpening(isInMatterOpeningWorkflow));
      setHasActivePitch(hasActivePitchBuilder());
    };
    checkBoth();

    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('matterOpeningDraft_') || e.key === 'pitchBuilderState') checkBoth();
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') checkBoth(); };

    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isActive, isInMatterOpeningWorkflow]);

  const [localInstructionDataState, setLocalInstructionDataState] = useState<InstructionData[]>([]);

  // Use prop instruction data if available, otherwise use local state
  const instructionData = propInstructionData || localInstructionDataState;

  // Load instruction data - only load local data if no prop data is provided
  useEffect(() => {
    if (!propInstructionData && useLocalData) {
      import('../../localData/localInstructionData.json').then(({ default: localInstructionData }) => {
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
      });
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
    cachedRecoveredHours = null;
    cachedPrevRecoveredHours = null;
    recoveredFeesInitialized.current = false; // Reset so new user can fetch
    parallelFetchKeyRef.current = ''; // Reset so parallel fetch runs for new user
    zeroWipFallbackRef.current = false; // Reset fallback flag for new user
    setHasStartedParallelFetch(false);
    setWipClioData(null);
    setRecoveredData(null);
    setPrevRecoveredData(null);
    setRecoveredHours(null);
    setPrevRecoveredHours(null);
  }, [userData]);

  // Separate effect to fetch recovered fees — auto-refreshes every 2 min + on tab focus
  useEffect(() => {
    if (!isActive) {
      return;
    }

    let isMounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchRecoveredFeesSummary = async (bypassCache = false) => {
      if (!userData?.[0]) {
        if (isMounted) {
          setIsLoadingRecovered(false);
        }
        return;
      }

      const currentUserData = userData[0];
      const isFirmWide = isDevOwner(currentUserData) && !originalAdminUser && !HOME_FORCE_MINE_LOCAL;
      let userClioId = currentUserData?.['Clio ID'] ? String(currentUserData['Clio ID']) : null;
      let userEntraId = currentUserData?.['Entra ID'] || currentUserData?.EntraID 
        ? String(currentUserData['Entra ID'] || currentUserData.EntraID) 
        : null;

      if (!isFirmWide && !userClioId && !userEntraId) {
        console.warn('⚠️ No Clio ID or Entra ID available for recovered fees');
        if (isMounted) {
          setIsLoadingRecovered(false);
        }
        return;
      }

      try {
        const url = new URL('/api/reporting/management-datasets', window.location.origin);
        url.searchParams.set('datasets', 'recoveredFeesSummary');
        if (bypassCache) {
          url.searchParams.set('bypassCache', 'true');
        }
        if (isFirmWide) {
          url.searchParams.set('firm', 'true');
        }
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
        const curHrs = Number(summary.currentMonthHours) || 0;
        const prevHrs = Number(summary.previousMonthHours) || 0;

        cachedRecovered = currentTotal;
        cachedPrevRecovered = lastTotal;
        cachedRecoveredHours = curHrs;
        cachedPrevRecoveredHours = prevHrs;
        if (isMounted) {
          setRecoveredData(currentTotal);
          setPrevRecoveredData(lastTotal);
          setRecoveredHours(curHrs);
          setPrevRecoveredHours(prevHrs);
        }
        recoveredFeesInitialized.current = true;
        lastRecoveredFetchAt.current = Date.now();
      } catch (error) {
        console.error('❌ Error fetching recovered fees summary:', error);
      } finally {
        if (isMounted) {
          setIsLoadingRecovered(false);
        }
      }
    };

    // Initial load: use module cache if available, then always schedule refresh
    if (cachedRecovered !== null && !recoveredFeesInitialized.current) {
      recoveredFeesInitialized.current = true;
      setRecoveredData(cachedRecovered);
      setPrevRecoveredData(cachedPrevRecovered ?? 0);
      setRecoveredHours(cachedRecoveredHours ?? 0);
      setPrevRecoveredHours(cachedPrevRecoveredHours ?? 0);
      setIsLoadingRecovered(false);
    }
    // Always fetch fresh on mount (bypassCache on subsequent loads)
    fetchRecoveredFeesSummary(recoveredFeesInitialized.current);

    // 30 min safety net — primary refresh is via DataOps SSE subscription (dataOps.synced event)
    intervalId = setInterval(() => {
      fetchRecoveredFeesSummary(true);
    }, 30 * 60 * 1000);

    // Refresh on tab visibility change (user returns to tab) — 5s cooldown prevents double-fire at mount
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRecoveredFetchAt.current > 5000) {
        fetchRecoveredFeesSummary(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, userData?.[0]?.EntraID, userData?.[0]?.['Entra ID'], userData?.[0]?.Initials, userData?.[0]?.['Clio ID']]);

  // Refresh time metrics callback - clears cache and re-fetches WIP and recovered fees
  const handleRefreshTimeMetrics = useCallback(async () => {
    if (demoModeEnabled) {
      setIsRefreshingTimeMetrics(false);
      return;
    }
    if (!userData?.[0]) return;
    
    setIsRefreshingTimeMetrics(true);
    
    const currentUserData = userData[0];
    
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
      
      // Parallel fetch of WIP and recovered fees
      await Promise.all([
        // Fetch WIP using same endpoint as parallel fetch
        (async () => {
          try {
            // Dev-owner god mode: fetch team-aggregated WIP (unless user has switched to another person)
            const useTeamEndpoint = isDevOwner(currentUserData) && !originalAdminUser && !HOME_FORCE_MINE_LOCAL;
            const wipUrl = useTeamEndpoint
              ? '/api/home-wip/team'
              : userEntraId ? `/api/home-wip?entraId=${encodeURIComponent(userEntraId)}` : null;
            if (!wipUrl) return;
            const resp = await fetch(wipUrl, {
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
          url.searchParams.set('bypassCache', 'true');
          if (userClioId) url.searchParams.set('clioId', userClioId);
          if (userEntraId) url.searchParams.set('entraId', userEntraId);
          
          const resp = await fetch(url.toString(), { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
          
          if (resp.ok) {
            const data = await resp.json();
            const summary = data.recoveredFeesSummary;
            if (summary && typeof summary === 'object') {
              const currentTotal = Number(summary.currentMonthTotal) || 0;
              const lastTotal = Number(summary.previousMonthTotal) || 0;
              const curHrs = Number(summary.currentMonthHours) || 0;
              const prevHrs = Number(summary.previousMonthHours) || 0;
              cachedRecovered = currentTotal;
              cachedPrevRecovered = lastTotal;
              cachedRecoveredHours = curHrs;
              cachedPrevRecoveredHours = prevHrs;
              setRecoveredData(currentTotal);
              setPrevRecoveredData(lastTotal);
              setRecoveredHours(curHrs);
              setPrevRecoveredHours(prevHrs);
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

  const userFullName = userData?.[0]?.FullName || '';

  // Use Home-fetched matters first (fast, limited); then app-provided; then legacy allMatters
  const normalizedMatters = useMemo<NormalizedMatter[]>(() => {
    if (homeMatters && homeMatters.length > 0) return homeMatters;
    if (deferredProvidedMatters && deferredProvidedMatters.length > 0) return deferredProvidedMatters;
    if (!allMatters) return [];
    return allMatters.map(matter => normalizeMatterData(matter, userFullName, 'legacy_all'));
  }, [homeMatters, deferredProvidedMatters, allMatters, userData, userFullName]);

  const demoModeActive = useMemo(() => {
    if (demoModeEnabled) return true;
    try {
      return localStorage.getItem('demoModeEnabled') === 'true';
    } catch {
      return false;
    }
  }, [demoModeEnabled]);

  // Recent new-space matters for the operations dashboard
  const recentMatters = useMemo(() => {
    // Resolve demo state inline — belt-and-braces: prop OR localStorage
    const isDemo = demoModeActive || (() => { try { return localStorage.getItem('demoModeEnabled') === 'true'; } catch { return false; } })();

    const isDemoMatter = (m: NormalizedMatter): boolean => {
      const matterId = String(m.matterId || '').toUpperCase();
      const displayNumber = String(m.displayNumber || '').toUpperCase();
      const instructionRef = String(m.instructionRef || '').toUpperCase();
      const clientName = String(m.clientName || '').toUpperCase();
      return matterId.startsWith('DEMO-')
        || displayNumber.startsWith('DEMO-')
        || instructionRef.includes('HLX-DEMO')
        || instructionRef === 'HELIX01-01'
        || clientName.startsWith('DEMO ')
        || clientName === 'HELIX ADMINISTRATION';
    };

    // Resolve the real solicitor name from team data using initials
    // On localhost the dev user's FullName (e.g. "Luke Dev") won't match real solicitor names
    const userInitials = (userData?.[0]?.Initials || '').trim().toUpperCase();

    const teamRecord = deferredTeamData?.find(
      (t: any) => (t?.Initials || '').trim().toUpperCase() === userInitials
    );
    const resolvedName = teamRecord?.['Full Name'] || teamRecord?.['Nickname'] || userFullName || '';

    const isUserMatter = (solicitor: string): boolean => {
      if (!resolvedName && !userInitials) return true;
      const s = solicitor.toLowerCase().trim().replace(/\s+/g, ' ');
      if (!s) return true;

      // Match against resolved full name
      const u = resolvedName.toLowerCase().trim().replace(/\s+/g, ' ');
      if (u && s === u) return true;
      // Handle "Last, First" format
      if (u && s.includes(',')) {
        const [last, first] = s.split(',').map((p: string) => p.trim());
        if (`${first} ${last}` === u) return true;
      }
      // Also match against first name only (e.g. "Luke" matches "Luke Watson")
      const firstName = (teamRecord?.['First'] || teamRecord?.['Nickname'] || '').toLowerCase().trim();
      if (firstName && s === firstName) return true;
      if (firstName && s.startsWith(firstName + ' ')) return true;

      return false;
    };

    // Dev owner sees all matters; everyone else sees only their own
    const isAdmin = isDevOwner(userData?.[0]);

    const mapped = normalizedMatters
      .filter(m => m.dataSource === 'vnet_direct')
      .filter(m => isDemoMatter(m) ? isDemo : (isAdmin || isUserMatter(m.responsibleSolicitor || '')))
      .filter(m => isDemo ? true : !isDemoMatter(m))
      .sort((a, b) => (b.openDate || '').localeCompare(a.openDate || ''))
      .map(m => ({
        matterId: m.matterId || '',
        displayNumber: m.displayNumber || '',
        clientName: m.clientName || '',
        description: m.description || '',
        practiceArea: m.practiceArea || '',
        openDate: m.openDate || '',
        responsibleSolicitor: m.responsibleSolicitor || '',
        originatingSolicitor: m.originatingSolicitor || '',
        status: (m.status === 'closed' ? 'closed' : 'active') as 'active' | 'closed',
        instructionRef: m.instructionRef,
        sourceVersion: (m.dataSource === 'vnet_direct' ? 'v4' : 'v3') as 'v4' | 'v3',
      }));

    if (!isDemo) return mapped;

    // Check if a demo matter already exists in the list
    const hasDemoMatter = mapped.some(m => {
      const matterId = String(m.matterId || '').toUpperCase();
      const instructionRef = String(m.instructionRef || '').toUpperCase();
      const clientName = String(m.clientName || '').toUpperCase();
      return matterId.startsWith('DEMO-')
        || instructionRef === 'HELIX01-01'
        || clientName === 'HELIX ADMINISTRATION';
    });

    if (hasDemoMatter) return mapped;

    // Inject the same demo matter used by the Matters tab
    const today = new Date().toISOString().split('T')[0];
    return [
      {
        matterId: 'DEMO-3311402',
        displayNumber: 'HELIX01-01',
        clientName: 'Helix administration',
        practiceArea: 'Commercial',
        openDate: today,
        responsibleSolicitor: resolvedName || userFullName || 'Demo User',
        originatingSolicitor: resolvedName || userFullName || 'Demo User',
        status: 'active' as 'active' | 'closed',
        instructionRef: 'HELIX01-01',
        sourceVersion: 'v4' as const,
      },
      ...mapped,
    ].slice(0, 15);
  }, [normalizedMatters, demoModeActive, userFullName, userData, deferredTeamData]);

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

  const fetchTodoRegistryCards = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const ownerInitials = String(userInitials || '').trim().toUpperCase();
    const useAllScope = canSeeTodoGodView && homeTodoScope === 'all';
    if (!ownerInitials && !useAllScope) {
      setTodoRegistryCards([]);
      setIsLoadingTodoRegistry(false);
      return;
    }

    if (!silent) {
      setIsLoadingTodoRegistry(true);
    }

    try {
      const url = useAllScope
        ? '/api/todo?scope=all'
        : `/api/todo?owner=${encodeURIComponent(ownerInitials)}`;
      const response = await fetch(url, {
        headers: { 'x-user-initials': ownerInitials },
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Failed to load Home to-do items');
      }

      const cards = Array.isArray(data.cards) ? data.cards : [];
      setTodoRegistryCards(cards.filter((card: ToDoCard) => FORMS_TODO_KINDS.has(card.kind)));
    } catch (error) {
      debugWarn('Failed to load forms to-do registry', error);
    } finally {
      if (!silent) {
        setIsLoadingTodoRegistry(false);
      }
    }
  }, [userInitials, canSeeTodoGodView, homeTodoScope]);

  useEffect(() => {
    if (!isActive) return;

    const ownerInitials = String(userInitials || '').trim().toUpperCase();
    const useAllScope = canSeeTodoGodView && homeTodoScope === 'all';
    if (!ownerInitials && !useAllScope) {
      setTodoRegistryCards([]);
      setIsLoadingTodoRegistry(false);
      return;
    }

    void fetchTodoRegistryCards();
    const intervalId = window.setInterval(() => {
      void fetchTodoRegistryCards({ silent: true });
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [fetchTodoRegistryCards, isActive, userInitials, canSeeTodoGodView, homeTodoScope]);

  const openRegisterTodoPanel = useCallback((tab: FormsTodoRegisterTab, title: string, description: string, icon: string) => {
    setBespokePanelWidth('78%');
    setBespokePanelContent(
      <div data-helix-region={`home/todo/${tab}`}>
        <RegistersWorkspace
          userData={userData}
          teamData={teamData}
          isDarkMode={isDarkMode}
          initialTab={tab}
          lockedTab={tab}
          onMutationSuccess={() => {
            void fetchTodoRegistryCards({ silent: true });
          }}
        />
      </div>
    );
    setBespokePanelTitle(title);
    setBespokePanelDescription(description);
    setBespokePanelIcon(icon);
    setIsBespokePanelOpen(true);
  }, [fetchTodoRegistryCards, isDarkMode, teamData, userData]);

  const handleApproveLdTodo = useCallback(async (card: ToDoCard) => {
    const payload = asRecord(card.payload);
    const activityId = readNumberValue(payload?.activityId);
    const reviewerInitials = String(userInitials || '').trim().toUpperCase();

    if (!activityId) {
      showToast('Missing L&D review details', 'error', 'The activity id was not present on this To Do card.');
      return;
    }
    if (!reviewerInitials) {
      showToast('Missing reviewer initials', 'error');
      return;
    }

    try {
      const response = await fetch(`/api/registers/learning-dev/activity/${activityId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-helix-initials': reviewerInitials,
        },
        body: JSON.stringify({ status: 'verified' }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || 'Failed to approve L&D entry');
      }

      showToast('L&D entry approved', 'success');
      await fetchTodoRegistryCards({ silent: true });
    } catch (error) {
      showToast(
        'Failed to approve L&D entry',
        'error',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }, [fetchTodoRegistryCards, showToast, userInitials]);

  // Realtime: when annual leave changes (approved/edited/created), refresh so other users' approvals update.
  // Migrated to useRealtimeChannel (R7 D6 follow-up: home-realtime-channel-migration).
  const { status: annualLeaveStatus } = useRealtimeChannel(
    '/api/attendance/annual-leave/stream',
    {
      event: 'annualLeave.changed',
      name: 'annualLeave',
      enabled: !!userInitials && isActive && homeDataReady && isPageVisible,
      debounceMs: 350,
      onChange: () => {
        setAnnualLeavePulseNonce((n) => n + 1);
        void refreshAnnualLeaveData(undefined, { forceRefresh: true });
      },
    }
  );
  useEffect(() => {
    setRealtimeChannelStatus((s) => (s.annualLeave === annualLeaveStatus ? s : { ...s, annualLeave: annualLeaveStatus }));
  }, [annualLeaveStatus]);

  // Realtime: when data-ops sync completes (collectedTime or WIP), refresh time metrics.
  // Migrated to useRealtimeChannel.
  const { status: dataOpsStatus } = useRealtimeChannel(
    '/api/data-operations/stream',
    {
      event: 'dataOps.synced',
      name: 'dataOps',
      enabled: !!userInitials && isActive && homeDataReady && isPageVisible,
      debounceMs: 500,
      onChange: () => {
        setDataOpsPulseNonce((n) => n + 1);
        void handleRefreshTimeMetrics();
      },
    }
  );
  useEffect(() => {
    setRealtimeChannelStatus((s) => (s.dataOps === dataOpsStatus ? s : { ...s, dataOps: dataOpsStatus }));
  }, [dataOpsStatus]);

  // Realtime: when attendance changes (someone confirms), refresh team attendance view.
  // Migrated to useRealtimeChannel — hook handles debounce; payload last-write-wins captures most recent initials.
  type AttendancePayload = { initials?: string };
  const { status: attendanceStatus } = useRealtimeChannel<AttendancePayload>(
    '/api/attendance/attendance/stream',
    {
      event: 'attendance.changed',
      name: 'attendance',
      enabled: !!userInitials && isActive && homeDataReady && isPageVisible,
      debounceMs: 350,
      onChange: async (payload) => {
        const initials = payload?.initials ? String(payload.initials).toUpperCase() : null;
        if (initials) setAttendanceRealtimeHighlightInitials(initials);
        setAttendanceRealtimePulseNonce((n) => n + 1);
        try {
          const response = await fetch('/api/attendance/getAttendance', {
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
            Confirmed_At: member.Confirmed_At ?? null,
            weeks: member.weeks || {},
          }));

          cachedAttendance = { attendance: transformedAttendance, team: data.team || [] };
          cachedAttendanceError = null;

          setAttendanceRecords(transformedAttendance);
          setAttendanceTeam(data.team || []);
        } catch (error) {
          console.warn('[Home] Failed to refresh attendance (realtime):', error);
        }
      },
    }
  );
  useEffect(() => {
    setRealtimeChannelStatus((s) => (s.attendance === attendanceStatus ? s : { ...s, attendance: attendanceStatus }));
  }, [attendanceStatus]);

  // Realtime: when future bookings change, refresh bookings so other users see updates.
  // Migrated to useRealtimeChannel with reducePayload to merge per-event metadata across debounce window.
  type FutureBookingsPayload = {
    id?: string | number;
    spaceType?: string;
    changeType?: string;
  };
  const { status: futureBookingsStatus } = useRealtimeChannel<FutureBookingsPayload>(
    '/api/future-bookings/stream',
    {
      event: 'futureBookings.changed',
      name: 'futureBookings',
      enabled: !!userInitials && isActive && homeDataReady && isPageVisible,
      debounceMs: 350,
      // Last-write-wins for meta (matches pre-migration behaviour).
      reducePayload: (_prev, incoming) => incoming || _prev,
      onChange: async (payload) => {
        const id = payload?.id !== undefined ? String(payload.id) : undefined;
        const spaceTypeRaw = payload?.spaceType ? String(payload.spaceType) : undefined;
        const changeType = payload?.changeType ? String(payload.changeType) : undefined;
        const spaceType: 'Boardroom' | 'Soundproof Pod' | undefined =
          spaceTypeRaw === 'Boardroom' || spaceTypeRaw === 'Soundproof Pod' ? spaceTypeRaw : undefined;
        setFutureBookingsRealtimePulse((prev) => ({
          nonce: (prev?.nonce || 0) + 1,
          id,
          spaceType,
          changeType,
        }));
        try {
          const response = await fetch('/api/future-bookings');
          if (!response.ok) return;
          const data = await response.json();
          setFutureBookings(data);
          try { safeSetItem('futureBookingsSnapshot', JSON.stringify(data)); } catch { /* ignore */ }
        } catch (error) {
          console.warn('[Home] Failed to refresh future bookings (realtime):', error);
        }
      },
    }
  );
  useEffect(() => {
    setRealtimeChannelStatus((s) => (s.futureBookings === futureBookingsStatus ? s : { ...s, futureBookings: futureBookingsStatus }));
  }, [futureBookingsStatus]);

  // R7: Hub Tools → "Demo Realtime Pulse" — staggered cue across every wired
  // tile so a dev can preview the live-update visual without waiting for a
  // real server event. Listens for `demoRealtimePulse` CustomEvent.
  useEffect(() => {
    const handler = () => {
      // Stagger so each tile pulses ~120ms apart — feels like a wave.
      let i = 0;
      const fire = (fn: () => void) => window.setTimeout(fn, (i++) * 120);
      fire(() => setDataOpsPulseNonce((n) => n + 1));
      fire(() => setOpsQueuePulseNonce((n) => n + 1));
      fire(() => setOutstandingBalancesPulseNonce((n) => n + 1));
      fire(() => setMattersPulseNonce((n) => n + 1));
      fire(() => setDocWorkspacePulseNonce((n) => n + 1));
      fire(() => setEnquiriesPulseNonce((n) => n + 1));
      fire(() => setAnnualLeavePulseNonce((n) => n + 1));
      fire(() => setAttendanceRealtimePulseNonce((n) => n + 1));
      fire(() => {
        setFutureBookingsRealtimePulse((prev) => ({
          nonce: (prev?.nonce || 0) + 1,
          changeType: 'demo',
        }));
      });
    };
    window.addEventListener('demoRealtimePulse', handler);
    return () => window.removeEventListener('demoRealtimePulse', handler);
  }, []);

  // R7 B1: Outstanding balances stream — bumps tile pulse on sync completion.
  // Migrated to useRealtimeChannel.
  const { status: outstandingBalancesStatus } = useRealtimeChannel(
    '/api/outstanding-balances/stream',
    {
      event: 'outstandingBalances.changed',
      name: 'outstandingBalances',
      enabled: !!userInitials && isActive && homeDataReady && isPageVisible,
      onChange: () => {
        setOutstandingBalancesPulseNonce((n) => n + 1);
        try { window.dispatchEvent(new CustomEvent('helix:outstandingBalancesChanged')); } catch { /* ignore */ }
      },
    }
  );
  useEffect(() => {
    setRealtimeChannelStatus((s) => (s.outstandingBalances === outstandingBalancesStatus ? s : { ...s, outstandingBalances: outstandingBalancesStatus }));
  }, [outstandingBalancesStatus]);

  // R7 B6: Ops queue stream — bumps OperationsQueue tile pulse on any mutation.
  // Migrated to useRealtimeChannel.
  const { status: opsQueueStatus } = useRealtimeChannel(
    '/api/ops-queue/stream',
    {
      event: 'opsQueue.changed',
      name: 'opsQueue',
      enabled: !!userInitials && isActive && homeDataReady && isPageVisible,
      onChange: () => {
        setOpsQueuePulseNonce((n) => n + 1);
        try { window.dispatchEvent(new CustomEvent('helix:opsQueueChanged')); } catch { /* ignore */ }
      },
    }
  );
  useEffect(() => {
    setRealtimeChannelStatus((s) => (s.opsQueue === opsQueueStatus ? s : { ...s, opsQueue: opsQueueStatus }));
  }, [opsQueueStatus]);

  // R7 B3: Doc workspace stream — refetches pending-actions tile on upload.
  // Migrated to useRealtimeChannel.
  const { status: docWorkspaceStatus } = useRealtimeChannel(
    '/api/doc-workspace/stream',
    {
      event: 'docWorkspace.changed',
      name: 'docWorkspace',
      enabled: !!userInitials && isActive && homeDataReady && isPageVisible,
      debounceMs: 400,
      onChange: () => {
        setDocWorkspacePulseNonce((n) => n + 1);
        void fetchPendingDocActions();
      },
    }
  );
  useEffect(() => {
    setRealtimeChannelStatus((s) => (s.docWorkspace === docWorkspaceStatus ? s : { ...s, docWorkspace: docWorkspaceStatus }));
  }, [docWorkspaceStatus]);

  // R7 B2: Matters stream — bumps tile pulse when a matter is created/updated.
  // Migrated to useRealtimeChannel.
  const { status: mattersStatus } = useRealtimeChannel(
    '/api/matters/stream',
    {
      event: 'matters.changed',
      name: 'matters',
      enabled: !!userInitials && isActive && homeDataReady && isPageVisible,
      onChange: () => {
        setMattersPulseNonce((n) => n + 1);
        try { window.dispatchEvent(new CustomEvent('helix:mattersChanged')); } catch { /* ignore */ }
      },
    }
  );
  useEffect(() => {
    setRealtimeChannelStatus((s) => (s.matters === mattersStatus ? s : { ...s, matters: mattersStatus }));
  }, [mattersStatus]);

  // R7 B4 client wiring: app shell holds the sole enquiries EventSource and
  // dispatches `helix:enquiriesChanged` for any consumer to pulse on. Also
  // serves as the activity-feed pulse (B7).
  useEffect(() => {
    const handler = () => setEnquiriesPulseNonce((n) => n + 1);
    window.addEventListener('helix:enquiriesChanged', handler);
    return () => window.removeEventListener('helix:enquiriesChanged', handler);
  }, []);
  // Mark enquiries channel open if app-shell SSE has dispatched at least one event.
  useEffect(() => {
    if (enquiriesPulseNonce > 0) {
      setRealtimeChannelStatus((s) => (s.enquiries === 'open' ? s : { ...s, enquiries: 'open' }));
    }
  }, [enquiriesPulseNonce]);

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
    } = useRateChangeData(rateChangeYear, currentUserName, showRateChangeModal);

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
    if (enquiries && currentUserEmail) {
      // Use the already-loaded unified enquiries dataset as the primary source
      // for Home enquiry counts so Home and Prospects stay aligned.

      const effectiveEmail = currentUserEmail;
      const isGodMode = isDevOwner(userData?.[0]) && !HOME_FORCE_MINE_LOCAL;

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
      const effectiveInitials = String(userData?.[0]?.Initials || '').toUpperCase().trim();
      const emailLocalPart = effectiveEmail.includes('@') ? effectiveEmail.split('@')[0] : effectiveEmail;
      const matchesUser = (enquiry: any) => {
        if (isGodMode) return true;
        const pocValue = (enquiry.Point_of_Contact || '').toLowerCase().trim();
        if (!pocValue) return false;
        return pocValue === effectiveEmail
          || pocValue === effectiveInitials.toLowerCase()
          || pocValue === emailLocalPart;
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
      const prevFullWeekEnd = new Date(startOfWeek.getTime() - 1);
      const prevFullMonthEnd = new Date(startOfMonth.getTime() - 1);
      const prevFullWeekCount = countUniqueWeeksInRange(prevWeekStart, prevFullWeekEnd);
      const prevFullMonthCount = countUniqueWeeksInRange(prevMonthStart, prevFullMonthEnd);

      const buildBreakdownForRange = (rangeStart: Date, rangeEnd: Date) => {
        const startBoundary = new Date(rangeStart);
        startBoundary.setHours(0, 0, 0, 0);
        const endBoundary = new Date(rangeEnd);
        endBoundary.setHours(23, 59, 59, 999);
        const counts = new Map<string, number>();

        for (const enquiry of normalizedEnquiries) {
          const enquiryDate = parseDateValue(enquiry.Touchpoint_Date);
          if (!enquiryDate) continue;
          if (enquiryDate < startBoundary || enquiryDate > endBoundary) continue;
          if (!matchesUser(enquiry)) continue;

          const areaKey = String(enquiry.Area_of_Work || enquiry.aow || 'Other').trim() || 'Other';
          counts.set(areaKey, (counts.get(areaKey) || 0) + 1);
        }

        return {
          aowTop: [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([key, count]) => ({ key, count })),
        };
      };

      setEnquiriesToday(todayCount);
      setEnquiriesWeekToDate(weekToDateCount);
      setEnquiriesMonthToDate(monthToDateCount);
      setPrevEnquiriesToday(prevTodayCount);
      setPrevEnquiriesWeekToDate(prevWeekCount);
      setPrevEnquiriesMonthToDate(prevMonthCount);
      setPrevEnquiriesWeekFull(prevFullWeekCount);
      setPrevEnquiriesMonthFull(prevFullMonthCount);
      setEnquiryMetricsBreakdown({
        today: buildBreakdownForRange(today, today),
        weekToDate: buildBreakdownForRange(startOfWeek, today),
        monthToDate: buildBreakdownForRange(startOfMonth, today),
      });
      hasSeededEnquiryMetricsRef.current = true;
      setIsLoadingEnquiryMetrics(false);
    }
  }, [enquiries, currentUserEmail, userData, teamData]);

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
    if (!isActive) {
      return;
    }

    // Dev owners still need WIP even in local-data mode
    const devOwnerLocal = useLocalData && isDevOwner(userData?.[0]);

    if (useLocalData && !devOwnerLocal) {
      setHasStartedParallelFetch(true);
      setIsLoadingAttendance(false);
      setIsLoadingAnnualLeave(false);
      setIsLoadingWipClio(false);
      setIsLoadingEnquiryMetrics(false);
      setIsLoadingHomeMatters(false);
      setIsActionsLoading(false);
      return;
    }

    // Wait for user data before fetching
    if (!userData?.[0]) {
      return;
    }

    // Read directly from userData to avoid stale state during user switches
    let email = (userData[0]?.Email || '').toLowerCase().trim();
    let initials = (userData[0]?.Initials || '').toUpperCase().trim();
    let entraId = userData?.[0]?.EntraID || userData?.[0]?.['Entra ID'] || '';
    

    
    // Dedupe: skip if same request already in progress
    const requestKey = `parallel:${email}:${initials}:${entraId}`;

    // SWR hydration: if we have cached data for this key, hand it back to React
    // synchronously before any fetch fires. This keeps matter/enquiry boxes
    // populated when the user returns to Home (or an admin switches users back
    // to a previously seen profile) without waiting for the network.
    const now = Date.now();
    const homeMattersCacheFresh = cachedHomeMattersEntry
      && cachedHomeMattersEntry.key === requestKey
      && now - cachedHomeMattersEntry.ts < HOME_DATA_FRESH_MS;
    const enquiryMetricsCacheFresh = cachedEnquiryMetricsEntry
      && cachedEnquiryMetricsEntry.key === requestKey
      && now - cachedEnquiryMetricsEntry.ts < HOME_DATA_FRESH_MS;

    if (cachedHomeMattersEntry && cachedHomeMattersEntry.key === requestKey) {
      setHomeMatters(cachedHomeMattersEntry.matters as any);
      setIsLoadingHomeMatters(false);
    }
    if (cachedEnquiryMetricsEntry && cachedEnquiryMetricsEntry.key === requestKey) {
      const data = cachedEnquiryMetricsEntry.payload;
      const hasUnifiedFromProps = Array.isArray(enquiries) && enquiries.length > 0 && Boolean(currentUserEmail);
      if (!hasUnifiedFromProps) {
        setEnquiriesToday(data.enquiriesToday ?? 0);
        setEnquiriesWeekToDate(data.enquiriesWeekToDate ?? 0);
        setEnquiriesMonthToDate(data.enquiriesMonthToDate ?? 0);
        setPrevEnquiriesToday(data.prevEnquiriesToday ?? 0);
        setPrevEnquiriesWeekToDate(data.prevEnquiriesWeekToDate ?? 0);
        setPrevEnquiriesMonthToDate(data.prevEnquiriesMonthToDate ?? 0);
      }
      setPitchedEnquiriesToday(data.pitchedToday ?? 0);
      setPitchedEnquiriesWeekToDate(data.pitchedWeekToDate ?? 0);
      setPitchedEnquiriesMonthToDate(data.pitchedMonthToDate ?? 0);
      setPrevPitchedEnquiriesToday(data.prevPitchedToday ?? 0);
      setPrevPitchedEnquiriesWeekToDate(data.prevPitchedWeekToDate ?? 0);
      setPrevPitchedEnquiriesMonthToDate(data.prevPitchedMonthToDate ?? 0);
      setIsLoadingEnquiryMetrics(false);
      hasSeededEnquiryMetricsRef.current = true;
    }

    // If both caches are still fresh for this user, skip the network entirely.
    // The dedupe key below also stops re-runs, but this short-circuits the
    // first run after a remount/user-switch when cache is warm.
    if (homeMattersCacheFresh && enquiryMetricsCacheFresh
        && parallelFetchKeyRef.current === requestKey) {
      setHasStartedParallelFetch(true);
      return;
    }

    if (parallelFetchKeyRef.current === requestKey) {
      setHasStartedParallelFetch(true);
      return;
    }
    parallelFetchKeyRef.current = requestKey;



    const runId = Date.now();
    fetchRunIdRef.current = runId;

    const fetchAllData = async () => {
      setHasStartedParallelFetch(true);
      setIsLoadingAttendance(true);
      setIsLoadingAnnualLeave(true);
      setIsActionsLoading(true);
      setIsLoadingWipClio(true);
      // Only flip the matter/enquiry skeletons on if we don't already have
      // cached/seeded data — prevents the visible flash on tab return.
      if (!homeMattersCacheFresh) {
        setIsLoadingHomeMatters(true);
      }
      setIsLoadingEnquiryMetrics(!hasSeededEnquiryMetricsRef.current && !enquiryMetricsCacheFresh);

      let attendanceDone = false;
      let annualLeaveDone = false;
      const isLatestRun = () => fetchRunIdRef.current === runId;
      const maybeFinishImmediateActions = () => {
        if (isLatestRun() && attendanceDone && annualLeaveDone) {
          setIsActionsLoading(false);
        }
      };

      const attendanceRequest = fetch('/api/attendance/getAttendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
        .then(async (attendanceRes) => {
          if (!isLatestRun() || !attendanceRes.ok) return;
          const data = await attendanceRes.json();
          if (!isLatestRun() || !data.success || !data.attendance) return;
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
            Confirmed_At: member.Confirmed_At ?? null,
            weeks: member.weeks || {},
          }));
          cachedAttendance = { attendance: transformedAttendance, team: data.team || [] };
          setAttendanceRecords(transformedAttendance);
          setAttendanceTeam(data.team || []);
          setAttendanceError(null);
        })
        .catch((error: any) => {
          if (!isLatestRun()) return;
          console.error('[parallel-fetch] Attendance error:', error);
          setAttendanceError(error?.message || 'Failed to load attendance');
        })
        .finally(() => {
          if (!isLatestRun()) return;
          attendanceDone = true;
          setIsLoadingAttendance(false);
          maybeFinishImmediateActions();
        });

      const annualLeaveRequest = fetch('/api/attendance/getAnnualLeave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInitials: initials })
      })
        .then(async (annualLeaveRes) => {
          if (!isLatestRun() || !annualLeaveRes.ok) return;
          const data = await annualLeaveRes.json();
          if (!isLatestRun()) return;
          if (data.annual_leave) {
            const mappedAnnualLeave: AnnualLeaveRecord[] = data.annual_leave.map((rec: any) => {
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
          cachedAnnualLeaveError = null;
          setAnnualLeaveError(null);
        })
        .catch((error: any) => {
          if (!isLatestRun()) return;
          console.error('[parallel-fetch] Annual leave error:', error);
          cachedAnnualLeaveError = error?.message || 'Failed to load annual leave';
          setAnnualLeaveError(cachedAnnualLeaveError);
        })
        .finally(() => {
          if (!isLatestRun()) return;
          annualLeaveDone = true;
          setIsLoadingAnnualLeave(false);
          maybeFinishImmediateActions();
        });

      // Dev-owner god mode: use team aggregate endpoint on boot (no user switch yet → no originalAdminUser)
      const useTeamWip = isDevOwner(userData?.[0]) && !originalAdminUser && !HOME_FORCE_MINE_LOCAL;
      const wipFetchUrl = useTeamWip
        ? '/api/home-wip/team'
        : entraId ? `/api/home-wip?entraId=${encodeURIComponent(entraId)}` : null;

      const wipRequest = (wipFetchUrl
        ? fetch(wipFetchUrl, {
            credentials: 'include',
            headers: { Accept: 'application/json' }
          })
        : Promise.resolve(null))
        .then(async (wipRes) => {
          if (!isLatestRun() || !wipRes || !wipRes.ok) return;
          const data = await wipRes.json();
          if (!isLatestRun()) return;
          if (data && typeof data === 'object' && 'error' in data && (data as any).error) {
            setWipClioError(String((data as any).error));
            return;
          }

          const daily = (data as any)?.current_week?.daily_data || {};
          const hasHours = Object.values(daily).some((d: any) => (Number(d?.total_hours) || 0) > 0);
          const hasAmount = Object.values(daily).some((d: any) => (Number(d?.total_amount) || 0) > 0);
          const dailyKeys = Object.keys(daily);

          if (!hasHours && !hasAmount && dailyKeys.length > 0) {
            if (!zeroWipFallbackRef.current) {
              zeroWipFallbackRef.current = true;
              handleRefreshTimeMetrics?.();
            }
            return;
          }

          if (dailyKeys.length === 0) {
            console.error('[parallel-fetch] WIP endpoint returned no daily_data structure - possible API issue');
            setWipClioError('No time data available');
            return;
          }

          cachedWipClio = data as any;
          setWipClioData(cachedWipClio);
          setWipClioError(null);
        })
        .catch((error: any) => {
          if (!isLatestRun()) return;
          console.error('[parallel-fetch] WIP error:', error);
          setWipClioError(error?.message || 'Failed to load WIP');
        })
        .finally(() => {
          if (!isLatestRun()) return;
          setIsLoadingWipClio(false);
        });

      const hasUnifiedEnquiryDataset = Array.isArray(enquiries) && enquiries.length > 0 && Boolean(currentUserEmail);
      const runEnquiryMetricsFetch = () => ((email || initials)
        ? fetch('/api/home-enquiries?' + (email ? 'email=' + encodeURIComponent(email) : '') + '&' + (initials ? 'initials=' + encodeURIComponent(initials) : ''), {
            headers: { Accept: 'application/json' }
          })
        : Promise.resolve(null))
        .then(async (enquiriesRes) => {
          if (!isLatestRun() || !enquiriesRes || !enquiriesRes.ok) return;
          const data = await enquiriesRes.json();
          if (!isLatestRun()) return;
          hasSeededEnquiryMetricsRef.current = true;
          cachedEnquiryMetricsEntry = { key: requestKey, payload: data, ts: Date.now() };
          if (!hasUnifiedEnquiryDataset) {
            setEnquiriesToday(data.enquiriesToday ?? 0);
            setEnquiriesWeekToDate(data.enquiriesWeekToDate ?? 0);
            setEnquiriesMonthToDate(data.enquiriesMonthToDate ?? 0);
            setPrevEnquiriesToday(data.prevEnquiriesToday ?? 0);
            setPrevEnquiriesWeekToDate(data.prevEnquiriesWeekToDate ?? 0);
            setPrevEnquiriesMonthToDate(data.prevEnquiriesMonthToDate ?? 0);
            setPrevEnquiriesWeekFull(data.prevEnquiriesWeekFull ?? data.prevEnquiriesWeekToDate ?? 0);
            setPrevEnquiriesMonthFull(data.prevEnquiriesMonthFull ?? data.prevEnquiriesMonthToDate ?? 0);
            setEnquiryMetricsBreakdown((data as any)?.breakdown ?? null);
          }
          setPitchedEnquiriesToday(data.pitchedToday ?? 0);
          setPitchedEnquiriesWeekToDate(data.pitchedWeekToDate ?? 0);
          setPitchedEnquiriesMonthToDate(data.pitchedMonthToDate ?? 0);
          setPrevPitchedEnquiriesToday(data.prevPitchedToday ?? 0);
          setPrevPitchedEnquiriesWeekToDate(data.prevPitchedWeekToDate ?? 0);
          setPrevPitchedEnquiriesMonthToDate(data.prevPitchedMonthToDate ?? 0);
        })
        .catch((error: any) => {
          if (!isLatestRun()) return;
          console.error('[parallel-fetch] Enquiry metrics error:', error);
        })
        .finally(() => {
          if (!isLatestRun()) return;
          setIsLoadingEnquiryMetrics(false);
        });

      let enquiriesRequest = Promise.resolve();
      if (hasUnifiedEnquiryDataset) {
        setIsLoadingEnquiryMetrics(false);
        globalThis.setTimeout(() => {
          if (!isLatestRun()) return;
          void runEnquiryMetricsFetch();
        }, 250);
      } else {
        enquiriesRequest = runEnquiryMetricsFetch();
      }

      // Matters: fetch recent new-space matters directly for the Home dashboard.
      // Dev owner gets all (no name filter); others scope to their name.
      const fullName = userData[0]?.FullName || '';
      const isOwner = isDevOwner(userData[0]) && !HOME_FORCE_MINE_LOCAL;
      const mattersQueryName = isOwner ? '' : fullName;
      const mattersUrl = `/api/matters-new-space?limit=50${mattersQueryName ? `&fullName=${encodeURIComponent(mattersQueryName)}` : ''}`;
      const mattersRequest = fetch(mattersUrl, { headers: { Accept: 'application/json' } })
        .then(async (mattersRes) => {
          if (!isLatestRun() || !mattersRes.ok) return;
          const data = await mattersRes.json();
          if (!isLatestRun()) return;
          const newSpaceMatters = Array.isArray(data.matters) ? data.matters : [];
          const normalized = newSpaceMatters.map((matter: any) =>
            normalizeMatterData(matter, fullName, 'vnet_direct')
          );
          cachedHomeMattersEntry = { key: requestKey, matters: normalized, ts: Date.now() };
          setHomeMatters(normalized);
        })
        .catch((error: any) => {
          if (!isLatestRun()) return;
          console.error('[parallel-fetch] Matters error:', error);
        })
        .finally(() => {
          if (!isLatestRun()) return;
          setIsLoadingHomeMatters(false);
        });

      await Promise.allSettled([
        attendanceRequest,
        annualLeaveRequest,
        wipRequest,
        enquiriesRequest,
        mattersRequest,
      ]);

      if (isLatestRun()) {
        maybeFinishImmediateActions();
      }
    };

    fetchAllData();

    return () => {
      // Only reset on unmount (user switches) — NOT on dep-change re-fires,
      // which would defeat the parallelFetchKeyRef dedup.
    };
  }, [isActive, userData?.[0]?.EntraID, userData?.[0]?.['Entra ID'], userData?.[0]?.Email, useLocalData, teamData]);

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

      Promise.all([
        import('../../localData/localAttendance.json'),
        import('../../localData/localAnnualLeave.json'),
      ]).then(([{ default: localAttendance }, { default: localAnnualLeave }]) => {
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
      });
      return;
    }
    // Parallel fetch effect now handles all live data fetching.
    // Legacy duplicate fetch removed — parallel effect at L2615 is the single source.
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
        setRecoveredHours(cachedRecoveredHours ?? 0);
        setPrevRecoveredHours(cachedPrevRecoveredHours ?? 0);
      }
      return;
    }

    if (useLocalData) {
      // Dev owners get WIP from the parallel fetch team endpoint, not local JSON
      if (isDevOwner(userData?.[0])) {
        debugLog('🔑 Dev owner local — WIP handled by parallel fetch team endpoint');
        return;
      }
      debugLog('📂 Using local WIP data');
      import('../../localData/localWipClio.json').then(({ default: localWipClio }) => {
        cachedWipClio = localWipClio as any;
        setWipClioData(cachedWipClio);
        setIsLoadingWipClio(false);
      }).catch(() => {
        debugLog('⚠️ localWipClio.json not found — WIP data unavailable in local mode');
        setIsLoadingWipClio(false);
      });
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
  }, [wipClioData, isLoadingWipClio, wipClioError]);

  // Home fetches recent new-space matters directly via parallel fetch (limit=50).
  // Falls back to app-provided matters if home fetch hasn't completed yet.
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
      import('../../localData/localMatters.json').then(({ default: localMatters }) => {
        const mappedMatters: Matter[] = (localMatters as any) as Matter[];
        cachedAllMatters = mappedMatters;
        setAllMatters(mappedMatters);
        if (onAllMattersFetched) onAllMattersFetched(mappedMatters);
        setIsLoadingAllMatters(false);
      });
      return;
    }
    setIsLoadingAllMatters(false);
  }, [userData?.[0]?.FullName, useLocalData]);

  // Future bookings: Stream handles this now (removed duplicate fetch)

  // Stream Home metrics progressively; update state as each arrives
  // Transactions removed — Home doesn't render raw transactions (only in useLocalData dev mode).
  // Fees Recovered uses /api/reporting/management-datasets instead.
  useHomeMetricsStream({
    autoStart: !demoModeEnabled && isActive && homeDataReady,
    metrics: ['futureBookings', 'outstandingBalances'],
    bypassCache: false,
    onMetric: (name, data) => {
      switch (name) {
        case 'futureBookings':
          setFutureBookings(data as any);
          try { safeSetItem('futureBookingsSnapshot', JSON.stringify(data)); } catch { /* ignore */ }
          onBoardroomBookingsFetched?.((data as any).boardroomBookings || []);
          onSoundproofBookingsFetched?.((data as any).soundproofBookings || []);
          break;
        case 'outstandingBalances':
          cachedOutstandingBalances = data as any;
          safeSetItem('outstandingBalancesData', JSON.stringify(data));
          streamOutstandingReceivedRef.current = true;
          setOutstandingBalancesData(data as any);
          onOutstandingBalancesFetched?.(data as any);
          console.log('[OutstandingBalances] Stream delivered firm-wide data:', (data as any)?.data?.length ?? 0, 'records');
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
      import('../../localData/localTransactions.json').then(({ default: localTransactions }) => {
        const data: Transaction[] = (localTransactions as any) as Transaction[];
        cachedTransactions = data;
        setTransactions(data);
        onTransactionsFetched?.(data);
      });
    }
  }, [useLocalData]);
  

  // Outstanding Balances: stream is the primary source (firm-wide data).
  // This useEffect only handles local-data/demo modes and acts as a fallback
  // if the stream hasn't delivered data within a short window.
  useEffect(() => {
    if (demoModeEnabled || useLocalData) {
      if (useLocalData) {
        import('../../localData/localOutstandingBalances.json').then(({ default: localOutstandingBalances }) => {
          const data = localOutstandingBalances as any;
          cachedOutstandingBalances = data;
          onOutstandingBalancesFetched?.(data);
          setOutstandingBalancesData(data);
        });
      }
      return;
    }

    // The SSE stream handles firm-wide outstanding balances.
    // Previously, a competing fetch to /api/outstanding-balances/user/:entraId
    // would race with the stream and overwrite richer firm-wide data with a
    // smaller user-only dataset (or empty when the Clio lookup failed),
    // causing the metric card to show £0. The stream + client-side filtering
    // via myOutstandingBalances already handles user-specific totals correctly.
    // No additional fetch is needed.
  }, [useLocalData, demoModeEnabled]);

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
  
  return result;
}, [attendanceRecords, transformedTeamData]);

const handleAttendanceUpdated = (updatedRecords: AttendanceRecord[]) => {
  if (updatedRecords.length === 0) return;
  
  // Helper to normalize date strings for comparison (extract YYYY-MM-DD)
  const normalizeDate = (dateStr: string): string => {
    if (!dateStr) return '';
    // Handle both '2025-12-15' and '2025-12-15T00:00:00.000Z' formats
    return dateStr.substring(0, 10);
  };
  
  setAttendanceRecords((prevRecords) => {
    const newRecords = [...prevRecords];
    let isChanged = false;

    updatedRecords.forEach((updated) => {
      const updatedWeekStart = normalizeDate(updated.Week_Start);
      
      // Find by Initials and Week_Start (normalized) - the actual record structure
      const index = newRecords.findIndex(
        (rec: any) => rec.Initials === updated.Initials && normalizeDate(rec.Week_Start) === updatedWeekStart
      );
      
      if (index !== -1) {
        // Update existing record
        const currentRecord = newRecords[index];
        if (currentRecord.Attendance_Days !== updated.Attendance_Days || 
            currentRecord.Confirmed_At !== updated.Confirmed_At) {
          newRecords[index] = {
            ...currentRecord,
            ...updated,
            // Preserve the original date format from the existing record
            Week_Start: currentRecord.Week_Start,
          };
          isChanged = true;
        } else {
        }
      } else {
        // Add new record - normalize the Week_Start to date-only format
        newRecords.push({
          ...updated,
          Week_Start: updatedWeekStart,
        });
        isChanged = true;
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

  // Capture previous value for rollback before optimistic update
  const prevRecord = attendanceRecords.find(
    (r: any) => r.Initials === initials && (r.Week_Start || '').substring(0, 10) === weekStart.substring(0, 10)
  );
  const prevDays = prevRecord?.Attendance_Days ?? '';

  // Build optimistic record and apply immediately (instant UI)
  const optimisticRecord: AttendanceRecord = {
    Attendance_ID: prevRecord?.Attendance_ID ?? 0,
    Entry_ID: prevRecord?.Entry_ID ?? 0,
    First_Name: firstName,
    Initials: initials,
    Level: (attendanceTeam.find((t: any) => t.Initials === initials)?.Level) || '',
    Week_Start: weekStart,
    Week_End: new Date(new Date(weekStart).setDate(new Date(weekStart).getDate() + 6)).toISOString().split('T')[0],
    ISO_Week: getISOWeek(new Date(weekStart)),
    Attendance_Days: attendanceDays,
    Confirmed_At: new Date().toISOString(),
  };
  handleAttendanceUpdated([optimisticRecord]);

  try {
    const url = `/api/attendance/updateAttendance`;
    const payload = { initials, weekStart, attendanceDays };
  debugLog('API call:', url, payload);
    // Dev proxy can be slow when many SSE streams are occupying the HTTP/1
    // connection pool, so we give the save 20s before aborting. Without this
    // the fetch could hang indefinitely and trap the user in the modal.
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
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
    // Reconcile with server response (updates IDs, timestamps)
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
  } catch (err) {
    console.error('Error saving attendance (home):', err);
    // Rollback optimistic update
    const rollback: AttendanceRecord = {
      Attendance_ID: prevRecord?.Attendance_ID ?? 0, Entry_ID: prevRecord?.Entry_ID ?? 0,
      First_Name: firstName, Initials: initials,
      Level: (attendanceTeam.find((t: any) => t.Initials === initials)?.Level) || '',
      Week_Start: weekStart,
      Week_End: new Date(new Date(weekStart).setDate(new Date(weekStart).getDate() + 6)).toISOString().split('T')[0],
      ISO_Week: getISOWeek(new Date(weekStart)),
      Attendance_Days: prevDays,
      Confirmed_At: prevRecord?.Confirmed_At ?? null,
    };
    handleAttendanceUpdated([rollback]);
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

  const openHomeCclReview = useCallback((matterId?: string) => {
    setHomeCclReviewRequest({
      requestedAt: Date.now(),
      matterId,
      openInspector: true,
      autoRunAi: false,
    });
    window.setTimeout(() => setHomeCclReviewRequest(null), 1400);
    try {
      window.dispatchEvent(new CustomEvent('openHomeCclReview', {
        detail: { matterId, openInspector: true },
      }));
    } catch (error) {
      console.error('Failed to dispatch CCL expand event:', error);
    }
  }, []);


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
    if (normalized.includes(',')) {
      const [last, first] = normalized.split(',').map((part) => part.trim());
      if (first && last) normalized = `${first} ${last}`;
    }
    normalized = normalized.replace(/\./g, '');
    normalized = normalized.replace(/\s*\([^)]*\)\s*/g, ' ');
    normalized = normalized.replace(/\s[-/|].*$/, '');
    normalized = normalized.replace(/\s+/g, ' ').trim();
    if (normalized === "bianca odonnell") {
      normalized = "bianca o'donnell";
    }
    if (normalized === "samuel packwood") {
      normalized = "sam packwood";
    }
    return normalized;
  };

  const namesMatchForOutstanding = (a: string | null | undefined, b: string | null | undefined): boolean => {
    const n1 = normalizeName(a);
    const n2 = normalizeName(b);
    if (!n1 || !n2) return false;
    if (n1 === n2) return true;

    const initialsFrom = (value: string) =>
      value
        .split(/\s+/)
        .filter(Boolean)
        .map(part => part[0] || '')
        .join('');

    const compact1 = n1.replace(/\s+/g, '');
    const compact2 = n2.replace(/\s+/g, '');
    const initials1 = initialsFrom(n1);
    const initials2 = initialsFrom(n2);
    if (compact1.length <= 3 && compact1 === initials2) return true;
    if (compact2.length <= 3 && compact2 === initials1) return true;

    const nameVariations: Record<string, string[]> = {
      alexander: ['alex'],
      alex: ['alexander'],
      samuel: ['sam'],
      sam: ['samuel'],
      lukasz: ['luke', 'lucas'],
      luke: ['lukasz', 'lucas'],
      lucas: ['luke', 'lukasz'],
      robert: ['rob', 'bob'],
      rob: ['robert'],
      bob: ['robert'],
    };

    const p1 = n1.split(' ').filter(Boolean);
    const p2 = n2.split(' ').filter(Boolean);
    const first1 = p1[0] || '';
    const first2 = p2[0] || '';
    const last1 = p1[p1.length - 1] || '';
    const last2 = p2[p2.length - 1] || '';

    if (first1 && first2) {
      if (first1 === first2) {
        if (!last1 || !last2 || last1 === last2) return true;
      }
      const vars1 = nameVariations[first1] || [];
      const vars2 = nameVariations[first2] || [];
      if (vars1.includes(first2) || vars2.includes(first1)) {
        if (!last1 || !last2 || last1 === last2) return true;
      }
    }

    return false;
  };
  
  const { name: metricsName, clioId: metricsClioId } = getMetricsAlias(
    userData?.[0]?.["Full Name"],
    userData?.[0]?.Initials,
    userData?.[0]?.["Clio ID"]
  );

  // IMPORTANT: For outstanding balances, use the actual current user's name
  // (metricsName is an alias used for time/fees metrics demos and can skew ownership).
  let userResponsibleName = (userData?.[0]?.FullName || userData?.[0]?.["Full Name"] || '').trim() || metricsName;
  
  const userMatterIDs = useMemo(() => {
    if (!normalizedMatters || normalizedMatters.length === 0) return [];
    return normalizedMatters
      .filter((matter) =>
        namesMatchForOutstanding(matter.responsibleSolicitor, userResponsibleName)
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
        return null; // Data not ready yet — will show as loading/skeleton
      }
      // Dev owner god mode: show firm-wide total directly
      const isFirmWide = isDevOwner(userData?.[0]) && !originalAdminUser && !HOME_FORCE_MINE_LOCAL;
      if (isFirmWide) {
        return outstandingBalancesData.data.reduce(
          (sum: number, record: any) => sum + (Number(record.total_outstanding_balance) || 0),
          0
        );
      }
      // If matters haven't loaded yet, return null (not 0) so the card
      // shows a loading state rather than a misleading £0.
      if (userMatterIDs.length === 0) return null;
      const total = myOutstandingBalances.reduce(
        (sum: number, record: any) => sum + (Number(record.total_outstanding_balance) || 0),
        0
      );
      return total;
    }, [outstandingBalancesData, userMatterIDs, myOutstandingBalances, userData, originalAdminUser]);

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
        return namesMatchForOutstanding(m.responsibleSolicitor, userResponsibleName);
      }).length;
    }, [normalizedMatters, currentMonth, currentYear, userResponsibleName]);

    const firmMattersOpenedCount = useMemo(() => {
      if (!normalizedMatters) return 0;
      return normalizedMatters.filter((m) => {
        const openDate = parseOpenDate((m as any).openDate);
        if (!openDate) return false;
        return openDate.getMonth() === currentMonth && openDate.getFullYear() === currentYear;
      }).length;
    }, [normalizedMatters, currentMonth, currentYear]);

    const mattersResolvedForConversion = Array.isArray(providedMatters) || allMatters !== null || !!allMattersError;

    const liveConversionComparison = useMemo<ConversionComparisonPayload | null>(() => {
      if (!Array.isArray(deferredEnquiries) || deferredEnquiries.length === 0) return null;
      if (!mattersResolvedForConversion) return null;

      let effectiveEmail = String(userData?.[0]?.Email || currentUserEmail || '').toLowerCase().trim();
      let effectiveInitials = String(userData?.[0]?.Initials || '').toUpperCase().trim();
      const godMode = isDevOwner(userData?.[0]) && !HOME_FORCE_MINE_LOCAL;

      if (!effectiveEmail && !effectiveInitials) return null;

      const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
      const addDays = (date: Date, days: number) => {
        const next = new Date(date);
        next.setDate(next.getDate() + days);
        return next;
      };

      const now = new Date();
      const today = startOfDay(now);
      const dayOfWeek = today.getDay(); // 0=Sun, 6=Sat
      // Skip weekends: on Mon compare vs Fri; on Sat/Sun show Fri vs Thu
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const lastWorkingDay = startOfDay(
        dayOfWeek === 1 ? addDays(today, -3) // Monday → Friday
        : dayOfWeek === 0 ? addDays(today, -2) // Sunday → Friday
        : dayOfWeek === 6 ? addDays(today, -1) // Saturday → Friday
        : addDays(today, -1) // Tue-Fri → previous calendar day
      );
      const prevWorkingDay = startOfDay(
        lastWorkingDay.getDay() === 1 ? addDays(lastWorkingDay, -3) // Mon → Fri
        : addDays(lastWorkingDay, -1) // otherwise → previous calendar day
      );
      // Effective "current" and "previous" days for the Today card
      const todayEffective = isWeekend ? lastWorkingDay : today;
      const comparisonDay = isWeekend ? prevWorkingDay : lastWorkingDay;
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayCardLabel = isWeekend ? dayNames[todayEffective.getDay()] : 'Today';
      const comparisonDayLabel = isWeekend || dayOfWeek === 1 ? dayNames[comparisonDay.getDay()] : 'Yesterday';
      const todayWeekIndex = (today.getDay() + 6) % 7;
      const startOfWeek = addDays(today, -todayWeekIndex);
      const prevWeekStart = addDays(startOfWeek, -7);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const currentQuarterMonth = Math.floor(today.getMonth() / 3) * 3;
      const startOfQuarter = new Date(today.getFullYear(), currentQuarterMonth, 1);
      const prevQuarterStart = new Date(today.getFullYear(), currentQuarterMonth - 3, 1);

      const normalizedEnquiries = deferredEnquiries.map((enquiry: any) => ({
        ...enquiry,
        ID: enquiry.ID || enquiry.id?.toString(),
        Touchpoint_Date: enquiry.Touchpoint_Date || enquiry.datetime || enquiry.Date_Created,
        Point_of_Contact: enquiry.Point_of_Contact || enquiry.poc,
        First_Name: enquiry.First_Name || enquiry.first,
        Last_Name: enquiry.Last_Name || enquiry.last,
        Email: enquiry.Email || enquiry.email,
      }));

      const emailLocalPart = effectiveEmail.includes('@') ? effectiveEmail.split('@')[0] : effectiveEmail;
      const matchesUser = (enquiry: any) => {
        if (godMode) return true;
        const poc = String(enquiry.Point_of_Contact || '').toLowerCase().trim();
        if (!poc) return false;
        return poc === effectiveEmail || poc === effectiveInitials.toLowerCase() || poc === emailLocalPart;
      };

      const userEnquiries = normalizedEnquiries
        .map((enquiry: any) => {
          const parsedDate = parseDateValue(enquiry.Touchpoint_Date);
          if (!parsedDate || !matchesUser(enquiry)) return null;
          const firstName = String(enquiry.First_Name || '').trim();
          const lastName = String(enquiry.Last_Name || '').trim();
          const fullName = `${firstName} ${lastName}`.trim() || String(enquiry.Email || '').trim() || '—';
          return {
            id: String(enquiry.ID || '').trim(),
            date: parsedDate,
            dayKey: parsedDate.toISOString().slice(0, 10),
            weekKey: formatWeekFragment(parsedDate),
            hourKey: formatHourFragment(parsedDate),
            name: fullName,
            firstName,
            lastName,
            poc: String(enquiry.Point_of_Contact || '').trim(),
            aow: String(enquiry.Area_of_Work || enquiry.aow || 'Other').trim() || 'Other',
          };
        })
        .filter(Boolean) as Array<{ id: string; date: Date; dayKey: string; weekKey: string; hourKey: string; name: string; firstName: string; lastName: string; poc: string; aow: string }>;

      const userMatters = (normalizedMatters || []).filter((matter) => godMode || namesMatchForOutstanding(matter.responsibleSolicitor, userResponsibleName));

      const countEnquiriesInRange = (rangeStart: Date, rangeEnd: Date, granularity: 'day' | 'week' | 'hour') => {
        const startBoundary = granularity === 'hour' ? rangeStart : startOfDay(rangeStart);
        const endBoundary = granularity === 'hour' ? rangeEnd : endOfDay(rangeEnd);
        const seen = new Set<string>();
        let total = 0;

        for (const enquiry of userEnquiries) {
          if (enquiry.date < startBoundary || enquiry.date > endBoundary) continue;
          const suffix = granularity === 'week'
            ? enquiry.weekKey
            : granularity === 'hour'
              ? enquiry.hourKey
              : enquiry.dayKey;
          const base = enquiry.id || `${enquiry.name}|${enquiry.poc}`;
          const key = `${base}|${suffix}`;
          if (seen.has(key)) continue;
          seen.add(key);
          total += 1;
        }

        return total;
      };

      const countMattersInRange = (rangeStart: Date, rangeEnd: Date, granularity: 'day' | 'hour' = 'day') => {
        const startBoundary = granularity === 'hour' ? rangeStart : startOfDay(rangeStart);
        const endBoundary = granularity === 'hour' ? rangeEnd : endOfDay(rangeEnd);
        return userMatters.filter((matter) => {
          const openDate = parseOpenDate((matter as any).openDate);
          return openDate && openDate >= startBoundary && openDate <= endBoundary;
        }).length;
      };

      const countAowMixInRange = (rangeStart: Date, rangeEnd: Date, granularity: 'day' | 'week') => {
        const startBoundary = startOfDay(rangeStart);
        const endBoundary = endOfDay(rangeEnd);
        const seen = new Set<string>();
        const counts = new Map<string, number>();

        for (const enquiry of userEnquiries) {
          if (enquiry.date < startBoundary || enquiry.date > endBoundary) continue;
          const suffix = granularity === 'week' ? enquiry.weekKey : enquiry.dayKey;
          const base = enquiry.id || `${enquiry.name}|${enquiry.poc}`;
          const key = `${base}|${suffix}`;
          if (seen.has(key)) continue;
          seen.add(key);
          counts.set(enquiry.aow, (counts.get(enquiry.aow) || 0) + 1);
        }

        return [...counts.entries()]
          .map(([key, count]) => ({ key, count }))
          .sort((a, b) => b.count - a.count);
      };

      const mergeAowMixes = (items: Array<Array<{ key: string; count: number }>>) => {
        const counts = new Map<string, number>();
        items.forEach((list) => {
          list.forEach((item) => {
            counts.set(item.key, (counts.get(item.key) || 0) + Number(item.count || 0));
          });
        });
        return [...counts.entries()]
          .map(([key, count]) => ({ key, count }))
          .sort((a, b) => b.count - a.count);
      };

      // ── Phase C: prospect chip baskets ──
      // Privacy: redact full name to "F. Lastname" (first initial + last name).
      const redactName = (first: string, last: string, fallback: string) => {
        const f = first.trim();
        const l = last.trim();
        if (f && l) return `${f.charAt(0).toUpperCase()}. ${l}`;
        if (l) return l;
        if (f) return f;
        return fallback || '—';
      };
      // Derive tiny fee-earner initials badge from poc (email, initials, or
      // free text). Keeps to 2 chars for chip density.
      const derivePocInitials = (poc: string): string | undefined => {
        const raw = String(poc || '').trim();
        if (!raw) return undefined;
        if (raw.includes('@')) {
          const local = raw.split('@')[0].replace(/[^a-zA-Z]/g, '');
          if (!local) return undefined;
          return local.slice(0, 2).toUpperCase();
        }
        if (raw.length <= 3) return raw.toUpperCase();
        const parts = raw.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return raw.slice(0, 2).toUpperCase();
      };

      const collectEnquiryProspectsInRange = (
        rangeStart: Date,
        rangeEnd: Date,
        cap = 20,
      ): ConversionComparisonProspect[] => {
        const startBoundary = startOfDay(rangeStart);
        const endBoundary = endOfDay(rangeEnd);
        const seenId = new Set<string>();
        const matched = userEnquiries
          .filter((enquiry) => enquiry.date >= startBoundary && enquiry.date <= endBoundary)
          .sort((a, b) => b.date.getTime() - a.date.getTime());
        const out: ConversionComparisonProspect[] = [];
        for (const enq of matched) {
          const dedupeKey = enq.id || `${enq.firstName}|${enq.lastName}|${enq.aow}`;
          if (seenId.has(dedupeKey)) continue;
          seenId.add(dedupeKey);
          const fullName = [enq.firstName, enq.lastName].filter(Boolean).join(' ').trim() || String(enq.name || '').trim();
          out.push({
            id: dedupeKey,
            displayName: redactName(enq.firstName, enq.lastName, enq.name),
            feeEarnerInitials: derivePocInitials(enq.poc),
            aow: enq.aow,
            matterOpened: false,
            fullName: fullName || undefined,
            occurredAt: enq.date instanceof Date ? enq.date.toISOString() : undefined,
            acid: enq.id || undefined,
          });
          if (out.length >= cap) break;
        }
        return out;
      };

      const collectMatterProspectsInRange = (
        rangeStart: Date,
        rangeEnd: Date,
        cap = 20,
      ): ConversionComparisonProspect[] => {
        const startBoundary = startOfDay(rangeStart);
        const endBoundary = endOfDay(rangeEnd);
        const matched = userMatters
          .map((matter) => ({
            matter,
            openDate: parseOpenDate((matter as any).openDate),
          }))
          .filter((entry) => entry.openDate && entry.openDate >= startBoundary && entry.openDate <= endBoundary)
          .sort((a, b) => (b.openDate?.getTime() || 0) - (a.openDate?.getTime() || 0));
        const out: ConversionComparisonProspect[] = [];
        for (const { matter, openDate } of matched) {
          const raw = String((matter as any).clientName || '').trim();
          if (!raw) continue;
          // Client names may already be "Last, First" or "First Last" — split pragmatically.
          let first = '';
          let last = raw;
          if (raw.includes(',')) {
            const [lastPart, firstPart] = raw.split(',').map((s: string) => s.trim());
            last = lastPart;
            first = firstPart || '';
          } else {
            const parts = raw.split(/\s+/).filter(Boolean);
            if (parts.length >= 2) {
              first = parts[0];
              last = parts.slice(1).join(' ');
            }
          }
          const feKey = String((matter as any).responsibleSolicitor || (matter as any).originatingSolicitor || '').trim();
          const rawDisplayNumber = String((matter as any).displayNumber || '').trim();
          const rawClioId = String((matter as any).matterId || (matter as any).clioMatterId || '').trim();
          const isDemoRow = rawDisplayNumber.toUpperCase().startsWith('HELIX01-')
            || rawDisplayNumber.toUpperCase().startsWith('DEMO-');
          out.push({
            id: String((matter as any).matterId || (matter as any).displayNumber || `${raw}|${out.length}`),
            displayName: redactName(first, last, raw),
            feeEarnerInitials: derivePocInitials(feKey),
            aow: String((matter as any).practiceArea || (matter as any).aow || 'Other') || 'Other',
            matterOpened: true,
            fullName: raw || undefined,
            occurredAt: openDate instanceof Date ? openDate.toISOString() : undefined,
            displayNumber: rawDisplayNumber || undefined,
            clioMatterId: !isDemoRow && rawClioId ? rawClioId : undefined,
          });
          if (out.length >= cap) break;
        }
        return out;
      };

      const collectMatterProspectsAcrossRanges = (
        ranges: Array<{ start: Date; end: Date; isFuture?: boolean }>,
        cap = 20,
      ): ConversionComparisonProspect[] => {
        const seen = new Set<string>();
        const out: ConversionComparisonProspect[] = [];
        for (const range of ranges) {
          if (range.isFuture || range.end < range.start) continue;
          const chunk = collectMatterProspectsInRange(range.start, range.end, cap);
          for (const prospect of chunk) {
            if (seen.has(prospect.id)) continue;
            seen.add(prospect.id);
            out.push(prospect);
            if (out.length >= cap) return out;
          }
        }
        return out;
      };

      const collectEnquiryProspectsAcrossRanges = (
        ranges: Array<{ start: Date; end: Date; isFuture?: boolean }>,
        cap = 20,
      ): ConversionComparisonProspect[] => {
        const seen = new Set<string>();
        const out: ConversionComparisonProspect[] = [];
        for (const range of ranges) {
          if (range.isFuture || range.end < range.start) continue;
          const chunk = collectEnquiryProspectsInRange(range.start, range.end, cap);
          for (const prospect of chunk) {
            if (seen.has(prospect.id)) continue;
            seen.add(prospect.id);
            out.push(prospect);
            if (out.length >= cap) return out;
          }
        }
        return out;
      };

      const pctFromCounts = (matters: number, enquiryCount: number) => enquiryCount > 0
        ? Number(((matters / enquiryCount) * 100).toFixed(1))
        : 0;

      const sumField = <T, K extends keyof T>(items: T[], field: K) =>
        items.reduce((total, item) => total + Number(item[field] ?? 0), 0);

      const markCurrentEndpoint = (buckets: ConversionComparisonBucket[]): ConversionComparisonBucket[] => {
        const lastCurrentIndex = buckets.reduce((lastIndex, bucket, index) => (
          bucket.currentAvailable === false ? lastIndex : index
        ), -1);

        return buckets.map((bucket, index) => ({
          ...bucket,
          isCurrentEndpoint: lastCurrentIndex >= 0 && index === lastCurrentIndex,
        }));
      };

      const workingDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      const buildHourlyBuckets = (currentDayDate: Date, previousDayDate: Date) => (
        Array.from({ length: 11 }, (_, index) => {
          const hour = 8 + index;
          const currentStart = new Date(currentDayDate.getFullYear(), currentDayDate.getMonth(), currentDayDate.getDate(), hour, 0, 0, 0);
          const currentEnd = new Date(currentDayDate.getFullYear(), currentDayDate.getMonth(), currentDayDate.getDate(), hour, 59, 59, 999);
          const previousStart = new Date(previousDayDate.getFullYear(), previousDayDate.getMonth(), previousDayDate.getDate(), hour, 0, 0, 0);
          const previousEnd = new Date(previousDayDate.getFullYear(), previousDayDate.getMonth(), previousDayDate.getDate(), hour, 59, 59, 999);
          const isFuture = currentStart > now;
          const currentRangeEnd = currentEnd > now ? now : currentEnd;
          const axisLabel = hour === 12
            ? '12pm'
            : hour < 12
              ? `${hour}am`
              : `${hour - 12}pm`;

          return {
            label: axisLabel,
            axisLabel,
            currentEnquiries: isFuture ? 0 : countEnquiriesInRange(currentStart, currentRangeEnd, 'hour'),
            previousEnquiries: countEnquiriesInRange(previousStart, previousEnd, 'hour'),
            currentMatters: isFuture ? 0 : countMattersInRange(currentStart, currentRangeEnd, 'hour'),
            previousMatters: countMattersInRange(previousStart, previousEnd, 'hour'),
            isFuture,
            currentAvailable: !isFuture,
          };
        })
      );
      const buildWorkingDayBuckets = (currentStart: Date, previousStart: Date, hideFuture = false) => (
        workingDayLabels.map((label, index) => {
          const currentDate = addDays(currentStart, index);
          const previousDate = addDays(previousStart, index);
          const isFuture = currentDate > today;
          const muteCurrent = hideFuture && isFuture;
          return {
            label,
            axisLabel: label,
            currentEnquiries: muteCurrent ? 0 : countEnquiriesInRange(currentDate, currentDate, 'day'),
            previousEnquiries: muteCurrent ? 0 : countEnquiriesInRange(previousDate, previousDate, 'day'),
            currentMatters: muteCurrent ? 0 : countMattersInRange(currentDate, currentDate),
            previousMatters: muteCurrent ? 0 : countMattersInRange(previousDate, previousDate),
            isFuture,
            currentAvailable: !isFuture,
          };
        })
      );

      // 2026-04-20: Month chart switched from 4 weekly buckets to one bucket
      // per day. Weekly aggregation collapsed a whole month into 4 chunky
      // points which read as "almost nothing happens" on compact charts. A
      // daily series across ~30 dots is dense enough to read as granular
      // progress while still compact on 260–320px viewBoxes. `monthRanges`
      // below mirrors the same day-by-day breakdown so prospect collection
      // stays aligned with the chart.
      const buildMonthBuckets = (currentMonthDate: Date, previousMonthDate: Date) => {
        const currentMonthDays = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 0).getDate();
        const previousMonthDays = new Date(previousMonthDate.getFullYear(), previousMonthDate.getMonth() + 1, 0).getDate();
        return Array.from({ length: currentMonthDays }, (_, index) => {
          const currentDay = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1 + index);
          // Align previous-period day by its day-of-month index, capped at
          // the previous month's length (Feb 28 → Mar 28).
          const prevDayIndex = Math.min(index, previousMonthDays - 1);
          const previousDay = new Date(previousMonthDate.getFullYear(), previousMonthDate.getMonth(), 1 + prevDayIndex);
          const isFuture = currentDay > today;
          const dayNum = index + 1;
          return {
            label: `Day ${dayNum}`,
            // Sparse axis label: first of each week only (chart rarely shows
            // them but keeps data shape consistent with quarter buckets).
            axisLabel: dayNum === 1 || dayNum % 7 === 1 ? String(dayNum) : undefined,
            currentEnquiries: isFuture ? 0 : countEnquiriesInRange(currentDay, currentDay, 'day'),
            previousEnquiries: countEnquiriesInRange(previousDay, previousDay, 'day'),
            currentMatters: isFuture ? 0 : countMattersInRange(currentDay, currentDay),
            previousMatters: countMattersInRange(previousDay, previousDay),
            isFuture,
            currentAvailable: !isFuture,
          };
        });
      };

      const buildQuarterBuckets = (currentQuarterDate: Date, previousQuarterDate: Date) => {
        const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return Array.from({ length: 13 }, (_, index) => {
          const currentStart = addDays(currentQuarterDate, index * 7);
          const currentEnd = addDays(currentStart, 6);
          const previousStart = addDays(previousQuarterDate, index * 7);
          const previousEnd = addDays(previousStart, 6);
          const isFuture = currentStart > today;
          return {
            label: `Week ${index + 1}`,
            axisLabel: index === 0 || currentStart.getDate() <= 7 ? monthLabels[currentStart.getMonth()] : undefined,
            currentEnquiries: isFuture ? 0 : countEnquiriesInRange(currentStart, currentEnd > today ? today : currentEnd, 'week'),
            previousEnquiries: countEnquiriesInRange(previousStart, previousEnd, 'week'),
            currentMatters: isFuture ? 0 : countMattersInRange(currentStart, currentEnd > today ? today : currentEnd),
            previousMatters: countMattersInRange(previousStart, previousEnd),
            isFuture,
            currentAvailable: !isFuture,
          };
        });
      };

  const todayHourlyBuckets = markCurrentEndpoint(buildHourlyBuckets(todayEffective, comparisonDay));
  const fullWeekBuckets = markCurrentEndpoint(buildWorkingDayBuckets(startOfWeek, prevWeekStart, false));
      const sameDaysWeekBuckets = markCurrentEndpoint(buildWorkingDayBuckets(startOfWeek, prevWeekStart, true));
      const monthBuckets = markCurrentEndpoint(buildMonthBuckets(startOfMonth, prevMonthStart));
      const quarterBuckets = markCurrentEndpoint(buildQuarterBuckets(startOfQuarter, prevQuarterStart));
      // 2026-04-20: daily month buckets → one range per day.
      const monthRanges = monthBuckets.map((bucket, index) => {
        const day = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth(), 1 + index);
        return { start: day, end: day > today ? today : day, isFuture: bucket.isFuture };
      });
      const quarterRanges = quarterBuckets.map((bucket, index) => {
        const start = addDays(startOfQuarter, index * 7);
        const rawEnd = addDays(start, 6);
        return { start, end: rawEnd > today ? today : rawEnd, isFuture: bucket.isFuture };
      });

      const todayEnquiries = countEnquiriesInRange(todayEffective, todayEffective, 'day');
      const comparisonEnquiries = countEnquiriesInRange(comparisonDay, comparisonDay, 'day');
      const todayMatters = countMattersInRange(todayEffective, todayEffective);
      const comparisonMatters = countMattersInRange(comparisonDay, comparisonDay);
      const thisWeekEnquiries = sumField(fullWeekBuckets, 'currentEnquiries');
      const lastWeekEnquiries = sumField(fullWeekBuckets, 'previousEnquiries');
      const thisWeekMatters = sumField(fullWeekBuckets, 'currentMatters');
      const lastWeekMatters = sumField(fullWeekBuckets, 'previousMatters');
      const weekPaceEnquiries = sumField(sameDaysWeekBuckets, 'currentEnquiries');
      const lastWeekSameDaysEnquiries = sumField(sameDaysWeekBuckets, 'previousEnquiries');
      const weekPaceMatters = sumField(sameDaysWeekBuckets, 'currentMatters');
      const lastWeekSameDaysMatters = sumField(sameDaysWeekBuckets, 'previousMatters');
      const thisMonthEnquiries = sumField(monthBuckets, 'currentEnquiries');
      const lastMonthEnquiries = sumField(monthBuckets, 'previousEnquiries');
      const thisMonthMatters = sumField(monthBuckets, 'currentMatters');
      const lastMonthMatters = sumField(monthBuckets, 'previousMatters');
      const thisQuarterEnquiries = sumField(quarterBuckets, 'currentEnquiries');
      const lastQuarterEnquiries = sumField(quarterBuckets, 'previousEnquiries');
      const thisQuarterMatters = sumField(quarterBuckets, 'currentMatters');
      const lastQuarterMatters = sumField(quarterBuckets, 'previousMatters');
      const todayAowMix = countAowMixInRange(todayEffective, todayEffective, 'day');
      const thisWeekAowMix = countAowMixInRange(startOfWeek, today, 'week');
      const thisMonthAowMix = mergeAowMixes(monthRanges.map((range) => {
        if (range.isFuture || range.end < range.start) return [];
        return countAowMixInRange(range.start, range.end, 'week');
      }));
      const thisQuarterAowMix = mergeAowMixes(quarterRanges.map((range) => {
        if (range.isFuture || range.end < range.start) return [];
        return countAowMixInRange(range.start, range.end, 'week');
      }));

      // Phase C: per-section prospect lists (redacted, capped).
      const todayEnquiryProspects = collectEnquiryProspectsInRange(todayEffective, todayEffective);
      const todayMatterProspects = collectMatterProspectsInRange(todayEffective, todayEffective);
      const thisWeekEnquiryProspects = collectEnquiryProspectsInRange(startOfWeek, today);
      const thisWeekMatterProspects = collectMatterProspectsInRange(startOfWeek, today);
      const thisMonthEnquiryProspects = collectEnquiryProspectsAcrossRanges(monthRanges);
      const thisMonthMatterProspects = collectMatterProspectsAcrossRanges(monthRanges);
      const thisQuarterEnquiryProspects = collectEnquiryProspectsAcrossRanges(quarterRanges);
      const thisQuarterMatterProspects = collectMatterProspectsAcrossRanges(quarterRanges);

      return {
        items: [
          {
            key: 'today',
            title: isWeekend ? todayCardLabel : 'Today',
            comparisonLabel: `vs ${comparisonDayLabel.toLowerCase()}`,
            currentLabel: todayCardLabel,
            previousLabel: comparisonDayLabel,
            currentEnquiries: todayEnquiries,
            previousEnquiries: comparisonEnquiries,
            currentMatters: todayMatters,
            previousMatters: comparisonMatters,
            currentPct: pctFromCounts(todayMatters, todayEnquiries),
            previousPct: pctFromCounts(comparisonMatters, comparisonEnquiries),
            chartMode: 'hourly',
            buckets: todayHourlyBuckets,
            currentAowMix: todayAowMix,
            currentEnquiryProspects: todayEnquiryProspects,
            currentMatterProspects: todayMatterProspects,
          },
          {
            key: 'week-vs-last',
            title: 'This week',
            comparisonLabel: 'vs last week',
            currentLabel: 'This week',
            previousLabel: 'Last week',
            currentEnquiries: thisWeekEnquiries,
            previousEnquiries: lastWeekEnquiries,
            currentMatters: thisWeekMatters,
            previousMatters: lastWeekMatters,
            currentPct: pctFromCounts(thisWeekMatters, thisWeekEnquiries),
            previousPct: pctFromCounts(lastWeekMatters, lastWeekEnquiries),
            chartMode: 'working-days',
            buckets: fullWeekBuckets,
            currentAowMix: thisWeekAowMix,
            currentEnquiryProspects: thisWeekEnquiryProspects,
            currentMatterProspects: thisWeekMatterProspects,
          },

          {
            key: 'month-vs-last',
            title: 'This month',
            comparisonLabel: 'vs last month',
            currentLabel: 'This month',
            previousLabel: 'Last month',
            currentEnquiries: thisMonthEnquiries,
            previousEnquiries: lastMonthEnquiries,
            currentMatters: thisMonthMatters,
            previousMatters: lastMonthMatters,
            currentPct: pctFromCounts(thisMonthMatters, thisMonthEnquiries),
            previousPct: pctFromCounts(lastMonthMatters, lastMonthEnquiries),
            chartMode: 'month-weeks',
            buckets: monthBuckets,
            currentAowMix: thisMonthAowMix,
            currentEnquiryProspects: thisMonthEnquiryProspects,
            currentMatterProspects: thisMonthMatterProspects,
          },
          {
            key: 'quarter-vs-last',
            title: 'This quarter',
            comparisonLabel: 'vs same weeks last quarter',
            currentLabel: 'Quarter to date',
            previousLabel: 'Same weeks last quarter',
            currentEnquiries: thisQuarterEnquiries,
            previousEnquiries: lastQuarterEnquiries,
            currentMatters: thisQuarterMatters,
            previousMatters: lastQuarterMatters,
            currentPct: pctFromCounts(thisQuarterMatters, thisQuarterEnquiries),
            previousPct: pctFromCounts(lastQuarterMatters, lastQuarterEnquiries),
            chartMode: 'quarter-weeks',
            buckets: quarterBuckets,
            currentAowMix: thisQuarterAowMix,
            currentEnquiryProspects: thisQuarterEnquiryProspects,
            currentMatterProspects: thisQuarterMatterProspects,
          },
        ],
      };
    }, [currentUserEmail, deferredEnquiries, mattersResolvedForConversion, normalizedMatters, deferredTeamData, userData, userResponsibleName]);

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

    const isFirmWideView = isDevOwner(userData?.[0]) && !originalAdminUser && !HOME_FORCE_MINE_LOCAL;

    return [
      {
        title: isFirmWideView ? 'Firm Time Today' : 'Time Today',
        isTimeMoney: true,
        money: Number(todayTotals.total_amount) || 0,
        hours: Number(todayTotals.total_hours) || 0,
        prevMoney: Number(prevTodayTotals.total_amount) || 0,
        prevHours: Number(prevTodayTotals.total_hours) || 0,
        yesterdayMoney: showYesterdayTotals ? (Number(yesterdayTotals.total_amount) || 0) : 0,
        yesterdayHours: showYesterdayTotals ? (Number(yesterdayTotals.total_hours) || 0) : 0,
        showDial: true,
        dialTarget: isFirmWideView ? undefined : 6,
      },
      {
        title: isFirmWideView ? 'Firm Av. This Week' : 'Av. Time This Week',
        isTimeMoney: true,
        money: avgAmountThisWeek,
        hours: avgHoursThisWeek,
        prevMoney: avgAmountLastWeekToDate,
        prevHours: avgHoursLastWeekToDate,
        showDial: true,
        dialTarget: isFirmWideView ? undefined : 6,
      },
      {
        title: isFirmWideView ? 'Firm Time This Week' : 'Time This Week',
        isTimeMoney: true,
        money: weekToDateAmount,
        hours: totalTimeThisWeek,
        prevMoney: lastWeekToDateAmount,
        prevHours: lastWeekToDateHours,
        showDial: true,
        dialTarget: isFirmWideView ? undefined : adjustedTarget,
      },
      {
        title: isFirmWideView ? 'Firm Collected This Month' : 'Fees Recovered This Month',
        isMoneyOnly: true,
        money: recoveredData ?? 0,
        prevMoney: prevRecoveredData ?? 0,
      },
      {
        title: isFirmWideView ? 'Firm Outstanding' : 'Outstanding Office Balances',
        isMoneyOnly: true,
        money: outstandingTotal ?? 0,
        secondary: isFirmWideView ? undefined : (firmOutstandingTotal ?? 0),
      },
      {
        title: 'Enquiries Today',
        isTimeMoney: false,
        count: enquiriesToday,
        prevCount: prevEnquiriesToday,
        pitchedCount: pitchedEnquiriesToday,
        prevPitchedCount: prevPitchedEnquiriesToday,
      },
      {
        title: 'Enquiries This Week',
        isTimeMoney: false,
        count: enquiriesWeekToDate,
        prevCount: prevEnquiriesWeekFull,
        elapsedPrevCount: prevEnquiriesWeekToDate,
        pitchedCount: pitchedEnquiriesWeekToDate,
        prevPitchedCount: prevPitchedEnquiriesWeekToDate,
      },
      {
        title: 'Enquiries This Month',
        isTimeMoney: false,
        count: enquiriesMonthToDate,
        prevCount: prevEnquiriesMonthFull,
        elapsedPrevCount: prevEnquiriesMonthToDate,
        pitchedCount: pitchedEnquiriesMonthToDate,
        prevPitchedCount: prevPitchedEnquiriesMonthToDate,
      },
      {
        title: isFirmWideView ? 'Firm Matters Opened' : 'Matters Opened',
        isTimeMoney: false,
        count: isFirmWideView ? firmMattersOpenedCount : mattersOpenedCount,
        prevCount: 0,
        secondary: isFirmWideView ? undefined : firmMattersOpenedCount,
      },
    ];
  }, [
    wipClioData,
    recoveredData,
    prevRecoveredData,
    recoveredHours,
    prevRecoveredHours,
    enquiriesToday,
    prevEnquiriesToday,
    enquiriesWeekToDate,
    prevEnquiriesWeekToDate,
    prevEnquiriesWeekFull,
    enquiriesMonthToDate,
    prevEnquiriesMonthToDate,
    prevEnquiriesMonthFull,
    pitchedEnquiriesToday,
    pitchedEnquiriesWeekToDate,
    pitchedEnquiriesMonthToDate,
    prevPitchedEnquiriesToday,
    prevPitchedEnquiriesWeekToDate,
    prevPitchedEnquiriesMonthToDate,
    annualLeaveRecords,
    userData,
    originalAdminUser,
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
  const demoConversionComparison = useMemo<ConversionComparisonPayload>(() => {
    const demoNow = new Date();
    const demoDow = demoNow.getDay();
    const demoIsWeekend = demoDow === 0 || demoDow === 6;
    const demoNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const demoCurrentLabel = demoIsWeekend ? 'Friday' : 'Today';
    const demoPrevLabel = (demoIsWeekend || demoDow === 1)
      ? demoNames[demoDow === 1 ? 5 : 4] // Mon→Fri→Thu; Sat/Sun→Fri→Thu
      : 'Yesterday';
    const demoTitle = demoIsWeekend ? 'Friday' : 'Today';

    // 2026-04-21: synthesise demo prospect chips so the trail in the
    // Conversion panel renders themed AoW bezels (icon + colour + +N
    // overflow button) rather than neutral skeleton dashes. Distribution
    // mirrors `currentAowMix`; matter mix is scaled proportionally so the
    // matters trail also reflects the AoW palette without inheriting the
    // enquiry totals. Names are anonymous demo placeholders; matters get
    // synthetic HLX display numbers but no Clio ids — keeps the demo
    // self-contained and prevents accidental link leaks.
    const DEMO_LASTS = ['Smith','Patel','Khan','Brown','Wilson','Taylor','Davies','Evans','Walker','Robinson','Wright','Hughes','Edwards','Green','Hall','Turner','Cooper','King','Hill','Ward'];
    const DEMO_FE = ['LZ','AC','KW','JW','LA','EA','RC'];
    const expandMixToCount = (mix: ConversionComparisonAowItem[] | undefined, target: number): string[] => {
      const out: string[] = [];
      for (const m of (mix || [])) {
        for (let i = 0; i < (m?.count || 0); i++) out.push(m.key);
      }
      if (out.length > target) out.length = target;
      while (out.length < target) out.push((mix?.[0]?.key) || 'Other');
      return out;
    };
    const scaleMix = (mix: ConversionComparisonAowItem[] | undefined, target: number): ConversionComparisonAowItem[] => {
      const total = (mix || []).reduce((s, m) => s + (m?.count || 0), 0);
      if (!mix || total <= 0 || target <= 0) return [];
      const scaled = mix.map((m) => ({ key: m.key, count: Math.max(0, Math.round((m.count * target) / total)) }));
      let sum = scaled.reduce((s, m) => s + m.count, 0);
      let cursor = 0;
      // Pad up
      while (sum < target && scaled.length > 0) {
        scaled[cursor % scaled.length].count += 1;
        sum += 1;
        cursor += 1;
      }
      // Trim down
      while (sum > target) {
        const idx = scaled.findIndex((m) => m.count > 0);
        if (idx === -1) break;
        scaled[idx].count -= 1;
        sum -= 1;
      }
      return scaled;
    };
    const buildDemoProspects = (
      total: number,
      mix: ConversionComparisonAowItem[] | undefined,
      section: 'enquiries' | 'matters',
      bucketKey: string,
    ): ConversionComparisonProspect[] => {
      if (total <= 0) return [];
      const aows = expandMixToCount(mix, total);
      const seedChar = bucketKey.charCodeAt(0) || 0;
      const offset = seedChar % DEMO_LASTS.length;
      const feOffset = seedChar % DEMO_FE.length;
      return aows.map((aow, i) => {
        const lastIdx = (i + offset) % DEMO_LASTS.length;
        const item: ConversionComparisonProspect = {
          id: `demo-${section}-${bucketKey}-${i}`,
          displayName: DEMO_LASTS[lastIdx],
          feeEarnerInitials: DEMO_FE[(i + feOffset) % DEMO_FE.length],
          aow,
          matterOpened: section === 'matters',
        };
        if (section === 'matters') {
          const num1 = String(10000 + (((i + 1) * 17 + bucketKey.length * 7) % 90000)).padStart(5, '0');
          const num2 = String(10000 + (((i + 1) * 31 + bucketKey.length * 13) % 90000)).padStart(5, '0');
          item.displayNumber = `HLX-${num1}-${num2}`;
        } else {
          // 2026-04-24: demo ACID so the enquiry hover pill has secondary text.
          item.acid = String(20000 + (((i + 1) * 41 + bucketKey.length * 11) % 90000));
        }
        return item;
      });
    };

    const baseItems: ConversionComparisonItem[] = [
      {
        key: 'today',
        title: demoTitle,
        comparisonLabel: `vs ${demoPrevLabel.toLowerCase()}`,
        currentLabel: demoCurrentLabel,
        previousLabel: demoPrevLabel,
        currentEnquiries: 6,
        previousEnquiries: 5,
        currentMatters: 2,
        previousMatters: 1,
        currentPct: 33.3,
        previousPct: 20,
        chartMode: 'hourly',
        buckets: [
          { label: '8am', axisLabel: '8am', currentEnquiries: 0, previousEnquiries: 0, currentMatters: 0, previousMatters: 0 },
          { label: '9am', axisLabel: '9am', currentEnquiries: 1, previousEnquiries: 1, currentMatters: 0, previousMatters: 0 },
          { label: '10am', axisLabel: '10am', currentEnquiries: 0, previousEnquiries: 1, currentMatters: 0, previousMatters: 0 },
          { label: '11am', axisLabel: '11am', currentEnquiries: 1, previousEnquiries: 0, currentMatters: 0, previousMatters: 0 },
          { label: '12pm', axisLabel: '12pm', currentEnquiries: 1, previousEnquiries: 1, currentMatters: 1, previousMatters: 0 },
          { label: '1pm', axisLabel: '1pm', currentEnquiries: 0, previousEnquiries: 0, currentMatters: 0, previousMatters: 0 },
          { label: '2pm', axisLabel: '2pm', currentEnquiries: 1, previousEnquiries: 1, currentMatters: 0, previousMatters: 0 },
          { label: '3pm', axisLabel: '3pm', currentEnquiries: 1, previousEnquiries: 0, currentMatters: 0, previousMatters: 0 },
          { label: '4pm', axisLabel: '4pm', currentEnquiries: 1, previousEnquiries: 1, currentMatters: 1, previousMatters: 1 },
          { label: '5pm', axisLabel: '5pm', currentEnquiries: 0, previousEnquiries: 1, currentMatters: 0, previousMatters: 0 },
          { label: '6pm', axisLabel: '6pm', currentEnquiries: 0, previousEnquiries: 0, currentMatters: 0, previousMatters: 0 },
        ],
        currentAowMix: [
          { key: 'Construction', count: 3 },
          { key: 'Commercial', count: 2 },
          { key: 'Property', count: 1 },
        ],
      },
      {
        key: 'week-vs-last',
        title: 'This week',
        comparisonLabel: 'vs last week',
        currentLabel: 'This week',
        previousLabel: 'Last week',
        currentEnquiries: 18,
        previousEnquiries: 16,
        currentMatters: 5,
        previousMatters: 4,
        currentPct: 27.8,
        previousPct: 25,
        chartMode: 'working-days',
        currentAowMix: [
          { key: 'Construction', count: 8 },
          { key: 'Commercial', count: 5 },
          { key: 'Property', count: 3 },
          { key: 'Employment', count: 2 },
        ],
        buckets: [
          { label: 'Mon', axisLabel: 'Mon', currentEnquiries: 4, previousEnquiries: 3, currentMatters: 1, previousMatters: 1 },
          { label: 'Tue', axisLabel: 'Tue', currentEnquiries: 3, previousEnquiries: 4, currentMatters: 1, previousMatters: 1 },
          { label: 'Wed', axisLabel: 'Wed', currentEnquiries: 5, previousEnquiries: 2, currentMatters: 2, previousMatters: 1 },
          { label: 'Thu', axisLabel: 'Thu', currentEnquiries: 4, previousEnquiries: 3, currentMatters: 1, previousMatters: 1 },
          { label: 'Fri', axisLabel: 'Fri', currentEnquiries: 2, previousEnquiries: 4, currentMatters: 0, previousMatters: 0 },
        ],
      },

      {
        key: 'month-vs-last',
        title: 'This month',
        comparisonLabel: 'vs last month',
        currentLabel: 'This month',
        previousLabel: 'Last month',
        currentEnquiries: 72,
        previousEnquiries: 68,
        currentMatters: 14,
        previousMatters: 12,
        currentPct: 19.4,
        previousPct: 17.6,
        chartMode: 'month-weeks',
        currentAowMix: [
          { key: 'Commercial', count: 24 },
          { key: 'Construction', count: 22 },
          { key: 'Property', count: 18 },
          { key: 'Employment', count: 8 },
        ],
        // 2026-04-20: daily buckets (30) for a granular month shape. Demo
        // rhythm: weekdays trend up 2–4 enquiries, weekends drop to 0–1,
        // previous month runs a touch below. Current series truncated at
        // demoDayOfMonth to keep the ghost-future tail visible.
        buckets: (() => {
          const demoDayOfMonth = Math.min(demoNow.getDate(), 22);
          return Array.from({ length: 30 }, (_, i) => {
            const dayNum = i + 1;
            const isWeekendDemo = (i % 7 === 5) || (i % 7 === 6);
            const cur = i < demoDayOfMonth
              ? (isWeekendDemo ? (i % 3) : 2 + (i % 4))
              : 0;
            const prev = isWeekendDemo ? Math.max(0, (i + 1) % 3 - 1) : 1 + ((i * 3) % 4);
            const curMatters = i < demoDayOfMonth && !isWeekendDemo && (i % 4 === 2) ? 1 : 0;
            const prevMatters = !isWeekendDemo && (i % 5 === 1) ? 1 : 0;
            const isFuture = i >= demoDayOfMonth;
            return {
              label: `Day ${dayNum}`,
              axisLabel: dayNum === 1 || dayNum % 7 === 1 ? String(dayNum) : undefined,
              currentEnquiries: cur,
              previousEnquiries: prev,
              currentMatters: curMatters,
              previousMatters: prevMatters,
              isFuture,
              currentAvailable: !isFuture,
            };
          });
        })(),
      },
      {
        key: 'quarter-vs-last',
        title: 'This quarter',
        comparisonLabel: 'vs same weeks last quarter',
        currentLabel: 'Quarter to date',
        previousLabel: 'Same weeks last quarter',
        currentEnquiries: 186,
        previousEnquiries: 171,
        currentMatters: 34,
        previousMatters: 29,
        currentPct: 18.3,
        previousPct: 17,
        chartMode: 'quarter-weeks',
        currentAowMix: [
          { key: 'Commercial', count: 68 },
          { key: 'Construction', count: 51 },
          { key: 'Property', count: 42 },
          { key: 'Employment', count: 25 },
        ],
        buckets: [
          { label: 'Week 1', axisLabel: 'Jan', currentEnquiries: 13, previousEnquiries: 11, currentMatters: 2, previousMatters: 2 },
          { label: 'Week 2', currentEnquiries: 15, previousEnquiries: 12, currentMatters: 3, previousMatters: 2 },
          { label: 'Week 3', currentEnquiries: 14, previousEnquiries: 13, currentMatters: 2, previousMatters: 2 },
          { label: 'Week 4', currentEnquiries: 16, previousEnquiries: 14, currentMatters: 3, previousMatters: 2 },
          { label: 'Week 5', axisLabel: 'Feb', currentEnquiries: 12, previousEnquiries: 13, currentMatters: 2, previousMatters: 2 },
          { label: 'Week 6', currentEnquiries: 17, previousEnquiries: 14, currentMatters: 3, previousMatters: 2 },
          { label: 'Week 7', currentEnquiries: 15, previousEnquiries: 13, currentMatters: 3, previousMatters: 2 },
          { label: 'Week 8', currentEnquiries: 13, previousEnquiries: 12, currentMatters: 2, previousMatters: 2 },
          { label: 'Week 9', axisLabel: 'Mar', currentEnquiries: 16, previousEnquiries: 14, currentMatters: 3, previousMatters: 3 },
          { label: 'Week 10', currentEnquiries: 17, previousEnquiries: 15, currentMatters: 3, previousMatters: 2 },
          { label: 'Week 11', currentEnquiries: 14, previousEnquiries: 13, currentMatters: 3, previousMatters: 2 },
          { label: 'Week 12', currentEnquiries: 12, previousEnquiries: 14, currentMatters: 2, previousMatters: 2 },
          { label: 'Week 13', axisLabel: 'Apr', currentEnquiries: 12, previousEnquiries: 13, currentMatters: 1, previousMatters: 2 },
        ],
      },
    ];
    return {
      items: baseItems.map((item) => ({
        ...item,
        currentEnquiryProspects: buildDemoProspects(item.currentEnquiries, item.currentAowMix, 'enquiries', item.key),
        currentMatterProspects: buildDemoProspects(
          item.currentMatters,
          scaleMix(item.currentAowMix, item.currentMatters),
          'matters',
          item.key,
        ),
      })),
    };
  }, []);

  const displayTimeMetrics = (demoModeEnabled ? demoTimeMetrics : timeMetrics) as MetricItem[];
  const displayEnquiriesToday = demoModeEnabled ? demoEnquiryMetrics.today : enquiriesToday;
  const displayPrevEnquiriesToday = demoModeEnabled ? demoEnquiryMetrics.prevToday : prevEnquiriesToday;
  const displayEnquiriesWeekToDate = demoModeEnabled ? demoEnquiryMetrics.week : enquiriesWeekToDate;
  const displayPrevEnquiriesWeekToDate = demoModeEnabled ? demoEnquiryMetrics.prevWeek : prevEnquiriesWeekToDate;
  const displayPrevEnquiriesWeekFull = demoModeEnabled ? demoEnquiryMetrics.prevWeek : prevEnquiriesWeekFull;
  const displayEnquiriesMonthToDate = demoModeEnabled ? demoEnquiryMetrics.month : enquiriesMonthToDate;
  const displayPrevEnquiriesMonthToDate = demoModeEnabled ? demoEnquiryMetrics.prevMonth : prevEnquiriesMonthToDate;
  const displayPrevEnquiriesMonthFull = demoModeEnabled ? demoEnquiryMetrics.prevMonth : prevEnquiriesMonthFull;
  const displayPitchedEnquiriesToday = demoModeEnabled ? 0 : pitchedEnquiriesToday;
  const displayPitchedEnquiriesWeekToDate = demoModeEnabled ? 0 : pitchedEnquiriesWeekToDate;
  const displayPitchedEnquiriesMonthToDate = demoModeEnabled ? 0 : pitchedEnquiriesMonthToDate;
  const displayMattersOpenedCount = demoModeEnabled ? demoEnquiryMetrics.mattersOpened : mattersOpenedCount;
  const compatibleSavedConversionComparison = useMemo(
    () => sanitizeSavedConversionComparison(savedConversionComparison),
    [savedConversionComparison],
  );
  const resolvedConversionComparison = demoModeEnabled
    ? demoConversionComparison
    : mattersResolvedForConversion
      ? (liveConversionComparison ?? compatibleSavedConversionComparison)
      : null;
  const showExperimentalConversionComparison = true;
  const isResolvingConversionComparison = showExperimentalConversionComparison
    && !demoModeEnabled
    && !mattersResolvedForConversion;
  const isWaitingForLocalDashboardIdentity = false;
  const isDashboardProcessing = isSwitchingUser || isWaitingForLocalDashboardIdentity;
  const dashboardProcessingLabel = isWaitingForLocalDashboardIdentity ? 'Resolving dashboard identity…' : 'Rebuilding this user view…';
  const dashboardProcessingDetail = isWaitingForLocalDashboardIdentity
    ? 'Waiting for team context so Home can resolve the correct personalised metrics.'
    : 'Refreshing Home metrics, recent enquiries, matters, and unclaimed queue detail.';
  const effectiveDashboardIdentity = useMemo(() => {
    const rawEmail = String(userData?.[0]?.Email || '').trim();
    const rawInitials = String(userData?.[0]?.Initials || '').trim().toUpperCase();
    return { email: rawEmail, initials: rawInitials };
  }, [userData]);
  const isFirmWideDashboard = isDevOwner(userData?.[0]) && !originalAdminUser && !HOME_FORCE_MINE_LOCAL;
  const recentEnquiryRecords = useMemo(() => {
    const effectiveEmail = String(effectiveDashboardIdentity.email || '').toLowerCase().trim();
    const effectiveInitials = String(effectiveDashboardIdentity.initials || '').toUpperCase().trim();
    if (!Array.isArray(deferredEnquiries) || deferredEnquiries.length === 0 || (!effectiveEmail && !effectiveInitials)) return [];
    const isAdmin = isFirmWideDashboard;
    const uniqueStrings = (values: unknown[]): string[] => Array.from(new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ));

    const normalizeStage = (enquiry: any): string => {
      const rawStages = [
        enquiry.stage,
        enquiry.Stage,
        enquiry.pipelineStage,
        enquiry.Pipeline_Stage,
        enquiry.teamsStage,
        enquiry.teams_stage,
        enquiry.Status,
      ]
        .map((value) => String(value || '').toLowerCase().trim())
        .filter(Boolean);

      const normalizeSingleStage = (rawStage: string): string => {
        if (!rawStage) return 'enquiry';
        if (rawStage.includes('proof-of-id') || rawStage.includes('poid') || rawStage.includes('complete')) return 'complete';
        if (rawStage.includes('instruct')) return 'instructed';
        if (rawStage.includes('pitch')) return 'pitched';
        if (rawStage.includes('claim')) return 'claimed';
        if (rawStage.includes('new') || rawStage.includes('enquiry') || rawStage.includes('initial')) return 'enquiry';
        return rawStage;
      };

      const scoreStage = (stage: string): number => {
        if (stage === 'complete') return 5;
        if (stage === 'instructed') return 4;
        if (stage === 'pitched') return 3;
        if (stage === 'claimed') return 2;
        return 1;
      };

      const normalizedStages = rawStages.map(normalizeSingleStage);
      return normalizedStages.sort((left, right) => scoreStage(right) - scoreStage(left))[0] || 'enquiry';
    };

    const mappedRecentEnquiries = deferredEnquiries
      .map((enq: any) => ({
        ...enq,
        ID: enq.ID || enq.id?.toString(),
        Touchpoint_Date: enq.Touchpoint_Date || enq.datetime || enq.Date_Created,
        Point_of_Contact: enq.Point_of_Contact || enq.poc,
        Area_of_Work: enq.Area_of_Work || enq.aow,
        First_Name: enq.First_Name || enq.first,
        Last_Name: enq.Last_Name || enq.last,
        Name: enq.Name || enq.name,
      }))
      .filter((enquiry: any) => {
        if (isAdmin) return true;
        const poc = String(enquiry.Point_of_Contact || '').toLowerCase().trim();
        const emailLocalPart = effectiveEmail.includes('@') ? effectiveEmail.split('@')[0] : effectiveEmail;
        return poc === effectiveEmail || poc === effectiveInitials.toLowerCase() || poc === emailLocalPart;
      })
      .map((enquiry: any) => {
        const parsedDate = parseDateValue(enquiry.Touchpoint_Date);
        const fullName = `${String(enquiry.First_Name || '').trim()} ${String(enquiry.Last_Name || '').trim()}`.trim();
        const normalizedStage = normalizeStage(enquiry);
        return {
          id: enquiry.ID ? String(enquiry.ID) : undefined,
          enquiryId: enquiry.ID ? String(enquiry.ID) : undefined,
          processingEnquiryId: enquiry.processingEnquiryId ? String(enquiry.processingEnquiryId) : undefined,
          pitchEnquiryId: enquiry.pitchEnquiryId ? String(enquiry.pitchEnquiryId) : undefined,
          legacyEnquiryId: (enquiry.legacyEnquiryId || enquiry.acid) ? String(enquiry.legacyEnquiryId || enquiry.acid) : undefined,
          date: parsedDate ? parsedDate.toISOString() : String(enquiry.Touchpoint_Date || ''),
          poc: (isAdmin ? String(enquiry.Point_of_Contact || effectiveInitials || '').toUpperCase().trim() : effectiveInitials) || undefined,
          aow: String(enquiry.Area_of_Work || 'Other').trim() || 'Other',
          source: enquiry.Source || enquiry.source,
          name: String(enquiry.Name || fullName || enquiry.Email || '—'),
          email: String(enquiry.Email || enquiry.email || '').trim() || undefined,
          notes: String(enquiry.Initial_first_call_notes || enquiry.notes || '').trim() || undefined,
          stage: normalizedStage,
          pipelineStage: enquiry.pipelineStage || enquiry.Pipeline_Stage || normalizedStage,
          teamsChannel: enquiry.teamsChannel || enquiry.teams_channel || undefined,
          teamsCardType: enquiry.teamsCardType || enquiry.teams_card_type || undefined,
          teamsStage: enquiry.teamsStage || enquiry.teams_stage || undefined,
          teamsClaimed: enquiry.teamsClaimed || enquiry.teams_claimed || undefined,
          teamsLink: enquiry.teamsLink || enquiry.teams_link || undefined,
          prospectIds: uniqueStrings([
            enquiry.processingEnquiryId,
            enquiry.pitchEnquiryId,
            enquiry.legacyEnquiryId,
            enquiry.acid,
            enquiry.ID,
            enquiry.id,
          ]),
        };
      })
      .filter((enquiry) => enquiry.date)
      .sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''));

    if (isAdmin) return mappedRecentEnquiries;
    return mappedRecentEnquiries.slice(0, 500);
  }, [effectiveDashboardIdentity.email, effectiveDashboardIdentity.initials, deferredEnquiries, isFirmWideDashboard]);

  // Prune snapshot records when live data excludes rows (e.g. after a delete via SSE)
  useEffect(() => {
    if (recentEnquiryRecords.length === 0 || recentEnquirySnapshotRecords.length === 0) return;
    const liveIds = new Set(recentEnquiryRecords.map((r) => String(r.id || r.enquiryId || '')).filter(Boolean));
    const pruned = recentEnquirySnapshotRecords.filter((r) => {
      const key = String(r.id || (r as any).enquiryId || '');
      return !key || liveIds.has(key);
    });
    if (pruned.length < recentEnquirySnapshotRecords.length) {
      setRecentEnquirySnapshotRecords(pruned);
    }
  }, [recentEnquiryRecords, recentEnquirySnapshotRecords]);

  const seededRecentEnquiryRecords = recentEnquiryRecords.length > 0 ? recentEnquiryRecords : recentEnquirySnapshotRecords;
  const homeBillingTileCount = useMemo(
    () => Math.max(1, displayTimeMetrics.filter((metric: MetricItem) => !metric.title.toLowerCase().includes('outstanding')).length || 4),
    [displayTimeMetrics],
  );

  useEffect(() => {
    if (useLocalData || !homeMetricsUserKey) return;

    const shouldPersistEnquiryMetrics = hasSeededEnquiryMetricsRef.current || !isLoadingEnquiryMetrics;
    if (!wipClioData && recoveredData === null && prevRecoveredData === null && !shouldPersistEnquiryMetrics) return;

    writeHomeMetricsSnapshot({
      userKey: homeMetricsUserKey,
      savedAt: Date.now(),
      wipClioData,
      recoveredData,
      prevRecoveredData,
      recoveredHours,
      prevRecoveredHours,
      recentEnquiryRecords: recentEnquiryRecords.slice(0, 500),
      enquiryMetrics: shouldPersistEnquiryMetrics ? {
        enquiriesToday,
        enquiriesWeekToDate,
        enquiriesMonthToDate,
        prevEnquiriesToday,
        prevEnquiriesWeekToDate,
        prevEnquiriesMonthToDate,
        prevEnquiriesWeekFull,
        prevEnquiriesMonthFull,
        pitchedEnquiriesToday,
        pitchedEnquiriesWeekToDate,
        pitchedEnquiriesMonthToDate,
        prevPitchedEnquiriesToday,
        prevPitchedEnquiriesWeekToDate,
        prevPitchedEnquiriesMonthToDate,
        enquiryMetricsBreakdown,
        conversionComparison: resolvedConversionComparison,
      } : null,
      attendanceData: cachedAttendance,
      annualLeaveRecords: cachedAnnualLeave,
      futureLeaveRecords: cachedFutureLeaveRecords,
    });
  }, [
    enquiriesMonthToDate,
    enquiriesToday,
    enquiriesWeekToDate,
    enquiryMetricsBreakdown,
    homeMetricsUserKey,
    isLoadingEnquiryMetrics,
    pitchedEnquiriesMonthToDate,
    pitchedEnquiriesToday,
    pitchedEnquiriesWeekToDate,
    recentEnquiryRecords,
    prevEnquiriesMonthFull,
    prevRecoveredData,
    prevEnquiriesMonthToDate,
    prevEnquiriesToday,
    prevEnquiriesWeekFull,
    prevEnquiriesWeekToDate,
    prevPitchedEnquiriesMonthToDate,
    prevPitchedEnquiriesToday,
    prevPitchedEnquiriesWeekToDate,
    prevRecoveredHours,
    recoveredData,
    recoveredHours,
    resolvedConversionComparison,
    useLocalData,
    wipClioData,
    attendanceRecords,
    annualLeaveRecords,
    futureLeaveRecords,
  ]);

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
      backgroundColor: `${colours.yellow} !important`,
      border: 'none !important',
      height: '40px !important',
      fontWeight: '600',
      borderRadius: '0 !important',
      padding: '6px 12px !important',
      animation: `yellowPulse 2s infinite !important`,
      transition: 'box-shadow 0.3s, transform 0.3s, background 0.3s ease !important',
      whiteSpace: 'nowrap',
      width: 'auto',
      color: `${colours.light.text} !important`,
    },
  };

  const bookButtonStyles = {
    root: {
      backgroundColor: `${colours.green} !important`,
      border: 'none !important',
      height: '40px !important',
      fontWeight: '600',
      borderRadius: '0 !important',
      padding: '6px 12px !important',
      animation: `greenPulse 2s infinite !important`,
      transition: 'box-shadow 0.3s, transform 0.3s, background 0.3s ease !important',
      whiteSpace: 'nowrap',
      width: 'auto',
      color: `${colours.dark.text} !important`,
    },
  };

  // Leave action handlers
  // Always open — AnnualLeaveApprovals renders its own empty state ("All clear")
  // when there are no pending approvals. Silent no-op made the action feel
  // broken when the queue was empty.
  const handleApproveLeaveClick = () => {
    {
      setBespokePanelContent(
        <Suspense fallback={<ModalSkeleton variant="annual-leave-approve" />}>
          <AnnualLeaveApprovals
            approvals={approvalsNeeded.map((item) => ({
              id: item.id,
              request_id: item.request_id,
              person: item.person,
              start_date: item.start_date,
              end_date: item.end_date,
              reason: item.reason,
              status: item.status,
              days_taken: item.days_taken,
              leave_type: item.leave_type,
              hearing_confirmation: item.hearing_confirmation,
              hearing_details: item.hearing_details,
              approvers: item.approvers,
              clio_entry_id: item.clio_entry_id,
              half_day_start: item.half_day_start,
              half_day_end: item.half_day_end,
              requested_at: item.requested_at,
              approved_at: item.approved_at,
              booked_at: item.booked_at,
            }))}
            futureLeave={futureLeaveRecords.map((item) => ({
              id: item.id,
              request_id: item.request_id,
              person: item.person,
              start_date: item.start_date,
              end_date: item.end_date,
              reason: item.reason,
              status: item.status,
              days_taken: item.days_taken,
              leave_type: item.leave_type,
              hearing_confirmation: item.hearing_confirmation,
              hearing_details: item.hearing_details,
              approvers: item.approvers,
              clio_entry_id: item.clio_entry_id,
              half_day_start: item.half_day_start,
              half_day_end: item.half_day_end,
              requested_at: item.requested_at,
              approved_at: item.approved_at,
              booked_at: item.booked_at,
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
    // Demo data covering every scenario the approver will encounter
    const testApprovals: Array<{
      id: string; person: string; start_date: string; end_date: string;
      reason?: string; status: string; leave_type?: string;
      hearing_confirmation?: string | boolean | null; hearing_details?: string;
      days_taken?: number; half_day_start?: boolean; half_day_end?: boolean;
      requested_at?: string; approved_at?: string; booked_at?: string;
      clio_entry_id?: number; approvers?: string[];
    }> = [
      {
        id: 'demo-standard',
        person: 'Demo Person A',
        start_date: '2026-04-14',
        end_date: '2026-04-18',
        reason: 'Demo: standard leave with no hearings',
        status: 'requested',
        leave_type: 'standard',
        hearing_confirmation: 'yes',
        days_taken: 5,
        requested_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'demo-hearing-warn',
        person: 'Demo Person B',
        start_date: '2026-04-15',
        end_date: '2026-04-17',
        reason: 'Demo: standard leave with hearing conflict',
        status: 'requested',
        leave_type: 'standard',
        hearing_confirmation: 'no',
        hearing_details: 'Tribunal hearing 16 Apr — Example v Example Ltd',
        days_taken: 3,
        requested_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'demo-purchase',
        person: 'Demo Person C',
        start_date: '2026-06-23',
        end_date: '2026-06-27',
        reason: 'Demo: purchased additional days',
        status: 'requested',
        leave_type: 'purchase',
        hearing_confirmation: 'yes',
        days_taken: 5,
        requested_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'demo-sale',
        person: 'Demo Person D',
        start_date: '2026-03-31',
        end_date: '2026-03-31',
        reason: 'Demo: selling back unused day',
        status: 'requested',
        leave_type: 'sale',
        days_taken: 1,
        requested_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'demo-no-reason',
        person: 'Demo Person E',
        start_date: '2026-07-14',
        end_date: '2026-07-14',
        reason: '',
        status: 'requested',
        leave_type: 'standard',
        hearing_confirmation: 'yes',
        days_taken: 1,
        half_day_start: true,
        requested_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      },
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
    const actions: HomeImmediateAction[] = [];

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
      // Build subtitle from requestor initials, flag non-standard types
      const firstRequestor = approvalsNeeded[0]?.person?.toUpperCase() || '';
      const hasNonStandard = approvalsNeeded.some(a => a.leave_type && a.leave_type !== 'standard');
      const typeHint = hasNonStandard ? ' (incl. sale/purchase)' : '';
      const subtitle = approvalsNeeded.length > 1 
        ? `${firstRequestor} +${approvalsNeeded.length - 1} more${typeHint}`
        : `${firstRequestor}${typeHint}`;
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
  type Action = HomeImmediateAction;

  const resetQuickActionsSelection = useCallback(() => {
    if (resetQuickActionsSelectionRef.current) {
      resetQuickActionsSelectionRef.current();
    }
  }, []);
  const handleActionClick = useCallback((action: { title: string; icon: string }) => {
    let content: React.ReactNode = <div>No form available.</div>;
    let titleText = action.title;
    let descriptionText = '';

    setBespokePanelWidth('85%');

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
      'Verify ID': { shortTitle: 'Verify ID', description: 'Run a Tiller identity verification (address + PEP & sanctions)' },
      'Log L&D': { shortTitle: 'Log L&D', description: 'Record a learning & development activity or plan' },
      'Team Attendance': { shortTitle: 'Team Leave', description: 'View who is away, upcoming leave, and leave history' },
      'Team Leave': { shortTitle: 'Team Leave', description: 'View who is away, upcoming leave, and leave history' },
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
          <Suspense fallback={<ModalSkeleton variant="attendance" />}>
            <PersonalAttendanceConfirm
              isDarkMode={isDarkMode}
              demoModeEnabled={demoModeEnabled}
              isAdmin={hasAdminContext}
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
          </Suspense>
        );
        break;
      case "Update Attendance":
        // Open the personal attendance confirmation component
        content = (
          <Suspense fallback={<ModalSkeleton variant="attendance" />}>
            <PersonalAttendanceConfirm
              isDarkMode={isDarkMode}
              demoModeEnabled={demoModeEnabled}
              isAdmin={hasAdminContext}
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
          </Suspense>
        );
        break;
      case 'Team Leave':
      case 'Team Attendance':
        content = (
          <Suspense fallback={<ModalSkeleton variant="attendance" />}>
            <AttendancePortal
              isDarkMode={isDarkMode}
              currentUserInitials={userData?.[0]?.Initials}
              isAdmin={hasAdminContext}
              preloadedLeave={annualLeaveAllData}
              preloadedTeam={transformedTeamData}
              onRequestLeave={() => {
                // Close the portal and open the leave request modal
                setIsBespokePanelOpen(false);
                setBespokePanelContent(null);
                setTimeout(() => {
                  handleActionClick({ title: 'Request Annual Leave', icon: 'PalmTree' });
                }, 300);
              }}
            />
          </Suspense>
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
        content = (
          <AnnualLeaveModal
            userData={enrichedUserData}
            totals={annualLeaveTotals ?? { standard: 0, unpaid: 0, sale: 0 }}
            bankHolidays={bankHolidays}
            futureLeave={futureLeaveRecords}
            allLeave={annualLeaveAllData}
            team={transformedTeamData}
            isAdmin={hasAdminContext}
            isLoadingAnnualLeave={isLoadingAnnualLeave}
            onSubmitSuccess={async () => {
              // Refresh annual leave data after successful submission
              await refreshAnnualLeaveData(String(userData?.[0]?.Initials || ''), { forceRefresh: true });
              setIsBespokePanelOpen(false);
              setBespokePanelContent(null);
              resetQuickActionsSelection();
            }}
          />
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
        content = (
          <Suspense fallback={<ModalSkeleton variant="generic" />}>
            <VerificationCheckForm
              currentUser={userData?.[0]}
              embedded
              onBack={() => {
                setIsBespokePanelOpen(false);
                resetQuickActionsSelection();
              }}
              onSubmitSuccess={(msg) => {
                showToast(msg, 'success');
              }}
              onSubmitError={(err) => {
                showToast(err, 'error');
              }}
            />
          </Suspense>
        );
        break;
      case 'Log L&D':
        content = (
          <Suspense fallback={<ModalSkeleton variant="generic" />}>
            <LearningDevelopmentForm
              userData={userData ?? undefined}
              teamData={teamData ?? null}
              onBack={() => {
                setIsBespokePanelOpen(false);
                resetQuickActionsSelection();
              }}
              onSubmitSuccess={(message) => {
                showToast(message || 'L&D entry saved', 'success');
                setIsBespokePanelOpen(false);
                resetQuickActionsSelection();
              }}
              onSubmitError={(error) => {
                showToast('L&D entry failed', 'error', error);
              }}
            />
          </Suspense>
        );
        break;
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
      case 'CCL Service':
      case 'Review CCL':
        openHomeCclReview(demoModeEnabled ? 'DEMO-3311402' : undefined);
        return;
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
    setBespokePanelWidth,
    openHomeCclReview,
  ]);

  /* upcomingLeaveSummary + openUpcomingLeaveModal removed — leave view now lives in AwayInsight */

  // Group instruction next actions by type with counts and sample detail
  const groupedInstructionActions = useMemo(() => {
    const actionGroups: Record<string, { count: number; icon: string; disabled?: boolean; sampleDetail: string; firstSummary?: InstructionSummary }> = {};
    
    actionableSummaries.forEach(summary => {
      const action = summary.nextAction;
      if (actionGroups[action]) {
        actionGroups[action].count++;
      } else {
        // Map next actions to appropriate icons
        let icon = 'OpenFile'; // default
        if (action === 'Verify ID') icon = 'ContactCard';
        else if (action === 'Assess Risk') icon = 'Shield';
        else if (action === 'CCL Service' || action === 'Review CCL' || action === 'Open CCL Workbench') icon = 'Send';
        else if (action === 'Review') icon = 'ReviewRequestMirrored';
        
        // Use first item's client name as sample detail
        const detail = summary.clientName || summary.service || '';
        
        actionGroups[action] = { 
          count: 1, 
          icon,
          disabled: summary.disabled,
          sampleDetail: detail,
          firstSummary: summary,
        };
      }
    });
    
    return actionGroups;
  }, [actionableSummaries]);
      const formsTodoActions = useMemo<HomeImmediateAction[]>(() => {
        const allScopeActive = canSeeTodoGodView && homeTodoScope === 'all';
        // In god-view, the canonical "is this card mine?" identity is always LZ.
        // (Per the brief: dev owner is Luke; non-LZ cards become read-only.)
        const decorate = (
          card: ToDoCard,
          baseAction: HomeImmediateAction,
        ): HomeImmediateAction => {
          if (!allScopeActive) return baseAction;
          const cardOwner = String(card.ownerInitials || '').trim().toUpperCase();
          const isOwn = cardOwner === 'LZ';
          const ownerChip = cardOwner ? `\u00b7 @${cardOwner}` : '';
          const subtitle = baseAction.subtitle
            ? `${baseAction.subtitle} ${ownerChip}`.trim()
            : ownerChip || baseAction.subtitle;
          if (isOwn) {
            return { ...baseAction, subtitle };
          }
          // Read-only: keep the row clickable for navigation but strip
          // destructive actions and disable the chip-level onClick.
          const safeExpansion = baseAction.expansion
            ? {
                ...baseAction.expansion,
                description: `Owned by ${cardOwner} \u2014 view only. ${baseAction.expansion.description || ''}`.trim(),
                actions: (baseAction.expansion.actions || []).filter((a) => a.tone === 'ghost' || /open/i.test(a.label)),
              }
            : baseAction.expansion;
          return {
            ...baseAction,
            subtitle,
            disabled: true,
            onClick: () => {},
            expansion: safeExpansion,
          };
        };

        return todoRegistryCards.map((card) => {
          const payload = asRecord(card.payload);

          if (card.kind === 'review-ccl') {
            // CCL autopilot surfaced fields that need fee-earner review. Card
            // created server-side by /api/ccl/service/run when the Safety Net
            // flags scores ≤7; payload carries the matterId so we can open
            // the review rail directly via the existing openHomeCclReview
            // CustomEvent (handled by OperationsDashboard).
            const matterRef = String(card.matterRef || '').trim();
            const matterId = readStringValue(payload?.matterId) || matterRef || undefined;
            const flaggedCount = readNumberValue(payload?.flaggedCount);
            const subtitleParts: string[] = [];
            if (matterRef) subtitleParts.push(matterRef);
            if (flaggedCount != null && flaggedCount > 0) {
              subtitleParts.push(`${flaggedCount} to check`);
            } else if (card.lastEvent) {
              subtitleParts.push(card.lastEvent);
            }
            const openReview = () => openHomeCclReview(matterId);
            return decorate(card, {
              title: 'Review CCL',
              subtitle: subtitleParts.filter(Boolean).join(' \u00b7 ') || (card.summary || 'Client Care Letter'),
              icon: 'Send',
              category: (flaggedCount != null && flaggedCount > 0 ? 'critical' : 'standard') as ImmediateActionCategory,
              onClick: openReview,
              expansion: {
                kind: 'generic',
                primary: card.summary || (matterRef ? `Review CCL \u00b7 ${matterRef}` : 'Review CCL'),
                secondary: card.lastEvent || (flaggedCount != null ? `${flaggedCount} field${flaggedCount === 1 ? '' : 's'} surfaced by Safety Net` : 'Safety Net finished'),
                description: 'The autopilot generated the CCL and the Safety Net surfaced fields for fee-earner review. Open the review to sign-off or adjust wording before upload.',
                fields: [
                  ...(matterRef ? [{ label: 'Matter', value: matterRef }] : []),
                  ...(flaggedCount != null ? [{ label: 'Flagged', value: `${flaggedCount}` }] : []),
                  ...(card.stage ? [{ label: 'Stage', value: String(card.stage) }] : []),
                ],
                actions: [
                  { label: 'Open review', onClick: openReview, tone: 'primary' },
                ],
              },
            });
          }

          if (card.kind === 'ld-review') {
            const fullName = readStringValue(payload?.fullName) || readStringValue(payload?.planInitials) || 'Learning & Development';
            const activityTitle = readStringValue(payload?.title) || 'Review submitted activity';
            const provider = readStringValue(payload?.provider);
            const category = readStringValue(payload?.category);
            const activityDate = formatRegisterTodoDate(payload?.activityDate);
            const hours = readNumberValue(payload?.hours);
            const description = readStringValue(payload?.description);
            const openRegister = () => openRegisterTodoPanel(
              'ld',
              'Review Learning & Development',
              'Review and verify submitted learning and development entries for Alex.',
              'ReviewRequestMirrored',
            );

            return decorate(card, {
              title: 'Review L&D',
              subtitle: [fullName, hours != null ? `${hours}h` : null].filter(Boolean).join(' · '),
              icon: 'ReviewRequestMirrored',
              category: 'standard',
              onClick: openRegister,
              expansion: {
                kind: 'generic',
                primary: fullName,
                secondary: [activityTitle, provider].filter(Boolean).join(' · ') || 'Learning & Development entry',
                description: description || 'Review the submitted learning and development activity and mark it verified when satisfied.',
                fields: [
                  ...(activityDate ? [{ label: 'Date', value: activityDate }] : []),
                  ...(hours != null ? [{ label: 'Hours', value: `${hours}` }] : []),
                  ...(category ? [{ label: 'Category', value: category }] : []),
                  ...(provider ? [{ label: 'Provider', value: provider }] : []),
                ],
                actions: [
                  { label: 'Approve entry', onClick: () => { void handleApproveLdTodo(card); }, tone: 'primary' },
                  { label: 'Open register', onClick: openRegister, tone: 'ghost' },
                ],
              },
            });
          }

          if (card.kind === 'complaint-followup') {
            const complainant = readStringValue(payload?.complainant) || 'Complaint review';
            const respondent = readStringValue(payload?.respondent);
            const receivedDate = formatRegisterTodoDate(payload?.receivedDate);
            const slaDate = formatRegisterTodoDate(payload?.slaDeadline);
            const slaDays = daysUntilIso(payload?.slaDeadline);
            const matterReference = readStringValue(payload?.matterReference);
            const category = slaDays != null && slaDays < 0
              ? 'critical'
              : slaDays != null && slaDays < 14
                ? 'warning'
                : 'critical';
            const openRegister = () => openRegisterTodoPanel(
              'complaints',
              'Review Complaints',
              'Review, investigate, and resolve complaint items assigned to Alex.',
              'Shield',
            );

            return decorate(card, {
              title: 'Review Complaint',
              subtitle: [respondent ? `Against ${respondent}` : null, formatSlaSummary(slaDays)].filter(Boolean).join(' · '),
              icon: 'Shield',
              category,
              onClick: openRegister,
              expansion: {
                kind: 'generic',
                primary: complainant,
                secondary: formatSlaSummary(slaDays),
                aow: readStringValue(payload?.areaOfWork) || undefined,
                description: slaDays != null && slaDays < 0
                  ? 'SLA exceeded — review urgently and update the complaints register.'
                  : 'Open the complaints register to investigate, update status, and reconcile this item when resolved.',
                fields: [
                  ...(respondent ? [{ label: 'Respondent', value: respondent }] : []),
                  ...(receivedDate ? [{ label: 'Received', value: receivedDate }] : []),
                  ...(slaDate ? [{ label: 'SLA', value: slaDate }] : []),
                  ...(matterReference ? [{ label: 'Matter', value: matterReference }] : []),
                ],
                actions: [
                  { label: 'Open register', onClick: openRegister, tone: 'primary' },
                ],
              },
            });
          }

          const givenBy = readStringValue(payload?.givenBy);
          const givenTo = readStringValue(payload?.givenTo) || 'Undertaking review';
          const givenDate = formatRegisterTodoDate(payload?.givenDate);
          const dueDate = formatRegisterTodoDate(payload?.dueDate);
          const dueDays = daysUntilIso(payload?.dueDate);
          const matterReference = readStringValue(payload?.matterReference);
          const description = readStringValue(payload?.description);
          const category = dueDays != null && dueDays < 0
            ? 'critical'
            : dueDays != null && dueDays < 3
              ? 'warning'
              : 'standard';
          const openRegister = () => openRegisterTodoPanel(
            'undertakings',
            'Review Undertakings',
            'Monitor and reconcile undertaking items assigned to Alex.',
            'DocumentSet',
          );

          return decorate(card, {
            title: 'Review Undertaking',
            subtitle: [givenBy ? `From ${givenBy}` : null, formatDueSummary(dueDays, dueDate)].filter(Boolean).join(' · '),
            icon: 'DocumentSet',
            category,
            onClick: openRegister,
            expansion: {
              kind: 'generic',
              primary: givenTo,
              secondary: formatDueSummary(dueDays, dueDate),
              aow: readStringValue(payload?.areaOfWork) || undefined,
              description: description || 'Open the undertakings register to discharge or update this item.',
              fields: [
                ...(givenBy ? [{ label: 'Given by', value: givenBy }] : []),
                { label: 'Given to', value: givenTo },
                ...(givenDate ? [{ label: 'Given', value: givenDate }] : []),
                ...(matterReference ? [{ label: 'Matter', value: matterReference }] : []),
              ],
              actions: [
                { label: 'Open register', onClick: openRegister, tone: 'primary' },
              ],
            },
          });
        });
      }, [handleApproveLdTodo, openHomeCclReview, openRegisterTodoPanel, todoRegistryCards, canSeeTodoGodView, homeTodoScope]);
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

      Object.entries(groupedInstructionActions).forEach(([actionType, { count, icon, disabled, sampleDetail, firstSummary }]) => {
        const title = actionType;
        // Show client name or "+X more" if multiple
        const subtitle = count > 1 
          ? `${sampleDetail} +${count - 1} more`
          : sampleDetail || '';
        const openInstructionAction = disabled
          ? () => debugLog('CCL action disabled in production')
          : () => handleActionClick({ title, icon });

        // Phase E — matter-kind expansion. Surfaces the first instruction's context
        // so the user can read who's next before clicking through. Only wire when
        // not disabled and we have a concrete summary to describe.
        const expansionPayload = (!disabled && firstSummary) ? {
          kind: 'matter' as const,
          primary: firstSummary.clientName || 'Unknown client',
          secondary: count > 1
            ? `${firstSummary.service} · +${count - 1} more waiting`
            : firstSummary.service,
          description: count > 1
            ? `${count} instructions need "${actionType}". Opening the workflow starts with ${firstSummary.clientName || 'the first client'}; the rest queue behind.`
            : `Next step on this instruction is "${actionType}". Open the workflow to action it.`,
          fields: [
            { label: 'Instruction', value: firstSummary.id },
            { label: 'Service', value: firstSummary.service },
            { label: 'Next step', value: actionType },
            ...(count > 1 ? [{ label: 'Queue', value: `${count} waiting` }] : []),
          ],
          actions: [
            { label: count > 1 ? 'Open first workflow' : 'Open workflow', onClick: openInstructionAction, tone: 'primary' as const },
          ],
        } : undefined;

        actions.push({
          title,
          subtitle,
          icon,
          disabled,
          count: count > 1 ? count : undefined,
          onClick: openInstructionAction,
          category: instructionCategoryFor(actionType),
          expansion: expansionPayload,
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
    actions.push(...formsTodoActions);

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

      const openFirstEnquiry = () => {
        try {
          window.dispatchEvent(new CustomEvent('navigateToEnquiry', {
            detail: { enquiryId: firstAction.enquiryId, timelineItem: 'doc-workspace' },
          }));
        } catch (error) {
          console.error('Failed to dispatch navigation event:', error);
        }
      };

      const expansionAow = (firstEnquiry?.Area_of_Work as string | undefined)
        || (firstEnquiry as unknown as { area_of_work?: string } | undefined)?.area_of_work;
      const expansionFields: { label: string; value: string }[] = [
        { label: 'Enquiry ref', value: String(firstAction.enquiryId) },
        { label: 'In holding', value: `${firstAction.holdingCount} file${firstAction.holdingCount === 1 ? '' : 's'}` },
      ];
      if (firstEnquiry?.Point_of_Contact) {
        expansionFields.push({ label: 'POC', value: String(firstEnquiry.Point_of_Contact) });
      }
      if (expansionAow) {
        expansionFields.push({ label: 'Area', value: String(expansionAow) });
      }

      actions.push({
        title: 'Allocate Documents',
        subtitle,
        icon: 'DocumentSet',
        count: totalFiles,
        onClick: openFirstEnquiry,
        category: 'standard' as ImmediateActionCategory,
        expansion: {
          kind: 'enquiry',
          primary: firstName,
          secondary: pendingDocActions.length > 1
            ? `${pendingDocActions.length} enquiries · ${totalFiles} files total`
            : `${firstAction.holdingCount} file${firstAction.holdingCount === 1 ? '' : 's'} awaiting allocation`,
          aow: expansionAow,
          description: pendingDocActions.length > 1
            ? 'Open the first enquiry to clear its workspace, or use "Open enquiry" below to start there.'
            : 'Files dropped into this enquiry\'s holding area are waiting to be assigned to the active workspace.',
          fields: expansionFields,
          actions: [
            { label: 'Open enquiry', onClick: openFirstEnquiry, tone: 'primary' },
          ],
        },
      });
    }

    // Demo mode: CCL review chip removed — real CCL actions surface inline via CclOpsPanel

    // Phase E demo seeds — when demo mode is on, always surface one example of each
    // TodoExpansion kind (enquiry / matter / generic) so the expanded pane can be
    // showcased without waiting on real data.
    if (demoModeEnabled) {
      const demoToast = (label: string) => showToast(`Demo: ${label}`, 'info');

      // enquiry-kind expansion — blue accent (or Commercial accent via aow)
      actions.push({
        title: 'Allocate Documents',
        subtitle: 'Demo Enquiry · Jane Holloway',
        icon: 'DocumentSet',
        count: 3,
        onClick: () => demoToast('open enquiry workspace'),
        category: 'standard',
        expansion: {
          kind: 'enquiry',
          primary: 'Jane Holloway',
          secondary: '3 files awaiting allocation',
          aow: 'Commercial',
          description: 'Files dropped into this enquiry\'s holding area are waiting to be assigned to the active workspace.',
          fields: [
            { label: 'Enquiry ref', value: 'DEMO-ENQ-5521' },
            { label: 'In holding', value: '3 files' },
            { label: 'POC', value: 'LZ' },
            { label: 'Area', value: 'Commercial' },
          ],
          actions: [
            { label: 'Open enquiry', onClick: () => demoToast('open enquiry'), tone: 'primary' },
          ],
        },
      });

      // matter-kind expansion — green accent
      actions.push({
        title: 'Verify ID',
        subtitle: 'Demo Matter · Patel Construction Ltd',
        icon: 'ContactCard',
        count: 2,
        onClick: () => demoToast('open instruction workflow'),
        category: 'critical',
        expansion: {
          kind: 'matter',
          primary: 'Patel Construction Ltd',
          secondary: 'New Commercial Dispute · +1 more waiting',
          description: '2 instructions need "Verify ID". Opening the workflow starts with Patel Construction Ltd; the rest queue behind.',
          fields: [
            { label: 'Instruction', value: 'HLX-30112-58411' },
            { label: 'Service', value: 'New Commercial Dispute' },
            { label: 'Next step', value: 'Verify ID' },
            { label: 'Queue', value: '2 waiting' },
          ],
          actions: [
            { label: 'Open first workflow', onClick: () => demoToast('open instruction'), tone: 'primary' },
          ],
        },
      });

      // generic-kind expansion — neutral accent, no aow, no primary-entity navigation
      actions.push({
        title: 'Review CCL',
        subtitle: 'Demo Draft · ready for sign-off',
        icon: 'Send',
        onClick: () => demoToast('open CCL review'),
        category: 'standard',
        expansion: {
          kind: 'generic',
          primary: 'CCL draft ready to review',
          secondary: 'Generated 12 minutes ago · passed Safety Net',
          description: 'The Safety Net pass scored 9+ across all intake fields. Review and send, or edit inline before approving.',
          fields: [
            { label: 'Matter', value: 'DEMO-3311402' },
            { label: 'Confidence', value: 'Full' },
            { label: 'Safety Net', value: 'Passed' },
          ],
          actions: [
            { label: 'Open review', onClick: () => demoToast('open CCL review'), tone: 'primary' },
          ],
        },
      });
    }

    // Normalize titles (strip count suffix like " (3)") when sorting
    const sortKey = (title: string) => {
      const base = title.replace(/\s*\(\d+\)$/,'');
      return quickActionOrder[base] ?? quickActionOrder[title] ?? 99;
    };
    actions.sort((a, b) => sortKey(a.title) - sortKey(b.title));
    return enrichImmediateActions(actions);
  }, [
    isLoadingAttendance,
    currentUserConfirmed,
    demoModeEnabled,
    hasActiveMatter,
    instructionData,
    groupedInstructionActions,
    instructionsActionDone,
    immediateALActions,
    formsTodoActions,
    handleActionClick,
    hasActivePitch,
    userInitials,
    isLocalhost,
    pendingDocActions,
    enquiries,
    showToast,
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
    if (!isActive) {
      // Home stays mounted while Prospects is active.
      // Don't clear the shared navigator here or we can wipe the Prospects bar
      // after Enquiries has already written its own content.
      return;
    }

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
        onOpenReleaseNotes={['LZ', 'AC'].includes(userInitials.toUpperCase()) || checkIsLocalDev() ? () => setShowReleaseNotes(true) : undefined}
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
    isActive,
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
    const iconColor = highlight ? colours.dark.text : (isDarkMode ? colours.dark.text : colours.light.text);
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

  // ── Memoised heavy props for OperationsDashboard (React.memo) ──
  const memoEnquiryMetrics = useMemo(() => [
    { title: 'Enquiries Today', count: displayEnquiriesToday, prevCount: displayPrevEnquiriesToday, pitchedCount: displayPitchedEnquiriesToday },
    { title: 'Enquiries This Week', count: displayEnquiriesWeekToDate, prevCount: displayPrevEnquiriesWeekFull, elapsedPrevCount: displayPrevEnquiriesWeekToDate, pitchedCount: displayPitchedEnquiriesWeekToDate },
    { title: 'Enquiries This Month', count: displayEnquiriesMonthToDate, prevCount: displayPrevEnquiriesMonthFull, elapsedPrevCount: displayPrevEnquiriesMonthToDate, pitchedCount: displayPitchedEnquiriesMonthToDate },
    { title: 'Matters Opened This Month', count: displayMattersOpenedCount },
    { title: 'Conversion Rate', percentage: conversionRate, isPercentage: true, showTrend: false, context: { enquiriesMonthToDate: displayEnquiriesMonthToDate, mattersOpenedMonthToDate: displayMattersOpenedCount, prevEnquiriesMonthToDate: displayPrevEnquiriesMonthToDate } },
  ], [displayEnquiriesToday, displayPrevEnquiriesToday, displayPitchedEnquiriesToday, displayEnquiriesWeekToDate, displayPrevEnquiriesWeekFull, displayPrevEnquiriesWeekToDate, displayPitchedEnquiriesWeekToDate, displayEnquiriesMonthToDate, displayPrevEnquiriesMonthFull, displayPrevEnquiriesMonthToDate, displayPitchedEnquiriesMonthToDate, displayMattersOpenedCount, conversionRate]);

  const memoWipDailyData = useMemo(() => {
    if (!wipClioData) return undefined;
    const mapDaily = (src: Record<string, any>) => Object.fromEntries(
      Object.entries(src || {}).map(([k, v]: [string, any]) => [k, {
        hours: Number(v?.total_hours) || 0,
        value: Number(v?.total_amount) || 0,
        entries: Array.isArray(v?.entries) ? v.entries.map((e: any) => ({ hours: Number(e?.hours) || 0, value: Number(e?.value) || 0, type: e?.type || undefined, note: e?.note || undefined, matter: e?.matter || undefined, matterDesc: e?.matterDesc || undefined, activity: e?.activity || undefined })) : undefined,
      }])
    );
    return { currentWeek: mapDaily(wipClioData?.current_week?.daily_data || {}), lastWeek: mapDaily(wipClioData?.last_week?.daily_data || {}) };
  }, [wipClioData]);

  const handleOpenOutstandingBreakdown = useCallback(() => {
    setShowOnlyMine(false);
    setIsOutstandingPanelOpen(true);
  }, []);

  // Portal for app-level immediate actions
  const handleTodoScopeChange = useCallback((next: 'mine' | 'all') => {
    setHomeTodoScope((prev) => {
      if (prev === next) return prev;
      try { window.localStorage.setItem('helix.homeTodoScope', next); } catch { /* ignore */ }
      try {
        trackClientEvent('home', 'todo-scope-switched', {
          from: prev,
          to: next,
          rowCount: todoRegistryCards.length,
        });
      } catch { /* ignore */ }
      return next;
    });
  }, [todoRegistryCards.length]);

  const todoScopeToggle = canSeeTodoGodView ? (
    <div
      role="group"
      aria-label="Home to-do scope"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0,
        background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
        borderRadius: 999,
        padding: 2,
        fontFamily: 'var(--font-primary)',
      }}
    >
      {(['mine', 'all'] as const).map((opt) => {
        const active = homeTodoScope === opt;
        const label = opt === 'mine' ? 'Mine' : 'Everyone';
        return (
          <button
            key={opt}
            type="button"
            onClick={(e) => { e.stopPropagation(); handleTodoScopeChange(opt); }}
            style={{
              border: 'none',
              borderRadius: 999,
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              background: active
                ? (isDarkMode ? colours.accent : colours.highlight)
                : 'transparent',
              color: active
                ? (isDarkMode ? colours.dark.background : '#ffffff')
                : colours.subtleGrey,
              transition: 'background 0.15s ease, color 0.15s ease',
              fontFamily: 'var(--font-primary)',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  ) : null;

  const appLevelImmediateActions = (
    <ImmediateActionsBar
      isDarkMode={isDarkMode}
      immediateActionsReady={immediateActionsReady}
      immediateActionsList={immediateActionsList}
      highlighted={Boolean(homeCclReviewRequest)}
      seamless={false}
      scopeSlot={todoScopeToggle}
    />
  );

  return (
    <div className={`home-root ${containerStyle(isDarkMode)}`}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      {/* Portal immediate actions to app level (suppressed when inline ToDo box is rendered). */}
      {!replacePipelineAndMatters && typeof document !== 'undefined' && document.getElementById('app-level-immediate-actions') && 
        createPortal(appLevelImmediateActions, document.getElementById('app-level-immediate-actions')!)
      }

      {/* R7 dev-preview floating Demo pulse button removed 2026-04-21 —
          Pulse is now a satellite chip in the HubToolsChip strip (next to Demo). */}

      {/* Home layout overlay removed 2026-04-21 — all operator toggles now live
          inside CommandDeck (via HubToolsChip). The keys + state wiring here are
          the source of truth; CommandDeck writes the same localStorage and fires
          `helix:homeLayoutToggled` to keep this component in sync. */}

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
          borderRadius: 0,
          background: isDarkMode ? 'rgba(0, 3, 25, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
          boxShadow: isDarkMode ? '0 4px 16px rgba(0, 0, 0, 0.4)' : '0 2px 8px rgba(0,0,0,0.06)',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: `2px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.2)' : 'rgba(0, 0, 0, 0.12)'}`,
            borderTopColor: isDarkMode ? colours.accent : colours.highlight,
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#f3f4f6' : '#061733' }}>
              Rebuilding your view…
            </span>
            <span style={{ fontSize: 11, color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : colours.greyText }}>
              Recalculating personalised metrics.
            </span>
          </div>
        </div>
      )}

      {/* Operations hub — cohesive home surface (metrics + team availability) */}
      <div className={operationsHubStyle(isDarkMode)}>
        {/* OperationsDashboard — always rendered. Enquiries + matters metric tiles
            (plus conversion chart) remain visible regardless of layout toggles.
            When `replacePipelineAndMatters` is on, the dashboard swaps its right
            pipeline column for the `todoSlot` below (50/50 with Conversion). */}
        <div className={`${dashboardSectionReady ? 'home-cascade-1' : 'home-cascade-pending'} home-stable-shell home-stable-shell-dashboard`}>
          <div className="home-stable-shell-panel home-stable-shell-live">
            <LivePulse nonce={dataOpsPulseNonce} variant="border">
            <OperationsDashboard
              metrics={displayTimeMetrics}
              enquiryMetrics={memoEnquiryMetrics}
              enquiryMetricsBreakdown={enquiryMetricsBreakdown}
              conversionComparison={resolvedConversionComparison}
              enableConversionComparison={showExperimentalConversionComparison}
              isResolvingConversionComparison={isResolvingConversionComparison}
              unclaimedSummary={unclaimedSummary}
              recentEnquiryRecords={seededRecentEnquiryRecords}
              unclaimedQueueCount={unclaimedEnquiries.length}
              unclaimedToday={unclaimedToday}
              unclaimedThisWeek={unclaimedThisWeek}
              unclaimedLastWeek={unclaimedLastWeek}
              canClaimUnclaimed={['LZ', 'JW', 'AC'].includes(userInitials)}
              isProcessingView={isDashboardProcessing}
              processingLabel={dashboardProcessingLabel}
              processingDetail={dashboardProcessingDetail}
              isDarkMode={isDarkMode}
              enquiriesUsingSnapshot={enquiriesUsingSnapshot}
              enquiriesLiveRefreshInFlight={enquiriesLiveRefreshInFlight}
              enquiriesLastLiveSyncAt={enquiriesLastLiveSyncAt}
              isTeamWideEnquiryView={isFirmWideDashboard}
              userEmail={isWaitingForLocalDashboardIdentity ? '' : effectiveDashboardIdentity.email}
              userInitials={isWaitingForLocalDashboardIdentity ? '' : effectiveDashboardIdentity.initials}
              recentMatters={recentMatters}
              demoModeEnabled={demoModeEnabled}
              isActive={isActive}
              teamData={deferredTeamData ?? undefined}
              wipDailyData={memoWipDailyData}
              onRefresh={handleRefreshTimeMetrics}
              isRefreshing={isRefreshingTimeMetrics}
              isLoading={isLoadingWipClio}
              isOutstandingLoading={!outstandingBalancesData?.data || outstandingTotal === null}
              isLoadingEnquiryMetrics={isLoadingEnquiryMetrics}
              hasOutstandingBreakdown={filteredBalancesForPanel.length > 0}
              onOpenOutstandingBreakdown={handleOpenOutstandingBreakdown}
              hidePipelineAndMatters={replacePipelineAndMatters}
              todoCount={replacePipelineAndMatters
                ? immediateActionsList.reduce((sum, a) => sum + ((a as { count?: number }).count ?? 1), 0)
                : undefined}
              todoSlot={replacePipelineAndMatters ? (
                <ImmediateActionsBar
                  isDarkMode={isDarkMode}
                  immediateActionsReady={immediateActionsReady}
                  immediateActionsList={immediateActionsList}
                  highlighted={Boolean(homeCclReviewRequest)}
                  seamless={true}
                  scopeSlot={todoScopeToggle}
                />
              ) : null}
            />
            </LivePulse>
          </div>
        </div>

        {/* Operations queue — DEV PREVIEW: locked to LZ+AC only until ready for wider rollout.
            Also hidden when the `hideAsanaAndTransactions` layout toggle is on. */}
        {!hideAsanaAndTransactions && (() => {
          const userRole = (userData?.[0]?.Role || '').toLowerCase();
          const isOpsRole = /operations|ops|tech|technology/i.test(userRole);
          const isLzOrAc = ['LZ', 'AC'].includes((userData?.[0]?.Initials || '').toUpperCase().trim());
          const userIsAdmin = isAdminUser(userData?.[0]) || isOpsRole;
          const showOpsQueue = featureToggles.showOpsQueue !== false && (isLzOrAc || featureToggles.forceShowOpsQueue);
          return showOpsQueue ? (
            <div className={`${opsSectionReady ? 'home-cascade-2' : 'home-cascade-pending'} home-stable-shell home-stable-shell-ops`} style={{ padding: '0 6px 6px 6px' }}>
              <div className="home-stable-shell-panel home-stable-shell-live">
                <LivePulse nonce={dataOpsPulseNonce} variant="border">
                <OperationsQueue
                  isDarkMode={isDarkMode}
                  userInitials={userInitials}
                  showToast={showToast}
                  demoModeEnabled={demoModeEnabled}
                  isAdmin={userIsAdmin || isLzOrAc}
                  isV2User={isLzOrAc}
                  isDevOwner={isDevOwner(userData?.[0])}
                  showHomeOpsCclDates={featureToggles.showHomeOpsCclDates === true}
                  isActive={isActive}
                />
                </LivePulse>
              </div>
            </div>
          ) : null;
        })()}

        {/* Team insight — attendance + leave in one panel */}
        <div className={`${teamSectionReady ? 'home-cascade-3' : 'home-cascade-pending'} home-stable-shell home-stable-shell-team`} style={{ padding: '0 6px 6px 6px' }}>
            <Suspense fallback={
              <HomeTeamInsightSkeleton isDarkMode={isDarkMode} />
            }>
              <div className="home-stable-shell-panel home-stable-shell-live">
                <LivePulse nonce={attendanceRealtimePulseNonce} variant="border">
                <TeamInsight
                  isDarkMode={isDarkMode}
                  attendanceRecords={attendanceRecords}
                  teamData={attendanceTeam}
                  annualLeaveRecords={annualLeaveRecords}
                  futureLeaveRecords={futureLeaveRecords}
                  isLoadingAttendance={isLoadingAttendance}
                  isLoadingLeave={isLoadingAnnualLeave}
                  onShowToast={showToast}
                  currentUserInitials={userData?.[0]?.Initials}
                  onOpenSelfConfirmPanel={() => handleActionClick({ title: officeAttendanceButtonText, icon: 'Attendance' })}
                  onConfirmAttendance={async (initials: string, weekStart: string, attendanceDays: string) => {
                    const res = await fetch('/api/attendance/updateAttendance', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ initials, weekStart, attendanceDays }),
                    });
                    if (!res.ok) throw new Error(`Failed: ${res.status}`);
                    const json = await res.json();
                    if (!json?.success || !json.record) throw new Error('Unexpected response');
                    const rec = json.record;
                    const mapped: AttendanceRecord = {
                      Attendance_ID: rec.Attendance_ID ?? 0,
                      Entry_ID: rec.Entry_ID ?? 0,
                      First_Name: rec.First_Name || initials,
                      Initials: rec.Initials || initials,
                      Level: (attendanceTeam.find((t: any) => t.Initials === (rec.Initials || initials))?.Level) || '',
                      Week_Start: rec.Week_Start || weekStart,
                      Week_End: rec.Week_End || '',
                      ISO_Week: rec.ISO_Week ?? 0,
                      Attendance_Days: rec.Attendance_Days || attendanceDays,
                      Confirmed_At: rec.Confirmed_At || new Date().toISOString(),
                    };
                    handleAttendanceUpdated([mapped]);
                  }}
                  onUnconfirmAttendance={async (initials: string, weekStart: string) => {
                    const res = await fetch('/api/attendance/unconfirmAttendance', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ initials, weekStart }),
                    });
                    if (!res.ok) throw new Error(`Failed: ${res.status}`);
                    const json = await res.json();
                    if (!json?.success) throw new Error('Unexpected response');
                    // Remove confirmed state from local records — clear everything so no stale Status/Attendance_Days lingers
                    const cleared: AttendanceRecord = {
                      Attendance_ID: 0,
                      Entry_ID: 0,
                      First_Name: initials,
                      Initials: initials,
                      Level: '',
                      Week_Start: weekStart,
                      Week_End: '',
                      ISO_Week: 0,
                      Attendance_Days: null as any,
                      Confirmed_At: null,
                      Status: null as any,
                    } as AttendanceRecord;
                    handleAttendanceUpdated([cleared]);
                  }}
                />
                </LivePulse>
              </div>
            </Suspense>
        </div>
      </div>

      {/* Transactions & Balances - only show in local environment; hidden by the
          `hideAsanaAndTransactions` layout toggle. */}
      {useLocalData && !hideAsanaAndTransactions && (
        <div style={{ margin: '6px 8px' }}>
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
        <Suspense fallback={
          <div style={{ minHeight: 180, padding: '12px 0' }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}>
                <div style={{ width: 120, height: 14, background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderRadius: 2, animation: 'homeSkelPulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.15}s` }} />
                <div style={{ width: 60, height: 14, background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderRadius: 2, animation: 'homeSkelPulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.15 + 0.05}s` }} />
              </div>
            ))}
          </div>
        }>
          <OutstandingBalancesList 
            balances={filteredBalancesForPanel} 
            matters={allMatters ?? []} 
          />
        </Suspense>
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
          setBespokePanelWidth('85%');
          resetQuickActionsSelection();
        }}
        title={bespokePanelTitle}
        description={bespokePanelDescription}
        width={bespokePanelWidth}
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

      <ReleaseNotesModal
        isOpen={showReleaseNotes}
        onClose={() => setShowReleaseNotes(false)}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};

export default React.memo(Home);