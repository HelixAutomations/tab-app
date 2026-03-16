import React, { useMemo, useState } from 'react';
import { FiMonitor, FiChevronRight } from 'react-icons/fi';

/**
 * AttendanceInsight — compact "who's where today" panel on the Home page.
 * Mirrors the AwayInsight design: single collapsible row, tiled names
 * grouped by status, expandable week-at-a-glance swimlane.
 *
 * Data: consumes the same attendance records fetched by Home.tsx.
 */

/* ─── types ────────────────────────────────────────────── */

interface AttendanceRecord {
  Attendance_ID?: number;
  Entry_ID?: number;
  First_Name: string;
  Initials: string;
  Level?: string;
  Week_Start: string;
  Week_End: string;
  ISO_Week?: number;
  Attendance_Days: string;
  Confirmed_At?: string | null;
  status?: string;
  Status?: string;
  isConfirmed?: boolean;
  isOnLeave?: boolean;
  weeks?: Record<string, any>;
}

interface TeamMember {
  Initials: string;
  First?: string;
  Nickname?: string;
  'Full Name'?: string;
  Role?: string;
  status?: string;
}

interface AnnualLeaveRecord {
  person: string;
  start_date: string;
  end_date: string;
  status: string;
  [key: string]: any;
}

export interface AttendanceInsightProps {
  isDarkMode: boolean;
  attendanceRecords: AttendanceRecord[];
  teamData: TeamMember[];
  annualLeaveRecords: AnnualLeaveRecord[];
  futureLeaveRecords: AnnualLeaveRecord[];
  isLoading?: boolean;
}

/* ─── constants ────────────────────────────────────────── */

type DayStatus = 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office' | 'unknown';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VALID_STATUSES: DayStatus[] = ['office', 'wfh', 'away', 'off-sick', 'out-of-office'];

const STATUS_META: Record<DayStatus, { label: string; icon: string; colorVar: string }> = {
  office:         { label: 'In Office',       icon: '🏢', colorVar: 'var(--helix-highlight)' },
  wfh:            { label: 'Working from Home',icon: '🏠', colorVar: 'var(--helix-green)' },
  away:           { label: 'Away',             icon: '🌴', colorVar: 'var(--text-muted)' },
  'off-sick':     { label: 'Off Sick',         icon: '🤒', colorVar: 'var(--helix-cta)' },
  'out-of-office':{ label: 'Out of Office',    icon: '💼', colorVar: 'var(--helix-orange)' },
  unknown:        { label: 'Unconfirmed',      icon: '?',  colorVar: 'var(--text-muted)' },
};

/* ─── date helpers ─────────────────────────────────────── */

const todayIndex = (): number => {
  const d = new Date().getDay(); // 0=Sun … 6=Sat
  if (d === 0) return 0; // Sunday → show Monday
  if (d === 6) return 4; // Saturday → show Friday
  return d - 1;          // Mon=0 … Fri=4
};

const weekStartDate = (offset: number): string => {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  return monday.toISOString().slice(0, 10);
};

const normalizeDate = (d: string | Date): string => {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
};

const parseDate = (s: string): Date => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

/* ─── attendance parser ────────────────────────────────── */

/** Parse an Attendance_Days string into a 5-element array [Mon…Fri]. */
const parseDays = (raw: string): DayStatus[] => {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return Array(5).fill('unknown') as DayStatus[];

  // Single token for whole week
  if (VALID_STATUSES.includes(s as DayStatus)) return Array(5).fill(s) as DayStatus[];

  const tokens = s.split(',').map(t => t.trim()).filter(Boolean);

  // Positional: exactly 5 valid statuses
  if (tokens.length === 5 && tokens.every(t => VALID_STATUSES.includes(t as DayStatus))) {
    return tokens as DayStatus[];
  }

  // day:status pairs (Mon:office,Tue:wfh …)
  const hasPairs = tokens.some(t => t.includes(':'));
  if (hasPairs) {
    const map: Record<string, DayStatus> = {};
    for (const t of tokens) {
      const [dayPart, statusPart] = t.split(':');
      if (dayPart && statusPart && VALID_STATUSES.includes(statusPart as DayStatus)) {
        map[dayPart.slice(0, 3)] = statusPart as DayStatus;
      }
    }
    return DAY_NAMES.map(d => map[d.toLowerCase()] || 'wfh');
  }

  // Legacy: day names listed = office those days, rest = wfh
  return DAY_NAMES.map(d => {
    const lower = d.toLowerCase();
    return tokens.includes(lower) || tokens.includes(lower.slice(0, 3)) ? 'office' : 'wfh';
  });
};

