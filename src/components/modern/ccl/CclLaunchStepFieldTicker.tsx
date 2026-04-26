import React from 'react';

type CclLaunchStepFieldTickerProps = {
  fieldKeys: string[];
  activeFieldKey?: string | null;
  elapsedMs: number;
  formatFieldLabel?: (key: string) => string;
};

function defaultFormatFieldLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function CclLaunchStepFieldTicker({
  fieldKeys,
  activeFieldKey = null,
  elapsedMs,
  formatFieldLabel = defaultFormatFieldLabel,
}: CclLaunchStepFieldTickerProps) {
  const keys = fieldKeys.filter((key) => !!String(key || '').trim());

  if (!keys.length) {
    return null;
  }

  const fallbackIndex = Math.min(
    keys.length - 1,
    Math.max(0, Math.floor((elapsedMs / 900) % keys.length))
  );
  const activeIndexFromKey = activeFieldKey ? keys.indexOf(activeFieldKey) : -1;
  const activeIndex = activeIndexFromKey >= 0 ? activeIndexFromKey : fallbackIndex;
  const activeLabel = formatFieldLabel(keys[activeIndex] || keys[0]);
  const reelOffset = -((activeIndex - 1) * 44);

  return (
    <div
      data-helix-region="modal/ccl-review/pressure-test-reel"
      className="ccl-launch-step-ticker"
      aria-live="polite"
      aria-label={`Checking ${activeLabel} against source evidence`}
    >
      <div className="ccl-launch-step-ticker__meta">
        <span className="ccl-launch-step-ticker__summary">
          Pressure testing {keys.length} field{keys.length === 1 ? '' : 's'}
        </span>
        <span className="ccl-launch-step-ticker__elapsed">
          {(elapsedMs / 1000).toFixed(1)}s
        </span>
      </div>

      <div className="ccl-launch-step-ticker__caption">
        Checking against source evidence
      </div>

      <div className="ccl-launch-step-ticker__window">
        <div
          className="ccl-launch-step-ticker__reel"
          style={{ transform: `translateY(${reelOffset}px)` }}
        >
          {keys.map((key, index) => {
            const isActive = index === activeIndex;

            return (
              <div
                key={key}
                className={`ccl-launch-step-ticker__row${isActive ? ' is-active' : ''}`}
              >
                <span className="ccl-launch-step-ticker__field">
                  {formatFieldLabel(key)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}