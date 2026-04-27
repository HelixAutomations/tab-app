// invisible change
//
// AttendanceNoteBox — Cut 2 of the Call Centre rework.
//
// Clio-mirror modal that replaces the inline "generated note" preview when
// the user clicks "Add to file" on an external call in the Call Centre
// surface. Presentational-only: the host (CallsAndNotes) passes in the call,
// the transcript, the generated note, the matter-chain prefill, and handles
// the actual Save fork in `onSave`.
//
// Fields (mirroring Clio's Create Time Entry box):
//   • Matter (live lookup via shared MatterLookup)
//   • Document type ("Attendance Note" — locked for this surface)
//   • Date (read-only — from the call)
//   • Duration (read-only — from the call)
//   • Chargeable time (editable, 6-min units — Clio's native cadence)
//   • Summary / narrative (editable textarea — defaults to first 500 chars
//     of the generated note)
//   • Action points (checklist derived from the generated note)
//   • Toggles: upload to NetDocuments (opt-in) and record Clio time entry
//     (opt-in; the endpoint ships in Cut 3 — when off, the Save leg no-ops)
//
// The transcript pane is a collapsible side panel so the fee earner can
// cross-check nuances the generated note might miss — the "brief backing
// on the transcript" the user asked for.
//
// Save path: `onSave(payload)` fires once and returns a per-leg status map
// which the box renders beneath the Save button. The host owns the network
// calls (existing save-note, existing upload-note-nd, new clio-time-entry
// in Cut 3, /api/todo/reconcile at the end).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiFileText, FiUploadCloud, FiClock, FiX, FiCheck, FiAlertCircle, FiCalendar, FiUser, FiCloud, FiEdit3 } from 'react-icons/fi';
import { colours, withAlpha } from '../../app/styles/colours';
import MatterLookup from '../matter-lookup/MatterLookup';
import type { MatterLookupOption } from '../matter-lookup/MatterLookup';
import ProspectLookup from '../matter-lookup/ProspectLookup';
import type { ProspectLookupOption } from '../matter-lookup/ProspectLookup';

export interface AttendanceNoteBoxSaveLegStatus {
  leg: 'save-note' | 'upload-nd' | 'clio-time-entry' | 'todo-reconcile';
  status: 'idle' | 'running' | 'success' | 'failed' | 'skipped';
  message?: string;
  retriable?: boolean;
}

export type AttendanceNoteTarget = 'matter' | 'prospect';

export interface AttendanceNoteBoxPayload {
  recordingId: string;
  target: AttendanceNoteTarget;
  matterDisplayNumber: string;
  matterClientName: string;
  /** Prospect mode: enquiry id (required) */
  enquiryId?: number | null;
  /** Prospect mode: optional workspace passcode (auto-resolved server-side if blank) */
  passcode?: string | null;
  /** Prospect mode: optional contact display name — used for filename */
  contactName?: string | null;
  date: string;
  durationSec: number;
  chargeableMinutes: number;
  narrative: string;
  actionPoints: string[];
  uploadToNd: boolean;
  recordClioTimeEntry: boolean;
}

export interface AttendanceNoteBoxProps {
  isDarkMode: boolean;
  userInitials: string;
  variant?: 'modal' | 'embedded';
  /** Recording / call id used as todo matter_ref = 'call:<id>'. Empty string for standalone notes. */
  recordingId: string;
  /** Call date (ISO). */
  callDate: string;
  /** Duration in seconds — used to default chargeable minutes. */
  durationSec: number;
  /** When true, this is a blank/standalone draft (no call selected). */
  isBlankDraft?: boolean;
  /** Initial target. Defaults to 'matter' — we never auto-infer prospect. */
  initialTarget?: AttendanceNoteTarget;
  /** When true, the date field is editable (used for blank/manual drafts). */
  dateEditable?: boolean;
  /** Pre-filled summary from the generated note (first 500 chars shown). */
  generatedSummary: string;
  /** Full attendance note body — used as fallback narrative if summary is thin. */
  generatedBody: string;
  /** Action items from the generated note. */
  actionItems: string[];
  /** Transcript text for the side pane (plain-text joined). */
  transcriptText: string;
  /** Prefill matter from the resolved matter chain, if any. */
  prefillMatter?: { displayNumber: string; clientName?: string; description?: string } | null;
  /** Preloaded matters for instant local lookup. Falls back to live lookup when omitted. */
  matterOptions?: MatterLookupOption[];
  /** Optional list of the user's recent matters surfaced in the matter picker dropdown. */
  recentMatters?: MatterLookupOption[];
  /** Optional list of the user's recent enquiries surfaced in the prospect picker dropdown. */
  recentEnquiries?: ProspectLookupOption[];
  /** Save leg statuses surfaced by the host. */
  saveLegs?: AttendanceNoteBoxSaveLegStatus[];
  /** True while any leg is running. */
  saving?: boolean;
  /** Fee earner hourly rate (£). When provided, the Clio time toggle copy shows the £ value instead of the unit hint. */
  hourlyRate?: number | null;
  /** When provided, the empty narrative renders a clickable CTA that triggers note generation. */
  onGenerateNote?: () => void;
  /** True while the host is generating an attendance note. Locks the form and animates the note icon. */
  generating?: boolean;
  onClose: () => void;
  onSave: (payload: AttendanceNoteBoxPayload) => void;
}

// Clio time-entry quantities are native 6-minute units (0.1 hr). Round up
// because a call that runs 6m01s costs the client 12 minutes, not 6.
const SIX_MIN = 6;
function defaultChargeableMinutes(durationSec: number): number {
  const mins = Math.ceil(Math.max(durationSec, 0) / 60);
  if (mins <= 0) return SIX_MIN;
  const remainder = mins % SIX_MIN;
  return remainder === 0 ? mins : mins + (SIX_MIN - remainder);
}

