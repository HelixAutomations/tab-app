import React, { useState, useEffect, useMemo, useRef } from 'react';
import { mergeStyles } from '@fluentui/merge-styles';
import { FontIcon } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import clioIcon from '../../assets/clio.svg';
import RelatedClientsSection from './components/RelatedClientsSection';

interface MatterOperationsProps {
  selectedInstruction: any;
  selectedOverviewItem: any;
  isDarkMode: boolean;
  onStatusUpdate?: () => void;
}

interface MatterData {
  matterId?: string;
  status: string;
  openDate?: string;
  displayNumber?: string;
  clientLinked: boolean;
  clientId?: string;
  description?: string;
  practiceArea?: string;
  responsibleSolicitor?: string;
  isLoading: boolean;
}

interface ClientData {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  type?: string;
  matters?: any[];
  isLoading: boolean;
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
}

type MatterLike = Record<string, unknown>;

const parseDateValue = (value: unknown): number | null => {
  if (!value) return null;
  const asString = typeof value === 'string' ? value : String(value);
  const parsed = new Date(asString);
  const timestamp = parsed.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const getMatterOpenedAt = (matter: MatterLike): number | null => {
  const candidates = [
    matter.open_date,
    matter.OpenDate,
    matter.openDate,
    matter['Open Date'],
    matter.opened_at,
    matter.OpenedAt,
  ];

  for (const candidate of candidates) {
    const timestamp = parseDateValue(candidate);
    if (timestamp !== null) {
      return timestamp;
    }
  }

  return null;
};

const getMatterDisplayNumber = (matter: MatterLike): string => {
  const candidate = matter.display_number ?? matter.DisplayNumber ?? matter.displayNumber ?? '';
  if (candidate === undefined || candidate === null) return '';
  return typeof candidate === 'string' ? candidate : String(candidate);
};

const getMatterIdString = (matter: MatterLike): string => {
  const candidate = matter.id ?? matter.MatterID ?? matter.matter_id ?? matter.MatterId;
  if (candidate === undefined || candidate === null) return '';
  return typeof candidate === 'string' ? candidate : String(candidate);
};

const getMatterNumericId = (matter: MatterLike): number => {
  const candidate = matter.id ?? matter.MatterID ?? matter.matter_id ?? matter.MatterId;
  if (candidate === undefined || candidate === null) return 0;
  const numeric = typeof candidate === 'number' ? candidate : Number(String(candidate));
  return Number.isNaN(numeric) ? 0 : numeric;
};

const compareMatters = (a: MatterLike, b: MatterLike): number => {
  const openedA = getMatterOpenedAt(a);
  const openedB = getMatterOpenedAt(b);

  if (openedA !== null || openedB !== null) {
    if (openedA === null) return 1;
    if (openedB === null) return -1;
    if (openedA !== openedB) return openedB - openedA;
  }

  const displayA = getMatterDisplayNumber(a);
  const displayB = getMatterDisplayNumber(b);
  if (displayA && displayB) {
    const comparison = displayA.localeCompare(displayB, undefined, { numeric: true, sensitivity: 'base' });
    if (comparison !== 0) {
      return comparison;
    }
  }

  const idA = getMatterNumericId(a);
  const idB = getMatterNumericId(b);
  if (idA !== idB) {
    return idB - idA;
  }

  return 0;
};

const dedupeClientMatters = (matters: MatterLike[]): MatterLike[] => {
  const deduped = new Map<string, MatterLike>();

  matters.forEach((matter, index) => {
    const keySource = getMatterIdString(matter) || getMatterDisplayNumber(matter) || `index-${index}`;

    const existing = deduped.get(keySource);
    if (!existing) {
      deduped.set(keySource, matter);
      return;
    }

    const existingDisplay = getMatterDisplayNumber(existing);
    const candidateDisplay = getMatterDisplayNumber(matter);
    if (!existingDisplay && candidateDisplay) {
      deduped.set(keySource, matter);
    }
  });

  return Array.from(deduped.values()).sort(compareMatters);
};

const panelBackground = (dark: boolean): string => (
  dark
    ? 'linear-gradient(135deg, rgba(17, 24, 39, 0.94) 0%, rgba(15, 23, 42, 0.98) 100%)'
    : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)'
);

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

