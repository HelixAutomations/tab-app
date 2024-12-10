// src/tabs/home/HomePanel.tsx

import React, { useEffect, useCallback, useRef, useState } from 'react';
import {
  Stack,
  Text,
  Panel,
  PanelType,
  Link,
  PrimaryButton,
  DefaultButton,
  MessageBar,
  MessageBarType,
  Icon,
  TextField, // Added TextField import
} from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { mergeStyles } from '@fluentui/react';
import loaderIcon from '../../assets/grey helix mark.png';
import { BespokeForm } from '../../app/styles/BespokeForms';
import { FormItem } from '../../app/functionality/types';
import { sharedPrimaryButtonStyles, sharedDefaultButtonStyles } from '../../app/styles/ButtonStyles';

interface HomePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  isDarkMode: boolean;
  embedScript?: { key: string; formId: string }; // For Cognito forms
  bespokeFormFields?: any[]; // For bespoke forms
  displayUrl?: string; // For dynamic URL display
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

const HomePanel: React.FC<HomePanelProps> = ({
  isOpen,
  onClose,
  title,
  isDarkMode,
  embedScript,
  bespokeFormFields,
  displayUrl,
}) => {
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

  // Load the Cognito script when the panel is opened
  useEffect(() => {
    if (embedScript && isOpen) {
      setIsCognitoLoaded(false);
      loadCognitoScript()
        .then(() => {
          setIsCognitoLoaded(true);
        })
        .catch((err) => {
          console.error(err);
        });
    }
  }, [embedScript, isOpen, loadCognitoScript]);

  // Embed the Cognito form when the script is loaded
  useEffect(() => {
    if (isCognitoLoaded && embedScript && formContainerRef.current) {
      // Clear previous content to avoid duplicate forms
      formContainerRef.current.innerHTML = '';

      // Create script tag for the form
      const formScript = document.createElement('script');
      formScript.src = 'https://www.cognitoforms.com/f/seamless.js';
      formScript.async = true;
      formScript.setAttribute('data-key', embedScript.key);
      formScript.setAttribute('data-form', embedScript.formId);

      formContainerRef.current.appendChild(formScript);
    }
  }, [isCognitoLoaded, embedScript]);

  const copyToClipboard = useCallback(() => {
    if (!displayUrl) return;
    const url = displayUrl;

    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopySuccess(`Copied '${title}' URL to clipboard!`);
        setTimeout(() => setCopySuccess(null), 3000);
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
      });
  }, [displayUrl, title]);

  const goToLink = useCallback(() => {
    if (!displayUrl) return;
    const url = displayUrl;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [displayUrl]);

  return (
    <Panel
      isOpen={isOpen}
      onDismiss={onClose}
      type={PanelType.custom}
      customWidth="100%"
      styles={panelStyles}
      onRenderHeader={() => (
        <div className={headerContainerStyle(isDarkMode)}>
          <Text variant="medium" className={titleStyle(isDarkMode)}>
            {title}
          </Text>
        </div>
      )}
    >
      {/* Main Content */}
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        {/* Embed Form or Bespoke Form */}
        {embedScript ? (
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
        ) : (
          <>
            {title === "Request Annual Leave" && bespokeFormFields ? (
              <Stack
                tokens={{ childrenGap: 20 }}
                style={{ marginTop: '20px', padding: '0 24px', flexGrow: 1 }}
              >
                {/* Grouped Fields: Start Date and End Date Side by Side */}
                <Stack horizontal tokens={{ childrenGap: 10 }}>
                  {bespokeFormFields
                    .filter((field) => field.group === 'dateRange')
                    .map((field, index) => (
                      <TextField
                        key={index}
                        label={field.label}
                        required={field.required}
                        placeholder={field.placeholder}
                        type="date"
                        styles={{
                          fieldGroup: {
                            flex: 1, // Ensures equal width for fields
                            borderRadius: '8px',
                            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                            backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                          },
                        }}
                      />
                    ))}
                </Stack>

                {/* Render Other Fields Normally */}
                {bespokeFormFields
                  .filter((field) => field.group !== 'dateRange')
                  .map((field, index) => {
                    switch (field.type) {
                      case 'textarea':
                        return (
                          <TextField
                            key={index}
                            label={field.label}
                            required={field.required}
                            placeholder={field.placeholder}
                            multiline
                            rows={3}
                            styles={{
                              fieldGroup: {
                                borderRadius: '8px',
                                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                              },
                            }}
                          />
                        );
                      // Add other field types if necessary
                      default:
                        return (
                          <TextField
                            key={index}
                            label={field.label}
                            required={field.required}
                            placeholder={field.placeholder}
                            type={field.type}
                            styles={{
                              fieldGroup: {
                                borderRadius: '8px',
                                border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
                                backgroundColor: isDarkMode ? colours.dark.inputBackground : colours.light.inputBackground,
                              },
                            }}
                          />
                        );
                    }
                  })}
              </Stack>
            ) : bespokeFormFields ? (
              <div style={{ marginTop: '20px', padding: '0 24px', flexGrow: 1 }}>
                <BespokeForm
                  fields={bespokeFormFields}
                  onSubmit={(values) => {
                    console.log('Submitted Form:', values);
                    onClose();
                  }}
                  onCancel={onClose}
                />
              </div>
            ) : (
              <div style={{ marginTop: '20px', padding: '0 24px', flexGrow: 1 }}>
                <Text>No form available for this item.</Text>
              </div>
            )}
          </>
        )}
      </div>

      {/* Content aligned to the bottom */}
      <div className={detailsContainerStyle(isDarkMode)}>
        {/* URL Section */}
        {displayUrl && (
          <Stack tokens={{ childrenGap: 6 }}>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
              URL:
            </Text>
            <Link href={displayUrl} target="_blank" rel="noopener noreferrer">
              {displayUrl}
            </Link>
          </Stack>
        )}

        {/* Buttons */}
        <div className={buttonsContainerStyle(isDarkMode)}>
        <div className={leftButtonsStyle()}>
            {displayUrl && (
            <>
                <PrimaryButton
                text="Copy"
                onClick={copyToClipboard}
                styles={sharedPrimaryButtonStyles}
                ariaLabel="Copy URL to clipboard"
                iconProps={{ iconName: 'Copy' }}
                />
                <PrimaryButton
                text="Go To"
                onClick={goToLink}
                styles={sharedPrimaryButtonStyles}
                ariaLabel="Go to URL"
                iconProps={{ iconName: 'NavigateExternalInline' }}
                />
            </>
            )}
        </div>
        <DefaultButton
            text="Close"
            onClick={onClose}
            styles={sharedDefaultButtonStyles}
            ariaLabel="Close Details"
            iconProps={{ iconName: 'Cancel' }}
        />
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
              borderRadius: '8px',
              backgroundColor: colours.green,
              color: 'white',
            },
          }}
        >
          {copySuccess}
        </MessageBar>
      )}

      {/* Pulse Animation Styles */}
      <style>
        {`
          @keyframes pulse {
            0% {
              transform: translate(-50%, -50%) scale(1);
              opacity: 0.7;
            }
            70% {
              transform: translate(-50%, -50%) scale(1.5);
              opacity: 0;
            }
            100% {
              transform: translate(-50%, -50%) scale(2);
              opacity: 0;
            }
          }
        `}
      </style>
    </Panel>
  );
};

export default HomePanel;
