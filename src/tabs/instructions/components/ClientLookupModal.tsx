import React, { useState, useEffect } from 'react';
import { Modal } from '@fluentui/react/lib/Modal';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { TextField } from '@fluentui/react/lib/TextField';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { Spinner } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { List } from '@fluentui/react/lib/List';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { PersonaPresence } from '@fluentui/react/lib/Persona';
import { Persona, PersonaSize } from '@fluentui/react/lib/Persona';
import { Checkbox } from '@fluentui/react/lib/Checkbox';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';

// Helper functions for consistent theming
const mutedText = (dark: boolean): string => (
  dark ? 'rgba(226, 232, 240, 0.72)' : colours.greyText
);

const cardBackground = (dark: boolean): string => (
  dark
    ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.92) 0%, rgba(15, 23, 42, 0.96) 100%)'
    : '#FFFFFF'
);

const borderColour = (dark: boolean): string => (
  dark ? 'rgba(148, 163, 184, 0.32)' : '#e2e8f0'
);

const textColor = (dark: boolean): string => (
  dark ? '#e2e8f0' : '#374151'
);

const hoverBackground = (dark: boolean): string => (
  dark ? 'rgba(51, 65, 85, 0.6)' : '#f8f9fa'
);

interface ClientLookupModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  onClientSelected: (client: ClioClient) => void;
  userInitials: string;
}

interface ClioClient {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  type: 'Person' | 'Company';
}

