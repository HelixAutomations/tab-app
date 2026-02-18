import React from 'react';
import { Icon } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import ToggleSwitch from '../../components/ToggleSwitch';
import {
  FaChevronRight,
  FaRegCheckSquare,
  FaCheckSquare,
  FaUmbrellaBeach,
  FaRegBuilding,
  FaBuilding,
} from 'react-icons/fa';
import {
  MdSmartphone,
  MdOutlineEventSeat,
  MdEventSeat,
  MdOutlineLocationOn,
  MdLocationOn,
} from 'react-icons/md';
import {
  AiOutlinePlus,
  AiFillPlusSquare,
} from 'react-icons/ai';

interface QuickAction {
  title: string;
  icon: string;
}

interface QuickActionsBarProps {
  isDarkMode: boolean;
  quickActions: QuickAction[];
  handleActionClick: (action: QuickAction) => void;
  currentUserConfirmed?: boolean; // Reserved for future attendance confirmation indicator
  highlighted?: boolean; // Reserved for future highlight state
  resetSelectionRef?: React.MutableRefObject<(() => void) | null>;
  panelActive?: boolean;
  seamless?: boolean; // Reserved for seamless integration mode
  userDisplayName?: string;
  userIdentifier?: string;
  onToggleTheme?: () => void;
  onOpenReleaseNotes?: () => void;
  loading?: boolean; // Show skeleton loading state
}

// Skeleton chip for loading state - matches home page skeleton style
const SkeletonChip: React.FC<{ isDark: boolean; width?: number }> = ({ isDark, width = 90 }) => (
  <div
    className="skeleton-shimmer"
    style={{
      height: 30,
      width,
      borderRadius: 2,
      background: isDark ? 'rgba(54, 144, 206, 0.08)' : 'rgba(148, 163, 184, 0.15)',
    }}
  />
);

// Icon mapping for quick actions
const CalendarDayIcon: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <Icon iconName="CalendarDay" style={style} />
);

const iconMap: Record<string, { outline: React.ComponentType<any>; filled: React.ComponentType<any> }> = {
  Accept: { outline: FaRegCheckSquare, filled: FaCheckSquare },
  Checklist: { outline: FaRegCheckSquare, filled: FaCheckSquare },
  Calendar: { outline: CalendarDayIcon, filled: CalendarDayIcon },
  Room: { outline: MdOutlineEventSeat, filled: MdEventSeat },
  Building: { outline: FaRegBuilding, filled: FaBuilding },
  Plus: { outline: AiOutlinePlus, filled: AiFillPlusSquare },
  Phone: { outline: MdSmartphone, filled: MdSmartphone },
  Leave: { outline: FaUmbrellaBeach, filled: FaUmbrellaBeach },
  PalmTree: { outline: FaUmbrellaBeach, filled: FaUmbrellaBeach },
  Attendance: { outline: MdOutlineLocationOn, filled: MdLocationOn },
};

const getShortTitle = (title: string) => {
  switch (title) {
    case 'Create a Task': return 'New Task';
    case 'Save Telephone Note': return 'Attendance Note';
    case 'Request Annual Leave': return 'Request Leave';
    case 'Update Attendance': return 'Attendance';
    case 'Confirm Attendance': return 'Confirm Attendance';
    case 'Book Space': return 'Book Room';
    default: return title;
  }
};

