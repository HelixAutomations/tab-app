// src/CustomForms/TechProblemForm.tsx
// Form for reporting technical problems → creates Asana task assigned to LZ, CB, KW
// Protected by passcode guard

import React, { useState, useCallback } from 'react';
import {
  Stack,
  Text,
  TextField,
  PrimaryButton,
  DefaultButton,
  MessageBar,
  MessageBarType,
  Dropdown,
  IDropdownOption,
  Icon,
} from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
import { UserData } from '../app/functionality/types';
import PasscodeGuard from './shared/PasscodeGuard';
import TechTicketsLedger from './shared/TechTicketsLedger';
import {
  getFormScrollContainerStyle,
  getFormCardStyle,
  getFormHeaderStyle,
  getFormHeaderTitleStyle,
  getFormContentStyle,
  getFormSectionStyle,
  getFormSectionHeaderStyle,
  getInfoBoxStyle,
  getInfoBoxTextStyle,
  getInputStyles,
  getDropdownStyles,
  getFormPrimaryButtonStyles,
  getFormDefaultButtonStyles,
  getMessageBarStyle,
  formAccentColors,
} from './shared/formStyles';

interface TechProblemFormProps {
  userData?: UserData[];
  currentUser?: UserData;
  onBack?: () => void;
  onSubmitSuccess?: (message: string) => void;
  onSubmitError?: (error: string) => void;
}

interface FormData {
  title: string;
  description: string;
  steps_to_reproduce: string;
  expected_behavior: string;
  urgency: string;
}

const urgencyOptions: IDropdownOption[] = [
  { key: 'low', text: 'Low - Inconvenient but workaround exists' },
  { key: 'medium', text: 'Medium - Impacting work but not blocking' },
  { key: 'high', text: 'High - Blocking work, needs attention soon' },
  { key: 'critical', text: 'Critical - Work completely stopped' },
];

const accentColor = formAccentColors.techProblem;

