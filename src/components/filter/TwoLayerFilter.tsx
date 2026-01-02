import React, { useRef, useLayoutEffect, useState, useCallback } from 'react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { SegmentedOption } from './SegmentedControl';

export interface TwoLayerFilterOption {
  key: string;
  label: string;
  subOptions: SegmentedOption[];
}

interface TwoLayerFilterProps {
  primaryValue: string;
  secondaryValue: string;
  onPrimaryChange: (key: string) => void;
  onSecondaryChange: (key: string) => void;
  options: TwoLayerFilterOption[];
  ariaLabel?: string;
  id?: string;
  style?: React.CSSProperties;
  hideSecondaryInProduction?: boolean;
}

/**
 * Two-layer filter component with primary options on the left and secondary options on the right.
 * The secondary options change based on the selected primary option.
 */
const TwoLayerFilter: React.FC<TwoLayerFilterProps> = ({
  primaryValue,
  secondaryValue,
  onPrimaryChange,
  onSecondaryChange,
  options,
  ariaLabel,
  id,
  style,
  hideSecondaryInProduction = false
}) => {
  const { isDarkMode } = useTheme();
  const height = 32; // align with FilterBanner standard height
  const fontSize = 12;
  const paddingX = 14;

  // Production detection
  const isProduction = typeof window !== 'undefined' && 
    window.location.hostname !== 'localhost' && 
    window.location.hostname !== '127.0.0.1';
  
  // Hide secondary filter in production if requested
  const shouldHideSecondary = hideSecondaryInProduction && isProduction;

  const primaryContainerRef = useRef<HTMLDivElement | null>(null);
  const secondaryContainerRef = useRef<HTMLDivElement | null>(null);
  const secondaryWrapperRef = useRef<HTMLDivElement | null>(null);
  const primaryBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const secondaryBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [isSecondaryExpanded, setIsSecondaryExpanded] = useState(false);
  
  const [primaryThumbRect, setPrimaryThumbRect] = useState<{ left: number; width: number }>({ left: 2, width: 0 });
  const [secondaryThumbRect, setSecondaryThumbRect] = useState<{ left: number; width: number }>({ left: 2, width: 0 });

  const primaryActiveIndex = options.findIndex(o => o.key === primaryValue);
  const currentOption = options.find(o => o.key === primaryValue);
  const secondaryActiveIndex = currentOption ? currentOption.subOptions.findIndex(o => o.key === secondaryValue) : -1;

  const recalcPrimary = () => {
    const container = primaryContainerRef.current;
    const activeBtn = primaryBtnRefs.current[primaryActiveIndex];
    if (container && activeBtn) {
      const c = container.getBoundingClientRect();
      const b = activeBtn.getBoundingClientRect();
      // Snap to integers and keep 4px top/bottom margin like SegmentedControl
      setPrimaryThumbRect({ left: Math.round(b.left - c.left), width: Math.round(b.width) });
    }
  };

  const recalcSecondary = () => {
    const container = secondaryContainerRef.current;
    const activeBtn = secondaryBtnRefs.current[secondaryActiveIndex];
    if (container && activeBtn) {
      const c = container.getBoundingClientRect();
      const b = activeBtn.getBoundingClientRect();
      setSecondaryThumbRect({ left: Math.round(b.left - c.left), width: Math.round(b.width) });
    }
  };

  useLayoutEffect(() => { recalcPrimary(); }, [primaryActiveIndex, options, primaryValue]);
  useLayoutEffect(() => { recalcSecondary(); }, [secondaryActiveIndex, currentOption, secondaryValue]);
  
  useLayoutEffect(() => {
    const handleResize = () => {
      recalcPrimary();
      recalcSecondary();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keep active secondary chip visible on state changes
  useLayoutEffect(() => {
    const activeBtn = secondaryBtnRefs.current[secondaryActiveIndex];
    const wrapper = secondaryWrapperRef.current;
    if (activeBtn && wrapper) {
      // When expanding, ensure the active is scrolled into view nicely
      activeBtn.scrollIntoView({ behavior: 'instant' as ScrollBehavior, inline: 'center', block: 'nearest' });
    }
  }, [isSecondaryExpanded, secondaryActiveIndex]);

  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    // Allow the filter to size to its content so sibling controls can sit alongside
    width: 'auto',
    maxWidth: '100%',
    flex: '0 1 auto',
    ...style,
  } as React.CSSProperties;

  const segmentStyle = {
    display: 'flex',
    position: 'relative' as const,
    background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    borderRadius: height / 2,
    padding: 4,
    height, // visual height; thumb will be height-8
    fontFamily: 'Raleway, sans-serif',
    userSelect: 'none' as const,
    overflow: 'hidden' as const,
  };

  // Keyboard navigation for accessibility
  const onPrimaryKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex(o => o.key === primaryValue);
    if (idx < 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = Math.min(options.length - 1, idx + 1);
      if (next !== idx) onPrimaryChange(options[next].key);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = Math.max(0, idx - 1);
      if (prev !== idx) onPrimaryChange(options[prev].key);
    }
  }, [options, primaryValue, onPrimaryChange]);

  const onSecondaryKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!currentOption) return;
    const idx = currentOption.subOptions.findIndex(o => o.key === secondaryValue);
    if (idx < 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      for (let i = idx + 1; i < currentOption.subOptions.length; i++) {
        if (!currentOption.subOptions[i].disabled) {
          onSecondaryChange(currentOption.subOptions[i].key);
          break;
        }
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      for (let i = idx - 1; i >= 0; i--) {
        if (!currentOption.subOptions[i].disabled) {
          onSecondaryChange(currentOption.subOptions[i].key);
          break;
        }
      }
    }
  }, [currentOption, secondaryValue, onSecondaryChange]);

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      style={containerStyle}
    >
      {/* Primary Filter */}
      <div
        role="tablist"
        aria-label="Primary filter"
        style={segmentStyle}
        ref={primaryContainerRef}
        tabIndex={0}
        onKeyDown={onPrimaryKeyDown}
      >
        {primaryActiveIndex >= 0 && (
          <span
            aria-hidden="true"
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              top: 4,
              height: Math.max(0, height - 8),
              left: primaryThumbRect.left,
              width: primaryThumbRect.width,
              background: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)',
              borderRadius: (height - 8) / 2,
              transition: 'left 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94), width 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              boxShadow: isDarkMode
                ? '0 1px 2px rgba(0,0,0,0.2)'
                : '0 1px 2px rgba(0,0,0,0.06)',
            }}
          />
        )}
        {options.map((opt, idx) => {
          const isActive = opt.key === primaryValue;
          return (
            <button
              key={opt.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => onPrimaryChange(opt.key)}
              style={{
                position: 'relative',
                zIndex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: `0 ${paddingX}px`,
                fontSize,
                fontWeight: 500,
                color: isActive ? (isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937') : (isDarkMode ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.55)'),
                transition: 'color 200ms ease',
                minWidth: 0,
                whiteSpace: 'nowrap'
              }}
              ref={el => { primaryBtnRefs.current[idx] = el; }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Secondary Filter - collapsed by default, expands on hover/focus */}
      {!shouldHideSecondary && currentOption && currentOption.subOptions.length > 0 && (
        <div
          ref={secondaryWrapperRef}
          onMouseEnter={() => setIsSecondaryExpanded(true)}
          onMouseLeave={() => setIsSecondaryExpanded(false)}
          onFocus={() => setIsSecondaryExpanded(true)}
          onBlur={() => {
            // Defer check to allow focus to move within children
            setTimeout(() => {
              const el = secondaryWrapperRef.current;
              if (el && !el.contains(document.activeElement)) {
                setIsSecondaryExpanded(false);
              }
            }, 0);
          }}
          aria-label="Secondary filter container"
          style={{
            overflow: 'hidden',
            width: isSecondaryExpanded ? 'auto' : 'fit-content',
            transition: 'width 320ms cubic-bezier(.4,.2,.2,1)',
          }}
        >
          <div
            role="tablist"
            aria-label="Secondary filter"
            style={segmentStyle}
            ref={secondaryContainerRef}
            tabIndex={0}
            onKeyDown={onSecondaryKeyDown}
          >
            {/* Show only active option when collapsed */}
            {isSecondaryExpanded ? (
              <>
                {secondaryActiveIndex >= 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      pointerEvents: 'none',
                      position: 'absolute',
                      top: 4,
                      height: Math.max(0, height - 8),
                      left: secondaryThumbRect.left,
                      width: secondaryThumbRect.width,
                      background: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)',
                      borderRadius: (height - 8) / 2,
                      transition: 'left 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94), width 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                      boxShadow: isDarkMode
                        ? '0 1px 2px rgba(0,0,0,0.2)'
                        : '0 1px 2px rgba(0,0,0,0.06)',
                    }}
                  />
                )}
                {currentOption.subOptions.map((subOpt, idx) => {
                  const isActive = subOpt.key === secondaryValue;
                  return (
                    <button
                      key={subOpt.key}
                      role="tab"
                      aria-selected={isActive}
                      disabled={subOpt.disabled}
                      onClick={() => !subOpt.disabled && onSecondaryChange(subOpt.key)}
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        background: 'transparent',
                        border: 'none',
                        cursor: subOpt.disabled ? 'not-allowed' : 'pointer',
                        padding: `0 ${paddingX}px`,
                        fontSize,
                        fontWeight: 500,
                        color: isActive ? (isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937') : (isDarkMode ? 'rgba(255,255,255,0.70)' : 'rgba(0,0,0,0.55)'),
                        transition: `color 160ms, opacity 240ms ease-out ${idx * 40}ms, transform 240ms ease-out ${idx * 40}ms`,
                        minWidth: 0,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        opacity: isSecondaryExpanded ? 1 : 0,
                        transform: isSecondaryExpanded ? 'translateX(0) scale(1)' : 'translateX(-8px) scale(0.95)',
                      }}
                      ref={el => { secondaryBtnRefs.current[idx] = el; }}
                    >
                      <span>{subOpt.label}</span>
                      {typeof subOpt.badge !== 'undefined' && (
                        <span style={{
                          background: isActive
                            ? (isDarkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.08)')
                            : (isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)'),
                          color: isActive
                            ? (isDarkMode ? '#1f2937' : '#1f2937')
                            : (isDarkMode ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.65)'),
                          borderRadius: 8,
                          padding: '2px 6px',
                          fontSize: fontSize - 2,
                          fontWeight: 600,
                          lineHeight: 1.2,
                        }}>{subOpt.badge}</span>
                      )}
                    </button>
                  );
                })}
              </>
            ) : (
              // Collapsed state - show only active option
              <>
                <span
                  aria-hidden="true"
                  style={{
                    pointerEvents: 'none',
                    position: 'absolute',
                    top: 4,
                    height: Math.max(0, height - 8),
                    left: 4,
                    right: 4,
                    background: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)',
                    borderRadius: height / 2 - 4,
                    boxShadow: isDarkMode
                      ? '0 1px 2px rgba(0,0,0,0.2)'
                      : '0 1px 2px rgba(0,0,0,0.06)',
                  }}
                />
                {(() => {
                  const activeSubOpt = currentOption.subOptions[secondaryActiveIndex];
                  if (!activeSubOpt) return null;
                  return (
                    <button
                      key={activeSubOpt.key}
                      role="tab"
                      aria-selected={true}
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: `0 ${paddingX}px`,
                        fontSize,
                        fontWeight: 500,
                        color: isDarkMode ? 'rgba(255,255,255,0.95)' : '#1f2937',
                        minWidth: 0,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span>{activeSubOpt.label}</span>
                      {typeof activeSubOpt.badge !== 'undefined' && (
                        <span style={{
                          background: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                          color: isDarkMode ? 'rgba(255,255,255,0.9)' : '#1f2937',
                          borderRadius: 8,
                          padding: '2px 6px',
                          fontSize: fontSize - 2,
                          fontWeight: 600,
                          lineHeight: 1.2,
                        }}>{activeSubOpt.badge}</span>
                      )}
                    </button>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TwoLayerFilter;
