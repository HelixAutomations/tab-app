/**
 * WayfindingOverlay — dev-only visual aid that outlines every
 * `[data-helix-region]` element with its name. Toggle with Ctrl+Shift+H.
 *
 * Why: when an agent shares the same browser window as the operator and
 * needs to point at a UI region ("click on home/calls-and-notes"), this
 * overlay provides the visual key that maps stable region names to
 * on-screen rectangles.
 *
 * Production safety: this component is only mounted when
 * `process.env.NODE_ENV !== 'production'`. The overlay never touches app
 * state — it reads the DOM and renders fixed, non-interactive labels above
 * everything else.
 */
import React, { useEffect, useState } from 'react';

interface RegionBox {
  name: string;
  rect: DOMRect;
}

const overlayBoxStyle = (rect: DOMRect): React.CSSProperties => ({
  position: 'fixed',
  top: rect.top,
  left: rect.left,
  width: rect.width,
  height: rect.height,
  border: '1px dashed rgba(135, 243, 243, 0.85)', // colours.accent
  background: 'rgba(54, 144, 206, 0.04)', // colours.highlight at very low opacity
  pointerEvents: 'none',
  zIndex: 2147483646,
  boxSizing: 'border-box',
});

const labelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  background: '#061733', // colours.darkBlue
  color: '#87F3F3', // colours.accent
  font: '11px/1.4 "Raleway", sans-serif',
  padding: '2px 6px',
  borderRadius: 0,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
};

const hintStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 8,
  right: 8,
  background: '#061733',
  color: '#87F3F3',
  font: '11px/1.4 "Raleway", sans-serif',
  padding: '4px 8px',
  borderRadius: 0,
  pointerEvents: 'none',
  zIndex: 2147483647,
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
};

function readRegions(): RegionBox[] {
  if (typeof document === 'undefined') return [];
  const nodes = document.querySelectorAll<HTMLElement>('[data-helix-region]');
  const boxes: RegionBox[] = [];
  nodes.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (rect.bottom < 0 || rect.right < 0) return;
    if (rect.top > window.innerHeight || rect.left > window.innerWidth) return;
    boxes.push({ name: el.dataset.helixRegion || 'unknown', rect });
  });
  return boxes;
}

export const WayfindingOverlay: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [boxes, setBoxes] = useState<RegionBox[]>([]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'H' || e.key === 'h')) {
        e.preventDefault();
        setEnabled((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let raf: number | null = null;
    const tick = () => {
      setBoxes(readRegions());
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (raf !== null) window.cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      {boxes.map((b, i) => (
        <div key={`${b.name}:${i}`} style={overlayBoxStyle(b.rect)}>
          <span style={labelStyle}>{b.name}</span>
        </div>
      ))}
      <div style={hintStyle}>Wayfinding · Ctrl+Shift+H to hide</div>
    </>
  );
};

export default WayfindingOverlay;
