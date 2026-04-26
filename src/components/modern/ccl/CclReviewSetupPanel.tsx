import React from 'react';
import { colours } from '../../../app/styles/colours';

type CclReviewSetupPanelProps = {
  isMobileReview: boolean;
  showSetupInDefaultView: boolean;
  loadingReviewContext: boolean;
  visibleReviewFieldCount: number;
  setupHeaderTitle: string;
  setupHeaderBody: React.ReactNode;
  introBody: React.ReactNode;
  setupFlowStrip: React.ReactNode;
  launchDraftError?: string | null;
  launchPressureErrored: boolean;
  pressureTestError?: string | null;
  onRetryDraftFetch?: (() => void) | undefined;
  draftFetchError?: string | null;
  launchPressureRunning: boolean;
  launchIsStreamingNow: boolean;
  launchTraceLoading: boolean;
  launchHasAiData: boolean;
  aiDurationMs?: number | null;
};

export default function CclReviewSetupPanel({
  isMobileReview,
  showSetupInDefaultView,
  loadingReviewContext,
  visibleReviewFieldCount,
  setupHeaderTitle,
  setupHeaderBody,
  introBody,
  setupFlowStrip,
  launchDraftError,
  launchPressureErrored,
  pressureTestError,
  onRetryDraftFetch,
  draftFetchError,
  launchPressureRunning,
  launchIsStreamingNow,
  launchTraceLoading,
  launchHasAiData,
  aiDurationMs,
}: CclReviewSetupPanelProps) {
  const errorMessage = launchDraftError || pressureTestError || null;

  return (
    <div data-helix-region="modal/ccl-review/setup-panel" style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 10, color: colours.accent, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
          CCL Review
        </div>
        <div style={{ fontSize: isMobileReview ? 24 : 30, lineHeight: 1.1, fontWeight: 700, color: '#f3f4f6' }}>
          {(showSetupInDefaultView || loadingReviewContext)
            ? setupHeaderTitle
            : visibleReviewFieldCount > 0 ? `${visibleReviewFieldCount} point${visibleReviewFieldCount === 1 ? '' : 's'} to check` : 'Review draft'}
        </div>
        <div style={{ fontSize: isMobileReview ? 13 : 14, lineHeight: 1.65, color: '#d1d5db', maxWidth: 360 }}>
          {(showSetupInDefaultView || loadingReviewContext) ? setupHeaderBody : introBody}
        </div>
      </div>

      {(showSetupInDefaultView || loadingReviewContext) ? (
        <div style={{ display: 'grid', gap: 14, padding: isMobileReview ? '12px 0 0' : '14px 0 0' }}>
          {setupFlowStrip}
          {(launchDraftError || launchPressureErrored || pressureTestError) && (
            <div style={{ border: '1px solid rgba(214, 85, 65, 0.28)', background: 'rgba(214, 85, 65, 0.08)', padding: '9px 10px', fontSize: isMobileReview ? 11 : 10, color: colours.cta, lineHeight: 1.5 }}>
              {errorMessage}
            </div>
          )}
          {!!onRetryDraftFetch && (
            <button
              type="button"
              onClick={onRetryDraftFetch}
              style={{
                justifySelf: 'start',
                border: '1px solid rgba(135, 243, 243, 0.28)',
                background: 'rgba(135, 243, 243, 0.08)',
                color: '#f3f4f6',
                padding: '10px 12px',
                fontSize: isMobileReview ? 12 : 11,
                fontWeight: 700,
                fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
                cursor: 'pointer',
              }}
            >
              Retry draft fetch
            </button>
          )}
          <div style={{ fontSize: 11, color: colours.subtleGrey, lineHeight: 1.55 }}>
            {draftFetchError
              ? 'The draft service did not respond. Check your connection or retry.'
              : launchPressureRunning
                ? 'The draft stays open while the current field is checked against source evidence.'
                : launchIsStreamingNow
                  ? 'Generating review context. The draft will appear as fields are produced.'
                  : launchTraceLoading
                    ? 'Checking for saved review data before a fresh review pass starts.'
                    : !launchHasAiData
                      ? 'Generating review context. The draft will appear as fields are produced.'
                      : 'The review will settle into the standard workspace as soon as setup completes.'}
          </div>
          {aiDurationMs && (
            <div style={{ fontSize: 10, color: colours.subtleGrey, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Draft prepared in {(aiDurationMs / 1000).toFixed(1)}s
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}