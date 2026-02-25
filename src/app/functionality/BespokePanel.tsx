// src/app/functionality/BespokePanel.tsx
// Clean, smooth panel implementation

import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton, Text } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react';
import { colours } from '../styles/colours';

interface BespokePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: string;
  offsetTop?: number;
  isDarkMode?: boolean;
  variant?: 'side' | 'modal';
  icon?: React.ComponentType<any> | null | undefined;
  zIndex?: number;
}

// Simple, clean overlay (avoid 100vw/100vh to prevent scrollbar width shifts)
const getOverlayStyle = (offsetTop: number, isClosing: boolean, variant: 'side' | 'modal', zIndex: number) =>
  mergeStyles({
    position: 'fixed',
    top: variant === 'side' ? offsetTop : 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: variant === 'modal' ? 'rgba(0, 3, 25, 0.6)' : 'rgba(0, 0, 0, 0.4)',
    backdropFilter: variant === 'modal' ? 'blur(6px)' : undefined,
    WebkitBackdropFilter: variant === 'modal' ? 'blur(6px)' : undefined,
    display: 'flex',
    justifyContent: variant === 'side' ? 'flex-end' : 'center',
    alignItems: variant === 'side' ? 'stretch' : 'center',
    padding: variant === 'modal' ? '20px' : 0,
    zIndex,
    opacity: isClosing ? 0 : 1,
    transition: 'opacity 0.2s ease',
    margin: 0,
    marginTop: '0 !important',
    // Only allow overlay to scroll in modal mode; for side panels, let panel content handle scrolling
    overflowY: variant === 'modal' ? 'auto' : 'hidden',
  });

// Clean panel styling
const getPanelStyle = (width: string, isClosing: boolean, isDarkMode: boolean, variant: 'side' | 'modal') =>
  mergeStyles({
    background: variant === 'modal'
      ? (isDarkMode ? 'rgba(5, 21, 37, 0.96)' : 'rgba(255, 255, 255, 0.98)')
      : (isDarkMode ? colours.dark.background : colours.light.background),
    width: variant === 'side' ? (width || '480px') : (width || 'min(95vw, 1400px)'),
    maxWidth: variant === 'side' ? '90vw' : '95vw',
    height: variant === 'side' ? '100%' : 'auto',
    minHeight: 0,
    maxHeight: variant === 'side' ? 'none' : 'calc(100vh - 40px)',
    boxShadow: isDarkMode
      ? (variant === 'side' ? '-4px 0 16px rgba(0, 0, 0, 0.3)' : '0 10px 30px rgba(0, 0, 0, 0.35)')
      : (variant === 'side' ? '-4px 0 16px rgba(0, 0, 0, 0.15)' : '0 10px 30px rgba(2, 6, 23, 0.10)'),
    borderRadius: variant === 'side' ? 0 : 2,
    display: 'flex',
    flexDirection: 'column',
    transform: variant === 'side'
      ? (isClosing ? 'translateX(100%)' : 'translateX(0)')
      : (isClosing ? 'scale(0.98) translateY(-6px)' : 'scale(1) translateY(0)'),
    transition: variant === 'side' ? 'transform 0.25s ease-out' : 'transform 0.18s ease-out',
    overflow: 'hidden',
    margin: variant === 'modal' ? 'auto' : undefined,
    border: variant === 'modal'
      ? (isDarkMode ? `1px solid ${colours.dark.border}` : `1px solid ${colours.grey}`)
      : undefined,
    backdropFilter: variant === 'modal' ? 'blur(10px)' : undefined,
    WebkitBackdropFilter: variant === 'modal' ? 'blur(10px)' : undefined,
  });

// Simple header - updated with modern gradient matching app style
const getHeaderStyle = (isDarkMode: boolean, variant: 'side' | 'modal') =>
  mergeStyles({
    padding: '16px 20px',
    background: variant === 'modal'
      ? (isDarkMode 
          ? colours.darkBlue
          : '#ffffff')
      : (isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground),
    borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.grey}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
    backdropFilter: variant === 'modal' ? 'blur(10px)' : undefined,
    WebkitBackdropFilter: variant === 'modal' ? 'blur(10px)' : undefined,
  });

