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
