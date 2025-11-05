/**
 * Centralized animation system for consistent UI feedback and transitions
 * Provides timing functions, durations, and reusable animation utilities
 */

// Animation timing constants (in milliseconds)
export const ANIMATION_DURATION = {
  instant: 100,
  fast: 200,
  normal: 300,
  slow: 500,
  verySlow: 800,
} as const;

// Easing functions for natural motion
export const EASING = {
  // Standard easings
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  
  // Bouncy/spring-like
  spring: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  
  // Smooth deceleration
  decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
  
  // Sharp entrance/exit
  sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
} as const;

// CSS animation keyframes as strings for mergeStyles
export const KEYFRAMES = {
  // Fade animations
  fadeIn: {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
  fadeOut: {
    from: { opacity: 1 },
    to: { opacity: 0 },
  },
  
  // Slide animations
  slideInUp: {
    from: { transform: 'translateY(10px)', opacity: 0 },
    to: { transform: 'translateY(0)', opacity: 1 },
  },
  slideInDown: {
    from: { transform: 'translateY(-10px)', opacity: 0 },
    to: { transform: 'translateY(0)', opacity: 1 },
  },
  slideInLeft: {
    from: { transform: 'translateX(-10px)', opacity: 0 },
    to: { transform: 'translateX(0)', opacity: 1 },
  },
  slideInRight: {
    from: { transform: 'translateX(10px)', opacity: 0 },
    to: { transform: 'translateX(0)', opacity: 1 },
  },
  
  // Scale animations
  scaleIn: {
    from: { transform: 'scale(0.95)', opacity: 0 },
    to: { transform: 'scale(1)', opacity: 1 },
  },
  scaleOut: {
    from: { transform: 'scale(1)', opacity: 1 },
    to: { transform: 'scale(0.95)', opacity: 0 },
  },
  
  // Pulse animation for attention
  pulse: {
    '0%': { transform: 'scale(1)' },
    '50%': { transform: 'scale(1.05)' },
    '100%': { transform: 'scale(1)' },
  },
  
  // Shimmer for loading states
  shimmer: {
    '0%': { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },
  
  // Spin for loaders
  spin: {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
  },
  
  // Success checkmark draw animation
  checkmarkDraw: {
    '0%': { strokeDashoffset: 50 },
    '100%': { strokeDashoffset: 0 },
  },
  
  // Bounce for success feedback
  bounce: {
    '0%, 100%': { transform: 'scale(1)' },
    '50%': { transform: 'scale(1.1)' },
  },
} as const;

// Reusable animation styles
export const createTransition = (
  properties: string[] = ['all'],
  duration: keyof typeof ANIMATION_DURATION = 'normal',
  easing: keyof typeof EASING = 'easeInOut'
): string => {
  const durationMs = ANIMATION_DURATION[duration];
  const easingFunc = EASING[easing];
  return properties.map(prop => `${prop} ${durationMs}ms ${easingFunc}`).join(', ');
};

// State-based animation utilities
export const getLoadingAnimation = () => ({
  animation: `shimmer 1.5s infinite`,
  background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.05) 100%)',
  backgroundSize: '200% 100%',
});

export const getSuccessAnimation = () => ({
  animation: `bounce ${ANIMATION_DURATION.fast}ms ${EASING.spring}`,
});

export const getErrorShake = () => ({
  animation: `shake ${ANIMATION_DURATION.fast}ms ${EASING.easeInOut}`,
});

// Keyframe for shake animation
export const shakeKeyframe = {
  '0%, 100%': { transform: 'translateX(0)' },
  '25%': { transform: 'translateX(-5px)' },
  '75%': { transform: 'translateX(5px)' },
};

// Micro-interaction utilities
export const HOVER_STATES = {
  subtle: {
    transition: createTransition(['opacity', 'box-shadow'], 'fast'),
    ':hover': {
      opacity: 0.85,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    },
  },
  lift: {
    transition: createTransition(['transform', 'box-shadow'], 'fast'),
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    },
  },
  scale: {
    transition: createTransition(['transform'], 'fast', 'spring'),
    ':hover': {
      transform: 'scale(1.02)',
    },
  },
} as const;

// Button state animations
export const BUTTON_STATES = {
  loading: {
    opacity: 0.7,
    cursor: 'not-allowed',
    pointerEvents: 'none' as const,
  },
  success: {
    backgroundColor: '#20b26c',
    transition: createTransition(['background-color'], 'normal'),
  },
  error: {
    backgroundColor: '#ef4444',
    transition: createTransition(['background-color'], 'normal'),
  },
} as const;

// Skeleton loader gradient
export const SKELETON_GRADIENT = (isDarkMode: boolean) => ({
  background: isDarkMode
    ? 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)'
    : 'linear-gradient(90deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.05) 100%)',
  backgroundSize: '200% 100%',
  animation: `shimmer 1.5s infinite`,
});

// Progress bar animation
export const PROGRESS_BAR = {
  transition: createTransition(['width'], 'normal', 'easeOut'),
  willChange: 'width',
};

// Stagger animation delays for lists
export const getStaggerDelay = (index: number, baseDelay: number = 50): string => {
  return `${index * baseDelay}ms`;
};

// Morph transition (for state changes)
export const MORPH_TRANSITION = {
  transition: createTransition(['all'], 'normal', 'easeInOut'),
  willChange: 'transform, opacity',
};
