import React from 'react';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { colours, withAlpha } from '../../../app/styles/colours';
import {
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

type DataHubNeutralSurfaceLevel = 'base' | 'raised';

const dataHubNeutralSurface = (isDarkMode: boolean, level: DataHubNeutralSurfaceLevel = 'base'): string => {
  if (isDarkMode) {
    return level === 'raised'
      ? colours.dark.cardBackground
      : colours.dark.sectionBackground;
  }
  return level === 'raised'
    ? withAlpha(colours.light.cardBackground, 0.98)
    : withAlpha(colours.grey, 0.98);
};

const dataHubNeutralBorder = (isDarkMode: boolean): string => (
  isDarkMode ? withAlpha(colours.dark.borderColor, 0.38) : withAlpha(colours.greyText, 0.14)
);

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
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? '#d1d5db' : colours.subtleGrey;
  const sectionFill = dataHubNeutralSurface(isDarkMode, 'base');
  const cardFill = dataHubNeutralSurface(isDarkMode, 'raised');
  const cardFillDimmed = isDarkMode ? withAlpha(colours.dark.cardHover, 0.42) : dataHubNeutralSurface(isDarkMode, 'raised');
  const cardEdge = dataHubNeutralBorder(isDarkMode);
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
    const targetLabel = getTargetLabel(definition.key as ReportingDatasetKey);
    const rowLabel = liveDataset?.count != null ? liveDataset.count.toLocaleString('en-GB') : 'No';

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
          minHeight: 132,
          padding: '16px 17px',
          textAlign: 'left',
          borderStyle: 'solid',
          borderWidth: '1px 1px 1px 3px',
          borderColor: `${cardEdge} ${cardEdge} ${cardEdge} ${tone}`,
          borderRadius: 0,
          background: isDimmed ? cardFillDimmed : cardFill,
          boxShadow: isDimmed ? 'none' : reportingPanelShadow(isDarkMode),
          color: text,
          cursor: 'pointer',
          opacity: isDimmed ? 0.52 : 1,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: tone, flex: '0 0 auto', boxShadow: status === 'loading' ? `0 0 0 4px ${withAlpha(tone, 0.12)}` : 'none' }} />
            <span style={{ fontSize: 15, lineHeight: 1.15, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {definition.name}
            </span>
          </span>
          <FontIcon iconName="ChevronRight" style={{ fontSize: 10, color: muted, flex: '0 0 auto' }} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minHeight: 18 }}>
          <span style={{ fontSize: 10, color: muted, fontWeight: 900, textTransform: 'uppercase' }}>
            Opens {targetLabel}
          </span>
          <span style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151', lineHeight: 1.35, fontWeight: 700 }}>
            {definition.provider.purpose}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 10 }}>
          <span style={{ color: tone, fontWeight: 900 }}>{statusText}</span>
          <span style={{ color: muted }}>
            {rowLabel} rows
          </span>
        </span>
      </button>
    );
  };

  return (
    <section
      data-helix-region="reports/data-hub/dataset-picker"
      style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, border: `1px solid ${cardEdge}`, background: sectionFill, boxShadow: reportingPanelShadow(isDarkMode) }}
    >
      <div style={{ display: 'grid', gap: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: muted, textTransform: 'uppercase', letterSpacing: 0 }}>
          Data Hub datasets
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {focusDatasets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 3, height: 14, background: colours.orange }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: 'uppercase', letterSpacing: 0 }}>
                Active build focus
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 12,
            }}>
              {focusDatasets.map(renderDatasetCard)}
            </div>
          </div>
        )}

        {groupedDatasets.map((group) => (
          <div key={group.category} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 3, height: 14, background: muted }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: 'uppercase', letterSpacing: 0 }}>
                {CATEGORY_LABELS[group.category]}
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 12,
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