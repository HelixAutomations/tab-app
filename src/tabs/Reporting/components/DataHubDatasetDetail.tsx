import React from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { colours } from '../../../app/styles/colours';
import {
  reportingPanelBackground,
  reportingPanelBorder,
  reportingPanelShadow,
} from '../styles/reportingFoundation';
import type {
  ReportingDatasetRegistryEntry,
  ReportingDatasetStatus,
  ReportingLiveDatasetSummary,
  ReportingDatasetProviderMeta,
} from '../reportingDatasets';

type ContextDataset = {
  key: string;
  name: string;
  status: ReportingDatasetStatus;
  count: number | null;
};

type ProviderProbeMetric = {
  label: string;
  value: string;
  detail?: string;
};

type GoogleAdsProbeTotals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
};

type GoogleAnalyticsProbeTotals = {
  sessions: number;
  users: number;
  views: number;
  keyEvents: number;
};

type ProviderProbeState = {
  status: ReportingDatasetStatus;
  phase: 'idle' | 'preparing' | 'fetching' | 'processing' | 'complete' | 'error';
  checkedAt: number | null;
  rowCount: number | null;
  startDate: string | null;
  endDate: string | null;
  source: string | null;
  apiVersion: string | null;
  latestDate: string | null;
  metrics: ProviderProbeMetric[];
  error: string | null;
};

type ProviderProbePayload = {
  success?: boolean;
  data?: unknown[];
  dateRange?: {
    start?: string;
    end?: string;
  };
  source?: string;
  apiVersion?: string;
  error?: string;
};

type DataHubDatasetDetailProps = {
  isDarkMode: boolean;
  definition: ReportingDatasetRegistryEntry;
  liveDataset: ReportingLiveDatasetSummary | null;
  contextDatasets: ContextDataset[];
  previewTable: string | null;
  operationalViewLabel: string;
  isProductionInactive: boolean;
  onPreviewRows: () => void;
  onOpenOperationalView: () => void;
};

const statusColour = (status: ReportingDatasetStatus) => {
  if (status === 'ready') return colours.green;
  if (status === 'loading') return colours.blue;
  if (status === 'error') return colours.cta;
  return colours.subtleGrey;
};

const statusLabel = (status: ReportingDatasetStatus) => {
  if (status === 'ready') return 'Ready';
  if (status === 'loading') return 'Loading';
  if (status === 'error') return 'Error';
  return 'Idle';
};

const emptyProviderProbe = (): ProviderProbeState => ({
  status: 'idle',
  phase: 'idle',
  checkedAt: null,
  rowCount: null,
  startDate: null,
  endDate: null,
  source: null,
  apiVersion: null,
  latestDate: null,
  metrics: [],
  error: null,
});

const extractProviderRows = (payload: ProviderProbePayload | unknown[]): unknown[] => {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.rows)) return record.rows;
  if (Array.isArray(record.matters)) return record.matters;
  const legacyAll = Array.isArray(record.legacyAll) ? record.legacyAll : [];
  const vnetAll = Array.isArray(record.vnetAll) ? record.vnetAll : [];
  if (legacyAll.length > 0 || vnetAll.length > 0) {
    return [...legacyAll, ...vnetAll];
  }
  return [];
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
};

const toNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumber = (value: number, maximumFractionDigits = 0): string => {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits }).format(value);
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
};

const normaliseDate = (value: unknown): string | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
};

const buildGoogleAdsProbeMetrics = (rows: unknown[]): ProviderProbeMetric[] => {
  if (rows.length === 0) return [];
  const totals = rows.reduce<GoogleAdsProbeTotals>((acc, row) => {
    const record = asRecord(row);
    const metrics = asRecord(record?.googleAds) ?? record;
    if (!metrics) return acc;
    acc.impressions += toNumber(metrics.impressions);
    acc.clicks += toNumber(metrics.clicks);
    acc.cost += toNumber(metrics.cost ?? metrics.costMicros) / (metrics.costMicros && !metrics.cost ? 1000000 : 1);
    acc.conversions += toNumber(metrics.conversions);
    return acc;
  }, { impressions: 0, clicks: 0, cost: 0, conversions: 0 });
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpa = totals.conversions > 0 ? totals.cost / totals.conversions : 0;
  return [
    { label: 'Spend', value: formatCurrency(totals.cost), detail: `${formatNumber(rows.length)} daily rows` },
    { label: 'Clicks', value: formatNumber(totals.clicks), detail: `${formatNumber(ctr, 2)}% CTR` },
    { label: 'Conversions', value: formatNumber(totals.conversions, 1), detail: 'Google Ads conversion count' },
    { label: 'Cost per conversion', value: formatCurrency(cpa), detail: 'Platform reported conversions' },
  ];
};

