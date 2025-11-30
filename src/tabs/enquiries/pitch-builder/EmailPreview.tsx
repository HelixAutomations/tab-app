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
  Checkbox,
  IconButton,
  mergeStyles,
  Link,
} from '@fluentui/react';
import { colours } from '../../../app/styles/colours';
import { useTheme } from '../../../app/functionality/ThemeContext';
import {
  sharedPrimaryButtonStyles,
  sharedDefaultButtonStyles,
// invisible change
  sharedDraftConfirmedButtonStyles,
} from '../../../app/styles/ButtonStyles';
import { componentTokens } from '../../../app/styles/componentTokens';
import markWhite from '../../../assets/markwhite.svg';
import {
  removeHighlightSpans,
  markUnfilledPlaceholders,
  removeUnfilledPlaceholders,
  applyDynamicSubstitutions,
  convertDoubleBreaksToParagraphs,
} from './emailUtils';
import { EMAIL_V2_CONFIG, processEmailContentV2 } from './emailFormattingV2';
import ExperimentalAssistant from './ExperimentalAssistant';
import { isInTeams } from '../../../app/functionality/isInTeams';
import { TemplateBlock } from '../../../app/customisation/ProductionTemplateBlocks';
import ReactDOMServer from 'react-dom/server';
import EmailSignature from '../EmailSignature';

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeAutoInsertedBlocks(
  html: string,
  autoBlocks: { [key: string]: boolean },
  editedBlocks: { [key: string]: boolean }
): string {
  let result = html;
  Object.keys(autoBlocks).forEach((title) => {
    if (!autoBlocks[title]) return;
    if (editedBlocks[title]) return;
    const escaped = escapeRegExp(title);
    const regex = new RegExp(
      `<!--START_BLOCK:${escaped}-->[\\s\\S]*?<!--END_BLOCK:${escaped}-->`,
      'g'
    );
    result = result.replace(regex, '');
  });
  return result;
}

interface EmailPreviewProps {
  isPreviewOpen: boolean;
  onDismiss: () => void;
  enquiry: any; // Ideally, replace with the appropriate type e.g., Enquiry
  subject: string;
  body: string;
  templateBlocks: TemplateBlock[];
  attachments: string[];
  followUp?: string;
  fullName: string;
  userData: any;
  initialScopeDescription?: string; // renamed from serviceDescription
  clients?: { firstName: string; lastName: string; email: string }[];
  to: string;
  cc?: string;
  bcc?: string;
  autoInsertedBlocks: { [key: string]: boolean };
  editedBlocks: { [key: string]: boolean };
  sendEmail: () => void;
  handleDraftEmail: () => void;
  isSuccessVisible: boolean;
  isDraftConfirmed: boolean;
  amount?: string;
  passcode?: string;
}

