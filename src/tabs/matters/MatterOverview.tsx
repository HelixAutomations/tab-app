// src/tabs/matters/MatterOverview.tsx

import React from 'react';
import { Stack, Text, IconButton, mergeStyles } from '@fluentui/react';
import { Matter } from '../../app/functionality/types';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

interface MatterOverviewProps {
  matter: Matter;
  onEdit?: () => void; // Optional prop for edit functionality
}

const MatterOverview: React.FC<MatterOverviewProps> = ({ matter, onEdit }) => {
  const { isDarkMode } = useTheme();

  return (
    <Stack tokens={{ childrenGap: 20 }}>
      {/* Header with Edit Button */}
      <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
        <Text
          variant="xLarge"
          styles={{
            root: {
              fontWeight: '700',
              color: isDarkMode ? colours.dark.text : colours.light.text,
              fontFamily: 'Raleway, sans-serif',
            },
          }}
        >
          Matter Overview
        </Text>
        {onEdit && (
          <IconButton
            iconProps={{ iconName: 'Edit' }}
            title="Edit Matter"
            ariaLabel="Edit Matter"
            onClick={onEdit}
            styles={{
              root: {
                color: isDarkMode ? colours.dark.text : colours.light.text,
              },
            }}
          />
        )}
      </Stack>

      {/* Matter Details */}
      <Stack tokens={{ childrenGap: 10 }}>
        <Text
          variant="large"
          styles={{
            root: {
              fontWeight: '600',
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
          }}
        >
          {matter.DisplayNumber} - {matter.ClientName}
        </Text>
        <Text
          variant="medium"
          styles={{
            root: {
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
          }}
        >
          <strong>Practice Area:</strong> {matter.PracticeArea}
        </Text>
        <Text
          variant="medium"
          styles={{
            root: {
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
          }}
        >
          <strong>Originating Solicitor:</strong> {matter.OriginatingSolicitor}
        </Text>
        <Text
          variant="medium"
          styles={{
            root: {
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
          }}
        >
          <strong>Approx. Value:</strong> {matter.ApproxValue}
        </Text>
        <Text
          variant="medium"
          styles={{
            root: {
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
          }}
        >
          <strong>Description:</strong> {matter.Description}
        </Text>
        <Text
          variant="medium"
          styles={{
            root: {
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
          }}
        >
          <strong>Open Date:</strong> {matter.OpenDate ? new Date(matter.OpenDate).toLocaleDateString() : 'N/A'}
        </Text>
        {/* Add more details as needed */}
      </Stack>
    </Stack>
  );
};

export default MatterOverview;
