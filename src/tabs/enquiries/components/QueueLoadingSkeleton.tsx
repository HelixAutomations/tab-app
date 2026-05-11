import React from 'react';
import { colours, withAlpha } from '../../../app/styles/colours';

interface QueueLoadingSkeletonProps {
  variant: 'blocking' | 'inline';
  isDarkMode: boolean;
  /** Set when the skeleton is about to unmount - triggers a fade-out so the swap to live data feels smooth. */
  exiting?: boolean;
}

type QueueSkeletonStyle = React.CSSProperties & {
  '--enq-skeleton-grid': string;
  '--enq-skeleton-base': string;
  '--enq-skeleton-strong': string;
  '--enq-skeleton-line': string;
  '--enq-skeleton-row-border': string;
  '--enq-skeleton-block-border': string;
};

type QueueSkeletonRowStyle = React.CSSProperties & {
  '--enq-skeleton-row-opacity': number;
  '--enq-skeleton-row-delay': string;
};

const QueueLoadingSkeleton: React.FC<QueueLoadingSkeletonProps> = ({ variant, isDarkMode, exiting = false }) => {
  const rowCount = variant === 'blocking' ? 8 : 6;
  const skeletonBase = isDarkMode ? withAlpha(colours.subtleGrey, 0.12) : withAlpha(colours.darkBlue, 0.06);
  const skeletonStrong = isDarkMode ? withAlpha(colours.subtleGrey, 0.22) : withAlpha(colours.darkBlue, 0.12);
  const lineColor = isDarkMode ? withAlpha(colours.subtleGrey, 0.24) : withAlpha(colours.greyText, 0.18);
  const rowBorderColor = isDarkMode ? withAlpha(colours.subtleGrey, 0.16) : withAlpha(colours.subtleGrey, 0.12);
  const rowBorderStrong = isDarkMode ? withAlpha(colours.subtleGrey, 0.28) : withAlpha(colours.subtleGrey, 0.18);
  const blockBorder = isDarkMode ? withAlpha(colours.subtleGrey, 0.18) : withAlpha(colours.darkBlue, 0.08);
  const headerBorder = isDarkMode ? withAlpha(colours.subtleGrey, 0.24) : withAlpha(colours.helixBlue, 0.08);
  // Match the real grid: ID/Area | Date | Contact | Pipeline | Actions
  const skeletonGridColumns = `minmax(clamp(56px, 9vw, 112px), 0.82fr) minmax(clamp(34px, 5vw, 64px), 0.48fr) minmax(clamp(50px, 9vw, 140px), 1.1fr) minmax(clamp(60px, 15vw, 260px), 3.4fr) clamp(32px, 4vw, 56px)`;

  const sBlock = (w: number | string, h: number, strong?: boolean): React.CSSProperties => ({
    width: w,
    height: h,
    background: strong ? skeletonStrong : skeletonBase,
    border: `1px solid ${blockBorder}`,
    boxShadow: 'none',
  });

  const nameWidths = ['74%', '62%', '68%', '82%', '56%', '70%', '64%', '50%'];
  const emailWidths = ['44%', '36%', '48%', '40%', '34%', '46%', '38%', '32%'];
  const idWidths = [50, 44, 48, 40, 46, 52, 42, 54];
  const pipelineLayouts = [
    { top: [64, 52, 44], bottom: [40, 48] },
    { top: [72, 44], bottom: [34, 42, 38] },
    { top: [56, 48, 40, 34], bottom: [44, 36] },
    { top: [68, 46, 38], bottom: [52, 40] },
  ];

  return (
    <div
      className="enq-queue-skeleton"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: variant === 'blocking' ? '0 16px' : '0',
        '--enq-skeleton-grid': skeletonGridColumns,
        '--enq-skeleton-base': skeletonBase,
        '--enq-skeleton-strong': skeletonStrong,
        '--enq-skeleton-line': lineColor,
        '--enq-skeleton-row-border': rowBorderColor,
        '--enq-skeleton-block-border': blockBorder,
      } as QueueSkeletonStyle}
      data-variant={variant}
      data-exiting={exiting ? 'true' : 'false'}
    >
      {/* Skeleton header - mirrors the real sticky header */}
      <div
        className="enq-queue-skeleton__header"
        style={{
          background: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
          borderBottom: `1px solid ${headerBorder}`,
          padding: '0 14px',
          height: 40,
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, minHeight: '100%', padding: '0 2px 0 6px', borderLeft: `2px solid ${lineColor}`, boxSizing: 'border-box' }}>
          <div className="enq-queue-skeleton__block enq-queue-skeleton__dot" style={sBlock(10, 10)} />
          <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(24, 8)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <div className="enq-queue-skeleton__block enq-queue-skeleton__block--strong" style={sBlock(26, 8, true)} />
          <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(8, 8)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <div className="enq-queue-skeleton__block enq-queue-skeleton__block--strong" style={sBlock(54, 8, true)} />
          <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(8, 8)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
          {[38, 44, 34, 42, 36].map((width, idx) => (
            <div
              key={`header-pipeline-${idx}`}
              className={`enq-queue-skeleton__block ${idx < 2 ? 'enq-queue-skeleton__block--strong' : 'enq-queue-skeleton__block--base'}`}
              style={sBlock(width, 16, idx < 2)}
            />
          ))}
        </div>
        <div className="enq-queue-skeleton__actions">
          <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(16, 16)} />
        </div>
      </div>

      {/* Skeleton rows - same grid, padding, height as real prospect-row */}
      {Array.from({ length: rowCount }, (_, idx) => {
        const isLastInGroup = idx === 2 || idx === 5;
        const rowDelay = idx * 0.06;
        const pipelineLayout = pipelineLayouts[idx % pipelineLayouts.length];
        return (
          <div
            key={`${variant}-skel-${idx}`}
            className="enq-queue-skeleton__row"
            style={{
              borderBottom: isLastInGroup
                ? `1px solid ${rowBorderStrong}`
                : `0.5px solid ${rowBorderColor}`,
              '--enq-skeleton-row-opacity': Math.max(0.52, 1 - idx * 0.07),
              '--enq-skeleton-row-delay': `${rowDelay}s`,
              padding: '8px 14px',
              gap: 4,
            } as QueueSkeletonRowStyle}
          >
            {/* Col 1: ID + AoW icon */}
            <div className="enq-queue-skeleton__meta" style={{ minHeight: '100%', padding: '0 2px 0 6px', borderLeft: `2px solid ${lineColor}`, boxSizing: 'border-box' }}>
              <div className="enq-queue-skeleton__block enq-queue-skeleton__dot" style={sBlock(14, 14)} />
              <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(idWidths[idx % idWidths.length], 10)} />
            </div>

            {/* Col 2: Date */}
            <div className="enq-queue-skeleton__stack">
              <div className="enq-queue-skeleton__block enq-queue-skeleton__block--strong" style={sBlock(idx % 2 === 0 ? 28 : 24, 11, true)} />
              <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(idx % 2 === 0 ? 32 : 26, 9)} />
            </div>

            {/* Col 3: Contact name + email */}
            <div className="enq-queue-skeleton__stack enq-queue-skeleton__stack--contact">
              <div className="enq-queue-skeleton__block enq-queue-skeleton__block--strong" style={sBlock(nameWidths[idx % nameWidths.length], 13, true)} />
              <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(emailWidths[idx % emailWidths.length], 9)} />
            </div>

            {/* Col 4: Pipeline stages */}
            <div className="enq-queue-skeleton__stack" style={{ gap: 6 }}>
              <div className="enq-queue-skeleton__chips" style={{ flexWrap: 'wrap', rowGap: 6 }}>
                {pipelineLayout.top.map((width, chipIdx) => (
                  <div
                    key={`top-${chipIdx}`}
                    className={`enq-queue-skeleton__block ${chipIdx === 0 ? 'enq-queue-skeleton__block--strong' : 'enq-queue-skeleton__block--base'}`}
                    style={sBlock(width, 18, chipIdx === 0)}
                  />
                ))}
              </div>
              <div className="enq-queue-skeleton__chips" style={{ flexWrap: 'wrap', rowGap: 6 }}>
                {pipelineLayout.bottom.map((width, chipIdx) => (
                  <div
                    key={`bottom-${chipIdx}`}
                    className="enq-queue-skeleton__block enq-queue-skeleton__block--base"
                    style={sBlock(width, 16)}
                  />
                ))}
              </div>
            </div>

            {/* Col 5: Row actions */}
            <div className="enq-queue-skeleton__actions">
              <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(18, 18)} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(QueueLoadingSkeleton);