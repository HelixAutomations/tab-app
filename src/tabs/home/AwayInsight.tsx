import React, { useMemo, useState } from 'react';
import { FiUsers, FiChevronRight } from 'react-icons/fi';
import type { AnnualLeaveRecord } from '../../app/functionality/types';

// All runtime colours resolved via CSS custom properties from design-tokens.css.
// Only isDarkMode-gated values are tile-level interactive states (no CSS token exists).

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
  startLabel: string;
  endLabel: string;
  rangeLabel: string;
  returnLabel: string;
}

export interface AwayInsightProps {
  isDarkMode: boolean;
  annualLeaveRecords: AnnualLeaveRecord[];
  futureLeaveRecords: AnnualLeaveRecord[];
  teamData: TeamMember[];
  isLoading?: boolean;
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

const formatRangeShort = (startDate: Date, endDate: Date): string => {
  const s = `${startDate.getDate()} ${MONTH_NAMES[startDate.getMonth()]}`;
  const e = `${endDate.getDate()} ${MONTH_NAMES[endDate.getMonth()]}`;
  return `${s}–${e}`;
};

/* ─── component ────────────────────────────────────────── */

const AwayInsight: React.FC<AwayInsightProps> = ({
  isDarkMode,
  annualLeaveRecords,
  futureLeaveRecords,
  teamData,
  isLoading = false,
}) => {
  const [hoveredTile, setHoveredTile] = useState<string | null>(null);
  const [panelHovered, setPanelHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);

  /* —— Composition palette — UserBubble dark-surface pattern ——
     Dark:  websiteBlue base + accent-tinted interactives + white/opacity text
     Light: white base + highlight-tinted interactives + standard text tokens  */
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
  const accentColor  = 'var(--text-accent)'; // #87F3F3 dark, #3690CE light — auto

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
      const start = parseDate(r.start_date);
      const end = parseDate(r.end_date);
      return {
        initials: info.initials,
        firstName: info.firstName,
        startLabel: `${start.getDate()} ${MONTH_NAMES[start.getMonth()]}`,
        endLabel: `${end.getDate()} ${MONTH_NAMES[end.getMonth()]}`,
        rangeLabel: formatRangeShort(start, end),
        returnLabel: formatReturn(end, today),
      };
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

  /* —— calendar swimlane: person rows × working-day columns with bars —— */
  const calendarData = useMemo(() => {
    const MS_DAY = 86_400_000;
    const horizon = new Date(today.getTime() + 14 * MS_DAY);

    // Build ordered working days
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

    // Build person → off-day keys
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

    // Only keep people who actually have off days in the visible range, then sort by earliest
    const people = Array.from(personMap.values())
      .filter(p => p.offDays.size > 0)
      .sort((a, b) => {
        const aFirst = days.find(d => a.offDays.has(d.key))?.key || 'z';
        const bFirst = days.find(d => b.offDays.has(d.key))?.key || 'z';
        return aFirst.localeCompare(bFirst) || a.name.localeCompare(b.name);
      });

    return { days, people };
  }, [allLeave, today, nameMap]);

  /* —— render —— */
  return (
    <div
      className="away-panel"
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
        gap: (totalCount > 0 || isLoading) ? 'var(--spacing-sm)' : 0,
        marginTop: '4px',
        padding: '10px 14px',
        background: panelHovered ? panelBgHov : panelBg,
        border: `1px solid ${panelBorder}`,
        borderLeft: `1px solid ${panelBorder}`,
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
          <FiUsers style={{ fontSize: 11, color: accentColor, strokeWidth: 2.2 }} />
          <span style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            color: isDarkMode ? '#ffffff' : '#061733',
            letterSpacing: '0.02em',
          }}>
            Team Leave
          </span>

