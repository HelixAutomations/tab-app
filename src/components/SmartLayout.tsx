import React, { ReactNode } from 'react';
import { useResponsiveLayout, createResponsiveStyles } from '../hooks/useResponsiveLayout';

interface SmartLayoutProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const SmartLayout: React.FC<SmartLayoutProps> = ({ children, className, style }) => {
  const layout = useResponsiveLayout();
  const styles = createResponsiveStyles(layout);

  return (
    <div
      className={`matter-opening-container ${className || ''}`}
      style={{
        ...styles.container,
        ...style
      }}
      data-breakpoint={layout.breakpoint}
      data-container-size={layout.containerSize}
    >
      {children}
    </div>
  );
};

interface SmartGridProps {
  children: ReactNode;
  columns?: number;
  minCardWidth?: number;
  gap?: number;
  className?: string;
}

export const SmartGrid: React.FC<SmartGridProps> = ({ 
  children, 
  columns,
  minCardWidth,
  gap,
  className 
}) => {
  const layout = useResponsiveLayout();
  const styles = createResponsiveStyles(layout);

  const gridStyle: React.CSSProperties = {
    ...styles.grid
  };

  if (columns && !layout.isCompact) {
    gridStyle.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  }

  if (minCardWidth) {
    gridStyle.gridTemplateColumns = layout.isMobile 
      ? '1fr' 
      : `repeat(auto-fit, minmax(${minCardWidth}px, 1fr))`;
  }

  if (gap) {
    gridStyle.gap = `${gap}px`;
  }

  return (
    <div
      className={`smart-grid ${className || ''}`}
      style={gridStyle}
    >
      {children}
    </div>
  );
};

interface SmartCardProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  interactive?: boolean;
}

export const SmartCard: React.FC<SmartCardProps> = ({ 
  children, 
  className, 
  style, 
  interactive = false 
}) => {
  const layout = useResponsiveLayout();
  const styles = createResponsiveStyles(layout);

  return (
    <div
      className={`smart-card ${className || ''}`}
      style={{
        ...styles.card,
        border: '1px solid #e5e7eb',
        backgroundColor: '#fff',
        transition: interactive ? 'all 0.2s ease' : 'none',
        cursor: interactive ? 'pointer' : 'default',
        ...style
      }}
    >
      {children}
    </div>
  );
};

interface SmartButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
}

export const SmartButton: React.FC<SmartButtonProps> = ({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'md',
  className,
  style
}) => {
  const layout = useResponsiveLayout();
  const styles = createResponsiveStyles(layout);

  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          background: disabled ? '#f3f4f6' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          color: disabled ? '#9ca3af' : '#fff',
          border: '1px solid transparent'
        };
      case 'secondary':
        return {
          background: disabled ? '#f9fafb' : '#fff',
          color: disabled ? '#9ca3af' : '#374151',
          border: `1px solid ${disabled ? '#e5e7eb' : '#d1d5db'}`
        };
      case 'ghost':
        return {
          background: 'transparent',
          color: disabled ? '#9ca3af' : '#6b7280',
          border: '1px solid transparent'
        };
      default:
        return {};
    }
  };

  const getSizeMultiplier = () => {
    switch (size) {
      case 'sm': return 0.8;
      case 'lg': return 1.2;
      default: return 1;
    }
  };

  const sizeMultiplier = getSizeMultiplier();

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`smart-button ${className || ''}`}
      style={{
        ...styles.button,
        padding: layout.isCompact 
          ? `${8 * sizeMultiplier}px ${12 * sizeMultiplier}px`
          : `${12 * sizeMultiplier}px ${16 * sizeMultiplier}px`,
        fontSize: `${(layout.isCompact ? 14 : 16) * sizeMultiplier}px`,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: `${layout.optimalSpacing * 0.5}px`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        ...getVariantStyles(),
        ...style
      }}
    >
      {children}
    </button>
  );
};

interface SmartTypographyProps {
  children: ReactNode;
  variant: 'title' | 'subtitle' | 'body' | 'caption';
  className?: string;
  style?: React.CSSProperties;
}

export const SmartTypography: React.FC<SmartTypographyProps> = ({
  children,
  variant,
  className,
  style
}) => {
  const layout = useResponsiveLayout();
  const styles = createResponsiveStyles(layout);

  const getVariantStyles = () => {
    switch (variant) {
      case 'title':
        return {
          fontSize: layout.isCompact ? '18px' : '24px',
          lineHeight: 1.4,
          fontWeight: 600,
          color: '#111827'
        };
      case 'subtitle':
        return {
          fontSize: layout.isCompact ? '14px' : '16px',
          lineHeight: 1.5,
          fontWeight: 500,
          color: '#374151'
        };
      case 'body':
        return {
          fontSize: layout.isCompact ? '14px' : '16px',
          lineHeight: 1.5,
          color: '#4b5563'
        };
      case 'caption':
        return {
          fontSize: layout.isCompact ? '12px' : '14px',
          lineHeight: 1.4,
          color: '#6b7280'
        };
      default:
        return {};
    }
  };

  const Component = variant === 'title' ? 'h2' : 
                   variant === 'subtitle' ? 'h3' : 
                   variant === 'caption' ? 'small' : 'p';

  return React.createElement(Component, {
    className: `smart-typography smart-typography--${variant} ${className || ''}`,
    style: {
      margin: 0,
      ...getVariantStyles(),
      ...style
    }
  }, children);
};

// Context provider for responsive features
interface ResponsiveContextValue {
  layout: ReturnType<typeof useResponsiveLayout>;
  styles: ReturnType<typeof createResponsiveStyles>;
}

const ResponsiveContext = React.createContext<ResponsiveContextValue | null>(null);

export const ResponsiveProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const layout = useResponsiveLayout();
  const styles = createResponsiveStyles(layout);

  return (
    <ResponsiveContext.Provider value={{ layout, styles }}>
      {children}
    </ResponsiveContext.Provider>
  );
};

export const useResponsiveContext = () => {
  const context = React.useContext(ResponsiveContext);
  if (!context) {
    throw new Error('useResponsiveContext must be used within ResponsiveProvider');
  }
  return context;
};