import React, { useCallback } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

interface AreaOption {
  key: string;
  label: string;
  emoji: string;
  color: string;
}

interface IconAreaFilterProps {
  selectedAreas: string[];
  availableAreas: string[];
  onAreaChange: (selectedAreas: string[]) => void;
  ariaLabel?: string;
}

// Area configuration with colors and emojis (matching table display)
const areaConfig: Record<string, AreaOption> = {
  'Commercial': { key: 'Commercial', label: 'Commercial', emoji: '🏢', color: colours.blue },
  'Property': { key: 'Property', label: 'Property', emoji: '🏠', color: colours.green },
  'Construction': { key: 'Construction', label: 'Construction', emoji: '🏗️', color: colours.orange },
  'Employment': { key: 'Employment', label: 'Employment', emoji: '👩🏻‍💼', color: colours.yellow },
  'Other/Unsure': { key: 'Other/Unsure', label: 'Other', emoji: 'ℹ️', color: colours.greyText },
};

// Inject CSS once for area filter hover/active (avoids per-render JS handlers)
if (typeof document !== 'undefined' && !document.head.querySelector('style[data-area-filter-css]')) {
  const s = document.createElement('style');
  s.setAttribute('data-area-filter-css', 'true');
  s.textContent = `
    .area-btn {
      display: flex; align-items: center; justify-content: center;
      width: 26px; height: 26px; border-radius: 0; cursor: pointer;
      pointer-events: auto;
      transition: background 120ms ease, border-color 120ms ease,
                  box-shadow 120ms ease, opacity 120ms ease, transform 100ms ease;
    }
    .area-btn:hover { transform: scale(1.08); opacity: 1 !important; }
    .area-btn:active { transform: scale(0.95); }
  `;
  document.head.appendChild(s);
}

/**
 * Compact emoji-based area of work filter with toggle functionality.
 * React.memo prevents re-renders when parent's unrelated props change.
 */
const IconAreaFilter: React.FC<IconAreaFilterProps> = React.memo(({
  selectedAreas,
  availableAreas,
  onAreaChange,
  ariaLabel = "Filter by area of work"
}) => {
  const { isDarkMode } = useTheme();

  // Filter available areas to only show ones that exist in our configuration
  const displayAreas = availableAreas.filter(area => areaConfig[area]);

  // Stable toggle handler
  const toggleArea = useCallback((areaKey: string) => {
    onAreaChange(
      selectedAreas.includes(areaKey)
        ? selectedAreas.filter(a => a !== areaKey)
        : [...selectedAreas, areaKey]
    );
  }, [selectedAreas, onAreaChange]);

  const noneSelected = selectedAreas.length === 0;

  return (
    <div 
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        height: 30,
        padding: 0,
        background: 'transparent',
        borderRadius: 0,
        fontFamily: 'Raleway, sans-serif',
        pointerEvents: 'auto',
      }}
    >
      {displayAreas.map(areaKey => {
        const area = areaConfig[areaKey];
        const isSelected = selectedAreas.includes(areaKey);
        
        return (
          <button
            key={areaKey}
            type="button"
            className="area-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleArea(areaKey);
            }}
            title={`${isSelected ? 'Hide' : 'Show'} ${area.label}`}
            aria-label={`${isSelected ? 'Hide' : 'Show'} ${area.label}`}
            aria-pressed={isSelected}
            style={{
              background: isSelected
                ? (isDarkMode ? colours.dark.cardHover : colours.light.cardBackground)
                : 'transparent',
              border: isSelected ? `1px solid ${area.color}` : `1px solid ${isDarkMode ? 'rgba(55,65,81,0.4)' : 'rgba(13,47,96,0.10)'}`,
              opacity: noneSelected || isSelected ? 1 : 0.45,
              boxShadow: isSelected 
                ? (isDarkMode ? '0 1px 3px rgba(0,0,0,0.25)' : '0 1px 2px rgba(0,0,0,0.06)')
                : 'none',
            }}
          >
            <span
              style={{
                fontSize: 14,
                lineHeight: 1,
                filter: isSelected ? 'none' : 'grayscale(0.5)',
                transition: 'filter 120ms ease',
              }}
            >
              {area.emoji}
            </span>
          </button>
        );
      })}
    </div>
  );
});

export default IconAreaFilter;