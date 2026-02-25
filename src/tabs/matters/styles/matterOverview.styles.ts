import { mergeStyles } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';

export const SURFACE_RADIUS = 0;
export const BADGE_RADIUS = 0;

export const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: 'transparent',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    fontFamily: 'Raleway, sans-serif',
  });

export const entryStyle = mergeStyles({
  animation: 'skeletonCascadeIn 220ms ease-out both',
  willChange: 'opacity, transform',
  '@media (prefers-reduced-motion: reduce)': {
    animation: 'none',
  },
});

export const headerStyle = (isDarkMode: boolean, hasNextSteps = false) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.darkBlue : '#ffffff',
    borderBottom: hasNextSteps
      ? 'none'
      : `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  });

export const headerLeftStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flex: 1,
  minWidth: 0,
});

export const headerTitleLineStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'Raleway, sans-serif',
    fontSize: 16,
    lineHeight: '20px',
    paddingTop: 1,
    paddingBottom: 1,
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

export const headerClientStyle = mergeStyles({
  fontWeight: 600,
});

export const headerSeparatorStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '0 8px',
    opacity: isDarkMode ? 0.35 : 0.45,
  });

export const headerDescriptionStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: 500,
    color: isDarkMode ? colours.dark.subText : colours.greyText,
  });

export const matterBadgeStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    borderRadius: BADGE_RADIUS,
    padding: '6px 10px',
    fontWeight: 600,
    color: colours.highlight,
    fontSize: 14,
  });

export const statusBadgeStyle = (status: 'active' | 'closed', isDarkMode: boolean) =>
  mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: BADGE_RADIUS,
    fontSize: 12,
    fontWeight: 600,
    backgroundColor: 'transparent',
    border: `1px solid ${
      status === 'active'
        ? (isDarkMode ? 'rgba(54, 144, 206, 0.45)' : 'rgba(54, 144, 206, 0.35)')
        : (isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.3)')
    }`,
    color:
      status === 'active'
        ? isDarkMode
          ? colours.blue
          : colours.missedBlue
        : isDarkMode
        ? '#94a3b8'
        : '#64748b',
  });

export const mainLayoutStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: '1fr 320px',
  gap: 0,
  flex: 1,
  '@media (max-width: 1024px)': {
    gridTemplateColumns: '1fr',
  },
});

export const leftColumnStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    backgroundColor: 'transparent',
  });

export const rightColumnStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: 24,
    borderLeft: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
    backgroundColor: isDarkMode ? colours.darkBlue : '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    '@media (max-width: 1024px)': {
      borderLeft: 'none',
      borderTop: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
    },
  });

export const metricsGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 16,
});

export const metricCardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.darkBlue : '#ffffff',
    border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
    borderRadius: SURFACE_RADIUS,
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    boxShadow: isDarkMode ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.04)',
  });

export const metricLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 12,
    fontWeight: 500,
    color: isDarkMode ? '#d1d5db' : colours.greyText,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  });

export const metricValueStyle = (isDarkMode: boolean, accent?: boolean) =>
  mergeStyles({
    fontSize: 24,
    fontWeight: 700,
    color: accent ? colours.highlight : isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
  });

export const sectionCardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.darkBlue : '#ffffff',
    border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
    borderRadius: SURFACE_RADIUS,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    boxShadow: isDarkMode ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.04)',
  });

export const sectionTitleStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 16,
    fontWeight: 700,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
    borderBottom: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
  });

export const fieldRowStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: '140px 1fr',
  gap: 12,
  alignItems: 'baseline',
});

export const fieldLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 13,
    fontWeight: 500,
    color: isDarkMode ? colours.dark.subText : colours.greyText,
  });

export const fieldValueStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 14,
    fontWeight: 500,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    wordBreak: 'break-word',
  });

export const clientFieldValueStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 12,
    fontWeight: 500,
    color: isDarkMode ? 'rgba(243, 244, 246, 0.78)' : 'rgba(15, 23, 42, 0.72)',
    wordBreak: 'break-word',
  });

export const detailsGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 12,
});

export const detailsTeamGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 20,
  alignItems: 'start',
  '@media (max-width: 1024px)': {
    gridTemplateColumns: '1fr',
  },
});

export const avatarStyle = (bgColor: string) =>
  mergeStyles({
    width: 36,
    height: 36,
    borderRadius: '50%',
    backgroundColor: bgColor,
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 13,
    flexShrink: 0,
  });

export const teamRowStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
});

export const teamGridStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
});

export const clientActionButtonStyle = (isDarkMode: boolean) =>
  mergeStyles({
    width: 32,
    height: 32,
    borderRadius: BADGE_RADIUS,
    backgroundColor: isDarkMode ? colours.darkBlue : '#ffffff',
    border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s',
    textDecoration: 'none',
    ':hover': {
      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
    },
  });

export const contactRowStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
});

export const copyChipStyle = (isCopied: boolean, isDarkMode: boolean) =>
  mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    flexShrink: 0,
    borderRadius: 5,
    border: isCopied
      ? `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.5)' : 'rgba(54, 144, 206, 0.38)'}`
      : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.12)'}`,
    background: isCopied
      ? (isDarkMode ? 'rgba(54, 144, 206, 0.16)' : 'rgba(54, 144, 206, 0.12)')
      : 'transparent',
    color: isCopied
      ? colours.highlight
      : (isDarkMode ? 'rgba(203, 213, 225, 0.5)' : 'rgba(71, 85, 105, 0.55)'),
    cursor: 'pointer',
    padding: 0,
    opacity: isCopied ? 1 : 0.6,
    transition: 'opacity 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 160ms ease, background 160ms ease',
    ':hover': {
      opacity: isCopied ? 1 : 0.9,
      borderColor: isCopied
        ? (isDarkMode ? 'rgba(54, 144, 206, 0.6)' : 'rgba(54, 144, 206, 0.5)')
        : (isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.3)'),
    },
  });

