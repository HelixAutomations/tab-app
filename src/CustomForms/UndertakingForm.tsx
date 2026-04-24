import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { TextField } from '@fluentui/react/lib/TextField';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import type { IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { Icon } from '@fluentui/react/lib/Icon';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
import type { UserData } from '../app/functionality/types';
import { useFormReadinessPulse } from './shared/useFormReadinessPulse';
import { FormReadinessCue } from './shared/FormReadinessCue';
import {
  getFormScrollContainerStyle,
  getFormCardStyle,
  getFormHeaderStyle,
  getFormHeaderTitleStyle,
  getFormHeaderSubtitleStyle,
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
  getFormTextareaStyles,
  formFieldTokens,
} from './shared/formStyles';
import { colours } from '../app/styles/colours';
import { useTheme } from '../app/functionality/ThemeContext';

interface UndertakingFormProps {
  userData?: UserData[];
  onBack?: () => void;
  onSubmitSuccess?: (message: string) => void;
  onSubmitError?: (error: string) => void;
}

interface UndertakingFormState {
  matter_ref: string;
  given_to: string;
  given_date: string;
  due_date: string;
  description: string;
  area_of_work: string;
}

const accentColor = colours.orange;

const aowOptions: IDropdownOption[] = [
  { key: 'Commercial', text: 'Commercial' },
  { key: 'Construction', text: 'Construction' },
  { key: 'Property', text: 'Property' },
  { key: 'Employment', text: 'Employment' },
  { key: 'Other', text: 'Other' },
];

const emptyState: UndertakingFormState = {
  matter_ref: '',
  given_to: '',
  given_date: '',
  due_date: '',
  description: '',
  area_of_work: '',
};

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(d); }
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const UndertakingForm: React.FC<UndertakingFormProps> = ({ userData, onBack, onSubmitSuccess, onSubmitError }) => {
  const { isDarkMode } = useTheme();
  const readiness = useFormReadinessPulse('undertaking');
  const currentUser = userData?.[0] || null;
  const [formData, setFormData] = useState<UndertakingFormState>(emptyState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recentItems, setRecentItems] = useState<any[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const requestHeaders = useMemo((): Record<string, string> => {
    const initials = String(currentUser?.Initials || '').trim().toUpperCase();
    return initials ? { 'x-helix-initials': initials } : {};
  }, [currentUser?.Initials]);

  useEffect(() => {
    const initials = requestHeaders['x-helix-initials'];
    if (!initials) { setIsLoadingRecent(false); return; }
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = getProxyBaseUrl();
        const res = await fetch(`${baseUrl}/api/registers/undertakings`, { headers: requestHeaders, signal: ac.signal });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            setTotalCount(data.undertakings.length);
            setRecentItems(data.undertakings.slice(0, 10));
          }
        }
      } catch (e) { if ((e as Error).name !== 'AbortError') { /* history is supplementary */ } }
      finally { if (!ac.signal.aborted) setIsLoadingRecent(false); }
    })();
    return () => ac.abort();
  }, [requestHeaders]);

  const handleFieldChange = useCallback((field: keyof UndertakingFormState, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setSubmitMessage(null);
  }, []);

  const handleReset = useCallback(() => {
    setFormData(emptyState);
    setSubmitMessage(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!formData.given_to.trim() || !formData.given_date || !formData.description.trim()) {
      setSubmitMessage({ type: 'error', text: 'Recipient, date given, and description are required.' });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/registers/undertakings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...requestHeaders },
        body: JSON.stringify({
          matter_ref: formData.matter_ref || null,
          given_to: formData.given_to.trim(),
          given_date: formData.given_date,
          due_date: formData.due_date || null,
          description: formData.description.trim(),
          area_of_work: formData.area_of_work || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to record undertaking');
      }

      if (payload.undertaking) {
        setRecentItems((prev) => [payload.undertaking, ...prev].slice(0, 10));
        setTotalCount((prev) => prev + 1);
      }

      const successMessage = 'Undertaking recorded and added to the compliance dashboard.';
      setSubmitMessage({ type: 'success', text: successMessage });
      onSubmitSuccess?.(successMessage);
      setFormData(emptyState);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred while recording the undertaking.';
      setSubmitMessage({ type: 'error', text: message });
      onSubmitError?.(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, onSubmitError, onSubmitSuccess, requestHeaders]);

  return (
    <div style={getFormScrollContainerStyle(isDarkMode)}>
      <div style={getFormCardStyle(isDarkMode, accentColor)}>
        <div style={getFormHeaderStyle(isDarkMode, accentColor)}>
          <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
              <Icon iconName="Permissions" style={{ fontSize: 22, color: accentColor }} />
              <div>
                <Text variant="xLarge" style={getFormHeaderTitleStyle(isDarkMode)}>
                  New Undertaking
                </Text>
                <Text style={getFormHeaderSubtitleStyle(isDarkMode)}>
                  Start the undertaking in Forms, then manage status and discharge from the compliance dashboard.
                </Text>
              </div>
            </Stack>
            {onBack && (
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                <FormReadinessCue state={readiness.state} detail={readiness.detail} readyAnnouncement="Undertaking form ready" />
                <DefaultButton text="Back" onClick={onBack} styles={getFormDefaultButtonStyles(isDarkMode)} />
              </Stack>
            )}
            {!onBack && (
              <FormReadinessCue state={readiness.state} detail={readiness.detail} readyAnnouncement="Undertaking form ready" />
            )}
          </Stack>
        </div>

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

          <div style={getInfoBoxStyle(isDarkMode, 'warning')}>
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
              <Icon iconName="Info" style={{ color: accentColor, flexShrink: 0 }} />
              <Text style={getInfoBoxTextStyle(isDarkMode)}>
                Use this for structured intake. The ongoing due-soon, overdue, discharged, and breach tracking stays in Resources.
              </Text>
            </Stack>
          </div>

          <div style={getFormSectionStyle(isDarkMode, accentColor)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="Edit" style={{ fontSize: 16 }} />
              Undertaking details
            </div>

            <Stack tokens={formFieldTokens} style={{ paddingBottom: '4px' }}>
              <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="end">
                <Stack.Item grow styles={{ root: { flex: 2 } }}>
                  <TextField
                    label="Given to"
                    value={formData.given_to}
                    onChange={(_, value) => handleFieldChange('given_to', value || '')}
                    required
                    placeholder="Person or organisation receiving the undertaking"
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item styles={{ root: { width: '240px', minWidth: '220px' } }}>
                  <Dropdown
                    label="Area of work"
                    options={aowOptions}
                    selectedKey={formData.area_of_work || undefined}
                    onChange={(_, option) => handleFieldChange('area_of_work', String(option?.key || ''))}
                    styles={getDropdownStyles(isDarkMode)}
                  />
                </Stack.Item>
              </Stack>

              <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="end">
                <Stack.Item grow>
                  <TextField
                    label="Date given"
                    type="date"
                    value={formData.given_date}
                    onChange={(_, value) => handleFieldChange('given_date', value || '')}
                    required
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="Due date"
                    type="date"
                    value={formData.due_date}
                    onChange={(_, value) => handleFieldChange('due_date', value || '')}
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
              </Stack>

              <TextField
                label="Matter reference"
                value={formData.matter_ref}
                onChange={(_, value) => handleFieldChange('matter_ref', value || '')}
                placeholder="HLX-00000-00000"
                styles={getInputStyles(isDarkMode)}
              />

              <TextField
                label="Description"
                value={formData.description}
                onChange={(_, value) => handleFieldChange('description', value || '')}
                required
                multiline
                rows={5}
                placeholder="What was promised, by whom, and what would count as discharge?"
                styles={getFormTextareaStyles(isDarkMode, 5)}
              />
            </Stack>
          </div>

          <Stack horizontal tokens={{ childrenGap: 12 }} horizontalAlign="end" style={{ marginTop: '1.5rem' }}>
            <DefaultButton
              text="Reset"
              onClick={handleReset}
              disabled={isSubmitting}
              styles={getFormDefaultButtonStyles(isDarkMode)}
            />
            <PrimaryButton
              text={isSubmitting ? 'Recording...' : 'Record undertaking'}
              onClick={handleSubmit}
              disabled={isSubmitting}
              styles={getFormPrimaryButtonStyles(isDarkMode, accentColor)}
            />
          </Stack>

          {/* Recent undertakings */}
          <div style={{ ...getFormSectionStyle(isDarkMode, accentColor), marginTop: 24 }}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="History" style={{ fontSize: 16 }} />
              Recent undertakings
              {!isLoadingRecent && <span style={{ fontWeight: 400, opacity: 0.7 }}> · {totalCount}</span>}
            </div>
            {isLoadingRecent ? (
              <Text style={{ fontSize: 13, color: isDarkMode ? '#d1d5db' : '#374151', padding: '12px 0' }}>Loading…</Text>
            ) : recentItems.length === 0 ? (
              <Text style={{ fontSize: 13, color: isDarkMode ? '#d1d5db' : '#374151', padding: '12px 0' }}>No undertakings recorded yet.</Text>
            ) : (
              <div style={{ display: 'grid', gap: 0 }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 0.8fr',
                  padding: '8px 12px', fontSize: 12, fontWeight: 600,
                  color: isDarkMode ? colours.subtleGrey : colours.greyText,
                  borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                  fontFamily: "'Raleway', sans-serif", textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                  <span>Given to</span>
                  <span>Given</span>
                  <span>Due</span>
                  <span>Status</span>
                </div>
                {recentItems.map((item) => {
                  const statusLower = (item.status || 'outstanding').toLowerCase();
                  const statusColour = statusLower === 'discharged' ? colours.green : statusLower === 'breached' ? colours.cta : colours.orange;
                  return (
                    <div key={item.id} style={{
                      display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 0.8fr',
                      padding: '8px 12px', fontSize: 13, fontFamily: "'Raleway', sans-serif",
                      color: isDarkMode ? '#d1d5db' : '#374151',
                      borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    }}>
                      <span style={{ fontWeight: 600 }}>{item.given_to}</span>
                      <span>{fmtDate(item.given_date)}</span>
                      <span>{fmtDate(item.due_date)}</span>
                      <span style={{ color: statusColour, fontWeight: 600, fontSize: 12 }}>{capitalize(item.status || 'outstanding')}</span>
                    </div>
                  );
                })}
                {totalCount > 10 && (
                  <Text style={{ fontSize: 12, color: isDarkMode ? colours.subtleGrey : colours.greyText, padding: '10px 12px 4px' }}>
                    Showing 10 of {totalCount}. Full dashboard in Resources → Compliance.
                  </Text>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UndertakingForm;