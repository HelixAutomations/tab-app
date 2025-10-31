// src/components/PasscodeDialog.tsx
// Blocking dialog to require a passcode before allowing user selection outside Teams

import React, { useState } from 'react';
import {
  Dialog,
  DialogType,
  DialogFooter,
  PrimaryButton,
  TextField,
  Stack,
  Text,
  Icon,
  mergeStyles
} from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';

interface PasscodeDialogProps {
  isOpen: boolean;
  onVerified: () => void;
}

const REQUIRED_PASSCODE = '2011';

const PasscodeDialog: React.FC<PasscodeDialogProps> = ({ isOpen, onVerified }) => {
  const { isDarkMode } = useTheme();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const containerStyle = mergeStyles({
    '& .ms-Dialog-main': {
      backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
      color: isDarkMode ? colours.dark.text : colours.light.text
    }
  });

  const handleConfirm = () => {
    if (code.trim() === REQUIRED_PASSCODE) {
      setError(undefined);
      onVerified();
    } else {
      setError('Incorrect passcode. Please try again.');
    }
  };

  return (
    <Dialog
      hidden={!isOpen}
      onDismiss={() => {}}
      dialogContentProps={{
        type: DialogType.normal,
        title: 'Restricted access',
        subText: 'Please enter the passcode to continue.',
        className: containerStyle
      }}
      modalProps={{ isBlocking: true }}
      minWidth={380}
      maxWidth={460}
    >
      <Stack tokens={{ childrenGap: 14 }}>
        <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
          <Icon iconName="Lock" styles={{ root: { fontSize: 16, color: colours.blue } }} />
          <Text variant="medium" styles={{ root: { fontWeight: 600 } }}>
            Enter passcode
          </Text>
        </Stack>

        <TextField
          value={code}
          onChange={(_, v) => setCode(v || '')}
          placeholder="Passcode"
          canRevealPassword
          type="password"
          errorMessage={error}
          styles={{
            fieldGroup: {
              borderColor: isDarkMode ? colours.dark.border : colours.light.border
            }
          }}
        />
      </Stack>

      <DialogFooter>
        <PrimaryButton text="Confirm" onClick={handleConfirm} disabled={!code} />
      </DialogFooter>
    </Dialog>
  );
};

export default PasscodeDialog;
