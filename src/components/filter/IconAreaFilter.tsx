import React from 'react';
import { Icon } from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

interface AreaOption {
  key: string;
  label: string;
  icon: string;
  color: string;
}

interface IconAreaFilterProps {
  selectedAreas: string[];
  availableAreas: string[];
  onAreaChange: (selectedAreas: string[]) => void;
  ariaLabel?: string;
}

// Area configuration with colors and icons
const areaConfig: Record<string, AreaOption> = {
  'Commercial': { key: 'Commercial', label: 'Commercial', icon: 'KnowledgeArticle', color: colours.blue },
  'Property': { key: 'Property', label: 'Property', icon: 'CityNext', color: colours.green },
  'Construction': { key: 'Construction', label: 'Construction', icon: 'ConstructionCone', color: colours.orange },
  'Employment': { key: 'Employment', label: 'Employment', icon: 'People', color: colours.yellow },
  'Other/Unsure': { key: 'Other/Unsure', label: 'Other/Unsure', icon: 'Help', color: colours.greyText },
};

/**
 * Compact icon-based area of work filter with toggle functionality
 * Shows all areas as selected by default, allows deselection/reselection
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
    console.log('🎯 IconAreaFilter: Toggle area clicked:', areaKey, 'current selection:', selectedAreas);
    
    if (selectedAreas.includes(areaKey)) {
      // Remove from selection
      const newSelection = selectedAreas.filter(a => a !== areaKey);
      console.log('🎯 IconAreaFilter: Removing area, new selection:', newSelection);
      onAreaChange(newSelection);
    } else {
      // Add to selection
      const newSelection = [...selectedAreas, areaKey];
      console.log('🎯 IconAreaFilter: Adding area, new selection:', newSelection);
      onAreaChange(newSelection);
    }
  };

  const noneSelected = selectedAreas.length === 0;

  return (
    <div 
      role="group"
      aria-label={ariaLabel}
      onClick={(e) => {
        console.log('🎯 IconAreaFilter: Container clicked');
        // Don't prevent propagation here - let child buttons handle their own clicks
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 32,
        padding: '3px 5px',
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
              console.log('🎯 IconAreaFilter: Button clicked for area:', areaKey);
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
                ? '#FFFFFF'
                : 'transparent',
              border: 'none',
              borderRadius: 13,
              cursor: 'pointer',
              transition: 'all 200ms ease',
              opacity: noneSelected || isSelected ? 1 : 0.4,
              boxShadow: isSelected 
                ? (isDarkMode
                    ? '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.24)'
                    : '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)')
                : 'none',
              pointerEvents: 'auto', // Ensure pointer events are enabled
              zIndex: 10, // Ensure button is clickable
            }}
            onMouseEnter={(e) => {
              console.log('🎯 IconAreaFilter: Mouse entered button for:', areaKey);
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <Icon
              iconName={area.icon}
              style={{
                fontSize: 12,
                color: isSelected 
                  ? area.color
                  : (isDarkMode ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.55)'),
              }}
            />
          </button>
        );
      })}
    </div>
  );
};

export default IconAreaFilter;