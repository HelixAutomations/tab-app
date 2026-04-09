import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../../app/styles/colours';


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
    borderBottom: `0.5px solid ${
      isDarkMode
        ? hasNextSteps
          ? `${colours.dark.borderColor}88`
          : `${colours.dark.borderColor}66`
        : 'rgba(6, 23, 51, 0.08)'
    }`,
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
          : colours.helixBlue
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
    backgroundColor: isDarkMode ? 'transparent' : '#ffffff',
  });


export const rightColumnStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: 24,
    borderLeft: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.08)'}`,
    backgroundColor: isDarkMode ? colours.darkBlue : colours.grey,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    '@media (max-width: 1024px)': {
      borderLeft: 'none',
      borderTop: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.08)'}`,
    },
  });


export const detailPanelsGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
  alignItems: 'start',
  '@media (max-width: 900px)': {
    gridTemplateColumns: '1fr',
  },
});


export const sectionCardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.darkBlue : '#ffffff',
    border: `1px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.10)'}`,
    borderRadius: 0,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    boxShadow: isDarkMode ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  });


export const sectionTitleStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: isDarkMode ? '#d1d5db' : colours.greyText,
    fontFamily: 'Raleway, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 10,
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
    fontSize: 12,
    fontWeight: 500,
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
  });


export const clientFieldValueStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 12,
    fontWeight: 500,
    color: isDarkMode ? 'rgba(243, 244, 246, 0.78)' : 'rgba(15, 23, 42, 0.72)',
    wordBreak: 'break-word',
  });


export const detailsMotionItemStyle = (delayMs = 0) =>
  mergeStyles({
    opacity: 1,
    transform: 'none',
    transition: delayMs > 0 ? `opacity 220ms ease ${delayMs}ms, transform 220ms ease ${delayMs}ms` : 'opacity 220ms ease, transform 220ms ease',
  });


export const detailsSectionsStackStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});


export const detailSectionStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '0',
    background: 'transparent',
    border: 'none',
  });


export const detailSectionHeaderStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    paddingBottom: 4,
    borderBottom: `1px solid ${isDarkMode ? `${colours.dark.borderColor}33` : 'rgba(6, 23, 51, 0.05)'}`,
  });


export const detailSectionTitleStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
  });


export const detailFieldGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 8,
});


export const detailFieldCardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    minWidth: 0,
    padding: '7px 0',
    background: 'transparent',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.18)' : 'rgba(6, 23, 51, 0.06)'}`,
    transition: 'transform 180ms ease, opacity 180ms ease',
    selectors: {
      '&:last-child': {
        borderBottom: 'none',
      },
    },
  });


export const detailFieldStackStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
  minWidth: 0,
  width: '100%',
});


export const backendSystemPanelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 0,
  });


export const backendSystemHeaderStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 6,
    borderBottom: `1px solid ${isDarkMode ? `${colours.dark.borderColor}33` : 'rgba(6, 23, 51, 0.05)'}`,
  });


export const backendSystemBrandStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
});


export const backendSystemTitleStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
  });


export const backendTreeListStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
});


export const backendTreePathStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    padding: '4px 0 6px',
    fontSize: 11,
    lineHeight: 1.45,
    color: isDarkMode ? '#9ca3af' : colours.greyText,
  });


export const backendTreeItemStyle = (isDarkMode: boolean, level: number) =>
  mergeStyles({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'start',
    gap: 8,
    padding: '6px 0',
    marginLeft: level * 18,
    borderBottom: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.20)' : 'rgba(6, 23, 51, 0.05)'}`,
    position: 'relative',
    selectors: level > 0 ? {
      '&::before': {
        content: '""',
        position: 'absolute',
        left: -12,
        top: 0,
        bottom: 0,
        width: 1,
        background: isDarkMode ? 'rgba(75, 85, 99, 0.24)' : 'rgba(6, 23, 51, 0.08)',
      },
      '&::after': {
        content: '""',
        position: 'absolute',
        left: -12,
        top: 18,
        width: 10,
        height: 1,
        background: isDarkMode ? 'rgba(75, 85, 99, 0.24)' : 'rgba(6, 23, 51, 0.08)',
      },
      '&:last-child': {
        borderBottom: 'none',
      },
    } : {
      '&:last-child': {
        borderBottom: 'none',
      },
    },
  });


