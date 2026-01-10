/**
 * Global Toast Notification System
 * 
 * Provides app-wide toast notifications with consistent styling.
 * Matches the Helix design system - dark, professional aesthetic.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { mergeStyles } from '@fluentui/react';
import { FaCheck, FaTimes, FaInfoCircle, FaExclamationTriangle, FaSpinner } from 'react-icons/fa';
import { ANIMATION_DURATION, EASING } from '../../app/styles/animations';

// Toast types
export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => string;
  hideToast: (id: string) => void;
  updateToast: (id: string, updates: Partial<Omit<Toast, 'id'>>) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: React.ReactNode;
  isDarkMode?: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxToasts?: number;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  isDarkMode = false,
  position = 'bottom-right',
  maxToasts = 5,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdCounter = useRef(0);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const showToast = useCallback((toast: Omit<Toast, 'id'>): string => {
    const id = `toast-${++toastIdCounter.current}-${Date.now()}`;
    const newToast: Toast = { ...toast, id };
    
    setToasts(prev => {
      const updated = [newToast, ...prev];
      // Remove excess toasts
      return updated.slice(0, maxToasts);
    });

    // Auto-dismiss non-loading toasts
    if (toast.type !== 'loading') {
      const duration = toast.duration ?? (toast.type === 'error' ? 5000 : 3000);
      const timer = setTimeout(() => {
        hideToast(id);
      }, duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, [maxToasts]);

  const hideToast = useCallback((id: string) => {
    // Clear timer if exists
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<Omit<Toast, 'id'>>) => {
    setToasts(prev => prev.map(t => 
      t.id === id ? { ...t, ...updates } : t
    ));

    // If updating from loading to another type, set auto-dismiss
    if (updates.type && updates.type !== 'loading') {
      const timer = timersRef.current.get(id);
      if (timer) clearTimeout(timer);
      
      const duration = updates.duration ?? (updates.type === 'error' ? 5000 : 3000);
      const newTimer = setTimeout(() => {
        hideToast(id);
      }, duration);
      timersRef.current.set(id, newTimer);
    }
  }, [hideToast]);

  // Position styles
  const getPositionStyles = () => {
    const positions = {
      'top-right': { top: 16, right: 16 },
      'top-left': { top: 16, left: 16 },
      'bottom-right': { bottom: 16, right: 16 },
      'bottom-left': { bottom: 16, left: 16 },
      'top-center': { top: 16, left: '50%', transform: 'translateX(-50%)' },
      'bottom-center': { bottom: 16, left: '50%', transform: 'translateX(-50%)' },
    };
    return positions[position];
  };

  const containerClass = mergeStyles({
    position: 'fixed',
    zIndex: 10000,
    display: 'flex',
    flexDirection: position.includes('bottom') ? 'column-reverse' : 'column',
    gap: 8,
    pointerEvents: 'none',
    ...getPositionStyles(),
  });

  return (
    <ToastContext.Provider value={{ showToast, hideToast, updateToast }}>
      {children}
      <div className={containerClass}>
        {toasts.map(toast => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => hideToast(toast.id)}
            isDarkMode={isDarkMode}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// Individual Toast Item
interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
  isDarkMode: boolean;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss, isDarkMode }) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, ANIMATION_DURATION.fast);
  };

  // Define spinnerClass for loading icon
  const spinnerClass = mergeStyles({
    animation: `spin ${ANIMATION_DURATION.slow}ms linear infinite`,
    '@keyframes spin': {
      from: { transform: 'rotate(0deg)' },
      to: { transform: 'rotate(360deg)' },
    },
  });

  // Brand color mapping
  const getColorScheme = () => {
    const schemes = {
      success: {
        accent: '#20b26c', // Green
        bg: 'rgba(32, 178, 108, 0.12)',
        border: 'rgba(32, 178, 108, 0.3)',
        icon: <FaCheck />,
      },
      error: {
        accent: '#ef4444', // Red
        bg: 'rgba(239, 68, 68, 0.12)',
        border: 'rgba(239, 68, 68, 0.3)',
        icon: <FaTimes />,
      },
      warning: {
        accent: '#f59e0b', // Amber
        bg: 'rgba(245, 158, 11, 0.12)',
        border: 'rgba(245, 158, 11, 0.3)',
        icon: <FaExclamationTriangle />,
      },
      info: {
        accent: '#3690ce', // Helix blue
        bg: 'rgba(54, 144, 206, 0.12)',
        border: 'rgba(54, 144, 206, 0.3)',
        icon: <FaInfoCircle />,
      },
      loading: {
        accent: '#3690ce', // Helix blue
        bg: 'rgba(54, 144, 206, 0.12)',
        border: 'rgba(54, 144, 206, 0.3)',
        icon: <FaSpinner className={spinnerClass} />,
      },
    };
    return schemes[toast.type];
  };

  const scheme = getColorScheme();

  // Main toast container
  const toastClass = mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    padding: 0,
    borderRadius: 4,
    background: `linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.8) 100%)`,
    border: `1px solid ${scheme.border}`,
    backdropFilter: 'blur(8px)',
    color: 'rgba(229, 231, 235, 0.95)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    width: 'clamp(340px, 90vw, 500px)',
    pointerEvents: 'auto',
    animation: isExiting 
      ? `toastExit ${ANIMATION_DURATION.fast}ms ${EASING.easeIn} forwards`
      : `toastEnter ${ANIMATION_DURATION.normal}ms ${EASING.spring}`,
    '@keyframes toastEnter': {
      from: { opacity: 0, transform: 'translateX(100%) scaleY(0.95)' },
      to: { opacity: 1, transform: 'translateX(0) scaleY(1)' },
    },
    '@keyframes toastExit': {
      from: { opacity: 1, transform: 'translateX(0) scaleY(1)' },
      to: { opacity: 0, transform: 'translateX(100%) scaleY(0.95)' },
    },
  });

  // Header bar with accent line
  const headerClass = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    borderBottom: `1px solid ${scheme.border}`,
    borderLeftWidth: 3,
    borderLeftStyle: 'solid',
    borderLeftColor: scheme.accent,
  });

  // Icon container
  const iconClass = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: 3,
    backgroundColor: scheme.bg,
    color: scheme.accent,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 600,
  });

  // Title section
  const titleClass = mergeStyles({
    fontSize: 13,
    fontWeight: 700,
    color: '#e5e7eb',
    lineHeight: 1.2,
    flex: 1,
  });

  // Content area
  const contentClass = mergeStyles({
    padding: '12px 16px',
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.5,
    color: 'rgba(229, 231, 235, 0.85)',
    wordBreak: 'break-word',
    whiteSpace: 'normal',
  });

  // Action button
  const actionClass = mergeStyles({
    marginTop: 8,
    padding: '6px 10px',
    borderRadius: 3,
    backgroundColor: scheme.bg,
    border: `1px solid ${scheme.border}`,
    color: scheme.accent,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    transition: `all ${ANIMATION_DURATION.fast}ms ${EASING.easeOut}`,
    display: 'inline-block',
    ':hover': {
      backgroundColor: scheme.border,
      color: '#ffffff',
    },
  });

  // Dismiss button
  const dismissClass = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderRadius: 2,
    backgroundColor: 'transparent',
    border: 'none',
    color: 'rgba(229, 231, 235, 0.5)',
    cursor: 'pointer',
    flexShrink: 0,
    transition: `all ${ANIMATION_DURATION.fast}ms ${EASING.easeOut}`,
    padding: 0,
    ':hover': {
      backgroundColor: 'rgba(229, 231, 235, 0.1)',
      color: '#ffffff',
    },
  });

  return (
    <div className={toastClass}>
      <div className={headerClass}>
        <div className={iconClass}>{scheme.icon}</div>
        {toast.title && <div className={titleClass}>{toast.title}</div>}
        {toast.type !== 'loading' && (
          <button className={dismissClass} onClick={handleDismiss} title="Dismiss" aria-label="Dismiss notification">
            <FaTimes size={12} />
          </button>
        )}
      </div>
      {toast.message && (
        <div className={contentClass}>
          {toast.message}
          {toast.action && (
            <button className={actionClass} onClick={toast.action.onClick}>
              {toast.action.label} →
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Export helper hooks for common patterns
export const useAsyncAction = () => {
  const { showToast, updateToast, hideToast } = useToast();

  /**
   * Execute an async action with automatic toast feedback
   */
  const executeWithFeedback = async <T,>(
    action: () => Promise<T>,
    options?: {
      loadingMessage?: string;
      successMessage?: string | ((result: T) => string);
      errorMessage?: string | ((error: Error) => string);
      showLoading?: boolean;
    }
  ): Promise<T | null> => {
    const {
      loadingMessage = 'Processing...',
      successMessage = 'Done!',
      errorMessage = 'Something went wrong',
      showLoading = true,
    } = options ?? {};

    let toastId: string | null = null;

    if (showLoading) {
      toastId = showToast({
        type: 'loading',
        message: loadingMessage,
      });
    }

    try {
      const result = await action();
      
      const finalSuccessMessage = typeof successMessage === 'function' 
        ? successMessage(result) 
        : successMessage;

      if (toastId) {
        updateToast(toastId, {
          type: 'success',
          message: finalSuccessMessage,
        });
      } else {
        showToast({
          type: 'success',
          message: finalSuccessMessage,
        });
      }

      return result;
    } catch (error) {
      const finalErrorMessage = typeof errorMessage === 'function'
        ? errorMessage(error as Error)
        : errorMessage;

      if (toastId) {
        updateToast(toastId, {
          type: 'error',
          message: finalErrorMessage,
        });
      } else {
        showToast({
          type: 'error',
          message: finalErrorMessage,
        });
      }

      console.error('Action failed:', error);
      return null;
    }
  };

  return { executeWithFeedback, showToast, hideToast };
};

export default ToastProvider;
