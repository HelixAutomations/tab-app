import React, { useCallback } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { renderAreaGlyph, type AreaGlyphVariant } from './areaGlyphs';

interface AreaOption {
  key: string;
  label: string;
  color: string;
}

interface IconAreaFilterProps {
  selectedAreas: string[];
  availableAreas: string[];
  onAreaChange: (selectedAreas: string[]) => void;
  ariaLabel?: string;
  variant?: AreaGlyphVariant;
}

// Area configuration with colours and labels.
const areaConfig: Record<string, AreaOption> = {
  'Commercial': { key: 'Commercial', label: 'Commercial', color: colours.blue },
  'Property': { key: 'Property', label: 'Property', color: colours.green },
  'Construction': { key: 'Construction', label: 'Construction', color: colours.orange },
  'Employment': { key: 'Employment', label: 'Employment', color: colours.yellow },
  'Other/Unsure': { key: 'Other/Unsure', label: 'Other', color: colours.greyText },
};

// Inject CSS once for area filter hover/active (avoids per-render JS handlers)
if (typeof document !== 'undefined' && !document.head.querySelector('style[data-area-filter-css]')) {
  const s = document.createElement('style');
  s.setAttribute('data-area-filter-css', 'true');
  s.textContent = `
    .area-btn {
      display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border-radius: 0; cursor: pointer;
      pointer-events: auto;
      transition: background 120ms ease, border-color 120ms ease,
                  box-shadow 120ms ease, opacity 120ms ease;
      box-sizing: border-box;
    }
    .area-btn:hover { opacity: 1 !important; }
    .area-btn:active { opacity: 0.85; }
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
  ariaLabel = "Filter by area of work",
  variant = 'glyph'
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
        gap: 6,
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
        const iconColor = isSelected ? area.color : (isDarkMode ? '#d1d5db' : colours.greyText);
        
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
                ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                : 'transparent',
              border: 'none',
              opacity: noneSelected || isSelected ? 1 : 0.45,
              boxShadow: `inset 0 0 0 1px ${isSelected
                ? (isDarkMode ? 'rgba(135,243,243,0.40)' : colours.highlight)
                : (isDarkMode ? 'rgba(75,85,99,0.22)' : 'rgba(0,0,0,0.08)')}`,
              color: iconColor,
            }}
          >
            <span
              style={{
                lineHeight: 1,
                opacity: isSelected ? 1 : 0.9,
              }}
            >
              {renderAreaGlyph(areaKey, iconColor, variant, 15)}
            </span>
          </button>
        );
      })}
    </div>
  );
});

export default IconAreaFilter;