export const backendTreeMainStyle = mergeStyles({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  minWidth: 0,
  alignSelf: 'start',
});


export const backendTreeTextStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
  flex: 1,
});


export const backendTreeTitleStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.3,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  });


export const backendTreeMetaStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'block',
    fontSize: 9,
    lineHeight: 1.3,
    color: isDarkMode ? '#9ca3af' : colours.greyText,
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  });


export const workbenchShellStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.websiteBlue : colours.light.cardBackground,
  });


export const workbenchShellHeaderStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 16px',
    borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.highlightNeutral}`,
    background: isDarkMode ? 'rgba(6, 23, 51, 0.65)' : colours.light.sectionBackground,
    fontFamily: 'Raleway, sans-serif',
  });


export const workbenchShellHeaderContentStyle = mergeStyles({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
});


export const workbenchShellHeaderIconStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: isDarkMode ? '#dbe4ff' : colours.greyText,
    opacity: 0.95,
    flexShrink: 0,
  });


export const workbenchShellHeaderLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: 10,
    fontWeight: 600,
    color: isDarkMode ? '#dbe4ff' : colours.greyText,
    letterSpacing: '0.3px',
    textTransform: 'uppercase',
    fontFamily: 'Raleway, sans-serif',
  });


export const workbenchShellBodyStyle = mergeStyles({
  padding: '8px 16px 10px',
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


export const metricSubSkeletonStyle = (isDarkMode: boolean, width = '60%') =>
  mergeStyles({
    height: 12,
    width,
    borderRadius: 0,
    background: isDarkMode
      ? 'linear-gradient(90deg, rgba(54, 144, 206, 0.08) 0%, rgba(54, 144, 206, 0.16) 50%, rgba(54, 144, 206, 0.08) 100%)'
      : 'linear-gradient(90deg, rgba(214, 232, 255, 0.60) 0%, rgba(214, 232, 255, 0.92) 50%, rgba(214, 232, 255, 0.60) 100%)',
  });


/* ─── KPI Banner — full-width metrics strip ──────────────────────── */

export const kpiBannerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    alignItems: 'stretch',
    gap: 0,
    padding: '12px 24px 0',
    backgroundColor: 'transparent',
  });


/** @deprecated — alias kept for secondary usages inside tab panels */
export const kpiStripStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'stretch',
    gap: 0,
    padding: '10px 0',
    borderBottom: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
    backgroundColor: isDarkMode ? 'transparent' : '#ffffff',
    border: isDarkMode ? 'none' : `1px solid rgba(6, 23, 51, 0.10)`,
    boxShadow: isDarkMode ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  });


export const kpiBannerItemStyle = (isDarkMode: boolean, accent?: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 2,
    minWidth: 0,
    minHeight: 56,
    padding: '4px 16px 6px',
    borderRight: `1px solid ${isDarkMode ? `${colours.dark.borderColor}55` : 'rgba(6, 23, 51, 0.08)'}`,
    ':last-child': { borderRight: 'none' },
    selectors: {
      '& .kpi-label': {
        display: 'block',
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        color: isDarkMode ? colours.subtleGrey : colours.greyText,
      },
      '& .kpi-value': {
        display: 'block',
        fontSize: 19,
        fontWeight: 700,
        color: accent ? colours.highlight : (isDarkMode ? colours.dark.text : colours.light.text),
        fontFamily: 'Raleway, sans-serif',
        lineHeight: 1.1,
        marginTop: 1,
      },
      '& .kpi-sub': {
        display: 'block',
        fontSize: 10,
        color: isDarkMode ? '#9ca3af' : colours.greyText,
        fontWeight: 500,
        lineHeight: 1.2,
      },
    },
    '@media (max-width: 900px)': {
      borderRight: 'none',
      borderBottom: `1px solid ${isDarkMode ? `${colours.dark.borderColor}44` : 'rgba(6, 23, 51, 0.06)'}`,
      ':last-child': { borderBottom: 'none' },
    },
  });


/** @deprecated — alias kept for secondary usages inside tab panels */
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
    fontSize: 14,
    fontWeight: 700,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 14,
    borderBottom: `0.5px solid ${isDarkMode ? `${colours.dark.borderColor}66` : 'rgba(6, 23, 51, 0.06)'}`,
    fontFamily: 'Raleway, sans-serif',
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
