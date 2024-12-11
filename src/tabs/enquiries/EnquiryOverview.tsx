// src/EnquiryOverview.tsx

import React from 'react';
import {
  Stack,
  Text,
  Icon,
  mergeStyles,
  Separator,
  TooltipHost,
  IconButton,
} from '@fluentui/react';
import { Enquiry } from '../../app/functionality/types'; // Correct import
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme

interface EnquiryOverviewProps {
  enquiry: Enquiry;
  onEditRating: (id: string) => void; // Function to open modal to edit rating
  onEditNotes: () => void; // Function to trigger editing notes
}

const EnquiryOverview: React.FC<EnquiryOverviewProps> = ({
  enquiry,
  onEditRating,
  onEditNotes,
}) => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context

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
        return { color: colours.red, icon: 'StatusCircleQuestionMark', isBorder: true }; // Red border for "Not Rated"
    }
  };

  const ratingStyle = mapRatingToStyle(enquiry.Rating); // Use enquiry.Rating directly

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
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)', // Subtle shadow
    backgroundColor: ratingStyle.isBorder ? 'transparent' : ratingStyle.color, // Transparent for "Not Rated"
    border: ratingStyle.isBorder ? `2px solid ${ratingStyle.color}` : 'none', // Add border for "Not Rated"
    color: ratingStyle.isBorder
      ? isDarkMode
        ? colours.dark.text // Match text colour in dark mode
        : colours.light.text // Match text colour in light mode
      : 'white', // White for filled bubbles
    ':hover': {
      transform: 'scale(1.1)',
    },
  });

  // Handler for clicking the rating bubble
  const handleRatingClick = () => {
    onEditRating(enquiry.ID); // Trigger the modal to edit rating
  };

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

  return (
    <Stack
      tokens={{ childrenGap: 20 }}
      styles={{
        root: {
          padding: '20px',
          backgroundColor: isDarkMode
            ? colours.dark.sectionBackground
            : colours.light.sectionBackground,
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
      }}
    >
      {/* Header Section: Name, Company, and Actions */}
      <Stack
        horizontal
        horizontalAlign="space-between"
        verticalAlign="center"
        tokens={{ childrenGap: 15 }}
        styles={{
          root: {
            marginBottom: '0px', // Reduced margin-bottom
            paddingTop: '12px', // Adjusted padding-top
            paddingBottom: '0px', // Adjusted padding-bottom
          },
        }}
      >
        {/* Name and Company */}
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
                styles={{
                  root: {
                    fontSize: 16,
                    color: colours.highlight,
                  },
                }}
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

        {/* Actions */}
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
                e.stopPropagation(); // Prevent triggering parent click handlers
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
                e.stopPropagation(); // Prevent triggering parent click handlers
                window.location.href = enquiry.Email
                  ? `mailto:${enquiry.Email}`
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
              onClick={handleRatingClick} // Make the rating bubble clickable
              title="Edit Rating"
              aria-label="Edit Rating"
            >
              <Icon iconName={ratingStyle.icon} />
            </div>
          </TooltipHost>
        </Stack>
      </Stack>

      <Separator />

      {/* Enquiry Notes */}
      <Stack tokens={{ childrenGap: 10 }}>
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
          <Text
            variant="mediumPlus"
            styles={{ root: { fontWeight: 700, color: colours.highlight } }}
          >
            Enquiry Notes:
          </Text>
          <IconButton
            iconProps={{ iconName: 'Edit' }}
            title="Edit Notes"
            ariaLabel="Edit Notes"
            onClick={onEditNotes} // Trigger the edit dialog
            styles={{
              root: {
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: isDarkMode ? colours.dark.iconColor : colours.light.iconColor,
                ':hover': {
                  color: colours.blue,
                },
              },
            }}
          />
        </Stack>
        <Text
          variant="medium"
          styles={{
            root: {
              color: isDarkMode ? colours.dark.text : colours.light.text,
              whiteSpace: 'pre-wrap',
            },
          }}
        >
          {enquiry.Initial_first_call_notes || 'N/A'}
        </Text>
      </Stack>

      <Separator />

      {/* Touchpoint Date */}
      <Text
        variant="medium"
        styles={{
          root: { color: isDarkMode ? colours.dark.text : colours.light.text },
        }}
      >
        {formatTouchpointDate(enquiry.Touchpoint_Date)}
      </Text>

      <Separator />

      {/* Tags Section */}
      <Stack horizontal tokens={{ childrenGap: 10 }} wrap>
        {/* Area of Work Tag */}
        {enquiry.Area_of_Work && (
          <TooltipHost content="Area of Work">
            <div
              className={mergeStyles({
                display: 'flex',
                alignItems: 'center',
                backgroundColor: colours.tagBackground,
                color: isDarkMode
                  ? colours.dark.text
                  : colours.light.text,
                borderRadius: '4px',
                padding: '4px 8px',
              })}
            >
              <Icon iconName="Tag" style={{ marginRight: '4px' }} />
              <Text variant="small">{enquiry.Area_of_Work}</Text>
            </div>
          </TooltipHost>
        )}

        {/* Value Tag */}
        {enquiry.Value && (
          <TooltipHost content="Value">
            <div
              className={mergeStyles({
                display: 'flex',
                alignItems: 'center',
                backgroundColor: colours.tagBackground,
                color: isDarkMode
                  ? colours.dark.text
                  : colours.light.text,
                borderRadius: '4px',
                padding: '4px 8px',
              })}
            >
              <Icon iconName="Money" style={{ marginRight: '4px' }} />
              <Text variant="small">{formatValue(enquiry.Value)}</Text>
            </div>
          </TooltipHost>
        )}

        {/* Method of Contact Tag */}
        {enquiry.Method_of_Contact && (
          <TooltipHost content="Method of Contact">
            <div
              className={mergeStyles({
                display: 'flex',
                alignItems: 'center',
                backgroundColor: colours.tagBackground,
                color: isDarkMode
                  ? colours.dark.text
                  : colours.light.text,
                borderRadius: '4px',
                padding: '4px 8px',
              })}
            >
              <Icon
                iconName="ContactCard"
                style={{ marginRight: '4px' }}
              />
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
                color: isDarkMode
                  ? colours.dark.text
                  : colours.light.text,
                borderRadius: '4px',
                padding: '4px 8px',
              })}
            >
              <Icon
                iconName="Info"
                style={{ marginRight: '4px' }} // Using 'Info' as a placeholder
              />
              <Text variant="small">{enquiry.Ultimate_Source}</Text>
            </div>
          </TooltipHost>
        )}

        {/* ID Tag */}
        {enquiry.ID && (
          <TooltipHost content="ID">
            <div
              className={mergeStyles({
                display: 'flex',
                alignItems: 'center',
                backgroundColor: colours.tagBackground,
                color: isDarkMode
                  ? colours.dark.text
                  : colours.light.text,
                borderRadius: '4px',
                padding: '4px 8px',
              })}
            >
              <Icon
                iconName="NumberSymbol"
                style={{ marginRight: '4px' }} // Using 'NumberSymbol' as a placeholder
              />
              <Text variant="small">{enquiry.ID}</Text>
            </div>
          </TooltipHost>
        )}
      </Stack>
    </Stack>
  );
};

export default EnquiryOverview;
