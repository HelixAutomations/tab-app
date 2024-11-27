// src/MatterCard.tsx

import React from 'react';
import { Stack, Text, Icon, IconButton, TooltipHost } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { Matter } from '../../app/functionality/FeContext';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme

interface MatterCardProps {
  matter: Matter;
  onSelect: (matter: Matter) => void;
}

const actionButtonStyle = {
  root: {
    marginBottom: '4px',
    color: colours.cta,
    selectors: {
      ':hover': {
        backgroundColor: colours.cta,
        color: '#ffffff',
      },
    },
    height: '32px',
    width: '32px',
  },
};

const separatorStyle = (isDarkMode: boolean) =>
  mergeStyles({
    width: '1px',
    backgroundColor: isDarkMode ? colours.dark.border : colours.light.border,
    margin: '0 10px',
    alignSelf: 'stretch',
  });

const cardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    borderRadius: '8px',
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
    width: '100%',
    boxSizing: 'border-box',
  });

interface DetailRowProps {
  label: string;
  value: string;
  isDarkMode: boolean;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, isDarkMode }) => (
  <Stack tokens={{ childrenGap: 4 }}>
    <Text
      variant="small"
      styles={{
        root: {
          color: colours.highlight,
          fontWeight: 'bold',
        },
      }}
    >
      {label}
    </Text>
    <Text
      variant="small"
      styles={{
        root: {
          color: isDarkMode ? colours.dark.text : colours.light.text,
        },
      }}
    >
      {value}
    </Text>
  </Stack>
);

const MatterCard: React.FC<MatterCardProps> = ({ matter, onSelect }) => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context

  const handleCardClick = () => {
    onSelect(matter);
  };

  const matterDetails = [
    { label: 'Approx. Value', value: matter["Approx. Value"] },
    { label: 'Practice Area', value: matter["Practice Area"] },
    { label: 'Description', value: matter.Description },
  ];

  return (
    <div
      className={cardStyle(isDarkMode)}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleCardClick();
        }
      }}
      aria-label={`View details for matter ${matter["Unique ID"]}`}
    >
      {/* Horizontal Stack to separate content and actions */}
      <Stack horizontal tokens={{ childrenGap: 20 }} verticalAlign="stretch">
        {/* Left Side: Main Content */}
        <Stack tokens={{ childrenGap: 8 }} styles={{ root: { flex: 1, paddingRight: '10px' } }}>
          {/* Display Number and Client Name with Icon */}
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
            <Icon
              iconName="OpenFolderHorizontal"
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
              {matter["Display Number"]}
            </Text>
            <Text
              variant="mediumPlus"
              styles={{
                root: {
                  fontWeight: 'normal',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
            >
              - {matter["Client Name"]}
            </Text>
          </Stack>

          {/* Spacer for increased spacing */}
          <div style={{ height: '12px' }} />

          {/* Details List */}
          <Stack tokens={{ childrenGap: 12 }}>
            {matterDetails.map((item, index) => (
              <DetailRow key={index} label={item.label} value={item.value} isDarkMode={isDarkMode} />
            ))}
          </Stack>

          {/* Spacer for bottom separation */}
          <div style={{ height: '12px' }} />

          {/* Open Date at the bottom without label */}
          <Text
            variant="small"
            styles={{
              root: {
                color: isDarkMode ? colours.dark.text : colours.light.text,
              },
            }}
          >
            {new Date(matter["Open Date"]).toLocaleDateString()}
          </Text>
        </Stack>

        {/* Vertical Separator */}
        <div className={separatorStyle(isDarkMode)} />

        {/* Right Side: Action Buttons Vertically Aligned */}
        <Stack tokens={{ childrenGap: 8 }} verticalAlign="start">
          <TooltipHost content="Call Client">
            <IconButton
              iconProps={{ iconName: 'Phone' }}
              title="Call Client"
              ariaLabel="Call Client"
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = matter["Client Phone"] ? `tel:${matter["Client Phone"]}` : '#';
              }}
              styles={actionButtonStyle}
            />
          </TooltipHost>
          <TooltipHost content="Email Client">
            <IconButton
              iconProps={{ iconName: 'Mail' }}
              title="Email Client"
              ariaLabel="Email Client"
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = matter["Client Email"] ? `mailto:${matter["Client Email"]}` : '#';
              }}
              styles={actionButtonStyle}
            />
          </TooltipHost>
        </Stack>
      </Stack>
    </div>
  );
};

export default MatterCard;
