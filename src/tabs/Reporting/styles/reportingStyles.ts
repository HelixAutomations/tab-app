/**
 * Shared reporting style helpers.
 *
 * Centralises the button/control styling functions that were duplicated across
 * ManagementDashboard, EnquiriesReport, and MetaMetricsReport.
 * New reports should import from here instead of copying.
 */

import type { CSSProperties } from 'react';
import type { IButtonStyles, IDatePickerStyles } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';

// ─── Container / surface helpers ───────────────────────────────────────────

export function reportContainerStyle(isDark: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: 'transparent',
    padding: 0,
    minHeight: '100%',
    fontFamily: 'Raleway, sans-serif',
  };
}

export function surface(isDark: boolean, overrides: CSSProperties = {}): CSSProperties {
  return {
    background: isDark ? colours.darkBlue : '#ffffff',
    borderRadius: 0,
    border: `0.5px solid ${isDark ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
    boxShadow: isDark ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.04)',
    padding: '12px 16px',
    ...overrides,
  };
}

// ─── Date picker ───────────────────────────────────────────────────────────

export function getDatePickerStyles(isDarkMode: boolean): Partial<IDatePickerStyles> {
  const baseBorder = isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.12)';
  const hoverBorder = isDarkMode ? 'rgba(135, 243, 243, 0.2)' : 'rgba(54, 144, 206, 0.3)';
  const focusBorder = isDarkMode ? colours.accent : colours.highlight;
  const backgroundColour = isDarkMode ? colours.websiteBlue : 'rgba(255, 255, 255, 0.95)';
  const hoverBackground = isDarkMode ? colours.dark.cardBackground : colours.grey;
  const focusBackground = isDarkMode ? colours.websiteBlue : '#ffffff';

  return {
    root: {
      maxWidth: 180,
      '.ms-DatePicker': { fontFamily: 'Raleway, sans-serif !important' },
    },
    textField: {
      root: { fontFamily: 'Raleway, sans-serif !important', width: '100% !important' },
      fieldGroup: {
        height: '32px !important',
        borderRadius: '0 !important',
        border: `0.5px solid ${baseBorder} !important`,
        background: `${backgroundColour} !important`,
        padding: '0 14px !important',
        boxShadow: 'none !important',
        transition: 'all 0.2s ease !important',
        selectors: {
          ':hover': {
            border: `0.5px solid ${hoverBorder} !important`,
            background: `${hoverBackground} !important`,
            boxShadow: 'none !important',
          },
          ':focus-within': {
            border: `0.5px solid ${focusBorder} !important`,
            background: `${focusBackground} !important`,
            boxShadow: isDarkMode
              ? '0 0 0 2px rgba(135, 243, 243, 0.08) !important'
              : '0 0 0 2px rgba(54, 144, 206, 0.08) !important',
          },
        },
      },
      field: {
        fontSize: '12px !important',
        color: `${isDarkMode ? colours.dark.text : colours.light.text} !important`,
        fontFamily: 'Raleway, sans-serif !important',
        fontWeight: '500 !important',
        background: 'transparent !important',
        lineHeight: '18px !important',
        border: 'none !important',
        outline: 'none !important',
      },
    },
    icon: {
      color: `${isDarkMode ? colours.highlight : colours.missedBlue} !important`,
      fontSize: '16px !important',
      fontWeight: 'bold !important',
    },
    callout: {
      fontSize: '14px !important',
      borderRadius: '0 !important',
      border: `0.5px solid ${baseBorder} !important`,
      boxShadow: isDarkMode
        ? '0 8px 24px rgba(0, 0, 0, 0.35) !important'
        : '0 6px 20px rgba(6, 23, 51, 0.12) !important',
    },
    wrapper: { borderRadius: '0 !important' },
  };
}

// ─── Range preset buttons ──────────────────────────────────────────────────

export function getRangeButtonStyles(
  isDarkMode: boolean,
  active: boolean,
  disabled: boolean = false,
): IButtonStyles {
  const inactiveColor = isDarkMode ? colours.dark.text : colours.missedBlue;
  const disabledColor = isDarkMode ? colours.subtleGrey : colours.greyText;
  const activeTextColor = isDarkMode ? colours.highlight : colours.helixBlue;

  const resolvedBackground = disabled
    ? (isDarkMode ? colours.websiteBlue : 'transparent')
    : active
      ? (isDarkMode ? `${colours.blue}18` : `${colours.blue}12`)
      : (isDarkMode ? colours.websiteBlue : 'transparent');

  const resolvedBorder = disabled
    ? `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}40` : 'rgba(6, 23, 51, 0.12)'}`
    : active
      ? `1px solid ${isDarkMode ? `${colours.blue}33` : `${colours.blue}25`}`
      : `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}40` : 'rgba(6, 23, 51, 0.12)'}`;

  return {
    root: {
      display: 'inline-flex',
      alignItems: 'center',
      whiteSpace: 'nowrap' as const,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      borderRadius: 0,
      border: resolvedBorder,
      padding: '0 10px',
      minHeight: 32,
      height: 32,
      fontWeight: active ? 700 : 600,
      fontSize: 12,
      color: disabled ? disabledColor : active ? activeTextColor : inactiveColor,
      background: resolvedBackground,
      boxShadow: 'none',
      fontFamily: 'Raleway, sans-serif',
      cursor: disabled ? 'default' : 'pointer',
      transition:
        'background 0.18s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.18s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.18s cubic-bezier(0.4, 0, 0.2, 1), color 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
    },
    rootHovered: {
      background: disabled
        ? resolvedBackground
        : active
          ? (isDarkMode ? `${colours.blue}24` : `${colours.blue}1a`)
          : (isDarkMode ? colours.dark.cardBackground : 'rgba(54, 144, 206, 0.06)'),
      color: disabled ? disabledColor : active ? activeTextColor : (isDarkMode ? colours.highlight : colours.highlight),
      boxShadow: 'none',
    },
    rootPressed: {
      background: disabled
        ? resolvedBackground
        : active
          ? (isDarkMode ? `${colours.blue}30` : `${colours.blue}22`)
          : (isDarkMode ? colours.dark.cardHover : 'rgba(54, 144, 206, 0.1)'),
    },
    label: { color: 'inherit' },
  };
}

// ─── Date-stamp buttons (From / To) ───────────────────────────────────────

export function dateStampButtonStyle(isDarkMode: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 2,
    padding: '6px 12px',
    borderRadius: 0,
    border: '1px solid transparent',
    background: isDarkMode ? colours.darkBlue : '#ffffff',
    color: isDarkMode ? colours.dark.text : colours.helixBlue,
    minWidth: 132,
    transition:
      'background 0.18s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.18s cubic-bezier(0.4, 0, 0.2, 1), transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'pointer',
    fontFamily: 'Raleway, sans-serif',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
  };
}

// ─── Clear filter button ───────────────────────────────────────────────────

export function clearFilterButtonStyle(isDarkMode: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 14px',
    height: 32,
    borderRadius: 0,
    border: `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.4)' : 'rgba(214, 85, 65, 0.3)'}`,
    background: isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.06)',
    color: colours.cta,
    gap: 6,
    cursor: 'pointer',
    transition: 'background 0.18s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: 'Raleway, sans-serif',
    fontWeight: 600,
    fontSize: 12,
    whiteSpace: 'nowrap',
  };
}

// ─── Refresh indicator colour ──────────────────────────────────────────────

export function getRefreshIndicatorColor(
  isDarkMode: boolean,
  timeElapsed: number,
  autoRefreshIntervalSecs: number = 900,
): string {
  const ratio = Math.min(timeElapsed / autoRefreshIntervalSecs, 1);
  if (ratio < 0.33) return isDarkMode ? colours.green : colours.green;
  if (ratio < 0.66) return isDarkMode ? colours.orange : colours.orange;
  return colours.cta;
}
