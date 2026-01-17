import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { TableConfig } from '../../components/DataTable';
import { Icon } from '@fluentui/react';
import { format } from 'date-fns';
import { colours } from '../../app/styles/colours';
import { TeamData } from '../../app/functionality/types';
import { groupInstructionsByClient, shouldGroupInstructions } from '../../utils/tableGrouping';
import InlineExpansionChevron from '../../components/InlineExpansionChevron';
import InlineWorkbench from './InlineWorkbench';
import { FaCreditCard, FaShieldAlt, FaIdCard, FaPoundSign, FaBuilding, FaFileAlt, FaRegFileAlt, FaFolder, FaRegFolder } from 'react-icons/fa';
import { FiShield } from 'react-icons/fi';

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
  // Matters array for DisplayNumber lookup
  matters?: any[];
  // Workbench action callbacks (for inline workbench)
  onDocumentPreview?: (doc: any) => void;
  onTriggerEID?: (instructionRef: string) => Promise<void>;
  onOpenIdReview?: (instructionRef: string) => void;
  onOpenMatter?: (instruction: any) => void;
  onOpenRiskAssessment?: (instruction: any) => void;
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
  matters = [],
  onDocumentPreview,
  onTriggerEID,
  onOpenIdReview,
  onOpenMatter,
  onOpenRiskAssessment,
}) => {
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [expandedClientsInTable, setExpandedClientsInTable] = useState<Set<string>>(new Set());
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);
  const [areActionsEnabled, setAreActionsEnabled] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Track which tab to open when expanding via pipeline chip click
  type WorkbenchTab = 'identity' | 'payment' | 'documents' | 'risk' | 'matter';
  type StageStatus = 'pending' | 'review' | 'complete' | 'processing' | 'neutral';
  interface StageStatuses {
    id: StageStatus;
    payment: StageStatus;
    risk: StageStatus;
    matter: StageStatus;
    documents: StageStatus;
  }
  const [initialWorkbenchTabs, setInitialWorkbenchTabs] = useState<Map<string, WorkbenchTab>>(new Map());
  
  // Helper to calculate stage statuses from item data - matches pipeline chip logic
  const getStageStatuses = useCallback((item: any): StageStatuses => {
    const inst = item?.rawData?.instruction || item?.instruction;
    const risk = item?.rawData?.risk || item?.risk;
    const eid = item?.rawData?.eid || item?.eid;
    const eids = item?.rawData?.eids || item?.eids;
    const payments = item?.rawData?.payments || inst?.payments || [];
    const documents = item?.rawData?.documents || inst?.documents || [];
    
    // ID Verification status
    const eidResult = (eid?.EIDOverallResult || eids?.[0]?.EIDOverallResult || inst?.EIDOverallResult)?.toLowerCase() ?? "";
    const eidStatusVal = (eid?.EIDStatus || eids?.[0]?.EIDStatus)?.toLowerCase() ?? "";
    const poidPassed = eidResult === 'passed' || eidResult === 'approved' || eidResult === 'verified' || eidResult === 'pass';
    const stageLower = ((inst?.Stage || inst?.stage || '') + '').trim().toLowerCase();
    const stageComplete = stageLower === 'proof-of-id-complete';
    const isInstructedOrLater = stageLower === 'proof-of-id-complete' || stageLower === 'completed';
    
    let idStatus: StageStatus = 'pending';
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
    let paymentStatus: StageStatus = 'pending';
    if (inst?.InternalStatus === 'paid') {
      paymentStatus = 'complete';
    } else if (payments && payments.length > 0) {
      const latest = payments[0];
      if ((latest.payment_status === 'succeeded' || latest.payment_status === 'confirmed') && 
          (latest.internal_status === 'completed' || latest.internal_status === 'paid')) {
        paymentStatus = 'complete';
      } else if (latest.internal_status === 'completed' || latest.internal_status === 'paid') {
        paymentStatus = 'complete';
      } else if (latest.payment_status === 'processing') {
        paymentStatus = 'processing';
      }
    }
    
    // Risk status
    const riskResultRaw = risk?.RiskAssessmentResult?.toString().toLowerCase() ?? "";
    const riskStatus: StageStatus = riskResultRaw
      ? ['low', 'low risk', 'pass', 'approved'].includes(riskResultRaw) ? 'complete' : 'review'
      : 'pending';
    
    // Matter status
    const matterStatus: StageStatus = (inst?.MatterId || (inst as any)?.matters?.length > 0) ? 'complete' : 'pending';
    
    // Documents status
    const docCount = documents.length;
    const docStatus: StageStatus = docCount > 0 ? 'complete' : 'neutral';
    
    return {
      id: idStatus,
      payment: paymentStatus,
      risk: riskStatus,
      matter: matterStatus,
      documents: docStatus,
    };
  }, []);
  
  // Fee earner reassignment state
  const [feReassignDropdown, setFeReassignDropdown] = useState<{ instructionRef: string; currentFe: string; x: number; y: number } | null>(null);
  const [isFeReassigning, setIsFeReassigning] = useState(false);
  
  // Deal/Matter selector state - tracks which ref to show and dropdown visibility
  // Key: clientEmail, Value: { viewMode: 'instruction' | 'matter', selectedDealIndex: number }
  const [clientViewModes, setClientViewModes] = useState<Map<string, { viewMode: 'instruction' | 'matter'; selectedDealIndex: number }>>(new Map());


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
      
      // Extract company name from various sources
      const companyName = inst?.CompanyName || deal?.CompanyName || clients?.[0]?.CompanyName || 
                         inst?.Company || deal?.Company || '';
      
      return {
      id: item.deal?.DealId || item.instruction?.InstructionRef?.split('-').pop() || 'N/A',
      passcode: item.deal?.Passcode || '',
      date: item.instruction?.SubmittedDate || item.deal?.PitchedDate || '',
      reference: item.instruction?.InstructionRef || `Deal ${item.deal?.DealId}`,
      clientName,
      companyName,
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

  // (No console debug here)

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

  // Client-based grouping data for inline expansion
  const clientGroupedData = useMemo(() => {
    if (sortColumn && sortColumn !== 'date') {
      // Don't group by client when sorting by other columns
      return [];
    }
    
    const shouldGroup = shouldGroupInstructions(sortedTableData);
    if (!shouldGroup) {
      return [];
    }
    
    // Group instructions by client
    const grouped = groupInstructionsByClient(sortedTableData);
    return grouped;
  }, [sortedTableData, sortColumn]);


  // Helper to process day groups and add client sub-grouping
  const processedGroupedData = useMemo(() => {
    return groupedData.map(dayGroup => {
      // Skip grouping only if there's 1 or fewer items
      if (dayGroup.items.length <= 1) {
        return { ...dayGroup, clientGroups: null };
      }
      
      // Check if this group has multiple instructions from the same client
      const clientGroups = groupInstructionsByClient(dayGroup.items);
      const hasClientGroups = clientGroups.some(group => group.items.length > 1);
      
      if (hasClientGroups) {
        return { 
          ...dayGroup, 
          clientGroups: clientGroups.map(clientGroup => ({
            ...clientGroup,
            isExpanded: expandedClientsInTable.has(`${dayGroup.date}-${clientGroup.clientKey}`)
          }))
        };
      }
      
      return { ...dayGroup, clientGroups: null };
    });
  }, [groupedData, expandedClientsInTable]);

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
    
    // Payment icon - £ when no payment, card/bank based on method when payment exists
    const getPaymentIcon = () => {
      const hasPayment = payments && payments.length > 0;
      if (!hasPayment) return <FaPoundSign size={10} />;
      
      // Determine payment method from latest payment
      const latest = payments[0];
      const methodRaw = (latest.payment_method || latest.method || '').toString().toLowerCase();
      const meta = latest.metadata || {};
      const metaMethod = (meta?.payment_method || meta?.method || meta?.paymentMethod || '').toString().toLowerCase();
      const intentId = (latest.stripe_payment_intent_id || latest.payment_intent_id || '').toString();
      const intentIsBank = intentId.startsWith('bank_');
      const intentIsCard = intentId.startsWith('pi_');
      const combinedMethod = methodRaw || metaMethod || (intentIsBank ? 'bank' : intentIsCard ? 'card' : '');
      const isBank = combinedMethod.includes('bank') || combinedMethod.includes('transfer') || combinedMethod.includes('bacs') || combinedMethod.includes('ach') || intentIsBank;
      
      if (isBank) return <FaBuilding size={10} />;
      return <FaCreditCard size={10} />; // Default to card if payment exists
    };
    const paymentIcon = getPaymentIcon();
    
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
    
    // Map stageKey to workbench tab
    const stageToTab: Record<string, WorkbenchTab> = {
      'id': 'identity',
      'payment': 'payment',
      'risk': 'risk',
      'matter': 'matter',
      'documents': 'documents',
      'transfer-docs': 'documents',
      'ccl': 'matter',
    };
    
    // Get item's notes key for expansion
    // Use the same key that rows use for expansion so chip clicks open the tray reliably
    const itemNotesKey = (item.id || item.reference || inst?.InstructionRef || deal?.Passcode || '') as string;
    
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
      icon: string | React.ReactNode;
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
        
        // Map stageKey to workbench tab and expand
        const targetTab = stageToTab[stageKey] || 'identity';
        
        // Set the initial tab for this item
        setInitialWorkbenchTabs(prev => new Map(prev).set(itemNotesKey, targetTab));
        
        // Expand the row if not already expanded
        if (!expandedNotes.has(itemNotesKey)) {
          const newSet = new Set(expandedNotes);
          newSet.add(itemNotesKey);
          setExpandedNotes(newSet);
        }
      };
      
      // Render icon - either Fluent UI icon name or React element
      const renderIcon = () => {
        if (typeof icon === 'string') {
          return <Icon iconName={icon} style={{ fontSize: '10px', color: colors.text }} />;
        }
        // Clone React element with color styling
        return <span style={{ color: colors.text, display: 'flex', alignItems: 'center' }}>{icon}</span>;
      };
      
      return (
        <div 
          title={`${label}: ${status === 'complete' ? 'Complete' : status === 'review' ? 'Needs Review' : status === 'processing' ? 'Processing' : 'Pending'} — Click to view details`}
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
          {renderIcon()}
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
    // NOTE: multi-deal selection UI was removed; keep selector focused on instruction↔matter.
    
    // Check if matter exists and get matter reference
    const hasMatter = !!(inst?.MatterId || (inst as any)?.matters?.length > 0);
    // Get the actual matter DisplayNumber from matters array or rawData
    const matterIdToFind = inst?.MatterId || inst?.InstructionRef;
    let matterDisplayNumber = null;
    
    if (hasMatter && matterIdToFind) {
      // Search in passed matters array - check MatterID and InstructionRef with type conversions
      const foundMatter = matters?.find((m: any) => {
        // Match MatterID (with type conversions for string/number)
        if (m?.MatterID === matterIdToFind) return true;
        if (String(m?.MatterID) === String(matterIdToFind)) return true;
        if (m?.MatterID && !isNaN(Number(m.MatterID)) && !isNaN(Number(matterIdToFind)) && Number(m.MatterID) === Number(matterIdToFind)) return true;
        
        // Match InstructionRef
        if (m?.InstructionRef === matterIdToFind) return true;
        if (m?.InstructionRef === inst?.InstructionRef) return true;
        
        return false;
      });
      
      if (foundMatter) {
        matterDisplayNumber = foundMatter.DisplayNumber || foundMatter['Display Number'] || foundMatter.displayNumber || foundMatter.display_number;
      }
      
      // Fallback to rawData matters
      if (!matterDisplayNumber) {
        const rawMatters = item.rawData.matters || (inst as any)?.matters || [];
        const rawMatter = rawMatters.length > 0 ? rawMatters[0] : null;
        matterDisplayNumber = rawMatter?.DisplayNumber || rawMatter?.['Display Number'] || rawMatter?.displayNumber || rawMatter?.display_number;
      }
    }
    
    const matterRef = hasMatter ? matterDisplayNumber : null;
    
    // Key for tracking view-mode selection (prefer stable client identifier, fallback to refs)
    const clientEmail = item.rawData?.client?.Email || item.rawData?.email || '';
    const selectorKey = String(clientEmail || instructionRef || (item as any)?.id || (item as any)?.reference || 'unknown');
    const clientViewMode = clientViewModes.get(selectorKey);
    const currentViewMode = clientViewMode?.viewMode || (matterRef ? 'matter' : 'instruction');
    
    // Determine what to display based on view mode
    const displayRef = currentViewMode === 'matter' && matterRef ? matterRef : instructionRef;
    const isShowingMatter = currentViewMode === 'matter' && !!matterRef;
    
    // Toggle only when we genuinely have two refs to switch between (instruction <-> matter)
    const hasInstructionAndMatter = !!instructionRef && !!matterRef;
    const canToggle = hasInstructionAndMatter;

    const feName = item.feeEarner as string | undefined;
    const isTriage = feName?.toLowerCase() === 'triage';
    const isAlreadyInitials = feName && feName.length <= 4 && !feName.includes(' ');
    const feInitials = feName
      ? (isTriage ? 'Triage' : (isAlreadyInitials ? feName.toUpperCase() : getInitialsFromName(feName)))
      : null;
    const canReassignFe = Boolean(onFeeEarnerReassign && teamData?.length);
    const showFeBadge = Boolean(feInitials || canReassignFe);
    
    // V2 pipeline stages for matters
    const transferDocsStatus: PipelineStatus = hasMatter ? ((inst as any)?.TransferDocsComplete ? 'complete' : 'pending') : 'pending';
    const cclStatus: PipelineStatus = hasMatter ? ((inst as any)?.CCL_date ? 'complete' : 'pending') : 'pending';
    
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        gap: '0',
        justifyContent: 'flex-start',
        overflow: 'visible',
      }}>
        {/* Context: ref + fee earner */}
        <div style={{
          width: 120,
          minWidth: 120,
          maxWidth: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          overflow: 'hidden',
        }}>
          {displayRef ? (
            <button
              title={isShowingMatter 
                ? `Matter: ${matterRef}${canToggle ? ' (click to show instruction)' : ''}` 
                : `Instruction: ${instructionRef}${canToggle ? ' (click to show matter)' : ''}`}
              type="button"
              style={{
                display: 'block',
                padding: '4px 8px',
                borderRadius: 0,
                width: '100%',
                background: isShowingMatter 
                  ? (isDarkMode ? 'rgba(115, 171, 96, 0.15)' : 'rgba(115, 171, 96, 0.1)')
                  : (isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)'),
                border: isShowingMatter 
                  ? `1px solid ${isDarkMode ? 'rgba(115, 171, 96, 0.4)' : 'rgba(115, 171, 96, 0.3)'}`
                  : `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
                fontSize: 10,
                fontWeight: 600,
                fontFamily: 'Monaco, Consolas, monospace',
                color: isShowingMatter ? colours.green : colours.highlight,
                cursor: canToggle ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textAlign: 'center',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (!canToggle) return;
                setClientViewModes((prev) => {
                  const newMap = new Map(prev);
                  const current = prev.get(selectorKey);
                  const nextMode = current?.viewMode === 'matter' ? 'instruction' : 'matter';
                  newMap.set(selectorKey, { viewMode: nextMode, selectedDealIndex: 0 });
                  return newMap;
                });
              }}
              onMouseEnter={(e) => {
                if (!canToggle) return;
                if (isShowingMatter) {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(115, 171, 96, 0.25)' : 'rgba(115, 171, 96, 0.2)';
                  e.currentTarget.style.borderColor = isDarkMode ? 'rgba(115, 171, 96, 0.6)' : 'rgba(115, 171, 96, 0.5)';
                } else {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)';
                  e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.5)' : 'rgba(54, 144, 206, 0.35)';
                }
              }}
              onMouseLeave={(e) => {
                if (isShowingMatter) {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(115, 171, 96, 0.15)' : 'rgba(115, 171, 96, 0.1)';
                  e.currentTarget.style.borderColor = isDarkMode ? 'rgba(115, 171, 96, 0.4)' : 'rgba(115, 171, 96, 0.3)';
                } else {
                  e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)';
                  e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)';
                }
              }}
            >
              {displayRef}
            </button>
          ) : (
            <span style={{ opacity: 0.3, fontSize: 10 }}>—</span>
          )}
        </div>

        {showFeBadge && (
          <button
            type="button"
            data-action-button
            onClick={(e) => canReassignFe && handleFeClick(instructionRef, feName || '', e)}
            disabled={!canReassignFe}
            title={feName ? `${feName} - Click to reassign` : (canReassignFe ? 'Assign fee earner' : '')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 8px',
              borderRadius: 0,
              background: isTriage
                ? (isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.10)' : 'rgba(148, 163, 184, 0.08)'),
              border: isTriage
                ? `1px solid ${isDarkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.25)'}`
                : `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.22)' : 'rgba(148, 163, 184, 0.2)'}`,
              fontSize: 10,
              fontWeight: 700,
              color: isTriage ? (isDarkMode ? '#f87171' : '#ef4444') : (isDarkMode ? 'rgba(203, 213, 225, 0.85)' : 'rgba(71, 85, 105, 0.85)'),
              cursor: canReassignFe ? 'pointer' : 'default',
              opacity: feInitials ? 1 : 0.65,
              transition: 'all 0.15s ease',
              marginLeft: 8,
              flex: '0 0 auto',
            }}
            onMouseEnter={(e) => {
              if (!canReassignFe) return;
              e.currentTarget.style.background = isTriage
                ? (isDarkMode ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.18)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.14)');
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isTriage
                ? (isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)')
                : (isDarkMode ? 'rgba(148, 163, 184, 0.10)' : 'rgba(148, 163, 184, 0.08)');
            }}
          >
            <Icon iconName={isTriage ? 'Medical' : 'Contact'} styles={{ root: { fontSize: 10, color: 'inherit' } }} />
            <span>{feInitials || '—'}</span>
            {canReassignFe && (
              <Icon iconName="ChevronDown" styles={{ root: { fontSize: 7, color: 'inherit', opacity: 0.6, marginLeft: -2 } }} />
            )}
          </button>
        )}
        
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
          {isShowingMatter ? (
            // V2 Pipeline for matters
            <>
              {/* Transfer Documents Stage */}
              <StatusStage status={transferDocsStatus} label="Docs" icon="CloudUpload" stageKey="transfer-docs" data={inst} />
              <StageConnector complete={transferDocsStatus === 'complete'} />
              
              {/* CCL Stage */}
              <StatusStage status={cclStatus} label="CCL" icon="CheckMark" stageKey="ccl" data={(inst as any)?.CCL_date} />
            </>
          ) : (
            // V1 Pipeline for instructions without matters
            <>
              {/* ID Stage - filled icon when submission exists, outline when pending */}
              <StatusStage status={idStatus} label="ID" icon={idStatus === 'pending' ? 'ContactCard' : <FaIdCard size={10} />} stageKey="id" data={eids || eid} />
              <StageConnector complete={idStatus === 'complete'} />
              
              {/* Payment Stage - £ when no payment, card/bank when payment exists */}
              <StatusStage status={paymentStatus === 'processing' ? 'processing' : paymentStatus === 'complete' ? 'complete' : 'pending'} label="Pay" icon={paymentIcon} stageKey="payment" data={payments} />
              <StageConnector complete={paymentStatus === 'complete'} />
              
              {/* Risk Stage - outline when pending, filled when has assessment */}
              <StatusStage status={riskStatus} label="Risk" icon={riskStatus === 'pending' ? <FiShield size={10} /> : <FaShieldAlt size={10} />} stageKey="risk" data={risk} />
              <StageConnector complete={riskStatus === 'complete'} />
              
              {/* Matter Stage - outline folder when no matter, filled when has matter */}
              <StatusStage status={matterStatus === 'complete' ? 'complete' : 'pending'} label="Matter" icon={matterStatus === 'complete' ? <FaFolder size={10} /> : <FaRegFolder size={10} />} stageKey="matter" data={inst?.MatterId} />
              <StageConnector complete={matterStatus === 'complete'} />
              
              {/* Docs Stage - outline file when no docs, filled when has docs */}
              <StatusStage status={docStatus === 'complete' ? 'complete' : 'neutral'} label="Docs" icon={docStatus === 'complete' ? <FaFileAlt size={10} /> : <FaRegFileAlt size={10} />} stageKey="documents" data={documents} />
            </>
          )}
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
      <div 
        data-action-button="true"
        style={{ 
          display: 'flex', 
          gap: '4px', 
          justifyContent: 'flex-end',
          alignItems: 'center',
          width: '100%'
        }}
      >
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

  // Toggle client group expansion within a specific day
  const toggleClientExpansion = useCallback((dayKey: string, clientKey: string) => {
    const fullKey = `${dayKey}-${clientKey}`;
    setExpandedClientsInTable(prev => {
      const next = new Set(prev);
      if (next.has(fullKey)) {
        next.delete(fullKey);
      } else {
        next.add(fullKey);
      }
      return next;
    });
  }, []);

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
                const isSorted = sortColumn === key;
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
                          { stage: 'id' as PipelineStage, label: 'ID', icon: <FaIdCard size={10} /> as string | React.ReactNode },
                          { stage: 'payment' as PipelineStage, label: 'Pay', icon: <FaPoundSign size={10} /> as string | React.ReactNode },
                          { stage: 'risk' as PipelineStage, label: 'Risk', icon: <FaShieldAlt size={10} /> as string | React.ReactNode },
                          { stage: 'matter' as PipelineStage, label: 'Matter', icon: <FaFolder size={10} /> as string | React.ReactNode },
                          { stage: 'docs' as PipelineStage, label: 'Docs', icon: <FaFileAlt size={10} /> as string | React.ReactNode },
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
                                {typeof icon === 'string' ? (
                                  <Icon
                                    iconName={icon}
                                    styles={{
                                      root: {
                                        fontSize: 10,
                                        color: filterColor,
                                      },
                                    }}
                                  />
                                ) : (
                                  <span style={{ color: filterColor, display: 'flex', alignItems: 'center' }}>{icon}</span>
                                )}
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
            /* Grouped rows with day separators + client sub-groups + timeline */
            processedGroupedData.map((group) => (
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

                {!group.collapsed && (() => {
                  // If this day has client groups, render them with expansion
                  if (group.clientGroups) {
                    return group.clientGroups.map((clientGroup) => {
                      // If client has multiple instructions, show as expandable group
                      if (clientGroup.items.length > 1) {
                        return (
                          <React.Fragment key={`client-${group.date}-${clientGroup.clientKey}`}>
                            {/* Client group header row */}
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: tableConfig.showTimeline && tableConfig.groupByDate 
                                  ? `32px ${gridTemplateColumns}` 
                                  : gridTemplateColumns,
                                gap: '12px',
                                padding: '10px 16px',
                                alignItems: 'center',
                                borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
                                fontSize: '13px',
                                color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
                                background: isDarkMode ? 'rgba(54, 144, 206, 0.04)' : 'rgba(54, 144, 206, 0.03)',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s ease',
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleClientExpansion(group.date, clientGroup.clientKey);
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.08)' : 'rgba(54, 144, 206, 0.06)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.04)' : 'rgba(54, 144, 206, 0.03)';
                              }}
                            >
                              {/* Timeline cell - empty for group headers */}
                              {tableConfig.showTimeline && tableConfig.groupByDate && (
                                <div style={{ position: 'relative', height: '100%' }}>
                                  <div style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: 0,
                                    bottom: 0,
                                    width: '1px',
                                    transform: 'translateX(-50%)',
                                    background: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                                  }} />
                                </div>
                              )}

                              {/* Render columns properly using tableConfig.columns structure */}
                              {tableConfig.columns.map((col, colIdx) => {
                                if (col.key === 'date') {
                                  return <div key={col.key}>{renderDate(clientGroup.latestItem)}</div>;
                                } else if (col.key === 'area') {
                                  return <div key={col.key}>{renderArea(clientGroup.latestItem)}</div>;
                                } else if (col.key === 'reference') {
                                  const totalValue = clientGroup.items.reduce((sum, item) => sum + (item.amount || 0), 0);
                                  const uniqueIds = clientGroup.items.map(item => item.id).filter(Boolean);
                                  const displayId = uniqueIds.length > 0 ? uniqueIds[0] : 'No ID';
                                  
                                  return (
                                    <div key={col.key} style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '2px',
                                      lineHeight: 1.3,
                                      justifyContent: 'center'
                                    }}>
                                      {/* ID with count indicator */}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{
                                          fontFamily: 'Monaco, Consolas, monospace',
                                          fontSize: '10px',
                                          fontWeight: '600',
                                          color: colours.highlight,
                                        }}>
                                          {displayId}
                                        </span>
                                        {clientGroup.items.length > 1 && (
                                          <span style={{
                                            fontSize: '8px',
                                            background: colours.blue,
                                            color: 'white',
                                            padding: '1px 3px',
                                            borderRadius: 2,
                                            fontWeight: 600
                                          }}>
                                            +{clientGroup.items.length - 1}
                                          </span>
                                        )}
                                      </div>
                                      {/* Combined Value */}
                                      {totalValue > 0 && (
                                        <span style={{
                                          fontSize: '10px',
                                          fontWeight: '600',
                                          color: '#22c55e',
                                        }}>
                                          £{totalValue.toLocaleString()}
                                        </span>
                                      )}
                                    </div>
                                  );
                                } else if (col.key === 'clientName') {
                                  const latestItem = clientGroup.latestItem;
                                  const clientName = latestItem.clientName || 'Unknown Client';
                                  const clientEmail = latestItem.clientEmail || latestItem.rawData?.instruction?.ClientEmail || latestItem.rawData?.instruction?.Email;
                                  
                                  return (
                                    <div key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 }}>
                                        <div style={{ 
                                          fontWeight: 600, 
                                          fontSize: '12px', 
                                          color: isDarkMode ? '#E5E7EB' : '#1F2937',
                                          marginBottom: '2px',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          {clientName}
                                        </div>
                                        {clientEmail && (
                                          <div style={{ 
                                            fontSize: '10px', 
                                            opacity: 0.7,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)'
                                          }}>
                                            {clientEmail}
                                          </div>
                                        )}
                                        {/* Show count of different clients if there are multiple with different names */}
                                        {(() => {
                                          const uniqueClientNames = new Set(clientGroup.items.map(item => item.clientName).filter(Boolean));
                                          return uniqueClientNames.size > 1 ? (
                                            <div style={{
                                              fontSize: '9px',
                                              color: colours.blue,
                                              fontWeight: 500,
                                              opacity: 0.8
                                            }}>
                                              +{uniqueClientNames.size - 1} other name{uniqueClientNames.size > 2 ? 's' : ''}
                                            </div>
                                          ) : null;
                                        })()}
                                      </div>
                                    </div>
                                  );
                                } else if (col.key === 'status') {
                                  // Don't show pipeline for grouped items - not clear which instruction it applies to
                                  return (
                                    <div key={col.key} style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      justifyContent: 'center',
                                      color: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.4)',
                                      fontSize: 10,
                                      fontStyle: 'italic',
                                    }}>
                                      Select to view
                                    </div>
                                  );
                                } else if (col.key === 'actions') {
                                  return (
                                    <div key={col.key} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                      <InlineExpansionChevron
                                        isExpanded={clientGroup.isExpanded || false}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleClientExpansion(group.date, clientGroup.clientKey);
                                        }}
                                        isDarkMode={isDarkMode}
                                        count={clientGroup.items.length}
                                        itemType="client"
                                      />
                                    </div>
                                  );
                                } else {
                                  return <div key={String(col.key)}></div>; // Empty for other columns
                                }
                              })}
                            </div>
                            
                            {/* Expanded client instructions */}
                            {clientGroup.isExpanded && clientGroup.items.map((item: any, idx: number) => {
                              const notesKey = item.id || item.reference || '';
                              const isExpanded = expandedNotes.has(notesKey);
                              const rawData = item.rawData;
                              return (
                                <div key={`client-child-${notesKey}`}>
                                  <div
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: tableConfig.showTimeline && tableConfig.groupByDate 
                                        ? `32px ${gridTemplateColumns}` 
                                        : gridTemplateColumns,
                                      gap: '12px',
                                      padding: '10px 16px',
                                      alignItems: 'center',
                                      borderBottom: `1px solid ${isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)'}`,
                                      fontSize: '13px',
                                      color: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
                                      background: isDarkMode ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.005)',
                                      cursor: 'pointer',
                                      transition: 'background-color 0.15s ease',
                                    }}
                                    onClick={(e) => {
                                      // Check if clicking on action buttons
                                      const target = e.target as HTMLElement;
                                      if (target.closest('[data-action-button]')) {
                                        return; // Let action buttons handle their own clicks
                                      }
                                      // Toggle notes expansion on row click
                                      console.log('Child item clicked, notesKey:', notesKey, 'currently expanded:', expandedNotes.has(notesKey));
                                      const newSet = new Set(expandedNotes);
                                      if (expandedNotes.has(notesKey)) {
                                        newSet.delete(notesKey);
                                      } else {
                                        newSet.add(notesKey);
                                      }
                                      console.log('New expandedNotes will be:', newSet);
                                      setExpandedNotes(newSet);
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.02)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(255, 255, 255, 0.01)' : 'rgba(0, 0, 0, 0.005)';
                                    }}
                                  >
                                    {/* Timeline cell - connector to parent */}
                                    {tableConfig.showTimeline && tableConfig.groupByDate && (
                                      <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
                                        {/* Connection line to parent */}
                                        <div style={{
                                          position: 'absolute',
                                          left: '50%',
                                          top: 0,
                                          bottom: 0,
                                          width: '1px',
                                          transform: 'translateX(-50%)',
                                          background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(54, 144, 206, 0.15)',
                                        }} />
                                        {/* Horizontal connector */}
                                        <div style={{
                                          position: 'absolute',
                                          left: '50%',
                                          top: '50%',
                                          width: '12px',
                                          height: '1px',
                                          background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(54, 144, 206, 0.15)',
                                        }} />
                                      </div>
                                    )}
                                    
                                    {/* Render columns for child rows */}
                                    {tableConfig.columns.map((col) => (
                                      <div
                                        key={String(col.key)}
                                        style={{ 
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          justifyContent: col.key === 'area' ? 'center' : (col.key === 'actions' ? 'flex-end' : 'flex-start'),
                                          minWidth: 0, 
                                          overflow: 'hidden' 
                                        }}
                                      >
                                        {col.render ? col.render(item, idx) : String((item as any)[col.key] ?? '—')}
                                      </div>
                                    ))}
                                  </div>
                                  
                                  {/* Inline Workbench for child items */}
                                  {isExpanded && (
                                    <InlineWorkbench
                                      item={rawData}
                                      isDarkMode={isDarkMode}
                                      teamData={teamData}
                                      initialTab={initialWorkbenchTabs.get(notesKey)}
                                      stageStatuses={getStageStatuses(item)}
                                      onDocumentPreview={onDocumentPreview}
                                      onTriggerEID={onTriggerEID}
                                      onOpenIdReview={onOpenIdReview}
                                      onOpenMatter={onOpenMatter}
                                      onOpenRiskAssessment={onOpenRiskAssessment}
                                      onClose={() => {
                                        const newSet = new Set(expandedNotes);
                                        newSet.delete(notesKey);
                                        setExpandedNotes(newSet);
                                      }}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </React.Fragment>
                        );
                      } else {
                        // Single instruction from this client - render normally
                        const item = clientGroup.items[0];
                        const notesKey = item.id || item.reference || '';
                        const isExpanded = expandedNotes.has(notesKey);
                        const rawData = item.rawData;
                        return (
                          <div key={`single-${notesKey}`}>
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
                                background: 'transparent',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s ease',
                                position: 'relative',
                              }}
                              onClick={(e) => {
                                // Check if clicking on action buttons
                                const target = e.target as HTMLElement;
                                if (target.closest('[data-action-button]')) {
                                  return;
                                }
                                // Toggle inline workbench expansion
                                const newSet = new Set(expandedNotes);
                                if (expandedNotes.has(notesKey)) {
                                  newSet.delete(notesKey);
                                } else {
                                  newSet.add(notesKey);
                                }
                                setExpandedNotes(newSet);
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)';
                                setHoveredDayKey(group.date);
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                setHoveredDayKey((prev) => (prev === group.date ? null : prev));
                              }}
                            >
                              {/* Timeline cell */}
                              {tableConfig.showTimeline && tableConfig.groupByDate && (
                                <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <div style={{
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
                                  }} />
                                </div>
                              )}
                              
                              {/* Render all columns using tableConfig.columns structure for proper alignment */}
                              {tableConfig.columns.map((col) => (
                                <div
                                  key={String(col.key)}
                                  style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: col.key === 'area' ? 'center' : (col.key === 'actions' ? 'flex-end' : 'flex-start'),
                                    minWidth: 0, 
                                    overflow: 'hidden' 
                                  }}
                                >
                                  {col.render ? col.render(item, 0) : String((item as any)[col.key] ?? '—')}
                                </div>
                              ))}
                            </div>
                            
                            {/* Inline Workbench for single client instructions */}
                            {isExpanded && (
                              <InlineWorkbench
                                item={rawData}
                                isDarkMode={isDarkMode}
                                teamData={teamData}
                                initialTab={initialWorkbenchTabs.get(notesKey)}
                                stageStatuses={getStageStatuses(item)}
                                onDocumentPreview={onDocumentPreview}
                                onTriggerEID={onTriggerEID}
                                onOpenIdReview={onOpenIdReview}
                                onOpenMatter={onOpenMatter}
                                onOpenRiskAssessment={onOpenRiskAssessment}
                                onClose={() => {
                                  const newSet = new Set(expandedNotes);
                                  newSet.delete(notesKey);
                                  setExpandedNotes(newSet);
                                }}
                              />
                            )}
                          </div>
                        );
                      }
                    });
                  } else {
                    // No client groups - render items normally (fallback to original logic)
                    return group.items.map((item: any, idx: number) => {
                    const notesKey = item.id || item.reference || '';
                    const isExpanded = expandedNotes.has(notesKey);

                    const rawData = item.rawData;
                    const inst = rawData?.instruction;
                    const deal = rawData?.deal;

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
                          onClick={(e) => {
                            // Check if clicking on action buttons
                            const target = e.target as HTMLElement;
                            if (target.closest('[data-action-button]')) {
                              return;
                            }
                            // Toggle inline workbench expansion
                            const newSet = new Set(expandedNotes);
                            if (expandedNotes.has(notesKey)) {
                              newSet.delete(notesKey);
                            } else {
                              newSet.add(notesKey);
                            }
                            setExpandedNotes(newSet);
                          }}
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

                        {/* Inline Workbench for fallback items */}
                        {isExpanded && (
                          <InlineWorkbench
                            item={rawData}
                            isDarkMode={isDarkMode}
                            teamData={teamData}
                            initialTab={initialWorkbenchTabs.get(notesKey)}
                            stageStatuses={getStageStatuses(item)}
                            onDocumentPreview={onDocumentPreview}
                            onTriggerEID={onTriggerEID}
                            onOpenIdReview={onOpenIdReview}
                            onOpenMatter={onOpenMatter}
                            onOpenRiskAssessment={onOpenRiskAssessment}
                            onClose={() => {
                              const newSet = new Set(expandedNotes);
                              newSet.delete(notesKey);
                              setExpandedNotes(newSet);
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                })()}
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