// src/CustomForms/BespokeForms.tsx

import React from 'react';
import {
  Stack,
  Dropdown,
  Toggle,
  PrimaryButton,
  DefaultButton,
  TextField,
  ComboBox,
  IComboBoxOption,
} from '@fluentui/react';
import { mergeStyles } from '@fluentui/react';
import { colours } from '../app/styles/colours';
import {
  sharedPrimaryButtonStyles,
  sharedDefaultButtonStyles,
  sharedDraftConfirmedButtonStyles,
} from '../app/styles/ButtonStyles';
import { Matter } from '../app/functionality/types'; // NEW: Import Matter type

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
  border: `1px solid ${colours.light.border}`,
  borderRadius: '4px',
  backgroundColor: colours.light.inputBackground,
  boxSizing: 'border-box',
  selectors: {
    ':hover': {
      borderColor: colours.light.cta,
    },
    ':focus': {
      borderColor: colours.light.cta,
    },
    input: {
      padding: '0 5px',
    },
  },
});

export const dropdownStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  border: `1px solid ${colours.light.border}`,
  borderRadius: '4px',
  backgroundColor: colours.light.inputBackground,
  display: 'flex',
  alignItems: 'center',
  padding: '0 5px',
  boxSizing: 'border-box',
  selectors: {
    ':hover': {
      borderColor: colours.light.cta,
    },
    ':focus-within': {
      borderColor: colours.light.cta,
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
    border: `1px solid ${colours.light.border}`,
    borderRadius: '4px',
    padding: '5px',
    backgroundColor: colours.light.inputBackground,
    boxSizing: 'border-box',
    selectors: {
      ':hover': {
        borderColor: colours.light.cta,
      },
      ':focus': {
        borderColor: colours.light.cta,
      },
      input: {
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

export interface FormField {
  label: string;
  name: string;
  type:
    | 'text'
    | 'number'
    | 'textarea'
    | 'dropdown'
    | 'toggle'
    | 'currency-picker'
    | 'file';
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

// Update the BespokeFormProps interface to include a matters prop.
export interface BespokeFormProps {
  fields: FormField[];
  onSubmit: (values: { [key: string]: any }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  matters: Matter[]; // NEW: Pass matters data for Matter Reference dropdowns
}

/* ─── NEW: MatterReferenceDropdown Component ──────────────────────────────── */

interface MatterReferenceDropdownProps {
  field: FormField;
  matters: Matter[];
  handleInputChange: (fieldName: string, value: any) => void;
  isSubmitting: boolean;
}

const MatterReferenceDropdown: React.FC<MatterReferenceDropdownProps> = ({
  field,
  matters,
  handleInputChange,
  isSubmitting,
}) => {
  const [filter, setFilter] = React.useState<string>('');

  // Sort matters by OpenDate and map to IComboBoxOption format.
  const sortedOptions = React.useMemo<IComboBoxOption[]>(() => {
    return matters
      .slice()
      .sort(
        (a, b) =>
          new Date(b.OpenDate).getTime() - new Date(a.OpenDate).getTime()
      )
      .map((m) => ({
        key: m.DisplayNumber,
        text: m.DisplayNumber,
      }));
  }, [matters]);

  return (
    <ComboBox
      label={field.label}
      placeholder="Select or enter Matter Reference"
      required={field.required}
      options={sortedOptions}
      allowFreeform
      autoComplete="on"
      onInputValueChange={(value: string) => setFilter(value)}
      onChange={(_, option, __, value) => {
        const selectedValue = option ? option.key : value;
        handleInputChange(field.name, selectedValue);
      }}
      onResolveOptions={(): IComboBoxOption[] => {
        if (!filter) return sortedOptions;
        return sortedOptions.filter((opt) =>
          opt.text.toLowerCase().includes(filter.toLowerCase())
        );
      }}
      disabled={isSubmitting}
      // ── Override ComboBox styles to mimic a standard Dropdown ──
      styles={{
        root: dropdownStyle,
        input: {
          height: `${INPUT_HEIGHT}px`,
          lineHeight: `${INPUT_HEIGHT}px`,
          padding: '0 5px',
          border: 'none', // Remove ComboBox's inner border so the outer container shows the dropdownStyle border.
        },
        callout: {
          minWidth: '100%',
        },
      }}
    />
  );
};

/* ─── End of NEW Component ─────────────────────────────────────────────────── */

const BespokeForm: React.FC<BespokeFormProps> = ({
  fields,
  onSubmit,
  onCancel,
  isSubmitting = false,
  style,
  children,
  matters,
}) => {
  const [formValues, setFormValues] = React.useState<{ [key: string]: any }>({});

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('FileReader result was not a string'));
        }
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleInputChange = (fieldName: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleFileChange = async (fieldName: string, file: File | null) => {
    if (!file) return;
    try {
      const base64 = await convertFileToBase64(file);
      handleInputChange(fieldName, {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        base64: base64,
      });
    } catch (err) {
      console.error('File read error:', err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formValues);
  };

  const handleClear = () => {
    setFormValues({});
  };

  return (
    <form onSubmit={handleSubmit} style={style}>
      <div className={formContainerStyle}>
        <Stack tokens={{ childrenGap: 20 }}>
          {fields.map((field, index) => {
            // Use the new MatterReferenceDropdown for Matter Reference fields.
            if (
              field.label === 'Matter Reference' ||
              field.label === 'Matter Reference (if applicable)'
            ) {
              return (
                <MatterReferenceDropdown
                  key={index}
                  field={field}
                  matters={matters}
                  handleInputChange={handleInputChange}
                  isSubmitting={isSubmitting}
                />
              );
            }

            if (field.group === 'dateRange') {
              return (
                <Stack horizontal tokens={{ childrenGap: 10 }} key={index}>
                  <TextField
                    label={field.label}
                    required={field.required}
                    placeholder={field.placeholder}
                    type={field.type}
                    value={formValues[field.name]?.toString() || ''}
                    onChange={(e, value) =>
                      handleInputChange(field.name, value || '')
                    }
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
                    options={(field.options || []).map((opt) => ({
                      key: opt,
                      text: opt,
                    }))}
                    onChange={(_, option) =>
                      handleInputChange(field.name, option?.key || '')
                    }
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
                      onChange={(_, checked) =>
                        handleInputChange(field.name, !!checked)
                      }
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
                    onChange={(e, value) =>
                      handleInputChange(field.name, value || '')
                    }
                    disabled={isSubmitting}
                    styles={{ fieldGroup: inputFieldStyle }}
                  />
                );
              case 'number':
              case 'currency-picker':
                return (
                  <div key={index}>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '5px',
                        fontWeight: 600,
                      }}
                    >
                      {field.label}
                      {field.required && ' *'}
                    </label>
                    <div className={amountContainerStyle}>
                      {field.prefix && (
                        <span className={prefixStyle}>{field.prefix}</span>
                      )}
                      <TextField
                        required={field.required}
                        value={formValues[field.name]?.toString() || ''}
                        onChange={(e, value) =>
                          handleInputChange(field.name, value || '')
                        }
                        type={
                          field.type === 'currency-picker' ? 'text' : 'number'
                        }
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
                      <span
                        style={{
                          color: colours.greyText,
                          fontSize: '12px',
                          marginTop: '10px',
                          display: 'block',
                        }}
                      >
                        {field.helpText}
                      </span>
                    )}
                  </div>
                );
              case 'file':
                const fileValue = formValues[field.name];
                return (
                  <div key={index} style={{ marginBottom: '15px' }}>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '5px',
                        fontWeight: 600,
                      }}
                    >
                      {field.label}
                      {field.required && ' *'}
                    </label>
                    <PrimaryButton
                      text="Upload File"
                      iconProps={{ iconName: 'Upload' }}
                      onClick={() => {
                        const fileInput = document.getElementById(
                          `file-input-${index}`
                        );
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
                        handleFileChange(
                          field.name,
                          e.target.files ? e.target.files[0] : null
                        )
                      }
                      style={{ display: 'none' }}
                    />
                    {fileValue?.fileName && (
                      <span
                        style={{
                          marginTop: '10px',
                          display: 'block',
                          fontSize: '14px',
                        }}
                      >
                        Selected File: {fileValue.fileName}
                      </span>
                    )}
                    <span
                      style={{
                        color: colours.greyText,
                        fontSize: '12px',
                        marginTop: '10px',
                        display: 'block',
                      }}
                    >
                      Drag and drop a file or click to select one.
                    </span>
                    {field.helpText && (
                      <span
                        style={{
                          color: colours.greyText,
                          fontSize: '12px',
                          display: 'block',
                          marginTop: '5px',
                        }}
                      >
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
                    onChange={(e, value) =>
                      handleInputChange(field.name, value || '')
                    }
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
              text={isSubmitting ? 'Submitted' : 'Submit'}
              styles={
                isSubmitting
                  ? sharedDraftConfirmedButtonStyles
                  : sharedPrimaryButtonStyles
              }
              disabled={isSubmitting}
            />
            <DefaultButton
              type="button"
              text="Clear"
              onClick={handleClear}
              styles={sharedDefaultButtonStyles}
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
