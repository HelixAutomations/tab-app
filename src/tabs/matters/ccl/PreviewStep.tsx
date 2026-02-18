import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Icon, Spinner, SpinnerSize } from '@fluentui/react';
import { colours } from '../../../app/styles/colours';
import type { NormalizedMatter } from '../../../app/functionality/types';
import type { AiStatus } from './CCLEditor';
import { submitAiFeedback, submitCclSupportTicket, checkCclIntegrations, uploadToClio, uploadToNetDocuments, type AiDebugTrace, type CclSupportTicket, type CclIntegrations } from './cclAiService';
import { CCL_SECTIONS } from './cclSections';
import CclOpsPanel from './CclOpsPanel';
import { ADMIN_USERS } from '../../../app/admin';

interface PreviewSection {
  id: string;
  number: string;
  title: string;
  isSubsection: boolean;
  elements: React.ReactNode[];
}

// ─── AI Feedback Widget ─────────────────────────────────────────────────────
// Subtle thumbs up/down + optional comment, with expandable data sources panel.
// Modelled on the tech ticket form pattern — lightweight, non-intrusive.
interface AiFeedbackWidgetProps {
  matterId: string;
  aiStatus: string;
  dataSources: string[];
  contextSummary: string;
  isDarkMode: boolean;
  text: string;
  textMuted: string;
  cardBorder: string;
  accentBlue: string;
}

