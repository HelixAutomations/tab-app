// src/CustomForms/shared/PasscodeGuard.tsx
// HOC wrapper that requires passcode before showing protected content

import React, { useState } from 'react';
import {
  Stack,
  Text,
  TextField,
  PrimaryButton,
  DefaultButton,
  Icon,
} from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import {
  getFormContainerStyle,
  getInputStyles,
  getFormPrimaryButtonStyles,
  getFormDefaultButtonStyles,
} from './formStyles';

const REQUIRED_PASSCODE = '2011';

interface PasscodeGuardProps {
  children: React.ReactNode;
  title?: string;
  onBack?: () => void;
}

const PasscodeGuard: React.FC<PasscodeGuardProps> = ({ children, title, onBack }) => {
  const { isDarkMode } = useTheme();
  const [isVerified, setIsVerified] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleVerify = () => {
    if (passcode.trim() === REQUIRED_PASSCODE) {
      setIsVerified(true);
      setError(null);
    } else {
      setError('Incorrect passcode. Please try again.');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && passcode) {
      handleVerify();
    }
  };

  if (isVerified) {
    return <>{children}</>;
  }

  // Styles
  const containerStyle: React.CSSProperties = {
    ...getFormContainerStyle(isDarkMode),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  };

  const cardStyle: React.CSSProperties = {
    background: isDarkMode ? 'rgba(30, 41, 59, 0.7)' : '#ffffff',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)'}`,
    borderLeft: `3px solid ${colours.cta}`,
    borderRadius: 0,
    padding: '2rem',
    maxWidth: '400px',
    width: '100%',
    boxShadow: isDarkMode 
      ? '0 8px 32px rgba(0, 0, 0, 0.3)' 
      : '0 8px 32px rgba(0, 0, 0, 0.08)',
  };

  const headerStyle: React.CSSProperties = {
    fontWeight: 600,
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
  };

  const subtitleStyle: React.CSSProperties = {
    color: isDarkMode ? '#94a3b8' : '#64748b',
    fontSize: '14px',
  };

  const descriptionStyle: React.CSSProperties = {
    color: isDarkMode ? '#94a3b8' : '#6b7280',
    fontSize: '14px',
    lineHeight: 1.5,
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <Stack tokens={{ childrenGap: 20 }}>
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
            <Icon iconName="Lock" style={{ fontSize: 28, color: colours.cta }} />
            <Stack>
              <Text variant="xLarge" style={headerStyle}>
                Protected Feature
              </Text>
              {title && (
                <Text style={subtitleStyle}>
                  {title}
                </Text>
              )}
            </Stack>
          </Stack>

          <Text style={descriptionStyle}>
            This feature is currently in development. Enter the passcode to access.
          </Text>

          <TextField
            label="Passcode"
            type="password"
            value={passcode}
            onChange={(_, val) => {
              setPasscode(val || '');
              setError(null);
            }}
            onKeyPress={handleKeyPress}
            errorMessage={error || undefined}
            canRevealPassword
            styles={getInputStyles(isDarkMode)}
          />

          <Stack horizontal tokens={{ childrenGap: 12 }} horizontalAlign="end">
            {onBack && (
              <DefaultButton 
                text="Back" 
                onClick={onBack} 
                styles={getFormDefaultButtonStyles(isDarkMode)}
              />
            )}
            <PrimaryButton
              text="Access"
              onClick={handleVerify}
              disabled={!passcode}
              styles={getFormPrimaryButtonStyles(isDarkMode)}
            />
          </Stack>
        </Stack>
      </div>
    </div>
  );
};

export default PasscodeGuard;
