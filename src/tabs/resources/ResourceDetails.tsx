// src/ResourceDetails.tsx

import React from 'react';
import {
  Stack,
  Text,
  IconButton,
  mergeStyles,
  Panel,
  PanelType,
  Link,
  TooltipHost,
  PrimaryButton,
  DefaultButton,
  Icon,
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
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
  });

const ResourceDetails: React.FC<ResourceDetailsProps> = ({ resource, onClose }) => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context

  return (
    <Panel
      isOpen={true}
      onDismiss={onClose}
      type={PanelType.medium}
      headerText={`Resource Details: ${resource.title}`}
      closeButtonAriaLabel="Close"
      styles={{
        main: {
          backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
          color: isDarkMode ? colours.dark.text : colours.light.text,
        },
      }}
    >
      <div className={detailsContainerStyle(isDarkMode)}>
        {/* Resource Icon and Title */}
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
          {resource.icon && <Icon iconName={resource.icon} styles={{ root: { fontSize: 32, color: colours.highlight } }} />}
          <Text variant="xLarge" styles={{ root: { fontWeight: 700 } }}>
            {resource.title}
          </Text>
        </Stack>

        {/* Resource URL */}
        <Stack tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: '20px' } }}>
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
            <Stack horizontal wrap tokens={{ childrenGap: 10 }}>
              {resource.tags.map((tag) => (
                <TooltipHost content={tag} key={tag}>
                  <span
                    className={mergeStyles({
                      backgroundColor: colours.tagBackground,
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

        {/* Action Buttons */}
        <Stack horizontal tokens={{ childrenGap: 15 }} styles={{ root: { marginTop: '30px' } }}>
          <PrimaryButton
            text="Go To Resource"
            onClick={() => window.open(resource.url, '_blank', 'noopener,noreferrer')}
            styles={{
              root: {
                backgroundColor: colours.cta,
                borderRadius: '8px',
                border: 'none',
                selectors: {
                  ':hover': {
                    backgroundColor: colours.red,
                  },
                },
              },
              label: {
                color: 'white',
                fontWeight: '600',
              },
            }}
            ariaLabel="Go To Resource"
            iconProps={{ iconName: 'NavigateExternalInline' }}
          />
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
        </Stack>
      </div>
    </Panel>
  );
};

export default ResourceDetails;
