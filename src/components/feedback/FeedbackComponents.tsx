import React, { useState, useEffect } from 'react';
import { mergeStyles } from '@fluentui/react';
import { FaCheck, FaTimes, FaInfoCircle, FaExclamationTriangle, FaSpinner } from 'react-icons/fa';
import { ANIMATION_DURATION, EASING, createTransition } from '../../app/styles/animations';

// Types for feedback states
export type FeedbackType = 'success' | 'error' | 'warning' | 'info' | 'loading';

interface ActionFeedbackProps {
  type: FeedbackType;
  message?: string;
  isDarkMode?: boolean;
  duration?: number;
  onComplete?: () => void;
  compact?: boolean;
}

/**
 * Inline action feedback component - shows success/error/loading states
 * Use for immediate feedback on button clicks and actions
 */
export const ActionFeedback: React.FC<ActionFeedbackProps> = ({
  type,
  message,
  isDarkMode = false,
  duration = 2000,
  onComplete,
  compact = false,
}) => {
  useEffect(() => {
    if (type !== 'loading' && duration > 0) {
      const timer = setTimeout(() => {
        onComplete?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [type, duration, onComplete]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <FaCheck />;
      case 'error':
        return <FaTimes />;
      case 'warning':
        return <FaExclamationTriangle />;
      case 'info':
        return <FaInfoCircle />;
      case 'loading':
        return <FaSpinner className={spinnerClass} />;
    }
  };

  const getColors = () => {
    const colors = {
      success: { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e', text: '#22c55e' },
      error: { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', text: '#ef4444' },
      warning: { bg: 'rgba(251, 191, 36, 0.15)', border: '#fbbf24', text: '#fbbf24' },
      info: { bg: 'rgba(54, 144, 206, 0.15)', border: '#3690CE', text: '#3690CE' },
      loading: { bg: 'rgba(148, 163, 184, 0.15)', border: '#94a3b8', text: '#94a3b8' },
    };
    return colors[type];
  };

  const colors = getColors();
  
  const containerClass = mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: compact ? 4 : 8,
    padding: compact ? '4px 8px' : '6px 12px',
    borderRadius: 6,
    backgroundColor: colors.bg,
    border: `1px solid ${colors.border}40`,
    fontSize: compact ? 10 : 11,
    fontWeight: 600,
    color: colors.text,
    animation: `fadeIn ${ANIMATION_DURATION.fast}ms ${EASING.easeOut}`,
    '@keyframes fadeIn': {
      from: { opacity: 0, transform: 'scale(0.95)' },
      to: { opacity: 1, transform: 'scale(1)' },
    },
  });

  const spinnerClass = mergeStyles({
    animation: `spin ${ANIMATION_DURATION.slow}ms linear infinite`,
    '@keyframes spin': {
      from: { transform: 'rotate(0deg)' },
      to: { transform: 'rotate(360deg)' },
    },
  });

  return (
    <div className={containerClass}>
      {getIcon()}
      {message && <span>{message}</span>}
    </div>
  );
};

interface ActionButtonProps {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
  isDarkMode?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  showFeedback?: boolean;
  size?: 'small' | 'medium';
}

/**
 * Enhanced action button with built-in loading and success/error states
 * Automatically handles async operations and shows visual feedback
 */
export const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  label,
  onClick,
  isDarkMode = false,
  variant = 'secondary',
  disabled = false,
  showFeedback = true,
  size = 'medium',
}) => {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || state === 'loading') return;

    setState('loading');
    try {
      await onClick();
      if (showFeedback) {
        setState('success');
        setTimeout(() => setState('idle'), 2000);
      } else {
        setState('idle');
      }
    } catch (error) {
      if (showFeedback) {
        setState('error');
        setTimeout(() => setState('idle'), 2000);
      } else {
        setState('idle');
      }
    }
  };

  const getVariantStyles = () => {
    const variants = {
      primary: {
        bg: '#3690CE',
        bgHover: '#2980b9',
        text: '#ffffff',
      },
      secondary: {
        bg: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
        bgHover: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
        text: isDarkMode ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)',
      },
      danger: {
        bg: '#ef4444',
        bgHover: '#dc2626',
        text: '#ffffff',
      },
    };
    return variants[variant];
  };

  const variantStyles = getVariantStyles();
  const isSmall = size === 'small';

  const buttonClass = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: isSmall ? 4 : 6,
    padding: isSmall ? '4px 8px' : '6px 12px',
    fontSize: isSmall ? 10 : 11,
    fontWeight: 600,
    borderRadius: 6,
    border: 'none',
    cursor: disabled || state === 'loading' ? 'not-allowed' : 'pointer',
    backgroundColor: state === 'success' ? '#22c55e' : state === 'error' ? '#ef4444' : variantStyles.bg,
    color: variantStyles.text,
    opacity: disabled ? 0.5 : 1,
    transition: createTransition(['background-color', 'opacity', 'transform'], 'fast'),
    ':hover': !disabled && state === 'idle' ? {
      backgroundColor: variantStyles.bgHover,
      transform: 'scale(1.02)',
    } : {},
    ':active': !disabled && state === 'idle' ? {
      transform: 'scale(0.98)',
    } : {},
  });

  const getIcon = () => {
    if (state === 'loading') return <FaSpinner className={spinnerClass} />;
    if (state === 'success') return <FaCheck />;
    if (state === 'error') return <FaTimes />;
    return icon;
  };

  const spinnerClass = mergeStyles({
    animation: `spin ${ANIMATION_DURATION.slow}ms linear infinite`,
    '@keyframes spin': {
      from: { transform: 'rotate(0deg)' },
      to: { transform: 'rotate(360deg)' },
    },
  });

  return (
    <button className={buttonClass} onClick={handleClick} disabled={disabled}>
      {getIcon()}
      <span>{state === 'loading' ? 'Processing...' : label}</span>
    </button>
  );
};

