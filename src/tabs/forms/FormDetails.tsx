
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Stack,
  Text,
  Link,
  PrimaryButton,
  DefaultButton,
  MessageBar,
  MessageBarType,
} from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { FormItem, UserData, Matter } from '../../app/functionality/types';
import { mergeStyles } from '@fluentui/react';
import loaderIcon from '../../assets/grey helix mark.png';
import BespokeForm from '../../CustomForms/BespokeForms';
import {
  sharedPrimaryButtonStyles,
  sharedDefaultButtonStyles,
// invisible change
} from '../../app/styles/ButtonStyles';
import BespokePanel from '../../app/functionality/BespokePanel';
import { getProxyBaseUrl } from "../../utils/getProxyBaseUrl";

interface FormDetailsProps {
  link: FormItem;
  isDarkMode: boolean;
  onClose: () => void;
  isOpen: boolean;
  isFinancial?: boolean;
  userData: UserData[] | null;
  matters: Matter[]; // NEW: Added matters prop to receive the matter data
  offsetTop?: number; // Offset to avoid overlapping navigator
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

const loaderStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100%',
};

const FormDetails: React.FC<FormDetailsProps> = ({
  link,
  isDarkMode,
  onClose,
  isOpen,
  userData,
  matters,
  offsetTop = 96,
}) => {
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [isCognitoLoaded, setIsCognitoLoaded] = useState<boolean>(false);
  const formContainerRef = useRef<HTMLDivElement>(null);

  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);
  const [formKey, setFormKey] = useState<number>(() => Date.now());
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadCognitoScript = useCallback((): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      if ((window as any).Cognito) {
        resolve();
        return;
      }
      const existingScript = document.getElementById('cognito-seamless-script');
      if (existingScript) {
        existingScript.addEventListener('load', () => {
          if ((window as any).Cognito) {
            resolve();
          } else {
            reject(new Error('Cognito script loaded but Cognito is not available'));
          }
        });
        existingScript.addEventListener('error', () =>
          reject(new Error('Failed to load Cognito script'))
        );
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
    if (!link.url) return;
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

  const handleFinancialSubmit = useCallback(
    async (values: any) => {
      if (isSubmitting) return; // Prevent multiple submissions

      setIsSubmitting(true); // Disable the button

      const payload = {
        formType: link.title,
        data: values,
        initials: userData?.[0]?.Initials || 'N/A',
      };
      const endpointUrl = `${getProxyBaseUrl()}/${process.env.REACT_APP_POST_FINANCIAL_TASK_PATH}?code=${process.env.REACT_APP_POST_FINANCIAL_TASK_CODE}`;

      try {
        const response = await fetch(endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error('Error posting financial task:', errText);
          setSubmissionSuccess(null);
        } else {
          const result = await response.json();
          console.log('Financial task created successfully:', result);
          setIsSubmitted(true);
          setSubmissionSuccess('Financial form submitted successfully!');

          setTimeout(() => {
            setIsSubmitted(false);
            setSubmissionSuccess(null);
            setFormKey(Date.now());
          }, 3000);
        }

        if (link.title === 'Payment Requests') {
          try {
            await fetch(
              'https://prod-16.uksouth.logic.azure.com:443/workflows/625f5ed1d19b42999e113bd44c4799e5/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=OQhUuEJuXMgy2UCbOAuwM-3OBKb0xLIKgbp1GcnH_Bg',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values),
              }
            );
          } catch (err) {
            console.error('Error posting payment request to external endpoint:', err);
          }
        }
      } catch (error: any) {
        console.error('Error in financial form submission:', error);
        setSubmissionSuccess(null);
      } finally {
        setIsSubmitting(false); // Re-enable the button after response
      }
    },
    [link.title, userData, isSubmitting]
  );

  return (
    <BespokePanel
      isOpen={isOpen}
      onClose={onClose}
      title={link.title}
      width="60%"
      offsetTop={offsetTop}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {submissionSuccess && (
          <MessageBar
            messageBarType={MessageBarType.success}
            isMultiline={false}
            onDismiss={() => setSubmissionSuccess(null)}
            dismissButtonAriaLabel="Close"
            styles={{
              root: {
                marginBottom: '10px',
                borderRadius: '4px',
              },
            }}
          >
            {submissionSuccess}
          </MessageBar>
        )}

        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '20px' }}>
          {link.embedScript ? (
            <div ref={formContainerRef} style={{ flexGrow: 1 }}>
              {!isCognitoLoaded && (
                <div style={loaderStyle}>
                  <img
                    src={loaderIcon}
                    alt="Loading..."
                    style={{ width: '100px', height: 'auto' }}
                  />
                </div>
              )}
            </div>
          ) : link.fields ? (
            <div style={{ flexGrow: 1 }}>
              <BespokeForm
                key={formKey}
                fields={link.fields.map((field) => ({ ...field, name: field.label }))}
                onSubmit={handleFinancialSubmit}
                onCancel={() => console.log('Form cancelled')}
                isSubmitting={isSubmitting}
                matters={matters} // Pass matters down so the form can render a Matter Reference dropdown
              />
            </div>
          ) : link.component ? (
            React.createElement(link.component, {
              users: userData || [],
              matters,
              onBack: onClose,
            })
          ) : (
            <div>
              <Text>No form available for this item.</Text>
            </div>
          )}
        </div>

        <div className={detailsContainerStyle(isDarkMode)}>
          <Stack tokens={{ childrenGap: 6 }}>
            <Text>
              <Link
                href="https://helix-law.co.uk/"
                target="_blank"
                styles={{
                  root: {
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    fontSize: '12px',
                    fontFamily: 'Raleway, sans-serif',
                    textDecoration: 'none',
                  },
                }}
                aria-label="Helix Law Website"
              >
                https://helix-law.co.uk/
              </Link>{' '}
              |{' '}
              <Text
                variant="small"
                styles={{
                  root: {
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    display: 'inline',
                  },
                }}
              >
                01273 761990
              </Text>
            </Text>
            <Text
              styles={{
                root: {
                  fontSize: '12px',
                  fontFamily: 'Raleway, sans-serif',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
            >
              Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE
            </Text>
          </Stack>
          <div className={buttonsContainerStyle(isDarkMode)}>
            <div className={leftButtonsStyle()}>
              {link.url && (
                <>
                  <PrimaryButton
                    text="Copy"
                    onClick={copyToClipboard}
                    styles={sharedPrimaryButtonStyles}
                    ariaLabel="Copy URL to clipboard"
                  />
                  <PrimaryButton
                    text="Go To"
                    onClick={goToLink}
                    styles={sharedPrimaryButtonStyles}
                    ariaLabel="Go to URL"
                  />
                </>
              )}
            </div>
            <DefaultButton
              text="Close"
              onClick={onClose}
              styles={sharedDefaultButtonStyles}
              ariaLabel="Close Details"
            />
          </div>
        </div>
      </div>

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
