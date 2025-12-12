// src/CustomForms/NotableCaseInfoForm.tsx

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Stack,
  Text,
  TextField,
  PrimaryButton,
  DefaultButton,
  MessageBar,
  MessageBarType,
  Toggle,
  Icon,
} from '@fluentui/react';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
import { NormalizedMatter, UserData } from '../app/functionality/types';
import { useTheme } from '../app/functionality/ThemeContext';
import {
  getFormContainerStyle,
  getFormScrollContainerStyle,
  getFormCardStyle,
  getFormHeaderStyle,
  getFormSectionStyle,
  getFormSectionHeaderStyle,
  getInputStyles,
  getFormPrimaryButtonStyles,
  getFormDefaultButtonStyles,
  formAccentColors
} from './shared/formStyles';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface NotableCaseInfoFormProps {
  users?: UserData[];
  matters: NormalizedMatter[];
  onBack?: () => void;
  onSubmitSuccess?: (message: string) => void;
  onSubmitError?: (error: string) => void;
}

interface FormData {
  initials: string;
  context_type: 'C' | 'P';
  display_number: string;
  prospect_id: string;
  merit_press: string;
  summary: string;
  value_in_dispute: string;
  value_in_dispute_exact?: string;
  c_reference_status: boolean;
  counsel_instructed: boolean;
  counsel_name: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const NotableCaseInfoForm: React.FC<NotableCaseInfoFormProps> = ({
  users,
  matters,
  onBack,
  onSubmitSuccess,
  onSubmitError,
}) => {
  const { isDarkMode } = useTheme();
  const accentColor = formAccentColors.techIdea; // Blue accent

  // ─────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────

  const [formData, setFormData] = useState<FormData>({
    initials: '',
    context_type: 'C',
    display_number: '',
    prospect_id: '',
    merit_press: '',
    summary: '',
    value_in_dispute: '',
    value_in_dispute_exact: undefined,
    c_reference_status: false,
    counsel_instructed: false,
    counsel_name: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitMessage, setSubmitMessage] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [matterDropdownOpen, setMatterDropdownOpen] = useState(false);
  const [matterSearchTerm, setMatterSearchTerm] = useState('');
  const [valueDropdownOpen, setValueDropdownOpen] = useState(false);
  const matterFieldRef = useRef<HTMLDivElement>(null);
  const valueFieldRef = useRef<HTMLDivElement>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // STYLES
  // ─────────────────────────────────────────────────────────────────────────

  const containerStyle = getFormContainerStyle(isDarkMode);
  const scrollContainerStyle = getFormScrollContainerStyle(isDarkMode);
  const cardStyle = getFormCardStyle(isDarkMode);
  const headerStyle = getFormHeaderStyle(isDarkMode, accentColor);
  const sectionStyle = getFormSectionStyle(isDarkMode);
  const sectionHeaderStyle = getFormSectionHeaderStyle(isDarkMode);
  const inputStyles = getInputStyles(isDarkMode);
  const primaryButtonStyles = getFormPrimaryButtonStyles(isDarkMode, accentColor);
  const defaultButtonStyles = getFormDefaultButtonStyles(isDarkMode);

  const textAreaStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '120px',
    padding: '12px',
    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
    background: isDarkMode ? 'rgba(30,41,59,0.5)' : '#ffffff',
    color: isDarkMode ? '#e2e8f0' : '#374151',
    fontSize: '14px',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const dropdownContainerStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 1000,
    background: isDarkMode ? '#1e293b' : '#ffffff',
    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
    maxHeight: '300px',
    overflowY: 'auto',
    marginTop: '4px',
  };

  const dropdownOptionStyle: React.CSSProperties = {
    padding: '12px 16px',
    cursor: 'pointer',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
    transition: 'background-color 0.15s ease',
    fontSize: '14px',
    color: isDarkMode ? '#e2e8f0' : '#374151',
  };

  const labelStyle: React.CSSProperties = {
    fontWeight: 600,
    fontSize: '13px',
    color: isDarkMode ? '#e2e8f0' : '#374151',
    marginBottom: '6px',
    display: 'block',
  };

  // ─────────────────────────────────────────────────────────────────────────
  // EFFECTS
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (users && users.length > 0 && users[0]) {
      setFormData(prev => ({ ...prev, initials: users[0].Initials || '' }));
    }
  }, [users]);

  const filteredMatters = useMemo(() => {
    if (!matters || matters.length === 0) return [];
    if (!matterSearchTerm.trim()) return matters.slice(0, 50);
    
    const searchLower = matterSearchTerm.toLowerCase();
    return matters.filter((matter: any) => {
      const displayNumber = matter.displayNumber || '';
      const clientName = matter.clientName || '';
      const description = matter.description || '';
      return displayNumber.toLowerCase().includes(searchLower) ||
             clientName.toLowerCase().includes(searchLower) ||
             description.toLowerCase().includes(searchLower);
    }).slice(0, 20);
  }, [matters, matterSearchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (matterFieldRef.current && !matterFieldRef.current.contains(event.target as Node)) {
        setMatterDropdownOpen(false);
      }
      if (valueFieldRef.current && !valueFieldRef.current.contains(event.target as Node)) {
        setValueDropdownOpen(false);
      }
    };

    if (matterDropdownOpen || valueDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [matterDropdownOpen, valueDropdownOpen]);

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleMatterSelect = (matter: any) => {
    const displayNumber = matter.displayNumber || '';
    setFormData(prev => ({ ...prev, display_number: displayNumber }));
    setMatterSearchTerm(displayNumber);
    setMatterDropdownOpen(false);
  };

  const handleValueSelect = (value: string) => {
    setFormData(prev => ({ ...prev, value_in_dispute: value }));
    setValueDropdownOpen(false);
  };

  const valueDisputeOptions = [
    { key: '£10,000 or less', text: '£10,000 or less' },
    { key: '£10,001 - £100,000', text: '£10,001 - £100,000' },
    { key: '£100,001 - £500,000', text: '£100,001 - £500,000' },
    { key: '£500,001 or more', text: '£500,001 or more' },
    { key: 'Uncertain', text: 'Uncertain' },
  ];

  const handleInputChange = useCallback((field: keyof FormData, value: string | boolean | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (validationErrors.length > 0) setValidationErrors([]);
  }, [validationErrors.length]);

  const validateForm = useCallback((): string[] => {
    const errors: string[] = [];
    if (formData.context_type === 'C') {
      if (!formData.display_number.trim()) errors.push('File Reference is required');
    } else {
      if (!formData.prospect_id.trim()) errors.push('Prospect / Enquiry ID is required');
    }
    if (formData.value_in_dispute === '£500,001 or more' && formData.value_in_dispute_exact) {
      const exact = Number(formData.value_in_dispute_exact.replace(/[,£\s]/g, ''));
      if (isNaN(exact) || exact <= 500000) {
        errors.push('Exact value must be a number greater than 500,000');
      }
    }
    if (!formData.summary.trim()) errors.push('Summary is required');
    return errors;
  }, [formData]);

  const handleSubmit = useCallback(async () => {
    const errors = validateForm();
    if (errors.length > 0) {
      setValidationErrors(errors);
      setSubmitStatus('error');
      setSubmitMessage('Please fix the validation errors above');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('submitting');
    setSubmitMessage('Submitting case information...');
    setValidationErrors([]);

    try {
      const payload = {
        initials: users?.[0]?.Initials || '',
        context_type: formData.context_type,
        display_number: formData.context_type === 'C' ? formData.display_number : null,
        prospect_id: formData.context_type === 'P' ? formData.prospect_id : null,
        merit_press: formData.merit_press || null,
        summary: formData.summary,
        value_in_dispute: formData.value_in_dispute || null,
        value_in_dispute_exact: formData.value_in_dispute === '£500,001 or more' ? (formData.value_in_dispute_exact || null) : null,
        c_reference_status: formData.c_reference_status,
        counsel_instructed: formData.context_type === 'C' ? formData.counsel_instructed : false,
        counsel_name: formData.context_type === 'C' && formData.counsel_instructed ? formData.counsel_name : null,
      };

      const base = getProxyBaseUrl();
      const url = `${base}/${process.env.REACT_APP_INSERT_NOTABLE_CASE_INFO_PATH}?code=${process.env.REACT_APP_INSERT_NOTABLE_CASE_INFO_CODE}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Request failed: ${errorText}`);
      }

      const result = await response.json();
      setSubmitStatus('success');
      setSubmitMessage(`Case information submitted successfully. ${result.emailSent ? 'Notification sent.' : ''}`);
      onSubmitSuccess?.(`Case information submitted successfully.`);
      
      setTimeout(() => {
        setFormData({
          initials: users?.[0]?.Initials || '',
          context_type: formData.context_type,
          display_number: '',
          prospect_id: '',
          merit_press: '',
          summary: '',
          value_in_dispute: '',
          value_in_dispute_exact: undefined,
          c_reference_status: false,
          counsel_instructed: false,
          counsel_name: '',
        });
        setMatterSearchTerm('');
        setSubmitStatus('idle');
        setSubmitMessage('');
      }, 2000);
      
    } catch (error) {
      const errorMessage = `Failed to submit: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setSubmitStatus('error');
      setSubmitMessage(errorMessage);
      onSubmitError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, validateForm, onSubmitSuccess, onSubmitError, users]);

  const handleReset = useCallback(() => {
    setFormData({
      initials: users?.[0]?.Initials || '',
      context_type: 'C',
      display_number: '',
      prospect_id: '',
      merit_press: '',
      summary: '',
      value_in_dispute: '',
      value_in_dispute_exact: undefined,
      c_reference_status: false,
      counsel_instructed: false,
      counsel_name: '',
    });
    setMatterSearchTerm('');
    setValidationErrors([]);
  }, [users]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={containerStyle}>
      <div style={scrollContainerStyle}>
        <div style={cardStyle}>
          {/* Header */}
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Icon iconName="DocumentSearch" style={{ fontSize: '20px', color: accentColor }} />
              <div>
                <Text style={{ 
                  fontSize: '18px', 
                  fontWeight: 700, 
                  color: isDarkMode ? '#f1f5f9' : '#1e293b',
                  display: 'block',
                  marginBottom: '2px'
                }}>
                  Notable Case Information
                </Text>
                <Text style={{ fontSize: '13px', color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                  Submit case details for legal directories
                </Text>
              </div>
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: '24px' }}>
            <Stack tokens={{ childrenGap: 24 }}>
              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <MessageBar messageBarType={MessageBarType.error}>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </MessageBar>
              )}

              {/* Case Details Section */}
              <div style={sectionStyle}>
                <Text style={sectionHeaderStyle}>
                  <Icon iconName="Contact" style={{ marginRight: '8px', color: accentColor }} />
                  {formData.context_type === 'C' ? 'Matter Details' : 'Prospect / Enquiry Details'}
                </Text>
                
                <Stack tokens={{ childrenGap: 16 }}>
                  {/* Context Type Selection */}
                  <div style={{ display: 'flex', gap: '24px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        checked={formData.context_type === 'C'}
                        onChange={() => handleInputChange('context_type', 'C')}
                        style={{ accentColor }}
                      />
                      <span style={{ fontSize: '14px', fontWeight: 500, color: isDarkMode ? '#e2e8f0' : '#374151' }}>
                        Client Matter
                      </span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        checked={formData.context_type === 'P'}
                        onChange={() => handleInputChange('context_type', 'P')}
                        style={{ accentColor }}
                      />
                      <span style={{ fontSize: '14px', fontWeight: 500, color: isDarkMode ? '#e2e8f0' : '#374151' }}>
                        Prospect / Enquiry
                      </span>
                    </label>
                  </div>

                  {/* Matter/Prospect Reference */}
                  {formData.context_type === 'C' ? (
                    <div ref={matterFieldRef} style={{ position: 'relative' }}>
                      <label style={labelStyle}>File Reference *</label>
                      <input
                        type="text"
                        value={matterSearchTerm}
                        onChange={(e) => {
                          setMatterSearchTerm(e.target.value);
                          setFormData(prev => ({ ...prev, display_number: e.target.value }));
                          setMatterDropdownOpen(true);
                        }}
                        onFocus={() => setMatterDropdownOpen(true)}
                        placeholder="Search and select a matter..."
                        style={{
                          width: '100%',
                          height: '40px',
                          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                          background: isDarkMode ? 'rgba(30,41,59,0.5)' : '#ffffff',
                          padding: '0 12px',
                          fontSize: '14px',
                          color: isDarkMode ? '#e2e8f0' : '#374151',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      {matterDropdownOpen && filteredMatters.length > 0 && (
                        <div style={dropdownContainerStyle}>
                          {filteredMatters.map((matter: any, index: number) => (
                            <div
                              key={matter.displayNumber + index}
                              onClick={() => handleMatterSelect(matter)}
                              style={dropdownOptionStyle}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = isDarkMode 
                                  ? 'rgba(255,255,255,0.05)' 
                                  : 'rgba(0,0,0,0.03)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                                {matter.displayNumber}
                              </div>
                              {matter.clientName && (
                                <div style={{ fontSize: '13px', color: isDarkMode ? '#94a3b8' : '#6b7280' }}>
                                  {matter.clientName}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label style={labelStyle}>Prospect / Enquiry ID *</label>
                      <input
                        type="text"
                        value={formData.prospect_id}
                        onChange={(e) => handleInputChange('prospect_id', e.target.value)}
                        placeholder="Enter prospect or enquiry reference"
                        style={{
                          width: '100%',
                          height: '40px',
                          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                          background: isDarkMode ? 'rgba(30,41,59,0.5)' : '#ffffff',
                          padding: '0 12px',
                          fontSize: '14px',
                          color: isDarkMode ? '#e2e8f0' : '#374151',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  )}

                  {/* PR Merit */}
                  <div>
                    <label style={labelStyle}>
                      Why might this merit press/PR attention?
                    </label>
                    <textarea
                      style={textAreaStyle}
                      value={formData.merit_press}
                      onChange={(e) => handleInputChange('merit_press', e.target.value)}
                      placeholder="Explain potential press / PR merit"
                      rows={3}
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Summary */}
                  <div>
                    <label style={labelStyle}>
                      {formData.context_type === 'C' ? 'Brief Summary of Matter *' : 'Brief Summary of Enquiry *'}
                    </label>
                    <textarea
                      style={textAreaStyle}
                      value={formData.summary}
                      onChange={(e) => handleInputChange('summary', e.target.value)}
                      placeholder="Include: parties, central issues, value, counsel instructed, next steps"
                      rows={4}
                      disabled={isSubmitting}
                    />
                  </div>
                </Stack>
              </div>

              {/* Valuation Section */}
              <div style={sectionStyle}>
                <Text style={sectionHeaderStyle}>
                  <Icon iconName="Money" style={{ marginRight: '8px', color: accentColor }} />
                  {formData.context_type === 'C' ? 'Matter Valuation' : 'Potential Value'}
                </Text>
                
                <div ref={valueFieldRef} style={{ position: 'relative' }}>
                  <label style={labelStyle}>Indication of Value</label>
                  <div
                    onClick={() => setValueDropdownOpen(!valueDropdownOpen)}
                    style={{
                      height: '40px',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                      background: isDarkMode ? 'rgba(30,41,59,0.5)' : '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 12px',
                      cursor: 'pointer',
                      color: formData.value_in_dispute 
                        ? (isDarkMode ? '#e2e8f0' : '#374151')
                        : (isDarkMode ? '#64748b' : '#9ca3af'),
                      fontSize: '14px',
                    }}
                  >
                    {formData.value_in_dispute || 'Choose one...'}
                    <Icon 
                      iconName="ChevronDown" 
                      style={{ 
                        marginLeft: 'auto', 
                        fontSize: '12px',
                        color: isDarkMode ? '#94a3b8' : '#6b7280',
                        transform: valueDropdownOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s ease',
                      }} 
                    />
                  </div>
                  
                  {valueDropdownOpen && (
                    <div style={dropdownContainerStyle}>
                      {valueDisputeOptions.map((option, index) => (
                        <div
                          key={option.key}
                          onClick={() => handleValueSelect(option.key)}
                          style={dropdownOptionStyle}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = isDarkMode 
                              ? 'rgba(255,255,255,0.05)' 
                              : 'rgba(0,0,0,0.03)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          {option.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {formData.value_in_dispute === '£500,001 or more' && (
                  <TextField
                    label="Exact Value (optional, > £500,000)"
                    value={formData.value_in_dispute_exact || ''}
                    onChange={(_, v) => handleInputChange('value_in_dispute_exact', v)}
                    placeholder="e.g. 2000000"
                    styles={{ ...inputStyles, root: { marginTop: '16px' } }}
                  />
                )}
              </div>

              {/* Additional Information Section */}
              <div style={sectionStyle}>
                <Text style={sectionHeaderStyle}>
                  <Icon iconName="Info" style={{ marginRight: '8px', color: accentColor }} />
                  Additional Information
                </Text>
                
                <Stack tokens={{ childrenGap: 16 }}>
                  <div>
                    <Toggle
                      label={formData.context_type === 'C' 
                        ? 'Is Client Prepared to Provide a Reference?' 
                        : 'Is Prospect Prepared to Provide a Reference?'}
                      checked={formData.c_reference_status}
                      onChange={(_, checked) => handleInputChange('c_reference_status', checked || false)}
                      disabled={isSubmitting}
                      styles={{
                        root: { marginBottom: 0 },
                        label: {
                          fontWeight: 600,
                          fontSize: '13px',
                          color: isDarkMode ? '#e2e8f0' : '#374151',
                        },
                      }}
                    />
                    <Text style={{ 
                      fontSize: '12px', 
                      color: isDarkMode ? '#64748b' : '#9ca3af',
                      fontStyle: 'italic',
                      marginTop: '4px'
                    }}>
                      Suitable for legal directories and professional publications
                    </Text>
                  </div>

                  {formData.context_type === 'C' && (
                    <>
                      <Toggle
                        label="Is Counsel Instructed?"
                        checked={formData.counsel_instructed}
                        onChange={(_, checked) => handleInputChange('counsel_instructed', checked || false)}
                        disabled={isSubmitting}
                        styles={{
                          label: {
                            fontWeight: 600,
                            fontSize: '13px',
                            color: isDarkMode ? '#e2e8f0' : '#374151',
                          },
                        }}
                      />
                      {formData.counsel_instructed && (
                        <TextField
                          label="Counsel Name"
                          value={formData.counsel_name}
                          onChange={(_, value) => handleInputChange('counsel_name', value || '')}
                          placeholder="Enter counsel name"
                          disabled={isSubmitting}
                          styles={inputStyles}
                        />
                      )}
                    </>
                  )}
                </Stack>
              </div>

              {/* Status Feedback */}
              {submitStatus !== 'idle' && (
                <div style={{
                  padding: '16px',
                  borderLeft: `3px solid ${
                    submitStatus === 'success' ? '#22c55e' :
                    submitStatus === 'error' ? '#ef4444' : '#3b82f6'
                  }`,
                  background: isDarkMode 
                    ? `rgba(${submitStatus === 'success' ? '34, 197, 94' : submitStatus === 'error' ? '239, 68, 68' : '59, 130, 246'}, 0.1)`
                    : `rgba(${submitStatus === 'success' ? '34, 197, 94' : submitStatus === 'error' ? '239, 68, 68' : '59, 130, 246'}, 0.05)`,
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: submitStatus === 'success' ? '#22c55e' :
                           submitStatus === 'error' ? '#ef4444' : '#3b82f6',
                  }}>
                    <Icon 
                      iconName={
                        submitStatus === 'success' ? 'CheckMark' :
                        submitStatus === 'error' ? 'ErrorBadge' : 'More'
                      } 
                      style={{ fontSize: '18px' }} 
                    />
                    <Text style={{ fontWeight: 600, fontSize: '14px' }}>
                      {submitMessage}
                    </Text>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '16px',
                borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon iconName="Contact" style={{ fontSize: '14px', color: isDarkMode ? '#94a3b8' : '#6b7280' }} />
                  <Text style={{ 
                    fontSize: '13px', 
                    fontWeight: 600, 
                    color: isDarkMode ? '#e2e8f0' : '#374151' 
                  }}>
                    {users?.[0]?.FullName?.split(' ')[0] || 'User'}
                  </Text>
                </div>
                <Stack horizontal tokens={{ childrenGap: 12 }}>
                  {onBack && (
                    <DefaultButton
                      text="Cancel"
                      onClick={onBack}
                      styles={defaultButtonStyles}
                      iconProps={{ iconName: 'Cancel' }}
                    />
                  )}
                  <DefaultButton
                    text="Reset"
                    onClick={handleReset}
                    disabled={isSubmitting}
                    styles={defaultButtonStyles}
                    iconProps={{ iconName: 'Refresh' }}
                  />
                  <PrimaryButton
                    text={isSubmitting ? 'Submitting...' : submitStatus === 'success' ? 'Submitted!' : 'Submit'}
                    onClick={handleSubmit}
                    disabled={isSubmitting || submitStatus === 'success'}
                    styles={primaryButtonStyles}
                    iconProps={{
                      iconName: isSubmitting ? 'More' : submitStatus === 'success' ? 'CheckMark' : 'DocumentSearch'
                    }}
                  />
                </Stack>
              </div>
            </Stack>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotableCaseInfoForm;
