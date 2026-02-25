import React from 'react';
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

/**
 * Compact emoji-based area of work filter with toggle functionality
 * Uses emoji icons matching table display for visual consistency
 */
const IconAreaFilter: React.FC<IconAreaFilterProps> = ({
  selectedAreas,
  availableAreas,
  onAreaChange,
  ariaLabel = "Filter by area of work"
}) => {
  const { isDarkMode } = useTheme();

  // Filter available areas to only show ones that exist in our configuration
  const displayAreas = availableAreas.filter(area => areaConfig[area]);

  // Handle individual area toggle
  const toggleArea = (areaKey: string) => {
    if (selectedAreas.includes(areaKey)) {
      // Remove from selection
      onAreaChange(selectedAreas.filter(a => a !== areaKey));
    } else {
      // Add to selection
      onAreaChange([...selectedAreas, areaKey]);
    }
  };

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
        padding: 2,
        background: isDarkMode ? colours.dark.sectionBackground : 'rgba(0,0,0,0.03)',
        borderRadius: 0,
        fontFamily: 'Raleway, sans-serif',
        pointerEvents: 'auto',
      }}
    >
      {/* Individual area buttons */}
      {displayAreas.map(areaKey => {
        const area = areaConfig[areaKey];
        const isSelected = selectedAreas.includes(areaKey);
        
        return (
          <button
            key={areaKey}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleArea(areaKey);
            }}
            title={`${isSelected ? 'Hide' : 'Show'} ${area.label}`}
            aria-label={`${isSelected ? 'Hide' : 'Show'} ${area.label}`}
            aria-pressed={isSelected}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              background: isSelected
                ? (isDarkMode ? colours.dark.cardBackground : '#fff')
                : (isDarkMode ? 'rgba(6,23,51,0.5)' : 'rgba(13,47,96,0.03)'),
              border: isSelected ? `1px solid ${area.color}` : `1px solid ${isDarkMode ? 'rgba(55,65,81,0.3)' : 'rgba(13,47,96,0.08)'}`,
              borderRadius: 0,
              cursor: 'pointer',
              transition: 'all 180ms ease',
              opacity: noneSelected || isSelected ? 1 : 0.45,
              boxShadow: isSelected 
                ? (isDarkMode
                    ? '0 1px 3px rgba(0,0,0,0.25)'
                    : '0 1px 2px rgba(0,0,0,0.06)')
                : 'none',
              pointerEvents: 'auto',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.08)';
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.opacity = noneSelected || isSelected ? '1' : '0.45';
            }}
          >
            <span
              style={{
                fontSize: 14,
                lineHeight: 1,
                filter: isSelected ? 'none' : 'grayscale(0.5)',
              }}
            >
              {area.emoji}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default IconAreaFilter;