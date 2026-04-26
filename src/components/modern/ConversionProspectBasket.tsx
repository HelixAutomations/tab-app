import React from 'react';
import { createPortal } from 'react-dom';
import { FiChevronDown, FiChevronUp, FiExternalLink, FiArrowUpRight } from 'react-icons/fi';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { colours } from '../../app/styles/colours';
import type { ConversionBreakpoint } from './hooks/useContainerWidth';
import clioIcon from '../../assets/clio.svg';
import activecampaignIcon from '../../assets/activecampaign.svg';

// Phase D (post-Phase-C): demoted to a quiet *trail* rather than an
// interactive chip index. Intent: a summary of recent stream rhythm that
// the eye skims — volume, colour mix, opened-vs-not — without inviting
// interaction on individual items. The section itself (hover chevron in
// `OperationsDashboard.tsx`) carries the drilldown affordance.
//
// Phase F3 (2026-04-20): bezel-ify the trail into an AoW "roulette" — a
// soft-bordered pill per recent run, `[icon + lastname]`, with the AoW
// colour tinting both border and fill. Density adapts via the
// `breakpoint` prop (icon-only on narrow).

export interface ConversionProspectChipItem {
  id: string;
  /** Short, privacy-redacted label — "Smith" (last name only for the trail). */
  displayName: string;
  /** Optional fee-earner prefix (ignored in the trail render — kept on the type for future re-use). */
  feeEarnerInitials?: string;
  /** Area of Work label used for colouring via aowColor(). */
  aow: string;
  /** True for matter chips (renders a small tick glyph before the dot). */
  matterOpened?: boolean;
  /** Full (unredacted) name for the stream preview modal (D3). Optional — modal falls back to displayName when absent. */
  fullName?: string;
  /** ISO timestamp or formatted string for the stream preview modal (D3). */
  occurredAt?: string;
  /** 2026-04-20: matter display number for matter trail labels (replaces the
   *  surname approach, which doesn't work for company clients). */
  displayNumber?: string;
  /** 2026-04-20: Clio numeric matter id → builds the hover-revealed deep link. */
  clioMatterId?: string;
  /** 2026-04-24: enquiry ACID — shown as subtle secondary text on the hover
   *  pill for enquiry bezels. Ignored for matter chips. */
  acid?: string;
}

type Section = 'enquiries' | 'matters';

export interface ConversionProspectBasketProps {
  items: ConversionProspectChipItem[];
  section: Section;
  aowColor: (aow: string) => string;
  /** 2026-04-20: canonical AoW category resolver — ensures the glyph matches
   *  the colour even when the incoming `aow` is a specific worktype
   *  (e.g. "Contract Dispute" → construction). Falls back to substring
   *  matching on the raw string when absent. */
  resolveAowCategory?: (aow: string) => 'commercial' | 'construction' | 'property' | 'employment' | 'other';
  isDarkMode: boolean;
  maxVisible?: number;
  /** Retained in the prop shape for future re-use; ignored by the trail. */
  onOpenProspect?: (item: ConversionProspectChipItem) => void;
  /** Retained in the prop shape for future re-use; ignored by the trail. */
  onOpenAll?: () => void;
  animate?: boolean;
  /** Phase F4: container breakpoint controls bezel density. */
  breakpoint?: ConversionBreakpoint;
  /** True when the section's inline ledger is expanded — flips the overflow chevron. */
  overflowExpanded?: boolean;
  /** Called when the user clicks the overflow chevron (or the `+X` stamp). */
  onOverflowToggle?: () => void;
  /** 2026-04-20: when `items` is empty but the section *should* have content
   *  (e.g. demo-mode totals say 18 enquiries but the prospect list is empty),
   *  render this many neutral skeleton chips instead of the "No X yet" text.
   *  Keeps the UI truthful to the counter — the user sees that chips exist,
   *  just not their identities. Ignored when `items.length > 0`. */
  placeholderCount?: number;
}

const CHIP_ANIM_ID = 'conv-prospect-chip-styles';
const CHIP_RESIZE_TRANSITION_MS = 180;

function ensureChipStyles() {
  if (typeof document === 'undefined') return;
  if (document.head.querySelector(`style[data-${CHIP_ANIM_ID}]`)) return;
  const s = document.createElement('style');
  s.setAttribute(`data-${CHIP_ANIM_ID}`, '');
  s.textContent = `
    @keyframes convProspectTrailIn {
      from { opacity: 0; transform: translateY(1px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes conv-prospect-skeleton {
      0%, 100% { opacity: 0.55; }
      50%      { opacity: 0.90; }
    }
    .conv-prospect-trail { scrollbar-width: none; }
    .conv-prospect-trail::-webkit-scrollbar { display: none; }
    .conv-prospect-chip-shell {
      display: inline-flex;
      flex-shrink: 0;
      /* overflow-x clips horizontally so chips don't spill the trail; overflow-y
         stays visible so the matter hover tooltip can escape upward without
         being clipped during enter/exit max-width animation. */
      overflow-x: clip;
      overflow-y: visible;
      transform-origin: left center;
      will-change: max-width, opacity, transform;
    }
    .conv-prospect-chip-enter {
      opacity: 0;
      transform: translateY(1px) scale(0.985);
      max-width: 0 !important;
    }
    .conv-prospect-chip-enter-active {
      opacity: 1;
      transform: translateY(0) scale(1);
      max-width: var(--conv-chip-width) !important;
      transition: max-width 180ms ease, opacity 140ms ease, transform 140ms ease;
    }
    .conv-prospect-chip-exit {
      opacity: 1;
      transform: translateY(0) scale(1);
      max-width: var(--conv-chip-width) !important;
    }
    .conv-prospect-chip-exit-active {
      opacity: 0;
      transform: translateY(-1px) scale(0.985);
      max-width: 0 !important;
      transition: max-width 160ms ease, opacity 120ms ease, transform 120ms ease;
    }
    /*
     * 2026-04-20: matter bezels with a Clio link swap their icon + label on
     * hover. Both layers live in a single grid cell so the cell's footprint
     * is locked to the larger of the two — the bezel width never changes
     * mid-hover (no jank on neighbours). Crossfade is opacity-only.
     */
    .conv-prospect-stack {
      display: inline-grid;
      grid-template-areas: 'stack';
      align-items: center;
      justify-items: start;
    }
    .conv-prospect-stack > * {
      grid-area: stack;
      transition: opacity 160ms ease-out;
    }
    .conv-prospect-stack > .rest { opacity: 1; }
    .conv-prospect-stack > .hover { opacity: 0; }
    .conv-prospect-bezel.has-clio:hover .conv-prospect-stack > .rest,
    .conv-prospect-bezel.has-clio:focus-visible .conv-prospect-stack > .rest { opacity: 0; }
    .conv-prospect-bezel.has-clio:hover .conv-prospect-stack > .hover,
    .conv-prospect-bezel.has-clio:focus-visible .conv-prospect-stack > .hover { opacity: 1; }
    .conv-prospect-bezel.has-clio { cursor: pointer; transition: background 160ms ease-out, border-color 160ms ease-out; }
    /*
     * 2026-04-24 (rev 2): hover details now live in a portal-rendered
     * popover above the chip (.conv-pop). The popover positions itself
     * relative to the chip's viewport rect, clamps to the screen edges,
     * and auto-flips below if there's no room above. A 180ms grace period
     * on leave lets the user move pointer onto the popover without it
     * disappearing (so action buttons are reachable).
     */
    .conv-pop {
      position: fixed;
      z-index: 1000;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(2px);
      transition: opacity 140ms ease-out, transform 160ms ease-out;
      will-change: opacity, transform;
    }
    .conv-pop.is-open { opacity: 1; transform: translateY(0); }
    .conv-pop-action {
      display: inline-flex; align-items: center; gap: 5px;
      height: 22px; padding: 0 8px;
      font-size: 9.5px; font-weight: 700;
      letter-spacing: 0.06em; text-transform: uppercase;
      border-radius: 0; cursor: pointer;
      transition: background 140ms ease-out, border-color 140ms ease-out, color 140ms ease-out;
      white-space: nowrap; user-select: none;
    }
    .conv-pop-action:focus-visible { outline: 1px solid currentColor; outline-offset: 1px; }
  `;
  document.head.appendChild(s);
}

/**
 * Phase F3: 14px AoW glyphs. Mirrors the SVGs in
 * SessionFiltersSection.tsx so the visual vocabulary stays consistent
 * across the app without spinning up a shared import.
 *
 * 2026-04-20: accepts an optional `category` (resolved upstream from the
 * canonical worktype→AoW map). When present, category wins over the raw
 * `area` string — this fixes matter bezels which were falling back to the
 * info circle because their `aow` carried a specific worktype like
 * "Contract Dispute" rather than a top-level AoW.
 */
type AowCategory = 'commercial' | 'construction' | 'property' | 'employment' | 'other';

const AowIcon: React.FC<{ area: string; colour: string; size?: number; category?: AowCategory }> = ({ area, colour, size = 14, category }) => {
  const a = (area || '').toLowerCase();
  const resolved: AowCategory = category
    ?? (a.includes('commercial') ? 'commercial'
      : a.includes('construction') ? 'construction'
      : a.includes('property') ? 'property'
      : a.includes('employment') ? 'employment'
      : 'other');
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: colour, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (resolved === 'commercial') {
    return <svg {...p}><rect x="4" y="2" width="16" height="20" rx="1"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><rect x="9" y="18" width="6" height="4"/></svg>;
  }
  if (resolved === 'construction') {
    return <svg {...p}><path d="M2 20h20"/><path d="M5 20V8l7-5 7 5v12"/><line x1="9" y1="20" x2="9" y2="12"/><line x1="15" y1="20" x2="15" y2="12"/></svg>;
  }
  if (resolved === 'property') {
    return <svg {...p}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
  }
  if (resolved === 'employment') {
    return <svg {...p}><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>;
  }
  return <svg {...p}><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16.01"/></svg>;
};

/**
 * 2026-04-20: Clio brand glyph rendered from the canonical asset (same
 * `assets/clio.svg` used by Resources, MatterTableView, MatterOperations,
 * etc). The asset is dark-on-transparent; in dark mode invert via filter
 * so it reads on the dark bezel fill. No tint — Clio brand is a fixed
 * mark and should not pick up the AoW colour.
 */
const ClioMarkImg: React.FC<{ size?: number; isDarkMode: boolean }> = ({ size = 13, isDarkMode }) => (
  <img
    src={clioIcon}
    alt=""
    aria-hidden="true"
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      display: 'block',
      filter: isDarkMode ? 'brightness(0) invert(1)' : undefined,
    }}
  />
);

// Same treatment as ProspectHeroHeader: AC mark forced white in dark mode
// so it reads on the dark surface, untouched in light mode.
const AcMarkImg: React.FC<{ size?: number; isDarkMode: boolean }> = ({ size = 13, isDarkMode }) => (
  <img
    src={activecampaignIcon}
    alt=""
    aria-hidden="true"
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      display: 'block',
      filter: isDarkMode ? 'brightness(0) invert(1)' : undefined,
    }}
  />
);

