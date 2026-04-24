import React from 'react';
import { colours } from '../../app/styles/colours';
import '../../app/styles/QuickActionsCard.css';
import AnimatedPulsingDot from '../../components/AnimatedPulsingDot';
import { getQuickActionIcons } from './QuickActionsCard.icons';

interface QuickActionsCardProps {
  title: string;
  icon: string;
  isDarkMode: boolean;
  onClick: () => void;
  iconColor?: string;
  selected?: boolean;
  confirmed?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  orientation?: 'row' | 'column';
  alwaysShowText?: boolean;
  showPulsingDot?: boolean;
  panelActive?: boolean;
}

// Icon mapping lives in a sibling helper module so this file exports only the
// card component, keeping it compatible with React Fast Refresh.

const QuickActionsCard: React.FC<QuickActionsCardProps> = ({
  title,
  icon,
  isDarkMode,
  onClick,
  selected = false,
  disabled = false,
  style = {},
  orientation = 'row',
  alwaysShowText = false,
  showPulsingDot = false,
  panelActive = false,
}) => {
  const [hovered, setHovered] = React.useState(false);
  const [showLabel, setShowLabel] = React.useState(false);

  const { OutlineIcon, FilledIcon } = getQuickActionIcons(icon);

  // Initialize showLabel based on alwaysShowText
  React.useEffect(() => {
    setShowLabel(alwaysShowText);
  }, [alwaysShowText]);

  // Dynamic classes
  const cardClasses = [
    'quickActionCard',
    isDarkMode ? 'dark-mode' : 'light-mode',
    selected && 'selected',
    orientation === 'column' && 'vertical',
    showLabel && 'show-label',
    !showLabel && 'labels-locked',
    hovered && 'hovered',
    disabled && 'disabled',
    panelActive && 'panel-active'
  ].filter(Boolean).join(' ');

  const iconStyle = {
    fontSize: 15, // Match immediate actions icon size
    color: isDarkMode ? colours.dark.text : colours.light.text,
  };

  return (
    <div
      className={cardClasses}
      onClick={disabled ? undefined : onClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      style={style}
      onMouseEnter={() => {
        setHovered(true);
        if (!alwaysShowText) {
          setShowLabel(true);
        }
      }}
      onMouseLeave={() => {
        setHovered(false);
        if (!alwaysShowText) {
          setShowLabel(false);
        }
      }}
      onKeyPress={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          onClick();
        }
      }}
      data-action={title}
    >
      {/* Icon container */}
      <div className="quick-action-icon">
        <OutlineIcon className="icon-outline" style={iconStyle} />
        <FilledIcon className="icon-filled" style={iconStyle} />
      </div>

      {/* Label */}
      <span className="quick-action-label">
        {title}
        {showPulsingDot && (
          <AnimatedPulsingDot 
            show={showPulsingDot} 
            size={6} 
            animationDuration={350} 
            style={{ marginLeft: 6 }}
          />
        )}
      </span>
    </div>
  );
};

export default QuickActionsCard;