const AiFeedbackWidget: React.FC<AiFeedbackWidgetProps> = ({
  matterId, aiStatus, dataSources, contextSummary, isDarkMode, text, textMuted, cardBorder, accentBlue,
}) => {
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showSources, setShowSources] = useState(false);

  const handleRate = async (r: 'up' | 'down') => {
    setRating(r);
    setSubmitted(false);
    // Auto-submit immediately for thumbs up; show comment for thumbs down
    if (r === 'up') {
      await submitAiFeedback({ matterId, rating: r });
      setSubmitted(true);
    } else {
      setShowComment(true);
    }
  };

  const handleSubmitComment = async () => {
    if (!rating) return;
    await submitAiFeedback({ matterId, rating, comment: comment.trim() || undefined });
    setSubmitted(true);
    setShowComment(false);
  };

  return (
    <div style={{ margin: '0 10px 8px' }}>
      {/* Feedback row */}
      <div style={{
        padding: '8px 12px',
        borderRadius: 4,
        fontSize: 11,
        background: isDarkMode ? 'rgba(54,144,206,0.05)' : 'rgba(54,144,206,0.03)',
        border: `1px solid ${cardBorder}`,
      }}>
        {/* Top row: question + thumbs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: textMuted, fontWeight: 600 }}>
            {submitted ? 'Thanks for the feedback' : 'How was the AI draft?'}
          </span>
          {!submitted && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => handleRate('up')}
                title="Good — AI got it mostly right"
                style={{
                  width: 26, height: 26, borderRadius: 3,
                  border: `1px solid ${rating === 'up' ? accentBlue : cardBorder}`,
                  background: rating === 'up' ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.08)') : 'transparent',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: rating === 'up' ? accentBlue : textMuted, fontSize: 13,
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon iconName="Like" />
              </button>
              <button
                type="button"
                onClick={() => handleRate('down')}
                title="Needs work — tell us what was wrong"
                style={{
                  width: 26, height: 26, borderRadius: 3,
                  border: `1px solid ${rating === 'down' ? '#d65541' : cardBorder}`,
                  background: rating === 'down' ? (isDarkMode ? 'rgba(214,85,65,0.15)' : 'rgba(214,85,65,0.08)') : 'transparent',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: rating === 'down' ? '#d65541' : textMuted, fontSize: 13,
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon iconName="Dislike" />
              </button>
            </div>
          )}
          {submitted && (
            <Icon iconName="SkypeCheck" styles={{ root: { fontSize: 13, color: accentBlue } }} />
          )}
        </div>

        {/* Comment field (shown on thumbs down) */}
        {showComment && !submitted && (
          <div style={{ marginTop: 8 }}>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What needs improving? (optional)"
              style={{
                width: '100%', minHeight: 48, padding: '6px 8px',
                fontSize: 11, fontFamily: 'inherit',
                borderRadius: 3, border: `1px solid ${cardBorder}`,
                background: isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
                color: text, resize: 'vertical', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => { setShowComment(false); setRating(null); }}
                style={{
                  padding: '3px 10px', borderRadius: 2, fontSize: 10, fontWeight: 600,
                  border: `1px solid ${cardBorder}`, background: 'transparent',
                  color: textMuted, cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                type="button"
                onClick={handleSubmitComment}
                style={{
                  padding: '3px 10px', borderRadius: 2, fontSize: 10, fontWeight: 600,
                  border: 'none', background: accentBlue,
                  color: '#fff', cursor: 'pointer',
                }}
              >Submit</button>
            </div>
          </div>
        )}

        {/* Data sources toggle */}
        {dataSources.length > 0 && (
          <button
            type="button"
            onClick={() => setShowSources(!showSources)}
            style={{
              marginTop: 6, padding: 0, border: 'none', background: 'transparent',
              color: accentBlue, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              opacity: 0.8,
            }}
          >
            <Icon iconName={showSources ? 'ChevronDown' : 'ChevronRight'} styles={{ root: { fontSize: 8 } }} />
            {dataSources.length} data source{dataSources.length !== 1 ? 's' : ''} used
          </button>
        )}

        {/* Expandable data sources panel */}
        {showSources && dataSources.length > 0 && (
          <div style={{
            marginTop: 4, padding: '6px 8px',
            borderRadius: 3,
            background: isDarkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.02)',
            border: `1px solid ${cardBorder}`,
          }}>
            <div style={{ fontSize: 10, color: textMuted, marginBottom: 4, fontWeight: 600 }}>
              Context gathered from:
            </div>
            {dataSources.map((source, i) => (
              <div key={i} style={{
                fontSize: 10, color: text, padding: '2px 0',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: accentBlue, flexShrink: 0,
                }} />
                {source}
              </div>
            ))}
            {contextSummary && (
              <div style={{ fontSize: 9, color: textMuted, marginTop: 4, fontStyle: 'italic' }}>
                {contextSummary}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export interface PreviewStepProps {
  content: string;
  /** Template with section choices resolved but {{field}} placeholders intact — for inline editing on A4 surface */
  templateContent?: string;
  matter: NormalizedMatter;
  fields: Record<string, string>;
  updateField?: (key: string, value: string) => void;
  /** Keys the user has manually edited — shown with 'user' provenance (purple) */
  userEditedKeys?: Set<string>;
  /** Current user's initials — used for per-user Clio auth on uploads (audit trail) */
  userInitials?: string;
  aiStatus?: AiStatus;
  aiSource?: string;
  aiDurationMs?: number;
  aiDataSources?: string[];
  aiContextSummary?: string;
  aiUserPrompt?: string;
  aiSystemPrompt?: string;
  aiFallbackReason?: string;
  aiDebugTrace?: AiDebugTrace;
  isDarkMode: boolean;
  onBack: () => void;
  onClose?: () => void;
  onAdvancedMode?: () => void;
  /** Trigger AI fill — must be explicitly invoked (no auto-fire on mount) */
  onTriggerAiFill?: () => void;
}

// Fallback: if the server doesn't return the system prompt (older deployment),
// use the canonical version so the trace modal can always display it.
const CANONICAL_SYSTEM_PROMPT = `You are a senior UK solicitor at Helix Law, a specialist litigation firm. Helix Law acts across four core practice areas: commercial disputes (shareholder and partnership disputes, investment and loan disputes, debt recovery, statutory demands, civil fraud, contract disputes, restrictive covenants, injunctions), property disputes (landlord and tenant, evictions, boundary and land disputes), construction disputes (adjudication, payment disputes, contract breaches, unlawful terminations), and employment law. The firm is SRA-regulated (ID 565557) and based in Brighton. Your task is to generate the intake fields for a Client Care Letter (CCL) based on the matter context provided.

The CCL is a regulatory requirement under SRA rules. It must be professional, accurate, and tailored to the specific matter. Write in clear, professional British English suitable for a client who is not legally trained.

CRITICAL: You are filling in the placeholder fields of a REAL legal template. Each field you generate is injected verbatim into the letter — it MUST read naturally in context. Below is how each field appears in the actual template so you understand exactly where your output goes.

TEMPLATE CONTEXT (how your fields are used — {{field_name}} = your output):

Section 2 — Scope of services:
"{{insert_current_position_and_scope_of_retainer}} ("Initial Scope")"
→ This is the opening paragraph of the scope section. Write 2-4 complete sentences describing what the client has instructed Helix Law to do. Must be specific to this matter. Ends with the text ("Initial Scope") which is added by the template.

Section 3 — Next steps:
"The next steps in your matter are {{next_steps}}."
→ Start lowercase. This completes the sentence. List 2-3 specific actions.

"We expect this will take {{realistic_timescale}}."
→ A realistic period, e.g. "4-6 weeks" or "2-3 months".

Section 4.1 — Charges:
"My rate is £{{handler_hourly_rate}} per hour."
→ Number only (already auto-filled, but if missing use the rate given in context).

"{{charges_estimate_paragraph}}"
→ 1-3 complete sentences estimating fees for the Initial Scope. Include a £ range plus VAT. Base this on the deal amount, pitch email amount, or practice area norms. Must be realistic.

Section 4.2 — Disbursements:
"{{disbursements_paragraph}}"
→ 1-2 complete sentences about likely disbursements for this matter type.

Section 4.3 — Costs other party:
"{{costs_other_party_paragraph}}"
→ 1-2 sentences. If there is an opponent: note the risk. If no opponent/not litigation: "We do not expect that you will have to pay another party's costs."

Section 6 — Payment on account:
"Please provide us with £{{figure}} on account of costs."
→ Number only, no £ sign, e.g. "2,500". Usually 50-100% of the low end of the estimate range.

Section 7 — Costs updates:
"We have agreed to provide you with an update on the amount of costs when appropriate as the matter progresses{{and_or_intervals_eg_every_three_months}}."
→ Starts with a space or ", " then the interval. Usually " monthly" or " every three months".

Section 13 — Duties to court:
"Your matter {{may_will}} involve court proceedings."
→ Either "may" or "will". Use "may" unless court proceedings are certain.

Section 18 — Action points:
"☐ {{insert_next_step_you_would_like_client_to_take}} | {{state_why_this_step_is_important}}"
→ insert_next_step: Imperative sentence — what the client must do. Be specific to this matter.
→ state_why_this_step_is_important: Why it matters. 1 sentence.

"☐ Provide a payment on account of costs and disbursements of £{{state_amount}} | If we do not receive a payment on account... {{insert_consequence}}"
→ state_amount: Same as figure.
→ insert_consequence: What happens if they don't pay, e.g. "we may not be able to start work on your matter"

"{{describe_first_document_or_information_you_need_from_your_client}}"
"{{describe_second_document_or_information_you_need_from_your_client}}"
"{{describe_third_document_or_information_you_need_from_your_client}}"
→ Each is a bullet point. Be specific to this matter type — name the actual documents needed.

NOT IN TEMPLATE (metadata fields):
- "next_stage": Brief label for the next milestone (used for internal tracking, not shown to client)
- "figure_or_range": Cost estimate range, e.g. "2,500 - 5,000" (used in sidebar display)
- "estimate": Full estimate string, e.g. "£2,500 to £5,000 plus VAT"
- "in_total_including_vat_or_for_the_next_steps_in_your_matter": Either "in total, including VAT" or "for the next steps in your matter"
- "give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees": Brief list of what the estimate covers
- "we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible": If estimate IS possible, set to "". Only fill if genuinely impossible.
- "simple_disbursements_estimate": Estimated disbursements (number only, e.g. "500")

COST ACCURACY RULES:
1. If a Deal Amount is provided, the costs estimate MUST be consistent with it. The payment on account (figure) should be 50-100% of the deal amount.
2. If a Pitch Email is provided, match its quoted figures exactly — the client has already seen these numbers.
3. If neither is available, use practice area norms for a UK specialist litigation firm.
4. Never invent costs figures that are wildly different from the deal/pitch context.

Respond with ONLY a JSON object containing these fields. No markdown, no explanation, just the JSON object.`;

const PreviewStep: React.FC<PreviewStepProps> = ({ content, templateContent, matter, fields, updateField, userEditedKeys, userInitials, aiStatus, aiSource, aiDurationMs, aiDataSources, aiContextSummary, aiUserPrompt, aiSystemPrompt: aiSystemPromptRaw, aiFallbackReason, aiDebugTrace, isDarkMode, onBack: _onBack, onClose, onAdvancedMode, onTriggerAiFill }) => {
  // Use server-returned system prompt if available, otherwise canonical fallback
  const aiSystemPrompt = aiSystemPromptRaw || CANONICAL_SYSTEM_PROMPT;
  const text = isDarkMode ? '#f1f5f9' : '#1e293b';
  const textMuted = isDarkMode ? '#94a3b8' : '#64748b';
  const cardBorder = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(148, 163, 184, 0.15)';
  const accentBlue = colours.highlight;

  // Count only placeholders that have corresponding questionnaire fields (user-fillable)
  const allPlaceholders = content.match(/\{\{([^}]+)\}\}/g) || [];
  const fieldKeys = new Set(Object.keys(fields));
  const remainingPlaceholders = allPlaceholders.filter(p => {
    const key = p.slice(2, -2);
    return fieldKeys.has(key) && !(fields[key] || '').trim();
  }).length;

  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showOpsPanel, setShowOpsPanel] = useState(false);
  const isOpsAdmin = useMemo(() => {
    if (!userInitials) return false;
    return (ADMIN_USERS as readonly string[]).includes(userInitials.toUpperCase());
  }, [userInitials]);
  const [documentMode, setDocumentMode] = useState<'preview' | 'edit'>('preview');
  // showAiTrace removed — replaced by showAiDetails dropdown

  // Boilerplate sections collapse by default — user-relevant sections stay expanded
  const BOILERPLATE = useMemo(() => new Set(['5', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17']), []);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set(['5', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17']));
  const toggleSection = useCallback((id: string) => {
    setCollapsedSections(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  const expandAll = useCallback(() => setCollapsedSections(new Set()), []);
  const collapseBoilerplate = useCallback(() => setCollapsedSections(new Set(['5', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17'])), []);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollToSection = useCallback((id: string) => {
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCollapsedSections(prev => { const n = new Set(prev); n.delete(id); return n; }); // expand if collapsed
  }, []);

  const generateDocx = useCallback(async (): Promise<string | null> => {
    const matterId = matter.matterId || matter.displayNumber;
    if (!matterId) {
      setStatus({ type: 'error', message: 'No matter ID available' });
      return null;
    }
    const resp = await fetch('/api/ccl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matterId, draftJson: fields, initials: userInitials || '' }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Server error' }));
      throw new Error(err.error || 'Failed to generate');
    }
    const data = await resp.json();
    return data.url || null;
  }, [matter, fields, userInitials]);

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    setStatus(null);
    try {
      const url = await generateDocx();
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `CCL-${matter.displayNumber || 'draft'}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setStatus({ type: 'success', message: 'Document downloaded' });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Download failed' });
    } finally {
      setGenerating(false);
    }
  }, [generateDocx, matter.displayNumber]);

  const handleSend = useCallback(async () => {
    setSending(true);
    setStatus(null);
    try {
      const url = await generateDocx();
      if (url) {
        // Stamp CCL date on the matter via /api/ccl-date
        const matterId = matter.matterId || matter.displayNumber;
        fetch('/api/ccl-date', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matterId, date: new Date().toISOString().split('T')[0] }),
        }).catch(() => {}); // fire-and-forget

        // Open mailto with attachment reference
        const clientEmail = matter.clientEmail || '';
        const subject = encodeURIComponent(`Client Care Letter — ${matter.displayNumber || ''}`);
        const body = encodeURIComponent(
          `Dear ${matter.clientName || 'Client'},\n\nPlease find attached your Client Care Letter for your review.\n\nKind regards,\n${fields.name_of_person_handling_matter || 'Helix Law'}`
        );
        window.open(`mailto:${clientEmail}?subject=${subject}&body=${body}`, '_blank');
        setStatus({ type: 'success', message: 'CCL generated — compose your email and attach the downloaded document' });
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Send failed' });
    } finally {
      setSending(false);
    }
  }, [generateDocx, matter, fields.name_of_person_handling_matter]);

  const HELIX_LOGO = 'https://helix-law.co.uk/wp-content/uploads/2025/01/Asset-2@72x.png';
  const HELIX_ADDRESS = 'Helix Law Ltd. Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE';
  const HELIX_PHONE = '0345 314 2044';
  const HELIX_WEB = 'helix-law.com';
  const headingColor = isDarkMode ? '#3690CE' : '#0D2F60';
  const tableBorder = isDarkMode ? 'rgba(54,144,206,0.22)' : 'rgba(13,47,96,0.12)';
  const paperAreaBg = isDarkMode
    ? '#061733'
    : '#c9daea';
  const paperBg = isDarkMode
    ? '#0a1e3a'
    : '#f4f7fb';
  const paperOutline = isDarkMode ? 'rgba(54,144,206,0.35)' : 'rgba(13,47,96,0.22)';

  // ─── Sidebar/editing state (hoisted so parsedSections can reference them) ───
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'sections' | 'fields' | 'presets'>('fields');
  const [showAiDetails, setShowAiDetails] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showTraceModal, setShowTraceModal] = useState(false);
  const [traceTab, setTraceTab] = useState<'overview' | 'data' | 'system' | 'prompt' | 'output'>('overview');

  // ─── Support Report & Integration state ───
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [integrations, setIntegrations] = useState<CclIntegrations | null>(null);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [uploadingClio, setUploadingClio] = useState(false);
  const [uploadingNd, setUploadingNd] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const uploadMenuRef = useRef<HTMLDivElement | null>(null);
  const [showClioConfirm, setShowClioConfirm] = useState(false);

  useEffect(() => {
    if (documentMode === 'preview') {
      setEditingField(null);
      setSidebarOpen(false);
    }
  }, [documentMode]);

  // ─── Handlers: support report, integration check, uploads ───
  const matterId = matter.matterId || matter.displayNumber || '';

  // Demo matter detection — bypass server calls entirely
  const isDemoMatter = matterId === 'DEMO-3311402' || matterId === '3311402' || matter.displayNumber === 'HELIX01-01';

  const handleCheckIntegrations = useCallback(async () => {
    if (!matterId || integrationsLoading) return;
    // Demo matters: inject mock integrations directly (no server call)
    if (isDemoMatter) {
      setIntegrations({
        clio: { available: true, matterId: '3311402', description: 'Admin (demo)' },
        nd: { available: false, workspaceId: null, workspaceName: '' },
      });
      return;
    }
    setIntegrationsLoading(true);
    try {
      const result = await checkCclIntegrations(matterId);
      setIntegrations(result);
    } finally {
      setIntegrationsLoading(false);
    }
  }, [matterId, integrationsLoading, isDemoMatter]);

  // Auto-check integrations on mount (silent — no UI if unavailable)
  useEffect(() => {
    if (matterId && !integrations && !integrationsLoading) {
      handleCheckIntegrations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId]);

  // Close upload menu on click-outside
  useEffect(() => {
    if (!showUploadMenu) return;
    const handler = (e: MouseEvent) => {
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(e.target as Node)) {
        setShowUploadMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showUploadMenu]);

  const handleSubmitSupportTicket = useCallback(async (ticket: CclSupportTicket) => {
    setSupportSubmitting(true);
    try {
      const result = await submitCclSupportTicket({
        ...ticket,
        matterId,
        matterDisplayNumber: matter.displayNumber || '',
        fieldSnapshot: fields,
        aiStatus: aiStatus || undefined,
        aiSource,
        aiDurationMs,
        dataSources: aiDataSources,
        fallbackReason: aiFallbackReason,
        trackingId: aiDebugTrace?.trackingId,
      });
      if (result.ok) {
        setStatus({ type: 'success', message: 'Support ticket submitted — we\'ll investigate shortly' });
        setShowSupportModal(false);
      } else {
        setStatus({ type: 'error', message: result.message || 'Failed to submit ticket' });
      }
    } catch {
      setStatus({ type: 'error', message: 'Failed to submit support ticket' });
    } finally {
      setSupportSubmitting(false);
    }
  }, [matterId, matter.displayNumber, fields, aiStatus, aiSource, aiDurationMs, aiDataSources, aiFallbackReason, aiDebugTrace]);

  const handleUploadClio = useCallback(async () => {
    const clioId = integrations?.clio?.matterId || (isDemoMatter ? '3311402' : null);
    if (!clioId) return;
    setUploadingClio(true);
    try {
      const result = await uploadToClio({
        matterId,
        matterDisplayNumber: matter.displayNumber || '',
        clioMatterId: clioId,
        initials: userInitials,
        fields,
      });
      setStatus(result.ok
        ? { type: 'success', message: isDemoMatter ? 'Uploaded to Clio (HELIX01-01)' : 'Uploaded to Clio matter' }
        : { type: 'error', message: result.error || 'Clio upload failed' });
    } finally {
      setUploadingClio(false);
    }
  }, [matterId, matter.displayNumber, integrations, isDemoMatter, userInitials, fields]);

  const handleUploadNd = useCallback(async () => {
    if (!integrations?.nd?.available || !integrations.nd.workspaceId) return;
    setUploadingNd(true);
    try {
      const result = await uploadToNetDocuments({
        matterId,
        matterDisplayNumber: matter.displayNumber || '',
        ndWorkspaceId: integrations.nd.workspaceId,
      });
      setStatus(result.ok
        ? { type: 'success', message: 'Uploaded to NetDocuments' }
        : { type: 'error', message: result.error || 'ND upload not yet available (coming soon)' });
    } finally {
      setUploadingNd(false);
    }
  }, [matterId, matter.displayNumber, integrations]);

  const AUTO_FILL_KEYS = useMemo(() => new Set([
    'insert_clients_name', 'name_of_person_handling_matter', 'name_of_handler',
    'handler', 'email', 'fee_earner_email', 'fee_earner_phone',
    'fee_earner_postal_address', 'name', 'status', 'handler_hourly_rate',
    'contact_details_for_marketing_opt_out', 'matter', 'matter_number',
    'insert_heading_eg_matter_description', 'costs_other_party_paragraph',
    'identify_the_other_party_eg_your_opponents',
    'names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries',
  ]), []);

  const fieldProvenance = useMemo(() => {
    const result: Record<string, 'ai' | 'auto-fill' | 'user' | 'default' | 'empty'> = {};
    for (const key of Object.keys(fields)) {
      const val = (fields[key] || '').trim();
      if (!val) { result[key] = 'empty'; continue; }
      if (userEditedKeys?.has(key)) { result[key] = 'user'; continue; }
      if (aiStatus === 'complete' && !AUTO_FILL_KEYS.has(key)) { result[key] = 'ai'; continue; }
      if (AUTO_FILL_KEYS.has(key)) { result[key] = 'auto-fill'; continue; }
      result[key] = 'default';
    }
    return result;
  }, [fields, aiStatus, AUTO_FILL_KEYS, userEditedKeys]);

  const provColours = useMemo(() => ({
    ai: { border: accentBlue, bg: isDarkMode ? 'rgba(54,144,206,0.06)' : 'rgba(54,144,206,0.04)', bgHover: isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.08)' },
    'auto-fill': { border: accentBlue, bg: isDarkMode ? 'rgba(54,144,206,0.06)' : 'rgba(54,144,206,0.04)', bgHover: isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.08)' },
    empty: { border: isDarkMode ? 'rgba(234,179,8,0.5)' : 'rgba(234,179,8,0.6)', bg: isDarkMode ? 'rgba(234,179,8,0.04)' : 'rgba(234,179,8,0.03)', bgHover: isDarkMode ? 'rgba(234,179,8,0.1)' : 'rgba(234,179,8,0.08)' },
    default: { border: isDarkMode ? 'rgba(148,163,184,0.3)' : 'rgba(148,163,184,0.25)', bg: 'transparent', bgHover: isDarkMode ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.05)' },
    user: { border: isDarkMode ? colours.blue : colours.missedBlue, bg: isDarkMode ? 'rgba(54,144,206,0.06)' : 'rgba(13,47,96,0.04)', bgHover: isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(13,47,96,0.08)' },
  }), [isDarkMode, accentBlue]);

  // Use template with placeholders for the A4 surface (inline-editable fields).
  // Fall back to fully-substituted content if templateContent not provided.
  const documentSource = (templateContent || content).replace(/\n{3,}/g, '\n\n');
  // Fully-substituted content is still used for print/PDF (no placeholders).
  const cleanedContent = content.replace(/\{\{[^}]+\}\}/g, '').replace(/\n{3,}/g, '\n\n');

  // Field label lookup — uses the human-readable labels from CCL_SECTIONS
  const fieldLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    CCL_SECTIONS.forEach(s => s.fields.forEach(f => { map[f.key] = f.label; }));
    return map;
  }, []);

  /** Turn a text fragment that may contain {{field_key}} placeholders into React nodes
   *  with inline-editable, provenance-coloured spans */
  const renderWithFields = useCallback((text: string, keyPrefix: string): React.ReactNode => {
    const placeholderRe = /\{\{([^}]+)\}\}/g;
    if (!placeholderRe.test(text)) return text;
    placeholderRe.lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let partIdx = 0;
    while ((match = placeholderRe.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const fk = match[1];
      const val = fields[fk] || '';
      const prov = fieldProvenance[fk] || 'empty';
      const pc = provColours[prov] || provColours.default;
      const canEdit = documentMode === 'edit' && typeof updateField === 'function';
      const isEditing = canEdit && editingField === fk;

      if (isEditing) {
        // Inline textarea on the document surface — wraps naturally like a real document
        parts.push(
          <textarea
            key={`${keyPrefix}-${fk}-${partIdx}`}
            autoFocus
            value={val}
            onChange={e => {
              updateField?.(fk, e.target.value);
              // Auto-resize height to fit content
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onBlur={() => setEditingField(null)}
            onKeyDown={e => { if (e.key === 'Escape') setEditingField(null); }}
            ref={el => {
              // Auto-size on mount
              if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
            }}
            style={{
              display: 'inline-block', width: '100%', minHeight: 24,
              padding: '4px 6px', borderRadius: 3, fontSize: 'inherit', lineHeight: 'inherit',
              border: `1.5px solid ${pc.border}`,
              background: pc.bg,
              color: text, fontFamily: "'Raleway', inherit", fontWeight: 'inherit', outline: 'none',
              boxShadow: `0 0 0 2px ${pc.bgHover}`,
              resize: 'none', overflow: 'hidden',
              whiteSpace: 'pre-wrap', wordWrap: 'break-word',
            }}
          />
        );
      } else {
        // Final-document preview: render clean text without provenance chrome.
        // Click still enters edit mode for the field.
        parts.push(
          <span
            key={`${keyPrefix}-${fk}-${partIdx}`}
            data-ccl-field={fk}
            onClick={canEdit ? () => setEditingField(fk) : undefined}
            title={canEdit ? 'Click to edit' : undefined}
            style={{
              cursor: canEdit ? 'text' : 'inherit',
            }}
          >
            {val}
          </span>
        );
      }
      lastIndex = match.index + match[0].length;
      partIdx++;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return <>{parts}</>;
  }, [fields, fieldProvenance, provColours, editingField, updateField, documentMode]);

  /** Parse template text into grouped sections for collapsible rendering */
  const parsedSections = useMemo((): PreviewSection[] => {
    const lines = documentSource.split('\n');
    const sections: PreviewSection[] = [];
    let current: PreviewSection = { id: 'intro', number: '', title: '', elements: [], isSubsection: false };
    let key = 0;
    let i = 0;

    // Patterns
    const sectionRe = /^(\d+(?:\.\d+)?)\s+(.+)$/;
    const bulletRe = /^[—–-]\s*(.+)$/;
    const checkboxRe = /^☐\s*(.+)$/;
    const tableRowRe = /^.+\|.+$/;

    while (i < lines.length) {
      const line = lines[i].trimEnd();

      // Skip empty lines
      if (!line.trim()) { i++; continue; }

      // Section heading (e.g. "1 Contact details" or "4.1 Our charges")
      const sectionMatch = line.match(sectionRe);
      if (sectionMatch) {
        // Finalise current section
        if (current.elements.length > 0 || current.id === 'intro') {
          sections.push(current);
        }
        const [, num, title] = sectionMatch;
        const isSubsection = num.includes('.');
        current = { id: num, number: num, title, elements: [], isSubsection };
        i++;
        continue;
      }

      // Bullet group (—, –, or -) — collect across blank-line gaps
      if (bulletRe.test(line)) {
        const bullets: string[] = [];
        while (i < lines.length) {
          const bl = lines[i].trimEnd();
          if (bulletRe.test(bl)) {
            const m = bl.match(bulletRe);
            if (m) bullets.push(m[1]);
            i++;
          } else if (!bl.trim()) {
            // Blank line — peek ahead for more bullets
            let peek = i + 1;
            while (peek < lines.length && !lines[peek].trim()) peek++;
            if (peek < lines.length && bulletRe.test(lines[peek].trimEnd())) {
              i = peek; // skip blanks, continue collecting
            } else {
              break;
            }
          } else {
            break;
          }
        }
        current.elements.push(
          <ul key={key++} style={{
            margin: '6px 0 10px 8px',
            paddingLeft: 20,
            listStyleType: 'none',
          }}>
            {bullets.map((b, bi) => (
              <li key={bi} style={{
                position: 'relative',
                paddingLeft: 16,
                marginBottom: 5,
                lineHeight: 1.7,
              }}>
                <span style={{
                  position: 'absolute', left: 0, top: '0.55em',
                  width: 5, height: 5, borderRadius: '50%',
                  background: accentBlue, display: 'inline-block',
                }} />
                {renderWithFields(b, `bullet-${bi}`)}
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Checkbox items (☐) — collect across blank-line gaps
      if (checkboxRe.test(line)) {
        const items: { action: string; info: string }[] = [];
        while (i < lines.length) {
          const cl = lines[i].trimEnd();
          if (checkboxRe.test(cl)) {
            const raw = cl.replace(/^☐\s*/, '');
            const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
            items.push({ action: parts[0] || '', info: parts[1] || '' });
            i++;
          } else if (!cl.trim()) {
            let peek = i + 1;
            while (peek < lines.length && !lines[peek].trim()) peek++;
            if (peek < lines.length && checkboxRe.test(lines[peek].trimEnd())) {
              i = peek;
            } else {
              break;
            }
          } else {
            break;
          }
        }
        current.elements.push(
          <div key={key++} style={{ margin: '8px 0 12px 0' }}>
            {items.map((item, ci) => (
              <div key={ci} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '10px 14px',
                marginBottom: 6,
                background: isDarkMode ? 'rgba(54,144,206,0.06)' : '#f8fafc',
                borderRadius: 4,
                borderLeft: `3px solid ${accentBlue}`,
                fontSize: 12, lineHeight: 1.6,
              }}>
                <span style={{
                  flexShrink: 0, marginTop: 3,
                  width: 14, height: 14, borderRadius: 3,
                  border: `1.5px solid ${isDarkMode ? '#475569' : '#cbd5e1'}`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }} />
                <div style={{ flex: 1, color: text }}>
                  <span style={{ fontWeight: 600 }}>{renderWithFields(item.action, `cb-a-${ci}`)}</span>
                  {item.info && (
                    <div style={{ color: textMuted, fontSize: 11, marginTop: 3 }}>{renderWithFields(item.info, `cb-i-${ci}`)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
        continue;
      }

      // Table rows — detect checklist-header pattern (header row + ☐ rows)
      if (tableRowRe.test(line)) {
        // Peek ahead: if next non-empty line is a checkbox, render as action checklist
        let peekIdx = i + 1;
        while (peekIdx < lines.length && !lines[peekIdx].trim()) peekIdx++;
        if (peekIdx < lines.length && checkboxRe.test(lines[peekIdx].trimEnd())) {
          const headers = line.split('|').map(s => s.trim());
          i++; // skip header line
          const items: { action: string; info: string }[] = [];
          while (i < lines.length) {
            const cl = lines[i].trimEnd();
            if (checkboxRe.test(cl)) {
              const raw = cl.replace(/^☐\s*/, '');
              const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
              items.push({ action: parts[0] || '', info: parts[1] || '' });
              i++;
            } else if (!cl.trim()) {
              let pk = i + 1;
              while (pk < lines.length && !lines[pk].trim()) pk++;
              if (pk < lines.length && checkboxRe.test(lines[pk].trimEnd())) { i = pk; } else { break; }
            } else { break; }
          }
          current.elements.push(
            <table key={key++} style={{
              width: '100%', borderCollapse: 'collapse',
              margin: '10px 0 14px', fontSize: 12, color: text,
            }}>
              <thead>
                <tr>
                  <th style={{ width: 24 }} />
                  {headers.map((h, hi) => (
                    <th key={hi} style={{
                      textAlign: 'left', padding: '6px 12px',
                      borderBottom: `2px solid ${headingColor}`,
                      fontWeight: 700, fontSize: 11,
                      color: headingColor, textTransform: 'uppercase' as const,
                      letterSpacing: '0.03em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, ci) => (
                  <tr key={ci}>
                    <td style={{
                      padding: '10px 4px 10px 12px', verticalAlign: 'top',
                      borderBottom: `1px solid ${tableBorder}`,
                    }}>
                      <span style={{
                        display: 'inline-block', width: 14, height: 14, borderRadius: 3,
                        border: `1.5px solid ${isDarkMode ? '#475569' : '#cbd5e1'}`,
                      }} />
                    </td>
                    <td style={{
                      padding: '10px 12px', verticalAlign: 'top',
                      borderBottom: `1px solid ${tableBorder}`,
                      fontWeight: 600, color: text,
                    }}>{renderWithFields(item.action, `tbl-a-${ci}`)}</td>
                    {item.info ? (
                      <td style={{
                        padding: '10px 12px', verticalAlign: 'top',
                        borderBottom: `1px solid ${tableBorder}`,
                        color: textMuted, fontSize: 11,
                      }}>{renderWithFields(item.info, `tbl-i-${ci}`)}</td>
                    ) : <td style={{ borderBottom: `1px solid ${tableBorder}` }} />}
                  </tr>
                ))}
              </tbody>
            </table>
          );
          continue;
        }

        // Regular table (no ☐ rows following)
        const rows: string[][] = [];
        while (i < lines.length && tableRowRe.test(lines[i].trimEnd()) && !checkboxRe.test(lines[i].trimEnd())) {
          rows.push(lines[i].trimEnd().split('|').map(s => s.trim()));
          i++;
        }
        if (rows.length > 0) {
          const [header, ...body] = rows;
          current.elements.push(
            <table key={key++} style={{
              width: '100%', borderCollapse: 'collapse',
              margin: '8px 0 12px 0', fontSize: 12, color: text,
            }}>
              <thead>
                <tr>
                  {header.map((cell, ci) => (
                    <th key={ci} style={{
                      textAlign: 'left', padding: '8px 12px',
                      borderBottom: `2px solid ${headingColor}`,
                      fontWeight: 700, fontSize: 11,
                      color: headingColor, textTransform: 'uppercase' as const,
                      letterSpacing: '0.03em',
                    }}>{cell}</th>
                  ))}
                </tr>
              </thead>
              {body.length > 0 && (
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{
                          padding: '6px 12px',
                          borderBottom: `1px solid ${tableBorder}`,
                          verticalAlign: 'top', color: text,
                        }}>{renderWithFields(cell, `cell-${ri}-${ci}`)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          );
          continue;
        }
      }

      // Regular paragraph — collect consecutive non-empty, non-special lines
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !sectionRe.test(lines[i].trimEnd()) &&
        !bulletRe.test(lines[i].trimEnd()) &&
        !checkboxRe.test(lines[i].trimEnd()) &&
        !tableRowRe.test(lines[i].trimEnd())
      ) {
        paraLines.push(lines[i].trimEnd());
        i++;
      }
      if (paraLines.length > 0) {
        const paraText = paraLines.join('\n');
        // Check if it's the "Dear..." greeting
        const isGreeting = paraText.startsWith('Dear ');
        // Check if it's "Kind regards" / closing
        const isClosing = /^(Kind regards|Yours sincerely|Yours faithfully|Please contact me)/i.test(paraText);
        current.elements.push(
          <p key={key++} style={{
            margin: '0 0 10px 0',
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            ...(isGreeting ? { fontWeight: 600, marginBottom: 14 } : {}),
            ...(isClosing ? { marginTop: 18 } : {}),
          }}>
            {renderWithFields(paraText, `p-${key}`)}
          </p>
        );
      }
    }
    // Finalise last section
    if (current.elements.length > 0) sections.push(current);
    return sections;
  }, [documentSource, isDarkMode, headingColor, tableBorder, textMuted, accentBlue, text, renderWithFields, fields]);

  const handlePrintPdf = useCallback(() => {
    const printWindow = window.open('', '_blank', 'width=800,height=1000');
    if (!printWindow) {
      setStatus({ type: 'error', message: 'Pop-up blocked — allow pop-ups and try again' });
      return;
    }

    // Parse content into structured HTML for PDF
    const lines = cleanedContent.split('\n');
    let htmlBody = '';
    let idx = 0;
    const sectionRe = /^(\d+(?:\.\d+)?)\s+(.+)$/;
    const bulletRe = /^[—–-]\s*(.+)$/;
    const checkboxRe = /^☐\s*(.+)$/;
    const tableRowRe = /^.+\|.+$/;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    while (idx < lines.length) {
      const line = lines[idx].trimEnd();
      if (!line.trim()) { idx++; continue; }

      const sm = line.match(sectionRe);
      if (sm) {
        const isSub = sm[1].includes('.');
        htmlBody += `<h${isSub ? '3' : '2'} class="${isSub ? 'sub' : 'sec'}">${esc(sm[1])}&ensp;${esc(sm[2])}</h${isSub ? '3' : '2'}>`;
        idx++; continue;
      }

      if (bulletRe.test(line)) {
        htmlBody += '<ul>';
        while (idx < lines.length) {
          const bl = lines[idx].trimEnd();
          if (bulletRe.test(bl)) {
            const m = bl.match(bulletRe);
            if (m) htmlBody += `<li>${esc(m[1])}</li>`;
            idx++;
          } else if (!bl.trim()) {
            let peek = idx + 1;
            while (peek < lines.length && !lines[peek].trim()) peek++;
            if (peek < lines.length && bulletRe.test(lines[peek].trimEnd())) {
              idx = peek;
            } else { break; }
          } else { break; }
        }
        htmlBody += '</ul>';
        continue;
      }

      if (checkboxRe.test(line)) {
        htmlBody += '<table class="checklist"><tbody>';
        while (idx < lines.length) {
          const cl = lines[idx].trimEnd();
          if (checkboxRe.test(cl)) {
            const raw = cl.replace(/^☐\s*/, '');
            const parts = raw.split('|').map((s: string) => s.trim());
            htmlBody += `<tr><td class="cb"></td><td><strong>${esc(parts[0])}</strong>${parts[1] ? `<br><span class="muted">${esc(parts[1])}</span>` : ''}</td></tr>`;
            idx++;
          } else if (!cl.trim()) {
            let peek = idx + 1;
            while (peek < lines.length && !lines[peek].trim()) peek++;
            if (peek < lines.length && checkboxRe.test(lines[peek].trimEnd())) { idx = peek; } else { break; }
          } else { break; }
        }
        htmlBody += '</tbody></table>';
        continue;
      }

      if (tableRowRe.test(line)) {
        // Peek ahead: if next non-empty line is a checkbox, render as action checklist
        let peekIdx = idx + 1;
        while (peekIdx < lines.length && !lines[peekIdx].trim()) peekIdx++;
        if (peekIdx < lines.length && checkboxRe.test(lines[peekIdx].trimEnd())) {
          const headers = line.split('|').map((s: string) => s.trim());
          idx++; // skip header
          htmlBody += '<table class="checklist"><thead><tr><th class="cb"></th>';
          headers.forEach(h => { htmlBody += `<th>${esc(h)}</th>`; });
          htmlBody += '</tr></thead><tbody>';
          while (idx < lines.length) {
            const cl = lines[idx].trimEnd();
            if (checkboxRe.test(cl)) {
              const raw = cl.replace(/^☐\s*/, '');
              const parts = raw.split('|').map((s: string) => s.trim());
              htmlBody += `<tr><td class="cb"></td><td><strong>${esc(parts[0])}</strong></td>${parts[1] ? `<td class="muted">${esc(parts[1])}</td>` : '<td></td>'}</tr>`;
              idx++;
            } else if (!cl.trim()) {
              let pk = idx + 1;
              while (pk < lines.length && !lines[pk].trim()) pk++;
              if (pk < lines.length && checkboxRe.test(lines[pk].trimEnd())) { idx = pk; } else { break; }
            } else { break; }
          }
          htmlBody += '</tbody></table>';
          continue;
        }

        // Regular table
        const rows: string[][] = [];
        while (idx < lines.length && tableRowRe.test(lines[idx].trimEnd()) && !checkboxRe.test(lines[idx].trimEnd())) {
          rows.push(lines[idx].trimEnd().split('|').map((s: string) => s.trim()));
          idx++;
        }
        if (rows.length > 0) {
          const [header, ...body] = rows;
          htmlBody += '<table class="data"><thead><tr>';
          header.forEach(c => { htmlBody += `<th>${esc(c)}</th>`; });
          htmlBody += '</tr></thead>';
          if (body.length) {
            htmlBody += '<tbody>';
            body.forEach(r => { htmlBody += '<tr>'; r.forEach(c => { htmlBody += `<td>${esc(c)}</td>`; }); htmlBody += '</tr>'; });
            htmlBody += '</tbody>';
          }
          htmlBody += '</table>';
        }
        continue;
      }

      // Paragraph
      const pLines: string[] = [];
      while (idx < lines.length && lines[idx].trim() && !sectionRe.test(lines[idx].trimEnd()) && !bulletRe.test(lines[idx].trimEnd()) && !checkboxRe.test(lines[idx].trimEnd()) && !tableRowRe.test(lines[idx].trimEnd())) {
        pLines.push(lines[idx].trimEnd());
        idx++;
      }
      if (pLines.length) {
        const pt = esc(pLines.join('\n'));
        const cls = pt.startsWith('Dear ') ? ' class="greeting"' : (/^(Please contact me|Kind regards|Yours)/i.test(pt) ? ' class="closing"' : '');
        htmlBody += `<p${cls}>${pt.replace(/\n/g, '<br>')}</p>`;
      }
    }

    printWindow.document.write(`<!DOCTYPE html><html><head><title>CCL — ${matter.displayNumber || 'Draft'}</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { margin: 20mm 22mm 24mm 22mm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Raleway', Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.65; color: #061733; padding: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20pt; padding-bottom: 14pt; border-bottom: 1.5pt solid #0D2F60; }
  .header .logo img { width: 180px; height: auto; }
  .header .logo .addr { font-size: 7.5pt; color: #64748b; line-height: 1.5; margin-top: 6pt; }
  .header .details { text-align: right; font-size: 8.5pt; color: #64748b; line-height: 1.5; }
  .header .details .ref { font-size: 9pt; font-weight: 700; color: #0D2F60; margin-bottom: 4pt; }
  h2.sec { font-size: 11pt; font-weight: 700; color: #0D2F60; margin: 14pt 0 4pt; }
  h3.sub { font-size: 10pt; font-weight: 700; color: #0D2F60; margin: 10pt 0 3pt; padding-left: 14pt; }
  p { margin: 0 0 8pt; line-height: 1.65; padding-left: 14pt; }
  p.greeting { font-weight: 600; margin-bottom: 12pt; padding-left: 0; }
  p.closing { margin-top: 14pt; padding-left: 0; }
  ul { margin: 4pt 0 8pt 14pt; padding-left: 18pt; list-style: none; }
  ul li { position: relative; padding-left: 14pt; margin-bottom: 4pt; line-height: 1.7; }
  ul li::before { content: ''; position: absolute; left: 0; top: 0.55em; width: 4pt; height: 4pt; border-radius: 50%; background: #3690CE; }
  table.data { width: calc(100% - 14pt); margin-left: 14pt; border-collapse: collapse; margin-top: 6pt; margin-bottom: 10pt; font-size: 9.5pt; }
  table.data th { text-align: left; padding: 6pt 10pt; border-bottom: 1.5pt solid #0D2F60; font-weight: 700; font-size: 9pt; color: #0D2F60; text-transform: uppercase; letter-spacing: 0.03em; }
  table.data td { padding: 5pt 10pt; border-bottom: 0.5pt solid #e2e8f0; vertical-align: top; }
  table.checklist { width: calc(100% - 14pt); margin-left: 14pt; border-collapse: collapse; margin-top: 6pt; margin-bottom: 10pt; font-size: 10pt; }
  table.checklist th { text-align: left; padding: 8pt 10pt; border-bottom: 1.5pt solid #0D2F60; font-weight: 700; font-size: 9pt; color: #0D2F60; text-transform: uppercase; letter-spacing: 0.03em; }
  table.checklist th.cb { width: 22pt; }
  table.checklist td { padding: 8pt 10pt; border-bottom: 0.5pt solid #e2e8f0; vertical-align: top; }
  table.checklist td.cb { width: 22pt; vertical-align: top; padding-top: 10pt; }
  table.checklist td.cb::after { content: ''; display: inline-block; width: 10pt; height: 10pt; border: 1.2pt solid #94a3b8; border-radius: 2pt; }
  table.checklist .muted { font-size: 9pt; color: #64748b; }
  .footer { margin-top: 20pt; padding-top: 10pt; border-top: 0.5pt solid #e2e8f0; font-size: 7pt; color: #94a3b8; text-align: center; line-height: 1.5; }
  .recipient { margin-bottom: 16pt; font-size: 10pt; line-height: 1.6; }
  .recipient .name { font-weight: 600; margin-bottom: 1pt; }
  .recipient .re { color: #64748b; font-size: 9pt; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="header">
  <div class="logo">
    <img src="${HELIX_LOGO}" alt="Helix Law" />
    <div class="addr">Second Floor, Britannia House<br>21 Station Street, Brighton, BN1 4DE<br>0345 314 2044 · helix-law.com</div>
  </div>
  <div class="details">
    <div class="ref">${matter.displayNumber || ''}</div>
    Client Care Letter<br>${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
  </div>
</div>
<div class="recipient">
  <div class="name">${esc(String(fields.insert_clients_name || matter.clientName || ''))}</div>
  ${(fields.insert_heading_eg_matter_description || matter.description) ? `<div class="re">Re: ${esc(String(fields.insert_heading_eg_matter_description || matter.description || ''))}</div>` : ''}
</div>
${htmlBody}
<div class="footer">Helix Law Ltd is authorised and regulated by the Solicitors Regulation Authority (SRA No. 669720)<br>Registered in England &amp; Wales No. 10346944</div>
</body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 600);
  }, [cleanedContent, matter.displayNumber, matter.clientName, matter.description, fields]);

  // Build field → CCL section mapping for the trace modal
  const fieldSectionMap = useMemo(() => {
    const map: Record<string, { sectionId: string; sectionTitle: string; sectionIcon: string }> = {};
    for (const section of CCL_SECTIONS) {
      for (const field of section.fields) {
        map[field.key] = { sectionId: section.id, sectionTitle: section.title, sectionIcon: section.icon };
      }
    }
    return map;
  }, []);

  // Open sidebar and focus a specific field for editing
  const openFieldEditor = useCallback((fieldKey: string) => {
    setDocumentMode('edit');
    setSidebarOpen(true);
    setSidebarTab('fields');
    // Highlight animation
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedField(fieldKey);
    highlightTimerRef.current = setTimeout(() => setHighlightedField(null), 1500);
    // Small delay so sidebar renders before scroll
    setTimeout(() => {
      const el = document.querySelector(`[data-ccl-qf="${fieldKey}"]`) as HTMLElement | null;
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
    }, 100);
  }, []);

  const QUICK_FIELD_ALIASES: Record<string, string[]> = useMemo(() => ({
    insert_clients_name: ['insert_clients_name', 'client_name', 'clientName', 'client'],
    insert_heading_eg_matter_description: ['insert_heading_eg_matter_description', 'matter', 'matter_description'],
    name_of_person_handling_matter: ['name_of_person_handling_matter', 'name_of_handler', 'handler_name', 'fee_earner'],
    identify_the_other_party_eg_your_opponents: ['identify_the_other_party_eg_your_opponents', 'opponent', 'opponents', 'other_party'],
    figure: ['figure', 'state_amount'],
    next_steps: ['next_steps', 'insert_next_step_you_would_like_client_to_take'],
  }), []);

  const CCL_SECTION_TO_DOC_SECTIONS: Record<string, string[]> = useMemo(() => ({
    client: ['1'],
    handler: ['1'],
    scope: ['2', '3'],
    costs: ['4', '4.1', '4.2', '4.3', '6'],
    actions: ['18'],
  }), []);

  // Sync: when editing a field on the A4 surface AND sidebar is open, highlight in sidebar
  useEffect(() => {
    if (editingField && sidebarOpen) {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      setHighlightedField(editingField);
      highlightTimerRef.current = setTimeout(() => setHighlightedField(null), 1500);
      setTimeout(() => {
        const el = document.querySelector(`[data-ccl-qf="${editingField}"]`) as HTMLElement | null;
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }, [editingField, sidebarOpen]);

  // Scroll the A4 paper to show where a field appears in the document
  const scrollFieldToDocument = useCallback((fieldKey: string) => {
    setDocumentMode('edit');
    setSidebarOpen(true);
    const candidates = QUICK_FIELD_ALIASES[fieldKey] || [fieldKey];
    const cclSectionId = fieldSectionMap[fieldKey]?.sectionId;
    const docSections = cclSectionId ? (CCL_SECTION_TO_DOC_SECTIONS[cclSectionId] || []) : [];

    if (docSections.length > 0) {
      setCollapsedSections(prev => {
        const next = new Set(prev);
        docSections.forEach(sectionId => next.delete(sectionId));
        return next;
      });
    }

    const runJump = () => {
      for (const candidateKey of candidates) {
        const target = document.querySelector(`[data-ccl-field="${candidateKey}"]`) as HTMLElement | null;
        if (target) {
          setEditingField(candidateKey);
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }

      if (docSections.length > 0) {
        const sectionEl = sectionRefs.current[docSections[0]];
        if (sectionEl) {
          sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      openFieldEditor(fieldKey);
      setStatus({ type: 'error', message: `Field not placed in visible letter clause yet: ${fieldLabelMap[fieldKey] || fieldKey}` });
    };

    setTimeout(runJump, 120);
  }, [CCL_SECTION_TO_DOC_SECTIONS, QUICK_FIELD_ALIASES, fieldLabelMap, fieldSectionMap, openFieldEditor]);

  // Inline editable field rendered on the document surface (used by recipient block)
  const InlineField: React.FC<{
    fieldKey: string;
    value: string;
    fallback?: string;
    style?: React.CSSProperties;
    multiline?: boolean;
  }> = useCallback(({ fieldKey, value, fallback, style, multiline }) => {
    const isEditing = editingField === fieldKey;
    const displayValue = value || fallback || '';
    const isEmpty = !value?.trim();
    const prov = fieldProvenance[fieldKey] || 'empty';
    const pc = provColours[prov] || provColours.default;

    if (isEditing) {
      return multiline ? (
        <textarea
          autoFocus
          value={value || ''}
          onChange={e => updateField?.(fieldKey, e.target.value)}
          onBlur={() => setEditingField(null)}
          onKeyDown={e => { if (e.key === 'Escape') setEditingField(null); }}
          rows={3}
          style={{
            ...style,
            width: '100%', resize: 'vertical',
            padding: '4px 6px', borderRadius: 2, fontSize: 'inherit', lineHeight: 'inherit',
            border: `1.5px solid ${pc.border}`,
            background: pc.bg,
            color: text, fontFamily: "'Raleway', inherit", outline: 'none',
            boxShadow: `0 0 0 2px ${pc.bgHover}`,
          }}
        />
      ) : (
        <input
          autoFocus
          type="text"
          value={value || ''}
          onChange={e => updateField?.(fieldKey, e.target.value)}
          onBlur={() => setEditingField(null)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === 'Escape') setEditingField(null);
          }}
          style={{
            ...style,
            padding: '2px 6px', borderRadius: 2, fontSize: 'inherit', lineHeight: 'inherit',
            border: `1.5px solid ${pc.border}`,
            background: pc.bg,
            color: text, fontFamily: "'Raleway', inherit", fontWeight: 'inherit', outline: 'none',
            boxShadow: `0 0 0 2px ${pc.bgHover}`,
            width: Math.max(120, (displayValue.length + 2) * 7.5),
          }}
        />
      );
    }

    return (
      <span
        onClick={() => setEditingField(fieldKey)}
        title={`Click to edit (${prov === 'ai' ? 'AI-generated' : prov === 'auto-fill' ? 'Auto-filled' : prov === 'user' ? 'User-edited' : isEmpty ? 'Empty — click to fill' : 'Default'})`}
        style={{
          ...style,
          cursor: 'text',
          borderBottom: `2px ${isEmpty ? 'dashed' : 'solid'} ${pc.border}`,
          padding: '1px 3px',
          borderRadius: 2,
          background: pc.bg,
          transition: 'all 0.12s ease',
          color: isEmpty ? (isDarkMode ? '#facc15' : '#ca8a04') : 'inherit',
          fontStyle: isEmpty ? 'italic' : 'normal',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = pc.bgHover;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = pc.bg;
        }}
      >
        {isEmpty ? `[${QUICK_FIELDS.find(f => f.key === fieldKey)?.label || fieldKey}]` : displayValue}
      </span>
    );
  }, [editingField, updateField, isDarkMode, accentBlue, text, fieldProvenance, provColours]);

  // Key fields that users most commonly tweak at preview time
  const QUICK_FIELDS: { key: string; label: string; type: 'text' | 'textarea' }[] = useMemo(() => [
    { key: 'insert_clients_name', label: 'Client Name', type: 'text' },
    { key: 'insert_heading_eg_matter_description', label: 'Letter Heading', type: 'text' },
    { key: 'name_of_person_handling_matter', label: 'Handler', type: 'text' },
    { key: 'status', label: 'Handler Status', type: 'text' },
    { key: 'handler_hourly_rate', label: 'Hourly Rate (£)', type: 'text' },
    { key: 'figure', label: 'Payment on Account (£)', type: 'text' },
    { key: 'charges_estimate_paragraph', label: 'Charges Estimate', type: 'textarea' },
    { key: 'insert_current_position_and_scope_of_retainer', label: 'Scope of Work', type: 'textarea' },
    { key: 'next_steps', label: 'Next Steps', type: 'textarea' },
    { key: 'realistic_timescale', label: 'Timescale', type: 'text' },
    { key: 'identify_the_other_party_eg_your_opponents', label: 'Opposing Party', type: 'text' },
    { key: 'disbursements_paragraph', label: 'Disbursements', type: 'textarea' },
    { key: 'costs_other_party_paragraph', label: 'Costs (Other Party)', type: 'textarea' },
  ], []);

  // Clause presets — pre-written clause variants users can swap in
  const CLAUSE_PRESETS = useMemo(() => [
    {
      id: 'costs_no_estimate',
      section: '4',
      label: 'No overall estimate possible',
      description: 'Use when matter scope is too uncertain to estimate total costs.',
      fieldKey: 'we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible',
      value: 'the matter is at an early stage, and the scope of work depends on factors outside our control, including the conduct of the other party.',
    },
    {
      id: 'costs_no_opponent_costs',
      section: '4',
      label: 'No opponent cost risk',
      description: 'Non-contentious matter — no risk of paying other side\'s costs.',
      fieldKey: 'costs_other_party_paragraph',
      value: 'We do not expect that you will have to pay another party\'s costs. This only tends to arise in litigation and is therefore not relevant to your matter.',
    },
    {
      id: 'costs_opponent_risk',
      section: '4',
      label: 'Opponent cost risk warning',
      description: 'Litigation — client may have to pay other party\'s costs.',
      fieldKey: 'costs_other_party_paragraph',
      value: 'There is a risk that you may be ordered to pay {opponent}\'s legal costs if you are unsuccessful. We will advise you on costs risks throughout your matter.',
    },
    {
      id: 'billing_monthly',
      section: '4',
      label: 'Monthly billing',
      description: 'Bill monthly instead of the default interval.',
      fieldKey: 'and_or_intervals_eg_every_three_months',
      value: 'every month',
    },
    {
      id: 'billing_quarterly',
      section: '4',
      label: 'Quarterly billing',
      description: 'Bill every three months.',
      fieldKey: 'and_or_intervals_eg_every_three_months',
      value: 'every three months',
    },
    {
      id: 'billing_stages',
      section: '4',
      label: 'Billing at stages',
      description: 'Bill at completion of each stage of work.',
      fieldKey: 'and_or_intervals_eg_every_three_months',
      value: 'at the completion of each stage of your matter',
    },
    {
      id: 'timescale_complex',
      section: '3',
      label: 'Complex matter timescale',
      description: 'Use for matters expected to take 6+ months.',
      fieldKey: 'realistic_timescale',
      value: '6-12 months, depending on the complexity and the other party\'s engagement',
    },
    {
      id: 'timescale_quick',
      section: '3',
      label: 'Quick turnaround',
      description: 'Straightforward matter — 2-4 weeks.',
      fieldKey: 'realistic_timescale',
      value: '2-4 weeks',
    },
  ], []);

  const applyPreset = useCallback((fieldKey: string, value: string) => {
    if (updateField) {
      let finalValue = value;
      if (finalValue.includes('{opponent}')) {
        finalValue = finalValue.replace('{opponent}', fields.identify_the_other_party_eg_your_opponents || 'the other party');
      }
      updateField(fieldKey, finalValue);
    }
  }, [updateField, fields]);

  // Sidebar section styling helper
  const sidebarSectionStyle = {
    padding: '10px 14px',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.08)' : '#f1f5f9'}`,
  };
  const sidebarLabelStyle = {
    fontSize: 9, fontWeight: 700 as const, color: textMuted,
    textTransform: 'uppercase' as const, letterSpacing: '0.06em',
    marginBottom: 8, display: 'block' as const,
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden', position: 'relative', fontFamily: "'Raleway', Arial, Helvetica, sans-serif" }}>
      {/* Spin animation for AI loading indicator + Raleway import */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;500;600;700&display=swap');
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes cclFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes cclPulseHighlight { 0% { box-shadow: 0 0 0 0 rgba(54,144,206,0.4); } 50% { box-shadow: 0 0 0 4px rgba(54,144,206,0.15); } 100% { box-shadow: 0 0 0 0 rgba(54,144,206,0); } }`}</style>

      {/* ═══ AI Loading Banner (top of page, not overlay) ═══ */}
      {aiStatus === 'loading' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 20px',
          background: isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.04)',
          borderBottom: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(54,144,206,0.12)'}`,
          animation: 'cclFadeIn 0.2s ease',
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
            border: `2.5px solid ${isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(54,144,206,0.15)'}`,
            borderTopColor: accentBlue,
            animation: 'spin 1s linear infinite',
          }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: text }}>Generating your Client Care Letter</div>
            <div style={{ fontSize: 10, color: textMuted, lineHeight: 1.4, marginTop: 2 }}>
              Analysing matter context, pitch emails, call notes and deal data to create a tailored letter...
            </div>
          </div>
        </div>
      )}

      {/* ═══ Toolbar ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 16px',
        borderBottom: `1px solid ${cardBorder}`,
        background: isDarkMode ? '#061733' : '#e8eff7',
        minHeight: 36,
      }}>
        {/* Generate AI Draft button — shown when AI hasn't been triggered yet */}
        {(!aiStatus || aiStatus === 'idle') && onTriggerAiFill && (
          <button type="button" onClick={onTriggerAiFill} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 14px', borderRadius: 3, height: 26,
            background: isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(54,144,206,0.1)',
            border: `1px solid ${accentBlue}`,
            color: accentBlue, fontSize: 10, fontWeight: 700,
            cursor: 'pointer', transition: 'all 0.15s ease',
          }}>
            <Icon iconName="LightningBolt" styles={{ root: { fontSize: 11 } }} />
            Generate AI Draft
          </button>
        )}

        {/* AI status chip */}
        {aiStatus && aiStatus !== 'idle' && aiStatus !== 'loading' && (
          <div
            onClick={() => setShowAiDetails(!showAiDetails)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 12,
              fontSize: 10, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.12s ease',
              background: aiStatus === 'complete'
                ? (isDarkMode ? 'rgba(54,144,206,0.16)' : 'rgba(54,144,206,0.1)')
                : aiStatus === 'partial'
                  ? (isDarkMode ? 'rgba(234,179,8,0.12)' : 'rgba(234,179,8,0.08)')
                  : (isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.08)'),
              color: aiStatus === 'complete'
                ? accentBlue
                : aiStatus === 'partial'
                  ? (isDarkMode ? '#facc15' : '#ca8a04')
                  : textMuted,
              border: `1px solid ${
                aiStatus === 'complete'
                  ? (isDarkMode ? 'rgba(54,144,206,0.32)' : 'rgba(54,144,206,0.2)')
                  : aiStatus === 'partial'
                    ? (isDarkMode ? 'rgba(234,179,8,0.25)' : 'rgba(234,179,8,0.15)')
                    : cardBorder
              }`,
            }}
          >
            <Icon iconName={aiStatus === 'complete' ? 'SkypeCircleCheck' : aiStatus === 'partial' ? 'Warning' : 'Info'} styles={{ root: { fontSize: 10 } }} />
            {aiStatus === 'complete' ? 'AI generated' : aiStatus === 'partial' ? 'AI + defaults' : 'Defaults'}
            {(aiDataSources || []).length > 0 && (
              <span style={{ opacity: 0.7 }}>&middot; {(aiDataSources || []).length} sources</span>
            )}
            <Icon iconName={showAiDetails ? 'ChevronUp' : 'ChevronDown'} styles={{ root: { fontSize: 8, marginLeft: 2 } }} />
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Preview / Edit mode */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', height: 26,
          border: `1px solid ${cardBorder}`, borderRadius: 3, overflow: 'hidden',
          marginRight: 4,
        }}>
          <button
            type="button"
            onClick={() => setDocumentMode('preview')}
            style={{
              border: 'none', padding: '0 10px', height: '100%',
              background: documentMode === 'preview'
                ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)')
                : 'transparent',
              color: documentMode === 'preview' ? accentBlue : text,
              fontSize: 10, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Preview
          </button>
          <div style={{ width: 1, height: '100%', background: cardBorder }} />
          <button
            type="button"
            onClick={() => {
              setDocumentMode('edit');
              setSidebarOpen(true);
            }}
            style={{
              border: 'none', padding: '0 10px', height: '100%',
              background: documentMode === 'edit'
                ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)')
                : 'transparent',
              color: documentMode === 'edit' ? accentBlue : text,
              fontSize: 10, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Edit
          </button>
        </div>

        {/* Ops panel toggle (admin only) */}
        {isOpsAdmin && (
          <button type="button" onClick={() => setShowOpsPanel(!showOpsPanel)} title="CCL Operations Panel" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 3, height: 26,
            background: showOpsPanel ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)') : 'transparent',
            border: `1px solid ${showOpsPanel ? colours.blue : cardBorder}`,
            color: showOpsPanel ? colours.blue : text, fontSize: 10, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.12s ease',
          }}>
            <Icon iconName="Shield" styles={{ root: { fontSize: 10 } }} />
            Ops
          </button>
        )}

        <div style={{ width: 1, height: 16, background: cardBorder, margin: '0 2px' }} />

        {/* Export group — consistent height */}
        <button type="button" onClick={handlePrintPdf} title="Print as PDF" style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 3, height: 26,
          background: 'transparent', border: `1px solid ${cardBorder}`,
          color: text, fontSize: 10, fontWeight: 600,
          cursor: 'pointer', transition: 'all 0.12s ease',
        }}>
          <Icon iconName="PDF" styles={{ root: { fontSize: 10 } }} />
          PDF
        </button>
        <button type="button" onClick={handleDownload} disabled={generating} title="Download .docx" style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 3, height: 26,
          background: 'transparent', border: `1px solid ${cardBorder}`,
          color: text, fontSize: 10, fontWeight: 600,
          cursor: generating ? 'wait' : 'pointer',
          opacity: generating ? 0.6 : 1, transition: 'all 0.12s ease',
        }}>
          <Icon iconName={generating ? 'ProgressRingDots' : 'Download'} styles={{ root: { fontSize: 10 } }} />
          .docx
        </button>
        <button type="button" onClick={handleSend} disabled={sending || remainingPlaceholders > 0}
          title={remainingPlaceholders > 0 ? `Complete ${remainingPlaceholders} field${remainingPlaceholders > 1 ? 's' : ''} before sending` : 'Generate and email'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 14px', borderRadius: 3, height: 26,
            background: remainingPlaceholders > 0 ? (isDarkMode ? 'rgba(148,163,184,0.15)' : '#e2e8f0') : accentBlue,
            color: remainingPlaceholders > 0 ? textMuted : '#fff',
            border: 'none', fontSize: 10, fontWeight: 700,
            textTransform: 'uppercase' as const, letterSpacing: '0.04em',
            cursor: sending || remainingPlaceholders > 0 ? 'not-allowed' : 'pointer',
            opacity: sending ? 0.6 : 1, transition: 'all 0.12s ease',
          }}
        >
          <Icon iconName={sending ? 'ProgressRingDots' : 'Send'} styles={{ root: { fontSize: 10 } }} />
          Send
        </button>

        <div style={{ width: 1, height: 16, background: cardBorder, margin: '0 2px' }} />

        {/* Upload dropdown — always visible, shows Clio/ND availability */}
        <div ref={uploadMenuRef} style={{ position: 'relative' }}>
          <button type="button"
            onClick={() => setShowUploadMenu(!showUploadMenu)}
            title="Upload to Clio or NetDocuments"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 3, height: 26,
              background: showUploadMenu ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)') : 'transparent',
              border: `1px solid ${showUploadMenu ? accentBlue : cardBorder}`,
              color: showUploadMenu ? accentBlue : text, fontSize: 10, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.12s ease',
            }}
          >
            <Icon iconName="CloudUpload" styles={{ root: { fontSize: 10 } }} />
            Upload
            <Icon iconName={showUploadMenu ? 'ChevronUp' : 'ChevronDown'} styles={{ root: { fontSize: 8 } }} />
          </button>

          {showUploadMenu && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              width: 260,
              background: isDarkMode ? '#0f172a' : '#ffffff',
              border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(148,163,184,0.2)'}`,
              borderRadius: 4,
              boxShadow: isDarkMode ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.12)',
              zIndex: 100, overflow: 'hidden',
              animation: 'cclFadeIn 0.1s ease',
            }}>
              <div style={{ padding: '8px 12px', borderBottom: `1px solid ${cardBorder}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                  Upload document to
                </div>
              </div>

              {/* Clio row */}
              <button type="button"
                onClick={() => { setShowUploadMenu(false); setShowClioConfirm(true); }}
                disabled={!(integrations?.clio?.available || isDemoMatter) || uploadingClio}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 12px', border: 'none', cursor: (integrations?.clio?.available || isDemoMatter) ? 'pointer' : 'default',
                  background: 'transparent', textAlign: 'left' as const,
                  opacity: (integrations?.clio?.available || isDemoMatter) ? 1 : 0.5,
                  transition: 'background 0.1s ease',
                }}
                onMouseEnter={(e) => { if (integrations?.clio?.available || isDemoMatter) e.currentTarget.style.background = isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isDarkMode ? 'rgba(96,165,250,0.1)' : 'rgba(37,99,235,0.06)',
                  border: `1px solid ${isDarkMode ? 'rgba(96,165,250,0.2)' : 'rgba(37,99,235,0.12)'}`,
                }}>
                  <Icon iconName="CloudUpload" styles={{ root: { fontSize: 12, color: isDarkMode ? '#60a5fa' : '#2563eb' } }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: text }}>Clio</div>
                  <div style={{ fontSize: 9, color: textMuted, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {integrationsLoading ? 'Checking...'
                      : (integrations?.clio?.available || isDemoMatter) ? `Matter: ${integrations?.clio?.description || 'Admin (demo)'}`
                      : integrations ? 'No matching matter found' : 'Checking availability...'}
                  </div>
                </div>
                {(integrations?.clio?.available || isDemoMatter) && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: accentBlue, flexShrink: 0 }} />
                )}
              </button>

              {/* ND row */}
              <button type="button"
                onClick={() => { setShowUploadMenu(false); handleUploadNd(); }}
                disabled={!integrations?.nd?.available || uploadingNd}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 12px', border: 'none', cursor: integrations?.nd?.available ? 'pointer' : 'default',
                  background: 'transparent', textAlign: 'left' as const,
                  opacity: integrations?.nd?.available ? 1 : 0.5,
                  transition: 'background 0.1s ease',
                  borderTop: `1px solid ${cardBorder}`,
                }}
                onMouseEnter={(e) => { if (integrations?.nd?.available) e.currentTarget.style.background = isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.04)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isDarkMode ? 'rgba(96,165,250,0.1)' : 'rgba(37,99,235,0.06)',
                  border: `1px solid ${isDarkMode ? 'rgba(96,165,250,0.2)' : 'rgba(37,99,235,0.12)'}`,
                }}>
                  <Icon iconName="CloudUpload" styles={{ root: { fontSize: 12, color: isDarkMode ? '#60a5fa' : '#2563eb' } }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: text }}>NetDocuments</div>
                  <div style={{ fontSize: 9, color: textMuted, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {integrationsLoading ? 'Checking...'
                      : integrations?.nd?.available ? `Workspace: ${integrations.nd.workspaceName || matterId}`
                      : integrations ? 'No matching workspace found' : 'Checking availability...'}
                  </div>
                </div>
                {integrations?.nd?.available && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: colours.highlight, flexShrink: 0 }} />
                )}
              </button>

              {/* Footer note */}
              <div style={{
                padding: '6px 12px', borderTop: `1px solid ${cardBorder}`,
                fontSize: 9, color: textMuted, lineHeight: 1.4,
                background: isDarkMode ? 'rgba(15,23,42,0.5)' : 'rgba(248,250,252,0.8)',
              }}>
                Upload requires a generated .docx. Clio upload is live; NetDocuments coming soon.
              </div>
            </div>
          )}
        </div>

        {/* Utility icons — consistent 26×26, muted */}
        <div style={{ width: 1, height: 16, background: cardBorder, margin: '0 2px' }} />
        <button type="button" onClick={() => setShowTraceModal(true)} title="AI processing trace"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 3,
            background: 'transparent', border: 'none',
            color: textMuted, cursor: 'pointer', transition: 'color 0.12s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = accentBlue; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = textMuted; }}
        >
          <Icon iconName="TestBeaker" styles={{ root: { fontSize: 12 } }} />
        </button>
        <button type="button" onClick={() => setShowSupportModal(true)} title="Report an issue"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 3,
            background: 'transparent', border: 'none',
            color: textMuted, cursor: 'pointer', transition: 'color 0.12s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = isDarkMode ? '#f87171' : '#dc2626'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = textMuted; }}
        >
          <Icon iconName="Feedback" styles={{ root: { fontSize: 12 } }} />
        </button>
      </div>

      {/* ═══ AI Details Dropdown (below toolbar) ═══ */}
      {showAiDetails && aiStatus && aiStatus !== 'idle' && aiStatus !== 'loading' && (
        <div style={{
          padding: '10px 16px',
          borderBottom: `1px solid ${cardBorder}`,
          background: isDarkMode ? 'rgba(15,23,42,0.6)' : 'rgba(248,250,252,0.9)',
          fontSize: 11, lineHeight: 1.5, color: textMuted,
          animation: 'cclFadeIn 0.15s ease',
          display: 'flex', flexWrap: 'wrap' as const, gap: 16, alignItems: 'flex-start',
        }}>
          <div style={{ minWidth: 180 }}>
            <div style={{ fontWeight: 700, color: text, marginBottom: 4 }}>
              {aiStatus === 'complete' ? 'AI draft complete' : aiStatus === 'partial' ? 'AI draft (partial — merged with defaults)' : 'Practice area defaults applied'}
            </div>
            {aiDurationMs ? <div>Generated in {((aiDurationMs || 0) / 1000).toFixed(1)}s</div> : null}
            {aiDebugTrace?.deployment && <div>Deployment: {aiDebugTrace.deployment}</div>}
            {aiDebugTrace?.trackingId && <div>Tracking: {aiDebugTrace.trackingId}</div>}
            {(aiFallbackReason || aiDebugTrace?.error) && (
              <div style={{ color: isDarkMode ? '#f0a090' : colours.cta, marginTop: 4 }}>
                {aiFallbackReason || aiDebugTrace?.error}
              </div>
            )}
          </div>
          {(aiDataSources || []).length > 0 && (
            <div style={{ minWidth: 160 }}>
              <div style={{ fontWeight: 700, color: text, marginBottom: 4 }}>Data sources</div>
              {(aiDataSources || []).map((source, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '1px 0' }}>
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: accentBlue, flexShrink: 0 }} />
                  {source}
                </div>
              ))}
            </div>
          )}
          {/* Feedback inline */}
          <div style={{ minWidth: 120 }}>
            <AiFeedbackWidget
              matterId={matter.matterId || matter.displayNumber || ''}
              aiStatus={aiStatus}
              dataSources={aiDataSources || []}
              contextSummary={aiContextSummary || ''}
              isDarkMode={isDarkMode}
              text={text}
              textMuted={textMuted}
              cardBorder={cardBorder}
              accentBlue={accentBlue}
            />
          </div>
        </div>
      )}

      {/* ═══ Main Layout — Document + optional sidebar ═══ */}
      <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden', minHeight: 0 }}>

        {/* ═══ A4 Paper — full width when sidebar closed ═══ */}
        <div style={{
          flex: 1, overflow: 'auto',
          background: paperAreaBg,
          padding: '24px 20px 24px 24px',
          display: 'flex', justifyContent: 'center',
          transition: 'all 0.2s ease',
        }}>
          <div style={{
            width: 794,
            minHeight: 1123,
            flexShrink: 0,
            background: paperBg,
            boxShadow: isDarkMode
              ? `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px ${paperOutline}`
              : `0 3px 18px rgba(0,0,0,0.12), 0 0 0 1px ${paperOutline}`,
            padding: '56px 64px 48px 64px',
            fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
            fontSize: 13, lineHeight: 1.7,
            color: isDarkMode ? '#e2e8f0' : '#061733',
            position: 'relative' as const,
            animation: aiStatus !== 'loading' ? 'cclFadeIn 0.3s ease' : 'none',
          }}>
            {/* Letterhead */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              marginBottom: 28, paddingBottom: 16,
              borderBottom: `1.5px solid ${isDarkMode ? 'rgba(54,144,206,0.4)' : '#0D2F60'}`,
            }}>
              <div>
                <img src={HELIX_LOGO} alt="Helix Law" style={{ width: 170, height: 'auto', display: 'block' }} />
                <div style={{ fontSize: 8.5, color: textMuted, lineHeight: 1.5, marginTop: 8 }}>
                  Second Floor, Britannia House<br />21 Station Street, Brighton, BN1 4DE<br />0345 314 2044 · helix-law.com
                </div>
              </div>
              <div style={{ textAlign: 'right' as const, fontSize: 10.5, lineHeight: 1.5, color: textMuted }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? '#94a3b8' : '#0D2F60', marginBottom: 2 }}>
                  {matter.displayNumber}
                </div>
                <div>Client Care Letter</div>
                <div>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
            </div>

            {/* Recipient block — inline editable */}
            <div style={{ marginBottom: 24, fontSize: 12.5, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                <InlineField
                  fieldKey="insert_clients_name"
                  value={fields.insert_clients_name || ''}
                  fallback={matter.clientName || ''}
                  style={{ fontWeight: 600 }}
                />
              </div>
              <div style={{ color: textMuted, fontSize: 11 }}>
                Re: <InlineField
                  fieldKey="insert_heading_eg_matter_description"
                  value={fields.insert_heading_eg_matter_description || ''}
                  fallback={matter.description || ''}
                  style={{ fontSize: 11 }}
                />
              </div>
            </div>

            {/* Letter body — clean document surface for Preview/Edit modes */}
            <div>
              {parsedSections.map(section => {
                // The intro section contains "Dear {{name}}", "{{heading}}", and "Thank you..."
                // The recipient block above already renders name + heading with better styling,
                // so we skip the first 2 elements (greeting + heading) but keep the rest (e.g. "Thank you...")
                if (section.id === 'intro') {
                  const remaining = section.elements.slice(2);
                  return remaining.length > 0 ? <div key="intro">{remaining}</div> : null;
                }
                return (
                  <div key={section.id} ref={el => { sectionRefs.current[section.number] = el; }} style={{ marginBottom: 10 }}>
                    <div style={{
                      marginTop: section.isSubsection ? 8 : 16,
                      marginBottom: 4,
                      fontSize: section.isSubsection ? 13 : 14,
                      fontWeight: 700,
                      color: headingColor,
                      letterSpacing: '0.01em',
                    }}>
                      {section.number}&ensp;{section.title}
                    </div>
                    <div style={{ paddingLeft: section.isSubsection ? 28 : 20, marginTop: 2 }}>{section.elements}</div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{
              marginTop: 28, paddingTop: 14,
              borderTop: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.15)' : '#e2e8f0'}`,
              fontSize: 8, color: isDarkMode ? '#475569' : '#94a3b8',
              textAlign: 'center' as const, lineHeight: 1.5,
            }}>
              <div>Helix Law Ltd is authorised and regulated by the Solicitors Regulation Authority (SRA No. 669720)</div>
              <div>Registered in England & Wales No. 10346944</div>
            </div>
          </div>{/* end A4 paper */}
        </div>{/* end paper scroll area */}

        {/* ═══ Slide-out Sidebar (hidden by default) ═══ */}
        {sidebarOpen && (
          <div style={{
            width: 320, flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            background: isDarkMode ? '#071a36' : '#f0f4f9',
            borderLeft: `1px solid ${cardBorder}`,
            overflow: 'hidden',
            animation: 'cclFadeIn 0.15s ease',
          }}>
            {/* Sidebar tabs */}
            <div style={{
              display: 'flex', gap: 2, padding: '6px 6px 0',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.08)' : '#f1f5f9'}`,
            }}>
              {([
                { id: 'fields' as const, icon: 'Edit', label: 'Quick Edit', badge: remainingPlaceholders > 0 ? remainingPlaceholders : null },
                { id: 'sections' as const, icon: 'BulletedList2', label: 'Sections', badge: null },
                { id: 'presets' as const, icon: 'Library', label: 'Presets', badge: null },
              ] as const).map(tab => {
                const isActive = sidebarTab === tab.id;
                return (
                  <button key={tab.id} type="button" onClick={() => setSidebarTab(tab.id)} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    padding: '9px 6px 8px', fontSize: 10, fontWeight: 700,
                    border: 'none',
                    borderBottom: isActive ? `2px solid ${accentBlue}` : '2px solid transparent',
                    borderRadius: isActive ? '4px 4px 0 0' : 0,
                    background: isActive
                      ? (isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.04)')
                      : 'transparent',
                    color: isActive ? accentBlue : textMuted,
                    cursor: 'pointer', transition: 'all 0.12s ease',
                    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                    position: 'relative',
                  }}>
                    <Icon iconName={tab.icon} styles={{ root: { fontSize: 12 } }} />
                    {tab.label}
                    {tab.badge != null && (
                      <span style={{
                        fontSize: 8, fontWeight: 800, lineHeight: 1,
                        padding: '2px 5px', borderRadius: 8, marginLeft: 2,
                        background: isDarkMode ? 'rgba(234,179,8,0.2)' : 'rgba(234,179,8,0.15)',
                        color: isDarkMode ? '#facc15' : '#ca8a04',
                      }}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Sidebar content */}
            <div style={{ flex: 1, overflow: 'auto' }}>

              {/* ── Quick Edit tab (now default) ── */}
              {sidebarTab === 'fields' && (
                <div style={{ padding: '6px 0' }}>
                  <div style={{ padding: '4px 14px 8px', fontSize: 10, color: textMuted, lineHeight: 1.4 }}>
                    Changes update the letter in real time. Click <Icon iconName="NavigateForward" styles={{ root: { fontSize: 9, verticalAlign: 'middle' } }} /> to jump to the field in the document.
                  </div>
                  {CCL_SECTIONS.map(section => {
                    const sectionFields = QUICK_FIELDS.filter(f =>
                      section.fields.some(sf => sf.key === f.key)
                    );
                    if (sectionFields.length === 0) return null;
                    const filledCount = sectionFields.filter(f => (fields[f.key] || '').trim()).length;
                    return (
                      <div key={section.id} style={{ marginBottom: 4 }}>
                        {/* Section header */}
                        <div data-ccl-sidebar-section={section.id} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '7px 14px 5px',
                          background: isDarkMode ? 'rgba(54,144,206,0.04)' : 'rgba(54,144,206,0.02)',
                          borderTop: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(0,0,0,0.04)'}`,
                          borderBottom: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(0,0,0,0.04)'}`,
                        }}>
                          <Icon iconName={section.icon} styles={{ root: { fontSize: 11, color: accentBlue } }} />
                          <span style={{ fontSize: 9, fontWeight: 700, color: headingColor, textTransform: 'uppercase' as const, letterSpacing: '0.05em', flex: 1 }}>
                            {section.title}
                          </span>
                          <span style={{ fontSize: 8, color: filledCount === sectionFields.length ? colours.highlight : textMuted, fontWeight: 600 }}>
                            {filledCount}/{sectionFields.length}
                          </span>
                        </div>
                        {/* Fields */}
                        <div style={{ padding: '6px 14px 4px' }}>
                          {sectionFields.map(f => {
                            const prov = fieldProvenance[f.key] || 'empty';
                            const pc = provColours[prov] || provColours.default;
                            const provColor = pc.border;
                            const provLabel = prov === 'ai' ? 'AI' : prov === 'auto-fill' ? 'AUTO' : prov === 'user' ? 'EDITED' : prov === 'empty' ? 'EMPTY' : 'DEFAULT';
                            const isHighlighted = highlightedField === f.key;
                            return (
                              <div key={f.key} style={{
                                marginBottom: 10,
                                borderRadius: 3,
                                padding: isHighlighted ? '4px 6px' : 0,
                                background: isHighlighted ? (isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.05)') : 'transparent',
                                animation: isHighlighted ? 'cclPulseHighlight 0.6s ease 2' : 'none',
                                transition: 'all 0.2s ease',
                              }}>
                                <label style={{
                                  display: 'flex', alignItems: 'center', gap: 6,
                                  fontSize: 10, fontWeight: 600, color: text,
                                  marginBottom: 3,
                                }}>
                                  <span style={{
                                    width: 6, height: 6, borderRadius: 2,
                                    background: provColor, flexShrink: 0,
                                  }} />
                                  {f.label}
                                  <span
                                    onClick={(e) => { e.preventDefault(); scrollFieldToDocument(f.key); }}
                                    title="Jump to field in document"
                                    style={{ cursor: 'pointer', display: 'inline-flex', color: textMuted, opacity: 0.4, transition: 'all 0.12s ease' }}
                                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = accentBlue; }}
                                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = textMuted; }}
                                  >
                                    <Icon iconName="NavigateForward" styles={{ root: { fontSize: 9 } }} />
                                  </span>
                                  <span style={{
                                    fontSize: 7, fontWeight: 700, color: provColor,
                                    textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                                    marginLeft: 'auto',
                                  }}>
                                    {provLabel}
                                  </span>
                                </label>
                                {f.type === 'textarea' ? (
                                  <textarea
                                    data-ccl-qf={f.key}
                                    value={fields[f.key] || ''}
                                    onChange={e => {
                                      updateField?.(f.key, e.target.value);
                                      e.target.style.height = 'auto';
                                      e.target.style.height = e.target.scrollHeight + 'px';
                                    }}
                                    ref={el => {
                                      if (el) {
                                        el.style.height = 'auto';
                                        el.style.height = el.scrollHeight + 'px';
                                      }
                                    }}
                                    style={{
                                      width: '100%', resize: 'none', overflow: 'hidden',
                                      padding: '6px 8px', borderRadius: 3, fontSize: 11, lineHeight: 1.5,
                                      border: `1px solid ${provColor}`,
                                      borderLeft: `3px solid ${provColor}`,
                                      background: isDarkMode ? 'rgba(15,23,42,0.8)' : '#f8fafc',
                                      color: text, fontFamily: "'Raleway', inherit",
                                      outline: 'none', transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
                                      minHeight: 36,
                                    }}
                                    onFocus={e => { e.target.style.borderColor = accentBlue; e.target.style.boxShadow = `0 0 0 2px ${isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)'}`; }}
                                    onBlur={e => { e.target.style.borderColor = isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(148,163,184,0.3)'; e.target.style.boxShadow = 'none'; }}
                                  />
                                ) : (
                                  <input
                                    data-ccl-qf={f.key}
                                    type="text"
                                    value={fields[f.key] || ''}
                                    onChange={e => updateField?.(f.key, e.target.value)}
                                    style={{
                                      width: '100%', padding: '5px 8px', borderRadius: 3, fontSize: 11,
                                      border: `1px solid ${provColor}`,
                                      borderLeft: `3px solid ${provColor}`,
                                      background: isDarkMode ? 'rgba(15,23,42,0.8)' : '#f8fafc',
                                      color: text, fontFamily: "'Raleway', inherit",
                                      outline: 'none', transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
                                    }}
                                    onFocus={e => { e.target.style.borderColor = accentBlue; e.target.style.boxShadow = `0 0 0 2px ${isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)'}`; }}
                                    onBlur={e => { e.target.style.borderColor = isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(148,163,184,0.3)'; e.target.style.boxShadow = 'none'; }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Sections tab ── */}
              {sidebarTab === 'sections' && (
                <div>
                  {/* Expand/collapse controls */}
                  <div style={{ ...sidebarSectionStyle, display: 'flex', gap: 6 }}>
                    <button type="button" onClick={expandAll} style={{
                      flex: 1, padding: '4px 0', borderRadius: 2, fontSize: 9, fontWeight: 600,
                      border: `1px solid ${cardBorder}`, background: 'transparent',
                      color: textMuted, cursor: 'pointer', textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                    }}>Expand All</button>
                    <button type="button" onClick={collapseBoilerplate} style={{
                      flex: 1, padding: '4px 0', borderRadius: 2, fontSize: 9, fontWeight: 600,
                      border: `1px solid ${cardBorder}`, background: 'transparent',
                      color: textMuted, cursor: 'pointer', textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                    }}>Key Only</button>
                  </div>

                  {/* Section list */}
                  <div style={{ ...sidebarSectionStyle, padding: '6px 14px 14px' }}>
                    <span style={sidebarLabelStyle}>Clauses</span>
                    {parsedSections.filter(s => s.number && !s.isSubsection).map(s => {
                      const isCollapsed = collapsedSections.has(s.number);
                      const isBoilerplate = BOILERPLATE.has(s.number);
                      return (
                        <button key={s.id} type="button" onClick={() => scrollToSection(s.number)} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', textAlign: 'left' as const,
                          padding: '6px 8px', borderRadius: 2, marginBottom: 2,
                          border: 'none', cursor: 'pointer', transition: 'all 0.1s ease',
                          background: !isCollapsed
                            ? (isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.04)')
                            : 'transparent',
                          color: text,
                        }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: 2,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700, flexShrink: 0,
                            background: !isCollapsed ? accentBlue : (isDarkMode ? 'rgba(148,163,184,0.1)' : '#f1f5f9'),
                            color: !isCollapsed ? '#fff' : textMuted,
                          }}>
                            {s.number}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 500, flex: 1,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                            color: isCollapsed ? textMuted : text,
                            opacity: isBoilerplate && isCollapsed ? 0.6 : 1,
                          }}>
                            {s.title}
                          </span>
                          <Icon iconName={isCollapsed ? 'ChevronRight' : 'ChevronDown'} styles={{ root: { fontSize: 8, color: textMuted, opacity: 0.5 } }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Presets tab ── */}
              {sidebarTab === 'presets' && (
                <div style={{ padding: '10px 14px' }}>
                  <span style={sidebarLabelStyle}>Clause Presets</span>
                  <div style={{ fontSize: 10, color: textMuted, marginBottom: 12, lineHeight: 1.4 }}>
                    One-click clause variants. Click to apply.
                  </div>
                  {(['3', '4'] as const).map(sectionNum => {
                    const sectionPresets = CLAUSE_PRESETS.filter(p => p.section === sectionNum);
                    const sectionTitle = parsedSections.find(s => s.number === sectionNum)?.title || `Section ${sectionNum}`;
                    return (
                      <div key={sectionNum} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: headingColor, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            width: 18, height: 18, borderRadius: 2, fontSize: 9, fontWeight: 700,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: isDarkMode ? 'rgba(148,163,184,0.1)' : '#f1f5f9', color: textMuted,
                          }}>{sectionNum}</span>
                          {sectionTitle}
                        </div>
                        {sectionPresets.map(preset => {
                          const isActive = (fields[preset.fieldKey] || '').trim() === preset.value.replace('{opponent}', fields.identify_the_other_party_eg_your_opponents || 'the other party');
                          return (
                            <button key={preset.id} type="button" onClick={() => applyPreset(preset.fieldKey, preset.value)} style={{
                              display: 'block', width: '100%', textAlign: 'left' as const,
                              padding: '8px 10px', borderRadius: 3, marginBottom: 4,
                              border: `1px solid ${isActive ? accentBlue : (isDarkMode ? 'rgba(148,163,184,0.1)' : '#f1f5f9')}`,
                              background: isActive
                                ? (isDarkMode ? 'rgba(54,144,206,0.1)' : 'rgba(54,144,206,0.05)')
                                : 'transparent',
                              cursor: 'pointer', transition: 'all 0.12s ease',
                            }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? accentBlue : text, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                                {isActive && <Icon iconName="CheckMark" styles={{ root: { fontSize: 10, color: accentBlue } }} />}
                                {preset.label}
                              </div>
                              <div style={{ fontSize: 9.5, color: textMuted, lineHeight: 1.4 }}>{preset.description}</div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>{/* end sidebar content scroll */}
          </div>
        )}{/* end sidebar */}
      </div>{/* end main layout */}

      {/* Status feedback */}
      {status && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px',
          background: status.type === 'success'
            ? (isDarkMode ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.05)')
            : (isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.05)'),
          border: `1px solid ${status.type === 'success'
            ? (isDarkMode ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.15)')
            : (isDarkMode ? 'rgba(214,85,65,0.2)' : 'rgba(214,85,65,0.15)')}`,
          borderRadius: 2,
          fontSize: 11, fontWeight: 600,
          color: status.type === 'success'
            ? colours.highlight
            : (isDarkMode ? '#f0a090' : colours.cta),
        }}>
          <Icon iconName={status.type === 'success' ? 'CheckMark' : 'ErrorBadge'} styles={{ root: { fontSize: 12 } }} />
          {status.message}
        </div>
      )}

      {/* ═══ Clio Upload Confirmation Modal ═══ */}
      {showClioConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: 80,
          background: isDarkMode ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(3px)',
          animation: 'cclFadeIn 0.15s ease',
        }} onClick={() => { if (!uploadingClio) setShowClioConfirm(false); }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 420, maxWidth: '90vw',
            background: isDarkMode ? '#0f172a' : '#ffffff',
            border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(148,163,184,0.2)'}`,
            borderRadius: 6,
            boxShadow: isDarkMode ? '0 12px 40px rgba(0,0,0,0.6)' : '0 12px 40px rgba(0,0,0,0.15)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px 12px', borderBottom: `1px solid ${cardBorder}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDarkMode ? 'rgba(54,144,206,0.1)' : 'rgba(54,144,206,0.06)',
                border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(54,144,206,0.12)'}`,
              }}>
                <Icon iconName="CloudUpload" styles={{ root: { fontSize: 14, color: accentBlue } }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: text }}>Upload to Clio</div>
                <div style={{ fontSize: 10, color: textMuted }}>Confirm document upload</div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: text, lineHeight: 1.6, marginBottom: 16 }}>
                This will upload the generated Client Care Letter to the Clio matter as a document.
              </div>

              <div style={{
                padding: '10px 14px', borderRadius: 4,
                background: isDarkMode ? 'rgba(54,144,206,0.06)' : 'rgba(54,144,206,0.03)',
                border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.08)'}`,
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: textMuted, fontWeight: 600 }}>Document</span>
                  <span style={{ fontSize: 10, color: text }}>CCL-{matter.displayNumber || 'draft'}.docx</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: textMuted, fontWeight: 600 }}>Matter</span>
                  <span style={{ fontSize: 10, color: text }}>{integrations?.clio?.description || (isDemoMatter ? 'Admin (demo)' : matter.displayNumber || matterId)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: textMuted, fontWeight: 600 }}>Clio ID</span>
                  <span style={{ fontSize: 10, color: text }}>{integrations?.clio?.matterId || (isDemoMatter ? '3311402' : '—')}</span>
                </div>
              </div>

              {uploadingClio && (
                <div style={{ fontSize: 10, color: accentBlue, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Spinner size={SpinnerSize.xSmall} />
                  Uploading to Clio...
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px', borderTop: `1px solid ${cardBorder}`,
              display: 'flex', justifyContent: 'flex-end', gap: 8,
              background: isDarkMode ? 'rgba(15,23,42,0.5)' : 'rgba(248,250,252,0.8)',
            }}>
              <button type="button"
                disabled={uploadingClio}
                onClick={() => setShowClioConfirm(false)}
                style={{
                  padding: '6px 16px', borderRadius: 3, height: 28,
                  background: 'transparent', border: `1px solid ${cardBorder}`,
                  color: textMuted, fontSize: 11, fontWeight: 600,
                  cursor: uploadingClio ? 'not-allowed' : 'pointer',
                  opacity: uploadingClio ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button type="button"
                disabled={uploadingClio || !(integrations?.clio?.available || isDemoMatter)}
                onClick={async () => {
                  await handleUploadClio();
                  setShowClioConfirm(false);
                }}
                style={{
                  padding: '6px 16px', borderRadius: 3, height: 28,
                  background: uploadingClio ? (isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(54,144,206,0.1)') : accentBlue,
                  border: 'none',
                  color: '#ffffff', fontSize: 11, fontWeight: 600,
                  cursor: (uploadingClio || !(integrations?.clio?.available || isDemoMatter)) ? 'not-allowed' : 'pointer',
                  opacity: (uploadingClio || !(integrations?.clio?.available || isDemoMatter)) ? 0.6 : 1,
                }}
              >
                {uploadingClio ? 'Uploading...' : 'Upload to Clio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ AI Trace Modal ═══ */}
      {showTraceModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: 40,
          background: isDarkMode ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(3px)',
          animation: 'cclFadeIn 0.15s ease',
          overflowY: 'auto',
        }} onClick={() => setShowTraceModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '92%', maxWidth: 900, maxHeight: '90vh',
            background: isDarkMode ? '#0f172a' : '#ffffff',
            border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.3)' : 'rgba(148,163,184,0.2)'}`,
            borderRadius: 6,
            boxShadow: isDarkMode ? '0 16px 64px rgba(0,0,0,0.6)' : '0 16px 64px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 20px',
              borderBottom: `1px solid ${cardBorder}`,
              flexShrink: 0,
            }}>
              <Icon iconName="TestBeaker" styles={{ root: { fontSize: 14, color: accentBlue } }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: text, flex: 1 }}>AI Processing Trace</span>
              <span style={{
                fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                background: aiStatus === 'complete'
                  ? (isDarkMode ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.08)')
                  : aiStatus === 'partial'
                    ? (isDarkMode ? 'rgba(234,179,8,0.12)' : 'rgba(234,179,8,0.08)')
                    : aiStatus === 'error'
                      ? (isDarkMode ? 'rgba(214,85,65,0.12)' : 'rgba(214,85,65,0.08)')
                      : (isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.08)'),
                color: aiStatus === 'complete'
                  ? colours.highlight
                  : aiStatus === 'partial'
                    ? (isDarkMode ? '#facc15' : '#ca8a04')
                    : aiStatus === 'error'
                      ? (isDarkMode ? '#f0a090' : colours.cta)
                      : textMuted,
              }}>
                {aiStatus === 'complete' ? 'AI Complete' : aiStatus === 'partial' ? 'Partial' : aiStatus === 'error' ? 'Error' : aiStatus === 'loading' ? 'Loading...' : 'Defaults'}
              </span>
              <button type="button" onClick={() => setShowTraceModal(false)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer', color: textMuted,
                padding: 4, display: 'inline-flex',
              }}>
                <Icon iconName="Cancel" styles={{ root: { fontSize: 12 } }} />
              </button>
            </div>

            {/* ── Tab bar ── */}
            <div style={{
              display: 'flex', borderBottom: `1px solid ${cardBorder}`, flexShrink: 0,
              background: isDarkMode ? 'rgba(0,0,0,0.15)' : 'rgba(248,250,252,0.8)',
            }}>
              {([
                { id: 'overview' as const, icon: 'Flow', label: 'Pipeline' },
                { id: 'data' as const, icon: 'Database', label: 'Data In' },
                { id: 'system' as const, icon: 'Settings', label: 'System Prompt' },
                { id: 'prompt' as const, icon: 'Send', label: 'User Prompt' },
                { id: 'output' as const, icon: 'LightningBolt', label: 'AI Output' },
              ]).map(tab => (
                <button key={tab.id} type="button" onClick={() => setTraceTab(tab.id)} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  padding: '8px 4px', fontSize: 9, fontWeight: 700,
                  border: 'none', borderBottom: traceTab === tab.id ? `2px solid ${accentBlue}` : '2px solid transparent',
                  background: 'transparent',
                  color: traceTab === tab.id ? accentBlue : textMuted,
                  cursor: 'pointer', transition: 'all 0.12s ease',
                  textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                }}>
                  <Icon iconName={tab.icon} styles={{ root: { fontSize: 10 } }} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal body — scrollable */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', fontSize: 11, lineHeight: 1.6, color: text }}>

              {/* ═══ PIPELINE TAB ═══ */}
              {traceTab === 'overview' && (<>
                {/* Processing Chain */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: headingColor, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                    <Icon iconName="ProcessingRun" styles={{ root: { fontSize: 11, marginRight: 6, color: accentBlue } }} />
                    Processing Chain
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 0,
                    padding: '12px 14px', borderRadius: 4,
                    background: isDarkMode ? 'rgba(54,144,206,0.05)' : 'rgba(248,250,252,0.8)',
                    border: `1px solid ${cardBorder}`,
                    overflowX: 'auto',
                  }}>
                    {[
                      { label: 'Matter Data', icon: 'Contact', status: matter?.displayNumber ? 'done' : 'empty', detail: matter?.displayNumber || 'none', tab: 'overview' as const },
                      { label: 'Auto-fill', icon: 'AutoFillTemplate', status: Object.values(fieldProvenance).filter(p => p === 'auto-fill').length > 0 ? 'done' : 'empty', detail: `${Object.values(fieldProvenance).filter(p => p === 'auto-fill').length} fields`, tab: 'output' as const },
                      { label: 'DB Context', icon: 'Database', status: (aiDataSources || []).length > 0 ? 'done' : aiStatus === 'loading' ? 'loading' : 'empty', detail: `${(aiDataSources || []).length} sources`, tab: 'data' as const },
                      { label: 'System Prompt', icon: 'Settings', status: aiSystemPrompt ? 'done' : 'empty', detail: aiSystemPrompt ? `${aiSystemPrompt.length.toLocaleString()} chars` : 'none', tab: 'system' as const },
                      { label: 'User Prompt', icon: 'Send', status: aiUserPrompt ? 'done' : aiStatus === 'loading' ? 'loading' : 'empty', detail: aiUserPrompt ? `${aiUserPrompt.length.toLocaleString()} chars` : 'none', tab: 'prompt' as const },
                      { label: 'AI Output', icon: 'LightningBolt', status: aiStatus === 'complete' ? 'done' : aiStatus === 'partial' ? 'partial' : aiStatus === 'loading' ? 'loading' : aiStatus === 'error' ? 'error' : 'empty', detail: aiDebugTrace?.generatedFieldCount ? `${aiDebugTrace.generatedFieldCount} fields` : aiStatus === 'error' ? 'failed' : 'none', tab: 'output' as const },
                      { label: 'Letter', icon: 'PageEdit', status: 'done', detail: `${Object.values(fields).filter(v => v?.trim()).length} / ${Object.keys(fields).length}`, tab: 'output' as const },
                    ].map((step, i, arr) => (
                      <React.Fragment key={step.label}>
                        <div
                          onClick={() => setTraceTab(step.tab)}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            minWidth: 72, cursor: 'pointer',
                          }}
                          title={`View ${step.label} details`}
                        >
                          <div style={{
                            width: 30, height: 30, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: step.status === 'done' ? (isDarkMode ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)')
                              : step.status === 'partial' ? (isDarkMode ? 'rgba(234,179,8,0.15)' : 'rgba(234,179,8,0.1)')
                              : step.status === 'error' ? (isDarkMode ? 'rgba(214,85,65,0.15)' : 'rgba(214,85,65,0.1)')
                              : step.status === 'loading' ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)')
                              : (isDarkMode ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.05)'),
                            border: `1.5px solid ${
                              step.status === 'done' ? colours.highlight
                              : step.status === 'partial' ? (isDarkMode ? '#facc15' : '#ca8a04')
                              : step.status === 'error' ? (isDarkMode ? '#f0a090' : colours.cta)
                              : step.status === 'loading' ? accentBlue
                              : (isDarkMode ? '#334155' : '#e2e8f0')
                            }`,
                            transition: 'transform 0.1s ease',
                          }}>
                            <Icon iconName={step.icon} styles={{ root: {
                              fontSize: 12,
                              color: step.status === 'done' ? colours.highlight
                                : step.status === 'partial' ? (isDarkMode ? '#facc15' : '#ca8a04')
                                : step.status === 'error' ? (isDarkMode ? '#f0a090' : colours.cta)
                                : step.status === 'loading' ? accentBlue
                                : textMuted,
                            } }} />
                          </div>
                          <span style={{ fontSize: 8, fontWeight: 700, color: textMuted, textAlign: 'center', lineHeight: 1.2 }}>{step.label}</span>
                          <span style={{ fontSize: 7.5, color: isDarkMode ? '#475569' : '#94a3b8', textAlign: 'center' }}>{step.detail}</span>
                        </div>
                        {i < arr.length - 1 && (
                          <div style={{
                            flex: '0 0 16px', height: 1, margin: '0 2px',
                            marginBottom: 20,
                            background: step.status === 'done' ? (isDarkMode ? 'rgba(34,197,94,0.3)' : 'rgba(34,197,94,0.2)')
                              : (isDarkMode ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.1)'),
                          }} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Pipeline Summary grid */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: headingColor, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                    <Icon iconName="Info" styles={{ root: { fontSize: 11, marginRight: 6, color: accentBlue } }} />
                    Run Details
                  </div>
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px',
                    padding: '10px 14px', borderRadius: 4,
                    background: isDarkMode ? 'rgba(54,144,206,0.05)' : 'rgba(248,250,252,0.8)',
                    border: `1px solid ${cardBorder}`,
                  }}>
                    <span style={{ color: textMuted, fontWeight: 600 }}>Tracking ID</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 10 }}>{aiDebugTrace?.trackingId || '—'}</span>
                    <span style={{ color: textMuted, fontWeight: 600 }}>Deployment</span>
                    <span>{aiDebugTrace?.deployment || '—'}</span>
                    <span style={{ color: textMuted, fontWeight: 600 }}>Source</span>
                    <span>{aiSource || '—'}</span>
                    <span style={{ color: textMuted, fontWeight: 600 }}>Duration</span>
                    <span>{aiDurationMs ? `${(aiDurationMs / 1000).toFixed(1)}s` : '—'}</span>
                    <span style={{ color: textMuted, fontWeight: 600 }}>Temperature</span>
                    <span>{aiDebugTrace?.options?.temperature ?? '—'}</span>
                    <span style={{ color: textMuted, fontWeight: 600 }}>Data Sources</span>
                    <span>{(aiDataSources || []).length > 0 ? (aiDataSources || []).join(', ') : '—'}</span>
                    <span style={{ color: textMuted, fontWeight: 600 }}>Auto-filled</span>
                    <span>{Object.values(fieldProvenance).filter(p => p === 'auto-fill').length} fields</span>
                    <span style={{ color: textMuted, fontWeight: 600 }}>AI-generated</span>
                    <span>{Object.values(fieldProvenance).filter(p => p === 'ai').length} fields</span>
                    <span style={{ color: textMuted, fontWeight: 600 }}>Total Filled</span>
                    <span>{Object.values(fields).filter(v => v?.trim()).length} / {Object.keys(fields).length}</span>
                    {(aiFallbackReason || aiDebugTrace?.error) && (<>
                      <span style={{ color: isDarkMode ? '#f0a090' : colours.cta, fontWeight: 600 }}>Error / Fallback</span>
                      <span style={{ color: isDarkMode ? '#f0a090' : colours.cta }}>{aiFallbackReason || aiDebugTrace?.error}</span>
                    </>)}
                  </div>
                </div>
              </>)}

              {/* ═══ DATA IN TAB ═══ */}
              {traceTab === 'data' && (<>
                {/* Data source pills */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: headingColor, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                    <Icon iconName="Database" styles={{ root: { fontSize: 11, marginRight: 6, color: accentBlue } }} />
                    Data Sources ({(aiDataSources || []).length})
                  </div>
                  {(aiDataSources || []).length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                      {(aiDataSources || []).map((source, i) => (
                        <span key={i} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '4px 10px', borderRadius: 12,
                          background: isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.05)',
                          border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(54,144,206,0.1)'}`,
                          fontSize: 10, fontWeight: 600,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: accentBlue }} />
                          {source}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: textMuted, fontStyle: 'italic' }}>No data sources gathered</div>
                  )}
                </div>

                {/* Resolved context fields */}
                {aiDebugTrace?.context?.contextFields && Object.keys(aiDebugTrace.context.contextFields).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: headingColor, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                      <Icon iconName="TableComputed" styles={{ root: { fontSize: 11, marginRight: 6, color: accentBlue } }} />
                      Resolved Fields (structured data fed to prompt)
                    </div>
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 14px',
                      padding: '10px 14px', borderRadius: 4,
                      background: isDarkMode ? 'rgba(0,0,0,0.15)' : 'rgba(248,250,252,0.8)',
                      border: `1px solid ${cardBorder}`, fontSize: 10,
                    }}>
                      {Object.entries(aiDebugTrace.context.contextFields)
                        .filter(([, v]) => String(v || '').trim())
                        .map(([key, value]) => (
                          <React.Fragment key={key}>
                            <span style={{ color: textMuted, fontWeight: 600 }}>{key}</span>
                            <span>{String(value)}</span>
                          </React.Fragment>
                        ))}
                    </div>
                  </div>
                )}

                {/* Raw context snippets — the actual text sent in the user prompt */}
                {aiDebugTrace?.context?.snippets && Object.entries(aiDebugTrace.context.snippets).filter(([, v]) => String(v || '').trim()).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: headingColor, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                      <Icon iconName="TextDocument" styles={{ root: { fontSize: 11, marginRight: 6, color: accentBlue } }} />
                      Raw Context Snippets (text chunks injected into user prompt)
                    </div>
                    {Object.entries(aiDebugTrace.context.snippets)
                      .filter(([, v]) => String(v || '').trim())
                      .map(([key, value]) => (
                        <div key={key} style={{ marginBottom: 10 }}>
                          <div style={{
                            fontSize: 9, fontWeight: 700, color: accentBlue, marginBottom: 3,
                            textTransform: 'uppercase' as const, letterSpacing: '0.03em',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: accentBlue }} />
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </div>
                          <div style={{
                            padding: '8px 10px', borderRadius: 3,
                            background: isDarkMode ? 'rgba(0,0,0,0.2)' : '#f8fafc',
                            border: `1px solid ${cardBorder}`,
                            fontSize: 10, lineHeight: 1.5, color: textMuted,
                            whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
                            maxHeight: 150, overflow: 'auto',
                          }}>
                            {String(value)}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Flow explanation */}
                <div style={{
                  padding: '10px 14px', borderRadius: 4,
                  background: isDarkMode ? 'rgba(54,144,206,0.05)' : 'rgba(248,250,252,0.5)',
                  border: `1px solid ${cardBorder}`, fontSize: 10, color: textMuted, lineHeight: 1.6,
                }}>
                  <strong style={{ color: text }}>How data flows:</strong> The backend queries Instructions DB (deals, pitch emails, pitch notes), Core Data DB (enquiry records), and CallRail (call transcripts). Each source that returns data is listed above. The structured fields become the <strong>MATTER CONTEXT</strong> section of the user prompt, while raw text (emails, transcripts, notes) are injected as separate sections.
                </div>
              </>)}

              {/* ═══ SYSTEM PROMPT TAB ═══ */}
              {traceTab === 'system' && (<>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: headingColor, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                    <Icon iconName="Settings" styles={{ root: { fontSize: 11, marginRight: 6, color: accentBlue } }} />
                    System Prompt ({aiSystemPrompt ? aiSystemPrompt.length.toLocaleString() : 0} chars)
                  </div>
                  <div style={{ fontSize: 9.5, color: textMuted, marginBottom: 10, lineHeight: 1.5 }}>
                    This prompt tells the AI <strong style={{ color: text }}>what to do</strong> — which fields to generate, where each field appears in the CCL template, and the rules for cost accuracy. It is the same for every matter. The user prompt (next tab) provides the matter-specific data.
                  </div>
                </div>
                {aiSystemPrompt ? (
                  <div style={{
                    padding: '12px 14px', borderRadius: 4,
                    background: isDarkMode ? 'rgba(0,0,0,0.25)' : '#f8fafc',
                    border: `1px solid ${cardBorder}`,
                    fontSize: 9.5, lineHeight: 1.6, fontFamily: 'monospace',
                    color: textMuted, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
                    maxHeight: 'calc(90vh - 220px)', overflow: 'auto',
                  }}>
                    {aiSystemPrompt}
                  </div>
                ) : (
                  <div style={{ color: textMuted, fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>
                    System prompt not available — the server may not have returned it for this run.
                  </div>
                )}
              </>)}

              {/* ═══ USER PROMPT TAB ═══ */}
              {traceTab === 'prompt' && (<>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: headingColor, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                    <Icon iconName="Send" styles={{ root: { fontSize: 11, marginRight: 6, color: accentBlue } }} />
                    User Prompt ({aiUserPrompt ? aiUserPrompt.length.toLocaleString() : 0} chars)
                  </div>
                  <div style={{ fontSize: 9.5, color: textMuted, marginBottom: 10, lineHeight: 1.5 }}>
                    This is the <strong style={{ color: text }}>matter-specific data</strong> sent alongside the system prompt. It contains the practice area, client details, deal amounts, pitch emails, call transcripts — everything the AI uses to generate tailored fields. Each section below corresponds to a data source.
                  </div>
                </div>
                {aiUserPrompt ? (
                  <div style={{
                    padding: '12px 14px', borderRadius: 4,
                    background: isDarkMode ? 'rgba(0,0,0,0.25)' : '#f8fafc',
                    border: `1px solid ${cardBorder}`,
                    fontSize: 9.5, lineHeight: 1.6, fontFamily: 'monospace',
                    color: textMuted, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
                    maxHeight: 'calc(90vh - 220px)', overflow: 'auto',
                  }}>
                    {aiUserPrompt}
                  </div>
                ) : (
                  <div style={{ color: textMuted, fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>
                    No user prompt — AI was not called (using defaults only).
                  </div>
                )}
              </>)}

              {/* ═══ AI OUTPUT TAB ═══ */}
              {traceTab === 'output' && (<>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: headingColor, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                    <Icon iconName="LightningBolt" styles={{ root: { fontSize: 11, marginRight: 6, color: accentBlue } }} />
                    Generated Fields ({Object.values(fieldProvenance).filter(p => p === 'ai').length} AI + {Object.values(fieldProvenance).filter(p => p === 'auto-fill').length} auto-fill)
                  </div>
                  <div style={{ fontSize: 9.5, color: textMuted, marginBottom: 10, lineHeight: 1.5 }}>
                    Each field below shows its <strong style={{ color: text }}>source</strong> (AI-generated or auto-filled from matter data) and its <strong style={{ color: text }}>current value</strong>. Fields are grouped by their position in the CCL template.
                  </div>
                </div>
                {/* Legend */}
                <div style={{ fontSize: 9, color: textMuted, marginBottom: 10, display: 'flex', gap: 14, flexWrap: 'wrap' as const }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: colours.highlight }} /> AI-generated
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: accentBlue }} /> Auto-filled
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: isDarkMode ? '#94a3b8' : '#cbd5e1' }} /> Default / Empty
                  </span>
                </div>
                {CCL_SECTIONS.map((section) => {
                  const sectionFields = section.fields.map(f => f.key).filter(k => k in fields);
                  if (sectionFields.length === 0) return null;
                  const filledCount = sectionFields.filter(k => (fields[k] || '').trim()).length;
                  const aiCount = sectionFields.filter(k => fieldProvenance[k] === 'ai').length;
                  const autoCount = sectionFields.filter(k => fieldProvenance[k] === 'auto-fill').length;
                  return (
                    <div key={section.id} style={{ marginBottom: 10 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 12px', borderRadius: '4px 4px 0 0',
                        background: isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.04)',
                        border: `1px solid ${cardBorder}`, borderBottom: 'none',
                      }}>
                        <Icon iconName={section.icon} styles={{ root: { fontSize: 11, color: accentBlue } }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: text, flex: 1 }}>{section.title}</span>
                        <span style={{ fontSize: 8, color: textMuted }}>
                          {filledCount}/{sectionFields.length} filled
                          {aiCount > 0 && <span style={{ color: colours.highlight, marginLeft: 6 }}>{aiCount} AI</span>}
                          {autoCount > 0 && <span style={{ color: accentBlue, marginLeft: 6 }}>{autoCount} auto</span>}
                        </span>
                      </div>
                      <div style={{ borderRadius: '0 0 4px 4px', overflow: 'hidden', border: `1px solid ${cardBorder}` }}>
                        {sectionFields.map((key, i) => {
                          const prov = fieldProvenance[key] || 'empty';
                          const provColor = prov === 'ai' ? colours.highlight
                            : prov === 'auto-fill' ? accentBlue
                            : (isDarkMode ? '#475569' : '#cbd5e1');
                          const valStr = (fields[key] || '').trim();
                          const fieldDef = section.fields.find(f => f.key === key);
                          return (
                            <div key={key} style={{
                              display: 'flex', alignItems: 'flex-start', gap: 8,
                              padding: '5px 12px',
                              borderBottom: i < sectionFields.length - 1 ? `1px solid ${isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(0,0,0,0.04)'}` : 'none',
                              background: i % 2 === 0 ? 'transparent' : (isDarkMode ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.015)'),
                              fontSize: 10,
                            }}>
                              <span style={{ width: 5, height: 5, borderRadius: 2, background: provColor, flexShrink: 0, marginTop: 5 }} />
                              <span style={{
                                width: 160, flexShrink: 0, fontWeight: 600, color: textMuted,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, fontSize: 9,
                              }} title={key}>
                                {fieldDef?.label || key}
                              </span>
                              <span style={{
                                flex: 1, color: valStr ? text : (isDarkMode ? '#475569' : '#cbd5e1'),
                                fontStyle: valStr ? 'normal' : 'italic',
                                overflow: 'hidden', textOverflow: 'ellipsis',
                                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const,
                                fontSize: 9.5,
                              }}>
                                {valStr || '(empty)'}
                              </span>
                              <span style={{
                                fontSize: 7.5, fontWeight: 700, color: provColor,
                                textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                                flexShrink: 0, minWidth: 48, textAlign: 'right' as const,
                              }}>
                                {prov}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {/* Unmapped fields */}
                {(() => {
                  const mappedKeys = new Set(CCL_SECTIONS.flatMap(s => s.fields.map(f => f.key)));
                  const unmapped = Object.keys(fields).filter(k => !mappedKeys.has(k) && (fields[k] || '').trim());
                  if (unmapped.length === 0) return null;
                  return (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 12px', borderRadius: '4px 4px 0 0',
                        background: isDarkMode ? 'rgba(148,163,184,0.05)' : 'rgba(148,163,184,0.03)',
                        border: `1px solid ${cardBorder}`, borderBottom: 'none',
                      }}>
                        <Icon iconName="Unknown" styles={{ root: { fontSize: 11, color: textMuted } }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: textMuted, flex: 1 }}>Other Fields</span>
                        <span style={{ fontSize: 8, color: textMuted }}>{unmapped.length} fields</span>
                      </div>
                      <div style={{ borderRadius: '0 0 4px 4px', overflow: 'hidden', border: `1px solid ${cardBorder}` }}>
                        {unmapped.map((key, i) => {
                          const prov = fieldProvenance[key] || 'empty';
                          const provColor = prov === 'ai' ? colours.highlight : prov === 'auto-fill' ? accentBlue : (isDarkMode ? '#475569' : '#cbd5e1');
                          return (
                            <div key={key} style={{
                              display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 12px',
                              borderBottom: i < unmapped.length - 1 ? `1px solid ${isDarkMode ? 'rgba(148,163,184,0.06)' : 'rgba(0,0,0,0.04)'}` : 'none',
                              background: i % 2 === 0 ? 'transparent' : (isDarkMode ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.015)'), fontSize: 10,
                            }}>
                              <span style={{ width: 5, height: 5, borderRadius: 2, background: provColor, flexShrink: 0, marginTop: 5 }} />
                              <span style={{ width: 160, flexShrink: 0, fontWeight: 600, color: textMuted, fontFamily: 'monospace', fontSize: 8 }} title={key}>{key}</span>
                              <span style={{ flex: 1, color: text, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, fontSize: 9.5 }}>{fields[key]}</span>
                              <span style={{ fontSize: 7.5, fontWeight: 700, color: provColor, textTransform: 'uppercase' as const, flexShrink: 0, minWidth: 48, textAlign: 'right' as const }}>{prov}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </>)}

            </div>{/* end modal body */}
          </div>{/* end modal panel */}
        </div>
      )}{/* end trace modal */}

      {/* ═══ Support Report Modal ═══ */}
      {showSupportModal && (() => {
        const categories: { value: CclSupportTicket['category']; label: string; icon: string }[] = [
          { value: 'field_wrong', label: 'Field value wrong', icon: 'FieldChanged' },
          { value: 'ai_quality', label: 'AI quality issue', icon: 'Robot' },
          { value: 'template_error', label: 'Template / formatting', icon: 'PageEdit' },
          { value: 'upload_failed', label: 'Upload / export failed', icon: 'CloudUpload' },
          { value: 'other', label: 'Other', icon: 'More' },
        ];
        const urgencies: CclSupportTicket['urgency'][] = ['Blocking', 'Annoying', 'Minor'];
        const SupportForm: React.FC = () => {
          const [cat, setCat] = useState<CclSupportTicket['category']>('field_wrong');
          const [urg, setUrg] = useState<CclSupportTicket['urgency']>('Annoying');
          const [summary, setSummary] = useState('');
          const [desc, setDesc] = useState('');
          return (
            <div style={{
              position: 'fixed', inset: 0, zIndex: 1001,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              paddingTop: 40,
              background: isDarkMode ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(3px)',
              animation: 'cclFadeIn 0.15s ease',
              overflowY: 'auto',
            }} onClick={() => setShowSupportModal(false)}>
              <div onClick={e => e.stopPropagation()} style={{
                width: '92%', maxWidth: 520,
                background: isDarkMode ? '#0f172a' : '#ffffff',
                border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.3)' : 'rgba(148,163,184,0.2)'}`,
                borderRadius: 6,
                boxShadow: isDarkMode ? '0 16px 64px rgba(0,0,0,0.6)' : '0 16px 64px rgba(0,0,0,0.2)',
                overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{
                  padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  borderBottom: `1px solid ${cardBorder}`,
                  background: isDarkMode ? 'rgba(15,23,42,0.8)' : 'rgba(248,250,252,0.95)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon iconName="Bug" styles={{ root: { fontSize: 14, color: isDarkMode ? '#f87171' : '#dc2626' } }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: text }}>Report CCL Issue</span>
                  </div>
                  <button type="button" onClick={() => setShowSupportModal(false)} style={{
                    background: 'none', border: 'none', color: textMuted, cursor: 'pointer', fontSize: 16,
                  }}>✕</button>
                </div>

                {/* Body */}
                <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Category pills */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, color: textMuted, marginBottom: 6, letterSpacing: '0.04em' }}>Category</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                      {categories.map(c => (
                        <button key={c.value} type="button" onClick={() => setCat(c.value)} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '5px 10px', borderRadius: 3, fontSize: 11, fontWeight: 600,
                          border: `1px solid ${cat === c.value ? accentBlue : cardBorder}`,
                          background: cat === c.value ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.08)') : 'transparent',
                          color: cat === c.value ? accentBlue : textMuted,
                          cursor: 'pointer', transition: 'all 0.12s ease',
                        }}>
                          <Icon iconName={c.icon} styles={{ root: { fontSize: 10 } }} />
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Summary */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, color: textMuted, marginBottom: 4, letterSpacing: '0.04em' }}>Summary</div>
                    <input
                      type="text" value={summary} onChange={e => setSummary(e.target.value)}
                      placeholder="Brief description of the issue"
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 3,
                        border: `1px solid ${cardBorder}`, background: isDarkMode ? 'rgba(15,23,42,0.6)' : '#fff',
                        color: text, fontSize: 12, fontFamily: 'Raleway, sans-serif',
                        outline: 'none', boxSizing: 'border-box' as const,
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = accentBlue; }}
                      onBlur={e => { e.currentTarget.style.borderColor = cardBorder; }}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, color: textMuted, marginBottom: 4, letterSpacing: '0.04em' }}>Details (optional)</div>
                    <textarea
                      value={desc} onChange={e => setDesc(e.target.value)}
                      placeholder="What happened? What did you expect?"
                      rows={3}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: 3,
                        border: `1px solid ${cardBorder}`, background: isDarkMode ? 'rgba(15,23,42,0.6)' : '#fff',
                        color: text, fontSize: 12, fontFamily: 'Raleway, sans-serif',
                        outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const,
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = accentBlue; }}
                      onBlur={e => { e.currentTarget.style.borderColor = cardBorder; }}
                    />
                  </div>

                  {/* Urgency */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, color: textMuted, marginBottom: 6, letterSpacing: '0.04em' }}>Urgency</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {urgencies.map(u => {
                        const urgColors: Record<string, string> = { Blocking: '#ef4444', Annoying: '#f59e0b', Minor: '#22c55e' };
                        return (
                          <button key={u} type="button" onClick={() => setUrg(u)} style={{
                            padding: '5px 12px', borderRadius: 3, fontSize: 11, fontWeight: 600,
                            border: `1px solid ${urg === u ? urgColors[u] : cardBorder}`,
                            background: urg === u ? `${urgColors[u]}18` : 'transparent',
                            color: urg === u ? urgColors[u] : textMuted,
                            cursor: 'pointer', transition: 'all 0.12s ease',
                          }}>
                            {u}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Auto-captured context note */}
                  <div style={{
                    fontSize: 10, color: textMuted, padding: '8px 10px', borderRadius: 3,
                    background: isDarkMode ? 'rgba(54,144,206,0.06)' : 'rgba(54,144,206,0.04)',
                    border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.1)' : 'rgba(54,144,206,0.08)'}`,
                    display: 'flex', alignItems: 'flex-start', gap: 6,
                  }}>
                    <Icon iconName="Info" styles={{ root: { fontSize: 10, marginTop: 1, color: accentBlue } }} />
                    <span>
                      Debug context will be auto-captured: matter {matter.displayNumber || '—'}, all field values,
                      AI status ({aiStatus || 'none'}){aiDebugTrace?.trackingId ? `, tracking ${aiDebugTrace.trackingId}` : ''}.
                    </span>
                  </div>

                  {/* Submit */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button type="button" onClick={() => setShowSupportModal(false)} style={{
                      padding: '6px 16px', borderRadius: 3, fontSize: 11, fontWeight: 600,
                      border: `1px solid ${cardBorder}`, background: 'transparent', color: textMuted,
                      cursor: 'pointer',
                    }}>Cancel</button>
                    <button type="button"
                      disabled={!summary.trim() || supportSubmitting}
                      onClick={() => handleSubmitSupportTicket({ category: cat, summary: summary.trim(), description: desc.trim() || undefined, urgency: urg, submittedBy: fields.name_of_person_handling_matter || '' })}
                      style={{
                        padding: '6px 20px', borderRadius: 3, fontSize: 11, fontWeight: 700,
                        border: 'none',
                        background: !summary.trim() ? (isDarkMode ? 'rgba(148,163,184,0.2)' : '#e2e8f0') : (isDarkMode ? '#dc2626' : '#ef4444'),
                        color: !summary.trim() ? textMuted : '#fff',
                        cursor: !summary.trim() || supportSubmitting ? 'not-allowed' : 'pointer',
                        opacity: supportSubmitting ? 0.6 : 1,
                        textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Icon iconName={supportSubmitting ? 'ProgressRingDots' : 'Send'} styles={{ root: { fontSize: 10 } }} />
                        Submit
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        };
        return <SupportForm />;
      })()}

      {/* ═══ CCL Ops Panel (admin only) ═══ */}
      {isOpsAdmin && showOpsPanel && (
        <CclOpsPanel
          matterId={matter.matterId || matter.displayNumber || ''}
          isDarkMode={isDarkMode}
          onClose={() => setShowOpsPanel(false)}
          userInitials={userInitials}
          instructionRef={matter.instructionRef || matter.displayNumber || ''}
        />
      )}
    </div>
  );
};

export default PreviewStep;
