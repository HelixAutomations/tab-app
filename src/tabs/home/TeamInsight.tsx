import React, { useMemo, useState, useCallback } from 'react';
import { FiUsers, FiMonitor, FiChevronRight, FiCheck, FiX } from 'react-icons/fi';
import type { AnnualLeaveRecord } from '../../app/functionality/types';

/**
 * TeamInsight — unified "who's where + who's off" panel for the Home page.
 *
 * Two visual sections inside one panel:
 *   1) Attendance — today's status tiles + expandable week grid (status-rows × day-columns)
 *   2) Leave — time-bucket tiles (away today / later this week / next week)
 *      + expandable 14-day calendar swimlane
 *
 * Mirrors the AwayInsight / AttendanceInsight design language with shared palette.
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
  Last?: string;
  Role?: string;
  status?: string;
}

interface AwayEntry {
  initials: string;
  firstName: string;
  startLabel: string;
  endLabel: string;
  rangeLabel: string;
  returnLabel: string;
}

export interface TeamInsightProps {
  isDarkMode: boolean;
  attendanceRecords: AttendanceRecord[];
  teamData: TeamMember[];
  annualLeaveRecords: AnnualLeaveRecord[];
  futureLeaveRecords: AnnualLeaveRecord[];
  isLoadingAttendance?: boolean;
  isLoadingLeave?: boolean;
  onConfirmAttendance?: (initials: string, weekStart: string, attendanceDays: string) => Promise<void>;
  onUnconfirmAttendance?: (initials: string, weekStart: string) => Promise<void>;
  onShowToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning', details?: string) => void;
}

interface TeamSkeletonSectionProps {
  labelWidth: number;
  toggleWidth: number;
  groupLabelWidth: number[];
  tileCounts: number[];
  tileSize: { width: number; height: number };
  groupedRows?: boolean;
}

/* ─── constants ────────────────────────────────────────── */

type DayStatus = 'office' | 'wfh' | 'away' | 'off-sick' | 'out-of-office' | 'unknown';

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DAY_NAMES_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VALID_STATUSES: DayStatus[] = ['office', 'wfh', 'away', 'off-sick', 'out-of-office'];

const STATUS_META: Record<DayStatus, { label: string; shortLabel: string; colorVar: string }> = {
  office:          { label: 'In Office',        shortLabel: 'Office',  colorVar: 'var(--helix-highlight)' },
  wfh:             { label: 'Working from Home', shortLabel: 'WFH',    colorVar: 'var(--helix-green)' },
  away:            { label: 'Away',              shortLabel: 'Away',   colorVar: 'var(--text-muted)' },
  'off-sick':      { label: 'Off Sick',          shortLabel: 'Sick',   colorVar: 'var(--helix-cta)' },
  'out-of-office': { label: 'Out of Office',     shortLabel: 'OOO',    colorVar: 'var(--helix-orange)' },
  unknown:         { label: 'Unconfirmed',        shortLabel: '?',      colorVar: 'var(--text-muted)' },
};

type GridPerson = { firstName: string; initials: string };
type StatusRow = { status: DayStatus; label: string; shortLabel: string; dayCells: GridPerson[][] };

/* ─── date helpers ─────────────────────────────────────── */

