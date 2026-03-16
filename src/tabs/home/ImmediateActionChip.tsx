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
import { Icon } from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

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
}) => {
  const ChipIcon = getChipIcon(icon);
  const [isHovered, setIsHovered] = React.useState(false);
  const { isDarkMode: contextDarkMode } = useTheme();
  const isDark = contextDarkMode ?? propDarkMode ?? false;

  const text = isDark ? colours.dark.text : colours.light.text;
  const textMuted = isDark ? colours.subtleGrey : colours.greyText;
  const categoryAccent = colours.cta;

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
        gap: 7,
        width: '100%',
        minHeight: 30,
        padding: '3px 10px 3px 14px',
        minWidth: 0,
        maxWidth: 260,
        boxSizing: 'border-box' as const,
        background: hovered 
          ? (isDark
            ? `${categoryAccent}10`
            : `${categoryAccent}08`)
          : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.35)'),
        color: text,
        border: `1px solid ${hovered 
          ? categoryAccent
          : `${categoryAccent}30`}`,
        borderLeft: `2px solid ${categoryAccent}`,
        borderRadius: 2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
        boxShadow: 'none',
        transform: hovered && !disabled ? 'translateY(-0.5px)' : 'none',
        position: 'relative',
        textAlign: 'left',
        overflow: 'hidden',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
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
        color: hovered ? text : categoryAccent,
        background: 'transparent',
        borderRadius: 2,
        transition: 'color 0.2s ease',
      }}>
        <ChipIcon style={{ fontSize: 8 }} />
      </div>

      {/* Title */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: hovered ? text : text,
        }}>
          {title}
          {typeof count === 'number' && count > 0 && (
            <span style={{
              marginLeft: 6,
              padding: '1px 5px',
              background: isDark ? `${categoryAccent}12` : `${categoryAccent}10`,
              color: categoryAccent,
              fontSize: 7,
              fontWeight: 700,
              verticalAlign: 'middle',
              borderRadius: 2,
            }}>
              {count}
            </span>
          )}
        </div>
      </div>

      {/* Chevron */}
      <svg 
        width="12" 
        height="12" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke={textMuted}
        strokeWidth="2"
        style={{ flexShrink: 0, opacity: hovered ? 0.5 : 0.32 }}
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
};

// Responsive chip styles
const iacResponsiveId = 'iac-responsive-styles';
if (typeof document !== 'undefined' && !document.head.querySelector(`style[data-${iacResponsiveId}]`)) {
  const s = document.createElement('style');
  s.setAttribute(`data-${iacResponsiveId}`, '');
  s.textContent = `
    @media (max-width: 640px) {
      .iab-chip { padding: 3px 10px 3px 14px !important; gap: 7px !important; min-width: 0 !important; font-size: 9px !important; }
      .iab-chip > div:first-child { width: 16px !important; height: 16px !important; }
      .iab-chip svg:last-child { display: none !important; }
    }
    @media (max-width: 420px) {
      .iab-chip { padding: 3px 10px 3px 14px !important; gap: 6px !important; }
    }
  `;
  document.head.appendChild(s);
}

export default ImmediateActionChip;
