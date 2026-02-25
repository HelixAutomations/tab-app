import React from 'react';
import { mergeStyles, Stack, keyframes } from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

/**
 * Enhanced section container with sophisticated styling and animations.
 * Provides consistent elevated surfaces with smooth transitions.
 */
interface SectionCardProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  styleOverrides?: React.CSSProperties;
  id?: string;
  variant?: 'default' | 'elevated' | 'minimal';
  animationDelay?: number;
}

const slideUpFade = keyframes({
  '0%': {
    opacity: 0,
    transform: 'translateY(20px)',
  },
  '100%': {
    opacity: 1,
    transform: 'translateY(0)',
  },
});

const baseClass = (isDark: boolean, variant: string, animationDelay: number) => mergeStyles({
  // Dark: solid brand surfaces. Light: helix grey cards on white canvas.
  background: isDark
    ? (variant === 'minimal'
      ? colours.dark.background
      : colours.dark.sectionBackground)
    : (variant === 'minimal'
      ? '#FFFFFF'
      : colours.grey),
  padding: variant === 'minimal' ? '12px' : '18px',
  borderRadius: '2px',
  border: isDark
    ? `1px solid rgba(54, 144, 206, 0.18)`
    : 'none',
  borderLeft: isDark
    ? undefined
    : `4px solid ${colours.highlightBlue}`,
  boxShadow: isDark
    ? (variant === 'elevated'
      ? '0 4px 20px rgba(0,0,0,0.5)'
      : '0 2px 12px rgba(0,0,0,0.4)')
    : 'none',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: variant === 'minimal' ? '8px' : '12px',
  position: 'relative',
  transition: 'all 0.15s ease',
  animation: `${slideUpFade} 0.4s ease ${animationDelay}s both`,
  overflow: 'hidden',
  // Accent gradient line — Helix signature on dark section cards
  ...(isDark && variant !== 'minimal' ? {
    '&::after': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '2px',
      background: 'linear-gradient(90deg, transparent 0%, rgba(54, 144, 206, 0.35) 30%, rgba(135, 243, 243, 0.18) 50%, rgba(54, 144, 206, 0.35) 70%, transparent 100%)',
    },
  } : {}),
  '&:hover': isDark
    ? {
      borderColor: 'rgba(54, 144, 206, 0.3)',
      boxShadow: variant === 'elevated'
        ? '0 6px 28px rgba(0,0,0,0.5)'
        : '0 4px 20px rgba(0,0,0,0.45)',
    }
    : {
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    },
});

const headerClass = (isDark: boolean, hasSubtitle: boolean) => mergeStyles({
  display: 'flex',
  alignItems: hasSubtitle ? 'flex-start' : 'center',
  justifyContent: 'space-between',
  marginBottom: hasSubtitle ? '8px' : '4px',
  position: 'relative',
});

const titleClass = (isDark: boolean) => mergeStyles({
  fontWeight: '600',
  fontSize: '18px',
  lineHeight: '1.2',
  color: isDark ? colours.dark.text : colours.light.text,
  margin: 0,
});

const subtitleClass = (isDark: boolean) => mergeStyles({
  fontSize: '14px',
  fontWeight: '500',
  color: isDark ? colours.dark.text : colours.light.text,
  marginTop: '4px',
  lineHeight: '1.4',
  opacity: 0.8,
});

const contentContainerClass = mergeStyles({
  position: 'relative',
  zIndex: 1,
});

const SectionCard: React.FC<SectionCardProps> = ({ 
  title, 
  subtitle, 
  actions, 
  children, 
  styleOverrides, 
  id, 
  variant = 'default',
  animationDelay = 0
}) => {
  const { isDarkMode } = useTheme();
  
  return (
    <section 
      id={id} 
      className={baseClass(isDarkMode, variant, animationDelay)} 
      style={styleOverrides} 
      aria-labelledby={title ? `${id || title}-heading` : undefined}
    >
      {(title || actions) && (
        <div className={headerClass(isDarkMode, !!subtitle)}>
          <div>
            {title && (
              <h2
                id={`${id || title}-heading`}
                className={titleClass(isDarkMode)}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p className={subtitleClass(isDarkMode)}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
        </div>
      )}
      <div className={contentContainerClass}>
        <Stack tokens={{ childrenGap: variant === 'minimal' ? 6 : 10 }}>
          {children}
        </Stack>
      </div>
    </section>
  );
};

export default SectionCard;
