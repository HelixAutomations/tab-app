import React, { useEffect, useState, useCallback } from 'react';
import { eachDayOfInterval, isWeekend, format, parseISO, isValid } from 'date-fns';
import { useTheme } from '../app/functionality/ThemeContext';
import BespokePanel from '../app/functionality/BespokePanel';
import HelixAvatar from '../assets/helix avatar.png';
import { FaUmbrellaBeach } from 'react-icons/fa';
import './AnnualLeaveApprovals.css';

/* ---------------------------------------------------------------------------
   Safe Date Parsing
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
  approvers?: string[];
  clio_entry_id?: number;
  half_day_start?: boolean;
  half_day_end?: boolean;
  requested_at?: string;
  approved_at?: string;
  booked_at?: string;
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
   Helpers
--------------------------------------------------------------------------- */
function getFiscalYearStart(date: Date): number {
  const year = date.getFullYear();
  return date >= new Date(year, 3, 1) ? year : year - 1;
}

function isDateInFiscalYear(date: Date, fy: number): boolean {
  return date >= new Date(fy, 3, 1) && date <= new Date(fy + 1, 2, 31, 23, 59);
}

function normalizePersonKey(v: string): string {
  return (v || '').trim().toLowerCase();
}

type LeaveTypeBucket = 'standard' | 'purchase' | 'sale' | 'other';
type LeaveBreakdown = { standard: number; purchase: number; sale: number; other: number };

