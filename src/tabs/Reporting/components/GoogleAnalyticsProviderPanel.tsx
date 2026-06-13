import React from 'react';
import type { CSSProperties } from 'react';
import { colours } from '../../../app/styles/colours';
import {
  reportingPanelBackground,
  reportingPanelBorder,
  reportingPanelShadow,
} from '../styles/reportingFoundation';
import {
  REPORTING_DATASET_BY_KEY,
  type Ga4ProviderCheckState,
  type ReportingDatasetKey,
  type ReportingDatasetRegistryEntry,
  type ReportingDatasetStatus,
  type ReportingLiveDatasetSummary,
} from '../reportingDatasets';

type GoogleAnalyticsProviderPanelProps = {
  isDarkMode: boolean;
  googleAnalytics: ReportingLiveDatasetSummary | null;
  ga4ProviderCheck: Ga4ProviderCheckState;
  onRunProviderCheck: () => void;
  getDataset: (key: string) => ReportingLiveDatasetSummary | null;
};

const statusDotStyle = (status: ReportingDatasetStatus): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: 999,
  background:
    status === 'ready'
      ? colours.green
      : status === 'loading'
        ? colours.blue
        : status === 'error'
          ? colours.cta
          : colours.subtleGrey,
});

const getRegistryDataset = (key: string): ReportingDatasetRegistryEntry | null => {
  return REPORTING_DATASET_BY_KEY[key as ReportingDatasetKey] ?? null;
};

const GoogleAnalyticsProviderPanel: React.FC<GoogleAnalyticsProviderPanelProps> = ({
  isDarkMode,
  googleAnalytics,
  ga4ProviderCheck,
  onRunProviderCheck,
  getDataset,
}) => {
  const googleAnalyticsDefinition = REPORTING_DATASET_BY_KEY.googleAnalytics;
  const relatedDatasets = googleAnalyticsDefinition.provider.contextDatasets ?? [];
  const checkedLabel = ga4ProviderCheck.checkedAt
    ? new Date(ga4ProviderCheck.checkedAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not checked this session';
  const providerTone = ga4ProviderCheck.status === 'error'
    ? colours.cta
    : ga4ProviderCheck.status === 'loading'
      ? colours.blue
      : ga4ProviderCheck.status === 'ready'
        ? colours.green
        : (isDarkMode ? colours.greyText : colours.subtleGrey);
  const providerStatus = ga4ProviderCheck.status === 'ready'
    ? 'Available'
    : ga4ProviderCheck.status === 'loading'
      ? 'Checking'
      : ga4ProviderCheck.status === 'error'
        ? 'Provider error'
        : 'Unchecked';

  return (
    <div
      data-helix-region="reports/data-hub/provider/google-analytics"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 12,
        alignItems: 'stretch',
      }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '18px 18px 16px',
        background: reportingPanelBackground(isDarkMode, 'base'),
        border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
        borderRadius: 0,
        boxShadow: reportingPanelShadow(isDarkMode),
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: isDarkMode ? colours.accent : colours.highlight,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              SEO dataset provider
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
              {googleAnalyticsDefinition.name}
            </span>
            <span style={{ fontSize: 11, lineHeight: 1.5, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
              {googleAnalyticsDefinition.provider.purpose}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: providerTone, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {providerStatus}
            </span>
            <button
              onClick={onRunProviderCheck}
              disabled={ga4ProviderCheck.status === 'loading'}
              style={{
                border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.35)' : 'rgba(54,144,206,0.25)'}`,
                background: ga4ProviderCheck.status === 'loading'
                  ? (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.08)')
                  : 'transparent',
                color: isDarkMode ? colours.accent : colours.highlight,
                padding: '6px 10px',
                fontSize: 10,
                fontWeight: 700,
                cursor: ga4ProviderCheck.status === 'loading' ? 'default' : 'pointer',
                opacity: ga4ProviderCheck.status === 'loading' ? 0.72 : 1,
              }}
            >
              {ga4ProviderCheck.status === 'loading'
                ? 'Checking...'
                : googleAnalyticsDefinition.provider.providerCheck?.label ?? 'Check provider'}
            </button>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 8,
        }}>
          {[
            ['Provider', googleAnalyticsDefinition.provider.sourceLabel],
            ['Feeds report', googleAnalyticsDefinition.provider.reportUsage.join(', ') || 'No report mapped'],
            ['Current rows', googleAnalytics?.count != null ? googleAnalytics.count.toLocaleString('en-GB') : 'Not loaded'],
            ['Status in stream', googleAnalytics?.status ?? 'idle'],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: '9px 10px',
                background: reportingPanelBackground(isDarkMode, 'elevated'),
                border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? colours.greyText : colours.subtleGrey, textTransform: 'uppercase' }}>
                {label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 10, lineHeight: 1.55, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
          {googleAnalyticsDefinition.provider.freshnessExpectation}
        </div>

        {relatedDatasets.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? colours.greyText : colours.subtleGrey, textTransform: 'uppercase' }}>
              Context datasets
            </span>
            {relatedDatasets.map((datasetKey) => {
              const registryDataset = getRegistryDataset(datasetKey);
              const liveDataset = getDataset(datasetKey);
              return (
                <span
                  key={datasetKey}
                  style={{
                    border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
                    background: reportingPanelBackground(isDarkMode, 'elevated'),
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    padding: '3px 7px',
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                >
                  {registryDataset?.name ?? datasetKey}: {liveDataset?.status ?? 'idle'}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '18px 18px 16px',
        background: reportingPanelBackground(isDarkMode, 'base'),
        border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
        borderRadius: 0,
        boxShadow: reportingPanelShadow(isDarkMode),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
            Provider check
          </span>
          <span style={statusDotStyle(ga4ProviderCheck.status)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            ['Rows', ga4ProviderCheck.rowCount != null ? ga4ProviderCheck.rowCount.toLocaleString('en-GB') : '-'],
            ['Window', ga4ProviderCheck.startDate && ga4ProviderCheck.endDate ? `${ga4ProviderCheck.startDate} to ${ga4ProviderCheck.endDate}` : '-'],
            ['Source', ga4ProviderCheck.source ?? googleAnalyticsDefinition.provider.sourceLabel],
            ['Checked', checkedLabel],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? colours.greyText : colours.subtleGrey, textTransform: 'uppercase' }}>
                {label}
              </span>
              <span style={{ fontSize: 10, color: isDarkMode ? colours.dark.text : colours.light.text, lineHeight: 1.4 }}>
                {value}
              </span>
            </div>
          ))}
        </div>
        {ga4ProviderCheck.error ? (
          <div style={{
            padding: '8px 10px',
            fontSize: 10,
            lineHeight: 1.45,
            color: colours.cta,
            background: isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.05)',
            border: `1px solid ${isDarkMode ? 'rgba(214,85,65,0.18)' : 'rgba(214,85,65,0.12)'}`,
          }}>
            {ga4ProviderCheck.error}
          </div>
        ) : (
          <div style={{ fontSize: 10, lineHeight: 1.45, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
            This check confirms aggregate GA4 availability and row shape only. SEO interpretation still happens in the SEO report.
          </div>
        )}
      </div>
    </div>
  );
};

export default GoogleAnalyticsProviderPanel;