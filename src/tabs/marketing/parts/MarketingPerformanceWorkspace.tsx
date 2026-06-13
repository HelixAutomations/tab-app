import React, { useMemo, useState } from 'react';
import { colours } from '../../../app/styles/colours';
import {
  reportingPanelBackground,
  reportingPanelBorder,
} from '../../Reporting/styles/reportingFoundation';
import { getNormalizedEnquiryMOC } from '../../../utils/enquirySource';

export type MarketingWorkspaceRow = {
  id: string;
  sortTs: number;
  primary: string;
  secondary: string;
  status: string;
  owner: string;
  timestamp: string;
  value: string;
  detail: string;
};

type MarketingPerformanceWorkspaceProps = {
  isDarkMode: boolean;
  googleAnalyticsRows: unknown[];
  googleAdsRows: unknown[];
  ledgerRowsByTab: Partial<Record<string, MarketingWorkspaceRow[]>>;
  isBlueprintMode?: boolean;
};

type ChannelMetric = {
  label: string;
  value: string;
  detail: string;
};

type GoogleAnalyticsTotals = {
  sessions: number;
  users: number;
  views: number;
  keyEvents: number;
  rows: number;
};

type GoogleAdsTotals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  rows: number;
};

type MarketingChannelKey = 'seo' | 'ppc';

type SourceAttributionCounts = Record<MarketingChannelKey | 'other', number>;

type MarketingChannelMetric = {
  key: string;
  label: string;
  headline: string;
  subline: string;
  attribution: string;
  evidence: string;
  status: 'live' | 'pending';
};

type IntakeMetric = {
  key: string;
  label: string;
  value: string;
  detail: string;
  evidence: string;
};

type JourneyMetric = {
  key: string;
  label: string;
  value: string;
  detail: string;
  basis: string;
};

type IntakeBreakdown = {
  calls: number;
  forms: number;
  email: number;
  other: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
}

function parseMoneyLabel(value: string): number {
  return toNumber(value);
}

function normaliseText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function isUnclassifiedSource(row: MarketingWorkspaceRow): boolean {
  const source = normaliseText(row.status);
  return !source || source.includes('unknown') || source.includes('unassigned') || source.includes('not set');
}

function isFormEnquiry(row: MarketingWorkspaceRow): boolean {
  const method = normaliseText(readEnquiryMethod(row));
  const haystack = normaliseText(`${row.secondary} ${row.detail}`);
  return method.includes('form') || method.includes('web') || method.includes('website') || haystack.includes('form submission');
}

function isCallEnquiry(row: MarketingWorkspaceRow): boolean {
  const method = normaliseText(readEnquiryMethod(row));
  return method.includes('call') || method.includes('phone') || method.includes('telephone');
}

function isPitchOutstanding(row: MarketingWorkspaceRow): boolean {
  const status = normaliseText(row.status);
  return !status.includes('closed') && !status.includes('won') && !status.includes('instructed') && !status.includes('lost');
}

function readAreaOfWork(row: MarketingWorkspaceRow): string {
  const fromSecondary = String(row.secondary || '').split('|')[0]?.trim() || '';
  if (fromSecondary && normaliseText(fromSecondary) !== 'unknown area') return fromSecondary;
  const fallback = normaliseText(`${row.secondary} ${row.detail}`);
  if (fallback.includes('employment')) return 'Employment';
  if (fallback.includes('family') || fallback.includes('divorce') || fallback.includes('children')) return 'Family';
  if (fallback.includes('property') || fallback.includes('convey') || fallback.includes('real estate')) return 'Property';
  if (fallback.includes('immigration')) return 'Immigration';
  if (fallback.includes('corporate') || fallback.includes('commercial') || fallback.includes('company')) return 'Corporate';
  if (fallback.includes('litigation') || fallback.includes('dispute') || fallback.includes('injury')) return 'Litigation';
  return 'General';
}

function readSecondarySegments(row: MarketingWorkspaceRow): string[] {
  return String(row.secondary || '')
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function readEnquiryMethod(row: MarketingWorkspaceRow): string {
  return readSecondarySegments(row)[1] || 'Unknown contact';
}

function readNormalizedEnquiryMethod(row: MarketingWorkspaceRow) {
  return getNormalizedEnquiryMOC({
    Method_of_Contact: readEnquiryMethod(row),
    Ultimate_Source: row.status,
  });
}

function readStraightSourceChannel(row: MarketingWorkspaceRow): MarketingChannelKey | 'other' {
  const source = normaliseText(row.status);
  if (source === 'organic search') return 'seo';
  if (source === 'paid search') return 'ppc';
  return 'other';
}

function buildAttributionCounts(rows: MarketingWorkspaceRow[]): SourceAttributionCounts {
  return rows.reduce<SourceAttributionCounts>((acc, row) => {
    acc[readStraightSourceChannel(row)] += 1;
    return acc;
  }, { seo: 0, ppc: 0, other: 0 });
}

function buildIntakeBreakdown(rows: MarketingWorkspaceRow[]): IntakeBreakdown {
  const calls = rows.filter((row) => readNormalizedEnquiryMethod(row).key === 'phone' || isCallEnquiry(row)).length;
  const forms = rows.filter((row) => readNormalizedEnquiryMethod(row).key === 'web_form' || isFormEnquiry(row)).length;
  const email = rows.filter((row) => readNormalizedEnquiryMethod(row).key === 'email').length;
  return { calls, forms, email, other: Math.max(0, rows.length - calls - forms - email) };
}

function formatPercentage(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  return `${formatNumber((part / whole) * 100, 1)}%`;
}

function formatConversion(current: number, previous: number): string {
  return previous > 0 ? `${formatPercentage(current, previous)} from previous stage` : 'No previous-stage base yet';
}

function readMatterReference(row: MarketingWorkspaceRow): string {
  return String(row.primary || '').trim() || 'No ref';
}

function readOwnerInitials(row: MarketingWorkspaceRow): string {
  const raw = String(row.owner || '').trim();
  if (!raw || raw.toLowerCase() === 'unassigned') return '--';
  if (/^[A-Za-z]{2,3}$/.test(raw)) return raw.toUpperCase();
  if (raw.includes('@')) {
    const local = raw.split('@')[0] || '';
    if (local && /^[A-Za-z]{2,3}$/.test(local)) return local.toUpperCase();
    if (local.includes('.')) {
      return local
        .split('.')
        .map((part) => part[0] || '')
        .join('')
        .slice(0, 3)
        .toUpperCase() || '--';
    }
    return local.slice(0, 2).toUpperCase() || '--';
  }
  const tokens = raw
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return '--';
  if (tokens.length === 1) {
    const compact = tokens[0].slice(0, 2).toUpperCase();
    return compact || '--';
  }
  return `${tokens[0][0] || ''}${tokens[1][0] || ''}`.toUpperCase() || '--';
}

function readMatterResponsibleInitials(row: MarketingWorkspaceRow): string {
  return readOwnerInitials(row);
}

function readMatterOriginatingInitials(row: MarketingWorkspaceRow): string {
  return readOwnerInitials({ ...row, owner: row.detail });
}

function areaAccentColour(areaOfWork: string, isDarkMode: boolean): string {
  const area = normaliseText(areaOfWork);
  if (area.includes('employment')) return isDarkMode ? colours.yellow : colours.yellow;
  if (area.includes('family') || area.includes('divorce') || area.includes('children')) return colours.orange;
  if (area.includes('property') || area.includes('convey') || area.includes('real estate')) return colours.green;
  if (area.includes('immigration')) return colours.blue;
  if (area.includes('corporate') || area.includes('commercial') || area.includes('company')) return colours.helixBlue;
  if (area.includes('litigation') || area.includes('dispute') || area.includes('injury')) return colours.cta;
  return isDarkMode ? colours.blue : colours.helixBlue;
}

function metricRecord(row: unknown, nestedKey: 'googleAnalytics' | 'googleAds'): Record<string, unknown> | null {
  const record = asRecord(row);
  if (!record) return null;
  return asRecord(record[nestedKey]) ?? record;
}

function buildGoogleAnalyticsTotals(rows: unknown[]): GoogleAnalyticsTotals {
  return rows.reduce<GoogleAnalyticsTotals>((acc, row) => {
    const metrics = metricRecord(row, 'googleAnalytics');
    if (!metrics) return acc;
    acc.sessions += toNumber(metrics.sessions);
    acc.users += toNumber(metrics.activeUsers ?? metrics.users);
    acc.views += toNumber(metrics.screenPageViews ?? metrics.pageViews ?? metrics.views);
    acc.keyEvents += toNumber(metrics.conversions ?? metrics.keyEvents);
    acc.rows += 1;
    return acc;
  }, { sessions: 0, users: 0, views: 0, keyEvents: 0, rows: 0 });
}

function buildGoogleAdsTotals(rows: unknown[]): GoogleAdsTotals {
  return rows.reduce<GoogleAdsTotals>((acc, row) => {
    const metrics = metricRecord(row, 'googleAds');
    if (!metrics) return acc;
    const costMicros = toNumber(metrics.costMicros);
    acc.impressions += toNumber(metrics.impressions);
    acc.clicks += toNumber(metrics.clicks);
    acc.cost += metrics.cost == null && costMicros > 0 ? costMicros / 1000000 : toNumber(metrics.cost);
    acc.conversions += toNumber(metrics.conversions);
    acc.rows += 1;
    return acc;
  }, { impressions: 0, clicks: 0, cost: 0, conversions: 0, rows: 0 });
}

const panelStyle = (isDarkMode: boolean): React.CSSProperties => ({
  border: `1px solid ${reportingPanelBorder(isDarkMode)}`,
  background: reportingPanelBackground(isDarkMode, 'elevated'),
  padding: 12,
  display: 'grid',
  gap: 8,
  minWidth: 0,
});

const MarketingPerformanceWorkspace: React.FC<MarketingPerformanceWorkspaceProps> = ({
  isDarkMode,
  googleAnalyticsRows,
  googleAdsRows,
  ledgerRowsByTab,
  isBlueprintMode = false,
}) => {
  const metrics = useMemo(() => {
    const website = buildGoogleAnalyticsTotals(googleAnalyticsRows);
    const paid = buildGoogleAdsTotals(googleAdsRows);
    const enquiries = ledgerRowsByTab.enquiries ?? [];
    const calls = ledgerRowsByTab.calls ?? [];
    const pitches = ledgerRowsByTab.pitches ?? [];
    const instructions = ledgerRowsByTab.instructions ?? [];
    const matters = ledgerRowsByTab.matters ?? [];
    const collectedRows = ledgerRowsByTab.collectedTime ?? [];
    const collected = collectedRows.reduce((sum, row) => sum + parseMoneyLabel(row.value), 0);
    const sourceAttribution = buildAttributionCounts(enquiries);
    const classifiedEnquiries = enquiries.filter((row) => !isUnclassifiedSource(row)).length;
    const unclassifiedEnquiries = Math.max(0, enquiries.length - classifiedEnquiries);
    const intakeBreakdown = buildIntakeBreakdown(enquiries);
    const outstandingPitches = pitches.filter(isPitchOutstanding).length;
    const closedPitches = Math.max(0, pitches.length - outstandingPitches);
    const matterRowsWithValue = matters.filter((row) => parseMoneyLabel(row.value) > 0).length;
    const enquiryRate = website.sessions > 0 ? (enquiries.length / website.sessions) * 100 : 0;
    const pitchRate = enquiries.length > 0 ? (pitches.length / enquiries.length) * 100 : 0;
    const instructionRate = pitches.length > 0 ? (instructions.length / pitches.length) * 100 : 0;
    return {
      website,
      paid,
      enquiries,
      calls,
      pitches,
      instructions,
      matters,
      collected,
      sourceAttribution,
      classifiedEnquiries,
      unclassifiedEnquiries,
      intakeBreakdown,
      outstandingPitches,
      closedPitches,
      matterRowsWithValue,
      enquiryRate,
      pitchRate,
      instructionRate,
    };
  }, [googleAdsRows, googleAnalyticsRows, ledgerRowsByTab]);

  const [selectedMarketingChannel, setSelectedMarketingChannel] = useState<MarketingChannelKey>('seo');
  const selectedChannelLabel = selectedMarketingChannel === 'seo' ? 'SEO' : 'PPC';
  const selectedSourceValue = selectedMarketingChannel === 'seo' ? 'Organic search' : 'Paid search';
  const selectedChannelEnquiries = useMemo(
    () => metrics.enquiries.filter((row) => readStraightSourceChannel(row) === selectedMarketingChannel),
    [metrics.enquiries, selectedMarketingChannel],
  );
  const selectedIntakeBreakdown = useMemo(() => buildIntakeBreakdown(selectedChannelEnquiries), [selectedChannelEnquiries]);
  const selectedJourneyStages: JourneyMetric[] = [
    {
      key: 'enquiries',
      label: 'Enquiries',
      value: formatNumber(selectedChannelEnquiries.length),
      detail: `${selectedSourceValue} source field`,
      basis: 'Straight read from enquiry source',
    },
    {
      key: 'pitches',
      label: 'Pitches',
      value: formatNumber(metrics.pitches.length),
      detail: `${formatNumber(metrics.outstandingPitches)} outstanding, ${formatNumber(metrics.closedPitches)} closed`,
      basis: 'Selected-window pipeline total until source linkage is consumed',
    },
    {
      key: 'instructions',
      label: 'Instructions',
      value: formatNumber(metrics.instructions.length),
      detail: formatConversion(metrics.instructions.length, metrics.pitches.length),
      basis: 'Selected-window pipeline total',
    },
    {
      key: 'matters',
      label: 'Matters',
      value: formatNumber(metrics.matters.length),
      detail: formatConversion(metrics.matters.length, metrics.instructions.length),
      basis: `${formatNumber(metrics.matterRowsWithValue)} with matter value evidence`,
    },
    {
      key: 'collected',
      label: 'Collected',
      value: formatCurrency(metrics.collected),
      detail: `${formatNumber(metrics.matters.length)} matters in window`,
      basis: 'Recovered fee ledger',
    },
  ];

  const channelBoard: MarketingChannelMetric[] = [
    {
      key: 'seo',
      label: 'SEO',
      headline: formatNumber(metrics.website.sessions),
      subline: `${formatNumber(metrics.sourceAttribution.seo)} attributed enquiries`,
      attribution: 'Source field: Organic search',
      evidence: 'GA4 traffic + enquiry source value',
      status: 'live',
    },
    {
      key: 'ppc',
      label: 'PPC',
      headline: formatNumber(metrics.paid.clicks),
      subline: `${formatCurrency(metrics.paid.cost)} spend`,
      attribution: `${formatNumber(metrics.sourceAttribution.ppc)} attributed enquiries`,
      evidence: 'Google Ads telemetry + Paid search source value',
      status: 'live',
    },
  ];

  const channelStatusStrip = [
    { key: 'seo', label: 'SEO', status: 'enabled' as const },
    { key: 'ppc', label: 'PPC', status: 'enabled' as const },
    { key: 'email', label: 'Email', status: 'off' as const },
  ];

  const evidenceCards: ChannelMetric[] = [
    {
      label: 'Source confidence',
      value: formatNumber(metrics.classifiedEnquiries),
      detail: `${formatNumber(metrics.unclassifiedEnquiries)} unclassified in this window`,
    },
    {
      label: 'Teams-visible intake',
      value: formatNumber(metrics.intakeBreakdown.calls + metrics.intakeBreakdown.forms),
      detail: `${formatNumber(metrics.intakeBreakdown.calls)} calls, ${formatNumber(metrics.intakeBreakdown.forms)} forms`,
    },
    {
      label: 'Pitch follow-up',
      value: formatNumber(metrics.outstandingPitches),
      detail: `${formatNumber(metrics.closedPitches)} pitches closed or instructed`,
    },
  ];

  const textColour = isDarkMode ? colours.dark.text : colours.darkBlue;
  const mutedColour = isDarkMode ? '#d1d5db' : '#4b5563';
  const [leftPanelMode, setLeftPanelMode] = useState<'seo' | 'ppc'>('seo');
  const [rightPanelMode, setRightPanelMode] = useState<'enquiries' | 'matters'>('enquiries');
  const rightPanelRows = rightPanelMode === 'matters' ? metrics.matters.slice(0, 6) : selectedChannelEnquiries.slice(0, 6);
  const splitSharedBorder = reportingPanelBorder(isDarkMode);
  const splitLeftSurface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const splitLeftBorder = splitSharedBorder;
  const splitLeftAccent = isDarkMode ? colours.blue : colours.helixBlue;
  const splitLeftText = textColour;
  const splitLeftMuted = mutedColour;
  const splitLeftLabel = isDarkMode ? colours.subtleGrey : colours.helixBlue;
  const splitRightSurface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const splitRightBorder = splitSharedBorder;
  const splitRightAccent = isDarkMode ? '#8ed1ff' : colours.blue;
  const splitRightText = textColour;
  const splitRightMuted = mutedColour;
  const splitRightLabel = isDarkMode ? '#8ed1ff' : colours.helixBlue;
  const toggleContainerBackground = isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(13, 47, 96, 0.04)';
  const splitPanelHeight = 240;
  const leftToggleButtonStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    width: '100%',
    minHeight: 24,
    padding: '0 8px',
    cursor: 'pointer',
    textAlign: 'center',
    lineHeight: 1,
  };
  const rightToggleButtonStyle: React.CSSProperties = {
    ...leftToggleButtonStyle,
  };
  const seoStatRows: ChannelMetric[] = [
    {
      label: 'Sessions',
      value: formatNumber(metrics.website.sessions),
      detail: `${formatNumber(metrics.website.rows)} tracked days`,
    },
    {
      label: 'Active users',
      value: formatNumber(metrics.website.users),
      detail: 'Google Analytics active users',
    },
    {
      label: 'Page views',
      value: formatNumber(metrics.website.views),
      detail: 'Screen/page views from GA4',
    },
    {
      label: 'Key events',
      value: formatNumber(metrics.website.keyEvents),
      detail: 'Tracked conversion/key events',
    },
  ];
  const ppcStatRows: ChannelMetric[] = [
    {
      label: 'Clicks',
      value: formatNumber(metrics.paid.clicks),
      detail: `${formatNumber(metrics.paid.rows)} tracked rows`,
    },
    {
      label: 'Impressions',
      value: formatNumber(metrics.paid.impressions),
      detail: 'Google Ads impressions',
    },
    {
      label: 'Spend',
      value: formatCurrency(metrics.paid.cost),
      detail: 'Total paid spend in range',
    },
    {
      label: 'Conversions',
      value: formatNumber(metrics.paid.conversions, 1),
      detail: 'Platform-reported conversions',
    },
  ];
  const leftPanelRows = leftPanelMode === 'ppc' ? ppcStatRows : seoStatRows;

  if (isBlueprintMode) {
    const blueprintSurface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
    const blueprintBorder = reportingPanelBorder(isDarkMode);
    const blueprintAccent = isDarkMode ? 'rgba(142, 209, 255, 0.28)' : 'rgba(13, 47, 96, 0.22)';
    const blueprintLine = isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(13, 47, 96, 0.08)';

    return (
      <section data-helix-region="marketing/performance-workspace" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          {['SEO', 'PPC', 'Enquiries', 'Instructions'].map((label, index) => (
            <div key={label} style={{ ...panelStyle(isDarkMode), minHeight: 110, background: blueprintSurface, border: `1px solid ${blueprintBorder}` }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                {label}
              </span>
              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                <div style={{ width: `${70 - index * 4}%`, height: 14, background: blueprintLine }} />
                <div style={{ width: `${52 + index * 5}%`, height: 22, background: blueprintAccent }} />
                <div style={{ width: `${82 - index * 3}%`, height: 10, background: blueprintLine }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <div style={{ ...panelStyle(isDarkMode), minHeight: 320, background: blueprintSurface, border: `1px solid ${blueprintBorder}` }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ width: '38%', height: 12, background: blueprintLine }} />
              <div style={{ display: 'grid', gap: 10 }}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 72px', gap: 10, alignItems: 'center' }}>
                    <div style={{ height: 12, background: index % 2 === 0 ? blueprintLine : blueprintAccent }} />
                    <div style={{ height: 12, background: blueprintLine }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ ...panelStyle(isDarkMode), minHeight: 320, background: blueprintSurface, border: `1px solid ${blueprintBorder}` }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ width: '44%', height: 12, background: blueprintLine }} />
              <div style={{ display: 'grid', gap: 10 }}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 54px 64px', gap: 10, alignItems: 'center' }}>
                    <div style={{ height: 12, background: blueprintAccent }} />
                    <div style={{ height: 12, background: blueprintLine }} />
                    <div style={{ height: 12, background: blueprintLine }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      data-helix-region="marketing/performance-workspace"
      style={{
        display: 'grid',
        gap: 12,
      }}
    >
      <section data-helix-region="marketing/channel-board" style={{ ...panelStyle(isDarkMode), gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: textColour }}>Marketing channels</h2>
        </div>
        <div
          data-helix-region="marketing/channel-status-strip"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            padding: '7px 8px',
            border: `1px solid ${reportingPanelBorder(isDarkMode)}`,
            background: isDarkMode ? 'rgba(10, 26, 45, 0.54)' : 'rgba(244, 244, 246, 0.70)',
          }}
        >
          {channelStatusStrip.map((channel) => {
            const enabled = channel.status === 'enabled';
            return (
              <span
                key={channel.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 22,
                  padding: '0 8px',
                  border: `1px solid ${enabled ? (isDarkMode ? 'rgba(142, 209, 255, 0.32)' : 'rgba(13, 47, 96, 0.16)') : (isDarkMode ? 'rgba(148, 163, 184, 0.14)' : 'rgba(148, 163, 184, 0.22)')}`,
                  background: enabled ? (isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(13, 47, 96, 0.04)') : 'transparent',
                  color: enabled ? textColour : (isDarkMode ? 'rgba(209, 213, 219, 0.52)' : 'rgba(75, 85, 99, 0.56)'),
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: enabled ? colours.green : (isDarkMode ? 'rgba(148, 163, 184, 0.32)' : 'rgba(107, 114, 128, 0.34)'),
                    boxShadow: enabled ? '0 0 0 2px rgba(32, 178, 108, 0.12)' : 'none',
                  }}
                />
                {channel.label}
                <span style={{ color: enabled ? (isDarkMode ? '#9de7c2' : '#0f6c4c') : 'inherit' }}>
                  {enabled ? 'Enabled' : 'Off'}
                </span>
              </span>
            );
          })}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 10,
          }}
        >
          {channelBoard.map((channel) => {
            const accent = channel.key === 'ppc'
              ? colours.green
              : channel.key === 'email'
                ? colours.orange
                : (isDarkMode ? '#8ed1ff' : colours.helixBlue);
            const selected = selectedMarketingChannel === channel.key;
            return (
              <button
                type="button"
                key={channel.key}
                aria-pressed={selected}
                onClick={() => setSelectedMarketingChannel(channel.key as MarketingChannelKey)}
                style={{
                  display: 'grid',
                  gridTemplateRows: 'auto auto auto 1fr',
                  gap: 8,
                  minHeight: 150,
                  padding: '12px 12px 11px',
                  border: `1px solid ${selected ? accent : reportingPanelBorder(isDarkMode)}`,
                  borderTop: `2px solid ${accent}`,
                  background: channel.status === 'pending'
                    ? (isDarkMode ? 'rgba(10, 26, 45, 0.62)' : 'rgba(244, 244, 246, 0.88)')
                    : selected
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.16)' : 'rgba(13, 47, 96, 0.06)')
                      : reportingPanelBackground(isDarkMode),
                  opacity: channel.status === 'pending' ? 0.78 : 1,
                  textAlign: 'left',
                  cursor: 'pointer',
                  boxShadow: selected ? (isDarkMode ? '0 0 0 1px rgba(142, 209, 255, 0.12)' : '0 0 0 1px rgba(13, 47, 96, 0.08)') : 'none',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.07em', textTransform: 'uppercase', color: accent }}>
                    {channel.label}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: isDarkMode ? colours.subtleGrey : colours.greyText, textTransform: 'uppercase' }}>
                    {channel.status}
                  </span>
                </span>
                <strong style={{ fontSize: channel.status === 'pending' ? 18 : 24, lineHeight: 1, color: textColour }}>
                  {channel.headline}
                </strong>
                <span style={{ fontSize: 11, lineHeight: 1.35, fontWeight: 800, color: mutedColour }}>
                  {channel.subline}
                </span>
                <span style={{ display: 'grid', gap: 4, alignSelf: 'end' }}>
                  <span style={{ fontSize: 10, lineHeight: 1.35, fontWeight: 700, color: mutedColour }}>{channel.attribution}</span>
                  <span style={{ fontSize: 9, lineHeight: 1.3, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>{channel.evidence}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section data-helix-region="marketing/selected-source-journey" style={{ ...panelStyle(isDarkMode), gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: textColour }}>{selectedChannelLabel} enquiry journey</h2>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
            {selectedSourceValue} source field
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 0, border: `1px solid ${reportingPanelBorder(isDarkMode)}` }}>
          {[
            ['Call', selectedIntakeBreakdown.calls],
            ['Form', selectedIntakeBreakdown.forms],
            ['Email', selectedIntakeBreakdown.email],
            ['Other', selectedIntakeBreakdown.other],
          ].map(([label, value], index, items) => (
            <div
              key={String(label)}
              style={{
                display: 'grid',
                gap: 6,
                padding: '10px 10px',
                borderRight: index === items.length - 1 ? 'none' : `1px solid ${reportingPanelBorder(isDarkMode)}`,
                background: reportingPanelBackground(isDarkMode, 'elevated'),
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.07em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>{String(label)} intake</span>
              <strong style={{ fontSize: 18, lineHeight: 1, color: textColour }}>{formatNumber(Number(value))}</strong>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 0, border: `1px solid ${reportingPanelBorder(isDarkMode)}` }}>
          {selectedJourneyStages.map((stage, index) => (
            <div
              key={stage.key}
              style={{
                display: 'grid',
                gap: 7,
                padding: '11px 10px',
                minHeight: 126,
                borderRight: index === selectedJourneyStages.length - 1 ? 'none' : `1px solid ${reportingPanelBorder(isDarkMode)}`,
                background: index === 0 ? (isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(54, 144, 206, 0.06)') : 'transparent',
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.07em', textTransform: 'uppercase', color: isDarkMode ? '#8ed1ff' : colours.helixBlue }}>{stage.label}</span>
              <strong style={{ fontSize: 20, lineHeight: 1, color: textColour }}>{stage.value}</strong>
              <span style={{ fontSize: 10, lineHeight: 1.35, fontWeight: 700, color: mutedColour }}>{stage.detail}</span>
              <span style={{ fontSize: 9, lineHeight: 1.3, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>{stage.basis}</span>
            </div>
          ))}
        </div>
      </section>

      <section data-helix-region="marketing/evidence-quality" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        {evidenceCards.map((card) => (
          <div key={card.label} style={{ ...panelStyle(isDarkMode), borderTop: `2px solid ${isDarkMode ? '#8ed1ff' : colours.helixBlue}` }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              {card.label}
            </span>
            <strong style={{ fontSize: 22, lineHeight: 1, color: textColour }}>{card.value}</strong>
            <span style={{ fontSize: 11, fontWeight: 700, color: mutedColour }}>{card.detail}</span>
          </div>
        ))}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, width: '100%' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr)',
            gap: 0,
            minWidth: 0,
            width: '100%',
            flex: '1 1 100%',
            height: splitPanelHeight,
            padding: '6px 8px',
            border: `1px solid ${splitLeftBorder}`,
            background: splitLeftSurface,
            borderTop: `2px solid ${splitLeftAccent}`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 0,
              padding: '1px',
              marginBottom: 4,
              border: `1px solid ${splitLeftBorder}`,
              background: toggleContainerBackground,
            }}
          >
            {[
              { key: 'seo', label: 'SEO' },
              { key: 'ppc', label: 'PPC' },
            ].map((option) => {
              const isActive = leftPanelMode === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setLeftPanelMode(option.key as 'seo' | 'ppc')}
                  style={{
                    border: `1px solid ${isActive ? splitLeftAccent : 'transparent'}`,
                    background: isActive
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(13, 47, 96, 0.12)')
                      : 'transparent',
                    color: isActive ? splitLeftText : splitLeftMuted,
                    ...leftToggleButtonStyle,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="marketing-scroll-chrome" style={{ display: 'grid', gap: 0, minHeight: 0, overflowY: 'auto' }}>
            {leftPanelRows.map((row, index) => (
              <div
                key={row.label}
                style={{
                  display: 'grid',
                  gap: 2,
                  padding: '6px 2px',
                  borderBottom: index === leftPanelRows.length - 1 ? 'none' : `1px solid ${splitLeftBorder}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: splitLeftLabel }}>
                    {row.label}
                  </span>
                  <strong style={{ fontSize: 14, lineHeight: 1, color: splitLeftText, flex: '0 0 auto' }}>{row.value}</strong>
                </div>
                <span style={{ fontSize: 9, color: splitLeftMuted }}>{row.detail}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr)',
            gap: 0,
            minWidth: 0,
            width: '100%',
            flex: '1 1 100%',
            height: splitPanelHeight,
            padding: '6px 8px',
            border: `1px solid ${splitRightBorder}`,
            background: splitRightSurface,
            borderTop: `2px solid ${splitRightAccent}`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 0,
              padding: '1px',
              marginBottom: 4,
              border: `1px solid ${splitRightBorder}`,
              background: toggleContainerBackground,
            }}
          >
            {[
              { key: 'enquiries', label: `${selectedChannelLabel} enquiries ${formatNumber(selectedChannelEnquiries.length)}` },
              { key: 'matters', label: `Matters ${formatNumber(metrics.matters.length)}` },
            ].map((option) => {
              const isActive = rightPanelMode === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setRightPanelMode(option.key as 'enquiries' | 'matters')}
                  style={{
                    border: `1px solid ${isActive ? splitRightAccent : 'transparent'}`,
                    background: isActive
                      ? (isDarkMode ? 'rgba(64, 147, 255, 0.22)' : 'rgba(64, 147, 255, 0.12)')
                      : 'transparent',
                    color: isActive ? splitRightText : splitRightMuted,
                    ...rightToggleButtonStyle,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="marketing-scroll-chrome" style={{ display: 'grid', gap: 0, minHeight: 0, overflowY: 'auto' }}>
            {rightPanelRows.map((row, index) => (
              <div
                key={`${rightPanelMode}-${row.id}-${index}`}
                style={{
                  display: 'grid',
                  gap: 2,
                  padding: (rightPanelMode === 'enquiries' || rightPanelMode === 'matters') ? '6px 6px' : '6px 2px',
                  borderLeft: (rightPanelMode === 'enquiries' || rightPanelMode === 'matters')
                    ? `3px solid ${areaAccentColour(readAreaOfWork(row), isDarkMode)}`
                    : 'none',
                  borderBottom: index === rightPanelRows.length - 1 ? 'none' : `1px solid ${splitRightBorder}`,
                }}
              >
                {rightPanelMode === 'enquiries' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: splitRightText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.primary}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightMuted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {readOwnerInitials(row)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightMuted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {readEnquiryMethod(row)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightLabel, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {row.status}
                    </span>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: splitRightText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {readMatterReference(row)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightMuted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {readMatterResponsibleInitials(row)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightLabel, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {readMatterOriginatingInitials(row)}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {rightPanelRows.length === 0 && (
              <div style={{ padding: '8px 2px', fontSize: 10, color: splitRightMuted }}>
                {rightPanelMode === 'matters'
                  ? 'No matters in this reporting window yet.'
                  : 'No enquiries in this reporting window yet.'}
              </div>
            )}
          </div>
        </div>
      </div>

    </section>
  );
};

export default MarketingPerformanceWorkspace;