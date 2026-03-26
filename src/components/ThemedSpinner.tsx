import React from 'react';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import type { ISpinnerStyles } from '@fluentui/react/lib/Spinner';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';

interface ThemedSpinnerProps {
  size?: SpinnerSize;
  label?: string;
  labelPosition?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Themed Spinner component that respects dark mode settings
 */
const ThemedSpinner: React.FC<ThemedSpinnerProps> = ({
  size = SpinnerSize.small,
  label,
  labelPosition,
  className,
  style,
}) => {
  const { isDarkMode } = useTheme();

  const spinnerStyles: ISpinnerStyles = {
    circle: {
      borderTopColor: isDarkMode ? colours.dark.highlight : colours.highlight,
      borderRightColor: 'transparent',
      borderBottomColor: 'transparent',
      borderLeftColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    label: {
      color: isDarkMode ? colours.dark.text : colours.light.text,
    },
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '16px',
        background: isDarkMode ? colours.dark.background : colours.light.background,
        color: isDarkMode ? colours.dark.text : colours.light.text,
        minHeight: '48px',
        width: '100%',
        ...style,
      }}
    >
      <Spinner
        size={size}
        label={label}
        labelPosition={labelPosition}
        className={className}
        styles={spinnerStyles}
      />
    </div>
  );
};

export default ThemedSpinner;