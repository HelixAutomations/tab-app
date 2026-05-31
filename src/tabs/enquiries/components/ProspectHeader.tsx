import React, { useRef, useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { Enquiry, UserData } from '../../../app/functionality/types';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';
import { formatValueForDisplay } from './prospectDisplayUtils';
import '../../../app/styles/animations.css';

/**
 * Safe clipboard copy with fallback for Teams context.
 */
async function safeCopyToClipboard(text: string): Promise<boolean> {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(trimmed);
        return true;
      } catch {
        // Fall through to execCommand fallback (Teams/webview restrictions)
      }
    }
    const textarea = document.createElement('textarea');
    textarea.value = trimmed;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  } catch {
    return false;
  }
}

export interface ProspectHeaderProps {
  enquiry: Enquiry;
  userData?: UserData[] | null;
  isLoading?: boolean;
  passcode?: string;
  amount?: string | number;
  initialScopeDescription?: string;
  notes?: string | null;
  onInitialScopeDescriptionChange?: (value: string) => void;
  onAmountChange?: (value: string) => void;
  dealStatus?: 'idle' | 'processing' | 'ready' | 'error';
  dealCreationInProgress?: boolean;
  onCaptureDealForLink?: () => Promise<string | null>;
  showFeeEarnerToggle?: boolean;
  showPasscodeLink?: boolean;
  noAmountMode?: boolean;
  onNoAmountModeChange?: (value: boolean) => void;
}

function formatPounds(value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return '—';
  return `£${num.toLocaleString('en-GB')}`;
}

