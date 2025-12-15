// src/CustomForms/BespokeForms.tsx
// invisible change

import React from 'react';
import {
  Stack,
  PrimaryButton,
  DefaultButton,
  ComboBox,
  IComboBox,
  IComboBoxOption,
  Dropdown,
  IDropdownOption,
} from '@fluentui/react';
import { mergeStyles } from '@fluentui/react';
import { colours } from '../app/styles/colours';
import { componentTokens } from '../app/styles/componentTokens';
import { getFormPrimaryButtonStyles, getFormDefaultButtonStyles, getDropdownStyles } from './shared/formStyles';
import { NormalizedMatter } from '../app/functionality/types';
import { useTheme } from '../app/functionality/ThemeContext';
import '../app/styles/MultiSelect.css';

export const INPUT_HEIGHT = 44;

export const formContainerStyle = mergeStyles({
  marginTop: '10px',
  padding: '1.5rem',
  backgroundColor: '#ffffff',
  borderRadius: 0,
  border: '1px solid rgba(0, 0, 0, 0.06)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  maxWidth: '900px',
  margin: '0 auto',
});

export const inputFieldStyle = mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  padding: '0 12px',
  border: '1px solid rgba(0, 0, 0, 0.1)',
  borderRadius: 0,
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
  fontSize: '14px',
  selectors: {
    ':hover': {
      borderColor: 'rgba(0, 0, 0, 0.15)',
    },
    ':focus': {
      borderColor: colours.highlight,
      outline: 'none',
    },
    input: {
      padding: '0 12px',
    },
  },
});

