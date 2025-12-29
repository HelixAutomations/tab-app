// src/CustomForms/TechIdeaForm.tsx
// Form for submitting tech development ideas → creates Asana task
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
import { colours } from '../app/styles/colours';
import { useTheme } from '../app/functionality/ThemeContext';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
import { UserData } from '../app/functionality/types';
import PasscodeGuard from './shared/PasscodeGuard';
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

interface TechIdeaFormProps {
  userData?: UserData[];
  currentUser?: UserData;
  onBack?: () => void;
  onSubmitSuccess?: (message: string) => void;
  onSubmitError?: (error: string) => void;
}

interface FormData {
  title: string;
  description: string;
  business_value: string;
  priority: string;
}

const priorityOptions: IDropdownOption[] = [
  { key: 'low', text: 'Low' },
  { key: 'medium', text: 'Medium' },
  { key: 'high', text: 'High' },
];

const accentColor = formAccentColors.techIdea;

const TechIdeaFormContent: React.FC<TechIdeaFormProps> = ({
  currentUser,
  onBack,
  onSubmitSuccess,
  onSubmitError,
}) => {
  const { isDarkMode } = useTheme();
  
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    business_value: '',
    priority: 'medium',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      const response = await fetch(`${baseUrl}/api/tech-tickets/idea`, {
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
        throw new Error(errorData.error || 'Failed to submit tech idea');
      }

      setSubmitMessage({ type: 'success', text: 'Tech idea submitted successfully! Asana task created.' });
      onSubmitSuccess?.('Tech idea submitted successfully!');

      setFormData({ title: '', description: '', business_value: '', priority: 'medium' });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while submitting';
      setSubmitMessage({ type: 'error', text: errorMessage });
      onSubmitError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, currentUser, onSubmitSuccess, onSubmitError]);

  const handleReset = useCallback(() => {
    setFormData({ title: '', description: '', business_value: '', priority: 'medium' });
    setSubmitMessage(null);
  }, []);

  return (
    <div style={getFormScrollContainerStyle(isDarkMode)}>
      <div style={getFormCardStyle(isDarkMode)}>
        {/* Header */}
        <div style={getFormHeaderStyle(isDarkMode, accentColor)}>
          <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
              <Icon iconName="Lightbulb" style={{ fontSize: 22, color: accentColor }} />
              <Text variant="xLarge" style={getFormHeaderTitleStyle(isDarkMode)}>
                Tech Development Idea
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
          <div style={getInfoBoxStyle(isDarkMode, 'info')}>
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
              <Icon iconName="Info" style={{ color: accentColor, flexShrink: 0 }} />
              <Text style={getInfoBoxTextStyle(isDarkMode)}>
                Creates an Asana task for tech review.
              </Text>
            </Stack>
          </div>

          {/* Idea Details Section */}
          <div style={getFormSectionStyle(isDarkMode, accentColor)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="Edit" style={{ fontSize: 16 }} />
              Idea Details
            </div>

            <Stack tokens={{ childrenGap: 16 }} style={{ paddingBottom: '4px' }}>
              <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="end">
                <Stack.Item grow styles={{ root: { flex: 2 } }}>
                  <TextField
                    label="Title"
                    value={formData.title}
                    onChange={(_, val) => handleFieldChange('title', val || '')}
                    required
                    placeholder=""
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item styles={{ root: { width: '240px', minWidth: '200px' } }}>
                  <Dropdown
                    label="Priority"
                    options={priorityOptions}
                    selectedKey={formData.priority}
                    onChange={(_, opt) => handleFieldChange('priority', opt?.key as string || 'medium')}
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
                rows={5}
                placeholder=""
                styles={getInputStyles(isDarkMode)}
              />

              <TextField
                label="Notes"
                value={formData.business_value}
                onChange={(_, val) => handleFieldChange('business_value', val || '')}
                multiline
                rows={3}
                placeholder="Optional"
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
              text={isSubmitting ? 'Submitting...' : 'Submit Idea'} 
              onClick={handleSubmit} 
              disabled={isSubmitting} 
              styles={getFormPrimaryButtonStyles(isDarkMode, accentColor)} 
            />
          </Stack>
        </div>
      </div>
    </div>
  );
};

// Passcode guard removed - direct access enabled
const TechIdeaForm: React.FC<TechIdeaFormProps> = (props) => (
  <TechIdeaFormContent {...props} />
);

export default TechIdeaForm;
