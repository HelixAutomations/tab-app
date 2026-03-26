import React from 'react';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Icon } from '@fluentui/react/lib/Icon';
import { CSSTransition } from 'react-transition-group';
import '../../../app/styles/toast.css';

interface OperationStatusToastProps {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  loading?: boolean;
  details?: string;
  progress?: number; // 0-100 for progress bar
  icon?: string;
  isDarkMode?: boolean;
}

const OperationStatusToast: React.FC<OperationStatusToastProps> = ({ 
  visible, 
  message, 
  type, 
  loading, 
  details,
  progress,
  icon,
  isDarkMode = false
}) => {
  const nodeRef = React.useRef<HTMLDivElement>(null);

  const messageBarType = type === 'success' 
    ? MessageBarType.success 
    : type === 'error' 
    ? MessageBarType.error 
    : type === 'warning'
    ? MessageBarType.warning
    : MessageBarType.info;

  const getTypeIcon = () => {
    if (icon) return icon;
    switch (type) {
      case 'success': return 'CheckMark';
      case 'error': return 'ErrorBadge';
      case 'warning': return 'Warning';
      case 'info': return 'Info';
      default: return 'Info';
    }
  };

  const getTypeColor = () => {
    switch (type) {
      case 'success': return '#20b26c';  // colours.green
      case 'error': return '#D65541';    // colours.cta
      case 'warning': return '#FF8C00';  // colours.orange
      case 'info': return '#3690CE';     // colours.highlight
      default: return '#3690CE';
    }
  };

  return (
    <CSSTransition in={visible} timeout={300} classNames="toast" unmountOnExit nodeRef={nodeRef}>
      <div
        ref={nodeRef}
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          maxWidth: 400,
          minWidth: 320,
          zIndex: 2000,
          background: isDarkMode ? '#081c30' : '#FFFFFF',
          borderRadius: 0,
          boxShadow: isDarkMode 
            ? '0 10px 25px rgba(0, 0, 0, 0.4), 0 4px 6px rgba(0, 0, 0, 0.25)'
            : '0 10px 25px rgba(0, 0, 0, 0.12), 0 4px 6px rgba(0, 0, 0, 0.06)',
          border: `1px solid ${getTypeColor()}`,
          overflow: 'hidden',
          fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        {/* Progress bar */}
        {(loading || typeof progress === 'number') && (
          <div
            style={{
              height: '3px',
              background: 'rgba(54, 144, 206, 0.1)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                height: '100%',
                background: `linear-gradient(90deg, ${getTypeColor()}, ${getTypeColor()}dd)`,
                width: typeof progress === 'number' ? `${progress}%` : '100%',
                transition: 'width 0.3s ease',
                animation: loading && typeof progress !== 'number' ? 'toast-loading 2s ease-in-out infinite' : 'none'
              }}
            />
          </div>
        )}
        
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            {/* Icon or Spinner */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              flexShrink: 0,
              marginTop: '2px'
            }}>
              {loading ? (
                <Spinner size={SpinnerSize.small} 
                  styles={{ 
                    root: { 
                      width: '20px', 
                      height: '20px'
                    },
                    circle: {
                      borderColor: `${getTypeColor()} transparent transparent transparent`
                    }
                  }} 
                />
              ) : (
                <Icon 
                  iconName={getTypeIcon()} 
                  styles={{ 
                    root: { 
                      fontSize: '18px', 
                      color: getTypeColor(),
                      fontWeight: 600
                    } 
                  }} 
                />
              )}
            </div>
            
            {/* Message Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: isDarkMode ? '#f3f4f6' : '#061733',
                lineHeight: '1.4',
                marginBottom: details ? '4px' : 0
              }}>
                {message}
              </div>
              
              {details && (
                <div style={{
                  fontSize: '13px',
                  color: isDarkMode ? '#A0A0A0' : '#6B6B6B',
                  lineHeight: '1.4',
                  fontWeight: 400
                }}>
                  {details}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </CSSTransition>
  );
};

export default OperationStatusToast;