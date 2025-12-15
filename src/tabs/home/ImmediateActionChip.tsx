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
} from 'react-icons/fa';
import {
  MdArticle,
  MdEventSeat,
  MdSlideshow,
  MdFactCheck,
} from 'react-icons/md';
import { Icon } from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';

export type ImmediateActionCategory = 'critical' | 'standard' | 'success';

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

  // Minimal color tokens
  const bg = isDark ? 'rgba(30, 41, 59, 0.7)' : '#ffffff';
  const bgHover = isDark ? 'rgba(30, 41, 59, 0.85)' : '#f8fafc';
  const border = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)';
  const borderHover = isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(0, 0, 0, 0.12)';
  const text = isDark ? '#f1f5f9' : '#1e293b';
  const textMuted = isDark ? '#94a3b8' : '#64748b';
  const textSubtle = isDark ? '#64748b' : '#94a3b8';
  
  // Category accent - subtle left indicator
  const categoryColor = category === 'critical' 
    ? (isDark ? '#f87171' : '#dc2626')
    : category === 'success'
    ? (isDark ? '#4ade80' : '#16a34a')
    : '#3690CE'; // Helix highlight for standard category

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
        background: hovered ? bgHover : bg,
        color: text,
        borderTop: `1px solid ${hovered ? borderHover : border}`,
        borderRight: `1px solid ${hovered ? borderHover : border}`,
        borderBottom: `1px solid ${hovered ? borderHover : border}`,
        borderLeft: `3px solid ${categoryColor}`,
        boxShadow: hovered 
          ? (isDark ? '0 4px 12px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.08)')
          : (isDark ? '0 1px 3px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.04)'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
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
        opacity: 0.9,
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
              background: isDark ? 'rgba(156, 163, 175, 0.15)' : 'rgba(100, 116, 139, 0.1)',
              color: isDark ? '#cbd5e1' : '#475569',
              fontSize: 10,
              fontWeight: 600,
              verticalAlign: 'middle',
              borderRadius: 3,
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
