// src/app/styles/BespokeForms.tsx

import React from 'react';
import {
  Stack,
  Dropdown,
  Toggle,
  PrimaryButton,
  DefaultButton,
  TextField,
} from '@fluentui/react';
import { mergeStyles } from '@fluentui/react';
import { colours } from './colours';

// Type Guard to check if a value is a File
const isFile = (value: any): value is File => {
  return value instanceof File;
};

// Define a consistent height for all input fields
const INPUT_HEIGHT = 40;

// Container styling for the entire form
const formContainerStyle = mergeStyles({
  marginTop: '10px',
  padding: '20px',
  backgroundColor: colours.light.sectionBackground,
  borderRadius: '12px',
  boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)', // Subtle shadow
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
});

// Input field styling
const inputFieldStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  padding: '10px',
  borderRadius: '8px',
  border: `1px solid ${colours.light.border}`,
  backgroundColor: colours.light.inputBackground,
  boxSizing: 'border-box',
  selectors: {
    ':hover': {
      borderColor: colours.light.cta,
    },
    ':focus': {
      borderColor: colours.light.cta,
    },
  },
});

// Dropdown styling
const dropdownStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  border: `1px solid ${colours.light.border}`,
  borderRadius: '8px',
  backgroundColor: colours.light.inputBackground,
  selectors: {
    ':hover .ms-Dropdown-title': {
      borderColor: colours.light.cta,
      backgroundColor: colours.light.cardHover,
    },
    ':focus .ms-Dropdown-title': {
      borderColor: colours.light.cta,
      backgroundColor: colours.light.cardHover,
    },
  },
});

// Container for amount and prefix
const amountContainerStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  height: `${INPUT_HEIGHT}px`,
});

// Prefix (£) styling
const prefixStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '50px', // Fixed width for consistency
  height: '100%',
  backgroundColor: colours.light.sectionBackground,
  border: `1px solid ${colours.light.border}`,
  borderRight: 'none',
  borderTopLeftRadius: '8px',
  borderBottomLeftRadius: '8px',
  fontWeight: 'bold',
});

// Amount input field styling
const amountInputStyle = mergeStyles({
  flexGrow: 1,
  height: '100%',
  borderTopLeftRadius: '0',
  borderBottomLeftRadius: '0',
  borderLeft: 'none',
  borderTopRightRadius: '8px',
  borderBottomRightRadius: '8px',
  padding: '10px',
  border: `1px solid ${colours.light.border}`,
  backgroundColor: colours.light.inputBackground,
  boxSizing: 'border-box',
  selectors: {
    ':hover': {
      borderColor: colours.light.cta,
    },
    ':focus': {
      borderColor: colours.light.cta,
    },
  },
});

// Toggle styling
const toggleStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  selectors: {
    ':hover': {
      backgroundColor: colours.light.cardHover,
    },
  },
});

// Button styling
const buttonStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  padding: '0 20px',
  borderRadius: '8px',
  fontWeight: '600',
  backgroundColor: colours.cta,
  color: '#ffffff',
  border: 'none',
  lineHeight: `${INPUT_HEIGHT}px`,
  selectors: {
    ':hover': {
      backgroundColor: colours.red,
    },
    ':active': {
      backgroundColor: colours.cta,
    },
  },
});

// Cancel button styling
const cancelButtonStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  padding: '0 20px',
  borderRadius: '8px',
  fontWeight: '600',
  backgroundColor: colours.light.cardHover,
  color: colours.greyText,
  lineHeight: `${INPUT_HEIGHT}px`,
  selectors: {
    ':hover': {
      backgroundColor: colours.light.cardBackground,
    },
  },
});

// Form Props Interface
interface BespokeFormProps {
  fields: Array<{
    label: string;
    type: 'text' | 'number' | 'textarea' | 'dropdown' | 'toggle' | 'currency-picker' | 'file'; // Added 'file'
    options?: string[]; // For dropdowns
    step?: number; // For number inputs
    editable?: boolean; // For number inputs
    required?: boolean;
    defaultValue?: boolean | string | number | File; // Included File type
    prefix?: string; // Added
    helpText?: string; // Added
    placeholder?: string; // Added
  }>;
  onSubmit: (values: { [key: string]: string | number | boolean | File }) => void; // Included File type
  onCancel: () => void;
}

