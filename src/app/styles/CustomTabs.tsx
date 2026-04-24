// src/app/styles/CustomTabs.tsx

import React from 'react';
import {
  FiHome,
  FiInbox,
  FiClipboard,
  FiFolder,
  FiFileText,
  FiBookOpen,
  FiBarChart2,
} from 'react-icons/fi';
import { colours } from './colours';
import './CustomTabs.css';
import { useTheme } from '../../app/functionality/ThemeContext';
import { Tab } from '../functionality/types';
import { UserData } from '../../app/functionality/types';
import UserBubble from '../../components/UserBubble';
import AnimatedPulsingDot from '../../components/AnimatedPulsingDot';
import ReleaseNotesModal from '../../components/ReleaseNotesModal';
import { canSeePrivateHubControls, isAdminUser } from '../../app/admin';

interface CustomTabsProps {
  selectedKey: string;
  onTabSelect: (key: string) => void;
  onTabWarm?: (key: string) => void;
  tabs: Tab[];
  ariaLabel?: string;
  onHomeClick: () => void;
  user?: UserData;
  onFormsClick?: () => void;
  onResourcesClick?: () => void;
  hasActiveMatter?: boolean;
  isInMatterOpeningWorkflow?: boolean;
  isLocalDev?: boolean;
  onAreaChange?: (areas: string[]) => void;
  teamData?: UserData[] | null;
  onUserChange?: (user: UserData) => void;
  onReturnToAdmin?: () => void;
  originalAdminUser?: UserData | null;
  hasImmediateActions?: boolean;
  onRefreshEnquiries?: () => Promise<void> | void;
  onRefreshMatters?: () => Promise<void> | void;
  featureToggles?: Record<string, boolean>;
  onShowTestEnquiry?: () => void;
  demoModeEnabled?: boolean;
  onToggleDemoMode?: (enabled: boolean) => void;
}

/**
 * CustomTabs — main app navigation bar.
 * Follows the Helix design system: brand tokens, borderRadius: 0,
 * accent for dark-mode active, blue for light-mode active.
 */
