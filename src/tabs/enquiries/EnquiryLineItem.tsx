import {
    Text,
    Icon,
} from '@fluentui/react';
import { mergeStyles, keyframes } from '@fluentui/react/lib/Styling';
import { Enquiry } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import RatingIndicator from './RatingIndicator';
import { useTheme } from '../../app/functionality/ThemeContext';

import React, { useState } from 'react';

// Utility for copying text and showing feedback
function useCopyToClipboard(timeout = 1200): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    if (navigator && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), timeout);
      });
    }
  };
  return [copied, copy];
}

interface CopyableTextProps {
  value: string;
  className?: string;
  label?: string;
}

const CopyableText: React.FC<CopyableTextProps> = ({ value, className, label }) => {
  const [copied, copy] = useCopyToClipboard();
  return (
    <span
      className={className}
      title={copied ? `${label || 'Value'} copied!` : `Click to copy ${label || 'value'}`}
      onClick={e => {
        e.stopPropagation();
        copy(value);
      }}
      style={{ display: 'inline-block', position: 'relative' }}
    >
      {value}
      {copied && (
        <span style={{
          position: 'absolute',
          left: '100%',
          top: 0,
          marginLeft: 8,
          fontSize: 12,
          color: '#43a047',
          background: '#fff',
          borderRadius: 3,
          padding: '2px 6px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          zIndex: 10,
        }}>
          Copied!
        </span>
      )}
    </span>
  );
};


interface TeamData {
  'Created Date'?: string;
  'Created Time'?: string;
  'Full Name'?: string;
  'Last'?: string;
  'First'?: string;
  'Nickname'?: string;
  'Initials'?: string;
  'Email'?: string;
  'Entra ID'?: string;
  'Clio ID'?: string;
  'Rate'?: number;
  'Role'?: string;
  'AOW'?: string;
}

interface EnquiryLineItemProps {
  enquiry: Enquiry;
  onSelect: (enquiry: Enquiry) => void;
  onRate: (enquiryId: string) => void;
  onPitch?: (enquiry: Enquiry) => void;
  teamData?: TeamData[] | null;
  isLast?: boolean;
  userAOW?: string[]; // List of user's areas of work (lowercase)
  /**
   * Flag indicating this enquiry originated from the new direct getEnquiries route (not legacy/space data).
   * Used for transitional UI (e.g., pulsing claim indicator) before full component split.
   */
  isNewSource?: boolean;
}

const formatCurrency = (value: string): string => {
  const regex = /(?:£)?(\d{1,3}(?:,\d{3})*)(?: to £?(\d{1,3}(?:,\d{3})*))?/;
  const matches = value.match(regex);
  if (!matches) return value;

  return matches
    .slice(1)
    .filter(Boolean)
    .map((num) =>
      num.includes('£')
        ? num.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
        : `£${parseInt(num.replace(/,/g, ''), 10).toLocaleString()}`
    )
    .join(' to ');
};

const getAreaColor = (area: string): string => {
  switch (area?.toLowerCase()) {
    case 'commercial':
      return colours.blue;
    case 'construction':
      return colours.orange;
    case 'property':
      return colours.green;
    case 'employment':
      return colours.yellow;
    default:
      return colours.cta;
  }
};

