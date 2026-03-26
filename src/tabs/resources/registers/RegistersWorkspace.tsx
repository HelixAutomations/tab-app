import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Text } from '@fluentui/react/lib/Text';
import { Icon } from '@fluentui/react/lib/Icon';
import { DefaultButton, PrimaryButton, IconButton } from '@fluentui/react/lib/Button';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Modal } from '@fluentui/react/lib/Modal';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { colours } from '../../../app/styles/colours';
import { useTheme } from '../../../app/functionality/ThemeContext';
import type { UserData, TeamData } from '../../../app/functionality/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface LDActivity {
  id: number;
  plan_id: number;
  initials: string;
  activity_date: string;
  title: string;
  description: string | null;
  category: string | null;
  hours: number;
  provider: string | null;
  evidence_url: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface LDPlan {
  id: number;
  initials: string;
  full_name: string;
  year: number;
  target_hours: number;
  total_hours: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  activities: LDActivity[];
}

interface Undertaking {
  id: number;
  matter_ref: string | null;
  given_by: string;
  given_to: string;
  given_date: string;
  due_date: string | null;
  description: string;
  status: string;
  discharged_date: string | null;
  discharged_notes: string | null;
  area_of_work: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface Complaint {
  id: number;
  matter_ref: string | null;
  complainant: string;
  respondent: string;
  received_date: string;
  description: string;
  category: string | null;
  status: string;
  outcome: string | null;
  closed_date: string | null;
  lessons_learned: string | null;
  area_of_work: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

type RegisterTab = 'ld' | 'undertakings' | 'complaints';

interface RegistersWorkspaceProps {
  userData?: UserData[] | null;
  teamData?: TeamData[] | null;
  isDarkMode: boolean;
}

const ADMIN_INITIALS = new Set(['LZ', 'AC', 'JW']);

const LD_CATEGORIES = [
  { key: 'course', text: 'Course / Training' },
  { key: 'conference', text: 'Conference / Seminar' },
  { key: 'webinar', text: 'Webinar' },
  { key: 'reading', text: 'Reading / Research' },
  { key: 'mentoring', text: 'Mentoring / Coaching' },
  { key: 'workshop', text: 'Workshop' },
  { key: 'on-the-job', text: 'On-the-job Training' },
  { key: 'other', text: 'Other' },
];

const UNDERTAKING_STATUSES = [
  { key: 'outstanding', text: 'Outstanding' },
  { key: 'discharged', text: 'Discharged' },
  { key: 'breached', text: 'Breached' },
];

const COMPLAINT_STATUSES = [
  { key: 'open', text: 'Open' },
  { key: 'investigating', text: 'Investigating' },
  { key: 'resolved', text: 'Resolved' },
  { key: 'closed', text: 'Closed' },
  { key: 'escalated', text: 'Escalated' },
];

const AOW_OPTIONS = [
  { key: 'Commercial', text: 'Commercial' },
  { key: 'Construction', text: 'Construction' },
  { key: 'Property', text: 'Property' },
  { key: 'Employment', text: 'Employment' },
  { key: 'Other', text: 'Other' },
];

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

function toInputDate(d: string | null | undefined): string {
  if (!d) return '';
  try {
    return new Date(d).toISOString().split('T')[0];
  } catch {
    return '';
  }
}

function getStatusStyle(status: string, isDarkMode: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'Raleway, sans-serif',
    borderRadius: 999,
  };

  switch (status) {
    case 'outstanding':
    case 'open':
    case 'investigating':
      return { ...base, background: `${colours.orange}22`, color: colours.orange, border: `1px solid ${colours.orange}44` };
    case 'discharged':
    case 'resolved':
    case 'closed':
    case 'logged':
    case 'verified':
      return { ...base, background: `${colours.green}22`, color: colours.green, border: `1px solid ${colours.green}44` };
    case 'breached':
    case 'escalated':
      return { ...base, background: `${colours.cta}22`, color: colours.cta, border: `1px solid ${colours.cta}44` };
    default:
      return { ...base, background: isDarkMode ? '#ffffff11' : '#00000011', color: isDarkMode ? '#d1d5db' : '#374151' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const RegistersWorkspace: React.FC<RegistersWorkspaceProps> = ({ userData, teamData, isDarkMode }) => {
  const currentUser = userData?.[0];
  const userInitials = (currentUser?.Initials || '').toUpperCase();
  const isAdmin = ADMIN_INITIALS.has(userInitials);
  const currentUserFullName = useMemo(() => {
    const directName = currentUser?.FullName?.trim();
    if (directName) return directName;

    const teamMatch = teamData?.find(member => (member.Initials || '').toUpperCase() === userInitials);
    const teamName = teamMatch?.['Full Name']?.trim();
    if (teamName) return teamName;

    const fallbackName = [currentUser?.First, currentUser?.Last].filter(Boolean).join(' ').trim();
    return fallbackName;
  }, [currentUser, teamData, userInitials]);

  const [activeTab, setActiveTab] = useState<RegisterTab>('ld');
  const [refreshKey, setRefreshKey] = useState(0);

  // L&D state
  const [ldPlans, setLdPlans] = useState<LDPlan[]>([]);
  const [ldYear, setLdYear] = useState(new Date().getFullYear());
  const [ldLoading, setLdLoading] = useState(false);
  const [ldError, setLdError] = useState<string | null>(null);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [showCreatePlan, setShowCreatePlan] = useState(false);

  // Undertakings state
  const [undertakings, setUndertakings] = useState<Undertaking[]>([]);
  const [utLoading, setUtLoading] = useState(false);
  const [utError, setUtError] = useState<string | null>(null);
  const [showAddUndertaking, setShowAddUndertaking] = useState(false);
  const [editUndertaking, setEditUndertaking] = useState<Undertaking | null>(null);

  // Complaints state
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState<string | null>(null);
  const [showAddComplaint, setShowAddComplaint] = useState(false);
  const [editComplaint, setEditComplaint] = useState<Complaint | null>(null);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const teamOptions = useMemo(() => {
    if (!teamData) return [];
    return teamData
      .filter(t => t.status === 'active' && t.Initials)
      .map(t => ({ key: t.Initials!, text: `${t['Full Name'] || t.First || ''} (${t.Initials})` }));
  }, [teamData]);

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchLDPlans = useCallback(async () => {
    if (!userInitials) return;
    setLdLoading(true);
    setLdError(null);
    try {
      const res = await fetch(`/api/registers/learning-dev?initials=${encodeURIComponent(userInitials)}&year=${ldYear}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load L&D plans');
      setLdPlans(data.plans || []);
    } catch (err) {
      setLdError((err as Error).message);
    } finally {
      setLdLoading(false);
    }
  }, [userInitials, ldYear]);

  const fetchUndertakings = useCallback(async () => {
    if (!userInitials) return;
    setUtLoading(true);
    setUtError(null);
    try {
      const res = await fetch(`/api/registers/undertakings?initials=${encodeURIComponent(userInitials)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load undertakings');
      setUndertakings(data.undertakings || []);
    } catch (err) {
      setUtError((err as Error).message);
    } finally {
      setUtLoading(false);
    }
  }, [userInitials]);

  const fetchComplaints = useCallback(async () => {
    if (!userInitials) return;
    setCpLoading(true);
    setCpError(null);
    try {
      const res = await fetch(`/api/registers/complaints?initials=${encodeURIComponent(userInitials)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed to load complaints');
      setComplaints(data.complaints || []);
    } catch (err) {
      setCpError((err as Error).message);
    } finally {
      setCpLoading(false);
    }
  }, [userInitials]);

  useEffect(() => {
    if (activeTab === 'ld') fetchLDPlans();
    else if (activeTab === 'undertakings') fetchUndertakings();
    else if (activeTab === 'complaints') fetchComplaints();
  }, [activeTab, refreshKey, fetchLDPlans, fetchUndertakings, fetchComplaints]);

  // ── Generic form state ────────────────────────────────────────────────────

  const [formFields, setFormFields] = useState<Record<string, string>>({});

  const updateField = useCallback((key: string, value: string) => {
    setFormFields(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetForm = useCallback(() => setFormFields({}), []);

  const openCreatePlanModal = useCallback(() => {
    setFormFields({
      target_initials: userInitials,
      full_name: currentUserFullName,
    });
    setShowCreatePlan(true);
  }, [userInitials, currentUserFullName]);

  useEffect(() => {
    if (!showCreatePlan) return;

    setFormFields(prev => ({
      ...prev,
      target_initials: prev.target_initials || userInitials,
      full_name: prev.full_name || currentUserFullName,
    }));
  }, [showCreatePlan, userInitials, currentUserFullName]);

  // ── Styles ────────────────────────────────────────────────────────────────

  const panelBg = isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground;
  const cardBg = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const borderCol = isDarkMode ? colours.dark.border : colours.light.border;
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textBody = isDarkMode ? '#d1d5db' : '#374151';
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const modalBg = isDarkMode ? colours.websiteBlue : '#ffffff';
  const modalHeaderBg = isDarkMode ? colours.darkBlue : colours.grey;
  const modalInputBg = isDarkMode ? colours.darkBlue : colours.light.inputBackground || colours.grey;
  const modalBorderCol = isDarkMode ? colours.dark.borderColor : colours.light.border;
  const accentCol = colours.highlight;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    fontFamily: 'Raleway, sans-serif',
    color: active ? colours.highlight : textBody,
    borderBottom: active ? `2px solid ${colours.highlight}` : '2px solid transparent',
    background: 'transparent',
    border: 'none',
    borderRadius: 0,
    transition: 'color 0.15s, border-bottom 0.15s',
  });

  const rowStyle: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 0,
    border: `1px solid ${borderCol}`,
    background: cardBg,
    marginBottom: 6,
    transition: 'background 0.15s',
    cursor: 'default',
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    color: colours.highlight,
    marginBottom: 10,
    fontFamily: 'Raleway, sans-serif',
  };

  // ── Submit handlers ───────────────────────────────────────────────────────

  const handleCreatePlan = useCallback(async () => {
    const targetInitials = formFields.target_initials || userInitials;
    const fullName = formFields.full_name || currentUserFullName || '';
    if (!fullName) {
      showToast('error', 'Full name is required');
      return;
    }

    try {
      const res = await fetch('/api/registers/learning-dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initials: userInitials,
          target_initials: targetInitials,
          full_name: fullName,
          year: ldYear,
          target_hours: parseFloat(formFields.target_hours || '16') || 16,
          notes: formFields.notes || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      showToast('success', 'L&D plan created');
      setShowCreatePlan(false);
      resetForm();
      setRefreshKey(k => k + 1);
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  }, [formFields, userInitials, currentUserFullName, ldYear, showToast, resetForm]);

  const handleAddActivity = useCallback(async () => {
    if (!selectedPlanId || !formFields.title || !formFields.activity_date) {
      showToast('error', 'Title and date are required');
      return;
    }

    try {
      const res = await fetch('/api/registers/learning-dev/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initials: userInitials,
          plan_id: selectedPlanId,
          activity_date: formFields.activity_date,
          title: formFields.title,
          description: formFields.description || null,
          category: formFields.category || null,
          hours: parseFloat(formFields.hours || '0') || 0,
          provider: formFields.provider || null,
          evidence_url: formFields.evidence_url || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      showToast('success', 'Activity logged');
      setShowAddActivity(false);
      setSelectedPlanId(null);
      resetForm();
      setRefreshKey(k => k + 1);
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  }, [formFields, selectedPlanId, userInitials, showToast, resetForm]);

  const handleCreateUndertaking = useCallback(async () => {
    if (!formFields.given_to || !formFields.given_date || !formFields.description) {
      showToast('error', 'Given to, date, and description are required');
      return;
    }

    try {
      const res = await fetch('/api/registers/undertakings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initials: userInitials,
          matter_ref: formFields.matter_ref || null,
          given_to: formFields.given_to,
          given_date: formFields.given_date,
          due_date: formFields.due_date || null,
          description: formFields.description,
          area_of_work: formFields.area_of_work || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      showToast('success', 'Undertaking recorded');
      setShowAddUndertaking(false);
      resetForm();
      setRefreshKey(k => k + 1);
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  }, [formFields, userInitials, showToast, resetForm]);

  const handleUpdateUndertaking = useCallback(async () => {
    if (!editUndertaking) return;

    try {
      const res = await fetch(`/api/registers/undertakings/${editUndertaking.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initials: userInitials,
          matter_ref: formFields.matter_ref || null,
          given_to: formFields.given_to || editUndertaking.given_to,
          given_date: formFields.given_date || editUndertaking.given_date,
          due_date: formFields.due_date || null,
          description: formFields.description || editUndertaking.description,
          status: formFields.status || editUndertaking.status,
          discharged_date: formFields.discharged_date || null,
          discharged_notes: formFields.discharged_notes || null,
          area_of_work: formFields.area_of_work || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      showToast('success', 'Undertaking updated');
      setEditUndertaking(null);
      resetForm();
      setRefreshKey(k => k + 1);
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  }, [formFields, editUndertaking, userInitials, showToast, resetForm]);

  const handleCreateComplaint = useCallback(async () => {
    if (!formFields.complainant || !formFields.respondent || !formFields.received_date || !formFields.description) {
      showToast('error', 'Complainant, respondent, date, and description are required');
      return;
    }

    try {
      const res = await fetch('/api/registers/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initials: userInitials,
          matter_ref: formFields.matter_ref || null,
          complainant: formFields.complainant,
          respondent: formFields.respondent,
          received_date: formFields.received_date,
          description: formFields.description,
          category: formFields.category || null,
          area_of_work: formFields.area_of_work || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      showToast('success', 'Complaint recorded');
      setShowAddComplaint(false);
      resetForm();
      setRefreshKey(k => k + 1);
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  }, [formFields, userInitials, showToast, resetForm]);

  const handleUpdateComplaint = useCallback(async () => {
    if (!editComplaint) return;

    try {
      const res = await fetch(`/api/registers/complaints/${editComplaint.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initials: userInitials,
          matter_ref: formFields.matter_ref || null,
          complainant: formFields.complainant || editComplaint.complainant,
          respondent: formFields.respondent || editComplaint.respondent,
          received_date: formFields.received_date || editComplaint.received_date,
          description: formFields.description || editComplaint.description,
          category: formFields.category || null,
          status: formFields.status || editComplaint.status,
          outcome: formFields.outcome || null,
          closed_date: formFields.closed_date || null,
          lessons_learned: formFields.lessons_learned || null,
          area_of_work: formFields.area_of_work || null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      showToast('success', 'Complaint updated');
      setEditComplaint(null);
      resetForm();
      setRefreshKey(k => k + 1);
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  }, [formFields, editComplaint, userInitials, showToast, resetForm]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderLoading = () => (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <Spinner size={SpinnerSize.medium} label="Loading..." />
    </div>
  );

  const renderError = (error: string) => (
    <MessageBar messageBarType={MessageBarType.error} styles={{ root: { borderRadius: 0 } }}>
      {error}
    </MessageBar>
  );

  const renderEmpty = (message: string) => (
    <div style={{ padding: 24, textAlign: 'center', color: textMuted, fontSize: 13, fontFamily: 'Raleway, sans-serif' }}>
      {message}
    </div>
  );

  // ── Helix form modal wrapper ──────────────────────────────────────────

  const renderFormModal = (
    isOpen: boolean,
    onDismiss: () => void,
    title: string,
    icon: string,
    toneColor: string,
    primaryLabel: string,
    onPrimary: () => void,
    children: React.ReactNode,
  ) => (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      isBlocking={false}
      styles={{
        main: {
          borderRadius: 0,
          maxWidth: 520,
          width: '95vw',
          background: modalBg,
          border: `1px solid ${modalBorderCol}`,
          boxShadow: isDarkMode
            ? '0 12px 34px rgba(0, 3, 25, 0.5)'
            : '0 10px 28px rgba(6, 23, 51, 0.12)',
          overflow: 'hidden',
        },
        scrollableContent: { overflow: 'auto', maxHeight: '85vh' },
      }}
      overlay={{ styles: { root: { background: 'rgba(0, 3, 25, 0.6)', backdropFilter: 'blur(4px)' } } } as any}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px 14px',
        borderBottom: `1px solid ${modalBorderCol}`,
        background: modalHeaderBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isDarkMode ? colours.dark.cardBackground : `${toneColor}12`,
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.22)' : `${toneColor}26`}`,
            borderRadius: 0,
          }}>
            <Icon iconName={icon} style={{ fontSize: 15, color: toneColor }} />
          </div>
          <div>
            <div style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.65,
              textTransform: 'uppercase' as const,
              color: colours.highlight,
              fontFamily: 'Raleway, sans-serif',
              marginBottom: 2,
            }}>
              Compliance register
            </div>
            <div style={{
              fontSize: 15,
              fontWeight: 700,
              color: textPrimary,
              fontFamily: 'Raleway, sans-serif',
            }}>
              {title}
            </div>
          </div>
        </div>
        <IconButton
          iconProps={{ iconName: 'Cancel' }}
          onClick={onDismiss}
          styles={{
            root: { color: textMuted, width: 28, height: 28 },
            rootHovered: { color: textPrimary, background: isDarkMode ? '#ffffff0d' : '#0000000a' },
            icon: { fontSize: 12 },
          }}
        />
      </div>

      {/* Body */}
      <div style={{ padding: '18px 20px 20px' }}>
        {children}

        {/* Actions */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
          marginTop: 20,
          paddingTop: 14,
          borderTop: `1px solid ${modalBorderCol}`,
        }}>
          <button
            onClick={onDismiss}
            style={{
              padding: '8px 18px',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'Raleway, sans-serif',
              background: 'transparent',
              color: textBody,
              border: `1px solid ${modalBorderCol}`,
              borderRadius: 0,
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onPrimary}
            style={{
              padding: '8px 22px',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'Raleway, sans-serif',
              background: colours.highlight,
              color: '#fff',
              border: 'none',
              borderRadius: 0,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </Modal>
  );

  const fieldLabelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: textMuted,
    fontFamily: 'Raleway, sans-serif',
    marginBottom: 5,
  };

  const fieldInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    fontSize: 13,
    fontFamily: 'Raleway, sans-serif',
    color: textPrimary,
    background: modalInputBg,
    border: `1px solid ${modalBorderCol}`,
    borderRadius: 0,
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box' as const,
  };

  const renderFormField = (label: string, key: string, opts?: { multiline?: boolean; required?: boolean; type?: string; placeholder?: string }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={fieldLabelStyle}>
        {label}{opts?.required && <span style={{ color: colours.cta, marginLeft: 3 }}>*</span>}
      </label>
      {opts?.multiline ? (
        <textarea
          value={formFields[key] || ''}
          onChange={e => updateField(key, e.target.value)}
          placeholder={opts?.placeholder}
          rows={3}
          style={{ ...fieldInputStyle, resize: 'vertical' as const, minHeight: 72 }}
          onFocus={e => { e.currentTarget.style.borderColor = accentCol; }}
          onBlur={e => { e.currentTarget.style.borderColor = modalBorderCol; }}
        />
      ) : (
        <input
          type={opts?.type || 'text'}
          value={formFields[key] || ''}
          onChange={e => updateField(key, e.target.value)}
          placeholder={opts?.placeholder}
          style={fieldInputStyle}
          onFocus={e => { e.currentTarget.style.borderColor = accentCol; }}
          onBlur={e => { e.currentTarget.style.borderColor = modalBorderCol; }}
        />
      )}
    </div>
  );

  const renderFormDropdown = (label: string, key: string, options: { key: string; text: string }[]) => (
    <div style={{ marginBottom: 14 }}>
      <label style={fieldLabelStyle}>{label}</label>
      <select
        value={formFields[key] || ''}
        onChange={e => updateField(key, e.target.value)}
        style={{
          ...fieldInputStyle,
          appearance: 'none' as const,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='${encodeURIComponent(textMuted)}' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          paddingRight: 32,
        }}
        onFocus={e => { e.currentTarget.style.borderColor = accentCol; }}
        onBlur={e => { e.currentTarget.style.borderColor = modalBorderCol; }}
      >
        <option value="" style={{ color: textMuted }}>Select…</option>
        {options.map(o => (
          <option key={o.key} value={o.key}>{o.text}</option>
        ))}
      </select>
    </div>
  );

  // ── L&D Tab ───────────────────────────────────────────────────────────────

  const renderLDTab = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={sectionHeaderStyle}>CPD Plans</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[ldYear - 1, ldYear, ldYear + 1].map(y => (
              <button
                key={y}
                onClick={() => setLdYear(y)}
                style={{
                  ...tabStyle(y === ldYear),
                  padding: '4px 10px',
                  fontSize: 12,
                }}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
        <DefaultButton
          text="New plan"
          iconProps={{ iconName: 'Add' }}
          onClick={openCreatePlanModal}
          styles={{ root: { borderRadius: 0, fontSize: 12 } }}
        />
      </div>

      {ldLoading && renderLoading()}
      {ldError && renderError(ldError)}
      {!ldLoading && !ldError && ldPlans.length === 0 && renderEmpty('No CPD plans for this year. Create one to start logging activities.')}

      {ldPlans.map(plan => (
        <div key={plan.id} style={{ ...rowStyle, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <Text style={{ fontWeight: 700, fontSize: 14, color: textPrimary, fontFamily: 'Raleway, sans-serif' }}>
                {plan.full_name}
              </Text>
              <Text style={{ fontSize: 12, color: textMuted, display: 'block', fontFamily: 'Raleway, sans-serif' }}>
                {plan.total_hours} / {plan.target_hours} hours
              </Text>
            </div>
            <DefaultButton
              text="Log activity"
              iconProps={{ iconName: 'Add' }}
              onClick={() => { resetForm(); setSelectedPlanId(plan.id); setShowAddActivity(true); }}
              styles={{ root: { borderRadius: 0, fontSize: 12 } }}
            />
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, background: isDarkMode ? '#ffffff11' : '#00000011', borderRadius: 999, marginBottom: 10 }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (plan.total_hours / (plan.target_hours || 1)) * 100)}%`,
              background: plan.total_hours >= plan.target_hours ? colours.green : colours.highlight,
              borderRadius: 999,
              transition: 'width 0.3s',
            }} />
          </div>

          {plan.activities.length === 0 && (
            <Text style={{ fontSize: 12, color: textMuted, fontStyle: 'italic', fontFamily: 'Raleway, sans-serif' }}>
              No activities recorded yet
            </Text>
          )}

          {plan.activities.map(act => (
            <div key={act.id} style={{
              padding: '6px 10px',
              borderLeft: `3px solid ${colours.highlight}`,
              marginBottom: 4,
              fontSize: 12,
              fontFamily: 'Raleway, sans-serif',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: 600, color: textPrimary, fontSize: 12 }}>{act.title}</Text>
                <Text style={{ color: textMuted, fontSize: 11 }}>{act.hours}h · {formatDate(act.activity_date)}</Text>
              </div>
              {act.category && <Text style={{ fontSize: 11, color: textBody }}>{act.category}</Text>}
              {act.provider && <Text style={{ fontSize: 11, color: textMuted }}>{act.provider}</Text>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  // ── Undertakings Tab ──────────────────────────────────────────────────────

  const renderUndertakingsTab = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={sectionHeaderStyle}>Undertaking Register</span>
        <DefaultButton
          text="New undertaking"
          iconProps={{ iconName: 'Add' }}
          onClick={() => { resetForm(); setShowAddUndertaking(true); }}
          styles={{ root: { borderRadius: 0, fontSize: 12 } }}
        />
      </div>

      {utLoading && renderLoading()}
      {utError && renderError(utError)}
      {!utLoading && !utError && undertakings.length === 0 && renderEmpty('No undertakings recorded.')}

      {undertakings.map(ut => (
        <div
          key={ut.id}
          style={rowStyle}
          onClick={() => {
            if (isAdmin || ut.given_by === userInitials) {
              setFormFields({
                matter_ref: ut.matter_ref || '',
                given_to: ut.given_to,
                given_date: toInputDate(ut.given_date),
                due_date: toInputDate(ut.due_date),
                description: ut.description,
                status: ut.status,
                discharged_date: toInputDate(ut.discharged_date),
                discharged_notes: ut.discharged_notes || '',
                area_of_work: ut.area_of_work || '',
              });
              setEditUndertaking(ut);
            }
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontWeight: 600, fontSize: 13, color: textPrimary, fontFamily: 'Raleway, sans-serif' }}>
                  {ut.description.length > 80 ? ut.description.slice(0, 80) + '…' : ut.description}
                </Text>
                <span style={getStatusStyle(ut.status, isDarkMode)}>{ut.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: textBody, fontFamily: 'Raleway, sans-serif' }}>
                <span>Given by: <strong>{ut.given_by}</strong></span>
                <span>To: <strong>{ut.given_to}</strong></span>
                <span>{formatDate(ut.given_date)}</span>
                {ut.due_date && <span>Due: {formatDate(ut.due_date)}</span>}
                {ut.matter_ref && <span>{ut.matter_ref}</span>}
              </div>
            </div>
            {(isAdmin || ut.given_by === userInitials) && (
              <Icon iconName="Edit" style={{ color: textMuted, cursor: 'pointer', fontSize: 14 }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );

  // ── Complaints Tab ────────────────────────────────────────────────────────

  const renderComplaintsTab = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={sectionHeaderStyle}>Complaints Register</span>
        {isAdmin && (
          <DefaultButton
            text="New complaint"
            iconProps={{ iconName: 'Add' }}
            onClick={() => { resetForm(); setShowAddComplaint(true); }}
            styles={{ root: { borderRadius: 0, fontSize: 12 } }}
          />
        )}
      </div>

      {cpLoading && renderLoading()}
      {cpError && renderError(cpError)}
      {!cpLoading && !cpError && complaints.length === 0 && renderEmpty('No complaints recorded.')}

      {complaints.map(cp => (
        <div
          key={cp.id}
          style={rowStyle}
          onClick={() => {
            if (isAdmin) {
              setFormFields({
                matter_ref: cp.matter_ref || '',
                complainant: cp.complainant,
                respondent: cp.respondent,
                received_date: toInputDate(cp.received_date),
                description: cp.description,
                category: cp.category || '',
                status: cp.status,
                outcome: cp.outcome || '',
                closed_date: toInputDate(cp.closed_date),
                lessons_learned: cp.lessons_learned || '',
                area_of_work: cp.area_of_work || '',
              });
              setEditComplaint(cp);
            }
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontWeight: 600, fontSize: 13, color: textPrimary, fontFamily: 'Raleway, sans-serif' }}>
                  {cp.description.length > 80 ? cp.description.slice(0, 80) + '…' : cp.description}
                </Text>
                <span style={getStatusStyle(cp.status, isDarkMode)}>{cp.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: textBody, fontFamily: 'Raleway, sans-serif' }}>
                <span>Complainant: <strong>{cp.complainant}</strong></span>
                <span>Respondent: <strong>{cp.respondent}</strong></span>
                <span>{formatDate(cp.received_date)}</span>
                {cp.matter_ref && <span>{cp.matter_ref}</span>}
              </div>
            </div>
            {isAdmin && (
              <Icon iconName="Edit" style={{ color: textMuted, cursor: 'pointer', fontSize: 14 }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: 'Raleway, sans-serif' }}>
      {/* Toast */}
      {toast && (
        <MessageBar
          messageBarType={toast.type === 'success' ? MessageBarType.success : MessageBarType.error}
          onDismiss={() => setToast(null)}
          styles={{ root: { borderRadius: 0, marginBottom: 12 } }}
        >
          {toast.message}
        </MessageBar>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${borderCol}`, marginBottom: 16 }}>
        <button style={tabStyle(activeTab === 'ld')} onClick={() => setActiveTab('ld')}>
          <Icon iconName="Education" style={{ marginRight: 6, fontSize: 13 }} />
          L&D
        </button>
        <button style={tabStyle(activeTab === 'undertakings')} onClick={() => setActiveTab('undertakings')}>
          <Icon iconName="Handshake" style={{ marginRight: 6, fontSize: 13 }} />
          Undertakings
        </button>
        <button style={tabStyle(activeTab === 'complaints')} onClick={() => setActiveTab('complaints')}>
          <Icon iconName="Feedback" style={{ marginRight: 6, fontSize: 13 }} />
          Complaints
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'ld' && renderLDTab()}
      {activeTab === 'undertakings' && renderUndertakingsTab()}
      {activeTab === 'complaints' && renderComplaintsTab()}

      {/* ── Create Plan ──────────────────────────────────────────────────── */}
      {renderFormModal(
        showCreatePlan,
        () => { setShowCreatePlan(false); resetForm(); },
        `Create CPD Plan — ${ldYear}`,
        'Education',
        colours.highlight,
        'Create plan',
        handleCreatePlan,
        <>
          {isAdmin && renderFormDropdown('Team member', 'target_initials', teamOptions)}
          {renderFormField('Full name', 'full_name', { required: true, placeholder: currentUserFullName })}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderFormField('Target hours', 'target_hours', { placeholder: '16' })}
            <div />
          </div>
          {renderFormField('Notes', 'notes', { multiline: true })}
        </>,
      )}

      {/* ── Log Activity ─────────────────────────────────────────────────── */}
      {renderFormModal(
        showAddActivity,
        () => { setShowAddActivity(false); setSelectedPlanId(null); resetForm(); },
        'Log CPD Activity',
        'CompletedSolid',
        colours.green,
        'Log activity',
        handleAddActivity,
        <>
          {renderFormField('Title', 'title', { required: true })}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderFormField('Date', 'activity_date', { required: true, type: 'date' })}
            {renderFormField('Hours', 'hours', { placeholder: '1' })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderFormDropdown('Category', 'category', LD_CATEGORIES)}
            {renderFormField('Provider', 'provider')}
          </div>
          {renderFormField('Description', 'description', { multiline: true })}
          {renderFormField('Evidence URL', 'evidence_url', { placeholder: 'https://...' })}
        </>,
      )}

      {/* ── Add Undertaking ───────────────────────────────────────────────── */}
      {renderFormModal(
        showAddUndertaking,
        () => { setShowAddUndertaking(false); resetForm(); },
        'Record Undertaking',
        'Handshake',
        colours.orange,
        'Record',
        handleCreateUndertaking,
        <>
          {renderFormField('Given to (recipient)', 'given_to', { required: true })}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderFormField('Date given', 'given_date', { required: true, type: 'date' })}
            {renderFormField('Due date', 'due_date', { type: 'date' })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderFormField('Matter reference', 'matter_ref', { placeholder: 'HLX-00000-00000' })}
            {renderFormDropdown('Area of work', 'area_of_work', AOW_OPTIONS)}
          </div>
          {renderFormField('Description', 'description', { required: true, multiline: true })}
        </>,
      )}

      {/* ── Edit Undertaking ──────────────────────────────────────────────── */}
      {renderFormModal(
        !!editUndertaking,
        () => { setEditUndertaking(null); resetForm(); },
        'Update Undertaking',
        'Handshake',
        colours.orange,
        'Update',
        handleUpdateUndertaking,
        <>
          {renderFormField('Given to', 'given_to', { required: true })}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderFormField('Date given', 'given_date', { required: true, type: 'date' })}
            {renderFormField('Due date', 'due_date', { type: 'date' })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderFormField('Matter reference', 'matter_ref')}
            {renderFormDropdown('Status', 'status', UNDERTAKING_STATUSES)}
          </div>
          {renderFormDropdown('Area of work', 'area_of_work', AOW_OPTIONS)}
          {renderFormField('Description', 'description', { required: true, multiline: true })}
          {formFields.status === 'discharged' && (
            <>
              {renderFormField('Discharged date', 'discharged_date', { type: 'date' })}
              {renderFormField('Discharge notes', 'discharged_notes', { multiline: true })}
            </>
          )}
        </>,
      )}

      {/* ── Add Complaint ─────────────────────────────────────────────────── */}
      {renderFormModal(
        showAddComplaint,
        () => { setShowAddComplaint(false); resetForm(); },
        'Record Complaint',
        'Feedback',
        colours.cta,
        'Record',
        handleCreateComplaint,
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderFormField('Complainant', 'complainant', { required: true })}
            {isAdmin ? renderFormDropdown('Respondent', 'respondent', teamOptions) : renderFormField('Respondent', 'respondent', { required: true })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderFormField('Date received', 'received_date', { required: true, type: 'date' })}
            {renderFormField('Matter reference', 'matter_ref', { placeholder: 'HLX-00000-00000' })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderFormDropdown('Area of work', 'area_of_work', AOW_OPTIONS)}
            {renderFormField('Category', 'category')}
          </div>
          {renderFormField('Description', 'description', { required: true, multiline: true })}
        </>,
      )}

      {/* ── Edit Complaint ────────────────────────────────────────────────── */}
      {renderFormModal(
        !!editComplaint,
        () => { setEditComplaint(null); resetForm(); },
        'Update Complaint',
        'Feedback',
        colours.cta,
        'Update',
        handleUpdateComplaint,
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderFormField('Complainant', 'complainant', { required: true })}
            {renderFormDropdown('Respondent', 'respondent', teamOptions)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderFormField('Date received', 'received_date', { required: true, type: 'date' })}
            {renderFormField('Matter reference', 'matter_ref')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {renderFormDropdown('Status', 'status', COMPLAINT_STATUSES)}
            {renderFormDropdown('Area of work', 'area_of_work', AOW_OPTIONS)}
          </div>
          {renderFormField('Category', 'category')}
          {renderFormField('Description', 'description', { required: true, multiline: true })}
          {renderFormField('Outcome', 'outcome', { multiline: true })}
          {(formFields.status === 'resolved' || formFields.status === 'closed') && (
            <>
              {renderFormField('Closed date', 'closed_date', { type: 'date' })}
              {renderFormField('Lessons learned', 'lessons_learned', { multiline: true })}
            </>
          )}
        </>,
      )}
    </div>
  );
};

export default RegistersWorkspace;
