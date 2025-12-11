import React from 'react';
import { mergeStyles, Stack, Text, keyframes } from '@fluentui/react';
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
  // Use a subtle dark gradient for default/elevated variants in dark mode; keep minimal flat
  background: isDark
    ? (variant === 'minimal'
      ? colours.dark.sectionBackground
      : 'linear-gradient(135deg, #0B1224 0%, #0F1B33 100%)')
    : undefined,
  backgroundColor: isDark ? undefined : colours.light.sectionBackground,
  padding: variant === 'minimal' ? '12px' : '16px',
  borderRadius: '2px',
  border: `1px solid ${isDark ? colours.dark.border : colours.light.border}`,
  boxShadow: variant === 'elevated' 
    ? isDark 
      ? '0 4px 16px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.1)' 
      : '0 4px 16px rgba(0,0,0,0.04), 0 1px 4px rgba(0,0,0,0.02)'
    : isDark
      ? '0 2px 8px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.08)'
      : '0 2px 8px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.01)',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: variant === 'minimal' ? '8px' : '12px',
  position: 'relative',
  transition: 'all 0.2s ease',
  animation: `${slideUpFade} 0.4s ease ${animationDelay}s both`,
  overflow: 'hidden',
  '&:hover': {
    transform: 'translateY(-1px)',
    boxShadow: variant === 'elevated'
      ? isDark
        ? '0 6px 24px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)'
        : '0 6px 24px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)'
      : isDark
        ? '0 4px 16px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1)'
        : '0 4px 16px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.02)',
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
