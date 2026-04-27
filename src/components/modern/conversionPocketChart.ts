// Phase D (D2): bolder pocket chart for the banded ENQUIRIES / MATTERS
// sections inside the Conversion panel. Replaces the near-invisible sparkline
// from Phase C. Still a pure string renderer — no React, no axes, no tooltips —
// but visually present:
//   • soft area fill under the current-period line
//   • dashed previous-period line at reduced opacity
//   • solid current-period line, slightly thicker, with a terminal dot
//   • three quiet horizontal gridlines for scale reference
//
// Intentionally bigger than the old sparkline (default ~140×40) so the eye
// actually registers it alongside the big number. Still decorative: the
// hover chevron on the section carries the drilldown.
//
// Phase F1 (2026-04-20): ghost-future buckets. Previously the chart filtered
// out `currentAvailable === false` buckets, so on a Monday the Week series
// collapsed to a single dot with no visual cue that Tue–Fri were pending.
// Now we keep the full x-axis, plot the current-series only across available
// buckets, and drop quiet baseline dots at the future x-positions. Previous
// line stays continuous across all positions, so the comparison stays honest.

export interface ConversionPocketChartMatterDetail {
  id: string;
  displayNumber: string;
  feeEarner?: string;
  feeEarnerInitials?: string;
  occurredAt?: string;
}

export interface ConversionPocketChartBucket {
  label?: string;
  axisLabel?: string;
  currentEnquiries?: number;
  currentMatters?: number;
  previousEnquiries?: number;
  previousMatters?: number;
  currentMatterDetails?: ConversionPocketChartMatterDetail[];
  previousMatterDetails?: ConversionPocketChartMatterDetail[];
  isFuture?: boolean;
  currentAvailable?: boolean;
  isCurrentEndpoint?: boolean;
}

export interface ConversionPocketChartOptions {
  width?: number;
  height?: number;
  /** Line colour for the current-period line + area fill + terminal dot. */
  stroke: string;
  /** Area fill colour. Defaults to `stroke`. */
  fill?: string;
  /** Previous-period line colour. Defaults to `stroke` (alpha'd via opacity). */
  previousStroke?: string;
  /** Optional muted colour used for gridlines. */
  gridStroke?: string;
  /**
   * Phase F1: when true (default) future buckets render as baseline ghost
   * dots so the reader knows "more is coming". Opt out (false) to restore
   * the pre-F1 compressed look (current series only, no placeholders).
   */
  futureBucketMarker?: boolean;
  /**
   * 2026-04-20: Catmull-Rom tension (0–1) applied to both current and
   * previous lines. `0` = straight polyline (pre-smoothing behaviour),
   * `1` = full Catmull-Rom. Defaults to 0.5 — enough to soften the kinks
   * on daily-aggregated month data without washing out individual-day
   * peaks.
   */
  smoothing?: number;
  /**
   * 2026-04-20: per-bucket display labels (typically dates). When supplied:
   *   • the first and last entries render as subtle x-axis ticks (low opacity,
   *     ~8px) to give the viewer a sense of what the time window covers;
   *   • each label is used inside the hover tooltip for that bucket.
   * Must match `buckets.length` or is ignored.
   */
  bucketLabels?: string[];
  /**
   * 2026-04-20: enable axis labels (subtle y-max + first/last x ticks) and
   * interactive hover tooltips. Defaults to true. When false, falls back to
   * the pre-interactivity pocket chart.
   */
  interactive?: boolean;
  /** Label used in the tooltip for the current period (e.g. "This month"). */
  currentLabel?: string;
  /** Label used in the tooltip for the previous period (e.g. "Last month"). */
  previousLabel?: string;
  /**
   * 2026-04-24: render style for the primary series.
   *   • 'line' (default) — smoothed Catmull-Rom current line with soft area
   *     fill + dashed previous-period line.
   *   • 'bar' — paired vertical bars per bucket (current solid, previous
   *     muted) anchored to the baseline. Used for the Matters strip where
   *     discrete counts read more honestly than a trend line.
   */
  chartStyle?: 'line' | 'bar';
}

// Simple module-level counter so each rendered chart gets a unique class
// scope for its embedded <style> (multiple charts can live on the same
// page without cross-hover bleed).
let pocketChartIdCounter = 0;
const nextPocketChartId = () => {
  pocketChartIdCounter = (pocketChartIdCounter + 1) % 1_000_000;
  return `pc${Date.now().toString(36).slice(-4)}${pocketChartIdCounter.toString(36)}`;
};

// Basic XML escape for tooltip text rendering.
const escapeXml = (value: string): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatMatterDetailLabel = (detail: ConversionPocketChartMatterDetail): string => {
  const displayNumber = String(detail?.displayNumber || '').trim() || 'Matter';
  const feeEarner = String(detail?.feeEarner || detail?.feeEarnerInitials || '').trim();
  return feeEarner ? `${displayNumber} · ${feeEarner}` : displayNumber;
};

const buildMatterDetailLines = (
  details: ConversionPocketChartMatterDetail[] | undefined,
  totalCount: number,
  pending = false,
  maxVisible = 4,
): string[] => {
  if (pending) return ['Pending'];
  const labels = Array.isArray(details)
    ? details.map(formatMatterDetailLabel).filter(Boolean)
    : [];
  if (totalCount <= 0 && labels.length === 0) return ['None'];
  const visible = labels.slice(0, maxVisible);
  const overflow = Math.max(0, totalCount - visible.length);
  if (overflow > 0) visible.push(`+${overflow} more`);
  return visible.length > 0 ? visible : ['None'];
};

// Internal: build a smoothed cubic-Bezier path from a point array using a
// Catmull-Rom→Bezier conversion with a tension factor. At tension=0 the
// output collapses to straight-line segments (identical to a `M … L` path).
// Chosen over monotone-cubic because it keeps local peaks visible: daily
// counts rising/falling by 1–2 should still read as a peak, not get
// flattened by monotone clamping.
function buildSmoothPathD(points: Array<{ x: number; y: number }>, tension: number): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  if (tension <= 0 || points.length === 2) {
    return `M${points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L')}`;
  }
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const clampY = (value: number) => Math.min(maxY, Math.max(minY, value));
  const k = tension / 6;
  let d = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) * k;
    const cp1y = clampY(p1.y + (p2.y - p0.y) * k);
    const cp2x = p2.x - (p3.x - p1.x) * k;
    const cp2y = clampY(p2.y - (p3.y - p1.y) * k);
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

/**
 * Build a standalone SVG string (safe for dangerouslySetInnerHTML) rendering
 * both current and previous series for a single metric across the buckets.
 *
 * Silent contract: if there's no usable data, an empty (but sized) SVG is
 * returned so the caller can still reserve layout space.
 */
