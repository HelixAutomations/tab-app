import React from 'react';
import './overview.css';

export type NextStepTone = 'default' | 'warning' | 'success' | 'danger';

export interface NextStepChip {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  tone?: NextStepTone;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}

export interface NextStepRailProps {
  steps: NextStepChip[];
  className?: string;
}

/**
 * Horizontal row of suggested next-step chips. Used on both surfaces.
 */
export const NextStepRail: React.FC<NextStepRailProps> = ({ steps, className }) => {
  if (!steps.length) return null;
  return (
    <div className={className ? `helix-next-steps ${className}` : 'helix-next-steps'}>
      {steps.map((step) => (
        <button
          key={step.key}
          type="button"
          className="helix-next-steps__chip"
          data-tone={step.tone && step.tone !== 'default' ? step.tone : undefined}
          onClick={step.onClick}
          disabled={step.disabled}
          title={step.title}
        >
          {step.icon ? <span aria-hidden="true">{step.icon}</span> : null}
          <span>{step.label}</span>
        </button>
      ))}
    </div>
  );
};

export default NextStepRail;
