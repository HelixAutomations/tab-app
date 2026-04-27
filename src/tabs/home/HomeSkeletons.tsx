import React from 'react';
import { colours } from '../../app/styles/colours';
import BillingRailSkeleton from '../../components/modern/BillingRailSkeleton';
import SkeletonSectionLabel from '../../components/modern/SkeletonSectionLabel';

export interface TeamSkeletonSectionProps {
  labelWidth: number;
  toggleWidth: number;
  groupLabelWidth: number[];
  tileCounts: number[];
  tileSize: { width: number; height: number };
  groupedRows?: boolean;
}

interface TeamInsightSectionSkeletonProps extends TeamSkeletonSectionProps {
  isDarkMode: boolean;
  sectionDivider: string;
  skeletonStrong: string;
  skeletonSoft: string;
  skeletonTileBg: string;
  skeletonTileBorder: string;
}

const pulse = (delay = 0) => `homeSkelPulse 1.4s ease-in-out infinite ${delay}s`;

const skeletonBlock = (
  width: number | string,
  height: number,
  background: string,
  delay = 0,
  extraStyle?: React.CSSProperties,
) => (
  <div
    style={{
      width,
      height,
      borderRadius: 0,
      background,
      animation: pulse(delay),
      ...extraStyle,
    }}
  />
);

