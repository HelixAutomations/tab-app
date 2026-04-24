import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { TextField } from '@fluentui/react/lib/TextField';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import type { IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { Icon } from '@fluentui/react/lib/Icon';
import { IconButton } from '@fluentui/react/lib/Button';
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

interface LearningDevelopmentFormProps {
  userData?: UserData[];
  teamData?: TeamData[] | null;
  onBack?: () => void;
  onSubmitSuccess?: (message: string) => void;
  onSubmitError?: (error: string) => void;
}

interface ActivityFormState {
  activity_date: string;
  title: string;
  description: string;
  category: string;
  hours: string;
  provider: string;
  evidence_url: string;
}

interface PlanFormState {
  target_hours: string;
  notes: string;
}

const accentColor = colours.highlight;

const categoryOptions: IDropdownOption[] = [
  { key: 'Course', text: 'Course / Training' },
  { key: 'Conference', text: 'Conference / Seminar' },
  { key: 'Reading', text: 'Reading / Research' },
  { key: 'Mentoring', text: 'Mentoring / Supervision' },
  { key: 'Pro Bono', text: 'Pro Bono' },
  { key: 'Other', text: 'Other' },
];

const emptyActivity: ActivityFormState = {
  activity_date: '',
  title: '',
  description: '',
  category: '',
  hours: '',
  provider: '',
  evidence_url: '',
};

const emptyPlan: PlanFormState = {
  target_hours: '16',
  notes: '',
};

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(d); }
};

