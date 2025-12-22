import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Stack,
  Text,
  DefaultButton,
  IconButton,
  Persona,
  PersonaSize,
  TextField,
  MessageBar,
  MessageBarType
} from '@fluentui/react';
import { mergeStyles, keyframes } from '@fluentui/react';
import { eachDayOfInterval, isWeekend, format } from 'date-fns';
import { colours } from '../app/styles/colours';
import { useTheme } from '../app/functionality/ThemeContext';
// Note: Use relative Express API path for attendance endpoints to avoid double `/api` in production
import HelixAvatar from '../assets/helix avatar.png';
import { FaUmbrellaBeach } from 'react-icons/fa';

/* ---------------------------------------------------------------------------
   Types & Interfaces
--------------------------------------------------------------------------- */
export interface ApprovalEntry {
  id: string;
  request_id?: number;
  person: string;
  start_date: string;
  end_date: string;
  reason?: string;
  status: string;
  days_taken?: number;
  leave_type?: string;
  hearing_confirmation?: string | boolean | null;
  hearing_details?: string;
}

export interface TeamMember {
  Initials: string;
  Nickname?: string;
  First: string;
  imageUrl?: string;
  holiday_entitlement?: number;
}

export interface LeaveEntry {
  person: string;
  start_date: string;
  end_date: string;
  status: string;
  request_id?: number;
  days_taken?: number;
  leave_type?: string;
}

export interface TotalsItem {
  standard: number;
  unpaid: number;
  purchase: number;
}

/* ---------------------------------------------------------------------------
   Fiscal Year Helper Functions
--------------------------------------------------------------------------- */
function getFiscalYearStart(date: Date): number {
  const year = date.getFullYear();
  const aprilFirst = new Date(year, 3, 1); // month index 3 => April
  return date >= aprilFirst ? year : year - 1;
}

function isDateInFiscalYear(date: Date, fyStartYear: number): boolean {
  // FY runs from 1 Apr (fyStartYear) to 31 Mar (fyStartYear + 1)
  const start = new Date(fyStartYear, 3, 1);
  const end = new Date(fyStartYear + 1, 2, 31, 23, 59);
  return date >= start && date <= end;
}

function normalizePersonKey(value: string): string {
  return (value || '').trim().toLowerCase();
}

type LeaveTypeBucket = 'standard' | 'purchase' | 'sale' | 'other';

type LeaveBreakdown = {
  standard: number;
  purchase: number;
  sale: number;
  other: number;
};

function normalizeLeaveType(value: unknown): LeaveTypeBucket {
  const t = String(value || '').trim().toLowerCase();
  if (t === 'standard') return 'standard';
  if (t === 'purchase') return 'purchase';
  if (t === 'sale') return 'sale';
  return 'other';
}

function formatDays(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getLeaveDaysWithinFY(entry: LeaveEntry, fyStartYear: number): number {
  const startDate = new Date(entry.start_date);
  const endDate = new Date(entry.end_date);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;

  const intervalStart = startDate <= endDate ? startDate : endDate;
  const intervalEnd = startDate <= endDate ? endDate : startDate;

  const fyStart = new Date(fyStartYear, 3, 1);
  const fyEnd = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999);

  // Only count the overlap with the fiscal year (prevents cross-FY overcount)
  if (!isDateInFiscalYear(intervalStart, fyStartYear) && !isDateInFiscalYear(intervalEnd, fyStartYear)) {
    return 0;
  }

  const overlapStart = intervalStart > fyStart ? intervalStart : fyStart;
  const overlapEnd = intervalEnd < fyEnd ? intervalEnd : fyEnd;
  if (overlapStart > overlapEnd) return 0;

  // If the record sits fully inside FY and has a reliable days_taken, prefer it (supports half-days).
  const daysTaken = typeof entry.days_taken === 'number' ? entry.days_taken : Number(entry.days_taken);
  const fullyInsideFY = intervalStart >= fyStart && intervalEnd <= fyEnd;
  if (fullyInsideFY && Number.isFinite(daysTaken) && daysTaken > 0) {
    return daysTaken;
  }

  return eachDayOfInterval({ start: overlapStart, end: overlapEnd })
    .filter(day => !isWeekend(day))
    .length;
}

function sumBookedApprovedDaysByTypeInFY(
  allLeaveEntries: LeaveEntry[],
  person: string,
  fyStartYear: number,
  personAliases: string[] = []
): LeaveBreakdown {
  const breakdown: LeaveBreakdown = { standard: 0, purchase: 0, sale: 0, other: 0 };

  const aliasSet = new Set(
    [person, ...personAliases]
      .map(normalizePersonKey)
      .filter(Boolean)
  );

  allLeaveEntries
    .filter(entry => aliasSet.has(normalizePersonKey(entry.person)))
    .filter(entry => {
      const s = String(entry.status || '').toLowerCase();
      return s === 'booked' || s === 'approved';
    })
    .forEach(entry => {
      const days = getLeaveDaysWithinFY(entry, fyStartYear);
      if (!days) return;

      const bucket = normalizeLeaveType(entry.leave_type);
      breakdown[bucket] += days;
    });

  return breakdown;
}

