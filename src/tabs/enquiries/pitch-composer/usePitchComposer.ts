import { useCallback, useEffect, useMemo, useState } from 'react';
import { SCENARIOS, type Scenario } from '../pitch-builder/scenarios';
import { processEmailContentV2 } from '../pitch-builder/emailFormattingV2';
import { applyDynamicSubstitutions } from '../pitch-builder/emailUtils';
import { buildPortalUrl } from '../../../utils/portalLaunch';
import type { Enquiry, UserData } from '../../../app/functionality/types';

// ── Types ──────────────────────────────────────────────────────────────────

export type PlaceholderStatus = {
  token: string;
  label: string;
  resolved: boolean;
  /** The resolved value (if auto-filled) */
  value?: string;
};

export type DealState =
  | { status: 'idle' }
  | { status: 'creating' }
  | { status: 'created'; dealId: number; passcode: string; instructionRef: string; instructionsUrl: string }
  | { status: 'error'; message: string };

export type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent' }
  | { status: 'drafting' }
  | { status: 'drafted' }
  | { status: 'error'; message: string };

export type ToastMessage = {
  type: 'success' | 'error' | 'info';
  text: string;
} | null;

export type ComposerMode = 'scenario' | 'quicklink' | null;

export interface PitchComposerState {
  mode: ComposerMode;
  scenarios: Scenario[];
  selectedScenario: Scenario | null;
  subject: string;
  body: string;
  toEmail: string;
  ccEmails: string;
  amount: string;
  description: string;
  dealState: DealState;
  sendState: SendState;
  toast: ToastMessage;
  placeholders: PlaceholderStatus[];
  instructLink: string;
}

export interface PitchComposerActions {
  setMode: (mode: ComposerMode) => void;
  selectScenario: (id: string) => void;
  setSubject: (v: string) => void;
  setBody: (v: string) => void;
  setToEmail: (v: string) => void;
  setCcEmails: (v: string) => void;
  setAmount: (v: string) => void;
  setDescription: (v: string) => void;
  createDealAndDraft: () => Promise<void>;
  copyLink: () => Promise<void>;
  generateLink: () => Promise<void>;
  dismissToast: () => void;
  reset: () => void;
  canSend: boolean;
  canGenerateLink: boolean;
}

// ── Placeholder detection ──────────────────────────────────────────────────

const PLACEHOLDER_TOKENS = [
  { token: '[INSERT]', label: 'Custom text', autoResolve: false },
  { token: '[ROLE]', label: 'Role', autoResolve: true },
  { token: '[RATE]', label: 'Hourly rate', autoResolve: true },
  { token: '[InstructLink]', label: 'Instruct link', autoResolve: true },
  { token: '[Calendly]', label: 'Calendly link', autoResolve: true },
];

