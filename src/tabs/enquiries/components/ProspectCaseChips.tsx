import React from 'react';
import { Enquiry } from '../../../app/functionality/types';
import { colours } from '../../../app/styles/colours';

type EnquiryWindow = {
  enquiry: Enquiry;
  startTs: number;
  endTs: number;
};

interface ProspectCaseChipsProps {
  enquiryWindows: EnquiryWindow[];
  activeEnquiryId: string | number;
  hoveredCaseId: string | null;
  setHoveredCaseId: (caseId: string | null) => void;
  onSelectEnquiry?: (enquiry: Enquiry) => void;
  isDarkMode: boolean;
  formatCaseAreaLabel: (areaOfWork: string | undefined) => string;
}

const ProspectCaseChips: React.FC<ProspectCaseChipsProps> = ({
  enquiryWindows,
  activeEnquiryId,
  hoveredCaseId,
  setHoveredCaseId,
  onSelectEnquiry,
  isDarkMode,
  formatCaseAreaLabel,
}) => {
  if (enquiryWindows.length <= 1) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: '10px',
        padding: '4px 24px 10px',
        overflowX: 'auto',
        background: 'transparent',
      }}
    >
      {enquiryWindows.map((window) => {
        const caseId = String(window.enquiry.ID);
        const isActive = caseId === String(activeEnquiryId);
        const isHovered = hoveredCaseId === caseId;
        const canSelect = !isActive && typeof onSelectEnquiry === 'function';
        const areaLabel = formatCaseAreaLabel(window.enquiry.Area_of_Work);

        const typeOfWork = (window.enquiry.Type_of_Work || '').trim();
        const typeLabel = typeOfWork || areaLabel;
        const rawValue = window.enquiry.Value;
        const valueDisplay = rawValue && !isNaN(Number(rawValue)) && Number(rawValue) > 0
          ? `£${Number(rawValue).toLocaleString()}`
          : null;

        return (
          <button
            key={caseId}
            type="button"
            className="helix-case-pill"
            onClick={() => canSelect && onSelectEnquiry?.(window.enquiry)}
            onMouseEnter={() => setHoveredCaseId(caseId)}
            onMouseLeave={() => setHoveredCaseId(null)}
            title={typeLabel !== areaLabel ? `${typeLabel} — ${areaLabel}` : typeLabel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 12px',
              minWidth: '160px',
              borderRadius: 0,
              border: isActive
                ? `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlight}`
                : `1px solid ${isDarkMode ? colours.dark.border : `${colours.greyText}14`}`,
              background: isActive
                ? (isDarkMode ? colours.darkBlue : colours.grey)
                : (isDarkMode ? colours.dark.cardBackground : colours.grey),
              color: isActive
                ? (isDarkMode ? colours.dark.text : colours.light.text)
                : (isDarkMode ? colours.dark.text : colours.light.text),
              fontSize: 12,
              fontWeight: 600,
              cursor: canSelect ? 'pointer' : 'default',
              transition: 'background 0.2s ease, border-color 0.2s ease, transform 0.18s ease, box-shadow 0.18s ease',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              boxShadow: 'none',
              transform: isHovered && canSelect ? 'translateY(-1px)' : 'translateY(0)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.3,
                }}
              >
                {typeLabel}
              </div>
              {(typeLabel !== areaLabel || valueDisplay) && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  {typeLabel !== areaLabel && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: isDarkMode ? colours.subtleGrey : colours.greyText,
                      }}
                    >
                      {areaLabel}
                    </span>
                  )}
                  {valueDisplay && (
                    <>
                      {typeLabel !== areaLabel && <span style={{ opacity: 0.3 }}>·</span>}
                      <span
                        style={{
                          fontWeight: 600,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          fontSize: 11,
                        }}
                      >
                        {valueDisplay}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default ProspectCaseChips;