export function buildConversionPocketChartSVG(
  buckets: ConversionPocketChartBucket[],
  metric: 'enquiries' | 'matters',
  opts: ConversionPocketChartOptions,
): string {
  const width = opts.width ?? 140;
  const height = opts.height ?? 40;
  const stroke = opts.stroke;
  const fill = opts.fill ?? stroke;
  const previousStroke = opts.previousStroke ?? stroke;
  const gridStroke = opts.gridStroke ?? 'rgba(148, 163, 184, 0.22)';
  const bucketLabels =
    Array.isArray(opts.bucketLabels) && opts.bucketLabels.length === (buckets?.length ?? 0)
      ? opts.bucketLabels
      : null;
  const currentLabel = opts.currentLabel ?? 'Current';
  const previousLabel = opts.previousLabel ?? 'Previous';
  const smoothing = Math.max(0, Math.min(1, opts.smoothing ?? 0.5));
  const futureBucketMarker = opts.futureBucketMarker !== false;
  const interactive = opts.interactive !== false;
  const chartStyle = opts.chartStyle ?? 'line';

  // 2026-04-20: real gutters for axis labels so they sit *outside* the plot
  // area — never overlapping the line or each other.
  //   • top gutter  (`padYTop`)    — holds x-axis day labels above the top edge.
  //   • left gutter (`padXLeft`)   — holds the y-axis max count.
  //   • right/bottom kept minimal so the line keeps its footprint.
  const padXLeft = 16;
  const padXRight = 2;
  const padYTop = bucketLabels ? 11 : 3;
  const padYBottom = 3;
  const innerWidth = Math.max(1, width - padXLeft - padXRight);
  const innerHeight = Math.max(1, height - padYTop - padYBottom);

  const allBuckets = buckets || [];
  if (allBuckets.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>`;
  }

  // Phase F1: keep the full x-axis based on ALL buckets (honest density),
  // but only plot the current-period line across the available prefix.
  const currentSeriesFull = allBuckets.map((b) =>
    Number((metric === 'enquiries' ? b.currentEnquiries : b.currentMatters) || 0),
  );
  const previousSeriesFull = allBuckets.map((b) =>
    Number((metric === 'enquiries' ? b.previousEnquiries : b.previousMatters) || 0),
  );
  const availableMask = allBuckets.map((b) => b.currentAvailable !== false);

  const maxVal = Math.max(1, ...currentSeriesFull, ...previousSeriesFull);
  // 2026-04-20: lowest visible value on the y-axis. The plot always
  // anchors 0 at the baseline (ratio = value / maxVal), so the floor of
  // the scale is effectively min(0, minData). We surface the greater of
  // 0 and the smallest datum so readers can tell whether the series dips
  // into zero territory or sits on a higher floor.
  const rawMin = Math.min(...currentSeriesFull, ...previousSeriesFull);
  const minVal = Number.isFinite(rawMin) ? Math.max(0, Math.floor(rawMin)) : 0;
  const count = allBuckets.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const baselineY = padYTop + innerHeight;

  const xAt = (index: number) =>
    count === 1 ? padXLeft + innerWidth / 2 : padXLeft + index * stepX;
  const yForValue = (value: number) => {
    const ratio = value / maxVal;
    return padYTop + (1 - ratio) * innerHeight;
  };

  // Current-series path: only across the available prefix. If no buckets are
  // available we still render the chart shell (previous + ghosts).
  const availableIndices: number[] = [];
  for (let i = 0; i < availableMask.length; i++) {
    if (availableMask[i]) availableIndices.push(i);
  }
  const currentPoints = availableIndices.map((i) => ({
    x: xAt(i),
    y: yForValue(currentSeriesFull[i]),
  }));

  const previousPoints = allBuckets.map((_, i) => ({
    x: xAt(i),
    y: yForValue(previousSeriesFull[i]),
  }));

  const previousHasData = previousSeriesFull.some((v) => v > 0);
  const previousD = previousHasData
    ? buildSmoothPathD(previousPoints, smoothing)
    : '';

  const hasCurrentPath = currentPoints.length >= 2;
  const currentD = hasCurrentPath
    ? buildSmoothPathD(currentPoints, smoothing)
    : '';
  const areaD = hasCurrentPath
    ? `${currentD} L${currentPoints[currentPoints.length - 1].x.toFixed(2)},${baselineY.toFixed(2)} L${currentPoints[0].x.toFixed(2)},${baselineY.toFixed(2)} Z`
    : '';

  const gridLines = [0.25, 0.5, 0.75]
    .map((ratio) => {
      const y = (padYTop + ratio * innerHeight).toFixed(2);
      return `<line x1="${padXLeft}" y1="${y}" x2="${(padXLeft + innerWidth).toFixed(2)}" y2="${y}" stroke="${gridStroke}" stroke-width="0.5" stroke-dasharray="1.5,2" />`;
    })
    .join('');

  // Phase F1: ghost dots at future x-positions on the baseline. Uses the
  // stroke tone at reduced opacity so the eye picks them up as "waiting"
  // without competing with the real line.
  const ghostDots = futureBucketMarker
    ? allBuckets
        .map((_, i) => {
          if (availableMask[i]) return '';
          const x = xAt(i).toFixed(2);
          const y = (baselineY - 1).toFixed(2);
          return `<circle cx="${x}" cy="${y}" r="1.3" fill="${stroke}" opacity="0.32" />`;
        })
        .join('')
    : '';

  // Terminal dot at the last available current-series point. When the
  // whole period is future-only (no available buckets), skip.
  const terminal = hasCurrentPath || currentPoints.length === 1
    ? (() => {
        const last = currentPoints[currentPoints.length - 1];
        return `<circle cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="2" fill="${stroke}" opacity="0.95" />`;
      })()
    : '';

  // Subtle vertical "we are here" rule at the terminal x — only when we have
  // both future buckets AND a current endpoint. Keeps legibility without text.
  const hasFuture = availableMask.some((a) => !a);
  const todayRule = futureBucketMarker && hasFuture && (hasCurrentPath || currentPoints.length === 1)
    ? (() => {
        const x = currentPoints[currentPoints.length - 1].x.toFixed(2);
        return `<line x1="${x}" y1="${padYTop}" x2="${x}" y2="${baselineY}" stroke="${stroke}" stroke-width="0.6" stroke-dasharray="1.5,2" opacity="0.28" />`;
      })()
    : '';

  // 2026-04-20: axis labels rendered in dedicated gutters (outside the plot
  // area) so they can never overlap the line or each other.
  //   • Y-axis max count  — left gutter, right-aligned against the plot's
  //     left edge, vertically centred with the top of the plot area.
  //   • X-axis day labels — top gutter, first + last only, horizontally
  //     anchored to the *inside* of the plot (start/end) so "Day 1" begins
  //     where the line begins.
  const axisLabelFill = stroke;
  const yAxisLabel = `<text x="${(padXLeft - 3).toFixed(2)}" y="${(padYTop + 4).toFixed(2)}" font-size="7.5" font-weight="600" fill="${axisLabelFill}" opacity="0.5" font-family="inherit" letter-spacing="0.02em" text-anchor="end">${escapeXml(String(maxVal))}</text>`;
  // 2026-04-20: pair the max label with a min label at the baseline so the
  // y-range reads explicitly (e.g. "20 … 0"). Skipped when max === min so
  // we don't render "0" twice on an all-zero chart.
  const yAxisMinLabel = maxVal !== minVal
    ? `<text x="${(padXLeft - 3).toFixed(2)}" y="${(baselineY - 1).toFixed(2)}" font-size="7.5" font-weight="600" fill="${axisLabelFill}" opacity="0.5" font-family="inherit" letter-spacing="0.02em" text-anchor="end">${escapeXml(String(minVal))}</text>`
    : '';
  const xAxisLabels = bucketLabels
    ? (() => {
        const yText = Math.max(7, padYTop - 3).toFixed(2);
        // 2026-04-24: denser x-axis labelling so series like "Mon … Fri"
        // get a clear midpoint anchor. Label count scales with bucket count:
        //   • 1 bucket → just that one
        //   • 2 buckets → first + last
        //   • 3–6 buckets → first + mid + last
        //   • 7+ buckets → first + two evenly-spaced mids + last
        const n = bucketLabels.length;
        const pickIndexes = (): number[] => {
          if (n <= 1) return [0];
          if (n === 2) return [0, 1];
          if (n <= 6) return [0, Math.floor((n - 1) / 2), n - 1];
          return [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1];
        };
        const indexes = Array.from(new Set(pickIndexes())).sort((a, b) => a - b);
        return indexes
          .map((i) => {
            const raw = bucketLabels[i];
            if (!raw) return '';
            const isFirst = i === 0;
            const isLast = i === n - 1;
            const x = isFirst ? padXLeft : isLast ? padXLeft + innerWidth : xAt(i);
            const anchor = isFirst ? 'start' : isLast ? 'end' : 'middle';
            return `<text x="${x.toFixed(2)}" y="${yText}" font-size="7.5" font-weight="600" fill="${axisLabelFill}" opacity="0.5" font-family="inherit" letter-spacing="0.02em" text-anchor="${anchor}">${escapeXml(raw)}</text>`;
          })
          .join('');
      })()
    : '';

  // 2026-04-20: hover affordance. Per-bucket invisible hit column, with a
  // sibling group containing a vertical guide, focus dot, and a small label
  // chip. Tooltip fades in/out via CSS transitions on :hover — no JS, no
  // React state — so the same pure-string API keeps working. Each chart
  // gets a unique class scope so two charts on the same row don't cross-talk.
  let interactionBlock = '';
  let styleBlock = '';
  let rootClass = '';
  const needsScopedStyles = (interactive && count > 0) || (chartStyle === 'bar' && count > 0);
  const chartId = needsScopedStyles ? nextPocketChartId() : '';
  if (chartId) {
    rootClass = chartId;
  }
  const styleRules: string[] = [];
  if (chartStyle === 'bar' && count > 0 && chartId) {
    const barGrowName = `${chartId}-bar-grow`;
    styleRules.push(`
      .${chartId} .pc-bar {
        transform-box: fill-box;
        transform-origin: center bottom;
        animation: ${barGrowName} 320ms cubic-bezier(0.22, 1, 0.36, 1) var(--pc-enter-delay, 0ms) both;
      }
      @keyframes ${barGrowName} {
        from { transform: scaleY(0.01); }
        to { transform: scaleY(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .${chartId} .pc-bar { animation: none; }
      }
    `);
  }
  if (interactive && count > 0 && chartId) {
    const tooltipBg = 'rgba(6,23,51,0.92)';
    const tooltipFg = 'rgba(243,244,246,0.95)';
    const tooltipMuted = 'rgba(209,213,219,0.75)';
    const guideStroke = stroke;

    styleRules.push(`
      .${chartId} .pc-tip { opacity: 0; transition: opacity 160ms ease-out; pointer-events: none; }
      .${chartId} .pc-col:hover .pc-tip,
      .${chartId} .pc-col:focus-within .pc-tip { opacity: 1; }
      .${chartId} .pc-hit { cursor: default; }
    `);

    const colWidth = count > 1 ? stepX : innerWidth;
    const metricKey = metric === 'enquiries' ? 'Enquiries' : 'Matters';

    interactionBlock = allBuckets
      .map((bucket, i) => {
        const cx = xAt(i);
        const colX = count > 1 ? Math.max(padXLeft, cx - colWidth / 2) : padXLeft;
        const colW = count > 1 ? colWidth : innerWidth;
        const currentVal = currentSeriesFull[i];
        const previousVal = previousSeriesFull[i];
        const isAvailable = availableMask[i];
        const dotY = isAvailable ? yForValue(currentVal) : baselineY - 1;
        const label = bucketLabels ? bucketLabels[i] : (bucket.label ?? '');

        // 2026-04-20: joint tooltip — a single compact chip that always shows
        // BOTH current and previous values stacked. Previously the two lines
        // could overlap at narrow widths; now they're siblings on their own
        // rows so there's no horizontal collision by construction.
        const headerH = label ? 11 : 0;
        const rowH = 10;
        const chipPadY = 4;
        const chipH = chipPadY * 2 + headerH + rowH * 2;
        const chipW = 74;
        // 2026-04-20: consistent, always-in-viewport chip placement so the
        // tooltip never gets cut off at any edge and reads the same way on
        // every bucket.
        //  • X: centre on the dot when possible; if it would clip either side,
        //    pin to that side with a 4px inset so the chip stays visible and
        //    there's a consistent gutter.
        //  • Y: prefer above the dot. If that would clip the top gutter,
        //    flip below. If *neither* fits (very short chart), pick the side
        //    with more space and clamp to [2, height - chipH - 2] so it's
        //    always fully inside the viewBox.
        const chipMarginX = 4;
        const rawChipX = cx - chipW / 2;
        const chipX = Math.max(chipMarginX, Math.min(width - chipW - chipMarginX, rawChipX));
        const spaceAbove = dotY - padYTop;
        const spaceBelow = height - dotY;
        const aboveY = dotY - chipH - 6;
        const belowY = dotY + 6;
        let chipY: number;
        if (aboveY >= 2) {
          chipY = aboveY;
        } else if (belowY + chipH <= height - 2) {
          chipY = belowY;
        } else {
          // Last-resort: pick whichever side has more room and clamp hard.
          chipY = spaceAbove >= spaceBelow ? Math.max(2, aboveY) : Math.min(height - chipH - 2, belowY);
        }
        chipY = Math.max(2, Math.min(height - chipH - 2, chipY));

        const textLeftX = chipX + 6;
        const textRightX = chipX + chipW - 6;
        const headerY = chipY + chipPadY + 8;
        const row1Y = chipY + chipPadY + headerH + 8;
        const row2Y = row1Y + rowH;

        const headerLine = label
          ? `<text x="${(chipX + chipW / 2).toFixed(2)}" y="${headerY.toFixed(2)}" font-size="7.5" font-weight="700" fill="${tooltipMuted}" text-anchor="middle" font-family="inherit" letter-spacing="0.08em">${escapeXml(String(label).toUpperCase())}</text>`
          : '';
        const currentLabelEl = `<text x="${textLeftX.toFixed(2)}" y="${row1Y.toFixed(2)}" font-size="8" font-weight="600" fill="${tooltipMuted}" font-family="inherit" letter-spacing="0.04em">${escapeXml(currentLabel)}</text>`;
        const currentValueEl = isAvailable
          ? `<text x="${textRightX.toFixed(2)}" y="${row1Y.toFixed(2)}" font-size="9" font-weight="700" fill="${tooltipFg}" text-anchor="end" font-family="inherit">${escapeXml(String(currentVal))}</text>`
          : `<text x="${textRightX.toFixed(2)}" y="${row1Y.toFixed(2)}" font-size="8" font-weight="600" fill="${tooltipMuted}" text-anchor="end" font-style="italic" font-family="inherit">Pending</text>`;
        const previousLabelEl = `<text x="${textLeftX.toFixed(2)}" y="${row2Y.toFixed(2)}" font-size="8" font-weight="600" fill="${tooltipMuted}" font-family="inherit" letter-spacing="0.04em">${escapeXml(previousLabel)}</text>`;
        const previousValueEl = `<text x="${textRightX.toFixed(2)}" y="${row2Y.toFixed(2)}" font-size="9" font-weight="700" fill="${tooltipFg}" text-anchor="end" font-family="inherit" opacity="0.82">${escapeXml(String(previousVal))}</text>`;

        const guide = `<line x1="${cx.toFixed(2)}" y1="${padYTop.toFixed(2)}" x2="${cx.toFixed(2)}" y2="${baselineY.toFixed(2)}" stroke="${guideStroke}" stroke-width="0.8" stroke-dasharray="1.5,2" opacity="0.45" />`;
        const dot = isAvailable
          ? `<circle cx="${cx.toFixed(2)}" cy="${dotY.toFixed(2)}" r="2.4" fill="${stroke}" stroke="${tooltipBg}" stroke-width="1" />`
          : '';

        const tipRect = `<rect x="${chipX.toFixed(2)}" y="${chipY.toFixed(2)}" width="${chipW}" height="${chipH}" rx="2" ry="2" fill="${tooltipBg}" stroke="${stroke}" stroke-width="0.5" stroke-opacity="0.5" />`;

        const hit = `<rect class="pc-hit" x="${colX.toFixed(2)}" y="0" width="${colW.toFixed(2)}" height="${height}" fill="transparent" aria-label="${escapeXml(`${metricKey} ${label ? `on ${label}` : `bucket ${i + 1}`}: ${currentLabel} ${isAvailable ? currentVal : 'pending'}, ${previousLabel} ${previousVal}`)}"><title>${escapeXml(`${label ? `${label} · ` : ''}${metricKey}: ${currentLabel} ${isAvailable ? currentVal : 'pending'} · ${previousLabel} ${previousVal}`)}</title></rect>`;

        return `<g class="pc-col">${hit}<g class="pc-tip">${guide}${dot}${tipRect}${headerLine}${currentLabelEl}${currentValueEl}${previousLabelEl}${previousValueEl}</g></g>`;
      })
      .join('');
  }
  if (styleRules.length > 0) {
    styleBlock = `<style>${styleRules.join('')}</style>`;
  }

  const svgClass = rootClass ? ` class="${rootClass}"` : '';

  // 2026-04-24: paired bar rendering. Current bar rendered solid at stroke
  // colour, previous bar rendered muted (same hue, lower opacity) so the
  // eye can compare period-over-period at a glance without a second line.
  // Bars share the existing axis/hover/gridline chrome so parity with the
  // line chart is preserved.
  let barsBlock = '';
  if (chartStyle === 'bar' && count > 0) {
    // Per-bucket slot width based on stepX (or the full inner width when
    // there's only one bucket). Leave ~25% gutter between buckets, then
    // split the remaining width between the current and previous bar.
    const slotWidth = count > 1 ? stepX : innerWidth;
    const groupWidth = Math.max(4, slotWidth * 0.72);
    const barGap = Math.max(0.5, slotWidth * 0.05);
    const barWidth = Math.max(1.5, (groupWidth - barGap) / 2);
    const barPieces: string[] = [];
    for (let i = 0; i < count; i++) {
      const cx = xAt(i);
      const currentVal = currentSeriesFull[i];
      const previousVal = previousSeriesFull[i];
      const isAvailable = availableMask[i];
      const currentX = cx - barWidth - barGap / 2;
      const previousX = cx + barGap / 2;
      const bucketDelay = Math.min(i * 18, 160);
      // Previous bar: always render (comparison anchor).
      if (previousVal > 0) {
        const y = yForValue(previousVal);
        const h = Math.max(0.5, baselineY - y);
        barPieces.push(
          `<rect class="pc-bar pc-bar-prev" style="--pc-enter-delay:${bucketDelay}ms" x="${previousX.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" fill="${previousStroke}" opacity="0.35" />`,
        );
      }
      // Current bar: skip when the bucket is still pending (future day).
      if (isAvailable && currentVal > 0) {
        const y = yForValue(currentVal);
        const h = Math.max(0.5, baselineY - y);
        barPieces.push(
          `<rect class="pc-bar pc-bar-current" style="--pc-enter-delay:${bucketDelay + 40}ms" x="${currentX.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" fill="${stroke}" opacity="0.92" />`,
        );
      }
    }
    barsBlock = barPieces.join('');
  }

  // Line-chart pieces are only emitted when chartStyle === 'line' so the bar
  // variant doesn't carry the smoothed path + area fill underneath the bars.
  const linePieces = chartStyle === 'line' ? `
    ${hasCurrentPath ? `<path d="${areaD}" fill="${fill}" fill-opacity="0.18" stroke="none" />` : ''}
    ${previousD ? `<path d="${previousD}" fill="none" stroke="${previousStroke}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2.5,2.5" opacity="0.55" />` : ''}
    ${hasCurrentPath ? `<path d="${currentD}" fill="none" stroke="${stroke}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" />` : ''}
    ${terminal}
  ` : '';

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"${svgClass} role="img">
    ${styleBlock}
    ${gridLines}
    ${linePieces}
    ${barsBlock}
    ${ghostDots}
    ${todayRule}
    ${yAxisLabel}
    ${yAxisMinLabel}
    ${xAxisLabels}
    ${interactionBlock}
  </svg>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Combined chart (2026-04-24): single SVG rendering enquiries as a smoothed
// line + matters as paired outcome bars. 2026-04-27 house-style update:
// mixed charts should favour signal over surface. In this renderer:
//   • enquiries reads as flow (line + centre-aligned stems)
//   • matters reads as completed outcomes (paired bars)
//   • filled areas are reserved for single-series charts only
// The hover tooltip shows both series plus per-bucket matter refs. Dual
// y-scaling keeps each series legible (matters are typically ~10× smaller
// than enquiries, so a shared axis would flatten the bars).
// ────────────────────────────────────────────────────────────────────────────

export interface CombinedConversionChartOptions {
  width?: number;
  height?: number;
  /** Line colour (enquiries). */
  enquiriesStroke: string;
  /** Bar colour (matters). */
  mattersStroke: string;
  /** Previous-line colour for enquiries (defaults to enquiriesStroke muted). */
  enquiriesPreviousStroke?: string;
  /** Previous-bar colour for matters (defaults to mattersStroke muted). */
  mattersPreviousStroke?: string;
  gridStroke?: string;
  /** Per-bucket labels (used on axis + hover). Must match bucket length. */
  bucketLabels?: string[];
  currentLabel?: string;
  previousLabel?: string;
  /** Catmull-Rom tension for the enquiries line. 0–1, default 0.5. */
  smoothing?: number;
  futureBucketMarker?: boolean;
  plotFill?: string;
  plotBorder?: string;
  bucketBandFill?: string;
  bucketBandAltFill?: string;
  /** Stroke for the dotted vertical separators between bucket columns (inner edges only). */
  bucketSeparatorStroke?: string;
  axisMutedFill?: string;
  xAxisLabelFill?: string;
  tooltipBg?: string;
  tooltipFg?: string;
  tooltipMuted?: string;
  hoverGuideStroke?: string;
  hoverGuideFill?: string;
  compactMode?: boolean;
}

export function buildCombinedConversionChartSVG(
  buckets: ConversionPocketChartBucket[],
  opts: CombinedConversionChartOptions,
): string {
  const width = opts.width ?? 520;
  const height = opts.height ?? 180;
  const enquiriesStroke = opts.enquiriesStroke;
  const mattersStroke = opts.mattersStroke;
  const enquiriesPreviousStroke = opts.enquiriesPreviousStroke ?? enquiriesStroke;
  const mattersPreviousStroke = opts.mattersPreviousStroke ?? mattersStroke;
  const gridStroke = opts.gridStroke ?? 'rgba(148, 163, 184, 0.22)';
  const bucketLabels =
    Array.isArray(opts.bucketLabels) && opts.bucketLabels.length === (buckets?.length ?? 0)
      ? opts.bucketLabels
      : null;
  const currentLabel = opts.currentLabel ?? 'Current';
  const previousLabel = opts.previousLabel ?? 'Previous';
  const smoothing = Math.max(0, Math.min(1, opts.smoothing ?? 0.5));
  const futureBucketMarker = opts.futureBucketMarker !== false;
  const plotFill = opts.plotFill ?? 'rgba(255,255,255,0.02)';
  const plotBorder = opts.plotBorder ?? gridStroke;
  // Legacy band-fill props are accepted for back-compat. Alternating column
  // shading was removed (too noisy); only the alt fill is still used to tint
  // the baseline strip.
  void opts.bucketBandFill;
  const bucketBandAltFill = opts.bucketBandAltFill ?? 'transparent';
  const bucketSeparatorStroke = opts.bucketSeparatorStroke ?? 'rgba(148,163,184,0.22)';
  const axisMutedFill = opts.axisMutedFill ?? 'rgba(148,163,184,0.58)';
  const xAxisLabelFill = opts.xAxisLabelFill ?? axisMutedFill;
  const tooltipBg = opts.tooltipBg ?? 'rgba(6,23,51,0.94)';
  const tooltipFg = opts.tooltipFg ?? 'rgba(243,244,246,0.95)';
  const tooltipMuted = opts.tooltipMuted ?? 'rgba(209,213,219,0.75)';
  const hoverGuideStroke = opts.hoverGuideStroke ?? enquiriesStroke;
  const hoverGuideFill = opts.hoverGuideFill ?? 'rgba(255,255,255,0.04)';
  const compactMode = opts.compactMode ?? width < 480;

  const enqSeriesMax = Math.max(1, ...buckets.map((b) => Number(b.currentEnquiries || 0)), ...buckets.map((b) => Number(b.previousEnquiries || 0)));
  const matSeriesMax = Math.max(1, ...buckets.map((b) => Number(b.currentMatters || 0)), ...buckets.map((b) => Number(b.previousMatters || 0)));
  const enqMidPreview = Math.round(enqSeriesMax / 2);
  const leftAxisCharCount = Math.max(String(enqSeriesMax).length, String(enqMidPreview).length, 1);
  const rightAxisCharCount = Math.max(String(matSeriesMax).length, 1);
  const leftAxisLabelWidth = Math.max(compactMode ? 18 : 16, leftAxisCharCount * (compactMode ? 6.6 : 5.8));
  const rightAxisLabelWidth = Math.max(compactMode ? 14 : 12, rightAxisCharCount * (compactMode ? 5.8 : 5.2));
  const axisGap = compactMode ? 8 : 6;
  const axisEdgeInset = compactMode ? 5 : 4;

  const padXLeft = Math.round(leftAxisLabelWidth + axisGap + axisEdgeInset + 10);
  const padXRight = Math.round(rightAxisLabelWidth + axisGap + axisEdgeInset + 10);
  const padYTop = bucketLabels ? 14 : 6;
  const padYBottom = 6;
  const innerWidth = Math.max(1, width - padXLeft - padXRight);
  const innerHeight = Math.max(1, height - padYTop - padYBottom);

  const allBuckets = buckets || [];
  if (allBuckets.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>`;
  }

  const enqCurrent = allBuckets.map((b) => Number(b.currentEnquiries || 0));
  const enqPrevious = allBuckets.map((b) => Number(b.previousEnquiries || 0));
  const matCurrent = allBuckets.map((b) => Number(b.currentMatters || 0));
  const matPrevious = allBuckets.map((b) => Number(b.previousMatters || 0));
  const availableMask = allBuckets.map((b) => b.currentAvailable !== false);
  const enqMax = Math.max(1, ...enqCurrent, ...enqPrevious);
  const matMax = Math.max(1, ...matCurrent, ...matPrevious);
  const hasAnyEnquiryActivity = enqCurrent.some((value) => value > 0) || enqPrevious.some((value) => value > 0);
  const hasAnyMatterActivity = matCurrent.some((value) => value > 0) || matPrevious.some((value) => value > 0);
  const hasAnyActivity = hasAnyEnquiryActivity || hasAnyMatterActivity;
  const enquiryNonZeroCount = enqCurrent.filter((value) => value > 0).length + enqPrevious.filter((value) => value > 0).length;
  const matterNonZeroCount = matCurrent.filter((value) => value > 0).length + matPrevious.filter((value) => value > 0).length;
  const quietDensity = hasAnyActivity
    && enqMax <= 4
    && matMax <= 1
    && enquiryNonZeroCount <= 4
    && matterNonZeroCount <= 3;

  const leftAxisTextX = padXLeft - axisGap;
  const rightAxisTextX = padXLeft + innerWidth + axisGap;

  const count = allBuckets.length;
  const slotWidth = count > 1 ? innerWidth / (count - 1) : innerWidth;
  const groupWidth = Math.max(4, slotWidth * (compactMode ? 0.46 : quietDensity ? 0.48 : 0.52));
  const barGap = Math.max(0.75, slotWidth * (compactMode ? 0.08 : 0.07));
  const barWidth = Math.max(1.6, (groupWidth - barGap) / 2);
  const slotBaseH = 2.4;
  const slotBaseInset = 0.7;
  const pairHalfSpan = count > 1 ? Math.min(innerWidth / 2, barWidth + barGap / 2 + slotBaseInset) : 0;
  const plotTrackWidth = count > 1 ? Math.max(1, innerWidth - pairHalfSpan * 2) : innerWidth;
  const stepX = count > 1 ? plotTrackWidth / (count - 1) : 0;
  const colWidth = count > 1 ? stepX : innerWidth;
  const baselineY = padYTop + innerHeight;

  const xAt = (index: number) =>
    count === 1 ? padXLeft + innerWidth / 2 : padXLeft + pairHalfSpan + index * stepX;
  const yForEnq = (value: number) => padYTop + (1 - value / enqMax) * innerHeight;
  const yForMat = (value: number) => padYTop + (1 - value / matMax) * innerHeight;

  const plotBackplate = `<rect x="${(padXLeft - 6).toFixed(2)}" y="${Math.max(0, padYTop - 2).toFixed(2)}" width="${(innerWidth + 12).toFixed(2)}" height="${(innerHeight + 4).toFixed(2)}" fill="${plotFill}" stroke="${plotBorder}" stroke-width="1" />`;
  // Inner-only dotted separators between adjacent bucket columns. No alternating
  // fill (too noisy) — just a quiet vertical rule that delineates each comparison
  // bucket from its neighbour. First and last edges are deliberately left clean.
  const bucketBands = count > 1
    ? allBuckets
        .slice(1)
        .map((_, i) => {
          // i is 0-based over (count-1) gaps; the gap sits between bucket i and i+1.
          const x = (xAt(i) + xAt(i + 1)) / 2;
          return `<line x1="${x.toFixed(2)}" y1="${padYTop.toFixed(2)}" x2="${x.toFixed(2)}" y2="${(padYTop + innerHeight).toFixed(2)}" stroke="${bucketSeparatorStroke}" stroke-width="1" stroke-dasharray="2 3" stroke-linecap="round" />`;
        })
        .join('')
    : '';
  const baselineStrip = `<rect x="${padXLeft.toFixed(2)}" y="${Math.max(padYTop, baselineY - 6).toFixed(2)}" width="${innerWidth.toFixed(2)}" height="${Math.min(6, innerHeight).toFixed(2)}" fill="${bucketBandAltFill}" />`;
  const matterPreviousSlotOpacity = quietDensity ? '0.1' : '0.14';
  const matterCurrentSlotOpacity = quietDensity ? '0.12' : '0.16';
  const matterCurrentUnavailableSlotOpacity = quietDensity ? '0.06' : '0.08';
  const matterPreviousBarOpacity = quietDensity ? '0.24' : '0.32';
  const matterCurrentBarOpacity = quietDensity ? '0.78' : '0.92';
  const enquiryCurrentLineWidth = quietDensity ? 1.65 : 1.9;
  const enquiryPreviousLineOpacity = quietDensity ? 0.42 : 0.55;
  const enquiryStemOpacity = quietDensity ? 0.16 : 0.2;
  const enquiryStemWidth = quietDensity ? 1 : 1.15;
  const enquiryMarkerRadius = quietDensity ? 1.8 : 2.2;

  // Gridlines — shared plot area, 3 subtle horizontal rules.
  const gridLines = [0.25, 0.5, 0.75]
    .map((ratio) => {
      const y = (padYTop + ratio * innerHeight).toFixed(2);
      return `<line x1="${padXLeft}" y1="${y}" x2="${(padXLeft + innerWidth).toFixed(2)}" y2="${y}" stroke="${gridStroke}" stroke-width="0.5" stroke-dasharray="1.5,2" />`;
    })
    .join('');

  // Matters bars — render behind the enquiries line so the line remains the
  // primary signal. Zero-value placeholders were removed because they added
  // baseline noise without conveying meaningful extra information.
  const hasAnyMatPrevious = matPrevious.some((v) => v > 0);
  const hasAnyMatCurrent = matCurrent.some((v) => v > 0);
  const isVsMattersContext = hasAnyMatPrevious || (hasAnyMatCurrent && enqPrevious.some((v) => v > 0));
  const slotPieces: string[] = [];
  const barPieces: string[] = [];
  for (let i = 0; i < count; i++) {
    const cx = xAt(i);
    const prevVal = matPrevious[i];
    const currVal = matCurrent[i];
    const previousBarX = cx - barWidth - barGap / 2;
    const currentBarX = cx + barGap / 2;
    const bucketDelay = Math.min(i * 20, 180);
    if (isVsMattersContext) {
      const slotY = baselineY - slotBaseH;
      slotPieces.push(
        `<rect x="${(previousBarX - slotBaseInset).toFixed(2)}" y="${slotY.toFixed(2)}" width="${(barWidth + slotBaseInset * 2).toFixed(2)}" height="${slotBaseH.toFixed(2)}" fill="${mattersPreviousStroke}" opacity="${matterPreviousSlotOpacity}" />`,
        `<rect x="${(currentBarX - slotBaseInset).toFixed(2)}" y="${slotY.toFixed(2)}" width="${(barWidth + slotBaseInset * 2).toFixed(2)}" height="${slotBaseH.toFixed(2)}" fill="${mattersStroke}" opacity="${availableMask[i] ? matterCurrentSlotOpacity : matterCurrentUnavailableSlotOpacity}" />`,
      );
    }
    if (prevVal > 0) {
      const y = yForMat(prevVal);
      const h = Math.max(0.5, baselineY - y);
      barPieces.push(
        `<rect class="cc-bar cc-bar-prev" style="--cc-enter-delay:${bucketDelay}ms" x="${previousBarX.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" fill="${mattersPreviousStroke}" opacity="${matterPreviousBarOpacity}" />`,
      );
    }
    if (availableMask[i] && currVal > 0) {
      const y = yForMat(currVal);
      const h = Math.max(0.5, baselineY - y);
      barPieces.push(
        `<rect class="cc-bar cc-bar-current" style="--cc-enter-delay:${bucketDelay + 45}ms" x="${currentBarX.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${h.toFixed(2)}" fill="${mattersStroke}" opacity="${matterCurrentBarOpacity}" />`,
      );
    }
  }
  const barsBlock = `${slotPieces.join('')}${barPieces.join('')}`;

  // Enquiries line — current across available prefix, previous across all.
  const availableIndices: number[] = [];
  for (let i = 0; i < availableMask.length; i++) {
    if (availableMask[i]) availableIndices.push(i);
  }
  const enqCurrentPoints = availableIndices.map((i) => ({ x: xAt(i), y: yForEnq(enqCurrent[i]) }));
  const enqPreviousPoints = allBuckets.map((_, i) => ({ x: xAt(i), y: yForEnq(enqPrevious[i]) }));
  const hasEnqCurrent = enqCurrentPoints.length >= 2;
  const enqCurrentD = hasEnqCurrent ? buildSmoothPathD(enqCurrentPoints, smoothing) : '';
  const enqPreviousD = enqPrevious.some((v) => v > 0)
    ? buildSmoothPathD(enqPreviousPoints, smoothing)
    : '';
  const enquiryStemPieces = enqCurrentPoints
    .map((point, index) => {
      const bucketIndex = availableIndices[index];
      if (enqCurrent[bucketIndex] <= 0) return '';
      return `<line class="cc-enq-stem" x1="${point.x.toFixed(2)}" y1="${point.y.toFixed(2)}" x2="${point.x.toFixed(2)}" y2="${baselineY.toFixed(2)}" stroke="${enquiriesStroke}" stroke-width="${enquiryStemWidth}" stroke-linecap="round" opacity="${enquiryStemOpacity}" />`;
    })
    .join('');
  // 2026-04-24: when the current period is live (there are future buckets
  // still to come), pulse the terminal dot to signal real-time data. Two
  // concentric rings expand + fade under the solid marker. Pure SVG
  // <animate> so it works without external CSS or requiring the SVG to be
  // inlined — it even animates inside a string-injected markup.
  const hasFuture = availableMask.some((a) => !a);
  const isLive = !quietDensity && hasFuture && (hasEnqCurrent || enqCurrentPoints.length === 1);
  const enqTerminal =
    hasEnqCurrent || enqCurrentPoints.length === 1
      ? (() => {
          const last = enqCurrentPoints[enqCurrentPoints.length - 1];
          const cx = last.x.toFixed(2);
          const cy = last.y.toFixed(2);
          if (!isLive) {
            return `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${enquiriesStroke}" opacity="0.95" />`;
          }
          return [
            // Expanding pulse ring (fades as it grows).
            `<circle cx="${cx}" cy="${cy}" r="2.5" fill="none" stroke="${enquiriesStroke}" stroke-width="1">`,
            `<animate attributeName="r" values="2.5;8" dur="1.8s" repeatCount="indefinite" />`,
            `<animate attributeName="opacity" values="0.7;0" dur="1.8s" repeatCount="indefinite" />`,
            `</circle>`,
            // Second ring offset by half the cycle for a steadier rhythm.
            `<circle cx="${cx}" cy="${cy}" r="2.5" fill="none" stroke="${enquiriesStroke}" stroke-width="1">`,
            `<animate attributeName="r" values="2.5;8" dur="1.8s" begin="-0.9s" repeatCount="indefinite" />`,
            `<animate attributeName="opacity" values="0.5;0" dur="1.8s" begin="-0.9s" repeatCount="indefinite" />`,
            `</circle>`,
            // Solid core (gently breathes).
            `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${enquiriesStroke}" opacity="0.95">`,
            `<animate attributeName="opacity" values="0.95;0.65;0.95" dur="1.8s" repeatCount="indefinite" />`,
            `</circle>`,
          ].join('');
        })()
      : '';

  const linePieces = `
    ${enquiryStemPieces}
    ${enqPreviousD ? `<path d="${enqPreviousD}" fill="none" stroke="${enquiriesPreviousStroke}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2.5,2.5" opacity="${enquiryPreviousLineOpacity}" />` : ''}
    ${hasEnqCurrent ? `<path d="${enqCurrentD}" fill="none" stroke="${enquiriesStroke}" stroke-width="${enquiryCurrentLineWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="0.95" />` : ''}
    ${enqTerminal}
  `;
  const previousPointMarkers = enqPreviousD
    ? enqPreviousPoints
        .map((point, index) => {
          if (enqPrevious[index] <= 0) return '';
          return `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="1.7" fill="${tooltipBg}" stroke="${enquiriesPreviousStroke}" stroke-width="1" opacity="0.68" />`;
        })
        .join('')
    : '';
  const currentPointMarkers = enqCurrentPoints.length > 0
    ? enqCurrentPoints
        .map((point, index) => {
          const isTerminalPoint = index === enqCurrentPoints.length - 1;
          const bucketIndex = availableIndices[index];
          if (isTerminalPoint || enqCurrent[bucketIndex] <= 0) return '';
          return `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${enquiryMarkerRadius}" fill="${enquiriesStroke}" stroke="${tooltipBg}" stroke-width="1.1" opacity="0.98" />`;
        })
        .join('')
    : '';
  const pointMarkers = `${previousPointMarkers}${currentPointMarkers}`;

  // Ghost future dots on the baseline (same convention as single-metric chart).
  const ghostDots = futureBucketMarker
    ? allBuckets
        .map((_, i) => {
          if (availableMask[i]) return '';
          const x = xAt(i).toFixed(2);
          const y = (baselineY - 1).toFixed(2);
          return `<circle cx="${x}" cy="${y}" r="1.5" fill="${enquiriesStroke}" opacity="0.32" />`;
        })
        .join('')
    : '';

  // Today rule at the terminal endpoint when there's pending future.
  // (`hasFuture` computed earlier for the live-pulse check.)
  const todayRule =
    futureBucketMarker && hasFuture && (hasEnqCurrent || enqCurrentPoints.length === 1)
      ? (() => {
          const x = enqCurrentPoints[enqCurrentPoints.length - 1].x.toFixed(2);
          return `<line x1="${x}" y1="${padYTop}" x2="${x}" y2="${baselineY}" stroke="${enquiriesStroke}" stroke-width="0.6" stroke-dasharray="1.5,2" opacity="0.28" />`;
        })()
      : '';

  // Axis labels. Dual y-axis readout: enquiries max on the left, matters max
  // on the right. Keeps each series' scale legible without drawing two full
  // axes.
  const axisLeftFill = enquiriesStroke;
  const axisRightFill = mattersStroke;
  const yAxisEnqLabel = `<text x="${leftAxisTextX.toFixed(2)}" y="${(padYTop + 4).toFixed(2)}" font-size="8.5" font-weight="700" fill="${axisLeftFill}" opacity="0.7" font-family="inherit" letter-spacing="0.02em" text-anchor="end">${escapeXml(String(enqMax))}</text>`;
  // 2026-04-24: middle y-axis tick on the left (enquiries) so the scale
  // reads as 0 / mid / max rather than just the two endpoints. Skipped if
  // the rounded mid would collide with 0 or max (e.g. enqMax === 1) or if
  // the axis has no real range.
  const enqMidValue = Math.round(enqMax / 2);
  const yAxisEnqMid = enqMax > 1 && enqMidValue > 0 && enqMidValue < enqMax
    ? `<text x="${leftAxisTextX.toFixed(2)}" y="${(padYTop + innerHeight / 2 + 3).toFixed(2)}" font-size="8" font-weight="600" fill="${axisMutedFill}" opacity="0.88" font-family="inherit" letter-spacing="0.02em" text-anchor="end">${escapeXml(String(enqMidValue))}</text>`
    : '';
  const yAxisEnqZero = `<text x="${leftAxisTextX.toFixed(2)}" y="${(baselineY - 1).toFixed(2)}" font-size="8" font-weight="600" fill="${axisMutedFill}" opacity="0.88" font-family="inherit" text-anchor="end">0</text>`;
  const yAxisMatLabel = `<text x="${rightAxisTextX.toFixed(2)}" y="${(padYTop + 4).toFixed(2)}" font-size="8.5" font-weight="700" fill="${axisRightFill}" opacity="0.7" font-family="inherit" letter-spacing="0.02em" text-anchor="start">${escapeXml(String(matMax))}</text>`;
  const yAxisMatZero = `<text x="${rightAxisTextX.toFixed(2)}" y="${(baselineY - 1).toFixed(2)}" font-size="8" font-weight="600" fill="${axisMutedFill}" opacity="0.88" font-family="inherit" text-anchor="start">0</text>`;

  const xAxisLabels = bucketLabels
    ? (() => {
        const edgeLabelInset = compactMode ? 10 : 8;
        const yText = Math.max(8, padYTop - 4).toFixed(2);
        const n = bucketLabels.length;
        const showAllWeekdayLabels = n === 5;
        const pickIndexes = (): number[] => {
          if (n <= 1) return [0];
          if (n === 2) return [0, 1];
          if (n <= 6) return [0, Math.floor((n - 1) / 2), n - 1];
          return [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1];
        };
        const indexes = showAllWeekdayLabels
          ? Array.from({ length: n }, (_, index) => index)
          : Array.from(new Set(pickIndexes())).sort((a, b) => a - b);
        return indexes
          .map((i) => {
            const raw = bucketLabels[i];
            if (!raw) return '';
            const isFirst = i === 0;
            const isLast = i === n - 1;
            const x = showAllWeekdayLabels
              ? xAt(i)
              : isFirst
                ? padXLeft + edgeLabelInset
                : isLast
                  ? padXLeft + innerWidth - edgeLabelInset
                  : xAt(i);
            const anchor = showAllWeekdayLabels
              ? 'middle'
              : isFirst
                ? 'start'
                : isLast
                  ? 'end'
                  : 'middle';
            return `<text x="${x.toFixed(2)}" y="${yText}" font-size="8.5" font-weight="600" fill="${xAxisLabelFill}" font-family="inherit" letter-spacing="0.03em" text-anchor="${anchor}">${escapeXml(raw)}</text>`;
          })
          .join('');
      })()
    : '';

  // Joint hover tooltip per bucket. Chip shows 4 summary rows plus a matter
  // ref breakdown for the hovered bucket. Placement uses the same clamp rules
  // as the single chart so it can never clip the viewBox.
  const chartId = nextPocketChartId();
  const combinedBarGrowName = `${chartId}-bar-grow`;
  const styleBlock = `<style>
    .${chartId} .cc-tip { opacity: 0; transition: opacity 160ms ease-out; pointer-events: none; }
    .${chartId} .cc-col:hover .cc-tip,
    .${chartId} .cc-col:focus-within .cc-tip { opacity: 1; }
    .${chartId} .cc-hit { cursor: default; }
    .${chartId} .cc-enq-stem { vector-effect: non-scaling-stroke; }
    .${chartId} .cc-bar {
      transform-box: fill-box;
      transform-origin: center bottom;
      animation: ${combinedBarGrowName} 340ms cubic-bezier(0.22, 1, 0.36, 1) var(--cc-enter-delay, 0ms) both;
    }
    @keyframes ${combinedBarGrowName} {
      from { transform: scaleY(0.01); }
      to { transform: scaleY(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .${chartId} .cc-bar { animation: none; }
    }
  </style>`;

  const interactionBlock = allBuckets
    .map((bucket, i) => {
      const cx = xAt(i);
      const colX = count > 1 ? Math.max(padXLeft, cx - colWidth / 2) : padXLeft;
      const colW = count > 1 ? colWidth : innerWidth;
      const enqCur = enqCurrent[i];
      const enqPrev = enqPrevious[i];
      const matCur = matCurrent[i];
      const matPrev = matPrevious[i];
      const isAvailable = availableMask[i];
      const dotY = isAvailable ? yForEnq(enqCur) : baselineY - 1;
      const label = bucketLabels ? bucketLabels[i] : (bucket.label ?? '');
      const currentMatterLines = buildMatterDetailLines(bucket.currentMatterDetails, matCur, !isAvailable);
      const previousMatterLines = buildMatterDetailLines(bucket.previousMatterDetails, matPrev);

      // Chip geometry — 4 summary rows + matter ref detail block.
      const headerH = label ? 12 : 0;
      const rowH = 10;
      const chipPadY = 5;
      const detailLineH = 9;
      const detailBlockH = 34 + detailLineH * (currentMatterLines.length + previousMatterLines.length);
      const chipH = chipPadY * 2 + headerH + rowH * 4 + detailBlockH + 6;
      const chipW = 224;
      const chipMarginX = 4;
      const rawChipX = cx - chipW / 2;
      const chipX = Math.max(chipMarginX, Math.min(width - chipW - chipMarginX, rawChipX));
      const aboveY = dotY - chipH - 8;
      const belowY = dotY + 8;
      const spaceAbove = dotY - padYTop;
      const spaceBelow = height - dotY;
      let chipY: number;
      if (aboveY >= 2) chipY = aboveY;
      else if (belowY + chipH <= height - 2) chipY = belowY;
      else chipY = spaceAbove >= spaceBelow ? Math.max(2, aboveY) : Math.min(height - chipH - 2, belowY);
      chipY = Math.max(2, Math.min(height - chipH - 2, chipY));

      const textLeftX = chipX + 8;
      const textRightX = chipX + chipW - 8;
      const headerY = chipY + chipPadY + 9;
      const bodyStartY = chipY + chipPadY + headerH + 9;
      const enqCurY = bodyStartY;
      const enqPrevY = enqCurY + rowH;
      const matCurY = enqPrevY + rowH;
      const matPrevY = matCurY + rowH;
      const detailDividerY = matPrevY + 6;
      const detailTitleY = detailDividerY + 10;
      const currentDetailLabelY = detailTitleY + 11;
      const currentDetailStartY = currentDetailLabelY + 8;
      const previousDetailLabelY = currentDetailStartY + currentMatterLines.length * detailLineH + 7;
      const previousDetailStartY = previousDetailLabelY + 8;

      const headerLine = label
        ? `<text x="${(chipX + chipW / 2).toFixed(2)}" y="${headerY.toFixed(2)}" font-size="8" font-weight="700" fill="${tooltipMuted}" text-anchor="middle" font-family="inherit" letter-spacing="0.1em">${escapeXml(String(label).toUpperCase())}</text>`
        : '';

      const enqCurDot = `<circle cx="${(textLeftX + 3).toFixed(2)}" cy="${(enqCurY - 3).toFixed(2)}" r="2.5" fill="${enquiriesStroke}" />`;
      const enqPrevDot = `<circle cx="${(textLeftX + 3).toFixed(2)}" cy="${(enqPrevY - 3).toFixed(2)}" r="2.2" fill="${enquiriesPreviousStroke}" opacity="0.65" />`;
      const matCurDot = `<rect x="${(textLeftX).toFixed(2)}" y="${(matCurY - 6).toFixed(2)}" width="6" height="6" fill="${mattersStroke}" opacity="0.92" />`;
      const matPrevDot = `<line x1="${(textLeftX - 0.5).toFixed(2)}" y1="${(matPrevY - 3).toFixed(2)}" x2="${(textLeftX + 6.5).toFixed(2)}" y2="${(matPrevY - 3).toFixed(2)}" stroke="${mattersPreviousStroke}" stroke-width="1.4" stroke-linecap="round" opacity="0.92" />`;

      const enqCurLabelEl = `<text x="${(textLeftX + 10).toFixed(2)}" y="${enqCurY.toFixed(2)}" font-size="8.2" font-weight="700" fill="${tooltipFg}" font-family="inherit">${escapeXml(`Enquiries ${currentLabel}`)}</text>`;
      const enqPrevLabelEl = `<text x="${(textLeftX + 10).toFixed(2)}" y="${enqPrevY.toFixed(2)}" font-size="8" font-weight="600" fill="${tooltipMuted}" font-family="inherit">${escapeXml(`Enquiries ${previousLabel}`)}</text>`;
      const enqCurValEl = isAvailable
        ? `<text x="${textRightX.toFixed(2)}" y="${enqCurY.toFixed(2)}" font-size="9" font-weight="700" fill="${tooltipFg}" text-anchor="end" font-family="inherit">${escapeXml(String(enqCur))}</text>`
        : `<text x="${textRightX.toFixed(2)}" y="${enqCurY.toFixed(2)}" font-size="8" font-weight="600" fill="${tooltipMuted}" text-anchor="end" font-style="italic" font-family="inherit">Pending</text>`;
      const enqPrevValEl = `<text x="${textRightX.toFixed(2)}" y="${enqPrevY.toFixed(2)}" font-size="9" font-weight="600" fill="${tooltipFg}" text-anchor="end" font-family="inherit" opacity="0.78">${escapeXml(String(enqPrev))}</text>`;

      const matCurLabelEl = `<text x="${(textLeftX + 10).toFixed(2)}" y="${matCurY.toFixed(2)}" font-size="8.2" font-weight="700" fill="${tooltipFg}" font-family="inherit">${escapeXml(`Matters ${currentLabel}`)}</text>`;
      const matPrevLabelEl = `<text x="${(textLeftX + 10).toFixed(2)}" y="${matPrevY.toFixed(2)}" font-size="8" font-weight="600" fill="${tooltipMuted}" font-family="inherit">${escapeXml(`Matters ${previousLabel}`)}</text>`;
      const matCurValEl = isAvailable
        ? `<text x="${textRightX.toFixed(2)}" y="${matCurY.toFixed(2)}" font-size="9" font-weight="700" fill="${tooltipFg}" text-anchor="end" font-family="inherit">${escapeXml(String(matCur))}</text>`
        : `<text x="${textRightX.toFixed(2)}" y="${matCurY.toFixed(2)}" font-size="8" font-weight="600" fill="${tooltipMuted}" text-anchor="end" font-style="italic" font-family="inherit">Pending</text>`;
      const matPrevValEl = `<text x="${textRightX.toFixed(2)}" y="${matPrevY.toFixed(2)}" font-size="9" font-weight="600" fill="${tooltipFg}" text-anchor="end" font-family="inherit" opacity="0.78">${escapeXml(String(matPrev))}</text>`;
      const detailDividerEl = `<line x1="${(chipX + 8).toFixed(2)}" y1="${detailDividerY.toFixed(2)}" x2="${(chipX + chipW - 8).toFixed(2)}" y2="${detailDividerY.toFixed(2)}" stroke="${tooltipMuted}" stroke-width="0.7" opacity="0.28" />`;
      const detailTitleEl = `<text x="${textLeftX.toFixed(2)}" y="${detailTitleY.toFixed(2)}" font-size="7.7" font-weight="700" fill="${tooltipMuted}" font-family="inherit" letter-spacing="0.08em">MATTER REFS</text>`;
      const currentDetailLabelEl = `<text x="${textLeftX.toFixed(2)}" y="${currentDetailLabelY.toFixed(2)}" font-size="7.5" font-weight="700" fill="${tooltipFg}" font-family="inherit" letter-spacing="0.05em">${escapeXml(currentLabel.toUpperCase())}</text>`;
      const previousDetailLabelEl = `<text x="${textLeftX.toFixed(2)}" y="${previousDetailLabelY.toFixed(2)}" font-size="7.5" font-weight="700" fill="${tooltipFg}" font-family="inherit" letter-spacing="0.05em">${escapeXml(previousLabel.toUpperCase())}</text>`;
      const currentDetailEls = currentMatterLines
        .map((line, index) => `<text x="${textLeftX.toFixed(2)}" y="${(currentDetailStartY + index * detailLineH).toFixed(2)}" font-size="7.8" font-weight="500" fill="${line === 'Pending' || line === 'None' ? tooltipMuted : tooltipFg}" font-family="inherit">${escapeXml(line)}</text>`)
        .join('');
      const previousDetailEls = previousMatterLines
        .map((line, index) => `<text x="${textLeftX.toFixed(2)}" y="${(previousDetailStartY + index * detailLineH).toFixed(2)}" font-size="7.8" font-weight="500" fill="${line === 'None' ? tooltipMuted : tooltipFg}" font-family="inherit" opacity="${line === 'None' ? '0.86' : '0.9'}">${escapeXml(line)}</text>`)
        .join('');

      const columnHighlight = `<rect x="${colX.toFixed(2)}" y="${padYTop.toFixed(2)}" width="${colW.toFixed(2)}" height="${innerHeight.toFixed(2)}" fill="${hoverGuideFill}" />`;
      const guide = `<line x1="${cx.toFixed(2)}" y1="${padYTop.toFixed(2)}" x2="${cx.toFixed(2)}" y2="${baselineY.toFixed(2)}" stroke="${hoverGuideStroke}" stroke-width="0.8" stroke-dasharray="1.5,2" opacity="0.7" />`;
      const dot = isAvailable
        ? `<circle cx="${cx.toFixed(2)}" cy="${dotY.toFixed(2)}" r="2.8" fill="${enquiriesStroke}" stroke="${tooltipBg}" stroke-width="1" />`
        : '';

      const tipRect = `<rect x="${chipX.toFixed(2)}" y="${chipY.toFixed(2)}" width="${chipW}" height="${chipH}" rx="2" ry="2" fill="${tooltipBg}" stroke="${enquiriesStroke}" stroke-width="0.5" stroke-opacity="0.5" />`;

      const ariaLabel = `${label ? `${label}: ` : ''}Enquiries ${currentLabel} ${isAvailable ? enqCur : 'pending'}, ${previousLabel} ${enqPrev}. Matters ${currentLabel} ${isAvailable ? matCur : 'pending'}, ${previousLabel} ${matPrev}. Matter refs ${currentLabel}: ${currentMatterLines.join(', ')}. ${previousLabel}: ${previousMatterLines.join(', ')}.`;
      // No native <title>: the chart already renders its own tooltip on hover.
      // Including <title> caused the browser to layer a Windows-style tooltip
      // on top of the bespoke one (2026-04-27 polish).
      const hit = `<rect class="cc-hit" x="${colX.toFixed(2)}" y="0" width="${colW.toFixed(2)}" height="${height}" fill="transparent" aria-label="${escapeXml(ariaLabel)}" />`;

      return `<g class="cc-col">${hit}<g class="cc-tip">${columnHighlight}${guide}${dot}${tipRect}${headerLine}${enqCurDot}${enqPrevDot}${matCurDot}${matPrevDot}${enqCurLabelEl}${enqPrevLabelEl}${enqCurValEl}${enqPrevValEl}${matCurLabelEl}${matPrevLabelEl}${matCurValEl}${matPrevValEl}${detailDividerEl}${detailTitleEl}${currentDetailLabelEl}${currentDetailEls}${previousDetailLabelEl}${previousDetailEls}</g></g>`;
    })
    .join('');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="${chartId}" role="img">
    ${styleBlock}
    ${plotBackplate}
    ${bucketBands}
    ${baselineStrip}
    ${gridLines}
    ${barsBlock}
    ${linePieces}
    ${pointMarkers}
    ${ghostDots}
    ${todayRule}
    ${yAxisEnqLabel}
    ${yAxisEnqMid}
    ${yAxisEnqZero}
    ${yAxisMatLabel}
    ${yAxisMatZero}
    ${xAxisLabels}
    ${interactionBlock}
  </svg>`;
}