const EmailPreview: React.FC<EmailPreviewProps> = ({
  isPreviewOpen,
  onDismiss,
  enquiry,
  subject,
  body,
  templateBlocks,
  attachments,
  followUp,
  fullName,
  userData,
  initialScopeDescription,
  to,
  cc,
  bcc,
  autoInsertedBlocks,
  editedBlocks,
  sendEmail,
  handleDraftEmail,
  isSuccessVisible,
  isDraftConfirmed,
  amount,
  passcode,
}) => {
  const { isDarkMode } = useTheme();
  
  // Strip blocks auto inserted by the system unless edited
  // Disabled for now since we want content to display by default
  const withoutAutoBlocks = body;
  
  // Generate checkout URL first
  const checkoutPreviewUrl = 'https://instruct.helix-law.com/pitch';
  
  // Process body HTML using imported functions
  const sanitized = removeHighlightSpans(withoutAutoBlocks);
  const substituted = applyDynamicSubstitutions(
    sanitized,
    userData,
    enquiry,
    amount,
    passcode
  );
  const highlightedBody = markUnfilledPlaceholders(substituted, templateBlocks);
  const useV2Preview = EMAIL_V2_CONFIG.enabled;
  const processedBody = useV2Preview
    ? processEmailContentV2(highlightedBody)
    : convertDoubleBreaksToParagraphs(highlightedBody);
  const previewHtml = ReactDOMServer.renderToStaticMarkup(
  <EmailSignature bodyHtml={processedBody} userData={userData} experimentalLayout={useV2Preview} isDarkMode={isDarkMode} />
  );
  const previewRef = React.useRef<HTMLDivElement>(null);

  const [isAiOpen, setIsAiOpen] = React.useState(false);
  const [isConfirmed, setIsConfirmed] = React.useState(false);
  React.useEffect(() => {
    if (isPreviewOpen) {
      setIsConfirmed(false);
    }
  }, [isPreviewOpen]);

  const baseBodyStyles: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
    fontFamily: 'Raleway, sans-serif',
    fontSize: '14px',
    lineHeight: '1.4',
    color: colours.light.text,
    backgroundColor: colours.light.sectionBackground,
    position: 'relative',
    borderRadius: '4px',
    margin: '0 16px 16px 16px',
    border: `1px solid ${colours.light.border}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
  };

  const previewWrapperStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    margin: '0 16px 16px 16px',
    ...(useV2Preview
      ? {
          backgroundColor: 'transparent',
          border: 'none',
          boxShadow: 'none'
        }
      : {})
  };

  const previewBodyStyles: React.CSSProperties = useV2Preview
    ? {
        flex: 1,
        overflowY: 'auto',
        padding: 0,
        fontFamily: 'Raleway, sans-serif',
        fontSize: '14px',
        lineHeight: '1.4',
        color: 'inherit',
        backgroundColor: 'transparent',
        position: 'relative',
        borderRadius: 0,
        margin: 0,
        border: 'none',
        boxShadow: 'none',
        width: '100%'
      }
    : {
        ...baseBodyStyles,
        margin: 0,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        borderTop: 'none'
      };

  const inTeams = isInTeams();
  const useLocalData =
    process.env.REACT_APP_USE_LOCAL_DATA === 'true' || !inTeams;
  const allowedInitials = ['LZ', 'AC'];
  const userInitials = userData?.[0]?.Initials?.toUpperCase() || '';
  const canUseAi = useLocalData || allowedInitials.includes(userInitials);
  const showAiAssistButton = false;

  const followUpOptions: { [key: string]: string } = {
    '1_day': '1 day',
    '2_days': '2 days',
    '3_days': '3 days',
    '7_days': '7 days',
    '14_days': '14 days',
    '30_days': '30 days'
  };

  function formatCurrency(val?: string): string {
    if (!val) return 'N/A';
    const num = parseFloat(val.replace(/,/g, ''));
    if (isNaN(num)) return val;
    return num.toLocaleString('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
    });
  }

  const subjectBannerClass = mergeStyles('subject-banner', {
    background: colours.light.previewBackground,
    border: `1px solid ${colours.light.border}`,
    borderRadius: '4px',
    padding: '12px 16px',
    fontSize: '14px',
    fontWeight: 600,
    color: colours.highlight,
    margin: '0 16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
  });

  const panelStyles = {
    padding: '0',
    backgroundColor: colours.light.sectionBackground,
    color: colours.light.text,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden'
  } as const;

  return (
    <Panel
      isOpen={isPreviewOpen}
      onDismiss={onDismiss}
      type={PanelType.custom}
      customWidth="50%"
      hasCloseButton={false}
      styles={{
        main: panelStyles,
        commands: { display: 'none' },
        content: { 
          padding: 0,
          borderRadius: '0',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          border: 'none'
        },
        overlay: {
          backgroundColor: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)'
        }
      }}
    >
      {/* Compact Header */}
      <div style={{
        background: colours.blue,
        padding: '16px',
        color: 'white',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px'
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Header row with title and recipient info */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '8px',
              flexWrap: 'wrap'
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'white'
              }}>
                Email Preview
              </div>
              <div style={{
                fontSize: '11px',
                opacity: 0.8,
                backgroundColor: 'rgba(255,255,255,0.1)',
                padding: '2px 6px',
                borderRadius: '3px'
              }}>
                To: {fullName || 'N/A'}
              </div>
              <div style={{
                fontSize: '10px',
                opacity: 0.7,
                fontFamily: 'monospace'
              }}>
                {to}
                {(cc || bcc) && (
                  <span style={{ marginLeft: '8px' }}>
                    {cc && <span>CC: {cc} </span>}
                    {bcc && <span>BCC: {bcc}</span>}
                  </span>
                )}
              </div>
            </div>
            
            {/* Request and subject info */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap'
            }}>
              <div style={{
                fontSize: '11px',
                opacity: 0.9,
                backgroundColor: 'rgba(255,255,255,0.1)',
                padding: '4px 8px',
                borderRadius: '3px'
              }}>
                Requesting: {formatCurrency(amount)} for {initialScopeDescription || 'N/A'}
              </div>
              <div style={{
                fontSize: '11px',
                opacity: 0.9,
                backgroundColor: 'rgba(255,255,255,0.1)',
                padding: '4px 8px',
                borderRadius: '3px'
              }}>
                Subject: {subject || 'N/A'}
              </div>
            </div>
          </div>
          
          <IconButton
            iconProps={{ iconName: 'Cancel' }}
            ariaLabel="Close preview"
            onClick={onDismiss}
            styles={{
              root: {
                color: 'white',
                backgroundColor: 'rgba(255,255,255,0.1)',
                borderRadius: '4px',
                width: '32px',
                height: '32px',
                flexShrink: 0
              },
              rootHovered: {
                backgroundColor: 'rgba(255,255,255,0.2)'
              }
            }}
          />
        </div>
      </div>

      <Stack tokens={{ childrenGap: 12 }} styles={{ root: { flex: 1, padding: '12px 0' } }}>
        {/* Success Message */}
        {isSuccessVisible && (
          <div style={{
            margin: '0 16px',
            padding: '12px 16px',
            backgroundColor: '#e8f5e8',
            border: '1px solid #20b26c',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>
            <span style={{
              color: '#20b26c',
              fontWeight: 600,
              fontSize: '14px'
            }}>
              Email drafted successfully
            </span>
          </div>
        )}

  {/* Email Body Preview */}
  <div style={previewWrapperStyles}>
          {!useV2Preview && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: colours.light.previewBackground,
              borderBottom: `1px solid ${colours.light.border}`,
              borderTopLeftRadius: '4px',
              borderTopRightRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#5f6368',
                letterSpacing: '0.5px',
                textTransform: 'uppercase'
              }}>
                Email Content
              </span>
              <div style={{
                marginLeft: 'auto',
                padding: '2px 8px',
                backgroundColor: colours.highlightBlue,
                borderRadius: '6px',
                fontSize: '10px',
                fontWeight: 500,
                color: colours.blue
              }}>
                Preview
              </div>
            </div>
          )}

          <div
            ref={previewRef}
            style={previewBodyStyles}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>

        {/* Follow Up Section */}
        {followUp && (
          <div style={{
            margin: '0 16px',
            padding: '16px',
            backgroundColor: '#fff8e1',
            borderRadius: '4px',
            border: '1px solid #ffcc02',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#f57f17',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px'
            }}>
              Follow Up Reminder
            </div>
            <div style={{
              fontSize: '14px',
              fontWeight: 500,
              color: '#e65100'
            }}>
              {followUpOptions[followUp] || followUp}
            </div>
          </div>
        )}

      </Stack>

      {/* Footer Actions */}
      <div style={{
        padding: '16px 24px',
        backgroundColor: colours.light.previewBackground,
        borderTop: `1px solid ${colours.light.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        {/* Confirmation Checkbox */}
        <Checkbox
          label="Everything looks good, ready to proceed"
          checked={isConfirmed}
          onChange={(_e, checked) => setIsConfirmed(!!checked)}
          styles={{
            root: {
              backgroundColor: colours.light.sectionBackground,
              padding: '12px 16px',
              borderRadius: '6px',
              border: `1px solid ${colours.light.border}`,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'all 0.2s ease',
              selectors: {
                '.is-checked .ms-Checkbox-checkbox': {
                  background: colours.blue,
                  borderColor: colours.blue
                },
                '.is-checked .ms-Checkbox-checkmark': {
                  color: '#ffffff'
                }
              }
            },
            label: {
              fontWeight: 500,
              color: colours.light.text
            },
            checkbox: {
              borderColor: colours.blue
            },
            checkmark: {
              color: '#ffffff'
            }
          }}
        />

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <PrimaryButton
              text="Send Email"
              onClick={sendEmail}
              styles={{
                root: {
                  background: colours.blue,
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0 20px',
                  height: '40px',
                  fontWeight: 600,
                  boxShadow: `0 2px 8px rgba(54, 144, 206, 0.3)`,
                  transition: 'all 0.2s ease'
                },
                rootHovered: {
                  background: colours.darkBlue,
                  transform: 'translateY(-1px)',
                  boxShadow: `0 4px 12px rgba(54, 144, 206, 0.4)`
                },
                rootPressed: {
                  background: colours.darkBlue,
                  transform: 'translateY(0)',
                  boxShadow: `0 2px 6px rgba(54, 144, 206, 0.3)`
                },
                rootDisabled: {
                  background: '#e8eaed',
                  color: '#5f6368'
                }
              }}
              disabled
              title="Sending is disabled in testing mode. Use Draft Email."
            />
            <DefaultButton
              text={isDraftConfirmed ? 'Drafted' : 'Draft Email'}
              onClick={handleDraftEmail}
              styles={{
                root: {
                  backgroundColor: isDraftConfirmed ? '#e8f5e8' : 'white',
                  border: `1px solid ${isDraftConfirmed ? colours.green : '#e8eaed'}`,
                  color: isDraftConfirmed ? colours.green : '#3c4043',
                  borderRadius: '6px',
                  padding: '0 20px',
                  height: '40px',
                  fontWeight: 600,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  transition: 'all 0.2s ease'
                },
                rootHovered: {
                  backgroundColor: isDraftConfirmed ? '#d1edd1' : '#f8f9fa',
                  borderColor: isDraftConfirmed ? '#107c10' : '#dadce0',
                  transform: 'translateY(-1px)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                },
                rootDisabled: {
                  backgroundColor: '#f8f9fa',
                  color: '#9aa0a6',
                  borderColor: '#e8eaed'
                }
              }}
              disabled={!isConfirmed || isDraftConfirmed}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {canUseAi && showAiAssistButton && (
              <DefaultButton
                text="AI Assist"
                styles={{
                  root: {
                    backgroundColor: 'white',
                    border: '1px solid #e8eaed',
                    borderRadius: '6px',
                    padding: '0 16px',
                    height: '36px',
                    fontWeight: 500,
                    color: '#5f6368',
                    transition: 'all 0.2s ease'
                  },
                  rootHovered: {
                    backgroundColor: '#f8f9fa',
                    borderColor: '#dadce0',
                    transform: 'translateY(-1px)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
                  }
                }}
                onClick={() => setIsAiOpen(true)}
                title="Send this email to OpenAI for suggestions"
              />
            )}
            <DefaultButton
              text="Copy"
              styles={{
                root: {
                  backgroundColor: 'white',
                  border: '1px solid #e8eaed',
                  borderRadius: '6px',
                  padding: '0 16px',
                  height: '36px',
                  fontWeight: 500,
                  color: '#5f6368',
                  transition: 'all 0.2s ease'
                },
                rootHovered: {
                  backgroundColor: '#f8f9fa',
                  borderColor: '#dadce0',
                  transform: 'translateY(-1px)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
                }
              }}
              onClick={() => {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = previewHtml;
                navigator.clipboard.writeText(tempDiv.innerText || tempDiv.textContent || '');
              }}
              title="Copy the email preview text to your clipboard"
            />
          </div>
        </div>

        {/* Checkout Link */}
        <Link
          href={checkoutPreviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          styles={{
            root: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              backgroundColor: '#fff8e1',
              borderRadius: '4px',
              border: '1px solid #ffcc02',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 500,
              color: '#f57f17',
              alignSelf: 'flex-start'
            }
          }}
        >
          Preview Checkout Link
        </Link>
      </div>
      {canUseAi && showAiAssistButton && (
        <ExperimentalAssistant
          isOpen={isAiOpen}
          onDismiss={() => setIsAiOpen(false)}
          emailText={`Subject: ${subject}\n\n${previewRef.current?.innerText || ''}`}
        />
      )}
    </Panel>
  );
};

export default EmailPreview;