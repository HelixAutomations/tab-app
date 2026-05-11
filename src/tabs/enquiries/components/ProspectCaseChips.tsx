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
  activeWindowRangeLabel: string;
  hoveredCaseId: string | null;
  setHoveredCaseId: (caseId: string | null) => void;
  onSelectEnquiry?: (enquiry: Enquiry) => void;
  isDarkMode: boolean;
  formatCaseAreaLabel: (areaOfWork: string | undefined) => string;
}

const ProspectCaseChips: React.FC<ProspectCaseChipsProps> = ({
  enquiryWindows,
  activeEnquiryId,
  activeWindowRangeLabel,
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
      className="prospect-case-switcher"
      data-helix-region="enquiries/detail/case-switcher"
    >
      <div className="prospect-case-switcher-header">
        <span className="prospect-case-switcher-label">Cases</span>
        <span className="prospect-case-switcher-summary">Selected case scope: {activeWindowRangeLabel}</span>
      </div>
      <div className="prospect-case-switcher-list" role="tablist" aria-label="Cases">
        {enquiryWindows.map((window) => {
          const caseId = String(window.enquiry.ID);
          const isActive = caseId === String(activeEnquiryId);
          const isHovered = hoveredCaseId === caseId;
          const canSelect = !isActive && typeof onSelectEnquiry === 'function';
          const areaLabel = formatCaseAreaLabel(window.enquiry.Area_of_Work);
          const rawValue = window.enquiry.Value;
          const valueDisplay = rawValue && !isNaN(Number(rawValue)) && Number(rawValue) > 0
            ? `£${Number(rawValue).toLocaleString()}`
            : null;
          const touchpointDate = (() => {
            const raw = window.enquiry.Touchpoint_Date || window.enquiry.Date_Created;
            if (!raw) return '—';
            try {
              const d = new Date(raw);
              if (!Number.isFinite(d.getTime())) return '—';
              return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            } catch {
              return '—';
            }
          })();

          return (
            <button
              key={caseId}
              type="button"
              className="prospect-case-switcher-pill"
              data-active={isActive ? 'true' : undefined}
              role="tab"
              aria-selected={isActive ? 'true' : 'false'}
              onClick={() => canSelect && onSelectEnquiry?.(window.enquiry)}
              onMouseEnter={() => setHoveredCaseId(caseId)}
              onMouseLeave={() => setHoveredCaseId(null)}
              title={[touchpointDate, areaLabel, valueDisplay].filter(Boolean).join(' · ')}
              style={{
                '--case-accent': areaLabel.toLowerCase().includes('commercial')
                  ? colours.blue
                  : areaLabel.toLowerCase().includes('property')
                  ? colours.green
                  : areaLabel.toLowerCase().includes('construction')
                  ? colours.orange
                  : areaLabel.toLowerCase().includes('employment')
                  ? colours.yellow
                  : colours.greyText,
                opacity: !isActive && !canSelect ? 0.72 : 1,
                transform: isHovered && canSelect ? 'translateY(-1px)' : 'translateY(0)',
              } as React.CSSProperties}
            >
              <span className="prospect-case-switcher-pill-date">{touchpointDate}</span>
              <span className="prospect-case-switcher-pill-meta">{areaLabel}{valueDisplay ? ` · ${valueDisplay}` : ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ProspectCaseChips;