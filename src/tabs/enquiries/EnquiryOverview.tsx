import React, { useMemo } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { Enquiry } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import './styles/ProspectOverview.css';

interface EnquiryOverviewProps {
  enquiry: Enquiry;
  onEditRating: (id: string) => void;
  onEditNotes: () => void;
  allEnquiries?: Enquiry[];
  onSelectEnquiry?: (enquiry: Enquiry) => void;
}

const EnquiryOverview: React.FC<EnquiryOverviewProps> = ({
  enquiry,
  onEditRating,
  onEditNotes,
  allEnquiries = [],
  onSelectEnquiry,
}) => {
  const { isDarkMode } = useTheme();

  const clientHistory = useMemo(() => {
    if (!allEnquiries || allEnquiries.length === 0) return [];

    const currentClientEmail = enquiry.Email?.toLowerCase();
    const currentClientName = `${enquiry.First_Name} ${enquiry.Last_Name}`.toLowerCase();

    return allEnquiries
      .filter((candidate) => {
        if (candidate.ID === enquiry.ID) return false;

        const enquiryEmail = candidate.Email?.toLowerCase();
        const enquiryName = `${candidate.First_Name} ${candidate.Last_Name}`.toLowerCase();

        return (currentClientEmail && enquiryEmail === currentClientEmail) ||
          (!currentClientEmail && enquiryName === currentClientName);
      })
      .sort((first, second) => {
        const firstDate = new Date(first.Touchpoint_Date || '').getTime();
        const secondDate = new Date(second.Touchpoint_Date || '').getTime();
        return secondDate - firstDate;
      });
  }, [allEnquiries, enquiry.Email, enquiry.First_Name, enquiry.Last_Name, enquiry.ID]);

  const mapRatingToStyle = (rating: string | undefined) => {
    switch (rating) {
      case 'Good':
        return { color: colours.green, icon: 'LikeSolid', isBorder: false };
      case 'Neutral':
        return { color: colours.greyText, icon: 'Like', isBorder: false };
      case 'Poor':
        return { color: colours.red, icon: 'DislikeSolid', isBorder: false };
      default:
        return { color: colours.red, icon: 'StatusCircleQuestionMark', isBorder: true };
    }
  };

  const ratingStyle = mapRatingToStyle(enquiry.Rating);

  const formatTouchpointDate = (dateString: string): string => {
    const touchDate = new Date(dateString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isToday =
      touchDate.getDate() === today.getDate() &&
      touchDate.getMonth() === today.getMonth() &&
      touchDate.getFullYear() === today.getFullYear();

    const isYesterday =
      touchDate.getDate() === yesterday.getDate() &&
      touchDate.getMonth() === yesterday.getMonth() &&
      touchDate.getFullYear() === yesterday.getFullYear();

    if (isToday) return 'Enquired today';
    if (isYesterday) return 'Enquired yesterday';

    const dayDifference = Math.floor(
      (today.getTime() - touchDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (dayDifference < 7) {
      return `Enquired on ${touchDate.toLocaleDateString(undefined, {
        weekday: 'long',
      })}`;
    }

    return `Enquired on ${touchDate.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })}`;
  };

  const formatValue = (value?: string): string => {
    if (!value) return 'N/A';
    const number = parseFloat(value.replace(/[^0-9.-]+/g, ''));
    if (isNaN(number)) return value;
    return new Intl.NumberFormat('en-UK', {
      style: 'currency',
      currency: 'GBP',
    }).format(number);
  };

  const formatHistoryDate = (dateString?: string): string => {
    if (!dateString) return 'Unknown date';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return dateString;
    return parsed.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const cleanedNotes = (enquiry.Initial_first_call_notes || '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const areaLabel = enquiry.Area_of_Work?.toLowerCase().includes('other') || enquiry.Area_of_Work?.toLowerCase().includes('unsure')
    ? 'Other'
    : (enquiry.Area_of_Work || 'Unspecified');

  const quickFacts = [
    { label: 'Touchpoint', value: formatTouchpointDate(enquiry.Touchpoint_Date || enquiry.Date_Created || ''), icon: 'Clock' },
    { label: 'Area', value: areaLabel, icon: 'Tag' },
    { label: 'Value', value: formatValue(enquiry.Value), icon: 'Money' },
    { label: 'Method', value: enquiry.Method_of_Contact || 'Unknown', icon: 'ContactCard' },
    { label: 'Source', value: enquiry.Ultimate_Source || 'Unspecified', icon: 'Globe' },
    { label: 'Enquiry ID', value: enquiry.ID || 'Unknown', icon: 'NumberSymbol' },
  ];

  const contactDetails = [
    { label: 'Email', value: enquiry.Email || 'Not captured', icon: 'Mail' },
    { label: 'Phone', value: enquiry.Phone_Number || 'Not captured', icon: 'Phone' },
    { label: 'Company', value: enquiry.Company || 'Individual enquiry', icon: 'Building' },
    { label: 'Client type', value: enquiry.Type_of_Work || 'Not categorised', icon: 'People' },
  ];

  const showCallAction = Boolean(enquiry.Phone_Number);
  const showMailAction = Boolean(enquiry.Email);

  return (
    <div className="prospect-overview-shell">
      <section className="helix-panel prospect-overview-hero prospect-overview-enter" data-tier="0">
        <div className="prospect-overview-hero-main">
          <div className="prospect-overview-kicker">Prospect overview</div>
          <div className="prospect-overview-identity-row">
            <div className="prospect-overview-avatar" aria-hidden="true">
              <Icon iconName="Contact" />
            </div>
            <div className="prospect-overview-identity-block">
              <h2 className="prospect-overview-name">{enquiry.First_Name} {enquiry.Last_Name}</h2>
              <div className="prospect-overview-subline">
                <span>{enquiry.Company || 'Private individual'}</span>
                <span className="prospect-overview-subline-sep" aria-hidden="true">•</span>
                <span>{formatTouchpointDate(enquiry.Touchpoint_Date || enquiry.Date_Created || '')}</span>
              </div>
            </div>
          </div>
          <div className="prospect-overview-chip-row">
            {quickFacts.map((fact) => (
              <div key={fact.label} className="prospect-overview-chip">
                <span className="prospect-overview-chip-icon" aria-hidden="true">
                  <Icon iconName={fact.icon} />
                </span>
                <span className="prospect-overview-chip-label">{fact.label}</span>
                <span className="prospect-overview-chip-value">{fact.value}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="prospect-overview-hero-side">
          <div className="prospect-overview-actions">
            <TooltipHost content={showCallAction ? 'Call client' : 'No phone number captured'}>
              <button
                type="button"
                className="prospect-overview-action"
                onClick={() => {
                  if (!showCallAction) return;
                  window.location.href = `tel:${enquiry.Phone_Number}`;
                }}
                disabled={!showCallAction}
              >
                <Icon iconName="Phone" />
                <span>Call</span>
              </button>
            </TooltipHost>
            <TooltipHost content={showMailAction ? 'Email client' : 'No email captured'}>
              <button
                type="button"
                className="prospect-overview-action"
                onClick={() => {
                  if (!showMailAction) return;
                  window.location.href = `mailto:${enquiry.Email}?subject=Your%20Enquiry`;
                }}
                disabled={!showMailAction}
              >
                <Icon iconName="Mail" />
                <span>Email</span>
              </button>
            </TooltipHost>
            <button
              type="button"
              className="prospect-overview-action prospect-overview-action--accent"
              onClick={onEditNotes}
            >
              <Icon iconName="Edit" />
              <span>Edit notes</span>
            </button>
          </div>

          <TooltipHost content={enquiry.Rating ? `Edit rating: ${enquiry.Rating}` : 'Set rating'}>
            <button
              type="button"
              className="prospect-overview-rating"
              onClick={() => onEditRating(enquiry.ID)}
              style={{
                borderColor: ratingStyle.color,
                background: ratingStyle.isBorder ? 'transparent' : ratingStyle.color,
                color: ratingStyle.isBorder
                  ? (isDarkMode ? colours.dark.text : colours.light.text)
                  : '#ffffff',
              }}
            >
              <span className="prospect-overview-rating-icon">
                <Icon iconName={ratingStyle.icon} />
              </span>
              <span className="prospect-overview-rating-copy">
                <span className="prospect-overview-rating-label">Rating</span>
                <span className="prospect-overview-rating-value">{enquiry.Rating || 'Not rated'}</span>
              </span>
            </button>
          </TooltipHost>
        </aside>
      </section>

      <div className="prospect-overview-grid prospect-overview-enter" data-tier="1">
        <section className="helix-panel prospect-overview-panel prospect-overview-panel--notes">
          <div className="prospect-overview-panel-head">
            <div>
              <div className="prospect-overview-panel-kicker">Call context</div>
              <h3 className="prospect-overview-panel-title">Initial notes</h3>
            </div>
            <button type="button" className="prospect-overview-inline-action" onClick={onEditNotes}>
              <Icon iconName="Edit" />
              <span>Edit</span>
            </button>
          </div>
          <div className={`prospect-overview-notes ${cleanedNotes ? '' : 'is-empty'}`}>
            {cleanedNotes || 'No notes captured yet.'}
          </div>
        </section>

        <section className="helix-panel prospect-overview-panel">
          <div className="prospect-overview-panel-head">
            <div>
              <div className="prospect-overview-panel-kicker">Contact</div>
              <h3 className="prospect-overview-panel-title">Client snapshot</h3>
            </div>
          </div>
          <div className="prospect-overview-detail-list">
            {contactDetails.map((detail) => (
              <div key={detail.label} className="prospect-overview-detail-item">
                <div className="prospect-overview-detail-label">
                  <Icon iconName={detail.icon} />
                  <span>{detail.label}</span>
                </div>
                <div className="prospect-overview-detail-value">{detail.value}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {clientHistory.length > 0 && (
        <section className="helix-panel prospect-overview-panel prospect-overview-history prospect-overview-enter" data-tier="2">
          <div className="prospect-overview-panel-head">
            <div>
              <div className="prospect-overview-panel-kicker">Relationship</div>
              <h3 className="prospect-overview-panel-title">Client history</h3>
            </div>
            <div className="prospect-overview-history-count">
              {clientHistory.length} previous enquir{clientHistory.length === 1 ? 'y' : 'ies'}
            </div>
          </div>

          <div className="prospect-overview-history-list">
            {clientHistory.map((historyEnquiry) => (
              <button
                key={historyEnquiry.ID}
                type="button"
                className="prospect-overview-history-item"
                onClick={() => onSelectEnquiry?.(historyEnquiry)}
                disabled={!onSelectEnquiry}
              >
                <div className="prospect-overview-history-main">
                  <div className="prospect-overview-history-title-row">
                    <span className="prospect-overview-history-area">
                      {historyEnquiry.Area_of_Work?.toLowerCase().includes('other') || historyEnquiry.Area_of_Work?.toLowerCase().includes('unsure') ? 'Other' : historyEnquiry.Area_of_Work || 'Unspecified'}
                    </span>
                    {historyEnquiry.Type_of_Work && (
                      <span className="prospect-overview-history-type">{historyEnquiry.Type_of_Work}</span>
                    )}
                  </div>
                  <div className="prospect-overview-history-meta">
                    <span>{formatHistoryDate(historyEnquiry.Touchpoint_Date)}</span>
                    {historyEnquiry.Value && <span>{historyEnquiry.Value}</span>}
                    <span>ID {historyEnquiry.ID}</span>
                  </div>
                </div>
                {onSelectEnquiry && (
                  <span className="prospect-overview-history-chevron" aria-hidden="true">
                    <Icon iconName="ChevronRight" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default EnquiryOverview;