function normalizeLeaveType(v: unknown): LeaveTypeBucket {
  const t = String(v || '').trim().toLowerCase();
  if (t === 'standard') return 'standard';
  if (t === 'purchase') return 'purchase';
  if (t === 'sale') return 'sale';
  return 'other';
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const r = Math.round(value * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function getLeaveDaysWithinFY(entry: LeaveEntry, fy: number): number {
  const s = safeParseDate(entry.start_date);
  const e = safeParseDate(entry.end_date);
  if (!isValid(s) || !isValid(e)) return 0;
  const iStart = s <= e ? s : e;
  const iEnd = s <= e ? e : s;
  const fyS = new Date(fy, 3, 1);
  const fyE = new Date(fy + 1, 2, 31, 23, 59, 59, 999);
  if (!isDateInFiscalYear(iStart, fy) && !isDateInFiscalYear(iEnd, fy)) return 0;
  const oStart = iStart > fyS ? iStart : fyS;
  const oEnd = iEnd < fyE ? iEnd : fyE;
  if (oStart > oEnd) return 0;
  const dt = typeof entry.days_taken === 'number' ? entry.days_taken : Number(entry.days_taken);
  if (iStart >= fyS && iEnd <= fyE && Number.isFinite(dt) && dt > 0) return dt;
  return eachDayOfInterval({ start: oStart, end: oEnd }).filter(d => !isWeekend(d)).length;
}

function sumBookedApprovedDaysByTypeInFY(
  entries: LeaveEntry[], person: string, fy: number, aliases: string[] = []
): LeaveBreakdown {
  const bd: LeaveBreakdown = { standard: 0, purchase: 0, sale: 0, other: 0 };
  const aliasSet = new Set([person, ...aliases].map(normalizePersonKey).filter(Boolean));
  entries
    .filter(e => aliasSet.has(normalizePersonKey(e.person)))
    .filter(e => { const s = String(e.status || '').toLowerCase(); return s === 'booked' || s === 'approved'; })
    .forEach(e => { const d = getLeaveDaysWithinFY(e, fy); if (d) bd[normalizeLeaveType(e.leave_type)] += d; });
  return bd;
}

/* ---------------------------------------------------------------------------
   Phase Helpers
--------------------------------------------------------------------------- */
type Phase = 'requested' | 'approved' | 'booked' | 'calendar';
const PHASES: { key: Phase; label: string }[] = [
  { key: 'requested', label: 'Requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'booked', label: 'Booked' },
  { key: 'calendar', label: 'Calendar' },
];

function getPhaseIndex(entry: ApprovalEntry): number {
  const s = (entry.status || '').toLowerCase();
  if (s === 'booked' && entry.clio_entry_id) return 3;
  if (s === 'booked') return 2;
  if (s === 'approved') return 1;
  return 0;
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return '';
  const d = safeParseDate(iso);
  if (!isValid(d)) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return format(d, 'd MMM');
}

/* ---------------------------------------------------------------------------
   Props
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
  const [animatingOut, setAnimatingOut] = useState<Set<string>>(new Set());
  const [animationStatus, setAnimationStatus] = useState<{ [id: string]: 'approved' | 'rejected' }>({});
  const [rejectionReason, setRejectionReason] = useState<{ [id: string]: string }>({});
  const [processingStates, setProcessingStates] = useState<{ [id: string]: boolean }>({});

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    if (onShowToast) onShowToast(message, type);
  }, [onShowToast]);

  useEffect(() => {
    setLocalApprovals(approvals);
  }, [approvals]);

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
  const ApprovalCard: React.FC<{ entry: ApprovalEntry }> = ({ entry }) => {
    const [localRejection, setLocalRejection] = useState<string>(rejectionReason[entry.id] || '');
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
    const requestType = normalizeLeaveType(entry.leave_type);
    const breakdownAfter: LeaveBreakdown = { ...breakdownSoFar };
    breakdownAfter[requestType] += requestDays;

    const standardUsedSoFar = breakdownSoFar.standard;
    const standardUsedAfter = breakdownAfter.standard;
    const standardRemainingAfter = entitlement - breakdownAfter.standard;

    // Purchase/sale are payroll transactions, not absence — skip team conflict checks
    const isAbsenceType = requestType === 'standard' || requestType === 'other';
    const conflicts = isAbsenceType ? getAllConflicts(entry) : [];
    const isProcessing = processingStates[entry.id] || false;
    const isAnimatingOut = animatingOut.has(entry.id);
    const cardAnimationStatus = animationStatus[entry.id];

    const cardCls = [
      'ala-card',
      isAnimatingOut && (cardAnimationStatus === 'approved' ? 'ala-card--approved' : 'ala-card--rejected'),
      isAnimatingOut ? 'ala-fade-out' : 'ala-fade-in',
    ].filter(Boolean).join(' ');

    // Format date range with safe parsing
    const compactDateRange = (() => {
      const start = safeParseDate(entry.start_date);
      const end = safeParseDate(entry.end_date);
      
      if (!isValid(start) || !isValid(end)) {
        return entry.start_date && entry.end_date 
          ? `${entry.start_date} – ${entry.end_date}` 
          : 'Date not available';
      }
      
      if (start.getTime() === end.getTime()) {
        return format(start, 'EEE, d MMM');
      }
      if (start.getFullYear() === end.getFullYear()) {
        return `${format(start, 'd MMM')} – ${format(end, 'd MMM')}`;
      }
      return `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
    })();

    // Hearing status for inline display
    const hearingInfo = (() => {
      const hc = entry.hearing_confirmation;
      if (hc === undefined || hc === null) return null;
      if (typeof hc === 'boolean') return { ok: hc, label: hc ? 'No hearings' : 'Hearings affected' };
      const l = String(hc).trim().toLowerCase();
      if (l === 'yes') return { ok: true, label: 'No hearings' };
      if (l === 'no') return { ok: false, label: 'Hearings affected' };
      return { ok: true, label: String(hc).trim() };
    })();

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
        const typeLabel = requestType === 'sale' ? ' (sale)' : requestType === 'purchase' ? ' (purchase)' : '';
        showToast(
          action === 'approve' 
            ? `✓ Approved ${requestDays} day${requestDays > 1 ? 's' : ''}${typeLabel} for ${personName}` 
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
        }, 500);
        
      } catch (error) {
        console.error(`Failed to ${action} leave:`, error);
        showToast(`Failed to ${action} leave request. Please try again.`, 'error');
      } finally {
        setProcessingStates(prev => ({ ...prev, [entry.id]: false }));
      }
    };

    return (
      <div className={cardCls}>
        <div className="ala-card-header">
          <div className="ala-card-main">
            <div className="ala-card-topline">
              <div className="ala-person-info">
                <p className="ala-person-name">{getNickname(entry.person)}</p>
                <p className="ala-card-subline">
                  <span className="ala-card-date">{compactDateRange}</span>
                  {entry.requested_at && <span className="ala-card-time">Requested {relativeTime(entry.requested_at)}</span>}
                </p>
              </div>
              {entry.status.toLowerCase() === 'requested' && (
                <div className="ala-header-actions">
                  <button className="ala-btn ala-btn--approve" onClick={() => handleAction('approve')} disabled={isProcessing}>
                    {isProcessing ? 'Processing…' : 'Approve'}
                  </button>
                  <button className="ala-btn ala-btn--reject" onClick={() => setIsRejecting(!isRejecting)} disabled={isProcessing}>
                    Reject
                  </button>
                </div>
              )}
            </div>

            <div className="ala-card-meta-row">
              <span className="ala-pill ala-pill--days">{requestDays}d</span>
              {requestType !== 'standard' && (
                <span className={`ala-pill ala-pill--${requestType}`}>
                  {requestType === 'sale' ? 'Sale' : 'Purchase'}
                </span>
              )}
              {isAbsenceType && conflicts.length > 0 && (
                <span className="ala-pill ala-pill--conflict">{conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}</span>
              )}
              {hearingInfo && (
                <span className={`ala-pill ${hearingInfo.ok ? 'ala-pill--no-conflict' : 'ala-pill--conflict'}`}>{hearingInfo.label}</span>
              )}
            </div>

            <div className="ala-balance-row">
              {requestType === 'standard' || requestType === 'other' ? (
                <>
                  <span className="ala-balance-label">Allowance</span>
                  <span className="ala-balance-copy">{fmt(entitlement)}d total</span>
                  <span className="ala-balance-sep">•</span>
                  <span className="ala-balance-copy">{fmt(standardUsedSoFar)}d used now</span>
                  <span className="ala-balance-sep">•</span>
                  <span className="ala-balance-copy">{fmt(standardUsedAfter)}d used after approval</span>
                  <span className={`ala-balance-outcome ${standardRemainingAfter < 0 ? 'ala-balance-outcome--warn' : 'ala-balance-outcome--ok'}`}>
                    {fmt(standardRemainingAfter)}d left
                  </span>
                </>
              ) : requestType === 'purchase' ? (
                <>
                  <span className="ala-balance-label">Payroll impact</span>
                  <span className="ala-balance-copy">Adds {requestDays}d to purchased allowance</span>
                </>
              ) : (
                <>
                  <span className="ala-balance-label">Payroll impact</span>
                  <span className="ala-balance-copy">Sells back {requestDays}d from unused allowance</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Expandable details — only shown when there's something to say */}
        {(entry.reason?.trim() || (isAbsenceType && conflicts.length > 0) || (hearingInfo && !hearingInfo.ok) || isRejecting) && (
          <div className="ala-card-body">
            {entry.reason?.trim() && (
              <div className="ala-reason-inline">
                <span className="ala-detail-label">Reason</span>
                <span className="ala-detail-value ala-detail-value--body">{entry.reason}</span>
              </div>
            )}

            {hearingInfo && !hearingInfo.ok && (
              <div className="ala-reason-inline">
                <span className="ala-detail-label">Hearings</span>
                <span className="ala-detail-value ala-detail-value--warn">{entry.hearing_details || 'Hearings may be affected — check with the fee earner'}</span>
              </div>
            )}

            {isAbsenceType && conflicts.length > 0 && (
              <div className="ala-conflicts-inline">
                <span className="ala-detail-label">Conflicts</span>
                <span className="ala-conflict-list">
                  {conflicts.map((c, i) => {
                    const cStart = safeParseDate(c.start_date);
                    const cEnd = safeParseDate(c.end_date);
                    const range = isValid(cStart) && isValid(cEnd) ? `${format(cStart, 'd MMM')} – ${format(cEnd, 'd MMM')}` : '';
                    return <span key={i} className="ala-conflict-chip">{getNickname(c.person)}{range ? ` · ${range}` : ''}</span>;
                  })}
                </span>
              </div>
            )}

            {isRejecting && (
              <div className="ala-reject-panel">
                <textarea
                  className="ala-reject-input"
                  placeholder="Rejection reason (required)"
                  value={localRejection}
                  onChange={e => setLocalRejection(e.target.value)}
                  rows={2}
                  autoFocus
                />
                <div className="ala-reject-actions">
                  <button className="ala-btn ala-btn--cancel" onClick={() => setIsRejecting(false)} disabled={isProcessing}>Cancel</button>
                  <button
                    className="ala-btn ala-btn--confirm-reject"
                    onClick={() => handleAction('reject')}
                    disabled={isProcessing || !localRejection.trim()}
                  >
                    {isProcessing ? 'Processing…' : 'Confirm Reject'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const pendingCount = localApprovals.filter(a => !animatingOut.has(a.id)).length;
  const coverCount = localApprovals.filter((entry) => String(entry.hearing_confirmation || '').toLowerCase() === 'no').length;
  const typeCounts = localApprovals.reduce(
    (acc, entry) => {
      const type = String(entry.leave_type || 'standard').toLowerCase();
      if (type === 'purchase') acc.purchase += 1;
      else if (type === 'sale') acc.sale += 1;
      else acc.standard += 1;
      return acc;
    },
    { standard: 0, purchase: 0, sale: 0 }
  );

  return (
    <BespokePanel
      isOpen={true}
      onClose={onClose}
      title="Annual Leave Approvals"
      description={pendingCount === 0 ? 'No pending requests' : `${pendingCount} request${pendingCount !== 1 ? 's' : ''} require${pendingCount === 1 ? 's' : ''} your review`}
      isDarkMode={isDarkMode}
      variant="modal"
      width="min(900px, 95vw)"
      icon={FaUmbrellaBeach}
    >
      <div className="ala-container">
        {localApprovals.length === 0 ? (
          <div className="ala-empty">
            <div className="ala-empty-icon"><FaUmbrellaBeach /></div>
            <div className="ala-empty-title">All clear</div>
            <div className="ala-empty-desc">No pending leave requests to review.</div>
          </div>
        ) : (
          <>
            <div className="ala-summary-bar">
              <div className="ala-summary-stat">
                <span className="ala-summary-label">Pending</span>
                <span className="ala-summary-value">{pendingCount}</span>
              </div>
              {typeCounts.standard > 0 && (
                <>
                  <div className="ala-summary-divider" />
                  <div className="ala-summary-stat">
                    <span className="ala-summary-label">Standard</span>
                    <span className="ala-summary-value">{typeCounts.standard}</span>
                  </div>
                </>
              )}
              {typeCounts.purchase > 0 && (
                <>
                  <div className="ala-summary-divider" />
                  <div className="ala-summary-stat">
                    <span className="ala-summary-label">Purchase</span>
                    <span className="ala-summary-value">{typeCounts.purchase}</span>
                  </div>
                </>
              )}
              {typeCounts.sale > 0 && (
                <>
                  <div className="ala-summary-divider" />
                  <div className="ala-summary-stat">
                    <span className="ala-summary-label">Sale</span>
                    <span className="ala-summary-value">{typeCounts.sale}</span>
                  </div>
                </>
              )}
              <div className="ala-summary-divider" />
              <div className="ala-summary-stat">
                <span className="ala-summary-label">Hearings</span>
                <span className="ala-summary-value">{coverCount > 0 ? `${coverCount}` : 'Clear'}</span>
              </div>
            </div>

            <div className="ala-card-list">
              {localApprovals.map((entry) => (
                <ApprovalCard key={entry.id} entry={entry} />
              ))}
            </div>
          </>
        )}
      </div>
    </BespokePanel>
  );
};

export default AnnualLeaveApprovals;
