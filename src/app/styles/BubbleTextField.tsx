// src/app/styles/BubbleTextField.tsx

import React, { CSSProperties } from 'react';
import { TextField, ITextFieldStyles } from '@fluentui/react';
import { colours } from './colours';

interface BubbleTextFieldProps {
  value: string | number; // Updated to accept string or number
  onChange: (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => void;
  placeholder: string;
  multiline?: boolean;
  autoAdjustHeight?: boolean;
  ariaLabel: string;
  isDarkMode: boolean;
  minHeight?: string;
  type?: string;
  style?: CSSProperties; // Optional style prop
}

const BubbleTextField: React.FC<BubbleTextFieldProps> = ({
  value,
  onChange,
  placeholder,
  multiline = false,
  autoAdjustHeight = false,
  ariaLabel,
  isDarkMode,
  minHeight = 'auto',
  type = 'text',
  style, // Accept style prop
}) => {
  const styles: Partial<ITextFieldStyles> = {
    fieldGroup: {
      border: 'none',
      borderRadius: '8px',
      padding: multiline ? '8px 7px' : '0 7px',
      height: multiline ? 'auto' : '40px',
      minHeight: multiline ? minHeight : undefined,
      backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
      boxShadow: isDarkMode
        ? '0 2px 5px rgba(255, 255, 255, 0.1)'
        : '0 2px 5px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      alignItems: multiline ? 'start' : 'center',
      boxSizing: 'border-box',
    },
    field: {
      color: isDarkMode ? colours.dark.text : colours.light.text,
      lineHeight: multiline ? 'normal' : '40px',
    },
    root: {
      width: '100%',
    },
  };

  return (
    <div style={style}> {/* Wrapper to apply the custom style */}
      <TextField
        value={String(value)} // Ensures the value is a string
        onChange={onChange}
        placeholder={placeholder}
        multiline={multiline}
        autoAdjustHeight={autoAdjustHeight}
        styles={styles}
        ariaLabel={ariaLabel}
        resizable={false}
        type={type}
      />
    </div>
  );
};

export default BubbleTextField;
