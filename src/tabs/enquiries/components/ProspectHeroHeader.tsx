/**
 * ProspectHeroHeader — v5
 *
 * Compact context strip for the workbench. This should read like software
 * chrome, not a hero card: essential identity first, case switching second.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Enquiry } from '../../../app/functionality/types';
import { colours } from '../../../app/styles/colours';
import activecampaignIcon from '../../../assets/activecampaign.svg';
import {
  FaCheckCircle,
  FaCopy,
  FaEnvelope,
  FaLink,
  FaPaperPlane,
  FaPhone,
  FaStar,
  FaTimes,
  FaUserPlus,
} from 'react-icons/fa';
import { useToast } from '../../../components/feedback/ToastProvider';
import { trackClientEvent } from '../../../utils/telemetry';

const FONT_STACK = "'Raleway', 'Segoe UI', sans-serif";

type EnquiryWindow = {
  enquiry: Enquiry;
  startTs: number;
  endTs: number;
};

interface ProspectHeroHeaderProps {
  enquiry: Enquiry;
  isDarkMode: boolean;
  copiedField: string | null;
  displayAreaOfWork: string;
  pocDisplayName: string | null;
  enquiryWindows: EnquiryWindow[];
  activeEnquiryId: string | number;
  hoveredCaseId: string | null;
  setHoveredCaseId: (caseId: string | null) => void;
  showCaseSelector?: boolean;
  onSelectEnquiry?: (enquiry: Enquiry) => void;
  formatCaseAreaLabel: (areaOfWork: string | undefined) => string;
  onOpenMailto: (email: string) => void;
  onOpenTel: (phoneNumber: string) => void;
  onCopyToClipboard: (value: string, label: string) => void;
  currentRating?: string | null;
  onOpenEnquiryRating?: () => void;
  onShareEnquiry?: () => void;
  onOpenPitchBuilder?: () => void;
  inlineWorkbenchItem?: any;
}

/* ── Helpers ─────────────────────────────────────────────── */

const getAreaColour = (area: string): string => {
  const raw = area.toLowerCase();
  if (raw.includes('commercial')) return colours.blue;
  if (raw.includes('property')) return colours.green;
  if (raw.includes('construction')) return colours.orange;
  if (raw.includes('employment')) return colours.yellow;
  return colours.greyText;
};

const formatShortDate = (iso: string | undefined): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
};