export const dropdownStyle = mergeStyles({
  width: '100%',
  height: `${INPUT_HEIGHT}px`,
  border: '1px solid rgba(0, 0, 0, 0.1)',
  borderRadius: 0,
  backgroundColor: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  boxSizing: 'border-box',
  fontSize: '14px',
  selectors: {
    ':hover': {
      borderColor: 'rgba(0, 0, 0, 0.15)',
    },
    ':focus-within': {
      borderColor: colours.highlight,
    },
    '.ms-Dropdown-title': {
      backgroundColor: 'transparent',
      border: 'none',
      boxShadow: 'none',
      padding: '0 12px',
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
  backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
  borderRight: 'none',
  borderTopLeftRadius: 0,
  borderBottomLeftRadius: 0,
  fontWeight: 600,
  padding: '0 8px',
  color: isDarkMode ? '#f1f5f9' : '#374151',
  fontSize: '14px',
});

export const amountInputStyle = (hasPrefix: boolean, isDarkMode: boolean) =>
  mergeStyles({
    flexGrow: 1,
    width: '100%',
    height: '100%',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
    borderRadius: 0,
    padding: '0 12px',
    backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
    boxSizing: 'border-box',
    appearance: 'textfield',
    fontSize: '14px',
    selectors: {
      ':hover': {
        borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(0, 0, 0, 0.15)',
      },
      ':focus': {
        borderColor: colours.highlight,
        outline: 'none',
      },
      '::-webkit-inner-spin-button, ::-webkit-outer-spin-button': {
        appearance: 'none',
        margin: 0,
      },
      input: {
        padding: '0 12px',
      },
    },
  });

export const toggleStyle = (isDarkMode: boolean) => mergeStyles({
  height: `${INPUT_HEIGHT}px`,
  backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
  color: isDarkMode ? '#f1f5f9' : '#1e293b',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
  borderRadius: 0,
  padding: '0 12px',
  selectors: {
    ':hover': {
      backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc',
    },
  },
});
  
  // One-off info-box styles for CHAPS guide & >£50k message
  export const infoBoxStyle = mergeStyles({
    backgroundColor: 'rgba(54, 144, 206, 0.06)',
    borderLeft: `3px solid ${colours.highlight}`,
    padding: '12px 16px',
    margin: '8px 0 16px',
    borderRadius: 0,
    fontSize: '13px',
    lineHeight: 1.5,
  });
  export const infoLinkStyle = mergeStyles({
    color: colours.highlight,
    textDecoration: 'underline',
    fontWeight: 500,
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
  hideButtons?: boolean; // Hide the default Submit/Clear/Cancel buttons
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
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState(value || '');
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Update search term when value changes externally
  React.useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Create clean options from matters data
  const options = React.useMemo(() => {
    if (!matters || matters.length === 0) {
      return [];
    }

    return matters
      .filter(m => m && (m.displayNumber || m.matterId))
      .sort((a, b) => {
        const dateA = new Date(a.openDate || '').getTime();
        const dateB = new Date(b.openDate || '').getTime();
        return dateB - dateA;
      })
      .slice(0, 1000)
      .map((m) => {
        const displayNum = m.displayNumber || m.matterId || '';
        const clientName = m.clientName || '';
        const desc = m.description || '';
        
        // Build searchable text for filtering
        let searchText = displayNum;
        if (clientName) searchText += ` ${clientName}`;
        if (desc) searchText += ` ${desc}`;
        
        return {
          key: displayNum,
          displayNumber: displayNum,
          clientName: clientName,
          description: desc,
          searchText: searchText.toLowerCase(),
        };
      });
  }, [matters]);

  // Filter options based on search term
  const filteredOptions = React.useMemo(() => {
    if (!searchTerm) return options.slice(0, 50);
    const lowerSearch = searchTerm.toLowerCase();
    return options
      .filter(opt => opt.searchText.includes(lowerSearch))
      .slice(0, 50);
  }, [options, searchTerm]);

  const handleSelect = (option: { key: string; displayNumber: string }) => {
    setSearchTerm(option.key);
    handleInputChange(field.name, option.key);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div className="question-banner">{field.label}</div>
      <input
        type="text"
        placeholder="Search by matter number or client name..."
        required={field.required}
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          handleInputChange(field.name, e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        disabled={isSubmitting}
        style={{
          width: '100%',
          height: `${INPUT_HEIGHT}px`,
          lineHeight: `${INPUT_HEIGHT}px`,
          padding: '0 32px 0 12px',
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
          borderRadius: 0,
          fontSize: '14px',
          backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
          color: isDarkMode ? '#f1f5f9' : '#1e293b',
          boxSizing: 'border-box',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${isDarkMode ? '%2394a3b8' : '%2364748b'}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          backgroundSize: '16px',
        }}
      />
      {isOpen && filteredOptions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            background: isDarkMode ? '#1e293b' : '#ffffff',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
            borderTop: 'none',
            boxShadow: isDarkMode
              ? '0 8px 24px rgba(0, 0, 0, 0.4)'
              : '0 8px 24px rgba(0, 0, 0, 0.12)',
            maxHeight: '280px',
            overflowY: 'auto',
          }}
        >
          {filteredOptions.map((opt) => (
            <div
              key={opt.key}
              onClick={() => handleSelect(opt)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
                transition: 'background-color 0.1s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isDarkMode
                  ? 'rgba(148, 163, 184, 0.15)'
                  : 'rgba(0, 0, 0, 0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {/* Reference number - prominent */}
              <div style={{
                fontWeight: 600,
                fontSize: '14px',
                color: isDarkMode ? '#e2e8f0' : '#374151',
                marginBottom: '2px',
              }}>
                {opt.displayNumber}
              </div>
              {/* Client name - secondary */}
              {opt.clientName && (
                <div style={{
                  fontSize: '13px',
                  color: isDarkMode ? '#94a3b8' : '#6b7280',
                }}>
                  {opt.clientName}
                </div>
              )}
              {/* Description - subtle */}
              {opt.description && (
                <div style={{
                  fontSize: '12px',
                  color: isDarkMode ? '#64748b' : '#9ca3af',
                  marginTop: '2px',
                }}>
                  {opt.description.length > 60 ? opt.description.substring(0, 60) + '...' : opt.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
  hideButtons = false,
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
          padding: '1.5rem',
          background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#ffffff',
          borderRadius: 0,
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)'}`,
          boxShadow: isDarkMode
            ? '0 4px 16px rgba(0, 0, 0, 0.25)'
            : '0 4px 16px rgba(0, 0, 0, 0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '900px',
          margin: '0 auto',
        }}
      >
        <Stack tokens={{ childrenGap: 12 }}>
          {(() => {
            // Group fields by their 'group' property for side-by-side rendering
            const groupedFields: { group: string | undefined; fields: { field: FormField; index: number }[] }[] = [];
            let currentGroup: { group: string | undefined; fields: { field: FormField; index: number }[] } | null = null;
            
            fields.forEach((field, index) => {
              if (field.group) {
                if (currentGroup && currentGroup.group === field.group) {
                  currentGroup.fields.push({ field, index });
                } else {
                  if (currentGroup) groupedFields.push(currentGroup);
                  currentGroup = { group: field.group, fields: [{ field, index }] };
                }
              } else {
                if (currentGroup) {
                  groupedFields.push(currentGroup);
                  currentGroup = null;
                }
                groupedFields.push({ group: undefined, fields: [{ field, index }] });
              }
            });
            if (currentGroup) groupedFields.push(currentGroup);

            return groupedFields.map((groupItem, groupIndex) => {
              // Render grouped fields side-by-side
              if (groupItem.group && groupItem.fields.length > 1) {
                return (
                  <Stack key={`group-${groupIndex}`} horizontal tokens={{ childrenGap: 16 }} verticalAlign="end">
                    {groupItem.fields.map(({ field, index }) => (
                      <div key={index} style={{ flex: 1 }}>
                        {renderField(field, index)}
                      </div>
                    ))}
                  </Stack>
                );
              }
              // Render single field
              const { field, index } = groupItem.fields[0];
              return renderField(field, index);
            });

            function renderField(field: FormField, index: number) {
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
                const dropdownOptions: IDropdownOption[] = (field.options || []).map((opt) => ({
                  key: opt,
                  text: opt,
                }));
                return (
                  <div key={index}>
                    {questionBanner}
                    <Dropdown
                      placeholder={`Select ${field.label}`}
                      selectedKey={formValues[field.name] || undefined}
                      options={dropdownOptions}
                      onChange={(_, option) => {
                        if (option) {
                          handleInputChange(field.name, option.key as string);
                        }
                      }}
                      disabled={isSubmitting}
                      styles={getDropdownStyles(isDarkMode)}
                    />
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
                const isChecked = Boolean(formValues[field.name] ?? field.defaultValue);
                return (
                  <div key={index}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: isChecked 
                          ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                          : (isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(0, 0, 0, 0.02)'),
                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.1)'}`,
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        transition: '0.15s',
                        opacity: isSubmitting ? 0.6 : 1,
                      }}
                      onClick={() => !isSubmitting && handleInputChange(field.name, !isChecked)}
                    >
                      <div>
                        <div style={{ 
                          fontSize: '12px', 
                          fontWeight: 500, 
                          color: isChecked 
                            ? (isDarkMode ? colours.highlight : colours.highlight)
                            : (isDarkMode ? '#e2e8f0' : '#374151'),
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}>
                          {field.label}{field.required ? ' *' : ''}
                          {isChecked && (
                            <span style={{
                              fontSize: '9px',
                              background: colours.highlight,
                              color: '#ffffff',
                              padding: '1px 5px',
                              fontWeight: 700,
                            }}>YES</span>
                          )}
                        </div>
                        {field.helpText && (
                          <div style={{ 
                            fontSize: '10px', 
                            color: isDarkMode ? '#94a3b8' : '#6b7280', 
                            marginTop: '2px' 
                          }}>
                            {field.helpText}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          width: '36px',
                          height: '18px',
                          background: isChecked ? colours.highlight : (isDarkMode ? '#475569' : '#d1d5db'),
                          position: 'relative',
                          transition: '0.2s',
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: '14px',
                            height: '14px',
                            background: '#ffffff',
                            position: 'absolute',
                            top: '2px',
                            left: isChecked ? '20px' : '2px',
                            transition: '0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                          }}
                        />
                      </div>
                    </div>
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
                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                        borderRadius: 0,
                        padding: '10px 12px',
                        boxSizing: 'border-box',
                        backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
                        color: isDarkMode ? '#f1f5f9' : '#1e293b',
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
                        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                        borderRadius: 0,
                        padding: '0 12px',
                        boxSizing: 'border-box',
                        backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
                        color: isDarkMode ? '#f1f5f9' : '#1e293b',
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
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                            borderTopRightRadius: 0,
                            borderBottomRightRadius: 0,
                            borderLeft: 'none',
                            padding: '0 12px',
                            boxSizing: 'border-box',
                            backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
                            color: isDarkMode ? '#f1f5f9' : '#1e293b',
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
                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
                          borderRadius: 0,
                          padding: '0 12px',
                          boxSizing: 'border-box',
                          backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#ffffff',
                          color: isDarkMode ? '#f1f5f9' : '#1e293b',
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
                      styles={getFormPrimaryButtonStyles(isDarkMode)}
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
                        border: `2px dashed ${isDragging ? colours.highlight : (isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)')}`,
                        borderRadius: 0,
                        background: isDarkMode 
                          ? 'rgba(15, 23, 42, 0.5)'
                          : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: isDragging 
                          ? (isDarkMode ? '0 4px 12px rgba(54, 144, 206, 0.2)' : '0 4px 12px rgba(54, 144, 206, 0.15)')
                          : 'none',
                        color: isDarkMode ? '#94a3b8' : '#6b7280',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        fontSize: 13,
                        fontWeight: 500,
                        userSelect: 'none',
                        transform: isDragging ? 'scale(1.01)' : 'scale(1)',
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
          }
          })()}
          {children}
          {!hideButtons && (
            <Stack horizontal tokens={{ childrenGap: 10 }}>
              <PrimaryButton
                type="submit"
                text={isSubmitting ? 'Submitted' : 'Submit'}
                iconProps={conflict ? { iconName: 'Lock' } : undefined}
                styles={
                  conflict ? getFormDefaultButtonStyles(isDarkMode) : getFormPrimaryButtonStyles(isDarkMode)
                }
                disabled={isSubmitting || conflict}
              />
              <DefaultButton
                type="button"
                text="Clear"
                onClick={handleClear}
                styles={getFormDefaultButtonStyles(isDarkMode)}
                disabled={isSubmitting}
              />
            </Stack>
          )}
        </Stack>
      </div>
    </form>
  );
};

export default BespokeForm;