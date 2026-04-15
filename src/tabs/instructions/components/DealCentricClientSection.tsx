import React, { useState, useEffect } from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { DefaultButton, IconButton } from '@fluentui/react/lib/Button';
import { Spinner } from '@fluentui/react/lib/Spinner';
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { PersonaPresence } from '@fluentui/react/lib/Persona';
import { Separator } from '@fluentui/react/lib/Separator';
import { Persona, PersonaSize } from '@fluentui/react/lib/Persona';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';
import ClientLookupModal from './ClientLookupModal';

interface DealCentricClientSectionProps {
  instructionRef: string;
  selectedInstruction?: any;
  matterData?: any;
  relatedClientIds?: string;
  userInitials: string;
  onRelatedClientsUpdate?: (relatedClientIds: string) => void;
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

interface OriginalDeal {
  prospectId?: string;
  enquiryId?: string;
  areaOfWork?: string;
  typeOfWork?: string;
  value?: string;
  clientName?: string;
  clientEmail?: string;
  method?: string;
  source?: string;
  date?: string;
}

const DealCentricClientSection: React.FC<DealCentricClientSectionProps> = ({
  instructionRef,
  selectedInstruction,
  matterData,
  relatedClientIds,
  userInitials,
  onRelatedClientsUpdate
}) => {
  const { isDarkMode } = useTheme();
  const [mainClient, setMainClient] = useState<ClioClient | null>(null);
  const [relatedClients, setRelatedClients] = useState<ClioClient[]>([]);
  const [originalDeal, setOriginalDeal] = useState<OriginalDeal | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLookupModal, setShowLookupModal] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Enhanced styling functions
  const cardBackground = (dark: boolean): string => (
    dark
      ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.92) 0%, rgba(15, 23, 42, 0.96) 100%)'
      : '#FFFFFF'
  );

  const borderColour = (dark: boolean): string => (
    dark ? 'rgba(148, 163, 184, 0.32)' : '#e2e8f0'
  );

  const mutedText = (dark: boolean): string => (
    dark ? 'rgba(226, 232, 240, 0.72)' : colours.greyText
  );

  const elevatedShadow = (dark: boolean): string => (
    dark ? '0 8px 20px rgba(2, 6, 23, 0.45)' : '0 10px 24px rgba(15, 23, 42, 0.12)'
  );

  // Load original deal/enquiry information
  useEffect(() => {
    if (selectedInstruction?.ProspectId || selectedInstruction?.prospectId) {
      loadOriginalDeal();
    }
  }, [selectedInstruction]);

  // Load main client from matter data
  useEffect(() => {
    if (matterData?.clientId && matterData.clientId.trim() !== '') {
      loadMainClient(matterData.clientId);
    } else {
      setMainClient(null);
    }
  }, [matterData?.clientId, userInitials]);

  // Load related clients
  useEffect(() => {
    if (relatedClientIds && relatedClientIds.trim() !== '') {
      loadRelatedClients(relatedClientIds);
    } else {
      setRelatedClients([]);
    }
  }, [relatedClientIds, userInitials]);

  const loadOriginalDeal = async () => {
    try {
      const prospectId = selectedInstruction?.ProspectId || selectedInstruction?.prospectId;
      if (!prospectId) return;

      // Try to get enquiry data for this prospect
      const response = await fetch(`/api/enquiries-unified`);
      if (response.ok) {
        const data = await response.json();
        const matchingEnquiry = data.enquiries?.find((enq: any) => 
          String(enq.ID || enq.id || enq.acid) === String(prospectId)
        );

        if (matchingEnquiry) {
          setOriginalDeal({
            prospectId: String(prospectId),
            enquiryId: matchingEnquiry.ID || matchingEnquiry.id,
            areaOfWork: matchingEnquiry.Area_of_Work || matchingEnquiry.aow,
            typeOfWork: matchingEnquiry.Type_of_Work || matchingEnquiry.tow,
            value: matchingEnquiry.Value || matchingEnquiry.value,
            clientName: `${matchingEnquiry.First_Name || matchingEnquiry.first || ''} ${matchingEnquiry.Last_Name || matchingEnquiry.last || ''}`.trim(),
            clientEmail: matchingEnquiry.Email || matchingEnquiry.email,
            method: matchingEnquiry.Method_of_Contact || matchingEnquiry.moc,
            source: matchingEnquiry.Ultimate_Source || matchingEnquiry.source,
            date: matchingEnquiry.Touchpoint_Date || matchingEnquiry.datetime
          });
        } else {
          // Fallback to deal data from instruction if available
          const deal = selectedInstruction?.deal;
          if (deal) {
            setOriginalDeal({
              prospectId: String(prospectId),
              areaOfWork: deal.AreaOfWork || selectedInstruction.AreaOfWork,
              value: deal.Amount || deal.Value,
              clientName: deal.LeadClientName || selectedInstruction.ClientName,
              clientEmail: deal.LeadClientEmail || selectedInstruction.Email,
              date: deal.CreatedAt || selectedInstruction.CreatedAt
            });
          }
        }
      }
    } catch (error) {
      console.error('Error loading original deal:', error);
    }
  };

  const loadMainClient = async (clientId: string) => {
    try {
      const response = await fetch(`/api/clio-client-lookup/client/${clientId}?initials=${userInitials}`);
      if (response.ok) {
        const data = await response.json();
        setMainClient(data.client);
      } else {
        setMainClient(null);
      }
    } catch (error) {
      console.error('Error loading main client:', error);
      setMainClient(null);
    }
  };

  const loadRelatedClients = async (clientIds: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const ids = clientIds.split(',').map(id => id.trim()).filter(id => id !== '');
      const clientPromises = ids.map(async (clientId) => {
        try {
          const response = await fetch(`/api/clio-client-lookup/client/${clientId}?initials=${userInitials}`);
          if (response.ok) {
            const data = await response.json();
            return data.client;
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
    if (matterData?.clientId && client.id === matterData.clientId) {
      setError('This client is already the main client for this matter.');
      return;
    }

    if (relatedClients.some(existingClient => existingClient.id === client.id)) {
      setError('This client is already added as a related client.');
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/related-clients/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      
      if (onRelatedClientsUpdate) {
        onRelatedClientsUpdate(data.relatedClientId);
      }

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
        headers: { 'Content-Type': 'application/json' },
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
      
      if (onRelatedClientsUpdate) {
        onRelatedClientsUpdate(data.relatedClientId || '');
      }

      setRelatedClients(prev => prev.filter(client => client.id !== clientId));
    } catch (err) {
      console.error('Error removing related client:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove related client');
    } finally {
      setIsUpdating(false);
    }
  };

  const renderClientCard = (client: ClioClient, isMainClient: boolean = false) => {
    return (
      <div
        key={client.id}
        style={{
          padding: '16px',
          border: `2px solid ${isMainClient ? colours.blue : borderColour(isDarkMode)}`,
          borderRadius: '12px',
          backgroundColor: cardBackground(isDarkMode),
          position: 'relative',
          boxShadow: elevatedShadow(isDarkMode),
          transition: 'all 0.2s ease'
        }}
      >
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 12 }}>
          <Persona
            text={client.name}
            secondaryText={client.email}
            size={PersonaSize.size40}
            presence={PersonaPresence.none}
            initialsColor={isMainClient ? colours.blue : colours.highlight}
          />
          <Stack grow>
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
              <Text 
                variant="medium" 
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
                  color: '#ffffff',
                  backgroundColor: isMainClient ? colours.blue : colours.orange,
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}
              >
                {isMainClient ? 'Main Client' : 'Related'}
              </Text>
            </Stack>
            <Text 
              variant="small" 
              style={{ 
                color: mutedText(isDarkMode),
                marginTop: '4px'
              }}
            >
              {client.email}
            </Text>
            {client.phone && (
              <Text 
                variant="small" 
                style={{ 
                  color: mutedText(isDarkMode),
                  fontSize: '11px'
                }}
              >
                📞 {client.phone}
              </Text>
            )}
            <Text 
              variant="small" 
              style={{ 
                color: mutedText(isDarkMode),
                fontSize: '10px',
                textTransform: 'uppercase',
                fontWeight: 500,
                marginTop: '2px'
              }}
            >
              {client.type} • ID: {client.id}
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
                    color: mutedText(isDarkMode),
                    ':hover': {
                      color: colours.cta,
                      backgroundColor: isDarkMode ? '#334155' : '#f8f9fa'
                    }
                  }
                }}
              />
            </TooltipHost>
          )}
        </Stack>
      </div>
    );
  };

  const renderOriginalDealCard = () => {
    if (!originalDeal) return null;

    return (
      <div
        style={{
          padding: '20px',
          border: `3px solid ${colours.highlight}`,
          borderRadius: '16px',
          backgroundColor: cardBackground(isDarkMode),
          boxShadow: `${elevatedShadow(isDarkMode)}, 0 0 20px ${colours.highlight}30`,
          position: 'relative',
          marginBottom: '24px'
        }}
      >
        {/* Central deal header */}
        <Stack horizontal horizontalAlign="space-between" verticalAlign="center" style={{ marginBottom: '16px' }}>
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
            <FontIcon 
              iconName="Lightbulb" 
              style={{ 
                fontSize: '18px',
                color: colours.highlight
              }} 
            />
            <Text 
              variant="large" 
              style={{ 
                fontWeight: 700,
                color: isDarkMode ? '#e2e8f0' : '#374151'
              }}
            >
              Original Deal
            </Text>
            <Text 
              variant="small" 
              style={{ 
                color: '#ffffff',
                backgroundColor: colours.highlight,
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase'
              }}
            >
              #{originalDeal.prospectId}
            </Text>
          </Stack>
          
          {originalDeal.value && (
            <Text 
              variant="large" 
              style={{ 
                fontWeight: 700,
                color: colours.blue
              }}
            >
              {originalDeal.value}
            </Text>
          )}
        </Stack>

        {/* Deal details grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '16px',
          marginBottom: '16px'
        }}>
          <div>
            <Text variant="small" style={{ color: mutedText(isDarkMode), fontWeight: 600, marginBottom: '4px' }}>
              AREA OF WORK
            </Text>
            <Text variant="medium" style={{ color: isDarkMode ? '#e2e8f0' : '#374151' }}>
              {originalDeal.areaOfWork || 'General Legal Services'}
            </Text>
          </div>
          <div>
            <Text variant="small" style={{ color: mutedText(isDarkMode), fontWeight: 600, marginBottom: '4px' }}>
              TYPE OF WORK
            </Text>
            <Text variant="medium" style={{ color: isDarkMode ? '#e2e8f0' : '#374151' }}>
              {originalDeal.typeOfWork || 'Not specified'}
            </Text>
          </div>
          <div>
            <Text variant="small" style={{ color: mutedText(isDarkMode), fontWeight: 600, marginBottom: '4px' }}>
              ENQUIRY DATE
            </Text>
            <Text variant="medium" style={{ color: isDarkMode ? '#e2e8f0' : '#374151' }}>
              {originalDeal.date ? new Date(originalDeal.date).toLocaleDateString() : 'Not recorded'}
            </Text>
          </div>
          <div>
            <Text variant="small" style={{ color: mutedText(isDarkMode), fontWeight: 600, marginBottom: '4px' }}>
              SOURCE
            </Text>
            <Text variant="medium" style={{ color: isDarkMode ? '#e2e8f0' : '#374151' }}>
              {originalDeal.method || originalDeal.source || 'Direct'}
            </Text>
          </div>
        </div>

        {/* Original client info */}
        {originalDeal.clientName && (
          <div style={{
            padding: '12px',
            backgroundColor: isDarkMode ? 'rgba(51, 65, 85, 0.5)' : '#f8f9fa',
            borderRadius: '8px',
            border: `1px dashed ${borderColour(isDarkMode)}`
          }}>
            <Text variant="small" style={{ color: mutedText(isDarkMode), fontWeight: 600, marginBottom: '4px' }}>
              ORIGINAL ENQUIRY FROM
            </Text>
            <Stack horizontal tokens={{ childrenGap: 8 }}>
              <Text variant="medium" style={{ color: isDarkMode ? '#e2e8f0' : '#374151', fontWeight: 600 }}>
                {originalDeal.clientName}
              </Text>
              {originalDeal.clientEmail && (
                <Text variant="small" style={{ color: mutedText(isDarkMode) }}>
                  • {originalDeal.clientEmail}
                </Text>
              )}
            </Stack>
          </div>
        )}
      </div>
    );
  };

  const renderMatterSummary = () => {
    if (!matterData) return null;

    const matterStatus = () => {
      if (matterData.isLoading) return { label: 'Loading...', color: colours.greyText };
      if (matterData.matterId && matterData.matterId !== 'NO_MATTER') return { label: 'Active Matter', color: colours.blue };
      if (matterData.clientId) return { label: 'Ready to Create', color: colours.orange };
      return { label: 'Client Required', color: colours.greyText };
    };

    const status = matterStatus();

    return (
      <div
        style={{
          padding: '16px',
          border: `2px solid ${borderColour(isDarkMode)}`,
          borderRadius: '12px',
          backgroundColor: cardBackground(isDarkMode),
          boxShadow: elevatedShadow(isDarkMode),
          marginBottom: '16px'
        }}
      >
        <Stack horizontal horizontalAlign="space-between" verticalAlign="center" style={{ marginBottom: '12px' }}>
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
            <FontIcon 
              iconName="FabricFolder" 
              style={{ 
                fontSize: '16px',
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
              Matter Status
            </Text>
          </Stack>
          
          <Text 
            variant="small" 
            style={{ 
              color: '#ffffff',
              backgroundColor: status.color,
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase'
            }}
          >
            {status.label}
          </Text>
        </Stack>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <Text variant="small" style={{ color: mutedText(isDarkMode), fontWeight: 600, marginBottom: '2px' }}>
              MATTER ID
            </Text>
            <Text variant="small" style={{ color: isDarkMode ? '#e2e8f0' : '#374151' }}>
              {(matterData.matterId && matterData.matterId !== 'NO_MATTER') ? matterData.matterId : 'Not assigned'}
            </Text>
          </div>
          <div>
            <Text variant="small" style={{ color: mutedText(isDarkMode), fontWeight: 600, marginBottom: '2px' }}>
              RESPONSIBLE SOLICITOR
            </Text>
            <Text variant="small" style={{ color: isDarkMode ? '#e2e8f0' : '#374151' }}>
              {matterData.responsibleSolicitor || selectedInstruction?.ResponsibleSolicitor || 'Unassigned'}
            </Text>
          </div>
        </div>

        {matterData.matterId && matterData.matterId !== 'NO_MATTER' && (
          <Stack horizontal tokens={{ childrenGap: 8 }} style={{ marginTop: '12px' }}>
            <DefaultButton
              iconProps={{ iconName: 'Globe' }}
              text="View in Clio"
              onClick={() => {
                const clioUrl = `https://eu.app.clio.com/nc/#/matters/${matterData.matterId}`;
                window.open(clioUrl, '_blank');
              }}
              styles={{
                root: {
                  fontSize: '11px',
                  padding: '6px 12px',
                  backgroundColor: colours.blue,
                  color: '#ffffff',
                  border: 'none',
                  ':hover': {
                    backgroundColor: colours.highlight
                  }
                }
              }}
            />
          </Stack>
        )}
      </div>
    );
  };

  return (
    <Stack tokens={{ childrenGap: 16 }}>
      {/* Section Header */}
      <Stack horizontal horizontalAlign="space-between" verticalAlign="center">
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
          <FontIcon 
            iconName="Org" 
            style={{ 
              fontSize: '16px',
              color: isDarkMode ? '#e2e8f0' : '#374151'
            }} 
          />
          <Text 
            variant="large" 
            style={{ 
              fontWeight: 700,
              color: isDarkMode ? '#e2e8f0' : '#374151'
            }}
          >
            Deal & Client Overview
          </Text>
        </Stack>

        <DefaultButton
          iconProps={{ iconName: 'Add' }}
          text="Link Related Client"
          onClick={() => setShowLookupModal(true)}
          disabled={isUpdating}
          styles={{
            root: {
              fontSize: '12px',
              padding: '8px 16px',
              backgroundColor: colours.blue,
              color: '#ffffff',
              border: 'none',
              ':hover': {
                backgroundColor: colours.highlight
              }
            }
          }}
        />
      </Stack>

      {/* Error Message */}
      {error && (
        <MessageBar 
          messageBarType={MessageBarType.error} 
          onDismiss={() => setError(null)}
          styles={{ root: { fontSize: '12px' } }}
        >
          {error}
        </MessageBar>
      )}

      {/* Original Deal Card */}
      {renderOriginalDealCard()}

      {/* Matter Summary */}
      {renderMatterSummary()}

      {/* Main Client Section */}
      {mainClient && (
        <div>
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }} style={{ marginBottom: '12px' }}>
            <FontIcon 
              iconName="Contact" 
              style={{ 
                fontSize: '14px',
                color: colours.blue
              }} 
            />
            <Text 
              variant="medium" 
              style={{ 
                fontWeight: 600,
                color: isDarkMode ? '#e2e8f0' : '#374151'
              }}
            >
              Main Client
            </Text>
          </Stack>
          {renderClientCard(mainClient, true)}
        </div>
      )}

      {/* Related Clients Section */}
      {relatedClients.length > 0 && (
        <div>
          <Separator styles={{ root: { margin: '16px 0' } }} />
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }} style={{ marginBottom: '12px' }}>
            <FontIcon 
              iconName="People" 
              style={{ 
                fontSize: '14px',
                color: colours.orange
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
            <Text 
              variant="small" 
              style={{ 
                color: '#ffffff',
                backgroundColor: colours.orange,
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 600
              }}
            >
              {relatedClients.length}
            </Text>
          </Stack>
          
          <Stack tokens={{ childrenGap: 12 }}>
            {relatedClients.map(client => renderClientCard(client, false))}
          </Stack>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
          <Spinner size={1} />
          <Text 
            variant="small" 
            style={{ color: mutedText(isDarkMode) }}
          >
            Loading related clients...
          </Text>
        </Stack>
      )}

      {/* Empty State */}
      {!isLoading && !mainClient && relatedClients.length === 0 && (
        <div
          style={{
            padding: '32px',
            textAlign: 'center',
            backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#f8f9fa',
            borderRadius: '12px',
            border: `2px dashed ${borderColour(isDarkMode)}`
          }}
        >
          <FontIcon 
            iconName="ContactInfo" 
            style={{ 
              fontSize: '32px',
              color: mutedText(isDarkMode),
              marginBottom: '12px'
            }} 
          />
          <Text 
            variant="medium" 
            style={{ 
              fontWeight: 600,
              color: isDarkMode ? '#e2e8f0' : '#374151',
              marginBottom: '8px'
            }}
          >
            No Clients Linked
          </Text>
          <Text 
            variant="small" 
            style={{ 
              color: mutedText(isDarkMode),
              lineHeight: '1.4'
            }}
          >
            Use the Matter Opening workflow to link the main client,<br />
            or add related clients using the button above.
          </Text>
        </div>
      )}

      {/* Client Lookup Modal */}
      {showLookupModal && (
        <ClientLookupModal
          isOpen={showLookupModal}
          onDismiss={() => setShowLookupModal(false)}
          onClientSelected={handleAddClient}
          userInitials={userInitials}
        />
      )}
    </Stack>
  );
};

export default DealCentricClientSection;