import React from 'react';
import type { CSSProperties } from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import type { IButtonStyles } from '@fluentui/react/lib/Button';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { Slider } from '@fluentui/react/lib/Slider';
import { FaChartLine, FaClipboardList, FaFolderOpen, FaInbox } from 'react-icons/fa';
import { colours } from '../../app/styles/colours';

/* ─── Local type aliases (mirror parent types, avoid circular imports) ──── */

type ReportRangeKey = '3m' | '6m' | '12m' | '24m';

type DatasetStatusValue = 'idle' | 'loading' | 'ready' | 'error';

type ReportVisualState = 'neutral' | 'warming' | 'ready' | 'disabled';

type ButtonState = 'neutral' | 'warming' | 'ready';

interface ReportDependency {
  key: string;
  name: string;
  status: DatasetStatusValue;
  range: string;
}

interface ReportCardData {
  key: string;
  name: string;
  status: string;
  action?: string;
  requiredDatasets: string[];
  description?: string;
  disabled?: boolean;
  development?: boolean;
  readiness: ButtonState;
  dependencies: ReportDependency[];
  readyDependencies: number;
  totalDependencies: number;
}

interface ReportProgressEntry {
  isLoading: boolean;
  progress: number;
  estimatedTimeRemaining?: number;
  stage?: string;
  startTime?: number;
}

/* ─── Style helpers (self-contained copies from ReportingHome module scope) ─ */

const subtleStroke = (isDarkMode: boolean): string => (
  isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(6, 23, 51, 0.06)'
);

const REPORT_CARD_STATE_TOKENS: Record<ReportVisualState, {
  label: string;
  accent: string;
  lightBadgeBg: string;
  darkBadgeBg: string;
}> = {
  ready: {
    label: 'Ready',
    accent: colours.green,
    lightBadgeBg: 'rgba(32, 178, 108, 0.15)',
    darkBadgeBg: 'rgba(32, 178, 108, 0.28)',
  },
  warming: {
    label: 'Fetching…',
    accent: colours.blue,
    lightBadgeBg: 'rgba(54, 144, 206, 0.15)',
    darkBadgeBg: 'rgba(54, 144, 206, 0.28)',
  },
  neutral: {
    label: 'Needs data',
    accent: colours.subtleGrey,
    lightBadgeBg: `${colours.subtleGrey}2E`,
    darkBadgeBg: `${colours.dark.borderColor}52`,
  },
  disabled: {
    label: 'Disabled',
    accent: colours.subtleGrey,
    lightBadgeBg: 'rgba(160, 160, 160, 0.12)',
    darkBadgeBg: 'rgba(160, 160, 160, 0.18)',
  },
};

const STATUS_BADGE_COLOURS: Record<DatasetStatusValue, {
  lightBg: string;
  darkBg: string;
  dot: string;
  label: string;
  icon?: string;
}> = {
  ready: {
    lightBg: 'rgba(13, 47, 96, 0.22)',
    darkBg: 'rgba(32, 178, 108, 0.28)',
    dot: colours.green,
    label: 'Ready',
    icon: 'CheckMark',
  },
  loading: {
    lightBg: 'rgba(54, 144, 206, 0.18)',
    darkBg: 'rgba(54, 144, 206, 0.32)',
    dot: '#3690CE',
    label: 'Refreshing',
  },
  error: {
    lightBg: `${colours.subtleGrey}29`,
    darkBg: `${colours.dark.borderColor}47`,
    dot: colours.subtleGrey,
    label: 'Error',
    icon: 'WarningSolid',
  },
  idle: {
    lightBg: `${colours.subtleGrey}29`,
    darkBg: `${colours.dark.borderColor}47`,
    dot: colours.subtleGrey,
    label: 'Not loaded',
    icon: 'Clock',
  },
};

const REPORT_RANGE_OPTIONS: Array<{ key: ReportRangeKey; label: string; months: number }> = [
  { key: '3m', label: '90 days', months: 3 },
  { key: '6m', label: '6 months', months: 6 },
  { key: '12m', label: '12 months', months: 12 },
  { key: '24m', label: '24 months', months: 24 },
];

const MATTERS_WIP_RANGE_OPTIONS = REPORT_RANGE_OPTIONS;

const dependencyChipsWrapStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const dependencyChipStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 2,
  fontSize: 11,
  fontWeight: 500,
  background: isDarkMode ? 'rgba(10, 28, 50, 0.55)' : 'rgba(244, 244, 246, 0.8)',
  border: `0.5px solid ${subtleStroke(isDarkMode)}`,
  color: isDarkMode ? colours.dark.text : colours.light.text,
});

const dependencyDotStyle = (colour: string): CSSProperties => ({
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: colour,
});

const primaryButtonStyles = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    borderRadius: 0,
    padding: '0 18px',
    height: 34,
    background: colours.cta,
    color: '#ffffff',
    border: 'none',
    fontWeight: 600,
    fontSize: 13,
    boxShadow: 'none',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: '#b94736',
    boxShadow: 'none',
  },
  rootPressed: {
    background: '#9e3e30',
  },
  rootDisabled: {
    background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
    color: isDarkMode ? colours.greyText : colours.subtleGrey,
    border: 'none',
  },
  icon: {
    color: '#ffffff',
    fontSize: 14,
  },
});

const subtleButtonStyles = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    borderRadius: 0,
    padding: '0 14px',
    height: 34,
    background: isDarkMode ? 'rgba(75, 85, 99, 0.08)' : 'transparent',
    color: isDarkMode ? colours.dark.text : colours.greyText,
    border: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(75, 85, 99, 0.14)'}`,
    fontWeight: 500,
    fontSize: 13,
    boxShadow: 'none',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: isDarkMode ? 'rgba(75, 85, 99, 0.14)' : 'rgba(75, 85, 99, 0.06)',
    borderColor: isDarkMode ? 'rgba(75, 85, 99, 0.36)' : 'rgba(75, 85, 99, 0.2)',
  },
  rootPressed: {
    background: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(75, 85, 99, 0.1)',
  },
  icon: {
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
    fontSize: 14,
  },
});

const notReadyButtonStyles = (isDarkMode: boolean): IButtonStyles => ({
  root: {
    borderRadius: 0,
    padding: '0 16px',
    height: 36,
    background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.07)',
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
    border: `0.5px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.14)'}`,
    fontWeight: 600,
    boxShadow: 'none',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    fontFamily: 'Raleway, sans-serif',
  },
  rootHovered: {
    background: isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(54, 144, 206, 0.1)',
  },
  rootPressed: {
    background: isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.14)',
  },
  rootDisabled: {
    background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.07)',
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
    border: `0.5px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.14)'}`,
  },
});

/* ─── Props ────────────────────────────────────────────────────────────── */

export interface ReportCardProps {
  card: ReportCardData;
  isPrimary?: boolean;
  animationIndex?: number;

  isDarkMode: boolean;
  testMode: boolean;

  expandedReportCards: string[];
  activePrimaryCard: string | null;
  reportProgressStates: Record<string, ReportProgressEntry | undefined>;
  reportLoadingStates: Record<string, boolean | undefined>;
  isActivelyLoading: boolean;

  onExpandedCardsChange: React.Dispatch<React.SetStateAction<string[]>>;
  onActivePrimaryCardChange: React.Dispatch<React.SetStateAction<string | null>>;

  onOpenDashboard: () => void;
  onNavigateToReport: (view: string) => void;
  onCardClick: (key: string, action: () => void, depKeys: string[]) => void;

  refreshDatasetsWithStreaming: () => void;
  refreshAnnualLeaveOnly: () => void;
  refreshMattersScoped: () => void;
  refreshEnquiriesScoped: () => void;
  refreshMetaMetricsOnly: () => void;
  refreshGoogleAnalyticsOnly: () => void;
  refreshGoogleAdsOnly: () => void;

  // Management range
  managementSliderValue: number;
  managementSliderHasPendingChange: boolean;
  managementRangeIsRefreshing: boolean;
  onManagementSliderChange: (value: number) => void;
  onApplyManagementRange: () => void;

  // Matters range
  mattersWipRangeKey: ReportRangeKey;
  pendingMattersRangeKey: ReportRangeKey;
  mattersRangeSliderValue: number;
  sliderHasPendingChange: boolean;
  wipRangeIsRefreshing: boolean;
  onMattersSliderChange: (value: number) => void;
  onApplyPendingMattersRange: () => void;

