import React, { useState, useEffect } from 'react';
import {
  Stack,
  Text,
  DefaultButton,
  Spinner,
  SpinnerSize,
  MessageBar,
  MessageBarType,
  FontIcon,
  Persona,
  PersonaSize,
  PersonaPresence,
  IconButton,
  TooltipHost
} from '@fluentui/react';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';
import ClientLookupModal from './ClientLookupModal';
import clioIcon from '../../../assets/clio.svg';

interface RelatedClientsSectionProps {
  instructionRef: string;
  relatedClientIds?: string; // Comma-separated Clio client IDs from database
  mainClientId?: string; // Main Clio client ID from matter (if exists)
  userInitials: string;
  originDeal?: OriginDeal | null;
  onRelatedClientsUpdate?: (relatedClientIds: string) => void;
}

interface OriginDeal {
  title?: string;
  reference?: string | number;
  stage?: string;
  service?: string;
  amount?: number | string;
  currency?: string;
  createdDate?: string;
  owner?: string;
  pitchedAt?: string;
}

interface CustomFieldValue {
  id: string;
  field_name: string;
  value: string;
}

interface ClioClient {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  type: 'Person' | 'Company';
  // Additional fields that might be available from Clio API
  primary_email_address?: string;
  primary_phone_number?: string;
  company?: string;
  title?: string;
  custom_fields?: Record<string, any>;
  custom_field_values?: CustomFieldValue[];
  created_at?: string;
  updated_at?: string;
}

