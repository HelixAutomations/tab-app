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
  onRefreshEnquiries?: () => Promise<void> | void;
  onRefreshMatters?: () => Promise<void> | void;
}

const customPivotStyles = (isDarkMode: boolean): Partial<IPivotStyles> => ({
  root: {
    display: 'flex',
    alignItems: 'center',
    height: 48,
  },
  link: {
    fontSize: 14,
    fontWeight: 600,
    color: isDarkMode ? 'rgba(255, 255, 255, 0.65)' : 'rgba(6, 23, 51, 0.75)',
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
  onRefreshEnquiries,
  onRefreshMatters,
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
        return <FaInbox size={16} />; // intake
      case 'instructions':
        return <FaClipboardList size={16} />; // triage/detail
      case 'matters':
        return <FaFolderOpen size={16} />; // execution
      case 'forms':
        return <FaWpforms size={16} />; // similar to resources but distinct
      case 'resources':
        return <FaBookOpen size={16} />; // knowledge base
      case 'reporting':
        return <FaChartLine size={16} />; // admin/analytics
      default:
        return <FaClipboardList size={16} />;
    }
  };

  return (
    <div
      className={`customTabsContainer ${iconOnly ? 'iconOnlyTabs' : ''}`}
      style={{
        background: isDarkMode
          ? 'linear-gradient(135deg, rgba(7, 16, 32, 1) 0%, rgba(11, 30, 55, 1) 100%)'
          : '#FFFFFF',
        backdropFilter: isDarkMode ? 'blur(16px) saturate(180%)' : 'none',
        WebkitBackdropFilter: isDarkMode ? 'blur(16px) saturate(180%)' : 'none',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        height: 48,
        borderBottom: isDarkMode 
          ? '1px solid rgba(125, 211, 252, 0.15)' 
          : '1px solid rgba(0, 0, 0, 0.06)',
        boxShadow: isDarkMode
          ? '0 2px 12px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.3)'
          : '0 2px 8px rgba(0, 0, 0, 0.08)',
        position: 'sticky',
        top: 0,
        zIndex: 2000, // Keep tab bar above downstream sticky navigator content
        transition: 'all 0.2s ease',
      }}
    >
      <div
        className={`home-icon icon-hover ${selectedKey === 'home' ? 'active' : ''}`}
        onClick={onHomeClick}
        role="button"
        tabIndex={0}
        aria-label="Home"
        style={{ 
          color: selectedKey === 'home' ? colours.highlight : (isDarkMode ? '#ffffff' : '#061733'), 
          marginRight: '16px', 
          display: 'flex', 
          alignItems: 'center',
          width: '38px',
          justifyContent: 'flex-start'
        }}
      >
        <div style={{ 
          position: 'relative', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          width: '20px', 
          height: '20px',
          transition: 'transform 0.3s ease'
        }}>
          <AiOutlineHome className="icon-outline" size={20} />
          <AiFillHome className="icon-filled" size={20} />
        </div>
        <div
          style={{
            width: '6px',
            height: '6px',
            backgroundColor: '#D65541',
            borderRadius: '50%',
            animation: 'pulse-red 2s infinite',
            marginLeft: '12px',
            flexShrink: 0,
            opacity: hasImmediateActions && selectedKey !== 'home' ? 1 : 0,
            transform: hasImmediateActions && selectedKey !== 'home' ? 'scale(1)' : 'scale(0)',
            transition: 'opacity 0.3s ease, transform 0.3s ease'
          }}
        />
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
        overflowBehavior="none"
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
          onRefreshEnquiries={onRefreshEnquiries}
          onRefreshMatters={onRefreshMatters}
        />
      )}
    </div>
  );
};

export default CustomTabs;
