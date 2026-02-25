/**
 * ProspectHeroHeader — v4
 *
 * Compact identity bar. Client name + subtle case metadata + contact + CTAs.
 * Case selector appears inline when >1 case exists.
 *
 * Layout:
 *   [● dot] Name   Area · ID · Ref · Date · PoC    ✉ email [copy] 📞 phone [copy]   [Pitch] [Docs]
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
  FaFolderOpen,
  FaPhone,
} from 'react-icons/fa';

const FONT_STACK = "'Raleway', 'Segoe UI', sans-serif";

type TimelineLikeItem = {
  type: string;
  metadata?: Record<string, any>;
};

type EnquiryWindow = {
  enquiry: Enquiry;
  startTs: number;
  endTs: number;
};

interface ProspectHeroHeaderProps {
  enquiry: Enquiry;
  isDarkMode: boolean;
  copiedField: string | null;
  pitchCount: number;
  scopedTimeline: TimelineLikeItem[];
  docRequestLoading: boolean;
  requestDocsEnabled: boolean;
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
  onOpenPitchBuilder: () => void;
  onOpenExistingWorkspace: (workspaceItem: TimelineLikeItem) => void;
  onRequestDocs: () => void;
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
  pitchCount,
  scopedTimeline,
  docRequestLoading,
  requestDocsEnabled,
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
  onOpenPitchBuilder,
  onOpenExistingWorkspace,
  onRequestDocs,
}) => {
  const areaColour = getAreaColour(displayAreaOfWork);

  const clientDisplayName =
    enquiry.First_Name && enquiry.Last_Name
      ? `${enquiry.First_Name} ${enquiry.Last_Name}`
      : enquiry.First_Name || enquiry.Last_Name || 'New Prospect';

  // Surface tokens
  const cardBg = isDarkMode ? colours.darkBlue : colours.light.cardBackground;
  const textPrimary = isDarkMode ? colours.dark.text : colours.light.text;
  const textMuted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const textBody = isDarkMode ? '#d1d5db' : '#374151';
  const borderCol = isDarkMode ? colours.dark.border : colours.grey;

  // Workspace detection
  const existingWorkspace = scopedTimeline.find(
    (t) => t.type === 'document' && Boolean(t.metadata?.isDocWorkspace)
  );
  const isWorkspaceLive = Boolean(
    existingWorkspace?.metadata?.workspacePasscode &&
      existingWorkspace?.metadata?.workspaceUrlPath
  );
  const isDocsDisabled = docRequestLoading || !requestDocsEnabled;
  const showCaseSelectorRow = showCaseSelector && enquiryWindows.length > 0;
  const activeCampaignWhiteFilter = 'brightness(0) invert(1)';

  const metaItems: Array<{ icon: React.ReactNode; text: string; copyLabel: string }> = [];
  if (enquiry.ID) {
    metaItems.push({
      icon: <img src={activecampaignIcon} alt="AC" style={{ width: 10, height: 10, filter: activeCampaignWhiteFilter }} />,
      text: String(enquiry.ID),
      copyLabel: 'ID',
    });
  }

  return (
    <div style={{
      background: cardBg,
      borderBottom: `1px solid ${borderCol}`,
      borderLeft: `3px solid ${areaColour}`,
      borderRadius: 0,
      padding: '8px 16px',
      fontFamily: FONT_STACK,
    }}>
      {/* ═══ Main row: identity + contact + CTAs ═══ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 32,
      }}>
        {/* ● AoW dot + Name */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          flexShrink: 0,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: areaColour, flexShrink: 0,
          }} />
          <h2 style={{
            fontSize: 15, fontWeight: 700,
            color: textPrimary, margin: 0,
            lineHeight: 1.2, letterSpacing: -0.3,
            whiteSpace: 'nowrap',
          }}>
            {clientDisplayName}
          </h2>
        </div>

        {/* Subtle metadata tags */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0,
          flex: 1, minWidth: 0, overflow: 'hidden',
        }}>
          {metaItems.map((item, i) => (
            <React.Fragment key={i}>
              <span style={{
                color: isDarkMode ? `${colours.dark.border}` : colours.grey,
                fontSize: 9, userSelect: 'none', padding: '0 5px', flexShrink: 0,
              }}>·</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCopyToClipboard(item.text, item.copyLabel); }}
                title={`Copy ${item.copyLabel}: ${item.text}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  minWidth: 0,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: textBody,
                  opacity: 0.95,
                  flexShrink: 0,
                }}>
                  {item.icon}
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: textBody,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}>
                  {item.text}
                </span>
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* ── Contact cluster ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          paddingRight: 8,
          marginRight: 4,
          borderRight: `1px solid ${isDarkMode ? `${colours.dark.border}80` : `${colours.highlightNeutral}`}`,
        }}>
          {/* Email */}
          {enquiry.Email && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              padding: '1px 2px',
              border: `1px solid ${isDarkMode ? `${colours.dark.border}90` : colours.highlightNeutral}`,
              background: isDarkMode ? `${colours.dark.background}66` : colours.light.sectionBackground,
              borderRadius: 0,
            }}>
              <button
                onClick={() => onOpenMailto(enquiry.Email!)}
                title={`Email: ${enquiry.Email}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 6px', border: 'none', borderRadius: 0,
                  background: 'transparent', cursor: 'pointer',
                  color: colours.highlight, fontSize: 11, fontWeight: 500,
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                <FaEnvelope size={9} />
                <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{enquiry.Email}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onCopyToClipboard(enquiry.Email!, 'Email'); }}
                title="Copy email"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, border: 'none', background: 'transparent',
                  cursor: 'pointer', padding: 0,
                  color: copiedField === 'Email' ? colours.green : textMuted,
                  transition: 'color 0.15s ease',
                }}
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
          )}

          {/* Phone */}
          {enquiry.Phone_Number && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              padding: '1px 2px',
              border: `1px solid ${isDarkMode ? `${colours.dark.border}90` : colours.highlightNeutral}`,
              background: isDarkMode ? `${colours.dark.background}66` : colours.light.sectionBackground,
              borderRadius: 0,
            }}>
              <button
                onClick={() => onOpenTel(enquiry.Phone_Number!)}
                title={`Call: ${enquiry.Phone_Number}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 6px', border: 'none', borderRadius: 0,
                  background: 'transparent', cursor: 'pointer',
                  color: textBody, fontSize: 11, fontWeight: 500,
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                <FaPhone size={9} />
                <span>{enquiry.Phone_Number}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onCopyToClipboard(enquiry.Phone_Number!, 'Phone'); }}
                title="Copy phone"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, border: 'none', background: 'transparent',
                  cursor: 'pointer', padding: 0,
                  color: copiedField === 'Phone' ? colours.green : textMuted,
                  transition: 'color 0.15s ease',
                }}
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

        {/* ── CTA buttons ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 2 }}>
          <button
            onClick={onOpenPitchBuilder}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px',
              border: `1px solid ${isDarkMode ? `${colours.highlight}25` : `${colours.highlight}18`}`,
              borderRadius: 0,
              background: isDarkMode ? `${colours.highlight}0a` : `${colours.highlight}06`,
              color: colours.highlight, fontSize: 10, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = isDarkMode ? `${colours.highlight}18` : `${colours.highlight}10`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = isDarkMode ? `${colours.highlight}0a` : `${colours.highlight}06`; }}
          >
            <FaCheckCircle size={8} />
            <span>{pitchCount > 0 ? `${pitchCount} Pitch${pitchCount > 1 ? 'es' : ''}` : 'Pitch'}</span>
          </button>

          <button
            onClick={() => {
              if (existingWorkspace) onOpenExistingWorkspace(existingWorkspace);
              else onRequestDocs();
            }}
            disabled={isDocsDisabled}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px',
              border: `1px solid ${isWorkspaceLive
                ? (isDarkMode ? `${colours.green}25` : `${colours.green}18`)
                : (isDarkMode ? borderCol : colours.grey)}`,
              borderRadius: 0,
              background: isWorkspaceLive
                ? (isDarkMode ? `${colours.green}0a` : `${colours.green}06`)
                : 'transparent',
              color: isWorkspaceLive ? colours.green : textMuted,
              fontSize: 10, fontWeight: 700,
              cursor: isDocsDisabled ? 'default' : 'pointer', fontFamily: 'inherit',
              whiteSpace: 'nowrap', opacity: isDocsDisabled ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isDocsDisabled) {
                if (isWorkspaceLive) {
                  e.currentTarget.style.background = isDarkMode ? `${colours.green}18` : `${colours.green}10`;
                } else {
                  e.currentTarget.style.background = isDarkMode ? `${colours.highlight}0a` : `${colours.highlight}06`;
                  e.currentTarget.style.color = colours.highlight;
                }
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isWorkspaceLive
                ? (isDarkMode ? `${colours.green}0a` : `${colours.green}06`)
                : 'transparent';
              if (!isWorkspaceLive) e.currentTarget.style.color = textMuted;
            }}
          >
            <FaFolderOpen size={8} />
            <span>{isWorkspaceLive ? 'Workspace' : 'Request Docs'}</span>
          </button>
        </div>
      </div>

      {/* ═══ Case selector row — only when multiple cases ═══ */}
      {showCaseSelectorRow && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          marginTop: 8, paddingTop: 8,
          borderTop: `1px solid ${isDarkMode ? `${colours.dark.border}60` : `${colours.grey}80`}`,
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
                  {/* Row 1: Touchpoint date */}
                  <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 600, whiteSpace: 'nowrap' }}>
                    {touchpointDate || '—'}
                  </span>
                  {/* Row 2: Area + Value */}
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