const buildGoogleAnalyticsProbeMetrics = (rows: unknown[]): ProviderProbeMetric[] => {
  if (rows.length === 0) return [];
  const totals = rows.reduce<GoogleAnalyticsProbeTotals>((acc, row) => {
    const record = asRecord(row);
    const metrics = asRecord(record?.googleAnalytics) ?? record;
    if (!metrics) return acc;
    acc.sessions += toNumber(metrics.sessions);
    acc.users += toNumber(metrics.activeUsers ?? metrics.users);
    acc.views += toNumber(metrics.screenPageViews ?? metrics.pageViews);
    acc.keyEvents += toNumber(metrics.conversions ?? metrics.keyEvents);
    return acc;
  }, { sessions: 0, users: 0, views: 0, keyEvents: 0 });
  return [
    { label: 'Sessions', value: formatNumber(totals.sessions), detail: `${formatNumber(rows.length)} daily rows` },
    { label: 'Users', value: formatNumber(totals.users), detail: 'GA4 active users' },
    { label: 'Views', value: formatNumber(totals.views), detail: 'Screen and page views' },
    { label: 'Key events', value: formatNumber(totals.keyEvents), detail: 'GA4 reported key events' },
  ];
};

const buildProviderProbeMetrics = (datasetKey: string, rows: unknown[]): ProviderProbeMetric[] => {
  if (datasetKey === 'googleAds') return buildGoogleAdsProbeMetrics(rows);
  if (datasetKey === 'googleAnalytics') return buildGoogleAnalyticsProbeMetrics(rows);
  return [];
};

const latestDateFromRows = (rows: unknown[]): string | null => {
  const dates = rows
    .map((row) => {
      const record = asRecord(row);
      const metrics = asRecord(record?.googleAds) ?? asRecord(record?.googleAnalytics) ?? record;
      return normaliseDate(
        metrics?.date
        ?? record?.date
        ?? record?.OpenDate
        ?? record?.openDate
        ?? record?.datetime
        ?? record?.mod_stamp,
      );
    })
    .filter((date): date is string => Boolean(date))
    .sort((left, right) => left.localeCompare(right));
  return dates[dates.length - 1] ?? null;
};

const formatUpdatedAt = (updatedAt: number | null | undefined) => {
  if (!updatedAt) return 'Not yet loaded';
  return new Date(updatedAt).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const FieldCard: React.FC<{
  isDarkMode: boolean;
  label: string;
  value: React.ReactNode;
}> = ({ isDarkMode, label, value }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 12px',
    border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
    background: reportingPanelBackground(isDarkMode, 'elevated'),
  }}>
    <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? colours.greyText : colours.subtleGrey, textTransform: 'uppercase', letterSpacing: 0 }}>
      {label}
    </span>
    <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, lineHeight: 1.4 }}>
      {value}
    </span>
  </div>
);

