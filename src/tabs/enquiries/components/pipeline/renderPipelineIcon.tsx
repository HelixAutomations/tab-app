/**
 * Renders a Fluent UI icon (or £ symbol) for pipeline chips.
 * Extracted from Enquiries.tsx to share across pipeline components.
 */
import React from 'react';
import { Icon } from '@fluentui/react';

export const renderPipelineIcon = (
  iconName: string,
  color: string,
  size: number = 14,
): React.ReactElement => {
  if (iconName === 'CurrencyPound') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          fontSize: Math.max(10, size - 2),
          fontWeight: 700,
          lineHeight: 1,
          color,
        }}
      >
        £
      </span>
    );
  }

  return <Icon iconName={iconName} styles={{ root: { fontSize: size, color } }} />;
};
