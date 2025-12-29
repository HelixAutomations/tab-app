import React, { useEffect, useState, useRef } from 'react';
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
  
  // Urgency tooltip state - shows once per session for rate change notices
  const [showUrgencyTooltip, setShowUrgencyTooltip] = useState(false);
  const [tooltipDismissed, setTooltipDismissed] = useState(false);
  const rateChangeChipRef = useRef<HTMLDivElement>(null);

  const loading = !immediateActionsReady;
  const actions = immediateActionsList;
  
  // Check if there's a rate change action
  const rateChangeAction = actions.find(a => a.title.toLowerCase().includes('rate change'));
  const rateChangeIndex = actions.findIndex(a => a.title.toLowerCase().includes('rate change'));

  // Show success briefly when loading completes with no actions
  useEffect(() => {
    if (immediateActionsReady && actions.length === 0) {
      setShowSuccess(true);
      const timer = setTimeout(() => setShowSuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [immediateActionsReady, actions.length]);
  
  // Show urgency tooltip for rate change action - once per session, auto-dismiss after 8 seconds
  useEffect(() => {
    if (immediateActionsReady && rateChangeAction && !tooltipDismissed) {
      // Check if already shown this session
      const alreadyShown = sessionStorage.getItem('rateChangeUrgencyShown');
      if (!alreadyShown) {
        // Delay showing slightly so chips render first
        const showTimer = setTimeout(() => {
          setShowUrgencyTooltip(true);
          sessionStorage.setItem('rateChangeUrgencyShown', 'true');
        }, 600);
        
        return () => clearTimeout(showTimer);
      }
    }
  }, [immediateActionsReady, rateChangeAction, tooltipDismissed]);
  
  // Auto-dismiss tooltip after 8 seconds
  useEffect(() => {
    if (showUrgencyTooltip) {
      const dismissTimer = setTimeout(() => {
        setShowUrgencyTooltip(false);
        setTooltipDismissed(true);
      }, 8000);
      return () => clearTimeout(dismissTimer);
    }
  }, [showUrgencyTooltip]);

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
        position: 'relative',
      }}>
        {actions.map((action, idx) => (
          <div 
            key={`${action.title}-${idx}`} 
            ref={idx === rateChangeIndex ? rateChangeChipRef : undefined}
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
            {/* Urgency tooltip - appears attached to rate change chip */}
            {idx === rateChangeIndex && showUrgencyTooltip && (
              <UrgencyTooltip 
                isDark={isDark} 
                onDismiss={() => {
                  setShowUrgencyTooltip(false);
                  setTooltipDismissed(true);
                }}
                onClick={action.onClick}
              />
            )}
          </div>
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

// Urgency tooltip that animates out from the rate change chip
const UrgencyTooltip: React.FC<{ isDark: boolean; onDismiss: () => void; onClick: () => void }> = ({ isDark, onDismiss, onClick }) => (
  <div 
    className="urgency-tooltip"
    style={{
      position: 'absolute',
      top: 'calc(100% + 8px)',
      left: 0,
      zIndex: 1000,
      minWidth: 260,
      maxWidth: 320,
      padding: '10px 12px',
      background: isDark 
        ? 'linear-gradient(135deg, rgba(30, 30, 35, 0.98) 0%, rgba(40, 35, 35, 0.98) 100%)'
        : 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 252, 250, 0.98) 100%)',
      border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.25)'}`,
      borderRadius: 6,
      boxShadow: isDark 
        ? '0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(239, 68, 68, 0.15)'
        : '0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(239, 68, 68, 0.1)',
      animation: 'urgencyTooltipIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
    }}
  >
    {/* Arrow pointing up */}
    <div style={{
      position: 'absolute',
      top: -6,
      left: 16,
      width: 12,
      height: 12,
      background: isDark ? 'rgba(30, 30, 35, 0.98)' : 'rgba(255, 255, 255, 0.98)',
      border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.25)'}`,
      borderRight: 'none',
      borderBottom: 'none',
      transform: 'rotate(45deg)',
    }} />
    
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      {/* Alert icon - professional, not playful */}
      <svg 
        width="16" 
        height="16" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="#ef4444" 
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, marginTop: 1 }}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      
      <div style={{ flex: 1 }}>
        <div style={{ 
          fontSize: 12, 
          fontWeight: 600, 
          color: '#ef4444',
          marginBottom: 4,
        }}>
          Year-End Deadline
        </div>
        <div style={{ 
          fontSize: 11, 
          color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.7)',
          lineHeight: 1.4,
        }}>
          Please action outstanding rate change notices before 1st January.
        </div>
      </div>
      
      {/* Dismiss button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 2,
          cursor: 'pointer',
          color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)',
          fontSize: 12,
          lineHeight: 1,
          flexShrink: 0,
        }}
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  </div>
);

// CSS animation for spinner and urgency tooltip
const style = document.createElement('style');
style.textContent = `
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes urgencyTooltipIn {
  0% { 
    opacity: 0; 
    transform: translateY(-8px) scale(0.95);
  }
  100% { 
    opacity: 1; 
    transform: translateY(0) scale(1);
  }
}
`;
if (!document.head.querySelector('style[data-immediate-actions]')) {
  style.setAttribute('data-immediate-actions', '');
  document.head.appendChild(style);
}

export default ImmediateActionsBar;
