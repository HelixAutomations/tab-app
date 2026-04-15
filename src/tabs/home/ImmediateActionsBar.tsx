import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours, withAlpha } from '../../app/styles/colours';
import { ImmediateActionChip } from './ImmediateActionChip';
import './home-tokens.css';
import type { HomeImmediateAction } from './ImmediateActionModel';

// ─────────────────────────────────────────────────────────────────────────────
// Types (matches Home.tsx action model)
// ─────────────────────────────────────────────────────────────────────────────

interface ImmediateActionsBarProps {
  isDarkMode?: boolean;
  immediateActionsReady: boolean;
  immediateActionsList: HomeImmediateAction[];
  highlighted?: boolean;
  seamless?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bar component — scroll-driven collapse is handled by App.tsx portal wrapper.
// On narrow viewports (≤720px), renders as a compact single-row notification
// strip that expands into the full chip grid on demand.
// ─────────────────────────────────────────────────────────────────────────────

/** Build a compact one-line summary from the action list, e.g. "Approve Leave · 2 more" */
const buildCompactSummary = (actions: HomeImmediateAction[]): string => {
  if (actions.length === 0) return '';
  const first = actions[0].title;
  if (actions.length === 1) return first;
  return `${first} · ${actions.length - 1} more`;
};

export const ImmediateActionsBar: React.FC<ImmediateActionsBarProps> = ({
  isDarkMode: propDarkMode,
  immediateActionsReady,
  immediateActionsList,
  highlighted = false,
  seamless = false,
}) => {
  const { isDarkMode: contextDarkMode } = useTheme();
  const isDark = contextDarkMode ?? propDarkMode ?? false;
  const [showSuccess, setShowSuccess] = useState(false);
  const [allowEmptyState, setAllowEmptyState] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Track whether we've already shown the first live render.
  // Only the initial skeleton→live transition gets staggered chip animation;
  // subsequent list updates (new actions arriving) render without replaying it.
  const hasRenderedLive = useRef(false);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const chipGridRef = useRef<HTMLDivElement | null>(null);
  const [layoutMode, setLayoutMode] = useState<'flow' | 'split' | 'stacked' | 'single'>('flow');
  const [chipGridHeight, setChipGridHeight] = useState<number>(0);

  const actions = immediateActionsList;
  const isCompact = layoutMode === 'stacked' || layoutMode === 'single';

  // Collapse back to strip when actions disappear while expanded
  useEffect(() => {
    if (actions.length === 0 && expanded) setExpanded(false);
  }, [actions.length, expanded]);

  useEffect(() => {
    const element = sectionRef.current;
    if (!element) return undefined;

    const updateLayout = (width: number) => {
      if (width <= 430) {
        setLayoutMode('single');
      } else if (width <= 720) {
        setLayoutMode('stacked');
      } else if (width <= 980) {
        setLayoutMode('split');
      } else {
        setLayoutMode('flow');
      }
    };

    updateLayout(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateLayout(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Measure the chip grid's natural height for smooth expand/collapse animation
  useEffect(() => {
    const grid = chipGridRef.current;
    if (!grid) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChipGridHeight(Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height));
      }
    });
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const toggleExpanded = useCallback(() => setExpanded(prev => !prev), []);

  // Progressive display: show chips the moment they exist, don't wait for
  // all deps to finish. Skeletons only when the list is empty AND still loading.
  const stillLoading = !immediateActionsReady;
  const hasActions = actions.length > 0;

  // Avoid flicker: keep skeletons briefly when ready-but-empty, to allow
  // attendance/instructions derived actions to appear without showing empty state first.
  useEffect(() => {
    if (!immediateActionsReady) {
      setAllowEmptyState(false);
      hasRenderedLive.current = false;
      return;
    }
    if (hasActions) {
      setAllowEmptyState(true);
      return;
    }

    setAllowEmptyState(false);
    const timer = setTimeout(() => setAllowEmptyState(true), 400);
    return () => clearTimeout(timer);
  }, [immediateActionsReady, hasActions]);

  // Show skeletons only when we have no actions yet and data is still arriving
  const showSkeletons = !hasActions && stillLoading;
  // Show chips whenever they exist — even if more data is still loading
  const showChips = hasActions;
  const shouldWrapChipText = layoutMode === 'stacked' || layoutMode === 'single';
  const chipGridTemplateColumns = layoutMode === 'single'
    ? '1fr'
    : layoutMode === 'stacked'
      ? 'repeat(2, minmax(0, 1fr))'
      : layoutMode === 'split'
        ? 'repeat(auto-fit, minmax(190px, 1fr))'
        : 'repeat(auto-fit, minmax(180px, 1fr))';

  // Show success briefly when loading completes with no actions
  // (only after settling delay, so it doesn't flash during transient empty state)
  useEffect(() => {
    if (immediateActionsReady && allowEmptyState && actions.length === 0) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [immediateActionsReady, allowEmptyState, actions.length]);

  // Mark first live render done after this render cycle completes
  useEffect(() => {
    if (showChips && !hasRenderedLive.current) {
      const raf = requestAnimationFrame(() => { hasRenderedLive.current = true; });
      return () => cancelAnimationFrame(raf);
    }
  }, [showChips]);

  // Empty state — on compact (small screens), render nothing to reclaim space
  if (immediateActionsReady && allowEmptyState && actions.length === 0) {
    if (isCompact) return null;
    return (
      <Section isDark={isDark} seamless={seamless} quiet>
        <EmptyState isDark={isDark}>All caught up</EmptyState>
      </Section>
    );
  }

  const totalCount = actions.reduce((sum, a) => sum + (a.count ?? 1), 0);

  // Responsive props driven by ResizeObserver layoutMode (no CSS media queries)
  const hideChipChevron = layoutMode !== 'flow';
  const shrinkSingleAction = actions.length === 1 && !showSkeletons;

  // ── Compact strip mode (≤720px) ────────────────────────────────────────
  if (isCompact && hasActions) {
    const compactSummary = buildCompactSummary(actions);
    const topAction = actions[0];
    const topCategoryAccent = topAction?.category === 'critical' ? colours.cta
      : (isDark ? colours.accent : colours.blue);

    return (
      <Section isDark={isDark} seamless={seamless} highlighted={highlighted} compact>
        <div ref={sectionRef} style={{ width: '100%', minWidth: 0 }}>
          {/* Compact strip row — tap to expand */}
          <button
            type="button"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            aria-label={`To Do: ${compactSummary}. ${expanded ? 'Collapse' : 'Expand'} actions.`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              height: 32,
              padding: '0 6px 0 5px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: isDark ? colours.dark.text : colours.light.text,
              userSelect: 'none',
            }}
          >
            <SectionLabel isDark={isDark} />
            <CountBadge isDark={isDark}>{totalCount}</CountBadge>

            {/* Priority summary */}
            <span style={{
              flex: 1,
              minWidth: 0,
              fontSize: 10,
              fontWeight: 500,
              color: isDark ? colours.subtleGrey : colours.greyText,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'left',
            }}>
              {compactSummary}
            </span>

            {!immediateActionsReady && <Spinner isDark={isDark} />}

            {/* Expand/collapse chevron */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={isDark ? colours.subtleGrey : colours.greyText}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                flexShrink: 0,
                opacity: 0.6,
                transition: 'transform 0.2s ease',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {/* Expandable chip grid — always mounted for height measurement */}
          <div
            style={{
              maxHeight: expanded ? chipGridHeight + 8 : 0,
              opacity: expanded ? 1 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.22s ease, opacity 0.18s ease',
              willChange: expanded ? 'max-height, opacity' : 'auto',
            }}
          >
            <div
              ref={chipGridRef}
              style={{
                display: shrinkSingleAction ? 'flex' : 'grid',
                gridTemplateColumns: shrinkSingleAction ? undefined
                  : layoutMode === 'single' ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                justifyContent: shrinkSingleAction ? 'flex-start' : undefined,
                alignItems: 'stretch',
                width: '100%',
                minWidth: 0,
                gap: 8,
                paddingTop: 4,
                paddingBottom: 4,
              }}
            >
              {actions.map((action, idx) => {
                const shouldAnimate = !hasRenderedLive.current && expanded;
                return (
                  <div
                    key={`${action.title}-${idx}`}
                    style={{ position: 'relative', minWidth: 0, animation: shouldAnimate ? `iabChipIn 0.22s ease ${idx * 0.035}s both` : 'none' }}
                  >
                    <ImmediateActionChip
                      title={action.title}
                      icon={action.icon}
                      category={action.category}
                      count={action.count}
                      totalCount={action.totalCount}
                      onClick={action.onClick}
                      disabled={action.disabled}
                      isDarkMode={isDark}
                      allowWrap
                      hideChevron
                      dense
                      fillWidth={!shrinkSingleAction}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Section>
    );
  }

  // ── Wide mode (>720px) — full chip grid as before ──────────────────────

  return (
    <Section isDark={isDark} seamless={seamless} highlighted={highlighted}>
      <div ref={sectionRef} style={{ width: '100%', minWidth: 0 }}>
        <HeaderRow layoutMode={layoutMode}>
          <SectionLabel isDark={isDark} />
          {actions.length > 0 && <CountBadge isDark={isDark}>{totalCount}</CountBadge>}
          {!immediateActionsReady && <Spinner isDark={isDark} />}
          {showSuccess && <SuccessCheck />}
        </HeaderRow>

        <div style={{ 
          display: shrinkSingleAction ? 'flex' : 'grid',
          gridTemplateColumns: shrinkSingleAction ? undefined : chipGridTemplateColumns,
          justifyContent: shrinkSingleAction ? 'flex-start' : undefined,
          alignItems: 'stretch',
          width: '100%',
          minHeight: 32,
          minWidth: 0,
          gap: layoutMode === 'flow' ? 6 : 8,
          paddingLeft: 0,
          paddingTop: layoutMode === 'flow' ? 2 : 4,
          position: 'relative',
          transition: 'opacity 0.18s ease',
        }}>
          {showSkeletons && (
            <>
              <SkeletonChip isDark={isDark} />
              <SkeletonChip isDark={isDark} />
              <SkeletonChip isDark={isDark} />
            </>
          )}

          {showChips && actions.map((action, idx) => {
            const shouldAnimate = !hasRenderedLive.current;
            return (
            <div 
              key={`${action.title}-${idx}`} 
              style={{ position: 'relative', minWidth: 0, animation: shouldAnimate ? `iabChipIn 0.22s ease ${idx * 0.035}s both` : 'none' }}
            >
              <ImmediateActionChip
                title={action.title}
                icon={action.icon}
                category={action.category}
                count={action.count}
                totalCount={action.totalCount}
                onClick={action.onClick}
                disabled={action.disabled}
                isDarkMode={isDark}
                allowWrap={shouldWrapChipText}
                hideChevron={hideChipChevron}
                dense={layoutMode !== 'flow'}
                fillWidth={!shrinkSingleAction}
              />
            </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
};

const SkeletonChip: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <div
    className="skeleton-shimmer"
    style={{
      height: 28,
      minWidth: 140,
      borderRadius: 2,
      background: isDark ? withAlpha(colours.helixBlue, 0.32) : withAlpha(colours.highlightBlue, 0.7),
    }}
  />
);

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const Section: React.FC<{ isDark: boolean; seamless?: boolean; highlighted?: boolean; quiet?: boolean; compact?: boolean; children: React.ReactNode }> = ({ 
  isDark, 
  seamless = false,
  highlighted = false,
  quiet = false,
  compact = false,
  children 
}) => (
  <section style={{
    padding: compact ? '2px 0 2px' : '4px 0 6px',
    minHeight: compact ? 'auto' : quiet ? 40 : 56,
    fontFamily: 'var(--font-primary)',
    background: 'var(--home-strip-bg)',
    border: 'none',
    borderBottom: '1px solid var(--home-strip-border)',
    boxShadow: highlighted
      ? `inset 0 1px 0 ${isDark ? withAlpha(colours.accent, 0.1) : withAlpha(colours.highlight, 0.1)}`
      : 'none',
    paddingInline: quiet ? '10px' : '12px',
    marginBottom: 0,
    transition: 'min-height 0.2s ease, padding 0.15s ease, opacity 0.18s ease',
  }}>
    {children}
  </section>
);

const HeaderRow: React.FC<{ children: React.ReactNode; layoutMode: 'flow' | 'split' | 'stacked' | 'single' }> = ({ children, layoutMode }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    flexWrap: layoutMode === 'single' ? 'wrap' : 'nowrap',
    gap: 6,
    width: '100%',
    minWidth: 0,
    marginBottom: layoutMode === 'flow' ? 1 : 3,
  }}>
    {children}
  </div>
);

const SectionLabel: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    height: 22,
    padding: '0 7px 0 5px',
    color: isDark ? colours.dark.text : colours.light.text,
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    letterSpacing: '0.04em',
    textTransform: 'none',
    userSelect: 'none',
  }}>
    To Do
  </span>
);

const CountBadge: React.FC<{ isDark: boolean; children: React.ReactNode }> = ({ isDark, children }) => (
  <span style={{
    minWidth: 22,
    height: 22,
    padding: '0 7px',
    background: isDark ? withAlpha(colours.blue, 0.12) : withAlpha(colours.blue, 0.08),
    color: isDark ? colours.dark.text : colours.highlight,
    fontSize: 10,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
    lineHeight: 1,
  }}>
    {children}
  </span>
);

const EmptyState: React.FC<{ isDark: boolean; children: React.ReactNode }> = ({ isDark, children }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    padding: '8px 0 2px',
  }}>
    <svg 
      width="12" 
      height="12" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke={colours.green}
      strokeWidth="2" 
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: 0.75, flexShrink: 0 }}
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      color: isDark ? withAlpha(colours.dark.text, 0.82) : colours.greyText,
    }}>{children}</div>
  </div>
);

const Spinner: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <div style={{
    width: 12,
    height: 12,
    border: `2px solid ${isDark ? withAlpha(colours.dark.border, 0.3) : withAlpha(colours.helixBlue, 0.12)}`,
    borderTopColor: colours.highlight,
    borderRadius: '50%',
    animation: 'iabSpin 0.8s linear infinite',
    marginLeft: 'auto',
  }} />
);

// Consolidated styles — single injection for keyframes
const iabStyleId = 'iab-styles';
if (typeof document !== 'undefined' && !document.head.querySelector(`style[data-${iabStyleId}]`)) {
  const s = document.createElement('style');
  s.setAttribute(`data-${iabStyleId}`, '');
  s.textContent = `
    @keyframes iabChipIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes iabSpin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(s);
}

const SuccessCheck: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colours.green} strokeWidth="3" style={{ marginLeft: 'auto' }}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export default ImmediateActionsBar;
