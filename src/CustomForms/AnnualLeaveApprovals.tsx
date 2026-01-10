import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Stack,
  Text,
  Persona,
  PersonaSize,
  TextField,
  MessageBar,
  MessageBarType,
} from '@fluentui/react';
import { mergeStyles, keyframes } from '@fluentui/react';
import { eachDayOfInterval, isWeekend, format, parseISO, isValid } from 'date-fns';
import { colours } from '../app/styles/colours';
import { useTheme } from '../app/functionality/ThemeContext';
import BespokePanel from '../app/functionality/BespokePanel';
import HelixAvatar from '../assets/helix avatar.png';
import { FaUmbrellaBeach, FaCalendarAlt, FaUserFriends, FaChevronDown, FaChevronUp, FaCheck, FaTimes } from 'react-icons/fa';

/* ---------------------------------------------------------------------------
   Safe Date Parsing Helper
   Handles various date formats from API: ISO strings, date-only strings, etc.
--------------------------------------------------------------------------- */
function safeParseDate(value: string | Date | null | undefined): Date {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return value;
  
  // Handle ISO strings with time (e.g., "2026-01-15T00:00:00.000Z")
  if (typeof value === 'string') {
    // Try parseISO first for ISO format strings
    const parsed = parseISO(value);
    if (isValid(parsed)) return parsed;
    
    // Fallback to Date constructor
    const fallback = new Date(value);
    if (isValid(fallback)) return fallback;
  }
  
  return new Date(NaN);
}

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
  const aprilFirst = new Date(year, 3, 1);
  return date >= aprilFirst ? year : year - 1;
}

function isDateInFiscalYear(date: Date, fyStartYear: number): boolean {
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
  const startDate = safeParseDate(entry.start_date);
  const endDate = safeParseDate(entry.end_date);
  if (!isValid(startDate) || !isValid(endDate)) return 0;

  const intervalStart = startDate <= endDate ? startDate : endDate;
  const intervalEnd = startDate <= endDate ? endDate : startDate;

  const fyStart = new Date(fyStartYear, 3, 1);
  const fyEnd = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999);

  if (!isDateInFiscalYear(intervalStart, fyStartYear) && !isDateInFiscalYear(intervalEnd, fyStartYear)) {
    return 0;
  }

  const overlapStart = intervalStart > fyStart ? intervalStart : fyStart;
  const overlapEnd = intervalEnd < fyEnd ? intervalEnd : fyEnd;
  if (overlapStart > overlapEnd) return 0;

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
   Animation Keyframes
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

const slideIn = keyframes({
  '0%': { opacity: 0, transform: 'translateY(8px)' },
  '100%': { opacity: 1, transform: 'translateY(0)' }
});

/* ---------------------------------------------------------------------------
   Styled Components
--------------------------------------------------------------------------- */
const getCardStyle = (isDarkMode: boolean, isActive: boolean, isAnimatingOut: boolean, animationStatus?: 'approved' | 'rejected') => 
  mergeStyles({
    background: isDarkMode
      ? 'linear-gradient(135deg, rgba(10, 16, 30, 0.95) 0%, rgba(18, 26, 42, 0.92) 100%)'
      : 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.95) 100%)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '8px',
    border: isAnimatingOut
      ? `2px solid ${animationStatus === 'approved' ? colours.green : colours.red}`
      : isActive
        ? `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.5)' : 'rgba(54, 144, 206, 0.4)'}`
        : `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(148, 163, 184, 0.15)'}`,
    boxShadow: isActive && !isAnimatingOut
      ? isDarkMode
        ? '0 4px 20px rgba(54, 144, 206, 0.15), 0 1px 6px rgba(0,0,0,0.2)'
        : '0 4px 20px rgba(54, 144, 206, 0.1), 0 1px 6px rgba(0,0,0,0.03)'
      : isDarkMode
        ? '0 2px 12px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15)'
        : '0 2px 12px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.02)',
    padding: 0,
    overflow: 'hidden',
    transition: 'all 0.2s ease',
    animation: isAnimatingOut 
      ? `${fadeOutAnimation} 0.5s ease-out forwards` 
      : `${slideIn} 0.3s ease-out`,
    backgroundColor: isAnimatingOut
      ? (animationStatus === 'approved' 
          ? (isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)')
          : (isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'))
      : undefined,
    pointerEvents: isAnimatingOut ? 'none' : 'auto',
    ':hover': {
      borderColor: isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.25)',
      boxShadow: isDarkMode
        ? '0 4px 20px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)'
        : '0 4px 20px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03)',
    },
  });

const getCardHeaderStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '16px 20px',
    background: isDarkMode
      ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.6) 0%, rgba(11, 30, 55, 0.5) 100%)'
      : 'linear-gradient(135deg, rgba(248, 250, 252, 0.8) 0%, rgba(241, 245, 249, 0.7) 100%)',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(148, 163, 184, 0.12)'}`,
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  });

const getCardBodyStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '16px 20px',
  });

const getMetricPillStyle = (isDarkMode: boolean, isAccent?: boolean) =>
  mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: isAccent
      ? (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)')
      : (isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.1)'),
    color: isAccent
      ? colours.highlight
      : (isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.75)'),
    border: `1px solid ${isAccent 
      ? (isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)')
      : 'transparent'}`,
  });

const getStatRowStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 16px',
    borderRadius: '6px',
    backgroundColor: isDarkMode ? 'rgba(2, 6, 23, 0.35)' : 'rgba(248, 250, 252, 0.85)',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(15, 23, 42, 0.06)'}`,
    flexWrap: 'wrap' as const,
  });

const getStatItemStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    minWidth: '60px',
  });

const getStatLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.8)',
  });

const getStatValueStyle = (isDarkMode: boolean, isHighlight?: boolean) =>
  mergeStyles({
    fontSize: '14px',
    fontWeight: 700,
    color: isHighlight 
      ? colours.highlight 
      : (isDarkMode ? colours.dark.text : colours.light.text),
  });

const getExpandButtonStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    color: colours.highlight,
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    ':hover': {
      backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
    },
  });

const getActionButtonStyle = (isDarkMode: boolean, variant: 'primary' | 'secondary') =>
  mergeStyles({
    flex: 1,
    minWidth: '120px',
    padding: '10px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    border: variant === 'primary'
      ? 'none'
      : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(15, 23, 42, 0.15)'}`,
    backgroundColor: variant === 'primary'
      ? (isDarkMode ? colours.highlight : colours.highlight)
      : 'transparent',
    color: variant === 'primary'
      ? '#ffffff'
      : (isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.75)'),
    ':hover': {
      backgroundColor: variant === 'primary'
        ? (isDarkMode ? '#2d7bb8' : '#2d7bb8')
        : (isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(15, 23, 42, 0.05)'),
      transform: 'translateY(-1px)',
      boxShadow: variant === 'primary'
        ? '0 4px 12px rgba(54, 144, 206, 0.3)'
        : 'none',
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
      transform: 'none',
    },
  });

const getRejectPanelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    marginTop: '12px',
    padding: '16px',
    borderRadius: '6px',
    backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)',
    border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)'}`,
    animation: `${slideIn} 0.2s ease-out`,
  });

const getConflictBadgeStyle = (isDarkMode: boolean, hasConflicts: boolean) =>
  mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: hasConflicts
      ? (isDarkMode ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.12)')
      : (isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.12)'),
    color: hasConflicts
      ? (isDarkMode ? '#fbbf24' : '#d97706')
      : (isDarkMode ? '#22c55e' : '#16a34a'),
    border: `1px solid ${hasConflicts
      ? (isDarkMode ? 'rgba(251, 191, 36, 0.25)' : 'rgba(251, 191, 36, 0.2)')
      : (isDarkMode ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.2)')}`,
  });

const getDetailsSectionStyle = (isDarkMode: boolean) =>
  mergeStyles({
    marginTop: '16px',
    padding: '16px',
    borderRadius: '6px',
    backgroundColor: isDarkMode ? 'rgba(2, 6, 23, 0.4)' : 'rgba(248, 250, 252, 0.9)',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(15, 23, 42, 0.06)'}`,
    animation: `${slideIn} 0.2s ease-out`,
  });

const getDetailsLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.85)',
    marginBottom: '8px',
  });

const getDetailsContentStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: '13px',
    lineHeight: 1.5,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    padding: '10px 12px',
    borderRadius: '4px',
    backgroundColor: isDarkMode ? 'rgba(7, 16, 32, 0.5)' : 'rgba(255, 255, 255, 0.8)',
    border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(148, 163, 184, 0.12)'}`,
  });

const getEmptyStateStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    textAlign: 'center',
  });

const getToastContainerStyle = () =>
  mergeStyles({
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: 2147483001,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxWidth: '400px',
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
  const [localApprovals, setLocalApprovals] = useState<ApprovalEntry[]>(approvals);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [animatingOut, setAnimatingOut] = useState<Set<string>>(new Set());
  const [animationStatus, setAnimationStatus] = useState<{ [id: string]: 'approved' | 'rejected' }>({});
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }>>([]);
  const [rejectionReason, setRejectionReason] = useState<{ [id: string]: string }>({});
  const [processingStates, setProcessingStates] = useState<{ [id: string]: boolean }>({});

  const actionHandlersRef = useRef<Map<number, { approve: () => Promise<void>, reject: () => Promise<void> }>>(new Map());

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    if (onShowToast) {
      onShowToast(message, type);
    } else {
      const id = `toast-${Date.now()}`;
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
    }
  }, [onShowToast]);

  useEffect(() => {
    setLocalApprovals(approvals);
  }, [approvals]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      if (localApprovals.length === 0 || isTyping) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, localApprovals.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
      }

      const activeApproval = localApprovals[activeIndex];
      if (!activeApproval || activeApproval.status.toLowerCase() !== 'requested') return;

      if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const handlers = actionHandlersRef.current.get(activeIndex);
        if (handlers) handlers.approve();
      }

      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const handlers = actionHandlersRef.current.get(activeIndex);
        if (handlers) handlers.reject();
      }
    };
    
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [localApprovals, activeIndex]);

  const updateAnnualLeave = async (
    leaveId: string,
    newStatus: string,
    reason: string | null
  ): Promise<void> => {
    const url = `/api/attendance/updateAnnualLeave`;
    const payload = { id: leaveId, newStatus, rejection_notes: reason || '' };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Update failed with status ${response.status}: ${response.statusText}. ${errorText}`);
    }
  };

  function findTeamMember(person: string): TeamMember | undefined {
    const rawKey = (person || '').trim().toLowerCase();
    const key = rawKey.replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
    if (!key) return undefined;

    const keyStripped = key.replace(/[^a-z0-9 ]/g, '').trim();

    return team.find(m => {
      const initials = (m.Initials || '').trim().toLowerCase();
      const first = (m.First || '').trim().toLowerCase();
      const nickname = (m.Nickname || '').trim().toLowerCase();

      if (initials === key || first === key || nickname === key) return true;
      if (first && key.startsWith(first + ' ')) return true;
      if (nickname && key.startsWith(nickname + ' ')) return true;

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
    const parsed = safeParseDate(value);
    if (!isValid(parsed)) return value;
    return format(parsed, 'yyyy-MM-dd');
  }

  function getAllConflicts(current: ApprovalEntry): ApprovalEntry[] {
    const start = safeParseDate(current.start_date);
    const end = safeParseDate(current.end_date);
    if (!isValid(start) || !isValid(end)) return [];

    const conflictApprovals = localApprovals.filter(
      other =>
        other.id !== current.id &&
        other.person !== current.person &&
        safeParseDate(other.end_date) >= start &&
        safeParseDate(other.start_date) <= end
    );
    const conflictFuture = futureLeave.filter(
      other =>
        other.person !== current.person &&
        safeParseDate(other.end_date) >= start &&
        safeParseDate(other.start_date) <= end
    );
    return [...conflictApprovals, ...conflictFuture];
  }

  function calculateBusinessDays(start: string, end: string): number {
    const startDate = safeParseDate(start);
    const endDate = safeParseDate(end);
    if (!isValid(startDate) || !isValid(endDate)) return 0;
    return eachDayOfInterval({ start: startDate, end: endDate }).filter(day => !isWeekend(day)).length;
  }

  /* ---------------------------------------------------------------------------
     Approval Card Component
  --------------------------------------------------------------------------- */
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

    const entryStartKey = normalizeDateKey(entry.start_date);
    const entryEndKey = normalizeDateKey(entry.end_date);
    const leaveEntriesExcludingCurrent = allLeaveEntries.filter(e => {
      if (!personAliasSet.has(normalizePersonKey(e.person))) return true;
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
    const isAnimatingOut = animatingOut.has(entry.id);
    const cardAnimationStatus = animationStatus[entry.id];

    // Format date range with safe parsing
    const compactDateRange = (() => {
      const start = safeParseDate(entry.start_date);
      const end = safeParseDate(entry.end_date);
      
      // If dates are invalid, show raw values or placeholder
      if (!isValid(start) || !isValid(end)) {
        return entry.start_date && entry.end_date 
          ? `${entry.start_date} – ${entry.end_date}` 
          : 'Date not available';
      }
      
      if (start.getTime() === end.getTime()) {
        return format(start, 'EEE, d MMM yyyy');
      }
      if (start.getFullYear() === end.getFullYear()) {
        return `${format(start, 'EEE, d MMM')} – ${format(end, 'EEE, d MMM yyyy')}`;
      }
      return `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
    })();

    // Register keyboard handlers
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
      
      if (!entry.id || entry.id === 'undefined' || entry.id === '') {
        showToast('Error: Invalid leave request ID', 'error');
        return;
      }
      
      setProcessingStates(prev => ({ ...prev, [entry.id]: true }));
      
      try {
        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        const reason = action === 'reject' ? localRejection : null;
        
        await updateAnnualLeave(entry.id, newStatus, reason);
        
        const personName = getNickname(entry.person);
        showToast(
          action === 'approve' 
            ? `✓ Approved ${requestDays} day${requestDays > 1 ? 's' : ''} leave for ${personName}` 
            : `✗ Rejected leave request from ${personName}`,
          action === 'approve' ? 'success' : 'info'
        );
        
        setAnimatingOut(prev => new Set(prev).add(entry.id));
        setAnimationStatus(prev => ({ ...prev, [entry.id]: newStatus === 'approved' ? 'approved' : 'rejected' }));
        
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
          setActiveIndex(prev => Math.min(prev, localApprovals.length - 2));
        }, 500);
        
      } catch (error) {
        console.error(`Failed to ${action} leave:`, error);
        showToast(`Failed to ${action} leave request. Please try again.`, 'error');
      } finally {
        setProcessingStates(prev => ({ ...prev, [entry.id]: false }));
      }
    };

    return (
      <div className={getCardStyle(isDarkMode, isActive, isAnimatingOut, cardAnimationStatus)}>
        {/* Card Header */}
        <div className={getCardHeaderStyle(isDarkMode)}>
          <Persona
            imageUrl={HelixAvatar}
            text={getNickname(entry.person)}
            size={PersonaSize.size40}
            styles={{ 
              primaryText: { 
                fontWeight: 600, 
                fontSize: '15px',
                color: isDarkMode ? colours.dark.text : colours.light.text
              } 
            }}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ 
                fontSize: '14px',
                fontWeight: 600,
                color: isDarkMode ? colours.dark.text : colours.light.text,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <FaCalendarAlt style={{ fontSize: '12px', opacity: 0.7 }} />
                {compactDateRange}
              </span>
              <span className={getMetricPillStyle(isDarkMode, true)}>
                {requestDays} {requestDays === 1 ? 'day' : 'days'}
              </span>
              <span className={getConflictBadgeStyle(isDarkMode, conflicts.length > 0)}>
                <FaUserFriends style={{ fontSize: '10px' }} />
                {conflicts.length === 0 ? 'No conflicts' : `${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}`}
              </span>
            </div>
          </div>
          {entry.status.toLowerCase() === 'requested' && (
            <span className={getMetricPillStyle(isDarkMode)}>
              Pending
            </span>
          )}
        </div>

        {/* Card Body */}
        <div className={getCardBodyStyle(isDarkMode)}>
          {/* Leave Balance Stats */}
          <div className={getStatRowStyle(isDarkMode)}>
            <div className={getStatItemStyle(isDarkMode)}>
              <span className={getStatLabelStyle(isDarkMode)}>Used</span>
              <span className={getStatValueStyle(isDarkMode)}>{formatDays(standardUsedSoFar)}/{formatDays(entitlement)}</span>
            </div>
            <div style={{ 
              width: '1px', 
              height: '24px', 
              backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.1)' 
            }} />
            <div className={getStatItemStyle(isDarkMode)}>
              <span className={getStatLabelStyle(isDarkMode)}>Bought</span>
              <span className={getStatValueStyle(isDarkMode)}>{formatDays(breakdownSoFar.purchase)}</span>
            </div>
            <div style={{ 
              width: '1px', 
              height: '24px', 
              backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.1)' 
            }} />
            <div className={getStatItemStyle(isDarkMode)}>
              <span className={getStatLabelStyle(isDarkMode)}>Sold</span>
              <span className={getStatValueStyle(isDarkMode)}>{formatDays(breakdownSoFar.sale)}</span>
            </div>
            <div style={{ 
              width: '1px', 
              height: '24px', 
              backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.1)' 
            }} />
            <div className={getStatItemStyle(isDarkMode)}>
              <span className={getStatLabelStyle(isDarkMode)}>After</span>
              <span className={getStatValueStyle(isDarkMode, true)}>{formatDays(standardRemainingAfter)} left</span>
            </div>
            
            <div style={{ flex: 1 }} />
            
            {(entry.reason?.trim() || entry.hearing_confirmation !== undefined || conflicts.length > 0) && (
              <button 
                className={getExpandButtonStyle(isDarkMode)}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? 'Hide details' : 'View details'}
                {isExpanded ? <FaChevronUp style={{ fontSize: '10px' }} /> : <FaChevronDown style={{ fontSize: '10px' }} />}
              </button>
            )}
          </div>

          {/* Expanded Details */}
          {isExpanded && (
            <div className={getDetailsSectionStyle(isDarkMode)}>
              <Stack tokens={{ childrenGap: 16 }}>
                {entry.reason?.trim() && (
                  <div>
                    <div className={getDetailsLabelStyle(isDarkMode)}>Request Notes</div>
                    <div className={getDetailsContentStyle(isDarkMode)}>{entry.reason}</div>
                  </div>
                )}

                {entry.hearing_confirmation !== undefined && (
                  <div>
                    <div className={getDetailsLabelStyle(isDarkMode)}>Hearing Status</div>
                    <div className={getDetailsContentStyle(isDarkMode)}>
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
                        <div style={{ marginTop: '8px', opacity: 0.85 }}>
                          <strong>Details:</strong> {entry.hearing_details}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {conflicts.length > 0 && (
                  <div>
                    <div className={getDetailsLabelStyle(isDarkMode)}>Team Conflicts ({conflicts.length})</div>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                      gap: '8px'
                    }}>
                      {conflicts.map((conflict, idx) => (
                        <div key={idx} style={{
                          padding: '10px 12px',
                          borderRadius: '6px',
                          backgroundColor: isDarkMode ? 'rgba(251, 191, 36, 0.08)' : 'rgba(251, 191, 36, 0.06)',
                          border: `1px solid ${isDarkMode ? 'rgba(251, 191, 36, 0.2)' : 'rgba(251, 191, 36, 0.15)'}`,
                        }}>
                          <div style={{ 
                            fontWeight: 600, 
                            marginBottom: '4px',
                            fontSize: '13px',
                            color: isDarkMode ? colours.dark.text : colours.light.text
                          }}>
                            {getNickname(conflict.person)}
                          </div>
                          <div style={{ 
                            fontSize: '11px', 
                            opacity: 0.75,
                            color: isDarkMode ? colours.dark.text : colours.light.text
                          }}>
                            {(() => {
                              const cStart = safeParseDate(conflict.start_date);
                              const cEnd = safeParseDate(conflict.end_date);
                              if (!isValid(cStart) || !isValid(cEnd)) return 'Dates unavailable';
                              return `${format(cStart, 'd MMM')} – ${format(cEnd, 'd MMM')}`;
                            })()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Stack>
            </div>
          )}

          {/* Action Buttons */}
          {entry.status.toLowerCase() === 'requested' && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  className={getActionButtonStyle(isDarkMode, 'primary')}
                  onClick={() => handleAction('approve')}
                  disabled={isProcessing}
                >
                  <FaCheck style={{ fontSize: '12px' }} />
                  {isProcessing ? 'Processing...' : 'Approve'}
                </button>
                <button
                  className={getActionButtonStyle(isDarkMode, 'secondary')}
                  onClick={() => setIsRejecting(!isRejecting)}
                  disabled={isProcessing}
                >
                  <FaTimes style={{ fontSize: '12px' }} />
                  {isProcessing ? 'Processing...' : 'Reject'}
                </button>
              </div>

              {isRejecting && (
                <div className={getRejectPanelStyle(isDarkMode)}>
                  <TextField
                    placeholder="Rejection reason (required)"
                    value={localRejection}
                    onChange={(e, val) => setLocalRejection(val || '')}
                    multiline
                    rows={2}
                    styles={{
                      root: { width: '100%' },
                      fieldGroup: {
                        borderRadius: '6px',
                        border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.25)'}`,
                        backgroundColor: isDarkMode ? 'rgba(7, 16, 32, 0.6)' : 'rgba(255, 255, 255, 0.9)',
                      },
                      field: {
                        fontSize: '13px',
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                      }
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
                    <button
                      className={getActionButtonStyle(isDarkMode, 'secondary')}
                      onClick={() => setIsRejecting(false)}
                      disabled={isProcessing}
                      style={{ flex: 'none', minWidth: '80px' }}
                    >
                      Cancel
                    </button>
                    <button
                      className={getActionButtonStyle(isDarkMode, 'secondary')}
                      onClick={() => handleAction('reject')}
                      disabled={isProcessing || !localRejection.trim()}
                      style={{ 
                        flex: 'none', 
                        minWidth: '120px',
                        borderColor: isDarkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)',
                        color: isDarkMode ? '#f87171' : '#dc2626',
                      }}
                    >
                      {isProcessing ? 'Processing...' : 'Confirm Reject'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const pendingCount = localApprovals.filter(a => !animatingOut.has(a.id)).length;

  return (
    <>
      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className={getToastContainerStyle()}>
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
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                }
              }}
            >
              {toast.message}
            </MessageBar>
          ))}
        </div>
      )}

      <BespokePanel
        isOpen={true}
        onClose={onClose}
        title="Annual Leave Approvals"
        description={
          pendingCount === 0
            ? 'No pending requests'
            : `${pendingCount} request${pendingCount !== 1 ? 's' : ''} require${pendingCount === 1 ? 's' : ''} your review`
        }
        isDarkMode={isDarkMode}
        variant="modal"
        width="min(900px, 95vw)"
        icon={FaUmbrellaBeach}
      >
        {pendingCount === 0 ? (
          <div className={getEmptyStateStyle(isDarkMode)}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              backgroundColor: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px'
            }}>
              <FaUmbrellaBeach style={{ 
                fontSize: '36px', 
                color: colours.green 
              }} />
            </div>
            <Text variant="xLarge" styles={{ 
              root: { 
                fontWeight: 600, 
                color: isDarkMode ? colours.dark.text : colours.light.text,
                marginBottom: '8px'
              } 
            }}>
              All done!
            </Text>
            <Text variant="medium" styles={{ 
              root: { 
                color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.9)',
                marginBottom: '24px'
              } 
            }}>
              All annual leave requests have been processed.
            </Text>
            <button
              className={getActionButtonStyle(isDarkMode, 'primary')}
              onClick={onClose}
              style={{ minWidth: '120px' }}
            >
              Close
            </button>
          </div>
        ) : (
          <Stack tokens={{ childrenGap: 16 }}>
            {localApprovals.map((entry, index) => (
              <ApprovalCard 
                key={entry.id || entry.request_id || `${entry.person}-${entry.start_date}`} 
                entry={entry} 
                isActive={index === activeIndex}
                cardIndex={index}
              />
            ))}
          </Stack>
        )}
      </BespokePanel>
    </>
  );
};

export default AnnualLeaveApprovals;
