import React from 'react';
// Modern QuickActionsBar with professional animations and no layout jolts
import { mergeStyles, Icon } from '@fluentui/react';
import QuickActionsCard from './QuickActionsCard';
import { colours } from '../../app/styles/colours';
import ToggleSwitch from '../../components/ToggleSwitch';

interface QuickAction {
    title: string;
    icon: string;
}

interface QuickActionsBarProps {
    isDarkMode: boolean;
    quickActions: QuickAction[];
    handleActionClick: (action: QuickAction) => void;
    currentUserConfirmed: boolean;
    highlighted?: boolean;
    resetSelectionRef?: React.MutableRefObject<(() => void) | null>;
    panelActive?: boolean;
    seamless?: boolean;
    userDisplayName?: string;
    userIdentifier?: string;
    onToggleTheme?: () => void;
}

const ACTION_BAR_HEIGHT = 32; // Align with quick action chip height for steady layout

const quickLinksStyle = (isDarkMode: boolean, highlighted: boolean, seamless: boolean) =>
    mergeStyles({
        // Transparent background - sits inside Navigator
        background: 'transparent',

        // Subtle separators with cyan tint in dark mode
        borderTop: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.15)' : 'rgba(148, 163, 184, 0.28)'}`,
        borderBottom: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.12)' : 'rgba(209, 213, 219, 0.65)'}`,
        
        // No backdrop filter
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        
        // No shadow
        boxShadow: 'none',
        
    // Compact padding aligned with portal gutter
    padding: '6px 16px',
    minHeight: ACTION_BAR_HEIGHT + 12,
        height: 'auto',
        transition: 'all 0.2s ease',
        
        // Flex layout: row so content reveals inline to the right of the label
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,

        // Root should not scroll horizontally; the chip row will handle its own overflow
        overflowX: 'hidden',
        overflowY: 'hidden',
        
        // Position within Navigator
        position: 'relative',
        zIndex: 1,
        
        // No border radius
        borderRadius: 0,

        // Full width within Navigator
    marginLeft: 0,
    marginRight: 0,
        width: '100%',
        marginTop: 0,
        
        // No spacing - flush with Navigator
        marginBottom: 0,
        
        // Layout containment for performance
        contain: 'layout style',
        
        // Hide scrollbars while maintaining functionality
        selectors: {
            '::-webkit-scrollbar': {
                display: 'none',
            },
        },
        
        // Responsive design
        '@media (max-width: 900px)': {
            padding: '4px 16px',
            gap: '4px',
        },
        '@media (max-width: 600px)': {
            padding: '4px 12px',
            gap: '2px',
        },
    });

