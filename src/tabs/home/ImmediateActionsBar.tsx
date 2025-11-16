import React, { useEffect, useState } from 'react';
// invisible change 2
import { Spinner, SpinnerSize, mergeStyles, keyframes } from '@fluentui/react';
import { FaCheck } from 'react-icons/fa';
import ImmediateActionChip, { ImmediateActionCategory } from './ImmediateActionChip';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';

interface Action {
    title: string;
    onClick: () => void;
    icon: string;
    disabled?: boolean; // For greyed out production features
    category?: ImmediateActionCategory;
    count?: number; // Badge count displayed on the right
}

interface ImmediateActionsBarProps {
    isDarkMode?: boolean;
    immediateActionsReady: boolean;
    immediateActionsList: Action[];
    highlighted?: boolean;
    seamless?: boolean;
}

const ACTION_BAR_HEIGHT = 48;
const HIDE_DELAY_MS = 3000; // Auto-hide delay when there is nothing to action

// Purpose-built container with subtle styling to blend with app
const immediateActionsContainerStyle = (
    isDarkMode: boolean,
    highlighted: boolean,
    hasActions: boolean
) =>
    mergeStyles({
        // Position within Navigator
        position: 'relative',
        zIndex: 1,
        
        // Let background inherit from parent to avoid boxed feel
        background: 'transparent',
        
        // No backdrop filter
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        
        // Light separation only when actions present
        borderTop: 'none',
        borderBottom: 'none',
        borderRadius: 0,
        
        // No shadow
        boxShadow: 'none',
        
        // Comfortable padding
        marginTop: '0',
        marginLeft: '0',
        marginRight: '0',
        marginBottom: '0',
        padding: hasActions ? '12px 0 16px' : '0',
        transition: 'all 0.25s ease',
        
        // Highlighted state - still subtle but slightly more visible
        ...(highlighted && {
            opacity: 1,
        }),
    });

const barStyle = (
    isDarkMode: boolean,
    hasImmediateActions: boolean,
    highlighted: boolean,
    seamless: boolean
) =>
    mergeStyles({
        // Remove background since container handles it
        backgroundColor: 'transparent',
        boxShadow: 'none',
        border: 'none',
        
        // Flexible layout - actions flow naturally without fixed slots
        padding: '0',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        alignItems: 'stretch',
        minHeight: hasImmediateActions ? ACTION_BAR_HEIGHT : 'auto',
        
        // Children flex to fill space elegantly
        '& > *': {
            flex: '1 1 auto',
            minWidth: 160,
            maxWidth: 240,
        },
        
        // Responsive: adjust minimum card width on smaller screens
        '@media (max-width: 768px)': {
            gap: '8px',
            '& > *': {
                minWidth: 140,
                maxWidth: 200,
            },
        },
        '@media (max-width: 480px)': {
            gap: '6px',
            '& > *': {
                minWidth: 120,
                flex: '1 1 100%',
            },
        },
    });

// Success message container for "Nothing to Action" state
const successMessageStyle = (isDarkMode: boolean) =>
    mergeStyles({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '16px 20px',
        borderRadius: 10,
        background: isDarkMode 
            ? 'linear-gradient(135deg, rgba(115, 171, 96, 0.12), rgba(115, 171, 96, 0.06))'
            : 'linear-gradient(135deg, rgba(115, 171, 96, 0.08), rgba(115, 171, 96, 0.04))',
        border: isDarkMode 
            ? '1px solid rgba(115, 171, 96, 0.25)' 
            : '1px solid rgba(115, 171, 96, 0.2)',
        transition: 'all 0.3s ease',
        gap: 12,
        minHeight: 54,
        flex: '0 0 auto',
        minWidth: 'auto',
        maxWidth: '100%',
        width: 'auto',
        flexWrap: 'nowrap',
        boxShadow: isDarkMode
            ? '0 2px 8px rgba(0, 0, 0, 0.2)'
            : '0 1px 3px rgba(15, 23, 42, 0.08)',
    });

// Loading state container
const loadingStateStyle = (isDarkMode: boolean) =>
    mergeStyles({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '16px 20px',
        borderRadius: 10,
        background: isDarkMode 
            ? 'rgba(54, 144, 206, 0.06)'
            : 'rgba(54, 144, 206, 0.03)',
        border: isDarkMode 
            ? '1px solid rgba(54, 144, 206, 0.2)' 
            : '1px solid rgba(54, 144, 206, 0.15)',
        minHeight: 54,
        width: 'auto',
        maxWidth: '100%',
        alignSelf: 'flex-start',
        flexShrink: 0,
        gap: 12,
        gridColumn: '1 / -1', // Span full width
    });

const fadeInKeyframes = keyframes({
    from: { opacity: 0, transform: 'translateY(5px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
});

const tickPopKeyframes = keyframes({
    '0%': { transform: 'scale(0)', opacity: 0 },
    '70%': { transform: 'scale(1.3)', opacity: 1 },
    '100%': { transform: 'scale(1)', opacity: 1 },
});

const noActionsClass = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    // Align message with the quick action cards
    justifyContent: 'flex-start',
    paddingLeft: '12px',
    animation: `${fadeInKeyframes} 0.3s ease-out`,
});

const noActionsIconClass = mergeStyles({
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: colours.highlight,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    flexShrink: 0,
    animation: `${tickPopKeyframes} 0.3s ease`,
});

const noActionsTextClass = mergeStyles({
    marginLeft: '8px',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    whiteSpace: 'nowrap',
    animation: `${fadeInKeyframes} 0.3s ease-out`,
});

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

