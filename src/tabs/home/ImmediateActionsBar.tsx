import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours, withAlpha } from '../../app/styles/colours';
import { ImmediateActionChip } from './ImmediateActionChip';
import { getChipIcon } from './ImmediateActionChip.icons';
import type { ImmediateActionCategory } from './ImmediateActionChip';
import './home-tokens.css';
import type { HomeImmediateAction } from './ImmediateActionModel';
import { TodoItemExpandedPane } from '../../components/modern/todo/TodoItemExpandedPane';
import { trackClientEvent } from '../../utils/telemetry';

// Canonical AoW colour map — mirrors `.github/copilot-instructions.md` table.
// Inlined here (not imported from a shared util) because the existing
// `getAreaColor` helpers across the app have inconsistent fallbacks; this
// file uses the canonical fallback (`greyText`) to stay on-brand.
const aowDotColour = (raw?: string): string => {
  const a = String(raw || '').toLowerCase();
  if (!a) return colours.greyText;
  if (a.includes('commercial')) return colours.blue;
  if (a.includes('construction')) return colours.orange;
  if (a.includes('property')) return colours.green;
  if (a.includes('employment')) return colours.yellow;
  return colours.greyText;
};

// ─────────────────────────────────────────────────────────────────────────────
// Types (matches Home.tsx action model)
// ─────────────────────────────────────────────────────────────────────────────

interface ImmediateActionsBarProps {
  isDarkMode?: boolean;
  immediateActionsReady: boolean;
  immediateActionsList: HomeImmediateAction[];
  highlighted?: boolean;
  seamless?: boolean;
  /** Optional control rendered in the bar header (LZ-only god-view scope toggle). */
  scopeSlot?: React.ReactNode;
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
  scopeSlot,
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

  // Single-open contract: only one panel row's expansion pane can be visible
  // at a time. Opening another auto-collapses the previous. Keeps the To Do
  // tray compact even in firm-wide scope where multiple rows are visible.
  const [expandedActionKey, setExpandedActionKey] = useState<string | null>(null);

  // Collapse back to strip when actions disappear while expanded
  useEffect(() => {
    if (actions.length === 0 && expanded) setExpanded(false);
  }, [actions.length, expanded]);

