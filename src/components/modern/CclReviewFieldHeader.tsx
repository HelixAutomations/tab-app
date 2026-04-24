import React from 'react';
import type { PressureTestFieldScore } from '../../tabs/matters/ccl/cclAiService';

type ReviewFieldType = 'verify' | 'set-wording' | null;

interface CclReviewFieldHeaderProps {
  isMobile: boolean;
  currentDecisionNumber: number;
  totalDecisions: number;
  fieldType: ReviewFieldType;
  fieldLabel: string;
  fieldGroup: string;
  decisionReason: string;
  pressureTest?: PressureTestFieldScore;
  // Optional dev-friendly context for the Safety Net "why" expander.
  // When provided, the orange tag becomes clickable and reveals the
  // evidence sources the PT scored against + the AI trace id.
  pressureTestSources?: string[];
  pressureTestTraceId?: number | null;
  pressureTestPromptVersion?: string;
}

function getAskSentence(fieldType: ReviewFieldType, isFlagged: boolean): string {
  if (isFlagged || fieldType === 'verify') {
    return 'Confirm this wording fits the evidence.';
  }
  if (fieldType === 'set-wording') {
    return 'Set the wording for this point.';
  }
  return 'Review this point.';
}

function getWhyParagraph(
  fieldType: ReviewFieldType,
  isFlagged: boolean,
  pressureTest: PressureTestFieldScore | undefined,
  decisionReason: string,
): string | null {
  // verify (flagged) → PT reason verbatim, that's the whole point of the flag
  if (isFlagged && pressureTest?.reason) return pressureTest.reason;
  if (isFlagged) {
    return 'The Safety Net could not fully support this wording against the source evidence.';
  }
  // set-wording → decisionReason from parent (already distinguishes no-source vs low-confidence)
  if (fieldType === 'set-wording' && decisionReason) return decisionReason;
  if (fieldType === 'set-wording') {
    return 'The AI wasn\u2019t confident enough to auto-fill this. Your call.';
  }
  return decisionReason || null;
}

export default function CclReviewFieldHeader({
  isMobile,
  currentDecisionNumber,
  totalDecisions,
  fieldType,
  fieldLabel,
  fieldGroup,
  decisionReason,
  pressureTest,
  pressureTestSources,
  pressureTestTraceId,
  pressureTestPromptVersion,
}: CclReviewFieldHeaderProps) {
  const isFlagged = pressureTest?.flag === true;
  const askSentence = getAskSentence(fieldType, isFlagged);
  const whyParagraph = getWhyParagraph(fieldType, isFlagged, pressureTest, decisionReason);
  const showSafetyNetTag = isFlagged && typeof pressureTest?.score === 'number';

  // Expander: only meaningful when we have something to reveal beyond the
  // one-sentence reason. Keep dev-flavoured (sources + trace id).
  const hasExpanderContent = isFlagged && (
    (Array.isArray(pressureTestSources) && pressureTestSources.length > 0)
    || typeof pressureTestTraceId === 'number'
  );
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className={`ccl-review-field-header${isMobile ? ' ccl-review-field-header--mobile' : ''}`}>
      <div className="ccl-review-field-header__orientation">
        <span className="ccl-review-field-header__orientation-count">
          {currentDecisionNumber} / {totalDecisions}
        </span>
        {fieldGroup && (
          <span className="ccl-review-field-header__group-pill">{fieldGroup}</span>
        )}
        <span className="ccl-review-field-header__orientation-sep" aria-hidden="true">&middot;</span>
        <span className="ccl-review-field-header__orientation-label">{fieldLabel}</span>
      </div>

      <div className="ccl-review-field-header__ask">{askSentence}</div>

      {(showSafetyNetTag || whyParagraph) && (
        <div className="ccl-review-field-header__why-block">
          {showSafetyNetTag && (
            hasExpanderContent ? (
              <button
                type="button"
                className="ccl-review-field-header__safety-net-tag ccl-review-field-header__safety-net-tag--button"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
                style={{
                  background: 'none',
                  border: 0,
                  padding: 0,
                  font: 'inherit',
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Safety Net &middot; {pressureTest!.score}/10 {expanded ? '\u25B4' : '\u25BE'}
              </button>
            ) : (
              <span className="ccl-review-field-header__safety-net-tag">
                Safety Net &middot; {pressureTest!.score}/10
              </span>
            )
          )}
          {whyParagraph && (
            <div className="ccl-review-field-header__why">{whyParagraph}</div>
          )}
          {expanded && hasExpanderContent && (
            <div
              className="ccl-review-field-header__why-expander"
              style={{
                marginTop: 6,
                padding: '8px 10px',
                background: 'rgba(255, 140, 0, 0.06)',
                border: '1px solid rgba(255, 140, 0, 0.18)',
                fontSize: 11,
                lineHeight: 1.5,
                color: '#d1d5db',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              {Array.isArray(pressureTestSources) && pressureTestSources.length > 0 && (
                <div>
                  <span style={{ color: '#A0A0A0' }}>Scored against:</span>{' '}
                  {pressureTestSources.join(' \u00B7 ')}
                </div>
              )}
              {typeof pressureTestTraceId === 'number' && (
                <div>
                  <span style={{ color: '#A0A0A0' }}>Trace:</span> #{pressureTestTraceId}
                  {pressureTestPromptVersion ? ` \u00B7 ${pressureTestPromptVersion}` : ''}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}