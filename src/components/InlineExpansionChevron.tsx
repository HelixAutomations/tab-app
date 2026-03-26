import React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { colours } from '../app/styles/colours';

interface InlineExpansionChevronProps {
  isExpanded: boolean;
  onClick: (e: React.MouseEvent) => void;
  isDarkMode: boolean;
  count?: number;
  itemType: 'prospect' | 'client' | 'enquiry';
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
  const itemLabel = itemType === 'enquiry'
    ? (count === 1 ? 'enquiry' : 'enquiries')
    : `${itemType} ${count === 1 ? 'item' : 'items'}`;
  const title = isExpanded 
    ? `Collapse ${count} ${itemLabel}`
    : `Show all ${count} ${itemLabel}`;
  const baseBackground = isDarkMode ? 'rgba(8, 28, 48, 0.42)' : 'rgba(244, 244, 246, 0.78)';
  const hoverBackground = isDarkMode ? 'rgba(135, 243, 243, 0.1)' : 'rgba(214, 232, 255, 0.88)';
  const baseBorder = isDarkMode ? 'rgba(75, 85, 99, 0.48)' : 'rgba(160, 160, 160, 0.22)';
  const hoverBorder = isDarkMode ? 'rgba(135, 243, 243, 0.4)' : 'rgba(54, 144, 206, 0.3)';
  const baseIconColor = isDarkMode ? 'rgba(209, 213, 219, 0.92)' : 'rgba(55, 65, 81, 0.78)';
  const hoverIconColor = isDarkMode ? colours.accent : colours.highlight;

  return (
    <div
      onClick={onClick}
      style={{
        width: 22,
        height: 22,
        borderRadius: 0,
        background: baseBackground,
        border: `1px solid ${baseBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        pointerEvents: 'auto',
        color: baseIconColor,
        transition: 'background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = hoverBackground;
        e.currentTarget.style.borderColor = hoverBorder;
        e.currentTarget.style.color = hoverIconColor;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = baseBackground;
        e.currentTarget.style.borderColor = baseBorder;
        e.currentTarget.style.color = baseIconColor;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
      title={title}
    >
      <Icon
        iconName={isExpanded ? 'ChevronUp' : 'ChevronDown'}
        styles={{
          root: {
            fontSize: '9px',
            color: 'currentColor',
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