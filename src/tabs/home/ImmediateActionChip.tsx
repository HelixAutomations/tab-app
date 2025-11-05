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
} from 'react-icons/fa';
import {
  MdAssessment,
  MdArticle,
  MdEventSeat,
  MdSlideshow,
  MdFactCheck,
} from 'react-icons/md';
import { Icon } from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import AnimatedPulsingDot from '../../components/AnimatedPulsingDot';

/**
 * Visual severity category for immediate actions.
 */
export type ImmediateActionCategory = 'critical' | 'standard' | 'success';

/**
 * A compact, theme-aware chip for Immediate Actions.
 * Distinct from QuickActionsCard (used by Quick Actions) to allow independent styling and behavior.
 */
export interface ImmediateActionChipProps {
  title: string;
  icon: string;
  /**
   * Optional: parent components can hint the current theme.
   * Component also subscribes to ThemeContext so it stays in sync even when
   * chip instances are portalled away from re-rendering parents.
   */
  isDarkMode?: boolean;
  onClick: () => void;
  disabled?: boolean;
  subtitle?: string;
  count?: number;
  category?: ImmediateActionCategory;
}

// Minimal icon mapping for immediate actions domain
type IconComponent = React.ComponentType<{ style?: React.CSSProperties; className?: string }>;

const CalendarDayIcon: IconComponent = (props) => {
  const safeProps = props ?? {};
  const { style, className } = safeProps;
  return <Icon iconName="CalendarDay" style={style} className={className} />;
};

const chipIconMap: Record<string, IconComponent> = {
  // Generic
  OpenFile: FaFolderOpen,
  Folder: FaFolder,
  Phone: FaMobileAlt,

  // Attendance / Time
  Calendar: CalendarDayIcon,
  CalendarCheck: CalendarDayIcon,
  Accept: FaCheck,

  // Instructions
  ContactCard: FaIdBadge,
  Verify: FaUserCheck,
  IdCheck: FaIdBadge,
  Shield: FaShieldAlt,
  Send: FaPaperPlane,
  ReviewRequestMirrored: MdFactCheck,

  // Enquiries / Pitches
  Presentation: MdSlideshow,

  // Annual Leave / Approvals
  PalmTree: FaUmbrellaBeach,
  Edit: FaEdit,

  // Knowledge & Rooms
  KnowledgeArticle: MdArticle,
  Room: MdEventSeat,

};

const getChipIcon = (name: string): React.ComponentType<any> => {
  return chipIconMap[name] || FaFolder;
};

const readDarkModeFromDom = (): boolean | undefined => {
  if (typeof document === 'undefined') {
    return undefined;
  }
  const body = document.body;
  if (!body) {
    return undefined;
  }
  const themeAttr = body.dataset?.theme?.toLowerCase();
  if (themeAttr === 'dark' || themeAttr === 'contrast') {
    return true;
  }
  if (themeAttr === 'light' || themeAttr === 'default') {
    return false;
  }
  if (body.classList.contains('theme-dark')) {
    return true;
  }
  if (body.classList.contains('theme-light')) {
    return false;
  }
  return undefined;
};