          {!isLoading && totalCount > 0 && (
            <span style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: textMuted,
              padding: '1px 6px',
              background: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`,
            }}>
              {totalCount} away
            </span>
          )}

          {!isLoading && totalCount === 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--helix-green)',
              }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: textBody }}>
                Full team present
              </span>
            </div>
          )}
        </div>

        <span className="away-manage" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: panelHovered || expanded ? accentColor : textMuted,
          transition: 'color var(--transition-fast)',
        }}>
          {expanded ? 'Collapse' : 'Upcoming leave'}
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
              animation: 'awayPulse 1.4s ease-in-out infinite',              animationDelay: `${i * 0.15}s`,
            }} />
          ))}
        </div>
      )}

      {/* ── Person tiles grouped by time bucket ── */}
      {!isLoading && totalCount > 0 && (
        <div style={{
          display: 'flex',
          gap: '14px',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}>
          {segments.map((seg, segIdx) => (
            <React.Fragment key={seg.label}>
              {segIdx > 0 && (
                <div className="away-divider" style={{
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
                {/* Bucket label — above entries */}
                <span className="away-bucket" style={{
                  fontSize: 'var(--text-2xs)',
                  fontWeight: 700,
                  color: textMuted,
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>
                  {seg.label}
                </span>

                {/* Person tiles */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {seg.entries.map(entry => {
                  const isHovered = hoveredTile === entry.initials;
                  return (
                    <div
                      key={entry.initials}
                      className="away-tile"
                      title={`${entry.firstName}: ${entry.rangeLabel}, ${entry.returnLabel}`}
                      onMouseEnter={() => setHoveredTile(entry.initials)}
                      onMouseLeave={() => setHoveredTile(null)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '3px 10px 3px 4px',
                        background: isHovered ? tileBgHov : tileBg,
                        border: `1px solid ${isHovered ? tileBdrHov : tileBorder}`,                        transition: 'border-color var(--transition-fast), background var(--transition-fast)',
                        flexShrink: 0,
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
                        {entry.initials}
                      </div>

                      {/* Name */}
                      <span className="away-name" style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: textLabel,
                        whiteSpace: 'nowrap',
                      }}>
                        {entry.firstName}
                      </span>

                      {/* Return label */}
                      <span className="away-return" style={{
                        fontSize: 'var(--text-2xs)',
                        color: textMuted,
                        whiteSpace: 'nowrap',
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

      {/* ── Expanded agenda view ── */}
      <div style={{
        overflow: 'hidden',
        maxHeight: expanded ? '600px' : '0',
        opacity: expanded ? 1 : 0,
        transition: 'max-height 0.35s ease, opacity 0.2s ease, margin-top 0.3s ease',
        marginTop: expanded ? '10px' : '0',
      }}>
        {calendarData.people.length === 0 ? (
          <div style={{
            padding: '8px 2px',
            color: textMuted,
            fontSize: 13,
          }}>
            No upcoming leave booked.
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
              <div /> {/* spacer for name column */}
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
                  <span style={{
                    fontSize: 8,
                    fontWeight: 600,
                    color: textMuted,
                    lineHeight: 1,
                  }}>
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

            {/* Person swimlane rows */}
            {calendarData.people.map(person => {
              const dayKeys = calendarData.days.map(d => d.key);
              return (
                <div
                  key={person.initials}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `56px repeat(${calendarData.days.length}, 1fr)`,
                    gap: 0,
                    alignItems: 'center',
                    minHeight: 22,
                  }}
                >
                  {/* Person label */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    paddingRight: 6,
                    overflow: 'hidden',
                  }}>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: accentColor,
                      flexShrink: 0,
                    }}>
                      {person.initials}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: textBody,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {person.name}
                    </span>
                  </div>

                  {/* Day cells — bars for off days */}
                  {calendarData.days.map((d, i) => {
                    const isOff = person.offDays.has(d.key);
                    const prevOff = i > 0 && person.offDays.has(dayKeys[i - 1]);
                    const nextOff = i < dayKeys.length - 1 && person.offDays.has(dayKeys[i + 1]);
                    // Week boundary check
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

            {/* Month labels below if days span multiple months */}
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
                            fontSize: 8,
                            fontWeight: 700,
                            color: textMuted,
                            textTransform: 'uppercase',
                            letterSpacing: '0.3px',
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

      <style>{`
        @keyframes awayPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.7; }
        }
        @media (max-width: 640px) {
          .away-tile { padding: 3px 8px 3px 3px !important; }
          .away-return { display: none !important; }
          .away-bucket { font-size: 8px !important; }
        }
        @media (max-width: 420px) {
          .away-panel { padding: 8px 10px !important; }
          .away-tile { padding: 2px 6px 2px 2px !important; gap: 4px !important; }
          .away-name { font-size: 10px !important; }
          .away-divider { display: none !important; }
          .away-manage { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default AwayInsight;
