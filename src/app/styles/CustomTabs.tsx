// src/app/styles/CustomTabs.tsx

import React from 'react';
import { Pivot, PivotItem, IPivotStyles } from '@fluentui/react';
import { AiOutlineHome, AiFillHome } from 'react-icons/ai';
import {
  FaInbox,
  FaClipboardList,
  FaFolderOpen,
  FaWpforms,
  FaBookOpen,
  FaChartLine,
  FaHeadset,
} from 'react-icons/fa';
import { colours } from './colours';
import './CustomTabs.css';
import { useTheme } from '../../app/functionality/ThemeContext';
import { Tab } from '../functionality/types';
import { UserData } from '../../app/functionality/types';
import UserBubble from '../../components/UserBubble';
import AnimatedPulsingDot from '../../components/AnimatedPulsingDot';

interface CustomTabsProps {
  selectedKey: string;
  onLinkClick: (
    item?: PivotItem,
    ev?: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>
  ) => void;
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
}

const customPivotStyles = (_isDarkMode: boolean): Partial<IPivotStyles> => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    height: 48,
  },
  link: {
    fontSize: 16,
    fontWeight: 600,
    color: '#ffffff',
    padding: '0 12px',
    lineHeight: 48,
    position: 'relative',
    transition: 'color 0.2s',
    selectors: {
      ':hover': {
        color: colours.highlight,
      },
    },
  },
  linkIsSelected: {
    color: colours.highlight,
  },
});

const CustomTabs: React.FC<CustomTabsProps> = ({
  selectedKey,
  onLinkClick,
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
}) => {
  const { isDarkMode } = useTheme();
  const pivotWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [iconOnly, setIconOnly] = React.useState<boolean>(false);
  const lastFullWidthRef = React.useRef<number>(0);
  const BUFFER = 24; // px hysteresis to avoid flicker

  React.useEffect(() => {
    const measure = () => {
      const el = pivotWrapRef.current;
      if (!el) return;
      const scrollW = el.scrollWidth;
      const clientW = el.clientWidth;

      if (!iconOnly) {
        // Record the last known full content width (labels visible)
        lastFullWidthRef.current = Math.max(lastFullWidthRef.current, scrollW);
        if (scrollW > clientW + 1) {
          setIconOnly(true);
        }
      } else {
        // Only exit icon-only when container is comfortably wider than last needed full width
        const target = Math.max(lastFullWidthRef.current - BUFFER, 0);
        if (clientW >= target) {
          setIconOnly(false);
        }
      }
    };

    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && pivotWrapRef.current) {
      ro = new ResizeObserver(() => measure());
      ro.observe(pivotWrapRef.current);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
    };
  }, [tabs.length, selectedKey]); // REMOVED iconOnly from dependencies to prevent infinite loop

  // Keep selection consistent when Home is active
  const pivotSelectedKey = selectedKey;

  const handleClick = (
    item?: PivotItem,
    ev?: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>
  ) => {
    const clickedTab = tabs.find((t) => t.key === item?.props.itemKey);
    if (clickedTab?.disabled) {
      if (clickedTab.key === 'forms' && onFormsClick) onFormsClick();
      else if (clickedTab.key === 'resources' && onResourcesClick) onResourcesClick();
      ev?.preventDefault();
      return;
    }
    onLinkClick(item, ev);
  };

  const getTabIcon = (key: string) => {
    switch (key) {
      case 'enquiries':
        return <FaInbox size={18} />; // intake
      case 'instructions':
        return <FaClipboardList size={18} />; // triage/detail
      case 'matters':
        return <FaFolderOpen size={18} />; // execution
      case 'forms':
        return <FaWpforms size={18} />; // similar to resources but distinct
      case 'resources':
        return <FaBookOpen size={18} />; // knowledge base
      case 'reporting':
        return <FaChartLine size={18} />; // admin/analytics
      case 'callhub':
        return <FaHeadset size={18} />; // admin/local dev
      default:
        return <FaClipboardList size={18} />;
    }
  };

  return (
    <div
      className={`customTabsContainer ${iconOnly ? 'iconOnlyTabs' : ''}`}
      style={{
        backgroundColor: colours.darkBlue,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        height: 48,
        borderBottom: `1px solid ${colours.darkBlue}`,
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        transition: 'background-color 0.3s',
      }}
    >
      <div
        className={`home-icon icon-hover ${selectedKey === 'home' ? 'active' : ''}`}
        onClick={onHomeClick}
        role="button"
        tabIndex={0}
        aria-label="Home"
        style={{ color: '#ffffff', marginRight: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}
      >
        <div style={{ position: 'relative' }}>
          <AiOutlineHome className="icon-outline" size={20} />
          <AiFillHome className="icon-filled" size={20} />
        </div>
        {hasImmediateActions && (
          <div style={{ flexShrink: 0, width: 8, height: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div
              style={{
                width: '6px',
                height: '6px',
                backgroundColor: '#D65541',
                borderRadius: '50%',
                animation: 'pulse-red 2s infinite'
              }}
            />
          </div>
        )}
      </div>
      {/* Vertical separator */}
      <div
        style={{
          width: '1px',
          height: '24px',
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          marginRight: '12px',
          flexShrink: 0,
        }}
      />
      <div ref={pivotWrapRef} style={{ flexGrow: 1, minWidth: 0 }}>
        <Pivot
          style={{ width: '100%' }}
        selectedKey={pivotSelectedKey}
        onLinkClick={handleClick}
        aria-label={ariaLabel || 'Custom Tabs'}
        styles={customPivotStyles(isDarkMode)}
        className="customPivot"
        >
        {/* Hidden item to occupy selection when Home is active */}
        <PivotItem itemKey="home" headerText="Home" headerButtonProps={{ style: { display: 'none' } }} />
        {tabs.map((tab, index) => (
          <PivotItem
            itemKey={tab.key}
            key={tab.key}
            headerText={tab.text}
            onRenderItemLink={() => {
              const icon = (
                <span className="tab-icon" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {getTabIcon(tab.key)}
                </span>
              );
              const label = (
                <span className="tab-label" style={{ marginLeft: 8 }}>{tab.text}</span>
              );
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 20 }}>
                  {icon}
                  {!iconOnly && label}
                  {tab.key === 'instructions' && hasActiveMatter && selectedKey !== 'instructions' && (
                    <div style={{ flexShrink: 0, width: 8, height: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <AnimatedPulsingDot show size={6} animationDuration={400} />
                    </div>
                  )}
                </div>
              );
            }}
            headerButtonProps={{
              className: tab.disabled ? 'disabledTab' : '',
              style: { '--animation-delay': `${index * 0.1}s` } as React.CSSProperties,
              'aria-disabled': tab.disabled ? 'true' : undefined,
              title: tab.text,
            }}
          />
        ))}
        </Pivot>
      </div>
      {(isLocalDev || user) && (
        <UserBubble
          user={
            user || {
              First: 'Local',
              Last: 'Dev',
              Initials: 'LD',
              AOW: 'Commercial, Construction, Property, Employment, Misc/Other',
              Email: 'local@dev.com',
            }
          }
          isLocalDev={isLocalDev}
          onAreasChange={onAreaChange}
          availableUsers={teamData || undefined}
          onUserChange={onUserChange}
          onReturnToAdmin={onReturnToAdmin}
          originalAdminUser={originalAdminUser}
        />
      )}
    </div>
  );
};

export default CustomTabs;
