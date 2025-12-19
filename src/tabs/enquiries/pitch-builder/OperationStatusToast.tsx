import React from 'react';
import { MessageBar, MessageBarType, Spinner, SpinnerSize, Icon } from '@fluentui/react';
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
      case 'success': return '#10B981';
      case 'error': return '#EF4444';
      case 'warning': return '#F59E0B';
      case 'info': return '#3690CE';
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
          background: isDarkMode ? '#1E293B' : '#FFFFFF',
          borderRadius: '12px',
          boxShadow: isDarkMode 
            ? '0 10px 25px rgba(0, 0, 0, 0.3), 0 4px 6px rgba(0, 0, 0, 0.2)'
            : '0 10px 25px rgba(0, 0, 0, 0.15), 0 4px 6px rgba(0, 0, 0, 0.1)',
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
                color: isDarkMode ? '#E2E8F0' : '#1E293B',
                lineHeight: '1.4',
                marginBottom: details ? '4px' : 0
              }}>
                {message}
              </div>
              
              {details && (
                <div style={{
                  fontSize: '13px',
                  color: isDarkMode ? '#94A3B8' : '#64748B',
                  lineHeight: '1.4',
                  fontWeight: 400
                }}>
                  {details}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Enhanced CSS for animations */}
        <style>{`
          @keyframes toast-loading {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
          
          .toast-enter {
            opacity: 0;
            transform: translateX(100%) scale(0.9);
          }
          
          .toast-enter-active {
            opacity: 1;
            transform: translateX(0) scale(1);
            transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
          }
          
          .toast-exit {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
          
          .toast-exit-active {
            opacity: 0;
            transform: translateX(100%) scale(0.9);
            transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
          }
        `}</style>
      </div>
    </CSSTransition>
  );
};

export default OperationStatusToast;