import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Stack,
  Text,
  Link,
  TooltipHost,
  PrimaryButton,
  DefaultButton,
  Icon,
  MessageBar,
  MessageBarType,
} from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { FormItem, UserData } from '../../app/functionality/types';
import { mergeStyles } from '@fluentui/react';
import loaderIcon from '../../assets/grey helix mark.png';
import BespokeForm from '../../CustomForms/BespokeForms';
import { sharedPrimaryButtonStyles, sharedDefaultButtonStyles } from '../../app/styles/ButtonStyles';

// Import the custom BespokePanel
import BespokePanel from '../../app/functionality/BespokePanel';

interface FormDetailsProps {
  link: FormItem;
  isDarkMode: boolean;
  onClose: () => void;
  isOpen: boolean;
  isFinancial?: boolean;
  userData: UserData[] | null; // userData prop
}

const detailsContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  });

const leftButtonsStyle = () =>
  mergeStyles({
    display: 'flex',
    gap: '10px',
  });

const FormDetails: React.FC<FormDetailsProps> = ({ link, isDarkMode, onClose, isOpen, userData }) => {
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
        existingScript.addEventListener('load', () => {
          if ((window as any).Cognito) {
            resolve();
          } else {
            reject(new Error('Cognito script loaded but Cognito is not available'));
          }
        });
        existingScript.addEventListener('error', () => reject(new Error('Failed to load Cognito script')));
      } else {
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

  // Load the Cognito script when the panel opens
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
      formContainerRef.current.innerHTML = '';
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

  // Handler for financial form submission
  const handleFinancialSubmit = useCallback(
    async (values: any) => {
      // Build the payload
      const payload = {
        formType: link.title,
        data: values,
        initials: userData?.[0]?.Initials || "N/A", // Only send initials
      };

      // Endpoint URL (REACT_APP_POST_FINANCIAL_TASK_PATH is set to 'postFinancialTask')
      const endpointUrl = `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_POST_FINANCIAL_TASK_PATH}?code=${process.env.REACT_APP_POST_FINANCIAL_TASK_CODE}`;

      try {
        const response = await fetch(endpointUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error("Error posting financial task:", errText);
          // Optionally, show an error message to the user.
        } else {
          const result = await response.json();
          console.log("Financial task created successfully:", result);
          // Optionally, show a success message to the user.
        }
      } catch (error: any) {
        console.error("Error in financial form submission:", error);
      }
    },
    [link.title, userData]
  );

  return (
    <BespokePanel
      isOpen={isOpen}
      onClose={onClose}
      title={link.title}
      width="1000px" // Increased width (original was 800px)
    >
      {/* Main container */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Form Content */}
        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '20px' }}>
          {link.embedScript ? (
            <div ref={formContainerRef} style={{ flexGrow: 1 }}>
              {!isCognitoLoaded && (
                <div style={loaderStyle}>
                  <img src={loaderIcon} alt="Loading..." style={{ width: '100px', height: 'auto' }} />
                </div>
              )}
              {/* Cognito form will be injected here */}
            </div>
          ) : link.fields ? (
            <div style={{ flexGrow: 1 }}>
              <BespokeForm
                fields={link.fields.map(field => ({ ...field, name: field.label }))}
                onSubmit={handleFinancialSubmit} // Custom submission handler
                onCancel={() => console.log('Form cancelled')}
              />
            </div>
          ) : (
            <div>
              <Text>No form available for this item.</Text>
            </div>
          )}
        </div>

        {/* Footer: URL and Buttons */}
        <div className={detailsContainerStyle(isDarkMode)}>
          <Stack tokens={{ childrenGap: 6 }}>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
              URL:
            </Text>
            <Link href={link.url} target="_blank" rel="noopener noreferrer">
              {link.url}
            </Link>
          </Stack>
          <div className={buttonsContainerStyle(isDarkMode)}>
            <div className={leftButtonsStyle()}>
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
    </BespokePanel>
  );
};

export default FormDetails;
