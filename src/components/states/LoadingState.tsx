import React from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

interface LoadingStateProps {
  message?: string;
  subMessage?: string;
  size?: 'sm' | 'md' | 'lg';
  inline?: boolean;
  icon?: React.ReactNode;
}

/**
 * Modern loading state component — Helix brand tokens only.
 */
const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  subMessage,
  size = 'md',
  inline = false,
  icon
}) => {
  const { isDarkMode } = useTheme();
  
  const sizeMap = {
    sm: { container: 32, spinner: 16, fontSize: 12, padding: 12 },
    md: { container: 48, spinner: 20, fontSize: 13, padding: 16 },
    lg: { container: 80, spinner: 24, fontSize: 14, padding: 24 }
  };
  
  const { container, spinner, fontSize, padding } = sizeMap[size];
  
  if (inline) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: isDarkMode ? colours.subtleGrey : colours.greyText,
        fontSize: fontSize,
        fontFamily: "'Raleway', -apple-system, BlinkMacSystemFont, sans-serif",
        fontWeight: '500'
      }}>
        <div style={{
          width: spinner,
          height: spinner,
          border: `2px solid ${isDarkMode ? colours.dark.border : 'rgba(244, 244, 246, 0.7)'}`,
          borderTopColor: colours.highlight,
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite'
        }} />
        <span>{message}</span>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      padding: padding,
      gap: 16,
      background: 'transparent',
      color: isDarkMode ? '#d1d5db' : colours.greyText,
      textAlign: 'center' as const,
      minWidth: size === 'sm' ? '120px' : size === 'md' ? '160px' : '200px'
    }}>
      {icon && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size === 'sm' ? 40 : size === 'md' ? 48 : 56,
          height: size === 'sm' ? 40 : size === 'md' ? 48 : 56,
          borderRadius: 0,
          background: isDarkMode ? colours.dark.sectionBackground : 'rgba(244, 244, 246, 0.8)',
          color: isDarkMode ? colours.accent : colours.highlight,
          marginBottom: 8
        }}>
          {icon}
        </div>
      )}
      
      <div style={{
        width: spinner,
        height: spinner,
        border: `2px solid ${isDarkMode ? colours.dark.border : 'rgba(160, 160, 160, 0.18)'}`,
        borderTopColor: colours.highlight,
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        marginBottom: 8
      }} />
      
      <div>
        <div style={{
          fontSize: fontSize,
          fontWeight: '600',
          fontFamily: "'Raleway', -apple-system, BlinkMacSystemFont, sans-serif",
          color: isDarkMode ? colours.dark.text : colours.light.text,
          marginBottom: subMessage ? 4 : 0,
          letterSpacing: '-0.1px'
        }}>
          {message}
        </div>
        {subMessage && (
          <div style={{
            fontSize: fontSize - 1,
            fontFamily: "'Raleway', -apple-system, BlinkMacSystemFont, sans-serif",
            color: isDarkMode ? colours.subtleGrey : colours.greyText,
            fontWeight: '500'
          }}>
            {subMessage}
          </div>
        )}  
      </div>
      
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LoadingState;