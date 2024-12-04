// src/tabs/resources/ResourceDetails.tsx

import React, { useCallback, useState } from 'react';
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
  mergeStyles,
} from '@fluentui/react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { colours } from '../../app/styles/colours';
import { Resource } from './Resources';
import { useTheme } from '../../app/functionality/ThemeContext';
import StyledTextField from '../../app/styles/StyledTextField';
import { ResourceAction, resourceActions } from '../../app/customisation/ResourceActions';
import '../../app/styles/ResourceDetails.css'; // Ensure this path is correct
import { BespokeForm } from '../../app/styles/BespokeForms';

interface ResourceDetailsProps {
  resource: Resource;
  onClose: () => void;
}

// Define all necessary style constants
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

const detailsContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
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
    gap: '20px', // Increased spacing between buttons
  });

// Styles for the input form container
const formContainerStyle = mergeStyles({
  marginTop: '10px', // Reduced margin to align closely under the button
  padding: '20px',
  backgroundColor: colours.grey, // Subtle grey background
  borderRadius: '12px',
  // No shadow as per requirement
});

// Define a style for action buttons similar to ResourceCard
const actionButtonStyle = (isDarkMode: boolean, isSelected: boolean) =>
  mergeStyles({
    padding: '20px',
    backgroundColor: isSelected
      ? (isDarkMode ? colours.dark.buttonBackground : colours.light.buttonBackground)
      : (isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground),
    border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
    borderRadius: '8px',
    color: isSelected
      ? (isDarkMode ? colours.dark.buttonText : colours.light.buttonText)
      : (isDarkMode ? colours.dark.text : colours.light.text),
    transition: 'background-color 0.3s ease, color 0.3s ease',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: '70px', // Increased height for taller buttons
    ':hover': {
      backgroundColor: isSelected
        ? (isDarkMode ? colours.dark.hoverBackground : colours.light.hoverBackground)
        : (isDarkMode ? colours.dark.cardHover : colours.light.cardHover),
    },
  });

