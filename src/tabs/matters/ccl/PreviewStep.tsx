import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { colours } from '../../../app/styles/colours';
import type { NormalizedMatter } from '../../../app/functionality/types';
import type { AiStatus, CclLoadInfo } from './CCLEditor';
import { submitAiFeedback, submitCclSupportTicket, checkCclIntegrations, uploadToNetDocuments, fetchPressureTest, type AiDebugTrace, type CclSupportTicket, type CclIntegrations, type PressureTestResponse, type PressureTestFieldScore } from './cclAiService';
import { CCL_SECTIONS } from './cclSections';
import { FIELD_PROMPTS, FIELD_PROMPT_MAP } from './cclFieldPrompts';
import CclOpsPanel from './CclOpsPanel';
import { ADMIN_USERS } from '../../../app/admin';
import { checkIsLocalDev } from '../../../utils/useIsLocalDev';

interface PreviewSection {
  id: string;
  number: string;
  title: string;
  isSubsection: boolean;
  elements: React.ReactNode[];
  sourceElementIndices?: number[];
}

interface GenerateDocxResult {
  url: string | null;
  unresolvedPlaceholders: string[];
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

  const handleRate = async (nextRating: 'up' | 'down') => {
    setRating(nextRating);
    setSubmitted(false);
    if (nextRating === 'up') {
      await submitAiFeedback({ matterId, rating: nextRating });
      setSubmitted(true);
      return;
    }
    setShowComment(true);
  };

  const handleSubmitComment = async () => {
    if (!rating) return;
    await submitAiFeedback({ matterId, rating, comment: comment.trim() || undefined });
    setSubmitted(true);
    setShowComment(false);
  };

  return (
    <div style={{ margin: '0 10px 8px' }}>
      <div
        style={{
          padding: '8px 12px',
          borderRadius: 4,
          fontSize: 11,
          background: isDarkMode ? 'rgba(54,144,206,0.05)' : 'rgba(54,144,206,0.03)',
          border: `1px solid ${cardBorder}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: textMuted, fontWeight: 600 }}>
            {submitted ? 'Thanks for the feedback' : 'How was the AI draft?'}
          </span>
          {!submitted && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => handleRate('up')}
                title="Good - AI got it mostly right"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 3,
                  border: `1px solid ${rating === 'up' ? accentBlue : cardBorder}`,
                  background: rating === 'up' ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.08)') : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: rating === 'up' ? accentBlue : textMuted,
                  fontSize: 13,
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon iconName="Like" />
              </button>
              <button
                type="button"
                onClick={() => handleRate('down')}
                title="Needs work - tell us what was wrong"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 3,
                  border: `1px solid ${rating === 'down' ? colours.cta : cardBorder}`,
                  background: rating === 'down' ? (isDarkMode ? 'rgba(214,85,65,0.15)' : 'rgba(214,85,65,0.08)') : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: rating === 'down' ? colours.cta : textMuted,
                  fontSize: 13,
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon iconName="Dislike" />
              </button>
            </div>
          )}
          {submitted && <Icon iconName="SkypeCheck" styles={{ root: { fontSize: 13, color: accentBlue } }} />}
        </div>

        {showComment && !submitted && (
          <div style={{ marginTop: 8 }}>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="What needs improving? (optional)"
              style={{
                width: '100%',
                minHeight: 48,
                padding: '6px 8px',
                fontSize: 11,
                fontFamily: 'inherit',
                borderRadius: 3,
                border: `1px solid ${cardBorder}`,
                background: isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
                color: text,
                resize: 'vertical',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => {
                  setShowComment(false);
                  setRating(null);
                }}
                style={{
                  padding: '3px 10px',
                  borderRadius: 2,
                  fontSize: 10,
                  fontWeight: 600,
                  border: `1px solid ${cardBorder}`,
                  background: 'transparent',
                  color: textMuted,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitComment}
                style={{
                  padding: '3px 10px',
                  borderRadius: 2,
                  fontSize: 10,
                  fontWeight: 600,
                  border: 'none',
                  background: accentBlue,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Submit
              </button>
            </div>
          </div>
        )}

        {dataSources.length > 0 && (
          <button
            type="button"
            onClick={() => setShowSources(!showSources)}
            style={{
              marginTop: 6,
              padding: 0,
              border: 'none',
              background: 'transparent',
              color: accentBlue,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              opacity: 0.8,
            }}
          >
            <Icon iconName={showSources ? 'ChevronDown' : 'ChevronRight'} styles={{ root: { fontSize: 8 } }} />
            {dataSources.length} data source{dataSources.length !== 1 ? 's' : ''} used
          </button>
        )}

        {showSources && dataSources.length > 0 && (
          <div
            style={{
              marginTop: 4,
              padding: '6px 8px',
              borderRadius: 3,
              background: isDarkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.02)',
              border: `1px solid ${cardBorder}`,
            }}
          >
            <div style={{ fontSize: 10, color: textMuted, marginBottom: 4, fontWeight: 600 }}>
              Context gathered from:
            </div>
            {dataSources.map((source, index) => (
              <div
                key={index}
                style={{
                  fontSize: 10,
                  color: text,
                  padding: '2px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: accentBlue,
                    flexShrink: 0,
                  }}
                />
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
  templateContent?: string;
  matter: NormalizedMatter;
  fields: Record<string, string>;
  updateField?: (key: string, value: string) => void;
  userEditedKeys?: Set<string>;
  userInitials?: string;
  aiStatus?: AiStatus;
  aiLoadingKeys?: Set<string>;
  aiSource?: string;
  aiDurationMs?: number;
  aiDataSources?: string[];
  aiContextSummary?: string;
  aiUserPrompt?: string;
  aiSystemPrompt?: string;
  aiFallbackReason?: string;
  aiDebugTrace?: AiDebugTrace;
  aiGeneratedKeys?: Set<string>;
  draftLoaded?: boolean;
  loadInfo?: CclLoadInfo | null;
  isDarkMode: boolean;
  onBack: () => void;
  onClose?: () => void;
  onAdvancedMode?: () => void;
  onTriggerAiFill?: () => void;
}

const CANONICAL_SYSTEM_PROMPT = `You are a senior UK solicitor at Helix Law, a specialist litigation firm. Helix Law acts across four core practice areas: commercial disputes (shareholder and partnership disputes, investment and loan disputes, debt recovery, statutory demands, civil fraud, contract disputes, restrictive covenants, injunctions), property disputes (landlord and tenant, evictions, boundary and land disputes), construction disputes (adjudication, payment disputes, contract breaches, unlawful terminations), and employment law. The firm is SRA-regulated (ID 565557) and based in Brighton. Your task is to generate the intake fields for a Client Care Letter (CCL) based on the matter context provided.

The CCL is a regulatory requirement under SRA rules. It must be professional, accurate, and tailored to the specific matter. Write in clear, professional British English suitable for a client who is not legally trained.

CRITICAL: You are filling in the placeholder fields of a real legal template. Each field you generate is injected verbatim into the letter - it must read naturally in context. Below is how each field appears in the actual template so you understand exactly where your output goes.

TEMPLATE CONTEXT (how your fields are used - {{field_name}} = your output):

Section 2 - Scope of services:
"{{insert_current_position_and_scope_of_retainer}} ("Initial Scope")"
-> This is the opening paragraph of the scope section. Write 2-4 complete sentences describing what the client has instructed Helix Law to do. Must be specific to this matter. Ends with the text ("Initial Scope") which is added by the template.

Section 3 - Next steps:
"The next steps in your matter are {{next_steps}}."
-> Start lowercase. This completes the sentence. List 2-3 specific actions.

"We expect this will take {{realistic_timescale}}."
-> A realistic period, e.g. "4-6 weeks" or "2-3 months".

Section 4.1 - Charges:
"My rate is £{{handler_hourly_rate}} per hour."
-> Number only (already auto-filled, but if missing use the rate given in context).

"{{charges_estimate_paragraph}}"
-> 1-3 complete sentences estimating fees for the Initial Scope. Include a £ range plus VAT. Base this on the deal amount, pitch email amount, or practice area norms. Must be realistic.

Section 4.2 - Disbursements:
"{{disbursements_paragraph}}"
-> 1-2 complete sentences about likely disbursements for this matter type.

Section 4.3 - Costs other party:
"{{costs_other_party_paragraph}}"
-> 1-2 sentences. If there is an opponent: note the risk. If no opponent or not litigation: "We do not expect that you will have to pay another party's costs."

Section 6 - Payment on account:
"Please provide us with £{{figure}} on account of costs."
-> Number only, no £ sign, e.g. "2,500". Usually 50-100% of the low end of the estimate range.

Section 7 - Costs updates:
"We have agreed to provide you with an update on the amount of costs as the matter progresses{{and_or_intervals_eg_every_three_months}}."
-> Starts with ", " then the qualifier. Usually ", when appropriate" or ", monthly" or ", every three months".

Section 13 - Duties to court:
"Your matter {{may_will}} involve court proceedings."
-> Either "may" or "will". Use "may" unless court proceedings are certain.

Section 18 - Action points:
"☐ {{insert_next_step_you_would_like_client_to_take}} | {{state_why_this_step_is_important}}"
-> insert_next_step: Imperative sentence - what the client must do. Be specific to this matter.
-> state_why_this_step_is_important: Why it matters. 1 sentence.

"☐ Provide a payment on account of costs and disbursements of £{{state_amount}} | If we do not receive a payment on account... {{insert_consequence}}"
-> state_amount: Same as figure.
-> insert_consequence: What happens if they don't pay, e.g. "we may not be able to start work on your matter"

"{{describe_first_document_or_information_you_need_from_your_client}}"
"{{describe_second_document_or_information_you_need_from_your_client}}"
"{{describe_third_document_or_information_you_need_from_your_client}}"
-> Each is a bullet point. Be specific to this matter type - name the actual documents needed.

NOT SHOWN DIRECTLY AS STANDALONE SENTENCES IN THE LETTER:
- "next_stage": Brief label for the next milestone (used for internal tracking, not shown to client)
- "figure_or_range": Cost estimate range, e.g. "2,500 - 5,000" (used in sidebar display)
- "estimate": Full estimate string, e.g. "£2,500 to £5,000 plus VAT"
- "in_total_including_vat_or_for_the_next_steps_in_your_matter": Either "in total, including VAT" or "for the next steps in your matter"
- "give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees": Brief list of what the estimate covers
- "we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible": If estimate is possible, set to "". Only fill if genuinely impossible.
- "simple_disbursements_estimate": Estimated disbursements (number only, e.g. "500")
- "identify_the_other_party_eg_your_opponents": Supporting matter data inserted only inside the second 4.3 costs-risk alternative

COST ACCURACY RULES:
1. If a Deal Amount is provided, the costs estimate must be consistent with it. The payment on account (figure) should match the agreed amount unless a fee earner has explicitly said otherwise.
2. If a Pitch Email is provided, match its quoted figures exactly - the client has already seen these numbers.
3. If neither is available, use practice area norms for a UK specialist litigation firm.
4. Never invent costs figures that are wildly different from the deal or pitch context.

Respond with only a JSON object containing these fields. No markdown, no explanation, just the JSON object.`;

const PreviewStep: React.FC<PreviewStepProps> = ({ content, templateContent, matter, fields, updateField, userEditedKeys, userInitials, aiStatus, aiLoadingKeys, aiSource, aiDurationMs, aiDataSources, aiContextSummary, aiUserPrompt, aiSystemPrompt: aiSystemPromptRaw, aiFallbackReason, aiDebugTrace, aiGeneratedKeys, draftLoaded = true, loadInfo = null, isDarkMode, onBack: _onBack, onClose, onAdvancedMode, onTriggerAiFill }) => {
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
    return fieldKeys.has(key) && !String(fields[key] || '').trim();
  }).length;

  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showOpsPanel, setShowOpsPanel] = useState(false);
  const isOpsAdmin = useMemo(() => {
    if (!userInitials) return false;
    return (ADMIN_USERS as readonly string[]).includes(userInitials.toUpperCase());
  }, [userInitials]);
  const [documentMode, setDocumentMode] = useState<'preview' | 'edit'>('edit');
  // showAiTrace removed — AI details dropdown stripped for simplicity

  // Boilerplate sections collapse by default — user-relevant sections stay expanded
  const BOILERPLATE = useMemo(() => new Set(['5', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17']), []);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set(['5', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17']));
  const toggleSection = useCallback((id: string) => {
    setCollapsedSections(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  const expandAll = useCallback(() => setCollapsedSections(new Set()), []);
  const collapseBoilerplate = useCallback(() => setCollapsedSections(new Set(['5', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17'])), []);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sectionElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const introRef = useRef<HTMLDivElement | null>(null);
  const letterheadRef = useRef<HTMLDivElement | null>(null);
  const recipientRef = useRef<HTMLDivElement | null>(null);
  const [measuredSectionHeights, setMeasuredSectionHeights] = useState<Record<string, number>>({});
  const [measuredSectionElementHeights, setMeasuredSectionElementHeights] = useState<Record<string, number>>({});
  const scrollToSection = useCallback((id: string) => {
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCollapsedSections(prev => { const n = new Set(prev); n.delete(id); return n; }); // expand if collapsed
  }, []);
  const getSectionElementMeasurementKey = useCallback((sectionNumber: string, elementIndex: number) => `${sectionNumber}::${elementIndex}`, []);

  const generateDocx = useCallback(async (): Promise<GenerateDocxResult> => {
    const matterId = matter.matterId || matter.displayNumber;
    if (!matterId) {
      setStatus({ type: 'error', message: 'No matter ID available' });
      return { url: null, unresolvedPlaceholders: [] };
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
    return {
      url: data.url || null,
      unresolvedPlaceholders: Array.isArray(data.unresolvedPlaceholders) ? data.unresolvedPlaceholders : [],
    };
  }, [matter, fields, userInitials]);

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    setStatus(null);
    try {
      const { url, unresolvedPlaceholders } = await generateDocx();
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `CCL-${matter.displayNumber || 'draft'}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (unresolvedPlaceholders.length > 0) {
          setStatus({
            type: 'error',
            message: `Draft downloaded, but ${unresolvedPlaceholders.length} field${unresolvedPlaceholders.length === 1 ? '' : 's'} still need completion before send/upload: ${unresolvedPlaceholders.slice(0, 5).join(', ')}${unresolvedPlaceholders.length > 5 ? '…' : ''}`,
          });
          setDocumentMode('edit');
          setSidebarOpen(true);
        } else {
          setStatus({ type: 'success', message: 'Document downloaded' });
        }
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Download failed' });
    } finally {
      setGenerating(false);
    }
  }, [generateDocx, matter.displayNumber]);

  const handleSend = useCallback(async () => {
    if (!checkIsLocalDev()) {
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      const { url, unresolvedPlaceholders } = await generateDocx();
      if (unresolvedPlaceholders.length > 0) {
        setStatus({
          type: 'error',
          message: `Complete required fields before sending: ${unresolvedPlaceholders.slice(0, 5).join(', ')}${unresolvedPlaceholders.length > 5 ? '…' : ''}`,
        });
        setDocumentMode('edit');
        setSidebarOpen(true);
        return;
      }
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

  // ─── Prompts tab visibility: local dev (localhost + not viewAsProd) ───
  const promptsVisible = useMemo(() => checkIsLocalDev(), []);
  const isDevMode = promptsVisible;
  const loadBannerTone = isDarkMode ? 'rgba(135,243,243,0.1)' : 'rgba(54,144,206,0.08)';
  const loadBannerBorder = isDarkMode ? 'rgba(135,243,243,0.28)' : 'rgba(54,144,206,0.2)';
  const loadBannerText = isDarkMode ? colours.accent : colours.helixBlue;
  const hasStoredLoad = Boolean(loadInfo?.hasStoredDraft || loadInfo?.hasStoredVersion);
  const loadSourceLabel = loadInfo?.source === 'db'
    ? 'database'
    : loadInfo?.source === 'file-cache'
      ? 'saved cache'
      : loadInfo?.source === 'json-file'
        ? 'saved file'
        : 'stored draft';
  const storedVersionLabel = loadInfo?.version ? `Version ${loadInfo.version}` : 'Stored draft';
  const storedTimestamp = loadInfo?.finalizedAt || loadInfo?.createdAt || null;
  const storedTimestampLabel = storedTimestamp
    ? new Date(storedTimestamp).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  const loadBannerMessage = draftLoaded && hasStoredLoad
    ? `${storedVersionLabel} restored${storedTimestampLabel ? ` · saved ${storedTimestampLabel}` : ''}.`
    : null;
  const [loadNoticeMode, setLoadNoticeMode] = useState<'hidden' | 'restored'>('hidden');
  const [loadNoticeVisible, setLoadNoticeVisible] = useState(false);
  const [loadNoticeClosing, setLoadNoticeClosing] = useState(false);
  const loadNoticeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const SIDEBAR_COLLAPSE_BREAKPOINT = 1680;

  // ─── Sidebar/editing state (hoisted so parsedSections can reference them) ───
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : SIDEBAR_COLLAPSE_BREAKPOINT));
  const [sidebarAutoCollapsed, setSidebarAutoCollapsed] = useState(false);
  const [promptLayout, setPromptLayout] = useState<'inline' | 'stacked'>('inline');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [editingField, setEditingField] = useState<string | null>(null);
  const [activeNavigationKey, setActiveNavigationKey] = useState<string | null>(null);
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paperScrollRef = useRef<HTMLDivElement | null>(null);
  const sidebarContentRef = useRef<HTMLDivElement | null>(null);
  const [fieldPositions, setFieldPositions] = useState<Record<string, number>>({});
  const [promptCardHeights, setPromptCardHeights] = useState<Record<string, number>>({});
  const scrollSyncLock = useRef(false);
  const scrollSyncReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showUserPrompt, setShowUserPrompt] = useState(false);
  const [showOtherDocumentFields, setShowOtherDocumentFields] = useState(false);
  const previousAutoCollapseRef = useRef<boolean | null>(null);

  const pauseScrollSync = useCallback((durationMs = 700) => {
    scrollSyncLock.current = true;
    if (scrollSyncReleaseTimerRef.current) clearTimeout(scrollSyncReleaseTimerRef.current);
    scrollSyncReleaseTimerRef.current = setTimeout(() => {
      scrollSyncLock.current = false;
      scrollSyncReleaseTimerRef.current = null;
    }, durationMs);
  }, []);

  // ─── Support Report & Integration state ───
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [integrations, setIntegrations] = useState<CclIntegrations | null>(null);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [uploadingNd, setUploadingNd] = useState(false);
  const [showNdConfirm, setShowNdConfirm] = useState(false);
  const shouldAutoCollapseSidebar = viewportWidth < SIDEBAR_COLLAPSE_BREAKPOINT;
  const sidebarToggleLabel = sidebarOpen ? 'Hide review panel' : 'Show review panel';
  const sidebarStatusLabel = sidebarOpen ? 'Review panel open' : shouldAutoCollapseSidebar ? 'Review panel auto-collapsed for space' : 'Review panel hidden';

  // documentMode is always 'edit' — preview/edit toggle removed

  // ─── Handlers: support report, integration check, uploads ───
  const matterId = matter.matterId || matter.displayNumber || '';

  // Demo matter detection — bypass server calls entirely
  const isDemoMatter = matterId === 'DEMO-3311402' || matterId === '3311402' || matter.displayNumber === 'HELIX01-01';

