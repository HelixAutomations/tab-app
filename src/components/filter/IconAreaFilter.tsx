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
  'Commercial': { key: 'Commercial', label: 'Commercial', emoji: '🏢', color: '#3690CE' },
  'Property': { key: 'Property', label: 'Property', emoji: '🏠', color: '#10b981' },
  'Construction': { key: 'Construction', label: 'Construction', emoji: '🏗️', color: '#f97316' },
  'Employment': { key: 'Employment', label: 'Employment', emoji: '👩🏻‍💼', color: '#f59e0b' },
  'Other/Unsure': { key: 'Other/Unsure', label: 'Other', emoji: 'ℹ️', color: '#6b7280' },
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
        gap: 4,
        height: 32,
        padding: '4px',
        background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        borderRadius: 16,
        fontFamily: 'Raleway, sans-serif',
        pointerEvents: 'auto', // Ensure container allows pointer events
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
              width: 24,
              height: 24,
              background: isSelected 
                ? (isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)')
                : 'transparent',
              border: isSelected ? `1px solid ${area.color}40` : '1px solid transparent',
              borderRadius: 12,
              cursor: 'pointer',
              transition: 'all 200ms ease',
              opacity: noneSelected || isSelected ? 1 : 0.4,
              boxShadow: isSelected 
                ? (isDarkMode
                    ? '0 1px 2px rgba(0,0,0,0.2)'
                    : '0 1px 2px rgba(0,0,0,0.06)')
                : 'none',
              pointerEvents: 'auto',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.opacity = noneSelected || isSelected ? '1' : '0.4';
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