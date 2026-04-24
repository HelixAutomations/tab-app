import React from 'react';
import '../../app/styles/realtimePulse.css';

export type LivePulseVariant = 'border' | 'dot' | 'ring';

export interface LivePulseProps {
  /**
   * Monotonically incrementing nonce. Each change replays the keyframe once.
   * Pass 0 (or undefined) to render children without animation on mount.
   */
  nonce?: number;
  variant?: LivePulseVariant;
  /**
   * When true, render children inside a wrapper div. Default: true.
   * Set false to apply the animation class to children directly via cloneElement.
   */
  wrap?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * LivePulse — wraps a region and replays a subtle realtime cue when `nonce`
 * changes. Uses a `key` prop on the inner element so React remounts it,
 * forcing the CSS keyframe animation to restart from frame 0.
 *
 * Three variants:
 *  - 'border'  → soft 900ms inset border-pulse (recommended for inserts)
 *  - 'ring'    → stronger 1s outer ring + faint lift (row-level events)
 *  - 'dot'     → render <LivePulse.Dot /> separately for in-place value cues
 *
 * Colour: highlight (#3690CE) in light mode, accent (#87F3F3) in dark mode.
 * Honours prefers-reduced-motion (fade-only, no transforms).
 */
export const LivePulse: React.FC<LivePulseProps> = ({
  nonce,
  variant = 'border',
  wrap = true,
  className = '',
  style,
  children,
}) => {
  const animationClass = variant === 'ring' ? 'live-pulse--ring' : 'live-pulse--border';
  const isAnimated = typeof nonce === 'number' && nonce > 0;

  if (!wrap) {
    return <>{children}</>;
  }

  return (
    <div
      // Key changes when nonce ticks → React remounts → keyframe restarts.
      key={isAnimated ? `lp-${nonce}` : 'lp-idle'}
      className={`${isAnimated ? animationClass : ''} ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
};

/**
 * Standalone pulsing dot — for in-place value updates (counts ticking,
 * totals refreshed). Renders nothing visible when nonce is undefined/0.
 */
export const LivePulseDot: React.FC<{ nonce?: number; className?: string; style?: React.CSSProperties }> = ({
  nonce,
  className = '',
  style,
}) => {
  const isAnimated = typeof nonce === 'number' && nonce > 0;
  return (
    <span
      key={isAnimated ? `lpd-${nonce}` : 'lpd-idle'}
      className={`live-pulse-dot ${isAnimated ? 'live-pulse-dot--animating' : ''} ${className}`.trim()}
      style={style}
      aria-hidden
    />
  );
};

/**
 * Persistent "live" indicator — gently breathes when an SSE channel is OPEN,
 * fades to a static grey dot when CONNECTING/CLOSED.
 */
export const LiveIndicatorDot: React.FC<{
  status?: 'open' | 'connecting' | 'closed';
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ status = 'open', title, className = '', style }) => {
  const isLive = status === 'open';
  return (
    <span
      className={`live-indicator-dot ${!isLive ? 'live-indicator-dot--idle' : ''} ${className}`.trim()}
      title={title || (isLive ? 'Live' : 'Reconnecting…')}
      style={style}
      aria-label={isLive ? 'Live updates active' : 'Live updates reconnecting'}
    />
  );
};

export default LivePulse;
