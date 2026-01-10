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

  const text = isDark ? '#f1f5f9' : '#1e293b';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const textSubtle = isDark ? '#64748b' : '#94a3b8';

  const needsUrgentAttention = !disabled && (count ?? 0) > 0 && 
    (title.toLowerCase().startsWith('approve annual leave') || title.toLowerCase().startsWith('rate change'));
  
  // Category accent - subtle left indicator (red for urgent items)
  const categoryColor = needsUrgentAttention
    ? colours.cta  // Red for urgent attention
    : category === 'critical'
    ? colours.cta
    : category === 'warning'
    ? colours.orange
    : category === 'success'
    ? colours.green
    : colours.highlight;

  const hovered = isHovered && !disabled;

  return (
    <button
      type="button"
      aria-label={title}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        minWidth: 140,
        maxWidth: 280,
        background: needsUrgentAttention
          ? (isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)')
          : (hovered 
            ? (isDark 
                ? 'linear-gradient(90deg, rgba(24, 36, 58, 0.98) 0%, rgba(34, 48, 70, 0.95) 100%)' 
                : 'linear-gradient(90deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.95) 100%)')
            : (isDark 
                ? 'linear-gradient(90deg, rgba(18, 28, 48, 0.95) 0%, rgba(28, 40, 60, 0.92) 100%)' 
                : 'linear-gradient(90deg, rgba(255, 255, 255, 0.95) 0%, rgba(250, 251, 252, 0.9) 100%)')),
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        color: text,
        borderTop: `1px solid ${hovered ? (isDark ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.2)') : (isDark ? 'rgba(54, 144, 206, 0.2)' : 'rgba(148, 163, 184, 0.15)')}`,
        borderRight: `1px solid ${hovered ? (isDark ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.2)') : (isDark ? 'rgba(54, 144, 206, 0.2)' : 'rgba(148, 163, 184, 0.15)')}`,
        borderBottom: `1px solid ${hovered ? (isDark ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.2)') : (isDark ? 'rgba(54, 144, 206, 0.2)' : 'rgba(148, 163, 184, 0.15)')}`,
        borderLeft: `3px solid ${categoryColor}`,
        borderRadius: 2,
        boxShadow: needsUrgentAttention
          ? (isDark ? '0 0 0 1px rgba(239, 68, 68, 0.2), 0 4px 12px rgba(0,0,0,0.3)' : '0 0 0 1px rgba(239, 68, 68, 0.15), 0 4px 12px rgba(0,0,0,0.08)')
          : hovered
            ? (isDark ? '0 4px 16px rgba(0,0,0,0.35)' : '0 4px 16px rgba(0,0,0,0.08)')
            : (isDark ? '0 2px 8px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.04)'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.12s ease',
        transform: hovered && !disabled ? 'translateY(-1px) scale(1.01)' : 'translateY(0) scale(1)',
        animation: needsUrgentAttention ? 'helixUrgentPulse 1.4s ease-in-out infinite' : undefined,
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
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: categoryColor,
        background: needsUrgentAttention
          ? 'transparent'
          : (isDark ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)'),
        borderRadius: 2,
        transition: 'transform 0.12s ease',
        transform: hovered ? 'scale(1.1)' : 'scale(1)',
      }}>
        <ChipIcon style={{ fontSize: 14 }} />
      </div>

      {/* Title + Subtitle */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontSize: 12,
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
              background: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.08)',
              color: isDark ? '#cbd5e1' : '#475569',
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

export default ImmediateActionChip;

// CSS animation for urgent approval chip
const urgentStyle = document.createElement('style');
urgentStyle.textContent = `
@keyframes helixUrgentPulse {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-1px); }
}
`;
if (!document.head.querySelector('style[data-immediate-action-chip]')) {
  urgentStyle.setAttribute('data-immediate-action-chip', '');
  document.head.appendChild(urgentStyle);
}
