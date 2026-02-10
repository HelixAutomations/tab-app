import React, { useState } from 'react';
import { Icon } from '@fluentui/react';

interface ToolbarButtonProps {
  icon: string;
  onClick: () => void;
  isDarkMode: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ icon, onClick, isDarkMode }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 2,
        background: hovered
          ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)')
          : 'transparent',
        border: 'none', cursor: 'pointer',
        color: isDarkMode ? '#94a3b8' : '#64748b',
        transition: 'all 0.12s ease',
      }}
    >
      <Icon iconName={icon} styles={{ root: { fontSize: 13 } }} />
    </button>
  );
};

export default ToolbarButton;
