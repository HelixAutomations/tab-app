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
  const [emptyCollapsed, setEmptyCollapsed] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Persist collapse state in localStorage
    const saved = localStorage.getItem('immediateActionsCollapsed');
    return saved === 'true';
  });

  const actions = immediateActionsList;

  // Avoid flicker: keep skeletons briefly when ready-but-empty, to allow
  // attendance/instructions derived actions to appear without showing empty state first.
  useEffect(() => {
    if (!immediateActionsReady) {
      setAllowEmptyState(false);
      return;
    }
    if (actions.length > 0) {
      setAllowEmptyState(true);
      return;
    }

    setAllowEmptyState(false);
    const timer = setTimeout(() => setAllowEmptyState(true), 700);
    return () => clearTimeout(timer);
  }, [immediateActionsReady, actions.length]);

  const settlingEmpty = immediateActionsReady && actions.length === 0 && !allowEmptyState;
  const loading = !immediateActionsReady || settlingEmpty;

  // Toggle collapse and persist
  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('immediateActionsCollapsed', String(newState));
  };

  // Show success briefly when loading completes with no actions
  useEffect(() => {
    if (immediateActionsReady && actions.length === 0) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [immediateActionsReady, actions.length]);

  // Auto-collapse empty state shortly after it appears
  useEffect(() => {
    if (immediateActionsReady && allowEmptyState && actions.length === 0) {
      setEmptyCollapsed(false);
      const timer = setTimeout(() => setEmptyCollapsed(true), 900);
      return () => clearTimeout(timer);
    }
    setEmptyCollapsed(false);
  }, [immediateActionsReady, allowEmptyState, actions.length]);
  


  // Colors
  const headerText = isDark ? colours.subtleGrey : colours.greyText;
  const interactiveAccent = isDark ? colours.accent : colours.blue;
  const interactiveHoverBg = `${interactiveAccent}${isDark ? '1A' : '14'}`;

  // Empty state
  if (immediateActionsReady && allowEmptyState && actions.length === 0) {
    if (emptyCollapsed) {
      return null;
    }

    return (
      <Section isDark={isDark} seamless={seamless} quiet>
        <EmptyState isDark={isDark} collapsed={emptyCollapsed}>All caught up</EmptyState>
      </Section>
    );
  }

  const totalCount = actions.reduce((sum, a) => sum + (a.count ?? 1), 0);

  return (
    <Section isDark={isDark} seamless={seamless} highlighted={highlighted}>
      <HeaderRow>
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
        <div className="iab-chip-grid" style={{ 
          display: 'flex', 
          alignItems: 'stretch',
          flexWrap: 'wrap',
          width: '100%',
          minWidth: 0,
          gap: 8,
          paddingLeft: 12,
          paddingTop: 4,
          position: 'relative',
        }}>
          {loading && (
            <>
              <SkeletonChip isDark={isDark} />
              <SkeletonChip isDark={isDark} />
              <SkeletonChip isDark={isDark} />
            </>
          )}

          {!loading && actions.map((action, idx) => (
            <div 
              key={`${action.title}-${idx}`} 
              style={{ position: 'relative', animation: `iabChipIn 0.22s ease ${idx * 0.035}s both` }}
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
              />
            </div>
          ))}
        </div>
      )}
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
    padding: seamless ? '8px 0 10px' : quiet ? '6px 0 8px' : '8px 0 10px',
    background: isDark ? colours.websiteBlue : colours.light.background,
    border: 'none',
    borderBottom: `1px solid ${isDark ? 'rgba(75, 85, 99, 0.22)' : 'rgba(6, 23, 51, 0.06)'}`,
    boxShadow: 'none',
    paddingInline: quiet ? '16px' : '20px',
    marginBottom: 0,
    transition: 'all 0.15s ease',
  }}>
    {children}
  </section>
);

const HeaderRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    minWidth: 0,
    marginBottom: 2,
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
      from { opacity: 0; transform: translateX(-6px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .iab-chip-grid > div {
      flex: 1 1 180px;
      min-width: 0;
      max-width: 260px;
    }
    @media (max-width: 640px) {
      .iab-chip-grid { gap: 4px !important; padding-left: 8px !important; }
      .iab-chip-grid > div { flex: 1 1 100% !important; min-width: 0 !important; max-width: none !important; }
    }
    @media (max-width: 420px) {
      .iab-chip-grid > div { flex: 1 1 100% !important; }
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