export const TeamInsightSectionSkeleton: React.FC<TeamInsightSectionSkeletonProps> = ({
  labelWidth,
  toggleWidth,
  groupLabelWidth,
  tileCounts,
  tileSize,
  groupedRows = false,
  isDarkMode,
  sectionDivider,
  skeletonStrong,
  skeletonSoft,
  skeletonTileBg,
  skeletonTileBorder,
}) => (
  <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 11, height: 11, borderRadius: 0, background: isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(54,144,206,0.16)' }} />
        {skeletonBlock(labelWidth, 11, skeletonStrong)}
      </div>
      {skeletonBlock(toggleWidth, 10, skeletonSoft, 0.08)}
    </div>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {tileCounts.map((count, groupIndex) => (
        <React.Fragment key={`${labelWidth}-${groupIndex}`}>
          {groupIndex > 0 ? <div style={{ width: 1, alignSelf: 'stretch', background: sectionDivider, flexShrink: 0 }} /> : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: groupedRows ? 120 : undefined }}>
            {skeletonBlock(groupLabelWidth[groupIndex] || groupLabelWidth[groupLabelWidth.length - 1] || 52, 9, skeletonStrong, groupIndex * 0.05)}
            {groupedRows ? (
              <div style={{ display: 'grid', gap: 6, minWidth: 120 }}>
                {Array.from({ length: count }).map((_, rowIndex) => (
                  <div key={rowIndex} style={{ display: 'grid', gridTemplateColumns: `${tileSize.width}px 1fr`, gap: 8, alignItems: 'center' }}>
                    <div
                      style={{
                        width: tileSize.width,
                        height: tileSize.height,
                        background: skeletonTileBg,
                        border: `1px solid ${skeletonTileBorder}`,
                        animation: pulse(groupIndex * 0.05 + rowIndex * 0.03),
                      }}
                    />
                    {skeletonBlock(rowIndex === 0 ? '78%' : '62%', 10, skeletonStrong, 0.04 + groupIndex * 0.05 + rowIndex * 0.03)}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxWidth: 160 }}>
                {Array.from({ length: count }).map((_, tileIndex) => (
                  <div
                    key={tileIndex}
                    style={{
                      width: tileSize.width,
                      height: tileSize.height,
                      background: skeletonTileBg,
                      border: `1px solid ${skeletonTileBorder}`,
                      animation: pulse(groupIndex * 0.05 + tileIndex * 0.03),
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  </div>
);

/* ── SVG chart skeleton: paired bars (matters) + two line paths (enquiries) ── */
const CHART_W = 240;
const CHART_H = 160;
const CHART_PAD_TOP = 10;
const CHART_PAD_BOT = 22;
const CHART_PAD_LR = 5;
const CHART_BUCKETS = 6;
const CHART_DRAW_W = CHART_W - CHART_PAD_LR * 2;
const CHART_BUCKET_W = CHART_DRAW_W / CHART_BUCKETS;
const CHART_BAR_W = 8;
const CHART_BAR_GAP = 2;
const xAtChart = (i: number) => CHART_PAD_LR + CHART_BUCKET_W * i + CHART_BUCKET_W / 2;
const yAtChart = (pct: number) => CHART_H - CHART_PAD_BOT - pct * (CHART_H - CHART_PAD_TOP - CHART_PAD_BOT);

/* Plausible placeholder data — gives a recognisable shape */
const barCurrent = [0.28, 0.52, 0.38, 0.68, 0.46, 0.74];
const barPrevious = [0.22, 0.36, 0.44, 0.30, 0.56, 0.48];
const lineCurrent = [0.62, 0.48, 0.70, 0.56, 0.82, 0.78];
const linePrevious = [0.50, 0.58, 0.42, 0.64, 0.52, 0.60];

const buildSkelPath = (values: number[]) => {
  if (values.length === 0) return '';
  let d = `M ${xAtChart(0).toFixed(1)} ${yAtChart(values[0]).toFixed(1)}`;
  for (let i = 0; i < values.length - 1; i++) {
    const cx = ((xAtChart(i) + xAtChart(i + 1)) / 2).toFixed(1);
    d += ` C ${cx} ${yAtChart(values[i]).toFixed(1)}, ${cx} ${yAtChart(values[i + 1]).toFixed(1)}, ${xAtChart(i + 1).toFixed(1)} ${yAtChart(values[i + 1]).toFixed(1)}`;
  }
  return d;
};

const ConversionChartSkeleton: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const currentFill = isDarkMode ? 'rgba(54,144,206,0.62)' : 'rgba(54,144,206,0.48)';
  const previousFill = isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(54,144,206,0.14)';
  const currentLineStroke = isDarkMode ? 'rgba(54,144,206,0.98)' : 'rgba(54,144,206,0.96)';
  const previousLineStroke = isDarkMode ? 'rgba(135,190,229,0.74)' : 'rgba(107,161,209,0.9)';
  const gridLine = isDarkMode ? 'rgba(255,255,255,0.045)' : 'rgba(13,47,96,0.05)';
  const axisTextFill = isDarkMode ? 'rgba(244,244,246,0.5)' : 'rgba(6,23,51,0.48)';
  const xAxisY = CHART_H - CHART_PAD_BOT;
  const tickYs = [0, 0.5, 1].map(yAtChart);
  const currentLinePath = buildSkelPath(lineCurrent);
  const previousLinePath = buildSkelPath(linePrevious);
  const axisLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div style={{ width: '100%', flex: 1 }}>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-hidden="true" style={{ display: 'block', width: '100%', height: 'auto' }}>
        {/* Horizontal grid lines */}
        {tickYs.map((y, i) => (
          <line key={i} x1={CHART_PAD_LR} y1={y} x2={CHART_W - CHART_PAD_LR} y2={y} stroke={gridLine} strokeWidth="1" strokeDasharray={i < 2 ? '3 3' : undefined} />
        ))}
        {/* Paired bars per bucket — current + previous matters */}
        {barCurrent.map((cPct, i) => {
          const cx = xAtChart(i);
          const currentX = cx - (CHART_BAR_W + CHART_BAR_GAP / 2);
          const previousX = cx + CHART_BAR_GAP / 2;
          const cY = yAtChart(cPct);
          const pY = yAtChart(barPrevious[i]);
          return (
            <g key={i}>
              <rect x={currentX} y={cY} width={CHART_BAR_W} height={Math.max(0, xAxisY - cY)} fill={currentFill} style={{ animation: `homeSkelPulse 1.4s ease-in-out infinite ${i * 0.05}s` }} />
              <rect x={previousX} y={pY} width={CHART_BAR_W} height={Math.max(0, xAxisY - pY)} fill={previousFill} style={{ animation: `homeSkelPulse 1.4s ease-in-out infinite ${i * 0.05 + 0.02}s` }} />
            </g>
          );
        })}
        {/* Previous enquiries line — dashed */}
        <path d={previousLinePath} fill="none" stroke={previousLineStroke} strokeWidth="1.32" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" />
        {/* Current enquiries line — solid */}
        <path d={currentLinePath} fill="none" stroke={currentLineStroke} strokeWidth="2.08" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dot endpoints on lines */}
        {lineCurrent.map((pct, i) => (
          <circle key={`c-${i}`} cx={xAtChart(i)} cy={yAtChart(pct)} r={i === lineCurrent.length - 1 ? 2.5 : 2.1} fill={currentLineStroke} />
        ))}
        {linePrevious.map((pct, i) => (
          <circle key={`p-${i}`} cx={xAtChart(i)} cy={yAtChart(pct)} r="1.7" fill={previousLineStroke} />
        ))}
        {/* X-axis labels */}
        {axisLabels.map((label, i) => (
          <text key={label} x={xAtChart(i)} y={CHART_H - 4} textAnchor="middle" fontSize="7.5" fill={axisTextFill}>{label}</text>
        ))}
      </svg>
    </div>
  );
};

/* ── Grid templates matching OperationsDashboard.tsx constants ── */
const SKEL_DOT_COL = 28;
const SKEL_DATE_COL = 78;
const SKEL_NAME_MAX = 160;
const SKEL_FE_COL = 62;
const SKEL_SEP_COL = 12;
const SKEL_PIPELINE_COL = 240;
const SKEL_NOTES_SLOT = 22;
const ENQUIRY_STEPS = 3;   // Pitch · Follow Up · Instruction
const MATTER_STEPS = 5;    // Compile · Generate · Test · Review · Upload

const gridMain = `${SKEL_DOT_COL}px ${SKEL_DATE_COL}px minmax(0, ${SKEL_NAME_MAX}px) 1fr`;
const enquiryActionGrid = `${SKEL_NOTES_SLOT}px ${SKEL_FE_COL}px ${SKEL_SEP_COL}px minmax(0, ${SKEL_PIPELINE_COL}px)`;
const matterActionGrid = `${SKEL_FE_COL}px ${SKEL_SEP_COL}px minmax(0, ${SKEL_PIPELINE_COL}px)`;

const HomePipelineSkeletonCard: React.FC<{ isDarkMode: boolean; variant: 'activity' | 'matters' }> = ({ isDarkMode, variant }) => {
  const isActivity = variant === 'activity';
  const accent = isDarkMode ? colours.accent : colours.highlight;
  const rowCount = isActivity ? 6 : 5;
  const stepCount = isActivity ? ENQUIRY_STEPS : MATTER_STEPS;
  const actionGrid = isActivity ? enquiryActionGrid : matterActionGrid;
  const theadBg = isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(13,47,96,0.025)';
  const skelStrong = 'var(--home-skel-fill)';
  const skelSoft = 'var(--home-skel-fill-weak)';
  const skelFaint = 'var(--home-skel-fill-faint)';

  return (
    <div className="home-dashboard-skeleton-pipeline-card" style={{ background: 'var(--home-card-bg)', border: '1px solid var(--home-card-border)', display: 'flex', flexDirection: 'column' }}>
      <SkeletonSectionLabel
        title={isActivity ? 'Pipeline warming up' : 'Matters warming up'}
        description={isActivity
          ? 'Pulling enquiries and unclaimed leads.'
          : 'Pulling draft, generate, and upload progress.'}
        isDarkMode={isDarkMode}
      />
      {/* Tab bar */}
      {isActivity ? (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--home-card-border)' }}>
          {['Enquiries', 'Unclaimed'].map((label, index) => (
            <div
              key={label}
              style={{
                flex: 1,
                padding: '9px 6px 7px',
                textAlign: 'center',
                background: index === 0 ? 'var(--home-tile-bg)' : 'transparent',
                borderBottom: index === 0 ? `2px solid ${accent}` : '2px solid transparent',
              }}
            >
              {skeletonBlock(index === 0 ? 68 : 58, 9, index === 0 ? skelStrong : skelSoft, index * 0.08, { margin: '0 auto' })}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: '7px 12px 5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--home-tile-bg)', borderBottom: `2px solid ${accent}` }}>
          {skeletonBlock(46, 9, skelStrong)}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {skeletonBlock(42, 8, skelSoft)}
            {skeletonBlock(36, 8, skelFaint)}
          </div>
        </div>
      )}

      {/* Column headers — matches real thead structure */}
      <div style={{ display: 'grid', gridTemplateColumns: gridMain, alignItems: 'center', gap: 0, padding: '7px 8px 5px 4px', background: theadBg, borderBottom: '1px solid var(--home-card-border)' }}>
        <span style={{ display: 'flex', justifyContent: 'center' }}>
          {skeletonBlock(10, 8, skelSoft)}
        </span>
        {skeletonBlock(34, 8, skelSoft)}
        {skeletonBlock(isActivity ? 54 : 44, 8, skelSoft)}
        <div style={{ display: 'grid', gridTemplateColumns: actionGrid, alignItems: 'center', justifyContent: 'end', gap: 0, minWidth: 0, width: '100%' }}>
          {isActivity ? <span style={{ width: '100%', display: 'block' }} /> : null}
          {skeletonBlock(26, 8, skelSoft)}
          <span style={{ display: 'flex', justifyContent: 'center' }}>{skeletonBlock(6, 8, skelFaint)}</span>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))`, alignItems: 'center', gap: 6, width: '100%', minWidth: 0 }}>
            {Array.from({ length: stepCount }).map((_, si) => (
              <div key={si} style={{ display: 'flex', justifyContent: 'center' }}>
                {skeletonBlock(isActivity ? 34 : 28, 7, skelSoft)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Data rows */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {Array.from({ length: rowCount }).map((_, index) => (
          <div key={`${variant}-${index}`} style={{ display: 'grid', gridTemplateColumns: gridMain, alignItems: 'center', gap: 0, padding: '6px 8px 6px 4px', borderBottom: '1px solid var(--home-row-border)' }}>
            {/* AoW dot */}
            <span style={{ display: 'flex', justifyContent: 'center' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: skelSoft, display: 'inline-block', animation: pulse(index * 0.06) }} />
            </span>
            {/* Date — two lines like real rows */}
            <div style={{ display: 'grid', gap: 2 }}>
              {skeletonBlock(index % 2 === 0 ? 28 : 32, 8, skelStrong, index * 0.06)}
              {skeletonBlock(index % 2 === 0 ? 18 : 24, 7, skelFaint, index * 0.06)}
            </div>
            {/* Name — two lines (name + email) like real rows */}
            <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
              {skeletonBlock(index % 2 === 0 ? '62%' : '54%', 9, skelStrong, index * 0.04)}
              {skeletonBlock(index % 2 === 0 ? '44%' : '58%', 8, skelFaint, index * 0.04)}
            </div>
            {/* Actions — notes + FE + separator + pipeline steps */}
            <div style={{ display: 'grid', gridTemplateColumns: actionGrid, alignItems: 'center', justifyContent: 'end', gap: 0, minWidth: 0, width: '100%' }}>
              {isActivity ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: SKEL_NOTES_SLOT, height: 20 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 0, background: skelFaint }} />
                </span>
              ) : null}
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                {skeletonBlock(isActivity ? 22 : 26, 8, skelStrong, index * 0.05)}
              </div>
              <span style={{ display: 'flex', justifyContent: 'center' }}>{skeletonBlock(6, 8, skelFaint)}</span>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))`, alignItems: 'center', gap: 6, width: '100%', minWidth: 0 }}>
                {Array.from({ length: stepCount }).map((__, si) => (
                  <div key={si} style={{ display: 'flex', justifyContent: 'center' }}>
                    <span style={{ width: si % 2 === 0 ? 18 : 14, height: 8, background: si % 2 === 0 ? skelSoft : skelFaint, animation: pulse((index + si) * 0.04) }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const HomeDashboardSkeleton: React.FC<{ isDarkMode: boolean; billingTileCount?: number; hidePipelineAndMatters?: boolean }> = ({ isDarkMode, billingTileCount = 4, hidePipelineAndMatters = false }) => (
  <div className="home-stable-shell-panel home-stable-shell-loading" style={{ padding: '4px 12px 0' }}>
    {/*
      Billing skeleton renders its own canonical shell (header + panel) so the
      Home shell fallback resolves into the live billing rail in
      OperationsDashboard without a structural pop. See
      docs/notes/_archive/HOME_BILLING_SKELETON_CONTRACT.md (when archived).
    */}
    <BillingRailSkeleton isDarkMode={isDarkMode} metricCount={billingTileCount} withShell />

    <div
      className={`home-dashboard-skeleton-main${hidePipelineAndMatters ? ' home-dashboard-skeleton-main--todo' : ''}`}
      style={{ paddingTop: 6 }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '2px 0 3px', letterSpacing: '0.2px' }}>Conversion</div>
        <div className="home-dashboard-skeleton-conversion" style={{ background: 'var(--home-card-bg)', border: '1px solid var(--home-card-border)', display: 'flex', flexDirection: 'column' }}>
          <SkeletonSectionLabel
            title="Conversion warming up"
            description="Pulling enquiries, matters, and conversion trend."
            isDarkMode={isDarkMode}
          />
          {/* Period tabs row (Today/Week/Month/Quarter) — mirrors live tab bar */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 12px', borderBottom: '1px solid var(--home-card-border)' }}>
            {[56, 62, 62, 68].map((width, index) => (
              <div key={index} style={{ width, height: 21, border: index === 0 ? '1px solid var(--home-card-border)' : '1px solid transparent', background: index === 0 ? 'var(--home-skel-fill)' : 'var(--home-skel-fill-faint)', animation: pulse(index * 0.08) }} />
            ))}
          </div>

          {hidePipelineAndMatters ? (
            // Paired layout mirrors live: KPI row + supporting trend block + quiet trails.
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', borderBottom: '1px solid var(--home-card-border)' }}>
                {[
                  { key: 'enquiries', labelWidth: 64, valueWidth: 52, metaWidth: 148 },
                  { key: 'matters', labelWidth: 58, valueWidth: 42, metaWidth: 136 },
                  { key: 'conversion', labelWidth: 66, valueWidth: 48, metaWidth: 112 },
                ].map((tile, index) => (
                  <div key={tile.key} style={{ padding: '12px 14px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, borderRight: index === 2 ? 'none' : '1px solid var(--home-card-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {tile.key === 'enquiries' ? <span style={{ width: 12, height: 2, background: 'var(--home-skel-fill)' }} /> : null}
                      {tile.key === 'matters' ? <span style={{ width: 6, height: 6, background: 'var(--home-skel-fill)' }} /> : null}
                      {skeletonBlock(tile.labelWidth, 9, 'var(--home-skel-fill)')}
                    </div>
                    {skeletonBlock(tile.valueWidth, 24, 'var(--home-skel-fill)')}
                    {skeletonBlock(tile.metaWidth, 10, 'var(--home-skel-fill-faint)')}
                  </div>
                ))}
              </div>

              <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--home-card-border)', display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {skeletonBlock(34, 9, 'var(--home-skel-fill)')}
                  {skeletonBlock(52, 8, 'var(--home-skel-fill-faint)')}
                  {skeletonBlock(44, 8, 'var(--home-skel-fill-faint)')}
                </div>
                <div style={{ width: '100%', height: 58, background: 'var(--home-skel-fill-faint)', position: 'relative', overflow: 'hidden', animation: pulse(0.12) }}>
                  {[0.25, 0.5, 0.75].map((ratio) => (
                    <span key={ratio} style={{ position: 'absolute', left: 8, right: 8, top: Math.round(58 * ratio), height: 1, background: 'var(--home-skel-fill-weak)', opacity: 0.55 }} />
                  ))}
                  <span style={{ position: 'absolute', left: 8, right: 8, bottom: 8, height: 1, background: 'var(--home-skel-fill)', opacity: 0.65 }} />
                  {[14, 34, 54, 74, 90].map((left, index) => (
                    <span key={`stem-${left}`} style={{ position: 'absolute', left: `${left}%`, bottom: 8, width: 1, height: index % 2 === 0 ? 22 : 14, background: 'var(--home-skel-fill)', opacity: 0.34, transform: 'translateX(-50%)' }} />
                  ))}
                  {[16, 36, 56, 76, 92].map((left, index) => (
                    <span key={`bar-${left}`} style={{ position: 'absolute', left: `${left}%`, bottom: 8, display: 'inline-flex', gap: 2, transform: 'translateX(-50%)' }}>
                      <span style={{ width: 3, height: index % 2 === 0 ? 9 : 6, background: 'var(--home-skel-fill-weak)', opacity: 0.7 }} />
                      <span style={{ width: 3, height: index % 2 === 0 ? 12 : 8, background: 'var(--home-skel-fill)', opacity: 0.85 }} />
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ padding: '12px 14px 12px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                {['enquiries', 'matters'].map((key, sIdx) => (
                  <div key={key} style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      {key === 'enquiries' ? <span style={{ width: 12, height: 2, background: 'var(--home-skel-fill)' }} /> : <span style={{ width: 6, height: 6, background: 'var(--home-skel-fill)' }} />}
                      {skeletonBlock(key === 'enquiries' ? 52 : 42, 9, 'var(--home-skel-fill)')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {Array.from({ length: sIdx === 0 ? 6 : 4 }).map((_, ti) => (
                        <span
                          key={ti}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            height: 22,
                            padding: '0 8px',
                            border: '1px solid var(--home-skel-fill-faint)',
                            background: 'var(--home-skel-fill-weak)',
                            animation: pulse(ti * 0.05 + sIdx * 0.08),
                          }}
                        >
                          <span style={{ width: 11, height: 11, background: 'var(--home-skel-fill-faint)' }} />
                          <span style={{ width: 24 + (ti % 3) * 8, height: 8, background: 'var(--home-skel-fill-faint)' }} />
                        </span>
                      ))}
                      {skeletonBlock(18, 8, 'var(--home-skel-fill-weak)')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // ── Legacy layout: hero KPI + full chart + AoW mix footer ──
            <div style={{ padding: '14px 14px 12px', display: 'grid', gap: 12, flex: 1, alignContent: 'start' }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    {skeletonBlock(94, 36, 'var(--home-skel-fill)')}
                    {skeletonBlock(42, 10, 'var(--home-skel-fill-weak)')}
                  </div>
                  {skeletonBlock(104, 9, 'var(--home-skel-fill-faint)')}
                </div>
                {skeletonBlock('76%', 11, 'var(--home-skel-fill-weak)')}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {[34, 40].map((width, index) => (
                    <div key={width} style={{ padding: '7px 9px', border: '1px solid var(--home-card-border)', background: 'var(--home-skel-fill-faint)', display: 'grid', gap: 4 }}>
                      {skeletonBlock(`${width}%`, 8, 'var(--home-skel-fill)')}
                      {skeletonBlock('70%', 10, 'var(--home-skel-fill-faint)')}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Chart legend + SVG — mirrors renderConversionChart ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
                <div style={{ display: 'grid', gap: 6, minWidth: 0, alignSelf: 'stretch', flex: 1, minHeight: 0 }}>
                  {/* Legend row — Enquiries (solid+dashed lines) · Matters (filled squares) */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ width: 12, height: 0, borderTop: isDarkMode ? '2px solid rgba(54,144,206,0.96)' : '2px solid rgba(54,144,206,0.96)', display: 'inline-block' }} />
                          <span style={{ width: 12, height: 0, borderTop: isDarkMode ? '1.6px dashed rgba(135,190,229,0.74)' : '1.6px dashed rgba(107,161,209,0.9)', display: 'inline-block' }} />
                        </span>
                        {skeletonBlock(56, 8, 'var(--home-skel-fill-faint)')}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ width: 9, height: 9, background: isDarkMode ? 'rgba(54,144,206,0.24)' : 'rgba(54,144,206,0.18)', display: 'inline-block' }} />
                          <span style={{ width: 9, height: 9, background: isDarkMode ? 'rgba(54,144,206,0.11)' : 'rgba(214,232,255,0.95)', display: 'inline-block' }} />
                        </span>
                        {skeletonBlock(52, 8, 'var(--home-skel-fill-faint)')}
                      </span>
                    </div>
                    {skeletonBlock(56, 8, 'var(--home-skel-fill-faint)')}
                  </div>
                  {/* SVG chart: paired bars (current+previous matters) + two line paths (enquiries) */}
                  <ConversionChartSkeleton isDarkMode={isDarkMode} />
                </div>
              </div>

              <div style={{ paddingTop: 8, borderTop: '1px solid var(--home-card-border)', display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {skeletonBlock(68, 8, 'var(--home-skel-fill)')}
                  {skeletonBlock(74, 8, 'var(--home-skel-fill-faint)')}
                </div>
                <div style={{ width: '100%', minHeight: 8, border: '1px solid var(--home-card-border)', background: 'var(--home-skel-fill-faint)', overflow: 'hidden', display: 'flex' }}>
                  {[22, 24, 18, 14, 22].map((width, index) => (
                    <div key={index} style={{ width: `${width}%`, minHeight: 8, background: index % 2 === 0 ? 'var(--home-skel-fill)' : 'var(--home-skel-fill-weak)', animation: pulse(index * 0.06) }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {[58, 48, 48].map((width, index) => (
                    <div key={width + index} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: index === 1 ? 'var(--home-skel-fill-weak)' : 'var(--home-skel-fill)', display: 'inline-block' }} />
                      {skeletonBlock(width, 8, 'var(--home-skel-fill-faint)')}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '2px 0 3px', letterSpacing: '0.2px' }}>{hidePipelineAndMatters ? 'To Do' : 'Pipeline'}</div>
        {hidePipelineAndMatters ? (
          <div
            className="home-dashboard-skeleton-todo"
            style={{ background: 'var(--home-card-bg)', border: '1px solid var(--home-card-border)', display: 'flex', flexDirection: 'column' }}
          >
            <SkeletonSectionLabel
              title="To Do warming up"
              description="Pulling pickups across the team."
              isDarkMode={isDarkMode}
            />
            {/* Header strip: count badge + loading pulse (mirrors seamless PanelActionRow header) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 10px 6px' }}>
              <span style={{ minWidth: 20, height: 18, padding: '0 6px', background: 'var(--home-skel-fill)', animation: pulse(0) }} />
              <span style={{ width: 10, height: 10, background: 'var(--home-skel-fill-weak)', animation: pulse(0.3) }} />
            </div>
            {/* Action rows — mirror PanelActionRow: 44px, 3px left accent, 26px icon square, title, count badge, chevron */}
            <div style={{ padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[0, 1, 2, 3].map((i) => {
                const accentTones = ['var(--home-skel-fill)', 'var(--home-skel-fill-weak)', 'var(--home-skel-fill)', 'var(--home-skel-fill-weak)'];
                const titleWidths = ['62%', '48%', '56%', '44%'];
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      minHeight: 44,
                      padding: '8px 12px',
                      background: 'var(--home-skel-fill-faint)',
                      borderLeft: `3px solid ${accentTones[i]}`,
                      border: '1px solid var(--home-card-border)',
                      borderLeftWidth: 3,
                      animation: pulse(i * 0.08),
                    }}
                  >
                    {/* Icon square */}
                    <span style={{ width: 26, height: 26, background: 'var(--home-skel-fill-weak)', flexShrink: 0 }} />
                    {/* Title */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {skeletonBlock(titleWidths[i], 11, 'var(--home-skel-fill)', i * 0.05)}
                    </div>
                    {/* Count badge (on some rows) */}
                    {i % 2 === 0 && (
                      <span style={{ minWidth: 20, height: 18, padding: '0 6px', background: 'var(--home-skel-fill-weak)', flexShrink: 0 }} />
                    )}
                    {/* Chevron */}
                    <span style={{ width: 10, height: 10, background: 'var(--home-skel-fill-weak)', flexShrink: 0, opacity: 0.55 }} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="home-dashboard-skeleton-pipeline-stack">
            <HomePipelineSkeletonCard isDarkMode={isDarkMode} variant="activity" />
            <HomePipelineSkeletonCard isDarkMode={isDarkMode} variant="matters" />
          </div>
        )}
      </div>
    </div>
  </div>
);

export const HomeTeamInsightSkeleton: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const sectionDivider = 'var(--home-section-divider)';
  const skeletonStrong = 'var(--home-skel-fill)';
  const skeletonSoft = 'var(--home-skel-fill-weak)';
  const skeletonTileBg = 'var(--home-tile-bg)';
  const skeletonTileBorder = 'var(--home-tile-border)';

  return (
    <div className="home-stable-shell-panel home-stable-shell-loading" style={{ padding: '12px 0' }}>
      <div style={{ background: isDarkMode ? 'var(--helix-website-blue)' : 'var(--surface-section)', border: '1px solid var(--home-card-border)', display: 'flex', flexDirection: 'column' }}>
        <SkeletonSectionLabel
          title="Team warming up"
          description="Pulling availability and workload."
          isDarkMode={isDarkMode}
        />
        <div style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
          <TeamInsightSectionSkeleton
            labelWidth={108}
            toggleWidth={56}
            groupLabelWidth={[52, 46, 58]}
            tileCounts={[4, 4, 3]}
            tileSize={{ width: 34, height: 34 }}
            isDarkMode={isDarkMode}
            sectionDivider={sectionDivider}
            skeletonStrong={skeletonStrong}
            skeletonSoft={skeletonSoft}
            skeletonTileBg={skeletonTileBg}
            skeletonTileBorder={skeletonTileBorder}
          />
        </div>
        <div style={{ height: 1, background: sectionDivider }} />
        <div style={{ padding: '14px 16px', display: 'grid', gap: 12 }}>
          <TeamInsightSectionSkeleton
            labelWidth={82}
            toggleWidth={86}
            groupLabelWidth={[64, 56, 68]}
            tileCounts={[2, 2, 2]}
            tileSize={{ width: 18, height: 18 }}
            groupedRows
            isDarkMode={isDarkMode}
            sectionDivider={sectionDivider}
            skeletonStrong={skeletonStrong}
            skeletonSoft={skeletonSoft}
            skeletonTileBg={skeletonTileBg}
            skeletonTileBorder={skeletonTileBorder}
          />
        </div>
      </div>
    </div>
  );
};