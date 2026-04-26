import React from 'react';
import { colours } from '../../../app/styles/colours';

type ConfidenceBreakdown = {
  data: number;
  inferred: number;
  templated: number;
  unknown: number;
};

type CclReviewRailLandingProps = {
  isMobileReview: boolean;
  showNoAiReviewContext: boolean;
  showSummaryLanding: boolean;
  isGeneratingAiReview: boolean;
  onGenerateAiReview: () => void;
  devMetaStrip?: React.ReactNode;
  totalAiFields: number;
  aiDurationMs?: number | null;
  confidenceBreakdown: ConfidenceBreakdown;
  summaryReviewMessage: React.ReactNode;
  ptPending: boolean;
  dataSources: string[];
  onBeginReview: () => void;
  beginReviewLabel: string;
};

export default function CclReviewRailLanding({
  isMobileReview,
  showNoAiReviewContext,
  showSummaryLanding,
  isGeneratingAiReview,
  onGenerateAiReview,
  devMetaStrip,
  totalAiFields,
  aiDurationMs,
  confidenceBreakdown,
  summaryReviewMessage,
  ptPending,
  dataSources,
  onBeginReview,
  beginReviewLabel,
}: CclReviewRailLandingProps) {
  if (!showNoAiReviewContext && !showSummaryLanding) {
    return null;
  }

  return (
    <div data-helix-region="modal/ccl-review/landing-rail" style={{ display: 'grid', gap: 12 }}>
      {showNoAiReviewContext && (
        <div style={{ display: 'grid', gap: 10, animation: 'opsDashFadeIn 0.2s ease 0.03s both' }}>
          <div style={{ fontSize: isMobileReview ? 10 : 9, color: '#A0A0A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Generate Review
          </div>
          <div style={{ fontSize: isMobileReview ? 11 : 10, color: colours.subtleGrey, lineHeight: 1.45 }}>
            No saved AI run was found for this draft yet. You can still read the letter on the left, or generate AI review context now.
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
              padding: isMobileReview ? '14px 14px' : '11px 14px',
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
        <div style={{ display: 'grid', gap: 12, animation: 'opsDashFadeIn 0.35s ease both' }}>
          {devMetaStrip}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: isMobileReview ? 16 : 15, fontWeight: 700, color: '#f3f4f6' }}>
              {totalAiFields} fields generated
            </div>
            {aiDurationMs && (
              <div style={{ fontSize: 10, color: colours.subtleGrey, flexShrink: 0 }}>
                {(aiDurationMs / 1000).toFixed(1)}s
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 10, color: colours.subtleGrey }}>
            {confidenceBreakdown.data > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, background: 'rgba(32,178,108,0.6)', borderRadius: '50%' }} />
                {confidenceBreakdown.data} data
              </span>
            )}
            {confidenceBreakdown.inferred > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, background: 'rgba(255,140,0,0.6)', borderRadius: '50%' }} />
                {confidenceBreakdown.inferred} inferred
              </span>
            )}
            {confidenceBreakdown.templated > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, background: 'rgba(54,144,206,0.6)', borderRadius: '50%' }} />
                {confidenceBreakdown.templated} templated
              </span>
            )}
            {confidenceBreakdown.unknown > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, background: 'rgba(214,85,65,0.6)', borderRadius: '50%' }} />
                {confidenceBreakdown.unknown} unknown
              </span>
            )}
          </div>

          <div style={{ fontSize: isMobileReview ? 11 : 10.5, color: '#d1d5db', lineHeight: 1.5 }}>
            {summaryReviewMessage}
          </div>

          {ptPending && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, border: '1.5px solid rgba(135,243,243,0.15)', borderTopColor: colours.accent, borderRadius: '50%', animation: 'helix-spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: colours.subtleGrey }}>Safety Net verifying…</span>
            </div>
          )}

          {dataSources.length > 0 && (
            <div style={{ fontSize: 10, color: colours.subtleGrey, lineHeight: 1.45 }}>
              Sources: {dataSources.join(', ')}
            </div>
          )}

          <button
            type="button"
            onClick={onBeginReview}
            style={{
              fontSize: isMobileReview ? 13 : 12,
              fontWeight: 700,
              color: '#f3f4f6',
              background: 'transparent',
              padding: isMobileReview ? '12px 14px' : '10px 14px',
              cursor: 'pointer',
              textAlign: 'center',
              border: `1px solid ${colours.accent}`,
              minHeight: isMobileReview ? 48 : 'auto',
              marginTop: 4,
            }}
          >
            {beginReviewLabel}
          </button>
        </div>
      )}
    </div>
  );
}