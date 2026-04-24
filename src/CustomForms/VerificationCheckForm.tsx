// src/CustomForms/VerificationCheckForm.tsx
// Comprehensive Tiller verification runner (admin-only).
// Always runs both Address (checkTypeId 1) + PEP & Sanctions (checkTypeId 2).
// When linked to an instruction, each submit appends a new row to IDVerifications.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { TextField } from '@fluentui/react/lib/TextField';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import type { IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { Icon } from '@fluentui/react/lib/Icon';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { useTheme } from '../app/functionality/ThemeContext';
import { getProxyBaseUrl } from '../utils/getProxyBaseUrl';
import { UserData } from '../app/functionality/types';
import { sortedTillerCountries, tillerGenders, tillerTitles } from './tillerReference';
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
  formFieldTokens,
  formAccentColors,
} from './shared/formStyles';

interface VerificationCheckFormProps {
  currentUser?: UserData;
  onBack?: () => void;
  onSubmitSuccess?: (message: string) => void;
  onSubmitError?: (error: string) => void;
  /**
   * When rendered inside a quick-action panel that already shows a title and
   * description (e.g. Home's bespoke panel), set this to suppress the form's
   * own header + intro info box so the chrome doesn't double up.
   */
  embedded?: boolean;
}

interface InstructionPickOption {
  ref: string;
  displayName: string;
  stage?: string | null;
  sufficient: boolean;
  missing: string[];
}

interface FormData {
  instructionRef: string;
  title: string;
  gender: string;
  firstName: string;
  lastName: string;
  dob: string; // ISO from <input type="date"> — YYYY-MM-DD
  email: string;
  phone: string;
  nationality: string;
  passportNumber: string;
  driversLicenseNumber: string;
  houseNumber: string;
  street: string;
  city: string;
  county: string;
  postcode: string;
  countryCode: string;
}

interface PriorVerifications {
  count: number;
  lastResult: string | null;
  lastCheckedDate: string | null;
}

interface HistoryRow {
  checkId?: string;
  status?: string;
  overall?: string;
  address?: string;
  pep?: string;
  provider?: string;
  email?: string;
  checkedAt?: string | null;
  expiry?: string | null;
}

type CheckResultSummary = {
  label: string;
  overallResult?: string;
  overallStatus?: string;
  results?: Array<{ name?: string; result?: string; reason?: string }>;
};

type AdhocResponseItem = {
  correlationId?: string;
  externalReferenceId?: string;
  overallResult?: string;
  overallStatus?: string;
  checkStatuses?: Array<{
    id?: string;
    checkTypeId?: number;
    sourceResults?: Array<{
      result?: string;
      status?: string;
      results?: Array<{ name?: string; result?: string; reason?: string }>;
    }>;
  }>;
};

const titleOptions: IDropdownOption[] = tillerTitles.map(t => ({ key: t, text: t }));

const genderOptions: IDropdownOption[] = tillerGenders.map(g => ({ key: g.name, text: g.name }));

const countryOptions: IDropdownOption[] = sortedTillerCountries.map(c => ({ key: c.code, text: `${c.name} (${c.code})` }));

const nationalityOptions: IDropdownOption[] = sortedTillerCountries.map(c => ({ key: c.name, text: `${c.name} (${c.code})` }));

const accentColor = formAccentColors.techIdea; // brand highlight

const initialFormData: FormData = {
  instructionRef: '',
  title: 'Mr',
  gender: 'Male',
  firstName: '',
  lastName: '',
  dob: '',
  email: '',
  phone: '',
  nationality: '',
  passportNumber: '',
  driversLicenseNumber: '',
  houseNumber: '',
  street: '',
  city: '',
  county: '',
  postcode: '',
  countryCode: 'GB',
};

const CHECK_TYPE_LABELS: Record<number, string> = {
  1: 'Address Verification',
  2: 'PEP & Sanctions',
};