const CustomTabs: React.FC<CustomTabsProps> = ({
  selectedKey,
  onTabSelect,
  onTabWarm,
  tabs,
  ariaLabel,
  onHomeClick,
  user,
  onFormsClick,
  onResourcesClick,
  hasActiveMatter = false,
  isInMatterOpeningWorkflow = false,
  isLocalDev = false,
  onAreaChange,
  teamData,
  onUserChange,
  onReturnToAdmin,
  originalAdminUser,
  hasImmediateActions = false,
  onRefreshEnquiries,
  onRefreshMatters,
  featureToggles = {},
  onShowTestEnquiry,
  demoModeEnabled,
  onToggleDemoMode,
}) => {
  const { isDarkMode } = useTheme();
  const [showReleaseNotesModal, setShowReleaseNotesModal] = React.useState(false);
  const canSeeReleaseNotes = Boolean(isLocalDev) || isAdminUser(user || null);
  const canSeePrivateControls = Boolean(isLocalDev) || canSeePrivateHubControls(user || null);
  const bubbleUser = user || {
    First: 'Local',
    Last: 'Dev',
    Initials: 'LD',
    AOW: 'Commercial, Construction, Property, Employment, Misc/Other',
    Email: 'local@dev.com',
  };

  // ── Responsive icon-only collapse ───────────────────────────
  const tabsWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [iconOnly, setIconOnly] = React.useState<boolean>(false);
  const lastFullWidthRef = React.useRef<number>(0);
  const BUFFER = 24;

  React.useEffect(() => {
    const measure = () => {
      const el = tabsWrapRef.current;
      if (!el) return;
      const scrollW = el.scrollWidth;
      const clientW = el.clientWidth;

      if (!iconOnly) {
        lastFullWidthRef.current = Math.max(lastFullWidthRef.current, scrollW);
        if (scrollW > clientW + 1) setIconOnly(true);
      } else {
        const target = Math.max(lastFullWidthRef.current - BUFFER, 0);
        if (clientW >= target) setIconOnly(false);
      }
    };

    measure();
    window.addEventListener('resize', measure);
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && tabsWrapRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(tabsWrapRef.current);
    }
    return () => {
      window.removeEventListener('resize', measure);
      if (ro) ro.disconnect();
    };
  }, [tabs.length, selectedKey]); // iconOnly intentionally excluded — prevents infinite loop

  // ── Derived tokens ──────────────────────────────────────────
  const textResting = isDarkMode ? 'rgba(160, 160, 160, 0.55)' : 'rgba(107, 107, 107, 0.6)';
  const textHover = isDarkMode ? colours.dark.text : colours.darkBlue;
  const activeColour = isDarkMode ? colours.accent : colours.blue;
  // Active-tab text — brighter than hover so the selected tab has more
  // weight than a hovered inactive one (Apple pattern: commitment > hint).
  const activeTextColour = isDarkMode ? '#f3f4f6' : colours.darkBlue;
  const homeColour = selectedKey === 'home'
    ? activeTextColour
    : textResting;

  const handleTabClick = (tab: Tab) => {
    if (tab.disabled) {
      if (tab.key === 'forms' && onFormsClick) onFormsClick();
      else if (tab.key === 'resources' && onResourcesClick) onResourcesClick();
      return;
    }
    onTabSelect(tab.key);
  };

  const getTabIcon = (key: string) => {
    // Feather (thin stroke) — matches CallsAndNotes, OperationsDashboard and
    // the rest of the modern Helix surfaces. Previously FontAwesome (chunky
    // filled) + Ant Design Home — three icon families in one bar read as
    // dated next to the new chrome.
    switch (key) {
      case 'enquiries':    return <FiInbox size={15} strokeWidth={1.8} />;
      case 'instructions': return <FiClipboard size={15} strokeWidth={1.8} />;
      case 'matters':      return <FiFolder size={15} strokeWidth={1.8} />;
      case 'forms':        return <FiFileText size={15} strokeWidth={1.8} />;
      case 'resources':    return <FiBookOpen size={15} strokeWidth={1.8} />;
      case 'reporting':    return <FiBarChart2 size={15} strokeWidth={1.8} />;
      default:             return <FiClipboard size={15} strokeWidth={1.8} />;
    }
  };

  const hasFormsTab = tabs.some(tab => tab.key === 'forms');
  const hasReportingTab = tabs.some(tab => tab.key === 'reporting');

  return (
    <div
      className={`customTabsContainer${iconOnly ? ' tabs-icon-only' : ''}`}
      role="navigation"
      aria-label={ariaLabel || 'Main Navigation'}
      style={{
        background: 'var(--surface-nav)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 20px',
        height: 48,
        borderBottom: '0.5px solid var(--nav-border)',
        boxShadow: 'var(--nav-shadow)',
        position: 'sticky',
        top: 0,
        zIndex: 2000,
        transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* ── Home button ──────────────────────────────────────── */}
      <button
        className={`home-icon ${selectedKey === 'home' ? 'active' : ''}`}
        onClick={onHomeClick}
        aria-label="Home"
        aria-current={selectedKey === 'home' ? 'page' : undefined}
        style={{
          color: homeColour,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          '--home-resting-bg': 'transparent',
          '--home-hover-bg': isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
          border: 'none',
          borderRadius: 2,
          cursor: 'pointer',
          padding: 0,
          width: 36,
          height: 36,
          minWidth: 36,
          position: 'relative',
          flexShrink: 0,
        } as React.CSSProperties}
      >
        <div style={{
          position: 'relative',
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {/* Single Feather stroke icon — active state is carried by colour
              (homeColour) + background fill; a separate filled glyph was
              mixing icon families unnecessarily. */}
          <FiHome size={18} strokeWidth={1.8} />
        </div>

        {/* CTA notification dot */}
        <div
          style={{
            width: 6,
            height: 6,
            backgroundColor: colours.cta,
            borderRadius: 999,
            animation: 'pulse-red 2s infinite',
            position: 'absolute',
            top: 7,
            right: 7,
            opacity: hasImmediateActions && selectedKey !== 'home' ? 1 : 0,
            transform: hasImmediateActions && selectedKey !== 'home' ? 'scale(1)' : 'scale(0)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
          }}
        />
      </button>

      <span
        className="tab-separator"
        aria-hidden="true"
        style={{
          width: 1,
          height: 20,
          background: isDarkMode ? 'rgba(135, 243, 243, 0.22)' : 'rgba(54, 144, 206, 0.22)',
          marginRight: 10,
          flexShrink: 0,
        }}
      />

      {/* ── Tab strip ────────────────────────────────────────── */}
      <div
        ref={tabsWrapRef}
        role="tablist"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexGrow: 1,
          minWidth: 0,
          gap: 2,
          overflow: 'hidden',
        }}
      >
        {tabs.map((tab, index) => {
          const active = selectedKey === tab.key;
          const showSeparatorAfter =
            (tab.key === 'matters' && hasFormsTab) ||
            (tab.key === 'resources' && hasReportingTab);

          return (
            <React.Fragment key={tab.key}>
              <button
                role="tab"
                aria-selected={active}
                onClick={() => handleTabClick(tab)}
                onMouseEnter={() => onTabWarm?.(tab.key)}
                onFocus={() => onTabWarm?.(tab.key)}
                onPointerDown={() => onTabWarm?.(tab.key)}
                onTouchStart={() => onTabWarm?.(tab.key)}
                title={tab.text}
                className={`custom-tab-btn${active ? ' custom-tab-active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '0 16px',
                  height: 48,
                  border: 'none',
                  position: 'relative' as const,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  fontFamily: 'inherit',
                  letterSpacing: '0.01em',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  animationDelay: `${index * 0.06}s`,
                  // CSS custom properties for theme-aware colours
                  '--tab-underline-colour': activeColour,
                  '--tab-text-color': active ? activeTextColour : textResting,
                  '--tab-text-hover': active ? activeTextColour : textHover,
                  '--tab-hover-fill': isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.06)',
                  '--tab-active-fill': 'transparent',
                } as React.CSSProperties}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                  {getTabIcon(tab.key)}
                </span>
                <span className="tab-label">{tab.text}</span>
                {tab.key === 'instructions' && hasActiveMatter && selectedKey !== 'instructions' && (
                  <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <AnimatedPulsingDot show size={6} animationDuration={400} />
                  </span>
                )}
              </button>

              {showSeparatorAfter && (
                <span
                  className="tab-section-separator"
                  aria-hidden="true"
                  style={{
                    width: 1,
                    height: 18,
                    background: isDarkMode ? 'rgba(135, 243, 243, 0.18)' : 'rgba(54, 144, 206, 0.18)',
                    margin: '0 6px',
                    flexShrink: 0,
                    alignSelf: 'center',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── User Bubble ──────────────────────────────────────── */}
      {(isLocalDev || user) && (
        <UserBubble
          user={bubbleUser}
          onAreasChange={onAreaChange}
          availableUsers={teamData || undefined}
          onUserChange={onUserChange}
          onReturnToAdmin={onReturnToAdmin}
          originalAdminUser={originalAdminUser}
          featureToggles={featureToggles}
          demoModeEnabled={demoModeEnabled}
        />
      )}

      {canSeeReleaseNotes && (
        <ReleaseNotesModal
          isOpen={showReleaseNotesModal}
          onClose={() => setShowReleaseNotesModal(false)}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
};

export default CustomTabs;