/* ---------------------------------------------------------------------------
   Types & Props
--------------------------------------------------------------------------- */
interface AnnualLeaveApprovalsProps {
  approvals: ApprovalEntry[];
  futureLeave: ApprovalEntry[];
  onClose: () => void;
  team: TeamMember[];
  totals: TotalsItem[];
  allLeaveEntries: LeaveEntry[];
  onApprovalUpdate?: (id: string, newStatus: string) => void;
  onShowToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

/* ---------------------------------------------------------------------------
   Toast & Animation Styles
--------------------------------------------------------------------------- */
const fadeOutAnimation = keyframes({
  from: { opacity: 1, transform: 'translateX(0)', maxHeight: '500px' },
  to: { opacity: 0, transform: 'translateX(20px)', maxHeight: '0px', padding: '0', margin: '0', overflow: 'hidden' }
});

const successPulseAnimation = keyframes({
  '0%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.4)' },
  '70%': { boxShadow: '0 0 0 10px rgba(34, 197, 94, 0)' },
  '100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0)' }
});

const rejectPulseAnimation = keyframes({
  '0%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.4)' },
  '70%': { boxShadow: '0 0 0 10px rgba(239, 68, 68, 0)' },
  '100%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0)' }
});

const toastContainerStyle = mergeStyles({
  position: 'fixed',
  top: '20px',
  right: '20px',
  zIndex: 2147483001,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  maxWidth: '400px'
});

/* ---------------------------------------------------------------------------
   Theme-Aware Professional Styling
--------------------------------------------------------------------------- */
const formContainerStyle = mergeStyles({
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  backdropFilter: 'blur(2px)',
  WebkitBackdropFilter: 'blur(2px)',
  zIndex: 2147483000, // ensure above any app/panel overlays
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  overflow: 'auto',
});

const modalContentStyle = (isDarkMode: boolean) => mergeStyles({
  background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
  borderRadius: 2,
  boxShadow: isDarkMode
    ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.1)'
    : '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
  width: 'min(1000px, 95vw)',
  maxHeight: '90vh',
  overflow: 'hidden',
  padding: 0,
  position: 'relative',
  border: isDarkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)',
  display: 'flex',
  flexDirection: 'column',
  '@media (max-width: 768px)': {
    borderRadius: 2,
    width: '98%',
    maxHeight: '95vh',
  },
});

const modalHeaderStyle = (isDarkMode: boolean) => mergeStyles({
  padding: '20px 24px',
  borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
});

const modalBodyStyle = mergeStyles({
  padding: '20px 24px',
  overflow: 'auto',
  flex: 1,
});

// Compact card design for better information density
const compactCardStyle = (isDarkMode: boolean, isExpanded: boolean) => mergeStyles({
  background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
  border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.18)' : colours.light.border}`,
  borderLeft: `2px solid ${isDarkMode ? colours.accent : colours.highlight}`,
  borderRadius: 2,
  padding: '1rem',
  marginBottom: '12px',
  boxShadow: isDarkMode 
    ? '0 2px 8px rgba(0, 0, 0, 0.15)'
    : '0 2px 8px rgba(0, 0, 0, 0.03)',
  transition: 'all 0.2s ease',
  cursor: 'default',
  ':hover': {
    boxShadow: isDarkMode 
      ? '0 4px 12px rgba(0, 0, 0, 0.2)'
      : '0 4px 12px rgba(0, 0, 0, 0.05)',
  },
  maxHeight: isExpanded ? '2000px' : 'auto',
  overflow: isExpanded ? 'visible' : 'hidden',
});

const headerSectionStyle = mergeStyles({
  borderBottom: `1px solid ${colours.light.border}`,
  paddingBottom: '20px',
  marginBottom: '24px',
});

const requestHeaderStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
});

const sectionTitleStyle = mergeStyles({
  fontSize: '16px',
  fontWeight: 600,
  color: colours.light.text,
  marginBottom: '12px',
  letterSpacing: '0.4px',
  textTransform: 'uppercase',
  borderLeft: `3px solid ${colours.highlight}`,
  paddingLeft: '12px',
});

const notesStyle = (isDarkMode: boolean) => mergeStyles({
  backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
  border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
  borderRadius: '8px',
  padding: '16px',
  fontSize: '14px',
  fontStyle: 'italic',
  color: isDarkMode ? colours.dark.text : colours.light.text,
  marginBottom: '20px',
  lineHeight: '1.5',
});

const conflictsGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '16px',
  marginBottom: '20px',
  '@media (max-width: 768px)': {
    gridTemplateColumns: '1fr',
  },
});

const conflictCardStyle = (isDarkMode: boolean) => mergeStyles({
  backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.sectionBackground,
  border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
  borderRadius: '8px',
  padding: '16px',
  textAlign: 'center',
  boxShadow: isDarkMode ? '0 2px 4px rgba(0, 0, 0, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.05)',
  transition: 'transform 0.2s ease',
  ':hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
  },
});

const actionButtonsStyle = mergeStyles({
  display: 'flex',
  gap: '16px',
  marginBottom: '16px',
  justifyContent: 'center',
  alignItems: 'center',
  '@media (max-width: 768px)': {
    flexDirection: 'column',
    gap: '12px',
  },
});

const statusBadgeStyle = (status: string, isDarkMode: boolean) => mergeStyles({
  padding: '4px 10px',
  borderRadius: 2,
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  backgroundColor: isDarkMode ? 'rgba(135, 243, 243, 0.10)' : 'rgba(54, 144, 206, 0.10)',
  color: isDarkMode ? colours.accent : colours.highlight,
  border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(54, 144, 206, 0.25)'}`,
});

const criticalInfoStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '16px',
  marginBottom: '20px',
  '@media (max-width: 768px)': {
    gridTemplateColumns: '1fr',
    gap: '12px',
  },
});

const infoCardStyle = (isDarkMode: boolean) => mergeStyles({
  backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.sectionBackground,
  border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
  borderRadius: '8px',
  padding: '16px',
  textAlign: 'center',
  transition: 'all 0.2s ease',
  ':hover': {
    backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
  },
});

const infoLabelStyle = (isDarkMode: boolean) => mergeStyles({
  fontSize: '12px',
  fontWeight: 600,
  color: isDarkMode ? colours.dark.subText : colours.greyText,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: '6px',
});

const infoValueStyle = (isDarkMode: boolean) => mergeStyles({
  fontSize: '16px',
  fontWeight: 700,
  color: isDarkMode ? colours.dark.text : colours.light.text,
});

const approveButtonStyle = (isDarkMode: boolean) => mergeStyles({
  backgroundColor: isDarkMode ? colours.dark.buttonBackground : colours.light.buttonBackground,
  borderColor: isDarkMode ? colours.dark.buttonBackground : colours.light.buttonBackground,
  color: isDarkMode ? colours.dark.buttonText : colours.light.buttonText,
  fontWeight: 600,
  padding: '8px 14px',
  borderRadius: '2px',
  transition: 'all 0.2s ease',
  borderWidth: '1px',
  selectors: {
    ':disabled': {
      backgroundColor: isDarkMode ? colours.dark.disabledBackground : colours.light.disabledBackground,
      borderColor: isDarkMode ? colours.dark.borderColor : colours.light.borderColor,
      color: isDarkMode ? 'rgba(243,244,246,0.6)' : 'rgba(6,23,51,0.55)',
      cursor: 'not-allowed',
    },
  },
  ':hover': {
    backgroundColor: isDarkMode ? colours.dark.hoverBackground : colours.light.hoverBackground,
    borderColor: isDarkMode ? colours.dark.hoverBackground : colours.light.hoverBackground,
  },
});

const rejectButtonStyle = (isDarkMode: boolean) => mergeStyles({
  backgroundColor: 'transparent',
  borderColor: isDarkMode ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
  color: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.75)',
  fontWeight: 600,
  padding: '8px 14px',
  borderRadius: '2px',
  transition: 'all 0.2s ease',
  selectors: {
    ':disabled': {
      borderColor: isDarkMode ? colours.dark.borderColor : colours.light.borderColor,
      color: isDarkMode ? 'rgba(243,244,246,0.6)' : 'rgba(6,23,51,0.55)',
      cursor: 'not-allowed',
    },
  },
  ':hover': {
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(148, 163, 184, 0.12)',
    borderColor: isDarkMode ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)',
  },
});

const rejectionNotesStyle = (isDarkMode: boolean) => mergeStyles({
  marginTop: '12px',
  '& .ms-TextField-fieldGroup': {
    borderRadius: '8px',
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
    ':focus-within': {
      borderColor: isDarkMode ? colours.accent : colours.highlight,
    },
  },
  '& .ms-TextField-field': {
    color: isDarkMode ? colours.dark.text : colours.light.text,
  },
});

/* ---------------------------------------------------------------------------
   Compact Layout Styles
--------------------------------------------------------------------------- */
const compactHeaderStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '12px',
  flexWrap: 'wrap',
});

const compactMetricsStyle = (isDarkMode: boolean) => mergeStyles({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  fontSize: 12,
  fontWeight: 600,
  color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.65)',
  marginBottom: 10,
});

const summaryLineStyle = (isDarkMode: boolean) => mergeStyles({
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  flexWrap: 'wrap',
});

const summaryKeyStyle = (isDarkMode: boolean) => mergeStyles({
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: isDarkMode ? 'rgba(226, 232, 240, 0.55)' : 'rgba(15, 23, 42, 0.55)',
});

const summaryValueStyle = (isDarkMode: boolean, isEmphasis?: boolean) => mergeStyles({
  fontSize: 12,
  fontWeight: isEmphasis ? 700 : 600,
  color: isEmphasis ? (isDarkMode ? colours.accent : colours.highlight) : (isDarkMode ? colours.dark.text : colours.light.text),
});

const compactActionsStyle = mergeStyles({
  display: 'flex',
  gap: '8px',
  marginTop: '12px',
  '@media (max-width: 768px)': {
    flexDirection: 'column',
  },
});

const rejectPanelStyle = (isDarkMode: boolean) => mergeStyles({
  marginTop: 8,
  padding: '10px 12px',
  borderRadius: 2,
  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'}`,
  backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.08)',
});

const rejectPanelActionsStyle = mergeStyles({
  display: 'flex',
  gap: 8,
  marginTop: 8,
  justifyContent: 'flex-end',
  '@media (max-width: 768px)': {
    flexDirection: 'column',
  },
});