const MatterOperations: React.FC<MatterOperationsProps> = ({
  selectedInstruction,
  selectedOverviewItem,
  isDarkMode,
  onStatusUpdate
}) => {
  const [matterData, setMatterData] = useState<MatterData>({
    status: 'Not Created',
    clientLinked: false,
    isLoading: false
  });
  const [clientData, setClientData] = useState<ClientData>({
    isLoading: false,
    matters: []
  });
  const [relatedClientIds, setRelatedClientIds] = useState<string>('');
  const fetchedDisplayNumbers = useRef<Set<string>>(new Set());
  const displayNumberLabel = useMemo(() => {
    const display = (matterData.displayNumber || '').trim();
    if (display && display !== matterData.matterId) {
      return display;
    }
    if (display) {
      return display;
    }
    if (matterData.matterId && matterData.matterId !== 'NO_MATTER') {
      return `Matter ${matterData.matterId}`;
    }
    return 'Display number pending';
  }, [matterData.displayNumber, matterData.matterId]);

  const ensureDisplayNumber = async (matterId: string | undefined, currentDisplay?: string) => {
    if (!matterId || matterId === 'NO_MATTER') return;

    const trimmedDisplay = (currentDisplay || '').trim();
    const looksLikeNumeric = trimmedDisplay && /^\d+$/.test(trimmedDisplay);
    if (trimmedDisplay && !looksLikeNumeric && trimmedDisplay !== matterId) {
      return;
    }

    if (fetchedDisplayNumbers.current.has(matterId)) {
      return;
    }

    fetchedDisplayNumbers.current.add(matterId);

    try {
      const resp = await fetch(`/api/matters/${matterId}`);
      if (!resp.ok) {
        fetchedDisplayNumbers.current.delete(matterId);
        throw new Error(await resp.text());
      }
      const payload = await resp.json();
      const refreshedDisplay = payload?.displayNumber || payload?.display_number;
      if (refreshedDisplay) {
        setMatterData(prev => (
          prev.matterId === matterId
            ? { ...prev, displayNumber: refreshedDisplay }
            : prev
        ));
      }
    } catch (err) {
      fetchedDisplayNumbers.current.delete(matterId);
      console.warn('Failed to refresh Clio display number', matterId, err);
    }
  };
  // Matter opening is handled by a dedicated workflow; creation UI removed here

  const originDeal: OriginDeal | null = useMemo(() => {
    const dealSource = (selectedInstruction?.deal as any)
      || (selectedOverviewItem?.deal as any)
      || (selectedOverviewItem?.instruction?.deal as any)
      || null;

    if (!dealSource) {
      return null;
    }

    const rawAmount = dealSource.Amount ?? dealSource.amount ?? dealSource.Estimate ?? dealSource.QuoteAmount;
    const amount = typeof rawAmount === 'number'
      ? rawAmount
      : rawAmount && !Number.isNaN(Number(rawAmount))
        ? Number(rawAmount)
        : undefined;

    return {
      title: dealSource.ServiceDescription || dealSource.Service || dealSource.Title || dealSource.Name || selectedInstruction?.MatterDescription,
      reference: dealSource.ProspectId || dealSource.prospectId || dealSource.DealId || dealSource.Id || dealSource.dealId,
      stage: dealSource.Stage || dealSource.StageName || dealSource.Status,
      service: dealSource.ServiceDescription || dealSource.Service || selectedInstruction?.AreaOfWork,
      amount: amount ?? rawAmount,
      currency: dealSource.Currency || dealSource.currency || 'GBP',
      createdDate: dealSource.CreatedDate || dealSource.CreatedOn || dealSource.CreatedTime || dealSource.Created?.Date,
      owner: dealSource.Owner || dealSource.OwnerName || dealSource.ResponsibleSolicitor || dealSource.Solicitor || selectedInstruction?.ResponsibleSolicitor
    };
  }, [selectedInstruction, selectedOverviewItem]);

  // Load matter data when instruction changes
  useEffect(() => {
    if (selectedInstruction?.InstructionRef) {
      loadMatterData();
      
      if (selectedInstruction.ClientId) {
        loadClientData();
      } else {
        setClientData({ isLoading: false, matters: [] });
      }
    }
  }, [selectedInstruction?.InstructionRef]);

  const loadMatterData = async () => {
    if (!selectedInstruction?.InstructionRef) return;
    
    setMatterData(prev => ({ ...prev, isLoading: true }));
    
    try {
      const response = await fetch(`/api/matter-operations/matter/${selectedInstruction.InstructionRef}`);
      if (response.ok) {
        const { matter } = await response.json();
        setMatterData({
          matterId: matter.MatterID,
          status: matter.Status || 'Open',
          openDate: matter.OpenDate,
          displayNumber: matter.DisplayNumber,
          clientLinked: !!matter.ClientID,
          clientId: matter.ClientID,
          description: matter.Description,
          practiceArea: matter.PracticeArea,
          responsibleSolicitor: matter.ResponsibleSolicitor,
          isLoading: false
        });
        if (matter?.MatterID && matter?.MatterID !== 'NO_MATTER') {
          ensureDisplayNumber(matter.MatterID, matter.DisplayNumber);
        }
        // Load related client IDs from instruction data
        setRelatedClientIds(selectedInstruction.RelatedClientId || '');
      } else if (response.status === 404) {
        // Matter doesn't exist yet
        setMatterData({
          status: 'Not Created',
          clientLinked: !!selectedInstruction.ClientId,
          clientId: selectedInstruction.ClientId,
          isLoading: false
        });
        // Load related client IDs from instruction data
        setRelatedClientIds(selectedInstruction.RelatedClientId || '');
      } else {
        throw new Error('Failed to load matter data');
      }
    } catch (error) {
      console.error('Error loading matter data:', error);
      // Set fallback data when API fails
      setMatterData({
        status: 'API Unavailable',
        clientLinked: !!selectedInstruction.ClientId,
        clientId: selectedInstruction.ClientId,
        isLoading: false
      });
      // Load related client IDs from instruction data
      setRelatedClientIds(selectedInstruction.RelatedClientId || '');
    }
  };

  const loadClientData = async () => {
    if (!selectedInstruction?.ClientId) return;
    
    setClientData(prev => ({ ...prev, isLoading: true }));
    
    try {
      // Get initials from responsible solicitor or default to 'LZ'
      const initials = selectedInstruction.ResponsibleSolicitor?.split(' ')
        .map((name: string) => name[0])
        .join('') || 'LZ';
      
      const response = await fetch(`/api/clio-client-query/${selectedInstruction.ClientId}/${initials}`);
      if (response.ok) {
        const data = await response.json();
        const matters = Array.isArray(data.matters)
          ? dedupeClientMatters(data.matters as MatterLike[])
          : [];
        setClientData({
          id: data.client?.id?.toString(),
          name: data.client?.name,
          email: data.client?.primary_email_address,
          phone: data.client?.primary_phone_number,
          type: data.client?.type,
          matters,
          isLoading: false
        });
      } else {
        throw new Error('Failed to load client data');
      }
    } catch (error) {
      console.error('Error loading client data:', error);
      setClientData({ isLoading: false, matters: [] });
    }
  };

  const handleRelatedClientsUpdate = (newClientIds: string) => {
    setRelatedClientIds(newClientIds);
  };

  // Matter status logic
  const matterStatus = useMemo(() => {
    const neutral = isDarkMode ? colours.dark.text : '#374151';
    if (matterData.isLoading) return { label: 'Loading...', color: colours.greyText };
    if (matterData.matterId && matterData.matterId !== 'NO_MATTER') return { label: 'Active Matter', color: neutral };
    if (selectedInstruction?.ClientId) return { label: 'Ready to Create', color: neutral };
    return { label: 'Client Required', color: neutral };
  }, [matterData, selectedInstruction, isDarkMode]);

  // Creation and client-linking are handled elsewhere

  const handleOpenMatterDashboard = () => {
    if (matterData.matterId && matterData.matterId !== 'NO_MATTER') {
      const clioUrl = `https://eu.app.clio.com/nc/#/matters/${matterData.matterId}`;
      window.open(clioUrl, '_blank');
    }
  };

  const buttonStyle = (variant: 'primary' | 'secondary' | 'danger' = 'primary') => {
    // More subtle, workbench-integrated styling
    const getColors = () => {
      if (variant === 'primary') {
        return {
          bg: isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.08)',
          hover: isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.12)',
          text: isDarkMode ? '#87ceeb' : colours.blue,
          border: isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'
        };
      } else {
        return {
          bg: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(107, 114, 128, 0.06)',
          hover: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(107, 114, 128, 0.1)',
          text: isDarkMode ? 'rgba(226, 232, 240, 0.85)' : '#4b5563',
          border: isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(107, 114, 128, 0.15)'
        };
      }
    };
    
    const colors = getColors();
    
    return mergeStyles({
      padding: '8px 12px',
      borderRadius: 6,
      border: `1px solid ${colors.border}`,
      background: colors.bg,
      color: colors.text,
      cursor: 'pointer',
      fontSize: 11,
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      textTransform: 'none',
      letterSpacing: '0.01em',
      transition: 'all 0.15s ease',
      backdropFilter: isDarkMode ? 'blur(8px)' : 'none',
      ':hover': {
        background: colors.hover,
        borderColor: isDarkMode ? 'rgba(54, 144, 206, 0.4)' : 'rgba(54, 144, 206, 0.25)',
        transform: 'translateY(-0.5px)',
        boxShadow: isDarkMode 
          ? '0 4px 12px rgba(0, 0, 0, 0.3)' 
          : '0 2px 8px rgba(15, 23, 42, 0.08)'
      },
      ':active': {
        transform: 'translateY(0px)',
      },
      ':disabled': {
        opacity: 0.5,
        cursor: 'not-allowed',
        transform: 'none',
      }
    });
  };

  const cardStyle = mergeStyles({
    background: cardBackground(isDarkMode),
    borderRadius: '12px',
    padding: '16px',
    border: `1px solid ${borderColour(isDarkMode)}`,
    marginBottom: '12px',
    boxShadow: elevatedShadow(isDarkMode)
  });

  const headerStyle = mergeStyles({
    fontSize: '11px',
    fontWeight: 600,
    color: isDarkMode ? colours.dark.text : '#1f2937',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
    borderBottom: `1px solid ${borderColour(isDarkMode)}`,
    paddingBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  });

  const statusIndicator = (status: boolean, size: number = 6) => (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: status ? (isDarkMode ? colours.dark.text : '#6b7280') : colours.greyText,
      display: 'inline-block'
    }} />
  );

  const clientMatters = clientData.matters ?? [];

  if (!selectedInstruction) {
    return (
      <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: mutedText(isDarkMode),
          fontSize: '12px',
          background: panelBackground(isDarkMode),
          borderRadius: '12px',
          border: `1px dashed ${borderColour(isDarkMode)}`
      }}>
        Select an instruction to manage matter operations
      </div>
    );
  }

  return (
    <div>
      {/* Client and Matter Details - Side by Side */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', 
        gap: '16px',
        marginBottom: '16px'
      }}>
        
        {/* Client Information Card - Now handled by Related Clients Section below */}
        {/* <div className={cardStyle}>
          <div className={headerStyle}>
            <span>Client Information</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {statusIndicator(!!clientData.id)}
              <span style={{ 
                color: isDarkMode ? colours.dark.text : '#374151', 
                fontSize: 10, 
                fontWeight: 600,
                textTransform: 'uppercase'
              }}>
                {clientData.id ? 'Linked' : 'Not Linked'}
              </span>
            </div>
          </div>
          
          {clientData.isLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: colours.greyText }}>
              <div style={{ 
                width: 16, 
                height: 16, 
                border: `2px solid ${colours.greyText}30`,
                borderTop: `2px solid ${colours.greyText}`,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                display: 'inline-block'
              }} />
              <div style={{ marginTop: 8, fontSize: 11 }}>Loading client data...</div>
            </div>
          ) : clientData.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: 9, color: mutedText(isDarkMode), marginBottom: 2 }}>CLIENT NAME</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: isDarkMode ? colours.dark.text : '#111827' }}>
                    {clientData.name || 'Unknown'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: mutedText(isDarkMode), marginBottom: 2 }}>CLIENT TYPE</div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: isDarkMode ? colours.dark.text : '#111827' }}>
                    {clientData.type || 'Individual'}
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: 9, color: mutedText(isDarkMode), marginBottom: 2 }}>EMAIL</div>
                  <div style={{ fontSize: 10, fontWeight: 400, color: isDarkMode ? colours.dark.text : '#111827' }}>
                    {clientData.email || 'Not provided'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: mutedText(isDarkMode), marginBottom: 2 }}>PHONE</div>
                  <div style={{ fontSize: 10, fontWeight: 400, color: isDarkMode ? colours.dark.text : '#111827' }}>
                    {clientData.phone || 'Not provided'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: 9, color: mutedText(isDarkMode), marginBottom: 2 }}>CLIO CLIENT ID</div>
                  <div style={{ fontSize: 10, fontWeight: 400, color: isDarkMode ? colours.dark.text : '#111827' }}>
                    {clientData.id}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: mutedText(isDarkMode), marginBottom: 2 }}>EXISTING MATTERS</div>
                  <div style={{ fontSize: 10, fontWeight: 400, color: isDarkMode ? colours.dark.text : '#111827' }}>
                    {clientData.matters?.length || 0} matters
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              padding: '16px',
              textAlign: 'center',
              color: mutedText(isDarkMode),
              fontSize: '11px',
              background: panelBackground(isDarkMode),
              borderRadius: '8px',
              border: `1px dashed ${borderColour(isDarkMode)}`
            }}>
              <div style={{ marginBottom: '8px', fontSize: '12px', fontWeight: 600 }}>
                No Client Linked
              </div>
              <div style={{ fontSize: '10px', lineHeight: '1.4' }}>
                Use the Matter Opening workflow to link a client
              </div>
            </div>
          )}
        </div> */}

        {/* Related Clients Section */}
        <RelatedClientsSection
          key={`related-clients-${selectedInstruction?.InstructionRef}`}
          instructionRef={selectedInstruction?.InstructionRef}
          relatedClientIds={relatedClientIds}
          mainClientId={matterData.clientId}
          originDeal={originDeal}
          onRelatedClientsUpdate={handleRelatedClientsUpdate}
          userInitials={selectedInstruction?.ResponsibleSolicitor?.split(' ')
            .map((name: string) => name[0])
            .join('') || 'LZ'}
        />
        
        {/* Matter Overview Card */}
        <div className={cardStyle}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FontIcon
                iconName="FabricFolder"
                style={{ fontSize: '14px', color: isDarkMode ? '#e2e8f0' : '#0f172a' }}
              />
              <span style={{
                fontSize: '14px',
                fontWeight: 600,
                color: isDarkMode ? '#e2e8f0' : '#0f172a'
              }}>
                Active Matter
              </span>
            </div>
            <span style={{ 
              color: matterStatus.color, 
              fontSize: 11, 
              fontWeight: 500
            }}>
              {matterStatus.label}
            </span>
          </div>

          {matterData.isLoading ? (
            <div style={{ 
              padding: '40px 20px', 
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12
            }}>
              <div style={{ 
                width: 32, 
                height: 32, 
                border: `3px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)'}`,
                borderTop: `3px solid ${colours.blue}`,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <div style={{ 
                fontSize: 12, 
                color: mutedText(isDarkMode),
                fontWeight: 500
              }}>
                Loading matter from Clio...
              </div>
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              borderRadius: '10px',
              background: isDarkMode ? 'rgba(30, 41, 59, 0.55)' : '#f8fafc',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : '#e2e8f0'}`
            }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: isDarkMode ? '#334155' : '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `2px solid ${isDarkMode ? colours.dark.border : '#e2e8f0'}`,
                boxShadow: isDarkMode ? '0 2px 8px rgba(0, 0, 0, 0.35)' : '0 2px 6px rgba(15, 23, 42, 0.08)'
              }}>
                <img
                  src={clioIcon}
                  alt="Clio Matter"
                  style={{ width: 20, height: 20, opacity: isDarkMode ? 0.9 : 1 }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: isDarkMode ? '#e2e8f0' : '#0f172a'
                }}>
                  {displayNumberLabel}
                </span>
                <span style={{
                  fontSize: '11px',
                  color: isDarkMode ? 'rgba(226, 232, 240, 0.72)' : colours.greyText
                }}>
                  {matterData.status ? `Status: ${matterData.status}` : 'Status unavailable'}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ fontSize: 9, color: mutedText(isDarkMode), marginBottom: 2 }}>CLIO MATTER ID</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: isDarkMode ? colours.dark.text : '#111827' }}>
                  {(matterData.matterId && matterData.matterId !== 'NO_MATTER') ? matterData.matterId : 'Not assigned'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: mutedText(isDarkMode), marginBottom: 2 }}>OPEN DATE</div>
                <div style={{ fontSize: 10, fontWeight: 400, color: isDarkMode ? colours.dark.text : '#111827' }}>
                  {matterData.openDate ? new Date(matterData.openDate).toLocaleDateString() : 'Not opened'}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <div style={{ fontSize: 9, color: mutedText(isDarkMode), marginBottom: 2 }}>PRACTICE AREA</div>
                <div style={{ fontSize: 10, fontWeight: 400, color: isDarkMode ? colours.dark.text : '#111827' }}>
                  {matterData.practiceArea || selectedInstruction.AreaOfWork || 'General Legal Services'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: mutedText(isDarkMode), marginBottom: 2 }}>RESPONSIBLE SOLICITOR</div>
                <div style={{ fontSize: 10, fontWeight: 400, color: isDarkMode ? colours.dark.text : '#111827' }}>
                  {matterData.responsibleSolicitor || selectedInstruction.ResponsibleSolicitor || 'Unassigned'}
                </div>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${borderColour(isDarkMode)}`, paddingTop: '12px' }}>
              <div style={{
                fontSize: 9,
                color: mutedText(isDarkMode),
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '8px'
              }}>
                Actions
              </div>
              {!matterData.matterId || matterData.matterId === 'NO_MATTER' ? (
                <div style={{
                  padding: '16px',
                  color: mutedText(isDarkMode),
                  fontSize: 11,
                  fontStyle: 'italic',
                  background: panelBackground(isDarkMode),
                  borderRadius: 8,
                  border: `1px dashed ${borderColour(isDarkMode)}`,
                  textAlign: 'center'
                }}>
                  <div style={{ marginBottom: '8px', fontSize: '12px', fontWeight: 600 }}>
                    No Matter Created
                  </div>
                  <div>
                    Use the Matter Opening workflow to create and configure the matter.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    className={buttonStyle('primary')}
                    onClick={handleOpenMatterDashboard}
                  >
                    <FontIcon iconName="ViewDashboard" style={{ fontSize: '12px' }} />
                    View in Clio
                  </button>
                  <button
                    className={buttonStyle('secondary')}
                    onClick={() => {
                      console.log('Opening matter timeline');
                    }}
                  >
                    <FontIcon iconName="Timeline" style={{ fontSize: '12px' }} />
                    Timeline
                  </button>
                  <button
                    className={buttonStyle('secondary')}
                    onClick={() => {
                      console.log('Opening matter documents');
                    }}
                  >
                    <FontIcon iconName="Documentation" style={{ fontSize: '12px' }} />
                    Documents
                  </button>
                </div>
              )}
            </div>

            {clientMatters.length > 0 && (
              <div style={{ borderTop: `1px solid ${borderColour(isDarkMode)}`, paddingTop: '12px' }}>
                <div style={{
                  fontSize: 9,
                  color: mutedText(isDarkMode),
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '8px'
                }}>
                  Client's Other Matters ({clientMatters.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {clientMatters.map((matter: any, index: number) => (
                    <div key={index} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      background: cardBackground(isDarkMode),
                      borderRadius: 8,
                      border: `1px solid ${borderColour(isDarkMode)}`,
                      fontSize: 10,
                      boxShadow: elevatedShadow(isDarkMode)
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : '#111827', marginBottom: '4px' }}>
                          {(() => {
                            const displayValue = getMatterDisplayNumber(matter);
                            const matterId = getMatterIdString(matter);
                            if (displayValue && displayValue !== matterId) {
                              return displayValue;
                            }
                            return matterId ? `Matter ${matterId}` : 'Matter';
                          })()}
                        </div>
                        <div style={{ color: mutedText(isDarkMode), fontSize: 9 }}>
                          {matter.description || 'No description'}
                        </div>
                      </div>
                      {getMatterIdString(matter) && (
                        <div style={{ fontSize: 9, color: mutedText(isDarkMode) }}>
                          ID: {getMatterIdString(matter)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default MatterOperations;