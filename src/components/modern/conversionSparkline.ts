// Pure helper: renders a subtle inline sparkline SVG string for a conversion
// series. Kept free of React so it can be unit-tested and inlined cheaply.
//
// Used by the Conversion panel (Phase C) in place of the full renderConversionChart
// for the banded ENQUIRIES / MATTERS sections. Intentionally minimal: no axes,
// no tooltips, no previous-period overlay. Supporting graphic only.

export interface ConversionSparklineBucket {
  currentEnquiries?: number;
  currentMatters?: number;
  isFuture?: boolean;
  currentAvailable?: boolean;
  isCurrentEndpoint?: boolean;
}

export interface ConversionSparklineOptions {
  width?: number;
  height?: number;
  stroke: string;
  fill?: string | null;
  strokeWidth?: number;
  opacity?: number;
}

/**
 * Build an inline SVG string for a single metric's series across the buckets.
 * Zero values render as a flat line at the baseline.
 */
export function buildConversionSparklineSVG(
  buckets: ConversionSparklineBucket[],
  metric: 'enquiries' | 'matters',
  opts: ConversionSparklineOptions,
): string {
  const width = opts.width ?? 72;
  const height = opts.height ?? 18;
  const strokeWidth = opts.strokeWidth ?? 1.25;
  const opacity = opts.opacity ?? 0.7;
  const padY = 1.5;
  const usable = buckets.filter((b) => b.currentAvailable !== false);
  const series = (usable.length > 0 ? usable : buckets).map((b) =>
    metric === 'enquiries' ? Number(b.currentEnquiries || 0) : Number(b.currentMatters || 0),
  );

  if (series.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>`;
  }

  const max = Math.max(1, ...series);
  const stepX = series.length > 1 ? width / (series.length - 1) : 0;
  const points = series.map((value, index) => {
    const x = series.length === 1 ? width / 2 : index * stepX;
    const ratio = value / max;
    const y = height - padY - ratio * (height - padY * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const pathD = `M${points.join(' L')}`;
  const fillPath = opts.fill
    ? `<path d="${pathD} L${width.toFixed(2)},${height - padY} L0,${height - padY} Z" fill="${opts.fill}" opacity="${opacity * 0.35}" />`
    : '';

  const lastPoint = points[points.length - 1];
  const [lastX, lastY] = lastPoint.split(',').map(Number);

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${fillPath}
    <path d="${pathD}" fill="none" stroke="${opts.stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" />
    <circle cx="${lastX.toFixed(2)}" cy="${lastY.toFixed(2)}" r="${strokeWidth + 0.4}" fill="${opts.stroke}" opacity="${opacity}" />
  </svg>`;
}
