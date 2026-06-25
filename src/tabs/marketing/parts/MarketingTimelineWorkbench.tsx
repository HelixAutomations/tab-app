import React from 'react';
import { colours, withAlpha } from '../../../app/styles/colours';
import {
  reportingPanelBackground,
  reportingPanelBorder,
} from '../../Reporting/styles/reportingFoundation';

export type MarketingTimelineTotals = {
  seoSessions: number;
  seoKeyEvents: number;
  seoEnquiries: number;
  seoSpend: number;
  seoMatters: number;
  seoCollected: number;
  seoMatterValue: number;
  seoRows: number;
  ppcSpend: number;
  ppcClicks: number;
  ppcConversions: number;
  ppcEnquiries: number;
  ppcMatters: number;
  ppcCollected: number;
  ppcMatterValue: number;
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
  summaryMode?: boolean;
};

function formatMetricNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits }).format(value);
}

function formatMetricCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
}

function formatMetricRatio(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0.00x';
  return `${value.toFixed(2)}x`;
}

function hasEffort(value: MarketingTimelineTotals): boolean {
  return value.seoSessions > 0
    || value.seoEnquiries > 0
    || value.seoSpend > 0
    || value.seoMatters > 0
    || value.seoCollected > 0
    || value.seoMatterValue > 0
    || value.ppcSpend > 0
    || value.ppcConversions > 0
    || value.ppcEnquiries > 0
    || value.ppcMatters > 0
    || value.ppcCollected > 0
    || value.ppcMatterValue > 0;
}

function recentFirst<T extends { startTs: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.startTs - a.startTs);
}

function sumTimelineTotals(items: MarketingTimelineTotals[]): MarketingTimelineTotals {
  return items.reduce<MarketingTimelineTotals>((acc, item) => ({
    seoSessions: acc.seoSessions + item.seoSessions,
    seoKeyEvents: acc.seoKeyEvents + item.seoKeyEvents,
    seoEnquiries: acc.seoEnquiries + item.seoEnquiries,
    seoSpend: acc.seoSpend + item.seoSpend,
    seoMatters: acc.seoMatters + item.seoMatters,
    seoCollected: acc.seoCollected + item.seoCollected,
    seoMatterValue: acc.seoMatterValue + item.seoMatterValue,
    seoRows: acc.seoRows + item.seoRows,
    ppcSpend: acc.ppcSpend + item.ppcSpend,
    ppcClicks: acc.ppcClicks + item.ppcClicks,
    ppcConversions: acc.ppcConversions + item.ppcConversions,
    ppcEnquiries: acc.ppcEnquiries + item.ppcEnquiries,
    ppcMatters: acc.ppcMatters + item.ppcMatters,
    ppcCollected: acc.ppcCollected + item.ppcCollected,
    ppcMatterValue: acc.ppcMatterValue + item.ppcMatterValue,
    ppcRows: acc.ppcRows + item.ppcRows,
  }), {
    seoSessions: 0,
    seoKeyEvents: 0,
    seoEnquiries: 0,
    seoSpend: 0,
    seoMatters: 0,
    seoCollected: 0,
    seoMatterValue: 0,
    seoRows: 0,
    ppcSpend: 0,
    ppcClicks: 0,
    ppcConversions: 0,
    ppcEnquiries: 0,
    ppcMatters: 0,
    ppcCollected: 0,
    ppcMatterValue: 0,
    ppcRows: 0,
  });
}

