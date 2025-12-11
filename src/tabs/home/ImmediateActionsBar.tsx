import React, { useEffect, useState } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { ImmediateActionChip, ImmediateActionCategory } from './ImmediateActionChip';

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

  const loading = !immediateActionsReady;
  const actions = immediateActionsList;

  // Show success briefly when loading completes with no actions
  useEffect(() => {
    if (immediateActionsReady && actions.length === 0) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [immediateActionsReady, actions.length]);

  // Colors
  const headerText = isDark ? '#94a3b8' : '#64748b';
  const border = isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)';

  // Empty state
  if (!loading && actions.length === 0) {
    return (
      <Section isDark={isDark} seamless={seamless}>
        <Header text={headerText}>To Do</Header>
        <EmptyState isDark={isDark}>All caught up</EmptyState>
      </Section>
    );
  }

  const totalCount = actions.reduce((sum, a) => sum + (a.count ?? 1), 0);

  return (
    <Section isDark={isDark} seamless={seamless} highlighted={highlighted}>
      <Header text={headerText}>
        To Do
        {actions.length > 0 && <CountBadge isDark={isDark}>{totalCount}</CountBadge>}
        {loading && <Spinner isDark={isDark} />}
        {showSuccess && <SuccessCheck />}
      </Header>

      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap',
        gap: 6,
        borderTop: `1px solid ${border}`,
        paddingTop: 8,
      }}>
        {actions.map((action, idx) => (
          <ImmediateActionChip
            key={`${action.title}-${idx}`}
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
        ))}
      </div>
    </Section>
  );
};

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
    padding: seamless ? '8px 12px' : '12px 16px',
    // Use transparent background - the parent .immediate-actions-portal handles the themed background via CSS
    background: highlighted 
      ? (isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)')
      : 'transparent',
    borderBottom: seamless ? 'none' : `1px solid ${isDark ? 'rgba(148, 163, 184, 0.06)' : 'rgba(0, 0, 0, 0.03)'}`,
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

const CountBadge: React.FC<{ isDark: boolean; children: React.ReactNode }> = ({ isDark, children }) => (
  <span style={{
    minWidth: 18,
    height: 18,
    padding: '0 5px',
    background: isDark ? 'rgba(248, 113, 113, 0.15)' : 'rgba(220, 38, 38, 0.1)',
    color: isDark ? '#fca5a5' : '#dc2626',
    fontSize: 10,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }}>
    {children}
  </span>
);

const EmptyState: React.FC<{ isDark: boolean; children: React.ReactNode }> = ({ isDark, children }) => (
  <div style={{
    padding: '20px 0',
    textAlign: 'center',
    color: isDark ? '#64748b' : '#94a3b8',
    fontSize: 13,
    fontWeight: 500,
  }}>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginBottom: 8, opacity: 0.5 }}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
    <div>{children}</div>
  </div>
);

const Spinner: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <div style={{
    width: 12,
    height: 12,
    border: `2px solid ${isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
    borderTopColor: isDark ? '#60a5fa' : '#3b82f6',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginLeft: 'auto',
  }} />
);

const SuccessCheck: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" style={{ marginLeft: 'auto' }}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

// CSS animation for spinner
const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
if (!document.head.querySelector('style[data-immediate-actions]')) {
  style.setAttribute('data-immediate-actions', '');
  document.head.appendChild(style);
}

export default ImmediateActionsBar;
