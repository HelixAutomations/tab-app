/**
 * ProspectHeroHeader — v4
 *
 * Compact identity bar. Client name + subtle case metadata + prospect-level contact.
 * Case selector appears inline when >1 case exists.
 *
 * Layout:
 *   [● dot] Name   Area · PoC · Date    ACID | ✉ email | 📞 phone
 *   {case selector row — only when >1 case}
 */

import React from 'react';
import { Enquiry } from '../../../app/functionality/types';
import { colours } from '../../../app/styles/colours';
import activecampaignIcon from '../../../assets/activecampaign.svg';
import {
  FaCheckCircle,
  FaCopy,
  FaEnvelope,
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
  const cardBg = isDarkMode ? colours.darkBlue : colours.light.cardBackground;
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const textBody = isDarkMode ? '#d1d5db' : '#374151';
  const borderCol = isDarkMode ? colours.dark.border : colours.grey;

  const showCaseSelectorRow = showCaseSelector && enquiryWindows.length > 0;
  const activeCampaignWhiteFilter = 'brightness(0) invert(1)';
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
  const ratingBackground = normalisedRating === 'Good'
    ? (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)')
    : normalisedRating === 'Poor'
      ? (isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.08)')
      : (isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.03)');
  const ratingBorder = normalisedRating === 'Good'
    ? (isDarkMode ? 'rgba(54, 144, 206, 0.28)' : 'rgba(54, 144, 206, 0.18)')
    : normalisedRating === 'Poor'
      ? (isDarkMode ? 'rgba(214, 85, 65, 0.28)' : 'rgba(214, 85, 65, 0.18)')
      : (isDarkMode ? 'rgba(148, 163, 184, 0.16)' : 'rgba(0, 0, 0, 0.06)');
  const heroMetaActionButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: FONT_STACK,
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1,
    minWidth: 0,
    maxWidth: '100%',
  };
  const heroMetaCopyButtonStyle: React.CSSProperties = {
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
  const heroMetaIconBoxStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 12,
    height: 12,
    flexShrink: 0,
  };
  const heroActionChipStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 28,
    padding: '0 10px',
    borderRadius: 0,
    border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.46)' : 'rgba(6, 23, 51, 0.1)'}`,
    background: isDarkMode ? 'rgba(2, 6, 23, 0.34)' : 'rgba(255, 255, 255, 0.74)',
    color: textBody,
    cursor: 'pointer',
    fontFamily: FONT_STACK,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.3px',
    textTransform: 'uppercase',
    transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{
      background: isDarkMode
        ? `linear-gradient(135deg, ${colours.darkBlue} 0%, ${colours.websiteBlue} 72%)`
        : `linear-gradient(135deg, ${colours.light.cardBackground} 0%, ${colours.light.sectionBackground} 100%)`,
      borderBottom: `1px solid ${isDarkMode ? colours.dark.borderColor : borderCol}`,
      borderLeft: `3px solid ${areaColour}`,
      borderTop: `1px solid ${isDarkMode ? `${colours.dark.borderColor}99` : `${areaColour}33`}`,
      borderRight: `1px solid ${isDarkMode ? `${colours.dark.borderColor}66` : `${borderCol}`}`,
      borderRadius: 0,
      padding: '12px 16px 10px',
      fontFamily: FONT_STACK,
      boxShadow: isDarkMode ? 'inset 0 1px 0 rgba(255,255,255,0.03)' : 'inset 0 1px 0 rgba(255,255,255,0.7)',
    }}>
      {/* ═══ Main row: identity ═══ */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        minHeight: 44,
        flexWrap: 'wrap',
      }}>
        {/* ● AoW dot + Name */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          flex: '1 1 320px', minWidth: 0,
        }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: areaColour, flexShrink: 0,
            marginTop: 6,
            boxShadow: `0 0 0 4px ${isDarkMode ? `${areaColour}22` : `${areaColour}14`}`,
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, paddingTop: 3 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              minHeight: 12,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.45px',
              textTransform: 'uppercase',
              color: textMuted,
              lineHeight: 1,
            }}>
              <span style={{ color: areaColour }}>{displayAreaOfWork || 'General'}</span>
              <span style={{ opacity: 0.45 }}>•</span>
              <span>{pointOfContactLabel}</span>
              {touchpointDateLabel && (
                <>
                  <span style={{ opacity: 0.45 }}>•</span>
                  <span>{touchpointDateLabel}</span>
                </>
              )}
            </div>
            <h2 style={{
              fontSize: 22, fontWeight: 700,
              color: textPrimary, margin: 0,
              lineHeight: 1.03, letterSpacing: -0.45,
              whiteSpace: 'normal',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              paddingTop: 1,
            }}>
              {clientDisplayName}
            </h2>
          </div>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          flexWrap: 'nowrap',
          rowGap: 8,
          columnGap: 8,
          alignItems: 'flex-end',
          flex: '0 1 auto',
          minWidth: 0,
          marginLeft: 'auto',
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            gap: 0,
            minWidth: 0,
            maxWidth: '100%',
            color: textBody,
          }}>
            {displayId && (
              <>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCopyToClipboard(displayId, 'ID'); }}
                    title={`Copy ID: ${displayId}`}
                    style={{ ...heroMetaActionButtonStyle, color: textBody }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.72'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  >
                    <span style={heroMetaIconBoxStyle}>
                      <img src={activecampaignIcon} alt="AC" style={{ width: 12, height: 12, filter: activeCampaignWhiteFilter }} />
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: textPrimary, whiteSpace: 'nowrap' }}>{displayId}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCopyToClipboard(displayId, 'ID'); }}
                    title="Copy ID"
                    style={{ ...heroMetaCopyButtonStyle, color: copiedField === 'ID' ? colours.green : textMuted }}
                    onMouseEnter={(e) => {
                      if (copiedField !== 'ID') e.currentTarget.style.color = colours.highlight;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = copiedField === 'ID' ? colours.green : textMuted;
                    }}
                  >
                    {copiedField === 'ID' ? <FaCheckCircle size={8} /> : <FaCopy size={8} />}
                  </button>
                </div>
                {(enquiry.Email || enquiry.Phone_Number) && (
                  <span style={{ padding: '0 8px', color: textMuted, opacity: 0.55 }}>|</span>
                )}
              </>
            )}

            {enquiry.Email && (
              <>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
                  <button
                    onClick={() => onOpenMailto(enquiry.Email!)}
                    title={`Email: ${enquiry.Email}`}
                    style={{ ...heroMetaActionButtonStyle, color: colours.highlight }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.72'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                  >
                    <span style={heroMetaIconBoxStyle}>
                      <FaEnvelope size={9} />
                    </span>
                    <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{enquiry.Email}</span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onCopyToClipboard(enquiry.Email!, 'Email'); }}
                    title="Copy email"
                    style={{ ...heroMetaCopyButtonStyle, color: copiedField === 'Email' ? colours.green : textMuted }}
                    onMouseEnter={(e) => {
                      if (copiedField !== 'Email') e.currentTarget.style.color = colours.highlight;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = copiedField === 'Email' ? colours.green : textMuted;
                    }}
                  >
                    {copiedField === 'Email' ? <FaCheckCircle size={8} /> : <FaCopy size={8} />}
                  </button>
                </div>
                {enquiry.Phone_Number && (
                  <span style={{ padding: '0 8px', color: textMuted, opacity: 0.55 }}>|</span>
                )}
              </>
            )}

            {enquiry.Phone_Number && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
                <button
                  onClick={() => onOpenTel(enquiry.Phone_Number!)}
                  title={`Call: ${enquiry.Phone_Number}`}
                  style={{ ...heroMetaActionButtonStyle, color: textBody }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.72'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                >
                  <span style={heroMetaIconBoxStyle}>
                    <FaPhone size={9} />
                  </span>
                  <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{enquiry.Phone_Number}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onCopyToClipboard(enquiry.Phone_Number!, 'Phone'); }}
                  title="Copy phone"
                  style={{ ...heroMetaCopyButtonStyle, color: copiedField === 'Phone' ? colours.green : textMuted }}
                  onMouseEnter={(e) => {
                    if (copiedField !== 'Phone') e.currentTarget.style.color = colours.highlight;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = copiedField === 'Phone' ? colours.green : textMuted;
                  }}
                >
                  {copiedField === 'Phone' ? <FaCheckCircle size={8} /> : <FaCopy size={8} />}
                </button>
              </div>
            )}
          </div>

          {(onOpenEnquiryRating || onShareEnquiry) && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              gap: 8,
              maxWidth: '100%',
            }}>
              {onOpenEnquiryRating && (
                <button
                  type="button"
                  onClick={onOpenEnquiryRating}
                  title={normalisedRating ? `Rating: ${normalisedRating} · Click to change` : 'Rate this enquiry'}
                  style={{
                    ...heroActionChipStyle,
                    background: ratingBackground,
                    borderColor: ratingBorder,
                    color: ratingColor,
                  }}
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
                    ...heroActionChipStyle,
                    color: isDarkMode ? colours.accent : colours.highlight,
                    borderColor: isDarkMode ? 'rgba(135, 243, 243, 0.22)' : 'rgba(54, 144, 206, 0.18)',
                    background: isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.07)',
                  }}
                >
                  <FaUserPlus size={10} />
                  <span>Share</span>
                </button>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ═══ Case row ═══ */}
      {showCaseSelectorRow && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          marginTop: 10, paddingTop: 10,
          borderTop: `1px solid ${isDarkMode ? `${colours.dark.borderColor}80` : `${colours.grey}a6`}`,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
            color: isDarkMode ? colours.subtleGrey : colours.greyText,
          }}>Enquiries</span>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' }}>
          {enquiryWindows.map((window) => {
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

            return (
              <button
                key={caseId}
                type="button"
                onClick={() => canSelect && onSelectEnquiry?.(window.enquiry)}
                onMouseEnter={() => setHoveredCaseId(caseId)}
                onMouseLeave={() => setHoveredCaseId(null)}
                title={[areaLabel, touchpointDate, valueDisplay].filter(Boolean).join(' · ')}
                style={{
                  display: 'inline-flex', alignItems: 'stretch', gap: 8,
                  padding: '8px 12px', borderRadius: 2,
                  border: isActive
                    ? `1px solid ${chipAreaColour}`
                    : `1px solid ${isDarkMode ? `${colours.dark.border}60` : `${colours.grey}`}`,
                  background: isActive
                    ? (isDarkMode ? `${chipAreaColour}20` : `${chipAreaColour}12`)
                    : isHovered && canSelect
                    ? (isDarkMode ? colours.dark.cardHover : colours.highlightBlue)
                    : (isDarkMode ? `${colours.websiteBlue}66` : colours.grey),
                  color: isActive ? textPrimary : textBody,
                  fontFamily: FONT_STACK,
                  cursor: canSelect ? 'pointer' : 'default',
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? `inset 0 0 0 1px ${chipAreaColour}33` : 'none',
                  transform: isHovered && canSelect ? 'translateY(-1px)' : 'none',
                }}
              >
                <span style={{
                  width: 3,
                  minWidth: 3,
                  alignSelf: 'stretch',
                  background: chipAreaColour, flexShrink: 0,
                  opacity: isActive ? 1 : 0.7,
                  borderRadius: 0,
                }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                  <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 600, whiteSpace: 'nowrap' }}>
                    {touchpointDate || '—'}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 500, whiteSpace: 'nowrap',
                    color: isActive ? chipAreaColour : (isDarkMode ? colours.subtleGrey : colours.greyText),
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {areaLabel}{valueDisplay && <span style={{ opacity: 0.7 }}>· {valueDisplay}</span>}
                  </span>
                </span>
                {isActive && (
                  <span style={{
                    fontSize: 7,
                    fontWeight: 700,
                    letterSpacing: '0.3px',
                    textTransform: 'uppercase',
                    color: chipAreaColour,
                    marginTop: 2,
                  }}>
                    Active
                  </span>
                )}
              </button>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProspectHeroHeader;