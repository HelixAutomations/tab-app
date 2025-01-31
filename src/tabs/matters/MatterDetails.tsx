// src/tabs/matters/MatterDetails.tsx

import React from 'react';
import { Stack, Text, IconButton, mergeStyles, TextField, PrimaryButton } from '@fluentui/react';
import { Matter } from '../../app/functionality/types';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

interface MatterDetailsProps {
  matter: Matter;
  onUpdate: (updatedMatter: Matter) => void;
}

const MatterDetails: React.FC<MatterDetailsProps> = ({ matter, onUpdate }) => {
  const { isDarkMode } = useTheme();
  const [description, setDescription] = React.useState<string>(matter.Description || '');

  const handleSave = () => {
    const updatedMatter = { ...matter, Description: description };
    onUpdate(updatedMatter);
  };

  return (
    <Stack tokens={{ childrenGap: 20 }}>
      {/* Header */}
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
          Matter Details
        </Text>
        <IconButton
          iconProps={{ iconName: 'Info' }}
          title="More Info"
          ariaLabel="More Info"
          styles={{
            root: {
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
          }}
        />
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

      {/* Editable Description */}
      <TextField
        label="Description"
        multiline
        rows={5}
        value={description}
        onChange={(_, newValue) => setDescription(newValue || '')}
        styles={{
          root: {
            maxWidth: 600,
          },
          fieldGroup: {
            backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
            borderColor: isDarkMode ? colours.dark.border : colours.light.border,
          },
          field: {
            color: isDarkMode ? colours.dark.text : colours.light.text,
          },
        }}
      />

      {/* Save Button */}
      <PrimaryButton
        text="Save"
        onClick={handleSave}
        styles={{
          root: {
            backgroundColor: colours.cta,
            borderRadius: '4px',
            fontFamily: 'Raleway, sans-serif',
          },
          label: {
            color: 'white',
            fontWeight: '600',
          },
        }}
      />
    </Stack>
  );
};

export default MatterDetails;