  const handleCheckIntegrations = useCallback(async () => {
    if (!matterId || integrationsLoading) return;
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

  useEffect(() => () => {
    if (scrollSyncReleaseTimerRef.current) clearTimeout(scrollSyncReleaseTimerRef.current);
  }, []);

  const clearLoadNoticeTimers = useCallback(() => {
    loadNoticeTimersRef.current.forEach(timer => clearTimeout(timer));
    loadNoticeTimersRef.current = [];
  }, []);

  useEffect(() => {
    clearLoadNoticeTimers();
    setLoadNoticeClosing(false);

    if (hasStoredLoad && loadBannerMessage) {
      setLoadNoticeMode('restored');
      setLoadNoticeVisible(true);
      loadNoticeTimersRef.current.push(setTimeout(() => setLoadNoticeClosing(true), 3200));
      loadNoticeTimersRef.current.push(setTimeout(() => {
        setLoadNoticeVisible(false);
        setLoadNoticeClosing(false);
        setLoadNoticeMode('hidden');
      }, 3600));
      return;
    }

    setLoadNoticeVisible(false);
    setLoadNoticeMode('hidden');
  }, [draftLoaded, hasStoredLoad, loadBannerMessage, clearLoadNoticeTimers, matter.displayNumber, matter.matterId]);

  useEffect(() => () => clearLoadNoticeTimers(), [clearLoadNoticeTimers]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const previous = previousAutoCollapseRef.current;

    if (previous === null) {
      if (shouldAutoCollapseSidebar) {
        setSidebarOpen(false);
        setSidebarAutoCollapsed(true);
      }
      previousAutoCollapseRef.current = shouldAutoCollapseSidebar;
      return;
    }

    if (!previous && shouldAutoCollapseSidebar) {
      setSidebarOpen(false);
      setSidebarAutoCollapsed(true);
    }

    if (previous && !shouldAutoCollapseSidebar && sidebarAutoCollapsed) {
      setSidebarOpen(true);
      setSidebarAutoCollapsed(false);
    }

    previousAutoCollapseRef.current = shouldAutoCollapseSidebar;
  }, [shouldAutoCollapseSidebar, sidebarAutoCollapsed]);

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

  const handleUploadNd = useCallback(async () => {
    if (!integrations?.nd?.available) return;
    setUploadingNd(true);
    try {
      const result = await uploadToNetDocuments({
        matterId,
        matterDisplayNumber: matter.displayNumber || '',
        ndWorkspaceId: integrations.nd.workspaceId || undefined,
        fields,
      });
      if (!result.ok && result.unresolvedPlaceholders && result.unresolvedPlaceholders.length > 0) {
        setStatus({
          type: 'error',
          message: `Upload blocked until fields are completed: ${result.unresolvedPlaceholders.slice(0, 5).join(', ')}${result.unresolvedPlaceholders.length > 5 ? '…' : ''}`,
        });
        setDocumentMode('edit');
        setSidebarOpen(true);
        return;
      }
      setStatus(result.ok
        ? { type: 'success', message: `Uploaded to NetDocuments${matter.displayNumber ? ` as CCL-${matter.displayNumber}.docx` : ''}` }
        : { type: 'error', message: result.error || 'NetDocuments upload failed' });
    } finally {
      setUploadingNd(false);
    }
  }, [matterId, matter.displayNumber, integrations, fields]);

  const AUTO_FILL_KEYS = useMemo(() => new Set([
    'insert_clients_name', 'name_of_person_handling_matter', 'name_of_handler',
    'handler', 'email', 'fee_earner_email', 'fee_earner_phone',
    'fee_earner_postal_address', 'name', 'status', 'handler_hourly_rate',
    'figure', 'state_amount',
    'contact_details_for_marketing_opt_out', 'matter', 'matter_number',
    'insert_heading_eg_matter_description', 'costs_other_party_paragraph',
    'identify_the_other_party_eg_your_opponents',
    'names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries',
    'and_or_intervals_eg_every_three_months',
    'explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement',
    'instructions_link',
  ]), []);

  const hasTemplateMarkers = useCallback((value: string) => /\{\{[^}]+\}\}|\[[^\]]+\]/.test(value), []);

  const fieldProvenance = useMemo(() => {
    const result: Record<string, 'ai' | 'auto-fill' | 'user' | 'default' | 'scaffold' | 'empty'> = {};
    for (const key of Object.keys(fields)) {
      const val = String(fields[key] || '').trim();
      if (!val) { result[key] = 'empty'; continue; }
      if (userEditedKeys?.has(key)) { result[key] = 'user'; continue; }
      if (aiGeneratedKeys?.has(key)) { result[key] = 'ai'; continue; }
      if (AUTO_FILL_KEYS.has(key)) { result[key] = 'auto-fill'; continue; }
      if (hasTemplateMarkers(val)) { result[key] = 'scaffold'; continue; }
      result[key] = 'default';
    }
    return result;
  }, [fields, AUTO_FILL_KEYS, userEditedKeys, aiGeneratedKeys, hasTemplateMarkers]);

  const provColours = useMemo(() => ({
    ai: { border: isDarkMode ? 'rgba(135,243,243,0.52)' : 'rgba(54,144,206,0.48)', bg: isDarkMode ? 'rgba(135,243,243,0.04)' : 'rgba(54,144,206,0.035)', bgHover: isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.07)' },
    'auto-fill': { border: colours.green, bg: isDarkMode ? 'rgba(32,178,108,0.08)' : 'rgba(32,178,108,0.05)', bgHover: isDarkMode ? 'rgba(32,178,108,0.14)' : 'rgba(32,178,108,0.09)' },
    empty: { border: isDarkMode ? 'rgba(214,85,65,0.6)' : 'rgba(214,85,65,0.7)', bg: isDarkMode ? 'rgba(214,85,65,0.05)' : 'rgba(214,85,65,0.03)', bgHover: isDarkMode ? 'rgba(214,85,65,0.1)' : 'rgba(214,85,65,0.08)' },
    default: { border: isDarkMode ? 'rgba(148,163,184,0.45)' : 'rgba(100,116,139,0.35)', bg: isDarkMode ? 'rgba(148,163,184,0.05)' : 'rgba(148,163,184,0.04)', bgHover: isDarkMode ? 'rgba(148,163,184,0.10)' : 'rgba(148,163,184,0.08)' },
    scaffold: { border: isDarkMode ? 'rgba(250,204,21,0.65)' : 'rgba(202,138,4,0.7)', bg: isDarkMode ? 'rgba(250,204,21,0.06)' : 'rgba(250,204,21,0.08)', bgHover: isDarkMode ? 'rgba(250,204,21,0.11)' : 'rgba(250,204,21,0.12)' },
    user: { border: isDarkMode ? colours.blue : colours.missedBlue, bg: isDarkMode ? 'rgba(54,144,206,0.06)' : 'rgba(13,47,96,0.04)', bgHover: isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(13,47,96,0.08)' },
  }), [isDarkMode, accentBlue]);

  // ─── Pressure Test state ───
  const [ptResult, setPtResult] = useState<PressureTestResponse | null>(null);
  const [ptRunning, setPtRunning] = useState(false);
  const [ptError, setPtError] = useState<string | null>(null);
  const [ptSteps, setPtSteps] = useState<{ label: string; status: 'pending' | 'active' | 'done' | 'error'; startMs?: number; durationMs?: number }[]>([]);
  const [ptElapsed, setPtElapsed] = useState(0);
  const ptTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [workflowModalStage, setWorkflowModalStage] = useState<'hidden' | 'generating' | 'safety-net' | 'review-ready'>('hidden');
  const [workflowModalClosing, setWorkflowModalClosing] = useState(false);
  const workflowTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const prevPtResultRef = useRef<PressureTestResponse | null>(null);
  const [reviewCascadeKey, setReviewCascadeKey] = useState(0);

  const clearWorkflowTimers = useCallback(() => {
    workflowTimersRef.current.forEach(timer => clearTimeout(timer));
    workflowTimersRef.current = [];
  }, []);

  const runPressureTest = useCallback(async () => {
    if (ptRunning) return;
    const matterId = matter.matterId || matter.displayNumber;
    if (!matterId || Object.keys(fields).length === 0) return;

    setPtRunning(true);
    setPtError(null);
    setPtResult(null);
    const startMs = Date.now();
    setPtElapsed(0);

    // Define processing steps
    const steps = [
      { label: 'Starting Safety Net review', status: 'active' as const },
      { label: 'Gathering evidence (emails, calls, documents)', status: 'pending' as const },
      { label: 'AI scoring fields against evidence', status: 'pending' as const },
      { label: 'Compiling results', status: 'pending' as const },
    ];
    setPtSteps([...steps]);

    // Start elapsed timer
    if (ptTimerRef.current) clearInterval(ptTimerRef.current);
    ptTimerRef.current = setInterval(() => setPtElapsed(Date.now() - startMs), 200);

    // Simulate phase transitions (the server does all phases in one call,
    // so we advance the visual steps on timers to show progress)
    const phaseTimers = [
      setTimeout(() => setPtSteps(prev => prev.map((s, i) =>
        i === 0 ? { ...s, status: 'done', durationMs: Date.now() - startMs } :
        i === 1 ? { ...s, status: 'active', startMs: Date.now() } : s
      )), 800),
      setTimeout(() => setPtSteps(prev => prev.map((s, i) =>
        i === 1 ? { ...s, status: 'done', durationMs: Date.now() - startMs } :
        i === 2 ? { ...s, status: 'active', startMs: Date.now() } : s
      )), 4000),
    ];

    try {
      const result = await fetchPressureTest({
        matterId,
        instructionRef: matter.instructionRef || '',
        generatedFields: fields,
        practiceArea: matter.practiceArea || '',
        clientName: matter.clientName || '',
      });
      phaseTimers.forEach(clearTimeout);
      const totalMs = Date.now() - startMs;
      setPtSteps(prev => prev.map(s => ({ ...s, status: 'done' as const, durationMs: totalMs })));
      setPtResult(result);
    } catch (err: any) {
      phaseTimers.forEach(clearTimeout);
      console.error('[CCL] Pressure test failed:', err);
      setPtError(err?.message || 'Safety Net Pressure Test failed — check server logs');
      setPtSteps(prev => prev.map(s =>
        s.status === 'active' ? { ...s, status: 'error' as const } :
        s.status === 'pending' ? { ...s, status: 'error' as const } : s
      ));
    } finally {
      if (ptTimerRef.current) { clearInterval(ptTimerRef.current); ptTimerRef.current = null; }
      setPtRunning(false);
    }
  }, [ptRunning, matter, fields]);

  // Pressure test is user-initiated — no auto-trigger on AI completion.
  const prevAiStatus = useRef(aiStatus);
  useEffect(() => {
    prevAiStatus.current = aiStatus;
  }, [aiStatus]);

  useEffect(() => {
    if (aiStatus === 'loading') {
      clearWorkflowTimers();
      setWorkflowModalClosing(false);
      setWorkflowModalStage('generating');
      return;
    }

    if (ptRunning) {
      clearWorkflowTimers();
      setWorkflowModalClosing(false);
      setWorkflowModalStage('safety-net');
      return;
    }

    if (workflowModalStage !== 'review-ready') {
      setWorkflowModalStage('hidden');
      setWorkflowModalClosing(false);
    }
  }, [aiStatus, ptRunning, workflowModalStage, clearWorkflowTimers]);

  useEffect(() => {
    const previousResult = prevPtResultRef.current;

    if (ptResult && ptResult !== previousResult) {
      clearWorkflowTimers();
      setWorkflowModalClosing(false);
      setWorkflowModalStage('review-ready');
      setSidebarOpen(true);
      setSidebarAutoCollapsed(false);
      setReviewCascadeKey(prev => prev + 1);
      workflowTimersRef.current.push(setTimeout(() => setWorkflowModalClosing(true), 1100));
      workflowTimersRef.current.push(setTimeout(() => {
        setWorkflowModalStage('hidden');
        setWorkflowModalClosing(false);
      }, 1500));
    }

    prevPtResultRef.current = ptResult;
  }, [ptResult, clearWorkflowTimers]);

  useEffect(() => () => clearWorkflowTimers(), [clearWorkflowTimers]);

  const ptSummary = useMemo(() => {
    if (!ptResult) return null;
    const scores = Object.values(ptResult.fieldScores);
    const avg = scores.length > 0 ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length : 0;
    return {
      average: Math.round(avg * 10) / 10,
      flaggedCount: ptResult.flaggedCount,
      reviewedFields: scores.length,
    };
  }, [ptResult]);

  const workflowModalActive = workflowModalStage !== 'hidden';

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

  const fieldPromptByKey = FIELD_PROMPT_MAP;

  const getEmptyFieldLabel = useCallback((fieldKey: string) => {
    const documentRequestKeys = [
      'describe_first_document_or_information_you_need_from_your_client',
      'describe_second_document_or_information_you_need_from_your_client',
      'describe_third_document_or_information_you_need_from_your_client',
    ];
    if (fieldKey === documentRequestKeys[0]) {
      return 'Documents / information needed from client (up to 3 items)';
    }
    if (documentRequestKeys.includes(fieldKey)) {
      return '';
    }
    if (fieldPromptByKey[fieldKey]?.label) return fieldPromptByKey[fieldKey].label;
    if (fieldLabelMap[fieldKey]) return fieldLabelMap[fieldKey];
    return fieldKey
      .replace(/^insert_/, '')
      .replace(/^describe_/, '')
      .replace(/^state_/, '')
      .replace(/_eg_.+$/, '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }, [fieldPromptByKey, fieldLabelMap]);

  /** Convert plain-text URLs, emails, and phone numbers into clickable <a> elements */
  const linkifyText = useCallback((segment: string, keyBase: string): React.ReactNode => {
    const linkRe = /(https?:\/\/[^\s,)]+)|(\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b)|(\b0\d{4}\s?\d{3}\s?\d{3}\b)/g;
    if (!linkRe.test(segment)) return segment;
    linkRe.lastIndex = 0;
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = linkRe.exec(segment)) !== null) {
      if (m.index > last) nodes.push(segment.slice(last, m.index));
      const matched = m[0];
      const href = m[1] ? matched : m[2] ? `mailto:${matched}` : `tel:${matched.replace(/\s/g, '')}`;
      nodes.push(
        <a
          key={`${keyBase}-link-${idx}`}
          href={href}
          target={m[1] ? '_blank' : undefined}
          rel={m[1] ? 'noopener noreferrer' : undefined}
          style={{
            color: colours.highlight,
            fontWeight: 700,
            textDecoration: 'underline',
            textDecorationColor: colours.highlight,
            textUnderlineOffset: '2px',
          }}
        >
          {matched}
        </a>
      );
      last = m.index + matched.length;
      idx++;
    }
    if (last < segment.length) nodes.push(segment.slice(last));
    return nodes.length === 1 ? nodes[0] : <>{nodes}</>;
  }, []);

  /** Turn a text fragment that may contain {{field_key}} placeholders into React nodes
   *  with inline-editable, provenance-coloured spans */
  const renderWithFields = useCallback((rawText: string, keyPrefix: string): React.ReactNode => {
    const placeholderRe = /\{\{([^}]+)\}\}/g;
    if (!placeholderRe.test(rawText)) return linkifyText(rawText, keyPrefix);
    placeholderRe.lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let partIdx = 0;
    while ((match = placeholderRe.exec(rawText)) !== null) {
      if (match.index > lastIndex) {
        parts.push(linkifyText(rawText.slice(lastIndex, match.index), `${keyPrefix}-txt-${partIdx}`));
      }
      const fk = match[1];
      const val = fields[fk] || '';
      const prov = fieldProvenance[fk] || 'empty';
      const pc = provColours[prov] || provColours.default;
      const canEdit = documentMode === 'edit' && typeof updateField === 'function';
      const isEditing = canEdit && editingField === fk;
      const isLinkedHighlight = highlightedField === fk || hoveredField === fk;

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
        // Final-document preview — subtle provenance indicators so users can
        // see which fields were AI-generated vs user-edited vs empty.
        const showProv = prov !== 'empty';
        const isAiField = prov === 'ai';
        const isScaffoldField = prov === 'scaffold';
        const isEmptyField = prov === 'empty';
        const emptyLabel = getEmptyFieldLabel(fk);
        const shouldRenderEmptyPrompt = isEmptyField && !!emptyLabel;
        parts.push(
          <span
            key={`${keyPrefix}-${fk}-${partIdx}`}
            data-ccl-field={fk}
            data-prov={prov}
            onClick={canEdit ? () => setEditingField(fk) : undefined}
            onMouseEnter={() => setHoveredField(fk)}
            onMouseLeave={() => setHoveredField(prev => (prev === fk ? null : prev))}
            title={canEdit ? `Click to edit (${prov === 'ai' ? 'AI-generated' : prov === 'auto-fill' ? 'Mail-merge field' : prov === 'scaffold' ? 'Template scaffold' : prov === 'user' ? 'User-edited' : prov === 'default' ? 'Default copy' : prov})` : prov !== 'empty' ? prov : undefined}
            style={{
              cursor: canEdit ? 'text' : 'inherit',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              maxWidth: '100%',
              boxShadow: isLinkedHighlight
                ? `0 0 0 2px ${isDarkMode ? 'rgba(135,243,243,0.22)' : 'rgba(54,144,206,0.18)'}`
                : undefined,
              ...(shouldRenderEmptyPrompt ? {
                display: 'inline-block',
                padding: '1px 4px',
                borderRadius: 2,
                borderBottom: `1px dashed ${isDarkMode ? 'rgba(214,85,65,0.6)' : 'rgba(214,85,65,0.45)'}`,
                background: isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.05)',
                color: isDarkMode ? '#f0a090' : colours.cta,
                fontSize: '0.92em',
                fontStyle: 'italic',
              } : {}),
              ...(showProv ? {
                borderBottom: `1.5px solid ${pc.border}`,
                background: isAiField ? pc.bg : pc.bg,
                borderRadius: 2,
                paddingBottom: 1,
                ...(isAiField ? {
                  padding: '0 2px 1px',
                } : isScaffoldField ? {
                  padding: '1px 3px',
                  borderLeft: `2px dashed ${pc.border}`,
                } : {}),
              } : {}),
            }}
          >
            {val || (shouldRenderEmptyPrompt ? `[${emptyLabel}]` : '')}
          </span>
        );
      }
      lastIndex = match.index + match[0].length;
      partIdx++;
    }
    if (lastIndex < rawText.length) {
      parts.push(linkifyText(rawText.slice(lastIndex), `${keyPrefix}-tail`));
    }
    return <>{parts}</>;
  }, [fields, fieldProvenance, provColours, editingField, updateField, documentMode, linkifyText, getEmptyFieldLabel, isDarkMode, highlightedField, hoveredField]);

  const renderChecklistCellContent = useCallback((primaryText: string, extraLines: string[], keyPrefix: string, tone: 'body' | 'muted' = 'body') => {
    const cleanedExtraLines = extraLines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[•*—–\-]\s*/, '').trim())
      .filter(Boolean);

    return (
      <div>
        <div>{renderWithFields(primaryText, `${keyPrefix}-primary`)}</div>
        {cleanedExtraLines.length > 0 && (
          <ul style={{
            margin: '10px 0 0 0',
            paddingLeft: 0,
            listStyleType: 'none',
          }}>
            {cleanedExtraLines.map((line, index) => (
              <li key={`${keyPrefix}-bullet-${index}`} style={{
                display: 'grid',
                gridTemplateColumns: '10px minmax(0, 1fr)',
                columnGap: 8,
                alignItems: 'start',
                marginBottom: 6,
                lineHeight: 1.6,
                color: tone === 'muted' ? textMuted : text,
                fontWeight: tone === 'muted' ? 400 : 500,
              }}>
                <span style={{
                  marginTop: 7,
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: accentBlue,
                  display: 'inline-block',
                }} />
                <span style={{ display: 'block', minWidth: 0 }}>
                  {renderWithFields(line, `${keyPrefix}-line-${index}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }, [accentBlue, renderWithFields, text, textMuted]);

  /** Parse template text into grouped sections for collapsible rendering */
  const parsedSections = useMemo((): PreviewSection[] => {
    const lines = documentSource.split('\n');
    const sections: PreviewSection[] = [];
    let current: PreviewSection = { id: 'intro', number: '', title: '', elements: [], isSubsection: false };
    let key = 0;
    let i = 0;

    // Patterns
    const sectionRe = /^(\d+(?:\.\d+)?)\s+(.+)$/;
    const bulletRe = /^[—–\-•*]\s*(.+)$/;
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
          const items: { action: string; info: string; documents: string[] }[] = [];
          while (i < lines.length) {
            const cl = lines[i].trimEnd();
            if (checkboxRe.test(cl)) {
              const raw = cl.replace(/^☐\s*/, '');
              const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
              const action = parts[0] || '';
              const documents: string[] = [];
              let nextIdx = i + 1;

              if (action.includes('Provide the following documents')) {
                while (nextIdx < lines.length) {
                  const nextLine = lines[nextIdx].trimEnd();
                  if (!nextLine.trim()) {
                    if (documents.length === 0) {
                      nextIdx++;
                      continue;
                    }
                    break;
                  }
                  if (checkboxRe.test(nextLine) || sectionRe.test(nextLine) || tableRowRe.test(nextLine)) {
                    break;
                  }
                  documents.push(nextLine.trim());
                  nextIdx++;
                }
              }

              items.push({ action, info: parts[1] || '', documents });
              i = documents.length > 0 ? nextIdx : i + 1;
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
                    }}>{renderChecklistCellContent(item.action, item.documents, `tbl-a-${ci}`)}</td>
                    {item.info ? (
                      <td style={{
                        padding: '10px 12px', verticalAlign: 'top',
                        borderBottom: `1px solid ${tableBorder}`,
                        color: textMuted, fontSize: 11,
                      }}>{renderChecklistCellContent(item.info, [], `tbl-i-${ci}`, 'muted')}</td>
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
        // Check if any resolved paragraph lines start with bullet markers (•, *, -)
        // This catches AI-filled fields like {{describe_first_document...}} → "• A copy of..."
        const resolvedBullets: { lineIdx: number; text: string; key: string }[] = [];
        const plainParas: { lineIdx: number; text: string }[] = [];
        const bulletValueRe = /^[•*—–\-]\s+/;
        for (let li = 0; li < paraLines.length; li++) {
          const pl = paraLines[li];
          const phMatch = pl.match(/^\{\{([^}]+)\}\}$/);
          const resolvedVal = phMatch ? (fields[phMatch[1]] || '').toString().trim() : '';
          if (phMatch && resolvedVal && bulletValueRe.test(resolvedVal)) {
            resolvedBullets.push({ lineIdx: li, text: pl, key: phMatch[1] });
          } else {
            plainParas.push({ lineIdx: li, text: pl });
          }
        }

        if (resolvedBullets.length > 0) {
          // Render non-bullet lines before the first bullet as a paragraph
          const firstBulletIdx = resolvedBullets[0].lineIdx;
          const prefixLines = paraLines.slice(0, firstBulletIdx);
          if (prefixLines.length > 0) {
            current.elements.push(
              <p key={key++} style={{ margin: '0 0 10px 0', lineHeight: 1.7, whiteSpace: 'pre-wrap', textAlign: 'justify', textJustify: 'inter-word' }}>
                {renderWithFields(prefixLines.join('\n'), `p-${key}`)}
              </p>
            );
          }
          // Render bullet items as a styled <ul> — same accent-dot style as template bullets
          current.elements.push(
            <ul key={key++} style={{
              margin: '6px 0 10px 8px',
              paddingLeft: 20,
              listStyleType: 'none',
            }}>
              {resolvedBullets.map((rb, bi) => {
                // Strip the leading bullet marker from the field value for display
                const rawVal = (fields[rb.key] || '').toString();
                const strippedVal = rawVal.replace(/^[•*—–\-]\s+/, '');
                return (
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
                    {renderWithFields(strippedVal, `bullet-val-${bi}`)}
                  </li>
                );
              })}
            </ul>
          );
          // Render any trailing non-bullet lines as a paragraph
          const lastBulletIdx = resolvedBullets[resolvedBullets.length - 1].lineIdx;
          const suffixLines = paraLines.slice(lastBulletIdx + 1);
          if (suffixLines.length > 0) {
            current.elements.push(
              <p key={key++} style={{ margin: '0 0 10px 0', lineHeight: 1.7, whiteSpace: 'pre-wrap', textAlign: 'justify', textJustify: 'inter-word' }}>
                {renderWithFields(suffixLines.join('\n'), `p-${key}`)}
              </p>
            );
          }
        } else {
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
            textAlign: isGreeting || isClosing ? 'left' : 'justify',
            textJustify: isGreeting || isClosing ? undefined : 'inter-word',
            ...(isGreeting ? { fontWeight: 600, marginBottom: 14 } : {}),
            ...(isClosing ? { marginTop: 18 } : {}),
          }}>
            {renderWithFields(paraText, `p-${key}`)}
          </p>
        );
        }
      }
    }
    // Finalise last section
    if (current.elements.length > 0) sections.push(current);
    return sections;
  }, [documentSource, isDarkMode, headingColor, tableBorder, textMuted, accentBlue, text, renderWithFields, fields]);

  // ─── A4 page break system ─────────────────────────────────────────────────
  // Each page is rendered as its own 794×1123 card with consistent margins.
  // Page 1 carries the letterhead and footer treatment.
  // Continuation pages only reserve space for the page-number box. Oversized sections can continue onto later pages.
  const A4_WIDTH = 794;
  const A4_HEIGHT = 1123;
  const PAGE_MARGIN = 64;          // left + right page margin
  const PAGE_TOP = 56;             // top padding inside page
  const PAGE_BOTTOM = 56;          // bottom padding inside page
  const PAGE_NUMBER_BOX_H = 34;    // reserved for the boxed page number on every page
  const FIRST_PAGE_FOOTER_H = 82;  // additional footer treatment on page 1
  const SECTION_HEIGHT_FLOOR = 180;
  const SUBSECTION_HEIGHT_FLOOR = 132;

  useEffect(() => {
    // Small delay so DOM has settled after content changes
    const timer = setTimeout(() => {
      const heights: Record<string, number> = {};
      const elementHeights: Record<string, number> = {};
      for (const [num, el] of Object.entries(sectionRefs.current)) {
        if (el) heights[num] = el.offsetHeight;
      }
      for (const [key, el] of Object.entries(sectionElementRefs.current)) {
        if (el) elementHeights[key] = el.offsetHeight;
      }
      if (introRef.current) heights['__intro'] = introRef.current.offsetHeight;
      if (letterheadRef.current) heights['__letterhead'] = letterheadRef.current.offsetHeight;
      if (recipientRef.current) heights['__recipient'] = recipientRef.current.offsetHeight;
      setMeasuredSectionHeights(heights);
      setMeasuredSectionElementHeights(elementHeights);
    }, 200);
    return () => clearTimeout(timer);
  }, [parsedSections, fields]);

  /** Page layout: group section chunks into pages with measured block heights */
  const sectionPages = useMemo(() => {
    const headerH = measuredSectionHeights['__letterhead'] || 160;
    const recipientH = measuredSectionHeights['__recipient'] || 80;
    const introH = measuredSectionHeights['__intro'] || 40;
    const firstPageContent = A4_HEIGHT - PAGE_TOP - PAGE_BOTTOM - headerH - recipientH - introH - FIRST_PAGE_FOOTER_H - PAGE_NUMBER_BOX_H;
    const nextPageContent = A4_HEIGHT - PAGE_TOP - PAGE_BOTTOM - PAGE_NUMBER_BOX_H;

    const pages: { pageNumber: number; sections: PreviewSection[] }[] = [];
    let pageNum = 1;
    let pageMax = firstPageContent;
    let currentPageHeight = 0;
    let currentPageSections: PreviewSection[] = [];
    const displaySections = parsedSections.filter(s => s.id !== 'intro');

    const startNewPage = () => {
      if (currentPageSections.length > 0) {
        pages.push({ pageNumber: pageNum, sections: currentPageSections });
      }
      pageNum += 1;
      pageMax = nextPageContent;
      currentPageHeight = 0;
      currentPageSections = [];
    };

    for (const section of displaySections) {
      const headingHeight = section.isSubsection ? 34 : 42;
      const elementFallbackHeight = Math.max(
        64,
        Math.round((section.isSubsection ? SUBSECTION_HEIGHT_FLOOR : SECTION_HEIGHT_FLOOR) / Math.max(section.elements.length, 1))
      );
      let chunkElements: React.ReactNode[] = [];
      let chunkSourceIndices: number[] = [];
      let chunkHeight = headingHeight;
      let chunkIndex = 0;

      const commitChunk = () => {
        if (chunkElements.length === 0) return;
        currentPageSections.push({
          ...section,
          id: `${section.id}-page-${pageNum}-chunk-${chunkIndex}`,
          elements: chunkElements,
          sourceElementIndices: chunkSourceIndices,
        });
        currentPageHeight += chunkHeight;
        chunkElements = [];
        chunkSourceIndices = [];
        chunkHeight = headingHeight;
        chunkIndex += 1;
      };

      section.elements.forEach((element, elementIndex) => {
        const measuredHeight = measuredSectionElementHeights[getSectionElementMeasurementKey(section.number, elementIndex)] || 0;
        const elementHeight = Math.max(measuredHeight, elementFallbackHeight);
        const requiredHeight = chunkHeight + elementHeight;

        if (chunkElements.length === 0) {
          if (currentPageHeight > 0 && currentPageHeight + requiredHeight > pageMax) {
            startNewPage();
          }
        } else if (currentPageHeight + requiredHeight > pageMax) {
          commitChunk();
          startNewPage();
      }

        chunkElements.push(element);
        chunkSourceIndices.push(elementIndex);
        chunkHeight += elementHeight;
      });

      if (chunkElements.length > 0) {
        if (currentPageHeight > 0 && currentPageHeight + chunkHeight > pageMax) {
          startNewPage();
        }
        commitChunk();
      }
    }
    if (currentPageSections.length > 0) {
      pages.push({ pageNumber: pageNum, sections: currentPageSections });
    }
    return pages;
  }, [parsedSections, measuredSectionHeights, measuredSectionElementHeights, getSectionElementMeasurementKey]);

  const handlePrintPdf = useCallback(() => {
    const printWindow = window.open('', '_blank', 'width=800,height=1000');
    if (!printWindow) {
      setStatus({ type: 'error', message: 'Pop-up blocked — allow pop-ups and try again' });
      return;
    }

    // Parse content into structured HTML blocks, then lay them out using the preview's page groups
    const lines = cleanedContent.split('\n');
    let idx = 0;
    const sectionRe = /^(\d+(?:\.\d+)?)\s+(.+)$/;
    const bulletRe = /^[—–\-•*]\s*(.+)$/;
    const checkboxRe = /^☐\s*(.+)$/;
    const tableRowRe = /^.+\|.+$/;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const renderInlineHtml = (value: string) => {
      const linkRe = /(https?:\/\/[^\s,)]+)|(\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b)|(\b0\d{4}\s?\d{3}\s?\d{3}\b)/g;
      let last = 0;
      let output = '';
      let match: RegExpExecArray | null;
      while ((match = linkRe.exec(value)) !== null) {
        output += esc(value.slice(last, match.index));
        const matched = esc(match[0]);
        const href = match[1] ? match[0] : match[2] ? `mailto:${match[0]}` : `tel:${match[0].replace(/\s/g, '')}`;
        const attrs = match[1] ? ' target="_blank" rel="noopener noreferrer"' : '';
        output += `<a class="inline-link" href="${esc(href)}"${attrs}>${matched}</a>`;
        last = match.index + match[0].length;
      }
      output += esc(value.slice(last));
      return output.replace(/\n/g, '<br>');
    };

    const introParts: string[] = [];
    const parsedPrintSections: Array<{ number: string; title: string; isSubsection: boolean; html: string }> = [];
    let currentPrintSection: { number: string; title: string; isSubsection: boolean; parts: string[] } | null = null;

    const pushPrintHtml = (html: string) => {
      if (currentPrintSection) {
        currentPrintSection.parts.push(html);
        return;
      }
      introParts.push(html);
    };

    const flushPrintSection = () => {
      if (!currentPrintSection) return;
      parsedPrintSections.push({
        number: currentPrintSection.number,
        title: currentPrintSection.title,
        isSubsection: currentPrintSection.isSubsection,
        html: currentPrintSection.parts.join(''),
      });
      currentPrintSection = null;
    };

    while (idx < lines.length) {
      const line = lines[idx].trimEnd();
      if (!line.trim()) { idx++; continue; }

      const sm = line.match(sectionRe);
      if (sm) {
        flushPrintSection();
        currentPrintSection = {
          number: sm[1],
          title: sm[2],
          isSubsection: sm[1].includes('.'),
          parts: [],
        };
        idx++; continue;
      }

      if (bulletRe.test(line)) {
        let bulletHtml = '<ul>';
        while (idx < lines.length) {
          const bl = lines[idx].trimEnd();
          if (bulletRe.test(bl)) {
            const m = bl.match(bulletRe);
            if (m) bulletHtml += `<li>${esc(m[1])}</li>`;
            idx++;
          } else if (!bl.trim()) {
            let peek = idx + 1;
            while (peek < lines.length && !lines[peek].trim()) peek++;
            if (peek < lines.length && bulletRe.test(lines[peek].trimEnd())) {
              idx = peek;
            } else { break; }
          } else { break; }
        }
        bulletHtml += '</ul>';
        pushPrintHtml(bulletHtml);
        continue;
      }

      if (checkboxRe.test(line)) {
        let checklistHtml = '<table class="checklist"><tbody>';
        while (idx < lines.length) {
          const cl = lines[idx].trimEnd();
          if (checkboxRe.test(cl)) {
            const raw = cl.replace(/^☐\s*/, '');
            const parts = raw.split('|').map((s: string) => s.trim());
            checklistHtml += `<tr><td class="cb"></td><td><strong>${esc(parts[0])}</strong>${parts[1] ? `<br><span class="muted">${esc(parts[1])}</span>` : ''}</td></tr>`;
            idx++;
          } else if (!cl.trim()) {
            let peek = idx + 1;
            while (peek < lines.length && !lines[peek].trim()) peek++;
            if (peek < lines.length && checkboxRe.test(lines[peek].trimEnd())) { idx = peek; } else { break; }
          } else { break; }
        }
        checklistHtml += '</tbody></table>';
        pushPrintHtml(checklistHtml);
        continue;
      }

      if (tableRowRe.test(line)) {
        // Peek ahead: if next non-empty line is a checkbox, render as action checklist
        let peekIdx = idx + 1;
        while (peekIdx < lines.length && !lines[peekIdx].trim()) peekIdx++;
        if (peekIdx < lines.length && checkboxRe.test(lines[peekIdx].trimEnd())) {
          const headers = line.split('|').map((s: string) => s.trim());
          idx++; // skip header
          let checklistTableHtml = '<table class="checklist"><thead><tr><th class="cb"></th>';
          headers.forEach(h => { checklistTableHtml += `<th>${esc(h)}</th>`; });
          checklistTableHtml += '</tr></thead><tbody>';
          while (idx < lines.length) {
            const cl = lines[idx].trimEnd();
            if (checkboxRe.test(cl)) {
              const raw = cl.replace(/^☐\s*/, '');
              const parts = raw.split('|').map((s: string) => s.trim());
              const action = parts[0] || '';
              const documents: string[] = [];
              let nextIdx = idx + 1;
              if (action.includes('Provide the following documents')) {
                while (nextIdx < lines.length) {
                  const nextLine = lines[nextIdx].trimEnd();
                  if (!nextLine.trim()) {
                    if (documents.length === 0) {
                      nextIdx++;
                      continue;
                    }
                    break;
                  }
                  if (checkboxRe.test(nextLine) || sectionRe.test(nextLine) || tableRowRe.test(nextLine)) break;
                  documents.push(nextLine.trim());
                  nextIdx++;
                }
              }
              const documentsHtml = documents.length > 0
                ? `<ul class="checklist-sublist">${documents.map((doc) => `<li><span class="checklist-sublist-marker"></span><span class="checklist-sublist-text">${renderInlineHtml(doc.replace(/^[•*—–\-]\s*/, ''))}</span></li>`).join('')}</ul>`
                : '';
              checklistTableHtml += `<tr><td class="cb"></td><td><strong>${renderInlineHtml(action)}</strong>${documentsHtml}</td>${parts[1] ? `<td class="muted">${renderInlineHtml(parts[1])}</td>` : '<td></td>'}</tr>`;
              idx = documents.length > 0 ? nextIdx : idx + 1;
            } else if (!cl.trim()) {
              let pk = idx + 1;
              while (pk < lines.length && !lines[pk].trim()) pk++;
              if (pk < lines.length && checkboxRe.test(lines[pk].trimEnd())) { idx = pk; } else { break; }
            } else { break; }
          }
          checklistTableHtml += '</tbody></table>';
          pushPrintHtml(checklistTableHtml);
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
          let tableHtml = '<table class="data"><thead><tr>';
          header.forEach(c => { tableHtml += `<th>${esc(c)}</th>`; });
          tableHtml += '</tr></thead>';
          if (body.length) {
            tableHtml += '<tbody>';
            body.forEach(r => { tableHtml += '<tr>'; r.forEach(c => { tableHtml += `<td>${esc(c)}</td>`; }); tableHtml += '</tr>'; });
            tableHtml += '</tbody>';
          }
          tableHtml += '</table>';
          pushPrintHtml(tableHtml);
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
        const pt = renderInlineHtml(pLines.join('\n'));
        const cls = pt.startsWith('Dear ') ? ' class="greeting"' : (/^(Please contact me|Kind regards|Yours)/i.test(pt) ? ' class="closing"' : '');
        pushPrintHtml(`<p${cls}>${pt}</p>`);
      }
    }

    flushPrintSection();

    const introHtml = introParts.join('');
    const sectionHtmlByNumber = Object.fromEntries(parsedPrintSections.map(section => [section.number, section.html]));
    const printPages = sectionPages.length > 0 ? sectionPages : [{ pageNumber: 1, sections: [] }];
    const renderPrintSection = (section: PreviewSection) => {
      const bodyHtml = sectionHtmlByNumber[section.number] || '';
      return `<section class="section-block${section.isSubsection ? ' subsection' : ''}">
        <div class="${section.isSubsection ? 'sub' : 'sec'}">${esc(section.number)}&ensp;${esc(section.title)}</div>
        <div class="section-content${section.isSubsection ? ' subsection-content' : ''}">${bodyHtml}</div>
      </section>`;
    };
    const pagesMarkup = printPages.map((page, index) => {
      const isFirstPage = index === 0;
      const sectionsMarkup = page.sections.map(renderPrintSection).join('');
      return `<section class="page${isFirstPage ? ' first-page' : ''}">
        ${isFirstPage ? `<div class="header">
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
        </div>` : ''}
        <div class="page-body">
          ${isFirstPage && introHtml ? `<div class="intro">${introHtml}</div>` : ''}
          ${sectionsMarkup}
        </div>
        ${isFirstPage ? `<div class="footer">Helix Law Ltd is authorised and regulated by the Solicitors Regulation Authority (SRA No. 669720)<br>Registered in England &amp; Wales No. 10346944</div>` : ''}
        <div class="page-number-wrap"><span class="page-number-box">${page.pageNumber}</span></div>
      </section>`;
    }).join('');

    printWindow.document.write(`<!DOCTYPE html><html><head><title>CCL — ${matter.displayNumber || 'Draft'}</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { margin: 0; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Raleway', Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.65; color: #061733; padding: 0; background: #fff; }
  .page { width: 210mm; min-height: 297mm; padding: 20mm 22mm 18mm 22mm; display: flex; flex-direction: column; page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .page-body { flex: 1; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20pt; padding-bottom: 14pt; border-bottom: 1.5pt solid #0D2F60; }
  .header .logo img { width: 180px; height: auto; }
  .header .logo .addr { font-size: 7.5pt; color: #64748b; line-height: 1.5; margin-top: 6pt; }
  .header .details { text-align: right; font-size: 8.5pt; color: #64748b; line-height: 1.5; }
  .header .details .ref { font-size: 9pt; font-weight: 700; color: #0D2F60; margin-bottom: 4pt; }
  .section-block { break-inside: avoid; page-break-inside: avoid; margin-bottom: 10pt; }
  .section-content { padding-left: 14pt; margin-top: 2pt; }
  .subsection-content { padding-left: 20pt; }
  h2.sec { font-size: 11pt; font-weight: 700; color: #0D2F60; margin: 14pt 0 4pt; }
  h3.sub { font-size: 10pt; font-weight: 700; color: #0D2F60; margin: 10pt 0 3pt; padding-left: 14pt; }
  .sec { font-size: 11pt; font-weight: 700; color: #0D2F60; margin: 14pt 0 4pt; }
  .sub { font-size: 10pt; font-weight: 700; color: #0D2F60; margin: 10pt 0 3pt; padding-left: 14pt; }
  p { margin: 0 0 8pt; line-height: 1.65; padding-left: 14pt; text-align: justify; text-justify: inter-word; }
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
  table.checklist .checklist-sublist { margin: 7pt 0 0 0; padding-left: 0; list-style: none; }
  table.checklist .checklist-sublist li { display: grid; grid-template-columns: 8pt minmax(0, 1fr); column-gap: 6pt; align-items: start; margin-bottom: 4pt; line-height: 1.55; }
  table.checklist .checklist-sublist-marker { display: inline-block; width: 4pt; height: 4pt; border-radius: 50%; background: #3690CE; margin-top: 6pt; }
  table.checklist .checklist-sublist-text { display: block; min-width: 0; }
  a.inline-link { color: #3690CE; font-weight: 700; text-decoration: underline; text-decoration-color: #3690CE; text-underline-offset: 1.5pt; }
  .intro { margin-bottom: 8pt; }
  .footer { margin-top: 20pt; padding-top: 10pt; border-top: 0.5pt solid #e2e8f0; font-size: 7pt; color: #94a3b8; text-align: center; line-height: 1.5; }
  .recipient { margin-bottom: 16pt; font-size: 10pt; line-height: 1.6; }
  .recipient .name { font-weight: 600; margin-bottom: 1pt; }
  .recipient .re { color: #64748b; font-size: 9pt; }
  .page-number-wrap { margin-top: 10pt; text-align: center; }
  .page-number-box { display: inline-flex; align-items: center; justify-content: center; min-width: 22pt; height: 18pt; padding: 0 8pt; border: 1pt solid #cbd5e1; border-radius: 999pt; font-size: 8pt; font-weight: 700; color: #64748b; letter-spacing: 0.04em; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
${pagesMarkup}
</body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 600);
  }, [cleanedContent, fields, matter.clientName, matter.description, matter.displayNumber, sectionPages]);

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
    setActiveNavigationKey(fieldKey);
    // Highlight animation
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedField(fieldKey);
    highlightTimerRef.current = setTimeout(() => setHighlightedField(null), 1500);
    // Small delay so sidebar renders before scroll
    setTimeout(() => {
      pauseScrollSync(420);
      const el = document.querySelector(`[data-ccl-qf="${fieldKey}"]`) as HTMLElement | null;
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
    }, 100);
  }, [pauseScrollSync]);

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

  const PROMPT_GROUPS = useMemo(() => ([
    {
      leadKey: 'next_steps',
      label: 'Next Steps & Timescale',
      memberKeys: ['next_steps', 'realistic_timescale'],
      typeText: 'Grouped Prompt',
    },
    {
      leadKey: 'handler_hourly_rate',
      label: 'Charges & Hourly Rate',
      memberKeys: ['handler_hourly_rate', 'charges_estimate_paragraph'],
      typeText: 'Grouped Prompt',
    },
    {
      leadKey: 'costs_other_party_paragraph',
      label: 'Other Party Costs Risk',
      memberKeys: ['costs_other_party_paragraph', 'identify_the_other_party_eg_your_opponents'],
      typeText: 'Grouped Prompt',
    },
    {
      leadKey: 'insert_next_step_you_would_like_client_to_take',
      label: 'Action Points',
      memberKeys: [
        'insert_next_step_you_would_like_client_to_take',
        'state_why_this_step_is_important',
        'state_amount',
        'insert_consequence',
        'describe_first_document_or_information_you_need_from_your_client',
        'describe_second_document_or_information_you_need_from_your_client',
        'describe_third_document_or_information_you_need_from_your_client',
      ],
      typeText: 'Grouped Prompt',
    },
  ]), []);

  const promptGroupByKey = useMemo(() => {
    const map: Record<string, { leadKey: string; label: string; memberKeys: string[]; typeText: string }> = {};
    PROMPT_GROUPS.forEach(group => {
      group.memberKeys.forEach(key => {
        map[key] = group;
      });
    });
    return map;
  }, [PROMPT_GROUPS]);

  const getLeadNavigationKey = useCallback((fieldKey: string) => {
    return promptGroupByKey[fieldKey]?.leadKey || fieldKey;
  }, [promptGroupByKey]);

  const promptReviewCardCount = useMemo(() => {
    const cardKeys = new Set(FIELD_PROMPTS.map(fp => promptGroupByKey[fp.key]?.leadKey || fp.key));
    return cardKeys.size;
  }, [promptGroupByKey]);

  const nextReviewCard = useMemo(() => {
    const seen = new Set<string>();
    for (const fp of FIELD_PROMPTS) {
      const promptGroup = promptGroupByKey[fp.key];
      const cardKey = promptGroup?.leadKey || fp.key;
      if (seen.has(cardKey)) continue;
      seen.add(cardKey);

      const cardPrompts = promptGroup
        ? promptGroup.memberKeys.map(key => fieldPromptByKey[key]).filter(Boolean)
        : [fp];
      const unresolvedPrompts = cardPrompts.filter(prompt => {
        const value = String(fields[prompt.key] || '').trim();
        const prov = fieldProvenance[prompt.key] || 'empty';
        return !value || prov === 'scaffold';
      });
      if (unresolvedPrompts.length === 0) continue;

      return {
        key: cardKey,
        label: promptGroup?.label || fp.label,
        section: cardPrompts[0]?.section || fp.section,
        outstandingCount: unresolvedPrompts.length,
        nextLabel: unresolvedPrompts[0]?.label || fp.label,
      };
    }
    return null;
  }, [fieldPromptByKey, fields, fieldProvenance, promptGroupByKey]);

  const otherDocumentFields = useMemo(() => (
    CCL_SECTIONS
      .flatMap(section => section.fields)
      .filter(field => !FIELD_PROMPT_MAP[field.key])
      .map(field => field.label)
  ), []);

  const GROUPED_INLINE_SECTIONS = useMemo(() => new Set(['18']), []);

  const groupedInlineSectionAnchors = useMemo(() => {
    const anchors: Record<string, number> = {};
    FIELD_PROMPTS.forEach(fp => {
      if (!GROUPED_INLINE_SECTIONS.has(fp.section)) return;
      const y = fieldPositions[fp.key];
      if (y == null) return;
      anchors[fp.section] = anchors[fp.section] == null ? y : Math.min(anchors[fp.section], y);
    });
    return anchors;
  }, [fieldPositions, GROUPED_INLINE_SECTIONS]);

  // ─── Measure field positions in the A4 paper for prompt card alignment ───
  const measureFieldPositions = useCallback(() => {
    const paperEl = paperScrollRef.current;
    if (!paperEl) return;
    const positions: Record<string, number> = {};
    // Measure each data-ccl-field span position relative to the paper scroll container
    const fieldEls = paperEl.querySelectorAll('[data-ccl-field]');
    fieldEls.forEach(el => {
      const key = el.getAttribute('data-ccl-field');
      if (key && !positions[key]) {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const containerRect = paperEl.getBoundingClientRect();
        positions[key] = rect.top - containerRect.top + paperEl.scrollTop;
      }
    });
    // Also measure section headings for fields that don't have a direct placeholder
    const sectionEls = paperEl.querySelectorAll('[data-section-number]');
    sectionEls.forEach(el => {
      const sectionNum = el.getAttribute('data-section-number');
      if (!sectionNum) return;
      const rect = (el as HTMLElement).getBoundingClientRect();
      const containerRect = paperEl.getBoundingClientRect();
      const yPos = rect.top - containerRect.top + paperEl.scrollTop;
      // Map section numbers to field keys that belong to that section
      FIELD_PROMPTS.forEach(fp => {
        if (fp.section === sectionNum && !positions[fp.key]) {
          positions[fp.key] = yPos;
        }
      });
    });
    setFieldPositions(positions);
  }, []);

  // Re-measure positions after render and when fields change
  useEffect(() => {
    const timer = setTimeout(measureFieldPositions, 300);
    return () => clearTimeout(timer);
  }, [measureFieldPositions, fields, sidebarOpen, promptLayout]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const timer = setTimeout(() => {
      const container = sidebarContentRef.current;
      if (!container) return;
      const measured: Record<string, number> = {};
      container.querySelectorAll('[data-ccl-prompt]').forEach((el) => {
        const key = (el as HTMLElement).getAttribute('data-ccl-prompt');
        if (!key) return;
        measured[key] = Math.ceil((el as HTMLElement).getBoundingClientRect().height);
      });
      setPromptCardHeights(prev => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(measured);
        if (prevKeys.length === nextKeys.length && nextKeys.every(k => prev[k] === measured[k])) {
          return prev;
        }
        return measured;
      });
    }, 40);
    return () => clearTimeout(timer);
  }, [sidebarOpen, promptLayout, fieldPositions, expandedCards, fields, aiStatus, aiLoadingKeys]);

  // ─── Scroll sync: paper ↔ sidebar (prompts tab only) ───
  useEffect(() => {
    const paperEl = paperScrollRef.current;
    const sidebarEl = sidebarContentRef.current;
    if (!paperEl || !sidebarEl || !sidebarOpen) return;

    const syncPaperToSidebar = () => {
      if (scrollSyncLock.current) return;
      scrollSyncLock.current = true;
      const ratio = paperEl.scrollTop / (paperEl.scrollHeight - paperEl.clientHeight || 1);
      sidebarEl.scrollTop = ratio * (sidebarEl.scrollHeight - sidebarEl.clientHeight);
      requestAnimationFrame(() => { scrollSyncLock.current = false; });
    };
    const syncSidebarToPaper = () => {
      if (scrollSyncLock.current) return;
      scrollSyncLock.current = true;
      const ratio = sidebarEl.scrollTop / (sidebarEl.scrollHeight - sidebarEl.clientHeight || 1);
      paperEl.scrollTop = ratio * (paperEl.scrollHeight - paperEl.clientHeight);
      requestAnimationFrame(() => { scrollSyncLock.current = false; });
    };

    paperEl.addEventListener('scroll', syncPaperToSidebar, { passive: true });
    sidebarEl.addEventListener('scroll', syncSidebarToPaper, { passive: true });
    return () => {
      paperEl.removeEventListener('scroll', syncPaperToSidebar);
      sidebarEl.removeEventListener('scroll', syncSidebarToPaper);
    };
  }, [sidebarOpen]);

  // Sync: when editing a field on the A4 surface AND sidebar is open, highlight in sidebar
  useEffect(() => {
    if (editingField && sidebarOpen) {
      setActiveNavigationKey(getLeadNavigationKey(editingField));
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      setHighlightedField(editingField);
      highlightTimerRef.current = setTimeout(() => setHighlightedField(null), 1500);
      setTimeout(() => {
        pauseScrollSync(420);
        // Scroll in Quick Edit tab
        const qfEl = document.querySelector(`[data-ccl-qf="${editingField}"]`) as HTMLElement | null;
        if (qfEl) qfEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Scroll in Prompts tab
        const promptEl = document.querySelector(`[data-ccl-prompt="${editingField}"]`) as HTMLElement | null;
        if (promptEl) promptEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }, [editingField, getLeadNavigationKey, pauseScrollSync, sidebarOpen]);

  // Scroll the A4 paper to show where a field appears in the document
  const scrollFieldToDocument = useCallback((fieldKey: string) => {
    setDocumentMode('edit');
    setSidebarOpen(true);
    const navigationKey = getLeadNavigationKey(fieldKey);
    setActiveNavigationKey(navigationKey);
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.add(navigationKey);
      return next;
    });
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
        const target = paperScrollRef.current?.querySelector(`[data-ccl-field="${candidateKey}"]`) as HTMLElement | null;
        if (target) {
          setEditingField(candidateKey);
          pauseScrollSync();
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }

      if (docSections.length > 0) {
        const sectionEl = sectionRefs.current[docSections[0]];
        if (sectionEl) {
          pauseScrollSync();
          sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      openFieldEditor(fieldKey);
      setStatus({ type: 'error', message: `Field not placed in visible letter clause yet: ${fieldLabelMap[fieldKey] || fieldKey}` });
    };

    setTimeout(runJump, 120);
  }, [CCL_SECTION_TO_DOC_SECTIONS, QUICK_FIELD_ALIASES, fieldLabelMap, fieldSectionMap, getLeadNavigationKey, openFieldEditor, pauseScrollSync]);

  const resizeTextareaToContent = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.max(element.scrollHeight, 32)}px`;
  }, []);

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
          ref={resizeTextareaToContent}
          value={value || ''}
          onChange={e => {
            resizeTextareaToContent(e.currentTarget);
            updateField?.(fieldKey, e.target.value);
          }}
          onBlur={() => setEditingField(null)}
          onKeyDown={e => { if (e.key === 'Escape') setEditingField(null); }}
          style={{
            ...style,
            width: '100%', resize: 'none', overflow: 'hidden',
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
    { key: 'identify_the_other_party_eg_your_opponents', label: 'Other Party Name', type: 'text' },
    { key: 'disbursements_paragraph', label: 'Disbursements', type: 'textarea' },
    { key: 'costs_other_party_paragraph', label: 'Costs (Other Party)', type: 'textarea' },
  ], []);

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, minHeight: 0, overflow: 'hidden', position: 'relative', fontFamily: "'Raleway', Arial, Helvetica, sans-serif" }}>
      {/* Spin animation for AI loading indicator + Raleway import */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;500;600;700&display=swap');
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes cclFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes cclPulseHighlight { 0% { box-shadow: 0 0 0 0 rgba(54,144,206,0.4); } 50% { box-shadow: 0 0 0 4px rgba(54,144,206,0.15); } 100% { box-shadow: 0 0 0 0 rgba(54,144,206,0); } }
@keyframes cclShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes cclPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes cclNoticeIn { from { opacity: 0; transform: translate(-50%, -12px) scale(0.98); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
@keyframes cclNoticeOut { from { opacity: 1; transform: translate(-50%, 0) scale(1); } to { opacity: 0; transform: translate(-50%, -8px) scale(0.98); } }
@keyframes cclNoticeProgress { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@keyframes cclCascadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {workflowModalActive && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1250,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: 48,
          padding: '48px 24px 24px',
          background: isDarkMode ? 'rgba(0, 3, 25, 0.58)' : 'rgba(6, 23, 51, 0.22)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}>
          <div style={{
            width: 'min(620px, calc(100vw - 32px))',
            borderRadius: 4,
            overflow: 'hidden',
            border: `1px solid ${workflowModalStage === 'review-ready' ? loadBannerBorder : cardBorder}`,
            background: isDarkMode ? 'rgba(8, 28, 48, 0.98)' : 'rgba(255, 255, 255, 0.98)',
            boxShadow: isDarkMode ? '0 24px 64px rgba(0,0,0,0.5)' : '0 24px 64px rgba(6,23,51,0.2)',
            animation: `${workflowModalClosing ? 'cclNoticeOut' : 'cclNoticeIn'} ${workflowModalClosing ? '0.3s' : '0.24s'} ease forwards`,
          }}>
            <div style={{ padding: '18px 20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: workflowModalStage === 'review-ready'
                    ? loadBannerTone
                    : (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.08)'),
                }}>
                  {workflowModalStage === 'review-ready'
                    ? <Icon iconName="SkypeCircleCheck" styles={{ root: { fontSize: 16, color: colours.green } }} />
                    : <Spinner size={SpinnerSize.small} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    color: workflowModalStage === 'review-ready' ? loadBannerText : accentBlue,
                    marginBottom: 4,
                  }}>
                    {workflowModalStage === 'generating'
                      ? 'Generating draft'
                      : workflowModalStage === 'safety-net'
                        ? 'Safety net'
                        : 'Review ready'}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: text, lineHeight: 1.3 }}>
                    {workflowModalStage === 'generating'
                      ? 'Pulling matter data and drafting field values.'
                      : workflowModalStage === 'safety-net'
                        ? 'Verifying draft against source data.'
                        : 'Draft complete — review fields below.'}
                  </div>
                  {workflowModalStage !== 'generating' && (
                    <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, color: textMuted }}>
                      {workflowModalStage === 'safety-net'
                        ? 'Checking outputs against source evidence.'
                        : ptSummary
                          ? `${ptSummary.reviewedFields} fields reviewed · ${ptSummary.average}/10${ptSummary.flaggedCount > 0 ? ` · ${ptSummary.flaggedCount} flagged` : ' · none flagged'}.`
                          : 'Ready.'}
                    </div>
                  )}
                </div>
              </div>

              {workflowModalStage === 'generating' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    'Loading matter context',
                    'Checking emails and notes',
                    `Generating fields${aiLoadingKeys?.size ? ` (${aiLoadingKeys.size} remaining)` : ''}`,
                  ].map((label, index) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>
                        {index === 0 || index === 2 || (index === 1 && ((aiDataSources?.length || 0) > 0 || !!aiContextSummary))
                          ? <Spinner size={SpinnerSize.xSmall} />
                          : <span style={{ color: textMuted }}>·</span>}
                      </span>
                      <span style={{ fontSize: 11, color: text, lineHeight: 1.45 }}>{label}</span>
                    </div>
                  ))}
                  {aiDataSources && aiDataSources.length > 0 && (
                    <div style={{ fontSize: 10, color: textMuted, lineHeight: 1.45, paddingLeft: 26 }}>
                      Sources in play: {aiDataSources.join(', ')}
                    </div>
                  )}
                </div>
              )}

              {workflowModalStage === 'safety-net' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      Safety Net Pressure Test
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: textMuted, fontVariantNumeric: 'tabular-nums' }}>
                      {(ptElapsed / 1000).toFixed(1)}s
                    </span>
                  </div>
                  {ptSteps.map(step => (
                    <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>
                        {step.status === 'done' ? <span style={{ color: colours.green }}>✓</span>
                          : step.status === 'active' ? <Spinner size={SpinnerSize.xSmall} />
                          : step.status === 'error' ? <span style={{ color: colours.cta }}>✗</span>
                          : <span style={{ color: textMuted }}>·</span>}
                      </span>
                      <span style={{
                        fontSize: 11,
                        lineHeight: 1.45,
                        color: step.status === 'active' ? text : step.status === 'done' ? colours.green : step.status === 'error' ? colours.cta : textMuted,
                        fontWeight: step.status === 'active' ? 700 : 500,
                      }}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                  {ptError && (
                    <div style={{
                      marginTop: 2, padding: '6px 10px', borderRadius: 2,
                      background: isDarkMode ? 'rgba(214,85,65,0.1)' : 'rgba(214,85,65,0.06)',
                      border: `1px solid ${isDarkMode ? 'rgba(214,85,65,0.25)' : 'rgba(214,85,65,0.15)'}`,
                      fontSize: 10.5, color: colours.cta, lineHeight: 1.4,
                    }}>
                      Safety Net Pressure Test failed: {ptError}
                    </div>
                  )}
                </div>
              )}

              {workflowModalStage === 'review-ready' && ptSummary && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderRadius: 999,
                    border: `1px solid ${ptSummary.average >= 8 ? colours.green : ptSummary.average >= 5 ? colours.orange : colours.cta}`,
                    color: ptSummary.average >= 8 ? colours.green : ptSummary.average >= 5 ? colours.orange : colours.cta,
                    fontSize: 10.5, fontWeight: 700,
                  }}>
                    Safety Net {ptSummary.average}/10
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderRadius: 999,
                    border: `1px solid ${cardBorder}`,
                    color: textMuted,
                    fontSize: 10.5, fontWeight: 600,
                  }}>
                    {promptReviewCardCount} review cards opening
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderRadius: 999,
                    border: `1px solid ${cardBorder}`,
                    color: textMuted,
                    fontSize: 10.5, fontWeight: 600,
                  }}>
                    {ptSummary.flaggedCount > 0 ? `${ptSummary.flaggedCount} flagged cues` : 'No flagged cues'}
                  </div>
                </div>
              )}
            </div>

            {(workflowModalStage === 'generating' || workflowModalStage === 'safety-net') && (
              <div style={{ height: 2, background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(6,23,51,0.06)' }}>
                <div style={{
                  height: '100%',
                  width: workflowModalStage === 'generating' ? '48%' : '82%',
                  background: `linear-gradient(90deg, ${accentBlue}, ${isDarkMode ? colours.accent : colours.highlight})`,
                  transition: 'width 0.35s ease',
                }} />
              </div>
            )}
          </div>
        </div>
      )}

      {loadNoticeVisible && loadNoticeMode !== 'hidden' && !workflowModalActive && (
        <div style={{
          position: 'fixed',
          top: 18,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1200,
          width: 'min(560px, calc(100vw - 32px))',
          pointerEvents: 'none',
        }}>
          <div style={{
            pointerEvents: 'auto',
            overflow: 'hidden',
            borderRadius: 4,
            border: `1px solid ${loadBannerBorder}`,
            background: isDarkMode ? 'rgba(8,28,48,0.97)' : 'rgba(255,255,255,0.98)',
            color: text,
            boxShadow: isDarkMode ? '0 16px 40px rgba(0,0,0,0.42)' : '0 16px 40px rgba(6,23,51,0.18)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            animation: `${loadNoticeClosing ? 'cclNoticeOut' : 'cclNoticeIn'} ${loadNoticeClosing ? '0.45s' : '0.26s'} ease forwards`,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '14px 16px 12px',
            }}>
              <div style={{
                width: 30,
                height: 30,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                borderRadius: 999,
                background: loadBannerTone,
                color: loadBannerText,
              }}>
                <Icon iconName="Database" styles={{ root: { fontSize: 13, color: loadBannerText } }} />
              </div>

              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: loadBannerText,
                }}>
                  Saved CCL Restored
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.45, color: text }}>
                  {loadBannerMessage}
                </div>
              </div>

              {loadNoticeMode === 'restored' && (
                <button
                  type="button"
                  onClick={() => {
                    clearLoadNoticeTimers();
                    setLoadNoticeClosing(true);
                    setTimeout(() => {
                      setLoadNoticeVisible(false);
                      setLoadNoticeClosing(false);
                      setLoadNoticeMode('hidden');
                    }, 220);
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: textMuted,
                    cursor: 'pointer',
                    padding: 0,
                    width: 18,
                    height: 18,
                    flexShrink: 0,
                  }}
                  title="Dismiss"
                >
                  <Icon iconName="ChromeClose" styles={{ root: { fontSize: 10 } }} />
                </button>
              )}
            </div>

            {loadNoticeMode === 'restored' && (
              <div style={{
                height: 2,
                background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(6,23,51,0.06)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: '100%',
                  background: `linear-gradient(90deg, ${accentBlue}, ${isDarkMode ? colours.accent : colours.highlight})`,
                  transformOrigin: 'left center',
                  animation: 'cclNoticeProgress 3.2s linear forwards',
                }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Main Layout — Document + optional sidebar ═══ */}
      <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden', minHeight: 0 }}>

        {/* ═══ Preview Pane — pinned toolbar + scrolling A4 pages ═══ */}
        <div style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: paperAreaBg,
        }}>

          {/* ═══ Pinned Toolbar — sits above the paper scroll in the flex column ═══ */}
          <div style={{
            flexShrink: 0,
            zIndex: 10,
            background: isDarkMode ? 'rgba(6,23,51,0.95)' : 'rgba(232,239,247,0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: `1px solid ${cardBorder}`,
            boxShadow: isDarkMode ? '0 4px 16px rgba(0,0,0,0.24)' : '0 4px 12px rgba(6,23,51,0.06)',
          }}>
            {/* Compact tool bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 16px',
              minHeight: 36,
            }}>
              {/* Page count chip */}
              {sectionPages.length > 0 && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 12,
                  fontSize: 10, fontWeight: 600,
                  background: isDarkMode ? 'rgba(244,244,246,0.06)' : 'rgba(13,47,96,0.05)',
                  border: `1px solid ${cardBorder}`,
                  color: textMuted,
                }}>
                  {sectionPages.length} page{sectionPages.length !== 1 ? 's' : ''}
                </div>
              )}

              {/* AI status chip — compact, non-expandable */}
              {aiStatus && aiStatus !== 'idle' && aiStatus !== 'loading' && (
                <div
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 12,
                    fontSize: 10, fontWeight: 600,
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
                  {aiStatus === 'complete' ? 'AI draft ✓' : aiStatus === 'partial' ? 'AI + defaults' : 'Defaults'}
                </div>
              )}

              {/* PT confidence score — shown inline after safety net completes */}
              {ptResult && !ptRunning && (() => {
                const scores = Object.values(ptResult.fieldScores);
                const avg = scores.length > 0 ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length : 0;
                const rounded = Math.round(avg * 10) / 10;
                const scoreColour = rounded >= 8 ? colours.green : rounded >= 5 ? colours.orange : colours.cta;
                return (
                  <div
                    onClick={runPressureTest}
                    title="Confidence score from Safety Net Pressure Test — click to run again"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 10px', borderRadius: 12,
                      fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      background: isDarkMode ? `${scoreColour}18` : `${scoreColour}12`,
                      border: `1px solid ${isDarkMode ? `${scoreColour}40` : `${scoreColour}28`}`,
                      color: scoreColour,
                      transition: 'all 0.12s ease',
                    }}
                  >
                    {rounded}/10
                    {ptResult.flaggedCount > 0 && (
                      <span style={{ opacity: 0.8, fontWeight: 500 }}>· {ptResult.flaggedCount} flagged</span>
                    )}
                  </div>
                );
              })()}
              {/* Run Safety Net — shown when AI is done but PT hasn't run yet */}
              {aiStatus === 'complete' && !ptResult && !ptRunning && (
                <button
                  type="button"
                  onClick={runPressureTest}
                  title="Verify AI output against source evidence (emails, calls, documents)"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 12,
                    fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    background: isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(135,243,243,0.06)',
                    border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.35)' : 'rgba(135,243,243,0.25)'}`,
                    color: colours.accent,
                    transition: 'all 0.12s ease',
                  }}
                >
                  Run Safety Net
                </button>
              )}
              {ptRunning && !workflowModalActive && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 12,
                  fontSize: 10, fontWeight: 600,
                  background: isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.06)',
                  border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(54,144,206,0.15)'}`,
                  color: accentBlue,
                }}>
                  <Spinner size={SpinnerSize.xSmall} /> Verifying…
                </div>
              )}

              {(!aiStatus || aiStatus === 'idle') && onTriggerAiFill && (
                <button
                  type="button"
                  onClick={onTriggerAiFill}
                  title="Analyse matter data, pitch emails and call notes to populate AI fields"
                  style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '4px 12px', borderRadius: 3, height: 28,
                    background: isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.08)',
                    border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.28)' : 'rgba(54,144,206,0.18)'}`,
                    color: accentBlue, fontSize: 10.5, fontWeight: 700,
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    letterSpacing: '0.02em',
                  }}
                >
                  Generate AI
                </button>
              )}

              {aiStatus === 'loading' && !workflowModalActive && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 12px', borderRadius: 3, height: 28,
                  background: isDarkMode ? 'rgba(54,144,206,0.10)' : 'rgba(54,144,206,0.06)',
                  border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(54,144,206,0.15)'}`,
                  color: accentBlue, fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.02em',
                }}>
                  <Spinner size={SpinnerSize.xSmall} />
                  Generating AI…
                </div>
              )}

              <div style={{ flex: 1 }} />

              <button
                type="button"
                onClick={() => {
                  setSidebarOpen(prev => {
                    const next = !prev;
                    if (next) setSidebarAutoCollapsed(false);
                    return next;
                  });
                }}
                title={sidebarToggleLabel}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 3, height: 26,
                  background: sidebarOpen
                    ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.08)')
                    : (shouldAutoCollapseSidebar ? (isDarkMode ? 'rgba(214,85,65,0.12)' : 'rgba(214,85,65,0.08)') : 'transparent'),
                  border: `1px solid ${sidebarOpen ? accentBlue : shouldAutoCollapseSidebar ? colours.cta : cardBorder}`,
                  color: sidebarOpen ? accentBlue : shouldAutoCollapseSidebar ? colours.cta : text,
                  fontSize: 10, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.12s ease',
                }}
              >
                <Icon iconName={sidebarOpen ? 'DoubleChevronRightMed' : 'DoubleChevronLeftMed'} styles={{ root: { fontSize: 10 } }} />
                {sidebarOpen ? 'Hide Panel' : 'Show Panel'}
              </button>

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

              {/* Export group */}
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
              <button type="button" onClick={handleSend} disabled={!isDevMode || sending || remainingPlaceholders > 0}
                title={!isDevMode
                  ? 'Sending is disabled in production'
                  : remainingPlaceholders > 0
                    ? `Complete ${remainingPlaceholders} field${remainingPlaceholders > 1 ? 's' : ''} before sending`
                    : 'Generate and email'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 14px', borderRadius: 3, height: 26,
                  background: !isDevMode
                    ? (isDarkMode ? 'rgba(148,163,184,0.12)' : '#e5e7eb')
                    : remainingPlaceholders > 0
                      ? (isDarkMode ? 'rgba(148,163,184,0.15)' : '#e2e8f0')
                      : accentBlue,
                  color: !isDevMode ? textMuted : remainingPlaceholders > 0 ? textMuted : '#fff',
                  border: 'none', fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                  cursor: !isDevMode || sending || remainingPlaceholders > 0 ? 'not-allowed' : 'pointer',
                  opacity: !isDevMode ? 0.55 : sending ? 0.6 : 1, transition: 'all 0.12s ease',
                }}
              >
                <Icon iconName={sending ? 'ProgressRingDots' : 'Send'} styles={{ root: { fontSize: 10 } }} />
                Send
              </button>

              <div style={{ width: 1, height: 16, background: cardBorder, margin: '0 2px' }} />

              <button type="button"
                onClick={() => setShowNdConfirm(true)}
                title="Upload to NetDocuments"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 3, height: 26,
                  background: showNdConfirm ? (isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)') : 'transparent',
                  border: `1px solid ${showNdConfirm ? accentBlue : cardBorder}`,
                  color: showNdConfirm ? accentBlue : text, fontSize: 10, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.12s ease',
                }}
              >
                <Icon iconName="CloudUpload" styles={{ root: { fontSize: 10 } }} />
                Upload to ND
              </button>

              {/* Utility icons */}
              {isDevMode && (
                <>
                  <div style={{ width: 1, height: 16, background: cardBorder, margin: '0 2px' }} />
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
                </>
              )}
            </div>

            {/* ── Unfilled fields CTA banner ── */}
            {(() => {
              const unfilledPrompts = FIELD_PROMPTS.filter(fp => !String(fields[fp.key] || '').trim());
              if (unfilledPrompts.length === 0) return null;
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 16px',
                  background: isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.05)',
                  borderTop: `1px solid ${isDarkMode ? 'rgba(214,85,65,0.2)' : 'rgba(214,85,65,0.12)'}`,
                }}>
                  <span style={{ fontSize: 12, color: colours.cta }}>⚑</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: colours.cta }}>
                    {unfilledPrompts.length} field{unfilledPrompts.length !== 1 ? 's' : ''} need{unfilledPrompts.length === 1 ? 's' : ''} review
                  </span>
                  <span style={{ fontSize: 9, color: textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                    {unfilledPrompts.slice(0, 4).map(fp => fp.label).join(' · ')}{unfilledPrompts.length > 4 ? ` · +${unfilledPrompts.length - 4} more` : ''}
                  </span>
                  {onTriggerAiFill && (!aiStatus || aiStatus === 'idle') && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onTriggerAiFill(); }} style={{
                      padding: '2px 10px', borderRadius: 2, fontSize: 9, fontWeight: 700,
                      background: colours.cta, color: '#fff', border: 'none',
                      cursor: 'pointer', textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                      flexShrink: 0,
                    }}>
                      Generate AI
                    </button>
                  )}
                </div>
              );
            })()}

          </div>

          <div ref={paperScrollRef} style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: '0 20px 32px',
            background: isDarkMode ? '#020a18' : '#b8cedf',
          }}>

          {/* ── Page 1 ── */}
          <div style={{
            width: A4_WIDTH,
            height: A4_HEIGHT,
            flexShrink: 0,
            margin: '32px auto 0',
            background: paperBg,
            boxShadow: isDarkMode
              ? `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px ${paperOutline}`
              : `0 3px 18px rgba(0,0,0,0.12), 0 0 0 1px ${paperOutline}`,
            padding: `${PAGE_TOP}px ${PAGE_MARGIN}px ${PAGE_BOTTOM}px`,
            fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
            fontSize: 13, lineHeight: 1.7,
            color: isDarkMode ? '#e2e8f0' : '#061733',
            display: 'flex', flexDirection: 'column' as const,
            overflow: 'hidden',
            position: 'relative' as const,
            animation: aiStatus !== 'loading' ? 'cclFadeIn 0.3s ease' : 'none',
          }}>
            {/* Letterhead */}
            <div ref={letterheadRef} style={{
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

            {/* Recipient block */}
            <div ref={recipientRef} style={{ marginBottom: 24, fontSize: 12.5, lineHeight: 1.6 }}>
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

            {/* Intro section */}
            {(() => {
              const intro = parsedSections.find(s => s.id === 'intro');
              if (!intro) return null;
              const remaining = intro.elements.slice(2);
              return remaining.length > 0 ? <div ref={introRef}>{remaining}</div> : null;
            })()}

            {/* Page 1 sections */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {(sectionPages[0]?.sections || []).map(section => (
                <div key={section.id} ref={el => { sectionRefs.current[section.number] = el; }} data-section-number={section.number} style={{ marginBottom: 10 }}>
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
                  <div style={{ paddingLeft: section.isSubsection ? 28 : 20, marginTop: 2 }}>
                    {section.elements.map((element, elementIndex) => {
                      const sourceElementIndex = section.sourceElementIndices?.[elementIndex] ?? elementIndex;
                      return (
                      <div
                        key={`${section.id}-element-${elementIndex}`}
                        ref={el => {
                          sectionElementRefs.current[getSectionElementMeasurementKey(section.number, sourceElementIndex)] = el;
                        }}
                      >
                        {element}
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Headed paper footer — replaced by firm stationery when printed */}
            <div style={{
              marginTop: 'auto',
              paddingTop: 12,
              borderTop: `1px dashed ${isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(13,47,96,0.12)'}`,
              textAlign: 'center' as const,
            }}>
              <div style={{ fontSize: 7.5, color: textMuted, fontStyle: 'italic', letterSpacing: '0.03em', textTransform: 'uppercase' as const, opacity: 0.7 }}>
                This area is replaced by headed paper when printed
              </div>
              <div style={{ fontSize: 7, color: textMuted, marginTop: 3, opacity: 0.5 }}>
                Helix Law Ltd · SRA No. 669720 · Registered in England & Wales No. 10346944
              </div>
            </div>

            {/* Page number */}
            <div style={{ textAlign: 'center' as const, marginTop: 10 }}>
              <span style={{
                display: 'inline-block', fontSize: 8, color: textMuted,
                background: isDarkMode ? 'rgba(244,244,246,0.06)' : colours.grey,
                padding: '3px 12px', borderRadius: 999, letterSpacing: '0.04em',
              }}>
                1
              </span>
            </div>
          </div>

          {/* ── Continuation pages ── */}
          {sectionPages.slice(1).map((page) => (
            <React.Fragment key={page.pageNumber}>
            {/* Page break separator */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              margin: '10px auto', width: A4_WIDTH, padding: '0 40px',
            }}>
              <div style={{ flex: 1, height: 1, background: isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(13,47,96,0.12)' }} />
              <span style={{ fontSize: 9, fontWeight: 600, color: textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' as const }}>
                Page {page.pageNumber}
              </span>
              <div style={{ flex: 1, height: 1, background: isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(13,47,96,0.12)' }} />
            </div>
            <div style={{
              width: A4_WIDTH,
              height: A4_HEIGHT,
              flexShrink: 0,
              margin: '32px auto 0',
              background: paperBg,
              boxShadow: isDarkMode
                ? `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px ${paperOutline}`
                : `0 3px 18px rgba(0,0,0,0.12), 0 0 0 1px ${paperOutline}`,
              padding: `${PAGE_TOP}px ${PAGE_MARGIN}px ${PAGE_BOTTOM}px`,
              fontFamily: "'Raleway', Arial, Helvetica, sans-serif",
              fontSize: 13, lineHeight: 1.7,
              color: isDarkMode ? '#e2e8f0' : '#061733',
              display: 'flex', flexDirection: 'column' as const,
              overflow: 'hidden',
              position: 'relative' as const,
            }}>


              {/* Page sections */}
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {page.sections.map(section => (
                  <div key={section.id} ref={el => { sectionRefs.current[section.number] = el; }} data-section-number={section.number} style={{ marginBottom: 10 }}>
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
                    <div style={{ paddingLeft: section.isSubsection ? 28 : 20, marginTop: 2 }}>
                      {section.elements.map((element, elementIndex) => {
                        const sourceElementIndex = section.sourceElementIndices?.[elementIndex] ?? elementIndex;
                        return (
                        <div
                          key={`${section.id}-element-${elementIndex}`}
                          ref={el => {
                            sectionElementRefs.current[getSectionElementMeasurementKey(section.number, sourceElementIndex)] = el;
                          }}
                        >
                          {element}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Page number */}
              <div style={{ textAlign: 'center' as const, marginTop: 'auto', paddingTop: 14 }}>
                <span style={{
                  display: 'inline-block', fontSize: 8, color: textMuted,
                  background: isDarkMode ? 'rgba(244,244,246,0.06)' : colours.grey,
                  padding: '3px 12px', borderRadius: 999, letterSpacing: '0.04em',
                }}>
                  {page.pageNumber}
                </span>
              </div>
            </div>
            </React.Fragment>
          ))}

          </div>{/* end paper scroll area */}
        </div>{/* end preview pane */}

        {/* ═══ Slide-out Sidebar (hidden by default) ═══ */}
        {sidebarOpen && (
          <div style={{
            width: 400, flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            background: isDarkMode ? '#071a36' : '#f0f4f9',
            borderLeft: `1px solid ${cardBorder}`,
            overflow: 'hidden',
            animation: 'cclFadeIn 0.15s ease',
            }}>
            {/* Sidebar header — progress + layout toggle */}
            <div style={{
              padding: '10px 14px 8px',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.08)' : '#f1f5f9'}`,
            }}>
              {/* Progress bar */}
              {(() => {
                const totalFields = FIELD_PROMPTS.length;
                const filledFields = FIELD_PROMPTS.filter(fp => (fields[fp.key] || '').trim()).length;
                const pct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
                return (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                        Review Queue
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: pct === 100 ? colours.green : accentBlue }}>
                        {filledFields}/{totalFields} ({pct}%)
                      </span>
                    </div>
                    <div style={{
                      height: 3, borderRadius: 2, width: '100%',
                      background: isDarkMode ? 'rgba(148,163,184,0.1)' : 'rgba(0,0,0,0.06)',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        width: `${pct}%`,
                        background: pct === 100
                          ? colours.green
                          : `linear-gradient(90deg, ${accentBlue}, ${isDarkMode ? colours.accent : colours.highlight})`,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <div style={{
                      marginTop: 8,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                      alignItems: 'center',
                    }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 999,
                        border: `1px solid ${cardBorder}`,
                        fontSize: 8.5, fontWeight: 600, color: textMuted,
                        background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.7)',
                      }}>
                        <Icon iconName="AlignLeft" styles={{ root: { fontSize: 8, color: accentBlue } }} />
                        {promptReviewCardCount} review cards
                      </span>
                      {ptSummary && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 999,
                          border: `1px solid ${ptSummary.average >= 8 ? colours.green : ptSummary.average >= 5 ? colours.orange : colours.cta}`,
                          fontSize: 8.5, fontWeight: 700,
                          color: ptSummary.average >= 8 ? colours.green : ptSummary.average >= 5 ? colours.orange : colours.cta,
                          background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.72)',
                        }}>
                          Safety Net {ptSummary.average}/10
                          {ptSummary.flaggedCount > 0 ? ` · ${ptSummary.flaggedCount} flagged` : ''}
                        </span>
                      )}
                      {otherDocumentFields.length > 0 && (
                        <button type="button" onClick={() => setShowOtherDocumentFields(prev => !prev)} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 999, cursor: 'pointer',
                          border: `1px solid ${cardBorder}`,
                          background: showOtherDocumentFields
                            ? (isDarkMode ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.06)')
                            : 'transparent',
                          color: textMuted, fontSize: 8.5, fontWeight: 600,
                          transition: 'all 0.12s ease',
                        }}>
                          <Icon iconName="BulletedList" styles={{ root: { fontSize: 8, color: accentBlue } }} />
                          Document fields ({otherDocumentFields.length})
                          <Icon iconName={showOtherDocumentFields ? 'ChevronUp' : 'ChevronDown'} styles={{ root: { fontSize: 7 } }} />
                        </button>
                      )}
                      {aiUserPrompt && (
                        <button type="button" onClick={() => setShowUserPrompt(!showUserPrompt)} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 999, cursor: 'pointer',
                          border: `1px solid ${showUserPrompt ? accentBlue : cardBorder}`,
                          background: showUserPrompt
                            ? (isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.04)')
                            : 'transparent',
                          color: showUserPrompt ? accentBlue : textMuted,
                          fontSize: 8.5, fontWeight: 600,
                          transition: 'all 0.12s ease',
                        }}>
                          <Icon iconName="Send" styles={{ root: { fontSize: 8 } }} />
                          Context
                          <Icon iconName={showUserPrompt ? 'ChevronUp' : 'ChevronDown'} styles={{ root: { fontSize: 7 } }} />
                        </button>
                      )}
                    </div>
                    {showOtherDocumentFields && otherDocumentFields.length > 0 && (
                      <div style={{
                        marginTop: 6,
                        padding: '8px 10px',
                        borderRadius: 2,
                        background: isDarkMode ? 'rgba(0,0,0,0.2)' : '#f8fafc',
                        border: `1px solid ${cardBorder}`,
                        color: textMuted,
                        fontSize: 9,
                        lineHeight: 1.55,
                      }}>
                        {otherDocumentFields.join(' • ')}
                      </div>
                    )}
                    {nextReviewCard ? (
                      <button
                        type="button"
                        onClick={() => scrollFieldToDocument(nextReviewCard.key)}
                        style={{
                          marginTop: 8,
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '9px 10px',
                          borderRadius: 3,
                          cursor: 'pointer',
                          border: `1px solid ${activeNavigationKey === nextReviewCard.key ? accentBlue : cardBorder}`,
                          background: activeNavigationKey === nextReviewCard.key
                            ? (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.07)')
                            : (isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.78)'),
                          textAlign: 'left',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{
                            fontSize: 8,
                            fontWeight: 700,
                            color: activeNavigationKey === nextReviewCard.key ? accentBlue : textMuted,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase' as const,
                          }}>
                            Next up
                          </span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: text, lineHeight: 1.35 }}>
                            {nextReviewCard.label}
                          </span>
                          <span style={{ fontSize: 9, color: textMuted, lineHeight: 1.45 }}>
                            Section {nextReviewCard.section} · {nextReviewCard.nextLabel}
                            {nextReviewCard.outstandingCount > 1 ? ` + ${nextReviewCard.outstandingCount - 1} more` : ''}
                          </span>
                        </div>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          background: isDarkMode ? 'rgba(135,243,243,0.10)' : 'rgba(54,144,206,0.10)',
                          color: accentBlue,
                          flexShrink: 0,
                        }}>
                          <Icon iconName="ChevronRight" styles={{ root: { fontSize: 10 } }} />
                        </span>
                      </button>
                    ) : (
                      <div style={{
                        marginTop: 8,
                        padding: '8px 10px',
                        borderRadius: 3,
                        border: `1px solid ${isDarkMode ? 'rgba(32,178,108,0.28)' : 'rgba(32,178,108,0.18)'}`,
                        background: isDarkMode ? 'rgba(32,178,108,0.08)' : 'rgba(32,178,108,0.05)',
                        color: colours.green,
                        fontSize: 9.5,
                        fontWeight: 700,
                      }}>
                        Review queue complete. Use any card to revisit the draft.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Layout toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={() => setSidebarOpen(false)} style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24,
                  borderRadius: 2,
                  border: `1px solid ${cardBorder}`,
                  background: 'transparent',
                  color: textMuted,
                  cursor: 'pointer',
                  flexShrink: 0,
                }} title="Collapse review panel">
                  <Icon iconName="DoubleChevronRightMed" styles={{ root: { fontSize: 10 } }} />
                </button>
                <span style={{ fontSize: 9, fontWeight: 600, color: textMuted }}>Layout:</span>
                {(['inline', 'stacked'] as const).map(mode => (
                  <button key={mode} type="button" onClick={() => setPromptLayout(mode)} style={{
                    padding: '3px 10px', fontSize: 9, fontWeight: 700,
                    border: `1px solid ${promptLayout === mode ? accentBlue : cardBorder}`,
                    borderRadius: 2, cursor: 'pointer',
                    background: promptLayout === mode
                      ? (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.06)')
                      : 'transparent',
                    color: promptLayout === mode ? accentBlue : textMuted,
                    textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                    transition: 'all 0.12s ease',
                  }}>
                    {mode === 'inline' ? 'Aligned' : 'Stacked'}
                  </button>
                ))}
              </div>

              {/* User prompt expander — raw matter context sent to AI */}
              {aiUserPrompt && showUserPrompt && (
                <div style={{ marginTop: 8 }}>
                  <div style={{
                    marginTop: 4, padding: '8px 10px', borderRadius: 2,
                    background: isDarkMode ? 'rgba(0,0,0,0.25)' : '#f8fafc',
                    border: `1px solid ${cardBorder}`,
                    fontSize: 9, lineHeight: 1.6, fontFamily: 'monospace',
                    color: textMuted, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
                    maxHeight: 240, overflow: 'auto',
                  }}>
                    {aiUserPrompt}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar content — prompts */}
            <div ref={sidebarContentRef} style={{ flex: 1, overflow: 'auto' }}>
              <div style={{
                position: promptLayout === 'inline' ? 'relative' : 'static',
                minHeight: promptLayout === 'inline' ? (paperScrollRef.current?.scrollHeight || 1200) : undefined,
                padding: promptLayout === 'stacked' ? '8px 0' : undefined,
              }}>
                {(() => {
                  const sorted = [...FIELD_PROMPTS].sort((a, b) => {
                    const yA = (promptLayout === 'inline' && GROUPED_INLINE_SECTIONS.has(a.section))
                      ? (groupedInlineSectionAnchors[a.section] ?? fieldPositions[a.key] ?? a.order * 80)
                      : (fieldPositions[a.key] ?? a.order * 80);
                    const yB = (promptLayout === 'inline' && GROUPED_INLINE_SECTIONS.has(b.section))
                      ? (groupedInlineSectionAnchors[b.section] ?? fieldPositions[b.key] ?? b.order * 80)
                      : (fieldPositions[b.key] ?? b.order * 80);
                    if (yA === yB) return a.order - b.order;
                    return yA - yB;
                  });

                  const hasPositions = Object.keys(fieldPositions).length > 0;
                  let prevBottom = 0;

                  return sorted.map((fp, index) => {
                    const promptGroup = promptGroupByKey[fp.key];
                    if (promptGroup && promptGroup.leadKey !== fp.key) return null;

                    const cardPrompts = promptGroup
                      ? promptGroup.memberKeys.map(key => fieldPromptByKey[key]).filter(Boolean)
                      : [fp];
                    const cardKey = promptGroup?.leadKey || fp.key;
                    const cardLabel = promptGroup?.label || fp.label;
                    const cardTypeText = promptGroup?.typeText;
                    const sectionRefPrompt = cardPrompts[0] || fp;
                    const promptStates = cardPrompts.map(prompt => {
                      const promptValue = String(fields[prompt.key] || '').trim();
                      const promptProv = fieldProvenance[prompt.key] || 'empty';
                      const promptResolved = !!promptValue && promptProv !== 'scaffold';
                      const promptAutoFill = AUTO_FILL_KEYS.has(prompt.key);
                      const promptLoading = !!aiLoadingKeys?.has(prompt.key) && !promptResolved;
                      const promptDataSummary = promptAutoFill
                        ? (prompt.dataHint || 'Matter data (auto-filled)')
                        : promptProv === 'ai'
                          ? ((aiDataSources || []).length > 0 ? (aiDataSources || []).join(', ') : 'AI model context')
                          : promptProv === 'user' ? 'Manually edited'
                            : promptProv === 'scaffold' ? 'Original template scaffold awaiting specific values'
                            : promptProv === 'default' ? 'Default copy currently shown in the letter'
                            : '';
                      return {
                        prompt,
                        val: promptValue,
                        prov: promptProv,
                        isFilled: !!promptValue,
                        isResolved: promptResolved,
                        isLoading: promptLoading,
                        isAutoFillField: promptAutoFill,
                        dataSummary: promptDataSummary,
                      };
                    });

                    const isActionGroup = promptGroup?.leadKey === 'insert_next_step_you_would_like_client_to_take';
                    const actionDocumentKeys = new Set([
                      'describe_first_document_or_information_you_need_from_your_client',
                      'describe_second_document_or_information_you_need_from_your_client',
                      'describe_third_document_or_information_you_need_from_your_client',
                    ]);
                    const documentPromptStates = isActionGroup
                      ? promptStates.filter(state => actionDocumentKeys.has(state.prompt.key))
                      : [];
                    const nonDocumentPromptStates = isActionGroup
                      ? promptStates.filter(state => !actionDocumentKeys.has(state.prompt.key))
                      : promptStates;
                    const combinedDocumentValues = documentPromptStates.map(state => state.val).filter(Boolean);

                    const val = promptStates.map(state => state.val).filter(Boolean).join(' | ');
                    const prov = promptStates.some(state => state.prov === 'scaffold')
                      ? 'scaffold'
                      : promptStates.some(state => state.prov === 'ai')
                        ? 'ai'
                        : promptStates.some(state => state.prov === 'auto-fill')
                          ? 'auto-fill'
                          : promptStates.some(state => state.prov === 'user')
                            ? 'user'
                            : promptStates.every(state => state.prov === 'default')
                              ? 'default'
                              : promptStates.every(state => state.prov === 'empty')
                                ? 'empty'
                                : 'default';
                    const isFilled = promptStates.some(state => state.isFilled);
                    const isResolved = promptStates.every(state => state.isResolved);
                    const isLoading = promptStates.some(state => state.isLoading) && !isResolved;
                    const groupedInlineAnchor = promptLayout === 'inline' && GROUPED_INLINE_SECTIONS.has(sectionRefPrompt.section)
                      ? groupedInlineSectionAnchors[sectionRefPrompt.section]
                      : undefined;
                    const measuredY = groupedInlineAnchor
                      ?? cardPrompts.reduce<number | undefined>((minY, prompt) => {
                        const y = fieldPositions[prompt.key];
                        if (y == null) return minY;
                        return minY == null ? y : Math.min(minY, y);
                      }, undefined);
                    const isExpanded = expandedCards.has(cardKey);
                    const isLinkedHighlight = promptStates.some(state => highlightedField === state.prompt.key || hoveredField === state.prompt.key);
                    const isActiveNavigation = activeNavigationKey === cardKey;

                    const isAutoFillField = !promptGroup && AUTO_FILL_KEYS.has(fp.key);
                    const dataSummary = promptGroup
                      ? Array.from(new Set(promptStates.map(state => state.dataSummary || state.prompt.dataHint).filter(Boolean))).join(' | ')
                      : promptStates[0]?.dataSummary || '';

                    let topPx: number | undefined;
                    if (promptLayout === 'inline') {
                      const MIN_GAP = 10;
                      if (hasPositions && measuredY != null) {
                        topPx = Math.max(measuredY - 8, prevBottom + MIN_GAP);
                      } else {
                        topPx = prevBottom + MIN_GAP;
                      }
                      const estimatedHeight = promptCardHeights[cardKey]
                        || (() => {
                          if (isResolved && !isExpanded) return 38;
                          const countWrappedLines = (textValue: string, charsPerLine: number) => (
                            textValue
                              .split('\n')
                              .reduce((sum, segment) => sum + Math.max(1, Math.ceil((segment.length || 1) / charsPerLine)), 0)
                          );
                          const instrText = promptGroup
                            ? promptStates.filter(state => !state.isAutoFillField).map(state => `${state.prompt.label}: ${state.prompt.instruction}`).join('\n')
                            : (fp.instruction || '');
                          const contextText = promptGroup
                            ? promptStates.map(state => `${state.prompt.label}: ${state.prompt.templateContext.replace(state.prompt.placeholder, '______')}`).join('\n')
                            : (fp.templateContext || '');
                          const instrLines = isAutoFillField ? 0 : countWrappedLines(instrText, 38);
                          const contextLines = contextText ? countWrappedLines(contextText, 34) : 0;
                          const valueLines = isFilled ? countWrappedLines(val, prov === 'scaffold' ? 30 : 42) : 1;
                          const sourceLines = countWrappedLines(dataSummary || (promptGroup ? promptStates.map(state => state.prompt.dataHint).filter(Boolean).join(' | ') : fp.dataHint) || '', 44);
                          return 64
                            + (contextLines * 14)
                            + (isAutoFillField ? 0 : 28 + instrLines * 14)
                            + (sourceLines * 12)
                            + (valueLines * 14)
                            + (prov === 'scaffold' ? 24 : 14);
                        })();
                      prevBottom = topPx + estimatedHeight;
                    }

                    const aiBg = isDarkMode ? 'rgba(54,144,206,0.10)' : 'rgba(54,144,206,0.05)';
                    const aiBgHover = isDarkMode ? 'rgba(54,144,206,0.16)' : 'rgba(54,144,206,0.09)';
                    const aiBorder = isDarkMode ? 'rgba(54,144,206,0.32)' : 'rgba(54,144,206,0.24)';
                    const mergeBg = isDarkMode ? 'rgba(32,178,108,0.08)' : 'rgba(32,178,108,0.04)';
                    const mergeBgHover = isDarkMode ? 'rgba(32,178,108,0.14)' : 'rgba(32,178,108,0.08)';
                    const mergeBorder = isDarkMode ? 'rgba(32,178,108,0.28)' : 'rgba(32,178,108,0.18)';
                    const scaffoldBg = isDarkMode ? 'rgba(250,204,21,0.07)' : 'rgba(250,204,21,0.09)';
                    const scaffoldBgHover = isDarkMode ? 'rgba(250,204,21,0.12)' : 'rgba(250,204,21,0.13)';
                    const scaffoldBorder = isDarkMode ? 'rgba(250,204,21,0.32)' : 'rgba(202,138,4,0.28)';
                    const baseBg = isDarkMode ? 'rgba(148,163,184,0.07)' : 'rgba(148,163,184,0.04)';
                    const baseBgHover = isDarkMode ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.08)';
                    const baseBorder = isDarkMode ? 'rgba(148,163,184,0.22)' : 'rgba(100,116,139,0.14)';
                    const loadingBg = isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.04)';
                    const loadingBorder = isDarkMode ? 'rgba(54,144,206,0.28)' : 'rgba(54,144,206,0.18)';

                    let leftAccent = isDarkMode ? 'rgba(54,144,206,0.5)' : 'rgba(13,47,96,0.35)';
                    let cardBg = baseBg;
                    let cardBorderCol = baseBorder;
                    let cardHoverBg = baseBgHover;
                    if (isLoading) {
                      leftAccent = colours.highlight;
                      cardBg = loadingBg;
                      cardBorderCol = loadingBorder;
                      cardHoverBg = loadingBg;
                    } else if (prov === 'ai') {
                      leftAccent = colours.highlight;
                      cardBg = aiBg;
                      cardBorderCol = aiBorder;
                      cardHoverBg = aiBgHover;
                    } else if (prov === 'auto-fill') {
                      leftAccent = colours.green;
                      cardBg = mergeBg;
                      cardBorderCol = mergeBorder;
                      cardHoverBg = mergeBgHover;
                    } else if (prov === 'scaffold') {
                      leftAccent = isDarkMode ? '#facc15' : '#ca8a04';
                      cardBg = scaffoldBg;
                      cardBorderCol = scaffoldBorder;
                      cardHoverBg = scaffoldBgHover;
                    }

                    // Status badge
                    const badgeColor = isLoading
                      ? colours.highlight
                      : prov === 'ai'
                        ? colours.highlight
                        : prov === 'auto-fill'
                          ? colours.green
                          : prov === 'scaffold'
                            ? (isDarkMode ? '#facc15' : '#ca8a04')
                            : prov === 'user'
                              ? colours.blue
                              : isResolved
                                ? textMuted
                                : colours.cta;
                    const badgeBg = isLoading
                      ? (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.06)')
                      : prov === 'ai'
                        ? (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.06)')
                        : prov === 'auto-fill'
                        ? (isDarkMode ? 'rgba(32,178,108,0.12)' : 'rgba(32,178,108,0.06)')
                        : prov === 'scaffold'
                          ? (isDarkMode ? 'rgba(250,204,21,0.12)' : 'rgba(250,204,21,0.12)')
                        : (isDarkMode ? 'rgba(214,85,65,0.12)' : 'rgba(214,85,65,0.06)');
                    const badgeText = isLoading
                      ? 'LOADING'
                      : prov === 'ai'
                        ? 'AI FILLED'
                        : prov === 'auto-fill'
                          ? 'MAIL MERGE'
                          : prov === 'user'
                            ? 'EDITED'
                            : prov === 'scaffold'
                              ? 'TEMPLATE'
                              : isResolved
                                ? 'DEFAULT COPY'
                                : 'NEEDS REVIEW';

                    // Section heading colour
                    const sectionBadgeBg = isResolved
                      ? (isDarkMode ? 'rgba(32,178,108,0.12)' : 'rgba(32,178,108,0.06)')
                      : (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(13,47,96,0.08)');
                    const sectionBadgeColor = prov === 'ai'
                      ? colours.highlight
                      : prov === 'auto-fill'
                        ? colours.green
                        : prov === 'scaffold'
                          ? (isDarkMode ? '#facc15' : '#ca8a04')
                          : isResolved ? colours.green : (isDarkMode ? colours.accent : colours.highlight);

                    // Type label (no colour — just text distinction)
                    const typeText = cardTypeText || (fp.key === 'identify_the_other_party_eg_your_opponents'
                      ? 'Matter Data'
                      : prov === 'scaffold'
                        ? 'Template Scaffold'
                        : isAutoFillField ? 'Mail Merge' : 'AI Target');

                    // ── Collapsed completed card (click chevron to expand) ──
                    if (isResolved && !isExpanded) {
                      const snippet = promptGroup
                        ? `${promptStates.filter(state => state.isResolved).length}/${promptStates.length} items ready`
                        : (val.length > 50 ? val.slice(0, 50) + '…' : val);
                      return (
                        <div
                          key={cardKey}
                          data-ccl-prompt={cardKey}
                          style={{
                            ...(promptLayout === 'inline'
                              ? { position: 'absolute' as const, top: topPx, left: 8, right: 8 }
                              : { margin: '0 8px 4px' }),
                            padding: '6px 10px', borderRadius: 3, cursor: 'pointer',
                            background: cardBg,
                            border: `1px solid ${cardBorderCol}`,
                            borderLeft: `3px solid ${leftAccent}`,
                            boxShadow: isActiveNavigation
                              ? `0 0 0 2px ${isDarkMode ? 'rgba(135,243,243,0.24)' : 'rgba(54,144,206,0.22)'}`
                              : isLinkedHighlight
                              ? `0 0 0 2px ${isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(54,144,206,0.14)'}`
                              : undefined,
                            transition: 'top 0.3s ease, background 0.12s ease',
                            animation: reviewCascadeKey > 0 ? `cclCascadeIn 0.28s ${Math.min(index * 36, 360)}ms ease both` : undefined,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = cardHoverBg; setHoveredField(fp.key); }}
                          onMouseLeave={e => { e.currentTarget.style.background = cardBg; setHoveredField(prev => (prev === fp.key ? null : prev)); }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              onClick={(e) => { e.stopPropagation(); setExpandedCards(prev => { const n = new Set(prev); n.add(cardKey); return n; }); }}
                              style={{
                                width: 16, height: 16, borderRadius: 2, fontSize: 8, flexShrink: 0,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                color: textMuted, cursor: 'pointer',
                              }}
                              title="Expand card"
                            >
                              <Icon iconName="ChevronRight" styles={{ root: { fontSize: 8 } }} />
                            </span>
                            <span style={{
                              width: 16, height: 16, borderRadius: 2, fontSize: 7, fontWeight: 700, flexShrink: 0,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: sectionBadgeBg, color: sectionBadgeColor,
                            }}>{/^\d/.test(fp.section) ? fp.section : '✦'}</span>
                            <span
                              onClick={() => scrollFieldToDocument(cardKey)}
                              style={{ fontSize: 10, fontWeight: 700, color: text, whiteSpace: 'nowrap' as const, flexShrink: 0 }}
                            >{cardLabel}</span>
                            <span style={{
                              fontSize: 9, color: textMuted, flex: 1,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                            }}>{snippet}</span>
                            <span style={{
                              fontSize: 7, fontWeight: 700, textTransform: 'uppercase' as const,
                              padding: '1px 5px', borderRadius: 2, letterSpacing: '0.04em',
                              color: badgeColor, background: badgeBg, border: `1px solid ${badgeColor}`,
                              flexShrink: 0,
                            }}>{badgeText}</span>
                            {ptResult?.fieldScores?.[cardKey] && (() => {
                              const pts = ptResult.fieldScores[cardKey];
                              const ptColor = pts.score >= 8 ? colours.green : pts.score >= 7 ? colours.yellow : '#fca5a5';
                              const ptBg = pts.score >= 8 ? 'rgba(32,178,108,0.12)' : pts.score >= 7 ? 'rgba(255,213,79,0.12)' : 'rgba(214,85,65,0.12)';
                              return (
                                <span title={pts.reason || ''} style={{
                                  fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 2,
                                  color: ptColor, background: ptBg, flexShrink: 0,
                                }}>{pts.score}/10{pts.flag ? ' ⚠' : ''}</span>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    }

                    // ── Expanded card (for incomplete OR expanded-complete cards) ──
                    const showAsComplete = isResolved && isExpanded;
                    return (
                      <div
                        key={cardKey}
                        data-ccl-prompt={cardKey}
                        style={{
                          ...(promptLayout === 'inline'
                            ? { position: 'absolute' as const, top: topPx, left: 8, right: 8 }
                            : { margin: '0 8px 6px' }),
                          padding: 0, borderRadius: 3, cursor: 'default',
                          background: cardBg,
                          border: `1px solid ${cardBorderCol}`,
                          borderLeft: `3px solid ${leftAccent}`,
                          boxShadow: isActiveNavigation
                            ? `0 0 0 2px ${isDarkMode ? 'rgba(135,243,243,0.24)' : 'rgba(54,144,206,0.22)'}`
                            : isLinkedHighlight
                            ? `0 0 0 2px ${isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(54,144,206,0.14)'}`
                            : undefined,
                          transition: 'top 0.3s ease, background 0.12s ease, border 0.2s ease',
                          overflow: 'hidden' as const,
                          animation: reviewCascadeKey > 0 ? `cclCascadeIn 0.28s ${Math.min(index * 36, 360)}ms ease both` : undefined,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = cardHoverBg; setHoveredField(fp.key); }}
                        onMouseLeave={e => { e.currentTarget.style.background = cardBg; setHoveredField(prev => (prev === fp.key ? null : prev)); }}
                      >
                        {/* ── Header row ── */}
                        <div
                          onClick={() => scrollFieldToDocument(cardKey)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', cursor: 'pointer' }}
                        >
                          {showAsComplete && (
                            <span
                              onClick={(e) => { e.stopPropagation(); setExpandedCards(prev => { const n = new Set(prev); n.delete(cardKey); return n; }); }}
                              style={{
                                width: 16, height: 16, borderRadius: 2, fontSize: 8, flexShrink: 0,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                color: textMuted, cursor: 'pointer',
                              }}
                              title="Collapse card"
                            >
                              <Icon iconName="ChevronDown" styles={{ root: { fontSize: 8 } }} />
                            </span>
                          )}
                          <span style={{
                            width: 18, height: 18, borderRadius: 2, fontSize: 8, fontWeight: 700, flexShrink: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: sectionBadgeBg, color: sectionBadgeColor,
                          }}>{/^\d/.test(sectionRefPrompt.section) ? sectionRefPrompt.section : '✦'}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{cardLabel}</span>
                          <span style={{
                            fontSize: 7, fontWeight: 600, color: textMuted,
                            padding: '1px 4px', letterSpacing: '0.03em', flexShrink: 0,
                          }}>{typeText}</span>
                          <span style={{
                            fontSize: 7, fontWeight: 700, textTransform: 'uppercase' as const,
                            padding: '1px 5px', borderRadius: 2, letterSpacing: '0.04em',
                            color: badgeColor, background: badgeBg, border: `1px solid ${badgeColor}`,
                            flexShrink: 0,
                            animation: isLoading ? 'cclPulse 1.5s ease-in-out infinite' : undefined,
                          }}>
                            {badgeText}
                          </span>
                          {ptResult?.fieldScores?.[cardKey] && (() => {
                            const pts = ptResult.fieldScores[cardKey];
                            const ptColor = pts.score >= 8 ? colours.green : pts.score >= 7 ? colours.yellow : '#fca5a5';
                            const ptBg = pts.score >= 8 ? 'rgba(32,178,108,0.12)' : pts.score >= 7 ? 'rgba(255,213,79,0.12)' : 'rgba(214,85,65,0.12)';
                            return (
                              <span title={pts.reason || ''} style={{
                                fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 2,
                                color: ptColor, background: ptBg, flexShrink: 0,
                              }}>{pts.score}/10{pts.flag ? ' ⚠' : ''}</span>
                            );
                          })()}
                        </div>

                        {/* ── Body sections ── */}
                        <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                          {/* ── IN: Template context — where this field sits in the letter ── */}
                          {(promptGroup ? promptStates.some(state => !!state.prompt.templateContext) : !!fp.templateContext) && (
                            <div>
                              <div style={{
                                fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const,
                                letterSpacing: '0.06em', color: textMuted, marginBottom: 4,
                              }}>In the letter</div>
                              <div style={{
                                fontSize: 10, lineHeight: 1.5,
                                color: isDarkMode ? '#d1d5db' : '#374151',
                                padding: '6px 8px', borderRadius: 2,
                                background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                                fontStyle: 'italic',
                              }}>
                                {promptGroup ? (
                                  isActionGroup ? (
                                    <>
                                      <div style={{ marginBottom: 4 }}>
                                        <strong style={{ fontStyle: 'normal' }}>Client action:</strong>{' '}
                                        ☐ ______ | ______
                                      </div>
                                      <div style={{ marginBottom: 4 }}>
                                        <strong style={{ fontStyle: 'normal' }}>Payment row:</strong>{' '}
                                        ☐ Provide a payment on account of £______ | If we do not receive… ______
                                      </div>
                                      <div>
                                        <strong style={{ fontStyle: 'normal' }}>Documents / information needed:</strong>{' '}
                                        ☐ ______ (up to 3 items)
                                      </div>
                                    </>
                                  ) : promptStates.map(state => (
                                    <div key={state.prompt.key} style={{ marginBottom: 4 }}>
                                      <strong style={{ fontStyle: 'normal' }}>{state.prompt.label}:</strong>{' '}
                                      {state.prompt.templateContext.replace(state.prompt.placeholder, '______')}
                                    </div>
                                  ))
                                ) : fp.templateContext.trim() === fp.placeholder.trim() ? (
                                  <span style={{ fontStyle: 'normal' }}>
                                    This field supplies the full {fp.sectionTitle.toLowerCase()} section body at this point in the letter. Review the scaffold below for the actual default wording and structure.
                                  </span>
                                ) : fp.templateContext.replace(fp.placeholder, '______')}
                              </div>
                            </div>
                          )}

                          {/* ── PROMPT: What the AI was asked (AI fields only) ── */}
                          {(promptGroup ? promptStates.some(state => !state.isAutoFillField) : !isAutoFillField) && (
                            <div>
                              <div style={{
                                fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const,
                                letterSpacing: '0.06em', color: isDarkMode ? 'rgba(147,197,253,0.7)' : 'rgba(13,47,96,0.5)', marginBottom: 4,
                              }}>Prompt</div>
                              <div style={{
                                fontSize: 10.5, lineHeight: 1.55,
                                color: isDarkMode ? '#93c5fd' : colours.helixBlue,
                              }}>
                                {promptGroup ? (
                                  isActionGroup ? (
                                    <>
                                      <div style={{ marginBottom: 4 }}>
                                        <strong>Client action:</strong> Tell the client what they must do next, then explain briefly why that step matters.
                                      </div>
                                      <div style={{ marginBottom: 4 }}>
                                        <strong>Payment row:</strong> Mirror the payment on account amount from section 6 and explain what happens if the payment is not received.
                                      </div>
                                      <div>
                                        <strong>Documents / information needed:</strong> Name up to 3 specific documents or information items required from the client, shown as one combined request block rather than separate repeated prompts.
                                      </div>
                                    </>
                                  ) : nonDocumentPromptStates.filter(state => !state.isAutoFillField).map(state => (
                                    <div key={state.prompt.key} style={{ marginBottom: 4 }}>
                                      <strong>{state.prompt.label}:</strong> {state.prompt.instruction}
                                    </div>
                                  ))
                                ) : fp.instruction}
                              </div>
                            </div>
                          )}

                          {/* ── SOURCE: Where the data came from ── */}
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            fontSize: 9, color: textMuted,
                          }}>
                            <span style={{
                              width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                              background: isDarkMode ? colours.accent : colours.highlight,
                            }} />
                            <span style={{ fontWeight: 600 }}>{isAutoFillField ? 'Source:' : 'Data:'}</span>
                            {isLoading ? 'Gathering context…' : dataSummary || (promptGroup ? promptStates.map(state => state.prompt.dataHint).filter(Boolean).join(' | ') : fp.dataHint) || '—'}
                          </div>

                          {/* ── OUTPUT: The generated value / review prompt ── */}
                          <div>
                            <div style={{
                              fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const,
                              letterSpacing: '0.06em', color: isResolved ? colours.green : textMuted, marginBottom: 4,
                            }}>{isResolved ? 'Output' : (prov === 'scaffold' ? 'Template Scaffold' : (isAutoFillField ? 'Value' : 'Output'))}</div>
                            {isLoading ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{
                                  height: 8, borderRadius: 2, width: '85%',
                                  background: `linear-gradient(90deg, ${isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.06)'} 25%, ${isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(54,144,206,0.12)'} 50%, ${isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.06)'} 75%)`,
                                  backgroundSize: '200% 100%',
                                  animation: 'cclShimmer 1.5s ease-in-out infinite',
                                }} />
                                <div style={{
                                  height: 8, borderRadius: 2, width: '60%',
                                  background: `linear-gradient(90deg, ${isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.06)'} 25%, ${isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(54,144,206,0.12)'} 50%, ${isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.06)'} 75%)`,
                                  backgroundSize: '200% 100%',
                                  animation: 'cclShimmer 1.5s ease-in-out infinite 0.2s',
                                }} />
                              </div>
                            ) : isFilled ? (
                              <div style={{
                                fontSize: 10.5, lineHeight: 1.55,
                                color: isDarkMode ? '#d1d5db' : '#374151',
                                padding: '6px 8px', borderRadius: 2,
                                background: isDarkMode ? 'rgba(32,178,108,0.04)' : 'rgba(32,178,108,0.02)',
                                border: `1px solid ${isDarkMode ? 'rgba(32,178,108,0.10)' : 'rgba(32,178,108,0.06)'}`,
                                whiteSpace: 'pre-wrap' as const,
                                wordBreak: 'break-word' as const,
                              }}>
                                {promptGroup ? (
                                  isActionGroup ? (
                                    <>
                                      <div style={{ marginBottom: 6 }}>
                                        <strong>Client action:</strong>{' '}
                                        {promptStates.find(state => state.prompt.key === 'insert_next_step_you_would_like_client_to_take')?.val || <span style={{ color: colours.cta }}>Requires review</span>}
                                      </div>
                                      <div style={{ marginBottom: 6 }}>
                                        <strong>Why it matters:</strong>{' '}
                                        {promptStates.find(state => state.prompt.key === 'state_why_this_step_is_important')?.val || <span style={{ color: colours.cta }}>Requires review</span>}
                                      </div>
                                      <div style={{ marginBottom: 6 }}>
                                        <strong>Payment on account:</strong>{' '}
                                        {promptStates.find(state => state.prompt.key === 'state_amount')?.val || <span style={{ color: colours.cta }}>Requires review</span>}
                                        {' '}|{' '}
                                        {promptStates.find(state => state.prompt.key === 'insert_consequence')?.val || <span style={{ color: colours.cta }}>Requires review</span>}
                                      </div>
                                      <div>
                                        <strong>Documents / information needed:</strong>{' '}
                                        {combinedDocumentValues.length > 0 ? (
                                          <span>{combinedDocumentValues.join(' | ')}</span>
                                        ) : (
                                          <span style={{ color: colours.cta }}>Requires review</span>
                                        )}
                                      </div>
                                    </>
                                  ) : promptStates.map(state => (
                                    <div key={state.prompt.key} style={{ marginBottom: 6 }}>
                                      <strong>{state.prompt.label}:</strong>{' '}
                                      {state.val || <span style={{ color: colours.cta }}>Requires review</span>}
                                    </div>
                                  ))
                                ) : val}
                              </div>
                            ) : (
                              <div style={{
                                fontSize: 10, color: colours.cta,
                                fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5,
                              }}>
                                <span style={{ fontSize: 12 }}>⚑</span> Requires review
                              </div>
                            )}
                          </div>

                          {/* ── PT flag reason (if pressure test flagged this field) ── */}
                          {ptResult?.fieldScores?.[fp.key]?.flag && (
                            <div style={{
                              fontSize: 9.5, lineHeight: 1.5,
                              color: isDarkMode ? '#fca5a5' : colours.cta,
                              padding: '4px 8px', borderRadius: 2,
                              background: isDarkMode ? 'rgba(214,85,65,0.06)' : 'rgba(214,85,65,0.04)',
                              border: `1px solid ${isDarkMode ? 'rgba(214,85,65,0.15)' : 'rgba(214,85,65,0.10)'}`,
                            }}>
                              <span style={{ fontWeight: 700, fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>⚠ Flagged: </span>
                              {ptResult.fieldScores[fp.key].reason}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
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

      {/* ═══ NetDocuments Upload Confirmation Modal ═══ */}
      {showNdConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          paddingTop: 80,
          background: isDarkMode ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(3px)',
          animation: 'cclFadeIn 0.15s ease',
        }} onClick={() => { if (!uploadingNd) setShowNdConfirm(false); }}>
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
                <div style={{ fontSize: 13, fontWeight: 700, color: text }}>Upload to NetDocuments</div>
                <div style={{ fontSize: 10, color: textMuted }}>Confirm document upload</div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: text, lineHeight: 1.6, marginBottom: 16 }}>
                This will upload the generated Client Care Letter into the shared HELIX01-01 NetDocuments demo workspace while the full CCL generation path is still being stabilised.
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
                  <span style={{ fontSize: 10, color: textMuted, fontWeight: 600 }}>Workspace</span>
                  <span style={{ fontSize: 10, color: text }}>{integrations?.nd?.workspaceName || 'HELIX01-01 demo workspace'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: textMuted, fontWeight: 600 }}>Workspace ID</span>
                  <span style={{ fontSize: 10, color: text }}>{integrations?.nd?.workspaceId || 'Resolving…'}</span>
                </div>
              </div>

              {uploadingNd && (
                <div style={{ fontSize: 10, color: accentBlue, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Spinner size={SpinnerSize.xSmall} />
                  Uploading to NetDocuments...
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
                disabled={uploadingNd}
                onClick={() => setShowNdConfirm(false)}
                style={{
                  padding: '6px 16px', borderRadius: 3, height: 28,
                  background: 'transparent', border: `1px solid ${cardBorder}`,
                  color: textMuted, fontSize: 11, fontWeight: 600,
                  cursor: uploadingNd ? 'not-allowed' : 'pointer',
                  opacity: uploadingNd ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button type="button"
                disabled={uploadingNd || !integrations?.nd?.available}
                onClick={async () => {
                  await handleUploadNd();
                  setShowNdConfirm(false);
                }}
                style={{
                  padding: '6px 16px', borderRadius: 3, height: 28,
                  background: uploadingNd ? (isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(54,144,206,0.1)') : accentBlue,
                  border: 'none',
                  color: '#ffffff', fontSize: 11, fontWeight: 600,
                  cursor: (uploadingNd || !integrations?.nd?.available) ? 'not-allowed' : 'pointer',
                  opacity: (uploadingNd || !integrations?.nd?.available) ? 0.6 : 1,
                }}
              >
                {uploadingNd ? 'Uploading...' : 'Upload to NetDocuments'}
              </button>
            </div>
          </div>

        </div>
      )}


      {/* ═══ Support Report Modal ═══ */}
      {isDevMode && showSupportModal && (() => {
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
