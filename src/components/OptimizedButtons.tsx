/**
 * Enhanced button components with optimized responsiveness
 * Provides immediate visual feedback to improve perceived performance
 */

import React, { useCallback, useState } from 'react';
import { 
  PrimaryButton, 
  DefaultButton, 
  IButtonProps, 
  IButtonStyles, 
  Spinner, 
  SpinnerSize 
} from '@fluentui/react';
import { useOptimisticAction, getEnvironmentConfig } from '../utils/performanceOptimization';

interface OptimizedButtonProps extends Omit<IButtonProps, 'onClick' | 'onError'> {
  onClick?: () => Promise<void> | void;
  optimisticUpdate?: () => void;
  onError?: (error: Error) => void;
  onSuccess?: () => void;
  loadingText?: string;
  variant?: 'primary' | 'default' | 'subtle';
  preventDoubleClick?: boolean;
}

/**
 * Optimized Primary Button with immediate feedback
 */
export const OptimizedPrimaryButton: React.FC<OptimizedButtonProps> = ({
  onClick,
  optimisticUpdate,
  onError,
  onSuccess,
  loadingText,
  text,
  disabled,
  styles,
  preventDoubleClick = true,
  ...props
}) => {
  const { executeAction, isLoading } = useOptimisticAction();
  const [hasImmediate, setHasImmediate] = useState(false);
  const config = getEnvironmentConfig();

  const handleClick = useCallback(async () => {
    if (!onClick || (preventDoubleClick && isLoading)) return;

    // Immediate visual feedback
    setHasImmediate(true);
    
    try {
      if (typeof onClick === 'function') {
        await executeAction(
          async () => {
            const result = onClick();
            if (result instanceof Promise) {
              return await result;
            }
            return result;
          },
          {
            optimisticUpdate,
            onError,
            onSuccess,
          }
        );
      }
    } finally {
      // Remove immediate feedback after a short delay
      setTimeout(() => setHasImmediate(false), 100);
    }
  }, [onClick, executeAction, optimisticUpdate, onError, onSuccess, preventDoubleClick, isLoading]);

  const isButtonLoading = isLoading || hasImmediate;
  const buttonText = isButtonLoading ? (loadingText || 'Loading...') : text;

  const enhancedStyles: IButtonStyles = {
    ...styles,
    root: Object.assign(
      {
        transition: 'all 0.15s ease',
        transform: hasImmediate ? 'scale(0.98)' : 'scale(1)',
      },
      styles?.root || {}
    ),
    rootPressed: Object.assign(
      {
        transform: 'scale(0.95)',
      },
      styles?.rootPressed || {}
    ),
    rootDisabled: Object.assign(
      {
        opacity: 0.6,
      },
      styles?.rootDisabled || {}
    ),
    icon: Object.assign(
      isButtonLoading ? { display: 'none' } : {},
      styles?.icon || {}
    ),
  };

  return (
    <PrimaryButton
      {...props}
      text={buttonText}
      onClick={handleClick}
      disabled={disabled || isButtonLoading}
      styles={enhancedStyles}
      onRenderIcon={() => 
        isButtonLoading ? (
          <Spinner size={SpinnerSize.xSmall} />
        ) : (
          props.iconProps ? <span className={`ms-Icon ms-Icon--${props.iconProps.iconName}`} /> : null
        )
      }
    />
  );
};

/**
 * Optimized Default Button with immediate feedback
 */
export const OptimizedDefaultButton: React.FC<OptimizedButtonProps> = ({
  onClick,
  optimisticUpdate,
  onError,
  onSuccess,
  loadingText,
  text,
  disabled,
  styles,
  preventDoubleClick = true,
  ...props
}) => {
  const { executeAction, isLoading } = useOptimisticAction();
  const [hasImmediate, setHasImmediate] = useState(false);

  const handleClick = useCallback(async () => {
    if (!onClick || (preventDoubleClick && isLoading)) return;

    setHasImmediate(true);
    
    try {
      if (typeof onClick === 'function') {
        await executeAction(
          async () => {
            const result = onClick();
            if (result instanceof Promise) {
              return await result;
            }
            return result;
          },
          {
            optimisticUpdate,
            onError,
            onSuccess,
          }
        );
      }
    } finally {
      setTimeout(() => setHasImmediate(false), 100);
    }
  }, [onClick, executeAction, optimisticUpdate, onError, onSuccess, preventDoubleClick, isLoading]);

  const isButtonLoading = isLoading || hasImmediate;
  const buttonText = isButtonLoading ? (loadingText || 'Loading...') : text;

  const enhancedStyles: IButtonStyles = {
    ...styles,
    root: Object.assign(
      {
        transition: 'all 0.15s ease',
        transform: hasImmediate ? 'scale(0.98)' : 'scale(1)',
      },
      styles?.root || {}
    ),
    rootPressed: Object.assign(
      {
        transform: 'scale(0.95)',
      },
      styles?.rootPressed || {}
    ),
    rootDisabled: Object.assign(
      {
        opacity: 0.6,
      },
      styles?.rootDisabled || {}
    ),
    icon: Object.assign(
      isButtonLoading ? { display: 'none' } : {},
      styles?.icon || {}
    ),
  };

  return (
    <DefaultButton
      {...props}
      text={buttonText}
      onClick={handleClick}
      disabled={disabled || isButtonLoading}
      styles={enhancedStyles}
      onRenderIcon={() => 
        isButtonLoading ? (
          <Spinner size={SpinnerSize.xSmall} />
        ) : (
          props.iconProps ? <span className={`ms-Icon ms-Icon--${props.iconProps.iconName}`} /> : null
        )
      }
    />
  );
};

