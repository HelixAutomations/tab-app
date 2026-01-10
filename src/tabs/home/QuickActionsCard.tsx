import React from 'react';
import {
  FaRegCheckSquare,
  FaCheckSquare,
  FaRegBuilding,
  FaBuilding,
  FaRegUser,
  FaUser,
  FaRegFolder,
  FaFolder,
  FaRegIdBadge,
  FaIdBadge,
  FaMobileAlt,
  FaUmbrellaBeach,
} from 'react-icons/fa';
import {
  AiOutlinePlus,
  AiFillPlusSquare,
} from 'react-icons/ai';
import {
  MdOutlineEventSeat,
  MdEventSeat,
  MdOutlineAssessment,
  MdAssessment,
  MdOutlineArticle,
  MdArticle,
  MdOutlineLocationCity,
  MdLocationCity,
  MdOutlineConstruction,
  MdConstruction,
  MdSmartphone,
  MdOutlineSlideshow,
  MdSlideshow,
  MdOutlineLocationOn,
  MdLocationOn,
} from 'react-icons/md';
import { Icon } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import '../../app/styles/QuickActionsCard.css';
import AnimatedPulsingDot from '../../components/AnimatedPulsingDot';

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

// Icon mapping with outline/filled pairs
type IconComponent = React.ComponentType<{ style?: React.CSSProperties; className?: string }>;

// Wrapper for Fluent UI Icon to match React Icons signature
const CalendarDayIcon = React.forwardRef<HTMLElement, { style?: React.CSSProperties; className?: string }>((props, ref) => {
  return <Icon iconName="CalendarDay" style={props.style} className={props.className} />;
});
CalendarDayIcon.displayName = 'CalendarDayIcon';

const iconMap: Record<string, { outline: IconComponent; filled: IconComponent }> = {
  Accept: { outline: FaRegCheckSquare, filled: FaCheckSquare },
  Checklist: { outline: FaRegCheckSquare, filled: FaCheckSquare },
  Comment: { outline: MdSmartphone, filled: FaMobileAlt },
  Calendar: { outline: CalendarDayIcon, filled: CalendarDayIcon },
  CalendarCheck: { outline: FaRegUser, filled: FaUser },
  Room: { outline: MdOutlineEventSeat, filled: MdEventSeat },
  Building: { outline: FaRegBuilding, filled: FaBuilding },
  Plus: { outline: AiOutlinePlus, filled: AiFillPlusSquare },
  Phone: { outline: MdSmartphone, filled: FaMobileAlt },
  Leave: { outline: FaUmbrellaBeach, filled: FaUmbrellaBeach },
  PalmTree: { outline: FaUmbrellaBeach, filled: FaUmbrellaBeach },
  OpenFile: { outline: FaRegFolder, filled: FaFolder },
  IdCheck: { outline: FaRegIdBadge, filled: FaIdBadge },
  Assessment: { outline: MdOutlineAssessment, filled: MdAssessment },
  KnowledgeArticle: { outline: MdOutlineArticle, filled: MdArticle },
  CityNext: { outline: MdOutlineLocationCity, filled: MdLocationCity },
  ConstructionCone: { outline: MdOutlineConstruction, filled: MdConstruction },
  Presentation: { outline: MdOutlineSlideshow, filled: MdSlideshow },
  Attendance: { outline: MdOutlineLocationOn, filled: MdLocationOn },
};

// Export function to get filled icon for panel headers
export const getQuickActionIcon = (iconName: string): React.ComponentType<any> | null => {
  const mapping = iconMap[iconName];
  if (!mapping) {
    console.warn(`No icon mapping found for: ${iconName}`);
    return null;
  }
  
  const IconComponent = mapping.filled;
  
  // Directly return the component - React Icons and our custom components are all valid
  // No need for additional checks as they're all defined correctly above
  return IconComponent;
};

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

  // Get icon components
  const getIcons = (iconName: string) => {
    const mapping = iconMap[iconName];
    if (mapping) {
      return {
        OutlineIcon: mapping.outline,
        FilledIcon: mapping.filled,
      };
    }
    // Fallback
    return {
      OutlineIcon: FaRegCheckSquare,
      FilledIcon: FaCheckSquare,
    };
  };

  const { OutlineIcon, FilledIcon } = getIcons(icon);

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