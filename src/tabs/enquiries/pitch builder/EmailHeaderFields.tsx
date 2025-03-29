import React, { useRef, useEffect, useState } from 'react';
import { Stack, Label, Text, mergeStyles } from '@fluentui/react';
import BubbleTextField from '../../../app/styles/BubbleTextField';
import { colours } from '../../../app/styles/colours';

interface EmailHeaderFieldsProps {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  setTo: React.Dispatch<React.SetStateAction<string>>;
  setCc: React.Dispatch<React.SetStateAction<string>>;
  setBcc: React.Dispatch<React.SetStateAction<string>>;
  setSubject: React.Dispatch<React.SetStateAction<string>>;
  initialNotes: string | undefined;
  isDarkMode: boolean;
  formContainerStyle: string;
  labelStyle: string;
}

const EmailHeaderFields: React.FC<EmailHeaderFieldsProps> = ({
  to,
  cc,
  bcc,
  subject,
  setTo,
  setCc,
  setBcc,
  setSubject,
  initialNotes,
  isDarkMode,
  formContainerStyle,
  labelStyle,
}) => {
  // Ref to measure the height of the To/CC/BCC and Subject stack
  const fieldsStackRef = useRef<HTMLDivElement>(null);
  // Ref to measure the height of the notes content
  const notesContentRef = useRef<HTMLDivElement>(null);
  // State to determine if notes should use larger text
  const [useLargerText, setUseLargerText] = useState(false);

  // Measure heights and determine text size
  useEffect(() => {
    if (fieldsStackRef.current && notesContentRef.current) {
      const fieldsHeight = fieldsStackRef.current.getBoundingClientRect().height;
      const notesHeight = notesContentRef.current.getBoundingClientRect().height;

      // If notes content height is less than or equal to the fields stack height, use larger text
      setUseLargerText(notesHeight <= fieldsHeight);
    }
  }, [initialNotes]);

  // Card style with gradient background and hover effect
  const cardStyle = mergeStyles({
    background: isDarkMode
      ? `linear-gradient(135deg, ${colours.dark.cardBackground}, ${colours.dark.sectionBackground})`
      : `linear-gradient(135deg, ${colours.light.cardBackground}, ${colours.light.sectionBackground})`,
    borderRadius: '12px',
    boxShadow: isDarkMode
      ? '0 4px 12px rgba(255, 255, 255, 0.1)'
      : '0 4px 12px rgba(0, 0, 0, 0.1)',
    padding: '20px',
    transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: isDarkMode
        ? '0 6px 16px rgba(255, 255, 255, 0.15)'
        : '0 6px 16px rgba(0, 0, 0, 0.15)',
    },
  });

  // Updated label style with a modern touch
  const modernLabelStyle = mergeStyles(labelStyle, {
    fontSize: '14px',
    fontWeight: '700',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  });

  // Style for the input fields with a subtle border and hover effect
  const inputFieldStyle = {
    borderRadius: '8px',
    border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.borderColor}`,
    transition: 'border-color 0.2s ease-in-out',
    ':hover': {
      borderColor: colours.highlight,
    },
  };

  // Notes container style with a subtle border
  const notesContainerStyle = {
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    padding: '12px',
    borderRadius: '8px',
    border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.light.borderColor}`,
    overflowY: 'auto' as const,
    height: '100%',
    transition: 'border-color 0.2s ease-in-out',
    ':hover': {
      borderColor: colours.highlight,
    },
  };

  return (
    <Stack horizontal tokens={{ childrenGap: 20 }} verticalAlign="stretch">
      {/* Left Column: To, CC, BCC, Subject Line */}
      <div ref={fieldsStackRef} style={{ width: '50%' }}>
        <Stack
          className={mergeStyles(formContainerStyle, cardStyle)}
          tokens={{ childrenGap: 16 }}
        >
          {/* First Row: To, CC, BCC */}
          <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="start">
            <Stack tokens={{ childrenGap: 6 }} style={{ flex: 1 }}>
              <Label className={modernLabelStyle}>To</Label>
              <BubbleTextField
                value={to}
                onChange={(_, newValue) => setTo(newValue || '')}
                placeholder="Enter recipient addresses, separated by commas"
                ariaLabel="To Addresses"
                isDarkMode={isDarkMode}
                style={inputFieldStyle}
              />
            </Stack>
            <Stack tokens={{ childrenGap: 6 }} style={{ flex: 1 }}>
              <Label className={modernLabelStyle}>CC</Label>
              <BubbleTextField
                value={cc}
                onChange={(_, newValue) => setCc(newValue || '')}
                placeholder="Enter CC addresses, separated by commas"
                ariaLabel="CC Addresses"
                isDarkMode={isDarkMode}
                style={inputFieldStyle}
              />
            </Stack>
            <Stack tokens={{ childrenGap: 6 }} style={{ flex: 1 }}>
              <Label className={modernLabelStyle}>BCC</Label>
              <BubbleTextField
                value={bcc}
                onChange={(_, newValue) => setBcc(newValue || '')}
                placeholder="Enter BCC addresses, separated by commas"
                ariaLabel="BCC Addresses"
                isDarkMode={isDarkMode}
                style={inputFieldStyle}
              />
            </Stack>
          </Stack>

          {/* Second Row: Subject Line */}
          <Stack tokens={{ childrenGap: 6 }}>
            <Label className={modernLabelStyle}>Subject Line</Label>
            <BubbleTextField
              value={subject}
              onChange={(_, newValue) => setSubject(newValue || '')}
              placeholder="Enter email subject"
              ariaLabel="Email Subject"
              isDarkMode={isDarkMode}
              style={inputFieldStyle}
            />
          </Stack>
        </Stack>
      </div>

      {/* Right Column: Enquiry Notes or Message */}
      <Stack
        style={{ width: '50%', height: '100%' }}
        className={mergeStyles(formContainerStyle, cardStyle)}
        tokens={{ childrenGap: 6 }}
      >
        <Label className={modernLabelStyle}>Enquiry Notes or Message</Label>
        {initialNotes && (
          <div style={notesContainerStyle}>
            <div ref={notesContentRef}>
              <Text
                variant={useLargerText ? 'medium' : 'small'}
                styles={{
                  root: {
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    whiteSpace: 'pre-wrap',
                  },
                }}
              >
                {initialNotes}
              </Text>
            </div>
          </div>
        )}
      </Stack>
    </Stack>
  );
};

export default EmailHeaderFields;