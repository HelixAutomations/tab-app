import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Stack,
  Text,
  Panel,
  PanelType,
  Link,
  TooltipHost,
  PrimaryButton,
  DefaultButton,
  Icon,
  MessageBar,
  MessageBarType,
} from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { FormItem } from '../../app/functionality/types';
import { mergeStyles } from '@fluentui/react';
import loaderIcon from '../../assets/grey helix mark.png';
import { BespokeForm } from '../../app/styles/BespokeForms';

interface FormDetailsProps {
  link: FormItem;
  isDarkMode: boolean;
  onClose: () => void;
  isOpen: boolean;
  isFinancial?: boolean; // New prop
}

const detailsContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
  });

const headerContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'flex-start',
    padding: '16px 24px',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    borderBottom: 'none',
  });

const titleStyle = (isDarkMode: boolean) =>
  mergeStyles({
    marginLeft: '10px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '20px',
    fontWeight: 700,
    alignSelf: 'flex-start',
  });

const buttonsContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    marginTop: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  });

const leftButtonsStyle = () =>
  mergeStyles({
    display: 'flex',
    gap: '10px',
  });

const panelStyles = {
  main: {
    height: '100vh',
    maxWidth: '800px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '0',
  },
  scrollableContent: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  navigation: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '0',
    boxSizing: 'border-box',
    borderBottom: `1px solid ${colours.light.border}`,
  },
};

