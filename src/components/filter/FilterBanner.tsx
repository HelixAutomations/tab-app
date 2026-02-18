import React from 'react';
import { SearchBox, Icon } from '@fluentui/react';
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
  
  // Refresh functionality
  refresh?: {
    onRefresh: () => void;
    isLoading?: boolean;
    nextUpdateTime?: string;
    collapsible?: boolean;
    progressPercentage?: number; // 0-100% remaining time
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
  collapsibleSearch = false
}) => {
  const { isDarkMode } = useTheme();
  const [localSearchValue, setLocalSearchValue] = React.useState<string>(search?.value ?? '');
  const searchDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedSearchValue = search?.debounceMs ? localSearchValue : (search?.value ?? '');
  const [searchOpen, setSearchOpen] = React.useState<boolean>(!collapsibleSearch || !!resolvedSearchValue);
  const [refreshOpen, setRefreshOpen] = React.useState<boolean>(!refresh?.collapsible);
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
    padding: seamless
      ? (dense ? '4px 8px' : '8px 12px')
      : (dense ? '4px 8px' : '12px 20px'),
    background: seamless ? 'transparent' : (isDarkMode 
      ? colours.darkBlue
      : colours.grey),
    borderBottom: seamless ? 'none' : (isDarkMode 
      ? `1px solid ${colours.dark.border}66`
      : '1px solid rgba(0, 0, 0, 0.06)'),
    boxShadow: seamless ? 'none' : (isDarkMode
      ? 'none'
      : '0 2px 8px rgba(0, 0, 0, 0.08)'),
    fontFamily: 'Raleway, sans-serif',
    minHeight: 48,
    height: 'auto',
    ...(sticky && {
      position: 'sticky',
      top: topOffset,
      zIndex: 2000,
    }),
    transition: '0.2s',
    width: '100%',
    boxSizing: 'border-box',
    selectors: {
      '@media (max-width: 400px)': {
        padding: '10px 16px',
        gap: 8,
        rowGap: 8,
        flexDirection: 'column',
        alignItems: 'stretch',
      }
    }
  }, className);

  const filtersContainerStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    rowGap: 6,
    flex: '0 0 auto',
  // Keep items centered within their row; when wrapping, center the row group
  alignContent: 'center',
    selectors: {
      '@media (max-width: 400px)': {
        width: '100%',
        justifyContent: 'space-between',
      }
    }
  });

  // Dynamic width based on search state - collapsed search takes minimal space
  const isSearchCollapsed = collapsibleSearch && !searchOpen && !resolvedSearchValue;
  
  const searchContainerStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: '0 0 auto',
    minWidth: isSearchCollapsed ? 'auto' : 240,
    width: isSearchCollapsed ? 'auto' : 240,
    transition: 'none',
    selectors: {
      '@media (max-width: 700px)': {
        marginLeft: 0,
        flex: '1 0 auto',
        minWidth: 'auto',
        width: 'auto',
        justifyContent: 'flex-start',
      },
      '@media (max-width: 400px)': {
        width: '100%',
        flex: '1 1 100%',
      }
    }
  });

  const actionsContainerStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    rowGap: 6,
    flex: '0 0 auto',
  alignContent: 'center',
    selectors: {
      '@media (max-width: 400px)': {
        width: '100%',
        justifyContent: 'center',
      }
    }
  });

  // Right-side cluster to keep search and refresh together on wrap
  const rightClusterStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
    flex: '0 1 auto',
    flexWrap: 'nowrap',
    selectors: {
      '@media (max-width: 700px)': {
        marginLeft: 0,
        width: '100%',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      },
      '@media (max-width: 400px)': {
        gap: 8,
      }
    }
  });

  const refreshContainerStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    flex: '0 0 auto',
    selectors: {
      '@media (max-width: 700px)': {
        marginLeft: 0,
      }
    }
  });

  const mainContentStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: dense ? 6 : 12,
    rowGap: dense ? 6 : 8,
    flexWrap: 'wrap',
    alignContent: 'center',
    flex: 1,
    minWidth: 0,
    paddingLeft: 12,
    selectors: {
      '@media (max-width: 400px)': {
        gap: 8,
        rowGap: 8,
        width: '100%',
        paddingLeft: 0,
      }
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
          </div>
        )}

        {/* Additional Actions */}
        {children && (
          <div className={actionsContainerStyle}>
            {children}
          </div>
        )}

        {/* Right-side: Search + Middle Actions + Refresh + Right Actions grouped to wrap together */}
        {(search || refresh || middleActions || rightActions) && (
          <div className={rightClusterStyle}>
          {search && (
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
                      width: 28,
                      height: 28,
                      borderRadius: 0,
                      border: isDarkMode ? `1px solid ${colours.dark.border}` : '1px solid rgba(0,0,0,0.12)',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: isDarkMode ? colours.dark.text : colours.darkBlue
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
                  placeholder={search.placeholder}
                  value={resolvedSearchValue}
                  onChange={(_, newValue) => {
                    const nextValue = newValue || '';
                    if (search.debounceMs) {
                      setLocalSearchValue(nextValue);
                      if (searchDebounceRef.current) {
                        clearTimeout(searchDebounceRef.current);
                      }
                      searchDebounceRef.current = setTimeout(() => {
                        search.onChange(nextValue);
                      }, search.debounceMs);
                      return;
                    }
                    search.onChange(nextValue);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => {
                    if (collapsibleSearch && !resolvedSearchValue) setSearchOpen(false);
                  }}
                  styles={sharedSearchBoxStyle(isDarkMode)}
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

          {refresh && (
            <div className={refreshContainerStyle}>
              <button
                type="button"
                aria-label={refreshOpen ? "Hide refresh details" : "Show refresh details"}
                onClick={() => setRefreshOpen(!refreshOpen)}
                disabled={refresh.isLoading}
                onMouseEnter={() => !refresh.isLoading && setRefreshOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: refreshOpen ? 6 : 0,
                  height: 28,
                  padding: refreshOpen ? '0 10px 0 8px' : '0',
                  width: refreshOpen ? 90 : 28, // Fixed widths to prevent layout shift
                  minWidth: refreshOpen ? 90 : 28,
                  borderRadius: 0,
                  border: isDarkMode ? `1px solid ${colours.dark.border}` : '1px solid rgba(0,0,0,0.12)',
                  background: 'transparent',
                  cursor: refresh.isLoading ? 'not-allowed' : 'pointer',
                  color: isDarkMode ? colours.subtleGrey : colours.greyText,
                  fontSize: 10,
                  fontFamily: 'Raleway, sans-serif',
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseLeave={() => {
                  if (refresh.collapsible) {
                    setTimeout(() => setRefreshOpen(false), 300);
                  }
                }}
              >
                {/* Countdown progress indicator */}
                {refresh.nextUpdateTime && !refresh.isLoading && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.2)',
                      borderRadius: 0,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        height: '100%',
                        width: `${refresh.progressPercentage || 100}%`,
                        background: isDarkMode 
                          ? 'linear-gradient(90deg, rgba(54, 144, 206, 0.6) 0%, rgba(54, 144, 206, 0.4) 100%)'
                          : 'linear-gradient(90deg, rgba(54, 144, 206, 0.7) 0%, rgba(54, 144, 206, 0.5) 100%)',
                        borderRadius: 0,
                        opacity: refreshOpen ? 0.8 : 0.6,
                        transition: 'width 1s linear, opacity 0.2s',
                      }}
                    />
                  </div>
                )}
                
                <Icon
                  iconName={refresh.isLoading ? "Sync" : "Clock"}
                  style={{ 
                    fontSize: 12,
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                    animation: refresh.isLoading ? 'spin 1s linear infinite' : 'none',
                    transition: 'transform 0.2s',
                    transform: refreshOpen ? 'scale(1)' : 'scale(1.1)',
                  }}
                />
                
                {refreshOpen && refresh.nextUpdateTime && !refresh.isLoading && (
                  <>
                    <span style={{
                      fontSize: 10,
                      opacity: 0.8,
                      whiteSpace: 'nowrap',
                      animation: 'fadeIn 0.15s ease',
                      minWidth: 28, // Fixed width to prevent layout shift (handles "4:59" to "0:01")
                      textAlign: 'center',
                    }}>
                      {refresh.nextUpdateTime}
                    </span>
                    <span
                      role="button"
                      aria-label="Refresh now"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!refresh.isLoading) refresh.onRefresh();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!refresh.isLoading) refresh.onRefresh();
                        }
                      }}
                      title="Refresh now"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: 0,
                        marginLeft: 2,
                        border: 'none',
                        background: 'transparent',
                        cursor: refresh.isLoading ? 'not-allowed' : 'pointer',
                        color: 'inherit',
                        outline: 'none'
                      }}
                    >
                      <Icon
                        iconName="Refresh"
                        style={{ 
                          fontSize: 11,
                          opacity: 0.7,
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                      />
                    </span>
                  </>
                )}
                
                {refreshOpen && refresh.isLoading && (
                  <span style={{
                    fontSize: 10,
                    opacity: 0.7,
                    animation: 'fadeIn 0.15s ease',
                  }}>
                    Updating…
                  </span>
                )}
              </button>
            </div>
          )}
          
          {/* Right-side actions */}
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
          </div>
        )}
      </div>
    </div>
  );
});

export default FilterBanner;