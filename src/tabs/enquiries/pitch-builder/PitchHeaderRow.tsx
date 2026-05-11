import React, { useState, useRef, useEffect } from "react";
import { Stack } from '@fluentui/react/lib/Stack';
import { TextField } from '@fluentui/react/lib/TextField';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { IconButton } from '@fluentui/react/lib/Button';
import { Text } from '@fluentui/react/lib/Text';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { Enquiry } from "../../../app/functionality/types";

import { colours } from "../../../app/styles/colours";
import { inputFieldStyle } from "../../../CustomForms/BespokeForms";
import type { IDropdownOption } from '@fluentui/react/lib/Dropdown';
interface PitchHeaderRowProps {
  enquiry: Enquiry;
  to: string;
  setTo: (v: string) => void;
// invisible change
  cc: string;
  setCc: (v: string) => void;
  bcc: string;
  setBcc: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  initialScopeDescription: string; // renamed from serviceDescription
  setInitialScopeDescription: (v: string) => void;
  selectedOption: IDropdownOption | undefined;
  setSelectedOption: (o: IDropdownOption | undefined) => void;
  SERVICE_OPTIONS: IDropdownOption[];
  amount: string;
  handleAmountChange: (v?: string) => void;
  handleAmountBlur: () => void;
  handleDealFormSubmit: (data: {
  initialScopeDescription: string;
    amount: number;
    isMultiClient: boolean;
    clients: { firstName: string; lastName: string; email: string }[];
  }) => void;
  dealId?: string | number | null;
  clientIds?: (string | number)[];
  isDarkMode: boolean;
}