const MatterTick: React.FC<{ colour: string; size?: number }> = ({ colour, size = 8 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    aria-hidden="true"
    style={{ flexShrink: 0, opacity: 0.9 }}
  >
    <path d="M2 6.5 L5 9 L10 3" fill="none" stroke={colour} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Extract the shortest readable token from a redacted display name.
 * Incoming names are already in "F. Lastname" or "Lastname" form, so
 * prefer the last whitespace-separated token. Falls back to the raw
 * string when no whitespace is present.
 */
function toTrailLabel(displayName: string): string {
  const trimmed = (displayName || '').trim();
  if (!trimmed) return '—';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return trimmed;
  // Strip a trailing period on the last token (shouldn't happen but defensive).
  const last = parts[parts.length - 1].replace(/\.$/, '');
  return last || trimmed;
}

/**
 * Phase F3: convert a hex accent to an rgba string with the supplied alpha.
 * Accepts #rgb, #rrggbb, or rgba()/rgb() inputs (returns them unchanged if
 * already rgba-shaped).
 */
function tintColour(colour: string, alpha: number): string {
  if (!colour) return `rgba(148,163,184,${alpha})`;
  const trimmed = colour.trim();
  if (trimmed.startsWith('rgba') || trimmed.startsWith('rgb(')) return trimmed;
  const hex = trimmed.replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return trimmed;
}

function getOverflowChipWidth(bezelHeight: number, overflowCount: number): number {
  const overflowLen = overflowCount > 0 ? String(`+${overflowCount}`).length : 1;
  return Math.max(bezelHeight, 14 + overflowLen * 6);
}

function numberRecordEqual(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

// 2026-04-24 (rev 2): hover popover renderer. Lives at module scope so the
// chip render path stays cheap. The popover is portalled into document.body
// so it can never be clipped by the trail's `overflow-x: clip` or any
// surrounding card boundary. Positioning happens in a layout effect that
// re-measures the popover after first paint and clamps to the viewport with
// an 8px margin. Vertical placement: prefer-above, flip-below if no room.
type HoverPopoverConfig = {
  section: 'enquiries' | 'matters';
  item: ConversionProspectChipItem;
  anchor: DOMRect;
  open: boolean;
  isDarkMode: boolean;
  accent: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onOpenInApp?: (item: ConversionProspectChipItem) => void;
};

const HoverPopover: React.FC<HoverPopoverConfig> = ({
  section,
  item,
  anchor,
  open,
  isDarkMode,
  accent,
  onMouseEnter,
  onMouseLeave,
  onOpenInApp,
}) => {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState<{ left: number; top: number; placement: 'above' | 'below' } | null>(null);

  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const margin = 8;
    const arrow = 6;
    const pop = node.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const anchorCx = anchor.left + anchor.width / 2;
    let left = anchorCx - pop.width / 2;
    if (left < margin) left = margin;
    if (left + pop.width > vw - margin) left = vw - margin - pop.width;
    const above = anchor.top - pop.height - arrow;
    const below = anchor.bottom + arrow;
    let top: number;
    let placement: 'above' | 'below';
    if (above >= margin) {
      top = above;
      placement = 'above';
    } else if (below + pop.height <= vh - margin) {
      top = below;
      placement = 'below';
    } else {
      // Squeeze: stick to the side with more room.
      const spaceAbove = anchor.top - margin;
      const spaceBelow = vh - anchor.bottom - margin;
      if (spaceAbove >= spaceBelow) {
        top = Math.max(margin, anchor.top - pop.height - arrow);
        placement = 'above';
      } else {
        top = Math.min(vh - margin - pop.height, anchor.bottom + arrow);
        placement = 'below';
      }
    }
    setPos({ left, top, placement });
  }, [anchor.left, anchor.top, anchor.width, anchor.height, item.id]);

  const surface = isDarkMode ? 'rgba(8,28,48,0.98)' : 'rgba(255,255,255,0.99)';
  const surfaceBorder = isDarkMode ? 'rgba(135,243,243,0.28)' : 'rgba(54,144,206,0.24)';
  const text = isDarkMode ? 'rgba(243,244,246,0.96)' : 'rgba(6,23,51,0.92)';
  const muted = isDarkMode ? 'rgba(209,213,219,0.6)' : 'rgba(55,65,81,0.55)';
  const ctaColour = isDarkMode ? colours.accent : colours.highlight;
  const isMatter = section === 'matters';
  const matterLabel = (item.displayNumber || '').trim();
  const enqName = (item.fullName || item.displayName || '').trim();
  const headline = isMatter ? (matterLabel || item.displayName || 'Matter') : (enqName || 'Enquiry');
  const subline = isMatter
    ? (item.fullName ? `${item.fullName} · ${item.aow}` : item.aow)
    : (item.acid ? `${item.acid} · ${item.aow}` : item.aow);
  const clioUrl = isMatter && item.clioMatterId
    ? `https://eu.app.clio.com/nc/#/matters/${item.clioMatterId}`
    : null;
  const acUrl = !isMatter && item.acid
    ? `https://helix-law54533.activehosted.com/app/contacts/${encodeURIComponent(item.acid)}`
    : null;

  const popover = (
    <div
      ref={ref}
      className={`conv-pop${open ? ' is-open' : ''}`}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        minWidth: 180,
        maxWidth: 280,
        padding: '8px 10px 8px',
        background: surface,
        border: `1px solid ${surfaceBorder}`,
        borderRadius: 0,
        boxShadow: isDarkMode ? '0 10px 30px rgba(0,0,0,0.5)' : '0 10px 30px rgba(6,23,51,0.18)',
        color: text,
        fontFamily: 'Raleway, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: isMatter ? 0 : '50%', background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: text, letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFeatureSettings: '"tnum" 1, "lnum" 1' }}>{headline}</span>
      </div>
      <div style={{ fontSize: 10, fontWeight: 500, color: muted, letterSpacing: '0.02em', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subline}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {onOpenInApp ? (
          <button
            type="button"
            className="conv-pop-action"
            onClick={(e) => { e.stopPropagation(); onOpenInApp(item); }}
            style={{
              background: tintColour(ctaColour, isDarkMode ? 0.16 : 0.12),
              border: `1px solid ${tintColour(ctaColour, 0.45)}`,
              color: ctaColour,
            }}
          >
            <FiArrowUpRight size={11} aria-hidden="true" />
            Open in Hub
          </button>
        ) : null}
        {clioUrl ? (
          <a
            href={clioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="conv-pop-action"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(6,23,51,0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(243,244,246,0.18)' : 'rgba(6,23,51,0.18)'}`,
              color: text,
              textDecoration: 'none',
            }}
          >
            <ClioMarkImg size={11} isDarkMode={isDarkMode} />
            Open in Clio
            <FiExternalLink size={10} aria-hidden="true" style={{ opacity: 0.6 }} />
          </a>
        ) : null}
        {acUrl ? (
          <a
            href={acUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="conv-pop-action"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(6,23,51,0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(243,244,246,0.18)' : 'rgba(6,23,51,0.18)'}`,
              color: text,
              textDecoration: 'none',
            }}
          >
            <AcMarkImg size={11} isDarkMode={isDarkMode} />
            Open in ActiveCampaign
            <FiExternalLink size={10} aria-hidden="true" style={{ opacity: 0.6 }} />
          </a>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(popover, document.body);
};

const renderHoverPopover = (config: HoverPopoverConfig) => <HoverPopover {...config} />;

const ConversionProspectBasket: React.FC<ConversionProspectBasketProps> = ({
  items,
  section,
  aowColor,
  resolveAowCategory,
  isDarkMode,
  maxVisible = 8,
  animate = true,
  breakpoint = 'standard',
  overflowExpanded = false,
  onOverflowToggle,
  onOpenProspect,
  placeholderCount,
}) => {
  React.useEffect(() => { ensureChipStyles(); }, []);
  const [overflowHover, setOverflowHover] = React.useState(false);
  const iconOnly = breakpoint === 'narrow';
  const bezelHeight = breakpoint === 'wide' ? 24 : 22;
  const bezelGap = breakpoint === 'wide' ? 7 : 6;
  const labelSize = breakpoint === 'wide' ? 10.5 : 10;
  // 2026-04-24: chips collapse to a square icon-only footprint at rest in
  // every breakpoint now (the label only appears on hover via .has-reveal),
  // so the pre-measurement fallback is bezelHeight \u2014 not the legacy
  // 96px label-chip estimate, which would massively under-fit the basket
  // until layout measurement landed.
  const fallbackChipWidth = bezelHeight;

  // 2026-04-21: measure the trail's own width so the chip cap adapts to the
  // available room rather than the static `maxVisible` cap. Unlike the first
  // pass, this version measures the actual chip widths, so the basket can stop
  // exactly before the `+N` chip would force a real chip to clip underneath it.
  const trailRef = React.useRef<HTMLDivElement | null>(null);
  const [trailWidth, setTrailWidth] = React.useState<number>(0);
  React.useEffect(() => {
    const node = trailRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const apply = (w: number) => setTrailWidth((prev) => (Math.round(prev) === Math.round(w) ? prev : w));
    apply(node.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      apply(e.contentRect.width);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const measureRefs = React.useRef(new Map<string, HTMLSpanElement>());
  const transitionRefs = React.useRef(new Map<string, React.RefObject<HTMLSpanElement | null>>());
  const [chipWidths, setChipWidths] = React.useState<Record<string, number>>({});
  const measuredItems = React.useMemo(
    () => items.slice(0, Math.min(items.length, maxVisible)),
    [items, maxVisible],
  );

  const setMeasureRef = React.useCallback((id: string, node: HTMLSpanElement | null) => {
    if (node) {
      measureRefs.current.set(id, node);
      return;
    }
    measureRefs.current.delete(id);
  }, []);

  const getTransitionRef = React.useCallback((id: string) => {
    const existing = transitionRefs.current.get(id);
    if (existing) {
      return existing;
    }
    const next = React.createRef<HTMLSpanElement>();
    transitionRefs.current.set(id, next);
    return next;
  }, []);

  React.useEffect(() => {
    const validIds = new Set(items.map((item) => item.id));
    for (const key of transitionRefs.current.keys()) {
      if (!validIds.has(key)) {
        transitionRefs.current.delete(key);
      }
    }
  }, [items]);

  React.useLayoutEffect(() => {
    const nextWidths: Record<string, number> = {};
    for (const item of measuredItems) {
      const node = measureRefs.current.get(item.id);
      if (!node) {
        continue;
      }
      nextWidths[item.id] = Math.ceil(node.getBoundingClientRect().width);
    }
    setChipWidths((prev) => (numberRecordEqual(prev, nextWidths) ? prev : nextWidths));
  }, [measuredItems, breakpoint, isDarkMode, section]);

  const visibleCount = React.useMemo(() => {
    const upperBound = Math.min(items.length, maxVisible);
    if (upperBound === 0) {
      return 0;
    }
    if (trailWidth <= 0) {
      return upperBound;
    }

    for (let count = upperBound; count >= 0; count -= 1) {
      const overflowCount = items.length - count;
      const showOverflowControl = overflowCount > 0 || Boolean(onOverflowToggle);
      let totalWidth = 0;

      for (let index = 0; index < count; index += 1) {
        totalWidth += chipWidths[items[index].id] ?? fallbackChipWidth;
      }

      if (count > 1) {
        totalWidth += (count - 1) * bezelGap;
      }

      if (showOverflowControl) {
        if (count > 0) {
          totalWidth += bezelGap;
        }
        totalWidth += getOverflowChipWidth(bezelHeight, overflowCount);
      }

      // 2026-04-24: 2px breathing buffer so sub-pixel rounding never lets the
      // last chip get clipped under the +X / chevron. The trail's overflow:clip
      // would otherwise hide the last 1\u20132px when measurement and layout
      // disagree at fractional widths.
      if (totalWidth + 2 <= trailWidth) {
        return count;
      }
    }

    return 0;
  }, [items, maxVisible, trailWidth, onOverflowToggle, chipWidths, fallbackChipWidth, bezelGap, bezelHeight]);

  const visible = React.useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const overflow = items.length - visible.length;

  // 2026-04-24 (rev 2): hover popover. We track the hovered chip by id and
  // its viewport rect (captured at enter time). The popover renders via a
  // portal so it can never be clipped by the trail's `overflow-x: clip`.
  // Edge handling: the popover prefers to anchor above the chip, but flips
  // below when there's no room. Horizontally it tries centred, then clamps
  // to within an 8px viewport margin. A 180ms grace timer on leave lets the
  // user move pointer onto the popover without it disappearing.
  type HoverState = { id: string; item: ConversionProspectChipItem; rect: DOMRect };
  const [hover, setHover] = React.useState<HoverState | null>(null);
  const [popOpen, setPopOpen] = React.useState(false);
  const enterTimer = React.useRef<number | null>(null);
  const leaveTimer = React.useRef<number | null>(null);
  const cancelTimers = React.useCallback(() => {
    if (enterTimer.current !== null) {
      window.clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);
  const openHover = React.useCallback((item: ConversionProspectChipItem, el: HTMLElement) => {
    cancelTimers();
    const rect = el.getBoundingClientRect();
    enterTimer.current = window.setTimeout(() => {
      setHover({ id: item.id, item, rect });
      // small RAF so the entry transition runs.
      window.requestAnimationFrame(() => setPopOpen(true));
    }, 90);
  }, [cancelTimers]);
  const closeHover = React.useCallback(() => {
    if (enterTimer.current !== null) {
      window.clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
    }
    leaveTimer.current = window.setTimeout(() => {
      setPopOpen(false);
      // Wait for the fade-out before removing the node.
      window.setTimeout(() => setHover((prev) => (prev ? null : prev)), 180);
    }, 180);
  }, []);
  const keepOpen = React.useCallback(() => {
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);
  React.useEffect(() => () => cancelTimers(), [cancelTimers]);

  const renderChipBezel = (item: ConversionProspectChipItem, ref?: React.Ref<HTMLSpanElement>) => {
    const accent = aowColor(item.aow);
    const showTick = section === 'matters' || item.matterOpened;
    const isMatter = section === 'matters';
    const category = resolveAowCategory ? resolveAowCategory(item.aow) : undefined;
    const iconSize = breakpoint === 'wide' ? 14 : 13;

    const matterLabel = (item.displayNumber || '').trim();
    const enqName = (item.fullName || item.displayName || '').trim();
    const titleText = isMatter
      ? `${matterLabel || item.displayName}${item.fullName ? ` · ${item.fullName}` : ''} · ${item.aow}`
      : (enqName ? `${enqName}${item.acid ? ` · ${item.acid}` : ''} · ${item.aow}` : item.aow);

    // Hover handlers shared by both rows. Focus also opens (keyboard a11y).
    const handleEnter = (e: React.MouseEvent<HTMLSpanElement>) => openHover(item, e.currentTarget);
    const handleLeave = () => closeHover();
    const handleFocus = (e: React.FocusEvent<HTMLSpanElement>) => openHover(item, e.currentTarget);
    const handleBlur = () => closeHover();

    if (!isMatter) {
      // Enquiries: subtle icon-only chip. Borderless at rest, faint background
      // tint on hover so the affinity with the popover is obvious.
      const hoverFill = tintColour(accent, isDarkMode ? 0.1 : 0.08);
      const hoverBorder = tintColour(accent, isDarkMode ? 0.32 : 0.28);
      const isHovered = hover?.id === item.id;
      return (
        <span
          key={item.id}
          ref={ref}
          tabIndex={0}
          className="conv-prospect-bezel conv-prospect-bezel--quiet"
          title={titleText}
          aria-label={titleText}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={{
            position: 'relative',
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: bezelHeight,
            width: bezelHeight,
            padding: 0,
            border: `1px solid ${isHovered ? hoverBorder : 'transparent'}`,
            background: isHovered ? hoverFill : 'transparent',
            borderRadius: 0,
            opacity: isDarkMode ? 0.85 : 0.8,
            transition: 'background 140ms ease, border-color 140ms ease',
            outline: 'none',
            cursor: 'default',
          }}
        >
          <AowIcon area={item.aow} colour={accent} size={iconSize} category={category} />
        </span>
      );
    }

    // Matters: bordered icon chip (plus the green tick if opened). Click =
    // open the popover (which carries the action buttons). Keyboard chip
    // remains focusable for a11y; Enter/Space opens the popover too.
    const border = tintColour(accent, 0.32);
    const fill = tintColour(accent, isDarkMode ? 0.1 : 0.08);
    const handleKey = (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openHover(item, e.currentTarget);
      }
      if (e.key === 'Escape') {
        closeHover();
      }
    };
    return (
      <span
        key={item.id}
        ref={ref}
        tabIndex={0}
        className="conv-prospect-bezel"
        title={titleText}
        aria-label={titleText}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKey}
        style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          height: bezelHeight,
          padding: '0 4px',
          lineHeight: 1,
          border: `1px solid ${border}`,
          background: fill,
          borderRadius: 0,
          outline: 'none',
          cursor: 'default',
        }}
      >
        <AowIcon area={item.aow} colour={accent} size={iconSize} category={category} />
        {showTick ? <MatterTick colour={colours.green} size={breakpoint === 'wide' ? 9 : 8} /> : null}
      </span>
    );
  };

  if (!items || items.length === 0) {
    // 2026-04-20: when the caller tells us there *should* be chips here
    // (e.g. demo-mode count = 18 but prospect feed empty), render neutral
    // skeleton chips so the basket matches the counter. Otherwise fall back
    // to the italic "No X yet" helper.
    if (placeholderCount && placeholderCount > 0) {
      const phIconOnly = iconOnly;
      const phBezelHeight = bezelHeight;
      const phBezelGap = bezelGap;
      const phLabelSize = labelSize;
      const phVisible = Math.min(placeholderCount, maxVisible);
      const phOverflow = placeholderCount - phVisible;
      // 2026-04-21: enquiries placeholders match the demoted icon stream \u2014
      // small dim dots, no border. Matters keep the dashed-box skeleton so the
      // bezel\u2019s footprint is still reserved during load.
      const isEnq = section === 'enquiries';
      const phFill = isEnq ? 'transparent' : (isDarkMode ? 'rgba(148,163,184,0.20)' : 'rgba(55,65,81,0.12)');
      const phBorder = isEnq ? 'transparent' : (isDarkMode ? 'rgba(148,163,184,0.28)' : 'rgba(55,65,81,0.22)');
      const phText = isDarkMode ? 'rgba(209,213,219,0.55)' : 'rgba(55,65,81,0.55)';
      const phDotColour = isDarkMode ? 'rgba(148,163,184,0.45)' : 'rgba(55,65,81,0.35)';
      return (
        <div
          className="conv-prospect-trail"
          aria-hidden="true"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: phBezelGap,
            flexWrap: 'nowrap',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {Array.from({ length: phVisible }).map((_, idx) => (
            <div
              key={`ph-${idx}`}
              title={isEnq ? 'Enquiry (loading…)' : 'Matter (loading…)'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: phBezelHeight,
                minWidth: isEnq ? phBezelHeight : (phIconOnly ? phBezelHeight : 32),
                width: isEnq ? phBezelHeight : undefined,
                padding: isEnq || phIconOnly ? 0 : '0 8px',
                border: isEnq ? 'none' : `1px dashed ${phBorder}`,
                background: phFill,
                color: phText,
                fontSize: phLabelSize,
                fontWeight: 600,
                letterSpacing: '0.04em',
                flexShrink: 0,
                animation: animate ? `conv-prospect-skeleton 1.6s ease-in-out ${(idx * 0.08).toFixed(2)}s infinite` : 'none',
              }}
            >
              {isEnq ? (
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: phDotColour,
                  }}
                />
              ) : (phIconOnly ? '·' : '—')}
            </div>
          ))}
          {phOverflow > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: phBezelHeight,
                padding: '0 6px',
                color: phText,
                fontSize: phLabelSize,
                fontWeight: 700,
                letterSpacing: '0.04em',
                flexShrink: 0,
              }}
            >
              {`+${phOverflow}`}
            </div>
          )}
        </div>
      );
    }
    return (
      <div
        aria-hidden="true"
        style={{
          fontSize: 10,
          color: isDarkMode ? 'rgba(209,213,219,0.45)' : 'rgba(55,65,81,0.45)',
          letterSpacing: '0.02em',
          fontStyle: 'italic',
        }}
      >
        {section === 'enquiries' ? 'No enquiries yet' : 'No matters opened yet'}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
          height: 0,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: bezelGap, width: 'max-content' }}>
          {measuredItems.map((item) => renderChipBezel(item, (node) => setMeasureRef(item.id, node)))}
        </div>
      </div>

      <div
        ref={trailRef}
        className="conv-prospect-trail"
        aria-hidden="true"
        style={{
          display: 'flex',
          gap: bezelGap,
          // 2026-04-24: overflowX clips horizontally (chips never spill), but
          // overflowY stays visible so the matter hover tooltip can float above
          // the trail without being cut off.
          overflowX: 'clip' as React.CSSProperties['overflowX'],
          overflowY: 'visible',
          alignItems: 'center',
          paddingBottom: 1,
          userSelect: 'none',
          minWidth: 0,
        }}
      >
        <TransitionGroup component={null}>
          {visible.map((item) => {
            const nodeRef = getTransitionRef(item.id);
            const chipWidth = chipWidths[item.id] ?? fallbackChipWidth;
            return (
              <CSSTransition
                key={item.id}
                nodeRef={nodeRef}
                timeout={animate ? CHIP_RESIZE_TRANSITION_MS : 0}
                classNames="conv-prospect-chip"
              >
                <span
                  ref={nodeRef}
                  className="conv-prospect-chip-shell"
                  style={{
                    maxWidth: chipWidth,
                    ['--conv-chip-width' as '--conv-chip-width']: `${chipWidth}px`,
                  }}
                >
                  {renderChipBezel(item)}
                </span>
              </CSSTransition>
            );
          })}
        </TransitionGroup>

        {overflow > 0 || onOverflowToggle ? (() => {
        // When there's overflow, the default affordance is the `+X` stamp that
        // swaps to a chevron on hover (or when the section is already expanded).
        // When there's no overflow but an `onOverflowToggle` handler exists, we
        // still render a bare chevron so the user can always expand to the full
        // ledger — matches the parity with the section-header chevron.
        const showChevron = overflowExpanded || overflowHover;
        const ChevIcon = overflowExpanded ? FiChevronUp : FiChevronDown;
        const interactive = Boolean(onOverflowToggle);
        const accent = isDarkMode ? colours.dark.text : colours.light.text;
        const labelColour = isDarkMode ? 'rgba(243,244,246,0.9)' : 'rgba(6,23,51,0.88)';
        const stableWidth = getOverflowChipWidth(bezelHeight, overflow);
        return (
          <button
            type="button"
            onClick={interactive ? onOverflowToggle : undefined}
            onMouseEnter={interactive ? () => setOverflowHover(true) : undefined}
            onMouseLeave={interactive ? () => setOverflowHover(false) : undefined}
            aria-label={overflowExpanded ? `Collapse ${section} ledger` : `Expand ${section} ledger (${overflow > 0 ? overflow + ' more' : 'show all'})`}
            aria-expanded={overflowExpanded}
            disabled={!interactive}
            style={{
              flexShrink: 0,
              // 2026-04-24: push the overflow control to the right edge of the
              // trail so it always docks there instead of hugging the last
              // chip. Matches the tight, intentional feel of the rest of the
              // strip now that matter chips have been folded to icon-only.
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              height: bezelHeight,
              width: stableWidth,
              padding: 0,
              fontSize: 9,
              fontWeight: 700,
              color: showChevron ? accent : labelColour,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              lineHeight: 1,
              background: showChevron
                ? tintColour(isDarkMode ? '#87F3F3' : '#3690CE', isDarkMode ? 0.14 : 0.12)
                : (isDarkMode ? 'rgba(8,28,48,0.95)' : 'rgba(255,255,255,0.95)'),
              border: `1px solid ${showChevron
                ? tintColour(isDarkMode ? '#87F3F3' : '#3690CE', 0.4)
                : (isDarkMode ? 'rgba(209,213,219,0.18)' : 'rgba(55,65,81,0.18)')}`,
              borderRadius: 0,
              cursor: interactive ? 'pointer' : 'default',
              transition: 'width 0.16s ease, color 0.16s ease, background 0.16s ease, border-color 0.16s ease, transform 0.16s ease',
              outline: 'none',
              transform: showChevron ? 'translateY(-0.5px)' : 'translateY(0)',
            }}
          >
            {showChevron || overflow === 0 ? (
              <ChevIcon size={breakpoint === 'wide' ? 14 : 13} aria-hidden="true" />
            ) : (
              <span aria-hidden="true">+{overflow}</span>
            )}
          </button>
        );
      })() : null}
      </div>
      {hover ? renderHoverPopover({
        section,
        item: hover.item,
        anchor: hover.rect,
        open: popOpen,
        isDarkMode,
        accent: aowColor(hover.item.aow),
        onMouseEnter: keepOpen,
        onMouseLeave: closeHover,
        onOpenInApp: onOpenProspect,
      }) : null}
    </div>
  );
};

export default ConversionProspectBasket;
