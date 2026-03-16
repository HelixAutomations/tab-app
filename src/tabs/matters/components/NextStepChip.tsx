import React from 'react';
import { colours } from '../../../app/styles/colours';

export interface NextStepChipProps {
  title: string;
  subtitle?: string;
  icon: string;
  isDarkMode: boolean;
  onClick?: () => void;
  category?: 'critical' | 'standard' | 'success' | 'warning';
}

const NextStepChip: React.FC<NextStepChipProps> = ({
  title, subtitle, isDarkMode, onClick, category = 'standard',
}) => {
  const isInteractive = typeof onClick === 'function';
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const categoryColor = category === 'critical' ? colours.cta
    : category === 'warning' ? colours.orange
    : category === 'success' ? colours.green
    : colours.highlight;

  return (
    <div
      aria-label={title}
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: isInteractive ? 'pointer' : 'default',
        fontFamily: 'inherit',
      }}
      onClick={onClick}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: categoryColor,
          flexShrink: 0,
        }}
      />
      <span style={{
        fontSize: 11,
        fontWeight: 500,
        color: text,
        whiteSpace: 'nowrap',
      }}>
        {title}
      </span>
      {subtitle && (
        <span style={{
          fontSize: 10,
          color: textMuted,
          whiteSpace: 'nowrap',
        }}>
          {subtitle}
        </span>
      )}
    </div>
  );
};

export default NextStepChip;
