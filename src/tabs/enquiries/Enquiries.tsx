// Clean admin tools - removed beaker and legacy toggle
import React, { useState, useMemo, useCallback, useEffect, useRef, useTransition, useDeferredValue } from 'react';
import ReactDOM from 'react-dom';
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
  ActionButton,
  IButtonStyles,
  Modal,
  initializeIcons,
  TooltipHost,
} from '@fluentui/react';
import OperationStatusToast from './pitch-builder/OperationStatusToast';
import IconAreaFilter from '../../components/filter/IconAreaFilter';
import PitchScenarioBadge, { getScenarioColor } from '../../components/PitchScenarioBadge';
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
import InlineWorkbench from '../instructions/InlineWorkbench';
import { GroupedEnquiry, getMixedEnquiryDisplay, isGroupedEnquiry } from './enquiryGrouping';
import PitchBuilder from './PitchBuilder';
import EnquiryTimeline from './EnquiryTimeline';
import { colours } from '../../app/styles/colours';
import InlineExpansionChevron from '../../components/InlineExpansionChevron';
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

const DEMO_MODE_STORAGE_KEY = 'helix-hub-demo-enquiry-mode';

// Synthetic demo enquiry for demos/testing - always available, not from database
const DEV_PREVIEW_TEST_ENQUIRY: Enquiry = {
  ID: 'DEMO-ENQ-0001',
  Date_Created: '2026-01-01',
  Touchpoint_Date: '2026-01-01',
  Email: 'demo.prospect@helix-law.com',
  Area_of_Work: 'Commercial',
  Type_of_Work: 'Contract Dispute',
  Method_of_Contact: 'Email',
  Point_of_Contact: 'team@helix-law.com',
  First_Name: 'Demo',
  Last_Name: 'Prospect',
  Phone_Number: '07000000000',
  Rating: 'Neutral',
  Value: '25000',
  Ultimate_Source: 'Google Ads',
  Initial_first_call_notes: 'Demo enquiry for testing. Client enquiring about a contract dispute with their supplier. They have been invoiced for goods they did not receive and are seeking advice on how to challenge the invoice and potentially recover costs. Urgent matter - supplier threatening legal action within 14 days.',
};

const shimmerStyle = `
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.shimmer {
  background: linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.15), rgba(255,255,255,0.05));
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
`;

const pipelineCarouselStyle = `
.pipeline-carousel {
  position: relative;
  overflow: hidden;
  width: 100%;
}
.pipeline-carousel-track {
  display: flex;
  transition: transform 0.2s ease-out;
  height: 100%;
}
.pipeline-carousel-nav {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1;
  opacity: 0.6;
  transition: opacity 0.15s ease;
}
.pipeline-carousel-nav:hover {
  opacity: 1;
}
.pipeline-chip {
  transition: filter 0.1s ease;
}
.pipeline-chip:hover {
  filter: brightness(1.15);
}
.pipeline-chip-reveal {
  gap: 0;
  position: relative;
  min-height: 22px;
  align-items: center;
}
/* Connector dash between chips */
.pipeline-connector {
  position: absolute;
  left: -9px;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 1px;
  border-radius: 0.5px;
  background: rgba(100, 116, 139, 0.22);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}
/* Completed connector - solid green */
.pipeline-connector.connector-done {
  background: ${colours.green};
  opacity: 0.7;
}
.pipeline-row-hover-ready .pipeline-connector,
.pipeline-chip-reveal:hover .pipeline-connector {
  width: 11px;
  left: -11px;
  background: rgba(100, 116, 139, 0.4);
  box-shadow: 0 0 2px rgba(100, 116, 139, 0.18);
}
/* Preserve green for completed connectors on hover */
.pipeline-row-hover-ready .pipeline-connector.connector-done,
.pipeline-chip-reveal:hover .pipeline-connector.connector-done {
  background: ${colours.green};
}
.pipeline-chip-box {
  display: inline-flex;
  align-items: center;
  gap: 0;
  padding: 1px 4px;
  border: 1px solid transparent;
  border-radius: 2px;
  transition: gap 0.25s ease, padding 0.25s ease, border-color 0.25s ease;
  will-change: gap, padding, border-color;
  overflow: visible;
}
/* Cascade effect: staggered border reveal on row hover */
.pipeline-row-hover-ready .pipeline-chip-box {
  gap: 4px;
  padding: 1px 6px 1px 4px;
  border-color: rgba(100, 116, 139, 0.25);
}
.pipeline-row-hover-ready [data-chip-index="0"] .pipeline-chip-box { transition-delay: 0ms; }
.pipeline-row-hover-ready [data-chip-index="1"] .pipeline-chip-box { transition-delay: 50ms; }
.pipeline-row-hover-ready [data-chip-index="2"] .pipeline-chip-box { transition-delay: 100ms; }
.pipeline-row-hover-ready [data-chip-index="3"] .pipeline-chip-box { transition-delay: 150ms; }
.pipeline-row-hover-ready [data-chip-index="4"] .pipeline-chip-box { transition-delay: 200ms; }
.pipeline-row-hover-ready [data-chip-index="5"] .pipeline-chip-box { transition-delay: 250ms; }
.pipeline-row-hover-ready [data-chip-index="6"] .pipeline-chip-box { transition-delay: 300ms; }
/* Also trigger on individual chip hover for non-row scenarios */
.pipeline-chip-reveal:hover .pipeline-chip-box {
  gap: 4px;
  padding: 1px 6px 1px 4px;
  border-color: rgba(100, 116, 139, 0.25);
}
.pipeline-chip-label {
  display: inline-flex;
  gap: 4px;
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  white-space: nowrap;
  transition: max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
  transition-delay: 0ms; /* Reset delay on leave */
  font-size: 10px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: 0.2px;
  will-change: max-width, opacity;
}
/* Staggered label reveal on row hover */
.pipeline-row-hover-ready [data-chip-index="0"] .pipeline-chip-label { max-width: 80px !important; opacity: 0.9 !important; transition-delay: 0ms; }
.pipeline-row-hover-ready [data-chip-index="1"] .pipeline-chip-label { max-width: 80px !important; opacity: 0.9 !important; transition-delay: 50ms; }
.pipeline-row-hover-ready [data-chip-index="2"] .pipeline-chip-label { max-width: 80px !important; opacity: 0.9 !important; transition-delay: 100ms; }
.pipeline-row-hover-ready [data-chip-index="3"] .pipeline-chip-label { max-width: 80px !important; opacity: 0.9 !important; transition-delay: 150ms; }
.pipeline-row-hover-ready [data-chip-index="4"] .pipeline-chip-label { max-width: 80px !important; opacity: 0.9 !important; transition-delay: 200ms; }
.pipeline-row-hover-ready [data-chip-index="5"] .pipeline-chip-label { max-width: 80px !important; opacity: 0.9 !important; transition-delay: 250ms; }
.pipeline-row-hover-ready [data-chip-index="6"] .pipeline-chip-label { max-width: 80px !important; opacity: 0.9 !important; transition-delay: 300ms; }
/* Also trigger on individual chip hover */
.pipeline-chip-reveal:hover .pipeline-chip-label,
.pipeline-chip-reveal:focus-visible .pipeline-chip-label {
  max-width: 80px !important;
  opacity: 0.9 !important;
}
/* Subtle pulse for next-action chips - gentle opacity breathe effect */
@keyframes next-action-breathe {
  0%, 100% {
    opacity: 0.5;
    filter: brightness(1);
  }
  50% {
    opacity: 1;
    filter: brightness(1.15);
  }
}
.next-action-subtle-pulse .pipeline-chip-box,
.next-action-subtle-pulse > button,
.next-action-subtle-pulse > div {
  animation: next-action-breathe 2s ease-in-out infinite;
}
@keyframes pitch-cta-pulse {
  0%, 100% {
    border-color: rgba(251, 191, 36, 0.35);
    background: rgba(251, 191, 36, 0.08);
  }
  50% {
    border-color: rgba(251, 191, 36, 0.55);
    background: rgba(251, 191, 36, 0.14);
  }
}
`;

// Inject the shimmer CSS into the document head if it doesn't exist
if (typeof document !== 'undefined' && !document.querySelector('#shimmer-styles')) {
  const style = document.createElement('style');
  style.id = 'shimmer-styles';
  style.textContent = shimmerStyle;
  document.head.appendChild(style);
}

// Inject the pipeline carousel CSS
if (typeof document !== 'undefined' && !document.querySelector('#pipeline-carousel-styles')) {
  const style = document.createElement('style');
  style.id = 'pipeline-carousel-styles';
  style.textContent = pipelineCarouselStyle;
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

// Helper components for Pipeline Chips
const renderPipelineIcon = (iconName: string, color: string, size: number = 14) => {
  if (iconName === 'CurrencyPound') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          fontSize: Math.max(10, size - 2),
          fontWeight: 700,
          lineHeight: 1,
          color,
        }}
      >
        £
      </span>
    );
  }

  return <Icon iconName={iconName} styles={{ root: { fontSize: size, color } }} />;
};

const combineDateAndTime = (dateValue: unknown, timeValue?: unknown): Date | null => {
  if (!dateValue) return null;
  const base = new Date(dateValue as any);
  if (isNaN(base.getTime())) return null;

  if (!timeValue) return base;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let milliseconds = 0;

  if (timeValue instanceof Date) {
    hours = timeValue.getHours();
    minutes = timeValue.getMinutes();
    seconds = timeValue.getSeconds();
    milliseconds = timeValue.getMilliseconds();
  } else {
    const timeString = String(timeValue);
    const timeDate = new Date(timeString);
    if (!isNaN(timeDate.getTime())) {
      hours = timeDate.getHours();
      minutes = timeDate.getMinutes();
      seconds = timeDate.getSeconds();
      milliseconds = timeDate.getMilliseconds();
    } else {
      const parts = timeString.split(':').map(v => Number(v));
      if (Number.isFinite(parts[0])) hours = parts[0];
      if (Number.isFinite(parts[1])) minutes = parts[1];
      if (Number.isFinite(parts[2])) seconds = parts[2];
    }
  }

  const combined = new Date(base);
  combined.setHours(hours, minutes, seconds, milliseconds);
  return combined;
};

interface MiniChipProps {
  shortLabel: string;
  fullLabel: string;
  done: boolean;
  inProgress?: boolean;
  color: string;
  title: string;
  iconName: string;
  statusText?: string;
  subtitle?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  isNextAction?: boolean;
  details?: { label: string; value: string }[];
  showConnector?: boolean;
  prevDone?: boolean; // Whether the previous chip in the pipeline is done
  // External deps
  isDarkMode: boolean;
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
}

