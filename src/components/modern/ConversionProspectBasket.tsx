import React from 'react';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { colours } from '../../app/styles/colours';
import type { ConversionBreakpoint } from './hooks/useContainerWidth';
import clioIcon from '../../assets/clio.svg';

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
const DEFAULT_ICON_ONLY_CHIP_WIDTH = 36;
const DEFAULT_LABEL_CHIP_WIDTH = 96;

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
     * 2026-04-24: matter bezels fold to icon-only and reveal the display
     * number on hover as a small pill that floats above the trail. No layout
     * shift (absolutely positioned), no neighbour jank. The bezel itself
     * stays the click target for the Clio deep link.
     */
    .conv-prospect-hover-label {
      position: absolute;
      bottom: calc(100% + 5px);
      left: 0;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 7px;
      white-space: nowrap;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.02em;
      line-height: 1;
      font-feature-settings: "tnum" 1, "lnum" 1;
      opacity: 0;
      transform: translateY(2px);
      transition: opacity 160ms ease, transform 160ms ease;
      pointer-events: none;
      z-index: 5;
    }
    .conv-prospect-bezel:hover .conv-prospect-hover-label,
    .conv-prospect-bezel:focus-visible .conv-prospect-hover-label {
      opacity: 1;
      transform: translateY(0);
    }
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
  placeholderCount,
}) => {
  React.useEffect(() => { ensureChipStyles(); }, []);
  const [overflowHover, setOverflowHover] = React.useState(false);
  const iconOnly = breakpoint === 'narrow';
  const bezelHeight = breakpoint === 'wide' ? 24 : 22;
  const bezelGap = breakpoint === 'wide' ? 7 : 6;
  const labelSize = breakpoint === 'wide' ? 10.5 : 10;
  const fallbackChipWidth = iconOnly ? DEFAULT_ICON_ONLY_CHIP_WIDTH : DEFAULT_LABEL_CHIP_WIDTH;

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

      if (totalWidth <= trailWidth) {
        return count;
      }
    }

    return 0;
  }, [items, maxVisible, trailWidth, onOverflowToggle, chipWidths, fallbackChipWidth, bezelGap, bezelHeight]);

  const visible = React.useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const overflow = items.length - visible.length;

  const renderChipBezel = (item: ConversionProspectChipItem, ref?: React.Ref<HTMLSpanElement>) => {
    const accent = aowColor(item.aow);
    const showTick = section === 'matters' || item.matterOpened;
    const isMatter = section === 'matters';
    const category = resolveAowCategory ? resolveAowCategory(item.aow) : undefined;

    // 2026-04-21: enquiries trail demoted to a subtle AoW-icon stream — no
    // border, no fill, no surname label. The numeric counter + the chart
    // already convey volume; the trail is a supportive area-of-work cue, not
    // a duplicate list. Matters trail keeps the labelled bezel because the
    // display number + Clio link are functional, not decorative.
    if (!isMatter) {
      const enqIconSize = breakpoint === 'wide' ? 14 : 13;
      return (
        <span
          ref={ref}
          className="conv-prospect-bezel conv-prospect-bezel--quiet"
          title={`${item.displayName} · ${item.aow}`}
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: bezelHeight,
            width: bezelHeight,
            padding: 0,
            border: 'none',
            background: 'transparent',
            opacity: isDarkMode ? 0.7 : 0.65,
            transition: 'opacity 0.16s ease',
          }}
        >
          <AowIcon area={item.aow} colour={accent} size={enqIconSize} category={category} />
        </span>
      );
    }

    const matterLabel = (item.displayNumber || '').trim();
    const label = matterLabel || toTrailLabel(item.displayName);
    const border = tintColour(accent, 0.32);
    const fill = tintColour(accent, isDarkMode ? 0.1 : 0.08);
    const clioUrl = item.clioMatterId
      ? `https://eu.app.clio.com/nc/#/matters/${item.clioMatterId}`
      : null;
    const hasClio = Boolean(clioUrl);
    const titleText = `${matterLabel || item.displayName}${item.fullName ? ` · ${item.fullName}` : ''} · ${item.aow}${hasClio ? ' · Open in Clio' : ''}`;
    const iconSize = breakpoint === 'wide' ? 14 : 13;
    const ctaColour = isDarkMode ? colours.accent : colours.highlight;
    const tooltipBg = isDarkMode ? 'rgba(6,23,51,0.96)' : 'rgba(255,255,255,0.98)';
    const tooltipBorder = isDarkMode ? 'rgba(135,243,243,0.35)' : 'rgba(54,144,206,0.32)';
    const tooltipText = isDarkMode ? 'rgba(243,244,246,0.95)' : 'rgba(6,23,51,0.9)';
    const handleBezelClick = hasClio
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          if (clioUrl) window.open(clioUrl, '_blank', 'noopener,noreferrer');
        }
      : undefined;
    const handleBezelKey = hasClio
      ? (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            if (clioUrl) window.open(clioUrl, '_blank', 'noopener,noreferrer');
          }
        }
      : undefined;

    // 2026-04-24: matter bezels fold to an icon-only footprint (matching the
    // enquiries trail for density) with the display number + Clio CTA revealed
    // as an absolutely-positioned hover pill. Keeps the strip compact so the
    // `+X` / chevron can actually dock at the right edge.
    return (
      <span
        key={item.id}
        ref={ref}
        className={`conv-prospect-bezel${hasClio ? ' has-clio' : ''}`}
        title={titleText}
        role={hasClio ? 'link' : undefined}
        tabIndex={hasClio ? 0 : undefined}
        onClick={handleBezelClick}
        onKeyDown={handleBezelKey}
        aria-label={hasClio ? `Open matter ${matterLabel || item.displayName} in Clio` : undefined}
        style={{
          position: 'relative',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          height: bezelHeight,
          padding: '0 6px',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          border: `1px solid ${border}`,
          background: fill,
          borderRadius: 0,
          transition: 'background 0.16s ease, border-color 0.16s ease',
        }}
      >
        {hasClio ? (
          <span className="conv-prospect-stack" style={{ width: iconSize, height: iconSize }}>
            <span className="rest" style={{ display: 'inline-flex' }}>
              <AowIcon area={item.aow} colour={accent} size={iconSize} category={category} />
            </span>
            <span className="hover" style={{ display: 'inline-flex' }}>
              <ClioMarkImg size={iconSize} isDarkMode={isDarkMode} />
            </span>
          </span>
        ) : (
          <AowIcon area={item.aow} colour={accent} size={iconSize} category={category} />
        )}
        {showTick ? <MatterTick colour={colours.green} size={breakpoint === 'wide' ? 9 : 8} /> : null}
        {hasClio ? (
          <span
            className="conv-prospect-hover-label"
            style={{
              background: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              color: tooltipText,
              boxShadow: isDarkMode ? '0 4px 14px rgba(0,0,0,0.45)' : '0 4px 14px rgba(6,23,51,0.18)',
            }}
          >
            <span>{label}</span>
            <span aria-hidden="true" style={{ opacity: 0.45, fontWeight: 500 }}>›</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: ctaColour, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 9 }}>
              <ClioMarkImg size={10} isDarkMode={isDarkMode} />
              Clio
            </span>
          </span>
        ) : null}
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
    </div>
  );
};

export default ConversionProspectBasket;
