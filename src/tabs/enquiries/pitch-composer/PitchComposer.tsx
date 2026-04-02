import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FaCopy, FaEnvelope, FaCheckCircle, FaExclamationTriangle,
  FaInfoCircle, FaTimes, FaCalendarAlt, FaPhoneAlt, FaBan, FaHandshake, FaFileContract, FaLink,
  FaArrowLeft,
} from 'react-icons/fa';
import { colours } from '../../../app/styles/colours';
import { usePitchComposer, type ToastMessage } from './usePitchComposer';
import type { Enquiry, UserData } from '../../../app/functionality/types';

// ── Scenario display helpers ──────────────────────────────────────────────

const SCENARIO_META: Record<string, { icon: React.ReactNode; shortName: string; description: string }> = {
  'before-call-call': {
    icon: <FaPhoneAlt size={11} />,
    shortName: 'Before call',
    description: 'Intro pitch with Calendly link',
  },
  'before-call-no-call': {
    icon: <FaCalendarAlt size={11} />,
    shortName: 'Before — No call',
    description: 'Detailed pitch without call',
  },
  'after-call-probably-cant-assist': {
    icon: <FaBan size={11} />,
    shortName: 'Can\'t assist',
    description: 'Post-call, likely no instruction',
  },
  'after-call-want-instruction': {
    icon: <FaHandshake size={11} />,
    shortName: 'Want instruction',
    description: 'Post-call, keen to proceed',
  },
  'cfa': {
    icon: <FaFileContract size={11} />,
    shortName: 'CFA',
    description: 'Conditional fee arrangement',
  },
};

// ── Props ──────────────────────────────────────────────────────────────────

interface PitchComposerProps {
  enquiry: Enquiry | null;
  userData: UserData[] | null;
  isDarkMode: boolean;
  userEmail?: string;
  onPitchSent?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

const PitchComposer: React.FC<PitchComposerProps> = ({
  enquiry,
  userData,
  isDarkMode,
  userEmail,
  onPitchSent,
}) => {
  const state = usePitchComposer(enquiry, userData, userEmail);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(200, el.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [state.body, autoResize]);

  // Propagate sent callback
  useEffect(() => {
    if (state.sendState.status === 'sent' && onPitchSent) {
      onPitchSent();
    }
  }, [state.sendState.status, onPitchSent]);

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (!state.toast) return;
    const timer = setTimeout(() => state.dismissToast(), 4000);
    return () => clearTimeout(timer);
  }, [state.toast, state.dismissToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ────────────────────────────────────────────────────────────

  const isBusy = state.sendState.status === 'sending' || state.dealState.status === 'creating';
  const hasBeenSent = state.sendState.status === 'sent';
  const unresolvedCount = state.placeholders.filter(p => !p.resolved).length;
  const isCfa = state.selectedScenario?.id === 'cfa';

  // ── Style helpers ──────────────────────────────────────────────────────

  const sectionBg = isDarkMode ? 'rgba(2, 6, 23, 0.3)' : 'rgba(244, 244, 246, 0.4)';
  const borderColour = isDarkMode ? `${colours.dark.border}40` : 'rgba(6, 23, 51, 0.08)';
  const labelColour = isDarkMode ? colours.subtleGrey : colours.greyText;
  const bodyTextColour = isDarkMode ? '#d1d5db' : '#374151';
  const primaryTextColour = isDarkMode ? colours.dark.text : colours.light.text;
  const inputBg = isDarkMode ? 'rgba(5, 21, 37, 0.6)' : '#ffffff';
  const inputBorder = isDarkMode ? `${colours.dark.border}60` : 'rgba(6, 23, 51, 0.12)';

  // Preview mode toggle for body editor
  const [previewMode, setPreviewMode] = useState(false);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="wb-tab-stack" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* ── Toast ── */}
      {state.toast && (
        <Toast toast={state.toast} onDismiss={state.dismissToast} isDarkMode={isDarkMode} />
      )}

