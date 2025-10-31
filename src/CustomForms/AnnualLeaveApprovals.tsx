import React, { useEffect, useState } from 'react';
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
       entry.status.toLowerCase() === 'requested' ||
       entry.status.toLowerCase() === 'approved')
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
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  zIndex: 2147483000, // ensure above any app/panel overlays
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  overflow: 'auto',
});

const modalContentStyle = (isDarkMode: boolean) => mergeStyles({
  background: isDarkMode 
    ? `linear-gradient(135deg, ${colours.dark.sectionBackground} 0%, ${colours.dark.cardBackground} 100%)`
    : `linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)`,
  borderRadius: '16px',
  boxShadow: isDarkMode 
    ? '0 12px 40px rgba(0, 0, 0, 0.8)' 
    : '0 12px 40px rgba(0, 0, 0, 0.5)',
  width: 'min(1200px, 96%)',
  maxHeight: '90vh',
  overflow: 'auto',
  padding: '32px',
  position: 'relative',
  border: isDarkMode ? `1px solid ${colours.dark.border}` : 'none',
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
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  },
});

const professionalContainerStyle = (isDarkMode: boolean) => mergeStyles({
  background: isDarkMode 
    ? `linear-gradient(135deg, ${colours.dark.cardBackground} 0%, ${colours.dark.sectionBackground} 100%)`
    : `linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)`,
  border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
  borderRadius: '16px',
  padding: '32px',
  marginBottom: '24px',
  boxShadow: isDarkMode 
    ? '0 8px 32px rgba(0, 0, 0, 0.4)' 
    : '0 8px 32px rgba(0, 0, 0, 0.12)',
  maxWidth: '100%',
  overflow: 'hidden',
  '@media (max-width: 768px)': {
    padding: '20px',
    borderRadius: '12px',
  },
});

