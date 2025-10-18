import React, { useEffect, useState, useMemo, useRef, useLayoutEffect, useCallback } from "react";
import { flushSync } from "react-dom";
// Clean admin tools - legacy toggles removed - cache cleared
import {
  Stack,
  mergeStyles,
  Pivot,
  PivotItem,
  Text,
  PrimaryButton,
  Dialog,
  DialogType,
  DialogFooter,
  DefaultButton,
  IconButton,
  DatePicker,
  IDatePickerStyles,
} from "@fluentui/react";
import DocumentPreviewModal from "../../components/DocumentPreviewModal";
import {
  FaIdBadge,
  FaRegIdBadge,
  FaFileAlt,
  FaRegFileAlt,
  FaFolder,
  FaRegFolder,
  FaCheckCircle,
  FaExclamationTriangle,
  FaUser,
  FaBuilding,
} from 'react-icons/fa';
import { MdOutlineArticle, MdArticle, MdOutlineWarning, MdWarning, MdAssessment, MdOutlineAssessment, MdSync, MdExpandMore, MdChevronRight } from 'react-icons/md';
import { FaShieldAlt, FaIdCard, FaCreditCard, FaCog } from 'react-icons/fa';
import QuickActionsCard from "../home/QuickActionsCard"; // legacy, to be removed after full migration
import { useTheme } from "../../app/functionality/ThemeContext";
import { useNavigatorActions } from "../../app/functionality/NavigatorContext";
import { colours } from "../../app/styles/colours";
import { dashboardTokens } from "./componentTokens";
import InstructionCard from "./InstructionCard";
import OverridePills from "./OverridePills";
import RiskComplianceCard from "./RiskComplianceCard";
import MatterOperations from "./MatterOperations";
import JointClientCard, { ClientInfo } from "./JointClientCard";
import DealCard from "./DealCard";
import type { DealSummary } from "./JointClientCard";
import { InstructionData, POID, TeamData, UserData, Matter } from "../../app/functionality/types";
import { hasActiveMatterOpening, clearMatterOpeningDraft } from "../../app/functionality/matterOpeningUtils";
import { isAdminUser } from "../../app/admin";
import FlatMatterOpening from "./MatterOpening/FlatMatterOpening";
import RiskAssessmentPage from "./RiskAssessmentPage";
import EIDCheckPage from "./EIDCheckPage";
import InstructionEditor from "./components/InstructionEditor";
import "../../app/styles/InstructionsBanner.css";
// invisible change 2.2
import DocumentEditorPage from "./DocumentEditorPage";
import DocumentsV3 from "./DocumentsV3";
import localUserData from "../../localData/localUserData.json";
import SegmentedControl from '../../components/filter/SegmentedControl';
import TwoLayerFilter, { TwoLayerFilterOption } from '../../components/filter/TwoLayerFilter';
import FilterBanner from '../../components/filter/FilterBanner';
// ToggleSwitch removed in favor of premium SegmentedControl for scope/layout
import IDVerificationReviewModal from '../../components/modals/IDVerificationReviewModal';
import { fetchVerificationDetails, approveVerification } from '../../services/verificationAPI';
import { debugLog, debugWarn } from '../../utils/debug';

