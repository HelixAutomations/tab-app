import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { TableConfig } from '../../components/DataTable';
import { Icon } from '@fluentui/react';
import { format } from 'date-fns';
import { colours } from '../../app/styles/colours';
import { TeamData } from '../../app/functionality/types';

// Pipeline types
type PipelineStage = 'id' | 'payment' | 'risk' | 'matter' | 'docs';
type PipelineStatus = 'pending' | 'review' | 'complete' | 'processing' | 'neutral';

interface InstructionTableViewProps {
  instructions: any[];
  isDarkMode: boolean;
  onRowClick?: (instruction: any) => void;
  loading?: boolean;
  // Pipeline filter props
  pipelineFilters?: Map<PipelineStage, Set<PipelineStatus>>;
  onPipelineFilterChange?: (filters: Map<PipelineStage, Set<PipelineStatus>>) => void;
  // Team data for fee earner badge
  teamData?: TeamData[] | null;
  onFeeEarnerReassign?: (instructionRef: string, newFeeEarnerEmail: string) => Promise<void>;
}

const InstructionTableView: React.FC<InstructionTableViewProps> = ({
  instructions,
  isDarkMode,
  onRowClick,
  loading = false,
  pipelineFilters = new Map(),
  onPipelineFilterChange,
  teamData,
  onFeeEarnerReassign,
}) => {
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);
  const [areActionsEnabled, setAreActionsEnabled] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Fee earner reassignment state
  const [feReassignDropdown, setFeReassignDropdown] = useState<{ instructionRef: string; currentFe: string; x: number; y: number } | null>(null);
  const [isFeReassigning, setIsFeReassigning] = useState(false);

  // Pipeline filter toggle handler - cycles through: no filter → pending → review → complete → no filter
  const cyclePipelineFilter = useCallback((stage: PipelineStage) => {
    if (!onPipelineFilterChange) return;
    
    const newFilters = new Map(pipelineFilters);
    const currentFilter = newFilters.get(stage);
    
    // Cycle order: none → pending → review → complete → none
    // For docs: none → neutral → complete → none
    const isDocs = stage === 'docs';
    const cycleOrder: PipelineStatus[] = isDocs 
      ? ['neutral', 'complete']
      : ['pending', 'review', 'complete'];
    
    if (!currentFilter || currentFilter.size === 0) {
      // Start with first state
      newFilters.set(stage, new Set([cycleOrder[0]]));
    } else {
      // Find current state and move to next
      const currentState = Array.from(currentFilter)[0] as PipelineStatus;
      const currentIdx = cycleOrder.indexOf(currentState);
      if (currentIdx === cycleOrder.length - 1) {
        // Last state, clear filter
        newFilters.delete(stage);
      } else {
        // Move to next state
        newFilters.set(stage, new Set([cycleOrder[currentIdx + 1]]));
      }
    }
    
    onPipelineFilterChange(newFilters);
  }, [pipelineFilters, onPipelineFilterChange]);

  // Get the current filter state for a stage (for display)
  const getStageFilterState = useCallback((stage: PipelineStage): PipelineStatus | null => {
    const filter = pipelineFilters.get(stage);
    if (!filter || filter.size === 0) return null;
    return Array.from(filter)[0] as PipelineStatus;
  }, [pipelineFilters]);

  // Team member options for fee earner reassignment
  const teamMemberOptions = useMemo(() => {
    if (!teamData) return [];
    
    const activeMembers = teamData.filter(td => 
      td.Email && 
      td.status?.toLowerCase() !== 'inactive' &&
      td.Email.toLowerCase() !== 'team@helix-law.com'
    );
    
    return activeMembers
      .map(td => ({
        value: td.Email!,
        text: `${td['Full Name'] || td.First || ''} (${td.Initials || '??'})`,
        initials: td.Initials || '??',
        fullName: td['Full Name'] || td.First || '',
        email: td.Email!
      }))
      .sort((a, b) => a.text.localeCompare(b.text));
  }, [teamData]);

  // Get initials from full name
  const getInitialsFromName = useCallback((fullName: string): string => {
    if (!fullName) return '??';
    // Check if we have team data match
    const teamMember = teamData?.find(td => 
      td['Full Name']?.toLowerCase() === fullName.toLowerCase() ||
      td.Email?.toLowerCase() === fullName.toLowerCase()
    );
    if (teamMember?.Initials) return teamMember.Initials;
    // Fallback: extract from name
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return fullName.substring(0, 2).toUpperCase();
  }, [teamData]);

  // Handle fee earner click - open dropdown
  const handleFeClick = useCallback((instructionRef: string, currentFe: string, event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setFeReassignDropdown({
      instructionRef,
      currentFe,
      x: rect.left,
      y: rect.bottom + 5
    });
  }, []);

  // Handle fee earner reassignment selection
  const handleFeReassignSelect = useCallback(async (selectedEmail: string) => {
    if (!selectedEmail || !feReassignDropdown || !onFeeEarnerReassign) return;
    
    const instructionRef = feReassignDropdown.instructionRef;
    
    setFeReassignDropdown(null);
    setIsFeReassigning(true);
    
    try {
      await onFeeEarnerReassign(instructionRef, selectedEmail);
    } catch (error) {
      console.error('Error reassigning fee earner:', error);
    } finally {
      setIsFeReassigning(false);
    }
  }, [feReassignDropdown, onFeeEarnerReassign]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!feReassignDropdown) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (feReassignDropdown && !target.closest('.fe-reassignment-dropdown')) {
        setFeReassignDropdown(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [feReassignDropdown]);

  // Transform instructions data for table
  const tableData = useMemo(() => {
    return instructions
      .filter(item => item.instruction) // Only show items that have instruction data
      .map(item => {
      // Build client name safely with comprehensive field checking
      let clientName = '';
      const inst = item.instruction;
      const deal = item.deal;
      const clients = item.clients;
      
      // Try various name field combinations
      const firstName = inst?.FirstName || inst?.firstName || inst?.first_name || 
                       clients?.[0]?.FirstName || deal?.FirstName || '';
      const lastName = inst?.LastName || inst?.lastName || inst?.last_name ||
                      clients?.[0]?.LastName || deal?.LastName || '';
      const fullName = `${firstName} ${lastName}`.trim();
      
      if (fullName && fullName !== ' ') {
        clientName = fullName;
      } else if (inst?.ClientName || deal?.ClientName || clients?.[0]?.ClientName) {
        clientName = inst?.ClientName || deal?.ClientName || clients?.[0]?.ClientName;
      } else if (inst?.CompanyName || deal?.CompanyName) {
        clientName = inst?.CompanyName || deal?.CompanyName;
      } else {
        // Extract from email as last resort
        const email = inst?.ClientEmail || inst?.Email || deal?.LeadClientEmail || clients?.[0]?.ClientEmail || '';
        if (email) {
          const emailParts = email.split('@');
          if (emailParts.length > 0) {
            clientName = emailParts[0].replace(/[._]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
          } else {
            clientName = 'Unknown Client';
          }
        } else {
          clientName = 'Unknown Client';
        }
      }
      
      return {
      id: item.deal?.DealId || item.instruction?.InstructionRef?.split('-').pop() || 'N/A',
      passcode: item.deal?.Passcode || '',
      date: item.instruction?.SubmittedDate || item.deal?.PitchedDate || '',
      reference: item.instruction?.InstructionRef || `Deal ${item.deal?.DealId}`,
      clientName,
      clientEmail: item.instruction?.ClientEmail || item.deal?.LeadClientEmail || '',
      feeEarner: item.instruction?.HelixContact || item.deal?.PitchedBy || '',
      amount: item.deal?.Amount || 0,
      status: item.instruction?.Stage || item.deal?.Status || 'pending',
      area: item.instruction?.AreaOfWork || item.instruction?.Area_of_Work || item.deal?.AreaOfWork || '',
      clientType: item.instruction?.ClientType || 'Individual',
      source: item.deal?.Source || '',
      rawData: item
    };
    });
  }, [instructions]);

  // Debug: Log unique feeEarner values
  React.useEffect(() => {
    const uniqueFE = [...new Set(tableData.map(t => t.feeEarner))];
    console.log('[Instructions] Unique feeEarner values:', uniqueFE);
  }, [tableData]);

  const toDayKey = (dateValue: unknown): string => {
    if (!dateValue) return 'unknown';
    const d = new Date(String(dateValue));
    if (Number.isNaN(d.getTime())) return 'unknown';
    return d.toISOString().split('T')[0];
  };

  // Format day separator label (e.g. "Today", "Yesterday", "Mon 30 Dec")
  const formatDaySeparatorLabel = (dayKey: string): string => {
    if (!dayKey || dayKey === 'unknown') return 'Unknown date';

    const date = new Date(`${dayKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) return 'Unknown date';

    const today = new Date();
    const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      .toISOString()
      .split('T')[0];
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
      .toISOString()
      .split('T')[0];

    if (dayKey === todayKey) return 'Today';
    if (dayKey === yesterday) return 'Yesterday';

    const isThisYear = date.getFullYear() === today.getFullYear();
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      ...(isThisYear ? {} : { year: 'numeric' }),
    } as Intl.DateTimeFormatOptions);
  };

  const sortedTableData = useMemo(() => {
    if (!sortColumn) return tableData;
    const items = [...tableData];

    items.sort((a, b) => {
      const aVal = (a as any)[sortColumn];
      const bVal = (b as any)[sortColumn];

      let comparison = 0;

      // Special-case dates for predictable sorting
      if (sortColumn === 'date') {
        const aTime = aVal ? new Date(aVal).getTime() : 0;
        const bTime = bVal ? new Date(bVal).getTime() : 0;
        // Handle invalid dates - push to end
        const aValid = aVal && !isNaN(aTime);
        const bValid = bVal && !isNaN(bTime);
        if (!aValid && !bValid) return 0;
        if (!aValid) return sortDirection === 'desc' ? 1 : -1; // Invalid dates go to end
        if (!bValid) return sortDirection === 'desc' ? -1 : 1;
        comparison = aTime - bTime;
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        // Handle null/undefined values - push to end
        const aEmpty = aVal == null || aVal === '';
        const bEmpty = bVal == null || bVal === '';
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1; // Empty values go to end regardless of direction
        if (bEmpty) return -1;
        comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return items;
  }, [tableData, sortColumn, sortDirection]);

  const groupedData = useMemo(() => {
    // When sorting by a non-date column, show flat list (single group)
    // to preserve the sort order across all items
    if (sortColumn && sortColumn !== 'date') {
      const result = [{
        date: 'all',
        items: sortedTableData,
        collapsed: false,
      }];
      
      console.log('[Instructions] groupedData updated (flat sort):', {
        sortColumn,
        itemCount: sortedTableData.length
      });
      
      return result;
    }
    
    // Mirror DataTable behaviour: group by day when sorting by date or no sort
    const groups = new Map<string, any[]>();
    sortedTableData.forEach((item) => {
      const key = toDayKey((item as any).date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });

    const result = Array.from(groups.entries())
      .map(([date, items]) => ({
        date,
        items,
        collapsed: collapsedDays.has(date),
      }))
      .sort((a, b) => {
        // 'unknown' dates go to end
        if (a.date === 'unknown') return 1;
        if (b.date === 'unknown') return -1;
        return sortDirection === 'desc' 
          ? b.date.localeCompare(a.date)
          : a.date.localeCompare(b.date);
      });
    
    console.log('[Instructions] groupedData updated:', {
      groups: result.map(g => ({ date: g.date, count: g.items.length, collapsed: g.collapsed })),
      collapsedDaysSet: Array.from(collapsedDays)
    });
    
    return result;
  }, [sortedTableData, collapsedDays, sortColumn, sortDirection]);

  // Area icon and color helper functions
  const getAreaOfWorkIcon = (areaOfWork: string): string => {
    const area = (areaOfWork || '').toLowerCase().trim();
    
    if (area.includes('triage')) return '🩺';
    if (area.includes('construction') || area.includes('building')) return '🏗️';
    if (area.includes('property') || area.includes('real estate') || area.includes('conveyancing')) return '🏠';
    if (area.includes('commercial') || area.includes('business')) return '🏢';
    if (area.includes('employment') || area.includes('hr') || area.includes('workplace')) return '👩🏻‍💼';
    if (area.includes('allocation')) return '📂';
    if (area.includes('general') || area.includes('misc') || area.includes('other')) return 'ℹ️';
    
    return 'ℹ️'; // Default icon
  };

  const getAreaColor = (area: string): string => {
    switch (area?.toLowerCase()) {
      case 'commercial':
        return '#3690CE';
      case 'construction':
        return '#f97316';
      case 'property':
        return '#10b981';
      case 'employment':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  // Status pipeline renderer with ID, Payment, Risk, Matter, Docs stages
  const renderStatusPipeline = (item: any) => {
    const inst = item.rawData.instruction;
    const deal = item.rawData.deal;
    const risk = item.rawData.risk;
    const eid = item.rawData.eid;
    const eids = item.rawData.eids;
    const payments = item.rawData.payments || inst?.payments || [];
    const documents = item.rawData.documents || inst?.documents || [];
    
    // Calculate status for each stage
    
    // ID Verification status
    const eidResult = (eid?.EIDOverallResult || eids?.[0]?.EIDOverallResult || inst?.EIDOverallResult)?.toLowerCase() ?? "";
    const eidStatusVal = (eid?.EIDStatus || eids?.[0]?.EIDStatus)?.toLowerCase() ?? "";
    const poidPassed = eidResult === 'passed' || eidResult === 'approved' || eidResult === 'verified' || eidResult === 'pass';
    const stageLower = ((inst?.Stage || inst?.stage || '') + '').trim().toLowerCase();
    const stageComplete = stageLower === 'proof-of-id-complete';
    const isInstructedOrLater = stageLower === 'proof-of-id-complete' || stageLower === 'completed';
    
    let idStatus: 'pending' | 'review' | 'complete' = 'pending';
    if (stageComplete) {
      if (eidResult === 'review') {
        idStatus = 'review';
      } else if (eidResult === 'failed' || eidResult === 'rejected' || eidResult === 'fail') {
        idStatus = 'review';
      } else if (poidPassed || eidResult === 'passed') {
        idStatus = 'complete';
      } else {
        idStatus = 'review';
      }
    } else if ((!eid && !eids?.length) || eidStatusVal === 'pending') {
      const hasEidAttempt = Boolean(eid || (eids && eids.length > 0));
      const hasProofOfId = Boolean(inst?.PassportNumber || inst?.DriversLicenseNumber);
      idStatus = hasProofOfId && hasEidAttempt ? 'review' : 'pending';
    } else if (poidPassed) {
      idStatus = 'complete';
    } else {
      idStatus = 'review';
    }
    
    if (isInstructedOrLater && idStatus === 'pending') {
      idStatus = 'review';
    }
    
    // Payment status
    const getPaymentStatus = () => {
      if (inst?.InternalStatus === 'paid') return 'complete';
      if (!payments || payments.length === 0) return 'pending';
      const latest = payments[0];
      if ((latest.payment_status === 'succeeded' || latest.payment_status === 'confirmed') && 
          (latest.internal_status === 'completed' || latest.internal_status === 'paid')) {
        return 'complete';
      }
      if (latest.internal_status === 'completed' || latest.internal_status === 'paid') return 'complete';
      if (latest.payment_status === 'processing') return 'processing';
      return 'pending';
    };
    const paymentStatus = getPaymentStatus();
    
    // Risk status
    const riskResultRaw = risk?.RiskAssessmentResult?.toString().toLowerCase() ?? "";
    const riskStatus = riskResultRaw
      ? ['low', 'low risk', 'pass', 'approved'].includes(riskResultRaw) ? 'complete' : 'review'
      : 'pending';
    
    // Matter status
    const matterStatus = (inst?.MatterId || (inst as any)?.matters?.length > 0) ? 'complete' : 'pending';
    
    // Documents status
    const docCount = documents.length;
    const docStatus = docCount > 0 ? 'complete' : 'neutral';
    
    // Status stage component
    const StatusStage = ({ 
      label, 
      status, 
      icon,
      stageKey,
      data
    }: { 
      label: string; 
      status: 'complete' | 'review' | 'pending' | 'processing' | 'neutral';
      icon: string;
      stageKey: string;
      data?: any;
    }) => {
      const getColors = () => {
        if (status === 'complete') return { 
          bg: isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)',
          border: '#22c55e',
          text: '#22c55e'
        };
        if (status === 'review') return {
          bg: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
          border: '#ef4444',
          text: '#ef4444'
        };
        if (status === 'processing') return {
          bg: isDarkMode ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.1)',
          border: '#f59e0b',
          text: '#f59e0b'
        };
        return {
          bg: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
          border: isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)',
          text: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)'
        };
      };
      const colors = getColors();
      
      const handleStageClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        console.log(`Clicked ${stageKey} stage`, data);
        // Trigger action based on stage
        if (stageKey === 'id') {
          alert(`ID Verification: ${status}\n\nView ID verification details for this instruction`);
        } else if (stageKey === 'payment') {
          alert(`Payment: ${status}\n\nView payment information and history`);
        } else if (stageKey === 'risk') {
          alert(`Risk Assessment: ${status}\n\nView risk assessment and compliance details`);
        } else if (stageKey === 'matter') {
          alert(`Matter: ${status}\n\nLink or view matter details`);
        } else if (stageKey === 'documents') {
          alert(`Documents: ${data?.length || 0} file(s)\n\nView or upload documents`);
        }
      };
      
      return (
        <div 
          title={`${label} - ${status}`}
          onClick={handleStageClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '0px',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            minWidth: '70px',
            justifyContent: 'center',
            transition: '0.2s',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.8';
            e.currentTarget.style.transform = 'scale(1.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <Icon iconName={icon} style={{ fontSize: '10px', color: colors.text }} />
          <span style={{ 
            fontSize: '9px', 
            fontWeight: 600, 
            color: colors.text,
            textTransform: 'uppercase'
          }}>
            {label}
          </span>
        </div>
      );
    };
    
    // Stage connector
    const StageConnector = ({ complete }: { complete: boolean }) => (
      <div style={{ 
        width: 8, 
        height: 1, 
        background: complete
          ? (isDarkMode ? `linear-gradient(to right, #22c55e, rgba(34, 197, 94, 0.3))` : `linear-gradient(to right, #22c55e, rgba(34, 197, 94, 0.2))`)
          : (isDarkMode ? 'linear-gradient(to right, rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0.15))' : 'linear-gradient(to right, rgba(148, 163, 184, 0.25), rgba(148, 163, 184, 0.1))')
      }} />
    );
    
    // Get full instruction ref for deal selector
    const instructionRef = inst?.InstructionRef || deal?.Passcode || '';
    // Check if there are multiple deals (to show selector chevron)
    const deals = item.rawData.deals || [];
    const hasMultipleDeals = deals.length > 1;
    
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        gap: '0',
        justifyContent: 'flex-start',
      }}>
        {/* Deal selector - fixed width area */}
        <div style={{
          width: 130,
          minWidth: 130,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}>
          {instructionRef ? (
            <button
              title={hasMultipleDeals ? "Select deal" : instructionRef}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 0,
                background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
                fontSize: 10,
                fontWeight: 600,
                fontFamily: 'Monaco, Consolas, monospace',
                color: colours.highlight,
                cursor: hasMultipleDeals ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!hasMultipleDeals) return;
                // TODO: Open deal selector dropdown when multiple deals exist
                console.log('Deal clicked:', instructionRef, item);
              }}
              onMouseEnter={(e) => {
                if (!hasMultipleDeals) return;
                e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)';
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.5)' : 'rgba(54, 144, 206, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)';
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)';
              }}
            >
              <span>{instructionRef}</span>
              {hasMultipleDeals && (
                <Icon iconName="ChevronDown" styles={{ root: { fontSize: 7, color: colours.highlight, opacity: 0.7 } }} />
              )}
            </button>
          ) : (
            <span style={{ opacity: 0.3, fontSize: 10 }}>—</span>
          )}
        </div>
        
        {/* Separator */}
        <div style={{ 
          width: 1, 
          height: 20, 
          background: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)',
          marginRight: 8,
        }} />
        
        {/* Pipeline stages */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
        }}>
          {/* ID Stage */}
          <StatusStage status={idStatus} label="ID" icon="ContactCard" stageKey="id" data={eids || eid} />
          <StageConnector complete={idStatus === 'complete'} />
          
          {/* Payment Stage */}
          <StatusStage status={paymentStatus === 'processing' ? 'processing' : paymentStatus === 'complete' ? 'complete' : 'pending'} label="Pay" icon="Money" stageKey="payment" data={payments} />
          <StageConnector complete={paymentStatus === 'complete'} />
          
          {/* Risk Stage */}
          <StatusStage status={riskStatus} label="Risk" icon="Shield" stageKey="risk" data={risk} />
          <StageConnector complete={riskStatus === 'complete'} />
          
          {/* Matter Stage */}
          <StatusStage status={matterStatus === 'complete' ? 'complete' : 'pending'} label="Matter" icon="DocumentSet" stageKey="matter" data={inst?.MatterId} />
          <StageConnector complete={matterStatus === 'complete'} />
          
          {/* Docs Stage */}
          <StatusStage status={docStatus === 'complete' ? 'complete' : 'neutral'} label="Docs" icon="Page" stageKey="documents" data={documents} />
        </div>
      </div>
    );
  };

  // Area icon renderer
  const renderArea = (item: any) => {
    const area = item.area;
    if (!area) return <span style={{ opacity: 0.5 }}>—</span>;
    
    const areaIcon = getAreaOfWorkIcon(area);
    
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%'
      }}>
        <span 
          title={area}
          style={{ 
            fontSize: '18px', 
            lineHeight: 1 
          }}
        >
          {areaIcon}
        </span>
      </div>
    );
  };

  // Amount renderer with pitch type
  const renderAmount = (item: any) => {
    const amount = item.amount;
    if (!amount || amount === 0) return <span style={{ opacity: 0.5 }}>—</span>;
    
    // Extract pitch type from rawData
    const rawData = item.rawData || {};
    const deal = rawData.deal || {};
    const pitchContent = deal.PitchContent;
    
    // Try to parse pitch content for scenario
    let pitchType = '';
    if (pitchContent) {
      try {
        const parsed = typeof pitchContent === 'string' ? JSON.parse(pitchContent) : pitchContent;
        // Look for scenario or id field in pitch content
        pitchType = parsed?.scenario || parsed?.id || parsed?.ScenarioDisplay || '';
      } catch {
        // If not JSON, try to extract from string
        const match = String(pitchContent).match(/"(cfa|toe|tc|after-call|standard|triage)"/i);
        if (match) pitchType = match[1].toUpperCase();
      }
    }
    
    // Check if triage pitch (PitchedBy field)
    const isTriage = deal.PitchedBy?.toLowerCase() === 'triage';
    
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4
      }}>
        <div style={{
          fontWeight: '600',
          color: '#22c55e'
        }}>
          £{amount.toLocaleString()}
        </div>
        {(pitchType || isTriage) && (
          <div style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            fontSize: 10,
            fontWeight: 500
          }}>
            {pitchType && (
              <span style={{
                padding: '2px 6px',
                backgroundColor: isDarkMode ? 'rgba(96, 165, 250, 0.15)' : 'rgba(54, 144, 206, 0.1)',
                color: isDarkMode ? '#60a5fa' : '#3690CE',
                borderRadius: 3,
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}>
                {pitchType}
              </span>
            )}
            {isTriage && (
              <span style={{
                padding: '2px 6px',
                backgroundColor: isDarkMode ? 'rgba(248, 113, 113, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                color: isDarkMode ? '#f87171' : '#ef4444',
                borderRadius: 3,
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}>
                Triage
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  // Actions renderer
  const renderActions = (item: any) => {    
    return (
      <div style={{ 
        display: 'flex', 
        gap: '4px', 
        justifyContent: 'flex-end',
        alignItems: 'center',
        width: '100%'
      }}>
        <div 
          title="Show notes" 
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '0px',
            background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.1)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: '0.2s'
          }}
          onClick={(e) => {
            e.stopPropagation();
            const notesKey = item.id || item.reference || '';
            const newSet = new Set(expandedNotes);
            if (expandedNotes.has(notesKey)) {
              newSet.delete(notesKey);
            } else {
              newSet.add(notesKey);
            }
            setExpandedNotes(newSet);
          }}
        >
          <Icon iconName={expandedNotes.has(item.id || item.reference || '') ? "ChevronUp" : "ChevronDown"} styles={{ root: { fontSize: '12px' } }} />
        </div>
        <div 
          title="Edit instruction" 
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '0px',
            background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.1)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: areActionsEnabled ? 'pointer' : 'not-allowed',
            transition: '0.2s',
            opacity: areActionsEnabled ? 1 : 0.4
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (!areActionsEnabled) return;
            onRowClick?.(item.rawData);
          }}
        >
          <Icon iconName="Edit" styles={{ root: { fontSize: '12px' } }} />
        </div>
      </div>
    );
  };

  // Date renderer
  const renderDate = (item: any) => {
    if (!item.date) return <span style={{ opacity: 0.5 }}>—</span>;
    
    try {
      const date = new Date(item.date);
      return (
        <span style={{
          fontSize: '11px',
          color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
          fontWeight: '500',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap'
        }}>
          {format(date, 'd MMM')}
        </span>
      );
    } catch {
      return <span style={{ opacity: 0.5 }}>Invalid</span>;
    }
  };

  // Client renderer
  const renderClient = (item: any) => {
    return (
      <div>
        <div style={{ 
          fontWeight: '500',
          marginBottom: '2px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {item.clientName}
        </div>
        {item.clientEmail && (
          <div style={{ 
            fontSize: '10px', 
            opacity: 0.7,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {item.clientEmail}
          </div>
        )}
      </div>
    );
  };

  // Table configuration following enquiries pattern
  const tableConfig: TableConfig<any> = {
    columns: [
      {
        key: 'date',
        header: 'Date',
        width: '70px',
        sortable: true,
        render: renderDate,
        tooltip: 'Sort by submission date'
      },
      {
        key: 'area',
        header: 'AOW',
        width: '50px',
        render: renderArea,
        tooltip: 'Area of work'
      },
      {
        key: 'reference',
        header: 'ID',
        width: '0.6fr',
        render: (item) => {
          const amount = item.amount;
          return (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              lineHeight: 1.3,
              justifyContent: 'center'
            }}>
              {/* ID */}
              <span style={{
                fontFamily: 'Monaco, Consolas, monospace',
                fontSize: '10px',
                fontWeight: '600',
                color: colours.highlight,
              }}>
                {item.id}
              </span>
              {/* Value */}
              {amount > 0 && (
                <span style={{
                  fontSize: '10px',
                  fontWeight: '600',
                  color: '#22c55e',
                }}>
                  £{amount.toLocaleString()}
                </span>
              )}
            </div>
          );
        }
      },
      {
        key: 'clientName',
        header: 'Client',
        width: '1.4fr',
        sortable: true,
        render: renderClient,
        tooltip: 'Sort by client name'
      },
      {
        key: 'feeEarner',
        header: 'FE',
        width: '0.8fr',
        sortable: true,
        render: (item) => {
          const feName = item.feeEarner;
          const isTriage = feName?.toLowerCase() === 'triage';
          // If it's already short (like initials), use as-is; otherwise extract initials
          const isAlreadyInitials = feName && feName.length <= 4 && !feName.includes(' ');
          const initials = feName 
            ? (isTriage ? 'Triage' : (isAlreadyInitials ? feName.toUpperCase() : getInitialsFromName(feName))) 
            : null;
          const instructionRef = item.reference || item.rawData?.instruction?.InstructionRef;
          const canReassign = Boolean(onFeeEarnerReassign && teamData?.length);
          
          if (!feName) {
            return (
              <button
                onClick={(e) => canReassign && handleFeClick(instructionRef, '', e)}
                disabled={!canReassign}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 0,
                  background: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
                  border: `1px dashed ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)'}`,
                  fontSize: 10,
                  fontWeight: 500,
                  color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
                  cursor: canReassign ? 'pointer' : 'default',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (canReassign) {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)';
                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)';
                  e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)';
                }}
              >
                <span style={{ fontSize: 9 }}>—</span>
                {canReassign && (
                  <Icon iconName="ChevronDown" styles={{ root: { fontSize: 7, color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)' } }} />
                )}
              </button>
            );
          }
          
          // Triage badge - special styling
          if (isTriage) {
            return (
              <button
                onClick={(e) => canReassign && handleFeClick(instructionRef, feName, e)}
                title="Triage - Click to reassign"
                disabled={!canReassign}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 8px',
                  borderRadius: 0,
                  background: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.25)'}`,
                  fontSize: 10,
                  fontWeight: 600,
                  color: isDarkMode ? '#f87171' : '#ef4444',
                  cursor: canReassign ? 'pointer' : 'default',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (canReassign) {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.18)';
                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(239, 68, 68, 0.5)' : 'rgba(239, 68, 68, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)';
                  e.currentTarget.style.borderColor = isDarkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.25)';
                }}
              >
                <Icon
                  iconName="Medical"
                  styles={{ root: { fontSize: 10, color: isDarkMode ? '#f87171' : '#ef4444' } }}
                />
                <span>{initials}</span>
                {canReassign && (
                  <Icon iconName="ChevronDown" styles={{ root: { fontSize: 7, color: isDarkMode ? 'rgba(239, 68, 68, 0.6)' : 'rgba(239, 68, 68, 0.5)', marginLeft: -2 } }} />
                )}
              </button>
            );
          }
          
          return (
            <button
              onClick={(e) => canReassign && handleFeClick(instructionRef, feName, e)}
              title={`${feName} - Click to reassign`}
              disabled={!canReassign}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 0,
                background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
                fontSize: 10,
                fontWeight: 600,
                color: isDarkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(71, 85, 105, 0.9)',
                cursor: canReassign ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (canReassign) {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.2)';
                  e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(148, 163, 184, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)';
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)';
              }}
            >
              <Icon
                iconName="Contact"
                styles={{ root: { fontSize: 10, color: isDarkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(71, 85, 105, 0.9)' } }}
              />
              <span>{initials}</span>
              {canReassign && (
                <Icon iconName="ChevronDown" styles={{ root: { fontSize: 7, color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.5)', marginLeft: -2 } }} />
              )}
            </button>
          );
        }
      },
      {
        key: 'status',
        header: 'Instruction | Pipeline',
        width: '2.2fr',
        render: renderStatusPipeline,
        tooltip: 'Instruction reference and status progression pipeline'
      },
      {
        key: 'actions',
        header: 'Actions',
        width: '0.5fr',
        render: renderActions
      }
    ],
    defaultSort: {
      column: 'date',
      direction: 'desc'
    },
    showTimeline: true,
    groupByDate: true,
    dateField: 'date'
  };

  const gridTemplateColumns = useMemo(() => {
    return tableConfig.columns.map((col) => col.width).join(' ');
  }, [tableConfig.columns]);

  const handleSort = (columnKey: string) => {
    const column = tableConfig.columns.find((c) => String(c.key) === columnKey);
    if (!column?.sortable) return;

    if (sortColumn === columnKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnKey);
      setSortDirection('desc');
    }
  };

  const toggleDayCollapse = (dayKey: string) => {
    console.log('[Instructions] toggleDayCollapse called for:', dayKey);
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) {
        next.delete(dayKey);
        console.log('[Instructions] Day uncollapsed:', dayKey);
      } else {
        next.add(dayKey);
        console.log('[Instructions] Day collapsed:', dayKey);
      }
      console.log('[Instructions] New collapsedDays:', Array.from(next));
      return next;
    });
  };

  return (
    <div style={{ margin: '16px' }}>
      <div style={{ width: '100%' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)' }}>
            Loading instructions…
          </div>
        ) : (
          <div
            className="instructions-table"
            style={{
              backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : '#ffffff',
              border: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
              borderRadius: 2,
              overflow: 'visible',
              fontFamily: 'Raleway, "Segoe UI", sans-serif',
            }}
          >
            {/* Sticky header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: tableConfig.showTimeline && tableConfig.groupByDate 
                  ? `32px ${gridTemplateColumns}` 
                  : gridTemplateColumns,
                gap: '12px',
                padding: '10px 16px',
                alignItems: 'center',
                position: 'sticky',
                top: 0,
                zIndex: 10,
                background: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(12px)',
                borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'}`,
                fontSize: '10px',
                fontWeight: 500,
                color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                boxShadow: isDarkMode ? '0 2px 8px rgba(0, 0, 0, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.08)',
              }}
            >
              {/* Timeline header cell */}
              {tableConfig.showTimeline && tableConfig.groupByDate && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.5,
                  }}
                  title="Timeline"
                >
                  <Icon
                    iconName="TimelineProgress"
                    styles={{
                      root: {
                        fontSize: 12,
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.35)',
                      },
                    }}
                  />
                </div>
              )}
              {tableConfig.columns.map((col, index) => {
                const key = String(col.key);
                const isActions = key === 'actions';
                const showSortIcon = col.sortable && !isActions;
                const isSorted = sortColumn === key;
                const sortIconName = isSorted ? (sortDirection === 'asc' ? 'SortUp' : 'SortDown') : 'Sort';
                const justifyContent =
                  key === 'area'
                    ? 'center'
                    : isActions
                      ? 'flex-end'
                      : index === 0
                        ? 'flex-start'
                        : 'flex-start';

                return (
                  <div
                    key={key}
                    onClick={() => {
                      if (isActions) return;
                      handleSort(key);
                    }}
                    style={{
                      cursor: !isActions && col.sortable ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent,
                      gap: '4px',
                      transition: 'color 0.15s ease',
                      color: sortColumn === key ? (isDarkMode ? colours.accent : colours.highlight) : undefined,
                      fontWeight: sortColumn === key ? 600 : 500,
                      minWidth: 0,
                    }}
                    title={col.tooltip || (col.sortable ? `Sort by ${col.header.toLowerCase()}` : undefined)}
                  >
                    {isActions ? (
                      <>
                        <span>Actions</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAreActionsEnabled((prev) => !prev);
                          }}
                          title={areActionsEnabled ? 'Disable row actions to prevent edits' : 'Enable row actions to edit instructions'}
                          style={{
                            width: 24,
                            height: 24,
                            minWidth: 22,
                            minHeight: 22,
                            borderRadius: '999px',
                            border: `1px solid ${areActionsEnabled ? (isDarkMode ? 'rgba(96,165,250,0.5)' : 'rgba(59,130,246,0.4)') : (isDarkMode ? 'rgba(148,163,184,0.4)' : 'rgba(100,116,139,0.35)')}`,
                            background: areActionsEnabled
                              ? (isDarkMode ? 'rgba(96,165,250,0.15)' : 'rgba(59,130,246,0.08)')
                              : 'transparent',
                            color: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            padding: 0,
                          }}
                          aria-pressed={areActionsEnabled}
                        >
                          <Icon
                            iconName={areActionsEnabled ? 'UnlockSolid' : 'LockSolid'}
                            styles={{
                              root: {
                                fontSize: '11px',
                                color: areActionsEnabled
                                  ? colours.highlight
                                  : (isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(71, 85, 105, 0.85)'),
                              },
                            }}
                          />
                        </button>
                      </>
                    ) : key === 'status' ? (
                      /* Deal header + Pipeline filter buttons in header - aligned with content */
                      <div 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 0,
                          width: '100%',
                          justifyContent: 'flex-start',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Instruction header - fixed width matching data row */}
                        <span style={{ 
                          width: 130, 
                          minWidth: 130,
                          textTransform: 'uppercase',
                          fontSize: 10,
                          fontWeight: 500,
                          letterSpacing: 0.5,
                        }}>
                          Instruction
                        </span>
                        
                        {/* Separator matching data row */}
                        <div style={{ 
                          width: 1, 
                          height: 14, 
                          background: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                          marginRight: 8,
                        }} />
                        
                        {/* Pipeline filter buttons */}
                        {([
                          { stage: 'id' as PipelineStage, label: 'ID', icon: 'ContactCard' },
                          { stage: 'payment' as PipelineStage, label: 'Pay', icon: 'Money' },
                          { stage: 'risk' as PipelineStage, label: 'Risk', icon: 'Shield' },
                          { stage: 'matter' as PipelineStage, label: 'Matter', icon: 'DocumentSet' },
                          { stage: 'docs' as PipelineStage, label: 'Docs', icon: 'Page' },
                        ]).map(({ stage, label, icon }, index) => {
                          const filterState = getStageFilterState(stage);
                          const hasFilter = filterState !== null;
                          
                          // Color based on filter state
                          const getFilterColor = () => {
                            if (!filterState) return isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)';
                            if (filterState === 'complete') return '#22c55e';
                            if (filterState === 'review') return '#ef4444';
                            if (filterState === 'pending' || filterState === 'neutral') return isDarkMode ? 'rgba(148, 163, 184, 0.85)' : 'rgba(100, 116, 139, 0.85)';
                            if (filterState === 'processing') return '#f59e0b';
                            return colours.highlight;
                          };
                          
                          const filterColor = getFilterColor();
                          const stateLabel = filterState 
                            ? filterState.charAt(0).toUpperCase() + filterState.slice(1)
                            : null;
                          
                          return (
                            <React.Fragment key={stage}>
                              <button
                                type="button"
                                title={hasFilter 
                                  ? `${label}: showing ${stateLabel} (click to cycle)` 
                                  : `Filter by ${label} status (click to activate)`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cyclePipelineFilter(stage);
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 3,
                                  height: 22,
                                  minWidth: '70px',
                                  padding: '0 10px',
                                  background: hasFilter 
                                    ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                    : 'transparent',
                                  border: hasFilter 
                                    ? `1px solid ${filterColor}40`
                                    : '1px solid transparent',
                                  borderRadius: 0,
                                  cursor: 'pointer',
                                  transition: 'all 150ms ease',
                                  opacity: hasFilter ? 1 : 0.7,
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.opacity = '1';
                                  e.currentTarget.style.background = isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.opacity = hasFilter ? '1' : '0.7';
                                  e.currentTarget.style.background = hasFilter 
                                    ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                    : 'transparent';
                                }}
                              >
                                <Icon
                                  iconName={icon}
                                  styles={{
                                    root: {
                                      fontSize: 10,
                                      color: filterColor,
                                    },
                                  }}
                                />
                                <span style={{
                                  fontSize: 9,
                                  fontWeight: 600,
                                  color: filterColor,
                                  textTransform: 'uppercase',
                                }}>
                                  {label}
                                </span>
                                {hasFilter && (
                                  <span style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: filterColor,
                                    marginLeft: 1,
                                  }}/>
                                )}
                              </button>
                              {/* Stage connector - matches data rows */}
                              {index < 4 && (
                                <div style={{ 
                                  width: 8, 
                                  height: 1, 
                                  background: isDarkMode 
                                    ? 'linear-gradient(to right, rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0.15))' 
                                    : 'linear-gradient(to right, rgba(148, 163, 184, 0.25), rgba(148, 163, 184, 0.1))',
                                  alignSelf: 'center'
                                }} />
                              )}
                            </React.Fragment>
                          );
                        })}
                        {/* Clear all filters button */}
                        {pipelineFilters.size > 0 && (
                          <button
                            type="button"
                            title="Clear all pipeline filters"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPipelineFilterChange?.(new Map());
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 18,
                              height: 18,
                              marginLeft: 2,
                              background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                              border: 'none',
                              borderRadius: 4,
                              cursor: 'pointer',
                              transition: 'all 150ms ease',
                            }}
                          >
                            <Icon
                              iconName="Cancel"
                              styles={{
                                root: {
                                  fontSize: 8,
                                  color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
                                },
                              }}
                            />
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        {col.header}
                        {col.sortable && (
                          <Icon
                            iconName={sortColumn === key ? (sortDirection === 'asc' ? 'ChevronUpSmall' : 'ChevronDownSmall') : 'ChevronDownSmall'}
                            styles={{ 
                              root: { 
                                fontSize: '8px',
                                marginLeft: 4,
                                opacity: sortColumn === key ? 1 : 0.35,
                                color: sortColumn === key 
                                  ? (isDarkMode ? colours.accent : colours.highlight)
                                  : (isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)'),
                                transition: 'opacity 0.15s ease',
                              } 
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Empty state when no results */}
            {sortedTableData.length === 0 ? (
              <div style={{ 
                padding: '40px 20px', 
                textAlign: 'center', 
                color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}>
                <span style={{ fontSize: 13 }}>
                  {pipelineFilters.size > 0 
                    ? 'No instructions match the selected pipeline filters'
                    : 'No instructions found'}
                </span>
                {pipelineFilters.size > 0 && (
                  <button
                    type="button"
                    onClick={() => onPipelineFilterChange?.(new Map())}
                    style={{
                      marginTop: 8,
                      padding: '6px 12px',
                      background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
                      borderRadius: 4,
                      color: colours.highlight,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: 'Raleway, sans-serif',
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
            /* Grouped rows with day separators + timeline */
            groupedData.map((group) => (
              <React.Fragment key={group.date}>
                {/* Day separator - hidden when showing flat sorted list */}
                {group.date !== 'all' && (
                <div
                  onClick={(e) => {
                    console.log('[Instructions] Day separator clicked:', group.date, e.target);
                    e.preventDefault();
                    e.stopPropagation();
                    toggleDayCollapse(group.date);
                  }}
                  onMouseEnter={() => setHoveredDayKey(group.date)}
                  onMouseLeave={() => setHoveredDayKey((prev) => (prev === group.date ? null : prev))}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: tableConfig.showTimeline && tableConfig.groupByDate 
                      ? '32px 1fr auto' 
                      : '1fr auto',
                    gap: '12px',
                    alignItems: 'center',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    position: 'relative',
                    zIndex: 1,
                    background:
                      hoveredDayKey === group.date
                        ? (isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.08)')
                        : (isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 0.8)'),
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.25)'}`,
                    borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.25)'}`,
                  }}
                >
                  {/* Timeline cell with line and dot */}
                  {tableConfig.showTimeline && tableConfig.groupByDate && (
                    <div
                      style={{
                        position: 'relative',
                        height: '100%',
                        minHeight: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {/* Vertical line - only below the dot */}
                      <div
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          bottom: 0,
                          width: '1px',
                          transform: 'translateX(-50%)',
                          background:
                            hoveredDayKey === group.date
                              ? (isDarkMode ? colours.accent : colours.highlight)
                              : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'),
                          opacity: hoveredDayKey === group.date ? 0.9 : 1,
                        }}
                      />
                      {/* Timeline dot */}
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background:
                            hoveredDayKey === group.date
                              ? (isDarkMode ? colours.accent : colours.highlight)
                              : (isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(148, 163, 184, 0.5)'),
                          border: `2px solid ${isDarkMode ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)'}`,
                          zIndex: 1,
                        }}
                      />
                    </div>
                  )}

                  {/* Day label and chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: hoveredDayKey === group.date ? 800 : 700,
                        color:
                          hoveredDayKey === group.date
                            ? (isDarkMode ? colours.accent : colours.highlight)
                            : (isDarkMode ? 'rgba(148, 163, 184, 0.85)' : 'rgba(71, 85, 105, 0.95)'),
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {formatDaySeparatorLabel(group.date)}
                      <span style={{
                        marginLeft: '6px',
                        fontSize: '9px',
                        fontWeight: 400,
                        color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                        backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.1)',
                        padding: '1px 5px',
                        borderRadius: '8px',
                        lineHeight: 1.2,
                        textTransform: 'none',
                        letterSpacing: 'normal',
                      }}>
                        {group.items.length}
                      </span>
                    </span>
                    <Icon
                      iconName={group.collapsed ? 'ChevronRight' : 'ChevronDown'}
                      styles={{
                        root: {
                          fontSize: 10,
                          marginLeft: 6,
                          color: isDarkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)',
                          transition: 'transform 0.2s ease',
                          transform: group.collapsed ? 'rotate(0deg)' : 'rotate(0deg)',
                        },
                      }}
                    />
                  </div>

                  {/* Collapsed eye indicator */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'flex-end',
                    paddingLeft: '12px',
                    pointerEvents: 'none',
                    opacity: group.collapsed ? 1 : 0,
                    transition: 'opacity 0.2s ease'
                  }}>
                    {group.collapsed && (
                      <Icon
                        iconName="Hide3"
                        styles={{
                          root: {
                            fontSize: 12,
                            color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                          },
                        }}
                        title={`${group.items.length} items hidden`}
                      />
                    )}
                  </div>
                </div>
                )}

                {!group.collapsed &&
                  group.items.map((item: any, idx: number) => {
                    const notesKey = item.id || item.reference || '';
                    const isExpanded = expandedNotes.has(notesKey);

                    const rawData = item.rawData;
                    const inst = rawData?.instruction;
                    const deal = rawData?.deal;

                    const description =
                      inst?.Notes ||
                      deal?.ServiceDescription ||
                      inst?.Description ||
                      inst?.description ||
                      deal?.description;

                    return (
                      <div key={notesKey}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: tableConfig.showTimeline && tableConfig.groupByDate 
                              ? `32px ${gridTemplateColumns}` 
                              : gridTemplateColumns,
                            gap: '12px',
                            padding: '10px 16px',
                            alignItems: 'center',
                            borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'}`,
                            fontSize: '13px',
                            color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
                            background: idx % 2 === 0
                              ? (isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)')
                              : 'transparent',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease',
                            position: 'relative',
                          }}
                          onClick={() => onRowClick?.(item.rawData)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = isDarkMode
                              ? 'rgba(255, 255, 255, 0.05)'
                              : 'rgba(0, 0, 0, 0.02)';
                            setHoveredDayKey(group.date);
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = idx % 2 === 0
                              ? (isDarkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)')
                              : 'transparent';
                            setHoveredDayKey((prev) => (prev === group.date ? null : prev));
                          }}
                        >
                          {/* Timeline cell */}
                          {tableConfig.showTimeline && tableConfig.groupByDate && (
                            <div
                              style={{
                                position: 'relative',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {/* Vertical line */}
                              <div
                                style={{
                                  position: 'absolute',
                                  left: '50%',
                                  top: 0,
                                  bottom: 0,
                                  width: '1px',
                                  transform: 'translateX(-50%)',
                                  background: hoveredDayKey === group.date
                                    ? (isDarkMode ? colours.accent : colours.highlight)
                                    : (isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'),
                                  opacity: hoveredDayKey === group.date ? 0.9 : 1,
                                  transition: 'background 0.15s ease, opacity 0.15s ease',
                                }}
                              />
                            </div>
                          )}

                          {tableConfig.columns.map((col) => (
                            <div
                              key={String(col.key)}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: col.key === 'area' ? 'center' : 'flex-start',
                                minWidth: 0, 
                                overflow: 'hidden' 
                              }}
                            >
                              {col.render ? col.render(item, idx) : String((item as any)[col.key] ?? '')}
                            </div>
                          ))}
                        </div>

                        {isExpanded && description && (
                          <div
                            style={{
                              padding: '12px 20px 12px 52px',
                              backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.015)' : 'rgba(0, 0, 0, 0.008)',
                              borderTop: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'}`,
                              borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)'}`,
                              fontSize: '13px',
                              lineHeight: '1.5',
                              color: isDarkMode ? 'rgba(203, 213, 225, 0.85)' : 'rgba(71, 85, 105, 0.85)',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {description}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </React.Fragment>
            ))
            )}
          </div>
        )}
      </div>

      {/* Fee Earner Reassignment Dropdown */}
      {feReassignDropdown && (
        <div
          className="fe-reassignment-dropdown"
          style={{
            position: 'fixed',
            left: Math.min(feReassignDropdown.x, window.innerWidth - 220),
            top: Math.min(feReassignDropdown.y, window.innerHeight - 300),
            zIndex: 10000,
            background: isDarkMode ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
            borderRadius: 6,
            boxShadow: isDarkMode 
              ? '0 8px 32px rgba(0, 0, 0, 0.5)' 
              : '0 8px 32px rgba(0, 0, 0, 0.15)',
            maxHeight: 280,
            width: 200,
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '8px 12px',
            borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
            fontSize: 11,
            fontWeight: 600,
            color: isDarkMode ? 'rgba(203, 213, 225, 0.7)' : 'rgba(71, 85, 105, 0.7)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Reassign to
          </div>
          <div style={{ 
            maxHeight: 230, 
            overflowY: 'auto',
            overflowX: 'hidden',
          }}>
            {isFeReassigning ? (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: isDarkMode ? 'rgba(203, 213, 225, 0.7)' : 'rgba(71, 85, 105, 0.7)',
                fontSize: 12,
              }}>
                Reassigning...
              </div>
            ) : (
              teamMemberOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleFeReassignSelect(option.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    background: feReassignDropdown.currentFe?.toLowerCase() === option.fullName.toLowerCase() 
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)')
                      : 'transparent',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: isDarkMode ? 'rgba(203, 213, 225, 0.9)' : 'rgba(71, 85, 105, 0.9)',
                    textAlign: 'left',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = feReassignDropdown.currentFe?.toLowerCase() === option.fullName.toLowerCase()
                      ? (isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)')
                      : 'transparent';
                  }}
                >
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)',
                    color: colours.blue,
                    fontSize: 10,
                    fontWeight: 700,
                  }}>
                    {option.initials}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {option.fullName}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InstructionTableView;