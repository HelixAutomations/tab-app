/**
 * OpenAnotherMatterModal
 *
 * Shared modal used by both:
 *   1. InlineWorkbench matter chip → "+ Open another matter" (preset source instruction)
 *   2. Home quick action          → "Open Matter for Existing Client" (no preset)
 *
 * Single page, three sections:
 *   1. Source (collapsed if presetSourceInstructionRef supplied)
 *   2. New case brief (description, area, capacity, optional new deal)
 *   3. Team + risk
 *
 * Submit → POST /api/matters/open-another → poll → progress strip.
 * On Clio token failure: shows "Retry with service account" button.
 *
 * NOTE: localhost gating happens at the call site (workbench / home), not here,
 * so the modal can be unit-tested + reused later when promoted.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import { FaUser, FaBuilding, FaUserTie } from 'react-icons/fa';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';
import '../../forms/forms-tokens.css';
import {
  startOpenAnother,
  pollJob,
  retryWithServiceAccount,
  searchSources,
  type JobState,
  type OpenAnotherMatterPayload,
  type CurrentInstructionHit,
  type LegacyPoidHit,
} from './openAnotherMatterApi';

const AREA_OPTIONS = ['Commercial', 'Property', 'Construction', 'Employment', 'Misc'];
const RISK_OPTIONS = ['Low Risk', 'Medium Risk', 'High Risk'];

type ClientType = 'Individual' | 'Company' | 'Multiple Individuals';

export interface OpenAnotherMatterModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (result: { newInstructionRef?: string; clioMatterId?: string; displayNumber?: string }) => void;
  /** When supplied, the source picker is collapsed to a read-only summary card. */
  presetSourceInstructionRef?: string;
  /** Optional defaults to pre-fill the brief from the source instruction. */
  presetDefaults?: {
    areaOfWork?: string;
    capacity?: ClientType;
    feeEarnerInitials?: string;
  };
  currentUserInitials?: string;
}

