// src/EnquiryCard.tsx

import React from 'react';
import {
  Stack,
  Text,
  Icon,
  IconButton,
  TooltipHost,
  IButtonStyles,
} from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { Enquiry } from '../../app/functionality/FeContext';
import { colours } from '../../app/styles/colours';
import RatingIndicator from './RatingIndicator';
import { cleanNotes } from '../../app/functionality/textUtils';
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme

const iconButtonStyles = (iconColor: string): IButtonStyles => ({
  root: {
    marginBottom: '8px',
    color: iconColor,
    backgroundColor: 'transparent',
    border: 'none',
    selectors: {
      ':hover': {
        backgroundColor: colours.cta,
        color: '#ffffff',
      },
      ':focus': {
        backgroundColor: colours.cta,
        color: '#ffffff',
      },
    },
    height: '20px',
    width: '20px',
    padding: '0px',
    boxShadow: 'none',
  },
  icon: {
    fontSize: '16px',
    lineHeight: '20px',
    color: iconColor,
  },
});

const leftBorderColor = (areaOfWork: string) => {
  // Normalize the input to lowercase
  const normalizedArea = areaOfWork?.toLowerCase(); // Handle null/undefined safely

  switch (normalizedArea) {
    case 'commercial':
      return colours.blue;
    case 'construction':
      return colours.orange;
    case 'property':
      return colours.green;
    case 'employment':
      return colours.yellow;
    default:
      return colours.cta; // Default colour
  }
};

// Updated separator style to ensure it's not affected by content size
const separatorStyle = (isDarkMode: boolean) =>
  mergeStyles({
    width: '1px',
    backgroundColor: isDarkMode ? colours.dark.border : colours.light.border,
    margin: '0 10px',
    alignSelf: 'stretch',
  });

const cardStyle = (isDarkMode: boolean, areaOfWork: string) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between', // Ensure proper spacing between sections
    height: 'auto', // Allow content to adjust within the card
    padding: '20px',
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    borderRadius: '8px',
    borderLeft: `4px solid ${leftBorderColor(areaOfWork)}`,
    boxShadow: isDarkMode
      ? '0 2px 8px rgba(255,255,255,0.1)'
      : '0 2px 8px rgba(0,0,0,0.1)',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.3s',
    ':hover': {
      transform: 'scale(1.02)',
      boxShadow: isDarkMode
        ? '0 4px 16px rgba(255,255,255,0.2)'
        : '0 4px 16px rgba(0,0,0,0.2)',
      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
    },
    overflow: 'hidden', // Prevent overflow from breaking layout
  });

// New style for truncated text (3-4 lines)
const truncatedTextStyle = mergeStyles({
  display: '-webkit-box',
  WebkitLineClamp: 3, // Limit to 3 lines
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  textOverflow: 'ellipsis', // Add ellipsis
  whiteSpace: 'normal', // Ensure wrapping works for multiple lines
});

interface EnquiryCardProps {
  enquiry: Enquiry;
  onSelect: (enquiry: Enquiry) => void;
  onRate: (enquiryId: string) => void;
}

const formatCurrency = (value: string): string => {
  const regex = /(?:£)?(\d{1,3}(?:,\d{3})*)(?: to £?(\d{1,3}(?:,\d{3})*))?/;
  const matches = value.match(regex);
  if (!matches) return value;

  return matches
    .slice(1)
    .filter(Boolean)
    .map((num) =>
      num.includes("£")
        ? num.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,")
        : `£${parseInt(num.replace(/,/g, ''), 10).toLocaleString()}`
    )
    .join(" to ");
};