const ResourceDetails: React.FC<ResourceDetailsProps> = ({ resource, onClose }) => {
  const { isDarkMode } = useTheme();
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<ResourceAction | null>(null);
  const [actionInputs, setActionInputs] = useState<{ [key: string]: string }>({});

  // Normalize the resource title to match the keys in resourceActions
  const normalizedTitle = resource.title.toLowerCase().replace(/\s+/g, '');
  const actions: ResourceAction[] = resourceActions[normalizedTitle] || [];

  // Optional: Log the actions for debugging
  console.log(`Actions for "${resource.title}" (normalized: "${normalizedTitle}"):`, actions);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard
      .writeText(resource.url)
      .then(() => {
        setCopySuccess(`Copied '${resource.title}' URL to clipboard!`);
        setTimeout(() => setCopySuccess(null), 3000);
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
      });
  }, [resource.url, resource.title]);

  const goToLink = useCallback(() => {
    window.open(resource.url, '_blank', 'noopener,noreferrer');
  }, [resource.url]);

  // Handle input changes for action forms
  const handleInputChange = (
    e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>,
    field: string
  ): void => {
    const value = e.currentTarget.value;
    setActionInputs((prev) => ({ ...prev, [field]: value }));
  };

  // Handle action form submission
  const handleActionSubmit = (action: ResourceAction) => {
    const inputs = actionInputs;
    // Replace the alert with actual API calls using the input values
    console.log(`Executing action: ${action.label}`, inputs);
    alert(`Executing action: ${action.label}\nInputs: ${JSON.stringify(inputs)}`);
    // Reset the form after submission
    setSelectedAction(null);
    setActionInputs({});
  };

  return (
    <Panel
      isOpen={true}
      onDismiss={onClose}
      type={PanelType.custom}
      customWidth="100%"
      styles={panelStyles}
      onRenderHeader={() => (
        <div className={headerContainerStyle(isDarkMode)}>
          {resource.icon && (
            <Icon
              iconName={resource.icon}
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
            {resource.title}
          </Text>
        </div>
      )}
    >
      {/* Main content area */}
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
        {/* Action Buttons with Transition */}
        <div style={{ marginTop: '20px', padding: '0 24px', flexGrow: 1 }}>
          {actions.length > 0 ? (
            <Stack tokens={{ childrenGap: 20 }} className={mergeStyles({ width: '100%' })}>
              {actions.map((action) => (
                <div key={action.label} className="action-item">
                  <PrimaryButton
                    text={action.label}
                    onClick={() =>
                      setSelectedAction(selectedAction === action ? null : action)
                    }
                    styles={{
                      root: actionButtonStyle(isDarkMode, selectedAction === action),
                      label: {
                        color: isDarkMode
                          ? (selectedAction === action ? colours.dark.buttonText : colours.dark.text)
                          : (selectedAction === action ? colours.light.buttonText : colours.light.text),
                        fontWeight: '600',
                      },
                    }}
                    ariaLabel={`Select action: ${action.label}`}
                  />
                  <CSSTransition
                    in={selectedAction === action}
                    timeout={300}
                    classNames="intake-form"
                    unmountOnExit
                  >
                    <div className={formContainerStyle}>
                      <BespokeForm
                        fields={action.requiredFields.map((field) => ({
                          label: field.charAt(0).toUpperCase() + field.slice(1),
                          type: 'text', // Adjust type if required
                          placeholder: `Enter ${field}`,
                          required: true,
                        }))}
                        onSubmit={(values) => {
                          console.log(`Action Submitted: ${action.label}`, values);
                          handleActionSubmit(action);
                        }}
                        onCancel={() => {
                          setSelectedAction(null);
                          setActionInputs({});
                        }}
                      />
                    </div>
                  </CSSTransition>
                </div>
              ))}
            </Stack>
          ) : (
            <Text>No actions available for this resource.</Text>
          )}
        </div>


        {/* Bottom Section */}
        <div className={detailsContainerStyle(isDarkMode)}>
          {/* URL Section */}
          <Stack tokens={{ childrenGap: 6 }}>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: '600' } }}>
              URL:
            </Text>
            <Link href={resource.url} target="_blank" rel="noopener noreferrer">
              {resource.url}
            </Link>
          </Stack>

          {/* Tags */}
          {resource.tags && resource.tags.length > 0 && (
            <Stack tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: '20px' } }}>
              <Text variant="mediumPlus" styles={{ root: { fontWeight: '600' } }}>
                Tags:
              </Text>
              <Stack horizontal tokens={{ childrenGap: 10 }} wrap>
                {resource.tags.map((tag) => (
                  <TooltipHost content={tag} key={tag}>
                    <span
                      className={mergeStyles({
                        backgroundColor: isDarkMode
                          ? colours.dark.sectionBackground
                          : colours.light.sectionBackground,
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        borderRadius: '12px',
                        padding: '6px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      })}
                    >
                      <Icon iconName="Tag" />
                      <Text variant="small">{tag}</Text>
                    </span>
                  </TooltipHost>
                ))}
              </Stack>
            </Stack>
          )}

          {/* Description */}
          {resource.description && (
            <Stack tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: '20px' } }}>
              <Text variant="mediumPlus" styles={{ root: { fontWeight: '600' } }}>
                Description:
              </Text>
              <Text>{resource.description}</Text>
            </Stack>
          )}

          {/* Buttons */}
          <div className={buttonsContainerStyle(isDarkMode)}>
            <div className={leftButtonsStyle()}>
              <PrimaryButton
                text="Copy"
                onClick={copyToClipboard}
                styles={{
                  root: {
                    padding: '10px 20px',
                    borderRadius: '8px',
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
                    padding: '10px 20px',
                    borderRadius: '8px',
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
                  padding: '10px 20px',
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
              borderRadius: '8px',
              backgroundColor: colours.green,
              color: 'white',
            },
          }}
        >
          {copySuccess}
        </MessageBar>
      )}
    </Panel>
  );
};

export default ResourceDetails;