function detectPlaceholders(body: string, userData: UserData | null): PlaceholderStatus[] {
  const results: PlaceholderStatus[] = [];

  // Count [INSERT ...] occurrences (may have custom text like [INSERT the contracts...])
  const insertMatches = body.match(/\[INSERT[^\]]*\]/gi);
  if (insertMatches) {
    insertMatches.forEach((m, i) => {
      results.push({
        token: m,
        label: insertMatches.length > 1 ? `Custom text ${i + 1}` : 'Custom text',
        resolved: false,
      });
    });
  }

  // Check auto-resolvable tokens
  for (const { token, label, autoResolve } of PLACEHOLDER_TOKENS) {
    if (token === '[INSERT]') continue; // Handled above
    if (!body.includes(token)) continue;

    let resolved = false;
    let value: string | undefined;

    if (autoResolve && userData) {
      if (token === '[ROLE]' && userData.Role && userData.Role !== '[Position]') {
        resolved = true;
        value = userData.Role;
      } else if (token === '[RATE]' && userData.Rate) {
        resolved = true;
        value = `£${userData.Rate} + VAT`;
      } else if (token === '[InstructLink]') {
        resolved = true; // Will be resolved at send time with passcode
        value = 'Generated at send';
      } else if (token === '[Calendly]') {
        resolved = true; // Standard link
        value = 'Calendly link';
      }
    }

    results.push({ token, label, resolved, value });
  }

  return results;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function usePitchComposer(
  enquiry: Enquiry | null,
  userData: UserData[] | null,
  userEmail?: string,
): PitchComposerState & PitchComposerActions {
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [ccEmails, setCcEmails] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [dealState, setDealState] = useState<DealState>({ status: 'idle' });
  const [sendState, setSendState] = useState<SendState>({ status: 'idle' });
  const [toast, setToast] = useState<ToastMessage>(null);
  const [mode, setMode] = useState<ComposerMode>(null);

  // Current user data (first entry)
  const currentUser = useMemo(() => userData?.[0] ?? null, [userData]);

  // Pre-fill To from enquiry email
  useEffect(() => {
    if (enquiry?.Email && !toEmail) {
      setToEmail(enquiry.Email);
    }
  }, [enquiry?.Email]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect placeholders in current body
  const placeholders = useMemo(() => detectPlaceholders(body, currentUser), [body, currentUser]);

  // Instruct link (if deal created)
  const instructLink = useMemo(() => {
    if (dealState.status === 'created') {
      return buildPortalUrl(dealState.passcode);
    }
    return '';
  }, [dealState]);

  // Can send: needs to, subject, body, amount (unless CFA)
  const isCfa = selectedScenario?.id === 'cfa';
  const canSend = useMemo(() => {
    if (!toEmail.trim()) return false;
    if (!subject.trim()) return false;
    if (!body.trim()) return false;
    if (!isCfa && !amount.trim()) return false;
    if (sendState.status === 'sending' || sendState.status === 'drafting') return false;
    if (dealState.status === 'creating') return false;
    return true;
  }, [toEmail, subject, body, amount, isCfa, sendState.status, dealState.status]);

  // Select scenario → populate subject + body
  const selectScenario = useCallback((id: string) => {
    const scenario = SCENARIOS.find(s => s.id === id) ?? null;
    setSelectedScenario(scenario);
    if (scenario) {
      setSubject(scenario.subject);
      setBody(scenario.body);
      // CFA → amount = 0
      if (scenario.id === 'cfa') {
        setAmount('0');
      }
    }
  }, []);

  // ── Deal creation ────────────────────────────────────────────────────────

  const createDeal = useCallback(async (opts?: { linkOnly?: boolean }): Promise<{ dealId: number; passcode: string; instructionRef: string; instructionsUrl: string } | null> => {
    // If already created, return existing
    if (dealState.status === 'created') {
      return {
        dealId: dealState.dealId,
        passcode: dealState.passcode,
        instructionRef: dealState.instructionRef,
        instructionsUrl: dealState.instructionsUrl,
      };
    }

    setDealState({ status: 'creating' });

    try {
      const prospectId = enquiry?.ID || enquiry?.pitchEnquiryId || null;
      const pitchedBy = currentUser?.Initials || 'XX';

      const payload: Record<string, unknown> = {
        serviceDescription: description || subject,
        initialScopeDescription: description || subject,
        amount: isCfa ? 0 : Number(amount) || 0,
        areaOfWork: enquiry?.Area_of_Work || 'Commercial',
        prospectId: prospectId ? Number(prospectId) : undefined,
        pitchedBy,
        emailSubject: subject || undefined,
        emailBody: body || undefined,
        emailBodyHtml: '',
        scenarioId: selectedScenario?.id || '',
        checkoutMode: isCfa ? 'CFA' : undefined,
        leadClientEmail: toEmail || enquiry?.Email || undefined,
      };

      if (opts?.linkOnly) {
        payload.linkOnly = true;
      }

      const res = await fetch('/api/deal-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Deal creation failed' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const result = {
        dealId: data.dealId,
        passcode: String(data.passcode),
        instructionRef: data.instructionRef,
        instructionsUrl: data.instructionsUrl,
      };

      setDealState({ status: 'created', ...result });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Deal creation failed';
      setDealState({ status: 'error', message });
      setToast({ type: 'error', text: `Deal failed: ${message}` });
      return null;
    }
  }, [dealState, enquiry, currentUser, description, subject, body, amount, isCfa, toEmail, selectedScenario]);

  // ── Build final HTML ─────────────────────────────────────────────────────

  const buildFinalHtml = useCallback((passcode: string) => {
    // First apply dynamic substitutions (replaces [ROLE], [RATE], [InstructLink], etc.)
    let html = applyDynamicSubstitutions(
      body,
      userData || [],
      enquiry as Enquiry,
      amount,
      passcode,
    );

    // Wrap plain text in paragraphs (textarea content is plain text with line breaks)
    html = html
      .split(/\n\n+/)
      .map(para => `<p>${para.replace(/\n/g, '<br />')}</p>`)
      .join('');

    // Highlight any remaining [INSERT...] tokens so they're impossible to miss in Outlook
    html = html.replace(/\[INSERT[^\]]*\]/gi, (match) => {
      const hint = match.slice(1, -1); // strip outer brackets
      return `<span style="background-color:#FFF3CD;color:#856404;padding:2px 4px;border:1px dashed #856404;font-weight:bold;">\u26A0 ${hint}</span>`;
    });

    // Run through V2 formatting pipeline for Outlook compatibility
    html = processEmailContentV2(html);

    return html;
  }, [body, userData, enquiry, amount]);

  // ── Create deal + Outlook draft ─────────────────────────────────────────

  const createDealAndDraft = useCallback(async () => {
    if (!canSend) return;

    setSendState({ status: 'sending' });
    setToast({ type: 'info', text: 'Creating deal and drafting in Outlook…' });

    try {
      // 1. Create deal (or reuse existing)
      const deal = await createDeal();
      if (!deal) {
        setSendState({ status: 'error', message: 'Deal creation failed' });
        return;
      }

      // 2. Build final HTML
      const finalHtml = buildFinalHtml(deal.passcode);

      // 3. Create real Outlook draft in FE's mailbox
      const mailboxEmail = userEmail || currentUser?.Email || '';
      if (!mailboxEmail) {
        throw new Error('Could not determine your email address');
      }

      const res = await fetch('/api/create-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mailbox_email: mailboxEmail,
          subject,
          body_html: finalHtml,
          to_email: toEmail,
          cc_emails: ccEmails || undefined,
          bcc_emails: 'lz@helix-law.com',
          signature_initials: currentUser?.Initials || '',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Draft creation failed' }));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      setSendState({ status: 'sent' });
      setToast({ type: 'success', text: 'Draft created — check your Outlook Drafts folder' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Draft creation failed';
      setSendState({ status: 'error', message });
      setToast({ type: 'error', text: `Draft failed: ${message}` });
    }
  }, [canSend, createDeal, buildFinalHtml, userEmail, currentUser, subject, toEmail, ccEmails]);

  // ── Copy link ────────────────────────────────────────────────────────────

  const copyLink = useCallback(async () => {
    try {
      const deal = await createDeal();
      if (!deal) return;

      const url = buildPortalUrl(deal.passcode);
      await navigator.clipboard.writeText(url);
      setToast({ type: 'success', text: 'Instruct link copied' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Copy failed';
      setToast({ type: 'error', text: message });
    }
  }, [createDeal]);

  // ── Generate standalone link ─────────────────────────────────────────────

  const canGenerateLink = useMemo(() => {
    if (!description.trim()) return false;
    if (!amount.trim()) return false;
    if (dealState.status === 'creating') return false;
    return true;
  }, [description, amount, dealState.status]);

  const generateLink = useCallback(async () => {
    if (!canGenerateLink) return;

    setToast({ type: 'info', text: 'Creating deal and generating link…' });

    try {
      const deal = await createDeal({ linkOnly: true });
      if (!deal) return;

      const url = buildPortalUrl(deal.passcode);
      await navigator.clipboard.writeText(url);
      setSendState({ status: 'sent' }); // triggers onPitchSent → timeline refresh
      setToast({ type: 'success', text: 'Link generated and copied to clipboard' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Link generation failed';
      setToast({ type: 'error', text: message });
    }
  }, [canGenerateLink, createDeal]);

  // ── Reset ────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setMode(null);
    setSelectedScenario(null);
    setSubject('');
    setBody('');
    setAmount('');
    setDescription('');
    setDealState({ status: 'idle' });
    setSendState({ status: 'idle' });
    setToast(null);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  return {
    mode,
    scenarios: SCENARIOS,
    selectedScenario,
    subject,
    body,
    toEmail,
    ccEmails,
    amount,
    description,
    dealState,
    sendState,
    toast,
    placeholders,
    instructLink,
    setMode,
    selectScenario,
    setSubject,
    setBody,
    setToEmail,
    setCcEmails,
    setAmount,
    setDescription,
    createDealAndDraft,
    copyLink,
    generateLink,
    dismissToast,
    reset,
    canSend,
    canGenerateLink,
  };
}
