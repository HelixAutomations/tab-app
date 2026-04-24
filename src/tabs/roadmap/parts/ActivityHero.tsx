// src/tabs/roadmap/parts/ActivityHero.tsx — dashboard hero: title, lens chips, KPI tiles

import React from 'react';
import { colours } from '../../../app/styles/colours';
import KpiTile from './KpiTile';

export type ActivityLens = 'all' | 'forms' | 'matters' | 'sync' | 'errors' | 'trace' | 'briefs';

export type KpiGroup = 'health' | 'workload' | 'performance';

export interface KpiSpec {
  key: string;
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
  lens?: ActivityLens;
  group?: KpiGroup;
}

export interface LensSpec {
  key: ActivityLens;
  label: string;
  count?: number;
  tone?: 'neutral' | 'warning' | 'success' | 'danger';
}

interface ActivityHeroProps {
  isDarkMode: boolean;
  title: string;
  connected: boolean | null;
  showLiveDot: boolean;
  lastSyncAt: number | null;
  kpis: KpiSpec[];
  lenses: LensSpec[];
  activeLens: ActivityLens;
  onLensChange: (next: ActivityLens) => void;
  subtitle?: string;
}

function formatSync(ts: number | null): string {
  if (!ts) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const LensChip: React.FC<{
  spec: LensSpec;
  active: boolean;
  isDarkMode: boolean;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}> = ({ spec, active, isDarkMode, onClick, buttonRef }) => {
  const [hovered, setHovered] = React.useState(false);
  const reduceMotion = React.useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const accent = spec.tone === 'warning'
    ? colours.orange
    : spec.tone === 'danger'
      ? colours.cta
      : spec.tone === 'success'
        ? colours.green
        : (isDarkMode ? colours.accent : colours.highlight);
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const borderCol = active
    ? accent
    : hovered
      ? (isDarkMode ? colours.subtleGrey : colours.greyText)
      : (isDarkMode ? colours.dark.border : colours.light.border);
  const bg = active
    ? `${accent}1F`
    : hovered
      ? (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)')
      : 'transparent';

  return (
    <button
      ref={buttonRef}
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: bg,
        border: `1px solid ${borderCol}`,
        borderRadius: 0,
        color: active ? accent : (isDarkMode ? colours.dark.text : colours.light.text),
        fontSize: 12,
        fontWeight: active ? 700 : 600,
        letterSpacing: '0.2px',
        cursor: 'pointer',
        transition: reduceMotion ? 'none' : 'all 0.12s',
        fontFamily: 'Raleway, sans-serif',
      }}
    >
      {spec.label}
      {typeof spec.count === 'number' && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            padding: '1px 6px',
            background: active ? accent : (isDarkMode ? 'rgba(255,255,255,0.06)' : colours.grey),
            color: active ? '#fff' : muted,
            fontFamily: 'monospace',
          }}
        >
          {spec.count}
        </span>
      )}
    </button>
  );
};

