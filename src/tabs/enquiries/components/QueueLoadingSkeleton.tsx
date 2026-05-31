import React from 'react';

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
};

const QueueLoadingSkeleton: React.FC<QueueLoadingSkeletonProps> = ({ variant, isDarkMode, exiting = false, actionsEnabled = false }) => {
  const rowCount = variant === 'blocking' ? 8 : 6;

  // Mirror getTableGridTemplateColumns() in Enquiries.tsx exactly:
  //   timeline | date | identity (AOW + ID) | contact | pipeline | actions
  const actionsTrack = actionsEnabled
    ? 'clamp(80px, 14vw, 188px)'
    : 'clamp(32px, 4vw, 56px)';
  const skeletonGridColumns =
    `clamp(20px, 4vw, 36px) minmax(clamp(28px, 5vw, 60px), 0.45fr) minmax(clamp(44px, 7vw, 88px), 0.6fr) minmax(clamp(50px, 9vw, 140px), 1.1fr) minmax(clamp(60px, 15vw, 260px), 3.4fr) ${actionsTrack}`;

  return (
    <div
      className={`enq-queue-skeleton${isDarkMode ? ' dark-theme' : ''}`}
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        '--enq-skeleton-grid': skeletonGridColumns,
      } as QueueSkeletonStyle}
      data-variant={variant}
      data-exiting={exiting ? 'true' : 'false'}
      aria-hidden="true"
    >
      {/* Header — real labels on Helix blue, mirrors .prospect-table-header */}
      <div className="enq-queue-skeleton__header">
        <span className="enq-queue-skeleton__head-cell enq-queue-skeleton__head-cell--center" />
        <span className="enq-queue-skeleton__head-cell">DATE</span>
        <span className="enq-queue-skeleton__head-cell">ID</span>
        <span className="enq-queue-skeleton__head-cell">PROSPECT</span>
        <span className="enq-queue-skeleton__head-cell">PIPELINE</span>
        <span className="enq-queue-skeleton__head-cell enq-queue-skeleton__head-cell--center" />
      </div>

      {Array.from({ length: rowCount }, (_, idx) => (
        <div key={`${variant}-skel-${idx}`} className="enq-queue-skeleton__row">
          {/* Col 1: timeline spacer */}
          <span className="enq-queue-skeleton__timeline" />

          {/* Col 2: date */}
          <span className="enq-queue-skeleton__cell enq-queue-skeleton__cell--date">
            <span className="skeleton-shimmer enq-queue-skeleton__pill enq-queue-skeleton__pill--date" />
          </span>

          {/* Col 3: ID */}
          <span className="enq-queue-skeleton__cell">
            <span className="skeleton-shimmer enq-queue-skeleton__pill enq-queue-skeleton__pill--id" />
          </span>

          {/* Col 4: prospect (contact) */}
          <span className="enq-queue-skeleton__cell">
            <span className="skeleton-shimmer enq-queue-skeleton__pill enq-queue-skeleton__pill--contact" />
          </span>

          {/* Col 5: pipeline strip — 7 tracks, mirrors live chip grid */}
          <span className="enq-queue-skeleton__pipeline">
            {Array.from({ length: 7 }).map((_, chipIdx) => (
              <span key={`pipe-${chipIdx}`} className="skeleton-shimmer enq-queue-skeleton__chip" />
            ))}
          </span>

          {/* Col 6: actions */}
          <span className="enq-queue-skeleton__cell enq-queue-skeleton__cell--actions">
            <span className="skeleton-shimmer enq-queue-skeleton__pill enq-queue-skeleton__pill--actions" />
          </span>
        </div>
      ))}
    </div>
  );
};

export default React.memo(QueueLoadingSkeleton);
