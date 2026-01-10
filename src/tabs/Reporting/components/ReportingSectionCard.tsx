import React from 'react';
import { mergeStyles, keyframes } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';
import { useTheme } from '../../../app/functionality/ThemeContext';

interface ReportingSectionCardProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  animationDelay?: number;
  variant?: 'default' | 'metric' | 'minimal';
  style?: React.CSSProperties;
}

const enter = keyframes({
  '0%': { opacity: 0, transform: 'translateY(16px) scale(.98)' },
  '100%': { opacity: 1, transform: 'translateY(0) scale(1)' }
});

const cardClass = (dark: boolean, variant: string, delay: number) => mergeStyles({
  background: dark
    ? `linear-gradient(90deg, ${colours.dark.sectionBackground} 0%, ${colours.dark.cardBackground} 100%)`
    : `linear-gradient(90deg, ${colours.light.sectionBackground} 0%, ${colours.grey} 140%)`,
  border: `1px solid ${dark ? `${colours.highlight}2B` : `${colours.highlight}1A`}`,
  borderRadius: 8,
  padding: variant === 'minimal' ? '12px' : '16px',
  boxShadow: dark
    ? '0 2px 8px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.08)'
    : '0 2px 8px rgba(0,0,0,0.03), 0 1px 2px rgba(0,0,0,0.01)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  width: '100%',
  position: 'relative',
  animation: `${enter} .45s cubic-bezier(.4,0,.2,1) ${delay}s both`,
  transition: 'box-shadow .25s, transform .25s',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: dark
      ? '0 4px 16px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1)'
      : '0 4px 16px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.02)'
  }
});

const headerClass = mergeStyles({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
});

const titleClass = (dark: boolean) => mergeStyles({
  margin: '0',
  fontSize: '18px',
  fontWeight: 600,
  color: dark ? colours.dark.text : colours.light.text,
  letterSpacing: '0.3px',
  lineHeight: '1.2',
  textTransform: 'uppercase'
});

const subtitleClass = (dark: boolean) => mergeStyles({
  fontSize: '13px',
  fontWeight: 500,
  opacity: 0.75,
  margin: '0',
  color: dark ? colours.dark.text : colours.light.text
});

const ReportingSectionCard: React.FC<ReportingSectionCardProps> = ({
  title,
  subtitle,
  actions,
  children,
  id,
  animationDelay = 0,
  variant = 'default',
  style
}) => {
  const { isDarkMode } = useTheme();
  return (
    <section id={id} className={cardClass(isDarkMode, variant, animationDelay)} style={style}>
      {(title || actions) && (
        <div className={headerClass}>
          <div style={{ flex: 1 }}>
            {title && <h2 className={titleClass(isDarkMode)}>{title}</h2>}
            {subtitle && <p className={subtitleClass(isDarkMode)}>{subtitle}</p>}
          </div>
          {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
        </div>
      )}
      <div>{children}</div>
    </section>
  );
};

export default ReportingSectionCard;
