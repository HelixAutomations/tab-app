import React from 'react';
import { colours } from '../../../app/styles/colours';
import {
  reportingPanelBackground,
  reportingPanelBorder,
} from '../../Reporting/styles/reportingFoundation';

export type MarketingTimelineTotals = {
  seoSessions: number;
  seoKeyEvents: number;
  seoEnquiries: number;
  seoRows: number;
  ppcSpend: number;
  ppcClicks: number;
  ppcConversions: number;
  ppcEnquiries: number;
  ppcRows: number;
};

export type MarketingTimelineDay = MarketingTimelineTotals & {
  key: string;
  label: string;
  rangeLabel: string;
  startTs: number;
  endTs: number;
};

export type MarketingTimelineWeek = MarketingTimelineTotals & {
  key: string;
  label: string;
  rangeLabel: string;
  startTs: number;
  endTs: number;
  days: MarketingTimelineDay[];
};

export type MarketingTimelineMonth = MarketingTimelineTotals & {
  key: string;
  label: string;
  rangeLabel: string;
  startTs: number;
  endTs: number;
  weeks: MarketingTimelineWeek[];
};

type MarketingTimelineWorkbenchProps = {
  isDarkMode: boolean;
  rangeLabel: string;
  statusLabel: string;
  isProcessing: boolean;
  months: MarketingTimelineMonth[];
};

function formatMetricNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits }).format(value);
}

function formatMetricCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
}

function hasEffort(value: MarketingTimelineTotals): boolean {
  return value.seoSessions > 0
    || value.seoEnquiries > 0
    || value.ppcSpend > 0
    || value.ppcConversions > 0
    || value.ppcEnquiries > 0;
}

function recentFirst<T extends { startTs: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.startTs - a.startTs);
}

