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

const NARROW_MAX = 320;
const STANDARD_MAX = 480;

export function resolveBreakpoint(width: number): ConversionBreakpoint {
  if (width < NARROW_MAX) return 'narrow';
  if (width < STANDARD_MAX) return 'standard';
  return 'wide';
}
