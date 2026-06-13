import React from 'react';
import type { CSSProperties } from 'react';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { colours } from '../../../app/styles/colours';

export type ReportProcessingRailStatus = 'idle' | 'loading' | 'ready' | 'error' | 'blocked' | 'warn';

export interface ReportProcessingRailRow {
  key: string;
  label: string;
  status: ReportProcessingRailStatus;
  detail?: string;
  count?: string | number | null;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
}

export interface ReportProcessingRailProps {
  isDarkMode: boolean;
  title: string;
  subtitle?: string;
  status: ReportProcessingRailStatus;
  rows: ReportProcessingRailRow[];
  ctaLabel: string;
  ctaDisabled?: boolean;
  onCta?: () => void;
  detail?: string;
  elapsedLabel?: string | null;
  items?: ReportProcessingRailItem[];
}

export interface ReportProcessingRailItem {
  key: string;
  title: string;
  subtitle?: string;
  status: ReportProcessingRailStatus;
  rows: ReportProcessingRailRow[];
  ctaLabel: string;
  ctaDisabled?: boolean;
  onCta?: () => void;
  secondaryCtaLabel?: string;
  secondaryCtaDisabled?: boolean;
  onSecondaryCta?: () => void;
  detail?: string;
  elapsedLabel?: string | null;
  visualIcon?: string;
}

const statusMeta = (status: ReportProcessingRailStatus) => {
  switch (status) {
    case 'ready':
      return { label: 'Success', colour: colours.green, icon: 'CheckMark' };
    case 'loading':
      return { label: 'In progress', colour: colours.highlight, icon: 'Sync' };
    case 'error':
      return { label: 'Attention', colour: colours.cta, icon: 'Warning' };
    case 'blocked':
      return { label: 'Held', colour: colours.cta, icon: 'Blocked' };
    case 'warn':
      return { label: 'Review', colour: colours.orange, icon: 'Info' };
    case 'idle':
    default:
      return { label: 'Waiting', colour: colours.subtleGrey, icon: 'Clock' };
  }
};

const surfaceStyle = (isDarkMode: boolean, expanded: boolean): CSSProperties => ({
  position: 'sticky',
  top: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  width: expanded ? 340 : 76,
  maxWidth: '100%',
  minWidth: 0,
  marginLeft: 'auto',
  backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
  border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
  borderRadius: 0,
  boxShadow: isDarkMode ? '0 14px 34px rgba(0, 3, 25, 0.34)' : '0 16px 36px rgba(6, 23, 51, 0.09)',
  overflow: 'hidden',
  fontFamily: 'Raleway, sans-serif',
  animation: 'fadeInUp 0.28s ease forwards',
});

const badgeStyle = (status: ReportProcessingRailStatus, isDarkMode: boolean): CSSProperties => {
  const meta = statusMeta(status);
  const background = status === 'ready'
    ? (isDarkMode ? 'rgba(32, 178, 108, 0.16)' : 'rgba(32, 178, 108, 0.12)')
    : status === 'loading'
      ? (isDarkMode ? 'rgba(54, 144, 206, 0.20)' : 'rgba(54, 144, 206, 0.12)')
      : status === 'idle'
        ? (isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(6, 23, 51, 0.05)')
        : status === 'warn'
          ? (isDarkMode ? 'rgba(255, 140, 0, 0.18)' : 'rgba(255, 140, 0, 0.12)')
          : (isDarkMode ? 'rgba(214, 85, 65, 0.18)' : 'rgba(214, 85, 65, 0.12)');
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    minHeight: 24,
    borderRadius: 0,
    backgroundColor: background,
    color: meta.colour,
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  };
};

export interface ReportProcessingRailItemCardProps {
  isDarkMode: boolean;
  item: ReportProcessingRailItem;
  /** When true, the outer surface drops borders/shadow so the card can sit inside a grid as-is. */
  embedded?: boolean;
  /** Drops the embedded card frame when the parent already owns the surface. */
  flushEmbedded?: boolean;
  /** Shows only the summary header while the full breakdown is folded. */
  compact?: boolean;
  /** Click anywhere on the inert header. Useful when the embedded card doubles as a tile to trigger preparation. */
  onSurfaceClick?: () => void;
  surfaceTitle?: string;
}