export const clientFieldStackStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const progressBarStyle = (isDarkMode: boolean) =>
  mergeStyles({
    height: 8,
    borderRadius: 2,
    backgroundColor: isDarkMode ? colours.dark.border : colours.highlightNeutral,
    overflow: 'hidden',
    position: 'relative',
  });

export const progressFillStyle = (percentage: number) =>
  mergeStyles({
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: `${percentage}%`,
    backgroundColor: colours.highlight,
    borderRadius: 2,
    transition: 'width 0.3s ease',
  });

export const metricSkeletonStyle = (isDarkMode: boolean, width = '72%') =>
  mergeStyles({
    height: 26,
    width,
    borderRadius: 6,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
  });

export const metricSubSkeletonStyle = (isDarkMode: boolean, width = '60%') =>
  mergeStyles({
    height: 12,
    width,
    borderRadius: 4,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
  });

export const processingHintStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 11,
    color: isDarkMode ? colours.dark.subText : colours.greyText,
  });

/* ─── KPI Strip — compact inline metrics ──────────────────────────── */

export const kpiStripStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'stretch',
    gap: 0,
    padding: '10px 0',
    borderBottom: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
  });

export const kpiItemStyle = (isDarkMode: boolean, accent?: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    padding: '4px 16px',
    borderRight: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}44` : 'rgba(6, 23, 51, 0.06)'}`,
    ':last-child': { borderRight: 'none' },
    selectors: {
      '& .kpi-label': {
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        color: isDarkMode ? colours.subtleGrey : colours.greyText,
      },
      '& .kpi-value': {
        fontSize: 16,
        fontWeight: 700,
        color: accent ? colours.highlight : (isDarkMode ? colours.dark.text : colours.light.text),
        fontFamily: 'Raleway, sans-serif',
      },
      '& .kpi-sub': {
        fontSize: 10,
        color: isDarkMode ? colours.dark.subText : colours.greyText,
      },
    },
  });

/* ─── Tab Panel Styles ─────────────────────────────────────────────── */

export const tabPanelContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    flex: 1,
    minHeight: 0,
    fontFamily: 'Raleway, sans-serif',
  });

export const tabEmptyStateStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 13,
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
    padding: '48px 0',
    textAlign: 'center',
    fontStyle: 'italic',
  });

export const tabPanelHeaderStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 18,
    fontWeight: 700,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 16,
    borderBottom: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
    fontFamily: 'Raleway, sans-serif',
  });

export const tabPanelCardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.darkBlue : '#ffffff',
    border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
    borderRadius: SURFACE_RADIUS,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    boxShadow: isDarkMode ? 'none' : '0 2px 4px rgba(0, 0, 0, 0.04)',
  });

export const tabPanelCardTitleStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 13,
    fontWeight: 600,
    color: isDarkMode ? '#d1d5db' : colours.greyText,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  });

export const tabPanelRoadmapStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 12,
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
    padding: '12px 16px',
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
    border: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}44` : 'rgba(6, 23, 51, 0.04)'}`,
    borderRadius: SURFACE_RADIUS,
    lineHeight: 1.5,
  });

export const portalLinkButtonStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)',
    border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
    borderRadius: SURFACE_RADIUS,
    color: colours.highlight,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    textDecoration: 'none',
    ':hover': {
      backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(54, 144, 206, 0.1)',
      borderColor: isDarkMode ? 'rgba(54, 144, 206, 0.45)' : 'rgba(54, 144, 206, 0.35)',
    },
  });

export const cclStatusStyle = (status: 'none' | 'generated' | 'sent', isDarkMode: boolean) =>
  mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
    color: status === 'none'
      ? (isDarkMode ? colours.subtleGrey : colours.greyText)
      : status === 'sent'
      ? colours.green
      : colours.highlight,
  });
