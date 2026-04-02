// Clean admin tools - removed beaker and legacy toggle
import React, { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef, useTransition, useDeferredValue, startTransition } from 'react';
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
import { renderAreaOfWorkGlyph, getAreaGlyphMeta } from '../../components/filter/areaGlyphs';
import PitchScenarioBadge, { getScenarioColor } from '../../components/PitchScenarioBadge';
import { BiLogoMicrosoftTeams } from 'react-icons/bi';
import { FaExchangeAlt, FaPoundSign, FaRegCreditCard } from 'react-icons/fa';
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
import { isAdminUser, hasInstructionsAccess, isDevOwner } from '../../app/admin';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
import UnclaimedEnquiries from './UnclaimedEnquiries';
import FilterBanner from '../../components/filter/FilterBanner';
import NavigatorDetailBar from '../../components/NavigatorDetailBar';
import CreateContactModal from './CreateContactModal';
import PeopleSearchPanel from '../../components/PeopleSearchPanel';
import TeamsLinkWidget from '../../components/TeamsLinkWidget';
import { EnquiryEnrichmentData, EnquiryEnrichmentResponse, fetchEnquiryEnrichment } from '../../app/functionality/enquiryEnrichment';
import {
  appendDefaultEnquiryProcessingParams,
  buildEnquiryMutationPayload,
  enquiryReferencesId,
  resolveEnquiryProcessingIdentity,
} from '../../app/functionality/enquiryProcessingModel';
import { claimEnquiry } from '../../utils/claimEnquiry';
import { normalizeEnquiry, detectSourceType } from '../../utils/normalizeEnquiry';
import type { NormalizedEnquiry } from '../../utils/normalizeEnquiry';
import { app } from '@microsoft/teams-js';
import AreaCountCard from './AreaCountCard';
import 'rc-slider/assets/index.css';
import '../../app/styles/NavigatorPivot.css';
import '../../app/styles/animations.css';
import '../../app/styles/CustomTabs.css';
import '../../app/styles/Prospects.css';
import Slider from 'rc-slider';
import { debugLog, debugWarn } from '../../utils/debug';
import { shouldAlwaysShowProspectHistory, isSharedProspectRecord } from './sharedProspects';
import { checkIsLocalDev, isActuallyLocalhost } from '../../utils/useIsLocalDev';
import EmptyState from '../../components/states/EmptyState';
import LoadingState from '../../components/states/LoadingState';
import {
  ProspectTableRow,
  RatingModal,
  EditEnquiryModal,
  ReassignmentDropdown,
  PipelineTooltipPortal,
  SuccessMessageBar,
} from './components';
import type {
  RowPipelineHandlers,
  RowActionHandlers,
  RowDisplayState,
  RowHoverHandlers,
  RowDataDeps,
} from './components';

const DEMO_MODE_STORAGE_KEY = 'helix-hub-demo-enquiry-mode';

const ZERO_WIDTH_CHARACTERS_REGEX = /[\u200B\u200C\u200D\uFEFF]/g;
const DIACRITIC_CHARACTERS_REGEX = /[\u0300-\u036f]/g;

