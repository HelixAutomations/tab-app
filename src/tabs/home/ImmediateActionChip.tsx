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
};

const getChipIcon = (name: string): React.ComponentType<any> => chipIconMap[name] || FaFolder;

export const ImmediateActionChip: React.FC<ImmediateActionChipProps> = ({
  title,
  icon,
  isDarkMode: propDarkMode,
  onClick,
  disabled = false,
  subtitle,
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
  const textSubtle = isDark ? colours.greyText : colours.subtleGrey;

  // All chips are equal-importance "to do" items — one consistent accent
  const accentColor = colours.highlight;

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
        padding: '5px 10px',
        minWidth: 100,
        maxWidth: 280,
        width: '100%',
        boxSizing: 'border-box' as const,
        background: hovered 
          ? (isDark ? 'linear-gradient(0deg, rgba(54, 144, 206, 0.08), rgba(54, 144, 206, 0.08)), #061733' : '#FFFFFF')
          : (isDark ? colours.darkBlue : colours.grey),
        color: text,
        border: `0.5px solid ${hovered 
          ? (isDark ? 'rgba(135, 243, 243, 0.15)' : 'rgba(0,0,0,0.09)') 
          : (isDark ? 'rgba(54, 144, 206, 0.18)' : 'rgba(0,0,0,0.06)')}`,
        borderLeft: `2px solid ${colours.cta}`,
        borderRadius: 2,
        boxShadow: hovered
          ? (isDark ? '0 2px 12px rgba(0, 3, 25, 0.4)' : '0 2px 12px rgba(0,0,0,0.06)')
          : (isDark ? '0 1px 4px rgba(0, 3, 25, 0.3)' : '0 1px 4px rgba(0,0,0,0.03)'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
        transform: hovered && !disabled ? 'translateY(-0.5px)' : 'none',
        position: 'relative',
        textAlign: 'left',
      }}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => !disabled && setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      {/* Icon */}
      <div style={{
        width: 18,
        height: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: isDark ? 'rgba(243, 244, 246, 0.65)' : accentColor,
        background: isDark ? 'rgba(135, 243, 243, 0.1)' : '#FFFFFF',
        borderRadius: 2,
        transition: 'transform 0.15s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}>
        <ChipIcon style={{ fontSize: 11 }} />
      </div>

      {/* Title + Subtitle */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {title}
          {typeof count === 'number' && count > 0 && (
            <span style={{
              marginLeft: 6,
              padding: '2px 6px',
              background: isDark ? 'rgba(54, 144, 206, 0.08)' : 'rgba(0,0,0,0.04)',
              color: isDark ? colours.subtleGrey : colours.greyText,
              fontSize: 10,
              fontWeight: 600,
              verticalAlign: 'middle',
              borderRadius: 2,
            }}>
              {count}
            </span>
          )}
        </div>
        {subtitle && (
          <div style={{
            fontSize: 10,
            fontWeight: 400,
            color: textSubtle,
            lineHeight: 1.3,
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {subtitle}
          </div>
        )}
      </div>

      {/* Chevron */}
      <svg 
        width="12" 
        height="12" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke={textMuted}
        strokeWidth="2"
        style={{ flexShrink: 0, opacity: 0.4 }}
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
      .iab-chip { padding: 5px 8px !important; gap: 6px !important; min-width: 0 !important; font-size: 10px !important; }
      .iab-chip > div:first-child { width: 18px !important; height: 18px !important; }
      .iab-chip svg:last-child { display: none !important; }
    }
    @media (max-width: 420px) {
      .iab-chip { padding: 4px 6px !important; gap: 4px !important; }
    }
  `;
  document.head.appendChild(s);
}

export default ImmediateActionChip;
