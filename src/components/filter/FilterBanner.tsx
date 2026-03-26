import React from 'react';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { Icon } from '@fluentui/react/lib/Icon';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import SegmentedControl from './SegmentedControl';
import { sharedSearchBoxStyle } from '../../app/styles/FilterStyles';

// Add animation CSS
const animations = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateX(-4px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes helixSweep {
    0% { transform: translateX(-120%); opacity: 0; }
    12% { opacity: 0.28; }
    50% { opacity: 0.85; }
    88% { opacity: 0.28; }
    100% { transform: translateX(240%); opacity: 0; }
  }
`;



// Inject CSS into head if not already present
if (typeof document !== 'undefined' && !document.querySelector('#filter-banner-animations')) {
  const style = document.createElement('style');
  style.id = 'filter-banner-animations';
  style.textContent = animations;
  document.head.appendChild(style);
}

export interface FilterOption {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

export interface FilterBannerProps {
  // Left section action (e.g., back button) - separated with border like home in CustomTabs
  leftAction?: React.ReactNode;
  
  // Primary filter (status/type) - can be React node or SegmentedControl props
  primaryFilter?: React.ReactNode | {
    value: string;
    onChange: (value: string) => void;
    options: FilterOption[];
    ariaLabel: string;
  };
  
  // Secondary filter (area/category) - can be React node or SegmentedControl props  
  secondaryFilter?: React.ReactNode | {
    value: string;
    onChange: (value: string) => void;
    options: FilterOption[];
    ariaLabel: string;
  };
  
  // Search functionality
  search?: {
    value?: string;
    onChange: (value: string) => void;
    placeholder: string;
    debounceMs?: number;
  };
  searchPlacement?: 'filters' | 'right';
  
  // Refresh functionality
  refresh?: {
    onRefresh: () => void;
    isLoading?: boolean;
    progressPercentage?: number; // 0-100 — fill starts full (100) and empties toward 0
    countdownLabel?: string; // e.g. "0:42"
  };
  
  // Actions between search and refresh (e.g., view toggle)
  middleActions?: React.ReactNode;
  
  // Right-side actions (placed after search/refresh)
  rightActions?: React.ReactNode;
  
  // Additional actions/controls
  children?: React.ReactNode;
  
  // Styling options
  className?: string;
  sticky?: boolean;
  topOffset?: number;
  // Remove chrome (background/border/shadow) for embedding inside another banner
  seamless?: boolean;
  // Denser spacing for compact navigators
  dense?: boolean;
  // When true, show a collapsed search icon that expands on click/focus
  collapsibleSearch?: boolean;
}

/**
 * Shared filter banner component for consistent styling across all tabs
 */
const FilterBanner: React.FC<FilterBannerProps> = React.memo(({
  leftAction,
  primaryFilter,
  secondaryFilter,
  search,
  refresh,
  middleActions,
  rightActions,
  children,
  className,
  sticky = true,
  topOffset = 0,
  seamless = false,
  dense = false,
  collapsibleSearch = false,
  searchPlacement = 'right'
}) => {
  const { isDarkMode } = useTheme();
  const [localSearchValue, setLocalSearchValue] = React.useState<string>(search?.value ?? '');
  const searchDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedSearchValue = search?.debounceMs ? localSearchValue : (search?.value ?? '');
  const [searchOpen, setSearchOpen] = React.useState<boolean>(!collapsibleSearch || !!resolvedSearchValue);

  const searchInputRef = React.useRef<any>(null);

  // Keep local value in sync when external value changes (e.g., clear filters)
  React.useEffect(() => {
    if (!search?.debounceMs) {
      return;
    }
    const next = search.value ?? '';
    setLocalSearchValue(next);
  }, [search?.debounceMs, search?.value]);

  React.useEffect(() => () => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
  }, []);

  // Auto-focus search when it opens
  React.useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      // Use setTimeout to ensure the SearchBox is rendered before focusing
      setTimeout(() => {
        const input = searchInputRef.current?.querySelector('input');
        if (input) {
          input.focus();
        }
      }, 50);
    }
  }, [searchOpen]);

  const containerStyle = mergeStyles({
    display: 'flex',
    alignItems: 'stretch',
    gap: 0,
    position: 'relative',
    padding: seamless
      ? (dense ? '4px 8px' : '8px 12px')
      : (dense ? '6px 12px' : '12px 20px'),
    background: seamless ? 'transparent' : (dense
      ? (isDarkMode ? colours.darkBlue : colours.grey)
      : (isDarkMode ? colours.darkBlue : colours.grey)),
    borderBottom: seamless
      ? 'none'
      : refresh?.isLoading
        ? '1px solid transparent'
        : (dense
          ? (isDarkMode ? `1px solid ${colours.dark.border}66` : '1px solid rgba(0, 0, 0, 0.06)')
          : (isDarkMode
            ? `1px solid ${colours.dark.border}66`
            : '1px solid rgba(0, 0, 0, 0.06)')),
    boxShadow: 'none',
    fontFamily: 'Raleway, sans-serif',
    minHeight: dense ? 40 : 48,
    height: 'auto',
    ...(sticky && {
      position: 'sticky',
      top: topOffset,
      zIndex: 2000,
    }),
    transition: '0.2s',
    width: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    selectors: {
      '@media (max-width: 800px)': {
        padding: seamless ? undefined : (dense ? '4px 8px' : '8px 12px'),
        minHeight: dense ? 36 : 42,
      },
      '@media (max-width: 600px)': {
        padding: dense ? '4px 6px' : '6px 10px',
        minHeight: dense ? 32 : 38,
      },
    }
  }, className);

  const filtersContainerStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 6,
    flex: '0 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    alignContent: 'center',
  });

  // Dynamic width based on search state - collapsed search takes minimal space
  const isSearchCollapsed = collapsibleSearch && !searchOpen && !resolvedSearchValue;
  const showSearchInFilters = Boolean(search) && searchPlacement === 'filters';
  const showSearchInRightCluster = Boolean(search) && searchPlacement !== 'filters';
  
  const searchContainerStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: '0 1 auto',
    minWidth: isSearchCollapsed ? 'auto' : 'clamp(120px, 20vw, 240px)',
    width: isSearchCollapsed ? 'auto' : 'clamp(120px, 20vw, 240px)',
    transition: 'none',
  });

  const searchBoxStyles = React.useMemo(() => {
    const baseStyles = sharedSearchBoxStyle(isDarkMode);
    const stroke = isDarkMode ? 'rgba(75,85,99,0.24)' : 'rgba(0,0,0,0.08)';
    const focusStroke = isDarkMode ? 'rgba(135,243,243,0.3)' : 'rgba(54,144,206,0.22)';

    return {
      ...baseStyles,
      root: {
        ...baseStyles.root,
        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)',
        border: 'none',
        borderRadius: 0,
        height: '30px',
        boxShadow: `inset 0 0 0 1px ${stroke}`,
        selectors: {
          ...baseStyles.root.selectors,
          ':hover': {
            borderColor: 'transparent',
            boxShadow: `inset 0 0 0 1px ${focusStroke}`,
          },
          ':focus-within': {
            borderColor: 'transparent',
            boxShadow: `inset 0 0 0 1px ${focusStroke}`,
            backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.9)',
          },
        },
      },
      field: {
        ...baseStyles.field,
        borderRadius: 0,
        padding: '0 10px',
        lineHeight: '30px',
        fontSize: '11px',
        selectors: {
          ...(baseStyles.field?.selectors || {}),
          '::placeholder': {
            color: isDarkMode ? 'rgba(209, 213, 219, 0.54)' : 'rgba(55, 65, 81, 0.5)',
            opacity: 1,
            fontSize: '10px',
            letterSpacing: '0.01em',
          },
        },
      },
      icon: {
        ...baseStyles.icon,
        fontSize: '14px',
        marginLeft: '8px',
      },
    };
  }, [isDarkMode]);

  const utilityStroke = isDarkMode ? 'rgba(75,85,99,0.24)' : 'rgba(0,0,0,0.08)';
  const utilityStrokeHover = isDarkMode ? 'rgba(135,243,243,0.28)' : 'rgba(54,144,206,0.22)';
  const utilityBackground = isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.72)';
  const utilityHoverBackground = isDarkMode ? 'rgba(135,243,243,0.07)' : 'rgba(54,144,206,0.05)';
  const utilityColor = isDarkMode ? '#d1d5db' : colours.greyText;

  const actionsContainerStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: 6,
    flex: '0 0 auto',
    alignContent: 'center',
  });

  // Right-side cluster to keep search and refresh together
  const rightClusterStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
    flex: '0 1 auto',
    flexWrap: 'nowrap',
    minWidth: 0,
    transition: 'gap 0.2s ease',
    selectors: {
      '@media (max-width: 800px)': {
        gap: 4,
      },
    }
  });

  const refreshContainerStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    flex: '0 0 auto',
  });

  const mainContentStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: dense ? 6 : 10,
    flexWrap: 'nowrap',
    alignContent: 'center',
    flex: 1,
    minWidth: 0,
    paddingLeft: 8,
    overflow: 'hidden',
    transition: 'gap 0.2s ease, padding 0.2s ease',
    selectors: {
      '@media (max-width: 800px)': {
        gap: 6,
        paddingLeft: 4,
      },
      '@media (max-width: 600px)': {
        gap: 4,
        paddingLeft: 2,
      },
    }
  });

  return (
    <div className={containerStyle}>
      {/* Left Action Section (e.g., back button) */}
      {leftAction && (
        <>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 8,
            paddingRight: 12,
            borderRight: isDarkMode ? `1px solid rgba(55, 65, 81, 0.3)` : '1px solid rgba(0, 0, 0, 0.06)',
            flexShrink: 0,
            justifyContent: 'center',
          }}>
            {leftAction}
          </div>
        </>
      )}

      {/* Main content wrapper */}
      <div className={mainContentStyle}>
        {/* Primary and Secondary Filters */}
        {(primaryFilter || secondaryFilter) && (
          <div className={filtersContainerStyle}>
            {primaryFilter && (
              React.isValidElement(primaryFilter) ? primaryFilter : (
                <SegmentedControl
                  id={`${(primaryFilter as any).ariaLabel.toLowerCase().replace(/\s+/g, '-')}-filter`}
                  ariaLabel={(primaryFilter as any).ariaLabel}
                  value={(primaryFilter as any).value}
                  onChange={(primaryFilter as any).onChange}
                  options={(primaryFilter as any).options}
                />
              )
            )}
            {secondaryFilter && (
              React.isValidElement(secondaryFilter) ? secondaryFilter : (
                <SegmentedControl
                  id={`${(secondaryFilter as any).ariaLabel.toLowerCase().replace(/\s+/g, '-')}-filter`}
                  ariaLabel={(secondaryFilter as any).ariaLabel}
                  value={(secondaryFilter as any).value}
                  onChange={(secondaryFilter as any).onChange}
                  options={(secondaryFilter as any).options}
                />
              )
            )}
            {showSearchInFilters && (
              <div className={searchContainerStyle}>
                {collapsibleSearch && !searchOpen && !resolvedSearchValue ? (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', pointerEvents: 'auto' }}>
                    <button
                      type="button"
                      aria-label="Open search"
                      onClick={() => setSearchOpen(true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 30,
                        height: 30,
                        borderRadius: 0,
                        border: 'none',
                        boxShadow: `inset 0 0 0 1px ${utilityStroke}`,
                        background: utilityBackground,
                        cursor: 'pointer',
                        color: utilityColor,
                        transition: 'background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease'
                      }}
                    >
                      <Icon iconName="Search" style={{ fontSize: 14 }} />
                    </button>
                  </div>
                ) : null}
                <div ref={searchInputRef} style={{ display: collapsibleSearch && !searchOpen && !resolvedSearchValue ? 'none' : 'flex', flex: 1, width: '100%' }}>
                  <SearchBox
                    placeholder={search!.placeholder}
                    value={resolvedSearchValue}
                    onChange={(_, newValue) => {
                      const nextValue = newValue || '';
                      if (search!.debounceMs) {
                        setLocalSearchValue(nextValue);
                        if (searchDebounceRef.current) {
                          clearTimeout(searchDebounceRef.current);
                        }
                        searchDebounceRef.current = setTimeout(() => {
                          search!.onChange(nextValue.trim());
                        }, search!.debounceMs);
                        return;
                      }
                      search!.onChange(nextValue.trim());
                    }}
                    onFocus={() => setSearchOpen(true)}
                    onBlur={() => {
                      if (collapsibleSearch && !resolvedSearchValue) setSearchOpen(false);
                    }}
                    styles={searchBoxStyles}
                    iconProps={{ iconName: 'Search' }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Additional Actions */}
        {children && (
          <div className={actionsContainerStyle}>
            {children}
          </div>
        )}

        {/* Right-side: Search + Middle Actions + Refresh + Right Actions grouped to wrap together */}
        {(showSearchInRightCluster || refresh || middleActions || rightActions) && (
          <div className={rightClusterStyle}>
          {showSearchInRightCluster && (
            <div className={searchContainerStyle}>
              {collapsibleSearch && !searchOpen && !resolvedSearchValue ? (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'flex-end', 
                  width: '100%',
                  pointerEvents: 'auto'
                }}>
                  <button
                    type="button"
                    aria-label="Open search"
                    onClick={() => setSearchOpen(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 30,
                      height: 30,
                      borderRadius: 0,
                      border: 'none',
                      boxShadow: `inset 0 0 0 1px ${utilityStroke}`,
                      background: utilityBackground,
                      cursor: 'pointer',
                      color: utilityColor,
                      transition: 'background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease'
                    }}
                  >
                    <Icon iconName="Search" style={{ fontSize: 14 }} />
                  </button>
                </div>
              ) : null}
              <div ref={searchInputRef} style={{ 
                display: collapsibleSearch && !searchOpen && !resolvedSearchValue ? 'none' : 'flex',
                flex: 1,
                width: '100%'
              }}>
                <SearchBox
                  placeholder={search!.placeholder}
                  value={resolvedSearchValue}
                  onChange={(_, newValue) => {
                    const nextValue = newValue || '';
                    if (search!.debounceMs) {
                      setLocalSearchValue(nextValue);
                      if (searchDebounceRef.current) {
                        clearTimeout(searchDebounceRef.current);
                      }
                      searchDebounceRef.current = setTimeout(() => {
                        search!.onChange(nextValue.trim());
                      }, search!.debounceMs);
                      return;
                    }
                    search!.onChange(nextValue.trim());
                  }}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => {
                    if (collapsibleSearch && !resolvedSearchValue) setSearchOpen(false);
                  }}
                  styles={searchBoxStyles}
                  iconProps={{ iconName: 'Search' }}
                />
              </div>
            </div>
          )}

          {/* Middle actions (between search and refresh) */}
          {middleActions && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flex: '0 0 auto'
            }}>
              {middleActions}
            </div>
          )}

          {/* Right-side actions (before refresh) */}
          {rightActions && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flex: '0 0 auto'
            }}>
              {rightActions}
            </div>
          )}

          {refresh && (
            <div className={refreshContainerStyle}>
              <button
                type="button"
                aria-label="Refresh now"
                onClick={() => { if (!refresh.isLoading) refresh.onRefresh(); }}
                disabled={refresh.isLoading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  height: 30,
                  padding: '0 8px',
                  borderRadius: 0,
                  border: 'none',
                  boxShadow: `inset 0 0 0 1px ${refresh.isLoading ? utilityStrokeHover : utilityStroke}`,
                  background: refresh.isLoading ? utilityHoverBackground : utilityBackground,
                  cursor: refresh.isLoading ? 'not-allowed' : 'pointer',
                  color: utilityColor,
                  fontSize: 10,
                  fontFamily: 'Raleway, sans-serif',
                  fontWeight: 500,
                  transition: 'background 0.15s ease, box-shadow 0.15s ease',
                  position: 'relative',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {/* Background fill that empties as countdown progresses */}
                {!refresh.isLoading && (refresh.progressPercentage ?? 100) > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: `${refresh.progressPercentage ?? 100}%`,
                      background: isDarkMode
                        ? 'rgba(54, 144, 206, 0.10)'
                        : 'rgba(54, 144, 206, 0.08)',
                      transition: 'width 1s linear',
                      pointerEvents: 'none',
                    }}
                  />
                )}

                {refresh.isLoading ? (
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      border: `1.8px solid ${isDarkMode ? colours.subtleGrey : colours.greyText}`,
                      borderRightColor: 'transparent',
                      borderTopColor: 'transparent',
                      animation: 'spin 0.9s linear infinite',
                      boxSizing: 'border-box',
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <Icon
                    iconName="Refresh"
                    style={{
                      fontSize: 13,
                      flexShrink: 0,
                      position: 'relative',
                    }}
                  />
                )}

                {!refresh.isLoading && refresh.countdownLabel && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    opacity: 0.6,
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.04em',
                    fontVariantNumeric: 'tabular-nums',
                    position: 'relative',
                  }}>
                    {refresh.countdownLabel}
                  </span>
                )}
              </button>
            </div>
          )}
          
          </div>
        )}
      </div>
      {refresh?.isLoading && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 1,
            overflow: 'hidden',
            pointerEvents: 'none',
            background: 'transparent',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '34%',
              height: '100%',
              background: isDarkMode
                ? 'linear-gradient(90deg, rgba(54,144,206,0) 0%, rgba(135,243,243,0.85) 45%, rgba(54,144,206,0.18) 100%)'
                : 'linear-gradient(90deg, rgba(54,144,206,0) 0%, rgba(54,144,206,0.75) 45%, rgba(54,144,206,0.14) 100%)',
              animation: 'helixSweep 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
              transform: 'translateX(-120%)',
            }}
          />
        </div>
      )}
    </div>
  );
});

export default FilterBanner;