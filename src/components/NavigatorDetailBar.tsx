/**
 * NavigatorDetailBar — shared detail-view navigator bar.
 *
 * Renders: Back button · separator · sub-tab buttons
 * Uses `enquiry-sub-tab` CSS class for tab underlines, ensuring they
 * sit flush at the bottom edge of the 48px bar everywhere.
 *
 * Scroll-linked collapse: the bar eases upward with transform/opacity
 * as the user scrolls `.app-scroll-region` down. Fully hidden after 48px
 * of scroll. The slot height is reclaimed progressively so no ghost bar remains.
 *
 * Usage:
 *   <NavigatorDetailBar
 *     onBack={() => goBack()}
 *     backLabel="Back"
 *     tabs={[
 *       { key: 'overview', label: 'Overview' },
 *       { key: 'pitch', label: 'Pitch Builder' },
 *     ]}
 *     activeTab="overview"
 *     onTabChange={(key) => setActiveTab(key)}
 *   />
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { ActionButton } from '@fluentui/react';
import type { IButtonStyles } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';

/** Height of the bar in px — single source of truth for collapse math */
const BAR_HEIGHT = 48;
/** Scroll distance (px) over which the bar fully collapses */
const COLLAPSE_DISTANCE = BAR_HEIGHT;

export interface NavigatorTab {
  key: string;
  label: string;
  disabled?: boolean;
  disabledMessage?: string;
  /** Visually muted "draft" state — clickable but de-emphasised */
  draft?: boolean;
}

export interface NavigatorDetailBarProps {
  /** Called when the back button is clicked */
  onBack: () => void;
  /** Label for back button (default: "Back") */
  backLabel?: string;
  /** Sub-tabs to render after the separator */
  tabs?: NavigatorTab[];
  /** Currently active tab key */
  activeTab?: string;
  /** Called when a tab is clicked */
  onTabChange?: (key: string) => void;
  /** Static label to show instead of tabs (e.g. utility views) */
  staticLabel?: string;
  /** Extra content to render at the end (right side) */
  rightContent?: React.ReactNode;
}

/** Shared back-button IButtonStyles — correct dark/light hover composition */
const getBackButtonStyles = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    height: 32,
    padding: '0 10px 0 6px',
    color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
    gap: 6,
    background: 'transparent',
    border: 'none',
  },
  rootHovered: {
    color: isDarkMode ? colours.dark.text : colours.darkBlue,
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(54, 144, 206, 0.06)',
  },
  rootPressed: {
    color: isDarkMode ? colours.dark.text : colours.darkBlue,
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.10)' : 'rgba(54, 144, 206, 0.10)',
  },
  icon: {
    fontSize: 16,
    color: isDarkMode ? colours.dark.text : '#3690ce',
  },
  label: {
    fontSize: 13,
    userSelect: 'none',
  },
});

