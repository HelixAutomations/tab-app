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
import { colours } from '../../app/styles/colours';
import { Resource } from './Resources';
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme

interface ResourceDetailsProps {
  resource: Resource;
  onClose: () => void;
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

const ResourceDetails: React.FC<ResourceDetailsProps> = ({ resource, onClose }) => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

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
        {/* Blank Main Area */}
        <div style={{ marginTop: '20px', padding: '0 24px', flexGrow: 1 }}>
          <Text>Content area is currently blank.</Text>
        </div>

        {/* Bottom Section */}
        <div className={detailsContainerStyle(isDarkMode)}>
          {/* URL Section */}
          <Stack tokens={{ childrenGap: 6 }}>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
              URL:
            </Text>
            <Link href={resource.url} target="_blank" rel="noopener noreferrer">
              {resource.url}
            </Link>
          </Stack>

          {/* Tags */}
          {resource.tags && resource.tags.length > 0 && (
            <Stack tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: '20px' } }}>
              <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
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
                        borderRadius: '4px',
                        padding: '4px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
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
              <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
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

export default ResourceDetails;
