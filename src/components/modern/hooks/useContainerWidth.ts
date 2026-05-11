// Phase F4 — single source of truth for the Conversion panel's responsive
// breakpoints. Consumers observe their own element (OperationsDashboard
// coalesces the dashboard + conversion card + conversion rail under one
// ResizeObserver) and then call `resolveBreakpoint` to decide layout.
//
// 2026-04-21: the previous `useContainerWidth()` hook is gone — it emitted a
// pixel-precise `width` that encouraged per-pixel re-renders. Downstream
// consumers now keep only coarse breakpoint state. This file is kept as the
// single place the NARROW_MAX / STANDARD_MAX thresholds live.

export type ConversionBreakpoint = 'narrow' | 'standard' | 'wide';

export interface ResponsiveBand<TMode extends string> {
  mode: TMode;
  max: number;
}

const NARROW_MAX = 320;
const STANDARD_MAX = 480;

export function resolveBreakpoint(width: number): ConversionBreakpoint {
  if (width < NARROW_MAX) return 'narrow';
  if (width < STANDARD_MAX) return 'standard';
  return 'wide';
}

export function resolveResponsiveBand<TMode extends string>(
  width: number,
  currentMode: TMode,
  bands: readonly ResponsiveBand<TMode>[],
  hysteresisPx = 16,
): TMode {
  if (bands.length === 0) return currentMode;

  const currentIndex = bands.findIndex((band) => band.mode === currentMode);
  const safeCurrentIndex = currentIndex >= 0 ? currentIndex : bands.length - 1;
  const rawIndex = bands.findIndex((band) => width <= band.max);
  const nextIndex = rawIndex >= 0 ? rawIndex : bands.length - 1;

  if (nextIndex === safeCurrentIndex) {
    return currentMode;
  }

  if (nextIndex < safeCurrentIndex) {
    const lowerBand = bands[safeCurrentIndex - 1];
    if (!lowerBand || width <= lowerBand.max - hysteresisPx) {
      return bands[nextIndex].mode;
    }
    return currentMode;
  }

  const currentBand = bands[safeCurrentIndex];
  if (!currentBand || width > currentBand.max + hysteresisPx) {
    return bands[nextIndex].mode;
  }

  return currentMode;
}
