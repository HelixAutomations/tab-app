import React from 'react';
import { mergeStyles } from '@fluentui/react';
import { SkeletonLoader } from './FeedbackComponents';

interface InstructionCardSkeletonProps {
  isDarkMode?: boolean;
  animationDelay?: number;
}

/**
 * Skeleton loader for instruction cards
 * Provides visual placeholder while card data is loading
 */
export const InstructionCardSkeleton: React.FC<InstructionCardSkeletonProps> = ({
  isDarkMode = false,
  animationDelay = 0,
}) => {
  const cardClass = mergeStyles({
    position: 'relative',
    borderRadius: 8,
    padding: '12px 18px',
    background: isDarkMode ? '#0f172a' : '#ffffff',
    border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(0,0,0,0.08)'}`,
    borderLeft: `2px solid ${isDarkMode ? 'rgba(135, 243, 243, 0.3)' : 'rgba(13, 47, 96, 0.3)'}`,
    boxShadow: isDarkMode ? 'none' : '0 4px 6px rgba(0, 0, 0, 0.07)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginBottom: 4,
    animation: `fadeIn 300ms ease-out ${animationDelay}ms both`,
    '@keyframes fadeIn': {
      from: { opacity: 0, transform: 'translateY(10px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
  });

  const headerClass = mergeStyles({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  });

  const pillsClass = mergeStyles({
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 8,
  });

  return (
    <div className={cardClass}>
      {/* Header with client name and ref */}
      <div className={headerClass}>
        <SkeletonLoader width={180} height={20} isDarkMode={isDarkMode} borderRadius={4} />
        <SkeletonLoader width={100} height={16} isDarkMode={isDarkMode} borderRadius={4} />
      </div>

      {/* Service description */}
      <SkeletonLoader width="100%" height={14} isDarkMode={isDarkMode} borderRadius={4} />
      <SkeletonLoader width="80%" height={14} isDarkMode={isDarkMode} borderRadius={4} />

      {/* Amount and date */}
      <div className={headerClass}>
        <SkeletonLoader width={100} height={18} isDarkMode={isDarkMode} borderRadius={4} />
        <SkeletonLoader width={80} height={14} isDarkMode={isDarkMode} borderRadius={4} />
      </div>

      {/* Status pills */}
      <div className={pillsClass}>
        <SkeletonLoader width={80} height={24} isDarkMode={isDarkMode} borderRadius={6} />
        <SkeletonLoader width={90} height={24} isDarkMode={isDarkMode} borderRadius={6} />
        <SkeletonLoader width={70} height={24} isDarkMode={isDarkMode} borderRadius={6} />
        <SkeletonLoader width={100} height={24} isDarkMode={isDarkMode} borderRadius={6} />
      </div>
    </div>
  );
};

interface CardTransitionWrapperProps {
  isLoading: boolean;
  isDarkMode?: boolean;
  animationDelay?: number;
  children: React.ReactNode;
}

/**
 * Wrapper that smoothly transitions from skeleton to actual card content
 * Use to wrap InstructionCard components for loading states
 */
export const CardTransitionWrapper: React.FC<CardTransitionWrapperProps> = ({
  isLoading,
  isDarkMode = false,
  animationDelay = 0,
  children,
}) => {
  const wrapperClass = mergeStyles({
    position: 'relative',
    minHeight: isLoading ? 200 : 'auto',
  });

  return (
    <div className={wrapperClass}>
      {isLoading ? (
        <InstructionCardSkeleton isDarkMode={isDarkMode} animationDelay={animationDelay} />
      ) : (
        children
      )}
    </div>
  );
};