const EnquiryLineItem: React.FC<EnquiryLineItemProps> = ({
  enquiry,
  onSelect,
  onRate,
  onPitch,
  teamData,
  isLast,
  userAOW,
  isNewSource = false,
}) => {
  const { isDarkMode } = useTheme();

  // Check if claimed
  const lowerPOC = enquiry.Point_of_Contact?.toLowerCase() || '';
  // Unclaimed criteria: ONLY team@helix-law.com (legacy distribution lists removed)
  const isClaimed = lowerPOC !== 'team@helix-law.com' && !!lowerPOC;

  // Get claimer info
  const claimer = isClaimed
    ? teamData?.find((t) => t.Email?.toLowerCase() === lowerPOC)
    : undefined;

  const handleClick = () => {
    onSelect(enquiry);
  };

  const formatDate = (dateStr: string): string => {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Determine if this enquiry should be greyed out (not in user's AOW)
  let isGreyedOut = false;
  if (userAOW && userAOW.length > 0 && enquiry.Area_of_Work) {
    const area = enquiry.Area_of_Work.toLowerCase();
    const hasFullAccess = userAOW.some(a => a.includes('operations') || a.includes('tech'));
    if (!hasFullAccess) {
      isGreyedOut = !userAOW.some(a => a === area || a.includes(area) || area.includes(a));
    }
  }

  const lineItemStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    padding: '8px 20px',
    borderBottom: !isLast ? `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}` : 'none',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontFamily: 'Raleway, sans-serif',
    minHeight: '44px',
    position: 'relative',
    backgroundColor: isGreyedOut ? (isDarkMode ? '#23272e' : '#f3f3f3') : 'transparent',
    opacity: isGreyedOut ? 0.5 : 1,
    filter: isGreyedOut ? 'grayscale(0.7)' : 'none',
    pointerEvents: isGreyedOut ? 'auto' : 'auto',
    selectors: {
      ':hover': {
        backgroundColor: isGreyedOut ? (isDarkMode ? '#23272e' : '#f3f3f3') : 'transparent',
        transform: 'translateX(2px)',
      },
      ':active': {
        transform: 'translateX(1px)',
      },
      '::before': {
        content: '""',
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 2,
        background: getAreaColor(enquiry.Area_of_Work),
        zIndex: 2,
        height: '100%',
        opacity: 0.6,
        transition: 'all 0.15s ease',
      },
      ':hover::before': {
        width: 3,
        opacity: 1,
      },
    },
  });

  // Animation + style for pulsing "claim me" indicator (new source, unclaimed only)
  const pulse = keyframes({
    '0%': { transform: 'scale(0.85)', opacity: 0.55 },
    '50%': { transform: 'scale(1.35)', opacity: 1 },
    '100%': { transform: 'scale(0.85)', opacity: 0.55 },
  });

  const pulseDotStyle = mergeStyles({
    position: 'absolute',
    left: 6, // just to the right of the coloured bar
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: colours.highlight,
    boxShadow: '0 0 0 4px rgba(102,170,232,0.25)',
    animationName: pulse,
    animationDuration: '1.8s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
    zIndex: 3,
    pointerEvents: 'none',
  });

  const mainContentStyle = mergeStyles({
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '2.5fr 1.2fr 1.2fr 1fr 120px',
    alignItems: 'center',
    gap: '16px',
    width: '100%',
  });

  const nameStyle = mergeStyles({
    fontWeight: '500',
    fontSize: '14px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    marginBottom: '2px',
    userSelect: 'text',
    cursor: 'copy',
    transition: 'color 0.2s',
    ':hover': {
      color: colours.highlight,
    },
  });

  const companyStyle = mergeStyles({
    fontSize: '12px',
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
    marginBottom: '1px',
    fontWeight: '500',
  });

  const emailStyle = mergeStyles({
    fontSize: '11px',
    color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
    userSelect: 'text',
    cursor: 'copy',
    transition: 'color 0.2s',
    fontWeight: '500',
    ':hover': {
      color: colours.highlight,
    },
  });

  const metaStyle = mergeStyles({
    fontSize: '13px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontWeight: '500',
  });

  const valueStyle = mergeStyles({
    fontSize: '12px',
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
    fontWeight: '500',
  });

  const dateStyle = mergeStyles({
    fontSize: '12px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontWeight: '500',
  });

  const actionsStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  });

  const claimerBadgeStyle = mergeStyles({
    fontSize: '10px',
    color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
    fontWeight: '500',
    marginTop: '1px',
  });

  const actionBadgeStyle = mergeStyles({
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
    border: 'none',
    borderRadius: '16px',
    padding: '4px 10px',
    fontSize: '10px',
    fontWeight: '600',
    fontFamily: 'Raleway, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: 'none',
    height: '24px',
    minWidth: '35px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    selectors: {
      ':hover': {
        backgroundColor: 'rgba(102, 170, 232, 0.15)',
        color: colours.highlight,
        transform: 'translateY(-0.5px)',
      },
      ':active': {
        transform: 'translateY(0)',
      },
    },
  });

  const pitchButtonStyle = mergeStyles({
    backgroundColor: colours.highlight,
    color: 'white',
    border: 'none',
    borderRadius: '16px',
    padding: '4px 12px',
    fontSize: '10px',
    fontWeight: '600',
    fontFamily: 'Raleway, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: 'none',
    height: '24px',
    minWidth: '45px',
    selectors: {
      ':hover:not(:disabled)': {
        backgroundColor: colours.blue,
        transform: 'translateY(-0.5px)',
      },
      ':active:not(:disabled)': {
        transform: 'translateY(0)',
      },
      ':disabled': {
        backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
        cursor: 'not-allowed',
      },
    },
  });

  const ratingBadgeStyle = (rating?: string) => mergeStyles({
    backgroundColor: rating 
      ? (rating === 'Good' ? 'rgba(102, 170, 232, 0.15)' : 
         rating === 'Neutral' ? 'rgba(128, 128, 128, 0.15)' : 'rgba(244, 67, 54, 0.15)')
      : (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
    color: rating 
      ? (rating === 'Good' ? colours.blue : 
         rating === 'Neutral' ? colours.grey : colours.cta)
      : (isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'),
    border: 'none',
    borderRadius: '16px',
    padding: '4px 10px',
    fontSize: '10px',
    fontWeight: '600',
    fontFamily: 'Raleway, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: 'none',
    height: '24px',
    minWidth: '35px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    selectors: {
      ':hover': {
        backgroundColor: rating 
          ? (rating === 'Good' ? 'rgba(102, 170, 232, 0.25)' : 
             rating === 'Neutral' ? 'rgba(128, 128, 128, 0.25)' : 'rgba(244, 67, 54, 0.25)')
          : 'rgba(102, 170, 232, 0.15)',
        color: rating 
          ? (rating === 'Good' ? colours.blue : 
             rating === 'Neutral' ? colours.grey : colours.cta)
          : colours.highlight,
        transform: 'translateY(-0.5px)',
      },
      ':active': {
        transform: 'translateY(0)',
      },
    },
  });

  const showPulseClaimIndicator = !isClaimed && isNewSource;

  return (
    <div className={lineItemStyle} onClick={handleClick}>
      {showPulseClaimIndicator && <span className={pulseDotStyle} aria-label="Unclaimed enquiry – action required" />}
      {/* Main content grid */}
      <div className={mainContentStyle}>
        {/* Contact Info */}
        <div>
          <div>
            <CopyableText value={`${enquiry.First_Name} ${enquiry.Last_Name}`} className={nameStyle} label="Name" />
          </div>
          {enquiry.Company && (
            <div className={companyStyle}>{enquiry.Company}</div>
          )}
          <div>
            <CopyableText value={enquiry.Email} className={emailStyle} label="Email" />
          </div>
        </div>

        {/* Area, Type & Value */}
        <div>
          <div className={metaStyle}>{enquiry.Area_of_Work}</div>
          {enquiry.Type_of_Work && (
            <Text variant="small" styles={{
              root: {
                color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
                fontSize: '11px',
                fontWeight: '500',
                marginTop: '1px',
              }
            }}>
              {enquiry.Type_of_Work}
            </Text>
          )}
          <div className={valueStyle} style={{ marginTop: '2px' }}>
            {enquiry.Value ? formatCurrency(enquiry.Value) : 'Not specified'}
          </div>
        </div>

        {/* Date & ID */}
        <div>
          <div className={dateStyle}>
            {formatDate(enquiry.Touchpoint_Date)}
          </div>
          <Text variant="small" styles={{
            root: {
              color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
              fontSize: '10px',
              fontWeight: '500',
              marginTop: '1px',
            }
          }}>
            ID: {enquiry.ID}
          </Text>
          {claimer && (
            <div className={claimerBadgeStyle}>
              {claimer.Initials || claimer.Email?.split('@')[0]}
            </div>
          )}
        </div>

        {/* Actions - All CTA Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginRight: '16px' }}>
          <button
            className={pitchButtonStyle}
            onClick={(e) => {
              e.stopPropagation();
              if (isClaimed && onPitch) {
                onPitch(enquiry);
              }
            }}
            disabled={!isClaimed}
            title={isClaimed ? 'Pitch this enquiry' : 'Pitch is only available for claimed enquiries'}
            style={{
              opacity: isClaimed ? 1 : 0.5,
              cursor: isClaimed ? 'pointer' : 'not-allowed',
            }}
          >
            Pitch
          </button>
          
          <button
            className={actionBadgeStyle}
            onClick={(e) => {
              e.stopPropagation();
              if (enquiry.Phone_Number) {
                window.location.href = `tel:${enquiry.Phone_Number}`;
              }
            }}
            title="Call"
          >
            <Icon iconName="Phone" style={{ fontSize: '10px' }} />
          </button>

          <button
            className={actionBadgeStyle}
            onClick={(e) => {
              e.stopPropagation();
              if (enquiry.Email) {
                window.location.href = `mailto:${enquiry.Email}?subject=Your%20Enquiry&bcc=1day@followupthen.com`;
              }
            }}
            title="Email"
          >
            <Icon iconName="Mail" style={{ fontSize: '10px' }} />
          </button>

          <button
            className={ratingBadgeStyle(enquiry.Rating)}
            onClick={(e) => {
              e.stopPropagation();
              onRate(enquiry.ID);
            }}
            title={enquiry.Rating ? `Rating: ${enquiry.Rating}` : 'Rate Enquiry'}
          >
            <Icon 
              iconName={enquiry.Rating 
                ? (enquiry.Rating === 'Poor' ? 'DislikeSolid' : 'LikeSolid')
                : 'Like'
              }
              style={{ fontSize: '10px' }}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnquiryLineItem;
