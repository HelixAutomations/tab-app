import React from 'react';
import { Icon } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
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
      background: isDark ? `${colours.blue}14` : `${colours.subtleGrey}26`,
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
  const [greetingDone, setGreetingDone] = React.useState(false);
  const [iconsMounted, setIconsMounted] = React.useState(false);

  // ── Compact mode: ResizeObserver on the bar itself ──
  // Catches browser zoom AND viewport resize — CSS media queries alone miss zoom.
  const barRef = React.useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = React.useState(false);

  React.useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentBoxSize?.[0]?.inlineSize
          ? entry.contentBoxSize[0].inlineSize <= 640
          : entry.contentRect.width <= 640);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Release notes unread dot — once per session
  const [releaseNotesUnread, setReleaseNotesUnread] = React.useState(() => {
    try { return !sessionStorage.getItem('releaseNotesRead'); } catch { return true; }
  });

  // Greeting logic — always replays on mount, on-brand
  const greetingLabel = React.useMemo(() => {
    if (!userDisplayName) return null;
    const trimmed = userDisplayName.trim();
    if (!trimmed) return null;
    const firstToken = trimmed.split(' ')[0];
    const name = firstToken.charAt(0).toUpperCase() + firstToken.slice(1);
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return `${timeGreeting}, ${name}`;
  }, [userDisplayName]);

  React.useEffect(() => {
    if (!greetingLabel) {
      setGreetingDone(true);
      return;
    }
    // Small delay so the bar renders first, then greeting slides in
    const showTimer = window.setTimeout(() => setShowGreeting(true), 300);
    const hideTimer = window.setTimeout(() => {
      setShowGreeting(false);
      // Mark greeting as done after fade-out transition completes
      window.setTimeout(() => setGreetingDone(true), 350);
    }, 4000);
    return () => { window.clearTimeout(showTimer); window.clearTimeout(hideTimer); };
  }, [greetingLabel]);

  // Trigger icon drop-in animation only after greeting has cleared
  React.useEffect(() => {
    if (!greetingDone) return;
    const timer = window.setTimeout(() => setIconsMounted(true), 80);
    return () => window.clearTimeout(timer);
  }, [greetingDone]);

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

  const greetingVisible = showGreeting && Boolean(greetingLabel) && !expanded && !isCompact;

  // Theme colours — brand tokens only
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textSecondary = isDarkMode ? colours.subtleGrey : colours.greyText;
  const interactiveAccent = isDarkMode ? colours.accent : colours.blue;
  const interactiveHoverBg = `${interactiveAccent}${isDarkMode ? '1A' : '14'}`;

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
              ? colours.darkBlue
            : 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(20px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
          borderTop: 'none',
          borderBottom: `0.5px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`,
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
        gap: isCompact ? 6 : 10,
        padding: isCompact ? '6px 10px' : '6px 20px',
        minHeight: isCompact ? 36 : 40,
        background: isDarkMode
            ? colours.darkBlue
          : 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(20px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
        borderBottom: `0.5px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`,
        position: 'relative',
        width: '100%',
        boxSizing: 'border-box',
      }}
      className={`qa-bar${isCompact ? ' qa-compact' : ''}`}
      ref={barRef}
      role="region"
      aria-label="Quick actions"
    >
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        aria-label={expanded ? 'Collapse actions' : 'Expand actions'}
        aria-expanded={expanded}
        style={{
          display: isCompact ? 'none' : 'flex',
          alignItems: 'center',
          gap: 6,
          height: 26,
          padding: '0 8px 0 6px',
          background: expanded
            ? interactiveHoverBg
            : 'transparent',
          border: 'none',
          borderRadius: 2,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.2s ease',
          color: expanded ? interactiveAccent : textSecondary,
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          letterSpacing: '0.04em',
          textTransform: 'none' as const,
        }}
        className="qa-toggle-btn"
      >
        <FaChevronRight
          style={{
            fontSize: 8,
            color: expanded ? interactiveAccent : textSecondary,
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s ease',
          }}
        />
        Actions
      </button>

      {/* Action chips — revealed on expand (desktop) or always visible icon-only (compact) */}
      <div
        className="qa-chips"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isCompact ? 4 : 6,
          ...(isCompact
            ? { maxWidth: 'none', opacity: 1, overflow: 'visible', pointerEvents: 'auto' as const }
            : {
                maxWidth: expanded ? 800 : 0,
                opacity: expanded ? 1 : 0,
                overflow: 'hidden' as const,
                transition: 'max-width 0.3s ease, opacity 0.2s ease',
                pointerEvents: (expanded ? 'auto' : 'none') as React.CSSProperties['pointerEvents'],
              }),
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
                gap: isCompact ? 0 : 6,
                padding: isCompact ? '4px 6px' : '5px 10px',
                background: isActive 
                  ? (isDarkMode
                    ? 'linear-gradient(0deg, rgba(54, 144, 206, 0.12), rgba(54, 144, 206, 0.12)), #061733'
                    : `${interactiveAccent}${isDarkMode ? '1A' : '10'}`)
                  : isHovered 
                    ? (isDarkMode
                      ? 'linear-gradient(0deg, rgba(54, 144, 206, 0.08), rgba(54, 144, 206, 0.08)), #061733'
                      : interactiveHoverBg)
                    : isDarkMode ? colours.darkBlue : 'transparent',
                border: isDarkMode ? `1px solid rgba(54, 144, 206, ${isHovered || isActive ? '0.45' : '0.25'})` : 'none',
                borderRadius: 2,
                color: isActive ? interactiveAccent : textPrimary,
                fontSize: 12,
                fontWeight: 500,
                cursor: isLoading && !isSelected ? 'not-allowed' : 'pointer',
                opacity: isLoading && !isSelected ? 0.5 : 1,
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                animation: isCompact ? 'none' : (expanded ? `fadeInChip 0.2s ease ${index * 0.03}s both` : 'none'),
              }}
              title={getShortTitle(action.title)}
            >
              <IconComponent
                style={{
                  fontSize: 14,
                  color: isActive ? interactiveAccent : isHovered ? textPrimary : textSecondary,
                  transition: 'color 0.2s ease',
                }}
              />
              {!isCompact && (
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
              )}
            </button>
          );
        })}
      </div>

      {/* Right zone — greeting swaps to icons */}
      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          flexShrink: 0,
          minHeight: 28,
        }}
      >
        {/* Greeting — shown first, fades out */}
        {greetingLabel && !greetingDone && (
          <div
            className="qa-greeting"
            aria-live="polite"
            role="status"
            style={{
              opacity: greetingVisible ? 1 : 0,
              transform: greetingVisible ? 'translateX(0)' : 'translateX(12px)',
              transition: 'opacity 0.35s ease, transform 0.35s ease',
              fontFamily: 'Raleway, sans-serif',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.01em',
              color: isDarkMode ? colours.accent : colours.blue,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              paddingRight: 4,
            }}
          >
            {greetingLabel}
          </div>
        )}

        {/* Pipe + Icons — appear after greeting is done */}
        {greetingDone && (onOpenReleaseNotes || onToggleTheme) && (
          <>
            {/* Vertical pipe separator */}
            <div
              style={{
                width: 1,
                height: 16,
                background: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
                marginRight: 8,
                animation: iconsMounted ? 'qaIconDropIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both' : 'none',
                opacity: iconsMounted ? 1 : 0,
              }}
            />
            {onOpenReleaseNotes && (
              <button
                onClick={() => {
                  setReleaseNotesUnread(false);
                  try { sessionStorage.setItem('releaseNotesRead', '1'); } catch {}
                  onOpenReleaseNotes();
                }}
                className="qa-icon-btn"
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  padding: 0,
                  border: 'none',
                  borderRadius: 2,
                  background: 'transparent',
                  color: textSecondary,
                  cursor: 'pointer',
                  transition: 'background 150ms ease, color 150ms ease',
                  animation: iconsMounted ? 'qaIconDropIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.05s both' : 'none',
                }}
                aria-label="Release notes"
                title="Release notes"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = interactiveHoverBg;
                  e.currentTarget.style.color = interactiveAccent;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = textSecondary;
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                {releaseNotesUnread && (
                  <span style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 5,
                    height: 5,
                    borderRadius: 999,
                    background: interactiveAccent,
                    boxShadow: `0 0 0 1.5px ${isDarkMode ? colours.darkBlue : colours.light.background}`,
                  }} />
                )}
              </button>
            )}
            {onToggleTheme && (
              <button
                onClick={onToggleTheme}
                className="qa-icon-btn"
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  padding: 0,
                  border: 'none',
                  borderRadius: 2,
                  background: 'transparent',
                  color: textSecondary,
                  cursor: 'pointer',
                  transition: 'background 150ms ease, color 150ms ease',
                  animation: iconsMounted ? 'qaIconDropIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.12s both' : 'none',
                }}
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = interactiveHoverBg;
                  e.currentTarget.style.color = interactiveAccent;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = textSecondary;
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 300ms ease' }}>
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
              </button>
            )}
          </>
        )}
      </div>

      {/* Animation keyframes + CSS fallback for compact */}
      <style>{`
        @keyframes fadeInChip {
          from { opacity: 0; transform: translateX(-6px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes qaIconDropIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.85); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        /* JS ResizeObserver handles compact via .qa-compact class.
           CSS media queries stay as a pre-paint fallback. */
        .qa-compact .qa-greeting,
        .qa-compact .qa-chip-label,
        .qa-compact .qa-toggle-btn { display: none !important; }
        .qa-compact .qa-chips {
          max-width: none !important;
          opacity: 1 !important;
          pointer-events: auto !important;
          overflow: visible !important;
        }
        @media (max-width: 640px) {
          .qa-greeting { display: none !important; }
          .qa-chip-label { display: none !important; }
          .qa-toggle-btn { display: none !important; }
          .qa-chips {
            max-width: none !important;
            opacity: 1 !important;
            pointer-events: auto !important;
            overflow: visible !important;
            gap: 4px !important;
          }
          .qa-bar { padding: 4px 12px !important; gap: 6px !important; min-height: 34px !important; }
          .qa-chips button { padding: 4px 6px !important; font-size: 11px !important; gap: 0 !important; }
          .qa-icon-btn { width: 24px !important; height: 24px !important; }
        }
        @media (max-width: 420px) {
          .qa-bar { padding: 3px 8px !important; gap: 3px !important; min-height: 30px !important; }
          .qa-chips button { padding: 3px 5px !important; }
          .qa-icon-btn { width: 22px !important; height: 22px !important; }
        }
      `}</style>
    </div>
  );
};

export default QuickActionsBar;