const formatShortDateTime = (iso: string | undefined): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${datePart} · ${timePart}`;
  } catch {
    return '';
  }
};

/* ── Component ───────────────────────────────────────────── */

const ProspectHeroHeader: React.FC<ProspectHeroHeaderProps> = ({
  enquiry,
  isDarkMode,
  copiedField,
  displayAreaOfWork,
  pocDisplayName,
  enquiryWindows,
  activeEnquiryId,
  hoveredCaseId,
  setHoveredCaseId,
  showCaseSelector = true,
  onSelectEnquiry,
  formatCaseAreaLabel,
  onOpenMailto,
  onOpenTel,
  onCopyToClipboard,
  currentRating,
  onOpenEnquiryRating,
  onShareEnquiry,
  onOpenPitchBuilder,
  inlineWorkbenchItem,
}) => {
  const areaColour = getAreaColour(displayAreaOfWork);

  // Activate Pitch Link popover — issues a passcode + instruct URL without drafting an email.
  const { showToast } = useToast();
  const [pitchLinkOpen, setPitchLinkOpen] = useState(false);
  const [pitchLinkDescription, setPitchLinkDescription] = useState('');
  const [pitchLinkAmount, setPitchLinkAmount] = useState('');
  const [pitchLinkBusy, setPitchLinkBusy] = useState(false);
  const pitchLinkAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pitchLinkOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPitchLinkOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (pitchLinkAnchorRef.current && !pitchLinkAnchorRef.current.contains(e.target as Node)) {
        setPitchLinkOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [pitchLinkOpen]);

  const handleActivatePitchLinkSubmit = async () => {
    const description = pitchLinkDescription.trim();
    const amountNum = parseFloat(pitchLinkAmount.replace(/,/g, '')) || 0;
    if (!description) {
      showToast({ message: 'Add a short service description before activating the link.', type: 'warning' });
      return;
    }
    const rawCandidates = [
      (enquiry as any)?.acid,
      enquiry?.ID,
      (enquiry as any)?.id,
    ].map((v) => (v === undefined || v === null ? '' : String(v).trim()));
    const prospectId = rawCandidates.find((v) => /^\d+$/.test(v) && v !== '0');
    if (!prospectId) {
      showToast({ message: 'Cannot activate link: prospect id is missing.', type: 'error' });
      return;
    }
    setPitchLinkBusy(true);
    try {
      const res = await fetch('/api/deal-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkOnly: true,
          prospectId,
          serviceDescription: description,
          amount: amountNum,
          enquiryId: prospectId,
          areaOfWork: enquiry?.Area_of_Work || '',
          pitchedBy: enquiry?.Point_of_Contact || 'Hub',
          firstName: enquiry?.First_Name || '',
          lastName: enquiry?.Last_Name || '',
          email: enquiry?.Email || '',
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Request failed (${res.status})`);
      }
      const data = await res.json().catch(() => ({} as any));
      const passcode: string | undefined = data?.passcode || data?.dealPasscode;
      const instructionsUrl: string | undefined = data?.instructionsUrl || data?.url;
      if (!passcode) throw new Error('No passcode returned');
      trackClientEvent('pitch-builder', 'Hub.PitchLink.Activated', {
        source: 'prospect-hero-header',
        enquiryId: String(prospectId),
        amount: amountNum,
      });
      const detailLine = instructionsUrl ? `Passcode ${passcode} · ${instructionsUrl}` : `Passcode ${passcode}`;
      try {
        if (navigator?.clipboard?.writeText && instructionsUrl) {
          await navigator.clipboard.writeText(instructionsUrl);
        }
      } catch { /* clipboard best-effort */ }
      showToast({ message: `Pitch link activated. ${detailLine}`, type: 'success' });
      setPitchLinkOpen(false);
      setPitchLinkDescription('');
      setPitchLinkAmount('');
    } catch (err: any) {
      showToast({ message: `Could not activate pitch link: ${err?.message || 'unknown error'}`, type: 'error' });
    } finally {
      setPitchLinkBusy(false);
    }
  };

  // Enrich from instruction when enquiry name is incomplete
  const instr = inlineWorkbenchItem?.instruction;
  const enrichedFirst = (enquiry.First_Name && enquiry.Last_Name) ? enquiry.First_Name : (instr?.FirstName || enquiry.First_Name);
  const enrichedLast = (enquiry.First_Name && enquiry.Last_Name) ? enquiry.Last_Name : (instr?.LastName || enquiry.Last_Name);
  const clientDisplayName =
    enrichedFirst && enrichedLast
      ? `${enrichedFirst} ${enrichedLast}`
      : enrichedFirst || enrichedLast || 'New Prospect';

  // Surface tokens
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const textBody = isDarkMode ? '#d1d5db' : '#374151';

  const showCaseSelectorRow = showCaseSelector && enquiryWindows.length > 1;
  const activeCampaignIconFilter = isDarkMode ? 'brightness(0) invert(1)' : 'none';
  const touchpointDateLabel = formatShortDateTime(enquiry.Touchpoint_Date || enquiry.Date_Created);
  const pointOfContactLabel = pocDisplayName || 'Unclaimed';
  const activeCampaignId = [
    (instr as any)?.acid,
    (instr as any)?.ACID,
    (enquiry as any)?.acid,
    (enquiry as any)?.ACID,
    (enquiry as any)?.Acid,
  ].find((value) => {
    if (value === null || value === undefined) return false;
    const normalised = String(value).trim();
    return normalised.length > 0 && normalised !== '—' && normalised.toLowerCase() !== 'undefined';
  });
  const displayId = activeCampaignId ? String(activeCampaignId).trim() : (enquiry.ID ? String(enquiry.ID) : '');
  const enquiryValueRaw = enquiry.Value;
  const enquiryValueNumeric = enquiryValueRaw && !isNaN(Number(enquiryValueRaw)) ? Number(enquiryValueRaw) : 0;
  const enquiryValueDisplay = enquiryValueNumeric > 0 ? `£${enquiryValueNumeric.toLocaleString()}` : '';
  const normalisedRating = typeof currentRating === 'string' && currentRating !== '—' ? currentRating : '';
  const ratingColor = normalisedRating === 'Good'
    ? colours.highlight
    : normalisedRating === 'Poor'
      ? colours.cta
      : (isDarkMode ? colours.subtleGrey : colours.greyText);
  const shellDivider = isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(6, 23, 51, 0.08)';
  const caseStripBorder = isDarkMode ? 'rgba(75, 85, 99, 0.32)' : 'rgba(13, 47, 96, 0.08)';
  const caseStripBackground = isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(13, 47, 96, 0.025)';
  const contactActionStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: FONT_STACK,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.2,
    minWidth: 0,
    maxWidth: '100%',
  };
  const copyButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'color 0.15s ease, opacity 0.15s ease',
  };
  const iconBoxStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 14,
    height: 14,
    flexShrink: 0,
  };
  const compactActionButtonBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 26,
    padding: '0 9px',
    borderRadius: 0,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.2px',
    transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
    whiteSpace: 'nowrap',
  };
  const primaryActionStyle: React.CSSProperties = {
    ...compactActionButtonBase,
    minHeight: 28,
    padding: '0 12px',
    fontSize: 11,
    background: colours.highlight,
    border: `1px solid ${colours.highlight}`,
    color: '#ffffff',
    flexShrink: 0,
  };
  const secondaryActionStyle: React.CSSProperties = {
    ...compactActionButtonBase,
    minHeight: 28,
    padding: '0 12px',
    fontSize: 11,
    background: 'transparent',
    border: `1px solid ${colours.highlight}`,
    color: colours.highlight,
    flexShrink: 0,
  };

  return (
    <div
      data-helix-region="enquiries/detail/context-strip"
      style={{
        background: isDarkMode ? 'rgba(255, 255, 255, 0.015)' : 'rgba(13, 47, 96, 0.015)',
        border: `1px solid ${shellDivider}`,
        borderBottom: 'none',
        padding: '14px 16px 16px',
        fontFamily: FONT_STACK,
        boxShadow: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Row 1: identity (left) + contact stack (right) */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: 12,
            flex: '1 1 360px',
            minWidth: 0,
          }}>
            <span
              aria-hidden
              style={{
                width: 3,
                alignSelf: 'stretch',
                background: areaColour,
                flexShrink: 0,
                opacity: isDarkMode ? 0.85 : 0.7,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
                <h2 style={{
                  fontSize: 19,
                  fontWeight: 700,
                  color: textPrimary,
                  margin: 0,
                  lineHeight: 1.05,
                  letterSpacing: -0.25,
                  whiteSpace: 'normal',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {clientDisplayName}
                </h2>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  background: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(13, 47, 96, 0.03)',
                  color: areaColour,
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: areaColour, flexShrink: 0 }} />
                  <span>{displayAreaOfWork || 'General'}</span>
                </span>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                color: textBody,
                fontSize: 12,
                lineHeight: 1.3,
              }}>
                <span>{pointOfContactLabel}</span>
                {touchpointDateLabel && (
                  <>
                    <span style={{ opacity: 0.4 }}>•</span>
                    <span>{touchpointDateLabel}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right-side contact stack: ID / email / phone */}
          {(displayId || enquiry.Email || enquiry.Phone_Number) && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 4,
              flexShrink: 0,
              minWidth: 0,
              color: textBody,
            }}>
              {displayId && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCopyToClipboard(displayId, 'ID'); }}
                    title={`Copy ID: ${displayId}`}
                    style={{ ...contactActionStyle, color: textBody }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.72'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  >
                    <span style={iconBoxStyle}>
                      <img src={activecampaignIcon} alt="AC" style={{ width: 14, height: 14, filter: activeCampaignIconFilter }} />
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: textBody, whiteSpace: 'nowrap' }}>{displayId}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCopyToClipboard(displayId, 'ID'); }}
                    title={copiedField === 'ID' ? 'Copied' : 'Copy ID'}
                    style={{ ...copyButtonStyle, color: copiedField === 'ID' ? colours.green : textMuted, opacity: copiedField === 'ID' ? 1 : 0.55 }}
                    onMouseEnter={(e) => {
                      if (copiedField !== 'ID') { e.currentTarget.style.color = colours.highlight; e.currentTarget.style.opacity = '1'; }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = copiedField === 'ID' ? colours.green : textMuted;
                      e.currentTarget.style.opacity = copiedField === 'ID' ? '1' : '0.55';
                    }}
                  >
                    {copiedField === 'ID' ? <FaCheckCircle size={10} /> : <FaCopy size={10} />}
                  </button>
                </span>
              )}

              {enquiry.Email && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => onOpenMailto(enquiry.Email!)}
                    title={`Email ${enquiry.Email}`}
                    style={{ ...contactActionStyle, color: textBody, fontWeight: 500 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = colours.highlight; e.currentTarget.style.opacity = '0.9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = textBody; e.currentTarget.style.opacity = '1'; }}
                  >
                    <span style={iconBoxStyle}>
                      <FaEnvelope size={11} />
                    </span>
                    <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{enquiry.Email}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCopyToClipboard(enquiry.Email!, 'Email'); }}
                    title={copiedField === 'Email' ? 'Copied' : 'Copy email'}
                    style={{ ...copyButtonStyle, color: copiedField === 'Email' ? colours.green : textMuted, opacity: copiedField === 'Email' ? 1 : 0.55 }}
                    onMouseEnter={(e) => {
                      if (copiedField !== 'Email') { e.currentTarget.style.color = colours.highlight; e.currentTarget.style.opacity = '1'; }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = copiedField === 'Email' ? colours.green : textMuted;
                      e.currentTarget.style.opacity = copiedField === 'Email' ? '1' : '0.55';
                    }}
                  >
                    {copiedField === 'Email' ? <FaCheckCircle size={10} /> : <FaCopy size={10} />}
                  </button>
                </span>
              )}

              {enquiry.Phone_Number && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => onOpenTel(enquiry.Phone_Number!)}
                    title={`Call ${enquiry.Phone_Number}`}
                    style={{ ...contactActionStyle, color: textBody, fontWeight: 500 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = colours.highlight; e.currentTarget.style.opacity = '0.9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = textBody; e.currentTarget.style.opacity = '1'; }}
                  >
                    <span style={iconBoxStyle}>
                      <FaPhone size={11} />
                    </span>
                    <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{enquiry.Phone_Number}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCopyToClipboard(enquiry.Phone_Number!, 'Phone'); }}
                    title={copiedField === 'Phone' ? 'Copied' : 'Copy phone'}
                    style={{ ...copyButtonStyle, color: copiedField === 'Phone' ? colours.green : textMuted, opacity: copiedField === 'Phone' ? 1 : 0.55 }}
                    onMouseEnter={(e) => {
                      if (copiedField !== 'Phone') { e.currentTarget.style.color = colours.highlight; e.currentTarget.style.opacity = '1'; }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = copiedField === 'Phone' ? colours.green : textMuted;
                      e.currentTarget.style.opacity = copiedField === 'Phone' ? '1' : '0.55';
                    }}
                  >
                    {copiedField === 'Phone' ? <FaCheckCircle size={10} /> : <FaCopy size={10} />}
                  </button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Row 2: action strip. Draft pitch (primary), Activate Pitch Link (secondary), Rate plus Share, value right-anchored. */}
        {(onOpenPitchBuilder || onOpenEnquiryRating || onShareEnquiry || enquiryValueDisplay) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {onOpenPitchBuilder && (
              <button
                type="button"
                onClick={onOpenPitchBuilder}
                title="Open the pitch builder to draft an email pitch"
                style={primaryActionStyle}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                <FaPaperPlane size={10} />
                <span>Draft pitch</span>
              </button>
            )}
            {onOpenPitchBuilder && (
              <div ref={pitchLinkAnchorRef} style={{ position: 'relative', display: 'inline-flex' }}>
                <button
                  type="button"
                  onClick={() => setPitchLinkOpen((v) => !v)}
                  title="Generate a passcode and instruct URL without sending an email"
                  style={{
                    ...secondaryActionStyle,
                    background: pitchLinkOpen ? (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(54,144,206,0.08)') : 'transparent',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  aria-haspopup="dialog"
                  aria-expanded={pitchLinkOpen}
                >
                  <FaLink size={10} />
                  <span>Activate Pitch Link</span>
                </button>
                {pitchLinkOpen && (
                  <div
                    role="dialog"
                    aria-label="Activate pitch link"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      zIndex: 50,
                      minWidth: 320,
                      background: isDarkMode ? colours.darkBlue : '#ffffff',
                      border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.28)' : 'rgba(6,23,51,0.12)'}`,
                      boxShadow: isDarkMode ? '0 8px 24px rgba(0,3,25,0.5)' : '0 6px 18px rgba(6,23,51,0.12)',
                      padding: 14,
                      fontFamily: FONT_STACK,
                      borderRadius: 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: textPrimary, letterSpacing: '0.3px' }}>
                        Activate Pitch Link
                      </div>
                      <button
                        type="button"
                        onClick={() => setPitchLinkOpen(false)}
                        aria-label="Close"
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: textMuted, padding: 2 }}
                      >
                        <FaTimes size={11} />
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: textBody, lineHeight: 1.45, marginBottom: 10 }}>
                      Generates a passcode and instruct URL without sending an email. Share the link directly with the client.
                    </div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>
                      Service description
                    </label>
                    <input
                      type="text"
                      value={pitchLinkDescription}
                      onChange={(e) => setPitchLinkDescription(e.target.value)}
                      placeholder="e.g. Commercial contract advice"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '8px 10px',
                        marginBottom: 10,
                        fontSize: 13,
                        fontFamily: FONT_STACK,
                        background: isDarkMode ? colours.dark.cardBackground : '#ffffff',
                        color: textPrimary,
                        border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(6,23,51,0.18)'}`,
                        borderRadius: 0,
                        outline: 'none',
                      }}
                    />
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>
                      Fee (GBP, optional)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={pitchLinkAmount}
                      onChange={(e) => setPitchLinkAmount(e.target.value)}
                      placeholder="0"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '8px 10px',
                        marginBottom: 12,
                        fontSize: 13,
                        fontFamily: FONT_STACK,
                        background: isDarkMode ? colours.dark.cardBackground : '#ffffff',
                        color: textPrimary,
                        border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(6,23,51,0.18)'}`,
                        borderRadius: 0,
                        outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setPitchLinkOpen(false)}
                        disabled={pitchLinkBusy}
                        style={{
                          padding: '7px 12px',
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: FONT_STACK,
                          background: 'transparent',
                          color: textMuted,
                          border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(6,23,51,0.18)'}`,
                          cursor: pitchLinkBusy ? 'not-allowed' : 'pointer',
                          borderRadius: 0,
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleActivatePitchLinkSubmit}
                        disabled={pitchLinkBusy || !pitchLinkDescription.trim()}
                        style={{
                          padding: '7px 14px',
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.3px',
                          textTransform: 'uppercase',
                          fontFamily: FONT_STACK,
                          background: colours.highlight,
                          color: '#ffffff',
                          border: `1px solid ${colours.highlight}`,
                          cursor: pitchLinkBusy || !pitchLinkDescription.trim() ? 'not-allowed' : 'pointer',
                          opacity: pitchLinkBusy || !pitchLinkDescription.trim() ? 0.6 : 1,
                          borderRadius: 0,
                        }}
                      >
                        {pitchLinkBusy ? 'Activating…' : 'Activate link'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {onOpenEnquiryRating && (
                <button
                  type="button"
                  onClick={onOpenEnquiryRating}
                  title={normalisedRating ? `Rating: ${normalisedRating} · Click to change` : 'Rate this enquiry'}
                  style={{
                    ...secondaryActionStyle,
                    borderColor: normalisedRating ? ratingColor : (isDarkMode ? 'rgba(75,85,99,0.45)' : 'rgba(6,23,51,0.18)'),
                    color: normalisedRating ? ratingColor : textBody,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                >
                  {normalisedRating === 'Good' ? <FaCheckCircle size={10} /> : <FaStar size={10} />}
                  <span>{normalisedRating || 'Rate'}</span>
                </button>
              )}
              {onShareEnquiry && (
                <button
                  type="button"
                  onClick={onShareEnquiry}
                  title="Share access to this enquiry"
                  style={{
                    ...secondaryActionStyle,
                    borderColor: isDarkMode ? 'rgba(75,85,99,0.45)' : 'rgba(6,23,51,0.18)',
                    color: textBody,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                >
                  <FaUserPlus size={10} />
                  <span>Share</span>
                </button>
              )}
              {enquiryValueDisplay && (
                <div
                  title="Estimated enquiry value"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'baseline',
                    gap: 6,
                    flexShrink: 0,
                    fontFamily: FONT_STACK,
                    color: textBody,
                  }}
                >
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    color: textMuted,
                  }}>
                    Est. value
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: textPrimary, lineHeight: 1 }}>
                    {enquiryValueDisplay}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {showCaseSelectorRow && (
          <div data-helix-region="enquiries/detail/case-switcher" style={{ display: 'grid', gap: 6 }}>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: textMuted,
            }}>
              Cases
            </span>

            <div style={{
              display: 'flex',
              alignItems: 'stretch',
              overflowX: 'auto',
              maxWidth: '100%',
              background: caseStripBackground,
              boxShadow: `inset 0 0 0 1px ${caseStripBorder}`,
            }}>
              {enquiryWindows.map((window, index) => {
                const caseId = String(window.enquiry.ID);
                const isActive = caseId === String(activeEnquiryId);
                const isHovered = hoveredCaseId === caseId;
                const canSelect = !isActive && typeof onSelectEnquiry === 'function';
                const areaLabel = formatCaseAreaLabel(window.enquiry.Area_of_Work);
                const chipAreaColour = getAreaColour(areaLabel);
                const touchpointDate = formatShortDate(window.enquiry.Touchpoint_Date || window.enquiry.Date_Created);
                const rawValue = window.enquiry.Value;
                const valueDisplay = rawValue && !isNaN(Number(rawValue)) && Number(rawValue) > 0
                  ? `£${Number(rawValue).toLocaleString()}`
                  : null;
                const caseShadowParts = [
                  index > 0 ? `inset 1px 0 0 ${caseStripBorder}` : '',
                  isActive ? `inset 0 -2px 0 ${chipAreaColour}` : '',
                ].filter(Boolean);

                return (
                  <button
                    key={caseId}
                    type="button"
                    onClick={() => canSelect && onSelectEnquiry?.(window.enquiry)}
                    onMouseEnter={() => setHoveredCaseId(caseId)}
                    onMouseLeave={() => setHoveredCaseId(null)}
                    title={[areaLabel, touchpointDate, valueDisplay].filter(Boolean).join(' · ')}
                    style={{
                      display: 'inline-flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      justifyContent: 'center',
                      gap: 3,
                      minWidth: 128,
                      padding: '8px 12px',
                      background: isActive
                        ? (isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(13, 47, 96, 0.04)')
                        : isHovered && canSelect
                        ? (isDarkMode ? 'rgba(255, 255, 255, 0.025)' : 'rgba(13, 47, 96, 0.025)')
                        : 'transparent',
                      boxShadow: caseShadowParts.length > 0 ? caseShadowParts.join(', ') : 'none',
                      border: 'none',
                      color: isActive ? textPrimary : textBody,
                      cursor: canSelect ? 'pointer' : 'default',
                      fontFamily: FONT_STACK,
                      textAlign: 'left',
                      transition: 'background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
                      flex: '0 0 auto',
                    }}
                  >
                    <span style={{
                      fontSize: 11,
                      fontWeight: isActive ? 700 : 600,
                      whiteSpace: 'nowrap',
                      color: isActive ? textPrimary : textBody,
                    }}>
                      {touchpointDate || '—'}
                    </span>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      color: isActive ? chipAreaColour : textMuted,
                    }}>
                      {areaLabel}{valueDisplay ? ` · ${valueDisplay}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProspectHeroHeader;