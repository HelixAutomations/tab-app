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

function normaliseText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function splitFieldGroup(fieldGroup: string, fieldLabel: string, showLabel: boolean): {
  sectionLabel: string;
  title: string;
  subtitle: string;
} {
  const parts = (fieldGroup || '').split('·').map((part) => part.trim()).filter(Boolean);
  const sectionLabel = parts.length > 1 ? parts[0] : '';
  const groupTitle = parts.length > 1 ? parts.slice(1).join(' · ') : (fieldGroup || '').trim();
  const title = (showLabel ? fieldLabel : groupTitle) || fieldLabel || groupTitle || 'Review point';
  const subtitle = showLabel && groupTitle && normaliseText(groupTitle) !== normaliseText(fieldLabel)
    ? groupTitle
    : '';
  return { sectionLabel, title, subtitle };
}

function getAskSentence(fieldType: ReviewFieldType, isFlagged: boolean): string {
  if (isFlagged || fieldType === 'verify') {
    return 'Confirm this wording fits the evidence.';
  }
  // set-wording: the field itself + the editor below already make the
  // ask self-evident; suppress the helper sentence so the header stays
  // tight (no "Set the wording for this point." filler).
  return '';
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

  // De-dup section vs label — when the field label is just a restatement
  // of the group (e.g. group "Section 3 · Next steps" + label "Next Steps"),
  // hide the trailing label so the orientation row doesn't double up.
  const normGroup = normaliseText(fieldGroup || '');
  const normLabel = normaliseText(fieldLabel || '');
  const labelRedundant = !!normLabel && !!normGroup && normGroup.endsWith(normLabel);
  const showLabel = !!fieldLabel && !labelRedundant;
  const { sectionLabel, title, subtitle } = React.useMemo(
    () => splitFieldGroup(fieldGroup, fieldLabel, showLabel),
    [fieldGroup, fieldLabel, showLabel],
  );

  // Expander: only meaningful when we have something to reveal beyond the
  // one-sentence reason. Keep dev-flavoured (sources + trace id).
  const hasExpanderContent = isFlagged && (
    (Array.isArray(pressureTestSources) && pressureTestSources.length > 0)
    || typeof pressureTestTraceId === 'number'
  );
  const [expanded, setExpanded] = React.useState(false);
  const cueLabel = showSafetyNetTag
    ? null
    : fieldType === 'set-wording'
      ? 'Needs wording'
      : 'Review cue';

  return (
    <div className={`ccl-review-field-header${isMobile ? ' ccl-review-field-header--mobile' : ''}`}>
      <div className="ccl-review-field-header__topline">
        <span className="ccl-review-field-header__count-chip">
          {currentDecisionNumber} / {totalDecisions}
        </span>
        {sectionLabel && (
          <span className="ccl-review-field-header__section-chip">{sectionLabel}</span>
        )}
      </div>

      <div className="ccl-review-field-header__title-block">
        <div className="ccl-review-field-header__title">{title}</div>
        {subtitle && (
          <div className="ccl-review-field-header__subtitle">{subtitle}</div>
        )}
        {askSentence && (
          <div className="ccl-review-field-header__guidance">{askSentence}</div>
        )}
      </div>

      {(showSafetyNetTag || whyParagraph) && (
        <div className={`ccl-review-field-header__context${showSafetyNetTag ? ' ccl-review-field-header__context--safety-net' : ''}`}>
          <div className="ccl-review-field-header__context-head">
            <div className="ccl-review-field-header__context-chips">
              {showSafetyNetTag ? (
                <span className="ccl-review-field-header__safety-net-tag">
                  Safety Net &middot; {pressureTest!.score}/10
                </span>
              ) : cueLabel ? (
                <span className="ccl-review-field-header__context-label">{cueLabel}</span>
              ) : null}
            </div>
            {hasExpanderContent && (
              <button
                type="button"
                className="ccl-review-field-header__context-toggle"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
              >
                Evidence {expanded ? '\u25B4' : '\u25BE'}
              </button>
            )}
          </div>
          {whyParagraph && (
            <div className="ccl-review-field-header__why">{whyParagraph}</div>
          )}
          {expanded && hasExpanderContent && (
            <div className="ccl-review-field-header__context-meta">
              {Array.isArray(pressureTestSources) && pressureTestSources.length > 0 && (
                <div className="ccl-review-field-header__context-meta-row">
                  <div className="ccl-review-field-header__context-meta-label">Scored against</div>
                  <div className="ccl-review-field-header__context-meta-value">
                    {pressureTestSources.join(' \u00B7 ')}
                  </div>
                </div>
              )}
              {typeof pressureTestTraceId === 'number' && (
                <div className="ccl-review-field-header__context-meta-row">
                  <div className="ccl-review-field-header__context-meta-label">Trace</div>
                  <div className="ccl-review-field-header__context-meta-value">
                    #{pressureTestTraceId}
                    {pressureTestPromptVersion ? ` \u00B7 ${pressureTestPromptVersion}` : ''}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}