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
import type { TeamData, UserData } from '../app/functionality/types';
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
import { useFormReadinessPulse } from './shared/useFormReadinessPulse';
import { FormReadinessCue } from './shared/FormReadinessCue';
import { colours } from '../app/styles/colours';
import { useTheme } from '../app/functionality/ThemeContext';
import { isAdminUser } from '../app/admin';

interface ComplaintFormProps {
  userData?: UserData[];
  teamData?: TeamData[] | null;
  onBack?: () => void;
  onSubmitSuccess?: (message: string) => void;
  onSubmitError?: (error: string) => void;
}

interface ComplaintFormState {
  matter_ref: string;
  complainant: string;
  respondent: string;
  received_date: string;
  description: string;
  category: string;
  area_of_work: string;
}

const accentColor = colours.cta;

const aowOptions: IDropdownOption[] = [
  { key: 'Commercial', text: 'Commercial' },
  { key: 'Construction', text: 'Construction' },
  { key: 'Property', text: 'Property' },
  { key: 'Employment', text: 'Employment' },
  { key: 'Other', text: 'Other' },
];

const emptyState: ComplaintFormState = {
  matter_ref: '',
  complainant: '',
  respondent: '',
  received_date: '',
  description: '',
  category: '',
  area_of_work: '',
};

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(d); }
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ComplaintForm: React.FC<ComplaintFormProps> = ({ userData, teamData, onBack, onSubmitError, onSubmitSuccess }) => {
  const { isDarkMode } = useTheme();
  const readiness = useFormReadinessPulse('complaint');
  const currentUser = userData?.[0] || null;
  const isAdmin = isAdminUser(currentUser);
  const [formData, setFormData] = useState<ComplaintFormState>(emptyState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recentItems, setRecentItems] = useState<any[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(isAdmin);
  const [totalCount, setTotalCount] = useState(0);

  const requestHeaders = useMemo((): Record<string, string> => {
    const initials = String(currentUser?.Initials || '').trim().toUpperCase();
    return initials ? { 'x-helix-initials': initials } : {};
  }, [currentUser?.Initials]);

  useEffect(() => {
    if (!isAdmin) return;
    const initials = requestHeaders['x-helix-initials'];
    if (!initials) { setIsLoadingRecent(false); return; }
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = getProxyBaseUrl();
        const res = await fetch(`${baseUrl}/api/registers/complaints`, { headers: requestHeaders, signal: ac.signal });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            setTotalCount(data.complaints.length);
            setRecentItems(data.complaints.slice(0, 10));
          }
        }
      } catch (e) { if ((e as Error).name !== 'AbortError') { /* history is supplementary */ } }
      finally { if (!ac.signal.aborted) setIsLoadingRecent(false); }
    })();
    return () => ac.abort();
  }, [isAdmin, requestHeaders]);

  const respondentOptions = useMemo<IDropdownOption[]>(() => {
    const items = (teamData || [])
      .filter((member) => member.status === 'active' && member.Initials)
      .map((member) => ({
        key: member.Initials || '',
        text: `${member['Full Name'] || member.First || ''} (${member.Initials})`,
      }));

    return items;
  }, [teamData]);

  const handleFieldChange = useCallback((field: keyof ComplaintFormState, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setSubmitMessage(null);
  }, []);

  const handleReset = useCallback(() => {
    setFormData(emptyState);
    setSubmitMessage(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!isAdmin) {
      setSubmitMessage({ type: 'error', text: 'Only administrators can record complaints.' });
      return;
    }

    if (!formData.complainant.trim() || !formData.respondent || !formData.received_date || !formData.description.trim()) {
      setSubmitMessage({ type: 'error', text: 'Complainant, respondent, date received, and description are required.' });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/registers/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...requestHeaders },
        body: JSON.stringify({
          matter_ref: formData.matter_ref || null,
          complainant: formData.complainant.trim(),
          respondent: formData.respondent,
          received_date: formData.received_date,
          description: formData.description.trim(),
          category: formData.category || null,
          area_of_work: formData.area_of_work || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to record complaint');
      }

      if (payload.complaint) {
        setRecentItems((prev) => [payload.complaint, ...prev].slice(0, 10));
        setTotalCount((prev) => prev + 1);
      }

      const successMessage = 'Complaint intake recorded and added to compliance oversight.';
      setSubmitMessage({ type: 'success', text: successMessage });
      onSubmitSuccess?.(successMessage);
      setFormData(emptyState);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred while recording the complaint.';
      setSubmitMessage({ type: 'error', text: message });
      onSubmitError?.(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, isAdmin, onSubmitError, onSubmitSuccess, requestHeaders]);

  return (
    <div style={getFormScrollContainerStyle(isDarkMode)}>
      <div style={getFormCardStyle(isDarkMode, accentColor)}>
        <div style={getFormHeaderStyle(isDarkMode, accentColor)}>
          <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
              <Icon iconName="Feedback" style={{ fontSize: 22, color: accentColor }} />
              <div>
                <Text variant="xLarge" style={getFormHeaderTitleStyle(isDarkMode)}>
                  New Complaint
                </Text>
                <Text style={getFormHeaderSubtitleStyle(isDarkMode)}>
                  Formal complaints start here, then move into controlled status management and closure review.
                </Text>
              </div>
            </Stack>
            {onBack ? (
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                <FormReadinessCue state={readiness.state} detail={readiness.detail} readyAnnouncement="Complaint form ready" />
                <DefaultButton text="Back" onClick={onBack} styles={getFormDefaultButtonStyles(isDarkMode)} />
              </Stack>
            ) : (
              <FormReadinessCue state={readiness.state} detail={readiness.detail} readyAnnouncement="Complaint form ready" />
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

          {!isAdmin && (
            <MessageBar messageBarType={MessageBarType.blocked} style={getMessageBarStyle(isDarkMode)}>
              Complaint intake is restricted to administrators. You can still review the compliance workspace, but you cannot submit this form.
            </MessageBar>
          )}

          <div style={getInfoBoxStyle(isDarkMode, 'warning')}>
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
              <Icon iconName="Warning" style={{ color: accentColor, flexShrink: 0 }} />
              <Text style={getInfoBoxTextStyle(isDarkMode)}>
                This is a controlled intake path. Capture the formal complaint here, then manage investigation, outcome, and lessons learned in the compliance workspace.
              </Text>
            </Stack>
          </div>

          <div style={getFormSectionStyle(isDarkMode, accentColor)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="StatusCircleErrorX" style={{ fontSize: 16 }} />
              Complaint details
            </div>

            <Stack tokens={formFieldTokens} style={{ paddingBottom: '4px' }}>
              <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="end">
                <Stack.Item grow styles={{ root: { flex: 2 } }}>
                  <TextField
                    label="Complainant"
                    value={formData.complainant}
                    onChange={(_, value) => handleFieldChange('complainant', value || '')}
                    required
                    placeholder="Client, third party, or named complainant"
                    styles={getInputStyles(isDarkMode)}
                    disabled={!isAdmin}
                  />
                </Stack.Item>
                <Stack.Item styles={{ root: { width: '260px', minWidth: '220px' } }}>
                  <Dropdown
                    label="Respondent"
                    options={respondentOptions}
                    selectedKey={formData.respondent || undefined}
                    onChange={(_, option) => handleFieldChange('respondent', String(option?.key || ''))}
                    styles={getDropdownStyles(isDarkMode)}
                    disabled={!isAdmin}
                  />
                </Stack.Item>
              </Stack>

              <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="end">
                <Stack.Item grow>
                  <TextField
                    label="Date received"
                    type="date"
                    value={formData.received_date}
                    onChange={(_, value) => handleFieldChange('received_date', value || '')}
                    required
                    styles={getInputStyles(isDarkMode)}
                    disabled={!isAdmin}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <Dropdown
                    label="Area of work"
                    options={aowOptions}
                    selectedKey={formData.area_of_work || undefined}
                    onChange={(_, option) => handleFieldChange('area_of_work', String(option?.key || ''))}
                    styles={getDropdownStyles(isDarkMode)}
                    disabled={!isAdmin}
                  />
                </Stack.Item>
              </Stack>

              <TextField
                label="Matter reference"
                value={formData.matter_ref}
                onChange={(_, value) => handleFieldChange('matter_ref', value || '')}
                placeholder="HLX-00000-00000"
                styles={getInputStyles(isDarkMode)}
                disabled={!isAdmin}
              />

              <TextField
                label="Category"
                value={formData.category}
                onChange={(_, value) => handleFieldChange('category', value || '')}
                placeholder="Service, delay, communication, billing, conduct"
                styles={getInputStyles(isDarkMode)}
                disabled={!isAdmin}
              />

              <TextField
                label="Description"
                value={formData.description}
                onChange={(_, value) => handleFieldChange('description', value || '')}
                required
                multiline
                rows={5}
                placeholder="Summarise the issue, the allegation or concern, and any immediate context needed for investigation."
                styles={getFormTextareaStyles(isDarkMode, 5)}
                disabled={!isAdmin}
              />
            </Stack>
          </div>

          <Stack horizontal tokens={{ childrenGap: 12 }} horizontalAlign="end" style={{ marginTop: '1.5rem' }}>
            <DefaultButton
              text="Reset"
              onClick={handleReset}
              disabled={isSubmitting || !isAdmin}
              styles={getFormDefaultButtonStyles(isDarkMode)}
            />
            <PrimaryButton
              text={isSubmitting ? 'Recording...' : 'Record complaint'}
              onClick={handleSubmit}
              disabled={isSubmitting || !isAdmin}
              styles={getFormPrimaryButtonStyles(isDarkMode, accentColor)}
            />
          </Stack>

          {/* Recent complaints (admin only) */}
          {isAdmin && (
            <div style={{ ...getFormSectionStyle(isDarkMode, accentColor), marginTop: 24 }}>
              <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
                <Icon iconName="History" style={{ fontSize: 16 }} />
                Recent complaints
                {!isLoadingRecent && <span style={{ fontWeight: 400, opacity: 0.7 }}> · {totalCount}</span>}
              </div>
              {isLoadingRecent ? (
                <Text style={{ fontSize: 13, color: isDarkMode ? '#d1d5db' : '#374151', padding: '12px 0' }}>Loading…</Text>
              ) : recentItems.length === 0 ? (
                <Text style={{ fontSize: 13, color: isDarkMode ? '#d1d5db' : '#374151', padding: '12px 0' }}>No complaints recorded yet.</Text>
              ) : (
                <div style={{ display: 'grid', gap: 0 }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 0.8fr',
                    padding: '8px 12px', fontSize: 12, fontWeight: 600,
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                    borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    fontFamily: "'Raleway', sans-serif", textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                    <span>Complainant</span>
                    <span>Respondent</span>
                    <span>Received</span>
                    <span>Status</span>
                  </div>
                  {recentItems.map((item) => {
                    const statusLower = (item.status || 'open').toLowerCase();
                    const statusColour = statusLower === 'closed' ? colours.green : statusLower === 'upheld' ? colours.cta : colours.orange;
                    return (
                      <div key={item.id} style={{
                        display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 0.8fr',
                        padding: '8px 12px', fontSize: 13, fontFamily: "'Raleway', sans-serif",
                        color: isDarkMode ? '#d1d5db' : '#374151',
                        borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                      }}>
                        <span style={{ fontWeight: 600 }}>{item.complainant}</span>
                        <span>{item.respondent}</span>
                        <span>{fmtDate(item.received_date)}</span>
                        <span style={{ color: statusColour, fontWeight: 600, fontSize: 12 }}>{capitalize(item.status || 'open')}</span>
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
          )}
        </div>
      </div>
    </div>
  );
};

export default ComplaintForm;