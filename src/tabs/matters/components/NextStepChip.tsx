import React from 'react';
import { Icon } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';

export interface NextStepChipProps {
  title: string;
  subtitle?: string;
  icon: string;
  isDarkMode: boolean;
  onClick: () => void;
  category?: 'critical' | 'standard' | 'success' | 'warning';
}

const NextStepChip: React.FC<NextStepChipProps> = ({
  title, subtitle, icon, isDarkMode, onClick, category = 'standard',
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const text = isDarkMode ? '#f1f5f9' : '#1e293b';
  const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
  const categoryColor = category === 'critical' ? colours.cta
    : category === 'warning' ? colours.orange
    : category === 'success' ? colours.green
    : colours.highlight;

  return (
    <button
      type="button"
      aria-label={title}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', minWidth: 140, maxWidth: 320,
        background: isHovered
          ? (isDarkMode
            ? 'linear-gradient(90deg, rgba(24,36,58,0.98) 0%, rgba(34,48,70,0.95) 100%)'
            : 'linear-gradient(90deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.95) 100%)')
          : (isDarkMode
            ? 'linear-gradient(90deg, rgba(18,28,48,0.95) 0%, rgba(28,40,60,0.92) 100%)'
            : 'linear-gradient(90deg, rgba(255,255,255,0.95) 0%, rgba(250,251,252,0.9) 100%)'),
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        color: text,
        borderTop: `1px solid ${isHovered ? (isDarkMode ? 'rgba(54,144,206,0.35)' : 'rgba(54,144,206,0.2)') : (isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(148,163,184,0.15)')}`,
        borderRight: `1px solid ${isHovered ? (isDarkMode ? 'rgba(54,144,206,0.35)' : 'rgba(54,144,206,0.2)') : (isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(148,163,184,0.15)')}`,
        borderBottom: `1px solid ${isHovered ? (isDarkMode ? 'rgba(54,144,206,0.35)' : 'rgba(54,144,206,0.2)') : (isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(148,163,184,0.15)')}`,
        borderLeft: `3px solid ${categoryColor}`,
        borderRadius: 2,
        boxShadow: isHovered
          ? (isDarkMode ? '0 4px 16px rgba(0,0,0,0.35)' : '0 4px 16px rgba(0,0,0,0.08)')
          : (isDarkMode ? '0 2px 8px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.04)'),
        cursor: 'pointer',
        transition: 'all 0.12s ease',
        transform: isHovered ? 'translateY(-1px) scale(1.01)' : 'translateY(0) scale(1)',
        textAlign: 'left' as const,
        fontFamily: 'inherit',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{
        width: 24, height: 24, borderRadius: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, color: categoryColor,
        background: isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.08)',
        transition: 'transform 0.12s ease',
        transform: isHovered ? 'scale(1.1)' : 'scale(1)',
      }}>
        <Icon iconName={icon} styles={{ root: { fontSize: 14 } }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontSize: 12, fontWeight: 600, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            fontSize: 10, color: textMuted, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {subtitle}
          </div>
        )}
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
        <path d="M9 6l6 6-6 6" stroke={textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
};

export default NextStepChip;
