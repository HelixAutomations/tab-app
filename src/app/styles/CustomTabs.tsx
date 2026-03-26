// src/app/styles/CustomTabs.tsx

import React from 'react';
import { AiOutlineHome, AiFillHome } from 'react-icons/ai';
import {
  FaInbox,
  FaClipboardList,
  FaFolderOpen,
  FaWpforms,
  FaBookOpen,
  FaChartLine,
} from 'react-icons/fa';
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
  onFeatureToggle?: (feature: string, enabled: boolean) => void;
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
  onFeatureToggle,
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
  const activeTextColour = isDarkMode ? '#d1d5db' : colours.darkBlue;
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
    switch (key) {
      case 'enquiries':    return <FaInbox size={15} />;
      case 'instructions': return <FaClipboardList size={15} />;
      case 'matters':      return <FaFolderOpen size={15} />;
      case 'forms':        return <FaWpforms size={15} />;
      case 'resources':    return <FaBookOpen size={15} />;
      case 'reporting':    return <FaChartLine size={15} />;
      default:             return <FaClipboardList size={15} />;
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
        background: isDarkMode ? 'rgba(0, 3, 25, 0.88)' : 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(20px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 20px',
        height: 48,
        borderBottom: `0.5px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`,
        boxShadow: isDarkMode ? '0 1px 0 rgba(255, 255, 255, 0.03)' : '0 1px 3px rgba(0, 0, 0, 0.04)',
        position: 'sticky',
        top: 0,
        zIndex: 2000,
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
          <AiOutlineHome className="icon-outline" size={20} />
          <AiFillHome className="icon-filled" size={20} />
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
        title="Home separator"
        style={{
          color: isDarkMode ? 'rgba(135, 243, 243, 0.45)' : 'rgba(54, 144, 206, 0.4)',
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1,
          marginRight: 10,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        |
      </span>

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
                  fontWeight: 500,
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
                  '--tab-hover-fill': isDarkMode ? 'rgba(135, 243, 243, 0.06)' : 'rgba(54, 144, 206, 0.04)',
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
                    color: isDarkMode ? 'rgba(135, 243, 243, 0.40)' : 'rgba(54, 144, 206, 0.35)',
                    fontSize: 16,
                    fontWeight: 600,
                    lineHeight: 1,
                    margin: '0 4px',
                    userSelect: 'none',
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 48,
                  }}
                >
                  |
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── User Bubble ──────────────────────────────────────── */}
      {(isLocalDev || user) && (
        <UserBubble
          user={bubbleUser}
          isLocalDev={isLocalDev}
          onAreasChange={onAreaChange}
          availableUsers={teamData || undefined}
          onUserChange={onUserChange}
          onReturnToAdmin={onReturnToAdmin}
          originalAdminUser={originalAdminUser}
          onRefreshEnquiries={onRefreshEnquiries}
          onRefreshMatters={onRefreshMatters}
          onFeatureToggle={onFeatureToggle}
          featureToggles={featureToggles}
          onShowTestEnquiry={onShowTestEnquiry}
          demoModeEnabled={demoModeEnabled}
          onToggleDemoMode={onToggleDemoMode}
          onOpenReleaseNotesModal={canSeeReleaseNotes ? () => setShowReleaseNotesModal(true) : undefined}
          hideOpsSections={canSeePrivateControls}
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