function formatDuration(sec: number): string {
  if (!sec || sec < 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function normaliseDateForClio(iso: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

const NARRATIVE_LIMIT = 500;

export default function AttendanceNoteBox({
  isDarkMode,
  userInitials,
  variant = 'modal',
  recordingId,
  callDate,
  durationSec,
  isBlankDraft = false,
  initialTarget = 'matter',
  dateEditable = false,
  generatedSummary,
  generatedBody,
  actionItems,
  transcriptText: _transcriptText,
  prefillMatter,
  matterOptions,
  recentMatters,
  recentEnquiries,
  saveLegs = [],
  saving = false,
  hourlyRate = null,
  onGenerateNote,
  generating = false,
  onClose,
  onSave,
}: AttendanceNoteBoxProps) {
  const [target, setTarget] = useState<AttendanceNoteTarget>(initialTarget);
  const [matterTerm, setMatterTerm] = useState<string>(prefillMatter?.displayNumber || '');
  const [matterSelection, setMatterSelection] = useState<MatterLookupOption | null>(
    prefillMatter
      ? { key: prefillMatter.displayNumber, displayNumber: prefillMatter.displayNumber, clientName: prefillMatter.clientName, description: prefillMatter.description }
      : null,
  );
  const [enquiryIdInput, setEnquiryIdInput] = useState<string>('');
  const [passcodeInput, setPasscodeInput] = useState<string>('');
  const [contactNameInput, setContactNameInput] = useState<string>('');
  const [prospectTerm, setProspectTerm] = useState<string>('');
  const [prospectSelection, setProspectSelection] = useState<ProspectLookupOption | null>(null);
  const [narrative, setNarrative] = useState<string>((generatedSummary || generatedBody || '').slice(0, NARRATIVE_LIMIT));
  // When no call is selected, start with no units — the user hasn't picked a
  // duration to base them on. Once a call is selected the effect below fills
  // in the rounded-up 6-min default.
  const [chargeableMinutes, setChargeableMinutes] = useState<number>(() => (isBlankDraft && !prefillMatter) ? 0 : defaultChargeableMinutes(durationSec));
  const [chargeable, setChargeable] = useState<boolean>(true);
  const [checkedActionPoints, setCheckedActionPoints] = useState<boolean[]>(() => (actionItems || []).map(() => true));
  const [uploadToNd, setUploadToNd] = useState<boolean>(true);
  // Explicit fee-earner confirmation that a Clio time entry should be created
  // for this matter filing. Defaults to on whenever the call is chargeable; the
  // toggle lets the user veto the time entry without flipping the chargeable
  // gate (which also clears the units field).
  const [recordClioTime, setRecordClioTime] = useState<boolean>(true);
  const [matterPromptNudge, setMatterPromptNudge] = useState<boolean>(false);
  const [clioPromptNudge, setClioPromptNudge] = useState<boolean>(false);
  const [manualNarrative, setManualNarrative] = useState<boolean>(false);
  const narrativeTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [dateValue, setDateValue] = useState<string>(() => normaliseDateForClio(callDate || new Date().toISOString()));

  // Re-prefill if the host swaps call.
  useEffect(() => {
    setNarrative((generatedSummary || generatedBody || '').slice(0, NARRATIVE_LIMIT));
  }, [recordingId, generatedSummary, generatedBody]);
  useEffect(() => {
    // Blank/manual draft without a prefilled matter → leave units at 0 until
    // the user picks a chargeable duration. Once a call is selected
    // (durationSec > 0) we seed the rounded-up 6-min default.
    if (isBlankDraft && !prefillMatter && !durationSec) {
      setChargeableMinutes(0);
      return;
    }
    setChargeableMinutes(defaultChargeableMinutes(durationSec));
  }, [recordingId, durationSec, isBlankDraft, prefillMatter]);
  useEffect(() => {
    setCheckedActionPoints((actionItems || []).map(() => true));
  }, [recordingId, actionItems]);
  useEffect(() => {
    if (prefillMatter) {
      setMatterTerm(prefillMatter.displayNumber || '');
      setMatterSelection({
        key: prefillMatter.displayNumber,
        displayNumber: prefillMatter.displayNumber,
        clientName: prefillMatter.clientName,
        description: prefillMatter.description,
      });
      return;
    }
    setMatterTerm('');
    setMatterSelection(null);
  }, [recordingId, prefillMatter]);
  useEffect(() => {
    setUploadToNd(true);
    setRecordClioTime(true);
    setChargeable(true);
    setDateValue(normaliseDateForClio(callDate || new Date().toISOString()));
  }, [recordingId, callDate]);
  // Reset target when the host swaps draft context.
  useEffect(() => {
    setTarget(initialTarget);
    setEnquiryIdInput('');
    setPasscodeInput('');
    setContactNameInput('');
    setProspectTerm('');
    setProspectSelection(null);
  }, [recordingId, initialTarget]);

  const accent = isDarkMode ? colours.accent : colours.highlight;
  const panelBg = isDarkMode ? withAlpha(colours.dark.cardBackground, 0.98) : '#ffffff';
  const panelBorder = isDarkMode ? withAlpha(colours.dark.borderColor, 0.55) : withAlpha(colours.darkBlue, 0.15);
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const labelText = isDarkMode ? colours.dark.text : colours.light.text;
  const inputBg = isDarkMode ? colours.dark.sectionBackground : '#ffffff';
  const mutedInputBg = isDarkMode ? withAlpha(colours.dark.sectionBackground, 0.68) : colours.grey;
  const inputBorder = isDarkMode ? withAlpha(colours.dark.text, 0.14) : withAlpha(colours.darkBlue, 0.22);
  const tabRailBg = isDarkMode ? withAlpha(colours.dark.sectionBackground, 0.75) : '#ffffff';
  // Accent-fill active tab styling, mirroring the Mine/Everyone toggle in the
  // Home To Do panel: solid accent (dark) / highlight (light) background with
  // contrasting text on the active option, so the toggle visibly dictates the
  // form rather than reading as a passive segmented chip.
  const activeTabBg = isDarkMode ? colours.accent : colours.highlight;
  const activeTabText = isDarkMode ? colours.dark.background : '#ffffff';
  const headerBg = isDarkMode ? withAlpha(colours.helixBlue, 0.55) : colours.grey;
  const footerBg = isDarkMode ? withAlpha(colours.helixBlue, 0.35) : colours.grey;
  const isEmbedded = variant === 'embedded';

  const parsedEnquiryId = useMemo(() => {
    if (prospectSelection?.id && prospectSelection.id > 0) return prospectSelection.id;
    const n = Number.parseInt(enquiryIdInput.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [prospectSelection, enquiryIdInput]);

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!narrative.trim()) return false;
    if (target === 'matter') {
      if (!matterSelection || !matterSelection.displayNumber) return false;
      // Only demand units when the user is actually recording chargeable time.
      if (chargeable && chargeableMinutes <= 0) return false;
      return true;
    }
    // prospect
    if (!parsedEnquiryId) return false;
    return true;
  }, [saving, target, matterSelection, narrative, chargeable, chargeableMinutes, parsedEnquiryId]);

  const handleSave = () => {
    if (!canSave) return;
    if (target === 'matter' && !matterSelection) return;
    onSave({
      recordingId,
      target,
      matterDisplayNumber: target === 'matter' ? (matterSelection?.displayNumber || '') : '',
      matterClientName: target === 'matter' ? (matterSelection?.clientName || '') : '',
      enquiryId: target === 'prospect' ? parsedEnquiryId : null,
      passcode: target === 'prospect' ? (passcodeInput.trim() || null) : null,
      contactName: target === 'prospect'
        ? (contactNameInput.trim()
          || (prospectSelection ? `${prospectSelection.firstName} ${prospectSelection.lastName}`.trim() || null : null))
        : null,
      date: dateValue || normaliseDateForClio(callDate || new Date().toISOString()),
      durationSec,
      chargeableMinutes: target === 'matter' && chargeable ? chargeableMinutes : 0,
      narrative: narrative.trim(),
      actionPoints: (actionItems || []).filter((_, i) => checkedActionPoints[i]),
      uploadToNd: target === 'matter' ? uploadToNd : false,
      // Clio time entry leg requires BOTH chargeable units and the explicit
      // fee-earner confirmation toggle being on.
      recordClioTimeEntry: target === 'matter' && chargeable && chargeableMinutes > 0 && recordClioTime,
    });
  };

  // Submission entry point — if the only thing standing in the way is a
  // missing matter selection, nudge the destinations strip + matter input
  // instead of silently doing nothing.
  const requestSave = () => {
    if (saving) return;
    if (target === 'matter' && (!matterSelection || !matterSelection.displayNumber)) {
      setMatterPromptNudge(false);
      // restart animation by toggling
      requestAnimationFrame(() => setMatterPromptNudge(true));
      window.setTimeout(() => setMatterPromptNudge(false), 420);
      return;
    }
    // If the only blocker is missing chargeable units while the user has
    // explicitly opted in to recording Clio time, nudge the destinations strip
    // so they can either add units or flip the toggle off.
    if (
      target === 'matter'
      && narrative.trim()
      && matterSelection?.displayNumber
      && chargeable
      && recordClioTime
      && chargeableMinutes <= 0
    ) {
      setClioPromptNudge(false);
      requestAnimationFrame(() => setClioPromptNudge(true));
      window.setTimeout(() => setClioPromptNudge(false), 420);
      return;
    }
    handleSave();
  };

  const adjustChargeable = (deltaUnits: number) => {
    setChargeableMinutes(prev => Math.max(SIX_MIN, prev + (deltaUnits * SIX_MIN)));
  };

  // Compact Helix pill switch — replaces inline checkbox+On/Off across the form.
  const renderPillToggle = (on: boolean, onChange: (next: boolean) => void, ariaLabel: string) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={() => { if (!saving) onChange(!on); }}
      disabled={saving}
      className="atb-pill"
      style={{
        width: 32,
        height: 16,
        borderRadius: 999,
        border: `1px solid ${on ? colours.highlight : inputBorder}`,
        background: on
          ? colours.highlight
          : (isDarkMode ? withAlpha(colours.dark.sectionBackground, 0.7) : '#e5e7eb'),
        position: 'relative',
        cursor: saving ? 'not-allowed' : 'pointer',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 1,
          left: on ? 17 : 1,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: '#ffffff',
          transition: 'left 140ms ease',
          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
        }}
      />
    </button>
  );

  const legIcon = (status: AttendanceNoteBoxSaveLegStatus['status']) => {
    if (status === 'success') return <FiCheck size={11} style={{ color: colours.green }} />;
    if (status === 'failed') return <FiAlertCircle size={11} style={{ color: colours.cta }} />;
    if (status === 'running') return <span style={{ display: 'inline-block', width: 11, height: 11, borderRadius: '50%', border: `1.5px solid ${accent}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />;
    if (status === 'skipped') return <span style={{ color: muted, fontSize: 10 }}>—</span>;
    return <span style={{ color: muted, fontSize: 10 }}>·</span>;
  };

  const legLabel = (leg: AttendanceNoteBoxSaveLegStatus['leg']) => {
    switch (leg) {
      case 'save-note': return 'Saved to journey';
      case 'upload-nd': return 'Uploaded to NetDocuments';
      case 'clio-time-entry': return 'Clio time entry';
      case 'todo-reconcile': return 'Todo reconciled';
    }
  };

  const content = (
    <div
      data-helix-region={isEmbedded ? 'home/calls-and-notes/workspace' : 'modal/attendance-note-box'}
      className="atb-root"
      onClick={isEmbedded ? undefined : (e) => e.stopPropagation()}
      style={{
        display: 'grid',
        gridTemplateColumns: isEmbedded ? 'minmax(0, 1fr)' : 'minmax(440px, 620px)',
        gap: 0,
        background: 'transparent',
        margin: isEmbedded ? 0 : 'auto',
        maxHeight: isEmbedded ? '100%' : '92%',
        minHeight: 0,
        width: '100%',
        boxShadow: isEmbedded ? 'none' : '0 8px 32px rgba(0,0,0,0.45)',
        transition: 'grid-template-columns 220ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <style>{`
        @keyframes atbFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes atbPulse { 0%, 100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 1; transform: scale(1.12); } }
        @keyframes atbBreathe { 0%, 100% { transform: scale(1); opacity: 0.78; } 50% { transform: scale(1.06); opacity: 1; } }
        @keyframes atbHalo { 0% { transform: scale(0.9); opacity: 0.55; } 80%, 100% { transform: scale(1.6); opacity: 0; } }
        @keyframes atbShimmer { 0% { background-position: -160% 0; } 100% { background-position: 260% 0; } }
        @keyframes atbDots { 0%, 20% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes atbCheckPop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes atbSpin { to { transform: rotate(360deg); } }
        @keyframes atbCaptionIn { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes atbNudge { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-3px); } 40% { transform: translateX(3px); } 60% { transform: translateX(-2px); } 80% { transform: translateX(2px); } }
        .atb-root .atb-nudge { animation: atbNudge 360ms cubic-bezier(0.36, 0.07, 0.19, 0.97); }
        .atb-root .atb-dest-caption { display: inline-block; }
        .atb-root .atb-dest-caption-token { display: inline-block; animation: atbCaptionIn 260ms cubic-bezier(0.22, 1, 0.36, 1) both; transition: color 200ms ease; }
        .atb-root .atb-section { animation: atbFadeUp 320ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .atb-root .atb-input,
        .atb-root .atb-textarea {
          transition: border-color 160ms ease, box-shadow 200ms ease, background-color 160ms ease;
        }
        .atb-root .atb-input:focus,
        .atb-root .atb-textarea:focus {
          border-color: ${accent} !important;
          box-shadow: 0 0 0 3px ${withAlpha(accent, isDarkMode ? 0.25 : 0.18)}, 0 1px 0 ${withAlpha(accent, 0.35)} inset;
        }
        .atb-root .atb-pill { transition: transform 90ms ease, background 140ms ease, border-color 140ms ease, box-shadow 200ms ease; }
        .atb-root .atb-pill:hover:not(:disabled) { box-shadow: 0 0 0 4px ${withAlpha(colours.highlight, 0.12)}; }
        .atb-root .atb-pill:active:not(:disabled) { transform: scale(0.94); }
        .atb-root .atb-sparkle { display: inline-flex; align-items: center; justify-content: center; color: ${accent}; }
        .atb-root .atb-empty-cta {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 118px;
          padding: 10px 12px;
          background: ${inputBg};
          border: 1px solid ${inputBorder};
          color: ${muted};
          cursor: pointer;
          font-family: 'Raleway', sans-serif;
          transition: border-color 180ms ease, background 180ms ease, box-shadow 200ms ease;
        }
        .atb-root .atb-empty-cta:hover:not(:disabled),
        .atb-root .atb-empty-cta:focus-visible:not(:disabled) {
          border-color: ${accent};
          box-shadow: 0 0 0 3px ${withAlpha(accent, isDarkMode ? 0.18 : 0.12)}, 0 1px 0 ${withAlpha(accent, 0.35)} inset;
          outline: none;
        }
        .atb-root .atb-empty-cta:disabled { cursor: not-allowed; }
        .atb-root .atb-empty-cta-stack { display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .atb-root .atb-empty-manual {
          background: transparent;
          border: none;
          padding: 4px 8px;
          font-family: 'Raleway', sans-serif;
          font-size: 11px;
          color: ${muted};
          cursor: pointer;
          letter-spacing: 0.02em;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: color 160ms ease;
        }
        .atb-root .atb-empty-manual:hover:not(:disabled),
        .atb-root .atb-empty-manual:focus-visible:not(:disabled) {
          color: ${accent};
          outline: none;
          text-decoration: underline;
        }
        .atb-root .atb-empty-manual:disabled { cursor: not-allowed; opacity: 0.6; }
        .atb-root .atb-date-cell {
          height: 38px;
          display: flex;
          align-items: center;
          box-sizing: border-box;
        }
        .atb-root input[type="date"].atb-input { height: 38px; box-sizing: border-box; line-height: 1; }
        .atb-root input[type="date"].atb-input::-webkit-datetime-edit { padding: 0; line-height: 1; }
        .atb-root .atb-empty-icon { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; color: ${accent}; opacity: 0.7; transition: opacity 180ms ease; }
        .atb-root .atb-empty-cta:hover:not(:disabled) .atb-empty-icon { opacity: 1; }
        .atb-root .atb-empty-cta.is-generating { cursor: progress; border-color: ${withAlpha(accent, isDarkMode ? 0.45 : 0.4)}; }
        .atb-root .atb-empty-cta.is-generating .atb-empty-icon { opacity: 1; }
        .atb-root .atb-empty-cta.is-generating .atb-empty-icon::before {
          content: '';
          position: absolute; inset: -4px;
          border-radius: 50%;
          background: ${withAlpha(accent, isDarkMode ? 0.18 : 0.14)};
          animation: atbHalo 1.8s ease-out infinite;
          pointer-events: none;
        }
        .atb-root .atb-locked { opacity: 0.55; pointer-events: none; filter: saturate(0.85); transition: opacity 200ms ease, filter 200ms ease; }
        .atb-root .atb-form-scroll[data-generating="true"] .atb-section:not([data-narrative-section]) { opacity: 0.45; pointer-events: none; filter: saturate(0.8); transition: opacity 220ms ease, filter 220ms ease; }
        .atb-root .atb-save {
          position: relative;
          overflow: hidden;
          transition: transform 140ms ease, box-shadow 200ms ease, filter 160ms ease;
        }
        .atb-root .atb-save.is-ready {
          background: linear-gradient(135deg, ${colours.highlight} 0%, ${withAlpha(colours.highlight, 0.85)} 50%, ${accent} 120%) !important;
          box-shadow: 0 4px 14px ${withAlpha(colours.highlight, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.18);
        }
        .atb-root .atb-save.is-ready:hover { transform: translateY(-1px); box-shadow: 0 6px 20px ${withAlpha(colours.highlight, 0.45)}, inset 0 1px 0 rgba(255,255,255,0.22); filter: brightness(1.04); }
        .atb-root .atb-save.is-ready:active { transform: translateY(0); }
        .atb-root .atb-save.is-ready::after {
          content: '';
          position: absolute; top: 0; left: 0; height: 100%; width: 60%;
          background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.22) 50%, transparent 100%);
          background-size: 220% 100%;
          animation: atbShimmer 2.6s ease-in-out infinite;
          pointer-events: none;
        }
        .atb-root .atb-dots span { animation: atbDots 1.2s infinite; display: inline-block; }
        .atb-root .atb-dots span:nth-child(2) { animation-delay: 0.2s; }
        .atb-root .atb-dots span:nth-child(3) { animation-delay: 0.4s; }
        .atb-root .atb-check-box {
          width: 14px; height: 14px; border: 1.5px solid ${inputBorder}; background: ${inputBg};
          display: inline-flex; align-items: center; justify-content: center;
          margin-top: 2px; flex-shrink: 0; cursor: pointer;
          transition: border-color 140ms ease, background 140ms ease, box-shadow 180ms ease;
        }
        .atb-root .atb-check-box.is-on { border-color: ${colours.green}; background: ${withAlpha(colours.green, 0.18)}; box-shadow: 0 0 0 3px ${withAlpha(colours.green, 0.12)}; }
        .atb-root .atb-check-box svg { animation: atbCheckPop 220ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .atb-root .atb-tab { transition: background 140ms ease, color 140ms ease, box-shadow 200ms ease; position: relative; }
      `}</style>
      <div style={{ background: isEmbedded ? 'transparent' : panelBg, border: isEmbedded ? 'none' : `1px solid ${panelBorder}`, display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: isEmbedded ? '100%' : '92vh', overflow: 'hidden' }}>
        {!isEmbedded && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${panelBorder}`, background: headerBg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FiFileText size={14} style={{ color: accent }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: labelText, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Add attendance note to file
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              disabled={saving}
              style={{ background: 'transparent', border: 'none', color: muted, cursor: saving ? 'not-allowed' : 'pointer', padding: 4 }}
            >
              <FiX size={16} />
            </button>
          </div>
        )}

        <div className="atb-form-scroll" data-generating={generating ? 'true' : 'false'} style={{ overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
            {/* Target toggle — dictates the rest of the form */}
            <div className="atb-section" style={{ animationDelay: '20ms' }}>
              <div
                role="tablist"
                aria-label="File to"
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: `1px solid ${inputBorder}`, background: tabRailBg, borderRadius: 0, marginBottom: 8 }}
              >
                {(['matter', 'prospect'] as const).map((opt) => {
                  const active = target === opt;
                  return (
                    <button
                      key={opt}
                      role="tab"
                      aria-selected={active}
                      type="button"
                      onClick={() => setTarget(opt)}
                      disabled={saving}
                      className={`atb-tab${active ? ' is-active' : ''}`}
                      style={{
                        padding: '10px 12px',
                        fontSize: 11,
                        fontFamily: 'Raleway, sans-serif',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        border: 'none',
                        background: active ? activeTabBg : 'transparent',
                        color: active ? activeTabText : muted,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        borderRadius: 0,
                      }}
                    >
                      {opt === 'matter' ? 'File to a Matter' : 'File to a Prospect'}
                    </button>
                  );
                })}
              </div>
              {target === 'matter' ? (
                <>
                  <MatterLookup
                    value={matterTerm}
                    onChange={setMatterTerm}
                    onSelect={(opt) => { setMatterSelection(opt); setMatterTerm(opt.displayNumber); }}
                    matters={matterOptions}
                    recents={recentMatters}
                    isDarkMode={isDarkMode}
                    placeholder="Type matter number or client name…"
                    inputStyle={{ fontSize: 13, padding: '9px 12px', background: inputBg, border: `1px solid ${inputBorder}`, color: text }}
                  />
                  {matterSelection?.clientName && (
                    <div style={{ marginTop: 4, fontSize: 11, color: muted }}>
                      Selected: <span style={{ color: bodyText }}>{matterSelection.displayNumber}</span> · {matterSelection.clientName}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <ProspectLookup
                    value={prospectTerm}
                    onChange={(term) => {
                      setProspectTerm(term);
                      // User is retyping — drop any stale selection.
                      if (prospectSelection && term !== `${prospectSelection.firstName} ${prospectSelection.lastName}`.trim()) {
                        setProspectSelection(null);
                      }
                    }}
                    onSelect={(opt) => {
                      setProspectSelection(opt);
                      setEnquiryIdInput(String(opt.id));
                      setContactNameInput(`${opt.firstName} ${opt.lastName}`.trim());
                    }}
                    isDarkMode={isDarkMode}
                    disabled={saving}
                    placeholder="Search prospect by name, email or phone…"
                    inputStyle={{ fontSize: 13, padding: '9px 12px', background: inputBg, border: `1px solid ${inputBorder}`, color: text }}
                    recents={recentEnquiries}
                  />
                  {prospectSelection && (
                    <div style={{ fontSize: 11, color: muted, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>Selected:</span>
                      <span style={{ color: bodyText, fontWeight: 600 }}>
                        {`${prospectSelection.firstName} ${prospectSelection.lastName}`.trim() || `#${prospectSelection.id}`}
                      </span>
                      <span>· #{prospectSelection.id}</span>
                      {prospectSelection.source === 'legacy' && (
                        <span
                          title="From legacy enquiries database"
                          style={{
                            fontSize: 8,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            padding: '2px 6px',
                            border: `1px solid ${muted}`,
                            color: muted,
                            borderRadius: 0,
                          }}
                        >
                          Legacy
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Row: type + date */}
            <div className="atb-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, animationDelay: '60ms' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText, marginBottom: 6 }}>Document type</div>
                <div className="atb-date-cell" style={{ padding: '0 12px', background: mutedInputBg, border: `1px solid ${inputBorder}`, fontSize: 12, color: bodyText }}>
                  Attendance Note – Telephone Call
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText, marginBottom: 6 }}>Date</div>
                {dateEditable ? (
                  <div style={{ position: 'relative' }}>
                    <FiCalendar size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: muted, pointerEvents: 'none', zIndex: 1 }} />
                    <input
                      type="date"
                      value={dateValue}
                      onChange={(e) => setDateValue(e.target.value)}
                      disabled={saving}
                      className="atb-input"
                      style={{
                        width: '100%',
                        padding: '0 12px 0 28px',
                        background: inputBg,
                        border: `1px solid ${inputBorder}`,
                        color: text,
                        fontSize: 12,
                        fontFamily: 'Raleway, sans-serif',
                        borderRadius: 0,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                ) : (
                  <div className="atb-date-cell" style={{ padding: '0 12px', background: mutedInputBg, border: `1px solid ${inputBorder}`, fontSize: 12, color: bodyText }}>
                    {formatDate(callDate)}
                  </div>
                )}
              </div>
            </div>

            {/* Row: duration + chargeable (chargeable hidden for prospect) */}
            <div className="atb-section" style={{ display: 'grid', gridTemplateColumns: target === 'matter' ? '1fr 1fr' : '1fr', gap: 10, alignItems: 'start', animationDelay: '100ms' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText, marginBottom: 6, height: 16, display: 'flex', alignItems: 'center' }}>Call duration</div>
                <div style={{ padding: '9px 12px', background: mutedInputBg, border: `1px solid ${inputBorder}`, fontSize: 12, color: bodyText }}>
                  <FiClock size={11} style={{ marginRight: 6, verticalAlign: 'middle', color: muted }} />
                  {formatDuration(durationSec)}
                </div>
              </div>
              {target === 'matter' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8, height: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText }}>Chargeable</div>
                    {renderPillToggle(chargeable, setChargeable, 'Toggle chargeable time')}
                  </div>
                  {chargeable ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => adjustChargeable(-1)} disabled={chargeableMinutes <= SIX_MIN || saving}
                        style={{ padding: '0 12px', background: inputBg, border: `1px solid ${inputBorder}`, color: text, cursor: chargeableMinutes <= SIX_MIN ? 'not-allowed' : 'pointer', borderRadius: 0 }}>−</button>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', background: inputBg, border: `1px solid ${inputBorder}` }}>
                        <input
                          type="number"
                          className="atb-input"
                          min={0}
                          step={1}
                          value={chargeableMinutes > 0 ? chargeableMinutes / SIX_MIN : ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') { setChargeableMinutes(0); return; }
                            const n = Number.parseInt(raw, 10);
                            if (!Number.isFinite(n) || n < 0) return;
                            setChargeableMinutes(n * SIX_MIN);
                          }}
                          onBlur={(e) => {
                            const n = Number.parseInt(e.target.value || '0', 10);
                            const safe = Number.isFinite(n) && n > 0 ? n : 0;
                            setChargeableMinutes(safe * SIX_MIN);
                          }}
                          disabled={saving}
                          aria-label="Chargeable units (6 min each)"
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            background: 'transparent',
                            border: 'none',
                            color: text,
                            fontSize: 12,
                            fontFamily: 'Raleway, sans-serif',
                            fontWeight: 600,
                            textAlign: 'center',
                            fontVariantNumeric: 'tabular-nums',
                            outline: 'none',
                            borderRadius: 0,
                            MozAppearance: 'textfield',
                          }}
                        />
                        <span style={{ display: 'flex', alignItems: 'center', paddingRight: 10, color: muted, fontSize: 11, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {chargeableMinutes > 0 ? `units · ${chargeableMinutes} min` : 'units'}
                        </span>
                      </div>
                      <button type="button" onClick={() => adjustChargeable(1)} disabled={saving}
                        style={{ padding: '0 12px', background: inputBg, border: `1px solid ${inputBorder}`, color: text, cursor: 'pointer', borderRadius: 0 }}>+</button>
                    </div>
                  ) : (
                    <div style={{ padding: '9px 12px', background: mutedInputBg, border: `1px solid ${inputBorder}`, fontSize: 11, color: muted, fontStyle: 'italic' }}>
                      Non-chargeable — no Clio time entry will be recorded.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Narrative */}
            <div className="atb-section" data-narrative-section="true" style={{ animationDelay: '140ms' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText }}>
                  <FiFileText size={12} aria-hidden style={{ color: generating ? accent : muted }} />
                  Telephone Note
                </div>
                {(() => {
                  const ratio = narrative.length / NARRATIVE_LIMIT;
                  const counterColour = ratio >= 0.95 ? colours.cta : ratio >= 0.8 ? colours.orange : muted;
                  return (
                    <div style={{ fontSize: 10, color: counterColour, fontVariantNumeric: 'tabular-nums', fontWeight: ratio >= 0.8 ? 700 : 500, transition: 'color 160ms ease' }}>
                      {narrative.length}/{NARRATIVE_LIMIT}
                    </div>
                  );
                })()}
              </div>
              {generating || (!narrative && !manualNarrative && onGenerateNote) ? (
                <button
                  type="button"
                  onClick={() => { if (!generating && onGenerateNote) onGenerateNote(); }}
                  disabled={generating || !onGenerateNote}
                  aria-label={generating ? 'Generating attendance note' : 'Generate attendance note from transcript'}
                  className={`atb-empty-cta${generating ? ' is-generating' : ''}`}
                >
                  <span className="atb-empty-cta-stack">
                    <span className="atb-empty-icon" aria-hidden><FiFileText size={22} /></span>
                    {!generating && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="atb-empty-manual"
                        aria-label="Write the attendance note manually"
                        onClick={(e) => {
                          e.stopPropagation();
                          setManualNarrative(true);
                          requestAnimationFrame(() => narrativeTextareaRef.current?.focus());
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setManualNarrative(true);
                            requestAnimationFrame(() => narrativeTextareaRef.current?.focus());
                          }
                        }}
                      >
                        <FiEdit3 size={11} aria-hidden />
                        Write note manually
                      </span>
                    )}
                  </span>
                </button>
              ) : (
                <textarea
                  ref={narrativeTextareaRef}
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value.slice(0, NARRATIVE_LIMIT))}
                  rows={5}
                  disabled={saving || generating}
                  className="atb-textarea"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: inputBg,
                    border: `1px solid ${inputBorder}`,
                    color: text,
                    fontSize: 12,
                    lineHeight: 1.45,
                    fontFamily: 'Raleway, sans-serif',
                    resize: 'vertical',
                    outline: 'none',
                    borderRadius: 0,
                  }}
                />
              )}
            </div>

            {/* Action points */}
            {actionItems && actionItems.length > 0 && (
              <div className="atb-section" style={{ animationDelay: '180ms' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText, marginBottom: 6 }}>Action points</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, border: `1px solid ${inputBorder}`, padding: '8px 10px', background: mutedInputBg }}>
                  {actionItems.map((item, i) => {
                    const on = !!checkedActionPoints[i];
                    const toggle = () => {
                      if (saving) return;
                      setCheckedActionPoints(prev => {
                        const next = [...prev];
                        next[i] = !on;
                        return next;
                      });
                    };
                    return (
                      <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 12, color: bodyText, lineHeight: 1.4 }}>
                        <span
                          role="checkbox"
                          aria-checked={on}
                          tabIndex={saving ? -1 : 0}
                          onClick={toggle}
                          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}
                          className={`atb-check-box${on ? ' is-on' : ''}`}
                        >
                          {on && <FiCheck size={10} color={colours.green} strokeWidth={3} />}
                        </span>
                        <span style={{ opacity: on ? 1 : 0.92, transition: 'opacity 160ms ease' }}>{item}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Destinations (matter-mode toggles, prospect-mode info) */}
            {target === 'matter' ? (
              <div className={`atb-section${matterPromptNudge ? ' atb-nudge' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${panelBorder}`, paddingTop: 10, animationDelay: '220ms' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: muted, marginBottom: 2 }}>Destinations</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                    {(() => {
                      const ndIconColour = !uploadToNd
                        ? muted
                        : matterSelection?.displayNumber
                          ? colours.green
                          : colours.orange;
                      return <FiUploadCloud size={13} style={{ color: ndIconColour, marginTop: 2, flexShrink: 0, transition: 'color 200ms ease' }} />;
                    })()}
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 12, color: bodyText, fontWeight: 600 }}>Save to File</span>
                      <span className="atb-dest-caption" style={{ fontSize: 10, color: muted }}>
                        Save &amp; upload note to{' '}
                        <span
                          key={matterSelection?.displayNumber || 'nd'}
                          className="atb-dest-caption-token"
                          style={{
                            color: !uploadToNd
                              ? muted
                              : matterSelection?.displayNumber
                                ? colours.green
                                : colours.orange,
                            fontWeight: matterSelection?.displayNumber ? 700 : 600,
                          }}
                        >
                          {matterSelection?.displayNumber || 'NetDocuments'}
                        </span>
                      </span>
                    </div>
                  </div>
                  {renderPillToggle(uploadToNd, setUploadToNd, 'Toggle Save to File')}
                </div>
                {(() => {
                  // Three-state colour: muted (toggle off / non-chargeable),
                  // amber (opted in but units missing — amber draws the eye to
                  // the missing field), green (everything ready). Mirrors the
                  // NetDocuments amber→green crossfade above so the pattern
                  // reads as a single "finish me" signal.
                  const units = chargeableMinutes > 0 ? Math.round(chargeableMinutes / SIX_MIN) : 0;
                  const amount = (hourlyRate != null && Number.isFinite(hourlyRate) && chargeableMinutes > 0)
                    ? (chargeableMinutes / 60) * (hourlyRate as number)
                    : null;
                  const amountLabel = amount != null
                    ? new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 }).format(amount)
                    : null;
                  const clioToggleOn = chargeable && recordClioTime;
                  const needsUnits = clioToggleOn && chargeableMinutes <= 0;
                  const ready = clioToggleOn && chargeableMinutes > 0;
                  const iconColour = !clioToggleOn
                    ? muted
                    : ready
                      ? colours.green
                      : colours.orange;
                  const captionColour = !clioToggleOn
                    ? muted
                    : ready
                      ? colours.green
                      : colours.orange;
                  const reason = !chargeable
                    ? 'Mark the call chargeable to enable Clio time recording'
                    : !recordClioTime
                      ? 'Toggle on to record a Clio time entry on save'
                      : needsUnits
                        ? 'Add chargeable units to record a Clio time entry'
                        : amountLabel
                          ? `Create a Clio time entry for ${units} unit${units === 1 ? '' : 's'} (${amountLabel})`
                          : `Create a Clio time entry for ${units} unit${units === 1 ? '' : 's'}`;
                  // Crossfade the caption + icon colour as units flip from 0 → set.
                  const captionKey = `${clioToggleOn ? 'on' : 'off'}-${chargeable ? 'c' : 'nc'}-${chargeableMinutes}`;
                  return (
                    <div className={clioPromptNudge ? 'atb-nudge' : undefined} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, opacity: chargeable ? 1 : 0.7 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                        <FiClock
                          key={`clio-icon-${captionKey}`}
                          size={13}
                          className="atb-dest-caption-token"
                          style={{ color: iconColour, marginTop: 2, flexShrink: 0, transition: 'color 200ms ease' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: 12, color: bodyText, fontWeight: 600 }}>Record Clio time entry</span>
                          <span className="atb-dest-caption" style={{ fontSize: 10, color: muted }}>
                            <span
                              key={captionKey}
                              className="atb-dest-caption-token"
                              style={{ color: captionColour, fontWeight: ready ? 700 : needsUnits ? 600 : 500 }}
                            >
                              {reason}
                            </span>
                          </span>
                        </div>
                      </div>
                      {renderPillToggle(clioToggleOn, (next) => { if (chargeable) setRecordClioTime(next); }, 'Toggle Record Clio time entry')}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="atb-section" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${panelBorder}`, paddingTop: 10, animationDelay: '220ms' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: muted, marginBottom: 2 }}>Destinations</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <FiCloud size={13} style={{ color: accent, marginTop: 2, flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: bodyText, fontWeight: 600 }}>Cloud</span>
                    <span style={{ fontSize: 10, color: muted }}>Saved to the prospect doc-workspace under <strong style={{ color: bodyText }}>Telephone Attendance Notes</strong></span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <FiUser size={13} style={{ color: accent, marginTop: 2, flexShrink: 0 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: bodyText, fontWeight: 600 }}>ActiveCampaigns</span>
                    <span style={{ fontSize: 10, color: muted }}>
                      Contact note posted to ActiveCampaign — acid resolved on save
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: muted, fontStyle: 'italic', marginTop: 2 }}>Not billable.</div>
              </div>
            )}

            {/* Save legs status */}
            {saveLegs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: `1px solid ${panelBorder}`, paddingTop: 10, fontSize: 11 }}>
                {saveLegs.map((leg) => (
                  <div key={leg.leg} style={{ display: 'flex', alignItems: 'center', gap: 8, color: leg.status === 'failed' ? colours.cta : bodyText }}>
                    {legIcon(leg.status)}
                    <span>{legLabel(leg.leg)}</span>
                    {leg.message && <span style={{ color: muted, marginLeft: 'auto', fontSize: 10 }}>{leg.message}</span>}
                  </div>
                ))}
              </div>
            )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '10px 16px', borderTop: `1px solid ${panelBorder}`, background: isEmbedded ? 'transparent' : footerBg }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ background: 'transparent', border: `1px solid ${inputBorder}`, color: labelText, padding: '8px 14px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Raleway, sans-serif', borderRadius: 0 }}
            >
              {isEmbedded ? 'Clear' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={requestSave}
              disabled={saving || (!canSave && !(target === 'matter' && narrative.trim() && (!matterSelection || (chargeable && recordClioTime && chargeableMinutes <= 0))))}
              title={
                target === 'matter' && !matterSelection
                  ? 'Pick a matter to file against'
                  : target === 'matter' && chargeable && recordClioTime && chargeableMinutes <= 0
                    ? 'Add chargeable units or toggle Clio recording off'
                    : undefined
              }
              className={`atb-save${canSave && !saving ? ' is-ready' : ''}`}
              style={{
                background: canSave ? colours.highlight : (isDarkMode ? 'rgba(75,85,99,0.4)' : 'rgba(6,23,51,0.12)'),
                border: 'none',
                color: canSave ? '#ffffff' : muted,
                padding: '8px 18px',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: canSave ? 'pointer' : 'not-allowed',
                fontFamily: 'Raleway, sans-serif',
                borderRadius: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {saving ? (
                <>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '1.5px solid currentColor', borderTopColor: 'transparent', animation: 'atbSpin 0.8s linear infinite' }} />
                  Filing<span className="atb-dots" aria-hidden><span>.</span><span>.</span><span>.</span></span>
                </>
              ) : (
                <>{canSave && <FiFileText size={11} aria-hidden />}File note</>
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  );

  if (isEmbedded) {
    return content;
  }

  return (
    <div
      role="dialog"
      aria-label="Add attendance note to file"
      style={{
        position: 'absolute',
        inset: 0,
        background: isDarkMode ? 'rgba(0,3,25,0.6)' : 'rgba(6,23,51,0.18)',
        backdropFilter: 'blur(3px)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        fontFamily: 'Raleway, sans-serif',
      }}
      onClick={onClose}
    >
      {content}
    </div>
  );
}
