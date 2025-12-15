// src/components/UserSelectionDialog.tsx
// Dialog for users to confirm their identity when no Teams context is available

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogType,
  DialogFooter,
  PrimaryButton,
  Dropdown,
  IDropdownOption,
  Stack,
  Text,
  Icon,
  Spinner,
  SpinnerSize,
  mergeStyles
} from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import { TeamData } from '../app/functionality/types';

interface UserOption {
  key: string;
  text: string;
  email: string;
  initials: string;
  areas: string;
}

interface UserSelectionDialogProps {
  isOpen: boolean;
  onUserSelected: (userKey: string) => void;
}

const UserSelectionDialog: React.FC<UserSelectionDialogProps> = ({
  isOpen,
  onUserSelected
}) => {
  const { isDarkMode } = useTheme();
  const [selectedUserKey, setSelectedUserKey] = useState<string>('');
  const [teamData, setTeamData] = useState<TeamData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch team data from API when dialog opens
  useEffect(() => {
    if (!isOpen || teamData) return;
    
    const fetchTeam = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/team-data');
        if (!response.ok) {
          throw new Error(`Failed to fetch team data: ${response.statusText}`);
        }
        const data: TeamData[] = await response.json();
        setTeamData(data);
      } catch (err) {
        console.error('Failed to load team data:', err);
        setError('Unable to load team members. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTeam();
  }, [isOpen, teamData]);

  // Available users from API - only show active users
  const userOptions: UserOption[] = useMemo(() => {
    if (!teamData) return [];
    return teamData
      .filter(user => user.status === 'active')
      .map(user => ({
        key: String(user.Initials || '').toLowerCase(),
        text: `${user["Full Name"]} (${user.Initials})`,
        email: user.Email || '',
        initials: user.Initials || '',
        areas: user.AOW || ''
      }))
      .sort((a, b) => a.text.localeCompare(b.text));
  }, [teamData]);

  const dropdownOptions: IDropdownOption[] = userOptions.map(user => ({
    key: user.key,
    text: user.text
  }));

  const selectedUser = userOptions.find(user => user.key === selectedUserKey);

  const handleConfirm = () => {
    if (selectedUserKey) {
      onUserSelected(selectedUserKey);
    }
  };

  const containerStyle = mergeStyles({
    '& .ms-Dialog-main': {
      backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
      color: isDarkMode ? colours.dark.text : colours.light.text
    }
  });

  const userInfoStyle = mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.hoverBackground : colours.light.cardHover,
    padding: '12px',
    borderRadius: '4px',
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    marginTop: '8px'
  });

  return (
    <Dialog
      hidden={!isOpen}
      onDismiss={() => {}}
      dialogContentProps={{
        type: DialogType.normal,
        title: 'Select your identity',
        subText: 'No Teams context found. Please confirm who you are to personalise your experience.',
        className: containerStyle
      }}
      modalProps={{
        isBlocking: true
      }}
      minWidth={400}
      maxWidth={500}
    >
      <Stack tokens={{ childrenGap: 16 }}>
        <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
          <Icon
            iconName="Contact"
            styles={{
              root: {
                fontSize: '16px',
                color: isDarkMode ? colours.blue : colours.blue
              }
            }}
          />
          <Text variant="medium" styles={{ root: { fontWeight: 600 } }}>
            Choose your profile
          </Text>
        </Stack>

        {loading && (
          <Stack horizontalAlign="center" tokens={{ childrenGap: 8 }}>
            <Spinner size={SpinnerSize.medium} label="Loading team members..." />
          </Stack>
        )}

        {error && (
          <Text variant="small" styles={{ root: { color: colours.cta } }}>
            {error}
          </Text>
        )}

        {!loading && !error && (
          <Dropdown
            placeholder="Select your identity..."
            options={dropdownOptions}
            selectedKey={selectedUserKey}
            onChange={(_, option) => setSelectedUserKey((option?.key as string) || '')}
            styles={{
              dropdown: {
                backgroundColor: isDarkMode ? colours.dark.hoverBackground : colours.light.cardBackground,
                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`
              },
              title: {
                backgroundColor: isDarkMode ? colours.dark.hoverBackground : colours.light.cardBackground,
                color: isDarkMode ? colours.dark.text : colours.light.text,
                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`
              }
            }}
          />
        )}

        {selectedUser && (
          <div className={userInfoStyle}>
            <Stack tokens={{ childrenGap: 4 }}>
              <Text variant="small" styles={{ root: { fontWeight: 600 } }}>
                Selected profile:
              </Text>
              <Text variant="small">
                <strong>Name:</strong> {selectedUser.text}
              </Text>
              <Text variant="small">
                <strong>Email:</strong> {selectedUser.email}
              </Text>
              <Text variant="small">
                <strong>Areas:</strong> {selectedUser.areas}
              </Text>
            </Stack>
          </div>
        )}

        <Text variant="small" styles={{ root: { fontStyle: 'italic', color: isDarkMode ? colours.greyText : colours.greyText } }}>
          This selection will be used to personalise your dashboard, load relevant data, and configure your workspace preferences.
        </Text>
      </Stack>

      <DialogFooter>
        <PrimaryButton
          text="Confirm Selection"
          onClick={handleConfirm}
          disabled={!selectedUserKey}
        />
      </DialogFooter>
    </Dialog>
  );
};

export default UserSelectionDialog;