interface SkeletonLoaderProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: number;
  isDarkMode?: boolean;
}

/**
 * Skeleton loader for placeholder content during data fetching
 * Provides visual feedback that content is loading
 */
export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 4,
  isDarkMode = false,
}) => {
  const skeletonClass = mergeStyles({
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius,
    background: isDarkMode
      ? 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)'
      : 'linear-gradient(90deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.05) 100%)',
    backgroundSize: '200% 100%',
    animation: `shimmer 1.5s infinite`,
    '@keyframes shimmer': {
      '0%': { backgroundPosition: '-200% 0' },
      '100%': { backgroundPosition: '200% 0' },
    },
  });

  return <div className={skeletonClass} />;
};

interface ProgressIndicatorProps {
  value: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  isDarkMode?: boolean;
  size?: 'small' | 'medium' | 'large';
  color?: string;
}

/**
 * Progress indicator for multi-step workflows
 * Shows completion percentage with smooth animation
 */
export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  value,
  label,
  showPercentage = true,
  isDarkMode = false,
  size = 'medium',
  color = '#3690CE',
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayValue(value);
    }, 50);
    return () => clearTimeout(timer);
  }, [value]);

  const heights = { small: 4, medium: 6, large: 8 };
  const height = heights[size];

  const containerClass = mergeStyles({
    width: '100%',
  });

  const trackClass = mergeStyles({
    width: '100%',
    height,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    borderRadius: height / 2,
    overflow: 'hidden',
    position: 'relative',
  });

  const fillClass = mergeStyles({
    height: '100%',
    width: `${Math.min(100, Math.max(0, displayValue))}%`,
    backgroundColor: color,
    transition: createTransition(['width'], 'normal', 'easeOut'),
    borderRadius: height / 2,
  });

  const labelClass = mergeStyles({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 11,
    fontWeight: 600,
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
    marginBottom: 4,
  });

  return (
    <div className={containerClass}>
      {(label || showPercentage) && (
        <div className={labelClass}>
          {label && <span>{label}</span>}
          {showPercentage && <span>{Math.round(displayValue)}%</span>}
        </div>
      )}
      <div className={trackClass}>
        <div className={fillClass} />
      </div>
    </div>
  );
};

interface StatusPillProps {
  status: 'pending' | 'complete' | 'review' | 'processing';
  label: string;
  icon?: React.ReactNode;
  isDarkMode?: boolean;
  animated?: boolean;
}

/**
 * Status pill with consistent styling and optional animation
 * Used for workflow step indicators
 */
export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  label,
  icon,
  isDarkMode = false,
  animated = false,
}) => {
  const getStatusColors = () => {
    const colors = {
      complete: { bg: 'rgba(34, 197, 94, 0.15)', border: '#22c55e30', text: '#22c55e' },
      review: { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef444430', text: '#ef4444' },
      processing: { bg: 'rgba(251, 191, 36, 0.15)', border: '#fbbf2430', text: '#fbbf24' },
      pending: { bg: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)', border: '#94a3b830', text: '#94a3b8' },
    };
    return colors[status];
  };

  const colors = getStatusColors();

  const pillClass = mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    borderRadius: 6,
    backgroundColor: colors.bg,
    border: `1px solid ${colors.border}`,
    fontSize: 9,
    fontWeight: 600,
    textTransform: 'uppercase',
    color: colors.text,
    transition: createTransition(['background-color', 'border-color'], 'fast'),
    animation: animated ? `pulse ${ANIMATION_DURATION.slow}ms ${EASING.easeInOut} infinite` : undefined,
    '@keyframes pulse': {
      '0%, 100%': { opacity: 1 },
      '50%': { opacity: 0.7 },
    },
  });

  return (
    <div className={pillClass}>
      {icon}
      <span>{label}</span>
    </div>
  );
};
