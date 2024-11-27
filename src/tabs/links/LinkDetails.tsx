// src/LinkDetails.tsx

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
import { LinkItem } from '../../app/functionality/types';

interface LinkDetailsProps {
  link: LinkItem;
  isDarkMode: boolean;
  onClose: () => void;
}

const detailsContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontFamily: 'Raleway, sans-serif',
  });

const LinkDetails: React.FC<LinkDetailsProps> = ({ link, isDarkMode, onClose }) => {
  return (
    <Panel
      isOpen={true}
      onDismiss={onClose}
      type={PanelType.medium}
      headerText={`Link Details: ${link.title}`}
      closeButtonAriaLabel="Close"
      styles={{
        main: {
          backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
          color: isDarkMode ? colours.dark.text : colours.light.text,
        },
      }}
    >
      <div className={detailsContainerStyle(isDarkMode)}>
        {/* Link Icon and Title */}
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
          {link.icon && <Icon iconName={link.icon} styles={{ root: { fontSize: 32, color: colours.highlight } }} />}
          <Text variant="xLarge" styles={{ root: { fontWeight: 700 } }}>
            {link.title}
          </Text>
        </Stack>

        {/* Link URL */}
        <Stack tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: '20px' } }}>
          <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
            URL:
          </Text>
          <Link href={link.url} target="_blank" rel="noopener noreferrer">
            {link.url}
          </Link>
        </Stack>

        {/* Tags */}
        {link.tags && link.tags.length > 0 && (
          <Stack tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: '20px' } }}>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
              Tags:
            </Text>
            <Stack horizontal tokens={{ childrenGap: 10 }} wrap>
              {link.tags.map((tag) => (
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
        {link.description && (
          <Stack tokens={{ childrenGap: 6 }} styles={{ root: { marginTop: '20px' } }}>
            <Text variant="mediumPlus" styles={{ root: { fontWeight: 600 } }}>
              Description:
            </Text>
            <Text>{link.description}</Text>
          </Stack>
        )}

        {/* Action Buttons */}
        <Stack horizontal tokens={{ childrenGap: 15 }} styles={{ root: { marginTop: '30px' } }}>
          <PrimaryButton
            text="Go To Link"
            onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
            styles={{
              root: {
                backgroundColor: colours.cta,
                borderRadius: '8px',
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
            ariaLabel="Go To Link"
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

export default LinkDetails;
