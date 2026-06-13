import React from 'react';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { colours } from '../../../app/styles/colours';
import {
  reportingPanelBackground,
  reportingPanelBorder,
  reportingPanelShadow,
} from '../styles/reportingFoundation';
import {
  REPORTING_DATASET_DEFINITIONS,
  type ReportingDatasetCategory,
  type ReportingDatasetKey,
  type ReportingDatasetRegistryEntry,
  type ReportingDatasetStatus,
  type ReportingLiveDatasetSummary,
} from '../reportingDatasets';

type DataHubDatasetPickerProps = {
  isDarkMode: boolean;
  datasets: ReportingLiveDatasetSummary[];
  getTargetLabel: (key: ReportingDatasetKey) => string;
  onSelectDataset: (key: ReportingDatasetKey) => void;
};

const CATEGORY_ORDER: ReportingDatasetCategory[] = [
  'external-analytics',
  'reconciled-ledger',
  'operational-cache',
  'reference-data',
  'communications-feed',
];

const CATEGORY_LABELS: Record<ReportingDatasetCategory, string> = {
  'external-analytics': 'Marketing telemetry',
  'reconciled-ledger': 'Reconciled ledgers',
  'operational-cache': 'Operational datasets',
  'reference-data': 'Reference data',
  'communications-feed': 'Communications feeds',
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

const allDatasetDefinitions: readonly ReportingDatasetRegistryEntry[] = REPORTING_DATASET_DEFINITIONS;


const groupDatasets = (): Array<{ category: ReportingDatasetCategory; entries: ReportingDatasetRegistryEntry[] }> => {
  return CATEGORY_ORDER.map((category) => ({
    category,
    entries: allDatasetDefinitions.filter((definition) => definition.provider.category === category),
  })).filter((group) => group.entries.length > 0);
};

const DataHubDatasetPicker: React.FC<DataHubDatasetPickerProps> = ({
  isDarkMode,
  datasets,
  getTargetLabel,
  onSelectDataset,
}) => {
  const liveByKey = React.useMemo(() => {
    const map = new Map<string, ReportingLiveDatasetSummary>();
    datasets.forEach((dataset) => map.set(dataset.definition.key, dataset));
    return map;
  }, [datasets]);
  const visibleDefinitions = React.useMemo(() => {
    const allowed = new Set(datasets.map((dataset) => dataset.definition.key));
    return allDatasetDefinitions.filter((definition) => allowed.has(definition.key));
  }, [datasets]);
  const focusDatasets = React.useMemo(() => visibleDefinitions.filter((definition) => definition.provider.buildFocus), [visibleDefinitions]);
  const groupedDatasets = React.useMemo(() => groupDatasets()
    .map((group) => ({
      ...group,
      entries: group.entries.filter((definition) => !definition.provider.buildFocus && visibleDefinitions.some((entry) => entry.key === definition.key)),
    }))
    .filter((group) => group.entries.length > 0), [visibleDefinitions]);

  const renderDatasetCard = (definition: ReportingDatasetRegistryEntry) => {
    const liveDataset = liveByKey.get(definition.key) ?? null;
    const status = liveDataset?.status ?? 'idle';
    const isProductionInactive = Boolean(definition.provider.devPreviewOnly) || definition.provider.reportUsage.length === 0;
    const isBuildFocus = Boolean(definition.provider.buildFocus);
    const isDimmed = isProductionInactive && !isBuildFocus;
    const tone = isBuildFocus ? (isDarkMode ? colours.accent : colours.highlight) : isProductionInactive ? colours.subtleGrey : statusColour(status);
    const statusText = isBuildFocus ? 'Active focus' : isProductionInactive ? 'Parked' : statusLabel(status);

    return (
      <button
        key={definition.key}
        type="button"
        onClick={() => onSelectDataset(definition.key as ReportingDatasetKey)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 10,
          padding: '14px 15px',
          textAlign: 'left',
          border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
          borderLeft: `3px solid ${tone}`,
          borderRadius: 0,
          background: reportingPanelBackground(isDarkMode, 'base'),
          boxShadow: isDimmed ? 'none' : reportingPanelShadow(isDarkMode),
          color: isDarkMode ? colours.dark.text : colours.light.text,
          cursor: 'pointer',
          opacity: isDimmed ? 0.52 : 1,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: tone, flex: '0 0 auto' }} />
            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {definition.name}
            </span>
          </span>
          <FontIcon iconName="ChevronRight" style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.subtleGrey, flex: '0 0 auto' }} />
        </span>
        {/* middle section intentionally left empty per request */}
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minHeight: 18 }} />
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 10 }}>
          <span style={{ color: tone, fontWeight: 700 }}>{statusText}</span>
          <span style={{ color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
            {liveDataset?.count != null ? liveDataset.count.toLocaleString('en-GB') : 'No'} rows
          </span>
        </span>
      </button>
    );
  };

  return (
    <section
      data-helix-region="reports/data-hub/dataset-picker"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 0 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {focusDatasets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 3, height: 14, background: isDarkMode ? colours.accent : colours.highlight }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, textTransform: 'uppercase', letterSpacing: 0 }}>
                Active build focus
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 10,
            }}>
              {focusDatasets.map(renderDatasetCard)}
            </div>
          </div>
        )}

        {groupedDatasets.map((group) => (
          <div key={group.category} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 3, height: 14, background: isDarkMode ? colours.accent : colours.highlight }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, textTransform: 'uppercase', letterSpacing: 0 }}>
                {CATEGORY_LABELS[group.category]}
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 10,
            }}>
              {group.entries.map(renderDatasetCard)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default DataHubDatasetPicker;