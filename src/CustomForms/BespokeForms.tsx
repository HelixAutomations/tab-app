// src/CustomForms/BespokeForms.tsx
// invisible change

import React from 'react';
import {
  Stack,
  Toggle,
  PrimaryButton,
  DefaultButton,
  ComboBox,
  IComboBox,
  IComboBoxOption,
} from '@fluentui/react';
import { mergeStyles } from '@fluentui/react';
import { colours } from '../app/styles/colours';
import { componentTokens } from '../app/styles/componentTokens';
import {
  sharedPrimaryButtonStyles,
  sharedDefaultButtonStyles,
} from '../app/styles/ButtonStyles';
import { NormalizedMatter } from '../app/functionality/types';
import { useTheme } from '../app/functionality/ThemeContext';
import '../app/styles/MultiSelect.css';

export const INPUT_HEIGHT = 40;

export const formContainerStyle = mergeStyles({
  marginTop: '10px',
  padding: '20px',
  backgroundColor: colours.light.sectionBackground,
  borderRadius: componentTokens.stepHeader.base.borderRadius,
  border: `1px solid ${componentTokens.stepContent.borderColor}`,
  boxShadow: componentTokens.stepContent.boxShadow,
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const inputFieldStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  padding: '5px',
  border: `1px solid ${colours.highlight}`,
  borderRadius: 0,
  backgroundColor: colours.light.sectionBackground,
  boxSizing: 'border-box',
  selectors: {
    ':hover': {
      borderColor: colours.highlight,
    },
    ':focus': {
      borderColor: colours.highlight,
    },
    input: {
      padding: '0 5px',
    },
  },
});

export const dropdownStyle = mergeStyles({
  width: '100%',
  height: `${INPUT_HEIGHT}px`,
  border: `1px solid ${colours.highlight}`,
  borderRadius: 0,
  backgroundColor: '#fff',
  display: 'flex',
  alignItems: 'center',
  padding: '0 5px',
  boxSizing: 'border-box',
  selectors: {
    ':hover': {
      borderColor: colours.highlight,
    },
    ':focus-within': {
      borderColor: colours.highlight,
    },
    '.ms-Dropdown-title': {
      backgroundColor: 'transparent',
      border: 'none',
      boxShadow: 'none',
      padding: '0 5px',
      height: '100%',
      lineHeight: `${INPUT_HEIGHT}px`,
    },
    '.ms-Dropdown-caretDown': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
    },
    '.ms-ComboBox-CaretDown-button': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      border: 'none',
      backgroundColor: 'transparent',
    },
  },
});

export const amountContainerStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: `${INPUT_HEIGHT}px`,
});

export const prefixStyle = (isDarkMode: boolean) => mergeStyles({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '50px',
  height: '100%',
  backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : colours.light.sectionBackground,
  border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : colours.highlight}`,
  borderRight: 'none',
  borderTopLeftRadius: '8px',
  borderBottomLeftRadius: '8px',
  fontWeight: 'bold',
  padding: '0 5px',
  color: isDarkMode ? colours.dark.text : colours.light.text,
});

export const amountInputStyle = (hasPrefix: boolean, isDarkMode: boolean) =>
  mergeStyles({
    flexGrow: 1,
    width: '100%',
    height: '100%',
    border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : colours.highlight}`,
    borderRadius: 0,
    padding: '5px',
    backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : colours.light.sectionBackground,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    boxSizing: 'border-box',
    appearance: 'textfield',
    selectors: {
      ':hover': {
        borderColor: colours.highlight,
      },
      ':focus': {
        borderColor: colours.highlight,
      },
      '::-webkit-inner-spin-button, ::-webkit-outer-spin-button': {
        appearance: 'none',
        margin: 0,
      },
      input: {
        padding: '0 5px',
      },
    },
  });

export const toggleStyle = (isDarkMode: boolean) => mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  backgroundColor: isDarkMode ? colours.dark.inputBackground : componentTokens.toggleButton.base.backgroundColor,
  color: isDarkMode ? colours.dark.text : componentTokens.toggleButton.base.color,
  border: isDarkMode 
    ? `1px solid ${colours.dark.border}` 
    : componentTokens.toggleButton.base.border,
  borderRadius: componentTokens.toggleButton.base.borderRadius,
  padding: componentTokens.toggleButton.base.padding,
  selectors: {
    ':hover': {
      backgroundColor: isDarkMode 
        ? colours.dark.cardHover 
        : componentTokens.toggleButton.hover.backgroundColor,
    },
  },
});
  
  // One-off info-box styles for CHAPS guide & >£50k message
  export const infoBoxStyle = mergeStyles({
    backgroundColor: colours.light.sectionBackground,
    borderLeft: `4px solid ${colours.light.cta}`,
    padding: '10px 15px',
    margin: '5px 0 15px',
    borderRadius: '2px',
  });
  export const infoLinkStyle = mergeStyles({
    color: colours.light.cta,
    textDecoration: 'underline',
  });