function normalizeCurrencyToNumber(value: string | number | undefined): number {
  if (value === undefined || value === null) return NaN;
  if (typeof value === 'number') return value;
  const num = parseFloat(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? num : NaN;
}

/**
 * Reusable header component for prospect & enquiry details.
 * Used in both Summary and Pitch Builder tabs.
 */
export const ProspectHeader: React.FC<ProspectHeaderProps> = ({
  enquiry,
  userData,
  isLoading = false,
  passcode,
  amount,
  initialScopeDescription,
  notes,
  onInitialScopeDescriptionChange,
  onAmountChange,
  dealStatus = 'idle',
  dealCreationInProgress = false,
  onCaptureDealForLink,
  showFeeEarnerToggle = false,
  showPasscodeLink = false,
  noAmountMode: noAmountModeProp,
  onNoAmountModeChange,
}) => {
  const { isDarkMode } = useTheme();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPasscodeConfirm, setShowPasscodeConfirm] = useState(false);
  const [passcodeConfirmed, setPasscodeConfirmed] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [notesCopied, setNotesCopied] = useState(false);
  const [whiteboardEnabled, setWhiteboardEnabled] = useState(false);
  const [whiteboardText, setWhiteboardText] = useState('');
  const [whiteboardSplit, setWhiteboardSplit] = useState(0.62);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [internalNoAmountMode, setInternalNoAmountMode] = useState(false);
  const noAmountMode = noAmountModeProp ?? internalNoAmountMode;
  const setNoAmountMode = (v: boolean) => {
    if (noAmountModeProp === undefined) setInternalNoAmountMode(v);
    onNoAmountModeChange?.(v);
  };

  const scopeDescriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const whiteboardContainerRef = useRef<HTMLDivElement>(null);
  const isWhiteboardResizingRef = useRef(false);

  const getScopeValue = () => scopeDescriptionRef.current?.value ?? '';
  const getAmountValue = () => amountRef.current?.value ?? '';

  React.useEffect(() => {
    const next = initialScopeDescription ?? '';
    const input = scopeDescriptionRef.current;
    if (!input) return;
    if (document.activeElement === input) return;
    if (input.value !== next) input.value = next;
  }, [initialScopeDescription]);

  React.useEffect(() => {
    const next = String(amount ?? '');
    const input = amountRef.current;
    if (!input) return;
    if (document.activeElement === input) return;
    if (input.value !== next) input.value = next;
  }, [amount]);

  React.useEffect(() => {
    setHasAnimated(true);
  }, []);

  // Theme — brand 2.0 tokens from colours.ts (mirrors UserBubble depth ladder)
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textSecondary = isDarkMode ? colours.subtleGrey : colours.greyText;
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const borderColor = isDarkMode ? colours.dark.border : colours.highlightNeutral;
  const innerBorder = isDarkMode ? colours.dark.border : colours.highlightNeutral;
  const surfaceBg = isDarkMode ? colours.darkBlue : colours.grey;
  const cardBg = isDarkMode ? colours.websiteBlue : '#ffffff';
  const accent = isDarkMode ? colours.accent : colours.highlight;
  const controlRowBg = isDarkMode ? colours.darkBlue : colours.grey;

  // Prospect data
  const clientName = `${enquiry?.First_Name || ''} ${enquiry?.Last_Name || ''}`.trim() || '—';
  const clientEmail = enquiry?.Email || '';
  const clientPhone = enquiry?.Phone_Number || '';
  const enquiryId = String(enquiry?.ID ?? '—');
  const areaOfWork = enquiry?.Area_of_Work || '—';

  const valueDisplay = (() => {
    const raw = enquiry?.Value;
    if (raw === null || raw === undefined || String(raw).trim() === '') return '—';
    const str = String(raw).trim();

    // Pure numeric (operator-entered exact figure) — keep as formatted pounds.
    if (/^£?\s*\d+(?:[.,]\d+)*\s*$/.test(str)) {
      const num = Number(str.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(num) && !Number.isNaN(num)) return formatPounds(num);
    }

    // Anything else (band strings like "£500k+", "100,001 to 500,000", "Over £500,000",
    // "Non-monetary", "Unsure", etc.) goes through the canonical band formatter so we
    // never strip non-digits and pretend the remainder is the value.
    const compact = formatValueForDisplay(str);
    return compact === '-' ? '—' : compact;
  })();

  // Area of Work colour (canonical mapping)
  const getAreaColor = (area: string): string => {
    switch (area?.toLowerCase()) {
      case 'commercial': return colours.blue;
      case 'construction': return colours.orange;
      case 'property': return colours.green;
      case 'employment': return colours.yellow;
      default: return colours.greyText;
    }
  };
  const areaColor = getAreaColor(areaOfWork);

  // Fee earner data
  const u = userData?.[0];
  const fullName = u?.FullName || `${u?.First ?? ''} ${u?.Last ?? ''}`.trim() || '—';
  const initials = (u?.Initials ?? '').toUpperCase() || '—';
  const role = u?.Role ?? '—';
  const rate = u?.Rate ? `${formatPounds(u.Rate)} + VAT` : '—';

  const handleCopy = async (value: string, field: string) => {
    if (!value || value === '—') return;
    const ok = await safeCopyToClipboard(value);
    if (ok) {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    }
  };

  const tryOpenHref = (href: string) => {
    try {
      window.open(href, href.startsWith('tel:') ? '_self' : '_blank');
    } catch {
      window.location.href = href;
    }
  };

  // Section wrapper — Helix depth-ladder panel with accent left edge
  const Section: React.FC<{
    title: React.ReactNode;
    children: React.ReactNode;
    animationDelay?: number;
    headerRight?: React.ReactNode;
    accentColor?: string;
  }> = ({
    title,
    children,
    animationDelay = 0,
    headerRight,
    accentColor,
  }) => (
    <div style={{
      background: surfaceBg,
      borderLeft: `3px solid ${accentColor || accent}`,
      borderTop: `1px solid ${innerBorder}`,
      borderRight: `1px solid ${innerBorder}`,
      borderBottom: `1px solid ${innerBorder}`,
      borderRadius: 0,
      padding: '10px 14px',
      animation: hasAnimated ? 'none' : `contentReveal 240ms ease-out ${animationDelay}ms both`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: '8px' }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          color: accentColor || accent,
        }}>
          {title}
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );

  const SkeletonBlock: React.FC<{ width: number | string; height: number | string; radius?: number; delay?: number }> = ({
    width,
    height,
    radius = 4,
    delay = 0,
  }) => (
    <div
      className="skeleton-shimmer skeleton-cascade"
      style={{
        width,
        height,
        borderRadius: radius,
        ['--cascade-delay' as any]: `${delay}ms`,
      }}
    />
  );

  const SkeletonRow: React.FC<{ delay?: number }> = ({ delay = 0 }) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 0',
        borderBottom: `1px solid ${innerBorder}`,
        gap: 12,
      }}
    >
      <SkeletonBlock width="35%" height={10} radius={3} delay={delay} />
      <SkeletonBlock width="45%" height={12} radius={3} delay={delay + 40} />
    </div>
  );

  const SkeletonSection: React.FC<{ delayBase?: number; showTags?: boolean; showContact?: boolean }> = ({
    delayBase = 0,
    showTags = false,
    showContact = false,
  }) => (
    <div style={{
      background: surfaceBg,
      border: `1px solid ${innerBorder}`,
      borderRadius: 2,
      padding: '12px 14px',
    }}>
      <div style={{ marginBottom: 10 }}>
        <SkeletonBlock width={90} height={10} radius={3} delay={delayBase} />
      </div>
      <SkeletonRow delay={delayBase + 40} />
      <SkeletonRow delay={delayBase + 120} />
      {showTags && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <SkeletonBlock width={80} height={20} radius={3} delay={delayBase + 180} />
          <SkeletonBlock width={120} height={20} radius={3} delay={delayBase + 240} />
        </div>
      )}
      {showContact && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkeletonBlock width={160} height={10} radius={3} delay={delayBase + 220} />
          <SkeletonBlock width={220} height={12} radius={3} delay={delayBase + 280} />
        </div>
      )}
    </div>
  );

  // Data row
  const DataRow: React.FC<{ label: string; value: string; copyable?: boolean; fieldKey: string }> = ({
    label, value, copyable, fieldKey
  }) => {
    const isCopied = copiedField === fieldKey;
    const canCopy = copyable && value !== '—';

    return (
      <div
        onClick={canCopy ? () => handleCopy(value, fieldKey) : undefined}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 0',
          borderBottom: `1px solid ${innerBorder}`,
          cursor: canCopy ? 'pointer' : 'default',
        }}
      >
        <span style={{ fontSize: '12px', color: textSecondary, fontWeight: 500 }}>
          {label}
        </span>
        <span style={{
          fontSize: '13px',
          fontWeight: 600,
          color: isCopied ? colours.green : textPrimary,
          transition: 'color 0.15s',
        }}>
          {isCopied ? '✓ Copied' : value}
        </span>
      </div>
    );
  };

  const instructionsBaseUrl = String(process.env.REACT_APP_INSTRUCTIONS_URL || 'https://instruct.helix-law.com').replace(/\/$/, '');
  const passcodeLinkHref = passcode ? `${instructionsBaseUrl}/pitch/${encodeURIComponent(String(passcode))}` : '';
  const isDealLinkReady = dealStatus === 'ready';
  const numericAmount = normalizeCurrencyToNumber(amount);
  const hasRequiredDealInfo = Boolean(initialScopeDescription && initialScopeDescription.trim()) && (noAmountMode || (Number.isFinite(numericAmount) && numericAmount > 0));
  const canAttemptCapture = Boolean(onCaptureDealForLink) && hasRequiredDealInfo && passcodeConfirmed && !dealCreationInProgress;

  const canEditDealDetailsHere = Boolean(onInitialScopeDescriptionChange || onAmountChange);

  const handleCopyLink = async () => {
    if (!isDealLinkReady || !passcodeLinkHref) return;
    const ok = await safeCopyToClipboard(passcodeLinkHref);
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    }
  };

  const notesDisplay = (notes ?? '').trim();
  const shouldTruncateNotes = notesDisplay.length > 260;
  const notesPreview = shouldTruncateNotes ? `${notesDisplay.slice(0, 260)}…` : notesDisplay;

  const handleCopyNotes = async () => {
    if (!notesDisplay) return;
    const ok = await safeCopyToClipboard(notesDisplay);
    if (ok) {
      setNotesCopied(true);
      setTimeout(() => setNotesCopied(false), 1500);
    }
  };

  const handleWhiteboardResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    isWhiteboardResizingRef.current = true;

    const handleMove = (moveEvent: MouseEvent) => {
      if (!isWhiteboardResizingRef.current) return;
      const container = whiteboardContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const raw = (moveEvent.clientX - rect.left) / rect.width;
      const clamped = Math.min(0.78, Math.max(0.32, raw));
      setWhiteboardSplit(clamped);
    };

    const handleUp = () => {
      isWhiteboardResizingRef.current = false;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const handleCreateDealAndEnableLink = async () => {
    if (!onCaptureDealForLink) return;
    if (!canAttemptCapture) return;

    // Sync local values to parent before capture (in case blur hasn't fired)
    if (onInitialScopeDescriptionChange) onInitialScopeDescriptionChange(getScopeValue());
    if (onAmountChange) onAmountChange(getAmountValue());

    const resultPasscode = await onCaptureDealForLink();
    if (resultPasscode) {
      setShowPasscodeConfirm(false);
      setPasscodeConfirmed(false);
    }
  };

  function PasscodeLinkRow(): JSX.Element | null {
    if (passcode === undefined) return null;

    const maskText = `${instructionsBaseUrl.replace(/^https?:\/\//, '')}/pitch/•••••`;

    // Brand 2.0 row tokens (UserBubble system)
    const rowBg = isDarkMode
      ? `linear-gradient(90deg, rgba(54, 144, 206, 0.10) 0%, rgba(54, 144, 206, 0.00) 42%), ${controlRowBg}`
      : controlRowBg;
    const rowHoverBg = isDarkMode
      ? `linear-gradient(90deg, rgba(54, 144, 206, 0.18) 0%, rgba(54, 144, 206, 0.00) 50%), ${colours.helixBlue}`
      : colours.light.cardHover;
    const rowShadow = isDarkMode ? 'inset 0 0 0 1px rgba(54, 144, 206, 0.05)' : 'none';
    const rowHoverShadow = isDarkMode ? '0 8px 18px rgba(0, 3, 25, 0.42)' : '0 4px 12px rgba(6, 23, 51, 0.08)';
    const panelBg = isDarkMode ? colours.darkBlue : colours.grey;
    const panelBorder = isDarkMode ? colours.dark.border : colours.highlightNeutral;
    const inputBg = isDarkMode ? colours.dark.cardBackground : '#FFFFFF';
    const inputBorder = isDarkMode ? colours.dark.border : colours.highlightNeutral;
    const errorColour = colours.cta;

    // Text tokens — aligned to the UserBubble system (no invented hex values)
    const helpText = isDarkMode ? colours.subtleGrey : colours.greyText; // tertiary guidance
    const labelText = isDarkMode ? colours.dark.text : colours.light.text; // bright headings

    return (
      <div style={{ padding: '2px 0' }}>

          {isDealLinkReady && passcodeLinkHref ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, paddingBottom: 6 }}>
              <a
                href={passcodeLinkHref}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: accent,
                  textDecoration: 'none',
                  maxWidth: 260,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  letterSpacing: '-0.2px',
                }}
                title={passcodeLinkHref}
              >
                {passcodeLinkHref.replace(/^https?:\/\//, '')}
              </a>
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={!isDealLinkReady}
                title={linkCopied ? 'Copied' : 'Copy link'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: 2,
                  border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.12)' : borderColor}`,
                  background: linkCopied
                    ? `rgba(32, 178, 108, 0.12)`
                    : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon
                  iconName={linkCopied ? 'CompletedSolid' : 'Copy'}
                  styles={{ root: { fontSize: 12, color: linkCopied ? colours.green : helpText } }}
                />
              </button>
            </div>
          ) : null}

        {/* Phase A2: dead link-activation toggle JSX removed. */}
      </div>
    );
  }

  // Contact chip — standardised row: icon + text + copy button
  const ContactChip: React.FC<{
    icon: string;
    value: string;
    fieldKey: string;
    href: string;
    label: string;
  }> = ({ icon, value, fieldKey, href, label }) => {
    const isCopied = copiedField === fieldKey;
    const chipBg = isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.04)';
    const chipBorder = isDarkMode ? 'rgba(54, 144, 206, 0.14)' : 'rgba(54, 144, 206, 0.10)';
    const copiedBg = isDarkMode ? 'rgba(32, 178, 108, 0.10)' : 'rgba(32, 178, 108, 0.06)';
    const copiedBorder = isDarkMode ? 'rgba(32, 178, 108, 0.35)' : 'rgba(32, 178, 108, 0.25)';

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 8px',
          background: isCopied ? copiedBg : chipBg,
          border: `1px solid ${isCopied ? copiedBorder : chipBorder}`,
          borderRadius: 0,
          transition: 'background 160ms ease, border-color 160ms ease',
        }}
      >
        <Icon iconName={icon} styles={{ root: { fontSize: 11, color: textSecondary, flexShrink: 0 } }} />
        <span
          onClick={(e) => { e.stopPropagation(); tryOpenHref(href); }}
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: textPrimary,
            cursor: 'pointer',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 220,
            flex: 1,
          }}
          title={label}
        >
          {value}
        </span>
        <div
          onClick={(e) => { e.stopPropagation(); void handleCopy(value, fieldKey); }}
          style={{
            width: 18,
            height: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 0,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'transform 160ms ease',
          }}
          title={isCopied ? 'Copied' : `Copy ${label.toLowerCase()}`}
        >
          <Icon
            iconName={isCopied ? 'CompletedSolid' : 'Copy'}
            styles={{
              root: {
                fontSize: 10,
                color: isCopied ? colours.green : textSecondary,
                transform: isCopied ? 'scale(1.1)' : 'scale(1)',
                transition: 'transform 160ms ease, color 160ms ease',
              },
            }}
          />
        </div>
      </div>
    );
  };

  const ContactInline: React.FC = () => {
    if (!clientEmail && !clientPhone) return null;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 }}>
        {clientEmail && (
          <ContactChip
            icon="Mail"
            value={clientEmail}
            fieldKey="email"
            href={`mailto:${encodeURIComponent(clientEmail)}`}
            label="Email"
          />
        )}
        {clientPhone && (
          <ContactChip
            icon="Phone"
            value={clientPhone}
            fieldKey="phone"
            href={`tel:${clientPhone.replace(/\s+/g, '')}`}
            label="Phone"
          />
        )}
      </div>
    );
  };



  return (
    <div
      style={{
        background: cardBg,
        border: 'none',
        borderTop: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        borderRadius: 0,
        boxShadow: 'none',
        width: '100%',
      }}
    >
      <div style={{
        padding: '16px 16px 16px',
        animation: hasAnimated ? 'none' : 'contentReveal 220ms ease-out both'
      }}>
        {isLoading ? (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '14px',
              animation: hasAnimated ? 'none' : 'contentReveal 220ms ease-out 40ms both',
            }}>
              <SkeletonBlock width={3} height={16} radius={0} delay={20} />
              <div style={{ marginLeft: 8 }}>
                <SkeletonBlock width={140} height={12} radius={3} delay={60} />
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '14px',
              animation: hasAnimated ? 'none' : 'contentReveal 220ms ease-out 90ms both',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <SkeletonSection delayBase={80} showTags showContact />
                <SkeletonSection delayBase={200} />
              </div>
              <SkeletonSection delayBase={160} />
            </div>
          </>
        ) : (
          <>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '14px',
              animation: hasAnimated ? 'none' : 'contentReveal 220ms ease-out 40ms both',
            }}>
              <div style={{
                width: '3px',
                height: '16px',
                background: accent,
                borderRadius: 0,
              }} />
              <span style={{
                fontSize: '13px',
                fontWeight: 700,
                color: textPrimary,
                letterSpacing: '0.3px',
                marginLeft: '8px',
              }}>
                Prospect & Enquiry
              </span>
            </div>

            {/* Content */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: (showFeeEarnerToggle || showPasscodeLink) ? 'repeat(2, 1fr)' : '1fr',
              gap: '14px',
              animation: hasAnimated ? 'none' : 'contentReveal 220ms ease-out 90ms both',
            }}>
              {/* Left - Prospect + Contact */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Section title="Prospect" animationDelay={120}>
                  <DataRow label="Name" value={clientName} copyable fieldKey="name" />
                  <DataRow label="ID" value={enquiryId} copyable fieldKey="id" />
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    columnGap: 18,
                    rowGap: 0,
                  }}>
                    {/* Area */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      minWidth: 0,
                      padding: '6px 0',
                      borderBottom: `1px solid ${innerBorder}`,
                    }}>
                      <span style={{ fontSize: 12, color: textSecondary, fontWeight: 500 }}>Area</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: textPrimary }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: areaColor, flexShrink: 0 }} />
                        {areaOfWork}
                      </span>
                    </div>
                    {/* Value */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      minWidth: 0,
                      padding: '6px 0',
                      borderBottom: `1px solid ${innerBorder}`,
                    }}>
                      <span style={{ fontSize: 12, color: textSecondary, fontWeight: 500 }}>Value</span>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: textPrimary }}>{valueDisplay}</span>
                    </div>
                  </div>
                  {(clientEmail || clientPhone) && (
                    <>
                      <div style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.6px',
                        color: accent,
                        marginBottom: '6px',
                        marginTop: '2px',
                      }}>
                        Contact
                      </div>
                      <ContactInline />
                    </>
                  )}
                </Section>
              </div>

              {/* Right - Fee Earner (preferred) or Passcode Link */}
              {showFeeEarnerToggle && (fullName !== '—' || initials !== '—') ? (
                <Section title="Fee Earner" animationDelay={160} accentColor={isDarkMode ? colours.subtleGrey : colours.greyText}>
                  <DataRow label="Name" value={fullName} fieldKey="fe-name" />
                  <DataRow label="Initials" value={initials} fieldKey="fe-initials" />
                  <DataRow label="Role" value={role} fieldKey="fe-role" />
                  <DataRow label="Rate" value={rate} fieldKey="fe-rate" />
                </Section>
              ) : showPasscodeLink ? (
                <Section title="Passcode Link" animationDelay={160} accentColor={isDealLinkReady ? colours.green : accent}>
                  {PasscodeLinkRow()}
                </Section>
              ) : null}
            </div>

            {notesDisplay && (
              <div
                style={{
                  marginTop: 14,
                  background: surfaceBg,
                  borderLeft: `3px solid ${isDarkMode ? colours.subtleGrey : colours.greyText}`,
                  borderTop: `1px solid ${innerBorder}`,
                  borderRight: `1px solid ${innerBorder}`,
                  borderBottom: `1px solid ${innerBorder}`,
                  borderRadius: 0,
                  padding: '10px 14px',
                  animation: hasAnimated ? 'none' : 'contentReveal 220ms ease-out 200ms both',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.6px',
                      textTransform: 'uppercase',
                      color: textMuted,
                    }}
                  >
                    <Icon iconName="QuickNote" styles={{ root: { fontSize: 11, color: textMuted } }} />
                    Notes
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {shouldTruncateNotes && (
                      <button
                        type="button"
                        onClick={() => setNotesExpanded((v) => !v)}
                        title={notesExpanded ? 'Show less' : 'Show full note'}
                        aria-label={notesExpanded ? 'Show less' : 'Show full note'}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '4px 6px',
                          cursor: 'pointer',
                          color: textMuted,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.4px',
                          textTransform: 'uppercase',
                          transition: 'color 160ms ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = accent; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = textMuted; }}
                      >
                        <Icon iconName={notesExpanded ? 'Hide3' : 'View'} styles={{ root: { fontSize: 12 } }} />
                        {notesExpanded ? 'Less' : 'More'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCopyNotes}
                      title={notesCopied ? 'Copied' : 'Copy notes'}
                      aria-label={notesCopied ? 'Copied' : 'Copy notes'}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: '4px 6px',
                        cursor: 'pointer',
                        color: notesCopied ? colours.green : textMuted,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.4px',
                        textTransform: 'uppercase',
                        transition: 'color 160ms ease',
                      }}
                      onMouseEnter={(e) => { if (!notesCopied) e.currentTarget.style.color = accent; }}
                      onMouseLeave={(e) => { if (!notesCopied) e.currentTarget.style.color = textMuted; }}
                    >
                      <Icon iconName={notesCopied ? 'CheckMark' : 'Copy'} styles={{ root: { fontSize: 12 } }} />
                      {notesCopied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWhiteboardEnabled((v) => !v)}
                      title={whiteboardEnabled ? 'Hide whiteboard' : 'Open temporary whiteboard'}
                      aria-pressed={whiteboardEnabled}
                      style={{
                        background: whiteboardEnabled
                          ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.10)')
                          : 'transparent',
                        border: `1px solid ${whiteboardEnabled ? accent : innerBorder}`,
                        padding: '3px 8px',
                        cursor: 'pointer',
                        color: whiteboardEnabled ? accent : textMuted,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        transition: 'color 160ms ease, border-color 160ms ease, background 160ms ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!whiteboardEnabled) {
                          e.currentTarget.style.color = accent;
                          e.currentTarget.style.borderColor = accent;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!whiteboardEnabled) {
                          e.currentTarget.style.color = textMuted;
                          e.currentTarget.style.borderColor = innerBorder;
                        }
                      }}
                    >
                      <Icon iconName="EditNote" styles={{ root: { fontSize: 12 } }} />
                      Whiteboard
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 12.5,
                    color: textSecondary,
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {notesExpanded ? notesDisplay : notesPreview}
                </div>

                {whiteboardEnabled && (
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop: `1px dashed ${innerBorder}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.6px',
                          textTransform: 'uppercase',
                          color: accent,
                        }}
                      >
                        <Icon iconName="EditNote" styles={{ root: { fontSize: 11, color: accent } }} />
                        Whiteboard
                      </div>
                      <span style={{ fontSize: 10, color: textMuted, letterSpacing: '0.3px' }}>
                        Session only. Not saved.
                      </span>
                    </div>
                    <textarea
                      value={whiteboardText}
                      onChange={(event) => setWhiteboardText(event.target.value)}
                      placeholder="Jot down temporary call notes…"
                      style={{
                        width: '100%',
                        minHeight: 96,
                        resize: 'vertical',
                        padding: '8px 10px',
                        borderRadius: 0,
                        border: `1px solid ${innerBorder}`,
                        background: cardBg,
                        color: textPrimary,
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        fontFamily: 'inherit',
                        outline: 'none',
                        transition: 'border-color 160ms ease, box-shadow 160ms ease',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = accent;
                        e.currentTarget.style.boxShadow = `0 0 0 1px ${accent}33`;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = innerBorder;
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProspectHeader;
