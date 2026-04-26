import React from 'react';

type CclReviewLaunchStripStepStatus = 'pending' | 'active' | 'done' | 'error';

type CclReviewLaunchStripStep = {
  label: string;
  detail?: string;
  status: CclReviewLaunchStripStepStatus;
  expandedContent?: React.ReactNode;
};

type CclReviewLaunchStripProps = {
  steps: CclReviewLaunchStripStep[];
  summary?: string;
  detailMode?: 'active-only' | 'all';
};

const DoneIcon = () => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
    <path d="M1.5 4.2L3.2 5.8L6.5 2.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ErrorIcon = () => (
  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
    <path d="M2 2L6 6M6 2L2 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export default function CclReviewLaunchStrip({
  steps,
  summary,
  detailMode = 'active-only',
}: CclReviewLaunchStripProps) {
  const doneCount = steps.filter((step) => step.status === 'done').length;
  const resolvedSummary = summary ?? `${doneCount} of ${steps.length} complete`;

  return (
    <div className="ccl-launch-strip">
      <div className="ccl-launch-strip__header">
        <span className="ccl-launch-strip__title">Pipeline</span>
        <span className="ccl-launch-strip__summary">{resolvedSummary}</span>
      </div>

      <div className="ccl-launch-timeline ccl-launch-timeline--rail ccl-launch-timeline--launch-strip" role="list" aria-label="CCL pipeline progress">
        {steps.map((step, index) => {
          const isDone = step.status === 'done';
          const isActive = step.status === 'active';
          const isError = step.status === 'error';
          const isPending = step.status === 'pending';
          const showDetail = detailMode === 'all' || isActive || isError;
          const showExpandedContent = Boolean(step.expandedContent) && (isActive || isError);

          return (
            <div
              key={step.label}
              role="listitem"
              aria-current={isActive ? 'step' : undefined}
              className={`ccl-launch-timeline__row${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}${isError ? ' is-error' : ''}${isPending ? ' is-pending' : ''}${showExpandedContent ? ' has-expanded-content' : ''}`}
            >
              <div className="ccl-launch-timeline__marker" aria-hidden="true">
                {isActive ? (
                  <span className="ccl-launch-timeline__spinner" />
                ) : (
                  <span className="ccl-launch-timeline__dot">
                    {isDone ? <DoneIcon /> : null}
                    {isError ? <ErrorIcon /> : null}
                  </span>
                )}
                {index < steps.length - 1 && <span className="ccl-launch-timeline__connector" />}
              </div>

              <div className={`ccl-launch-timeline__body${showExpandedContent ? ' has-expanded-content' : ''}`}>
                <div className="ccl-launch-timeline__label">{step.label}</div>
                <div className={`ccl-launch-timeline__detail${showDetail && step.detail ? '' : ' is-hidden'}`}>
                  {showDetail && step.detail ? step.detail : '\u00A0'}
                </div>
                {showExpandedContent ? (
                  <div className="ccl-launch-timeline__expanded">
                    {step.expandedContent}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}