import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Stack,
  Persona,
  PersonaSize,
  MessageBar,
  MessageBarType,
} from '@fluentui/react';
import { mergeStyles, keyframes } from '@fluentui/react';
import { format, parseISO, isValid, eachDayOfInterval, isWeekend } from 'date-fns';
import { colours } from '../app/styles/colours';
import { useTheme } from '../app/functionality/ThemeContext';
import BespokePanel from '../app/functionality/BespokePanel';
import HelixAvatar from '../assets/helix avatar.png';
import { FaUmbrellaBeach, FaCalendarAlt, FaCheck, FaTimes, FaChevronDown, FaChevronUp } from 'react-icons/fa';

/* ---------------------------------------------------------------------------
   Safe Date Parsing Helper
--------------------------------------------------------------------------- */
function safeParseDate(value: string | Date | null | undefined): Date {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return value;
  
  if (typeof value === 'string') {
    const parsed = parseISO(value);
    if (isValid(parsed)) return parsed;
    const fallback = new Date(value);
    if (isValid(fallback)) return fallback;
  }
  
  return new Date(NaN);
}

/* ---------------------------------------------------------------------------
   Types & Interfaces
--------------------------------------------------------------------------- */
export interface BookingEntry {
  id: string;
  request_id?: number;
  person: string;
  start_date: string;
  end_date: string;
  status: string;
  days_taken?: number;
  reason?: string;
  rejection_notes?: string;
  leave_type?: string;
}

export interface TeamMember {
  Initials: string;
  Nickname?: string;
  First: string;
  imageUrl?: string;
  holiday_entitlement?: number;
}

export interface AnnualLeaveBookingsProps {
  bookings: BookingEntry[];
  onClose: () => void;
  team: TeamMember[];
}

/* ---------------------------------------------------------------------------
   Animation Keyframes
--------------------------------------------------------------------------- */
const fadeOutAnimation = keyframes({
  from: { opacity: 1, transform: 'translateX(0)', maxHeight: '500px' },
  to: { opacity: 0, transform: 'translateX(20px)', maxHeight: '0px', padding: '0', margin: '0', overflow: 'hidden' }
});

const slideIn = keyframes({
  '0%': { opacity: 0, transform: 'translateY(8px)' },
  '100%': { opacity: 1, transform: 'translateY(0)' }
});

/* ---------------------------------------------------------------------------
   Styled Components
--------------------------------------------------------------------------- */
const getCardStyle = (isDarkMode: boolean, isActive: boolean, isAnimatingOut: boolean, animationStatus?: 'booked' | 'discarded' | 'acknowledged') => 
  mergeStyles({
    background: isDarkMode
      ? 'linear-gradient(135deg, rgba(10, 16, 30, 0.95) 0%, rgba(18, 26, 42, 0.92) 100%)'
      : 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.95) 100%)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '8px',
    border: isAnimatingOut
      ? `2px solid ${animationStatus === 'discarded' ? colours.red : colours.green}`
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
      ? (animationStatus === 'discarded' 
          ? (isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)')
          : (isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)'))
      : undefined,
    pointerEvents: isAnimatingOut ? 'none' : 'auto',
    ':hover': {
      borderColor: isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.25)',
      boxShadow: isDarkMode
        ? '0 4px 20px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)'
        : '0 4px 20px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03)',
    },
  });

const getCardHeaderStyle = (isDarkMode: boolean, status: string) => {
  const statusLower = status.toLowerCase();
  // In booking modal: keep the surrounding UI neutral; use the status chip for state colours.
  const accentColor = statusLower === 'rejected' ? colours.red : colours.highlight;
  
  return mergeStyles({
    padding: '16px 20px',
    background: isDarkMode
      ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.6) 0%, rgba(11, 30, 55, 0.5) 100%)'
      : 'linear-gradient(135deg, rgba(248, 250, 252, 0.8) 0%, rgba(241, 245, 249, 0.7) 100%)',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(148, 163, 184, 0.12)'}`,
    borderLeft: `3px solid ${accentColor}`,
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  });
};

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

const getStatusBadgeStyle = (isDarkMode: boolean, status: string) => {
  const statusLower = status.toLowerCase();
  const isRejected = statusLower === 'rejected';
  const isPending = statusLower === 'requested' || statusLower === 'pending';
  const isApproved = statusLower === 'approved';
  
  return mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    // Booking modal status chip: pending=orange, approved/ready=green, rejected=red
    backgroundColor: isRejected
      ? (isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)')
      : isApproved
        ? (isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.1)')
        : isPending
          ? (isDarkMode ? 'rgba(255, 183, 77, 0.15)' : 'rgba(255, 152, 0, 0.1)')
          : (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)'),
    color: isRejected 
      ? colours.red 
      : isApproved 
        ? colours.green
        : isPending
          ? (isDarkMode ? '#FFB74D' : '#E65100')
          : colours.highlight,
    border: `1px solid ${isRejected 
      ? colours.red 
      : isApproved 
        ? colours.green
        : isPending
          ? (isDarkMode ? 'rgba(255, 183, 77, 0.3)' : 'rgba(255, 152, 0, 0.3)')
          : colours.highlight}40`,
  });
};

