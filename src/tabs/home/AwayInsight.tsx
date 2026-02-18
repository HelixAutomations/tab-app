import React, { useMemo } from 'react';
import { colours } from '../../app/styles/colours';
import { FaUmbrellaBeach } from 'react-icons/fa';
import type { AnnualLeaveRecord } from '../../app/functionality/types';

/* ─── types ────────────────────────────────────────────── */

interface TeamMember {
  Initials: string;
  'Full Name'?: string;
  First?: string;
  Last?: string;
  Nickname?: string;
  Role?: string;
  status?: string;
}

interface AwayEntry {
  initials: string;
  firstName: string;
  returnLabel: string;
}

export interface AwayInsightProps {
  isDarkMode: boolean;
  annualLeaveRecords: AnnualLeaveRecord[];
  futureLeaveRecords: AnnualLeaveRecord[];
  teamData: TeamMember[];
  isLoading?: boolean;
  onManageLeave?: () => void;
}

/* ─── date helpers ─────────────────────────────────────── */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  if (diffDays <= 6) return `back ${DAY_NAMES[back.getDay()]}`;
  return `back ${back.getDate()} ${MONTH_NAMES[back.getMonth()]}`;
};

/* ─── component ────────────────────────────────────────── */

const AwayInsight: React.FC<AwayInsightProps> = ({
  isDarkMode,
  annualLeaveRecords,
  futureLeaveRecords,
  teamData,
  isLoading = false,
  onManageLeave,
}) => {
  /* —— tile-matched palette (same gradient/border/shadow as metric tiles) —— */
  const tileBg = isDarkMode
    ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0) 60%), rgba(6, 23, 51, 0.45)'
    : 'linear-gradient(135deg, rgba(54, 144, 206, 0.06) 0%, rgba(54, 144, 206, 0) 60%), #ffffff';
  const tileBorder = isDarkMode
    ? '1px solid rgba(54, 144, 206, 0.1)'
    : '1px solid rgba(148, 163, 184, 0.18)';
  const tileShadow = isDarkMode
    ? 'rgba(54, 144, 206, 0.06) 0px 1px 0px inset, rgba(0, 3, 25, 0.2) 0px 1px 3px'
    : 'rgba(54, 144, 206, 0.04) 0px 1px 0px inset, rgba(0, 0, 0, 0.04) 0px 1px 3px';

  const labelCol = isDarkMode ? 'rgba(243, 244, 246, 0.55)' : colours.greyText;
  const nameCol  = isDarkMode ? 'rgb(249, 250, 251)' : colours.light.text;
  const mutedCol = isDarkMode ? 'rgba(243, 244, 246, 0.4)' : colours.subtleGrey;
  const pipeCol  = isDarkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(0, 0, 0, 0.08)';

  /* —— resolve initials → first name —— */
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

  /* —— unified leave list (approved/booked, deduped) —— */
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

  /* —— date boundaries —— */
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

  /* —— categorise (earliest bucket wins) —— */
  const { awayToday, laterThisWeek, nextWeek } = useMemo(() => {
    const todayBucket: AwayEntry[] = [];
    const laterBucket: AwayEntry[] = [];
    const nextBucket: AwayEntry[] = [];
    const claimed = new Set<string>();
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const toEntry = (r: AnnualLeaveRecord): AwayEntry => {
      const ini = r.person.toUpperCase();
      const info = nameMap.get(ini) || { firstName: ini, initials: ini };
      return { initials: info.initials, firstName: info.firstName, returnLabel: formatReturn(parseDate(r.end_date), today) };
    };

    for (const r of allLeave) {
      const ini = r.person.toUpperCase();
      const s = parseDate(r.start_date); const e = parseDate(r.end_date);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) continue;
      if (today >= s && today <= e && !claimed.has(ini)) { claimed.add(ini); todayBucket.push(toEntry(r)); }
    }
    for (const r of allLeave) {
      const ini = r.person.toUpperCase(); if (claimed.has(ini)) continue;
      const s = parseDate(r.start_date); const e = parseDate(r.end_date);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) continue;
      if (tomorrow <= thisWeekEnd_ && rangesOverlap(s, e, tomorrow, thisWeekEnd_) && (e > today || s > today)) {
        claimed.add(ini); laterBucket.push(toEntry(r));
      }
    }
    for (const r of allLeave) {
      const ini = r.person.toUpperCase(); if (claimed.has(ini)) continue;
      const s = parseDate(r.start_date); const e = parseDate(r.end_date);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) continue;
      if (rangesOverlap(s, e, nextWeekStart_, nextWeekEnd_)) { claimed.add(ini); nextBucket.push(toEntry(r)); }
    }

    return { awayToday: todayBucket, laterThisWeek: laterBucket, nextWeek: nextBucket };
  }, [allLeave, today, thisWeekEnd_, nextWeekStart_, nextWeekEnd_, nameMap]);

  const totalCount = awayToday.length + laterThisWeek.length + nextWeek.length;

  /* —— build segments —— */
  type Seg = { label: string; entries: AwayEntry[] };
  const segments: Seg[] = [];
  if (awayToday.length)     segments.push({ label: 'Away today',      entries: awayToday });
  if (laterThisWeek.length) segments.push({ label: 'Later this week', entries: laterThisWeek });
  if (nextWeek.length)      segments.push({ label: 'Next week',       entries: nextWeek });

  /* —— empty / loading gates —— */
  if (!isLoading && totalCount === 0) return null;

  /* —— render: single horizontal strip —— */
  return (
    <div
      role={onManageLeave ? 'button' : undefined}
      tabIndex={onManageLeave ? 0 : undefined}
      onClick={onManageLeave}
      onKeyDown={onManageLeave ? (e) => { if (e.key === 'Enter' || e.key === ' ') onManageLeave(); } : undefined}
      title={onManageLeave ? 'Manage annual leave' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        padding: '8px 12px',
        borderRadius: 0,
        background: tileBg,
        border: tileBorder,
        boxShadow: tileShadow,
        fontFamily: 'Raleway, sans-serif',
        overflow: 'hidden',
        minHeight: 32,
        cursor: onManageLeave ? 'pointer' : 'default',
        transition: 'opacity 0.15s ease',
      }}
    >
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          {[80, 110, 70].map((w, i) => (
            <div key={i} style={{
              width: w, height: 8, borderRadius: 0,
              background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)',
              animation: 'awayPulse 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
            }} />
          ))}
        </div>
      ) : (
        <>
          {/* Leading icon */}
          <FaUmbrellaBeach style={{ fontSize: 10, color: labelCol, flexShrink: 0, marginRight: 8 }} />

          {/* Segments */}
          {segments.map((seg, si) => (
            <React.Fragment key={seg.label}>
              {si > 0 && (
                <div style={{ width: 1, height: 14, background: pipeCol, margin: '0 10px', flexShrink: 0 }} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                {/* Section label */}
                <span style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: labelCol,
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.03em',
                }}>
                  {seg.label}
                </span>
                {/* People */}
                {seg.entries.map((entry, ei) => (
                  <React.Fragment key={entry.initials}>
                    {ei > 0 && <span style={{ fontSize: 10, color: mutedCol }}>,</span>}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: nameCol }}>{entry.firstName}</span>
                      <span style={{ fontSize: 9, fontWeight: 500, color: mutedCol, fontStyle: 'italic' }}>
                        {entry.returnLabel}
                      </span>
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </React.Fragment>
          ))}
        </>
      )}

      <style>{`
        @keyframes awayPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
};

export default AwayInsight;