const MiniPipelineChip = ({
  shortLabel,
  fullLabel,
  done,
  inProgress,
  color,
  title,
  iconName,
  statusText,
  subtitle,
  onClick,
  isNextAction,
  details,
  showConnector,
  prevDone,
  isDarkMode,
  onMouseEnter,
  onMouseMove,
  onMouseLeave
}: MiniChipProps) => {
  const isActiveChip = Boolean(done || inProgress || isNextAction);
  const inactiveColor = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)';
  // Use neutral grey for next-action and in-progress/pending (both get pulse effect)
  const activeColor = (inProgress || isNextAction) ? colours.greyText : color;
  const iconColor = (done || inProgress || isNextAction) ? activeColor : inactiveColor;
  
  // Connector state: done (green) if both prev and current are done
  const connectorDone = prevDone && done;
  const connectorClass = `pipeline-connector${connectorDone ? ' connector-done' : ''}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`pipeline-chip pipeline-chip-reveal${(isNextAction || inProgress) ? ' next-action-subtle-pulse' : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: 24,
        height: 'auto',
        padding: 0,
        borderRadius: 0,
        border: 'none',
        background: 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'inherit',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {/* Subtle connector dot to previous chip */}
      {showConnector && (
        <span className={connectorClass} />
      )}
      <span className="pipeline-chip-box">
        {renderPipelineIcon(iconName, iconColor, 14)}
        <span
          className="pipeline-chip-label"
          style={{ color: iconColor }}
        >
          {shortLabel}
        </span>
      </span>
    </button>
  );
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
  demoModeEnabled?: boolean;
  onTeamWideEnquiriesLoaded?: (enquiries: Enquiry[]) => void;
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
  demoModeEnabled: demoModeEnabledProp,
  onTeamWideEnquiriesLoaded,
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

  const [demoModeEnabledLocal, setDemoModeEnabledLocal] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const demoModeEnabled = typeof demoModeEnabledProp === 'boolean' ? demoModeEnabledProp : demoModeEnabledLocal;

  // Map enquiry ID -> InlineWorkbench item (instruction + attached domains)
  // This is intentionally lightweight and read-only for the Prospects view.
  const inlineWorkbenchByEnquiryId = useMemo(() => {
    const result = new Map<string, any>();
    if (!instructionData) return result;

    const normaliseId = (value: unknown): string | null => {
      const s = String(value ?? '').trim();
      return s.length > 0 ? s : null;
    };

    // Global indexes (Deals are the join point: Deal.InstructionRef -> Instructions.InstructionRef)
    const instructionByRef = new Map<string, any>();
    const dealByRef = new Map<string, any>();
    const dealsByProspectId = new Map<string, any[]>();

    (instructionData as any[]).forEach((prospect) => {
      const instructions: any[] = Array.isArray(prospect?.instructions) ? prospect.instructions : [];
      const deals: any[] = Array.isArray(prospect?.deals) ? prospect.deals : [];

      instructions.forEach((inst) => {
        const ref = normaliseId(inst?.InstructionRef ?? inst?.instructionRef);
        if (ref && !instructionByRef.has(ref)) {
          instructionByRef.set(ref, inst);
        }
      });

      deals.forEach((deal) => {
        const ref = normaliseId(deal?.InstructionRef ?? deal?.instructionRef);
        if (ref && !dealByRef.has(ref)) {
          dealByRef.set(ref, deal);
        }
        const pid = normaliseId(deal?.ProspectId ?? deal?.prospectId);
        if (pid) {
          const arr = dealsByProspectId.get(pid) || [];
          arr.push(deal);
          dealsByProspectId.set(pid, arr);
        }
      });
    });

    const scoreWorkbenchItem = (workbenchItem: any): number => {
      const inst = workbenchItem?.instruction;
      const matters = workbenchItem?.matters;
      const deal = workbenchItem?.deal;
      const hasInstructionRef = Boolean(inst?.InstructionRef || inst?.instructionRef);
      const hasMatter = Boolean(inst?.MatterId || inst?.matterId) || (Array.isArray(matters) && matters.length > 0);
      const hasDeal = Boolean(deal);
      return (hasMatter ? 2 : 0) + (hasInstructionRef ? 1 : 0) + (hasDeal ? 1 : 0);
    };

    (instructionData as any[]).forEach((prospect) => {
      const instructions: any[] = Array.isArray(prospect?.instructions) ? prospect.instructions : [];
      const deals: any[] = Array.isArray(prospect?.deals) ? prospect.deals : [];

      const riskAssessments: any[] = Array.isArray(prospect?.riskAssessments)
        ? prospect.riskAssessments
        : (Array.isArray(prospect?.compliance) ? prospect.compliance : []);

      const idVerifications: any[] = Array.isArray(prospect?.idVerifications)
        ? prospect.idVerifications
        : (Array.isArray(prospect?.electronicIDChecks) ? prospect.electronicIDChecks : []);

      const registerForEnquiryId = (enquiryId: string, inst: any | null, dealOverride?: any | null) => {
        if (!enquiryId) return;

        const localDealByProspect = deals.find((d) => normaliseId(d?.ProspectId ?? d?.prospectId) === enquiryId) || null;
        const globalDealsByProspect = dealsByProspectId.get(enquiryId) || [];

        const matchingDeal =
          dealOverride ||
          localDealByProspect ||
          globalDealsByProspect[0] ||
          deals[0] ||
          null;

        const matchingDealRef = normaliseId(matchingDeal?.InstructionRef ?? matchingDeal?.instructionRef);
        const matchingInstructionRef = normaliseId(inst?.InstructionRef ?? inst?.instructionRef);

        const matchingInstruction =
          inst ||
          (matchingDealRef ? (instructionByRef.get(matchingDealRef) || null) : null) ||
          (matchingInstructionRef ? (instructionByRef.get(matchingInstructionRef) || null) : null) ||
          instructions[0] ||
          null;

        // If we found an instruction but not a deal yet, try the join path by InstructionRef
        const instructionRef = normaliseId(matchingInstruction?.InstructionRef ?? matchingInstruction?.instructionRef);
        const joinedDeal = !matchingDeal && instructionRef ? (dealByRef.get(instructionRef) || null) : null;
        const finalDeal = matchingDeal || joinedDeal;

        if (!matchingInstruction && !finalDeal) return;

        const workbenchItem = {
          instruction: matchingInstruction,
          deal: finalDeal,
          clients: prospect?.jointClients || finalDeal?.jointClients || prospect?.clients || [],
          documents: prospect?.documents || matchingInstruction?.documents || [],
          payments: prospect?.payments || matchingInstruction?.payments || [],
          eid: idVerifications[0] ?? null,
          eids: idVerifications,
          risk: riskAssessments[0] ?? null,
          matters: prospect?.matters || matchingInstruction?.matters || [],
          prospectId: enquiryId,
          ProspectId: enquiryId,
        };

        const existing = result.get(enquiryId);
        if (!existing || scoreWorkbenchItem(workbenchItem) > scoreWorkbenchItem(existing)) {
          result.set(enquiryId, workbenchItem);
        }
      };

      // Helper to extract ProspectId from InstructionRef pattern (HLX-{ProspectId}-{Passcode})
      const extractProspectIdFromRef = (ref: unknown): string | null => {
        if (typeof ref !== 'string') return null;
        const match = ref.match(/^HLX-(\d+)-\d+$/);
        return match ? match[1] : null;
      };

      // Preferred linkage: per-instruction ProspectId/prospectId
      instructions.forEach((inst) => {
        const enquiryId = normaliseId(inst?.ProspectId ?? inst?.prospectId) 
          || extractProspectIdFromRef(inst?.InstructionRef ?? inst?.instructionRef);
        if (!enquiryId) return;
        registerForEnquiryId(enquiryId, inst);
      });

      // Also allow deal-only linkage (pitches)
      deals.forEach((deal) => {
        const enquiryId = normaliseId(deal?.ProspectId ?? deal?.prospectId)
          || extractProspectIdFromRef(deal?.InstructionRef ?? deal?.instructionRef);
        if (!enquiryId) return;
        const matchingInst = (deal?.InstructionRef ? (instructionByRef.get(String(deal.InstructionRef)) || null) : null) || null;
        registerForEnquiryId(enquiryId, matchingInst, deal);
      });

      // Fallback linkage: some datasets carry enquiry ID on the prospect wrapper itself
      const wrapperId = normaliseId(prospect?.prospectId) 
        || extractProspectIdFromRef(prospect?.prospectId);
      if (wrapperId && (instructions.length > 0 || deals.length > 0)) {
        registerForEnquiryId(wrapperId, instructions[0] ?? null, deals[0] ?? null);
      }
    });

    if (demoModeEnabled) {
      const currentUserEmail = userData && userData[0] && userData[0].Email
        ? userData[0].Email
        : 'lz@helix-law.com';
      const demoCases = [
        {
          id: 'DEMO-ENQ-0001',
          instructionRef: null,
          serviceDescription: 'Contract Dispute',
          amount: 1500,
          stage: 'enquiry',
          eidStatus: 'pending',
          eidResult: 'pending',
          internalStatus: 'pending',
          riskResult: 'pending',
          hasMatter: false,
          hasPayment: false,
          documents: 0,
        },
        {
          id: 'DEMO-ENQ-0002',
          instructionRef: 'HLX-DEMO-0002-00001',
          serviceDescription: 'Lease Renewal',
          amount: 3200,
          stage: 'matter-opened',
          eidStatus: 'complete',
          eidResult: 'passed',
          internalStatus: 'paid',
          riskResult: 'low',
          hasMatter: true,
          hasPayment: true,
          documents: 2,
        },
      ];

      demoCases.forEach((demoCase) => {
        // Generate demo dates relative to now
        const demoInstructionDate = new Date();
        demoInstructionDate.setDate(demoInstructionDate.getDate() - 3); // 3 days ago
        
        const instruction = demoCase.instructionRef ? {
          InstructionRef: demoCase.instructionRef,
          ProspectId: demoCase.id,
          Stage: demoCase.stage,
          SubmissionDate: demoInstructionDate.toISOString(),
          SubmissionTime: demoInstructionDate.toISOString(),
          EIDStatus: demoCase.eidStatus,
          EIDOverallResult: demoCase.eidResult,
          InternalStatus: demoCase.internalStatus,
          MatterId: demoCase.hasMatter ? 'MAT-DEMO-001' : undefined,
        } : undefined;
        const deal = {
          ProspectId: demoCase.id,
          InstructionRef: demoCase.instructionRef,
          Amount: demoCase.amount,
          ServiceDescription: demoCase.serviceDescription,
          DealStatus: demoCase.internalStatus,
        };
        const payments = demoCase.hasPayment ? [{
          payment_status: 'succeeded',
          internal_status: 'paid',
          amount: demoCase.amount,
        }] : [];
        const riskAssessments = [{ RiskAssessmentResult: demoCase.riskResult }];
        const documents = Array.from({ length: demoCase.documents }).map((_, idx) => ({
          id: `demo-doc-${demoCase.id}-${idx + 1}`,
          filename: idx === 0 ? 'Demo_ID_Document.pdf' : 'Demo_Engagement_Letter.pdf',
        }));
        const matters = demoCase.hasMatter ? [{ MatterId: 'MAT-DEMO-001', DisplayNumber: 'HELIX01-01' }] : [];

        result.set(demoCase.id, {
          instruction,
          deal,
          clients: [{
            Email: 'demo.client@helix-law.com',
            ClientEmail: 'demo.client@helix-law.com',
            FirstName: 'Demo',
            LastName: 'Client',
          }],
          documents,
          payments,
          eid: { status: demoCase.eidStatus },
          eids: [{ status: demoCase.eidStatus }],
          risk: riskAssessments[0],
          riskAssessments,
          matters,
          team: currentUserEmail,
          prospectId: demoCase.id,
          ProspectId: demoCase.id,
        });
      });
    }

    return result;
  }, [instructionData, demoModeEnabled, userData]);

  // Legacy used ActiveCampaign ID as internal ID; new space stores it in ACID.
  // deal.ProspectId = ActiveCampaign ID = enquiry.ACID
  const getEnquiryWorkbenchKey = useCallback((enquiry: Enquiry): string | null => {
    const acid = (enquiry as any).ACID || (enquiry as any).acid || (enquiry as any).Acid;
    const fallbackId = (enquiry as any).ProspectId || (enquiry as any).prospectId || enquiry.ID;
    const key = acid || fallbackId;
    return key ? String(key) : null;
  }, []);

  // Look up workbench item by enquiry's ACID (maps to deal.ProspectId). Fallback to enquiry ID when ACID missing.
  const getEnquiryWorkbenchItem = useCallback((enquiry: Enquiry): any | undefined => {
    const acid = (enquiry as any).ACID || (enquiry as any).acid || (enquiry as any).Acid;
    const fallbackId = (enquiry as any).ProspectId || (enquiry as any).prospectId || enquiry.ID;
    const key = acid || fallbackId;
    if (!key) return undefined;
    return inlineWorkbenchByEnquiryId.get(String(key));
  }, [inlineWorkbenchByEnquiryId]);

  const PROSPECTS_INSTRUCTION_REF_KEY = 'navigateToInstructionRef';
  const PROSPECTS_INSTRUCTION_ACTION_KEY = 'navigateToInstructionAction';
  const PROSPECTS_INSTRUCTION_TAB_KEY = 'navigateToInstructionTab';
  const PROSPECTS_INSTRUCTION_DOC_KEY = 'navigateToInstructionDoc';

  type InstructionActionKind =
    | 'workbench'
    | 'trigger-eid'
    | 'open-risk'
    | 'open-matter'
    | 'open-id-review'
    | 'preview-document';

  const dispatchInstructionAction = useCallback((action: InstructionActionKind, options: {
    instructionRef?: string | null;
    tab?: string | null;
    doc?: any;
  }) => {
    const instructionRef = (options.instructionRef || '').trim();
    if (!instructionRef) return;
    try {
      localStorage.setItem(PROSPECTS_INSTRUCTION_REF_KEY, instructionRef);
      localStorage.setItem(PROSPECTS_INSTRUCTION_ACTION_KEY, action);
      if (options.tab) {
        localStorage.setItem(PROSPECTS_INSTRUCTION_TAB_KEY, options.tab);
      } else {
        localStorage.removeItem(PROSPECTS_INSTRUCTION_TAB_KEY);
      }
      if (options.doc) {
        localStorage.setItem(PROSPECTS_INSTRUCTION_DOC_KEY, JSON.stringify(options.doc));
      } else {
        localStorage.removeItem(PROSPECTS_INSTRUCTION_DOC_KEY);
      }
    } catch {
      // ignore storage failures
    }
    window.dispatchEvent(new CustomEvent('navigateToInstructions'));
    window.dispatchEvent(new CustomEvent('navigateToInstructionAction'));
  }, []);

  const workbenchHandlers = useMemo(() => ({
    onTriggerEID: (instructionRef: string) => {
      dispatchInstructionAction('trigger-eid', { instructionRef, tab: 'identity' });
    },
    onOpenIdReview: (instructionRef: string) => {
      dispatchInstructionAction('open-id-review', { instructionRef, tab: 'identity' });
    },
    onOpenRiskAssessment: (instruction: any) => {
      const instructionRef = instruction?.InstructionRef || instruction?.instructionRef || '';
      dispatchInstructionAction('open-risk', { instructionRef, tab: 'risk' });
    },
    onOpenMatter: (instruction: any) => {
      const instructionRef = instruction?.InstructionRef || instruction?.instructionRef || '';
      dispatchInstructionAction('open-matter', { instructionRef, tab: 'matter' });
    },
    onDocumentPreview: (doc: any) => {
      const instructionRef = doc?.InstructionRef || doc?.instructionRef || doc?.instruction_ref || '';
      dispatchInstructionAction('preview-document', { instructionRef, tab: 'documents', doc });
    },
  }), [dispatchInstructionAction]);

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
  // Guard against render-loop fetches when shared IDs need team-wide history
  const hasTriggeredSharedHistoryFetch = useRef<boolean>(false);

  // Debug: track why we fetched team-wide data (avoid PII in logs)
  const lastTeamWideFetchReasonRef = useRef<string>('');

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
  // Track last enrichment attempt per enquiry to allow retries after failures
  const enrichmentLastAttemptRef = useRef<Map<string, number>>(new Map());
  
  // Track visible enquiry IDs (only enrich what's in viewport)
  const [visibleEnquiryIds, setVisibleEnquiryIds] = useState<Set<string>>(new Set());
  
  // Track enrichment progress for UI feedback
  const [isEnriching, setIsEnriching] = useState<boolean>(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState<{ current: number; total: number } | null>(null);

  // Table view: Track expanded notes by enquiry ID
  const [expandedNotesInTable, setExpandedNotesInTable] = useState<Set<string>>(new Set());
  
  
  // Table view: Sorting state
  type SortColumn = 'date' | 'aow' | 'id' | 'value' | 'contact' | 'pipeline' | null;
  type SortDirection = 'asc' | 'desc';
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Pipeline filter state - for filtering by pipeline stages (yes/no toggles)
  type EnquiryPipelineStage = 'poc' | 'pitched' | 'instructed' | 'idcheck' | 'paid' | 'risk' | 'matter';
  type EnquiryPipelineStatus = 'yes' | 'no';
  const [enquiryPipelineFilters, setEnquiryPipelineFilters] = useState<Map<EnquiryPipelineStage, EnquiryPipelineStatus>>(new Map());

  type PipelineChipLabelMode = 'full' | 'short' | 'icon';
  const pipelineGridMeasureRef = useRef<HTMLDivElement | null>(null);
  const [pipelineChipLabelMode, setPipelineChipLabelMode] = useState<PipelineChipLabelMode>('short');
  // Number of pipeline chips that fit in the available width (7 = all chips fit after merging teams+claim)
  // Start with 3 to ensure carousel shows by default, then ResizeObserver adjusts
  const [visiblePipelineChipCount, setVisiblePipelineChipCount] = useState<number>(3);
  const pipelineMeasureRetryRef = useRef(0);
  const pipelineMeasureRetryTimerRef = useRef<number | null>(null);
  // Counter to trigger re-measurement when returning from detail view
  const [pipelineRemeasureKey, setPipelineRemeasureKey] = useState<number>(0);
  // Minimum chip width at each mode (icon needs ~32px, short ~90px [increased to prevent squish], full ~110px)
  // We prioritize labels with carousel vs showing all icons
  const CHIP_MIN_WIDTHS = { icon: 32, short: 90, full: 110 };
  const ACTIONS_COLUMN_WIDTH_PX = 152;

  const TABLE_GRID_TEMPLATE_COLUMNS = `32px 90px 56px 90px 1.4fr 2.5fr ${ACTIONS_COLUMN_WIDTH_PX}px`;
  const TABLE_GRID_GAP_PX = 12;
  const PIPELINE_CHIP_MIN_WIDTH_PX = CHIP_MIN_WIDTHS[pipelineChipLabelMode] ?? CHIP_MIN_WIDTHS.short;

  useEffect(() => {
    if (!isActive) return;
    const bump = () => setPipelineRemeasureKey((v) => v + 1);
    const raf = requestAnimationFrame(bump);
    const timeout = setTimeout(bump, 400);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') bump();
    };
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isActive]);

  const pipelineStageUi = useMemo(() => {
    const entries: Array<{
      stage: EnquiryPipelineStage;
      fullLabel: string;
      shortLabel: string;
      iconName: string;
    }> = [
      { stage: 'poc', fullLabel: 'POC', shortLabel: 'POC', iconName: 'TeamsLogo' },
      { stage: 'pitched', fullLabel: 'Pitch', shortLabel: 'Pitch', iconName: 'Send' },
      { stage: 'instructed', fullLabel: 'Instructed', shortLabel: 'Inst', iconName: 'CheckMark' },
      { stage: 'idcheck', fullLabel: 'ID Check', shortLabel: 'ID', iconName: 'CheckMark' },
      { stage: 'paid', fullLabel: 'Payment', shortLabel: 'Pay', iconName: 'CurrencyPound' },
      { stage: 'risk', fullLabel: 'Risk', shortLabel: 'Risk', iconName: 'Shield' },
      { stage: 'matter', fullLabel: 'Matter', shortLabel: 'Matter', iconName: 'OpenFolderHorizontal' },
    ];
    return {
      entries,
      byStage: new Map(entries.map((e) => [e.stage, e])),
    };
  }, []);

  type PipelineHoverInfo = {
    x: number;
    y: number;
    title: string;
    status: string;
    subtitle?: string;
    color: string;
    iconName?: string;
    details?: { label: string; value: string }[];
  } | null;

  const [pipelineHover, setPipelineHover] = useState<PipelineHoverInfo>(null);

  useEffect(() => {
    if (!pipelineHover) return;

    const handleMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.closest('.pipeline-chip')) {
        setPipelineHover(null);
      }
    };

    const handleScroll = () => setPipelineHover(null);
    const handleBlur = () => setPipelineHover(null);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [pipelineHover]);

  const getPipelineHoverPosition = useCallback((target: EventTarget & HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const offset = 12;
    const estimatedWidth = 240;
    let x = rect.right + offset;
    let y = rect.top;

    if (typeof window !== 'undefined') {
      const maxX = window.innerWidth - estimatedWidth - 8;
      if (x > maxX) {
        x = rect.left - offset;
      }
      if (x < 8) x = 8;

      if (y < 8) y = 8;
      if (y > window.innerHeight - 8) y = window.innerHeight - 8;
    }

    return { x, y };
  }, []);

  const showPipelineHover = useCallback((event: React.MouseEvent, info: Omit<NonNullable<PipelineHoverInfo>, 'x' | 'y'>) => {
    const { x, y } = getPipelineHoverPosition(event.currentTarget as HTMLElement);
    setPipelineHover({
      ...info,
      x,
      y,
    });
  }, [getPipelineHoverPosition]);

  const movePipelineHover = useCallback((event: React.MouseEvent) => {
    setPipelineHover((prev) => prev);
  }, []);

  const hidePipelineHover = useCallback(() => {
    setPipelineHover(null);
  }, []);

  // POC filter - dropdown with team members (separate from toggle filters)
  // Declared here (before ResizeObserver effect) so it can be used in the effect's dependency array
  const [selectedPocFilter, setSelectedPocFilter] = useState<string | null>(null);
  const [isPocDropdownOpen, setIsPocDropdownOpen] = useState(false);

  useEffect(() => {
    const el = pipelineGridMeasureRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      if (pipelineMeasureRetryRef.current < 6) {
        pipelineMeasureRetryRef.current += 1;
        if (pipelineMeasureRetryTimerRef.current) {
          window.clearTimeout(pipelineMeasureRetryTimerRef.current);
        }
        pipelineMeasureRetryTimerRef.current = window.setTimeout(() => {
          setPipelineRemeasureKey((v) => v + 1);
        }, 120);
      }
      return;
    }

    // Track last measured width to avoid unnecessary state updates
    let lastMeasuredWidth = 0;
    
    // Calculate and apply measurement immediately on mount (avoid layout flash)
    const measureAndApply = () => {
      const rect = el.getBoundingClientRect();
      if (!rect.width) {
        if (pipelineMeasureRetryRef.current < 6) {
          pipelineMeasureRetryRef.current += 1;
          if (pipelineMeasureRetryTimerRef.current) {
            window.clearTimeout(pipelineMeasureRetryTimerRef.current);
          }
          pipelineMeasureRetryTimerRef.current = window.setTimeout(() => {
            setPipelineRemeasureKey((v) => v + 1);
          }, 120);
        }
        return;
      }
      pipelineMeasureRetryRef.current = 0;
      
      // Skip if width hasn't changed significantly (within 1px tolerance)
      if (Math.abs(rect.width - lastMeasuredWidth) < 1) return;
      lastMeasuredWidth = rect.width;

      const totalWidth = rect.width;
      const columnGap = 8;
      const navButtonWidth = 24;
      
      const minFull = CHIP_MIN_WIDTHS.full;
      const minShort = CHIP_MIN_WIDTHS.short;

      let nextMode: PipelineChipLabelMode = 'short';
      let nextCount = 7;

      // Width needed for N chips (no nav button - all 7 visible)
      const widthForChips = (count: number, chipWidth: number) => count * chipWidth + (count - 1) * columnGap;
      
      // Width needed for N chips + nav button (carousel mode)
      const widthForCarousel = (count: number, chipWidth: number) => 
        count * chipWidth + count * columnGap + navButtonWidth;

      // Check if all 7 chips fit (no carousel needed)
      if (totalWidth >= widthForChips(7, minFull)) {
        nextMode = 'full';
        nextCount = 7;
      } else if (totalWidth >= widthForChips(7, minShort)) {
        nextMode = 'short';
        nextCount = 7;
      } else {
        // Need carousel - calculate how many chips fit alongside the nav button
        // Work backwards from 6 down to find the max that fits
        nextMode = 'short';
        nextCount = 3; // minimum
        for (let n = 6; n >= 3; n--) {
          if (totalWidth >= widthForCarousel(n, minShort)) {
            nextCount = n;
            break;
          }
        }
      }

      setPipelineChipLabelMode((prev) => (prev === nextMode ? prev : nextMode));
      setVisiblePipelineChipCount(nextCount);
    };

    // Measure immediately on mount to prevent layout flash
    measureAndApply();
    requestAnimationFrame(measureAndApply);
    // Also measure after a short delay to catch late layout stabilization
    const delayedMeasure = setTimeout(measureAndApply, 100);
    
    // Debounced resize handler for smoother updates
    let resizeRaf: number | null = null;
    const handleResize = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        lastMeasuredWidth = 0; // Force remeasure on explicit resize
        measureAndApply();
      });
    };
    window.addEventListener('resize', handleResize);
    
    // Polling fallback - check every 500ms in case ResizeObserver misses changes
    const pollInterval = setInterval(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width && Math.abs(rect.width - lastMeasuredWidth) > 1) {
        measureAndApply();
      }
    }, 500);

    const observer = new ResizeObserver((items) => {
      const rect = items[0]?.contentRect;
      if (!rect) return;

      const totalWidth = rect.width;
      const columnGap = 8;
      const navButtonWidth = 24;
      
      const minFull = CHIP_MIN_WIDTHS.full;
      const minShort = CHIP_MIN_WIDTHS.short;

      let nextMode: PipelineChipLabelMode = 'short';
      let nextCount = 7;

      // Width needed for N chips (no nav button - all 7 visible)
      const widthForChips = (count: number, chipWidth: number) => count * chipWidth + (count - 1) * columnGap;
      
      // Width needed for N chips + nav button (carousel mode)
      const widthForCarousel = (count: number, chipWidth: number) => 
        count * chipWidth + count * columnGap + navButtonWidth;

      // Check if all 7 chips fit (no carousel needed)
      if (totalWidth >= widthForChips(7, minFull)) {
        nextMode = 'full';
        nextCount = 7;
      } else if (totalWidth >= widthForChips(7, minShort)) {
        nextMode = 'short';
        nextCount = 7;
      } else {
        // Need carousel - calculate how many chips fit alongside the nav button
        // Work backwards from 6 down to find the max that fits
        nextMode = 'short';
        nextCount = 3; // minimum
        for (let n = 6; n >= 3; n--) {
          if (totalWidth >= widthForCarousel(n, minShort)) {
            nextCount = n;
            break;
          }
        }
      }

      setPipelineChipLabelMode((prev) => (prev === nextMode ? prev : nextMode));
      setVisiblePipelineChipCount(nextCount);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(delayedMeasure);
      clearInterval(pollInterval);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      if (pipelineMeasureRetryTimerRef.current) {
        window.clearTimeout(pipelineMeasureRetryTimerRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [viewMode, pipelineRemeasureKey, enquiryPipelineFilters.size, selectedPocFilter]); // Re-run when returning from detail view or filters change
  
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
        // Deselect (clear) currently causes a crash in some cases.
        // Keep the last stable state and rely on the global Clear Filters button to remove.
        newFilters.set(stage, 'no');
      }
      
      return newFilters;
    });
    // Reset carousel to start when filter changes to ensure consistent view
    setPipelineScrollOffset(0);
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
  const [hoveredDayKeyReady, setHoveredDayKeyReady] = useState<string | null>(null);
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null);
  const [hoveredRowKeyReady, setHoveredRowKeyReady] = useState<string | null>(null);

  // Some pipeline chips mount during the same render that applies the hover class.
  // Delaying the "reveal" by one animation frame ensures width/opacity transitions run.
  useEffect(() => {
    setHoveredRowKeyReady(null);
    if (!hoveredRowKey) return;

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setHoveredRowKeyReady(hoveredRowKey);
      return;
    }

    const raf = window.requestAnimationFrame(() => setHoveredRowKeyReady(hoveredRowKey));
    return () => window.cancelAnimationFrame(raf);
  }, [hoveredRowKey]);

  // Same delayed reveal for day separator hover (affects all items in that day)
  useEffect(() => {
    setHoveredDayKeyReady(null);
    if (!hoveredDayKey) return;

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setHoveredDayKeyReady(hoveredDayKey);
      return;
    }

    const raf = window.requestAnimationFrame(() => setHoveredDayKeyReady(hoveredDayKey));
    return () => window.cancelAnimationFrame(raf);
  }, [hoveredDayKey]);
  
  // Pipeline chips carousel: single global offset (header + all rows scroll together)
  const [pipelineScrollOffset, setPipelineScrollOffset] = useState<number>(0);
  
  // Pipeline carousel scroll handler - advances ALL rows together (synchronized)
  const advancePipelineScroll = useCallback((_enquiryId: string, totalChips: number, visibleChips: number) => {
    // Note: enquiryId param kept for API compatibility but now ignored - all rows use same offset
    setPipelineScrollOffset(prev => {
      const maxOffset = Math.max(0, totalChips - visibleChips);
      // Cycle: if at max, go back to 0; otherwise advance by 1
      return prev >= maxOffset ? 0 : prev + 1;
    });
  }, []);
  
  // Get visible chip indices (same offset for all rows - synchronized)
  const getPipelineScrollOffset = useCallback((_enquiryId: string): number => {
    // Note: enquiryId param kept for API compatibility but now ignored
    return pipelineScrollOffset;
  }, [pipelineScrollOffset]);
  
  // Reset carousel offset when visible count changes (prevents invalid offset)
  useEffect(() => {
    const maxOffset = Math.max(0, 7 - visiblePipelineChipCount);
    setPipelineScrollOffset(prev => prev > maxOffset ? 0 : prev);
  }, [visiblePipelineChipCount]);
  
  // Check if pipeline needs carousel navigation for a row
  const pipelineNeedsCarousel = visiblePipelineChipCount < 7;
  
  // Helper: Render pipeline chips with carousel if needed
  // This wraps chips in a scrollable container when width is constrained
  const renderPipelineCarouselWrapper = useCallback((
    enquiryId: string,
    children: React.ReactNode[],
    isDark: boolean
  ) => {
    const totalChips = 7;
    const offset = getPipelineScrollOffset(enquiryId);
    const showNav = pipelineNeedsCarousel;
    const hasMoreChips = showNav && offset < totalChips - visiblePipelineChipCount;
    const isAtStart = offset === 0;
    
    // Calculate which chips to show
    const visibleStart = offset;
    const visibleEnd = offset + visiblePipelineChipCount;
    
    // Grid template for visible chips only
    const gridCols = showNav 
      ? `repeat(${visiblePipelineChipCount}, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`
      : `repeat(7, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`;
    
    return (
      <div style={{ position: 'relative', height: '100%', width: '100%', minWidth: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            columnGap: 8,
            alignItems: 'center',
            width: '100%',
            minWidth: 0,
            height: '100%',
          }}
        >
          {showNav 
            ? children.slice(visibleStart, visibleEnd)
            : children}
          
          {/* Navigation chevron / gutter */}
          {showNav ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                advancePipelineScroll(enquiryId, totalChips, visiblePipelineChipCount);
              }}
              title={hasMoreChips ? `View more stages (${totalChips - visibleEnd} hidden)` : 'Back to start'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: 22,
                padding: 0,
                border: `1px solid ${isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)'}`,
                borderRadius: 0,
                background: hasMoreChips 
                  ? (isDark ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                  : (isDark ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.04)'),
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                color: hasMoreChips 
                  ? colours.blue 
                  : (isDark ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.4)'),
              }}
            >
              <Icon 
                iconName={hasMoreChips ? 'ChevronRight' : 'Refresh'} 
                styles={{ 
                  root: { 
                    fontSize: hasMoreChips ? 12 : 10, 
                    color: 'inherit',
                    opacity: hasMoreChips ? 1 : 0.7,
                  } 
                }} 
              />
              {hasMoreChips && !isAtStart && (
                <span style={{ 
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: colours.blue,
                  fontSize: 0,
                }} />
              )}
            </button>
          ) : (
            <div />
          )}
        </div>
      </div>
    );
  }, [pipelineNeedsCarousel, visiblePipelineChipCount, getPipelineScrollOffset, advancePipelineScroll]);
  
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
  const [reassignmentDropdown, setReassignmentDropdown] = useState<{ enquiryId: string; x: number; y: number; openAbove?: boolean } | null>(null);
  const [isReassigning, setIsReassigning] = useState(false);

  // Navigation state variables  
  // (declaration moved below, only declare once)

  // Function to fetch all enquiries (unfiltered) for "All" mode
  const fetchAllEnquiries = useCallback(async () => {
    if (isLoadingAllData) {
      debugLog('🔄 Already loading all data, skipping fetch');
      return;
    }
    
    console.info('[Enquiries] fetchAllEnquiries:start', {
      reason: lastTeamWideFetchReasonRef.current || 'unknown',
      hasFetchedAllData: hasFetchedAllData.current,
    });
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
      onTeamWideEnquiriesLoaded?.(normalizedEnquiries as Enquiry[]);
      
      console.info('[Enquiries] fetchAllEnquiries:success', {
        reason: lastTeamWideFetchReasonRef.current || 'unknown',
        count: normalizedEnquiries.length,
      });
      debugLog('✅ Team-wide enquiries loaded; preserved per-user allEnquiries');
      
      return normalizedEnquiries;
    } catch (error) {
      console.error('❌ Failed to fetch all enquiries:', error);
      console.warn('[Enquiries] fetchAllEnquiries:error', {
        reason: lastTeamWideFetchReasonRef.current || 'unknown',
      });
      return [];
    } finally {
      setIsLoadingAllData(false);
      console.info('[Enquiries] fetchAllEnquiries:end', {
        reason: lastTeamWideFetchReasonRef.current || 'unknown',
      });
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
  type EnquiriesActiveState = '' | 'Claimed' | 'Claimable' | 'Triaged';
  const [activeState, setActiveState] = useState<EnquiriesActiveState>('Claimed');

  // Use deferred values for smoother filter transitions
  const deferredShowMineOnly = useDeferredValue(showMineOnly);
  const deferredActiveState = useDeferredValue(activeState);

  // Reset the carousel offset when switching tabs/views so the first chip (POC)
  // doesn't disappear in states like Unclaimed.
  useEffect(() => {
    setPipelineScrollOffset(0);
  }, [activeState, viewMode]);

  // In Claimed view, POC is guaranteed by definition, so drop any persisted poc-stage filter.
  useEffect(() => {
    if (activeState !== 'Claimed') return;
    setEnquiryPipelineFilters(prev => {
      if (!prev.has('poc')) return prev;
      const next = new Map(prev);
      next.delete('poc');
      return next;
    });
  }, [activeState]);

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
  const [searchInputValue, setSearchInputValue] = useState<string>(''); // Local input value for immediate UI feedback
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showGroupedView, setShowGroupedView] = useState<boolean>(true);
  const [areActionsEnabled, setAreActionsEnabled] = useState<boolean>(false);
  const [documentCounts, setDocumentCounts] = useState<Record<string, number>>({});
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

  // Realtime: subscribe to lightweight SSE events.
  // Goal: apply local patches immediately (no stale UI), with a slower backstop refresh.
  // Compute-respectful: only active tab subscribes; refreshes are coalesced.
  const refreshRef = useRef(onRefreshEnquiries);
  const refreshTimerRef = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const lastKnownEnquiryTsRef = useRef<number>(0);

  useEffect(() => {
    refreshRef.current = onRefreshEnquiries;
  }, [onRefreshEnquiries]);

  const getEnquiryTimestamp = useCallback((enquiry: Partial<Enquiry> | any): number => {
    const raw = enquiry?.Touchpoint_Date || enquiry?.Date_Created || enquiry?.datetime || enquiry?.claim;
    if (!raw) return 0;
    const ts = new Date(raw).getTime();
    return Number.isFinite(ts) ? ts : 0;
  }, []);

  useEffect(() => {
    const source = teamWideEnquiries.length > 0 ? teamWideEnquiries : allEnquiries;
    if (!source.length) return;
    const maxTs = source.reduce((max, enquiry) => {
      const ts = getEnquiryTimestamp(enquiry);
      return ts > max ? ts : max;
    }, lastKnownEnquiryTsRef.current);
    if (maxTs > lastKnownEnquiryTsRef.current) {
      lastKnownEnquiryTsRef.current = maxTs;
    }
  }, [allEnquiries, teamWideEnquiries, getEnquiryTimestamp]);

  const applyRealtimeClaimPatch = useCallback((enquiryId: string, claimedByEmail: string, claimedAt?: string | null) => {
    if (!enquiryId) return false;
    const nextPoc = (claimedByEmail || '').trim() || 'team@helix-law.com';

    // Preserve for a short window so props normalisation doesn't overwrite the patch.
    recentUpdatesRef.current.set(enquiryId, {
      field: 'Point_of_Contact',
      value: nextPoc,
      timestamp: Date.now(),
    });
    window.setTimeout(() => {
      recentUpdatesRef.current.delete(enquiryId);
    }, 5000);

    const claimIso = (claimedAt && !Number.isNaN(new Date(claimedAt).getTime()))
      ? String(claimedAt)
      : new Date().toISOString();

    const updateEnquiry = (enquiry: Enquiry & { __sourceType: 'new' | 'legacy' }): Enquiry & { __sourceType: 'new' | 'legacy' } => {
      if (String(enquiry.ID) !== String(enquiryId)) return enquiry;
      const next: any = { ...enquiry, Point_of_Contact: nextPoc, poc: nextPoc };
      // Only v2/instructions enquiries display claim timing.
      if ((enquiry as any).__sourceType === 'new') {
        // If unclaimed, clear claim time; otherwise set if missing.
        const isUnclaimed = nextPoc.toLowerCase() === 'team@helix-law.com';
        next.claim = isUnclaimed ? null : ((enquiry as any).claim ?? claimIso);
      }
      return next;
    };

    // Update local state immediately so filters + counts react instantly.
    setAllEnquiries(prev => prev.map(updateEnquiry));
    setDisplayEnquiries(prev => prev.map(updateEnquiry));
    setTeamWideEnquiries(prev => prev.map(updateEnquiry));
    return true;
  }, []);

  useEffect(() => {
    // Only stream when Enquiries tab is active and we have a refresh handler.
    if (!isActive || !refreshRef.current) {
      if (esRef.current) {
        try { esRef.current.close(); } catch { /* ignore */ }
        esRef.current = null;
      }
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }

    const es = new EventSource('/api/enquiries-unified/stream');
    esRef.current = es;

    console.info('[Enquiries] stream:open', { isActive });

    const scheduleRefresh = (delayMs = 900) => {
      if (!refreshRef.current) return;
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        console.info('[Enquiries] stream:refresh', { via: 'enquiries.changed' });
        refreshRef.current?.().catch(() => { /* ignore */ });
      }, delayMs);
    };

    const onChangedEvent = (ev: any) => {
      // Payload is small; do not log any user identifiers.
      let data: any;
      try {
        data = typeof ev?.data === 'string' ? JSON.parse(ev.data) : undefined;
        console.info('[Enquiries] stream:event', { type: data?.changeType || 'changed' });
      } catch {
        console.info('[Enquiries] stream:event', { type: 'changed' });
      }

      scheduleRefresh();
      // Let EventSource handle retries; do not spam refresh.
    };

    try {
      es.addEventListener('enquiries.changed', onChangedEvent as any);
    } catch {
      // ignore
    }

    return () => {
      try { es.removeEventListener('enquiries.changed', onChangedEvent); } catch { /* ignore */ }
      try { es.close(); } catch { /* ignore */ }
      console.info('[Enquiries] stream:close');
      if (esRef.current === es) esRef.current = null;
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [isActive, applyRealtimeClaimPatch]);

  useEffect(() => {
    if (!isActive || !refreshRef.current) return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const resp = await fetch('/api/enquiries-unified/pulse');
        if (!resp.ok) return;
        const data = await resp.json();
        const latestIso = data?.latestTimestamp;
        if (!latestIso) return;
        const latestTs = new Date(latestIso).getTime();
        if (!Number.isFinite(latestTs)) return;
        if (latestTs > lastKnownEnquiryTsRef.current + 1000) {
          lastKnownEnquiryTsRef.current = latestTs;
          console.info('[Enquiries] pulse:refresh', { latestIso });
          refreshRef.current?.().catch(() => { /* ignore */ });
        }
      } catch {
        // non-blocking
      }
    };

    poll();
    const intervalId = window.setInterval(poll, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isActive]);
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

  const [demoOverlayVisible, setDemoOverlayVisible] = useState(false);
  const [demoOverlayMessage, setDemoOverlayMessage] = useState('');
  const [demoOverlayDetails, setDemoOverlayDetails] = useState('');

  const triggerFetchAllEnquiries = useCallback((reason: string) => {
    lastTeamWideFetchReasonRef.current = reason;
    console.info('[Enquiries] fetchAllEnquiries:trigger', {
      reason,
      showMineOnly,
      activeState,
      isLoadingAllData,
      hasFetchedAllData: hasFetchedAllData.current,
      teamWideCount: teamWideEnquiries.length,
      allEnquiriesCount: allEnquiries.length,
    });
    fetchAllEnquiries();
  }, [showMineOnly, activeState, isLoadingAllData, teamWideEnquiries.length, allEnquiries.length, fetchAllEnquiries]);
  
  // Track enquiry visibility (for viewport-based enrichment)
  const handleEnquiryVisibilityChange = useCallback((enquiryId: string, isVisible: boolean) => {
    setVisibleEnquiryIds(prev => {
      const next = new Set(prev);
      if (isVisible) {
        next.add(enquiryId);
      } else {
        next.delete(enquiryId);
      }
      return next;
    });
  }, []);
  
  // Debounced search handler - prevents component re-renders while typing
  const handleSearchChange = useCallback((value: string) => {
    setSearchInputValue(value); // Update input immediately for responsive typing
    
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set new timeout for debounced filter update (300ms)
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(value);
    }, 300);
  }, []);

  const safeCopyToClipboard = useCallback(async (value?: string | number) => {
    if (!value) return false;
    const text = String(value);

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      console.error('Failed to copy text:', err);
    }

    try {
      if (typeof document === 'undefined') return false;
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch (err) {
      console.error('Failed to copy text with fallback:', err);
      return false;
    }
  }, []);

  const handleCopyName = useCallback(async (value: string, key: string) => {
    if (!value) return;
    const ok = await safeCopyToClipboard(value);
    if (ok) {
      setCopiedNameKey(key);
      setTimeout(() => setCopiedNameKey(null), 1500);
    }
  }, [safeCopyToClipboard]);

  // Track claim operations in progress (keyed by enquiry ID)
  const [claimingEnquiries, setClaimingEnquiries] = useState<Set<string>>(new Set());
  const [copiedNameKey, setCopiedNameKey] = useState<string | null>(null);

  const renderClaimPromptChip = useCallback(
    (options?: { 
      size?: 'default' | 'compact'; 
      teamsLink?: string | null; 
      leadName?: string; 
      areaOfWork?: string;
      enquiryId?: string;
      dataSource?: 'new' | 'legacy';
      iconOnly?: boolean;
    }) => {
      const size = options?.size ?? 'default';
      const iconOnly = options?.iconOnly ?? false;
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
            padding: iconOnly ? '0 6px' : metrics.padding,
            height: iconOnly ? 22 : 24,
            boxSizing: 'border-box',
            lineHeight: 1,
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
            flexShrink: 0,
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
          {!iconOnly && <span>{isClaiming ? 'Claiming...' : 'Claim'}</span>}
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
    const dropdownHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    // Position below if enough space, otherwise above
    const openAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
    
    setReassignmentDropdown({
      enquiryId,
      x: rect.left + (rect.width / 2) - 100, // Center the 200px dropdown on the chip
      y: openAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
      openAbove,
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

  const toRgba = (color: string, alpha: number): string => {
    if (!color) return `rgba(148, 163, 184, ${alpha})`;
    if (color.startsWith('rgba(')) {
      const match = color.match(/rgba\(([^)]+)\)/);
      if (!match) return color;
      const parts = match[1].split(',').map(p => p.trim());
      if (parts.length < 3) return color;
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
    if (color.startsWith('rgb(')) {
      return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    }
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      if (hex.length >= 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    }
    return color;
  };

  const getAreaOfWorkLineColor = (areaOfWork: string, isDarkMode: boolean, isHover = false): string => {
    const area = (areaOfWork || '').toLowerCase().trim();
    const alpha = isHover ? 0.85 : 0.55;

    if (area.includes('commercial')) return toRgba(colours.blue, alpha);
    if (area.includes('construction')) return toRgba(colours.orange, alpha);
    if (area.includes('property')) return toRgba(colours.green, alpha);
    if (area.includes('employment')) return toRgba(colours.yellow, alpha);
    if (area.includes('other') || area.includes('unsure')) return toRgba(colours.greyText, isDarkMode ? 0.5 : 0.45);

    return toRgba(colours.greyText, isDarkMode ? 0.5 : 0.45);
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
      timeZone: 'Europe/London',
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

  const timeAgoLong = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const now = new Date();
    const then = new Date(dateStr);
    if (isNaN(then.getTime())) return '';
    let seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

    if (seconds <= 0) return 'Just now';

    // < 1 minute: seconds only
    if (seconds < 60) return `${seconds}s ago`;

    // < 10 minutes: minutes + seconds (m/s)
    if (seconds < 600) {
      const minutes = Math.floor(seconds / 60);
      const remSeconds = seconds % 60;
      return remSeconds > 0 ? `${minutes}m ${remSeconds}s ago` : `${minutes}m ago`;
    }

    // < 1 hour: minutes only
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m ago`;
    }

    // < 1 day: hours + minutes (h/m)
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      const remMinutes = Math.floor((seconds % 3600) / 60);
      return remMinutes > 0 ? `${hours}h ${remMinutes}m ago` : `${hours}h ago`;
    }

    const days = Math.floor(seconds / 86400);
    const remHours = Math.floor((seconds % 86400) / 3600);

    // < 1 week: days + hours (d/h)
    if (days < 7) {
      return remHours > 0 ? `${days}d ${remHours}h ago` : `${days}d ago`;
    }

    // < ~1 month: weeks + days (w/d)
    if (days < 30) {
      const weeks = Math.floor(days / 7);
      const remDays = days % 7;
      return remDays > 0 ? `${weeks}w ${remDays}d ago` : `${weeks}w ago`;
    }

    // < 1 year: months + weeks (m/w), month ≈ 30d
    if (days < 365) {
      const months = Math.floor(days / 30);
      const remDays2 = days % 30;
      const weeks = Math.floor(remDays2 / 7);
      return weeks > 0 ? `${months}m ${weeks}w ago` : `${months}m ago`;
    }

    // years + months (y/m), year ≈ 365d
    const years = Math.floor(days / 365);
    const remDays3 = days % 365;
    const months = Math.floor(remDays3 / 30);
    return months > 0 ? `${years}y ${months}m ago` : `${years}y ago`;
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

  const getStackedDateDisplay = (dateStr: string | null): { top: string; middle: string; bottom: string } => {
    if (!dateStr) return { top: '-', middle: '', bottom: '' };
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { top: '-', middle: '', bottom: '' };

    const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
    const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' });
    const hasTime = timePart !== '00:00';

    return { top: datePart, middle: '', bottom: hasTime ? timePart : '' };
  };
  
  // Format day separator label (compact by default, full on hover; include year only if not current)
  const formatDaySeparatorLabel = (dayKey: string, isHovered: boolean): string => {
    if (!dayKey) return '';
    const d = new Date(dayKey + 'T12:00:00'); // Use noon to avoid timezone issues
    if (isNaN(d.getTime())) return dayKey;

    const now = new Date();
    const isSameYear = d.getFullYear() === now.getFullYear();

    if (isHovered) {
      return isSameYear
        ? format(d, 'EEEE d MMMM')
        : format(d, 'EEEE d MMMM yyyy');
    }

    return isSameYear ? format(d, 'dd.MM') : format(d, 'dd.MM.yyyy');
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
      triggerFetchAllEnquiries(showMineOnly ? 'mode:mine+claimed' : 'mode:all');
    }
  }, [showMineOnly, activeState, userEmail, triggerFetchAllEnquiries, isAdmin]); // Simplified dependencies

  const [currentSliderStart, setCurrentSliderStart] = useState<number>(0);
  const [currentSliderEnd, setCurrentSliderEnd] = useState<number>(0);

  // Added for infinite scroll
  const [itemsToShow, setItemsToShow] = useState<number>(20);
  const loader = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRafPendingRef = useRef(false);
  const previousMainTab = useRef<EnquiriesActiveState>('Claimed');
  const previousActiveStateRef = useRef<EnquiriesActiveState>(activeState);
  const [manualFilterTransitioning, setManualFilterTransitioning] = useState(false);
  const manualFilterTransitionTimeoutRef = useRef<number | null>(null);

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

  const normalizePoc = useCallback((value: unknown): string => {
    return typeof value === 'string' ? value.toLowerCase().trim() : '';
  }, []);

  const isUnclaimedPoc = useCallback((value: unknown): boolean => {
    const v = normalizePoc(value);
    return !v || v === 'team@helix-law.com' || v === 'team' || v === 'team inbox' || v === 'anyone' || v === 'unassigned' || v === 'unknown' || v === 'n/a';
  }, [normalizePoc]);

  

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
      if (isUnclaimedPoc(v)) return 0; // Unclaimed
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
      const claimed = poc && !isUnclaimedPoc(poc) && !isTriaged(poc);
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
  }, [teamWideEnquiries, isUnclaimedPoc]);

  const unclaimedEnquiries = useMemo(
    () => {
      const result = dedupedEnquiries.filter((e) => {
        const poc = (e.Point_of_Contact || (e as any).poc || '').toLowerCase();
        if (!isUnclaimedPoc(poc)) return false;
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
    [dedupedEnquiries, claimedContactDaySet, isUnclaimedPoc]
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

  // State for initial timeline filter (used when opening from pipeline chips)
  const [timelineInitialFilter, setTimelineInitialFilter] = useState<'pitch' | null>(null);

  const openEnquiryWorkbench = useCallback((enquiry: Enquiry, tab: 'Pitch' | 'Timeline', options?: { filter?: 'pitch' }) => {
    setSelectedEnquiry(enquiry);
    setActiveSubTab(tab);
    setTimelineInitialFilter(options?.filter ?? null);
  }, []);

  const handleSelectEnquiry = useCallback((enquiry: Enquiry) => {
    const promotion = getPromotionStatusSimple(enquiry);
    const enrichmentPitch = enquiry.ID
      ? enrichmentMap.get(String(enquiry.ID))?.pitchData
      : null;
    const defaultTab = (promotion || enquiry.pitchEnquiryId || enrichmentPitch) ? 'Timeline' : 'Pitch';
    openEnquiryWorkbench(enquiry, defaultTab);
  }, [enrichmentMap, getPromotionStatusSimple, openEnquiryWorkbench]);

  const handleSelectEnquiryToPitch = useCallback((enquiry: Enquiry) => {
    openEnquiryWorkbench(enquiry, 'Pitch');
  }, [openEnquiryWorkbench]);

  const handleSelectEnquiryForTimeline = useCallback((enquiry: Enquiry) => {
    openEnquiryWorkbench(enquiry, 'Timeline');
  }, [openEnquiryWorkbench]);

  const handleBackToList = useCallback(() => {
    setSelectedEnquiry(null);
    // Trigger pipeline grid re-measurement when returning to list view
    setPipelineRemeasureKey(prev => prev + 1);
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
    setDemoModeEnabledLocal(true);

    const now = new Date();
    const currentTouchpoint = now.toISOString().split('T')[0];
    const priorDate = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
    const priorTouchpoint = priorDate.toISOString().split('T')[0];

    const demoEnquiries: Array<Enquiry & { __sourceType: 'new' | 'legacy' }> = [
      {
        ...DEV_PREVIEW_TEST_ENQUIRY,
        ID: 'DEMO-ENQ-0001',
        Point_of_Contact: currentUserEmail,
        Touchpoint_Date: currentTouchpoint,
        Date_Created: currentTouchpoint,
        __sourceType: 'legacy',
      },
      {
        ...DEV_PREVIEW_TEST_ENQUIRY,
        ID: 'DEMO-ENQ-0002',
        First_Name: 'Demo',
        Last_Name: 'Prospect',
        Point_of_Contact: currentUserEmail,
        Touchpoint_Date: priorTouchpoint,
        Date_Created: priorTouchpoint,
        Area_of_Work: 'Property',
        Type_of_Work: 'Lease Renewal',
        Method_of_Contact: 'Phone',
        Rating: 'Good',
        Value: '45000',
        Ultimate_Source: 'Referral',
        Initial_first_call_notes: 'Client called regarding lease renewal for their commercial premises. Current lease expires in 6 months. Landlord has proposed a 15% rent increase which client believes is excessive. Client wants advice on negotiating terms and understanding their rights under the current lease agreement.',
        __sourceType: 'legacy',
      },
    ];

    const demoIds = new Set(demoEnquiries.map(enq => String(enq.ID)));

    setDisplayEnquiries(prev => {
      const withoutDemo = prev.filter(e => !demoIds.has(String(e.ID)));
      return [...demoEnquiries, ...withoutDemo];
    });

    setAllEnquiries(prev => {
      const withoutDemo = prev.filter(e => !demoIds.has(String(e.ID)));
      return [...demoEnquiries, ...withoutDemo];
    });

    setTeamWideEnquiries(prev => {
      if (prev.length === 0) return prev;
      const withoutDemo = prev.filter(e => !demoIds.has(String(e.ID)));
      return [...demoEnquiries, ...withoutDemo];
    });

    // Also inject synthetic enrichment data for the demo record
    const pitchedDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const priorPitchDate = new Date(priorDate.getTime() + 2 * 24 * 60 * 60 * 1000);
    setEnrichmentMap(prevMap => {
      const newMap = new Map(prevMap);
      if (!newMap.has('DEMO-ENQ-0001')) {
        newMap.set('DEMO-ENQ-0001', {
          enquiryId: 'DEMO-ENQ-0001',
          teamsData: {
            Id: 99999,
            ActivityId: 'demo-activity-99999',
            ChannelId: 'demo-channel',
            TeamId: 'demo-team',
            EnquiryId: 'DEMO-ENQ-0001',
            LeadName: 'Demo Prospect',
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
      }
      if (!newMap.has('DEMO-ENQ-0002')) {
        newMap.set('DEMO-ENQ-0002', {
          enquiryId: 'DEMO-ENQ-0002',
          teamsData: {
            Id: 99998,
            ActivityId: 'demo-activity-99998',
            ChannelId: 'demo-channel',
            TeamId: 'demo-team',
            EnquiryId: 'DEMO-ENQ-0002',
            LeadName: 'Demo Prospect',
            Email: DEV_PREVIEW_TEST_ENQUIRY.Email || '',
            Phone: DEV_PREVIEW_TEST_ENQUIRY.Phone_Number || '',
            CardType: 'enquiry',
            MessageTimestamp: priorDate.toISOString(),
            TeamsMessageId: 'demo-msg-99998',
            CreatedAtMs: priorDate.getTime(),
            Stage: 'Enquiry',
            Status: 'Closed',
            ClaimedBy: currentUserEmail.split('@')[0].toUpperCase(),
            ClaimedAt: new Date(priorDate.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
            CreatedAt: new Date(priorDate.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            UpdatedAt: priorDate.toISOString(),
            teamsLink: '',
          },
          pitchData: {
            dealId: 99998,
            email: DEV_PREVIEW_TEST_ENQUIRY.Email || '',
            serviceDescription: 'Lease Renewal',
            amount: 3200,
            status: 'Instructed',
            areaOfWork: 'property',
            pitchedBy: 'CB',
            pitchedDate: priorPitchDate.toISOString().split('T')[0],
            pitchedTime: priorPitchDate.toTimeString().split(' ')[0],
            scenarioId: 'after-call-email',
            scenarioDisplay: 'After call (email)',
          }
        });
      }
      return newMap;
    });
  }, [userData]);

  // Listen for demo mode event (from UserBubble menu)
  useEffect(() => {
    const handleSelectTestEnquiry = () => {
      ensureDemoEnquiryPresent();
      setActiveState('Claimed');

      setDemoOverlayMessage('Demo mode enabled');
      setDemoOverlayDetails('Demo prospects are now pinned to the top of your Claimed list alongside your live items.');
      setDemoOverlayVisible(true);
      setTimeout(() => setDemoOverlayVisible(false), 2600);
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

  // Re-apply demo entries after dataset refreshes (prevents losing demo items when toggling views)
  useEffect(() => {
    if (!demoModeEnabled) return;

    const hasDemo = (list: Enquiry[]) => list.some((e) => {
      const id = String(e.ID);
      return id === 'DEMO-ENQ-0001' || id === 'DEMO-ENQ-0002';
    });

    const missingInAll = allEnquiries.length > 0 && !hasDemo(allEnquiries);
    const missingInTeamWide = teamWideEnquiries.length > 0 && !hasDemo(teamWideEnquiries);

    if (missingInAll || missingInTeamWide) {
      ensureDemoEnquiryPresent();
    }
  }, [demoModeEnabled, allEnquiries, teamWideEnquiries, ensureDemoEnquiryPresent]);

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

  const submitRating = useCallback(async (ratingValue?: string) => {
    const rating = ratingValue || currentRating;
    if (ratingEnquiryId && rating) {
      try {
        // Use handleRatingChange which has proper state updates and toast feedback
        await handleRatingChange(ratingEnquiryId, rating);
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
          const isUnclaimed = isUnclaimedPoc(poc);
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
        if (!isUnclaimedPoc(poc)) return false;
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
    // 3. Claimable (Unclaimed) state - show all unclaimed enquiries regardless of user's AOW
    if (showMineOnly && activeState === 'Claimed') {
      // No area filtering at all - show everything the user claimed
    } else if (activeState === 'Triaged') {
      // Skip area filtering for Triaged - triage is cross-area, filtering already done by pitchedBy
    } else if (activeState === 'Claimable') {
      // Skip area-based access control for Unclaimed - show all unclaimed enquiries
      // Users can still optionally filter by area using the area toggles if they choose
      if (selectedAreas.length > 0) {
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
      // If no areas selected, show ALL unclaimed enquiries (no filtering)
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

    // Apply pipeline filters (yes/no toggles)
    if (enquiryPipelineFilters.size > 0) {
      filtered = filtered.filter(enquiry => {
        try {
          const enrichmentData = enrichmentMap.get(String(enquiry.ID));
          const inlineWorkbenchItem = getEnquiryWorkbenchItem(enquiry);
          const inst = inlineWorkbenchItem?.instruction;
          const deal = inlineWorkbenchItem?.deal;
          const instructionRef = (inst?.InstructionRef ?? inst?.instructionRef ?? deal?.InstructionRef ?? deal?.instructionRef) as string | undefined;
          const poc = (enquiry.Point_of_Contact || (enquiry as any).poc || '').toLowerCase();

          // Check each active filter
          for (const [stage, requiredStatus] of enquiryPipelineFilters.entries()) {
            if (activeState === 'Claimed' && stage === 'poc') {
              continue;
            }
            let hasStage = false;

            if (stage === 'poc') {
              // POC is active if there's Teams data OR a valid POC assignment
              hasStage = !!(enrichmentData?.teamsData) || (Boolean(poc) && poc !== 'team@helix-law.com');
            } else if (stage === 'pitched') {
              hasStage = !!(enrichmentData?.pitchData);
            } else if (stage === 'instructed') {
              // Require actual instruction record, not just InstructionRef from deal
              hasStage = Boolean(inst);
            } else if (stage === 'idcheck') {
              hasStage = Boolean(inlineWorkbenchItem?.eid);
            } else if (stage === 'paid') {
              hasStage = Array.isArray(inlineWorkbenchItem?.payments) && inlineWorkbenchItem.payments.length > 0;
            } else if (stage === 'risk') {
              hasStage = Boolean(inlineWorkbenchItem?.risk);
            } else if (stage === 'matter') {
              hasStage = Boolean(inst?.MatterId ?? inst?.matterId) || (Array.isArray(inlineWorkbenchItem?.matters) && inlineWorkbenchItem.matters.length > 0);
            }

            // requiredStatus is 'yes' or 'no'
            if (requiredStatus === 'yes' && !hasStage) return false;
            if (requiredStatus === 'no' && hasStage) return false;
          }

          return true;
        } catch {
          // Don't let a filter edge-case take down the whole tab.
          return true;
        }
      });
    }

    // Apply POC filter (dropdown selection by team member email)
    if (selectedPocFilter) {
      filtered = filtered.filter(enquiry => {
        const poc = (enquiry.Point_of_Contact || (enquiry as any).poc || '').toLowerCase();
        return poc === selectedPocFilter.toLowerCase();
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
    isUnclaimedPoc,
    selectedPersonInitials,
    teamData,
    enrichmentMap, // For Triaged filter and pipeline filters
    triagedDataLoaded, // For Triaged filter - wait until data is loaded
    enquiryPipelineFilters, // For pipeline filtering
    selectedPocFilter, // For POC dropdown filter
    inlineWorkbenchByEnquiryId,
  ]);

  // Build a quick lookup of every enquiry keyed by ID so special shared IDs can hydrate their history.
  const sharedProspectHistoryMap = useMemo(() => {
    // For shared prospect IDs, we ALWAYS want the complete team-wide dataset
    // If teamWideEnquiries is empty, trigger a fetch when we detect shared IDs in the current view
    const hasSharedIds = allEnquiries.some(record => shouldAlwaysShowProspectHistory(record));
    
    // If we have shared IDs but no team-wide data, trigger fetch
    if (hasSharedIds && teamWideEnquiries.length === 0 && !isLoadingAllData && !hasTriggeredSharedHistoryFetch.current) {
      debugLog('🔍 Shared IDs detected, need team-wide data for complete history');
      hasTriggeredSharedHistoryFetch.current = true;
      // Trigger fetch asynchronously
      setTimeout(() => triggerFetchAllEnquiries('shared-history:missing-teamwide'), 0);
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
  }, [teamWideEnquiries, allEnquiries, isLoadingAllData, triggerFetchAllEnquiries]);

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
  // Uses a stable ref-based approach to prevent spam when switching to "All" view
  useEffect(() => {
    // Skip enrichment when viewing a single enquiry detail
    if (selectedEnquiry) {
      return;
    }

    const fetchProgressiveEnrichment = async () => {
      // Get currently displayed enquiries that need enrichment
      // **VIEWPORT OPTIMIZATION**: Only process items that are actually visible
      const displayedEnquiriesSnapshot = displayedItems.filter((item): item is (Enquiry & { __sourceType: 'new' | 'legacy' }) => {
        if (!('ID' in item) || !item.ID) return false;
        const key = String(item.ID);
        
        // Skip if already enriched or being fetched
        const existingEnrichment = enrichmentMap.get(key);
        const hasEnrichment = Boolean(existingEnrichment?.teamsData || existingEnrichment?.pitchData);
        const isBeingFetched = enrichmentRequestsRef.current.has(key);
        const lastAttempt = enrichmentLastAttemptRef.current.get(key) || 0;
        const isRecentlyAttemptedEmpty = existingEnrichment && !hasEnrichment && (Date.now() - lastAttempt < 120000);
        if (hasEnrichment || isBeingFetched || isRecentlyAttemptedEmpty) return false;
        
        // **CRITICAL**: Only enrich if visible in viewport
        const isVisible = visibleEnquiryIds.has(key);
        return isVisible;
      });

      if (displayedEnquiriesSnapshot.length === 0) {
        return; // All visible items already enriched
      }
      
      // **CRITICAL**: Prefer speed over load; larger batches for faster enrichment
      const BATCH_LIMIT = 30;
      const batchToEnrich = displayedEnquiriesSnapshot.slice(0, BATCH_LIMIT);
      
      // Update UI feedback
      setIsEnriching(true);
      setEnrichmentProgress({ current: batchToEnrich.length, total: displayedEnquiriesSnapshot.length });
      
      // Mark items as being fetched
      batchToEnrich.forEach(enquiry => {
        if (enquiry.ID) {
          enrichmentRequestsRef.current.add(String(enquiry.ID));
          enrichmentLastAttemptRef.current.set(String(enquiry.ID), Date.now());
        }
      });

      // Get v2 enquiry IDs for Teams data
      const v2EnquiryIds = batchToEnrich
        .filter(enquiry => {
          const isNewSource = enquiry.__sourceType === 'new' || (enquiry as any).source === 'instructions';
          return isNewSource && enquiry.ID;
        })
        .map(enquiry => String(enquiry.ID))
        .filter(Boolean);

      // Get all enquiry emails for pitch data
      const enquiryEmails = batchToEnrich
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
            batchToEnrich.forEach(enquiry => {
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
            batchToEnrich.forEach(enquiry => {
              const key = String(enquiry.ID);
              if (enquiry.ID && !newMap.has(key)) {
                newMap.set(key, { enquiryId: key }); // Empty record
              }
            });
            
            return newMap;
          });
          
          // Clear tracking for successfully processed items
          batchToEnrich.forEach(enquiry => {
            if (enquiry.ID) {
              enrichmentRequestsRef.current.delete(String(enquiry.ID));
            }
          });
          
          // Clear UI feedback
          setIsEnriching(false);
          setEnrichmentProgress(null);
        } catch (error) {
          console.error('[Enquiries] Progressive enrichment failed:', error);
          
          // Create empty enrichment records to stop spinners and clear tracking
          setEnrichmentMap(prevMap => {
            const newMap = new Map(prevMap);
            batchToEnrich.forEach(enquiry => {
              const key = String(enquiry.ID);
              if (enquiry.ID && !newMap.has(key)) {
                newMap.set(key, { enquiryId: key }); // Empty record to indicate processed
                enrichmentRequestsRef.current.delete(key); // Clear tracking
              }
            });
            return newMap;
          });
          
          // Clear UI feedback on error
          setIsEnriching(false);
          setEnrichmentProgress(null);
        }
      } else {
        // No enrichment needed, but create empty records to stop spinners
        setEnrichmentMap(prevMap => {
          const newMap = new Map(prevMap);
          batchToEnrich.forEach(enquiry => {
            const key = String(enquiry.ID);
            if (enquiry.ID && !newMap.has(key)) {
              newMap.set(key, { enquiryId: key }); // Empty record
              enrichmentRequestsRef.current.delete(key); // Clear tracking
            }
          });
          return newMap;
        });
        
        // Clear UI feedback when no enrichment needed
        setIsEnriching(false);
        setEnrichmentProgress(null);
      }
    };

    // Use longer debounce for large datasets to prevent spam
    const datasetSize = dedupedEnquiries.length;
    const debounceTime = 0; // Prioritise speed: enrich immediately
    
    const timeoutId = setTimeout(fetchProgressiveEnrichment, debounceTime);
    return () => clearTimeout(timeoutId);
  }, [
    selectedEnquiry, 
    enrichmentMap.size, // Only re-run when enrichment count changes (stable)
    itemsToShow, // When user loads more
    showMineOnly, // When switching All/Mine (affects dataset)
    visibleEnquiryIds.size, // When viewport visibility changes
    enquiryPipelineFilters.size,
  ]); // Removed unstable deps: displayedItems, filteredEnquiries.length, etc.

  // EAGER PRE-FETCH: Immediately enrich the first batch of items on initial data load
  // This ensures hover data is ready before user even scrolls
  const eagerPrefetchDoneRef = useRef<boolean>(false);
  useEffect(() => {
    // Only run once per data load
    if (eagerPrefetchDoneRef.current || selectedEnquiry || displayedItems.length === 0) return;
    
    const eagerPrefetch = async () => {
      // Get first 60 items (typical viewport + buffer)
      const firstBatch = displayedItems
        .slice(0, 60)
        .filter((item): item is (Enquiry & { __sourceType: 'new' | 'legacy' }) => 
          'ID' in item && Boolean(item.ID) && !enrichmentMap.has(String(item.ID))
        );
      
      if (firstBatch.length === 0) return;
      
      // Mark as done immediately to prevent duplicate calls
      eagerPrefetchDoneRef.current = true;
      
      // Split into 3 parallel micro-batches for faster response
      const batchSize = Math.ceil(firstBatch.length / 3);
      const microBatches = [
        firstBatch.slice(0, batchSize),
        firstBatch.slice(batchSize, batchSize * 2),
        firstBatch.slice(batchSize * 2),
      ].filter(b => b.length > 0);
      
      // Fire all batches in parallel
      await Promise.all(microBatches.map(async (batch) => {
        const v2Ids = batch
          .filter(e => e.__sourceType === 'new' || (e as any).source === 'instructions')
          .map(e => String(e.ID))
          .filter(Boolean);
        
        const emails = batch
          .map(e => e.Email)
          .filter((email): email is string => Boolean(email) && email.toLowerCase() !== 'team@helix-law.com');
        
        if (v2Ids.length === 0 && emails.length === 0) return;
        
        try {
          const result = await fetchEnquiryEnrichment(v2Ids, emails);
          
          setEnrichmentMap(prev => {
            const next = new Map(prev);
            result.enquiryData.forEach((data: EnquiryEnrichmentData) => {
              next.set(String(data.enquiryId), data);
            });
            batch.forEach(e => {
              if (e.Email && e.ID) {
                const pitchData = result.pitchByEmail[e.Email.toLowerCase()];
                if (pitchData) {
                  const key = String(e.ID);
                  next.set(key, { ...next.get(key) || { enquiryId: key }, pitchData });
                }
              }
              // Create empty record if no data (stops spinners)
              const key = String(e.ID);
              if (!next.has(key)) next.set(key, { enquiryId: key });
            });
            return next;
          });
        } catch (err) {
          console.error('[Eager Prefetch] Batch failed:', err);
        }
      }));
    };
    
    // Fire immediately, no delay
    eagerPrefetch();
  }, [displayedItems.length > 0]); // Only trigger when items first appear

  // Reset eager prefetch when filters/view changes significantly
  useEffect(() => {
    eagerPrefetchDoneRef.current = false;
  }, [activeState, showMineOnly, selectedArea, debouncedSearchTerm]);

  // Track visible enquiries using IntersectionObserver (viewport-based enrichment)
  useEffect(() => {
    const observerOptions = {
      root: null, // viewport
      rootMargin: '800px', // Start enriching much earlier to reduce visible lag
      threshold: 0.01, // Trigger as soon as 1% is visible
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const enquiryId = entry.target.getAttribute('data-enquiry-id');
        if (enquiryId) {
          handleEnquiryVisibilityChange(enquiryId, entry.isIntersecting);
        }
      });
    }, observerOptions);

    // Observe all enquiry rows
    const rows = document.querySelectorAll('[data-enquiry-id]');
    rows.forEach(row => observer.observe(row));

    return () => observer.disconnect();
  }, [displayedItems.length, handleEnquiryVisibilityChange]); // Re-observe when items change

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
    enrichmentLastAttemptRef.current.clear();
  }, [showUnclaimedBoard, showGroupedView, viewMode, selectedArea, dateRange?.oldest, dateRange?.newest, debouncedSearchTerm]);

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
        setDocumentCounts((prev: Record<string, number>) => {
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

  // Store filteredEnquiries.length in a ref so the observer callback always has current value
  const filteredLengthRef = useRef(filteredEnquiries.length);
  filteredLengthRef.current = filteredEnquiries.length;

  // Set up scroll listener for infinite scroll (more reliable than IntersectionObserver here)
  useEffect(() => {
    const scrollRoot = scrollContainerRef.current || document.querySelector('.app-scroll-region');
    if (!scrollRoot || !(scrollRoot instanceof HTMLElement)) return;

    const handleScroll = () => {
      if (loadMoreRafPendingRef.current) return;
      loadMoreRafPendingRef.current = true;

      window.requestAnimationFrame(() => {
        loadMoreRafPendingRef.current = false;
        const el = scrollRoot as HTMLElement;
        const distanceToBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
        if (distanceToBottom > 400) return;

        setItemsToShow((prev) => {
          const maxLen = filteredLengthRef.current;
          if (prev >= maxLen) return prev;
          return Math.min(prev + 20, maxLen);
        });
      });
    };

    scrollRoot.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollRoot.removeEventListener('scroll', handleScroll);
      loadMoreRafPendingRef.current = false;
    };
  }, [viewMode, activeState]);
  const handleSetActiveState = useCallback(
    (key: EnquiriesActiveState) => {
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

  const getRatingIconAndColor = (ratingKey: string | undefined, darkMode: boolean) => {
    if (!ratingKey) {
      return {
        iconName: 'FavoriteStar',
        color: darkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)',
      };
    }

    switch (ratingKey) {
      case 'Good':
        return { iconName: 'FavoriteStarFill', color: colours.blue };
      case 'Neutral':
        return {
          iconName: 'CircleRing',
          color: darkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(100, 116, 139, 0.9)',
        };
      case 'Poor':
        return { iconName: 'StatusErrorFull', color: colours.cta };
      default:
        return {
          iconName: 'FavoriteStar',
          color: darkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)',
        };
    }
  };

  const getRatingChipMeta = (ratingKey: string | undefined, darkMode: boolean) => {
    const baseBorder = darkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)';
    const { iconName, color } = getRatingIconAndColor(ratingKey, darkMode);

    if (!ratingKey) {
      return {
        iconName,
        color,
        background: darkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
        borderColor: baseBorder,
        hoverBackground: darkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
        hoverColor: colours.blue,
        hoverBorderColor: colours.blue,
      };
    }

    const background = ratingKey === 'Good'
      ? (darkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.14)')
      : ratingKey === 'Neutral'
        ? (darkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.14)')
        : (darkMode ? 'rgba(214, 85, 65, 0.2)' : 'rgba(214, 85, 65, 0.14)');

    const hoverBackground = ratingKey === 'Good'
      ? (darkMode ? 'rgba(54, 144, 206, 0.28)' : 'rgba(54, 144, 206, 0.2)')
      : ratingKey === 'Neutral'
        ? (darkMode ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.2)')
        : (darkMode ? 'rgba(214, 85, 65, 0.28)' : 'rgba(214, 85, 65, 0.2)');

    return {
      iconName,
      color,
      background,
      borderColor: baseBorder,
      hoverBackground,
      hoverColor: color,
      hoverBorderColor: color,
    };
  };

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
            demoModeEnabled={demoModeEnabled}
            workbenchHandlers={workbenchHandlers}
            allEnquiries={teamWideEnquiries.length > 0 ? teamWideEnquiries : allEnquiries}
            onSelectEnquiry={handleSelectEnquiryForTimeline}
            onOpenPitchBuilder={(scenarioId) => {
              setSelectedPitchScenario(scenarioId);
              setActiveSubTab('Pitch');
            }}
            inlineWorkbenchItem={getEnquiryWorkbenchItem(enquiry)}
            enrichmentPitchData={enquiry.ID ? enrichmentMap.get(String(enquiry.ID))?.pitchData : undefined}
            enrichmentTeamsData={enquiry.ID ? enrichmentMap.get(String(enquiry.ID))?.teamsData : undefined}
            initialFilter={timelineInitialFilter ?? undefined}
          />
        )}
      </>
    ),
  [activeSubTab, userData, isLocalhost, featureToggles, setActiveSubTab, getEnquiryWorkbenchItem, enrichmentMap, timelineInitialFilter, workbenchHandlers, allEnquiries, teamWideEnquiries, handleSelectEnquiryForTimeline]
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
      backgroundColor: dark ? colours.dark.background : colours.light.background,
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      overflow: 'hidden',
      position: 'relative',
      color: dark ? colours.light.text : colours.dark.text,
    });
  }

  // Check if we're in a pending/transitioning state for filter changes
  const isFilterTransitioning = showMineOnly !== deferredShowMineOnly || activeState !== deferredActiveState;

  // Ensure the processing cue shows when switching to All view
  useEffect(() => {
    const previous = previousActiveStateRef.current;
    previousActiveStateRef.current = activeState;

    if (activeState === '' && previous !== '') {
      if (manualFilterTransitionTimeoutRef.current) {
        window.clearTimeout(manualFilterTransitionTimeoutRef.current);
      }
      setManualFilterTransitioning(true);
      manualFilterTransitionTimeoutRef.current = window.setTimeout(() => {
        setManualFilterTransitioning(false);
      }, 650);
    }
  }, [activeState]);

  useEffect(() => {
    return () => {
      if (manualFilterTransitionTimeoutRef.current) {
        window.clearTimeout(manualFilterTransitionTimeoutRef.current);
      }
    };
  }, []);

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
                title={isAdmin ? 'Admin only' : undefined}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  background: currentState === 'Triaged' ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)') : 'transparent',
                  border: isAdmin ? `1px solid ${isDarkMode ? 'rgba(255,183,77,0.35)' : 'rgba(255,152,0,0.3)'}` : 'none',
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
                  borderRadius: (height - 8) / 2,
                  boxShadow: currentState === 'Triaged'
                    ? (isDarkMode ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.06)')
                    : 'none',
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
            value: searchInputValue,
            onChange: handleSearchChange,
            placeholder: "Search (name, email, company, type, ID)"
          }}
          middleActions={(
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
    searchInputValue,
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

      {demoOverlayVisible && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isDarkMode ? 'rgba(2, 6, 23, 0.35)' : 'rgba(255, 255, 255, 0.35)',
          backdropFilter: 'blur(1px)',
          zIndex: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '14px 22px',
            borderRadius: 8,
            background: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            boxShadow: isDarkMode ? '0 4px 20px rgba(0, 0, 0, 0.4)' : '0 4px 20px rgba(0, 0, 0, 0.15)',
            border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
            maxWidth: 420,
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.7)',
              fontFamily: 'Raleway, sans-serif',
            }}>
              {demoOverlayMessage}
            </div>
            {demoOverlayDetails && (
              <div style={{
                fontSize: 11,
                color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.6)',
                fontFamily: 'Raleway, sans-serif',
              }}>
                {demoOverlayDetails}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Processing overlay when transitioning between filter states */}
      {(isFilterTransitioning || manualFilterTransitioning) && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isDarkMode ? 'rgba(2, 6, 23, 0.4)' : 'rgba(255, 255, 255, 0.4)',
          backdropFilter: 'blur(1px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 20px',
            borderRadius: 8,
            background: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            boxShadow: isDarkMode ? '0 4px 20px rgba(0, 0, 0, 0.4)' : '0 4px 20px rgba(0, 0, 0, 0.15)',
            border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
          }}>
            <div style={{
              width: 16,
              height: 16,
              border: `2px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
              borderTopColor: colours.highlight,
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }} />
            <span style={{
              fontSize: 13,
              fontWeight: 500,
              color: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.7)',
              fontFamily: 'Raleway, sans-serif',
            }}>
              Updating view...
            </span>
          </div>
        </div>
      )}

      <Stack
        tokens={{ childrenGap: viewMode === 'table' ? 0 : 20 }}
        styles={{
          root: {
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'transparent', // Remove section background - let cards sit on main page background
            // Remove extra chrome when viewing a single enquiry or table view; PitchBuilder renders its own card
            padding: (selectedEnquiry || viewMode === 'table') ? '0' : '16px',
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
          inlineWorkbenchByEnquiryId={inlineWorkbenchByEnquiryId}
          teamData={teamData}
          workbenchHandlers={workbenchHandlers}
        />
      ) : null}

      <div
        key={activeState}
        className={mergeStyles({
          flex: 1,
          minHeight: 0,
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
                        enquiryPipelineFilters.size > 0 || selectedPocFilter || debouncedSearchTerm || selectedAreas.length > 0 || selectedPersonInitials
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
                        enquiryPipelineFilters.size > 0 || selectedPocFilter || debouncedSearchTerm || selectedAreas.length > 0 || selectedPersonInitials
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
                        enquiryPipelineFilters.size > 0 || selectedPocFilter || debouncedSearchTerm || selectedAreas.length > 0 || selectedPersonInitials
                          ? 'filter'
                          : activeState === 'Triaged' ? 'filter' : 'search'
                      }
                      size="md"
                      action={
                        (enquiryPipelineFilters.size > 0 || selectedPocFilter || debouncedSearchTerm || selectedAreas.length > 0 || selectedPersonInitials)
                          ? {
                              label: 'Clear All Filters',
                              onClick: () => {
                                setEnquiryPipelineFilters(new Map());
                                setSelectedPocFilter(null);
                                setSearchInputValue('');
                                if (searchTimeoutRef.current) {
                                  clearTimeout(searchTimeoutRef.current);
                                }
                                setDebouncedSearchTerm('');
                                setSelectedAreas([]);
                                setSelectedPersonInitials(null);
                                setPipelineScrollOffset(0);
                                setPipelineRemeasureKey(k => k + 1);
                              },
                              variant: 'primary'
                            }
                          : undefined
                      }
                    />

            ) : (
              <>
                {/* Global pipeline animations - defined once for all rows */}
                <style>{`
                  @keyframes pipeline-cascade {
                    0% { opacity: 0; transform: translateY(-6px) scale(0.9); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                  }
                  @keyframes pipeline-action-pulse {
                    0%, 100% { opacity: 0.45; transform: scale(0.9); }
                    50% { opacity: 1; transform: scale(1); }
                  }
                `}</style>

                {/* Subtle enrichment progress indicator */}
                {isEnriching && enrichmentProgress && (
                  <div style={{
                    position: 'fixed',
                    bottom: 16,
                    right: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                    border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 500,
                    color: isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.7)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 1000,
                    animation: 'fadeIn 0.2s ease',
                  }}>
                    <div style={{
                      width: 12,
                      height: 12,
                      border: `2px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
                      borderTopColor: colours.blue,
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                    <span>Loading {enrichmentProgress.current} of {enrichmentProgress.total} items</span>
                  </div>
                )}
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
                          <div key={item.clientKey} data-enquiry-id={item.clientKey}>
                          <GroupedEnquiryCard
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
                            inlineWorkbenchByEnquiryId={inlineWorkbenchByEnquiryId}
                            workbenchHandlers={workbenchHandlers}
                          />
                          </div>
                        );
                      } else {
                        const pocLower = (item.Point_of_Contact || (item as any).poc || '').toLowerCase();
                        const isUnclaimed = pocLower === 'team@helix-law.com';
                        const inlineWorkbenchItem = getEnquiryWorkbenchItem(item);
                        if (isUnclaimed) {
                          return (
                            <div key={`${item.ID}-${item.First_Name || ''}-${item.Last_Name || ''}-${item.Touchpoint_Date || ''}-${item.Point_of_Contact || ''}`} data-enquiry-id={item.ID ? String(item.ID) : undefined}>
                            <NewUnclaimedEnquiryCard
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
                              inlineWorkbenchItem={inlineWorkbenchItem}
                              teamData={teamData}
                              workbenchHandlers={workbenchHandlers}
                            />
                            </div>
                          );
                        }
                        const claimer = claimerMap[pocLower];
                        return (
                          <div key={`${item.ID}-${item.First_Name || ''}-${item.Last_Name || ''}-${item.Touchpoint_Date || ''}-${item.Point_of_Contact || ''}`} data-enquiry-id={item.ID ? String(item.ID) : undefined}>
                          <ClaimedEnquiryCard
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
                            inlineWorkbenchItem={inlineWorkbenchItem}
                            teamData={teamData}
                            workbenchHandlers={workbenchHandlers}
                          />
                          </div>
                        );
                      }
                    })}
                    {/* Infinite scroll loader for card view */}
                    <div 
                      ref={loader} 
                      style={{ 
                        height: '20px', 
                        width: '100%',
                        visibility: itemsToShow < filteredEnquiries.length ? 'visible' : 'hidden',
                      }} 
                    />
                  </div>
                ) : (
                  /* Table View */
                  <div 
                    ref={scrollContainerRef}
                    style={{
                      backgroundColor: isDarkMode ? 'rgba(10, 15, 30, 0.95)' : 'rgba(241, 245, 249, 1)',
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      fontFamily: 'Raleway, "Segoe UI", sans-serif',
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1,
                      minHeight: 0,
                    }}
                  >
                    <div 
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        display: 'grid',
                        gridTemplateColumns: TABLE_GRID_TEMPLATE_COLUMNS,
                        gap: `${TABLE_GRID_GAP_PX}px`,
                        padding: '0 16px',
                        height: 44,
                        boxSizing: 'border-box',
                        alignItems: 'center',
                        flexShrink: 0,
                        background: isDarkMode 
                          ? 'rgba(15, 25, 45, 0.98)'
                          : 'rgba(248, 250, 252, 0.98)',
                        backdropFilter: 'blur(12px)',
                        borderTop: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'}`,
                        fontFamily: 'Raleway, "Segoe UI", sans-serif',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: isDarkMode ? colours.accent : colours.highlight,
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
                        }}
                        title="Timeline"
                      >
                        <Icon
                          iconName="TimelineProgress"
                          styles={{
                            root: {
                              fontSize: 12,
                              color: isDarkMode ? colours.accent : colours.highlight,
                              opacity: 0.7,
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
                        DATE
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
                        ID / VALUE
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
                          minWidth: 0,
                          overflow: 'hidden',
                        }}
                        title="Sort by prospect name"
                      >
                        PROSPECT
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
                      {/* Pipeline header + filter buttons */}
                      <div 
                        ref={pipelineGridMeasureRef}
                        style={{ 
                          position: 'relative',
                          height: '100%',
                          width: '100%',
                          minWidth: 0,
                          overflow: 'hidden',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                          {/* Pipeline stage filters row (acts as the header; avoids duplicated labels) */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: pipelineNeedsCarousel 
                                ? `repeat(${visiblePipelineChipCount}, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`
                                : `repeat(7, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`,
                              columnGap: 8,
                              width: '100%',
                              height: '100%',
                              minWidth: 0,
                              alignItems: 'center',
                            }}
                          >
                            {/* Header carousel state */}
                            {(() => {
                              const headerOffset = getPipelineScrollOffset('__header__');
                              const headerVisibleEnd = headerOffset + visiblePipelineChipCount;
                              const headerHasMore = pipelineNeedsCarousel && headerOffset < 7 - visiblePipelineChipCount;
                              const headerIsVisible = (idx: number) => 
                                !pipelineNeedsCarousel || (idx >= headerOffset && idx < headerVisibleEnd);

                              return (
                                <>
                            {/* POC - merged Teams+Claim - chip index 0: POC selector with Teams icon. */}
                            {headerIsVisible(0) && (
                              activeState === 'Claimable' ? (
                                // In Unclaimed view, show "POC" label with box styling to match other headers
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 3,
                                  height: 22,
                                  width: '100%',
                                  padding: '0 8px',
                                  background: 'transparent',
                                  border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.14)'}`,
                                  borderRadius: 0,
                                }}>
                                        <span style={{ 
                                          fontSize: 11, 
                                          fontWeight: 600, 
                                          color: isDarkMode ? colours.accent : colours.highlight, 
                                          textTransform: 'uppercase' 
                                        }}>
                                          CLAIMER
                                        </span>
                                </div>
                              ) : (
                              (() => {
                                const currentUserEmail = userData?.[0]?.Email?.toLowerCase() || '';
                                const currentUserInitials = userData?.[0]?.Initials ||
                                  teamData?.find(t => t.Email?.toLowerCase() === currentUserEmail)?.Initials ||
                                  currentUserEmail.split('@')[0]?.slice(0, 2).toUpperCase() || 'ME';
                                const isFiltered = !!selectedPocFilter;
                                const isFilteredToMe = selectedPocFilter?.toLowerCase() === currentUserEmail;

                                const getFilteredInitials = () => {
                                  if (!selectedPocFilter) return 'POC';
                                  if (selectedPocFilter.toLowerCase() === currentUserEmail) return currentUserInitials;
                                  const teamMember = teamData?.find(t => t.Email?.toLowerCase() === selectedPocFilter.toLowerCase());
                                  return teamMember?.Initials || selectedPocFilter.split('@')[0]?.slice(0, 2).toUpperCase() || 'POC';
                                };

                                const filterColor = isDarkMode ? colours.accent : colours.highlight;

                                if (!showMineOnly) {
                                  const pocOptions = [
                                    { email: currentUserEmail, label: `Me (${currentUserInitials})` },
                                    { email: 'team@helix-law.com', label: 'Team inbox' },
                                    ...(teamData || [])
                                      .filter((t) => !!t?.Email)
                                      .map((t) => ({
                                        email: (t.Email || '').toLowerCase(),
                                        label: `${t["Initials"] || ''} ${(t["Full Name"] || `${t["First"] || ''} ${t["Last"] || ''}`.trim() || t["Email"] || '')}`.trim(),
                                      })),
                                  ]
                                    .filter((opt) => !!opt.email)
                                    .filter((opt, idx, arr) => arr.findIndex((o) => o.email === opt.email) === idx);

                                  return (
                                    <div style={{ position: 'relative', width: '100%' }}>
                                      <button
                                        type="button"
                                        title={isFiltered ? `Filtering by ${getFilteredInitials()} - Click to change` : 'Filter by POC (click to select)'}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setIsPocDropdownOpen((prev) => !prev);
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: 3,
                                          height: 22,
                                          width: '100%',
                                          padding: '0 8px',
                                          background: isFiltered
                                            ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                            : 'transparent',
                                          border: isFiltered
                                            ? `1px solid ${colours.highlight}40`
                                            : `1px solid ${isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.14)'}`,
                                          borderRadius: 0,
                                          cursor: 'pointer',
                                          transition: 'all 150ms ease',
                                          opacity: isFiltered ? 1 : 0.85,
                                        }}
                                      >
                                        <span style={{ fontSize: 11, fontWeight: 600, color: filterColor, textTransform: 'uppercase' }}>
                                                CLAIMER
                                              </span>
                                        <Icon iconName="ChevronDown" styles={{ root: { fontSize: 8, color: filterColor, marginLeft: 1 } }} />
                                      </button>

                                      {isPocDropdownOpen && (
                                        <div
                                          className="poc-filter-dropdown"
                                          style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            marginTop: 4,
                                            minWidth: 200,
                                            background: isDarkMode ? 'rgba(30, 41, 59, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)'}`,
                                            borderRadius: 4,
                                            boxShadow: isDarkMode
                                              ? '0 4px 12px rgba(0, 0, 0, 0.4)'
                                              : '0 4px 12px rgba(0, 0, 0, 0.15)',
                                            zIndex: 1000,
                                            maxHeight: 260,
                                            overflowY: 'auto',
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSelectedPocFilter(null);
                                              setIsPocDropdownOpen(false);
                                              setPipelineScrollOffset(0);
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
                                          >
                                            <Icon iconName="Clear" styles={{ root: { fontSize: 10 } }} />
                                            <span>All POC</span>
                                          </button>

                                          {pocOptions.map((opt) => {
                                            const isSelected = selectedPocFilter?.toLowerCase() === opt.email;
                                            return (
                                              <button
                                                key={opt.email}
                                                type="button"
                                                onClick={() => {
                                                  setSelectedPocFilter(opt.email);
                                                  setIsPocDropdownOpen(false);
                                                  setPipelineScrollOffset(0);
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
                                              >
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label || opt.email}</span>
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
                                {
                                  const mineIsFiltered = isFilteredToMe;
                                  const mineFilterColor = mineIsFiltered
                                    ? colours.highlight
                                    : (isDarkMode ? colours.accent : colours.highlight);

                                  return (
                                    <button
                                      type="button"
                                      title={mineIsFiltered
                                        ? `Filtering by your POC (${currentUserInitials}) - Click to clear`
                                        : `Filter by your POC (${currentUserInitials})`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedPocFilter(mineIsFiltered ? null : currentUserEmail);
                                        setPipelineScrollOffset(0);
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 3,
                                        height: 22,
                                        width: '100%',
                                        padding: '0 8px',
                                        background: mineIsFiltered
                                          ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                          : 'transparent',
                                        border: mineIsFiltered
                                          ? `1px solid ${colours.highlight}40`
                                          : `1px solid ${isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.14)'}`,
                                        borderRadius: 0,
                                        cursor: 'pointer',
                                        transition: 'all 150ms ease',
                                        opacity: mineIsFiltered ? 1 : 0.85,
                                      }}
                                    >
                                      <span style={{ fontSize: 11, fontWeight: 600, color: mineFilterColor, textTransform: 'uppercase' }}>
                                        CLAIMER
                                      </span>
                                    </button>
                                  );
                                }
                              })()
                              )
                            )}

                            {/* Pitch - chip index 1 - tri-state toggle */}
                            {headerIsVisible(1) && (
                            (() => {
                              const filterState = getEnquiryStageFilterState('pitched');
                              const hasFilter = filterState !== null;
                              const getFilterColor = () => {
                                if (!filterState) return isDarkMode ? colours.accent : colours.highlight;
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
                                    gap: 4,
                                    height: 22,
                                    width: '100%',
                                    padding: '0 6px',
                                    background: hasFilter
                                      ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                      : 'transparent',
                                    border: hasFilter
                                      ? `1px solid ${filterColor}40`
                                      : `1px solid ${isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.14)'}`,
                                    borderRadius: 0,
                                    cursor: 'pointer',
                                    transition: 'all 150ms ease',
                                    opacity: hasFilter ? 1 : 0.85,
                                  }}
                                >
                                  <span style={{ fontSize: 11, fontWeight: 600, color: filterColor, textTransform: 'uppercase' }}>PITCH</span>
                                </button>
                              );
                            })()
                            )}

                            {/* Inst / ID / Pay / Risk / Matter - chip indices 2-6 - tri-state toggles */}
                            {([
                              { stage: 'instructed' as const, label: 'INSTRUCTION', icon: 'CheckMark', textIcon: null, chipIndex: 2 },
                              { stage: 'idcheck' as const, label: 'EID CHECK', icon: 'ContactCard', textIcon: null, chipIndex: 3 },
                              { stage: 'paid' as const, label: 'PAYMENT', icon: null, textIcon: '£', chipIndex: 4 },
                              { stage: 'risk' as const, label: 'RISK', icon: 'Shield', textIcon: null, chipIndex: 5 },
                              { stage: 'matter' as const, label: 'MATTER', icon: 'OpenFolderHorizontal', textIcon: null, chipIndex: 6 },
                            ] as const).filter(({ chipIndex }) => headerIsVisible(chipIndex)).map(({ stage, label, icon, textIcon }) => {
                              const filterState = getEnquiryStageFilterState(stage);
                              const hasFilter = filterState !== null;
                              const filterColor = !filterState
                                ? (isDarkMode ? colours.accent : colours.highlight)
                                : (filterState === 'yes' ? '#22c55e' : '#ef4444');
                              const stateLabel = filterState === 'yes' ? 'Has' : filterState === 'no' ? 'No' : null;

                              const fullLabel = pipelineStageUi.byStage.get(stage)?.fullLabel || label;
                              const shortLabel = pipelineStageUi.byStage.get(stage)?.shortLabel || label;

                              return (
                                <button
                                  key={stage}
                                  type="button"
                                  title={hasFilter
                                    ? `${label}: ${stateLabel} (click to cycle)`
                                    : `Filter by ${label} (click to activate)`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cycleEnquiryPipelineFilter(stage);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 4,
                                    height: 22,
                                    width: '100%',
                                    padding: '0 6px',
                                    background: hasFilter
                                      ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                      : 'transparent',
                                    border: hasFilter
                                      ? `1px solid ${filterColor}40`
                                      : `1px solid ${isDarkMode ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.14)'}`,
                                    borderRadius: 0,
                                    cursor: 'pointer',
                                    transition: 'all 150ms ease',
                                    opacity: hasFilter ? 1 : 0.85,
                                  }}
                                >
                                  <span style={{ fontSize: 11, fontWeight: 600, color: filterColor, textTransform: 'uppercase' }}>
                                    {label}
                                  </span>
                                </button>
                              );
                            })}

                            {/* Navigation chevron / Clear filters (gutter column; keeps header aligned with rows) */}
                            {pipelineNeedsCarousel ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  advancePipelineScroll('__header__', 7, visiblePipelineChipCount);
                                }}
                                title={headerHasMore ? `View more stages (${7 - headerVisibleEnd} hidden)` : 'Back to start'}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '100%',
                                  height: 22,
                                  padding: 0,
                                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)'}`,
                                  borderRadius: 0,
                                  background: headerHasMore 
                                    ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                                    : (isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.04)'),
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                  color: headerHasMore 
                                    ? colours.blue 
                                    : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.4)'),
                                }}
                              >
                                <Icon 
                                  iconName={headerHasMore ? 'ChevronRight' : 'Refresh'} 
                                  styles={{ 
                                    root: { 
                                      fontSize: headerHasMore ? 12 : 10, 
                                      color: 'inherit',
                                      opacity: headerHasMore ? 1 : 0.7,
                                    } 
                                  }} 
                                />
                              </button>
                            ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {(enquiryPipelineFilters.size > 0 || selectedPocFilter) && (
                                <button
                                  type="button"
                                  title="Clear all pipeline filters"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEnquiryPipelineFilters(new Map());
                                    setSelectedPocFilter(null);
                                    setPipelineScrollOffset(0);
                                    setPipelineRemeasureKey(k => k + 1);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 18,
                                    height: 18,
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
                            )}
                                </>
                              );
                            })()}
                          </div>
                      </div>
                      {/* Actions header - use same structure as row actions */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'flex-end', 
                        gap: '4px',
                        minWidth: 0,
                        width: '100%',
                      }}>
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

                    {/* Data Rows - mapped directly in same container */}
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
                              onMouseEnter={() => {
                                setHoveredDayKey(thisDayKey);
                              }}
                              onMouseLeave={() => {
                                setHoveredDayKey((prev) => (prev === thisDayKey ? null : prev));
                              }}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: `32px 1fr ${ACTIONS_COLUMN_WIDTH_PX}px`,
                                gap: '12px',
                                alignItems: 'center',
                                padding: '12px 16px',
                                cursor: 'pointer',
                                background: 'transparent',
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: hoveredDayKey === thisDayKey ? 800 : 700,
                                  color:
                                    hoveredDayKey === thisDayKey
                                      ? (isDarkMode ? colours.accent : colours.highlight)
                                      : (isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(71, 85, 105, 0.7)'),
                                  textTransform: hoveredDayKey === thisDayKey ? 'none' : 'uppercase',
                                  letterSpacing: '0.5px',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {formatDaySeparatorLabel(thisDayKey, hoveredDayKey === thisDayKey)}
                                </span>
                                <span style={{
                                  fontSize: '9px',
                                  fontWeight: 500,
                                  color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.55)',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {displayedItems.filter((enq) => {
                                    const enqDateStr = isGroupedEnquiry(enq) ? enq.latestDate : ((enq as any)?.Touchpoint_Date || (enq as any)?.datetime || (enq as any)?.claim || (enq as any)?.Date_Created || '');
                                    return groupToDayKey(enqDateStr) === thisDayKey;
                                  }).length}
                                </span>
                                <div style={{
                                  height: 1,
                                  flex: 1,
                                  background: isDarkMode
                                    ? 'linear-gradient(90deg, rgba(148,163,184,0.35), rgba(148,163,184,0.12), rgba(148,163,184,0))'
                                    : 'linear-gradient(90deg, rgba(148,163,184,0.45), rgba(148,163,184,0.2), rgba(148,163,184,0))',
                                }} />
                              </div>

                              {/* Chevron and collapsed eye indicator - aligned with actions column */}
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'flex-end',
                                gap: 4,
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
                                <Icon 
                                  iconName={isDayCollapsed ? 'ChevronRight' : 'ChevronDown'} 
                                  styles={{ 
                                    root: { 
                                      fontSize: 10, 
                                      color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.4)',
                                    } 
                                  }} 
                                />
                              </div>
                            </div>
                          )}
                          {/* Skip row if day is collapsed */}
                          {!isDayCollapsed && (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: TABLE_GRID_TEMPLATE_COLUMNS,
                              gap: `${TABLE_GRID_GAP_PX}px`,
                              padding: '10px 16px',
                              alignItems: 'center',
                              borderBottom: isLast ? 'none' : `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'}`,
                              fontSize: '13px',
                              color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)',
                              background: isDarkMode 
                                ? (idx % 2 === 0 ? 'rgba(14, 20, 38, 0.9)' : 'rgba(12, 18, 35, 0.85)')
                                : (idx % 2 === 0 ? 'rgba(255, 255, 255, 0.6)' : 'rgba(250, 252, 255, 0.5)'),
                              transition: 'background-color 0.15s ease',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = isDarkMode 
                                ? 'rgba(20, 30, 50, 0.95)' 
                                : 'rgba(255, 255, 255, 0.85)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = isDarkMode 
                                ? (idx % 2 === 0 ? 'rgba(14, 20, 38, 0.9)' : 'rgba(12, 18, 35, 0.85)')
                                : (idx % 2 === 0 ? 'rgba(255, 255, 255, 0.6)' : 'rgba(250, 252, 255, 0.5)');
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
                                background: getAreaOfWorkLineColor(latestEnquiry.Area_of_Work || '', isDarkMode, hoveredDayKey === thisDayKey),
                                opacity: hoveredDayKey === thisDayKey ? 1 : 0.9,
                                transition: 'background 0.15s ease, opacity 0.15s ease',
                              }} />
                            </div>

                            {/* Date column - stacked format */}
                            <TooltipHost
                              content={formatFullDateTime(dateReceived || null)}
                              styles={{ root: { display: 'flex', alignItems: 'center', height: '100%' } }}
                              calloutProps={{ gapSpace: 6 }}
                            >
                              {(() => {
                                const { top, bottom } = getStackedDateDisplay(dateReceived);
                                return (
                                  <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                    lineHeight: 1.1,
                                    justifyContent: 'center',
                                    fontVariantNumeric: 'tabular-nums',
                                  }}>
                                    <span style={{
                                      fontSize: '10px',
                                      color: isDarkMode ? 'rgba(255, 255, 255, 0.72)' : 'rgba(0, 0, 0, 0.62)',
                                      fontWeight: 600,
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {top}
                                    </span>
                                    <span style={{
                                      fontSize: '9px',
                                      color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.38)',
                                      fontWeight: 500,
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {bottom}
                                    </span>
                                  </div>
                                );
                              })()}
                            </TooltipHost>

                            {/* Area of Work column - empty for groups */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '100%' }}>
                              {/* Hidden for grouped enquiries */}
                            </div>

                            {/* ID column - empty for group headers */}
                            <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                              {/* Empty for grouped enquiries */}
                            </div>

                            {/* Contact & Company */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '100%' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  color: isDarkMode ? 'rgba(148, 163, 184, 0.65)' : 'rgba(100, 116, 139, 0.6)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.4px',
                                }}>
                                  Prospect
                                </div>
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

                            {/* Pipeline column - empty for group headers */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: '100%', flexWrap: 'wrap', overflow: 'hidden', fontSize: '10px' }}>
                              {/* Empty - individual claimer badges will show in child rows */}
                            </div>

                            {/* Actions column - contains chevron for group expansion */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                              <InlineExpansionChevron
                                isExpanded={expandedGroupsInTable.has(item.clientKey)}
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
                                isDarkMode={isDarkMode}
                                count={item.enquiries.length}
                                itemType="enquiry"
                              />
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
                            const childInlineWorkbenchItem = getEnquiryWorkbenchItem(childEnquiry);
                            const childHasInlineWorkbench = Boolean(childInlineWorkbenchItem);
                            const childPocIdentifier = childEnquiry.Point_of_Contact || (childEnquiry as any).poc || '';
                            const childPocEmail = childPocIdentifier.toLowerCase();
                            const childIsTeamInboxPoc = isUnclaimedPoc(childPocEmail);
                            const childClaimerInfo = claimerMap[childPocEmail];
                            const childClaimerLabel = childClaimerInfo?.Initials || getPocInitials(childPocIdentifier);
                            const childClaimerSecondary = childClaimerInfo?.DisplayName?.split(' ')[0] || (childEnquiry.Point_of_Contact || '').split('@')[0] || 'Claimed';
                            const childHasClaimer = !!childPocEmail && !childIsTeamInboxPoc;
                            const childShowClaimer = childHasClaimer && activeState !== 'Triaged';
                            const childRowHoverKey = buildEnquiryIdentityKey(childEnquiry);
                            const childShowDetails = hoveredRowKey === childRowHoverKey || hoveredDayKey === thisDayKey;
                            const childNameCopyKey = `name-${childRowHoverKey}`;
                            const isChildNameCopied = copiedNameKey === childNameCopyKey;
                            
                            // No day separators for child enquiries - parent group already has timeline marker
                            
                            return (
                              <React.Fragment key={`${childEnquiry.ID}-${childEnquiry.First_Name || ''}-${childEnquiry.Last_Name || ''}-${childEnquiry.Touchpoint_Date || ''}-${childEnquiry.Point_of_Contact || ''}`}>
                              <div
                                key={`item-${childEnquiry.ID}-${childEnquiry.First_Name || ''}-${childEnquiry.Last_Name || ''}-${childEnquiry.Touchpoint_Date || ''}-${childEnquiry.Point_of_Contact || ''}`}
                                className={(hoveredRowKey === childRowHoverKey || hoveredDayKey === thisDayKey)
                                  ? `pipeline-row-hover${(hoveredRowKeyReady === childRowHoverKey || hoveredDayKeyReady === thisDayKey) ? ' pipeline-row-hover-ready' : ''}`
                                  : undefined}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: TABLE_GRID_TEMPLATE_COLUMNS,
                                  gap: `${TABLE_GRID_GAP_PX}px`,
                                  padding: '8px 16px',
                                  alignItems: 'center',
                                  borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'}`,
                                  position: 'relative',
                                  fontSize: '13px',
                                  color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)',
                                  background: isDarkMode ? 'rgba(13, 19, 36, 0.85)' : 'rgba(255, 255, 255, 0.55)',
                                  cursor: 'pointer',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectEnquiry(childEnquiry);
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = isDarkMode 
                                    ? 'rgba(20, 30, 50, 0.95)' 
                                    : 'rgba(255, 255, 255, 0.85)';
                                  // Show child tooltip on hover
                                  const tooltip = e.currentTarget.querySelector('.child-timeline-date-tooltip') as HTMLElement;
                                  if (tooltip) tooltip.style.opacity = '1';
                                  setHoveredRowKey(childRowHoverKey);
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = isDarkMode 
                                    ? 'rgba(13, 19, 36, 0.85)' 
                                    : 'rgba(255, 255, 255, 0.55)';
                                  // Hide child tooltip
                                  const tooltip = e.currentTarget.querySelector('.child-timeline-date-tooltip') as HTMLElement;
                                  if (tooltip) tooltip.style.opacity = '0';
                                  setHoveredRowKey((prev) => (prev === childRowHoverKey ? null : prev));
                                }}
                              >
                                {/* Timeline cell - matches main row structure */}
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
                                    background: getAreaOfWorkLineColor(childAOW, isDarkMode, hoveredDayKey === thisDayKey),
                                    opacity: hoveredDayKey === thisDayKey ? 1 : 0.9,
                                  }} />
                                </div>

                                {/* Date column for child - stacked format */}
                                <TooltipHost
                                  content={formatFullDateTime(childEnquiry.Touchpoint_Date || (childEnquiry as any).datetime || (childEnquiry as any).claim || null)}
                                  styles={{ root: { display: 'flex', alignItems: 'center', height: '100%' } }}
                                  calloutProps={{ gapSpace: 6 }}
                                >
                                  {(() => {
                                    const childDateStr = childEnquiry.Touchpoint_Date || (childEnquiry as any).datetime || (childEnquiry as any).claim;
                                    const { top, bottom } = getStackedDateDisplay(childDateStr);
                                    return (
                                      <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '2px',
                                        lineHeight: 1.1,
                                        justifyContent: 'center',
                                        fontVariantNumeric: 'tabular-nums',
                                      }}>
                                        <span style={{
                                          fontSize: '10px',
                                          color: isDarkMode ? 'rgba(255, 255, 255, 0.72)' : 'rgba(0, 0, 0, 0.62)',
                                          fontWeight: 600,
                                          whiteSpace: 'nowrap',
                                        }}>
                                          {top}
                                        </span>
                                        <span style={{
                                          fontSize: '9px',
                                          color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.38)',
                                          fontWeight: 500,
                                          whiteSpace: 'nowrap',
                                        }}>
                                          {bottom}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </TooltipHost>

                                {/* AOW icon */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                  <span style={{ fontSize: '16px', lineHeight: 1, opacity: 0.85 }} title={childAOW}>
                                    {getAreaOfWorkIcon(childAOW)}
                                  </span>
                                </div>

                                {/* ID / Instruction Ref */}
                                <div style={{
                                  position: 'relative',
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
                                    transform: childShowDetails ? 'translateY(-4px)' : 'translateY(0)',
                                    transition: 'transform 160ms ease',
                                  }}>
                                    {childEnquiry.ID}
                                  </div>
                                  {(() => {
                                    const numValue = typeof childValue === 'string' ? parseFloat(childValue.replace(/[^0-9.]/g, '')) : (typeof childValue === 'number' ? childValue : 0);
                                    const displayValue = formatValueForDisplay(childValue);
                                    if (!displayValue) return null;

                                    let textColor;
                                    if (numValue >= 50000) {
                                      textColor = isDarkMode ? 'rgba(54, 144, 206, 1)' : 'rgba(54, 144, 206, 1)';
                                    } else if (numValue >= 10000) {
                                      textColor = isDarkMode ? 'rgba(54, 144, 206, 0.75)' : 'rgba(54, 144, 206, 0.75)';
                                    } else {
                                      textColor = isDarkMode ? 'rgba(54, 144, 206, 0.5)' : 'rgba(54, 144, 206, 0.55)';
                                    }

                                    return (
                                      <div
                                        style={{
                                          position: 'absolute',
                                          left: 0,
                                          top: '50%',
                                          display: 'flex',
                                          alignItems: 'center',
                                          opacity: childShowDetails ? 1 : 0,
                                          transform: childShowDetails ? 'translateY(4px)' : 'translateY(2px)',
                                          transition: 'opacity 140ms ease, transform 160ms ease',
                                          pointerEvents: 'none',
                                        }}
                                      >
                                        <span style={{
                                          fontSize: 10,
                                          fontWeight: 700,
                                          color: textColor,
                                          whiteSpace: 'nowrap',
                                        }}>
                                          {displayValue}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                  {childEnrichmentData?.pitchData?.displayNumber && (
                                    <div style={{
                                      fontFamily: 'Monaco, Consolas, monospace',
                                      fontSize: '9px',
                                      color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {childEnrichmentData.pitchData.displayNumber}
                                    </div>
                                  )}
                                </div>

                                {/* Contact & Company - stacked layout to match main rows */}
                                <div style={{ 
                                  position: 'relative',
                                  display: 'flex', 
                                  flexDirection: 'column', 
                                  gap: '2px', 
                                  lineHeight: 1.3,
                                  justifyContent: 'center' 
                                }}>
                                  {/* Name row */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{
                                      fontWeight: 500,
                                      fontSize: '13px',
                                      color: isDarkMode ? '#E5E7EB' : '#1F2937',
                                    }}>
                                      {childContactName}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleCopyName(childContactName, childNameCopyKey);
                                      }}
                                      title={isChildNameCopied ? 'Copied' : 'Copy name'}
                                      aria-label="Copy name"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: 18,
                                        height: 18,
                                        borderRadius: 5,
                                        border: isChildNameCopied
                                          ? `1px solid ${isDarkMode ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.38)'}`
                                          : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.12)'}`,
                                        background: isChildNameCopied
                                          ? (isDarkMode ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.12)')
                                          : 'transparent',
                                        color: isChildNameCopied
                                          ? '#10B981'
                                          : (isDarkMode ? 'rgba(203, 213, 225, 0.5)' : 'rgba(71, 85, 105, 0.55)'),
                                        cursor: 'pointer',
                                        padding: 0,
                                        opacity: isChildNameCopied ? 1 : 0.5,
                                        boxShadow: isChildNameCopied
                                          ? (isDarkMode ? '0 0 0 1px rgba(16, 185, 129, 0.15)' : '0 0 0 1px rgba(16, 185, 129, 0.12)')
                                          : 'none',
                                        transform: isChildNameCopied ? 'scale(1.06)' : 'scale(1)',
                                        transition: 'opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 160ms ease, box-shadow 160ms ease, background 160ms ease',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (isChildNameCopied) return;
                                        e.currentTarget.style.opacity = '0.9';
                                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.3)';
                                        e.currentTarget.style.color = isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.85)';
                                      }}
                                      onMouseLeave={(e) => {
                                        if (isChildNameCopied) return;
                                        e.currentTarget.style.opacity = '0.5';
                                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.12)';
                                        e.currentTarget.style.color = isDarkMode ? 'rgba(203, 213, 225, 0.5)' : 'rgba(71, 85, 105, 0.55)';
                                      }}
                                    >
                                      <Icon
                                        iconName={isChildNameCopied ? 'CompletedSolid' : 'Copy'}
                                        styles={{
                                          root: {
                                            fontSize: 10,
                                            transform: isChildNameCopied ? 'scale(1.05)' : 'scale(1)',
                                            transition: 'transform 160ms ease, color 160ms ease',
                                            color: isChildNameCopied ? '#10B981' : undefined,
                                          },
                                        }}
                                      />
                                    </button>
                                  </div>
                                  
                                  {/* Email row - stacked below name */}
                                  {childEnquiry.Email && (
                                    <div
                                      style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: '50%',
                                        fontSize: '10px',
                                        color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
                                        maxWidth: '200px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        opacity: childShowDetails ? 1 : 0,
                                        transform: childShowDetails ? 'translateY(6px)' : 'translateY(3px)',
                                        transition: 'opacity 140ms ease, transform 160ms ease',
                                        pointerEvents: 'none',
                                      }}
                                    >
                                      {childEnquiry.Email}
                                    </div>
                                  )}
                                </div>

                                {/* Pipeline for child */}
                                {(() => {
                                  const childTeamsData = childEnrichmentData?.teamsData as any;
                                  const childTeamsTime = childIsV2 && childTeamsData
                                    ? (childTeamsData.MessageTimestamp
                                      || childTeamsData.CreatedAt
                                      || (childTeamsData.CreatedAtMs ? new Date(childTeamsData.CreatedAtMs).toISOString() : null))
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

                                  const showTeamsStage = childIsV2 && !!childTeamsData;
                                  const showLegacyPlaceholder = childIsLegacy;
                                  // Determine loading vs not-resolvable state for V2 enquiries
                                  const childEnrichmentWasProcessed = childEnrichmentData && childEnrichmentData.enquiryId;
                                  const showLoadingState = childIsV2 && !childEnrichmentWasProcessed && !childIsLegacy && !childTeamsTime;
                                  
                                  // If loading, show full placeholder pipeline
                                  if (showLoadingState) {
                                    return (
                                      <div style={{ position: 'relative', height: '100%', width: '100%', minWidth: 0, overflow: 'hidden' }}>
                                        <div
                                          style={{
                                            display: 'grid',
                                            gridTemplateColumns: pipelineNeedsCarousel 
                                              ? `repeat(${visiblePipelineChipCount}, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`
                                              : `repeat(7, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`,
                                            columnGap: 8,
                                            alignItems: 'center',
                                            width: '100%',
                                            minWidth: 0,
                                            height: '100%',
                                          }}
                                        >
                                          {(() => {
                                            const loadingOffset = getPipelineScrollOffset(childEnquiry.ID);
                                            const loadingVisibleEnd = loadingOffset + visiblePipelineChipCount;
                                            const loadingIsVisible = (idx: number) => 
                                              !pipelineNeedsCarousel || (idx >= loadingOffset && idx < loadingVisibleEnd);
                                            
                                            return [
                                              { icon: 'TeamsLogo', label: 'POC' },
                                              { icon: 'Send', label: 'Pitch' },
                                              { icon: 'CheckMark', label: 'Inst' },
                                              { icon: 'ContactCard', label: 'ID' },
                                              { icon: 'CurrencyPound', label: 'Pay' },
                                              { icon: 'Shield', label: 'Risk' },
                                              { icon: 'OpenFolderHorizontal', label: 'Matter' },
                                            ].map((stage, idx) => {
                                              if (!loadingIsVisible(idx)) return null;
                                              return (
                                                <div
                                                  key={idx}
                                                  style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: '100%',
                                                    height: 22,
                                                    animation: `pipeline-pulse 1.5s ease-in-out infinite ${idx * 0.1}s`,
                                                  }}
                                                >
                                                  {renderPipelineIcon(
                                                    stage.icon,
                                                    isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)',
                                                    14
                                                  )}
                                                </div>
                                              );
                                            });
                                          })()}
                                          {/* Nav button for carousel mode */}
                                          {pipelineNeedsCarousel ? (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                advancePipelineScroll(childEnquiry.ID, 7, visiblePipelineChipCount);
                                              }}
                                              title="View more stages"
                                              style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '100%',
                                                height: 22,
                                                padding: 0,
                                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)'}`,
                                                borderRadius: 0,
                                                background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease',
                                                color: colours.blue,
                                              }}
                                            >
                                              <Icon iconName="ChevronRight" styles={{ root: { fontSize: 12, color: 'inherit' } }} />
                                            </button>
                                          ) : (
                                            <div />
                                          )}
                                        </div>
                                        <style>{`
                                          @keyframes pipeline-pulse {
                                            0%, 100% { opacity: 0.3; }
                                            50% { opacity: 0.7; }
                                          }
                                        `}</style>
                                      </div>
                                    );
                                  }
                                  const showNotResolvable = childIsV2 && childEnrichmentWasProcessed && !childEnrichmentData?.teamsData && !childIsLegacy;
                                  const showClaimer = childHasClaimer && activeState !== 'Triaged' && !childIsTeamInboxPoc;
                                  const pitchData = childEnrichmentData?.pitchData as any;
                                  const showPitch = !!pitchData;
                                  const pitchColor = getScenarioColor(pitchData?.scenarioId);
                                  const pitchedDate = pitchData?.PitchedDate || pitchData?.pitchedDate || pitchData?.pitched_date || '';
                                  const pitchedTime = pitchData?.PitchedTime || pitchData?.pitchedTime || pitchData?.pitched_time || '';
                                  const pitchedBy = pitchData?.PitchedBy || pitchData?.pitchedBy || pitchData?.pitched_by || '';
                                  const pitchScenarioId = pitchData?.scenarioId || pitchData?.scenario_id || '';
                                  const pitchMatterRef = pitchData?.displayNumber || pitchData?.display_number || '';
                                  const pitchedDateParsed = combineDateAndTime(pitchedDate, pitchedTime);
                                  const pitchChipLabel = pitchedDateParsed
                                    ? `${format(pitchedDateParsed, 'd MMM')} ${format(pitchedDateParsed, 'HH:mm')}`
                                    : '';
                                  const pitchedStamp = pitchedDateParsed
                                    ? `Pitched ${format(pitchedDateParsed, 'dd MMM HH:mm')}`
                                    : 'Pitched';
                                  // Only show pitch CTA when we're certain there's no pitch (enrichment was processed)
                                  const showPitchCTA = showClaimer && !childIsTeamInboxPoc && childEnrichmentWasProcessed && !showPitch;
                                  // Pitch is the next action if POC is done but not pitched yet
                                  const isPitchNextAction = (showTeamsStage || showClaimer) && !showPitch;

                                  // Pipeline carousel state for this row
                                  const childPipelineOffset = getPipelineScrollOffset(childEnquiry.ID);
                                  const childVisibleEnd = childPipelineOffset + visiblePipelineChipCount;
                                  const childHasMoreChips = pipelineNeedsCarousel && childPipelineOffset < 7 - visiblePipelineChipCount;
                                  const childIsChipVisible = (chipIndex: number) => 
                                    !pipelineNeedsCarousel || (chipIndex >= childPipelineOffset && chipIndex < childVisibleEnd);
                                  
                                  // Dynamic grid columns based on carousel state
                                  const childGridCols = pipelineNeedsCarousel 
                                    ? `repeat(${visiblePipelineChipCount}, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`
                                    : `repeat(7, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`;
                                  
                                  // Cascade animation helper
                                  const getCascadeStyle = (chipIndex: number) => ({
                                    animation: childEnrichmentWasProcessed ? `pipeline-cascade 0.35s cubic-bezier(0.4, 0, 0.2, 1) ${chipIndex * 0.12}s both` : 'none',
                                  });

                                  return (
                                    <div style={{ position: 'relative', height: '100%', width: '100%', minWidth: 0, overflow: 'hidden' }}>
                                      <div
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: childGridCols,
                                          columnGap: 8,
                                          alignItems: 'center',
                                          width: '100%',
                                          minWidth: 0,
                                          height: '100%',
                                        }}
                                      >
                                        {/* POC - merged Teams+Claim - chip index 0 */}
                                          {childIsChipVisible(0) && (
                                          <div style={{ ...getCascadeStyle(0), display: 'flex', justifyContent: 'center', justifySelf: 'center', width: 'fit-content' }}>
                                        <>
                                          {(() => {
                                            // Merged POC chip: Teams icon + claimer initials + chevron
                                            const hasPocActivity = showTeamsStage || showClaimer;
                                            const isUnclaimed = !showClaimer || childIsTeamInboxPoc;
                                            const pocColor = hasPocActivity ? colours.green : (isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)');
                                            const teamsIconColor = showTeamsStage 
                                              ? (isDarkMode ? 'rgba(54, 144, 206, 0.85)' : 'rgba(54, 144, 206, 0.75)')
                                              : (isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)');
                                            
                                            if (showLegacyPlaceholder && !showClaimer) {
                                              // Legacy enquiry with no claim
                                              return (
                                                <div
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
                                                    justifyContent: 'center',
                                                    flexShrink: 0,
                                                  }}
                                                >
                                                  <span style={{ fontSize: 9 }}>legacy</span>
                                                </div>
                                              );
                                            }
                                            
                                            if (isUnclaimed) {
                                              // Unclaimed - show subtle claim prompt
                                              return renderClaimPromptChip({
                                                size: 'compact',
                                                teamsLink: childTeamsLink,
                                                leadName: childContactName,
                                                areaOfWork: childEnquiry['Area_of_Work'],
                                                enquiryId: childEnquiry.ID,
                                                dataSource: childIsV2 ? 'new' : 'legacy',
                                                iconOnly: true,
                                              });
                                            }
                                            
                                            // Claimed - show Teams icon + initials + chevron
                                            return (
                                              <button
                                                className="pipeline-chip"
                                                onClick={(e) => handleReassignClick(String(childEnquiry.ID), e)}
                                                onMouseEnter={(e) => showPipelineHover(e, {
                                                  title: 'POC',
                                                  status: `${showTeamsStage ? 'Card + ' : ''}Claimed by ${childPocIdentifier}`,
                                                  subtitle: childContactName,
                                                  color: colours.green,
                                                  iconName: 'TeamsLogo',
                                                })}
                                                onMouseMove={movePipelineHover}
                                                onMouseLeave={hidePipelineHover}
                                                style={{
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  gap: 4,
                                                  height: 22,
                                                  padding: '0 4px',
                                                  borderRadius: 0,
                                                  border: 'none',
                                                  background: 'transparent',
                                                  color: colours.green,
                                                  fontSize: 10,
                                                  fontWeight: 700,
                                                  textTransform: 'uppercase',
                                                  letterSpacing: '0.3px',
                                                  cursor: 'pointer',
                                                  fontFamily: 'inherit',
                                                  flexShrink: 0,
                                                }}
                                              >
                                                <Icon iconName="TeamsLogo" styles={{ root: { fontSize: 14, color: teamsIconColor, flexShrink: 0 } }} />
                                                <span style={{ width: 22, textAlign: 'center' }}>{childClaimerLabel}</span>
                                                <Icon iconName="ChevronDown" styles={{ root: { fontSize: 8, color: 'inherit', opacity: 0.6 } }} />
                                              </button>
                                            );
                                          })()}
                                        </>
                                        </div>
                                        )}

                                        {/* Pitch - chip index 1 */}
                                        {childIsChipVisible(1) && (
                                        <div data-chip-index="1" className={isPitchNextAction ? 'next-action-subtle-pulse' : ''} style={getCascadeStyle(1)}>
                                        <>
                                          {showPitch ? (
                                            <button
                                              type="button"
                                              className="pipeline-chip pipeline-chip-reveal"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openEnquiryWorkbench(childEnquiry, 'Timeline', { filter: 'pitch' });
                                              }}
                                              onMouseEnter={(e) => showPipelineHover(e, {
                                                title: 'Pitch Sent',
                                                status: pitchedStamp,
                                                subtitle: childContactName,
                                                color: pitchColor,
                                                iconName: 'Send',
                                                details: [
                                                  ...(pitchedBy ? [{ label: 'By', value: pitchedBy }] : []),
                                                  ...(pitchScenarioId ? [{ label: 'Scenario', value: `#${pitchScenarioId}` }] : []),
                                                  ...(pitchMatterRef ? [{ label: 'Matter', value: pitchMatterRef }] : []),
                                                ],
                                              })}
                                              onMouseMove={movePipelineHover}
                                              onMouseLeave={hidePipelineHover}
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '100%',
                                                minHeight: 24,
                                                height: 'auto',
                                                padding: 0,
                                                borderRadius: 0,
                                                border: 'none',
                                                background: 'transparent',
                                                cursor: 'pointer',
                                                fontFamily: 'inherit',
                                                overflow: 'visible',
                                              }}
                                            >
                                              <span className="pipeline-chip-box">
                                                <Icon iconName="Send" styles={{ root: { fontSize: 14, color: pitchColor } }} />
                                                <span
                                                  className="pipeline-chip-label"
                                                  style={{ color: pitchColor }}
                                                >
                                                  {pitchChipLabel}
                                                </span>
                                              </span>
                                            </button>
                                          ) : showPitchCTA ? (
                                            <button
                                              type="button"
                                              className="pipeline-chip"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openEnquiryWorkbench(childEnquiry, 'Pitch');
                                              }}
                                              onMouseEnter={(e) => showPipelineHover(e, {
                                                title: 'Pitch',
                                                status: 'Ready to pitch',
                                                subtitle: childContactName,
                                                color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.6)',
                                                iconName: 'Send',
                                              })}
                                              onMouseMove={movePipelineHover}
                                              onMouseLeave={hidePipelineHover}
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '100%',
                                                height: 22,
                                                padding: 0,
                                                borderRadius: 0,
                                                border: 'none',
                                                background: 'transparent',
                                                cursor: 'pointer',
                                                fontFamily: 'inherit',
                                              }}
                                            >
                                              <Icon iconName="Send" styles={{ root: { fontSize: 14, color: isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)' } }} />
                                            </button>
                                          ) : (
                                            <div
                                              onMouseEnter={(e) => showPipelineHover(e, {
                                                title: 'Pitch',
                                                status: 'Not pitched',
                                                subtitle: childContactName,
                                                color: pitchColor,
                                                iconName: 'Send',
                                              })}
                                              onMouseMove={movePipelineHover}
                                              onMouseLeave={hidePipelineHover}
                                              style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '100%',
                                                height: 22,
                                                border: 'none',
                                                borderRadius: 0,
                                                background: 'transparent',
                                              }}
                                            >
                                              <Icon iconName="Send" styles={{ root: { fontSize: 14, color: isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)' } }} />
                                            </div>
                                          )}
                                        </>
                                        </div>
                                        )}

                                        {/* Post-pitch stages - chip indices 3-7 */}
                                        {(() => {
                                          const inst = childInlineWorkbenchItem?.instruction;
                                          const deal = childInlineWorkbenchItem?.deal;
                                          // Only use deal's InstructionRef if deal is not in "pitched" status (pitched deals don't have actual instructions)
                                          const dealStatus = (deal?.Status ?? deal?.status ?? '').toLowerCase();
                                          const dealHasInstruction = dealStatus !== 'pitched' && dealStatus !== '';
                                          const instructionRef = (inst?.InstructionRef ?? inst?.instructionRef ?? (dealHasInstruction ? (deal?.InstructionRef ?? deal?.instructionRef) : undefined)) as string | undefined;
                                          const instructionDateRaw = 
                                            inst?.SubmissionDate ?? 
                                            inst?.submissionDate ?? 
                                            inst?.SubmissionDateTime ??
                                            inst?.submissionDateTime ??
                                            inst?.InstructionDateTime ??
                                            inst?.instructionDateTime ??
                                            inst?.SubmittedAt ??
                                            inst?.submittedAt ??
                                            inst?.CreatedAt ?? 
                                            inst?.createdAt ?? 
                                            inst?.CreatedOn ??
                                            inst?.createdOn ??
                                            inst?.DateCreated ?? 
                                            inst?.created_at ?? 
                                            inst?.InstructionDate ?? 
                                            inst?.InstructionDate ?? 
                                            inst?.instructionDate ??
                                            // Fallback to deal CloseDate when inst is null
                                            deal?.CloseDate ??
                                            deal?.closeDate ??
                                            deal?.close_date;
                                          const instructionTimeRaw = 
                                            inst?.SubmissionTime ?? 
                                            inst?.submissionTime ?? 
                                            inst?.SubmissionTimeUtc ??
                                            inst?.submissionTimeUtc ??
                                            // Fallback to deal CloseTime when inst is null
                                            deal?.CloseTime ??
                                            deal?.closeTime ??
                                            deal?.close_time;
                                          // Parse instruction date with robust handling
                                          const instructionDateParsed = combineDateAndTime(instructionDateRaw, instructionTimeRaw);
                                          const instructionStamp = instructionDateParsed
                                            ? format(instructionDateParsed, 'dd MMM HH:mm')
                                            : '';
                                          // Short chip label for instruction date + time
                                          const instructionChipLabel = instructionDateParsed
                                            ? `${format(instructionDateParsed, 'd MMM')} ${format(instructionDateParsed, 'HH:mm')}`
                                            : '--';
                                          // Extra instruction data for rich tooltip
                                          const instructionStage = inst?.Stage ?? inst?.stage ?? deal?.Stage ?? deal?.Status ?? deal?.status ?? '';
                                          const instructionServiceDesc = deal?.ServiceDescription ?? deal?.serviceDescription ?? inst?.ServiceDescription ?? '';
                                          const instructionAmount = deal?.Amount ?? deal?.amount ?? inst?.Amount;
                                          const instructionAmountText = instructionAmount && !isNaN(Number(instructionAmount))
                                            ? `£${Number(instructionAmount).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
                                            : '';
                                          // Shell entries (checkout opened but not submitted) have InstructionRef but no submission data
                                          // Only mark as having instruction if there's actual submission date OR stage indicates completion
                                          const stageLower = instructionStage.toLowerCase();
                                          const isShellEntry = Boolean(instructionRef) && (stageLower === 'initialised' || stageLower === 'pitched' || stageLower === 'opened' || stageLower === '');
                                          const hasInstruction = Boolean(instructionRef) && (Boolean(instructionDateParsed) || !isShellEntry);
                                          const hasEid = Boolean(childInlineWorkbenchItem?.eid);
                                          const eidResult = (childInlineWorkbenchItem?.eid as any)?.EIDOverallResult?.toLowerCase() ?? '';
                                          // EID counts as "done" only if result is positive
                                          const eidPassed = eidResult === 'passed' || eidResult === 'pass' || eidResult === 'verified' || eidResult === 'approved';
                                          const eidColor = eidPassed ? colours.green : eidResult === 'refer' ? colours.orange : eidResult === 'review' ? colours.red : colours.highlight;
                                          const eidLabel = eidPassed ? 'Pass' : eidResult === 'refer' ? 'Refer' : eidResult === 'review' ? 'Review' : eidResult || 'ID';
                                          
                                          // Payment detection with method and confirmation status
                                          const payments = Array.isArray(childInlineWorkbenchItem?.payments) ? childInlineWorkbenchItem.payments : [];
                                          const latestPayment = payments[0] as any;
                                          const methodRaw = (
                                            latestPayment?.payment_method || 
                                            latestPayment?.payment_type || 
                                            latestPayment?.method || 
                                            latestPayment?.paymentMethod ||
                                            latestPayment?.PaymentMethod ||
                                            ''
                                          ).toString().toLowerCase();
                                          const meta = typeof latestPayment?.metadata === 'object' ? latestPayment.metadata : {};
                                          const metaMethod = (meta?.payment_method || meta?.method || meta?.paymentMethod || '').toString().toLowerCase();
                                          const intentId = (latestPayment?.payment_intent_id || latestPayment?.paymentIntentId || '').toString();
                                          const intentIsBank = intentId.startsWith('bank_');
                                          const intentIsCard = intentId.startsWith('pi_');
                                          const combinedMethod = methodRaw || metaMethod || (intentIsBank ? 'bank' : intentIsCard ? 'card' : '');
                                          const isCardPayment = combinedMethod.includes('card') || combinedMethod.includes('stripe') || combinedMethod === 'cc' || intentIsCard;
                                          const isBankPayment = combinedMethod.includes('bank') || combinedMethod.includes('transfer') || combinedMethod.includes('bacs') || intentIsBank;
                                          // DB column is payment_status, but also check status/Status variants
                                          const paymentStatus = (latestPayment?.payment_status || latestPayment?.paymentStatus || latestPayment?.status || latestPayment?.Status || '').toString().toLowerCase();
                                          const isSucceededStatus = paymentStatus === 'succeeded' || paymentStatus === 'success' || paymentStatus === 'complete' || paymentStatus === 'completed' || paymentStatus === 'paid';
                                          const isCardConfirmed = isCardPayment && isSucceededStatus;
                                          const isBankConfirmed = isBankPayment && (latestPayment?.confirmed === true || latestPayment?.Confirmed === true || paymentStatus === 'confirmed');
                                          // Also treat as confirmed if status is succeeded even if method not detected
                                          const hasConfirmedPayment = isCardConfirmed || isBankConfirmed || isSucceededStatus;
                                          const hasPayment = payments.length > 0;
                                          const paymentLabel = hasConfirmedPayment ? 'Paid' : hasPayment ? (isBankPayment ? 'Pending' : '£') : '£';
                                          const paymentIcon = hasConfirmedPayment
                                            ? (isCardPayment ? 'PaymentCard' : 'Bank')
                                            : 'CurrencyPound';
                                          const paymentColor = hasConfirmedPayment ? colours.green : hasPayment ? (isBankPayment ? colours.orange : colours.blue) : colours.blue;
                                          const paymentTitle = hasConfirmedPayment 
                                            ? `Paid via ${isCardPayment ? 'card' : 'bank transfer'}` 
                                            : hasPayment 
                                              ? (isBankPayment ? 'Bank payment awaiting confirmation' : 'Payment recorded')
                                              : 'No payment yet';
                                          const paymentAmountRaw = latestPayment?.amount ?? latestPayment?.Amount ?? latestPayment?.value ?? latestPayment?.Value;
                                          const paymentAmountNumber = typeof paymentAmountRaw === 'string' ? parseFloat(paymentAmountRaw) : paymentAmountRaw;
                                          const paymentAmount = Number.isFinite(paymentAmountNumber) ? paymentAmountNumber : null;
                                          const paymentAmountText = paymentAmount !== null
                                            ? `£${paymentAmount.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
                                            : null;
                                          
                                          const hasRisk = Boolean(childInlineWorkbenchItem?.risk);
                                          const riskResult = (childInlineWorkbenchItem?.risk as any)?.RiskAssessmentResult?.toLowerCase() ?? '';
                                          const riskIcon = riskResult === 'low' || riskResult === 'approved' ? 'ShieldSolid' : riskResult === 'medium' ? 'HalfCircle' : 'Shield';
                                          const riskLabel = riskResult ? `${riskResult.charAt(0).toUpperCase()}${riskResult.slice(1)}` : 'Recorded';
                                          const hasMatter = Boolean(inst?.MatterId ?? inst?.matterId) || (Array.isArray(childInlineWorkbenchItem?.matters) && childInlineWorkbenchItem.matters.length > 0);
                                          const childMatterRecord = Array.isArray(childInlineWorkbenchItem?.matters) ? childInlineWorkbenchItem.matters[0] : null;
                                          const childMatterRef = (childMatterRecord?.DisplayNumber || childMatterRecord?.['Display Number'] || childMatterRecord?.displayNumber || childMatterRecord?.display_number || inst?.MatterId || inst?.matterId) as string | undefined;
                                          const shouldShowPostPitch = Boolean(childInlineWorkbenchItem) || showPitch;

                                          // Determine next incomplete stage in pipeline order (7 stages after merging Teams+Claim into POC)
                                          const hasPocActivity = showTeamsStage || showClaimer;
                                          const pipelineStages = [
                                            { done: hasPocActivity, index: 0, inPlay: true },
                                            { done: showPitch, index: 1, inPlay: true },
                                            { done: hasInstruction, index: 2, inPlay: shouldShowPostPitch },
                                            { done: eidPassed, index: 3, inPlay: shouldShowPostPitch },
                                            { done: hasConfirmedPayment, index: 4, inPlay: shouldShowPostPitch },
                                            { done: hasRisk, index: 5, inPlay: shouldShowPostPitch },
                                            { done: hasMatter, index: 6, inPlay: shouldShowPostPitch },
                                          ];
                                          const nextIncompleteIndex = pipelineStages.find(s => s.inPlay && !s.done)?.index ?? -1;

                                          const renderMiniChip = (props: any) => (
                                            <MiniPipelineChip
                                              {...props}
                                              isDarkMode={isDarkMode}
                                              onMouseEnter={(e: React.MouseEvent) => showPipelineHover(e, {
                                                title: props.fullLabel,
                                                status: props.statusText || (props.done ? 'Complete' : 'Not started'),
                                                subtitle: props.subtitle,
                                                color: props.color,
                                                iconName: props.iconName,
                                                details: props.details,
                                              })}
                                              onMouseMove={movePipelineHover}
                                              onMouseLeave={hidePipelineHover}
                                            />
                                          );

                                          return (
                                            <>
                                              {/* Inst - chip index 2 */}
                                              {(pipelineNeedsCarousel ? childIsChipVisible(2) : (shouldShowPostPitch || childIsChipVisible(2))) && (
                                              <div data-chip-index="2" style={getCascadeStyle(2)}>
                                              {renderMiniChip({
                                                shortLabel: hasInstruction ? instructionChipLabel : (isShellEntry && instructionRef ? 'Opened' : '--'),
                                                fullLabel: "Instruction",
                                                done: shouldShowPostPitch && hasInstruction,
                                                inProgress: isShellEntry && Boolean(instructionRef) && showPitch && !hasInstruction,
                                                color: colours.green,
                                                iconName: "CheckMark",
                                                showConnector: true,
                                                prevDone: showPitch,
                                                statusText: hasInstruction ? `Instructed ${instructionStamp}` : (isShellEntry && instructionRef ? 'Checkout opened - awaiting submission' : 'Not instructed'),
                                                subtitle: childContactName,
                                                title: hasInstruction ? `Instructed (${instructionRef})` : (isShellEntry && instructionRef ? `Checkout opened (${instructionRef})` : 'Not instructed yet'),
                                                isNextAction: !isShellEntry && nextIncompleteIndex === 2,
                                                details: hasInstruction ? [
                                                  { label: 'Ref', value: instructionRef || '' },
                                                  ...(instructionStage ? [{ label: 'Stage', value: instructionStage }] : []),
                                                  ...(instructionServiceDesc ? [{ label: 'Service', value: instructionServiceDesc }] : []),
                                                  ...(instructionAmountText ? [{ label: 'Value', value: instructionAmountText }] : []),
                                                ] : undefined,
                                                onClick: (e: React.MouseEvent) => {
                                                  e.stopPropagation();
                                                  openEnquiryWorkbench(childEnquiry, 'Timeline', { filter: 'pitch' });
                                                }
                                              })}
                                              </div>
                                              )}
                                              {/* ID - chip index 3 */}
                                              {(pipelineNeedsCarousel ? childIsChipVisible(3) : (shouldShowPostPitch || childIsChipVisible(3))) && (
                                              <div data-chip-index="3" style={getCascadeStyle(3)}>
                                              {renderMiniChip({
                                                shortLabel: hasEid ? eidLabel : 'ID',
                                                fullLabel: hasEid ? eidLabel : 'ID Check',
                                                done: shouldShowPostPitch && hasEid,
                                                color: hasEid ? eidColor : colours.highlight,
                                                iconName: "ContactCard",
                                                showConnector: true,
                                                prevDone: hasInstruction,
                                                statusText: hasEid ? `EID ${eidLabel}` : 'EID not started',
                                                subtitle: childContactName,
                                                title: hasEid ? `ID: ${eidLabel}` : 'ID not started',
                                                isNextAction: nextIncompleteIndex === 3,
                                                onClick: (e: React.MouseEvent) => {
                                                  e.stopPropagation();
                                                  openEnquiryWorkbench(childEnquiry, 'Timeline', { filter: 'pitch' });
                                                }
                                              })}
                                              </div>
                                              )}
                                              {/* Pay - chip index 4 */}
                                              {(pipelineNeedsCarousel ? childIsChipVisible(4) : (shouldShowPostPitch || childIsChipVisible(4))) && (
                                              <div data-chip-index="4" style={getCascadeStyle(4)}>
                                              {renderMiniChip({
                                                shortLabel: paymentLabel,
                                                fullLabel: hasConfirmedPayment ? 'Paid' : hasPayment ? (isBankPayment ? 'Pending' : 'Payment') : 'Payment',
                                                done: shouldShowPostPitch && hasConfirmedPayment,
                                                inProgress: shouldShowPostPitch && hasPayment && !hasConfirmedPayment,
                                                color: paymentColor,
                                                iconName: paymentIcon,
                                                showConnector: true,
                                                prevDone: eidPassed,
                                                statusText: hasConfirmedPayment ? `Paid${paymentAmountText ? ` ${paymentAmountText}` : ''}` : hasPayment ? `${isBankPayment ? 'Pending' : 'Payment'}${paymentAmountText ? ` ${paymentAmountText}` : ''}` : 'No payment',
                                                subtitle: childContactName,
                                                title: paymentTitle,
                                                isNextAction: nextIncompleteIndex === 4,
                                                onClick: (e: React.MouseEvent) => {
                                                  e.stopPropagation();
                                                  openEnquiryWorkbench(childEnquiry, 'Timeline', { filter: 'pitch' });
                                                }
                                              })}
                                              </div>
                                              )}
                                              {/* Risk - chip index 5 */}
                                              {(pipelineNeedsCarousel ? childIsChipVisible(5) : (shouldShowPostPitch || childIsChipVisible(5))) && (
                                              <div data-chip-index="5" style={getCascadeStyle(5)}>
                                              {renderMiniChip({
                                                shortLabel: hasRisk ? riskLabel : "Risk",
                                                fullLabel: "Risk",
                                                done: shouldShowPostPitch && hasRisk,
                                                color: colours.green,
                                                iconName: riskIcon,
                                                showConnector: true,
                                                prevDone: hasConfirmedPayment,
                                                statusText: hasRisk ? `Risk ${riskLabel}` : 'No risk record',
                                                subtitle: childContactName,
                                                title: hasRisk ? 'Risk record present' : 'Risk not started',
                                                isNextAction: nextIncompleteIndex === 5,
                                                onClick: (e: React.MouseEvent) => {
                                                  e.stopPropagation();
                                                  openEnquiryWorkbench(childEnquiry, 'Timeline', { filter: 'pitch' });
                                                }
                                              })}
                                              </div>
                                              )}
                                              {/* Matter - chip index 6 */}
                                              {(pipelineNeedsCarousel ? childIsChipVisible(6) : (shouldShowPostPitch || childIsChipVisible(6))) && (
                                              <div data-chip-index="6" style={getCascadeStyle(6)}>
                                              {renderMiniChip({
                                                shortLabel: hasMatter && childMatterRef ? childMatterRef : "Matter",
                                                fullLabel: "Matter",
                                                done: shouldShowPostPitch && hasMatter,
                                                color: colours.green,
                                                iconName: "OpenFolderHorizontal",
                                                showConnector: true,
                                                prevDone: hasRisk,
                                                statusText: hasMatter ? `Matter ${childMatterRef ?? 'linked'}` : 'No matter yet',
                                                subtitle: childContactName,
                                                title: hasMatter ? 'Matter linked/opened' : 'Matter not opened',
                                                isNextAction: nextIncompleteIndex === 6,
                                                onClick: (e: React.MouseEvent) => {
                                                  e.stopPropagation();
                                                  openEnquiryWorkbench(childEnquiry, 'Timeline', { filter: 'pitch' });
                                                }
                                              })}
                                              </div>
                                              )}
                                            </>
                                          );
                                        })()}

                                        {/* Navigation chevron for carousel OR empty gutter */}
                                        {pipelineNeedsCarousel ? (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              advancePipelineScroll(childEnquiry.ID, 7, visiblePipelineChipCount);
                                            }}
                                            title={childHasMoreChips ? `View more stages (${7 - childVisibleEnd} hidden)` : 'Back to start'}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              width: '100%',
                                              height: 22,
                                              padding: 0,
                                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)'}`,
                                              borderRadius: 0,
                                              background: childHasMoreChips 
                                                ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                                                : (isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.04)'),
                                              cursor: 'pointer',
                                              transition: 'all 0.15s ease',
                                              color: childHasMoreChips 
                                                ? colours.blue 
                                                : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.4)'),
                                            }}
                                          >
                                            <Icon 
                                              iconName={childHasMoreChips ? 'ChevronRight' : 'Refresh'} 
                                              styles={{ 
                                                root: { 
                                                  fontSize: childHasMoreChips ? 12 : 10, 
                                                  color: 'inherit',
                                                  opacity: childHasMoreChips ? 1 : 0.7,
                                                } 
                                              }} 
                                            />
                                          </button>
                                        ) : (
                                          <div />
                                        )}
                                      </div>

                                    </div>
                                  );
                                })()}

                                {/* Actions Column for Child Enquiry */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                {/* Call / Email / Rate actions (no hover) */}
                                {childShowClaimer && !childIsTeamInboxPoc && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={!(childEnquiry.Phone_Number || (childEnquiry as any).phone)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const phone = childEnquiry.Phone_Number || (childEnquiry as any).phone;
                                        if (phone) window.open(`tel:${phone}`, '_self');
                                      }}
                                      style={{
                                        width: 22,
                                        height: 22,
                                        borderRadius: 0,
                                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                                        background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
                                        color: isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)',
                                        opacity: (childEnquiry.Phone_Number || (childEnquiry as any).phone) ? 1 : 0.3,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: (childEnquiry.Phone_Number || (childEnquiry as any).phone) ? 'pointer' : 'default',
                                        transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (childEnquiry.Phone_Number || (childEnquiry as any).phone) {
                                          e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)';
                                          e.currentTarget.style.borderColor = colours.blue;
                                          e.currentTarget.style.color = colours.blue;
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)';
                                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)';
                                        e.currentTarget.style.color = isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)';
                                      }}
                                      title={(childEnquiry.Phone_Number || (childEnquiry as any).phone) ? `Call ${childEnquiry.Phone_Number || (childEnquiry as any).phone}` : 'No phone number'}
                                    >
                                      <Icon iconName="Phone" styles={{ root: { fontSize: 11 } }} />
                                    </button>

                                    {childEnquiry.Email && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          window.open(`mailto:${childEnquiry.Email}`, '_blank');
                                        }}
                                        style={{
                                          width: 22,
                                          height: 22,
                                          borderRadius: 0,
                                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                                          background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
                                          color: isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer',
                                          transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
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

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRate(childEnquiry.ID);
                                      }}
                                      style={{
                                        width: 22,
                                        height: 22,
                                        borderRadius: 0,
                                        border: `1px solid ${getRatingChipMeta(childEnquiry.Rating, isDarkMode).borderColor}`,
                                        background: getRatingChipMeta(childEnquiry.Rating, isDarkMode).background,
                                        color: getRatingChipMeta(childEnquiry.Rating, isDarkMode).color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                                      }}
                                      onMouseEnter={(e) => {
                                        const meta = getRatingChipMeta(childEnquiry.Rating, isDarkMode);
                                        e.currentTarget.style.background = meta.hoverBackground;
                                        e.currentTarget.style.borderColor = meta.hoverBorderColor;
                                        e.currentTarget.style.color = meta.hoverColor;
                                      }}
                                      onMouseLeave={(e) => {
                                        const meta = getRatingChipMeta(childEnquiry.Rating, isDarkMode);
                                        e.currentTarget.style.background = meta.background;
                                        e.currentTarget.style.borderColor = meta.borderColor;
                                        e.currentTarget.style.color = meta.color;
                                      }}
                                      title={childEnquiry.Rating ? `Rating: ${childEnquiry.Rating} - Click to change` : 'Rate this enquiry'}
                                    >
                                      <Icon iconName={getRatingChipMeta(childEnquiry.Rating, isDarkMode).iconName} styles={{ root: { fontSize: 11 } }} />
                                    </button>
                                  </>
                                )}
                                {/* Notes chevron - always show, disabled when no content */}
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!(childHasNotes || childHasInlineWorkbench)) return; // Do nothing if disabled
                                    const newSet = new Set(expandedNotesInTable);
                                    if (childNotesExpanded) {
                                      newSet.delete(childNoteKey);
                                    } else {
                                      newSet.add(childNoteKey);
                                    }
                                    setExpandedNotesInTable(newSet);
                                  }}
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: 0,
                                    background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.08)',
                                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: (childHasNotes || childHasInlineWorkbench) ? 'pointer' : 'default',
                                    transition: 'all 0.2s ease',
                                    opacity: (childHasNotes || childHasInlineWorkbench) ? 1 : 0.4,
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!(childHasNotes || childHasInlineWorkbench)) return;
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)';
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.08)';
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                  title={
                                    !(childHasNotes || childHasInlineWorkbench)
                                      ? 'No notes'
                                      : childNotesExpanded
                                        ? 'Collapse'
                                        : (childHasNotes && childHasInlineWorkbench
                                          ? 'Show notes & workbench'
                                          : (childHasNotes ? 'Show notes' : 'Show workbench'))
                                  }
                                >
                                  <Icon 
                                    iconName={childNotesExpanded ? 'ChevronUp' : 'ChevronDown'} 
                                    styles={{ 
                                      root: { 
                                        fontSize: '10px', 
                                        color: isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)' 
                                      } 
                                    }} 
                                  />
                                </div>
                                {areActionsEnabled && (
                                  <>
                                    {/* Edit Button */}
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingEnquiry(childEnquiry);
                                        setShowEditModal(true);
                                      }}
                                      style={{
                                        width: 22,
                                        height: 22,
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
                                      title="Edit enquiry"
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
                                        width: 22,
                                        height: 22,
                                        borderRadius: 0,
                                        background: isDarkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(248, 113, 113, 0.08)',
                                        border: `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.3)' : 'rgba(248, 113, 113, 0.2)'}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(248, 113, 113, 0.15)' : 'rgba(248, 113, 113, 0.12)';
                                        e.currentTarget.style.transform = 'scale(1.05)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(248, 113, 113, 0.08)';
                                        e.currentTarget.style.transform = 'scale(1)';
                                      }}
                                      title="Delete enquiry (requires passcode)"
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
                                  </>
                                )}
                                </div>
                              </div>
                              
                              {/* Child expanded section - notes only */}
                              {childNotesExpanded && childHasNotes && (
                                <div style={{
                                  padding: '12px 60px 12px 32px',
                                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.008)',
                                  borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'}`,
                                  fontSize: '10px',
                                  lineHeight: '1.5',
                                  color: isDarkMode ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.65)',
                                  whiteSpace: 'pre-line',
                                  marginLeft: '20px',
                                }}>
                                  <div style={{
                                    fontSize: '9px',
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

                        // Extract values for display using correct property names
                        const contactName = `${item.First_Name || ''} ${item.Last_Name || ''}`.trim() || 'Unknown';
                        const areaOfWork = item.Area_of_Work || 'Unspecified';
                        const dateReceived = item.Touchpoint_Date || item.Date_Created || '';
                        const rawValue: any = (item as any).Value ?? (item as any).value ?? '';
                        const value = typeof rawValue === 'string' 
                          ? rawValue.replace(/^£\s*/, '').trim() 
                          : rawValue;
                        const isFromInstructions = (item as any).source === 'instructions';
                        const hasNotes = item.Initial_first_call_notes && item.Initial_first_call_notes.trim().length > 0;
                        const noteKey = buildEnquiryIdentityKey(item);
                        const isNotesExpanded = expandedNotesInTable.has(noteKey);
                        const nameCopyKey = `name-${noteKey}`;
                        const isNameCopied = copiedNameKey === nameCopyKey;
                        const inlineWorkbenchItem = getEnquiryWorkbenchItem(item);
                        const hasInlineWorkbench = Boolean(inlineWorkbenchItem);
                        const enrichmentDataKey = item.ID ?? (item as any).id ?? '';
                        const enrichmentData = enrichmentDataKey
                          ? enrichmentMap.get(String(enrichmentDataKey))
                          : undefined;
                        const mainPocValue = (item.Point_of_Contact || (item as any).poc || '').toLowerCase();
                        const isMainTeamInboxPoc = isUnclaimedPoc(mainPocValue);
                        const mainShowClaimer = !!mainPocValue && activeState !== 'Triaged' && !isMainTeamInboxPoc;
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
                        const rowHoverKey = buildEnquiryIdentityKey(item);
                        const showRowDetails = hoveredRowKey === rowHoverKey || hoveredDayKey === singleDayKey;

                        return (
                          <React.Fragment key={`${item.ID}-${item.First_Name || ''}-${item.Last_Name || ''}-${item.Touchpoint_Date || ''}-${item.Point_of_Contact || ''}`}>
                          {/* Day separator with timeline dot */}
                          {showDaySeparator && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleDayCollapse(singleDayKey);
                              }}
                              onMouseEnter={() => {
                                setHoveredDayKey(singleDayKey);
                              }}
                              onMouseLeave={() => {
                                setHoveredDayKey((prev) => (prev === singleDayKey ? null : prev));
                              }}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: `32px 1fr ${ACTIONS_COLUMN_WIDTH_PX}px`,
                                gap: '12px',
                                alignItems: 'center',
                                padding: '12px 16px',
                                cursor: 'pointer',
                                background: 'transparent',
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
                              {/* Day label */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: hoveredDayKey === singleDayKey ? 800 : 700,
                                  color:
                                    hoveredDayKey === singleDayKey
                                      ? (isDarkMode ? colours.accent : colours.highlight)
                                      : (isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(71, 85, 105, 0.7)'),
                                  textTransform: hoveredDayKey === singleDayKey ? 'none' : 'uppercase',
                                  letterSpacing: '0.5px',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {formatDaySeparatorLabel(singleDayKey, hoveredDayKey === singleDayKey)}
                                </span>
                                <span style={{
                                  fontSize: '9px',
                                  fontWeight: 500,
                                  color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.55)',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {displayedItems.filter((enq) => {
                                    const enqDateStr = isGroupedEnquiry(enq) ? enq.latestDate : ((enq as any)?.Touchpoint_Date || (enq as any)?.datetime || (enq as any)?.claim || (enq as any)?.Date_Created || '');
                                    return toDayKey(enqDateStr) === singleDayKey;
                                  }).length}
                                </span>
                                <div style={{
                                  height: 1,
                                  flex: 1,
                                  background: isDarkMode
                                    ? 'linear-gradient(90deg, rgba(148,163,184,0.35), rgba(148,163,184,0.12), rgba(148,163,184,0))'
                                    : 'linear-gradient(90deg, rgba(148,163,184,0.45), rgba(148,163,184,0.2), rgba(148,163,184,0))',
                                }} />
                              </div>

                              {/* Chevron and collapsed eye indicator - aligned with actions column */}
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'flex-end',
                                gap: 4,
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
                                <Icon 
                                  iconName={isSingleDayCollapsed ? 'ChevronRight' : 'ChevronDown'} 
                                  styles={{ 
                                    root: { 
                                      fontSize: 10, 
                                      color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.4)',
                                    } 
                                  }} 
                                />
                              </div>
                            </div>
                          )}
                          {/* Skip row if day is collapsed */}
                          {!isSingleDayCollapsed && (
                          <div
                            data-enquiry-id={item.ID ? String(item.ID) : undefined}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: TABLE_GRID_TEMPLATE_COLUMNS,
                              gap: `${TABLE_GRID_GAP_PX}px`,
                              padding: '10px 16px',
                              alignItems: 'center',
                              borderBottom: (isLast && !isNotesExpanded) ? 'none' : `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'}`,
                              fontSize: '13px',
                              color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)',
                              background: isDarkMode 
                                ? (idx % 2 === 0 ? 'rgba(14, 20, 38, 0.9)' : 'rgba(12, 18, 35, 0.85)')
                                : (idx % 2 === 0 ? 'rgba(255, 255, 255, 0.6)' : 'rgba(250, 252, 255, 0.5)'),
                              transition: 'background-color 0.15s ease',
                              opacity: isFromInstructions ? 1 : 0.85,
                              cursor: 'pointer',
                            }}
                            className={`enquiry-row${(hoveredRowKey === rowHoverKey || hoveredDayKey === singleDayKey) ? ' pipeline-row-hover' : ''}${(hoveredRowKeyReady === rowHoverKey || hoveredDayKeyReady === singleDayKey) ? ' pipeline-row-hover-ready' : ''}`}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = isDarkMode 
                                ? 'rgba(20, 30, 50, 0.95)' 
                                : 'rgba(255, 255, 255, 0.85)';
                              // Show tooltip on hover
                              const tooltip = e.currentTarget.querySelector('.timeline-date-tooltip') as HTMLElement;
                              if (tooltip) tooltip.style.opacity = '1';
                              setHoveredRowKey(rowHoverKey);
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = isDarkMode 
                                ? (idx % 2 === 0 ? 'rgba(14, 20, 38, 0.9)' : 'rgba(12, 18, 35, 0.85)')
                                : (idx % 2 === 0 ? 'rgba(255, 255, 255, 0.6)' : 'rgba(250, 252, 255, 0.5)');
                              // Hide tooltip
                              const tooltip = e.currentTarget.querySelector('.timeline-date-tooltip') as HTMLElement;
                              if (tooltip) tooltip.style.opacity = '0';
                              setHoveredRowKey((prev) => (prev === rowHoverKey ? null : prev));
                            }}
                            onClick={() => !isUnclaimed && handleSelectEnquiryToPitch(item)}
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
                                background: getAreaOfWorkLineColor(areaOfWork, isDarkMode, hoveredDayKey === singleDayKey),
                                opacity: hoveredDayKey === singleDayKey ? 1 : 0.9,
                                transition: 'background 0.15s ease, opacity 0.15s ease',
                              }} />
                            </div>

                            {/* Date column - stacked format */}
                            <TooltipHost
                              content={fullDateTooltip}
                              styles={{ root: { display: 'flex', alignItems: 'center', height: '100%' } }}
                              calloutProps={{ gapSpace: 6 }}
                            >
                              {(() => {
                                const { top, bottom } = getStackedDateDisplay(dateReceived);
                                return (
                                  <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                    lineHeight: 1.1,
                                    justifyContent: 'center',
                                    fontVariantNumeric: 'tabular-nums',
                                  }}>
                                    <span style={{
                                      fontSize: '10px',
                                      color: isDarkMode ? 'rgba(255, 255, 255, 0.72)' : 'rgba(0, 0, 0, 0.62)',
                                      fontWeight: 600,
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {top}
                                    </span>
                                    <span style={{
                                      fontSize: '9px',
                                      color: isDarkMode ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.38)',
                                      fontWeight: 500,
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {bottom}
                                    </span>
                                  </div>
                                );
                              })()}
                            </TooltipHost>

                            {/* Area of Work - second */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                              <span style={{ fontSize: '18px', lineHeight: 1 }} title={areaOfWork}>
                                {getAreaOfWorkIcon(areaOfWork)}
                              </span>
                            </div>

                            {/* ID / Instruction Ref */}
                            <div style={{
                              position: 'relative',
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
                                transform: showRowDetails ? 'translateY(-4px)' : 'translateY(0)',
                                transition: 'transform 160ms ease',
                              }}>
                                {item.ID}
                              </div>
                              {(() => {
                                const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) : (typeof value === 'number' ? value : 0);
                                const displayValue = formatValueForDisplay(value);
                                if (!displayValue) return null;

                                let textColor;
                                if (numValue >= 50000) {
                                  textColor = isDarkMode ? 'rgba(54, 144, 206, 1)' : 'rgba(54, 144, 206, 1)';
                                } else if (numValue >= 10000) {
                                  textColor = isDarkMode ? 'rgba(54, 144, 206, 0.75)' : 'rgba(54, 144, 206, 0.75)';
                                } else {
                                  textColor = isDarkMode ? 'rgba(54, 144, 206, 0.5)' : 'rgba(54, 144, 206, 0.55)';
                                }

                                return (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      left: 0,
                                      top: '50%',
                                      display: 'flex',
                                      alignItems: 'center',
                                      opacity: showRowDetails ? 1 : 0,
                                      transform: showRowDetails ? 'translateY(4px)' : 'translateY(2px)',
                                      transition: 'opacity 140ms ease, transform 160ms ease',
                                      pointerEvents: 'none',
                                    }}
                                  >
                                    <span style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: textColor,
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {displayValue}
                                    </span>
                                  </div>
                                );
                              })()}
                              {enrichmentData?.pitchData?.displayNumber && (
                                <div style={{
                                  fontFamily: 'Monaco, Consolas, monospace',
                                  fontSize: '9px',
                                  color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {enrichmentData.pitchData.displayNumber}
                                </div>
                              )}
                            </div>

                            {/* Contact - stacked layout: name on top, email · phone below */}
                            <div style={{ 
                              position: 'relative',
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: '2px', 
                              lineHeight: 1.3,
                              justifyContent: 'center',
                            }}>
                              {/* Name row */}
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                transform: showRowDetails ? 'translateY(-4px)' : 'translateY(0)',
                                transition: 'transform 160ms ease',
                              }}>
                                <span style={{ 
                                  fontSize: '13px', 
                                  fontWeight: 500, 
                                  color: isDarkMode ? '#E5E7EB' : '#1F2937', 
                                }}>
                                  {contactName}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleCopyName(contactName, nameCopyKey);
                                  }}
                                  title={isNameCopied ? 'Copied' : 'Copy name'}
                                  aria-label="Copy name"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 18,
                                    height: 18,
                                    borderRadius: 5,
                                    border: isNameCopied
                                      ? `1px solid ${isDarkMode ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.38)'}`
                                      : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.12)'}`,
                                    background: isNameCopied
                                      ? (isDarkMode ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.12)')
                                      : 'transparent',
                                    color: isNameCopied
                                      ? '#10B981'
                                      : (isDarkMode ? 'rgba(203, 213, 225, 0.5)' : 'rgba(71, 85, 105, 0.55)'),
                                    cursor: 'pointer',
                                    padding: 0,
                                    opacity: isNameCopied ? 1 : 0.5,
                                    boxShadow: isNameCopied
                                      ? (isDarkMode ? '0 0 0 1px rgba(16, 185, 129, 0.15)' : '0 0 0 1px rgba(16, 185, 129, 0.12)')
                                      : 'none',
                                    transform: isNameCopied ? 'scale(1.06)' : 'scale(1)',
                                    transition: 'opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 160ms ease, box-shadow 160ms ease, background 160ms ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    if (isNameCopied) return;
                                    e.currentTarget.style.opacity = '0.9';
                                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.3)';
                                    e.currentTarget.style.color = isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.85)';
                                  }}
                                  onMouseLeave={(e) => {
                                    if (isNameCopied) return;
                                    e.currentTarget.style.opacity = '0.5';
                                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.12)';
                                    e.currentTarget.style.color = isDarkMode ? 'rgba(203, 213, 225, 0.5)' : 'rgba(71, 85, 105, 0.55)';
                                  }}
                                >
                                  <Icon
                                    iconName={isNameCopied ? 'CompletedSolid' : 'Copy'}
                                    styles={{
                                      root: {
                                        fontSize: 10,
                                        transform: isNameCopied ? 'scale(1.05)' : 'scale(1)',
                                        transition: 'transform 160ms ease, color 160ms ease',
                                        color: isNameCopied ? '#10B981' : undefined,
                                      },
                                    }}
                                  />
                                </button>
                              </div>
                              
                              {/* Email row */}
                              <div style={{ 
                                fontSize: '10px', 
                                color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0',
                              }}>
                                {item.Email && (
                                  <span
                                    style={{
                                      position: 'absolute',
                                      left: 0,
                                      top: '50%',
                                      maxWidth: '200px',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      opacity: showRowDetails ? 1 : 0,
                                      transform: showRowDetails ? 'translateY(6px)' : 'translateY(3px)',
                                      transition: 'opacity 140ms ease, transform 160ms ease',
                                      pointerEvents: 'none',
                                    }}
                                  >
                                    {item.Email}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Pipeline - Teams → POC → Pitch */}
                            {(() => {
                              const isV2Enquiry = (item as any).__sourceType === 'new' || (item as any).source === 'instructions';
                              const teamsData = enrichmentData?.teamsData as any;
                              const teamsTime = isV2Enquiry && teamsData
                                ? (teamsData.MessageTimestamp
                                  || teamsData.CreatedAt
                                  || (teamsData.CreatedAtMs ? new Date(teamsData.CreatedAtMs).toISOString() : null))
                                : null;
                              const pocClaimTime = (item as any).claim || null;
                              const pitchData = enrichmentData?.pitchData as any;
                              const pitchTime = pitchData ? (pitchData.PitchedDate || pitchData.pitchedDate) : null;
                                      const pitchedDate = pitchData?.PitchedDate || pitchData?.pitchedDate || pitchData?.pitched_date || '';
                                      const pitchedTime = pitchData?.PitchedTime || pitchData?.pitchedTime || pitchData?.pitched_time || '';
                              const pitchedBy = pitchData?.PitchedBy || pitchData?.pitchedBy || pitchData?.pitched_by || '';
                              const pitchScenarioId = pitchData?.scenarioId || pitchData?.scenario_id || '';
                              const pitchMatterRef = pitchData?.displayNumber || pitchData?.display_number || '';
                              const pitchedDateParsed = combineDateAndTime(pitchedDate, pitchedTime);
                              const pitchChipLabel = pitchedDateParsed
                                ? `${format(pitchedDateParsed, 'd MMM')} ${format(pitchedDateParsed, 'HH:mm')}`
                                : '';
                              const pitchedStamp = pitchedDateParsed
                                ? `Pitched ${format(pitchedDateParsed, 'dd MMM HH:mm')}`
                                : 'Pitched';
                              
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
                              
                              const showTeamsStage = isV2Enquiry && !!teamsData;
                              const showLegacyPlaceholder = isDefinitelyLegacy;
                              // Determine loading vs not-resolvable state for V2 enquiries
                              // - enrichmentData exists but no teamsData = processed, not resolvable
                              // - enrichmentData doesn't exist = still loading
                              const enrichmentWasProcessed = enrichmentData && enrichmentData.enquiryId;
                              const showLoadingState = isV2Enquiry && !enrichmentWasProcessed && !isDefinitelyLegacy && !teamsTime;
                              
                              // If loading, show full placeholder pipeline
                              if (showLoadingState) {
                                return (
                                  <div style={{ position: 'relative', height: '100%', width: '100%', minWidth: 0, overflow: 'hidden' }}>
                                    <div
                                      style={{
                                        display: 'grid',
                                        gridTemplateColumns: pipelineNeedsCarousel 
                                          ? `repeat(${visiblePipelineChipCount}, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`
                                          : `repeat(7, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`,
                                        columnGap: 8,
                                        alignItems: 'center',
                                        width: '100%',
                                        minWidth: 0,
                                        height: '100%',
                                      }}
                                    >
                                      {[
                                        { icon: 'TeamsLogo', label: 'POC' },
                                        { icon: 'Send', label: 'Pitch' },
                                        { icon: 'CheckMark', label: 'Inst' },
                                        { icon: 'ContactCard', label: 'ID' },
                                        { icon: 'CurrencyPound', label: 'Pay' },
                                        { icon: 'Shield', label: 'Risk' },
                                        { icon: 'OpenFolderHorizontal', label: 'Matter' },
                                      ].map((stage, idx) => {
                                        const mainPipelineOffset = getPipelineScrollOffset(item.ID);
                                        const mainVisibleEnd = mainPipelineOffset + visiblePipelineChipCount;
                                        const isVisible = !pipelineNeedsCarousel || (idx >= mainPipelineOffset && idx < mainVisibleEnd);
                                        
                                        if (!isVisible) return null;
                                        
                                        return (
                                          <div
                                            key={idx}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              width: '100%',
                                              height: 22,
                                              animation: `pipeline-pulse 1.5s ease-in-out infinite ${idx * 0.1}s`,
                                            }}
                                          >
                                            {renderPipelineIcon(
                                              stage.icon,
                                              isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)',
                                              14
                                            )}
                                          </div>
                                        );
                                      })}
                                      {/* Nav button for carousel mode */}
                                      {pipelineNeedsCarousel ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            advancePipelineScroll(item.ID, 7, visiblePipelineChipCount);
                                          }}
                                          title="View more stages"
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '100%',
                                            height: 22,
                                            padding: 0,
                                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)'}`,
                                            borderRadius: 0,
                                            background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            color: colours.blue,
                                          }}
                                        >
                                          <Icon iconName="ChevronRight" styles={{ root: { fontSize: 12, color: 'inherit' } }} />
                                        </button>
                                      ) : (
                                        <div />
                                      )}
                                    </div>
                                    <style>{`
                                      @keyframes pipeline-pulse {
                                        0%, 100% { opacity: 0.3; }
                                        50% { opacity: 0.7; }
                                      }
                                    `}</style>
                                  </div>
                                );
                              }
                              
                              // Treat team inbox / empty POC as unclaimed - don't show as "claimed"
                              const isTeamInboxPoc = isUnclaimedPoc(pocLower);
                              const showClaimer = hasClaimerStage && activeState !== 'Triaged' && !isTeamInboxPoc;
                              const claimerInfo = claimerMap[pocLower];
                              const claimerLabel = claimerInfo?.Initials || getPocInitials(pocDisplayName);
                              const showPitch = !!enrichmentData?.pitchData;
                              const pitchColor = getScenarioColor(enrichmentData?.pitchData?.scenarioId);
                              // Only show pitch CTA when we're certain there's no pitch (enrichment was processed)
                              // This prevents the yellow flash on initial load
                              const showPitchCTA = showClaimer && !isTeamInboxPoc && enrichmentWasProcessed && !showPitch;
                              // Pitch is next action if POC stage is done (claimed) but not yet pitched
                              const isPitchNextAction = (showTeamsStage || showClaimer) && !showPitch;
                              
                              // Pipeline carousel state for this row
                              const mainPipelineOffset = getPipelineScrollOffset(item.ID);
                              const mainVisibleEnd = mainPipelineOffset + visiblePipelineChipCount;
                              const mainHasMoreChips = pipelineNeedsCarousel && mainPipelineOffset < 7 - visiblePipelineChipCount;
                              const mainIsChipVisible = (chipIndex: number) => 
                                !pipelineNeedsCarousel || (chipIndex >= mainPipelineOffset && chipIndex < mainVisibleEnd);
                              
                              // Dynamic grid columns based on carousel state
                              const mainGridCols = pipelineNeedsCarousel 
                                ? `repeat(${visiblePipelineChipCount}, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`
                                : `repeat(7, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr)) 24px`;
                              
                              // Cascade animation helper
                              const getMainCascadeStyle = (chipIndex: number) => ({
                                animation: enrichmentWasProcessed ? `pipeline-cascade 0.35s cubic-bezier(0.4, 0, 0.2, 1) ${chipIndex * 0.12}s both` : 'none',
                              });
                              
                              return (
                                <div style={{ position: 'relative', height: '100%', width: '100%', minWidth: 0, overflow: 'hidden' }}>
                                  <div
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: mainGridCols,
                                      columnGap: 8,
                                      alignItems: 'center',
                                      width: '100%',
                                      minWidth: 0,
                                      height: '100%',
                                    }}
                                  >
                                    {/* POC - merged Teams + Claim - chip index 0 */}
                                    {mainIsChipVisible(0) && (
                                    <div style={{ ...getMainCascadeStyle(0), display: 'flex', justifyContent: 'center', justifySelf: 'center', width: 'fit-content' }}>
                                      {(() => {
                                        const hasPocActivity = showTeamsStage || showClaimer;
                                        const pocIconColor = hasPocActivity
                                          ? (isDarkMode ? 'rgba(54, 144, 206, 0.85)' : 'rgba(54, 144, 206, 0.75)')
                                          : (isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)');
                                        const initialsColor = showClaimer
                                          ? colours.green
                                          : (isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.35)');
                                        
                                        // Show legacy placeholder
                                        if (showLegacyPlaceholder && !showClaimer && !showTeamsStage) {
                                          return (
                                            <div
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
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                              }}
                                            >
                                              <span style={{ fontSize: 9 }}>legacy</span>
                                            </div>
                                          );
                                        }
                                        
                                        // Unclaimed state - show subtle claim prompt
                                        if (!showClaimer) {
                                          return renderClaimPromptChip({
                                            teamsLink: enquiryTeamsLink,
                                            leadName: contactName,
                                            areaOfWork: item['Area_of_Work'],
                                            enquiryId: item.ID,
                                            dataSource: isFromInstructions ? 'new' : 'legacy',
                                            iconOnly: true,
                                          });
                                        }
                                        
                                        // Claimed state - show initials with reassign chevron
                                        return (
                                          <button
                                            className="pipeline-chip"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const link = teamsData?.teamsLink || getAreaSpecificChannelUrl(item['Area_of_Work']);
                                              if (link) window.open(link, '_blank');
                                            }}
                                            onMouseEnter={(e) => showPipelineHover(e, {
                                              title: 'POC',
                                              status: showTeamsStage ? `${pocDisplayName} - Teams activity` : `Claimed by ${pocDisplayName}`,
                                              subtitle: contactName,
                                              color: colours.blue,
                                              iconName: 'TeamsLogo',
                                            })}
                                            onMouseMove={movePipelineHover}
                                            onMouseLeave={hidePipelineHover}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              gap: 4,
                                              height: 22,
                                              padding: '0 4px',
                                              borderRadius: 0,
                                              border: 'none',
                                              background: 'transparent',
                                              cursor: 'pointer',
                                              fontFamily: 'inherit',
                                              flexShrink: 0,
                                            }}
                                          >
                                            <Icon iconName="TeamsLogo" styles={{ root: { fontSize: 14, color: pocIconColor, flexShrink: 0 } }} />
                                            <span style={{
                                              width: 22,
                                              textAlign: 'center',
                                              fontSize: 10,
                                              fontWeight: 700,
                                              color: initialsColor,
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.3px',
                                            }}>
                                              {claimerLabel}
                                            </span>
                                            <Icon 
                                              iconName="ChevronDown" 
                                              onClick={(e: React.MouseEvent) => {
                                                e.stopPropagation();
                                                handleReassignClick(String(item.ID), e as any);
                                              }}
                                              styles={{ root: { fontSize: 8, color: initialsColor, opacity: 0.6, cursor: 'pointer' } }} 
                                            />
                                          </button>
                                        );
                                      })()}
                                    </div>
                                    )}

                                    {/* Pitch - chip index 1 */}
                                    {mainIsChipVisible(1) && (
                                    <div data-chip-index="1" className={isPitchNextAction ? 'next-action-subtle-pulse' : ''} style={getMainCascadeStyle(1)}>
                                      {showPitch ? (
                                        <button
                                          type="button"
                                          className="pipeline-chip pipeline-chip-reveal"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openEnquiryWorkbench(item, 'Timeline', { filter: 'pitch' });
                                          }}
                                          onMouseEnter={(e) => showPipelineHover(e, {
                                            title: 'Pitch Sent',
                                            status: pitchedStamp,
                                            subtitle: contactName,
                                            color: pitchColor,
                                            iconName: 'Send',
                                            details: [
                                              ...(pitchedBy ? [{ label: 'By', value: pitchedBy }] : []),
                                              ...(pitchScenarioId ? [{ label: 'Scenario', value: `#${pitchScenarioId}` }] : []),
                                              ...(pitchMatterRef ? [{ label: 'Matter', value: pitchMatterRef }] : []),
                                            ],
                                          })}
                                          onMouseMove={movePipelineHover}
                                          onMouseLeave={hidePipelineHover}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '100%',
                                            minHeight: 24,
                                            height: 'auto',
                                            padding: 0,
                                            borderRadius: 0,
                                            border: 'none',
                                            background: 'transparent',
                                            cursor: 'pointer',
                                            fontFamily: 'inherit',
                                            overflow: 'visible',
                                          }}
                                        >
                                          <span className="pipeline-chip-box">
                                            <Icon iconName="Send" styles={{ root: { fontSize: 14, color: pitchColor } }} />
                                            <span
                                              className="pipeline-chip-label"
                                              style={{ color: pitchColor }}
                                            >
                                              {pitchChipLabel}
                                            </span>
                                          </span>
                                        </button>
                                      ) : showPitchCTA ? (
                                        <button
                                          type="button"
                                          className="pipeline-chip"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openEnquiryWorkbench(item, 'Pitch');
                                          }}
                                          onMouseEnter={(e) => showPipelineHover(e, {
                                            title: 'Pitch',
                                            status: 'Ready to pitch',
                                            subtitle: contactName,
                                            color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.6)',
                                            iconName: 'Send',
                                          })}
                                          onMouseMove={movePipelineHover}
                                          onMouseLeave={hidePipelineHover}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '100%',
                                            height: 22,
                                            padding: 0,
                                            borderRadius: 0,
                                            border: 'none',
                                            background: 'transparent',
                                            cursor: 'pointer',
                                            fontFamily: 'inherit',
                                          }}
                                        >
                                          <Icon iconName="Send" styles={{ root: { fontSize: 14, color: isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)' } }} />
                                        </button>
                                      ) : (
                                        <div
                                          onMouseEnter={(e) => showPipelineHover(e, {
                                            title: 'Pitch',
                                            status: 'Not pitched',
                                            subtitle: contactName,
                                            color: pitchColor,
                                            iconName: 'Send',
                                          })}
                                          onMouseMove={movePipelineHover}
                                          onMouseLeave={hidePipelineHover}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '100%',
                                            height: 22,
                                            border: 'none',
                                            borderRadius: 0,
                                            background: 'transparent',
                                          }}
                                        >
                                          <Icon iconName="Send" styles={{ root: { fontSize: 14, color: isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)' } }} />
                                        </div>
                                      )}
                                    </div>
                                    )}

                                    {/* Post-pitch stages - chip indices 3-7 */}
                                    {(() => {
                                      const inst = inlineWorkbenchItem?.instruction;
                                      const deal = inlineWorkbenchItem?.deal;
                                      // Only use deal's InstructionRef if deal is not in "pitched" status (pitched deals don't have actual instructions)
                                      const dealStatus = (deal?.Status ?? deal?.status ?? '').toLowerCase();
                                      const dealHasInstruction = dealStatus !== 'pitched' && dealStatus !== '';
                                      const instructionRef = (inst?.InstructionRef ?? inst?.instructionRef ?? (dealHasInstruction ? (deal?.InstructionRef ?? deal?.instructionRef) : undefined)) as string | undefined;
                                      const instructionDateRaw = 
                                        inst?.SubmissionDate ?? 
                                        inst?.submissionDate ?? 
                                        inst?.SubmissionDateTime ??
                                        inst?.submissionDateTime ??
                                        inst?.InstructionDateTime ??
                                        inst?.instructionDateTime ??
                                        inst?.SubmittedAt ??
                                        inst?.submittedAt ??
                                        inst?.CreatedAt ?? 
                                        inst?.createdAt ?? 
                                        inst?.CreatedOn ??
                                        inst?.createdOn ??
                                        inst?.DateCreated ?? 
                                        inst?.created_at ?? 
                                        inst?.InstructionDate ?? 
                                        inst?.instructionDate ??
                                        // Fallback to deal CloseDate when inst is null
                                        deal?.CloseDate ??
                                        deal?.closeDate ??
                                        deal?.close_date;
                                      const instructionTimeRaw = 
                                        inst?.SubmissionTime ?? 
                                        inst?.submissionTime ?? 
                                        inst?.SubmissionTimeUtc ??
                                        inst?.submissionTimeUtc ??
                                        // Fallback to deal CloseTime when inst is null
                                        deal?.CloseTime ??
                                        deal?.closeTime ??
                                        deal?.close_time;
                                      // Parse instruction date with robust handling
                                      const instructionDateParsed = combineDateAndTime(instructionDateRaw, instructionTimeRaw);
                                      const instructionStamp = instructionDateParsed
                                        ? format(instructionDateParsed, 'dd MMM HH:mm')
                                        : '';
                                      // Short chip label for instruction date + time
                                      const instructionChipLabel = instructionDateParsed
                                        ? `${format(instructionDateParsed, 'd MMM')} ${format(instructionDateParsed, 'HH:mm')}`
                                        : '--';
                                      // Extra instruction data for rich tooltip
                                      const instructionStage = inst?.Stage ?? inst?.stage ?? deal?.Stage ?? deal?.Status ?? deal?.status ?? '';
                                      const instructionServiceDesc = deal?.ServiceDescription ?? deal?.serviceDescription ?? inst?.ServiceDescription ?? '';
                                      const instructionAmount = deal?.Amount ?? deal?.amount ?? inst?.Amount;
                                      const instructionAmountText = instructionAmount && !isNaN(Number(instructionAmount))
                                        ? `£${Number(instructionAmount).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
                                        : '';
                                      // Shell entries (checkout opened but not submitted) have InstructionRef but no submission data
                                      // Only mark as having instruction if there's actual submission date OR stage indicates completion
                                      const stageLower = instructionStage.toLowerCase();
                                      const isShellEntry = Boolean(instructionRef) && (stageLower === 'initialised' || stageLower === 'pitched' || stageLower === 'opened' || stageLower === '');
                                      const hasInstruction = Boolean(instructionRef) && (Boolean(instructionDateParsed) || !isShellEntry);
                                      const hasEid = Boolean(inlineWorkbenchItem?.eid);
                                      const eidResult = (inlineWorkbenchItem?.eid as any)?.EIDOverallResult?.toLowerCase() ?? '';
                                      // EID counts as "done" only if result is positive
                                      const eidPassed = eidResult === 'passed' || eidResult === 'pass' || eidResult === 'verified' || eidResult === 'approved';
                                      const eidColor = eidPassed ? colours.green : eidResult === 'refer' ? colours.orange : eidResult === 'review' ? colours.red : colours.highlight;
                                      const eidLabel = eidPassed ? 'Pass' : eidResult === 'refer' ? 'Refer' : eidResult === 'review' ? 'Review' : eidResult || 'ID';
                                      
                                      // Payment detection with method and confirmation status
                                      const payments = Array.isArray(inlineWorkbenchItem?.payments) ? inlineWorkbenchItem.payments : [];
                                      const latestPayment = payments[0] as any;
                                      // Determine payment method
                                      const methodRaw = (
                                        latestPayment?.payment_method || 
                                        latestPayment?.payment_type || 
                                        latestPayment?.method || 
                                        latestPayment?.paymentMethod ||
                                        latestPayment?.PaymentMethod ||
                                        ''
                                      ).toString().toLowerCase();
                                      const meta = typeof latestPayment?.metadata === 'object' ? latestPayment.metadata : {};
                                      const metaMethod = (meta?.payment_method || meta?.method || meta?.paymentMethod || '').toString().toLowerCase();
                                      const intentId = (latestPayment?.payment_intent_id || latestPayment?.paymentIntentId || '').toString();
                                      const intentIsBank = intentId.startsWith('bank_');
                                      const intentIsCard = intentId.startsWith('pi_');
                                      const combinedMethod = methodRaw || metaMethod || (intentIsBank ? 'bank' : intentIsCard ? 'card' : '');
                                      const isCardPayment = combinedMethod.includes('card') || combinedMethod.includes('stripe') || combinedMethod === 'cc' || intentIsCard;
                                      const isBankPayment = combinedMethod.includes('bank') || combinedMethod.includes('transfer') || combinedMethod.includes('bacs') || intentIsBank;
                                      // Check payment status - DB column is payment_status, also check variants
                                      const paymentStatus = (latestPayment?.payment_status || latestPayment?.paymentStatus || latestPayment?.status || latestPayment?.Status || '').toString().toLowerCase();
                                      const isSucceededStatus = paymentStatus === 'succeeded' || paymentStatus === 'success' || paymentStatus === 'complete' || paymentStatus === 'completed' || paymentStatus === 'paid';
                                      const isCardConfirmed = isCardPayment && isSucceededStatus;
                                      const isBankConfirmed = isBankPayment && (latestPayment?.confirmed === true || latestPayment?.Confirmed === true || paymentStatus === 'confirmed');
                                      // Also treat as confirmed if status is succeeded even if method not detected
                                      const hasConfirmedPayment = isCardConfirmed || isBankConfirmed || isSucceededStatus;
                                      const hasPayment = payments.length > 0;
                                      const paymentLabel = hasConfirmedPayment ? 'Paid' : hasPayment ? (isBankPayment ? 'Pending' : '£') : '£';
                                      const paymentIcon = hasConfirmedPayment
                                        ? (isCardPayment ? 'PaymentCard' : 'Bank')
                                        : 'CurrencyPound';
                                      const paymentColor = hasConfirmedPayment ? colours.green : hasPayment ? (isBankPayment ? colours.orange : colours.blue) : colours.blue;
                                      const paymentTitle = hasConfirmedPayment 
                                        ? `Paid via ${isCardPayment ? 'card' : 'bank transfer'}` 
                                        : hasPayment 
                                          ? (isBankPayment ? 'Bank payment awaiting confirmation' : 'Payment recorded')
                                          : 'No payment yet';
                                      const paymentAmountRaw = latestPayment?.amount ?? latestPayment?.Amount ?? latestPayment?.value ?? latestPayment?.Value;
                                      const paymentAmountNumber = typeof paymentAmountRaw === 'string' ? parseFloat(paymentAmountRaw) : paymentAmountRaw;
                                      const paymentAmount = Number.isFinite(paymentAmountNumber) ? paymentAmountNumber : null;
                                      const paymentAmountText = paymentAmount !== null
                                        ? `£${paymentAmount.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
                                        : null;
                                      
                                      const hasRisk = Boolean(inlineWorkbenchItem?.risk);
                                      const riskResult = (inlineWorkbenchItem?.risk as any)?.RiskAssessmentResult?.toLowerCase() ?? '';
                                      const riskIcon = riskResult === 'low' || riskResult === 'approved' ? 'ShieldSolid' : riskResult === 'medium' ? 'HalfCircle' : 'Shield';
                                      const riskLabel = riskResult ? `${riskResult.charAt(0).toUpperCase()}${riskResult.slice(1)}` : 'Recorded';
                                      const hasMatter = Boolean(inst?.MatterId ?? inst?.matterId) || (Array.isArray(inlineWorkbenchItem?.matters) && inlineWorkbenchItem.matters.length > 0);
                                      const mainMatterRecord = Array.isArray(inlineWorkbenchItem?.matters) ? inlineWorkbenchItem.matters[0] : null;
                                      const mainMatterRef = (mainMatterRecord?.DisplayNumber || mainMatterRecord?.['Display Number'] || mainMatterRecord?.displayNumber || mainMatterRecord?.display_number || inst?.MatterId || inst?.matterId) as string | undefined;
                                      const shouldShowPostPitch = Boolean(inlineWorkbenchItem) || showPitch;

                                      // Determine next incomplete stage in pipeline order
                                      // Only consider stages that are "in play" - skip POC if no activity, then look for first incomplete
                                      const mainPipelineStages = [
                                        { done: showTeamsStage || showClaimer, index: 0, inPlay: showTeamsStage || showClaimer || showLegacyPlaceholder },
                                        { done: showPitch, index: 1, inPlay: true },
                                        { done: hasInstruction, index: 2, inPlay: shouldShowPostPitch },
                                        { done: eidPassed, index: 3, inPlay: shouldShowPostPitch },
                                        { done: hasConfirmedPayment, index: 4, inPlay: shouldShowPostPitch },
                                        { done: hasRisk, index: 5, inPlay: shouldShowPostPitch },
                                        { done: hasMatter, index: 6, inPlay: shouldShowPostPitch },
                                      ];
                                      const mainNextIncompleteIndex = mainPipelineStages.find(s => s.inPlay && !s.done)?.index ?? -1;

                                      const renderMiniChip = (props: any) => (
                                        <MiniPipelineChip
                                          {...props}
                                          isDarkMode={isDarkMode}
                                          onMouseEnter={(e: React.MouseEvent) => showPipelineHover(e, {
                                            title: props.fullLabel,
                                            status: props.statusText || (props.done ? 'Complete' : 'Not started'),
                                            subtitle: props.subtitle,
                                            color: props.color,
                                            iconName: props.iconName,
                                            details: props.details,
                                          })}
                                          onMouseMove={movePipelineHover}
                                          onMouseLeave={hidePipelineHover}
                                        />
                                      );

                                      return (
                                        <>
                                          {/* Inst - chip index 2 */}
                                          {(pipelineNeedsCarousel ? mainIsChipVisible(2) : (shouldShowPostPitch || mainIsChipVisible(2))) && (
                                          <div data-chip-index="2" style={getMainCascadeStyle(2)}>
                                          {renderMiniChip({
                                            shortLabel: hasInstruction ? instructionChipLabel : (isShellEntry && instructionRef ? 'Opened' : '--'),
                                            fullLabel: "Instruction",
                                            done: shouldShowPostPitch && hasInstruction,
                                            inProgress: isShellEntry && Boolean(instructionRef) && showPitch && !hasInstruction,
                                            color: colours.green,
                                            iconName: "CheckMark",
                                            showConnector: true,
                                            prevDone: showPitch,
                                            statusText: hasInstruction ? `Instructed ${instructionStamp}` : (isShellEntry && instructionRef ? 'Checkout opened - awaiting submission' : 'Not instructed'),
                                            subtitle: contactName,
                                            title: hasInstruction ? `Instructed (${instructionRef})` : (isShellEntry && instructionRef ? `Checkout opened (${instructionRef})` : 'Not instructed yet'),
                                            isNextAction: !isShellEntry && mainNextIncompleteIndex === 2,
                                            details: hasInstruction ? [
                                              { label: 'Ref', value: instructionRef || '' },
                                              ...(instructionStage ? [{ label: 'Stage', value: instructionStage }] : []),
                                              ...(instructionServiceDesc ? [{ label: 'Service', value: instructionServiceDesc }] : []),
                                              ...(instructionAmountText ? [{ label: 'Value', value: instructionAmountText }] : []),
                                            ] : undefined,
                                            onClick: (e: React.MouseEvent) => {
                                              e.stopPropagation();
                                              openEnquiryWorkbench(item, 'Timeline', { filter: 'pitch' });
                                            }
                                          })}
                                          </div>
                                          )}
                                          {/* ID - chip index 3 */}
                                          {(pipelineNeedsCarousel ? mainIsChipVisible(3) : (shouldShowPostPitch || mainIsChipVisible(3))) && (
                                          <div data-chip-index="3" style={getMainCascadeStyle(3)}>
                                          {renderMiniChip({
                                            shortLabel: hasEid ? eidLabel : 'ID',
                                            fullLabel: hasEid ? eidLabel : 'ID Check',
                                            done: shouldShowPostPitch && hasEid,
                                            isNextAction: mainNextIncompleteIndex === 3,
                                            color: hasEid ? eidColor : colours.highlight,
                                            iconName: "ContactCard",
                                            showConnector: true,
                                            prevDone: hasInstruction,
                                            statusText: hasEid ? `EID ${eidLabel}` : 'EID not started',
                                            subtitle: contactName,
                                            title: hasEid ? `ID: ${eidLabel}` : 'ID not started',
                                            onClick: (e: React.MouseEvent) => {
                                              e.stopPropagation();
                                              openEnquiryWorkbench(item, 'Timeline', { filter: 'pitch' });
                                            }
                                          })}
                                          </div>
                                          )}
                                          {/* Pay - chip index 4 */}
                                          {(pipelineNeedsCarousel ? mainIsChipVisible(4) : (shouldShowPostPitch || mainIsChipVisible(4))) && (
                                          <div data-chip-index="4" style={getMainCascadeStyle(4)}>
                                          {renderMiniChip({
                                            shortLabel: paymentLabel,
                                            fullLabel: hasConfirmedPayment ? 'Paid' : hasPayment ? (isBankPayment ? 'Pending' : 'Payment') : 'Payment',
                                            done: shouldShowPostPitch && hasConfirmedPayment,
                                            inProgress: shouldShowPostPitch && hasPayment && !hasConfirmedPayment,
                                            color: paymentColor,
                                            iconName: paymentIcon,
                                            showConnector: true,
                                            prevDone: eidPassed,
                                            statusText: hasConfirmedPayment ? `Paid${paymentAmountText ? ` ${paymentAmountText}` : ''}` : hasPayment ? `${isBankPayment ? 'Pending' : 'Payment'}${paymentAmountText ? ` ${paymentAmountText}` : ''}` : 'No payment',
                                            subtitle: contactName,
                                            title: paymentTitle,
                                            isNextAction: mainNextIncompleteIndex === 4,
                                            onClick: (e: React.MouseEvent) => {
                                              e.stopPropagation();
                                              openEnquiryWorkbench(item, 'Timeline', { filter: 'pitch' });
                                            }
                                          })}
                                          </div>
                                          )}
                                          {/* Risk - chip index 5 */}
                                          {(pipelineNeedsCarousel ? mainIsChipVisible(5) : (shouldShowPostPitch || mainIsChipVisible(5))) && (
                                          <div data-chip-index="5" style={getMainCascadeStyle(5)}>
                                          {renderMiniChip({
                                            shortLabel: hasRisk ? riskLabel : "Risk",
                                            fullLabel: "Risk",
                                            done: shouldShowPostPitch && hasRisk,
                                            color: colours.green,
                                            isNextAction: mainNextIncompleteIndex === 5,
                                            iconName: riskIcon,
                                            showConnector: true,
                                            prevDone: hasConfirmedPayment,
                                            statusText: hasRisk ? `Risk ${riskLabel}` : 'No risk record',
                                            subtitle: contactName,
                                            title: hasRisk ? 'Risk record present' : 'Risk not started',
                                            onClick: (e: React.MouseEvent) => {
                                              e.stopPropagation();
                                              openEnquiryWorkbench(item, 'Timeline', { filter: 'pitch' });
                                            }
                                          })}
                                          </div>
                                          )}
                                          {/* Matter - chip index 6 */}
                                          {(pipelineNeedsCarousel ? mainIsChipVisible(6) : (shouldShowPostPitch || mainIsChipVisible(6))) && (
                                          <div data-chip-index="6" style={getMainCascadeStyle(6)}>
                                          {renderMiniChip({
                                            shortLabel: hasMatter && mainMatterRef ? mainMatterRef : "Matter",
                                            fullLabel: "Matter",
                                            done: shouldShowPostPitch && hasMatter,
                                            color: colours.green,
                                            iconName: "OpenFolderHorizontal",
                                            showConnector: true,
                                            prevDone: hasRisk,
                                            statusText: hasMatter ? `Matter ${mainMatterRef ?? 'linked'}` : 'No matter yet',
                                            subtitle: contactName,
                                            title: hasMatter ? 'Matter linked/opened' : 'Matter not opened',
                                            isNextAction: mainNextIncompleteIndex === 6,
                                            onClick: (e: React.MouseEvent) => {
                                              e.stopPropagation();
                                              openEnquiryWorkbench(item, 'Timeline', { filter: 'pitch' });
                                            }
                                          })}
                                          </div>
                                          )}
                                        </>
                                      );
                                    })()}

                                    {/* Navigation chevron for carousel OR empty gutter */}
                                    {pipelineNeedsCarousel ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          advancePipelineScroll(item.ID, 7, visiblePipelineChipCount);
                                        }}
                                        title={mainHasMoreChips ? `View more stages (${7 - mainVisibleEnd} hidden)` : 'Back to start'}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          width: '100%',
                                          height: 22,
                                          padding: 0,
                                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)'}`,
                                          borderRadius: 0,
                                          background: mainHasMoreChips 
                                            ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                                            : (isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.04)'),
                                          cursor: 'pointer',
                                          transition: 'all 0.15s ease',
                                          color: mainHasMoreChips 
                                            ? colours.blue 
                                            : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.4)'),
                                        }}
                                      >
                                        <Icon 
                                          iconName={mainHasMoreChips ? 'ChevronRight' : 'Refresh'} 
                                          styles={{ 
                                            root: { 
                                              fontSize: mainHasMoreChips ? 12 : 10, 
                                              color: 'inherit',
                                              opacity: mainHasMoreChips ? 1 : 0.7,
                                            } 
                                          }} 
                                        />
                                      </button>
                                    ) : (
                                      <div />
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Actions Column */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                              {/* Call / Email / Rate actions (no hover) */}
                              {mainShowClaimer && !isMainTeamInboxPoc && (
                                <>
                                  <button
                                    type="button"
                                    disabled={!(item.Phone_Number || (item as any).phone)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const phone = item.Phone_Number || (item as any).phone;
                                      if (phone) window.open(`tel:${phone}`, '_self');
                                    }}
                                    style={{
                                      width: 22,
                                      height: 22,
                                      borderRadius: 0,
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                                      background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
                                      color: isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)',
                                      opacity: (item.Phone_Number || (item as any).phone) ? 1 : 0.3,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: (item.Phone_Number || (item as any).phone) ? 'pointer' : 'default',
                                      transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      if (item.Phone_Number || (item as any).phone) {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)';
                                        e.currentTarget.style.borderColor = colours.blue;
                                        e.currentTarget.style.color = colours.blue;
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)';
                                      e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)';
                                      e.currentTarget.style.color = isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)';
                                    }}
                                    title={(item.Phone_Number || (item as any).phone) ? `Call ${item.Phone_Number || (item as any).phone}` : 'No phone number'}
                                  >
                                    <Icon iconName="Phone" styles={{ root: { fontSize: 11 } }} />
                                  </button>

                                  {item.Email && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(`mailto:${item.Email}`, '_blank');
                                      }}
                                      style={{
                                        width: 22,
                                        height: 22,
                                        borderRadius: 0,
                                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                                        background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
                                        color: isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
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
                                      <Icon iconName="Mail" styles={{ root: { fontSize: 11 } }} />
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRate(item.ID);
                                    }}
                                    style={{
                                      width: 22,
                                      height: 22,
                                      borderRadius: 0,
                                      border: `1px solid ${getRatingChipMeta(item.Rating, isDarkMode).borderColor}`,
                                      background: getRatingChipMeta(item.Rating, isDarkMode).background,
                                      color: getRatingChipMeta(item.Rating, isDarkMode).color,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      const meta = getRatingChipMeta(item.Rating, isDarkMode);
                                      e.currentTarget.style.background = meta.hoverBackground;
                                      e.currentTarget.style.borderColor = meta.hoverBorderColor;
                                      e.currentTarget.style.color = meta.hoverColor;
                                    }}
                                    onMouseLeave={(e) => {
                                      const meta = getRatingChipMeta(item.Rating, isDarkMode);
                                      e.currentTarget.style.background = meta.background;
                                      e.currentTarget.style.borderColor = meta.borderColor;
                                      e.currentTarget.style.color = meta.color;
                                    }}
                                    title={item.Rating ? `Rating: ${item.Rating} - Click to change` : 'Rate this enquiry'}
                                  >
                                    <Icon iconName={getRatingChipMeta(item.Rating, isDarkMode).iconName} styles={{ root: { fontSize: 11 } }} />
                                  </button>
                                </>
                              )}
                              {/* Notes Chevron - always show, disabled when no content */}
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!(hasNotes || hasInlineWorkbench)) return; // Do nothing if disabled
                                  const newSet = new Set(expandedNotesInTable);
                                  if (isNotesExpanded) {
                                    newSet.delete(noteKey);
                                  } else {
                                    newSet.add(noteKey);
                                  }
                                  setExpandedNotesInTable(newSet);
                                }}
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 0,
                                  background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.08)',
                                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: (hasNotes || hasInlineWorkbench) ? 'pointer' : 'default',
                                  transition: 'all 0.2s ease',
                                  opacity: (hasNotes || hasInlineWorkbench) ? 1 : 0.4,
                                }}
                                onMouseEnter={(e) => {
                                  if (!(hasNotes || hasInlineWorkbench)) return;
                                  e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)';
                                  e.currentTarget.style.transform = 'scale(1.05)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.08)';
                                  e.currentTarget.style.transform = 'scale(1)';
                                }}
                                title={
                                  !(hasNotes || hasInlineWorkbench)
                                    ? 'No notes'
                                    : isNotesExpanded
                                      ? 'Collapse'
                                      : (hasNotes && hasInlineWorkbench
                                        ? 'Show notes & workbench'
                                        : (hasNotes ? 'Show notes' : 'Show workbench'))
                                }
                              >
                                <Icon 
                                  iconName={isNotesExpanded ? 'ChevronUp' : 'ChevronDown'} 
                                  styles={{ 
                                    root: { 
                                      fontSize: '10px', 
                                      color: isDarkMode ? 'rgba(203, 213, 225, 0.8)' : 'rgba(71, 85, 105, 0.8)' 
                                    } 
                                  }} 
                                />
                              </div>
                              {areActionsEnabled && (
                                <>
                                  {/* Edit Button */}
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingEnquiry(item);
                                      setShowEditModal(true);
                                    }}
                                    style={{
                                      width: 22,
                                      height: 22,
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
                                    title="Edit enquiry"
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
                                      width: 22,
                                      height: 22,
                                      borderRadius: 0,
                                      background: isDarkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(248, 113, 113, 0.08)',
                                      border: `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.3)' : 'rgba(248, 113, 113, 0.2)'}`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = isDarkMode ? 'rgba(248, 113, 113, 0.15)' : 'rgba(248, 113, 113, 0.12)';
                                      e.currentTarget.style.transform = 'scale(1.05)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = isDarkMode ? 'rgba(248, 113, 113, 0.1)' : 'rgba(248, 113, 113, 0.08)';
                                      e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                    title="Delete enquiry (requires passcode)"
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
                                </>
                              )}
                            </div>
                          </div>
                          )}
                          {/* Expanded Section - notes only */}
                          {!isSingleDayCollapsed && isNotesExpanded && hasNotes && (
                            <div style={{
                              gridColumn: '1 / -1',
                              padding: '12px 60px 12px 32px',
                              backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
                              borderBottom: isLast ? 'none' : `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'}`,
                              fontSize: '12px',
                              lineHeight: '1.5',
                              color: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.75)',
                              whiteSpace: 'pre-line',
                            }}>
                              <div style={{
                                fontSize: '9px',
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
                    {/* Infinite scroll loader for table view - inside scroll container */}
                    <div 
                      ref={loader} 
                      style={{ 
                        height: '20px', 
                        width: '100%',
                        visibility: itemsToShow < filteredEnquiries.length ? 'visible' : 'hidden',
                      }} 
                    />
                  </div>
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
                    submitRating(option.value);
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

      {pipelineHover && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            top: pipelineHover.y,
            left: pipelineHover.x,
            background: isDarkMode ? 'rgba(15, 23, 42, 0.98)' : '#ffffff',
            color: isDarkMode ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.9)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.3)'}`,
            borderRadius: 10,
            padding: '12px 14px',
            minWidth: 260,
            maxWidth: 340,
            boxShadow: isDarkMode ? '0 12px 28px rgba(0,0,0,0.5)' : '0 12px 28px rgba(15,23,42,0.14)',
            zIndex: 20000,
            pointerEvents: 'none',
            opacity: 1,
          }}
        >
          {/* Header with icon + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            {pipelineHover.iconName && renderPipelineIcon(pipelineHover.iconName, pipelineHover.color, 16)}
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.2px' }}>
              {pipelineHover.title}
            </div>
          </div>
          
          {/* Status badge */}
          <div style={{ 
            display: 'inline-block',
            padding: '3px 8px',
            borderRadius: 4,
            background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)',
            fontSize: 11,
            fontWeight: 600, 
            color: pipelineHover.color,
            marginBottom: pipelineHover.details?.length ? 10 : 0,
          }}>
            {pipelineHover.status}
          </div>
          
          {/* Detail rows */}
          {pipelineHover.details && pipelineHover.details.length > 0 && (
            <div style={{ 
              borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)'}`,
              paddingTop: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              {pipelineHover.details.map((detail, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ 
                    fontSize: 10, 
                    fontWeight: 500, 
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                    flexShrink: 0,
                  }}>
                    {detail.label}
                  </span>
                  <span style={{ 
                    fontSize: 11, 
                    fontWeight: 500, 
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(30, 41, 59, 0.9)',
                    textAlign: 'right',
                    wordBreak: 'break-word',
                  }}>
                    {detail.value}
                  </span>
                </div>
              ))}
            </div>
          )}
          
          {/* Subtitle (client name) */}
          {pipelineHover.subtitle && (
            <div style={{ 
              marginTop: 8, 
              paddingTop: 6,
              borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.15)'}`,
              fontSize: 10, 
              color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(71, 85, 105, 0.6)',
              fontStyle: 'italic',
            }}>
              {pipelineHover.subtitle}
            </div>
          )}
        </div>,
        document.body,
      )}

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
