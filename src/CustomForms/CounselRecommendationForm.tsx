// src/CustomForms/CounselRecommendationForm.tsx
// Form for recommending barristers/counsel → saves to counsel_recommendations table

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
  ChoiceGroup,
  IChoiceGroupOption,
} from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
import { UserData } from '../app/functionality/types';
import AreaWorkTypeDropdown from './shared/AreaWorkTypeDropdown';
import {
  getFormScrollContainerStyle,
  getFormCardStyle,
  getFormHeaderStyle,
  getFormHeaderTitleStyle,
  getFormContentStyle,
  getFormSectionStyle,
  getFormSectionHeaderStyle,
  getInputStyles,
  getDropdownStyles,
  getFormPrimaryButtonStyles,
  getFormDefaultButtonStyles,
  getMessageBarStyle,
  getChoiceGroupStyles,
  formAccentColors,
} from './shared/formStyles';

interface CounselRecommendationFormProps {
  userData?: UserData[];
  currentUser?: UserData;
  onBack?: () => void;
  onSubmitSuccess?: (message: string) => void;
  onSubmitError?: (error: string) => void;
}

interface FormData {
  prefix: string;
  first_name: string;
  last_name: string;
  chambers_name: string;
  company_number: string;
  email: string;
  clerks_email: string;
  phone: string;
  website: string;
  cv_url: string;
  area_of_work: string;
  worktype: string;
  price_tier: string;
  introduced_by: string;
  source: string;
  notes: string;
}

const prefixOptions: IDropdownOption[] = [
  { key: '', text: 'Select...' },
  { key: 'Mr', text: 'Mr' },
  { key: 'Mrs', text: 'Mrs' },
  { key: 'Ms', text: 'Ms' },
  { key: 'Miss', text: 'Miss' },
];

const priceTierOptions: IChoiceGroupOption[] = [
  { key: 'cheap', text: 'Budget-friendly' },
  { key: 'mid', text: 'Mid-range' },
  { key: 'expensive', text: 'Premium' },
];

const accentColor = formAccentColors.counsel;

