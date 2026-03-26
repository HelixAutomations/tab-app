/**
 * Reporting Navigation Component
 * 
 * PURPOSE: Consistent navigation breadcrumbs and back controls
 * SCOPE: Top-level navigation for reporting views
 */

import React from 'react';
import { DefaultButton } from '@fluentui/react/lib/Button';
import type { IButtonStyles } from '@fluentui/react/lib/Button';
import { useTheme } from '../../../app/functionality/ThemeContext';

// ============================================================================
// TYPES
// ============================================================================

interface ReportingNavigationProps {
  title: string;
  onBack: () => void;
}

// ============================================================================
// STYLES
// ============================================================================

const getNavigationStyles = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    borderRadius: 999,
    height: 32,
    padding: '0 12px',
    background: isDarkMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(248, 250, 252, 0.95)',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.32)' : 'rgba(13, 47, 96, 0.18)'}`,
    color: isDarkMode ? '#E2E8F0' : '#0d2f60',
    fontWeight: 600,
    fontFamily: 'Raleway, sans-serif',
    boxShadow: 'none',
  },
  rootHovered: {
    background: isDarkMode ? 'rgba(15, 23, 42, 0.78)' : 'rgba(236, 244, 251, 0.96)',
  },
  rootPressed: {
    background: isDarkMode ? 'rgba(15, 23, 42, 0.85)' : 'rgba(222, 235, 249, 0.96)',
  },
  icon: {
    color: isDarkMode ? '#E2E8F0' : '#0d2f60',
  },
  label: {
    fontSize: 12,
  },
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Navigation breadcrumb component for reporting views
 * 
 * FEATURES:
 * - Consistent back navigation
 * - Context-aware title display
 * - Theme-responsive styling
 */
export const ReportingNavigation: React.FC<ReportingNavigationProps> = ({
  title,
  onBack,
}) => {
  const { isDarkMode } = useTheme();

  return (
    <div className="reporting-navigation">
      <DefaultButton
        text="Back to overview"
        iconProps={{ iconName: 'Back' }}
        onClick={onBack}
        styles={getNavigationStyles(isDarkMode)}
      />
      <span className="navigation-title">{title}</span>
    </div>
  );
};