function summariseResponse(raw: unknown): { items: AdhocResponseItem[]; summary: CheckResultSummary[] } {
  const asArray: AdhocResponseItem[] = Array.isArray(raw) ? (raw as AdhocResponseItem[]) : [raw as AdhocResponseItem];
  const summary: CheckResultSummary[] = [];
  for (const item of asArray) {
    if (!item) continue;
    for (const cs of item.checkStatuses || []) {
      const label = CHECK_TYPE_LABELS[cs.checkTypeId || 0] || `Check #${cs.checkTypeId ?? '?'}`;
      const first = (cs.sourceResults || [])[0];
      summary.push({
        label,
        overallResult: first?.result,
        overallStatus: first?.status,
        results: first?.results,
      });
    }
    if (!item.checkStatuses?.length && (item.overallResult || item.overallStatus)) {
      summary.push({
        label: 'Verification',
        overallResult: item.overallResult,
        overallStatus: item.overallStatus,
      });
    }
  }
  return { items: asArray, summary };
}

function resultPillStyle(result: string | undefined, isDarkMode: boolean): React.CSSProperties {
  const passed = (result || '').toLowerCase() === 'passed';
  const failed = (result || '').toLowerCase() === 'failed';
  const review = (result || '').toLowerCase() === 'review';
  const base: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };
  if (passed) return { ...base, background: 'rgba(32, 178, 108, 0.18)', color: isDarkMode ? '#7ee2a8' : '#117a42' };
  if (failed) return { ...base, background: 'rgba(214, 85, 65, 0.18)', color: isDarkMode ? '#ff9d8a' : '#a5361f' };
  if (review) return { ...base, background: 'rgba(255, 140, 0, 0.18)', color: isDarkMode ? '#ffcb87' : '#8a4a00' };
  return { ...base, background: 'rgba(160, 160, 160, 0.18)', color: isDarkMode ? '#d1d5db' : '#374151' };
}