const normalizeSearchValue = (value?: string | number | null): string => {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(DIACRITIC_CHARACTERS_REGEX, '')
    .replace(ZERO_WIDTH_CHARACTERS_REGEX, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeSearchEmailArtifacts = (value?: string | number | null): string => {
  return normalizeSearchValue(value)
    .replace(/\s*@\s*/g, '@')
    .replace(/\s*\.\s*/g, '.');
};

const toDigitSearchValue = (value?: string | number | null): string => {
  return String(value ?? '').replace(/\D/g, '');
};

const parseSharedWithEmails = (value: unknown): string[] => {
  return String(value ?? '')
    .split(/[;,\n]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
};

const serialiseSharedWithEmails = (value: unknown): string => {
  return Array.from(new Set(parseSharedWithEmails(value))).join(',');
};

const isDemoEnquiryId = (value: unknown): boolean => String(value ?? '').toUpperCase().startsWith('DEMO-ENQ-');

const findEnquiryForMutation = (enquiries: Enquiry[], enquiryId: string): Enquiry | undefined => {
  const normalisedEnquiryId = String(enquiryId ?? '').trim();
  if (!normalisedEnquiryId) return undefined;

  return enquiries.find((enquiry) => enquiryReferencesId(enquiry, normalisedEnquiryId));
};

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
@keyframes prospect-detail-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes sse-reconnect-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
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
.pipeline-chip-reveal:hover .pipeline-chip-box {
  gap: 4px;
  padding: 1px 6px 1px 4px;
  border-color: rgba(107, 107, 107, 0.25);
}
.pipeline-chip-label {
  display: inline-flex;
  gap: 4px;
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  white-space: nowrap;
  transition: max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
  transition-delay: 0ms;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: 0.2px;
  will-change: max-width, opacity;
}
.pipeline-chip-reveal:hover .pipeline-chip-label,
.pipeline-chip-reveal:focus-visible .pipeline-chip-label {
  max-width: 80px !important;
  opacity: 0.9 !important;
}
/* next-action-breathe animation removed — was distracting */
.next-action-subtle-pulse,
.next-action-subtle-pulse .pipeline-chip-box,
.next-action-subtle-pulse > button,
.next-action-subtle-pulse > div {
  animation: none !important;
}
@keyframes pitch-cta-pulse {
  0%, 100% {
    border-color: rgba(255, 140, 0, 0.35);
    background: rgba(255, 140, 0, 0.08);
  }
  50% {
    border-color: rgba(255, 140, 0, 0.55);
    background: rgba(255, 140, 0, 0.14);
  }
}
@keyframes pipeline-cascade {
  0% { opacity: 0; transform: translateY(-6px) scale(0.9); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes pipeline-action-pulse {
  0%, 100% { opacity: 0.45; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1); }
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
  if (iconName === 'TeamsLogo') {
    return <BiLogoMicrosoftTeams size={size} color={color} style={{ display: 'block', flexShrink: 0 }} />;
  }

  if (iconName === 'PaymentCard') {
    return <FaRegCreditCard size={size - 1} color={color} style={{ display: 'block', flexShrink: 0 }} />;
  }

  if (iconName === 'Bank') {
    return <FaExchangeAlt size={size - 2} color={color} style={{ display: 'block', flexShrink: 0 }} />;
  }

  if (iconName === 'CurrencyPound') {
    return <FaPoundSign size={size - 1} color={color} style={{ display: 'block', flexShrink: 0 }} />;
  }

  return <Icon iconName={iconName === 'PitchScenario' ? 'Send' : iconName} styles={{ root: { fontSize: size, color } }} />;
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
  const inactiveColor = isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(107, 107, 107, 0.2)';
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
  enquiriesUsingSnapshot?: boolean;
  enquiriesLiveRefreshInFlight?: boolean;
  enquiriesLastLiveSyncAt?: number | null;
  prefetchedTeamWideEnquiries?: Enquiry[] | null;
  userData: UserData[] | null;
  poidData: POID[];
  setPoidData: React.Dispatch<React.SetStateAction<POID[]>>;
  teamData?: TeamData[] | null;
  onRefreshEnquiries?: () => Promise<void>;
  onOptimisticClaim?: (enquiryId: string, claimerEmail: string) => void;
  subscribeToEnquiryStream?: (listener: (event: {
    changeType: string;
    enquiryId: string;
    claimedBy?: string;
    claimedAt?: string | null;
    deletedIds?: string[];
    record?: Record<string, unknown>;
  }) => void) => () => void;
  instructionData?: any[]; // For detecting promoted enquiries
  featureToggles?: Record<string, boolean>;
  originalAdminUser?: UserData | null;
  isActive?: boolean; // Whether this tab is currently active
  demoModeEnabled?: boolean;
  onTeamWideEnquiriesLoaded?: (enquiries: Enquiry[]) => void;
  pendingEnquiryId?: string | null;
  pendingEnquirySubTab?: string | null;
  pendingEnquiryPitchScenario?: string | null;
  onPendingEnquiryHandled?: () => void;
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

// ─── Inject CSS for filter chip transitions (once) ────────────────────
if (typeof document !== 'undefined' && !document.head.querySelector('style[data-enq-filter-css]')) {
  const filterCss = document.createElement('style');
  filterCss.setAttribute('data-enq-filter-css', 'true');
  filterCss.textContent = `
    @keyframes enq-filter-signal {
      0%, 100% { opacity: 0.45; transform: scaleX(0.92); }
      50% { opacity: 1; transform: scaleX(1); }
    }
    @keyframes enq-skeleton-breathe {
      0%, 100% { opacity: 0.72; }
      50% { opacity: 1; }
    }
    .enq-filter-cluster,
    .enq-filter-secondary-cluster {
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      padding: 0;
      border-radius: 0;
      overflow: visible;
      background: transparent;
      border: none;
    }
    .enq-filter-constellation {
      position: relative;
      isolation: isolate;
    }
    .enq-status-primary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .enq-chip {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      min-height: 30px; padding: 0 12px; border-radius: 0; cursor: pointer;
      font-size: 11px; font-weight: 500; font-family: Raleway, sans-serif;
      letter-spacing: 0.02em; outline: none; white-space: nowrap;
      transition: background 120ms ease, color 120ms ease, opacity 120ms ease, box-shadow 120ms ease;
      user-select: none;
      box-sizing: border-box;
    }
    .enq-scope-chip {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      min-height: 26px; padding: 0 10px; border-radius: 0; cursor: pointer;
      font-size: 10px; font-weight: 600; font-family: Raleway, sans-serif;
      letter-spacing: 0.04em; outline: none;
      transition: background 120ms ease, color 120ms ease, opacity 120ms ease;
      user-select: none;
      box-sizing: border-box;
    }
    .enq-chip, .enq-scope-chip {
      position: relative;
      overflow: hidden;
      transform: translateY(0);
      border: none;
      transition: background 140ms ease, color 140ms ease, opacity 140ms ease, box-shadow 140ms ease;
    }
    .enq-chip:hover, .enq-scope-chip:hover {
      background: var(--enq-chip-hover-bg) !important;
      box-shadow: inset 0 0 0 1px var(--enq-chip-hover-border) !important;
    }
    .enq-chip:active, .enq-scope-chip:active { transform: scale(0.98); }
    [data-theme="dark"] .enq-chip, [data-theme="dark"] .enq-scope-chip {
      --enq-chip-hover-bg: rgba(255,255,255,0.04);
      --enq-chip-hover-border: rgba(135,243,243,0.35);
    }
    [data-theme="light"] .enq-chip, [data-theme="light"] .enq-scope-chip {
      --enq-chip-hover-bg: rgba(54,144,206,0.05);
      --enq-chip-hover-border: rgba(54,144,206,0.3);
    }
    .enq-action-btn {
      display: inline-flex; align-items: center; gap: 6px;
      height: 30px; padding: 0 12px; border-radius: 0;
      cursor: pointer; font-size: 11px; font-family: Raleway, sans-serif;
      font-weight: 500; letter-spacing: 0.02em;
      transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
      user-select: none;
      border: none;
      box-sizing: border-box;
    }
    .enq-action-btn:active { transform: scale(0.97); }
    [data-theme="dark"] .enq-action-btn {
      color: #d1d5db;
      background: rgba(255,255,255,0.02);
      box-shadow: inset 0 0 0 1px rgba(75,85,99,0.24);
    }
    [data-theme="dark"] .enq-action-btn:hover {
      background: rgba(135,243,243,0.07);
      color: #87F3F3;
      box-shadow: inset 0 0 0 1px rgba(135,243,243,0.28);
    }
    [data-theme="light"] .enq-action-btn {
      color: #6B6B6B;
      background: rgba(255,255,255,0.7);
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);
    }
    [data-theme="light"] .enq-action-btn:hover {
      background: rgba(54,144,206,0.05);
      color: #3690CE;
      box-shadow: inset 0 0 0 1px rgba(54,144,206,0.22);
    }
    .enq-add-contact-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; padding: 0;
      border-radius: 0; cursor: pointer;
      background: transparent;
      transition: background 150ms ease, width 200ms ease, color 150ms ease, box-shadow 150ms ease;
      overflow: hidden; white-space: nowrap;
      font-family: Raleway, sans-serif; font-size: 11px; font-weight: 500;
      letter-spacing: 0.02em;
      border: none;
      box-sizing: border-box;
    }
    [data-theme="dark"] .enq-add-contact-btn {
      color: #d1d5db;
      box-shadow: inset 0 0 0 1px rgba(75,85,99,0.24);
    }
    [data-theme="light"] .enq-add-contact-btn {
      color: #6B6B6B;
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);
    }
    .enq-add-contact-btn:hover {
      width: auto; padding: 0 10px; gap: 5px;
    }
    [data-theme="dark"] .enq-add-contact-btn:hover {
      background: rgba(135,243,243,0.07);
      box-shadow: inset 0 0 0 1px rgba(135,243,243,0.28);
      color: #87F3F3;
    }
    [data-theme="light"] .enq-add-contact-btn:hover {
      background: rgba(54,144,206,0.05);
      box-shadow: inset 0 0 0 1px rgba(54,144,206,0.22);
      color: #3690CE;
    }
    .enq-add-contact-btn:active { transform: scale(0.97); }
    .enq-add-contact-label {
      max-width: 0; overflow: hidden; opacity: 0;
      transition: max-width 200ms ease, opacity 150ms ease;
    }
    .enq-add-contact-btn:hover .enq-add-contact-label {
      max-width: 100px; opacity: 1;
    }
    .enq-badge {
      min-width: 18px;
      padding: 1px 5px; font-size: 9px; font-weight: 700;
      line-height: 1.2; border-radius: 0;
      transition: background 120ms ease, transform 160ms ease, opacity 160ms ease;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
      text-align: center;
    }
    .enq-person-tag {
      display: inline-flex; align-items: center; gap: 6px;
      height: 26px; padding: 0 10px; border-radius: 0;
      font-size: 11px; font-family: Raleway, sans-serif;
      font-weight: 600; letter-spacing: 0.02em;
    }
    .enq-person-close { opacity: 0.7; transition: opacity 120ms ease; cursor: pointer; }
    .enq-person-close:hover { opacity: 1; }
  `;
  document.head.appendChild(filterCss);
}

// ─── Filter icon helper (pure, no deps → stable module-level) ─────────
const filterIconSvg = (k: string) => {
  if (k === 'Claimed') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }
  if (k === 'Unclaimed') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M8 4V8.5L11 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }
  if (k === 'All') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M1 13c0-2.2 2-4 4.5-4s4.5 1.8 4.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <circle cx="11.5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <path d="M15 12.5c0-1.7-1.5-3-3.5-3-.7 0-1.3.15-1.8.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      </svg>
    );
  }
  // Triaged
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M2 3h12l-4.5 5.5V13l-3 1.5V8.5L2 3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
};

// ─── Extracted: StatusFilterWithScope ──────────────────────────────────
// Defined at module level so React keeps a stable component identity across
// re-renders of the parent useEffect that pushes JSX into NavigatorContext.
type EnquiriesActiveState = '' | 'Claimed' | 'Claimable' | 'Triaged';

interface StatusFilterWithScopeProps {
  isDarkMode: boolean;
  activeState: string;
  showMineOnly: boolean;
  scopeCounts: { mineCount: number; allCount: number | null };
  isAdmin: boolean;
  isBusy: boolean;
  onSetActiveState: (key: EnquiriesActiveState) => void;
  onSetShowMineOnly: (v: boolean) => void;
}

const StatusFilterWithScope = React.memo<StatusFilterWithScopeProps>(({
  isDarkMode,
  activeState,
  showMineOnly,
  scopeCounts,
  isAdmin,
  isBusy,
  onSetActiveState,
  onSetShowMineOnly,
}) => {
  const h = 30;
  const currentState = activeState === 'Claimable' ? 'Unclaimed' : activeState;
  const isClaimed = currentState === 'Claimed';
  const claimedTone = isDarkMode ? colours.accent : colours.highlight;
  const triagedTone = colours.orange;

  const chipBg = (active: boolean, tone: string) =>
    active
      ? (tone === triagedTone
          ? (isDarkMode ? 'rgba(255,140,0,0.10)' : 'rgba(255,140,0,0.07)')
          : (isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(54, 144, 206, 0.07)'))
      : 'transparent';

  const chipStroke = (active: boolean, tone: string, admin?: boolean) =>
    active
      ? (isDarkMode && tone !== triagedTone ? 'rgba(135,243,243,0.34)' : tone)
      : admin
        ? (isDarkMode ? 'rgba(255,140,0,0.18)' : 'rgba(255,140,0,0.10)')
        : (isDarkMode ? 'rgba(75,85,99,0.22)' : 'rgba(0,0,0,0.08)');

  const chipColor = (active: boolean, tone: string) =>
    active
      ? tone
      : (isDarkMode ? '#d1d5db' : colours.greyText);

  const chipShadow = (active: boolean, tone: string, admin?: boolean) =>
    `inset 0 0 0 1px ${chipStroke(active, tone, admin)}`;

  const badgeBg = (active: boolean) =>
    active
      ? (isDarkMode ? 'rgba(54,144,206,0.22)' : 'rgba(54,144,206,0.14)')
      : (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(6,23,51,0.04)');

  return (
    <div
      className="enq-filter-cluster enq-filter-constellation"
      data-busy={isBusy ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: h,
        padding: 0,
        background: 'transparent',
        borderRadius: 0,
        gap: 8,
        fontFamily: 'Raleway, sans-serif',
        userSelect: 'none',
      }}
    >
      <div className="enq-status-primary">
        <button
          type="button"
          className="enq-scope-chip"
          aria-pressed={isClaimed && showMineOnly}
          onClick={() => { onSetActiveState('Claimed'); onSetShowMineOnly(true); }}
          title={`My claimed (${scopeCounts.mineCount || 0})`}
          style={{
            minHeight: h,
            background: chipBg(isClaimed && showMineOnly, claimedTone),
            color: chipColor(isClaimed && showMineOnly, claimedTone),
            boxShadow: chipShadow(isClaimed && showMineOnly, claimedTone),
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center' }}>{filterIconSvg('Claimed')}</span>
          <span className="enq-chip-label">Mine</span>
          <span className="enq-badge" key={`mine-${scopeCounts.mineCount}`} data-animate style={{ background: badgeBg(isClaimed && showMineOnly) }}>{scopeCounts.mineCount}</span>
        </button>

        <button
          type="button"
          className="enq-scope-chip"
          aria-pressed={isClaimed && !showMineOnly}
          onClick={() => { onSetActiveState('Claimed'); onSetShowMineOnly(false); }}
          title={`All claimed${scopeCounts.allCount !== null ? ` (${scopeCounts.allCount})` : ''}`}
          style={{
            minHeight: h,
            background: chipBg(isClaimed && !showMineOnly, claimedTone),
            color: chipColor(isClaimed && !showMineOnly, claimedTone),
            boxShadow: chipShadow(isClaimed && !showMineOnly, claimedTone),
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center' }}>{filterIconSvg('All')}</span>
          <span className="enq-chip-label">All</span>
          <span className="enq-badge" key={`all-${scopeCounts.allCount}`} data-animate style={{ background: badgeBg(isClaimed && !showMineOnly) }}>
            {scopeCounts.allCount !== null ? (
              <span style={{ display: 'inline-block' }}>{scopeCounts.allCount.toLocaleString()}</span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, animation: 'badge-breathe 1.6s ease-in-out infinite' }}>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor' }} />
              </span>
            )}
          </span>
        </button>

        <button
          type="button"
          className="enq-chip"
          aria-pressed={currentState === 'Unclaimed'}
          onClick={() => onSetActiveState('Claimable')}
          style={{
            height: h,
            fontWeight: currentState === 'Unclaimed' ? 600 : 500,
            background: chipBg(currentState === 'Unclaimed', claimedTone),
            color: chipColor(currentState === 'Unclaimed', claimedTone),
            boxShadow: chipShadow(currentState === 'Unclaimed', claimedTone),
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center' }}>{filterIconSvg('Unclaimed')}</span>
          <span className="enq-chip-label">Unclaimed</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            className="enq-chip"
            aria-pressed={currentState === 'Triaged'}
            onClick={() => onSetActiveState('Triaged')}
            title="Admin only"
            style={{
              height: h,
              fontWeight: currentState === 'Triaged' ? 600 : 500,
              background: chipBg(currentState === 'Triaged', triagedTone),
              color: chipColor(currentState === 'Triaged', triagedTone),
              boxShadow: chipShadow(currentState === 'Triaged', triagedTone, true),
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{filterIconSvg('Triaged')}</span>
            <span className="enq-chip-label">Triaged</span>
          </button>
        )}
      </div>
    </div>
  );
});

const Enquiries: React.FC<EnquiriesProps> = ({
  context,
  enquiries,
  enquiriesUsingSnapshot = false,
  enquiriesLiveRefreshInFlight = false,
  enquiriesLastLiveSyncAt = null,
  prefetchedTeamWideEnquiries,
  userData,
  poidData,
  setPoidData,
  teamData,
  onRefreshEnquiries,
  onOptimisticClaim,
  subscribeToEnquiryStream,
  instructionData,
  featureToggles = {},
  originalAdminUser,
  isActive = false,
  demoModeEnabled: demoModeEnabledProp,
  onTeamWideEnquiriesLoaded,
  pendingEnquiryId,
  pendingEnquirySubTab,
  pendingEnquiryPitchScenario,
  onPendingEnquiryHandled,
}) => {
  const isLocalDevHost = typeof window !== 'undefined'
    && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

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
      // Check both the legacy Enquiries key AND the global UserBubble key
      return localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true'
        || localStorage.getItem('demoModeEnabled') === 'true';
    } catch {
      return false;
    }
  });
  const demoModeEnabled = (typeof demoModeEnabledProp === 'boolean' ? demoModeEnabledProp : demoModeEnabledLocal)
    || (() => { try { return localStorage.getItem('demoModeEnabled') === 'true'; } catch { return false; } })();

  // Local overrides for instruction data — merged on top of prop-supplied data
  // after inline operations (EID, risk, matter) complete. Keyed by InstructionRef.
  const [instructionOverrides, setInstructionOverrides] = useState<Map<string, any>>(new Map());

  // Merge prop instructionData with local overrides so useMemo sees updates
  const effectiveInstructionData = useMemo(() => {
    if (!instructionData || instructionOverrides.size === 0) return instructionData;
    return (instructionData as any[]).map((prospect: any) => {
      const instructions = Array.isArray(prospect?.instructions) ? prospect.instructions : [];
      const hasOverride = instructions.some((inst: any) =>
        instructionOverrides.has(inst?.InstructionRef || inst?.instructionRef || '')
      );
      if (!hasOverride) return prospect;
      return {
        ...prospect,
        instructions: instructions.map((inst: any) => {
          const ref = inst?.InstructionRef || inst?.instructionRef || '';
          const override = instructionOverrides.get(ref);
          return override ? { ...inst, ...override } : inst;
        }),
        // Also merge idVerifications from override if present
        idVerifications: (() => {
          const overriddenInst = instructions.find((inst: any) =>
            instructionOverrides.has(inst?.InstructionRef || inst?.instructionRef || '')
          );
          if (!overriddenInst) return prospect?.idVerifications;
          const ref = overriddenInst?.InstructionRef || overriddenInst?.instructionRef || '';
          const override = instructionOverrides.get(ref);
          return override?.idVerifications ?? prospect?.idVerifications;
        })(),
        // Merge risk assessments from override when inline save occurs
        riskAssessments: (() => {
          const overriddenInst = instructions.find((inst: any) =>
            instructionOverrides.has(inst?.InstructionRef || inst?.instructionRef || '')
          );
          if (!overriddenInst) return prospect?.riskAssessments;
          const ref = overriddenInst?.InstructionRef || overriddenInst?.instructionRef || '';
          const override = instructionOverrides.get(ref);
          return override?.riskAssessments ?? prospect?.riskAssessments;
        })(),
      };
    });
  }, [instructionData, instructionOverrides]);

  // Map enquiry ID -> InlineWorkbench item (instruction + attached domains)
  // This is intentionally lightweight and read-only for the Prospects view.
  const inlineWorkbenchByEnquiryId = useMemo(() => {
    const result = new Map<string, any>();
    if (!effectiveInstructionData) return result;

    const normaliseId = (value: unknown): string | null => {
      const s = String(value ?? '').trim();
      return s.length > 0 ? s : null;
    };

    // Global indexes (Deals are the join point: Deal.InstructionRef -> Instructions.InstructionRef)
    const instructionByRef = new Map<string, any>();
    const dealByRef = new Map<string, any>();
    const dealsByProspectId = new Map<string, any[]>();

    (effectiveInstructionData as any[]).forEach((prospect) => {
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
      let score = (hasMatter ? 4 : 0) + (hasInstructionRef ? 1 : 0) + (hasDeal ? 1 : 0);

      // Prefer active/instructed deals over expired ones
      const dealStatus = String(deal?.Status || deal?.status || '').toLowerCase();
      if (dealStatus === 'instructed') score += 3;
      else if (dealStatus === 'pitched' || dealStatus === 'accepted') score += 2;
      else if (dealStatus === 'expired' || dealStatus === 'declined') score += 0;

      // Prefer advanced pipeline stages (proof-of-id-complete > initialised)
      const stage = String(inst?.Stage || '').toLowerCase();
      if (stage.includes('matter') || stage.includes('complete')) score += 3;
      else if (stage.includes('proof') || stage.includes('risk') || stage.includes('payment')) score += 2;
      else if (stage === 'initialised' || stage === 'initialized') score += 0;
      else if (stage) score += 1;

      // Prefer instructions with personal identity data populated
      if (inst?.DOB || inst?.DateOfBirth || inst?.PassportNumber || inst?.DriversLicenseNumber) score += 2;
      if (inst?.HouseNumber || inst?.Street || inst?.Postcode) score += 1;

      return score;
    };

    (effectiveInstructionData as any[]).forEach((prospect) => {
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

      // Email-based linkage for v2 enquiries (primary creation, not just copy).
      // Enrichment matches pitches by email reliably; workbench must too.
      // Instruction.Email → workbench item, keyed as "email:<normalised>".
      instructions.forEach((inst) => {
        const instEmail = String(inst?.Email ?? inst?.email ?? '').trim().toLowerCase();
        if (!instEmail) return;
        const emailKey = `email:${instEmail}`;
        if (result.has(emailKey)) return; // don't overwrite a better match
        // Prefer re-using the ProspectId-based entry if it succeeded
        const enquiryId = normaliseId(inst?.ProspectId ?? inst?.prospectId)
          || extractProspectIdFromRef(inst?.InstructionRef ?? inst?.instructionRef);
        const existing = enquiryId ? result.get(enquiryId) : undefined;
        if (existing) {
          result.set(emailKey, existing);
        } else {
          // ProspectId match failed — create a primary entry from scratch
          registerForEnquiryId(emailKey, inst);
        }
      });

      // Deal-email fallback: Deals.LeadClientEmail may differ from Instruction.Email
      deals.forEach((deal) => {
        const dealEmail = String(deal?.LeadClientEmail ?? deal?.leadClientEmail ?? deal?.Email ?? deal?.email ?? '').trim().toLowerCase();
        if (!dealEmail) return;
        const emailKey = `email:${dealEmail}`;
        if (result.has(emailKey)) return;
        const dealRef = normaliseId(deal?.InstructionRef ?? deal?.instructionRef);
        const matchingInst = dealRef ? (instructionByRef.get(dealRef) || null) : null;
        registerForEnquiryId(emailKey, matchingInst, deal);
      });
    });

    if (demoModeEnabled) {
      const currentUserEmail = userData && userData[0] && userData[0].Email
        ? userData[0].Email
        : 'lz@helix-law.com';
      const demoCases = [
        {
          id: 'DEMO-ENQ-0001',
          instructionRef: 'HLX-DEMO-00001',
          serviceDescription: 'Contract Dispute',
          amount: 1500,
          stage: 'enquiry',
          eidStatus: 'pending',
          eidResult: 'pending',
          internalStatus: 'pending',
          riskResult: null,          // No risk yet — early stage
          hasMatter: false,
          hasPayment: false,
          documents: 0,
        },
        {
          // Mid-pipeline demo: instructed, EID needs review, risk pending, no matter
          // Use this to realistically test EID review (approve/request docs), risk assessment, and trigger flows
          id: 'DEMO-ENQ-0002',
          instructionRef: 'HLX-DEMO-0002-00001',
          serviceDescription: 'Lease Renewal',
          amount: 3200,
          stage: 'proof-of-id',
          eidStatus: 'complete',
          eidResult: 'Refer',       // Triggers "needs review" action picker
          pepResult: 'Review',      // PEP flagged for review
          addressResult: 'Passed',
          internalStatus: 'pending',
          riskResult: null,          // No risk yet — pending assessment
          hasMatter: false,
          hasPayment: false,
          documents: 1,
        },
        {
          // Fully completed demo: everything done
          id: 'DEMO-ENQ-0003',
          instructionRef: 'HLX-DEMO-0003-00001',
          serviceDescription: 'Employment Tribunal',
          amount: 5000,
          stage: 'matter-opened',
          eidStatus: 'complete',
          eidResult: 'Pass',
          internalStatus: 'paid',
          riskResult: null,
          hasMatter: true,
          hasPayment: true,
          documents: 3,
        },
      ];

      demoCases.forEach((demoCase) => {
        const isIndividualClientDemo = demoCase.id === 'DEMO-ENQ-0002';
        // Generate demo dates relative to now
        const demoInstructionDate = new Date();
        demoInstructionDate.setDate(demoInstructionDate.getDate() - 3); // 3 days ago
        const demoEidDate = new Date();
        demoEidDate.setDate(demoEidDate.getDate() - 2); // 2 days ago
        
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
          // Fields used by InlineWorkbench identity tab
          Forename: 'Demo',
          Surname: 'Client',
          FirstName: 'Demo',
          LastName: 'Client',
          Title: 'Mr',
          Gender: 'Male',
          Email: 'demo.client@helix-law.com',
          Phone: '07700 900123',
          CompanyName: isIndividualClientDemo ? '' : 'Demo Corp',
          CompanyNumber: isIndividualClientDemo ? '' : '12345678',
          ClientType: isIndividualClientDemo ? 'Individual' : 'Company',
          AreaOfWork: demoCase.serviceDescription,
          ServiceDescription: demoCase.serviceDescription,
          FeeEarner: demoCase.id === 'DEMO-ENQ-0002' ? 'CB' : 'LZ',
          HelixContact: demoCase.id === 'DEMO-ENQ-0002' ? 'CB' : 'LZ',
          Passcode: `demo-${demoCase.id.toLowerCase()}`,
          // Personal details — mimic production data for card rendering
          Nationality: 'British',
          DOB: '1985-06-15',
          PassportNumber: 'DEMO12345678',
          HouseNumber: '42',
          Street: 'Demo Street',
          City: 'Brighton',
          County: 'East Sussex',
          Postcode: 'BN1 1AA',
          Country: 'United Kingdom',
          // Company address (for company client type rendering)
          CompanyHouseNumber: isIndividualClientDemo ? '' : '10',
          CompanyStreet: isIndividualClientDemo ? '' : 'Enterprise Way',
          CompanyCity: isIndividualClientDemo ? '' : 'London',
          CompanyCounty: isIndividualClientDemo ? '' : 'Greater London',
          CompanyPostcode: isIndividualClientDemo ? '' : 'EC1A 1BB',
          CompanyCountry: isIndividualClientDemo ? '' : 'United Kingdom',
          // PEP / Address verification from case config
          PEPAndSanctionsCheckResult: (demoCase as any).pepResult || (demoCase.eidResult === 'Pass' ? 'Passed' : undefined),
          AddressVerificationResult: (demoCase as any).addressResult || (demoCase.eidResult === 'Pass' ? 'Passed' : undefined),
        } : undefined;
        const deal = {
          ProspectId: demoCase.id,
          InstructionRef: demoCase.instructionRef,
          Amount: demoCase.amount,
          ServiceDescription: demoCase.serviceDescription,
          DealStatus: demoCase.internalStatus,
          Passcode: `demo-${demoCase.id.toLowerCase()}`,
          PitchedBy: demoCase.id === 'DEMO-ENQ-0002' ? 'CB' : 'LZ',
          PitchedDate: new Date(demoInstructionDate.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          PitchedTime: new Date(demoInstructionDate.getTime() - 2 * 24 * 60 * 60 * 1000).toTimeString().split(' ')[0],
        };
        const payments = demoCase.hasPayment ? [{
          payment_status: 'succeeded',
          internal_status: 'completed',
          amount: demoCase.amount * 100,
          created_at: new Date().toISOString(),
          payment_id: `pi_demo_${demoCase.id}`,
        }] : [];
        const riskAssessments = demoCase.riskResult
          ? [{ RiskAssessmentResult: demoCase.riskResult, RiskScore: 12, RiskAssessor: currentUserEmail.split('@')[0], ComplianceDate: new Date().toISOString(), TransactionRiskLevel: 'Low' }]
          : []; // Empty = risk pending
        const documents = Array.from({ length: demoCase.documents }).map((_, idx) => ({
          id: `demo-doc-${demoCase.id}-${idx + 1}`,
          filename: idx === 0 ? 'Passport_Scan.pdf' : idx === 1 ? 'Engagement_Letter_Signed.pdf' : 'Demo_Contract.pdf',
          FileName: idx === 0 ? 'Passport_Scan.pdf' : idx === 1 ? 'Engagement_Letter_Signed.pdf' : 'Demo_Contract.pdf',
          DocumentType: idx === 0 ? 'ID' : idx === 1 ? 'Engagement' : 'Contract',
          FileSizeBytes: idx === 0 ? 245000 : idx === 1 ? 182000 : 310000,
          UploadedAt: new Date().toISOString(),
        }));
        const matters = demoCase.hasMatter ? [{ MatterId: 'MAT-DEMO-001', DisplayNumber: 'HELIX01-01' }] : [];

        // Build EID record with realistic detail for demo testing
        const eidRecord: Record<string, unknown> = {
          EIDStatus: demoCase.eidStatus,
          EIDOverallResult: demoCase.eidResult,
          EIDCheckedDate: demoCase.eidStatus === 'complete' ? demoEidDate.toISOString() : undefined,
          PEPResult: (demoCase as any).pepResult || (demoCase.eidResult === 'Pass' ? 'Passed' : undefined),
          AddressVerification: (demoCase as any).addressResult || (demoCase.eidResult === 'Pass' ? 'Passed' : undefined),
        };

        result.set(demoCase.id, {
          isDemo: true,
          instruction,
          deal,
          clients: [{
            Email: 'demo.client@helix-law.com',
            ClientEmail: 'demo.client@helix-law.com',
            FirstName: 'Demo',
            LastName: 'Client',
            Nationality: 'British',
            DOB: '1985-06-15',
            Phone: '07700 900123',
            PassportNumber: 'DEMO12345678',
            HouseNumber: '42',
            Street: 'Demo Street',
            City: 'Brighton',
            County: 'East Sussex',
            Postcode: 'BN1 1AA',
            Country: 'United Kingdom',
          }],
          documents,
          payments,
          eid: demoCase.eidStatus !== 'pending' ? eidRecord : null,
          eids: demoCase.eidStatus !== 'pending' ? [eidRecord] : [],
          risk: riskAssessments[0] ?? null,
          riskAssessments,
          matters,
          team: currentUserEmail,
          prospectId: demoCase.id,
          ProspectId: demoCase.id,
        });
      });
    }

    return result;
  }, [effectiveInstructionData, demoModeEnabled, userData]);

  // Legacy used ActiveCampaign ID as internal ID; new space stores it in ACID.
  // deal.ProspectId = ActiveCampaign ID = enquiry.ACID
  const getEnquiryWorkbenchKey = useCallback((enquiry: Enquiry): string | null => {
    const acid = (enquiry as any).ACID || (enquiry as any).acid || (enquiry as any).Acid;
    const fallbackId = (enquiry as any).ProspectId || (enquiry as any).prospectId || enquiry.ID;
    const key = acid || fallbackId;
    return key ? String(key) : null;
  }, []);

  // Look up workbench item by enquiry's ACID (maps to deal.ProspectId). Fallback to enquiry ID, then email.
  const getEnquiryWorkbenchItem = useCallback((enquiry: Enquiry): any | undefined => {
    const acid = (enquiry as any).ACID || (enquiry as any).acid || (enquiry as any).Acid;
    const fallbackId = (enquiry as any).ProspectId || (enquiry as any).prospectId || enquiry.ID;
    const legacyId = (enquiry as any).legacyEnquiryId;
    const key = acid || fallbackId;
    if (key) {
      const byId = inlineWorkbenchByEnquiryId.get(String(key));
      if (byId) return byId;
    }
    // Legacy annotation from unified endpoint may carry the cross-referenced ID
    if (legacyId && legacyId !== key) {
      const byLegacy = inlineWorkbenchByEnquiryId.get(String(legacyId));
      if (byLegacy) return byLegacy;
    }
    // v2 enquiries may lack ACID — fall back to email match
    const email = String((enquiry as any).Email || (enquiry as any).email || '').trim().toLowerCase();
    if (email) {
      return inlineWorkbenchByEnquiryId.get(`email:${email}`);
    }
    return undefined;
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
    const actionDetail = {
      source: 'enquiries-workbench',
      instructionRef,
      action,
      tab: options.tab || null,
      hasDocumentPayload: Boolean(options.doc),
    };
    window.dispatchEvent(new CustomEvent('navigateToInstructions', { detail: actionDetail }));
    window.dispatchEvent(new CustomEvent('navigateToInstructionAction', { detail: actionDetail }));
  }, []);

  const workbenchHandlers = useMemo(() => ({
    onOpenEnquiryRating: (enquiryId: string) => {
      if (!enquiryId) return;
      window.dispatchEvent(new CustomEvent('helix:rate-enquiry', { detail: { enquiryId: String(enquiryId) } }));
    },
    onTriggerEID: async (instructionRef: string) => {
      // Run EID inline — no navigation to Instructions/Clients tab
      if (!instructionRef) return;
      const response = await fetch('/api/verify-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructionRef }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Verification failed');
      }

      const overallRaw = String(result.overall || '').trim();
      const overallLower = overallRaw.toLowerCase();
      const optimisticOverall = overallRaw || 'Verification Submitted';
      const optimisticStatus =
        overallLower.includes('pass') || overallLower.includes('verified')
          ? 'Verified'
          : overallLower.includes('review') || overallLower.includes('fail')
            ? 'Review'
            : 'Processing';

      const optimisticVerification = {
        InstructionRef: instructionRef,
        EIDOverallResult: optimisticOverall,
        EIDStatus: optimisticStatus,
        PEPAndSanctionsCheckResult: result.pep || null,
        AddressVerificationResult: result.address || null,
        EIDCheckedDate: new Date().toISOString(),
      };

      setInstructionOverrides(prev => {
        const next = new Map(prev);
        const existing = next.get(instructionRef) || {};
        const existingVerifications = Array.isArray(existing.idVerifications) ? existing.idVerifications : [];
        next.set(instructionRef, {
          ...existing,
          EIDOverallResult: optimisticOverall,
          EIDStatus: optimisticStatus,
          idVerifications: [optimisticVerification, ...existingVerifications],
        });
        return next;
      });
    },
    onRefreshData: async (instructionRef?: string) => {
      // Fetch updated instruction data and merge locally so UI updates without full refresh
      const ref = instructionRef?.trim();
      if (!ref) return;
      try {
        const response = await fetch(`/api/instructions/${ref}`);
        if (response.ok) {
          const updated = await response.json();
          setInstructionOverrides(prev => {
            const next = new Map(prev);
            next.set(ref, updated);
            return next;
          });
        }
      } catch (error) {
        console.error('Failed to refresh instruction data inline:', error);
      }
    },
    onOpenIdReview: (_instructionRef: string) => {
      // No-op — ID review (approve/request docs) is handled inline via InlineWorkbench's local modals
    },
    onOpenRiskAssessment: (_instruction: any) => {
      // No-op — risk assessment is handled inline via InlineWorkbench's local modal
    },
    onRiskAssessmentSave: (instructionRef: string, savedRisk: any) => {
      const ref = (instructionRef || '').trim();
      if (!ref || !savedRisk) return;
      setInstructionOverrides(prev => {
        const next = new Map(prev);
        const existing = next.get(ref) || {};
        const existingRisks = Array.isArray(existing.riskAssessments) ? existing.riskAssessments : [];
        next.set(ref, {
          ...existing,
          riskAssessments: [savedRisk, ...existingRisks],
        });
        return next;
      });
    },
    onOpenMatter: (_instruction: any) => {
      // No-op — matter opening is handled inline via InlineWorkbench's local modal
    },
    onDocumentPreview: (doc: any) => {
      const instructionRef = doc?.InstructionRef || doc?.instructionRef || doc?.instruction_ref || '';
      dispatchInstructionAction('preview-document', { instructionRef, tab: 'documents', doc });
    },
  }), [dispatchInstructionAction]);

  // Use only real enquiries data
  // All normalized enquiries (union of legacy + new) retained irrespective of toggle
  const [allEnquiries, setAllEnquiries] = useState<NormalizedEnquiry[]>([]);
  // Display subset after applying dataset toggle
  const [displayEnquiries, setDisplayEnquiries] = useState<NormalizedEnquiry[]>([]);
  // Team-wide dataset for suppression index (includes other users' claimed enquiries)
  const [teamWideEnquiries, setTeamWideEnquiries] = useState<NormalizedEnquiry[]>([]);
  const lastStableDisplayRef = useRef<NormalizedEnquiry[]>([]);
  // Loading state to prevent flickering
  const [isLoadingAllData, setIsLoadingAllData] = useState<boolean>(false);
  // Track if we've already fetched all data to prevent duplicate calls
  const hasFetchedAllData = useRef<boolean>(false);
  const hasRetriedEmptyAllData = useRef<boolean>(false);
  // Guard against render-loop fetches when shared IDs need team-wide history
  const hasTriggeredSharedHistoryFetch = useRef<boolean>(false);

  // Debug: track why we fetched team-wide data (avoid PII in logs)
  const lastTeamWideFetchReasonRef = useRef<string>('');

  useEffect(() => {
    if (!Array.isArray(prefetchedTeamWideEnquiries) || prefetchedTeamWideEnquiries.length === 0) {
      return;
    }

    startTransition(() => {
      setTeamWideEnquiries((prev) => {
        if (prev.length >= prefetchedTeamWideEnquiries.length) {
          return prev;
        }
        return prefetchedTeamWideEnquiries.map((raw: any) => normalizeEnquiry(raw));
      });
    });
    hasFetchedAllData.current = true;
  }, [prefetchedTeamWideEnquiries]);

  // Debug logging

  // View mode — table only (card view removed)
  const viewMode = 'table' as const;

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
  // Start from the optimistic full-width state and let ResizeObserver compress only if needed.
  const [visiblePipelineChipCount, setVisiblePipelineChipCount] = useState<number>(7);
  const pipelineMeasureRetryRef = useRef(0);
  const pipelineMeasureRetryTimerRef = useRef<number | null>(null);
  // Counter to trigger re-measurement when returning from detail view
  const [pipelineRemeasureKey, setPipelineRemeasureKey] = useState<number>(0);
  // Minimum chip width at each mode (tuned for smoother width recognition)
  const CHIP_MIN_WIDTHS = { icon: 24, short: 68, full: 92 };
  const MIN_PIPELINE_STABLE_WIDTH_PX = 180;
  const LOCKED_ACTIONS_COLUMN_WIDTH_PX = 56;
  const UNLOCKED_ACTIONS_COLUMN_WIDTH_PX = 188;
  const LOCKED_ACTIONS_COLUMN_WIDTH = `clamp(32px, 4vw, ${LOCKED_ACTIONS_COLUMN_WIDTH_PX}px)`;
  const UNLOCKED_ACTIONS_COLUMN_WIDTH = `clamp(80px, 14vw, ${UNLOCKED_ACTIONS_COLUMN_WIDTH_PX}px)`;
  const getTableGridTemplateColumns = (actionsEnabled: boolean) => (
    `clamp(20px, 4vw, 36px) minmax(clamp(28px, 5vw, 60px), 0.45fr) minmax(clamp(44px, 7vw, 88px), 0.6fr) minmax(clamp(50px, 9vw, 140px), 1.1fr) minmax(clamp(60px, 15vw, 260px), 3.4fr) ${actionsEnabled ? UNLOCKED_ACTIONS_COLUMN_WIDTH : LOCKED_ACTIONS_COLUMN_WIDTH}`
  );
  const TABLE_GRID_GAP_PX = 4;
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
      { stage: 'instructed', fullLabel: 'Instructed', shortLabel: 'Instr', iconName: 'CheckMark' },
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
    const gap = 6;
    let x = rect.left + rect.width / 2;
    let y = rect.top - gap;
    if (typeof window !== 'undefined') {
      if (x < 8) x = 8;
      if (x > window.innerWidth - 8) x = window.innerWidth - 8;
      if (y < 32) y = rect.bottom + gap;
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

  const schedulePipelineRemeasure = useCallback((delay = 120) => {
    if (pipelineMeasureRetryRef.current >= 8) {
      return;
    }
    pipelineMeasureRetryRef.current += 1;
    if (pipelineMeasureRetryTimerRef.current) {
      window.clearTimeout(pipelineMeasureRetryTimerRef.current);
    }
    pipelineMeasureRetryTimerRef.current = window.setTimeout(() => {
      setPipelineRemeasureKey((value) => value + 1);
    }, delay);
  }, []);

  useEffect(() => {
    const el = pipelineGridMeasureRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      schedulePipelineRemeasure();
      return;
    }

    // Track last measured width to avoid unnecessary state updates
    let lastMeasuredWidth = 0;

    const computePipelineLayout = (totalWidth: number) => {
      const columnGap = 8;
      const navOverlayWidth = 32;
      const responsiveSafetyPadding = 36;
      const chipComfortWidths = { full: 12, short: 10, icon: 8 };
      const availableWidth = Math.max(0, totalWidth - responsiveSafetyPadding);
      const minFull = CHIP_MIN_WIDTHS.full;
      const minShort = CHIP_MIN_WIDTHS.short;
      const minIcon = CHIP_MIN_WIDTHS.icon;

      let nextMode: PipelineChipLabelMode = 'short';
      let nextCount = 7;

      const widthNeeded = (count: number, chipWidth: number, reserveOverlay: boolean, chipComfortWidth: number) =>
        count * (chipWidth + chipComfortWidth) + Math.max(0, count - 1) * columnGap + (reserveOverlay ? navOverlayWidth : 0);

      let fitFound = false;
      for (let n = 7; n >= 1; n--) {
        const reserveOverlay = n < 7;
        if (availableWidth >= widthNeeded(n, minFull, reserveOverlay, chipComfortWidths.full)) {
          nextMode = 'full';
          nextCount = n;
          fitFound = true;
          break;
        }
        if (availableWidth >= widthNeeded(n, minShort, reserveOverlay, chipComfortWidths.short)) {
          nextMode = 'short';
          nextCount = n;
          fitFound = true;
          break;
        }
        if (availableWidth >= widthNeeded(n, minIcon, reserveOverlay, chipComfortWidths.icon)) {
          nextMode = 'icon';
          nextCount = n;
          fitFound = true;
          break;
        }
      }

      if (!fitFound) {
        nextMode = 'icon';
        nextCount = 1;
      }

      setPipelineChipLabelMode((prev) => (prev === nextMode ? prev : nextMode));
      setVisiblePipelineChipCount(nextCount);
    };

    const applyMeasuredWidth = (width: number, force = false) => {
      if (!width) {
        schedulePipelineRemeasure();
        return;
      }
      if (width < MIN_PIPELINE_STABLE_WIDTH_PX && pipelineMeasureRetryRef.current < 6) {
        schedulePipelineRemeasure(140);
        return;
      }
      pipelineMeasureRetryRef.current = 0;

      // Skip if width hasn't changed significantly (within 1px tolerance)
      if (!force && Math.abs(width - lastMeasuredWidth) < 1) return;
      lastMeasuredWidth = width;

      computePipelineLayout(width);
    };

    // Calculate and apply measurement immediately on mount (avoid layout flash)
    const measureAndApply = (force = false) => {
      const rect = el.getBoundingClientRect();
      applyMeasuredWidth(rect.width, force);
    };

    // Measure immediately on mount to prevent layout flash
    measureAndApply(true);
    const settleRaf = requestAnimationFrame(() => measureAndApply(true));
    const settleRafLate = requestAnimationFrame(() => {
      requestAnimationFrame(() => measureAndApply(true));
    });
    // Also measure after a short delay to catch late layout stabilization
    const delayedMeasure = window.setTimeout(() => measureAndApply(true), 100);
    const delayedMeasureLate = window.setTimeout(() => measureAndApply(true), 240);
    
    // Debounced resize handler for smoother updates
    let resizeRaf: number | null = null;
    const handleResize = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        lastMeasuredWidth = 0; // Force remeasure on explicit resize
        measureAndApply(true);
      });
    };
    window.addEventListener('resize', handleResize);
    
    const observer = new ResizeObserver((items) => {
      const rect = items[0]?.contentRect;
      if (!rect) return;
      applyMeasuredWidth(rect.width);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(delayedMeasure);
      window.clearTimeout(delayedMeasureLate);
      cancelAnimationFrame(settleRaf);
      cancelAnimationFrame(settleRafLate);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      if (pipelineMeasureRetryTimerRef.current) {
        window.clearTimeout(pipelineMeasureRetryTimerRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [viewMode, pipelineRemeasureKey, selectedPocFilter, enquiryPipelineFilters.size, schedulePipelineRemeasure]);
  
  // Pipeline filter toggle handler - cycles through: no filter → yes → no → clear (loop)
  const cycleEnquiryPipelineFilter = useCallback((stage: EnquiryPipelineStage) => {
    setEnquiryPipelineFilters(prev => {
      const newFilters = new Map(prev);
      const currentFilter = newFilters.get(stage);
      
      if (!currentFilter) {
        // No filter → show 'has this stage' (green)
        newFilters.set(stage, 'yes');
      } else if (currentFilter === 'yes') {
        // 'Has' → show 'missing this stage' (red)
        newFilters.set(stage, 'no');
      } else {
        // 'Missing' → clear filter (loop back to no filter)
        newFilters.delete(stage);
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
    
    const gridCols = `repeat(${showNav ? visiblePipelineChipCount : 7}, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr))`;
    const pipelineGridPaddingRight = showNav ? 32 : 0;
    
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
            paddingRight: pipelineGridPaddingRight,
            boxSizing: 'border-box',
          }}
        >
          {showNav 
            ? children.slice(visibleStart, visibleEnd)
            : children}
        </div>
        {showNav ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              advancePipelineScroll(enquiryId, totalChips, visiblePipelineChipCount);
            }}
            title={hasMoreChips ? `View more stages (${totalChips - visibleEnd} hidden)` : 'Back to start'}
            style={{
              position: 'absolute',
              top: '50%',
              right: 0,
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 22,
              padding: 0,
              border: `1px solid ${isDark ? 'rgba(160, 160, 160, 0.25)' : 'rgba(107, 107, 107, 0.2)'}`,
              borderRadius: 0,
              background: hasMoreChips
                ? (isDark ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                : (isDark ? 'rgba(160, 160, 160, 0.06)' : 'rgba(160, 160, 160, 0.04)'),
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              color: hasMoreChips
                ? colours.blue
                : (isDark ? 'rgba(160, 160, 160, 0.5)' : 'rgba(107, 107, 107, 0.4)'),
            }}
          >
            <Icon
              iconName={hasMoreChips ? 'ChevronRight' : 'Refresh'}
              styles={{
                root: {
                  fontSize: hasMoreChips ? 12 : 10,
                  color: 'inherit',
                  opacity: hasMoreChips ? 1 : 0.7,
                },
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
        ) : null}
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
  const fetchAllEnquiries = useCallback(async (options?: { bypassCache?: boolean }) => {
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

  // Call unified server-side route for ALL environments to avoid legacy combined route
  // Use same date range as user's personal view for consistency
  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const dateFrom = twelveMonthsAgo.toISOString().split('T')[0];
  const dateTo = now.toISOString().split('T')[0];
  
  const allDataParams = new URLSearchParams({ 
    fetchAll: 'true', 
    includeTeamInbox: 'true', 
    limit: '5000',
    dateFrom,
    dateTo,
  });
  if (options?.bypassCache) {
    allDataParams.set('bypassCache', 'true');
  }
  appendDefaultEnquiryProcessingParams(allDataParams);
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
      } else if (Array.isArray((data as any).data)) {
        rawEnquiries = (data as any).data;
        debugLog('📦 Using data.data array');
      } else {
        debugWarn('⚠️ Unexpected data structure:', data);
      }
      
      debugLog('✅ Fetched all enquiries:', rawEnquiries.length);
      
      // Convert to normalized format
      const normalizedEnquiries = rawEnquiries.map((raw: any) => normalizeEnquiry(raw));
      
      debugLog('🔄 Setting normalized data to state:', normalizedEnquiries.length);
      
      // IMPORTANT: Do not overwrite per-user dataset when fetching team-wide data for All/Mine+Claimed.
      // Keep `allEnquiries` sourced from props (per-user), and store the unified dataset only in teamWideEnquiries.
      // This prevents Mine view from briefly switching to team-wide dataset and dropping claimed items.
      // Apply team-wide data synchronously — startTransition delays would cause
      // downstream effects to see stale empty state and trigger duplicate fetches.
      setTeamWideEnquiries(normalizedEnquiries);
      hasFetchedAllData.current = true;
      hasRetriedEmptyAllData.current = false;
      setLastRefreshTime(new Date());
      setNextRefreshIn(60);
      onTeamWideEnquiriesLoaded?.(normalizedEnquiries as Enquiry[]);
      
      console.info('[Enquiries] fetchAllEnquiries:success', {
        reason: lastTeamWideFetchReasonRef.current || 'unknown',
        count: normalizedEnquiries.length,
      });
      debugLog('✅ Team-wide enquiries loaded; preserved per-user allEnquiries');
      
      return normalizedEnquiries;
    } catch (error) {
      console.error('❌ Failed to fetch all enquiries:', error);
      hasFetchedAllData.current = false;
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
  const headerTextColor = isDarkMode ? colours.dark.text : colours.light.text;
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
  const [activeSubTab, setActiveSubTab] = useState<string>('Timeline');
  const [selectedPitchScenario, setSelectedPitchScenario] = useState<string | undefined>(undefined);
  const [showUnclaimedBoard, setShowUnclaimedBoard] = useState<boolean>(false);
  const [isCreateContactModalOpen, setIsCreateContactModalOpen] = useState<boolean>(false);
  const [isPeopleSearchOpen, setIsPeopleSearchOpen] = useState<boolean>(false);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ oldest: string; newest: string } | null>(null);
  const [isSearchActive, setSearchActive] = useState<boolean>(false);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showGroupedView, setShowGroupedView] = useState<boolean>(true);
  const [areActionsEnabled, setAreActionsEnabled] = useState<boolean>(false);
  const TABLE_GRID_TEMPLATE_COLUMNS = getTableGridTemplateColumns(areActionsEnabled);
  const [shareModalEnquiry, setShareModalEnquiry] = useState<Enquiry | null>(null);
  const [shareModalSelectedEmails, setShareModalSelectedEmails] = useState<string[]>([]);
  const [shareModalExternalEmails, setShareModalExternalEmails] = useState<string[]>([]);
  const [shareModalSearch, setShareModalSearch] = useState<string>('');
  const [isShareModalSaving, setIsShareModalSaving] = useState<boolean>(false);
  const [demoSharedSimulationById, setDemoSharedSimulationById] = useState<Record<string, string>>({});
  const [documentCounts, setDocumentCounts] = useState<Record<string, number>>({});
  // Local dataset toggle (legacy vs new direct) analogous to Matters (only in localhost UI for now)
  // Deal Capture is always enabled by default now
  const showDealCapture = true;
  
  // Auto-refresh state
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(() => enquiriesLastLiveSyncAt ? new Date(enquiriesLastLiveSyncAt) : new Date(0));
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [nextRefreshIn, setNextRefreshIn] = useState<number>(60); // 60 seconds
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const handleManualRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const lastActivationRefreshAtRef = useRef<number>(0);
  // Track recent updates to prevent overwriting with stale prop data
  const recentUpdatesRef = useRef<Map<string, { field: string; value: any; timestamp: number }>>(new Map());

  // Realtime: subscribe to lightweight SSE events.
  // Goal: apply local patches immediately (no stale UI), with a slower backstop refresh.
  // Compute-respectful: only active tab subscribes; refreshes are coalesced.
  const refreshRef = useRef(onRefreshEnquiries);
  const refreshTimerRef = useRef<number | null>(null);
  const lastKnownEnquiryTsRef = useRef<number>(0);
  const realtimeSyncClearTimerRef = useRef<number | null>(null);
  const [sseConnected, setSseConnected] = useState(true);
  const [isRealtimeQueueSyncing, setIsRealtimeQueueSyncing] = useState(false);

  useEffect(() => {
    if (!selectedEnquiry) return;

    const selectedId = String(selectedEnquiry.ID || '').trim();
    const selectedProcessingId = String(selectedEnquiry.processingEnquiryId || '').trim();
    const selectedPitchId = String(selectedEnquiry.pitchEnquiryId || '').trim();
    const selectedEmail = normalizeSearchEmailArtifacts(selectedEnquiry.Email);
    const selectedIdentityKey = buildEnquiryIdentityKey(selectedEnquiry);

    const matchesSelected = (candidate: Enquiry) => {
      const candidateId = String(candidate.ID || '').trim();
      const candidateProcessingId = String(candidate.processingEnquiryId || '').trim();
      const candidatePitchId = String(candidate.pitchEnquiryId || '').trim();
      const candidateEmail = normalizeSearchEmailArtifacts(candidate.Email);

      if (selectedId && candidateId === selectedId) return true;
      if (selectedProcessingId && candidateProcessingId === selectedProcessingId) return true;
      if (selectedPitchId && candidatePitchId === selectedPitchId) return true;
      if (selectedIdentityKey && buildEnquiryIdentityKey(candidate) === selectedIdentityKey) return true;
      if (selectedEmail && candidateEmail && candidateEmail === selectedEmail) return true;
      return false;
    };

    const candidateSources: Array<Enquiry[] | null | undefined> = [displayEnquiries, teamWideEnquiries, allEnquiries];
    let nextSelected: Enquiry | null = null;

    for (const source of candidateSources) {
      if (!Array.isArray(source) || source.length === 0) continue;
      const found = source.find(matchesSelected);
      if (found) {
        nextSelected = found;
        break;
      }
    }

    if (nextSelected && nextSelected !== selectedEnquiry) {
      setSelectedEnquiry(nextSelected);
    }
  }, [allEnquiries, displayEnquiries, selectedEnquiry, teamWideEnquiries]);

  // ─── New-arrival animation tracking ───────────────────────
  // Stores the set of enquiry IDs from the previous displayedItems render.
  // When displayedItems changes, any ID not in this set is "newly arrived"
  // and gets a CSS entrance animation via DOM class injection.
  const prevDisplayedIdsRef = useRef<Set<string>>(new Set());
  const initialRenderDoneRef = useRef(false);

  useEffect(() => {
    refreshRef.current = onRefreshEnquiries;
  }, [onRefreshEnquiries]);

  useEffect(() => {
    if (!enquiriesLastLiveSyncAt) {
      return;
    }

    setLastRefreshTime(prev => {
      if (prev.getTime() === enquiriesLastLiveSyncAt) {
        return prev;
      }
      return new Date(enquiriesLastLiveSyncAt);
    });
  }, [enquiriesLastLiveSyncAt]);

  useEffect(() => {
    if (!isActive || !refreshRef.current) {
      return;
    }

    const now = Date.now();
    const liveSyncAgeMs = enquiriesLastLiveSyncAt ? now - enquiriesLastLiveSyncAt : Number.POSITIVE_INFINITY;
    const needsLiveRefresh = enquiriesUsingSnapshot || liveSyncAgeMs > 20000;
    const recentlyAttempted = now - lastActivationRefreshAtRef.current < 8000;

    if (!needsLiveRefresh || recentlyAttempted || isRefreshing || enquiriesLiveRefreshInFlight || isLoadingAllData) {
      return;
    }

    lastActivationRefreshAtRef.current = now;
    setIsRefreshing(true);

    refreshRef.current()
      .then(() => {
        setLastRefreshTime(new Date());
        setNextRefreshIn(60);
      })
      .catch((error) => {
        console.warn('[Enquiries] Active-tab live refresh failed:', error);
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [isActive, enquiriesUsingSnapshot, enquiriesLastLiveSyncAt, enquiriesLiveRefreshInFlight, isLoadingAllData, isRefreshing]);

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

    const updateEnquiry = (enquiry: NormalizedEnquiry): NormalizedEnquiry => {
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

  /**
   * Apply a generic field-level patch from an SSE event.
   * Normalizes both legacy and new-schema field aliases to keep state consistent.
   */
  const applyRealtimeUpdatePatch = useCallback((enquiryId: string, record: Record<string, unknown>) => {
    if (!enquiryId || !record || Object.keys(record).length === 0) return;

    // Build normalized patch with both legacy and new-schema aliases
    const patch: Record<string, unknown> = { ...record };
    if ('First_Name' in record) patch.first = record.First_Name;
    if ('Last_Name' in record) patch.last = record.Last_Name;
    if ('Point_of_Contact' in record) patch.poc = record.Point_of_Contact;
    if ('Area_of_Work' in record) patch.aow = record.Area_of_Work;
    if ('Email' in record) patch.email = record.Email;
    if ('Initial_first_call_notes' in record) patch.notes = record.Initial_first_call_notes;
    if ('Value' in record) patch.value = record.Value;
    if ('Rating' in record) patch.rating = record.Rating;

    const updateEnquiry = (enquiry: NormalizedEnquiry): NormalizedEnquiry => {
      if (String(enquiry.ID) !== String(enquiryId)) return enquiry;
      return { ...enquiry, ...patch } as NormalizedEnquiry;
    };

    setAllEnquiries(prev => prev.map(updateEnquiry));
    setDisplayEnquiries(prev => prev.map(updateEnquiry));
    setTeamWideEnquiries(prev => prev.map(updateEnquiry));
  }, []);

  const applyRealtimeUpdatePatchRef = useRef(applyRealtimeUpdatePatch);
  applyRealtimeUpdatePatchRef.current = applyRealtimeUpdatePatch;

  const markRealtimeQueueSyncing = useCallback((active: boolean) => {
    if (realtimeSyncClearTimerRef.current) {
      window.clearTimeout(realtimeSyncClearTimerRef.current);
      realtimeSyncClearTimerRef.current = null;
    }

    if (active) {
      setIsRealtimeQueueSyncing(true);
      return;
    }

    realtimeSyncClearTimerRef.current = window.setTimeout(() => {
      setIsRealtimeQueueSyncing(false);
      realtimeSyncClearTimerRef.current = null;
    }, 900);
  }, []);

  const refreshVisibleEnquiriesDataset = useCallback((reason: string) => {
    const shouldRefreshTeamWide = !showMineOnly || activeState !== 'Claimed' || hasFetchedAllData.current;
    const isRealtimeReason = reason === 'pulse' || reason.startsWith('stream-');

    if (isRealtimeReason) {
      markRealtimeQueueSyncing(true);
    }

    if (shouldRefreshTeamWide) {
      lastTeamWideFetchReasonRef.current = `realtime:${reason}`;
      fetchAllEnquiries({ bypassCache: isRealtimeReason })
        .catch(() => { /* ignore */ })
        .finally(() => {
          if (isRealtimeReason) {
            markRealtimeQueueSyncing(false);
          }
        });
      return;
    }

    refreshRef.current?.()
      .catch(() => { /* ignore */ })
      .finally(() => {
        if (isRealtimeReason) {
          markRealtimeQueueSyncing(false);
        }
      });
  }, [showMineOnly, activeState, fetchAllEnquiries, markRealtimeQueueSyncing]);

  useEffect(() => {
    return () => {
      if (realtimeSyncClearTimerRef.current) {
        window.clearTimeout(realtimeSyncClearTimerRef.current);
      }
    };
  }, []);

  // Stable refs for SSE/pulse callbacks — prevents stream reconnection when deps change
  const applyRealtimeClaimPatchRef = useRef(applyRealtimeClaimPatch);
  applyRealtimeClaimPatchRef.current = applyRealtimeClaimPatch;
  const refreshVisibleRef = useRef(refreshVisibleEnquiriesDataset);
  refreshVisibleRef.current = refreshVisibleEnquiriesDataset;

  useEffect(() => {
    // Subscribe to app shell's SSE stream instead of opening a duplicate EventSource.
    // The app shell (index.tsx) maintains the sole SSE connection to /api/enquiries-unified/stream
    // and broadcasts parsed events to registered listeners.
    if (!subscribeToEnquiryStream || !isActive || !refreshRef.current) {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }

    setSseConnected(true); // Trust the app shell's always-on connection

    const unsubscribe = subscribeToEnquiryStream((event) => {
      const { changeType, enquiryId, claimedBy, claimedAt, record } = event;
      console.info('[Enquiries] stream:event', { type: changeType, hasRecord: !!record });

      if (changeType === 'claim' && enquiryId) {
        // Instant local patch — no refresh needed, background reconciliation handles drift
        applyRealtimeClaimPatchRef.current(enquiryId, claimedBy || '', claimedAt ?? null);
        return;
      }

      if (changeType === 'update' && enquiryId && record) {
        // Instant field-level patch from server-confirmed data
        applyRealtimeUpdatePatchRef.current(enquiryId, record);
        return;
      }

      if (changeType === 'delete' && enquiryId) {
        const deletedIds = Array.isArray(event.deletedIds)
          ? event.deletedIds.map((value: unknown) => String(value || '').trim()).filter(Boolean)
          : [];
        const candidateIds = new Set<string>([
          String(enquiryId || '').trim(),
          ...deletedIds,
        ]);
        // Remove from all local datasets — instant
        const removeEnquiry = (enq: NormalizedEnquiry) => !Array.from(candidateIds).some((candidateId) => enquiryReferencesId(enq, candidateId));
        setAllEnquiries(prev => prev.filter(removeEnquiry));
        setDisplayEnquiries(prev => prev.filter(removeEnquiry));
        setTeamWideEnquiries(prev => prev.filter(removeEnquiry));
        return;
      }

      if (changeType === 'create') {
        // New record — schedule a gentle background refresh to pick up the full row
        // (the app shell handles the reconciliation timer)
        if (refreshTimerRef.current) {
          window.clearTimeout(refreshTimerRef.current);
        }
        refreshTimerRef.current = window.setTimeout(() => {
          refreshTimerRef.current = null;
          refreshVisibleRef.current('stream-create');
        }, 5000);
        return;
      }

      // Fallback: unknown event types — no aggressive refresh
      console.info('[Enquiries] stream:unhandled-event', { type: changeType });
    });

    console.info('[Enquiries] stream:subscribed (via app shell)');

    return () => {
      unsubscribe();
      console.info('[Enquiries] stream:unsubscribed');
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [isActive, subscribeToEnquiryStream]);

  // Pulse polling — fallback for missed SSE events. Runs at 60s intervals.
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
          refreshVisibleRef.current('pulse');
        }
      } catch {
        // non-blocking
      }
    };

    poll();
    const intervalId = window.setInterval(poll, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isActive]); // Only restart poll when tab activation changes
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
  
  // Toast notification state (consolidated)
  const [toast, setToast] = useState<{ visible: boolean; message: string; details: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning', details = '', durationMs = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, message, details, type });
    if (durationMs > 0) {
      toastTimerRef.current = setTimeout(() => setToast(prev => prev ? { ...prev, visible: false } : null), durationMs);
    }
  }, []);

  const [demoOverlay, setDemoOverlay] = useState<{ visible: boolean; message: string; details: string } | null>(null);

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
    fetchAllEnquiries({ bypassCache: reason.startsWith('recover:') });
  }, [showMineOnly, activeState, isLoadingAllData, teamWideEnquiries.length, allEnquiries.length, fetchAllEnquiries]);

  useEffect(() => {
    if (showMineOnly) return;
    if (isLoadingAllData) return;
    if (teamWideEnquiries.length > 0) {
      hasRetriedEmptyAllData.current = false;
      return;
    }
    if (!hasFetchedAllData.current) return;
    if (hasRetriedEmptyAllData.current) return;

    hasRetriedEmptyAllData.current = true;
    // Don't reset hasFetchedAllData — that allows mode:all to double-fire.
    debugWarn('⚠️ All mode resolved empty team-wide dataset; retrying once with bypass cache');
    triggerFetchAllEnquiries('recover:empty-all');
  }, [showMineOnly, isLoadingAllData, teamWideEnquiries.length, triggerFetchAllEnquiries]);
  
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
  
  // Search handler — FilterBanner manages its own local typing state (debounceMs),
  // so this callback only fires after the debounce delay with the final value.
  const handleSearchChange = useCallback((value: string) => {
    setDebouncedSearchTerm(value);
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
              options.dataSource || 'new'
            );
            
            if (result.success) {
              // Toast confirmation — SSE will confirm the patch, no refetch needed
              showToast('Enquiry claimed', 'success');
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
            border: `1px solid ${isDarkMode ? 'rgba(255, 140, 0, 0.4)' : 'rgba(255, 140, 0, 0.35)'}`,
            background: isDarkMode ? 'rgba(255, 140, 0, 0.10)' : 'rgba(255, 140, 0, 0.08)',
            color: colours.orange,
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
              e.currentTarget.style.background = isDarkMode ? 'rgba(255, 140, 0, 0.18)' : 'rgba(255, 140, 0, 0.14)';
              e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255, 140, 0, 0.55)' : 'rgba(255, 140, 0, 0.5)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isClaiming) {
              e.currentTarget.style.background = isDarkMode ? 'rgba(255, 140, 0, 0.10)' : 'rgba(255, 140, 0, 0.08)';
              e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255, 140, 0, 0.4)' : 'rgba(255, 140, 0, 0.35)';
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
                background: isDarkMode ? 'rgba(255, 140, 0, 0.9)' : 'rgba(255, 140, 0, 0.85)',
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
  const [devOwnerMineOverrideEmail, setDevOwnerMineOverrideEmail] = useState<string | null>(null);

  const normalizedSearchTerm = useMemo(() => normalizeSearchEmailArtifacts(debouncedSearchTerm), [debouncedSearchTerm]);
  const searchTokens = useMemo(() => normalizedSearchTerm.split(' ').filter(Boolean), [normalizedSearchTerm]);
  const numericSearchTerm = useMemo(() => toDigitSearchValue(normalizedSearchTerm), [normalizedSearchTerm]);

  const hasActiveSearch = useMemo(() => normalizedSearchTerm.length > 0, [normalizedSearchTerm]);

  const isIdSearch = useMemo(() => {
    const raw = normalizedSearchTerm;
    if (!raw) return false;
    if (raw.startsWith('id:')) {
      return /^id:\s*\d+$/.test(raw);
    }
    return /^\d+$/.test(raw);
  }, [normalizedSearchTerm]);

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

  const actualEnquiryIdentity = useMemo(() => ({
    email: String(userData?.[0]?.Email || '').trim().toLowerCase(),
    initials: String(userData?.[0]?.Initials || '').trim().toUpperCase(),
  }), [userData]);

  const canUseDevOwnerMineOverride = useMemo(
    () => isLocalhost && isDevOwner(userData?.[0] || null) && !originalAdminUser,
    [isLocalhost, originalAdminUser, userData]
  );

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
    
    const normalised: NormalizedEnquiry[] = enquiries.map((raw: any) => {
      const rec = normalizeEnquiry(raw);
      
      // Check if this enquiry has a recent update that should override prop data
      const enquiryId = rec.ID;
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

    // If demo mode is active, preserve existing demo entries so they aren't lost on prop refresh
    if (demoModeEnabled) {
      const demoIds = new Set(['DEMO-ENQ-0001', 'DEMO-ENQ-0002', 'DEMO-ENQ-0003']);
      const hasDemo = normalised.some(e => demoIds.has(String(e.ID)));
      if (!hasDemo) {
        setAllEnquiries(prev => {
          const existingDemo = prev.filter(e => demoIds.has(String(e.ID)));
          if (existingDemo.length === 0) return normalised;
          const normWithoutDemo = normalised.filter(e => !demoIds.has(String(e.ID)));
          return [...existingDemo, ...normWithoutDemo];
        });
        return;
      }
    }

    setAllEnquiries(normalised);
  }, [enquiries, isAdmin, showMineOnly, demoModeEnabled]);

  const devOwnerMineOptions = useMemo(() => {
    if (!canUseDevOwnerMineOverride) return [] as Array<{ email: string; label: string; fullLabel: string; initials: string; isSelf: boolean }>;

    const seen = new Set<string>();
    const options: Array<{ email: string; label: string; fullLabel: string; initials: string; isSelf: boolean }> = [];
    const pushOption = (email: string, label: string, fullLabel: string, initials: string, isSelf: boolean) => {
      const normalisedEmail = String(email || '').trim().toLowerCase();
      if (!normalisedEmail || seen.has(normalisedEmail) || normalisedEmail === 'team@helix-law.com') return;
      seen.add(normalisedEmail);
      options.push({ email: normalisedEmail, label, fullLabel, initials, isSelf });
    };

    const actualEmail = actualEnquiryIdentity.email;
    const actualInitials = actualEnquiryIdentity.initials || actualEmail.split('@')[0]?.slice(0, 2).toUpperCase() || 'ME';
    const actualFirst = String(userData?.[0]?.First || '').trim();
    const actualFull = String(
      userData?.[0]?.FullName
      || `${userData?.[0]?.First || ''} ${userData?.[0]?.Last || ''}`.trim()
      || actualEmail
    ).trim();

    if (actualEmail) {
      pushOption(actualEmail, actualFirst || actualInitials, actualFull, actualInitials, true);
    }

    (teamData || [])
      .filter((member) => {
        const email = String(member?.Email || '').trim().toLowerCase();
        const status = String((member as any)?.status || '').trim().toLowerCase();
        return Boolean(email) && email !== 'team@helix-law.com' && status !== 'inactive';
      })
      .sort((a, b) => {
        const aName = String((a as any)?.First || a?.['Full Name'] || a?.Email || '').toLowerCase();
        const bName = String((b as any)?.First || b?.['Full Name'] || b?.Email || '').toLowerCase();
        return aName.localeCompare(bName);
      })
      .forEach((member) => {
        const email = String(member?.Email || '').trim().toLowerCase();
        const initials = String(member?.Initials || '').trim().toUpperCase() || email.split('@')[0]?.slice(0, 2).toUpperCase() || 'TM';
        const first = String((member as any)?.First || '').trim();
        const fullName = String(member?.['Full Name'] || `${(member as any)?.First || ''} ${(member as any)?.Last || ''}`.trim() || member?.Email || '').trim();
        pushOption(email, first || initials, fullName || email, initials, email === actualEmail);
      });

    return options;
  }, [actualEnquiryIdentity.email, actualEnquiryIdentity.initials, canUseDevOwnerMineOverride, teamData, userData]);

  const mineScopeIdentity = useMemo(() => {
    if (!canUseDevOwnerMineOverride || !devOwnerMineOverrideEmail) {
      return actualEnquiryIdentity;
    }

    const overrideMember = (teamData || []).find((member) => String(member?.Email || '').trim().toLowerCase() === devOwnerMineOverrideEmail);
    return {
      email: devOwnerMineOverrideEmail,
      initials: String(overrideMember?.Initials || '').trim().toUpperCase()
        || devOwnerMineOverrideEmail.split('@')[0]?.slice(0, 2).toUpperCase()
        || actualEnquiryIdentity.initials,
    };
  }, [actualEnquiryIdentity, canUseDevOwnerMineOverride, devOwnerMineOverrideEmail, teamData]);

  const devOwnerMineOptionsKey = useMemo(
    () => devOwnerMineOptions.map((option) => `${option.email}:${option.label}`).join('|'),
    [devOwnerMineOptions]
  );
  const selectedAreasKey = useMemo(() => selectedAreas.join('|'), [selectedAreas]);
  const hasAreaFilterAccess = Boolean(userData && userData[0]?.AOW);
  const navigatorRefreshLoading = isRefreshing || isRealtimeQueueSyncing || isLoadingAllData || enquiriesLiveRefreshInFlight;

  const handleSetDevOwnerMineOverride = useCallback((email: string) => {
    const nextEmail = String(email || '').trim().toLowerCase();
    const baseEmail = actualEnquiryIdentity.email;
    setDevOwnerMineOverrideEmail(nextEmail && nextEmail !== baseEmail ? nextEmail : null);
    setSelectedPersonInitials(null);
    setSelectedPocFilter(null);
    setPipelineScrollOffset(0);
  }, [actualEnquiryIdentity.email]);

  useEffect(() => {
    if (!canUseDevOwnerMineOverride && devOwnerMineOverrideEmail) {
      setDevOwnerMineOverrideEmail(null);
    }
  }, [canUseDevOwnerMineOverride, devOwnerMineOverrideEmail]);

  useEffect(() => {
    if (!devOwnerMineOverrideEmail) return;
    const stillExists = devOwnerMineOptions.some((option) => option.email === devOwnerMineOverrideEmail);
    if (!stillExists) {
      setDevOwnerMineOverrideEmail(null);
    }
  }, [devOwnerMineOptions, devOwnerMineOverrideEmail]);

  // Calculate counts for Mine/All scope badges
  const scopeCounts = useMemo(() => {
    // Mine count = enquiries claimed by the current user (where Point_of_Contact matches user email)
    const userEmail = mineScopeIdentity.email;
    const mineCount = userEmail 
      ? allEnquiries.filter(e => {
          const poc = ((e as any).Point_of_Contact || (e as any).poc || '').toLowerCase().trim();
          return poc === userEmail;
        }).length
      : 0;
    const allCount = hasFetchedAllData.current ? teamWideEnquiries.length : null;
    return { mineCount, allCount };
  }, [allEnquiries, mineScopeIdentity.email, teamWideEnquiries.length]);

  // Map for claimer quick lookup
  const claimerMap = useMemo(() => {
    const map: Record<string, any> = {};
    teamData?.forEach(td => { if (td.Email) map[td.Email.toLowerCase()] = td; });
    return map;
  }, [teamData]);

  // Pre-computed POC dropdown options (avoids O(n²) findIndex dedup on every render)
  const pocOptionsMemo = useMemo(() => {
    const currentUserEmail = mineScopeIdentity.email;
    const currentUserInitials = mineScopeIdentity.initials ||
      claimerMap[currentUserEmail]?.Initials ||
      currentUserEmail.split('@')[0]?.slice(0, 2).toUpperCase() || 'ME';
    const seen = new Set<string>();
    const options: { email: string; label: string }[] = [];
    const addIfNew = (email: string, label: string) => {
      if (email && !seen.has(email)) {
        seen.add(email);
        options.push({ email, label });
      }
    };
    addIfNew(currentUserEmail, `Me (${currentUserInitials})`);
    addIfNew('team@helix-law.com', 'Team inbox');
    (teamData || []).forEach(t => {
      if (!t?.Email) return;
      const email = t.Email.toLowerCase();
      const label = `${t["Initials"] || ''} ${(t["Full Name"] || `${t["First"] || ''} ${t["Last"] || ''}`.trim() || t["Email"] || '')}`.trim();
      addIfNew(email, label);
    });
    return { options, currentUserEmail, currentUserInitials };
  }, [claimerMap, mineScopeIdentity.email, mineScopeIdentity.initials, teamData]);

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

  const shareMemberOptions = useMemo(() => {
    return teamMemberOptions.map((member) => {
      const email = String(member.email || member.value || '').toLowerCase();
      const displayName = String(member.text || member.email || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      const initials = String(member.initials || '').trim() || displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
      return {
        email,
        displayName: displayName || email,
        initials: initials || '??',
      };
    });
  }, [teamMemberOptions]);

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
    const targetEnquiry = findEnquiryForMutation(allEnquiries, enquiryId);
    const newOwnerName = selectedOption.text.split(' (')[0];
    
    // Close dropdown immediately for snappy feel
    setReassignmentDropdown(null);
    setIsReassigning(true);
    
    // Show in-progress toast
    showToast('Reassigning enquiry...', 'info', `Moving to ${newOwnerName}`, 0);
    
    try {
      const response = await fetch('/api/enquiries-unified/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildEnquiryMutationPayload(targetEnquiry, {
          Point_of_Contact: selectedEmail,
        }))
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
        
        // Show success toast — SSE broadcast will confirm the patch
        showToast('Enquiry reassigned', 'success', `Now assigned to ${newOwnerName}`);
      } else {
        // Show error toast
        showToast('Reassignment failed', 'error', result.message || 'Please try again', 4000);
      }
    } catch (error) {
      console.error('Error reassigning enquiry:', error);
      // Show error toast
      showToast('Reassignment failed', 'error', error instanceof Error ? error.message : 'Network error - please try again', 4000);
    } finally {
      setIsReassigning(false);
    }
  }, [reassignmentDropdown, teamMemberOptions, allEnquiries]);

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
    
    if (!allEnquiries.length && !teamWideEnquiries.length) {
      debugLog('⚠️ No enquiry dataset loaded yet, clearing display');
      if (lastStableDisplayRef.current.length === 0) {
        setDisplayEnquiries([]);
      }
      return;
    }

    const isAwaitingTeamWideQueue = teamWideEnquiries.length === 0
      && (isLoadingAllData || !hasFetchedAllData.current);
    
    // In All mode, never fall back to the user-filtered prop dataset.
    // Show the real team-wide set when ready, otherwise show the loading state only.
    if (!showMineOnly) {
      if (teamWideEnquiries.length > 0) {
        debugLog('🌐 All mode - showing unified data:', teamWideEnquiries.length);
        lastStableDisplayRef.current = teamWideEnquiries;
        setDisplayEnquiries(teamWideEnquiries);
        return;
      }

      debugLog('⏳ All mode - team-wide dataset pending, holding display');
      if (lastStableDisplayRef.current.length > 0) {
        setDisplayEnquiries(lastStableDisplayRef.current);
      }
      return;
    }

    // Mine + non-Claimed views still depend on the wider team-wide queue.
    // Do not render the claimed-only prop dataset here; it creates an empty/stale gap
    // before the real claimable/triaged rows arrive.
    if (activeState !== 'Claimed' && isAwaitingTeamWideQueue) {
      debugLog('⏳ Mine queue awaiting team-wide dataset, holding display');
      if (lastStableDisplayRef.current.length > 0) {
        setDisplayEnquiries(lastStableDisplayRef.current);
      }
      return;
    }

    // Mine mode continues to use the scoped prop dataset for fastest first render.
    if (allEnquiries.length > 0) {
      debugLog('👤 Mine mode - using user-scoped prop data:', allEnquiries.length);
      lastStableDisplayRef.current = allEnquiries;
      setDisplayEnquiries(allEnquiries);
      return;
    }

    // Backstop: if Mine mode lands before prop data but team-wide is already warm, use it.
    if (teamWideEnquiries.length > 0) {
      debugLog('🌐 All mode - showing unified data:', teamWideEnquiries.length);
      lastStableDisplayRef.current = teamWideEnquiries;
      setDisplayEnquiries(teamWideEnquiries);
      return;
    }

    if (lastStableDisplayRef.current.length === 0) {
      setDisplayEnquiries([]);
    }
  }, [allEnquiries, teamWideEnquiries, showMineOnly, activeState, isLoadingAllData]);

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
      const userEmail = mineScopeIdentity.email;
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
  }, [showMineOnly, activeState, allEnquiries, mineScopeIdentity.email, userManuallyChangedAreas, selectedAreas]);

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

  const toRgba = (color: string, alpha: number): string => {
    if (!color) return `rgba(160, 160, 160, ${alpha})`;
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

    const now = new Date();
    const londonDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayKey = londonDate.format(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateKey = londonDate.format(d);
    const yesterdayKey = londonDate.format(yesterday);

    const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' });
    const hasTime = timePart !== '00:00';

    if (dateKey === todayKey) {
      return { top: hasTime ? `Today ${timePart}` : 'Today', middle: '', bottom: '' };
    }

    if (dateKey === yesterdayKey) {
      return { top: hasTime ? `Yest ${timePart}` : 'Yesterday', middle: '', bottom: '' };
    }

    const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
    return { top: datePart, middle: '', bottom: '' };
  };
  
  // Format day separator label (compact by default, full on hover; include year only if not current)
  const formatDaySeparatorLabel = (dayKey: string, isHovered: boolean): string => {
    if (!dayKey) return '';
    const d = new Date(dayKey + 'T12:00:00'); // Use noon to avoid timezone issues
    if (isNaN(d.getTime())) return dayKey;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const isSameYear = d.getFullYear() === now.getFullYear();
    const isToday = dayOnly.getTime() === today.getTime();
    const isYesterday = dayOnly.getTime() === yesterday.getTime();

    if (isHovered) {
      if (isToday) return 'Today';
      if (isYesterday) return 'Yesterday';
      return isSameYear
        ? format(d, 'EEEE d MMMM')
        : format(d, 'EEEE d MMMM yyyy');
    }

    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';
    return isSameYear ? format(d, 'd MMM') : format(d, 'd MMM yyyy');
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

  // Fetch all enquiries when switching to "All" mode, Claimable, or Triaged
  // Mine+Claimed uses prop data (user's own claimed items are already there)
  useEffect(() => {
    if (isLoadingAllData) return; // Prevent multiple concurrent fetches
    
    // Mine+Claimed: user's claimed items are already in allEnquiries from props.
    // No need to fetch the full team-wide dataset on initial load.
    // The full fetch will fire lazily via the background prefetch below.
    if (showMineOnly && activeState === 'Claimed') {
      debugLog('🔄 Mine+Claimed mode - using prop data, no team-wide fetch needed');
      if (allEnquiries.length > 0) {
        setDisplayEnquiries(allEnquiries);
      }
      return;
    }
    
    if (showMineOnly && activeState !== 'Claimed') {
      // Regular Mine mode (Claimable/Triaged) - needs team-wide data for cross-user filtering
      if (teamWideEnquiries.length > 0) {
        debugLog('🔄 Mine mode (not Claimed) - using existing team-wide dataset:', teamWideEnquiries.length);
        setDisplayEnquiries(teamWideEnquiries);
        return;
      }
      if (!hasFetchedAllData.current) {
        debugLog('🔄 Mine mode needs team-wide data, fetching...');
        triggerFetchAllEnquiries('mode:mine+' + activeState.toLowerCase());
      }
      return;
    }
    
    // All mode - needs full dataset
    if (!showMineOnly && !hasFetchedAllData.current) {
      debugLog('🔄 All mode - fetching complete dataset');
      triggerFetchAllEnquiries('mode:all');
    }
  }, [showMineOnly, activeState, userEmail, triggerFetchAllEnquiries, isAdmin]); // Simplified dependencies

  // Background prefetch: after initial render with prop data, lazily fetch team-wide data
  // so it's ready when user switches to All/Claimable/Triaged views
  useEffect(() => {
    if (!isActive) return;
    if (!showMineOnly || activeState !== 'Claimed') return; // Only for initial Mine+Claimed
    if (hasFetchedAllData.current || isLoadingAllData) return;
    if (allEnquiries.length === 0) return; // Wait for prop data to load first

    const prefetchDelayMs = isLocalDevHost ? 2400 : 700;
    let timerId: number | null = null;
    let idleId: number | null = null;

    const runPrefetch = () => {
      if (document.visibilityState === 'hidden') return;
      if (hasFetchedAllData.current || isLoadingAllData) return;

      debugLog('🔄 Background prefetch: warming team-wide data after initial settle');
      triggerFetchAllEnquiries('background-prefetch');
    };

    timerId = window.setTimeout(() => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleId = (window as typeof window & {
          requestIdleCallback: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
        }).requestIdleCallback(() => {
          runPrefetch();
        }, { timeout: isLocalDevHost ? 1800 : 900 });
        return;
      }

      runPrefetch();
    }, prefetchDelayMs);

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as typeof window & {
          cancelIdleCallback: (id: number) => void;
        }).cancelIdleCallback(idleId);
      }
    };
  }, [allEnquiries.length, showMineOnly, activeState, isLoadingAllData, triggerFetchAllEnquiries, isActive, isLocalDevHost]);

  const [currentSliderStart, setCurrentSliderStart] = useState<number>(0);
  const [currentSliderEnd, setCurrentSliderEnd] = useState<number>(0);

  // Added for infinite scroll
  const [itemsToShow, setItemsToShow] = useState<number>(20);
  const loader = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRafPendingRef = useRef(false);
  const queueRevealTimerRef = useRef<number | null>(null);
  const queueWasPendingRef = useRef(false);
  const [isQueueRevealActive, setIsQueueRevealActive] = useState(false);
  const previousMainTab = useRef<EnquiriesActiveState>('Claimed');
  const previousActiveStateRef = useRef<EnquiriesActiveState>(activeState);
  const [manualFilterTransitioning, setManualFilterTransitioning] = useState(false);
  const manualFilterTransitionTimeoutRef = useRef<number | null>(null);

  const clearQueueRevealTimer = useCallback(() => {
    if (queueRevealTimerRef.current !== null) {
      window.clearTimeout(queueRevealTimerRef.current);
      queueRevealTimerRef.current = null;
    }
  }, []);

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
      let minTs = Infinity;
      let maxTs = -Infinity;
      let validCount = 0;
      for (let i = 0; i < displayEnquiries.length; i++) {
        const raw = displayEnquiries[i].Touchpoint_Date;
        if (typeof raw !== 'string') continue;
        const d = parseISO(raw);
        if (!isValid(d)) continue;
        const ts = d.getTime();
        if (ts < minTs) minTs = ts;
        if (ts > maxTs) maxTs = ts;
        validCount++;
      }
      if (validCount > 0) {
        const oldest = format(new Date(minTs), 'dd MMM yyyy');
        const newest = format(new Date(maxTs), 'dd MMM yyyy');
        setDateRange(prev => {
          if (prev && prev.oldest === oldest && prev.newest === newest) return prev;
          return { oldest, newest };
        });
        setCurrentSliderStart(0);
        setCurrentSliderEnd(validCount - 1);
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
    if (!displayEnquiries || displayEnquiries.length === 0) return [] as NormalizedEnquiry[];

    // Skip deduplication in Claimed view and whenever the user is filtering (search or explicit ID lookups)
    // Search is typically investigative work where each raw record matters.
    if (activeState === 'Claimed' || isIdSearch || hasActiveSearch) {
      return [...displayEnquiries] as NormalizedEnquiry[];
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

    const currentUserEmail = mineScopeIdentity.email;
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
    
    return Array.from(map.values()) as NormalizedEnquiry[];
  }, [displayEnquiries, showMineOnly, mineScopeIdentity.email, activeState]);

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
  // State for initial workbench tab (used when opening from pipeline chips e.g. matter)
  const [workbenchInitialTab, setWorkbenchInitialTab] = useState<string | undefined>(undefined);

  const openEnquiryWorkbench = useCallback((enquiry: Enquiry, tab: 'Pitch' | 'Timeline', options?: { filter?: 'pitch'; workbenchTab?: string }) => {
    setSelectedEnquiry(enquiry);
    setActiveSubTab(tab);
    setTimelineInitialFilter(options?.filter ?? null);
    setWorkbenchInitialTab(options?.workbenchTab);
  }, []);

  const handleSelectEnquiry = useCallback((enquiry: Enquiry) => {
    openEnquiryWorkbench(enquiry, 'Timeline');
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

  // Handle deep link navigation from App.tsx props (replaces localStorage approach)
  useEffect(() => {
    if (!isActive || !pendingEnquiryId) return;
    
    const found = displayEnquiries.find(e => String(e.ID) === pendingEnquiryId);
    if (found) {
      setSelectedEnquiry(found);
      if (pendingEnquirySubTab === 'Pitch') {
        setSelectedPitchScenario(pendingEnquiryPitchScenario || undefined);
        setActiveSubTab('Pitch');
      } else {
        setSelectedPitchScenario(undefined);
        setActiveSubTab('Timeline');
        // Check for timeline item stored by App.tsx handler
        const navTimelineItem = localStorage.getItem('navigateToTimelineItem');
        if (navTimelineItem) {
          localStorage.removeItem('navigateToTimelineItem');
          sessionStorage.setItem('scrollToTimelineItem', navTimelineItem);
        }
      }
      onPendingEnquiryHandled?.();
    }
    }, [isActive, pendingEnquiryId, pendingEnquiryPitchScenario, pendingEnquirySubTab, displayEnquiries, onPendingEnquiryHandled]);

  const ensureDemoEnquiryPresent = useCallback(() => {
    const currentUserEmail = actualEnquiryIdentity.email || 'lz@helix-law.com';
    const alternateDemoOwnerEmail = currentUserEmail.toLowerCase() === 'cb@helix-law.com'
      ? 'lz@helix-law.com'
      : 'cb@helix-law.com';

    try {
      localStorage.setItem(DEMO_MODE_STORAGE_KEY, 'true');
      localStorage.setItem('demoModeEnabled', 'true');
    } catch {
      // ignore storage errors
    }
    setDemoModeEnabledLocal(true);

    const now = new Date();
    const currentTouchpoint = now.toISOString().split('T')[0];
    const priorDate = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
    const priorTouchpoint = priorDate.toISOString().split('T')[0];

    const demoEnquiries: Array<NormalizedEnquiry> = [
      {
        ...DEV_PREVIEW_TEST_ENQUIRY,
        ID: 'DEMO-ENQ-0001',
        Point_of_Contact: currentUserEmail,
        shared_with: demoSharedSimulationById['DEMO-ENQ-0001'] || '',
        Shared_With: demoSharedSimulationById['DEMO-ENQ-0001'] || '',
        Touchpoint_Date: currentTouchpoint,
        Date_Created: currentTouchpoint,
        __sourceType: 'legacy',
      },
      {
        ...DEV_PREVIEW_TEST_ENQUIRY,
        ID: 'DEMO-ENQ-0002',
        First_Name: 'Demo',
        Last_Name: 'Prospect',
        Point_of_Contact: alternateDemoOwnerEmail,
        shared_with: demoSharedSimulationById['DEMO-ENQ-0002'] || '',
        Shared_With: demoSharedSimulationById['DEMO-ENQ-0002'] || '',
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
      {
        ...DEV_PREVIEW_TEST_ENQUIRY,
        ID: 'DEMO-ENQ-0003',
        First_Name: 'Demo',
        Last_Name: 'Complete',
        Point_of_Contact: currentUserEmail,
        shared_with: demoSharedSimulationById['DEMO-ENQ-0003'] || '',
        Shared_With: demoSharedSimulationById['DEMO-ENQ-0003'] || '',
        Touchpoint_Date: priorTouchpoint,
        Date_Created: priorTouchpoint,
        Area_of_Work: 'Employment',
        Type_of_Work: 'Employment Tribunal',
        Method_of_Contact: 'Email',
        Rating: 'Good',
        Value: '50000',
        Ultimate_Source: 'Google Ads',
        Initial_first_call_notes: 'Unfair dismissal claim — fully instructed demo prospect with matter opened, EID passed, risk assessed, and payment received.',
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
      if (!newMap.has('DEMO-ENQ-0003')) {
        newMap.set('DEMO-ENQ-0003', {
          enquiryId: 'DEMO-ENQ-0003',
          teamsData: {
            Id: 99997,
            ActivityId: 'demo-activity-99997',
            ChannelId: 'demo-channel',
            TeamId: 'demo-team',
            EnquiryId: 'DEMO-ENQ-0003',
            LeadName: 'Demo Complete',
            Email: DEV_PREVIEW_TEST_ENQUIRY.Email || '',
            Phone: DEV_PREVIEW_TEST_ENQUIRY.Phone_Number || '',
            CardType: 'enquiry',
            MessageTimestamp: priorDate.toISOString(),
            TeamsMessageId: 'demo-msg-99997',
            CreatedAtMs: priorDate.getTime(),
            Stage: 'Matter Opened',
            Status: 'Closed',
            ClaimedBy: currentUserEmail.split('@')[0].toUpperCase(),
            ClaimedAt: new Date(priorDate.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
            CreatedAt: new Date(priorDate.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            UpdatedAt: priorDate.toISOString(),
            teamsLink: '',
          },
          pitchData: {
            dealId: 99997,
            email: DEV_PREVIEW_TEST_ENQUIRY.Email || '',
            serviceDescription: 'Employment Tribunal',
            amount: 5000,
            status: 'Instructed',
            areaOfWork: 'employment',
            pitchedBy: 'LZ',
            pitchedDate: priorPitchDate.toISOString().split('T')[0],
            pitchedTime: priorPitchDate.toTimeString().split(' ')[0],
            scenarioId: 'after-call-email',
            scenarioDisplay: 'After call (email)',
          }
        });
      }
      return newMap;
    });
  }, [actualEnquiryIdentity.email, demoSharedSimulationById]);

  // Listen for demo mode event (from UserBubble menu)
  useEffect(() => {
    const handleSelectTestEnquiry = () => {
      ensureDemoEnquiryPresent();
      setActiveState('Claimed');

      setDemoOverlay({ visible: true, message: 'Demo mode enabled', details: 'Demo prospects are now pinned to the top of your Claimed list alongside your live items.' });
      setTimeout(() => setDemoOverlay(prev => prev ? { ...prev, visible: false } : null), 2600);
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
      return id === 'DEMO-ENQ-0001' || id === 'DEMO-ENQ-0002' || id === 'DEMO-ENQ-0003';
    });

    const missingInAll = allEnquiries.length > 0 && !hasDemo(allEnquiries);
    const missingInTeamWide = teamWideEnquiries.length > 0 && !hasDemo(teamWideEnquiries);
    const missingInDisplay = displayEnquiries.length > 0 && !hasDemo(displayEnquiries);

    if (missingInAll || missingInTeamWide || missingInDisplay) {
      ensureDemoEnquiryPresent();
    }
  }, [demoModeEnabled, allEnquiries, teamWideEnquiries, displayEnquiries, ensureDemoEnquiryPresent]);

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
      setNextRefreshIn(60); // Reset to 60 seconds
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

  // Auto-refresh timer (60 seconds) - uses ref to avoid interval reset on function recreation
  useEffect(() => {
    // Clear existing intervals
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    // Set up 60-second auto-refresh
    refreshIntervalRef.current = setInterval(() => {
      debugLog('⏰ Auto-refresh timer fired');
      if (handleManualRefreshRef.current) {
        handleManualRefreshRef.current();
      }
    }, 60 * 1000); // 60 seconds

    // Tick every second for smooth countdown display
    countdownIntervalRef.current = setInterval(() => {
      setNextRefreshIn(prev => {
        const newValue = prev - 1;
        if (newValue <= 0) {
          return 60;
        }
        return newValue;
      });
    }, 1000);

    debugLog('🕐 Auto-refresh intervals initialized');

    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []); // Empty deps - only run once on mount


  const handleRate = useCallback((id: string) => {
    setRatingEnquiryId(id);
    setCurrentRating('');
    setIsRateModalOpen(true);
  }, []);

  useEffect(() => {
    const handleWorkbenchRate = (event: Event) => {
      const customEvent = event as CustomEvent<{ enquiryId?: string }>;
      const enquiryId = String(customEvent?.detail?.enquiryId || '').trim();
      if (!enquiryId) return;
      handleRate(enquiryId);
    };

    window.addEventListener('helix:rate-enquiry', handleWorkbenchRate as EventListener);
    return () => {
      window.removeEventListener('helix:rate-enquiry', handleWorkbenchRate as EventListener);
    };
  }, [handleRate]);

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
      const updateEnquiry = (enquiry: NormalizedEnquiry): NormalizedEnquiry => {
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
      const targetEnquiry = findEnquiryForMutation(allEnquiries, enquiryId);
      // Track this update to prevent it from being overwritten by stale prop data
      recentUpdatesRef.current.set(enquiryId, {
        field: 'Area_of_Work',
        value: newArea,
        timestamp: Date.now()
      });

      const response = await fetch('/api/enquiries-unified/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEnquiryMutationPayload(targetEnquiry, { Area_of_Work: newArea })),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Remove from recent updates if failed
        recentUpdatesRef.current.delete(enquiryId);
        throw new Error(`Failed to update enquiry area: ${errorText}`);
      }

      // Update local state - create new array references to trigger re-renders
      const updateEnquiry = (enquiry: NormalizedEnquiry): NormalizedEnquiry => {
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
      showToast('Area updated', 'success', `Enquiry area changed to ${newArea}`);
      
  debugLog('✅ Enquiry area updated successfully:', enquiryId, 'to', newArea);
      
    } catch (error) {
      console.error('Failed to update enquiry area:', error);
      // Show error toast
      showToast('Failed to update area', 'error', error instanceof Error ? error.message : 'Unknown error', 5000);
      throw error;
    }
  }, []);

  const handleSaveEnquiry = useCallback(async (enquiryId: string, updates: Partial<Enquiry>) => {
    try {
      const targetEnquiry = findEnquiryForMutation(allEnquiries, enquiryId);
      const response = await fetch('/api/enquiries-unified/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEnquiryMutationPayload(targetEnquiry, updates as Record<string, unknown>)),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update enquiry: ${errorText}`);
      }

      // Update the local data
      const updateEnquiry = (enquiry: NormalizedEnquiry): NormalizedEnquiry => {
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
      const targetEnquiry = findEnquiryForMutation(allEnquiries, enquiryId);
      // Track this update to prevent it from being overwritten by stale prop data
      recentUpdatesRef.current.set(enquiryId, {
        field: 'Rating',
        value: newRating,
        timestamp: Date.now()
      });

      const response = await fetch('/api/enquiries-unified/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEnquiryMutationPayload(targetEnquiry, { Rating: newRating })),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Remove from recent updates if failed
        recentUpdatesRef.current.delete(enquiryId);
        throw new Error(`Failed to update enquiry rating: ${errorText}`);
      }

      // Update local state - create new array references to trigger re-renders
      const updateEnquiry = (enquiry: NormalizedEnquiry): NormalizedEnquiry => {
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
      showToast('Rating updated', 'success', `Enquiry rated as ${newRating}`);
      
      debugLog('✅ Enquiry rating updated successfully:', enquiryId, 'to', newRating);
      
    } catch (error) {
      console.error('Failed to update enquiry rating:', error);
      // Show error toast
      showToast('Failed to update rating', 'error', error instanceof Error ? error.message : 'Unknown error', 5000);
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
      const targetEnquiry = findEnquiryForMutation(allEnquiries, enquiryId);
      const { enquiryId: processingEnquiryId, source: processingSource } = resolveEnquiryProcessingIdentity(targetEnquiry);
      const deleteUrl = new URL(`/api/enquiries-unified/${encodeURIComponent(enquiryId)}`, window.location.origin);
      if (processingEnquiryId) deleteUrl.searchParams.set('processingEnquiryId', processingEnquiryId);
      if (processingSource) deleteUrl.searchParams.set('processingSource', processingSource);

      const response = await fetch(deleteUrl.toString(), {
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

      const deletedIds = new Set<string>([
        enquiryId,
        String(result?.deletedIds?.legacyId || ''),
        String(result?.deletedIds?.instructionsId || ''),
        String(processingEnquiryId || ''),
      ].filter(Boolean));

      const shouldRemoveEnquiry = (enquiry: Enquiry): boolean => {
        if (deletedIds.has(String(enquiry.ID || '').trim())) return true;
        return Array.from(deletedIds).some((candidateId) => enquiryReferencesId(enquiry, candidateId));
      };

      // Remove from local state immediately for responsive UI
      setAllEnquiries(prevEnquiries => prevEnquiries.filter(e => !shouldRemoveEnquiry(e)));
      setDisplayEnquiries(prevDisplay => prevDisplay.filter(e => !shouldRemoveEnquiry(e)));
      setTeamWideEnquiries(prevTeamWide => prevTeamWide.filter(e => !shouldRemoveEnquiry(e)));

      // Show success toast
      showToast('Enquiry deleted', 'success', `${enquiryName} has been permanently removed`);
      
    } catch (error) {
      console.error('[Enquiries] Failed to delete enquiry:', error);
      // Show error toast
      showToast('Failed to delete enquiry', 'error', error instanceof Error ? error.message : 'Unknown error', 5000);
      throw error;
    }
  }, [allEnquiries]);

  const handleShareEnquiry = useCallback(async (enquiry: Enquiry) => {
    const currentShared = parseSharedWithEmails((enquiry as any).shared_with ?? (enquiry as any).Shared_With ?? '');
    const teamEmailSet = new Set(shareMemberOptions.map((option) => option.email));
    const selected = currentShared.filter((email) => teamEmailSet.has(email));
    const external = currentShared.filter((email) => !teamEmailSet.has(email));
    setShareModalEnquiry(enquiry);
    setShareModalSelectedEmails(selected);
    setShareModalExternalEmails(external);
    setShareModalSearch('');
  }, [shareMemberOptions]);

  const toggleShareMemberEmail = useCallback((email: string) => {
    setShareModalSelectedEmails((prev) => {
      const normalised = String(email || '').toLowerCase();
      if (!normalised) return prev;
      if (prev.includes(normalised)) return prev.filter((entry) => entry !== normalised);
      return [...prev, normalised];
    });
  }, []);

  const removeShareExternalEmail = useCallback((email: string) => {
    const normalised = String(email || '').toLowerCase();
    setShareModalExternalEmails((prev) => prev.filter((entry) => entry !== normalised));
  }, []);

  const submitShareModal = useCallback(async () => {
    if (!shareModalEnquiry) return;
    const enquiry = shareModalEnquiry;
    const enquiryId = String(enquiry.ID || (enquiry as any).id || '').trim();
    if (!enquiryId) return;

    const ownerEmail = String((enquiry as any).Point_of_Contact || (enquiry as any).poc || '').trim().toLowerCase();
    const currentUserEmail = String(userData?.[0]?.Email || '').trim().toLowerCase();
    const requestedSharedEmails = parseSharedWithEmails([
      ...shareModalSelectedEmails,
      ...shareModalExternalEmails,
    ]);
    const nextShared = serialiseSharedWithEmails([...shareModalSelectedEmails, ...shareModalExternalEmails])
      .split(',')
      .filter((email) => email && email !== ownerEmail)
      .join(',');

    setIsShareModalSaving(true);

    try {
      const candidateIds = new Set<string>([
        enquiryId,
        String((enquiry as any).pitchEnquiryId || ''),
      ].filter(Boolean));

      const applySharedUpdate = (record: NormalizedEnquiry): NormalizedEnquiry => {
        if (!candidateIds.has(String(record.ID || (record as any).id || ''))) return record;
        return { ...record, shared_with: nextShared, Shared_With: nextShared };
      };

      if (demoModeEnabled && isDemoEnquiryId(enquiryId)) {
        const counterpartDemoId = enquiryId === 'DEMO-ENQ-0001'
          ? 'DEMO-ENQ-0002'
          : (enquiryId === 'DEMO-ENQ-0002' ? 'DEMO-ENQ-0001' : null);

        const nextDemoSimulation = { ...demoSharedSimulationById };
        if (nextShared) nextDemoSimulation[enquiryId] = nextShared;
        else delete nextDemoSimulation[enquiryId];

        if (counterpartDemoId && currentUserEmail) {
          const counterpartShared = parseSharedWithEmails(nextDemoSimulation[counterpartDemoId] || '');
          const requestedIncludesCurrentUser = requestedSharedEmails.includes(currentUserEmail);

          if (requestedIncludesCurrentUser) {
            const merged = serialiseSharedWithEmails([...counterpartShared, currentUserEmail]);
            if (merged) nextDemoSimulation[counterpartDemoId] = merged;
          } else if (!nextShared) {
            const withoutCurrentUser = counterpartShared.filter((email) => email !== currentUserEmail);
            const serialised = serialiseSharedWithEmails(withoutCurrentUser);
            if (serialised) nextDemoSimulation[counterpartDemoId] = serialised;
            else delete nextDemoSimulation[counterpartDemoId];
          }
        }

        setDemoSharedSimulationById(nextDemoSimulation);

        const demoIdsToRefresh = new Set<string>([
          enquiryId,
          String((enquiry as any).pitchEnquiryId || ''),
          counterpartDemoId || '',
        ].filter(Boolean));

        const applyDemoSharedUpdate = (record: NormalizedEnquiry): NormalizedEnquiry => {
          const recordId = String(record.ID || (record as any).id || '');
          if (!demoIdsToRefresh.has(recordId)) return record;
          const sharedValue = nextDemoSimulation[recordId] || '';
          return { ...record, shared_with: sharedValue, Shared_With: sharedValue };
        };

        setAllEnquiries((prev) => prev.map(applyDemoSharedUpdate));
        setDisplayEnquiries((prev) => prev.map(applyDemoSharedUpdate));
        setTeamWideEnquiries((prev) => prev.map(applyDemoSharedUpdate));

        showToast('Demo sharing simulated', 'success', nextShared
          ? 'Shared demo prospect visible for this session (including counterpart)'
          : 'Demo shared access cleared for this session');
        setShareModalEnquiry(null);
        setShareModalSelectedEmails([]);
        setShareModalExternalEmails([]);
        setShareModalSearch('');
        return;
      }

      const response = await fetch('/api/enquiries-unified/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEnquiryMutationPayload(enquiry, { Shared_With: nextShared })),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const result = await response.json();
      const responseCandidateIds = new Set<string>([
        enquiryId,
        String(result?.updatedIds?.legacyId || ''),
        String(result?.updatedIds?.instructionsId || ''),
        String((enquiry as any).pitchEnquiryId || ''),
      ].filter(Boolean));

      const applyResponseSharedUpdate = (record: NormalizedEnquiry): NormalizedEnquiry => {
        if (!responseCandidateIds.has(String(record.ID || (record as any).id || ''))) return record;
        return { ...record, shared_with: nextShared, Shared_With: nextShared };
      };

      setAllEnquiries((prev) => prev.map(applyResponseSharedUpdate));
      setDisplayEnquiries((prev) => prev.map(applyResponseSharedUpdate));
      setTeamWideEnquiries((prev) => prev.map(applyResponseSharedUpdate));

      showToast('Sharing updated', 'success', nextShared ? `Shared with: ${nextShared}` : 'Removed all shared access');
      setShareModalEnquiry(null);
      setShareModalSelectedEmails([]);
      setShareModalExternalEmails([]);
      setShareModalSearch('');
    } catch (error) {
      showToast('Failed to update sharing', 'error', error instanceof Error ? error.message : 'Unknown error', 5000);
    } finally {
      setIsShareModalSaving(false);
    }
  }, [shareModalEnquiry, shareModalSelectedEmails, shareModalExternalEmails, demoModeEnabled, demoSharedSimulationById, userData]);

  // Handler to filter by person initials
  const handleFilterByPerson = useCallback((initials: string) => {
    setSelectedPersonInitials(prev => prev === initials ? null : initials);
  }, []);

  const filteredEnquiries = useMemo(() => {
    let filtered = dedupedEnquiries; // Use deduped full dataset, not slider range

    const userEmail = mineScopeIdentity.email;

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
          const sharedWith = parseSharedWithEmails((enquiry as any).shared_with ?? (enquiry as any).Shared_With ?? '');
          const isShared = userEmailNorm ? sharedWith.includes(userEmailNorm) : false;
          const matches = userEmailNorm ? (poc === userEmailNorm || isShared) : false;
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
    if (normalizedSearchTerm) {
      const term = normalizedSearchTerm;
      filtered = filtered.filter(enquiry => {
        try {
          const firstName = normalizeSearchValue(enquiry.First_Name);
          const lastName = normalizeSearchValue(enquiry.Last_Name);
          const fullName = normalizeSearchValue(`${enquiry.First_Name || ''} ${enquiry.Last_Name || ''}`);
          const email = normalizeSearchEmailArtifacts(enquiry.Email);
          const company = normalizeSearchValue(enquiry.Company);
          const typeOfWork = normalizeSearchValue(enquiry.Type_of_Work);
          const enquiryId = normalizeSearchValue(enquiry.ID);
          const acid = normalizeSearchValue((enquiry as any).acid ?? (enquiry as any).ACID ?? (enquiry as any).Acid ?? '');
          const phoneDigits = toDigitSearchValue(enquiry.Phone_Number);
          const acidDigits = toDigitSearchValue((enquiry as any).acid ?? (enquiry as any).ACID ?? (enquiry as any).Acid ?? '');

          const searchableValues = [
            firstName,
            lastName,
            fullName,
            email,
            company,
            typeOfWork,
            enquiryId,
            acid,
          ].filter(Boolean);

          if (email && email === term) {
            return true;
          }

          if (numericSearchTerm.length >= 6 && phoneDigits.includes(numericSearchTerm)) {
            return true;
          }

          if (numericSearchTerm.length >= 4 && acidDigits.includes(numericSearchTerm)) {
            return true;
          }

          if (searchTokens.length > 1) {
            return searchTokens.every(token => searchableValues.some(value => value.includes(token)));
          }

          return searchableValues.some(value => value.includes(term));
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
        const matchingPerson = claimerMap[poc];
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
    normalizedSearchTerm,
    searchTokens,
    numericSearchTerm,
    showMineOnly,
    isUnclaimedPoc,
    selectedPersonInitials,
    teamData,
    enrichmentMap, // For Triaged filter and pipeline filters
    triagedDataLoaded, // For Triaged filter - wait until data is loaded
    enquiryPipelineFilters, // For pipeline filtering
    selectedPocFilter, // For POC dropdown filter
    inlineWorkbenchByEnquiryId,
    mineScopeIdentity.email,
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
      return new Map<string, NormalizedEnquiry[]>();
    }

    const map = new Map<string, NormalizedEnquiry[]>();
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

    const getRecordKey = (record: NormalizedEnquiry) => buildEnquiryIdentityKey(record);

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

  const isQueueFetchPending = !showMineOnly
    ? teamWideEnquiries.length === 0 && (isLoadingAllData || !hasFetchedAllData.current)
    : activeState !== 'Claimed' && teamWideEnquiries.length === 0 && (isLoadingAllData || !hasFetchedAllData.current);

  useEffect(() => {
    if (showGroupedView || showUnclaimedBoard) {
      setIsQueueRevealActive(false);
      clearQueueRevealTimer();
      return;
    }

    if (isQueueFetchPending) {
      queueWasPendingRef.current = true;
      setIsQueueRevealActive(false);
      clearQueueRevealTimer();
      return;
    }

    if (!queueWasPendingRef.current || filteredEnquiries.length === 0) {
      return;
    }

    queueWasPendingRef.current = false;
    clearQueueRevealTimer();

    const initialLandingCount = Math.min(filteredEnquiries.length, 36);
    const quickRevealCeiling = Math.min(filteredEnquiries.length, 120);

    setItemsToShow(initialLandingCount);

    if (quickRevealCeiling <= initialLandingCount) {
      setIsQueueRevealActive(false);
      return;
    }

    setIsQueueRevealActive(true);

    const revealNextChunk = () => {
      setItemsToShow((prev) => {
        const increment = prev < 48 ? 24 : 32;
        const next = Math.min(prev + increment, quickRevealCeiling);

        if (next >= quickRevealCeiling) {
          setIsQueueRevealActive(false);
          queueRevealTimerRef.current = null;
        } else {
          queueRevealTimerRef.current = window.setTimeout(revealNextChunk, 28);
        }

        return next;
      });
    };

    queueRevealTimerRef.current = window.setTimeout(revealNextChunk, 18);

    return clearQueueRevealTimer;
  }, [
    activeState,
    clearQueueRevealTimer,
    filteredEnquiries.length,
    isQueueFetchPending,
    showGroupedView,
    showUnclaimedBoard,
    teamWideEnquiries.length,
  ]);

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

  // Pre-compute day separator counts (avoids O(n²) filter inside render .map())
  const dayCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (viewMode !== 'table') return counts;
    const toDayKey = (s: string): string => {
      if (!s) return '';
      const d = new Date(s);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    };
    displayedItems.forEach(item => {
      const dateStr = isGroupedEnquiry(item)
        ? (item as GroupedEnquiry).latestDate
        : ((item as any)?.Touchpoint_Date || (item as any)?.datetime || (item as any)?.claim || (item as any)?.Date_Created || '');
      const key = toDayKey(dateStr);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [displayedItems, viewMode]);

  // ─── New-arrival animation ──────────────────────────────────
  // After each render with updated displayedItems, detect IDs that
  // weren't in the previous set and apply a CSS entrance animation
  // via the DOM.  On the very first render we seed the ref (no animation).
  useEffect(() => {
    const currentIds = new Set<string>();
    for (const item of displayedItems) {
      if (isGroupedEnquiry(item)) {
        // Use the group's clientKey as its identity
        currentIds.add(`group-${item.clientKey}`);
      } else if ((item as any).ID) {
        currentIds.add(String((item as any).ID));
      }
    }

    if (!initialRenderDoneRef.current) {
      // First render — seed the ref, no animation
      prevDisplayedIdsRef.current = currentIds;
      initialRenderDoneRef.current = true;
      return;
    }

    const prev = prevDisplayedIdsRef.current;
    const newIds: string[] = [];
    currentIds.forEach(id => {
      if (!prev.has(id)) newIds.push(id);
    });

    if (newIds.length > 0 && newIds.length <= 12) {
      // Apply animation class to newly-arrived rows via DOM
      // (capped at 12 to avoid mass-animation on filter changes / initial loads)
      for (const id of newIds) {
        const el = document.querySelector(`[data-enquiry-id="${CSS.escape(id)}"]`) as HTMLElement | null;
        if (el) {
          el.classList.add('prospect-row--new-arrival');
          el.addEventListener('animationend', () => {
            el.classList.remove('prospect-row--new-arrival');
          }, { once: true });
        }
      }
      console.info('[Enquiries] new-arrival animation:', newIds.length, 'items');
    }

    prevDisplayedIdsRef.current = currentIds;
  }, [displayedItems]);

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
      const displayedEnquiriesSnapshot = displayedItems.filter((item): item is NormalizedEnquiry => {
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
      
      // Keep first paint responsive: enrich a smaller visible batch, then let later passes fill in.
      const BATCH_LIMIT = showMineOnly
        ? (isLocalhost ? 12 : 6)
        : (isLocalhost ? 24 : 14);
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
          const enrichmentTimeoutMs = isLocalhost ? 10000 : 20000;
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`Enrichment timeout after ${Math.round(enrichmentTimeoutMs / 1000)} seconds`)), enrichmentTimeoutMs)
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
          const isTimeout = error instanceof Error && error.message.includes('Enrichment timeout');
          if (isTimeout) {
            console.warn('[Enquiries] Progressive enrichment timed out; continuing without enrichment for this batch');
          } else {
            console.error('[Enquiries] Progressive enrichment failed:', error);
          }
          
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

    const debounceTime = visibleEnquiryIds.size > 8 ? 120 : 80;
    
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

  // EAGER PRE-FETCH: warm a small first slice after first paint so hover data appears quickly
  // without competing with the initial list render.
  const eagerPrefetchDoneRef = useRef<boolean>(false);
  useEffect(() => {
    // Only run once per data load
    if (eagerPrefetchDoneRef.current || selectedEnquiry || displayedItems.length === 0) return;
    
    const eagerPrefetch = async () => {
      // Warm only the first viewport-sized slice.
      const firstBatch = displayedItems
        .slice(0, showMineOnly ? (isLocalhost ? 16 : 8) : (isLocalhost ? 40 : 24))
        .filter((item): item is NormalizedEnquiry => 
          'ID' in item && Boolean(item.ID) && !enrichmentMap.has(String(item.ID))
        );
      
      if (firstBatch.length === 0) return;
      
      eagerPrefetchDoneRef.current = true;

      const v2Ids = firstBatch
        .filter(e => e.__sourceType === 'new' || (e as any).source === 'instructions')
        .map(e => String(e.ID))
        .filter(Boolean);

      const emails = firstBatch
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
          firstBatch.forEach(e => {
            if (e.Email && e.ID) {
              const pitchData = result.pitchByEmail[e.Email.toLowerCase()];
              if (pitchData) {
                const key = String(e.ID);
                next.set(key, { ...next.get(key) || { enquiryId: key }, pitchData });
              }
            }
            const key = String(e.ID);
            if (!next.has(key)) next.set(key, { enquiryId: key });
          });
          return next;
        });
      } catch (err) {
        console.error('[Eager Prefetch] Batch failed:', err);
      }
    };

    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    let idleId: number | null = null;

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as typeof window & {
        requestIdleCallback: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
      }).requestIdleCallback(() => {
        eagerPrefetch().catch(() => { /* ignore */ });
      }, { timeout: isLocalhost ? 900 : 1800 });
    } else {
      timeoutId = globalThis.setTimeout(() => {
        eagerPrefetch().catch(() => { /* ignore */ });
      }, isLocalhost ? 180 : 600);
    }

    return () => {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as typeof window & {
          cancelIdleCallback: (id: number) => void;
        }).cancelIdleCallback(idleId);
      }
    };
  }, [displayedItems.length > 0, showMineOnly]); // Only trigger when items first appear

  // Reset eager prefetch when filters/view changes significantly
  useEffect(() => {
    eagerPrefetchDoneRef.current = false;
  }, [activeState, showMineOnly, selectedArea, debouncedSearchTerm]);

  // Track visible enquiries using IntersectionObserver (viewport-based enrichment)
  useEffect(() => {
    const observerOptions = {
      root: null, // viewport
      rootMargin: showMineOnly ? '240px' : '480px',
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
  }, [displayedItems.length, handleEnquiryVisibilityChange, showMineOnly]); // Re-observe when items change

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
    // On mobile (≤640px) the root .app-root becomes the scroll container
    // because the bars scroll with content. Pick the first element that scrolls.
    const findScrollRoot = (): HTMLElement | null => {
      if (scrollContainerRef.current) return scrollContainerRef.current;
      const region = document.querySelector('.app-scroll-region') as HTMLElement | null;
      if (region && region.scrollHeight > region.clientHeight) return region;
      const root = document.querySelector('.app-root') as HTMLElement | null;
      if (root && root.scrollHeight > root.clientHeight) return root;
      return region; // fallback to region even if not yet overflowing
    };

    const scrollRoot = findScrollRoot();
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
      setActiveSubTab('Timeline');
      // Show initial batch immediately; requestAnimationFrame loads more
      // without blocking the paint so the tab switch feels instant.
      // Use a fixed ceiling (not filteredLengthRef) because when toggling
      // Mine→All the ref still holds the old (small) count until the async
      // team-wide fetch completes — capping against it would freeze
      // itemsToShow at the Mine count and the scroll-based loader would
      // never fire (no overflow).  slice(0, 60) on a smaller array is safe.
      setItemsToShow(20);
      requestAnimationFrame(() => {
        setItemsToShow(60);
      });
    },
    []
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
        color: darkMode ? 'rgba(160, 160, 160, 0.8)' : 'rgba(107, 107, 107, 0.8)',
      };
    }

    switch (ratingKey) {
      case 'Good':
        return { iconName: 'FavoriteStarFill', color: colours.blue };
      case 'Neutral':
        return {
          iconName: 'CircleRing',
          color: darkMode ? 'rgba(160, 160, 160, 0.9)' : 'rgba(107, 107, 107, 0.9)',
        };
      case 'Poor':
        return { iconName: 'StatusErrorFull', color: colours.cta };
      default:
        return {
          iconName: 'FavoriteStar',
          color: darkMode ? 'rgba(160, 160, 160, 0.8)' : 'rgba(107, 107, 107, 0.8)',
        };
    }
  };

  const getRatingChipMeta = (ratingKey: string | undefined, darkMode: boolean) => {
    const baseBorder = darkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(160, 160, 160, 0.2)';
    const { iconName, color } = getRatingIconAndColor(ratingKey, darkMode);

    if (!ratingKey) {
      return {
        iconName,
        color,
        background: darkMode ? 'rgba(160, 160, 160, 0.08)' : 'rgba(160, 160, 160, 0.06)',
        borderColor: baseBorder,
        hoverBackground: darkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.12)',
        hoverColor: colours.blue,
        hoverBorderColor: colours.blue,
      };
    }

    const background = ratingKey === 'Good'
      ? (darkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.14)')
      : ratingKey === 'Neutral'
        ? (darkMode ? 'rgba(160, 160, 160, 0.2)' : 'rgba(160, 160, 160, 0.14)')
        : (darkMode ? 'rgba(214, 85, 65, 0.2)' : 'rgba(214, 85, 65, 0.14)');

    const hoverBackground = ratingKey === 'Good'
      ? (darkMode ? 'rgba(54, 144, 206, 0.28)' : 'rgba(54, 144, 206, 0.2)')
      : ratingKey === 'Neutral'
        ? (darkMode ? 'rgba(160, 160, 160, 0.28)' : 'rgba(160, 160, 160, 0.2)')
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
            onRequestShareEnquiry={handleShareEnquiry}
            allEnquiries={teamWideEnquiries.length > 0 ? teamWideEnquiries : allEnquiries}
            onSelectEnquiry={handleSelectEnquiryForTimeline}
            onOpenPitchBuilder={(scenarioId) => {
              setSelectedPitchScenario(scenarioId);
              setActiveSubTab('Pitch');
            }}
            inlineWorkbenchItem={getEnquiryWorkbenchItem(enquiry)}
            teamData={teamData}
            enrichmentPitchData={enquiry.ID ? enrichmentMap.get(String(enquiry.ID))?.pitchData : undefined}
            enrichmentTeamsData={enquiry.ID ? enrichmentMap.get(String(enquiry.ID))?.teamsData : undefined}
            initialFilter={timelineInitialFilter ?? undefined}
            initialWorkbenchTab={workbenchInitialTab}
          />
        )}
      </>
    ),
  [activeSubTab, userData, isLocalhost, featureToggles, setActiveSubTab, getEnquiryWorkbenchItem, enrichmentMap, timelineInitialFilter, workbenchInitialTab, workbenchHandlers, allEnquiries, teamWideEnquiries, handleSelectEnquiryForTimeline, teamData]
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
        return colours.greyText;
      default:
        return colours.greyText;
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

  // Ensure the processing cue shows when switching views (All tab OR Mine↔All toggle)
  const previousShowMineOnlyRef = useRef(showMineOnly);
  useEffect(() => {
    const previous = previousActiveStateRef.current;
    const prevMine = previousShowMineOnlyRef.current;
    previousActiveStateRef.current = activeState;
    previousShowMineOnlyRef.current = showMineOnly;

    const tabChanged = activeState === '' && previous !== '';
    const mineAllToggled = showMineOnly !== prevMine;

    if (tabChanged || mineAllToggled) {
      if (manualFilterTransitionTimeoutRef.current) {
        window.clearTimeout(manualFilterTransitionTimeoutRef.current);
      }
      setManualFilterTransitioning(true);
      manualFilterTransitionTimeoutRef.current = window.setTimeout(() => {
        setManualFilterTransitioning(false);
      }, 350);
    }
  }, [activeState, showMineOnly]);

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
        @keyframes badge-breathe {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes badge-settle {
          0% { opacity: 0; transform: scale(0.7); }
          60% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
      `;
      document.head.appendChild(style);
    }

    if (!isActive) {
      // Don't write null — the newly-active tab will overwrite.
      // Writing null here races with the other tab's setContent.
      return;
    }

    // List mode: filter/search bar in Navigator (like Matters list state)
    if (!selectedEnquiry) {
      debugLog('🔄 Setting new FilterBanner content for Enquiries');
      
      setContent(
        <FilterBanner
          dense
          collapsibleSearch
          sticky={false}
          primaryFilter={
            <StatusFilterWithScope
              isDarkMode={isDarkMode}
              activeState={activeState}
              showMineOnly={showMineOnly}
              scopeCounts={scopeCounts}
              isAdmin={isAdmin}
              isBusy={isLoadingAllData || isRealtimeQueueSyncing || manualFilterTransitioning}
              onSetActiveState={handleSetActiveState}
              onSetShowMineOnly={setShowMineOnly}
            />
          }
          secondaryFilter={(
            <div className="enq-filter-secondary-cluster" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', minWidth: 0, overflow: 'hidden' }}>
              {hasAreaFilterAccess && (
                <IconAreaFilter
                  selectedAreas={selectedAreas}
                  availableAreas={ALL_AREAS_OF_WORK}
                  onAreaChange={handleManualAreaChange}
                  ariaLabel="Filter enquiries by area of work"
                  variant="glyph"
                />
              )}
              {canUseDevOwnerMineOverride && devOwnerMineOptions.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: 0,
                    maxWidth: 250,
                    height: 30,
                    padding: '0 8px',
                    border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.2)' : 'rgba(54,144,206,0.18)'}`,
                    background: isDarkMode ? 'rgba(135,243,243,0.06)' : 'rgba(54,144,206,0.04)',
                    color: isDarkMode ? '#d1d5db' : colours.greyText,
                    overflow: 'hidden',
                  }}
                  title="Local Luke-only prospects scope. This changes the Mine view without switching user."
                >
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.accent : colours.highlight, flexShrink: 0 }}>
                    Showing as:
                  </span>
                  <select
                    aria-label="Choose whose claimed prospects to show in Mine"
                    value={devOwnerMineOverrideEmail || actualEnquiryIdentity.email}
                    onChange={(event) => handleSetDevOwnerMineOverride(event.target.value)}
                    style={{
                      minWidth: 0,
                      flex: 1,
                      height: 22,
                      padding: '0 22px 0 8px',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6,23,51,0.08)'}`,
                      borderRadius: 0,
                      outline: 'none',
                      background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.78)',
                      color: isDarkMode ? '#f3f4f6' : colours.darkBlue,
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: 'Raleway, sans-serif',
                      appearance: 'none',
                      cursor: 'pointer',
                    }}
                    title="Choose whose claimed prospects to inspect"
                  >
                    {devOwnerMineOptions.map((option) => (
                      <option key={option.email} value={option.email}>
                        {option.fullLabel}
                      </option>
                    ))}
                  </select>
                  <Icon iconName="ChevronDown" style={{ fontSize: 10, color: isDarkMode ? colours.accent : colours.highlight, marginLeft: -20, pointerEvents: 'none', flexShrink: 0 }} />
                </div>
              )}
            </div>
          )}
          search={{
            value: debouncedSearchTerm,
            onChange: handleSearchChange,
            placeholder: "Name, email, ACID, company",
            debounceMs: 250,
          }}
          searchPlacement="filters"
          middleActions={undefined}
          rightActions={
            <>
              {isLocalhost && (
                <button
                  type="button"
                  className="enq-add-contact-btn"
                  title="Search people across all records"
                  aria-label="Search people"
                  onClick={() => setIsPeopleSearchOpen(true)}
                >
                  <Icon iconName="Search" style={{ fontSize: 14 }} />
                  <span className="enq-add-contact-label">Find Person</span>
                </button>
              )}
              <button
                type="button"
                className="enq-add-contact-btn"
                title="Add new contact/enquiry"
                aria-label="Add new contact"
                onClick={() => setIsCreateContactModalOpen(true)}
              >
                <Icon iconName="AddFriend" style={{ fontSize: 14 }} />
                <span className="enq-add-contact-label">Add Contact</span>
              </button>
            </>
          }
          refresh={{
            onRefresh: handleManualRefresh,
            isLoading: navigatorRefreshLoading,
            progressPercentage: Math.round((nextRefreshIn / 60) * 100),
            countdownLabel: `0:${nextRefreshIn < 10 ? '0' : ''}${nextRefreshIn}`,
          }}
        >
          {selectedPersonInitials && (
            <div
              className="enq-person-tag"
              style={{
                border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.3)' : colours.highlight + '40'}`,
                background: isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.08)',
                color: isDarkMode ? colours.accent : colours.highlight,
              }}
            >
              <Icon iconName="Contact" style={{ fontSize: 14 }} />
              <span>{selectedPersonInitials}</span>
              <button
                onClick={() => setSelectedPersonInitials(null)}
                title="Clear person filter"
                className="enq-person-close"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16, border: 'none', background: 'transparent',
                  padding: 0, color: colours.highlight, cursor: 'pointer',
                }}
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
        <NavigatorDetailBar
          onBack={handleBackToList}
          backLabel="Back"
          tabs={[
            { key: 'Timeline', label: 'Overview' },
            { key: 'Pitch', label: 'Pitch Builder' },
          ]}
          activeTab={activeSubTab}
          onTabChange={(key) => setActiveSubTab(key as 'Timeline' | 'Pitch')}
        />,
      );
    }
  }, [
    setContent,
    isDarkMode,
    selectedEnquiry,
    activeState,
    selectedAreasKey,
    scopeCounts.mineCount,
    scopeCounts.allCount,
    debouncedSearchTerm,
    hasAreaFilterAccess,
    isAdmin,
    showMineOnly,
    activeSubTab,
    handleBackToList,
    handleSetActiveState,
    handleManualAreaChange,
    isLocalhost,
    navigatorRefreshLoading,
    handleManualRefresh,
    nextRefreshIn,
    manualFilterTransitioning,
    selectedPersonInitials,
    devOwnerMineOverrideEmail,
    canUseDevOwnerMineOverride,
    devOwnerMineOptionsKey,
    actualEnquiryIdentity.email,
    handleSetDevOwnerMineOverride,
    isActive,
  ]);

  useEffect(() => () => {
    setContent(null);
  }, [setContent]);

  // ─── Prop bundles for <ProspectTableRow /> ──────────────────
  const rowPipelineHandlers: RowPipelineHandlers = useMemo(() => ({
    showPipelineHover,
    movePipelineHover,
    hidePipelineHover,
    openEnquiryWorkbench,
    advancePipelineScroll,
    getPipelineScrollOffset,
    handleReassignClick,
    renderClaimPromptChip,
    getAreaSpecificChannelUrl,
    getScenarioColor,
  }), [showPipelineHover, movePipelineHover, hidePipelineHover, openEnquiryWorkbench, advancePipelineScroll, getPipelineScrollOffset, handleReassignClick, renderClaimPromptChip, getAreaSpecificChannelUrl, getScenarioColor]);
  const rowActionHandlers: RowActionHandlers = useMemo(() => ({
    handleSelectEnquiry,
    handleRate,
    handleDeleteEnquiry,
    handleShareEnquiry,
    handleCopyName,
    setEditingEnquiry,
    setShowEditModal,
    setExpandedNotesInTable,
  }), [handleSelectEnquiry, handleRate, handleDeleteEnquiry, handleShareEnquiry, handleCopyName, setEditingEnquiry, setShowEditModal, setExpandedNotesInTable]);
  const rowDisplayState: RowDisplayState = useMemo(() => ({
    isDarkMode,
    activeState,
    viewMode,
    areActionsEnabled,
    copiedNameKey,
    expandedNotesInTable: expandedNotesInTable,
    hoveredRowKey,
    hoveredDayKey,
    hoveredRowKeyReady,
    hoveredDayKeyReady,
    pipelineNeedsCarousel,
    visiblePipelineChipCount,
    PIPELINE_CHIP_MIN_WIDTH_PX,
    collapsedDays,
    currentUserEmail: userEmail,
  }), [isDarkMode, activeState, viewMode, areActionsEnabled, copiedNameKey, expandedNotesInTable, hoveredRowKey, hoveredDayKey, hoveredRowKeyReady, hoveredDayKeyReady, pipelineNeedsCarousel, visiblePipelineChipCount, PIPELINE_CHIP_MIN_WIDTH_PX, collapsedDays, userEmail]);
  const rowHoverHandlers: RowHoverHandlers = {
    setHoveredRowKey,
    setHoveredDayKey,
    toggleDayCollapse,
  };
  const rowDataDeps: RowDataDeps = useMemo(() => ({
    claimerMap,
    enrichmentMap,
    getEnquiryWorkbenchItem,
    isUnclaimedPoc,
    getRatingChipMeta,
    combineDateAndTime,
  }), [claimerMap, enrichmentMap, getEnquiryWorkbenchItem, isUnclaimedPoc, getRatingChipMeta, combineDateAndTime]);

  const shouldShowBlockingProspectsOverlay = enquiries === null;
  const isAwaitingQueueDataset = (
    !showMineOnly || activeState !== 'Claimed'
  )
    && teamWideEnquiries.length === 0
    && (isLoadingAllData || !hasFetchedAllData.current);
  const hasActiveUserFilters = enquiryPipelineFilters.size > 0
    || Boolean(selectedPocFilter)
    || Boolean(debouncedSearchTerm)
    || Boolean(selectedPersonInitials)
    || Boolean(devOwnerMineOverrideEmail)
    || (selectedAreas.length > 0 && userManuallyChangedAreas);
  const prospectsLoadingLabel = enquiries === null
    ? 'Loading prospects…'
    : isRealtimeQueueSyncing
      ? 'Applying latest updates…'
      : isAwaitingQueueDataset
        ? (showMineOnly && activeState !== 'Claimed' ? 'Preparing your queue…' : 'Loading all prospects…')
        : isLoadingAllData
          ? 'Loading all prospects…'
          : 'Updating view...';

  const renderQueueLoadingSkeleton = (variant: 'blocking' | 'inline') => {
    const rowCount = variant === 'blocking' ? 8 : 6;
    const skeletonBase = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(6,23,51,0.04)';
    const skeletonStrong = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(6,23,51,0.08)';
    const shimmerTone = isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(6,23,51,0.06)';
    const lineColor = isDarkMode ? 'rgba(135,243,243,0.25)' : 'rgba(54,144,206,0.18)';
    const rowBorderColor = isDarkMode ? 'rgba(75, 85, 99, 0.18)' : 'rgba(0, 0, 0, 0.05)';
    // Match the real grid: Timeline | Date | ID/Value | Contact | Pipeline | Actions
    const skeletonGridColumns = `clamp(16px, 3vw, 28px) minmax(clamp(28px, 5vw, 64px), 0.5fr) minmax(clamp(56px, 9vw, 112px), 0.95fr) minmax(clamp(50px, 10vw, 160px), 1.3fr) minmax(clamp(60px, 15vw, 260px), 3.1fr) clamp(32px, 4vw, 56px)`;

    const sBlock = (w: number | string, h: number, delay: number, strong?: boolean): React.CSSProperties => ({
      width: w,
      height: h,
      background: `linear-gradient(90deg, ${strong ? skeletonStrong : skeletonBase} 0%, ${shimmerTone} 50%, ${strong ? skeletonStrong : skeletonBase} 100%)`,
      backgroundSize: '220% 100%',
      animation: `enq-skeleton-breathe 2.4s ease-in-out infinite`,
      animationDelay: `${delay}s`,
    });

    // Vary widths per row so skeletons look organic, not stamped
    const nameWidths = ['72%', '58%', '65%', '80%', '52%', '70%', '62%', '48%'];
    const idWidths = [48, 42, 52, 38, 46, 50, 40, 44];
    const chipCounts = [3, 2, 4, 2, 3, 1, 3, 2];

    return (
      <div style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: variant === 'blocking' ? '0 16px' : '0',
      }}>
        {/* Skeleton header — mirrors the real sticky header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: skeletonGridColumns,
          gap: 8,
          padding: '0 16px',
          height: 44,
          alignItems: 'center',
          background: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
          borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
        }}>
          <div style={sBlock(12, 12, 0)} />
          <div style={sBlock(32, 8, 0.05)} />
          <div style={sBlock(28, 8, 0.1)} />
          <div style={sBlock(44, 8, 0.15)} />
          <div style={sBlock(48, 8, 0.2)} />
          <div />
        </div>

        {/* Skeleton rows — same grid, padding, height as real prospect-row */}
        {Array.from({ length: rowCount }, (_, idx) => {
          const isLastInGroup = idx === 2 || idx === 5;
          const rowDelay = idx * 0.06;
          return (
            <div
              key={`${variant}-skel-${idx}`}
              style={{
                display: 'grid',
                gridTemplateColumns: skeletonGridColumns,
                gap: 'clamp(4px, 0.8vw, 8px)',
                padding: 'clamp(6px, 0.8vw, 8px) clamp(8px, 1.2vw, 14px)',
                alignItems: 'center',
                borderBottom: isLastInGroup
                  ? `1px solid ${isDarkMode ? 'rgba(75,85,99,0.35)' : 'rgba(0,0,0,0.09)'}`
                  : `0.5px solid ${rowBorderColor}`,
                opacity: Math.max(0.4, 1 - idx * 0.08),
                animation: 'fadeIn 0.2s ease both',
                animationDelay: `${rowDelay}s`,
              }}
            >
              {/* Col 1: Timeline line */}
              <div style={{ display: 'flex', justifyContent: 'center', height: '100%', minHeight: 36 }}>
                <div style={{ width: 1, height: '100%', background: lineColor, opacity: 0.7 + (idx % 3) * 0.1 }} />
              </div>

              {/* Col 2: Date (stacked day + time) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center' }}>
                <div style={sBlock(idx % 2 === 0 ? 28 : 24, 11, rowDelay + 0.04, true)} />
                <div style={sBlock(idx % 2 === 0 ? 32 : 26, 9, rowDelay + 0.08)} />
              </div>

              {/* Col 3: ID + AoW icon */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ ...sBlock(14, 14, rowDelay + 0.06), borderRadius: '50%' }} />
                <div style={sBlock(idWidths[idx % idWidths.length], 10, rowDelay + 0.1)} />
              </div>

              {/* Col 4: Contact name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <div style={sBlock(nameWidths[idx % nameWidths.length], 13, rowDelay + 0.12, true)} />
                {idx % 3 === 0 && <div style={sBlock('40%', 9, rowDelay + 0.16)} />}
              </div>

              {/* Col 5: Pipeline chips */}
              <div style={{ display: 'flex', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                {Array.from({ length: chipCounts[idx % chipCounts.length] }, (_, ci) => (
                  <div key={ci} style={sBlock(ci === 0 ? 52 : 34, 18, rowDelay + 0.14 + ci * 0.04)} />
                ))}
              </div>

              {/* Col 6: Actions placeholder */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={sBlock(20, 20, rowDelay + 0.2)} />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Toast Notification - Using OperationStatusToast for real-time feedback */}
      <OperationStatusToast
        visible={toast?.visible ?? false}
        message={toast?.message || ''}
        details={toast?.details || ''}
        type={toast?.type || 'success'}
        icon={toast?.type === 'success' ? 'CheckMark' : undefined}
      />

      {/* SSE disconnect indicator */}
      {!sseConnected && (
        <div style={{
          position: 'absolute',
          top: 8,
          right: 12,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 999,
          fontSize: 11,
          fontFamily: 'Raleway, sans-serif',
          fontWeight: 600,
          letterSpacing: '0.3px',
          color: isDarkMode ? colours.orange : '#6B6B6B',
          background: isDarkMode ? 'rgba(255,140,0,0.10)' : 'rgba(255,140,0,0.08)',
          border: `1px solid ${isDarkMode ? 'rgba(255,140,0,0.25)' : 'rgba(255,140,0,0.20)'}`,
          pointerEvents: 'none',
          animation: 'sse-reconnect-pulse 2s ease-in-out infinite',
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: colours.orange,
            display: 'inline-block',
          }} />
          Reconnecting…
        </div>
      )}

      {demoOverlay?.visible && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isDarkMode ? 'rgba(0, 3, 25, 0.6)' : 'rgba(255, 255, 255, 0.45)',
          backdropFilter: 'blur(2px)',
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
            borderRadius: 0,
            background: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
            boxShadow: isDarkMode ? '0 4px 20px rgba(0, 0, 0, 0.5)' : '0 4px 20px rgba(0, 0, 0, 0.12)',
            border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(0, 0, 0, 0.08)'}`,
            maxWidth: 420,
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: isDarkMode ? colours.dark.text : colours.darkBlue,
              fontFamily: 'Raleway, sans-serif',
            }}>
              {demoOverlay.message}
            </div>
            {demoOverlay.details && (
              <div style={{
                fontSize: 11,
                color: isDarkMode ? colours.subtleGrey : colours.greyText,
                fontFamily: 'Raleway, sans-serif',
              }}>
                {demoOverlay.details}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Blocking overlay for first load — subtle backdrop with in-place skeletons */}
      {shouldShowBlockingProspectsOverlay && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isDarkMode ? 'rgba(0, 3, 25, 0.45)' : 'rgba(255, 255, 255, 0.35)',
          backdropFilter: 'blur(1px)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          paddingTop: 120,
          pointerEvents: 'none',
        }}>
          <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto' }}>
            {renderQueueLoadingSkeleton('blocking')}
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





      <div
        key={activeState}
        className={mergeStyles({
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '0px',
          paddingBottom: 0,
          backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
        })}
      >
        {selectedEnquiry ? (
          <div
            key={`detail-${selectedEnquiry.ID}`}
            style={{
              animation: 'prospect-detail-enter 0.2s ease-out both',
            }}
          >
            {renderDetailView(selectedEnquiry)}
          </div>
        ) : (
          <>
                  {/* Show loading state for triaged enquiries when data is being fetched */}
                  {activeState === 'Triaged' && !triagedDataLoaded ? (
                    <LoadingState
                      message="Preparing your triage queue"
                      subMessage="Getting everything ready — this will only take a moment."
                      size="md"
                      icon={
                        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3Z" />
                        </svg>
                      }
                    />
                  ) : isAwaitingQueueDataset ? (
                    renderQueueLoadingSkeleton('inline')
                  ) : filteredEnquiries.length === 0 && (enquiriesLiveRefreshInFlight || enquiriesUsingSnapshot) && !hasActiveUserFilters ? (
                    /* Still awaiting first live data — show skeleton, not empty state */
                    renderQueueLoadingSkeleton('inline')
                  ) :filteredEnquiries.length === 0 ? (
                    <EmptyState
                      title={
                        hasActiveUserFilters
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
                        hasActiveUserFilters
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
                        hasActiveUserFilters
                          ? 'filter'
                          : activeState === 'Triaged' ? 'filter' : 'search'
                      }
                      size="md"
                      action={
                        hasActiveUserFilters
                          ? {
                              label: 'Clear All Filters',
                              onClick: () => {
                                setEnquiryPipelineFilters(new Map());
                                setSelectedPocFilter(null);
                                if (searchTimeoutRef.current) {
                                  clearTimeout(searchTimeoutRef.current);
                                }
                                setDebouncedSearchTerm('');
                                setSelectedAreas([]);
                                setSelectedPersonInitials(null);
                                setDevOwnerMineOverrideEmail(null);
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
                {/* pipeline-cascade + pipeline-action-pulse keyframes moved to pipelineCarouselStyle (globally injected) */}

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
                {/* Table View */}
                  <div 
                    ref={scrollContainerRef}
                    className="prospect-table-scroll"
                    style={{
                      backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
                      overflowY: 'auto',
                      overflowX: 'auto',
                      fontFamily: 'Raleway, "Segoe UI", sans-serif',
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1,
                      minHeight: 0,
                      transition: 'opacity 180ms ease, transform 180ms ease',
                      opacity: manualFilterTransitioning ? 0.88 : 1,
                      transform: manualFilterTransitioning ? 'translateY(2px)' : 'translateY(0)',
                    }}
                  >
                    <div 
                      className="prospect-table-header"
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        display: 'grid',
                        gridTemplateColumns: TABLE_GRID_TEMPLATE_COLUMNS,
                        gap: `${TABLE_GRID_GAP_PX}px`,
                        padding: '0 14px',
                        height: 44,
                        boxSizing: 'border-box',
                        alignItems: 'center',
                        flexShrink: 0,
                        background: isDarkMode 
                          ? colours.darkBlue
                          : colours.light.cardBackground,
                        backdropFilter: 'blur(12px)',
                        borderTop: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'}`,
                        fontFamily: 'Raleway, "Segoe UI", sans-serif',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: headerTextColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        boxShadow: isDarkMode 
                          ? '0 2px 8px rgba(0, 0, 0, 0.3)'
                          : '0 2px 8px rgba(0, 0, 0, 0.08)',
                      }}
                    >
                      {/* Timeline header cell — matches the 1px vertical line in rows */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title="Timeline"
                      >
                        <div style={{
                          width: 1,
                          height: 14,
                          background: isDarkMode ? colours.accent : colours.highlight,
                          opacity: 0.45,
                          borderRadius: 0,
                        }} />
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
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          paddingInline: 2,
                          transition: 'color 0.15s ease',
                          color: sortColumn === 'date' 
                            ? (isDarkMode ? colours.highlight : colours.highlight)
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
                              opacity: sortColumn === 'date' ? 1 : 0.35,
                              color: sortColumn === 'date' 
                                ? (isDarkMode ? colours.highlight : colours.highlight)
                                : (isDarkMode ? `${colours.subtleGrey}80` : `${colours.greyText}80`),
                              transition: 'opacity 0.15s ease',
                            },
                          }}
                        />
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
                          gap: 6,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'color 0.15s ease',
                          paddingInline: 2,
                          color: sortColumn === 'id' 
                            ? (isDarkMode ? colours.highlight : colours.highlight)
                            : undefined,
                        }}
                        title="Sort by ID"
                      >
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 17,
                          minWidth: 17,
                          flexShrink: 0,
                          fontSize: 11,
                          fontWeight: 600,
                          color: isDarkMode ? colours.accent : colours.highlight,
                          opacity: 0.5,
                          lineHeight: 1,
                        }}>#</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          ID
                          <Icon 
                            iconName={sortColumn === 'id' ? (sortDirection === 'asc' ? 'ChevronUpSmall' : 'ChevronDownSmall') : 'ChevronDownSmall'} 
                            styles={{ 
                              root: { 
                                fontSize: 8,
                                opacity: sortColumn === 'id' ? 1 : 0.35,
                                color: sortColumn === 'id' 
                                  ? (isDarkMode ? colours.highlight : colours.highlight)
                                  : (isDarkMode ? `${colours.subtleGrey}80` : `${colours.greyText}80`),
                                transition: 'opacity 0.15s ease',
                              },
                            }}
                          />
                        </span>
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
                          gap: 6,
                          paddingInline: 2,
                          transition: 'color 0.15s ease',
                          color: sortColumn === 'contact' 
                            ? (isDarkMode ? colours.highlight : colours.highlight)
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
                              opacity: sortColumn === 'contact' ? 1 : 0.35,
                              color: sortColumn === 'contact' 
                                ? (isDarkMode ? colours.highlight : colours.highlight)
                                : (isDarkMode ? `${colours.subtleGrey}80` : `${colours.greyText}80`),
                              transition: 'opacity 0.15s ease',
                            },
                          }}
                        />
                      </div>
                      {/* Pipeline header + filter buttons */}
                      {(() => {
                        const headerOffset = getPipelineScrollOffset('__header__');
                        const headerVisibleEnd = headerOffset + visiblePipelineChipCount;
                        const headerHasMore = pipelineNeedsCarousel && headerOffset < 7 - visiblePipelineChipCount;

                        return (
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
                              gridTemplateColumns: `repeat(${pipelineNeedsCarousel ? visiblePipelineChipCount : 7}, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr))`,
                              columnGap: 8,
                              width: '100%',
                              height: '100%',
                              minWidth: 0,
                              alignItems: 'center',
                              paddingRight: pipelineNeedsCarousel || enquiryPipelineFilters.size > 0 || selectedPocFilter ? 32 : 0,
                              boxSizing: 'border-box',
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
                                // In Unclaimed view, show "POC" label matching other plain headers
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 3,
                                  height: 22,
                                  width: '100%',
                                  padding: '0 4px',
                                  background: 'transparent',
                                  border: 'none',
                                  borderRadius: 0,
                                  overflow: 'hidden',
                                  minWidth: 0,
                                }}>
                                        <span style={{ 
                                          fontSize: 10, 
                                          fontWeight: 500, 
                                          color: headerTextColor, 
                                          textTransform: 'uppercase',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                        }}>
                                          {pipelineChipLabelMode === 'icon' ? 'POC' : 'CLAIMER'}
                                        </span>
                                        <Icon iconName="ChevronDown" styles={{ root: { fontSize: 8, color: headerTextColor, opacity: 0.5, flexShrink: 0 } }} />
                                </div>
                              ) : (
                              (() => {
                                const { currentUserEmail, currentUserInitials } = pocOptionsMemo;
                                const isFiltered = !!selectedPocFilter;
                                const isFilteredToMe = selectedPocFilter?.toLowerCase() === currentUserEmail;

                                const getFilteredInitials = () => {
                                  if (!selectedPocFilter) return 'POC';
                                  if (selectedPocFilter.toLowerCase() === currentUserEmail) return currentUserInitials;
                                  const teamMember = claimerMap[selectedPocFilter.toLowerCase()];
                                  return teamMember?.Initials || selectedPocFilter.split('@')[0]?.slice(0, 2).toUpperCase() || 'POC';
                                };

                                const filterColor = isFiltered ? colours.highlight : headerTextColor;

                                if (!showMineOnly) {
                                  const pocOptions = pocOptionsMemo.options;

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
                                          gap: 2,
                                          height: 22,
                                          width: '100%',
                                          padding: '0 4px',
                                          background: isFiltered
                                            ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                            : 'transparent',
                                          border: isFiltered
                                            ? `1px solid ${colours.highlight}40`
                                            : 'none',
                                          borderRadius: 0,
                                          cursor: 'pointer',
                                          transition: 'all 150ms ease',
                                          opacity: isFiltered ? 1 : 0.85,
                                          overflow: 'hidden',
                                          minWidth: 0,
                                        }}
                                      >
                                        <span style={{ fontSize: 10, fontWeight: 500, color: filterColor, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                                {pipelineChipLabelMode === 'icon' ? 'POC' : 'CLAIMER'}
                                              </span>
                                        <Icon iconName="ChevronDown" styles={{ root: { fontSize: 8, color: filterColor, flexShrink: 0 } }} />
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
                                            background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                                            border: `1px solid ${isDarkMode ? `${colours.subtleGrey}33` : `${colours.subtleGrey}4d`}`,
                                            borderRadius: 0,
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
                                              borderBottom: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(160, 160, 160, 0.15)'}`,
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
                                    : headerTextColor;

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
                                        gap: 2,
                                        height: 22,
                                        width: '100%',
                                        padding: '0 4px',
                                        background: mineIsFiltered
                                          ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                          : 'transparent',
                                        border: mineIsFiltered
                                          ? `1px solid ${colours.highlight}40`
                                          : 'none',
                                        borderRadius: 0,
                                        cursor: 'pointer',
                                        transition: 'all 150ms ease',
                                        opacity: mineIsFiltered ? 1 : 0.85,
                                        overflow: 'hidden',
                                        minWidth: 0,
                                      }}
                                    >
                                      <span style={{ fontSize: 10, fontWeight: 500, color: mineFilterColor, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                        {pipelineChipLabelMode === 'icon' ? 'POC' : 'CLAIMER'}
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
                                if (!filterState) return headerTextColor;
                                if (filterState === 'yes') return colours.green;
                                if (filterState === 'no') return colours.cta;
                                return colours.highlight;
                              };
                              const filterColor = getFilterColor();
                              const stateLabel = filterState === 'yes' ? 'Has pitch' : filterState === 'no' ? 'No pitch' : null;
                              const nextState = !filterState ? 'has' : filterState === 'yes' ? 'missing' : 'clear filter';

                              return (
                                <button
                                  type="button"
                                  title={hasFilter
                                    ? `Showing: ${stateLabel} · Click → ${nextState}`
                                    : `Filter by Pitch · Click to toggle`}
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
                                    width: '100%',
                                    padding: '0 4px',
                                    background: hasFilter
                                      ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                      : 'transparent',
                                    border: hasFilter
                                      ? `1px solid ${filterColor}40`
                                      : 'none',
                                    borderRadius: 0,
                                    cursor: 'pointer',
                                    transition: 'all 150ms ease',
                                    opacity: hasFilter ? 1 : 0.85,
                                    overflow: 'hidden',
                                    minWidth: 0,
                                  }}
                                >
                                    <span style={{ fontSize: 10, fontWeight: 500, color: filterColor, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>PITCH</span>
                                  {hasFilter && (
                                    <span style={{
                                      width: 6, height: 6, borderRadius: '50%',
                                      background: filterColor,
                                      flexShrink: 0,
                                      boxShadow: `0 0 4px ${filterColor}80`,
                                    }} />
                                  )}
                                </button>
                              );
                            })()
                            )}

                            {/* Inst / ID / Pay / Risk / Matter - chip indices 2-6 - tri-state toggles */}
                            {([
                              { stage: 'instructed' as const, label: 'INSTR', fullLabel: 'INSTRUCTION', icon: 'CheckMark', textIcon: null, chipIndex: 2 },
                              { stage: 'idcheck' as const, label: 'EID', fullLabel: 'EID CHECK', icon: 'ContactCard', textIcon: null, chipIndex: 3 },
                              { stage: 'paid' as const, label: 'PAY', fullLabel: 'PAYMENT', icon: null, textIcon: '£', chipIndex: 4 },
                              { stage: 'risk' as const, label: 'RISK', fullLabel: 'RISK', icon: 'Shield', textIcon: null, chipIndex: 5 },
                              { stage: 'matter' as const, label: 'MATTER', fullLabel: 'MATTER', icon: 'OpenFolderHorizontal', textIcon: null, chipIndex: 6 },
                            ] as const).filter(({ chipIndex }) => headerIsVisible(chipIndex)).map(({ stage, label, fullLabel, icon, textIcon }) => {
                              const filterState = getEnquiryStageFilterState(stage);
                              const hasFilter = filterState !== null;
                              const filterColor = !filterState
                                ? headerTextColor
                                : (filterState === 'yes' ? colours.green : colours.cta);
                              const stateLabel = filterState === 'yes' ? `Has ${label.toLowerCase()}` : filterState === 'no' ? `No ${label.toLowerCase()}` : null;
                              const nextState = !filterState ? 'has' : filterState === 'yes' ? 'missing' : 'clear filter';

                              const headerDisplayLabel = pipelineChipLabelMode === 'icon' ? label : fullLabel;

                              return (
                                <button
                                  key={stage}
                                  type="button"
                                  title={hasFilter
                                    ? `Showing: ${stateLabel} · Click → ${nextState}`
                                    : `Filter by ${label} · Click to toggle`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cycleEnquiryPipelineFilter(stage);
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 3,
                                    height: 22,
                                    width: '100%',
                                    padding: '0 4px',
                                    background: hasFilter
                                      ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                      : 'transparent',
                                    border: hasFilter
                                      ? `1px solid ${filterColor}40`
                                      : 'none',
                                    borderRadius: 0,
                                    cursor: 'pointer',
                                    transition: 'all 150ms ease',
                                    opacity: hasFilter ? 1 : 0.85,
                                    overflow: 'hidden',
                                    minWidth: 0,
                                  }}
                                >
                                  <span style={{ fontSize: 10, fontWeight: 500, color: filterColor, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {headerDisplayLabel}
                                  </span>
                                  {hasFilter && (
                                    <span style={{
                                      width: 6, height: 6, borderRadius: '50%',
                                      background: filterColor,
                                      flexShrink: 0,
                                      boxShadow: `0 0 4px ${filterColor}80`,
                                    }} />
                                  )}
                                </button>
                              );
                            })}

                                </>
                              );
                            })()}
                          </div>
                          {pipelineNeedsCarousel ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                advancePipelineScroll('__header__', 7, visiblePipelineChipCount);
                              }}
                              title={headerHasMore ? `View more stages (${7 - headerVisibleEnd} hidden)` : 'Back to start'}
                              style={{
                                position: 'absolute',
                                top: '50%',
                                right: 0,
                                transform: 'translateY(-50%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 24,
                                height: 22,
                                padding: 0,
                                border: `1px solid ${isDarkMode ? `${colours.subtleGrey}40` : `${colours.greyText}33`}`,
                                borderRadius: 0,
                                background: headerHasMore
                                  ? (isDarkMode ? `${colours.highlight}1f` : `${colours.highlight}14`)
                                  : (isDarkMode ? `${colours.subtleGrey}0f` : `${colours.subtleGrey}0a`),
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                color: headerHasMore
                                  ? colours.blue
                                  : (isDarkMode ? `${colours.subtleGrey}80` : `${colours.greyText}66`),
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
                          ) : (enquiryPipelineFilters.size > 0 || selectedPocFilter) ? (
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
                                position: 'absolute',
                                top: '50%',
                                right: 0,
                                transform: 'translateY(-50%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 18,
                                height: 18,
                                background: isDarkMode ? `${colours.cta}26` : `${colours.cta}1a`,
                                border: `1px solid ${isDarkMode ? `${colours.cta}66` : `${colours.cta}4d`}`,
                                borderRadius: '50%',
                                cursor: 'pointer',
                                transition: 'all 150ms ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = isDarkMode ? `${colours.cta}40` : `${colours.cta}26`;
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = isDarkMode ? `${colours.cta}26` : `${colours.cta}1a`;
                              }}
                            >
                              <Icon
                                iconName="Cancel"
                                styles={{
                                  root: {
                                    fontSize: 8,
                                    color: '#D65541',
                                  },
                                }}
                              />
                            </button>
                          ) : null}
                      </div>
                        );
                      })()}
                      {/* Actions header - use same structure as row actions */}
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'flex-end', 
                        gap: '3px',
                        minWidth: 0,
                        width: '100%',
                      }}>
                        {areActionsEnabled && <span style={{ color: isDarkMode ? 'rgba(209, 213, 219, 0.72)' : 'rgba(55, 65, 81, 0.72)' }}>Actions</span>}
                        <button
                          type="button"
                          onClick={() => setAreActionsEnabled((prev) => !prev)}
                          title={areActionsEnabled ? 'Disable row actions to prevent edits/deletes' : 'Enable row actions to edit or delete enquiries'}
                          style={{
                            width: 22,
                            height: 22,
                            minWidth: 22,
                            minHeight: 22,
                            borderRadius: 0,
                            border: `1px solid ${areActionsEnabled ? (isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(54, 144, 206, 0.3)') : (isDarkMode ? 'rgba(75, 85, 99, 0.52)' : 'rgba(160, 160, 160, 0.24)')}`,
                            background: areActionsEnabled
                              ? (isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(214, 232, 255, 0.88)')
                              : (isDarkMode ? 'rgba(8, 28, 48, 0.42)' : 'rgba(244, 244, 246, 0.74)'),
                            color: areActionsEnabled
                              ? (isDarkMode ? colours.accent : colours.highlight)
                              : (isDarkMode ? 'rgba(209, 213, 219, 0.82)' : colours.greyText),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease',
                            padding: 0,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.borderColor = isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(54, 144, 206, 0.3)';
                            e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(214, 232, 255, 0.88)';
                            e.currentTarget.style.color = isDarkMode ? colours.accent : colours.highlight;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.borderColor = areActionsEnabled ? (isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(54, 144, 206, 0.3)') : (isDarkMode ? 'rgba(75, 85, 99, 0.52)' : 'rgba(160, 160, 160, 0.24)');
                            e.currentTarget.style.background = areActionsEnabled ? (isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(214, 232, 255, 0.88)') : (isDarkMode ? 'rgba(8, 28, 48, 0.42)' : 'rgba(244, 244, 246, 0.74)');
                            e.currentTarget.style.color = areActionsEnabled ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? 'rgba(209, 213, 219, 0.82)' : colours.greyText);
                          }}
                          aria-pressed={areActionsEnabled}
                        >
                          <Icon
                            iconName={areActionsEnabled ? 'UnlockSolid' : 'LockSolid'}
                            styles={{
                              root: {
                                fontSize: '11px',
                                color: 'currentColor',
                              },
                            }}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Data Rows - keyed wrapper for crossfade on filter change */}
                    <div key={`rows-${activeState}-${showMineOnly}`} className="prospect-content-fade">
                    {displayedItems.map((item, idx) => {
                      const isLast = idx === displayedItems.length - 1;
                      
                      // Handle different item types
                      if (isGroupedEnquiry(item)) {
                        // For grouped enquiries, show summary info only
                        const latestEnquiry = item.enquiries[0]; // Most recent enquiry in the group
                        
                        // Enrich group name from instruction data when enquiry surname is missing
                        const contactName = (() => {
                          const raw = item.clientName;
                          // If surname appears absent, try enriching from instruction data
                          const parts = raw.split(/\s+/);
                          if (parts.length <= 1) {
                            // Look for any instruction in the group's enquiries
                            for (const enq of item.enquiries) {
                              const wb = getEnquiryWorkbenchItem(enq);
                              const instFirst = (wb?.instruction?.FirstName || '').trim();
                              const instLast = (wb?.instruction?.LastName || '').trim();
                              if (instFirst && instLast) return `${instFirst} ${instLast}`;
                            }
                          }
                          return raw;
                        })();
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
                        
                        const groupExtractDateStr = (enq: any): string =>
                          (enq?.Touchpoint_Date || enq?.datetime || enq?.claim || enq?.Date_Created || '') as string;
                        const groupToDayKey = (s: string): string => {
                          if (!s) return '';
                          const d = new Date(s);
                          if (isNaN(d.getTime())) return '';
                          return d.toISOString().split('T')[0];
                        };
                        const groupThisDateStr = groupExtractDateStr(latestEnquiry as any);
                        const thisDayKey = groupToDayKey(groupThisDateStr);
                        // Last-in-day: check if next displayedItem belongs to a different day
                        const groupNextItem: any = idx < displayedItems.length - 1 ? displayedItems[idx + 1] : null;
                        let groupNextDateStr = '';
                        if (groupNextItem) {
                          if (isGroupedEnquiry(groupNextItem)) {
                            groupNextDateStr = groupExtractDateStr(groupNextItem.enquiries[0] as any);
                          } else {
                            groupNextDateStr = groupExtractDateStr(groupNextItem as any);
                          }
                        }
                        const groupIsLastInDay = !groupNextItem || groupToDayKey(groupNextDateStr) !== thisDayKey;
                        // Check if any enquiry in this group has been converted / matter opened
                        const groupHasConverted = item.enquiries.some((enq: any) => {
                          const wb = getEnquiryWorkbenchItem(enq);
                          return Boolean(wb?.instruction?.MatterId || (wb?.matters && wb.matters.length > 0));
                        });
                        return (
                          <React.Fragment key={item.clientKey}>
                          <div
                            data-enquiry-id={`group-${item.clientKey}`}
                            data-row-parity={idx % 2 === 0 ? 'even' : 'odd'}
                            style={{
                              gridTemplateColumns: TABLE_GRID_TEMPLATE_COLUMNS,
                              borderBottom: (groupIsLastInDay && !expandedGroupsInTable.has(item.clientKey))
                                ? `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(0, 0, 0, 0.09)'}`
                                : `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.10)' : 'rgba(160, 160, 160, 0.08)'}`,
                            }}
                            className={`prospect-row${groupHasConverted ? ' prospect-row--converted' : ''}`}
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
                            <div className="prospect-timeline-cell">
                              <div
                                className="prospect-timeline-cell__line"
                                style={{
                                  background: getAreaOfWorkLineColor(latestEnquiry.Area_of_Work || '', isDarkMode, hoveredDayKey === thisDayKey),
                                  opacity: hoveredDayKey === thisDayKey ? 1 : 0.9,
                                }}
                              />
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
                                  <div className="prospect-date">
                                    <span className="prospect-date__top">
                                      {top}
                                    </span>
                                    <span className="prospect-date__bottom">
                                      {bottom}
                                    </span>
                                  </div>
                                );
                              })()}
                            </TooltipHost>

                            {/* Merged AOW / ID column for grouped enquiries */}
                            <div style={{ display: 'flex', alignItems: 'center', height: '100%', paddingInline: 2 }}>
                              <span className="prospect-aow-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }} title={latestEnquiry.Area_of_Work || ''}>
                                {renderAreaOfWorkGlyph(latestEnquiry.Area_of_Work || '', getAreaGlyphMeta(latestEnquiry.Area_of_Work || '').color, 'glyph', 17)}
                              </span>
                            </div>

                            {/* Contact & Company */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '100%', paddingInline: 2 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  color: isDarkMode ? 'rgba(160, 160, 160, 0.65)' : 'rgba(107, 107, 107, 0.6)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.4px',
                                }}>
                                  Prospect
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: '13px', color: groupHasConverted ? colours.green : (isDarkMode ? '#f3f4f6' : '#061733') }}>
                                  {contactName}
                                  {groupHasConverted && (
                                    <Icon iconName="CompletedSolid" styles={{ root: { fontSize: 9, color: colours.green, opacity: 0.7 } }} />
                                  )}
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
                          
                          {/* Expanded child enquiries - show ALL enquiries when expanded */}
                          {expandedGroupsInTable.has(item.clientKey) && item.enquiries.map((childEnquiry: Enquiry, childIdx: number) => {
                            const childAOW = childEnquiry.Area_of_Work || 'Unspecified';
                            const childValue = childEnquiry.Value || '';
                            const childIsV2 = (childEnquiry as any).__sourceType === 'new' || (childEnquiry as any).source === 'instructions';
                            const childEnrichmentData = enrichmentMap.get(String(childEnquiry.ID));
                            const childTeamsLink = (childEnrichmentData?.teamsData as any)?.teamsLink as string | undefined;
                            const childHasNotes = childEnquiry.Initial_first_call_notes && childEnquiry.Initial_first_call_notes.trim().length > 0;
                            const childNoteKey = buildEnquiryIdentityKey(childEnquiry);
                            const childNotesExpanded = expandedNotesInTable.has(childNoteKey);
                            const childInlineWorkbenchItem = getEnquiryWorkbenchItem(childEnquiry);
                            const childHasInlineWorkbench = Boolean(childInlineWorkbenchItem);
                            // Detect converted / matter-opened child enquiry
                            const childIsConverted = Boolean(
                              childInlineWorkbenchItem?.instruction?.MatterId ||
                              (childInlineWorkbenchItem?.matters && childInlineWorkbenchItem.matters.length > 0)
                            );

                            // Enrich name from instruction data when the enquiry source is incomplete
                            const rawFirst = (childEnquiry.First_Name || '').trim();
                            const rawLast = (childEnquiry.Last_Name || '').trim();
                            const instFirst = (childInlineWorkbenchItem?.instruction?.FirstName || '').trim();
                            const instLast = (childInlineWorkbenchItem?.instruction?.LastName || '').trim();
                            const childContactName = (() => {
                              // Prefer instruction name when enquiry surname is missing but instruction has it
                              if (!rawLast && instFirst && instLast) {
                                return `${instFirst} ${instLast}`;
                              }
                              return `${rawFirst} ${rawLast}`.trim() || 'Unknown';
                            })();
                            const childDisplayId = (childEnquiry as any).acid || childEnquiry.ID;
                            const childCompanyName = childEnquiry.Company || '';
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
                            const childRowBaseBackground = isDarkMode ? colours.dark.background : colours.sectionBackground;
                            const childRowHoverBackground = isDarkMode ? 'rgba(13, 47, 96, 0.38)' : colours.highlightBlue;
                            const childMutedBorder = isDarkMode ? `${colours.dark.borderColor}8c` : 'rgba(160, 160, 160, 0.28)';
                            const childMutedBackground = isDarkMode ? colours.darkBlue : colours.grey;
                            const childMutedBackgroundHover = isDarkMode ? colours.helixBlue : colours.highlightBlue;
                            const childMutedColor = isDarkMode ? colours.subtleGrey : colours.greyText;
                            const childMutedColorStrong = isDarkMode ? colours.dark.text : colours.light.text;
                            
                            // No day separators for child enquiries - parent group already has timeline marker
                            
                            return (
                              <React.Fragment key={`${childEnquiry.ID}-${childEnquiry.First_Name || ''}-${childEnquiry.Last_Name || ''}-${childEnquiry.Touchpoint_Date || ''}-${childEnquiry.Point_of_Contact || ''}`}>
                              <div
                                key={`item-${childEnquiry.ID}-${childEnquiry.First_Name || ''}-${childEnquiry.Last_Name || ''}-${childEnquiry.Touchpoint_Date || ''}-${childEnquiry.Point_of_Contact || ''}`}
                                className={[
                                  'prospect-row',
                                  childIsConverted ? 'prospect-row--converted' : '',
                                  (hoveredRowKey === childRowHoverKey || hoveredDayKey === thisDayKey)
                                    ? `pipeline-row-hover${(hoveredRowKeyReady === childRowHoverKey || hoveredDayKeyReady === thisDayKey) ? ' pipeline-row-hover-ready' : ''}`
                                    : '',
                                ].filter(Boolean).join(' ') || undefined}
                                style={{
                                  gridTemplateColumns: TABLE_GRID_TEMPLATE_COLUMNS,
                                  gap: `${TABLE_GRID_GAP_PX}px`,
                                  padding: '8px 14px',
                                  alignItems: 'center',
                                  borderBottom: (groupIsLastInDay && childIdx === item.enquiries.length - 1)
                                    ? `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.35)' : 'rgba(0, 0, 0, 0.09)'}`
                                    : `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.10)' : 'rgba(160, 160, 160, 0.08)'}`,
                                  position: 'relative',
                                  fontSize: '13px',
                                  color: isDarkMode ? 'rgba(243, 244, 246, 0.9)' : 'rgba(6, 23, 51, 0.9)',
                                  background: childRowBaseBackground,
                                  cursor: 'pointer',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectEnquiry(childEnquiry);
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = childRowHoverBackground;
                                  // Show child tooltip on hover
                                  const tooltip = e.currentTarget.querySelector('.child-timeline-date-tooltip') as HTMLElement;
                                  if (tooltip) tooltip.style.opacity = '1';
                                  setHoveredRowKey(childRowHoverKey);
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = childRowBaseBackground;
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
                                      <div className="prospect-date">
                                        <span className="prospect-date__top">{top}</span>
                                        <span className="prospect-date__bottom">{bottom}</span>
                                      </div>
                                    );
                                  })()}
                                </TooltipHost>

                                {/* Merged AOW / ID / Value */}
                                <div style={{
                                  position: 'relative',
                                  display: 'flex',
                                  alignItems: 'center',
                                  lineHeight: 1.3,
                                  paddingInline: 2,
                                  overflow: 'hidden',
                                }}>
                                  {(() => {
                                    const numValue = typeof childValue === 'string' ? parseFloat(childValue.replace(/[^0-9.]/g, '')) : (typeof childValue === 'number' ? childValue : 0);
                                    const displayValue = formatValueForDisplay(childValue);
                                    const hasValue = Boolean(displayValue);

                                    let textColor: string;
                                    if (numValue >= 50000) {
                                      textColor = isDarkMode ? 'rgba(54, 144, 206, 1)' : 'rgba(54, 144, 206, 1)';
                                    } else if (numValue >= 10000) {
                                      textColor = isDarkMode ? 'rgba(54, 144, 206, 0.75)' : 'rgba(54, 144, 206, 0.75)';
                                    } else {
                                      textColor = isDarkMode ? 'rgba(54, 144, 206, 0.5)' : 'rgba(54, 144, 206, 0.55)';
                                    }

                                    return (
                                      <>
                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 6,
                                          opacity: (childShowDetails && hasValue) ? 0 : 1,
                                          transition: 'opacity 160ms ease',
                                        }}>
                                          <span className="prospect-aow-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0 }} title={childAOW}>
                                            {renderAreaOfWorkGlyph(childAOW, getAreaGlyphMeta(childAOW).color, 'glyph', 17)}
                                          </span>
                                          <span style={{
                                            fontFamily: 'Monaco, Consolas, monospace',
                                            fontSize: '10px',
                                            fontWeight: 500,
                                            color: childIsConverted ? colours.green : (isDarkMode ? colours.dark.text : colours.light.text),
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            minWidth: 0,
                                          }}>
                                            {childDisplayId}
                                          </span>
                                        </div>
                                        {hasValue && (
                                          <div style={{
                                            position: 'absolute',
                                            left: 2,
                                            top: 0,
                                            bottom: 0,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            opacity: childShowDetails ? 1 : 0,
                                            transition: 'opacity 160ms ease',
                                            pointerEvents: 'none',
                                          }}>
                                            <span className="prospect-aow-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, flexShrink: 0, visibility: 'hidden' }}>
                                              {renderAreaOfWorkGlyph(childAOW, getAreaGlyphMeta(childAOW).color, 'glyph', 17)}
                                            </span>
                                            <span style={{
                                              fontSize: 10,
                                              fontWeight: 700,
                                              color: textColor,
                                              whiteSpace: 'nowrap',
                                            }}>
                                              {displayValue}
                                            </span>
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
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
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{
                                      fontWeight: 500,
                                      fontSize: '13px',
                                      color: childIsConverted ? colours.green : (isDarkMode ? '#f3f4f6' : '#061733'),
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      minWidth: 0,
                                      flex: '1 1 auto',
                                    }}>
                                      {childContactName}
                                    </span>
                                    {childIsConverted && (
                                      <Icon iconName="CompletedSolid" styles={{ root: { fontSize: 9, color: colours.green, opacity: 0.7, flexShrink: 0 } }} />
                                    )}
                                    <button
                                      type="button"
                                      className="prospect-copy-btn"
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
                                        marginLeft: 'auto',
                                        flexShrink: 0,
                                        width: 18,
                                        height: 18,
                                        borderRadius: 0,
                                        border: isChildNameCopied
                                          ? `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.5)' : 'rgba(32, 178, 108, 0.38)'}`
                                          : `1px solid ${childMutedBorder}`,
                                        background: isChildNameCopied
                                          ? (isDarkMode ? 'rgba(32, 178, 108, 0.16)' : 'rgba(32, 178, 108, 0.12)')
                                          : 'transparent',
                                        color: isChildNameCopied
                                          ? '#20b26c'
                                          : childMutedColor,
                                        cursor: 'pointer',
                                        padding: 0,
                                        opacity: isChildNameCopied ? 1 : 0.5,
                                        boxShadow: isChildNameCopied
                                          ? (isDarkMode ? '0 0 0 1px rgba(32, 178, 108, 0.15)' : '0 0 0 1px rgba(32, 178, 108, 0.12)')
                                          : 'none',
                                        transform: isChildNameCopied ? 'scale(1.06)' : 'scale(1)',
                                        transition: 'opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 160ms ease, box-shadow 160ms ease, background 160ms ease',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (isChildNameCopied) return;
                                        e.currentTarget.style.opacity = '0.9';
                                        e.currentTarget.style.borderColor = childMutedBorder;
                                        e.currentTarget.style.color = childMutedColorStrong;
                                      }}
                                      onMouseLeave={(e) => {
                                        if (isChildNameCopied) return;
                                        e.currentTarget.style.opacity = '0.5';
                                        e.currentTarget.style.borderColor = childMutedBorder;
                                        e.currentTarget.style.color = childMutedColor;
                                      }}
                                    >
                                      <Icon
                                        iconName={isChildNameCopied ? 'CompletedSolid' : 'Copy'}
                                        styles={{
                                          root: {
                                            fontSize: 10,
                                            transform: isChildNameCopied ? 'scale(1.05)' : 'scale(1)',
                                            transition: 'transform 160ms ease, color 160ms ease',
                                            color: isChildNameCopied ? '#20b26c' : undefined,
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
                                            gridTemplateColumns: `repeat(${pipelineNeedsCarousel ? visiblePipelineChipCount : 7}, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr))`,
                                            columnGap: 8,
                                            alignItems: 'center',
                                            width: '100%',
                                            minWidth: 0,
                                            height: '100%',
                                            paddingRight: pipelineNeedsCarousel ? 32 : 0,
                                            boxSizing: 'border-box',
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
                                                    isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(107, 107, 107, 0.2)',
                                                    14
                                                  )}
                                                </div>
                                              );
                                            });
                                          })()}
                                        </div>
                                        {pipelineNeedsCarousel ? (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              advancePipelineScroll(childEnquiry.ID, 7, visiblePipelineChipCount);
                                            }}
                                            title="View more stages"
                                            style={{
                                              position: 'absolute',
                                              top: '50%',
                                              right: 0,
                                              transform: 'translateY(-50%)',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              width: 24,
                                              height: 22,
                                              padding: 0,
                                              border: `1px solid ${isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(107, 107, 107, 0.2)'}`,
                                              borderRadius: 0,
                                              background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                                              cursor: 'pointer',
                                              transition: 'all 0.15s ease',
                                              color: colours.blue,
                                            }}
                                          >
                                            <Icon iconName="ChevronRight" styles={{ root: { fontSize: 12, color: 'inherit' } }} />
                                          </button>
                                        ) : null}
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
                                  const childGridCols = `repeat(${pipelineNeedsCarousel ? visiblePipelineChipCount : 7}, minmax(${PIPELINE_CHIP_MIN_WIDTH_PX}px, 1fr))`;
                                  const childPipelineGridPaddingRight = pipelineNeedsCarousel ? 32 : 0;
                                  
                                  // Cascade animation helper
                                  const getCascadeStyle = (_chipIndex: number) => ({
                                    animation: 'none',
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
                                          paddingRight: childPipelineGridPaddingRight,
                                          boxSizing: 'border-box',
                                        }}
                                      >
                                        {/* POC - merged Teams+Claim - chip index 0 */}
                                          {childIsChipVisible(0) && (
                                          <div data-chip-index="0" style={{ ...getCascadeStyle(0), display: 'flex', justifyContent: 'center', width: '100%' }}>
                                        <>
                                          {(() => {
                                            // Merged POC chip: Teams icon + claimer initials + chevron
                                            const hasPocActivity = showTeamsStage || showClaimer;
                                            const isUnclaimed = !showClaimer || childIsTeamInboxPoc;
                                            const pocColor = hasPocActivity ? colours.green : (isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(107, 107, 107, 0.2)');
                                            const teamsIconColor = showTeamsStage 
                                              ? (isDarkMode ? 'rgba(54, 144, 206, 0.85)' : 'rgba(54, 144, 206, 0.75)')
                                              : (isDarkMode ? 'rgba(160, 160, 160, 0.25)' : 'rgba(107, 107, 107, 0.2)');
                                            
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
                                                    background: isDarkMode ? 'rgba(160,160,160,0.06)' : 'rgba(160,160,160,0.04)',
                                                    border: `1px dashed ${isDarkMode ? `${colours.subtleGrey}40` : `${colours.greyText}33`}`,
                                                    fontSize: 9,
                                                    fontWeight: 500,
                                                    color: isDarkMode ? `${colours.subtleGrey}99` : `${colours.greyText}99`,
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
                                              const processingIdentity = resolveEnquiryProcessingIdentity(childEnquiry as any);
                                              // Unclaimed - show subtle claim prompt
                                              return renderClaimPromptChip({
                                                size: 'compact',
                                                teamsLink: childTeamsLink,
                                                leadName: childContactName,
                                                areaOfWork: childEnquiry['Area_of_Work'],
                                                enquiryId: processingIdentity.enquiryId,
                                                dataSource: processingIdentity.source,
                                                iconOnly: true,
                                              });
                                            }
                                            
                                            // Claimed - show initials + Teams icon reveal on hover
                                            return (
                                              <div
                                                className="pipeline-chip pipeline-chip-reveal"
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
                                                  width: '100%',
                                                  height: 22,
                                                  padding: 0,
                                                  borderRadius: 0,
                                                  border: 'none',
                                                  background: 'transparent',
                                                  fontFamily: 'inherit',
                                                  overflow: 'visible',
                                                }}
                                              >
                                                <span className="pipeline-chip-box">
                                                  <span
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={(e) => { e.stopPropagation(); handleReassignClick(String(childEnquiry.ID), e); }}
                                                    style={{
                                                      minWidth: 18,
                                                      textAlign: 'center',
                                                      fontSize: 10,
                                                      fontWeight: 700,
                                                      color: colours.green,
                                                      textTransform: 'uppercase',
                                                      letterSpacing: '0.3px',
                                                      lineHeight: 1,
                                                      cursor: 'pointer',
                                                    }}
                                                    title="Reassign"
                                                  >
                                                    {childClaimerLabel}
                                                  </span>
                                                  {childTeamsLink && (
                                                    <span
                                                      className="pipeline-chip-label"
                                                      role="link"
                                                      tabIndex={0}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.open(childTeamsLink, '_blank', 'noopener,noreferrer');
                                                      }}
                                                      style={{ cursor: 'pointer', color: isDarkMode ? colours.accent : colours.highlight }}
                                                      title="Open Teams card"
                                                    >
                                                      {renderPipelineIcon('TeamsLogo', isDarkMode ? colours.accent : colours.highlight, 12)}
                                                    </span>
                                                  )}
                                                </span>
                                              </div>
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
                                            <MiniPipelineChip
                                              shortLabel={pitchChipLabel}
                                              fullLabel="Pitch Sent"
                                              done={true}
                                              color={pitchColor}
                                              iconName="Send"
                                              showConnector={true}
                                              prevDone={showTeamsStage || showClaimer}
                                              statusText={pitchedStamp}
                                              subtitle={childContactName}
                                              title="Pitch Sent"
                                              isNextAction={false}
                                              details={[
                                                ...(pitchedBy ? [{ label: 'By', value: pitchedBy }] : []),
                                                ...(pitchScenarioId ? [{ label: 'Scenario', value: `#${pitchScenarioId}` }] : []),
                                                ...(pitchMatterRef ? [{ label: 'Matter', value: pitchMatterRef }] : []),
                                              ]}
                                              isDarkMode={isDarkMode}
                                              onClick={(e: React.MouseEvent) => {
                                                e.stopPropagation();
                                                openEnquiryWorkbench(childEnquiry, 'Timeline', { filter: 'pitch' });
                                              }}
                                              onMouseEnter={(e: React.MouseEvent) => showPipelineHover(e, {
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
                                            />
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
                                                color: isDarkMode ? 'rgba(160, 160, 160, 0.7)' : 'rgba(107, 107, 107, 0.6)',
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
                                              {renderPipelineIcon('Send', isDarkMode ? 'rgba(160, 160, 160, 0.55)' : 'rgba(107, 107, 107, 0.5)', 14)}
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
                                              {renderPipelineIcon('Send', isDarkMode ? 'rgba(160, 160, 160, 0.55)' : 'rgba(107, 107, 107, 0.5)', 14)}
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
                                            { done: hasRisk && riskResult !== 'high' && riskResult !== 'medium', index: 5, inPlay: shouldShowPostPitch },
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
                                                done: shouldShowPostPitch && eidPassed,
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
                                                done: shouldShowPostPitch && hasRisk && riskResult !== 'high' && riskResult !== 'medium',
                                                color: hasRisk ? (riskResult === 'high' ? colours.red : riskResult === 'medium' ? colours.orange : colours.green) : colours.highlight,
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
                                                  openEnquiryWorkbench(childEnquiry, 'Timeline', { workbenchTab: 'matter' });
                                                }
                                              })}
                                              </div>
                                              )}
                                            </>
                                          );
                                        })()}

                                      </div>
                                      {pipelineNeedsCarousel ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            advancePipelineScroll(childEnquiry.ID, 7, visiblePipelineChipCount);
                                          }}
                                          title={childHasMoreChips ? `View more stages (${7 - childVisibleEnd} hidden)` : 'Back to start'}
                                          style={{
                                            position: 'absolute',
                                            top: '50%',
                                            right: 0,
                                            transform: 'translateY(-50%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: 24,
                                            height: 22,
                                            padding: 0,
                                            border: `1px solid ${childMutedBorder}`,
                                            borderRadius: 0,
                                            background: childHasMoreChips
                                              ? (isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                                              : childMutedBackground,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            color: childHasMoreChips
                                              ? (isDarkMode ? colours.accent : colours.highlight)
                                              : childMutedColor,
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
                                      ) : null}

                                    </div>
                                  );
                                })()}

                                {/* Actions Column for Child Enquiry */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                {/* Call / Email / Rate actions — only in unlocked action mode */}
                                {areActionsEnabled && childShowClaimer && !childIsTeamInboxPoc && (
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
                                        border: `1px solid ${childMutedBorder}`,
                                        background: childMutedBackground,
                                        color: childMutedColor,
                                        opacity: (childEnquiry.Phone_Number || (childEnquiry as any).phone) ? 1 : 0.3,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: (childEnquiry.Phone_Number || (childEnquiry as any).phone) ? 'pointer' : 'default',
                                        transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease',
                                      }}
                                      onMouseEnter={(e) => {
                                        if (childEnquiry.Phone_Number || (childEnquiry as any).phone) {
                                          e.currentTarget.style.background = childMutedBackgroundHover;
                                          e.currentTarget.style.borderColor = isDarkMode ? colours.highlight : colours.highlight;
                                          e.currentTarget.style.color = isDarkMode ? colours.highlight : colours.highlight;
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = childMutedBackground;
                                        e.currentTarget.style.borderColor = childMutedBorder;
                                        e.currentTarget.style.color = childMutedColor;
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
                                          border: `1px solid ${childMutedBorder}`,
                                          background: childMutedBackground,
                                          color: childMutedColor,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer',
                                          transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = childMutedBackgroundHover;
                                          e.currentTarget.style.borderColor = isDarkMode ? colours.highlight : colours.highlight;
                                          e.currentTarget.style.color = isDarkMode ? colours.highlight : colours.highlight;
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = childMutedBackground;
                                          e.currentTarget.style.borderColor = childMutedBorder;
                                          e.currentTarget.style.color = childMutedColor;
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
                                    background: childMutedBackground,
                                    border: `1px solid ${childMutedBorder}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: (childHasNotes || childHasInlineWorkbench) ? 'pointer' : 'default',
                                    transition: 'all 0.2s ease',
                                    opacity: (childHasNotes || childHasInlineWorkbench) ? 1 : 0.4,
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!(childHasNotes || childHasInlineWorkbench)) return;
                                    e.currentTarget.style.background = childMutedBackgroundHover;
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = childMutedBackground;
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
                                        color: childMutedColor
                                      } 
                                    }} 
                                  />
                                </div>
                                {(areActionsEnabled || String(childEnquiry.ID || (childEnquiry as any).id || '').toUpperCase().startsWith('DEMO-ENQ-')) && (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleShareEnquiry(childEnquiry);
                                    }}
                                    style={{
                                      width: 22,
                                      height: 22,
                                      borderRadius: 0,
                                      background: childMutedBackground,
                                      border: `1px solid ${childMutedBorder}`,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = childMutedBackgroundHover;
                                      e.currentTarget.style.transform = 'scale(1.05)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = childMutedBackground;
                                      e.currentTarget.style.transform = 'scale(1)';
                                    }}
                                    title="Share enquiry access"
                                  >
                                    <Icon
                                      iconName="PeopleAdd"
                                      styles={{
                                        root: {
                                          fontSize: '10px',
                                          color: childMutedColorStrong,
                                        },
                                      }}
                                    />
                                  </div>
                                )}

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
                                        background: childMutedBackground,
                                        border: `1px solid ${childMutedBorder}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = childMutedBackgroundHover;
                                        e.currentTarget.style.transform = 'scale(1.05)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = childMutedBackground;
                                        e.currentTarget.style.transform = 'scale(1)';
                                      }}
                                      title="Edit enquiry"
                                    >
                                      <Icon 
                                        iconName="Edit" 
                                        styles={{ 
                                          root: { 
                                            fontSize: '10px', 
                                            color: childMutedColorStrong
                                          } 
                                        }} 
                                      />
                                    </div>

                                    {/* Delete Button */}
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        let passcode: string | null = null;
                                        try {
                                          passcode = window.prompt('Enter passcode to delete this enquiry:');
                                        } catch {
                                          alert('Passcode input is not supported in this client.');
                                          return;
                                        }
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
                                        background: isDarkMode ? 'rgba(214, 85, 65, 0.1)' : 'rgba(214, 85, 65, 0.08)',
                                        border: `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.3)' : 'rgba(214, 85, 65, 0.2)'}`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(214, 85, 65, 0.15)' : 'rgba(214, 85, 65, 0.12)';
                                        e.currentTarget.style.transform = 'scale(1.05)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = isDarkMode ? 'rgba(214, 85, 65, 0.1)' : 'rgba(214, 85, 65, 0.08)';
                                        e.currentTarget.style.transform = 'scale(1)';
                                      }}
                                      title="Delete enquiry (requires passcode)"
                                    >
                                      <Icon 
                                        iconName="Delete" 
                                        styles={{ 
                                          root: { 
                                            fontSize: '10px', 
                                            color: isDarkMode ? '#D65541' : '#D65541' 
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
                                  backgroundColor: isDarkMode ? colours.dark.sectionBackground : 'rgba(214, 232, 255, 0.28)',
                                  borderBottom: 'none',
                                  fontSize: '10px',
                                  lineHeight: '1.5',
                                  color: isDarkMode ? '#d1d5db' : '#374151',
                                  whiteSpace: 'pre-line',
                                  marginLeft: '20px',
                                }}>
                                  <div style={{
                                    fontSize: '9px',
                                    fontWeight: 600,
                                    color: isDarkMode ? colours.accent : colours.highlight,
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
                        const nextDisplayedItem = displayedItems[idx + 1];
                        const nextDateStr = nextDisplayedItem && !isGroupedEnquiry(nextDisplayedItem)
                          ? String(nextDisplayedItem.Touchpoint_Date || (nextDisplayedItem as any).datetime || (nextDisplayedItem as any).claim || nextDisplayedItem.Date_Created || '')
                          : '';

                        // Handle individual enquiries — rendered via extracted component
                        return (
                          <ProspectTableRow
                            key={`${item.ID}-${item.First_Name || ''}-${item.Last_Name || ''}-${item.Touchpoint_Date || ''}-${item.Point_of_Contact || ''}`}
                            item={item}
                            idx={idx}
                            nextDateStr={nextDateStr}
                            pipelineHandlers={rowPipelineHandlers}
                            actionHandlers={rowActionHandlers}
                            displayState={rowDisplayState}
                            hoverHandlers={rowHoverHandlers}
                            dataDeps={rowDataDeps}
                          />
                        );
                      }
                    })}
                    {/* Infinite scroll loader for table view - inside scroll container */}
                    {itemsToShow < filteredEnquiries.length && (
                      <div 
                        ref={loader} 
                        style={{ 
                          height: '20px', 
                          width: '100%',
                        }} 
                      />
                    )}
                    {isQueueRevealActive && displayedItems.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 16px 18px' }}>
                        {Array.from({ length: 3 }, (_, idx) => (
                          <div
                            key={`queue-reveal-tail-${idx}`}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: TABLE_GRID_TEMPLATE_COLUMNS,
                              gap: `${TABLE_GRID_GAP_PX}px`,
                              minHeight: 56,
                              alignItems: 'center',
                              padding: '0 2px',
                              opacity: 0.5 - (idx * 0.08),
                            }}
                          >
                            <div style={{ height: 12, background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6,23,51,0.04)' }} />
                            <div style={{ height: 10, background: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(6,23,51,0.06)' }} />
                            <div style={{ height: 22, background: isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.08)' }} />
                            <div style={{ height: 10, background: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(6,23,51,0.06)' }} />
                            <div style={{ height: 10, background: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(6,23,51,0.06)' }} />
                            <div style={{ height: 18, background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6,23,51,0.04)' }} />
                            <div style={{ height: 10, background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6,23,51,0.04)' }} />
                            <div style={{ height: 22, background: isDarkMode ? 'rgba(32,178,108,0.08)' : 'rgba(32,178,108,0.06)' }} />
                          </div>
                        ))}
                      </div>
                    )}
                    </div>
                  </div>
              </>
            )}
          </>
        )}
      </div>

      <SuccessMessageBar isVisible={isSuccessVisible} onDismiss={() => setIsSuccessVisible(false)} />

      <RatingModal
        isOpen={isRateModalOpen}
        isDarkMode={isDarkMode}
        currentRating={currentRating}
        setCurrentRating={setCurrentRating}
        submitRating={submitRating}
        closeRateModal={closeRateModal}
      />

      {/* People Search Panel */}
      <PeopleSearchPanel
        isOpen={isPeopleSearchOpen}
        onDismiss={() => setIsPeopleSearchOpen(false)}
      />

      {/* Create Contact Modal */}
      <CreateContactModal
        isOpen={isCreateContactModalOpen}
        onDismiss={() => setIsCreateContactModalOpen(false)}
        onSuccess={async (enquiryId) => {
          showToast('Contact created successfully', 'success', `New enquiry record created (ID: ${enquiryId})`, 4000);
          
          // Immediately trigger refresh to show the new enquiry
          if (onRefreshEnquiries) {
            try {
              await onRefreshEnquiries();
            } catch (err) {
              console.error('[Enquiries] Failed to refresh after contact creation:', err);
            }
          }
        }}
        userEmail={userData?.[0]?.Email}
        teamData={teamData}
      />

      <PipelineTooltipPortal pipelineHover={pipelineHover} isDarkMode={isDarkMode} />

      <EditEnquiryModal
        isOpen={showEditModal}
        isDarkMode={isDarkMode}
        editingEnquiry={editingEnquiry}
        setEditingEnquiry={setEditingEnquiry}
        handleEditEnquiry={handleEditEnquiry}
        onClose={() => { setShowEditModal(false); setEditingEnquiry(null); }}
      />

      <ReassignmentDropdown
        dropdown={reassignmentDropdown}
        isDarkMode={isDarkMode}
        isReassigning={isReassigning}
        teamMemberOptions={teamMemberOptions}
        handleReassignmentSelect={handleReassignmentSelect}
      />

      <Modal
        isOpen={Boolean(shareModalEnquiry)}
        onDismiss={() => {
          if (isShareModalSaving) return;
          setShareModalEnquiry(null);
          setShareModalSelectedEmails([]);
          setShareModalExternalEmails([]);
          setShareModalSearch('');
        }}
        isBlocking={isShareModalSaving}
        styles={{
          main: {
            background: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
            borderRadius: 0,
            border: `1px solid ${isDarkMode ? `${colours.accent}66` : `${colours.highlight}66`}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
            width: 700,
            maxWidth: '92vw',
          },
        }}
      >
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'Raleway, Segoe UI, sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              Share access
            </div>
            <button
              type="button"
              onClick={() => {
                if (isShareModalSaving) return;
                setShareModalSelectedEmails([]);
                setShareModalExternalEmails([]);
              }}
              disabled={isShareModalSaving}
              style={{
                border: `1px solid ${isDarkMode ? `${colours.cta}66` : `${colours.cta}59`}`,
                background: isDarkMode ? `${colours.cta}14` : `${colours.cta}0d`,
                color: colours.cta,
                borderRadius: 0,
                padding: '4px 8px',
                fontSize: 10,
                fontWeight: 700,
                cursor: isShareModalSaving ? 'default' : 'pointer',
                opacity: isShareModalSaving ? 0.5 : 1,
              }}
            >
              Clear all
            </button>
          </div>

          <div style={{ fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText, lineHeight: 1.45 }}>
            Give teammates access to view and work on this enquiry.
          </div>

          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            minHeight: 28,
            padding: '6px 0',
            borderTop: `1px solid ${isDarkMode ? `${colours.accent}3d` : `${colours.highlight}33`}`,
            borderBottom: `1px solid ${isDarkMode ? `${colours.accent}3d` : `${colours.highlight}33`}`,
          }}>
            {[...shareModalSelectedEmails, ...shareModalExternalEmails].length === 0 && (
              <span style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>No one selected</span>
            )}
            {shareModalSelectedEmails.map((email) => {
              const option = shareMemberOptions.find((member) => member.email === email);
              return (
                <button
                  key={`selected-${email}`}
                  type="button"
                  onClick={() => toggleShareMemberEmail(email)}
                  disabled={isShareModalSaving}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: `1px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                    background: isDarkMode ? `${colours.accent}1f` : `${colours.highlight}14`,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    borderRadius: 0,
                    padding: '4px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: isShareModalSaving ? 'default' : 'pointer',
                    opacity: isShareModalSaving ? 0.6 : 1,
                  }}
                >
                  <span>{option?.displayName || email}</span>
                  <span style={{ color: isDarkMode ? colours.accent : colours.highlight }}>×</span>
                </button>
              );
            })}
            {shareModalExternalEmails.map((email) => (
              <button
                key={`external-${email}`}
                type="button"
                onClick={() => removeShareExternalEmail(email)}
                disabled={isShareModalSaving}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: `1px solid ${isDarkMode ? `${colours.cta}4d` : `${colours.cta}40`}`,
                  background: isDarkMode ? `${colours.cta}14` : `${colours.cta}0d`,
                  color: colours.cta,
                  borderRadius: 0,
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: isShareModalSaving ? 'default' : 'pointer',
                  opacity: isShareModalSaving ? 0.6 : 1,
                }}
                title="Remove external share"
              >
                <span>{email}</span>
                <span>×</span>
              </button>
            ))}
          </div>

          <input
            value={shareModalSearch}
            onChange={(e) => setShareModalSearch(e.target.value)}
            disabled={isShareModalSaving}
            placeholder="Find team member"
            style={{
              width: '100%',
              borderRadius: 0,
              border: `1px solid ${isDarkMode ? `${colours.accent}59` : `${colours.highlight}59`}`,
              background: isDarkMode ? colours.websiteBlue : colours.light.inputBackground,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              fontFamily: 'inherit',
              fontSize: 12,
              padding: '8px 10px',
            }}
          />

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 8,
            maxHeight: 280,
            overflowY: 'auto',
            paddingRight: 2,
          }}>
            {shareMemberOptions
              .filter((member) => {
                const q = shareModalSearch.trim().toLowerCase();
                if (!q) return true;
                return member.displayName.toLowerCase().includes(q) || member.email.includes(q) || member.initials.toLowerCase().includes(q);
              })
              .map((member) => {
                const isSelected = shareModalSelectedEmails.includes(member.email);
                return (
                  <button
                    key={member.email}
                    type="button"
                    onClick={() => toggleShareMemberEmail(member.email)}
                    disabled={isShareModalSaving}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      borderRadius: 0,
                      border: `1px solid ${isSelected ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? `${colours.accent}40` : `${colours.highlight}40`)}`,
                      background: isSelected
                        ? (isDarkMode ? `${colours.accent}14` : `${colours.highlight}12`)
                        : (isDarkMode ? colours.websiteBlue : colours.light.sectionBackground),
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                      padding: '8px 10px',
                      textAlign: 'left',
                      cursor: isShareModalSaving ? 'default' : 'pointer',
                      opacity: isShareModalSaving ? 0.6 : 1,
                      transition: 'all 0.12s ease',
                    }}
                  >
                    <span style={{
                      width: 20,
                      height: 20,
                      minWidth: 20,
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      fontWeight: 700,
                      background: isSelected
                        ? (isDarkMode ? colours.accent : colours.highlight)
                        : (isDarkMode ? colours.darkBlue : colours.highlightBlue),
                      color: isSelected
                        ? (isDarkMode ? colours.websiteBlue : colours.light.cardBackground)
                        : (isDarkMode ? colours.dark.text : colours.light.text),
                    }}>{member.initials}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.displayName}</span>
                      <span style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.email}</span>
                    </span>
                  </button>
                );
              })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              disabled={isShareModalSaving}
              onClick={() => {
                setShareModalEnquiry(null);
                setShareModalSelectedEmails([]);
                setShareModalExternalEmails([]);
                setShareModalSearch('');
              }}
              style={{
                border: `1px solid ${isDarkMode ? `${colours.accent}52` : `${colours.highlight}52`}`,
                background: isDarkMode ? `${colours.accent}0f` : `${colours.highlight}0a`,
                color: isDarkMode ? colours.accent : colours.highlight,
                borderRadius: 0,
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: isShareModalSaving ? 'default' : 'pointer',
                opacity: isShareModalSaving ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isShareModalSaving}
              onClick={() => {
                void submitShareModal();
              }}
              style={{
                border: `1px solid ${isDarkMode ? colours.accent : colours.highlight}`,
                background: isDarkMode ? `${colours.accent}1f` : `${colours.highlight}14`,
                color: isDarkMode ? colours.accent : colours.highlight,
                borderRadius: 0,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 700,
                cursor: isShareModalSaving ? 'default' : 'pointer',
                opacity: isShareModalSaving ? 0.7 : 1,
              }}
            >
              {isShareModalSaving ? 'Saving…' : 'Save access'}
            </button>
          </div>
        </div>
      </Modal>
      
      </Stack>
    </div>
  );
}

export default Enquiries;