interface InstructionsProps {
  userInitials: string;
  instructionData: InstructionData[];
  setInstructionData: React.Dispatch<React.SetStateAction<InstructionData[]>>;
  allInstructionData?: InstructionData[]; // Admin: all users' instructions
  poidData: POID[];
  setPoidData: React.Dispatch<React.SetStateAction<POID[]>>;
  teamData?: TeamData[] | null;
  userData?: UserData[] | null;
  matters?: Matter[];
  hasActiveMatter?: boolean;
  setIsInMatterOpeningWorkflow?: (inWorkflow: boolean) => void;
  enquiries?: any[] | null;
}
const Instructions: React.FC<InstructionsProps> = ({
  userInitials,
  instructionData,
  setInstructionData,
  allInstructionData = [],
  poidData,
  setPoidData,
  teamData,
  userData,
  matters = [],
  hasActiveMatter = false,
  setIsInMatterOpeningWorkflow,
  enquiries = [],
}) => {
  const { isDarkMode } = useTheme();
  const { setContent } = useNavigatorActions();
  const [showNewMatterPage, setShowNewMatterPage] = useState<boolean>(false);
  const [showRiskPage, setShowRiskPage] = useState<boolean>(false);
  // Core selection + workflow state (restored after resume/new workflow removal)
  const [selectedInstruction, setSelectedInstruction] = useState<any | null>(null);
  const [showEIDPage, setShowEIDPage] = useState<boolean>(false);
  // forceNewMatter was previously used to bust FlatMatterOpening internal draft keys; keep minimal for now
  const [forceNewMatter, setForceNewMatter] = useState<boolean>(false);
  const [pendingInstructionRef, setPendingInstructionRef] = useState<string>('');
  const [selectedRisk, setSelectedRisk] = useState<any | null>(null);
  const [showCclDraftPage, setShowCclDraftPage] = useState(false);
  // ID Verification review modal state (still required post-simplification)
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewModalDetails, setReviewModalDetails] = useState<any | null>(null);
  // Track which instruction refs are currently undergoing ID verification network calls
  const [idVerificationLoading, setIdVerificationLoading] = useState<Set<string>>(new Set());
  // Responsive helpers
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1280);
  // Overview grid ref for masonry reflow logic
  const overviewGridRef = useRef<HTMLDivElement | null>(null);
  // NOTE: Preselected POIDs are now derived lazily inside the showNewMatterPage branch
  // (see block where <FlatMatterOpening /> is returned) to avoid referencing idVerificationOptions before it is defined.
  
  // Document Preview Modal State
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<any>(null);
  const [isWorkbenchVisible, setIsWorkbenchVisible] = useState(false);
  const [workbenchHeight, setWorkbenchHeight] = useState(500); // Default height in pixels
  const [isResizing, setIsResizing] = useState(false);
  // On-brand toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  // Flat tab navigation: default to Clients
  const [activeTab, setActiveTab] = useState<'pitches' | 'clients' | 'risk'>('clients');
  
  // Comprehensive workbench tab management
  const [activeWorkbenchTab, setActiveWorkbenchTab] = useState('identity');
  
  // Workbench expansion state management
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({});

  // Editing state for inline risk assessment editing
  const [editingField, setEditingField] = useState<{category: string, field: string, currentValue: any} | null>(null);
  
  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  // Risk assessment field options
  const riskFieldOptions: {[key: string]: string[]} = {
    'RiskAssessmentResult': ['Pass', 'Fail', 'Pending', 'Review Required'],
    'RiskScore': ['0', '1', '2', '3', '4', '5'],
    'TransactionRiskLevel': ['Low', 'Medium', 'High', 'Critical'],
    'ClientType': ['Individual', 'Corporate', 'Trust', 'Partnership', 'Other'],
    'ClientType_Value': ['0', '1', '2', '3', '4', '5'],
    'HowWasClientIntroduced': ['Direct approach', 'Referral from existing client', 'Professional referral', 'Marketing', 'Other'],
    'HowWasClientIntroduced_Value': ['0', '1', '2', '3', '4', '5'],
    'SourceOfFunds': ['Employment income', 'Business profits', 'Investment returns', 'Property sale', 'Inheritance', 'Gift', 'Other'],
    'SourceOfFunds_Value': ['0', '1', '2', '3', '4', '5'],
    'DestinationOfFunds': ['Purchase property', 'Investment', 'Business use', 'Personal use', 'Other'],
    'FundsType': ['Cash', 'Bank transfer', 'Cheque', 'Electronic payment', 'Cryptocurrency', 'Other'],
    'ValueOfInstruction': ['< £10,000', '£10,000 - £50,000', '£50,000 - £100,000', '£100,000 - £500,000', '> £500,000'],
    'ClientRiskFactorsConsidered': ['Yes', 'No'],
    'TransactionRiskFactorsConsidered': ['Yes', 'No'],
    'FirmWideAMLPolicyConsidered': ['Yes', 'No'],
    'FirmWideSanctionsRiskConsidered': ['Yes', 'No'],
    'Limitation': ['Not specified', '6 months', '1 year', '3 years', '6 years', '12 years', 'No limitation'],
    'LimitationTBC': ['Yes', 'No']
  };

  // Identity field options
  const identityFieldOptions: {[key: string]: string[]} = {
    'Title': ['Mr', 'Mrs', 'Miss', 'Ms', 'Dr', 'Prof', 'Rev', 'Sir', 'Lady', 'Lord'],
    'Gender': ['Male', 'Female', 'Other', 'Prefer not to say'],
    'Nationality': ['British', 'American', 'Canadian', 'Australian', 'German', 'French', 'Spanish', 'Italian', 'Irish', 'Other'],
    'Country': ['United Kingdom', 'United States', 'Canada', 'Australia', 'Germany', 'France', 'Spain', 'Italy', 'Ireland', 'Other'],
    'ClientType': ['Individual', 'Corporate', 'Trust', 'Partnership', 'Other'],
    'EntityType': ['Individual', 'Limited Company', 'Partnership', 'Trust', 'Other'],
    'IDType': ['Passport', 'Driving License', 'National ID', 'Other']
  };

  // Modern DatePicker styles from ReportingHome
  const getDatePickerStyles = (isDarkMode: boolean): Partial<IDatePickerStyles> => {
    const baseBorder = isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(13, 47, 96, 0.18)';
    const hoverBorder = isDarkMode ? 'rgba(135, 206, 255, 0.5)' : 'rgba(54, 144, 206, 0.4)';
    const focusBorder = isDarkMode ? '#87ceeb' : colours.blue;
    const backgroundColour = isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)';
    const hoverBackground = isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(248, 250, 252, 1)';
    const focusBackground = isDarkMode ? 'rgba(15, 23, 42, 1)' : 'rgba(255, 255, 255, 1)';

    return {
      root: { 
        maxWidth: 180,
        '.ms-DatePicker': {
          fontFamily: 'Raleway, sans-serif !important',
        }
      },
      textField: {
        root: {
          fontFamily: 'Raleway, sans-serif !important',
          width: '100% !important',
        },
        fieldGroup: {
          height: '28px !important',
          borderRadius: '6px !important',
          border: `1px solid ${baseBorder} !important`,
          background: `${backgroundColour} !important`,
          padding: '0 10px !important',
          boxShadow: isDarkMode 
            ? '0 2px 4px rgba(0, 0, 0, 0.2) !important' 
            : '0 1px 3px rgba(15, 23, 42, 0.08) !important',
          transition: 'all 0.2s ease !important',
          selectors: {
            ':hover': {
              border: `1px solid ${hoverBorder} !important`,
              background: `${hoverBackground} !important`,
              boxShadow: isDarkMode 
                ? '0 4px 8px rgba(0, 0, 0, 0.25) !important' 
                : '0 2px 6px rgba(15, 23, 42, 0.12) !important',
              transform: 'translateY(-1px) !important',
            },
            ':focus-within': {
              border: `1px solid ${focusBorder} !important`,
              background: `${focusBackground} !important`,
              boxShadow: isDarkMode 
                ? `0 0 0 3px rgba(135, 206, 235, 0.1), 0 4px 12px rgba(0, 0, 0, 0.25) !important`
                : `0 0 0 3px rgba(54, 144, 206, 0.1), 0 2px 8px rgba(15, 23, 42, 0.15) !important`,
              transform: 'translateY(-1px) !important',
            }
          }
        },
        field: {
          fontSize: '10px !important',
          color: `${isDarkMode ? colours.dark.text : colours.light.text} !important`,
          fontFamily: 'Raleway, sans-serif !important',
          fontWeight: '500 !important',
          background: 'transparent !important',
          lineHeight: '16px !important',
          border: 'none !important',
          outline: 'none !important',
        },
      },
      icon: {
        color: `${isDarkMode ? colours.blue : colours.blue} !important`,
        fontSize: '12px !important',
        fontWeight: 'bold !important',
      },
      callout: {
        fontSize: '12px !important',
        borderRadius: '8px !important',
        border: `1px solid ${baseBorder} !important`,
        boxShadow: isDarkMode 
          ? '0 8px 24px rgba(0, 0, 0, 0.4) !important' 
          : '0 6px 20px rgba(15, 23, 42, 0.15) !important',
      },
      wrapper: { 
        borderRadius: '8px !important',
      },
    };
  };

  // Handle field editing
  const handleFieldEdit = (category: string, field: string, currentValue: any) => {
    setEditingField({ category, field, currentValue });
  };

  const handleFieldSave = async (newValue: string) => {
    if (!editingField || !selectedInstruction) return;

    try {
      if (editingField.category === 'risk') {
        if (!selectedOverviewItem?.risk) return;
        
        // Create updated risk object
        const updatedRisk = {
          ...selectedOverviewItem.risk,
          [editingField.field]: newValue
        };

        // Make API call to save the updated risk assessment
        const response = await fetch('/api/risk-assessments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatedRisk)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Server responded with ${response.status}`);
        }

        // Update instructionData state using the same pattern as handleRiskAssessmentSave
        setInstructionData(prev =>
          prev.map(prospect => {
            const hasInstruction = (prospect.instructions || []).some(
              (inst: any) => inst.InstructionRef === selectedInstruction.InstructionRef,
            );
            const hasDealForInstruction = (prospect.deals || []).some(
              (d: any) => d.InstructionRef === selectedInstruction.InstructionRef,
            );

            if (!hasInstruction && !hasDealForInstruction) {
              return prospect;
            }

            const updatedProspect = { ...prospect } as any;
            const riskKey = updatedProspect.riskAssessments
              ? 'riskAssessments'
              : updatedProspect.compliance
              ? 'compliance'
              : 'riskAssessments';

            const currentProspectRisks = Array.isArray(updatedProspect[riskKey])
              ? updatedProspect[riskKey]
              : [];
            updatedProspect[riskKey] = [
              ...currentProspectRisks.filter((r: any) => r.InstructionRef !== updatedRisk.InstructionRef),
              updatedRisk,
            ];

            updatedProspect.instructions = (updatedProspect.instructions || []).map((inst: any) => {
              if (inst.InstructionRef === updatedRisk.InstructionRef) {
                const instRiskKey = inst.riskAssessments
                  ? 'riskAssessments'
                  : inst.compliance
                  ? 'compliance'
                  : 'riskAssessments';
                const currentInstRisks = Array.isArray(inst[instRiskKey]) ? inst[instRiskKey] : [];
                return {
                  ...inst,
                  [instRiskKey]: [
                    ...currentInstRisks.filter((r: any) => r.InstructionRef !== updatedRisk.InstructionRef),
                    updatedRisk,
                  ],
                };
              }
              return inst;
            });

            return updatedProspect;
          }),
        );

        // Update selectedInstruction state
        setSelectedInstruction((prev: any) => {
          if (!prev || prev.InstructionRef !== updatedRisk.InstructionRef) return prev;
          const instRiskKey = prev.riskAssessments
            ? 'riskAssessments'
            : prev.compliance
            ? 'compliance'
            : 'riskAssessments';
          const arr = Array.isArray(prev[instRiskKey])
            ? prev[instRiskKey].filter((r: any) => r.InstructionRef !== updatedRisk.InstructionRef)
            : [];
          arr.push(updatedRisk);
          return { ...prev, [instRiskKey]: arr } as any;
        });

        // Update the selectedOverviewItem risk data
        if (selectedOverviewItem?.risk) {
          selectedOverviewItem.risk[editingField.field] = newValue;
        }
      } else if (editingField.category === 'identity') {
        // For identity fields, we'll make an API call to update instruction data
        // For now, we'll update local state - you might want to add a proper API endpoint
        const response = await fetch(`/api/instructions/${selectedInstruction.InstructionRef}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            [editingField.field]: newValue
          })
        });

        if (!response.ok && response.status !== 404) {
          // If endpoint doesn't exist (404), we'll just update local state
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Server responded with ${response.status}`);
        }

        // Update local state
        setInstructionData(prev =>
          prev.map(prospect => {
            const updatedProspect = { ...prospect };
            
            // Update instructions array
            updatedProspect.instructions = (updatedProspect.instructions || []).map((inst: any) => {
              if (inst.InstructionRef === selectedInstruction.InstructionRef) {
                return {
                  ...inst,
                  [editingField.field]: newValue
                };
              }
              return inst;
            });

            return updatedProspect;
          })
        );

        // Update selectedInstruction state
        setSelectedInstruction((prev: any) => {
          if (!prev || prev.InstructionRef !== selectedInstruction.InstructionRef) return prev;
          return {
            ...prev,
            [editingField.field]: newValue
          };
        });
      }

      setToast({ message: `${editingField.field} updated successfully`, type: 'success' });
    } catch (error) {
      console.error('Failed to save field:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setToast({ message: `Failed to update ${editingField.field}: ${errorMessage}`, type: 'error' });
    } finally {
      setEditingField(null);
    }
  };
  
  // Modal states for workbench operations
  const [showRiskDetails, setShowRiskDetails] = useState(false);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [showMatterDetails, setShowMatterDetails] = useState(false);
  
  // Workbench resize handlers
  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
    document.body.classList.add('workbench-resizing');
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newHeight = window.innerHeight - e.clientY;
    // Constrain between 200px and 80% of viewport height
    const constrainedHeight = Math.min(Math.max(newHeight, 200), window.innerHeight * 0.8);
    setWorkbenchHeight(constrainedHeight);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    document.body.classList.remove('workbench-resizing');
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);
  
  // Utility function for file size formatting
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };
  
  // Unified enquiries data for name mapping (separate from main enquiries)
  const [unifiedEnquiries, setUnifiedEnquiries] = useState<any[]>([]);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  
  // Manual instruction selection for actions when no card is selected
  const [showInstructionSelector, setShowInstructionSelector] = useState(false);
  const [selectorAction, setSelectorAction] = useState<'verify' | 'risk' | 'matter' | 'ccl' | null>(null);
  const [selectorProcessing, setSelectorProcessing] = useState<string | null>(null); // instruction ref being processed
  const [selectorResult, setSelectorResult] = useState<any>(null); // verification result
  
  // Client name cache for performance optimization
  // Enhanced caching for client name resolution
  const clientNameCache = useMemo(() => {
    // Load any previously cached names to avoid "unresolving" on remount/tab switch
    try {
      const saved = localStorage.getItem('clientNameCache');
      if (saved) {
        const entries = JSON.parse(saved) as Array<[string, { firstName: string; lastName: string }]>;
        if (Array.isArray(entries)) {
          return new Map<string, { firstName: string; lastName: string }>(entries);
        }
      }
    } catch {
      // ignore parse errors and start fresh
    }
    return new Map<string, { firstName: string; lastName: string }>();
  }, []);

  // Save cache to localStorage whenever it changes
  const saveClientNameCache = useCallback((cache: Map<string, { firstName: string; lastName: string }>) => {
    try {
      localStorage.setItem('clientNameCache', JSON.stringify(Array.from(cache.entries())));
    } catch (error) {
      debugWarn('Failed to save client name cache to localStorage');
    }
  }, []);

  /**
   * Fetch unified enquiries data for name mapping
   * This combines enquiries from both database sources directly
   */
  const fetchUnifiedEnquiries = async () => {
    try {
      debugLog('🔗 Fetching unified enquiries for name mapping...');
      
      // Check if we already have cached data in sessionStorage
      const cached = sessionStorage.getItem('unifiedEnquiries');
      const cacheTime = sessionStorage.getItem('unifiedEnquiriesTime');
      const oneHour = 60 * 60 * 1000; // Extended to 1 hour for better performance
      
      if (cached && cacheTime && (Date.now() - parseInt(cacheTime) < oneHour)) {
        debugLog('📦 Using cached unified enquiries data');
        const cachedData = JSON.parse(cached);
        setUnifiedEnquiries(cachedData);
        return;
      }
      
      // Try the server route directly
      try {
        const response = await fetch('/api/enquiries-unified');
        if (response.ok) {
          const data = await response.json();
          debugLog(`✅ Fetched ${data.count} unified enquiries from both databases`);
          debugLog('🔍 Sample unified enquiries data:', data.enquiries?.slice(0, 3));
          debugLog('🔍 Looking for prospect 27671:', data.enquiries?.find((e: any) => 
            e.ID === '27671' || e.id === '27671' || e.acid === '27671' || e.card_id === '27671'
          ));
          const enquiries = data.enquiries || [];
          setUnifiedEnquiries(enquiries);
          
          // Cache the results - wrap in try/catch to handle QuotaExceededError
          try {
            sessionStorage.setItem('unifiedEnquiries', JSON.stringify(enquiries));
            sessionStorage.setItem('unifiedEnquiriesTime', Date.now().toString());
          } catch (cacheError: any) {
            if (cacheError.name === 'QuotaExceededError') {
              debugWarn('⚠️ SessionStorage quota exceeded, skipping unified enquiries cache');
              // Try to clear old cache and retry with reduced data
              try {
                sessionStorage.removeItem('unifiedEnquiries');
                sessionStorage.removeItem('unifiedEnquiriesTime');
                // Store only essential fields for name lookup
                const reducedEnquiries = enquiries.map((e: any) => ({
                  ID: e.ID || e.id,
                  First_Name: e.First_Name || e.first,
                  Last_Name: e.Last_Name || e.last
                }));
                sessionStorage.setItem('unifiedEnquiries', JSON.stringify(reducedEnquiries));
                sessionStorage.setItem('unifiedEnquiriesTime', Date.now().toString());
                debugLog('✅ Cached reduced enquiries dataset');
              } catch (retryError) {
                debugWarn('⚠️ Could not cache even reduced dataset, proceeding without cache');
              }
            } else {
              debugWarn('⚠️ Unexpected caching error:', cacheError);
            }
          }
          return;
        } else {
          debugLog(`❌ Unified route failed with status: ${response.status} ${response.statusText}`);
          const errorText = await response.text();
          debugLog(`❌ Error details:`, errorText);
        }
      } catch (err) {
        debugLog('📝 Unified route not available yet, falling back to direct queries...', err);
      }

      // Fallback: Fetch from both sources directly
      const [mainEnquiries, instructionsData] = await Promise.all([
        // Main enquiries (helix-core-data via SQL)
        fetch('/api/enquiries').then(res => res.ok ? res.json() : { enquiries: [] }),
        // Instructions data (already has ProspectId info)
        fetch('/api/instructions').then(res => res.ok ? res.json() : { instructions: [] })
      ]);

      debugLog(`📊 Fallback data: ${mainEnquiries.enquiries?.length || 0} main enquiries, ${instructionsData.instructions?.length || 0} instructions`);

      // Combine data sources for name mapping
      const combinedEnquiries = [
        ...(mainEnquiries.enquiries || []),
        // Extract prospect info from instructions - check both deal and instruction level
        ...(instructionsData.instructions || []).map((inst: any) => {
          // Try to get ProspectId from deal first, then instruction level
          const prospectId = inst.deal?.ProspectId || inst.ProspectId;
          const firstName = inst.FirstName || inst.deal?.FirstName || '';
          const lastName = inst.LastName || inst.deal?.LastName || '';
          const email = inst.Email || inst.deal?.LeadClientEmail || '';
          
          return {
            acid: prospectId,
            first: firstName,
            last: lastName,
            email: email,
            db_source: 'instructions'
          };
        }).filter((item: any) => item.acid && (item.first || item.last))
      ];

      debugLog(`✅ Combined ${combinedEnquiries.length} enquiries for name mapping (${mainEnquiries.enquiries?.length || 0} from main + ${instructionsData.instructions?.filter((i: any) => i.deal?.ProspectId || i.ProspectId).length || 0} from instructions)`);
      
      setUnifiedEnquiries(combinedEnquiries);
      
      // Cache the fallback results too - wrap in try/catch to handle QuotaExceededError
      try {
        sessionStorage.setItem('unifiedEnquiries', JSON.stringify(combinedEnquiries));
        sessionStorage.setItem('unifiedEnquiriesTime', Date.now().toString());
      } catch (cacheError: any) {
        if (cacheError.name === 'QuotaExceededError') {
          debugWarn('⚠️ SessionStorage quota exceeded, skipping fallback cache');
        } else {
          debugWarn('⚠️ Unexpected fallback caching error:', cacheError);
        }
      }
      
    } catch (error) {
      console.error('❌ Error fetching unified enquiries:', error);
      setUnifiedEnquiries([]);
    }
  };

  /**
   * Lookup client name by ProspectId (which matches ACID in enquiries data)
   * @param prospectId The ProspectId value to search for
   * @returns Object with firstName and lastName, or empty strings if not found
   */
  // Create indexed lookup for O(1) performance
  const enquiryLookupMap = useMemo(() => {
    if (!unifiedEnquiries || unifiedEnquiries.length === 0) return new Map();
    
    const map = new Map<string, { firstName: string; lastName: string }>();
    unifiedEnquiries.forEach((enq: any) => {
      const enqId = String(enq.ID || enq.id || enq.acid || enq.ACID || enq.Acid);
      if (enqId && enqId !== 'undefined') {
        map.set(enqId, {
          firstName: enq.First_Name || enq.first || enq.First || enq.firstName || enq.FirstName || '',
          lastName: enq.Last_Name || enq.last || enq.Last || enq.lastName || enq.LastName || ''
        });
      }
    });
    
    debugLog(`📇 Built enquiry lookup index with ${map.size} entries`);
    return map;
  }, [unifiedEnquiries]);

  const getClientNameByProspectId = useCallback((prospectId: string | number | undefined): { firstName: string; lastName: string } => {
    if (!prospectId) {
      return { firstName: '', lastName: '' };
    }

    // Convert prospectId to string for consistent caching
    const prospectIdStr = String(prospectId);

    // Fast path: Check cache first for immediate response - prioritize this over everything
    const cached = clientNameCache.get(prospectIdStr);
    if (cached && (cached.firstName?.trim() || cached.lastName?.trim())) {
      return cached;
    }

    // If unified enquiries not loaded yet, try to find name in current instruction data
    if (!unifiedEnquiries || unifiedEnquiries.length === 0) {
      // Look for the name in the current instruction being displayed
      const currentInstructionData = instructionData.length > 0 ? instructionData : allInstructionData;
      const matchingInstruction = currentInstructionData.find((inst: any) => {
        const instrProspectId = inst.deal?.ProspectId || inst.ProspectId;
        return instrProspectId?.toString() === prospectIdStr;
      });
      
      if (matchingInstruction) {
        // Cast to any since instruction data can have various dynamic properties
        const inst = matchingInstruction as any;
        const firstName = inst.FirstName || inst.Name?.split(' ')[0] || '';
        const lastName = inst.LastName || inst.Name?.split(' ')[1] || '';
        if (firstName?.trim() || lastName?.trim()) {
          const result = { firstName: firstName?.trim() || '', lastName: lastName?.trim() || '' };
          // Cache this result in memory and localStorage
          clientNameCache.set(prospectIdStr, result);
          saveClientNameCache(clientNameCache);
          return result;
        }
      }
      
      // If we have cached data but unified enquiries not loaded, return cached even if empty
      // This prevents "unresolving" when tab switching
      if (cached) {
        return cached;
      }
      
      return { firstName: '', lastName: '' };
    }

    // O(1) lookup instead of O(n) search
    const enquiryResult = enquiryLookupMap.get(prospectIdStr);
    
    if (prospectIdStr === '27671') {
      debugLog('🔍 Fast lookup for 27671 in index:', enquiryLookupMap.has(prospectIdStr));
      debugLog('🔍 Found enquiry for 27671:', enquiryResult);
    }

    let result = enquiryResult || (cached || { firstName: '', lastName: '' }); // Fallback to cached if available
    
    // If still no name found, derive from instruction email as a last resort (common in "initialised" stage)
    if (!(result.firstName?.trim() || result.lastName?.trim())) {
      // Search in current instruction data for matching prospect
      const source = instructionData.length > 0 ? instructionData : allInstructionData;
      const prospect = source.find((p: any) => {
        if (String(p.prospectId || '') === prospectIdStr) return true;
        if (Array.isArray(p.deals) && p.deals.some((d: any) => String(d.ProspectId || d.prospectId || '') === prospectIdStr)) return true;
        if (Array.isArray(p.instructions) && p.instructions.some((i: any) => String(i.ProspectId || i.deal?.ProspectId || '') === prospectIdStr)) return true;
        return false;
      });
      let email = '';
      if (prospect) {
        const inst = (prospect.instructions || []).find((i: any) => String(i.ProspectId || i.deal?.ProspectId || '') === prospectIdStr);
        const deal = (prospect.deals || []).find((d: any) => String(d.ProspectId || d.prospectId || '') === prospectIdStr);
        email = (inst?.Email || deal?.LeadClientEmail || '').toString();
      }
      if (email.includes('@')) {
        const local = email.split('@')[0];
        // Split on common separators and remove digits/empties
        const tokens = local
          .split(/[._-]+/)
          .map((t: string) => t.replace(/\d+/g, ''))
          .filter((t: string) => t);
        if (tokens.length > 0) {
          const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
          const first = cap(tokens[0]);
          const last = tokens.length > 1 ? cap(tokens[1]) : '';
          result = { firstName: first, lastName: last };
        }
      }
    }
    
    // Only cache non-empty results to avoid overwriting good cached data with empty data
    if (result.firstName?.trim() || result.lastName?.trim() || !cached) {
      clientNameCache.set(prospectIdStr, result);
      saveClientNameCache(clientNameCache);
    }
    
    return result;
  }, [enquiryLookupMap, clientNameCache, saveClientNameCache, instructionData, allInstructionData]);

  const handleRiskAssessmentSave = (risk: any) => {
    setInstructionData(prev =>
      prev.map(prospect => {
        // Only update the prospect that contains this instruction
        const hasInstruction = (prospect.instructions || []).some(
          (inst: any) => inst.InstructionRef === risk.InstructionRef,
        );
        const hasDealForInstruction = (prospect.deals || []).some(
          (d: any) => d.InstructionRef === risk.InstructionRef,
        );

        if (!hasInstruction && !hasDealForInstruction) {
          return prospect; // untouched
        }

        const updatedProspect = { ...prospect } as any;
        const riskKey = updatedProspect.riskAssessments
          ? 'riskAssessments'
          : updatedProspect.compliance
          ? 'compliance'
          : 'riskAssessments';

        const currentProspectRisks = Array.isArray(updatedProspect[riskKey])
          ? updatedProspect[riskKey]
          : [];
        updatedProspect[riskKey] = [
          ...currentProspectRisks.filter((r: any) => r.InstructionRef !== risk.InstructionRef),
          risk,
        ];

        updatedProspect.instructions = (updatedProspect.instructions || []).map((inst: any) => {
          if (inst.InstructionRef === risk.InstructionRef) {
            const instRiskKey = inst.riskAssessments
              ? 'riskAssessments'
              : inst.compliance
              ? 'compliance'
              : 'riskAssessments';
            const currentInstRisks = Array.isArray(inst[instRiskKey]) ? inst[instRiskKey] : [];
            return {
              ...inst,
              [instRiskKey]: [
                ...currentInstRisks.filter((r: any) => r.InstructionRef !== risk.InstructionRef),
                risk,
              ],
            };
          }
          return inst;
        });

        return updatedProspect;
      }),
    );

    setSelectedInstruction((prev: any) => {
      if (!prev || prev.InstructionRef !== risk.InstructionRef) return prev;
      const instRiskKey = prev.riskAssessments
        ? 'riskAssessments'
        : prev.compliance
        ? 'compliance'
        : 'riskAssessments';
      const arr = Array.isArray(prev[instRiskKey])
        ? prev[instRiskKey].filter((r: any) => r.InstructionRef !== risk.InstructionRef)
        : [];
      arr.push(risk);
      return { ...prev, [instRiskKey]: arr } as any;
    });

    setSelectedRisk(risk);
    
    // Close the risk assessment modal
    setShowRiskPage(false);
  };

  const handleRiskAssessmentDelete = async (instructionRef: string) => {
    try {
      const res = await fetch(`/api/risk-assessments/${encodeURIComponent(instructionRef)}`, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Delete failed ${res.status}: ${text}`);
      }

      // Update local state: remove risk from matching prospect/instruction
      setInstructionData(prev => prev.map(prospect => {
        const contains = (prospect.instructions || []).some((i: any) => i.InstructionRef === instructionRef);
        if (!contains) return prospect;
        const updated = { ...prospect } as any;
        const key = updated.riskAssessments ? 'riskAssessments' : (updated.compliance ? 'compliance' : 'riskAssessments');
        if (Array.isArray(updated[key])) {
          updated[key] = updated[key].filter((r: any) => r.InstructionRef !== instructionRef);
        }
        updated.instructions = (updated.instructions || []).map((inst: any) => {
          if (inst.InstructionRef !== instructionRef) return inst;
          const instKey = inst.riskAssessments ? 'riskAssessments' : (inst.compliance ? 'compliance' : 'riskAssessments');
          const arr = Array.isArray(inst[instKey]) ? inst[instKey].filter((r: any) => r.InstructionRef !== instructionRef) : [];
          return { ...inst, [instKey]: arr };
        });
        return updated;
      }));

      // If the currently selected instruction matches, clear selectedRisk
      if (selectedInstruction?.InstructionRef === instructionRef) {
        setSelectedRisk(null);
      }

    } catch (err) {
      console.error('Failed to delete risk assessment', err);
      alert('Failed to delete risk assessment.');
    }
  };

  // Handle deal editing
  const handleDealEdit = useCallback(async (dealId: number, updates: { ServiceDescription?: string; Amount?: number }) => {
    try {
      debugLog('Updating deal:', dealId, updates);
      
      // Call the API endpoint to update the deal
      const response = await fetch('/api/update-deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, ...updates })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update deal');
      }
      
      const result = await response.json();
      debugLog('Deal updated successfully:', result);
      
      // Update local state with the updated deal
      setInstructionData(prev => 
        prev.map(prospect => ({
          ...prospect,
          deals: (prospect.deals || []).map((deal: any) => 
            deal.DealId === dealId ? { ...deal, ...updates } : deal
          ),
          instructions: (prospect.instructions || []).map((inst: any) => ({
            ...inst,
            deals: (inst.deals || []).map((deal: any) => 
              deal.DealId === dealId ? { ...deal, ...updates } : deal
            )
          }))
        }))
      );
      
      return result;
    } catch (error) {
      console.error('Error updating deal:', error);
      throw error;
    }
  }, []);

  // Handle status updates from matter operations
  const handleStatusUpdate = () => {
    console.log('Status update triggered - refreshing instruction data');
    // Force a refresh of instruction data if needed
    setInstructionData(prev => [...prev]); // Trigger re-render
  };

  // Notify parent when matter opening workflow state changes
  useEffect(() => {
    if (setIsInMatterOpeningWorkflow) {
      setIsInMatterOpeningWorkflow(showNewMatterPage);
    }
  }, [showNewMatterPage, setIsInMatterOpeningWorkflow]);

  // Check for navigation trigger from Home component
  useEffect(() => {
    const shouldOpenMatterOpening = localStorage.getItem('openMatterOpening');
    if (shouldOpenMatterOpening === 'true') {
      // Clear the flag
      localStorage.removeItem('openMatterOpening');
      // Open matter opening if not already open
      if (!showNewMatterPage) {
        setShowNewMatterPage(true);
        // Removed smooth scrolling to avoid visual jolts during transition
        // setTimeout(() => { window.scrollTo({ top: 0 }); }, 0);
      }
    }
  }, []); // Only run on mount

  // Resolve the selected deal for the active instruction (used by Workbench)
  const selectedDeal = useMemo(() => {
    if (!selectedInstruction) return null;
    const instRef = String((selectedInstruction as any).InstructionRef ?? "");
    if (!instRef) return null;

    const dealsFromInst = (selectedInstruction as any).deals as unknown;
    if (Array.isArray(dealsFromInst)) {
      const match = dealsFromInst.find((d: unknown) =>
        d && typeof d === "object" && String((d as any).InstructionRef ?? "") === instRef
      );
      if (match) return match as { DealId: number; ServiceDescription?: string; Amount?: number };
    }

    // Fallback: scan current instructionData then allInstructionData for matching deal
    const scan = (arr: Array<{ deals?: any[] }> | undefined) => {
      if (!arr) return null;
      for (const p of arr) {
        const d = (p.deals || []).find((x: any) => String(x?.InstructionRef ?? "") === instRef);
        if (d) return d as { DealId: number; ServiceDescription?: string; Amount?: number };
      }
      return null;
    };
    return scan(instructionData) || scan(allInstructionData);
  }, [selectedInstruction, instructionData, allInstructionData]);

  

  // Filter states
  const [clientsActionFilter, setClientsActionFilter] = useState<'All' | 'Verify ID' | 'Assess Risk' | 'Open Matter' | 'Draft CCL' | 'Complete'>('All');
  const [pitchesStatusFilter, setPitchesStatusFilter] = useState<'All' | 'Open' | 'Closed'>('All');
  const [riskStatusFilter, setRiskStatusFilter] = useState<'All' | 'Outstanding' | 'Completed'>('All');
  
  // Unified secondary filter state - tracks the secondary filter value for each tab
  const [secondaryFilter, setSecondaryFilter] = useState<string>(() => {
    switch (activeTab) {
      case 'clients': return '';
      case 'pitches': return pitchesStatusFilter;
      case 'risk': return riskStatusFilter;
      default: return '';
    }
  });
  
  const [riskFilterRef, setRiskFilterRef] = useState<string | null>(null);
  const [showAllInstructions, setShowAllInstructions] = useState<boolean>(false); // User toggle for mine vs all instructions - defaults to false (show user's own data first)
  // Layout: 1 or 2 columns for overview grid
  const [twoColumn, setTwoColumn] = useState<boolean>(false);
  
  const currentUser: UserData | undefined = userData?.[0] || (localUserData as UserData[])[0];
  // Admin detection using proper utility
  const isAdmin = isAdminUser(userData?.[0] || null);
  const isLocalhost = (typeof window !== 'undefined') && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
  // State for showing only user's own pitches/deals (defaults to true for non-admin users)
  const [showOnlyMyDeals, setShowOnlyMyDeals] = useState<boolean>(!isAdmin);

  // Update showOnlyMyDeals when user changes (for user switching)
  useEffect(() => {
    // For non-admin users, always show only their deals
    // For admin users, keep current state or default to false (show everyone's)
    if (!isAdmin) {
      setShowOnlyMyDeals(true);
    }
  }, [isAdmin, currentUser?.Email]);

  // Reset admin toggle when user changes to ensure proper initial state
  useEffect(() => {
    // Reset to show user's own data when switching users
    setShowAllInstructions(false);
  }, [currentUser?.Email]);

  // Fetch unified enquiries data for name mapping on component load
  useEffect(() => {
    fetchUnifiedEnquiries();
  }, []);
  
  // Window resize effect for responsive filters
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Redirect from risk tab in production
  useEffect(() => {
    if (!isLocalhost && activeTab === 'risk') {
      setActiveTab('pitches');
    }
  }, [isLocalhost, activeTab]);
  
  // Show workbench when instruction is selected
  // Removed automatic workbench hiding logic - workbench now stays visible
  
  const filterInstructionsForUser = useCallback((sourceData: InstructionData[]) => {
    if (!currentUser || (!currentUser.Email && !currentUser.Initials) || sourceData.length === 0) {
      return sourceData;
    }

    const userEmail = currentUser.Email?.toLowerCase() ?? '';
    const userInitials = currentUser.Initials?.toUpperCase() ?? '';

    const filtered = sourceData.filter((instruction: any, index) => {
      if (index < 3) {
        debugLog('🔍 Sample instruction structure:', {
          prospectId: instruction.prospectId,
          Email: instruction.Email,
          Lead: instruction.Lead,
          assignedTo: instruction.assignedTo,
          poc: instruction.poc,
          POC: instruction.POC,
          deals: instruction.deals?.map((d: any) => ({
            DealId: d.DealId,
            PitchedBy: d.PitchedBy,
            Status: d.Status,
            Email: d.Email,
            Lead: d.Lead,
            assignedTo: d.assignedTo,
            poc: d.poc
          })),
          instructions: instruction.instructions?.map((i: any) => ({
            InstructionRef: i.InstructionRef,
            HelixContact: i.HelixContact
          }))
        });
      }

      const belongsToUser = (
        instruction.deals?.some((deal: any) => deal.PitchedBy?.toUpperCase() === userInitials) ||
        instruction.instructions?.some((inst: any) => inst.HelixContact?.toUpperCase() === userInitials) ||
        instruction.Email?.toLowerCase() === userEmail ||
        instruction.Lead?.toLowerCase() === userEmail ||
        instruction.assignedTo?.toLowerCase() === userEmail ||
        instruction.poc?.toLowerCase() === userEmail ||
        instruction.POC?.toUpperCase() === userInitials ||
        instruction.deal?.Email?.toLowerCase() === userEmail ||
        instruction.deal?.Lead?.toLowerCase() === userEmail ||
        instruction.deal?.assignedTo?.toLowerCase() === userEmail ||
        instruction.deal?.poc?.toLowerCase() === userEmail ||
        instruction.deal?.PitchedBy?.toUpperCase() === userInitials ||
        instruction.deals?.some((deal: any) =>
          deal.Email?.toLowerCase() === userEmail ||
          deal.Lead?.toLowerCase() === userEmail ||
          deal.assignedTo?.toLowerCase() === userEmail ||
          deal.poc?.toLowerCase() === userEmail
        )
      );

      const isOtherUnsure = (
        instruction.instructions?.some((inst: any) => {
          const area = inst.AreaOfWork || inst.Area_of_Work || inst.areaOfWork || '';
          return area.toLowerCase().includes('other') && area.toLowerCase().includes('unsure');
        }) ||
        instruction.deals?.some((deal: any) => {
          const area = deal.AreaOfWork || deal.Area_of_Work || deal.areaOfWork || '';
          return area.toLowerCase().includes('other') && area.toLowerCase().includes('unsure');
        }) ||
        (() => {
          const area = instruction.AreaOfWork || instruction.Area_of_Work || instruction.areaOfWork || '';
          return area.toLowerCase().includes('other') && area.toLowerCase().includes('unsure');
        })()
      );

  // Only include items that belong to the current user in 'Mine' view.
  // Previously we also included items with Area of Work containing 'other' & 'unsure' for everyone,
  // which caused unrelated 'Other' instructions to appear. That logic is removed here.
  const shouldInclude = belongsToUser;

      if (shouldInclude) {
        debugLog('✅ Instruction included:', {
          prospectId: instruction.prospectId,
          userEmail,
          userInitials,
          belongsToUser,
          isOtherUnsure,
          areaOfWork: instruction.instructions?.[0]?.AreaOfWork || instruction.deals?.[0]?.AreaOfWork || instruction.AreaOfWork,
          matchedFields: {
            instruction_Email: instruction.Email?.toLowerCase() === userEmail,
            instruction_poc: instruction.poc?.toLowerCase() === userEmail,
            deal_Email: instruction.deal?.Email?.toLowerCase() === userEmail,
            deal_poc: instruction.deal?.poc?.toLowerCase() === userEmail,
            deals_any: instruction.deals?.some((d: any) => d.poc?.toLowerCase() === userEmail)
          }
        });
      }

      return shouldInclude;
    });

    debugLog('🔄 Filtered to user instructions:', {
      sourceLength: sourceData.length,
      filteredLength: filtered.length
    });

    return filtered;
  }, [currentUser]);

  // Get effective instruction data based on admin mode and user filtering
  const { effectiveInstructionData, userInstructionData } = useMemo(() => {
    debugLog('🔄 effectiveInstructionData calculation:', {
      isAdmin,
      showAllInstructions,
      instructionDataLength: instructionData.length,
      allInstructionDataLength: allInstructionData.length,
      currentUserEmail: currentUser?.Email,
      currentUserInitials: currentUser?.Initials
    });

    const sourceData = instructionData.length > 0 ? instructionData : allInstructionData;
    const filteredForUser = filterInstructionsForUser(sourceData);

    let result = filteredForUser;

    if (showAllInstructions && allInstructionData.length > 0) {
      result = allInstructionData;
      debugLog('🔄 User viewing ALL instructions (including Other/Unsure)');
    } else {
      debugLog('🔄 User viewing OWN instructions (filtered)');
    }

    debugLog('🔄 effectiveInstructionData updated:', {
      isAdmin,
      showAllInstructions,
      currentUserEmail: currentUser?.Email,
      currentUserInitials: currentUser?.Initials,
      allInstructionDataLength: allInstructionData.length,
      instructionDataLength: instructionData.length,
      resultLength: result.length,
      userResultLength: filteredForUser.length,
      usingAllData: showAllInstructions && allInstructionData.length > 0,
      filteringByUser: !showAllInstructions,
      sampleFilteredItems: result.slice(0, 2).map(r => ({
        prospectId: r.prospectId,
        hasInstructions: r.instructions?.length || 0,
        hasDeals: r.deals?.length || 0,
        deals: r.deals?.map((d: any) => ({
          DealId: d.DealId,
          InstructionRef: d.InstructionRef,
          Email: d.Email,
          Lead: d.Lead,
          assignedTo: d.assignedTo,
          Status: d.Status
        })),
        instructions: r.instructions?.map((i: any) => ({
          InstructionRef: i.InstructionRef
        }))
      }))
    });

    return {
      effectiveInstructionData: result,
      userInstructionData: filteredForUser
    };
  }, [
    isAdmin,
    showAllInstructions,
    allInstructionData,
    instructionData,
    currentUser,
    filterInstructionsForUser
  ]);

  // Calculate toggle counts based on active tab and current data
  const toggleCounts = useMemo(() => {
    if (activeTab === 'pitches') {
      // For Pitches tab: count deals that don't have instructions yet
      const myPitchesCount = userInstructionData.reduce((count, prospect) => {
        const pitchedDeals = prospect.deals?.filter((deal: any) => 
          !prospect.instructions?.some((inst: any) => inst.InstructionRef === deal.InstructionRef)
        ) || [];
        return count + pitchedDeals.length;
      }, 0);
      
      const allPitchesCount = allInstructionData.reduce((count, prospect) => {
        const pitchedDeals = prospect.deals?.filter((deal: any) => 
          !prospect.instructions?.some((inst: any) => inst.InstructionRef === deal.InstructionRef)
        ) || [];
        return count + pitchedDeals.length;
      }, 0);
      
      return {
        mine: myPitchesCount,
        all: allPitchesCount,
        label: 'pitches'
      };
    } else {
      // For Instructions tab: count actual instructions
      const myInstructionsCount = userInstructionData.reduce((count, prospect) => {
        return count + (prospect.instructions?.length || 0);
      }, 0);
      
      const allInstructionsCount = allInstructionData.reduce((count, prospect) => {
        return count + (prospect.instructions?.length || 0);
      }, 0);
      
      return {
        mine: myInstructionsCount,
        all: allInstructionsCount,
        label: 'instructions'
      };
    }
  }, [activeTab, userInstructionData, allInstructionData]);
  
  const showDraftPivot = true; // Allow all users to see Document editor

  // Unified filter configuration
  const allFilterOptions: TwoLayerFilterOption[] = [
    {
      key: 'pitches',
      label: 'Pitches',
      subOptions: [
        { key: 'All', label: 'All' },
        { key: 'Open', label: 'Open' },
        { key: 'Closed', label: 'Closed' }
      ]
    },
    {
      key: 'clients',
      label: 'Clients',
      subOptions: [] // Remove status filter for Instructions
    },
    {
      key: 'risk',
      label: 'Risk',
      subOptions: [
        { key: 'All', label: 'All' },
        { key: 'Outstanding', label: 'Outstanding' },
        { key: 'Completed', label: 'Completed' }
      ]
    }
  ];

  // Filter options based on environment - hide risk from production
  const filterOptions: TwoLayerFilterOption[] = isLocalhost 
    ? allFilterOptions 
    : allFilterOptions.filter(option => option.key !== 'risk');

  // Unified filter handlers
  const handlePrimaryFilterChange = (key: string) => {
    setActiveTab(key as 'pitches' | 'clients' | 'risk');
    // Reset secondary filter to the default for the new tab
    switch (key) {
      case 'clients':
        setSecondaryFilter('');
        break;
      case 'pitches':
        setSecondaryFilter(pitchesStatusFilter);
        break;
      case 'risk':
        setSecondaryFilter(riskStatusFilter);
        break;
    }
  };

  const handleSecondaryFilterChange = (key: string) => {
    setSecondaryFilter(key);
    // Update the appropriate individual filter state
    switch (activeTab) {
      case 'clients':
        // Status filter removed for clients
        break;
      case 'pitches':
        setPitchesStatusFilter(key as any);
        break;
      case 'risk':
        setRiskStatusFilter(key as any);
        break;
    }
  };

  // Sync secondary filter when tab changes
  React.useEffect(() => {
    switch (activeTab) {
      case 'clients':
        setSecondaryFilter('');
        break;
      case 'pitches':
        setSecondaryFilter(pitchesStatusFilter);
        break;
      case 'risk':
        setSecondaryFilter(riskStatusFilter);
        break;
    }
  }, [activeTab, pitchesStatusFilter, riskStatusFilter, isAdmin]);

  // Clear selection when leaving overview tab
  // Clear selection when leaving clients tab
  useEffect(() => {
    if (activeTab !== "clients") {
      setSelectedInstruction(null);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "risk") {
      setRiskFilterRef(null);
    }
  }, [activeTab]);

  // CustomTabs is 48px tall and sticky at top: 0, so account for it
  const CUSTOM_TABS_HEIGHT = 48;
  const ACTION_BAR_HEIGHT = 48;

  const quickLinksStyle = (dark: boolean) =>
    mergeStyles({
      backgroundColor: dark
        ? colours.dark.sectionBackground
        : colours.light.sectionBackground,
      boxShadow: dark
        ? "0 2px 6px rgba(0,0,0,0.5)"
        : "0 2px 6px rgba(0,0,0,0.12)",
      padding: "10px 24px 12px 24px", // Taller bar like Enquiries
      transition: "background-color 0.3s",
      display: "flex",
      flexDirection: "row",
      gap: "8px",
      overflowX: "auto",
      msOverflowStyle: "none",
      scrollbarWidth: "none",
      alignItems: "center",
      position: "sticky",
      top: CUSTOM_TABS_HEIGHT + ACTION_BAR_HEIGHT,
      zIndex: 999,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      selectors: {
        '::-webkit-scrollbar': {
          display: 'none',
        },
        '@media (max-width: 768px)': {
          flexWrap: 'wrap',
          padding: '10px 16px 12px 16px',
        }
      },
    });

  const detailNavStyle = (dark: boolean) =>
    mergeStyles({
      backgroundColor: dark
        ? colours.dark.sectionBackground
        : colours.light.sectionBackground,
      boxShadow: dark
        ? "0 2px 6px rgba(0,0,0,0.5)"
        : "0 2px 6px rgba(0,0,0,0.12)",
      borderTop: dark
        ? "1px solid rgba(255,255,255,0.1)"
        : "1px solid rgba(0,0,0,0.05)",
      padding: "10px 24px 12px 24px", // Match taller style
      display: "flex",
      flexDirection: "row",
      gap: "8px",
      alignItems: "center",
      position: "sticky",
      top: CUSTOM_TABS_HEIGHT + ACTION_BAR_HEIGHT,
      zIndex: 999,
    });

  const pivotBarStyle = (dark: boolean) =>
    mergeStyles({
      backgroundColor: dark
        ? colours.dark.sectionBackground
        : colours.light.sectionBackground,
      boxShadow: dark
        ? "0 2px 4px rgba(0,0,0,0.4)"
        : "0 2px 4px rgba(0,0,0,0.1)",
      borderTop: dark
        ? "1px solid rgba(255,255,255,0.1)"
        : "1px solid rgba(0,0,0,0.05)",
      padding: "0 24px",
      transition: "background-color 0.3s",
      position: "sticky",
      top: CUSTOM_TABS_HEIGHT + ACTION_BAR_HEIGHT * 2,
      zIndex: 998,
      // Responsive padding
      '@media (max-width: 768px)': {
        padding: "0 16px",
      },
      '@media (max-width: 480px)': {
        padding: "0 12px",
      },
    });

  const useLocalData =
    (typeof process !== 'undefined' && process.env && process.env.REACT_APP_USE_LOCAL_DATA === "true") ||
    window.location.hostname === "localhost";

const workbenchPanelBackground = (isDarkMode: boolean): string => (
  isDarkMode
    ? 'linear-gradient(135deg, rgba(17, 24, 39, 0.94) 0%, rgba(15, 23, 42, 0.98) 100%)'
    : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)'
);

const workbenchHeaderBackground = (isDarkMode: boolean): string => (
  isDarkMode 
    ? 'linear-gradient(135deg, rgba(6, 23, 51, 0.95) 0%, rgba(13, 47, 96, 0.98) 100%)'
    : `linear-gradient(135deg, ${colours.darkBlue} 0%, ${colours.missedBlue} 100%)`
);

const workbenchCardBackground = (isDarkMode: boolean): string => (
  isDarkMode
    ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.92) 0%, rgba(15, 23, 42, 0.96) 100%)'
    : '#FFFFFF'
);

const workbenchBorderColour = (isDarkMode: boolean): string => (
  isDarkMode ? 'rgba(148, 163, 184, 0.32)' : '#e2e8f0'
);

const workbenchMutedText = (isDarkMode: boolean): string => (
  isDarkMode ? 'rgba(226, 232, 240, 0.72)' : '#64748b'
);

const workbenchButtonHover = (isDarkMode: boolean): string => (
  isDarkMode ? 'rgba(59, 130, 246, 0.2)' : '#f0f9ff'
);

  const isProduction = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === "production") && !useLocalData;
  // Subtle Helix watermark generator – three rounded ribbons rotated slightly
  const helixWatermarkSvg = (dark: boolean) => {
    const fill = dark ? '%23FFFFFF' : '%23061733';
    const opacity = dark ? '0.06' : '0.035';
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900' viewBox='0 0 900 900'>
      <g transform='rotate(-12 450 450)'>
        <path d='M160 242 C160 226 176 210 200 210 L560 210 Q640 235 560 274 L200 274 C176 274 160 258 160 242 Z' fill='${fill}' fill-opacity='${opacity}'/>
        <path d='M160 362 C160 346 176 330 200 330 L560 330 Q640 355 560 394 L200 394 C176 394 160 378 160 362 Z' fill='${fill}' fill-opacity='${opacity}'/>
        <path d='M160 482 C160 466 176 450 200 450 L560 450 Q640 475 560 514 L200 514 C176 514 160 498 160 482 Z' fill='${fill}' fill-opacity='${opacity}'/>
      </g>
    </svg>`;
    return `url("data:image/svg+xml,${svg}")`;
  };

  const handleBack = () => {
    if (showNewMatterPage) {
      setShowNewMatterPage(false);
      setSelectedInstruction(null);
  setPendingInstructionRef('');
    } else if (showRiskPage) {
      setShowRiskPage(false);
      setSelectedRisk(null);
    } else if (showEIDPage) {
      setShowEIDPage(false);
    }
  };

  useEffect(() => {
    // Early exit with navigator content for special states
    // IMPORTANT: Do NOT show the old back-only navigator for Matter Opening anymore.
    // Keep back-only header for Risk/EID views only.
    if (showRiskPage || showEIDPage) {
      setContent(
        <div className={detailNavStyle(isDarkMode)}>
          <div 
            className="nav-back-button"
            onClick={handleBack}
            style={{
              background: isDarkMode ? colours.dark.sectionBackground : "#f3f3f3",
              border: '1px solid #e1dfdd',
              borderRadius: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              position: 'relative',
              overflow: 'hidden',
              marginRight: 8,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e7f1ff';
              e.currentTarget.style.border = '1px solid #3690CE';
              e.currentTarget.style.width = '120px';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(54,144,206,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDarkMode ? colours.dark.sectionBackground : "#f3f3f3";
              e.currentTarget.style.border = '1px solid #e1dfdd';
              e.currentTarget.style.width = '32px';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
            }}
            title="Back"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                handleBack();
              }
            }}
          >
            {/* ChevronLeft Icon */}
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 16 16" 
              fill="none"
              style={{
                transition: 'color 0.3s, opacity 0.3s',
                color: isDarkMode ? '#ffffff' : '#666666',
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            >
              <path 
                d="M10 12L6 8L10 4" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
            
            {/* Expandable Text */}
            <span 
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '14px',
                fontWeight: 600,
                color: '#3690CE',
                opacity: 0,
                transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                whiteSpace: 'nowrap',
              }}
              className="back-text"
            >
              Back
            </span>
          </div>
          
          <style>{`
            .nav-back-button:hover .back-text {
              opacity: 1 !important;
            }
            .nav-back-button:hover svg {
              opacity: 0 !important;
            }
          `}</style>
        </div>
      );
      return () => setContent(null);
    }

    if (riskFilterRef) {
      setContent(
        <div className={detailNavStyle(isDarkMode)}>
          <div 
            className="nav-back-button"
            onClick={() => setRiskFilterRef(null)}
            style={{
              background: isDarkMode ? colours.dark.sectionBackground : "#f3f3f3",
              border: '1px solid #e1dfdd',
              borderRadius: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              position: 'relative',
              overflow: 'hidden',
              marginRight: 8,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e7f1ff';
              e.currentTarget.style.border = '1px solid #3690CE';
              e.currentTarget.style.width = '150px';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(54,144,206,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDarkMode ? colours.dark.sectionBackground : "#f3f3f3";
              e.currentTarget.style.border = '1px solid #e1dfdd';
              e.currentTarget.style.width = '32px';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
            }}
            title="Back to Risk & Compliance"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setRiskFilterRef(null);
              }
            }}
          >
            {/* ChevronLeft Icon */}
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 16 16" 
              fill="none"
              style={{
                transition: 'color 0.3s, opacity 0.3s',
                color: isDarkMode ? '#ffffff' : '#666666',
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            >
              <path 
                d="M10 12L6 8L10 4" 
                stroke="currentColor" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
            
            {/* Expandable Text */}
            <span 
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '14px',
                fontWeight: 600,
                color: '#3690CE',
                opacity: 0,
                transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                whiteSpace: 'nowrap',
              }}
              className="back-text"
            >
              Back to Risk & Compliance
            </span>
          </div>
          
          <span style={{ 
            fontSize: '14px', 
            fontWeight: 600, 
            color: isDarkMode ? colours.dark.text : colours.light.text,
            marginLeft: '8px'
          }}>
            Risk & Compliance: {riskFilterRef}
          </span>
          
          <style>{`
            .nav-back-button:hover .back-text {
              opacity: 1 !important;
            }
            .nav-back-button:hover svg {
              opacity: 0 !important;
            }
          `}</style>
        </div>
      );
      return () => setContent(null);
    }

    // Default (including Matter Opening): show the full filter banner (new navigator with breadcrumbs)
    setContent(
      <>
        <FilterBanner
          seamless
          dense
          primaryFilter={
            <TwoLayerFilter
              id="instructions-unified-filter"
              ariaLabel="Instructions navigation and filtering"
              primaryValue={activeTab}
              secondaryValue={secondaryFilter}
              onPrimaryChange={handlePrimaryFilterChange}
              onSecondaryChange={handleSecondaryFilterChange}
              options={filterOptions}
              hideSecondaryInProduction={true}
              style={{
                fontSize: windowWidth < 768 ? '10px' : '11px',
                transform: windowWidth < 768 ? 'scale(0.9)' : 'none',
                transformOrigin: 'left center'
              }}
            />
          }
          secondaryFilter={
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', transform: 'scale(0.96)', transformOrigin: 'left center' }}>
              <SegmentedControl
                id="instructions-scope-seg"
                ariaLabel={`Scope: toggle between my ${toggleCounts.label} and all ${toggleCounts.label}`}
                value={showAllInstructions ? 'all' : 'mine'}
                onChange={(v) => setShowAllInstructions(v === 'all')}
                options={[
                  { key: 'mine', label: 'Mine', badge: toggleCounts.mine },
                  { key: 'all', label: 'All', badge: toggleCounts.all, disabled: !isAdmin && !isLocalhost }
                ]}
              />
              <SegmentedControl
                id="instructions-layout-seg"
                ariaLabel="Layout: choose 1 or 2 columns"
                value={twoColumn ? 'two' : 'one'}
                onChange={(v) => setTwoColumn(v === 'two')}
                options={[
                  { key: 'one', label: '1' },
                  { key: 'two', label: '2' }
                ]}
              />
            </div>
          }
        />
      </>
    );
    return () => setContent(null);
  }, [
    setContent,
    isDarkMode,
    effectiveInstructionData,
    activeTab,
    showNewMatterPage,
    showRiskPage,
    showEIDPage,
    selectedInstruction,
    hasActiveMatter,
    riskFilterRef,
    clientsActionFilter,
    riskStatusFilter,
    secondaryFilter,
  ]);

  const containerStyle = mergeStyles({
    background: isDarkMode ? colours.darkBlue : '#ffffff',
    minHeight: "100vh",
    boxSizing: "border-box",
    color: isDarkMode ? colours.light.text : colours.dark.text,
    position: 'relative',
    '&::before': {
      content: '""',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'none',
      backgroundImage: helixWatermarkSvg(isDarkMode),
      backgroundRepeat: 'no-repeat',
      backgroundPosition: isDarkMode ? 'right -120px top -80px' : 'right -140px top -100px',
      backgroundSize: 'min(52vmin, 520px)',
      pointerEvents: 'none',
      zIndex: 0
    }
  });

  const newMatterContainerStyle = mergeStyles(containerStyle, {
    padding: "12px",
    position: "relative",
    zIndex: 1,
  });

  const sectionContainerStyle = (dark: boolean) =>
    mergeStyles({
      backgroundColor: 'transparent', // Remove section background - let cards sit on main page background
      padding: "0px",
      paddingBottom: activeTab === "clients" && !selectedInstruction ? "104px" : "0px", // No extra padding when workbench replaces global actions
      borderRadius: 0,
      boxShadow: "none",
      width: "100%",
      // Responsive padding
      '@media (max-width: 768px)': {
        padding: "0px",
        paddingBottom: activeTab === "clients" && !selectedInstruction ? "76px" : "0px",
      },
      '@media (max-width: 480px)': {
        padding: "0px",
        paddingBottom: activeTab === "clients" && !selectedInstruction ? "72px" : "0px",
      },
    });

  const overviewItems = useMemo(() => {
    const items = effectiveInstructionData.flatMap((prospect) => {
      const instructionItems = (prospect.instructions ?? []).map((inst) => {
        const dealsForInst = (prospect.deals ?? []).filter(
          (d) => d.InstructionRef === inst.InstructionRef,
        );
        const clientsForInst: ClientInfo[] = [];
        const prospectClients = [
          ...(prospect.jointClients ?? prospect.joinedClients ?? []),
          ...dealsForInst.flatMap((d) => d.jointClients ?? []),
        ];
        prospectClients.forEach((jc) => {
          if (dealsForInst.some((d) => d.DealId === jc.DealId)) {
            clientsForInst.push({
              ClientEmail: jc.ClientEmail,
              HasSubmitted: jc.HasSubmitted,
              Lead: false,
              deals: [
                {
                  DealId: jc.DealId,
                  InstructionRef: inst.InstructionRef,
                  ServiceDescription: dealsForInst.find(
                    (d) => d.DealId === jc.DealId,
                  )?.ServiceDescription,
                  Status: dealsForInst.find((d) => d.DealId === jc.DealId)?.Status,
                },
              ],
            });
          }
        });
        dealsForInst.forEach((d) => {
          if (d.LeadClientEmail) {
            clientsForInst.push({
              ClientEmail: d.LeadClientEmail,
              Lead: true,
              deals: [
                {
                  DealId: d.DealId,
                  InstructionRef: d.InstructionRef,
                  ServiceDescription: d.ServiceDescription,
                  Status: d.Status,
                },
              ],
            });
          }
        });
        const deal = dealsForInst[0];

        const riskSource = [
          ...(prospect.riskAssessments ?? prospect.compliance ?? []),
          ...((inst as any).riskAssessments ?? (inst as any).compliance ?? []),
        ];
        dealsForInst.forEach((d) => {
          if (d.instruction) {
            riskSource.push(...(d.instruction.riskAssessments ?? []));
            riskSource.push(...(d.instruction.compliance ?? []));
          }
        });
        const eidSource = [
          ...(prospect.electronicIDChecks ?? []),
          ...(prospect.idVerifications ?? []),
          ...((inst as any).electronicIDChecks ?? []),
          ...((inst as any).idVerifications ?? []),
          ...dealsForInst.flatMap((d) => [
            ...(d.instruction?.electronicIDChecks ?? []),
            ...(d.instruction?.idVerifications ?? []),
          ]),
        ];
        const risk = riskSource.find((r) => r.MatterId === inst.InstructionRef);
        const eids = eidSource.filter(
          (e) => (e.MatterId ?? e.InstructionRef) === inst.InstructionRef,
        );
        const eid = eids[0];
        const rawDocs = [
          ...(prospect.documents ?? []),
          ...((inst as any).documents ?? []),
          ...dealsForInst.flatMap((d) => [
            ...(d.documents ?? []),
            ...(d.instruction?.documents ?? []),
          ]),
        ];
        const docsMap: Record<string, any> = {};
        rawDocs.forEach((doc) => {
          const key =
            doc.DocumentId !== undefined
              ? String(doc.DocumentId)
              : `${doc.FileName ?? ''}-${doc.UploadedAt ?? ''}`;
          if (!docsMap[key]) {
            docsMap[key] = doc;
          }
        });
        const docs = Object.values(docsMap);
        return {
          instruction: inst,
          deal,
          deals: dealsForInst,
          clients: clientsForInst,
          risk,
          eid,
          eids,
          documents: docs,
          prospectId: deal?.ProspectId || inst?.ProspectId || prospect.prospectId,
          documentCount: docs ? docs.length : 0,
        };
      });

      // Also process standalone deals that don't have instructions yet (Pitched stage)
      const standaloneDeals = (prospect.deals ?? []).filter(
        (deal) => !deal.InstructionRef || 
        !(prospect.instructions ?? []).some(inst => inst.InstructionRef === deal.InstructionRef)
      ).map((deal) => {
        const clientsForDeal: ClientInfo[] = [];
        const dealClients = [
          ...(prospect.jointClients ?? prospect.joinedClients ?? []),
          ...(deal.jointClients ?? []),
        ];
        
        dealClients.forEach((jc) => {
          if (jc.DealId === deal.DealId) {
            clientsForDeal.push({
              ClientEmail: jc.ClientEmail,
              HasSubmitted: jc.HasSubmitted,
              Lead: false,
              deals: [{
                DealId: deal.DealId,
                InstructionRef: deal.InstructionRef,
                ServiceDescription: deal.ServiceDescription,
                Status: deal.Status,
              }],
            });
          }
        });
        
        if (deal.LeadClientEmail) {
          clientsForDeal.push({
            ClientEmail: deal.LeadClientEmail,
            Lead: true,
            deals: [{
              DealId: deal.DealId,
              InstructionRef: deal.InstructionRef,
              ServiceDescription: deal.ServiceDescription,
              Status: deal.Status,
            }],
          });
        }

        return {
          instruction: null, // No instruction yet for pitched deals
          deal,
          deals: [deal],
          clients: clientsForDeal,
          risk: null,
          eid: null,
          eids: [],
          documents: deal.documents ?? [],
          prospectId: deal.ProspectId || prospect.prospectId,
          documentCount: deal.documents?.length ?? 0,
        };
      });

      return [...instructionItems, ...standaloneDeals];
    });

    const unique: Record<string, typeof items[number]> = {};
    items.forEach((item) => {
      const ref = item.instruction?.InstructionRef as string | undefined;
      const dealId = item.deal?.DealId as string | undefined;
      
      // Use InstructionRef if available, otherwise use DealId for standalone deals
      const key = ref || (dealId ? `deal-${dealId}` : null);
      
      if (key && !unique[key]) {
        unique[key] = item;
      }
    });
    return Object.values(unique);
  }, [effectiveInstructionData, enquiries]);

  // Debug logging for input data
  React.useEffect(() => {
    debugLog('Debug - effectiveInstructionData:', effectiveInstructionData.length, 'prospects');
    const allDeals = effectiveInstructionData.flatMap(p => p.deals ?? []);
    debugLog('Debug - Total deals in data:', allDeals.length);
    debugLog('Debug - Sample deals:', allDeals.slice(0, 3).map(d => ({
      dealId: d.DealId,
      instructionRef: d.InstructionRef,
      status: d.Status,
      acid: d.ACID || d.acid || d.Acid
    })));
  }, [effectiveInstructionData]);

  // Debug logging for pitches
  React.useEffect(() => {
    const pitchedItems = overviewItems.filter(item => !item.instruction && item.deal);
    debugLog('Debug - Total overview items:', overviewItems.length);
    debugLog('Debug - Pitched deals (no instruction):', pitchedItems.length);
    debugLog('Debug - Pitched deals details:', pitchedItems.map(item => ({
      dealId: item.deal?.DealId,
      status: item.deal?.Status,
      acid: item.deal?.ACID || item.deal?.acid || item.deal?.Acid,
      firstName: item.deal?.firstName,
      lastName: item.deal?.lastName,
      prospectId: item.prospectId
    })));
  }, [overviewItems]);

  // Selected overview item for workbench
  const selectedOverviewItem = useMemo(
    () =>
      selectedInstruction
        ? overviewItems.find(
            (item) =>
              item.instruction?.InstructionRef ===
              selectedInstruction.InstructionRef,
          ) || null
        : null,
    [selectedInstruction, overviewItems],
  );

  // Derive a normalized Area of Work label and color for the selected instruction
  const areaOfWorkInfo = useMemo(() => {
    if (!selectedInstruction) return { label: '', color: colours.blue };

    const normalize = (raw?: unknown): { label: string; color: string } => {
      const val = typeof raw === 'string' ? raw.trim() : '';
      if (!val) return { label: '', color: colours.blue };
      const l = val.toLowerCase();
      if (l.includes('commercial')) return { label: 'Commercial', color: colours.blue }; // Use consistent blue
      if (l.includes('construction')) return { label: 'Construction', color: '#f59e0b' }; // Amber
      if (l.includes('property')) return { label: 'Property', color: '#10b981' }; // Emerald
      if (l.includes('employment')) return { label: 'Employment', color: '#8b5cf6' }; // Violet
      return { label: val, color: colours.blue }; // fallback: show as-is with default color
    };

    // Try instruction-level first
    const inst: any = selectedInstruction as any;
    const fields = [
      inst?.AreaOfWork,
      inst?.Area_of_Work,
      inst?.areaOfWork,
      inst?.PracticeArea,
      inst?.practiceArea,
      inst?.Department,
      inst?.WorkType
    ];
    
    for (const field of fields) {
      const result = normalize(field);
      if (result.label) return result;
    }

    // Then deal-level via selectedDeal or overview item
    const deal: any = (selectedDeal as any) || (selectedOverviewItem as any)?.deal;
    const dealFields = [
      deal?.AreaOfWork,
      deal?.Area_of_Work,
      deal?.areaOfWork,
      deal?.PracticeArea,
      deal?.practiceArea,
      deal?.Department,
      deal?.WorkType
    ];
    
    for (const field of dealFields) {
      const result = normalize(field);
      if (result.label) return result;
    }

    return { label: '', color: colours.blue };
  }, [selectedInstruction, selectedDeal, selectedOverviewItem]);

  const poidResult =
    selectedOverviewItem?.eid?.EIDOverallResult?.toLowerCase() ?? "";
  const eidStatus = selectedOverviewItem?.eid?.EIDStatus?.toLowerCase() ?? "";
  const poidPassed = poidResult === "passed" || poidResult === "approved" || poidResult === "verified";
  const verificationFound = !!selectedOverviewItem?.eid;
  
  // Match InstructionCard logic for verification status
  let verifyIdStatus: 'pending' | 'received' | 'review' | 'complete';
  const proofOfIdComplete = Boolean(
    selectedInstruction?.PassportNumber || selectedInstruction?.DriversLicenseNumber
  );
  
  if (!selectedOverviewItem?.eid || eidStatus === 'pending') {
    verifyIdStatus = proofOfIdComplete ? 'received' : 'pending';
  } else if (poidPassed) {
    verifyIdStatus = 'complete';
  } else {
    verifyIdStatus = 'review';
  }
  
  const verifyButtonReview = verifyIdStatus === 'review';
  const verifyButtonDisabled = verifyIdStatus === 'complete';
  const verifyButtonLabel = verifyIdStatus === 'complete'
    ? "ID Verified"
    : verifyIdStatus === 'review'
    ? "Review ID"
    : "Verify ID";

  const verifyButtonBorder = verifyButtonDisabled
    ? (isDarkMode ? 'rgba(34, 197, 94, 0.6)' : colours.green)
    : verifyButtonReview
      ? (isDarkMode ? 'rgba(250, 204, 21, 0.7)' : colours.yellow)
      : (isDarkMode ? 'rgba(96, 165, 250, 0.7)' : colours.blue);
  const verifyButtonBackground = verifyButtonDisabled
    ? (isDarkMode ? 'rgba(34, 197, 94, 0.12)' : '#f0f9ff')
    : (isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'transparent');
  const verifyButtonColor = verifyButtonDisabled
    ? (isDarkMode ? '#bbf7d0' : colours.green)
    : verifyButtonReview
      ? (isDarkMode ? '#facc15' : colours.yellow)
      : (isDarkMode ? '#93c5fd' : colours.blue);

  const riskResultRaw = selectedOverviewItem?.risk?.RiskAssessmentResult?.toString().toLowerCase() ?? "";
  const riskStatus = riskResultRaw
    ? ['low', 'low risk', 'pass', 'approved'].includes(riskResultRaw)
        ? 'complete'
        : 'flagged'
    : 'pending';
  const riskButtonDisabled = riskStatus === 'complete';
  const riskButtonBorder = riskButtonDisabled
    ? (isDarkMode ? 'rgba(34, 197, 94, 0.6)' : colours.green)
    : (isDarkMode ? 'rgba(96, 165, 250, 0.7)' : colours.blue);
  const riskButtonBackground = riskButtonDisabled
    ? (isDarkMode ? 'rgba(34, 197, 94, 0.12)' : '#f0f9ff')
    : (isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'transparent');
  const riskButtonColor = riskButtonDisabled
    ? (isDarkMode ? '#bbf7d0' : colours.green)
    : (isDarkMode ? '#bfdbfe' : colours.blue);
  
  // Payment status logic
  const paymentResult = selectedOverviewItem?.instruction?.PaymentResult?.toLowerCase();
  const paymentCompleted = paymentResult === "successful";

  const matterLinked = useMemo(() => {
    if (!selectedInstruction) return false;
    
    // Find the prospect that contains this instruction
    const prospect = effectiveInstructionData.find(p => 
      p.instructions?.some((inst: any) => inst.InstructionRef === selectedInstruction.InstructionRef)
    );
    
    if (!prospect) return false;
    
    // Check if this prospect has any matters that correspond to this instruction
    // This could be based on InstructionRef or MatterId
    const hasMatter = prospect.matters?.some((matter: any) => 
      matter.InstructionRef === selectedInstruction.InstructionRef ||
      (selectedInstruction.MatterId && matter.MatterID === selectedInstruction.MatterId)
    );
    
    return !!hasMatter;
  }, [selectedInstruction, effectiveInstructionData]);
  
  // Check if CCL has been submitted for this instruction
  const cclCompleted = useMemo(() => {
    if (!selectedInstruction) return false;
    return !!selectedInstruction.CCLSubmitted;
  }, [selectedInstruction]);
  
  // Open Matter button should be enabled when:
  // 1. Both ID is verified AND payment is complete (normal flow), OR
  // 2. There's a matter opening in progress (so user can continue)
  const canOpenMatter = (poidPassed && paymentCompleted) || hasActiveMatterOpening();
  const matterButtonBorder = matterLinked
    ? (isDarkMode ? 'rgba(34, 197, 94, 0.6)' : colours.green)
    : (isDarkMode ? 'rgba(96, 165, 250, 0.7)' : colours.blue);
  const matterButtonBackground = matterLinked
    ? (isDarkMode ? 'rgba(34, 197, 94, 0.12)' : '#f0f9ff')
    : (isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'transparent');
  const matterButtonColor = matterLinked
    ? (isDarkMode ? '#bbf7d0' : colours.green)
    : (isDarkMode ? '#bfdbfe' : colours.blue);

  const syncButtonActive = Boolean(selectedOverviewItem?.instruction?.MatterRef);
  const syncButtonBorder = isDarkMode ? 'rgba(34, 197, 94, 0.6)' : colours.green;
  const syncButtonBackground = syncButtonActive
    ? (isDarkMode ? 'rgba(34, 197, 94, 0.16)' : '#f0f9ff')
    : (isDarkMode ? 'rgba(30, 41, 59, 0.55)' : '#f5f5f5');
  const syncButtonColor = syncButtonActive
    ? (isDarkMode ? '#bbf7d0' : colours.green)
    : (isDarkMode ? 'rgba(226, 232, 240, 0.5)' : colours.greyText);

  const cclButtonBorder = cclCompleted
    ? (isDarkMode ? 'rgba(34, 197, 94, 0.6)' : colours.green)
    : (isDarkMode ? 'rgba(96, 165, 250, 0.7)' : colours.blue);
  const cclButtonBackground = cclCompleted
    ? (isDarkMode ? 'rgba(34, 197, 94, 0.12)' : '#f0f9ff')
    : (isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'transparent');
  const cclButtonColor = cclCompleted
    ? (isDarkMode ? '#bbf7d0' : colours.green)
    : (isDarkMode ? '#bfdbfe' : colours.blue);

  // Derive current matter display number for the selected instruction (fallback across common field names)
  const currentMatterDisplayNumber = useMemo(() => {
    const mid = selectedInstruction?.MatterId;
    const iref = selectedInstruction?.InstructionRef;

    const getDisplay = (m: unknown): string | '' => {
      if (!m || typeof m !== 'object') return '';
      const mm = m as Record<string, unknown>;
      const dn = (mm.DisplayNumber || mm['Display Number'] || mm.displayNumber || mm.display_number);
      return typeof dn === 'string' ? dn : '';
    };

    // 1) Check top-level matters prop if provided
    const fromMatters = (matters || []).find((m: any) =>
      (m?.MatterID && mid && m.MatterID === mid) || (m?.InstructionRef && iref && m.InstructionRef === iref)
    );
    const dnFromMatters = getDisplay(fromMatters);
    if (dnFromMatters) return dnFromMatters;

    // 2) Check prospect-scoped matters within effectiveInstructionData
    const prospect = effectiveInstructionData.find(p => p.instructions?.some((inst: any) => inst.InstructionRef === iref));
    const fromProspect = prospect?.matters?.find((m: any) =>
      (m?.MatterID && mid && m.MatterID === mid) || (m?.InstructionRef && iref && m.InstructionRef === iref)
    );
    const dnFromProspect = getDisplay(fromProspect);
    if (dnFromProspect) return dnFromProspect;

    return '';
  }, [selectedInstruction, matters, effectiveInstructionData]);
  
  // Helper function to get area of work color
  const getAreaColor = (area?: string): string => {
    if (!area) return colours.blue;
    const normalizedArea = area.toLowerCase();
    switch (normalizedArea) {
      case 'commercial': return colours.blue;
      case 'property': return colours.green;
      case 'construction': return colours.orange;
      case 'employment': return colours.yellow;
      default: return colours.blue;
    }
  };

  // Determine which button should pulse to indicate next ready action
  const getNextReadyAction = (): 'verify' | 'risk' | 'matter' | 'ccl' | null => {
    if (!selectedInstruction) return null;
    
    // Check if the selected instruction has an associated matter
    const hasAssociatedMatter = selectedInstruction && (
      selectedInstruction.MatterId || 
      (selectedInstruction as any).matters?.length > 0
    );
    
    // If instruction has a matter but CCL not submitted, prioritize CCL button
    if (hasAssociatedMatter && !cclCompleted) {
      return 'ccl';
    }
    
    // Priority 1: If ID needs verification or review, verify button should pulse
    if (!verifyButtonDisabled) {
      return 'verify';
    }
    
    // Priority 2: If risk needs assessment (pending), risk button should pulse
    if (riskStatus === 'pending') {
      return 'risk';
    }
    
    // Priority 3: If matter can be opened, matter button should pulse
    if (canOpenMatter && !matterLinked) {
      return 'matter';
    }
    
    return null;
  };
  
  const nextReadyAction = getNextReadyAction();
  
  const disableOtherActions = false; // Enable all actions regardless of selection

  const unlinkedDeals = useMemo(
    () =>
      effectiveInstructionData.flatMap((p) =>
        (p.deals ?? []).filter((d) => !d.InstructionRef),
      ),
    [effectiveInstructionData],
  );

  const instructionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const deals = useMemo(
    () =>
      effectiveInstructionData.flatMap((p) =>
        (p.deals ?? []).map((d) => {
          // Attempt to derive lead client name from available data
          let firstName = '';
          let lastName = '';

          // First priority: Look up by ProspectId in enquiries data
          if (d.ProspectId || d.prospectId) {
            const prospectIdLookup = getClientNameByProspectId(d.ProspectId || d.prospectId);
            if (prospectIdLookup.firstName || prospectIdLookup.lastName) {
              firstName = prospectIdLookup.firstName;
              lastName = prospectIdLookup.lastName;
            }
          }

          // Second priority: Use existing email-based lookup if no name found from ACID
          if ((!firstName && !lastName) && d.LeadClientEmail) {
            const emailLc = d.LeadClientEmail.toLowerCase();

            // Look in instruction-level data for a matching client
            const matchingInstruction = (p.instructions ?? []).find((inst: any) =>
              inst.Email?.toLowerCase() === emailLc
            );

            if (matchingInstruction) {
              firstName = matchingInstruction.FirstName || '';
              lastName = matchingInstruction.LastName || '';
            } else {
              // Fall back to joint client records
              const jointSources = [
                ...(p.jointClients ?? p.joinedClients ?? []),
                ...(d.jointClients ?? []),
              ];
              const jointClient = jointSources.find((jc: any) =>
                jc.ClientEmail?.toLowerCase() === emailLc
              );

              if (jointClient) {
                firstName = jointClient.FirstName || jointClient.Name?.split(' ')[0] || '';
                lastName =
                  jointClient.LastName || jointClient.Name?.split(' ').slice(1).join(' ') || '';
              }
            }
          }

          return {
            ...d,
            firstName,
            lastName,
            jointClients: [
              // Only include prospect-level joint clients that match this deal's DealId
              ...(p.jointClients ?? p.joinedClients ?? []).filter((jc) => jc.DealId === d.DealId),
              // Include deal-level joint clients
              ...(d.jointClients ?? []),
            ],
            documents: [
              // Include prospect-level documents that match this deal's DealId
              ...(p.documents ?? []).filter((doc) => doc.DealId === d.DealId),
              // Include deal-level documents
              ...(d.documents ?? []),
              // Include instruction-level documents if deal has an instruction
              ...(d.instruction?.documents ?? []),
            ],
          };
        })
      ),
    [effectiveInstructionData, enquiries],
  );
  const clients: ClientInfo[] = useMemo(() => {
    const map: Record<string, ClientInfo> = {};
    effectiveInstructionData.forEach((p) => {
      const deals = p.deals ?? [];
      deals.forEach((d) => {
        if (d.LeadClientEmail) {
          const key = d.LeadClientEmail;
          const entry = map[key] || {
            ClientEmail: key,
            Lead: true,
            deals: [] as DealSummary[],
          };
          entry.Lead = true;
          (entry.deals as DealSummary[]).push({
            DealId: d.DealId,
            InstructionRef: d.InstructionRef,
            ServiceDescription: d.ServiceDescription,
            Status: d.Status,
          });
          map[key] = entry;
        }
      });
      // Process joint clients - combine prospect-level and deal-level, but filter prospect-level by DealId
      const allJointClients = [
        // Prospect-level joint clients (filter by DealId)
        ...(p.jointClients ?? p.joinedClients ?? []),
        // Deal-level joint clients  
        ...deals.flatMap((d) => d.jointClients ?? [])
      ];
      
      allJointClients.forEach((jc) => {
        const key = jc.ClientEmail;
        const entry = map[key] || {
          ClientEmail: jc.ClientEmail,
          HasSubmitted: jc.HasSubmitted,
          Lead: false,
          deals: [] as DealSummary[],
          // Only include specific fields we want to display
          DealJointClientId: jc.DealJointClientId,
          DealId: jc.DealId,
          SubmissionDateTime: jc.SubmissionDateTime,
        };
        // Update only the fields we want
        entry.HasSubmitted = jc.HasSubmitted;
        entry.DealJointClientId = jc.DealJointClientId;
        entry.DealId = jc.DealId;
        entry.SubmissionDateTime = jc.SubmissionDateTime;
        const deal = deals.find((dd) => dd.DealId === jc.DealId);
        if (deal) {
          (entry.deals as DealSummary[]).push({
            DealId: deal.DealId,
            InstructionRef: deal.InstructionRef,
            ServiceDescription: deal.ServiceDescription,
            Status: deal.Status,
          });
        }
        map[key] = entry;
      });
    });
    return Object.values(map);
  }, [effectiveInstructionData]);

  const riskComplianceData = useMemo(
    () =>
      effectiveInstructionData.flatMap((p) => {
        const instructions = p.instructions ?? [];
        const deals = p.deals ?? [];
        const riskSource: any[] = [
          ...(p.riskAssessments ?? []),
          ...(p.compliance ?? []),
        ];
        const prospectEids: any[] = [
          ...(p.electronicIDChecks ?? []),
          ...(p.idVerifications ?? []),
        ];
        const eidSource: any[] = [...prospectEids];
        prospectEids.forEach((eid: any) => {
          riskSource.push({
            MatterId: eid.InstructionRef ?? eid.MatterId,
            ComplianceDate: eid.EIDCheckedDate,
            CheckId: eid.EIDCheckId,
            CheckResult: eid.EIDOverallResult,
            PEPandSanctionsCheckResult: eid.PEPAndSanctionsCheckResult,
            AddressVerificationCheckResult: eid.AddressVerificationResult,
            EIDStatus: eid.EIDStatus,
          });
        });
        instructions.forEach((inst: any) => {
          riskSource.push(...(inst.riskAssessments ?? []));
          riskSource.push(...(inst.compliance ?? []));
          const instEids: any[] = [
            ...(inst.electronicIDChecks ?? []),
            ...(inst.idVerifications ?? []),
          ];
          eidSource.push(...instEids);
          instEids.forEach((eid: any) => {
            riskSource.push({
              MatterId: eid.InstructionRef ?? inst.InstructionRef,
              ComplianceDate: eid.EIDCheckedDate,
              CheckId: eid.EIDCheckId,
              CheckResult: eid.EIDOverallResult,
              PEPandSanctionsCheckResult: eid.PEPAndSanctionsCheckResult,
              AddressVerificationCheckResult: eid.AddressVerificationResult,
              EIDStatus: eid.EIDStatus,
            });
          });
        });
        deals.forEach((d: any) => {
          if (d.instruction) {
            riskSource.push(...(d.instruction.riskAssessments ?? []));
            riskSource.push(...(d.instruction.compliance ?? []));
            const instEids: any[] = [
              ...(d.instruction.electronicIDChecks ?? []),
              ...(d.instruction.idVerifications ?? []),
            ];
            eidSource.push(...instEids);
            instEids.forEach((eid: any) => {
              riskSource.push({
                MatterId: eid.InstructionRef ?? d.InstructionRef,
                ComplianceDate: eid.EIDCheckedDate,
                CheckId: eid.EIDCheckId,
                CheckResult: eid.EIDOverallResult,
                PEPandSanctionsCheckResult: eid.PEPAndSanctionsCheckResult,
                AddressVerificationCheckResult: eid.AddressVerificationResult,
                EIDStatus: eid.EIDStatus,
              });
            });
          }
        });
        return riskSource.map((r: any) => {
          const eid = eidSource.find((e: any) => e.MatterId === r.MatterId);
          const instruction = instructions.find(
            (i: any) => i.InstructionRef === r.MatterId,
          );
          const deal = deals.find((d: any) => d.InstructionRef === r.MatterId);

          const dealsForInst = deals.filter(
            (d: any) => d.InstructionRef === r.MatterId,
          );
          const clientsForInst: ClientInfo[] = [];
          const prospectClients = [
            ...(p.jointClients ?? p.joinedClients ?? []),
            ...dealsForInst.flatMap((d) => d.jointClients ?? []),
          ];
          
          // Helper function to find client details from instruction data
          const findClientDetails = (email: string) => {
            // Look in instructions for matching email
            const matchingInstruction = instructions.find((inst: any) => 
              inst.Email?.toLowerCase() === email?.toLowerCase()
            );
            if (matchingInstruction) {
              return {
                FirstName: matchingInstruction.FirstName,
                LastName: matchingInstruction.LastName,
                CompanyName: matchingInstruction.CompanyName,
                Phone: matchingInstruction.Phone,
              };
            }
            
            // Look in joint clients data for additional details
            const jointClient = prospectClients.find((jc: any) => 
              jc.ClientEmail?.toLowerCase() === email?.toLowerCase()
            );
            if (jointClient) {
              return {
                FirstName: jointClient.FirstName || jointClient.Name?.split(' ')[0],
                LastName: jointClient.LastName || jointClient.Name?.split(' ').slice(1).join(' '),
                CompanyName: jointClient.CompanyName,
                Phone: jointClient.Phone,
              };
            }
            
            return {};
          };
          
          prospectClients.forEach((jc) => {
            if (dealsForInst.some((d) => d.DealId === jc.DealId)) {
              const clientDetails = findClientDetails(jc.ClientEmail);
              clientsForInst.push({
                ClientEmail: jc.ClientEmail,
                HasSubmitted: jc.HasSubmitted,
                Lead: false,
                ...clientDetails,
                deals: [
                  {
                    DealId: jc.DealId,
                    InstructionRef: r.MatterId,
                    ServiceDescription: dealsForInst.find(
                      (d) => d.DealId === jc.DealId,
                    )?.ServiceDescription,
                    Status: dealsForInst.find((d) => d.DealId === jc.DealId)?.Status,
                  },
                ],
              });
            }
          });
          dealsForInst.forEach((d) => {
            if (d.LeadClientEmail) {
              const clientDetails = findClientDetails(d.LeadClientEmail);
              clientsForInst.push({
                ClientEmail: d.LeadClientEmail,
                Lead: true,
                ...clientDetails,
                deals: [
                  {
                    DealId: d.DealId,
                    InstructionRef: d.InstructionRef,
                    ServiceDescription: d.ServiceDescription,
                    Status: d.Status,
                  },
                ],
              });
            }
          });

          return {
            ...r,
            EIDStatus: eid?.EIDStatus,
            instruction,
            deal,
            ServiceDescription: deal?.ServiceDescription,
            Stage: instruction?.Stage,
            clients: clientsForInst,
          };
        });
      }),
    [effectiveInstructionData],
  );

  const filteredRiskComplianceData = useMemo(() => {
    let base = riskComplianceData.filter(r => riskFilterRef ? r.MatterId === riskFilterRef : true);
    if (riskStatusFilter === 'All') return base;
    const isCompleted = (item: any) => {
      const passed = (val: any) => typeof val === 'string' && ['passed','approved','low','low risk'].includes(val.toLowerCase());
      const eidOk = passed(item.EIDStatus) || passed(item.CheckResult) || passed(item.EIDOverallResult);
      const riskOk = passed(item.RiskAssessmentResult) || passed(item.CheckResult);
      return eidOk && riskOk;
    };
    if (riskStatusFilter === 'Completed') return base.filter(isCompleted);
    return base.filter(i => !isCompleted(i));
  }, [riskComplianceData, riskFilterRef, riskStatusFilter]);

  // Derive next action for clients (overview items reused later)
  const overviewItemsWithNextAction = useMemo(()=>{
    return overviewItems.map(item => {
      const inst = item.instruction as any;
      const eid = item.eid;
      const riskResultRaw = item.risk?.RiskAssessmentResult?.toString().toLowerCase();
      const poidResult = eid?.EIDOverallResult?.toLowerCase();
      const poidPassed = poidResult === 'passed' || poidResult === 'approved' || poidResult === 'verified';
      const eidStatus = eid?.EIDStatus?.toLowerCase() ?? '';
      const proofOfIdComplete = Boolean(inst?.PassportNumber || inst?.DriversLicenseNumber);
      let verifyIdStatus: 'pending' | 'received' | 'review' | 'complete';
      if (!eid || eidStatus === 'pending') verifyIdStatus = proofOfIdComplete ? 'received' : 'pending';
      else if (poidPassed) verifyIdStatus = 'complete'; else verifyIdStatus = 'review';
      const riskStatus = riskResultRaw ? (['low','low risk','pass','approved'].includes(riskResultRaw)? 'complete':'flagged') : 'pending';
      const paymentCompleted = (inst?.PaymentResult||'').toLowerCase() === 'successful';
      const hasMatter = inst?.MatterId;
      const cclSubmitted = inst?.CCLSubmitted;
      let nextAction: string = 'Complete';
      if (verifyIdStatus !== 'complete') nextAction = 'Verify ID';
      else if (riskStatus === 'pending') nextAction = 'Assess Risk';
      else if (!hasMatter && poidPassed && paymentCompleted) nextAction = 'Open Matter';
      else if (hasMatter && !cclSubmitted) nextAction = 'Draft CCL';
      return { ...item, nextAction };
    });
  }, [overviewItems]);

  const filteredOverviewItems = useMemo(()=>{
    if (clientsActionFilter === 'All') return overviewItemsWithNextAction;
    return overviewItemsWithNextAction.filter(i => i.nextAction === clientsActionFilter || (clientsActionFilter==='Complete' && i.nextAction==='Complete'));
  }, [overviewItemsWithNextAction, clientsActionFilter]);

  // Local dev helper: detect instructions whose next required action is Matter Opening
  const isLocalhostEnv = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const openMatterCandidates = useMemo(() => {
    return filteredOverviewItems.filter((i: any) => i.nextAction === 'Open Matter');
  }, [filteredOverviewItems]);

  // Create POID data for client address information
  const idVerificationOptions = useMemo(() => {
    const seen = new Set<string>();
    return effectiveInstructionData.flatMap((p) => {
      const instructions = p.instructions ?? [];
      const all: any[] = [
        ...(p.electronicIDChecks ?? []),
        ...(p.idVerifications ?? []),
      ];
      instructions.forEach((inst: any) => {
        all.push(...(inst.electronicIDChecks ?? []));
        all.push(...(inst.idVerifications ?? []));
        if (inst.PassportNumber || inst.DriversLicenseNumber) {
          all.push({ ...inst, fromInstruction: true });
        }
      });
      return all.flatMap((v) => {
        if (!v) return [];
        const key = String(v.InternalId ?? v.MatterId ?? v.InstructionRef ?? "");
        if (seen.has(key)) return [];
        seen.add(key);
        const instRef = v.InstructionRef ?? v.MatterId;
        const inst = instructions.find((i: any) => i.InstructionRef === instRef) ?? (v.fromInstruction ? v : null);
        const merged: any = { ...inst, ...v };
        delete merged.EIDRawResponse;
        
        // Add verification results and status information
        const eidOverallResult = v.EIDOverallResult || merged.EIDOverallResult;
        const eidStatus = v.EIDStatus || merged.EIDStatus;
        
        return [
          {
            poid_id: String(merged.InternalId ?? key),
            prefix: merged.Title,
            first: merged.FirstName,
            last: merged.LastName,
            company_name: merged.CompanyName,
            nationality: merged.Nationality,
            nationality_iso: merged.NationalityAlpha2,
            date_of_birth: merged.DOB,
            best_number: merged.Phone,
            email: merged.Email,
            passport_number: merged.PassportNumber,
            drivers_license_number: merged.DriversLicenseNumber,
            house_building_number: merged.HouseNumber,
            street: merged.Street,
            city: merged.City,
            county: merged.County,
            post_code: merged.Postcode,
            country: merged.Country,
            country_code: merged.CountryCode,
            company_number: merged.CompanyNumber,
            company_house_building_number: merged.CompanyHouseNumber,
            company_street: merged.CompanyStreet,
            company_city: merged.CompanyCity,
            company_county: merged.CompanyCounty,
            company_post_code: merged.CompanyPostcode,
            company_country: merged.CompanyCountry,
            company_country_code: merged.CompanyCountryCode,
            stage: merged.Stage,
            // Add verification status and results
            EIDOverallResult: eidOverallResult,
            EIDStatus: eidStatus,
            CheckResult: v.CheckResult,
            DocumentType: v.DocumentType,
            DocumentNumber: v.DocumentNumber,
            IssuedDate: v.IssuedDate,
            ExpiryDate: v.ExpiryDate,
            IssuingCountry: v.IssuingCountry,
            CheckDate: v.CheckDate,
            FraudScore: v.FraudScore,
            AuthenticityScore: v.AuthenticityScore,
            QualityScore: v.QualityScore,
            BiometricScore: v.BiometricScore,
            Notes: v.Notes,
            // Add individual verification results for address and PEP checks
            AddressVerificationResult: eidOverallResult === 'Passed' ? 'Passed' : eidOverallResult === 'Failed' ? 'Review' : eidOverallResult === 'Review' ? 'Review' : null,
            PEPAndSanctionsCheckResult: eidOverallResult === 'Passed' ? 'Passed' : eidOverallResult === 'Failed' ? 'Review' : eidOverallResult === 'Review' ? 'Review' : null,
            ...merged,
          },
        ];
      });
    });
  }, [effectiveInstructionData]);

  // Group risk compliance data by instruction reference
  const groupedRiskComplianceData = useMemo(() => {
    const grouped = new Map<string, {
      instructionRef: string;
      riskAssessments: any[];
      idVerifications: any[];
      clients: any[];
      serviceDescription?: string;
      stage?: string;
      allData: any[];
    }>();

    filteredRiskComplianceData.forEach(item => {
      const instructionRef = item.InstructionRef || item.MatterId || 'Unknown';
      
      if (!grouped.has(instructionRef)) {
        grouped.set(instructionRef, {
          instructionRef,
          riskAssessments: [],
          idVerifications: [],
          clients: item.clients || [],
          serviceDescription: item.ServiceDescription,
          stage: item.Stage,
          allData: []
        });
      }

      const group = grouped.get(instructionRef)!;
      group.allData.push(item);

      // Categorize the item based on its properties
      if (item.CheckId || item.EIDStatus || item.EIDCheckedDate || 
          item.CheckResult || item.PEPandSanctionsCheckResult || 
          item.AddressVerificationCheckResult) {
        // This is an ID verification item
        group.idVerifications.push(item);
      } else {
        // This is a risk assessment item
        group.riskAssessments.push(item);
      }

      // Update shared properties (take from latest item)
      if (item.ServiceDescription) group.serviceDescription = item.ServiceDescription;
      if (item.Stage) group.stage = item.Stage;
      if (item.clients && item.clients.length > 0) group.clients = item.clients;
    });

    // Now enhance each group with proper ID verification data from instructionData
    Array.from(grouped.values()).forEach(group => {
      // Find the corresponding instruction data for this instruction ref
      const instructionItem = effectiveInstructionData.find(p => 
        p.instructions?.some((inst: any) => inst.InstructionRef === group.instructionRef)
      );
      
      if (instructionItem) {
        const instruction = instructionItem.instructions?.find((inst: any) => 
          inst.InstructionRef === group.instructionRef
        );
        
        // Get all ID verifications for this instruction
        const allIdVerifications = [
          ...(instructionItem.idVerifications || []),
          ...(instruction?.idVerifications || [])
        ].filter(idv => idv.InstructionRef === group.instructionRef);
        
        // Add these to the group's ID verifications
        group.idVerifications.push(...allIdVerifications);
        
        // Add instruction data to allData for personal info lookup
        if (instruction) {
          group.allData.push(instruction);
        }
        
        // Update stage and service description from instruction if available
        if (instruction && !group.stage) {
          group.stage = instruction.Stage;
        }
        
        // Find the deal for this instruction to get service description
        const deal = instructionItem.deals?.find((d: any) => d.InstructionRef === group.instructionRef);
        if (deal && !group.serviceDescription) {
          group.serviceDescription = deal.ServiceDescription;
        }
        
        // Enhanced client data with proper names and ID verification status
        const enhancedClients: any[] = [];
        
        // Get deals for this instruction (needed for both lead and joint client processing)
        const deals = instructionItem.deals?.filter((d: any) => d.InstructionRef === group.instructionRef) || [];
        
        // Add lead client from instruction data with basic fallback
        if (instruction) {
          const leadIdVerification = allIdVerifications.find(idv => 
            idv.ClientEmail?.toLowerCase() === instruction.Email?.toLowerCase()
          );
          
          // Find POID data for this client to get address information
          const leadPoidData = idVerificationOptions?.find(poid => 
            poid.email?.toLowerCase() === instruction.Email?.toLowerCase()
          );
          
          enhancedClients.push({
            ClientEmail: instruction.Email,
            FirstName: instruction.FirstName || instruction.Name?.split(' ')[0] || 'Client',
            LastName: instruction.LastName || instruction.Name?.split(' ').slice(1).join(' ') || '',
            CompanyName: instruction.CompanyName,
            Lead: true,
            HasSubmitted: true, // If instruction exists, they've submitted
            idVerification: leadIdVerification,
            // Add address information from POID data
            house_building_number: leadPoidData?.house_building_number,
            street: leadPoidData?.street,
            city: leadPoidData?.city,
            county: leadPoidData?.county,
            post_code: leadPoidData?.post_code,
            country: leadPoidData?.country
          });
        }
        
        // Add joint clients from deal data AND prospect data
        
        // Get all joint clients from both prospect level and deal level
        const allJointClients = [
          // Prospect-level joint clients (filter by DealId matching this instruction's deals)
          ...(instructionItem.jointClients || instructionItem.joinedClients || []).filter(jc => 
            deals.some(d => d.DealId === jc.DealId)
          ),
          // Deal-level joint clients
          ...deals.flatMap(d => d.jointClients || [])
        ];
        
        // Process all joint clients
        allJointClients.forEach((jc: any) => {
          const jointIdVerification = allIdVerifications.find(idv => 
            idv.ClientEmail?.toLowerCase() === jc.ClientEmail?.toLowerCase()
          );
          
          // Try to find instruction data for this joint client
          const jointInstruction = instructionData
            .flatMap(p => p.instructions || [])
            .find((inst: any) => inst.Email?.toLowerCase() === jc.ClientEmail?.toLowerCase());
          
          // Find POID data for this joint client to get address information
          const jointPoidData = idVerificationOptions?.find(poid => 
            poid.email?.toLowerCase() === jc.ClientEmail?.toLowerCase()
          );
          
          enhancedClients.push({
            ClientEmail: jc.ClientEmail,
            FirstName: jointInstruction?.FirstName || jc.FirstName || jc.Name?.split(' ')[0],
            LastName: jointInstruction?.LastName || jc.LastName || jc.Name?.split(' ').slice(1).join(' '),
            CompanyName: jointInstruction?.CompanyName || jc.CompanyName,
            Lead: false,
            HasSubmitted: jc.HasSubmitted || Boolean(jointInstruction),
            idVerification: jointIdVerification,
            // Add address information from POID data
            house_building_number: jointPoidData?.house_building_number,
            street: jointPoidData?.street,
            city: jointPoidData?.city,
            county: jointPoidData?.county,
            post_code: jointPoidData?.post_code,
            country: jointPoidData?.country
          });
        });
        
        // Replace the clients array with enhanced data
        if (enhancedClients.length > 0) {
          group.clients = enhancedClients;
        }
      }
    });

    return Array.from(grouped.values());
  }, [filteredRiskComplianceData, effectiveInstructionData, idVerificationOptions]);

  const handleOpenMatter = (inst: any) => {
    // Always start a fresh matter opening
    setSelectedInstruction(inst);
    setPendingInstructionRef('');
    setShowNewMatterPage(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  const handleRiskAssessment = (item: any) => {
    if (item) {
      setSelectedInstruction(item.instruction ?? item);
      setSelectedRisk(item.risk ?? item.riskAssessments?.[0] ?? null);
      // Risk assessment logic without auto-opening workbench
    }
    setPendingInstructionRef('');
    setShowRiskPage(true);
  };

  const handleEIDCheck = async (inst: any) => {
    if (!inst?.InstructionRef) {
      console.error('No instruction reference provided for ID verification');
      return;
    }

    const instructionRef = inst.InstructionRef;
    
    // Determine current verification status using enhanced logic for Tiller API responses
    const eid = inst.eidData || inst.EIDData;
    const eids = inst.eidS;
    const eidStatus = inst.EIDStatus;
    const eidResult = inst.EIDOverallResult?.toLowerCase();
    
    // Try alternative field names for ID verification data
    const altEidResult = (inst.eidOverallResult || inst.eid_overall_result || inst.overallResult)?.toLowerCase();
    const altAddressResult = (inst.addressVerificationResult || inst.AddressVerificationResult || inst.address_verification_result)?.toLowerCase();
    const altPepResult = (inst.pepAndSanctionsCheckResult || inst.PEPAndSanctionsCheckResult || inst.pep_and_sanctions_check_result)?.toLowerCase();
    
    const poidPassed = inst.EIDOverallResult?.toLowerCase() === 'passed' || inst.EIDOverallResult?.toLowerCase() === 'complete' || inst.EIDOverallResult?.toLowerCase() === 'verified';
    console.log('Status check for', inst.InstructionRef, ':', {
      EIDOverallResult: inst.EIDOverallResult,
      stage: inst.stage,
      poidPassed,
      stageComplete: inst.stage === 'proof-of-id-complete'
    });
    const stageComplete = inst.stage === 'proof-of-id-complete';
    const proofOfIdComplete = inst.ProofOfIdComplete || inst.proof_of_id_complete;
    
    // Check if we have Tiller API response data
    let tillerOverallResult = null;
    if (eid && typeof eid === 'object' && eid.overallResult) {
      tillerOverallResult = eid.overallResult.result?.toLowerCase();
    }
    
    // Get the latest ID verification data from the idVerifications array
    const idVerification = inst.idVerifications && inst.idVerifications.length > 0 
      ? inst.idVerifications[0] // Most recent (ordered by InternalId DESC)
      : null;
    
    debugLog(`🔍 Enhanced EID Check for ${instructionRef}:`, {
      stage: inst.stage,
      hasIdVerifications: !!(inst.idVerifications && inst.idVerifications.length > 0),
      idVerificationCount: inst.idVerifications ? inst.idVerifications.length : 0,
      latestIdVerification: idVerification ? {
        EIDOverallResult: idVerification.EIDOverallResult,
        EIDStatus: idVerification.EIDStatus,
        AddressVerificationResult: idVerification.AddressVerificationResult,
        PEPAndSanctionsCheckResult: idVerification.PEPAndSanctionsCheckResult,
        EIDCheckId: idVerification.EIDCheckId,
        EIDCheckedDate: idVerification.EIDCheckedDate
      } : null,
      
      // Legacy fields for backward compatibility
      legacyFields: {
        eidResult,
        eidStatus,
        tillerOverallResult,
        hasEidData: !!eid,
        poidPassed,
        stageComplete,
        proofOfIdComplete
      }
    });
    
    let verifyIdStatus: 'pending' | 'received' | 'review' | 'complete';
    
    // Priority 1: Check latest ID verification record from database
    if (idVerification && idVerification.EIDOverallResult) {
      const dbResult = idVerification.EIDOverallResult.toLowerCase();
      if (dbResult === 'review') {
        verifyIdStatus = 'review';
        debugLog(`✅ Status determined from DB IDVerifications.EIDOverallResult: review`);
      } else if (dbResult === 'passed' || dbResult === 'complete' || dbResult === 'verified') {
        verifyIdStatus = 'complete';
        debugLog(`✅ Status determined from DB IDVerifications.EIDOverallResult: complete (${dbResult})`);
      } else if (dbResult === 'failed' || dbResult === 'rejected' || dbResult === 'fail') {
        verifyIdStatus = 'review'; // Failed results should open review modal
        debugLog(`✅ Status determined from DB IDVerifications.EIDOverallResult: review (failed status: ${dbResult})`);
      } else {
        verifyIdStatus = 'review'; // Default for unknown results
        debugLog(`✅ Status determined from DB IDVerifications.EIDOverallResult: review (fallback for ${dbResult})`);
      }
    }
    // Priority 2: Check Tiller API overall result if available
    else if (tillerOverallResult === 'review') {
      verifyIdStatus = 'review';
      console.log(`✅ Status determined from Tiller API: review`);
    } else if (tillerOverallResult === 'passed') {
      verifyIdStatus = 'complete';
      console.log(`✅ Status determined from Tiller API: complete`);
    } else if (tillerOverallResult === 'failed' || tillerOverallResult === 'rejected' || tillerOverallResult === 'fail') {
      verifyIdStatus = 'review'; // Failed results should open review modal
      console.log(`✅ Status determined from Tiller API: review (failed status: ${tillerOverallResult})`);
    } 
    // Priority 3: Check legacy database EID result fields
    else if (eidResult === 'review' || altEidResult === 'review') {
      verifyIdStatus = 'review';
      debugLog(`✅ Status determined from legacy DB EIDResult: review (${eidResult || altEidResult})`);
    } else if (eidResult === 'failed' || eidResult === 'rejected' || eidResult === 'fail' || altEidResult === 'failed' || altEidResult === 'rejected' || altEidResult === 'fail') {
      verifyIdStatus = 'review'; // Failed results should open review modal  
      debugLog(`✅ Status determined from legacy DB EIDResult: review (failed status: ${eidResult || altEidResult})`);
    } else if (poidPassed || eidResult === 'passed' || altEidResult === 'passed') {
      verifyIdStatus = 'complete';
      debugLog(`✅ Status determined from legacy DB EIDResult: complete (${eidResult || altEidResult})`);
    }
    // Priority 4: Check stage and other indicators
    else if (stageComplete) {
      // If stage shows proof-of-id-complete but no clear result, check for pending status
      if (eidStatus === 'pending' || eidResult === 'pending') {
        verifyIdStatus = 'review'; // Pending results usually need review
        console.log(`✅ Status determined from pending state: review`);
      } else {
        verifyIdStatus = 'review'; // Stage complete but unclear result
        debugLog(`✅ Status determined from stage complete fallback: review`);
      }
    } else if ((!eid && !eids?.length) || eidStatus === 'pending') {
      verifyIdStatus = proofOfIdComplete ? 'received' : 'pending';
      debugLog(`✅ Status determined from no data: ${verifyIdStatus}`);
    } else if (poidPassed) {
      verifyIdStatus = 'complete';
      debugLog(`✅ Status determined from poidPassed: complete`);
    } else {
      verifyIdStatus = 'review';
      debugLog(`✅ Status determined from fallback: review`);
    }

    debugLog(`ID verification status for ${instructionRef}: ${verifyIdStatus}`);

    // IMPORTANT: Handle review and complete statuses immediately - NO API CALLS
    if (verifyIdStatus === 'review') {
      // Red ID - already requires review, open modal directly
      debugLog('🔴 RED ID detected - Opening review modal directly (NO API CALL)');
      try {
        const details = await fetchVerificationDetails(instructionRef);
        setReviewModalDetails(details);
        setShowReviewModal(true);
      } catch (error) {
        console.error('Failed to fetch verification details:', error);
        alert('Failed to load verification details. Please try again.');
      }
      return; // STOP HERE - no API call needed
    } 
    
    if (verifyIdStatus === 'complete') {
      // Green ID - already completed, open review modal to show details
      debugLog('🟢 GREEN ID detected - Opening review modal to show completion details');
      try {
        const details = await fetchVerificationDetails(instructionRef);
        setReviewModalDetails(details);
        setShowReviewModal(true);
      } catch (error) {
        console.error('Failed to fetch verification details:', error);
        alert('Failed to load verification details. Please try again.');
      }
      return; // STOP HERE - no API call needed
    }

    // Only reach here if status is 'pending' or 'received' - these need API calls
    debugLog(`🟡 PENDING/RECEIVED ID detected - Making API call for ${instructionRef}`);

    // Set loading state
    setIdVerificationLoading(prev => new Set(prev).add(instructionRef));

    try {
      const response = await fetch('/api/verify-id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ instructionRef }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        if (result.status === 'already_verified') {
          // ID is already verified, show success message
          alert('ID verification already completed for this instruction.');
        } else {
          // Verification submitted successfully
          debugLog('ID verification submitted successfully');
          debugLog('Admin Log - Response:', result.response);
          debugLog('Admin Log - Parse Results:', result.parseResults);
          
          // Show appropriate feedback based on results
          const overallResult = result.overall || 'pending';
          if (overallResult === 'review') {
            // Results require review - open modal for manual approval
            debugLog('Opening review modal for verification results');
            try {
              const details = await fetchVerificationDetails(instructionRef);
              setReviewModalDetails(details);
              setShowReviewModal(true);
            } catch (error) {
              console.error('Failed to fetch verification details for review:', error);
              alert('Verification requires manual review. Please check the verification details.');
            }
          } else if (overallResult === 'passed') {
            alert('ID verification completed successfully!');
          } else {
            alert(`ID verification submitted. Status: ${overallResult}`);
          }
          
          // Note: Card will update status on next data refresh
        }
      } else {
        throw new Error(result.message || 'Unknown error occurred');
      }

    } catch (error) {
      console.error('ID verification failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`ID verification failed: ${errorMessage}`);
      
      // Stay on current page - don't redirect to EID page on error
    } finally {
      // Clear loading state
      setIdVerificationLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(instructionRef);
        return newSet;
      });
    }
  };

  /**
   * Handle verification approval from review modal
   */
  const handleVerificationApproval = async (instructionRef: string) => {
    try {
      await approveVerification(instructionRef);
      
      // Update local data to reflect the approval - update both instruction AND EID records
      setInstructionData(prevData => 
        prevData.map(prospect => ({
          ...prospect,
          instructions: prospect.instructions.map((instruction: any) => {
            if (instruction.InstructionRef === instructionRef) {
              debugLog('Updating instruction:', instructionRef, 'from', instruction.EIDOverallResult, 'to Verified');
              return { ...instruction, EIDOverallResult: 'Verified', stage: 'proof-of-id-complete' };
            }
            return instruction;
          }),
          // Also update the electronicIDChecks/idVerifications arrays
          electronicIDChecks: (prospect.electronicIDChecks || []).map((eid: any) => {
            if ((eid.MatterId || eid.InstructionRef) === instructionRef) {
              return { ...eid, EIDOverallResult: 'Verified', EIDStatus: 'complete' };
            }
            return eid;
          }),
          idVerifications: (prospect.idVerifications || []).map((eid: any) => {
            if ((eid.MatterId || eid.InstructionRef) === instructionRef) {
              return { ...eid, EIDOverallResult: 'Verified', EIDStatus: 'complete' };
            }
            return eid;
          })
        }))
      );
      
      // Also update poidData for consistency
      setPoidData(prevPoidData =>
        prevPoidData.map(eid => {
          if ((eid.matter_id || (eid as any).InstructionRef) === instructionRef) {
            return { ...eid, EIDOverallResult: 'Verified' as any, EIDStatus: 'complete' as any };
          }
          return eid;
        })
      );

      // Update the modal details to show the new status
      if (reviewModalDetails) {
        setReviewModalDetails({
          ...reviewModalDetails,
          overallResult: 'Verified'
        });
      }

      // Show success message
      alert('ID verification approved successfully.');
      
      // Force a data refresh to ensure the UI updates properly
      setTimeout(() => {
        fetchUnifiedEnquiries();
      }, 1000);
      
    } catch (error) {
      console.error('Failed to approve verification:', error);
      alert('Failed to approve verification. Please try again.');
      throw error;
    }
  };


  const handleOpenRiskCompliance = (ref: string) => {
    setRiskFilterRef(ref);
    setActiveTab('risk');
  };

  const handleDraftCclNow = () => {
    setShowNewMatterPage(false);
    setShowCclDraftPage(true);
    // Removed smooth scroll to prevent jolt
    // setTimeout(() => { window.scrollTo({ top: 0 }); }, 0);
  };

  // Document Preview Handler
  const handleDocumentPreview = (doc: any, instructionRef: string) => {
    setPreviewDocument({ ...doc, InstructionRef: instructionRef });
    setPreviewModalOpen(true);
  };

  const handleCloseDocumentPreview = () => {
    setPreviewModalOpen(false);
    setPreviewDocument(null);
  };

  // Inline EID review: auto-load details for the selected instruction when available
  useEffect(() => {
    const load = async () => {
      try {
        if (selectedInstruction?.InstructionRef) {
          const details = await fetchVerificationDetails(selectedInstruction.InstructionRef);
          setReviewModalDetails(details);
        }
      } catch (e) {
        console.error('Failed to load EID details inline:', e);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInstruction?.InstructionRef]);

  // Inline EID review: request additional documents via server route (same as modal)
  const requestEidDocumentsInline = async (instructionRef: string) => {
    try {
      const response = await fetch(`/api/verify-id/${instructionRef}/request-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send email');
      }
      const result = await response.json();
      showToast(`Document request email sent to ${result.recipient}`, 'success');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      showToast(`Failed to send document request: ${msg}`, 'error');
    }
  };


  // Always open CCL template for global Draft CCL action
  const handleOpenDraftCcl = (ref: string) => {
    setSelectedInstruction({ InstructionRef: ref } as any);
    // Set a global variable or state to force initialTemplate to 'ccl'
    // If DocumentsV3 is rendered here, pass initialTemplate='ccl' directly
    // If not, ensure the prop is always 'ccl' for this action
    setShowCclDraftPage(true);
    // Optionally, if you use a state for initialTemplate, set it here:
    // setInitialTemplate('ccl');
  };

  const gridContainerStyle = mergeStyles({
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
    gap: "16px",
    maxWidth: "1440px",
    width: "100%",
    margin: "0 auto",
    boxSizing: "border-box",
  });

  const overviewGridStyle = React.useMemo(() => mergeStyles({
    display: 'grid',
    gridTemplateColumns: (windowWidth < 768) ? '1fr' : (twoColumn ? '1fr 1fr' : '1fr'),
    gap: '8px',
    width: '100%',
    margin: '0 auto',
    padding: '16px',
    boxSizing: 'border-box',
    transition: 'grid-template-columns .25s ease',
    background: 'transparent', // Let parent handle background
    // Responsive adjustments
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr',
      gap: '12px',
      padding: '12px',
    },
    '@media (max-width: 480px)': {
      gap: '8px',
      padding: '8px',
    },
  }), [twoColumn, windowWidth]);

  const overviewItemStyle = mergeStyles({
    minWidth: '280px',
    width: '100%',
    '@media (max-width: 768px)': {
      minWidth: 'unset',
    },
    '@media (max-width: 480px)': {
      minWidth: 'unset',
    },
  });

  const repositionMasonry = React.useCallback(() => {
    const grid = overviewGridRef.current;
    if (!grid) return;
    const rowGap = parseInt(
      window.getComputedStyle(grid).getPropertyValue('grid-row-gap'),
    );
    const rowHeight = parseInt(
      window.getComputedStyle(grid).getPropertyValue('grid-auto-rows'),
    );
    Array.from(grid.children).forEach((child) => {
      const el = child as HTMLElement;
      const span = Math.ceil(
        (el.getBoundingClientRect().height + rowGap) / (rowHeight + rowGap),
      );
      el.style.gridRowEnd = `span ${span}`;
    });
  }, []);

  const handleCardToggle = React.useCallback(() => {
    const start = performance.now();
    const animate = () => {
      repositionMasonry();
      if (performance.now() - start < 350) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [repositionMasonry]);

  useLayoutEffect(() => {
    if (
      activeTab === "clients" &&
      !showRiskPage &&
      !showNewMatterPage &&
      !showEIDPage
    ) {
      repositionMasonry();
    }
  }, [
    overviewItems,
    selectedInstruction,
    repositionMasonry,
    activeTab,
    showRiskPage,
    showNewMatterPage,
    showEIDPage,
  ]);

  useEffect(() => {
    window.addEventListener('resize', repositionMasonry);
    return () => window.removeEventListener('resize', repositionMasonry);
  }, [repositionMasonry]);


  // Global action handlers that work with the selected instruction or first available instruction
  const handleGlobalOpenMatter = () => {
    const targetInstruction = selectedInstruction || overviewItems.find(item => item.instruction)?.instruction;
    if (targetInstruction) {
      handleOpenMatter(targetInstruction);
    }
  };

  const handleGlobalRiskAssessment = () => {
    const targetItem = selectedInstruction 
      ? overviewItems.find(item => item.instruction.InstructionRef === selectedInstruction.InstructionRef)
      : overviewItems.find(item => item.instruction);
    if (targetItem) {
      handleRiskAssessment(targetItem);
    }
  };

  const handleSelectorEIDCheck = async (instruction: any) => {
    setSelectorProcessing(instruction.InstructionRef);
    setSelectorResult(null);
    
    try {
      // Call the existing EID check logic
      await handleEIDCheck(instruction);
      // The result will be handled by the existing modal system
      // We'll show a success message in the selector
      setSelectorResult({ 
        success: true, 
        message: 'Verification initiated successfully',
        instructionRef: instruction.InstructionRef
      });
    } catch (error) {
      setSelectorResult({ 
        error: 'Verification failed. Please try again.',
        instructionRef: instruction.InstructionRef
      });
    } finally {
      setSelectorProcessing(null);
    }
  };

  const handleGlobalEIDCheck = () => {
    if (selectedInstruction) {
      handleEIDCheck(selectedInstruction);
    } else {
      // Show instruction selector for manual selection
      setSelectorAction('verify');
      setShowInstructionSelector(true);
    }
  };


  const handleStartNewMatter = () => {
    // Simplified: just show matter page with current selectedInstruction
    if (!selectedInstruction) return;
    clearMatterOpeningDraft();
    setShowNewMatterPage(true);
  // Removed smooth scroll to prevent jolt
  // setTimeout(() => window.scrollTo({ top: 0 }), 0);
  };


  if (showNewMatterPage) {
    // Preselect POIDs by matching InstructionRef
    let preselectedPoidIds: string[] = [];
    if (selectedInstruction && selectedInstruction.InstructionRef) {
      const unique = new Map<string, string>();
      (idVerificationOptions || []).forEach((poid: any) => {
        if (!poid || poid.InstructionRef !== selectedInstruction.InstructionRef) return;
        const key = (poid.email || '').toLowerCase();
        if (!unique.has(key)) {
          unique.set(key, String(poid.poid_id));
        }
      });
      preselectedPoidIds = Array.from(unique.values());
    }
    // Build instruction-sourced records for Select Client cards (new space only)
    const instructionRecords = (() => {
      if (selectedInstruction) {
        // Instruction entry: focus on the selected instruction only
        return [selectedInstruction];
      }
      // Generic entry: flatten all instructions from effectiveInstructionData
      const all: any[] = [];
      effectiveInstructionData.forEach((prospect) => {
        (prospect.instructions || []).forEach((inst: any) => all.push(inst));
      });
      return all;
    })();
    return (
      <Stack tokens={dashboardTokens} className={newMatterContainerStyle}>
        <FlatMatterOpening
          key={forceNewMatter ? `new-${Date.now()}` : `matter-${selectedInstruction?.InstructionRef || 'default'}`}
          poidData={idVerificationOptions}
          instructionRecords={instructionRecords}
          setPoidData={setPoidData}
          teamData={teamData}
          userInitials={userInitials}
          userData={userData}
          instructionRef={selectedInstruction?.InstructionRef}
          stage={selectedInstruction?.Stage}
          clientId={selectedInstruction?.prospectId?.toString()}
          hideClientSections={!!selectedInstruction}
          initialClientType={selectedInstruction?.ClientType}
          preselectedPoidIds={preselectedPoidIds}
          instructionPhone={selectedInstruction?.Phone}
          onDraftCclNow={handleDraftCclNow}
          onBack={() => setShowNewMatterPage(false)}
        />
      </Stack>
    );
  }

  if (showEIDPage) {
    return (
      <Stack tokens={dashboardTokens} className={containerStyle}>
        <EIDCheckPage
          poidData={idVerificationOptions}
          instruction={selectedInstruction}
          onBack={handleBack}
        />
      </Stack>
    );
  }



  function handleOpenInstruction(ref: string): void {
    // For instructions, set the selected instruction to show details
    setSelectedInstruction(ref);
  }

  return (
    <React.Fragment>
      {/* On-brand toast */}
      {toast && (
        <div
          className={"toast-enter-active"}
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 2000,
            minWidth: 280,
            maxWidth: 420,
            padding: '10px 14px',
            borderRadius: 8,
            background: isDarkMode ? '#0B1222' : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
            color: isDarkMode ? colours.dark.text : '#061733',
            border: `1px solid ${toast.type === 'success' ? '#34D399' : '#F87171'}`,
            boxShadow: isDarkMode ? '0 4px 6px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.07)',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: toast.type === 'success' ? '#10B981' : '#EF4444'
          }} />
          <div style={{ fontSize: 12, fontWeight: 600 }}>{toast.message}</div>
        </div>
      )}
      <Stack tokens={dashboardTokens} className={containerStyle}>
        <div className={sectionContainerStyle(isDarkMode)}>
        {/* Local development immediate Matter Opening CTA */}
        {isLocalhostEnv && activeTab === 'clients' && !showNewMatterPage && openMatterCandidates.length > 0 && !isWorkbenchVisible && (
          <div style={{
            position: 'fixed',
            bottom: '96px',
            right: '32px',
            zIndex: 1200,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {openMatterCandidates.slice(0,3).map((c:any) => (
              <button
                key={`matter-cta-${c.instruction.InstructionRef}`}
                onClick={() => {
                  setSelectedInstruction(c.instruction);
                  // Instruction selected - header will show expand option
                  setTimeout(()=> handleGlobalOpenMatter(), 50);
                }}
                style={{
                  background: 'linear-gradient(135deg,#2563EB 0%,#1D4ED8 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: '220px'
                }}
                title="Quick open matter (local only)"
              >
                <FaFolder /> Open Matter: {c.instruction.InstructionRef}
              </button>
            ))}
          </div>
        )}
      {activeTab === "pitches" && (
              <div className={overviewGridStyle} ref={overviewGridRef}>
        {(() => {
          // Get deals that haven't been converted to instructions yet (pure pitches)
          const pitchedItems = overviewItems.filter(item => 
            // Show only deals that don't have instructions yet (not converted)
            !item.instruction && !!item.deal
          );
          
          if (pitchedItems.length === 0) {
            return (
              <div style={{ 
                padding: '40px', 
                textAlign: 'center', 
                color: isDarkMode ? '#fff' : '#666',
                fontSize: '14px',
                fontFamily: 'Raleway, sans-serif'
              }}>
                <div style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
                  No pitches found
                </div>
                <div style={{ opacity: 0.8, lineHeight: 1.5 }}>
                  No unconverted deals are available. Pitches show deals that haven't been converted to instructions yet.
                </div>
              </div>
            );
          }
          
          return pitchedItems.filter(item => {
            // Apply pitches status filter
            if (pitchesStatusFilter === 'All') return true;
            if (pitchesStatusFilter === 'Open') return String(item.deal?.Status).toLowerCase() !== 'closed';
            if (pitchesStatusFilter === 'Closed') return String(item.deal?.Status).toLowerCase() === 'closed';
            return true;
          }).map((item, idx) => {
                    const row = Math.floor(idx / 4);
                    const col = idx % 4;
                    const animationDelay = row * 0.2 + col * 0.1;
                    const dealKey = `pitch-${item.deal?.DealId}` || idx;
                    return (
                      <div key={`pitch-${dealKey}`} className={overviewItemStyle}>
                        <InstructionCard
                          index={idx}
                          instruction={null} // No instruction - this is a pure pitch/deal
                          deal={item.deal}
                          deals={item.deals}
                          clients={item.clients}
                          risk={(item as any).risk}
                          eid={(item as any).eid}
                          eids={(item as any).eids}
                          compliance={undefined}
                          documents={item.documents}
                          payments={(item as any).payments}
                          prospectId={item.prospectId}
                          documentCount={item.documentCount ?? 0}
                          animationDelay={animationDelay}
                          expanded={false} // Don't expand pitches by default
                          selected={false} // Simple selection for pitches
                          getClientNameByProspectId={getClientNameByProspectId}
                          onDealEdit={handleDealEdit}
                          teamData={teamData}
                          onRiskClick={() => handleRiskAssessment(item)}
                          onSelect={() => {
                            // TODO: Implement pitch selection logic
                            debugLog('Pitch selected:', item.deal?.DealId);
                          }}
                          onToggle={() => {
                            // TODO: Implement pitch toggle logic
                            debugLog('Pitch toggled:', item.deal?.DealId);
                          }}
                          onProofOfIdClick={() => {
                            // Not applicable for pitches
                          }}
                          onRefreshData={async () => {
                            // Refresh deal data after actions complete
                            try {
                              const dealId = item.deal?.DealId;
                              if (!dealId) return;
                              
                              debugLog('Refreshing deal data for:', dealId);
                              // TODO: Add deal refresh API call when needed
                            } catch (error) {
                              console.error('Failed to refresh deal data:', error);
                            }
                          }}
                        />
                      </div>
                    );
                  });
                })()}
            </div>
          )}
      {activeTab === "clients" && (
              <div className={overviewGridStyle} ref={overviewGridRef}>
        {filteredOverviewItems.filter(item => 
          // Show only items with instructions (exclude pitched deals)
          item.instruction
        ).map((item, idx) => {
                  const row = Math.floor(idx / 4);
                  const col = idx % 4;
                  const animationDelay = row * 0.2 + col * 0.1;
                  const itemKey = item.instruction?.InstructionRef || idx;
                  return (
                    <div key={`instruction-${itemKey}-${selectedInstruction?.InstructionRef === item.instruction?.InstructionRef ? 'selected' : 'unselected'}`} className={overviewItemStyle}>
                      <InstructionCard
                        index={idx}
                        key={`card-${itemKey}-${selectedInstruction?.InstructionRef === item.instruction?.InstructionRef}`}
                        instruction={item.instruction as any}
                        deal={(item as any).deal}
                        deals={item.deals}
                        clients={item.clients}
                        risk={(item as any).risk}
                        eid={(item as any).eid}
                        eids={(item as any).eids}
                        compliance={undefined}
                        documents={item.instruction?.documents}
                        payments={(item as any).payments}
                        prospectId={item.prospectId}
                        documentCount={item.documentCount ?? 0}
                        animationDelay={animationDelay}
                        expanded={overviewItems.length === 1 || selectedInstruction?.InstructionRef === item.instruction?.InstructionRef}
                        selected={selectedInstruction?.InstructionRef === item.instruction?.InstructionRef}
                        getClientNameByProspectId={getClientNameByProspectId}
                        onDealEdit={handleDealEdit}
                        teamData={teamData}
                        onRiskClick={() => handleRiskAssessment(item)}
                          onEditRisk={(ref) => {
                            const found = overviewItems.find(o => o.instruction?.InstructionRef === ref);
                            if (found) handleRiskAssessment(found);
                          }}
                          onDeleteRisk={handleRiskAssessmentDelete}
                        onOpenMatter={handleOpenMatter}
                        onOpenWorkbench={(tab) => {
                          // Select the instruction first
                          setSelectedInstruction(item.instruction);
                          // Open workbench with specific tab
                          setIsWorkbenchVisible(true);
                          setActiveWorkbenchTab(tab);
                        }}
                        onSelect={() => {
                          // Toggle selection: if already selected, unselect; otherwise select
                          flushSync(() => {
                            if (selectedInstruction?.InstructionRef === item.instruction?.InstructionRef) {
                              setSelectedInstruction(null);
                            } else {
                              setSelectedInstruction(item.instruction);
                              // New instruction selected - header will show expand option
                            }
                          });
                        }}
                        onToggle={handleCardToggle}
                        onProofOfIdClick={() =>
                          handleOpenRiskCompliance(item.instruction?.InstructionRef)
                        }
                        onEIDClick={() => handleEIDCheck(item.instruction)}
                        idVerificationLoading={idVerificationLoading.has(item.instruction?.InstructionRef || '')}
                        onRefreshData={async () => {
                          // Refresh instruction data after actions complete
                          try {
                            const instructionRef = item.instruction?.InstructionRef;
                            if (!instructionRef) return;
                            
                            // Fetch updated instruction data
                            const response = await fetch(`/api/instructions/${instructionRef}`);
                            if (response.ok) {
                              const updatedData = await response.json();
                              
                              // Update the instruction within the prospect's instructions array
                              setInstructionData(prev => 
                                prev.map(prospectData => {
                                  // Check if any instruction in this prospect matches
                                  const hasMatchingInstruction = prospectData.instructions?.some(
                                    (inst: any) => inst.InstructionRef === instructionRef
                                  );
                                  
                                  if (hasMatchingInstruction) {
                                    return {
                                      ...prospectData,
                                      instructions: prospectData.instructions.map((inst: any) =>
                                        inst.InstructionRef === instructionRef ? { ...inst, ...updatedData } : inst
                                      )
                                    };
                                  }
                                  return prospectData;
                                })
                              );
                              
                              // Also update selectedInstruction if it matches
                              if (selectedInstruction?.InstructionRef === instructionRef) {
                                setSelectedInstruction((prev: any) => ({ ...prev, ...updatedData }));
                              }
                            }
                          } catch (error) {
                            console.error('Failed to refresh instruction data:', error);
                          }
                        }}
                      />
                    </div>

                  );
                })}
            </div>
          )}
          {activeTab === "risk" && (
            <>
              <div className={gridContainerStyle}>
                {groupedRiskComplianceData.length === 0 && (
                  <Text>No risk data available.</Text>
                )}
                {groupedRiskComplianceData.map((groupedItem, idx) => {
                  const row = Math.floor(idx / 4);
                  const col = idx % 4;
                  const animationDelay = row * 0.2 + col * 0.1;
                  const isExpanded = groupedRiskComplianceData.length === 1 && !!riskFilterRef;
                  return (
                    <RiskComplianceCard
                      key={`${groupedItem.instructionRef}-${idx}`}
                      data={groupedItem}
                      animationDelay={animationDelay}
                      expanded={isExpanded}
                      onOpenInstruction={() =>
                        handleOpenInstruction(groupedItem.instructionRef)
                      }
                    />
                  );
                })}
              </div>
            </>
          )}
          {showCclDraftPage && (
            <DocumentsV3
              selectedInstructionProp={selectedInstruction}
              initialTemplate={selectedInstruction ? 'ccl' : undefined}
              instructions={instructionData}
            />
          )}
        </div>
        
        {/* Smart Contextual Action Panel - Unified Interface */}
        {activeTab === "clients" && (
          <>
            <style>{`
              @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(54, 144, 206, 0.4); }
                70% { box-shadow: 0 0 0 3px rgba(54, 144, 206, 0); }
                100% { box-shadow: 0 0 0 0 rgba(54, 144, 206, 0); }
              }
              
              @keyframes slideUp {
                from { transform: translateY(100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
              
              @keyframes workbenchSlideIn {
                from { 
                  max-height: 0;
                  opacity: 0; 
                  overflow: hidden;
                }
                to { 
                  max-height: 400px;
                  opacity: 1; 
                  overflow: visible;
                }
              }
              
              @keyframes workbenchSlideOut {
                from { 
                  transform: translateY(0); 
                  opacity: 1; 
                  scale: 1;
                }
                to { 
                  transform: translateY(-10px); 
                  opacity: 0; 
                  scale: 0.98;
                }
              }
              
              @keyframes slideDown {
                from { 
                  transform: translateY(-10px); 
                  opacity: 0; 
                  scale: 0.98;
                }
                to { 
                  transform: translateY(0); 
                  opacity: 1; 
                  scale: 1;
                }
              }
              
              .advanced-tools {
                animation: slideUp 0.3s ease-out;
              }
              
              .comprehensive-workbench {
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
              }
              
              body.workbench-resizing {
                cursor: ns-resize !important;
                user-select: none !important;
              }
              
              body.workbench-resizing * {
                cursor: ns-resize !important;
                user-select: none !important;
              }
              
              .workbench-tab-button {
                transition: all 0.2s ease;
              }
              
              .workbench-tab-button:hover {
                background-color: rgba(54, 144, 206, 0.1) !important;
                transform: translateY(-1px);
              }
              
              .expandable-section {
                transition: all 0.3s ease;
                overflow: hidden;
              }
              
              .expandable-content {
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                transform-origin: top;
              }
              
              .expand-button {
                transition: all 0.2s ease;
              }
              
              .expand-button:hover {
                background-color: rgba(54, 144, 206, 0.08) !important;
              }
              
              .expand-arrow {
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
              }
              /* Animated swap between Global Actions and Workbench header */
              .swap-section {
                transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), margin 0.3s ease, padding 0.3s ease;
                will-change: opacity, transform, max-height, margin, padding;
                overflow: hidden;
                transform-origin: center;
              }
              .swap-hidden {
                opacity: 0;
                transform: translateY(-12px) scale(0.95);
                max-height: 0 !important;
                height: 0 !important;
                min-height: 0 !important;
                margin-top: 0 !important;
                margin-bottom: 0 !important;
                padding: 0 !important;
                pointer-events: none;
                overflow: hidden;
              }
            `}</style>
            <div
              style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                height: isWorkbenchVisible && selectedInstruction ? workbenchHeight : 'auto',
                maxHeight: isWorkbenchVisible && selectedInstruction ? workbenchHeight : 'auto',
                background: workbenchPanelBackground(isDarkMode),
                borderTop: `1px solid ${workbenchBorderColour(isDarkMode)}`,
                boxShadow: isDarkMode ? '0 -10px 24px rgba(2, 6, 23, 0.55)' : '0 -4px 12px rgba(15, 23, 42, 0.08)',
                zIndex: 1000,
                transition: isResizing ? 'none' : 'all 0.3s ease',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Resize Handle */}
              {isWorkbenchVisible && selectedInstruction && (
                <div
                  onMouseDown={handleMouseDown}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '6px',
                    cursor: 'ns-resize',
                    background: 'transparent',
                    zIndex: 1001,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{
                    width: '40px',
                    height: '3px',
                    background: isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(100, 116, 139, 0.3)',
                    borderRadius: '2px'
                  }} />
                </div>
              )}
              {/* Unified bottom panel with animated swap */}
          <div style={{ padding: '0', flex: isWorkbenchVisible && selectedInstruction ? '1 1 auto' : '0 0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Unified Header that changes content based on state */}
                <div
                  onClick={selectedInstruction ? () => setIsWorkbenchVisible(!isWorkbenchVisible) : undefined}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 26px',
                    background: selectedInstruction ? workbenchHeaderBackground(isDarkMode) : 'transparent',
                    border: 'none',
                    borderRadius: '0',
                    cursor: selectedInstruction ? 'pointer' : 'default',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    height: '48px',
                    boxSizing: 'border-box',
                    position: 'relative',
                    overflow: 'hidden',
                    // Prevent visual shrink by offsetting the absolute 6px resize handle above
                    marginTop: (isWorkbenchVisible && selectedInstruction) ? 6 : 0
                  }}
                  onMouseEnter={(e) => {
                    if (selectedInstruction) {
                      e.currentTarget.style.background = isDarkMode 
                        ? 'linear-gradient(135deg, rgba(13, 47, 96, 1) 0%, rgba(6, 23, 51, 1) 100%)'
                        : `linear-gradient(135deg, ${colours.missedBlue} 0%, ${colours.websiteBlue} 100%)`;
                      e.currentTarget.style.boxShadow = isDarkMode 
                        ? '0 4px 20px rgba(13, 47, 96, 0.6), inset 0 1px 0 rgba(255,255,255,0.15)'
                        : `0 4px 20px rgba(6, 23, 51, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedInstruction) {
                      e.currentTarget.style.background = workbenchHeaderBackground(isDarkMode);
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  {/* Left side - Dynamic content based on state */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Pulsing dot + Instruction ref */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ 
                        width: 3, 
                        height: 3, 
                        borderRadius: '50%', 
                        background: selectedInstruction ? getAreaColor(selectedInstruction.AreaOfWork || selectedInstruction.Area_of_Work || selectedInstruction.areaOfWork) : colours.blue,
                        animation: 'pulse 2s infinite'
                      }} />
                      <span style={{ 
                        fontSize: '11px', 
                        fontWeight: 600, 
                        color: selectedInstruction ? '#ffffff' : (isDarkMode ? colours.dark.text : '#1f2937'),
                        letterSpacing: '0.02em',
                        fontFamily: selectedInstruction ? 'monospace' : 'Raleway, sans-serif',
                        textShadow: selectedInstruction ? '0 1px 2px rgba(0,0,0,0.3)' : 'none'
                      }}>
                        {selectedInstruction ? selectedInstruction.InstructionRef : 'One Off Actions'}
                      </span>
                    </div>

                    {/* Area of Work Tag (separated) */}
                    {selectedInstruction && (areaOfWorkInfo.label || 'Commercial') && (
                      <span style={{
                        fontSize: '8px',
                        fontWeight: 700,
                        color: '#ffffff',
                        letterSpacing: '0.03em',
                        textTransform: 'uppercase',
                        background: `${getAreaColor(selectedInstruction.AreaOfWork || selectedInstruction.Area_of_Work || selectedInstruction.areaOfWork)}40`,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: `1px solid ${getAreaColor(selectedInstruction.AreaOfWork || selectedInstruction.Area_of_Work || selectedInstruction.areaOfWork)}60`,
                        backdropFilter: 'blur(4px)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}>
                        {areaOfWorkInfo.label || 'Commercial'}
                      </span>
                    )}

                    {/* Client Information */}
                    {selectedInstruction && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {/* Client Type Icon */}
                        {selectedInstruction.ClientType === 'Company' ? (
                          <FaBuilding style={{ 
                            color: '#ffffff', 
                            fontSize: '10px',
                            opacity: 0.9,
                            filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))'
                          }} />
                        ) : (
                          <FaUser style={{ 
                            color: '#ffffff', 
                            fontSize: '10px',
                            opacity: 0.9,
                            filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))'
                          }} />
                        )}
                        
                        {/* Client Name */}
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 500,
                          color: '#ffffff',
                          opacity: 0.95,
                          maxWidth: '200px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          textShadow: '0 1px 2px rgba(0,0,0,0.2)'
                        }}>
                          {selectedInstruction.ClientType === 'Company' 
                            ? (selectedInstruction.CompanyName || `${selectedInstruction.FirstName || ''} ${selectedInstruction.LastName || ''}`.trim() || 'Company Client')
                            : (`${selectedInstruction.FirstName || ''} ${selectedInstruction.LastName || ''}`.trim() || selectedInstruction.CompanyName || 'Individual Client')
                          }
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Right side - Dynamic content based on state */}
                  {selectedInstruction ? (
                    /* Workbench collapse/expand indicator */
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontSize: '9px',
                        color: '#ffffff',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        opacity: 0.9,
                        textShadow: '0 1px 2px rgba(0,0,0,0.2)'
                      }}>
                        {isWorkbenchVisible ? 'Collapse' : 'Expand'}
                      </span>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        color: '#ffffff',
                        transform: isWorkbenchVisible ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        padding: '1px',
                        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))'
                      }}>
                        <MdExpandMore size={14} />
                      </div>
                    </div>
                  ) : (
                    /* Global action buttons */
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={handleGlobalEIDCheck}
                      disabled={verifyButtonDisabled}
                      onMouseEnter={(e) => {
                        if (!verifyButtonDisabled) {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.background = workbenchButtonHover(isDarkMode);
                          setHoveredButton('verify');
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.background = verifyButtonBackground;
                        setHoveredButton(null);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${verifyButtonBorder}`,
                        background: verifyButtonBackground,
                        color: verifyButtonColor,
                        cursor: verifyButtonDisabled ? 'default' : 'pointer',
                        fontSize: '11px',
                        fontWeight: '600',
                        opacity: verifyButtonDisabled ? 0.8 : 1,
                        animation: nextReadyAction === 'verify' ? 'pulse 2s infinite' : 'none',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '80px',
                        position: 'relative',
                      }}
                    >
                      <span style={{ 
                        transition: 'opacity 160ms ease',
                        opacity: hoveredButton === 'verify' ? 0 : 1
                      }}>
                        <FaIdCard size={14} />
                      </span>
                      <span style={{ 
                        transition: 'opacity 160ms ease',
                        opacity: hoveredButton === 'verify' ? 1 : 0,
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        whiteSpace: 'nowrap'
                      }}>
                        {verifyButtonLabel}
                      </span>
                    </button>

                    <button
                      onClick={handleGlobalRiskAssessment}
                      disabled={riskButtonDisabled}
                      onMouseEnter={(e) => {
                        if (!riskButtonDisabled) {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.background = workbenchButtonHover(isDarkMode);
                          setHoveredButton('risk');
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.background = riskButtonBackground;
                        setHoveredButton(null);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${riskButtonBorder}`,
                        background: riskButtonBackground,
                        color: riskButtonColor,
                        cursor: riskButtonDisabled ? 'default' : 'pointer',
                        fontSize: '11px',
                        fontWeight: '600',
                        opacity: riskButtonDisabled ? 0.8 : 1,
                        animation: nextReadyAction === 'risk' ? 'pulse 2s infinite' : 'none',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '80px',
                        position: 'relative',
                      }}
                    >
                      <span style={{ 
                        transition: 'opacity 160ms ease',
                        opacity: hoveredButton === 'risk' ? 0 : 1
                      }}>
                        <FaShieldAlt size={14} />
                      </span>
                      <span style={{ 
                        transition: 'opacity 160ms ease',
                        opacity: hoveredButton === 'risk' ? 1 : 0,
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        whiteSpace: 'nowrap'
                      }}>
                        Assess Risk
                      </span>
                    </button>

                    <button
                      onClick={handleGlobalOpenMatter}
                      onMouseEnter={(e) => {
                        if (!matterLinked) {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.background = workbenchButtonHover(isDarkMode);
                          setHoveredButton('matter');
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.background = matterButtonBackground;
                        setHoveredButton(null);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${matterButtonBorder}`,
                        background: matterButtonBackground,
                        color: matterButtonColor,
                        cursor: matterLinked ? 'default' : 'pointer',
                        fontSize: '11px',
                        fontWeight: '600',
                        animation: nextReadyAction === 'matter' ? 'pulse 2s infinite' : 'none',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '80px',
                        position: 'relative',
                      }}
                    >
                      <span style={{ 
                        transition: 'opacity 160ms ease',
                        opacity: hoveredButton === 'matter' ? 0 : 1
                      }}>
                        <FaFolder size={14} />
                      </span>
                      <span style={{ 
                        transition: 'opacity 160ms ease',
                        opacity: hoveredButton === 'matter' ? 1 : 0,
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        whiteSpace: 'nowrap'
                      }}>
                        Open Matter
                      </span>
                    </button>

                    <button
                      onClick={() => console.log('Document sync')}
                      onMouseEnter={(e) => {
                        if (selectedOverviewItem?.instruction?.MatterRef) {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.background = workbenchButtonHover(isDarkMode);
                          setHoveredButton('sync');
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.background = syncButtonBackground;
                        setHoveredButton(null);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${syncButtonBorder}`,
                        background: syncButtonBackground,
                        color: syncButtonColor,
                        cursor: selectedOverviewItem?.instruction?.MatterRef ? 'pointer' : 'default',
                        fontSize: '11px',
                        fontWeight: '600',
                        transition: 'all 0.2s ease',
                        opacity: selectedOverviewItem?.instruction?.MatterRef ? 1 : 0.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '80px',
                        position: 'relative',
                      }}
                      title={selectedOverviewItem?.instruction?.MatterRef ? 'Sync documents to matter' : 'Matter must be opened first'}
                    >
                      <span style={{ 
                        transition: 'opacity 160ms ease',
                        opacity: hoveredButton === 'sync' ? 0 : 1
                      }}>
                        <MdSync size={14} />
                      </span>
                      <span style={{ 
                        transition: 'opacity 160ms ease',
                        opacity: hoveredButton === 'sync' ? 1 : 0,
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        whiteSpace: 'nowrap'
                      }}>
                        Sync Docs
                      </span>
                    </button>

                    <button
                      onClick={() => setShowCclDraftPage(true)}
                      onMouseEnter={(e) => {
                        if (!cclCompleted) {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.background = workbenchButtonHover(isDarkMode);
                          setHoveredButton('ccl');
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.background = cclButtonBackground;
                        setHoveredButton(null);
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${cclButtonBorder}`,
                        background: cclButtonBackground,
                        color: cclButtonColor,
                        cursor: cclCompleted ? 'default' : 'pointer',
                        fontSize: '11px',
                        fontWeight: '600',
                        animation: nextReadyAction === 'ccl' ? 'pulse 2s infinite' : 'none',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '80px',
                        position: 'relative',
                      }}
                    >
                      <span style={{ 
                        transition: 'opacity 160ms ease',
                        opacity: hoveredButton === 'ccl' ? 0 : 1
                      }}>
                        <FaFileAlt size={14} />
                      </span>
                      <span style={{ 
                        transition: 'opacity 160ms ease',
                        opacity: hoveredButton === 'ccl' ? 1 : 0,
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        whiteSpace: 'nowrap'
                      }}>
                        Draft CCL
                      </span>
                    </button>
                  </div>
                  )}
                </div>
                
                {/* Workbench Content */}
                {selectedInstruction && isWorkbenchVisible && (
                    <div 
                      className="comprehensive-workbench"
                      style={{
                        background: workbenchCardBackground(isDarkMode),
                        border: `1px solid ${workbenchBorderColour(isDarkMode)}`,
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        overflow: 'hidden',
                        boxShadow: isDarkMode ? '0 -16px 32px rgba(2, 6, 23, 0.45)' : '0 -10px 24px rgba(15, 23, 42, 0.08)',
                        animation: 'workbenchSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: 'translateY(0)',
                        opacity: 1,
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        flex: '1 1 auto',
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                  {/* Tab Navigation */}
                  <div style={{
                    display: 'flex',
                    width: '100%',
                    background: 'transparent',
                    borderBottom: `1px solid ${workbenchBorderColour(isDarkMode)}`,
                    padding: '0 16px'
                  }}>
                    {[
                      { 
                        key: 'identity', 
                        label: 'Identity', 
                        status: verifyIdStatus,
                        icon: <FaIdCard size={12} />,
                        isComplete: !!(selectedInstruction?.PassportNumber || selectedInstruction?.DriversLicenseNumber)
                      },
                      { 
                        key: 'risk', 
                        label: 'Risk', 
                        status: riskStatus,
                        icon: <FaShieldAlt size={12} />,
                        isComplete: riskStatus === 'complete'
                      },
                      { 
                        key: 'payment', 
                        label: 'Payment', 
                        status: paymentCompleted ? 'complete' : 'pending',
                        icon: <FaCreditCard size={12} />,
                        isComplete: paymentCompleted
                      },
                      { 
                        key: 'documents', 
                        label: 'Documents', 
                        status: selectedOverviewItem?.instruction?.documents?.length > 0 ? 'complete' : 'pending',
                        icon: <FaFileAlt size={12} />,
                        isComplete: selectedOverviewItem?.instruction?.documents?.length > 0
                      },
                      { 
                        key: 'matter', 
                        label: 'Matter', 
                        status: matterLinked ? 'complete' : 'pending',
                        icon: <FaFolder size={12} />,
                        isComplete: !!selectedInstruction?.MatterId
                      },
                      { 
                        key: 'override', 
                        label: '', 
                        status: 'available',
                        icon: <FaCog size={16} />,
                        isComplete: false
                      }
                    ].map(tab => (
                      <button
                        key={tab.key}
                        className="workbench-tab-button"
                        onClick={() => setActiveWorkbenchTab(tab.key)}
                        style={{
                          flex: tab.key === 'override' ? '0 0 auto' : 1,
                          padding: tab.key === 'override' ? '12px 8px' : '12px 16px',
                          minWidth: tab.key === 'override' ? '40px' : 'auto',
                          border: 'none',
                          background: activeWorkbenchTab === tab.key 
                            ? (isDarkMode
                              ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.24) 0%, rgba(37, 99, 235, 0.18) 100%)'
                              : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)')
                            : 'transparent',
                          borderBottom: activeWorkbenchTab === tab.key 
                            ? `2px solid ${tab.isComplete ? colours.green : colours.blue}` 
                            : '2px solid transparent',
                          color: tab.isComplete
                            ? (activeWorkbenchTab === tab.key
                              ? (isDarkMode ? '#4ade80' : colours.green)
                              : (isDarkMode ? '#22c55e' : '#90c695'))
                            : (activeWorkbenchTab === tab.key
                              ? (isDarkMode ? colours.dark.text : colours.light.text)
                              : workbenchMutedText(isDarkMode)),
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: activeWorkbenchTab === tab.key ? 600 : 500,
                          letterSpacing: '0.5px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'all 0.2s ease',
                          position: 'relative'
                        }}
                      >
                        <span style={{ color: 'inherit', display: 'flex', alignItems: 'center' }}>
                          {tab.icon}
                        </span>
                        {tab.label && (
                          <span style={{ color: 'inherit' }}>
                            {tab.label}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Tab Content Area */}
                  <div style={{
                    padding: '12px',
                    flex: '1 1 auto',
                    overflowY: 'auto',
                    background: workbenchCardBackground(isDarkMode),
                    borderTop: `1px solid ${workbenchBorderColour(isDarkMode)}`,
                    borderTopLeftRadius: '12px',
                    borderTopRightRadius: '12px'
                  }}>
                    {activeWorkbenchTab === 'identity' && (
                      <div>
                        {/* Identity & Instruction Details Header */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '16px',
                          padding: '12px 16px',
                          background: isDarkMode 
                            ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(30, 41, 59, 0.85) 100%)'
                            : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                          borderRadius: '10px',
                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                          boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                        }}>
                          <div>
                            <h3 style={{
                              margin: 0,
                              fontSize: '14px',
                              fontWeight: 600,
                              color: colours.blue,
                              marginBottom: '2px'
                            }}>
                              Identity & Instruction Details
                            </h3>
                            <p style={{
                              margin: 0,
                              fontSize: '11px',
                              color: isDarkMode ? 'rgba(226, 232, 240, 0.65)' : 'rgba(15, 23, 42, 0.65)'
                            }}>
                              Review and edit client identity and instruction information
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <FaUser style={{ fontSize: '20px', color: colours.blue, opacity: 0.7 }} />
                          </div>
                        </div>

                        {/* Compact Identity Details Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                          {/* Personal Information */}
                          <div style={{
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '14px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                            boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                          }}>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: colours.blue,
                              marginBottom: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.025em',
                              borderBottom: `1px solid ${colours.blue}`,
                              paddingBottom: '6px'
                            }}>
                              Personal Information
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {[
                                { label: 'Title', field: 'Title', value: selectedInstruction?.Title || 'Not specified', editable: true },
                                { label: 'First Name', field: 'FirstName', value: selectedInstruction?.FirstName || selectedInstruction?.ClientName || 'Not specified', editable: true },
                                { label: 'Last Name', field: 'LastName', value: selectedInstruction?.LastName || 'Not specified', editable: true },
                                { label: 'Email', field: 'Email', value: selectedInstruction?.ClientEmail || selectedInstruction?.Email || 'Not specified', editable: true },
                                { label: 'Phone', field: 'Phone', value: selectedInstruction?.Phone || 'Not specified', editable: true },
                                { label: 'Gender', field: 'Gender', value: selectedInstruction?.Gender || 'Not specified', editable: true },
                                { label: 'Nationality', field: 'Nationality', value: selectedInstruction?.Nationality || 'Not specified', editable: true }
                              ].map((field) => (
                                <div key={field.label} style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '4px 0',
                                  cursor: field.editable ? 'pointer' : 'default',
                                  borderRadius: '4px',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = 'transparent';
                                  }
                                }}
                                onClick={() => {
                                  if (field.editable) {
                                    handleFieldEdit('identity', field.field, field.value);
                                  }
                                }}>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                    fontWeight: 500
                                  }}>
                                    {field.label}:
                                  </span>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? colours.dark.text : '#111827',
                                    fontWeight: 600,
                                    textAlign: 'right',
                                    maxWidth: '55%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Identification */}
                          <div style={{
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '14px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                            boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                          }}>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: colours.blue,
                              marginBottom: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.025em',
                              borderBottom: `1px solid ${colours.blue}`,
                              paddingBottom: '6px'
                            }}>
                              Identification
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {[
                                { label: 'ID Type', field: 'IDType', value: selectedInstruction?.PassportNumber ? 'Passport' : selectedInstruction?.DriversLicenseNumber ? 'Driving License' : selectedInstruction?.NationalIdNumber ? 'National ID' : 'Not specified', editable: true },
                                { label: 'Passport', field: 'PassportNumber', value: selectedInstruction?.PassportNumber || 'Not provided', editable: true },
                                { label: 'Driving License', field: 'DriversLicenseNumber', value: selectedInstruction?.DriversLicenseNumber || 'Not provided', editable: true },
                                { label: 'National ID', field: 'NationalIdNumber', value: selectedInstruction?.NationalIdNumber || 'Not provided', editable: true }
                              ].map((field) => (
                                <div key={field.label} style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '4px 0',
                                  cursor: field.editable ? 'pointer' : 'default',
                                  borderRadius: '4px',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = 'transparent';
                                  }
                                }}
                                onClick={() => {
                                  if (field.editable) {
                                    handleFieldEdit('identity', field.field, field.value);
                                  }
                                }}>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                    fontWeight: 500
                                  }}>
                                    {field.label}:
                                  </span>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? colours.dark.text : '#111827',
                                    fontWeight: 600,
                                    textAlign: 'right',
                                    maxWidth: '55%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Address Information */}
                          <div style={{
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '14px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                            boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                          }}>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: colours.blue,
                              marginBottom: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.025em',
                              borderBottom: `1px solid ${colours.blue}`,
                              paddingBottom: '6px'
                            }}>
                              Address
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {[
                                { label: 'Street', field: 'Street', value: `${selectedInstruction?.HouseNumber || ''} ${selectedInstruction?.Street || ''}`.trim() || 'Not specified', editable: false },
                                { label: 'City', field: 'City', value: selectedInstruction?.City || 'Not specified', editable: false },
                                { label: 'County', field: 'County', value: selectedInstruction?.County || selectedInstruction?.State || 'Not specified', editable: false },
                                { label: 'Postcode', field: 'Postcode', value: selectedInstruction?.Postcode || selectedInstruction?.PostalCode || 'Not specified', editable: false },
                                { label: 'Country', field: 'Country', value: selectedInstruction?.Country || 'Not specified', editable: true }
                              ].map((field) => (
                                <div key={field.label} style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '4px 0',
                                  cursor: field.editable ? 'pointer' : 'default',
                                  borderRadius: '4px',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = 'transparent';
                                  }
                                }}
                                onClick={() => {
                                  if (field.editable) {
                                    handleFieldEdit('identity', field.field, field.value);
                                  }
                                }}>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                    fontWeight: 500
                                  }}>
                                    {field.label}:
                                  </span>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? colours.dark.text : '#111827',
                                    fontWeight: 600,
                                    textAlign: 'right',
                                    maxWidth: '55%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Entity Information */}
                          <div style={{
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '14px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                            boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                          }}>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: colours.blue,
                              marginBottom: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.025em',
                              borderBottom: `1px solid ${colours.blue}`,
                              paddingBottom: '6px'
                            }}>
                              Entity Details
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {[
                                { label: 'Client Type', field: 'ClientType', value: selectedInstruction?.ClientType || selectedInstruction?.EntityType || 'Individual', editable: true },
                                { label: 'Company', field: 'CompanyName', value: selectedInstruction?.CompanyName || (selectedInstruction?.ClientType === 'Individual' ? 'Not applicable' : 'Not specified'), editable: true },
                                { label: 'Company No.', field: 'CompanyNumber', value: selectedInstruction?.CompanyNumber || (selectedInstruction?.ClientType === 'Individual' ? 'Not applicable' : 'Not specified'), editable: true },
                                { label: 'Company Country', field: 'CompanyCountry', value: selectedInstruction?.CompanyCountry || (selectedInstruction?.ClientType === 'Individual' ? 'Not applicable' : 'Not specified'), editable: true }
                              ].map((field) => (
                                <div key={field.label} style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '4px 0',
                                  cursor: field.editable ? 'pointer' : 'default',
                                  borderRadius: '4px',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = 'transparent';
                                  }
                                }}
                                onClick={() => {
                                  if (field.editable) {
                                    handleFieldEdit('identity', field.field, field.value);
                                  }
                                }}>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                    fontWeight: 500
                                  }}>
                                    {field.label}:
                                  </span>
                                  <span style={{
                                    fontSize: '10px',
                                    color: field.value && field.value !== 'Not applicable' && field.value !== 'Not specified'
                                      ? (isDarkMode ? colours.dark.text : '#111827')
                                      : (isDarkMode ? 'rgba(226, 232, 240, 0.5)' : 'rgba(15, 23, 42, 0.5)'),
                                    fontWeight: 600,
                                    textAlign: 'right',
                                    maxWidth: '55%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    fontStyle: field.value && field.value !== 'Not applicable' && field.value !== 'Not specified' ? 'normal' : 'italic'
                                  }}>
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Electronic ID Verification Section */}
                        <div style={{ marginBottom: '24px' }}>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: isDarkMode ? colours.dark.text : '#1f2937',
                            marginBottom: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <FaShieldAlt style={{ fontSize: '12px', color: colours.green }} />
                            Electronic ID Verification
                          </div>

                          <div style={{
                            background: workbenchCardBackground(isDarkMode),
                            borderRadius: '12px',
                            padding: '16px',
                            border: `1px solid ${workbenchBorderColour(isDarkMode)}`,
                            boxShadow: isDarkMode ? '0 6px 16px rgba(2, 6, 23, 0.35)' : '0 6px 16px rgba(15, 23, 42, 0.08)'
                          }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', alignItems: 'stretch' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {[
                                  { label: 'EID Status', value: selectedOverviewItem?.eid?.EIDStatus || 'Not started' },
                                  { label: 'POID Result', value: selectedOverviewItem?.eid?.EIDOverallResult || 'Pending' },
                                  { label: 'Consent Given', value: selectedInstruction.ConsentGiven ? 'Yes' : 'No' }
                                ].map((field) => (
                                  <div key={field.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{
                                      fontSize: '10px',
                                      color: workbenchMutedText(isDarkMode),
                                      fontWeight: 500,
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.025em'
                                    }}>
                                      {field.label}:
                                    </span>
                                    <span style={{
                                      fontSize: '11px',
                                      color: (() => {
                                        if (field.label === 'POID Result' && field.value === 'review') return colours.red;
                                        if (field.label === 'EID Status' && field.value === 'completed') return colours.green;
                                        return isDarkMode ? colours.dark.text : '#111827';
                                      })(),
                                      fontWeight: 500,
                                      textAlign: 'right'
                                    }}>
                                      {field.value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                {selectedOverviewItem?.eid?.EIDOverallResult === 'review' ? (
                                  <div
                                    style={{
                                      width: '100%',
                                      border: `1px solid ${workbenchBorderColour(isDarkMode)}`,
                                      borderRadius: 10,
                                      background: workbenchCardBackground(isDarkMode),
                                      padding: 12,
                                      boxShadow: isDarkMode ? '0 4px 12px rgba(2, 6, 23, 0.4)' : '0 4px 12px rgba(15, 23, 42, 0.08)'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? colours.dark.text : '#374151' }}>
                                        Verification details
                                      </div>
                                      {selectedInstruction?.InstructionRef && (
                                        <div style={{ fontSize: 10, color: isDarkMode ? colours.dark.subText : '#6B7280' }}>
                                          {selectedInstruction.InstructionRef}
                                        </div>
                                      )}
                                    </div>

                                    {reviewModalDetails ? (
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span style={{ fontSize: 10, color: colours.greyText, fontWeight: 500 }}>Overall Result:</span>
                                          <span style={{ fontSize: 11, fontWeight: 600, color: (reviewModalDetails.overallResult || '').toLowerCase() === 'verified' || (reviewModalDetails.overallResult || '').toLowerCase() === 'passed' ? colours.green : (reviewModalDetails.overallResult || '').toLowerCase() === 'review' ? '#ef4444' : (isDarkMode ? colours.dark.text : '#374151') }}>
                                            {reviewModalDetails.overallResult ?? 'Unknown'}
                                          </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span style={{ fontSize: 10, color: colours.greyText, fontWeight: 500 }}>Checked Date:</span>
                                          <span style={{ fontSize: 11, color: isDarkMode ? colours.dark.text : '#374151' }}>
                                            {reviewModalDetails.checkedDate || reviewModalDetails.EIDCheckedDate || '—'}
                                          </span>
                                        </div>
                                        <div style={{ gridColumn: '1 / -1', fontSize: 10, color: colours.greyText }}>
                                          {reviewModalDetails.summary || 'Electronic ID verification summary'}
                                        </div>

                                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, marginTop: 4 }}>
                                          {selectedInstruction?.InstructionRef && (
                                            <button
                                              onClick={() => handleVerificationApproval(selectedInstruction.InstructionRef)}
                                              style={{
                                                fontSize: 10,
                                                padding: '6px 10px',
                                                borderRadius: 4,
                                                border: `1px solid ${colours.green}`,
                                                background: isDarkMode ? 'transparent' : 'rgba(34,197,94,0.08)',
                                                color: colours.green,
                                                cursor: 'pointer'
                                              }}
                                            >
                                              Approve verification
                                            </button>
                                          )}
                                          {selectedInstruction?.InstructionRef && (
                                            <button
                                              onClick={() => requestEidDocumentsInline(selectedInstruction.InstructionRef!)}
                                              style={{
                                                fontSize: 10,
                                                padding: '6px 10px',
                                                borderRadius: 4,
                                                border: `1px solid ${colours.blue}`,
                                                background: 'transparent',
                                                color: colours.blue,
                                                cursor: 'pointer'
                                              }}
                                            >
                                              Request documents
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ fontSize: 11, color: colours.greyText }}>
                                        Loading verification details…
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                              
                              {/* Removed footer text to free space for additional status items */}
                            </div>
                          </div>
                        </div>

                        {/* Technical Details - Expandable */}
                        <div style={{
                          background: workbenchCardBackground(isDarkMode),
                          borderRadius: '12px',
                          padding: '12px',
                          border: `1px solid ${workbenchBorderColour(isDarkMode)}`,
                          boxShadow: isDarkMode ? '0 6px 16px rgba(2, 6, 23, 0.35)' : '0 6px 16px rgba(15, 23, 42, 0.08)',
                          marginTop: '16px'
                        }}>
                          <button
                            className="expand-button"
                            onClick={() => toggleSection('identity-raw')}
                            style={{
                              width: '100%',
                              background: 'none',
                              border: 'none',
                              color: colours.greyText,
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '4px 0'
                            }}
                          >
                            <span>Technical Details & Raw Database Record</span>
                            <div className="expand-arrow" style={{ 
                              transform: expandedSections['identity-raw'] ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              display: 'flex',
                              alignItems: 'center'
                            }}>
                              ⌄
                            </div>
                          </button>
                          
                          {expandedSections['identity-raw'] && (
                            <div className="expandable-content" style={{ 
                              marginTop: '12px',
                              background: isDarkMode ? '#1a1a1a' : '#ffffff', 
                              border: `1px solid ${isDarkMode ? colours.dark.border : '#e2e8f0'}`, 
                              borderRadius: '6px', 
                              padding: '12px', 
                              fontSize: '10px', 
                              fontFamily: 'Monaco, Consolas, monospace',
                              maxHeight: '250px',
                              overflowY: 'auto',
                              color: isDarkMode ? '#e5e5e5' : '#374151',
                              animation: 'slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}>
                              {selectedInstruction ? (
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {JSON.stringify(selectedInstruction, null, 2)}
                                </pre>
                              ) : (
                                <div style={{ color: colours.greyText, fontStyle: 'italic' }}>
                                  No instruction data available
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {activeWorkbenchTab === 'risk' && (
                      <div>
                        
                        {/* Risk Assessment Header with Actions */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '16px',
                          padding: '12px 16px',
                          background: isDarkMode 
                            ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(30, 41, 59, 0.85) 100%)'
                            : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                          borderRadius: '10px',
                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                          boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                        }}>
                          <div>
                            <h3 style={{
                              margin: 0,
                              fontSize: '14px',
                              fontWeight: 600,
                              color: colours.blue,
                              marginBottom: '2px'
                            }}>
                              Risk Assessment Review
                            </h3>
                            <p style={{
                              margin: 0,
                              fontSize: '11px',
                              color: isDarkMode ? 'rgba(226, 232, 240, 0.65)' : 'rgba(15, 23, 42, 0.65)'
                            }}>
                              Review and manage risk assessment data for this instruction
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {selectedOverviewItem?.risk && (
                              <button
                                onClick={() => {
                                  const targetItem = overviewItems.find((item: any) => 
                                    item.instruction?.InstructionRef === selectedInstruction?.InstructionRef
                                  );
                                  if (targetItem) handleRiskAssessment(targetItem);
                                }}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '10px',
                                  border: `1px solid ${colours.orange}`,
                                  borderRadius: '5px',
                                  background: 'transparent',
                                  color: colours.orange,
                                  cursor: 'pointer',
                                  fontWeight: 500
                                }}
                              >
                                Reassess
                              </button>
                            )}
                            {!selectedOverviewItem?.risk && (
                              <button
                                onClick={() => {
                                  const targetItem = overviewItems.find((item: any) => 
                                    item.instruction?.InstructionRef === selectedInstruction?.InstructionRef
                                  );
                                  if (targetItem) handleRiskAssessment(targetItem);
                                }}
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '10px',
                                  border: `1px solid ${colours.blue}`,
                                  borderRadius: '5px',
                                  background: colours.blue,
                                  color: 'white',
                                  cursor: 'pointer',
                                  fontWeight: 500
                                }}
                              >
                                Create Assessment
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Compact Risk Assessment Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                          {/* Risk Summary */}
                          <div style={{
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '14px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                            boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                          }}>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: colours.blue,
                              marginBottom: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.025em',
                              borderBottom: `1px solid ${colours.blue}`,
                              paddingBottom: '6px'
                            }}>
                              Assessment Summary
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {[
                                { label: 'Result', field: 'RiskAssessmentResult', value: selectedOverviewItem?.risk?.RiskAssessmentResult || 'Pending', editable: true },
                                { label: 'Score', field: 'RiskScore', value: selectedOverviewItem?.risk?.RiskScore ?? 'Not scored', editable: true },
                                { label: 'Level', field: 'TransactionRiskLevel', value: selectedOverviewItem?.risk?.TransactionRiskLevel || 'Not assessed', editable: true },
                                { label: 'Assessor', field: 'RiskAssessor', value: selectedOverviewItem?.risk?.RiskAssessor || 'Not assigned', editable: false }
                              ].map((field) => (
                                <div key={field.label} style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '4px 0',
                                  cursor: field.editable ? 'pointer' : 'default',
                                  borderRadius: '4px',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = 'transparent';
                                  }
                                }}
                                onClick={() => {
                                  if (field.editable) {
                                    handleFieldEdit('risk', field.field, field.value);
                                  }
                                }}>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                    fontWeight: 500
                                  }}>
                                    {field.label}:
                                  </span>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? colours.dark.text : '#111827',
                                    fontWeight: 600,
                                    textAlign: 'right',
                                    maxWidth: '55%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Client Risk Analysis */}
                          <div style={{
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '14px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                            boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                          }}>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: colours.blue,
                              marginBottom: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.025em',
                              borderBottom: `1px solid ${colours.blue}`,
                              paddingBottom: '6px'
                            }}>
                              Client Analysis
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {[
                                { label: 'Type', field: 'ClientType', value: selectedOverviewItem?.risk?.ClientType || 'Not specified', editable: true },
                                { label: 'Type Value', field: 'ClientType_Value', value: selectedOverviewItem?.risk?.ClientType_Value ?? 'Not rated', editable: true },
                                { label: 'Introduced', field: 'HowWasClientIntroduced', value: selectedOverviewItem?.risk?.HowWasClientIntroduced || 'Not recorded', editable: true },
                                { label: 'Intro Value', field: 'HowWasClientIntroduced_Value', value: selectedOverviewItem?.risk?.HowWasClientIntroduced_Value ?? 'Not rated', editable: true }
                              ].map((field) => (
                                <div key={field.label} style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '4px 0',
                                  cursor: field.editable ? 'pointer' : 'default',
                                  borderRadius: '4px',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = 'transparent';
                                  }
                                }}
                                onClick={() => {
                                  if (field.editable) {
                                    handleFieldEdit('client', field.field, field.value);
                                  }
                                }}>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                    fontWeight: 500
                                  }}>
                                    {field.label}:
                                  </span>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? colours.dark.text : '#111827',
                                    fontWeight: 600,
                                    textAlign: 'right',
                                    maxWidth: '55%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Funds Analysis */}
                          <div style={{
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '14px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                            boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                          }}>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: colours.blue,
                              marginBottom: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.025em',
                              borderBottom: `1px solid ${colours.blue}`,
                              paddingBottom: '6px'
                            }}>
                              Funds Analysis
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {[
                                { label: 'Source', field: 'SourceOfFunds', value: selectedOverviewItem?.risk?.SourceOfFunds || 'Not specified', editable: true },
                                { label: 'Source Value', field: 'SourceOfFunds_Value', value: selectedOverviewItem?.risk?.SourceOfFunds_Value ?? 'Not rated', editable: true },
                                { label: 'Destination', field: 'DestinationOfFunds', value: selectedOverviewItem?.risk?.DestinationOfFunds || 'Not specified', editable: true },
                                { label: 'Type', field: 'FundsType', value: selectedOverviewItem?.risk?.FundsType || 'Not specified', editable: true },
                                { label: 'Value', field: 'ValueOfInstruction', value: selectedOverviewItem?.risk?.ValueOfInstruction || 'Not specified', editable: true }
                              ].map((field) => (
                                <div key={field.label} style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '4px 0',
                                  cursor: field.editable ? 'pointer' : 'default',
                                  borderRadius: '4px',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = 'transparent';
                                  }
                                }}
                                onClick={() => {
                                  if (field.editable) {
                                    handleFieldEdit('funds', field.field, field.value);
                                  }
                                }}>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                    fontWeight: 500
                                  }}>
                                    {field.label}:
                                  </span>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? colours.dark.text : '#111827',
                                    fontWeight: 600,
                                    textAlign: 'right',
                                    maxWidth: '55%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Compliance Factors */}
                          <div style={{
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '14px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                            boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                          }}>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: colours.blue,
                              marginBottom: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.025em',
                              borderBottom: `1px solid ${colours.blue}`,
                              paddingBottom: '6px'
                            }}>
                              Compliance
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {[
                                { label: 'Client Risk', field: 'ClientRiskFactorsConsidered', value: selectedOverviewItem?.risk?.ClientRiskFactorsConsidered ? 'Yes' : 'No', editable: true },
                                { label: 'Transaction Risk', field: 'TransactionRiskFactorsConsidered', value: selectedOverviewItem?.risk?.TransactionRiskFactorsConsidered ? 'Yes' : 'No', editable: true },
                                { label: 'AML Policy', field: 'FirmWideAMLPolicyConsidered', value: selectedOverviewItem?.risk?.FirmWideAMLPolicyConsidered ? 'Yes' : 'No', editable: true },
                                { label: 'Sanctions', field: 'FirmWideSanctionsRiskConsidered', value: selectedOverviewItem?.risk?.FirmWideSanctionsRiskConsidered ? 'Yes' : 'No', editable: true }
                              ].map((field) => (
                                <div key={field.label} style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '4px 0',
                                  cursor: field.editable ? 'pointer' : 'default',
                                  borderRadius: '4px',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (field.editable) {
                                    e.currentTarget.style.background = 'transparent';
                                  }
                                }}
                                onClick={() => {
                                  if (field.editable) {
                                    handleFieldEdit('compliance', field.field, field.value);
                                  }
                                }}>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                    fontWeight: 500
                                  }}>
                                    {field.label}:
                                  </span>
                                  <span style={{
                                    fontSize: '10px',
                                    color: field.value === 'Yes' ? colours.green : field.value === 'No' ? colours.orange : (isDarkMode ? colours.dark.text : '#111827'),
                                    fontWeight: 600,
                                    textAlign: 'right'
                                  }}>
                                    {field.value}
                                  </span>
                                </div>
                              ))}
                              
                              {/* Limitation Period Section - Modern Styling */}
                              <div style={{ 
                                display: 'flex', 
                                flexDirection: 'column',
                                gap: '8px',
                                marginTop: '8px',
                                padding: '8px 0',
                                borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.1)'}` 
                              }}>
                                <div style={{ fontSize: '9px', color: colours.blue, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  Limitation Period
                                </div>
                                
                                {/* Limitation Date */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                    fontWeight: 500,
                                    minWidth: '40px'
                                  }}>
                                    Date:
                                  </span>
                                  <div style={{ flex: 1, maxWidth: '120px' }}>
                                    <DatePicker
                                      value={selectedOverviewItem?.risk?.LimitationDate || null}
                                      onSelectDate={(date) => {
                                        if (selectedOverviewItem?.risk) {
                                          selectedOverviewItem.risk.LimitationDate = date;
                                          setToast({ message: 'Limitation date updated', type: 'success' });
                                        }
                                      }}
                                      placeholder="Select date"
                                      styles={getDatePickerStyles(isDarkMode)}
                                      allowTextInput={false}
                                      isMonthPickerVisible={false}
                                      showMonthPickerAsOverlay={true}
                                    />
                                  </div>
                                </div>

                                {/* TBC Checkbox */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                    fontWeight: 500,
                                    minWidth: '40px'
                                  }}>
                                    TBC:
                                  </span>
                                  <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center',
                                    cursor: 'pointer',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    transition: 'background 0.15s ease'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                  }}
                                  onClick={() => {
                                    if (selectedOverviewItem?.risk) {
                                      selectedOverviewItem.risk.LimitationTBC = !selectedOverviewItem.risk.LimitationTBC;
                                      setToast({ message: 'TBC status updated', type: 'success' });
                                    }
                                  }}>
                                    <div style={{
                                      width: '14px',
                                      height: '14px',
                                      borderRadius: '3px',
                                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.4)' : 'rgba(15, 23, 42, 0.3)'}`,
                                      background: selectedOverviewItem?.risk?.LimitationTBC 
                                        ? colours.blue 
                                        : (isDarkMode ? 'rgba(15, 23, 42, 0.9)' : '#ffffff'),
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      marginRight: '6px',
                                      transition: 'all 0.2s ease',
                                      boxShadow: selectedOverviewItem?.risk?.LimitationTBC 
                                        ? `0 0 0 2px ${isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)'}`
                                        : 'none'
                                    }}>
                                      {selectedOverviewItem?.risk?.LimitationTBC && (
                                        <span style={{ 
                                          color: 'white', 
                                          fontSize: '10px', 
                                          fontWeight: 'bold',
                                          lineHeight: 1
                                        }}>
                                          ✓
                                        </span>
                                      )}
                                    </div>
                                    <span style={{
                                      fontSize: '10px',
                                      color: isDarkMode ? colours.dark.text : '#111827',
                                      fontWeight: 500
                                    }}>
                                      {selectedOverviewItem?.risk?.LimitationTBC ? 'Yes' : 'No'}
                                    </span>
                                  </div>
                                </div>

                                {/* Limitation Notes */}
                                <div style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '4px 0',
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                }}
                                onClick={() => {
                                  handleFieldEdit('compliance', 'Limitation', selectedOverviewItem?.risk?.Limitation || 'Not specified');
                                }}>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                    fontWeight: 500
                                  }}>
                                    Notes:
                                  </span>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? colours.dark.text : '#111827',
                                    fontWeight: 600,
                                    textAlign: 'right',
                                    maxWidth: '65%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {selectedOverviewItem?.risk?.Limitation || 'Not specified'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* System Information Footer */}
                        <div style={{
                          background: workbenchCardBackground(isDarkMode),
                          borderRadius: '12px',
                          padding: '16px 20px',
                          border: `1px solid ${workbenchBorderColour(isDarkMode)}`,
                          boxShadow: isDarkMode ? '0 6px 16px rgba(2, 6, 23, 0.35)' : '0 6px 16px rgba(15, 23, 42, 0.08)',
                          marginBottom: '20px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '12px', color: workbenchMutedText(isDarkMode), fontWeight: 500 }}>
                              Assessment Status: <span style={{ color: selectedOverviewItem?.risk ? colours.green : colours.orange, fontWeight: 600 }}>{selectedOverviewItem?.risk ? 'Completed' : 'Pending'}</span>
                            </div>
                            <div style={{ fontSize: '11px', color: workbenchMutedText(isDarkMode) }}>
                              Risk Score Increment: <strong>{selectedOverviewItem?.risk?.RiskScoreIncrementBy || 'Not calculated'}</strong>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '10px', color: workbenchMutedText(isDarkMode), marginBottom: '2px' }}>
                              System Information
                            </div>
                            <div style={{ fontSize: '11px', color: isDarkMode ? colours.dark.text : '#374151', fontWeight: 500 }}>
                              User: {currentUser?.Email?.split('@')[0] || userInitials}
                            </div>
                            <div style={{ fontSize: '10px', color: workbenchMutedText(isDarkMode) }}>
                              Ref: {selectedOverviewItem?.risk?.InstructionRef || selectedInstruction?.InstructionRef}
                            </div>
                            <div style={{ fontSize: '10px', color: workbenchMutedText(isDarkMode) }}>
                              {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>

                        {/* OLD Inline Edit Modal - COMMENTED OUT
                        {editingField && (
                          <div 
                            style={{
                              position: 'fixed',
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              background: 'rgba(255, 0, 0, 0.8)', // Red background for debugging
                              zIndex: 9999, // Higher z-index
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }} 
                            onClick={(e) => {
                              console.log('🎯 Modal overlay clicked');
                              if (e.target === e.currentTarget) {
                                setEditingField(null);
                              }
                            }}
                          >
                            {(() => {
                              console.log('🎨 Modal inner content rendering with:', editingField);
                              return (
                                <div style={{
                                  background: isDarkMode ? '#1e293b' : '#ffffff',
                                  borderRadius: '12px',
                              padding: '24px',
                              minWidth: '300px',
                              maxWidth: '400px',
                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                              boxShadow: isDarkMode ? '0 10px 30px rgba(0, 0, 0, 0.5)' : '0 10px 30px rgba(15, 23, 42, 0.15)'
                            }}>
                              <h3 style={{
                                margin: '0 0 16px 0',
                                fontSize: '16px',
                                fontWeight: 600,
                                color: isDarkMode ? colours.dark.text : '#1f2937'
                              }}>
                                Edit {editingField?.field}
                              </h3>
                              <div style={{ marginBottom: '16px' }}>
                                <label style={{
                                  display: 'block',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                  marginBottom: '8px'
                                }}>
                                  Current: {editingField?.currentValue}
                                </label>
                                <select
                                  defaultValue={editingField?.currentValue}
                                  style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '6px',
                                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.15)'}`,
                                    background: isDarkMode ? '#0f172a' : '#ffffff',
                                    color: isDarkMode ? colours.dark.text : '#1f2937',
                                    fontSize: '14px'
                                  }}
                                  onChange={(e) => handleFieldSave(e.target.value)}
                                >
                                  {(editingField?.category === 'risk' 
                                    ? riskFieldOptions[editingField?.field || ''] 
                                    : identityFieldOptions[editingField?.field || '']
                                  )?.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => setEditingField(null)}
                                  style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.15)'}`,
                                    background: 'transparent',
                                    color: isDarkMode ? colours.dark.text : '#6b7280',
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                                </div>
                              );
                            })()}
                          </div>
                        )} END OLD MODAL */}

                        {/* Technical Details - Expandable */}
                        <div style={{
                          background: workbenchCardBackground(isDarkMode),
                          borderRadius: '12px',
                          padding: '12px',
                          border: `1px solid ${workbenchBorderColour(isDarkMode)}`,
                          boxShadow: isDarkMode ? '0 6px 16px rgba(2, 6, 23, 0.35)' : '0 6px 16px rgba(15, 23, 42, 0.08)'
                        }}>
                          <button
                            onClick={() => toggleSection('risk-raw')}
                            style={{
                              width: '100%',
                              background: 'none',
                              border: 'none',
                              color: colours.greyText,
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '4px 0'
                            }}
                          >
                            <span>Technical Details & Raw Risk Assessment Record</span>
                            <div style={{ 
                              transform: expandedSections['risk-raw'] ? 'rotate(180deg)' : 'rotate(0deg)', 
                              transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                              display: 'flex',
                              alignItems: 'center'
                            }}>
                              <MdExpandMore size={14} />
                            </div>
                          </button>
                          
                          {expandedSections['risk-raw'] && (
                            <div style={{ 
                              marginTop: '12px',
                              background: isDarkMode ? '#1a1a1a' : '#ffffff', 
                              border: `1px solid ${isDarkMode ? colours.dark.border : '#e2e8f0'}`, 
                              borderRadius: '6px', 
                              padding: '12px', 
                              fontSize: '10px', 
                              fontFamily: 'Monaco, Consolas, monospace',
                              maxHeight: '250px',
                              overflowY: 'auto',
                              color: isDarkMode ? '#e5e5e5' : '#374151'
                            }}>
                              {selectedOverviewItem?.risk ? (
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {JSON.stringify(selectedOverviewItem.risk, null, 2)}
                                </pre>
                              ) : (
                                <div style={{ color: colours.greyText, fontStyle: 'italic' }}>No risk assessment data available</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {activeWorkbenchTab === 'payment' && (
                      <div>
                        
                        {/* Modern Payment Overview */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                          {/* Payment Status Card */}
                          <div style={{
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '14px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                            boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                          }}>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: colours.blue,
                              marginBottom: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.025em',
                              borderBottom: `1px solid ${colours.blue}`,
                              paddingBottom: '6px'
                            }}>
                              Payment Overview
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {[
                                { 
                                  label: 'Total Transactions', 
                                  value: selectedOverviewItem?.instruction?.payments?.length || 0,
                                  color: isDarkMode ? colours.dark.text : '#111827'
                                },
                                { 
                                  label: 'Total Amount', 
                                  value: `£${selectedOverviewItem?.instruction?.payments?.reduce((sum: number, p: any) => sum + parseFloat(p.amount || 0), 0).toFixed(2) || '0.00'}`,
                                  color: colours.green
                                },
                                { 
                                  label: 'Successful Payments', 
                                  value: selectedOverviewItem?.instruction?.payments?.filter((p: any) => p.payment_status === 'succeeded').length || 0,
                                  color: colours.green
                                },
                                { 
                                  label: 'Deal Value', 
                                  value: selectedOverviewItem?.deal?.Amount ? `£${selectedOverviewItem.deal.Amount}` : 'Not specified',
                                  color: isDarkMode ? colours.dark.text : '#111827'
                                }
                              ].map((item) => (
                                <div key={item.label} style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '4px 0'
                                }}>
                                  <span style={{
                                    fontSize: '10px',
                                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                                    fontWeight: 500
                                  }}>
                                    {item.label}:
                                  </span>
                                  <span style={{
                                    fontSize: '10px',
                                    color: item.color,
                                    fontWeight: 600,
                                    textAlign: 'right'
                                  }}>
                                    {item.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Quick Actions Card */}
                          <div style={{
                            background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
                            borderRadius: '10px',
                            padding: '14px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                            boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                          }}>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: colours.blue,
                              marginBottom: '10px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.025em',
                              borderBottom: `1px solid ${colours.blue}`,
                              paddingBottom: '6px'
                            }}>
                              Payment Actions
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <button
                                onClick={() => setShowPaymentDetails(true)}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  fontSize: '11px',
                                  fontWeight: 500,
                                  border: `1px solid ${colours.blue}`,
                                  borderRadius: '6px',
                                  background: 'transparent',
                                  color: colours.blue,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                }}
                              >
                                View Payment Details
                              </button>
                              <button
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  fontSize: '11px',
                                  fontWeight: 500,
                                  border: `1px solid ${colours.green}`,
                                  borderRadius: '6px',
                                  background: 'transparent',
                                  color: colours.green,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'rgba(34, 197, 94, 0.05)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                }}
                              >
                                Process New Payment
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Payment Transaction Details */}
                        <div style={{ marginBottom: '20px' }}>
                          {selectedOverviewItem?.instruction?.payments?.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                              {selectedOverviewItem?.instruction?.payments?.map((payment: any, index: number) => (
                                <div key={payment.id || index} style={{
                                  background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
                                  borderRadius: '10px',
                                  padding: '16px',
                                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                                  boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                                }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                    {/* Payment Core Details */}
                                    <div>
                                      <h4 style={{ 
                                        margin: '0 0 8px 0', 
                                        fontSize: '12px', 
                                        fontWeight: 600, 
                                        color: colours.blue,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.025em'
                                      }}>
                                        Payment #{index + 1}
                                      </h4>
                                      <div style={{ fontSize: '10px', color: isDarkMode ? colours.dark.text : colours.light.text, lineHeight: '1.6', display: 'grid', gap: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)' }}>Payment ID:</span>
                                          <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{payment.id}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)' }}>Amount:</span>
                                          <span style={{ color: colours.green, fontWeight: 600 }}>£{payment.amount} {payment.currency}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)' }}>Status:</span>
                                          <span style={{ 
                                            color: payment.payment_status === 'succeeded' ? colours.green : 
                                                   payment.payment_status === 'processing' ? colours.orange : colours.red,
                                            fontWeight: 600,
                                            textTransform: 'capitalize'
                                          }}>
                                            {payment.payment_status}
                                          </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)' }}>Internal Status:</span>
                                          <span style={{ 
                                            color: payment.internal_status === 'completed' ? colours.green : colours.orange,
                                            fontWeight: 600,
                                            textTransform: 'capitalize'
                                          }}>
                                            {payment.internal_status}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Service Details */}
                                    <div>
                                      <h4 style={{ 
                                        margin: '0 0 8px 0', 
                                        fontSize: '12px', 
                                        fontWeight: 600, 
                                        color: colours.orange,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.025em'
                                      }}>
                                        Service Information
                                      </h4>
                                      <div style={{ fontSize: '10px', color: isDarkMode ? colours.dark.text : colours.light.text, lineHeight: '1.6', display: 'grid', gap: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)' }}>Instruction:</span>
                                          <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{payment.instruction_ref}</span>
                                        </div>
                                        <div>
                                          <span style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)' }}>Service:</span>
                                          <div style={{ marginTop: '2px', fontWeight: 500, wordBreak: 'break-word' }}>
                                            {payment.service_description || 'Not specified'}
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <span style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)' }}>Area of Work:</span>
                                          <span style={{ fontWeight: 500 }}>{payment.area_of_work || 'Not specified'}</span>
                                        </div>
                                        {payment.receipt_url && (
                                          <div style={{ marginTop: '4px' }}>
                                            <a 
                                              href={payment.receipt_url} 
                                              target="_blank" 
                                              rel="noopener noreferrer" 
                                              style={{ 
                                                color: colours.blue, 
                                                textDecoration: 'none', 
                                                fontSize: '10px',
                                                fontWeight: 500
                                              }}
                                            >
                                              View Receipt ↗
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Timestamps & Security */}
                                    <div>
                                      <h4 style={{ 
                                        margin: '0 0 8px 0', 
                                        fontSize: '12px', 
                                        fontWeight: 600, 
                                        color: colours.green,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.025em'
                                      }}>
                                        Timestamps & Security
                                      </h4>
                                      <div style={{ fontSize: '10px', color: isDarkMode ? colours.dark.text : colours.light.text, lineHeight: '1.6', display: 'grid', gap: '4px' }}>
                                        <div>
                                          <span style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)' }}>Created:</span>
                                          <div style={{ fontWeight: 500, fontFamily: 'monospace' }}>
                                            {new Date(payment.created_at).toLocaleString()}
                                          </div>
                                        </div>
                                        <div>
                                          <span style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)' }}>Updated:</span>
                                          <div style={{ fontWeight: 500, fontFamily: 'monospace' }}>
                                            {new Date(payment.updated_at).toLocaleString()}
                                          </div>
                                        </div>
                                        {payment.client_secret && (
                                          <div>
                                            <span style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)' }}>Client Secret:</span>
                                            <div style={{ 
                                              fontFamily: 'monospace', 
                                              fontSize: '9px', 
                                              color: colours.greyText,
                                              wordBreak: 'break-all'
                                            }}>
                                              {payment.client_secret.substring(0, 20)}...
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Metadata Section - Expandable */}
                                  {payment.metadata && (
                                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}` }}>
                                      <button
                                        onClick={() => toggleSection(`payment-metadata-${index}`)}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: colours.greyText,
                                          fontSize: '11px',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          padding: '2px 0',
                                          fontWeight: 500
                                        }}
                                      >
                                        <span style={{ 
                                          transform: expandedSections[`payment-metadata-${index}`] ? 'rotate(90deg)' : 'rotate(0deg)', 
                                          transition: 'transform 0.2s' 
                                        }}>
                                          ▶
                                        </span>
                                        <span>Transaction Metadata</span>
                                      </button>
                                      
                                      {expandedSections[`payment-metadata-${index}`] && (
                                        <div style={{ 
                                          marginTop: '6px',
                                          background: isDarkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(248, 250, 252, 0.8)', 
                                          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`, 
                                          borderRadius: '6px', 
                                          padding: '8px', 
                                          fontSize: '9px', 
                                          fontFamily: 'Monaco, Consolas, monospace',
                                          color: isDarkMode ? '#e5e5e5' : '#374151',
                                          maxHeight: '100px',
                                          overflowY: 'auto'
                                        }}>
                                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                                            {typeof payment.metadata === 'string' ? payment.metadata : JSON.stringify(payment.metadata, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{
                              padding: '24px',
                              textAlign: 'center',
                              color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)',
                              background: isDarkMode ? 'rgba(15, 23, 42, 0.88)' : '#FFFFFF',
                              borderRadius: '10px',
                              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.06)'}`,
                              boxShadow: isDarkMode ? '0 2px 10px rgba(0, 0, 0, 0.22)' : '0 2px 8px rgba(15, 23, 42, 0.06)'
                            }}>
                              <div style={{ 
                                fontSize: '40px', 
                                marginBottom: '12px',
                                opacity: 0.3
                              }}>
                                💳
                              </div>
                              <h3 style={{ 
                                margin: '0 0 8px 0', 
                                fontSize: '14px', 
                                fontWeight: 600,
                                color: isDarkMode ? colours.dark.text : colours.light.text
                              }}>
                                No Payment Transactions
                              </h3>
                              <p style={{ 
                                margin: 0, 
                                fontSize: '11px',
                                lineHeight: 1.5
                              }}>
                                No payment transactions have been recorded for this instruction yet.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Technical Details - Expandable */}
                        {selectedOverviewItem?.instruction?.payments?.length > 0 && (
                          <div style={{
                            background: workbenchCardBackground(isDarkMode),
                            borderRadius: '12px',
                            padding: '12px',
                            border: `1px solid ${workbenchBorderColour(isDarkMode)}`,
                            boxShadow: isDarkMode ? '0 6px 16px rgba(2, 6, 23, 0.35)' : '0 6px 16px rgba(15, 23, 42, 0.08)'
                          }}>
                            <button
                              onClick={() => toggleSection('payment-raw')}
                              style={{
                                width: '100%',
                                background: 'none',
                                border: 'none',
                                color: colours.greyText,
                                fontSize: '11px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '4px 0'
                              }}
                            >
                              <span>Technical Details & Raw Payment Records ({selectedOverviewItem?.instruction?.payments?.length || 0} Transactions)</span>
                              <div style={{ 
                                transform: expandedSections['payment-raw'] ? 'rotate(180deg)' : 'rotate(0deg)', 
                                transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                display: 'flex',
                                alignItems: 'center'
                              }}>
                                <MdExpandMore size={14} />
                              </div>
                            </button>
                            
                            {expandedSections['payment-raw'] && (
                              <div style={{ 
                                marginTop: '12px',
                                background: isDarkMode ? '#1a1a1a' : '#ffffff', 
                                border: `1px solid ${isDarkMode ? colours.dark.border : '#e2e8f0'}`, 
                                borderRadius: '6px', 
                                padding: '12px', 
                                fontSize: '10px', 
                                fontFamily: 'Monaco, Consolas, monospace',
                                maxHeight: '300px',
                                overflowY: 'auto',
                                color: isDarkMode ? '#e5e5e5' : '#374151'
                              }}>
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {JSON.stringify(selectedOverviewItem?.instruction?.payments || [], null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {activeWorkbenchTab === 'documents' && (
                      <div>
                        
                        <div>
                          <h4 style={{ margin: '0 0 12px 0', fontSize: '12px', fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>Document Library</h4>
                          {selectedOverviewItem?.instruction?.documents && selectedOverviewItem.instruction.documents.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                              {selectedOverviewItem.instruction.documents.map((doc: any, index: number) => (
                                <div
                                  key={index}
                                  style={{
                                    padding: '12px',
                                    border: `1px solid ${isDarkMode ? colours.dark.border : '#e2e8f0'}`,
                                    borderRadius: '6px',
                                    background: isDarkMode ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => {
                                    // Open document preview modal
                                    handleDocumentPreview(doc, selectedInstruction?.InstructionRef || '');
                                  }}
                                >
                                  <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: isDarkMode ? colours.dark.text : colours.light.text }}>
                                    {doc.FileName || doc.filename || doc.DocumentName || `Document ${index + 1}`}
                                  </div>
                                  <div style={{ fontSize: '10px', color: isDarkMode ? colours.dark.subText : '#64748b' }}>
                                    Size: {doc.FileSizeBytes ? formatBytes(doc.FileSizeBytes) : (doc.filesize ? formatBytes(doc.filesize) : 'Unknown')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{
                              padding: '20px',
                              textAlign: 'center',
                              color: isDarkMode ? colours.dark.subText : '#64748b',
                              fontSize: '12px',
                              fontStyle: 'italic'
                            }}>
                              No documents uploaded yet
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {activeWorkbenchTab === 'matter' && (
                      <MatterOperations
                        selectedInstruction={selectedInstruction}
                        selectedOverviewItem={selectedOverviewItem}
                        isDarkMode={isDarkMode}
                        onStatusUpdate={handleStatusUpdate}
                      />
                    )}

                    {activeWorkbenchTab === 'override' && (
                      <div>
                        
                        <OverridePills 
                          instruction={selectedInstruction}
                          isDarkMode={isDarkMode}
                          onStatusUpdate={() => {
                            // Force a refresh of the instruction data
                            // This will trigger a re-render and update the workflow states
                          }}
                        />
                      </div>
                    )}
                  </div>
                    </div>
                )}
              </div>
            </div>
          </>
        )}
      </Stack>

    {/* Dialogs and Modals */}
    {/* Resume Matter Opening dialog removed to streamline flow */}

    <IDVerificationReviewModal
        isVisible={showReviewModal}
        details={reviewModalDetails}
        onClose={() => {
          setShowReviewModal(false);
          setReviewModalDetails(null);
        }}
        onApprove={handleVerificationApproval}
        onRequestDocuments={async (instructionRef: string) => {
          console.log('Documents requested for:', instructionRef);
          // The email sending is handled within the modal
        }}
        onOverride={async (instructionRef: string) => {
          debugLog('Override verification for:', instructionRef);
          
          // Update local data immediately to reflect the override/skip
          setInstructionData(prevData => 
            prevData.map(prospect => ({
              ...prospect,
              instructions: prospect.instructions.map((instruction: any) => {
                if (instruction.InstructionRef === instructionRef) {
                  debugLog('Override/skip ID verification for:', instructionRef);
                  // Mark as completed but skipped
                  return { ...instruction, EIDOverallResult: 'Skipped', stage: 'proof-of-id-complete' };
                }
                return instruction;
              }),
              // Also update the electronicIDChecks/idVerifications arrays
              electronicIDChecks: (prospect.electronicIDChecks || []).map((eid: any) => {
                if ((eid.MatterId || eid.InstructionRef) === instructionRef) {
                  return { ...eid, EIDOverallResult: 'Skipped', EIDStatus: 'skipped' };
                }
                return eid;
              }),
              idVerifications: (prospect.idVerifications || []).map((eid: any) => {
                if ((eid.MatterId || eid.InstructionRef) === instructionRef) {
                  return { ...eid, EIDOverallResult: 'Skipped', EIDStatus: 'skipped' };
                }
                return eid;
              })
            }))
          );
          
          // Also update poidData
          setPoidData(prevPoidData =>
            prevPoidData.map(eid => {
              if ((eid.matter_id || (eid as any).InstructionRef) === instructionRef) {
                return { ...eid, EIDOverallResult: 'Skipped' as any, EIDStatus: 'skipped' as any };
              }
              return eid;
            })
          );
          
          // Close modal and trigger background refresh
          setShowReviewModal(false);
          setReviewModalDetails(null);
          
          // Trigger background data refresh
          setTimeout(() => {
            fetchUnifiedEnquiries();
          }, 1000);
        }}
      />

      {/* Instruction Selector Modal */}
      {showInstructionSelector && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: isDarkMode ? colours.dark.cardBackground : 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h3 style={{
                margin: 0,
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontSize: '18px',
                fontWeight: '600'
              }}>
                Select Instruction for {selectorAction === 'verify' ? 'ID Verification' : 
                                      selectorAction === 'risk' ? 'Risk Assessment' :
                                      selectorAction === 'matter' ? 'Matter Opening' : 'CCL Draft'}
              </h3>
              <button
                onClick={() => {
                  setShowInstructionSelector(false);
                  setSelectorAction(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  padding: '4px'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <Text style={{
                color: isDarkMode ? colours.dark.subText : colours.light.subText,
                fontSize: '14px'
              }}>
                Choose an instruction to perform this action on:
              </Text>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxHeight: '400px',
              overflowY: 'auto'
            }}>
              {filteredOverviewItems.map((item: any) => {
                const instruction = item.instruction;
                if (!instruction) return null;

                return (
                  <button
                    key={instruction.InstructionRef}
                    onClick={async () => {
                      if (selectorAction === 'verify') {
                        await handleSelectorEIDCheck(instruction);
                      }
                      // Add other actions here as needed
                      // Don't close the modal - let user see the result
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      border: `1px solid ${isDarkMode ? colours.dark.border : '#e2e8f0'}`,
                      borderRadius: '8px',
                      background: isDarkMode ? colours.dark.background : 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isDarkMode ? colours.dark.cardHover : '#f8fafc';
                      e.currentTarget.style.borderColor = colours.blue;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isDarkMode ? colours.dark.background : 'white';
                      e.currentTarget.style.borderColor = isDarkMode ? colours.dark.border : '#e2e8f0';
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '700',
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        marginBottom: '4px',
                        letterSpacing: '-0.01em'
                      }}>
                        {instruction.Forename} {instruction.Surname}
                      </div>
                      {instruction.CompanyName && (
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                          marginBottom: '4px',
                          opacity: 0.9
                        }}>
                          {instruction.CompanyName}
                        </div>
                      )}
                      <div style={{
                        fontSize: '13px',
                        color: isDarkMode ? colours.dark.subText : colours.light.subText,
                        fontFamily: 'monospace',
                        fontWeight: '500'
                      }}>
                        {instruction.InstructionRef}
                      </div>
                      {instruction.Email && (
                        <div style={{
                          fontSize: '12px',
                          color: isDarkMode ? colours.dark.subText : colours.light.subText,
                          marginTop: '2px',
                          opacity: 0.8
                        }}>
                          {instruction.Email}
                        </div>
                      )}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: colours.blue,
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      Select
                      <span style={{ fontSize: '16px' }}>→</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Processing indicator */}
            {selectorProcessing && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: isDarkMode ? colours.dark.cardBackground : '#f8fafc',
                border: `1px solid ${colours.blue}`,
                fontSize: '14px',
                color: isDarkMode ? colours.dark.text : colours.light.text,
                textAlign: 'center'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  Processing...
                </div>
                <div>Please wait while we verify the ID</div>
              </div>
            )}

            {/* Result display */}
            {selectorResult && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: selectorResult.success ? '#e8f5e8' : '#f5e8e8',
                border: `1px solid ${selectorResult.success ? '#4CAF50' : '#f44336'}`,
                fontSize: '14px'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  {selectorResult.success ? '✓ Success' : '✗ Error'}
                </div>
                <div>{selectorResult.message}</div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: '8px', 
              marginTop: '16px' 
            }}>
              <button
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  backgroundColor: isDarkMode ? colours.dark.background : 'white',
                  color: isDarkMode ? colours.dark.text : '#333',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => {
                  setShowInstructionSelector(false);
                  setSelectorAction(null);
                  setSelectorProcessing(null);
                  setSelectorResult(null);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = isDarkMode ? colours.dark.cardHover : '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isDarkMode ? colours.dark.background : 'white';
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Risk Assessment Modal */}
      {showRiskPage && selectedInstruction && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2000,
          background: isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: isDarkMode ? colours.dark.background : '#ffffff',
            borderRadius: '12px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: isDarkMode ? '0 20px 60px rgba(0,0,0,0.8)' : '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <RiskAssessmentPage
              onBack={() => setShowRiskPage(false)}
              instructionRef={selectedInstruction.InstructionRef}
              riskAssessor={(localUserData[0] as any)?.FullName || (localUserData[0] as any)?.["Full Name"] || 'Unknown'}
              existingRisk={selectedRisk}
              onSave={handleRiskAssessmentSave}
            />
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      <DocumentPreviewModal
        isOpen={previewModalOpen}
        onDismiss={handleCloseDocumentPreview}
        document={previewDocument}
        instructionRef={selectedInstruction?.InstructionRef || ''}
        isDarkMode={isDarkMode}
      />

      {/* Inline Edit Modal - Moved to end for better z-index handling */}
      {editingField && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)', // Normal semi-transparent background
            zIndex: 99999, // Very high z-index
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }} 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditingField(null);
            }
          }}
        >
          {(() => {
            return (
              <div style={{
                background: isDarkMode ? '#1e293b' : '#ffffff',
                borderRadius: '12px',
                padding: '24px',
                minWidth: '300px',
                maxWidth: '400px',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
              }}>
                <h3 style={{
                  margin: '0 0 16px 0',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: isDarkMode ? colours.dark.text : '#1f2937'
                }}>
                  Edit {editingField?.field}
                </h3>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
                    marginBottom: '8px'
                  }}>
                    Current: {editingField?.currentValue}
                  </label>
                  {(() => {
                    // Get field options based on category and field
                    const fieldOptions = editingField?.category === 'risk' 
                      ? riskFieldOptions[editingField?.field || ''] 
                      : identityFieldOptions[editingField?.field || ''];
                    
                    // Show dropdown if options exist, otherwise show text input
                    if (fieldOptions && fieldOptions.length > 0) {
                      return (
                        <select
                          defaultValue={editingField?.currentValue}
                          style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '6px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.15)'}`,
                            background: isDarkMode ? '#0f172a' : '#ffffff',
                            color: isDarkMode ? colours.dark.text : '#1f2937',
                            fontSize: '14px'
                          }}
                          onChange={(e) => handleFieldSave(e.target.value)}
                        >
                          {fieldOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      );
                    } else {
                      return (
                        <input
                          type="text"
                          defaultValue={editingField?.currentValue}
                          style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '6px',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.15)'}`,
                            background: isDarkMode ? '#0f172a' : '#ffffff',
                            color: isDarkMode ? colours.dark.text : '#1f2937',
                            fontSize: '14px',
                            outline: 'none'
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleFieldSave(e.currentTarget.value);
                            } else if (e.key === 'Escape') {
                              setEditingField(null);
                            }
                          }}
                          onBlur={(e) => handleFieldSave(e.target.value)}
                          autoFocus
                        />
                      );
                    }
                  })()}
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setEditingField(null)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '6px',
                      border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.24)' : 'rgba(15, 23, 42, 0.15)'}`,
                      background: 'transparent',
                      color: isDarkMode ? colours.dark.text : '#6b7280',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </React.Fragment>
  );
};

export default Instructions;