function timelineOutcome(value: MarketingTimelineTotals) {
  const spend = value.seoSpend + value.ppcSpend;
  const matterValue = value.seoMatterValue + value.ppcMatterValue;
  return {
    enquiries: value.seoEnquiries + value.ppcEnquiries,
    matters: value.seoMatters + value.ppcMatters,
    received: value.seoCollected + value.ppcCollected,
    matterValue,
    roi: spend > 0 ? matterValue / spend : 0,
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatTimelineRangeLabel(label: string): string {
  if (!label) return '';
  return label
    .replace(/\b0(\d)\b/g, '$1')
    .replace(/\s+to\s+/gi, ' - ');
}

const MarketingTimelineWorkbench: React.FC<MarketingTimelineWorkbenchProps> = ({
  isDarkMode,
  rangeLabel,
  statusLabel,
  isProcessing,
  months,
  summaryMode = false,
}) => {
  const orderedMonths = React.useMemo(() => recentFirst(months), [months]);
  const textColour = isDarkMode ? colours.dark.text : colours.darkBlue;
  const mutedColour = isDarkMode ? withAlpha(colours.dark.text, 0.82) : colours.greyText;
  const quietColour = isDarkMode ? colours.subtleGrey : colours.greyText;
  const border = reportingPanelBorder(isDarkMode);
  const spendColour = colours.highlight;
  const valueColour = colours.green;
  const headerSurface = withAlpha(isDarkMode ? colours.dark.cardBackground : colours.sectionBackground, 0.72);
  const rowSurface = withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.018 : 0.42);
  const rowAltSurface = withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.032 : 0.62);
  const timelineTotals = React.useMemo(() => sumTimelineTotals(orderedMonths), [orderedMonths]);
  const timelineSummary = timelineOutcome(timelineTotals);
  const totalWeeks = orderedMonths.reduce((sum, month) => sum + month.weeks.length, 0);
  const activeWeeks = orderedMonths.reduce((sum, month) => sum + month.weeks.filter(hasEffort).length, 0);
  const totalDays = orderedMonths.reduce((sum, month) => sum + month.weeks.reduce((weekSum, week) => weekSum + week.days.length, 0), 0);

  const renderActivitySignal = (month: MarketingTimelineMonth) => {
    const orderedWeeks = [...month.weeks].sort((left, right) => left.startTs - right.startTs);
    const weeklyBuckets = Array.from({ length: 4 }, (_, index) => {
      const weeks = index === 3 ? orderedWeeks.slice(3) : orderedWeeks.slice(index, index + 1);
      return {
        label: `Wk ${index + 1}`,
        totals: weeks.length > 0 ? sumTimelineTotals(weeks) : null,
      };
    });
    return (
      <span className="marketing-timeline-signal-cell">
        <span className="marketing-timeline-weekly-breakdown" aria-label="Weekly spend and value breakdown">
          {weeklyBuckets.map((bucket) => {
            const weekOutcome = bucket.totals ? timelineOutcome(bucket.totals) : null;
            const weekSpend = bucket.totals ? bucket.totals.seoSpend + bucket.totals.ppcSpend : null;
            return (
              <span key={bucket.label} className={bucket.totals ? 'marketing-timeline-weekly-row' : 'marketing-timeline-weekly-row is-empty'}>
                <small style={{ color: quietColour }}>{bucket.label}</small>
                <strong style={{ color: weekSpend == null ? quietColour : spendColour }}>{weekSpend == null ? '--' : formatMetricCurrency(weekSpend)}</strong>
                <strong style={{ color: weekOutcome ? valueColour : quietColour }}>{weekOutcome ? formatMetricCurrency(weekOutcome.matterValue) : '--'}</strong>
              </span>
            );
          })}
        </span>
      </span>
    );
  };

  return (
    <section
      data-helix-region="marketing/timeline"
      className={summaryMode ? 'marketing-timeline-workbench is-summary' : 'marketing-timeline-workbench'}
      aria-busy={isProcessing}
      style={{
        border: `1px solid ${summaryMode ? withAlpha(colours.highlight, isDarkMode ? 0.18 : 0.14) : border}`,
        background: summaryMode
          ? withAlpha(isDarkMode ? colours.dark.cardBackground : colours.sectionBackground, isDarkMode ? 0.34 : 0.62)
          : reportingPanelBackground(isDarkMode),
        display: 'grid',
        gap: 0,
        overflow: 'hidden',
      }}
    >
      {!summaryMode && (
        <header className="marketing-timeline-header" style={{ borderBottomColor: border, background: headerSurface }}>
          <span>
            <strong style={{ color: textColour }}>Marketing timeline</strong>
            <small style={{ color: mutedColour }}>{rangeLabel} | {formatMetricNumber(orderedMonths.length)} months | {formatMetricNumber(activeWeeks)} active weeks</small>
          </span>
          <span
            role="status"
            aria-live="polite"
            className={isProcessing ? 'marketing-timeline-status is-processing' : 'marketing-timeline-status'}
            style={{ borderColor: isProcessing ? colours.highlight : border, color: isProcessing ? colours.highlight : quietColour }}
          >
            <span aria-hidden="true" className="marketing-timeline-status-dot" />
            {statusLabel}
          </span>
        </header>
      )}

      {!summaryMode && (
        <div className="marketing-timeline-summary-row" style={{ borderBottomColor: border, background: headerSurface }}>
          <span>
            <strong style={{ color: textColour }}>{formatMetricNumber(orderedMonths.length)} months</strong>
            <small style={{ color: mutedColour }}>{formatMetricNumber(activeWeeks)} / {formatMetricNumber(totalWeeks)} weeks active, {formatMetricNumber(totalDays)} tracked days</small>
          </span>
          <span>
            <strong style={{ color: textColour }}>{formatMetricNumber(timelineSummary.enquiries)}</strong>
            <small style={{ color: mutedColour }}>search enquiries</small>
          </span>
          <span>
            <strong style={{ color: textColour }}>{formatMetricNumber(timelineSummary.matters)}</strong>
            <small style={{ color: mutedColour }}>matched matters</small>
          </span>
          <span>
            <strong style={{ color: valueColour }}>{formatMetricRatio(timelineSummary.roi)}</strong>
            <small style={{ color: mutedColour }}>{formatMetricCurrency(timelineSummary.matterValue)} value</small>
          </span>
        </div>
      )}

      <div className="marketing-timeline-table" style={{ color: textColour }}>
        <span className="marketing-timeline-section-label" style={{ color: colours.dark.text, borderTopColor: withAlpha(colours.darkBlue, isDarkMode ? 0.72 : 0.88), background: colours.helixBlue }}>
          Weekly Split
        </span>

        {orderedMonths.length === 0 && isProcessing ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="marketing-timeline-row is-skeleton" style={{ borderTopColor: border, background: index % 2 === 0 ? rowSurface : rowAltSurface }}>
              {Array.from({ length: 3 }).map((__, cellIndex) => (
                <span key={cellIndex} className="marketing-timeline-skeleton-cell">
                  <span className="marketing-timeline-skeleton-line" style={{ width: `${cellIndex === 0 ? 72 : 58 + ((cellIndex + index) % 3) * 12}%` }} />
                  <span className="marketing-timeline-skeleton-line is-small" style={{ width: `${48 + ((cellIndex + index) % 4) * 9}%` }} />
                </span>
              ))}
            </div>
          ))
        ) : orderedMonths.length === 0 ? (
          <span className="marketing-timeline-empty" style={{ color: mutedColour, borderTopColor: border }}>
            No SEO or PPC operating totals are available for this window yet.
          </span>
        ) : orderedMonths.map((month, index) => {
          const outcome = timelineOutcome(month);
          const spend = month.seoSpend + month.ppcSpend;
          const spendAndReturnTotal = Math.max(0, spend + outcome.matterValue);
          const spendPercent = spendAndReturnTotal > 0
            ? clampPercent((spend / spendAndReturnTotal) * 100)
            : 0;
          const valuePercent = spendAndReturnTotal > 0
            ? clampPercent((outcome.matterValue / spendAndReturnTotal) * 100)
            : 0;
          return (
            <div key={month.key} className="marketing-timeline-row" style={{ borderTopColor: border, background: index % 2 === 0 ? rowSurface : rowAltSurface }}>
              <span className="marketing-timeline-period-cell">
                <strong>{month.label}</strong>
                <small className="marketing-timeline-period-range" style={{ color: quietColour }}>{formatTimelineRangeLabel(month.rangeLabel)}</small>
              </span>
              <span className="marketing-timeline-progression-cell">
                <span className="marketing-timeline-progression-values">
                  <span>
                    <small style={{ color: quietColour }}>Spend</small>
                    <strong style={{ color: spendColour }}>{formatMetricCurrency(spend)}</strong>
                  </span>
                  <span>
                    <small style={{ color: quietColour }}>Total value</small>
                    <strong style={{ color: valueColour }}>{formatMetricCurrency(outcome.matterValue)}</strong>
                  </span>
                </span>
                <span className="marketing-timeline-progression-track" aria-hidden="true">
                  {spendPercent > 0 && (
                    <span
                      className="marketing-timeline-progression-segment is-spend"
                      style={{ width: `${spendPercent}%`, background: withAlpha(spendColour, isDarkMode ? 0.72 : 0.68) }}
                    />
                  )}
                  {valuePercent > 0 && (
                    <span
                      className="marketing-timeline-progression-segment is-value"
                      style={{ width: `${valuePercent}%`, background: withAlpha(valueColour, isDarkMode ? 0.86 : 0.82) }}
                    />
                  )}
                </span>
                <small style={{ color: mutedColour }}>{formatMetricCurrency(outcome.received)} received | {formatMetricRatio(outcome.roi)} ROI</small>
              </span>
              {renderActivitySignal(month)}
            </div>
          );
        })}
      </div>

      <style>{`
        .marketing-timeline-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border-bottom: 1px solid;
        }

        .marketing-timeline-header > span:first-child {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        .marketing-timeline-header strong,
        .marketing-timeline-summary-row strong,
        .marketing-timeline-period-cell strong,
        .marketing-timeline-progression-cell strong,
        .marketing-timeline-signal-cell strong {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 900;
        }

        .marketing-timeline-header strong {
          font-size: 11px;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .marketing-timeline-header small,
        .marketing-timeline-summary-row small,
        .marketing-timeline-period-cell small,
        .marketing-timeline-progression-cell small,
        .marketing-timeline-signal-cell small {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 9px;
          line-height: 1.2;
          font-weight: 800;
        }

        .marketing-timeline-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 24px;
          padding: 0 8px;
          border: 1px solid;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .marketing-timeline-status-dot {
          width: 7px;
          height: 7px;
          background: currentColor;
        }

        .marketing-timeline-status.is-processing .marketing-timeline-status-dot {
          animation: marketing-timeline-pulse 1400ms ease-in-out infinite;
        }

        .marketing-timeline-summary-row {
          display: grid;
          grid-template-columns: minmax(136px, 1.1fr) repeat(3, minmax(92px, 0.7fr));
          gap: 0;
          border-bottom: 1px solid;
        }

        .marketing-timeline-summary-row > span {
          display: grid;
          gap: 3px;
          min-width: 0;
          padding: 8px 10px;
          border-left: 1px solid ${border};
        }

        .marketing-timeline-summary-row > span:first-child {
          border-left: 0;
        }

        .marketing-timeline-summary-row strong {
          font-size: 14px;
          line-height: 1;
        }

        .marketing-timeline-table {
          display: grid;
          min-width: 0;
          overflow-x: auto;
        }

        .marketing-timeline-row {
          display: grid;
          grid-template-columns: minmax(126px, 0.84fr) minmax(270px, 1.62fr) minmax(320px, 1.9fr);
          min-width: 760px;
          border-top: 1px solid;
          transition: background-color 180ms ease, box-shadow 220ms ease;
        }

        .marketing-timeline-row.is-heading {
          display: none;
          min-height: 0;
          border-top: 0;
        }

        .marketing-timeline-row.is-heading span {
          padding: 7px 8px;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .marketing-timeline-section-label {
          display: block;
          border-top: 1px solid;
          padding: 7px 10px;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0;
          text-transform: uppercase;
        }

        .marketing-timeline-row > span {
          min-width: 0;
          border-left: 1px solid ${withAlpha(isDarkMode ? colours.dark.text : colours.greyText, isDarkMode ? 0.08 : 0.10)};
        }

        .marketing-timeline-row > span:first-child {
          border-left: 0;
        }

        .marketing-timeline-period-cell,
        .marketing-timeline-progression-cell,
        .marketing-timeline-signal-cell,
        .marketing-timeline-skeleton-cell {
          display: grid;
          align-content: center;
          gap: 5px;
          min-height: 64px;
          min-width: 0;
          padding: 9px 10px;
        }

        .marketing-timeline-period-cell strong,
        .marketing-timeline-progression-cell strong,
        .marketing-timeline-signal-cell strong {
          font-size: 12px;
          line-height: 1.05;
        }

        .marketing-timeline-period-range {
          font-size: 10px;
          letter-spacing: 0.01em;
          transition: color 180ms ease;
        }

        .marketing-timeline-progression-values {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 12px;
          min-width: 0;
        }

        .marketing-timeline-progression-values > span,
        .marketing-timeline-signal-metrics > span,
        .marketing-timeline-signal-bar {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        .marketing-timeline-progression-track {
          display: flex;
          height: 12px;
          margin: 2px 0 1px;
          background: ${withAlpha(isDarkMode ? colours.dark.text : colours.greyText, isDarkMode ? 0.12 : 0.10)};
          overflow: hidden;
        }

        .marketing-timeline-progression-segment {
          display: block;
          height: 100%;
          transition: width 220ms ease, filter 180ms ease;
        }

        .marketing-timeline-row:not(.is-heading):hover {
          box-shadow: inset 2px 0 0 ${withAlpha(colours.highlight, isDarkMode ? 0.74 : 0.66)};
        }

        .marketing-timeline-row:not(.is-heading):hover .marketing-timeline-period-range {
          color: ${isDarkMode ? colours.dark.text : colours.darkBlue};
        }

        .marketing-timeline-row:not(.is-heading):hover .marketing-timeline-progression-segment {
          filter: saturate(1.08);
        }

        .marketing-timeline-signal-cell {
          display: grid;
          gap: 6px;
          min-width: 0;
        }

        .marketing-timeline-weekly-breakdown {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
          min-width: 0;
        }

        .marketing-timeline-weekly-row {
          display: grid;
          align-content: start;
          gap: 1px;
          min-width: 0;
          padding: 0;
          transition: opacity 180ms ease;
        }

        .marketing-timeline-weekly-row.is-empty {
          opacity: 0.54;
        }

        .marketing-timeline-weekly-row small,
        .marketing-timeline-weekly-row strong {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 980px) {
          .marketing-timeline-weekly-breakdown {
            gap: 4px;
          }
        }

        .marketing-timeline-empty {
          display: block;
          border-top: 1px solid;
          padding: 14px;
          font-size: 11px;
          font-weight: 700;
        }

        .marketing-timeline-skeleton-cell {
          overflow: hidden;
        }

        .marketing-timeline-skeleton-line {
          display: block;
          height: 12px;
          background: ${withAlpha(colours.highlight, isDarkMode ? 0.18 : 0.12)};
        }

        .marketing-timeline-skeleton-line.is-small {
          height: 8px;
          background: ${withAlpha(colours.highlight, isDarkMode ? 0.12 : 0.08)};
        }

        @media (max-width: 760px) {
          .marketing-timeline-summary-row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .marketing-timeline-summary-row > span:nth-child(3) {
            border-left: 0;
            border-top: 1px solid ${border};
          }

          .marketing-timeline-summary-row > span:nth-child(4) {
            border-top: 1px solid ${border};
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
      `}</style>
    </section>
  );
};

export default MarketingTimelineWorkbench;