const EnquiryCard: React.FC<EnquiryCardProps> = ({ enquiry, onSelect, onRate }) => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context

  const handleCardClick = () => {
    onSelect(enquiry);
  };

  const enquiryDetailsTop = [
    { label: 'Value', value: formatCurrency(enquiry.Value || 'N/A') },
    { label: 'Initial Notes', value: enquiry.Initial_first_call_notes || 'N/A' },
  ];

  const enquiryDetailsBottom = [
    { label: '', value: new Date(enquiry.Touchpoint_Date).toLocaleDateString() },
    { label: '', value: enquiry.ID },
  ];

  return (
    <div
      className={cardStyle(isDarkMode, enquiry.Area_of_Work)}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleCardClick();
        }
      }}
      aria-label={`View details for enquiry ${enquiry.ID}`}
    >
      <Stack horizontal tokens={{ childrenGap: 20 }} verticalAlign="stretch" styles={{ root: { flexGrow: 1 } }}>
        {/* Left Side: Main Content */}
        <Stack tokens={{ childrenGap: 8 }} styles={{ root: { flex: 1, paddingRight: '10px' } }}>
          {/* Prospect Name and Company with Icon */}
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
            <Icon
              iconName="Contact"
              styles={{
                root: {
                  fontSize: 20,
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
            />
            <Text
              variant="mediumPlus"
              styles={{
                root: {
                  fontWeight: 'bold',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  cursor: 'pointer',
                },
              }}
            >
              {`${enquiry.First_Name} ${enquiry.Last_Name}`}
            </Text>
            {enquiry.Company && (
              <Text
                variant="mediumPlus"
                styles={{
                  root: {
                    fontWeight: 'normal',
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                  },
                }}
              >
                - {enquiry.Company}
              </Text>
            )}
          </Stack>

          {/* Spacer for increased spacing */}
          <div style={{ height: '12px' }} />

          {/* Top Details List */}
          <Stack tokens={{ childrenGap: 8 }}>
            {enquiryDetailsTop.map((item, index) => (
              item.value && (
                <Stack key={index} tokens={{ childrenGap: 4 }}>
                  <Text
                    variant="small"
                    styles={{
                      root: {
                        color: colours.highlight,
                        fontWeight: 'bold',
                      },
                    }}
                  >
                    {item.label}
                  </Text>
                  <div>
                    <Text
                      variant="small"
                      styles={{
                        root: {
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                        },
                      }}
                    >
                      {cleanNotes(item.value)} {/* Use the cleanNotes function here */}
                    </Text>
                  </div>
                </Stack>
              )
            ))}
          </Stack>

          {/* Spacer for separation between top and bottom details */}
          <div style={{ height: '12px' }} />

          {/* Bottom Details List */}
          <Stack tokens={{ childrenGap: 8 }}>
            {enquiryDetailsBottom.map((item, index) => (
              item.value && (
                <Text
                  key={index}
                  variant="small"
                  styles={{
                    root: {
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                      fontWeight: 'normal',
                    },
                  }}
                >
                  {item.value}
                </Text>
              )
            ))}
          </Stack>
        </Stack>

        {/* Vertical Separator */}
        <div className={separatorStyle(isDarkMode)} />

        {/* Right Side: Action Buttons Vertically Aligned */}
        <Stack
          tokens={{ childrenGap: 8 }}
          styles={{
            root: {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '60px', // Ensure action buttons have fixed space
            },
          }}
        >
          {/* Top Section: Call and Email Icons */}
          <Stack tokens={{ childrenGap: 8 }}>
            <TooltipHost content="Call Client">
              <IconButton
                iconProps={{ iconName: 'Phone' }}
                title="Call Client"
                ariaLabel="Call Client"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = enquiry.Phone_Number ? `tel:${enquiry.Phone_Number}` : '#';
                }}
                styles={iconButtonStyles(colours.cta)}
              />
            </TooltipHost>
            <TooltipHost content="Email Client">
              <IconButton
                iconProps={{ iconName: 'Mail' }}
                title="Email Client"
                ariaLabel="Email Client"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.href = enquiry.Email ? `mailto:${enquiry.Email}` : '#';
                }}
                styles={iconButtonStyles(colours.cta)}
              />
            </TooltipHost>
          </Stack>

          {/* Bottom Section: Rate Icon */}
          <TooltipHost content={enquiry.Rating ? `Rating: ${enquiry.Rating}` : 'Rate Enquiry'}>
            <RatingIndicator
              rating={enquiry.Rating}
              onClick={() => onRate(enquiry.ID)}
            />
          </TooltipHost>
        </Stack>
      </Stack>
    </div>
  );
};

export default EnquiryCard;
