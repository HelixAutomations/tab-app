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
  { key: 'low', text: 'Low - Nice to have' },
  { key: 'medium', text: 'Medium - Would improve workflow' },
  { key: 'high', text: 'High - Significant time savings' },
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
                Submit your ideas for new features, automations, or improvements. Each submission creates an Asana task for the tech team to review.
              </Text>
            </Stack>
          </div>

          {/* Idea Details Section */}
          <div style={getFormSectionStyle(isDarkMode, accentColor)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="Edit" style={{ fontSize: 16 }} />
              Idea Details
            </div>

            <Stack tokens={{ childrenGap: 16 }}>
              <TextField
                label="Title"
                value={formData.title}
                onChange={(_, val) => handleFieldChange('title', val || '')}
                required
                placeholder="Brief, descriptive title for your idea"
                styles={getInputStyles(isDarkMode)}
              />

              <TextField
                label="Description"
                value={formData.description}
                onChange={(_, val) => handleFieldChange('description', val || '')}
                required
                multiline
                rows={5}
                placeholder="Describe your idea in detail. What should it do? How would it work?"
                styles={getInputStyles(isDarkMode)}
              />

              <TextField
                label="Business Value"
                value={formData.business_value}
                onChange={(_, val) => handleFieldChange('business_value', val || '')}
                multiline
                rows={3}
                placeholder="How would this benefit the firm? Time saved, errors prevented, etc."
                styles={getInputStyles(isDarkMode)}
              />

              <Dropdown
                label="Priority"
                options={priorityOptions}
                selectedKey={formData.priority}
                onChange={(_, opt) => handleFieldChange('priority', opt?.key as string || 'medium')}
                styles={getDropdownStyles(isDarkMode)}
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

// Wrap with passcode guard
const TechIdeaForm: React.FC<TechIdeaFormProps> = (props) => (
  <PasscodeGuard title="Tech Development Idea" onBack={props.onBack}>
    <TechIdeaFormContent {...props} />
  </PasscodeGuard>
);

export default TechIdeaForm;