export const ReportProcessingRailItemCard: React.FC<ReportProcessingRailItemCardProps> = ({
  isDarkMode,
  item,
  embedded = false,
  flushEmbedded = false,
  compact = false,
  onSurfaceClick,
  surfaceTitle,
}) => {
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textBody = isDarkMode ? '#d1d5db' : '#374151';
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const border = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
  const itemMeta = statusMeta(item.status);
  const iconName = item.status === 'ready' ? 'CheckMark' : item.visualIcon || itemMeta.icon;
  const surfaceStyleEmbedded: CSSProperties = embedded
    ? {
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
      border: flushEmbedded ? 'none' : `1px solid ${border}`,
      borderRadius: 0,
      boxShadow: flushEmbedded ? 'none' : (isDarkMode ? '0 14px 34px rgba(0, 3, 25, 0.28)' : '0 16px 36px rgba(6, 23, 51, 0.08)'),
      overflow: 'hidden',
      cursor: onSurfaceClick ? 'pointer' : 'default',
      transition: 'border-color 0.32s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.32s cubic-bezier(0.22, 1, 0.36, 1), transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)',
      fontFamily: 'Raleway, sans-serif',
      color: textPrimary,
    }
    : { display: 'contents' };
  const surfaceProps: React.HTMLAttributes<HTMLDivElement> = embedded && onSurfaceClick
    ? {
      onClick: onSurfaceClick,
      role: 'button',
      tabIndex: 0,
      onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSurfaceClick();
        }
      },
      onMouseEnter: (event: React.MouseEvent<HTMLDivElement>) => {
        event.currentTarget.style.borderColor = colours.highlight;
        event.currentTarget.style.transform = 'translateY(-1px)';
      },
      onMouseLeave: (event: React.MouseEvent<HTMLDivElement>) => {
        event.currentTarget.style.borderColor = border;
        event.currentTarget.style.transform = 'translateY(0)';
      },
      title: surfaceTitle,
    }
    : {};

  return (
    <div style={surfaceStyleEmbedded} {...surfaceProps}>
      <div style={{
        display: 'flex',
        gap: 12,
        padding: compact ? '12px 76px 12px 14px' : '16px 76px 14px 16px',
        backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.grey,
        borderBottom: compact ? `0 solid ${border}` : `1px solid ${border}`,
        transition: 'padding 320ms cubic-bezier(0.22, 1, 0.36, 1), border-bottom-width 320ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: compact ? 32 : 36,
          height: compact ? 32 : 36,
          flex: '0 0 auto',
          color: itemMeta.colour,
          backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardBackground,
          border: `1px solid ${border}`,
          borderRadius: 0,
          boxShadow: `inset 0 -2px 0 ${itemMeta.colour}`,
          transition: 'color 0.32s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
        }}>
          <span key={item.status} style={{ display: 'inline-flex', animation: 'helix-status-pop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}>
            <FontIcon iconName={iconName} style={{ fontSize: 15, animation: item.status === 'loading' ? 'spin 1.1s linear infinite' : undefined }} />
          </span>
        </span>
        <span style={{ display: 'block', minWidth: 0, flex: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 15, lineHeight: 1.25, fontWeight: 800, color: textPrimary }}>{item.title}</span>
          </span>
          {item.subtitle && (
            <span style={{ display: compact ? 'none' : 'block', fontSize: 12, lineHeight: 1.45, color: textBody }}>{item.subtitle}</span>
          )}
          {compact && (
            <span style={{ display: 'block', marginTop: 3 }}>
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: textBody }}>
                {item.status === 'loading' ? 'Feed check running' : itemMeta.label}
                {item.elapsedLabel ? ` / ${item.elapsedLabel}` : ''}
              </span>
              {item.secondaryCtaLabel && item.onSecondaryCta && (
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); item.onSecondaryCta?.(); }}
                  disabled={item.secondaryCtaDisabled}
                  style={{
                    appearance: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 24,
                    marginTop: 7,
                    padding: '0 8px',
                    cursor: item.secondaryCtaDisabled ? 'not-allowed' : 'pointer',
                    color: item.secondaryCtaDisabled ? textMuted : colours.highlight,
                    backgroundColor: 'transparent',
                    border: `1px solid ${item.secondaryCtaDisabled ? border : colours.highlight}`,
                    borderRadius: 0,
                    fontFamily: 'Raleway, sans-serif',
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {item.secondaryCtaLabel}
                </button>
              )}
            </span>
          )}
          <span
            style={{
              display: compact ? 'none' : 'block',
              marginTop: 5,
              fontSize: 10,
              fontWeight: 700,
              color: textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              minHeight: 14,
              visibility: item.elapsedLabel ? 'visible' : 'hidden',
              transition: 'opacity 0.28s ease',
              opacity: item.elapsedLabel ? 1 : 0,
            }}
          >
            {item.elapsedLabel || '\u00A0'}
          </span>
        </span>
      </div>

      <div style={{
        maxHeight: compact ? 0 : 480,
        opacity: compact ? 0 : 1,
        overflow: 'hidden',
        padding: compact ? '0 0' : '12px 0',
        transition: 'max-height 340ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease, padding 320ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(120px, 1fr) auto minmax(48px, auto)',
          columnGap: 10,
          padding: '0 14px 8px',
          color: textMuted,
          fontSize: 10,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          <span>Feed</span>
          <span>Status</span>
          <span style={{ textAlign: 'right' }}>Detail</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {item.rows.map((row, index) => {
            const rowMeta = statusMeta(row.status);
            const showPulse = row.status === 'loading';
            return (
              <div
                key={row.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(120px, 1fr) auto minmax(48px, auto)',
                  columnGap: 10,
                  alignItems: 'center',
                  minHeight: 48,
                  padding: '8px 14px',
                  borderTop: index === 0 ? 'none' : `1px solid ${border}`,
                  animation: `fadeInUp 0.22s ease ${index * 45}ms both`,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      backgroundColor: rowMeta.colour,
                      flex: '0 0 auto',
                      boxShadow: showPulse ? `0 0 0 0 ${rowMeta.colour}66` : `0 0 0 2px ${isDarkMode ? colours.dark.cardHover : colours.grey}`,
                      animation: showPulse ? 'helix-pulse-dot 1.4s ease-in-out infinite' : undefined,
                    }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: textPrimary }}>
                      {row.label}
                    </span>
                    {row.detail && (
                      <span style={{ display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, color: textMuted }}>
                        {row.detail}
                      </span>
                    )}
                  </span>
                </span>
                <span style={badgeStyle(row.status, isDarkMode)}>
                  <FontIcon iconName={rowMeta.icon} style={{ fontSize: 10, animation: showPulse ? 'spin 1.1s linear infinite' : undefined }} />
                  {rowMeta.label}
                </span>
                <span style={{ textAlign: 'right', color: textPrimary, fontSize: 12, fontWeight: 800 }}>
                  {row.actionLabel && row.onAction ? (
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); row.onAction?.(); }}
                      disabled={row.actionDisabled}
                      style={{
                        appearance: 'none',
                        minHeight: 28,
                        padding: '0 8px',
                        cursor: row.actionDisabled ? 'not-allowed' : 'pointer',
                        color: row.actionDisabled ? textMuted : colours.highlight,
                        backgroundColor: 'transparent',
                        border: `1px solid ${row.actionDisabled ? border : colours.highlight}`,
                        borderRadius: 0,
                        fontFamily: 'Raleway, sans-serif',
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {row.actionLabel}
                    </button>
                  ) : row.count != null ? row.count : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxHeight: compact ? 0 : 140,
        opacity: compact ? 0 : 1,
        overflow: 'hidden',
        padding: compact ? '0 16px' : '14px 16px 16px',
        borderTop: compact ? `0 solid ${border}` : `1px solid ${border}`,
        backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.grey,
        transition: 'max-height 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease, padding 320ms cubic-bezier(0.22, 1, 0.36, 1), border-top-width 320ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.45,
            color: textBody,
            minHeight: 34,
            transition: 'opacity 0.32s ease',
            opacity: item.detail ? 1 : 0,
          }}
        >
          {item.detail || '\u00A0'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); item.onCta?.(); }}
            disabled={item.ctaDisabled || !item.onCta}
            style={{
              appearance: 'none',
              minHeight: 42,
              cursor: item.ctaDisabled || !item.onCta ? 'not-allowed' : 'pointer',
              padding: '0 14px',
              fontFamily: 'Raleway, sans-serif',
              fontSize: 13,
              fontWeight: 800,
              color: item.ctaDisabled || !item.onCta ? textMuted : (isDarkMode ? colours.dark.text : colours.light.text),
              backgroundColor: item.ctaDisabled || !item.onCta ? (isDarkMode ? colours.dark.border : colours.light.disabledBackground) : (isDarkMode ? 'rgba(32, 178, 108, 0.16)' : 'rgba(32, 178, 108, 0.10)'),
              borderStyle: 'solid',
              borderWidth: 1,
              borderColor: item.ctaDisabled || !item.onCta ? border : colours.green,
              borderRadius: 0,
              transition: 'background-color 0.32s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.32s cubic-bezier(0.22, 1, 0.36, 1), color 0.32s cubic-bezier(0.22, 1, 0.36, 1), transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {item.ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

const ReportProcessingRail: React.FC<ReportProcessingRailProps> = ({
  isDarkMode,
  title,
  subtitle,
  status,
  rows,
  ctaLabel,
  ctaDisabled = false,
  onCta,
  detail,
  elapsedLabel,
  items,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textBody = isDarkMode ? '#d1d5db' : '#374151';
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const border = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
  const queue = (items && items.length > 0)
    ? items
    : [{ key: 'active', title, subtitle, status, rows, ctaLabel, ctaDisabled, onCta, detail, elapsedLabel }];
  const overallStatus: ReportProcessingRailStatus = queue.some((item) => item.status === 'loading')
    ? 'loading'
    : queue.some((item) => item.status === 'error' || item.status === 'blocked')
      ? 'error'
      : queue.some((item) => item.status === 'warn')
        ? 'warn'
        : queue.length > 0 && queue.every((item) => item.status === 'ready')
          ? 'ready'
          : 'idle';
  const meta = statusMeta(overallStatus);
  const activeCount = queue.filter((item) => item.status === 'loading' || item.status === 'idle').length;
  const readyCount = queue.filter((item) => item.status === 'ready').length;
  const attentionCount = queue.length - activeCount - readyCount;
  const queueSummary = activeCount > 0
    ? `${activeCount} preparing`
    : attentionCount > 0
      ? `${attentionCount} need review`
      : `${readyCount} ready`;

  return (
    <aside data-helix-region="reports/processing-rail" style={surfaceStyle(isDarkMode, expanded)} aria-live="polite">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        style={{
          appearance: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: expanded ? 'space-between' : 'center',
          gap: expanded ? 12 : 0,
          width: '100%',
          minHeight: expanded ? 44 : 54,
          padding: expanded ? '10px 12px' : '10px 8px',
          cursor: 'pointer',
          fontFamily: 'Raleway, sans-serif',
          color: textPrimary,
          backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.grey,
          border: 'none',
          borderBottom: expanded ? `1px solid ${border}` : 'none',
        }}
      >
        {expanded ? (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {queue.slice(0, 5).map((item) => {
                  const dotMeta = statusMeta(item.status);
                  return (
                    <span
                      key={item.key}
                      title={`${item.title}: ${dotMeta.label}`}
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: dotMeta.colour,
                        boxShadow: item.status === 'loading' ? `0 0 0 0 ${dotMeta.colour}66` : `0 0 0 2px ${isDarkMode ? colours.dark.cardHover : colours.light.cardBackground}`,
                        animation: item.status === 'loading' ? 'helix-pulse-dot 1.4s ease-in-out infinite' : undefined,
                      }}
                    />
                  );
                })}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: textMuted }}>
                  Report queue
                </span>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1, fontSize: 12, fontWeight: 700, color: textPrimary }}>
                  {queueSummary}
                </span>
              </span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: meta.colour, fontSize: 11, fontWeight: 800 }}>
              {meta.label}
              <FontIcon iconName="ChevronUp" style={{ fontSize: 11, color: textMuted }} />
            </span>
          </>
        ) : (
          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: meta.colour }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              {queue.slice(0, 3).map((item) => {
                const dotMeta = statusMeta(item.status);
                return (
                  <span
                    key={item.key}
                    title={`${item.title}: ${dotMeta.label}`}
                    aria-hidden="true"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      backgroundColor: dotMeta.colour,
                      animation: item.status === 'loading' ? 'helix-pulse-dot 1.4s ease-in-out infinite' : undefined,
                    }}
                  />
                );
              })}
            </span>
            <FontIcon iconName="ChevronLeft" style={{ fontSize: 11, color: textMuted }} />
          </span>
        )}
      </button>

      {!expanded ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '12px 10px 14px' }}>
          {queue.map((item) => {
            const itemMeta = statusMeta(item.status);
            const iconName = item.status === 'ready' ? 'CheckMark' : item.visualIcon || itemMeta.icon;
            return (
              <span
                key={item.key}
                title={`${item.title}: ${itemMeta.label}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  color: itemMeta.colour,
                  backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.cardBackground,
                  border: `1px solid ${border}`,
                }}
              >
                <FontIcon iconName={iconName} style={{ fontSize: 12, animation: item.status === 'loading' ? 'spin 1.1s linear infinite' : undefined }} />
              </span>
            );
          })}
        </div>
      ) : queue.map((item, itemIndex) => (
        <div key={item.key} style={{ borderTop: itemIndex === 0 ? 'none' : `1px solid ${border}` }}>
          <ReportProcessingRailItemCard isDarkMode={isDarkMode} item={item} />
        </div>
      ))}
    </aside>
  );
};

export default ReportProcessingRail;
