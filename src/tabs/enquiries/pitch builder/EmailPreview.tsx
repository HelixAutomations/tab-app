import React from 'react';
import {
  Stack,
  Text,
  MessageBar,
  MessageBarType,
  Separator,
  Panel,
  PanelType,
  PrimaryButton,
  DefaultButton,
} from '@fluentui/react';
import { colours } from '../../../app/styles/colours';
import {
  sharedPrimaryButtonStyles,
  sharedDefaultButtonStyles,
  sharedDraftConfirmedButtonStyles,
} from '../../../app/styles/ButtonStyles';
import { removeHighlightSpans, removeUnfilledPlaceholders } from './emailUtils'; // Adjusted path

interface EmailPreviewProps {
  isPreviewOpen: boolean;
  onDismiss: () => void;
  enquiry: any; // Ideally, replace with the appropriate type e.g., Enquiry
  subject: string;
  body: string;
  attachments: string[];
  followUp?: string;
  fullName: string;
  sendEmail: () => void;
  handleDraftEmail: () => void;
  isSuccessVisible: boolean;
  isDraftConfirmed: boolean;
}

const EmailPreview: React.FC<EmailPreviewProps> = ({
  isPreviewOpen,
  onDismiss,
  enquiry,
  subject,
  body,
  attachments,
  followUp,
  fullName,
  sendEmail,
  handleDraftEmail,
  isSuccessVisible,
  isDraftConfirmed,
}) => {
  // Process body HTML using imported functions
  const cleanBody = removeUnfilledPlaceholders(removeHighlightSpans(body));

  // Example follow-up options (you may wish to pass these in or centralise them)
  const followUpOptions: { [key: string]: string } = {
    '1_day': '1 day',
    '2_days': '2 days',
    '3_days': '3 days',
    '7_days': '7 days',
    '14_days': '14 days',
    '30_days': '30 days',
  };

  return (
    <Panel
      isOpen={isPreviewOpen}
      onDismiss={onDismiss}
      type={PanelType.largeFixed}
      headerText="Email Preview"
      closeButtonAriaLabel="Close"
      styles={{
        main: {
          padding: '20px',
          backgroundImage: `url('https://helix-law.co.uk/wp-content/uploads/2023/09/Asset-2-2.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'top left',
          backgroundRepeat: 'no-repeat',
          backgroundColor: 'rgba(240, 242, 245, 0.9)',
          color: colours.light.text,
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        },
      }}
    >
      <Stack tokens={{ childrenGap: 15 }} styles={{ root: { flex: 1 } }}>
        <Separator />
        <Text variant="medium">
          <strong style={{ color: colours.cta }}>
            You're sending an email to {fullName || 'N/A'}
          </strong>
          <span style={{ color: colours.greyText, margin: '0 8px' }}>•</span>
          {enquiry.Point_of_Contact || 'N/A'}
        </Text>
        <MessageBar
          messageBarType={MessageBarType.info}
          isMultiline={false}
          styles={{ root: { backgroundColor: colours.grey } }}
        >
          This is {enquiry.First_Name || 'the prospect'}'s first enquiry. You're responding on the same day.
        </MessageBar>

        {isSuccessVisible && (
          <MessageBar
            messageBarType={MessageBarType.success}
            isMultiline={false}
            onDismiss={() => {}}
            dismissButtonAriaLabel="Close"
            styles={{ root: { borderRadius: '4px', marginTop: '10px' } }}
          >
            Email drafted successfully!
          </MessageBar>
        )}

        <Separator />

        {/* Subject */}
        <Stack tokens={{ childrenGap: 6 }}>
          <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.highlight, marginBottom: '5px' } }}>
            Subject:
          </Text>
          <Text variant="medium" styles={{ root: { whiteSpace: 'pre-wrap' } }}>
            {subject || 'N/A'}
          </Text>
        </Stack>

        <Separator />

        {/* Body */}
        <Stack tokens={{ childrenGap: 6 }}>
          <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.highlight, marginBottom: '5px' } }}>
            Body:
          </Text>
          <div style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: cleanBody }} />
        </Stack>

        {attachments.length > 0 && (
          <>
            <Separator />
            <Stack tokens={{ childrenGap: 6 }}>
              <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.highlight, marginBottom: '5px' } }}>
                Attachments:
              </Text>
              <Stack tokens={{ childrenGap: 5 }}>
                {attachments.map((att: string) => (
                  <Text key={att} variant="medium">
                    - {att}
                  </Text>
                ))}
              </Stack>
            </Stack>
          </>
        )}

        {followUp && (
          <>
            <Separator />
            <Stack tokens={{ childrenGap: 6 }}>
              <Text variant="large" styles={{ root: { fontWeight: '600', color: colours.highlight, marginBottom: '5px' } }}>
                Follow Up:
              </Text>
              <Text variant="medium">
                {followUpOptions[followUp] || followUp}
              </Text>
            </Stack>
          </>
        )}
      </Stack>

      <Stack horizontal tokens={{ childrenGap: 15 }} styles={{ root: { marginTop: '20px' } }}>
        <PrimaryButton
          text="Send Email"
          onClick={sendEmail}
          styles={sharedPrimaryButtonStyles}
          ariaLabel="Send Email"
          iconProps={{ iconName: 'Mail' }}
        />
        <DefaultButton
          text={isDraftConfirmed ? 'Drafted' : 'Draft Email'}
          onClick={handleDraftEmail}
          styles={isDraftConfirmed ? sharedDraftConfirmedButtonStyles : sharedDefaultButtonStyles}
          ariaLabel={isDraftConfirmed ? 'Email Drafted' : 'Draft Email'}
          iconProps={{ iconName: isDraftConfirmed ? 'CheckMark' : 'Edit' }}
          disabled={isDraftConfirmed}
        />
      </Stack>
    </Panel>
  );
};

export default EmailPreview;