const VerificationCheckForm: React.FC<VerificationCheckFormProps> = ({ currentUser, onBack, onSubmitSuccess, onSubmitError, embedded = false }) => {
  const { isDarkMode } = useTheme();

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [priorVerifications, setPriorVerifications] = useState<PriorVerifications | null>(null);
  const [instructionList, setInstructionList] = useState<InstructionPickOption[]>([]);
  const [isLoadingInstructions, setIsLoadingInstructions] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [response, setResponse] = useState<unknown>(null);
  const [persistedSummary, setPersistedSummary] = useState<{ checkId?: string; overall?: string; pep?: string; address?: string } | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const loadHistory = useCallback(async (ref: string) => {
    if (!ref) { setHistory([]); return; }
    setIsLoadingHistory(true);
    try {
      const baseUrl = getProxyBaseUrl();
      const res = await fetch(`${baseUrl}/api/verify-id/adhoc/history/${encodeURIComponent(ref)}`);
      const json = await res.json().catch(() => ({} as any));
      if (res.ok && Array.isArray(json.rows)) setHistory(json.rows);
      else setHistory([]);
    } catch {
      setHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Refresh history whenever instruction ref settles (on prefill or manual entry).
  useEffect(() => {
    const ref = formData.instructionRef.trim();
    if (!ref) { setHistory([]); return; }
    const t = setTimeout(() => { loadHistory(ref); }, 400);
    return () => clearTimeout(t);
  }, [formData.instructionRef, loadHistory]);

  const handleFieldChange = useCallback(<K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setSubmitMessage(null);
  }, []);

  const handleReset = useCallback(() => {
    setFormData(initialFormData);
    setSubmitMessage(null);
    setPrefillMessage(null);
    setPriorVerifications(null);
    setResponse(null);
    setPersistedSummary(null);
    setCorrelationId(null);
    setHistory([]);
  }, []);

  const handlePrefill = useCallback(async (refArg?: string) => {
    const ref = (refArg ?? formData.instructionRef).trim();
    if (!ref) {
      setPrefillMessage('Pick an instruction from the dropdown first.');
      return;
    }
    setIsPrefilling(true);
    setPrefillMessage(null);
    setPriorVerifications(null);

    try {
      const baseUrl = getProxyBaseUrl();
      const res = await fetch(`${baseUrl}/api/verify-id/adhoc/prefill/${encodeURIComponent(ref)}`);
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(json?.details || json?.error || `HTTP ${res.status}`);
      }
      const p = json.prefill || {};
      // Title / gender only accept dropdown keys — fall back to current if DB value is empty.
      setFormData(prev => ({
        ...prev,
        instructionRef: ref,
        title: p.title || prev.title,
        gender: p.gender || prev.gender,
        firstName: p.firstName || '',
        lastName: p.lastName || '',
        dob: p.dob || '',
        email: p.email || '',
        phone: p.phone || '',
        nationality: p.nationality || '',
        passportNumber: p.passportNumber || '',
        driversLicenseNumber: p.driversLicenseNumber || '',
        houseNumber: p.houseNumber || '',
        street: p.street || '',
        city: p.city || '',
        county: p.county || '',
        postcode: p.postcode || '',
        countryCode: p.countryCode || 'GB',
      }));
      setPriorVerifications(json.priorVerifications || { count: 0, lastResult: null, lastCheckedDate: null });
      const filledFrom = [p.firstName && 'name', p.dob && 'DOB', p.email && 'email', p.postcode && 'address', p.passportNumber && 'passport', p.driversLicenseNumber && 'licence']
        .filter(Boolean).join(', ');
      setPrefillMessage(`Prefilled from ${ref}${filledFrom ? ` — ${filledFrom}` : ''}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Prefill failed';
      setPrefillMessage(`Prefill failed: ${msg}`);
    } finally {
      setIsPrefilling(false);
    }
    // `formData.instructionRef` is intentionally omitted — the ref is always
    // passed in explicitly (either from the dropdown onChange or the prior value).
  }, []);

  // Load recent instructions once on mount for the picklist.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingInstructions(true);
      try {
        const baseUrl = getProxyBaseUrl();
        const res = await fetch(`${baseUrl}/api/verify-id/adhoc/instructions?limit=75`);
        const json = await res.json().catch(() => ({} as any));
        if (!cancelled && res.ok && Array.isArray(json.instructions)) {
          setInstructionList(json.instructions);
        }
      } catch {
        // Silent — dropdown just stays empty with a fallback hint.
      } finally {
        if (!cancelled) setIsLoadingInstructions(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const instructionDropdownOptions = useMemo<IDropdownOption[]>(() => {
    const opts: IDropdownOption[] = [
      { key: '', text: '— Ad-hoc (no instruction link) —' },
    ];
    instructionList.forEach(i => {
      const tag = i.sufficient ? 'Ready' : `Missing: ${i.missing.join(', ')}`;
      opts.push({ key: i.ref, text: `${i.ref} — ${i.displayName}  [${tag}]`, data: i });
    });
    return opts;
  }, [instructionList]);

  const handleSubmit = useCallback(async () => {
    const requiredFields: Array<{ key: keyof FormData; label: string }> = [
      { key: 'firstName', label: 'First name' },
      { key: 'lastName', label: 'Last name' },
      { key: 'dob', label: 'Date of birth' },
      { key: 'email', label: 'Email' },
      { key: 'nationality', label: 'Nationality' },
      { key: 'houseNumber', label: 'Building number' },
      { key: 'street', label: 'Road / Street' },
      { key: 'city', label: 'Town / City' },
      { key: 'postcode', label: 'Postcode' },
      { key: 'countryCode', label: 'Country' },
    ];
    const missing = requiredFields.filter(f => !String(formData[f.key] || '').trim()).map(f => f.label);
    if (!formData.passportNumber.trim() && !formData.driversLicenseNumber.trim()) {
      missing.push('Passport number or Driving licence number');
    }
    if (missing.length) {
      setSubmitMessage({ type: 'error', text: `Required: ${missing.join(', ')}` });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage(null);
    setResponse(null);
    setPersistedSummary(null);
    setCorrelationId(null);

    try {
      const baseUrl = getProxyBaseUrl();
      const body = {
        instructionRef: formData.instructionRef.trim() || undefined,
        title: formData.title,
        gender: formData.gender,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        dob: formData.dob, // YYYY-MM-DD from date input
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
        nationality: formData.nationality.trim(),
        passportNumber: formData.passportNumber.trim() || undefined,
        driversLicenseNumber: formData.driversLicenseNumber.trim() || undefined,
        houseNumber: formData.houseNumber.trim(),
        street: formData.street.trim(),
        city: formData.city.trim(),
        county: formData.county.trim() || formData.city.trim(),
        postcode: formData.postcode.trim(),
        countryCode: formData.countryCode,
      };

      const res = await fetch(`${baseUrl}/api/verify-id/adhoc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        const detail = json?.details || json?.error || `HTTP ${res.status}`;
        const validation = json?.validationErrors ? ` — ${JSON.stringify(json.validationErrors)}` : '';
        const missingList = Array.isArray(json?.missing) ? ` — missing: ${json.missing.join(', ')}` : '';
        throw new Error(`${detail}${validation}${missingList}`);
      }

      setResponse(json.response);
      setPersistedSummary(json.persistedSummary || null);
      setCorrelationId(json.correlationId || null);
      const refLabel = json.correlationId || json.externalReferenceId;
      const persistedNote = json.persisted
        ? ` — appended to instruction history.`
        : body.instructionRef
          ? ` — Tiller succeeded but the database write failed; check logs.`
          : ' — ad-hoc only (no record written).';
      const successText = `Verification complete. Tiller ref: ${refLabel}${persistedNote}`;
      setSubmitMessage({ type: 'success', text: successText });
      onSubmitSuccess?.(successText);
      if (body.instructionRef) {
        // Reload history so the new row appears in the rail below.
        loadHistory(body.instructionRef);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      setSubmitMessage({ type: 'error', text: msg });
      onSubmitError?.(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, onSubmitError, onSubmitSuccess, loadHistory]);

  const resultView = useMemo(() => (response ? summariseResponse(response) : null), [response]);
  const submitterInitials = currentUser?.Initials || '';

  return (
    <div style={getFormScrollContainerStyle(isDarkMode)}>
      <div style={getFormCardStyle(isDarkMode)}>
        {!embedded && (
          <div style={getFormHeaderStyle(isDarkMode, accentColor)}>
            <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
                <Icon iconName="ContactCard" style={{ fontSize: 22, color: accentColor }} />
                <Text variant="xLarge" style={getFormHeaderTitleStyle(isDarkMode)}>
                  Verification check
                </Text>
              </Stack>
              {onBack && (
                <DefaultButton text="Back" onClick={onBack} styles={getFormDefaultButtonStyles(isDarkMode)} />
              )}
            </Stack>
          </div>
        )}

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

          {!embedded && (
            <div style={getInfoBoxStyle(isDarkMode, 'neutral')}>
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                <Icon iconName="Info" style={{ color: accentColor, flexShrink: 0 }} />
                <Text style={getInfoBoxTextStyle(isDarkMode)}>
                  Runs a full Tiller check — address verification and PEP &amp; sanctions screening both execute on every submit. Linking an instruction reference prefills what we hold and files the result against that matter.
                </Text>
              </Stack>
            </div>
          )}

          {/* Link to instruction (optional) */}
          <div style={getFormSectionStyle(isDarkMode, accentColor)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="Link" style={{ fontSize: 16 }} />
              Link to instruction (optional)
            </div>
            <Stack tokens={formFieldTokens}>
              <Dropdown
                label={isLoadingInstructions ? 'Loading instructions…' : 'Instruction reference'}
                placeholder="Pick an instruction to auto-prefill…"
                options={instructionDropdownOptions}
                selectedKey={formData.instructionRef}
                onChange={(_, opt) => {
                  const ref = (opt?.key as string) || '';
                  handleFieldChange('instructionRef', ref);
                  setPrefillMessage(null);
                  if (ref) {
                    void handlePrefill(ref);
                  } else {
                    setPriorVerifications(null);
                  }
                }}
                styles={getDropdownStyles(isDarkMode)}
                disabled={isPrefilling}
              />
              {isPrefilling && (
                <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 6 }}>
                  <Spinner size={SpinnerSize.xSmall} />
                  <Text style={{ fontSize: 12, color: isDarkMode ? '#A0A0A0' : '#6B6B6B' }}>Prefilling…</Text>
                </Stack>
              )}
              {prefillMessage && (
                <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>{prefillMessage}</Text>
              )}
              {priorVerifications && priorVerifications.count > 0 && (
                <div style={{ marginTop: 4, padding: '8px 12px', background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : '#d6e8ff', borderLeft: `3px solid ${accentColor}` }}>
                  <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                    {priorVerifications.count} verification{priorVerifications.count === 1 ? '' : 's'} already on record for this instruction
                    {priorVerifications.lastResult ? ` (last result: ${priorVerifications.lastResult})` : ''}.
                  </Text>
                </div>
              )}
            </Stack>
          </div>

          {/* Identity */}
          <div style={getFormSectionStyle(isDarkMode, accentColor)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="ContactCard" style={{ fontSize: 16 }} />
              Identity
            </div>
            <Stack tokens={formFieldTokens}>
              <Stack horizontal tokens={{ childrenGap: 16 }}>
                <Stack.Item styles={{ root: { width: 120 } }}>
                  <Dropdown
                    label="Title"
                    options={titleOptions}
                    selectedKey={formData.title}
                    onChange={(_, opt) => handleFieldChange('title', (opt?.key as string) || 'Mr')}
                    styles={getDropdownStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item styles={{ root: { width: 140 } }}>
                  <Dropdown
                    label="Gender"
                    options={genderOptions}
                    selectedKey={formData.gender}
                    onChange={(_, opt) => handleFieldChange('gender', (opt?.key as string) || 'Male')}
                    styles={getDropdownStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="First name"
                    required
                    value={formData.firstName}
                    onChange={(_, v) => handleFieldChange('firstName', v || '')}
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="Last name"
                    required
                    value={formData.lastName}
                    onChange={(_, v) => handleFieldChange('lastName', v || '')}
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
              </Stack>
              <Stack horizontal tokens={{ childrenGap: 16 }}>
                <Stack.Item styles={{ root: { width: 220 } }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: isDarkMode ? '#f3f4f6' : '#061733', marginBottom: 4 }}>
                    Date of birth <span style={{ color: '#D65541' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.dob}
                    onChange={(e) => handleFieldChange('dob', e.target.value)}
                    className="helix-input"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 0 }}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="Email"
                    required
                    value={formData.email}
                    onChange={(_, v) => handleFieldChange('email', v || '')}
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="Mobile number"
                    placeholder="+447…"
                    value={formData.phone}
                    onChange={(_, v) => handleFieldChange('phone', v || '')}
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
              </Stack>
              <Stack horizontal tokens={{ childrenGap: 16 }}>
                <Stack.Item styles={{ root: { width: 320 } }}>
                  <Dropdown
                    label="Nationality"
                    required
                    placeholder="Pick nationality…"
                    options={nationalityOptions}
                    selectedKey={formData.nationality}
                    onChange={(_, opt) => handleFieldChange('nationality', (opt?.key as string) || '')}
                    styles={getDropdownStyles(isDarkMode)}
                  />
                </Stack.Item>
              </Stack>
            </Stack>
          </div>

          {/* ID documents */}
          <div style={getFormSectionStyle(isDarkMode, accentColor)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="IDBadge" style={{ fontSize: 16 }} />
              Identity documents
            </div>
            <Stack tokens={formFieldTokens}>
              <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#374151' }}>
                Provide at least one — Tiller requires either a passport or a UK driving licence number to complete the match.
              </Text>
              <Stack horizontal tokens={{ childrenGap: 16 }}>
                <Stack.Item grow>
                  <TextField
                    label="Passport number"
                    value={formData.passportNumber}
                    onChange={(_, v) => handleFieldChange('passportNumber', v || '')}
                    styles={getInputStyles(isDarkMode)}
                    required={!formData.driversLicenseNumber.trim()}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="Driving licence number"
                    value={formData.driversLicenseNumber}
                    onChange={(_, v) => handleFieldChange('driversLicenseNumber', v || '')}
                    styles={getInputStyles(isDarkMode)}
                    required={!formData.passportNumber.trim()}
                  />
                </Stack.Item>
              </Stack>
            </Stack>
          </div>

          {/* Address */}
          <div style={getFormSectionStyle(isDarkMode, accentColor)}>
            <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
              <Icon iconName="Home" style={{ fontSize: 16 }} />
              Current address
            </div>
            <Stack tokens={formFieldTokens}>
              <Stack horizontal tokens={{ childrenGap: 16 }}>
                <Stack.Item styles={{ root: { width: 160 } }}>
                  <TextField
                    label="Building number"
                    required
                    value={formData.houseNumber}
                    onChange={(_, v) => handleFieldChange('houseNumber', v || '')}
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="Road / Street"
                    required
                    value={formData.street}
                    onChange={(_, v) => handleFieldChange('street', v || '')}
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
              </Stack>
              <Stack horizontal tokens={{ childrenGap: 16 }}>
                <Stack.Item grow>
                  <TextField
                    label="Town / City"
                    required
                    value={formData.city}
                    onChange={(_, v) => handleFieldChange('city', v || '')}
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item grow>
                  <TextField
                    label="County / State"
                    value={formData.county}
                    onChange={(_, v) => handleFieldChange('county', v || '')}
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item styles={{ root: { width: 180 } }}>
                  <TextField
                    label="Postcode"
                    required
                    value={formData.postcode}
                    onChange={(_, v) => handleFieldChange('postcode', v || '')}
                    styles={getInputStyles(isDarkMode)}
                  />
                </Stack.Item>
                <Stack.Item styles={{ root: { width: 220 } }}>
                  <Dropdown
                    label="Country"
                    required
                    options={countryOptions}
                    selectedKey={formData.countryCode}
                    onChange={(_, opt) => handleFieldChange('countryCode', (opt?.key as string) || 'GB')}
                    styles={getDropdownStyles(isDarkMode)}
                  />
                </Stack.Item>
              </Stack>
            </Stack>
          </div>

          {/* Reference section removed — Tiller auto-generates a correlation ID on every submit and the success toast surfaces it. */}

          <Stack horizontal tokens={{ childrenGap: 12 }} horizontalAlign="end" style={{ marginTop: '1.5rem' }}>
            {embedded && onBack && (
              <DefaultButton text="Back" onClick={onBack} disabled={isSubmitting} styles={getFormDefaultButtonStyles(isDarkMode)} />
            )}
            <DefaultButton text="Reset" onClick={handleReset} disabled={isSubmitting} styles={getFormDefaultButtonStyles(isDarkMode)} />
            <PrimaryButton
              text={isSubmitting ? 'Running check…' : 'Run verification'}
              onClick={handleSubmit}
              disabled={isSubmitting}
              styles={getFormPrimaryButtonStyles(isDarkMode, accentColor)}
            />
          </Stack>

          {resultView && (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={getFormSectionStyle(isDarkMode, accentColor)}>
                <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
                  <Icon iconName="CheckMark" style={{ fontSize: 16 }} />
                  Result
                </div>
                <Stack tokens={{ childrenGap: 14 }}>
                  {correlationId && (
                    <div style={{ padding: '10px 12px', background: isDarkMode ? 'rgba(54, 144, 206, 0.14)' : '#d6e8ff', borderLeft: `3px solid ${accentColor}` }}>
                      <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: isDarkMode ? '#A0A0A0' : '#6B6B6B' }}>Tiller correlation ID</Text>
                      <Text style={{ display: 'block', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13, color: isDarkMode ? '#f3f4f6' : '#061733' }}>
                        {correlationId}
                      </Text>
                    </div>
                  )}
                  {persistedSummary && (
                    <div style={{ padding: '8px 12px', background: isDarkMode ? 'rgba(32, 178, 108, 0.15)' : 'rgba(32, 178, 108, 0.12)', borderLeft: '3px solid #20b26c' }}>
                      <Text style={{ fontSize: 12, color: isDarkMode ? '#d1d5db' : '#117a42' }}>
                        Filed against {formData.instructionRef || 'this instruction'}
                        {persistedSummary.checkId ? ` — record ${persistedSummary.checkId}` : ''}.
                      </Text>
                    </div>
                  )}
                  {resultView.summary.map((row, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Text style={{ fontWeight: 600, color: isDarkMode ? '#f3f4f6' : '#061733' }}>{row.label}</Text>
                        <span style={resultPillStyle(row.overallResult, isDarkMode)}>{row.overallResult || row.overallStatus || '—'}</span>
                      </div>
                      {row.results && row.results.length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: 20, color: isDarkMode ? '#d1d5db' : '#374151', fontSize: 13 }}>
                          {row.results.map((r, j) => (
                            <li key={j}>
                              <span style={{ fontWeight: 500 }}>{r.name || 'Reason'}:</span>{' '}
                              <span style={resultPillStyle(r.result, isDarkMode)}>{r.result || '—'}</span>
                              {r.reason ? <span style={{ marginLeft: 8 }}>{r.reason}</span> : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  <Stack horizontal tokens={{ childrenGap: 10 }} wrap>
                    <DefaultButton
                      text={showRaw ? 'Hide raw response' : 'Show raw response'}
                      onClick={() => setShowRaw(x => !x)}
                      styles={getFormDefaultButtonStyles(isDarkMode)}
                    />
                    <TooltipHost content="PDF export lands in the next iteration — Tiller PDF integration pending.">
                      <DefaultButton
                        text="Download PDF"
                        iconProps={{ iconName: 'PDF' }}
                        disabled
                        styles={getFormDefaultButtonStyles(isDarkMode)}
                      />
                    </TooltipHost>
                  </Stack>
                  {showRaw && (
                    <pre
                      style={{
                        marginTop: 4,
                        padding: 12,
                        maxHeight: 360,
                        overflow: 'auto',
                        background: isDarkMode ? '#051525' : '#F4F4F6',
                        color: isDarkMode ? '#d1d5db' : '#061733',
                        fontSize: 12,
                        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                      }}
                    >
                      {JSON.stringify(response, null, 2)}
                    </pre>
                  )}
                </Stack>
              </div>
            </div>
          )}

          {/* History rail — previous verifications on this instruction */}
          {formData.instructionRef.trim() && (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={getFormSectionStyle(isDarkMode, accentColor)}>
                <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
                  <Icon iconName="History" style={{ fontSize: 16 }} />
                  Verification history {isLoadingHistory ? <Spinner size={SpinnerSize.xSmall} style={{ marginLeft: 8 }} /> : null}
                </div>
                {history.length === 0 ? (
                  <Text style={{ fontSize: 12, color: isDarkMode ? '#A0A0A0' : '#6B6B6B' }}>
                    {isLoadingHistory ? 'Loading…' : 'No prior verifications recorded for this instruction.'}
                  </Text>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: isDarkMode ? '#A0A0A0' : '#6B6B6B', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>When</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Overall</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Address</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>PEP</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Check ID</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Expiry</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((row, i) => (
                          <tr key={row.checkId || i} style={{ borderTop: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`, color: isDarkMode ? '#d1d5db' : '#061733' }}>
                            <td style={{ padding: '8px 8px' }}>{row.checkedAt || '—'}</td>
                            <td style={{ padding: '8px 8px' }}><span style={resultPillStyle(row.overall, isDarkMode)}>{row.overall || '—'}</span></td>
                            <td style={{ padding: '8px 8px' }}><span style={resultPillStyle(row.address, isDarkMode)}>{row.address || '—'}</span></td>
                            <td style={{ padding: '8px 8px' }}><span style={resultPillStyle(row.pep, isDarkMode)}>{row.pep || '—'}</span></td>
                            <td style={{ padding: '8px 8px', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 11 }}>{row.checkId || '—'}</td>
                            <td style={{ padding: '8px 8px' }}>{row.expiry ? String(row.expiry).slice(0, 10) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {submitterInitials && (
            <Text style={{ display: 'block', marginTop: 16, fontSize: 11, color: isDarkMode ? '#A0A0A0' : '#6B6B6B' }}>
              Submitted by {submitterInitials}
            </Text>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerificationCheckForm;
