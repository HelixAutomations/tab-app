import React, { useState } from 'react';
import {
  Stack,
  Text,
  IconButton,
  TooltipHost,
  IButtonStyles,
  Icon,
  Separator,
  PrimaryButton,
  DefaultButton,
  mergeStyles,
} from '@fluentui/react';
import { Enquiry, UserData } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import PitchBuilder from './PitchBuilder';

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

interface ExpandedEnquiryCardProps {
  enquiry: Enquiry;
  onRate: (enquiryId: string) => void;
  onBackToList: () => void;
  teamData?: TeamData[] | null;
  allEnquiries?: Enquiry[];
  userData: UserData[] | null;
  isLast?: boolean;
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

const iconButtonStyles = (iconColor: string): IButtonStyles => ({
  root: {
    color: iconColor,
    backgroundColor: 'transparent',
    border: 'none',
    selectors: {
      ':hover': {
        backgroundColor: colours.highlight,
        color: '#ffffff',
      },
      ':focus': {
        backgroundColor: colours.highlight,
        color: '#ffffff',
      },
    },
    height: '32px',
    width: '32px',
    padding: '0px',
    boxShadow: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: '16px',
    lineHeight: '1',
    color: iconColor,
  },
});

const ExpandedEnquiryCard: React.FC<ExpandedEnquiryCardProps> = ({
  enquiry,
  onRate,
  onBackToList,
  teamData,
  allEnquiries = [],
  userData,
  isLast,
}) => {
  const { isDarkMode } = useTheme();
  const [showPitchBuilder, setShowPitchBuilder] = useState(false);

  // Check if claimed
  const lowerPOC = enquiry.Point_of_Contact?.toLowerCase() || '';
  const isClaimed =
    lowerPOC &&
    ![
      'team@helix-law.com',
      'property@helix-law.com',
      'commercial@helix-law.com',
      'construction@helix-law.com',
      'employment@helix-law.com',
      'automations@helix-law.com',
    ].includes(lowerPOC);

  // Get claimer info
  const claimer = isClaimed
    ? teamData?.find((t) => t.Email?.toLowerCase() === lowerPOC)
    : undefined;

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

  // Function to map rating to style and icon
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

  // Style for the rating bubble
  const ratingBubbleStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    cursor: 'pointer',
    transition: 'transform 0.2s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    backgroundColor: ratingStyle.isBorder ? 'transparent' : ratingStyle.color,
    border: ratingStyle.isBorder ? `2px solid ${ratingStyle.color}` : 'none',
    color: ratingStyle.isBorder
      ? isDarkMode
        ? colours.dark.text
        : colours.light.text
      : 'white',
    ':hover': {
      transform: 'scale(1.1)',
    },
  });

  // Function to format touchpoint date
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

    if (isToday) return 'Enquired Today';
    if (isYesterday) return 'Enquired Yesterday';

    const dayDifference = Math.floor(
      (today.getTime() - touchDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (dayDifference < 7) {
      return `Enquired on ${touchDate.toLocaleDateString(undefined, {
        weekday: 'long',
      })}`;
    } else {
      return `Enquired on ${touchDate.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}`;
    }
  };

  // Function to format value as British £ with comma separators
  const formatValue = (value?: string): string => {
    if (!value) return 'N/A';
    const number = parseFloat(value.replace(/[^0-9.-]+/g, ""));
    if (isNaN(number)) return value;
    return new Intl.NumberFormat('en-UK', {
      style: 'currency',
      currency: 'GBP',
    }).format(number);
  };

  // Find other enquiries from the same client
  const getClientHistory = () => {
    if (!allEnquiries || allEnquiries.length === 0) return [];
    
    const currentClientEmail = enquiry.Email?.toLowerCase();
    const currentClientName = `${enquiry.First_Name} ${enquiry.Last_Name}`.toLowerCase();
    
    return allEnquiries.filter(enq => {
      if (enq.ID === enquiry.ID) return false; // Exclude current enquiry
      
      const enquiryEmail = enq.Email?.toLowerCase();
      const enquiryName = `${enq.First_Name} ${enq.Last_Name}`.toLowerCase();
      
      // Match by email (primary) or name (fallback)
      return (currentClientEmail && enquiryEmail === currentClientEmail) ||
             (!currentClientEmail && enquiryName === currentClientName);
    }).sort((a, b) => {
      // Sort by date, newest first
      const dateA = new Date(a.Touchpoint_Date || '').getTime();
      const dateB = new Date(b.Touchpoint_Date || '').getTime();
      return dateB - dateA;
    });
  };

  const clientHistory = getClientHistory();

  const cardStyle = mergeStyles({
    backgroundColor: isDarkMode 
      ? colours.dark.cardBackground 
      : colours.light.cardBackground,
    borderLeft: `4px solid ${getAreaColor(enquiry.Area_of_Work)}`,
    borderRadius: '0 8px 8px 0',
    boxShadow: isDarkMode
      ? '0 8px 32px rgba(0, 0, 0, 0.4)'
      : '0 8px 32px rgba(0, 0, 0, 0.15)',
    transition: 'all 0.3s ease',
    fontFamily: 'Raleway, sans-serif',
    overflow: 'hidden',
  });

  const backButtonStyle = mergeStyles({
    width: 32,
    height: 32,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDarkMode ? colours.dark.border : colours.light.border,
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    marginRight: 12,
    ':hover': {
      backgroundColor: colours.highlight,
      color: 'white',
    },
  });

  if (showPitchBuilder) {
    return (
      <div className={cardStyle}>
        {/* Header with back button */}
        <Stack
          horizontal
          verticalAlign="center"
          tokens={{ childrenGap: 12 }}
          styles={{
            root: {
              padding: '16px 24px',
              backgroundColor: isDarkMode 
                ? colours.dark.sectionBackground 
                : colours.light.sectionBackground,
              borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
            },
          }}
        >
          <IconButton
            iconProps={{ iconName: 'ChevronLeft' }}
            onClick={() => setShowPitchBuilder(false)}
            className={backButtonStyle}
            title="Back to Overview"
            ariaLabel="Back to Overview"
          />
          <Icon
            iconName="Contact"
            styles={{ root: { fontSize: 20, color: colours.highlight } }}
          />
          <Text
            variant="large"
            styles={{ root: { fontWeight: 600, color: colours.highlight } }}
          >
            {enquiry.First_Name} {enquiry.Last_Name} - Pitch Builder
          </Text>
        </Stack>

        {/* Pitch Builder */}
        <div style={{ padding: '24px' }}>
          <PitchBuilder enquiry={enquiry} userData={userData} />
        </div>
      </div>
    );
  }

  return (
    <div className={cardStyle}>
      {/* Header with back button and main info */}
      <Stack
        horizontal
        horizontalAlign="space-between"
        verticalAlign="center"
        tokens={{ childrenGap: 15 }}
        styles={{
          root: {
            padding: '20px 24px',
            backgroundColor: isDarkMode 
              ? colours.dark.sectionBackground 
              : colours.light.sectionBackground,
            borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
          },
        }}
      >
        {/* Left side - Back button and name */}
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
          <IconButton
            iconProps={{ iconName: 'ChevronLeft' }}
            onClick={onBackToList}
            className={backButtonStyle}
            title="Back to List"
            ariaLabel="Back to List"
          />
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
            <Icon
              iconName="Contact"
              styles={{ root: { fontSize: 24, color: colours.highlight } }}
            />
            <Text
              variant="xLarge"
              styles={{ root: { fontWeight: 700, color: colours.highlight } }}
            >
              {enquiry.First_Name} {enquiry.Last_Name}
            </Text>
            {enquiry.Company && (
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 4 }}>
                <Icon
                  iconName="Building"
                  styles={{ root: { fontSize: 16, color: colours.highlight } }}
                />
                <Text
                  variant="medium"
                  styles={{
                    root: {
                      fontWeight: 'normal',
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                    },
                  }}
                >
                  {enquiry.Company}
                </Text>
              </Stack>
            )}
          </Stack>
        </Stack>

        {/* Right side - Actions */}
        <Stack horizontal tokens={{ childrenGap: 15 }} verticalAlign="center">
          {/* Call Button */}
          <TooltipHost content="Call">
            <div
              className={mergeStyles({
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colours.grey,
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                color: isDarkMode
                  ? colours.dark.iconColor
                  : colours.light.iconColor,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                transition: 'background-color 0.2s, transform 0.2s',
                ':hover': {
                  backgroundColor: colours.blue,
                  transform: 'scale(1.05)',
                  color: 'white',
                },
              })}
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = enquiry.Phone_Number
                  ? `tel:${enquiry.Phone_Number}`
                  : '#';
              }}
              title="Call"
              aria-label="Call"
            >
              <Icon iconName="Phone" />
            </div>
          </TooltipHost>

          {/* Email Button */}
          <TooltipHost content="Email">
            <div
              className={mergeStyles({
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colours.grey,
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                color: isDarkMode
                  ? colours.dark.iconColor
                  : colours.light.iconColor,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                transition: 'background-color 0.2s, transform 0.2s',
                ':hover': {
                  backgroundColor: colours.blue,
                  transform: 'scale(1.05)',
                  color: 'white',
                },
              })}
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = enquiry.Email
                  ? `mailto:${enquiry.Email}?subject=Your%20Enquiry`
                  : '#';
              }}
              title="Email"
              aria-label="Email"
            >
              <Icon iconName="Mail" />
            </div>
          </TooltipHost>

          {/* Rating Bubble */}
          <TooltipHost content={enquiry.Rating ? `Edit Rating: ${enquiry.Rating}` : 'Not Rated'}>
            <div
              className={ratingBubbleStyle}
              onClick={() => onRate(enquiry.ID)}
              title="Edit Rating"
              aria-label="Edit Rating"
            >
              <Icon iconName={ratingStyle.icon} />
            </div>
          </TooltipHost>
        </Stack>
      </Stack>

      {/* Main Content */}
      <Stack
        tokens={{ childrenGap: 20 }}
        styles={{ root: { padding: '24px' } }}
      >
        {/* Contact Information Grid */}
        <Stack
          horizontal
          wrap
          tokens={{ childrenGap: 24 }}
          styles={{ root: { marginBottom: 16 } }}
        >
          <Stack tokens={{ childrenGap: 8 }} styles={{ root: { minWidth: 200 } }}>
            <Text
              variant="smallPlus"
              styles={{
                root: {
                  fontWeight: 600,
                  color: colours.highlight,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                },
              }}
            >
              Contact Details
            </Text>
            <Stack tokens={{ childrenGap: 4 }}>
              <CopyableText
                value={enquiry.Email}
                className={mergeStyles({
                  fontSize: '14px',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  cursor: 'copy',
                  ':hover': { color: colours.highlight },
                })}
                label="Email"
              />
              {enquiry.Phone_Number && (
                <CopyableText
                  value={enquiry.Phone_Number}
                  className={mergeStyles({
                    fontSize: '14px',
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    cursor: 'copy',
                    ':hover': { color: colours.highlight },
                  })}
                  label="Phone"
                />
              )}
            </Stack>
          </Stack>

          <Stack tokens={{ childrenGap: 8 }} styles={{ root: { minWidth: 200 } }}>
            <Text
              variant="smallPlus"
              styles={{
                root: {
                  fontWeight: 600,
                  color: colours.highlight,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                },
              }}
            >
              Work Details
            </Text>
            <Stack tokens={{ childrenGap: 4 }}>
              <Text
                variant="medium"
                styles={{
                  root: {
                    fontWeight: 600,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                  },
                }}
              >
                {enquiry.Area_of_Work?.toLowerCase().includes('other') || enquiry.Area_of_Work?.toLowerCase().includes('unsure') ? 'Other' : enquiry.Area_of_Work}
              </Text>
              {enquiry.Type_of_Work && (
                <Text
                  variant="small"
                  styles={{
                    root: {
                      color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    },
                  }}
                >
                  {enquiry.Type_of_Work}
                </Text>
              )}
            </Stack>
          </Stack>

          <Stack tokens={{ childrenGap: 8 }} styles={{ root: { minWidth: 150 } }}>
            <Text
              variant="smallPlus"
              styles={{
                root: {
                  fontWeight: 600,
                  color: colours.highlight,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                },
              }}
            >
              Value
            </Text>
            <Text
              variant="medium"
              styles={{
                root: {
                  fontWeight: 600,
                  color: colours.highlight,
                },
              }}
            >
              {enquiry.Value ? formatCurrency(enquiry.Value) : 'Not specified'}
            </Text>
          </Stack>

          <Stack tokens={{ childrenGap: 8 }} styles={{ root: { minWidth: 150 } }}>
            <Text
              variant="smallPlus"
              styles={{
                root: {
                  fontWeight: 600,
                  color: colours.highlight,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                },
              }}
            >
              Date
            </Text>
            <Text
              variant="small"
              styles={{
                root: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
            >
              {formatTouchpointDate(enquiry.Touchpoint_Date)}
            </Text>
            <Text
              variant="small"
              styles={{
                root: {
                  color: isDarkMode ? colours.dark.subText : colours.light.subText,
                  fontSize: '12px',
                },
              }}
            >
              ID: {enquiry.ID}
            </Text>
          </Stack>
        </Stack>

        <Separator />

        {/* Enquiry Notes */}
        <Stack tokens={{ childrenGap: 12 }}>
          <Text
            variant="mediumPlus"
            styles={{ root: { fontWeight: 700, color: colours.highlight } }}
          >
            Enquiry Notes
          </Text>
          <Text
            variant="medium"
            styles={{
              root: {
                color: isDarkMode ? colours.dark.text : colours.light.text,
                whiteSpace: 'pre-wrap',
                backgroundColor: isDarkMode 
                  ? colours.dark.sectionBackground 
                  : colours.light.sectionBackground,
                padding: '16px',
                borderRadius: '8px',
                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
              },
            }}
          >
            {enquiry.Initial_first_call_notes || 'No notes available'}
          </Text>
        </Stack>

        <Separator />

        {/* Tags Section */}
        <Stack tokens={{ childrenGap: 12 }}>
          <Text
            variant="mediumPlus"
            styles={{ root: { fontWeight: 700, color: colours.highlight } }}
          >
            Additional Information
          </Text>
          <Stack horizontal tokens={{ childrenGap: 10 }} wrap>
            {/* Method of Contact Tag */}
            {enquiry.Method_of_Contact && (
              <TooltipHost content="Method of Contact">
                <div
                  className={mergeStyles({
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: colours.tagBackground,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    borderRadius: '4px',
                    padding: '6px 10px',
                  })}
                >
                  <Icon iconName="ContactCard" style={{ marginRight: '6px' }} />
                  <Text variant="small">{enquiry.Method_of_Contact}</Text>
                </div>
              </TooltipHost>
            )}

            {/* Ultimate Source Tag */}
            {enquiry.Ultimate_Source && (
              <TooltipHost content="Ultimate Source">
                <div
                  className={mergeStyles({
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: colours.tagBackground,
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    borderRadius: '4px',
                    padding: '6px 10px',
                  })}
                >
                  <Icon iconName="Info" style={{ marginRight: '6px' }} />
                  <Text variant="small">{enquiry.Ultimate_Source}</Text>
                </div>
              </TooltipHost>
            )}

            {/* Claimer Badge */}
            {claimer && (
              <TooltipHost content={`Claimed by ${claimer['Full Name'] || claimer.Email}`}>
                <div
                  className={mergeStyles({
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: colours.blue,
                    color: 'white',
                    borderRadius: '4px',
                    padding: '6px 10px',
                  })}
                >
                  <Icon iconName="Contact" style={{ marginRight: '6px' }} />
                  <Text variant="small">{claimer.Initials || claimer.Email?.split('@')[0]}</Text>
                </div>
              </TooltipHost>
            )}
          </Stack>
        </Stack>

        {/* Client History Section */}
        {clientHistory.length > 0 && (
          <>
            <Separator />
            
            <Stack tokens={{ childrenGap: 15 }}>
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
                <Icon 
                  iconName="History" 
                  styles={{
                    root: {
                      fontSize: '16px',
                      color: colours.highlight,
                    }
                  }}
                />
                <Text 
                  variant="large" 
                  styles={{
                    root: {
                      fontWeight: '600',
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                    }
                  }}
                >
                  Client History ({clientHistory.length} previous enquir{clientHistory.length === 1 ? 'y' : 'ies'})
                </Text>
              </Stack>

              <Stack tokens={{ childrenGap: 12 }}>
                {clientHistory.slice(0, 3).map((historyEnquiry) => (
                  <div
                    key={historyEnquiry.ID}
                    className={mergeStyles({
                      padding: '16px',
                      backgroundColor: isDarkMode 
                        ? colours.dark.cardBackground 
                        : colours.light.cardBackground,
                      borderRadius: '8px',
                      border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                    })}
                  >
                    <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
                      <Stack tokens={{ childrenGap: 8 }}>
                        <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
                          <Text 
                            variant="medium" 
                            styles={{
                              root: {
                                fontWeight: '600',
                                color: isDarkMode ? colours.dark.text : colours.light.text,
                              }
                            }}
                          >
                            {historyEnquiry.Area_of_Work?.toLowerCase().includes('other') || historyEnquiry.Area_of_Work?.toLowerCase().includes('unsure') ? 'Other' : historyEnquiry.Area_of_Work}
                          </Text>
                          {historyEnquiry.Type_of_Work && (
                            <Text 
                              variant="small" 
                              styles={{
                                root: {
                                  color: isDarkMode ? colours.dark.subText : colours.light.subText,
                                  fontStyle: 'italic',
                                }
                              }}
                            >
                              {historyEnquiry.Type_of_Work}
                            </Text>
                          )}
                        </Stack>
                        
                        <Stack horizontal tokens={{ childrenGap: 16 }}>
                          <Text 
                            variant="small" 
                            styles={{
                              root: {
                                color: isDarkMode ? colours.dark.subText : colours.light.subText,
                              }
                            }}
                          >
                            {new Date(historyEnquiry.Touchpoint_Date || '').toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </Text>
                          
                          {historyEnquiry.Value && (
                            <Text 
                              variant="small" 
                              styles={{
                                root: {
                                  color: colours.highlight,
                                  fontWeight: '500',
                                }
                              }}
                            >
                              {historyEnquiry.Value}
                            </Text>
                          )}
                          
                          <Text 
                            variant="small" 
                            styles={{
                              root: {
                                color: isDarkMode ? colours.dark.subText : colours.light.subText,
                              }
                            }}
                          >
                            ID: {historyEnquiry.ID}
                          </Text>
                        </Stack>
                      </Stack>
                    </Stack>
                  </div>
                ))}
                
                {clientHistory.length > 3 && (
                  <Text 
                    variant="small" 
                    styles={{
                      root: {
                        textAlign: 'center',
                        color: isDarkMode ? colours.dark.subText : colours.light.subText,
                        fontStyle: 'italic',
                      }
                    }}
                  >
                    {clientHistory.length - 3} more previous enquiries
                  </Text>
                )}
              </Stack>
            </Stack>
          </>
        )}

        <Separator />

        {/* Action Buttons */}
        <Stack horizontal tokens={{ childrenGap: 16 }} horizontalAlign="center">
          <PrimaryButton
            text="Open Pitch Builder"
            iconProps={{ iconName: 'Mail' }}
            onClick={() => setShowPitchBuilder(true)}
            styles={{
              root: {
                backgroundColor: colours.highlight,
                borderColor: colours.highlight,
                fontFamily: 'Raleway, sans-serif',
                fontWeight: '600',
                minWidth: '160px',
                ':hover': {
                  backgroundColor: colours.blue,
                  borderColor: colours.blue,
                },
              },
            }}
          />
          <DefaultButton
            text="Back to List"
            iconProps={{ iconName: 'ChevronLeft' }}
            onClick={onBackToList}
            styles={{
              root: {
                fontFamily: 'Raleway, sans-serif',
                fontWeight: '600',
                minWidth: '120px',
              },
            }}
          />
        </Stack>
      </Stack>
    </div>
  );
};

export default ExpandedEnquiryCard;