const headerSectionStyle = mergeStyles({
  borderBottom: `2px solid ${colours.light.border}`,
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
  fontWeight: 700,
  color: colours.light.text,
  marginBottom: '12px',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  borderLeft: `4px solid ${colours.cta}`,
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
    status === 'approved' ? (isDarkMode ? 'rgba(34, 197, 94, 0.2)' : '#e8f5e8') : 
    status === 'rejected' ? (isDarkMode ? 'rgba(239, 68, 68, 0.2)' : '#fdf2f2') : 
    (isDarkMode ? 'rgba(251, 191, 36, 0.2)' : '#fff3cd'),
  color: 
    status === 'approved' ? (isDarkMode ? '#86efac' : '#2d5a2d') : 
    status === 'rejected' ? (isDarkMode ? '#fca5a5' : '#721c24') : 
    (isDarkMode ? '#fcd34d' : '#856404'),
  border: `1px solid ${
    status === 'approved' ? (isDarkMode ? 'rgba(34, 197, 94, 0.4)' : '#a3d977') : 
    status === 'rejected' ? (isDarkMode ? 'rgba(239, 68, 68, 0.4)' : '#f5c6cb') : 
    (isDarkMode ? 'rgba(251, 191, 36, 0.4)' : '#ffeaa7')
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
  backgroundColor: colours.green,
  borderColor: colours.green,
  color: '#fff',
  fontWeight: 600,
  padding: '12px 24px',
  borderRadius: '8px',
  transition: 'all 0.2s ease',
  ':hover': {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
    transform: 'translateY(-1px)',
    boxShadow: isDarkMode 
      ? '0 4px 12px rgba(34, 197, 94, 0.3)' 
      : '0 4px 12px rgba(34, 197, 94, 0.2)',
  },
});

const rejectButtonStyle = (isDarkMode: boolean) => mergeStyles({
  backgroundColor: colours.red,
  borderColor: colours.red,
  color: '#fff',
  fontWeight: 600,
  padding: '12px 24px',
  borderRadius: '8px',
  transition: 'all 0.2s ease',
  ':hover': {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
    transform: 'translateY(-1px)',
    boxShadow: isDarkMode 
      ? '0 4px 12px rgba(239, 68, 68, 0.3)' 
      : '0 4px 12px rgba(239, 68, 68, 0.2)',
  },
});

const rejectionNotesStyle = (isDarkMode: boolean) => mergeStyles({
  marginTop: '12px',
  '& .ms-TextField-fieldGroup': {
    borderRadius: '8px',
    border: `2px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
    ':focus-within': {
      borderColor: colours.highlight,
    },
  },
  '& .ms-TextField-field': {
    color: isDarkMode ? colours.dark.text : colours.light.text,
  },
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

  // Body scroll lock and ESC to close (apply regardless of portal readiness)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

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

  const ApprovalCard: React.FC<{ entry: ApprovalEntry }> = ({ entry }) => {
    const [confirmationMessage, setConfirmationMessage] = useState<string>('');
    const [localRejection, setLocalRejection] = useState<string>(rejectionReason[entry.id] || '');

    const requestDays = calculateBusinessDays(entry.start_date, entry.end_date);
    const entitlement = getEntitlement(entry.person);
    const fyStartYear = getFiscalYearStart(new Date());
    const daysSoFar = sumBookedAndRequestedDaysInFY(allLeaveEntries, entry.person, fyStartYear);
    const daysRemaining = entitlement - daysSoFar;
    const availableSell = Math.max(0, daysRemaining - 5);
    
    const conflicts = getAllConflicts(entry);
    const isProcessing = processingStates[entry.id] || false;

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

    return (
      <div className={professionalContainerStyle(isDarkMode)}>
        {/* Header Section */}
        <div className={headerSectionStyle}>
          <div className={requestHeaderStyle}>
            <Persona
              imageUrl={HelixAvatar}
              text={getNickname(entry.person)}
              size={PersonaSize.size48}
              styles={{ 
                primaryText: { 
                  fontWeight: 700, 
                  fontSize: '18px',
                  color: colours.light.text
                } 
              }}
            />
            <div style={{ marginLeft: 'auto' }}>
              {entry.status.toLowerCase() === 'approved' && (
                <div className={statusBadgeStyle('approved', isDarkMode)}>Approved</div>
              )}
              {entry.status.toLowerCase() === 'rejected' && (
                <div className={statusBadgeStyle('rejected', isDarkMode)}>Rejected</div>
              )}
              {entry.status.toLowerCase() === 'requested' && (
                <div className={statusBadgeStyle('requested', isDarkMode)}>Pending Review</div>
              )}
            </div>
          </div>
        </div>

        {/* Critical Information Grid */}
        <div className={criticalInfoStyle}>
          <div className={infoCardStyle(isDarkMode)}>
            <div className={infoLabelStyle(isDarkMode)}>Request Period</div>
            <div className={infoValueStyle(isDarkMode)}>{formatDateRange(entry.start_date, entry.end_date)}</div>
          </div>
          
          <div className={infoCardStyle(isDarkMode)}>
            <div className={infoLabelStyle(isDarkMode)}>Business Days</div>
            <div className={infoValueStyle(isDarkMode)}>{requestDays} days</div>
          </div>
          
          <div className={infoCardStyle(isDarkMode)}>
            <div className={infoLabelStyle(isDarkMode)}>FY Days Taken</div>
            <div className={infoValueStyle(isDarkMode)}>{daysSoFar} / {entitlement}</div>
          </div>
          
          <div className={infoCardStyle(isDarkMode)}>
            <div className={infoLabelStyle(isDarkMode)}>Remaining After</div>
            <div className={infoValueStyle(isDarkMode)} style={{ 
              color: daysRemaining < 0 ? colours.red : (isDarkMode ? colours.dark.text : colours.light.text)
            }}>
              {daysRemaining} days
            </div>
          </div>
        </div>

        {/* Notes Section */}
        {entry.reason?.trim() && (
          <>
            <div className={sectionTitleStyle}>Request Notes</div>
            <div className={notesStyle(isDarkMode)}>
              "{entry.reason}"
            </div>
          </>
        )}

        {/* Hearing Information */}
        {entry.hearing_confirmation !== undefined && (
          <>
            <div className={sectionTitleStyle}>Hearing Confirmation</div>
            <div className={notesStyle(isDarkMode)}>
              <strong>
                {(() => {
                  const hc = entry.hearing_confirmation;
                  if (typeof hc === 'boolean') {
                    return hc ? '✓ No hearings during absence' : '⚠ Hearings may be affected';
                  }
                  if (typeof hc === 'string') {
                    const s = hc.trim();
                    const lower = s.toLowerCase();
                    if (lower === 'yes') return '✓ No hearings during absence';
                    if (lower === 'no') return '⚠ Hearings may be affected';
                    // Show the provided confirmation text as-is when not a yes/no token
                    return s;
                  }
                  return '';
                })()}
              </strong>
              {(() => {
                const hc = entry.hearing_confirmation;
                const hasDetails = !!entry.hearing_details;
                const lower = typeof hc === 'string' ? hc.trim().toLowerCase() : '';
                const needsDetails = hc === false || hc === null || lower === 'no' || (typeof hc === 'string' && lower !== 'yes' && lower !== 'no');
                return hasDetails && needsDetails ? (
                  <div style={{ marginTop: '8px', fontStyle: 'normal' }}>
                    <strong>Details:</strong> {entry.hearing_details}
                  </div>
                ) : null;
              })()}
            </div>
          </>
        )}

        {/* Team Conflicts */}
        <div className={sectionTitleStyle}>Team Coverage Analysis</div>
        {conflicts.length > 0 ? (
          <div className={conflictsGridStyle}>
            {conflicts.map((conflict, idx) => (
              <div key={idx} className={conflictCardStyle(isDarkMode)}>
                <Persona
                  imageUrl={HelixAvatar}
                  text={getNickname(conflict.person)}
                  size={PersonaSize.size32}
                  styles={{ 
                    primaryText: { 
                      fontWeight: 600, 
                      fontSize: '14px',
                      color: isDarkMode ? colours.dark.text : colours.light.text
                    } 
                  }}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: isDarkMode ? colours.dark.subText : colours.greyText }}>
                  {formatDateRange(conflict.start_date, conflict.end_date)}
                </div>
                <div style={{ 
                  marginTop: '4px', 
                  fontSize: '11px', 
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: conflict.status === 'booked' ? colours.green : colours.orange
                }}>
                  {conflict.status}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={notesStyle(isDarkMode)} style={{ color: colours.green, fontStyle: 'normal' }}>
            ✓ No team conflicts identified
          </div>
        )}

        {/* Action Buttons */}
        {entry.status.toLowerCase() === 'requested' && (
          <>
            <div className={actionButtonsStyle}>
              <DefaultButton
                text={isProcessing ? 'Processing...' : 'Approve Request'}
                onClick={() => handleAction('approve')}
                disabled={isProcessing}
                className={approveButtonStyle(isDarkMode)}
                iconProps={{ 
                  iconName: 'CheckMark',
                  styles: { root: { color: '#fff', fontSize: '14px' } }
                }}
              />
              <DefaultButton
                text={isProcessing ? 'Processing...' : 'Reject Request'}
                onClick={() => handleAction('reject')}
                disabled={isProcessing}
                className={rejectButtonStyle(isDarkMode)}
                iconProps={{ 
                  iconName: 'Cancel',
                  styles: { root: { color: '#fff', fontSize: '14px' } }
                }}
              />
            </div>

            <div className={rejectionNotesStyle(isDarkMode)}>
              <TextField
                label="Rejection Reason (required for rejections)"
                placeholder="Provide clear reasoning for rejection..."
                value={localRejection}
                onChange={(e, val) => setLocalRejection(val || '')}
                multiline
                rows={3}
                styles={{
                  fieldGroup: {
                    borderRadius: '8px',
                    border: `2px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                  },
                  field: {
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                  }
                }}
              />
            </div>
          </>
        )}

        {/* Confirmation Message */}
        {confirmationMessage && (
          <div style={{ 
            marginTop: '16px', 
            padding: '12px', 
            borderRadius: '8px',
            backgroundColor: confirmationMessage.includes('✓') ? '#f0f9ff' : 
                            confirmationMessage.includes('❌') ? '#fef2f2' : '#fffbeb',
            border: `1px solid ${
              confirmationMessage.includes('✓') ? '#0ea5e9' : 
              confirmationMessage.includes('❌') ? '#ef4444' : '#f59e0b'
            }`,
            color: confirmationMessage.includes('✓') ? '#0c4a6e' : 
                   confirmationMessage.includes('❌') ? '#7f1d1d' : '#92400e',
            fontWeight: 600,
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
            
            {localApprovals.map(entry => (
              <ApprovalCard key={entry.id || entry.request_id || `${entry.person}-${entry.start_date}`} entry={entry} />
            ))}
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