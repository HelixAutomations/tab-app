import React from 'react';

interface ReviewChoiceOption {
  value: string;
  title: string;
  help: string;
  preview: string;
}

interface ReviewChoiceConfig {
  selectedChoice?: string | null;
  options: ReviewChoiceOption[];
}

interface CclReviewDecisionPanelProps {
  isMobile: boolean;
  choiceConfig?: ReviewChoiceConfig | null;
  selectedFieldOutput: string;
  selectedFieldIsReviewed: boolean;
  hasNextDecision: boolean;
  hasPreviousDecision: boolean;
  isFirstDecision: boolean;
  canApprove: boolean;
  isApproving: boolean;
  approvalLabel: string;
  onSelectChoice: (value: string) => void;
  onTextChange: (value: string, element: HTMLTextAreaElement) => void;
  textareaRef: (element: HTMLTextAreaElement | null) => void;
  onToggleReviewed: () => void;
  onApprove: () => void;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export default function CclReviewDecisionPanel({
  isMobile,
  choiceConfig,
  selectedFieldOutput,
  selectedFieldIsReviewed,
  hasNextDecision,
  hasPreviousDecision,
  isFirstDecision,
  canApprove,
  isApproving,
  approvalLabel,
  onSelectChoice,
  onTextChange,
  textareaRef,
  onToggleReviewed,
  onApprove,
  onBack,
  onPrevious,
  onNext,
}: CclReviewDecisionPanelProps) {
  const [justSaved, setJustSaved] = React.useState(false);
  const completeLabel = selectedFieldIsReviewed
    ? 'Reopen'
    : hasNextDecision
      ? 'Save \u00b7 next point'
      : canApprove
        ? 'Save \u00b7 review complete'
        : 'Save';
  const backLabel = isFirstDecision ? '\u2190 Summary' : '\u2190 Summary';

  const handleCommit = React.useCallback(() => {
    if (!selectedFieldIsReviewed) {
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 520);
    }
    onToggleReviewed();
  }, [selectedFieldIsReviewed, onToggleReviewed]);

  return (
    <div className={`ccl-review-decision${isMobile ? ' ccl-review-decision--mobile' : ''}`}>
      <div className="ccl-review-decision__panel">
        {choiceConfig ? (
          <div className="ccl-review-decision__choices" role="radiogroup" aria-label="Wording options">
            {choiceConfig.options.map((option) => {
              const isSelected = choiceConfig.selectedChoice === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelectChoice(option.value)}
                  title={option.help}
                  className={`ccl-review-decision__choice${isSelected ? ' ccl-review-decision__choice--selected' : ''}`}
                >
                  <div className="ccl-review-decision__choice-header">
                    <span className="ccl-review-decision__choice-title">{option.title}</span>
                    {isSelected && (
                      <span className="ccl-review-decision__choice-pill" aria-hidden="true">Live</span>
                    )}
                  </div>
                  <div className="ccl-review-decision__choice-preview">{option.preview}</div>
                </button>
              );
            })}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={selectedFieldOutput}
            onChange={(event) => onTextChange(event.target.value, event.target)}
            placeholder="Type the wording that should appear in the letter."
            rows={1}
            className="ccl-review-decision__textarea"
          />
        )}

        <div className="ccl-review-decision__commit-row">
          <div className="ccl-review-decision__nav">
            <button
              type="button"
              onClick={onPrevious}
              disabled={!hasPreviousDecision}
              className="ccl-review-decision__step"
              aria-label="Previous decision"
              title="Previous decision (↑)"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={onBack}
              className="ccl-review-decision__back"
            >
              {backLabel}
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNextDecision}
              className="ccl-review-decision__step"
              aria-label="Next decision"
              title="Next decision (↓)"
            >
              ›
            </button>
          </div>

          <div className="ccl-review-decision__commit-actions">
            {canApprove && !hasNextDecision && (
              <button
                type="button"
                onClick={onApprove}
                disabled={isApproving}
                className="ccl-review-decision__action ccl-review-decision__action--approve"
              >
                {approvalLabel}
              </button>
            )}
            <button
              type="button"
              onClick={handleCommit}
              className={`ccl-review-decision__action${selectedFieldIsReviewed ? ' ccl-review-decision__action--secondary' : ' ccl-review-decision__action--primary'}${justSaved ? ' ccl-review-decision__action--just-saved' : ''}`}
            >
              {justSaved ? (
                <span className="ccl-review-decision__action-saved">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2.5 6.4L4.8 8.6L9.5 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Saved
                </span>
              ) : completeLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}