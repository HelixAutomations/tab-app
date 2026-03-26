import React, { useRef, useEffect, useState } from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { Label } from '@fluentui/react/lib/Label';
import { Text } from '@fluentui/react/lib/Text';
import { mergeStyles } from '@fluentui/react/lib/Styling';
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

  // Card style with clean background
  const cardStyle = mergeStyles({
    background: isDarkMode
      ? colours.dark.cardBackground
      : colours.light.cardBackground,
    borderRadius: 8,
    border: `1px solid ${isDarkMode ? '#3a3a3a' : '#e1e5e9'}`,
    padding: '16px',
    transition: 'border-color 0.2s ease',
  });

  // Updated label style with clean design
  const modernLabelStyle = mergeStyles(labelStyle, {
    fontSize: '12px',
    fontWeight: '600',
    color: isDarkMode ? colours.dark.text : '#555',
    marginBottom: '4px',
  });

  // Specific style override for the notes label
  const notesLabelStyle = mergeStyles(modernLabelStyle, {
    color: colours.grey,
  });

  // Style for the input fields with clean border
  const inputFieldStyle = {
    borderRadius: 6,
    border: `1px solid ${isDarkMode ? colours.dark.borderColor : '#e1e5e9'}`,
    transition: 'border-color 0.2s ease',
    ':focus': {
      borderColor: colours.blue,
    },
  };

  // Container style for fields with clean background
  const labeledFieldContainerStyle = {
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#f8f9fa',
    padding: '8px',
    borderRadius: 6,
    border: `1px solid ${isDarkMode ? '#3a3a3a' : '#e1e5e9'}`,
  };

  // Notes container style with clean border
  const notesContainerStyle = {
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#f8f9fa',
    padding: '12px',
    borderRadius: 6,
    border: `1px solid ${isDarkMode ? '#3a3a3a' : '#e1e5e9'}`,
    overflowY: 'auto' as const,
    height: '100%',
  };

  return (
    <Stack tokens={{ childrenGap: 16 }} verticalAlign="stretch">
      {/* Enquiry Notes - Repositioned to top for prominence */}
      {initialNotes && (
        <Stack
          style={{ width: '100%' }}
          className={mergeStyles(formContainerStyle, cardStyle)}
          tokens={{ childrenGap: 8 }}
        >
          <div style={notesContainerStyle}>
            <Label className={notesLabelStyle}>Initial Call Notes</Label>
            <div ref={notesContentRef}>
              <Text
                variant={useLargerText ? 'medium' : 'small'}
                styles={{
                  root: {
                    color: colours.darkBlue,
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.5,
                    fontSize: useLargerText ? 14 : 13
                  },
                }}
              >
                {initialNotes}
              </Text>
            </div>
          </div>
        </Stack>
      )}

      {/* Recipient and Subject Fields */}
      <div ref={fieldsStackRef} style={{ width: '100%' }}>
        <Stack
          className={mergeStyles(formContainerStyle, cardStyle)}
          tokens={{ childrenGap: 16 }}
        >
          {/* First Row: To, CC, BCC */}
          <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="start">
            <Stack tokens={{ childrenGap: 6 }} style={{ flex: 1 }}>
              <div style={labeledFieldContainerStyle}>
                <Label className={modernLabelStyle}>To</Label>
                <BubbleTextField
                  value={to}
                  onChange={(_, newValue) => setTo(newValue || '')}
                  placeholder="Enter recipient addresses, separated by commas"
                  ariaLabel="To Addresses"
                  isDarkMode={isDarkMode}
                  style={inputFieldStyle}
                />
              </div>
            </Stack>
          </Stack>

          {/* Second Row: Subject Line */}
          <Stack tokens={{ childrenGap: 6 }}>
            <div style={labeledFieldContainerStyle}>
              <Label className={modernLabelStyle}>Subject</Label>
              <BubbleTextField
                value={subject}
                onChange={(_, newValue) => setSubject(newValue || '')}
                placeholder="Enter email subject"
                ariaLabel="Email Subject"
                isDarkMode={isDarkMode}
                style={inputFieldStyle}
              />
            </div>
          </Stack>
        </Stack>
      </div>
    </Stack>
  );
};

export default EmailHeaderFields;
