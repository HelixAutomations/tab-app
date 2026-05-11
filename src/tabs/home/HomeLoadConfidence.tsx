import React, { useEffect, useState } from 'react';

export type HomeLoadConfidenceStatus = 'settling' | 'ready' | 'delayed' | 'degraded';

interface HomeLoadConfidenceProps {
  readonly status: HomeLoadConfidenceStatus;
  readonly onRetry?: () => void;
}

const READY_CUE_MS = 2200;

const STATUS_LABEL: Record<HomeLoadConfidenceStatus, string> = {
  settling: 'Settling workspace',
  ready: 'Ready',
  delayed: 'Catching up',
  degraded: 'Refresh',
};

const STATUS_ANNOUNCEMENT: Record<HomeLoadConfidenceStatus, string> = {
  settling: 'Workspace is settling.',
  ready: 'Workspace ready.',
  delayed: 'Workspace is still catching up.',
  degraded: 'Workspace needs a refresh.',
};

const HomeLoadConfidence: React.FC<HomeLoadConfidenceProps> = ({ status, onRetry }) => {
  const [showReadyCue, setShowReadyCue] = useState(false);

  useEffect(() => {
    if (status !== 'ready') {
      setShowReadyCue(false);
      return;
    }

    setShowReadyCue(true);
    const timerId = window.setTimeout(() => setShowReadyCue(false), READY_CUE_MS);
    return () => window.clearTimeout(timerId);
  }, [status]);

  const showChip = status === 'delayed' || status === 'degraded' || (status === 'ready' && showReadyCue);
  const label = STATUS_LABEL[status];
  const chip = (
    <>
      <span className="home-load-confidence__dot" aria-hidden="true" />
      <span className="home-load-confidence__copy">{label}</span>
    </>
  );

  return (
    <div
      className={`home-load-confidence${showChip ? ' is-showing-chip' : ''}`}
      data-status={status}
      data-helix-region="home/load-confidence"
      role="status"
      aria-live="polite"
    >
      <div className="home-load-confidence__rail" aria-hidden="true">
        <span className="home-load-confidence__rail-fill" />
      </div>
      {showChip && (status === 'degraded' && onRetry ? (
        <button
          type="button"
          className="home-load-confidence__chip home-load-confidence__chip-button"
          onClick={onRetry}
          aria-label="Refresh Home workspace"
        >
          {chip}
        </button>
      ) : (
        <div className="home-load-confidence__chip" aria-hidden="true">
          {chip}
        </div>
      ))}
      <span className="home-load-confidence__sr-only">{STATUS_ANNOUNCEMENT[status]}</span>
    </div>
  );
};

export default React.memo(HomeLoadConfidence);