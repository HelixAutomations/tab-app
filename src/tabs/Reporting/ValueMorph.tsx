/**
 * ValueMorph — animates a value transition (e.g. drift £52,840 → £0) over
 * a short duration. Reserves width on first paint to avoid layout shift,
 * and degrades to an instant swap when the user prefers reduced motion.
 *
 * Used by the trust gate to confirm a successful remediation visually
 * without making a noisy success state.
 */

import React, { useEffect, useRef, useState } from 'react';

export interface ValueMorphProps {
  from: number;
  to: number;
  /** Formatter applied to the interpolated value each frame. */
  format?: (n: number) => string;
  /** Duration in ms. Default 600. */
  durationMs?: number;
  /** Optional className for the wrapping span. */
  className?: string;
  style?: React.CSSProperties;
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString('en-GB');

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const ValueMorph: React.FC<ValueMorphProps> = ({
  from,
  to,
  format = defaultFormat,
  durationMs = 600,
  className,
  style,
}) => {
  const [display, setDisplay] = useState<number>(from);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(to);
      return;
    }
    const startVal = display;
    startedAtRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - (startedAtRef.current ?? now);
      const t = Math.min(1, elapsed / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const v = startVal + (to - startVal) * eased;
      setDisplay(v);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, durationMs]);

  // Reserve the wider of the two strings so the layout doesn't shift mid-morph.
  const widthSample = format(Math.abs(from) > Math.abs(to) ? from : to);

  return (
    <span
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        minWidth: `${widthSample.length}ch`,
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {format(display)}
    </span>
  );
};

export default ValueMorph;