const TechProblemFormContent: React.FC<TechProblemFormProps> = ({
  currentUser,
  onBack,
  onSubmitSuccess,
  onSubmitError,
}) => {
  const { isDarkMode } = useTheme();
  
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    steps_to_reproduce: '',
    expected_behavior: '',
    urgency: 'medium',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [ledgerRefreshKey, setLedgerRefreshKey] = useState(0);

  const handleFieldChange = useCallback((field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setSubmitMessage(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formData.title.trim()) {
      setSubmitMessage({ type: 'error', text: 'Title is required.' });
      return;
    }
    if (!formData.description.trim()) {
      setSubmitMessage({ type: 'error', text: 'Description is required.' });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/tech-tickets/problem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          submitted_by: currentUser?.FullName || 'Unknown',
          submitted_by_initials: currentUser?.Initials || '',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to submit problem report');
      }

      setSubmitMessage({ type: 'success', text: 'Problem reported successfully. The Tech team has been notified.' });
      onSubmitSuccess?.('Problem reported successfully.');

      setLedgerRefreshKey((k) => k + 1);

      setFormData({ title: '', description: '', steps_to_reproduce: '', expected_behavior: '', urgency: 'medium' });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while submitting';
      setSubmitMessage({ type: 'error', text: errorMessage });
      onSubmitError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, currentUser, onSubmitSuccess, onSubmitError]);

  const handleReset = useCallback(() => {
    setFormData({ title: '', description: '', steps_to_reproduce: '', expected_behavior: '', urgency: 'medium' });
    setSubmitMessage(null);
  }, []);

  return (
    <div style={getFormScrollContainerStyle(isDarkMode)}>
      <div style={getFormCardStyle(isDarkMode)}>
        {/* Header */}
        <div style={getFormHeaderStyle(isDarkMode, accentColor)}>
          <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
              <Icon iconName="Bug" style={{ fontSize: 22, color: accentColor }} />
              <Text variant="xLarge" style={getFormHeaderTitleStyle(isDarkMode)}>
                Report Technical Problem
              </Text>
            </Stack>
            {onBack && (
              <DefaultButton 
                text="Back" 
                onClick={onBack} 
                styles={getFormDefaultButtonStyles(isDarkMode)} 
              />
            )}
          </Stack>
        </div>

        {/* Content */}
        <div style={getFormContentStyle(isDarkMode)}>
          {submitMessage && (
            <MessageBar
              messageBarType={submitMessage.type === 'success' ? MessageBarType.success : MessageBarType.error}
              onDismiss={() => setSubmitMessage(null)}
              style={getMessageBarStyle(isDarkMode)}
            >
              {submitMessage.text}
            </MessageBar>
          )}

          {/* Info Box */}
          <div style={getInfoBoxStyle(isDarkMode, 'neutral')}>
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
              <Icon iconName="Info" style={{ color: accentColor, flexShrink: 0 }} />
              <Text style={getInfoBoxTextStyle(isDarkMode)}>
                Report bugs, errors, or technical issues.
              </Text>
            </Stack>
          </div>

          {/* Problem Details Section */}
          <div style={getFormSectionStyle(isDarkMode, accentColor)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="StatusErrorFull" style={{ fontSize: 16 }} />
              Problem Details
            </div>

            <Stack tokens={{ childrenGap: 16 }} style={{ paddingBottom: '4px' }}>
              <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="end">
                <Stack.Item grow styles={{ root: { flex: 2 } }}>
                  <TextField
                    label="Title"
                    value={formData.title}
                    onChange={(_, val) => handleFieldChange('title', val || '')}
                    required
                    placeholder="Brief description of the problem"
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item styles={{ root: { width: '320px', minWidth: '280px' } }}>
                  <Dropdown
                    label="Urgency"
                    options={urgencyOptions}
                    selectedKey={formData.urgency}
                    onChange={(_, opt) => handleFieldChange('urgency', opt?.key as string || 'medium')}
                    styles={getDropdownStyles(isDarkMode)}
                  />
                </Stack.Item>
              </Stack>

              <TextField
                label="Description"
                value={formData.description}
                onChange={(_, val) => handleFieldChange('description', val || '')}
                required
                multiline
                rows={4}
                placeholder="What went wrong? Include any error messages you saw."
                styles={getInputStyles(isDarkMode)}
              />

              <TextField
                label="Steps to Reproduce"
                value={formData.steps_to_reproduce}
                onChange={(_, val) => handleFieldChange('steps_to_reproduce', val || '')}
                multiline
                rows={3}
                placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                styles={getInputStyles(isDarkMode)}
              />

              <TextField
                label="Expected Behavior"
                value={formData.expected_behavior}
                onChange={(_, val) => handleFieldChange('expected_behavior', val || '')}
                multiline
                rows={2}
                placeholder="What should have happened instead?"
                styles={getInputStyles(isDarkMode)}
              />
            </Stack>
          </div>

          {/* Actions */}
          <Stack horizontal tokens={{ childrenGap: 12 }} horizontalAlign="end" style={{ marginTop: '1.5rem' }}>
            <DefaultButton 
              text="Reset" 
              onClick={handleReset} 
              disabled={isSubmitting} 
              styles={getFormDefaultButtonStyles(isDarkMode)} 
            />
            <PrimaryButton
              text={isSubmitting ? 'Submitting...' : 'Report Problem'}
              onClick={handleSubmit}
              disabled={isSubmitting}
              styles={getFormPrimaryButtonStyles(isDarkMode, accentColor)}
            />
          </Stack>

          <div style={{ marginTop: '1.25rem' }}>
            <TechTicketsLedger
              isDarkMode={isDarkMode}
              refreshKey={ledgerRefreshKey}
              type="problem"
              title="Recent problem reports"
              accentColor={accentColor}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// Passcode guard removed - direct access enabled
const TechProblemForm: React.FC<TechProblemFormProps> = (props) => (
  <TechProblemFormContent {...props} />
);

export default TechProblemForm;