const QuickActionsBar: React.FC<QuickActionsBarProps> = ({
  isDarkMode,
  quickActions,
  handleActionClick,
  resetSelectionRef,
  panelActive = false,
  userDisplayName,
  userIdentifier,
  onToggleTheme,
  onOpenReleaseNotes,
  loading = false,
}) => {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [hoveredAction, setHoveredAction] = React.useState<string | null>(null);
  const [showGreeting, setShowGreeting] = React.useState(false);

  // Release notes unread dot — once per session
  const [releaseNotesUnread, setReleaseNotesUnread] = React.useState(() => {
    try { return !sessionStorage.getItem('releaseNotesRead'); } catch { return true; }
  });
  const hasTriggeredGreetingRef = React.useRef<string | null>(null);

  // Greeting logic
  const greetingStorageKey = React.useMemo(() => {
    if (!userDisplayName && !userIdentifier) return null;
    const identifier = (userIdentifier || userDisplayName || '').toLowerCase().trim();
    if (!identifier) return null;
    return `quickActionsGreeting:${identifier}`;
  }, [userDisplayName, userIdentifier]);

  const greetingLabel = React.useMemo(() => {
    if (!userDisplayName) return null;
    const trimmed = userDisplayName.trim();
    if (!trimmed) return null;
    const firstToken = trimmed.split(' ')[0];
    return `Hi ${firstToken.charAt(0).toUpperCase() + firstToken.slice(1)}!`;
  }, [userDisplayName]);

  React.useEffect(() => {
    if (!greetingStorageKey || !greetingLabel) return;
    if (hasTriggeredGreetingRef.current === greetingStorageKey) return;

    let alreadySeen = false;
    try {
      alreadySeen = window.sessionStorage.getItem(greetingStorageKey) === 'seen';
    } catch {
      alreadySeen = false;
    }

    if (!alreadySeen) {
      hasTriggeredGreetingRef.current = greetingStorageKey;
      setShowGreeting(true);
      try {
        window.sessionStorage.setItem(greetingStorageKey, 'seen');
      } catch {}
    }
  }, [greetingLabel, greetingStorageKey]);

  React.useEffect(() => {
    if (!showGreeting) return;
    const timeout = window.setTimeout(() => setShowGreeting(false), 4200);
    return () => window.clearTimeout(timeout);
  }, [showGreeting]);

  React.useEffect(() => {
    if (expanded) setShowGreeting(false);
  }, [expanded]);

  // Reset selection via ref
  React.useEffect(() => {
    if (resetSelectionRef) {
      resetSelectionRef.current = () => {
        if (!panelActive) setSelected(null);
      };
    }
  }, [resetSelectionRef, panelActive]);

  React.useEffect(() => {
    return () => setSelected(null);
  }, []);

  const onCardClick = (action: QuickAction) => {
    setSelected(action.title);
    setIsLoading(true);
    setShowGreeting(false);
    setTimeout(() => {
      handleActionClick(action);
      setIsLoading(false);
    }, 120);
  };

  const greetingVisible = showGreeting && Boolean(greetingLabel) && !expanded;

  // Theme colours
  const textPrimary = isDarkMode ? '#F1F5F9' : '#0F172A';
  const textSecondary = isDarkMode ? '#94A3B8' : '#64748B';

  // Loading skeleton state - show chips similar to home page skeletons
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 16px',
          minHeight: 44,
          background: isDarkMode
            ? 'rgba(15, 23, 42, 0.6)'
            : 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.15)'}`,
          borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.15)'}`,
          width: '100%',
        }}
        role="region"
        aria-label="Quick actions loading"
        aria-busy="true"
      >
        {/* Skeleton toggle button */}
        <SkeletonChip isDark={isDarkMode} width={110} />
        {/* Skeleton action chips */}
        <SkeletonChip isDark={isDarkMode} width={85} />
        <SkeletonChip isDark={isDarkMode} width={100} />
        <SkeletonChip isDark={isDarkMode} width={75} />
        <SkeletonChip isDark={isDarkMode} width={90} />
        {/* Spacer for theme toggle area */}
        <div style={{ marginLeft: 'auto' }}>
          <SkeletonChip isDark={isDarkMode} width={50} />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        minHeight: 44,
        background: isDarkMode
          ? colours.darkBlue
          : colours.grey,
        borderBottom: `1px solid ${isDarkMode ? `${colours.dark.border}66` : 'rgba(0, 0, 0, 0.06)'}`,
        position: 'relative',
        width: '100%',
        boxSizing: 'border-box',
      }}
      className="qa-bar"
      role="region"
      aria-label="Quick actions"
    >
      {/* Greeting */}
      {greetingLabel && (
        <div
          className="qa-greeting"
          aria-live="polite"
          role="status"
          style={{
            position: 'absolute',
            right: onToggleTheme ? 140 : 16,
            top: '50%',
            transform: greetingVisible
              ? 'translateY(-50%) translateX(0)'
              : 'translateY(-50%) translateX(30px)',
            opacity: greetingVisible ? 1 : 0,
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            color: textPrimary,
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {greetingLabel}
        </div>
      )}

      {/* Toggle button + label */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        aria-label={expanded ? 'Collapse actions' : 'Expand actions'}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 28,
          padding: '0 8px 0 6px',
          background: expanded
            ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
            : 'transparent',
          border: `1px solid ${expanded ? (isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.25)') : 'transparent'}`,
          borderRadius: 2,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s ease',
          color: expanded ? colours.blue : textSecondary,
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          letterSpacing: '0.02em',
        }}
        className="qa-toggle-btn"
      >
        <FaChevronRight
          style={{
            fontSize: 10,
            color: expanded ? colours.blue : textSecondary,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease, color 0.15s ease',
          }}
        />
        Quick Actions
      </button>

      {/* Action chips — revealed on expand, labels shown when expanded */}
      <div
        className="qa-chips"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          maxWidth: expanded ? 800 : 0,
          opacity: expanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-width 0.3s ease, opacity 0.2s ease',
          pointerEvents: expanded ? 'auto' : 'none',
        }}
      >
        {quickActions.map((action, index) => {
          const isSelected = selected === action.title;
          const isHovered = hoveredAction === action.title;
          const isActive = isSelected && panelActive;
          const mapping = iconMap[action.icon] || { outline: FaRegCheckSquare, filled: FaCheckSquare };
          const IconComponent = isHovered || isActive ? mapping.filled : mapping.outline;

          return (
            <button
              key={action.title}
              type="button"
              onClick={() => !isLoading && onCardClick(action)}
              disabled={isLoading && !isSelected}
              onMouseEnter={() => setHoveredAction(action.title)}
              onMouseLeave={() => setHoveredAction(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 10px',
                background: isActive 
                  ? (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)')
                  : isHovered 
                    ? (isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.15)')
                    : 'transparent',
                border: `1px solid ${isActive ? (isDarkMode ? 'rgba(54, 144, 206, 0.4)' : colours.blue) : 'transparent'}`,
                borderRadius: 2,
                color: isActive ? colours.blue : textPrimary,
                fontSize: 13,
                fontWeight: 500,
                cursor: isLoading && !isSelected ? 'not-allowed' : 'pointer',
                opacity: isLoading && !isSelected ? 0.5 : 1,
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                animation: expanded ? `fadeInChip 0.2s ease ${index * 0.03}s both` : 'none',
              }}
              title={getShortTitle(action.title)}
            >
              <IconComponent
                style={{
                  fontSize: 15,
                  color: isActive ? colours.blue : isHovered ? textPrimary : textSecondary,
                  transition: 'color 0.15s ease',
                }}
              />
              <span
                className="qa-chip-label"
                style={{
                  overflow: 'hidden',
                  display: 'inline-block',
                  whiteSpace: 'nowrap',
                }}
              >
                {getShortTitle(action.title)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Release Notes chip + Theme toggle on right */}
      {!greetingVisible && (onOpenReleaseNotes || onToggleTheme) && (
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            paddingLeft: 10,
            borderLeft: `1px solid ${isDarkMode ? `${colours.dark.border}66` : 'rgba(0, 0, 0, 0.06)'}`,
          }}
        >
          {onOpenReleaseNotes && (
            <button
              onClick={() => {
                setReleaseNotesUnread(false);
                try { sessionStorage.setItem('releaseNotesRead', '1'); } catch {}
                onOpenReleaseNotes();
              }}
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                height: 18,
                padding: '0 8px',
                borderRadius: 18,
                border: 'none',
                background: isDarkMode ? 'rgba(148, 163, 184, 0.10)' : 'rgba(100, 116, 139, 0.10)',
                color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
                letterSpacing: '0.1px',
                whiteSpace: 'nowrap',
                lineHeight: 1,
                opacity: 0.7,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.7';
                e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.10)' : 'rgba(100, 116, 139, 0.10)';
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              Notes
              {releaseNotesUnread && (
                <span style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: '#3690CE',
                  boxShadow: '0 0 0 1.5px ' + (isDarkMode ? '#0f172a' : '#ffffff'),
                }} />
              )}
            </button>
          )}
          {onToggleTheme && (
            <>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            {isDarkMode ? (
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            ) : (
              <>
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </>
            )}
          </svg>
          <ToggleSwitch
            checked={isDarkMode}
            onChange={onToggleTheme}
            ariaLabel="Toggle dark mode"
            size="sm"
            style={{ opacity: 0.7 }}
          />
            </>
          )}
        </div>
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes fadeInChip {
          from { opacity: 0; transform: translateX(-6px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @media (max-width: 600px) {
          .qa-greeting { display: none !important; }
          .qa-chip-label { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default QuickActionsBar;