/**
 * Smart refresh button with optimized UX
 */
interface SmartRefreshButtonProps {
  onRefresh: () => Promise<void>;
  lastRefreshTime?: Date;
  isRefreshing?: boolean;
  variant?: 'primary' | 'default';
  showLastRefresh?: boolean;
  customText?: string;
  disabled?: boolean;
  styles?: IButtonStyles;
}

export const SmartRefreshButton: React.FC<SmartRefreshButtonProps> = ({
  onRefresh,
  lastRefreshTime,
  isRefreshing = false,
  variant = 'default',
  showLastRefresh = true,
  customText,
  disabled,
  styles,
}) => {
  const [isOptimisticRefreshing, setIsOptimisticRefreshing] = useState(false);
  const [optimisticRefreshTime, setOptimisticRefreshTime] = useState<Date | null>(null);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || isOptimisticRefreshing) return;

    // Optimistic update
    setIsOptimisticRefreshing(true);
    setOptimisticRefreshTime(new Date());

    try {
      await onRefresh();
    } catch (error) {
      // Rollback optimistic state
      setOptimisticRefreshTime(null);
      console.error('Refresh failed:', error);
    } finally {
      setIsOptimisticRefreshing(false);
    }
  }, [onRefresh, isRefreshing, isOptimisticRefreshing]);

  const isCurrentlyRefreshing = isRefreshing || isOptimisticRefreshing;
  const displayRefreshTime = optimisticRefreshTime || lastRefreshTime;

  const refreshText = customText || (isCurrentlyRefreshing ? 'Refreshing...' : 'Refresh');

  const ButtonComponent = variant === 'primary' ? OptimizedPrimaryButton : OptimizedDefaultButton;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <ButtonComponent
        text={refreshText}
        onClick={handleRefresh}
        disabled={disabled || isCurrentlyRefreshing}
        iconProps={{ iconName: 'Refresh' }}
        loadingText="Refreshing..."
        styles={styles}
        preventDoubleClick={true}
      />
      {showLastRefresh && displayRefreshTime && (
        <div style={{ 
          fontSize: 11, 
          color: '#666', 
          fontStyle: isOptimisticRefreshing ? 'italic' : 'normal',
          opacity: isOptimisticRefreshing ? 0.8 : 1,
        }}>
          {isOptimisticRefreshing ? 'Refreshing now...' : `Last refreshed: ${displayRefreshTime.toLocaleTimeString()}`}
        </div>
      )}
    </div>
  );
};

/**
 * Button group with coordinated loading states
 */
interface ButtonGroupAction {
  key: string;
  text: string;
  action: () => Promise<void>;
  variant?: 'primary' | 'default';
  disabled?: boolean;
  loadingText?: string;
  iconName?: string;
}

interface OptimizedButtonGroupProps {
  actions: ButtonGroupAction[];
  layout?: 'horizontal' | 'vertical';
  gap?: number;
  preventConcurrent?: boolean;
}

export const OptimizedButtonGroup: React.FC<OptimizedButtonGroupProps> = ({
  actions,
  layout = 'horizontal',
  gap = 8,
  preventConcurrent = true,
}) => {
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const handleAction = useCallback(async (action: ButtonGroupAction) => {
    if (preventConcurrent && activeAction) return;

    setActiveAction(action.key);
    try {
      await action.action();
    } catch (error) {
      console.error(`Action ${action.key} failed:`, error);
    } finally {
      setActiveAction(null);
    }
  }, [activeAction, preventConcurrent]);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: layout === 'horizontal' ? 'row' : 'column',
    gap,
    flexWrap: layout === 'horizontal' ? 'wrap' : 'nowrap',
  };

  return (
    <div style={containerStyle}>
      {actions.map((action) => {
        const isLoading = activeAction === action.key;
        const isDisabled = Boolean(action.disabled || (preventConcurrent && activeAction && activeAction !== action.key));
        
        const ButtonComponent = action.variant === 'primary' ? OptimizedPrimaryButton : OptimizedDefaultButton;
        
        return (
          <ButtonComponent
            key={action.key}
            text={action.text}
            onClick={() => handleAction(action)}
            disabled={isDisabled}
            loadingText={action.loadingText}
            iconProps={action.iconName ? { iconName: action.iconName } : undefined}
            preventDoubleClick={true}
          />
        );
      })}
    </div>
  );
};

export default {
  OptimizedPrimaryButton,
  OptimizedDefaultButton,
  SmartRefreshButton,
  OptimizedButtonGroup,
};