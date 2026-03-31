import React from 'react';
import { mergeStyles, keyframes } from '@fluentui/react/lib/Styling';
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
    ? 'rgba(10, 28, 50, 0.95)'
    : 'rgba(244, 244, 246, 0.96)',
  border: `1px solid ${dark ? 'rgba(75, 85, 99, 0.38)' : 'rgba(107, 107, 107, 0.14)'}`,
  borderRadius: 0,
  padding: variant === 'minimal' ? '12px' : '16px',
  boxShadow: dark
    ? '0 4px 16px rgba(0, 0, 0, 0.4)'
    : '0 3px 10px rgba(6, 23, 51, 0.08)',
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
      ? '0 6px 20px rgba(0, 0, 0, 0.5)'
      : '0 6px 16px rgba(6, 23, 51, 0.1)'
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
