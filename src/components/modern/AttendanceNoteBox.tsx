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

import React, { useEffect, useMemo, useState } from 'react';
import { FiFileText, FiUploadCloud, FiClock, FiX, FiChevronRight, FiChevronLeft, FiCheck, FiAlertCircle } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';
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
  /** Save leg statuses surfaced by the host. */
  saveLegs?: AttendanceNoteBoxSaveLegStatus[];
  /** True while any leg is running. */
  saving?: boolean;
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
  generatedSummary,
  generatedBody,
  actionItems,
  transcriptText,
  prefillMatter,
  saveLegs = [],
  saving = false,
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
  const [uploadToNd, setUploadToNd] = useState<boolean>(false);
  const [transcriptOpen, setTranscriptOpen] = useState<boolean>(false);

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
    setUploadToNd(false);
    setChargeable(true);
    setTranscriptOpen(false);
  }, [recordingId]);
  // Reset target when the host swaps draft context.
  useEffect(() => {
    setTarget(initialTarget);
    setEnquiryIdInput('');
    setPasscodeInput('');
    setContactNameInput('');
    setProspectTerm('');
    setProspectSelection(null);
  }, [recordingId, initialTarget]);

  const accent = isDarkMode ? '#87F3F3' : colours.highlight;
  const panelBg = isDarkMode ? 'rgba(8,28,48,0.98)' : '#ffffff';
  const panelBorder = isDarkMode ? 'rgba(75,85,99,0.55)' : 'rgba(6,23,51,0.15)';
  const text = isDarkMode ? '#f3f4f6' : colours.light.text;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';
  const muted = isDarkMode ? '#A0A0A0' : '#6B6B6B';
  const labelText = isDarkMode ? '#f3f4f6' : colours.light.text;
  const inputBg = isDarkMode ? 'rgba(5,21,37,0.9)' : '#ffffff';
  const inputBorder = isDarkMode ? 'rgba(255,255,255,0.14)' : 'rgba(6,23,51,0.22)';
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
      date: normaliseDateForClio(callDate || new Date().toISOString()),
      durationSec,
      chargeableMinutes: target === 'matter' && chargeable ? chargeableMinutes : 0,
      narrative: narrative.trim(),
      actionPoints: (actionItems || []).filter((_, i) => checkedActionPoints[i]),
      uploadToNd: target === 'matter' ? uploadToNd : false,
      // Chargeable checkbox is the single gate for the Clio time entry leg —
      // no separate toggle any more (the time-entry leg was redundant signal).
      recordClioTimeEntry: target === 'matter' && chargeable && chargeableMinutes > 0,
    });
  };

  const adjustChargeable = (deltaUnits: number) => {
    setChargeableMinutes(prev => Math.max(SIX_MIN, prev + (deltaUnits * SIX_MIN)));
  };

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
      onClick={isEmbedded ? undefined : (e) => e.stopPropagation()}
      style={{
        display: 'grid',
        gridTemplateColumns: transcriptOpen
          ? (isEmbedded ? 'minmax(0, 1fr) minmax(260px, 320px)' : 'minmax(440px, 520px) 360px')
          : (isEmbedded ? 'minmax(0, 1fr)' : 'minmax(440px, 620px) 24px'),
        gap: 0,
        background: 'transparent',
        margin: isEmbedded ? 0 : 'auto',
        maxHeight: isEmbedded ? '100%' : '92%',
        minHeight: 0,
        width: '100%',
        boxShadow: isEmbedded ? 'none' : '0 8px 32px rgba(0,0,0,0.45)',
        transition: 'grid-template-columns 180ms ease',
      }}
    >
      <div style={{ background: panelBg, border: `1px solid ${panelBorder}`, display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: isEmbedded ? '100%' : '92vh', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${panelBorder}`, background: isDarkMode ? 'rgba(13,47,96,0.55)' : '#f4f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FiFileText size={14} style={{ color: accent }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: labelText, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {isEmbedded ? 'Call filing workspace' : 'Add attendance note to file'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isEmbedded ? 'Clear selection' : 'Close'}
            disabled={saving}
            style={{ background: 'transparent', border: 'none', color: muted, cursor: saving ? 'not-allowed' : 'pointer', padding: 4 }}
          >
            <FiX size={16} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
            {/* Target toggle + primary picker */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText }}>
                  {target === 'matter' ? 'Matter' : 'Prospect'}
                </div>
                <div
                  role="tablist"
                  aria-label="File to"
                  style={{ display: 'inline-flex', border: `1px solid ${inputBorder}`, background: isDarkMode ? 'rgba(5,21,37,0.6)' : '#ffffff', borderRadius: 0 }}
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
                        style={{
                          padding: '5px 10px',
                          fontSize: 10,
                          fontFamily: 'Raleway, sans-serif',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          border: 'none',
                          background: active ? accent : 'transparent',
                          color: active ? (isDarkMode ? '#061733' : '#ffffff') : muted,
                          cursor: saving ? 'not-allowed' : 'pointer',
                          borderRadius: 0,
                          transition: 'background 140ms ease, color 140ms ease',
                        }}
                      >
                        {opt === 'matter' ? 'Matter' : 'Prospect'}
                      </button>
                    );
                  })}
                </div>
              </div>
              {target === 'matter' ? (
                <>
                  <MatterLookup
                    value={matterTerm}
                    onChange={setMatterTerm}
                    onSelect={(opt) => { setMatterSelection(opt); setMatterTerm(opt.displayNumber); }}
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText, marginBottom: 6 }}>Document type</div>
                <div style={{ padding: '9px 12px', background: isDarkMode ? 'rgba(5,21,37,0.4)' : '#f4f4f6', border: `1px solid ${inputBorder}`, fontSize: 12, color: bodyText }}>
                  Attendance Note – Telephone Call
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText, marginBottom: 6 }}>Date</div>
                <div style={{ padding: '9px 12px', background: isDarkMode ? 'rgba(5,21,37,0.4)' : '#f4f4f6', border: `1px solid ${inputBorder}`, fontSize: 12, color: bodyText }}>
                  {formatDate(callDate)}
                </div>
              </div>
            </div>

            {/* Row: duration + chargeable (chargeable hidden for prospect) */}
            <div style={{ display: 'grid', gridTemplateColumns: target === 'matter' ? '1fr 1fr' : '1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText, marginBottom: 6 }}>Call duration</div>
                <div style={{ padding: '9px 12px', background: isDarkMode ? 'rgba(5,21,37,0.4)' : '#f4f4f6', border: `1px solid ${inputBorder}`, fontSize: 12, color: bodyText }}>
                  <FiClock size={11} style={{ marginRight: 6, verticalAlign: 'middle', color: muted }} />
                  {formatDuration(durationSec)}
                </div>
              </div>
              {target === 'matter' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText }}>Chargeable</div>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 10, color: muted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      <input type="checkbox" checked={chargeable} onChange={(e) => setChargeable(e.target.checked)} disabled={saving} style={{ accentColor: accent }} />
                      <span>{chargeable ? 'On' : 'Off'}</span>
                    </label>
                  </div>
                  {chargeable ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => adjustChargeable(-1)} disabled={chargeableMinutes <= SIX_MIN || saving}
                        style={{ padding: '0 12px', background: isDarkMode ? 'rgba(5,21,37,0.9)' : '#ffffff', border: `1px solid ${inputBorder}`, color: text, cursor: chargeableMinutes <= SIX_MIN ? 'not-allowed' : 'pointer', borderRadius: 0 }}>−</button>
                      <div style={{ flex: 1, padding: '9px 12px', background: inputBg, border: `1px solid ${inputBorder}`, fontSize: 12, color: text, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                        {chargeableMinutes > 0 ? (
                          <>
                            <span style={{ fontWeight: 600 }}>{chargeableMinutes / SIX_MIN} units</span>
                            <span style={{ color: muted, marginLeft: 6 }}>({chargeableMinutes} min)</span>
                          </>
                        ) : (
                          <span style={{ color: muted }}>— units (— min)</span>
                        )}
                      </div>
                      <button type="button" onClick={() => adjustChargeable(1)} disabled={saving}
                        style={{ padding: '0 12px', background: isDarkMode ? 'rgba(5,21,37,0.9)' : '#ffffff', border: `1px solid ${inputBorder}`, color: text, cursor: 'pointer', borderRadius: 0 }}>+</button>
                    </div>
                  ) : (
                    <div style={{ padding: '9px 12px', background: isDarkMode ? 'rgba(5,21,37,0.4)' : '#f4f4f6', border: `1px solid ${inputBorder}`, fontSize: 11, color: muted, fontStyle: 'italic' }}>
                      Non-chargeable — no Clio time entry will be recorded.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Narrative */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText }}>Summary (Clio narrative)</div>
                <div style={{ fontSize: 10, color: muted, fontVariantNumeric: 'tabular-nums' }}>{narrative.length}/{NARRATIVE_LIMIT}</div>
              </div>
              <textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value.slice(0, NARRATIVE_LIMIT))}
                rows={5}
                disabled={saving}
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
            </div>

            {/* Action points */}
            {actionItems && actionItems.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText, marginBottom: 6 }}>Action points</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, border: `1px solid ${inputBorder}`, padding: '8px 10px', background: isDarkMode ? 'rgba(5,21,37,0.5)' : '#fafafa' }}>
                  {actionItems.map((item, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 12, color: bodyText, lineHeight: 1.4 }}>
                      <input
                        type="checkbox"
                        checked={checkedActionPoints[i] || false}
                        onChange={(e) => {
                          setCheckedActionPoints(prev => {
                            const next = [...prev];
                            next[i] = e.target.checked;
                            return next;
                          });
                        }}
                        disabled={saving}
                        style={{ marginTop: 2, accentColor: accent }}
                      />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Toggles (matter-mode) or destination note (prospect-mode) */}
            {target === 'matter' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: `1px solid ${panelBorder}`, paddingTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 12, color: bodyText }}>
                  <input type="checkbox" checked={uploadToNd} onChange={(e) => setUploadToNd(e.target.checked)} disabled={saving} style={{ accentColor: accent }} />
                  <FiUploadCloud size={12} style={{ color: uploadToNd ? colours.green : muted }} />
                  <span>Also attach the .docx to NetDocuments</span>
                </label>
              </div>
            ) : (
              <div style={{ borderTop: `1px solid ${panelBorder}`, paddingTop: 10, fontSize: 11, color: muted, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FiUploadCloud size={12} style={{ color: accent }} />
                <span>Filed to the prospect doc-workspace under <strong style={{ color: bodyText }}>Telephone Attendance Notes</strong>. Not billable.</span>
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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderTop: `1px solid ${panelBorder}`, background: isDarkMode ? 'rgba(13,47,96,0.35)' : '#f4f4f6' }}>
          <button
            type="button"
            onClick={() => setTranscriptOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: `1px solid ${inputBorder}`, color: labelText, padding: '6px 10px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Raleway, sans-serif', borderRadius: 0 }}
          >
            {transcriptOpen ? <FiChevronRight size={11} /> : <FiChevronLeft size={11} />}
            Transcript
          </button>
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
              onClick={handleSave}
              disabled={!canSave}
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
              }}
            >
              {saving ? 'Filing…' : 'File note'}
            </button>
          </div>
        </div>
      </div>

      {transcriptOpen && (
        <div style={{ background: panelBg, borderLeft: 'none', border: `1px solid ${panelBorder}`, borderLeftStyle: 'dashed', display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: isEmbedded ? '100%' : '92vh', overflow: 'hidden' }}>
          <div style={{ padding: '14px 14px', borderBottom: `1px solid ${panelBorder}`, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: labelText, background: isDarkMode ? 'rgba(13,47,96,0.35)' : '#f4f4f6' }}>
            Transcript · brief backing
          </div>
          <div style={{ overflowY: 'auto', padding: '12px 14px', fontSize: 11, lineHeight: 1.5, color: bodyText, whiteSpace: 'pre-wrap', flex: 1 }}>
            {transcriptText && transcriptText.trim().length > 0 ? transcriptText : <span style={{ color: muted }}>No transcript available for this call.</span>}
          </div>
          <div style={{ padding: '8px 14px', borderTop: `1px solid ${panelBorder}`, fontSize: 10, color: muted }}>
            Filed by {userInitials || '—'}
          </div>
        </div>
      )}
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