const todayIndex = (): number => {
  const d = new Date().getDay();
  if (d === 0) return 0;
  if (d === 6) return 4;
  return d - 1;
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

const weekStart = (d: Date): Date => {
  const copy = new Date(d);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
  return copy;
};

const weekEnd = (d: Date): Date => {
  const mon = weekStart(d);
  const fri = new Date(mon);
  fri.setDate(fri.getDate() + 4);
  return fri;
};

const rangesOverlap = (aS: Date, aE: Date, bS: Date, bE: Date): boolean =>
  aS <= bE && bS <= aE;

const nextWorkingDay = (d: Date): Date => {
  const ret = new Date(d);
  ret.setDate(ret.getDate() + 1);
  while (ret.getDay() === 0 || ret.getDay() === 6) ret.setDate(ret.getDate() + 1);
  return ret;
};

const formatReturn = (endDate: Date, today: Date): string => {
  const back = nextWorkingDay(endDate);
  const diffDays = Math.round((back.getTime() - today.getTime()) / 86400000);
  if (diffDays <= 1) return 'back tomorrow';
  if (diffDays <= 6) return `back ${DAY_NAMES_FULL[back.getDay()]}`;
  return `back ${back.getDate()} ${MONTH_NAMES[back.getMonth()]}`;
};

const formatStartLabel = (startDate: Date, today: Date): string => {
  const diffDays = Math.round((startDate.getTime() - today.getTime()) / 86400000);
  if (diffDays === 1) return 'tomorrow';
  return `${DAY_NAMES_FULL[startDate.getDay()]} ${startDate.getDate()}`;
};

/** Find return date from the relevant leave block (ignores later separate leave periods). */
const personReturnLabel = (personKey: string, allLeave: AnnualLeaveRecord[], today: Date, anchorEndDate: Date): string => {
  // Collect all off-day date keys for this person
  const offDays = new Set<string>();
  for (const r of allLeave) {
    if (r.person.toUpperCase() !== personKey) continue;
    const s = parseDate(r.start_date);
    const e = parseDate(r.end_date);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) continue;
    const cursor = new Date(s);
    while (cursor <= e) {
      offDays.add(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  // Walk forward from the current block end; if adjacent/overlapping leave exists it will be skipped via offDays.
  const probe = new Date(anchorEndDate);
  probe.setDate(probe.getDate() + 1);
  for (let i = 0; i < 60; i++) {
    const dow = probe.getDay();
    if (dow !== 0 && dow !== 6 && !offDays.has(probe.toISOString().slice(0, 10))) {
      const diffDays = Math.round((probe.getTime() - today.getTime()) / 86400000);
      if (diffDays <= 1) return 'back tomorrow';
      if (diffDays <= 6) return `back ${DAY_NAMES_FULL[probe.getDay()]}`;
      return `back ${probe.getDate()} ${MONTH_NAMES[probe.getMonth()]}`;
    }
    probe.setDate(probe.getDate() + 1);
  }
  return 'back soon';
};

const formatRangeShort = (startDate: Date, endDate: Date): string => {
  const s = `${startDate.getDate()} ${MONTH_NAMES[startDate.getMonth()]}`;
  const e = `${endDate.getDate()} ${MONTH_NAMES[endDate.getMonth()]}`;
  return `${s}–${e}`;
};

/* ─── attendance parser ────────────────────────────────── */

const parseDays = (raw: string): DayStatus[] => {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return Array(5).fill('unknown') as DayStatus[];

  if (VALID_STATUSES.includes(s as DayStatus)) return Array(5).fill(s) as DayStatus[];

  const tokens = s.split(',').map(t => t.trim()).filter(Boolean);

  if (tokens.length === 5 && tokens.every(t => VALID_STATUSES.includes(t as DayStatus))) {
    return tokens as DayStatus[];
  }

  const hasPairs = tokens.some(t => t.includes(':'));
  if (hasPairs) {
    const map: Record<string, DayStatus> = {};
    for (const t of tokens) {
      const [dayPart, statusPart] = t.split(':');
      if (dayPart && statusPart && VALID_STATUSES.includes(statusPart as DayStatus)) {
        map[dayPart.slice(0, 3)] = statusPart as DayStatus;
      }
    }
    return WEEKDAY_NAMES.map(d => map[d.toLowerCase()] || 'wfh');
  }

  return WEEKDAY_NAMES.map(d => {
    const lower = d.toLowerCase();
    return tokens.includes(lower) || tokens.includes(lower.slice(0, 3)) ? 'office' : 'wfh';
  });
};

/* ─── component ────────────────────────────────────────── */

const TeamInsight: React.FC<TeamInsightProps> = ({
  isDarkMode,
  attendanceRecords,
  teamData,
  annualLeaveRecords,
  futureLeaveRecords,
  isLoadingAttendance = false,
  isLoadingLeave = false,
  onConfirmAttendance,
  onUnconfirmAttendance,
  onShowToast,
}) => {
  const [hoveredPerson, setHoveredPerson] = useState<string | null>(null);
  const [panelHovered, setPanelHovered] = useState(false);
  const [attSectionHovered, setAttSectionHovered] = useState(false);
  const [leaveSectionHovered, setLeaveSectionHovered] = useState(false);
  const [attendanceExpanded, setAttendanceExpanded] = useState(false);
  const [leaveExpanded, setLeaveExpanded] = useState(false);
  const [selectedPeople, setSelectedPeople] = useState<Set<string>>(new Set());

  /** Toggle a person in/out of the filter set. */
  const togglePerson = (initials: string, e: React.MouseEvent) => {
    e.stopPropagation(); // don't toggle section expand/collapse
    setSelectedPeople(prev => {
      const next = new Set(prev);
      if (next.has(initials)) next.delete(initials);
      else next.add(initials);
      return next;
    });
  };
  const hasFilter = selectedPeople.size > 0;
  const isSelected = (ini: string) => selectedPeople.has(ini);
  const [confirmingPerson, setConfirmingPerson] = useState<string | null>(null);

  /* ── attendance confirm modal state ──────────────── */
  const currentWeekStart = useMemo(() => weekStartDate(0), []);
  const nextWeekStartStr = useMemo(() => weekStartDate(1), []);
  const [modalPerson, setModalPerson] = useState<PersonStatus | null>(null);
  const [modalThisWeek, setModalThisWeek] = useState<DayStatus[]>(Array(5).fill('wfh'));
  const [modalNextWeek, setModalNextWeek] = useState<DayStatus[]>(Array(5).fill('wfh'));
  const [modalSaving, setModalSaving] = useState(false);

  const CYCLE_STATUSES: DayStatus[] = ['office', 'wfh', 'away', 'off-sick', 'out-of-office'];
  const cycleDayStatus = (current: DayStatus): DayStatus => {
    const idx = CYCLE_STATUSES.indexOf(current);
    return CYCLE_STATUSES[(idx + 1) % CYCLE_STATUSES.length];
  };

  /** Open the confirm-attendance modal for a person (works for both confirmed and unconfirmed). */
  const openConfirmModal = (person: PersonStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmingPerson || !onConfirmAttendance) return;
    setModalThisWeek([...person.weekStatuses]);
    setModalNextWeek(Array(5).fill('wfh'));
    setModalPerson(person);
  };

  /** Submit both weeks from the modal. */
  const submitConfirmModal = useCallback(async () => {
    if (!modalPerson || !onConfirmAttendance) return;
    setModalSaving(true);
    setConfirmingPerson(modalPerson.initials);
    try {
      // Save current week
      await onConfirmAttendance(modalPerson.initials, currentWeekStart, modalThisWeek.join(','));
      // Save next week
      await onConfirmAttendance(modalPerson.initials, nextWeekStartStr, modalNextWeek.join(','));
      onShowToast?.(`${modalPerson.firstName}'s attendance confirmed for both weeks`, 'success');
      setModalPerson(null);
    } catch (err) {
      onShowToast?.(`Failed to confirm ${modalPerson.firstName}`, 'error', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setModalSaving(false);
      setConfirmingPerson(null);
    }
  }, [modalPerson, onConfirmAttendance, currentWeekStart, nextWeekStartStr, modalThisWeek, modalNextWeek, onShowToast]);

  /* —— palette (shared) —— */
  const panelBg      = isDarkMode ? 'var(--helix-website-blue)' : 'var(--surface-section)';
  const panelBgHov   = isDarkMode ? 'rgba(6, 23, 51, 0.5)' : 'var(--surface-card-hover)';
  const panelBorder  = isDarkMode ? 'rgba(75, 85, 99, 0.4)' : 'var(--border-strong)';

  // Tiles & badges — brand navy fills + highlight blue borders (no teal accent washes)
  const tileBg       = isDarkMode ? 'rgba(6, 23, 51, 0.5)' : 'rgba(54, 144, 206, 0.04)';
  const tileBgHov    = isDarkMode ? 'rgba(13, 47, 96, 0.5)' : 'rgba(54, 144, 206, 0.08)';
  const tileBorder   = isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.1)';
  const tileBdrHov   = isDarkMode ? 'rgba(54, 144, 206, 0.45)' : 'rgba(54, 144, 206, 0.3)';
  // Initials squares — solid brand surface (EnquiriesReport pattern)
  const badgeBg      = isDarkMode ? '#051525' : '#F4F4F6';

  const textLabel    = isDarkMode ? '#ffffff' : 'var(--text-primary)';
  const textBody     = isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'var(--text-body)';
  const textMuted    = isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'var(--text-muted)';
  const accentColor  = 'var(--text-accent)';
  const sectionDivider = isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(0, 0, 0, 0.06)';
  const skeletonStrong = isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(13, 47, 96, 0.07)';
  const skeletonSoft = isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(13, 47, 96, 0.05)';
  const skeletonTileBg = isDarkMode ? 'rgba(6, 23, 51, 0.7)' : 'rgba(13, 47, 96, 0.05)';
  const skeletonTileBorder = isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.10)';

  const renderSkeletonLine = (width: number | string, height: number, delay = 0) => (
    <div
      style={{
        width,
        height,
        borderRadius: 2,
        background: height >= 11 ? skeletonStrong : skeletonSoft,
        animation: `teamPulse 1.4s ease-in-out infinite ${delay}s`,
      }}
    />
  );

  const renderSectionSkeleton = ({
    labelWidth,
    toggleWidth,
    groupLabelWidth,
    tileCounts,
    tileSize,
    groupedRows = false,
  }: TeamSkeletonSectionProps) => (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 11, height: 11, borderRadius: 2, background: isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(54,144,206,0.16)' }} />
          {renderSkeletonLine(labelWidth, 11)}
        </div>
        {renderSkeletonLine(toggleWidth, 10, 0.08)}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {tileCounts.map((count, groupIndex) => (
          <React.Fragment key={`${labelWidth}-${groupIndex}`}>
            {groupIndex > 0 ? <div style={{ width: 1, alignSelf: 'stretch', background: sectionDivider, flexShrink: 0 }} /> : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: groupedRows ? 120 : undefined }}>
              {renderSkeletonLine(groupLabelWidth[groupIndex] || groupLabelWidth[groupLabelWidth.length - 1] || 52, 9, groupIndex * 0.05)}
              {groupedRows ? (
                <div style={{ display: 'grid', gap: 6, minWidth: 120 }}>
                  {Array.from({ length: count }).map((_, rowIndex) => (
                    <div key={rowIndex} style={{ display: 'grid', gridTemplateColumns: `${tileSize.width}px 1fr`, gap: 8, alignItems: 'center' }}>
                      <div style={{ width: tileSize.width, height: tileSize.height, background: skeletonTileBg, border: `1px solid ${skeletonTileBorder}`, animation: `teamPulse 1.4s ease-in-out infinite ${groupIndex * 0.05 + rowIndex * 0.03}s` }} />
                      {renderSkeletonLine(rowIndex === 0 ? '78%' : '62%', 10, 0.04 + groupIndex * 0.05 + rowIndex * 0.03)}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxWidth: 160 }}>
                  {Array.from({ length: count }).map((_, tileIndex) => (
                    <div
                      key={tileIndex}
                      style={{
                        width: tileSize.width,
                        height: tileSize.height,
                        background: skeletonTileBg,
                        border: `1px solid ${skeletonTileBorder}`,
                        animation: `teamPulse 1.4s ease-in-out infinite ${groupIndex * 0.05 + tileIndex * 0.03}s`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
  // Section hover — brand navy lift, not teal wash
  const sectionHoverBg = isDarkMode ? 'rgba(13, 47, 96, 0.28)' : 'rgba(54, 144, 206, 0.06)';
  const sectionHoverRing = isDarkMode ? 'rgba(54, 144, 206, 0.5)' : 'rgba(54, 144, 206, 0.35)';
  const sectionHoverShadow = isDarkMode
    ? 'inset 0 0 0 1px rgba(54, 144, 206, 0.3), 0 4px 14px rgba(0, 0, 0, 0.3)'
    : 'inset 0 0 0 1px rgba(54, 144, 206, 0.22), 0 2px 10px rgba(6, 23, 51, 0.08)';
  const selectedBorder = isDarkMode ? 'rgba(54, 144, 206, 0.6)' : 'rgba(54, 144, 206, 0.5)';
  const selectedBg     = isDarkMode ? 'rgba(13, 47, 96, 0.5)' : 'rgba(54, 144, 206, 0.12)';

  /* ═══════════════════════════════════════════════════════
   * SECTION 1: ATTENDANCE DATA
   * ═══════════════════════════════════════════════════════ */

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

  /* leave lookup (people on leave today — for attendance overrides) */
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

  const dayIdx = useMemo(todayIndex, []);

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

        const rec = attendanceRecords.find(
          r => r.Initials === ini && normalizeDate(r.Week_Start) === currentWeekStart
        );

        const isConfirmed = Boolean(rec?.Confirmed_At);
        let weekStatuses: DayStatus[];

        if (!isConfirmed) {
          // Unconfirmed → always show unknown regardless of stale data
          weekStatuses = Array(5).fill('unknown') as DayStatus[];
        } else {
          const rawDays = rec?.Attendance_Days || rec?.Status || (rec as any)?.status || '';
          weekStatuses = parseDays(rawDays);
        }

        if (leaveToday.has(ini)) {
          weekStatuses = weekStatuses.map((s, i) => i === dayIdx ? 'away' : s);
        }

        return {
          initials: info.initials,
          firstName: info.firstName,
          todayStatus: weekStatuses[dayIdx],
          weekStatuses,
          confirmed: isConfirmed,
        };
      })
      .sort((a, b) => {
        const order: Record<DayStatus, number> = { office: 0, wfh: 1, away: 2, 'off-sick': 3, 'out-of-office': 4, unknown: 5 };
        return (order[a.todayStatus] ?? 5) - (order[b.todayStatus] ?? 5) || a.firstName.localeCompare(b.firstName);
      });
  }, [teamData, attendanceRecords, nameMap, leaveToday, dayIdx, currentWeekStart]);

  /* group by status */
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
      if (list && list.length > 0) result.push({ status: s, label: STATUS_META[s].label, people: list });
    }
    return result;
  }, [people]);

  const officeCount = buckets.find(b => b.status === 'office')?.people.length ?? 0;
  const wfhCount = buckets.find(b => b.status === 'wfh')?.people.length ?? 0;
  const totalActive = people.length;

  /* week grid: status-rows × day-columns (filtered by selectedPeople) */
  const weekGrid = useMemo((): StatusRow[] => {
    const base = people.filter(p => p.weekStatuses.some(s => s !== 'unknown'));
    const withData = hasFilter ? base.filter(p => selectedPeople.has(p.initials)) : base;
    if (withData.length === 0) return [];

    const order: DayStatus[] = ['office', 'wfh', 'away', 'off-sick', 'out-of-office'];
    const rows: StatusRow[] = [];

    for (const status of order) {
      const dayCells: GridPerson[][] = WEEKDAY_NAMES.map((_, di) =>
        withData.filter(p => p.weekStatuses[di] === status).map(p => ({ firstName: p.firstName, initials: p.initials }))
      );
      if (dayCells.some(cell => cell.length > 0)) {
        rows.push({
          status,
          label: STATUS_META[status].label,
          shortLabel: STATUS_META[status].shortLabel,
          dayCells,
        });
      }
    }
    return rows;
  }, [people, hasFilter, selectedPeople]);

  /* today label */
  const todayLabel = useMemo(() => {
    const d = new Date();
    const dow = d.getDay();
    if (dow === 0 || dow === 6) {
      const nextMon = new Date(d);
      nextMon.setDate(d.getDate() + (dow === 0 ? 1 : 2));
      return `Monday ${nextMon.getDate()} ${MONTH_NAMES[nextMon.getMonth()]}`;
    }
    return `${WEEKDAY_NAMES[dow - 1]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  }, []);

  const attendanceHeadingLabel = useMemo(() => {
    const dow = new Date().getDay();
    return dow === 0 || dow === 6 ? `Attendance ${todayLabel}` : 'Attendance today';
  }, [todayLabel]);

  /* ═══════════════════════════════════════════════════════
   * SECTION 2: LEAVE DATA
   * ═══════════════════════════════════════════════════════ */

  const allLeave = useMemo(() => {
    const seen = new Set<string>();
    const merged: AnnualLeaveRecord[] = [];
    for (const r of [...annualLeaveRecords, ...futureLeaveRecords]) {
      const key = `${r.person}-${r.start_date}-${r.end_date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const st = (r.status || '').toLowerCase();
      if (st === 'approved' || st === 'booked') merged.push(r);
    }
    return merged;
  }, [annualLeaveRecords, futureLeaveRecords]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const thisWeekEnd_ = useMemo(() => weekEnd(today), [today]);
  const nextWeekStart_ = useMemo(() => {
    const d = new Date(weekStart(today));
    d.setDate(d.getDate() + 7);
    return d;
  }, [today]);
  const nextWeekEnd_ = useMemo(() => {
    const d = new Date(nextWeekStart_);
    d.setDate(d.getDate() + 4);
    return d;
  }, [nextWeekStart_]);

  /* categorise into time buckets */
  const { awayToday, laterThisWeek, nextWeek } = useMemo(() => {
    const todayBucket: AwayEntry[] = [];
    const laterBucket: AwayEntry[] = [];
    const nextBucket: AwayEntry[] = [];
    const claimed = new Set<string>();
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const toEntry = (r: AnnualLeaveRecord, bucket: 'awayToday' | 'laterThisWeek' | 'nextWeek'): AwayEntry => {
      const ini = r.person.toUpperCase();
      const info = nameMap.get(ini) || { firstName: ini, initials: ini };
      const start = parseDate(r.start_date);
      const end = parseDate(r.end_date);
      const timingLabel = bucket === 'awayToday'
        ? personReturnLabel(ini, allLeave, today, end)
        : formatStartLabel(start, today);
      return {
        initials: info.initials,
        firstName: info.firstName,
        startLabel: `${start.getDate()} ${MONTH_NAMES[start.getMonth()]}`,
        endLabel: `${end.getDate()} ${MONTH_NAMES[end.getMonth()]}`,
        rangeLabel: formatRangeShort(start, end),
        returnLabel: timingLabel,
      };
    };

    for (const r of allLeave) {
      const ini = r.person.toUpperCase();
      const s = parseDate(r.start_date); const e = parseDate(r.end_date);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) continue;
      if (today >= s && today <= e && !claimed.has(ini)) { claimed.add(ini); todayBucket.push(toEntry(r, 'awayToday')); }
    }
    for (const r of allLeave) {
      const ini = r.person.toUpperCase(); if (claimed.has(ini)) continue;
      const s = parseDate(r.start_date); const e = parseDate(r.end_date);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) continue;
      if (tomorrow <= thisWeekEnd_ && rangesOverlap(s, e, tomorrow, thisWeekEnd_) && (e > today || s > today)) {
        claimed.add(ini); laterBucket.push(toEntry(r, 'laterThisWeek'));
      }
    }
    for (const r of allLeave) {
      const ini = r.person.toUpperCase(); if (claimed.has(ini)) continue;
      const s = parseDate(r.start_date); const e = parseDate(r.end_date);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) continue;
      if (rangesOverlap(s, e, nextWeekStart_, nextWeekEnd_)) { claimed.add(ini); nextBucket.push(toEntry(r, 'nextWeek')); }
    }

    return { awayToday: todayBucket, laterThisWeek: laterBucket, nextWeek: nextBucket };
  }, [allLeave, today, thisWeekEnd_, nextWeekStart_, nextWeekEnd_, nameMap]);

  const leaveCount = awayToday.length + laterThisWeek.length + nextWeek.length;

  type LeaveSeg = { label: string; entries: AwayEntry[] };
  const leaveSegments: LeaveSeg[] = [];
  if (awayToday.length)     leaveSegments.push({ label: 'Away today',      entries: awayToday });
  if (laterThisWeek.length) leaveSegments.push({ label: 'Later this week', entries: laterThisWeek });
  if (nextWeek.length)      leaveSegments.push({ label: 'Next week',       entries: nextWeek });

  /* calendar swimlane data */
  const calendarData = useMemo(() => {
    const MS_DAY = 86_400_000;
    const horizon = new Date(today.getTime() + 14 * MS_DAY);

    const days: { date: Date; key: string; day: number; dayLetter: string; month: string; isMonday: boolean }[] = [];
    const cursor = new Date(today);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= horizon) {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) {
        days.push({
          date: new Date(cursor),
          key: cursor.toISOString().slice(0, 10),
          day: cursor.getDate(),
          dayLetter: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dow],
          month: MONTH_NAMES[cursor.getMonth()],
          isMonday: dow === 1,
        });
      }
      cursor.setTime(cursor.getTime() + MS_DAY);
    }

    const personMap = new Map<string, { name: string; initials: string; offDays: Set<string> }>();
    for (const r of allLeave) {
      const start = parseDate(r.start_date);
      const end = parseDate(r.end_date);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < today) continue;

      const ini = r.person.toUpperCase();
      const info = nameMap.get(ini) || { firstName: ini, initials: ini };
      if (!personMap.has(ini)) personMap.set(ini, { name: info.firstName, initials: info.initials, offDays: new Set() });

      const walk = new Date(Math.max(start.getTime(), today.getTime()));
      walk.setHours(0, 0, 0, 0);
      while (walk <= end && walk <= horizon) {
        const dow = walk.getDay();
        if (dow !== 0 && dow !== 6) personMap.get(ini)!.offDays.add(walk.toISOString().slice(0, 10));
        walk.setTime(walk.getTime() + MS_DAY);
      }
    }

    const people = Array.from(personMap.values())
      .filter(p => p.offDays.size > 0)
      .sort((a, b) => {
        const aFirst = days.find(d => a.offDays.has(d.key))?.key || 'z';
        const bFirst = days.find(d => b.offDays.has(d.key))?.key || 'z';
        return aFirst.localeCompare(bFirst) || a.name.localeCompare(b.name);
      });

    return { days, people };
  }, [allLeave, today, nameMap]);

  /* ═══════════════════════════════════════════════════════
   * RENDER
   * ═══════════════════════════════════════════════════════ */

  const isLoading = isLoadingAttendance || isLoadingLeave;

  return (
    <div
      className="team-panel"
      onMouseEnter={() => setPanelHovered(true)}
      onMouseLeave={() => setPanelHovered(false)}
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        padding: 0,
        background: panelHovered ? panelBgHov : panelBg,
        border: `1px solid ${panelBorder}`,
        fontFamily: 'var(--font-primary)',
        transition: 'background var(--transition-base), border-color var(--transition-fast)',
      }}
    >
      {/* ════════════════════════════════════════════════════
       * SECTION A: ATTENDANCE
       * ════════════════════════════════════════════════════ */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setAttendanceExpanded(prev => !prev)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAttendanceExpanded(prev => !prev); }}
        onMouseEnter={() => setAttSectionHovered(true)}
        onMouseLeave={() => setAttSectionHovered(false)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isLoadingAttendance ? '12px' : (buckets.length > 0 ? '12px' : 0),
          padding: '14px 16px',
          cursor: 'pointer',
          background: attSectionHovered ? sectionHoverBg : 'transparent',
          boxShadow: attSectionHovered ? sectionHoverShadow : 'none',
          outline: attSectionHovered ? `1px solid ${sectionHoverRing}` : '1px solid transparent',
          outlineOffset: '-1px',
          transition: 'background var(--transition-fast), box-shadow var(--transition-fast), outline-color var(--transition-fast)',
        }}
      >
        {/* Header */}
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
              {attendanceHeadingLabel}
            </span>

            {!isLoadingAttendance && totalActive === 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: textBody }}>No data</span>
            )}
          </div>

          <span className="team-toggle" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: attSectionHovered || attendanceExpanded ? accentColor : textMuted,
            transition: 'color var(--transition-fast)',
          }}>
            {attendanceExpanded ? 'Collapse' : todayLabel}
            <FiChevronRight style={{
              fontSize: 10,
              transform: attendanceExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform var(--transition-fast)',
            }} />
          </span>
        </div>

        {/* Loading skeleton */}
        {isLoadingAttendance && (
          renderSectionSkeleton({
            labelWidth: 108,
            toggleWidth: 56,
            groupLabelWidth: [52, 46, 58],
            tileCounts: [4, 4, 3],
            tileSize: { width: 34, height: 34 },
          })
        )}

        {/* Compact avatar tiles — grouped by status, click to filter */}
        {!isLoadingAttendance && buckets.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
          }}>
            {buckets.map((bucket, bIdx) => (
              <React.Fragment key={bucket.status}>
                {bIdx > 0 && (
                  <div className="team-divider" style={{
                    width: 1,
                    alignSelf: 'stretch',
                    background: panelBorder,
                    flexShrink: 0,
                  }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span className="team-bucket" style={{
                    fontSize: 'var(--text-2xs)',
                    fontWeight: 700,
                    color: textMuted,
                    letterSpacing: '0.4px',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}>
                    {bucket.label}
                  </span>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {bucket.people.map(person => {
                      const sel = isSelected(person.initials);
                      const isHov = hoveredPerson === person.initials;
                      const isConfirming = confirmingPerson === person.initials;
                      return (
                        <div
                          key={person.initials}
                          className="team-avatar"
                          title={`${person.firstName} — ${STATUS_META[person.todayStatus].label}${!person.confirmed ? ' (unconfirmed)' : ''} — click to update${sel ? ' (filtered)' : ''}`}
                          onClick={(e) => {
                            if (onConfirmAttendance) {
                              openConfirmModal(person, e);
                            } else {
                              togglePerson(person.initials, e);
                            }
                          }}
                          onMouseEnter={() => setHoveredPerson(person.initials)}
                          onMouseLeave={() => setHoveredPerson(null)}
                          style={{
                            width: 24, height: 24,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: sel ? selectedBg : (isHov ? tileBgHov : badgeBg),
                            border: `1.5px solid ${sel ? selectedBorder : (isHov ? tileBdrHov : tileBorder)}`,
                            borderRadius: '50%',
                            fontSize: 8, fontWeight: 800,
                            color: sel ? accentColor : (isHov ? accentColor : textBody),
                            letterSpacing: '0.3px',
                            cursor: 'pointer',
                            transition: 'all var(--transition-fast)',
                            opacity: isConfirming ? 0.4 : (person.confirmed ? 1 : 0.55),
                            flexShrink: 0,
                            position: 'relative',
                            animation: isConfirming ? 'teamPulse 0.8s ease-in-out infinite' : undefined,
                          }}
                        >
                          {person.initials}
                          {/* Status dot */}
                          <div style={{
                            position: 'absolute',
                            bottom: -1, right: -1,
                            width: 6, height: 6,
                            borderRadius: '50%',
                            background: STATUS_META[person.todayStatus].colorVar,
                            border: `1px solid ${isDarkMode ? 'var(--helix-website-blue)' : 'var(--surface-section)'}`,
                          }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </React.Fragment>
            ))}
            {/* Clear filter chip */}
            {hasFilter && (
              <div
                onClick={(e) => { e.stopPropagation(); setSelectedPeople(new Set()); }}
                style={{
                  alignSelf: 'flex-end',
                  fontSize: 9,
                  fontWeight: 700,
                  color: accentColor,
                  cursor: 'pointer',
                  padding: '2px 6px',
                  background: isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.06)',
                  border: `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
                  borderRadius: 999,
                  letterSpacing: '0.3px',
                  transition: 'opacity var(--transition-fast)',
                }}
              >
                ✕ clear
              </div>
            )}
          </div>
        )}

        {/* Expanded week grid (status-rows × day-columns) */}
        <div style={{
          overflow: 'hidden',
          maxHeight: attendanceExpanded ? '600px' : '0',
          opacity: attendanceExpanded ? 1 : 0,
          transition: 'max-height 0.35s ease, opacity 0.2s ease, margin-top 0.3s ease',
          marginTop: attendanceExpanded ? '10px' : '0',
        }}>
          {weekGrid.length === 0 ? (
            <div style={{ padding: '8px 2px', color: textMuted, fontSize: 13 }}>
              {hasFilter ? 'No attendance data for selected people.' : 'No attendance data for this week yet.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* Day header row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '80px repeat(5, 1fr)',
                gap: 0,
                alignItems: 'end',
                paddingBottom: 4,
              }}>
                <div /> {/* spacer for status label column */}
                {WEEKDAY_NAMES.map((d, i) => (
                  <div key={d} style={{ textAlign: 'left', paddingLeft: 5 }}>
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
              {weekGrid.map((row, rowIdx) => {
                const meta = STATUS_META[row.status];
                // Use brand navy composition — NOT surface-ladder tokens which read greenish.
                // Dark: transparent (inherits panelBg #000319) vs subtle darkBlue overlay.
                // Light: white vs highlightBlue (#d6e8ff) tint.
                const statusBg = rowIdx % 2 === 0
                  ? 'transparent'
                  : (isDarkMode ? 'rgba(6, 23, 51, 0.45)' : 'rgba(214, 232, 255, 0.35)');

                return (
                  <div
                    key={row.status}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '80px repeat(5, 1fr)',
                      gap: 0,
                      alignItems: 'start',
                      minHeight: 24,
                      background: statusBg,
                      borderBottom: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(0, 0, 0, 0.06)'}`,
                      padding: '4px 0',
                    }}
                  >
                    {/* Status label — use short label to prevent overflow */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      paddingLeft: 4,
                      paddingRight: 4,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: meta.colorVar, flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: textBody,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        letterSpacing: '0.2px',
                      }}>
                        {row.shortLabel}
                      </span>
                    </div>

                    {/* Day columns — compact initials squares */}
                    {row.dayCells.map((cell, i) => {
                      const isToday = i === dayIdx;
                      return (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 2,
                            padding: '2px 3px',
                            borderLeft: isToday
                              ? `2px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.35)' : 'rgba(54, 144, 206, 0.25)'}`
                              : '2px solid transparent',
                            minHeight: 16,
                            alignItems: 'center',
                          }}
                        >
                          {cell.length > 0 ? (cell.map(gp => {
                            const gpHov = hoveredPerson === gp.initials;
                            return (
                              <div
                                key={gp.initials}
                                title={gp.firstName}
                                onMouseEnter={() => setHoveredPerson(gp.initials)}
                                onMouseLeave={() => setHoveredPerson(null)}
                                style={{
                                  width: 18, height: 18,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: gpHov ? tileBgHov : badgeBg,
                                  border: `0.5px solid ${gpHov ? selectedBorder : (isDarkMode ? 'rgba(55, 65, 81, 0.55)' : 'rgba(6, 23, 51, 0.12)')}`,
                                  boxShadow: isDarkMode ? '0 1px 2px rgba(0,0,0,0.3)' : '0 1px 2px rgba(6, 23, 51, 0.06)',
                                  fontSize: 7, fontWeight: 800,
                                  color: gpHov ? accentColor : (isDarkMode ? '#f3f4f6' : '#0D2F60'),
                                  letterSpacing: '0.2px',
                                  flexShrink: 0,
                                  transition: 'all var(--transition-fast)',
                                  cursor: 'default',
                                }}
                              >
                                {gp.initials}
                              </div>
                            );
                          })) : (
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
      </div>

      {/* ═══ Divider between sections ═══ */}
      <div style={{
        height: 1,
        background: sectionDivider,
        margin: '4px 16px',
      }} />

      {/* ════════════════════════════════════════════════════
       * SECTION B: LEAVE
       * ════════════════════════════════════════════════════ */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setLeaveExpanded(prev => !prev)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setLeaveExpanded(prev => !prev); }}
        onMouseEnter={() => setLeaveSectionHovered(true)}
        onMouseLeave={() => setLeaveSectionHovered(false)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: (leaveCount > 0 || isLoadingLeave) ? '12px' : 0,
          padding: '14px 16px',
          cursor: 'pointer',
          background: leaveSectionHovered ? sectionHoverBg : 'transparent',
          boxShadow: leaveSectionHovered ? sectionHoverShadow : 'none',
          outline: leaveSectionHovered ? `1px solid ${sectionHoverRing}` : '1px solid transparent',
          outlineOffset: '-1px',
          transition: 'background var(--transition-fast), box-shadow var(--transition-fast), outline-color var(--transition-fast)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiUsers style={{ fontSize: 11, color: accentColor, strokeWidth: 2.2 }} />
            <span style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: isDarkMode ? '#ffffff' : '#061733',
              letterSpacing: '0.02em',
            }}>
              Team Leave
            </span>

            {!isLoadingLeave && leaveCount === 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--helix-green)' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: textBody }}>Full team present</span>
              </div>
            )}
          </div>

          <span className="team-toggle" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: leaveSectionHovered || leaveExpanded ? accentColor : textMuted,
            transition: 'color var(--transition-fast)',
          }}>
            {leaveExpanded ? 'Collapse' : 'Upcoming leave'}
            <FiChevronRight style={{
              fontSize: 10,
              transform: leaveExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform var(--transition-fast)',
            }} />
          </span>
        </div>

        {/* Loading skeleton */}
        {isLoadingLeave && (
          renderSectionSkeleton({
            labelWidth: 82,
            toggleWidth: 86,
            groupLabelWidth: [64, 56, 68],
            tileCounts: [2, 2, 2],
            tileSize: { width: 18, height: 18 },
            groupedRows: true,
          })
        )}

        {/* Leave tiles by time bucket */}
        {!isLoadingLeave && leaveCount > 0 && (
          <div style={{
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
          }}>
            {leaveSegments.map((seg, segIdx) => (
              <React.Fragment key={seg.label}>
                {segIdx > 0 && (
                  <div className="team-divider" style={{
                    width: 1,
                    alignSelf: 'stretch',
                    background: panelBorder,
                    flexShrink: 0,
                  }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span className="team-bucket" style={{
                    fontSize: 'var(--text-2xs)',
                    fontWeight: 700,
                    color: textMuted,
                    letterSpacing: '0.4px',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}>
                    {seg.label}
                  </span>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {seg.entries.map(entry => {
                      const sel = isSelected(entry.initials);
                      const isHovered = hoveredPerson === entry.initials;
                      const dimmed = hasFilter && !sel;
                      return (
                        <div
                          key={entry.initials}
                          className="team-tile"
                          title={`${entry.firstName}: ${entry.rangeLabel}, ${entry.returnLabel}`}
                          onClick={(e) => togglePerson(entry.initials, e)}
                          onMouseEnter={() => setHoveredPerson(entry.initials)}
                          onMouseLeave={() => setHoveredPerson(null)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '3px 10px 3px 4px',
                            background: sel ? selectedBg : (isHovered ? tileBgHov : tileBg),
                            border: `1px solid ${sel ? selectedBorder : (isHovered ? tileBdrHov : tileBorder)}`,
                            transition: 'border-color var(--transition-fast), background var(--transition-fast), opacity var(--transition-fast)',
                            flexShrink: 0,
                            cursor: 'pointer',
                            opacity: dimmed ? 0.4 : 1,
                          }}
                        >
                          <div style={{
                            width: 22, height: 22,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: sel ? selectedBg : badgeBg,
                            fontSize: 8, fontWeight: 800, color: accentColor,
                            letterSpacing: '0.3px', flexShrink: 0,
                          }}>
                            {entry.initials}
                          </div>
                          <span className="team-name" style={{
                            fontSize: 11, fontWeight: 600, color: textLabel, whiteSpace: 'nowrap',
                          }}>
                            {entry.firstName}
                          </span>
                          <span className="team-return" style={{
                            fontSize: 'var(--text-2xs)', color: textMuted, whiteSpace: 'nowrap',
                          }}>
                            {entry.returnLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Expanded 14-day calendar swimlane */}
        <div style={{
          overflow: 'hidden',
          maxHeight: leaveExpanded ? '600px' : '0',
          opacity: leaveExpanded ? 1 : 0,
          transition: 'max-height 0.35s ease, opacity 0.2s ease, margin-top 0.3s ease',
          marginTop: leaveExpanded ? '10px' : '0',
        }}>
          {(hasFilter ? calendarData.people.filter(p => selectedPeople.has(p.initials)).length === 0 : calendarData.people.length === 0) ? (
            <div style={{ padding: '8px 2px', color: textMuted, fontSize: 13 }}>
              {hasFilter ? 'No leave data for selected people.' : 'No upcoming leave booked.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* Day header row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: `56px repeat(${calendarData.days.length}, 1fr)`,
                gap: 0,
                alignItems: 'end',
                paddingBottom: 3,
              }}>
                <div />
                {calendarData.days.map((d, i) => (
                  <div
                    key={d.key}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0,
                      borderLeft: d.isMonday && i > 0
                        ? `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(148, 163, 184, 0.15)'}`
                        : 'none',
                      paddingLeft: d.isMonday && i > 0 ? 1 : 0,
                    }}
                  >
                    <span style={{ fontSize: 8, fontWeight: 600, color: textMuted, lineHeight: 1 }}>
                      {d.dayLetter}
                    </span>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : '#374151',
                      lineHeight: 1.3,
                    }}>
                      {d.day}
                    </span>
                  </div>
                ))}
              </div>

              {/* Person swimlane rows (filtered by selection) */}
              {calendarData.people
              .filter(person => !hasFilter || selectedPeople.has(person.initials))
              .map(person => {
                const dayKeys = calendarData.days.map(d => d.key);
                const rowHov = hoveredPerson === person.initials;
                return (
                  <div
                    key={person.initials}
                    onMouseEnter={() => setHoveredPerson(person.initials)}
                    onMouseLeave={() => setHoveredPerson(null)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `56px repeat(${calendarData.days.length}, 1fr)`,
                      gap: 0,
                      alignItems: 'center',
                      minHeight: 22,
                      background: rowHov ? (isDarkMode ? 'rgba(135, 243, 243, 0.04)' : 'rgba(54, 144, 206, 0.04)') : 'transparent',
                      transition: 'background var(--transition-fast)',
                    }}
                  >
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      paddingRight: 6, overflow: 'hidden',
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: accentColor, flexShrink: 0,
                      }}>
                        {person.initials}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: textBody,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {person.name}
                      </span>
                    </div>

                    {calendarData.days.map((d, i) => {
                      const isOff = person.offDays.has(d.key);
                      const prevOff = i > 0 && person.offDays.has(dayKeys[i - 1]);
                      const nextOff = i < dayKeys.length - 1 && person.offDays.has(dayKeys[i + 1]);
                      const weekBreak = d.isMonday && i > 0;

                      return (
                        <div
                          key={d.key}
                          style={{
                            height: 14,
                            display: 'flex',
                            alignItems: 'center',
                            borderLeft: weekBreak
                              ? `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(148, 163, 184, 0.15)'}`
                              : 'none',
                            paddingLeft: weekBreak ? 1 : 0,
                          }}
                        >
                          {isOff && (
                            <div style={{
                              width: '100%',
                              height: 10,
                              background: isDarkMode
                                ? 'rgba(135, 243, 243, 0.18)'
                                : 'rgba(54, 144, 206, 0.14)',
                              borderLeft: (!prevOff || weekBreak)
                                ? `2px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.5)' : 'rgba(54, 144, 206, 0.4)'}`
                                : 'none',
                              borderRight: (!nextOff || (i < dayKeys.length - 1 && calendarData.days[i + 1]?.isMonday))
                                ? `1px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.25)' : 'rgba(54, 144, 206, 0.2)'}`
                                : 'none',
                              marginLeft: prevOff && !weekBreak ? 0 : 1,
                              marginRight: nextOff && !(i < dayKeys.length - 1 && calendarData.days[i + 1]?.isMonday) ? 0 : 1,
                              transition: 'background var(--transition-fast)',
                            }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Month labels */}
              {(() => {
                const months = new Map<string, number[]>();
                calendarData.days.forEach((d, i) => {
                  if (!months.has(d.month)) months.set(d.month, []);
                  months.get(d.month)!.push(i);
                });
                if (months.size <= 1) return null;
                return (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `56px repeat(${calendarData.days.length}, 1fr)`,
                    gap: 0,
                    paddingTop: 2,
                  }}>
                    <div />
                    {calendarData.days.map((d, i) => {
                      const indices = months.get(d.month)!;
                      const isFirst = indices[0] === i;
                      return (
                        <div key={d.key} style={{ textAlign: 'center' }}>
                          {isFirst && (
                            <span style={{
                              fontSize: 8, fontWeight: 700, color: textMuted,
                              textTransform: 'uppercase', letterSpacing: '0.3px',
                            }}>
                              {d.month}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* ── Confirm Attendance Modal ── */}
      {modalPerson && (
        <div
          onClick={() => { if (!modalSaving) setModalPerson(null); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0, 3, 25, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 340,
              background: isDarkMode ? '#061733' : '#fff',
              border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(6,23,51,0.12)'}`,
              boxShadow: isDarkMode ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(6,23,51,0.12)',
              borderRadius: 0,
              padding: '20px 22px',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: textLabel, letterSpacing: '0.2px' }}>
                {modalPerson.confirmed ? 'Update' : 'Confirm'} — {modalPerson.firstName}
              </span>
              <div
                onClick={() => { if (!modalSaving) setModalPerson(null); }}
                style={{ cursor: 'pointer', color: textMuted, padding: 2 }}
              >
                <FiX size={14} />
              </div>
            </div>

            {/* Week rows */}
            {[
              { label: 'This week', days: modalThisWeek, setDays: setModalThisWeek, weekStart: currentWeekStart },
              { label: 'Next week', days: modalNextWeek, setDays: setModalNextWeek, weekStart: nextWeekStartStr },
            ].map(({ label, days, setDays, weekStart: ws }) => {
              const wsDate = new Date(ws + 'T00:00:00');
              const weekLabel = `${wsDate.getDate()} ${MONTH_NAMES[wsDate.getMonth()]}`;
              return (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 9, color: textMuted }}>
                      w/c {weekLabel}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {WEEKDAY_NAMES.map((dayName, di) => {
                      const st = days[di];
                      const meta = STATUS_META[st];
                      return (
                        <div
                          key={dayName}
                          onClick={() => {
                            const next = [...days];
                            next[di] = cycleDayStatus(st);
                            setDays(next);
                          }}
                          style={{
                            flex: 1,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                            padding: '8px 0',
                            cursor: 'pointer',
                            background: isDarkMode ? 'rgba(0,3,25,0.4)' : 'rgba(54,144,206,0.03)',
                            border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(6,23,51,0.08)'}`,
                            borderRadius: 0,
                            transition: 'all 0.15s ease',
                            userSelect: 'none',
                          }}
                        >
                          <span style={{ fontSize: 9, fontWeight: 700, color: textMuted, letterSpacing: '0.3px' }}>
                            {dayName}
                          </span>
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: meta.colorVar,
                          }} />
                          <span style={{ fontSize: 8, fontWeight: 600, color: textBody }}>
                            {meta.shortLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {CYCLE_STATUSES.map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_META[s].colorVar }} />
                  <span style={{ fontSize: 8, color: textMuted }}>{STATUS_META[s].shortLabel}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              {onUnconfirmAttendance && (
                <button
                  onClick={async () => {
                    if (!modalPerson) return;
                    setModalSaving(true);
                    setConfirmingPerson(modalPerson.initials);
                    try {
                      await onUnconfirmAttendance(modalPerson.initials, currentWeekStart);
                      onShowToast?.(`${modalPerson.firstName}'s attendance reset to unconfirmed`, 'success');
                      setModalPerson(null);
                    } catch (err) {
                      onShowToast?.(`Failed to unconfirm ${modalPerson.firstName}`, 'error', err instanceof Error ? err.message : 'Please try again');
                    } finally {
                      setModalSaving(false);
                      setConfirmingPerson(null);
                    }
                  }}
                  disabled={modalSaving}
                  style={{
                    padding: '6px 12px', fontSize: 10, fontWeight: 600,
                    background: 'transparent',
                    color: isDarkMode ? 'var(--helix-cta)' : 'var(--helix-cta)',
                    border: `1px solid ${isDarkMode ? 'rgba(214,85,65,0.3)' : 'rgba(214,85,65,0.2)'}`,
                    borderRadius: 0, cursor: 'pointer',
                    marginRight: 'auto',
                    opacity: modalSaving ? 0.4 : 0.8,
                  }}
                >
                  {modalPerson.confirmed ? 'Unconfirm' : 'Reset'}
                </button>
              )}
              <button
                onClick={() => setModalPerson(null)}
                disabled={modalSaving}
                style={{
                  padding: '6px 14px', fontSize: 11, fontWeight: 600,
                  background: 'transparent',
                  color: textMuted, border: `1px solid ${isDarkMode ? 'rgba(75,85,99,0.4)' : 'rgba(0,0,0,0.12)'}`,
                  borderRadius: 0, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitConfirmModal}
                disabled={modalSaving}
                style={{
                  padding: '6px 16px', fontSize: 11, fontWeight: 700,
                  background: 'var(--helix-highlight)',
                  color: '#fff', border: 'none',
                  borderRadius: 0, cursor: modalSaving ? 'wait' : 'pointer',
                  opacity: modalSaving ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <FiCheck size={12} />
                {modalSaving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes teamPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        @media (max-width: 640px) {
          .team-tile { padding: 3px 8px 3px 3px !important; }
          .team-return { display: none !important; }
          .team-bucket { font-size: 8px !important; }
        }
        @media (max-width: 420px) {
          .team-panel { padding: 8px 10px !important; }
          .team-tile { padding: 2px 6px 2px 2px !important; gap: 4px !important; }
          .team-name { font-size: 10px !important; }
          .team-divider { display: none !important; }
          .team-toggle { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default TeamInsight;
