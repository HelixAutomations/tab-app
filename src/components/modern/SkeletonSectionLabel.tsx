import React from 'react';
import { FiRefreshCw } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';

/**
 * Canonical "warming up" header used by every Home skeleton card so the
 * loading state feels deliberate across Billing / Conversion / Pipeline /
 * Matters / To Do / Team. Matches the original Billing inline header
 * typography (spinner + uppercase title + muted sub-line) one-to-one — if
 * you're adjusting padding or colours, do it here and everywhere picks it up.
 *
 * Respects `prefers-reduced-motion` via the same `opsDashSpin` keyframe the
 * live OperationsDashboard toolbar already gates.
 */
type SkeletonSectionLabelProps = {
  title: string;
  description: string;
  isDarkMode: boolean;
};

const SkeletonSectionLabel: React.FC<SkeletonSectionLabelProps> = ({
  title,
  description,
  isDarkMode,
}) => {
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const accent = isDarkMode ? colours.accent : colours.highlight;

  return (
    <div style={{ padding: '10px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <FiRefreshCw
        size={11}
        style={{ color: accent, animation: 'opsDashSpin 1s linear infinite', flexShrink: 0 }}
      />
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: text,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>{description}</div>
      </div>
    </div>
  );
};

export default SkeletonSectionLabel;
