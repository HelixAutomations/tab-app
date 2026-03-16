import React from 'react';
import { Icon } from '@fluentui/react';
import { FaCheckCircle, FaChevronDown, FaChevronRight, FaDatabase, FaExternalLinkAlt, FaFileAlt, FaLock, FaMagic, FaPlayCircle, FaSyncAlt } from 'react-icons/fa';
import type { NormalizedMatter } from '../../../app/functionality/types';
import { colours } from '../../../app/styles/colours';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { useToast } from '../../../components/feedback/ToastProvider';
import { FIELD_DISPLAY_NAMES } from '../../../shared/ccl';

interface CclWorkbenchLinkage {
  instructionRef?: string;
  stage?: string;
  passcode?: string;
  clientId?: string;
  portalUrl?: string | null;
}

interface WorkbenchStatus {
  key: 'sent' | 'reviewed' | 'drafted' | 'not_started';
  label: string;
  tone: 'success' | 'accent' | 'warning' | 'neutral';
  needsAttention: boolean;
}

interface WorkbenchResponse {
  ok: boolean;
  matterId: string;
  displayNumber: string;
  service: {
    status: WorkbenchStatus;
    version: number | null;
    contentId: number | null;
    createdAt: string | null;
    reviewedAt: string | null;
    sentAt: string | null;
    uploadedToClio: boolean;
    uploadedToNd: boolean;
    unresolvedCount: number;
    fieldSummary: {
      total: number;
      populated: number;
      missing: number;
      populatedKeys: string[];
      missingKeys: string[];
    };
    documentUrl: string | null;
  };
  prompt: {
    version: string;
    templateVersion: string;
    userPromptLength: number;
    systemPromptLength: number;
    dataSources: string[];
  };
  sourceCoverage: Array<{
    key: string;
    label: string;
    status: 'ready' | 'limited' | 'missing';
    summary: string;
  }>;
  missingDataFlags: string[];
  fieldValues?: Record<string, string>;
  sourcePreview: {
    contextFields: Record<string, string>;
    snippets: Record<string, string>;
  };
  trace: null | {
    trackingId: string | null;
    aiStatus: string | null;
    confidence: string | null;
    durationMs: number | null;
    generatedFieldCount: number | null;
    fallbackReason: string | null;
    errorMessage: string | null;
    createdAt: string | null;
  };
  linkage: {
    instructionRef: string;
    stage: string;
    clientId: string;
    passcode: string;
    portalUrl: string;
    passcodeAvailable: boolean;
    portalReady: boolean;
  };
  history: Array<{
    version: number;
    status: string;
    createdAt: string;
    finalizedAt: string | null;
    createdBy: string | null;
  }>;
}

interface CCLWorkbenchProps {
  matter: NormalizedMatter;
  linkage?: CclWorkbenchLinkage;
  userInitials?: string;
  onClose: () => void;
}

// ─── Field tier categories ─────────────────────────────────────────────────
const DISPLAY = FIELD_DISPLAY_NAMES as Record<string, string>;

const SYSTEM_FIELD_KEYS = [
  'insert_clients_name', 'insert_heading_eg_matter_description', 'matter',
  'name_of_person_handling_matter', 'status', 'name_of_handler', 'handler',
  'handler_hourly_rate', 'email', 'identify_the_other_party_eg_your_opponents',
  'figure', 'figure_or_range', 'state_amount', 'matter_number',
  'fee_earner_email', 'fee_earner_phone', 'fee_earner_postal_address',
  'name', 'letter_date', 'client_email', 'client_address',
];

const AI_FIELD_KEYS = [
  'insert_current_position_and_scope_of_retainer', 'next_steps',
  'realistic_timescale', 'next_stage',
  'charges_estimate_paragraph', 'disbursements_paragraph', 'costs_other_party_paragraph',
  'we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible',
  'estimate', 'in_total_including_vat_or_for_the_next_steps_in_your_matter',
  'give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees',
  'may_will', 'insert_next_step_you_would_like_client_to_take',
  'state_why_this_step_is_important',
  'describe_first_document_or_information_you_need_from_your_client',
  'describe_second_document_or_information_you_need_from_your_client',
  'describe_third_document_or_information_you_need_from_your_client',
  'insert_consequence',
  'simple_disbursements_estimate', 'detailed_disbursements_examples', 'detailed_disbursements_total',
  'disbursement_1_description', 'disbursement_1_amount', 'disbursement_1_vat', 'disbursement_1_notes',
  'disbursement_2_description', 'disbursement_2_amount', 'disbursement_2_vat', 'disbursement_2_notes',
  'disbursement_3_description', 'disbursement_3_amount', 'disbursement_3_vat', 'disbursement_3_notes',
];

const STATIC_FIELD_KEYS = [
  'name_of_firm',
  'and_or_intervals_eg_every_three_months',
  'contact_details_for_marketing_opt_out',
  'link_to_preference_centre',
  'explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement',
  'instructions_link',
  'names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries',
];

const CCL_RUN_STEPS = [
  { label: 'Context', message: 'Pulling matter, pricing, and instruction context' },
  { label: 'Prompt', message: 'Assembling the CCL prompt from the available source material' },
  { label: 'AI fill', message: 'Generating matter-specific wording and filling the draft fields' },
  { label: 'Draft', message: 'Saving the regenerated draft and rebuilding the document' },
  { label: 'Preview', message: 'Refreshing the workbench and document preview' },
] as const;

