/**
 * FormReadinessCue — subtle dot → ✓ → fade-out animation. Anchored wherever
 * the host form chooses (typically top-right of its header). Displays nothing
 * in the 'idle' state. 'degraded' stays visible until re-mount.
 */
import React, { useEffect, useState } from 'react';
import type { FormReadinessState } from './useFormReadinessPulse';
import './FormReadinessCue.css';

interface FormReadinessCueProps {
  state: FormReadinessState;
  detail?: string;
  /**
   * Optional override for the text read by screen readers on ready. Default:
   * "Form ready". Pass a short noun when multiple pulses are on the same page.
   */
  readyAnnouncement?: string;
  /**
   * When false, renders nothing. Lets hosts toggle the cue without changing
   * their hook call.
   */
  enabled?: boolean;
}

const READY_HOLD_MS = 650;
const READY_MORPH_MS = 220;
const READY_FADE_MS = 320;

export const FormReadinessCue: React.FC<FormReadinessCueProps> = ({
  state,
  detail,
  readyAnnouncement = 'Form ready',
  enabled = true,
}) => {
  const [visible, setVisible] = useState<boolean>(state !== 'idle');
  const [phase, setPhase] = useState<FormReadinessState>(state);

  useEffect(() => {
    setPhase(state);
    if (state === 'idle') {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (state === 'ready') {
      const fadeTimer = window.setTimeout(() => {
        setVisible(false);
      }, READY_MORPH_MS + READY_HOLD_MS + READY_FADE_MS);
      return () => window.clearTimeout(fadeTimer);
    }
  }, [state]);

  if (!enabled || !visible || phase === 'idle') return null;

  const cueClass = `form-readiness-cue form-readiness-cue--${phase}`;
  const ariaLabel =
    phase === 'checking'
      ? 'Checking form endpoint'
      : phase === 'ready'
        ? readyAnnouncement
        : `Form endpoint unavailable${detail ? `: ${detail}` : ''}`;

  return (
    <span
      className={cueClass}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      title={phase === 'degraded' && detail ? detail : undefined}
    >
      <span className="form-readiness-cue__dot" aria-hidden="true" />
      <svg
        className="form-readiness-cue__tick"
        viewBox="0 0 14 14"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M3 7.5l2.8 2.8L11 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};

export default FormReadinessCue;