const OpenAnotherMatterModal: React.FC<OpenAnotherMatterModalProps> = ({
  open,
  onClose,
  onSuccess,
  presetSourceInstructionRef,
  presetDefaults,
  currentUserInitials,
}) => {
  const { isDarkMode } = useTheme();

  // ── source picker state ──────────────────────────────────────────────
  // Search-first. Empty + focused → recent current instructions tray.
  // Typing → searches Instructions only. Zero hits → inline "Search legacy"
  // affordance fires a second query against the legacy poid table.
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceFocused, setSourceFocused] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceErr, setSourceErr] = useState<string | null>(null);
  const [currentHits, setCurrentHits] = useState<CurrentInstructionHit[]>([]);
  const [legacyHits, setLegacyHits] = useState<LegacyPoidHit[]>([]);
  const [legacySearched, setLegacySearched] = useState(false);
  const [pickedInstruction, setPickedInstruction] = useState<CurrentInstructionHit | null>(null);
  const [pickedLegacy, setPickedLegacy] = useState<LegacyPoidHit | null>(null);

  // Reset picker when preset changes / modal opens
  useEffect(() => {
    if (!open) return;
    if (presetSourceInstructionRef) {
      setPickedInstruction({ InstructionRef: presetSourceInstructionRef } as CurrentInstructionHit);
      setPickedLegacy(null);
    } else {
      setPickedInstruction(null);
      setPickedLegacy(null);
      setSourceQuery('');
      setCurrentHits([]);
      setLegacyHits([]);
      setLegacySearched(false);
    }
  }, [open, presetSourceInstructionRef]);

  // Debounced current-instruction search. Quiet on focus; only fires when
  // the user has typed 2+ characters — no surprise list pops in.
  useEffect(() => {
    if (!open || presetSourceInstructionRef || pickedInstruction || pickedLegacy) return;
    const q = sourceQuery.trim();
    if (q.length < 2) {
      setCurrentHits([]); setLegacyHits([]); setLegacySearched(false); setSourceErr(null);
      return;
    }
    let cancelled = false;
    setSourceLoading(true);
    setSourceErr(null);
    setLegacyHits([]);
    setLegacySearched(false);
    const t = setTimeout(async () => {
      try {
        const r = await searchSources(q, 'current');
        if (cancelled) return;
        setCurrentHits(r.instructions || []);
      } catch (err) {
        if (cancelled) return;
        setSourceErr(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setSourceLoading(false);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [sourceQuery, open, presetSourceInstructionRef, pickedInstruction, pickedLegacy]);

  async function searchLegacy() {
    const q = sourceQuery.trim();
    if (q.length < 2) return;
    setSourceLoading(true);
    setSourceErr(null);
    try {
      const r = await searchSources(q, 'legacy');
      setLegacyHits(r.legacyPoids || []);
      setLegacySearched(true);
    } catch (err) {
      setSourceErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSourceLoading(false);
    }
  }

  // ── form state ─────────────────────────────────────────────────────────────────────────
  const [serviceDescription, setServiceDescription] = useState('');
  const [areaOfWork, setAreaOfWork] = useState(presetDefaults?.areaOfWork || '');
  const [typeOfWork, setTypeOfWork] = useState('');
  const [capacity, setCapacity] = useState<ClientType | null>(presetDefaults?.capacity ?? null);
  const [companyName, setCompanyName] = useState('');
  const [companyNumber, setCompanyNumber] = useState('');

  const [captureDeal, setCaptureDeal] = useState(false);
  const [dealAmount, setDealAmount] = useState<string>('0');
  const [cfa, setCfa] = useState(true);
  const [moneyOnAccount, setMoneyOnAccount] = useState(false);

  const [feeEarner, setFeeEarner] = useState(presetDefaults?.feeEarnerInitials || currentUserInitials || '');
  const [originating, setOriginating] = useState(presetDefaults?.feeEarnerInitials || currentUserInitials || '');
  const [supervising, setSupervising] = useState('');

  const [riskResult, setRiskResult] = useState<typeof RISK_OPTIONS[number]>('Low Risk');
  const [riskNotes, setRiskNotes] = useState('');

  // ── job state ───────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!open) {
      // Reset on close
      cancelledRef.current = false;
      setJob(null);
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => () => { cancelledRef.current = true; }, []);

  if (!open) return null;

  // ── derived ───────────────────────────────────────────────────────────────────────────────
  const isPreset = Boolean(presetSourceInstructionRef);
  const sourcePicked = Boolean(pickedInstruction || pickedLegacy);
  const legacyGaps = pickedLegacy?._gaps || [];
  const formValid =
    !!capacity &&
    sourcePicked &&
    !!serviceDescription.trim() &&
    !!areaOfWork &&
    !!feeEarner &&
    !!originating &&
    (!captureDeal || (cfa || Number(dealAmount) >= 0));

  // ── handlers ──────────────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!formValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setJob(null);

    const payload: OpenAnotherMatterPayload = {
      sourceInstructionRef: pickedInstruction?.InstructionRef || undefined,
      sourcePoidId: pickedLegacy?.poid_id || undefined,
      legacyGaps: legacyGaps.length ? legacyGaps : undefined,
      brief: {
        serviceDescription: serviceDescription.trim(),
        areaOfWork,
        typeOfWork: typeOfWork.trim() || undefined,
        capacity: capacity ?? undefined,
        company: capacity === 'Company' ? { name: companyName.trim(), number: companyNumber.trim() } : undefined,
      },
      team: {
        feeEarnerInitials: feeEarner.trim().toUpperCase(),
        originatingInitials: originating.trim().toUpperCase(),
        supervisingInitials: supervising.trim().toUpperCase() || undefined,
      },
      captureDeal,
      deal: captureDeal ? {
        amount: cfa ? 0 : Number(dealAmount) || 0,
        cfa,
        moneyOnAccount,
      } : undefined,
      risk: { result: riskResult as OpenAnotherMatterPayload['risk']['result'], notes: riskNotes.trim() || undefined },
    };

    try {
      const { jobId } = await startOpenAnother(payload);
      const final = await pollJob(jobId, (state) => { if (!cancelledRef.current) setJob(state); });
      if (final.status === 'completed' && final.result) {
        onSuccess?.(final.result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!cancelledRef.current) setSubmitError(msg);
    } finally {
      if (!cancelledRef.current) setSubmitting(false);
    }
  }

  async function handleRetryWithServiceAccount() {
    if (!job?.jobId || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { jobId: newId } = await retryWithServiceAccount(job.jobId);
      const final = await pollJob(newId, (state) => { if (!cancelledRef.current) setJob(state); });
      if (final.status === 'completed' && final.result) {
        onSuccess?.(final.result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!cancelledRef.current) setSubmitError(msg);
    } finally {
      if (!cancelledRef.current) setSubmitting(false);
    }
  }

  // ── styles (small palette to keep JSX readable) ─────────────────────────
  // Field surfaces match the InlineWorkbench Client Setup card so the modal
  // doesn't visually drift from the rest of the matter-opening flow.
  const sectionBg = isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'rgba(255, 255, 255, 0.7)';
  const sectionBorder = isDarkMode ? 'rgba(160, 160, 160, 0.1)' : 'rgba(0, 0, 0, 0.05)';
  const labelColor = isDarkMode ? colours.subtleGrey : colours.greyText;
  const bodyColor = isDarkMode ? colours.dark.text : colours.light.text;
  const headingColor = isDarkMode ? colours.dark.text : colours.light.text;
  const inputBg = isDarkMode ? 'rgba(2, 6, 23, 0.45)' : 'rgba(244, 244, 246, 0.45)';
  const inputBorder = isDarkMode ? 'rgba(160, 160, 160, 0.12)' : 'rgba(0, 0, 0, 0.08)';
  const accent = isDarkMode ? colours.accent : colours.highlight;

  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: labelColor, marginBottom: 4, display: 'block',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 0,
    border: `1px solid ${inputBorder}`, background: inputBg, color: headingColor,
    fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
  };
  const sectionStyle: React.CSSProperties = {
    background: sectionBg, border: `1px solid ${sectionBorder}`, borderRadius: 0,
    padding: '10px 12px', marginBottom: 10,
  };
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: labelColor, marginBottom: 8,
  };

  // ── progress strip ──────────────────────────────────────────────────────
  function renderProgress() {
    if (!job) return null;
    const stepOrder = job.history.map((h) => h.step);
    const allKnownSteps = ['cloneInstruction', 'insertEnquiry', 'insertDeal', 'insertRiskAssessment', 'clioContact', 'clioMatter', 'linkBack'];
    const visibleSteps = allKnownSteps.filter((s) => s !== 'insertDeal' || captureDeal);
    return (
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Progress</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visibleSteps.map((s) => {
            const done = stepOrder.includes(s) && stepOrder.indexOf(s) < stepOrder.length - 1;
            const active = job.step === s && job.status === 'running';
            const failed = job.error?.step === s;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: failed ? colours.cta : done ? colours.green : active ? accent : labelColor,
                }} />
                <span style={{ color: bodyColor }}>{s}</span>
                {active && <span style={{ color: labelColor, fontSize: 11 }}>…running</span>}
              </div>
            );
          })}
        </div>
        {job.status === 'completed' && job.result && (
          <div className="helix-toast-success" style={{ marginTop: 10 }}>
            Matter opened: {job.result.displayNumber}
            {job.result.simulated ? ' (simulated)' : ''}
          </div>
        )}
        {job.error && (
          <div className="helix-toast-error" style={{ marginTop: 10 }}>
            {job.error.message} (step: {job.error.step})
          </div>
        )}
      </div>
    );
  }

  // ── modal body ──────────────────────────────────────────────────────────
  const node = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2100,
        background: 'rgba(0, 3, 25, 0.6)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div style={{
        background: isDarkMode ? colours.dark.background : '#f6f7fb',
        border: `1px solid ${sectionBorder}`,
        borderRadius: 2,
        width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        padding: 20,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: headingColor }}>
            New matter
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'transparent', border: 'none', color: labelColor,
              fontSize: 18, cursor: submitting ? 'not-allowed' : 'pointer', padding: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Section 0 — Client setup chooser (gates everything else) */}
        <div style={{ ...sectionStyle, marginBottom: capacity ? 10 : 0 }}>
          <div style={sectionTitleStyle}>Client setup</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {([
              { key: 'Individual' as ClientType, label: 'Individual', icon: <FaUser size={10} />, note: 'Single person client' },
              { key: 'Company' as ClientType, label: 'Company', icon: <FaBuilding size={10} />, note: 'Company with directors' },
              { key: 'Multiple Individuals' as ClientType, label: 'Multiple', icon: <FaUserTie size={10} />, note: 'Two or more people' },
            ]).map((option) => {
              const isSelected = capacity === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setCapacity(option.key)}
                  disabled={submitting}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                    padding: '9px 10px', borderRadius: 0,
                    border: `1px solid ${isSelected ? colours.highlight : (isDarkMode ? `${colours.dark.border}99` : 'rgba(6, 23, 51, 0.1)')}`,
                    background: isSelected
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
                      : (isDarkMode ? 'rgba(6, 23, 51, 0.35)' : 'rgba(244, 244, 246, 0.45)'),
                    color: isSelected ? colours.highlight : bodyColor,
                    cursor: submitting ? 'not-allowed' : 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700 }}>
                    {option.icon}
                    {option.label}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 500, color: isSelected ? colours.highlight : labelColor }}>
                    {option.note}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {capacity && (<>

        {/* Section 1 — Source picker */}
        <div style={{ marginBottom: 12 }}>
          {isPreset ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                padding: '2px 6px', background: isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)',
                color: accent, borderRadius: 0,
              }}>Current</span>
              <span style={{ fontSize: 13, color: bodyColor, fontFamily: 'monospace' }}>{pickedInstruction?.InstructionRef}</span>
            </div>
          ) : sourcePicked ? (
            // Picked summary chip + (legacy only) gap strip
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {pickedInstruction ? (
                    <>
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 6px', background: isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)', color: accent }}>Current</span>
                      <span style={{ fontSize: 13, color: bodyColor, fontFamily: 'monospace' }}>{pickedInstruction.InstructionRef}</span>
                      <span style={{ fontSize: 12, color: labelColor }}>
                        {[pickedInstruction.FirstName, pickedInstruction.LastName].filter(Boolean).join(' ')}
                        {pickedInstruction.CompanyName ? ` · ${pickedInstruction.CompanyName}` : ''}
                      </span>
                    </>
                  ) : pickedLegacy ? (
                    <>
                      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 6px', background: 'rgba(255,140,0,0.15)', color: colours.orange }}>Legacy</span>
                      <span style={{ fontSize: 13, color: bodyColor, fontFamily: 'monospace' }}>{pickedLegacy.poid_id}</span>
                      <span style={{ fontSize: 12, color: labelColor }}>
                        {[pickedLegacy.prefix, pickedLegacy.first, pickedLegacy.last].filter(Boolean).join(' ')}
                        {pickedLegacy.company_name ? ` · ${pickedLegacy.company_name}` : ''}
                      </span>
                    </>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => { setPickedInstruction(null); setPickedLegacy(null); setSourceFocused(true); }}
                  disabled={submitting}
                  style={{
                    background: 'transparent', border: 'none', color: labelColor,
                    fontSize: 11, cursor: submitting ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: 0.4,
                  }}
                >
                  Change
                </button>
              </div>
              {pickedLegacy && legacyGaps.length > 0 && (
                <div style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(255,140,0,0.10)', border: '1px solid rgba(255,140,0,0.35)', color: colours.orange, fontSize: 11.5 }}>
                  Missing in legacy record: <span style={{ fontWeight: 600 }}>{legacyGaps.join(', ')}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="forms-hub__search-shell" style={{ position: 'relative' }}>
              <span className="forms-hub__search-leading-icon" aria-hidden="true">
                <Icon iconName="Search" />
              </span>
              <input
                className="forms-hub__search"
                style={{ minHeight: 56, fontSize: 18, padding: '0 18px 0 48px' }}
                value={sourceQuery}
                onChange={(e) => setSourceQuery(e.target.value)}
                onFocus={() => setSourceFocused(true)}
                onBlur={() => { window.setTimeout(() => setSourceFocused(false), 150); }}
                placeholder="Search instructions — name, email, company, or HLX-…"
                disabled={submitting}
                autoFocus
                type="search"
                aria-label="Search instructions"
              />
              {sourceFocused && sourceQuery.trim().length >= 2 && (
                <div className="forms-hub__search-dropdown" style={{ maxHeight: 320 }}>
                  {sourceLoading && currentHits.length === 0 && legacyHits.length === 0 && (
                    <div className="forms-hub__search-empty">Searching…</div>
                  )}
                  {currentHits.map((h) => (
                    <button
                      key={h.InstructionRef}
                      type="button"
                      className="forms-hub__search-option"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setPickedInstruction(h); setPickedLegacy(null); setSourceFocused(false); }}
                    >
                      <span className="forms-hub__search-option-icon" style={{ color: accent }}>
                        <Icon iconName="ContactInfo" />
                      </span>
                      <span className="forms-hub__search-option-text">
                        <span className="forms-hub__search-option-title">
                          {[h.FirstName, h.LastName].filter(Boolean).join(' ') || h.CompanyName || h.Email || h.InstructionRef}
                        </span>
                        <span className="forms-hub__search-option-meta">
                          {h.InstructionRef}{h.Stage ? ` · ${h.Stage}` : ''}{h.CompanyName ? ` · ${h.CompanyName}` : ''}
                        </span>
                      </span>
                    </button>
                  ))}

                  {/* Zero current hits → offer legacy */}
                  {!sourceLoading && currentHits.length === 0 && !legacySearched && (
                    <button
                      type="button"
                      className="forms-hub__search-option"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { void searchLegacy(); }}
                    >
                      <span className="forms-hub__search-option-icon" style={{ color: colours.orange }}>
                        <Icon iconName="History" />
                      </span>
                      <span className="forms-hub__search-option-text">
                        <span className="forms-hub__search-option-title">Search legacy POID records</span>
                        <span className="forms-hub__search-option-meta">No current instructions match</span>
                      </span>
                    </button>
                  )}

                  {/* Legacy results */}
                  {legacySearched && legacyHits.length === 0 && !sourceLoading && (
                    <div className="forms-hub__search-empty">No legacy records match either.</div>
                  )}
                  {legacyHits.map((h) => (
                    <button
                      key={`legacy-${h.poid_id}`}
                      type="button"
                      className="forms-hub__search-option"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setPickedLegacy(h); setPickedInstruction(null); setSourceFocused(false); }}
                    >
                      <span className="forms-hub__search-option-icon" style={{ color: colours.orange }}>
                        <Icon iconName="History" />
                      </span>
                      <span className="forms-hub__search-option-text">
                        <span className="forms-hub__search-option-title">
                          {[h.prefix, h.first, h.last].filter(Boolean).join(' ') || h.company_name || h.email || h.poid_id}
                        </span>
                        <span className="forms-hub__search-option-meta">
                          Legacy · {h.poid_id}{h.company_name ? ` · ${h.company_name}` : ''} · {h._gaps.length ? `${h._gaps.length} gap${h._gaps.length === 1 ? '' : 's'}` : 'complete'}
                        </span>
                      </span>
                    </button>
                  ))}

                  {sourceErr && (
                    <div className="forms-hub__search-empty" style={{ color: colours.cta }}>{sourceErr}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 2 — New case brief */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>New case brief</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Service description *</label>
              <input style={inputStyle} value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} disabled={submitting} />
            </div>
            <div>
              <label style={labelStyle}>Area of work *</label>
              <select style={inputStyle} value={areaOfWork} onChange={(e) => setAreaOfWork(e.target.value)} disabled={submitting}>
                <option value="">— pick —</option>
                {AREA_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Type of work</label>
              <input style={inputStyle} value={typeOfWork} onChange={(e) => setTypeOfWork(e.target.value)} disabled={submitting} />
            </div>
            {capacity === 'Company' && (
              <>
                <div>
                  <label style={labelStyle}>Company name</label>
                  <input style={inputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={submitting} />
                </div>
                <div>
                  <label style={labelStyle}>Company number</label>
                  <input style={inputStyle} value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)} disabled={submitting} />
                </div>
              </>
            )}
          </div>

          {/* Capture new deal */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${inputBorder}` }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: bodyColor, cursor: submitting ? 'not-allowed' : 'pointer' }}>
              <input type="checkbox" checked={captureDeal} onChange={(e) => setCaptureDeal(e.target.checked)} disabled={submitting} />
              Capture a new deal (otherwise inherits the source instruction's deal context)
            </label>
            {captureDeal && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 10 }}>
                <div>
                  <label style={labelStyle}>Amount (£)</label>
                  <input
                    style={{ ...inputStyle, opacity: cfa ? 0.5 : 1 }}
                    type="number"
                    value={cfa ? '0' : dealAmount}
                    onChange={(e) => setDealAmount(e.target.value)}
                    disabled={submitting || cfa}
                    min={0}
                  />
                </div>
                <div>
                  <label style={labelStyle}>CFA</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, fontSize: 12, color: bodyColor }}>
                    <input type="checkbox" checked={cfa} onChange={(e) => setCfa(e.target.checked)} disabled={submitting} />
                    No fee until success
                  </label>
                </div>
                <div>
                  <label style={labelStyle}>Money on account</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, fontSize: 12, color: bodyColor }}>
                    <input type="checkbox" checked={moneyOnAccount} onChange={(e) => setMoneyOnAccount(e.target.checked)} disabled={submitting} />
                    Required
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 3 — Team + risk */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Team &amp; risk</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Fee earner *</label>
              <input style={inputStyle} value={feeEarner} onChange={(e) => setFeeEarner(e.target.value)} placeholder="Initials" disabled={submitting} />
            </div>
            <div>
              <label style={labelStyle}>Originating *</label>
              <input style={inputStyle} value={originating} onChange={(e) => setOriginating(e.target.value)} placeholder="Initials" disabled={submitting} />
            </div>
            <div>
              <label style={labelStyle}>Supervising</label>
              <input style={inputStyle} value={supervising} onChange={(e) => setSupervising(e.target.value)} placeholder="Initials" disabled={submitting} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: labelColor, marginTop: 6 }}>
            Originating must match the Clio token user. If mismatch causes a 403, you'll get a one-click retry using the automations service account.
          </div>

          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Risk result *</label>
              <select style={inputStyle} value={riskResult} onChange={(e) => setRiskResult(e.target.value as typeof RISK_OPTIONS[number])} disabled={submitting}>
                {RISK_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Risk notes</label>
              <input style={inputStyle} value={riskNotes} onChange={(e) => setRiskNotes(e.target.value)} disabled={submitting} />
            </div>
          </div>
        </div>

        {/* Progress */}
        {renderProgress()}

        {submitError && (
          <div className="helix-toast-error" style={{ marginBottom: 12 }}>{submitError}</div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          {job?.error?.recoverable && (
            <button
              type="button"
              className="helix-btn-primary"
              style={{ background: colours.orange }}
              onClick={handleRetryWithServiceAccount}
              disabled={submitting}
            >
              Retry with service account
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '8px 16px', borderRadius: 2, fontSize: 12, fontWeight: 600,
              background: 'transparent', border: `1px solid ${inputBorder}`, color: bodyColor,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {job?.status === 'completed' ? 'Close' : 'Cancel'}
          </button>
          {job?.status !== 'completed' && (
            <button
              type="button"
              className="helix-btn-primary"
              onClick={handleSubmit}
              disabled={!formValid || submitting}
              style={{ opacity: formValid && !submitting ? 1 : 0.5, cursor: formValid && !submitting ? 'pointer' : 'not-allowed' }}
            >
              {submitting ? 'Opening…' : 'Open matter'}
            </button>
          )}
        </div>

        </>)}
      </div>
    </div>
  );

  return createPortal(node, document.body);
};

export default OpenAnotherMatterModal;