const ImmediateActionsBar: React.FC<ImmediateActionsBarProps> = ({
    isDarkMode,
    immediateActionsReady,
    immediateActionsList,
    highlighted = false,
    seamless = false,
}) => {
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

    const [visible, setVisible] = useState(true);
    const [autoHidden, setAutoHidden] = useState(false);
    const computedVisible = (immediateActionsList.length > 0 || !immediateActionsReady) ? true : visible;

    // Hide on scroll only when not auto-hidden and there are no actions
    useEffect(() => {
        const handleScroll = () => {
            if (autoHidden) return; // keep hidden once auto-hidden until content changes
            const threshold = ACTION_BAR_HEIGHT * 2;
            if (window.scrollY > threshold) {
                setVisible(false);
            } else {
                setVisible(true);
            }
        };

        if (immediateActionsList.length === 0 && !autoHidden) {
            window.addEventListener('scroll', handleScroll);
        }

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [immediateActionsList, autoHidden]);

    // Auto-hide the bar a few seconds after showing "Nothing to Action"
    useEffect(() => {
        let timer: number | undefined;
        if (immediateActionsReady && immediateActionsList.length === 0) {
            // show briefly, then hide
            setAutoHidden(false);
            setVisible(true);
            timer = window.setTimeout(() => {
                setAutoHidden(true);
                setVisible(false);
            }, HIDE_DELAY_MS);
        } else {
            // content changed (spinner or actions present) → ensure visible and reset auto-hidden
            if (autoHidden) setAutoHidden(false);
            setVisible(true);
        }

        return () => {
            if (timer) window.clearTimeout(timer);
        };
    }, [immediateActionsReady, immediateActionsList.length]);

    const hasActions = immediateActionsList.length > 0;

    return (
        <div
            className={immediateActionsContainerStyle(resolvedIsDarkMode, highlighted, hasActions)}
            style={{
                height: computedVisible ? 'auto' : 0,
                overflow: 'hidden',
                opacity: computedVisible ? 1 : 0,
                transform: computedVisible ? 'translateY(0)' : 'translateY(-8px)',
                transition: 'height 0.3s ease, opacity 0.3s ease, transform 0.3s ease',
                pointerEvents: (computedVisible && immediateActionsReady) ? 'auto' : 'none',
                // When hidden, remove all spacing
                borderTop: computedVisible ? undefined : 'none',
                padding: computedVisible ? undefined : 0,
                marginTop: computedVisible ? undefined : 0,
                marginBottom: computedVisible ? undefined : 0,
            }}
        >
            {/* Header label for immediate actions */}
            {hasActions && immediateActionsReady && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 10,
                    paddingBottom: 8,
                    borderBottom: resolvedIsDarkMode 
                        ? '1px solid rgba(148, 163, 184, 0.15)'
                        : '1px solid rgba(0, 0, 0, 0.08)',
                }}>
                    <span style={{
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                            whiteSpace: 'nowrap',
                        color: resolvedIsDarkMode ? '#F3F4F6' : '#0F172A',
                        opacity: 0.9,
                    }}>
                        To Do
                    </span>
                    <span style={{
                        marginLeft: 'auto',
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: resolvedIsDarkMode 
                            ? 'rgba(135, 243, 243, 0.2)'
                            : 'rgba(214, 85, 65, 0.15)',
                        color: resolvedIsDarkMode ? '#87F3F3' : '#DC2626',
                    }}>
                        {immediateActionsList.length} {immediateActionsList.length === 1 ? 'item' : 'items'}
                    </span>
                </div>
            )}
            
            {/* Content area with improved states */}
            <div
                className={barStyle(
                    resolvedIsDarkMode,
                    hasActions,
                    highlighted,
                    seamless
                )}
            >
                {!immediateActionsReady ? (
                    // Loading state - clean, centered
                    <div className={loadingStateStyle(resolvedIsDarkMode)}>
                        <Spinner size={SpinnerSize.medium} />
                        <span style={{ 
                            fontSize: 14, 
                            fontWeight: 500,
                            color: resolvedIsDarkMode ? colours.dark.text : colours.light.text,
                            whiteSpace: 'normal',
                            maxWidth: '100%',
                        }}>
                            Checking for immediate actions...
                        </span>
                    </div>
                ) : immediateActionsList.length === 0 ? (
                    // Success state - nothing to action
                    <div
                        className={successMessageStyle(resolvedIsDarkMode)}
                        style={{
                            flex: '0 0 auto',
                            minWidth: 'auto',
                            maxWidth: '100%',
                            width: 'auto',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <div className={noActionsIconClass}>
                            <FaCheck />
                        </div>
                        <span className={noActionsTextClass}>
                            <span style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: resolvedIsDarkMode ? colours.dark.text : colours.light.text,
                            }}>
                                All Clear
                            </span>
                            <span style={{
                                fontSize: 12,
                                opacity: 0.8,
                                color: resolvedIsDarkMode ? colours.dark.text : colours.light.text,
                            }}>
                                No immediate actions required at this time
                            </span>
                        </span>
                    </div>
                ) : (
                    // Actions present - display all chips naturally
                    <>
                        {immediateActionsList.map((action) => (
                            <ImmediateActionChip
                                key={action.title}
                                title={action.title}
                                icon={action.icon}
                                isDarkMode={resolvedIsDarkMode}
                                onClick={action.onClick}
                                disabled={action.disabled}
                                category={action.category}
                                count={action.count}
                            />
                        ))}
                    </>
                )}
            </div>
        </div>
    );
};

export default ImmediateActionsBar;
