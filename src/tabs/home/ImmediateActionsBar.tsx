import React, { useEffect, useState, useRef } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { ImmediateActionChip } from './ImmediateActionChip';
import type { HomeImmediateAction } from './ImmediateActionModel';
import { Icon } from '@fluentui/react/lib/Icon';

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
// Bar component
// ─────────────────────────────────────────────────────────────────────────────

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
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Persist collapse state in localStorage
    const saved = localStorage.getItem('immediateActionsCollapsed');
    return saved === 'true';
  });

  // Track whether we've already shown the first live render.
  // Only the initial skeleton→live transition gets staggered chip animation;
  // subsequent list updates (new actions arriving) render without replaying it.
  const hasRenderedLive = useRef(false);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [layoutMode, setLayoutMode] = useState<'flow' | 'split' | 'stacked' | 'single'>('flow');

  const actions = immediateActionsList;

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
        ? 'repeat(auto-fit, minmax(220px, 1fr))'
        : 'repeat(auto-fit, minmax(180px, 1fr))';

  // Toggle collapse and persist
  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('immediateActionsCollapsed', String(newState));
  };

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


  // Colors
  const headerText = isDark ? colours.subtleGrey : colours.greyText;
  const interactiveAccent = isDark ? colours.accent : colours.blue;
  const interactiveHoverBg = `${interactiveAccent}${isDark ? '1A' : '14'}`;

  // Empty state
  if (immediateActionsReady && allowEmptyState && actions.length === 0) {
    return (
      <Section isDark={isDark} seamless={seamless} quiet>
        <EmptyState isDark={isDark} collapsed={false}>All caught up</EmptyState>
      </Section>
    );
  }

  const totalCount = actions.reduce((sum, a) => sum + (a.count ?? 1), 0);

  return (
    <Section isDark={isDark} seamless={seamless} highlighted={highlighted}>
      <div ref={sectionRef} className={`iab-shell iab-shell-${layoutMode}`} style={{ width: '100%', minWidth: 0 }}>
        <HeaderRow layoutMode={layoutMode}>
          <CollapseChevron 
            isCollapsed={isCollapsed} 
            onClick={toggleCollapse} 
            isDark={isDark}
            accent={interactiveAccent}
            hoverBg={interactiveHoverBg}
          />
          {actions.length > 0 && <CountBadge isDark={isDark}>{totalCount}</CountBadge>}
          {!immediateActionsReady && <Spinner isDark={isDark} />}
          {showSuccess && <SuccessCheck />}
        </HeaderRow>

        {!isCollapsed && (
          <div className={`iab-chip-grid iab-chip-grid-${layoutMode}`} style={{ 
            display: 'grid',
            gridTemplateColumns: chipGridTemplateColumns,
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
                />
              </div>
              );
            })}
          </div>
        )}
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
      background: isDark ? 'rgba(13, 47, 96, 0.32)' : 'rgba(214, 232, 255, 0.7)',
    }}
  />
);

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const Section: React.FC<{ isDark: boolean; seamless?: boolean; highlighted?: boolean; quiet?: boolean; children: React.ReactNode }> = ({ 
  isDark, 
  seamless = false,
  highlighted = false,
  quiet = false,
  children 
}) => (
  <section style={{
    padding: seamless ? '4px 0 6px' : quiet ? '4px 0 6px' : '4px 0 6px',
    minHeight: quiet ? 40 : 56,
    background: isDark ? 'rgba(6, 23, 51, 0.55)' : '#FFFFFF',
    border: 'none',
    borderBottom: `1px solid ${isDark ? 'rgba(54, 144, 206, 0.08)' : 'rgba(13, 47, 96, 0.08)'}`,
    boxShadow: 'none',
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

const CollapseChevron: React.FC<{ 
  isCollapsed: boolean; 
  onClick: () => void; 
  isDark: boolean;
  accent: string;
  hoverBg: string;
}> = ({ isCollapsed, onClick, isDark, accent, hoverBg }) => {
  const [hovered, setHovered] = useState(false);
  
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={isCollapsed ? 'Expand actions' : 'Collapse actions'}
      aria-expanded={!isCollapsed}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        height: 22,
        padding: '0 7px 0 5px',
        border: 'none',
        borderRadius: 2,
        background: hovered ? hoverBg : 'transparent',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        marginRight: 0,
        color: hovered ? accent : (isDark ? colours.subtleGrey : colours.greyText),
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        letterSpacing: '0.04em',
        textTransform: 'none',
      }}
    >
      <Icon 
        iconName="ChevronRight"
        style={{
          fontSize: 8,
          color: hovered ? accent : (isDark ? colours.subtleGrey : colours.greyText),
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s ease',
          transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
        }}
      />
      <span>To Do</span>
    </button>
  );
};

const CountBadge: React.FC<{ isDark: boolean; children: React.ReactNode }> = ({ isDark, children }) => (
  <span style={{
    minWidth: 16,
    height: 16,
    padding: '0 5px',
    background: isDark ? 'rgba(135, 243, 243, 0.1)' : 'rgba(54, 144, 206, 0.08)',
    color: isDark ? colours.accent : colours.highlight,
    fontSize: 9,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
  }}>
    {children}
  </span>
);

const EmptyState: React.FC<{ isDark: boolean; collapsed?: boolean; children: React.ReactNode }> = ({ isDark, collapsed = false, children }) => (
  <div style={{
    maxHeight: collapsed ? 0 : 48,
    opacity: collapsed ? 0 : 1,
    transform: collapsed ? 'translateY(-4px)' : 'translateY(0)',
    overflow: 'hidden',
    transition: 'max-height 0.25s ease, opacity 0.2s ease, transform 0.25s ease',
  }} aria-hidden={collapsed}>
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 8,
      padding: '8px 0 2px',
      background: 'transparent',
      borderRadius: '2px',
      border: 'none',
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
        color: isDark ? 'rgba(209, 213, 219, 0.82)' : colours.greyText,
      }}>{children}</div>
    </div>
  </div>
);

const Spinner: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <div style={{
    width: 12,
    height: 12,
    border: `2px solid ${isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
    borderTopColor: colours.highlight,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginLeft: 'auto',
  }} />
);

// Responsive styles injected once
const iabResponsiveId = 'iab-responsive-styles';
if (typeof document !== 'undefined' && !document.head.querySelector(`style[data-${iabResponsiveId}]`)) {
  const s = document.createElement('style');
  s.setAttribute(`data-${iabResponsiveId}`, '');
  s.textContent = `
    @keyframes iabChipIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .iab-chip-grid > div {
      min-width: 0;
    }
    .iab-shell-stacked .iab-chip-grid,
    .iab-shell-single .iab-chip-grid {
      align-items: stretch;
    }
    @media (max-width: 640px) {
      .iab-chip-grid { gap: 6px !important; }
      .iab-chip-grid > div { min-width: 0 !important; max-width: none !important; }
    }
    @media (max-width: 420px) {
      .iab-chip-grid { grid-template-columns: 1fr !important; }
    }
  `;
  document.head.appendChild(s);
}

const SuccessCheck: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colours.green} strokeWidth="3" style={{ marginLeft: 'auto' }}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

// CSS animation for spinner
const style = document.createElement('style');
style.textContent = `
@keyframes spin { to { transform: rotate(360deg); } }
`;
if (!document.head.querySelector('style[data-immediate-actions]')) {
  style.setAttribute('data-immediate-actions', '');
  document.head.appendChild(style);
}

export default ImmediateActionsBar;
