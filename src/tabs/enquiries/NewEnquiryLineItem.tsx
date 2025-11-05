import {
    Text,
    Stack,
    Icon,
    Separator,
} from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { NewEnquiry } from '../../app/functionality/newEnquiryTypes';
import { colours } from '../../app/styles/colours';
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

interface NewEnquiryLineItemProps {
  enquiry: NewEnquiry;
  onSelect: (enquiry: NewEnquiry) => void;
  onRate: (enquiryId: number) => void;
  onPitch?: (enquiry: NewEnquiry) => void;
  isLast?: boolean;
  isExpanded?: boolean;
}

const formatCurrency = (value: string): string => {
  if (!value || value.toLowerCase() === 'not specified') return 'Not specified';
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

const NewEnquiryLineItem: React.FC<NewEnquiryLineItemProps> = ({
  enquiry,
  onSelect,
  onRate,
  onPitch,
  isLast,
  isExpanded = false,
}) => {
  const { isDarkMode } = useTheme();

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
    backgroundColor: 'transparent',
    selectors: {
      ':hover': {
        backgroundColor: 'transparent',
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
        background: getAreaColor(enquiry.aow),
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

  const subMetaStyle = mergeStyles({
    fontSize: '11px',
    color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
    fontWeight: '500',
    marginTop: '1px',
  });

  const valueStyle = mergeStyles({
    fontSize: '13px',
    color: colours.highlight,
    fontWeight: '600',
  });

  const dateStyle = mergeStyles({
    fontSize: '11px',
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
    fontWeight: '500',
  });

  const idStyle = mergeStyles({
    fontSize: '10px',
    color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
    fontWeight: '500',
    marginTop: '1px',
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
      ':hover': {
        backgroundColor: colours.blue,
        transform: 'translateY(-0.5px)',
      },
      ':active': {
        transform: 'translateY(0)',
      },
    },
  });

  const actionBadgeStyle = mergeStyles({
    background: 'transparent',
    color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)',
    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'}`,
    backdropFilter: 'blur(8px)',
    padding: '6px 12px',
    borderRadius: 16,
    fontSize: 10,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 30,
    opacity: 0.75,
    transform: 'translateY(0) scale(1)',
    transition: 'all .25s cubic-bezier(.4,0,.2,1)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    lineHeight: 1,
    selectors: {
      ':hover': {
        background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
        color: colours.highlight,
        borderRadius: 14,
        borderColor: colours.highlight,
        transform: 'translateY(-1px) scale(1.02)',
        opacity: 1,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      },
      ':active': {
        background: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
        color: colours.blue,
        borderRadius: 14,
        transform: 'scale(0.97)'
      },
    },
  });

  const ratingBadgeStyle = (rating?: string) => mergeStyles({
    backgroundColor: rating 
      ? (rating === 'good' ? 'rgba(102, 170, 232, 0.15)' : 
         rating === 'neutral' ? 'rgba(128, 128, 128, 0.15)' : 'rgba(244, 67, 54, 0.15)')
      : 'rgba(54, 144, 206, 0.06)',
    color: rating 
      ? (rating === 'good' ? colours.blue : 
         rating === 'neutral' ? colours.grey : colours.cta)
      : 'rgba(54, 144, 206, 0.75)',
    border: rating 
      ? 'none' 
      : `1px solid rgba(54, 144, 206, 0.25)`,
    borderRadius: '16px',
    padding: '4px 10px',
    fontSize: '10px',
    fontWeight: '600',
    fontFamily: 'Raleway, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: !rating ? '0 0 0 1px rgba(54, 144, 206, 0.1)' : 'none',
    height: '24px',
    minWidth: '35px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    selectors: {
      ':hover': {
        backgroundColor: rating 
          ? (rating === 'good' ? 'rgba(102, 170, 232, 0.25)' : 
             rating === 'neutral' ? 'rgba(128, 128, 128, 0.25)' : 'rgba(244, 67, 54, 0.25)')
          : 'rgba(54, 144, 206, 0.12)',
        color: rating 
          ? (rating === 'good' ? colours.blue : 
             rating === 'neutral' ? colours.grey : colours.cta)
          : colours.highlight,
        boxShadow: !rating ? '0 2px 10px rgba(54, 144, 206, 0.15)' : undefined,
        transform: 'translateY(-0.5px)',
      },
      ':active': {
        transform: 'translateY(0)',
      },
    },
  });

  const fullName = `${enquiry.first} ${enquiry.last}`;

  // Expanded section styles
  const expandedSectionStyle = mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    padding: '24px',
    transition: 'all 0.3s ease',
  });

  const expandedContentStyle = mergeStyles({
    maxWidth: '800px',
  });

  const sectionHeaderStyle = mergeStyles({
    fontSize: '14px',
    fontWeight: '600',
    color: colours.blue,
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  });

  const notesStyle = mergeStyles({
    fontSize: '14px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    lineHeight: '1.5',
    marginBottom: '20px',
    padding: '16px',
    backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
    borderRadius: '8px',
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
  });

  const tagStyle = mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: '500',
    backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    borderRadius: '16px',
    marginRight: '8px',
    marginBottom: '8px',
  });

  const getSourceLabel = (source: string): string => {
    switch (source) {
      case 'organic': return 'Organic Search';
      case 'google_ads': return 'Google Ads';
      case 'referral': return 'Referral';
      case 'web_form': return 'Web Form';
      default: return source;
    }
  };

  const getSourceIcon = (source: string): string => {
    switch (source) {
      case 'organic': return 'SearchAndApps';
      case 'google_ads': return 'BingLogo';
      case 'referral': return 'People';
      case 'web_form': return 'WebAppBuilderModule';
      default: return 'Info';
    }
  };

  const getMethodIcon = (method: string): string => {
    switch (method) {
      case 'phone': return 'Phone';
      case 'email': return 'Mail';
      case 'web_form': return 'WebAppBuilderModule';
      default: return 'ContactInfo';
    }
  };

  const getRankColor = (rank: string): string => {
    switch (rank) {
      case 'A': return colours.blue;
      case 'B': return colours.yellow;
      case 'C': return colours.orange;
      default: return colours.grey;
    }
  };

  return (
    <>
      <div className={lineItemStyle} onClick={handleClick}>
        {/* Main content grid */}
        <div className={mainContentStyle}>
          {/* Contact Info */}
          <div>
            <div>
              <CopyableText value={fullName} className={nameStyle} label="Name" />
            </div>
            {enquiry.company_referrer && (
              <div className={companyStyle}>{enquiry.company_referrer}</div>
            )}
            <div>
              <CopyableText value={enquiry.email} className={emailStyle} label="Email" />
            </div>
          </div>

          {/* Area, Type & Value */}
          <div>
            <div className={metaStyle}>{enquiry.aow}</div>
            {enquiry.tow && (
              <div className={subMetaStyle}>{enquiry.tow}</div>
            )}
            <div className={valueStyle} style={{ marginTop: '2px' }}>
              {enquiry.value ? formatCurrency(enquiry.value) : 'Not specified'}
            </div>
          </div>

          {/* Date & ID */}
          <div>
            <div className={dateStyle}>
              {formatDate(enquiry.datetime)}
            </div>
            <div className={idStyle}>
              {enquiry.acid}
            </div>
          </div>

          {/* Actions - All CTA Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button
              className={pitchButtonStyle}
              onClick={(e) => {
                e.stopPropagation();
                if (onPitch) {
                  onPitch(enquiry);
                }
              }}
            >
              Pitch
            </button>
            
            <button
              className={actionBadgeStyle}
              onClick={(e) => {
                e.stopPropagation();
                if (enquiry.phone) {
                  window.location.href = `tel:${enquiry.phone}`;
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
                if (enquiry.email) {
                  window.location.href = `mailto:${enquiry.email}?subject=Your%20Enquiry`;
                }
              }}
              title="Email"
            >
              <Icon iconName="Mail" style={{ fontSize: '10px' }} />
            </button>

            <button
              className={ratingBadgeStyle(enquiry.rating)}
              onClick={(e) => {
                e.stopPropagation();
                onRate(enquiry.id);
              }}
              title={enquiry.rating ? `Rating: ${enquiry.rating}` : 'Rate Enquiry'}
            >
              <Icon 
                iconName={enquiry.rating 
                  ? (enquiry.rating === 'poor' ? 'DislikeSolid' : 'LikeSolid')
                  : 'Like'
                }
                style={{ fontSize: '10px' }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Section - only show unique information */}
      {isExpanded && (
        <div className={expandedSectionStyle}>
          <div className={expandedContentStyle}>
            {/* Enquiry Details */}
            {enquiry.notes && (
              <div style={{ marginBottom: '24px' }}>
                <div className={sectionHeaderStyle}>
                  <Icon iconName="FileComment" />
                  Enquiry Details
                </div>
                <div className={notesStyle}>
                  {enquiry.notes}
                </div>
              </div>
            )}

            {/* Additional Information */}
            <div>
              <div className={sectionHeaderStyle}>
                <Icon iconName="Info" />
                Additional Information
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {/* Source */}
                {enquiry.source && (
                  <div className={tagStyle}>
                    <Icon iconName={getSourceIcon(enquiry.source)} />
                    {getSourceLabel(enquiry.source)}
                  </div>
                )}

                {/* Method of Contact */}
                {enquiry.moc && (
                  <div className={tagStyle}>
                    <Icon iconName={getMethodIcon(enquiry.moc)} />
                    {enquiry.moc === 'phone' ? 'Phone Call' : 
                     enquiry.moc === 'email' ? 'Email' : 
                     enquiry.moc === 'web_form' ? 'Web Form' : enquiry.moc}
                  </div>
                )}

                {/* Priority Rank */}
                {enquiry.rank && (
                  <div className={mergeStyles(tagStyle, {
                    borderColor: getRankColor(enquiry.rank),
                    color: getRankColor(enquiry.rank),
                    fontWeight: '600',
                  })}>
                    <Icon iconName="FlagSolid" />
                    Priority {enquiry.rank}
                  </div>
                )}

                {/* Representative */}
                {enquiry.rep && (
                  <div className={tagStyle}>
                    <Icon iconName="Contact" />
                    Rep: {enquiry.rep}
                  </div>
                )}

                {/* Contact Referrer */}
                {enquiry.contact_referrer && (
                  <div className={tagStyle}>
                    <Icon iconName="People" />
                    Referred by: {enquiry.contact_referrer}
                  </div>
                )}

                {/* Google Click ID */}
                {enquiry.gclid && (
                  <div className={tagStyle}>
                    <Icon iconName="BingLogo" />
                    Google Ads
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NewEnquiryLineItem;