// Bespoke Form Component
export const BespokeForm: React.FC<BespokeFormProps> = ({ fields, onSubmit, onCancel }) => {
  const [formValues, setFormValues] = React.useState<{ [key: string]: string | number | boolean | File }>({});

  const handleInputChange = (field: string, value: string | number | boolean | File) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (field: string, file: File | null) => {
    if (file) {
      handleInputChange(field, file);
    }
  };

  const handleSubmit = () => {
    onSubmit(formValues);
  };

  return (
    <div className={formContainerStyle}>
      <Stack tokens={{ childrenGap: 20 }}>
        {fields.map((field, index) => {
          switch (field.type) {
            case 'dropdown':
              return (
                <Dropdown
                  key={index}
                  label={field.label}
                  options={(field.options || []).map((opt) => ({ key: opt, text: opt }))}
                  onChange={(_, option) => handleInputChange(field.label, option?.key || '')}
                  required={field.required}
                  styles={{
                    dropdown: dropdownStyle,
                    title: {
                      height: `${INPUT_HEIGHT}px`,
                      lineHeight: `${INPUT_HEIGHT}px`,
                      padding: '0 10px',
                      borderRadius: '8px',
                      backgroundColor: colours.light.inputBackground,
                    },
                    caretDown: {
                      padding: '0 10px',
                    },
                  }}
                />
              );
            case 'toggle':
              return (
                <div key={index} style={{ marginBottom: '15px' }}>
                  <Toggle
                    label={field.label}
                    checked={Boolean(formValues[field.label])}
                    onChange={(_, checked) => handleInputChange(field.label, checked || false)}
                    styles={{
                      root: {
                        height: `${INPUT_HEIGHT}px`,
                        lineHeight: `${INPUT_HEIGHT}px`,
                      },
                    }}
                  />
                </div>
              );
            case 'textarea':
              return (
                <TextField
                  key={index}
                  label={field.label}
                  multiline
                  rows={3}
                  required={field.required}
                  value={formValues[field.label]?.toString() || ''}
                  onChange={(_, value) => handleInputChange(field.label, value || '')}
                  styles={{
                    root: {
                      width: '100%',
                    },
                    fieldGroup: {
                      height: '120px',
                      padding: '10px',
                      border: `1px solid ${colours.light.border}`,
                      borderRadius: '8px',
                      backgroundColor: colours.light.inputBackground,
                    },
                    field: {
                      height: '100%',
                      lineHeight: '1.5',
                      fontSize: '14px',
                      padding: '5px',
                      overflow: 'auto',
                    },
                  }}
                />
              );
            case 'number':
            case 'currency-picker':
              return (
                <div key={index}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 600 }}>
                    {field.label}
                    {field.required && ' *'}
                  </label>
                  <div className={amountContainerStyle}>
                    {field.prefix && <span className={prefixStyle}>{field.prefix}</span>}
                    <TextField
                      required={field.required}
                      value={formValues[field.label]?.toString() || ''}
                      onChange={(_, value) => handleInputChange(field.label, value || '')}
                      type={field.type === 'currency-picker' ? 'text' : 'number'}
                      styles={{
                        fieldGroup: amountInputStyle,
                      }}
                      step={field.step}
                      readOnly={!field.editable}
                    />
                  </div>
                  {field.helpText && (
                    <span style={{ color: colours.greyText, fontSize: '12px' }}>{field.helpText}</span>
                  )}
                </div>
              );
            case 'file': // Updated 'file' case
              const fileValue = formValues[field.label]; // Extract the value

              return (
                <div key={index} style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 600 }}>
                    {field.label}
                    {field.required && ' *'}
                  </label>
                  <PrimaryButton
                    text="Upload File"
                    iconProps={{ iconName: 'Upload' }}
                    onClick={() => {
                      // Trigger the hidden file input when button is clicked
                      const fileInput = document.getElementById(`file-input-${index}`);
                      fileInput?.click();
                    }}
                    styles={{
                      root: {
                        borderRadius: '8px',
                        backgroundColor: colours.cta,
                        color: '#ffffff',
                        height: '40px',
                        width: '150px',
                        border: 'none', // Remove default border
                        boxShadow: 'none', // Remove default box shadow
                        selectors: {
                          ':hover': {
                            backgroundColor: colours.red,
                          },
                        },
                      },
                    }}
                  />
                  <input
                    id={`file-input-${index}`}
                    type="file"
                    required={field.required}
                    onChange={(e) =>
                      handleFileChange(field.label, e.target.files ? e.target.files[0] : null)
                    }
                    style={{ display: 'none' }} // Hide the native file input
                  />
                  {isFile(fileValue) && ( // Use type guard here
                    <span style={{ marginTop: '10px', display: 'block', fontSize: '14px' }}>
                      Selected File: {fileValue.name}
                    </span>
                  )}
                  <span style={{ color: colours.greyText, fontSize: '12px', marginTop: '10px', display: 'block' }}>
                    Drag and drop a file or click to select one.
                  </span>
                  {field.helpText && (
                    <span style={{ color: colours.greyText, fontSize: '12px', display: 'block', marginTop: '5px' }}>
                      {field.helpText}
                    </span>
                  )}
                </div>
              );
            default:
              return (
                <TextField
                  key={index}
                  label={field.label}
                  required={field.required}
                  value={formValues[field.label]?.toString() || ''}
                  onChange={(_, value) => handleInputChange(field.label, value || '')}
                  type={field.type}
                  styles={{ fieldGroup: inputFieldStyle }}
                />
              );
          }
        })}
        <Stack horizontal tokens={{ childrenGap: 10 }}>
          <PrimaryButton text="Submit" onClick={handleSubmit} styles={{ root: buttonStyle }} />
          <DefaultButton text="Cancel" onClick={onCancel} styles={{ root: cancelButtonStyle }} />
        </Stack>
      </Stack>
    </div>
  );
};