// Clean content area
const getContentStyle = () =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    overflowY: 'auto',
    // Critical for nested flex layouts: allow this container to shrink so inner scroll works
    minHeight: 0,
    flexGrow: 1,
  });

const BespokePanel: React.FC<BespokePanelProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  description,
  children, 
  width, 
  offsetTop = 0,
  isDarkMode = false,
  variant = 'side',
  icon: IconComponent,
  zIndex = 2000
}) => {
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Simple scroll prevention without layout shift
      document.body.style.overflow = 'hidden';
      // Stabilize layout when scrollbar disappears
      const htmlEl = document.documentElement;
      const prevGutter = htmlEl.style.scrollbarGutter;
      htmlEl.style.scrollbarGutter = 'stable';
      setIsVisible(true);
    } else if (isVisible && !isOpen) {
      handleClose();
    }
  }, [isOpen, isVisible]);

  // Ensure we render at document.body level to avoid parent overflow/position contexts
  useEffect(() => {
    // Guard for non-browser environments
    if (typeof document === 'undefined') return;
    const container = document.createElement('div');
    container.setAttribute('data-bespoke-panel-portal', '');
    // Keep neutral styles; overlay inside handles positioning
    document.body.appendChild(container);
    setPortalContainer(container);
    return () => {
      try {
        document.body.removeChild(container);
      } catch (_) {
        // ignore if already removed
      }
    };
  }, []);

  const handleClose = () => {
    if (isClosing) return;
    
    setIsClosing(true);
    setTimeout(() => {
      // Simply restore scroll
      document.body.style.overflow = '';
      const htmlEl = document.documentElement;
      htmlEl.style.scrollbarGutter = '';
      
      setIsClosing(false);
      setIsVisible(false);
      onClose();
    }, 250);
  };

  // Handle escape key
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isVisible && !isClosing) {
        handleClose();
      }
    };
    
    if (isVisible) {
      document.addEventListener('keydown', handleEsc);
    }
    
    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isVisible, isClosing]);

  if (!isVisible) return null;

  const overlayNode = (
    <div
      className={getOverlayStyle(offsetTop, isClosing, variant, zIndex)}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={getPanelStyle(width || '480px', isClosing, isDarkMode, variant)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={getHeaderStyle(isDarkMode, variant)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {IconComponent && typeof IconComponent === 'function' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <IconComponent
                  style={{
                    fontSize: description ? 36 : 24,
                    color: isDarkMode ? colours.accent : colours.highlight,
                    opacity: 0.75,
                  }}
                />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <Text
                styles={{
                  root: {
                    fontSize: '16px',
                    fontWeight: 700,
                    color: isDarkMode ? '#f3f4f6' : colours.darkBlue,
                    marginBottom: description ? '4px' : '0',
                    letterSpacing: '-0.02em',
                    display: 'block',
                  },
                }}
              >
                {title}
              </Text>
              {description && (
                <Text
                  styles={{
                    root: {
                      fontSize: '12px',
                      fontWeight: 400,
                      color: isDarkMode ? 'rgba(243, 244, 246, 0.75)' : 'rgba(6, 23, 51, 0.65)',
                      lineHeight: '1.4',
                      display: 'block',
                    },
                  }}
                >
                  {description}
                </Text>
              )}
            </div>
          </div>
          <IconButton
            iconProps={{ iconName: 'Cancel' }}
            ariaLabel="Close Panel"
            onClick={handleClose}
            styles={{
              root: {
                color: isDarkMode ? colours.dark.text : colours.light.text,
                ':hover': {
                  backgroundColor: isDarkMode
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(0, 0, 0, 0.05)',
                },
              },
            }}
          />
        </div>
        <div className={getContentStyle()}>{children}</div>
      </div>
    </div>
  );

  // Use portal when available; fall back to inline render to avoid blank state race conditions
  return portalContainer ? createPortal(overlayNode, portalContainer) : overlayNode;
};

export default BespokePanel;
