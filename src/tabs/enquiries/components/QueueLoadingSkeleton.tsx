import React from 'react';
import { colours } from '../../../app/styles/colours';

interface QueueLoadingSkeletonProps {
  variant: 'blocking' | 'inline';
  isDarkMode: boolean;
}

const QueueLoadingSkeleton: React.FC<QueueLoadingSkeletonProps> = ({ variant, isDarkMode }) => {
  const rowCount = variant === 'blocking' ? 8 : 6;
  const skeletonBase = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(6,23,51,0.04)';
  const skeletonStrong = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(6,23,51,0.08)';
  const shimmerTone = isDarkMode ? 'rgba(255,255,255,0.10)' : 'rgba(6,23,51,0.06)';
  const lineColor = isDarkMode ? 'rgba(135,243,243,0.25)' : 'rgba(54,144,206,0.18)';
  const rowBorderColor = isDarkMode ? 'rgba(75, 85, 99, 0.18)' : 'rgba(0, 0, 0, 0.05)';
  // Match the real grid: Timeline | Date | ID/Value | Contact | Pipeline | Actions
  const skeletonGridColumns = `clamp(16px, 3vw, 28px) minmax(clamp(28px, 5vw, 64px), 0.5fr) minmax(clamp(56px, 9vw, 112px), 0.95fr) minmax(clamp(50px, 10vw, 160px), 1.3fr) minmax(clamp(60px, 15vw, 260px), 3.1fr) clamp(32px, 4vw, 56px)`;

  const sBlock = (w: number | string, h: number, delay: number, strong?: boolean): React.CSSProperties => ({
    width: w,
    height: h,
    background: `linear-gradient(90deg, ${strong ? skeletonStrong : skeletonBase} 0%, ${shimmerTone} 50%, ${strong ? skeletonStrong : skeletonBase} 100%)`,
    backgroundSize: '220% 100%',
    animation: `enq-skeleton-breathe 2.4s ease-in-out infinite`,
    animationDelay: `${delay}s`,
  });

  // Vary widths per row so skeletons look organic, not stamped
  const nameWidths = ['72%', '58%', '65%', '80%', '52%', '70%', '62%', '48%'];
  const idWidths = [48, 42, 52, 38, 46, 50, 40, 44];
  const chipCounts = [3, 2, 4, 2, 3, 1, 3, 2];

  return (
    <div style={{
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: variant === 'blocking' ? '0 16px' : '0',
    }}>
      {/* Skeleton header — mirrors the real sticky header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: skeletonGridColumns,
        gap: 8,
        padding: '0 16px',
        height: 44,
        alignItems: 'center',
        background: isDarkMode ? colours.darkBlue : colours.light.cardBackground,
        borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
      }}>
        <div style={sBlock(12, 12, 0)} />
        <div style={sBlock(32, 8, 0.05)} />
        <div style={sBlock(28, 8, 0.1)} />
        <div style={sBlock(44, 8, 0.15)} />
        <div style={sBlock(48, 8, 0.2)} />
        <div />
      </div>

      {/* Skeleton rows — same grid, padding, height as real prospect-row */}
      {Array.from({ length: rowCount }, (_, idx) => {
        const isLastInGroup = idx === 2 || idx === 5;
        const rowDelay = idx * 0.06;
        return (
          <div
            key={`${variant}-skel-${idx}`}
            style={{
              display: 'grid',
              gridTemplateColumns: skeletonGridColumns,
              gap: 'clamp(4px, 0.8vw, 8px)',
              padding: 'clamp(6px, 0.8vw, 8px) clamp(8px, 1.2vw, 14px)',
              alignItems: 'center',
              borderBottom: isLastInGroup
                ? `1px solid ${isDarkMode ? 'rgba(75,85,99,0.35)' : 'rgba(0,0,0,0.09)'}`
                : `0.5px solid ${rowBorderColor}`,
              opacity: Math.max(0.4, 1 - idx * 0.08),
              animation: 'fadeIn 0.2s ease both',
              animationDelay: `${rowDelay}s`,
            }}
          >
            {/* Col 1: Timeline line */}
            <div style={{ display: 'flex', justifyContent: 'center', height: '100%', minHeight: 36 }}>
              <div style={{ width: 1, height: '100%', background: lineColor, opacity: 0.7 + (idx % 3) * 0.1 }} />
            </div>

            {/* Col 2: Date (stacked day + time) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center' }}>
              <div style={sBlock(idx % 2 === 0 ? 28 : 24, 11, rowDelay + 0.04, true)} />
              <div style={sBlock(idx % 2 === 0 ? 32 : 26, 9, rowDelay + 0.08)} />
            </div>

            {/* Col 3: ID + AoW icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ ...sBlock(14, 14, rowDelay + 0.06), borderRadius: '50%' }} />
              <div style={sBlock(idWidths[idx % idWidths.length], 10, rowDelay + 0.1)} />
            </div>

            {/* Col 4: Contact name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <div style={sBlock(nameWidths[idx % nameWidths.length], 13, rowDelay + 0.12, true)} />
              {idx % 3 === 0 && <div style={sBlock('40%', 9, rowDelay + 0.16)} />}
            </div>

            {/* Col 5: Pipeline chips */}
            <div style={{ display: 'flex', gap: 6, minWidth: 0, overflow: 'hidden' }}>
              {Array.from({ length: chipCounts[idx % chipCounts.length] }, (_, ci) => (
                <div key={ci} style={sBlock(ci === 0 ? 52 : 34, 18, rowDelay + 0.14 + ci * 0.04)} />
              ))}
            </div>

            {/* Col 6: Actions placeholder */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={sBlock(20, 20, rowDelay + 0.2)} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(QueueLoadingSkeleton);