type RunToastProgressStatus = 'pending' | 'active' | 'done' | 'error';

const formatDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCompactDate = (value?: string | null): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const snippetEntries = (snippets: Record<string, string>) => (
  Object.entries(snippets || {}).filter(([, value]) => String(value || '').trim().length > 0)
);

const formatSourceLabel = (value: string): string => (
  value
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const CCLWorkbench: React.FC<CCLWorkbenchProps> = ({ matter, linkage, userInitials, onClose }) => {
  const { isDarkMode } = useTheme();
  const { showToast, updateToast } = useToast();
  const [data, setData] = React.useState<WorkbenchResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>('');
  const [running, setRunning] = React.useState(false);
  const [approving, setApproving] = React.useState(false);
  const [docPreviewUrl, setDocPreviewUrl] = React.useState<string | null>(null);
  const [docPreviewLoading, setDocPreviewLoading] = React.useState(false);
  const [evidenceOpen, setEvidenceOpen] = React.useState(true);
  const [runFeedback, setRunFeedback] = React.useState<null | {
    status: 'running' | 'success' | 'error';
    phaseIndex: number;
    startedAt: number;
    tick: number;
    message: string;
  }>(null);
  const runToastIdRef = React.useRef<string | null>(null);

  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const shellBg = isDarkMode ? colours.websiteBlue : '#ffffff';
  const panelBg = isDarkMode ? colours.darkBlue : '#ffffff';
  const panelAltBg = isDarkMode ? colours.darkBlue : colours.grey;
  const panelElevatedBg = isDarkMode ? colours.helixBlue : colours.light.cardHover;
  const border = isDarkMode ? colours.dark.border : colours.highlightNeutral;
  const subtleBorder = isDarkMode ? colours.dark.borderColor : colours.light.border;
  const cardShadow = isDarkMode ? '0 4px 16px rgba(0, 3, 25, 0.35)' : '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)';

  const toneColour = React.useCallback((tone: WorkbenchStatus['tone'] | 'ready' | 'limited' | 'missing') => {
    switch (tone) {
      case 'success':
      case 'ready':
        return colours.green;
      case 'accent':
        return isDarkMode ? colours.accent : colours.highlight;
      case 'warning':
      case 'limited':
        return colours.orange;
      default:
        return isDarkMode ? colours.subtleGrey : colours.greyText;
    }
  }, [isDarkMode]);

  const buildRunToastProgress = React.useCallback((activeIndex: number, mode: 'running' | 'success' | 'error' = 'running'): Array<{ label: string; status: RunToastProgressStatus }> => {
    return CCL_RUN_STEPS.map((step, index) => ({
      label: step.label,
      status: (mode === 'success'
        ? 'done'
        : mode === 'error' && index === activeIndex
          ? 'error'
          : index < activeIndex
            ? 'done'
            : index === activeIndex
              ? 'active'
              : 'pending') as RunToastProgressStatus,
    }));
  }, []);

  const loadPreviewEmbed = React.useCallback(async (fallbackToWindow = true) => {
    const mKey = matter.matterId || matter.displayNumber;
    if (!mKey) return;
    setDocPreviewLoading(true);
    try {
      const response = await fetch(`/api/ccl/${mKey}/preview`);
      const previewData = await response.json();
      if (previewData?.embedUrl) {
        setDocPreviewUrl(previewData.embedUrl);
      } else if (fallbackToWindow && previewData?.previewUrl) {
        window.open(previewData.previewUrl, '_blank');
      }
    } catch {
      // silent - toast path handled by caller where needed
    } finally {
      setDocPreviewLoading(false);
    }
  }, [matter.displayNumber, matter.matterId]);

  const loadWorkbench = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const matterKey = matter.matterId || matter.displayNumber;
      const params = new URLSearchParams({
        displayNumber: matter.displayNumber || matterKey,
        instructionRef: linkage?.instructionRef || matter.instructionRef || '',
        practiceArea: matter.practiceArea || '',
        description: matter.description || matter.matterName || '',
        clientName: matter.clientName || '',
        opponent: matter.opponent || '',
        handlerName: matter.responsibleSolicitor || '',
        stage: linkage?.stage || '',
        passcode: linkage?.passcode || '',
        clientId: matter.clientId || linkage?.clientId || '',
        portalUrl: linkage?.portalUrl || '',
        cclDate: matter.cclDate || '',
      });
      const response = await fetch(`/api/ccl/${encodeURIComponent(matterKey)}/workbench?${params.toString()}`);
      if (!response.ok) throw new Error('Server returned an error — try again in a moment');
      const payload = await response.json();
      setData(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      const isConnection = msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network');
      setError(isConnection ? 'Server not reachable — it may be restarting' : msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [linkage?.clientId, linkage?.instructionRef, linkage?.passcode, linkage?.portalUrl, linkage?.stage, matter.cclDate, matter.clientId, matter.clientName, matter.description, matter.displayNumber, matter.instructionRef, matter.matterId, matter.matterName, matter.opponent, matter.practiceArea, matter.responsibleSolicitor]);

  React.useEffect(() => {
    loadWorkbench();
  }, [loadWorkbench]);

  React.useEffect(() => {
    if (!running) return undefined;

    setRunFeedback({
      status: 'running',
      phaseIndex: 0,
      startedAt: Date.now(),
      tick: 0,
      message: CCL_RUN_STEPS[0].message,
    });

    const interval = window.setInterval(() => {
      setRunFeedback((previous) => {
        if (!previous || previous.status !== 'running') return previous;
        const nextTick = previous.tick + 1;
        const nextPhaseIndex = Math.min(Math.floor(nextTick / 2), CCL_RUN_STEPS.length - 2);
        const nextMessage = CCL_RUN_STEPS[nextPhaseIndex].message;

        if (runToastIdRef.current) {
          updateToast(runToastIdRef.current, {
            message: nextMessage,
            progress: buildRunToastProgress(nextPhaseIndex, 'running'),
          });
        }

        return {
          ...previous,
          tick: nextTick,
          phaseIndex: nextPhaseIndex,
          message: nextMessage,
        };
      });
    }, 1200);

    return () => window.clearInterval(interval);
  }, [running, updateToast, buildRunToastProgress]);

  React.useEffect(() => {
    if (!runFeedback || runFeedback.status === 'running') return undefined;
    const timeout = window.setTimeout(() => setRunFeedback(null), runFeedback.status === 'success' ? 3200 : 4500);
    return () => window.clearTimeout(timeout);
  }, [runFeedback]);

  const runService = React.useCallback(async () => {
    const matterKey = matter.matterId || matter.displayNumber;
    if (!matterKey) return;
    setRunning(true);
    setError('');
    const toastId = showToast({
      type: 'loading',
      title: 'CCL service running',
      message: CCL_RUN_STEPS[0].message,
      persist: true,
      progress: buildRunToastProgress(0, 'running'),
    });
    runToastIdRef.current = toastId;
    try {
      const response = await fetch('/api/ccl/service/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matterId: matterKey,
          instructionRef: linkage?.instructionRef || matter.instructionRef || '',
          practiceArea: matter.practiceArea || '',
          description: matter.description || matter.matterName || '',
          clientName: matter.clientName || '',
          opponent: matter.opponent || '',
          handlerName: matter.responsibleSolicitor || '',
          stage: linkage?.stage || '',
          initials: userInitials || '',
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to run CCL service');
      }
      setRunFeedback((previous) => previous ? {
        ...previous,
        phaseIndex: CCL_RUN_STEPS.length - 1,
        message: CCL_RUN_STEPS[CCL_RUN_STEPS.length - 1].message,
      } : previous);
      updateToast(toastId, {
        message: CCL_RUN_STEPS[CCL_RUN_STEPS.length - 1].message,
        progress: buildRunToastProgress(CCL_RUN_STEPS.length - 1, 'running'),
      });
      await loadWorkbench();
      await loadPreviewEmbed(false);
      updateToast(toastId, {
        type: 'success',
        title: 'CCL draft updated',
        message: 'The draft was regenerated and the preview has been refreshed.',
        persist: false,
        progress: buildRunToastProgress(CCL_RUN_STEPS.length - 1, 'success'),
      });
      setRunFeedback((previous) => previous ? {
        ...previous,
        status: 'success',
        phaseIndex: CCL_RUN_STEPS.length - 1,
        message: 'Draft regenerated. Preview refreshed and ready to inspect.',
      } : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run CCL service';
      setError(message);
      updateToast(toastId, {
        type: 'error',
        title: 'CCL service failed',
        message,
        persist: false,
        progress: buildRunToastProgress(runFeedback?.phaseIndex || 0, 'error'),
      });
      setRunFeedback((previous) => ({
        status: 'error',
        phaseIndex: previous?.phaseIndex || 0,
        startedAt: previous?.startedAt || Date.now(),
        tick: previous?.tick || 0,
        message,
      }));
    } finally {
      runToastIdRef.current = null;
      setRunning(false);
    }
  }, [linkage?.instructionRef, linkage?.stage, loadWorkbench, loadPreviewEmbed, matter.clientName, matter.description, matter.displayNumber, matter.instructionRef, matter.matterId, matter.matterName, matter.opponent, matter.practiceArea, matter.responsibleSolicitor, userInitials, showToast, updateToast, buildRunToastProgress, runFeedback?.phaseIndex]);

  const approveDraft = React.useCallback(async () => {
    const matterKey = matter.matterId || matter.displayNumber;
    if (!matterKey) return;
    setApproving(true);
    setError('');
    try {
      const response = await fetch(`/api/ccl/${encodeURIComponent(matterKey)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStatus: 'approved', initials: userInitials || '' }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to approve draft');
      }
      await loadWorkbench();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve draft');
    } finally {
      setApproving(false);
    }
  }, [loadWorkbench, matter.displayNumber, matter.matterId, userInitials]);

  const lifecycleSteps = React.useMemo(() => {
    const statusKey = data?.service.status.key;
    const isSent = statusKey === 'sent';
    const isReviewed = statusKey === 'reviewed' || isSent;
    const isDrafted = statusKey === 'drafted' || isReviewed || isSent;
    return [
      {
        key: 'context',
        label: 'Context assembled',
        complete: Boolean(data && (data.prompt.dataSources.length > 0 || data.sourceCoverage.length > 0)),
        timestamp: null,
      },
      {
        key: 'draft',
        label: 'Draft generated',
        complete: Boolean(isDrafted),
        timestamp: data?.service.createdAt || null,
      },
      {
        key: 'review',
        label: 'Ready for review',
        complete: Boolean(isReviewed),
        timestamp: data?.service.reviewedAt || null,
      },
      {
        key: 'sent',
        label: 'Sent / confirmed',
        complete: Boolean(isSent),
        timestamp: data?.service.sentAt || matter.cclDate || null,
      },
    ];
  }, [data, matter.cclDate]);

  const canApprove = Boolean(data?.service.version) && data?.service.status.key === 'drafted' && (data?.service.unresolvedCount || 0) === 0;
  const sourceSnippets = snippetEntries(data?.sourcePreview?.snippets || {});
  const sourceFacts = Object.entries(data?.sourcePreview?.contextFields || {}).filter(([, value]) => String(value || '').trim().length > 0);
  const fieldValues = data?.fieldValues || {};
  const populatedSystemFields = SYSTEM_FIELD_KEYS.filter((key) => fieldValues[key]);
  const populatedAiFields = AI_FIELD_KEYS.filter((key) => fieldValues[key]);
  const missingAiFields = AI_FIELD_KEYS.filter((key) => !fieldValues[key]);
  const populatedStaticFields = STATIC_FIELD_KEYS.filter((key) => fieldValues[key]);
  const readySourceCount = data?.sourceCoverage.filter((item) => item.status === 'ready').length || 0;
  const unresolvedCount = data?.service.unresolvedCount || 0;
  const lastRunSummary = data?.trace?.durationMs ? `${Math.round(data.trace.durationMs / 100) / 10}s` : 'No timing yet';
  const templateFieldPreview = populatedStaticFields.slice(0, 4).map((key) => DISPLAY[key] || key);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      flex: 1,
      background: shellBg,
      border: `1px solid ${subtleBorder}`,
      boxShadow: cardShadow,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 20px',
        borderBottom: `1px solid ${border}`,
        background: panelAltBg,
        flexWrap: 'wrap',
      }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 26,
            height: 26,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 0,
            border: `1px solid ${border}`,
            background: 'transparent',
            color: muted,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          aria-label="Close CCL workbench"
        >
          <Icon iconName="ChromeBack" styles={{ root: { fontSize: 11 } }} />
        </button>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: isDarkMode ? colours.accent : colours.highlight, fontWeight: 700 }}>
          CCL Workbench
        </span>

        {data && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginLeft: 'auto' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 0,
              border: `1px solid ${toneColour(data.service.status.tone)}44`,
              background: 'transparent',
              color: toneColour(data.service.status.tone),
              fontSize: 12,
              fontWeight: 700,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: toneColour(data.service.status.tone), flexShrink: 0 }} />
              {data.service.status.label}
            </span>
            <button
              type="button"
              onClick={loadWorkbench}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 0, cursor: 'pointer',
                border: `1px solid ${border}`, background: 'transparent', color: bodyText, fontSize: 12, fontWeight: 600,
              }}
            >
              <FaSyncAlt size={11} /> Refresh
            </button>
            <button
              type="button"
              onClick={runService}
              disabled={running}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 0, cursor: running ? 'progress' : 'pointer',
                border: 'none', background: colours.highlight, color: '#ffffff', fontSize: 12, fontWeight: 700,
                opacity: running ? 0.7 : 1,
              }}
            >
              <FaPlayCircle size={12} /> {data.service.version ? 'Re-run service' : 'Run service'}
            </button>
            <button
              type="button"
              onClick={approveDraft}
              disabled={!canApprove || approving}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 0,
                cursor: !canApprove || approving ? 'not-allowed' : 'pointer',
                border: `1px solid ${canApprove ? `${colours.green}66` : border}`,
                background: 'transparent',
                color: canApprove ? colours.green : muted,
                fontSize: 12, fontWeight: 700,
                opacity: !canApprove || approving ? 0.55 : 1,
              }}
            >
              <FaCheckCircle size={12} /> Approve draft
            </button>
            {data.service.documentUrl && (
              <>
                <button
                  type="button"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 12px', borderRadius: 0, cursor: docPreviewLoading ? 'wait' : 'pointer',
                    border: `1px solid ${docPreviewUrl ? (isDarkMode ? colours.accent : colours.highlight) : border}`,
                    background: docPreviewUrl ? panelElevatedBg : 'transparent',
                    color: docPreviewUrl ? (isDarkMode ? colours.accent : colours.highlight) : bodyText,
                    fontSize: 12, fontWeight: 600,
                  }}
                  onClick={async () => {
                    if (docPreviewUrl) { setDocPreviewUrl(null); return; }
                    setDocPreviewLoading(true);
                    try {
                      const mKey = matter.matterId || matter.displayNumber;
                      const r = await fetch(`/api/ccl/${mKey}/preview`);
                      const d = await r.json();
                      if (d?.embedUrl) { setDocPreviewUrl(d.embedUrl); }
                      else if (d?.previewUrl) { window.open(d.previewUrl, '_blank'); }
                    } catch { /* silent */ }
                    setDocPreviewLoading(false);
                  }}
                >
                  <FaFileAlt size={11} /> {docPreviewUrl ? 'Hide preview' : docPreviewLoading ? 'Loading…' : 'Preview'}
                </button>
                <a
                  href={data.service.documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 12px', borderRadius: 0, textDecoration: 'none',
                    border: `1px solid ${subtleBorder}`, color: muted, fontSize: 11, fontWeight: 500,
                  }}
                >
                  .docx
                </a>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px',
          borderBottom: `1px solid ${subtleBorder}`,
          background: isDarkMode ? 'rgba(214,85,65,0.04)' : 'rgba(214,85,65,0.03)',
          color: isDarkMode ? '#d1d5db' : '#6b7280',
          fontSize: 11, fontWeight: 500,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: colours.orange, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            onClick={() => { setError(''); loadWorkbench(); }}
            style={{ fontSize: 10, fontWeight: 600, color: isDarkMode ? colours.accent : colours.highlight, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', whiteSpace: 'nowrap' }}
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => setError('')}
            style={{ fontSize: 10, color: muted, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Inline document preview ─── */}
      {docPreviewUrl && (
        <div style={{
          borderBottom: `1px solid ${border}`,
          background: panelAltBg,
          position: 'relative',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px', borderBottom: `1px solid ${subtleBorder}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: isDarkMode ? colours.accent : colours.highlight }}>Document preview</span>
            <button
              type="button"
              onClick={() => setDocPreviewUrl(null)}
              style={{ fontSize: 10, fontWeight: 600, color: muted, cursor: 'pointer', background: 'transparent', border: 'none', padding: '4px 8px' }}
            >
              Close
            </button>
          </div>
          <iframe
            src={docPreviewUrl}
            title="CCL Document Preview"
            style={{ width: '100%', height: 500, border: 'none', display: 'block' }}
          />
        </div>
      )}

      {loading ? (
        <div style={{ padding: 24, color: muted, fontSize: 13 }}>Loading workbench…</div>
      ) : !data ? (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ color: muted, fontSize: 13 }}>Couldn't reach the server — it may still be starting up.</span>
          <button
            type="button"
            onClick={loadWorkbench}
            style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? colours.accent : colours.highlight, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Try again
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 0, minHeight: 0, flex: 1 }}>
          {/* ─── Main content ─── */}
          <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, overflowY: 'auto' }}>

            {runFeedback && (
              <div style={{ background: panelBg, border: `1px solid ${runFeedback.status === 'error' ? colours.cta : runFeedback.status === 'success' ? colours.green : border}`, boxShadow: cardShadow, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(220px, 0.8fr)', gap: 0 }}>
                  <div style={{ padding: '14px 16px', borderRight: `1px solid ${subtleBorder}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: runFeedback.status === 'error' ? colours.cta : runFeedback.status === 'success' ? colours.green : (isDarkMode ? colours.accent : colours.highlight), boxShadow: runFeedback.status === 'running' ? `0 0 10px ${isDarkMode ? colours.accent : colours.highlight}` : 'none' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: runFeedback.status === 'error' ? colours.cta : runFeedback.status === 'success' ? colours.green : (isDarkMode ? colours.accent : colours.highlight) }}>
                        {runFeedback.status === 'running' ? 'CCL service is running' : runFeedback.status === 'success' ? 'CCL draft regenerated' : 'CCL service failed'}
                      </span>
                      <span style={{ fontSize: 10, color: muted, marginLeft: 'auto' }}>{Math.max(1, Math.round((Date.now() - runFeedback.startedAt) / 1000))}s</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: text, marginBottom: 6 }}>{runFeedback.message}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
                      {CCL_RUN_STEPS.map((step, index) => {
                        const isDone = runFeedback.status === 'success' ? true : index < runFeedback.phaseIndex;
                        const isActive = runFeedback.status === 'running' && index === runFeedback.phaseIndex;
                        const isError = runFeedback.status === 'error' && index === runFeedback.phaseIndex;
                        const stepAccent = isError ? colours.cta : isDone ? colours.green : isActive ? (isDarkMode ? colours.accent : colours.highlight) : muted;
                        return (
                          <div key={step.label} style={{ padding: '8px 8px 10px', border: `1px solid ${isActive || isDone || isError ? stepAccent : subtleBorder}`, background: panelAltBg }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isDone || isActive || isError ? stepAccent : 'transparent', border: `1px solid ${stepAccent}` }} />
                              <span style={{ fontSize: 9, fontWeight: 700, color: stepAccent, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{step.label}</span>
                            </div>
                            <div style={{ fontSize: 10, lineHeight: 1.4, color: isActive ? bodyText : muted }}>{step.message}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ padding: '14px 16px', background: panelAltBg }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: muted, marginBottom: 8 }}>Drafting preview</div>
                    <div style={{ border: `1px solid ${subtleBorder}`, background: panelBg, padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <FaFileAlt size={11} color={runFeedback.status === 'error' ? colours.cta : runFeedback.status === 'success' ? colours.green : (isDarkMode ? colours.accent : colours.highlight)} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: text }}>CCL draft.docx</span>
                      </div>
                      {[72, 88, 65, 82, 58, 76].map((width, index) => {
                        const activeBand = runFeedback.tick % 6;
                        const opacity = runFeedback.status === 'success' ? 0.7 : runFeedback.status === 'error' ? 0.3 : index === activeBand ? 0.95 : 0.4;
                        return (
                          <div key={width + index} style={{ height: 7, width: `${width}%`, background: isDarkMode ? colours.helixBlue : colours.highlightBlue, opacity, marginBottom: index === 5 ? 0 : 7, transition: 'opacity 180ms ease' }} />
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: muted, lineHeight: 1.45, marginTop: 10 }}>
                      {runFeedback.status === 'running'
                        ? 'The workbench is updating the context, regenerating the draft, and refreshing the preview as the service completes.'
                        : runFeedback.status === 'success'
                          ? 'Preview refreshed. You can inspect the regenerated draft immediately below.'
                          : 'The last run failed before the draft could be refreshed.'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ background: panelBg, border: `1px solid ${border}`, boxShadow: cardShadow }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${subtleBorder}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: isDarkMode ? colours.accent : colours.highlight }}>Processing overview</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: text, marginTop: 6 }}>This workbench now follows the CCL flow directly: input, AI draft, then final document state.</div>
                <div style={{ fontSize: 12, color: bodyText, lineHeight: 1.5, marginTop: 4 }}>Someone opening this should be able to answer three questions immediately: what we sent to the AI, what the AI wrote, and what still needs human attention.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0 }}>
                <div style={{ padding: '14px 16px', borderRight: `1px solid ${subtleBorder}` }}>
                  <div style={{ fontSize: 10, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>1. Inputs prepared</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: text, marginTop: 4 }}>{sourceFacts.length + sourceSnippets.length}</div>
                  <div style={{ fontSize: 11, color: bodyText, lineHeight: 1.45, marginTop: 4 }}>{sourceFacts.length} fact{sourceFacts.length !== 1 ? 's' : ''} and {sourceSnippets.length} narrative source{sourceSnippets.length !== 1 ? 's' : ''} are visible below.</div>
                </div>
                <div style={{ padding: '14px 16px', borderRight: `1px solid ${subtleBorder}` }}>
                  <div style={{ fontSize: 10, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>2. AI wrote</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: colours.green, marginTop: 4 }}>{populatedAiFields.length}</div>
                  <div style={{ fontSize: 11, color: bodyText, lineHeight: 1.45, marginTop: 4 }}>{missingAiFields.length} field{missingAiFields.length !== 1 ? 's' : ''} still have no generated content.</div>
                </div>
                <div style={{ padding: '14px 16px', borderRight: `1px solid ${subtleBorder}` }}>
                  <div style={{ fontSize: 10, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>3. Review needed</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: unresolvedCount > 0 ? colours.orange : colours.green, marginTop: 4 }}>{unresolvedCount}</div>
                  <div style={{ fontSize: 11, color: bodyText, lineHeight: 1.45, marginTop: 4 }}>{unresolvedCount > 0 ? 'Outstanding points still need a human pass before approval.' : 'No unresolved items are currently blocking approval.'}</div>
                </div>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 10, color: muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>4. Draft state</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: toneColour(data.service.status.tone), marginTop: 4 }}>{data.service.status.label}</div>
                  <div style={{ fontSize: 11, color: bodyText, lineHeight: 1.45, marginTop: 4 }}>Version {data.service.version || '—'} · last AI run {lastRunSummary}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '10px 14px', background: panelBg, border: `1px solid ${border}`, boxShadow: cardShadow, overflowX: 'auto' }}>
              {lifecycleSteps.map((step, i) => {
                const stepColor = step.complete ? colours.green : muted;
                return (
                  <React.Fragment key={step.key}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: step.complete ? stepColor : 'transparent', border: `1.5px solid ${stepColor}`, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: step.complete ? 700 : 500, color: step.complete ? text : muted, whiteSpace: 'nowrap' }}>{step.label}</span>
                      {step.complete && step.timestamp && <span style={{ fontSize: 9, color: muted, whiteSpace: 'nowrap' }}>{formatCompactDate(step.timestamp)}</span>}
                    </div>
                    {i < lifecycleSteps.length - 1 && <div style={{ flex: '0 0 20px', height: 1, background: subtleBorder, margin: '0 6px' }} />}
                  </React.Fragment>
                );
              })}
            </div>

            <div style={{ background: panelBg, border: `1px solid ${border}`, boxShadow: cardShadow }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${subtleBorder}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FaDatabase size={11} color={isDarkMode ? colours.accent : colours.highlight} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: isDarkMode ? colours.accent : colours.highlight }}>1. What goes into the AI</span>
                <span style={{ fontSize: 10, color: muted, marginLeft: 'auto' }}>{readySourceCount}/{data.sourceCoverage.length} source feeds ready</span>
              </div>
              <div style={{ padding: '12px 16px', fontSize: 12, color: bodyText, lineHeight: 1.5, borderBottom: `1px solid ${subtleBorder}` }}>
                These are the grounded matter facts and source notes used to build the AI prompt. Nothing below is AI-written output.
              </div>
              <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: muted }}>Facts sent to the AI</div>
                  {sourceFacts.length === 0 ? (
                    <div style={{ padding: '10px 12px', border: `1px solid ${subtleBorder}`, background: panelAltBg, fontSize: 12, color: muted }}>No structured matter facts are available yet.</div>
                  ) : (
                    sourceFacts.map(([key, value]) => (
                      <div key={key} style={{ padding: '8px 10px', background: panelAltBg, border: `1px solid ${subtleBorder}` }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{formatSourceLabel(key)}</div>
                        <div style={{ fontSize: 12, color: bodyText, marginTop: 4, lineHeight: 1.45 }}>{value}</div>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setEvidenceOpen(!evidenceOpen)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: 0, width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    {evidenceOpen ? <FaChevronDown size={9} color={muted} /> : <FaChevronRight size={9} color={muted} />}
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: muted }}>Source material sent to the AI</span>
                    <span style={{ fontSize: 10, color: muted, marginLeft: 'auto' }}>{sourceSnippets.length} narrative block{sourceSnippets.length !== 1 ? 's' : ''}</span>
                  </button>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {data.sourceCoverage.map((item) => {
                      const accent = toneColour(item.status);
                      return (
                        <div key={item.key} style={{ border: `1px solid ${subtleBorder}`, background: panelAltBg, padding: '8px 10px', borderLeft: `2px solid ${accent}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: text }}>{item.label}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, color: accent, textTransform: 'uppercase' }}>{item.status}</span>
                          </div>
                          <div style={{ fontSize: 11, color: bodyText, lineHeight: 1.4, marginTop: 4 }}>{item.summary}</div>
                        </div>
                      );
                    })}
                  </div>
                  {evidenceOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {sourceSnippets.length === 0 ? (
                        <div style={{ padding: '10px 12px', border: `1px solid ${subtleBorder}`, background: panelAltBg, fontSize: 12, color: muted }}>No narrative notes or transcript excerpts are currently available.</div>
                      ) : (
                        sourceSnippets.map(([key, value]) => (
                          <div key={key} style={{ padding: '8px 10px', border: `1px solid ${subtleBorder}`, background: panelAltBg }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: isDarkMode ? colours.accent : colours.highlight, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                              {formatSourceLabel(key)}
                            </div>
                            <div style={{ fontSize: 11, lineHeight: 1.5, color: bodyText, whiteSpace: 'pre-wrap' }}>{value}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              {data.missingDataFlags.length > 0 && (
                <div style={{ padding: '0 12px 12px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: colours.orange, marginBottom: 6 }}>Known gaps in the input</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {data.missingDataFlags.map((flag) => (
                      <span key={flag} style={{ padding: '3px 7px', border: `1px solid ${colours.orange}33`, background: 'transparent', color: colours.orange, fontSize: 10, fontWeight: 600 }}>
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ background: panelBg, border: `1px solid ${border}`, boxShadow: cardShadow }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${subtleBorder}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FaMagic size={11} color={colours.green} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: colours.green }}>2. What the AI wrote into the draft</span>
                {data.trace?.confidence && <span style={{ fontSize: 9, fontWeight: 700, color: colours.green, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{data.trace.confidence}</span>}
                <span style={{ fontSize: 10, color: muted, marginLeft: 'auto' }}>{populatedAiFields.length} completed sections</span>
              </div>
              <div style={{ padding: '12px 16px', fontSize: 12, color: bodyText, lineHeight: 1.5, borderBottom: `1px solid ${subtleBorder}` }}>
                This is the matter-specific wording generated by the service. If a section is not listed here, it has not been written into the draft yet.
              </div>
              {populatedAiFields.length === 0 ? (
                <div style={{ padding: '14px 16px', fontSize: 12, color: muted }}>The AI has not written any matter-specific sections yet.</div>
              ) : (
                <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {populatedAiFields.map((key) => (
                    <div key={key} style={{ padding: '8px 10px', background: panelAltBg, border: `1px solid ${subtleBorder}`, borderLeft: `2px solid ${colours.green}` }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{DISPLAY[key] || key}</div>
                      <div style={{ fontSize: 12, color: bodyText, lineHeight: 1.5, marginTop: 4 }}>{fieldValues[key]}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ padding: '0 16px 14px' }}>
                <div style={{ padding: '8px 10px', border: `1px solid ${(missingAiFields.length > 0 ? colours.orange : colours.green)}33`, background: panelAltBg, fontSize: 11, color: missingAiFields.length > 0 ? colours.orange : colours.green }}>
                  {missingAiFields.length > 0
                    ? `${missingAiFields.length} AI field${missingAiFields.length !== 1 ? 's are' : ' is'} still blank, so the draft is not fully filled yet.`
                    : 'All tracked AI-written sections currently have content.'}
                </div>
              </div>
            </div>

            <div style={{ background: panelBg, border: `1px solid ${border}`, boxShadow: cardShadow, opacity: 0.9 }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${subtleBorder}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FaLock size={10} color={muted} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: muted }}>3. Template and fixed wording</span>
                <span style={{ fontSize: 10, color: muted, marginLeft: 'auto' }}>{populatedStaticFields.length}/{STATIC_FIELD_KEYS.length}</span>
              </div>
              <div style={{ padding: '12px 16px', fontSize: 12, color: bodyText, lineHeight: 1.5 }}>
                This area is not AI-authored. It is boilerplate or default wording supplied by the template.
                {templateFieldPreview.length > 0
                  ? ` Current fixed fields in play: ${templateFieldPreview.join(', ')}${populatedStaticFields.length > templateFieldPreview.length ? `, plus ${populatedStaticFields.length - templateFieldPreview.length} more` : ''}.`
                  : ' No default-only helper fields are currently populated.'}
              </div>
            </div>

          </div>

          {/* ─── Sidebar (metadata) ─── */}
          <div style={{ width: 300, flexShrink: 0, padding: 20, borderLeft: `1px solid ${subtleBorder}`, background: panelAltBg, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, overflowY: 'auto' }}>
            <div style={{ background: panelBg, border: `1px solid ${border}`, boxShadow: cardShadow }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${subtleBorder}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current draft</div>
              </div>
              <div style={{ padding: 14, display: 'grid', gap: 8 }}>
                <div style={{ padding: '10px 12px', border: `1px solid ${subtleBorder}`, background: shellBg }}>
                  <div style={{ fontSize: 10, color: muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>State</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: toneColour(data.service.status.tone), marginTop: 4 }}>{data.service.status.label}</div>
                  <div style={{ fontSize: 11, color: bodyText, marginTop: 4 }}>Version {data.service.version ? `v${data.service.version}` : '—'} · generated {formatCompactDate(data.service.createdAt)}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}><span style={{ color: muted }}>Matter fields filled</span><span style={{ color: bodyText }}>{data.service.fieldSummary.populated}/{data.service.fieldSummary.total}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}><span style={{ color: muted }}>Needs review</span><span style={{ color: unresolvedCount > 0 ? colours.orange : colours.green, fontWeight: 700 }}>{unresolvedCount === 0 ? 'Clear' : `${unresolvedCount} open`}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}><span style={{ color: muted }}>Clio upload</span><span style={{ color: data.service.uploadedToClio ? colours.green : muted, fontWeight: 700 }}>{data.service.uploadedToClio ? 'Confirmed' : 'Pending'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}><span style={{ color: muted }}>Portal</span><span style={{ color: data.linkage.portalReady ? colours.green : muted, fontWeight: 700 }}>{data.linkage.portalReady ? 'Ready' : 'Pending'}</span></div>
              </div>
            </div>

            <div style={{ background: panelBg, border: `1px solid ${border}`, boxShadow: cardShadow }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${subtleBorder}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Last AI run</div>
              </div>
              <div style={{ padding: 14, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}><span style={{ color: muted }}>Run status</span><span style={{ color: bodyText }}>{data.trace?.aiStatus || 'No trace'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}><span style={{ color: muted }}>Confidence</span><span style={{ color: bodyText }}>{data.trace?.confidence || '—'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}><span style={{ color: muted }}>Duration</span><span style={{ color: bodyText }}>{lastRunSummary}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}><span style={{ color: muted }}>Prompt version</span><span style={{ color: bodyText }}>{data.prompt.version}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}><span style={{ color: muted }}>Template version</span><span style={{ color: bodyText }}>{data.prompt.templateVersion}</span></div>
                {data.trace?.trackingId && <div style={{ fontSize: 10, color: muted }}>ID · {data.trace.trackingId}</div>}
                {data.trace?.fallbackReason && <div style={{ fontSize: 10, color: colours.orange, lineHeight: 1.4 }}>{data.trace.fallbackReason}</div>}
                {data.trace?.errorMessage && <div style={{ fontSize: 10, color: colours.cta, lineHeight: 1.4 }}>{data.trace.errorMessage}</div>}
              </div>
            </div>

            <div style={{ background: panelBg, border: `1px solid ${border}`, boxShadow: cardShadow }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${subtleBorder}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Matter links</div>
              </div>
              <div style={{ padding: 14, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}><span style={{ color: muted }}>Instruction</span><span style={{ color: bodyText }}>{data.linkage.instructionRef || '—'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}><span style={{ color: muted }}>Stage</span><span style={{ color: bodyText }}>{data.linkage.stage || '—'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}><span style={{ color: muted }}>Client ID</span><span style={{ color: bodyText }}>{data.linkage.clientId || '—'}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}><span style={{ color: muted }}>Passcode</span><span style={{ color: data.linkage.passcodeAvailable ? bodyText : muted }}>{data.linkage.passcode || 'N/A'}</span></div>
                {data.linkage.portalReady && (
                  <a href={data.linkage.portalUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: isDarkMode ? colours.accent : colours.highlight, textDecoration: 'none', fontWeight: 700 }}>
                    <FaExternalLinkAlt size={9} /> Portal
                  </a>
                )}
              </div>
            </div>

            <div style={{ background: panelBg, border: `1px solid ${border}`, boxShadow: cardShadow, flex: 1 }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${subtleBorder}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recent versions</div>
              </div>
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.history.length === 0 ? (
                  <div style={{ fontSize: 11, color: muted }}>No versions yet.</div>
                ) : data.history.slice(0, 3).map((item) => (
                  <div key={`${item.version}-${item.createdAt}`} style={{ padding: 8, border: `1px solid ${subtleBorder}`, background: shellBg }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: text }}>v{item.version} · {item.status}</div>
                      <div style={{ fontSize: 10, color: muted }}>{formatCompactDate(item.createdAt)}</div>
                    </div>
                    <div style={{ fontSize: 10, color: bodyText, marginTop: 4 }}>
                      {item.createdBy || 'system'}{item.finalizedAt ? ` · ${formatCompactDate(item.finalizedAt)}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CCLWorkbench;
