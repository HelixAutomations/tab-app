import React from 'react';
import { colours, withAlpha } from '../../../app/styles/colours';
import {
  reportingPanelShadow,
} from '../styles/reportingFoundation';
import {
  REPORTING_DATASET_DEFINITIONS,
  type ReportingDatasetKey,
  type ReportingDatasetRegistryEntry,
  type ReportingDatasetStatus,
  type ReportingLiveDatasetSummary,
} from '../reportingDatasets';
import './DataHubDatasetPicker.css';

type DataHubDatasetPickerProps = {
  isDarkMode: boolean;
  datasets: ReportingLiveDatasetSummary[];
  isRefreshing: boolean;
  onRefreshDatasets: (keys: ReportingDatasetKey[]) => void | Promise<unknown>;
  onSelectDataset: (key: ReportingDatasetKey) => void;
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
  return 'Not loaded';
};

const datasetCardLabel = (definition: ReportingDatasetRegistryEntry): string => (
  definition.key === 'emailLists' ? 'Email Lists' : definition.name
);

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

const datasetHasRefreshPath = (definition: ReportingDatasetRegistryEntry): boolean => (
  Boolean(definition.provider.sourceRoute || definition.provider.providerCheck)
);

const DataHubDatasetPicker: React.FC<DataHubDatasetPickerProps> = ({
  isDarkMode,
  datasets,
  isRefreshing,
  onRefreshDatasets,
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

  const defaultRefreshKeys = React.useMemo(() => {
    const freshCutoff = Date.now() - 30 * 60 * 1000;
    return visibleDefinitions
      .filter((definition) => {
        if (!datasetHasRefreshPath(definition)) return false;
        const liveDataset = liveByKey.get(definition.key);
        const status = liveDataset?.status ?? 'idle';
        const hasActivity = status === 'ready' || status === 'loading' || (liveDataset?.count ?? 0) > 0;
        const parked = !hasActivity && !definition.provider.buildFocus && (Boolean(definition.provider.devPreviewOnly) || definition.provider.reportUsage.length === 0);
        return !parked && status !== 'loading' && (!liveDataset?.updatedAt || liveDataset.updatedAt < freshCutoff);
      })
      .map((definition) => definition.key as ReportingDatasetKey);
  }, [liveByKey, visibleDefinitions]);
  const [selectedRefreshKeys, setSelectedRefreshKeys] = React.useState<ReportingDatasetKey[]>(defaultRefreshKeys);

  React.useEffect(() => {
    setSelectedRefreshKeys((current) => {
      const validKeys = new Set(visibleDefinitions.filter(datasetHasRefreshPath).map((definition) => definition.key));
      const retained = current.filter((key) => validKeys.has(key));
      if (retained.length > 0 || datasets.length === 0) return retained;
      return defaultRefreshKeys;
    });
  }, [datasets.length, defaultRefreshKeys, visibleDefinitions]);

  const selectedRefreshKeySet = React.useMemo(() => new Set(selectedRefreshKeys), [selectedRefreshKeys]);
  const toggleRefreshKey = React.useCallback((key: ReportingDatasetKey) => {
    const definition = allDatasetDefinitions.find((entry) => entry.key === key);
    if (!definition || !datasetHasRefreshPath(definition)) return;
    setSelectedRefreshKeys((current) => (
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    ));
  }, []);
  const refreshSelectedDatasets = React.useCallback(() => {
    if (selectedRefreshKeys.length === 0 || isRefreshing) return;
    void Promise.resolve(onRefreshDatasets(selectedRefreshKeys)).finally(() => setSelectedRefreshKeys([]));
  }, [isRefreshing, onRefreshDatasets, selectedRefreshKeys]);

  const renderDatasetCard = (definition: ReportingDatasetRegistryEntry) => {
    const key = definition.key as ReportingDatasetKey;
    const liveDataset = liveByKey.get(definition.key) ?? null;
    const status = liveDataset?.status ?? 'idle';
    const isProductionInactive = Boolean(definition.provider.devPreviewOnly) || definition.provider.reportUsage.length === 0;
    const isBuildFocus = Boolean(definition.provider.buildFocus);
    const isDimmed = isProductionInactive && !isBuildFocus;
    const tone = isBuildFocus ? (isDarkMode ? colours.accent : colours.highlight) : isProductionInactive ? colours.subtleGrey : statusColour(status);
    const canRefreshDataset = datasetHasRefreshPath(definition);
    const countLabel = liveDataset?.count != null && liveDataset.count > 0
      ? `${liveDataset.count.toLocaleString('en-GB')} rows ready`
      : null;
    const statusDetail = status === 'ready' && countLabel
      ? countLabel
      : status === 'loading'
        ? 'Refreshing feed'
        : status === 'error'
          ? 'Needs attention'
          : statusLabel(status);
    const cardDescription = 'Dataset controls and status.';
    const selectedForRefresh = selectedRefreshKeySet.has(key);
    const refreshDisabled = !canRefreshDataset || isRefreshing || status === 'loading';
    const refreshLabel = !canRefreshDataset ? 'Open only' : selectedForRefresh ? 'Queued' : 'Queue';
    const refreshStatusLabel = status === 'loading'
      ? 'Syncing now'
      : !canRefreshDataset
        ? 'Open only'
        : selectedForRefresh
          ? 'Queued for sync'
          : 'Ready when needed';
    const footerIsActive = selectedForRefresh || status === 'loading';
    const footerTone = selectedForRefresh ? colours.green : tone;
    const cardTitle = datasetCardLabel(definition);
    const openCueReady = status === 'ready' || (liveDataset?.count ?? 0) > 0;

    return (
      <article
        key={definition.key}
        style={{
          display: 'grid',
          gridTemplateRows: '1fr auto',
          alignItems: 'stretch',
          minHeight: 150,
          width: '100%',
          padding: 0,
          textAlign: 'left',
          borderStyle: 'solid',
          borderWidth: 1,
          borderColor: cardEdge,
          borderRadius: 0,
          background: isDimmed ? cardFillDimmed : cardFill,
          boxShadow: isDimmed ? 'none' : reportingPanelShadow(isDarkMode),
          color: text,
          opacity: isDimmed ? 0.52 : 1,
          overflow: 'hidden',
        }}
      >
        <span style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, padding: '18px 20px 17px' }}>
          <span style={{ fontSize: 18, lineHeight: 1.16, fontWeight: 900, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {cardTitle}
          </span>
          <span style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151', lineHeight: 1.48, fontWeight: 600 }}>
            {cardDescription}
          </span>
        </span>
        <span style={{ display: 'block', width: '100%', padding: '11px 14px 12px 18px', background: isDarkMode ? colours.websiteBlue : colours.grey, borderTop: `1px solid ${footerIsActive ? withAlpha(footerTone, 0.38) : cardEdge}`, boxShadow: footerIsActive && isDarkMode ? `inset 2px 0 0 ${footerTone}` : undefined, transition: 'border-top-color 180ms ease, box-shadow 180ms ease' }}>
          <span style={{ display: 'grid', alignItems: 'center', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, minWidth: 0, width: '100%' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 auto' }}>
              <span aria-hidden="true" style={{ width: 2, height: 24, flex: '0 0 auto', background: footerTone, opacity: footerIsActive ? 0.9 : 0.48 }} />
              <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                <span style={{ color: footerIsActive ? footerTone : text, fontSize: 12, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {refreshStatusLabel}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: status === 'idle' ? muted : text, fontSize: 10, fontWeight: 800, minWidth: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: tone, flex: '0 0 auto', boxShadow: status === 'loading' ? `0 0 0 4px ${withAlpha(tone, 0.12)}` : 'none' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusDetail}</span>
                </span>
              </span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto', minHeight: 28 }}>
              <button
                type="button"
                role="switch"
                aria-checked={selectedForRefresh}
                aria-label={`${cardTitle} refresh selection`}
                onClick={() => toggleRefreshKey(key)}
                disabled={refreshDisabled}
                title={refreshLabel}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${selectedForRefresh ? withAlpha(colours.green, 0.38) : cardEdge}`, background: selectedForRefresh ? withAlpha(colours.green, isDarkMode ? 0.10 : 0.055) : 'transparent', color: selectedForRefresh ? colours.green : muted, padding: '0 8px', minHeight: 26, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', cursor: refreshDisabled ? 'default' : 'pointer', opacity: refreshDisabled && canRefreshDataset ? 0.58 : 1 }}
              >
                <span aria-hidden="true" style={{ width: 6, height: 6, background: selectedForRefresh ? colours.green : withAlpha(muted, 0.42), flex: '0 0 auto' }} />
                {refreshLabel}
              </button>
              <button
                type="button"
                onClick={() => onSelectDataset(key)}
                className="data-hub-dataset-open-cue"
                style={{ ['--data-hub-dataset-open-tone' as string]: footerTone, border: `1px solid ${openCueReady ? withAlpha(footerTone, 0.34) : cardEdge}`, background: openCueReady ? withAlpha(footerTone, isDarkMode ? 0.10 : 0.055) : 'transparent', color: openCueReady ? footerTone : text, padding: '0 9px', minHeight: 26, fontSize: 9, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' }}
              >
                <span>Open</span>
              </button>
            </span>
          </span>
        </span>
      </article>
    );
  };

  return (
    <section
      data-helix-region="reports/data-hub/dataset-picker"
      style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, border: `1px solid ${cardEdge}`, background: sectionFill, boxShadow: reportingPanelShadow(isDarkMode) }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: muted, textTransform: 'uppercase', letterSpacing: 0 }}>
            Helix data sources
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: muted }}>
            {selectedRefreshKeys.length.toLocaleString('en-GB')} queued
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSelectedRefreshKeys(defaultRefreshKeys)}
            disabled={isRefreshing}
            style={{ border: `1px solid ${cardEdge}`, background: cardFill, color: muted, padding: '7px 9px', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', cursor: isRefreshing ? 'default' : 'pointer' }}
          >
            Queue due
          </button>
          <button
            type="button"
            onClick={() => setSelectedRefreshKeys([])}
            disabled={isRefreshing}
            style={{ border: `1px solid ${cardEdge}`, background: cardFill, color: muted, padding: '7px 9px', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', cursor: isRefreshing ? 'default' : 'pointer' }}
          >
            Clear queue
          </button>
          <button
            type="button"
            onClick={refreshSelectedDatasets}
            disabled={isRefreshing || selectedRefreshKeys.length === 0}
            style={{ border: 'none', background: isRefreshing || selectedRefreshKeys.length === 0 ? withAlpha(colours.green, 0.34) : colours.green, color: colours.light.sectionBackground, padding: '8px 10px', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', cursor: isRefreshing || selectedRefreshKeys.length === 0 ? 'default' : 'pointer' }}
          >
            {isRefreshing ? 'Refreshing' : 'Refresh'}
          </button>
        </span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 12,
      }}>
        {visibleDefinitions.map(renderDatasetCard)}
      </div>
    </section>
  );
};

export default DataHubDatasetPicker;