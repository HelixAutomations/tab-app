import { useState, useEffect } from 'react';

export interface ResponsiveLayout {
  width: number;
  height: number;
  isCompact: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  optimalSpacing: number;
  recommendedColumns: number;
  recommendedCardWidth: number;
  containerSize: 'tiny' | 'small' | 'medium' | 'large' | 'xlarge';
  breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function useResponsiveLayout(): ResponsiveLayout {
  const [layout, setLayout] = useState<ResponsiveLayout>(() => {
    if (typeof window === 'undefined') {
      return {
        width: 1024,
        height: 768,
        isCompact: false,
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isTouch: false,
        optimalSpacing: 16,
        recommendedColumns: 3,
        recommendedCardWidth: 320,
        containerSize: 'large',
        breakpoint: 'lg'
      };
    }

    return calculateLayout(window.innerWidth, window.innerHeight);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function handleResize() {
      setLayout(calculateLayout(window.innerWidth, window.innerHeight));
    }

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial calculation

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return layout;
}

function calculateLayout(width: number, height: number): ResponsiveLayout {
  const isCompact = width < 768;
  const isMobile = width < 480;
  const isTablet = width >= 480 && width < 1024;
  const isDesktop = width >= 1024;
  
  const isTouch = typeof window !== 'undefined' && 
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  let containerSize: ResponsiveLayout['containerSize'];
  if (width < 400) containerSize = 'tiny';
  else if (width < 768) containerSize = 'small';
  else if (width < 1024) containerSize = 'medium';
  else if (width < 1440) containerSize = 'large';
  else containerSize = 'xlarge';

  let breakpoint: ResponsiveLayout['breakpoint'];
  if (width < 480) breakpoint = 'xs';
  else if (width < 768) breakpoint = 'sm';
  else if (width < 1024) breakpoint = 'md';
  else if (width < 1440) breakpoint = 'lg';
  else breakpoint = 'xl';

  const recommendedColumns = width < 400 ? 1 : width < 600 ? 1 : width < 900 ? 2 : width < 1200 ? 3 : 4;
  const optimalSpacing = width < 400 ? 8 : width < 768 ? 12 : width < 1024 ? 16 : 20;
  const recommendedCardWidth = Math.max(280, Math.min(400, (width - (optimalSpacing * (recommendedColumns + 1))) / recommendedColumns));

  return {
    width,
    height,
    isCompact,
    isMobile,
    isTablet,
    isDesktop,
    isTouch,
    optimalSpacing,
    recommendedColumns,
    recommendedCardWidth,
    containerSize,
    breakpoint
  };
}

export function createResponsiveStyles(layout: ResponsiveLayout) {
  return {
    container: {
      width: '100%',
      maxWidth: layout.isCompact ? '100%' : '1200px',
      margin: '0 auto',
      padding: `0 ${layout.optimalSpacing}px`
    },
    
    grid: {
      display: 'grid',
      gridTemplateColumns: layout.isMobile 
        ? '1fr' 
        : `repeat(auto-fit, minmax(${layout.recommendedCardWidth}px, 1fr))`,
      gap: `${layout.optimalSpacing}px`,
      width: '100%'
    },
    
    card: {
      padding: layout.isCompact ? '12px' : '16px',
      borderRadius: layout.isCompact ? '6px' : '8px',
      minHeight: layout.isTouch ? '48px' : '40px'
    },
    
    button: {
      padding: layout.isCompact ? '8px 12px' : '12px 16px',
      fontSize: layout.isCompact ? '14px' : '16px',
      minHeight: layout.isTouch ? '48px' : '40px',
      borderRadius: layout.isCompact ? '6px' : '8px'
    }
  };
}