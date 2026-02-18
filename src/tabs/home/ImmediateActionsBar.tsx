import React, { useEffect, useState, useRef } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { ImmediateActionChip, ImmediateActionCategory } from './ImmediateActionChip';
import { Icon } from '@fluentui/react/lib/Icon';

// ─────────────────────────────────────────────────────────────────────────────
// Types (matches Home.tsx Action type)
// ─────────────────────────────────────────────────────────────────────────────

interface Action {
  title: string;
  onClick: () => void;
  icon: string;
  disabled?: boolean;
  category?: ImmediateActionCategory;
  count?: number;
  totalCount?: number;
  subtitle?: string;
}

interface ImmediateActionsBarProps {
  isDarkMode?: boolean;
  immediateActionsReady: boolean;
  immediateActionsList: Action[];
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

  // Empty state
  if (immediateActionsReady && allowEmptyState && actions.length === 0) {
    return (
      <Section isDark={isDark} seamless={seamless}>
        <Header text={headerText}>To Do</Header>
        <EmptyState isDark={isDark} collapsed={emptyCollapsed}>All caught up</EmptyState>
      </Section>
    );
  }

  const totalCount = actions.reduce((sum, a) => sum + (a.count ?? 1), 0);

  return (
    <Section isDark={isDark} seamless={seamless} highlighted={highlighted}>
      <Header text={headerText}>
        <CollapseChevron 
          isCollapsed={isCollapsed} 
          onClick={toggleCollapse} 
          isDark={isDark}
        />
        To Do
        {actions.length > 0 && <CountBadge isDark={isDark}>{totalCount}</CountBadge>}
        {!immediateActionsReady && <Spinner isDark={isDark} />}
        {showSuccess && <SuccessCheck />}
      </Header>

      {!isCollapsed && (
      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap',
        gap: 6,
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

            style={{ position: 'relative' }}
          >
            <ImmediateActionChip
              title={action.title}
              icon={action.icon}
              category={action.category}
              count={action.count}
              totalCount={action.totalCount}
              subtitle={action.subtitle}
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
      height: 30,
      minWidth: 140,
      borderRadius: 2,
      background: isDark ? 'rgba(54, 144, 206, 0.08)' : 'rgba(148, 163, 184, 0.15)',
    }}
  />
);

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const Section: React.FC<{ isDark: boolean; seamless?: boolean; highlighted?: boolean; children: React.ReactNode }> = ({ 
  isDark, 
  seamless = false,
  highlighted = false,
  children 
}) => (
  <section style={{
    padding: seamless ? '8px 0' : '10px 0',
    background: 'transparent',
    marginBottom: 0,
    transition: 'all 0.12s ease',
  }}>
    {children}
  </section>
);

const Header: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: text,
  }}>
    {children}
  </div>
);

const CollapseChevron: React.FC<{ 
  isCollapsed: boolean; 
  onClick: () => void; 
  isDark: boolean;
}> = ({ isCollapsed, onClick, isDark }) => {
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
        width: 18,
        height: 18,
        padding: 0,
        border: 'none',
        borderRadius: 3,
        background: hovered 
          ? (isDark ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)')
          : 'transparent',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        marginRight: 2,
      }}
    >
      <Icon 
        iconName={isCollapsed ? 'ChevronRight' : 'ChevronDown'}
        style={{
          fontSize: 10,
          color: hovered 
            ? (isDark ? colours.accent : colours.highlight)
            : (isDark ? colours.subtleGrey : colours.greyText),
          transition: 'color 0.15s ease, transform 0.15s ease',
          transform: hovered ? 'scale(1.1)' : 'scale(1)',
        }}
      />
    </button>
  );
};

const CountBadge: React.FC<{ isDark: boolean; children: React.ReactNode }> = ({ isDark, children }) => (
  <span style={{
    minWidth: 18,
    height: 18,
    padding: '0 5px',
    background: isDark ? 'rgba(214, 85, 65, 0.15)' : 'rgba(214, 85, 65, 0.1)',
    color: isDark ? '#f0a090' : '#d65541',
    fontSize: 10,
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
    maxHeight: collapsed ? 0 : 160,
    opacity: collapsed ? 0 : 1,
    transform: collapsed ? 'translateY(-4px)' : 'translateY(0)',
    overflow: 'hidden',
    transition: 'max-height 0.25s ease, opacity 0.2s ease, transform 0.25s ease',
  }} aria-hidden={collapsed}>
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      background: isDark ? 'rgba(32, 178, 108, 0.04)' : 'rgba(32, 178, 108, 0.06)',
      borderRadius: '2px',
      border: `1px dashed ${isDark ? 'rgba(32, 178, 108, 0.2)' : 'rgba(32, 178, 108, 0.25)'}`,
    }}>
      <svg 
        width="28" 
        height="28" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke={colours.green}
        strokeWidth="2" 
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginBottom: 10, opacity: 0.7 }}
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        color: colours.green,
        marginBottom: 2,
      }}>{children}</div>
      <div style={{
        fontSize: 11,
        color: isDark ? 'rgba(32, 178, 108, 0.5)' : 'rgba(32, 178, 108, 0.6)',
      }}>Nothing needs your attention</div>
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