const QuickActionsBar: React.FC<QuickActionsBarProps> = ({
    isDarkMode,
    quickActions,
    handleActionClick,
    currentUserConfirmed,
    highlighted = false,
    resetSelectionRef,
    panelActive = false,
    seamless = false,
    userDisplayName,
    userIdentifier,
    onToggleTheme,
}) => {
    const [selected, setSelected] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState<boolean>(false);
    const [collapsed, setCollapsed] = React.useState<boolean>(true);
    const [labelsExpanded, setLabelsExpanded] = React.useState<boolean>(false);
    const [showGreeting, setShowGreeting] = React.useState<boolean>(false);
    const iconRailWidth = React.useMemo(() => {
        const chipCount = quickActions.length;
        if (chipCount === 0) {
            return 0;
        }
        const chipWidth = 44;
        const backButtonWidth = 26; // 24px button + 2px margin
        const horizontalPadding = 8;
        return chipCount * chipWidth + backButtonWidth + horizontalPadding;
    }, [quickActions.length]);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const barRef = React.useRef<HTMLDivElement>(null);
    const headerRef = React.useRef<HTMLButtonElement>(null);
    const hasTriggeredGreetingRef = React.useRef<string | null>(null);

    const greetingStorageKey = React.useMemo(() => {
        if (!userDisplayName && !userIdentifier) {
            return null;
        }
        const identifier = (userIdentifier || userDisplayName || '').toLowerCase().trim();
        if (!identifier) {
            return null;
        }
        return `quickActionsGreeting:${identifier}`;
    }, [userDisplayName, userIdentifier]);

    const greetingLabel = React.useMemo(() => {
        if (!userDisplayName) {
            return null;
        }
        const trimmed = userDisplayName.trim();
        if (!trimmed) {
            return null;
        }
        const firstToken = trimmed.split(' ')[0];
        const capitalised = firstToken.charAt(0).toUpperCase() + firstToken.slice(1);
        return `Hi ${capitalised}!`;
    }, [userDisplayName]);

    const greetingVisible = showGreeting && Boolean(greetingLabel);

    React.useEffect(() => {
        if (!greetingStorageKey || !greetingLabel) {
            return;
        }
        if (hasTriggeredGreetingRef.current === greetingStorageKey) {
            return;
        }

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
            } catch {
                // Ignore storage failures
            }
        }
    }, [greetingLabel, greetingStorageKey]);

    React.useEffect(() => {
        if (!showGreeting) {
            return;
        }
        const timeout = window.setTimeout(() => {
            setShowGreeting(false);
        }, 4200);

        return () => {
            window.clearTimeout(timeout);
        };
    }, [showGreeting]);

    React.useEffect(() => {
        if (!collapsed) {
            setShowGreeting(false);
        }
    }, [collapsed]);

    // Expose reset function via ref, but don't reset if panel is still active
    React.useEffect(() => {
        if (resetSelectionRef) {
            resetSelectionRef.current = () => {
                if (!panelActive) {
                    setSelected(null);
                }
            };
        }
    }, [resetSelectionRef, panelActive]);

    // Reset selection when component unmounts
    React.useEffect(() => {
        return () => {
            setSelected(null);
        };
    }, []);

    const evaluateLabelSpace = React.useCallback(() => {
        if (collapsed) {
            return;
        }

        const chipCount = quickActions.length;
        if (chipCount === 0) {
            setLabelsExpanded(false);
            return;
        }

        const barWidth = barRef.current?.clientWidth ?? 0;
        const headerWidth = headerRef.current?.getBoundingClientRect().width ?? 0;
        const structuralAllowance = 40; // gaps + padding within the bar
        const backControlAllowance = 32; // collapse button footprint

        const usableWidth = Math.max(0, barWidth - headerWidth - structuralAllowance - backControlAllowance);
        const availablePerChip = usableWidth / chipCount;
        const nextExpanded = availablePerChip >= 120;
        setLabelsExpanded((prev) => (prev === nextExpanded ? prev : nextExpanded));
    }, [collapsed, quickActions.length]);

    React.useLayoutEffect(() => {
        if (collapsed) {
            return undefined;
        }

        evaluateLabelSpace();
        const frameId = window.requestAnimationFrame(() => {
            window.requestAnimationFrame(evaluateLabelSpace);
        });
        const settleTimer = window.setTimeout(evaluateLabelSpace, 220);

        const handleResize = () => evaluateLabelSpace();
        window.addEventListener('resize', handleResize);

        const observer = new ResizeObserver(() => evaluateLabelSpace());
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => {
            window.cancelAnimationFrame(frameId);
            window.clearTimeout(settleTimer);
            window.removeEventListener('resize', handleResize);
            observer.disconnect();
        };
    }, [collapsed, evaluateLabelSpace]);

    const onCardClick = (action: QuickAction) => {
        // Smooth loading state transition
        setSelected(action.title);
        setIsLoading(true);
        setShowGreeting(false);
        
        // Professional loading feedback
        setTimeout(() => {
            handleActionClick(action);
            setIsLoading(false);
        }, 150); // Brief loading state for smooth UX
    };

    // Optimized title mapping for better UX
    const getShortTitle = (title: string) => {
        switch (title) {
            case 'Create a Task':
                return 'New Task';
            case 'Save Telephone Note':
                return 'Attendance Note';
            case 'Request Annual Leave':
                return 'Book Leave';
            case 'Update Attendance':
                return 'Attendance';
            case 'Confirm Attendance':
                return 'Confirm Attendance';
            case 'Book Space':
                return 'Book Room';
            default:
                return title;
        }
    };

    return (
        <div
            ref={barRef}
            className={quickLinksStyle(isDarkMode, highlighted, seamless)}
            role="region"
            aria-label="Quick actions"
        >
            {/* Header: compact label with chevron toggle (chevron to the right) */}
            <button
                ref={headerRef}
                type="button"
                aria-expanded={!collapsed}
                onClick={() => {
                    setCollapsed((c) => !c);
                }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    height: ACTION_BAR_HEIGHT,
                    width: 'auto',
                    padding: '0 2px',
                    background: 'transparent',
                    border: 'none',
                    color: isDarkMode ? '#E5E7EB' : '#0F172A',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                    flex: '0 0 auto',
                    minWidth: 110,
                }}
            >
                <span style={{ fontSize: 13 }}>Quick actions</span>
                <Icon
                    iconName="DoubleChevronRight"
                    styles={{ root: {
                        transition: 'transform 200ms ease, opacity 160ms ease',
                        transform: collapsed ? 'translateX(0)' : 'translateX(6px)',
                        opacity: collapsed ? 1 : 0,
                        fontSize: 14,
                        color: isDarkMode ? '#9CA3AF' : '#64748B',
                    }}}
                />
            </button>

            {greetingLabel && (
                <div
                    aria-live="polite"
                    role="status"
                    style={{
                        position: 'absolute',
                        right: seamless ? 12 : 10,
                        top: '50%',
                        transform: greetingVisible
                            ? 'translateY(-50%) translateX(0)'
                            : 'translateY(-50%) translateX(42px)',
                        opacity: greetingVisible ? 1 : 0,
                        transition: 'opacity 200ms ease, transform 260ms cubic-bezier(0.33, 1, 0.68, 1)',
                        color: isDarkMode ? '#E5E7EB' : '#0F172A',
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: 0.2,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        textShadow: isDarkMode ? '0 1px 2px rgba(0,0,0,0.35)' : 'none',
                    }}
                >
                    {greetingLabel}
                </div>
            )}

            {/* Content: action chips list (expands inline to the right) */}
            <div
                ref={containerRef}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    paddingTop: 2,
                    paddingBottom: 2,
                    flexWrap: 'nowrap',
                    overflowX: 'visible', // Allow labels to show fully
                    msOverflowStyle: 'none',
                    scrollbarWidth: 'none',
                    flex: collapsed ? '0 0 0' : '0 1 auto',
                    minWidth: 0,
                    width: collapsed ? 0 : 'auto',
                    maxWidth: collapsed
                        ? 0
                        : (labelsExpanded ? '100%' : `${iconRailWidth}px`),
                    opacity: collapsed ? 0 : 1,
                    pointerEvents: collapsed ? 'none' : 'auto',
                    transition: 'max-width 220ms ease, flex 220ms ease, opacity 180ms ease',
                    // No border - clean look
                    border: 'none',
                    borderRadius: 0,
                    padding: 0, // No padding
                    background: 'transparent', // No fill
                }}
            >
                {/* Back control when expanded */}
                {!collapsed && (
                    <button
                        type="button"
                        aria-label="Collapse quick actions"
                        onClick={() => setCollapsed(true)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 24,
                            height: 24,
                            border: 'none',
                            borderRadius: 4,
                            background: 'transparent',
                            color: isDarkMode ? '#9CA3AF' : '#64748B',
                            cursor: 'pointer',
                            marginRight: 2,
                        }}
                    >
                        <Icon iconName="ChevronLeft" styles={{ root: { fontSize: 14 } }} />
                    </button>
                )}

                {!collapsed && quickActions.map((action, index) => (
                    <QuickActionsCard
                        key={action.title}
                        title={getShortTitle(action.title)}
                        icon={action.icon}
                        isDarkMode={isDarkMode}
                        onClick={() => onCardClick(action)}
                        iconColor={colours.cta}
                        selected={selected === action.title}
                        confirmed={action.title === 'Confirm Attendance' || action.title === 'Update Attendance' ? currentUserConfirmed : undefined}
                        disabled={isLoading && selected !== action.title}
                        panelActive={panelActive && selected === action.title}
                        alwaysShowText={labelsExpanded}
                        style={{
                            height: '32px',
                            opacity: (isLoading && selected !== action.title) ? 0.6 : 1,
                            filter: (isLoading && selected === action.title) 
                                ? 'brightness(1.06)'
                                : 'none',
                            borderRadius: 6, // Subtle rounding for hover area
                            // Cascading animation - simplified fade in
                            animation: `quickActionCascade 0.2s ease-out ${index * 0.03}s both`,
                        } as React.CSSProperties}
                    />
                ))}
            </div>

            {/* Loading overlay for smooth state transitions */}
            {isLoading && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: isDarkMode 
                            ? 'linear-gradient(135deg, rgba(45, 45, 45, 0.25) 0%, rgba(58, 58, 58, 0.18) 100%)'
                            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(248, 250, 252, 0.18) 100%)',
                        backdropFilter: 'blur(1px)',
                        pointerEvents: 'none',
                        transition: 'opacity 0.2s ease',
                    }}
                />
            )}

            {/* Dark mode toggle on right side (deferred until greeting completes to avoid overlap) */}
            {onToggleTheme && !greetingVisible && (
                <div
                    style={{
                        marginLeft: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        paddingLeft: 12,
                        borderLeft: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(6,23,51,0.1)'}`,
                    }}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={isDarkMode ? '#E5E7EB' : '#0F172A'}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flexShrink: 0 }}
                    >
                        {isDarkMode ? (
                            // Moon icon
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                        ) : (
                            // Sun icon
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
                    <span
                        style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: isDarkMode ? '#E5E7EB' : '#0F172A',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {isDarkMode ? 'Dark' : 'Light'}
                    </span>
                    <ToggleSwitch
                        checked={isDarkMode}
                        onChange={onToggleTheme}
                        ariaLabel="Toggle dark mode"
                    />
                </div>
            )}
        </div>
    );
};

export default QuickActionsBar;