const FormDetails: React.FC<FormDetailsProps> = ({ link, isDarkMode, onClose, isOpen }) => {
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [isCognitoLoaded, setIsCognitoLoaded] = useState<boolean>(false);
  const formContainerRef = useRef<HTMLDivElement>(null);
  const loaderStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  };

  // Function to load the Cognito seamless script
  const loadCognitoScript = useCallback((): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      // Check if Cognito is already available
      if ((window as any).Cognito) {
        resolve();
        return;
      }

      // Check if the script is already present
      const existingScript = document.getElementById('cognito-seamless-script');
      if (existingScript) {
        // If the script is already present but Cognito is not ready, wait for it to load
        existingScript.addEventListener('load', () => {
          if ((window as any).Cognito) {
            resolve();
          } else {
            reject(new Error('Cognito script loaded but Cognito is not available'));
          }
        });
        existingScript.addEventListener('error', () => reject(new Error('Failed to load Cognito script')));
      } else {
        // If the script is not present, create and append it
        const script = document.createElement('script');
        script.id = 'cognito-seamless-script';
        script.src = 'https://www.cognitoforms.com/f/seamless.js';
        script.async = true;
        script.onload = () => {
          if ((window as any).Cognito) {
            resolve();
          } else {
            reject(new Error('Cognito script loaded but Cognito is not available'));
          }
        };
        script.onerror = () => reject(new Error('Failed to load Cognito script'));
        document.body.appendChild(script);
      }
    });
  }, []);

  // Load the Cognito script when the component mounts
  useEffect(() => {
    if (isOpen) {
      loadCognitoScript()
        .then(() => {
          setIsCognitoLoaded(true);
        })
        .catch((err) => {
          console.error(err);
        });
    }
  }, [loadCognitoScript, isOpen]);

  // Embed the form when the script is loaded
  useEffect(() => {
    if (isCognitoLoaded && link.embedScript && formContainerRef.current) {
      // Clear previous content to avoid duplicate forms
      formContainerRef.current.innerHTML = '';

      // Create script tag for the form
      const formScript = document.createElement('script');
      formScript.src = 'https://www.cognitoforms.com/f/seamless.js';
      formScript.async = true;
      formScript.setAttribute('data-key', link.embedScript.key);
      formScript.setAttribute('data-form', link.embedScript.formId);

      formContainerRef.current.appendChild(formScript);
    }
  }, [isCognitoLoaded, link.embedScript]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard
      .writeText(link.url)
      .then(() => {
        setCopySuccess(`Copied '${link.title}' URL to clipboard!`);
        setTimeout(() => setCopySuccess(null), 3000);
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
      });
  }, [link.url, link.title]);

  const goToLink = useCallback(() => {
    window.open(link.url, '_blank', 'noopener,noreferrer');
  }, [link.url]);

  return (
    <Panel
      isOpen={isOpen}
      onDismiss={onClose}
      type={PanelType.custom}
      customWidth="100%"
      styles={panelStyles}
      onRenderHeader={() => (
        <div className={headerContainerStyle(isDarkMode)}>
          {link.icon && (
            <Icon
              iconName={link.icon}
              styles={{
                root: {
                  fontSize: 24,
                  color: colours.highlight,
                  marginTop: '2px',
                },
              }}
              aria-hidden="true"
            />
          )}
          <Text variant="medium" className={titleStyle(isDarkMode)}>
            {link.title}
          </Text>
        </div>
      )}
    >
      {/* Main content area */}
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        {/* Embed Form */}
        {link.embedScript ? (
          <div
            ref={formContainerRef}
            style={{ marginTop: '20px', padding: '0 24px', flexGrow: 1 }}
          >
            {!isCognitoLoaded && (
              <div style={loaderStyle}>
                <img src={loaderIcon} alt="Loading..." style={{ width: '100px', height: 'auto' }} />
              </div>
            )}
            {/* Cognito form will be injected here */}
          </div>
        ) : link.fields ? (
          <div style={{ marginTop: '20px', padding: '0 24px', flexGrow: 1 }}>
            <BespokeForm
              fields={link.fields}
              onSubmit={(values) => console.log('Submitted Financial Form:', values)}
              onCancel={() => console.log('Form cancelled')}
            />
          </div>
        ) : (
          <div style={{ marginTop: '20px', padding: '0 24px', flexGrow: 1 }}>
            <Text>No form available for this item.</Text>
          </div>
        )}


        {/* Content aligned to the bottom */}
        <div className={detailsContainerStyle(isDarkMode)}>
          {/* URL Section */}
          <Stack tokens={{ childrenGap: 6 }}>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
              URL:
            </Text>
            <Link href={link.url} target="_blank" rel="noopener noreferrer">
              {link.url}
            </Link>
          </Stack>

          {/* Buttons */}
          <div className={buttonsContainerStyle(isDarkMode)}>
            <div className={leftButtonsStyle()}>
              <PrimaryButton
                text="Copy"
                onClick={copyToClipboard}
                styles={{
                  root: {
                    padding: '6px 12px',
                    borderRadius: '4px',
                    backgroundColor: colours.cta,
                    border: 'none',
                    selectors: {
                      ':hover': {
                        backgroundColor: colours.highlight,
                      },
                    },
                  },
                  label: {
                    color: 'white',
                    fontWeight: '600',
                  },
                }}
                ariaLabel="Copy URL to clipboard"
                iconProps={{ iconName: 'Copy' }}
              />
              <PrimaryButton
                text="Go To"
                onClick={goToLink}
                styles={{
                  root: {
                    padding: '6px 12px',
                    borderRadius: '4px',
                    backgroundColor: colours.cta,
                    border: 'none',
                    selectors: {
                      ':hover': {
                        backgroundColor: colours.highlight,
                      },
                    },
                  },
                  label: {
                    color: 'white',
                    fontWeight: '600',
                  },
                }}
                ariaLabel="Go to URL"
                iconProps={{ iconName: 'NavigateExternalInline' }}
              />
            </div>
            <DefaultButton
              text="Close"
              onClick={onClose}
              styles={{
                root: {
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
                  selectors: {
                    ':hover': {
                      backgroundColor: isDarkMode ? colours.dark.cardHover : colours.light.cardHover,
                    },
                  },
                },
                label: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  fontWeight: '600',
                },
              }}
              ariaLabel="Close Details"
              iconProps={{ iconName: 'Cancel' }}
            />
          </div>
        </div>
      </div>

      {/* Copy Confirmation Message */}
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
              borderRadius: '4px',
            },
          }}
        >
          {copySuccess}
        </MessageBar>
      )}
    </Panel>
  );
};

export default FormDetails;