const CounselRecommendationFormContent: React.FC<CounselRecommendationFormProps> = ({
  currentUser,
  onBack,
  onSubmitSuccess,
  onSubmitError,
}) => {
  const { isDarkMode } = useTheme();
  const defaultSource = currentUser?.Initials ? `${currentUser.Initials} following` : '';
  
  const [formData, setFormData] = useState<FormData>({
    prefix: '',
    first_name: '',
    last_name: '',
    chambers_name: '',
    company_number: '',
    email: '',
    clerks_email: '',
    phone: '',
    website: '',
    cv_url: '',
    area_of_work: '',
    worktype: '',
    price_tier: 'mid',
    introduced_by: '',
    source: defaultSource,
    notes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFieldChange = useCallback((field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setSubmitMessage(null);
  }, []);

  const handleAreaWorkTypeChange = useCallback((area: string, worktype: string) => {
    setFormData(prev => ({ ...prev, area_of_work: area, worktype }));
    setSubmitMessage(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formData.first_name.trim()) {
      setSubmitMessage({ type: 'error', text: 'First name is required.' });
      return;
    }
    if (!formData.last_name.trim()) {
      setSubmitMessage({ type: 'error', text: 'Last name is required.' });
      return;
    }
    if (!formData.email.trim()) {
      setSubmitMessage({ type: 'error', text: 'Email is required.' });
      return;
    }
    if (!formData.area_of_work.trim()) {
      setSubmitMessage({ type: 'error', text: 'Area of Work is required.' });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/counsel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          created_by: currentUser?.FullName || 'Unknown',
          created_by_initials: currentUser?.Initials || '',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save counsel recommendation');
      }

      setSubmitMessage({ type: 'success', text: 'Counsel recommendation saved successfully!' });
      onSubmitSuccess?.('Counsel recommendation saved!');

      setFormData({
        prefix: '',
        first_name: '',
        last_name: '',
        chambers_name: '',
        company_number: '',
        email: '',
        clerks_email: '',
        phone: '',
        website: '',
        cv_url: '',
        area_of_work: '',
        worktype: '',
        price_tier: 'mid',
        introduced_by: '',
        source: defaultSource,
        notes: '',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while submitting';
      setSubmitMessage({ type: 'error', text: errorMessage });
      onSubmitError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, currentUser, defaultSource, onSubmitSuccess, onSubmitError]);

  const handleReset = useCallback(() => {
    setFormData({
      prefix: '',
      first_name: '',
      last_name: '',
      chambers_name: '',
      company_number: '',
      email: '',
      clerks_email: '',
      phone: '',
      website: '',
      cv_url: '',
      area_of_work: '',
      worktype: '',
      price_tier: 'mid',
      introduced_by: '',
      source: defaultSource,
      notes: '',
    });
    setSubmitMessage(null);
  }, [defaultSource]);

  // Get shared ChoiceGroup styles for dark mode + brand colors
  const choiceGroupStyles = getChoiceGroupStyles(isDarkMode);

  return (
    <div style={getFormScrollContainerStyle(isDarkMode)}>
      <div style={getFormCardStyle(isDarkMode)}>
        {/* Header */}
        <div style={getFormHeaderStyle(isDarkMode, accentColor)}>
          <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
              <Icon iconName="Commitments" style={{ fontSize: 22, color: accentColor }} />
              <Text variant="xLarge" style={getFormHeaderTitleStyle(isDarkMode)}>
                Counsel Recommendation
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

          {/* Barrister Details */}
          <div style={getFormSectionStyle(isDarkMode, accentColor)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="Contact" style={{ fontSize: 16 }} />
              Barrister Details
            </div>

            <Stack tokens={{ childrenGap: 16 }}>
              <Stack horizontal tokens={{ childrenGap: 16 }}>
                <Stack.Item styles={{ root: { width: '120px' } }}>
                  <Dropdown
                    label="Title"
                    options={prefixOptions}
                    selectedKey={formData.prefix}
                    onChange={(_, opt) => handleFieldChange('prefix', opt?.key as string || '')}
                    styles={getDropdownStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="First Name"
                    value={formData.first_name}
                    onChange={(_, val) => handleFieldChange('first_name', val || '')}
                    required
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="Last Name"
                    value={formData.last_name}
                    onChange={(_, val) => handleFieldChange('last_name', val || '')}
                    required
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
              </Stack>

              <Stack horizontal tokens={{ childrenGap: 16 }}>
                <Stack.Item grow>
                  <TextField
                    label="Email"
                    value={formData.email}
                    onChange={(_, val) => handleFieldChange('email', val || '')}
                    type="email"
                    required
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="Phone"
                    value={formData.phone}
                    onChange={(_, val) => handleFieldChange('phone', val || '')}
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
              </Stack>
            </Stack>
          </div>

          {/* Chambers Details */}
          <div style={getFormSectionStyle(isDarkMode, accentColor)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="CityNext" style={{ fontSize: 16 }} />
              Chambers Details
            </div>

            <Stack tokens={{ childrenGap: 16 }}>
              <Stack horizontal tokens={{ childrenGap: 16 }}>
                <Stack.Item grow>
                  <TextField
                    label="Chambers Name"
                    value={formData.chambers_name}
                    onChange={(_, val) => handleFieldChange('chambers_name', val || '')}
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="Clerks Email"
                    value={formData.clerks_email}
                    onChange={(_, val) => handleFieldChange('clerks_email', val || '')}
                    type="email"
                    placeholder="clerks@chambers.co.uk"
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
              </Stack>

              <Stack horizontal tokens={{ childrenGap: 16 }}>
                <Stack.Item grow>
                  <TextField
                    label="Website"
                    value={formData.website}
                    onChange={(_, val) => handleFieldChange('website', val || '')}
                    placeholder="https://..."
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="CV/Profile URL"
                    value={formData.cv_url}
                    onChange={(_, val) => handleFieldChange('cv_url', val || '')}
                    placeholder="Link to CV/Profile"
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
              </Stack>
            </Stack>
          </div>

          {/* Expertise */}
          <div style={getFormSectionStyle(isDarkMode, accentColor)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="WorkItem" style={{ fontSize: 16 }} />
              Expertise
            </div>

            <Stack tokens={{ childrenGap: 16 }}>
              <AreaWorkTypeDropdown
                areaOfWork={formData.area_of_work}
                worktype={formData.worktype}
                onAreaChange={(area) => handleAreaWorkTypeChange(area, '')}
                onWorktypeChange={(wt) => handleAreaWorkTypeChange(formData.area_of_work, wt)}
                required
              />

              <ChoiceGroup
                label="Price Tier"
                selectedKey={formData.price_tier}
                options={priceTierOptions}
                onChange={(_, opt) => handleFieldChange('price_tier', opt?.key || 'mid')}
                styles={choiceGroupStyles}
              />
            </Stack>
          </div>

          {/* Source */}
          <div style={getFormSectionStyle(isDarkMode, accentColor)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="ContactInfo" style={{ fontSize: 16 }} />
              Source Information
            </div>

            <Stack tokens={{ childrenGap: 16 }}>
              <Stack horizontal tokens={{ childrenGap: 16 }}>
                <Stack.Item grow>
                  <TextField
                    label="Introduced By"
                    value={formData.introduced_by}
                    onChange={(_, val) => handleFieldChange('introduced_by', val || '')}
                    placeholder="Who recommended this barrister?"
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="Source"
                    value={formData.source}
                    onChange={(_, val) => handleFieldChange('source', val || '')}
                    placeholder="e.g., AB following"
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
              </Stack>

              <TextField
                label="Notes"
                value={formData.notes}
                onChange={(_, val) => handleFieldChange('notes', val || '')}
                multiline
                rows={3}
                placeholder="Any additional notes about this counsel..."
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
              text={isSubmitting ? 'Saving...' : 'Save Counsel'}
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
const CounselRecommendationForm: React.FC<CounselRecommendationFormProps> = (props) => (
  <CounselRecommendationFormContent {...props} />
);

export default CounselRecommendationForm;