const MarketingTimelineWorkbench: React.FC<MarketingTimelineWorkbenchProps> = ({
  isDarkMode,
  rangeLabel,
  statusLabel,
  isProcessing,
  months,
}) => {
  const orderedMonths = React.useMemo(() => recentFirst(months), [months]);
  const latestMonthKey = orderedMonths[0]?.key ?? null;
  const latestWeekKey = orderedMonths[0] ? recentFirst(orderedMonths[0].weeks)[0]?.key ?? null : null;
  const [expandedMonthKeys, setExpandedMonthKeys] = React.useState<Set<string>>(() => (latestMonthKey ? new Set([latestMonthKey]) : new Set()));
  const [expandedWeekKeys, setExpandedWeekKeys] = React.useState<Set<string>>(() => (latestWeekKey ? new Set([latestWeekKey]) : new Set()));

  React.useEffect(() => {
    const validMonthKeys = new Set(orderedMonths.map((month) => month.key));
    const validWeekKeys = new Set(orderedMonths.flatMap((month) => month.weeks.map((week) => week.key)));

    setExpandedMonthKeys((current) => {
      const next = new Set([...current].filter((key) => validMonthKeys.has(key)));
      if (next.size === 0 && latestMonthKey) next.add(latestMonthKey);
      return next;
    });

    setExpandedWeekKeys((current) => {
      const next = new Set([...current].filter((key) => validWeekKeys.has(key)));
      if (next.size === 0 && latestWeekKey) next.add(latestWeekKey);
      return next;
    });
  }, [latestMonthKey, latestWeekKey, orderedMonths]);

  const textColour = isDarkMode ? colours.dark.text : colours.darkBlue;
  const mutedColour = isDarkMode ? '#d1d5db' : '#4b5563';
  const quietColour = isDarkMode ? colours.subtleGrey : colours.greyText;
  const border = reportingPanelBorder(isDarkMode);
  const seoAccent = isDarkMode ? '#8ed1ff' : colours.helixBlue;
  const ppcAccent = colours.green;
  const totalWeeks = orderedMonths.reduce((sum, month) => sum + month.weeks.length, 0);
  const totalDays = orderedMonths.reduce((sum, month) => sum + month.weeks.reduce((weekSum, week) => weekSum + week.days.length, 0), 0);

  const toggleMonth = (monthKey: string) => {
    setExpandedMonthKeys((current) => {
      const next = new Set(current);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  };

  const toggleWeek = (weekKey: string) => {
    setExpandedWeekKeys((current) => {
      const next = new Set(current);
      if (next.has(weekKey)) next.delete(weekKey);
      else next.add(weekKey);
      return next;
    });
  };

  const renderMetricStrip = (value: MarketingTimelineTotals, density: 'month' | 'week' | 'day') => (
    <span className={`marketing-timeline-metric-strip is-${density}`}>
      <span className="marketing-timeline-compact-metric" style={{ color: seoAccent }}>
        <span className="marketing-timeline-metric-name">SEO</span>
        <strong>{formatMetricNumber(value.seoSessions)}</strong>
        <span className="marketing-timeline-metric-detail">{formatMetricNumber(value.seoEnquiries)} organic enquiries</span>
      </span>
      <span className="marketing-timeline-compact-metric" style={{ color: ppcAccent }}>
        <span className="marketing-timeline-metric-name">PPC</span>
        <strong>{formatMetricNumber(value.ppcConversions, 1)}</strong>
        <span className="marketing-timeline-metric-detail">{formatMetricNumber(value.ppcEnquiries)} paid enquiries</span>
      </span>
      <span className="marketing-timeline-compact-metric" style={{ color: ppcAccent }}>
        <span className="marketing-timeline-metric-name">Spend</span>
        <strong>{formatMetricCurrency(value.ppcSpend)}</strong>
        <span className="marketing-timeline-metric-detail">PPC spend</span>
      </span>
    </span>
  );

  return (
    <section
      data-helix-region="marketing/timeline"
      className="marketing-timeline-workbench"
      aria-busy={isProcessing}
      style={{
        ['--marketing-timeline-border' as any]: border,
        ['--marketing-timeline-line' as any]: isDarkMode ? 'rgba(142, 209, 255, 0.22)' : 'rgba(54, 144, 206, 0.20)',
        ['--marketing-timeline-row' as any]: reportingPanelBackground(isDarkMode, 'elevated'),
        ['--marketing-timeline-rail' as any]: '44px',
        ['--marketing-timeline-rail-center' as any]: '22px',
        border: `1px solid ${border}`,
        background: reportingPanelBackground(isDarkMode),
        display: 'grid',
        gap: 0,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '11px 12px 10px',
          borderBottom: `1px solid ${border}`,
          background: isDarkMode ? 'rgba(10, 26, 45, 0.72)' : 'rgba(255, 255, 255, 0.72)',
        }}
      >
        <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: seoAccent }}>
            Marketing timeline
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: mutedColour, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {rangeLabel} | {orderedMonths.length.toLocaleString('en-GB')} months | {totalWeeks.toLocaleString('en-GB')} weeks | {totalDays.toLocaleString('en-GB')} days
          </span>
        </div>
        <span
          role="status"
          aria-live="polite"
          className={isProcessing ? 'marketing-timeline-status is-processing' : 'marketing-timeline-status'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            minHeight: 26,
            padding: '0 9px',
            border: `1px solid ${isProcessing ? colours.highlight : border}`,
            color: isProcessing ? colours.highlight : quietColour,
            background: isDarkMode ? 'rgba(6, 23, 51, 0.42)' : 'rgba(244, 244, 246, 0.82)',
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          <span aria-hidden="true" className="marketing-timeline-status-dot" />
          {statusLabel}
        </span>
      </header>

      <div className="marketing-timeline-stream marketing-scroll-chrome">
        {orderedMonths.length === 0 && isProcessing ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="marketing-timeline-stream-skeleton" aria-hidden="true" />
          ))
        ) : orderedMonths.length === 0 ? (
          <span style={{ padding: '14px', fontSize: 11, fontWeight: 700, color: mutedColour }}>
            No SEO or PPC operating totals are available for this window yet.
          </span>
        ) : orderedMonths.map((month) => {
          const monthOpen = expandedMonthKeys.has(month.key);
          const monthHasEffort = hasEffort(month);
          const weeks = recentFirst(month.weeks);
          return (
            <article key={month.key} className={`marketing-timeline-group is-month${monthOpen ? ' is-open' : ''}${monthHasEffort ? '' : ' is-empty'}`}>
              <button
                type="button"
                aria-expanded={monthOpen}
                onClick={() => toggleMonth(month.key)}
                className="marketing-timeline-row marketing-timeline-row--month"
                style={{
                  color: monthOpen ? textColour : mutedColour,
                  borderColor: monthOpen ? seoAccent : border,
                  background: monthOpen
                    ? (isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(13, 47, 96, 0.06)')
                    : reportingPanelBackground(isDarkMode, 'elevated'),
                }}
              >
                <span className="marketing-timeline-toggle" aria-hidden="true">{monthOpen ? '-' : '+'}</span>
                <span className="marketing-timeline-label-stack">
                  <strong>{month.label}</strong>
                  <span>{month.rangeLabel} | {weeks.length.toLocaleString('en-GB')} weeks</span>
                </span>
                {renderMetricStrip(month, 'month')}
              </button>

              {monthOpen && (
                <div className="marketing-timeline-children is-weeks">
                  {weeks.map((week) => {
                    const weekOpen = expandedWeekKeys.has(week.key);
                    const weekHasEffort = hasEffort(week);
                    const days = recentFirst(week.days);
                    return (
                      <article key={week.key} className={`marketing-timeline-group is-week${weekOpen ? ' is-open' : ''}${weekHasEffort ? '' : ' is-empty'}`}>
                        <button
                          type="button"
                          aria-expanded={weekOpen}
                          onClick={() => toggleWeek(week.key)}
                          className="marketing-timeline-row marketing-timeline-row--week"
                          style={{
                            color: weekOpen ? textColour : mutedColour,
                            borderColor: weekOpen ? seoAccent : border,
                            background: weekOpen
                              ? (isDarkMode ? 'rgba(142, 209, 255, 0.08)' : 'rgba(54, 144, 206, 0.045)')
                              : 'transparent',
                          }}
                        >
                          <span className="marketing-timeline-toggle" aria-hidden="true">{weekOpen ? '-' : '+'}</span>
                          <span className="marketing-timeline-label-stack">
                            <strong>{week.label}</strong>
                            <span>{week.rangeLabel} | {days.length.toLocaleString('en-GB')} days</span>
                          </span>
                          {renderMetricStrip(week, 'week')}
                        </button>

                        {weekOpen && (
                          <div className="marketing-timeline-children is-days">
                            {days.map((day) => {
                              const dayHasEffort = hasEffort(day);
                              return (
                                <div
                                  key={day.key}
                                  className={`marketing-timeline-row marketing-timeline-row--day${dayHasEffort ? '' : ' is-empty'}`}
                                  style={{
                                    color: dayHasEffort ? mutedColour : quietColour,
                                    borderColor: border,
                                    background: dayHasEffort ? reportingPanelBackground(isDarkMode, 'elevated') : 'transparent',
                                  }}
                                >
                                  <span className="marketing-timeline-day-node" aria-hidden="true" />
                                  <span className="marketing-timeline-label-stack">
                                    <strong>{day.label}</strong>
                                    <span>{day.rangeLabel}</span>
                                  </span>
                                  {renderMetricStrip(day, 'day')}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <style>{`
        .marketing-timeline-stream {
          position: relative;
          display: grid;
          max-height: 520px;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
        }

        .marketing-timeline-stream::before {
          content: '';
          position: absolute;
          left: calc(var(--marketing-timeline-rail-center) - 1px);
          top: 18px;
          bottom: 18px;
          width: 2px;
          background: var(--marketing-timeline-line);
          pointer-events: none;
          z-index: 3;
        }

        .marketing-timeline-group {
          position: relative;
          display: grid;
          min-width: 0;
          z-index: 2;
        }

        .marketing-timeline-group.is-month + .marketing-timeline-group.is-month {
          border-top: 1px solid var(--marketing-timeline-border);
        }

        .marketing-timeline-group.is-empty {
          opacity: 0.72;
        }

        .marketing-timeline-row {
          position: relative;
          display: grid;
          grid-template-columns: var(--marketing-timeline-rail) minmax(154px, 0.34fr) minmax(0, 1fr);
          align-items: center;
          gap: 0;
          min-width: 0;
          width: 100%;
          border: 0;
          border-left: 0;
          border-color: var(--marketing-timeline-border);
          text-align: left;
          font-family: Raleway, sans-serif;
        }

        button.marketing-timeline-row {
          appearance: none;
          cursor: pointer;
        }

        button.marketing-timeline-row:hover,
        button.marketing-timeline-row:focus-visible {
          outline: none;
          filter: brightness(1.015);
        }

        button.marketing-timeline-row:focus-visible .marketing-timeline-toggle {
          box-shadow: 0 0 0 2px rgba(54, 144, 206, 0.28);
        }

        .marketing-timeline-row--month {
          min-height: 66px;
          padding: 9px 10px 9px 0;
          box-shadow: inset 4px 0 0 currentColor;
        }

        .marketing-timeline-row--week {
          min-height: 56px;
          padding: 7px 10px 7px 0;
          border-top: 1px solid var(--marketing-timeline-border);
          box-shadow: inset 2px 0 0 currentColor;
        }

        .marketing-timeline-row--day {
          min-height: 40px;
          padding: 4px 10px 4px 0;
          border-top: 1px solid var(--marketing-timeline-border);
        }

        .marketing-timeline-children {
          position: relative;
          display: grid;
          min-width: 0;
        }

        .marketing-timeline-toggle,
        .marketing-timeline-day-node {
          z-index: 4;
          display: inline-grid;
          place-items: center;
          justify-self: center;
          width: 16px;
          height: 16px;
          border: 1px solid currentColor;
          background: var(--marketing-timeline-row);
          color: currentColor;
          font-size: 12px;
          font-weight: 900;
          line-height: 1;
        }

        .marketing-timeline-row--week .marketing-timeline-toggle {
          width: 14px;
          height: 14px;
          font-size: 11px;
          opacity: 0.92;
        }

        .marketing-timeline-day-node {
          width: 8px;
          height: 8px;
          border-width: 2px;
          background: currentColor;
          opacity: 0.78;
        }

        .marketing-timeline-label-stack {
          display: grid;
          gap: 3px;
          min-width: 0;
          padding-right: 10px;
        }

        .marketing-timeline-label-stack strong {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          line-height: 1.1;
          font-weight: 900;
          color: inherit;
        }

        .marketing-timeline-row--month .marketing-timeline-label-stack strong {
          font-size: 13px;
        }

        .marketing-timeline-label-stack span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 9px;
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: ${quietColour};
        }

        .marketing-timeline-metric-strip {
          display: grid;
          grid-template-columns: minmax(96px, 0.95fr) minmax(96px, 0.95fr) minmax(80px, 0.72fr);
          gap: 0;
          min-width: 0;
          border: 1px solid var(--marketing-timeline-border);
          background: ${isDarkMode ? 'rgba(255, 255, 255, 0.025)' : 'rgba(255, 255, 255, 0.58)'};
        }

        .marketing-timeline-metric-strip.is-month {
          min-height: 46px;
          border-width: 1px;
          background: ${isDarkMode ? 'rgba(54, 144, 206, 0.085)' : 'rgba(13, 47, 96, 0.055)'};
        }

        .marketing-timeline-metric-strip.is-week {
          min-height: 40px;
          background: ${isDarkMode ? 'rgba(255, 255, 255, 0.022)' : 'rgba(255, 255, 255, 0.48)'};
        }

        .marketing-timeline-metric-strip.is-day {
          min-height: 30px;
          border-style: dashed;
          background: transparent;
        }

        .marketing-timeline-compact-metric {
          display: grid;
          gap: 2px;
          min-width: 0;
          padding: 5px 7px 5px 8px;
          border-left: 2px solid currentColor;
          background: ${isDarkMode ? 'rgba(6, 23, 51, 0.18)' : 'rgba(244, 244, 246, 0.38)'};
        }

        .marketing-timeline-compact-metric + .marketing-timeline-compact-metric {
          border-left-width: 1px;
          box-shadow: inset 1px 0 0 var(--marketing-timeline-border);
        }

        .marketing-timeline-metric-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 8px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .marketing-timeline-compact-metric strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 14px;
          line-height: 1;
          font-weight: 900;
          color: ${textColour};
        }

        .marketing-timeline-row--month .marketing-timeline-compact-metric strong {
          font-size: 15px;
        }

        .marketing-timeline-metric-detail {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 8px;
          line-height: 1.15;
          font-weight: 800;
          color: ${mutedColour};
        }

        .marketing-timeline-row--day .marketing-timeline-compact-metric {
          padding-top: 4px;
          padding-bottom: 4px;
          background: transparent;
        }

        .marketing-timeline-row--day.is-empty {
          opacity: 0.62;
        }

        .marketing-timeline-status.is-processing .marketing-timeline-status-dot {
          animation: marketing-timeline-pulse 1400ms ease-in-out infinite;
        }

        .marketing-timeline-status-dot {
          width: 7px;
          height: 7px;
          background: currentColor;
        }

        .marketing-timeline-stream-skeleton {
          position: relative;
          height: 58px;
          overflow: hidden;
          border-bottom: 1px solid var(--marketing-timeline-border);
          background: ${isDarkMode ? 'rgba(209, 213, 219, 0.11)' : 'rgba(13, 47, 96, 0.075)'};
        }

        .marketing-timeline-stream-skeleton::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, ${isDarkMode ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.44)'}, transparent);
          animation: marketing-timeline-sheen 1500ms ease-in-out infinite;
        }

        @media (max-width: 920px) {
          .marketing-timeline-row {
            grid-template-columns: var(--marketing-timeline-rail) minmax(128px, 0.35fr) minmax(0, 1fr);
          }

          .marketing-timeline-metric-strip {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 680px) {
          .marketing-timeline-row {
            grid-template-columns: var(--marketing-timeline-rail) minmax(0, 1fr);
          }

          .marketing-timeline-metric-strip {
            grid-column: 2 / -1;
          }
        }

        @media (max-width: 520px) {
          .marketing-timeline-metric-strip {
            grid-template-columns: 1fr;
          }

          .marketing-timeline-compact-metric + .marketing-timeline-compact-metric {
            box-shadow: inset 0 1px 0 var(--marketing-timeline-border);
          }
        }

        @keyframes marketing-timeline-pulse {
          0% {
            box-shadow: 0 0 0 0 currentColor;
          }

          70%, 100% {
            box-shadow: 0 0 0 8px transparent;
          }
        }

        @keyframes marketing-timeline-sheen {
          0% {
            transform: translateX(-100%);
          }

          52%, 100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </section>
  );
};

export default MarketingTimelineWorkbench;