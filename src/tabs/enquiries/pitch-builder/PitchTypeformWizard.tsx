import React from 'react';

export type PitchWizardStepId = 'delivery' | 'scenario' | 'subject' | 'scope' | 'fee' | 'body' | 'receipt';

export type PitchWizardStepStatus = 'pending' | 'active' | 'done' | 'attention';

export interface PitchWizardStepDescriptor {
  id: PitchWizardStepId;
  label: string;
  question: string;
  hint?: string;
  summary?: string;
  status: PitchWizardStepStatus;
}

interface Props {
  steps: PitchWizardStepDescriptor[];
  activeIndex: number;
  onStepChange: (index: number) => void;
  onNext?: () => void;
  onBack?: () => void;
  onRestart?: () => void;
  canAdvance?: boolean;
  nextLabel?: string;
  backLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  headerSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
  children: React.ReactNode;
}

const PitchTypeformWizard: React.FC<Props> = ({
  steps,
  activeIndex,
  onStepChange,
  onNext,
  onBack,
  onRestart,
  canAdvance = true,
  nextLabel,
  backLabel = 'Back',
  busy = false,
  busyLabel,
  headerSlot,
  footerSlot,
  children,
}) => {
  const safeIndex = Math.max(0, Math.min(activeIndex, steps.length - 1));
  const active = steps[safeIndex];
  const isFirst = safeIndex === 0;
  const isLast = safeIndex === steps.length - 1;
  const computedNextLabel = nextLabel || (isLast ? 'Done' : 'Next');
  const prevStep = safeIndex > 0 ? steps[safeIndex - 1] : null;
  const nextStep = safeIndex < steps.length - 1 ? steps[safeIndex + 1] : null;
  const progressPct = steps.length > 1 ? Math.round((safeIndex / (steps.length - 1)) * 100) : 0;
  const [confirmRestart, setConfirmRestart] = React.useState(false);
  const confirmTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => () => {
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
  }, []);
  const handleRestartClick = () => {
    if (!onRestart) return;
    if (!confirmRestart) {
      setConfirmRestart(true);
      if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = window.setTimeout(() => setConfirmRestart(false), 3200);
      return;
    }
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    setConfirmRestart(false);
    onRestart();
  };

  return (
    <section
      className="pitch-typeform"
      data-helix-region="pitch-builder/typeform"
      data-busy={busy ? 'true' : 'false'}
      aria-busy={busy}
    >
      {headerSlot ? (
        <div className="pitch-typeform__header-slot">{headerSlot}</div>
      ) : null}
      <header className="pitch-typeform__progress" aria-label="Pitch composer steps">
        <div
          className="pitch-typeform__progress-rail"
          aria-hidden="true"
          style={{ ['--progress-pct' as any]: `${progressPct}%` }}
        />
        <ul className="pitch-typeform__dots" role="list">
          {steps.map((step, idx) => {
            const interactive = step.status === 'done' || idx <= safeIndex;
            const isActive = idx === safeIndex;
            const isDone = step.status === 'done' && !isActive;
            return (
              <li
                key={step.id}
                className="pitch-typeform__dot-item"
                data-status={isActive ? 'active' : step.status}
                data-done={step.status === 'done' ? 'true' : 'false'}
              >
                <button
                  type="button"
                  className="pitch-typeform__dot"
                  onClick={() => interactive && onStepChange(idx)}
                  disabled={!interactive}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`${step.label}${step.summary ? ': ' + step.summary : ''}`}
                  title={step.summary || step.label}
                >
                  <span className="pitch-typeform__dot-index" aria-hidden="true">
                    {isDone ? '\u2713' : idx + 1}
                  </span>
                  <span className="pitch-typeform__dot-label">{step.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="pitch-typeform__progress-meta" aria-live="polite">
          <span className="pitch-typeform__progress-count">
            Step {safeIndex + 1} of {steps.length}
          </span>
          {onRestart ? (
            <button
              type="button"
              className="pitch-typeform__restart"
              data-confirm={confirmRestart ? 'true' : 'false'}
              onClick={handleRestartClick}
              onBlur={() => {
                if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
                setConfirmRestart(false);
              }}
              aria-label={confirmRestart ? 'Confirm start over' : 'Start over'}
              title={confirmRestart ? 'Click again to confirm' : 'Start over'}
            >
              <span className="pitch-typeform__restart-icon" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>
              </span>
              <span className="pitch-typeform__restart-label">{confirmRestart ? 'Confirm?' : 'Start over'}</span>
            </button>
          ) : null}
        </div>
      </header>

      <div className="pitch-typeform__panel" key={active?.id || safeIndex}>
        <div className="pitch-typeform__heading">
          <span className="pitch-typeform__eyebrow">{active?.label}</span>
          <h2 className="pitch-typeform__question">{active?.question}</h2>
          {active?.hint ? (
            <p className="pitch-typeform__hint">{active.hint}</p>
          ) : null}
        </div>
        <div className="pitch-typeform__body">{children}</div>
        {busy ? (
          <div className="pitch-typeform__busy" role="status">
            <span className="pitch-typeform__busy-dot" />
            <span className="pitch-typeform__busy-dot" />
            <span className="pitch-typeform__busy-dot" />
            {busyLabel ? <span className="pitch-typeform__busy-label">{busyLabel}</span> : null}
          </div>
        ) : null}
      </div>

      <footer className="pitch-typeform__footer">
        <button
          type="button"
          className="pitch-typeform__nav pitch-typeform__nav--back"
          onClick={onBack}
          disabled={isFirst || !onBack}
        >
          <span className="pitch-typeform__nav-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="20" y1="12" x2="4" y2="12" />
              <polyline points="10 6 4 12 10 18" />
            </svg>
          </span>
          <span className="pitch-typeform__nav-label">
            <span className="pitch-typeform__nav-label-default">{backLabel}</span>
            <span className="pitch-typeform__nav-label-hover">
              {prevStep ? prevStep.label : backLabel}
            </span>
          </span>
        </button>
        <div className="pitch-typeform__footer-slot">{footerSlot}</div>
        <button
          type="button"
          className="pitch-typeform__nav pitch-typeform__nav--next"
          onClick={onNext}
          disabled={!onNext || !canAdvance || busy}
          data-state={canAdvance ? 'ready' : 'blocked'}
        >
          <span className="pitch-typeform__nav-label">
            <span className="pitch-typeform__nav-label-default">{computedNextLabel}</span>
            <span className="pitch-typeform__nav-label-hover">
              {nextStep ? nextStep.label : computedNextLabel}
            </span>
          </span>
          <span className="pitch-typeform__nav-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="12" x2="20" y2="12" />
              <polyline points="14 6 20 12 14 18" />
            </svg>
          </span>
        </button>
      </footer>
    </section>
  );
};

export default PitchTypeformWizard;
