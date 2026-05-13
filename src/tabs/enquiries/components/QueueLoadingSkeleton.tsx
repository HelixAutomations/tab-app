import React from 'react';
import { colours, withAlpha } from '../../../app/styles/colours';

interface QueueLoadingSkeletonProps {
  variant: 'blocking' | 'inline';
  isDarkMode: boolean;
  /** Set when the skeleton is about to unmount - triggers a fade-out so the swap to live data feels smooth. */
  exiting?: boolean;
  /** Mirror the real table's actions column width (locked by default). */
  actionsEnabled?: boolean;
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
  '--enq-skeleton-aow-color': string;
};

const QueueLoadingSkeleton: React.FC<QueueLoadingSkeletonProps> = ({ variant, isDarkMode, exiting = false, actionsEnabled = false }) => {
  const rowCount = variant === 'blocking' ? 8 : 6;
  const skeletonBase = isDarkMode ? withAlpha(colours.subtleGrey, 0.12) : withAlpha(colours.darkBlue, 0.06);
  const skeletonStrong = isDarkMode ? withAlpha(colours.subtleGrey, 0.22) : withAlpha(colours.darkBlue, 0.12);
  const lineColor = isDarkMode ? withAlpha(colours.subtleGrey, 0.24) : withAlpha(colours.greyText, 0.18);
  const rowBorderColor = isDarkMode ? withAlpha(colours.subtleGrey, 0.16) : withAlpha(colours.subtleGrey, 0.12);
  const rowBorderStrong = isDarkMode ? withAlpha(colours.subtleGrey, 0.28) : withAlpha(colours.subtleGrey, 0.18);
  const blockBorder = isDarkMode ? withAlpha(colours.subtleGrey, 0.18) : withAlpha(colours.darkBlue, 0.08);
  const headerBorder = isDarkMode ? withAlpha(colours.subtleGrey, 0.24) : withAlpha(colours.helixBlue, 0.08);
  const ghostBorder = withAlpha(colours.subtleGrey, isDarkMode ? 0.18 : 0.16);

  // Mirror getTableGridTemplateColumns() in Enquiries.tsx exactly:
  //   timeline | date | identity (AOW + ID) | contact | pipeline | actions
  const actionsTrack = actionsEnabled
    ? 'clamp(80px, 14vw, 188px)'
    : 'clamp(32px, 4vw, 56px)';
  const skeletonGridColumns =
    `clamp(20px, 4vw, 36px) minmax(clamp(28px, 5vw, 60px), 0.45fr) minmax(clamp(44px, 7vw, 88px), 0.6fr) minmax(clamp(50px, 9vw, 140px), 1.1fr) minmax(clamp(60px, 15vw, 260px), 3.4fr) ${actionsTrack}`;

  const sBlock = (w: number | string, h: number, strong?: boolean): React.CSSProperties => ({
    width: w,
    height: h,
    background: strong ? skeletonStrong : skeletonBase,
    border: `1px solid ${blockBorder}`,
    boxShadow: 'none',
  });

  // Real-row geometry the skeleton mirrors (sampled from .prospect-row in Prospects):
  //   col1 ~36px timeline strip
  //   col2 date stack: top "DD MMM" (11px bold) + bottom "HH:MM" (9px)
  //   col3 identity: 17x17 AoW glyph + 30-44px ID text
  //   col4 contact: name 12px + email 9px stacked, left-aligned
  //   col5 pipeline: 7-track grid, chip pills ~22px tall, varied fill state
  //   col6 actions: 22x22 chevron square, right-aligned
  const aowAccents = [colours.blue, colours.orange, colours.green, colours.yellow, colours.greyText, colours.blue];
  const idWidths = [38, 32, 42, 36, 30, 44, 34, 40];
  const dateTopWidths = [30, 28, 32, 26, 30, 28, 32, 26];
  const dateBottomWidths = [22, 24, 22, 26, 22, 24, 22, 26];
  const nameWidths = ['72%', '60%', '68%', '82%', '54%', '70%', '64%', '50%'];
  const emailWidths = ['56%', '48%', '62%', '52%', '46%', '60%', '50%', '44%'];
  const chipPatterns: Array<Array<'strong' | 'base' | 'ghost'>> = [
    ['strong', 'base',  'ghost', 'ghost', 'ghost', 'ghost', 'ghost'],
    ['strong', 'strong','base',  'ghost', 'ghost', 'ghost', 'ghost'],
    ['strong', 'strong','strong','base',  'ghost', 'ghost', 'ghost'],
    ['strong', 'strong','strong','strong','base',  'ghost', 'ghost'],
    ['strong', 'strong','strong','strong','strong','base',  'ghost'],
    ['strong', 'strong','strong','strong','strong','strong','base'],
  ];

  return (
    <div
      className="enq-queue-skeleton"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        '--enq-skeleton-grid': skeletonGridColumns,
        '--enq-skeleton-base': skeletonBase,
        '--enq-skeleton-strong': skeletonStrong,
        '--enq-skeleton-line': lineColor,
        '--enq-skeleton-row-border': rowBorderColor,
        '--enq-skeleton-block-border': blockBorder,
      } as QueueSkeletonStyle}
      data-variant={variant}
      data-exiting={exiting ? 'true' : 'false'}
      aria-hidden="true"
    >
      {/* Header — mirrors the sticky 6-track header (timeline | Date | #ID | Prospect | Pipeline | actions) */}
      <div
        className="enq-queue-skeleton__header"
        style={{
          background: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
          borderBottom: `1px solid ${headerBorder}`,
        }}
      >
        <div className="enq-queue-skeleton__head-cell enq-queue-skeleton__head-cell--center">
          <div style={{ width: 1, height: 14, background: lineColor, opacity: 0.48 }} />
        </div>
        <div className="enq-queue-skeleton__head-cell">
          <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(28, 8)} />
        </div>
        <div className="enq-queue-skeleton__head-cell">
          <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(20, 8)} />
        </div>
        <div className="enq-queue-skeleton__head-cell">
          <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(48, 8)} />
        </div>
        <div className="enq-queue-skeleton__head-cell">
          <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(48, 8)} />
        </div>
        <div className="enq-queue-skeleton__head-cell enq-queue-skeleton__head-cell--center">
          <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(14, 8)} />
        </div>
      </div>

      {Array.from({ length: rowCount }, (_, idx) => {
        const isLastInGroup = idx === 2 || idx === 5;
        const rowDelay = idx * 0.06;
        const aowColor = aowAccents[idx % aowAccents.length];
        const chipRow = chipPatterns[idx % chipPatterns.length];
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
              '--enq-skeleton-aow-color': aowColor,
            } as QueueSkeletonRowStyle}
          >
            {/* Col 1: Timeline strip */}
            <div className="enq-queue-skeleton__timeline">
              <div className="enq-queue-skeleton__timeline-line" style={{ opacity: 0.72 + (idx % 3) * 0.08 }} />
            </div>

            {/* Col 2: Date stack */}
            <div className="enq-queue-skeleton__date">
              <div className="enq-queue-skeleton__block enq-queue-skeleton__block--strong" style={sBlock(dateTopWidths[idx % dateTopWidths.length], 11, true)} />
              <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(dateBottomWidths[idx % dateBottomWidths.length], 9)} />
            </div>

            {/* Col 3: Identity (AOW glyph 17x17 + ID text), with brand left border like real .enquiry-row__identity */}
            <div
              className="enq-queue-skeleton__identity"
              style={{
                borderLeft: `2px solid ${withAlpha(colours.highlight, isDarkMode ? 0.45 : 0.55)}`,
              }}
            >
              <div
                className="enq-queue-skeleton__aow-glyph"
                style={{
                  background: withAlpha(aowColor, isDarkMode ? 0.20 : 0.16),
                  border: `1px solid ${withAlpha(aowColor, isDarkMode ? 0.45 : 0.32)}`,
                }}
              />
              <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(idWidths[idx % idWidths.length], 10)} />
            </div>

            {/* Col 4: Contact stack */}
            <div className="enq-queue-skeleton__contact">
              <div className="enq-queue-skeleton__block enq-queue-skeleton__block--strong" style={sBlock(nameWidths[idx % nameWidths.length], 12, true)} />
              <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(emailWidths[idx % emailWidths.length], 9)} />
            </div>

            {/* Col 5: Pipeline 7-track grid */}
            <div className="enq-queue-skeleton__pipeline">
              {chipRow.map((tone, chipIdx) => (
                <div key={`pipe-${chipIdx}`} className="enq-queue-skeleton__pipe-cell">
                  <div
                    className={`enq-queue-skeleton__chip enq-queue-skeleton__chip--${tone}`}
                    style={{
                      background: tone === 'ghost'
                        ? 'transparent'
                        : (tone === 'strong' ? skeletonStrong : skeletonBase),
                      border: `1px solid ${tone === 'ghost' ? ghostBorder : blockBorder}`,
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Col 6: Actions chevron */}
            <div className="enq-queue-skeleton__actions">
              <div className="enq-queue-skeleton__block enq-queue-skeleton__block--base" style={sBlock(22, 22)} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(QueueLoadingSkeleton);
