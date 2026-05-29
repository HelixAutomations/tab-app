import React from 'react';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import type { IconType } from 'react-icons';
import { FiAlertCircle, FiAlertTriangle, FiCheckCircle, FiInfo } from 'react-icons/fi';
import { CSSTransition } from 'react-transition-group';
import { colours } from '../../../app/styles/colours';
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
  actionLabel?: string;
  onAction?: () => void;
}

const OperationStatusToast: React.FC<OperationStatusToastProps> = ({ 
  visible, 
  message, 
  type, 
  loading, 
  details,
  progress,
  icon,
  isDarkMode = false,
  actionLabel,
  onAction,
}) => {
  const nodeRef = React.useRef<HTMLDivElement>(null);

  const getTypeIcon = (): IconType => {
    const requested = String(icon || '').toLowerCase();
    if (requested.includes('check') || requested.includes('accept')) return FiCheckCircle;
    if (requested.includes('error') || requested.includes('blocked')) return FiAlertCircle;
    if (requested.includes('warning')) return FiAlertTriangle;
    if (requested.includes('info')) return FiInfo;
    switch (type) {
      case 'success': return FiCheckCircle;
      case 'error': return FiAlertCircle;
      case 'warning': return FiAlertTriangle;
      case 'info': return FiInfo;
      default: return FiInfo;
    }
  };

  const getTypeColor = () => {
    switch (type) {
      case 'success': return colours.green;
      case 'error': return colours.cta;
      case 'warning': return colours.orange;
      case 'info': return colours.highlight;
      default: return colours.highlight;
    }
  };

  const TypeIcon = getTypeIcon();

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
                <TypeIcon size={18} color={getTypeColor()} strokeWidth={2.4} aria-hidden="true" />
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

              {actionLabel && onAction && (
                <button
                  type="button"
                  onClick={onAction}
                  style={{
                    marginTop: 8,
                    padding: '4px 0',
                    border: 'none',
                    background: 'transparent',
                    color: getTypeColor(),
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.2px',
                    cursor: 'pointer',
                  }}
                >
                  {actionLabel}
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
    </CSSTransition>
  );
};

export default OperationStatusToast;