const ActivityHero: React.FC<ActivityHeroProps> = ({
  isDarkMode,
  title,
  connected,
  showLiveDot,
  lastSyncAt,
  kpis,
  lenses,
  activeLens,
  onLensChange,
  subtitle,
}) => {
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;
  const dotColour = connected === false ? colours.cta : connected === true ? colours.green : colours.subtleGrey;
  const syncLabel = formatSync(lastSyncAt);

  return (
    <div
      style={{
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: `1px solid ${borderCol}`,
      }}
    >
      {/* Title row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 700,
              color: textColour,
              letterSpacing: '-0.3px',
              fontFamily: 'Raleway, sans-serif',
            }}
          >
            {title}
          </h1>
          {showLiveDot && (
            <div
              title={connected ? 'Live monitor connected' : 'Live monitor offline'}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: dotColour,
                flexShrink: 0,
              }}
            />
          )}
          {syncLabel && (
            <span style={{ fontSize: 11, color: muted, fontFamily: 'Raleway, sans-serif' }}>
              · synced {syncLabel}
            </span>
          )}
        </div>
      </div>

      {/* Subtitle (non-dev users) */}
      {subtitle && (
        <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>{subtitle}</div>
      )}

      {/* Grouped KPI tile grid */}
      {kpis.length > 0 && (() => {
        const grouped: Record<KpiGroup, KpiSpec[]> = { health: [], workload: [], performance: [] };
        const ungrouped: KpiSpec[] = [];
        kpis.forEach((kpi) => {
          if (kpi.group) grouped[kpi.group].push(kpi);
          else ungrouped.push(kpi);
        });
        const groupOrder: { key: KpiGroup; label: string }[] = [
          { key: 'health', label: 'Health' },
          { key: 'workload', label: 'Workload' },
          { key: 'performance', label: 'Performance' },
        ];
        const visibleGroups = groupOrder.filter((g) => grouped[g.key].length > 0);
        const hasGroups = visibleGroups.length > 0;

        if (!hasGroups) {
          return (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 8,
              }}
            >
              {kpis.map((kpi) => (
                <KpiTile
                  key={kpi.key}
                  label={kpi.label}
                  value={kpi.value}
                  hint={kpi.hint}
                  accent={kpi.accent}
                  isDarkMode={isDarkMode}
                  active={kpi.lens ? activeLens === kpi.lens : false}
                  onClick={kpi.lens ? () => onLensChange(kpi.lens as ActivityLens) : undefined}
                />
              ))}
            </div>
          );
        }

        return (
          <div
            className="activity-hero-kpi-clusters"
            style={{
              display: 'grid',
              // Weight each cluster by the number of KPIs it contains so every
              // tile ends up the same width (Health has 3 tiles, Workload 1-2,
              // Performance 1 — equal-weight columns would make Health tiles
              // visibly smaller than Workload/Performance ones).
              gridTemplateColumns: visibleGroups.map((g) => `${grouped[g.key].length}fr`).join(' '),
              gap: 12,
            }}
          >
            {visibleGroups.map((g) => (
              <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    color: muted,
                    paddingLeft: 2,
                  }}
                >
                  {g.label}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${grouped[g.key].length}, minmax(0, 1fr))`,
                    gap: 6,
                  }}
                >
                  {grouped[g.key].map((kpi) => (
                    <KpiTile
                      key={kpi.key}
                      label={kpi.label}
                      value={kpi.value}
                      hint={kpi.hint}
                      accent={kpi.accent}
                      isDarkMode={isDarkMode}
                      active={kpi.lens ? activeLens === kpi.lens : false}
                      onClick={kpi.lens ? () => onLensChange(kpi.lens as ActivityLens) : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
            {ungrouped.length > 0 && (
              <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`, gap: 6 }}>
                {ungrouped.map((kpi) => (
                  <KpiTile
                    key={kpi.key}
                    label={kpi.label}
                    value={kpi.value}
                    hint={kpi.hint}
                    accent={kpi.accent}
                    isDarkMode={isDarkMode}
                    active={kpi.lens ? activeLens === kpi.lens : false}
                    onClick={kpi.lens ? () => onLensChange(kpi.lens as ActivityLens) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Lens chip control row */}
      {lenses.length > 0 && (
        <LensTabs
          lenses={lenses}
          activeLens={activeLens}
          onLensChange={onLensChange}
          isDarkMode={isDarkMode}
          marginTop={kpis.length > 0 ? 14 : 0}
        />
      )}
    </div>
  );
};

const LensTabs: React.FC<{
  lenses: LensSpec[];
  activeLens: ActivityLens;
  onLensChange: (next: ActivityLens) => void;
  isDarkMode: boolean;
  marginTop: number;
}> = ({ lenses, activeLens, onLensChange, isDarkMode, marginTop }) => {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const focusIndex = (i: number) => {
    const next = ((i % lenses.length) + lenses.length) % lenses.length;
    refs.current[next]?.focus();
    onLensChange(lenses[next].key);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const current = lenses.findIndex((l) => l.key === activeLens);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusIndex(current + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusIndex(current - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusIndex(lenses.length - 1);
    }
  };
  return (
    <div
      role="tablist"
      aria-label="Activity lens"
      onKeyDown={onKeyDown}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop }}
    >
      {lenses.map((lens, i) => (
        <LensChip
          key={lens.key}
          spec={lens}
          active={activeLens === lens.key}
          isDarkMode={isDarkMode}
          onClick={() => onLensChange(lens.key)}
          buttonRef={(el) => { refs.current[i] = el; }}
        />
      ))}
    </div>
  );
};

export default ActivityHero;
