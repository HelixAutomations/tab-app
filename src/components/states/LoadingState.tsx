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
 * Modern loading state component inspired by communications dashboard
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
        color: isDarkMode ? '#94a3b8' : '#64748b',
        fontSize: fontSize,
        fontFamily: "'Raleway', -apple-system, BlinkMacSystemFont, sans-serif",
        fontWeight: '500'
      }}>
        <div style={{
          width: spinner,
          height: spinner,
          border: `2px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
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
      background: isDarkMode ? '#1e293b' : '#ffffff',
      border: isDarkMode ? '1px solid #334155' : '1px solid #e2e8f0',
      borderRadius: '8px',
      boxShadow: isDarkMode 
        ? '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)'
        : '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
      color: isDarkMode ? '#cbd5e1' : '#475569',
      textAlign: 'center',
      minWidth: size === 'sm' ? '120px' : size === 'md' ? '160px' : '200px'
    }}>
      {icon && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size === 'sm' ? 40 : size === 'md' ? 48 : 56,
          height: size === 'sm' ? 40 : size === 'md' ? 48 : 56,
          borderRadius: '8px',
          background: isDarkMode ? '#334155' : '#f1f5f9',
          color: colours.highlight,
          marginBottom: 8
        }}>
          {icon}
        </div>
      )}
      
      <div style={{
        width: spinner,
        height: spinner,
        border: `2px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
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
            color: isDarkMode ? '#94a3b8' : '#64748b',
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