const NavigatorDetailBar: React.FC<NavigatorDetailBarProps> = ({
  onBack,
  backLabel = 'Back',
  tabs,
  activeTab,
  onTabChange,
  staticLabel,
  rightContent,
}) => {
  const { isDarkMode } = useTheme();
  const slotRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  /**
   * Scroll-linked collapse — directly mutates DOM for 60fps.
   * Maps scrollTop [0 → COLLAPSE_DISTANCE] to progress [0 → 1].
   * The slot height is reclaimed progressively while the inner bar translates
   * upward and fades out, avoiding both jumpy reflow and a leftover blank strip.
   */
  const applyScrollProgress = useCallback((scrollTop: number) => {
    const slot = slotRef.current;
    const wrapper = wrapperRef.current;
    if (!slot || !wrapper) return;
    const progress = Math.min(Math.max(scrollTop / COLLAPSE_DISTANCE, 0), 1);
    slot.style.height = `${BAR_HEIGHT * (1 - progress)}px`;
    wrapper.style.transform = `translateY(${-progress * BAR_HEIGHT}px)`;
    wrapper.style.opacity = `${1 - progress}`;
    wrapper.style.pointerEvents = progress >= 1 ? 'none' : '';
    wrapper.style.filter = `blur(${progress * 0.4}px)`;
  }, []);

  useEffect(() => {
    const scrollRegion = document.querySelector('.app-scroll-region');
    if (!scrollRegion) return;

    const onScroll = () => {
      // Batch with rAF to avoid layout thrashing
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        applyScrollProgress(scrollRegion.scrollTop);
      });
    };

    scrollRegion.addEventListener('scroll', onScroll, { passive: true });
    // Apply initial state immediately
    applyScrollProgress(scrollRegion.scrollTop);

    return () => {
      scrollRegion.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [applyScrollProgress]);

  return (
    <div
      ref={slotRef}
      style={{
        height: BAR_HEIGHT,
        overflow: 'hidden',
        position: 'relative',
        willChange: 'height',
      }}
    >
      <div
        ref={wrapperRef}
        style={{
          backgroundColor: isDarkMode ? colours.darkBlue : colours.grey,
          borderBottom: isDarkMode
            ? `1px solid ${colours.dark.border}66`
            : '1px solid rgba(0, 0, 0, 0.06)',
          boxShadow: 'none',
          padding: '0 24px',
          display: 'flex',
          flexDirection: 'row',
          gap: 0,
          alignItems: 'stretch',
          height: BAR_HEIGHT,
          willChange: 'transform, opacity, filter',
          transform: 'translateY(0px)',
          transformOrigin: 'top center',
          transition: 'box-shadow 140ms ease',
        }}
      >
      {/* Back button — vertically centred */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <ActionButton
          iconProps={{ iconName: 'ChevronLeft' }}
          onClick={onBack}
          title={backLabel}
          aria-label={backLabel}
          styles={getBackButtonStyles(isDarkMode)}
        >
          {backLabel}
        </ActionButton>
      </div>

      {/* Separator */}
      <div
        style={{
          width: 1,
          alignSelf: 'center',
          height: 24,
          backgroundColor: isDarkMode
            ? 'rgba(255, 255, 255, 0.15)'
            : 'rgba(0, 0, 0, 0.06)',
          flexShrink: 0,
          margin: '0 8px',
        }}
      />

      {/* Tabs or static label */}
      {tabs && tabs.length > 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            alignSelf: 'stretch',
            flex: 1,
            minWidth: 0,
          }}
        >
          {tabs.map((tab, idx) => {
            // Insert a thin separator before the first draft tab
            const prevTab = idx > 0 ? tabs[idx - 1] : null;
            const showDraftSep = tab.draft && (!prevTab || !prevTab.draft);
            return (
              <React.Fragment key={tab.key}>
                {showDraftSep && (
                  <div style={{
                    width: 1,
                    alignSelf: 'center',
                    height: 18,
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
                    flexShrink: 0,
                    margin: '0 6px',
                  }} />
                )}
                <button
                  type="button"
                  onClick={() => !tab.disabled && onTabChange?.(tab.key)}
                  title={tab.disabled ? tab.disabledMessage : tab.draft ? `${tab.label} (draft)` : tab.label}
                  aria-label={tab.label}
                  aria-disabled={tab.disabled}
                  className="enquiry-sub-tab"
                  data-active={activeTab === tab.key}
                  data-draft={tab.draft || undefined}
                  style={
                    tab.disabled
                      ? { opacity: 0.4, cursor: 'not-allowed' }
                      : tab.draft
                        ? { opacity: 0.45, fontStyle: 'italic' }
                        : undefined
                  }
                >
                  {tab.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      ) : staticLabel ? (
        <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'Raleway, sans-serif',
              color: isDarkMode ? colours.dark.text : colours.missedBlue,
            }}
          >
            {staticLabel}
          </span>
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}

      {/* Optional right content */}
      {rightContent && (
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {rightContent}
        </div>
      )}
      </div>
    </div>
  );
};

export default NavigatorDetailBar;
