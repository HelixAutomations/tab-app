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
import { colours } from '../app/styles/colours';
import { sharedPrimaryButtonStyles, sharedDefaultButtonStyles } from '../app/styles/ButtonStyles';

// Type Guard to check if a value is a File
const isFile = (value: any): value is File => {
  return value instanceof File;
};

export const INPUT_HEIGHT = 40;

export const formContainerStyle = mergeStyles({
  marginTop: '10px',
  padding: '20px',
  backgroundColor: colours.light.sectionBackground,
  borderRadius: '4px',
  boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
});

export const inputFieldStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  padding: '5px',
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
      padding: '0 5px',
    },
  },
});

export const dropdownStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  borderRadius: '4px',
  backgroundColor: colours.light.inputBackground,
  display: 'flex',
  alignItems: 'center',
  border: 'none',
  padding: '0 5px',
  selectors: {
    ':hover': {
      border: `1px solid ${colours.light.cta}`,
    },
    ':focus-within': {
      border: `1px solid ${colours.light.cta}`,
    },
    '.ms-Dropdown-title': {
      backgroundColor: 'transparent',
      border: 'none',
      boxShadow: 'none',
      padding: '0 5px',
      height: '100%',
      lineHeight: `${INPUT_HEIGHT}px`,
    },
    '.ms-Dropdown-item.is-selected': {
      backgroundColor: 'transparent',
      border: 'none',
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

export const amountContainerStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  height: `${INPUT_HEIGHT}px`,
});

export const prefixStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '50px',
  height: '100%',
  backgroundColor: colours.light.sectionBackground,
  border: `1px solid ${colours.light.border}`,
  borderRight: 'none',
  borderTopLeftRadius: '4px',
  borderBottomLeftRadius: '4px',
  fontWeight: 'bold',
  padding: '0 5px',
});

export const amountInputStyle = (hasPrefix: boolean) =>
  mergeStyles({
    flexGrow: 1,
    height: '100%',
    borderLeft: hasPrefix ? 'none' : `1px solid ${colours.light.border}`,
    borderTopLeftRadius: hasPrefix ? '0' : '4px',
    borderBottomLeftRadius: hasPrefix ? '0' : '4px',
    borderTopRightRadius: '4px',
    borderBottomRightRadius: '4px',
    padding: '5px',
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
        padding: '0 5px',
      },
    },
  });

export const toggleStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  selectors: {
    ':hover': {
      backgroundColor: colours.light.cardHover,
    },
  },
});

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

export interface FormField {
  label: string;
  name: string;
  type: 'text' | 'number' | 'textarea' | 'dropdown' | 'toggle' | 'currency-picker' | 'file';
  options?: string[];
  step?: number;
  min?: number;
  max?: number;
  editable?: boolean;
  required?: boolean;
  defaultValue?: boolean | string | number | File;
  prefix?: string;
  helpText?: string;
  placeholder?: string;
  group?: string;
}

export interface BespokeFormProps {
  fields: FormField[];
  onSubmit: (values: { [key: string]: string | number | boolean | File }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

const BespokeForm: React.FC<BespokeFormProps> = ({
  fields,
  onSubmit,
  onCancel,
  isSubmitting = false,
  style,
  children,
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
                      field: { padding: '0 5px' },
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
                    styles={{ dropdown: dropdownStyle }}
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
                      styles={{ root: toggleStyle }}
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
                    styles={{ fieldGroup: inputFieldStyle }}
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
                          fieldGroup: amountInputStyle(!!field.prefix),
                        }}
                        step={field.step}
                        min={field.min}
                        max={field.max}
                        readOnly={field.editable === false}
                      />
                    </div>
                    {field.helpText && (
                      <span style={{ color: colours.greyText, fontSize: '12px', marginTop: '10px', display: 'block' }}>
                        {field.helpText}
                      </span>
                    )}
                  </div>
                );
              case 'file':
                const fileValue = formValues[field.name];
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
                      onChange={(e) => handleFileChange(field.name, e.target.files ? e.target.files[0] : null)}
                      style={{ display: 'none' }}
                    />
                    {isFile(fileValue) && (
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
                      field: { padding: '0 5px' },
                    }}
                  />
                );
            }
          })}
          {children}
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
