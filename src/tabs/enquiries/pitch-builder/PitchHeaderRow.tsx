import React, { useState, useRef, useEffect } from "react";
import {
  Stack,
  TextField,
  mergeStyles,
  IconButton,
  Text,
  MessageBar,
  MessageBarType,
} from "@fluentui/react";
import { Enquiry } from "../../../app/functionality/types";

import { colours } from "../../../app/styles/colours";
import { inputFieldStyle } from "../../../CustomForms/BespokeForms";
import { IDropdownOption } from "@fluentui/react";

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

  // Modern card style with gradients and enhanced shadows
  const sectionStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    padding: '24px',
    gap: '16px',
    border: `1px solid ${isDarkMode ? 'rgba(59, 130, 246, 0.26)' : 'rgba(148, 163, 184, 0.16)'}`,
    borderRadius: '16px',
    background: isDarkMode 
      ? 'linear-gradient(135deg, rgba(5, 12, 26, 0.98) 0%, rgba(9, 22, 44, 0.94) 52%, rgba(13, 35, 63, 0.9) 100%)'
      : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
    boxShadow: isDarkMode 
      ? '0 20px 44px rgba(2, 6, 17, 0.72)'
      : '0 16px 40px rgba(13, 47, 96, 0.18)',
    backdropFilter: 'blur(12px)',
    transition: 'all 0.25s ease',
    position: 'relative' as const,
    minHeight: '160px'
  };

  const enquiryNotesContainer = mergeStyles({
    ...sectionStyle
  });

  const enquiryNotesHeader = mergeStyles({
    color: isDarkMode ? colours.dark.text : '#0F172A',
    fontWeight: 600,
    fontSize: '17px',
    lineHeight: 1.4,
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    paddingBottom: '12px',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.16)'}`,
    position: 'relative' as const,
    '&::before': {
      content: '""',
      position: 'absolute' as const,
      top: '-1px',
      left: '0',
      right: '0',
      height: '3px',
      background: isDarkMode 
        ? `linear-gradient(90deg, ${colours.blue}, ${colours.accent})`
        : `linear-gradient(90deg, ${colours.blue}, ${colours.highlight})`,
      borderRadius: '0 0 8px 8px'
    }
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
    background: isDarkMode 
      ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 100%)'
      : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
    border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.22)'}`,
    borderRadius: '12px',
    padding: '16px',
    fontSize: '14px',
    boxShadow: isDarkMode 
      ? '0 18px 32px rgba(2, 6, 17, 0.58)'
      : '0 12px 28px rgba(13, 47, 96, 0.12)',
    backdropFilter: 'blur(12px)',
    width: '100%',
    transition: 'all 0.25s ease',
    marginTop: '16px'
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
    color: isDarkMode ? colours.dark.text : '#0F172A',
    fontWeight: 600,
    fontSize: '16px',
    marginBottom: '12px',
    padding: '0 4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px'
  });

  const toggleCcBccStyle = mergeStyles({
    color: isDarkMode ? '#94A3B8' : colours.greyText,
    cursor: 'pointer',
    fontSize: '12px',
    marginTop: '8px',
    padding: '6px 12px',
    borderRadius: '6px',
    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.16)'}`,
    background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.05)',
    transition: 'all 0.2s ease',
    selectors: {
      ':hover': { 
        color: isDarkMode ? colours.dark.text : labelColour,
        background: isDarkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)',
        borderColor: isDarkMode ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)'
      },
    },
  });

  const detailRowStyle = mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '14px',
    padding: '8px 0',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)'}`,
    ':last-child': {
      borderBottom: 'none'
    }
  });

  const detailLabelStyle = mergeStyles({ 
    fontWeight: 600,
    color: isDarkMode ? '#94A3B8' : '#6B7280',
    fontSize: '13px',
    minWidth: '60px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.025em'
  });

  const detailValueStyle = mergeStyles({ 
    flexGrow: 1, 
    overflowWrap: 'anywhere' as const,
    color: isDarkMode ? colours.dark.text : '#1F2937',
    fontSize: '14px',
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
    background: isDarkMode 
      ? 'linear-gradient(135deg, rgba(5, 12, 26, 0.98) 0%, rgba(9, 22, 44, 0.94) 52%, rgba(13, 35, 63, 0.9) 100%)'
      : 'linear-gradient(135deg, rgba(248, 250, 252, 0.96) 0%, rgba(255, 255, 255, 0.94) 100%)',
    border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.28)' : 'rgba(148, 163, 184, 0.25)'}`,
    borderRadius: '16px',
    boxShadow: isDarkMode 
      ? '0 20px 44px rgba(2, 6, 17, 0.72)' 
      : '0 8px 24px rgba(13, 47, 96, 0.16)',
    backdropFilter: 'blur(12px)',
    borderLeft: isDarkMode 
      ? '3px solid rgba(125, 211, 252, 0.7)' 
      : '3px solid rgba(59, 130, 246, 0.6)',
    animation: 'cascadeIn 0.6s ease-out'
  });

  const emailFieldBase = {
    flexGrow: 1,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    background: isDarkMode 
      ? 'linear-gradient(135deg, rgba(7, 16, 32, 0.94) 0%, rgba(11, 30, 55, 0.86) 100%)'
      : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
    border: `1px solid ${isDarkMode ? 'rgba(125, 211, 252, 0.24)' : 'rgba(148, 163, 184, 0.22)'}`,
    borderRadius: '12px',
    margin: '4px',
    boxShadow: isDarkMode 
      ? '0 8px 16px rgba(2, 6, 17, 0.4)'
      : '0 4px 12px rgba(13, 47, 96, 0.08)',
    backdropFilter: 'blur(8px)',
    transition: 'all 0.25s ease'
  };

  const toFieldStyle = mergeStyles(emailFieldBase, {
    minWidth: '250px'
  });

  const ccFieldStyle = mergeStyles(emailFieldBase, {
    minWidth: '250px',
    selectors: {
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: isDarkMode 
          ? '0 12px 20px rgba(2, 6, 17, 0.6)'
          : '0 8px 16px rgba(13, 47, 96, 0.12)'
      }
    }
  });

  const bccFieldStyle = mergeStyles(emailFieldBase, {
    minWidth: '250px',
    selectors: {
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: isDarkMode 
          ? '0 12px 20px rgba(2, 6, 17, 0.6)'
          : '0 8px 16px rgba(13, 47, 96, 0.12)'
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
    <Stack tokens={{ childrenGap: 8 }} styles={{ root: { width: '100%' } }}>
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