      {/* ── Mode selector ── */}
      {!state.mode && !hasBeenSent && (
        <div style={{
          display: 'flex', gap: 12, padding: '6px 0',
          animation: 'pitchFadeIn 0.25s ease',
        }}>
          <button
            onClick={() => state.setMode('scenario')}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              padding: '20px 14px',
              background: sectionBg,
              border: `1px solid ${borderColour}`,
              borderRadius: 0,
              cursor: 'pointer',
              fontFamily: 'Raleway, sans-serif',
              color: bodyTextColour,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = isDarkMode ? colours.accent : colours.highlight;
              e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.04)' : 'rgba(54, 144, 206, 0.03)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = borderColour;
              e.currentTarget.style.background = sectionBg;
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <FaEnvelope size={20} style={{ color: isDarkMode ? colours.accent : colours.highlight }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: primaryTextColour }}>
              Pitch Email
            </span>
            <span style={{ fontSize: 11, lineHeight: '1.4', color: labelColour, textAlign: 'center' }}>
              Compose a scenario-based email and drop it straight into your Outlook Drafts
            </span>
          </button>

          <button
            onClick={() => state.setMode('quicklink')}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              padding: '20px 14px',
              background: sectionBg,
              border: `1px solid ${borderColour}`,
              borderRadius: 0,
              cursor: 'pointer',
              fontFamily: 'Raleway, sans-serif',
              color: bodyTextColour,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = isDarkMode ? colours.accent : colours.highlight;
              e.currentTarget.style.background = isDarkMode ? 'rgba(135, 243, 243, 0.04)' : 'rgba(54, 144, 206, 0.03)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = borderColour;
              e.currentTarget.style.background = sectionBg;
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <FaLink size={20} style={{ color: isDarkMode ? colours.accent : colours.highlight }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: primaryTextColour }}>
              Quick Link
            </span>
            <span style={{ fontSize: 11, lineHeight: '1.4', color: labelColour, textAlign: 'center' }}>
              Generate a portal link to share via Teams, WhatsApp or any other channel
            </span>
          </button>
        </div>
      )}

      {/* ── Back header ── */}
      {state.mode && !hasBeenSent && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 14px',
          animation: 'pitchSlideIn 0.2s ease',
        }}>
          <button
            onClick={() => state.reset()}
            disabled={isBusy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '4px 8px',
              border: `1px solid ${borderColour}`,
              borderRadius: 0,
              background: 'transparent',
              color: labelColour,
              fontSize: 11, fontWeight: 500,
              fontFamily: 'Raleway, sans-serif',
              cursor: isBusy ? 'default' : 'pointer',
              opacity: isBusy ? 0.4 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <FaArrowLeft size={9} />
            Back
          </button>
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
            color: isDarkMode ? colours.accent : colours.highlight,
          }}>
            {state.mode === 'scenario' ? 'Pitch Email' : 'Quick Link'}
          </span>
        </div>
      )}

      {/* ═══════════════ SCENARIO MODE ═══════════════ */}
      {state.mode === 'scenario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'pitchSlideIn 0.25s ease' }}>

          {/* ── Scenario picker ── */}
          <div style={{
            padding: '10px 14px',
            background: sectionBg,
            border: `1px solid ${borderColour}`,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
              letterSpacing: '0.5px', color: isDarkMode ? colours.accent : colours.highlight,
              marginBottom: 8,
            }}>
              Scenario
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {state.scenarios.map(scenario => {
                const meta = SCENARIO_META[scenario.id];
                const isSelected = state.selectedScenario?.id === scenario.id;

                return (
                  <button
                    key={scenario.id}
                    onClick={() => state.selectScenario(scenario.id)}
                    disabled={isBusy || hasBeenSent}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                      padding: '6px 10px',
                      border: isSelected
                        ? `1px solid ${isDarkMode ? colours.accent : colours.highlight}`
                        : `1px solid ${borderColour}`,
                      borderRadius: 0,
                      background: isSelected
                        ? (isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.06)')
                        : 'transparent',
                      color: isSelected
                        ? (isDarkMode ? colours.accent : colours.highlight)
                        : bodyTextColour,
                      fontSize: 11, fontWeight: isSelected ? 600 : 500,
                      fontFamily: 'Raleway, sans-serif',
                      cursor: isBusy || hasBeenSent ? 'default' : 'pointer',
                      opacity: isBusy || hasBeenSent ? 0.5 : 1,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {meta?.icon}
                      <span>{meta?.shortName || scenario.name}</span>
                    </span>
                    {meta?.description && (
                      <span style={{
                        fontSize: 9, fontWeight: 400,
                        color: isDarkMode ? colours.subtleGrey : colours.greyText,
                        lineHeight: '1.3',
                      }}>
                        {meta.description}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Email headers + amount ── */}
          {state.selectedScenario && (
            <div style={{
              padding: '10px 14px',
              background: sectionBg,
              border: `1px solid ${borderColour}`,
              display: 'flex', flexDirection: 'column', gap: 8,
              animation: 'pitchSlideIn 0.2s ease',
            }}>
              {/* To / CC row */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <FieldLabel label="To" isDarkMode={isDarkMode} />
                <input
                  className="helix-input"
                  style={{ flex: 1, minWidth: 160, fontSize: 12, padding: '5px 8px', background: inputBg, borderColor: inputBorder }}
                  value={state.toEmail}
                  onChange={e => state.setToEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  disabled={isBusy || hasBeenSent}
                />
                <FieldLabel label="CC" isDarkMode={isDarkMode} />
                <input
                  className="helix-input"
                  style={{ flex: 1, minWidth: 120, fontSize: 12, padding: '5px 8px', background: inputBg, borderColor: inputBorder }}
                  value={state.ccEmails}
                  onChange={e => state.setCcEmails(e.target.value)}
                  placeholder="cc@example.com"
                  disabled={isBusy || hasBeenSent}
                />
              </div>

              {/* Subject */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <FieldLabel label="Subject" isDarkMode={isDarkMode} />
                <input
                  className="helix-input"
                  style={{ flex: 1, fontSize: 12, padding: '5px 8px', background: inputBg, borderColor: inputBorder }}
                  value={state.subject}
                  onChange={e => state.setSubject(e.target.value)}
                  disabled={isBusy || hasBeenSent}
                />
              </div>

              {/* Amount + Description */}
              {!isCfa && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <FieldLabel label="Amount" isDarkMode={isDarkMode} />
                  <input
                    className="helix-input"
                    style={{ width: 100, fontSize: 12, padding: '5px 8px', background: inputBg, borderColor: inputBorder }}
                    value={state.amount}
                    onChange={e => state.setAmount(e.target.value)}
                    placeholder="e.g. 3000"
                    disabled={isBusy || hasBeenSent}
                  />
                  <FieldLabel label="Description" isDarkMode={isDarkMode} />
                  <input
                    className="helix-input"
                    style={{ flex: 1, minWidth: 140, fontSize: 12, padding: '5px 8px', background: inputBg, borderColor: inputBorder }}
                    value={state.description}
                    onChange={e => state.setDescription(e.target.value)}
                    placeholder="Service description"
                    disabled={isBusy || hasBeenSent}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Placeholder rail ── */}
          {state.placeholders.length > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 4,
              padding: '6px 14px',
              background: unresolvedCount > 0
                ? (isDarkMode ? 'rgba(214, 85, 65, 0.06)' : 'rgba(214, 85, 65, 0.04)')
                : (isDarkMode ? 'rgba(32, 178, 108, 0.06)' : 'rgba(32, 178, 108, 0.04)'),
              border: `1px solid ${unresolvedCount > 0
                ? (isDarkMode ? 'rgba(214, 85, 65, 0.2)' : 'rgba(214, 85, 65, 0.15)')
                : (isDarkMode ? 'rgba(32, 178, 108, 0.2)' : 'rgba(32, 178, 108, 0.15)')}`,
            }}>
              {unresolvedCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600, color: colours.cta,
                  display: 'flex', alignItems: 'center', gap: 4, marginRight: 6,
                }}>
                  <FaExclamationTriangle size={9} />
                  {unresolvedCount} placeholder{unresolvedCount > 1 ? 's' : ''} to fill
                </span>
              )}
              {state.placeholders.map((p, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '2px 6px',
                  fontSize: 10, fontWeight: 500,
                  fontFamily: 'monospace',
                  border: `1px solid ${p.resolved
                    ? (isDarkMode ? 'rgba(32, 178, 108, 0.3)' : 'rgba(32, 178, 108, 0.2)')
                    : (isDarkMode ? 'rgba(214, 85, 65, 0.3)' : 'rgba(214, 85, 65, 0.2)')}`,
                  color: p.resolved ? colours.green : colours.cta,
                  background: 'transparent',
                }}>
                  {p.resolved ? <FaCheckCircle size={8} /> : <FaExclamationTriangle size={8} />}
                  {p.label}
                </span>
              ))}
            </div>
          )}

          {/* ── Body editor + preview ── */}
          {state.selectedScenario && (
            <div style={{
              padding: '10px 14px',
              background: sectionBg,
              border: `1px solid ${borderColour}`,
            }}>
              {/* Tab strip: Edit / Preview */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 8 }}>
                {(['edit', 'preview'] as const).map(tab => {
                  const active = tab === 'edit' ? !previewMode : previewMode;
                  return (
                    <button
                      key={tab}
                      onClick={() => setPreviewMode(tab === 'preview')}
                      style={{
                        padding: '4px 12px',
                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const,
                        letterSpacing: '0.5px',
                        border: `1px solid ${active
                          ? (isDarkMode ? colours.accent : colours.highlight)
                          : borderColour}`,
                        borderRadius: 0,
                        background: active
                          ? (isDarkMode ? 'rgba(135, 243, 243, 0.06)' : 'rgba(54, 144, 206, 0.04)')
                          : 'transparent',
                        color: active
                          ? (isDarkMode ? colours.accent : colours.highlight)
                          : labelColour,
                        cursor: 'pointer',
                        fontFamily: 'Raleway, sans-serif',
                        transition: 'all 0.15s ease',
                        marginRight: -1,
                      }}
                    >
                      {tab}
                    </button>
                  );
                })}
                {previewMode && unresolvedCount > 0 && (
                  <span style={{
                    marginLeft: 10, fontSize: 10, fontWeight: 600, color: colours.cta,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <FaExclamationTriangle size={9} />
                    {unresolvedCount} unresolved
                  </span>
                )}
              </div>

              {/* Edit mode */}
              {!previewMode && (
                <textarea
                  ref={bodyRef}
                  className="helix-input"
                  style={{
                    width: '100%',
                    minHeight: 200,
                    fontSize: 13,
                    lineHeight: '1.5',
                    padding: '10px 12px',
                    resize: 'vertical',
                    fontFamily: 'Raleway, sans-serif',
                    color: primaryTextColour,
                    background: inputBg,
                    borderColor: inputBorder,
                    boxSizing: 'border-box',
                  }}
                  value={state.body}
                  onChange={e => state.setBody(e.target.value)}
                  disabled={isBusy || hasBeenSent}
                />
              )}

              {/* Preview mode — renders [INSERT] markers with visual highlighting */}
              {previewMode && (
                <div style={{
                  minHeight: 200,
                  padding: '10px 12px',
                  fontSize: 13,
                  lineHeight: '1.6',
                  fontFamily: 'Raleway, sans-serif',
                  color: primaryTextColour,
                  background: inputBg,
                  border: `1px solid ${inputBorder}`,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  overflow: 'auto',
                }}>
                  <BodyPreview text={state.body} isDarkMode={isDarkMode} />
                </div>
              )}
            </div>
          )}

          {/* ── Action rail ── */}
          {state.selectedScenario && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              padding: '8px 14px',
              background: sectionBg,
              border: `1px solid ${borderColour}`,
            }}>
              {/* Create Deal & Draft */}
              <button
                className="helix-btn-primary"
                disabled={!state.canSend || isBusy || hasBeenSent}
                onClick={state.createDealAndDraft}
                style={{ opacity: (!state.canSend || isBusy || hasBeenSent) ? 0.45 : 1 }}
              >
                {isBusy && state.sendState.status === 'sending' ? (
                  <span className="helix-spin" style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%' }} />
                ) : (
                  <FaEnvelope size={10} />
                )}
                {hasBeenSent ? 'Draft Created' : 'Create Deal & Draft'}
              </button>

              {/* Copy link */}
              <button
                onClick={state.copyLink}
                disabled={isBusy}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '8px 12px',
                  border: `1px solid ${borderColour}`,
                  borderRadius: 0,
                  background: 'transparent',
                  color: bodyTextColour,
                  fontSize: 12, fontWeight: 500,
                  fontFamily: 'Raleway, sans-serif',
                  cursor: isBusy ? 'default' : 'pointer',
                  opacity: isBusy ? 0.45 : 1,
                  transition: 'all 0.15s ease',
                }}
              >
                <FaCopy size={10} />
                {state.dealState.status === 'created' ? 'Copy Link' : 'Create Deal & Copy Link'}
              </button>

              {/* Reset (only after sent) */}
              {hasBeenSent && (
                <button
                  onClick={state.reset}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '8px 12px',
                    border: `1px solid ${borderColour}`,
                    borderRadius: 0,
                    background: 'transparent',
                    color: bodyTextColour,
                    fontSize: 12, fontWeight: 500,
                    fontFamily: 'Raleway, sans-serif',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    marginLeft: 'auto',
                  }}
                >
                  <FaTimes size={10} />
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ QUICK LINK MODE ═══════════════ */}
      {state.mode === 'quicklink' && !hasBeenSent && (
        <div style={{
          padding: '10px 14px',
          background: sectionBg,
          border: `1px solid ${borderColour}`,
          display: 'flex', flexDirection: 'column', gap: 8,
          animation: 'pitchSlideIn 0.25s ease',
        }}>
          <div style={{
            fontSize: 11, color: bodyTextColour, lineHeight: '1.4',
          }}>
            Generate a portal link to share via Teams, WhatsApp or any channel.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <FieldLabel label="Description" isDarkMode={isDarkMode} />
            <input
              className="helix-input"
              style={{ flex: 1, minWidth: 140, fontSize: 12, padding: '5px 8px', background: inputBg, borderColor: inputBorder }}
              value={state.description}
              onChange={e => state.setDescription(e.target.value)}
              placeholder="Service description"
              disabled={isBusy || state.dealState.status === 'created'}
            />
            <FieldLabel label="Amount" isDarkMode={isDarkMode} />
            <input
              className="helix-input"
              style={{ width: 100, fontSize: 12, padding: '5px 8px', background: inputBg, borderColor: inputBorder }}
              value={state.amount}
              onChange={e => state.setAmount(e.target.value)}
              placeholder="e.g. 3000"
              disabled={isBusy || state.dealState.status === 'created'}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="helix-btn-primary"
              disabled={!state.canGenerateLink || isBusy || state.dealState.status === 'created'}
              onClick={state.generateLink}
              style={{ opacity: (!state.canGenerateLink || isBusy || state.dealState.status === 'created') ? 0.45 : 1 }}
            >
              {isBusy ? (
                <span className="helix-spin" style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%' }} />
              ) : (
                <FaLink size={10} />
              )}
              {state.dealState.status === 'created' ? 'Link Generated' : 'Generate Link'}
            </button>
          </div>
        </div>
      )}

      {/* ── Journey strip (both modes) ── */}
      {(state.dealState.status === 'created' || hasBeenSent) && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0,
          padding: '10px 0',
          background: sectionBg,
          border: `1px solid ${borderColour}`,
          animation: 'pitchSlideIn 0.3s ease',
        }}>
          {state.dealState.status === 'created' && (
            <>
              <JourneyField label="Deal" value={`#${state.dealState.dealId}`} isDarkMode={isDarkMode} />
              <JourneySep isDarkMode={isDarkMode} />
              <JourneyField label="Ref" value={state.dealState.instructionRef} isDarkMode={isDarkMode} />
              <JourneySep isDarkMode={isDarkMode} />
              <JourneyField label="Passcode" value={state.dealState.passcode} isDarkMode={isDarkMode} mono />
            </>
          )}
          {hasBeenSent && (
            <>
              <JourneySep isDarkMode={isDarkMode} />
              <JourneyField
                label="Draft"
                value="Created in Outlook Drafts"
                isDarkMode={isDarkMode}
                success
              />
            </>
          )}
          {state.instructLink && (
            <>
              <JourneySep isDarkMode={isDarkMode} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Link</span>
                <a
                  href={state.instructLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: isDarkMode ? colours.accent : colours.highlight, textDecoration: 'none' }}
                >
                  {state.instructLink.replace('https://', '')}
                </a>
              </div>
            </>
          )}

          {/* Reset button in journey strip */}
          <div style={{ marginLeft: 'auto', padding: '0 14px' }}>
            <button
              onClick={state.reset}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 8px',
                border: `1px solid ${borderColour}`,
                borderRadius: 0,
                background: 'transparent',
                color: labelColour,
                fontSize: 11, fontWeight: 500,
                fontFamily: 'Raleway, sans-serif',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <FaTimes size={9} />
              New pitch
            </button>
          </div>
        </div>
      )}

      {/* ── Animations ── */}
      <style>{`
        @keyframes pitchFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pitchSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default PitchComposer;

// ── Sub-components ─────────────────────────────────────────────────────────

/** Renders body text with [INSERT...] tokens highlighted visually */
function BodyPreview({ text, isDarkMode }: { text: string; isDarkMode: boolean }) {
  const parts = text.split(/(\[INSERT[^\]]*\])/gi);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\[INSERT[^\]]*\]$/i.test(part)) {
          const hint = part.slice(1, -1); // strip outer brackets
          return (
            <span
              key={i}
              style={{
                display: 'inline',
                background: isDarkMode ? 'rgba(255, 243, 205, 0.12)' : '#FFF3CD',
                color: isDarkMode ? '#ffd54f' : '#856404',
                padding: '1px 5px',
                border: `1px dashed ${isDarkMode ? '#ffd54f' : '#856404'}`,
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: '0.2px',
              }}
            >
              {'\u26A0'} {hint}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function FieldLabel({ label, isDarkMode }: { label: string; isDarkMode: boolean }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.4px',
      color: isDarkMode ? colours.subtleGrey : colours.greyText,
      minWidth: 42,
    }}>
      {label}
    </span>
  );
}

function Toast({ toast, onDismiss, isDarkMode }: { toast: NonNullable<ToastMessage>; onDismiss: () => void; isDarkMode: boolean }) {
  const cls = toast.type === 'success' ? 'helix-toast-success'
    : toast.type === 'error' ? 'helix-toast-error'
    : undefined;

  const infoBg = isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.04)';
  const infoBorder = isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)';

  return (
    <div
      className={cls}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        fontSize: 12,
        animation: 'helix-slide-in-up 0.2s ease',
        ...(toast.type === 'info' ? {
          background: infoBg,
          border: `1px solid ${infoBorder}`,
          color: isDarkMode ? colours.accent : colours.highlight,
          borderRadius: 2,
          fontWeight: 600,
        } : {}),
      }}
    >
      {toast.type === 'success' && <FaCheckCircle size={11} />}
      {toast.type === 'error' && <FaExclamationTriangle size={11} />}
      {toast.type === 'info' && <FaInfoCircle size={11} />}
      <span style={{ flex: 1 }}>{toast.text}</span>
      <button
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2, display: 'flex' }}
      >
        <FaTimes size={10} />
      </button>
    </div>
  );
}

function JourneyField({ label, value, isDarkMode, mono, success }: {
  label: string; value: string; isDarkMode: boolean; mono?: boolean; success?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 14px' }}>
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>{label}</span>
      <span style={{
        fontSize: 12, fontWeight: 500,
        color: success ? colours.green : (isDarkMode ? 'rgba(243, 244, 246, 0.92)' : '#061733'),
        fontFamily: mono ? 'monospace' : 'Raleway, sans-serif',
        letterSpacing: mono ? '0.5px' : undefined,
      }}>{value}</span>
    </div>
  );
}

function JourneySep({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div style={{
      width: 1, alignSelf: 'stretch', minHeight: 28,
      background: isDarkMode ? `${colours.dark.border}40` : 'rgba(6, 23, 51, 0.08)',
      margin: '4px 0',
    }} />
  );
}