/* ─── component ────────────────────────────────────────── */

const AttendanceInsight: React.FC<AttendanceInsightProps> = ({
  isDarkMode,
  attendanceRecords,
  teamData,
  annualLeaveRecords,
  futureLeaveRecords,
  isLoading = false,
}) => {
  const [hoveredTile, setHoveredTile] = useState<string | null>(null);
  const [panelHovered, setPanelHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);

  /* —— palette (mirrors AwayInsight) —— */
  const panelBg      = isDarkMode ? 'var(--helix-website-blue)' : 'var(--surface-section)';
  const panelBgHov   = isDarkMode ? 'rgba(6, 23, 51, 0.5)' : 'var(--surface-card-hover)';
  const panelBorder  = isDarkMode ? 'rgba(75, 85, 99, 0.4)' : 'var(--border-strong)';

  const tileBg       = isDarkMode ? 'rgba(135, 243, 243, 0.06)' : 'rgba(54, 144, 206, 0.04)';
  const tileBgHov    = isDarkMode ? 'rgba(135, 243, 243, 0.12)' : 'rgba(54, 144, 206, 0.08)';
  const tileBorder   = isDarkMode ? 'rgba(135, 243, 243, 0.13)' : 'rgba(54, 144, 206, 0.1)';
  const tileBdrHov   = isDarkMode ? 'rgba(135, 243, 243, 0.3)' : 'rgba(54, 144, 206, 0.3)';
  const badgeBg      = isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(54, 144, 206, 0.08)';

  const textLabel    = isDarkMode ? '#ffffff' : 'var(--text-primary)';
  const textBody     = isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'var(--text-body)';
  const textMuted    = isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'var(--text-muted)';
  const accentColor  = 'var(--text-accent)';

  /* —— name resolution —— */
  const nameMap = useMemo(() => {
    const m = new Map<string, { firstName: string; initials: string }>();
    for (const t of teamData) {
      const ini = (t.Initials || '').toUpperCase();
      m.set(ini, {
        firstName: t.Nickname || t.First || t['Full Name'] || t.Initials || '',
        initials: ini,
      });
    }
    return m;
  }, [teamData]);

  /* —— leave lookup (people on leave today) —— */
  const leaveToday = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const onLeave = new Set<string>();
    for (const r of [...annualLeaveRecords, ...futureLeaveRecords]) {
      const st = (r.status || '').toLowerCase();
      if (st !== 'approved' && st !== 'booked') continue;
      const s = parseDate(r.start_date);
      const e = parseDate(r.end_date);
      if (today >= s && today <= e) onLeave.add(r.person.toUpperCase());
    }
    return onLeave;
  }, [annualLeaveRecords, futureLeaveRecords]);

  /* —— process today's attendance —— */
  const dayIdx = useMemo(todayIndex, []);
  const currentWeekStart = useMemo(() => weekStartDate(0), []);

  interface PersonStatus {
    initials: string;
    firstName: string;
    todayStatus: DayStatus;
    weekStatuses: DayStatus[];
    confirmed: boolean;
  }

  const people = useMemo((): PersonStatus[] => {
    return teamData
      .filter(t => t.status !== 'inactive')
      .map(member => {
        const ini = (member.Initials || '').toUpperCase();
        const info = nameMap.get(ini) || { firstName: member.First || ini, initials: ini };

        // Find current-week attendance record
        const rec = attendanceRecords.find(
          r => r.Initials === ini && normalizeDate(r.Week_Start) === currentWeekStart
        );

        const rawDays = rec?.Attendance_Days || rec?.Status || (rec as any)?.status || '';
        let weekStatuses = parseDays(rawDays);

        // Override with leave if person is on leave today
        if (leaveToday.has(ini)) {
          weekStatuses = weekStatuses.map((s, i) => i === dayIdx ? 'away' : s);
        }

        return {
          initials: info.initials,
          firstName: info.firstName,
          todayStatus: weekStatuses[dayIdx],
          weekStatuses,
          confirmed: Boolean(rec?.Confirmed_At),
        };
      })
      .sort((a, b) => {
        // Office first, then WFH, then others
        const order: Record<DayStatus, number> = { office: 0, wfh: 1, away: 2, 'off-sick': 3, 'out-of-office': 4, unknown: 5 };
        return (order[a.todayStatus] ?? 5) - (order[b.todayStatus] ?? 5) || a.firstName.localeCompare(b.firstName);
      });
  }, [teamData, attendanceRecords, nameMap, leaveToday, dayIdx, currentWeekStart]);

  /* —— group by status —— */
  type Bucket = { status: DayStatus; label: string; people: PersonStatus[] };
  const buckets = useMemo((): Bucket[] => {
    const groups = new Map<DayStatus, PersonStatus[]>();
    for (const p of people) {
      if (!groups.has(p.todayStatus)) groups.set(p.todayStatus, []);
      groups.get(p.todayStatus)!.push(p);
    }
    const order: DayStatus[] = ['office', 'wfh', 'away', 'off-sick', 'out-of-office', 'unknown'];
    const result: Bucket[] = [];
    for (const s of order) {
      const list = groups.get(s);
      if (list && list.length > 0) {
        result.push({ status: s, label: STATUS_META[s].label, people: list });
      }
    }
    return result;
  }, [people]);

  const officeCount = buckets.find(b => b.status === 'office')?.people.length ?? 0;
  const wfhCount = buckets.find(b => b.status === 'wfh')?.people.length ?? 0;
  const totalActive = people.length;

  /* —— week grid data: status-rows × day-columns —— */
  type StatusRow = { status: DayStatus; label: string; dayNames: string[][] };
  const weekGrid = useMemo((): StatusRow[] => {
    const withData = people.filter(p => p.weekStatuses.some(s => s !== 'unknown'));
    if (withData.length === 0) return [];

    const order: DayStatus[] = ['office', 'wfh', 'away', 'off-sick', 'out-of-office'];
    const rows: StatusRow[] = [];

    for (const status of order) {
      const dayNames: string[][] = DAY_NAMES.map((_, dayIdx) =>
        withData
          .filter(p => p.weekStatuses[dayIdx] === status)
          .map(p => p.firstName)
      );
      // Only include this status row if at least one person has it on at least one day
      if (dayNames.some(names => names.length > 0)) {
        rows.push({ status, label: STATUS_META[status].label, dayNames });
      }
    }
    return rows;
  }, [people]);

  /* —— today label —— */
  const todayLabel = useMemo(() => {
    const d = new Date();
    const dow = d.getDay();
    if (dow === 0 || dow === 6) {
      const nextMon = new Date(d);
      nextMon.setDate(d.getDate() + (dow === 0 ? 1 : 2));
      return `Monday ${nextMon.getDate()} ${MONTH_NAMES[nextMon.getMonth()]}`;
    }
    return `${DAY_NAMES[dow - 1]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  }, []);

  /* —— render —— */
  return (
    <div
      className="attendance-panel"
      role="button"
      tabIndex={0}
      onClick={() => setExpanded(prev => !prev)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(prev => !prev); }}
      onMouseEnter={() => setPanelHovered(true)}
      onMouseLeave={() => setPanelHovered(false)}
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: isLoading ? 'var(--spacing-sm)' : (buckets.length > 0 ? 'var(--spacing-sm)' : 0),
        padding: '10px 14px',
        background: panelHovered ? panelBgHov : panelBg,
        border: `1px solid ${panelBorder}`,
        fontFamily: 'var(--font-primary)',
        cursor: 'pointer',
        transition: 'background var(--transition-base), border-color var(--transition-fast)',
      }}
    >
      {/* ── Header row ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FiMonitor style={{ fontSize: 11, color: accentColor, strokeWidth: 2.2 }} />
          <span style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: isDarkMode ? '#ffffff' : '#061733',
            letterSpacing: '0.02em',
          }}>
            Attendance
          </span>

          {!isLoading && totalActive > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {officeCount > 0 && (
                <span style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: textMuted,
                  padding: '1px 6px',
                  background: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                  border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`,
                }}>
                  {officeCount} in office
                </span>
              )}
              {wfhCount > 0 && (
                <span style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: textMuted,
                  padding: '1px 6px',
                  background: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
                  border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`,
                }}>
                  {wfhCount} WFH
                </span>
              )}
            </div>
          )}

          {!isLoading && totalActive === 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: textBody }}>
              No data
            </span>
          )}
        </div>

        <span className="attendance-manage" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: panelHovered || expanded ? accentColor : textMuted,
          transition: 'color var(--transition-fast)',
        }}>
          {expanded ? 'Collapse' : todayLabel}
          <FiChevronRight style={{
            fontSize: 10,
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform var(--transition-fast)',
          }} />
        </span>
      </div>

      {/* ── Loading skeleton ── */}
      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {[100, 130, 90].map((w, i) => (
            <div key={i} style={{
              width: w,
              height: 28,
              background: panelBorder,
              animation: 'attendancePulse 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
            }} />
          ))}
        </div>
      )}

      {/* ── Person tiles grouped by status ── */}
      {!isLoading && buckets.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '14px',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}>
          {buckets.map((bucket, bIdx) => (
            <React.Fragment key={bucket.status}>
              {bIdx > 0 && (
                <div className="attendance-divider" style={{
                  width: 1,
                  alignSelf: 'stretch',
                  background: panelBorder,
                  flexShrink: 0,
                }} />
              )}

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
              }}>
                {/* Status label */}
                <span className="attendance-bucket" style={{
                  fontSize: 'var(--text-2xs)',
                  fontWeight: 700,
                  color: textMuted,
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>
                  {bucket.label}
                </span>

                {/* Person tiles */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {bucket.people.map(person => {
                    const isHovered = hoveredTile === person.initials;
                    return (
                      <div
                        key={person.initials}
                        className="attendance-tile"
                        title={`${person.firstName} — ${STATUS_META[person.todayStatus].label}${!person.confirmed ? ' (unconfirmed)' : ''}`}
                        onMouseEnter={() => setHoveredTile(person.initials)}
                        onMouseLeave={() => setHoveredTile(null)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '3px 10px 3px 4px',
                          background: isHovered ? tileBgHov : tileBg,
                          border: `1px solid ${isHovered ? tileBdrHov : tileBorder}`,
                          transition: 'border-color var(--transition-fast), background var(--transition-fast)',
                          flexShrink: 0,
                          opacity: person.confirmed ? 1 : 0.65,
                        }}
                      >
                        {/* Initials badge */}
                        <div style={{
                          width: 22,
                          height: 22,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: badgeBg,
                          fontSize: 8,
                          fontWeight: 800,
                          color: accentColor,
                          letterSpacing: '0.3px',
                          flexShrink: 0,
                        }}>
                          {person.initials}
                        </div>

                        {/* Name */}
                        <span className="attendance-name" style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: textLabel,
                          whiteSpace: 'nowrap',
                        }}>
                          {person.firstName}
                        </span>

                        {/* Status dot */}
                        <div style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: STATUS_META[person.todayStatus].colorVar,
                          flexShrink: 0,
                        }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ── Expanded week-at-a-glance (status rows × day columns) ── */}
      <div style={{
        overflow: 'hidden',
        maxHeight: expanded ? '600px' : '0',
        opacity: expanded ? 1 : 0,
        transition: 'max-height 0.35s ease, opacity 0.2s ease, margin-top 0.3s ease',
        marginTop: expanded ? '10px' : '0',
      }}>
        {weekGrid.length === 0 ? (
          <div style={{ padding: '8px 2px', color: textMuted, fontSize: 13 }}>
            No attendance data for this week yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Day header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `72px repeat(5, 1fr)`,
              gap: 0,
              alignItems: 'end',
              paddingBottom: 4,
            }}>
              <div /> {/* spacer for status label column */}
              {DAY_NAMES.map((d, i) => (
                <div key={d} style={{
                  textAlign: 'center',
                }}>
                  <span style={{
                    fontSize: 9,
                    fontWeight: i === dayIdx ? 800 : 600,
                    color: i === dayIdx ? accentColor : textMuted,
                    lineHeight: 1.3,
                  }}>
                    {d}
                  </span>
                </div>
              ))}
            </div>

            {/* Status rows */}
            {weekGrid.map(row => {
              const meta = STATUS_META[row.status];
              const statusBg = row.status === 'office'
                ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)')
                : row.status === 'wfh'
                ? (isDarkMode ? 'rgba(32, 178, 108, 0.06)' : 'rgba(32, 178, 108, 0.03)')
                : row.status === 'away'
                ? (isDarkMode ? 'rgba(160, 160, 160, 0.05)' : 'rgba(107, 107, 107, 0.03)')
                : row.status === 'off-sick'
                ? (isDarkMode ? 'rgba(214, 85, 65, 0.06)' : 'rgba(214, 85, 65, 0.03)')
                : (isDarkMode ? 'rgba(255, 140, 0, 0.06)' : 'rgba(255, 140, 0, 0.03)');

              return (
                <div
                  key={row.status}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `72px repeat(5, 1fr)`,
                    gap: 0,
                    alignItems: 'start',
                    minHeight: 24,
                    background: statusBg,
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'}`,
                    padding: '4px 0',
                  }}
                >
                  {/* Status label */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    paddingLeft: 2,
                    paddingRight: 6,
                  }}>
                    <div style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: meta.colorVar,
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: textBody,
                      whiteSpace: 'nowrap',
                      letterSpacing: '0.2px',
                    }}>
                      {row.label}
                    </span>
                  </div>

                  {/* Day columns — names for this status */}
                  {row.dayNames.map((names, i) => {
                    const isToday = i === dayIdx;
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1,
                          padding: '1px 3px',
                          borderLeft: isToday
                            ? `2px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.35)' : 'rgba(54, 144, 206, 0.25)'}`
                            : '2px solid transparent',
                          minHeight: 16,
                        }}
                      >
                        {names.length > 0 ? names.map(name => (
                          <span
                            key={name}
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              color: textBody,
                              lineHeight: 1.5,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {name}
                          </span>
                        )) : (
                          <span style={{
                            fontSize: 9,
                            color: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                          }}>
                            —
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes attendancePulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        @media (max-width: 640px) {
          .attendance-tile { padding: 3px 8px 3px 3px !important; }
          .attendance-bucket { font-size: 8px !important; }
        }
        @media (max-width: 420px) {
          .attendance-panel { padding: 8px 10px !important; }
          .attendance-tile { padding: 2px 6px 2px 2px !important; gap: 4px !important; }
          .attendance-name { font-size: 10px !important; }
          .attendance-divider { display: none !important; }
          .attendance-manage { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default AttendanceInsight;
