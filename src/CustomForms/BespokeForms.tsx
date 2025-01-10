// src/CustomForms/BespokeForms.tsx

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
import { colours } from '../app/styles/colours'; // Corrected import path
import { sharedPrimaryButtonStyles, sharedDefaultButtonStyles } from '../app/styles/ButtonStyles'; // Corrected import path

// Type Guard to check if a value is a File
const isFile = (value: any): value is File => {
  return value instanceof File;
};

// Define a consistent height for all input fields
export const INPUT_HEIGHT = 40;

// Container styling for the entire form
export const formContainerStyle = mergeStyles({
  marginTop: '10px',
  padding: '20px',
  backgroundColor: colours.light.sectionBackground,
  borderRadius: '4px',
  boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)', // Subtle shadow
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
});

// Input field styling
export const inputFieldStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  padding: '5px', // Ensuring 5px padding
  borderRadius: '4px',
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
    'input': {
      padding: '0 5px', // Additional padding inside the input
    },
  },
});

// Dropdown styling
export const dropdownStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  borderRadius: '4px',
  backgroundColor: colours.light.inputBackground,
  display: 'flex',
  alignItems: 'center',
  border: 'none', // No border by default
  padding: '0 5px', // Added padding to prevent text from touching edges
  selectors: {
    ':hover': {
      border: `1px solid ${colours.light.cta}`, // Show border on hover
    },
    ':focus-within': {
      border: `1px solid ${colours.light.cta}`, // Show border when focused
    },
    '.ms-Dropdown-title': {
      backgroundColor: 'transparent', // Transparent background for the selected item
      border: 'none', // No border for the selected item
      boxShadow: 'none', // Remove any shadow
      padding: '0 5px', // Add padding to align text
      height: '100%', // Ensure it fills the height
      lineHeight: `${INPUT_HEIGHT}px`, // Vertically center the text
    },
    '.ms-Dropdown-item.is-selected': {
      backgroundColor: 'transparent', // Transparent for the selected item
      border: 'none', // Remove border or outline
      outline: 'none',
    },
    '.ms-Dropdown-caretDown': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
    },
  },
});

// Container for amount and prefix
export const amountContainerStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  height: `${INPUT_HEIGHT}px`,
});

// Prefix (£) styling
export const prefixStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '50px', // Fixed width for consistency
  height: '100%',
  backgroundColor: colours.light.sectionBackground,
  border: `1px solid ${colours.light.border}`,
  borderRight: 'none',
  borderTopLeftRadius: '4px',
  borderBottomLeftRadius: '4px',
  fontWeight: 'bold',
  padding: '0 5px', // Added padding
});

// **Updated: Amount input field styling as a function**
export const amountInputStyle = (hasPrefix: boolean) => mergeStyles({
  flexGrow: 1,
  height: '100%',
  borderLeft: hasPrefix ? 'none' : `1px solid ${colours.light.border}`,
  borderTopLeftRadius: hasPrefix ? '0' : '4px',
  borderBottomLeftRadius: hasPrefix ? '0' : '4px',
  borderTopRightRadius: '4px',
  borderBottomRightRadius: '4px',
  padding: '5px', // Ensuring 5px padding
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
    'input': {
      padding: '0 5px', // Additional padding inside the input
    },
  },
});

// Toggle styling
export const toggleStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  selectors: {
    ':hover': {
      backgroundColor: colours.light.cardHover,
    },
  },
});

// Button styling
export const buttonStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  padding: '0 20px',
  borderRadius: '4px',
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
export const cancelButtonStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  padding: '0 20px',
  borderRadius: '4px',
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

// **Define and Export FormField Interface**
export interface FormField {
  label: string;
  name: string;
  type: 'text' | 'number' | 'textarea' | 'dropdown' | 'toggle' | 'currency-picker' | 'file';
  options?: string[]; // For dropdowns
  step?: number; // For number inputs
  min?: number; // Minimum value for number inputs
  max?: number; // Maximum value for number inputs
  editable?: boolean; // For number inputs
  required?: boolean;
  defaultValue?: boolean | string | number | File; // Included File type
  prefix?: string; // Added
  helpText?: string; // Added
  placeholder?: string; // Added
  group?: string; // Grouping fields (e.g., date range)
}

// **Update Form Props Interface to Use FormField**
export interface BespokeFormProps {
  fields: FormField[]; // Use the exported FormField interface
  onSubmit: (values: { [key: string]: string | number | boolean | File }) => void; // Included File type
  onCancel: () => void;
  isSubmitting?: boolean; // Optional prop for handling loading state
  style?: React.CSSProperties; // Added style prop
}

