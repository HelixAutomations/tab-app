import React, { ReactNode, useEffect, useState } from 'react';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

interface SmartMatterLayoutProps {
  children: ReactNode;
}

export const SmartMatterLayout: React.FC<SmartMatterLayoutProps> = ({ children }) => {
  const layout = useResponsiveLayout();
  const [compactMode, setCompactMode] = useState(false);

  useEffect(() => {
    // Auto-enable compact mode for small screens
    setCompactMode(layout.isCompact);
    
    // Add responsive classes to document
    document.documentElement.setAttribute('data-layout-size', layout.containerSize);
    document.documentElement.setAttribute('data-is-compact', layout.isCompact.toString());
    document.documentElement.setAttribute('data-is-mobile', layout.isMobile.toString());
    document.documentElement.setAttribute('data-is-tablet', layout.isTablet.toString());
    document.documentElement.setAttribute('data-is-touch', layout.isTouch.toString());

    return () => {
      // Cleanup
      document.documentElement.removeAttribute('data-layout-size');
      document.documentElement.removeAttribute('data-is-compact');
      document.documentElement.removeAttribute('data-is-mobile');
      document.documentElement.removeAttribute('data-is-tablet');
      document.documentElement.removeAttribute('data-is-touch');
    };
  }, [layout]);

  // Inject global responsive styles
  useEffect(() => {
    const styleId = 'smart-matter-responsive-styles';
    let existingStyle = document.getElementById(styleId);
    
    if (!existingStyle) {
      existingStyle = document.createElement('style');
      existingStyle.id = styleId;
      document.head.appendChild(existingStyle);
    }

    existingStyle.textContent = `
      /* Smart Matter Opening Responsive Styles */
      
      /* Automatic layout adjustments based on data attributes */
      html[data-is-compact="true"] .matter-opening-card {
        padding: 8px !important;
        margin: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
      }
      
      html[data-is-compact="true"] .workflow-header {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 4px !important;
        padding: 8px 12px !important;
      }
      
      html[data-is-compact="true"] .progressive-dots {
        transform: scale(0.8) !important;
        margin: 4px 0 !important;
      }
      
      html[data-is-compact="true"] .breadcrumb-text {
        font-size: 11px !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
      
      /* Step container responsiveness */
      html[data-is-compact="true"] .carousel-step {
        width: 100% !important;
        padding: 8px !important;
        min-height: auto !important;
      }
      
      html[data-layout-size="medium"] .carousel-step {
        width: 50% !important;
        padding: 12px !important;
      }
      
      /* Button responsiveness */
      html[data-is-touch="true"] button {
        min-height: 44px !important;
        padding: 12px 16px !important;
      }
      
      html[data-is-compact="true"] button {
        font-size: 13px !important;
        padding: 8px 12px !important;
      }
      
      /* Form field responsiveness */
      html[data-is-compact="true"] .ms-TextField-fieldGroup {
        min-height: 36px !important;
      }
      
      html[data-is-touch="true"] .ms-TextField-fieldGroup {
        min-height: 44px !important;
      }
      
      /* Grid responsiveness */
      html[data-is-compact="true"] .client-selection-grid {
        grid-template-columns: 1fr !important;
        gap: 8px !important;
      }
      
      html[data-layout-size="small"] .client-selection-grid {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)) !important;
        gap: 12px !important;
      }
      
      html[data-layout-size="medium"] .client-selection-grid {
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)) !important;
        gap: 16px !important;
      }
      
      /* Typography scaling */
      html[data-is-compact="true"] .section-title {
        font-size: 16px !important;
        margin-bottom: 8px !important;
      }
      
      html[data-is-compact="true"] .section-subtitle {
        font-size: 12px !important;
        margin-bottom: 8px !important;
      }
      
      /* Card responsiveness */
      html[data-is-compact="true"] .poid-card {
        padding: 8px !important;
        border-radius: 4px !important;
      }
      
      /* Spacing adjustments */
      html[data-is-compact="true"] .space-y-responsive > * + * {
        margin-top: 8px !important;
      }
      
      html[data-layout-size="large"] .space-y-responsive > * + * {
        margin-top: 20px !important;
      }
      
      /* Hide/show elements based on screen size */
      html[data-is-compact="true"] .hide-on-compact {
        display: none !important;
      }
      
      html[data-is-compact="false"] .show-on-compact {
        display: none !important;
      }
      
      /* Carousel responsiveness */
      html[data-is-compact="true"] .carousel-container {
        flex-direction: column !important;
        height: auto !important;
      }
      
      html[data-is-compact="true"] .carousel-step {
        transform: none !important;
        position: relative !important;
        width: 100% !important;
      }
      
      /* Overflow handling */
      html[data-is-compact="true"] .overflow-scroll {
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
      }
      
      /* Focus improvements for accessibility */
      html[data-is-touch="true"] *:focus {
        outline: 2px solid #3690CE !important;
        outline-offset: 2px !important;
      }
      
      /* Animation performance */
      @media (prefers-reduced-motion: reduce) {
        html * {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
      
      /* Print styles */
      @media print {
        html .matter-opening-card {
          box-shadow: none !important;
          border: 1px solid #000 !important;
          margin: 0 !important;
          padding: 20px !important;
        }
        
        html .workflow-header,
        html .progressive-dots,
        html button {
          display: none !important;
        }
      }
    `;

    return () => {
      // Clean up styles when component unmounts
      const style = document.getElementById(styleId);
      if (style) {
        style.remove();
      }
    };
  }, [layout]);

  return (
    <div 
      className="smart-matter-container"
      data-compact-mode={compactMode}
      data-breakpoint={layout.breakpoint}
      style={{
        '--optimal-spacing': `${layout.optimalSpacing}px`,
        '--recommended-columns': layout.recommendedColumns,
        '--card-width': `${layout.recommendedCardWidth}px`
      } as React.CSSProperties}
    >
      {children}
      
      {/* Floating responsive indicator (development only) */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          position: 'fixed',
          bottom: 10,
          right: 10,
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '4px 8px',
          borderRadius: 4,
          fontSize: 11,
          fontFamily: 'monospace',
          zIndex: 9999,
          pointerEvents: 'none'
        }}>
          {layout.breakpoint} | {layout.width}x{layout.height} | {layout.containerSize}
          {layout.isTouch && ' | touch'}
        </div>
      )}
    </div>
  );
};