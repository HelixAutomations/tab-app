import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { mergeStyles } from '@fluentui/react';
import { TextField, DefaultButton, PrimaryButton, Dropdown, IDropdownOption, Icon } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import OperationStatusToast from '../enquiries/pitch-builder/OperationStatusToast';
import { TeamData } from '../../app/functionality/types';
import { ProgressIndicator } from '../../components/feedback/FeedbackComponents';
import { createTransition, ANIMATION_DURATION, EASING } from '../../app/styles/animations';
import {
  FaUser,
  FaUsers,
  FaFileAlt,
  FaDownload,
  FaPlayCircle,
  FaSpinner,
  FaUserEdit,
  FaIdBadge,
  FaEnvelope,
  FaPhone,
  FaCalendarAlt,
  FaInfoCircle,
  FaFileUpload,
  FaIdCard,
  FaPoundSign,
  FaShieldAlt,
  FaFolder,
  FaClipboardCheck,
  FaBuilding
} from 'react-icons/fa';

// Format bytes helper
const formatBytes = (bytes?: number): string => {
  if (!bytes || isNaN(bytes)) return '-';
  const units = ['B','KB','MB','GB','TB'];
  let i = 0; let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i>0 ? 1 : 0)} ${units[i]}`;
};

// Choose icon colour by extension
const getFileColour = (ext: string, coloursRef: typeof colours): string => {
  switch(ext) {
    case 'pdf': return coloursRef.red || '#dc2626';
    case 'doc': case 'docx': return coloursRef.blue;
    case 'xls': case 'xlsx': return coloursRef.green;
    case 'ppt': case 'pptx': return coloursRef.orange || '#ea580c';
    case 'zip': case 'rar': case '7z': return coloursRef.greyText;
  case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': return coloursRef.blue;
    default: return coloursRef.blue;
  }
};

type PitchContentShape = {
  EmailSubject?: string;
  subject?: string;
  EmailBody?: string;
  body?: string;
  EmailBodyHtml?: string;
  bodyHtml?: string;
  [key: string]: unknown;
};

const coercePitchContent = (value: unknown): PitchContentShape | null => {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value.find(Boolean);
    return coercePitchContent(first);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return parsed as PitchContentShape;
      }
    } catch {
      // Fall through to treat as raw HTML body
    }
    return { EmailBodyHtml: trimmed };
  }
  if (typeof value === 'object') {
    return value as PitchContentShape;
  }
  return null;
};

// Move interface to separate file
/**
 * Compact instruction card with clear information hierarchy for legibility.
 * TODO(ac): Narrow any-based shapes to precise interfaces where feasible.
 */
export interface InstructionCardProps {
  instruction: any | null;
  index: number;
  selected?: boolean;
  anySelected?: boolean;
  onSelect?: () => void;
  onToggle?: () => void;
  expanded?: boolean;
  innerRef?: React.RefObject<HTMLDivElement>;
  isResizing?: boolean;
  onDocumentClick?: (document: any) => void;
  documentCount?: number;
  deal?: {
    DealId?: number;
    ServiceDescription?: string;
    Amount?: number;
    PitchedDate?: string;
    PitchedTime?: string;
    AreaOfWork?: string;
    firstName?: string;
    lastName?: string;
    PitchedBy?: string;
    pitchContent?: {
      EmailSubject?: string;
      EmailBody?: string;
      EmailBodyHtml?: string;
      CreatedAt?: string;
      CreatedBy?: string;
    } | null;
  };
  onDealEdit?: (dealId: number, updates: { ServiceDescription?: string; Amount?: number }) => Promise<void>;
  prospectId?: number;
  eid?: any;
  eids?: any[] | any;
  compliance?: any;
  deals?: any[];
  clients?: any[];
  risk?: any;
  documents?: any[];
  payments?: any[];
  style?: React.CSSProperties;
  onClick?: () => void;
  onProofOfIdClick?: () => void;
  onEIDClick?: () => void;
  /** Invoked to start the Risk Assessment flow when none exists yet */
  onRiskClick?: () => void;
  /** Invoked to edit an existing Risk Assessment */
  onEditRisk?: (instructionRef: string) => void;
  /** Invoked to delete an existing Risk Assessment */
  onDeleteRisk?: (instructionRef: string) => void;
  onOpenMatter?: (instruction: any) => void;
  /** Workbench control functions */
  onOpenWorkbench?: (tab: 'identity' | 'risk' | 'payment' | 'documents' | 'matter' | 'override') => void;
  idVerificationLoading?: boolean;
  /** Callback when ID verification operation completes (success or failure) */
  onIdVerificationComplete?: (result: { success: boolean; status: string; message: string }) => void;
  /** Callback when Risk Assessment operation completes */
  onRiskAssessmentComplete?: (result: { success: boolean; action: 'create' | 'edit' | 'delete'; message: string }) => void;
  /** Callback when Matter Opening operation completes */
  onMatterOpenComplete?: (result: { success: boolean; matterId?: string; message: string }) => void;
  animationDelay?: number;
  getClientNameByProspectId?: (prospectId: string | number | undefined) => { firstName: string; lastName: string };
  teamData?: TeamData[] | null;
  /** Called after successful actions to trigger parent data refresh */
  onRefreshData?: () => void;
}

// Component definition with CopyableText
const CopyableText: React.FC<{ value: string; label?: string; className?: string }> = ({ value, label, className }) => {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <span 
      className={className}
      onClick={handleCopy}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ 
        cursor: 'pointer', 
        position: 'relative',
        padding: '2px 4px',
        borderRadius: '4px',
        transition: 'all 0.2s ease',
        backgroundColor: copied ? 'rgba(67, 160, 71, 0.1)' : (isHovered ? 'rgba(54, 144, 206, 0.1)' : 'transparent'),
        color: copied ? '#43a047' : (isHovered ? colours.cta : 'inherit'),
        border: `1px solid ${copied ? '#43a047' : (isHovered ? colours.cta : 'transparent')}`
      }}
      title={copied ? `Copied "${value}"!` : `Click to copy ${label || 'text'}`}
    >
      {value}
      {copied && (
        <span style={{
          position: 'absolute',
          top: '-30px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#43a047',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          animation: 'fadeInScale 0.2s ease-out'
        }}>
          ✓ Copied!
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '4px solid #43a047'
          }} />
        </span>
      )}
    </span>
  );
};

const InstructionCard: React.FC<InstructionCardProps> = ({
  instruction,
  index,
  selected = false,
  anySelected = false,
  onSelect,
  onToggle,
  expanded = false,
  innerRef,
  isResizing = false,
  onDocumentClick,
  documentCount,
  deal,
  prospectId,
  eid,
  eids,
  compliance,
  deals,
  clients,
  risk,
  documents,
  payments,
  style,
  onClick,
  onEIDClick,
  onRiskClick,
  onEditRisk,
  onDeleteRisk,
  onOpenMatter,
  onOpenWorkbench,
  idVerificationLoading = false,
  animationDelay = 0,
  getClientNameByProspectId,
  onDealEdit,
  teamData,
  onRefreshData,
  onIdVerificationComplete,
  onRiskAssessmentComplete,
  onMatterOpenComplete
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [clickedForActions, setClickedForActions] = useState(false);
  const [isEditingDeal, setIsEditingDeal] = useState(false);
  const [editDealData, setEditDealData] = useState({
    ServiceDescription: '',
    Amount: ''
  });

  // Manual status override state
  const [showStatusOverride, setShowStatusOverride] = useState(false); // TODO: Remove - now handled in WorkbenchPanel
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  
  // Toast state for API feedback
  const [toast, setToast] = useState<{
    show: boolean;
    type: 'success' | 'error';
    message: string;
  }>({ show: false, type: 'success', message: '' });
  const [isSavingDeal, setIsSavingDeal] = useState(false);
  const [activeStep, setActiveStep] = useState<string>('');
  const [showRiskDetails, setShowRiskDetails] = useState(false);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [loadingPaymentDetails, setLoadingPaymentDetails] = useState(false);
  const [paymentData, setPaymentData] = useState<any[]>([]);
  const [showInstructionDetails, setShowInstructionDetails] = useState(false);
  const [loadingInstructionDetails, setLoadingInstructionDetails] = useState(false);
  const [instructionData, setInstructionData] = useState<any>(null);
  const [showDocumentDetails, setShowDocumentDetails] = useState(false);
  // Selected document index for inline preview when documents pill expanded
  const [selectedDocumentIndex, setSelectedDocumentIndex] = useState<number>(0);
  const [fetchedDocuments, setFetchedDocuments] = useState<any[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isVerifyingId, setIsVerifyingId] = useState(false);
  const [showPitchDetails, setShowPitchDetails] = useState(false);
  const resolvedDeal = deal ?? (instruction as any)?.deal ?? null;

  // Use fetched documents if available, otherwise fall back to props
  const documentsToUse = fetchedDocuments.length > 0 ? fetchedDocuments : (documents || []);
  const { isDarkMode } = useTheme();

  // Helper to get initials from team data by full name (kept for potential future use)
  const getInitialsFromTeamData = (fullName: string): string | null => {
    if (!teamData || !fullName) return null;
    
    // First try exact full name match
    let teamMember = teamData.find(member => 
      member['Full Name']?.toLowerCase().trim() === fullName.toLowerCase().trim()
    );
    
    // If no exact match, try initials match
    if (!teamMember) {
      teamMember = teamData.find(member => 
        member.Initials?.toLowerCase() === fullName.toLowerCase()
      );
    }
    
    // If still no match, try first name + last name match
    if (!teamMember) {
      teamMember = teamData.find(member => {
        const first = member.First?.toLowerCase().trim();
        const last = member.Last?.toLowerCase().trim();
        const inputLower = fullName.toLowerCase().trim();
        return first && last && (
          inputLower.includes(first) && inputLower.includes(last)
        );
      });
    }
    
    return teamMember?.Initials || null;
  };

  // Deal edit handlers
  const handleEditDealClick = () => {
    setIsEditingDeal(true);
    setEditDealData({
      ServiceDescription: resolvedDeal?.ServiceDescription || '',
      Amount: resolvedDeal?.Amount?.toString() || ''
    });
  };

  const handleCancelEditDeal = () => {
    setIsEditingDeal(false);
    setEditDealData({
      ServiceDescription: '',
      Amount: ''
    });
  };

  const handleSaveDeal = async () => {
    if (!resolvedDeal?.DealId || !onDealEdit) return;

    setIsSavingDeal(true);
    try {
      const updates: { ServiceDescription?: string; Amount?: number } = {};
      
      if (editDealData.ServiceDescription !== (resolvedDeal?.ServiceDescription || '')) {
        updates.ServiceDescription = editDealData.ServiceDescription;
      }
      
      const newAmount = parseFloat(editDealData.Amount);
      if (!isNaN(newAmount) && newAmount !== (resolvedDeal?.Amount || 0)) {
        updates.Amount = newAmount;
      }

      if (Object.keys(updates).length > 0) {
        await onDealEdit(resolvedDeal.DealId, updates);
        
        // Trigger parent data refresh after successful edit
        if (onRefreshData) {
          onRefreshData();
        }
      }
      
      setIsEditingDeal(false);
    } catch (error) {
      console.error('Failed to save deal:', error);
      // Could add error state here if needed
    } finally {
      setIsSavingDeal(false);
    }
  };

  // Manual status override handlers
  const handleManualStatusOverride = async (status: 'initialised' | 'processing' | 'instructed' | 'pitched', label: string) => {
    const instructionRef = instruction?.InstructionRef;
    if (!instructionRef) return;

    setIsUpdatingStatus(true);
    
    try {
      // Map UI status to database values
      const statusMapping = {
        'initialised': { stage: 'initialised', internalStatus: 'pitch' },
        'processing': { stage: 'proof-of-id-complete', internalStatus: 'poid' },
        'instructed': { stage: 'proof-of-id-complete', internalStatus: 'paid' },
        'pitched': { stage: 'initialised', internalStatus: 'pitch' }
      };

      const { stage, internalStatus } = statusMapping[status];

      const response = await fetch('/api/update-instruction-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instructionRef,
          stage,
          internalStatus,
          overrideReason: `Manual override to ${label} via UI`,
          userInitials: 'UI' // Could get from auth context in production
        })
      });

      const result = await response.json();

      if (result.success) {
        // Update local instruction object to reflect changes immediately
        if (instruction) {
          instruction.Stage = stage;
          instruction.InternalStatus = internalStatus;
          instruction.LastUpdated = new Date().toISOString();
        }

        setToast({
          show: true,
          type: 'success',
          message: `Status updated to ${label}`
        });

        // Auto-hide success toast
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2000);
        
        // Trigger parent data refresh
        if (onRefreshData) {
          onRefreshData();
        }
        
      } else {
        throw new Error(result.error || 'Failed to update status');
      }
      
    } catch (error) {
      console.error('Failed to update instruction status:', error);
      
      setToast({
        show: true,
        type: 'error',
        message: `Failed to update status: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      
      // Auto-hide error toast
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 4000);
    } finally {
      setIsUpdatingStatus(false);
      setShowStatusOverride(false);
    }
  };

  const statusOptions: IDropdownOption[] = [
    { key: 'initialised', text: 'Initialised' },
    { key: 'processing', text: 'ID Completed' },
    { key: 'instructed', text: 'Instructed' },
    { key: 'pitched', text: 'Pitched' }
  ];

  // Matter details fetching removed - handled by WorkbenchPanel

  // Fetch payment details when showPaymentDetails is opened
  useEffect(() => {
    if (showPaymentDetails && (instruction?.InstructionRef || instruction?.instructionRef) && !paymentData.length && !loadingPaymentDetails) {
      setLoadingPaymentDetails(true);
      const instructionRef = instruction.InstructionRef || instruction.instructionRef;
      fetch(`/api/payments/${instructionRef}`)
        .then(response => response.json())
        .then(data => {
          if (data.error) {
            console.error('Payment fetch error:', data.error);
            setPaymentData([]);
          } else {
            setPaymentData(data.payments || []);
          }
        })
        .catch(error => {
          console.error('Error fetching payment details:', error);
          setPaymentData([]);
        })
        .finally(() => {
          setLoadingPaymentDetails(false);
        });
    } else if (!showPaymentDetails && paymentData.length > 0) {
      // Reset payment data when details are closed
      setPaymentData([]);
    }
  }, [showPaymentDetails, instruction?.InstructionRef, instruction?.instructionRef]);

  // Fetch instruction details when showInstructionDetails is opened
  useEffect(() => {
    if (showInstructionDetails && (instruction?.InstructionRef || instruction?.instructionRef) && !instructionData && !loadingInstructionDetails) {
      setLoadingInstructionDetails(true);
      const instructionRef = instruction.InstructionRef || instruction.instructionRef;
      fetch(`/api/instruction-details/${instructionRef}`)
        .then(response => response.json())
        .then(data => {
          if (data.error) {
            console.error('Instruction fetch error:', data.error);
            setInstructionData([]);
          } else {
            setInstructionData(data.instructions || []);
          }
        })
        .catch(error => {
          console.error('Error fetching instruction details:', error);
          setInstructionData([]);
        })
        .finally(() => {
          setLoadingInstructionDetails(false);
        });
    } else if (!showInstructionDetails && instructionData) {
      // Reset instruction data when details are closed
      setInstructionData([]);
    }
  }, [showInstructionDetails, instruction?.InstructionRef, instruction?.instructionRef]);

  // Sync payments prop changes to local state
  useEffect(() => {
    if (payments && payments.length > 0 && paymentData.length === 0 && !showPaymentDetails) {
      // If payments prop is updated and we don't have local data, sync it
      setPaymentData(payments);
    }
  }, [payments]);

  // Sync documents prop changes to local state
  useEffect(() => {
    if (documents && documents.length > 0 && fetchedDocuments.length === 0) {
      // If documents prop is updated and we don't have local fetched data, use prop data
      setFetchedDocuments(documents);
    }
  }, [documents]);

  // Clear local data when instruction changes to force refetch
  useEffect(() => {
    const currentRef = instruction?.InstructionRef || instruction?.instructionRef;
    return () => {
      // Cleanup when instruction changes
      setPaymentData([]);
      setInstructionData(null);
      setFetchedDocuments([]);
    };
  }, [instruction?.InstructionRef, instruction?.instructionRef]);

  // Inject keyframes once for micro animations
  React.useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('instructioncard-pulse')) {
      const styleTag = document.createElement('style');
      styleTag.id = 'instructioncard-pulse';
      styleTag.innerHTML = `
        @keyframes pulseGlow {
          0%{box-shadow:0 0 0 0 rgba(54,144,206,0.55);}
          60%{box-shadow:0 0 0 10px rgba(54,144,206,0);}
          100%{box-shadow:0 0 0 0 rgba(54,144,206,0);}
        }
        @keyframes subtlePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.02); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInScale {
          0% {
            opacity: 0;
            transform: translateX(-50%) scale(0.8);
          }
          100% {
            opacity: 1;
            transform: translateX(-50%) scale(1);
          }
        }
        @keyframes fadeIn {
          0% {
            opacity: 0;
            transform: translateY(-10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        /* Chip hover expand animation */
        .instruction-chip {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        .instruction-chip-label {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        .instruction-chip:hover {
          gap: 6px !important;
          padding: 4px 10px !important;
          box-shadow: 0 2px 6px rgba(54, 144, 206, 0.15) !important;
          opacity: 0.95 !important;
        }
        
        .instruction-chip:hover .instruction-chip-label {
          max-width: 200px !important;
          opacity: 1 !important;
          transform: translateX(0) !important;
        }
        
        .instruction-chip-wrapper.expanded .instruction-chip {
          gap: 6px !important;
          padding: 4px 10px !important;
        }
        
        .instruction-chip-wrapper.expanded .instruction-chip-label {
          max-width: 200px !important;
          opacity: 1 !important;
          transform: translateX(0) !important;
        }
      `;
      document.head.appendChild(styleTag);
    }
  }, []);

  // Fetch documents from API
  useEffect(() => {
    if (instruction?.InstructionRef || instruction?.reference) {
      const instructionRef = instruction.InstructionRef || instruction.reference;
      setIsLoadingDocuments(true);
      
      fetch(`/api/documents/${instructionRef}`)
        .then(response => {
          if (response.ok) {
            return response.json();
          }
          throw new Error(`HTTP ${response.status}`);
        })
        .then(data => {
          setFetchedDocuments(data || []);
        })
        .catch(error => {
          console.warn('Failed to fetch documents from API:', error);
          // Keep using props documents as fallback
        })
        .finally(() => {
          setIsLoadingDocuments(false);
        });
    }
  }, [instruction?.InstructionRef, instruction?.reference]);

  // Status logic - match the logic used in global actions
  // ID Verification status based on EID data
  const eidResult = (eid?.EIDOverallResult || eids?.[0]?.EIDOverallResult || instruction?.EIDOverallResult)?.toLowerCase() ?? "";
  const eidStatus = (eid?.EIDStatus || eids?.[0]?.EIDStatus)?.toLowerCase() ?? "";
  const poidPassed = eidResult === "passed" || eidResult === "approved" || eidResult === "verified" || eidResult === "pass";
  const proofOfIdComplete = Boolean(instruction?.PassportNumber || instruction?.DriversLicenseNumber);
  
  // Also check instruction stage for ID completion
  const stageComplete = instruction?.Stage === 'proof-of-id-complete' || instruction?.stage === 'proof-of-id-complete';
  const stageLower_ = ((instruction?.Stage || instruction?.stage || '') + '').trim().toLowerCase();
  const isInstructedOrLater = stageLower_ === 'proof-of-id-complete' || stageLower_ === 'completed';

  // When a fresh EID result arrives, clear the local "verifying" flag so the
  // chip/pill can reflect the real backend status instead of staying in limbo.
  useEffect(() => {
    if (!isVerifyingId) return;
    if (eidResult || eidStatus) {
      setIsVerifyingId(false);
      
      // Show toast feedback when verification completes
      if (poidPassed || eidResult === 'passed' || eidResult === 'verified') {
        setToast({
          show: true,
          type: 'success',
          message: 'ID verification completed successfully'
        });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
        
        // Notify parent of successful completion
        onIdVerificationComplete?.({
          success: true,
          status: 'complete',
          message: 'ID verification completed successfully'
        });
        
        // Trigger data refresh
        if (onRefreshData) {
          onRefreshData();
        }
      } else if (eidResult === 'review' || eidResult === 'failed') {
        setToast({
          show: true,
          type: 'error',
          message: 'ID verification requires review'
        });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 4000);
        
        onIdVerificationComplete?.({
          success: false,
          status: 'review',
          message: 'ID verification requires manual review'
        });
      }
    }
  }, [eidResult, eidStatus, isVerifyingId, poidPassed, onIdVerificationComplete, onRefreshData]);
  
  let verifyIdStatus: 'pending' | 'received' | 'review' | 'complete';
  if (stageComplete) {
    // If stage shows proof-of-id-complete, check the actual EID result
    if (eidResult === 'review') {
      verifyIdStatus = 'review';
    } else if (eidResult === 'failed' || eidResult === 'rejected' || eidResult === 'fail') {
      verifyIdStatus = 'review'; // Failed results should be treated as review needed
    } else if (poidPassed || eidResult === 'passed') {
      verifyIdStatus = 'complete';  
    } else {
      // Stage complete but no clear result - assume review needed
      verifyIdStatus = 'review';
    }
  } else if ((!eid && !eids?.length) || eidStatus === 'pending') {
    // Only show 'received' if we have actual proof of ID AND EID verification has been attempted
    // If no EID data exists but we have documents, it means verification hasn't been triggered
    const hasEidAttempt = Boolean(eid || (eids && eids.length > 0));
    verifyIdStatus = proofOfIdComplete && hasEidAttempt ? 'received' : 'pending';
  } else if (poidPassed) {
    verifyIdStatus = 'complete';
  } else {
    verifyIdStatus = 'review';
  }

  // Payment status based on payments array
  const getPaymentStatus = () => {    
    // Check if instruction itself is marked as paid (fallback)
    if (instruction?.InternalStatus === 'paid' || instruction?.internalStatus === 'paid') {
      return 'complete';
    }
    
    // Use instruction.payments if available, fallback to payments prop
    const paymentData = instruction?.payments || payments;
    
    if (!paymentData || paymentData.length === 0) {
      return 'pending';
    }
    
    // Get the most recent payment
    const latestPayment = paymentData[0]; // Already sorted by created_at DESC in API
    
    // A payment is complete if:
    // - payment_status is 'succeeded', 'confirmed', or 'requires_capture' AND internal_status is 'completed' or 'paid'
    // - OR internal_status is 'completed' or 'paid' regardless of payment_status
    if ((latestPayment.payment_status === 'succeeded' || 
         latestPayment.payment_status === 'confirmed' ||
         latestPayment.payment_status === 'requires_capture') && 
        (latestPayment.internal_status === 'completed' || latestPayment.internal_status === 'paid')) {
      return 'complete';
    }
    // Also mark as complete if internal_status shows completion even without gateway success
    if (latestPayment.internal_status === 'completed' || latestPayment.internal_status === 'paid') {
      return 'complete';
    }
    // Explicitly surface processing status when gateway reports it
    if (latestPayment.payment_status === 'processing') {
      return 'processing';
    }

    return 'pending';
  };
  
  const paymentStatus = getPaymentStatus();
  // Payment evidence exists only if there's at least one payment record with gateway success or internal completion on that record
  const paymentRecords = (instruction?.payments || payments || []) as any[];
  const hasPaymentEvidence = paymentRecords.some(p => 
    (p.payment_status && String(p.payment_status).toLowerCase() === 'succeeded') ||
    (p.internal_status && ['completed','paid'].includes(String(p.internal_status).toLowerCase()))
  );
  const fastTrackedPayment = isInstructedOrLater && !hasPaymentEvidence;
  const fastTrackedId = isInstructedOrLater && !poidPassed;

  // Documents status - neutral if none required, green if at least one uploaded, pending if required but missing
  const documentStatus = (documentsToUse && documentsToUse.length > 0) ? 'complete' : 'neutral';

  // Risk status based on risk assessment result
  const riskResultRaw = risk?.RiskAssessmentResult?.toString().toLowerCase() ?? "";
  const riskStatus = riskResultRaw
    ? ['low', 'low risk', 'pass', 'approved'].includes(riskResultRaw) ? 'complete' : 'review'
    : 'pending';
  // A pill is considered to have an assessment only if key fields exist
  const hasRiskAssessment = Boolean(
    risk && (risk.RiskAssessmentResult || risk.RiskScore || risk.ComplianceDate || risk.RiskAssessor)
  );

  // Matter status - check if matter exists
  const matterStatus = (instruction?.MatterId || (instruction as any)?.matters?.length > 0) ? 'complete' : 'pending';

  // CCL status - assume pending unless explicitly complete
  const cclStatus = instruction?.CCLSubmitted ? 'complete' : 'pending';

  // Track previous status values for detecting transitions
  const prevRiskStatusRef = useRef<string>(riskStatus);
  const prevMatterStatusRef = useRef<string>(matterStatus);
  const prevHasRiskAssessmentRef = useRef<boolean>(hasRiskAssessment);

  // Effect to detect risk assessment status change and show toast
  useEffect(() => {
    const prevRisk = prevRiskStatusRef.current;
    const prevHasRisk = prevHasRiskAssessmentRef.current;
    
    // Detect new risk assessment creation (pending -> complete/review, or !hasRisk -> hasRisk)
    if (!prevHasRisk && hasRiskAssessment) {
      setToast({
        show: true,
        type: riskStatus === 'complete' ? 'success' : 'error',
        message: riskStatus === 'complete' 
          ? 'Risk assessment completed - Low Risk' 
          : 'Risk assessment completed - Review Required'
      });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
      
      onRiskAssessmentComplete?.({
        success: true,
        action: 'create',
        message: `Risk assessment created: ${risk?.RiskAssessmentResult || 'Assessed'}`
      });
      
      // Trigger data refresh
      if (onRefreshData) {
        onRefreshData();
      }
    }
    // Detect risk status change (e.g., from review to complete after edit)
    else if (prevRisk !== riskStatus && prevHasRisk && hasRiskAssessment && prevRisk !== 'pending') {
      setToast({
        show: true,
        type: riskStatus === 'complete' ? 'success' : 'error',
        message: riskStatus === 'complete' 
          ? 'Risk assessment updated - Low Risk' 
          : 'Risk assessment updated - Review Required'
      });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
      
      onRiskAssessmentComplete?.({
        success: true,
        action: 'edit',
        message: `Risk assessment updated: ${risk?.RiskAssessmentResult || 'Updated'}`
      });
    }
    // Detect risk assessment deletion (hasRisk -> !hasRisk)
    else if (prevHasRisk && !hasRiskAssessment) {
      setToast({
        show: true,
        type: 'success',
        message: 'Risk assessment deleted'
      });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
      
      onRiskAssessmentComplete?.({
        success: true,
        action: 'delete',
        message: 'Risk assessment deleted successfully'
      });
    }
    
    // Update refs
    prevRiskStatusRef.current = riskStatus;
    prevHasRiskAssessmentRef.current = hasRiskAssessment;
  }, [riskStatus, hasRiskAssessment, risk?.RiskAssessmentResult, onRiskAssessmentComplete, onRefreshData]);

  // Effect to detect matter opening completion and show toast
  useEffect(() => {
    const prevMatter = prevMatterStatusRef.current;
    
    // Detect matter opened (pending -> complete)
    if (prevMatter === 'pending' && matterStatus === 'complete') {
      const matterId = instruction?.MatterId || (instruction as any)?.matters?.[0]?.MatterId;
      
      setToast({
        show: true,
        type: 'success',
        message: matterId ? `Matter ${matterId} opened successfully` : 'Matter opened successfully'
      });
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
      
      onMatterOpenComplete?.({
        success: true,
        matterId: matterId,
        message: matterId ? `Matter ${matterId} opened successfully` : 'Matter opened successfully'
      });
      
      // Trigger data refresh
      if (onRefreshData) {
        onRefreshData();
      }
    }
    
    // Update ref
    prevMatterStatusRef.current = matterStatus;
  }, [matterStatus, instruction?.MatterId, instruction, onMatterOpenComplete, onRefreshData]);

  // New pre-ID step: Instruction/Pitch capture (integrated from pitches). Complete if a deal/service exists.
  const hasDeal = !!resolvedDeal;

  // Calculate instruction completion progress (0-100)
  const calculateInstructionProgress = (): number => {
    if (isPitchedDeal) {
      // For pitched deals, only count the deal itself as progress
      return hasDeal ? 100 : 0;
    }
    
    const completedSteps = [
      verifyIdStatus === 'complete',
      paymentStatus === 'complete',
      (documentsToUse?.length ?? 0) > 0,
      riskStatus === 'complete',
      matterStatus === 'complete'
    ].filter(Boolean).length;
    
    return (completedSteps / 5) * 100;
  };

  // Pitch date formatting (used for timeline status & detail) – use local time and fallback to deal when missing
  let pitchWhen: string | null = null;
  try {
    const combineLocal = (dateStr?: string, timeStr?: string): Date | null => {
      if (!dateStr && !timeStr) return null;
      if (dateStr) {
        const d = new Date(dateStr);
        if (timeStr) {
          const t = new Date(timeStr);
          // Use local hours/minutes to respect user's timezone
          const h = t.getHours();
          const m = t.getMinutes();
          const s = t.getSeconds();
          d.setHours(h, m, s, 0);
        }
        return isNaN(d.getTime()) ? null : d;
      }
      const onlyT = new Date(timeStr as string);
      return isNaN(onlyT.getTime()) ? null : onlyT;
    };

    let dt: Date | null = null;
    if (instruction?.SubmissionDate || instruction?.SubmissionTime) {
      dt = combineLocal(instruction?.SubmissionDate, instruction?.SubmissionTime);
    }
    if (!dt && (resolvedDeal?.PitchedDate || resolvedDeal?.PitchedTime)) {
      dt = combineLocal(resolvedDeal?.PitchedDate, resolvedDeal?.PitchedTime);
    }
    if (dt && !isNaN(dt.getTime())) {
      const now = new Date();
      const sameDay = dt.getFullYear()===now.getFullYear() && dt.getMonth()===now.getMonth() && dt.getDate()===now.getDate();
      pitchWhen = sameDay ? format(dt,'HH:mm') : format(dt,'d MMM');
    }
  } catch {/* ignore */}

  const isCompleted = cclStatus === 'complete';

  // Get area color (same logic as enquiry cards)
  const getAreaColor = (area: string): string => {
    switch (area?.toLowerCase()) {
      case 'commercial':
        return colours.blue;
      case 'construction':
        return colours.orange;
      case 'property':
        return colours.green;
      case 'employment':
        return colours.yellow;
      case 'other':
      case 'other/unsure':
        return colours.greyText;
      default:
        return colours.greyText; // Changed from colours.cta to colours.greyText
    }
  };

  // Get area icon (same logic as enquiry badges)
  const getAreaIcon = (area: string): string => {
    switch (area?.toLowerCase()) {
      case 'commercial':
        return 'CityNext';
      case 'construction':
        return 'Build';
      case 'property':
        return 'Home';
      case 'employment':
        return 'People';
      case 'other':
      case 'other/unsure':
        return 'Help';
      default:
        return 'Help';
    }
  };

  // Normalize area text for display
  const getAreaDisplayText = (area: string): string => {
    const normalized = area?.toLowerCase() || '';
    if (normalized === 'other/unsure' || normalized === 'other' || normalized.includes('other') || normalized.includes('unsure')) {
      return 'Other';
    }
    return area;
  };

  // Get area of work from deals (linked by InstructionRef)
  const areaOfWork = 
    // Try direct instruction field first
    instruction?.AreaOfWork || instruction?.Area_of_Work || instruction?.areaOfWork || 
    instruction?.area_of_work || instruction?.ServiceType || instruction?.serviceType || 
    instruction?.Type || instruction?.type ||
    // Try deal prop
    resolvedDeal?.AreaOfWork ||
    // Try deals array (get first deal's area)
    (deals && deals.length > 0 ? deals[0].AreaOfWork : '') ||
    // Fallback to empty string
    '';
  
  // Determine if this is a pitched deal (no instruction yet)
  const isPitchedDeal = !instruction && Boolean(resolvedDeal);

  const pitchSourceFromDeal = resolvedDeal
    ? (resolvedDeal as any)?.pitchContent ?? (resolvedDeal as any)?.PitchContent ?? (resolvedDeal as any)?.pitch ?? (resolvedDeal as any)?.Pitch
    : null;
  const pitchSourceFromInstruction = instruction
    ? (instruction as any)?.pitchContent ?? (instruction as any)?.PitchContent ?? null
    : null;

  const normalizedPitch = useMemo(() => {
    const fromDeal = coercePitchContent(pitchSourceFromDeal);
    if (fromDeal) return fromDeal;
    return coercePitchContent(pitchSourceFromInstruction);
  }, [pitchSourceFromDeal, pitchSourceFromInstruction]);

  const pitchSubject: string | undefined =
    normalizedPitch?.EmailSubject ||
    normalizedPitch?.subject ||
    (resolvedDeal as any)?.EmailSubject ||
    (resolvedDeal as any)?.emailSubject ||
    (resolvedDeal as any)?.subject ||
    (resolvedDeal as any)?.Subject;
  const pitchBodyHtml: string | undefined =
    normalizedPitch?.EmailBodyHtml ||
    normalizedPitch?.bodyHtml ||
    (resolvedDeal as any)?.EmailBodyHtml ||
    (resolvedDeal as any)?.emailBodyHtml;
  const pitchBody: string | undefined =
    normalizedPitch?.EmailBody ||
    normalizedPitch?.body ||
    (resolvedDeal as any)?.EmailBody ||
    (resolvedDeal as any)?.emailBody;
  const effectivePitchSubject = pitchSubject?.trim() ? pitchSubject.trim() : undefined;
  const hasPitchDetails = Boolean(effectivePitchSubject || pitchBody || pitchBodyHtml);
  const canExpandPitchDetails = hasDeal && hasPitchDetails;
  const instructionCaptureStatus = hasDeal ? 'complete' : 'pending';
  
  const areaColor = getAreaColor(areaOfWork);
  const areaIcon = getAreaIcon(areaOfWork);

  const solicitorContact = useMemo(() => {
    const candidates = [
      instruction?.HelixContact,
      instruction?.Solicitor,
      instruction?.AssignedTo,
      instruction?.Handler,
      instruction?.PointOfContact,
      instructionData?.HelixContact,
      resolvedDeal?.PitchedBy,
    ];

    const found = candidates.find(
      (value) => typeof value === 'string' && value.trim().length > 0,
    );

    return typeof found === 'string' ? found.trim() : null;
  }, [instruction, instructionData, resolvedDeal]);

  const normalizedSolicitor = solicitorContact?.toLowerCase() ?? '';
  // Generic contact identifiers used to detect unclaimed/placeholder contacts
  const GENERIC_CONTACT_IDENTIFIERS = new Set<string>([
    'admin',
    'helix',
    'team',
    'unassigned',
    'info',
    'support'
  ]);
  const isGenericContact = normalizedSolicitor && GENERIC_CONTACT_IDENTIFIERS.has(normalizedSolicitor);
  const isClaimedInstruction = Boolean(!isPitchedDeal && solicitorContact && !isGenericContact);

  // Determine next action step
  // For pitched deals, use different logic
  if (isPitchedDeal) {
    // Pitched deals get pitch-specific actions
  } else {
    // Normal instruction workflow
  }
  
  // Initialised status - if instruction exists but no other progress
  const isInitialised = instruction?.InstructionRef && !hasDeal && !proofOfIdComplete && 
                       (!instruction?.payments || instruction?.payments.length === 0) &&
                       (!documents || documents.length === 0);

  // Determine the pitch stage - one bubble that changes
  const getPitchStage = () => {
    // Normalise stage and internal status for robust matching
    const stageLower = (instruction?.Stage || instruction?.stage || '').toLowerCase();
    const internalStatus = (instruction?.InternalStatus || instruction?.internalStatus || '').toLowerCase();
    
    // Check if this was manually overridden (has OverrideReason)
    const isManualOverride = instruction?.OverrideReason;
    
    // Instructed: proof-of-id-complete stage with paid status indicates fully instructed
    if (instruction?.InstructionRef && stageLower === 'proof-of-id-complete') {
      if (internalStatus === 'paid') {
        return { 
          key: 'instructed', 
          label: isManualOverride ? 'Instructed*' : 'Instructed', 
          icon: isManualOverride ? <FaUserEdit /> : <FaIdBadge />, 
          colour: colours.green 
        };
      } else {
        // proof-of-id-complete but not paid - all cases show as ID Completed
        return { 
          key: 'processing', 
          label: isManualOverride ? 'ID Completed*' : 'ID Completed', 
          icon: isManualOverride ? <FaUserEdit /> : <FaSpinner />, 
          colour: colours.orange 
        };
      }
    }
    
    // Initialised for cases without proof-of-id-complete (including pitch status without ID completion)
    if (instruction?.InstructionRef && stageLower === 'initialised') {
      return { 
        key: 'initialised', 
        label: isManualOverride ? 'Initialised*' : 'Initialised', 
        icon: isManualOverride ? <FaUserEdit /> : <FaPlayCircle />, 
        colour: colours.blue 
      };
    }
    
    // Pitched = deal exists (pitch sent)
    if (hasDeal) {
      const label = pitchWhen ? `Pitched ${pitchWhen}` : 'Pitched';
      const overrideLabel = isManualOverride ? `${label}*` : label;
      return { 
        key: 'pitched', 
        label: overrideLabel, 
        icon: isManualOverride ? <FaUserEdit /> : <FaEnvelope />, 
        colour: colours.greyText 
      };
    }
    
    // Default state
    return { key: 'pitched', label: 'Pitched', icon: <FaEnvelope />, colour: colours.greyText };
  };

  const pitchStage = getPitchStage();

  const nextActionStep = isPitchedDeal 
    ? null // Pitched deals don't have an auto-active next action
    : isInitialised ? 'initialised' :
    instructionCaptureStatus !== 'complete' ? 'instruction' :
    verifyIdStatus !== 'complete' ? 'id' :
    paymentStatus !== 'complete' ? 'payment' :
    riskStatus !== 'complete' ? 'risk' :
    matterStatus !== 'complete' ? 'matter' :
    cclStatus !== 'complete' ? 'ccl' : null;

  // Get next action label and icon
  const getNextActionDetails = (step: string) => {
    const actionMap = {
      'follow-up': { label: 'Follow Up', icon: <FaPhone /> },
      'send-reminder': { label: 'Send Reminder', icon: <FaEnvelope /> },
      'schedule-call': { label: 'Schedule Call', icon: <FaCalendarAlt /> },
      'initialised': { label: 'Awaiting Instructions', icon: <FaInfoCircle /> },
      'instruction': { label: 'Complete Instructions', icon: <FaFileAlt /> },
      'id': { label: 'Verify Identity', icon: <FaIdCard /> },
      'payment': { label: 'Process Payment', icon: <FaPoundSign /> },
      'documents': { label: 'Upload Documents', icon: <FaFileUpload /> },
      'risk': { label: 'Risk Assessment', icon: <FaShieldAlt /> },
      'matter': { label: 'Create Matter', icon: <FaFolder /> },
      'ccl': { label: 'Complete CCL', icon: <FaClipboardCheck /> }
    };
    return actionMap[step as keyof typeof actionMap] || null;
  };

  const nextActionDetails = nextActionStep ? getNextActionDetails(nextActionStep) : null;

  // Do not auto-open details; only highlight nextActionStep via pulse.

  // Visual styling – simplified, gradient background for legibility
  const bgGradientLight = 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)';
  const bgGradientDark = 'linear-gradient(135deg, #151a22 0%, #11161d 100%)';
  
  // Code-like dark mode with high contrast, minimal gradients/shadows
  const selectedBg = isDarkMode 
    ? `#1e293b` // Solid dark blue-grey for code-like feel
    : `linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)`;
  
  const cardBorderColor = isDarkMode 
    ? colours.accent 
    : (isPitchedDeal ? colours.highlight : colours.missedBlue);
  
  const selectedBorder = isDarkMode
    ? `1px solid ${cardBorderColor}`
    : `1px solid ${cardBorderColor}`;
    
  const selectedShadow = isDarkMode
    ? `0 1px 3px rgba(0,0,0,0.8)` // Minimal shadow in dark mode
    : `0 8px 32px ${cardBorderColor}25, 0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)`;
  
  const cardClass = mergeStyles({
    position: 'relative',
    borderRadius: 8,
    padding: '12px 18px',
    background: selected 
      ? selectedBg
      : (isDarkMode ? '#0f172a' : bgGradientLight), // Solid dark background instead of gradient
    opacity: anySelected && !selected ? 0.8 : 1,
    // Responsive padding
    '@media (max-width: 768px)': {
      padding: '10px 14px',
    },
    '@media (max-width: 480px)': {
      padding: '8px 12px',
      borderRadius: 6,
    },
    border: selected || clickedForActions 
      ? selectedBorder
      : `1px solid ${isDarkMode ? 'rgba(148,163,184,0.2)' : 'rgba(0,0,0,0.08)'}`,
    borderLeft: `2px solid ${cardBorderColor}${selected ? '' : (isDarkMode ? '' : '60')}`,
    boxShadow: selected
      ? selectedShadow
      : (isDarkMode ? 'none' : '0 4px 6px rgba(0, 0, 0, 0.07)'),
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontFamily: 'Raleway, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    marginBottom: 4,
    overflow: 'hidden',
    // Remove vertical translate to avoid perceived size shift on selection
    transform: 'none',
    selectors: {
      ':hover': {
        // no transform on hover
        boxShadow: selected 
          ? (isDarkMode ? `0 2px 8px rgba(0,0,0,0.9)` : `0 12px 40px ${cardBorderColor}50, 0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)`)
          : (isDarkMode ? '0 1px 3px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.12)'),
        border: `1px solid ${cardBorderColor}`,
        borderLeft: `2px solid ${cardBorderColor}`,
      },
      ':active': { },
      ':focus-within': { 
        outline: `2px solid ${cardBorderColor}40`,
        outlineOffset: '2px',
        borderColor: cardBorderColor 
      },
    },
  });

  const style_: React.CSSProperties = {
    '--animation-delay': `${animationDelay}s`,
  } as React.CSSProperties;

  const summaryIsInteractive = canExpandPitchDetails && !isEditingDeal;

  const dealSummaryInteractionProps: React.HTMLAttributes<HTMLDivElement> = summaryIsInteractive
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-expanded': showPitchDetails,
        onClick: (event) => {
          event.stopPropagation();
          setShowPitchDetails((prev) => !prev);
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            setShowPitchDetails((prev) => !prev);
          }
        }
      }
    : {};

  useEffect(() => {
    if (!summaryIsInteractive && showPitchDetails) {
      setShowPitchDetails(false);
    }
  }, [summaryIsInteractive, showPitchDetails]);

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // If this is the next action step for matter, open the workbench matter tab
    if (nextActionStep === 'matter' && instruction) {
      if (onOpenWorkbench) {
        onOpenWorkbench('matter');
      } else if (onOpenMatter) {
        onOpenMatter(instruction);
      }
      return;
    }
    
    // If there's a general onClick handler and it's not a pitched deal, call it
    if (onClick && !isPitchedDeal) {
      onClick();
      return;
    }
    
    // Toggle clicked state for actions visibility in pitches
    if (isPitchedDeal) {
      setClickedForActions(!clickedForActions);
      setShowDetails(!clickedForActions);
    }
    
    if (onSelect) {
      onSelect();
    } else if (onToggle) {
      onToggle();
    }
  };

  return (
    <div
      className={cardClass}
      style={style_}
      onClick={handleCardClick}
      ref={innerRef}
      onMouseEnter={() => { setIsHovered(true); setShowDetails(true); }}
      onMouseLeave={() => { setIsHovered(false); if (!selected && !clickedForActions) setShowDetails(false); }}
    >
      {/* Selection Toggle (checkbox style) */}
      {onToggle && (
        <button
          aria-label={selected ? 'Deselect instruction' : 'Select instruction'}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={mergeStyles({
            position: 'absolute',
            top: 10,
            left: 10,
            width: 18,
            height: 18,
            borderRadius: 4,
            border: `1.5px solid ${selected ? colours.blue : (isDarkMode ? 'rgba(255,255,255,0.25)' : '#c3c9d4')}`,
            background: selected ? colours.blue : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            zIndex: 10,
            selectors: {
              ':hover': {
                borderColor: colours.blue,
                background: selected ? colours.blue : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(54, 144, 206, 0.1)'),
                // no scale transform on hover
              },
              ':focus': {
                outline: `2px solid ${colours.blue}40`,
                outlineOffset: '2px'
              }
            }
          })}
        >
          {selected && <Icon iconName="CheckMark" styles={{ root: { fontSize: 12, color: '#fff' } }} />}
        </button>
      )}
      
  {/* Header: Primary identifier + area chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, paddingLeft: onToggle ? 26 : 0, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Client Type Icon */}
          {instruction?.ClientType === 'Company' ? (
            <FaBuilding style={{ 
              color: selected ? colours.blue : (isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)'), 
              fontSize: '12px',
              transition: 'color 0.2s ease'
            }} />
          ) : (
            <FaUser style={{ 
              color: selected ? colours.blue : (isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)'), 
              fontSize: '12px',
              transition: 'color 0.2s ease'
            }} />
          )}
          <span style={{ 
            fontWeight: 700, 
            color: selected 
              ? (isDarkMode ? '#ffffff' : colours.darkBlue) 
              : (isDarkMode ? '#fff' : '#0d2538'), 
            lineHeight: 1.2, 
            fontSize: '15px',
            transition: 'color 0.3s ease',
            textShadow: selected 
              ? (isDarkMode ? '0 1px 2px rgba(0,0,0,0.3)' : '0 1px 2px rgba(255,255,255,0.8)') 
              : 'none'
          }}>
          {(() => {
            // Helpers to source person name from various places
            const getEnquiryPersonName = (): string | undefined => {
              if (getClientNameByProspectId && prospectId) {
                const clientName = getClientNameByProspectId(prospectId);
                if (clientName.firstName?.trim() || clientName.lastName?.trim()) {
                  return `${clientName.firstName || ''} ${clientName.lastName || ''}`.trim();
                }
              }
              return undefined;
            };

            const getDealPersonName = (): string | undefined => {
              if (isPitchedDeal && resolvedDeal) {
                const dealFirstName = (resolvedDeal as any).firstName || '';
                const dealLastName = (resolvedDeal as any).lastName || '';
                if (dealFirstName || dealLastName) {
                  return `${dealFirstName} ${dealLastName}`.trim();
                }
              }
              return undefined;
            };

            // If we have an instruction, prefer its context to decide formatting
            if (instruction) {
              const firstName = instruction?.Forename || instruction?.FirstName || instruction?.forename || instruction?.firstName || '';
              const lastName = instruction?.Surname || instruction?.LastName || instruction?.surname || instruction?.lastName || '';
              const fullName = instruction?.FullName || instruction?.fullName || instruction?.Name || instruction?.name || '';
              const company = instruction?.Company || instruction?.CompanyName || instruction?.company || instruction?.companyName || '';

              const personName: string | undefined = (fullName || (firstName || lastName ? `${firstName} ${lastName}`.trim() : '')) || getEnquiryPersonName() || getDealPersonName();

              if (instruction.ClientType === 'Company') {
                // Company client: company first; make person name visually subtler
                const subtleColour = isDarkMode ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.6)';
                if (company && personName) {
                  return (
                    <>
                      <span
                        style={{ fontWeight: 800, cursor: 'pointer' }}
                        title={`Click to copy company: ${company}`}
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(company); }}
                      >
                        {company}
                      </span>
                      <span
                        style={{ color: subtleColour, fontWeight: 500, fontSize: '13px', cursor: 'pointer' }}
                        title={`Click to copy name: ${personName}`}
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(personName); }}
                      >
                        {' '}— {personName}
                      </span>
                    </>
                  );
                }
                if (company) return (
                  <span
                    style={{ fontWeight: 800, cursor: 'pointer' }}
                    title={`Click to copy company: ${company}`}
                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(company); }}
                  >
                    {company}
                  </span>
                );
                if (personName) return (
                  <span
                    style={{ color: subtleColour, fontWeight: 600, cursor: 'pointer' }}
                    title={`Click to copy name: ${personName}`}
                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(personName); }}
                  >
                    {personName}
                  </span>
                );
              } else {
                // Individual client: prefer person name, fallback to company if set
                if (personName) return personName;
                if (company) return company;
              }
            }

            // No instruction context: try enquiry lookup, then deal
            const fallbackName = getEnquiryPersonName() || getDealPersonName();
            if (fallbackName) return fallbackName;

            // Fallback to prospect ID only if no name found
            return `Client ${prospectId}`;
          })()}
          </span>
        </div>
      </div>

      {/* Date and Area badge - top right positioned like enquiry cards */}
      <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 8,
        background: isDarkMode 
          ? 'rgba(15, 23, 42, 0.95)' 
          : 'rgba(255, 255, 255, 0.95)',
        border: `1px solid ${areaColor}`,
        fontSize: 10.5,
        fontWeight: 500,
        opacity: 0.97,
        transform: selected ? 'translateX(0) scale(1)' : 'translateX(0) scale(1)',
        transition: 'opacity 0.35s, transform 0.35s, background 0.3s, border-color 0.3s',
        boxShadow: 'none',
        zIndex: 1
      }}>
        {/* Area badge with dropdown */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: areaColor,
              padding: '2px 4px',
              borderRadius: 5,
              cursor: 'pointer',
              transition: '0.2s',
              background: 'transparent',
              opacity: 1,
              pointerEvents: 'auto'
            }}
          >
            <Icon 
              iconName={areaIcon} 
              styles={{ 
                root: { 
                  fontSize: '12px', 
                  color: areaColor
                } 
              }} 
            />
            <span style={{ 
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontSize: 10.5,
              fontWeight: 600
            }}>
              {getAreaDisplayText(areaOfWork)}
            </span>
            <Icon 
              iconName="ChevronDown" 
              styles={{ 
                root: { 
                  fontSize: '10px', 
                  color: areaColor
                } 
              }} 
            />
          </div>
        </div>

        {/* Separator dot */}
        <span style={{
          width: 2,
          height: 2,
          borderRadius: '50%',
          background: `${areaColor}50`
        }} />

        {/* Date chips */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
          whiteSpace: 'nowrap',
          color: isDarkMode ? 'rgba(255,255,255,0.65)' : 'rgba(76, 90, 110, 0.85)',
          fontSize: '9.5px'
        }}>
          {(() => {
            // Get instruction date
            const instructionDate = instruction?.Date_Created || instruction?.date_created || instruction?.InstructionDate || instruction?.instructionDate || instruction?.Created_Date || instruction?.DateCreated || resolvedDeal?.PitchedDate;
            if (instructionDate) {
              try {
                const date = new Date(instructionDate);
                if (!isNaN(date.getTime())) {
                  const formattedDate = format(date, 'd MMM');
                  const relativeTime = formatDistanceToNow(date, { addSuffix: false })
                    .replace(' days', 'd').replace(' day', 'd')
                    .replace(' weeks', 'w').replace(' week', 'w')
                    .replace(' months', 'm').replace(' month', 'm')
                    .replace(' years', 'y').replace(' year', 'y')
                    .replace('about ', '').replace('over ', '~')
                    .toUpperCase();
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <span style={{
                        whiteSpace: 'nowrap',
                        color: isDarkMode ? 'rgba(255,255,255,0.88)' : 'rgba(18, 34, 54, 0.88)'
                      }}>
                        {formattedDate}
                      </span>
                      <span style={{
                        fontSize: '9.5px',
                        color: 'rgba(117, 132, 158, 0.95)',
                        fontWeight: 500,
                        letterSpacing: '0.5px',
                        userSelect: 'all',
                        fontFamily: 'Consolas, Monaco, monospace',
                        background: 'rgba(148, 174, 220, 0.12)',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        display: 'inline-block',
                        whiteSpace: 'nowrap',
                        verticalAlign: 'middle',
                        opacity: 0.95
                      }}
                      title={instructionDate}
                      >
                        {relativeTime}
                      </span>
                    </div>
                  );
                }
              } catch (e) {
                // Invalid date
              }
            }
            return null;
          })()}
        </div>
      </div>

      {/* Meta: contact + identifiers (chips) */}
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          opacity: selected ? 1 : 0.85,
          transition: 'opacity 0.3s ease',
          marginTop: 4,
          marginLeft: onToggle ? 26 : 0,
          flexWrap: 'wrap'
        }}>
        {(() => {
          const email = instruction?.Email || instruction?.email || (resolvedDeal as any)?.LeadClientEmail || (instruction as any)?.LeadClientEmail;
          const phone = instruction?.Phone || instruction?.phone || (resolvedDeal as any)?.Phone || (instruction as any)?.PhoneNumber || (instruction as any)?.ContactNumber;
          const instructionRefVal = instruction?.InstructionRef || instruction?.instructionRef || instruction?.ref || instruction?.Ref;
          const prospectVal = prospectId;
          const contactValue = solicitorContact;

          const chipBase = {
            color: isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)',
            fontSize: '11px',
            cursor: 'pointer' as const,
            padding: '3px 6px',
            borderRadius: '4px',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            border: 'none',
            backgroundColor: 'transparent',
            boxShadow: 'none',
            fontWeight: 400
          };

          const onHover = (el: HTMLElement) => {
            el.style.color = isDarkMode ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.7)';
            el.style.backgroundColor = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
          };
          const onLeave = (el: HTMLElement) => {
            el.style.color = isDarkMode ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
            el.style.backgroundColor = 'transparent';
          };
          
          return (
            <>
              {email && (
                <div
                  style={{ ...chipBase, maxWidth: 'unset' }}
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(email); }}
                  onMouseEnter={(e) => onHover(e.currentTarget)}
                  onMouseLeave={(e) => onLeave(e.currentTarget)}
                  title={`Click to copy email: ${email}`}
                >
                  <FaEnvelope style={{ 
                    fontSize: '11px', 
                    color: 'inherit',
                    transition: 'color 0.2s ease',
                    opacity: 0.7
                  }} />
                  <span style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: '10px' }}>{email}</span>
                </div>
              )}
              {phone && (
                <div
                  style={chipBase}
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(phone); }}
                  onMouseEnter={(e) => onHover(e.currentTarget)}
                  onMouseLeave={(e) => onLeave(e.currentTarget)}
                  title={`Click to copy phone: ${phone}`}
                >
                  <FaPhone style={{ 
                    fontSize: '11px', 
                    color: 'inherit',
                    transition: 'color 0.2s ease',
                    opacity: 0.7
                  }} />
                  <span style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: '10px' }}>{phone}</span>
                </div>
              )}
              {instructionRefVal && (
                <div
                  style={chipBase}
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(String(instructionRefVal)); }}
                  onMouseEnter={(e) => onHover(e.currentTarget)}
                  onMouseLeave={(e) => onLeave(e.currentTarget)}
                  title={`Instruction Ref: ${instructionRefVal}`}
                >
                  <FaFileAlt style={{ 
                    fontSize: '11px',
                    color: 'inherit',
                    opacity: 0.7
                  }} />
                  <span style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: '10px' }}>{instructionRefVal}</span>
                </div>
              )}
              {prospectVal && (
                <div
                  style={chipBase}
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(String(prospectVal)); }}
                  onMouseEnter={(e) => onHover(e.currentTarget)}
                  onMouseLeave={(e) => onLeave(e.currentTarget)}
                  title={`Prospect ID: ${prospectVal}`}
                >
                  <svg 
                    width="11" 
                    height="11" 
                    viewBox="0 0 66.45 100" 
                    style={{ 
                      fill: 'currentColor',
                      opacity: 0.7
                    }}
                  >
                    <path d="m.33,100c0-3.95-.23-7.57.13-11.14.12-1.21,1.53-2.55,2.68-3.37,6.52-4.62,13.15-9.1,19.73-13.64,10.22-7.05,20.43-14.12,30.64-21.18.21-.14.39-.32.69-.57-5.82-4.03-11.55-8-17.27-11.98C25.76,30.37,14.64,22.57,3.44,14.88.97,13.19-.08,11.07.02,8.16.1,5.57.04,2.97.04,0c.72.41,1.16.62,1.56.9,10.33,7.17,20.66,14.35,30.99,21.52,9.89,6.87,19.75,13.79,29.68,20.59,3.26,2.23,4.78,5.03,3.97,8.97-.42,2.05-1.54,3.59-3.24,4.77-8.94,6.18-17.88,12.36-26.82,18.55-10.91,7.55-21.82,15.1-32.73,22.65-.98.68-2,1.32-3.12,2.05Z"/>
                    <path d="m36.11,48.93c-2.74,1.6-5.04,3.21-7.56,4.35-2.25,1.03-4.37-.1-6.27-1.4-5.1-3.49-10.17-7.01-15.25-10.53-2.01-1.39-4.05-2.76-5.99-4.25-.5-.38-.91-1.17-.96-1.8-.13-1.59-.06-3.19-.03-4.79.02-1.32.25-2.57,1.57-3.27,1.4-.74,2.72-.36,3.91.46,3.44,2.33,6.85,4.7,10.26,7.06,6.22,4.3,12.43,8.6,18.65,12.91.39.27.76.57,1.67,1.25Z"/>
                  </svg>
                  <span style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: '10px' }}>{prospectVal}</span>
                </div>
              )}
              {contactValue && (
                <div
                  style={chipBase}
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(String(contactValue)); }}
                  onMouseEnter={(e) => onHover(e.currentTarget)}
                  onMouseLeave={(e) => onLeave(e.currentTarget)}
                  title={`Solicitor/Contact: ${contactValue}`}
                >
                  <FaUser style={{ 
                    fontSize: '11px',
                    color: 'inherit',
                    opacity: 0.7
                  }} />
                  <span style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: '11px' }}>
                    {(() => {
                      if (!teamData) return contactValue;
                      
                      // Try multiple lookup strategies to find the correct team member
                      let teamMember = null;
                      
                      // 1. Exact full name match
                      teamMember = teamData.find(member => 
                        member['Full Name']?.toLowerCase().trim() === contactValue.toLowerCase().trim()
                      );
                      
                      // 2. Exact initials match
                      if (!teamMember) {
                        teamMember = teamData.find(member => 
                          member.Initials?.toLowerCase() === contactValue.toLowerCase()
                        );
                      }
                      
                      // 3. Partial name match (for cases where solicitorContact is part of full name)
                      if (!teamMember) {
                        teamMember = teamData.find(member => {
                          const fullName = member['Full Name']?.toLowerCase();
                          const contact = contactValue.toLowerCase();
                          return fullName && (fullName.includes(contact) || contact.includes(fullName));
                        });
                      }
                      
                      // Return proper initials from team data, or fallback to original
                      return teamMember?.Initials || contactValue;
                    })()}
                  </span>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Company & Contact details: Company moved to header; section removed intentionally */}

      {/* Deal summary: service + amount (clamped) */}
      {hasDeal && (
        <div
          {...dealSummaryInteractionProps}
          style={{
            backgroundColor: selected 
              ? (isDarkMode ? '#334155' : 'rgba(59, 130, 246, 0.04)')
              : (isDarkMode ? '#1e293b' : 'rgba(0,0,0,0.03)'),
            border: selected
              ? (isDarkMode ? `1px solid ${colours.blue}` : `1px solid ${colours.blue}`)
              : (summaryIsInteractive && showPitchDetails)
                ? `1px solid ${colours.blue}`
                : (isDarkMode ? '1px solid #334155' : '1px solid rgba(0,0,0,0.06)'),
            borderRadius: 8,
            padding: '10px 14px',
            marginTop: 6,
            marginBottom: 2,
            marginLeft: onToggle ? 26 : 0,
            position: 'relative',
            boxShadow: selected 
              ? (isDarkMode ? 'none' : `0 2px 8px ${colours.blue}15`)
              : 'none',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: summaryIsInteractive ? 'pointer' : 'default',
            outline: 'none'
          }}
        >
          {isEditingDeal ? (
            /* Edit mode */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <TextField
                value={editDealData.ServiceDescription}
                onChange={(_, newValue) => setEditDealData(prev => ({ ...prev, ServiceDescription: newValue || '' }))}
                onClick={(e) => e.stopPropagation()}
                placeholder="Service description"
                multiline
                rows={2}
                disabled={isSavingDeal}
                styles={{
                  fieldGroup: {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    borderRadius: 4,
                  },
                  field: {
                    color: isDarkMode ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)',
                    fontSize: 11,
                    padding: '6px 8px'
                  }
                }}
              />
              <TextField
                value={editDealData.Amount}
                onChange={(_, newValue) => setEditDealData(prev => ({ ...prev, Amount: newValue || '' }))}
                onClick={(e) => e.stopPropagation()}
                placeholder="Amount (numbers only)"
                type="number"
                disabled={isSavingDeal}
                styles={{
                  fieldGroup: {
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    borderRadius: 4,
                  },
                  field: {
                    color: isDarkMode ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)',
                    fontSize: 11,
                    padding: '6px 8px'
                  }
                }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <DefaultButton
                  text="Cancel"
                  onClick={(e) => { e.stopPropagation(); handleCancelEditDeal(); }}
                  disabled={isSavingDeal}
                  styles={{
                    root: {
                      height: 24,
                      fontSize: 10,
                      minWidth: 50,
                      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                      color: isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)'
                    }
                  }}
                />
                <PrimaryButton
                  text={isSavingDeal ? 'Saving...' : 'Save'}
                  onClick={(e) => { e.stopPropagation(); handleSaveDeal(); }}
                  disabled={isSavingDeal}
                  styles={{
                    root: {
                      height: 24,
                      fontSize: 10,
                      minWidth: 50,
                      backgroundColor: colours.blue,
                      border: 'none'
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            /* Display mode */
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              {/* Edit moved to Global Workbench */}
              <div style={{
                fontSize: 12,
                fontWeight: 500,
                color: isDarkMode ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)',
                lineHeight: 1.2,
                flex: 1,
                minWidth: '200px',
                marginBottom: 0,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as any,
                overflow: 'hidden',
                fontStyle: !resolvedDeal?.ServiceDescription ? 'italic' : 'normal',
                opacity: !resolvedDeal?.ServiceDescription ? 0.7 : 1
              }}>
                {resolvedDeal?.ServiceDescription || 'No service description'}
              </div>
              {/* Show pitch email subject if available */}
              {effectivePitchSubject && (
                <div style={{
                  fontSize: 11,
                  fontWeight: 400,
                  color: isDarkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)',
                  lineHeight: 1.3,
                  marginTop: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flex: summaryIsInteractive ? '0 1 auto' : undefined
                }}>
                  <FaEnvelope style={{ fontSize: 10 }} />
                  <span style={{ 
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical' as any,
                    overflow: 'hidden'
                  }}>
                    {effectivePitchSubject}
                  </span>
                  {summaryIsInteractive && (
                    <Icon
                      iconName={showPitchDetails ? 'ChevronUp' : 'ChevronDown'}
                      styles={{
                        root: {
                          fontSize: 10,
                          transition: 'transform 0.2s ease',
                          transform: showPitchDetails ? 'rotate(180deg)' : 'rotate(0deg)'
                        }
                      }}
                    />
                  )}
                </div>
              )}
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: isDarkMode ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
                fontFamily: 'Raleway, sans-serif',
                textAlign: 'right',
                whiteSpace: 'nowrap',
                fontStyle: typeof resolvedDeal?.Amount !== 'number' ? 'italic' : 'normal',
                opacity: typeof resolvedDeal?.Amount !== 'number' ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <span>
                  {typeof resolvedDeal?.Amount === 'number' ? `£${resolvedDeal.Amount.toLocaleString()}` : 'No amount set'}
                </span>
                {summaryIsInteractive && !effectivePitchSubject && (
                  <Icon
                    iconName={showPitchDetails ? 'ChevronUp' : 'ChevronDown'}
                    styles={{
                      root: {
                        fontSize: 10,
                        transition: 'transform 0.2s ease',
                        transform: showPitchDetails ? 'rotate(180deg)' : 'rotate(0deg)'
                      }
                    }}
                  />
                )}
              </div>
              {summaryIsInteractive && showPitchDetails && (
                <div
                  style={{
                    width: '100%',
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: `1px solid ${isDarkMode ? 'rgba(51,65,85,0.9)' : 'rgba(148,163,184,0.35)'}`,
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: isDarkMode ? 'rgba(226,232,240,0.9)' : 'rgba(15,23,42,0.9)'
                  }}
                >
                  {pitchBodyHtml ? (
                    <div dangerouslySetInnerHTML={{ __html: pitchBodyHtml }} />
                  ) : pitchBody ? (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{pitchBody}</div>
                  ) : (
                    <div style={{ fontStyle: 'italic', opacity: 0.85 }}>No pitch email content available.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Progress Indicator */}
      {!isPitchedDeal && calculateInstructionProgress() > 0 && (
        <div style={{ 
          marginTop: 8,
          marginLeft: onToggle ? 26 : 0,
        }}>
          <ProgressIndicator
            value={calculateInstructionProgress()}
            showPercentage={false}
            size="small"
            color={cardBorderColor}
            isDarkMode={isDarkMode}
          />
        </div>
      )}

      {/* Professional Status Overview - Hidden for pitched deals */}
      {!isPitchedDeal && (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          marginTop: 6,
          marginLeft: onToggle ? 26 : 0,
          padding: '10px 14px', // constant
          backgroundColor: selected 
            ? (isDarkMode ? '#334155' : 'rgba(248,250,252,0.8)') // Solid background in dark mode
            : (isDarkMode ? '#1e293b' : 'rgba(248,250,252,0.6)'),
          borderRadius: 8, // constant
          border: selected
            ? (isDarkMode ? `1px solid ${colours.blue}` : `1px solid ${colours.blue}`) // Thinner border, same for both modes
            : (isDarkMode ? '1px solid #334155' : '1px solid rgba(0,0,0,0.03)'), // Solid border
          boxShadow: selected 
            ? (isDarkMode ? 'none' : `0 2px 8px ${colours.blue}10`) // No shadow in dark mode
            : 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          {/* Header */}
          <div style={{
            fontSize: '10px',
            fontWeight: 600,
            color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
            marginBottom: '0px',
            textTransform: 'uppercase',
            letterSpacing: '0.4px'
          }}>
          </div>
          
          {/* Key Status Indicators */}
          <div style={{ 
            display: 'flex',
            flexWrap: 'nowrap',
            alignItems: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
            width: '100%',
            overflow: 'visible'
          }}>
          {(() => {
            const keySteps = [] as Array<{ key: string; label: string; status: string; icon: React.ReactNode; clickable: boolean; onClick: (() => void) | null }>;
            // Use compile-time replacement from CRA; do not reference `process` directly in the browser
            const isProd = process.env.NODE_ENV === 'production';
            
            // ID Verification
            keySteps.push({
              key: 'id',
              label: 'ID',
              status: isVerifyingId
                ? 'Verifying…'
                : verifyIdStatus === 'complete' ? 'Verified'
                : verifyIdStatus === 'review' ? 'Review Required'
                : verifyIdStatus === 'received' ? 'Under Review'
                : proofOfIdComplete ? 'Click to Verify'
                : 'Pending',
              icon: <FaIdCard />,
              clickable: true,
              onClick: () => {
                if (!onEIDClick) return;
                setIsVerifyingId(true);
                try {
                  onEIDClick();
                } finally {
                  // Fallback: if upstream doesn't refresh card, clear after short delay
                  setTimeout(() => setIsVerifyingId(false), 10000);
                }
              }
            });
            
            // Payment - check if bank transfer for special status text
            const isBankTransfer = (() => {
              const paymentRecords = (instruction?.payments || payments || []) as any[];
              if (paymentRecords.length === 0) return false;
              const latestPayment = paymentRecords[0];
              // Bank transfer indicators:
              // 1. payment_status is 'confirmed' (manual confirmation, typically bank transfer)
              // 2. PaymentMethod field is 'bank'
              // 3. No Stripe payment_intent_id (Stripe card payments have payment_intent_id starting with 'pi_')
              const hasStripePaymentIntent = Boolean(latestPayment.payment_intent_id && 
                                                       String(latestPayment.payment_intent_id).startsWith('pi_'));
              const isConfirmedStatus = latestPayment.payment_status === 'confirmed';
              const isExplicitlyBank = latestPayment.payment_method === 'bank' || 
                                       latestPayment.PaymentMethod === 'bank' ||
                                       (latestPayment.metadata && typeof latestPayment.metadata === 'object' && latestPayment.metadata.paymentMethod === 'bank');
              
              // It's a bank transfer if explicitly marked as bank, OR if status is 'confirmed' without a Stripe payment intent
              return isExplicitlyBank || (isConfirmedStatus && !hasStripePaymentIntent);
            })();
            
            keySteps.push({
              key: 'payment', 
              label: paymentStatus === 'complete' && isBankTransfer ? 'Transfer' : 'Pay',
              status: paymentStatus === 'complete' 
                ? (isBankTransfer ? 'Pending' : 'Paid')
                : paymentStatus === 'processing' ? 'Processing' : 'Required',
              icon: <FaPoundSign />,
              clickable: true,
              onClick: (() => onOpenWorkbench?.('payment')) as any
            });
            
            // Documents - don't show as pending if payment complete (same session)
            keySteps.push({
              key: 'documents',
              label: 'Docs',
              status: documentsToUse && documentsToUse.length > 0 
                ? `${documentsToUse.length} Uploaded` 
                : paymentStatus === 'complete'
                  ? 'Not Required' 
                  : 'Pending',
              icon: <FaFileAlt />,
              clickable: true,
              onClick: (() => onOpenWorkbench?.('documents')) as any
            });
            
            // Risk Assessment
            keySteps.push({
              key: 'risk',
              label: 'Risk',
              status: riskStatus === 'complete' ? 'Assessed' : 
                     riskStatus === 'review' ? 'High Risk' : 'Pending',
              icon: <FaShieldAlt />,
              clickable: true,
              onClick: (() => {
                // If no risk assessment exists yet, trigger onRiskClick to create one
                // Otherwise open workbench to view details
                if (!hasRiskAssessment && onRiskClick) {
                  onRiskClick();
                } else {
                  onOpenWorkbench?.('risk');
                }
              }) as any
            });
            
            // Matter Opening
            keySteps.push({
              key: 'matter',
              label: 'Matter',
              status: matterStatus === 'complete' ? 'Opened' : 'Ready to Open',
              icon: <FaFolder />,
              clickable: matterStatus !== 'complete',
              onClick: () => {
                if (matterStatus !== 'complete') {
                  if (onOpenWorkbench) {
                    onOpenWorkbench('matter');
                  } else if (onOpenMatter && instruction) {
                    onOpenMatter(instruction);
                  }
                }
              }
            });
            
            // CCL (Client Care Letter) - hidden for production, sequence ends on Matter
            if (!isProd) {
              keySteps.push({
                key: 'ccl',
                label: 'CCL',
                status: cclStatus === 'complete' ? 'Generated' : 'Pending',
                icon: <FaClipboardCheck />,
                clickable: matterStatus === 'complete',
                onClick: null // CCL functionality would be added here
              });
            }
            
            const stepsLen = keySteps.length;
            return keySteps.map((step, index) => {
              const statusColour = (() => {
                const statusText = step.status.toLowerCase();
                const isAttentionState = (step.key === 'id') && (statusText.includes('click to verify') || statusText.includes('verifying'));
                if (isAttentionState) {
                  return '#f59e0b';
                }
                if (statusText.includes('complete') || statusText.includes('paid') || statusText.includes('assessed') || statusText.includes('opened') || statusText.includes('verified') || statusText.includes('uploaded') || statusText.includes('generated')) {
                  return colours.green;
                } else if (statusText.includes('review') || statusText.includes('high risk')) {
                  return '#ef4444';
                } else if (statusText.includes('processing') || statusText.includes('under review')) {
                  return '#f59e0b';
                } else {
                  return isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
                }
              })();

              const isNextAction = step.key === nextActionStep;
              
              return (
                <div key={step.key} style={{ flex: '0 1 auto', minWidth: 0 }} className={`instruction-chip-wrapper ${selected ? 'expanded' : ''}`}>
                  <div
                    className="instruction-chip"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: selected ? '6px' : '0px',
                      cursor: step.clickable ? 'pointer' : 'default',
                      padding: selected ? '4px 10px' : '6px',
                      borderRadius: 6,
                      backgroundColor: (() => {
                        const statusText = step.status.toLowerCase();
                        const isAttentionState = (step.key === 'id') && (statusText.includes('click to verify') || statusText.includes('verifying'));
                        if (isAttentionState) {
                          return isDarkMode ? 'rgba(251, 191, 36, 0.2)' : 'rgba(251, 191, 36, 0.15)';
                        }
                        if (statusText.includes('complete') || statusText.includes('paid') || statusText.includes('assessed') || statusText.includes('opened') || statusText.includes('verified') || statusText.includes('uploaded') || statusText.includes('generated')) {
                          return isDarkMode ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)';
                        } else if (statusText.includes('review') || statusText.includes('high risk')) {
                          return isDarkMode ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)';
                        } else if (statusText.includes('processing') || statusText.includes('under review')) {
                          return isDarkMode ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.1)';
                        } else {
                          return isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.1)';
                        }
                      })(),
                      border: (() => {
                        // Next action gets highlighted border
                        if (isNextAction) {
                          return `1px solid ${cardBorderColor}`;
                        }
                        const statusText = step.status.toLowerCase();
                        const isAttentionState = (step.key === 'id') && (statusText.includes('click to verify') || statusText.includes('verifying'));
                        if (isAttentionState) {
                          return '1px solid rgba(251, 191, 36, 0.6)';
                        }
                        if (statusText.includes('complete') || statusText.includes('paid') || statusText.includes('assessed') || statusText.includes('opened') || statusText.includes('verified') || statusText.includes('uploaded') || statusText.includes('generated')) {
                          return `1px solid ${colours.green}30`;
                        } else if (statusText.includes('review') || statusText.includes('high risk')) {
                          return '1px solid rgba(239, 68, 68, 0.3)';
                        } else if (statusText.includes('processing') || statusText.includes('under review')) {
                          return '1px solid rgba(251, 191, 36, 0.3)';
                        } else {
                          return '1px solid rgba(148, 163, 184, 0.3)';
                        }
                      })(),
                      boxShadow: 'none',
                      animation: isNextAction ? 'subtlePulse 2s ease-in-out infinite' : 'none',
                      minHeight: '24px',
                      minWidth: 0,
                      flex: '0 1 auto',
                      position: 'relative',
                      overflow: 'hidden',
                      fontWeight: 600,
                      whiteSpace: 'nowrap'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (step.clickable && step.onClick) {
                        step.onClick();
                      }
                    }}
                  >
                    {/* Icon with status color */}
                    <div style={{
                      fontSize: '10px',
                      color: (() => {
                        const statusText = step.status.toLowerCase();
                        const isAttentionState = (step.key === 'id') && (statusText.includes('click to verify') || statusText.includes('verifying'));
                        if (isAttentionState) {
                          return '#f59e0b';
                        }
                        if (statusText.includes('complete') || statusText.includes('paid') || statusText.includes('assessed') || statusText.includes('opened') || statusText.includes('verified') || statusText.includes('uploaded') || statusText.includes('generated')) {
                          return colours.green;
                        } else if (statusText.includes('review') || statusText.includes('high risk')) {
                          return '#ef4444';
                        } else if (statusText.includes('processing') || statusText.includes('under review')) {
                          return '#f59e0b';
                        } else {
                          return colours.highlight;
                        }
                      })(),
                      flexShrink: 0
                    }}>
                      {step.icon}
                    </div>
                    
                    {/* Label and Status - animated expand/collapse */}
                    <div 
                      className="instruction-chip-label"
                      style={{
                        fontSize: '9px',
                        fontWeight: 600,
                        color: (() => {
                          const statusText = step.status.toLowerCase();
                          const isAttentionState = (step.key === 'id') && (statusText.includes('click to verify') || statusText.includes('verifying'));
                          if (isAttentionState) {
                            return '#f59e0b';
                          }
                          if (statusText.includes('complete') || statusText.includes('paid') || statusText.includes('assessed') || statusText.includes('opened') || statusText.includes('verified') || statusText.includes('uploaded') || statusText.includes('generated')) {
                            return colours.green;
                          } else if (statusText.includes('review') || statusText.includes('high risk')) {
                            return '#ef4444';
                          } else if (statusText.includes('processing') || statusText.includes('under review')) {
                            return '#f59e0b';
                          } else {
                            return colours.highlight;
                          }
                        })(),
                        textTransform: 'uppercase',
                        letterSpacing: '0.3px',
                        whiteSpace: 'nowrap',
                        maxWidth: selected ? '200px' : '0px',
                        opacity: selected ? 1 : 0,
                        overflow: 'hidden',
                        transform: selected ? 'translateX(0)' : 'translateX(-10px)'
                      }}
                    >
                      {step.label} {step.status}
                    </div>
                  </div>

                </div>
              );
            });
          })()}
          </div>
        </div>
      )}
      {/* Contact banner removed per request; details now inline in header */}
      
      {/* Risk Details Section - shown when risk pill is clicked */}
      {showRiskDetails && hasRiskAssessment && (
        <div style={{
          marginTop: '12px',
          padding: '16px',
          background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(54,144,206,0.05)',
          borderRadius: '8px',
          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(54,144,206,0.15)'}`,
          animation: 'fadeIn 0.3s ease-out'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '12px',
            paddingBottom: '8px',
            borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(54,144,206,0.1)'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FaShieldAlt style={{ color: colours.blue, fontSize: '16px' }} />
              <span style={{
                fontSize: '14px',
                fontWeight: 700,
                color: isDarkMode ? '#fff' : colours.darkBlue
              }}>
                Risk Assessment Details
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); instruction?.InstructionRef && onEditRisk?.(instruction.InstructionRef); }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(54,144,206,0.3)',
                  background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                  color: colours.cta,
                  cursor: 'pointer'
                }}
                title="Edit risk assessment"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!instruction?.InstructionRef) return;
                  const ok = window.confirm('Delete this risk assessment? This cannot be undone.');
                  if (ok) onDeleteRisk?.(instruction.InstructionRef);
                }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(220, 38, 38, 0.35)',
                  background: isDarkMode ? 'rgba(220,38,38,0.15)' : 'linear-gradient(135deg, #fff5f5 0%, #ffecec 100%)',
                  color: colours.red,
                  cursor: 'pointer'
                }}
                title="Delete risk assessment"
              >
                Delete
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {/* Risk Result */}
            {risk.RiskAssessmentResult && (
              <div>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase' }}>
                  Risk Level
                </div>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: risk.RiskAssessmentResult?.toLowerCase().includes('low') ? colours.green : 
                         risk.RiskAssessmentResult?.toLowerCase().includes('medium') ? colours.yellow :
                         risk.RiskAssessmentResult?.toLowerCase().includes('high') ? colours.red : '#666'
                }}>
                  {risk.RiskAssessmentResult}
                </div>
              </div>
            )}

            {/* Risk Score */}
            {risk.RiskScore && (
              <div>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase' }}>
                  Risk Score
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: isDarkMode ? '#fff' : colours.darkBlue }}>
                  {risk.RiskScore}/21
                </div>
              </div>
            )}

            {/* Assessor */}
            {risk.RiskAssessor && (
              <div>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase' }}>
                  Assessed By
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: isDarkMode ? '#fff' : colours.darkBlue }}>
                  {risk.RiskAssessor}
                </div>
              </div>
            )}

            {/* Date */}
            {risk.ComplianceDate && (
              <div>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase' }}>
                  Assessment Date
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: isDarkMode ? '#fff' : colours.darkBlue }}>
                  {new Date(risk.ComplianceDate).toLocaleDateString('en-GB')}
                </div>
              </div>
            )}
          </div>

          {/* Additional Risk Factors */}
          {(risk.ClientType || risk.ValueOfInstruction || risk.TransactionRiskLevel) && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase' }}>
                Risk Factors
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {risk.ClientType && (
                  <span style={{
                    padding: '4px 8px',
                    background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: isDarkMode ? '#fff' : colours.darkBlue
                  }}>
                    {risk.ClientType}
                  </span>
                )}
                {risk.ValueOfInstruction && (
                  <span style={{
                    padding: '4px 8px',
                    background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: isDarkMode ? '#fff' : colours.darkBlue
                  }}>
                    {risk.ValueOfInstruction}
                  </span>
                )}
                {risk.TransactionRiskLevel && (
                  <span style={{
                    padding: '4px 8px',
                    background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: isDarkMode ? '#fff' : colours.darkBlue
                  }}>
                    Transaction: {risk.TransactionRiskLevel}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payment Details Section - shown when payment pill is clicked */}
      {showInstructionDetails && (
        <div className="mt-4 p-3" style={{
          border: '1px solid #e0e0e0',
          borderRadius: '6px',
          background: isDarkMode ? '#2d2d2d' : '#f8f9fa',
          fontSize: '14px',
          marginLeft: onToggle ? 26 : 0
        }}>
          <h5 style={{
            color: isDarkMode ? '#fff' : colours.darkBlue,
            marginBottom: '12px',
            fontWeight: 'bold',
            fontSize: '16px'
          }}>
            Instruction Details
          </h5>
          
          {loadingInstructionDetails ? (
            <div style={{ color: isDarkMode ? '#ccc' : '#666' }}>
              Loading instruction details...
            </div>
          ) : instructionData ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                  Instruction Reference:
                </strong>
                <br />
                <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                  {instructionData.InstructionRef}
                </span>
              </div>
              
              <div>
                <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                  Stage:
                </strong>
                <br />
                <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                  {instructionData.Stage}
                </span>
              </div>
              
              <div>
                <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                  Client Type:
                </strong>
                <br />
                <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                  {instructionData.ClientType}
                </span>
              </div>
              
              <div>
                <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                  Helix Contact:
                </strong>
                <br />
                <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                  {instructionData.HelixContact}
                </span>
              </div>
              
              {instructionData.ClientType === 'Individual' ? (
                <>
                  <div>
                    <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                      Client Name:
                    </strong>
                    <br />
                    <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                      {`${instructionData.FirstName || ''} ${instructionData.LastName || ''}`.trim()}
                    </span>
                  </div>
                  
                  <div>
                    <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                      Date of Birth:
                    </strong>
                    <br />
                    <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                      {instructionData.DateOfBirth}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                      Company Name:
                    </strong>
                    <br />
                    <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                      {instructionData.CompanyName}
                    </span>
                  </div>
                  
                  <div>
                    <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                      Company Type:
                    </strong>
                    <br />
                    <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                      {instructionData.CompanyType}
                    </span>
                  </div>
                </>
              )}
              
              <div>
                <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                  Email:
                </strong>
                <br />
                <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                  {instructionData.EmailAddress}
                </span>
              </div>
              
              <div>
                <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                  Phone:
                </strong>
                <br />
                <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                  {instructionData.PhoneNumber}
                </span>
              </div>
              
              <div style={{ gridColumn: '1 / -1' }}>
                <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                  Address:
                </strong>
                <br />
                <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                  {[instructionData.AddressLine1, instructionData.AddressLine2, instructionData.City, instructionData.County, instructionData.PostCode]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </div>
              
              <div>
                <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                  Submitted Date:
                </strong>
                <br />
                <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                  {instructionData.SubmittedDate}
                </span>
              </div>
              
              <div>
                <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                  Status:
                </strong>
                <br />
                <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                  {instructionData.Status}
                </span>
              </div>
              
              {instructionData.NotesToClient && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <strong style={{ color: isDarkMode ? '#fff' : colours.darkBlue }}>
                    Notes to Client:
                  </strong>
                  <br />
                  <span style={{ color: isDarkMode ? '#ccc' : '#666' }}>
                    {instructionData.NotesToClient}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: isDarkMode ? '#ccc' : '#666' }}>
              No instruction details found for this reference.
            </div>
          )}
        </div>
      )}

      {showPaymentDetails && (
        <div style={{
          marginTop: '12px',
          marginLeft: onToggle ? 26 : 0,
          padding: '16px',
          background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(248,250,252,0.8)',
          borderRadius: '4px',
          border: isDarkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0',
          animation: 'fadeIn 0.3s ease-out'
        }}>
          <div style={{
            fontSize: '10px',
            fontWeight: 600,
            color: isDarkMode ? '#888' : '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px',
            paddingBottom: '8px',
            borderBottom: isDarkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0'
          }}>
            Payment Details
          </div>

          {loadingPaymentDetails ? (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              padding: '16px',
              color: isDarkMode ? '#999' : '#666',
              fontSize: '12px'
            }}>
              Loading payment details...
            </div>
          ) : paymentData.length > 0 ? (
            paymentData.map((payment, idx) => {
              // Parse metadata if available
              let metadata: any = {};
              try {
                if (payment.metadata && typeof payment.metadata === 'string') {
                  metadata = JSON.parse(payment.metadata);
                }
              } catch (e) {
                // Ignore parsing errors
              }
              
              return (
              <div key={idx} style={{
                marginBottom: idx < paymentData.length - 1 ? '16px' : '0',
                paddingBottom: idx < paymentData.length - 1 ? '16px' : '0',
                borderBottom: idx < paymentData.length - 1 ? (isDarkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0') : 'none'
              }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '12px 20px',
                  fontSize: '14px'
                }}>
                  {/* Amount */}
                  {payment.amount && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ 
                        fontSize: '10px', 
                        fontWeight: 600, 
                        color: isDarkMode ? '#888' : '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Amount
                      </span>
                      <span style={{ 
                        fontWeight: 600, 
                        fontSize: '13px', 
                        color: isDarkMode ? '#e2e8f0' : '#0f172a',
                        fontFamily: 'monospace'
                      }}>
                        {payment.currency || 'GBP'} {payment.amount}
                      </span>
                    </div>
                  )}

                  {/* Payment Status */}
                  {payment.payment_status && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ 
                        fontSize: '10px', 
                        fontWeight: 600, 
                        color: isDarkMode ? '#888' : '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Payment Status
                      </span>
                      <span style={{ 
                        fontWeight: 600, 
                        fontSize: '12px', 
                        color: isDarkMode ? '#e2e8f0' : '#1e293b',
                        padding: '2px 6px',
                        background: isDarkMode ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                        borderRadius: '3px',
                        width: 'fit-content',
                        border: isDarkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0'
                      }}>
                        {payment.payment_status}
                      </span>
                    </div>
                  )}

                  {/* Internal Status */}
                  {payment.internal_status && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ 
                        fontSize: '10px', 
                        fontWeight: 600, 
                        color: isDarkMode ? '#888' : '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Internal Status
                      </span>
                      <span style={{ 
                        fontWeight: 600, 
                        fontSize: '13px', 
                        color: isDarkMode ? '#e2e8f0' : '#0f172a'
                      }}>
                        {payment.internal_status}
                      </span>
                    </div>
                  )}

                  {/* Created Date */}
                  {payment.created_at && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ 
                        fontSize: '10px', 
                        fontWeight: 600, 
                        color: isDarkMode ? '#888' : '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Created Date
                      </span>
                      <span style={{ 
                        fontWeight: 500, 
                        fontSize: '13px', 
                        color: isDarkMode ? '#e2e8f0' : '#1e293b'
                      }}>
                        {new Date(payment.created_at).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                  )}

                  {/* Updated Date */}
                  {payment.updated_at && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ 
                        fontSize: '10px', 
                        fontWeight: 600, 
                        color: isDarkMode ? '#888' : '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Updated Date
                      </span>
                      <span style={{ 
                        fontWeight: 500, 
                        fontSize: '13px', 
                        color: isDarkMode ? '#e2e8f0' : '#1e293b'
                      }}>
                        {new Date(payment.updated_at).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                  )}

                  {/* Payment Intent ID */}
                  {payment.payment_intent_id && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ 
                        fontSize: '10px', 
                        fontWeight: 600, 
                        color: isDarkMode ? '#888' : '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Payment Intent ID
                      </span>
                      <span style={{ 
                        fontWeight: 500, 
                        fontSize: '12px', 
                        color: isDarkMode ? '#e2e8f0' : '#1e293b',
                        fontFamily: 'monospace'
                      }}>
                        {payment.payment_intent_id.substring(0, 20)}...
                      </span>
                    </div>
                  )}

                  {/* Service Description from metadata */}
                  {(payment.service_description || metadata.serviceDescription) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ 
                        fontSize: '10px', 
                        fontWeight: 600, 
                        color: isDarkMode ? '#888' : '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Service Description
                      </span>
                      <span style={{ 
                        fontWeight: 500, 
                        fontSize: '13px', 
                        color: isDarkMode ? '#e2e8f0' : '#1e293b'
                      }}>
                        {payment.service_description || metadata.serviceDescription}
                      </span>
                    </div>
                  )}

                  {/* Area of Work from metadata */}
                  {(payment.area_of_work || metadata.areaOfWork) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ 
                        fontSize: '10px', 
                        fontWeight: 600, 
                        color: isDarkMode ? '#888' : '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Area of Work
                      </span>
                      <span style={{ 
                        fontWeight: 500, 
                        fontSize: '13px', 
                        color: isDarkMode ? '#e2e8f0' : '#1e293b'
                      }}>
                        {payment.area_of_work || metadata.areaOfWork}
                      </span>
                    </div>
                  )}

                  {/* Payment Source from metadata */}
                  {metadata.source && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ 
                        fontSize: '10px', 
                        fontWeight: 600, 
                        color: isDarkMode ? '#888' : '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Source
                      </span>
                      <span style={{ 
                        fontWeight: 500, 
                        fontSize: '13px', 
                        color: isDarkMode ? '#e2e8f0' : '#1e293b'
                      }}>
                        {metadata.source}
                      </span>
                    </div>
                  )}

                  {/* Product from metadata */}
                  {metadata.product && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ 
                        fontSize: '10px', 
                        fontWeight: 600, 
                        color: isDarkMode ? '#888' : '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Product
                      </span>
                      <span style={{ 
                        fontWeight: 500, 
                        fontSize: '13px', 
                        color: isDarkMode ? '#e2e8f0' : '#1e293b'
                      }}>
                        {metadata.product}
                      </span>
                    </div>
                  )}

                  {/* Receipt URL */}
                  {payment.receipt_url && (
                    <div style={{ 
                      gridColumn: '1 / -1',
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '2px',
                      marginTop: '8px',
                      paddingTop: '8px',
                      borderTop: isDarkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0'
                    }}>
                      <span style={{ 
                        fontSize: '10px', 
                        fontWeight: 600, 
                        color: isDarkMode ? '#888' : '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Receipt URL
                      </span>
                      <a 
                        href={payment.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ 
                          fontWeight: 400, 
                          fontSize: '13px', 
                          color: isDarkMode ? '#60a5fa' : '#2563eb',
                          lineHeight: '1.4',
                          textDecoration: 'underline'
                        }}
                      >
                        View Receipt
                      </a>
                    </div>
                  )}
                </div>
              </div>
              );
            })
          ) : (
            <div style={{ 
              color: '#999',
              fontStyle: 'italic',
              textAlign: 'center',
              padding: '16px',
              fontSize: '12px'
            }}>
              No payment details found
            </div>
          )}
        </div>
      )}

      {/* Document Details Section - shown when documents pill is clicked */}
      {showDocumentDetails && documentsToUse && documentsToUse.length > 0 && (
        <div style={{
          marginTop: '12px',
          padding: '16px',
          background: isDarkMode ? 'linear-gradient(135deg, rgba(30,41,59,0.7) 0%, rgba(15,23,42,0.7) 100%)' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
          borderRadius: '10px',
          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#e2e8f0'}`,
          boxShadow: isDarkMode ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.08)',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px', minWidth: 240 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : '#e2e8f0'}`
              }}>
                <FaFileAlt style={{ color: colours.green, fontSize: 16 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: isDarkMode ? '#fff' : colours.darkBlue }}>
                  Documents ({documentsToUse.length})
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {documentsToUse.map((doc, idx) => {
                  const isActive = idx === selectedDocumentIndex;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDocumentIndex(idx)}
                      style={{
                        textAlign: 'left',
                        border: '1px solid ' + (isActive ? colours.blue : (isDarkMode ? 'rgba(255,255,255,0.15)' : '#e2e8f0')),
                        background: isActive ? (isDarkMode ? 'rgba(96,165,250,0.15)' : '#eff6ff') : (isDarkMode ? 'rgba(255,255,255,0.04)' : '#f1f5f9'),
                        padding: '8px 10px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        color: isDarkMode ? '#f1f5f9' : '#0f172a',
                        fontWeight: 500,
                        transition: 'background .15s, border-color .15s'
                      }}
                    >
                      <FaFileAlt style={{ color: isActive ? colours.blue : colours.greyText, fontSize: 14 }} />
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {doc.FileName || doc.filename || doc.name || `Document ${idx + 1}`}
                      </span>
                      {(doc.UploadedAt || doc.uploaded_at) && (
                        <span style={{ fontSize: 10, color: isDarkMode ? '#cbd5e1' : '#64748b' }}>
                          {new Date(doc.UploadedAt || doc.uploaded_at).toLocaleDateString('en-GB')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ flex: '2 1 420px', minWidth: 300, position: 'relative' }}>
              {(() => {
                const activeDoc: any = documentsToUse[selectedDocumentIndex];
                if (!activeDoc) return null;
                const name = activeDoc.FileName || activeDoc.filename || activeDoc.name || `Document ${selectedDocumentIndex + 1}`;
                const url: string | undefined = activeDoc.previewUrl || activeDoc.BlobUrl || activeDoc.url || activeDoc.download_url || activeDoc.preview_url;
                const size: number | undefined = activeDoc.FileSizeBytes || activeDoc.size || activeDoc.file_size || activeDoc.length;
                const uploadedBy = activeDoc.UploadedBy || activeDoc.uploaded_by || activeDoc.user || activeDoc.User;
                const uploadedAtRaw = activeDoc.UploadedAt || activeDoc.uploaded_at || activeDoc.created_at || activeDoc.CreatedAt;
                const ext = (name.split('.').pop() || '').toLowerCase();
                const officeExts = ['doc','docx','ppt','pptx','xls','xlsx'];
                const imageExts = ['png','jpg','jpeg','gif','webp'];
                const audioExts = ['mp3','wav','ogg'];
                const videoExts = ['mp4','webm','ogg','mov'];
                const textExts = ['txt','log','csv'];
                const pdfExts = ['pdf'];
                const canPreviewDirect = !!url && (imageExts.includes(ext) || audioExts.includes(ext) || videoExts.includes(ext) || textExts.includes(ext) || pdfExts.includes(ext));
                const canPreviewOffice = !!url && officeExts.includes(ext);
                const officeViewerUrl = canPreviewOffice ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url!)}` : undefined;
                return (
                  <div style={{
                    border: '1px solid ' + (isDarkMode ? 'rgba(255,255,255,0.15)' : '#e2e8f0'),
                    borderRadius: 8,
                    padding: 14,
                    background: isDarkMode ? 'rgba(255,255,255,0.04)' : '#fff',
                    minHeight: 260,
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <FaFileAlt style={{ color: getFileColour(ext, colours), fontSize: 18 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? '#fff' : colours.darkBlue }}>{name}</div>
                        <div style={{ fontSize: 11, color: isDarkMode ? '#cbd5e1' : '#64748b', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                          {uploadedAtRaw && <span>Uploaded {new Date(uploadedAtRaw).toLocaleString('en-GB')}</span>}
                          {uploadedBy && <span>By {uploadedBy}</span>}
                          <span>Type {ext || 'n/a'}</span>
                          <span>Size {formatBytes(size)}</span>
                        </div>
                      </div>
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer" style={{
                          fontSize: 11,
                          padding: '4px 8px',
                          borderRadius: 4,
                          background: colours.blue,
                          color: '#fff',
                          textDecoration: 'none'
                        }}>Open</a>
                      )}
                    </div>
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 6 }}>
                      {canPreviewDirect && url && (
                        imageExts.includes(ext) ? (
                          <img src={url} alt={name} style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                        ) : pdfExts.includes(ext) ? (
                          <iframe title={name} src={url} style={{ width: '100%', height: '100%', border: 'none', minHeight: 200 }} />
                        ) : textExts.includes(ext) ? (
                          <iframe title={name} src={url} style={{ width: '100%', height: '100%', border: 'none', minHeight: 200, background:'#fff' }} />
                        ) : audioExts.includes(ext) ? (
                          <audio controls style={{ width: '100%' }}>
                            <source src={url} />
                            Your browser does not support the audio element.
                          </audio>
                        ) : videoExts.includes(ext) ? (
                          <video controls style={{ width: '100%', maxHeight: 240 }}>
                            <source src={url} />
                            Your browser does not support the video tag.
                          </video>
                        ) : null
                      )}
                      {canPreviewOffice && officeViewerUrl && (
                        <iframe title={name} src={officeViewerUrl} style={{ width: '100%', height: '100%', border: 'none', minHeight: 220, background:'#fff' }} />
                      )}
                      {!canPreviewDirect && !canPreviewOffice && (
                        <div style={{
                          fontSize: 12,
                          color: isDarkMode ? '#cbd5e1' : '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: 180,
                          textAlign: 'center',
                          padding: '0 20px'
                        }}>
                          {url ? 'Inline preview not supported for this file. Use Open to view/download.' : 'No file URL available. Metadata shown above.'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {showRiskDetails && !hasRiskAssessment && (
        <div style={{
          marginTop: '12px',
          marginLeft: onToggle ? 26 : 0,
          padding: '16px',
          background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(54,144,206,0.05)',
          borderRadius: '8px',
          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(54,144,206,0.15)'}`,
          animation: 'fadeIn 0.3s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <FaShieldAlt style={{ color: colours.blue, fontSize: 16 }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: isDarkMode ? '#fff' : colours.darkBlue }}>
              Risk Assessment
            </span>
          </div>
          <div style={{ fontSize: 12, color: isDarkMode ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)' }}>
            No assessment found. {`Click the Risk pill to ${onRiskClick ? 'start the assessment' : 'add an assessment'}.`}
          </div>
        </div>
      )}

      {/* Matter Details Section removed - functionality moved to WorkbenchPanel */}
      {/* Status Override Dropdown removed - now handled in WorkbenchPanel */}

      {/* Toast for API feedback */}
      <OperationStatusToast
        visible={toast.show}
        type={toast.type}
        message={toast.message}
      />
    </div>
  );
};

/**
 * InstructionCard
 * Presents instruction summary with compact, legible hierarchy and a progress rail.
 */
export default InstructionCard;