// Bespoke Form Component
const BespokeForm: React.FC<BespokeFormProps> = ({
  fields,
  onSubmit,
  onCancel,
  isSubmitting = false,
  style,
}) => {
  const [formValues, setFormValues] = React.useState<{ [key: string]: string | number | boolean | File }>({});

  const handleInputChange = (field: string, value: string | number | boolean | File) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (field: string, file: File | null) => {
    if (file) {
      handleInputChange(field, file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formValues);
  };

  return (
    <form onSubmit={handleSubmit} style={style}>
      <div className={formContainerStyle}>
        <Stack tokens={{ childrenGap: 20 }}>
          {fields.map((field, index) => {
            // Handle grouped fields separately
            if (field.group === 'dateRange') {
              return (
                <Stack horizontal tokens={{ childrenGap: 10 }} key={index}>
                  <TextField
                    label={field.label}
                    required={field.required}
                    placeholder={field.placeholder}
                    type={field.type}
                    value={formValues[field.name]?.toString() || ''}
                    onChange={(e, value) => handleInputChange(field.name, value || '')}
                    styles={{
                      fieldGroup: inputFieldStyle,
                      field: {
                        padding: '0 5px', // Ensuring padding inside grouped fields
                      },
                    }}
                  />
                </Stack>
              );
            }

            switch (field.type) {
              case 'dropdown':
                return (
                  <Dropdown
                    key={index}
                    label={field.label}
                    options={(field.options || []).map((opt) => ({ key: opt, text: opt }))}
                    onChange={(_, option) => handleInputChange(field.name, option?.key || '')}
                    required={field.required}
                    disabled={isSubmitting}
                    styles={{
                      dropdown: dropdownStyle,
                      title: {
                        height: `${INPUT_HEIGHT}px`,
                        lineHeight: `${INPUT_HEIGHT}px`,
                        padding: '0 5px',
                        borderRadius: '4px',
                        backgroundColor: colours.light.inputBackground,
                      },
                      caretDown: {
                        padding: '0 5px',
                      },
                    }}
                  />
                );
              case 'toggle':
                return (
                  <div key={index} style={{ marginBottom: '15px' }}>
                    <Toggle
                      label={field.label}
                      checked={Boolean(formValues[field.name])}
                      onChange={(_, checked) => handleInputChange(field.name, checked || false)}
                      disabled={isSubmitting}
                      styles={{
                        root: toggleStyle,
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
                    value={formValues[field.name]?.toString() || ''}
                    onChange={(e, value) => handleInputChange(field.name, value || '')}
                    disabled={isSubmitting}
                    styles={{
                      fieldGroup: inputFieldStyle,
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
                        value={formValues[field.name]?.toString() || ''}
                        onChange={(e, value) => handleInputChange(field.name, value || '')}
                        type={field.type === 'currency-picker' ? 'text' : 'number'}
                        disabled={isSubmitting}
                        styles={{
                          fieldGroup: amountInputStyle(!!field.prefix), // **Pass hasPrefix here**
                        }}
                        step={field.step}
                        min={field.min}
                        max={field.max}
                        readOnly={field.editable === false} // Correctly apply readOnly based on editable prop
                      />
                    </div>
                    {field.helpText && (
                      <span style={{ color: colours.greyText, fontSize: '12px', marginTop: '10px', display: 'block' }}>
                        {field.helpText}
                      </span>
                    )}
                  </div>
                );
              case 'file': // Updated 'file' case
                const fileValue = formValues[field.name]; // Extract the value

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
                      styles={sharedPrimaryButtonStyles}
                      disabled={isSubmitting}
                    />
                    <input
                      id={`file-input-${index}`}
                      type="file"
                      required={field.required}
                      onChange={(e) =>
                        handleFileChange(field.name, e.target.files ? e.target.files[0] : null)
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
                    value={formValues[field.name]?.toString() || ''}
                    onChange={(e, value) => handleInputChange(field.name, value || '')}
                    type={field.type}
                    disabled={isSubmitting}
                    styles={{ 
                      fieldGroup: inputFieldStyle,
                      field: {
                        padding: '0 5px', // Ensuring padding inside the input
                      },
                    }}
                  />
                );
            }
          })}

          {/* Submit and Cancel Buttons */}
          <Stack horizontal tokens={{ childrenGap: 10 }}>
            <PrimaryButton
              type="submit"
              text={isSubmitting ? "Submitting..." : "Submit"}
              styles={sharedPrimaryButtonStyles}
              disabled={isSubmitting}
            />
            <DefaultButton
              type="button"
              text="Cancel"
              onClick={onCancel}
              styles={sharedDefaultButtonStyles}
              disabled={isSubmitting}
            />
          </Stack>
        </Stack>
      </div>
    </form>
  );
};

export default BespokeForm;
