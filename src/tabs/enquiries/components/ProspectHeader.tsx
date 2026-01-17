import React, { useRef, useState } from 'react';
import { Icon } from '@fluentui/react';
import { Enquiry, UserData } from '../../../app/functionality/types';
import { useTheme } from '../../../app/functionality/ThemeContext';

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

  const scopeDescriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

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

  // Theme
  const textPrimary = isDarkMode ? '#F1F5F9' : '#1E293B';
  const textSecondary = isDarkMode ? '#94A3B8' : '#64748B';
  const borderColor = isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(148, 163, 184, 0.25)';
  const innerBorder = isDarkMode ? 'rgba(125, 211, 252, 0.12)' : 'rgba(148, 163, 184, 0.18)';
  const surfaceBg = isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#F8FAFC';
  const cardBg = isDarkMode
    ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 100%)'
    : '#FFFFFF';
  const accent = isDarkMode ? '#7DD3FC' : '#3690CE';

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
  const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div style={{
      background: surfaceBg,
      border: `1px solid ${innerBorder}`,
      borderRadius: '4px',
      padding: '12px 14px',
    }}>
      <div style={{
        fontSize: '10px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        color: textSecondary,
        marginBottom: '10px',
      }}>
        {title}
      </div>
      {children}
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
        <span style={{ fontSize: '11px', color: textSecondary, fontWeight: 500 }}>
          {label}
        </span>
        <span style={{
          fontSize: '13px',
          fontWeight: 600,
          color: isCopied ? '#10B981' : textPrimary,
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
  const hasRequiredDealInfo = Boolean(initialScopeDescription && initialScopeDescription.trim()) && Number.isFinite(numericAmount) && numericAmount > 0;
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

    const rowBorder = `1px solid ${innerBorder}`;
    const maskText = `${instructionsBaseUrl.replace(/^https?:\/\//, '')}/pitch/•••••`;

    return (
      <div style={{ padding: '6px 0', borderBottom: rowBorder }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '11px', color: textSecondary, fontWeight: 500 }}>
            Passcode link
          </span>

          {isDealLinkReady && passcodeLinkHref ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <a
                href={passcodeLinkHref}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '13px',
                  fontWeight: 650,
                  color: accent,
                  textDecoration: 'none',
                  maxWidth: 260,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
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
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  border: `1px solid ${borderColor}`,
                  background: linkCopied
                    ? (isDarkMode ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.10)')
                    : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <Icon
                  iconName={linkCopied ? 'CompletedSolid' : 'Copy'}
                  styles={{ root: { fontSize: 12, color: linkCopied ? '#10B981' : textSecondary } }}
                />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 650,
                  color: textSecondary,
                  opacity: 0.75,
                  userSelect: 'none',
                }}
                title="This link is disabled until a Deal is captured"
              >
                {maskText}
              </span>

              <button
                type="button"
                onClick={() => setShowPasscodeConfirm((v) => !v)}
                style={{
                  fontSize: '11px',
                  fontWeight: 650,
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: `1px solid ${borderColor}`,
                  background: showPasscodeConfirm
                    ? (isDarkMode ? 'rgba(125, 211, 252, 0.10)' : 'rgba(54, 144, 206, 0.08)')
                    : 'transparent',
                  color: showPasscodeConfirm ? accent : textSecondary,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
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
              marginTop: 8,
              padding: '10px 12px',
              border: `1px solid ${innerBorder}`,
              background: isDarkMode ? 'rgba(2, 6, 23, 0.35)' : 'rgba(248, 250, 252, 0.7)',
              borderRadius: 4,
            }}
          >
            <div style={{ fontSize: 12, color: textPrimary, fontWeight: 650, marginBottom: 6 }}>
              Activate passcode link
            </div>
            <div style={{ fontSize: 11, color: textSecondary, lineHeight: 1.4, marginBottom: 10 }}>
              The link becomes available after a pitch is sent. You can also manually activate it now for use outside the pitch flow.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="link-activation-mode"
                  checked={linkActivationMode === 'pitch'}
                  onChange={() => setLinkActivationMode('pitch')}
                />
                <div>
                  <div style={{ fontSize: 11, color: textPrimary, fontWeight: 600 }}>Proceed with pitch below (automatic)</div>
                  <div style={{ fontSize: 10, color: textSecondary, marginTop: 2 }}>
                    The link activates once the pitch is sent from the editor below.
                  </div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="link-activation-mode"
                  checked={linkActivationMode === 'manual'}
                  onChange={() => setLinkActivationMode('manual')}
                />
                <div>
                  <div style={{ fontSize: 11, color: textPrimary, fontWeight: 600 }}>Manually activate now</div>
                  <div style={{ fontSize: 10, color: textSecondary, marginTop: 2 }}>
                    Enable the link immediately for use outside the pitch/send flow.
                  </div>
                </div>
              </label>
            </div>

            {linkActivationMode === 'pitch' && (
              <div style={{ fontSize: 11, color: textSecondary, lineHeight: 1.4, marginBottom: 10 }}>
                Continue with the pitch below to activate the link when you send.
              </div>
            )}

            {linkActivationMode === 'manual' && (
              <>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: textSecondary, fontWeight: 650, marginBottom: 6 }}>
                    Deal details
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: textSecondary, marginBottom: 4 }}>
                        Service description <span style={{ color: isDarkMode ? '#FCA5A5' : '#DC2626' }}>*</span>
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
                            fontSize: 12,
                            padding: '7px 9px',
                            borderRadius: 4,
                            border: `1px solid ${borderColor}`,
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.55)' : '#FFFFFF',
                            color: textPrimary,
                            outline: 'none',
                          }}
                        />
                      ) : (
                        <div style={{ fontSize: 12, color: textPrimary, fontWeight: 650 }}>
                          {initialScopeDescription?.trim() ? initialScopeDescription.trim() : '—'}
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: 11, color: textSecondary, marginBottom: 4 }}>
                        Amount <span style={{ color: isDarkMode ? '#FCA5A5' : '#DC2626' }}>*</span>
                      </div>
                      {onAmountChange ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          ref={amountRef}
                          defaultValue={String(amount ?? '')}
                          placeholder="1500"
                          onBlur={() => onAmountChange(getAmountValue())}
                          style={{
                            width: '100%',
                            fontSize: 12,
                            padding: '7px 9px',
                            borderRadius: 4,
                            border: `1px solid ${borderColor}`,
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.55)' : '#FFFFFF',
                            color: textPrimary,
                            outline: 'none',
                          }}
                        />
                      ) : (
                        <div style={{ fontSize: 12, color: textPrimary, fontWeight: 650 }}>
                          {Number.isFinite(numericAmount) && numericAmount > 0 ? formatPounds(numericAmount) : '—'}
                        </div>
                      )}
                    </div>
                  </div>

                  {canEditDealDetailsHere && (
                    <div style={{ fontSize: 10, color: textSecondary, marginTop: 6 }}>
                      Manual activation uses these details only. The pitch builder below is disabled while this is selected.
                    </div>
                  )}
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: textPrimary, marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={passcodeConfirmed}
                    onChange={(e) => setPasscodeConfirmed(e.target.checked)}
                  />
                  I confirm the amount and service description are correct.
                </label>

                {!hasRequiredDealInfo && (
                  <div style={{ fontSize: 11, color: isDarkMode ? '#FCA5A5' : '#B91C1C', marginBottom: 10 }}>
                    Add a Service Description and a positive Amount in the pitch builder before enabling this link.
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCreateDealAndEnableLink}
                  disabled={!canAttemptCapture}
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '6px 12px',
                    borderRadius: 4,
                    border: `1px solid ${borderColor}`,
                    background: canAttemptCapture
                      ? (isDarkMode ? 'rgba(125, 211, 252, 0.14)' : 'rgba(54, 144, 206, 0.12)')
                      : 'transparent',
                    color: canAttemptCapture ? accent : textSecondary,
                    cursor: canAttemptCapture ? 'pointer' : 'not-allowed',
                  }}
                >
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
      borderRadius: 3,
      background: isDarkMode ? 'rgba(125, 211, 252, 0.08)' : 'rgba(54, 144, 206, 0.06)',
      border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.18)' : 'rgba(54, 144, 206, 0.14)'}`,
      cursor: 'pointer',
      flex: '0 0 auto',
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
              style={buttonBase}
              onClick={(e) => {
                e.stopPropagation();
                void handleCopy(clientEmail, 'email');
              }}
              title="Copy email"
            >
              <Icon iconName="Copy" styles={{ root: { fontSize: 11, color: textSecondary } }} />
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
              style={buttonBase}
              onClick={(e) => {
                e.stopPropagation();
                void handleCopy(clientPhone, 'phone');
              }}
              title="Copy phone"
            >
              <Icon iconName="Copy" styles={{ root: { fontSize: 11, color: textSecondary } }} />
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
          background: isDarkMode ? 'rgba(125, 211, 252, 0.1)' : 'rgba(54, 144, 206, 0.08)',
          border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
          borderRadius: '3px',
          fontSize: '12px',
          fontWeight: 500,
          color: isCopied ? '#10B981' : textPrimary,
          cursor: copyable ? 'pointer' : 'default',
          transition: 'color 0.15s',
        }}
      >
        {isCopied ? '✓ Copied' : children}
      </span>
    );
  };

  return (
    <div style={{
      background: cardBg,
      border: `1px solid ${borderColor}`,
      borderRadius: '4px',
      padding: '16px 20px',
      boxShadow: isDarkMode 
        ? '0 2px 8px rgba(0,0,0,0.15)' 
        : '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
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
              borderRadius: '3px',
              border: `1px solid ${borderColor}`,
              background: showPrefill 
                ? (isDarkMode ? 'rgba(125, 211, 252, 0.1)' : 'rgba(54, 144, 206, 0.08)')
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
      }}>
        {/* Left - Prospect */}
        <Section title="Prospect">
          <DataRow label="Name" value={clientName} copyable fieldKey="name" />
          <DataRow label="ID" value={enquiryId} copyable fieldKey="id" />
          {PasscodeLinkRow()}
          <div style={{ borderBottom: 'none', paddingBottom: 0 }} />
        </Section>

        {/* Right - Enquiry or Fee Earner */}
        {showPrefill && showFeeEarnerToggle ? (
          <Section title="Fee Earner (Prefill)">
            <DataRow label="Name" value={fullName} fieldKey="fe-name" />
            <DataRow label="Initials" value={initials} fieldKey="fe-initials" />
            <DataRow label="Role" value={role} fieldKey="fe-role" />
            <DataRow label="Rate" value={rate} fieldKey="fe-rate" />
            <div style={{ borderBottom: 'none', paddingBottom: 0 }} />
          </Section>
        ) : (
          <Section title="Enquiry Details">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              <Tag>{areaOfWork}</Tag>
              <Tag>{valueDisplay}</Tag>
            </div>
            {(clientEmail || clientPhone) && (
              <>
                <div style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: textSecondary,
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
        <div style={{ marginTop: 14 }}>
          <Section title="Notes">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: textSecondary, fontWeight: 600 }}>
                Initial enquiry notes
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                    color: notesCopied ? '#10B981' : textSecondary,
                  }}
                >
                  {notesCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: textPrimary, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {notesExpanded ? notesDisplay : notesPreview}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
};

export default ProspectHeader;
