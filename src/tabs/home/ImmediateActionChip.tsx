import React from 'react';
import {
  FaFolder,
  FaFolderOpen,
  FaIdBadge,
  FaUserCheck,
  FaMobileAlt,
  FaShieldAlt,
  FaPaperPlane,
  FaCheck,
  FaUmbrellaBeach,
  FaEdit,
  FaFileInvoiceDollar,
  FaClock,
  FaFileAlt,
} from 'react-icons/fa';
import {
  MdArticle,
  MdEventSeat,
  MdSlideshow,
  MdFactCheck,
  MdLocationOn,
} from 'react-icons/md';
import { Icon } from '@fluentui/react/lib/Icon';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours, withAlpha } from '../../app/styles/colours';
import './home-tokens.css';

// Category types for immediate action styling
export type ImmediateActionCategory = 'critical' | 'standard' | 'success' | 'warning';

export interface ImmediateActionChipProps {
  title: string;
  icon: string;
  isDarkMode?: boolean;
  onClick: () => void;
  disabled?: boolean;
  subtitle?: string;
  count?: number;
  totalCount?: number;
  category?: ImmediateActionCategory;
  allowWrap?: boolean;
  hideChevron?: boolean;
  dense?: boolean;
  fillWidth?: boolean;
}

type IconComponent = React.ComponentType<{ style?: React.CSSProperties; className?: string }>;

const CalendarDayIcon: IconComponent = (props) => (
  <Icon iconName="CalendarDay" style={props?.style} className={props?.className} />
);

const chipIconMap: Record<string, IconComponent> = {
  OpenFile: FaFolderOpen,
  Folder: FaFolder,
  Phone: FaMobileAlt,
  Calendar: CalendarDayIcon,
  CalendarCheck: CalendarDayIcon,
  Accept: FaCheck,
  ContactCard: FaIdBadge,
  Verify: FaUserCheck,
  IdCheck: FaIdBadge,
  Shield: FaShieldAlt,
  Send: FaPaperPlane,
  ReviewRequestMirrored: MdFactCheck,
  Presentation: MdSlideshow,
  PalmTree: FaUmbrellaBeach,
  Edit: FaEdit,
  Money: FaFileInvoiceDollar,
  KnowledgeArticle: MdArticle,
  Room: MdEventSeat,
  Attendance: MdLocationOn,
  Timer: FaClock,
  CCL: FaFileAlt,
  DocumentSet: FaFileAlt,
};

const getChipIcon = (name: string): React.ComponentType<any> => chipIconMap[name] || FaFolder;

export const ImmediateActionChip: React.FC<ImmediateActionChipProps> = ({
  title,
  icon,
  isDarkMode: propDarkMode,
  onClick,
  disabled = false,
  count,
  totalCount,
  category = 'critical',
  allowWrap = false,
  hideChevron = false,
  dense = false,
  fillWidth = true,
}) => {
  const ChipIcon = getChipIcon(icon);
  const [isHovered, setIsHovered] = React.useState(false);
  const { isDarkMode: contextDarkMode } = useTheme();
  const isDark = contextDarkMode ?? propDarkMode ?? false;

  const text = isDark ? colours.dark.text : colours.light.text;
  const textMuted = isDark ? colours.subtleGrey : colours.greyText;
  const categoryAccent = category === 'success'
    ? colours.green
    : category === 'warning'
      ? colours.orange
      : category === 'standard'
        ? (isDark ? colours.accent : colours.blue)
        : colours.cta;
  const restingBorder = withAlpha(categoryAccent, isDark ? 0.3 : 0.24);
  const restingSurface = isDark
    ? withAlpha(colours.darkBlue, 0.96)
    : colours.sectionBackground;
  const hoverSurface = isDark
    ? `linear-gradient(90deg, ${withAlpha(categoryAccent, 0.1)} 0%, ${withAlpha(colours.darkBlue, 0.96)} 100%)`
    : `linear-gradient(90deg, ${withAlpha(categoryAccent, 0.08)} 0%, ${colours.sectionBackground} 100%)`;

  const hovered = isHovered && !disabled;

  return (
    <button
      type="button"
      aria-label={title}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="iab-chip"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: dense ? 6 : 7,
        width: fillWidth ? '100%' : 'fit-content',
        minHeight: allowWrap ? (dense ? 32 : 34) : 28,
        padding: allowWrap
          ? (dense ? '3px 10px 3px 12px' : '4px 10px 4px 14px')
          : (dense ? '2px 9px 2px 12px' : '2px 10px 2px 14px'),
        minWidth: fillWidth ? 0 : 'fit-content',
        maxWidth: '100%',
        boxSizing: 'border-box' as const,
        background: hovered ? hoverSurface : restingSurface,
        color: text,
        borderTop: `1px solid ${hovered ? categoryAccent : restingBorder}`,
        borderRight: `1px solid ${hovered ? categoryAccent : restingBorder}`,
        borderBottom: `1px solid ${hovered ? categoryAccent : restingBorder}`,
        borderLeft: `2px solid ${categoryAccent}`,
        borderRadius: 2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
        boxShadow: hovered ? `0 2px 8px ${withAlpha(categoryAccent, isDark ? 0.1 : 0.06)}` : 'none',
        transform: hovered && !disabled ? 'translateY(-0.5px)' : 'none',
        position: 'relative',
        textAlign: 'left',
        overflow: 'hidden',
      }}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => !disabled && setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      {/* Icon */}
      <div style={{
        width: 16,
        height: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        alignSelf: allowWrap ? 'flex-start' : 'center',
        color: hovered ? text : categoryAccent,
        background: 'transparent',
        borderRadius: 2,
        transition: 'color 0.2s ease',
        marginTop: 0,
      }}>
        <ChipIcon style={{ fontSize: 10 }} />
      </div>

      {/* Title */}
      <div style={{ flex: fillWidth ? 1 : '0 1 auto', minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontSize: dense ? 11 : 11,
          fontWeight: 600,
          lineHeight: allowWrap ? 1.25 : 1.2,
          overflow: 'hidden',
          textOverflow: allowWrap ? 'clip' : 'ellipsis',
          whiteSpace: allowWrap ? 'normal' : 'nowrap',
          display: '-webkit-box',
          WebkitLineClamp: allowWrap ? 2 : 1,
          WebkitBoxOrient: 'vertical' as const,
          color: text,
        }}>
          {title}
          {typeof count === 'number' && count > 0 && (
            <span style={{
              marginLeft: 6,
              minWidth: 14,
              height: 12,
              padding: '0 5px',
              background: withAlpha(categoryAccent, isDark ? 0.07 : 0.06),
              color: categoryAccent,
              fontSize: 9,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
              verticalAlign: 'middle',
              borderRadius: 2,
            }}>
              {count}
            </span>
          )}
        </div>
      </div>

      {/* Chevron — hidden in single-column layout mode */}
      {!hideChevron && (
        <svg 
          width="12" 
          height="12" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke={textMuted}
          strokeWidth="2"
          style={{ flexShrink: 0, opacity: hovered ? 0.5 : 0.32, alignSelf: allowWrap ? 'flex-start' : 'center', marginTop: 0 }}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </button>
  );
};

export default ImmediateActionChip;