const ClientLookupModal: React.FC<ClientLookupModalProps> = ({
  isOpen,
  onDismiss,
  onClientSelected,
  userInitials
}) => {
  const { isDarkMode } = useTheme();
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState<ClioClient[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchPrimary, setSearchPrimary] = useState(true); // Primary email (read-only, always checked)
  const [searchHome, setSearchHome] = useState(false);
  const [searchOther, setSearchOther] = useState(false);

  // Clear state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchEmail('');
      setSearchResults([]);
      setError(null);
      setHasSearched(false);
    }
  }, [isOpen]);

  // Debounced search function
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchEmail.trim().length >= 3 && searchEmail.includes('@')) {
        performSearch(searchEmail.trim());
      } else {
        setSearchResults([]);
        setHasSearched(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchEmail, searchPrimary, searchHome, searchOther]); // Re-search when email types change

  const performSearch = async (email: string) => {
    setIsSearching(true);
    setError(null);
    setHasSearched(true);

    try {
      const emailTypes = [];
      if (searchPrimary) emailTypes.push('primary');
      if (searchHome) emailTypes.push('home');
      if (searchOther) emailTypes.push('other');
      
      const response = await fetch(`/api/clio-client-lookup/search?email=${encodeURIComponent(email)}&initials=${userInitials}&emailTypes=${emailTypes.join(',')}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Search failed');
      }

      const data = await response.json();
      setSearchResults(data.clients || []);
    } catch (err) {
      console.error('Client search error:', err);
      setError(err instanceof Error ? err.message : 'Failed to search clients');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClientSelect = (client: ClioClient) => {
    onClientSelected(client);
    onDismiss();
  };

  const renderClientItem = (client: ClioClient, index: number | undefined) => {
    const isCompany = client.type === 'Company';
    const initials = isCompany ? 
      client.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() :
      `${client.firstName?.[0] || ''}${client.lastName?.[0] || ''}`.toUpperCase();

    return (
      <div
        key={client.id}
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${borderColour(isDarkMode)}`,
          cursor: 'pointer',
          transition: 'background-color 0.2s ease'
        }}
        onClick={() => handleClientSelect(client)}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = hoverBackground(isDarkMode);
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
          <Persona
            text={client.name}
            secondaryText={client.email}
            size={PersonaSize.size40}
            presence={PersonaPresence.none}
            initialsColor={colours.highlight}
          />
          <Stack grow>
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
              <Text 
                variant="mediumPlus" 
                style={{ 
                  fontWeight: 600,
                  color: isDarkMode ? '#e2e8f0' : '#374151'
                }}
              >
                {client.name}
              </Text>
              <Text 
                variant="small" 
                style={{ 
                  color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
                  backgroundColor: isDarkMode ? '#1e293b' : '#f4f4f6',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 500
                }}
              >
                {client.type}
              </Text>
            </Stack>
            <Text 
              variant="small" 
              style={{ 
                color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText 
              }}
            >
              {client.email}
            </Text>
            {client.phone && (
              <Text 
                variant="small" 
                style={{ 
                  color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText 
                }}
              >
                {client.phone}
              </Text>
            )}
          </Stack>
          <FontIcon 
            iconName="ChevronRight" 
            style={{ 
              color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
              fontSize: '12px'
            }} 
          />
        </Stack>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      isBlocking={false}
      containerClassName="client-lookup-modal"
      styles={{
        main: {
          maxWidth: '600px',
          width: '90vw',
          maxHeight: '80vh',
          backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
          borderRadius: '8px'
        }
      }}
    >
      <Stack tokens={{ childrenGap: 16 }} styles={{ root: { padding: '24px' } }}>
        {/* Header */}
        <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
          <Text 
            variant="xLarge" 
            style={{ 
              fontWeight: 600,
              color: isDarkMode ? '#e2e8f0' : '#374151'
            }}
          >
            Link Additional Client
          </Text>
          <DefaultButton
            iconProps={{ iconName: 'Cancel' }}
            onClick={onDismiss}
            styles={{
              root: {
                minWidth: 'auto',
                padding: '8px',
                backgroundColor: 'transparent',
                border: 'none'
              }
            }}
          />
        </Stack>

        {/* Description */}
        <Text 
          variant="medium" 
          style={{ 
            color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
            lineHeight: '1.4'
          }}
        >
          Search for existing clients in Clio by email address to link them to this matter.
        </Text>

        {/* Search Input */}
        <SearchBox
          placeholder="Enter client email address..."
          value={searchEmail}
          onChange={(_, newValue) => setSearchEmail(newValue || '')}
          styles={{
            root: {
              borderColor: isDarkMode ? colours.dark.border : '#d0d0d7',
              backgroundColor: isDarkMode ? colours.dark.background : '#ffffff'
            }
          }}
        />

        {/* Search Options */}
        <Stack tokens={{ childrenGap: 8 }}>
          <Text 
            variant="medium" 
            style={{ 
              color: isDarkMode ? '#e2e8f0' : '#374151',
              fontWeight: 600,
              fontSize: '14px'
            }}
          >
            Search in email types:
          </Text>
          <Stack tokens={{ childrenGap: 4 }}>
            <Checkbox
              label="Primary email address"
              checked={searchPrimary}
              disabled={true} // Always checked, read-only
              styles={{
                text: {
                  color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
                  fontSize: '14px'
                },
                checkbox: {
                  opacity: 0.7 // Visual indication it's disabled
                }
              }}
            />
            <Checkbox
              label="Home email address"
              checked={searchHome}
              onChange={(_, checked) => setSearchHome(checked || false)}
              styles={{
                text: {
                  color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
                  fontSize: '14px'
                }
              }}
            />
            <Checkbox
              label="Other email addresses"
              checked={searchOther}
              onChange={(_, checked) => setSearchOther(checked || false)}
              styles={{
                text: {
                  color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
                  fontSize: '14px'
                }
              }}
            />
          </Stack>
        </Stack>

        {/* Error Message */}
        {error && (
          <MessageBar messageBarType={MessageBarType.error} onDismiss={() => setError(null)}>
            {error}
          </MessageBar>
        )}

        {/* Loading Indicator */}
        {isSearching && (
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
            <Spinner size={1} />
            <Text style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText }}>
              Searching Clio for clients...
            </Text>
          </Stack>
        )}

        {/* Search Results */}
        {hasSearched && !isSearching && (
          <Stack>
            <Text 
              variant="medium" 
              style={{ 
                fontWeight: 600,
                marginBottom: '8px',
                color: isDarkMode ? '#e2e8f0' : '#374151'
              }}
            >
              Search Results ({searchResults.length})
            </Text>
            
            {searchResults.length === 0 ? (
              <Stack 
                horizontalAlign="center" 
                verticalAlign="center" 
                styles={{ 
                  root: { 
                    padding: '32px',
                    backgroundColor: isDarkMode ? colours.dark.background : '#f8f9fa',
                    borderRadius: '8px',
                    border: `1px dashed ${isDarkMode ? colours.dark.border : '#d0d0d7'}`
                  } 
                }}
              >
                <FontIcon 
                  iconName="SearchIssue" 
                  style={{ 
                    fontSize: '24px',
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
                    marginBottom: '8px'
                  }} 
                />
                <Text 
                  variant="medium" 
                  style={{ 
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
                    textAlign: 'center'
                  }}
                >
                  No clients found matching "{searchEmail}"
                </Text>
                <Text 
                  variant="small" 
                  style={{ 
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
                    textAlign: 'center',
                    marginTop: '4px'
                  }}
                >
                  Try a different email address or check the spelling
                </Text>
              </Stack>
            ) : (
              <div
                style={{
                  maxHeight: '300px',
                  overflow: 'auto',
                  border: `1px solid ${isDarkMode ? colours.dark.border : '#e1e5e9'}`,
                  borderRadius: '6px'
                }}
              >
                {searchResults.map((client, index) => renderClientItem(client, index))}
              </div>
            )}
          </Stack>
        )}

        {/* Footer */}
        <Stack horizontal horizontalAlign="end" tokens={{ childrenGap: 8 }}>
          <DefaultButton onClick={onDismiss}>Cancel</DefaultButton>
        </Stack>
      </Stack>
    </Modal>
  );
};

export default ClientLookupModal;