export interface FormField {
  label: string;
  name: string;
  type:
    | 'number'
    | 'text'
    | 'textarea'
    | 'dropdown'
    | 'toggle'
    | 'currency-picker'
    | 'file'
    | 'message'
    | 'date'
    | 'time';
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
  styles?: { [key: string]: any };
  onText?: string;
  offText?: string;
  style?: React.CSSProperties;
  showIf?: { field: string; equals: any };
}

export interface BespokeFormProps {
  fields: FormField[];
  onSubmit: (values: { [key: string]: any }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  matters: NormalizedMatter[];
  onChange?: (values: { [key: string]: any }) => void;
  submitDisabled?: boolean;
  conflict?: boolean;
}

interface MatterReferenceDropdownProps {
  field: FormField;
  matters: NormalizedMatter[];
  handleInputChange: (fieldName: string, value: any) => void;
  isSubmitting: boolean;
  value: string;
  isDarkMode: boolean;
}

const MatterReferenceDropdown: React.FC<MatterReferenceDropdownProps> = ({
  field,
  matters,
  handleInputChange,
  isSubmitting,
  value,
  isDarkMode,
}) => {
  // Create clean options from matters data
  const options = React.useMemo<IComboBoxOption[]>(() => {
    if (!matters || matters.length === 0) {
      return [];
    }

    return matters
      .filter(m => m && (m.displayNumber || m.matterId))
      .sort((a, b) => {
        const dateA = new Date(a.openDate || '').getTime();
        const dateB = new Date(b.openDate || '').getTime();
        return dateB - dateA; // Most recent first
      })
      .slice(0, 1000) // Limit to 1000 most recent matters for performance
      .map((m) => {
        const displayNum = m.displayNumber || m.matterId || '';
        const desc = m.description || '';
        const feeEarner = m.responsibleSolicitor || '';
        
        let text = displayNum;
        if (feeEarner) {
          text += ` • ${feeEarner}`;
        }
        if (desc) {
          text += ` | ${desc}`;
        }
        
        return {
          key: displayNum,
          text: text,
        };
      });
  }, [matters]);

  return (
    <div>
      <div className="question-banner">{field.label}</div>
      <style>
        {`
          input[list]::-webkit-calendar-picker-indicator {
            display: none !important;
          }
          
          /* Style the datalist dropdown */
          datalist {
            background-color: ${isDarkMode ? '#1f2937' : '#ffffff'} !important;
            border: 1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.5)' : 'rgba(209, 213, 219, 0.8)'} !important;
            border-radius: 8px !important;
            box-shadow: ${isDarkMode ? '0 10px 25px rgba(0, 0, 0, 0.4)' : '0 10px 25px rgba(0, 0, 0, 0.1)'} !important;
            max-height: 300px !important;
            overflow-y: auto !important;
          }
          
          /* Style the datalist options */
          option {
            padding: 12px 16px !important;
            font-size: 14px !important;
            line-height: 1.5 !important;
            color: ${isDarkMode ? '#f3f4f6' : '#374151'} !important;
            background-color: ${isDarkMode ? '#1f2937' : '#ffffff'} !important;
            border-bottom: 1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.6)'} !important;
            cursor: pointer !important;
            transition: all 0.15s ease !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          }
          
          option:hover {
            background-color: ${isDarkMode ? '#374151' : '#f8fafc'} !important;
            color: ${isDarkMode ? '#ffffff' : '#111827'} !important;
          }
          
          option:last-child {
            border-bottom: none !important;
          }
          
          /* Better spacing and layout for the content */
          #matter-options-datalist option {
            white-space: normal !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            max-width: 500px !important;
            display: block !important;
            position: relative !important;
          }
          
          /* Enhanced visual hierarchy */
          option::before {
            content: '📋' !important;
            margin-right: 8px !important;
            opacity: 0.6 !important;
          }
        `}
      </style>
      <input
        type="text"
        placeholder="Select or enter Matter Reference"
        required={field.required}
        value={value || ''}
        onChange={(e) => handleInputChange(field.name, e.target.value)}
        disabled={isSubmitting}
        list="matter-options-datalist"
        style={{
          width: '100%',
          height: `${INPUT_HEIGHT}px`,
          lineHeight: `${INPUT_HEIGHT}px`,
          padding: '0 32px 0 12px',
          border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : colours.highlight}`,
          borderRadius: '8px',
          fontSize: '14px',
          backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : '#ffffff',
          color: isDarkMode ? colours.dark.text : colours.light.text,
          boxSizing: 'border-box',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${isDarkMode ? '%23f3f4f6' : '%23061733'}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          backgroundSize: '18px',
          cursor: 'pointer',
        }}
      />
      <datalist id="matter-options-datalist">
        {options.map((opt) => (
          <option key={opt.key} value={opt.text}>
          </option>
        ))}
      </datalist>
    </div>
  );
};

const BespokeForm: React.FC<BespokeFormProps> = ({
  fields,
  onSubmit,
  onCancel,
  isSubmitting = false,
  onChange,
  style,
  children,
  matters,
  conflict = false,
  submitDisabled = false,
}) => {
  const { isDarkMode } = useTheme();
  const [formValues, setFormValues] = React.useState<{ [key: string]: any }>(
    fields.reduce((acc, field) => {
      if (field.defaultValue !== undefined) {
        acc[field.name] = field.defaultValue;
      }
      return acc;
    }, {} as { [key: string]: any })
  );

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
    setFormValues((prev) => {
      const newValues = { ...prev, [fieldName]: value };
      if (onChange) {
        onChange(newValues);
      }
      return newValues;
    });
  };

  const handleFileChange = async (fieldName: string, file: File | null) => {
    if (!file) return;
    try {
      const base64 = await convertFileToBase64(file);
      const fileData = {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        base64: base64,
      };
      console.log(`File upload for field "${fieldName}":`, fileData);
      handleInputChange(fieldName, fileData);
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

  // Track drag-over state per file field to style the drop zone
  const [dragOver, setDragOver] = React.useState<Record<string, boolean>>({});

  return (
    <form onSubmit={handleSubmit} style={style}>
      <div 
        style={{
          marginTop: '10px',
          padding: '20px',
          background: isDarkMode
            ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 55%, rgba(10, 39, 72, 0.8) 100%)'
            : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
          borderRadius: '12px',
          border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.22)'}`,
          boxShadow: isDarkMode
            ? '0 18px 32px rgba(2, 6, 17, 0.58)'
            : '0 12px 28px rgba(13, 47, 96, 0.12)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <Stack tokens={{ childrenGap: 12 }}>
          {fields.map((field, index) => {
            if (
              field.label === 'Matter Reference' ||
              field.label === 'Matter Reference (if applicable)' ||
              field.label === 'File/ Matter Reference'
            ) {
              return (
                <MatterReferenceDropdown
                  key={index}
                  field={field}
                  matters={matters}
                  handleInputChange={handleInputChange}
                  isSubmitting={isSubmitting}
                  value={formValues[field.name]?.toString() || ''}
                  isDarkMode={isDarkMode}
                />
              );
            }

            if (field.showIf) {
              const controllingValue = formValues[field.showIf.field];
              if (controllingValue !== field.showIf.equals) {
                return null;
              }
            }

            const questionBanner = (
              <div className="question-banner">
                {field.label}
                {field.required ? ' *' : ''}
              </div>
            );

            switch (field.type) {
              case 'dropdown':
                return (
                  <div key={index}>
                    {questionBanner}
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: `${INPUT_HEIGHT}px`,
                        border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : colours.highlight}`,
                        background: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : '#fff',
                        overflow: 'hidden',
                        borderRadius: '8px',
                      }}
                    >
                      <select
                        value={formValues[field.name] || ''}
                        onChange={(e) => handleInputChange(field.name, e.target.value)}
                        required={field.required}
                        disabled={isSubmitting}
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                          background: 'transparent',
                          padding: '0 40px 0 16px',
                          fontSize: '14px',
                          appearance: 'none',
                          cursor: 'pointer',
                          outline: 'none',
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                        }}
                      >
                        <option value="" disabled>
                          Select {field.label}
                        </option>
                        {(field.options || []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <div
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          pointerEvents: 'none',
                          color: colours.highlight,
                        }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <path
                            d="M6 9l6 6 6-6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>
                    {field.name === 'Payment Type' &&
                      formValues['Payment Type'] === 'CHAPS (same day over £1m)' && (
                        <div className={infoBoxStyle}>
                          For accounts/ whoever making payment – please refer to this{' '}
                          <a
                            href="https://app.nuclino.com/Helix-Law-Limited/Team-Helix/CHAPS-Same-Day-Purpose-Codes-bc03cd9f-117c-4061-83a1-bdf18bd88072"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={infoLinkStyle}
                          >
                            guide
                          </a>.
                        </div>
                      )}
                  </div>
                );

              case 'toggle':
                return (
                  <div key={index}>
                    {questionBanner}
                    <Toggle
                      checked={Boolean(formValues[field.name] ?? field.defaultValue)}
                      onText={field.onText}
                      offText={field.offText}
                      onChange={(_, checked) => handleInputChange(field.name, !!checked)}
                      disabled={isSubmitting}
                      styles={{
                        root: toggleStyle(isDarkMode),
                        container: {
                          selectors: {
                            '.ms-Toggle-background': {
                              backgroundColor: isDarkMode ? colours.dark.border : '#d1d5db',
                              border: `1px solid ${isDarkMode ? colours.dark.border : '#d1d5db'}`,
                            },
                            '.ms-Toggle-background.is-checked': {
                              backgroundColor: `${colours.highlight} !important`,
                              borderColor: `${colours.highlight} !important`,
                            },
                            '.ms-Toggle-thumb': {
                              backgroundColor: isDarkMode ? colours.dark.text : '#ffffff',
                            },
                          },
                        },
                        label: {
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                        },
                      }}
                    />
                    {field.name === 'Is the amount you are sending over £50,000?' &&
                      formValues[field.name] === true && (
                        <div className={infoBoxStyle}>
                          Please note we will need to perform an extra verification check. Accounts will send a small random amount and a small random reference to the payee. You will need to ask them to confirm the amount and reference used before accounts can make the remaining balancing payment.
                        </div>
                      )}
                  </div>
                );

              case 'textarea':
                return (
                  <div key={index}>
                    {questionBanner}
                    <textarea
                      required={field.required}
                      value={formValues[field.name]?.toString() || ''}
                      onChange={(e) => handleInputChange(field.name, e.target.value)}
                      disabled={isSubmitting}
                      style={{
                        width: '100%',
                        minHeight: '80px',
                        border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : colours.highlight}`,
                        borderRadius: '8px',
                        padding: '10px 12px',
                        boxSizing: 'border-box',
                        backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : '#ffffff',
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        fontSize: '14px',
                      }}
                    />
                    {field.helpText && (
                      <span
                        style={{
                          color: colours.greyText,
                          fontSize: '12px',
                          marginTop: '4px',
                          display: 'block',
                        }}
                      >
                        {field.helpText}
                      </span>
                    )}
                  </div>
                );

              case 'date':
              case 'time':
                return (
                  <div key={index}>
                    {questionBanner}
                    <input
                      type={field.type}
                      required={field.required}
                      value={formValues[field.name]?.toString() || ''}
                      onChange={(e) => handleInputChange(field.name, e.target.value)}
                      disabled={isSubmitting}
                      step={field.step}
                      min={field.min}
                      max={field.max}
                      placeholder={field.placeholder}
                      style={{
                        width: '100%',
                        height: `${INPUT_HEIGHT}px`,
                        border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : colours.highlight}`,
                        borderRadius: '8px',
                        padding: '0 12px',
                        boxSizing: 'border-box',
                        backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : '#ffffff',
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        fontSize: '14px',
                      }}
                    />
                    {field.helpText && (
                      <span
                        style={{
                          color: colours.greyText,
                          fontSize: '12px',
                          marginTop: '4px',
                          display: 'block',
                        }}
                      >
                        {field.helpText}
                      </span>
                    )}
                  </div>
                );

              case 'number':
              case 'currency-picker':
              case 'text':
                return (
                  <div key={index} style={field.style}>
                    {questionBanner}
                    {field.prefix ? (
                      <div className={amountContainerStyle}>
                        <span className={prefixStyle(isDarkMode)}>{field.prefix}</span>
                        <input
                          type="number"
                          required={field.required}
                          value={formValues[field.name]?.toString() || ''}
                          onChange={(e) => handleInputChange(field.name, e.target.value)}
                          disabled={isSubmitting}
                          step={field.step}
                          min={field.min}
                          max={field.max}
                          style={{
                            width: '100%',
                            height: '100%',
                            border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : colours.highlight}`,
                            borderTopRightRadius: '8px',
                            borderBottomRightRadius: '8px',
                            borderLeft: 'none',
                            padding: '0 12px',
                            boxSizing: 'border-box',
                            backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : '#ffffff',
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            fontSize: '14px',
                          }}
                        />
                      </div>
                    ) : (
                      <input
                        type={field.type === 'number' || field.type === 'currency-picker' ? 'number' : 'text'}
                        required={field.required}
                        value={formValues[field.name]?.toString() || ''}
                        onChange={(e) => handleInputChange(field.name, e.target.value)}
                        disabled={isSubmitting}
                        step={field.step}
                        min={field.min}
                        max={field.max}
                        style={{
                          width: '100%',
                          height: `${INPUT_HEIGHT}px`,
                          border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : colours.highlight}`,
                          borderRadius: '8px',
                          padding: '0 12px',
                          boxSizing: 'border-box',
                          backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.8)' : '#ffffff',
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          fontSize: '14px',
                        }}
                      />
                    )}
                    {field.helpText && (
                      <span
                        style={{
                          color: colours.greyText,
                          fontSize: '12px',
                          marginTop: '4px',
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
                const isDragging = !!dragOver[field.name];
                const fileInputId = `file-input-${index}`;
                return (
                  <div key={index}>
                    {questionBanner}
                    <PrimaryButton
                      text="Upload File"
                      iconProps={{ iconName: 'Upload' }}
                      onClick={() => {
                        const fileInput = document.getElementById(fileInputId) as HTMLInputElement | null;
                        fileInput?.click();
                      }}
                      styles={sharedPrimaryButtonStyles}
                      disabled={isSubmitting}
                    />
                    <input
                      id={fileInputId}
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
                    {/* Drag-and-drop zone */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Drag and drop file here, or click to select"
                      onClick={() => {
                        const fileInput = document.getElementById(fileInputId) as HTMLInputElement | null;
                        fileInput?.click();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          const fileInput = document.getElementById(fileInputId) as HTMLInputElement | null;
                          fileInput?.click();
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                        setDragOver((prev) => ({ ...prev, [field.name]: true }));
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        setDragOver((prev) => ({ ...prev, [field.name]: true }));
                      }}
                      onDragLeave={() => {
                        setDragOver((prev) => ({ ...prev, [field.name]: false }));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver((prev) => ({ ...prev, [field.name]: false }));
                        const files = e.dataTransfer?.files;
                        if (files && files.length > 0) {
                          void handleFileChange(field.name, files[0]);
                        }
                      }}
                      style={{
                        marginTop: 8,
                        padding: '16px',
                        minHeight: 90,
                        border: `2px dashed ${isDragging ? colours.blue : (isDarkMode ? 'rgba(125, 211, 252, 0.24)' : colours.highlight)}`,
                        borderRadius: 12,
                        background: isDarkMode 
                          ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.6) 100%)'
                          : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: isDragging 
                          ? (isDarkMode ? '0 8px 20px rgba(59, 130, 246, 0.3)' : '0 8px 20px rgba(59, 130, 246, 0.15)')
                          : (isDarkMode ? '0 4px 10px rgba(0, 0, 0, 0.3)' : '0 4px 10px rgba(0, 0, 0, 0.05)'),
                        color: isDarkMode ? colours.dark.text : '#6b7280',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        fontSize: 13,
                        fontWeight: 500,
                        userSelect: 'none',
                        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
                      }}
                    >
                      Drag & drop a file here, or click to select
                    </div>
                    {fileValue?.fileName && (
                      <span
                        style={{
                          marginTop: '10px',
                          display: 'block',
                          fontSize: '14px',
                          color: isDarkMode ? colours.dark.text : colours.light.text,
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
                      You can also drag a file into the drop zone above.
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
                return null;
            }
          })}
          {children}
          <Stack horizontal tokens={{ childrenGap: 10 }}>
            <PrimaryButton
              type="submit"
              text={isSubmitting ? 'Submitted' : 'Submit'}
              iconProps={conflict ? { iconName: 'Lock' } : undefined}
              styles={
                conflict ? sharedDefaultButtonStyles : sharedPrimaryButtonStyles
              }
              disabled={isSubmitting || conflict}
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