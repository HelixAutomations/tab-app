import React from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  illustration?: 'search' | 'filter' | 'data' | 'custom';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Modern empty state component inspired by communications dashboard
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  illustration = 'search',
  size = 'md'
}) => {
  const { isDarkMode } = useTheme();
  
  const sizeMap = {
    sm: { padding: 32, iconSize: 48, titleSize: 16, descSize: 13 },
    md: { padding: 48, iconSize: 64, titleSize: 18, descSize: 14 },
    lg: { padding: 80, iconSize: 80, titleSize: 20, descSize: 15 }
  };
  
  const { padding, iconSize, titleSize, descSize } = sizeMap[size];
  
  const getIllustrationIcon = () => {
    const iconProps = {
      width: iconSize,
      height: iconSize,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5
    };
    
    switch (illustration) {
      case 'search':
        return (
          <svg {...iconProps} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        );
      case 'filter':
        return (
          <svg {...iconProps} viewBox="0 0 24 24">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        );
      case 'data':
        return (
          <svg {...iconProps} viewBox="0 0 24 24">
            <path d="M3 3h18v18H3zM9 9h6v6H9z" />
            <path d="M9 3v6M15 3v6M3 9h18M3 15h18" />
          </svg>
        );
      default:
        return icon;
    }
  };
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      padding: padding,
      textAlign: 'center',
      gap: 20,
      background: 'transparent'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: iconSize + 16,
        height: iconSize + 16,
        borderRadius: 8,
        background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
        color: isDarkMode ? colours.dark.subText : colours.light.subText,
        opacity: 0.6
      }}>
        {getIllustrationIcon()}
      </div>
      
      <div style={{ maxWidth: 400 }}>
        <h3 style={{
          fontSize: titleSize,
          fontWeight: 600,
          color: isDarkMode ? colours.dark.text : colours.light.text,
          fontFamily: 'Raleway, sans-serif',
          margin: 0,
          marginBottom: 8,
          letterSpacing: '-0.2px'
        }}>
          {title}
        </h3>
        
        <p style={{
          fontSize: descSize,
          lineHeight: 1.5,
          color: isDarkMode ? colours.dark.subText : colours.light.subText,
          fontFamily: 'Raleway, sans-serif',
          margin: 0,
          opacity: 0.9
        }}>
          {description}
        </p>
      </div>
      
      {action && (
        <button
          onClick={action.onClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 20px',
            borderRadius: 6,
            border: action.variant === 'secondary' 
              ? `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`
              : 'none',
            background: action.variant === 'secondary'
              ? 'transparent'
              : colours.highlight,
            color: action.variant === 'secondary'
              ? (isDarkMode ? colours.dark.text : colours.light.text)
              : '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'Raleway, sans-serif',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            outline: 'none'
          }}
          onMouseEnter={(e) => {
            if (action.variant === 'secondary') {
              e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
            } else {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(54, 144, 206, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (action.variant === 'secondary') {
              e.currentTarget.style.background = 'transparent';
            } else {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;