const confirmRejectButtonStyle = (isDarkMode: boolean) => mergeStyles({
  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(148, 163, 184, 0.12)',
  borderColor: isDarkMode ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)',
  color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.85)',
  fontWeight: 700,
  padding: '8px 14px',
  borderRadius: 2,
  borderWidth: 1,
  transition: 'all 0.2s ease',
  selectors: {
    ':disabled': {
      backgroundColor: isDarkMode ? colours.dark.disabledBackground : colours.light.disabledBackground,
      borderColor: isDarkMode ? colours.dark.borderColor : colours.light.borderColor,
      color: isDarkMode ? 'rgba(243,244,246,0.6)' : 'rgba(6,23,51,0.55)',
      cursor: 'not-allowed',
    },
  },
  ':hover': {
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(148, 163, 184, 0.16)',
  },
});

const expandButtonStyle = (isDarkMode: boolean) => mergeStyles({
  background: 'transparent',
  border: 'none',
  color: colours.highlight,
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: '2px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.2s ease',
  ':hover': {
    backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
  },
});

const conflictsHintStyle = (isDarkMode: boolean, hasConflicts: boolean) => mergeStyles({
  fontSize: 12,
  fontWeight: 600,
  color: hasConflicts
    ? (isDarkMode ? 'rgba(226, 232, 240, 0.75)' : 'rgba(15, 23, 42, 0.7)')
    : (isDarkMode ? 'rgba(226, 232, 240, 0.55)' : 'rgba(15, 23, 42, 0.55)'),
});

