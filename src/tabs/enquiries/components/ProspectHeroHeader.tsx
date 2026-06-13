/**
 * ProspectHeroHeader — v5
 *
 * Compact context strip for the workbench. This should read like software
 * chrome, not a hero card: essential identity first, case switching second.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { recordProcessEvent } from '../../../utils/processStreamEvents';
import { derivePitchLinkMetadata } from '../pitch-builder/pitchLinkMetadata';
import { DEFAULT_PITCH_AMOUNT } from '../pitch-builder/scenarios';

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

const getActivePitchLinkSummary = (pitches: any[]): { label: string; passcode: string } | null => {
  const now = Date.now();
  for (const pitch of pitches) {
    const passcode = String(pitch?.Passcode || pitch?.passcode || '').trim();
    if (!passcode) continue;

    const stage = String(pitch?.InstructionStage || pitch?.instructionStage || pitch?.InstructionInternalStatus || pitch?.instructionInternalStatus || '').toLowerCase();
    const hasConverted = stage.includes('instruct') || stage.includes('matter') || stage.includes('paid') || stage.includes('complete');
    const validUntilRaw = pitch?.PitchValidUntil || pitch?.pitchValidUntil || pitch?.ValidUntil || pitch?.validUntil || pitch?.ExpiresAt || pitch?.expiresAt;
    const validUntil = validUntilRaw ? new Date(validUntilRaw).getTime() : null;
    const isExpired = typeof validUntil === 'number' && Number.isFinite(validUntil) && validUntil < now;
    if (hasConverted || isExpired) continue;

    return {
      label: derivePitchLinkMetadata(pitch).linkTypeLabel,
      passcode,
    };
  }
  return null;
};

const collectEnquiryEventIds = (enquiry: Enquiry): string[] => {
  const enquiryAny = enquiry as Enquiry & {
    acid?: string | number;
    ACID?: string | number;
    id?: string | number;
    ProspectId?: string | number;
    prospectId?: string | number;
    legacyEnquiryId?: string | number;
    processingEnquiryId?: string | number;
    pitchEnquiryId?: string | number;
  };
  return Array.from(new Set([
    enquiryAny.acid,
    enquiryAny.ACID,
    enquiryAny.ID,
    enquiryAny.id,
    enquiryAny.ProspectId,
    enquiryAny.prospectId,
    enquiryAny.legacyEnquiryId,
    enquiryAny.processingEnquiryId,
    enquiryAny.pitchEnquiryId,
  ].map((value) => String(value ?? '').trim()).filter(Boolean)));
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

  // Send Pitch Link popover: issues a passcode + instruct URL without drafting an email.
  const { showToast } = useToast();
  const [pitchLinkOpen, setPitchLinkOpen] = useState(false);
  const [pitchLinkDescription, setPitchLinkDescription] = useState('');
  const [pitchLinkIncludePayment, setPitchLinkIncludePayment] = useState(true);
  const [pitchLinkAmount, setPitchLinkAmount] = useState(DEFAULT_PITCH_AMOUNT);
  const [pitchLinkBusy, setPitchLinkBusy] = useState(false);
  const [pitchLinkPopoverPosition, setPitchLinkPopoverPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const pitchLinkAnchorRef = useRef<HTMLDivElement | null>(null);
  const pitchLinkPopoverRef = useRef<HTMLDivElement | null>(null);

  const updatePitchLinkPopoverPosition = () => {
    const anchor = pitchLinkAnchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth || 360;
    const width = Math.min(360, Math.max(288, viewportWidth - 32));
    const left = Math.min(Math.max(16, rect.left), Math.max(16, viewportWidth - width - 16));
    setPitchLinkPopoverPosition({ top: rect.bottom + 6, left, width });
  };

  useEffect(() => {
    if (!pitchLinkOpen) return;
    updatePitchLinkPopoverPosition();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPitchLinkOpen(false); };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        pitchLinkAnchorRef.current &&
        !pitchLinkAnchorRef.current.contains(target) &&
        !pitchLinkPopoverRef.current?.contains(target)
      ) {
        setPitchLinkOpen(false);
      }
    };
    const onMove = () => updatePitchLinkPopoverPosition();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [pitchLinkOpen]);

  const handleCreateClientLinkSubmit = async () => {
    const description = pitchLinkDescription.trim();
    const includePayment = pitchLinkIncludePayment;
    const parsedAmount = parseFloat(pitchLinkAmount.replace(/,/g, '')) || 0;
    const amountNum = includePayment ? parsedAmount : 0;
    if (!description) {
      showToast({ message: 'Add a short service description before sending the link.', type: 'warning' });
      return;
    }
    if (includePayment && amountNum <= 0) {
      showToast({ message: 'Enter the payment amount, or switch off Include payment.', type: 'warning' });
      return;
    }
    const rawCandidates = [
      (enquiry as any)?.acid,
      enquiry?.ID,
      (enquiry as any)?.id,
    ].map((v) => (v === undefined || v === null ? '' : String(v).trim()));
    const prospectId = rawCandidates.find((v) => /^\d+$/.test(v) && v !== '0');
    if (!prospectId) {
      showToast({ message: 'Cannot send link: prospect id is missing.', type: 'error' });
      return;
    }
    setPitchLinkBusy(true);
    try {
      const existingRes = await fetch(`/api/pitches/${encodeURIComponent(prospectId)}?_ts=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (existingRes.ok) {
        const existingData = await existingRes.json().catch(() => ({} as any));
        const activePitchLink = getActivePitchLinkSummary(Array.isArray(existingData?.pitches) ? existingData.pitches : []);
        if (activePitchLink) {
          showToast({
            message: `An active ${activePitchLink.label} already exists for this enquiry. Use the Pitch panel to copy passcode ${activePitchLink.passcode}.`,
            type: 'warning',
          });
          return;
        }
      }

      const res = await fetch('/api/deal-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkOnly: true,
          noAmountMode: !includePayment,
          checkoutMode: includePayment ? 'CHECKOUT_LINK' : 'ID_ONLY',
          prospectId,
          serviceDescription: description,
          amount: amountNum,
          enquiryId: prospectId,
          areaOfWork: enquiry?.Area_of_Work || '',
          pitchedBy: enquiry?.Point_of_Contact || 'Hub',
          firstName: enquiry?.First_Name || '',
          lastName: enquiry?.Last_Name || '',
          clientName: clientDisplayName,
          email: enquiry?.Email || '',
          contactEmail: enquiry?.Email || '',
          leadClientEmail: enquiry?.Email || '',
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
      const linkToCopy = instructionsUrl || `https://instruct.helix-law.com/pitch/${encodeURIComponent(passcode)}`;
      const linkType = includePayment ? 'PAYMENT_ID_DOC_REQUEST' : 'ID_DOC_REQUEST';
      const linkTypeLabel = includePayment ? 'Payment, ID and document request link' : 'ID and document request link';
      const includesDocumentRequest = true;
      trackClientEvent('pitch-builder', 'Hub.PitchLink.Created', {
        source: 'prospect-hero-header',
        enquiryId: String(prospectId),
        amount: amountNum,
        includePayment,
        linkType,
        linkTypeLabel,
        includesDocumentRequest,
        dealId: data?.dealId ?? null,
        instructionRef: data?.instructionRef ?? null,
      });
      const enquiryIds = Array.from(new Set([String(prospectId), ...collectEnquiryEventIds(enquiry)]));
      try {
        window.dispatchEvent(new CustomEvent('helix:pitch-link-activated', {
          detail: {
            enquiryId: String(prospectId),
            enquiryIds,
            dealId: data?.dealId ?? null,
            instructionRef: data?.instructionRef ?? null,
            passcode,
            instructionsUrl: linkToCopy,
            amount: amountNum,
            includePayment,
            linkType,
            linkTypeLabel,
            includesDocumentRequest,
            serviceDescription: description,
            pitchedBy: enquiry?.Point_of_Contact || 'Hub',
            areaOfWork: enquiry?.Area_of_Work || '',
            createdAt: new Date().toISOString(),
          },
        }));
      } catch { /* event dispatch best-effort */ }
      try {
        window.dispatchEvent(new CustomEvent('refreshInstructionData'));
      } catch { /* event dispatch best-effort */ }
      // Forms Stream visibility: fire and forget.
      void recordProcessEvent({
        formKey: 'pitch-link',
        lane: 'Request',
        summary: includePayment
          ? `${linkTypeLabel} created for £${amountNum.toFixed(2)} + VAT`
          : `${linkTypeLabel} created without payment`,
        eventName: 'pitch-link.created',
        source: 'prospect-hero-header',
        payload: {
          enquiryId: String(prospectId),
          amount: amountNum,
          includePayment,
          linkType,
          linkTypeLabel,
          includesDocumentRequest,
          passcode,
          dealId: data?.dealId ?? null,
          instructionRef: data?.instructionRef ?? null,
        },
        stepStatus: 'success',
      });
      let copiedToClipboard = false;
      try {
        if (navigator?.clipboard?.writeText && linkToCopy) {
          await navigator.clipboard.writeText(linkToCopy);
          copiedToClipboard = true;
        }
      } catch { /* clipboard best-effort */ }
      const copyLine = copiedToClipboard ? 'Link copied to clipboard.' : `Copy link: ${linkToCopy}`;
      showToast({ message: `${linkTypeLabel} ready. ${copyLine} Workbench and timeline updated. Passcode ${passcode}.`, type: 'success' });
      setPitchLinkOpen(false);
      setPitchLinkDescription('');
      setPitchLinkIncludePayment(true);
      setPitchLinkAmount(DEFAULT_PITCH_AMOUNT);
    } catch (err: any) {
      void recordProcessEvent({
        formKey: 'pitch-link',
        lane: 'Escalate',
        summary: 'Client pitch link creation failed',
        eventName: 'pitch-link.create_failed',
        source: 'prospect-hero-header',
        stepStatus: 'failed',
        error: err?.message || 'unknown error',
      });
      showToast({ message: `Could not create client link: ${err?.message || 'unknown error'}`, type: 'error' });
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
  const pitchLinkOpenBackground = isDarkMode ? colours.dark.cardHover : colours.highlightBlue;
  const pitchLinkOpenText = isDarkMode ? colours.dark.text : colours.helixBlue;
  const pitchLinkPopoverSurface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const pitchLinkPopoverBorder = isDarkMode ? colours.highlight : colours.helixBlue;
  const pitchLinkInputSurface = isDarkMode ? colours.dark.cardHover : colours.grey;
  const pitchLinkShadow = isDarkMode ? '0 18px 42px rgba(0, 3, 25, 0.78)' : '0 16px 36px rgba(6, 23, 51, 0.24)';

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
    backgroundColor: 'transparent',
    border: `1px solid ${colours.highlight}`,
    color: colours.highlight,
    flexShrink: 0,
  };

  return (
    <div
      data-helix-region="enquiries/detail/context-strip"
      style={{
        position: 'relative',
        zIndex: pitchLinkOpen ? 20000 : 'auto',
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

        {/* Row 2: action strip. Draft pitch (primary), client link (secondary), Rate plus Share, value right-anchored. */}
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
              <div
                ref={pitchLinkAnchorRef}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  zIndex: pitchLinkOpen ? 20001 : 'auto',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!pitchLinkOpen) updatePitchLinkPopoverPosition();
                    setPitchLinkOpen((v) => !v);
                  }}
                  title="Create a client pitch link with a passcode and instruct URL. No email drafted."
                  style={{
                    ...secondaryActionStyle,
                    backgroundColor: pitchLinkOpen ? pitchLinkOpenBackground : 'transparent',
                    border: `1px solid ${pitchLinkOpen ? pitchLinkPopoverBorder : colours.highlight}`,
                    color: pitchLinkOpen ? pitchLinkOpenText : colours.highlight,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  aria-haspopup="dialog"
                  aria-expanded={pitchLinkOpen}
                >
                  <FaLink size={10} />
                  <span>Create Client Link</span>
                </button>
                {pitchLinkOpen && pitchLinkPopoverPosition && createPortal(
                  <div
                    ref={pitchLinkPopoverRef}
                    role="dialog"
                    aria-label="Create client link"
                    data-helix-region="enquiries/prospect/pitch-link-popover"
                    style={{
                      position: 'fixed',
                      top: pitchLinkPopoverPosition.top,
                      left: pitchLinkPopoverPosition.left,
                      zIndex: 30000,
                      isolation: 'isolate',
                      width: pitchLinkPopoverPosition.width,
                      maxHeight: 'calc(100vh - 32px)',
                      overflowY: 'auto',
                      backgroundColor: pitchLinkPopoverSurface,
                      border: `1px solid ${pitchLinkPopoverBorder}`,
                      boxShadow: pitchLinkShadow,
                      padding: 14,
                      boxSizing: 'border-box',
                      fontFamily: FONT_STACK,
                      borderRadius: 0,
                      opacity: 1,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: textPrimary, letterSpacing: '0.3px' }}>
                        Create Client Link
                      </div>
                      <button
                        type="button"
                        onClick={() => setPitchLinkOpen(false)}
                        aria-label="Close"
                        style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: textMuted, padding: 2 }}
                      >
                        <FaTimes size={11} />
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: textBody, lineHeight: 1.45, marginBottom: 12 }}>
                      Creates a passcode and instruct URL for the client. No email is drafted. Share the copied link directly.
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
                        marginBottom: 14,
                        fontSize: 13,
                        fontFamily: FONT_STACK,
                        backgroundColor: pitchLinkInputSurface,
                        color: textPrimary,
                        border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                        borderRadius: 0,
                        outline: 'none',
                      }}
                    />
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'block', fontSize: 11, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
                        Payment choice
                      </div>
                      <div style={{ display: 'grid', gap: 8 }} role="group" aria-label="Client link payment choice">
                        <div
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: 10,
                            backgroundColor: pitchLinkIncludePayment ? pitchLinkOpenBackground : 'transparent',
                            border: `1px solid ${pitchLinkIncludePayment ? pitchLinkPopoverBorder : (isDarkMode ? colours.dark.borderColor : colours.highlightNeutral)}`,
                            color: textPrimary,
                            borderRadius: 0,
                          }}
                        >
                          <button
                            type="button"
                            aria-pressed={pitchLinkIncludePayment}
                            onClick={() => setPitchLinkIncludePayment(true)}
                            style={{
                              width: '100%',
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 10,
                              alignItems: 'flex-start',
                              padding: 0,
                              border: 'none',
                              background: 'transparent',
                              color: textPrimary,
                              cursor: 'pointer',
                              fontFamily: FONT_STACK,
                              textAlign: 'left',
                            }}
                          >
                            <span>
                              <span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 2 }}>
                                Include Payment
                              </span>
                              <span style={{ display: 'block', fontSize: 11, color: textMuted, lineHeight: 1.4 }}>
                                Preselected. This link asks the client for payment before they instruct.
                              </span>
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 800, color: pitchLinkIncludePayment ? pitchLinkPopoverBorder : textMuted, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                              {pitchLinkIncludePayment ? 'Selected' : 'Default'}
                            </span>
                          </button>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                              alignItems: 'center',
                              gap: 8,
                              marginTop: 10,
                              paddingTop: 10,
                              borderTop: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.16)' : 'rgba(6,23,51,0.12)'}`,
                              opacity: pitchLinkIncludePayment ? 1 : 0.52,
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 700, color: textMuted, whiteSpace: 'nowrap' }}>Fee on link</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: textPrimary }}>£</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={pitchLinkAmount}
                                onChange={(e) => setPitchLinkAmount(e.target.value)}
                                onFocus={() => setPitchLinkIncludePayment(true)}
                                placeholder={DEFAULT_PITCH_AMOUNT}
                                aria-label="Payment amount"
                                style={{
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  padding: '7px 9px',
                                  fontSize: 13,
                                  fontFamily: FONT_STACK,
                                  backgroundColor: pitchLinkInputSurface,
                                  color: textPrimary,
                                  border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
                                  borderRadius: 0,
                                  outline: 'none',
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 800, color: textMuted, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>+ VAT</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-pressed={!pitchLinkIncludePayment}
                          onClick={() => setPitchLinkIncludePayment(false)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: 10,
                            cursor: 'pointer',
                            fontFamily: FONT_STACK,
                            backgroundColor: !pitchLinkIncludePayment ? pitchLinkOpenBackground : 'transparent',
                            border: `1px solid ${!pitchLinkIncludePayment ? pitchLinkPopoverBorder : (isDarkMode ? colours.dark.borderColor : colours.highlightNeutral)}`,
                            color: textPrimary,
                            borderRadius: 0,
                          }}
                        >
                          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                            <span>
                              <span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 2 }}>
                                No Payment
                              </span>
                              <span style={{ display: 'block', fontSize: 11, color: textMuted, lineHeight: 1.4 }}>
                                ID-only link. The client verifies identity and can upload documents without paying now.
                              </span>
                            </span>
                            {!pitchLinkIncludePayment && (
                              <span style={{ fontSize: 10, fontWeight: 800, color: pitchLinkPopoverBorder, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                Selected
                              </span>
                            )}
                          </span>
                        </button>
                      </div>
                    </div>
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
                          backgroundColor: 'transparent',
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
                        onClick={handleCreateClientLinkSubmit}
                        disabled={pitchLinkBusy || !pitchLinkDescription.trim()}
                        style={{
                          padding: '7px 14px',
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.3px',
                          textTransform: 'uppercase',
                          fontFamily: FONT_STACK,
                          backgroundColor: colours.highlight,
                          color: '#ffffff',
                          border: `1px solid ${colours.highlight}`,
                          cursor: pitchLinkBusy || !pitchLinkDescription.trim() ? 'not-allowed' : 'pointer',
                          opacity: pitchLinkBusy || !pitchLinkDescription.trim() ? 0.6 : 1,
                          borderRadius: 0,
                        }}
                      >
                        {pitchLinkBusy ? 'Creating...' : 'Create link'}
                      </button>
                    </div>
                  </div>,
                  document.body
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