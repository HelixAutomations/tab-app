/**
 * AttendancePortal — leave-first team view.
 *
 * Two-view design:
 *   1. **Overview** — Team grid: person, away/upcoming status, when back or next leave.
 *   2. **Detail** — Click a person → future leave first, recent leave history second.
 *      Balance info is admin-only (sidebar).
 *
 * Self-contained: fetches its own data from `/api/attendance/getAnnualLeave`
 * and `/api/attendance/getAttendance`. No Redux, no context — just useState.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { colours } from '../../app/styles/colours';
import type { AnnualLeaveRecord } from '../../app/functionality/types';
import {
  FaArrowLeft, FaCalendarCheck, FaCalendarAlt, FaUser, FaCheck, FaClock,
  FaTimes, FaUmbrellaBeach, FaSpinner, FaChevronRight, FaCircle,
  FaSuitcase, FaSearch, FaBuilding
} from 'react-icons/fa';
import './AttendancePortal.css';

/* ═══════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════ */

interface TeamMember {
  Initials: string;
  'Full Name'?: string;
  First?: string;
  Last?: string;
  Nickname?: string;
  Role?: string;
  AOW?: string;
  status?: string;
  Email?: string;
  holiday_entitlement?: number;
}

interface PersonLeaveData {
  initials: string;
  displayName: string;
  role: string;
  aow: string;
  entitlement: number;
  used: number;
  remaining: number;
  status: 'in-office' | 'on-leave' | 'wfh' | 'unknown';
  currentLeave: AnnualLeaveRecord | null;
  nextLeave: AnnualLeaveRecord | null;
  allRecords: AnnualLeaveRecord[];
}

/* ═══════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

const AOW_COLOURS: Record<string, string> = {
  Commercial: colours.blue,
  Construction: colours.orange,
  Property: colours.green,
  Employment: colours.yellow,
};

const getAowColour = (aow: string): string =>
  AOW_COLOURS[aow] || colours.greyText;

const formatDate = (d: string): string => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDateShort = (d: string): string => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const isCurrentlyOnLeave = (records: AnnualLeaveRecord[]): AnnualLeaveRecord | null => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return records.find(r => {
    if (r.status !== 'approved' && r.status !== 'booked') return false;
    const start = new Date(r.start_date);
    const end = new Date(r.end_date);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return today >= start && today <= end;
  }) || null;
};

const getNextLeave = (records: AnnualLeaveRecord[]): AnnualLeaveRecord | null => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = records
    .filter(r => {
      if (r.status !== 'approved' && r.status !== 'booked') return false;
      const start = new Date(r.start_date);
      start.setHours(0, 0, 0, 0);
      return start > today;
    })
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  return upcoming[0] || null;
};

const statusLabel = (s: string): string => {
  switch (s) {
    case 'requested': return 'Requested';
    case 'approved': return 'Approved';
    case 'booked': return 'Booked';
    case 'rejected': return 'Declined';
    case 'acknowledged': return 'Acknowledged';
    case 'discarded': return 'Cancelled';
    default: return s || '—';
  }
};

const statusClass = (s: string): string => {
  switch (s) {
    case 'requested': return 'ap-status--pending';
    case 'approved': return 'ap-status--approved';
    case 'booked': return 'ap-status--booked';
    case 'rejected': return 'ap-status--rejected';
    case 'acknowledged': return 'ap-status--acknowledged';
    case 'discarded': return 'ap-status--cancelled';
    default: return '';
  }
};

const getDisplayName = (m: TeamMember): string =>
  m.Nickname || m.First || m['Full Name']?.split(' ')[0] || m.Initials;

/* ═══════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Person Row (presence-focused) ───────────────────────────────────── */

interface PersonRowProps {
  person: PersonLeaveData;
  isDarkMode: boolean;
  onClick: () => void;
}

const PersonRow: React.FC<PersonRowProps> = ({ person, isDarkMode, onClick }) => {
  const aowCol = getAowColour(person.aow);
  const isAway = person.status === 'on-leave';
  const hasUpcoming = !isAway && !!person.nextLeave;

  // "Back / Next" — the key info: when back, or next leave planned
  const backNextLabel = person.currentLeave
    ? `Back ${formatDateShort(person.currentLeave.end_date)}`
    : person.nextLeave
      ? `Next ${formatDateShort(person.nextLeave.start_date)}`
      : '—';

  return (
    <button
      className={`ap-row${isAway ? ' ap-row--away' : ''}`}
      onClick={onClick}
      type="button"
      style={{
        borderLeftColor: aowCol,
        background: isDarkMode ? colours.dark.cardBackground : '#fff',
      }}
    >
      {/* Identity */}
      <div className="ap-row-identity">
        <div
          className="ap-row-avatar"
          style={{
            background: isAway
              ? `${aowCol}22`
              : isDarkMode ? colours.darkBlue : `${aowCol}10`,
            color: aowCol,
          }}
        >
          {person.initials}
        </div>
        <div className="ap-row-name-block">
          <span className="ap-row-name" style={{ color: isDarkMode ? colours.dark.text : colours.darkBlue }}>
            {person.displayName}
          </span>
          <span className="ap-row-role" style={{ color: isDarkMode ? '#d1d5db' : colours.greyText }}>
            {person.aow || person.role || '—'}
          </span>
        </div>
      </div>

      {/* Leave badge */}
      <div className="ap-row-status-col">
        {isAway ? (
          <span className="ap-badge ap-badge--away">
            <FaUmbrellaBeach style={{ fontSize: '0.5rem' }} /> Away
          </span>
        ) : hasUpcoming ? (
          <span className="ap-badge ap-badge--wfh">
            <FaCalendarCheck style={{ fontSize: '0.5rem' }} /> Upcoming
          </span>
        ) : (
          <span className="ap-badge ap-badge--in">
            <FaCalendarCheck style={{ fontSize: '0.5rem' }} /> None booked
          </span>
        )}
      </div>

      {/* Back / Next leave */}
      <div className="ap-row-next-col">
        <span className="ap-row-next" style={{ color: isDarkMode ? '#d1d5db' : colours.greyText }}>
          {backNextLabel}
        </span>
      </div>

      {/* Arrow */}
      <span className="ap-row-arrow" style={{ color: isDarkMode ? colours.accent : colours.blue }}>
        <FaChevronRight />
      </span>
    </button>
  );
};

/* ── Leave Record Row (detail view) ──────────────────────────────────── */

interface LeaveRecordRowProps {
  record: AnnualLeaveRecord;
  isDarkMode: boolean;
}

const LeaveRecordRow: React.FC<LeaveRecordRowProps> = ({ record, isDarkMode }) => {
  const isCurrent = isCurrentlyOnLeave([record]) !== null;

  return (
    <div className={`ap-leave-item${isCurrent ? ' ap-leave-item--active' : ''}`}
      style={{ background: isDarkMode ? colours.dark.cardBackground : '#fff' }}
    >
      <div className="ap-leave-icon-wrap">
        {record.status === 'booked' || record.status === 'approved' ? (
          <div className="ap-leave-icon ap-leave-icon--done"><FaCheck /></div>
        ) : record.status === 'requested' ? (
          <div className="ap-leave-icon ap-leave-icon--pending"><FaClock /></div>
        ) : record.status === 'rejected' ? (
          <div className="ap-leave-icon ap-leave-icon--rejected"><FaTimes /></div>
        ) : (
          <div className="ap-leave-icon ap-leave-icon--neutral"><FaCircle /></div>
        )}
      </div>

      <div className="ap-leave-body">
        <div className="ap-leave-dates" style={{ color: isDarkMode ? colours.dark.text : colours.darkBlue }}>
          {formatDateShort(record.start_date)}
          {record.start_date !== record.end_date && ` — ${formatDateShort(record.end_date)}`}
          {record.half_day_start && <span className="ap-half-day">PM start</span>}
          {record.half_day_end && <span className="ap-half-day">AM end</span>}
        </div>
        <div className="ap-leave-meta" style={{ color: isDarkMode ? '#d1d5db' : colours.greyText }}>
          {record.days_taken != null && `${record.days_taken}d`}
          {record.reason && ` · ${record.reason}`}
          {record.leave_type && record.leave_type !== 'standard' && (
            <span className="ap-leave-type">{record.leave_type}</span>
          )}
        </div>
      </div>

      <div className="ap-leave-status-col">
        <span className={`ap-status-pill ${statusClass(record.status)}`}>
          {isCurrent && <span className="ap-status-dot" />}
          {statusLabel(record.status)}
        </span>
      </div>
    </div>
  );
};

/* ── Person Detail View (presence-focused) ───────────────────────────── */