const PitchHeaderRow: React.FC<PitchHeaderRowProps> = ({
  enquiry,
  to,
  setTo,
  cc,
  setCc,
  bcc,
  setBcc,
  subject,
  setSubject,
  initialScopeDescription,
  setInitialScopeDescription,
  selectedOption,
  setSelectedOption,
  SERVICE_OPTIONS,
  amount,
  handleAmountChange,
  handleAmountBlur,
  handleDealFormSubmit,
  dealId,
  clientIds,
  isDarkMode,
}) => {

  const labelColour = isDarkMode ? '#fff' : colours.darkBlue;

  // On-brand surface ladder. borderRadius:0, no gradients/blur/MD shadows.
  // See COMPONENT_STYLE_GUIDE.md and UserBubble reference.
  const sectionStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    padding: '16px',
    gap: '12px',
    border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(6, 23, 51, 0.12)'}`,
    borderRadius: 0,
    background: isDarkMode ? colours.dark.cardBackground : '#FFFFFF',
    transition: 'border-color 0.15s ease',
    position: 'relative' as const,
  };

  const enquiryNotesContainer = mergeStyles({
    ...sectionStyle
  });

  const enquiryNotesHeader = mergeStyles({
    color: isDarkMode ? colours.dark.text : colours.darkBlue,
    fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight: 600,
    fontSize: '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    lineHeight: 1.4,
    marginBottom: '8px',
    paddingBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(6, 23, 51, 0.08)'}`,
  });

  const enquiryNotesContent = mergeStyles({
    whiteSpace: 'pre-wrap' as const,
    fontSize: '14px',
    color: isDarkMode ? colours.dark.text : '#374151',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  });

  const notesContainerStyle = mergeStyles({
    background: isDarkMode ? colours.dark.sectionBackground : colours.grey,
    border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(6, 23, 51, 0.08)'}`,
    borderRadius: 0,
    padding: '12px 14px',
    fontSize: '13px',
    width: '100%',
    marginTop: '12px'
  });

  const notesTextStyle = mergeStyles({
    fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: isDarkMode ? colours.dark.text : '#374151',
    lineHeight: 1.5
  });

  const intakeContainer = mergeStyles({
    ...sectionStyle
  });

  const intakeHeader = mergeStyles({
    color: isDarkMode ? colours.dark.text : colours.darkBlue,
    fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight: 600,
    fontSize: '12px',
    letterSpacing: '0.04em',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px'
  });

  const toggleCcBccStyle = mergeStyles({
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
    cursor: 'pointer',
    fontSize: '12px',
    marginTop: '8px',
    padding: '6px 12px',
    borderRadius: 0,
    border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(6, 23, 51, 0.12)'}`,
    background: 'transparent',
    transition: 'border-color 0.15s ease, color 0.15s ease',
    selectors: {
      ':hover': { 
        color: isDarkMode ? colours.accent : colours.highlight,
        borderColor: isDarkMode ? colours.accent : colours.highlight,
      },
    },
  });

  const detailRowStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
    padding: '8px 0',
    borderBottom: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(6, 23, 51, 0.06)'}`,
    ':last-child': {
      borderBottom: 'none'
    }
  });

  const detailLabelStyle = mergeStyles({ 
    fontFamily: 'Raleway, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight: 600,
    color: isDarkMode ? colours.subtleGrey : colours.greyText,
    fontSize: '11px',
    minWidth: '60px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em'
  });

  const detailValueStyle = mergeStyles({ 
    flexGrow: 1, 
    overflowWrap: 'anywhere' as const,
    color: isDarkMode ? colours.dark.text : colours.darkBlue,
    fontSize: '13px',
    fontWeight: 500
  });

  const copyBtnStyle = mergeStyles({
    background: 'none',
    border: 'none',
    color: colours.highlight,
    cursor: 'pointer',
    padding: 0,
    fontSize: 12,
    selectors: { ':hover': { textDecoration: 'underline' } },
  });

  const separatorColour = isDarkMode ? 'rgba(255,255,255,0.1)' : '#ddd';

  const emailFieldsContainer = mergeStyles({
    display: 'flex',
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: '8px',
    padding: '12px',
    background: isDarkMode ? colours.dark.sectionBackground : colours.grey,
    border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(6, 23, 51, 0.08)'}`,
    borderLeft: `2px solid ${isDarkMode ? colours.accent : colours.highlight}`,
    borderRadius: 0,
  });

  const emailFieldBase = {
    flexGrow: 1,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column' as const,
    background: isDarkMode ? colours.dark.cardBackground : '#FFFFFF',
    border: `1px solid ${isDarkMode ? colours.dark.border : 'rgba(6, 23, 51, 0.10)'}`,
    borderRadius: 0,
    margin: 0,
    transition: 'border-color 0.15s ease'
  };

  const toFieldStyle = mergeStyles(emailFieldBase, {
    minWidth: '250px'
  });

  const ccFieldStyle = mergeStyles(emailFieldBase, {
    minWidth: '250px',
    selectors: {
      '&:focus-within': {
        borderColor: isDarkMode ? colours.accent : colours.highlight,
      }
    }
  });

  const bccFieldStyle = mergeStyles(emailFieldBase, {
    minWidth: '250px',
    selectors: {
      '&:focus-within': {
        borderColor: isDarkMode ? colours.accent : colours.highlight,
      }
    }
  });

  const subjectFieldStyle = mergeStyles(emailFieldBase, {
    width: '100%',
    minWidth: '250px'
  });

  const [showCc, setShowCc] = useState(!!cc);
  const [showBcc, setShowBcc] = useState(false);
  const toCcBccRef = useRef<HTMLDivElement>(null);
  const subjectRef = useRef<HTMLDivElement>(null);
  const [descHeight, setDescHeight] = useState(0);
  // Static spacing below the enquiry notes
  const notesSpacing = 8;
  const [dealFormSaved, setDealFormSaved] = useState(false);

  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  const copy = (text?: string) => {
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopySuccess('Copied!');
        setTimeout(() => setCopySuccess(null), 2000);
      })
      .catch((err) => console.error('Failed to copy: ', err));
  };

  // Previously aligned the subject field with the amount input using
  // calculated spacing. With the simplified layout we use static spacing
  // so this effect is no longer required.

  useEffect(() => {
    if (cc && !showCc) {
      setShowCc(true);
    }
  }, [cc, showCc]);



  // Layout grid keeping sections compact and aligned
  const headerRowStyle = mergeStyles({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 8,
    width: '100%',
    marginBottom: 8,
  });

  const dealSideContainerStyle = (saved: boolean) =>
    mergeStyles({
      width: '100%',
      border: saved ? `1px solid ${colours.green}` : `1px solid transparent`,
      opacity: saved ? 0.6 : 1,
      borderRadius: 0,
    });

  return (
    <Stack tokens={{ childrenGap: 8 }} styles={{ root: { width: '100%' } }} data-helix-region="pitch-builder.header">
      <div className={headerRowStyle}>
        {/* Enquiry Details */}
        <div className={enquiryNotesContainer}>
          <div className={enquiryNotesHeader}>Enquiry Details</div>
          <Stack className={enquiryNotesContent}>
            <div className={detailRowStyle}>
              <span className={detailLabelStyle}>Name:</span>
              <span className={detailValueStyle}>
                {enquiry.First_Name} {enquiry.Last_Name}
              </span>
              <IconButton
                iconProps={{ iconName: 'Copy' }}
                styles={{ root: { background: 'none', padding: 0 } }}
                ariaLabel="Copy Name"
                onClick={() =>
                  copy(`${enquiry.First_Name ?? ''} ${enquiry.Last_Name ?? ''}`.trim())
                }
              />
            </div>
            {enquiry.Email && (
              <div className={detailRowStyle}>
                <span className={detailLabelStyle}>Email:</span>
                <span className={detailValueStyle}>{enquiry.Email}</span>
                <IconButton
                  iconProps={{ iconName: 'Copy' }}
                  styles={{ root: { background: 'none', padding: 0 } }}
                  ariaLabel="Copy Email"
                  onClick={() => copy(enquiry.Email!)}
                />
              </div>
            )}
            {enquiry.Phone_Number && (
              <div className={detailRowStyle}>
                <span className={detailLabelStyle}>Phone:</span>
                <span className={detailValueStyle}>{enquiry.Phone_Number}</span>
                <IconButton
                  iconProps={{ iconName: 'Copy' }}
                  styles={{ root: { background: 'none', padding: 0 } }}
                  ariaLabel="Copy Phone"
                  onClick={() => copy(enquiry.Phone_Number!)}
                />
              </div>
            )}
            {enquiry.Secondary_Phone && (
              <Text>Alt Phone: {enquiry.Secondary_Phone}</Text>
            )}
          </Stack>
          {enquiry.Initial_first_call_notes && (
            <div className={notesContainerStyle} style={{ marginTop: 12 }}>
              <div className={enquiryNotesHeader}>Initial Notes</div>
              <Text
                className={notesTextStyle}
                styles={{ root: { whiteSpace: 'pre-wrap' } }}
              >
                {enquiry.Initial_first_call_notes}
              </Text>
            </div>
          )}
        </div>

        {/* Email Details */}
        <div ref={toCcBccRef} className={enquiryNotesContainer}>
          <div className={enquiryNotesHeader}>Email Details</div>
          <div className={enquiryNotesContent}>
            <Stack tokens={{ childrenGap: 6 }}>
              <div className={emailFieldsContainer}>
                <div className={toFieldStyle}>
                  <div className={intakeHeader}>To</div>
                  <TextField
                    value={to}
                    onChange={(_, val) => setTo(val || "")}
                    placeholder="Recipient email"
                    ariaLabel="To"
                    styles={{
                      root: { margin: 0 },
                      fieldGroup: [
                        inputFieldStyle,
                        { border: "none", borderRadius: 0 },
                      ],
                    }}
                  />
                </div>
                {showCc && (
                  <div className={ccFieldStyle}>
                    <div className={intakeHeader}>
                      CC
                      <IconButton
                        iconProps={{ iconName: "Cancel" }}
                        ariaLabel="Hide CC"
                        onClick={() => setShowCc(false)}
                        styles={{
                          root: {
                            backgroundColor: "transparent",
                            padding: 0,
                            marginLeft: 4,
                            height: 16,
                            width: 16,
                          },
                          rootHovered: {
                            backgroundColor: "transparent",
                            color: colours.highlight,
                          },
                          icon: { fontSize: 12, color: labelColour },
                        }}
                      />
                    </div>
                    <TextField
                      value={cc}
                      onChange={(_, val) => setCc(val || "")}
                      placeholder="CC emails"
                      ariaLabel="CC"
                      styles={{
                        fieldGroup: [
                          inputFieldStyle,
                          { border: "none", borderRadius: 0 },
                        ],
                      }}
                    />
                  </div>
                )}
                {showBcc && (
                  <div className={bccFieldStyle}>
                    <div className={intakeHeader}>
                      BCC
                      <IconButton
                        iconProps={{ iconName: "Cancel" }}
                        ariaLabel="Hide BCC"
                        onClick={() => setShowBcc(false)}
                        styles={{
                          root: {
                            backgroundColor: "transparent",
                            padding: 0,
                            marginLeft: 4,
                            height: 16,
                            width: 16,
                          },
                          rootHovered: {
                            backgroundColor: "transparent",
                            color: colours.highlight,
                          },
                          icon: { fontSize: 12, color: labelColour },
                        }}
                      />
                    </div>
                    <TextField
                      value={bcc}
                      onChange={(_, val) => setBcc(val || "")}
                      placeholder="BCC emails"
                      ariaLabel="BCC"
                      styles={{
                        fieldGroup: [
                          inputFieldStyle,
                          { border: "none", borderRadius: 0 },
                        ],
                      }}
                    />
                  </div>
                )}
                <div ref={subjectRef} className={subjectFieldStyle}>
                  <div className={intakeHeader}>Subject</div>
                  <TextField
                    value={subject}
                    onChange={(_, val) => setSubject(val || "")}
                    placeholder="Email subject"
                    ariaLabel="Subject"
                    styles={{
                      root: { margin: 0 },
                      fieldGroup: [
                        inputFieldStyle,
                        { border: "none", borderRadius: 0 },
                      ],
                    }}
                  />
                </div>
              </div>
              {(!showCc || !showBcc) && (
                <Stack horizontal tokens={{ childrenGap: 6 }}>
                  {!showCc && (
                    <span
                      className={toggleCcBccStyle}
                      onClick={() => setShowCc(true)}
                    >
                      CC
                    </span>
                  )}
                  {!showBcc && (
                    <span
                      className={toggleCcBccStyle}
                      onClick={() => setShowBcc(true)}
                    >
                      BCC
                    </span>
                  )}
                </Stack>
              )}
              </Stack>
            </div>

          </div>
        </div>

        {/* Deal Capture Form */}
      {/* DealCaptureForm inlined here - move this block to PitchBuilder.tsx as next step */}
      {/* ...DealCaptureForm JSX and logic goes here... */}
      {copySuccess && (
        <MessageBar
          messageBarType={MessageBarType.success}
          isMultiline={false}
          onDismiss={() => setCopySuccess(null)}
          dismissButtonAriaLabel="Close"
          styles={{
            root: {
              position: 'fixed',
              bottom: 20,
              right: 20,
              maxWidth: '300px',
              zIndex: 1000,
              borderRadius: 0,
              backgroundColor: colours.green,
              color: 'white',
            },
          }}
        >
          {copySuccess}
        </MessageBar>
      )}
    </Stack>
  );
};

export default PitchHeaderRow;