const getInfoRowStyle = (isDarkMode: boolean) =>
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

const getInfoItemStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    minWidth: '60px',
  });

const getInfoLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.8)',
  });

const getInfoValueStyle = (isDarkMode: boolean, isHighlight?: boolean) =>
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

const getActionButtonStyle = (isDarkMode: boolean, variant: 'primary' | 'secondary' | 'danger') =>
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
      : `1px solid ${variant === 'danger' 
          ? (isDarkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)')
          : (isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(15, 23, 42, 0.15)')}`,
    backgroundColor: variant === 'primary'
      ? colours.highlight
      : 'transparent',
    color: variant === 'primary'
      ? '#ffffff'
      : variant === 'danger'
        ? (isDarkMode ? '#f87171' : '#dc2626')
        : (isDarkMode ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.75)'),
    ':hover': {
      backgroundColor: variant === 'primary'
        ? '#2f7fb7'
        : variant === 'danger'
          ? (isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.08)')
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

const getDetailsContentStyle = (isDarkMode: boolean, isError?: boolean) =>
  mergeStyles({
    fontSize: '13px',
    lineHeight: 1.5,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    padding: '10px 12px',
    borderRadius: '4px',
    backgroundColor: isError
      ? (isDarkMode ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)')
      : (isDarkMode ? 'rgba(7, 16, 32, 0.5)' : 'rgba(255, 255, 255, 0.8)'),
    border: `1px solid ${isError
      ? (isDarkMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)')
      : (isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(148, 163, 184, 0.12)')}`,
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
   Utility Functions
--------------------------------------------------------------------------- */
function calculateBusinessDays(start: string, end: string): number {
  const startDate = safeParseDate(start);
  const endDate = safeParseDate(end);
  if (!isValid(startDate) || !isValid(endDate)) return 0;
  return eachDayOfInterval({ start: startDate, end: endDate }).filter(day => !isWeekend(day)).length;
}

function formatDays(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/* ---------------------------------------------------------------------------
   Main Component
--------------------------------------------------------------------------- */
const AnnualLeaveBookings: React.FC<AnnualLeaveBookingsProps> = ({ bookings, onClose, team }) => {
  const { isDarkMode } = useTheme();
  const [localBookings, setLocalBookings] = useState<BookingEntry[]>(bookings);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [animatingOut, setAnimatingOut] = useState<Set<string>>(new Set());
  const [animationStatus, setAnimationStatus] = useState<{ [id: string]: 'booked' | 'discarded' | 'acknowledged' }>({});
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }>>([]);
  const [processingStates, setProcessingStates] = useState<{ [id: string]: boolean }>({});

  const actionHandlersRef = useRef<Map<number, { book: () => Promise<void>, discard: () => Promise<void> }>>(new Map());

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    setLocalBookings(bookings);
  }, [bookings]);

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      if (localBookings.length === 0 || isTyping) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, localBookings.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
      }

      const activeBooking = localBookings[activeIndex];
      if (!activeBooking) return;

      if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const handlers = actionHandlersRef.current.get(activeIndex);
        if (handlers) handlers.book();
      }

      if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const handlers = actionHandlersRef.current.get(activeIndex);
        if (handlers) handlers.discard();
      }
    };
    
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [localBookings, activeIndex]);

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

    return team.find(m => {
      const initials = (m.Initials || '').trim().toLowerCase();
      const first = (m.First || '').trim().toLowerCase();
      const nickname = (m.Nickname || '').trim().toLowerCase();

      if (initials === key || first === key || nickname === key) return true;
      if (first && key.startsWith(first + ' ')) return true;
      if (nickname && key.startsWith(nickname + ' ')) return true;

      return false;
    });
  }

  function getNickname(person: string): string {
    const member = findTeamMember(person);
    return member?.Nickname || member?.First || person;
  }

  /* ---------------------------------------------------------------------------
     Booking Card Component
  --------------------------------------------------------------------------- */
  const BookingCard: React.FC<{ entry: BookingEntry; isActive?: boolean; cardIndex?: number }> = ({ entry, isActive = false, cardIndex }) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    
    const recordId = entry.request_id ? String(entry.request_id) : entry.id;
    const requestDays = Number.isFinite(Number(entry.days_taken)) && Number(entry.days_taken) > 0
      ? Number(entry.days_taken)
      : calculateBusinessDays(entry.start_date, entry.end_date);

    const status = entry.status.toLowerCase();
    const isRejected = status === 'rejected';
    const isPending = status === 'requested' || status === 'pending';
    
    const isProcessing = processingStates[entry.id] || false;
    const isAnimatingOut = animatingOut.has(entry.id);
    const cardAnimationStatus = animationStatus[entry.id];

    // Format date range
    const compactDateRange = (() => {
      const start = safeParseDate(entry.start_date);
      const end = safeParseDate(entry.end_date);
      
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

    const handleAction = async (action: 'book' | 'discard' | 'acknowledge') => {
      if (isProcessing || animatingOut.has(entry.id)) return;
      
      if (!entry.id || entry.id === 'undefined' || entry.id === '') {
        showToast('Error: Invalid leave request ID', 'error');
        return;
      }
      
      setProcessingStates(prev => ({ ...prev, [entry.id]: true }));
      
      try {
        const newStatus = action === 'book' ? 'booked' : action === 'acknowledge' ? 'acknowledged' : 'discarded';
        await updateAnnualLeave(recordId, newStatus, null);
        
        const personName = getNickname(entry.person);
        const message = action === 'book'
          ? `✓ Booked ${requestDays} day${requestDays > 1 ? 's' : ''} leave for ${personName}`
          : action === 'acknowledge'
            ? `✓ Acknowledged rejection for ${personName}`
            : `✗ Discarded leave request for ${personName}`;
        
        showToast(message, action === 'discard' ? 'info' : 'success');
        
        setAnimatingOut(prev => new Set(prev).add(entry.id));
        setAnimationStatus(prev => ({ ...prev, [entry.id]: newStatus as 'booked' | 'discarded' | 'acknowledged' }));
        
        setTimeout(() => {
          setLocalBookings(prev => prev.filter(b => b.id !== entry.id));
          setAnimatingOut(prev => {
            const newSet = new Set(prev);
            newSet.delete(entry.id);
            return newSet;
          });
          setActiveIndex(prev => Math.min(prev, localBookings.length - 2));
        }, 500);
        
      } catch (error) {
        console.error(`Failed to ${action} leave:`, error);
        showToast(`Failed to ${action} leave request. Please try again.`, 'error');
      } finally {
        setProcessingStates(prev => ({ ...prev, [entry.id]: false }));
      }
    };

    // Register keyboard handlers
    useEffect(() => {
      if (cardIndex !== undefined) {
        actionHandlersRef.current.set(cardIndex, {
          book: async () => {
            if (isProcessing) return;
            if (isRejected) {
              await handleAction('acknowledge');
            } else {
              await handleAction('book');
            }
          },
          discard: async () => {
            if (isProcessing || isRejected) return;
            await handleAction('discard');
          }
        });
        return () => {
          actionHandlersRef.current.delete(cardIndex);
        };
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cardIndex, isProcessing, isRejected]);

    const hasDetails = entry.reason?.trim() || entry.rejection_notes?.trim() || entry.leave_type?.trim();

    return (
      <div 
        className={getCardStyle(isDarkMode, isActive, isAnimatingOut, cardAnimationStatus)}
        onClick={() => cardIndex !== undefined && setActiveIndex(cardIndex)}
      >
        {/* Card Header */}
        <div className={getCardHeaderStyle(isDarkMode, entry.status)}>
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
            </div>
          </div>
          <span className={getStatusBadgeStyle(isDarkMode, entry.status)}>
            {isRejected ? 'Rejected' : isPending ? 'Pending' : 'Ready to Book'}
          </span>
        </div>

        {/* Card Body */}
        <div className={getCardBodyStyle(isDarkMode)}>
          {/* Info Row */}
          <div className={getInfoRowStyle(isDarkMode)}>
            <div className={getInfoItemStyle(isDarkMode)}>
              <span className={getInfoLabelStyle(isDarkMode)}>Duration</span>
              <span className={getInfoValueStyle(isDarkMode)}>{formatDays(requestDays)} days</span>
            </div>
            <div style={{ 
              width: '1px', 
              height: '24px', 
              backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.1)' 
            }} />
            <div className={getInfoItemStyle(isDarkMode)}>
              <span className={getInfoLabelStyle(isDarkMode)}>Type</span>
              <span className={getInfoValueStyle(isDarkMode)}>
                {entry.leave_type ? entry.leave_type.charAt(0).toUpperCase() + entry.leave_type.slice(1) : 'Standard'}
              </span>
            </div>
            <div style={{ 
              width: '1px', 
              height: '24px', 
              backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.1)' 
            }} />
            <div className={getInfoItemStyle(isDarkMode)}>
              <span className={getInfoLabelStyle(isDarkMode)}>Status</span>
              <span className={getInfoValueStyle(isDarkMode, true)}>
                {isRejected ? 'Action needed' : isPending ? 'Awaiting approval' : 'Ready to book'}
              </span>
            </div>
            
            <div style={{ flex: 1 }} />
            
            {hasDetails && (
              <button 
                className={getExpandButtonStyle(isDarkMode)}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
              >
                {isExpanded ? 'Hide details' : 'View details'}
                {isExpanded ? <FaChevronUp style={{ fontSize: '10px' }} /> : <FaChevronDown style={{ fontSize: '10px' }} />}
              </button>
            )}
          </div>

          {/* Expanded Details */}
          {isExpanded && hasDetails && (
            <div className={getDetailsSectionStyle(isDarkMode)}>
              <Stack tokens={{ childrenGap: 16 }}>
                {entry.rejection_notes?.trim() && (
                  <div>
                    <div className={getDetailsLabelStyle(isDarkMode)} style={{ color: colours.red }}>
                      Rejection Reason
                    </div>
                    <div className={getDetailsContentStyle(isDarkMode, true)}>
                      {entry.rejection_notes}
                    </div>
                  </div>
                )}

                {entry.reason?.trim() && (
                  <div>
                    <div className={getDetailsLabelStyle(isDarkMode)}>Request Notes</div>
                    <div className={getDetailsContentStyle(isDarkMode)}>{entry.reason}</div>
                  </div>
                )}

                {entry.leave_type?.trim() && (
                  <div>
                    <div className={getDetailsLabelStyle(isDarkMode)}>Leave Type</div>
                    <div className={getDetailsContentStyle(isDarkMode)}>
                      {entry.leave_type.charAt(0).toUpperCase() + entry.leave_type.slice(1)}
                    </div>
                  </div>
                )}
              </Stack>
            </div>
          )}

          {/* Action Buttons */}
          {!isPending && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {isRejected ? (
                  <button
                    className={getActionButtonStyle(isDarkMode, 'secondary')}
                    onClick={() => handleAction('acknowledge')}
                    disabled={isProcessing}
                  >
                    <FaCheck style={{ fontSize: '12px' }} />
                    {isProcessing ? 'Processing...' : 'Acknowledge'}
                  </button>
                ) : (
                  <>
                    <button
                      className={getActionButtonStyle(isDarkMode, 'primary')}
                      onClick={() => handleAction('book')}
                      disabled={isProcessing}
                    >
                      <FaCheck style={{ fontSize: '12px' }} />
                      {isProcessing ? 'Processing...' : 'Book Leave'}
                    </button>
                    <button
                      className={getActionButtonStyle(isDarkMode, 'danger')}
                      onClick={() => handleAction('discard')}
                      disabled={isProcessing}
                    >
                      <FaTimes style={{ fontSize: '12px' }} />
                      {isProcessing ? 'Processing...' : 'Discard'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Pending notice */}
          {isPending && (
            <div style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '6px',
              backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(54, 144, 206, 0.08)',
              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.20)'}`,
              fontSize: '13px',
              color: colours.highlight,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <FaCalendarAlt style={{ fontSize: '12px' }} />
              Awaiting approval – you'll be notified when a decision is made
            </div>
          )}
        </div>
      </div>
    );
  };

  const pendingCount = localBookings.filter(b => !animatingOut.has(b.id)).length;

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
        title="Book Requested Leave"
        description={
          pendingCount === 0
            ? 'No leave requests to process'
            : `${pendingCount} request${pendingCount !== 1 ? 's' : ''} ready to book`
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
              marginBottom: '20px',
            }}>
              <FaUmbrellaBeach style={{ 
                fontSize: '32px', 
                color: isDarkMode ? '#22c55e' : '#16a34a' 
              }} />
            </div>
            <div style={{
              fontSize: '18px',
              fontWeight: 600,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              marginBottom: '8px',
            }}>
              All caught up!
            </div>
            <div style={{
              fontSize: '14px',
              color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.8)',
              maxWidth: '300px',
            }}>
              No pending, approved, or rejected leave requests to process at this time.
            </div>
          </div>
        ) : (
          <Stack tokens={{ childrenGap: 16 }}>
            {localBookings.map((entry, idx) => (
              <BookingCard
                key={entry.request_id ? String(entry.request_id) : entry.id}
                entry={entry}
                isActive={idx === activeIndex}
                cardIndex={idx}
              />
            ))}
          </Stack>
        )}
      </BespokePanel>
    </>
  );
};

export default AnnualLeaveBookings;