  // If the expanded row is no longer in the list, clear it.
  useEffect(() => {
    if (!expandedActionKey) return;
    const stillPresent = actions.some((a, i) => (a.meta?.actionId ?? `${a.title}-${i}`) === expandedActionKey);
    if (!stillPresent) setExpandedActionKey(null);
  }, [actions, expandedActionKey]);

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
    // 2026-04-20: 400ms was tight enough that a transient ready-empty
    // window (e.g. backend reconnect, SSE proxy hiccup) could flash
    // "All caught up" before the actual actions arrived. Bumped to 1200ms
    // — if the user really has nothing to do, the extra second is fine; if
    // we're mid-recovery, it gives downstream sources time to populate.
    const timer = setTimeout(() => setAllowEmptyState(true), 1200);
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
    if (isCompact && !seamless) return null;
    return (
      <Section isDark={isDark} seamless={seamless} quiet>
        <div style={{ flex: seamless ? 1 : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: seamless ? '100%' : 64 }}>
          <EmptyState isDark={isDark}>All caught up</EmptyState>
        </div>
      </Section>
    );
  }

  const totalCount = actions.reduce((sum, a) => sum + (a.count ?? 1), 0);

  // Responsive props driven by ResizeObserver layoutMode (no CSS media queries)
  const hideChipChevron = layoutMode !== 'flow';
  const shrinkSingleAction = actions.length === 1 && !showSkeletons;

  // ── Compact strip mode (≤720px) — skip when seamless (panel fills parent) ─
  if (isCompact && hasActions && !seamless) {
    const compactSummary = buildCompactSummary(actions);

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
  // When seamless (panel context), render a vertical list with panel-appropriate
  // spacing, no inner section chrome, and taller card rows.

  return (
    <Section isDark={isDark} seamless={seamless} highlighted={highlighted}>
      <div ref={sectionRef} style={{
        width: '100%',
        minWidth: 0,
        // 2026-04-21: in seamless mode the parent scroll wrapper in
        // OperationsDashboard now owns the inset (6px 10px 8px). The bar
        // itself contributes 0 — prevents the historical double-padding and
        // lets the To Do rows sit closer to the card edges than the previous
        // 12/14 inset allowed (count badge has moved up to the section header).
        ...(seamless ? { flex: 1, display: 'flex', flexDirection: 'column' as const, minHeight: 0 } : {}),
      }}>
        {!seamless && (
          <HeaderRow layoutMode={layoutMode}>
            <SectionLabel isDark={isDark} />
            {actions.length > 0 && <CountBadge isDark={isDark}>{totalCount}</CountBadge>}
            {!immediateActionsReady && <Spinner isDark={isDark} />}
            {showSuccess && <SuccessCheck />}
            {scopeSlot && <div style={{ marginLeft: 'auto' }}>{scopeSlot}</div>}
          </HeaderRow>
        )}

        {/* Panel header strip (seamless only) — spinner / success only.
            The total count badge has moved to OperationsDashboard's section
            header so it sits inline with the "To Do" label. We only render
            this strip when there's actually something transient to show
            (loading or post-action checkmark) so the rows can sit at the top
            of the card body in the steady state. */}
        {seamless && (!immediateActionsReady || showSuccess || scopeSlot) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            {!immediateActionsReady && <Spinner isDark={isDark} />}
            {showSuccess && <SuccessCheck />}
            {scopeSlot && <div style={{ marginLeft: 'auto' }}>{scopeSlot}</div>}
          </div>
        )}

        <div style={{
          display: 'flex',
          flexDirection: seamless ? 'column' as const : undefined as any,
          ...(seamless ? {} : {
            display: shrinkSingleAction ? 'flex' : 'grid',
            gridTemplateColumns: shrinkSingleAction ? undefined : chipGridTemplateColumns,
            justifyContent: shrinkSingleAction ? 'flex-start' : undefined,
          }),
          alignItems: 'stretch',
          width: '100%',
          minHeight: seamless ? 0 : 32,
          minWidth: 0,
          gap: seamless ? 6 : (layoutMode === 'flow' ? 6 : 8),
          paddingLeft: 0,
          paddingTop: seamless ? 0 : (layoutMode === 'flow' ? 2 : 4),
          position: 'relative',
          transition: 'opacity 0.18s ease',
          flex: seamless ? 1 : undefined,
          overflowY: seamless ? 'auto' as const : undefined,
        }}>
          {showSkeletons && (
            seamless ? (
              <>
                <PanelSkeletonRow isDark={isDark} />
                <PanelSkeletonRow isDark={isDark} />
                <PanelSkeletonRow isDark={isDark} />
                <PanelSkeletonRow isDark={isDark} />
              </>
            ) : (
              <>
                <SkeletonChip isDark={isDark} />
                <SkeletonChip isDark={isDark} />
                <SkeletonChip isDark={isDark} />
              </>
            )
          )}

          {showChips && actions.map((action, idx) => {
            const shouldAnimate = !hasRenderedLive.current;
            const key = action.meta?.actionId ?? `${action.title}-${idx}`;
            return seamless ? (
              <PanelActionRow
                key={key}
                action={action}
                isDark={isDark}
                shouldAnimate={shouldAnimate}
                animDelay={idx * 0.035}
                expanded={expandedActionKey === key}
                onToggleExpanded={() => {
                  setExpandedActionKey((prev) => (prev === key ? null : key));
                }}
              />
            ) : (
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

// ─── Panel-mode row (seamless context — taller card rows) ────────────────────

const PanelSkeletonRow: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  // Footprint mirrors PanelActionRow so the skeleton→card swap doesn't shift
  // horizontal alignment. 3px transparent left border reserves the accent
  // stripe space; the loaded card replaces it with a coloured stripe of the
  // same width.
  <div
    className="skeleton-shimmer"
    style={{
      height: 48,
      width: '100%',
      borderRadius: 2,
      borderLeft: '3px solid transparent',
      boxSizing: 'border-box',
      background: isDark ? withAlpha(colours.helixBlue, 0.18) : withAlpha(colours.highlightBlue, 0.5),
    }}
  />
);

const PanelActionRow: React.FC<{
  action: HomeImmediateAction;
  isDark: boolean;
  shouldAnimate: boolean;
  animDelay: number;
  expanded: boolean;
  onToggleExpanded: () => void;
}> = ({ action, isDark, shouldAnimate, animDelay, expanded, onToggleExpanded }) => {
  const [hovered, setHovered] = React.useState(false);
  const canExpand = Boolean(action.expansion);
  const ChipIcon = getChipIcon(action.icon);
  const category: ImmediateActionCategory = action.category || 'critical';
  const categoryAccent = category === 'success'
    ? colours.green
    : category === 'warning'
      ? colours.orange
      : category === 'standard'
        ? (isDark ? colours.accent : colours.blue)
        : colours.cta;

  const text = isDark ? colours.dark.text : colours.light.text;
  const textMuted = isDark ? colours.subtleGrey : colours.greyText;
  const surface = isDark
    ? withAlpha(colours.darkBlue, 0.6)
    : withAlpha(colours.highlightBlue, 0.25);
  const hoverSurface = isDark
    ? `linear-gradient(135deg, ${withAlpha(categoryAccent, 0.1)} 0%, ${withAlpha(colours.darkBlue, 0.7)} 100%)`
    : `linear-gradient(135deg, ${withAlpha(categoryAccent, 0.07)} 0%, ${withAlpha(colours.highlightBlue, 0.3)} 100%)`;
  // Removed the 1px outer border — combined with the 3px borderLeft accent it
  // visibly framed the card, making loaded rows read as inset compared to the
  // flat skeleton bars. Hover lift + box-shadow already signal interactivity.
  const border = 'none';

  const toggleExpanded = useCallback(() => {
    const next = !expanded;
    try {
      trackClientEvent('home.todo', next ? 'Todo.Item.Expanded' : 'Todo.Item.Collapsed', {
        actionId: action.meta?.actionId,
        source: action.meta?.source,
        kind: action.expansion?.kind,
      }, { throttleKey: `todo-expand-${action.meta?.actionId ?? action.title}`, cooldownMs: 250 });
    } catch {
      /* telemetry best-effort */
    }
    onToggleExpanded();
  }, [action, expanded, onToggleExpanded]);

  const handleMainClick = useCallback(() => {
    if (action.disabled) return;
    action.onClick();
  }, [action]);

  const handleActionInvoked = useCallback((label: string) => {
    try {
      trackClientEvent('home.todo', 'Todo.Item.ActionInvoked', {
        actionId: action.meta?.actionId,
        source: action.meta?.source,
        kind: action.expansion?.kind,
        label,
      });
    } catch {
      /* telemetry best-effort */
    }
  }, [action]);

  return (
    <div
      onMouseEnter={() => !action.disabled && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: hovered ? hoverSurface : surface,
        border,
        borderLeft: `3px solid ${categoryAccent}`,
        boxSizing: 'border-box',
        borderRadius: 2,
        opacity: action.disabled ? 0.5 : 1,
        fontFamily: 'var(--font-primary)',
        transition: 'all 0.15s ease',
        boxShadow: hovered ? `0 2px 8px ${withAlpha(categoryAccent, isDark ? 0.12 : 0.06)}` : 'none',
        transform: hovered ? 'translateY(-0.5px)' : 'none',
        animation: shouldAnimate ? `iabChipIn 0.22s ease ${animDelay}s both` : 'none',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', minHeight: 48, width: '100%' }}>
        <button
          type="button"
          onClick={handleMainClick}
          disabled={action.disabled}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 0,
            minHeight: 48,
            padding: '10px 0 10px 12px',
            background: 'transparent',
            border: 'none',
            cursor: action.disabled ? 'not-allowed' : 'pointer',
            color: text,
            textAlign: 'left',
            fontFamily: 'var(--font-primary)',
          }}
        >
          {/* Icon circle */}
          <div style={{
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            background: withAlpha(categoryAccent, isDark ? 0.12 : 0.08),
            borderRadius: 2,
            color: categoryAccent,
            transition: 'background 0.15s ease',
            position: 'relative',
          }}>
            <ChipIcon style={{ fontSize: 12 }} />
            {/* AoW colour dot — small bottom-right pip on the icon circle when
                the action carries an Area of Work cue. Lets the eye triage by
                area without expanding. Sized to the icon circle so it never
                stretches the row vertically. */}
            {action.expansion?.aow && (() => {
              const dot = aowDotColour(action.expansion.aow);
              return (
                <span
                  aria-hidden
                  title={action.expansion.aow}
                  style={{
                    position: 'absolute',
                    bottom: -1,
                    right: -1,
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: dot,
                    boxShadow: `0 0 0 1.5px ${isDark ? 'rgba(8,28,48,0.95)' : 'rgba(255,255,255,0.95)'}`,
                  }}
                />
              );
            })()}
          </div>

          {/* Title + (optional) subtitle */}
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: text,
            }}>
              {action.title}
            </div>
            {action.subtitle && (
              // 2026-04-21: surface the subtitle (client / instruction / queue
              // hint) as a quiet second line. Already populated by Home for
              // most action sources — was previously only shown in non-seamless
              // mode, leaving the panel cards under-utilised. 11px, muted,
              // single-line ellipsis within the 48px panel row.
              <div style={{
                fontSize: 11,
                fontWeight: 500,
                lineHeight: 1.25,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: textMuted,
                opacity: 0.85,
              }}>
                {action.subtitle}
              </div>
            )}
          </div>
        </button>

        {/* Count badge */}
        {typeof action.count === 'number' && action.count > 0 && (
          <span style={{
            minWidth: 20,
            height: 20,
            padding: '0 6px',
            marginRight: canExpand ? 6 : 10,
            background: withAlpha(categoryAccent, isDark ? 0.1 : 0.08),
            color: categoryAccent,
            fontSize: 10,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 2,
            flexShrink: 0,
          }}>
            {action.count}
          </span>
        )}

        {/* Chevron — expand toggle if expandable, else navigation cue */}
        {canExpand ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleExpanded(); }}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse details' : 'Show details'}
            style={{
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 32,
              marginRight: 4,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: textMuted,
              opacity: hovered || expanded ? 0.9 : 0.45,
              transition: 'opacity 0.15s ease, transform 0.2s ease',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={textMuted}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, opacity: hovered ? 0.6 : 0.3, marginRight: 10 }}
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        )}
      </div>

      {canExpand && expanded && action.expansion && (
        <TodoItemExpandedPane
          expansion={action.expansion}
          isDarkMode={isDark}
          onAction={handleActionInvoked}
        />
      )}
    </div>
  );
};

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
    // 2026-04-21: in seamless (panel) mode the inner wrapper at L320 owns the
    // 12px/14px inset so it matches the Conversion card body exactly. The
    // outer <section> here must contribute zero padding, otherwise the two
    // stack and the To Do content sits ~26px in horizontally vs Conversion's
    // 14px (visible imbalance on Home).
    padding: seamless ? 0 : (compact ? '2px 0 2px' : '4px 0 6px'),
    minHeight: compact ? 'auto' : quiet ? 40 : 56,
    fontFamily: 'var(--font-primary)',
    background: seamless ? 'transparent' : 'var(--home-strip-bg)',
    border: 'none',
    borderBottom: seamless ? 'none' : '1px solid var(--home-strip-border)',
    boxShadow: seamless
      ? 'none'
      : highlighted
        ? `inset 0 1px 0 ${isDark ? withAlpha(colours.accent, 0.1) : withAlpha(colours.highlight, 0.1)}`
        : 'none',
    paddingInline: seamless ? 0 : compact ? '10px' : quiet ? '10px' : '12px',
    marginBottom: 0,
    width: '100%',
    height: seamless ? '100%' : undefined,
    display: seamless ? 'flex' : undefined,
    flexDirection: seamless ? 'column' : undefined,
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
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 14px',
    // 2026-04-20: subtle fade + lift so the badge feels intentional rather
    // than a left-over after the skeletons clear. Pure entrance animation
    // — no looping pulse (would compete with the badge's quiet meaning).
    animation: 'iabEmptyIn 0.32s ease both',
  }}>
    <style>{`
      @keyframes iabEmptyIn {
        from { opacity: 0; transform: translateY(2px) scale(0.985); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes iabEmptyTickIn {
        0%   { stroke-dashoffset: 28; opacity: 0.4; }
        60%  { stroke-dashoffset: 0;  opacity: 0.95; }
        100% { stroke-dashoffset: 0;  opacity: 0.85; }
      }
    `}</style>
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke={colours.green}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" style={{ opacity: 0.55 }} />
      <polyline
        points="22 4 12 14.01 9 11.01"
        style={{
          strokeDasharray: 28,
          animation: 'iabEmptyTickIn 0.55s ease 0.18s both',
        }}
      />
    </svg>
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.02em',
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