export const ImmediateActionChip: React.FC<ImmediateActionChipProps> = ({
  title,
  icon,
  isDarkMode,
  onClick,
  disabled = false,
  subtitle,
  count,
  category = 'critical',
}) => {
  const chipRef = React.useRef<HTMLButtonElement>(null);
  const Icon = getChipIcon(icon);
  const [isHovered, setIsHovered] = React.useState(false);
  const { isDarkMode: contextDarkMode } = useTheme();
  const resolvedIsDarkMode = React.useMemo(() => {
    if (typeof contextDarkMode === 'boolean') {
      return contextDarkMode;
    }
    if (typeof isDarkMode === 'boolean') {
      return isDarkMode;
    }
    const fromDom = readDarkModeFromDom();
    return typeof fromDom === 'boolean' ? fromDom : false;
  }, [contextDarkMode, isDarkMode]);

  // Unified accent by theme (drop per-category colour-coding)
  // - Dark mode: use app accent (cyan) for attention-needed actions
  // - Light mode: use highlight blue for consistency
  const accentColour = resolvedIsDarkMode ? colours.accent : colours.highlight;

  const surfaceTokens = React.useMemo(() => {
    // Light mode: white chips so they stand out against the light grey portal
    if (!resolvedIsDarkMode) {
      return {
        background: '#FFFFFF',
        hoverBackground: '#F9FAFB',
        text: colours.light.text,
        border: 'rgba(148, 163, 184, 0.26)',
        hoverBorder: `${accentColour}66`, // ~0.4 alpha on highlight blue
        shadow: '0 4px 12px rgba(6, 23, 51, 0.12)',
        hoverShadow: '0 10px 24px rgba(6, 23, 51, 0.14)',
      } as const;
    }

    // Dark mode: deepen the surface to reduce washout and tone down hover shadows
    return {
      background: 'rgba(31, 41, 55, 0.65)',
      hoverBackground: 'rgba(31, 41, 55, 0.72)',
      text: 'rgba(243, 244, 246, 0.96)',
      border: 'rgba(148, 163, 184, 0.18)',
      hoverBorder: `${accentColour}73`, // ~0.45 alpha on accent in dark mode
      // Neutral, softer shadows in dark mode
      shadow: '0 4px 12px rgba(0, 0, 0, 0.28)',
      hoverShadow: '0 8px 18px rgba(0, 0, 0, 0.30)',
    } as const;
  }, [resolvedIsDarkMode, category]);

  // Theme-aware surface values reused through the render flow
  const baseBg = surfaceTokens.background;
  const hoverBg = surfaceTokens.hoverBackground;
  const textColor = surfaceTokens.text;
  const baseShadow = surfaceTokens.shadow;
  const hoverShadow = surfaceTokens.hoverShadow;
  const borderCol = surfaceTokens.border;

  React.useEffect(() => {
    if (disabled && isHovered) {
      setIsHovered(false);
    }
  }, [disabled, isHovered]);

  const chipStyles: (React.CSSProperties & Record<string, string | number>) = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    padding: '12px 14px',
    width: '100%',
    minHeight: 68,
    borderRadius: 10,
    background: isHovered && !disabled ? hoverBg : baseBg,
    color: textColor,
    border: `1px solid ${isHovered && !disabled ? surfaceTokens.hoverBorder : borderCol}`,
    boxShadow: isHovered && !disabled ? hoverShadow : baseShadow,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transform: isHovered && !disabled ? 'translateY(-2px)' : 'translateY(0)',
    transition: 'transform 160ms cubic-bezier(0.4, 0, 0.2, 1), background-color 160ms ease, border-color 160ms ease, box-shadow 200ms ease',
    position: 'relative',
    overflow: 'hidden',
  };

  chipStyles['--chip-background'] = isHovered && !disabled ? hoverBg : baseBg;
  chipStyles['--chip-border-spec'] = `1px solid ${isHovered && !disabled ? surfaceTokens.hoverBorder : borderCol}`;
  chipStyles['--chip-text'] = textColor;
  chipStyles['--chip-shadow'] = chipStyles.boxShadow as string;

  return (
    <button
      ref={chipRef}
      type="button"
      aria-label={subtitle ? `${title}: ${subtitle}` : title}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="immediate-action-chip"
      style={chipStyles}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      onMouseEnter={() => {
        if (!disabled) {
          setIsHovered(true);
        }
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      onFocus={() => {
        if (!disabled) {
          setIsHovered(true);
        }
      }}
      onBlur={() => {
        setIsHovered(false);
      }}
    >
      {/* Category indicator bar (top accent) */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: `linear-gradient(90deg, ${accentColour}, ${accentColour}80)`
      }} />

      {/* Header row with icon and count */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        gap: 10,
        width: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: resolvedIsDarkMode 
              ? `${accentColour}26`
              : `${accentColour}1A`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'transform 160ms ease',
            transform: isHovered && !disabled ? 'scale(1.05)' : 'scale(1)',
          }}>
            <Icon style={{ fontSize: 18, opacity: 0.95, color: accentColour }} />
          </div>
          <AnimatedPulsingDot
            show
            color={accentColour}
            size={7}
            animationDuration={category === 'critical' ? 320 : 400}
            style={{ flexShrink: 0 }}
          />
        </div>
        {typeof count === 'number' && (
          <span
            aria-label={`count ${count}`}
            style={{
              minWidth: 22,
              height: 22,
              padding: '0 8px',
              borderRadius: 11,
              background: resolvedIsDarkMode
                ? `${accentColour}33`
                : `${accentColour}1F`,
              color: resolvedIsDarkMode ? '#F8FAFC' : accentColour,
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${accentColour}40`,
            }}
          >
            {count}
          </span>
        )}
      </div>
      
      {/* Title */}
      <div style={{ 
        fontSize: 14, 
        fontWeight: 600,
        lineHeight: 1.35,
        width: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        textAlign: 'left',
        marginTop: subtitle ? 0 : 'auto',
      }}>
        {title}
      </div>
      
      {/* Subtitle if present */}
      {subtitle && (
        <div style={{ 
          fontSize: 11.5, 
          opacity: 0.7,
          lineHeight: 1.3,
          width: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'left',
          marginTop: 'auto',
        }}>
          {subtitle}
        </div>
      )}
    </button>
  );
};

export default ImmediateActionChip;