const RelatedClientsSection: React.FC<RelatedClientsSectionProps> = ({
  instructionRef,
  relatedClientIds,
  mainClientId,
  userInitials,
  originDeal,
  onRelatedClientsUpdate
}) => {
  const { isDarkMode } = useTheme();
  const [relatedClients, setRelatedClients] = useState<ClioClient[]>([]);
  const [mainClient, setMainClient] = useState<ClioClient | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMainClient, setIsLoadingMainClient] = useState(false);
  const [isLoadingCustomFields, setIsLoadingCustomFields] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLookupModal, setShowLookupModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Debug: Track component lifecycle
  useEffect(() => {
    console.log('RelatedClientsSection mounted for instruction:', instructionRef);
    return () => {
      console.log('RelatedClientsSection unmounting for instruction:', instructionRef);
    };
  }, [instructionRef]);

  // Load related client details when relatedClientIds changes
  useEffect(() => {
    if (relatedClientIds && relatedClientIds.trim() !== '') {
      loadRelatedClients(relatedClientIds);
    } else {
      setRelatedClients([]);
    }
  }, [relatedClientIds, userInitials]);

  useEffect(() => {
    console.log('RelatedClientsSection - mainClientId changed:', mainClientId);
    if (mainClientId && mainClientId.trim() !== '') {
      loadMainClient(mainClientId);
    } else {
      console.log('RelatedClientsSection - no mainClientId, setting null');
      setMainClient(null);
    }
  }, [mainClientId, userInitials]);

  const fetchClientCustomFields = async (clientId: string): Promise<CustomFieldValue[]> => {
    try {
      console.log('Fetching custom fields for client:', clientId);
      const response = await fetch(`/api/clio-client-lookup/client/${clientId}/custom-fields?initials=${userInitials}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Custom fields loaded for client', clientId, ':', data.custom_field_values);
        return data.custom_field_values || [];
      } else {
        console.warn('Failed to load custom fields for client', clientId, '- response not ok:', response.status);
        return [];
      }
    } catch (error) {
      console.error('Error loading custom fields for client', clientId, ':', error);
      return [];
    }
  };

  const loadMainClient = async (clientId: string) => {
    try {
      console.log('Loading main client with ID:', clientId);
      setIsLoadingMainClient(true);
      setIsLoadingCustomFields(true);
      
      // Load basic client data
      const response = await fetch(`/api/clio-client-lookup/client/${clientId}?initials=${userInitials}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Main client loaded successfully:', data.client);
        
        // Set basic client data first
        setMainClient(data.client);
        
        // Load custom fields for this client
        const customFields = await fetchClientCustomFields(clientId);
        
        // Combine the data
        const clientWithCustomFields = {
          ...data.client,
          custom_field_values: customFields
        };
        
        setMainClient(clientWithCustomFields);
      } else {
        console.error('Failed to load main client - response not ok:', response.status);
        setMainClient(null);
      }
    } catch (error) {
      console.error('Error loading main client:', error);
      setMainClient(null);
    } finally {
      setIsLoadingMainClient(false);
      setIsLoadingCustomFields(false);
    }
  };

  const loadRelatedClients = async (clientIds: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const ids = clientIds.split(',').map(id => id.trim()).filter(id => id !== '');
      const clientPromises = ids.map(async (clientId) => {
        try {
          // Load basic client data
          const response = await fetch(`/api/clio-client-lookup/client/${clientId}?initials=${userInitials}`);
          if (response.ok) {
            const data = await response.json();
            
            // Load custom fields for this client
            const customFields = await fetchClientCustomFields(clientId);
            
            // Combine the data
            return {
              ...data.client,
              custom_field_values: customFields
            };
          }
          return null;
        } catch (err) {
          console.error(`Failed to load client ${clientId}:`, err);
          return null;
        }
      });

      const clients = await Promise.all(clientPromises);
      const validClients = clients.filter(client => client !== null) as ClioClient[];
      setRelatedClients(validClients);
    } catch (err) {
      console.error('Error loading related clients:', err);
      setError('Failed to load related client details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddClient = async (client: ClioClient) => {
    // Prevent adding the main client as a related client
    if (mainClientId && client.id === mainClientId) {
      setError('This client is already the main client for this matter.');
      return;
    }

    // Check if client is already in related clients
    if (relatedClients.some(existingClient => existingClient.id === client.id)) {
      setError('This client is already added as a related client.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/related-clients/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instructionRef,
          clientId: client.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add related client');
      }

      const data = await response.json();
      
      // Update the parent component with new related client IDs
      if (onRelatedClientsUpdate) {
        onRelatedClientsUpdate(data.relatedClientId);
      }

      // Add the new client to our local state immediately for better UX
      setRelatedClients(prev => [...prev, client]);
    } catch (err) {
      console.error('Error adding related client:', err);
      setError(err instanceof Error ? err.message : 'Failed to add related client');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveClient = async (clientId: string) => {
    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/related-clients/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instructionRef,
          clientId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove related client');
      }

      const data = await response.json();
      
      // Update the parent component with updated related client IDs
      if (onRelatedClientsUpdate) {
        onRelatedClientsUpdate(data.relatedClientId || '');
      }

      // Remove the client from our local state immediately for better UX
      setRelatedClients(prev => prev.filter(client => client.id !== clientId));
    } catch (err) {
      console.error('Error removing related client:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove related client');
    } finally {
      setIsUpdating(false);
    }
  };

  const renderClientCard = (client: ClioClient, isMainClient: boolean = false) => {
    // Determine the best email and phone to display
    const displayEmail = client.primary_email_address || client.email;
    const displayPhone = client.primary_phone_number || client.phone;
    
    // Extract relevant custom fields for display from the structured custom_field_values
    const customFieldsToShow = client.custom_field_values 
      ? client.custom_field_values
          .filter(field => field.value && String(field.value).trim() !== '')
      : [];

    return (
      <div
        key={client.id}
        style={{
          padding: '16px',
          border: `1px solid ${isDarkMode ? colours.dark.border : '#e1e5e9'}`,
          borderRadius: '8px',
          backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
          position: 'relative',
          boxShadow: isDarkMode ? '0 4px 12px rgba(2, 6, 23, 0.25)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
        }}
      >
        <Stack tokens={{ childrenGap: 12 }}>
          {/* Header row with avatar, name, and actions */}
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
            {/* Custom Clio icon avatar - clickable to open in Clio */}
            <div 
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: isDarkMode ? '#334155' : '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `2px solid ${isDarkMode ? colours.dark.border : '#e2e8f0'}`,
                flexShrink: 0,
                boxShadow: isDarkMode ? '0 2px 8px rgba(0, 0, 0, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.1)',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onClick={() => window.open(`https://eu.app.clio.com/nc/#/contacts/${client.id}`, '_blank')}
              title="Open in Clio"
            >
              <img 
                src={clioIcon} 
                alt="Clio Client" 
                style={{ 
                  width: 20, 
                  height: 20,
                  opacity: isDarkMode ? 0.9 : 1
                }} 
              />
            </div>
            
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
                    backgroundColor: isDarkMode ? colours.dark.background : '#f4f4f6',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.025em'
                  }}
                >
                  {client.type}
                </Text>
              </Stack>
              
              {/* Client ID */}
              <Text 
                variant="small" 
                style={{ 
                  color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : '#6b7280',
                  fontSize: '11px',
                  fontFamily: 'monospace'
                }}
              >
                ID: {client.id}
              </Text>
            </Stack>
            
            {!isMainClient && (
              <TooltipHost content="Remove related client">
                <IconButton
                  iconProps={{ iconName: 'Cancel' }}
                  onClick={() => handleRemoveClient(client.id)}
                  disabled={isUpdating}
                  styles={{
                    root: {
                      color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
                      ':hover': {
                        color: '#dc2626',
                        backgroundColor: isDarkMode ? '#334155' : '#f8f9fa'
                      }
                    }
                  }}
                />
              </TooltipHost>
            )}
          </Stack>

          {/* Contact Information Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            paddingTop: '8px',
            borderTop: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}`
          }}>
            {/* Email */}
            {displayEmail && (
              <div>
                <Text 
                  variant="xSmall" 
                  style={{ 
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#64748b',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    marginBottom: '4px',
                    display: 'block'
                  }}
                >
                  Email
                </Text>
                <Text 
                  variant="small" 
                  style={{ 
                    color: isDarkMode ? '#e2e8f0' : '#374151',
                    fontWeight: 500,
                    wordBreak: 'break-word'
                  }}
                >
                  {displayEmail}
                </Text>
              </div>
            )}
            
            {/* Phone */}
            {displayPhone && (
              <div>
                <Text 
                  variant="xSmall" 
                  style={{ 
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#64748b',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    marginBottom: '4px',
                    display: 'block'
                  }}
                >
                  Phone
                </Text>
                <Text 
                  variant="small" 
                  style={{ 
                    color: isDarkMode ? '#e2e8f0' : '#374151',
                    fontWeight: 500
                  }}
                >
                  {displayPhone}
                </Text>
              </div>
            )}
            
            {/* Company/Title (if available) */}
            {(client.company || client.title) && (
              <div>
                <Text 
                  variant="xSmall" 
                  style={{ 
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#64748b',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    marginBottom: '4px',
                    display: 'block'
                  }}
                >
                  {client.company ? 'Company' : 'Title'}
                </Text>
                <Text 
                  variant="small" 
                  style={{ 
                    color: isDarkMode ? '#e2e8f0' : '#374151',
                    fontWeight: 500
                  }}
                >
                  {client.company || client.title}
                </Text>
              </div>
            )}
            
            {/* Client Type details */}
            <div>
              <Text 
                variant="xSmall" 
                style={{ 
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#64748b',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  marginBottom: '4px',
                  display: 'block'
                }}
              >
                Type
              </Text>
              <Text 
                variant="small" 
                style={{ 
                  color: isDarkMode ? '#e2e8f0' : '#374151',
                  fontWeight: 500
                }}
              >
                {client.type} {client.firstName && client.lastName ? `(${client.firstName} ${client.lastName})` : ''}
              </Text>
            </div>
          </div>

          {/* Custom Fields (if any) */}
          {(customFieldsToShow.length > 0 || (isLoadingCustomFields && isMainClient)) && (
            <div style={{
              paddingTop: '8px',
              borderTop: `1px solid ${isDarkMode ? '#334155' : '#f1f5f9'}`
            }}>
              <Text 
                variant="xSmall" 
                style={{ 
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#64748b',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  marginBottom: '8px',
                  display: 'block'
                }}
              >
                Custom Fields
              </Text>
              
              {isLoadingCustomFields && isMainClient ? (
                <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                  <Spinner size={SpinnerSize.small} />
                  <Text 
                    variant="small" 
                    style={{ 
                      color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : '#64748b',
                      fontStyle: 'italic'
                    }}
                  >
                    Loading custom fields...
                  </Text>
                </Stack>
              ) : customFieldsToShow.length > 0 ? (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: customFieldsToShow.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(140px, 1fr))', 
                  gap: '8px' 
                }}>
                  {customFieldsToShow.map((field) => (
                    <div key={field.id}>
                      <Text 
                        variant="xSmall" 
                        style={{ 
                          color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : '#6b7280',
                          fontWeight: 500,
                          marginBottom: '2px',
                          display: 'block'
                        }}
                      >
                        {field.field_name}
                      </Text>
                      <Text 
                        variant="small" 
                        style={{ 
                          color: isDarkMode ? '#e2e8f0' : '#374151',
                          fontSize: '11px',
                          wordBreak: 'break-word'
                        }}
                      >
                        {field.value}
                      </Text>
                    </div>
                  ))}
                </div>
              ) : (
                <Text 
                  variant="small" 
                  style={{ 
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : '#64748b',
                    fontStyle: 'italic'
                  }}
                >
                  No custom fields available
                </Text>
              )}
            </div>
          )}
        </Stack>
      </div>
    );
  };

  const leadClientCard = () => {
    if (isLoadingMainClient) {
      return (
        <Stack
          horizontalAlign="center"
          verticalAlign="center"
          styles={{
            root: {
              padding: '40px 20px',
              backgroundColor: isDarkMode ? colours.dark.background : '#f8f9fa',
              borderRadius: '8px',
              border: `1px solid ${isDarkMode ? colours.dark.border : '#e1e5e9'}`,
              textAlign: 'center'
            }
          }}
        >
          <div style={{ 
            width: 32, 
            height: 32, 
            border: `3px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
            borderTop: `3px solid ${colours.blue}`,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '12px'
          }} />
          <Text
            variant="small"
            style={{
              color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
              fontWeight: 500
            }}
          >
            Loading client from Clio...
          </Text>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </Stack>
      );
    }

    if (!mainClient) {
      return (
        <Stack
          horizontalAlign="center"
          verticalAlign="center"
          styles={{
            root: {
              padding: '20px',
              backgroundColor: isDarkMode ? colours.dark.background : '#f8f9fa',
              borderRadius: '6px',
              border: `1px dashed ${isDarkMode ? colours.dark.border : '#d0d0d7'}`,
              textAlign: 'center'
            }
          }}
        >
          <FontIcon
            iconName="ContactInfo"
            style={{
              fontSize: '22px',
              color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
              marginBottom: '8px'
            }}
          />
          <Text
            variant="small"
            style={{
              color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
              fontWeight: 600
            }}
          >
            Lead client not linked
          </Text>
          <Text
            variant="small"
            style={{
              marginTop: '4px',
              color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText
            }}
          >
            Run the Matter Opening workflow to associate the primary client.
          </Text>
        </Stack>
      );
    }

    return (
      <div
        style={{
          padding: '16px',
          border: `1px solid ${isDarkMode ? colours.dark.border : '#e1e5e9'}`,
          borderRadius: '8px',
          backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
          boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)'
        }}
      >
        <Stack tokens={{ childrenGap: 12 }}>
          <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
              <FontIcon
                iconName="Contact"
                style={{ fontSize: '14px', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}
              />
              <Text
                variant="medium"
                style={{
                  fontWeight: 600,
                  color: isDarkMode ? '#e2e8f0' : '#0f172a'
                }}
              >
                Lead Client
              </Text>
            </Stack>
            <Text
              variant="small"
              style={{
                color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
                fontSize: '11px'
              }}
            >
              Linked via Matter Opening
            </Text>
          </Stack>

          {renderClientCard(mainClient, true)}
        </Stack>
      </div>
    );
  };

  const connectorLine = (length: number = 32) => (
    <div
      style={{
        height: length,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <div
        style={{
          width: '2px',
          height: length - 8,
          backgroundColor: isDarkMode ? '#334155' : '#d2d6dc',
          borderRadius: '999px'
        }}
      />
    </div>
  );

  const originDealCard = () => {
    if (!originDeal) return null;

    const amountValue = originDeal.amount
      ? typeof originDeal.amount === 'number'
        ? new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: originDeal.currency || 'GBP',
            maximumFractionDigits: 0
          }).format(originDeal.amount)
        : originDeal.amount
      : 'TBC';

    const createdOn = originDeal.createdDate
      ? new Date(originDeal.createdDate).toLocaleDateString()
      : 'Pending';

    return (
      <div
        style={{
          padding: '16px',
          border: `1px solid ${isDarkMode ? colours.dark.border : '#e1e5e9'}`,
          borderRadius: '8px',
          backgroundColor: isDarkMode ? '#111827' : '#f8fafc',
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)'
        }}
      >
        <Stack tokens={{ childrenGap: 12 }}>
          <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
              <FontIcon
                iconName="FlowChart"
                style={{ fontSize: '14px', color: isDarkMode ? '#f8fafc' : '#1e293b' }}
              />
              <Text
                variant="medium"
                style={{
                  fontWeight: 600,
                  color: isDarkMode ? '#f8fafc' : '#1e293b'
                }}
              >
                Originating Deal
              </Text>
            </Stack>
            <Stack horizontalAlign="end" tokens={{ childrenGap: 2 }}>
              {originDeal.stage && (
                <Text
                  variant="small"
                  style={{
                    color: originDeal.stage.toLowerCase() === 'closed' || originDeal.stage.toLowerCase() === 'won'
                      ? colours.green
                      : isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontSize: '10px',
                    fontWeight: 600
                  }}
                >
                  {originDeal.stage}
                </Text>
              )}
              {originDeal.stage?.toUpperCase() === 'PITCHED' && originDeal.pitchedAt && (
                <Text
                  variant="small"
                  style={{
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : '#6b7280',
                    fontSize: '9px',
                    fontWeight: 400
                  }}
                >
                  {new Date(originDeal.pitchedAt).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  })}
                </Text>
              )}
            </Stack>
          </Stack>

          {originDeal.service && (
            <Text
              variant="small"
              style={{ 
                color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
                lineHeight: 1.4
              }}
            >
              {originDeal.service}
            </Text>
          )}

          <Stack horizontal tokens={{ childrenGap: 16 }}>
            <Stack>
              <Text
                variant="xSmall"
                style={{
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#475569'
                }}
              >
                Deal Value
              </Text>
              <Stack tokens={{ childrenGap: 2 }}>
                <Text
                  variant="medium"
                  style={{
                    fontWeight: 600,
                    color: isDarkMode ? '#f8fafc' : '#0f172a'
                  }}
                >
                  {amountValue}
                </Text>
                <Text
                  variant="xSmall"
                  style={{
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : '#6b7280',
                    fontSize: '9px',
                    fontStyle: 'italic'
                  }}
                >
                  exc. VAT
                </Text>
                {originDeal.amount && typeof originDeal.amount === 'number' && (
                  <Text
                    variant="xSmall"
                    style={{
                      color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#475569',
                      fontSize: '9px',
                      fontWeight: 600
                    }}
                  >
                    {new Intl.NumberFormat('en-GB', {
                      style: 'currency',
                      currency: originDeal.currency || 'GBP',
                      maximumFractionDigits: 0
                    }).format(originDeal.amount * 1.2)} inc. VAT
                  </Text>
                )}
              </Stack>
            </Stack>

            <Stack>
              <Text
                variant="xSmall"
                style={{
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#475569'
                }}
              >
                Created
              </Text>
              <Text
                variant="medium"
                style={{
                  fontWeight: 500,
                  color: isDarkMode ? '#e2e8f0' : '#1e293b'
                }}
              >
                {createdOn}
              </Text>
            </Stack>

            {originDeal.owner && (
              <Stack>
                <Text
                  variant="xSmall"
                  style={{
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#475569'
                  }}
                >
                  Owner
                </Text>
                <Text
                  variant="medium"
                  style={{
                    fontWeight: 500,
                    color: isDarkMode ? '#e2e8f0' : '#1e293b'
                  }}
                >
                  {originDeal.owner}
                </Text>
              </Stack>
            )}
          </Stack>

          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 6 }}>
            <FontIcon
              iconName="Link"
              style={{ fontSize: '12px', color: isDarkMode ? '#38bdf8' : colours.blue }}
            />
            <Text
              variant="small"
              style={{
                color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
                fontFamily: 'monospace'
              }}
            >
              {originDeal.reference ? `Prospect ${originDeal.reference}` : 'No linked prospect'}
            </Text>
          </Stack>
        </Stack>
      </div>
    );
  };

  const relatedClientsSection = () => (
    <Stack tokens={{ childrenGap: 12 }}>
      <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
          <FontIcon
            iconName="People"
            style={{
              fontSize: '14px',
              color: isDarkMode ? '#e2e8f0' : '#374151'
            }}
          />
          <Text
            variant="medium"
            style={{
              fontWeight: 600,
              color: isDarkMode ? '#e2e8f0' : '#374151'
            }}
          >
            Related Clients
          </Text>
          {relatedClients.length > 0 && (
            <Text
              variant="small"
              style={{
                color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
                backgroundColor: isDarkMode ? colours.dark.background : '#f4f4f6',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 500
              }}
            >
              {relatedClients.length}
            </Text>
          )}
        </Stack>

        <DefaultButton
          iconProps={{ iconName: 'Add' }}
          text="Link Client"
          onClick={() => setShowLookupModal(true)}
          disabled={isUpdating}
          styles={{
            root: {
              fontSize: '12px',
              padding: '6px 12px',
              minWidth: 'auto'
            }
          }}
        />
      </Stack>

      {error && (
        <MessageBar
          messageBarType={MessageBarType.error}
          onDismiss={() => setError(null)}
          styles={{ root: { fontSize: '12px' } }}
        >
          {error}
        </MessageBar>
      )}

      {isLoading && (
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
          <Spinner size={1} />
          <Text
            variant="small"
            style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText }}
          >
            Loading related clients...
          </Text>
        </Stack>
      )}

      {!isLoading && relatedClients.length > 0 && (
        <Stack tokens={{ childrenGap: 8 }}>
          {relatedClients.map(client => renderClientCard(client, false))}
        </Stack>
      )}

      {!isLoading && relatedClients.length === 0 && (
        <Stack
          horizontalAlign="center"
          verticalAlign="center"
          styles={{
            root: {
              padding: '24px',
              backgroundColor: isDarkMode ? colours.dark.background : '#f8f9fa',
              borderRadius: '6px',
              border: `1px dashed ${isDarkMode ? colours.dark.border : '#d0d0d7'}`
            }
          }}
        >
          <FontIcon
            iconName="PeopleAdd"
            style={{
              fontSize: '20px',
              color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
              marginBottom: '8px'
            }}
          />
          <Text
            variant="small"
            style={{
              color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
              textAlign: 'center'
            }}
          >
            No related clients linked yet
          </Text>
          <Text
            variant="small"
            style={{
              color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText,
              textAlign: 'center',
              marginTop: '4px'
            }}
          >
            Use “Link Client” to connect additional contacts involved in this matter.
          </Text>
        </Stack>
      )}

      {isUpdating && (
        <Stack
          horizontal
          horizontalAlign="center"
          verticalAlign="center"
          tokens={{ childrenGap: 8 }}
          styles={{
            root: {
              padding: '8px',
              backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
              borderRadius: '4px',
              border: `1px solid ${isDarkMode ? colours.dark.border : '#e1e5e9'}`
            }
          }}
        >
          <Spinner size={1} />
          <Text
            variant="small"
            style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText }}
          >
            Updating related clients...
          </Text>
        </Stack>
      )}
    </Stack>
  );

  return (
    <Stack tokens={{ childrenGap: 12 }}>
      {leadClientCard()}
      {originDeal && connectorLine()}
      {originDealCard()}
      {originDeal && connectorLine()}
      {relatedClientsSection()}

      <ClientLookupModal
        isOpen={showLookupModal}
        onDismiss={() => setShowLookupModal(false)}
        onClientSelected={handleAddClient}
        userInitials={userInitials}
      />
    </Stack>
  );
};

export default RelatedClientsSection;
