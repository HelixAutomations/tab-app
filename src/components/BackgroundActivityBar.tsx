/**
 * BackgroundActivityBar — a 2px shimmer pinned to the top of the content
 * region, visible whenever any tracked background refresh is in flight.
 *
 * Reuses the same `helix-shimmer` keyframe as the Suspense fallback, so it
 * sits naturally in the existing visual language. Collapses to 0px when
 * idle (animated) so it doesn't leave a residual gap between the navigator
 * banner and tab content; expands to 2px while a refresh is in flight.
 */
import React from 'react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import { useBackgroundActivity } from '../utils/backgroundActivity';

const BackgroundActivityBar: React.FC = () => {
  const { isDarkMode } = useTheme();
  const active = useBackgroundActivity();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={active ? 'Refreshing data in the background' : ''}
      style={{
        width: '100%',
        height: active ? 2 : 0,
        overflow: 'hidden',
        borderRadius: 0,
        pointerEvents: 'none',
        transition: 'height 220ms ease-out',
      }}
    >
      <div
        style={{
          height: '100%',
          backgroundColor: 'transparent',
          backgroundImage: active
            ? `linear-gradient(90deg, transparent 0%, ${isDarkMode ? colours.accent : colours.highlight} 50%, transparent 100%)`
            : 'none',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '200% 100%',
          animation: active ? 'helix-shimmer 1.5s ease-in-out infinite' : 'none',
          opacity: active ? 0.7 : 0,
          transition: 'opacity 220ms ease-out',
        }}
      />
    </div>
  );
};

export default BackgroundActivityBar;