interface PersonDetailProps {
  person: PersonLeaveData;
  isDarkMode: boolean;
  /** Whether to show leave balance info (admin or viewing own profile) */
  showBalance: boolean;
  onBack: () => void;
}

const PersonDetailView: React.FC<PersonDetailProps> = ({ person, isDarkMode, showBalance, onBack }) => {
  const aowCol = getAowColour(person.aow);
  const isAway = person.status === 'on-leave';

  const upcomingRecords = useMemo(() =>
    person.allRecords
      .filter(r => (r.status === 'approved' || r.status === 'booked') && new Date(r.start_date) >= new Date())
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()),
    [person.allRecords]
  );

  const pendingRecords = useMemo(() =>
    person.allRecords.filter(r => r.status === 'requested'),
    [person.allRecords]
  );

  const pastRecords = useMemo(() =>
    person.allRecords
      .filter(r => (r.status === 'approved' || r.status === 'booked') && new Date(r.end_date) < new Date())
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
      .slice(0, 6),
    [person.allRecords]
  );

  const usagePercent = person.entitlement > 0
    ? Math.round((person.used / person.entitlement) * 100)
    : 0;

  const bg = isDarkMode ? colours.dark.sectionBackground : '#fff';
  const borderCol = isDarkMode ? colours.dark.border : colours.grey;
  const textPrimary = isDarkMode ? colours.dark.text : colours.darkBlue;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;

  return (
    <div className="ap-detail ap-fade-in">
      {/* Banner */}
      <div className="ap-detail-banner" style={{
        background: isDarkMode ? colours.darkBlue : '#fff',
        borderLeftColor: aowCol,
        borderColor: borderCol,
      }}>
        <div className="ap-detail-banner-top" style={{ borderBottomColor: borderCol }}>
          <button className="ap-back" onClick={onBack} type="button"
            style={{ color: isDarkMode ? colours.accent : colours.blue }}
          >
            <FaArrowLeft /> All Team
          </button>
        </div>
        <div className="ap-detail-header">
          <div className="ap-detail-avatar" style={{
            background: `${aowCol}18`,
            color: aowCol,
          }}>
            {person.initials}
          </div>
          <div className="ap-detail-hd-text">
            <h2 className="ap-detail-title" style={{ color: textPrimary }}>
              {person.displayName}
            </h2>
            <span className="ap-detail-sub" style={{ color: bodyText }}>
              {person.role}{person.aow ? ` · ${person.aow}` : ''}
            </span>
          </div>
          <div className="ap-detail-status-wrap">
            {isAway ? (
              <span className="ap-badge ap-badge--away"><FaUmbrellaBeach style={{ fontSize: '0.5rem' }} /> Away</span>
            ) : (
              <span className="ap-badge ap-badge--in"><FaBuilding style={{ fontSize: '0.5rem' }} /> None booked</span>
            )}
          </div>
        </div>
      </div>

      {/* Two-column grid */}
      <div className="ap-detail-grid">
        {/* Left — presence-focused content */}
        <div className="ap-detail-main">
          {/* Currently away banner */}
          {person.currentLeave && (
            <div className="ap-section" style={{
              background: isDarkMode ? colours.darkBlue : '#fff',
              borderColor: borderCol,
            }}>
              <h3 className="ap-section-title" style={{ color: textPrimary, borderBottomColor: borderCol }}>
                <FaUmbrellaBeach className="ap-section-icon" style={{ color: colours.orange }} />
                Currently Away
              </h3>
              <p className="ap-snapshot-text" style={{
                color: bodyText,
                borderLeftColor: colours.orange,
                background: isDarkMode ? 'rgba(255,140,0,0.06)' : 'rgba(255,140,0,0.04)',
              }}>
                Off until <strong style={{ color: textPrimary }}>{formatDate(person.currentLeave.end_date)}</strong>
                {person.currentLeave.reason && ` — ${person.currentLeave.reason}`}
                {person.currentLeave.days_taken != null && ` (${person.currentLeave.days_taken} days)`}
              </p>
            </div>
          )}

          {/* Upcoming leave — the core info */}
          {upcomingRecords.length > 0 && (
            <div className="ap-section" style={{
              background: isDarkMode ? colours.darkBlue : '#fff',
              borderColor: borderCol,
            }}>
              <h3 className="ap-section-title" style={{ color: textPrimary, borderBottomColor: borderCol }}>
                <FaSuitcase className="ap-section-icon" style={{ color: colours.blue }} />
                Upcoming Leave
                <span className="ap-section-count">{upcomingRecords.length}</span>
              </h3>
              <div className="ap-leave-list">
                {upcomingRecords.map(r => (
                  <LeaveRecordRow key={r.id || r.request_id} record={r} isDarkMode={isDarkMode} />
                ))}
              </div>
            </div>
          )}

          {/* Recent history — secondary, after future leave */}
          {pastRecords.length > 0 && (
            <div className="ap-section" style={{
              background: isDarkMode ? colours.darkBlue : '#fff',
              borderColor: borderCol,
            }}>
              <h3 className="ap-section-title" style={{ color: textPrimary, borderBottomColor: borderCol }}>
                <FaCalendarCheck className="ap-section-icon" style={{ color: colours.green }} />
                Recent Leave History
                <span className="ap-section-count">{pastRecords.length}</span>
              </h3>
              <div className="ap-leave-list">
                {pastRecords.map(r => (
                  <LeaveRecordRow key={r.id || r.request_id} record={r} isDarkMode={isDarkMode} />
                ))}
              </div>
            </div>
          )}

          {/* Pending requests */}
          {pendingRecords.length > 0 && (
            <div className="ap-section" style={{
              background: isDarkMode ? colours.darkBlue : '#fff',
              borderColor: borderCol,
            }}>
              <h3 className="ap-section-title" style={{ color: textPrimary, borderBottomColor: borderCol }}>
                <FaClock className="ap-section-icon" style={{ color: colours.orange }} />
                Pending Requests
                <span className="ap-section-count">{pendingRecords.length}</span>
              </h3>
              <div className="ap-leave-list">
                {pendingRecords.map(r => (
                  <LeaveRecordRow key={r.id || r.request_id} record={r} isDarkMode={isDarkMode} />
                ))}
              </div>
            </div>
          )}

          {/* Not currently away + no upcoming = all clear */}
          {!person.currentLeave && upcomingRecords.length === 0 && pendingRecords.length === 0 && (
            <div className="ap-section" style={{
              background: isDarkMode ? colours.darkBlue : '#fff',
              borderColor: borderCol,
            }}>
              <h3 className="ap-section-title" style={{ color: textPrimary, borderBottomColor: borderCol }}>
                <FaCalendarCheck className="ap-section-icon" style={{ color: colours.green }} />
                Leave Status
              </h3>
              <p className="ap-empty" style={{ color: bodyText }}>
                No upcoming leave booked.
              </p>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <aside className="ap-detail-aside">
          {/* Person info card — always visible */}
          <div className="ap-info-card" style={{
            background: isDarkMode ? colours.darkBlue : '#fff',
            borderColor: borderCol,
          }}>
            <h3 className="ap-section-title" style={{ color: textPrimary, borderBottomColor: borderCol }}>
              <FaUser className="ap-section-icon" style={{ color: aowCol }} />
              Details
            </h3>
            <dl className="ap-info-dl">
              {person.aow && (
                <div className="ap-info-row" style={{ borderBottomColor: borderCol }}>
                  <dt style={{ color: textMuted }}>Area of Work</dt>
                  <dd style={{ color: aowCol, fontWeight: 600 }}>{person.aow}</dd>
                </div>
              )}
              <div className="ap-info-row" style={{ borderBottomColor: borderCol }}>
                <dt style={{ color: textMuted }}>Status</dt>
                <dd style={{ color: isAway ? colours.orange : textPrimary, fontWeight: 600 }}>
                  {isAway ? 'Away now' : (person.nextLeave ? 'Upcoming leave booked' : 'No leave booked')}
                </dd>
              </div>
              {person.nextLeave && (
                <div className="ap-info-row" style={{ borderBottomColor: 'transparent' }}>
                  <dt style={{ color: textMuted }}>Next Leave</dt>
                  <dd style={{ color: textPrimary }}>
                    {formatDateShort(person.nextLeave.start_date)}
                    {person.nextLeave.start_date !== person.nextLeave.end_date &&
                      ` — ${formatDateShort(person.nextLeave.end_date)}`}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Balance card — admin-only */}
          {showBalance && (
            <div className="ap-info-card" style={{
              background: isDarkMode ? colours.darkBlue : '#fff',
              borderColor: borderCol,
            }}>
              <h3 className="ap-section-title" style={{ color: textPrimary, borderBottomColor: borderCol }}>
                <FaCalendarAlt className="ap-section-icon" style={{ color: aowCol }} />
                Leave Balance
              </h3>

              {/* Balance ring */}
              <div className="ap-balance-ring-wrap">
                <svg className="ap-balance-ring" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="34" fill="none"
                    stroke={isDarkMode ? colours.dark.border : '#eee'} strokeWidth="6" />
                  <circle cx="40" cy="40" r="34" fill="none"
                    stroke={person.remaining <= 2 ? colours.cta : aowCol}
                    strokeWidth="6"
                    strokeDasharray={`${(usagePercent / 100) * 213.6} 213.6`}
                    strokeLinecap="round"
                    transform="rotate(-90 40 40)"
                    className="ap-ring-fill"
                  />
                </svg>
                <div className="ap-balance-ring-center">
                  <span className="ap-balance-ring-value" style={{ color: textPrimary }}>
                    {person.remaining}
                  </span>
                  <span className="ap-balance-ring-label" style={{ color: textMuted }}>
                    days left
                  </span>
                </div>
              </div>

              <dl className="ap-info-dl">
                <div className="ap-info-row" style={{ borderBottomColor: borderCol }}>
                  <dt style={{ color: textMuted }}>Entitlement</dt>
                  <dd style={{ color: textPrimary }}>{person.entitlement} days</dd>
                </div>
                <div className="ap-info-row" style={{ borderBottomColor: borderCol }}>
                  <dt style={{ color: textMuted }}>Used</dt>
                  <dd style={{ color: textPrimary }}>{person.used} days</dd>
                </div>
                <div className="ap-info-row" style={{ borderBottomColor: 'transparent' }}>
                  <dt style={{ color: textMuted }}>Remaining</dt>
                  <dd style={{ color: person.remaining <= 2 ? colours.cta : textPrimary, fontWeight: 700 }}>
                    {person.remaining} days
                  </dd>
                </div>
                <div className="ap-info-row" style={{ borderBottomColor: 'transparent' }}>
                  <dt style={{ color: textMuted }}>Allowance Check</dt>
                  <dd style={{ color: person.remaining <= 2 ? colours.cta : colours.green, fontWeight: 700 }}>
                    {person.remaining <= 2 ? 'Low allowance' : 'Allowance confirmed'}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   MAIN PORTAL COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export interface AttendancePortalProps {
  isDarkMode: boolean;
  currentUserInitials?: string;
  /** Admin users see everyone's balance; non-admins see only their own */
  isAdmin?: boolean;
  onRequestLeave?: () => void;
  /** If already loaded externally, pass in to skip fetch */
  preloadedLeave?: AnnualLeaveRecord[];
  preloadedTeam?: TeamMember[];
}

const AttendancePortal: React.FC<AttendancePortalProps> = ({
  isDarkMode,
  currentUserInitials,
  isAdmin = false,
  onRequestLeave,
  preloadedLeave,
  preloadedTeam,
}) => {
  const [team, setTeam] = useState<TeamMember[]>(preloadedTeam || []);
  const [allLeave, setAllLeave] = useState<AnnualLeaveRecord[]>(preloadedLeave || []);
  const [loading, setLoading] = useState(!preloadedTeam);
  const [error, setError] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'on-leave' | 'upcoming'>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Fetch data ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (preloadedTeam && preloadedLeave) return;
    setLoading(true);
    try {
      const leaveRes = await fetch('/api/attendance/getAnnualLeave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'all' }),
      });

      if (!leaveRes.ok) throw new Error(`Leave API: ${leaveRes.status}`);

      const leaveData = await leaveRes.json();

      setTeam(leaveData.team || []);
      setAllLeave(leaveData.all_data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  }, [preloadedTeam, preloadedLeave]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Build person data ─────────────────────────────────────────────────
  const personData: PersonLeaveData[] = useMemo(() => {
    const activeTeam = team.filter(m => m.status === 'live' || !m.status);
    return activeTeam.map(member => {
      const initials = member.Initials || '';
      const records = allLeave.filter(r => r.person === initials);
      const currentLeave = isCurrentlyOnLeave(records);
      const nextLeave = getNextLeave(records);
      const entitlement = member.holiday_entitlement || 25;
      const usedDays = records
        .filter(r => (r.status === 'approved' || r.status === 'booked') && r.days_taken != null)
        .reduce((sum, r) => sum + (r.days_taken || 0), 0);

      return {
        initials,
        displayName: getDisplayName(member),
        role: member.Role || '',
        aow: member.AOW || '',
        entitlement,
        used: usedDays,
        remaining: Math.max(0, entitlement - usedDays),
        status: currentLeave ? 'on-leave' as const : 'in-office' as const,
        currentLeave,
        nextLeave,
        allRecords: records,
      };
    }).sort((a, b) => {
      // Away first, then nearest upcoming leave, then by name
      if (a.status === 'on-leave' && b.status !== 'on-leave') return -1;
      if (a.status !== 'on-leave' && b.status === 'on-leave') return 1;

      const aNext = a.nextLeave ? new Date(a.nextLeave.start_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bNext = b.nextLeave ? new Date(b.nextLeave.start_date).getTime() : Number.MAX_SAFE_INTEGER;
      if (aNext !== bNext) return aNext - bNext;

      return a.displayName.localeCompare(b.displayName);
    });
  }, [team, allLeave]);

  // ── Filter & search ───────────────────────────────────────────────────
  const filteredPeople = useMemo(() => {
    let result = personData;
    if (filterStatus === 'on-leave') result = result.filter(p => p.status === 'on-leave');
    if (filterStatus === 'upcoming') result = result.filter(p => !!p.nextLeave && p.status !== 'on-leave');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.displayName.toLowerCase().includes(q) ||
        p.initials.toLowerCase().includes(q) ||
        p.aow.toLowerCase().includes(q)
      );
    }
    return result;
  }, [personData, filterStatus, searchQuery]);

  const selectedPersonData = selectedPerson
    ? personData.find(p => p.initials === selectedPerson) || null
    : null;

  const awayCount = personData.filter(p => p.status === 'on-leave').length;
  const upcomingCount = personData.filter(p => !!p.nextLeave && p.status !== 'on-leave').length;

  // ── Style tokens (corrected dark surface ladder) ──────────────────────
  const bg = isDarkMode ? colours.dark.background : colours.light.background;
  const gridBg = isDarkMode ? colours.dark.sectionBackground : '#fff';
  const headerBg = isDarkMode ? colours.darkBlue : '#fafbfc';
  const rowBg = isDarkMode ? colours.dark.cardBackground : '#fff';
  const borderCol = isDarkMode ? colours.dark.border : colours.grey;
  const textPrimary = isDarkMode ? colours.dark.text : colours.darkBlue;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;

  // ── Loading state ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="ap-portal ap-fade-in" style={{ background: bg }}>
        <div className="ap-overview">
          <div className="ap-overview-header">
            <h2 className="ap-overview-title" style={{ color: textPrimary }}>
              <span className="ap-skel" style={{ width: 140, height: 16 }} />
            </h2>
          </div>
          <div className="ap-grid" style={{ background: gridBg, borderColor: borderCol }}>
            <div className="ap-grid-head" style={{ background: headerBg, borderBottomColor: borderCol }}>
              <span style={{ color: textMuted }}>Team Member</span>
              <span style={{ color: textMuted }}>Status</span>
              <span style={{ color: textMuted }}>Back / Next</span>
              <span />
            </div>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="ap-row ap-row--skeleton" style={{ background: rowBg }}>
                <div className="ap-row-identity">
                  <div className="ap-skel ap-skel--circle" style={{ width: 32, height: 32 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="ap-skel" style={{ width: 80, height: 10 }} />
                    <span className="ap-skel" style={{ width: 50, height: 8 }} />
                  </div>
                </div>
                <div className="ap-row-status-col">
                  <span className="ap-skel" style={{ width: 56, height: 16, borderRadius: 2 }} />
                </div>
                <div className="ap-row-next-col">
                  <span className="ap-skel" style={{ width: 60, height: 8 }} />
                </div>
                <span className="ap-row-arrow" style={{ opacity: 0.15, color: textMuted }}>
                  <FaChevronRight />
                </span>
              </div>
            ))}
          </div>
          <p className="ap-loading-text" style={{ color: bodyText }}>
            <FaSpinner className="ap-spin" /> Loading team leave…
          </p>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="ap-portal ap-fade-in" style={{ background: bg }}>
        <div className="ap-overview">
          <div className="ap-overview-header">
            <h2 className="ap-overview-title" style={{ color: textPrimary }}>Team Leave</h2>
          </div>
          <div className="ap-grid" style={{ background: gridBg, borderColor: borderCol }}>
            <div className="ap-row" style={{ background: rowBg, cursor: 'default' }}>
              <div className="ap-row-identity">
                <span style={{ color: colours.cta, fontSize: '0.8125rem', fontWeight: 500 }}>
                  Unable to load team leave — {error}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="ap-portal ap-fade-in" style={{ background: bg }}>
      {selectedPersonData ? (
        <PersonDetailView
          person={selectedPersonData}
          isDarkMode={isDarkMode}
          showBalance={isAdmin || selectedPersonData.initials === currentUserInitials}
          onBack={() => {
            setSelectedPerson(null);
            requestAnimationFrame(() => {
              const el = document.querySelector('.ap-portal');
              if (el) el.scrollTop = 0;
            });
          }}
        />
      ) : (
        <div className="ap-overview">
          {/* Header */}
          <div className="ap-overview-header">
            <div className="ap-overview-title-row">
              <h2 className="ap-overview-title" style={{ color: textPrimary }}>
                Team Leave
              </h2>
              {onRequestLeave && (
                <button className="ap-request-btn" type="button" onClick={onRequestLeave}
                  style={{ background: isDarkMode ? colours.helixBlue : colours.darkBlue }}
                >
                  <FaUmbrellaBeach style={{ fontSize: '0.625rem' }} /> Request Leave
                </button>
              )}
            </div>
            <div className="ap-overview-stats">
              <span className="ap-stat" style={{ color: bodyText }}>
                <span className="ap-stat-dot" style={{ background: colours.orange }} />
                {awayCount} away
              </span>
              <span className="ap-stat" style={{ color: bodyText }}>
                <span className="ap-stat-dot" style={{ background: colours.blue }} />
                {upcomingCount} upcoming
              </span>
              <span className="ap-stat" style={{ color: textMuted }}>
                {personData.length} total
              </span>
            </div>
          </div>

          {/* Search & filter bar */}
          <div className="ap-toolbar" style={{ borderColor: borderCol }}>
            <div className="ap-search-wrap" style={{
              background: isDarkMode ? colours.dark.cardBackground : '#f8f9fa',
              borderColor: borderCol,
            }}>
              <FaSearch className="ap-search-icon" style={{ color: textMuted }} />
              <input
                ref={searchRef}
                className="ap-search-input"
                type="text"
                placeholder="Search team…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ color: textPrimary }}
              />
            </div>
            <div className="ap-filter-chips">
              {(['all', 'on-leave', 'upcoming'] as const).map(f => (
                <button
                  key={f}
                  className={`ap-chip${filterStatus === f ? ' ap-chip--active' : ''}`}
                  type="button"
                  onClick={() => setFilterStatus(f)}
                  style={{
                    background: filterStatus === f
                      ? (isDarkMode ? colours.helixBlue : colours.darkBlue)
                      : (isDarkMode ? colours.dark.cardBackground : '#f0f2f5'),
                    color: filterStatus === f
                      ? '#fff'
                      : textMuted,
                    borderColor: filterStatus === f
                      ? 'transparent'
                      : borderCol,
                  }}
                >
                  {f === 'all' ? 'All' : f === 'on-leave' ? 'Away' : 'Upcoming'}
                </button>
              ))}
            </div>
          </div>

          {/* Grid — presence-focused: Name | Status | Back/Next | Arrow */}
          <div className="ap-grid" style={{ background: gridBg, borderColor: borderCol }}>
            <div className="ap-grid-head" style={{
              background: headerBg,
              borderBottomColor: borderCol,
            }}>
              <span style={{ color: textMuted }}>Team Member</span>
              <span style={{ color: textMuted }}>Status</span>
              <span style={{ color: textMuted }}>Back / Next</span>
              <span />
            </div>
            {filteredPeople.map(person => (
              <PersonRow
                key={person.initials}
                person={person}
                isDarkMode={isDarkMode}
                onClick={() => setSelectedPerson(person.initials)}
              />
            ))}
            {filteredPeople.length === 0 && (
              <div className="ap-row ap-row--empty" style={{ background: rowBg }}>
                <span style={{ color: bodyText, fontSize: '0.8125rem', padding: '8px 0' }}>
                  {searchQuery ? 'No team members match your search.' : 'No team members found.'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendancePortal;
