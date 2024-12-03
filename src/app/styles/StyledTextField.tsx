// src/app/styles/StyledTextField.tsx

import React from 'react';
import { TextField, ITextFieldStyles } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react';
import { colours } from '../styles/colours';

interface StyledTextFieldProps {
  label: string;
  required?: boolean;
  value: string;
  onChange: (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  isDarkMode?: boolean; // Add isDarkMode prop
}

const StyledTextField: React.FC<StyledTextFieldProps> = ({
  label,
  required = false,
  value,
  onChange,
  placeholder,
  ariaLabel,
  isDarkMode = false, // Default to light mode if not provided
}) => {
  const styledTextFieldStyles: Partial<ITextFieldStyles> = {
    fieldGroup: {
      borderRadius: '8px',
      borderColor: isDarkMode ? colours.dark.border : colours.light.border,
      selectors: {
        ':focus-within .ms-TextField-field': {
          borderColor: colours.cta,
          boxShadow: '0 0 0 2px rgba(0, 120, 212, 0.3)',
        },
      },
    },
    field: {
      borderRadius: '8px',
      padding: '10px 15px',
      backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
      color: isDarkMode ? colours.dark.text : colours.light.text,
    },
    errorMessage: {
      color: colours.cta, // Style error message if needed
    },
  };

  return (
    <TextField
      label={label}
      required={required}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      styles={styledTextFieldStyles}
    />
  );
};

export default StyledTextField;