  // Enquiries range
  enquiriesRangeKey: ReportRangeKey;
  pendingEnquiriesRangeKey: ReportRangeKey;
  enquiriesRangeSliderValue: number;
  enquiriesSliderHasPendingChange: boolean;
  enquiriesRangeIsRefreshing: boolean;
  onEnquiriesSliderChange: (value: number) => void;
  onApplyPendingEnquiriesRange: () => void;

  describeRangeKey: (key: ReportRangeKey) => string;
  describeMattersRange: (key: ReportRangeKey) => string;
}

/* ─── Component ────────────────────────────────────────────────────────── */

const ReportCard: React.FC<ReportCardProps> = ({
  card,
  isPrimary = false,
  animationIndex = 0,
  isDarkMode,
  testMode,
  expandedReportCards,
  activePrimaryCard,
  reportProgressStates,
  reportLoadingStates,
  isActivelyLoading,
  onExpandedCardsChange,
  onActivePrimaryCardChange,
  onOpenDashboard,
  onNavigateToReport,
  onCardClick,
  refreshDatasetsWithStreaming,
  refreshAnnualLeaveOnly,
  refreshMattersScoped,
  refreshEnquiriesScoped,
  refreshMetaMetricsOnly,
  refreshGoogleAnalyticsOnly,
  refreshGoogleAdsOnly,
  managementSliderValue,
  managementSliderHasPendingChange,
  managementRangeIsRefreshing,
  onManagementSliderChange,
  onApplyManagementRange,
  mattersWipRangeKey,
  pendingMattersRangeKey,
  mattersRangeSliderValue,
  sliderHasPendingChange,
  wipRangeIsRefreshing,
  onMattersSliderChange,
  onApplyPendingMattersRange,
  enquiriesRangeKey,
  pendingEnquiriesRangeKey,
  enquiriesRangeSliderValue,
  enquiriesSliderHasPendingChange,
  enquiriesRangeIsRefreshing,
  onEnquiriesSliderChange,
  onApplyPendingEnquiriesRange,
  describeRangeKey,
  describeMattersRange,
}) => {
  const { readiness, dependencies, readyDependencies, totalDependencies, ...report } = card;
  const visualState: ReportVisualState = (report.disabled && !testMode) ? 'disabled' : readiness;
  const isReportReady = readiness === 'ready' || testMode;
  const stateTokens = REPORT_CARD_STATE_TOKENS[visualState];

  const isPrimaryRow = isPrimary && (expandedReportCards.some(key => ['dashboard', 'enquiries', 'matters'].includes(key)));
  const isActive = isPrimary && activePrimaryCard === report.key;
  const isExpanded = isPrimary ? isPrimaryRow : expandedReportCards.includes(report.key);

  const resolvePrimaryButtonLabel = (readyLabel: string) => {
    if (visualState === 'disabled') return report.status || 'Disabled';
    if (isReportReady) return readyLabel;
    if (visualState === 'warming') return 'Refreshing…';
    return 'Refresh data to unlock';
  };

  const getReportIcon = () => {
    switch (report.key) {
      case 'dashboard': return <FaChartLine size={18} />;
      case 'enquiries': return <FaInbox size={18} />;
      case 'enquiryLedger': return <FaClipboardList size={18} />;
      case 'annualLeave': return <FaClipboardList size={18} />;
      case 'matters': return <FaFolderOpen size={18} />;
      default: return <FaChartLine size={18} />;
    }
  };

  return (
    <div
      key={report.key}
      onClick={() => {
        if (isPrimary && isExpanded) {
          onActivePrimaryCardChange(report.key);
        }
      }}
      style={{
        padding: 0,
        borderRadius: 0,
        background: isDarkMode ? 'rgba(6, 23, 51, 0.45)' : 'rgba(255, 255, 255, 0.6)',
        border: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.18)' : 'rgba(6, 23, 51, 0.06)'}`,
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        opacity: visualState === 'disabled' ? 0.38 : 1,
        filter: visualState === 'disabled' ? 'grayscale(100%)' : 'none',
        cursor: isPrimary && isExpanded ? 'pointer' : 'default',
        animation: 'fadeInUp 0.35s ease forwards',
        animationDelay: `${animationIndex * 0.06}s`,
      }}
    >
      {/* ── Header row ─────────────────────────────────────────────── */}
      <div
        onClick={() => {
          if (report.action && (!report.disabled || testMode)) {
            const action = report.action === 'dashboard' ? onOpenDashboard : () => onNavigateToReport(report.action!);
            onCardClick(report.key, action, dependencies.map(d => d.key));
          }
        }}
        style={{
          padding: '16px 18px',
          cursor: (report.action && (!report.disabled || testMode)) ?
            (reportProgressStates[report.key]?.isLoading ? 'wait' : 'pointer') : 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          background: reportProgressStates[report.key]?.isLoading
            ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)')
            : (isPrimary && isActive && isExpanded)
            ? (isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)')
            : 'transparent',
          transition: 'all 0.2s ease',
          boxShadow: 'none',
          position: 'relative' as const,
          zIndex: 1,
        }}
        onMouseEnter={(e) => {
          if (report.action && (!report.disabled || testMode) && !reportProgressStates[report.key]?.isLoading) {
            e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.04)' : 'rgba(54, 144, 206, 0.03)';
          }
        }}
        onMouseLeave={(e) => {
          const currentProgress = reportProgressStates[report.key];
          e.currentTarget.style.background = currentProgress?.isLoading
            ? (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)')
            : (isPrimary && isActive && isExpanded)
            ? (isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)')
            : 'transparent';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 0,
            background: isReportReady
              ? (isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.06)')
              : (isDarkMode ? 'rgba(75, 85, 99, 0.15)' : 'rgba(160, 160, 160, 0.08)'),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `0.5px solid ${isReportReady ? (isDarkMode ? 'rgba(135, 243, 243, 0.2)' : 'rgba(54, 144, 206, 0.18)') : (isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(107, 107, 107, 0.12)')}`,
            color: isReportReady ? stateTokens.accent : (isDarkMode ? colours.subtleGrey : colours.greyText),
            flexShrink: 0,
          }}>
            {getReportIcon()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              marginBottom: 6,
              fontFamily: 'Raleway, sans-serif',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {report.name}
            </div>
            <div style={{
              fontSize: 11,
              color: isDarkMode ? colours.subtleGrey : colours.greyText,
              fontWeight: 500,
              minHeight: 24,
              display: 'flex',
              alignItems: 'center',
              overflow: 'visible',
            }}>
              {reportProgressStates[report.key]?.isLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{reportProgressStates[report.key]?.stage || 'Loading...'}</span>
                    <div style={{
                      width: 8,
                      height: 8,
                      border: `2px solid ${colours.highlight}`,
                      borderTop: '2px solid transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }} />
                  </div>
                  {reportProgressStates[report.key]?.estimatedTimeRemaining && (
                    <span style={{ fontSize: 10, opacity: 0.8 }}>
                      ~{Math.ceil((reportProgressStates[report.key]?.estimatedTimeRemaining || 0) / 1000)}s remaining
                    </span>
                  )}
                </div>
              ) : (
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 2,
                  background: reportProgressStates[report.key]?.isLoading
                    ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                    : isReportReady
                    ? (isDarkMode ? 'rgba(135, 243, 243, 0.1)' : `${stateTokens.accent}12`)
                    : (isDarkMode ? 'rgba(75, 85, 99, 0.15)' : 'rgba(160, 160, 160, 0.08)'),
                  color: reportProgressStates[report.key]?.isLoading
                    ? colours.blue
                    : isReportReady ? stateTokens.accent : (isDarkMode ? colours.subtleGrey : colours.greyText),
                  border: `0.5px solid ${reportProgressStates[report.key]?.isLoading
                    ? (isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.18)')
                    : isReportReady ? (isDarkMode ? 'rgba(135, 243, 243, 0.18)' : `${stateTokens.accent}20`) : (isDarkMode ? 'rgba(75, 85, 99, 0.25)' : 'rgba(107, 107, 107, 0.1)')}`,
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {reportProgressStates[report.key]?.isLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      LOADING
                      <span style={{ fontSize: 10, opacity: 0.8, fontWeight: 400 }}>
                        {Math.round(reportProgressStates[report.key]?.progress || 0)}%
                      </span>
                    </span>
                  ) : (
                    visualState === 'disabled' ? (report.status || stateTokens.label) :
                    (stateTokens.label === 'Not loaded' ? `Ready (${describeRangeKey(enquiriesRangeKey)})` : stateTokens.label)
                  )}

                  {reportProgressStates[report.key]?.isLoading && (
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      height: 2,
                      width: `${reportProgressStates[report.key]?.progress || 0}%`,
                      background: colours.highlight,
                      transition: 'width 0.3s ease',
                      borderRadius: '0 0 2px 2px',
                    }} />
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {(dependencies.length > 0 || report.action) && (
            <FontIcon
              iconName={isExpanded ? 'ChevronUp' : 'ChevronDown'}
              onClick={(e) => {
                e.stopPropagation();
                if (isPrimary) {
                  if (isExpanded) {
                    onExpandedCardsChange((prev) => prev.filter((key) => !['dashboard', 'enquiries', 'matters'].includes(key)));
                    onActivePrimaryCardChange(null);
                  } else {
                    onExpandedCardsChange((prev) => {
                      const withoutPrimary = prev.filter((key) => !['dashboard', 'enquiries', 'matters'].includes(key));
                      return [...withoutPrimary, report.key];
                    });
                    onActivePrimaryCardChange(report.key);
                  }
                } else {
                  onExpandedCardsChange((prev) => {
                    if (isExpanded) return prev.filter((key) => key !== report.key);
                    return [...prev, report.key];
                  });
                }
              }}
              style={{
                fontSize: 14,
                color: isDarkMode ? colours.subtleGrey : colours.greyText,
                cursor: 'pointer',
                padding: 8,
                borderRadius: 0,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            />
          )}
        </div>
      </div>

      {/* ── Collapsed dependency dots ──────────────────────────────── */}
      {!isExpanded && dependencies.length > 0 && (
        <div style={{
          padding: '10px 28px 14px',
          borderTop: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.12)' : 'rgba(6, 23, 51, 0.03)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: (isPrimary && !isActive && isExpanded) ? 0.5 : 0.85,
          animation: 'fadeInSlideDown 0.3s ease 0.1s forwards',
          transition: 'opacity 0.2s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, overflow: 'visible', minHeight: 20 }}>
              {dependencies.slice(0, 8).map((dependency, index) => {
                const palette = STATUS_BADGE_COLOURS[dependency.status];
                const dotColour = dependency.status === 'ready' ? colours.green : palette.dot;
                return (
                  <div
                    key={`${report.key}-dot-${dependency.key}`}
                    title={`${dependency.name}: ${palette.label}${dependency.range ? ` (${dependency.range})` : ''}`}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: dotColour,
                      flexShrink: 0,
                      opacity: dependency.status === 'ready' ? 1 : 0.7,
                      transform: 'scale(0)',
                      animation: `dotFadeIn 0.3s ease ${0.1 + (index * 0.05)}s forwards`,
                    }}
                  />
                );
              })}
              {dependencies.length > 8 && (
                <span style={{
                  fontSize: 10,
                  color: isDarkMode ? colours.greyText : colours.subtleGrey,
                  fontWeight: 500,
                  marginLeft: 2,
                  opacity: 0,
                  animation: `fadeIn 0.3s ease ${0.1 + (Math.min(8, dependencies.length) * 0.05)}s forwards`,
                }}>
                  +{dependencies.length - 8}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Expanded detail panel ──────────────────────────────────── */}
      {isExpanded && (
        <div style={{
          padding: '0 28px 24px',
          borderTop: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.18)' : 'rgba(6, 23, 51, 0.04)'}`,
          background: isDarkMode ? 'rgba(6, 23, 51, 0.4)' : 'rgba(244, 244, 246, 0.35)',
          opacity: (isPrimary && !isActive) ? 0.5 : 1,
          transition: 'opacity 0.2s ease',
        }}>
          <div style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {dependencies.length > 0 ? (
              <div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: isDarkMode ? colours.subtleGrey : colours.greyText,
                  marginBottom: 12,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                  Data Feeds ({readyDependencies}/{totalDependencies} ready)
                </div>
                <div style={dependencyChipsWrapStyle}>
                  {dependencies.map((dependency) => {
                    const palette = STATUS_BADGE_COLOURS[dependency.status];
                    const dotColour = dependency.status === 'ready'
                      ? colours.green
                      : palette.dot;
                    return (
                      <span
                        key={`${report.key}-${dependency.key}`}
                        style={dependencyChipStyle(isDarkMode)}
                        title={dependency.range ? `Typical coverage: ${dependency.range}` : undefined}
                      >
                        <span style={dependencyDotStyle(dotColour)} />
                        <span style={{ fontWeight: 600 }}>{dependency.name}</span>
                        <span style={{ fontSize: 10, opacity: 0.7 }}>
                          {palette.label === 'Not loaded'
                            ? dependency.range || describeRangeKey(enquiriesRangeKey)
                            : palette.label}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                No datasets required
              </div>
            )}

            {/* ── Action buttons per report type ──────────────────── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {report.action === 'dashboard' && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {!managementRangeIsRefreshing && (
                    <div style={{
                      width: '100%',
                      borderRadius: 0,
                      padding: 12,
                      background: isDarkMode ? 'rgba(10, 28, 50, 0.5)' : 'rgba(241, 248, 255, 0.6)',
                      border: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.22)' : 'rgba(54, 144, 206, 0.18)'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Management data window</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                          {managementRangeIsRefreshing
                            ? 'Refreshing…'
                            : managementSliderHasPendingChange
                              ? `Pending: ${describeRangeKey(pendingEnquiriesRangeKey)}`
                              : `Active: ${describeRangeKey(enquiriesRangeKey)}`}
                        </div>
                      </div>
                      <Slider
                        min={0}
                        max={REPORT_RANGE_OPTIONS.length - 1}
                        step={1}
                        value={managementSliderValue}
                        onChange={onManagementSliderChange}
                        showValue={false}
                        styles={{
                          root: { margin: '8px 4px' },
                          activeSection: { background: colours.highlight },
                          thumb: { borderColor: colours.highlight },
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        {REPORT_RANGE_OPTIONS.map((option, index) => (
                          <span
                            key={`${report.key}-mgmt-${option.key}`}
                            style={{
                              fontSize: 10,
                              fontWeight: index === managementSliderValue ? 700 : 500,
                              color: index === managementSliderValue
                                ? colours.highlight
                                : (isDarkMode ? colours.subtleGrey : colours.greyText),
                              transition: 'color 0.2s ease',
                            }}
                          >
                            {option.label}
                          </span>
                        ))}
                      </div>
                      {managementSliderHasPendingChange && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                          <DefaultButton
                            text={`Apply ${describeRangeKey(pendingEnquiriesRangeKey)}`}
                            onClick={onApplyManagementRange}
                            styles={subtleButtonStyles(isDarkMode)}
                            disabled={managementRangeIsRefreshing}
                            iconProps={{ iconName: 'Play' }}
                          />
                        </div>
                      )}
                      {managementSliderHasPendingChange && (
                        <div style={{
                          marginTop: 8,
                          padding: 8,
                          background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)',
                          borderRadius: 0,
                          fontSize: 12,
                          color: isDarkMode ? colours.dark.text : colours.greyText,
                          fontWeight: 500,
                        }}>
                          Refreshes management dashboard datasets only
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <PrimaryButton
                      text={resolvePrimaryButtonLabel('Open dashboard')}
                      onClick={() => { if (isReportReady) onOpenDashboard(); }}
                      styles={isReportReady ? primaryButtonStyles(isDarkMode) : notReadyButtonStyles(isDarkMode)}
                      disabled={!isReportReady}
                    />
                    <DefaultButton
                      text="Refresh All Datasets"
                      onClick={refreshDatasetsWithStreaming}
                      styles={subtleButtonStyles(isDarkMode)}
                      disabled={reportLoadingStates.dashboard}
                      iconProps={{ iconName: 'Refresh' }}
                    />
                  </div>
                </div>
              )}

              {report.action === 'annualLeave' && (
                <>
                  <PrimaryButton
                    text={resolvePrimaryButtonLabel('Open annual leave')}
                    onClick={() => { if (isReportReady) onNavigateToReport('annualLeave'); }}
                    styles={isReportReady ? primaryButtonStyles(isDarkMode) : notReadyButtonStyles(isDarkMode)}
                    disabled={!isReportReady}
                  />
                  <DefaultButton
                    text="Refresh leave data"
                    onClick={refreshAnnualLeaveOnly}
                    styles={subtleButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.annualLeave}
                    iconProps={{ iconName: 'Refresh' }}
                  />
                </>
              )}

              {report.action === 'matters' && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {!isActivelyLoading && (
                    <div style={{
                      width: '100%',
                      borderRadius: 0,
                      padding: 12,
                      background: isDarkMode ? 'rgba(10, 28, 50, 0.5)' : 'rgba(241, 248, 255, 0.6)',
                      border: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.22)' : 'rgba(54, 144, 206, 0.18)'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Matters data window</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                          {wipRangeIsRefreshing
                            ? 'Refreshing…'
                            : sliderHasPendingChange
                              ? `Pending: ${describeMattersRange(pendingMattersRangeKey)}`
                              : `Active: ${describeMattersRange(mattersWipRangeKey)}`}
                        </div>
                      </div>
                      <Slider
                        min={0}
                        max={MATTERS_WIP_RANGE_OPTIONS.length - 1}
                        step={1}
                        value={mattersRangeSliderValue}
                        onChange={onMattersSliderChange}
                        showValue={false}
                        disabled={report.disabled && !testMode}
                        styles={{
                          root: { margin: '8px 4px' },
                          activeSection: { background: colours.highlight },
                          thumb: { borderColor: colours.highlight },
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        {MATTERS_WIP_RANGE_OPTIONS.map((option, index) => (
                          <span
                            key={option.key}
                            style={{
                              fontSize: 10,
                              fontWeight: index === mattersRangeSliderValue ? 700 : 500,
                              color: index === mattersRangeSliderValue
                                ? colours.highlight
                                : (isDarkMode ? colours.subtleGrey : colours.greyText),
                              transition: 'color 0.2s ease',
                            }}
                          >
                            {option.label}
                          </span>
                        ))}
                      </div>
                      {sliderHasPendingChange && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                          <DefaultButton
                            text={`Apply ${describeMattersRange(pendingMattersRangeKey)}`}
                            onClick={onApplyPendingMattersRange}
                            styles={subtleButtonStyles(isDarkMode)}
                            disabled={wipRangeIsRefreshing || (report.disabled && !testMode)}
                            iconProps={{ iconName: 'Play' }}
                          />
                        </div>
                      )}
                      {sliderHasPendingChange && (
                        <div style={{
                          marginTop: 8,
                          padding: 8,
                          background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)',
                          borderRadius: 0,
                          fontSize: 12,
                          color: isDarkMode ? colours.dark.text : colours.greyText,
                          fontWeight: 500,
                        }}>
                          Will cover: {describeMattersRange(pendingMattersRangeKey)}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <PrimaryButton
                      text={resolvePrimaryButtonLabel('Open matters report')}
                      onClick={() => { if ((!report.disabled || testMode) && isReportReady) onNavigateToReport('matters'); }}
                      styles={isReportReady && (!report.disabled || testMode) ? primaryButtonStyles(isDarkMode) : notReadyButtonStyles(isDarkMode)}
                      disabled={!isReportReady || (report.disabled && !testMode)}
                    />
                    <DefaultButton
                      text="Refresh"
                      onClick={refreshMattersScoped}
                      styles={subtleButtonStyles(isDarkMode)}
                      disabled={reportLoadingStates.matters || (report.disabled && !testMode)}
                      iconProps={{ iconName: 'Refresh' }}
                    />
                  </div>
                </div>
              )}

              {report.action === 'enquiries' && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {!isActivelyLoading && (
                    <div style={{
                      width: '100%',
                      borderRadius: 0,
                      padding: 12,
                      background: isDarkMode ? 'rgba(10, 28, 50, 0.5)' : 'rgba(241, 248, 255, 0.6)',
                      border: `0.5px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.22)' : 'rgba(54, 144, 206, 0.18)'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>Enquiries & marketing window</div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                          {enquiriesRangeIsRefreshing
                            ? 'Refreshing…'
                            : enquiriesSliderHasPendingChange
                              ? `Pending: ${describeRangeKey(pendingEnquiriesRangeKey)}`
                              : `Active: ${describeRangeKey(enquiriesRangeKey)}`}
                        </div>
                      </div>
                      <Slider
                        min={0}
                        max={REPORT_RANGE_OPTIONS.length - 1}
                        step={1}
                        value={enquiriesRangeSliderValue}
                        onChange={onEnquiriesSliderChange}
                        showValue={false}
                        disabled={report.disabled && !testMode}
                        styles={{
                          root: { margin: '8px 4px' },
                          activeSection: { background: colours.highlight },
                          thumb: { borderColor: colours.highlight },
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        {REPORT_RANGE_OPTIONS.map((option, index) => (
                          <span
                            key={option.key}
                            style={{
                              fontSize: 10,
                              fontWeight: index === enquiriesRangeSliderValue ? 700 : 500,
                              color: index === enquiriesRangeSliderValue
                                ? colours.highlight
                                : (isDarkMode ? colours.subtleGrey : colours.greyText),
                              transition: 'color 0.2s ease',
                            }}
                          >
                            {option.label}
                          </span>
                        ))}
                      </div>
                      {enquiriesSliderHasPendingChange && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                          <DefaultButton
                            text={`Apply ${describeRangeKey(pendingEnquiriesRangeKey)}`}
                            onClick={onApplyPendingEnquiriesRange}
                            styles={subtleButtonStyles(isDarkMode)}
                            disabled={enquiriesRangeIsRefreshing || (report.disabled && !testMode)}
                            iconProps={{ iconName: 'Play' }}
                          />
                        </div>
                      )}
                      {enquiriesSliderHasPendingChange && (
                        <div style={{
                          marginTop: 8,
                          padding: 8,
                          background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)',
                          borderRadius: 0,
                          fontSize: 12,
                          color: isDarkMode ? colours.dark.text : colours.greyText,
                          fontWeight: 500,
                        }}>
                          Will cover: {describeRangeKey(pendingEnquiriesRangeKey)}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <PrimaryButton
                      text={resolvePrimaryButtonLabel('Open enquiries report')}
                      onClick={() => { if (isReportReady) onNavigateToReport('enquiries'); }}
                      styles={isReportReady ? primaryButtonStyles(isDarkMode) : notReadyButtonStyles(isDarkMode)}
                      disabled={!isReportReady}
                    />
                    <DefaultButton
                      text="Refresh enquiries data"
                      onClick={refreshEnquiriesScoped}
                      styles={subtleButtonStyles(isDarkMode)}
                      disabled={reportLoadingStates.enquiries}
                      iconProps={{ iconName: 'Refresh' }}
                    />
                  </div>
                </div>
              )}

              {report.action === 'metaMetrics' && (
                <>
                  <PrimaryButton
                    text={resolvePrimaryButtonLabel('Open Meta ads')}
                    onClick={() => { if (isReportReady) onNavigateToReport('metaMetrics'); }}
                    styles={isReportReady ? primaryButtonStyles(isDarkMode) : notReadyButtonStyles(isDarkMode)}
                    disabled={!isReportReady}
                  />
                  <DefaultButton
                    text="Refresh Meta data"
                    onClick={refreshMetaMetricsOnly}
                    styles={subtleButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.metaMetrics}
                    iconProps={{ iconName: 'Refresh' }}
                  />
                </>
              )}

              {report.action === 'seoReport' && (
                <>
                  <PrimaryButton
                    text={resolvePrimaryButtonLabel('Open SEO report')}
                    onClick={() => { if ((!report.disabled || testMode) && isReportReady) onNavigateToReport('seoReport'); }}
                    styles={isReportReady && (!report.disabled || testMode) ? primaryButtonStyles(isDarkMode) : notReadyButtonStyles(isDarkMode)}
                    disabled={(report.disabled && !testMode) || !isReportReady}
                  />
                  <DefaultButton
                    text={reportLoadingStates.seoReport ? 'Refreshing…' : 'Refresh'}
                    onClick={refreshGoogleAnalyticsOnly}
                    styles={subtleButtonStyles(isDarkMode)}
                    disabled={reportLoadingStates.seoReport}
                    iconProps={{ iconName: 'Refresh' }}
                  />
                </>
              )}

              {report.action === 'ppcReport' && (
                <>
                  <PrimaryButton
                    text={resolvePrimaryButtonLabel('Open PPC report')}
                    onClick={() => { if ((!report.disabled || testMode) && isReportReady) onNavigateToReport('ppcReport'); }}
                    styles={isReportReady && (!report.disabled || testMode) ? primaryButtonStyles(isDarkMode) : notReadyButtonStyles(isDarkMode)}
                    disabled={(report.disabled && !testMode) || !isReportReady}
                  />
                  <DefaultButton
                    text={reportLoadingStates.ppcReport ? 'Refreshing…' : 'Refresh'}
                    onClick={refreshGoogleAdsOnly}
                    styles={subtleButtonStyles(isDarkMode)}
                    disabled={report.disabled || reportLoadingStates.ppcReport}
                    iconProps={{ iconName: 'Refresh' }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export type { ReportCardData, ReportRangeKey as CardRangeKey };
export default React.memo(ReportCard);
