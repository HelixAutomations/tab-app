/**
 * ProspectHeroHeader — v5
 *
 * Compact context strip for the workbench. This should read like software
 * chrome, not a hero card: essential identity first, case switching second.
 */

import React from 'react';
import { Enquiry } from '../../../app/functionality/types';
import { colours } from '../../../app/styles/colours';
import activecampaignIcon from '../../../assets/activecampaign.svg';
import {
  FaCheckCircle,
  FaCopy,
  FaEnvelope,
  FaPaperPlane,
  FaPhone,
  FaStar,
  FaUserPlus,
} from 'react-icons/fa';

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
  const touchpointDateLabel = formatShortDate(enquiry.Touchpoint_Date || enquiry.Date_Created);
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
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1.2,
    minWidth: 0,
    maxWidth: '100%',
  };
  const copyButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
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
    width: 12,
    height: 12,
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

  return (
    <div
      data-helix-region="enquiries/detail/context-strip"
      style={{
        background: 'transparent',
        borderBottom: `1px solid ${shellDivider}`,
        padding: '10px 0 12px',
        fontFamily: FONT_STACK,
        boxShadow: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Row 1: identity + primary CTA */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            flex: '1 1 360px',
            minWidth: 0,
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: areaColour,
              flexShrink: 0,
              marginTop: 8,
              boxShadow: `0 0 0 3px ${isDarkMode ? `${areaColour}1c` : `${areaColour}12`}`,
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
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
                  gap: 5,
                  padding: '2px 6px',
                  background: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(13, 47, 96, 0.03)',
                  color: areaColour,
                  fontSize: 10,
                  fontWeight: 600,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: areaColour, flexShrink: 0 }} />
                  <span>{displayAreaOfWork || 'General'}</span>
                </span>
                {onOpenPitchBuilder && (
                  <button
                    type="button"
                    onClick={onOpenPitchBuilder}
                    title="Open the pitch builder for this enquiry"
                    style={{
                      ...compactActionButtonBase,
                      minHeight: 26,
                      padding: '0 10px',
                      fontSize: 11,
                      background: colours.highlight,
                      border: `1px solid ${colours.highlight}`,
                      color: '#ffffff',
                      flexShrink: 0,
                      marginLeft: 4,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  >
                    <FaPaperPlane size={10} />
                    <span>Send pitch</span>
                  </button>
                )}
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                color: textBody,
                fontSize: 10,
                lineHeight: 1.2,
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

          {/* (Send pitch CTA moved up beside the name) */}
        </div>

        {/* Row 2: contact chips + quiet meta actions */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          rowGap: 6,
          flexWrap: 'wrap',
          color: textBody,
        }}>
          {displayId && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCopyToClipboard(displayId, 'ID'); }}
              title={copiedField === 'ID' ? 'Copied' : `Copy ID: ${displayId}`}
              style={{ ...contactActionStyle, color: textBody }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.72'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              <span style={iconBoxStyle}>
                <img src={activecampaignIcon} alt="AC" style={{ width: 12, height: 12, filter: activeCampaignIconFilter }} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: textPrimary, whiteSpace: 'nowrap' }}>{displayId}</span>
              {copiedField === 'ID' && (
                <FaCheckCircle size={9} style={{ color: colours.green, marginLeft: 2 }} />
              )}
            </button>
          )}

          {enquiry.Email && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => onOpenMailto(enquiry.Email!)}
                title={`Email ${enquiry.Email}`}
                style={{ ...contactActionStyle, color: colours.highlight }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.72'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                <span style={iconBoxStyle}>
                  <FaEnvelope size={9} />
                </span>
                <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{enquiry.Email}</span>
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
                {copiedField === 'Email' ? <FaCheckCircle size={8} /> : <FaCopy size={8} />}
              </button>
            </span>
          )}

          {enquiry.Phone_Number && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <button
                type="button"
                onClick={() => onOpenTel(enquiry.Phone_Number!)}
                title={`Call ${enquiry.Phone_Number}`}
                style={{ ...contactActionStyle, color: textBody }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.72'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                <span style={iconBoxStyle}>
                  <FaPhone size={9} />
                </span>
                <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{enquiry.Phone_Number}</span>
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
                {copiedField === 'Phone' ? <FaCheckCircle size={8} /> : <FaCopy size={8} />}
              </button>
            </span>
          )}

          {(onOpenEnquiryRating || onShareEnquiry) && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              marginLeft: 'auto',
            }}>
              {onOpenEnquiryRating && (
                <button
                  type="button"
                  onClick={onOpenEnquiryRating}
                  title={normalisedRating ? `Rating: ${normalisedRating} · Click to change` : 'Rate this enquiry'}
                  style={{
                    ...contactActionStyle,
                    color: normalisedRating ? ratingColor : textMuted,
                    fontWeight: 600,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.72'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                >
                  <span style={iconBoxStyle}>
                    {normalisedRating === 'Good' ? <FaCheckCircle size={10} /> : <FaStar size={10} />}
                  </span>
                  <span>{normalisedRating || 'Rate'}</span>
                </button>
              )}
              {onShareEnquiry && (
                <button
                  type="button"
                  onClick={onShareEnquiry}
                  title="Share access to this enquiry"
                  style={{ ...contactActionStyle, color: textMuted, fontWeight: 600 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = colours.highlight; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = textMuted; }}
                >
                  <span style={iconBoxStyle}>
                    <FaUserPlus size={10} />
                  </span>
                  <span>Share</span>
                </button>
              )}
            </span>
          )}
        </div>

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