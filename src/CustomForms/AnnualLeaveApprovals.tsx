import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Stack,
  Text,
  DefaultButton,
  Persona,
  PersonaSize,
  TextField
} from '@fluentui/react';
import { mergeStyles } from '@fluentui/react';
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

function sumBookedAndRequestedDaysInFY(
  allLeaveEntries: LeaveEntry[],
  person: string,
  fyStartYear: number
): number {
  let totalDays = 0;

  allLeaveEntries
    .filter(entry => entry.person === person)
    .filter(entry => 
      entry.status && 
      (entry.status.toLowerCase() === 'booked' || 
       entry.status.toLowerCase() === 'approved')
      // Removed 'requested' - pending requests shouldn't count toward "days used"
    )
    .forEach(entry => {
      const startDate = new Date(entry.start_date);
      const endDate = new Date(entry.end_date);

      if (isDateInFiscalYear(startDate, fyStartYear) || isDateInFiscalYear(endDate, fyStartYear)) {
        const businessDays = eachDayOfInterval({ start: startDate, end: endDate })
          .filter(day => !isWeekend(day))
          .length;
        totalDays += businessDays;
      }
    });

  return totalDays;
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
}

/* ---------------------------------------------------------------------------
   Theme-Aware Professional Styling
--------------------------------------------------------------------------- */
const formContainerStyle = mergeStyles({
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.35)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  zIndex: 2147483000, // ensure above any app/panel overlays
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  overflow: 'auto',
});

const modalContentStyle = (isDarkMode: boolean) => mergeStyles({
  background: isDarkMode
    ? 'rgba(17, 24, 39, 0.72)'
    : 'rgba(255, 255, 255, 0.78)',
  borderRadius: '16px',
  boxShadow: isDarkMode
    ? '0 10px 30px rgba(0, 0, 0, 0.35)'
    : '0 10px 30px rgba(2, 6, 23, 0.10)',
  width: 'min(1200px, 96%)',
  maxHeight: '90vh',
  overflow: 'auto',
  padding: '28px',
  position: 'relative',
  border: isDarkMode
    ? '1px solid rgba(148, 163, 184, 0.18)'
    : '1px solid rgba(15, 23, 42, 0.08)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  '@media (max-width: 768px)': {
    padding: '20px',
    borderRadius: '12px',
    width: '98%',
    maxHeight: '95vh',
  },
});

const closeButtonStyle = (isDarkMode: boolean) => mergeStyles({
  position: 'absolute',
  top: '16px',
  right: '16px',
  backgroundColor: 'transparent',
  border: 'none',
  fontSize: '24px',
  cursor: 'pointer',
  color: isDarkMode ? colours.dark.text : colours.greyText,
  padding: '8px',
  borderRadius: '50%',
  width: '40px',
  height: '40px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.2s ease',
  ':hover': {
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  },
});

// Compact card design for better information density
const compactCardStyle = (isDarkMode: boolean, isExpanded: boolean) => mergeStyles({
  background: isDarkMode ? 'rgba(31, 41, 55, 0.65)' : 'rgba(255, 255, 255, 0.9)',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)'}`,
  borderRadius: '12px',
  padding: '16px',
  marginBottom: '12px',
  boxShadow: isDarkMode 
    ? '0 2px 8px rgba(0, 0, 0, 0.25)'
    : '0 2px 8px rgba(2, 6, 23, 0.06)',
  transition: 'all 0.2s ease',
  cursor: 'default',
  ':hover': {
    boxShadow: isDarkMode 
      ? '0 4px 12px rgba(0, 0, 0, 0.3)'
      : '0 4px 12px rgba(2, 6, 23, 0.10)',
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
  padding: '6px 12px',
  borderRadius: '20px',
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  backgroundColor:
    status === 'approved'
      ? (isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.10)')
      : status === 'rejected'
      ? (isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.10)')
      : (isDarkMode ? 'rgba(251, 191, 36, 0.12)' : 'rgba(251, 191, 36, 0.10)'),
  color:
    status === 'approved'
      ? (isDarkMode ? '#86efac' : '#166534')
      : status === 'rejected'
      ? (isDarkMode ? '#fca5a5' : '#7f1d1d')
      : (isDarkMode ? '#fcd34d' : '#854d0e'),
  border: `1px solid ${
    status === 'approved'
      ? (isDarkMode ? 'rgba(34, 197, 94, 0.28)' : 'rgba(34, 197, 94, 0.25)')
      : status === 'rejected'
      ? (isDarkMode ? 'rgba(239, 68, 68, 0.28)' : 'rgba(239, 68, 68, 0.25)')
      : (isDarkMode ? 'rgba(251, 191, 36, 0.28)' : 'rgba(251, 191, 36, 0.25)')
  }`,
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
  backgroundColor: 'transparent',
  borderColor: isDarkMode ? colours.accent : colours.highlight,
  color: isDarkMode ? colours.accent : colours.highlight,
  fontWeight: 600,
  padding: '10px 20px',
  borderRadius: '8px',
  transition: 'all 0.2s ease',
  borderWidth: '1.5px',
  ':hover': {
    backgroundColor: isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.08)',
    transform: 'translateY(-1px)',
    boxShadow: isDarkMode
      ? '0 3px 10px rgba(0, 0, 0, 0.25)'
      : '0 3px 10px rgba(2, 6, 23, 0.10)',
  },
});

