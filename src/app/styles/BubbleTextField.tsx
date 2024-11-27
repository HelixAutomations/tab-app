// src/BubbleTextField.tsx

import React from 'react';
import { TextField, ITextFieldStyles } from '@fluentui/react';
import { colours } from './colours';

interface BubbleTextFieldProps {
  value: string;
  onChange: (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => void;
  placeholder: string;
  multiline?: boolean;
  autoAdjustHeight?: boolean;
  ariaLabel: string;
  isDarkMode: boolean;
  minHeight?: string;
  type?: string; // Added 'type' as an optional prop
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
  type = 'text', // Default type is 'text'
}) => {
  const styles: Partial<ITextFieldStyles> = {
    fieldGroup: {
      border: 'none',
      borderRadius: '8px',
      padding: multiline ? '8px 20px' : '0 20px', // Add vertical padding for multiline
      height: multiline ? 'auto' : '40px', // Auto height for multiline, fixed for single-line
      minHeight: multiline ? minHeight : undefined, // Respect minHeight for multiline
      backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
      boxShadow: isDarkMode
        ? '0 2px 5px rgba(255, 255, 255, 0.1)'
        : '0 2px 5px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      alignItems: multiline ? 'start' : 'center', // Align to top for multiline
      boxSizing: 'border-box', // Ensure padding doesn't affect height
    },
    field: {
      color: isDarkMode ? colours.dark.text : colours.light.text,
      lineHeight: multiline ? 'normal' : '40px', // Adjust line height for multiline
    },
    root: {
      width: '100%',
    },
  };

  return (
    <TextField
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      multiline={multiline}
      autoAdjustHeight={autoAdjustHeight}
      styles={styles}
      ariaLabel={ariaLabel}
      resizable={false} // Prevent resizing for multiline
      type={type} // Pass the 'type' prop to TextField
    />
  );
};

export default BubbleTextField;