/* ---------------------------------------------------------------------------
   Main Component
--------------------------------------------------------------------------- */
const AnnualLeaveApprovals: React.FC<AnnualLeaveApprovalsProps> = ({
  approvals,
  futureLeave,
  onClose,
  team,
  totals,
  allLeaveEntries,
  onApprovalUpdate,
  onShowToast,
}) => {
  const { isDarkMode } = useTheme();
  // Maintain a local copy so UI reflects changes immediately
  const [localApprovals, setLocalApprovals] = useState<ApprovalEntry[]>(approvals);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  
  // Track items being animated out (approved/rejected)
  const [animatingOut, setAnimatingOut] = useState<Set<string>>(new Set());
  const [animationStatus, setAnimationStatus] = useState<{ [id: string]: 'approved' | 'rejected' }>({});
  
  // Local toast state (fallback if parent doesn't provide onShowToast)
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }>>([]);
  
  // Helper to show toast - uses parent callback if available, otherwise local
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    if (onShowToast) {
      onShowToast(message, type);
    } else {
      const id = `toast-${Date.now()}`;
      setToasts(prev => [...prev, { id, message, type }]);
      // Auto-remove after 4 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
    }
  }, [onShowToast]);
  
  // Refs to store action handlers for each approval card
  const actionHandlersRef = useRef<Map<number, { approve: () => Promise<void>, reject: () => Promise<void> }>>(new Map());
  
  // Debug log the approvals being passed
  useEffect(() => {
    console.log('🏖️ Annual Leave Approvals Component Mounted:', {
      approvalsCount: approvals.length,
      futureLeaveCount: futureLeave.length,
      sampleApprovals: approvals.slice(0, 3).map(a => ({
        id: a.id,
        request_id: a.request_id,
        person: a.person,
        status: a.status,
        start_date: a.start_date,
        end_date: a.end_date
      }))
    });
    
    // Validate that all approvals have valid IDs
    const invalidApprovals = approvals.filter(a => !a.id || a.id === 'undefined' || a.id === '');
    if (invalidApprovals.length > 0) {
      console.error('⚠️ Found approvals with invalid IDs:', invalidApprovals);
    }
  }, [approvals, futureLeave]);
  
  useEffect(() => {
    setLocalApprovals(approvals);
  }, [approvals]);
  
  // Portal container element
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null);

  // Create and attach a dedicated container for the portal
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.setAttribute('data-annual-leave-modal', '');
    document.body.appendChild(el);
    setPortalEl(el);
    return () => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    };
  }, []);

  // Body scroll lock, ESC to close, and keyboard shortcuts
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Only handle keyboard shortcuts if we have approvals and not typing in a text field
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      if (localApprovals.length === 0 || isTyping) return;

      // Arrow keys to navigate between approvals
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, localApprovals.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
      }

      // Only allow approve/reject on pending requests
      const activeApproval = localApprovals[activeIndex];
      if (!activeApproval || activeApproval.status.toLowerCase() !== 'requested') return;

      // 'A' to approve current approval
      if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const handlers = actionHandlersRef.current.get(activeIndex);
        if (handlers) {
          handlers.approve();
        }
      }

      // 'R' to reject current approval (requires rejection reason)
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const handlers = actionHandlersRef.current.get(activeIndex);
        if (handlers) {
          handlers.reject();
        }
      }
    };
    
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, localApprovals, activeIndex]);

  const [rejectionReason, setRejectionReason] = useState<{ [id: string]: string }>({});
  const [processingStates, setProcessingStates] = useState<{ [id: string]: boolean }>({});

  const updateAnnualLeave = async (
    leaveId: string,
    newStatus: string,
    reason: string | null
  ): Promise<void> => {
    // Always call the Express server directly; CRA proxy handles dev, same-origin handles prod
    const url = `/api/attendance/updateAnnualLeave`;
    const payload = { id: leaveId, newStatus, rejection_notes: reason || '' };
    
    console.log('🔄 Annual Leave Update Request:', {
      url,
      payload,
      leaveId,
      newStatus,
      reason
    });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    console.log('📡 Annual Leave Update Response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Annual Leave Update Failed:', {
        status: response.status,
        statusText: response.statusText,
        errorText
      });
      throw new Error(`Update failed with status ${response.status}: ${response.statusText}. ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Annual Leave Update Success:', result);
  };

  function findTeamMember(person: string): TeamMember | undefined {
    const rawKey = (person || '').trim().toLowerCase();
    const key = rawKey.replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
    if (!key) return undefined;

    const keyStripped = key.replace(/[^a-z0-9 ]/g, '').trim();

    return team.find(m => {
      const initials = (m.Initials || '').trim().toLowerCase();
      const first = (m.First || '').trim().toLowerCase();
      const nickname = (m.Nickname || '').trim().toLowerCase();

      if (initials === key || first === key || nickname === key) return true;

      // Handle full-name strings like "bianca o'donnell" by matching the first token
      if (first && key.startsWith(first + ' ')) return true;
      if (nickname && key.startsWith(nickname + ' ')) return true;

      // Also try stripped punctuation comparison for common cases (odonnell vs o'donnell)
      const firstStripped = first.replace(/[^a-z0-9 ]/g, '').trim();
      const nicknameStripped = nickname.replace(/[^a-z0-9 ]/g, '').trim();
      if (firstStripped && keyStripped.startsWith(firstStripped + ' ')) return true;
      if (nicknameStripped && keyStripped.startsWith(nicknameStripped + ' ')) return true;

      return false;
    });
  }

  function getNickname(person: string): string {
    const member = findTeamMember(person);
    return member?.Nickname || member?.First || person;
  }

  function getEntitlement(person: string): number {
    const member = findTeamMember(person);
    return member?.holiday_entitlement ?? 20;
  }

  function normalizeDateKey(value: string): string {
    try {
      return format(new Date(value), 'yyyy-MM-dd');
    } catch {
      return value;
    }
  }

  function getAllConflicts(current: ApprovalEntry): ApprovalEntry[] {
    const start = new Date(current.start_date);
    const end = new Date(current.end_date);

    const conflictApprovals = localApprovals.filter(
      other =>
        other.id !== current.id &&
        other.person !== current.person &&
        new Date(other.end_date) >= start &&
        new Date(other.start_date) <= end
    );
    const conflictFuture = futureLeave.filter(
      other =>
        other.person !== current.person &&
        new Date(other.end_date) >= start &&
        new Date(other.start_date) <= end
    );
    return [...conflictApprovals, ...conflictFuture];
  }

  function formatDateRange(start: string, end: string): string {
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    if (startDate.getTime() === endDate.getTime()) {
      return format(startDate, 'EEEE, d MMMM yyyy');
    }
    
    return `${format(startDate, 'EEEE, d MMMM yyyy')} - ${format(endDate, 'EEEE, d MMMM yyyy')}`;
  }

  function calculateBusinessDays(start: string, end: string): number {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return eachDayOfInterval({ start: startDate, end: endDate }).filter(day => !isWeekend(day)).length;
  }

  const ApprovalCard: React.FC<{ entry: ApprovalEntry; isActive?: boolean; cardIndex?: number }> = ({ entry, isActive = false, cardIndex }) => {
    const [localRejection, setLocalRejection] = useState<string>(rejectionReason[entry.id] || '');
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const [isRejecting, setIsRejecting] = useState<boolean>(false);

    const requestDays = Number.isFinite(Number(entry.days_taken)) && Number(entry.days_taken) > 0
      ? Number(entry.days_taken)
      : calculateBusinessDays(entry.start_date, entry.end_date);
    const entitlement = getEntitlement(entry.person);
    const fyStartYear = getFiscalYearStart(new Date());

    const member = findTeamMember(entry.person);
    const personAliases = [entry.person, member?.Initials, member?.First, member?.Nickname].filter(Boolean) as string[];
    const personAliasSet = new Set(personAliases.map(normalizePersonKey));

    const entryRequestId = Number(entry.id);
    const hasNumericRequestId = Number.isFinite(entryRequestId);

    // Exclude the current request from "days used" (normalize dates to avoid string-format mismatches)
    const entryStartKey = normalizeDateKey(entry.start_date);
    const entryEndKey = normalizeDateKey(entry.end_date);
    const leaveEntriesExcludingCurrent = allLeaveEntries.filter(e => {
      if (!personAliasSet.has(normalizePersonKey(e.person))) return true;

      // Prefer excluding by request_id when available (safer than date matching)
      if (hasNumericRequestId && typeof e.request_id === 'number' && e.request_id === entryRequestId) {
        return false;
      }
      const startKey = normalizeDateKey(e.start_date);
      const endKey = normalizeDateKey(e.end_date);
      return startKey !== entryStartKey || endKey !== entryEndKey;
    });

    const breakdownSoFar = sumBookedApprovedDaysByTypeInFY(leaveEntriesExcludingCurrent, entry.person, fyStartYear, personAliases);
    const requestType = normalizeLeaveType((entry as unknown as { leave_type?: unknown })?.leave_type);
    const breakdownAfter: LeaveBreakdown = { ...breakdownSoFar };
    breakdownAfter[requestType] += requestDays;

    const standardUsedSoFar = breakdownSoFar.standard;
    const standardUsedAfter = breakdownAfter.standard;
    const standardRemainingAfter = entitlement - standardUsedAfter;
    
    const conflicts = getAllConflicts(entry);
    const isProcessing = processingStates[entry.id] || false;

    // Register action handlers for keyboard shortcuts
    useEffect(() => {
      if (cardIndex !== undefined) {
        actionHandlersRef.current.set(cardIndex, {
          approve: async () => {
            if (isProcessing) return;
            await handleAction('approve');
          },
          reject: async () => {
            if (isProcessing) return;
            if (!isRejecting) {
              setIsRejecting(true);
              showToast('Add a rejection reason, then confirm.', 'info');
              return;
            }
            if (!localRejection || localRejection.trim() === '') {
              showToast('Please provide a rejection reason', 'warning');
              return;
            }
            await handleAction('reject');
          }
        });
        return () => {
          actionHandlersRef.current.delete(cardIndex);
        };
      }
    }, [cardIndex, localRejection, isProcessing, isRejecting]);

    const handleAction = async (action: 'approve' | 'reject') => {
      if (isProcessing || animatingOut.has(entry.id)) return;

      if (action === 'reject' && (!localRejection || localRejection.trim() === '')) {
        showToast('Please provide a rejection reason', 'warning');
        return;
      }
      
      console.log('🎯 Annual Leave Action:', {
        action,
        entryId: entry.id,
        entryRequestId: entry.request_id,
        entryPerson: entry.person,
        entryStatus: entry.status,
        localRejection
      });
      
      // Validate that we have a valid ID
      if (!entry.id || entry.id === 'undefined' || entry.id === '') {
        console.error('❌ Invalid entry ID:', entry.id, 'Full entry:', entry);
        showToast('Error: Invalid leave request ID', 'error');
        return;
      }
      
      setProcessingStates(prev => ({ ...prev, [entry.id]: true }));
      
      try {
        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        const reason = action === 'reject' ? localRejection : null;
        
        // Validate rejection reason for rejections
        if (action === 'reject' && (!reason || reason.trim() === '')) {
          console.warn('❌ Rejection requires a reason');
          setIsExpanded(true);
          showToast('Please provide a rejection reason', 'warning');
          setProcessingStates(prev => ({ ...prev, [entry.id]: false }));
          return;
        }
        
        await updateAnnualLeave(entry.id, newStatus, reason);
        
        // Show success toast
        const personName = getNickname(entry.person);
        showToast(
          action === 'approve' 
            ? `✓ Approved ${requestDays} day${requestDays > 1 ? 's' : ''} leave for ${personName}` 
            : `✗ Rejected leave request from ${personName}`,
          action === 'approve' ? 'success' : 'info'
        );
        
        // Start animation
        setAnimatingOut(prev => new Set(prev).add(entry.id));
        setAnimationStatus(prev => ({ ...prev, [entry.id]: newStatus === 'approved' ? 'approved' : 'rejected' }));
        
        // After animation, remove from local state and notify parent
        setTimeout(() => {
          if (onApprovalUpdate) {
            onApprovalUpdate(entry.id, newStatus);
          }
          setLocalApprovals(prev => prev.filter(a => a.id !== entry.id));
          setAnimatingOut(prev => {
            const newSet = new Set(prev);
            newSet.delete(entry.id);
            return newSet;
          });
          
          // Adjust active index if needed
          setActiveIndex(prev => Math.min(prev, localApprovals.length - 2));
        }, 500);
        
      } catch (error) {
        console.error(`Failed to ${action} leave:`, error);
        showToast(`Failed to ${action} leave request. Please try again.`, 'error');
      } finally {
        setProcessingStates(prev => ({ ...prev, [entry.id]: false }));
      }
    };

    const openRejectPanel = () => {
      setIsRejecting(prev => !prev);
    };

    const confirmReject = async () => {
      if (isProcessing) return;
      if (!localRejection || localRejection.trim() === '') {
        showToast('Please provide a rejection reason', 'warning');
        return;
      }
      await handleAction('reject');
    };

    // Format compact date range
    const compactDateRange = (() => {
      const start = new Date(entry.start_date);
      const end = new Date(entry.end_date);
      if (start.getTime() === end.getTime()) {
        return format(start, 'd MMM yyyy');
      }
      if (start.getFullYear() === end.getFullYear()) {
        return `${format(start, 'd MMM')} - ${format(end, 'd MMM yyyy')}`;
      }
      return `${format(start, 'd MMM yyyy')} - ${format(end, 'd MMM yyyy')}`;
    })();
    
    // Check if this card is animating out
    const isAnimatingOut = animatingOut.has(entry.id);
    const cardAnimationStatus = animationStatus[entry.id];

    return (
      <div 
        className={compactCardStyle(isDarkMode, isExpanded)}
        style={{
          border: isAnimatingOut
            ? `2px solid ${cardAnimationStatus === 'approved' ? colours.green : colours.red}`
            : isActive
              ? `2px solid ${isDarkMode ? colours.accent : colours.highlight}`
              : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)'}`,
          boxShadow: isActive && !isAnimatingOut
            ? `0 0 0 2px ${isDarkMode ? `${colours.accent}30` : `${colours.highlight}30`}`
            : undefined,
          animation: isAnimatingOut 
            ? `${fadeOutAnimation} 0.5s ease-out forwards` 
            : cardAnimationStatus === 'approved'
              ? `${successPulseAnimation} 0.6s ease-out`
              : cardAnimationStatus === 'rejected'
                ? `${rejectPulseAnimation} 0.6s ease-out`
                : undefined,
          backgroundColor: isAnimatingOut
            ? (cardAnimationStatus === 'approved' 
                ? (isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)')
                : (isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'))
            : undefined,
          pointerEvents: isAnimatingOut ? 'none' : 'auto',
        }}
      >
        {/* Compact Header: Avatar + Name + Date + Quick Info */}
        <div className={compactHeaderStyle}>
          <Persona
            imageUrl={HelixAvatar}
            text={getNickname(entry.person)}
            size={PersonaSize.size32}
            styles={{ 
              primaryText: { 
                fontWeight: 600, 
                fontSize: '14px',
                color: isDarkMode ? colours.dark.text : colours.light.text
              } 
            }}
          />
          <div style={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <span style={{ 
              fontSize: '14px',
              fontWeight: 600,
              color: isDarkMode ? colours.dark.text : colours.light.text
            }}>
              {compactDateRange}
            </span>
            <span style={{
              fontSize: '13px',
              padding: '2px 8px',
              borderRadius: '2px',
              backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)',
              color: colours.highlight,
              fontWeight: 600
            }}>
              {requestDays} {requestDays === 1 ? 'day' : 'days'}
            </span>
          </div>
          {entry.status.toLowerCase() === 'requested' && (
            <div className={statusBadgeStyle('requested', isDarkMode)}>Pending</div>
          )}
        </div>

        {/* Compact Metrics Row */}
        <div className={compactMetricsStyle(isDarkMode)}>
          <div className={summaryLineStyle(isDarkMode)}>
            <span className={summaryKeyStyle(isDarkMode)}>Standard</span>
            <span className={summaryValueStyle(isDarkMode)}>{formatDays(standardUsedSoFar)}/{formatDays(entitlement)}</span>
            <span style={{ opacity: 0.6 }}>·</span>
            <span className={summaryKeyStyle(isDarkMode)}>Bought</span>
            <span className={summaryValueStyle(isDarkMode)}>{formatDays(breakdownSoFar.purchase)}</span>
            <span style={{ opacity: 0.6 }}>·</span>
            <span className={summaryKeyStyle(isDarkMode)}>Sold</span>
            <span className={summaryValueStyle(isDarkMode)}>{formatDays(breakdownSoFar.sale)}</span>
            <span style={{ opacity: 0.6 }}>·</span>
            <span className={summaryKeyStyle(isDarkMode)}>After</span>
            <span className={summaryValueStyle(isDarkMode, true)}>{formatDays(standardRemainingAfter)} left</span>
            <span style={{ opacity: 0.6 }}>·</span>
            <span className={conflictsHintStyle(isDarkMode, conflicts.length > 0)}>
              {conflicts.length === 0
                ? 'No conflicts'
                : `${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}`}
            </span>
          </div>
          {!isExpanded && (entry.reason?.trim() || entry.hearing_confirmation !== undefined) && (
            <button 
              className={expandButtonStyle(isDarkMode)}
              onClick={() => setIsExpanded(true)}
            >
              View details ▼
            </button>
          )}
          {isExpanded && (
            <button 
              className={expandButtonStyle(isDarkMode)}
              onClick={() => setIsExpanded(false)}
            >
              Hide details ▲
            </button>
          )}
        </div>

        {/* Expanded Details Section */}
        {isExpanded && (
          <div style={{ 
            marginTop: '16px', 
            paddingTop: '16px',
            borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`
          }}>
            {/* Notes */}
            {entry.reason?.trim() && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ 
                  fontSize: '12px', 
                  fontWeight: 600,
                  color: isDarkMode ? colours.dark.subText : colours.greyText,
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Request Notes
                </div>
                <div style={{
                  padding: '10px 12px',
                  borderRadius: '2px',
                  backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(148, 163, 184, 0.08)',
                  border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.14)' : 'rgba(148, 163, 184, 0.22)'}`,
                  fontSize: '13px',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  lineHeight: 1.4
                }}>
                  {entry.reason}
                </div>
              </div>
            )}

            {/* Hearing Info */}
            {entry.hearing_confirmation !== undefined && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ 
                  fontSize: '12px', 
                  fontWeight: 600,
                  color: isDarkMode ? colours.dark.subText : colours.greyText,
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Hearing Status
                </div>
                <div style={{
                  padding: '12px',
                  borderRadius: '2px',
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                  fontSize: '13px',
                  color: isDarkMode ? colours.dark.text : colours.light.text
                }}>
                  {(() => {
                    const hc = entry.hearing_confirmation;
                    if (typeof hc === 'boolean') {
                      return hc ? '✓ No hearings during absence' : '⚠ Hearings may be affected';
                    }
                    if (typeof hc === 'string') {
                      const lower = hc.trim().toLowerCase();
                      if (lower === 'yes') return '✓ No hearings during absence';
                      if (lower === 'no') return '⚠ Hearings may be affected';
                      return hc.trim();
                    }
                    return 'Not specified';
                  })()}
                  {entry.hearing_details && (
                    <div style={{ marginTop: '8px', opacity: 0.8 }}>
                      <strong>Details:</strong> {entry.hearing_details}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Team Conflicts - Only show in expanded view */}
            {conflicts.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ 
                  fontSize: '12px', 
                  fontWeight: 600,
                  color: isDarkMode ? colours.dark.subText : colours.greyText,
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Team Conflicts ({conflicts.length})
                </div>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: '8px'
                }}>
                  {conflicts.map((conflict, idx) => (
                    <div key={idx} style={{
                      padding: '8px',
                      borderRadius: '2px',
                      backgroundColor: isDarkMode ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.08)',
                      border: `1px solid ${isDarkMode ? 'rgba(251, 191, 36, 0.3)' : 'rgba(251, 191, 36, 0.2)'}`,
                      fontSize: '12px'
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                        {getNickname(conflict.person)}
                      </div>
                      <div style={{ fontSize: '11px', opacity: 0.8 }}>
                        {format(new Date(conflict.start_date), 'd MMM')} - {format(new Date(conflict.end_date), 'd MMM')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Compact Action Buttons */}
        {entry.status.toLowerCase() === 'requested' && (
          <div style={{ marginTop: 12 }}>
            <div className={compactActionsStyle}>
              <DefaultButton
                text={isProcessing ? 'Processing...' : '✓ Approve'}
                onClick={() => handleAction('approve')}
                disabled={isProcessing}
                className={approveButtonStyle(isDarkMode)}
                style={{ flex: 1 }}
              />
              <DefaultButton
                text={isProcessing ? 'Processing...' : 'Reject'}
                onClick={openRejectPanel}
                disabled={isProcessing}
                className={rejectButtonStyle(isDarkMode)}
                style={{ flex: 1 }}
              />
            </div>

            {isRejecting && (
              <div className={rejectPanelStyle(isDarkMode)}>
                <TextField
                  placeholder="Rejection reason (required)"
                  value={localRejection}
                  onChange={(e, val) => setLocalRejection(val || '')}
                  multiline
                  rows={2}
                  styles={{
                    root: { width: '100%' },
                    fieldGroup: {
                      borderRadius: 2,
                      border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                      backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                    },
                    field: {
                      fontSize: '13px',
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                    }
                  }}
                />
                <div className={rejectPanelActionsStyle}>
                  <DefaultButton
                    text="Cancel"
                    onClick={() => setIsRejecting(false)}
                    disabled={isProcessing}
                    className={rejectButtonStyle(isDarkMode)}
                  />
                  <DefaultButton
                    text={isProcessing ? 'Processing...' : 'Confirm reject'}
                    onClick={confirmReject}
                    disabled={isProcessing}
                    className={confirmRejectButtonStyle(isDarkMode)}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Count of pending (non-animating) approvals
  const pendingCount = localApprovals.filter(a => !animatingOut.has(a.id)).length;

  const modalJsx = (
    <div 
      className={formContainerStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className={toastContainerStyle}>
          {toasts.map(toast => (
            <MessageBar
              key={toast.id}
              messageBarType={
                toast.type === 'success' ? MessageBarType.success :
                toast.type === 'error' ? MessageBarType.error :
                toast.type === 'warning' ? MessageBarType.warning :
                MessageBarType.info
              }
              isMultiline={false}
              onDismiss={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              dismissButtonAriaLabel="Close"
              styles={{
                root: {
                  borderRadius: '2px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                }
              }}
            >
              {toast.message}
            </MessageBar>
          ))}
        </div>
      )}
      
      {/* Modal Content */}
      <div className={modalContentStyle(isDarkMode)} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={modalHeaderStyle(isDarkMode)}>
          <div>
            <div style={{
              fontSize: 15,
              fontWeight: 600,
              color: isDarkMode ? colours.dark.text : colours.light.text,
            }}>
              Annual Leave Approvals
            </div>
            <div style={{
              fontSize: 12,
              marginTop: 2,
              color: isDarkMode ? colours.dark.subText : colours.greyText,
            }}>
              {pendingCount === 0
                ? 'No pending requests'
                : `${pendingCount} request${pendingCount !== 1 ? 's' : ''} require${pendingCount === 1 ? 's' : ''} your review`}
            </div>
          </div>
          <IconButton
            iconProps={{ iconName: 'Cancel' }}
            ariaLabel="Close"
            onClick={onClose}
            styles={{
              root: { color: isDarkMode ? colours.dark.subText : colours.greyText },
              rootHovered: { background: 'transparent', color: isDarkMode ? colours.dark.text : colours.light.text },
            }}
          />
        </div>

        <div className={modalBodyStyle}>

        {pendingCount === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px 20px',
            fontSize: '18px',
            color: isDarkMode ? colours.dark.text : colours.greyText
          }}>
            <FaUmbrellaBeach style={{ fontSize: '48px', marginBottom: '16px', color: colours.green }} />
            <div>All done</div>
            <div style={{ fontSize: '14px', marginTop: '8px' }}>
              All annual leave requests have been processed.
            </div>
            <DefaultButton
              text="Close"
              onClick={onClose}
              styles={{
                root: {
                  marginTop: '20px',
                  borderRadius: '2px',
                }
              }}
            />
          </div>
        ) : (
          <Stack tokens={{ childrenGap: 24 }}>
            {localApprovals.map((entry, index) => (
              <ApprovalCard 
                key={entry.id || entry.request_id || `${entry.person}-${entry.start_date}`} 
                entry={entry} 
                isActive={index === activeIndex}
                cardIndex={index}
              />
            ))}
            
            {/* Keyboard shortcuts hint removed (kept shortcuts) */}
          </Stack>
        )}
        </div>
      </div>
    </div>
  );
  
  // Render inline until portal is ready, then via portal
  if (!portalEl) return modalJsx;
  return createPortal(modalJsx, portalEl);
};

export default AnnualLeaveApprovals;