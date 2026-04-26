import React from 'react';
import { colours } from '../../../app/styles/colours';

type CclReviewLandingPanelProps = {
  isMobileReview: boolean;
  showNoAiReviewContext: boolean;
  showSummaryLanding: boolean;
  isGeneratingAiReview: boolean;
  onGenerateAiReview: () => void;
  visibleReviewFieldCount: number;
  onBeginReview: () => void;
  overrideStartAgainLink?: React.ReactNode;
  overrideExpandedCard?: React.ReactNode;
};

export default function CclReviewLandingPanel({
  isMobileReview,
  showNoAiReviewContext,
  showSummaryLanding,
  isGeneratingAiReview,
  onGenerateAiReview,
  visibleReviewFieldCount,
  onBeginReview,
  overrideStartAgainLink,
  overrideExpandedCard,
}: CclReviewLandingPanelProps) {
  if (!showNoAiReviewContext && !showSummaryLanding) {
    return null;
  }

  return (
    <div data-helix-region="modal/ccl-review/landing-panel" style={{ display: 'grid', gap: 14, paddingTop: isMobileReview ? 12 : 14 }}>
      {showNoAiReviewContext && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 11, lineHeight: 1.55, color: colours.subtleGrey }}>
            No saved AI run was found for this draft yet. Generate one now and the review workspace will open with the right checkpoints already prepared.
          </div>
          <button
            type="button"
            onClick={onGenerateAiReview}
            disabled={isGeneratingAiReview}
            style={{
              fontSize: isMobileReview ? 13 : 12,
              fontWeight: 700,
              color: '#061733',
              background: colours.accent,
              padding: isMobileReview ? '14px 14px' : '12px 14px',
              cursor: isGeneratingAiReview ? 'wait' : 'pointer',
              textAlign: 'center',
              border: 'none',
              minHeight: isMobileReview ? 48 : 'auto',
            }}
          >
            {isGeneratingAiReview ? 'Generating AI review…' : 'Generate AI review'}
          </button>
        </div>
      )}

      {showSummaryLanding && (
        <div style={{ display: 'grid', gap: 14 }}>
          {visibleReviewFieldCount === 0 && (
            <div style={{ fontSize: 11, color: colours.subtleGrey, lineHeight: 1.55 }}>
              The draft is ready for a final read-through.
            </div>
          )}

          <button
            type="button"
            onClick={onBeginReview}
            style={{
              fontSize: isMobileReview ? 14 : 13,
              fontWeight: 700,
              color: '#061733',
              background: colours.accent,
              padding: isMobileReview ? '15px 16px' : '13px 16px',
              cursor: 'pointer',
              textAlign: 'center',
              border: 'none',
              minHeight: isMobileReview ? 50 : 'auto',
              transition: 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {visibleReviewFieldCount > 0 ? `Start review (${visibleReviewFieldCount})` : 'Open review workspace'}
          </button>

          {overrideStartAgainLink && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: -4 }}>
              {overrideStartAgainLink}
            </div>
          )}

          {overrideExpandedCard}
        </div>
      )}
    </div>
  );
}