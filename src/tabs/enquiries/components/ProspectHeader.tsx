import React, { useRef, useState } from 'react';
import { Icon } from '@fluentui/react';
import { Enquiry, UserData } from '../../../app/functionality/types';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';
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
  linkActivationMode?: 'pitch' | 'manual';
  onLinkActivationModeChange?: (mode: 'pitch' | 'manual') => void;
  onInitialScopeDescriptionChange?: (value: string) => void;
  onAmountChange?: (value: string) => void;
  dealStatus?: 'idle' | 'processing' | 'ready' | 'error';
  dealCreationInProgress?: boolean;
  onCaptureDealForLink?: () => Promise<string | null>;
  showFeeEarnerToggle?: boolean;
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
  linkActivationMode: linkActivationModeProp,
  onLinkActivationModeChange,
  onInitialScopeDescriptionChange,
  onAmountChange,
  dealStatus = 'idle',
  dealCreationInProgress = false,
  onCaptureDealForLink,
  showFeeEarnerToggle = false,
  noAmountMode: noAmountModeProp,
  onNoAmountModeChange,
}) => {
  const { isDarkMode } = useTheme();
  const [showPrefill, setShowPrefill] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPasscodeConfirm, setShowPasscodeConfirm] = useState(false);
  const [passcodeConfirmed, setPasscodeConfirmed] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [internalLinkActivationMode, setInternalLinkActivationMode] = useState<'pitch' | 'manual'>('pitch');
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

  const linkActivationMode = linkActivationModeProp ?? internalLinkActivationMode;
  const setLinkActivationMode = (mode: 'pitch' | 'manual') => {
    if (linkActivationModeProp === undefined) {
      setInternalLinkActivationMode(mode);
    }
    onLinkActivationModeChange?.(mode);
  };

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
    if (!raw) return '—';
    const str = String(raw).trim();
    if (str.toLowerCase().includes(' to ') || (str.match(/£/g) || []).length > 1) return str;
    const num = Number(str.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(num) || Number.isNaN(num)) return str;
    return formatPounds(num);
  })();

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

  // Section wrapper
  const Section: React.FC<{
    title: React.ReactNode;
    children: React.ReactNode;
    animationDelay?: number;
    headerRight?: React.ReactNode;
  }> = ({
    title,
    children,
    animationDelay = 0,
    headerRight,
  }) => (
    <div style={{
      background: surfaceBg,
      border: `1px solid ${innerBorder}`,
      borderRadius: 2,
      padding: '12px 14px',
      animation: hasAnimated ? 'none' : `contentReveal 240ms ease-out ${animationDelay}ms both`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: '10px' }}>
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: textMuted,
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
      <div style={{ padding: '6px 0', borderBottom: `1px solid ${innerBorder}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Passcode link
          </span>

          {isDealLinkReady && passcodeLinkHref ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
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
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: helpText,
                  opacity: 0.55,
                  userSelect: 'none',
                  letterSpacing: '-0.2px',
                }}
                title="This link is disabled until a Deal is captured"
              >
                {maskText}
              </span>

              <button
                type="button"
                onClick={() => setShowPasscodeConfirm((v) => !v)}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '5px 12px',
                  borderRadius: 2,
                  border: `1px solid ${showPasscodeConfirm ? (isDarkMode ? 'rgba(54, 144, 206, 0.28)' : colours.highlightNeutral) : (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : colours.highlightNeutral)}`,
                  background: showPasscodeConfirm ? rowBg : 'transparent',
                  color: showPasscodeConfirm ? accent : helpText,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  transition: 'all 0.15s ease',
                }}
                title="Enable a working link (captures Deal)"
              >
                {showPasscodeConfirm ? 'Hide' : 'Generate'}
              </button>
            </div>
          )}
        </div>

        {!isDealLinkReady && showPasscodeConfirm && (
          <div
            style={{
              marginTop: 10,
              padding: '16px 18px',
              border: `1px solid ${panelBorder}`,
              background: panelBg,
              borderRadius: 2,
              position: 'relative',
            }}
          >
            {/* Subtle top line — brand blue only, no teal */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 1,
              background: isDarkMode
                ? 'linear-gradient(90deg, transparent 0%, rgba(54, 144, 206, 0.25) 30%, rgba(54, 144, 206, 0.15) 50%, rgba(54, 144, 206, 0.25) 70%, transparent 100%)'
                : `linear-gradient(90deg, transparent 0%, ${colours.highlight}30 30%, ${colours.highlight}12 50%, ${colours.highlight}30 70%, transparent 100%)`,
              borderRadius: '2px 2px 0 0',
            }} />

            {/* Title — sectionTitle style (textMuted, 10px, uppercase) per UserBubble */}
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              color: textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
              Activate passcode link
            </div>

            <div style={{ fontSize: 13, color: textSecondary, lineHeight: 1.55, marginBottom: 16 }}>
              The link becomes available after a pitch is sent.
              You can also manually activate it now for use outside the pitch flow.
            </div>

            {/* Mode selection — custom radio rows with icons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {[
                {
                  value: 'pitch' as const,
                  label: 'Proceed with pitch below',
                  sublabel: 'The link activates once the pitch is sent from the editor below.',
                  icon: (colour: string) => (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colour} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  ),
                },
                {
                  value: 'manual' as const,
                  label: 'Manually activate now',
                  sublabel: 'Enable the link immediately for use outside the pitch/send flow.',
                  icon: (colour: string) => (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={colour} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                  ),
                },
              ].map((opt) => {
                const isActive = linkActivationMode === opt.value;
                const iconColour = isActive ? accent : helpText;
                return (
                  <div
                    key={opt.value}
                    onClick={() => setLinkActivationMode(opt.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '12px 14px',
                      background: isActive ? rowBg : 'transparent',
                      border: `1px solid ${isActive ? (isDarkMode ? 'rgba(54, 144, 206, 0.28)' : colours.highlightNeutral) : (isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(148, 163, 184, 0.12)')}`,
                      borderRadius: 2,
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      transform: 'translateY(0)',
                      boxShadow: isActive ? rowShadow : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = rowHoverBg;
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.18)' : colours.highlightNeutral;
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = rowHoverShadow;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(148, 163, 184, 0.12)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    {/* Icon cue */}
                    <div style={{ flexShrink: 0, marginTop: 1 }}>
                      {opt.icon(iconColour)}
                    </div>
                    {/* Custom radio indicator */}
                    <div style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: `2px solid ${isActive ? accent : (isDarkMode ? colours.dark.borderColor : colours.highlightNeutral)}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                      transition: 'border-color 0.15s ease',
                    }}>
                      {isActive && (
                        <div style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: accent,
                        }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: isActive ? labelText : textSecondary, fontWeight: 600, lineHeight: 1.35 }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: 12, color: helpText, marginTop: 3, lineHeight: 1.45 }}>
                        {opt.sublabel}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {linkActivationMode === 'pitch' && (
              <div style={{
                fontSize: 13,
                color: textSecondary,
                lineHeight: 1.5,
                padding: '12px 14px',
                background: isDarkMode ? 'rgba(54, 144, 206, 0.04)' : 'rgba(54, 144, 206, 0.03)',
                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)'}`,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={helpText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                Continue with the pitch below to activate the link when you send.
              </div>
            )}

            {linkActivationMode === 'manual' && (
              <>
                {/* Deal details section */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    Deal details
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Service description */}
                    <div>
                      <div style={{ fontSize: 12, color: textSecondary, fontWeight: 600, marginBottom: 5, letterSpacing: '0.2px' }}>
                        Service description <span style={{ color: errorColour }}>*</span>
                      </div>
                      {onInitialScopeDescriptionChange ? (
                        <input
                          type="text"
                          ref={scopeDescriptionRef}
                          defaultValue={initialScopeDescription ?? ''}
                          placeholder="Add a short scope & quote description"
                          onBlur={() => onInitialScopeDescriptionChange(getScopeValue())}
                          style={{
                            width: '100%',
                            fontSize: 13,
                            padding: '9px 12px',
                            borderRadius: 2,
                            border: `1px solid ${inputBorder}`,
                            background: inputBg,
                            color: labelText,
                            outline: 'none',
                            transition: 'border-color 0.15s ease',
                            fontWeight: 500,
                          }}
                          onFocus={(e) => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.35)' : colours.highlight; }}
                          onBlurCapture={(e) => { e.currentTarget.style.borderColor = isDarkMode ? colours.dark.border : colours.highlightNeutral; }}
                        />
                      ) : (
                        <div style={{ fontSize: 13, color: labelText, fontWeight: 650 }}>
                          {initialScopeDescription?.trim() ? initialScopeDescription.trim() : '—'}
                        </div>
                      )}
                    </div>

                    {/* Amount */}
                    <div>
                      <div style={{ fontSize: 12, color: textSecondary, fontWeight: 600, marginBottom: 5, letterSpacing: '0.2px' }}>
                        Amount {!noAmountMode && <span style={{ color: errorColour }}>*</span>}
                      </div>
                      {onAmountChange ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          ref={amountRef}
                          defaultValue={String(amount ?? '')}
                          placeholder={noAmountMode ? '0' : '1500'}
                          disabled={noAmountMode}
                          onBlur={() => onAmountChange(getAmountValue())}
                          style={{
                            width: '100%',
                            fontSize: 13,
                            padding: '9px 12px',
                            borderRadius: 2,
                            border: `1px solid ${inputBorder}`,
                            background: noAmountMode ? (isDarkMode ? colours.dark.background : colours.grey) : inputBg,
                            color: noAmountMode ? helpText : labelText,
                            outline: 'none',
                            opacity: noAmountMode ? 0.5 : 1,
                            transition: 'border-color 0.15s ease, opacity 0.15s ease',
                            fontWeight: 500,
                          }}
                          onFocus={(e) => { if (!noAmountMode) e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.35)' : colours.highlight; }}
                          onBlurCapture={(e) => { e.currentTarget.style.borderColor = isDarkMode ? colours.dark.border : colours.highlightNeutral; }}
                        />
                      ) : (
                        <div style={{ fontSize: 13, color: labelText, fontWeight: 650 }}>
                          {noAmountMode ? '£0 (ID only)' : (Number.isFinite(numericAmount) && numericAmount > 0 ? formatPounds(numericAmount) : '—')}
                        </div>
                      )}
                    </div>
                  </div>

                  {canEditDealDetailsHere && (
                    <div style={{ fontSize: 11, color: helpText, marginTop: 8, fontStyle: 'italic' }}>
                      Manual activation uses these details only.
                    </div>
                  )}
                </div>

                {/* Toggle options — custom switches with icons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {/* No amount toggle */}
                  <div
                    onClick={() => setNoAmountMode(!noAmountMode)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: rowBg,
                      border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.12)' : colours.highlightNeutral}`,
                      borderRadius: 2,
                      cursor: 'pointer',
                      boxShadow: rowShadow,
                      transform: 'translateY(0)',
                      transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
                      e.currentTarget.style.background = rowHoverBg;
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = rowHoverShadow;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.12)' : colours.highlightNeutral;
                      e.currentTarget.style.background = rowBg;
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = rowShadow;
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* ID card icon */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={noAmountMode ? accent : helpText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="6" y1="10" x2="6.01" y2="10"/><line x1="6" y1="14" x2="6.01" y2="14"/><line x1="10" y1="10" x2="18" y2="10"/><line x1="10" y1="14" x2="14" y2="14"/>
                      </svg>
                      <div>
                        <div style={{ fontSize: 13, color: labelText, fontWeight: 600 }}>No amount</div>
                        <div style={{ fontSize: 12, color: helpText, marginTop: 2 }}>ID verification only — skip payment</div>
                      </div>
                    </div>
                    {/* Toggle switch */}
                    <div style={{
                      width: 40,
                      height: 20,
                      background: noAmountMode ? colours.blue : (isDarkMode ? colours.dark.borderColor : colours.highlightNeutral),
                      borderRadius: 2,
                      position: 'relative',
                      transition: 'all 0.2s ease',
                      flexShrink: 0,
                    }}>
                      <div style={{
                        width: 16,
                        height: 16,
                        background: '#fff',
                        borderRadius: 1,
                        position: 'absolute',
                        top: 2,
                        left: noAmountMode ? 22 : 2,
                        transition: 'all 0.2s ease',
                        boxShadow: isDarkMode ? '0 1px 2px rgba(0, 3, 25, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.04)',
                      }} />
                    </div>
                  </div>

                  {/* Confirm toggle */}
                  <div
                    onClick={() => setPasscodeConfirmed(!passcodeConfirmed)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: rowBg,
                      border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.12)' : colours.highlightNeutral}`,
                      borderRadius: 2,
                      cursor: 'pointer',
                      boxShadow: rowShadow,
                      transform: 'translateY(0)',
                      transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
                      e.currentTarget.style.background = rowHoverBg;
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = rowHoverShadow;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.12)' : colours.highlightNeutral;
                      e.currentTarget.style.background = rowBg;
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = rowShadow;
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      {/* Shield check icon */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={passcodeConfirmed ? colours.green : helpText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>
                      </svg>
                      <div>
                        <div style={{ fontSize: 13, color: labelText, fontWeight: 600, lineHeight: 1.35 }}>
                          {noAmountMode ? 'Confirm details' : 'Confirm amount & details'}
                        </div>
                        <div style={{ fontSize: 12, color: helpText, marginTop: 2, lineHeight: 1.45 }}>
                          {noAmountMode
                            ? 'Service description is correct. No payment will be collected.'
                            : 'The amount and service description are correct.'}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      width: 40,
                      height: 20,
                      background: passcodeConfirmed ? colours.green : (isDarkMode ? colours.dark.borderColor : colours.highlightNeutral),
                      borderRadius: 2,
                      position: 'relative',
                      transition: 'all 0.2s ease',
                      flexShrink: 0,
                    }}>
                      <div style={{
                        width: 16,
                        height: 16,
                        background: '#fff',
                        borderRadius: 1,
                        position: 'absolute',
                        top: 2,
                        left: passcodeConfirmed ? 22 : 2,
                        transition: 'all 0.2s ease',
                        boxShadow: isDarkMode ? '0 1px 2px rgba(0, 3, 25, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.04)',
                      }} />
                    </div>
                  </div>
                </div>

                {/* Validation message */}
                {!hasRequiredDealInfo && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    marginBottom: 12,
                    background: isDarkMode ? 'rgba(214, 85, 65, 0.10)' : 'rgba(214, 85, 65, 0.06)',
                    border: `1px solid ${isDarkMode ? 'rgba(214, 85, 65, 0.30)' : 'rgba(214, 85, 65, 0.20)'}`,
                    borderRadius: 2,
                    fontSize: 12,
                    fontWeight: 600,
                    color: errorColour,
                    lineHeight: 1.4,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    {noAmountMode
                      ? 'Add a Service Description before enabling this link.'
                      : 'Add a Service Description and a positive Amount before enabling this link.'}
                  </div>
                )}

                {/* Action button — brand 2.0 primary action */}
                <button
                  type="button"
                  onClick={handleCreateDealAndEnableLink}
                  disabled={!canAttemptCapture}
                  style={{
                    width: '100%',
                    fontSize: 13,
                    fontWeight: 700,
                    padding: '12px 14px',
                    borderRadius: 2,
                    border: `1px solid ${canAttemptCapture ? (isDarkMode ? 'rgba(54, 144, 206, 0.28)' : colours.highlightNeutral) : (isDarkMode ? 'rgba(54, 144, 206, 0.08)' : colours.highlightNeutral)}`,
                    background: canAttemptCapture
                      ? (isDarkMode
                        ? `linear-gradient(90deg, rgba(54, 144, 206, 0.18) 0%, rgba(54, 144, 206, 0.00) 50%), ${colours.darkBlue}`
                        : colours.grey)
                      : 'transparent',
                    color: canAttemptCapture ? (isDarkMode ? colours.accent : colours.highlight) : helpText,
                    cursor: canAttemptCapture ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    boxShadow: canAttemptCapture ? rowShadow : 'none',
                    transform: 'translateY(0)',
                    transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease',
                    letterSpacing: '0.3px',
                  }}
                  onMouseEnter={(e) => {
                    if (canAttemptCapture) {
                      e.currentTarget.style.background = rowHoverBg;
                      e.currentTarget.style.borderColor = isDarkMode ? colours.dark.borderColor : colours.highlightNeutral;
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = rowHoverShadow;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (canAttemptCapture) {
                      e.currentTarget.style.background = isDarkMode
                        ? `linear-gradient(90deg, rgba(54, 144, 206, 0.18) 0%, rgba(54, 144, 206, 0.00) 50%), ${colours.darkBlue}`
                        : colours.grey;
                      e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.28)' : colours.highlightNeutral;
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = rowShadow;
                    }
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  {dealCreationInProgress || dealStatus === 'processing' ? 'Creating deal…' : 'Create deal & enable link'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  const ContactInline: React.FC = () => {
    if (!clientEmail && !clientPhone) return null;

    const buttonBase: React.CSSProperties = {
      width: 18,
      height: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 2,
      background: isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)',
      border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.18)' : 'rgba(54, 144, 206, 0.14)'}`,
      cursor: 'pointer',
      flex: '0 0 auto',
      transition: 'transform 160ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease',
    };

    const copiedStyle: React.CSSProperties = {
      background: isDarkMode ? 'rgba(32, 178, 108, 0.16)' : 'rgba(32, 178, 108, 0.12)',
      border: `1px solid ${isDarkMode ? 'rgba(32, 178, 108, 0.5)' : 'rgba(32, 178, 108, 0.38)'}`,
      boxShadow: isDarkMode
        ? '0 0 0 1px rgba(32, 178, 108, 0.15)'
        : '0 0 0 1px rgba(32, 178, 108, 0.12)',
      transform: 'scale(1.06)',
    };

    const itemText: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      cursor: 'pointer',
      color: textPrimary,
      fontSize: 12,
      fontWeight: 500,
      maxWidth: 300,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    };

    const isEmailCopied = copiedField === 'email';
    const isPhoneCopied = copiedField === 'phone';
    const getButtonStyle = (isCopied: boolean): React.CSSProperties =>
      (isCopied ? { ...buttonBase, ...copiedStyle } : buttonBase);

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {clientEmail && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={itemText}
              onClick={(e) => {
                e.stopPropagation();
                tryOpenHref(`mailto:${encodeURIComponent(clientEmail)}`);
              }}
              title="Email"
            >
              <Icon iconName="Mail" styles={{ root: { fontSize: 12, color: textSecondary } }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clientEmail}</span>
            </div>
            <div
              style={getButtonStyle(isEmailCopied)}
              onClick={(e) => {
                e.stopPropagation();
                void handleCopy(clientEmail, 'email');
              }}
              title={isEmailCopied ? 'Copied' : 'Copy email'}
            >
              <Icon
                iconName={isEmailCopied ? 'CompletedSolid' : 'Copy'}
                styles={{
                  root: {
                    fontSize: 11,
                    color: isEmailCopied ? colours.green : textSecondary,
                    transform: isEmailCopied ? 'scale(1.05)' : 'scale(1)',
                    transition: 'transform 160ms ease, color 160ms ease',
                  },
                }}
              />
            </div>
          </div>
        )}

        {clientEmail && clientPhone && (
          <span style={{ fontSize: 12, color: textSecondary, opacity: 0.6 }}>·</span>
        )}

        {clientPhone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={itemText}
              onClick={(e) => {
                e.stopPropagation();
                const tel = clientPhone.replace(/\s+/g, '');
                tryOpenHref(`tel:${tel}`);
              }}
              title="Call"
            >
              <Icon iconName="Phone" styles={{ root: { fontSize: 12, color: textSecondary } }} />
              <span>{clientPhone}</span>
            </div>
            <div
              style={getButtonStyle(isPhoneCopied)}
              onClick={(e) => {
                e.stopPropagation();
                void handleCopy(clientPhone, 'phone');
              }}
              title={isPhoneCopied ? 'Copied' : 'Copy phone'}
            >
              <Icon
                iconName={isPhoneCopied ? 'CompletedSolid' : 'Copy'}
                styles={{
                  root: {
                    fontSize: 11,
                    color: isPhoneCopied ? colours.green : textSecondary,
                    transform: isPhoneCopied ? 'scale(1.05)' : 'scale(1)',
                    transition: 'transform 160ms ease, color 160ms ease',
                  },
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  // Tag chip
  const Tag: React.FC<{ children: React.ReactNode; copyable?: boolean; fieldKey?: string }> = ({ 
    children, copyable, fieldKey 
  }) => {
    const isCopied = fieldKey && copiedField === fieldKey;
    const value = String(children);
    
    return (
      <span
        onClick={copyable && fieldKey ? () => handleCopy(value, fieldKey) : undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 10px',
          background: isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(54, 144, 206, 0.08)',
          border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.20)' : 'rgba(54, 144, 206, 0.15)'}`,
          borderRadius: 2,
          fontSize: '12px',
          fontWeight: 500,
          color: isCopied ? colours.green : textPrimary,
          cursor: copyable ? 'pointer' : 'default',
          transition: 'color 0.15s',
        }}
      >
        {isCopied ? '✓ Copied' : children}
      </span>
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
        padding: '16px 24px 16px',
        animation: hasAnimated ? 'none' : 'contentReveal 220ms ease-out both'
      }}>
        {isLoading ? (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              animation: hasAnimated ? 'none' : 'contentReveal 220ms ease-out 40ms both',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SkeletonBlock width={3} height={16} radius={2} delay={20} />
                <SkeletonBlock width={140} height={12} radius={3} delay={60} />
              </div>
              {showFeeEarnerToggle && (
                <SkeletonBlock width={120} height={26} radius={3} delay={120} />
              )}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '14px',
              animation: hasAnimated ? 'none' : 'contentReveal 220ms ease-out 90ms both',
            }}>
              <SkeletonSection delayBase={80} />
              <SkeletonSection delayBase={160} showTags showContact />
            </div>

            <div style={{ marginTop: 14 }}>
              <SkeletonSection delayBase={220} />
            </div>
          </>
        ) : (
          <>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
              animation: hasAnimated ? 'none' : 'contentReveal 220ms ease-out 40ms both',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '3px',
                  height: '16px',
                  background: accent,
                  borderRadius: '2px',
                }} />
                <span style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: textPrimary,
                  letterSpacing: '0.3px',
                }}>
                  Prospect & Enquiry
                </span>
              </div>
              {showFeeEarnerToggle && (
                <button
                  onClick={() => setShowPrefill(v => !v)}
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '5px 12px',
                    borderRadius: 2,
                    border: `1px solid ${borderColor}`,
                    background: showPrefill 
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.10)' : 'rgba(54, 144, 206, 0.08)')
                      : 'transparent',
                    color: showPrefill ? accent : textSecondary,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {showPrefill ? '← Back to Details' : 'View Prefill Data'}
                </button>
              )}
            </div>

            {/* Content */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '14px',
              animation: hasAnimated ? 'none' : 'contentReveal 220ms ease-out 90ms both',
            }}>
              {/* Left - Prospect */}
              <Section title="Prospect" animationDelay={120}>
                <DataRow label="Name" value={clientName} copyable fieldKey="name" />
                <DataRow label="ID" value={enquiryId} copyable fieldKey="id" />
                {PasscodeLinkRow()}
                <div style={{ borderBottom: 'none', paddingBottom: 0 }} />
              </Section>

              {/* Right - Enquiry or Fee Earner */}
              {showPrefill && showFeeEarnerToggle ? (
                <Section title="Fee Earner (Prefill)" animationDelay={160}>
                  <DataRow label="Name" value={fullName} fieldKey="fe-name" />
                  <DataRow label="Initials" value={initials} fieldKey="fe-initials" />
                  <DataRow label="Role" value={role} fieldKey="fe-role" />
                  <DataRow label="Rate" value={rate} fieldKey="fe-rate" />
                  <div style={{ borderBottom: 'none', paddingBottom: 0 }} />
                </Section>
              ) : (
                <Section title="Enquiry Details" animationDelay={160}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    <Tag>{areaOfWork}</Tag>
                    <Tag>{valueDisplay}</Tag>
                  </div>
                  {(clientEmail || clientPhone) && (
                    <>
                      <div style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: textMuted,
                        marginBottom: '8px',
                        marginTop: '4px',
                      }}>
                        Contact
                      </div>
                      <ContactInline />
                    </>
                  )}
                </Section>
              )}
            </div>

            {notesDisplay && (
              <div style={{
                marginTop: 14,
                animation: hasAnimated ? 'none' : 'contentReveal 220ms ease-out 200ms both'
              }}>
                <Section
                  title="Notes"
                  animationDelay={200}
                  headerRight={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setWhiteboardEnabled((v) => !v)}
                        style={{
                          background: whiteboardEnabled
                            ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.10)')
                            : 'transparent',
                          border: `1px solid ${whiteboardEnabled ? borderColor : innerBorder}`,
                          padding: '2px 8px',
                          borderRadius: 2,
                          cursor: 'pointer',
                          fontSize: 10,
                          fontWeight: 600,
                          color: whiteboardEnabled ? accent : textSecondary,
                          transition: 'border-color 160ms ease, color 160ms ease, background 160ms ease',
                        }}
                        title="Toggle temporary whiteboard"
                      >
                        {whiteboardEnabled ? 'Hide whiteboard' : 'Whiteboard'}
                      </button>
                      {shouldTruncateNotes && (
                        <button
                          type="button"
                          onClick={() => setNotesExpanded((v) => !v)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            fontSize: 10,
                            fontWeight: 600,
                            color: textSecondary,
                          }}
                        >
                          {notesExpanded ? 'Hide' : 'Show'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleCopyNotes}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontSize: 10,
                          fontWeight: 600,
                          color: notesCopied ? colours.green : textSecondary,
                        }}
                      >
                        {notesCopied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  }
                >
                  {whiteboardEnabled ? (
                    <div
                      ref={whiteboardContainerRef}
                      style={{
                        display: 'flex',
                        alignItems: 'stretch',
                        gap: 10,
                        minHeight: 140,
                      }}
                    >
                      <div
                        style={{
                          flex: `0 0 ${Math.round(whiteboardSplit * 100)}%`,
                          minWidth: 220,
                          fontSize: 12,
                          color: textPrimary,
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {notesExpanded ? notesDisplay : notesPreview}
                      </div>

                      <div
                        onMouseDown={handleWhiteboardResizeStart}
                        role="separator"
                        aria-label="Resize notes and whiteboard"
                        style={{
                          width: 6,
                          cursor: 'col-resize',
                          borderRadius: 6,
                          background: isDarkMode ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.18)',
                          boxShadow: isDarkMode
                            ? 'inset 0 0 0 1px rgba(148, 163, 184, 0.25)'
                            : 'inset 0 0 0 1px rgba(148, 163, 184, 0.2)',
                          transition: 'background 160ms ease',
                        }}
                      />

                      <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 10, color: textSecondary, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                          Whiteboard (temporary)
                        </div>
                        <div style={{ fontSize: 10, color: textSecondary, lineHeight: 1.4 }}>
                          Session-only notes for calls. Not saved anywhere and cleared when the app reloads.
                        </div>
                        <textarea
                          value={whiteboardText}
                          onChange={(event) => setWhiteboardText(event.target.value)}
                          placeholder="Jot down temporary call notes here…"
                          style={{
                            flex: 1,
                            minHeight: 90,
                            resize: 'none',
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: `1px solid ${innerBorder}`,
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : '#FFFFFF',
                            color: textPrimary,
                            fontSize: 12,
                            lineHeight: 1.4,
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: textPrimary, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {notesExpanded ? notesDisplay : notesPreview}
                    </div>
                  )}
                </Section>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProspectHeader;