const DataHubDatasetDetail: React.FC<DataHubDatasetDetailProps> = ({
  isDarkMode,
  definition,
  liveDataset,
  contextDatasets,
  previewTable,
  operationalViewLabel,
  isProductionInactive,
  onPreviewRows,
  onOpenOperationalView,
}) => {
  const [providerProbe, setProviderProbe] = React.useState<ProviderProbeState>(() => emptyProviderProbe());
  const provider = definition.provider as ReportingDatasetProviderMeta;
  const status = liveDataset?.status ?? 'idle';
  const routeLabel = provider.sourceRoute ?? 'Internal stream';
  const reportUsage = provider.reportUsage.length > 0 ? provider.reportUsage : ['Not currently mapped to production reports'];
  const canProbeProvider = Boolean(provider.providerCheck);
  const isBuildFocus = Boolean(provider.buildFocus);
  const displayStatus = providerProbe.status !== 'idle' ? providerProbe.status : status;
  const rowCount = providerProbe.rowCount != null
    ? providerProbe.rowCount.toLocaleString('en-GB')
    : liveDataset?.count != null
      ? liveDataset.count.toLocaleString('en-GB')
      : 'No';
  const displayUpdatedAt = providerProbe.checkedAt ?? liveDataset?.updatedAt;
  const tone = isBuildFocus ? (isDarkMode ? colours.accent : colours.highlight) : isProductionInactive ? colours.subtleGrey : statusColour(displayStatus);

  const runProviderProbe = React.useCallback(async () => {
    const check = provider.providerCheck;
    if (!check) return;
    setProviderProbe({
      ...emptyProviderProbe(),
      status: 'loading',
      phase: 'preparing',
      checkedAt: Date.now(),
    });
    try {
      await Promise.resolve();
      setProviderProbe((prev) => ({ ...prev, phase: 'fetching' }));

      const params = new URLSearchParams({ daysBack: String(check.defaultDaysBack) });
      const response = await fetch(`${check.route}?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      });
      const payloadRaw = await response.json() as ProviderProbePayload | unknown[];
      const payload = Array.isArray(payloadRaw) ? { data: payloadRaw } as ProviderProbePayload : payloadRaw as ProviderProbePayload;
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || `${definition.name} provider check failed (${response.status})`);
      }

      setProviderProbe((prev) => ({ ...prev, phase: 'processing' }));
      const rows = extractProviderRows(payloadRaw);
      setProviderProbe({
        status: 'ready',
        phase: 'complete',
        checkedAt: Date.now(),
        rowCount: rows.length,
        startDate: payload.dateRange?.start ?? null,
        endDate: payload.dateRange?.end ?? null,
        source: payload.source ?? provider.sourceLabel,
        apiVersion: payload.apiVersion ?? null,
        latestDate: latestDateFromRows(rows),
        metrics: buildProviderProbeMetrics(definition.key, rows),
        error: null,
      });
    } catch (error) {
      setProviderProbe({
        ...emptyProviderProbe(),
        status: 'error',
        phase: 'error',
        checkedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Provider check failed',
      });
    }
  }, [definition.key, definition.name, provider.providerCheck, provider.sourceLabel]);

  React.useEffect(() => {
    setProviderProbe(emptyProviderProbe());
    if (canProbeProvider) {
      void runProviderProbe();
    }
  }, [canProbeProvider, definition.key, runProviderProbe]);

  return (
    <section
      data-helix-region={`reports/data-hub/dataset/${definition.key}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '18px 18px 16px',
        border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
        borderLeft: `3px solid ${tone}`,
        background: reportingPanelBackground(isDarkMode, 'base'),
        boxShadow: reportingPanelShadow(isDarkMode),
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 760 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: isDarkMode ? colours.accent : colours.highlight, textTransform: 'uppercase', letterSpacing: 0 }}>
              {definition.provider.category.replace(/-/g, ' ')}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              {definition.name}
            </span>
            <span style={{ fontSize: 12, lineHeight: 1.55, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
              {definition.provider.purpose}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: tone, textTransform: 'uppercase', letterSpacing: 0 }}>
              {isBuildFocus ? 'Active focus' : isProductionInactive ? 'Not in production' : statusLabel(displayStatus)}
            </span>
            <span style={{ fontSize: 28, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              {rowCount}
            </span>
            <span style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
              rows
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          <FieldCard isDarkMode={isDarkMode} label="Provider" value={definition.provider.providerLabel} />
          <FieldCard isDarkMode={isDarkMode} label="Source" value={provider.sourceLabel} />
          <FieldCard isDarkMode={isDarkMode} label="Refresh" value={provider.refreshMode.replace(/-/g, ' ')} />
          <FieldCard isDarkMode={isDarkMode} label="Last checked" value={formatUpdatedAt(displayUpdatedAt)} />
        </div>
      </div>

      {canProbeProvider && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '14px 15px',
          border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
          background: reportingPanelBackground(isDarkMode, 'base'),
          boxShadow: reportingPanelShadow(isDarkMode),
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                Provider check
              </span>
              <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                {providerProbe.status === 'ready'
                  ? `${providerProbe.source ?? provider.sourceLabel}${providerProbe.apiVersion ? ` on ${providerProbe.apiVersion}` : ''}`
                  : provider.providerCheck?.label ?? 'Test provider'}
              </span>
            </div>
            <DefaultButton
              text={providerProbe.status === 'loading' ? 'Checking' : provider.providerCheck?.label ?? 'Test provider'}
              onClick={() => { void runProviderProbe(); }}
              disabled={providerProbe.status === 'loading'}
              iconProps={{ iconName: providerProbe.status === 'ready' ? 'CompletedSolid' : 'Refresh' }}
              styles={{
                root: {
                  borderRadius: 0,
                  height: 30,
                  padding: '0 10px',
                  fontWeight: 700,
                  fontSize: 10,
                  border: `1px solid ${reportingPanelBorder(isDarkMode, 'strong')}`,
                  background: isDarkMode ? colours.dark.cardHover : colours.light.cardBackground,
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
            />
          </div>
          {providerProbe.status === 'loading' && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ height: 6, border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`, background: reportingPanelBackground(isDarkMode, 'elevated') }}>
                <div
                  style={{
                    height: '100%',
                    width: providerProbe.phase === 'preparing' ? '24%' : providerProbe.phase === 'fetching' ? '62%' : '88%',
                    background: isDarkMode ? colours.accent : colours.highlight,
                    transition: 'width 180ms ease',
                  }}
                />
              </div>
              <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                {providerProbe.phase === 'preparing'
                  ? 'Preparing matters check...'
                  : providerProbe.phase === 'fetching'
                    ? 'Pulling matters feed rows...'
                    : 'Processing results...'}
              </span>
            </div>
          )}
          {providerProbe.error && (
            <span style={{ fontSize: 11, color: colours.cta }}>{providerProbe.error}</span>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <FieldCard isDarkMode={isDarkMode} label="Status" value={statusLabel(providerProbe.status)} />
            <FieldCard isDarkMode={isDarkMode} label="API version" value={providerProbe.apiVersion ?? 'Not reported'} />
            <FieldCard isDarkMode={isDarkMode} label="Rows" value={providerProbe.rowCount == null ? 'Not checked' : providerProbe.rowCount.toLocaleString('en-GB')} />
            <FieldCard isDarkMode={isDarkMode} label="Latest day" value={providerProbe.latestDate ?? 'Not checked'} />
          </div>
          {providerProbe.metrics.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              {providerProbe.metrics.map((metric) => (
                <FieldCard
                  key={metric.label}
                  isDarkMode={isDarkMode}
                  label={metric.label}
                  value={metric.detail ? `${metric.value} (${metric.detail})` : metric.value}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '14px 15px',
            border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
            background: reportingPanelBackground(isDarkMode, 'base'),
            boxShadow: reportingPanelShadow(isDarkMode),
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              Dataset criteria
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 11, lineHeight: 1.5, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
              <span>Route: {routeLabel}</span>
              <span>{provider.freshnessExpectation}</span>
              <span>Cached: {liveDataset?.cached ? 'Yes' : 'No'}</span>
            </div>
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '14px 15px',
            border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
            background: reportingPanelBackground(isDarkMode, 'base'),
            boxShadow: reportingPanelShadow(isDarkMode),
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              Used by reports
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {reportUsage.map((label) => (
                <span key={label} style={{
                  padding: '4px 7px',
                  border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
                  background: reportingPanelBackground(isDarkMode, 'elevated'),
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  fontSize: 10,
                  fontWeight: 700,
                }}>
                  {label}
                </span>
              ))}
            </div>
            {contextDatasets.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: isDarkMode ? colours.greyText : colours.subtleGrey, textTransform: 'uppercase', letterSpacing: 0 }}>
                  Context datasets
                </span>
                {contextDatasets.map((dataset) => (
                  <span key={dataset.key} style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                    {dataset.name}: {statusLabel(dataset.status)} ({dataset.count == null ? 'No' : dataset.count.toLocaleString('en-GB')} rows)
                  </span>
                ))}
              </div>
            )}
          </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {previewTable && (
          <PrimaryButton
            text="Preview rows"
            onClick={onPreviewRows}
            styles={{
              root: {
                borderRadius: 0,
                height: 30,
                background: isDarkMode ? colours.accent : colours.highlight,
                border: 'none',
                color: colours.light.sectionBackground,
                fontSize: 10,
                fontWeight: 700,
              },
            }}
          />
        )}
        <DefaultButton
          text={`Open ${operationalViewLabel}`}
          onClick={onOpenOperationalView}
          styles={{
            root: {
              borderRadius: 0,
              height: 30,
              padding: '0 10px',
              fontWeight: 700,
              fontSize: 10,
              border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.35)' : 'rgba(54,144,206,0.25)'}`,
              background: 'transparent',
              color: isDarkMode ? colours.accent : colours.highlight,
            },
          }}
        />
      </div>
    </section>
  );
};

export default DataHubDatasetDetail;