const rejectButtonStyle = (isDarkMode: boolean) => mergeStyles({
  backgroundColor: 'transparent',
  borderColor: 'rgba(239, 68, 68, 0.45)',
  color: isDarkMode ? '#fca5a5' : '#b91c1c',
  fontWeight: 600,
  padding: '10px 20px',
  borderRadius: '8px',
  transition: 'all 0.2s ease',
  ':hover': {
    backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.10)' : 'rgba(239, 68, 68, 0.08)',
    transform: 'translateY(-1px)',
    boxShadow: isDarkMode
      ? '0 3px 10px rgba(0, 0, 0, 0.25)'
      : '0 3px 10px rgba(2, 6, 23, 0.10)',
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
  gap: '16px',
  alignItems: 'center',
  flexWrap: 'wrap',
  fontSize: '13px',
  color: isDarkMode ? colours.dark.subText : colours.greyText,
  marginBottom: '12px',
});

const metricItemStyle = (isDarkMode: boolean, isWarning?: boolean) => mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 8px',
  borderRadius: '6px',
  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
  fontWeight: 500,
  color: isWarning 
    ? (isDarkMode ? colours.orange : colours.red) 
    : (isDarkMode ? colours.dark.text : colours.light.text),
});

const compactActionsStyle = mergeStyles({
  display: 'flex',
  gap: '8px',
  marginTop: '12px',
  '@media (max-width: 768px)': {
    flexDirection: 'column',
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
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.2s ease',
  ':hover': {
    backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
  },
});

const conflictPillStyle = (isDarkMode: boolean, count: number) => mergeStyles({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 10px',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: 600,
  backgroundColor: count > 0 
    ? (isDarkMode ? 'rgba(251, 191, 36, 0.15)' : '#FFF3CD')
    : (isDarkMode ? 'rgba(34, 197, 94, 0.15)' : '#E8F5E8'),
  color: count > 0 
    ? (isDarkMode ? '#FCD34D' : '#856404')
    : (isDarkMode ? '#86EFAC' : '#2D5A2D'),
  border: `1px solid ${count > 0 
    ? (isDarkMode ? 'rgba(251, 191, 36, 0.3)' : '#FFEAA7')
    : (isDarkMode ? 'rgba(34, 197, 94, 0.3)' : '#A3D977')}`,
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
}) => {
  const { isDarkMode } = useTheme();
  // Maintain a local copy so UI reflects changes immediately
  const [localApprovals, setLocalApprovals] = useState<ApprovalEntry[]>(approvals);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  
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

  function getNickname(initials: string): string {
    const member = team.find(m => m.Initials.toLowerCase() === initials.toLowerCase());
    return member?.Nickname || initials;
  }

  function getEntitlement(initials: string): number {
    const normalizedInitials = initials.trim().toLowerCase();
    const member = team.find(m => m.Initials && m.Initials.trim().toLowerCase() === normalizedInitials);
    return member?.holiday_entitlement ?? 20;
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
    const [confirmationMessage, setConfirmationMessage] = useState<string>('');
    const [localRejection, setLocalRejection] = useState<string>(rejectionReason[entry.id] || '');
    const [isExpanded, setIsExpanded] = useState<boolean>(false);

    const requestDays = calculateBusinessDays(entry.start_date, entry.end_date);
    const entitlement = getEntitlement(entry.person);
    const fyStartYear = getFiscalYearStart(new Date());
    
    // FIX: Exclude current request from "days used" calculation
    const daysSoFar = sumBookedAndRequestedDaysInFY(
      allLeaveEntries.filter(e => e.person === entry.person && 
        (e.start_date !== entry.start_date || e.end_date !== entry.end_date)),
      entry.person, 
      fyStartYear
    );
    const daysAfterApproval = daysSoFar + requestDays;
    const daysRemaining = entitlement - daysAfterApproval;
    const availableSell = Math.max(0, daysRemaining - 5);
    
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
            if (!localRejection || localRejection.trim() === '') {
              setIsExpanded(true); // Expand to show rejection reason field
              setConfirmationMessage('⚠ Please provide a rejection reason');
              setTimeout(() => setConfirmationMessage(''), 3000);
              return;
            }
            await handleAction('reject');
          }
        });
        return () => {
          actionHandlersRef.current.delete(cardIndex);
        };
      }
    }, [cardIndex, localRejection, isProcessing]);

    const handleAction = async (action: 'approve' | 'reject') => {
      if (isProcessing) return;
      
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
        setConfirmationMessage('❌ Error: Invalid leave request ID');
        setTimeout(() => setConfirmationMessage(''), 5000);
        return;
      }
      
      setProcessingStates(prev => ({ ...prev, [entry.id]: true }));
      
      try {
        const newStatus = action === 'approve' ? 'approved' : 'rejected';
        const reason = action === 'reject' ? localRejection : null;
        
        // Validate rejection reason for rejections
        if (action === 'reject' && (!reason || reason.trim() === '')) {
          console.warn('❌ Rejection requires a reason');
          setConfirmationMessage('❌ Please provide a rejection reason');
          setTimeout(() => setConfirmationMessage(''), 5000);
          setProcessingStates(prev => ({ ...prev, [entry.id]: false }));
          return;
        }
        
        await updateAnnualLeave(entry.id, newStatus, reason);
        
        if (onApprovalUpdate) {
          onApprovalUpdate(entry.id, newStatus);
        }
        // Reflect change locally for immediate feedback
        setLocalApprovals(prev => prev.map(a => a.id === entry.id ? { ...a, status: newStatus } : a));
        
        setConfirmationMessage(
          action === 'approve' 
            ? `✓ Approved leave for ${getNickname(entry.person)}` 
            : `✗ Rejected leave for ${getNickname(entry.person)}`
        );
        
        setTimeout(() => setConfirmationMessage(''), 3000);
        // Auto-close the modal shortly after a successful action
        setTimeout(() => {
          onClose();
        }, 800);
        
      } catch (error) {
        console.error(`Failed to ${action} leave:`, error);
        setConfirmationMessage(`❌ Failed to ${action} leave request`);
        setTimeout(() => setConfirmationMessage(''), 5000);
      } finally {
        setProcessingStates(prev => ({ ...prev, [entry.id]: false }));
      }
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

    return (
      <div 
        className={compactCardStyle(isDarkMode, isExpanded)}
        style={{
          border: isActive
            ? `2px solid ${isDarkMode ? colours.accent : colours.highlight}`
            : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)'}`,
          boxShadow: isActive
            ? `0 0 0 2px ${isDarkMode ? `${colours.accent}30` : `${colours.highlight}30`}`
            : undefined,
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
              borderRadius: '4px',
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
          <div className={metricItemStyle(isDarkMode)}>
            <span style={{ fontSize: '11px', opacity: 0.7 }}>Used:</span>
            <strong>{daysSoFar}/{entitlement}</strong>
          </div>
          <div className={metricItemStyle(isDarkMode, daysRemaining < 0)}>
            <span style={{ fontSize: '11px', opacity: 0.7 }}>After:</span>
            <strong>{daysRemaining} left</strong>
          </div>
          <div className={conflictPillStyle(isDarkMode, conflicts.length)}>
            {conflicts.length === 0 ? '✓ No conflicts' : `⚠ ${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}`}
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
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                  fontSize: '13px',
                  fontStyle: 'italic',
                  color: isDarkMode ? colours.dark.text : colours.light.text
                }}>
                  "{entry.reason}"
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
                  borderRadius: '8px',
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
                      borderRadius: '6px',
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
          <div className={compactActionsStyle}>
            <DefaultButton
              text={isProcessing ? 'Processing...' : '✓ Approve'}
              onClick={() => handleAction('approve')}
              disabled={isProcessing}
              className={approveButtonStyle(isDarkMode)}
              style={{ flex: 1 }}
            />
            <DefaultButton
              text={isProcessing ? 'Processing...' : '✗ Reject'}
              onClick={() => handleAction('reject')}
              disabled={isProcessing}
              className={rejectButtonStyle(isDarkMode)}
              style={{ flex: 1 }}
            />
            {isExpanded && (
              <TextField
                placeholder="Rejection reason (required)"
                value={localRejection}
                onChange={(e, val) => setLocalRejection(val || '')}
                multiline
                rows={2}
                styles={{
                  root: { marginTop: '8px', width: '100%' },
                  fieldGroup: {
                    borderRadius: '6px',
                    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                  },
                  field: {
                    fontSize: '13px',
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                  }
                }}
              />
            )}
          </div>
        )}

        {/* Compact Confirmation Message */}
        {confirmationMessage && (
          <div style={{ 
            marginTop: '8px', 
            padding: '8px 12px', 
            borderRadius: '6px',
            backgroundColor: confirmationMessage.includes('✓') 
              ? (isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.10)')
              : confirmationMessage.includes('❌') 
                ? (isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.10)')
                : (isDarkMode ? 'rgba(251, 191, 36, 0.12)' : 'rgba(251, 191, 36, 0.10)'),
            border: `1px solid ${
              confirmationMessage.includes('✓') 
                ? (isDarkMode ? 'rgba(34, 197, 94, 0.28)' : 'rgba(34, 197, 94, 0.25)')
                : confirmationMessage.includes('❌') 
                  ? (isDarkMode ? 'rgba(239, 68, 68, 0.28)' : 'rgba(239, 68, 68, 0.25)')
                  : (isDarkMode ? 'rgba(251, 191, 36, 0.28)' : 'rgba(251, 191, 36, 0.25)')
            }`,
            color: confirmationMessage.includes('✓') 
              ? (isDarkMode ? '#86efac' : '#0c4a6e')
              : confirmationMessage.includes('❌') 
                ? (isDarkMode ? '#fca5a5' : '#7f1d1d')
                : (isDarkMode ? '#fcd34d' : '#92400e'),
            fontWeight: 600,
            fontSize: '13px',
            textAlign: 'center'
          }}>
            {confirmationMessage}
          </div>
        )}
      </div>
    );
  };

  const modalJsx = (
    <div 
      className={formContainerStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Modal Content */}
      <div className={modalContentStyle(isDarkMode)} onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button 
          className={closeButtonStyle(isDarkMode)}
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        {localApprovals.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px 20px',
            fontSize: '18px',
            color: isDarkMode ? colours.dark.text : colours.greyText
          }}>
            <FaUmbrellaBeach style={{ fontSize: '48px', marginBottom: '16px', color: colours.green }} />
            <div>No leave requests to review</div>
            <div style={{ fontSize: '14px', marginTop: '8px' }}>
              All annual leave requests have been processed.
            </div>
          </div>
        ) : (
          <Stack tokens={{ childrenGap: 24 }}>
            <div style={{
              fontSize: '24px',
              fontWeight: 700,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              textAlign: 'center',
              marginBottom: '8px'
            }}>
              Annual Leave Approvals
            </div>
            <div style={{
              fontSize: '14px',
              color: isDarkMode ? colours.dark.subText : colours.greyText,
              textAlign: 'center',
              marginBottom: '16px'
            }}>
              {approvals.length} request{approvals.length !== 1 ? 's' : ''} require{approvals.length === 1 ? 's' : ''} your review
            </div>
            
            {localApprovals.map((entry, index) => (
              <ApprovalCard 
                key={entry.id || entry.request_id || `${entry.person}-${entry.start_date}`} 
                entry={entry} 
                isActive={index === activeIndex}
                cardIndex={index}
              />
            ))}
            
            {/* Keyboard shortcuts hint */}
            <div style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: isDarkMode ? 'rgba(135, 243, 243, 0.05)' : 'rgba(135, 243, 243, 0.1)',
              border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.25)'}`,
              fontSize: '12px',
              color: isDarkMode ? colours.dark.subText : colours.greyText,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              flexWrap: 'wrap'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <kbd style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                  fontFamily: 'monospace',
                  fontSize: '11px'
                }}>↑↓</kbd>
                Navigate
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <kbd style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                  fontFamily: 'monospace',
                  fontSize: '11px'
                }}>A</kbd>
                Approve
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <kbd style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                  fontFamily: 'monospace',
                  fontSize: '11px'
                }}>R</kbd>
                Reject
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <kbd style={{
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                  fontFamily: 'monospace',
                  fontSize: '11px'
                }}>ESC</kbd>
                Close
              </span>
            </div>
          </Stack>
        )}
      </div>
    </div>
  );
  
  // Render inline until portal is ready, then via portal
  if (!portalEl) return modalJsx;
  return createPortal(modalJsx, portalEl);
};

export default AnnualLeaveApprovals;