const LearningDevelopmentForm: React.FC<LearningDevelopmentFormProps> = ({ userData, teamData, onBack, onSubmitSuccess, onSubmitError }) => {
  const { isDarkMode } = useTheme();
  const readiness = useFormReadinessPulse('learning-dev-plan');
  const currentUser = userData?.[0] || null;
  const isAdmin = isAdminUser(currentUser);
  const ownInitials = String(currentUser?.Initials || '').trim().toUpperCase();
  const currentYear = new Date().getFullYear();

  const [myPlan, setMyPlan] = useState<any>(null);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [activityForm, setActivityForm] = useState<ActivityFormState>(emptyActivity);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlan);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedInitials, setSelectedInitials] = useState<string>(ownInitials);

  const switchableUsers = useMemo(() => {
    if (!isAdmin || !(teamData || []).length) return [] as Array<{ initials: string; label: string }>;
    const seen = new Set<string>();
    const users: Array<{ initials: string; label: string }> = [];
    for (const member of (teamData || [])) {
      const initials = String(member?.Initials || '').trim().toUpperCase();
      if (!initials || seen.has(initials)) continue;
      seen.add(initials);
      users.push({ initials, label: String(member?.First || member?.['Full Name'] || initials) });
    }
    return users.sort((a, b) => a.initials.localeCompare(b.initials));
  }, [isAdmin, teamData]);

  useEffect(() => {
    setSelectedInitials(ownInitials);
  }, [ownInitials]);

  useEffect(() => {
    setEditingPlan(false);
    setEditingActivityId(null);
    setEditActivityForm(emptyActivity);
  }, [selectedInitials]);

  const requestHeaders = useMemo((): Record<string, string> => {
    const initials = String(currentUser?.Initials || '').trim().toUpperCase();
    return initials ? { 'x-helix-initials': initials } : {};
  }, [currentUser?.Initials]);

  useEffect(() => {
    const authInitials = requestHeaders['x-helix-initials'];
    const targetInitials = String(selectedInitials || '').trim().toUpperCase();
    if (!authInitials || !targetInitials) { setIsLoadingPlan(false); return; }
    setIsLoadingPlan(true);
    setSubmitMessage(null);
    const ac = new AbortController();
    (async () => {
      try {
        const baseUrl = getProxyBaseUrl();
        const res = await fetch(`${baseUrl}/api/registers/learning-dev?year=${currentYear}`, { headers: requestHeaders, signal: ac.signal });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            const mine = data.plans.find((p: any) => String(p.initials || '').toUpperCase() === targetInitials);
            if (mine) setMyPlan(mine);
            else setMyPlan(null);
          }
        }
      } catch (e) { if ((e as Error).name !== 'AbortError') { /* supplementary */ } }
      finally { if (!ac.signal.aborted) setIsLoadingPlan(false); }
    })();
    return () => ac.abort();
  }, [requestHeaders, selectedInitials, currentYear]);

  const handleCreatePlan = useCallback(async () => {
    const authInitials = requestHeaders['x-helix-initials'];
    const targetInitials = String(selectedInitials || '').trim().toUpperCase();
    if (!authInitials || !targetInitials) return;

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      const matchedUser = (teamData || []).find((member) => String(member.Initials || '').trim().toUpperCase() === targetInitials);
      const fullName = String(matchedUser?.['Full Name'] || matchedUser?.First || targetInitials);
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/registers/learning-dev`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...requestHeaders },
        body: JSON.stringify({
          target_initials: targetInitials,
          full_name: fullName,
          year: currentYear,
          target_hours: parseFloat(planForm.target_hours) || 16,
          notes: planForm.notes || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to create plan');
      }

      setMyPlan({ ...payload.plan, activities: [], total_hours: 0 });
      setSubmitMessage({ type: 'success', text: `CPD plan created for ${currentYear}. You can now log activities.` });
      onSubmitSuccess?.(`CPD plan created for ${currentYear}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create CPD plan.';
      setSubmitMessage({ type: 'error', text: message });
      onSubmitError?.(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [planForm, requestHeaders, selectedInitials, teamData, currentYear, onSubmitSuccess, onSubmitError]);

  const handleLogActivity = useCallback(async () => {
    if (!myPlan) return;
    if (!activityForm.activity_date || !activityForm.title.trim()) {
      setSubmitMessage({ type: 'error', text: 'Date and title are required.' });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/registers/learning-dev/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...requestHeaders },
        body: JSON.stringify({
          plan_id: myPlan.id,
          activity_date: activityForm.activity_date,
          title: activityForm.title.trim(),
          description: activityForm.description.trim() || null,
          category: activityForm.category || null,
          hours: parseFloat(activityForm.hours) || 0,
          provider: activityForm.provider.trim() || null,
          evidence_url: activityForm.evidence_url.trim() || null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to log activity');
      }

      const newHours = parseFloat(activityForm.hours) || 0;
      setMyPlan((prev: any) => ({
        ...prev,
        activities: [payload.activity, ...(prev.activities || [])],
        total_hours: (parseFloat(prev.total_hours) || 0) + newHours,
      }));

      const successMessage = 'Activity logged to your CPD plan.';
      setSubmitMessage({ type: 'success', text: successMessage });
      onSubmitSuccess?.(successMessage);
      setActivityForm(emptyActivity);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to log activity.';
      setSubmitMessage({ type: 'error', text: message });
      onSubmitError?.(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [activityForm, myPlan, requestHeaders, onSubmitSuccess, onSubmitError]);

  const handleActivityField = useCallback((field: keyof ActivityFormState, value: string) => {
    setActivityForm((c) => ({ ...c, [field]: value }));
    setSubmitMessage(null);
  }, []);

  // ── Editing state ──
  const [editingPlan, setEditingPlan] = useState(false);
  const [editPlanForm, setEditPlanForm] = useState<PlanFormState>(emptyPlan);
  const [editingActivityId, setEditingActivityId] = useState<number | null>(null);
  const [editActivityForm, setEditActivityForm] = useState<ActivityFormState>(emptyActivity);

  const startEditPlan = useCallback(() => {
    if (!myPlan) return;
    setEditPlanForm({ target_hours: String(myPlan.target_hours || 16), notes: myPlan.notes || '' });
    setEditingPlan(true);
    setSubmitMessage(null);
  }, [myPlan]);

  const handleUpdatePlan = useCallback(async () => {
    if (!myPlan) return;
    setIsSubmitting(true);
    setSubmitMessage(null);
    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/registers/learning-dev/${myPlan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...requestHeaders },
        body: JSON.stringify({
          target_hours: parseFloat(editPlanForm.target_hours) || 16,
          notes: editPlanForm.notes || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to update plan');
      setMyPlan((prev: any) => ({ ...prev, target_hours: payload.plan.target_hours, notes: payload.plan.notes }));
      setEditingPlan(false);
      setSubmitMessage({ type: 'success', text: 'Plan updated.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update plan.';
      setSubmitMessage({ type: 'error', text: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [myPlan, editPlanForm, requestHeaders]);

  const startEditActivity = useCallback((item: any) => {
    setEditingActivityId(item.id);
    setEditActivityForm({
      activity_date: item.activity_date ? item.activity_date.split('T')[0] : '',
      title: item.title || '',
      description: item.description || '',
      category: item.category || '',
      hours: String(item.hours || ''),
      provider: item.provider || '',
      evidence_url: item.evidence_url || '',
    });
    setSubmitMessage(null);
  }, []);

  const handleUpdateActivity = useCallback(async () => {
    if (!editingActivityId) return;
    setIsSubmitting(true);
    setSubmitMessage(null);
    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/registers/learning-dev/activity/${editingActivityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...requestHeaders },
        body: JSON.stringify({
          activity_date: editActivityForm.activity_date,
          title: editActivityForm.title.trim(),
          description: editActivityForm.description.trim() || null,
          category: editActivityForm.category || null,
          hours: parseFloat(editActivityForm.hours) || 0,
          provider: editActivityForm.provider.trim() || null,
          evidence_url: editActivityForm.evidence_url.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to update activity');

      setMyPlan((prev: any) => {
        const oldAct = (prev.activities || []).find((a: any) => a.id === editingActivityId);
        const hoursDiff = (parseFloat(editActivityForm.hours) || 0) - (parseFloat(oldAct?.hours) || 0);
        return {
          ...prev,
          activities: (prev.activities || []).map((a: any) => a.id === editingActivityId ? payload.activity : a),
          total_hours: (parseFloat(prev.total_hours) || 0) + hoursDiff,
        };
      });
      setEditingActivityId(null);
      setSubmitMessage({ type: 'success', text: 'Activity updated.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update activity.';
      setSubmitMessage({ type: 'error', text: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [editingActivityId, editActivityForm, requestHeaders]);

  const handleDeleteActivity = useCallback(async (activityId: number) => {
    setIsSubmitting(true);
    setSubmitMessage(null);
    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/registers/learning-dev/activity/${activityId}`, {
        method: 'DELETE',
        headers: requestHeaders,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Failed to delete activity');

      setMyPlan((prev: any) => {
        const removed = (prev.activities || []).find((a: any) => a.id === activityId);
        return {
          ...prev,
          activities: (prev.activities || []).filter((a: any) => a.id !== activityId),
          total_hours: Math.max(0, (parseFloat(prev.total_hours) || 0) - (parseFloat(removed?.hours) || 0)),
        };
      });
      if (editingActivityId === activityId) setEditingActivityId(null);
      setSubmitMessage({ type: 'success', text: 'Activity deleted.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete activity.';
      setSubmitMessage({ type: 'error', text: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [requestHeaders, editingActivityId]);

  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const border = isDarkMode ? colours.dark.border : colours.light.border;

  return (
    <div style={getFormScrollContainerStyle(isDarkMode)}>
      <div style={getFormCardStyle(isDarkMode, accentColor)}>
        <div style={getFormHeaderStyle(isDarkMode, accentColor)}>
          <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
              <Icon iconName="Education" style={{ fontSize: 22, color: accentColor }} />
              <div>
                <Text variant="xLarge" style={getFormHeaderTitleStyle(isDarkMode)}>
                  Learning & Development
                </Text>
                <Text style={getFormHeaderSubtitleStyle(isDarkMode)}>
                  {myPlan
                    ? `${currentYear} plan · ${parseFloat(myPlan.total_hours || 0).toFixed(1)}h of ${myPlan.target_hours || 16}h target`
                    : `Create your ${currentYear} CPD plan to start logging activities.`}
                </Text>
              </div>
            </Stack>
            {onBack ? (
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                <FormReadinessCue state={readiness.state} detail={readiness.detail} readyAnnouncement="Learning & development form ready" />
                <DefaultButton text="Back" onClick={onBack} styles={getFormDefaultButtonStyles(isDarkMode)} />
              </Stack>
            ) : (
              <FormReadinessCue state={readiness.state} detail={readiness.detail} readyAnnouncement="Learning & development form ready" />
            )}
          </Stack>
        </div>

        <div style={getFormContentStyle(isDarkMode)}>
          {isAdmin && switchableUsers.length > 0 && (
            <div style={{ ...getFormSectionStyle(isDarkMode, accentColor), marginBottom: 16 }}>
              <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
                <Icon iconName="ContactList" style={{ fontSize: 16 }} />
                Switch user
              </div>
              <Text style={{ fontSize: 12, color: bodyText, marginBottom: 8 }}>
                One-click view and edit for another team member&apos;s learning plan.
              </Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setSelectedInitials(ownInitials)}
                  style={{
                    borderRadius: 0,
                    border: `1px solid ${selectedInitials === ownInitials ? colours.highlight : border}`,
                    background: selectedInitials === ownInitials
                      ? (isDarkMode ? `${colours.accent}24` : colours.highlightBlue)
                      : (isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground),
                    color: selectedInitials === ownInitials ? colours.highlight : bodyText,
                    cursor: 'pointer',
                    fontFamily: "'Raleway', sans-serif",
                    fontSize: 11,
                    fontWeight: selectedInitials === ownInitials ? 700 : 500,
                    padding: '5px 10px',
                  }}
                >
                  Me ({ownInitials || '—'})
                </button>

                {switchableUsers.filter((u) => u.initials !== ownInitials).map((u) => {
                  const isSelected = selectedInitials === u.initials;
                  return (
                    <button
                      key={u.initials}
                      type="button"
                      onClick={() => setSelectedInitials(u.initials)}
                      style={{
                        borderRadius: 0,
                        border: `1px solid ${isSelected ? colours.highlight : border}`,
                        background: isSelected
                          ? (isDarkMode ? `${colours.accent}24` : colours.highlightBlue)
                          : (isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground),
                        color: isSelected ? colours.highlight : bodyText,
                        cursor: 'pointer',
                        fontFamily: "'Raleway', sans-serif",
                        fontSize: 11,
                        fontWeight: isSelected ? 700 : 500,
                        padding: '5px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{u.initials}</span>
                      <span style={{ opacity: 0.75 }}>{u.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {submitMessage && (
            <MessageBar
              messageBarType={submitMessage.type === 'success' ? MessageBarType.success : MessageBarType.error}
              onDismiss={() => setSubmitMessage(null)}
              style={getMessageBarStyle(isDarkMode)}
            >
              {submitMessage.text}
            </MessageBar>
          )}

          {isLoadingPlan ? (
            <Text style={{ fontSize: 13, color: bodyText, padding: '12px 0' }}>Loading your CPD plan…</Text>
          ) : !myPlan ? (
            /* ── Plan creation ── */
            <div style={getFormSectionStyle(isDarkMode, accentColor)}>
              <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
                <Icon iconName="Add" style={{ fontSize: 16 }} />
                Create {currentYear} CPD plan
              </div>
              <Stack tokens={formFieldTokens} style={{ paddingBottom: 4 }}>
                <div style={getInfoBoxStyle(isDarkMode, 'info')}>
                  <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                    <Icon iconName="Info" style={{ color: accentColor, flexShrink: 0 }} />
                    <Text style={getInfoBoxTextStyle(isDarkMode)}>
                      You need a plan for this year before you can log activities. The SRA expects 16 hours minimum.
                    </Text>
                  </Stack>
                </div>
                <TextField
                  label="Target hours"
                  type="number"
                  value={planForm.target_hours}
                  onChange={(_, v) => setPlanForm((c) => ({ ...c, target_hours: v || '16' }))}
                  styles={getInputStyles(isDarkMode)}
                />
                <TextField
                  label="Notes"
                  value={planForm.notes}
                  onChange={(_, v) => setPlanForm((c) => ({ ...c, notes: v || '' }))}
                  placeholder="Development focus areas, goals, or plans for the year"
                  multiline
                  rows={3}
                  styles={getFormTextareaStyles(isDarkMode, 3)}
                />
              </Stack>
              <Stack horizontal horizontalAlign="end" style={{ marginTop: 12 }}>
                <PrimaryButton
                  text={isSubmitting ? 'Creating…' : 'Create plan'}
                  onClick={handleCreatePlan}
                  disabled={isSubmitting}
                  styles={getFormPrimaryButtonStyles(isDarkMode, accentColor)}
                />
              </Stack>
            </div>
          ) : (
            /* ── Activity logging ── */
            <>
              {/* Progress strip + plan edit */}
              {editingPlan ? (
                <div style={{
                  padding: '12px 16px', border: `1px solid ${border}`,
                  background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                  display: 'grid', gap: 10,
                }}>
                  <Text style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                    Edit {currentYear} plan
                  </Text>
                  <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="end">
                    <Stack.Item styles={{ root: { width: 120 } }}>
                      <TextField
                        label="Target hours"
                        type="number"
                        value={editPlanForm.target_hours}
                        onChange={(_, v) => setEditPlanForm((c) => ({ ...c, target_hours: v || '16' }))}
                        styles={getInputStyles(isDarkMode)}
                      />
                    </Stack.Item>
                    <Stack.Item grow>
                      <TextField
                        label="Notes"
                        value={editPlanForm.notes}
                        onChange={(_, v) => setEditPlanForm((c) => ({ ...c, notes: v || '' }))}
                        styles={getInputStyles(isDarkMode)}
                      />
                    </Stack.Item>
                  </Stack>
                  <Stack horizontal tokens={{ childrenGap: 8 }} horizontalAlign="end">
                    <DefaultButton text="Cancel" onClick={() => setEditingPlan(false)} disabled={isSubmitting} styles={getFormDefaultButtonStyles(isDarkMode)} />
                    <PrimaryButton text={isSubmitting ? 'Saving…' : 'Save'} onClick={handleUpdatePlan} disabled={isSubmitting} styles={getFormPrimaryButtonStyles(isDarkMode, accentColor)} />
                  </Stack>
                </div>
              ) : (() => {
                const logged = parseFloat(myPlan.total_hours || 0);
                const target = parseFloat(myPlan.target_hours || 16);
                const pct = Math.min((logged / target) * 100, 100);
                const progressColour = pct >= 100 ? colours.green : pct >= 50 ? colours.orange : colours.cta;
                return (
                  <div style={{
                    padding: '12px 16px', border: `1px solid ${border}`,
                    background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
                    display: 'grid', gap: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <Text style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                        {currentYear} progress
                      </Text>
                      <Stack horizontal verticalAlign="baseline" tokens={{ childrenGap: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: 700, color: progressColour }}>
                          {logged.toFixed(1)}h / {target}h
                        </Text>
                        <IconButton
                          iconProps={{ iconName: 'Edit', style: { fontSize: 12 } }}
                          title="Edit plan"
                          onClick={startEditPlan}
                          styles={{ root: { width: 24, height: 24 }, icon: { color: isDarkMode ? colours.subtleGrey : colours.greyText } }}
                        />
                      </Stack>
                    </div>
                    <div style={{ height: 6, background: isDarkMode ? colours.dark.border : '#e5e7eb', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: progressColour, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                );
              })()}

              <div style={getFormSectionStyle(isDarkMode, accentColor)}>
                <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
                  <Icon iconName="Add" style={{ fontSize: 16 }} />
                  Log activity
                </div>
                <Stack tokens={formFieldTokens} style={{ paddingBottom: 4 }}>
                  <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="end">
                    <Stack.Item grow styles={{ root: { flex: 2 } }}>
                      <TextField
                        label="Title"
                        value={activityForm.title}
                        onChange={(_, v) => handleActivityField('title', v || '')}
                        required
                        placeholder="Course name, article, webinar, etc."
                        styles={getInputStyles(isDarkMode)}
                      />
                    </Stack.Item>
                    <Stack.Item styles={{ root: { width: 200 } }}>
                      <Dropdown
                        label="Category"
                        options={categoryOptions}
                        selectedKey={activityForm.category || undefined}
                        onChange={(_, opt) => handleActivityField('category', String(opt?.key || ''))}
                        styles={getDropdownStyles(isDarkMode)}
                      />
                    </Stack.Item>
                  </Stack>
                  <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="end">
                    <Stack.Item grow>
                      <TextField
                        label="Date"
                        type="date"
                        value={activityForm.activity_date}
                        onChange={(_, v) => handleActivityField('activity_date', v || '')}
                        required
                        styles={getInputStyles(isDarkMode)}
                      />
                    </Stack.Item>
                    <Stack.Item grow>
                      <TextField
                        label="Hours"
                        type="number"
                        value={activityForm.hours}
                        onChange={(_, v) => handleActivityField('hours', v || '')}
                        placeholder="0"
                        styles={getInputStyles(isDarkMode)}
                      />
                    </Stack.Item>
                    <Stack.Item grow>
                      <TextField
                        label="Provider"
                        value={activityForm.provider}
                        onChange={(_, v) => handleActivityField('provider', v || '')}
                        placeholder="Organisation or source"
                        styles={getInputStyles(isDarkMode)}
                      />
                    </Stack.Item>
                  </Stack>
                  <TextField
                    label="Description"
                    value={activityForm.description}
                    onChange={(_, v) => handleActivityField('description', v || '')}
                    multiline
                    rows={3}
                    placeholder="What you learned, key takeaways"
                    styles={getFormTextareaStyles(isDarkMode, 3)}
                  />
                  <TextField
                    label="Evidence link"
                    value={activityForm.evidence_url}
                    onChange={(_, v) => handleActivityField('evidence_url', v || '')}
                    placeholder="URL to certificate, notes, or materials"
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack>
                <Stack horizontal tokens={{ childrenGap: 12 }} horizontalAlign="end" style={{ marginTop: 12 }}>
                  <DefaultButton
                    text="Reset"
                    onClick={() => setActivityForm(emptyActivity)}
                    disabled={isSubmitting}
                    styles={getFormDefaultButtonStyles(isDarkMode)}
                  />
                  <PrimaryButton
                    text={isSubmitting ? 'Logging…' : 'Log activity'}
                    onClick={handleLogActivity}
                    disabled={isSubmitting}
                    styles={getFormPrimaryButtonStyles(isDarkMode, accentColor)}
                  />
                </Stack>
              </div>

              {/* Recent activities */}
              <div style={{ ...getFormSectionStyle(isDarkMode, accentColor), marginTop: 24 }}>
                <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
                  <Icon iconName="History" style={{ fontSize: 16 }} />
                  Recent activities
                  <span style={{ fontWeight: 400, opacity: 0.7 }}> · {(myPlan.activities || []).length}</span>
                </div>
                {(myPlan.activities || []).length === 0 ? (
                  <Text style={{ fontSize: 13, color: bodyText, padding: '12px 0' }}>No activities logged yet.</Text>
                ) : (
                  <div style={{ display: 'grid', gap: 0 }}>
                    <div style={{
                      display: 'grid', gridTemplateColumns: '2fr 1fr 0.6fr 1fr 56px',
                      padding: '6px 12px', fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                      textTransform: 'uppercase' as const,
                      color: isDarkMode ? colours.subtleGrey : colours.greyText,
                      borderBottom: `1px solid ${border}`,
                    }}>
                      <span>Title</span><span>Date</span><span>Hours</span><span>Category</span><span />
                    </div>
                    {(myPlan.activities || []).slice(0, 10).map((item: any) => {
                      const isEditing = editingActivityId === item.id;
                      if (isEditing) {
                        return (
                          <div key={item.id} style={{
                            padding: '10px 12px', borderBottom: `1px solid ${border}`,
                            background: isDarkMode ? colours.dark.cardHover : '#f8fafc',
                          }}>
                            <Stack tokens={{ childrenGap: 8 }}>
                              <Stack horizontal tokens={{ childrenGap: 10 }} verticalAlign="end">
                                <Stack.Item grow styles={{ root: { flex: 2 } }}>
                                  <TextField label="Title" value={editActivityForm.title} onChange={(_, v) => setEditActivityForm(c => ({ ...c, title: v || '' }))} styles={getInputStyles(isDarkMode)} />
                                </Stack.Item>
                                <Stack.Item styles={{ root: { width: 160 } }}>
                                  <Dropdown label="Category" options={categoryOptions} selectedKey={editActivityForm.category || undefined} onChange={(_, opt) => setEditActivityForm(c => ({ ...c, category: String(opt?.key || '') }))} styles={getDropdownStyles(isDarkMode)} />
                                </Stack.Item>
                              </Stack>
                              <Stack horizontal tokens={{ childrenGap: 10 }} verticalAlign="end">
                                <Stack.Item grow>
                                  <TextField label="Date" type="date" value={editActivityForm.activity_date} onChange={(_, v) => setEditActivityForm(c => ({ ...c, activity_date: v || '' }))} styles={getInputStyles(isDarkMode)} />
                                </Stack.Item>
                                <Stack.Item grow>
                                  <TextField label="Hours" type="number" value={editActivityForm.hours} onChange={(_, v) => setEditActivityForm(c => ({ ...c, hours: v || '' }))} styles={getInputStyles(isDarkMode)} />
                                </Stack.Item>
                                <Stack.Item grow>
                                  <TextField label="Provider" value={editActivityForm.provider} onChange={(_, v) => setEditActivityForm(c => ({ ...c, provider: v || '' }))} styles={getInputStyles(isDarkMode)} />
                                </Stack.Item>
                              </Stack>
                              <TextField label="Description" multiline rows={2} value={editActivityForm.description} onChange={(_, v) => setEditActivityForm(c => ({ ...c, description: v || '' }))} styles={getFormTextareaStyles(isDarkMode, 2)} />
                              <TextField label="Evidence link" value={editActivityForm.evidence_url} onChange={(_, v) => setEditActivityForm(c => ({ ...c, evidence_url: v || '' }))} styles={getInputStyles(isDarkMode)} />
                              <Stack horizontal tokens={{ childrenGap: 8 }} horizontalAlign="end">
                                <DefaultButton text="Cancel" onClick={() => setEditingActivityId(null)} disabled={isSubmitting} styles={getFormDefaultButtonStyles(isDarkMode)} />
                                <PrimaryButton text={isSubmitting ? 'Saving…' : 'Save'} onClick={handleUpdateActivity} disabled={isSubmitting} styles={getFormPrimaryButtonStyles(isDarkMode, accentColor)} />
                              </Stack>
                            </Stack>
                          </div>
                        );
                      }
                      return (
                        <div key={item.id} style={{
                          display: 'grid', gridTemplateColumns: '2fr 1fr 0.6fr 1fr 56px',
                          padding: '8px 12px', fontSize: 13, fontFamily: "'Raleway', sans-serif",
                          color: bodyText,
                          borderBottom: `1px solid ${border}`,
                        }}>
                          <span style={{ fontWeight: 600 }}>{item.title}</span>
                          <span>{fmtDate(item.activity_date)}</span>
                          <span>{parseFloat(item.hours || 0).toFixed(1)}</span>
                          <span>{item.category || '—'}</span>
                          <span style={{ display: 'flex', gap: 2 }}>
                            <IconButton
                              iconProps={{ iconName: 'Edit', style: { fontSize: 12 } }}
                              title="Edit"
                              onClick={() => startEditActivity(item)}
                              styles={{ root: { width: 24, height: 24 }, icon: { color: isDarkMode ? colours.subtleGrey : colours.greyText } }}
                            />
                            <IconButton
                              iconProps={{ iconName: 'Delete', style: { fontSize: 12 } }}
                              title="Delete"
                              onClick={() => handleDeleteActivity(item.id)}
                              styles={{ root: { width: 24, height: 24 }, icon: { color: colours.cta } }}
                            />
                          </span>
                        </div>
                      );
                    })}
                    {(myPlan.activities || []).length > 10 && (
                      <Text style={{ fontSize: 12, color: isDarkMode ? colours.subtleGrey : colours.greyText, padding: '10px 12px 4px' }}>
                        Showing 10 of {(myPlan.activities || []).length}. Full plan in Resources → Learning & Development.
                      </Text>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LearningDevelopmentForm;
