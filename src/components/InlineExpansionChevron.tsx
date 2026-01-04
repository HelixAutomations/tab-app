import React from 'react';
import { Icon } from '@fluentui/react';
import { colours } from '../app/styles/colours';

interface InlineExpansionChevronProps {
  isExpanded: boolean;
  onClick: (e: React.MouseEvent) => void;
  isDarkMode: boolean;
  count?: number;
  itemType: 'prospect' | 'client';
}

/**
 * Standardized expansion chevron button for table row grouping.
 * Used for both prospects (enquiries) and clients (instructions).
 */
const InlineExpansionChevron: React.FC<InlineExpansionChevronProps> = ({
  isExpanded,
  onClick,
  isDarkMode,
  count,
  itemType
}) => {
  const title = isExpanded 
    ? `Collapse ${count} ${itemType} ${count === 1 ? 'item' : 'items'}`
    : `Show all ${count} ${itemType} ${count === 1 ? 'item' : 'items'}`;

  return (
    <div
      onClick={onClick}
      style={{
        width: 24,
        height: 24,
        borderRadius: 0,
        background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        pointerEvents: 'auto',
        transition: 'all 0.2s ease',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)';
        e.currentTarget.style.transform = 'scale(1.05)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)';
        e.currentTarget.style.transform = 'scale(1)';
      }}
      title={title}
    >
      <Icon
        iconName={isExpanded ? 'ChevronUp' : 'ChevronDown'}
        styles={{
          root: {
            fontSize: '10px',
            color: isDarkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(71, 85, 105, 0.9)',
          }
        }}
      />
      
      {/* Count badge if provided */}
      {count && count > 1 && (
        <div style={{
          position: 'absolute',
          top: -6,
          right: -6,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: colours.blue,
          color: 'white',
          fontSize: '8px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)'}`,
        }}>
          {count}
        </div>
      )}
    </div>
  );
};

export default InlineExpansionChevron;